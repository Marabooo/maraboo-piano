// Learn tab (v2): the lesson road map, a winding piano keyboard with one stone per lesson. Free choice, no locks.
import { h, ICONS, overlay } from '../ui.js';
import { t, tx } from '../i18n.js';
import { store } from '../store.js';
import { LESSONS, COMING } from '../../lessons/index.js';
import { NOTE_COLORS } from '../../engine/notes.js';
import { openIntro } from './lessonIntro.js';

export function learnScreen(root, _p, { go }) {
  const done = (l) => !!store.lessonProgress(l.id)?.completed;
  const nextL = LESSONS.find((l) => !done(l)) || null;
  const all = [...LESSONS.map((l) => ({ l })), ...COMING.map((c) => ({ c }))];
  const W = 340, STEP = 132, TOP = 70;
  const pts = all.map((_, i) => ({ x: [170, 255, 170, 85][i % 4], y: TOP + i * STEP })); // snake
  const H = TOP + all.length * STEP;
  let d = `M ${pts[0].x} ${pts[0].y - 60}`;
  pts.forEach((p, i) => { const q = pts[i - 1] || { x: p.x, y: p.y - 60 }; const my = (q.y + p.y) / 2; d += ` C ${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`; });
  // the road = a keyboard: ivory band, thin key gaps, black keys
  const road = `<svg class="road" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="#ECE6DA" stroke-width="34" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#bdb5a6" stroke-width="34" stroke-dasharray="1.5 15"/>
    <path d="${d}" fill="none" stroke="#1A1C22" stroke-width="16" stroke-dasharray="9 7 9 7 9 15"/></svg>`;
  const map = h('div.road-map', { style: { width: W + 'px', height: H + 'px' }, html: road });
  let nextEl = null;
  all.forEach((item, i) => {
    const l = item.l, state = item.c ? 'soon' : done(l) ? 'done' : l === nextL ? 'next' : 'ahead';
    const stone = h('button.stone3.' + state, { type: 'button', style: { left: pts[i].x + 'px', top: pts[i].y + 'px', '--lc': l ? NOTE_COLORS[l.colour] || 'var(--accent)' : 'var(--line)' },
      on: { click: () => (l ? openIntro(l, { go }) : overlay([h('p', t('stone.coming_soon_body', { n: LESSONS.length }))])) } },
      // v2: finished lessons keep their number, with a small check badge in the corner
      h('span.disc', String(l ? l.number : item.c.number), state === 'done' ? h('span.done-badge', { html: ICONS.check }) : null),
      h('span.st-title', tx(l ? l.title : item.c.title)),
      state === 'soon' ? h('span.muted.small', t('stone.coming_soon')) : null);
    if (state === 'next') nextEl = stone;
    map.append(stone);
  });
  root.append(h('div.screen.scroll.learn', h('h1.tab-title', t('tab.learn')), map));
  if (nextEl) setTimeout(() => nextEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  return null;
}
