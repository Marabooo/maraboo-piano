// Klang audio engine: sampled acoustic piano + synth fallback + soft pad voice.
//
// Samples: Salamander Grand Piano (CC-BY 3.0, see assets/samples/LICENSE.md), one sample every
// minor third (F#2 … F#6); notes in between are pitch-shifted with playbackRate (≤ 1.5 semitones).
//
// Usage:
//   import { audio } from './audio.js';
//   audio.preload();                    // at app start: fetches sample files (no AudioContext yet)
//   audio.installUnlockListeners();     // first tap/click anywhere creates + resumes the AudioContext
//   audio.noteOn(60); audio.noteOff(60);
//   audio.playNote(64, 0.5, { when: audio.now() + 0.2 });
//   audio.padOn(['C3', 'G3']); audio.padOff();
//
// Events (audio.on(type, fn)): 'state' {state}, 'unlocked', 'samples' {loaded,total}, 'samplesready',
// 'samplesfailed' {error}.

import { Emitter } from './emitter.js';
import { midiToFreq, toMidi } from './notes.js';

const SAMPLE_NAMES = ['C4', 'Ds4', 'A3', 'Fs4', 'C5', 'A4', 'Fs3', 'Ds5', 'Ds3', 'C3', 'Fs5', 'A5', 'C6', 'A2', 'Fs2', 'Ds6', 'Fs6'];
const NAME_TO_MIDI = (n) => toMidi(n.replace('s', '#'));

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
};

/** Build a tiny silent WAV as a Blob URL (for the iOS silent-switch workaround). */
function silentWavUrl(seconds = 0.5, rate = 8000) {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 8-bit silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class PianoAudio extends Emitter {
  constructor({ baseUrl } = {}) {
    super();
    this.baseUrl = baseUrl || new URL('../../assets/samples/', import.meta.url).href;
    this.ctx = null;
    this.samples = [];          // [{midi, buffer, offset}]
    this._raw = new Map();      // name -> Promise<ArrayBuffer>
    this._voices = [];          // active voices
    this._pedal = false;
    this._pad = null;
    this.usingFallback = true;  // until samples are decoded
    this.samplesFailed = false;
    this.isIOS = isIOSDevice();
    // The iPhone ring/silent switch mutes Web Audio unless the page's audio session is "playback".
    // silentMitigation tells the UI what we did: 'audioSession' | 'htmlAudio' | 'none'.
    this.silentMitigation = 'none';
    // True when the UI should offer a "Can't hear anything?" hint (iOS: we can't detect the switch).
    this.mightBeSilenced = this.isIOS;
    this.outputActiveUntil = 0; // ctx time until which the app is (probably) making sound
    this.reverbOn = true;
    this.volume = 0.9;
    this.lastNoteOnPerf = 0;
    this._silentEl = null;
  }

  /** Fetch sample files early (no AudioContext needed). Safe to call many times. */
  preload() {
    for (const name of SAMPLE_NAMES) {
      if (this._raw.has(name)) continue;
      const p = fetch(this.baseUrl + name + '.mp3').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${name}`);
        return r.arrayBuffer();
      });
      p.catch(() => {}); // handled in _decodeAll
      this._raw.set(name, p);
    }
  }

  /** Attach listeners so the first user gesture anywhere unlocks audio. Keeps listening to re-resume after interruptions. */
  installUnlockListeners(target = document) {
    if (this._unlockInstalled) return;
    this._unlockInstalled = true;
    // Per the HTML spec, touch *pointerdown* is not a user activation; pointerup/touchend/click are.
    const h = () => this.unlock();
    for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      target.addEventListener(t, h, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'visible') {
        if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
        this._silentEl?.play().catch(() => {});
      } else {
        this._silentEl?.pause();
        this.padOff({ release: 0.05 });
      }
    });
  }

  get state() { return this.ctx ? this.ctx.state : 'none'; }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Create/resume the AudioContext. Call from inside a user-gesture handler. Idempotent. */
  unlock() {
    this._applySilentSwitchMitigation();
    if (!this.ctx) this._createContext();
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => this.emit('state', { state: this.ctx.state })).catch(() => {});
    }
    if (!this._primed) {
      // Playing a 1-sample buffer inside the gesture fully unlocks older iOS versions.
      try {
        const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this._primed = true;
      } catch { /* ignore */ }
    }
    if (!this._decodeStarted) this._decodeAll();
  }

  _applySilentSwitchMitigation() {
    if (this._silentDone) return;
    this._silentDone = true;
    try {
      // Safari 16.4+/17+: Audio Session API. 'playback' = keep playing with the silent switch on.
      if (typeof navigator !== 'undefined' && navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        this.silentMitigation = 'audioSession';
        return;
      }
    } catch { /* fall through */ }
    if (this.isIOS) {
      // Older iOS: a playing <audio> element switches the page's session to "playback".
      // Loop a silent clip while the page is visible (paused when hidden, see visibilitychange).
      try {
        const el = document.createElement('audio');
        el.setAttribute('x-webkit-airplay', 'deny');
        el.setAttribute('playsinline', '');
        el.preload = 'auto';
        el.loop = true;
        el.src = silentWavUrl();
        el.play().then(() => { this.silentMitigation = 'htmlAudio'; }).catch(() => {});
        this._silentEl = el;
      } catch { /* ignore */ }
    }
  }

  _createContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not supported in this browser');
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = new AC(); }
    const ctx = this.ctx;
    ctx.onstatechange = () => this.emit('state', { state: ctx.state });

    // Signal chain: voices → voiceBus ─┬→ master → softClip → destination
    //                                  └→ reverb (convolver) → wet ┘
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = makeSoftClipCurve();
    this.clip.oversample = 'none'; // no added latency
    this.master.connect(this.clip).connect(ctx.destination);

    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.padBus = ctx.createGain();
    this.padBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 1.6, 0.45);
    this.wet = ctx.createGain();
    this.wet.gain.value = this.reverbOn ? 0.16 : 0;
    this.voiceBus.connect(this.reverb);
    this.padBus.connect(this.reverb);
    this.reverb.connect(this.wet).connect(this.master);

    this._pianoWave = makePianoWave(ctx);
    this.emit('state', { state: ctx.state });
  }

  async _decodeAll() {
    this._decodeStarted = true;
    this.preload();
    const ctx = this.ctx;
    let loaded = 0;
    const total = SAMPLE_NAMES.length;
    const results = await Promise.allSettled(SAMPLE_NAMES.map(async (name) => {
      const ab = await this._raw.get(name);
      const buffer = await decode(ctx, ab.slice(0));
      const s = { midi: NAME_TO_MIDI(name), buffer, offset: findOnset(buffer) };
      this.samples.push(s);
      this.samples.sort((a, b) => a.midi - b.midi);
      loaded++;
      this.usingFallback = false;
      this.emit('samples', { loaded, total });
      return s;
    }));
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length === total) {
      this.samplesFailed = true;
      this.usingFallback = true;
      console.warn('[audio] samples failed, using synth fallback', failed[0].reason);
      this.emit('samplesfailed', { error: String(failed[0].reason) });
    } else {
      this.emit('samplesready', { loaded, total });
    }
  }

  /** Decode samples into an arbitrary (e.g. Offline) context — used by the offline pitch test. */
  async loadSamplesInto(ctx) {
    this.preload();
    const out = [];
    for (const name of SAMPLE_NAMES) {
      const ab = await this._raw.get(name);
      const buffer = await decode(ctx, ab.slice(0));
      out.push({ midi: NAME_TO_MIDI(name), buffer, offset: findOnset(buffer) });
    }
    return out.sort((a, b) => a.midi - b.midi);
  }

  _nearestSample(midi) { return nearestSample(this.samples, midi); }

  /** Start a note. Returns the voice. velocity 0..1. when = AudioContext time (0 = now). */
  noteOn(midi, { velocity = 0.85, when = 0 } = {}) {
    midi = toMidi(midi);
    if (!this.ctx) { try { this.unlock(); } catch { return null; } }
    const ctx = this.ctx;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    this.lastNoteOnPerf = performance.now();
    const t0 = Math.max(when || 0, ctx.currentTime);

    // Re-striking a ringing key: damp the old voice quickly (like the hammer hitting a vibrating string).
    for (const v of this._voices) if (v.midi === midi && !v.released) this._release(v, t0, 0.04);
    // Polyphony cap
    const live = this._voices.filter((v) => !v.released);
    if (live.length >= 28) this._release(live[0], t0, 0.02);

    const sample = this._nearestSample(midi);
    const v = sample ? this._sampleVoice(midi, sample, velocity, when, t0) : this._synthVoice(midi, velocity, when, t0);
    this._voices.push(v);
    return v;
  }

  _sampleVoice(midi, sample, velocity, when, t0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = Math.pow(2, (midi - sample.midi) / 12);
    const g = ctx.createGain();
    const peak = velGain(velocity) * 1.25;
    g.gain.setValueAtTime(peak, 0);
    src.connect(g).connect(this.voiceBus);
    src.start(when > 0 ? when : 0, sample.offset);
    const v = { midi, kind: 'sample', src, gain: g, peak, start: t0, released: false };
    src.onended = () => this._cleanup(v);
    return v;
  }

  _synthVoice(midi, velocity, when, t0) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._pianoWave);
    osc.frequency.value = f;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = f * 2.003; // slight inharmonicity, like a real string
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 0.6;
    filt.frequency.setValueAtTime(Math.min(f * 9, 14000), t0);
    filt.frequency.setTargetAtTime(Math.max(f * 2.5, 400), t0 + 0.01, 0.5);
    const g = ctx.createGain();
    const peak = velGain(velocity) * 0.42;
    const tau = Math.min(2.2, Math.max(0.35, 1.3 * Math.sqrt(261.6 / f)));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.setTargetAtTime(peak * 0.35, t0 + 0.004, 0.09);   // quick initial drop (hammer transient)
    g.gain.setTargetAtTime(0, t0 + 0.25, tau);               // long decay
    osc.connect(filt); osc2.connect(g2).connect(filt);
    filt.connect(g).connect(this.voiceBus);
    const start = when > 0 ? when : 0;
    osc.start(start); osc2.start(start);
    const stopAt = t0 + 0.25 + tau * 6;
    osc.stop(stopAt); osc2.stop(stopAt);
    const v = { midi, kind: 'synth', src: osc, src2: osc2, gain: g, peak, start: t0, released: false };
    osc.onended = () => this._cleanup(v);
    return v;
  }

  /** Release a note (respects the sustain pedal). */
  noteOff(midi, { when = 0 } = {}) {
    midi = toMidi(midi);
    if (!this.ctx) return;
    const t = Math.max(when || 0, this.ctx.currentTime);
    for (const v of this._voices) {
      if (v.midi !== midi || v.released || v.keyUp) continue;
      if (this._pedal) { v.keyUp = true; continue; }
      this._release(v, t);
    }
  }

  _release(v, t, tau = 0.1) {
    if (v.released) return;
    v.released = true;
    const g = v.gain.gain;
    try {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else { g.cancelScheduledValues(t); if (v.kind === 'sample') g.setValueAtTime(v.peak, t); }
      g.setTargetAtTime(0, t, tau);
      const end = t + tau * 8;
      v.src.stop(end); v.src2?.stop(end);
    } catch { /* source may already be stopped */ }
    this.outputActiveUntil = Math.max(this.outputActiveUntil, t + tau * 4);
  }

  _cleanup(v) {
    try { v.gain.disconnect(); } catch { /* */ }
    const i = this._voices.indexOf(v);
    if (i >= 0) this._voices.splice(i, 1);
  }

  /** Sustain pedal: while down, noteOff is deferred. Lifting releases keys that are already up. */
  setPedal(down) {
    this._pedal = !!down;
    if (!down && this.ctx) {
      const t = this.ctx.currentTime;
      for (const v of this._voices) if (v.keyUp && !v.released) this._release(v, t, 0.15);
    }
  }

  /** Play a note for a duration (seconds). Used by demos. Returns a handle with stop(). */
  playNote(midi, duration = 0.5, { when = 0, velocity = 0.8 } = {}) {
    if (!this.ctx) this.unlock();
    const t = Math.max(when || 0, this.ctx.currentTime);
    const v = this.noteOn(midi, { velocity, when: t });
    if (!v) return { stop() {} };
    v.demo = true;
    const off = t + duration;
    // schedule the release without pedal semantics
    const g = v.gain.gain;
    try {
      if (v.kind === 'sample') { g.setValueAtTime(v.peak, off); }
      g.setTargetAtTime(0, off, 0.1);
      v.src.stop(off + 1); v.src2?.stop(off + 1);
      v.released = true; // owned by the schedule now
    } catch { /* */ }
    this.outputActiveUntil = Math.max(this.outputActiveUntil, off + 0.4);
    return { voice: v, stop: () => { try { g.cancelScheduledValues(0); g.setTargetAtTime(0, this.ctx.currentTime, 0.03); v.src.stop(this.ctx.currentTime + 0.3); } catch { /* */ } } };
  }

  /** Start (or change) the soft sustained pad. notes: array of names/MIDI. */
  padOn(notes, { gain = 0.07, attack = 0.7 } = {}) {
    if (!this.ctx) return;
    const midis = notes.map(toMidi).sort((a, b) => a - b);
    if (this._pad && this._pad.key === midis.join(',') && !this._pad.stopping) return;
    this.padOff({ release: 0.6 });
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(gain, t + attack);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 0.4;
    filt.connect(out).connect(this.padBus);
    // slow, subtle movement so it feels alive, not like a test tone
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filt.frequency); lfo.start(t);
    const oscs = [lfo];
    for (const m of midis) {
      const f = midiToFreq(m);
      const a = ctx.createOscillator(); a.type = 'triangle'; a.frequency.value = f;
      const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 7;
      const bg = ctx.createGain(); bg.gain.value = 0.22;
      const ag = ctx.createGain(); ag.gain.value = 1 / midis.length;
      a.connect(ag); b.connect(bg).connect(ag); ag.connect(filt);
      a.start(t); b.start(t);
      oscs.push(a, b);
    }
    this._pad = { key: midis.join(','), out, oscs, stopping: false };
  }

  padOff({ release = 0.8 } = {}) {
    const p = this._pad;
    if (!p || !this.ctx) return;
    this._pad = null;
    p.stopping = true;
    const t = this.ctx.currentTime;
    const g = p.out.gain;
    try {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.setTargetAtTime(0, t, release / 4);
      for (const o of p.oscs) o.stop(t + release * 2);
    } catch { /* */ }
    setTimeout(() => { try { p.out.disconnect(); } catch { /* */ } }, release * 2000 + 200);
    this.outputActiveUntil = Math.max(this.outputActiveUntil, t + release);
  }

  get padActive() { return !!this._pad; }

  /** Stop everything immediately (leaving a screen). */
  allOff() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._pedal = false;
    for (const v of [...this._voices]) {
      try { v.gain.gain.cancelScheduledValues(0); v.gain.gain.setTargetAtTime(0, t, 0.03); v.src.stop(t + 0.3); v.src2?.stop(t + 0.3); } catch { /* */ }
      v.released = true;
    }
    this.padOff({ release: 0.1 });
  }

  /** Is the app itself making sound right now (or within `margin` s)? The mic listener ignores input meanwhile. */
  isOutputActive(margin = 0.15) {
    if (!this.ctx) return false;
    if (this._pad) return true;
    const live = this._voices.some((v) => !v.released);
    if (live) return true;
    return this.ctx.currentTime < this.outputActiveUntil + margin;
  }

  setReverb(on) {
    this.reverbOn = !!on;
    if (this.wet) this.wet.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.05);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** Reported output latency in seconds (what the browser tells us; real devices may add more). */
  latency() {
    if (!this.ctx) return null;
    const base = this.ctx.baseLatency || 0;
    const output = this.ctx.outputLatency || 0;
    return { base, output, total: base + output, sampleRate: this.ctx.sampleRate };
  }
}

/** Closest sample to a MIDI note (ties: the sample below, shifted up — sounds brighter/cleaner). */
export function nearestSample(samples, midi) {
  let best = null, bd = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.midi - midi) + (s.midi > midi ? 0.01 : 0);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function velGain(v) { const x = Math.max(0.05, Math.min(1, v)); return 0.2 + 0.8 * x * x; }

function decode(ctx, ab) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(ab, resolve, reject); // callback form works on old Safari
    if (p && p.then) p.then(resolve, reject);
  });
}

/** Seconds to skip at the start of a decoded sample (encoder padding / pre-hammer silence). */
function findOnset(buffer) {
  const d = buffer.getChannelData(0);
  const n = Math.min(d.length, Math.floor(buffer.sampleRate * 0.4));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = peak * 0.02;
  let i = 0;
  while (i < n && Math.abs(d[i]) < thr) i++;
  return Math.max(0, i - Math.floor(buffer.sampleRate * 0.0015)) / buffer.sampleRate;
}

function makeSoftClipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // linear up to |0.7|, then smooth knee into tanh
    const ax = Math.abs(x);
    c[i] = ax < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3));
  }
  return c;
}

function makeImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pre = Math.floor(rate * 0.012);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // darker noise
      d[i] = lp * Math.exp(-t / decay) * 0.6;
    }
  }
  return buf;
}

function makePianoWave(ctx) {
  const amps = [0, 1, 0.42, 0.26, 0.16, 0.1, 0.065, 0.04, 0.026, 0.016, 0.01];
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Shared singleton used by the app. */
export const audio = new PianoAudio();
