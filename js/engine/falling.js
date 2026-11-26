// Falling notes lane (canvas) drawn above the on-screen keyboard. Time model: design/01 §4.
//
//   const fall = new FallingNotes(canvasEl, keyboard, { waitMode: 'soft' });
//   fall.load({ tempo: 80, notes: [{ midi: 60, beat: 0, dur: 1 }, …], app: [{ beat, dur, type: 'pad'|'note', midis }] });
//   fall.start();   input → fall.noteOn(midi) / fall.noteOff(midi)
//   events: 'pending' 'approach' 'waitstart' 'waitend' 'hit' 'wrong' 'partial' 'early' 'missed'
//           'app' (pad/melody events to sound) 'autonote' (demo) 'holdtip' 'earlyrelease' 'end'
//
// Wait modes:
//   strict – the block stops exactly on the hit line until the right note(s) are pressed (01 §4.5 A).
//   soft   – (default, 01 §4.5 B) after the due beat the clock eases 1→0 over 0.7 beat, so the block
//            sinks 0.35 beat into its key; on-time players never notice. After the correct note:
//            waited < 0.6 s → back to speed in 100 ms; otherwise ease 0.35→1 over one beat.
//   flow   – never waits (comparison only).
// Follow the learner (01 §4.3): the expected event is accepted as soon as its block is in the lane.
//   Early > 0.25 beat with follow 'jump' → the clock tweens to the event's beat in 150 ms.
// Chords (01 §4.2): accepted when every note is held now or was pressed within chordWindowMs (1.2 s).
// Holds (01 §4.6): never judged. Early release → the rest of the block becomes a ghost; one 'holdtip'.

import { Emitter } from './emitter.js';
import { describe, labelFor, toMidi, pitchClass } from './notes.js';

const DEFAULTS = {
  waitMode: 'soft',
  tempo: 80,
  speed: 1,               // 0.75 = "Slower"
  follow: 'jump',         // 'jump' | 'steady'
  softEaseBeats: 0.7,     // real time (in beats) of the 1→0 ease
  chordWindowMs: 1200,
  earlyRelease: 'forgive',// 'forgive' (spec) | 'hold' (kept for team comparison: song waits for re-press)
  labels: 'letters',
  autoplay: false,        // demo mode
  tailBeats: 1,
  matchPitchClass: false, // mic mode: any octave counts
};

/** Parse a compact phrase string: 'E4 D4 C4/2 r/1 [C4 E4 G4]/2'. '/n' = beats (default 1), 'r' = rest. */
export function parseSeq(seq) {
  const notes = [];
  let beat = 0;
  const tokens = seq.replace(/\|/g, ' ').match(/\[[^\]]+\](\/[\d.]+)?|\S+/g) || [];
  for (const tok of tokens) {
    const [body, durStr] = tok.split(/\/(?=[\d.]+$)/);
    const dur = durStr ? parseFloat(durStr) : 1;
    if (body === 'r' || body === 'R') { beat += dur; continue; }
    const names = body.startsWith('[') ? body.slice(1, -1).trim().split(/\s+/) : [body];
    for (const n of names) notes.push({ midi: toMidi(n), beat, dur });
    beat += dur;
  }
  return notes;
}

export class FallingNotes extends Emitter {
  constructor(canvas, keyboard, opts = {}) {
    super();
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.kb = keyboard;
    this.opts = { ...DEFAULTS, ...opts };
    this.groups = [];
    this.app = [];
    this._pops = [];
    this.forced = new Set();
    this.pos = 0;
    this.speedNow = 1;
    this.running = false;
    this.down = new Map();
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
    this._offKb = keyboard.on('layout', () => { this._kbOffset = null; if (!this.running) this.draw(); });
    this._resize();
  }

  destroy() { this.stop(); this._ro.disconnect(); this._offKb?.(); }

  /** Pixels per beat and beats visible (01 §3.2: pxPerBeat = clamp(40, lane/3.25, 90)). */
  get ppb() { return Math.max(40, Math.min(90, (this.H || 200) / 3.25)); }
  get visibleBeats() { return (this.H || 200) / this.ppb; }
  get bps() { return (this.opts.tempo / 60) * this.opts.speed; }

  load(phrase) {
    const o = this.opts;
    this.phrase = phrase;
    if (phrase.tempo) o.tempo = phrase.tempo;
    const raw = phrase.notes || parseSeq(phrase.seq || '');
    const notes = raw.map((n, i) => ({
      id: i, midi: toMidi(n.midi ?? n.note), beat: n.beat, dur: n.dur ?? 1, end: n.beat + (n.dur ?? 1),
      state: 'upcoming', hitAt: 0, held: false, released: false,
    })).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    this.groups = [];
    for (const n of notes) {
      const g = this.groups[this.groups.length - 1];
      if (g && Math.abs(g.beat - n.beat) < 0.01) g.notes.push(n);
      else this.groups.push({ beat: n.beat, notes: [n], state: 'pending', presses: new Map(), waitedFrom: 0, approached: false });
    }
    this.groups.forEach((g, i) => {
      g.index = i; g.midis = g.notes.map((n) => n.midi);
      // v2 (student request): every block of a chord takes the colour of the chord's root, in any order/inversion
      if (g.notes.length >= 3) { const col = describe(chordRoot(g.midis)).color; g.notes.forEach((n) => { n.color = col; }); }
    });
    this.app = (phrase.app || []).map((e) => ({ ...e, fired: false, ended: false })).sort((a, b) => a.beat - b.beat);
    this.lastEnd = Math.max(0, ...notes.map((n) => n.end), ...this.app.map((e) => e.beat + (e.dur || 0)));
    this.next = 0;
    this.waiting = false;
    this.pos = -(phrase.leadInBeats ?? this.visibleBeats);
    this.speedNow = 1;
    this._ramp = null;
    this._jump = null;
    this.ended = false;
    this._holdTipShown = false;
    this.stats = { hits: 0, wrong: 0, waits: 0, waitedMs: 0, missed: 0, startedAt: 0 };
    this._scheduled = new Set();
    this._pops = [];
    this._emitPending();
    this.draw();
  }

  setWaitMode(m) { this.opts.waitMode = m; if (m === 'flow') this._endWait(); }
  setLabels(m) { this.opts.labels = m; if (!this.running) this.draw(); }
  setSpeed(s) { this.opts.speed = s; }
  /** Show names on these notes' blocks even when labels are off (hints). */
  setForcedLabels(midis = []) { this.forced = new Set(midis); }
  setOption(k, v) { this.opts[k] = v; }

  start() {
    if (this.running || this.ended) return;
    this.running = true;
    if (!this.stats.startedAt) this.stats.startedAt = performance.now();
    this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._advance(dt, now);
      this.draw(now);
      if (this.running) this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  pause() { this.running = false; cancelAnimationFrame(this._raf); this.draw(); }
  /** Resume after a pause: soft eases back in over 0.5 beat (01 §4.4 PAUSED). */
  resume() {
    if (this.ended) return;
    if (this.opts.waitMode === 'soft' && !this.waiting) this._ramp = { t0: performance.now(), from: 0, ms: 500 / this.bps };
    this.start();
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  progress() { return { pos: this.pos, next: this.next, total: this.groups.length, waiting: this.waiting }; }
  pendingNotes() { const g = this.groups[this.next]; return g ? g.midis.slice() : []; }
  pendingGroup() { return this.groups[this.next] || null; }

  _emitPending() {
    const g = this.groups[this.next];
    this.emit('pending', { index: this.next, midis: g ? g.midis.slice() : [], beat: g?.beat, chord: g ? g.notes.length > 1 : false });
  }

  _advance(dt, now) {
    const o = this.opts;
    if (this.ended) return;
    const mode = o.autoplay ? 'flow' : o.waitMode;
    const g = this.groups[this.next];
    const pending = g && g.state === 'pending';

    // follow the learner: quick tween to the accepted early note
    if (this._jump) {
      const k = Math.min(1, (now - this._jump.t0) / 150);
      this.pos = this._jump.from + (this._jump.to - this._jump.from) * (k * (2 - k));
      if (k >= 1) this._jump = null;
      this._fireApp(now);
      return;
    }

    let v = 1;
    let maxPos = Infinity;
    if (pending && mode === 'strict') maxPos = g.beat;
    if (pending && mode === 'soft') {
      // linear ease 1→0 over softEaseBeats of real time ⇔ v = sqrt(remaining / grace)
      const grace = o.softEaseBeats / 2;
      maxPos = g.beat + grace;
      if (this.pos > g.beat) v = Math.sqrt(Math.max(0, Math.min(1, (maxPos - this.pos) / grace)));
    }
    if (this._ramp) {
      const k = Math.min(1, (now - this._ramp.t0) / this._ramp.ms);
      v = Math.min(v, this._ramp.from + (1 - this._ramp.from) * k);
      if (k >= 1) this._ramp = null;
    }
    this.speedNow = v;
    let np = this.pos + v * this.bps * dt;
    if (np >= maxPos) np = Math.max(this.pos, maxPos);
    this.pos = np;

    if (pending && !g.approached && g.beat - this.pos <= 1) {
      g.approached = true;
      this.emit('approach', { index: g.index, midis: g.midis.slice() });
    }
    if (pending && mode !== 'flow' && this.pos >= g.beat - 1e-6 && !this.waiting) {
      this.waiting = true;
      g.waitedFrom = now;
      this.stats.waits++;
      this.emit('waitstart', { index: g.index, midis: g.midis.slice(), mode });
    }

    if (mode === 'flow') {
      if (o.autoplay) {
        for (let i = this.next; i < this.groups.length; i++) {
          const gg = this.groups[i];
          if (gg.beat - this.pos > 0.12 * this.bps + 0.01) break;
          if (!this._scheduled.has(i)) {
            this._scheduled.add(i);
            this.emit('autonote', { index: i, midis: gg.midis.slice(), delay: Math.max(0, (gg.beat - this.pos) / this.bps), durs: gg.notes.map((n) => n.dur / this.bps) });
          }
        }
        const cur = this.groups[this.next];
        if (cur && this.pos >= cur.beat) this._satisfy(cur, now, true);
      } else if (pending && this.pos > g.beat + 0.5) {
        g.state = 'missed';
        g.notes.forEach((n) => { n.state = 'missed'; });
        this.stats.missed++;
        this.emit('missed', { index: g.index, midis: g.midis.slice() });
        this.next++;
        this._emitPending();
      }
    }

    this._fireApp(now);

    if (this.next >= this.groups.length && this.pos >= this.lastEnd + o.tailBeats) {
      this.ended = true;
      this.running = false;
      this.emit('end', { ...this.stats, durationMs: performance.now() - this.stats.startedAt });
    }
  }

  _fireApp() {
    for (const e of this.app) {
      if (!e.fired && this.pos >= e.beat) { e.fired = true; this.emit('app', { ...e, phase: 'start', durSec: (e.dur || 1) / this.bps }); }
      if (e.fired && !e.ended && e.dur && this.pos >= e.beat + e.dur) { e.ended = true; this.emit('app', { ...e, phase: 'end' }); }
    }
  }

  // ---------- input ----------
  noteOn(midi, time = performance.now()) {
    midi = toMidi(midi);
    this.down.set(midi, time);
    if (this.ended || this.opts.autoplay) return { matched: false };
    const o = this.opts;
    const g = this.groups[this.next];
    if (!g || g.state !== 'pending') return { matched: false };
    // v2: a chord counts in any octave / inversion (G B D = B D G = D G B); single notes stay exact
    const same = (a, b) => (o.matchPitchClass || g.notes.length > 1 ? pitchClass(a) === pitchClass(b) : a === b);
    const visible = g.beat - this.pos <= this.visibleBeats;
    const member = g.midis.find((m) => same(m, midi));
    if (!visible || member == null) {
      if (visible) {
        this.stats.wrong++;
        const nb = this.groups[this.next + 1];
        this.emit('wrong', {
          midi, expected: g.midis.slice(), pos: this.pos, chord: g.notes.length > 1,
          octave: g.midis.some((m) => m !== midi && pitchClass(m) === pitchClass(midi)),
          nextButOne: !!nb && nb.midis.includes(midi) && !g.midis.includes(midi),
        });
      } else this.emit('early', { midi });
      return { matched: false };
    }
    g.presses.set(member, time);
    const ok = g.notes.every((n) => {
      const t = g.presses.get(n.midi);
      return t != null && (this.down.has(n.midi) || [...this.down.keys()].some((d) => same(d, n.midi)) || time - t <= o.chordWindowMs);
    });
    if (ok) this._satisfy(g, time, false);
    else this.emit('partial', { index: g.index, midi, need: g.midis.filter((m) => !g.presses.has(m)) });
    return { matched: true, complete: ok };
  }

  noteOff(midi, time = performance.now()) {
    midi = toMidi(midi);
    this.down.delete(midi);
    if (this.ended || this.opts.autoplay) return;
    for (const g of this.groups) {
      if (g.beat > this.pos + 0.01) break;
      for (const n of g.notes) {
        if (n.midi !== midi || n.state !== 'hit' || !n.held) continue;
        n.held = false;
        if (this.pos < n.end - 0.25) {
          n.released = true; // ghost
          this.emit('earlyrelease', { midi, index: g.index, remainingBeats: n.end - this.pos });
          if (!this._holdTipShown && n.dur >= 2 && this.pos < n.beat + n.dur / 2) {
            this._holdTipShown = true;
            this.emit('holdtip', { midi });
          }
        }
      }
    }
  }

  /** Accept the pending event without a key (hint ladder "Skip note"). */
  skipPending() {
    const g = this.groups[this.next];
    if (g && g.state === 'pending') this._satisfy(g, performance.now(), false, true);
  }

  _satisfy(g, time, auto, skipped = false) {
    g.state = 'hit';
    g.skipped = skipped;
    const now = performance.now();
    for (const n of g.notes) {
      n.state = 'hit'; n.hitAt = now;
      n.held = !auto && !skipped && this.down.has(n.midi);
      this._pops.push({ midi: n.midi, t: now });
    }
    if (!auto) this.stats.hits++;
    const offset = this.pos - g.beat; // <0 early
    let waitedMs = 0;
    if (this.waiting) {
      waitedMs = now - g.waitedFrom;
      this.stats.waitedMs += waitedMs;
      this.waiting = false;
      this.emit('waitend', { index: g.index, waitedMs });
    }
    const o = this.opts;
    if (!auto && o.waitMode === 'soft' && offset > 0) {
      const late = offset; // beats past due
      const waitedSec = waitedMs / 1000 + late / this.bps;
      this._ramp = waitedSec < 0.6 ? { t0: now, from: this.speedNow, ms: 100 } : { t0: now, from: 0.35, ms: 1000 / this.bps };
    }
    if (!auto && offset < -0.25 && o.follow === 'jump' && o.waitMode !== 'flow') {
      this._jump = { from: this.pos, to: g.beat, t0: now };
    }
    this.next = Math.max(this.next, g.index + 1);
    if (!auto) this.emit('hit', { index: g.index, midis: g.midis.slice(), offsetBeats: offset, waitedMs, chord: g.notes.length > 1, skipped });
    this._emitPending();
  }

  _endWait() {
    if (!this.waiting) return;
    this.waiting = false;
    this.emit('waitend', { index: this.next, waitedMs: 0 });
  }

  // ---------- drawing ----------
  _resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    c.width = Math.max(1, Math.round(r.width * this._dpr));
    c.height = Math.max(1, Math.round(r.height * this._dpr));
    this._kbOffset = null;
    this._ink = getComputedStyle(c).getPropertyValue('--ink').trim() || '#2e2a3a';
    this.draw();
  }

  _offset() {
    if (this._kbOffset == null) {
      const a = this.canvas.getBoundingClientRect(), b = this.kb.root.getBoundingClientRect();
      this._kbOffset = b.left - a.left;
    }
    return this._kbOffset;
  }

  draw(now = performance.now()) {
    const c = this.ctx2d, W = this.W, H = this.H, o = this.opts;
    if (!W || !H) return;
    c.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const dx = this._offset();
    const ppb = this.ppb;
    const hitY = H - 2;
    const ink = this._ink || '#2e2a3a';

    // lane guides: faint columns over black keys, a line at each C
    const { lo, hi } = this.kb.visibleRange();
    c.save();
    for (let m = lo - 1; m <= hi + 1; m++) {
      const s = this.kb.keySpan(m);
      if (s.black) { c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(dx + s.x, 0, s.w, H); }
      else if (m % 12 === 0) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(dx + s.x, 0, 1, H); }
    }
    c.restore();

    // hit line
    const waitingGlow = this.waiting ? 0.5 + 0.5 * Math.sin(now / 260) : 0;
    c.fillStyle = `rgba(243,239,230,${0.22 + 0.2 * waitingGlow})`;
    c.fillRect(0, hitY - 1, W, 3);

    // blocks
    for (const g of this.groups) {
      const yb = hitY - (g.beat - this.pos) * ppb;
      if (yb < -10) break; // further groups are above the lane
      for (const n of g.notes) {
        const yTop = yb - n.dur * ppb + 3;
        if (yTop > H + 4) continue;
        this._drawBlock(c, n, g, dx, yTop, yb, hitY, ppb, now, ink);
      }
    }

    // hit pops
    this._pops = this._pops.filter((p) => now - p.t < 380);
    for (const p of this._pops) {
      const s = this.kb.keySpan(p.midi);
      const k = (now - p.t) / 380;
      const d = describe(p.midi);
      c.save();
      c.globalAlpha = (1 - k) * 0.7;
      c.strokeStyle = d.color;
      c.lineWidth = 3 * (1 - k) + 1;
      const cx = dx + s.x + s.w / 2;
      roundRect(c, cx - s.w / 2 - 6 * k, hitY - 10 - 14 * k, s.w + 12 * k, 14 + 14 * k, 8);
      c.stroke();
      c.restore();
    }
  }

  _drawBlock(c, n, g, dx, yTop, yBottom, hitY, ppb, now, ink) {
    const s = this.kb.keySpan(n.midi);
    const d = describe(n.midi);
    const pad = s.black ? 1 : Math.max(2, s.w * 0.08);
    let x = dx + s.x + pad, w = s.w - pad * 2;
    let top = yTop, bottom = yBottom - 1;
    let alpha = 1;
    let ghost = false;
    if (n.state === 'hit') {
      bottom = Math.min(bottom, hitY - 2); // consumed part disappears into the key
      if (n.released) { alpha = 0.35; ghost = true; bottom = yBottom - 1; } // released early: ghost falls on
      else if (!n.held || this.pos >= n.end) {
        const k = Math.min(1, (now - n.hitAt) / 200);
        alpha = 1 - k;
        if (alpha <= 0) return;
      }
    } else if (n.state === 'missed') {
      alpha = 0.28;
    }
    if (bottom - top < 2) return;
    const offscreen = s.x + s.w < 0 ? -1 : s.x > this.kb.width ? 1 : 0;
    if (offscreen) { this._drawArrow(c, offscreen, (top + bottom) / 2, (n.color || d.color)); return; }

    c.save();
    c.globalAlpha = alpha;
    const isPending = g.index === this.next && n.state === 'upcoming';
    if (isPending && this.waiting) {
      c.shadowColor = (n.color || d.color);
      c.shadowBlur = 10 + 8 * (0.5 + 0.5 * Math.sin(now / 260));
    }
    c.fillStyle = n.state === 'missed' ? '#4a4f62' : (n.color || d.color);
    roundRect(c, x, top, w, bottom - top, Math.min(8, w / 3));
    if (ghost) { c.strokeStyle = (n.color || d.color); c.lineWidth = 2; c.stroke(); c.restore(); return; }
    c.fill();
    c.shadowBlur = 0;
    if (s.black) { c.fillStyle = 'rgba(20,22,31,0.22)'; roundRect(c, x, top, w, bottom - top, Math.min(9, w / 3)); c.fill(); }
    if (n.state === 'hit' && n.held) { // glow while holding
      c.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(c, x, top, w, bottom - top, Math.min(9, w / 3)); c.fill();
    }
    // label near the bottom of the block (where the eye is)
    const mode = this.opts.labels === 'off' && this.forced?.has(n.midi) ? (this.opts.lastNaming || 'letters') : this.opts.labels;
    const label = labelFor(n.midi, mode);
    const h = Math.min(bottom, hitY) - top;
    if (label && h >= 16 && w >= 14) {
      const fs = Math.max(11, Math.min(20, w * (label.length > 2 ? 0.3 : 0.42), h - 4));
      c.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillStyle = ink;
      c.fillText(label, x + w / 2, Math.min(bottom, hitY) - 3);
    }
    c.restore();
  }

  _drawArrow(c, dir, y, color) {
    const x = dir < 0 ? 8 : this.W - 8;
    c.save();
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - dir * 12, y - 9);
    c.lineTo(x - dir * 12, y + 9);
    c.closePath();
    c.fill();
    c.restore();
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** MIDI range covering a phrase (for keyboard.setRange focus). */
export function phraseRange(phrase) {
  const ms = (phrase.notes || parseSeq(phrase.seq || '')).map((n) => toMidi(n.note ?? n.midi));
  return { lo: Math.min(...ms), hi: Math.max(...ms), midis: ms };
}

/** Root of a triad (major / minor / diminished) in any inversion; else the lowest note. */
function chordRoot(midis) {
  const pcs = new Set(midis.map((m) => m % 12));
  for (const m of [...midis].sort((a, b) => a - b)) {
    const r = m % 12;
    if ((pcs.has((r + 4) % 12) || pcs.has((r + 3) % 12)) && (pcs.has((r + 7) % 12) || pcs.has((r + 6) % 12))) return m;
  }
  return Math.min(...midis);
}
