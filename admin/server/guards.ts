/** Проверки, через которые проходит каждый запрос: CSRF, ограничение частоты, проверка картинок. */
import type { Req } from './http';

/**
 * Защита от подделки запросов с чужих сайтов (CSRF).
 * Изменяющий запрос принимается, только если:
 *  - Origin (или Sec-Fetch-Site) говорит, что он пришёл с самой админки;
 *  - есть заголовок X-Admin: 1 — его нельзя выставить из обычной формы на чужом сайте,
 *    а для fetch с другого сайта браузер потребует разрешения CORS, которого мы не даём;
 *  - тело — JSON.
 * Плюс cookie сессии с SameSite=Strict не уходит с чужих сайтов вообще.
 */
export function csrfOk(req: Req, origin: string): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const o = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  const sameOrigin = o ? o === origin : site === 'same-origin';
  const ct = (req.headers['content-type'] ?? '').split(';')[0].trim();
  return sameOrigin && req.headers['x-admin'] === '1' && ct === 'application/json';
}

/** Простое ограничение частоты в памяти экземпляра функции (основной лимит — на API Gateway). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) { this.hits.set(key, list); return false; }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

/** Максимальный размер картинки после сжатия в браузере */
export const MAX_IMAGE_BYTES = 2_500_000;

/**
 * Принимаем только настоящие JPEG и WebP — по «магическим» байтам, а не по имени файла.
 * SVG, HTML, PDF и всё остальное отклоняется (SVG может содержать скрипт).
 */
export function sniffImage(buf: Buffer): 'jpg' | 'webp' | null {
  if (buf.length < 64 || buf.length > MAX_IMAGE_BYTES) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.readUInt32LE(4) + 8 === buf.length) return 'webp';
  return null;
}
