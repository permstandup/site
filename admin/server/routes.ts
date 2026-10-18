/** Маршруты админки. Любой путь /api/* кроме входа требует действующей сессии. */
import { z } from 'zod';
import type { Config } from './config';
import { finishLogin, logoutCookies, readSession, startLogin, type Session } from './auth';
import { csrfOk, RateLimiter, sniffImage } from './guards';
import { error, json, redirect, securityHeaders, type Req, type Res } from './http';
import { ConflictError, type Repo } from './repo';
import { randomToken } from './crypto';
import {
  PATHS, comedianInput, dirOf, entryPath, eventInput, isAllowedPath, issues, listInputs,
  parseEntry, serializeEntry, settingsSchema, type Kind,
} from './content';
import { SLUG_RE, eventSchema, comedianSchema } from '../../shared/schema';

export interface Deps {
  cfg: Config;
  repo: Repo;
  identify: (code: string, verifier: string) => Promise<{ id: number; login: string; twoFactor: boolean | undefined } | null>;
  assets: Map<string, { type: string; body: Buffer }>;
  log?: (entry: Record<string, unknown>) => void;
}

const MAX_BODY = 4_000_000;
const loginLimiter = new RateLimiter(20, 10 * 60_000);
const writeLimiter = new RateLimiter(60, 60_000);
const readLimiter = new RateLimiter(300, 60_000);

// ---------- эпоха сессий ----------
let epochCache: { value: number; until: number } | null = null;
async function getEpoch(repo: Repo): Promise<number> {
  if (epochCache && epochCache.until > Date.now()) return epochCache.value;
  const f = await repo.readFile(PATHS.state);
  let value = 0;
  if (f) { try { value = Number(JSON.parse(f.content.toString('utf8')).sessionEpoch) || 0; } catch { value = 0; } }
  epochCache = { value, until: Date.now() + 30_000 };
  return value;
}
export const resetEpochCache = () => { epochCache = null; };

// ---------- помощники ----------
const author = (s: Session) => ({ name: s.login, email: `${s.uid}+${s.login}@users.noreply.github.com` });
function readJson(req: Req): unknown {
  try { return JSON.parse(req.body.toString('utf8')); } catch { return undefined; }
}
const baseShaSchema = z.string().regex(/^[0-9a-f]{40}$/).nullable();

async function conflictSafe(fn: () => Promise<Res>): Promise<Res> {
  try { return await fn(); } catch (e) {
    if (e instanceof ConflictError) return error(409, 'Эту запись только что изменил кто-то другой. Обновите страницу, чтобы увидеть свежую версию.');
    throw e;
  }
}

function withHeaders(cfg: Config, res: Res): Res {
  return { ...res, headers: { ...securityHeaders(cfg.siteUrl), ...res.headers } };
}

export async function handle(req: Req, d: Deps): Promise<Res> {
  try {
    return withHeaders(d.cfg, await route(req, d));
  } catch (e) {
    d.log?.({ level: 'error', path: req.path, msg: e instanceof Error ? e.message : String(e) });
    return withHeaders(d.cfg, error(500, 'Не получилось — попробуйте ещё раз через минуту'));
  }
}

async function route(req: Req, d: Deps): Promise<Res> {
  const { cfg, repo } = d;
  const p = req.path;

  if (!p.startsWith('/api/')) return serveAsset(p, d);
  if (req.body.length > MAX_BODY) return error(413, 'Слишком большой запрос');
  if (!csrfOk(req, cfg.origin)) return error(403, 'Запрос отклонён');

  // ----- вход -----
  if (p === '/api/auth/login' && req.method === 'GET') {
    if (!loginLimiter.allow(`l:${req.ip}`)) return error(429, 'Слишком много попыток входа. Подождите 10 минут.');
    const { url, cookie } = startLogin(cfg);
    return redirect(url, [cookie]);
  }
  if (p === '/api/auth/callback' && req.method === 'GET') {
    if (!loginLimiter.allow(`l:${req.ip}`)) return redirect('/#/login?e=rate');
    const epoch = await getEpoch(repo);
    const r = await finishLogin(cfg, req, epoch, d.identify);
    d.log?.({ level: 'audit', action: 'login', ok: r.ok, reason: r.ok ? undefined : r.reason, uid: r.ok ? r.admin.id : undefined, ip: req.ip });
    if (!r.ok) return redirect(`/#/login?e=${r.reason}`, logoutCookies());
    return redirect('/#/shows', [r.cookie, logoutCookies()[1]]);
  }

  // ----- всё остальное — только с сессией -----
  const epoch = await getEpoch(repo);
  const s = readSession(cfg, req, epoch);
  if (!s) return { ...error(401, 'Нужно войти'), cookies: logoutCookies() };
  const isWrite = req.method !== 'GET';
  if (!(isWrite ? writeLimiter : readLimiter).allow(`u:${s.uid}`)) return error(429, 'Слишком много действий подряд. Подождите минуту.');
  const audit = (action: string, extra: Record<string, unknown> = {}) =>
    d.log?.({ level: 'audit', action, uid: s.uid, login: s.login, ip: req.ip, ...extra });

  if (p === '/api/session' && req.method === 'GET') {
    return json(200, { login: s.login, expires: s.exp, admins: cfg.admins.map((a) => a.login), require2fa: cfg.require2fa });
  }
  if (p === '/api/auth/logout' && req.method === 'POST') {
    audit('logout');
    return { ...json(200, { ok: true }), cookies: logoutCookies() };
  }
  if (p === '/api/auth/logout-all' && req.method === 'POST') {
    const cur = await repo.readFile(PATHS.state);
    const next = { sessionEpoch: epoch + 1, rotatedAt: new Date().toISOString(), nonce: randomToken(8) };
    await repo.commit([{ path: PATHS.state, content: Buffer.from(JSON.stringify(next, null, 2) + '\n') }],
      `Админка: выход на всех устройствах (${s.login})`, author(s), { [PATHS.state]: cur?.sha ?? null });
    resetEpochCache();
    audit('logout_all');
    return { ...json(200, { ok: true }), cookies: logoutCookies() };
  }

  if (p === '/api/content' && req.method === 'GET') return json(200, await loadAll(repo));

  // ----- шоу и комики -----
  const em = /^\/api\/entries\/(events|comedians)\/([a-z0-9-]{1,80})$/.exec(p);
  if (em) {
    const kind = em[1] as Kind;
    const id = em[2];
    if (!SLUG_RE.test(id)) return error(400, 'Неверный адрес записи');
    const path = entryPath(kind, id);
    const body = readJson(req) as Record<string, unknown> | undefined;
    if (!body) return error(400, 'Неверный запрос');
    const base = baseShaSchema.safeParse(body.baseSha);
    if (!base.success) return error(400, 'Неверный запрос');

    if (req.method === 'PUT') {
      const parsed = (kind === 'events' ? eventInput : comedianInput).safeParse({ data: body.data, body: body.body });
      if (!parsed.success) return error(422, 'Проверьте поля', { issues: issues(parsed.error) });
      const data = parsed.data.data as Record<string, unknown>;
      if (kind === 'events') {
        const known = new Set((await repo.readDir(PATHS.comediansDir)).map((f) => f.path.split('/').pop()!.replace(/\.md$/, '')));
        const missing = (data.comedians as string[]).filter((c) => !known.has(c));
        if (missing.length) return error(422, 'Проверьте поля', { issues: [{ path: 'comedians', message: `Нет комиков: ${missing.join(', ')}` }] });
        if (data.status !== 'moved') delete data.movedFrom;
        if (data.status !== 'cancelled') delete data.cancelReason;
      }
      const content = Buffer.from(serializeEntry(data, parsed.data.body));
      const title = String(data.title ?? data.name);
      return conflictSafe(async () => {
        const sha = await repo.commit([{ path, content }],
          `Админка: ${kind === 'events' ? 'шоу' : 'комик'} «${title}» — ${base.data ? 'изменено' : 'создано'} (${s.login})`,
          author(s), { [path]: base.data });
        audit(base.data ? 'update' : 'create', { path });
        return json(200, { ok: true, commit: sha });
      });
    }

    if (req.method === 'DELETE') {
      if (!base.data) return error(400, 'Неверный запрос');
      if (kind === 'comedians') {
        const events = await repo.readDir(PATHS.eventsDir);
        const used = events.filter((f) => {
          const c = f.text ? parseEntry(f.text).data.comedians : undefined;
          return Array.isArray(c) && c.includes(id);
        });
        if (used.length) return error(409, `Комик указан в ${used.length} шоу. Уберите его из состава или просто скройте с сайта.`);
      }
      return conflictSafe(async () => {
        const sha = await repo.commit([{ path, content: null }], `Админка: удалено ${path.split('/').pop()} (${s.login})`, author(s), { [path]: base.data });
        audit('delete', { path });
        return json(200, { ok: true, commit: sha });
      });
    }
    return error(405, 'Метод не поддерживается');
  }

  // ----- порядок комиков: один коммит на все файлы -----
  if (p === '/api/comedians-order' && req.method === 'PUT') {
    const parsed = z.object({ items: z.array(z.object({ id: z.string().regex(SLUG_RE).max(80), baseSha: z.string().regex(/^[0-9a-f]{40}$/) }).strict()).min(1).max(200) }).strict()
      .safeParse(readJson(req));
    if (!parsed.success) return error(400, 'Неверный запрос');
    const files = new Map((await repo.readDir(PATHS.comediansDir)).map((f) => [f.path, f]));
    const changes: Array<{ path: string; content: Buffer }> = [];
    const expect: Record<string, string> = {};
    for (const [i, it] of parsed.data.items.entries()) {
      const path = entryPath('comedians', it.id);
      const f = files.get(path);
      if (!f || f.text === null) return error(409, 'Список комиков изменился — обновите страницу');
      const { data, body } = parseEntry(f.text);
      const check = comedianInput.safeParse({ data: { ...data, order: (i + 1) * 10 }, body });
      if (!check.success) return error(422, `Комик ${it.id}: данные не проходят проверку`, { issues: issues(check.error) });
      changes.push({ path, content: Buffer.from(serializeEntry(check.data.data as Record<string, unknown>, check.data.body)) });
      expect[path] = it.baseSha;
    }
    return conflictSafe(async () => {
      const sha = await repo.commit(changes, `Админка: порядок комиков (${s.login})`, author(s), expect);
      audit('reorder', { count: changes.length });
      return json(200, { ok: true, commit: sha });
    });
  }

  // ----- списки и настройки -----
  const lm = /^\/api\/(gallery|videos|settings)$/.exec(p);
  if (lm && req.method === 'PUT') {
    const name = lm[1] as 'gallery' | 'videos' | 'settings';
    const body = readJson(req) as Record<string, unknown> | undefined;
    const base = baseShaSchema.safeParse(body?.baseSha);
    if (!body || !base.success || !base.data) return error(400, 'Неверный запрос');
    const schema = name === 'settings' ? settingsSchema : listInputs[name];
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return error(422, 'Проверьте поля', { issues: issues(parsed.error) });
    const path = PATHS[name];
    const content = Buffer.from(JSON.stringify(parsed.data, null, 2) + '\n');
    const label = { gallery: 'фото из клуба', videos: 'видео', settings: 'настройки клуба' }[name];
    return conflictSafe(async () => {
      const sha = await repo.commit([{ path, content }], `Админка: ${label} — изменено (${s.login})`, author(s), { [path]: base.data });
      audit('update', { path });
      return json(200, { ok: true, commit: sha });
    });
  }

  // ----- загрузка фото -----
  if (p === '/api/upload' && req.method === 'POST') {
    const body = readJson(req) as { data?: unknown } | undefined;
    if (!body || typeof body.data !== 'string' || body.data.length > 3_400_000 || !/^[A-Za-z0-9+/]+=*$/.test(body.data)) {
      return error(400, 'Неверный файл');
    }
    const buf = Buffer.from(body.data, 'base64');
    const ext = sniffImage(buf);
    if (!ext) return error(415, 'Нужна фотография JPG или WebP до 2,5 МБ');
    // Имя файла придумывает сервер — пользовательское имя файла не используется вообще
    const name = `${new Date().toISOString().slice(0, 10)}-${randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, 'x')}.${ext}`;
    const path = `${PATHS.uploadsDir}/${name}`;
    const sha = await repo.commit([{ path, content: buf }], `Админка: загружено фото ${name} (${s.login})`, author(s), { [path]: null });
    audit('upload', { path, bytes: buf.length });
    return json(200, { ok: true, src: `/uploads/${name}`, commit: sha });
  }

  if (p === '/api/file' && req.method === 'GET') {
    const path = req.query.path ?? '';
    if (!/^public\/uploads\/[a-z0-9-]{8,80}\.(jpg|webp)$/.test(path)) return error(400, 'Неверный путь');
    const f = await repo.readFile(path);
    if (!f) return error(404, 'Нет файла');
    const type = path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    if (!sniffImage(f.content)) return error(415, 'Не картинка');
    return { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' }, body: f.content };
  }

  // ----- история и откат -----
  if (p === '/api/history' && req.method === 'GET') {
    const path = req.query.path ?? '';
    if (!isAllowedPath(path)) return error(400, 'Неверный путь');
    return json(200, { items: await repo.history(path, 15) });
  }
  if (p === '/api/restore' && req.method === 'POST') {
    const body = readJson(req) as { path?: unknown; commit?: unknown } | undefined;
    const path = typeof body?.path === 'string' ? body.path : '';
    const commit = typeof body?.commit === 'string' ? body.commit : '';
    if (!isAllowedPath(path) || path.startsWith('public/') || !/^[0-9a-f]{40}$/.test(commit)) return error(400, 'Неверный запрос');
    const old = await repo.readAt(path, commit);
    if (!old) return error(404, 'В этой версии файла нет');
    // Старую версию проверяем по ТЕКУЩИМ правилам — откат не может обойти проверки
    const raw = old.toString('utf8');
    const check = path.endsWith('.md')
      ? (path.startsWith(PATHS.eventsDir) ? eventInput : comedianInput).safeParse(parseEntry(raw))
      : (path === PATHS.settings ? settingsSchema : path === PATHS.gallery ? listInputs.gallery : listInputs.videos).safeParse(JSON.parse(raw));
    if (!check.success) return error(422, 'Эта версия не проходит текущие проверки — восстановить её нельзя', { issues: issues(check.error) });
    const cur = await repo.readFile(path);
    return conflictSafe(async () => {
      const sha = await repo.commit([{ path, content: old }], `Админка: возвращена версия ${commit.slice(0, 7)} для ${path.split('/').pop()} (${s.login})`, author(s), { [path]: cur?.sha ?? null });
      audit('restore', { path, from: commit });
      return json(200, { ok: true, commit: sha });
    });
  }

  return error(404, 'Не найдено');
}

async function loadAll(repo: Repo) {
  const entries = async (kind: Kind) => (await repo.readDir(dirOf(kind)))
    .filter((f) => f.path.endsWith('.md'))
    .map((f) => {
      const id = f.path.split('/').pop()!.replace(/\.md$/, '');
      const { data, body } = parseEntry(f.text ?? '');
      // Подставляем значения по умолчанию (как при сборке сайта)
      const parsed = (kind === 'events' ? eventSchema : comedianSchema).safeParse(data);
      return { id, sha: f.sha, data: parsed.success ? parsed.data : data, body, invalid: !parsed.success };
    });
  const jsonFile = async (path: string) => {
    const f = await repo.readFile(path);
    return f ? { sha: f.sha, data: JSON.parse(f.content.toString('utf8')) } : { sha: null, data: null };
  };
  const [events, comedians, gallery, videos, settings] = await Promise.all([
    entries('events'), entries('comedians'), jsonFile(PATHS.gallery), jsonFile(PATHS.videos), jsonFile(PATHS.settings),
  ]);
  return { events, comedians, gallery, videos, settings };
}

function serveAsset(path: string, d: Deps): Res {
  if (d.cfg && path === '/api') return error(404, 'Не найдено');
  const key = path === '/' || path === '' ? '/index.html' : path;
  const a = d.assets.get(key);
  if (!a) return error(404, 'Не найдено');
  const immutable = key.startsWith('/assets/');
  return { status: 200, headers: { 'Content-Type': a.type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store' }, body: a.body };
}
