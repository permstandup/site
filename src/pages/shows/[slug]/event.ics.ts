import type { APIRoute } from 'astro';
import { getUpcomingEvents, type EventEntry } from '../../../lib/events';
import { parseLocal, toIcsStamp } from '../../../lib/dates';
import { settings } from '../../../lib/settings';

export async function getStaticPaths() {
  const upcoming = await getUpcomingEvents();
  return upcoming
    .filter((e) => e.data.status !== 'cancelled')
    .map((event) => ({ params: { slug: event.id }, props: { event } }));
}

const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

/** Файл для «Добавить в календарь» */
export const GET: APIRoute = ({ props, site }) => {
  const e = (props as { event: EventEntry }).event;
  const start = parseLocal(e.data.start);
  const end = new Date(start.getTime() + 90 * 60_000);
  const url = new URL(`/shows/${e.id}/`, site).toString();
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//permstandup.ru//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@permstandup.ru`,
    `DTSTAMP:${toIcsStamp(new Date())}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SUMMARY:${esc(e.data.title)} — ${esc(settings.name)}`,
    `LOCATION:${esc(`${settings.city}, ${settings.address}`)}`,
    `DESCRIPTION:${esc(`Сбор гостей за 30 минут. ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.data.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
