// v2 (26 Nov, student request): Still Loving You (Scorpions), intro, transcribed from the student's tutorial
// video (falling-notes video; yellow = right hand, blue = left hand). Key G minor, video tempo ≈ 90 bpm;
// here slower. Unit = one eighth note (½ beat). Phone can't do both hands: first you play the left hand
// while Klang plays the right; then you learn the right hand while Klang plays the left.
import { describe } from '../engine/notes.js';
const ev = (m, u, d) => [describe(m).name, m, u / 2, d / 2];          // eighth-note units → beats
// left hand: D3 F3 Eb3 Eb3 D3 (one 32-eighth loop), twice
const LH1 = [[50, 0, 4], [53, 4, 4], [51, 8, 8], [51, 16, 8], [50, 24, 8]];
const LH = [...LH1, ...LH1.map(([m, u, d]) => [m, u + 32, d])].map(([m, u, d]) => ev(m, u, d));
// right hand: loop 1 and loop 2 (as read from the video, frame by frame)
const RH1 = [[70,1,1],[67,2,1],[62,3,2],[70,5,1],[67,6,1],[62,7,2],[70,9,1],[67,10,1],[62,11,1],[73,12,1],[72,13,1],[70,14,1],[67,15,1],
             [70,18,1],[67,19,1],[62,20,2],[58,22,2],[57,24,2],[69,26,1],[66,27,1],[60,28,2],[57,30,2]];
const RH2 = [[70,33,1],[67,34,1],[62,35,2],[70,37,1],[67,38,1],[62,39,2],[70,41,1],[67,42,1],[62,43,1],[73,44,1],[72,45,1],[70,46,1],[67,47,1],
             [58,48,2],[70,50,1],[67,51,1],[62,52,2],[58,54,2],[57,56,2],[69,58,1],[66,59,1],[60,60,4]];
const RH = [...RH1, ...RH2].map(([m, u, d]) => ev(m, u, d));
const half = (arr, endBeat) => arr.filter((e) => e[2] < endBeat);
export default {
  id: "L12",
  title:    { en: "Still Loving You", ro: "Still Loving You" },
  newSkill: { en: "Left hand, then the solo", ro: "Mâna stângă, apoi solo-ul" },
  tune:     { en: "Still Loving You (intro)", ro: "Still Loving You (intro)" },
  minutes: 4, colour: "F", newNotes: [],
  range: { low: "D3", high: "D5" },
  steps: [
    { id: "L12S1", type: "play", tempo: 66, follow: "steady", guidance: { default: "recognise", first: 3 }, record: "withApp",
      card: { en: "Left hand first. Klang plays the solo.", ro: "Întâi mâna stângă. Klang cântă solo-ul." },
      bar:  { en: "Left hand", ro: "Mâna stângă" },
      phrase: { en: "the left hand of Still Loving You", ro: "mâna stângă din Still Loving You" },
      notes: LH, app: { melody: RH } },
    { id: "L12S2", type: "play", tempo: 60, follow: "steady", guidance: { default: "recognise", first: 6 },
      card: { en: "Now the solo, first half. Klang plays the left hand.", ro: "Acum solo-ul, prima jumătate. Klang cântă mâna stângă." },
      bar:  { en: "Solo, first half", ro: "Solo, prima jumătate" },
      phrase: { en: "the first half of the solo", ro: "prima jumătate a solo-ului" },
      notes: half(RH, 16), app: { melody: half(LH, 16) } },
    { id: "L12S3", type: "play", tempo: 66, follow: "steady", guidance: { default: "recognise", first: 3 }, record: "withApp",
      card: { en: "The whole solo. Klang plays the left hand.", ro: "Tot solo-ul. Klang cântă mâna stângă." },
      bar:  { en: "The whole solo", ro: "Tot solo-ul" },
      phrase: { en: "the Still Loving You solo", ro: "solo-ul din Still Loving You" },
      notes: RH, app: { melody: LH } },
    { id: "L12S4", type: "play", tempo: 90, follow: "steady", guidance: { default: "recognise", first: 2 },
      card: { en: "Left hand again, at the real speed.", ro: "Din nou mâna stângă, la viteza reală." },
      bar:  { en: "Left hand, real speed", ro: "Mâna stângă, viteza reală" },
      phrase: { en: "the left hand at the real speed", ro: "mâna stângă la viteza reală" },
      notes: LH, app: { melody: RH } },
    { id: "L12S5", type: "play", tempo: 90, follow: "steady", guidance: { default: "recognise", first: 2 }, record: "withApp",
      card: { en: "The solo, at the real speed.", ro: "Solo-ul, la viteza reală." },
      bar:  { en: "Solo, real speed", ro: "Solo, viteza reală" },
      phrase: { en: "the solo at the real speed", ro: "solo-ul la viteza reală" },
      notes: RH, app: { melody: LH } },
  ],
  headline: { en: "You played Still Loving You, both hands, one at a time.", ro: "Ai cântat Still Loving You, ambele mâini, pe rând." },
  song: { id: "still-loving-you", title: { en: "Still Loving You (intro)", ro: "Still Loving You (intro)" } },
  canNow: [
    { id: "L12.left", text: { en: "I can play the left hand of Still Loving You.", ro: "Pot cânta mâna stângă din Still Loving You." }, earnedIf: { stepDone: "L12S1" } },
    { id: "L12.solo", text: { en: "I played the Still Loving You solo.", ro: "Am cântat solo-ul din Still Loving You." }, earnedIf: { stepDone: "L12S3" } },
  ],
  next: null,
};
