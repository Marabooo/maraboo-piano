// Note names inside UI text are wrapped in invisible markers (private-use characters) so the DOM
// layer can highlight them (student request, 25 Nov: note names must stand out in instructions).
//    + letter + name +    e.g. "ALa" → <span class="nn" style="--nn: var(--n-A)">La</span>
// h() in ui.js renders markers in children as highlights and strips them from attributes.
export const NM = '', NE = '';
const RE = /([A-G])([^]*)/g;

export const wrapNote = (name, letter) => NM + letter + name + NE;
export const hasMarks = (s) => typeof s === 'string' && s.includes(NM);
export const plain = (s) => String(s).replace(/[A-G]?/g, '').replace(//g, '');

/** String with markers → DocumentFragment with highlighted note names. */
export function rich(s) {
  s = String(s);
  const frag = document.createDocumentFragment();
  let last = 0, m;
  RE.lastIndex = 0;
  while ((m = RE.exec(s))) {
    if (m.index > last) frag.append(plain(s.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'nn';
    span.style.setProperty('--nn', `var(--n-${m[1]})`);
    span.textContent = m[2];
    frag.append(span);
    last = RE.lastIndex;
  }
  if (last < s.length) frag.append(plain(s.slice(last)));
  return frag;
}
