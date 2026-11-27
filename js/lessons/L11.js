// v2 (27 Nov, student request): Hit the Road Jack, read frame by frame from the student's tutorial video
// (left hand A G F E; the extra A♭ in the left hand was removed (student request)). One hand at a time: you play the left hand while Klang plays the right, then swap;
// first slow, then once at the real speed (≈69 bpm).
import { describe } from '../engine/notes.js';
const ev = ([m, b, d]) => [describe(m).name, m, b, d];
const LH = [[45, 0, 0.9], [43, 1, 0.9], [41, 2, 0.9], [40, 3, 0.9], [45, 4, 0.9], [43, 5, 0.9], [41, 6, 0.9], [40, 7, 0.9], [45, 8, 0.9], [43, 9, 0.9], [41, 10, 0.9], [40, 11, 0.9], [45, 12, 0.9], [43, 13, 0.9], [41, 14, 0.9], [40, 15, 0.9], [45, 16, 0.9], [43, 17, 0.9], [41, 18, 0.9], [40, 19, 0.9], [45, 20, 0.9], [43, 21, 0.9], [41, 22, 0.9], [40, 23, 0.9], [45, 24, 0.9]].map(ev);
const LHK = [[45, 0, 0.9], [43, 1, 0.9], [41, 2, 0.9], [40, 3, 0.9], [45, 4, 0.9], [43, 5, 0.9], [41, 6, 0.9], [40, 7, 0.9], [45, 8, 0.9], [43, 9, 0.9], [41, 10, 0.9], [40, 11, 0.9], [45, 12, 0.9], [43, 13, 0.9], [41, 14, 0.9], [40, 15, 0.9], [45, 16, 0.9], [43, 17, 0.9], [41, 18, 0.9], [40, 19, 0.9], [45, 20, 0.9], [43, 21, 0.9], [41, 22, 0.9], [40, 23, 0.9], [45, 24, 0.9]].map(ev);   // what Klang plays for the left hand
// right hand after the intro is swung: quick notes sit on sixths of a beat (measured gap 0.145 s at 0.857 s/beat).
// Units below: [midi, start, length] in sixths of a beat. The final E3 is not in the video (student request).
const SW = [[64,42,3],[64,45,2],[60,47,1],[62,48,2],[60,50,1],[57,51,2],[57,53,3],[57,59,1],[60,60,2],[60,62,1],[62,63,2],[60,65,1],[62,66,3],[60,69,3],
            [64,72,3],[64,75,3],[69,78,3],[69,81,3],[72,84,3],[72,87,3],[69,90,3],[63,93,2],[60,95,1],[62,96,2],[60,98,1],[57,99,2],[57,101,3],
            [57,107,1],[60,108,2],[60,110,1],[62,111,2],[60,113,1],[62,114,3],[57,117,3],[57,120,3],[55,126,3],[53,132,6],[52,138,6]];
const RH = [[69, 0, 0.5], [67, 1, 0.75], [65, 2, 0.5], [64, 3, 0.5], [69, 4, 0.5], [67, 5, 0.5], [65, 6, 1],
            ...SW.map(([m, u, d]) => [m, u / 6, d / 6])].map(ev);
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
