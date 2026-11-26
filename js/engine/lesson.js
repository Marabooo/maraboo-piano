// Lesson runner for the curriculum format in design/02_lesson_curriculum.md §3, with the practice
// state machine, hint ladder and earned rules of design/01_interaction_spec.md §4, §5, §9.
//
//   const run = new LessonRunner({ lesson, keyboard, falling, audio, input, log, options });
//   run.on(type, fn) — UI events:
//     'step' {index,total,step}          'card' {eyebrow,text,note,buttons:[{id,label,primary}]}  'cardhide'
//     'bar' {text,kind}                  'skipnote' {show}       'tag' {midi,text,kind,ms}   'tagsclear'
//     'lane' {show}                      'chips' {names,index}  'labels' {hidden}           'demo' {on}
//     'phraseend' {headline,line,buttons} 'save' {stepIndex,recap}  'complete' summary
//   run.action(id): 'start' 'hear' 'again' 'slower' 'next' 'skipnote' 'skipdemo' 'hint'
//   run.start(index, {auto}); run.pause(); run.resume(); run.stop('leave'); run.labelsChanged(mode)
//
// The runner never touches the DOM itself; keyboard/falling/audio are the engine objects.

import { Emitter } from './emitter.js';
import { describe, isBlack, pitchClass, toMidi, whiteIndex, whiteToMidi } from './notes.js';

// v0.3.2 (student's own check, 25 Nov: "the tips pop up too fast"): every level comes later than
// in 01 §5.2 ([3,6,10,15] / [4,8,12,18]) so the instruction is read first, and one wrong press only
// gets the wrong-note bubble — the ladder starts climbing from the 2nd wrong press (see _ladderWrong).
const LADDER = {              // seconds from the due beat (play) or prompt start / last success (find, recall)
  show: [5, 9, 14, 20],
  remind: [3, 9, 14, 20],
  recognise: [5, 9, 14, 20],
  find: [7, 12, 17, 24],
  recall: [7, 12, 17, 24],
};
const PATTERN2 = new Set([0, 2, 4]);        // C D E live around the two black keys
const BLACK2 = [1, 3], BLACK3 = [6, 8, 10];

const DEFAULTS = {
  t: (id) => id, tx: (o) => (o && (o.en || o)) || '', noteName: (x) => String(x),
  noteHint: {}, patternHint: {},
  waitMode: 'soft', speed: 1, hints: 'auto', practiceMode: 'touch', backing: true,
};

/** Keyboard range (first white key + count) for lo..hi. */
export function fitRange(lo, hi, { minWhites = 8, pad = 1 } = {}) {
  lo = toMidi(lo); hi = toMidi(hi);
  let a = Math.floor(whiteIndex(lo)) - pad, b = Math.ceil(whiteIndex(hi)) + pad;
  while (b - a + 1 < minWhites) { if ((b - a) % 2) a--; else b++; }
  return { start: whiteToMidi(a), whites: b - a + 1 };
}

/** Curriculum event [name|names, midi|midis, beat, dur] → [{midi, beat, dur}] */
export function eventsToNotes(evts) {
  const out = [];
  for (const e of evts || []) {
    const ms = Array.isArray(e[1]) ? e[1] : [e[1]];
    for (const m of ms) out.push({ midi: m, beat: e[2], dur: e[3] });
  }
  return out;
}

export class LessonRunner extends Emitter {
  constructor({ lesson, keyboard, falling, audio, input, log, options = {} }) {
    super();
    this.lesson = lesson;
    this.kb = keyboard; this.fall = falling; this.audio = audio; this.input = input; this.log = log;
    this.o = { ...DEFAULTS, ...options };
    this.index = -1;
    this.finished = false;
    this.paused = false;
    this.stats = {};            // stepId -> { done, skipped, prompts:[], events:[], labelsHidden }
    this._timers = new Set();
    this._carry = false; this._cleanStreak = 0;
    this._offs = [input.on('noteon', (e) => this._noteOn(e)), input.on('noteoff', (e) => this._noteOff(e))];
    this.t0 = performance.now();
  }

  get step() { return this.lesson.steps[this.index]; }
  get total() { return this.lesson.steps.length; }
  get mic() { return this.o.practiceMode === 'mic'; }
  _st(id = this.step.id) { return (this.stats[id] ||= { done: false, skipped: false, prompts: [], events: [], labelsHidden: true }); }
  _name(m) { return this.o.noteName(typeof m === 'number' ? m : m); }

  start(index = 0, { auto = false, resumed = false } = {}) {
    this.log.event('lesson_start', { lesson: this.lesson.id, steps: this.total, from: index, resumed, mode: this.o.practiceMode, wait: this.o.waitMode });
    this._enter(index, { auto });
  }

  stop(reason = 'leave') {
    if (!this.finished && this.index >= 0) {
      this.log.event('lesson_abandon', { lesson: this.lesson.id, step: this.index, stepId: this.step?.id, reason, afterMistake: performance.now() - (this._lastWrongAt || -1e9) < 6000 });
    }
    this._leave();
    this._offs.forEach((f) => f());
    this.finished = true;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.fall.pause();
    this._ladderFreeze();
    this.log.event('pause', { lesson: this.lesson.id, stepId: this.step?.id });
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this._state === 'RUNNING' || this._state === 'DEMO') this.fall.resume();
    this._ladderThaw();
  }

  action(id) {
    const fn = this._actions?.[id];
    if (fn) { this.log.event('action', { lesson: this.lesson.id, stepId: this.step?.id, id }); fn(); }
  }

  /** UI tells us the learner changed labels (recall steps track "labels hidden"). */
  labelsChanged(mode) {
    if (this.step?.type === 'recall' && mode !== 'off') this._st().labelsHidden = false;
  }

  // ---------- step machinery ----------
  _enter(index, { auto = false } = {}) {
    this._leave();
    if (index >= this.total) return this._finish();
    this.index = index;
    const step = this.step;
    this._stepT0 = performance.now();
    this._state = 'CARD';
    this.emit('step', { index, total: this.total, step });
    this.log.event('step_start', { lesson: this.lesson.id, index, stepId: step.id, stepType: step.type, auto });
    const fn = this['_step_' + step.type.replace('-', '_')];
    if (!fn) { console.warn('Unknown step type', step.type); return this._done(); }
    this._cleanup = fn.call(this, step, { auto }) || null;
  }

  _leave() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._ladderStop();
    try { this._cleanup?.(); } catch (e) { console.error(e); }
    this._cleanup = null; this._actions = null; this._onNote = null; this._onNoteOff = null; this._findWait = false;
    this.kb.clearTargets(); this.kb.setHighlight([]); this.kb.setFound([]); this.kb.setForcedLabels([]);
    this.fall.setForcedLabels([]);
    this.audio.padOff?.({ release: 0.4 });
    this.emit('cardhide'); this.emit('tagsclear'); this.emit('skipnote', { show: false }); this.emit('big', null);
  }

  _done({ auto = false, skipped = false } = {}) {
    if (this.finished) return;
    const step = this.step;
    const st = this._st();
    st.done = true; st.skipped = skipped;
    this.log.event('step_end', { lesson: this.lesson.id, index: this.index, stepId: step.id, ms: Math.round(performance.now() - this._stepT0), skipped });
    this.emit('save', { stepIndex: this.index + 1, recap: step.recap ? this.o.tx(step.recap) : null, stepDone: true, skipped });
    this._enter(this.index + 1, { auto });
  }

  _later(fn, ms) { const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms); this._timers.add(t); return t; }

  /** Range for play/listen/recall: the step's notes plus margin (at least 8 white keys). */
  _stepRange(midis) {
    const lo = Math.min(...midis), hi = Math.max(...midis);
    const { start, whites } = fitRange(lo, hi, { minWhites: 8, pad: 1 });
    this.kb.setRange(start, whites, { animate: this.index > 0, focus: [lo, hi] });
  }

  _range(midis) {
    const r = this.lesson.range;
    const lo = Math.min(...midis), hi = Math.max(...midis);
    let start, whites;
    if (r && toMidi(r.low) <= lo && toMidi(r.high) >= hi) {
      start = toMidi(r.low); whites = Math.round(whiteIndex(toMidi(r.high)) - whiteIndex(start)) + 1;
    } else ({ start, whites } = fitRange(lo, hi, { minWhites: 8 }));
    this.kb.setRange(start, whites, { animate: this.index > 0, focus: [lo, hi] });
  }
  _lessonRange() {
    const r = this.lesson.range || { low: 'C3', high: 'C5' };
    const lo = toMidi(r.low), hi = toMidi(r.high);
    const whites = Math.round(whiteIndex(hi) - whiteIndex(lo)) + 1;
    // too narrow (portrait): show the octave from middle C, so two Cs stay in view (01 §3.7)
    if (this.kb.width && this.kb.maxWhites() < Math.min(whites, 10)) this.kb.setRange(60, 8, { animate: this.index > 0, focus: [60, 72] });
    else this._range([lo, hi]);
  }

  // ---------- hint ladder (01 §5.2) ----------
  _ladderStart(kind, onLevel, startLevel = 0) {
    this._ladderStop();
    this._ladder = { kind, onLevel, level: 0, wrongs: 0, t0: performance.now(), frozenAt: 0 };
    if (startLevel > 0) this._ladderSet(startLevel, 'carry');
    this._ladderSchedule();
  }
  _ladderSchedule() {
    const L = this._ladder;
    if (!L || this.o.hints === 'ask' || this.paused) return;
    clearTimeout(L.timer);
    const times = LADDER[L.kind] || LADDER.recognise;
    if (L.level >= 4) return;
    const due = times[L.level] * 1000 - (performance.now() - L.t0);
    L.timer = setTimeout(() => { this._ladderSet(L.level + 1, 'time'); this._ladderSchedule(); }, Math.max(0, due));
  }
  _ladderSet(level, why) {
    const L = this._ladder;
    if (!L || level <= L.level) return;
    L.level = Math.min(4, level);
    this.log.event('hint', { lesson: this.lesson.id, stepId: this.step.id, level: L.level, why });
    if (L.level >= 4) { /* v2: no Skip note button */ }
    else L.onLevel(L.level);
  }
  _ladderWrong(countIt = true) {
    const L = this._ladder;
    if (!L) return;
    if (countIt) L.wrongs++;
    if (this.o.hints !== 'ask' && L.wrongs >= 2) this._ladderSet(Math.min(3, L.wrongs - 1), 'wrong');
  }
  /** Names on the hinted keys/blocks — only when the lesson hid the labels, never when the learner chose Off. */
  _force(midis) {
    const m = this.o.revealNames && !this.o.revealNames() ? [] : midis;
    this.kb.setForcedLabels(m); this.fall.setForcedLabels(m);
  }
  _ladderResultFromNone(r) {
    if (r.hint === 0 && r.wrongs === 0) { if (++this._cleanStreak >= 2) this._carry = false; }
  }
  _ladderStop() { if (this._ladder) clearTimeout(this._ladder.timer); this._ladder = null; this.emit('skipnote', { show: false }); }
  _ladderFreeze() { const L = this._ladder; if (L) { clearTimeout(L.timer); L.frozenAt = performance.now(); } }
  _ladderThaw() { const L = this._ladder; if (L && L.frozenAt) { L.t0 += performance.now() - L.frozenAt; L.frozenAt = 0; this._ladderSchedule(); } }
  /** Result of the current target for stats + carry-over (01 §5.3). */
  _ladderResult(skipped = false) {
    const L = this._ladder || { level: 0, wrongs: 0 };
    const r = { hint: skipped ? 4 : L.level, wrongs: L.wrongs, skipped };
    if (r.hint >= 2) { this._carry = true; this._cleanStreak = 0; }
    else if (r.hint === 0 && r.wrongs === 0) { if (++this._cleanStreak >= 2) this._carry = false; }
    else this._cleanStreak = 0;
    this._ladderStop();
    return r;
  }

  // ---------- input ----------
  _noteOn(e) { if (!this.finished && !this.paused) this._onNote?.(e.midi, e); }
  _noteOff(e) { if (!this.finished) this._onNoteOff?.(e.midi, e); }

  _wrongText(played, target, { chord = false, octave = false, nextBut = false } = {}) {
    const t = this.o.t;
    if (this.mic) return t('mic.heard_waiting', { played: this._name(played), target: this._name(target) });
    if (chord) return t('wrong.chord_extra', { played: this._name(played) });
    if (nextBut) return t('wrong.next_but', { target: this._name(target) });
    if (octave) return t('wrong.octave', { target: this._name(target) });
    const dir = t(target > played ? 'dir.right' : 'dir.left');
    if (isBlack(played)) return t('wrong.black', { target: this._name(target), dir });
    const n = Math.abs(Math.round(whiteIndex(target) - whiteIndex(played)));
    if (n === 1) return t('wrong.near_one', { played: this._name(played), target: this._name(target), dir });
    if (n <= 4) return t('wrong.near_many', { played: this._name(played), target: this._name(target), n, dir });
    return t('wrong.far', { played: this._name(played), target: this._name(target), dir });
  }
  _wrong(midi, target, opts = {}) {
    this._lastWrongAt = performance.now();
    if (!this.mic) this.kb.flash(midi, 'wrong');
    this.emit('tag', { midi, text: this._wrongText(midi, target, opts), kind: 'wrong', ms: 1600 });
    this.log.event(opts.octave ? 'near_miss' : 'wrong', { lesson: this.lesson.id, stepId: this.step.id, played: describe(midi).ascii, target: target != null ? describe(target).ascii : null });
  }

  _patternFor(pc) { return PATTERN2.has(pc) ? 'pattern2' : 'pattern3'; }
  _patternKeys(kind) { const pcs = kind === 'pattern2' ? BLACK2 : BLACK3; return this.kb.visibleNotes((m) => pcs.includes(pitchClass(m))); }
  _noteHintText(midi, custom) {
    if (custom) return this.o.tx(custom);
    const h = this.o.noteHint[describe(midi).letter];
    return h ? this.o.tx(h) : this._name(midi);
  }

  // ---------- find (01 §4.8) ----------
  _step_find(step) {
    this._lessonRange();
    this.emit('lane', { show: false });
    const st = this._st();
    st.prompts = [];
    const found = [];
    let p = -1;
    let begun = false;
    const t = this.o.t;
    this.emit('card', { eyebrow: t('step.eyebrow', { n: this.index + 1, total: this.total }), text: this.o.tx(step.card), note: t('step.tap_to_begin'), buttons: [] });

    const visibleOf = (pc) => this.kb.visibleNotes((m) => pitchClass(m) === pc);
    const nextPrompt = () => {
      p++;
      this.kb.clearTargets(); this.kb.setHighlight([]); this.kb.setForcedLabels([]);
      this.emit('tagsclear');
      while (p < step.prompts.length && step.prompts[p].ifVisible && visibleOf(this._pc(step.prompts[p])).length < step.prompts[p].ifVisible) p++;
      if (p >= step.prompts.length) return finish();
      const pr = step.prompts[p];
      const pc = this._pc(pr);
      this.debugTarget = this._letter(pr);
      this.emit('bar', { text: this.o.tx(pr.bar), kind: 'step' });
      this.emit('big', { letter: this._letter(pr) }); // v2: the note to find, big in the middle
      if (pr.glow === 'pattern2' || pr.glow === 'pattern3') this.kb.setHighlight(this._patternKeys(pr.glow));
      if (pr.glow === 'targets') this.kb.setTargets(visibleOf(pc), { level: 'soft' });
      this._ladderStart('find', (lvl) => this._findHint(lvl, pr, pc, found), this._carry ? 1 : 0);
    };
    const finish = () => {
      this.emit('big', null);
      this._ladderStop();
      this.kb.clearTargets(); this.kb.setHighlight([]);
      this.emit('bar', { text: step.after ? this.o.tx(step.after) : t('find.done'), kind: 'done' });
      found.forEach((m) => this.kb.flash(m, 'correct'));
      this._later(() => this._done(), 1500);
    };
    this._onNote = (m) => {
      if (!begun) { begun = true; this.emit('cardhide'); this._state = 'ACTIVE'; nextPrompt(); }
      if (p < 0 || p >= step.prompts.length || this._findWait) return;
      const pr = step.prompts[p];
      const pc = this._pc(pr);
      if (pitchClass(m) === pc) {
        if (pr.different && !this.mic && found.includes(m) && visibleOf(pc).some((x) => !found.includes(x))) {
          this.kb.flash(m, 'done');
          this.emit('tag', { midi: m, text: t('wrong.same', { target: this._name(m) }), kind: 'info', ms: 1600 });
          return;
        }
        const r = this._ladderResult();
        st.prompts[p] = { ...r, target: describe(m).letter, guidance: pr.guidance };
        this.log.event('note_accepted', { lesson: this.lesson.id, stepId: step.id, prompt: p + 1, note: describe(m).ascii, hint: r.hint, wrongsBefore: r.wrongs });
        if (!found.includes(m)) found.push(m);
        this.kb.setFound(found);
        this.kb.flash(m, 'correct');
        this.emit('tagsclear');
        this.emit('save', { stepIndex: this.index, recap: null });
        this._findWait = true;
        this._later(() => { this._findWait = false; nextPrompt(); }, 600);
      } else {
        const targets = visibleOf(pc).filter((x) => !found.includes(x));
        const tgt = (targets.length ? targets : visibleOf(pc)).sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0];
        this._wrong(m, tgt);
        this._ladderWrong();
      }
    };
    this._actions = { skipnote: () => { const r = this._ladderResult(true); st.prompts[p] = { ...r, target: this._letter(step.prompts[p]), guidance: step.prompts[p].guidance }; this.log.event('skip', { lesson: this.lesson.id, stepId: step.id, prompt: p + 1 }); nextPrompt(); },
      hint: () => this._ladderSet((this._ladder?.level || 0) + 1, 'request') };
  }
  _pc(pr) { return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[String(pr.target)[0]]; }
  _letter(pr) { return String(pr.target)[0]; }

  _findHint(level, pr, pc, found) {
    const vis = this.kb.visibleNotes((m) => pitchClass(m) === pc);
    const left = vis.filter((m) => !found.includes(m));
    const centre = (this.kb.visibleRange().lo + this.kb.visibleRange().hi) / 2;
    const target = (left.length ? left : vis).sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))[0];
    if (level === 1) {
      const kind = this._patternFor(pc);
      const keys = this._patternKeys(kind);
      this.kb.setHighlight(keys);
      const ph = this.o.patternHint[kind];
      // keep the prompt in the bar (it names the note); the pattern hint goes in a tag over a group
      const near = keys.sort((a, b) => Math.abs(a - (target ?? 60)) - Math.abs(b - (target ?? 60)))[0];
      if (ph && near != null) this.emit('tag', { midi: near, text: this.o.tx(ph), kind: 'hint', ms: 0 });
    } else if (level === 2 && target != null) {
      this.kb.setTargets([target], { level: 'strong' });
      this.kb.keyElement(target)?.classList.add('fill');
      this._force([target]);
      this.emit('tag', { midi: target, text: this._noteHintText(target, pr.h2), kind: 'hint', ms: 0 });
    } else if (level === 3 && target != null) {
      if (!this.mic) this.audio.playNote(target, 0.6, { velocity: 0.6 });
      this.emit('tag', { midi: target, text: this.o.t('hint.tap_here'), kind: 'pointer', ms: 0 });
    }
  }

  // ---------- chord-find ----------
  _step_chord_find(step) {
    // v2: show the keys the chords actually use (lesson range could start too low on a phone)
    this._stepRange(step.prompts.flatMap((p) => p.target[1]));
    this.emit('lane', { show: false });
    const st = this._st();
    const t = this.o.t;
    let p = -1, begun = false;
    const held = new Set();
    const presses = new Map();
    const windowMs = this.mic ? 3000 : 1200;
    this.emit('card', { eyebrow: t('step.eyebrow', { n: this.index + 1, total: this.total }), text: this.o.tx(step.card), note: t('step.tap_to_begin'), buttons: [] });
    const candidates = (pr) => {
      const base = pr.target[1];
      if (!pr.acceptAnyRootC) return [base];
      const ex = pr.exclude ? toMidi(pr.exclude) : null;
      return this.kb.visibleNotes((m) => pitchClass(m) === 0 && m !== ex && this.kb.isVisible(m + 7)).map((c) => [c, c + 4, c + 7]);
    };
    const nextPrompt = () => {
      p++;
      presses.clear();
      this.kb.clearTargets(); this.emit('tagsclear');
      if (p >= step.prompts.length) {
        this._ladderStop();
        this.emit('bar', { text: step.after ? this.o.tx(step.after) : t('find.done'), kind: 'done' });
        this._later(() => this._done(), 1500);
        return;
      }
      const pr = step.prompts[p];
      this.emit('bar', { text: this.mic ? t('mic.chord_line', { notes: pr.target[1].map((m) => this._name(m)).join(', ') }) : this.o.tx(pr.bar), kind: 'step' });
      this.kb.ensureVisible?.(pr.target[1]);
      if (pr.glow === 'targets') this.kb.setTargets(pr.target[1], { level: 'soft' });
      this._ladderStart('find', (lvl) => {
        const c = candidates(pr)[0] || pr.target[1];
        if (lvl === 1) this.kb.setTargets(c, { level: 'soft' });
        if (lvl === 2) { this.kb.setTargets(c, { level: 'strong' }); this.emit('tag', { midi: c[1], text: pr.h2 ? this.o.tx(pr.h2) : t('hint.chord_together'), kind: 'hint', ms: 0 }); }
        if (lvl === 3 && !this.mic) { const t0 = this.audio.now() + 0.03; c.forEach((m) => this.audio.playNote(m, 0.9, { when: t0, velocity: 0.55 })); }
      }, this._carry ? 1 : 0);
    };
    let partialT = null;
    this._onNote = (m, e) => {
      if (!begun) { begun = true; this.emit('cardhide'); nextPrompt(); }
      if (p < 0 || p >= step.prompts.length || this._findWait) return;
      held.add(m);
      const pr = step.prompts[p];
      const cands = candidates(pr);
      const inAny = cands.some((c) => c.some((x) => pitchClass(x) === pitchClass(m))); // v2: any octave / inversion
      if (!inAny) { this._wrong(m, null, { chord: true }); this._ladderWrong(); return; }
      presses.set(pitchClass(m), e.time);
      const now = e.time;
      const ok = cands.find((c) => c.every((x) => {
        const k = pitchClass(x);
        const tp = presses.get(k);
        return tp != null && ([...held].some((hm) => pitchClass(hm) === k) || now - tp <= windowMs);
      }));
      clearTimeout(partialT);
      if (ok) {
        const r = this._ladderResult();
        st.prompts[p] = { ...r, target: 'chord', guidance: pr.guidance };
        this.log.event('note_accepted', { lesson: this.lesson.id, stepId: step.id, prompt: p + 1, chord: ok.map((x) => describe(x).ascii).join(' '), hint: r.hint, wrongsBefore: r.wrongs });
        ok.forEach((x) => this.kb.flash(x, 'correct'));
        this._findWait = true;
        this._later(() => { this._findWait = false; nextPrompt(); }, 700);
      } else {
        partialT = this._later(() => {
          const c = cands[0];
          const missing = c.filter((x) => !presses.has(pitchClass(x)));
          if (missing.length) {
            this.kb.setTargets(missing, { level: 'strong' });
            this.emit('tag', { midi: missing[0], text: t('hint.chord_add', { notes: missing.map((x) => this._name(x)).join(' + ') }), kind: 'hint', ms: 2500 });
          }
        }, 2000);
      }
    };
    this._onNoteOff = (m) => held.delete(m);
    this._actions = { skipnote: () => { const r = this._ladderResult(true); st.prompts[p] = { ...r, target: 'chord' }; nextPrompt(); },
      hint: () => this._ladderSet((this._ladder?.level || 0) + 1, 'request') };
  }

  // ---------- listen / play (01 §4.1–4.7) ----------
  _phrase(step, { speed } = {}) {
    const notes = eventsToNotes(step.notes);
    const app = [];
    if (step.pad && this.o.backing && !this.mic) for (const e of step.pad) app.push({ type: 'pad', beat: e[2], dur: e[3], midis: e[1] });
    for (const e of step.app?.melody || []) for (const m of (Array.isArray(e[1]) ? e[1] : [e[1]])) app.push({ type: 'note', beat: e[2], dur: e[3], midis: [m] });
    return { tempo: step.tempo || 80, notes, app };
  }

  _wireApp(fall, { demo = false } = {}) {
    // pad + melody (app events), scheduled just-in-time as the song clock crosses them
    return fall.on('app', (e) => {
      if (e.type === 'pad') {
        if (e.phase === 'start') { this._padNow = e.midis; this.audio.padOn(e.midis, { gain: 0.06 }); }
        else if (e.phase === 'end') {
          const cont = fall.app.some((x) => x.type === 'pad' && x !== e && Math.abs(x.beat - (e.beat + e.dur)) < 0.01);
          if (!cont) { this._padNow = null; this.audio.padOff({ release: fall.next >= fall.groups.length ? 2 : 0.6 }); }
        }
      } else if (e.type === 'note' && e.phase === 'start') {
        this.audio.playNote(e.midis[0], Math.max(0.15, e.durSec * 0.92), { velocity: 0.62 });
        if (demo) this.kb.showPress(e.midis[0], e.durSec * 900);
      }
    });
  }

  _demo(step, { onEnd } = {}) {
    const fall = this.fall;
    const phrase = this._phrase(step);
    this._stepRange(phrase.notes.map((n) => n.midi));
    this.emit('lane', { show: true });
    this.emit('demo', { on: true });
    fall.setOption('autoplay', true);
    fall.setLabels(this.o.labels?.() || 'letters');
    fall.setSpeed(this.o.speed);
    fall.load(phrase);
    this._state = 'DEMO';
    const offs = [this._wireApp(fall, { demo: true }),
      fall.on('autonote', ({ midis, delay, durs }) => {
        const tt = this.audio.now() + delay;
        midis.forEach((m, i) => {
          this.audio.playNote(m, Math.max(0.15, durs[i] * 0.92), { when: tt, velocity: 0.75 });
          this._later(() => this.kb.showPress(m, Math.max(120, durs[i] * 900)), delay * 1000);
        });
      }),
      fall.on('end', () => finish())];
    const finish = () => { offs.forEach((f) => f()); fall.stop(); fall.setOption('autoplay', false); this.audio.padOff({ release: 1 }); this.emit('demo', { on: false }); this._demoStop = null; onEnd?.(); };
    this._demoStop = () => { this.audio.allOff(); finish(); };
    if (!this.paused) fall.start();
    this.log.event('demo_play', { lesson: this.lesson.id, stepId: step.id });
  }

  _step_listen(step, { auto }) {
    const t = this.o.t;
    const phrase = this._phrase(step);
    this._stepRange(phrase.notes.map((n) => n.midi));
    this.emit('lane', { show: true });
    const go = () => {
      this.emit('cardhide');
      this.emit('bar', { text: this.o.tx(step.bar), kind: 'step' });
      this._demo(step, { onEnd: () => this._later(() => this._done({ auto: false }), 400) });
    };
    this._actions = { start: go, skipdemo: () => this._demoStop?.() };
    if (auto) go();
    else this.emit('card', { eyebrow: t('step.eyebrow', { n: this.index + 1, total: this.total }), text: this.o.tx(step.card), buttons: [{ id: 'start', label: t('step.start'), primary: true }] });
    return () => { this._demoStop?.(); };
  }

  _guidanceFor(step, groupIndex, midis) {
    const g = step.guidance || 'recognise';
    if (typeof g === 'string') return g;
    if (g.first && groupIndex < g.first) return 'show';
    if (midis.length > 1 && g.chord) return g.chord;
    if (midis.length === 1) { const l = describe(midis[0]).letter; if (g[l]) return g[l]; }
    return g.default || 'recognise';
  }

  _step_play(step, { auto }) {
    const t = this.o.t;
    const fall = this.fall;
    const st = this._st();
    st.events = [];
    const phrase = this._phrase(step);
    this._stepRange(phrase.notes.map((n) => n.midi));
    this.emit('lane', { show: true });
    fall.setOption('autoplay', false);
    fall.setWaitMode(this.o.waitMode);
    fall.setOption('follow', step.follow || 'jump');
    fall.setOption('matchPitchClass', this.mic);
    fall.setSpeed(this.o.speed);
    fall.setLabels(this.o.labels?.() || 'letters');
    fall.load(phrase);
    const rec = step.record ? [] : null;
    let offs = [];
    let barHidden = false;

    const showCard = () => {
      this._state = 'CARD';
      this.emit('card', { eyebrow: t('step.eyebrow', { n: this.index + 1, total: this.total }), text: this.o.tx(step.card),
        buttons: [{ id: 'start', label: t('step.start'), primary: true }, { id: 'hear', label: t('step.hear_first') }] });
    };
    const begin = () => {
      this.emit('cardhide');
      this.emit('bar', { text: this.o.tx(step.bar), kind: 'step' });
      this._state = 'RUNNING';
      wire();
      this._runT0 = performance.now();
      if (!this.paused) fall.start();
    };
    const level = (g) => this._guidanceFor(step, g.index, g.midis);
    const wire = () => {
      offs.forEach((f) => f());
      offs = [
        this._wireApp(fall),
        fall.on('approach', ({ index, midis }) => {
          const g = fall.groups[index];
          if (level(g) === 'show' || this._carry) {
            this.kb.setTargets(midis, { level: 'soft' });
            this._force(midis);
          }
        }),
        fall.on('waitstart', ({ index, midis }) => {
          const g = fall.groups[index];
          const lv = level(g);
          if (this.o.waitMode === 'strict') this.audio.padOff({ release: 0.15 });
          else if (this._padNow) this._padFadeT = this._later(() => this.audio.padOff({ release: 3 }), 8000);
          // repeated note still held → "tap again" text instead of the pattern hint
          const stillHeld = midis.length === 1 && fall.down.has(midis[0]);
          if (this._ladder && this._ladderGroup === index) return; // already started by a wrong press
          this._ladderGroup = index;
          this._ladderStart(lv === 'remind' ? 'remind' : 'recognise', (L) => this._playHint(L, midis, step, stillHeld), this._carry ? 1 : 0);
        }),
        fall.on('hit', ({ index, midis, skipped, offsetBeats, waitedMs }) => {
          const r = this._ladder ? this._ladderResult(skipped) : (() => { const x = { hint: 0, wrongs: 0, skipped }; this._ladderResultFromNone(x); return x; })();
          this._ladderGroup = -1;
          st.events.push({ ...r, letters: midis.map((m) => describe(m).letter) });
          clearTimeout(this._padFadeT);
          if (this._padNow && !this.audio.padActive) this.audio.padOn(this._padNow, { gain: 0.06 });
          this.kb.clearTargets(); this.kb.setForcedLabels([]); fall.setForcedLabels([]);
          this.emit('tagsclear');
          if (!skipped) midis.forEach((m) => this.kb.flash(m, 'correct'));
          if (rec && !skipped) midis.forEach((m) => rec.push({ midi: m, t: performance.now(), beat: fall.groups[index].beat, dur: fall.groups[index].notes[0].dur }));
          this.log.event('note_accepted', { lesson: this.lesson.id, stepId: step.id, index, notes: midis.map((m) => describe(m).ascii).join(' '), hint: r.hint, wrongsBefore: r.wrongs, offsetBeats: Math.round(offsetBeats * 100) / 100, waitedMs: Math.round(waitedMs), skipped });
          const lv = level(fall.groups[index]);
          if (!barHidden && (lv === 'recognise' || lv === 'recall')) { barHidden = true; this.emit('bar', { text: '', kind: 'hide' }); }
        }),
        fall.on('wrong', ({ midi, expected, octave, nextButOne, chord }) => {
          const tgt = expected.slice().sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi))[0];
          this._wrong(midi, tgt, { octave, nextBut: nextButOne, chord });
          const g = fall.pendingGroup();
          if (g && (!this._ladder || this._ladderGroup !== g.index)) {
            this._ladderGroup = g.index;
            this._ladderStart(level(g) === 'remind' ? 'remind' : 'recognise', (L) => this._playHint(L, g.midis, step, false), this._carry ? 1 : 0);
          }
          if (!this._ladder) return;
          if (octave) { this._ladder.octaves = (this._ladder.octaves || 0) + 1; if (this._ladder.octaves < 2) { this._ladder.wrongs++; return; } }
          this._ladderWrong();
        }),
        fall.on('holdtip', () => this.emit('bar', { text: t('hint.hold_tip'), kind: 'hint', ms: 2500 })),
        fall.on('end', (s) => {
          this.audio.padOff({ release: 2 });
          this.log.event('phrase_end', { lesson: this.lesson.id, stepId: step.id, waits: s.waits, waitedMs: Math.round(s.waitedMs), wrong: s.wrong, wait: this.o.waitMode, speed: this.o.speed });
          if (rec) this.recording = { stepId: step.id, notes: rec, tempo: phrase.tempo };
          this._phraseEnd(step, st.events);
        }),
      ];
    };
    this._onNote = (m, e) => {
      if (this._state !== 'RUNNING') return; // CARD/DEMO: keys sound but are not evaluated
      fall.noteOn(m, e.time);
      if (rec) this._lastDown = m;
    };
    this._onNoteOff = (m, e) => { fall.noteOff(m, e.time); if (rec) { const r = [...rec].reverse().find((x) => x.midi === m && !x.up); if (r) r.up = performance.now(); } };
    this._actions = {
      start: begin,
      hear: () => { this.emit('cardhide'); this._demo(step, { onEnd: () => { fall.load(this._phrase(step)); this._stepRange(phrase.notes.map((n) => n.midi)); showCard(); } }); },
      skipnote: () => fall.skipPending(),
      skipdemo: () => this._demoStop?.(),
      hint: () => this._ladderSet((this._ladder?.level || 0) + 1, 'request'),
    };
    if (auto) begin(); else showCard();
    return () => { offs.forEach((f) => f()); fall.stop(); this._demoStop?.(); };
  }

  _playHint(level, midis, step, stillHeld) {
    const t = this.o.t;
    const m = midis[0];
    if (level === 1) {
      this.kb.setTargets(midis, { level: 'soft' });
      this._force(midis);
      if (stillHeld) this.emit('tag', { midi: m, text: t('hint.tap_again', { note: this._name(m) }), kind: 'hint', ms: 0 });
    } else if (level === 2) {
      this.kb.setTargets(midis, { level: 'strong' });
      midis.forEach((x) => this.kb.keyElement(x)?.classList.add('fill'));
      this.emit('tag', { midi: m, text: stillHeld ? t('hint.tap_again', { note: this._name(m) }) : midis.length > 1 ? t('hint.chord_together') : this._noteHintText(m), kind: 'hint', ms: 0 });
    } else if (level === 3) {
      if (!this.mic) { const t0 = this.audio.now() + 0.02; midis.forEach((x) => this.audio.playNote(x, 0.7, { when: t0, velocity: 0.6 })); }
      this.emit('tag', { midi: m, text: t('hint.tap_here'), kind: 'pointer', ms: 0 });
    }
  }

  // ---------- recall (01 §4.8) ----------
  _step_recall(step, { auto }) {
    const t = this.o.t;
    const st = this._st();
    st.events = []; st.labelsHidden = true;
    const seq = eventsToNotes(step.notes);
    const groups = [];
    for (const n of seq) { const g = groups[groups.length - 1]; if (g && g.beat === n.beat) g.midis.push(n.midi); else groups.push({ beat: n.beat, midis: [n.midi] }); }
    this._stepRange(seq.map((n) => n.midi));
    this.emit('lane', { show: false });
    this.emit('labels', { hidden: true });
    let i = 0;
    const chips = () => this.emit('chips', { names: groups.map((g) => g.midis.map((m) => this._name(m)).join('+')), letters: groups.map((g) => describe(g.midis[0]).letter), index: i });
    const startTarget = () => {
      chips();
      if (i >= groups.length) { this._ladderStop(); this.emit('chips', null); this._phraseEnd(step, st.events); return; }
      const ms = groups[i].midis;
      const vis = (pc) => this.kb.visibleNotes((x) => pitchClass(x) === pc);
      const targetKey = () => { const c = vis(pitchClass(ms[0])); return c.sort((a, b) => Math.abs(a - ms[0]) - Math.abs(b - ms[0]))[0] ?? ms[0]; };
      this._ladderStart('recall', (L) => this._playHint(L, [targetKey()], step, false), this._carry ? 1 : 0);
    };
    const begin = () => { this.emit('cardhide'); this.emit('bar', { text: this.o.tx(step.bar), kind: 'step' }); this._state = 'ACTIVE'; startTarget(); };
    this._onNote = (m) => {
      if (this._state !== 'ACTIVE' || i >= groups.length) return;
      const want = groups[i].midis;
      if (want.some((w) => pitchClass(w) === pitchClass(m))) {
        const r = this._ladderResult();
        st.events.push({ ...r, letters: [describe(m).letter] });
        this.log.event('note_accepted', { lesson: this.lesson.id, stepId: step.id, index: i, note: describe(m).ascii, hint: r.hint, wrongsBefore: r.wrongs, labelsHidden: st.labelsHidden });
        this.kb.flash(m, 'correct'); this.kb.clearTargets(); this.kb.setForcedLabels([]);
        this.emit('tagsclear');
        if (i === 0) this.emit('bar', { text: '', kind: 'hide' });
        i++; startTarget();
      } else {
        const tg = this.kb.visibleNotes((x) => pitchClass(x) === pitchClass(want[0])).sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0] ?? want[0];
        this._wrong(m, tg); this._ladderWrong();
      }
    };
    this._actions = {
      start: begin,
      skipnote: () => { const r = this._ladderResult(true); st.events.push({ ...r, letters: [describe(groups[i].midis[0]).letter] }); i++; startTarget(); },
      hint: () => this._ladderSet((this._ladder?.level || 0) + 1, 'request'),
    };
    if (auto) begin();
    else this.emit('card', { eyebrow: t('step.eyebrow', { n: this.index + 1, total: this.total }), text: this.o.tx(step.card), buttons: [{ id: 'start', label: t('step.start'), primary: true }] });
    return () => { this.emit('labels', { hidden: false }); this.emit('chips', null); };
  }

  // ---------- phrase end (01 §9.4) ----------
  _phraseEnd(step, events) {
    const t = this.o.t;
    this._state = 'PHRASE_END';
    this._ladderStop();
    const helped = events.filter((e) => e.hint >= 2 || e.wrongs > 0);
    const count = {};
    helped.forEach((e) => e.letters.forEach((l) => { count[l] = (count[l] || 0) + 1; }));
    const tricky = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    const phrase = this.o.tx(step.phrase) || this.o.tx(step.bar);
    const struggle = helped.length >= 4;
    const headline = struggle ? t('phrase.struggle', { note: this._name(tricky || 'C') }) : t('phrase.clean', { phrase });
    const nextStep = this.lesson.steps[this.index + 1];
    const line = helped.length && !struggle ? t('phrase.some_help', { note: this._name(tricky) })
      : struggle ? t('phrase.try_slower')
      : nextStep ? t('phrase.up_next', { line: this.o.tx(nextStep.bar || nextStep.card) }) : t('phrase.last');
    const buttons = [];
    if (struggle) buttons.push({ id: 'slower', label: t('phrase.again_slower') });
    buttons.push({ id: 'again', label: t('phrase.again') }, { id: 'next', label: t('phrase.next'), primary: true });
    this.emit('phraseend', { headline, line, buttons, hear: step.type === 'play' });
    const choose = (c) => { this.log.event('phrase_choice', { lesson: this.lesson.id, stepId: step.id, choice: c, helped: helped.length }); };
    this._actions = {
      again: () => { choose('again'); this._enter(this.index, { auto: true }); },
      slower: () => { choose('slower'); this.o.speed = 0.75; this.emit('speed', { speed: 0.75 }); this._enter(this.index, { auto: true }); },
      next: () => { choose('next'); this._done({ auto: !!nextStep && nextStep.type !== 'find' && nextStep.type !== 'chord-find' }); },
      hear: () => { this.emit('phraseendhide'); this._demo(step, { onEnd: () => this._phraseEnd(step, events) }); },
    };
  }

  // ---------- completion (01 §9.5) ----------
  _rule(r) {
    if (!r) return false;
    if (r.all) return r.all.every((x) => this._rule(x));
    if (r.any) return r.any.some((x) => this._rule(x));
    if (r.stepDone) { const s = this.stats[r.stepDone]; return !!s && s.done && !s.skipped; }
    if (r.prompt) {
      const s = this.stats[r.prompt]; if (!s) return false;
      const ps = s.prompts.filter(Boolean);
      const p = r.n === 'last' ? ps[ps.length - 1] : (s.prompts[r.n - 1] || ps[ps.length - 1]);
      return !!p && !p.skipped && p.hint <= (r.maxHint ?? 0) && (!r.noWrong || p.wrongs === 0);
    }
    if (r.share) {
      const s = this.stats[r.share]; if (!s || !s.events.length) return false;
      if (r.labelsHidden && !s.labelsHidden) return false;
      const ok = s.events.filter((e) => !e.skipped && e.hint <= (r.maxHint ?? 0) && e.wrongs === 0).length;
      return ok / s.events.length >= (r.min ?? 1);
    }
    return false;
  }

  _finish() {
    this.finished = true;
    this._offs.forEach((f) => f());
    const L = this.lesson;
    const cards = [];
    for (const c of L.canNow || []) {
      if (this._rule(c.earnedIf)) cards.push({ id: c.id, kind: 'can', text: this.o.tx(c.text) });
      else if (c.fallback && this._rule(c.fallbackIf)) cards.push({ id: c.id, kind: 'can', text: this.o.tx(c.fallback), fallback: true });
      else if (!c.optional && c.almost) cards.push({ id: c.id, kind: 'almost', text: this.o.t('done.almost', { skill: this.o.tx(c.almost) }), practise: c.practise });
    }
    // found without help: recognise-level find prompts + recall events
    const occ = {};
    for (const step of L.steps) {
      const s = this.stats[step.id]; if (!s) continue;
      if (step.type === 'find') s.prompts.forEach((p, i) => { if (!p) return; if ((step.prompts[i]?.guidance || 'recognise') !== 'recognise') return; (occ[p.target] ||= []).push(!p.skipped && p.hint === 0 && p.wrongs === 0); });
      if (step.type === 'recall') s.events.forEach((e) => e.letters.forEach((l) => (occ[l] ||= []).push(!e.skipped && e.hint === 0 && e.wrongs === 0)));
    }
    const own = [], help = [];
    for (const [l, arr] of Object.entries(occ)) { const k = arr.filter(Boolean).length; (k >= 1 && k >= arr.length / 2 ? own : help).push(l); }
    const order = 'CDEFGAB';
    own.sort((a, b) => order.indexOf(a) - order.indexOf(b)); help.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const summary = {
      lessonId: L.id, headline: this.o.tx(L.headline), song: L.song ? { id: L.song.id, title: this.o.tx(L.song.title) } : null,
      cards, foundOwn: own, withHint: help, recording: this.recording || null,
      durationMs: Math.round(performance.now() - this.t0),
    };
    this.log.event('lesson_complete', { lesson: L.id, ms: summary.durationMs, earned: cards.filter((c) => c.kind === 'can').map((c) => c.id).join(' '), almost: cards.filter((c) => c.kind === 'almost').map((c) => c.id).join(' ') });
    this.emit('complete', summary);
  }
}
