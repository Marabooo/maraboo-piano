// Language + note-name rendering.
// Language: ?lang=en|ro, else saved setting, else English (student decision 25 Nov; overrides 01 §2.1).
// Key-name default stays Letters for everyone (lead decision for test task T2; the spec's
// "Do Re Mi for Romanian UI" default is deliberately NOT applied — see ARCHITECTURE.md).
import { STRINGS } from './strings.js';
import { describe, pitchClass } from '../engine/notes.js';
import { store } from './store.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SOLF = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export function lang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'ro') return q;
  if (store.settings.lang) return store.settings.lang;
  // Student decision (25 Nov): English by default for everyone; Romanian via Settings or ?lang=ro.
  return 'en';
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

/** Fill {C}… note tokens and {var} tokens. */
export function fill(str, vars = {}) {
  return String(str).replace(/\{([A-Za-z_]+)\}/g, (m, k) => {
    if (k in vars) return vars[k];
    if (LETTERS.includes(k)) return noteName(k);
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
