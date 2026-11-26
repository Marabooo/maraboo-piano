// v2 (26 Nov, student request): Still Loving You (Scorpions): the intro/solo loop, played as Am G F E
// (same falling pattern as the original, moved to white keys). Klang plays the bass; no vocal melody.
const C = { Am: [["A3","C4","E4"],[57,60,64],"{A}m"], G: [["G3","B3","D4"],[55,59,62],"{G}"], F: [["F3","A3","C4"],[53,57,60],"{F}"], E: [["E3","G♯3","B3"],[52,56,59],"{E}"] };
const order = ["Am", "G", "F", "E"];
const at = (k, b, d) => [C[k][0], C[k][1], b, d];
const bass = [["A2",45],["G2",43],["F2",41],["E2",40]];
export default {
  id: "L12",
  title:    { en: "Still Loving You", ro: "Still Loving You" },
  newSkill: { en: "{A}m, {G}, {F}, {E}", ro: "{A}m, {G}, {F}, {E}" },
  tune:     { en: "Still Loving You", ro: "Still Loving You" },
  minutes: 3, colour: "F", newNotes: [],
  range: { low: "D3", high: "G4" },
  steps: [
    { id: "L12S1", type: "chord-find",
      card: { en: "Same shape, one key down each time.", ro: "Aceeași formă, câte o clapă mai jos de fiecare dată." },
      prompts: order.map((k) => ({ target: C[k], glow: "targets", guidance: "show", bar: { en: C[k][2] + " chord", ro: "Acordul " + C[k][2] } })),
      recap: { en: "you found the four chords", ro: "ai găsit cele patru acorduri" } },
    { id: "L12S2", type: "play", tempo: 60, follow: "steady", guidance: { default: "recognise", first: 4 }, record: "withApp",
      card: { en: "Klang plays along. You play the four chords, twice.", ro: "Klang cântă cu tine. Tu cânți cele patru acorduri, de două ori." },
      bar:  { en: "Chords: {A}m, {G}, {F}, {E}", ro: "Acorduri: {A}m, {G}, {F}, {E}" },
      phrase: { en: "Still Loving You", ro: "Still Loving You" },
      notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(order[i % 4], i * 4, 4)),
      // Klang: bass + a picked broken-chord pattern an octave above your chord (the intro's feel, not the solo)
      app: { melody: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => { const ch = C[order[i % 4]][1].map((m) => m + 12); const pat = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[2], ch[0] + 12];
        return [[bass[i % 4][0], bass[i % 4][1], i * 4, 4], ...pat.map((m, k) => ['', m, i * 4 + k * 0.5, 0.5])]; }) } },
  ],
  headline: { en: "You played the chords of Still Loving You.", ro: "Ai cântat acordurile din Still Loving You." },
  song: { id: "still-loving-you", title: { en: "Still Loving You (chords)", ro: "Still Loving You (acorduri)" } },
  canNow: [
    { id: "L12.chords", text: { en: "I can play {A}m, {G}, {F}, {E}.", ro: "Pot cânta {A}m, {G}, {F}, {E}." }, earnedIf: { stepDone: "L12S1" } },
    { id: "L12.song", text: { en: "I played Still Loving You with chords.", ro: "Am cântat Still Loving You cu acorduri." }, earnedIf: { stepDone: "L12S2" } },
  ],
  next: null,
};
