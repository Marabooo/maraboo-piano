// v2 (27 Nov, student request): Hit the Road Jack, read frame by frame from the student's tutorial video
// (left hand A G F E; the extra A♭ in the left hand was removed (student request)). One hand at a time: you play the left hand while Klang plays the right, then swap;
// first slow, then once at the real speed (≈69 bpm).
import { describe } from '../engine/notes.js';
const ev = ([m, b, d]) => [describe(m).name, m, b, d];
const LH = [[45, 0, 0.9], [43, 1, 0.9], [41, 2, 0.9], [40, 3, 0.9], [45, 4, 0.9], [43, 5, 0.9], [41, 6, 0.9], [40, 7, 0.9], [45, 8, 0.9], [43, 9, 0.9], [41, 10, 0.9], [40, 11, 0.9], [45, 12, 0.9], [43, 13, 0.9], [41, 14, 0.9], [40, 15, 0.9], [45, 16, 0.9], [43, 17, 0.9], [41, 18, 0.9], [40, 19, 0.9], [45, 20, 0.9], [43, 21, 0.9], [41, 22, 0.9], [40, 23, 0.9], [45, 24, 0.9]].map(ev);
const LHK = [[45, 0, 0.9], [43, 1, 0.9], [41, 2, 0.9], [40, 3, 0.9], [45, 4, 0.9], [43, 5, 0.9], [41, 6, 0.9], [40, 7, 0.9], [45, 8, 0.9], [43, 9, 0.9], [41, 10, 0.9], [40, 11, 0.9], [45, 12, 0.9], [43, 13, 0.9], [41, 14, 0.9], [40, 15, 0.9], [45, 16, 0.9], [43, 17, 0.9], [41, 18, 0.9], [40, 19, 0.9], [45, 20, 0.9], [43, 21, 0.9], [41, 22, 0.9], [40, 23, 0.9], [45, 24, 0.9]].map(ev);   // what Klang plays for the left hand
const RH = [[69, 0, 0.5], [67, 1, 0.75], [65, 2, 0.5], [64, 3, 0.5], [69, 4, 0.5], [67, 5, 0.5], [65, 6, 1], [64, 7, 0.25], [64, 7.5, 0.25], [60, 7.75, 0.25], [62, 8, 0.25], [60, 8.25, 0.25], [57, 8.5, 0.25], [57, 8.75, 0.25], [57, 9.75, 0.25], [60, 10, 0.25], [60, 10.25, 0.25], [62, 10.5, 0.25], [60, 10.75, 0.25], [62, 11, 0.5], [60, 11.5, 0.5], [64, 12, 0.25], [64, 12.5, 0.5], [69, 13, 0.25], [69, 13.5, 0.25], [72, 14, 0.25], [72, 14.5, 0.25], [69, 15, 0.25], [63, 15.5, 0.25], [60, 15.75, 0.25], [62, 16, 0.25], [60, 16.25, 0.25], [57, 16.5, 0.25], [57, 16.75, 0.25], [57, 17.75, 0.25], [60, 18, 0.25], [60, 18.25, 0.25], [62, 18.5, 0.25], [60, 18.75, 0.25], [62, 19, 0.5], [57, 19.5, 0.25], [57, 20, 0.5], [55, 21, 0.25], [53, 22, 1.25]].map(ev);
const step = (n, you, tempo, en, ro, bar_en, bar_ro, rec) => ({ id: "L11S" + n, type: "play", tempo, follow: "steady",
  guidance: { default: "recognise", first: 3 }, record: rec ? "withApp" : undefined,
  card: { en, ro }, bar: { en: bar_en, ro: bar_ro }, phrase: { en: "Hit the Road Jack", ro: "Hit the Road Jack" },
  notes: you === "L" ? LH : RH, app: { melody: you === "L" ? RH : LHK } });
export default {
  id: "L11",
  title:    { en: "Hit the Road Jack", ro: "Hit the Road Jack" },
  newSkill: { en: "Left hand, then right hand", ro: "Mâna stângă, apoi mâna dreaptă" },
  tune:     { en: "Hit the Road Jack", ro: "Hit the Road Jack" },
  minutes: 4, colour: "A", newNotes: [],
  range: { low: "C3", high: "C5" },
  steps: [
    step(1, "L", 52, "Left hand first. Klang plays the right hand.", "Întâi mâna stângă. Klang cântă mâna dreaptă.", "Left hand", "Mâna stângă"),
    step(2, "R", 48, "Now the right hand. Klang plays the left hand.", "Acum mâna dreaptă. Klang cântă mâna stângă.", "Right hand", "Mâna dreaptă"),
    step(3, "L", 69, "Left hand again, at the real speed.", "Din nou mâna stângă, la viteza reală.", "Left hand, real speed", "Mâna stângă, viteza reală"),
    step(4, "R", 69, "Right hand, at the real speed.", "Mâna dreaptă, la viteza reală.", "Right hand, real speed", "Mâna dreaptă, viteza reală", true),
  ],
  headline: { en: "You played Hit the Road Jack, both hands.", ro: "Ai cântat Hit the Road Jack, ambele mâini." },
  song: { id: "hit-the-road-jack", title: { en: "Hit the Road Jack", ro: "Hit the Road Jack" } },
  canNow: [
    { id: "L11.left", text: { en: "I can play the left hand of Hit the Road Jack.", ro: "Pot cânta mâna stângă din Hit the Road Jack." }, earnedIf: { stepDone: "L11S1" } },
    { id: "L11.fast", text: { en: "I played Hit the Road Jack at the real speed.", ro: "Am cântat Hit the Road Jack la viteza reală." }, earnedIf: { stepDone: "L11S4" } },
  ],
  next: "L12",
};
