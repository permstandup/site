/**
 * Вход через GitHub и сессии.
 *
 * - GitHub используется ТОЛЬКО чтобы узнать, кто входит (id аккаунта). Токен пользователя
 *   сразу выбрасывается и нигде не хранится; писать в репозиторий он не может.
 * - Пускаем только аккаунты из белого списка (по неизменяемому числовому id) и только
 *   с включённой двухфакторной защитой.
 * - Защита входа: одноразовый state + PKCE (S256), cookie входа живёт 10 минут.
 * - Сессия — зашифрованная cookie __Host-…, HttpOnly, Secure, SameSite=Strict:
 *   JavaScript её не видит, на другие сайты она не уходит.
 * - «Выйти на всех устройствах» повышает номер эпохи в admin-state.json:
 *   все ранее выданные сессии становятся недействительными.
 */
import type { Admin, Config } from './config';
import { randomToken, seal, sha256b64u, unseal, safeEqual } from './crypto';
import { clearCookie, parseCookies, setCookie, type Req } from './http';

export const SESSION_COOKIE = '__Host-sup_admin';
export const LOGIN_COOKIE = '__Host-sup_login';

export interface Session { v: 1; uid: number; login: string; iat: number; exp: number; epoch: number }
interface LoginState { state: string; verifier: string; exp: number }

export function startLogin(cfg: Config): { url: string; cookie: string } {
  const st: LoginState = { state: randomToken(24), verifier: randomToken(48), exp: Date.now() + 10 * 60_000 };
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', cfg.github.clientId);
  u.searchParams.set('redirect_uri', `${cfg.origin}/api/auth/callback`);
  u.searchParams.set('state', st.state);
  u.searchParams.set('code_challenge', sha256b64u(st.verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('allow_signup', 'false');
  // Lax нужен, т.к. GitHub возвращает пользователя переходом с другого сайта
  const cookie = setCookie(LOGIN_COOKIE, seal(st, cfg.sessionKey, 'login'), { maxAge: 600, sameSite: 'Lax', path: '/' });
  return { url: u.toString(), cookie };
}

export type LoginResult =
  | { ok: true; admin: Admin; cookie: string }
  | { ok: false; reason: 'state' | 'github' | 'not_allowed' | 'no_2fa' };

export async function finishLogin(
  cfg: Config, req: Req, epoch: number,
  identify: (code: string, verifier: string) => Promise<{ id: number; login: string; twoFactor: boolean | undefined } | null>,
): Promise<LoginResult> {
  const st = unseal<LoginState>(parseCookies(req.headers.cookie)[LOGIN_COOKIE] ?? '', cfg.sessionKey, 'login');
  const state = req.query.state ?? '';
  const code = req.query.code ?? '';
  if (!st || st.exp < Date.now() || !state || !safeEqual(st.state, state) || !/^[A-Za-z0-9_-]{1,100}$/.test(code)) {
    return { ok: false, reason: 'state' };
  }
  const user = await identify(code, st.verifier).catch(() => null);
  if (!user) return { ok: false, reason: 'github' };
  const admin = cfg.admins.find((a) => a.id === user.id);
  if (!admin) return { ok: false, reason: 'not_allowed' };
  if (cfg.require2fa && user.twoFactor !== true) return { ok: false, reason: 'no_2fa' };
  return { ok: true, admin: { id: user.id, login: user.login }, cookie: issueSession(cfg, admin.id, user.login, epoch) };
}

export function issueSession(cfg: Config, uid: number, login: string, epoch: number): string {
  const now = Date.now();
  const s: Session = { v: 1, uid, login, iat: now, exp: now + cfg.sessionHours * 3600_000, epoch };
  return setCookie(SESSION_COOKIE, seal(s, cfg.sessionKey, 'session'), { maxAge: cfg.sessionHours * 3600, sameSite: 'Strict' });
}

/** Проверка сессии на КАЖДОМ запросе: срок, эпоха и белый список (удалённый из списка теряет доступ сразу). */
export function readSession(cfg: Config, req: Req, epoch: number): Session | null {
  const s = unseal<Session>(parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? '', cfg.sessionKey, 'session');
  if (!s || s.v !== 1 || s.exp < Date.now() || s.epoch !== epoch) return null;
  if (!cfg.admins.some((a) => a.id === s.uid)) return null;
  return s;
}

export const logoutCookies = () => [clearCookie(SESSION_COOKIE), clearCookie(LOGIN_COOKIE)];

/** Обмен кода на токен пользователя и чтение его профиля. Токен дальше не используется. */
export async function githubIdentify(cfg: Config, code: string, verifier: string) {
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'permstandup-admin' },
    body: JSON.stringify({
      client_id: cfg.github.clientId, client_secret: cfg.github.clientSecret, code,
      redirect_uri: `${cfg.origin}/api/auth/callback`, code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const t = (await r.json()) as { access_token?: string };
  if (!t.access_token) return null;
  const u = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'permstandup-admin' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!u.ok) return null;
  const j = (await u.json()) as { id: number; login: string; two_factor_authentication?: boolean };
  // Токен пользователя отзываем сразу — он больше не нужен
  await fetch(`https://api.github.com/applications/${cfg.github.clientId}/token`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.github.clientId}:${cfg.github.clientSecret}`).toString('base64')}`,
      Accept: 'application/vnd.github+json', 'User-Agent': 'permstandup-admin',
    },
    body: JSON.stringify({ access_token: t.access_token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  return { id: j.id, login: j.login, twoFactor: j.two_factor_authentication };
}
