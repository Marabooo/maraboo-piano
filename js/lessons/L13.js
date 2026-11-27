// v2 (27 Nov, student request): Paparazzi (Lady Gaga), chorus, read frame by frame from the student's two
// tutorial clips (F minor; pink = left hand, purple = right hand; ≈115 bpm, one bar = 2.09 s).
// Left hand only: one long bass note per bar (A♭ E♭ F D♭, four times). Klang plays the melody.
import { describe } from '../engine/notes.js';
const ev = ([m, b, d]) => [describe(m).name, m, b, d];
// left hand: whole notes; Klang plays the same notes when it backs you
const LOOP = [44, 39, 41, 37];
const LH = [...LOOP, ...LOOP, ...LOOP, ...LOOP].map((m, i) => [m, i * 4, 3.9]).map(ev);
// right hand phrases, [midi, beat in bar]; song = A A B A + last bar
const A = [[[68,0],[68,0.5],[68,1],[68,1.5],[68,2],[70,3],[67,3.5]],
           [[67,0.5],[67,1],[67,1.5],[67,2],[68,3],[72,3.5]],
           [[68,0.5],[65,2],[67,2.75]],
           [[65,0],[67,0.75],[72,1.5],[68,2.5]]];
const B = [[[75,0],[73,1],[72,2],[70,2.5],[67,3.5]],
           [[63,1.5],[63,2],[63,2.5],[63,3],[63,3.5]],
           [[75,0],[73,1],[72,2],[70,2.5],[65,3.5]],
           []];
const bars = [...A, ...A, ...B, ...A];   // the song ends on the D♭ bar (student request: no closing C)
const on = bars.flatMap((bar, i) => bar.map(([m, b]) => [m, i * 4 + b]));
const RH = on.map(([m, b], i) => { const nxt = on[i + 1]?.[1] ?? b + 1.5; return [m, b, Math.min(4, (nxt - b) * 0.9)]; }).map(ev);
const step = (n, tempo, en, ro, bar_en, bar_ro, rec) => ({ id: "L13S" + n, type: "play", tempo, follow: "steady",
  guidance: { default: "recognise", first: 3 }, record: rec ? "withApp" : undefined,
  card: { en, ro }, bar: { en: bar_en, ro: bar_ro }, phrase: { en: "Paparazzi", ro: "Paparazzi" },
  notes: LH, app: { melody: RH } });
export default {
  id: "L13",
  title:    { en: "Paparazzi", ro: "Paparazzi" },
  newSkill: { en: "Low bass notes, held long", ro: "Note joase de bas, ținute lung" },
  tune:     { en: "Paparazzi (chorus)", ro: "Paparazzi (refrenul)" },
  minutes: 3, colour: "F", newNotes: [],
  range: { low: "C2", high: "C3" },
  steps: [
    step(1, 80, "Left hand only. Klang sings the melody.", "Doar mâna stângă. Klang cântă melodia.", "Left hand", "Mâna stângă"),
    step(2, 115, "Again, at the real speed.", "Din nou, la viteza reală.", "Left hand, real speed", "Mâna stângă, viteza reală", true),
  ],
  headline: { en: "You played the bass of Paparazzi.", ro: "Ai cântat basul din Paparazzi." },
  song: { id: "paparazzi", title: { en: "Paparazzi (chorus)", ro: "Paparazzi (refrenul)" } },
  canNow: [
    { id: "L13.bass", text: { en: "I can play the bass line of Paparazzi.", ro: "Pot cânta linia de bas din Paparazzi." }, earnedIf: { stepDone: "L13S1" } },
    { id: "L13.fast", text: { en: "I played Paparazzi at the real speed.", ro: "Am cântat Paparazzi la viteza reală." }, earnedIf: { stepDone: "L13S2" } },
  ],
  next: null,
};
