/**
 * Тесты защиты админки: каждый тест — попытка атаки, которая должна провалиться.
 * Запуск: npm run admin:test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handle, resetEpochCache, type Deps } from '../server/routes';
import { issueSession, startLogin, SESSION_COOKIE, LOGIN_COOKIE } from '../server/auth';
import { seal } from '../server/crypto';
import type { Config } from '../server/config';
import { parseAdmins } from '../server/config';
import type { Req, Res } from '../server/http';
import { LocalRepo } from '../dev/local-repo';
import { gitBlobSha } from '../server/repo';

const ORIGIN = 'https://admin.example.test';
let dir = '';
let deps: Deps;
const cfg: Config = {
  origin: ORIGIN, siteUrl: 'https://site.example.test',
  repo: { owner: 'o', name: 'n', branch: 'main' },
  github: { appId: '', privateKey: '', installationId: '', clientId: 'cid', clientSecret: 'sec' },
  admins: [{ id: 42, login: 'owner' }],
  sessionKey: randomBytes(32), sessionHours: 24, require2fa: true,
};
let identity: { id: number; login: string; twoFactor: boolean | undefined } | null = null;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'admin-test-'));
  await cp(join(process.cwd(), 'src/content'), join(dir, 'src/content'), { recursive: true });
  deps = { cfg, repo: new LocalRepo(dir), identify: async () => identity, assets: new Map([['/index.html', { type: 'text/html', body: Buffer.from('<!doctype html>') }]]) };
});
after(async () => { await rm(dir, { recursive: true, force: true }); });

const cookieOf = (setCookie: string) => setCookie.split(';')[0];
const goodCookie = () => cookieOf(issueSession(cfg, 42, 'owner', 0));

function req(method: string, path: string, o: { body?: unknown; cookie?: string; headers?: Record<string, string>; raw?: string } = {}): Req {
  const u = new URL(path, ORIGIN);
  const isWrite = method !== 'GET';
  return {
    method, path: u.pathname, query: Object.fromEntries(u.searchParams),
    headers: {
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...(isWrite ? { origin: ORIGIN, 'x-admin': '1', 'content-type': 'application/json' } : {}),
      ...(o.headers ?? {}),
    },
    body: Buffer.from(o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : '')),
    ip: '203.0.113.1',
  };
}
const call = (r: Req) => handle(r, deps);
const body = (r: Res) => JSON.parse(String(r.body));
async function eventSha(id: string) { return gitBlobSha(await readFile(join(dir, `src/content/events/${id}.md`))); }
const validEvent = { title: 'Тест', format: 'standup', start: '2026-12-01T19:00', age: '18+', seats: 'ok', status: 'plan', comedians: [], published: false };

// ---------- вход и сессия ----------

test('без входа данные не отдаются', async () => {
  assert.equal((await call(req('GET', '/api/content'))).status, 401);
});

test('поддельная cookie отклоняется', async () => {
  assert.equal((await call(req('GET', '/api/content', { cookie: `${SESSION_COOKIE}=abc.def.ghi` }))).status, 401);
  const otherKey = seal({ v: 1, uid: 42, login: 'owner', iat: Date.now(), exp: Date.now() + 1e6, epoch: 0 }, randomBytes(32), 'session');
  assert.equal((await call(req('GET', '/api/content', { cookie: `${SESSION_COOKIE}=${otherKey}` }))).status, 401);
});

test('cookie входа нельзя выдать за cookie сессии (разный контекст шифрования)', async () => {
  const asLogin = seal({ v: 1, uid: 42, login: 'owner', iat: Date.now(), exp: Date.now() + 1e6, epoch: 0 }, cfg.sessionKey, 'login');
  assert.equal((await call(req('GET', '/api/content', { cookie: `${SESSION_COOKIE}=${asLogin}` }))).status, 401);
});

test('просроченная сессия не действует', async () => {
  const old = seal({ v: 1, uid: 42, login: 'owner', iat: 0, exp: Date.now() - 1000, epoch: 0 }, cfg.sessionKey, 'session');
  assert.equal((await call(req('GET', '/api/content', { cookie: `${SESSION_COOKIE}=${old}` }))).status, 401);
});

test('человек, удалённый из белого списка, теряет доступ сразу', async () => {
  const c = cookieOf(issueSession(cfg, 777, 'stranger', 0));
  assert.equal((await call(req('GET', '/api/content', { cookie: c }))).status, 401);
});

test('с правильной сессией данные отдаются, заголовки защиты на месте', async () => {
  const r = await call(req('GET', '/api/content', { cookie: goodCookie() }));
  assert.equal(r.status, 200);
  assert.match(r.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(r.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(r.headers['X-Frame-Options'], 'DENY');
  assert.match(r.headers['Strict-Transport-Security'], /max-age=/);
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('cookie сессии: HttpOnly, Secure, SameSite=Strict, префикс __Host-', () => {
  const c = issueSession(cfg, 42, 'owner', 0);
  assert.match(c, /^__Host-/); assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Strict/); assert.match(c, /Path=\//);
  assert.doesNotMatch(c, /Domain=/);
});

// ---------- вход через GitHub ----------

function loginCookie() {
  const { url, cookie } = startLogin(cfg);
  const state = new URL(url).searchParams.get('state')!;
  assert.equal(new URL(url).searchParams.get('code_challenge_method'), 'S256');
  return { state, cookie: cookieOf(cookie) };
}

test('вход: чужой state отклоняется', async () => {
  const { cookie } = loginCookie();
  identity = { id: 42, login: 'owner', twoFactor: true };
  const r = await call(req('GET', '/api/auth/callback?code=abc&state=wrong', { cookie }));
  assert.equal(r.status, 302); assert.match(r.headers.Location, /e=state/);
});

test('вход: без cookie входа (атака «подсунуть свою ссылку») отклоняется', async () => {
  const { state } = loginCookie();
  const r = await call(req('GET', `/api/auth/callback?code=abc&state=${state}`));
  assert.match(r.headers.Location, /e=state/);
});

test('вход: аккаунт не из списка не пускается', async () => {
  const { state, cookie } = loginCookie();
  identity = { id: 999, login: 'hacker', twoFactor: true };
  const r = await call(req('GET', `/api/auth/callback?code=abc&state=${state}`, { cookie }));
  assert.match(r.headers.Location, /e=not_allowed/);
  assert.ok(!(r.cookies ?? []).some((c) => c.startsWith(SESSION_COOKIE) && !c.includes('Max-Age=0')));
});

test('вход: без двухфакторной защиты не пускается', async () => {
  for (const twoFactor of [false, undefined]) {
    const { state, cookie } = loginCookie();
    identity = { id: 42, login: 'owner', twoFactor };
    const r = await call(req('GET', `/api/auth/callback?code=abc&state=${state}`, { cookie }));
    assert.match(r.headers.Location, /e=no_2fa/);
  }
});

test('вход: свой аккаунт с 2FA — выдаётся сессия', async () => {
  const { state, cookie } = loginCookie();
  identity = { id: 42, login: 'owner', twoFactor: true };
  const r = await call(req('GET', `/api/auth/callback?code=abc&state=${state}`, { cookie }));
  assert.equal(r.headers.Location, '/#/shows');
  const s = (r.cookies ?? []).find((c) => c.startsWith(SESSION_COOKIE));
  assert.ok(s && !s.includes('Max-Age=0'));
  assert.ok((r.cookies ?? []).some((c) => c.startsWith(LOGIN_COOKIE) && c.includes('Max-Age=0')), 'cookie входа стирается');
});

// ---------- CSRF ----------

test('CSRF: запрос с чужого сайта отклоняется', async () => {
  const first = (await readdir(join(dir, 'src/content/events')))[0].replace(/\.md$/, '');
  const sha = await eventSha(first);
  const evil = req('DELETE', `/api/entries/events/${first}`, { cookie: goodCookie(), body: { baseSha: sha }, headers: { origin: 'https://evil.example' } });
  assert.equal((await call(evil)).status, 403);
});

test('CSRF: без заголовка X-Admin отклоняется', async () => {
  const r = req('PUT', '/api/settings', { cookie: goodCookie(), body: {} });
  delete r.headers['x-admin'];
  assert.equal((await call(r)).status, 403);
});

test('CSRF: обычная HTML-форма (text/plain) отклоняется', async () => {
  const r = req('PUT', '/api/settings', { cookie: goodCookie(), body: {}, headers: { 'content-type': 'text/plain' } });
  assert.equal((await call(r)).status, 403);
});

// ---------- пути и имена файлов ----------

test('выход за пределы папки через имя записи невозможен', async () => {
  for (const id of ['..%2F..%2Fastro.config', '../x', 'ABC', 'a/b', 'x.md', '-x', 'a--']) {
    const r = await call(req('PUT', `/api/entries/events/${id}`, { cookie: goodCookie(), body: { data: validEvent, body: '', baseSha: null } }));
    assert.ok([400, 404].includes(r.status), `id ${id}: ${r.status}`);
  }
});

test('история и откат — только для файлов контента, не для кода сайта', async () => {
  for (const path of ['.github/workflows/deploy.yml', 'astro.config.mjs', 'src/pages/index.astro', 'package.json', 'src/content/../../package.json', 'admin-state.json']) {
    const h = await call(req('GET', `/api/history?path=${encodeURIComponent(path)}`, { cookie: goodCookie() }));
    assert.equal(h.status, 400, path);
    const r = await call(req('POST', '/api/restore', { cookie: goodCookie(), body: { path, commit: 'a'.repeat(40) } }));
    assert.equal(r.status, 400, path);
  }
});

// ---------- проверка данных ----------

async function putEvent(data: Record<string, unknown>, text = '') {
  return call(req('PUT', '/api/entries/events/2026-12-01-test', { cookie: goodCookie(), body: { data, body: text, baseSha: null } }));
}

test('ссылки javascript:, data:, http: и с паролем отклоняются', async () => {
  for (const ticketUrl of ['javascript:alert(1)', 'data:text/html,<script>', 'http://perm.qtickets.events/', 'https://user:pass@evil.example/', 'JaVaScRiPt:alert(1)']) {
    const r = await putEvent({ ...validEvent, ticketUrl });
    assert.equal(r.status, 422, ticketUrl);
  }
});

test('видео и соцсети — только с разрешённых доменов', async () => {
  const base = { name: 'Тест', role: 'guest', videos: [], order: 1, visible: true };
  const put = (data: Record<string, unknown>) => call(req('PUT', '/api/entries/comedians/test-comic', { cookie: goodCookie(), body: { data, body: '', baseSha: null } }));
  assert.equal((await put({ ...base, videos: ['https://evil.example/video'] })).status, 422);
  assert.equal((await put({ ...base, videos: ['https://rutube.ru.evil.example/x'] })).status, 422);
  assert.equal((await put({ ...base, telegram: 'https://t.me.evil.example/x' })).status, 422);
  assert.equal((await put({ ...base, vk: 'https://evil.example/vk.com' })).status, 422);
});

test('картинка — только загруженная через админку', async () => {
  for (const cover of ['/uploads/../../index.html', 'https://evil.example/x.jpg', '/uploads/x.svg', '/uploads/short.jpg', '//evil.example/a.jpg']) {
    assert.equal((await putEvent({ ...validEvent, cover })).status, 422, cover);
  }
});

test('лишние поля и переводы строк (подмена YAML) отклоняются', async () => {
  assert.equal((await putEvent({ ...validEvent, layout: '../../evil' })).status, 422);
  assert.equal((await putEvent({ ...validEvent, title: 'x\n---\nlayout: evil' })).status, 422);
  assert.equal((await putEvent({ ...validEvent, title: 'x‮evil' })).status, 422);
});

test('несуществующий комик в составе отклоняется', async () => {
  assert.equal((await putEvent({ ...validEvent, comedians: ['no-such-comic'] })).status, 422);
});

test('нормальное шоу сохраняется; «<script>» в описании хранится как обычный текст', async () => {
  const r = await putEvent({ ...validEvent, comedians: ['artem-dyldin'] }, 'Привет <script>alert(1)</script>');
  assert.equal(r.status, 200, String(r.body));
  const saved = await readFile(join(dir, 'src/content/events/2026-12-01-test.md'), 'utf8');
  assert.match(saved, /^---\n/);
  assert.match(saved, /title: Тест/);
});

test('повторное создание того же шоу и устаревшая версия дают конфликт, а не перезапись', async () => {
  assert.equal((await putEvent(validEvent)).status, 409);
  const stale = 'b'.repeat(40);
  const r = await call(req('PUT', '/api/entries/events/2026-12-01-test', { cookie: goodCookie(), body: { data: validEvent, body: '', baseSha: stale } }));
  assert.equal(r.status, 409);
});

test('комика из состава шоу удалить нельзя', async () => {
  const sha = gitBlobSha(await readFile(join(dir, 'src/content/comedians/artem-dyldin.md')));
  const r = await call(req('DELETE', '/api/entries/comedians/artem-dyldin', { cookie: goodCookie(), body: { baseSha: sha } }));
  assert.equal(r.status, 409);
});

test('настройки: ссылка записи на open mic — только Telegram/VK', async () => {
  const cur = JSON.parse(await readFile(join(dir, 'src/content/settings.json'), 'utf8'));
  const sha = gitBlobSha(await readFile(join(dir, 'src/content/settings.json')));
  const r = await call(req('PUT', '/api/settings', { cookie: goodCookie(), body: { data: { ...cur, links: { ...cur.links, openMicHost: 'https://evil.example' } }, baseSha: sha } }));
  assert.equal(r.status, 422);
  const ok = await call(req('PUT', '/api/settings', { cookie: goodCookie(), body: { data: { ...cur, links: { ...cur.links, openMicHost: 'https://t.me/host' } }, baseSha: sha } }));
  assert.equal(ok.status, 200, String(ok.body));
});

// ---------- загрузка файлов ----------

const upload = (buf: Buffer) => call(req('POST', '/api/upload', { cookie: goodCookie(), body: { data: buf.toString('base64') } }));

test('SVG, HTML и «картинка» с подменённым содержимым не загружаются', async () => {
  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.padEnd(100)))).status, 415);
  assert.equal((await upload(Buffer.from('<html><script>alert(1)</script></html>'.padEnd(100)))).status, 415);
  const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<script>'.padEnd(100)), Buffer.from([0x00, 0x00])]);
  assert.equal((await upload(fakeJpeg)).status, 415);
  assert.ok([413, 415].includes((await upload(Buffer.alloc(3_000_000, 0xff))).status), 'слишком большой файл');
});

test('настоящий JPEG загружается под именем, которое придумывает сервер', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(200), Buffer.from([0xff, 0xd9])]);
  const r = await upload(jpeg);
  assert.equal(r.status, 200);
  assert.match(body(r).src, /^\/uploads\/\d{4}-\d{2}-\d{2}-[a-z0-9x]{12}\.jpg$/);
});

test('отдача файлов — только картинки из uploads', async () => {
  for (const path of ['src/content/settings.json', 'public/uploads/../../package.json', '.env']) {
    assert.equal((await call(req('GET', `/api/file?path=${encodeURIComponent(path)}`, { cookie: goodCookie() }))).status, 400, path);
  }
});

// ---------- выход везде ----------

test('«выйти на всех устройствах» делает старые сессии недействительными', async () => {
  const before = goodCookie();
  const r = await call(req('POST', '/api/auth/logout-all', { cookie: before, body: {} }));
  assert.equal(r.status, 200);
  resetEpochCache();
  assert.equal((await call(req('GET', '/api/content', { cookie: before }))).status, 401);
  const fresh = cookieOf(issueSession(cfg, 42, 'owner', 1));
  assert.equal((await call(req('GET', '/api/content', { cookie: fresh }))).status, 200);
});

// ---------- настройки сервера ----------

test('белый список: мусор в настройке не принимается', () => {
  assert.throws(() => parseAdmins(''));
  assert.throws(() => parseAdmins('abc:login'));
  assert.throws(() => parseAdmins('12:bad login'));
  assert.deepEqual(parseAdmins('12:nikita, 34:anna'), [{ id: 12, login: 'nikita' }, { id: 34, login: 'anna' }]);
});

test('слишком большой запрос отклоняется', async () => {
  const r = await call(req('PUT', '/api/settings', { cookie: goodCookie(), raw: 'x'.repeat(4_100_000) }));
  assert.equal(r.status, 413);
});
