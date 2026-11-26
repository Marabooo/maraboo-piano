// v2 (26 Nov, student request): Gangsta's Paradise (Coolio): chords only ({C}m, {A}♭, {F}m, {G}), shapes chosen so the hand barely moves.
// Klang plays a bass line under your chords (the song's chords are used; the vocal melody is not reproduced).
const C = { Cm: [["C4","E♭4","G4"],[60,63,67],"{C}m"], Ab: [["C4","E♭4","A♭4"],[60,63,68],"{A}♭"], Fm: [["C4","F4","A♭4"],[60,65,68],"{F}m"], G: [["B3","D4","G4"],[59,62,67],"{G}"] };
const order = ["Cm", "Ab", "Fm", "G"];
const at = (k, b, d) => [C[k][0], C[k][1], b, d];
const bass = [["C3",48],["A♭2",44],["F2",41],["G2",43]];
export default {
  id: "L11",
  title:    { en: "Gangsta's Paradise", ro: "Gangsta's Paradise" },
  newSkill: { en: "{C}m, {A}♭, {F}m, {G}", ro: "{C}m, {A}♭, {F}m, {G}" },
  tune:     { en: "Gangsta's Paradise", ro: "Gangsta's Paradise" },
  minutes: 3, colour: "G", newNotes: [],
  range: { low: "A3", high: "C5" },
  steps: [
    { id: "L11S1", type: "chord-find",
      card: { en: "Four dark chords. Your thumb stays on {C} for three.", ro: "Patru acorduri întunecate. Degetul mare rămâne pe {C} la trei." },
      prompts: order.map((k) => ({ target: C[k], glow: "targets", guidance: "show", bar: { en: C[k][2] + " chord", ro: "Acordul " + C[k][2] } })),
      recap: { en: "you found the four chords", ro: "ai găsit cele patru acorduri" } },
    { id: "L11S2", type: "play", tempo: 80, follow: "steady", guidance: { default: "recognise", first: 4 }, record: "withApp",
      card: { en: "Klang plays the bass. You play the four chords, twice.", ro: "Klang cântă basul. Tu cânți cele patru acorduri, de două ori." },
      bar:  { en: "Chords: {C}m, {A}♭, {F}m, {G}", ro: "Acorduri: {C}m, {A}♭, {F}m, {G}" },
      phrase: { en: "Gangsta's Paradise", ro: "Gangsta's Paradise" },
      notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(order[i % 4], i * 4, 4)),
      app: { melody: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[bass[i % 4][0], bass[i % 4][1], i * 4, 2], [bass[i % 4][0], bass[i % 4][1], i * 4 + 2, 2]]) } },
  ],
  headline: { en: "You played the chords of Gangsta's Paradise.", ro: "Ai cântat acordurile din Gangsta's Paradise." },
  song: { id: "gangstas-paradise", title: { en: "Gangsta's Paradise (chords)", ro: "Gangsta's Paradise (acorduri)" } },
  canNow: [
    { id: "L11.chords", text: { en: "I can play {C}m, {A}♭, {F}m, {G}.", ro: "Pot cânta {C}m, {A}♭, {F}m, {G}." }, earnedIf: { stepDone: "L11S1" } },
    { id: "L11.song", text: { en: "I played Gangsta's Paradise with chords.", ro: "Am cântat Gangsta's Paradise cu acorduri." }, earnedIf: { stepDone: "L11S2" } },
  ],
  next: null,
};
