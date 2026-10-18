/** Простые типы запроса/ответа, cookie и защитные HTTP-заголовки. */

export interface Req {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>; // имена в нижнем регистре
  body: Buffer;
  ip: string;
}

export interface Res {
  status: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: Buffer | string;
}

/**
 * Заголовки на КАЖДЫЙ ответ админки.
 *  - CSP: только свои скрипты/стили, никаких внешних ресурсов, запрет встраивания в чужие сайты;
 *  - HSTS: только https;
 *  - no-store: ответы API не кешируются ни браузером, ни прокси.
 */
export function securityHeaders(siteUrl: string): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      `img-src 'self' blob: data: ${siteUrl}`,
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self' https://github.com",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

export const json = (status: number, data: unknown): Res => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(data),
});

export const error = (status: number, message: string, extra?: Record<string, unknown>) =>
  json(status, { error: message, ...extra });

export const redirect = (location: string, cookies?: string[]): Res => ({
  status: 302,
  headers: { Location: location, 'Cache-Control': 'no-store' },
  cookies,
  body: '',
});

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

interface CookieOpts { maxAge: number; sameSite: 'Strict' | 'Lax'; path?: string }
/** Cookie с префиксом __Host-: только https, только этот домен, без доступа из JavaScript. */
export function setCookie(name: string, value: string, o: CookieOpts): string {
  return `${name}=${value}; Path=${o.path ?? '/'}; Max-Age=${o.maxAge}; HttpOnly; Secure; SameSite=${o.sameSite}`;
}
export const clearCookie = (name: string, path = '/') =>
  `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
