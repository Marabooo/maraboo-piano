// Lesson catalogue. Lesson content is copied from design/02_lesson_curriculum.md into L1.js … L6.js
// and shared.js (TUNES, PADS, CH, NOTE_HINT, PATTERN_HINT). To add a lesson: create LN.js in the same
// format, import it here, add it to LESSONS (path order) and to PRECACHE in sw.js.
import { TUNES, PADS, NOTE_HINT, PATTERN_HINT, bars } from './shared.js';
import L1 from './L1.js';
import L2 from './L2.js';
import L3 from './L3.js';
import L4 from './L4.js';
import L5 from './L5.js';
import L6 from './L6.js';

/** Resolve { tune, bars: [a, b] } references into plain event arrays (notes, pads, app melody). */
function resolve(spec, table) {
  if (!spec) return null;
  if (Array.isArray(spec)) return spec;
  const src = table[spec.tune];
  if (!src) throw new Error(`Unknown tune ${spec.tune}`);
  return spec.bars ? bars(src, spec.bars[0], spec.bars[1]) : src;
}
function prepare(lesson, number) {
  // "L6S4.notes" → that step's notes (clipped to the app melody's length when there is one)
  const raw = lesson.steps.map((s) => {
    if (typeof s.notes !== 'string') return s;
    const [id, field] = s.notes.split('.');
    const src = lesson.steps.find((x) => x.id === id)?.[field];
    let notes = resolve(src, TUNES);
    const mel = resolve(s.app?.melody, TUNES);
    if (mel) { const end = Math.max(...mel.map((e) => e[2] + e[3])); notes = notes.filter((e) => e[2] < end); }
    return { ...s, notes };
  });
  const steps = raw.map((s) => ({
    ...s,
    notes: resolve(s.notes, TUNES),
    pad: resolve(s.pad, PADS),
    app: s.app ? { ...s.app, melody: resolve(s.app.melody, TUNES) } : undefined,
  }));
  return { ...lesson, number, steps, section: lesson.section || ([3, 6].includes(number) ? 'chords' : 'notes') };
}

export const LESSONS = [L1, L2, L3, L4, L5, L6].map((l, i) => prepare(l, i + 1));
/** Planned lessons shown as "Coming soon" stones (02 §2). */
export const COMING = [
  { number: 7, title: { en: 'Same notes, other places', ro: 'Aceleași note, în alte locuri' }, section: 'moving' },
  { number: 8, title: { en: 'Three chords: {F} joins', ro: 'Trei acorduri: vine și {F}' }, section: 'chords' },
  { number: 9, title: { en: 'Your first black key', ro: 'Prima ta clapă neagră' }, section: 'moving' },
  { number: 10, title: { en: 'Both hands', ro: 'Cu ambele mâini' }, section: 'hands' },
];
export { NOTE_HINT, PATTERN_HINT };
export const lessonById = (id) => LESSONS.find((l) => l.id === id) || null;
export const nextLesson = (id) => { const i = LESSONS.findIndex((l) => l.id === id); return i >= 0 ? LESSONS[i + 1] || null : null; };
