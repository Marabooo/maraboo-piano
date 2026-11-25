// Lesson complete (01 §2.9) — the centre of the RQ. No score, no stars, no %.
// "Next lesson" and "Done for now" have EQUAL size and style; nothing is pre-selected.
// Variant B (neutral "Lesson complete", exploratory A/B) via Settings ▸ For testing or ?done=B.
import { h, ICONS } from '../ui.js';
import { t, tx, noteName } from '../i18n.js';
import { store } from '../store.js';
import { lessonById, nextLesson } from '../../lessons/index.js';
import { NOTE_COLORS, toMidi } from '../../engine/notes.js';
import { audio } from '../../engine/audio.js';
import { log } from '../../engine/log.js';

export function completeScreen(root, { id }, { go, takePassed }) {
  const lesson = lessonById(id);
  if (!lesson) { go('home', { replace: true }); return null; }
  const prog = store.lessonProgress(id) || {};
  const sum = takePassed() || { cards: prog.cards || [], foundOwn: prog.foundOwn || [], withHint: [], headline: tx(lesson.headline), song: lesson.song ? { id: lesson.song.id, title: tx(lesson.song.title) } : null };
  const variant = new URLSearchParams(location.search).get('done') || store.settings.completionVariant || 'A';
  const nxt = nextLesson(id);
  const shownAt = performance.now();
  const choose = (choice) => {
    log.event('done_choice', { lesson: id, choice, ms: Math.round(performance.now() - shownAt), variant });
    audio.allOff();
    if (choice === 'next' && nxt) go('home', { data: { openLesson: nxt.id } });
    else if (choice === 'again') go(`play/${id}?resume=0`);
    else if (choice === 'practise') go(`play/${id}?resume=0`);
    else go('home', { data: { toast: t('toast.done_today') } });
  };

  const chips = (letters) => h('div.note-chips', letters.map((l) => h('span.note-chip', { style: { background: NOTE_COLORS[l] } }, noteName(l))));
  const song = sum.song?.title || '';
  const rec = sum.recording || store.songs[sum.song?.id]?.recordings?.[0];

  const cards = h('div.can-cards', sum.cards.map((c, i) => c.kind === 'can'
    ? h('div.can-card', { style: { '--lc': NOTE_COLORS[lesson.colour] || 'var(--accent)', animationDelay: `${i * 80}ms` } }, h('span.ck', { html: ICONS.check }), h('span', c.text))
    : h('div.can-card.almost', { style: { animationDelay: `${i * 80}ms` } }, h('span', c.text),
      c.practise ? h('button.help-link', { type: 'button', on: { click: () => { log.event('done_choice', { lesson: id, choice: 'practise', step: c.practise, ms: Math.round(performance.now() - shownAt), variant }); const idx = lesson.steps.findIndex((s) => s.id === c.practise); go(`play/${id}?resume=0&step=${idx + 1}`); } } }, t('done.practise')) : null)));

  const hear = rec ? h('div.hear', h('button.btn', { type: 'button', on: { click: () => { log.event('hear_mine', { lesson: id }); playBack(rec); } } }, t('done.hear_mine', { song })), h('span.muted.small', t('done.hear_caption'))) : null;

  const nextBtn = h('button.btn.big.choice', { type: 'button', disabled: !nxt, on: { click: () => choose('next') } },
    h('b', t('done.next')), h('span.sub', nxt ? t('done.next_sub', { title: tx(nxt.title), m: nxt.minutes || 3 }) : t('done.next_none')));
  const doneBtn = h('button.btn.big.choice', { type: 'button', on: { click: () => choose('done') } }, h('b', t('done.today')), h('span.sub', t('done.today_sub')));

  // Variant B (testing/06 §6.3): same layout, sound, animation and buttons; only the skill text is replaced.
  const left = variant === 'B'
    ? h('div', h('div.eyebrow', t('done.eyebrow', { n: lesson.number })), h('h1', t('done.neutral')))
    : h('div', h('div.eyebrow', t('done.eyebrow', { n: lesson.number })), h('h1', sum.headline || tx(lesson.headline)),
      h('h2.small-h', t('done.can_now')), cards,
      sum.foundOwn?.length ? h('div.found', h('span.muted', t('done.found_own')), chips(sum.foundOwn)) : null,
      sum.withHint?.length ? h('div.found', h('span.muted', t('done.with_hint')), chips(sum.withHint)) : null);
  const right = h('div.done-right',
    hear,
    !song ? null : h('p.added', t('done.added', { song })),
    h('div.choice-row.two', nextBtn, doneBtn),
    h('button.help-link', { type: 'button', on: { click: () => choose('again') } }, song ? t('done.again', { song }) : t('intro.play_again')));
  root.append(h('div.screen.scroll.done-screen', h('div.done-grid', left, right)));

  // soft rising arpeggio of the lesson's notes (−12 dB), 120 ms apart
  setTimeout(() => {
    audio.unlock();
    const t0 = audio.now() + 0.05;
    (lesson.newNotes || ['C', 'E', 'G']).forEach((n, i) => audio.playNote(toMidi(n + '4'), 0.5, { when: t0 + i * 0.12, velocity: 0.35 }));
  }, 250);
  log.event('done_screen', { lesson: id, variant, earned: sum.cards.filter((c) => c.kind === 'can').length, almost: sum.cards.filter((c) => c.kind === 'almost').length });
  return { destroy() {} };
}

/** Replay the learner's own run: their timing, gaps > 1.5 beats shortened to 1 beat (01 §9.6). */
export function playBack(rec) {
  audio.unlock();
  const beat = 60 / (rec.tempo || 80);
  let t = audio.now() + 0.1, prev = null;
  for (const n of rec.notes) {
    if (prev) { let gap = (n.t - prev.t) / 1000; if (gap > 1.5 * beat) gap = beat; t += gap; }
    const dur = n.up ? Math.min(3, Math.max(0.15, (n.up - n.t) / 1000)) : Math.max(0.3, (n.dur || 1) * beat);
    audio.playNote(n.midi, dur, { when: t, velocity: 0.75 });
    prev = n;
  }
}
