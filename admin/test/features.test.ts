/** Тесты новых возможностей: серии шоу, Qtickets, настройки главной/темы/плашки/SEO — и попытки их обойти */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handle, type Deps } from '../server/routes';
import { issueSession } from '../server/auth';
import type { Config } from '../server/config';
import type { Req } from '../server/http';
import { LocalRepo } from '../dev/local-repo';
import { gitBlobSha } from '../server/repo';
import { checkQticketsUrl, parseQtickets } from '../server/qtickets';
import { THEME_VALUES } from '../../shared/themes';

const ORIGIN = 'https://admin.example.test';
let dir = '';
let deps: Deps;
let imported: unknown = null;
const cfg: Config = {
  origin: ORIGIN, siteUrl: 'https://site.example.test', repo: { owner: 'o', name: 'n', branch: 'main' },
  github: { appId: '', privateKey: '', installationId: '', clientId: '', clientSecret: '' },
  admins: [{ id: 42, login: 'owner' }], sessionKey: randomBytes(32), sessionHours: 24, require2fa: true,
};
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'admin-feat-'));
  await cp(join(process.cwd(), 'src/content'), join(dir, 'src/content'), { recursive: true });
  deps = { cfg, repo: new LocalRepo(dir), identify: async () => null, assets: new Map(), importQtickets: async () => imported as never };
});
after(async () => { await rm(dir, { recursive: true, force: true }); });

const cookie = () => issueSession(cfg, 42, 'owner', 0).split(';')[0];
const req = (method: string, path: string, body?: unknown): Req => ({
  method, path, query: {}, ip: '203.0.113.9', body: Buffer.from(body === undefined ? '' : JSON.stringify(body)),
  headers: { cookie: cookie(), ...(method !== 'GET' ? { origin: ORIGIN, 'x-admin': '1', 'content-type': 'application/json' } : {}) },
});
const call = (r: Req) => handle(r, deps);
const ev = (start: string) => ({ title: 'Open mic', format: 'openmic', start, age: '18+', seats: 'ok', status: 'plan', comedians: [], published: true });

// ---------- серия шоу ----------

test('серия: создаётся одним действием', async () => {
  const items = ['2026-11-04', '2026-11-11', '2026-11-18'].map((d) => ({ id: `${d}-open-mic`, data: ev(`${d}T20:00`), body: '' }));
  const r = await call(req('PUT', '/api/events-batch', { items }));
  assert.equal(r.status, 200, String(r.body));
  const files = await readdir(join(dir, 'src/content/events'));
  for (const it of items) assert.ok(files.includes(`${it.id}.md`));
});

test('серия: если одно шоу с ошибкой — не создаётся ни одно', async () => {
  const items = [{ id: '2026-12-02-x', data: ev('2026-12-02T20:00'), body: '' }, { id: '2026-12-09-x', data: { ...ev('2026-12-09T20:00'), ticketUrl: 'javascript:alert(1)' }, body: '' }];
  assert.equal((await call(req('PUT', '/api/events-batch', { items }))).status, 422);
  assert.ok(!(await readdir(join(dir, 'src/content/events'))).includes('2026-12-02-x.md'));
});

test('серия: не перезаписывает существующие шоу, не больше 52, без повторов и чужих путей', async () => {
  assert.equal((await call(req('PUT', '/api/events-batch', { items: [{ id: '2026-11-04-open-mic', data: ev('2026-11-04T20:00'), body: '' }] }))).status, 409);
  const many = Array.from({ length: 53 }, (_, i) => ({ id: `x-${i}`, data: ev('2026-12-01T20:00'), body: '' }));
  assert.equal((await call(req('PUT', '/api/events-batch', { items: many }))).status, 400);
  assert.equal((await call(req('PUT', '/api/events-batch', { items: [{ id: 'a', data: ev('2026-12-01T20:00'), body: '' }, { id: 'a', data: ev('2026-12-01T20:00'), body: '' }] }))).status, 400);
  assert.equal((await call(req('PUT', '/api/events-batch', { items: [{ id: '../x', data: ev('2026-12-01T20:00'), body: '' }] }))).status, 400);
});

// ---------- Qtickets ----------

test('Qtickets: принимаются только страницы шоу на *.qtickets.events', () => {
  assert.ok(checkQticketsUrl('https://perm.qtickets.events/264881-stendap-shou-chetyre-komika'));
  for (const u of [
    'http://perm.qtickets.events/264881-x', 'https://evil.example/264881', 'https://perm.qtickets.events.evil.example/264881',
    'https://perm.qtickets.events@evil.example/264881', 'https://perm.qtickets.events:8443/264881', 'https://127.0.0.1/264881',
    'https://perm.qtickets.events/../../admin', 'https://perm.qtickets.events/', 'file:///etc/passwd', 'https://user:p@perm.qtickets.events/1234',
  ]) assert.equal(checkQticketsUrl(u), null, u);
});

test('Qtickets: разбор страницы — название, дата, время, описание; HTML не проходит', () => {
  const html = `<html><head><title>x</title>
    <meta property="og:title" content="Билеты на Стендап-шоу &quot;Четыре комика&quot;, Пермский стендап-клуб (Пермь) – Qtickets Афиша">
    <meta property="og:description" content="Идеальное шоу &lt;script&gt; для знакомства">
    <meta name="keywords" content="стендап, 2026"></head>
    <body><h1>Стендап-шоу</h1><div>Сб, 17 октября, 18:30</div><div>18+</div><script>var a="23 декабря 10:00"</script></body></html>`;
  const r = parseQtickets(html, 'https://perm.qtickets.events/264881-x', new Date('2026-10-10T00:00:00Z'));
  assert.equal(r.title, 'Стендап-шоу "Четыре комика"');
  assert.equal(r.start, '2026-10-17T18:30');
  assert.equal(r.age, '18+');
  assert.ok(r.description && !r.description.includes('<'));
});

test('Qtickets: дата без года в прошлом → следующий год', () => {
  const r = parseQtickets('<div>12 января, 19:00</div>', 'https://perm.qtickets.events/1-x', new Date('2026-10-19T00:00:00Z'));
  assert.equal(r.start, '2027-01-12T19:00');
});

test('Qtickets: маршрут отклоняет чужие адреса и отдаёт данные для своих', async () => {
  assert.equal((await call(req('POST', '/api/import/qtickets', { url: 'https://evil.example/123' }))).status, 400);
  imported = { title: 'Шоу', start: '2026-11-20T19:00', ticketUrl: 'https://perm.qtickets.events/123-x', sure: [] };
  const r = await call(req('POST', '/api/import/qtickets', { url: 'https://perm.qtickets.events/123-x' }));
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(String(r.body)).title, 'Шоу');
});

// ---------- настройки ----------

async function putSettings(patch: (s: Record<string, any>) => void) {
  const raw = await readFile(join(dir, 'src/content/settings.json'));
  const s = JSON.parse(raw.toString('utf8'));
  patch(s);
  return call(req('PUT', '/api/settings', { data: s, baseSha: gitBlobSha(raw) }));
}

test('настройки: тема только из списка, плашка без опасных ссылок, код Вебмастера по формату', async () => {
  assert.equal((await putSettings((s) => { s.theme = 'hacker'; })).status, 422);
  assert.equal((await putSettings((s) => { s.banner = { ...s.banner, enabled: true, text: 'x', link: 'javascript:alert(1)' }; })).status, 422);
  assert.equal((await putSettings((s) => { s.banner = { ...s.banner, enabled: true, text: 'x', link: '//evil.example' }; })).status, 422);
  assert.equal((await putSettings((s) => { s.banner = { ...s.banner, enabled: true, text: '' }; })).status, 422);
  assert.equal((await putSettings((s) => { s.seo.yandexVerification = '"><script>'; })).status, 422);
  assert.equal((await putSettings((s) => { s.home.featured = '../x'; })).status, 422);
  assert.equal((await putSettings((s) => { s.home.blocks = [{ id: 'afisha', title: '' }, { id: 'afisha', title: '' }]; })).status, 422);
  assert.equal((await putSettings((s) => { s.home.blocks = [{ id: 'script', title: '' }]; })).status, 422);
});

test('настройки: нормальные значения сохраняются', async () => {
  const r = await putSettings((s) => {
    s.theme = 'mint';
    s.banner = { enabled: true, text: '31 декабря — новогодний стендап', link: '/afisha/', linkLabel: 'Билеты', until: '2026-12-31', tone: 'accent' };
    s.seo.yandexVerification = '0123456789abcdef';
    s.home.featured = '2026-10-24-standup-1830';
    s.home.blocks = [{ id: 'photos', title: 'Атмосфера' }, { id: 'afisha', title: '' }];
  });
  assert.equal(r.status, 200, String(r.body));
});

test('темы: CSS сайта совпадает с shared/themes.ts', async () => {
  const css = await readFile(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  for (const [k, t] of Object.entries(THEME_VALUES)) {
    if (k === 'violet') { assert.ok(css.includes(`--c-accent: ${t.accent}`)); continue; }
    const block = new RegExp(`data-theme='${k}'\\][^}]*`).exec(css)?.[0] ?? '';
    for (const v of [t.accent, t.hover, t.onAccent, t.glowRgb]) assert.ok(block.includes(v), `${k}: ${v}`);
  }
});
