// v2 (26 Nov, student request): Back to Black (Amy Winehouse): chords only ({D}m, {G}m, {B}♭, {A}), shapes chosen so the hand barely moves.
// Klang plays a bass line under your chords (the song's chords are used; the vocal melody is not reproduced).
const C = { Dm: [["D4","F4","A4"],[62,65,69],"{D}m"], Gm: [["D4","G4","B♭4"],[62,67,70],"{G}m"], Bb: [["D4","F4","B♭4"],[62,65,70],"{B}♭"], A: [["C♯4","E4","A4"],[61,64,69],"{A}"] };
const order = ["Dm", "Gm", "Bb", "A"];
const at = (k, b, d) => [C[k][0], C[k][1], b, d];
const bass = [["D2",38],["G2",43],["B♭2",46],["A2",45]];
export default {
  id: "L10",
  title:    { en: "Back to Black", ro: "Back to Black" },
  newSkill: { en: "{D}m, {G}m, {B}♭, {A}", ro: "{D}m, {G}m, {B}♭, {A}" },
  tune:     { en: "Back to Black", ro: "Back to Black" },
  minutes: 3, colour: "D", newNotes: [],
  range: { low: "A3", high: "C5" },
  steps: [
    { id: "L10S1", type: "chord-find",
      card: { en: "Four chords. Your thumb stays on {D}.", ro: "Patru acorduri. Degetul mare rămâne pe {D}." },
      prompts: order.map((k) => ({ target: C[k], glow: "targets", guidance: "show", bar: { en: C[k][2] + " chord", ro: "Acordul " + C[k][2] } })),
      recap: { en: "you found the four chords", ro: "ai găsit cele patru acorduri" } },
    { id: "L10S2", type: "play", tempo: 72, follow: "steady", guidance: { default: "recognise", first: 4 }, record: "withApp",
      card: { en: "Klang plays the bass. You play the four chords, twice.", ro: "Klang cântă basul. Tu cânți cele patru acorduri, de două ori." },
      bar:  { en: "Chords: {D}m, {G}m, {B}♭, {A}", ro: "Acorduri: {D}m, {G}m, {B}♭, {A}" },
      phrase: { en: "Back to Black", ro: "Back to Black" },
      notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(order[i % 4], i * 4, 4)),
      app: { melody: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[bass[i % 4][0], bass[i % 4][1], i * 4, 2], [bass[i % 4][0], bass[i % 4][1], i * 4 + 2, 2]]) } },
  ],
  headline: { en: "You played the chords of Back to Black.", ro: "Ai cântat acordurile din Back to Black." },
  song: { id: "back-to-black", title: { en: "Back to Black (chords)", ro: "Back to Black (acorduri)" } },
  canNow: [
    { id: "L10.chords", text: { en: "I can play {D}m, {G}m, {B}♭, {A}.", ro: "Pot cânta {D}m, {G}m, {B}♭, {A}." }, earnedIf: { stepDone: "L10S1" } },
    { id: "L10.song", text: { en: "I played Back to Black with chords.", ro: "Am cântat Back to Black cu acorduri." }, earnedIf: { stepDone: "L10S2" } },
  ],
  next: "L11",
};
