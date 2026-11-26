// v2 (26 Nov): the classic pop progression Am F C G. Shapes chosen so the hand barely moves.
// Klang plays an original tune on top (no copyrighted melody).
import { CH } from './shared.js';
const at = (ch, b, d) => [ch[0], ch[1], b, d];
const loop = [CH.Am3, CH.Fpop, CH.Cpop, CH.G3];
export default {
  id: "L9",
  title:    { en: "Pop chords: {A}m {F} {C} {G}", ro: "Acorduri pop: {A}m {F} {C} {G}" },
  newSkill: { en: "Four chords used in many hit songs", ro: "Patru acorduri folosite în multe hituri" },
  tune:     { en: "Your own pop song", ro: "Propriul tău cântec pop" },
  minutes: 3, colour: "B", newNotes: [],
  range: { low: "F3", high: "C5" },
  steps: [
    { id: "L9S1", type: "chord-find",
      card: { en: "Four pop chords, close together.", ro: "Patru acorduri pop, apropiate." },
      prompts: [
        { target: CH.Am3,  glow: "targets", guidance: "show", bar: { en: "{A} minor chord", ro: "Acordul {A} minor" } },
        { target: CH.Fpop, glow: "targets", guidance: "show", bar: { en: "{F} chord", ro: "Acordul {F}" } },
        { target: CH.Cpop, glow: "targets", guidance: "show", bar: { en: "{C} chord", ro: "Acordul {C}" } },
        { target: CH.G3,   glow: "targets", guidance: "show", bar: { en: "{G} chord", ro: "Acordul {G}" } },
      ],
      recap: { en: "you found the four pop chords", ro: "ai găsit cele patru acorduri pop" } },
    { id: "L9S2", type: "play", tempo: 80, follow: "steady", guidance: { default: "recognise", first: 4 }, record: "withApp",
      card: { en: "Klang sings the tune. You play the four chords, twice.", ro: "Klang cântă melodia. Tu cânți cele patru acorduri, de două ori." },
      bar:  { en: "Chords: {A}m, {F}, {C}, {G}", ro: "Acorduri: {A}m, {F}, {C}, {G}" },
      phrase: { en: "your pop song", ro: "cântecul tău pop" },
      notes: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(loop[i % 4], i * 4, 4)),
      app: { melody: { tune: "pop", bars: [1, 8] } } },
  ],
  headline: { en: "You played the chords of a pop song.", ro: "Ai cântat acordurile unui cântec pop." },
  song: { id: "pop4", title: { en: "Pop song (Am F C G)", ro: "Cântec pop (Am F C G)" } },
  canNow: [
    { id: "L9.four", text: { en: "I can play {A}m, {F}, {C} and {G}.", ro: "Pot cânta {A}m, {F}, {C} și {G}." }, earnedIf: { stepDone: "L9S1" } },
    { id: "L9.song", text: { en: "I played a whole pop song with chords.", ro: "Am cântat un cântec pop întreg cu acorduri." }, earnedIf: { stepDone: "L9S2" } },
  ],
  next: "L10",
};
