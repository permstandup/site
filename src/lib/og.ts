/**
 * Картинки-превью для ссылок (1200×630, Telegram/VK/WhatsApp).
 * Собираются при сборке сайта из макета «OG» — руками рисовать не нужно.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { settings } from './settings';
import { THEME_VALUES, BG_VALUES } from '../../shared/themes';
import logoSvg from '../assets/logo.svg?raw';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) =>
  readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));

type Weight = 500 | 600 | 700;
// Satori берёт один файл на имя шрифта, поэтому каждый набор символов
// (латиница, кириллица, latin-ext — в нём знак ₽) регистрируется под своим именем и перечисляется в fontFamily.
const SUBSETS = ['latin', 'cyrillic', 'latin-ext'] as const;
const fonts = SUBSETS.flatMap((sub) => [
  { name: `Oswald-${sub}`, weight: 600 as Weight, data: font('oswald', `oswald-${sub}-600-normal.woff`) },
  { name: `Oswald-${sub}`, weight: 700 as Weight, data: font('oswald', `oswald-${sub}-700-normal.woff`) },
  { name: `Golos-${sub}`, weight: 500 as Weight, data: font('golos-text', `golos-text-${sub}-500-normal.woff`) },
  { name: `Golos-${sub}`, weight: 600 as Weight, data: font('golos-text', `golos-text-${sub}-600-normal.woff`) },
]);
const OSWALD = SUBSETS.map((s) => `Oswald-${s}`).join(', ');
const GOLOS = SUBSETS.map((s) => `Golos-${s}`).join(', ');

type Node = { type: string; props: Record<string, unknown> & { children?: unknown; style?: Record<string, unknown> } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

const THEME = THEME_VALUES[settings.theme];
const ACCENT = THEME.accent;
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64');

export interface OgInput {
  /** Верхняя строка акцентным цветом: дата или подзаголовок */
  kicker: string;
  title: string;
  /** Текст на кнопке справа внизу, например «Билеты от 1 000 ₽» */
  cta?: string;
}

function titleSize(t: string) {
  const n = t.length;
  return n <= 14 ? 128 : n <= 22 ? 104 : n <= 32 ? 84 : 66;
}

export async function renderOg({ kicker, title, cta }: OgInput): Promise<Buffer> {
  const tree = h('div', {
    width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '64px 72px', color: '#F4F1EA', fontFamily: GOLOS,
    backgroundColor: BG_VALUES[settings.background].bg,
    backgroundImage: `radial-gradient(ellipse 620px 520px at 88% 0%, rgba(${THEME.glowRgb},0.42), rgba(14,26,28,0) 70%)`,
  }, [
    h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
        { type: 'img', props: { src: LOGO, width: 72, height: 72 } },
        h('div', { display: 'flex', flexDirection: 'column', fontFamily: OSWALD, fontWeight: 600, fontSize: 26, letterSpacing: 1.5, lineHeight: 1.1 },
          [h('div', {}, 'ПЕРМСКИЙ'), h('div', {}, 'СТЕНДАП КЛУБ')]),
      ]),
      h('div', { fontSize: 26, fontWeight: 600, border: '2px solid #F4F1EA', borderRadius: 10, padding: '4px 14px' }, '18+'),
    ]),
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { fontFamily: OSWALD, fontSize: 34, fontWeight: 600, color: ACCENT, letterSpacing: 2, marginBottom: 8 }, kicker.toUpperCase()),
      h('div', { fontFamily: OSWALD, fontSize: titleSize(title), fontWeight: 700, lineHeight: 0.95 }, title.toUpperCase()),
    ]),
    h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 28 }, [
      h('div', { color: '#D5DAD8' }, settings.address),
      cta ? h('div', { backgroundColor: ACCENT, color: THEME.onAccent, fontWeight: 600, borderRadius: 999, padding: '14px 32px' }, cta) : h('div', {}, ''),
    ]),
  ]);

  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

export const pngResponse = (buf: Buffer) =>
  new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'image/png' } });
