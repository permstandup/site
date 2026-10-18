import type { APIRoute, GetStaticPaths } from 'astro';
import { getUpcomingEvents, type EventEntry } from '../../../lib/events';
import { dateParts, parseLocal } from '../../../lib/dates';
import { renderOg, pngResponse } from '../../../lib/og';

export const getStaticPaths = (async () =>
  (await getUpcomingEvents()).map((event) => ({ params: { slug: event.id }, props: { event } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const d = (props as { event: EventEntry }).event.data;
  const p = dateParts(parseLocal(d.start));
  const cancelled = d.status === 'cancelled';
  const cta = cancelled ? 'Шоу отменено'
    : d.seats === 'out' ? 'Sold out'
    : d.priceFrom ? `Билеты от ${d.priceFrom.toLocaleString('ru-RU')} ₽` : 'Билеты на сайте';
  const kicker = `${p.long} · ${p.time}${d.status === 'moved' ? ' · перенесено' : ''}`;
  return pngResponse(await renderOg({ kicker, title: d.title, cta }));
};
