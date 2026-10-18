import { getCollection, getEntries, type CollectionEntry } from 'astro:content';
import { parseLocal, weekKey } from './dates';

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
    name: k === thisWeek ? 'Эта неделя' : k === nextWeek ? 'Следующая неделя' : `Неделя с ${new Date(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`,
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
