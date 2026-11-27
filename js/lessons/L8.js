// v2 (26 Nov): major vs minor, then a fun riff straight away.
import { CH } from './shared.js';
export default {
  id: "L8",
  title:    { en: "Happy or sad? Major and minor", ro: "Vesel sau trist? Major și minor" },
  newSkill: { en: "Minor chords: one note moves", ro: "Acordurile minore: o notă se mută" },
  tune:     { en: "Seven Nation Army riff", ro: "Riff-ul Seven Nation Army" },
  minutes: 3, colour: "A", newNotes: [],
  range: { low: "A3", high: "C5" },
  steps: [
    { id: "L8S1", type: "chord-find",
      card: { en: "Major sounds happy, minor sounds sad. One note moves.", ro: "Majorul sună vesel, minorul trist. O notă se mută." },
      prompts: [
        { target: CH.C4,  glow: "targets", guidance: "show", bar: { en: "{C} major chord: happy", ro: "Acordul {C} major: vesel" } },
        { target: CH.Cm4, glow: "targets", guidance: "show", bar: { en: "{C} minor chord: sad?", ro: "Acordul {C} minor: trist?" } },
        { target: CH.Am3, glow: "targets", guidance: "show", bar: { en: "{A} minor chord", ro: "Acordul {A} minor" } },
      ],
      recap: { en: "you heard major and minor", ro: "ai auzit major și minor" } },
    { id: "L8S2", type: "play", tempo: 96, guidance: { default: "recognise", first: 3 }, record: true,
      card: { en: "Now a famous riff. Seven notes, white keys only.", ro: "Acum un riff celebru. Șapte note, doar clape albe." },
      bar:  { en: "Seven Nation Army", ro: "Seven Nation Army" },
      phrase: { en: "the Seven Nation Army riff", ro: "riff-ul Seven Nation Army" },
      notes: { tune: "riff7", bars: [1, 4] } },
  ],
  headline: { en: "Major, minor, and a famous riff.", ro: "Major, minor și un riff celebru." },
  song: { id: "riff7", title: { en: "Seven Nation Army (riff)", ro: "Seven Nation Army (riff)" } },
  canNow: [
    { id: "L8.minor", text: { en: "I can turn a major chord into a minor one.", ro: "Pot transforma un acord major în unul minor." }, earnedIf: { stepDone: "L8S1" } },
    { id: "L8.riff", text: { en: "I can play the Seven Nation Army riff.", ro: "Pot cânta riff-ul Seven Nation Army." }, earnedIf: { stepDone: "L8S2" } },
  ],
  next: "L10",
};
