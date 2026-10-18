import raw from '../content/settings.json';

export type Settings = typeof raw;
export const settings: Settings = raw;

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
    { href: '/contacts/', label: 'Контакты', on: true },
  ].filter((i) => i.on);
}
