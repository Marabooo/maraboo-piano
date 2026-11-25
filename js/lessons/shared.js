// Copied from design/02_lesson_curriculum.md (designer-owned content). Edit there first, then re-copy.
export const TUNES = {
  // Frère Jacques in C — confident
  frere: [
    ["C4",60,0,1],["D4",62,1,1],["E4",64,2,1],["C4",60,3,1],          // bar 1
    ["C4",60,4,1],["D4",62,5,1],["E4",64,6,1],["C4",60,7,1],          // bar 2
    ["E4",64,8,1],["F4",65,9,1],["G4",67,10,2],                        // bar 3
    ["E4",64,12,1],["F4",65,13,1],["G4",67,14,2],                      // bar 4
    ["G4",67,16,0.5],["A4",69,16.5,0.5],["G4",67,17,0.5],["F4",65,17.5,0.5],["E4",64,18,1],["C4",60,19,1], // bar 5
    ["G4",67,20,0.5],["A4",69,20.5,0.5],["G4",67,21,0.5],["F4",65,21.5,0.5],["E4",64,22,1],["C4",60,23,1], // bar 6
    ["C4",60,24,1],["G3",55,25,1],["C4",60,26,2],                      // bar 7
    ["C4",60,28,1],["G3",55,29,1],["C4",60,30,2],                      // bar 8
  ],
  // Ode to Joy in C — confident
  ode: [
    ["E4",64,0,1],["E4",64,1,1],["F4",65,2,1],["G4",67,3,1],          // bar 1
    ["G4",67,4,1],["F4",65,5,1],["E4",64,6,1],["D4",62,7,1],          // bar 2
    ["C4",60,8,1],["C4",60,9,1],["D4",62,10,1],["E4",64,11,1],        // bar 3
    ["E4",64,12,1.5],["D4",62,13.5,0.5],["D4",62,14,2],               // bar 4 (end of line 1)
    ["E4",64,16,1],["E4",64,17,1],["F4",65,18,1],["G4",67,19,1],      // bar 5
    ["G4",67,20,1],["F4",65,21,1],["E4",64,22,1],["D4",62,23,1],      // bar 6
    ["C4",60,24,1],["C4",60,25,1],["D4",62,26,1],["E4",64,27,1],      // bar 7
    ["D4",62,28,1.5],["C4",60,29.5,0.5],["C4",60,30,2],               // bar 8 (end of line 2)
  ],
  // Jingle Bells chorus in C — confident
  jingle: [
    ["E4",64,0,1],["E4",64,1,1],["E4",64,2,2],                         // 1  Jin-gle bells
    ["E4",64,4,1],["E4",64,5,1],["E4",64,6,2],                         // 2  jin-gle bells
    ["E4",64,8,1],["G4",67,9,1],["C4",60,10,1.5],["D4",62,11.5,0.5],  // 3  jin-gle all the
    ["E4",64,12,4],                                                    // 4  way
    ["F4",65,16,1],["F4",65,17,1],["F4",65,18,1.5],["F4",65,19.5,0.5],// 5  oh what fun it
    ["F4",65,20,1],["E4",64,21,1],["E4",64,22,1],["E4",64,23,1],                 // 6 is to ride (Round 1: one E less)
    ["E4",64,24,1],["D4",62,25,1],["D4",62,26,1],["E4",64,27,1],      // 7  one horse o-pen
    ["D4",62,28,2],["G4",67,30,2],                                     // 8  sleigh, hey
    ["E4",64,32,1],["E4",64,33,1],["E4",64,34,2],                      // 9
    ["E4",64,36,1],["E4",64,37,1],["E4",64,38,2],                      // 10
    ["E4",64,40,1],["G4",67,41,1],["C4",60,42,1.5],["D4",62,43.5,0.5],// 11
    ["E4",64,44,4],                                                    // 12
    ["F4",65,48,1],["F4",65,49,1],["F4",65,50,1.5],["F4",65,51.5,0.5],// 13
    ["F4",65,52,1],["E4",64,53,1],["E4",64,54,1],["E4",64,55,1],                 // 14 (Round 1: one E less)
    ["G4",67,56,1],["G4",67,57,1],["F4",65,58,1],["D4",62,59,1],      // 15 one horse o-pen
    ["C4",60,60,4],                                                    // 16 sleigh
  ],
  // Twinkle, Twinkle, Little Star in C — confident
  twinkle: [
    ["C4",60,0,1],["C4",60,1,1],["G4",67,2,1],["G4",67,3,1],          // 1
    ["A4",69,4,1],["A4",69,5,1],["G4",67,6,2],                         // 2
    ["F4",65,8,1],["F4",65,9,1],["E4",64,10,1],["E4",64,11,1],        // 3
    ["D4",62,12,1],["D4",62,13,1],["C4",60,14,2],                      // 4
    ["G4",67,16,1],["G4",67,17,1],["F4",65,18,1],["F4",65,19,1],      // 5
    ["E4",64,20,1],["E4",64,21,1],["D4",62,22,2],                      // 6
    ["G4",67,24,1],["G4",67,25,1],["F4",65,26,1],["F4",65,27,1],      // 7
    ["E4",64,28,1],["E4",64,29,1],["D4",62,30,2],                      // 8
    ["C4",60,32,1],["C4",60,33,1],["G4",67,34,1],["G4",67,35,1],      // 9
    ["A4",69,36,1],["A4",69,37,1],["G4",67,38,2],                      // 10
    ["F4",65,40,1],["F4",65,41,1],["E4",64,42,1],["E4",64,43,1],      // 11
    ["D4",62,44,1],["D4",62,45,1],["C4",60,46,2],                      // 12
  ],
  // C major scale up and down (Lesson 5)
  scaleC: [
    ["C4",60,0,1],["D4",62,1,1],["E4",64,2,1],["F4",65,3,1],["G4",67,4,1],["A4",69,5,1],["B4",71,6,1],["C5",72,7,1],
    ["B4",71,8,1],["A4",69,9,1],["G4",67,10,1],["F4",65,11,1],["E4",64,12,1],["D4",62,13,1],["C4",60,14,2],
  ],
};

// Backing pad chords (not shown on the keyboard; volume −18 dB; off in mic mode)
const C = [["C3","E3","G3"],[48,52,55]], G = [["B2","D3","G3"],[47,50,55]], F = [["C3","F3","A3"],[48,53,57]];
const pad = (ch, b, d) => [ch[0], ch[1], b, d];
export const PADS = {
  frere:  [pad(C,0,32)],
  ode:    [pad(C,0,4),pad(G,4,4),pad(C,8,4),pad(G,12,4),pad(C,16,4),pad(G,20,4),pad(C,24,4),pad(G,28,2),pad(C,30,2)],
  jingle: [pad(C,0,16),pad(F,16,4),pad(C,20,4),pad(G,24,8),pad(C,32,16),pad(F,48,4),pad(C,52,4),pad(G,56,4),pad(C,60,4)],
  twinkle:[pad(C,0,4),pad(F,4,2),pad(C,6,2),pad(F,8,2),pad(C,10,2),pad(G,12,2),pad(C,14,2),
           pad(C,16,2),pad(F,18,2),pad(C,20,2),pad(G,22,2),pad(C,24,2),pad(F,26,2),pad(C,28,2),pad(G,30,2),
           pad(C,32,4),pad(F,36,2),pad(C,38,2),pad(F,40,2),pad(C,42,2),pad(G,44,2),pad(C,46,2)],
};
// Learner chords
export const CH = {
  C4: [["C4","E4","G4"],[60,64,67]],
  C3: [["C3","E3","G3"],[48,52,55]],
  G3: [["G3","B3","D4"],[55,59,62]],
};

export const NOTE_HINT = {
  C: { en: "{C}: just left of the two black keys",          ro: "{C}: chiar în stânga celor două clape negre" },
  D: { en: "{D}: between the two black keys",               ro: "{D}: între cele două clape negre" },
  E: { en: "{E}: just right of the two black keys",         ro: "{E}: chiar în dreapta celor două clape negre" },
  F: { en: "{F}: just left of the three black keys",        ro: "{F}: chiar în stânga celor trei clape negre" },
  G: { en: "{G}: between the first two of the three black keys", ro: "{G}: între primele două din cele trei clape negre" },
  A: { en: "{A}: between the last two of the three black keys",  ro: "{A}: între ultimele două din cele trei clape negre" },
  B: { en: "{B}: just right of the three black keys",       ro: "{B}: chiar în dreapta celor trei clape negre" },
};
export const PATTERN_HINT = {   // H1 text in find steps (shown with the pattern glow)
  pattern2: { en: "Look for two black keys together.",   ro: "Caută două clape negre împreună." },
  pattern3: { en: "Look for three black keys together.", ro: "Caută trei clape negre împreună." },
};

/** Notes of bars from..to (1-based, 4/4), re-based so bar `from` starts at beat 0; events clipped at the edges. */
export function bars(tune, from, to) {
  const a = (from - 1) * 4, b = to * 4;
  return tune.filter((e) => e[2] < b && e[2] + e[3] > a)
    .map((e) => [e[0], e[1], Math.max(e[2], a) - a, Math.min(e[2] + e[3], b) - Math.max(e[2], a)]);
}
