// On-screen piano keyboard.
//
//   const kb = new Keyboard(containerEl, { start: 'C4', whites: 8, labels: 'letters' });
//   kb.on('noteon',  ({ midi, time, source }) => …);   // source: 'touch'
//   kb.on('noteoff', ({ midi, time, source }) => …);
//   kb.setLabels('solfege');                // 'letters' | 'solfege' | 'off' — live, no re-mount
//   kb.setRange('C3', 15, { animate: true }); // first visible key + number of white keys
//   kb.setTargets([60, 64]); kb.flash(60, 'correct'); kb.flash(62, 'wrong');
//   kb.isVisible(72); kb.keySpan(60) → { x, w, black }  (px from the keyboard's left edge)
//
// All keys of the strip (default C2…C7) exist in the DOM once; the visible window is a CSS
// transform + a --kw (white-key width) custom property, so changing range or labels never
// re-mounts keys. Hit-testing is pure geometry (no elementFromPoint), so it is fast and works
// with pointer capture and multi-touch.

import { Emitter } from './emitter.js';
import { describe, isBlack, toMidi, whiteIndex, whiteToMidi, shownLetter } from './notes.js';

// Black key offsets from the white-key boundary (in white-key widths), like a real keyboard.
const BLACK_OFFSET = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
const BLACK_W = 0.6;      // black key width, in white-key widths
const BLACK_H = 0.6;      // black key height, as a fraction of keyboard height

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Keyboard extends Emitter {
  constructor(root, opts = {}) {
    super();
    this.root = root;
    this.opts = {
      lowest: 'C2', highest: 'C7',
      start: 'C4', whites: 8,
      labels: 'letters',
      glissando: false,       // spec §4.2: a key sounds only on pointerdown on it (no sliding)
      minKeyPx: 44,           // never make white keys narrower than this (reduces visible range instead)
      maxKeyPx: 72,           // never wider than this (shows more keys instead)
      markMiddleC: true,
      blackLabels: false,     // show labels on black keys too
      ...opts,
    };
    this.lo = toMidi(this.opts.lowest);
    this.hi = toMidi(this.opts.highest);
    this.base = whiteIndex(this.lo);
    this.totalWhites = whiteIndex(this.hi) - this.base + 1;
    this._keys = new Map();     // midi -> element
    this._down = new Map();     // midi -> refcount
    this._pointers = new Map(); // pointerId -> midi|null
    this._targets = new Set();
    this.view = { start: 0, count: 8 };
    this._requested = null;
    this._anim = null;
    this.width = 0; this.height = 0;
    this._build();
    this.setLabels(this.opts.labels);
    this.setRange(this.opts.start, this.opts.whites, { animate: false });
    this._bind();
  }

  _build() {
    const r = this.root;
    r.classList.add('kb');
    r.innerHTML = '';
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', 'Piano keyboard');
    const strip = document.createElement('div');
    strip.className = 'kb-strip';
    this.strip = strip;
    const blacks = [];
    for (let m = this.lo; m <= this.hi; m++) {
      const d = describe(m);
      const el = document.createElement('div');
      el.className = 'key ' + (d.sharp ? 'black' : 'white');
      el.dataset.midi = String(m);
      el.style.setProperty('--nc', d.color);
      el.style.setProperty('--nd', d.deep);
      el.setAttribute('aria-label', m === 60 ? 'middle C' : d.name);
      const wi = whiteIndex(m) - this.base;
      if (d.sharp) {
        const x = Math.floor(wi) + 1 + (BLACK_OFFSET[m % 12] || 0) - BLACK_W / 2;
        el.style.setProperty('--x', String(x));
      } else {
        el.style.setProperty('--x', String(wi));
      }
      const showLbl = !d.sharp || this.opts.blackLabels;
      el.innerHTML = showLbl
        ? `<span class="lbl lbl-letters"><b>${shownLetter(d.letter)}${d.sharp ? '♯' : ''}</b>${d.letter === 'C' && !d.sharp ? `<small>${d.octave}</small>` : ''}</span>` +
          `<span class="lbl lbl-solfege"><b>${d.solfege}</b></span>`
        : '';
      if (m === 60 && this.opts.markMiddleC) el.classList.add('middle-c');
      this._keys.set(m, el);
      (d.sharp ? blacks : [strip]).length; // keep order: whites first, blacks after (z-order)
      if (d.sharp) blacks.push(el); else strip.appendChild(el);
    }
    blacks.forEach((b) => strip.appendChild(b));
    r.appendChild(strip);
  }

  _bind() {
    const r = this.root;
    const opt = { passive: false };
    r.addEventListener('pointerdown', (e) => this._onDown(e), opt);
    r.addEventListener('pointermove', (e) => this._onMove(e), opt);
    r.addEventListener('pointerup', (e) => this._onUp(e), opt);
    r.addEventListener('pointercancel', (e) => this._onUp(e), opt);
    r.addEventListener('lostpointercapture', (e) => this._onUp(e), opt);
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: stop long-press loupe / callout / double-tap zoom on the keys. (touchend is left alone,
    // so it still counts as a user activation for unlocking audio.)
    r.addEventListener('touchstart', (e) => e.preventDefault(), opt);
    r.addEventListener('touchmove', (e) => e.preventDefault(), opt);
    this._ro = new ResizeObserver(() => this._measure());
    this._ro.observe(r);
    this._measure();
  }

  destroy() {
    this._ro?.disconnect();
    cancelAnimationFrame(this._anim?.raf);
    for (const m of [...this._down.keys()]) this._setDown(m, false, true);
    this.root.innerHTML = '';
  }

  // ---------- geometry ----------
  _measure() {
    const rect = this.root.getBoundingClientRect();
    const changed = rect.width !== this.width || rect.height !== this.height;
    this.width = rect.width; this.height = rect.height;
    this._rect = rect;
    if (changed && this._requested) this._applyRequested(false);
    else this._applyView();
  }

  get kw() { return this.width / this.view.count; }

  _applyView() {
    // safety net: never narrower than minKeyPx once measured (e.g. after a hidden-pane resize)
    if (this.width && !this._anim && this.view.count > this.maxWhites() + 0.01 && this._requested && !this._fixing) {
      this._fixing = true; this._applyRequested(false); this._fixing = false; return;
    }
    const kw = this.kw || 1;
    this.strip.style.setProperty('--kw', kw + 'px');
    this.strip.style.width = (kw * this.totalWhites) + 'px';
    this.strip.style.transform = `translate3d(${-this.view.start * kw}px,0,0)`;
    this.root.style.setProperty('--kw', kw + 'px');
    this.emit('layout', this.geometry());
  }

  /** Current geometry for aligning other layers (e.g. falling notes). */
  geometry() {
    return { width: this.width, height: this.height, kw: this.kw, viewStart: this.view.start, viewCount: this.view.count };
  }

  /** Horizontal span of a key, in px from the keyboard's left edge (can be <0 or >width when off-screen). */
  keySpan(midi) {
    midi = toMidi(midi);
    const kw = this.kw;
    const wi = whiteIndex(midi) - this.base;
    if (isBlack(midi)) {
      const x = Math.floor(wi) + 1 + (BLACK_OFFSET[midi % 12] || 0) - BLACK_W / 2;
      return { x: (x - this.view.start) * kw, w: BLACK_W * kw, black: true };
    }
    return { x: (wi - this.view.start) * kw, w: kw, black: false };
  }

  isVisible(midi, { fully = true } = {}) {
    const s = this.keySpan(midi);
    const eps = 1;
    return fully ? s.x >= -eps && s.x + s.w <= this.width + eps : s.x + s.w > 0 && s.x < this.width;
  }

  /** Lowest and highest fully visible MIDI notes. */
  visibleRange() {
    const startW = Math.ceil(this.view.start - 0.001);
    const endW = Math.floor(this.view.start + this.view.count + 0.001) - 1;
    const lo = whiteToMidi(this.base + startW), hi = whiteToMidi(this.base + endW);
    return { lo, hi };
  }

  /** All visible MIDI notes (optionally only those matching a filter). */
  visibleNotes(filter = () => true) {
    const { lo, hi } = this.visibleRange();
    const out = [];
    for (let m = lo; m <= hi; m++) if (this.isVisible(m) && filter(m)) out.push(m);
    return out;
  }

  /** How many white keys fit at the minimum key width. */
  maxWhites() { return Math.max(3, Math.floor((this.width || 320) / this.opts.minKeyPx)); }

  /**
   * Show `whites` white keys starting at `start` (a white note).
   * If the screen is too narrow for minKeyPx, fewer keys are shown, centred on `focus` notes
   * (if given) or on the middle of the requested range.
   */
  setRange(start, whites, { animate = true, duration = 380, focus = null } = {}) {
    this._requested = { start: toMidi(start), whites, focus: focus ? focus.map(toMidi) : null };
    this._applyRequested(animate, duration);
  }

  _applyRequested(animate, duration = 380) {
    const { start, whites, focus } = this._requested;
    let s = whiteIndex(start) - this.base;
    let n = whites;
    const max = this.maxWhites();
    if (this.width && n > max) {
      let centre = s + n / 2;
      if (focus && focus.length) {
        const ws = focus.map((m) => whiteIndex(m) - this.base);
        centre = (Math.min(...ws) + Math.max(...ws) + 1) / 2;
      }
      n = max;
      s = Math.round(centre - n / 2);
    }
    // never wider than maxKeyPx (01 §3.3: keys max 72 px) — show more keys around the range instead
    if (this.width && this.opts.maxKeyPx && this.width / n > this.opts.maxKeyPx) {
      const n2 = Math.min(this.totalWhites, Math.ceil(this.width / this.opts.maxKeyPx));
      s -= Math.floor((n2 - n) / 2); n = n2;
    }
    s = Math.max(0, Math.min(this.totalWhites - n, Math.round(s)));
    this._animateTo(s, n, animate ? duration : 0);
  }

  /** Pan (keeping the key count) so all these notes are visible. Returns true if it moved. */
  ensureVisible(midis, { duration = 400 } = {}) {
    midis = midis.map(toMidi);
    if (!midis.length || midis.every((m) => this.isVisible(m))) return false;
    const n = Math.round(this.view.count);
    const ws = midis.map((m) => Math.floor(whiteIndex(m) - this.base));
    const lo = Math.min(...ws), hi = Math.max(...ws);
    let s = Math.round(this.view.start);
    if (lo < s) s = lo - 1; else if (hi > s + n - 1) s = hi - n + 2;
    s = Math.max(0, Math.min(this.totalWhites - n, s));
    // keep the originally requested key count (the view may be wider because of maxKeyPx)
    this._requested = { start: whiteToMidi(this.base + s), whites: Math.min(n, this._requested?.whites ?? n), focus: midis };
    this._animateTo(s, n, duration);
    return true;
  }

  /** Jump the window to start at white index `w` (piano map). */
  setViewStart(w, { animate = false } = {}) {
    const n = Math.round(this.view.count);
    const s = Math.max(0, Math.min(this.totalWhites - n, Math.round(w)));
    this._requested = { start: whiteToMidi(this.base + s), whites: n, focus: null };
    this._animateTo(s, n, animate ? 250 : 0);
  }

  _animateTo(start, count, duration) {
    if (this._anim) cancelAnimationFrame(this._anim.raf);
    if (!duration || !this.width) {
      this.view = { start, count };
      this._anim = null;
      this._applyView();
      return;
    }
    const from = { ...this.view };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const k = ease(t);
      this.view = { start: from.start + (start - from.start) * k, count: from.count + (count - from.count) * k };
      this._applyView();
      if (t < 1) this._anim.raf = requestAnimationFrame(step);
      else { this._anim = null; this.emit('rangechange', this.visibleRange()); }
    };
    this._anim = { raf: requestAnimationFrame(step) };
  }

  /** Zoom: show more (+n) or fewer (−n) keys around the current centre. */
  zoom(deltaWhites) {
    const cur = this._requested || { start: whiteToMidi(this.base + this.view.start), whites: this.view.count };
    const n = Math.max(5, Math.min(this.maxWhites(), Math.round(this.view.count) + deltaWhites));
    const centre = this.view.start + this.view.count / 2;
    const s = Math.round(centre - n / 2);
    this.setRange(whiteToMidi(this.base + Math.max(0, s)), n, { focus: cur.focus });
  }

  /** Shift by octaves (+1 right / −1 left). */
  shiftOctave(dir) {
    const s = Math.round(this.view.start) + 7 * dir;
    const n = Math.round(this.view.count);
    this.setRange(whiteToMidi(this.base + Math.max(0, Math.min(this.totalWhites - n, s))), n);
  }

  // ---------- hit testing ----------
  /** MIDI note under a client (page) coordinate, or null. */
  hit(clientX, clientY) {
    const r = this._rect;
    if (!r) return null;
    const x = clientX - r.left, y = clientY - r.top;
    const kw = this.kw;
    const u = this.view.start + x / kw; // in white-key units from the strip start
    if (y < this.height * BLACK_H) {
      // black key candidates: the ones right of white keys floor(u)-1 .. floor(u)
      const wi = Math.floor(u);
      for (const w of [wi - 1, wi, wi + 1]) {
        const m = whiteToMidi(this.base + w) + 1;
        if (!isBlack(m) || m > this.hi || m < this.lo) continue;
        const bx = w + 1 + (BLACK_OFFSET[m % 12] || 0) - BLACK_W / 2;
        if (u >= bx && u <= bx + BLACK_W) return m;
      }
    }
    const w = Math.floor(u);
    if (w < 0 || w >= this.totalWhites) return null;
    return whiteToMidi(this.base + w);
  }

  _onDown(e) {
    e.preventDefault();
    this._rect = this.root.getBoundingClientRect();
    try { this.root.setPointerCapture(e.pointerId); } catch { /* */ }
    const m = this.hit(e.clientX, e.clientY);
    this._pointers.set(e.pointerId, m);
    if (m != null) this._setDown(m, true, false, e.timeStamp);
  }

  _onMove(e) {
    if (!this._pointers.has(e.pointerId) || !this.opts.glissando) return;
    e.preventDefault();
    const prev = this._pointers.get(e.pointerId);
    // clamp y inside the keyboard so sliding up into the lane keeps the finger "on" the keys
    const r = this._rect;
    const y = Math.min(Math.max(e.clientY, r.top + 1), r.bottom - 1);
    const m = this.hit(e.clientX, y);
    if (m === prev) return;
    if (prev != null) this._setDown(prev, false, false, e.timeStamp);
    if (m != null) this._setDown(m, true, false, e.timeStamp, true);
    this._pointers.set(e.pointerId, m);
  }

  _onUp(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const m = this._pointers.get(e.pointerId);
    this._pointers.delete(e.pointerId);
    if (m != null) this._setDown(m, false, false, e.timeStamp);
  }

  _setDown(midi, down, silent = false, time = performance.now(), slide = false) {
    const n = this._down.get(midi) || 0;
    if (down) {
      this._down.set(midi, n + 1);
      if (n === 0) {
        this._keys.get(midi)?.classList.add('is-down');
        if (!silent) this.emit('noteon', { midi, time, source: 'touch', slide });
      }
    } else {
      if (n <= 1) {
        this._down.delete(midi);
        this._keys.get(midi)?.classList.remove('is-down');
        if (!silent && n === 1) this.emit('noteoff', { midi, time, source: 'touch' });
      } else this._down.set(midi, n - 1);
    }
  }

  /** Notes currently held on screen. */
  held() { return [...this._down.keys()]; }

  /** Release every held key (e.g. when leaving a screen). */
  releaseAll() {
    for (const id of [...this._pointers.keys()]) this._onUp({ pointerId: id, timeStamp: performance.now() });
  }

  // ---------- visuals ----------
  setLabels(mode) {
    this.labels = mode;
    this.root.dataset.labels = mode;
  }

  /** Glow keys as targets. level: 'soft' (default) | 'strong'. Replaces previous targets. */
  setTargets(midis = [], { level = 'soft' } = {}) {
    for (const m of this._targets) this._keys.get(m)?.classList.remove('is-target', 'strong');
    this._targets = new Set(midis.map(toMidi));
    for (const m of this._targets) {
      const el = this._keys.get(m);
      if (!el) continue;
      el.classList.add('is-target');
      if (level === 'strong') el.classList.add('strong');
    }
  }
  clearTargets() { this.setTargets([]); }

  /** Keys that stay lit in their colour (found keys in find steps). Replaces the previous set. */
  setFound(midis = []) {
    for (const el of this._keys.values()) el.classList.remove('is-found');
    for (const m of midis.map(toMidi)) this._keys.get(m)?.classList.add('is-found');
  }

  /** Force the label visible on some keys even when labels are off (hints). */
  setForcedLabels(midis = []) {
    for (const el of this._keys.values()) el.classList.remove('force-label');
    for (const m of midis.map(toMidi)) this._keys.get(m)?.classList.add('force-label');
  }

  /** Secondary highlight (e.g. "the two black keys"). Replaces previous highlight. */
  setHighlight(midis = []) {
    for (const el of this._keys.values()) el.classList.remove('is-hint');
    for (const m of midis.map(toMidi)) this._keys.get(m)?.classList.add('is-hint');
  }

  /** Brief feedback animation: 'correct' (pop) | 'wrong' (soft tint) | 'done' (quiet check). */
  flash(midi, kind = 'correct') {
    const el = this._keys.get(toMidi(midi));
    if (!el) return;
    const cls = kind === 'wrong' ? 'wrong' : kind === 'done' ? 'done' : 'pop';
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
    clearTimeout(el['_t_' + cls]);
    el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), kind === 'wrong' ? 650 : 520);
  }

  /** Visually press a key without emitting events (demos). */
  showPress(midi, ms = 300) {
    const el = this._keys.get(toMidi(midi));
    if (!el) return;
    el.classList.add('is-demo');
    clearTimeout(el._demoT);
    el._demoT = setTimeout(() => el.classList.remove('is-demo'), ms);
  }

  keyElement(midi) { return this._keys.get(toMidi(midi)); }
}
