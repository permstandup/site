/**
 * Сборка интерфейса без innerHTML: все данные попадают на страницу только как текст.
 * Это исключает XSS даже если в данных окажется «<script>».
 */
type Child = Node | string | number | null | undefined | false | Child[];
type Handler = (e: Event) => void;
export interface Props {
  class?: string | Record<string, boolean | undefined> | Array<string | false | undefined>;
  [key: string]: unknown;
}

function cls(c: Props['class']): string {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter(Boolean).join(' ');
  return Object.entries(c).filter(([, v]) => v).map(([k]) => k).join(' ');
}

const SAFE_URL = /^(https:\/\/|\/(?!\/)|#|blob:|data:image\/(jpeg|webp|png);)/;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') { const c = cls(v as Props['class']); if (c) el.className = c; continue; }
    if (k.startsWith('on') && typeof v === 'function') { el.addEventListener(k.slice(2).toLowerCase(), v as Handler); continue; }
    if (k === 'innerHTML' || k === 'outerHTML' || k === 'srcdoc') throw new Error('запрещено');
    if ((k === 'href' || k === 'src' || k === 'action') && !SAFE_URL.test(String(v))) { el.setAttribute(k, '#'); continue; }
    if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'multiple') { (el as unknown as Record<string, unknown>)[k] = v; continue; }
    if (k === 'dataset') { Object.assign(el.dataset, v); continue; }
    el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children.flat(10 as 1)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

/** Иконки — фиксированные пути SVG из кода, не из данных */
const ICONS: Record<string, string[]> = {
  plus: ['M12 5v14M5 12h14'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
  shows: ['M4 5h16v14H4z', 'M4 10h16M9 5v14'],
  comics: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  photos: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M15 9h.01'],
  settings: ['M4 6h16M4 12h16M4 18h16', 'M8 4v4M16 10v4M10 16v4'],
  text: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  x: ['M6 6l12 12M18 6L6 18'],
  back: ['M15 6l-6 6 6 6'],
  upload: ['M12 16V4M7 9l5-5 5 5M5 20h14'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  ext: ['M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'],
  github: [],
};
const GITHUB = 'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z';

export function icon(name: keyof typeof ICONS, size = 20): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (name === 'github') {
    svg.setAttribute('fill', 'currentColor');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', GITHUB); svg.appendChild(p);
    return svg;
  }
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[name]) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); }
  return svg;
}

/** Заменить содержимое элемента (null/false пропускаются) */
export function setChildren(el: Element, ...children: Child[]) { clear(el); append(el, children); }
