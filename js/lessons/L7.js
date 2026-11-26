// v2 (26 Nov, after Round 1): chords in any order (inversions). Short; ends with a song fast.
import { CH } from './shared.js';
const at = (ch, b, d) => [ch[0], ch[1], b, d];
export default {
  id: "L7",
  title:    { en: "One chord, many shapes", ro: "Un acord, mai multe forme" },
  newSkill: { en: "The same 3 notes in any order are the same chord", ro: "Aceleași 3 note, în orice ordine, sunt același acord" },
  tune:     { en: "Twinkle, Twinkle with three chords", ro: "Twinkle, Twinkle cu trei acorduri" },
  minutes: 3, colour: "E", newNotes: [],
  range: { low: "B3", high: "E5" },
  steps: [
    { id: "L7S1", type: "chord-find",
      card: { en: "A chord is 3 notes. The order does not matter: all of these are {C}.", ro: "Un acord are 3 note. Ordinea nu contează: toate astea sunt {C}." },
      prompts: [
        { target: CH.C4,  glow: "targets", guidance: "show", bar: { en: "{C} {E} {G}", ro: "{C} {E} {G}" } },
        { target: CH.C4b, glow: "targets", guidance: "show", bar: { en: "{E} {G} {C}: still {C}", ro: "{E} {G} {C}: tot {C}" } },
        { target: CH.C4c, glow: "targets", guidance: "show", bar: { en: "{G} {C} {E}: still {C}", ro: "{G} {C} {E}: tot {C}" } },
      ],
      recap: { en: "you played {C} in three shapes", ro: "ai cântat {C} în trei forme" } },
    { id: "L7S2", type: "chord-find",
      card: { en: "With other shapes, your hand hardly moves.", ro: "Cu alte forme, mâna aproape nu se mișcă." },
      prompts: [
        { target: CH.Fnear, glow: "targets", guidance: "show", bar: { en: "{F} chord: {C} {F} {A}", ro: "Acordul {F}: {C} {F} {A}" } },
        { target: CH.Gnear, glow: "targets", guidance: "show", bar: { en: "{G} chord: {B} {D} {G}", ro: "Acordul {G}: {B} {D} {G}" } },
        { target: CH.C4,    glow: "none", guidance: "recognise", bar: { en: "Back to {C}", ro: "Înapoi la {C}" } },
      ],
      recap: { en: "you played {C}, {F} and {G} close together", ro: "ai cântat {C}, {F} și {G} aproape una de alta" } },
    { id: "L7S3", type: "play", tempo: 70, follow: "steady", guidance: { default: "recognise", first: 2 }, record: "withApp",
      card: { en: "Klang plays Twinkle. You play the chords.", ro: "Klang cântă Twinkle. Tu cânți acordurile." },
      bar:  { en: "Play the chord when it lands", ro: "Cântă acordul când ajunge jos" },
      phrase: { en: "Twinkle with your chords", ro: "Twinkle cu acordurile tale" },
      notes: [ at(CH.C4,0,4), at(CH.Fnear,4,2), at(CH.C4,6,2), at(CH.Fnear,8,2), at(CH.C4,10,2), at(CH.Gnear,12,2), at(CH.C4,14,2) ],
      app: { melody: { tune: "twinkle", bars: [1, 4] } } },
  ],
  headline: { en: "One chord, many shapes.", ro: "Un acord, mai multe forme." },
  song: { id: "twinkle-chords", title: { en: "Twinkle, with your chords", ro: "Twinkle, cu acordurile tale" } },
  canNow: [
    { id: "L7.shapes", text: { en: "I know a chord can be played in different orders.", ro: "Știu că un acord se poate cânta în ordini diferite." }, earnedIf: { stepDone: "L7S1" } },
    { id: "L7.three", text: { en: "I played Twinkle with three chords.", ro: "Am cântat Twinkle cu trei acorduri." }, earnedIf: { stepDone: "L7S3" } },
  ],
  next: "L8",
};
