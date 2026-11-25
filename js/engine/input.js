// Input abstraction: on-screen keyboard and microphone produce the same events.
//
//   const input = new InputHub({ audio });
//   input.attachKeyboard(kb);   input.attachMic(mic);
//   input.on('noteon',  ({ midi, source, time }) => …);   source: 'touch' | 'mic' | 'computer-keys'
//   input.on('noteoff', ({ midi, source, time }) => …);
//
// Touch notes are sounded here, before any listener runs (lowest latency). Mic notes are never
// sounded (the real piano already makes the sound; playing it back would feed the mic).

import { Emitter } from './emitter.js';

// Desktop convenience (for the team): the computer keyboard plays C4… like a piano row.
const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76 };

export class InputHub extends Emitter {
  constructor({ audio = null } = {}) {
    super();
    this.audio = audio;
    this.held = new Map(); // midi -> source
    this.enabled = { touch: true, mic: true, 'computer-keys': true };
    this._offs = [];
  }

  noteOn(midi, { source = 'touch', time = performance.now(), ...rest } = {}) {
    if (!this.enabled[source]) return;
    if (source !== 'mic' && this.audio) this.audio.noteOn(midi);
    this.held.set(midi, source);
    this.emit('noteon', { midi, source, time, ...rest });
  }

  noteOff(midi, { source = 'touch', time = performance.now() } = {}) {
    if (source !== 'mic' && this.audio) this.audio.noteOff(midi);
    this.held.delete(midi);
    this.emit('noteoff', { midi, source, time });
  }

  attachKeyboard(kb) {
    this._offs.push(kb.on('noteon', (e) => this.noteOn(e.midi, e)));
    this._offs.push(kb.on('noteoff', (e) => this.noteOff(e.midi, e)));
  }

  attachMic(mic) {
    const a = mic.on('noteon', (e) => this.noteOn(e.midi, { ...e, source: 'mic' }));
    const b = mic.on('noteoff', (e) => this.noteOff(e.midi, { ...e, source: 'mic' }));
    this._offs.push(a, b);
    return () => { a(); b(); };
  }

  /** Computer keyboard (A W S E D F T G Y H U J K = C4…C5). Optional; for desktop testing. */
  attachComputerKeys(target = window, { transpose = () => 0 } = {}) {
    const down = new Set();
    const kd = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const m = KEYMAP[e.key.toLowerCase()];
      if (m == null) return;
      const midi = m + transpose();
      down.add(e.key.toLowerCase());
      this.noteOn(midi, { source: 'computer-keys' });
      this.emit('computerkey', { midi, down: true });
    };
    const ku = (e) => {
      const k = e.key.toLowerCase();
      const m = KEYMAP[k];
      if (m == null || !down.has(k)) return;
      down.delete(k);
      const midi = m + transpose();
      this.noteOff(midi, { source: 'computer-keys' });
      this.emit('computerkey', { midi, down: false });
    };
    target.addEventListener('keydown', kd);
    target.addEventListener('keyup', ku);
    const off = () => { target.removeEventListener('keydown', kd); target.removeEventListener('keyup', ku); };
    this._offs.push(off);
    return off;
  }

  releaseAll() {
    for (const [midi, source] of [...this.held]) this.noteOff(midi, { source });
  }

  detachAll() {
    this.releaseAll();
    this._offs.forEach((f) => f());
    this._offs = [];
  }
}
