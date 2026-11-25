// Lesson intro sheet (01 §2.3). Opened over Home; route #/lesson/L1 opens Home with it.
import { h, overlay } from '../ui.js';
import { t, tx } from '../i18n.js';
import { store } from '../store.js';
import { LESSONS, lessonById } from '../../lessons/index.js';
import { soundHelp } from '../sheets.js';
import { log } from '../../engine/log.js';
import { audio } from '../../engine/audio.js';

export function lessonIntroScreen(root, { id }, { go }) {
  go('home', { replace: true, data: { openLesson: id } });
  return null;
}

export function openIntro(lesson, { go }) {
  const prog = store.lessonProgress(lesson.id);
  const i = LESSONS.indexOf(lesson);
  const firstUndone = LESSONS.find((l) => !store.lessonProgress(l.id)?.completed);
  const ahead = firstUndone && LESSONS.indexOf(firstUndone) < i;
  const mode = store.settings.practiceMode;
  log.event('intro_open', { lesson: lesson.id, ahead, done: !!prog?.completed });
  const start = () => {
    o.close();
    audio.unlock();
    if (!store.settings.practiceMode) go(`mode/${lesson.id}`);
    else if (store.settings.practiceMode === 'mic') go(`mode/${lesson.id}?mic=1`); // re-acquire the mic for this session
    else go(`play/${lesson.id}?resume=0`);
  };
  const preview = () => {
    audio.unlock();
    const step = lesson.steps.find((s) => s.type === 'listen' || s.type === 'play');
    const notes = (step?.notes || []).filter((e) => e[2] < 4);
    const tempo = step?.tempo || 80; const t0 = audio.now() + 0.05;
    for (const e of notes) for (const m of [].concat(e[1])) audio.playNote(m, (e[3] * 60) / tempo * 0.9, { when: t0 + (e[2] * 60) / tempo });
    log.event('intro_preview', { lesson: lesson.id });
  };
  const btns = [];
  if (ahead) {
    btns.push(h('p.muted', t('intro.skip_ahead', { notes: (firstUndone.newNotes || []).map((n) => `{${n}}`).join(', ').replace(/\{(\w)\}/g, (m, k) => tx(`{${k}}`)), n: firstUndone.number })));
    btns.push(h('div.choice-row.two',
      h('button.btn.big', { type: 'button', on: { click: start } }, t('intro.start_anyway')),
      h('button.btn.big', { type: 'button', on: { click: () => { o.close(); openIntro(firstUndone, { go }); } } }, t('intro.go_to', { n: firstUndone.number }))));
  } else {
    btns.push(h('button.btn.primary.big.wide', { type: 'button', on: { click: start } }, prog?.completed ? t('intro.play_again') : t('intro.start')));
  }
  const o = overlay([
    h('button.icon-btn.sheet-x', { type: 'button', 'aria-label': t('common.close'), html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>', on: { click: () => o.close() } }),
    h('div.eyebrow', t('intro.eyebrow', { n: lesson.number, m: lesson.minutes || 3 })),
    h('h1', tx(lesson.title)),
    h('p', h('span.muted', t('intro.you_learn') + ': '), tx(lesson.newSkill)),
    h('p', h('span.muted', t('intro.you_play') + ': '), tx(lesson.tune), ' ', h('button.icon-btn.small', { type: 'button', 'aria-label': 'Preview', on: { click: preview }, html: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg>' })),
    mode ? h('p.muted', t('intro.playing_on', { mode: t(mode === 'mic' ? 'intro.mode_mic' : 'intro.mode_screen') }), ' · ',
      h('button.help-link', { type: 'button', on: { click: () => { o.close(); go(`mode/${lesson.id}?change=1`); } } }, t('intro.change'))) : null,
    ...btns,
    (lesson.number === 1 || !store.settings.soundConfirmed) ? h('button.help-link', { type: 'button', on: { click: () => soundHelp() } }, t('intro.cant_hear')) : null,
  ]);
  o.el.classList.add('intro-sheet');
  o.el.addEventListener('click', (e) => { if (e.target === o.el) o.close(); });
  return o;
}

export { lessonById };
