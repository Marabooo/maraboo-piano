// Copied from design/02_lesson_curriculum.md (designer-owned content). Edit there first, then re-copy.
import { CH, bars } from './shared.js';
export default {
  id: "L3",
  title:    { en: "Your first chord", ro: "Primul tău acord" },
  newSkill: { en: "The {C} chord, three notes at once, and playing along with a song",
              ro: "Acordul {C}, trei note deodată, și cântatul împreună cu o melodie" },
  tune:     { en: "Frère Jacques with your chords · Ode to Joy, ending on a chord",
              ro: "Frère Jacques cu acordurile tale · Oda bucuriei, cu final pe acord" },
  minutes: 4, colour: "E", newNotes: [],
  range: { low: "C3", high: "C5" },
  steps: [
    { id: "L3S1", type: "chord-find",
      card: { en: "A chord is notes played together. Play {C}, {E} and {G} at the same time.",
              ro: "Un acord înseamnă note cântate împreună. Cântă {C}, {E} și {G} deodată." },
      tip: "hint.phone_flat",
      prompts: [
        { target: CH.C4, glow: "targets", guidance: "show",
          bar: { en: "{C} + {E} + {G} together.", ro: "{C} + {E} + {G} deodată." } },
        { target: CH.C4, glow: "none", guidance: "remind", bar: { en: "Once more.", ro: "Încă o dată." } },
      ],
      after: { en: "That's a {C} chord.", ro: "Acesta e acordul {C}." },
      recap: { en: "you played a {C} chord", ro: "ai cântat acordul {C}" } },

    { id: "L3S2", type: "chord-find",
      card: { en: "The shape is: play one, skip one, play one, skip one, play one. Find a {C} chord that starts on a different {C}.",
              ro: "Forma e: una da, una nu, una da, una nu, una da. Găsește un acord {C} care începe pe alt {C}." },
      prompts: [
        { target: CH.C3, acceptAnyRootC: true, exclude: "C4", glow: "none", guidance: "recognise",
          bar: { en: "Another {C} chord, on a different {C}.", ro: "Alt acord {C}, pe alt {C}." },
          h2: { en: "Start on {C}, then skip a key, twice.", ro: "Pornește de la {C}, apoi sari peste o clapă, de două ori." } },
      ],
      recap: { en: "you found the chord shape on another {C}", ro: "ai găsit forma acordului pe alt {C}" } },

    { id: "L3S3", type: "play", tempo: 80, follow: "steady", guidance: { default: "recognise", first: 2 },
      card: { en: "Klang plays Frère Jacques. You play a {C} chord each time a chord block lands.",
              ro: "Klang cântă Frère Jacques. Tu cânți acordul {C} de fiecare dată când ajunge jos un bloc de acord." },
      bar:  { en: "Play the chord when it lands.", ro: "Cântă acordul când ajunge jos." },
      phrase: { en: "Frère Jacques with your chords", ro: "Frère Jacques cu acordurile tale" },
      notes: [0,4,8,12,16,20,24,28].map(b => [CH.C4[0], CH.C4[1], b, 4]),  // 8 whole-note C chords
      app:   { melody: { tune: "frere", bars: [1, 8] } },                   // Klang's melody, not shown as blocks
      recap: { en: "you accompanied Frère Jacques", ro: "ai acompaniat Frère Jacques" } },

    { id: "L3S4", type: "play", tempo: 80, guidance: { default: "recognise", chord: "show" }, record: true,
      card: { en: "Ode to Joy, line two, and end it with your chord.", ro: "Oda bucuriei, rândul doi, și încheie cu acordul tău." },
      bar:  { en: "Ode to Joy, line two. End with the chord.", ro: "Oda bucuriei, rândul doi. Încheie cu acordul." },
      phrase: { en: "Ode to Joy with a chord at the end", ro: "Oda bucuriei, cu un acord la final" },
      notes: [
        ["E4",64,0,1],["E4",64,1,1],["F4",65,2,1],["G4",67,3,1],
        ["G4",67,4,1],["F4",65,5,1],["E4",64,6,1],["D4",62,7,1],
        ["C4",60,8,1],["C4",60,9,1],["D4",62,10,1],["E4",64,11,1],
        ["D4",62,12,1.5],["C4",60,13.5,0.5],[CH.C4[0], CH.C4[1], 14, 2],   // last C becomes the chord
      ],
      pad: [ [["C3","E3","G3"],[48,52,55],0,4], [["B2","D3","G3"],[47,50,55],4,4],
             [["C3","E3","G3"],[48,52,55],8,4], [["B2","D3","G3"],[47,50,55],12,2] ] }, // pad stops; the learner's chord ends it
  ],
  headline: { en: "Your first chord! And you played along with a song.", ro: "Primul tău acord! Și ai cântat împreună cu o melodie." },
  song: { id: "ode-chord", title: { en: "Ode to Joy, with a chord ending", ro: "Oda bucuriei, cu final pe acord" } },
  canNow: [
    { id: "L3.chordC",
      text: { en: "I can play a {C} chord: one, skip one, one, skip one, one.", ro: "Pot cânta acordul {C}: una da, una nu, una da, una nu, una da." },
      earnedIf: { prompt: "L3S2", n: 1, maxHint: 1 },
      fallback: { en: "I played my first chord.", ro: "Am cântat primul meu acord." }, fallbackIf: { stepDone: "L3S1" },
      almost: { en: "finding the chord shape without help", ro: "să găsesc forma acordului fără ajutor" }, practise: "L3S2" },
    { id: "L3.accomp",
      text: { en: "I accompanied Frère Jacques with chords.", ro: "Am acompaniat Frère Jacques cu acorduri." },
      earnedIf: { stepDone: "L3S3" } },
    { id: "L3.odeChord",
      text: { en: "I ended Ode to Joy with a chord.", ro: "Am încheiat Oda bucuriei cu un acord." },
      earnedIf: { stepDone: "L3S4" } },
  ],
  next: "L4",
};
