// Microphone listening (beta): monophonic pitch detection for "I have a piano" mode.
//
//   yin(frame, sampleRate)             → { freq, clarity, rms }      (pure function, testable offline)
//   new PitchTracker({ sampleRate })    → .process(frame, timeMs) emits 'noteon'/'noteoff' {midi, cents, clarity}
//   new MicListener()                   → await .start(audioContext); emits 'noteon'/'noteoff'/'level'/'error'
//
// Pipeline per frame (≈ every animation frame, 2048-sample window):
//   1. RMS noise gate (adaptive: max(absolute floor, 2.5 × running noise floor))
//   2. YIN pitch (on a 2× decimated signal when sampleRate ≥ 32 kHz — piano fundamentals C2–C7 stay < 2.2 kHz)
//   3. Stability: the same MIDI note in `stableFrames` consecutive frames
//   4. Onset: an RMS jump re-arms the tracker so a repeated same note fires a new noteon.
// Only one note at a time. Chords are not detected (documented limitation).

import { Emitter } from './emitter.js';

/** YIN pitch estimate (de Cheveigné & Kawahara 2002). frame: Float32Array. */
export function yin(frame, sampleRate, { minFreq = 60, maxFreq = 2200, threshold = 0.12, decimate = 'auto' } = {}) {
  let x = frame, sr = sampleRate;
  const dec = decimate === 'auto' ? (sampleRate >= 32000 ? 2 : 1) : decimate;
  if (dec === 2) {
    const n = frame.length >> 1;
    x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * (frame[2 * i] + frame[2 * i + 1]);
    sr = sampleRate / 2;
  }
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / x.length);
  const W = x.length >> 1;
  const tauMin = Math.max(2, Math.floor(sr / maxFreq));
  const tauMax = Math.min(W - 1, Math.ceil(sr / minFreq));
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) { const diff = x[j] - x[j + tau]; s += diff * diff; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const cmnd = new Float32Array(tauMax + 2);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) {
    // no dip under the threshold: take the global minimum, flagged by its (lower) clarity
    let best = 1, bt = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) if (cmnd[tau] < best) { best = cmnd[tau]; bt = tau; }
    tauEst = bt;
  }
  if (tauEst < 1) return { freq: 0, clarity: 0, rms };
  // parabolic interpolation
  let better = tauEst;
  if (tauEst > 1 && tauEst < tauMax + 1) {
    const s0 = cmnd[tauEst - 1], s1 = cmnd[tauEst], s2 = cmnd[tauEst + 1];
    const den = 2 * (2 * s1 - s2 - s0);
    if (den !== 0) better = tauEst + (s2 - s0) / den;
  }
  return { freq: sr / better, clarity: Math.max(0, 1 - cmnd[tauEst]), rms };
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

export class PitchTracker extends Emitter {
  constructor(opts = {}) {
    super();
    this.o = {
      sampleRate: 48000,
      minMidi: 36, maxMidi: 96,  // C2 … C7
      stableFrames: 3,
      minClarity: 0.82,
      gateRms: 0.004,            // absolute floor (≈ −48 dBFS)
      maxGateRms: 0.05,          // the adaptive gate never goes above this
      noiseFactor: 2.5,          // gate = max(gateRms, noiseFloor × noiseFactor)
      onsetRatio: 1.7,           // rms jump vs. recent minimum that counts as a new strike
      onsetMinGapMs: 110,
      releaseFrames: 5,          // frames under the gate before noteoff
      maxCentsOff: 45,           // reject frames this far from a semitone (mistuned/noisy)
      ...opts,
    };
    this.reset();
  }

  reset() {
    this.active = null;   // { midi, since }
    this.cand = null;     // { midi, count }
    this.armed = true;
    this.silent = 0;
    this.noise = this.o.gateRms;
    this.rmsHist = [];
    this.lastOnset = -1e9;
    this.lastOff = null;
    this.lastRms = 0;
  }

  /** Feed one analysis frame. timeMs = when the frame ended. Returns detected events (also emitted). */
  process(frame, timeMs = performance.now()) {
    const o = this.o;
    const out = [];
    const est = yin(frame, o.sampleRate, { minFreq: 55, maxFreq: 2300 });
    const rms = est.rms;
    this.lastRms = rms;

    // adaptive noise floor, learned only while nothing is sounding (otherwise the music itself
    // would slowly raise the gate): falls quickly, rises slowly, capped.
    if (!this.active && timeMs - this.lastOnset > 300) {
      this.noise = rms < this.noise ? this.noise * 0.7 + rms * 0.3 : this.noise * 0.98 + rms * 0.02;
    }
    const openGate = Math.max(o.gateRms, Math.min(o.maxGateRms, this.noise * o.noiseFactor));
    const gate = this.active ? openGate * 0.7 : openGate; // hysteresis: easier to stay on than to turn on

    // onset: jump vs. the minimum of the last few frames
    const recentMin = this.rmsHist.length ? Math.min(...this.rmsHist) : 0;
    this.rmsHist.push(rms);
    if (this.rmsHist.length > 4) this.rmsHist.shift();
    if (rms > openGate * 1.5 && rms > recentMin * o.onsetRatio && timeMs - this.lastOnset > o.onsetMinGapMs) {
      this.lastOnset = timeMs;
      this.armed = true;
      this.cand = null;
      out.push({ type: 'onset', rms, time: timeMs });
    }

    if (rms < gate) {
      this.silent++;
      this.cand = null;
      if (this.active && this.silent >= o.releaseFrames) out.push(this._off(timeMs));
      return this._flush(out);
    }
    this.silent = 0;

    if (est.clarity < o.minClarity || !est.freq) return this._flush(out);
    const mf = freqToMidi(est.freq);
    const midi = Math.round(mf);
    const cents = Math.round((mf - midi) * 100);
    if (midi < o.minMidi || midi > o.maxMidi || Math.abs(cents) > o.maxCentsOff) return this._flush(out);

    if (this.cand && this.cand.midi === midi) this.cand.count++;
    else this.cand = { midi, count: 1, cents, clarity: est.clarity };

    if (this.cand.count >= o.stableFrames) {
      const c = this.cand;
      if (!this.active) {
        // the decaying tail of the note we just ended must not re-trigger it without a new strike
        const tail = this.lastOff && this.lastOff.midi === c.midi && timeMs - this.lastOff.time < 1500;
        if (!tail || this.armed) out.push(this._on(c.midi, cents, est.clarity, timeMs));
      } else if (this.active.midi !== c.midi) {
        // Every new piano note is a new strike, so a change without an onset is suspicious:
        // octave flips in a decaying tail are detector errors; other changes need twice the evidence.
        const octave = Math.abs(this.active.midi - c.midi) % 12 === 0;
        if (this.armed || (!octave && c.count >= o.stableFrames * 2)) {
          out.push(this._off(timeMs));
          out.push(this._on(c.midi, cents, est.clarity, timeMs));
        }
      } else if (this.armed) {
        out.push(this._off(timeMs));
        out.push(this._on(c.midi, cents, est.clarity, timeMs));
      }
    }
    return this._flush(out);
  }

  _on(midi, cents, clarity, time) {
    this.active = { midi, since: time };
    this.armed = false;
    return { type: 'noteon', midi, cents, clarity, time };
  }

  _off(time) {
    const midi = this.active.midi;
    this.active = null;
    this.lastOff = { midi, time };
    return { type: 'noteoff', midi, time };
  }

  _flush(out) {
    for (const e of out) this.emit(e.type, e);
    return out;
  }
}

/** Why the microphone can't be used here, or null if it probably can. */
export function micSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure'; // needs HTTPS or localhost
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
  return null;
}

export const MIC_MESSAGES = {
  insecure: 'Listening needs a secure (https) link. Use the on-screen keys for now.',
  unsupported: 'This browser can’t use the microphone. Use the on-screen keys instead.',
  denied: 'Microphone access is off. You can allow it in your browser settings, or use the on-screen keys.',
  nodevice: 'No microphone found. Use the on-screen keys instead.',
  busy: 'The microphone is busy in another app. Close it and try again, or use the on-screen keys.',
  error: 'Listening didn’t start. Use the on-screen keys, or try again.',
};

export class MicListener extends Emitter {
  constructor(opts = {}) {
    super();
    this.opts = { fftSize: 2048, ...opts };
    this.running = false;
    this.level = 0;
    this.suppress = () => false; // set by the app: ignore notes while the app itself is sounding
  }

  /** Ask for the mic and start listening. Throws { code } with a key of MIC_MESSAGES. */
  async start(audioCtx) {
    const why = micSupport();
    if (why) throw Object.assign(new Error(why), { code: why });
    let stream;
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* */ }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* */ }
      const n = e && e.name;
      const code = n === 'NotAllowedError' || n === 'SecurityError' ? 'denied'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'nodevice'
        : n === 'NotReadableError' || n === 'AbortError' ? 'busy' : 'error';
      throw Object.assign(new Error(code), { code, cause: e });
    }
    this.stream = stream;
    this.ctx = audioCtx;
    if (audioCtx.state !== 'running') await audioCtx.resume().catch(() => {});
    this.source = audioCtx.createMediaStreamSource(stream);
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = this.opts.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.sink = audioCtx.createGain();
    this.sink.gain.value = 0; // keep the graph pulled on every browser without making sound
    this.source.connect(this.analyser);
    this.analyser.connect(this.sink).connect(audioCtx.destination);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.tracker = new PitchTracker({ sampleRate: audioCtx.sampleRate });
    this.tracker.on('noteon', (e) => { if (!this.suppress()) this.emit('noteon', { ...e, source: 'mic' }); else this._suppressed = e.midi; });
    this.tracker.on('noteoff', (e) => {
      if (this._suppressed === e.midi) { this._suppressed = null; return; }
      this.emit('noteoff', { ...e, source: 'mic' });
    });
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      this.tracker.process(this.buf, performance.now());
      this.level = this.tracker.lastRms;
      this.emit('level', { rms: this.level });
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    // a track can end (e.g. another app takes the mic, or permission revoked)
    stream.getAudioTracks().forEach((t) => { t.onended = () => { this.stop(); this.emit('error', { code: 'busy' }); }; });
    this.emit('start', {});
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    try { this.source?.disconnect(); this.analyser?.disconnect(); this.sink?.disconnect(); } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* */ }
    this.emit('stop', {});
  }
}
