import { getCollection, getEntries, getEntry, type CollectionEntry } from 'astro:content';
import { settings } from './settings';
import { parseLocal, weekKey, TZ } from './dates';

export type EventEntry = CollectionEntry<'events'>;

export const FORMAT_LABEL: Record<EventEntry['data']['format'], string> = {
  standup: 'Стендап-шоу',
  openmic: 'Открытый микрофон',
  test: 'Проверочный концерт',
  solo: 'Сольный концерт',
};

/** Шоу длится около 1,5 часа — после этого оно считается прошедшим. */
const SHOW_LENGTH_MS = 2 * 3600_000;

/**
 * Опубликованные и ещё не прошедшие шоу, по времени начала.
 * Отменённое шоу остаётся в афише до своей даты (с плашкой «Отменено»).
 */
export async function getUpcomingEvents(now = new Date()): Promise<EventEntry[]> {
  const all = await getCollection('events', ({ data }) => data.published);
  return all
    .filter((e) => parseLocal(e.data.start).getTime() + SHOW_LENGTH_MS > now.getTime())
    .sort((a, b) => parseLocal(a.data.start).getTime() - parseLocal(b.data.start).getTime());
}

/** Ближайшее шоу, на которое можно купить билет */
export function nextOnSale(events: EventEntry[]): EventEntry | undefined {
  return events.find((e) => e.data.status !== 'cancelled' && e.data.seats !== 'out');
}

export function groupByWeek(events: EventEntry[], now = new Date()) {
  const thisWeek = weekKey(now);
  const nextWeekDate = new Date(now.getTime() + 7 * 86400_000);
  const nextWeek = weekKey(nextWeekDate);
  const groups = new Map<string, EventEntry[]>();
  for (const e of events) {
    const k = weekKey(parseLocal(e.data.start));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()].map(([k, list]) => ({
    key: k,
    name: [k === thisWeek ? 'Эта неделя' : k === nextWeek ? 'Следующая неделя' : '', dateRange(list.map((e) => parseLocal(e.data.start)))].filter(Boolean).join(' · '),
    events: list,
  }));
}

export async function getEventComedians(e: EventEntry) {
  if (!e.data.comedians.length) return [];
  const list = await getEntries(e.data.comedians);
  return list.filter((c) => c && c.data.visible);
}

export function eventUrl(e: EventEntry) {
  return `/shows/${e.id}/`;
}

/**
 * Open mic: кто ведёт и куда писать, чтобы записаться выступить.
 * Порядок: ссылка, указанная в шоу → Telegram/VK ведущего из карточки комика →
 * общая ссылка из настроек → Telegram клуба.
 */
export async function openMicSignup(e: EventEntry) {
  const host = e.data.host ? await getEntry(e.data.host) : undefined;
  const url = e.data.hostUrl || host?.data.telegram || host?.data.vk || settings.links.openMicHost || settings.links.telegram;
  return { hostName: host?.data.name, hostId: host?.data.visible ? host.id : undefined, url };
}

/** Ссылка для записи на ближайший open mic (для страницы Open mic и главной) */
export async function nextOpenMicSignup(upcoming: EventEntry[]) {
  const next = upcoming.find((e) => e.data.format === 'openmic' && e.data.status !== 'cancelled');
  return next ? openMicSignup(next) : { hostName: undefined, hostId: undefined, url: settings.links.openMicHost || settings.links.telegram };
}

const dayNum = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long' });
const monthOnly = (d: Date) => dayMonth.format(d).replace(/^\d+\s/, '');

/** Даты шоу недели: «20 — 25 октября», «27 октября — 1 ноября», «23 октября» */
export function dateRange(dates: Date[]): string {
  if (!dates.length) return '';
  const from = dates.reduce((a, b) => (a < b ? a : b));
  const to = dates.reduce((a, b) => (a > b ? a : b));
  if (dayMonth.format(from) === dayMonth.format(to)) return dayMonth.format(from);
  return monthOnly(from) === monthOnly(to)
    ? `${dayNum.format(from)} — ${dayMonth.format(to)}`
    : `${dayMonth.format(from)} — ${dayMonth.format(to)}`;
}
