// Small DOM helpers and inline icons (no external assets, works offline).

/** h('div.class#id', {attrs, on: {click}}, ...children) */
export function h(tag, props = {}, ...children) {
  if (typeof props === 'string' || props instanceof Node || Array.isArray(props)) { children.unshift(props); props = {}; }
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const svg = (inner, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  plus: svg('<path d="M12 6v12M6 12h12"/>'),
  left: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  right: svg('<path d="M9.5 6l6 6-6 6"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  keys: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M8 5v14M12 5v14M16 5v14"/><path d="M6.5 5v7M10 5v7M14 5v7M17.5 5v7" stroke-width="2.6"/>'),
  note: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>'),
  again: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  game: svg('<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/>'),
  speaker: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  skip: svg('<path d="M6 6l7 6-7 6M16 6v12"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
};

export const icon = (name) => { const s = document.createElement('span'); s.style.display = 'contents'; s.innerHTML = ICONS[name] || ''; return s; };

export function toast(text, ms = 2200) {
  const t = h('div.toast', { role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Modal card overlay. Returns { el, close }. */
export function overlay(content, { onClose } = {}) {
  const root = document.getElementById('overlay-root');
  const el = h('div.overlay', { role: 'dialog', 'aria-modal': 'true' }, h('div.card', content));
  const close = () => { el.remove(); onClose?.(); };
  root.append(el);
  return { el, close };
}

/** Segmented control. options: [{value, label}] */
export function segmented(options, value, onChange, { label } = {}) {
  const el = h('div.seg', { role: 'group', 'aria-label': label || '' });
  const btns = options.map((o) => h('button', {
    type: 'button', 'aria-pressed': String(o.value === value), title: o.title || o.label,
    on: { click: () => { set(o.value); onChange(o.value); } },
  }, o.label));
  const set = (v) => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  el.append(...btns);
  el.setValue = set;
  return el;
}

export const LABEL_OPTIONS = [
  { value: 'letters', label: 'C D E', title: 'Letters (C D E)' },
  { value: 'solfege', label: 'Do Re Mi', title: 'Do Re Mi' },
  { value: 'off', label: 'Off', title: 'No names on keys' },
];

export const isTouchPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
