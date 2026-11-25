// Home (01 §2.2): header (wordmark, days chip, gear) · town · continue card · daily card · path.
import { h, ICONS, toast, overlay } from '../ui.js';
import { t, tx, lang, setLang } from '../i18n.js';
import { makeT } from '../../game/strings.js';
import { store } from '../store.js';
import { days } from '../days.js';
import { loadDays } from '../../game/streak.js';
import { LESSONS, COMING } from '../../lessons/index.js';
import { NOTE_COLORS } from '../../engine/notes.js';
import { openIntro } from './lessonIntro.js';
import { log } from '../../engine/log.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function homeScreen(root, { query }, { go, takePassed }) {
  const passed = takePassed();
  const done = (l) => !!store.lessonProgress(l.id)?.completed;
  const nextL = LESSONS.find((l) => !done(l)) || null;
  const resume = store.resume;
  const resumeLesson = resume && LESSONS.find((l) => l.id === resume.lessonId);

  const daysChip = h('button.chip.days-chip', { type: 'button', 'aria-label': t('home.days_chip', { n: days.total() }), on: { click: openDays } }, '☀ ' + String(days.total()));
  // Language: round flag button next to the gear (student request, 25 Nov) — opens a two-option chooser.
  const langBtn = h('button.flag-btn', { type: 'button', 'aria-label': t('settings.language') + ': ' + LANG_NAME[lang()], title: t('settings.language'), html: FLAGS[lang()], on: { click: openLang } });
  const head = h('div.home-head', h('div.logo', h('i'), 'Klang'), h('div.spacer'), daysChip, langBtn,
    h('button.icon-btn', { type: 'button', 'aria-label': t('settings.title'), title: t('settings.title'), html: ICONS.gear, on: { click: () => go('settings') } }));

  const songs = Object.values(store.songs);
  const town = h('button.town', { type: 'button', on: { click: () => go('settings?rep=1') }, 'aria-label': t('rep.title') },
    townSvg(songs.length, LESSONS.length),
    h('span.town-cap', songs.length ? (songs.length === 1 ? t('home.town_caption_one') : t('home.town_caption', { n: songs.length })) : t('home.town_empty')));

  // v2 (Round 1): one clear "what now" card + a colourful Daily card that glows until today's puzzle is solved.
  const heroL = resumeLesson || nextL;
  const hero = heroL ? h('button.hero', { type: 'button', style: { '--lc': NOTE_COLORS[heroL.colour] || 'var(--accent)' }, on: { click: () => (resumeLesson ? openResume(resumeLesson) : openIntro(heroL, { go })) } },
    h('span.hero-txt',
      h('span.eyebrow', resumeLesson ? t('home.continue_eyebrow') : t('home.next_eyebrow')),
      h('b', tx(heroL.title)),
      h('span.muted', resumeLesson ? t('home.step_of', { n: Math.min(resume.stepIndex + 1, heroL.steps.length), total: heroL.steps.length }) : t('stone.minutes', { n: heroL.minutes || 3 }))),
    h('span.hero-go', { html: ICONS.play })) : h('p.muted', t('home.all_done'));

  const today = days.get().today;
  const solved = !!loadDays()?.days?.[today]?.puzzle;
  const daily = h('button.daily-card' + (solved ? '.solved' : ''), { type: 'button', on: { click: () => { log.event('daily_open', { solved }); go('game'); } } },
    h('span.daily-ic', '🧩'),
    h('span', h('b', t('home.daily_title')), h('span', solved ? t('home.daily_done') : t('home.daily_sub'))));
  const freeTile = h('button.tile', { type: 'button', on: { click: () => go('free') } },
    h('span.ic', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' }, html: ICONS.keys }),
    h('span', h('b', t('free.title')), h('span', t('free.sub'))));

  const tip = isIOS && !standalone() && !sessionStorage.getItem('klang.iosTip') ? h('p.tip', t('install.tip_ios')) : null;
  if (tip) sessionStorage.setItem('klang.iosTip', '1');

  // path
  const path = h('div.path-v');
  if (!done(LESSONS[0]) && !resumeLesson) path.append(h('p.start-first', t('home.start_first', { lesson: tx(LESSONS[0].title) })));
  let section = null;
  const all = [...LESSONS.map((l) => ({ l })), ...COMING.map((c) => ({ c }))];
  let nextEl = null;
  all.forEach((item, i) => {
    const sec = item.l ? item.l.section : item.c.section;
    if (sec !== section && i < LESSONS.length + 1) { section = sec; }
    const num = item.l ? item.l.number : item.c.number;
    const title = tx(item.l ? item.l.title : item.c.title);
    let state = 'ahead';
    if (item.c) state = 'soon';
    else if (done(item.l)) state = 'done';
    else if (item.l === nextL) state = 'next';
    const stone = h('button.stone2.' + state, { type: 'button', style: { '--lc': item.l ? NOTE_COLORS[item.l.colour] || 'var(--accent)' : 'var(--line)' }, on: { click: () => (item.l ? openIntro(item.l, { go }) : soon()) } },
      h('span.disc', state === 'done' ? h('span', { html: ICONS.check }) : String(num)),
      h('span.txt', h('b', title), h('span.muted', state === 'soon' ? t('stone.coming_soon') : t('stone.minutes', { n: item.l.minutes || 3 })), state === 'next' ? h('span.tag2', t('stone.start')) : null));
    if (state === 'next') nextEl = stone;
    path.append(h('div.stone-row' + (i % 2 ? '.zig' : ''), stone));
  });

  const left = h('div.home-left', hero, daily, freeTile, town, tip);
  const el = h('div.screen.home', head, h('div.home-cols', left, path));
  root.append(el);
  if (nextEl) setTimeout(() => nextEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  if (passed?.toast) toast(passed.toast);
  else { const d = days.get(); if (d.welcomeBack) { toast(makeT(lang())('days.welcome_back', { n: d.total }), 3500); days.dismissWelcomeBack(); } }
  if (passed?.openLesson) { const l = LESSONS.find((x) => x.id === passed.openLesson); if (l) setTimeout(() => openIntro(l, { go }), 50); }

  function openLang() {
    log.event('lang_open', { from: 'home' });
    const o = overlay([h('h2', t('settings.language')),
      h('div.lang-choices', ['en', 'ro'].map((l) => h('button.lang-choice', { type: 'button', 'aria-pressed': String(lang() === l), on: { click: () => { o.close(); if (l !== lang()) setLang(l, 'home'); } } },
        h('span.flag-dot', { html: FLAGS[l] }), h('b', LANG_NAME[l]))))]);
  }
  function soon() {
    const o = overlay([h('p', t('stone.coming_soon_body', { n: LESSONS.length })), h('button.btn', { type: 'button', on: { click: () => o.close() } }, t('common.close'))]);
  }
  function openResume(lesson) {
    const r = store.resume;
    const nextStep = lesson.steps[r.stepIndex];
    log.event('resume_card', { lesson: lesson.id, step: r.stepIndex });
    const o = overlay([
      h('h2', t('resume.title')),
      h('p', t('resume.body', { recap: noDot(r.recap || tx(lesson.title)), next: noDot(nextStep ? tx(nextStep.bar || nextStep.card) : tx(lesson.title)) })),
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { type: 'button', on: { click: () => { o.close(); store.setResume(null); go(`play/${lesson.id}?resume=0`); } } }, t('resume.over')),
        h('button.btn.primary', { type: 'button', on: { click: () => { o.close(); go(`play/${lesson.id}`); } } }, t('resume.continue'))),
    ]);
    o.el.addEventListener('click', (e) => { if (e.target === o.el) o.close(); });
  }
  function openDays() {
    const d = days.get(); const gt = makeT(lang());
    const o = overlay([
      h('h2', gt('days.title')),
      h('p', h('b', gt('days.total', { n: d.total }))),
      h('p.muted', gt('days.run', { n: d.run }), ' · ', gt('days.best', { n: d.best })),
      d.todayCounted ? h('p', gt('days.today_counted')) : null,
      h('p.muted.small', gt('days.rule')),
      h('button.btn', { type: 'button', on: { click: () => o.close() } }, t('common.close')),
    ]);
    log.event('days_open');
  }
  return null;
}

const noDot = (s) => String(s).trim().replace(/[.!?…]+$/, '');

/** Simple skyline: one building per learned song, dashed plots for the rest (placeholder for 03_visual_system). */
function townSvg(n, total) {
  const W = 320, H = 96, slots = Math.max(total, n, 6), w = W / slots;
  const cols = Object.values(NOTE_COLORS);
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><rect x="0" y="${H - 6}" width="${W}" height="6" rx="3" fill="#343A4D"/>`;
  for (let i = 0; i < slots; i++) {
    const bh = 34 + ((i * 37) % 40), x = i * w + 4, bw = w - 8;
    if (i < n) {
      s += `<rect x="${x}" y="${H - 6 - bh}" width="${bw}" height="${bh}" rx="6" fill="#262A39"/>`;
      for (let k = 0; k < 3; k++) s += `<rect x="${x + bw / 2 - 4}" y="${H - bh + 2 + k * 10}" width="8" height="5" rx="2" fill="${cols[(i * 2 + k) % 7]}"/>`;
    } else s += `<rect x="${x}" y="${H - 6 - bh}" width="${bw}" height="${bh}" rx="6" fill="none" stroke="#343A4D" stroke-dasharray="4 4"/>`;
  }
  const d = document.createElement('span'); d.className = 'town-art'; d.innerHTML = s + '</svg>';
  return d;
}

const LANG_NAME = { en: 'English', ro: 'Română' };
// Inline SVG flags (emoji flags don't render on Windows). Sliced to fill the round button.
const FLAGS = {
  en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="fl-uk"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#fl-uk)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
  ro: '<svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1" height="2" fill="#002B7F"/><rect x="1" width="1" height="2" fill="#FCD116"/><rect x="2" width="1" height="2" fill="#CE1126"/></svg>',
};
