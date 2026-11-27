// v2 (27 Nov, student request): Back to Black, read frame by frame from the student's tutorial video
// (key D minor; left hand = top note of the octave, Klang plays both; right hand = chords Dm, Gm, B♭, A). One hand at a time: you play the left hand while Klang plays the right, then swap;
// first slow, then once at the real speed (≈128 bpm).
import { describe } from '../engine/notes.js';
const ev = ([m, b, d]) => [describe(m).name, m, b, d];
const LH = [[50, 0, 1], [50, 1.5, 0.5], [50, 2, 1], [50, 4, 1], [50, 5.5, 1], [48, 6.5, 1.5], [43, 8, 1], [43, 9.5, 0.5], [43, 10, 1], [43, 12, 1], [43, 13.5, 1], [44, 14.5, 1.5], [46, 16, 1], [46, 17.5, 0.5], [46, 18, 1], [46, 20, 1], [46, 21.5, 1], [46, 22.5, 1.5], [45, 24, 1.5], [45, 25.5, 0.5], [45, 26, 1], [45, 28, 1], [45, 29.5, 1], [48, 30.5, 1.5]].map(ev);
const LHK = [[50, 0, 1], [50, 1.5, 0.5], [50, 2, 1], [50, 4, 1], [50, 5.5, 1], [48, 6.5, 1.5], [43, 8, 1], [43, 9.5, 0.5], [43, 10, 1], [43, 12, 1], [43, 13.5, 1], [44, 14.5, 1.5], [46, 16, 1], [46, 17.5, 0.5], [46, 18, 1], [46, 20, 1], [46, 21.5, 1], [46, 22.5, 1.5], [45, 24, 1.5], [45, 25.5, 0.5], [45, 26, 1], [45, 28, 1], [45, 29.5, 1], [48, 30.5, 1.5], [38, 0, 1], [38, 1.5, 0.5], [38, 2, 1], [38, 4, 1], [38, 5.5, 1], [36, 6.5, 1.5], [31, 8, 1], [31, 9.5, 0.5], [31, 10, 1], [31, 12, 1], [31, 13.5, 1], [32, 14.5, 1.5], [34, 16, 1], [34, 17.5, 0.5], [34, 18, 1], [34, 20, 1], [34, 21.5, 1], [34, 22.5, 1.5], [33, 24, 1.5], [33, 25.5, 0.5], [33, 26, 1], [33, 28, 1], [33, 29.5, 1], [36, 30.5, 1.5]].map(ev);   // what Klang plays for the left hand
const RH = [[74, 0, 0.9], [77, 0, 0.9], [81, 0, 0.9], [74, 1, 0.9], [77, 1, 0.9], [81, 1, 0.9], [74, 2, 0.9], [77, 2, 0.9], [81, 2, 0.9], [74, 3, 0.9], [77, 3, 0.9], [81, 3, 0.9], [74, 4, 0.9], [77, 4, 0.9], [81, 4, 0.9], [74, 5, 0.9], [77, 5, 0.9], [81, 5, 0.9], [74, 6, 0.9], [77, 6, 0.9], [81, 6, 0.9], [74, 7, 0.9], [77, 7, 0.9], [81, 7, 0.9], [74, 8, 0.9], [79, 8, 0.9], [82, 8, 0.9], [74, 9, 0.9], [79, 9, 0.9], [82, 9, 0.9], [74, 10, 0.9], [79, 10, 0.9], [82, 10, 0.9], [74, 11, 0.9], [79, 11, 0.9], [82, 11, 0.9], [74, 12, 0.9], [79, 12, 0.9], [82, 12, 0.9], [74, 13, 0.9], [79, 13, 0.9], [82, 13, 0.9], [74, 14, 0.9], [79, 14, 0.9], [82, 14, 0.9], [74, 15, 0.9], [79, 15, 0.9], [82, 15, 0.9], [74, 16, 0.9], [77, 16, 0.9], [82, 16, 0.9], [74, 17, 0.9], [77, 17, 0.9], [82, 17, 0.9], [74, 18, 0.9], [77, 18, 0.9], [82, 18, 0.9], [74, 19, 0.9], [77, 19, 0.9], [82, 19, 0.9], [74, 20, 0.9], [77, 20, 0.9], [82, 20, 0.9], [74, 21, 0.9], [77, 21, 0.9], [82, 21, 0.9], [74, 22, 0.9], [77, 22, 0.9], [82, 22, 0.9], [74, 23, 0.9], [77, 23, 0.9], [82, 23, 0.9], [73, 24, 0.9], [76, 24, 0.9], [81, 24, 0.9], [73, 25, 0.9], [76, 25, 0.9], [81, 25, 0.9], [73, 26, 0.9], [76, 26, 0.9], [81, 26, 0.9], [73, 27, 0.9], [76, 27, 0.9], [81, 27, 0.9], [73, 28, 0.9], [76, 28, 0.9], [81, 28, 0.9], [73, 29, 0.9], [76, 29, 0.9], [81, 29, 0.9], [73, 30, 0.9], [76, 30, 0.9], [81, 30, 0.9], [73, 31, 0.9], [76, 31, 0.9], [81, 31, 0.9]].map(ev);
const step = (n, you, tempo, en, ro, bar_en, bar_ro, rec) => ({ id: "L10S" + n, type: "play", tempo, follow: "steady",
  guidance: { default: "recognise", first: 3 }, record: rec ? "withApp" : undefined,
  card: { en, ro }, bar: { en: bar_en, ro: bar_ro }, phrase: { en: "Back to Black", ro: "Back to Black" },
  notes: you === "L" ? LH : RH, app: { melody: you === "L" ? RH : LHK } });
export default {
  id: "L10",
  title:    { en: "Back to Black", ro: "Back to Black" },
  newSkill: { en: "Left hand, then right hand", ro: "Mâna stângă, apoi mâna dreaptă" },
  tune:     { en: "Back to Black", ro: "Back to Black" },
  minutes: 4, colour: "D", newNotes: [],
  range: { low: "C3", high: "C5" },
  steps: [
    step(1, "L", 84, "Left hand first. Klang plays the right hand.", "Întâi mâna stângă. Klang cântă mâna dreaptă.", "Left hand", "Mâna stângă"),
    step(2, "R", 80, "Now the right hand. Klang plays the left hand.", "Acum mâna dreaptă. Klang cântă mâna stângă.", "Right hand", "Mâna dreaptă"),
    step(3, "L", 128, "Left hand again, at the real speed.", "Din nou mâna stângă, la viteza reală.", "Left hand, real speed", "Mâna stângă, viteza reală"),
    step(4, "R", 128, "Right hand, at the real speed.", "Mâna dreaptă, la viteza reală.", "Right hand, real speed", "Mâna dreaptă, viteza reală", true),
  ],
  headline: { en: "You played Back to Black, both hands.", ro: "Ai cântat Back to Black, ambele mâini." },
  song: { id: "back-to-black", title: { en: "Back to Black", ro: "Back to Black" } },
  canNow: [
    { id: "L10.left", text: { en: "I can play the left hand of Back to Black.", ro: "Pot cânta mâna stângă din Back to Black." }, earnedIf: { stepDone: "L10S1" } },
    { id: "L10.fast", text: { en: "I played Back to Black at the real speed.", ro: "Am cântat Back to Black la viteza reală." }, earnedIf: { stepDone: "L10S4" } },
  ],
  next: "L11",
};
