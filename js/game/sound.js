// Note Sort sounds (spec 04 §4). Uses the shared PianoAudio engine's AudioContext and master bus,
// so volume and the iOS unlock behave like the rest of the app. Small synth voices only:
//   lift  — the tube's top note, soft marimba-like tone (≈ −12 dB)
//   glug  — one short pitched "bloop" per poured layer
//   bell  — tube completed: the note rings as a bell, 1.5 s
//   tune  — today's tune on the piano samples (audio.playNote)
import { midiToFreq } from '../engine/notes.js';

export function createSfx(audio, { onEvent = () => {} } = {}) {
  const ctx = () => {
    if (!audio) return null;
    if (!audio.ctx) { try { audio.unlock(); } catch { return null; } }
    if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
    return audio.ctx;
  };
  const out = (c) => audio.master || c.destination;

  function tone(midi, { partials, decay, gain, attack = 0.005, sweep = 0, when = 0 }) {
    const c = ctx(); if (!c) return;
    const t = Math.max(c.currentTime, when);
    const f = midiToFreq(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out(c));
    for (const [ratio, amp, pdecay] of partials) {
      const o = c.createOscillator(); o.type = 'sine';
      if (sweep) { o.frequency.setValueAtTime(f * ratio * (1 - sweep), t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.07); }
      else o.frequency.value = f * ratio;
      const pg = c.createGain();
      pg.gain.setValueAtTime(amp, t);
      if (pdecay) pg.gain.exponentialRampToValueAtTime(0.0001, t + pdecay);
      o.connect(pg).connect(g);
      o.start(t); o.stop(t + attack + decay + 0.05);
    }
    audio.outputActiveUntil = Math.max(audio.outputActiveUntil || 0, t + decay);
  }

  return {
    lift(midi) { onEvent('lift', midi); tone(midi + 12, { partials: [[1, 1], [4, 0.25, 0.08], [10, 0.05, 0.03]], decay: 0.5, gain: 0.11 }); },
    glug(midi, when = 0) { onEvent('glug', midi); tone(midi, { partials: [[1, 1], [2, 0.15, 0.06]], decay: 0.16, gain: 0.16, sweep: 0.3, when }); },
    bell(midi) { onEvent('bell', midi); tone(midi + 12, { partials: [[1, 1], [2, 0.45, 0.9], [2.76, 0.3, 0.6], [5.4, 0.15, 0.3]], decay: 1.5, gain: 0.12, attack: 0.004 }); },
    /** Play [[name, midi, beat, beats], …]; calls onNote(midi, index) as each note sounds. Returns { stop, duration }. */
    tune(notes, { bpm = 110, onNote = () => {} } = {}) {
      onEvent('tune', notes.length);
      const c = ctx();
      const sec = 60 / bpm;
      const timers = [];
      const start = c ? c.currentTime + 0.15 : 0;
      notes.forEach(([, midi, beat, beats], i) => {
        if (c) audio.playNote(midi, Math.max(0.2, beats * sec * 0.92), { when: start + beat * sec, velocity: 0.7 });
        timers.push(setTimeout(() => onNote(midi, i), 150 + beat * sec * 1000));
      });
      const last = notes[notes.length - 1];
      const duration = 0.15 + (last ? (last[2] + last[3]) * sec : 0);
      return { duration, stop() { timers.forEach(clearTimeout); } };
    },
  };
}
