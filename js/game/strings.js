// Daily game strings, EN + RO. Copied from design/01_interaction_spec.md §12.8 (designer-owned).
// Lines marked "engineer-added" are not in the spec deck (screen-reader labels and tune names) —
// designer to review.
export const GAME_STRINGS = {
  'daily.title': ['Note sort', 'Sortează notele'],
  'daily.number': ['#{n} · {date}', '#{n} · {date}'],
  'daily.how': ['Tap a tube, then tap where to pour. Sort each colour into its own tube.', 'Atinge o eprubetă, apoi locul unde torni. Adună fiecare culoare în eprubeta ei.'],
  'daily.undo': ['Undo', 'Anulează'],
  'daily.restart': ['Start over', 'De la capăt'],
  'daily.no_moves': ['No moves left. Undo or start over — no rush.', 'Nu mai sunt mutări. Anulează sau ia de la capăt — fără grabă.'],
  'daily.solved': ['Solved!', 'Rezolvat!'],
  'daily.tune': ['It played: {tune}', 'A cântat: {tune}'],
  'daily.tune_known': ['You can play it — Lesson {n} ▸', 'O poți cânta și tu — Lecția {n} ▸'],
  'daily.tune_new': ["You'll learn it in Lesson {n} ▸", 'O vei învăța în Lecția {n} ▸'],
  'daily.share': ['Share', 'Distribuie'],
  'daily.copied': ['Copied — paste it anywhere.', 'Copiat — lipește-l unde vrei.'],
  'daily.tomorrow': ['New puzzle tomorrow', 'Puzzle nou mâine'],
  'daily.practice': ['Play a practice puzzle', 'Joacă un puzzle de exercițiu'],
  'daily.practice_note': ["Practice puzzles don't change your days.", 'Puzzle-urile de exercițiu nu schimbă zilele tale.'],
  'daily.share_text': ['Klang note sort #{n} ✓ — it played {tune} 🎵 {tubes}', 'Klang · Sortează notele #{n} ✓ — a cântat {tune} 🎵 {tubes}'],
  'days.title': ['Your days', 'Zilele tale'],
  'days.total': ['{n} days played in total', '{n} zile jucate în total'],
  'days.run': ['Current run: {n} days', 'Seria de acum: {n} zile'],
  'days.best': ['Best run: {n} days', 'Cea mai lungă serie: {n} zile'],
  'days.rule': ['A day counts when you finish a lesson step or the daily puzzle. Miss a day? Your run waits one day for you. Nothing is ever taken away.', 'O zi contează când termini un pas de lecție sau puzzle-ul zilei. Ai lipsit o zi? Seria te așteaptă o zi. Nu ți se ia nimic, niciodată.'],
  'days.rest': ['Rest day', 'Zi de pauză'],
  'days.today_counted': ['Today counts ✓', 'Ziua de azi contează ✓'],
  'days.welcome_back': ["Welcome back! You've played {n} days in total.", 'Bine ai revenit! Ai jucat {n} zile în total.'],

  // engineer-added (not in §12.8) — screen-reader labels and tune names
  'game.back': ['Back', 'Înapoi'],
  'game.tube': ['Tube {i}: {contents}', 'Eprubeta {i}: {contents}'],
  'game.tube_empty': ['empty', 'goală'],
  'game.tube_lifted': ['lifted', 'ridicată'],
  'game.practice_title': ['Practice', 'Exercițiu'],
  'tune.frere': ['Frère Jacques', 'Frère Jacques'],
  'tune.ode': ['Ode to Joy', 'Oda bucuriei'],
  'tune.jingle': ['Jingle Bells', 'Jingle Bells'],
};

export function makeT(lang) {
  const i = lang === 'ro' ? 1 : 0;
  return (id, vars = {}) => {
    const e = GAME_STRINGS[id];
    const s = e ? (e[i] || e[0]) : id;
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  };
}
