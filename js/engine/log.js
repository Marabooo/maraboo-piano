// Anonymous, local-only logging. Nothing is ever sent anywhere by this module.
//
// 1) Event log (detailed, for the in-app test mode): log.event(type, data)
//      → { t: ms since this app session started, at: ISO time, s: random session id, type, ...data }
//    Kept in memory and in localStorage (ring buffer, last MAX_EVENTS). log.subscribe(fn), log.events(),
//    log.exportJSON(), log.exportCSV(), log.clearEvents().
//
// 2) Usage log (small aggregate, survives for weeks; for the multi-day study):
//    days the app was opened (dates only), lessons started/finished, furthest step reached,
//    completion choices (next lesson / done for now / play again), retries after mistakes,
//    hints shown, daily game played. Updated automatically from events.
//    log.usage() → object; log.usageSummary() → short plain-text summary for "copy & send".
//
// No names, no device ids, no audio. Dates are local calendar dates (YYYY-MM-DD).

const EVENTS_KEY = 'klang.events.v1';
const USAGE_KEY = 'klang.usage.v1';
const MAX_EVENTS = 4000;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

const emptyUsage = () => ({
  v: 1,
  firstOpened: today(),
  daysOpened: [],          // ['2026-11-25', …]
  sessions: 0,
  lessons: {},             // id -> { started, finished, furthestStep, steps, lastStarted, lastFinished, replays }
  completionChoices: [],   // { lesson, choice: 'next'|'done'|'again', ms, date, variant }
  mistakes: 0,             // wrong notes played
  fixedNextPress: 0,       // a wrong note followed by the right one on the next press
  retriesAfterMistake: 0,  // step/phrase/lesson started again after a mistake in it
  hintsShown: 0,
  hintsByLevel: {},
  game: { plays: 0, days: [] },
  freePlay: { sessions: 0, days: [] },
  abandoned: [],           // { lesson, step, date, afterMistake }
});

class Log {
  constructor() {
    this.session = Math.random().toString(36).slice(2, 10);
    this.t0 = performance.now();
    this._events = load(EVENTS_KEY, []);
    this._u = load(USAGE_KEY, null) || emptyUsage();
    this._subs = new Set();
    this._lastWrong = null;
    this._dirtyEvents = false;
    this._flushT = 0;
    this.event('app_open', { day: today(), ua: uaClass(), standalone: isStandalone() });
    this._u.sessions++;
    this._addDay(this._u.daysOpened);
    this._saveUsage();
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { this.event('app_hidden', { inLesson: location.hash.startsWith('#/play') }); this.flush(); }
      else { this.event('app_visible'); this._addDay(this._u.daysOpened); this._saveUsage(); }
    });
  }

  /** Record an event. data must not contain personal information. */
  event(type, data = {}) {
    const e = { t: Math.round(performance.now() - this.t0), at: new Date().toISOString(), s: this.session, ...data, type };
    this._events.push(e);
    if (this._events.length > MAX_EVENTS) this._events.splice(0, this._events.length - MAX_EVENTS);
    this._dirtyEvents = true;
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this.flush(), 1500);
    this._aggregate(e);
    for (const fn of this._subs) { try { fn(e); } catch (err) { console.error(err); } }
    return e;
  }

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  events(filter) { return filter ? this._events.filter(filter) : [...this._events]; }
  flush() { if (this._dirtyEvents) { save(EVENTS_KEY, this._events); this._dirtyEvents = false; } }
  clearEvents() { this._events = []; save(EVENTS_KEY, []); }

  exportJSON() { return JSON.stringify({ exported: new Date().toISOString(), usage: this._u, events: this._events }, null, 1); }
  exportCSV() {
    const keys = ['at', 't', 's', 'type'];
    const extra = new Set();
    for (const e of this._events) Object.keys(e).forEach((k) => { if (!keys.includes(k)) extra.add(k); });
    const cols = [...keys, ...extra];
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(typeof v === 'object' ? JSON.stringify(v) : v));
    return [cols.join(','), ...this._events.map((e) => cols.map((c) => esc(e[c])).join(','))].join('\n');
  }

  // ---------- usage aggregate ----------
  usage() { return JSON.parse(JSON.stringify(this._u)); }
  resetUsage() { this._u = emptyUsage(); this._addDay(this._u.daysOpened); this._saveUsage(); }

  _addDay(list) { const d = today(); if (!list.includes(d)) list.push(d); }
  _lesson(id) {
    return (this._u.lessons[id] ||= { started: 0, finished: 0, furthestStep: 0, steps: 0, replays: 0, lastStarted: null, lastFinished: null });
  }
  _saveUsage() { save(USAGE_KEY, this._u); }

  /** Per-day activity order → return-day class: lesson-led | game-then-lesson | game-only. */
  _activity(kind) {
    const d = today();
    const a = ((this._u.dayActivity ||= {})[d] ||= { first: kind, lesson: false, game: false });
    a[kind] = true;
  }
  dayClasses() {
    const out = {};
    for (const [d, a] of Object.entries(this._u.dayActivity || {})) {
      out[d] = a.first === 'lesson' ? 'lesson-led' : a.lesson ? 'game-then-lesson' : a.game ? 'game-only' : 'opened-only';
    }
    for (const d of this._u.daysOpened) if (!out[d]) out[d] = 'opened-only';
    return out;
  }

  _aggregate(e) {
    const u = this._u;
    let changed = true;
    switch (e.type) {
      case 'lesson_start': {
        this._activity('lesson');
        const L = this._lesson(e.lesson);
        L.started++; L.lastStarted = today(); L.steps = e.steps ?? L.steps;
        if (e.replay) L.replays++;
        this._mistakeInRun = false;
        break;
      }
      case 'step_start': {
        const L = this._lesson(e.lesson);
        L.furthestStep = Math.max(L.furthestStep, (e.index ?? 0) + 1);
        if (e.retry && this._mistakeInRun) u.retriesAfterMistake++;
        break;
      }
      case 'lesson_complete': { const L = this._lesson(e.lesson); L.finished++; L.lastFinished = today(); break; }
      case 'lesson_abandon': u.abandoned.push({ lesson: e.lesson, step: e.step, date: today(), afterMistake: !!e.afterMistake }); if (u.abandoned.length > 200) u.abandoned.shift(); break;
      case 'done_choice':
        u.completionChoices.push({ lesson: e.lesson, choice: e.choice, ms: e.ms, date: today(), variant: e.variant });
        if (e.choice === 'again' && this._mistakeInRun) u.retriesAfterMistake++;
        break;
      case 'wrong': case 'near_miss': u.mistakes++; this._lastWrong = e; this._mistakeInRun = true; this._stepMistake = true; break;
      case 'note_accepted':
        if (this._lastWrong) u.fixedNextPress++;  // the press right after a wrong one was correct
        this._lastWrong = null;
        break;
      case 'phrase_choice': if ((e.choice === 'again' || e.choice === 'slower') && this._stepMistake) u.retriesAfterMistake++; this._stepMistake = false; break;
      case 'step_restart': if (this._stepMistake) u.retriesAfterMistake++; this._stepMistake = false; break;
      case 'hint': if (e.level >= 1 && e.level <= 3) { u.hintsShown++; u.hintsByLevel[e.level] = (u.hintsByLevel[e.level] || 0) + 1; } break;
      case 'game_played': case 'daily_solved': if (e.type === 'game_played') { u.game.plays++; this._addDay(u.game.days); } this._activity('game'); break;
      case 'daily_open': case 'game_opened': this._activity('game'); break;
      case 'game_solved': if (e.n != null) this._addDay(u.game.solvedDays ||= []); this._activity('game'); break;
      case 'freeplay_start': u.freePlay.sessions++; this._addDay(u.freePlay.days); break;
      default: changed = false;
    }
    if (changed) this._saveUsage();
  }

  /** Short, human-readable summary for the participant to copy and send (no personal data). */
  usageSummary({ title = 'Klang usage summary (anonymous)' } = {}) {
    const u = this._u;
    const fmt = (d) => { const [y, m, day] = d.split('-'); return `${Number(day)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`; };
    const lines = [title, `Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, ''];
    lines.push(`Days opened: ${u.daysOpened.length} (${u.daysOpened.map(fmt).join(', ')})`);
    const dc = this.dayClasses();
    lines.push('Each day: ' + Object.keys(dc).sort().map((d) => `${fmt(d)} ${dc[d]}`).join('; '));
    lines.push(`App sessions: ${u.sessions}`);
    const ids = Object.keys(u.lessons);
    if (ids.length) {
      lines.push('Lessons:');
      for (const id of ids) {
        const L = u.lessons[id];
        lines.push(`  ${id}: started ${L.started}×, finished ${L.finished}×, furthest step ${L.furthestStep}/${L.steps || '?'}${L.replays ? `, replays ${L.replays}` : ''}`);
      }
    } else lines.push('Lessons: none started');
    const ch = u.completionChoices;
    if (ch.length) {
      const c = (k) => ch.filter((x) => x.choice === k).length;
      lines.push(`Completion choices: next lesson ${c('next')}, done for now ${c('done')}, play again ${c('again')}`);
      lines.push('  ' + ch.map((x) => `${fmt(x.date)} ${x.lesson}→${x.choice}${x.variant ? `[${x.variant}]` : ''} (${Math.round(x.ms / 100) / 10}s)`).join('; '));
    }
    lines.push(`Wrong notes: ${u.mistakes} (fixed on the next press: ${u.fixedNextPress})`);
    lines.push(`Retries after a mistake: ${u.retriesAfterMistake}`);
    lines.push(`Hints shown: ${u.hintsShown}${Object.keys(u.hintsByLevel).length ? ' (' + Object.entries(u.hintsByLevel).map(([k, v]) => `level ${k}: ${v}`).join(', ') + ')' : ''}`);
    if (u.abandoned.length) lines.push(`Left a lesson before the end: ${u.abandoned.length}× (${u.abandoned.filter((a) => a.afterMistake).length} right after a mistake)`);
    lines.push(`Daily game: played ${u.game.plays}× on ${u.game.days.length} day(s)${u.game.days.length ? ' (' + u.game.days.map(fmt).join(', ') + ')' : ''}`);
    if (u.freePlay.sessions) lines.push(`Free play: ${u.freePlay.sessions}× on ${u.freePlay.days.length} day(s)`);
    return lines.join('\n');
  }
}

function uaClass() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'other';
  const br = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'other';
  return `${os}/${br}`;
}
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export const log = new Log();
export { today };
