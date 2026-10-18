import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOg, pngResponse } from '../../../lib/og';

export const getStaticPaths = (async () =>
  (await getCollection('comedians', ({ data }) => data.visible)).map((comic) => ({ params: { slug: comic.id }, props: { comic } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const c = (props as { comic: CollectionEntry<'comedians'> }).comic.data;
  const kicker = c.role === 'resident' ? 'Резидент клуба' : c.city ? `Гость клуба · ${c.city}` : 'Гость клуба';
  return pngResponse(await renderOg({ kicker, title: c.name, cta: 'Ближайшие выступления' }));
};
