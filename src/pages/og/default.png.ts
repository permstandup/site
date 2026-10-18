import { renderOg, pngResponse } from '../../lib/og';

export async function GET() {
  return pngResponse(await renderOg({ kicker: 'Стендап в Перми', title: 'Пермский стендап клуб', cta: 'Афиша на сайте' }));
}
