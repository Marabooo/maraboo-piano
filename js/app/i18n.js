// Language + note-name rendering.
// Language: ?lang=en|ro, else saved setting, else English (student decision 25 Nov; overrides 01 §2.1).
// Key-name default stays Letters for everyone (lead decision for test task T2; the spec's
// "Do Re Mi for Romanian UI" default is deliberately NOT applied — see ARCHITECTURE.md).
import { STRINGS } from './strings.js';
import { describe, pitchClass } from '../engine/notes.js';
import { store } from './store.js';
import { wrapNote } from './notemark.js';
import { log } from '../engine/log.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SOLF = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export function lang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'ro') return q;
  if (store.settings.lang) return store.settings.lang;
  // Student decision (25 Nov): English by default for everyone; Romanian via Settings or ?lang=ro.
  return 'en';
}

/** Switch UI language (home flag button or Settings). Test mode hears 'klang:lang' and records the
 *  switch; a ?lang= in the address would override the choice, so it is removed before reloading. */
export function setLang(l, from = 'settings') {
  if (l !== 'en' && l !== 'ro') return;
  const prev = lang();
  window.dispatchEvent(new CustomEvent('klang:lang', { detail: { to: l, from: prev, via: from } }));
  log.event('lang_change', { to: l, from: prev, via: from });
  store.set('lang', l);
  const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(history.state, '', u);
  location.reload();
}

/** Naming system used in text: the label mode, or the last naming system when labels are off. */
export function naming() {
  const s = store.settings;
  if (s.labels === 'solfege') return 'solfege';
  if (s.labels === 'letters') return 'letters';
  return s.lastNaming || 'letters';
}

/** Name of a note letter ('C') or MIDI number in the current naming system. */
export function noteName(x, mode = naming()) {
  if (typeof x === 'number') {
    const d = describe(x);
    return mode === 'solfege' ? d.solfege : d.letter + (d.sharp ? '♯' : '');
  }
  return mode === 'solfege' ? (SOLF[x[0]] || x) + x.slice(1) : x;
}

/** Note name wrapped in highlight markers (see notemark.js); use for names shown in UI text. */
export function markNote(x, mode = naming()) {
  const letter = typeof x === 'number' ? describe(x).letter : String(x)[0];
  return wrapNote(noteName(x, mode), letter);
}

/** Fill {C}… note tokens (highlighted) and {var} tokens. */
export function fill(str, vars = {}) {
  return String(str).replace(/\{([A-Za-z_]+)\}/g, (m, k) => {
    if (k in vars) return vars[k];
    if (LETTERS.includes(k)) return markNote(k);
    return m;
  });
}

/** UI string by id. */
export function t(id, vars) {
  const e = STRINGS[id];
  if (!e) return id;
  return fill(lang() === 'ro' ? e[1] || e[0] : e[0], vars);
}

/** Lesson text object {en, ro} → string. */
export function tx(obj, vars) {
  if (obj == null) return '';
  if (typeof obj === 'string') return fill(obj, vars);
  return fill(obj[lang()] || obj.en || '', vars);
}

export { pitchClass };

/** Text of a saved "I can" / "Almost" card in the CURRENT language. Cards are saved with the text of
 *  the language used at completion; rebuild it from the lesson by card id (fallback: saved text). */
export function cardText(lesson, c) {
  const src = lesson?.canNow?.find((x) => x.id === c.id);
  if (!src) return c.text;
  if (c.kind === 'almost') return src.almost ? t('done.almost', { skill: tx(src.almost) }) : c.text;
  return tx(c.fallback ? src.fallback : src.text) || c.text;
}

/** Title of a saved song in the current language (saved title as fallback). */
export function songTitle(lesson, saved) { return lesson?.song?.title ? tx(lesson.song.title) : saved; }
