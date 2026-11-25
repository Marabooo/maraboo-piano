// Note helpers shared by every engine module.
// MIDI numbers are the internal currency: C4 (middle C) = 60, A4 = 69.

const LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];
const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// THE shared note-colour map (design/03 §2). main.js copies it to CSS variables --n-C … --n-B and
// --n-C-deep …, which the keyboard CSS and the daily game (css/game.css) read. Change colours here only.
// C deviates from 03 (#FF6B6B → rose pink): a red C target read as "wrong" in the lead's check
// (F06: no alarming red). Pink keeps the rainbow order B violet → C pink → D orange.
export const NOTE_COLORS = {
  C: '#FF7AC6', D: '#FF9F45', E: '#FFD84D', F: '#8FD86A', G: '#3FD1C2', A: '#6CB4FF', B: '#B79BFF',
};
export const NOTE_DEEP = {
  C: '#A3206E', D: '#A85A0C', E: '#8A6D00', F: '#3F7F22', G: '#0F766B', A: '#2563B8', B: '#6542C9',
};
/** Write the map to :root CSS variables (call once at boot). */
export function applyNoteColorVars(el = document.documentElement) {
  for (const k of Object.keys(NOTE_COLORS)) { el.style.setProperty(`--n-${k}`, NOTE_COLORS[k]); el.style.setProperty(`--n-${k}-deep`, NOTE_DEEP[k]); }
}

export const isBlack = (midi) => SHARP[((midi % 12) + 12) % 12];
export const pitchClass = (midi) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;
export const letterOf = (midi) => LETTERS[pitchClass(midi)];

/** Parse 'C4', 'C#4', 'Db4', 'c4' → MIDI number. Also accepts a number. */
export function toMidi(note) {
  if (typeof note === 'number') return note;
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(String(note).trim());
  if (!m) throw new Error(`Bad note name: ${note}`);
  let pc = LETTER_PC[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

/** Is this a bare pitch-class name like 'C', 'F#'? (no octave) */
export const isPitchClassName = (s) => typeof s === 'string' && /^[A-Ga-g][#♯b♭]?$/.test(s.trim());

export function pcOfName(s) {
  const m = /^([A-Ga-g])([#♯b♭]?)$/.exec(s.trim());
  let pc = LETTER_PC[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return (pc + 12) % 12;
}

/** Full description of a MIDI note for labels. */
export function describe(midi) {
  const pc = pitchClass(midi);
  const letter = LETTERS[pc];
  const sharp = SHARP[pc];
  return {
    midi,
    letter,                    // 'C'
    sharp,                     // true for black keys
    octave: octaveOf(midi),    // 4 for middle C
    name: letter + (sharp ? '♯' : '') + octaveOf(midi), // 'C♯4'
    ascii: letter + (sharp ? '#' : '') + octaveOf(midi), // 'C#4'
    solfege: SOLFEGE[letter] + (sharp ? '♯' : ''),       // 'Do♯'
    color: NOTE_COLORS[letter],
    deep: NOTE_DEEP[letter],
  };
}

/** Text label for a note in a label mode: 'letters' | 'solfege' | 'off'. */
export function labelFor(midi, mode, { withOctave = false } = {}) {
  const d = describe(midi);
  if (mode === 'solfege') return d.solfege;
  if (mode === 'letters') return d.letter + (d.sharp ? '♯' : '') + (withOctave ? d.octave : '');
  return '';
}

/** Frequency in Hz (A4 = 440). */
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const freqToMidiFloat = (f) => 69 + 12 * Math.log2(f / 440);

/** White-key index counted from C-1 (MIDI 0). Black keys return the index of the white key to their left + 0.5 */
export function whiteIndex(midi) {
  const oct = Math.floor(midi / 12);
  const pc = pitchClass(midi);
  const W = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  return oct * 7 + W[pc];
}

/** MIDI number of the n-th white key (inverse of whiteIndex for integers). */
export function whiteToMidi(index) {
  const oct = Math.floor(index / 7);
  const W2PC = [0, 2, 4, 5, 7, 9, 11];
  return oct * 12 + W2PC[((index % 7) + 7) % 7];
}

/** Count white keys in [lo, hi] inclusive. */
export function whiteCountBetween(lo, hi) {
  let n = 0;
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) n++;
  return n;
}

/** Plain-language relation between a played note and a target ("one key to the left"). */
export function relation(played, target) {
  const diff = target - played; // >0: target is to the right (higher)
  if (diff === 0) return 'same';
  const dir = diff > 0 ? 'right' : 'left';
  const octaves = Math.abs(diff) / 12;
  if (Number.isInteger(octaves)) return octaves === 1 ? `same letter, one step further ${dir}` : `same letter, further ${dir}`;
  // count white keys between for white→white moves; otherwise count keys (semitones)
  const steps = Math.abs(diff);
  if (!isBlack(played) && !isBlack(target)) {
    const w = Math.abs(whiteIndex(target) - whiteIndex(played));
    return w === 1 ? `one white key to the ${dir}` : `${w} white keys to the ${dir}`;
  }
  return steps === 1 ? `one key to the ${dir}` : `${steps} keys to the ${dir}`;
}
