/**
 * Локальная админка для проверки на своём компьютере: npm run admin:dev
 *  - слушает ТОЛЬКО 127.0.0.1 (из сети недоступна);
 *  - вход без GitHub: кнопка «Войти (локально)»;
 *  - правки пишутся прямо в файлы проекта (src/content, public/uploads),
 *    после чего их видно в `npm run dev`.
 * Боевая функция этого кода не содержит.
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handle, type Deps } from '../server/routes';
import { issueSession } from '../server/auth';
import { error, securityHeaders, type Req } from '../server/http';
import type { Config } from '../server/config';
import { LocalRepo } from './local-repo';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = resolve(process.cwd());
const UI = join(ROOT, 'admin/dist/ui');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function loadAssets() {
  const out = new Map<string, { type: string; body: Buffer }>();
  async function walk(dir: string, prefix: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}/${e.name}`);
      else out.set(`${prefix}/${e.name}`, { type: TYPES[extname(e.name)] ?? 'application/octet-stream', body: await readFile(join(dir, e.name)) });
    }
  }
  await walk(UI, '');
  return out;
}

const cfg: Config = {
  origin: `http://localhost:${PORT}`,
  siteUrl: 'http://localhost:4321',
  repo: { owner: 'local', name: 'local', branch: 'main' },
  github: { appId: '', privateKey: '', installationId: '', clientId: '', clientSecret: '' },
  admins: [{ id: 1, login: 'local-admin' }],
  sessionKey: randomBytes(32),
  sessionHours: 12,
  require2fa: true,
};

const deps: Deps = {
  cfg,
  repo: new LocalRepo(ROOT),
  identify: async () => null,
  assets: await loadAssets(),
  log: (e) => console.log('[admin]', JSON.stringify(e)),
};

createServer(async (r, w) => {
  const chunks: Buffer[] = [];
  for await (const c of r) chunks.push(c as Buffer);
  const u = new URL(r.url ?? '/', cfg.origin);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) if (typeof v === 'string') headers[k] = v;
  const req: Req = { method: r.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), headers, body: Buffer.concat(chunks), ip: '127.0.0.1' };

  let res;
  if (req.path === '/api/auth/login') {
    // Локальный вход: сразу выдаём сессию тестовому администратору
    res = { status: 302, headers: { ...securityHeaders(cfg.siteUrl), Location: '/#/shows' }, cookies: [issueSession(cfg, 1, 'local-admin', 0)], body: '' };
  } else if (req.path === '/api/auth/logout-all') {
    res = { ...error(400, 'В локальном режиме не нужно'), headers: securityHeaders(cfg.siteUrl) };
  } else {
    if (req.path === '/' || req.path.startsWith('/assets/')) deps.assets = await loadAssets();
    res = await handle(req, deps);
  }
  w.statusCode = res.status;
  for (const [k, v] of Object.entries(res.headers)) {
    // HSTS на localhost не ставим, upgrade-insecure-requests тоже — иначе браузер уйдёт на https
    if (k === 'Strict-Transport-Security') continue;
    w.setHeader(k, k === 'Content-Security-Policy' ? v.replace('; upgrade-insecure-requests', '') : v);
  }
  if (res.cookies) w.setHeader('Set-Cookie', res.cookies);
  w.end(res.body);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Админка (локально): http://localhost:${PORT}  — правки пишутся в файлы проекта`);
});
