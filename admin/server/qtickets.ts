/**
 * Подтягивание данных шоу со страницы Qtickets.
 *
 * Защита от SSRF (когда сервер заставляют сходить «куда-то не туда»):
 *  - только https и только домены вида <город>.qtickets.events;
 *  - без перенаправлений (redirect: 'manual' → отказ);
 *  - таймаут 8 секунд и не больше 1,5 МБ ответа;
 *  - из ответа берём только текст, никакой HTML дальше не передаётся.
 * Результат — подсказка: админ проверяет поля перед сохранением.
 */
const HOST_RE = /^[a-z0-9-]{1,40}\.qtickets\.events$/;
const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

export function checkQticketsUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (!HOST_RE.test(u.hostname)) return null;
    if (!/^\/\d{3,9}(-[a-z0-9-]{1,150})?\/?$/.test(u.pathname)) return null;
    u.search = ''; u.hash = '';
    return u;
  } catch { return null; }
}

export interface Imported {
  title?: string;
  start?: string;      // 2026-10-24T18:30
  priceFrom?: number;
  age?: '18+' | '16+';
  description?: string;
  ticketUrl: string;
  sure: string[];      // какие поля найдены надёжно
}

const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#(\d{1,7});/g, (_, n) => (Number(n) > 0 && Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : ' '))
  .replace(/&amp;/g, '&');
const CTRL = new RegExp('[\\u0000-\\u001F\\u007F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'g');
const clean = (s: string, max: number) => decode(s).replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const meta = (html: string, prop: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  return (re.exec(html) ?? re2.exec(html))?.[1];
};

/** Разбор HTML страницы события (отдельно от сети — чтобы проверять тестами) */
export function parseQtickets(html: string, url: string, now = new Date()): Imported {
  const out: Imported = { ticketUrl: url, sure: [] };

  // Название: «Билеты на <название>, <площадка> (Пермь) – Qtickets Афиша»
  const ogTitle = meta(html, 'og:title') ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  if (ogTitle) {
    let t = clean(ogTitle, 300).replace(/^Билеты на\s+/i, '').replace(/\s+[–—-]\s+Qtickets.*$/i, '');
    t = t.replace(/,\s*[^,]*\([^)]*\)\s*$/, '').replace(/^["«](.*)["»]$/, '$1').trim();
    if (t) { out.title = t.slice(0, 120); out.sure.push('title'); }
  }

  const desc = meta(html, 'og:description') ?? meta(html, 'description');
  if (desc) out.description = clean(desc, 3000);

  // Дата и время: сначала машиночитаемые (JSON-LD / microdata), потом текст «17 октября … 18:30»
  const iso = /"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(html)
    ?? /itemprop=["']startDate["'][^>]*content=["'](\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(html);
  if (iso) { out.start = `${iso[1]}T${iso[2]}:${iso[3]}`; out.sure.push('start'); }
  else {
    const body = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '), 200_000);
    const m = /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?[^\d]{0,40}?(\d{1,2}):(\d{2})/.exec(body);
    if (m) {
      const day = Number(m[1]); const mon = MONTHS[m[2]];
      let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
      // без года: если дата уже прошла больше месяца назад — значит, следующий год
      if (!m[3] && Date.UTC(year, mon - 1, day) < now.getTime() - 30 * 86400_000) year += 1;
      const hh = String(Number(m[4])).padStart(2, '0');
      if (day >= 1 && day <= 31 && Number(hh) < 24) out.start = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hh}:${m[5]}`;
    }
    const age = /\b(18|16)\+/.exec(body);
    if (age) out.age = `${age[1]}+` as '18+' | '16+';
  }

  const low = /"lowPrice"\s*:\s*"?(\d{2,6})/.exec(html) ?? /"price"\s*:\s*"?(\d{2,6})/.exec(html);
  if (low) { out.priceFrom = Number(low[1]); out.sure.push('priceFrom'); }
  return out;
}

export async function fetchQtickets(raw: string): Promise<Imported | null> {
  const u = checkQticketsUrl(raw);
  if (!u) return null;
  const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'permstandup-admin', Accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
  if (r.status !== 200 || !(r.headers.get('content-type') ?? '').includes('text/html')) return null;
  const reader = r.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1_500_000) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return parseQtickets(Buffer.concat(chunks).toString('utf8'), u.toString());
}
