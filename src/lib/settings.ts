import raw from '../content/settings.json';
import { settingsSchema, type Settings } from '../../shared/schema';

/** Настройки проверяются при сборке теми же правилами, что и в админке; недостающие поля получают значения по умолчанию. */
const parsed = settingsSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error('src/content/settings.json не прошёл проверку:\n' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
}
export type { Settings };
export const settings: Settings = parsed.data;

export type SectionKey = keyof Settings['sections'];
export const isOn = (key: SectionKey) => settings.sections[key] !== false;

export const telHref = 'tel:' + settings.phone.replace(/[^\d+]/g, '');
/**
 * Куда писать для записи на open mic. Ведущие меняются — при смене ведущего
 * меняется только ссылка links.openMicHost (в админке: Настройки → Open mic).
 * Пусто — ведёт в Telegram клуба.
 */
export const openMicContact = settings.links.openMicHost || settings.links.telegram;

/** Пункты меню. Выключенные разделы пропадают автоматически. */
export function navItems() {
  return [
    { href: '/afisha/', label: 'Афиша', on: true },
    { href: '/comics/', label: 'Комики', on: isOn('comics') },
    { href: '/#photos', label: 'Фото', on: isOn('photos') },
    { href: '/open-mic/', label: 'Open mic', on: isOn('openmic') },
    { href: '/arenda/', label: 'Мероприятия', on: isOn('venue') },
    { href: '/contacts/', label: 'Контакты', on: true },
  ].filter((i) => i.on);
}

/** Сегодняшняя дата по Перми (ГГГГ-ММ-ДД) — на момент сборки сайта */
export const permToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Плашка-объявление: показывается, если включена и срок не прошёл */
export function activeBanner() {
  const b = settings.banner;
  if (!b.enabled || !b.text.trim()) return null;
  if (b.until && b.until < permToday()) return null;
  return b;
}

/** SEO-заголовок и описание страницы из настроек (пустые — берутся значения по умолчанию) */
export function seoFor(page: keyof Settings['seo']['pages']) {
  const p = settings.seo.pages[page];
  return { title: p.title || undefined, description: p.description || undefined };
}
