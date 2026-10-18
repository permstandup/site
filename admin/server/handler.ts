/**
 * Точка входа Yandex Cloud Function (Node.js 22).
 * Функция вызывается через API Gateway на домене admin.permstandup.ru:
 * она отдаёт и сам интерфейс админки, и API — всё с одного адреса и с защитными заголовками.
 */
import { loadConfig, type Config } from './config';
import { githubIdentify } from './auth';
import { GitHubRepo } from './repo';
import { handle, type Deps } from './routes';
import type { Req } from './http';
import { ASSETS } from './assets.generated';

interface YcEvent {
  httpMethod: string;
  url?: string;
  path?: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { identity?: { sourceIp?: string } };
}

let deps: Deps | null = null;
function getDeps(): Deps {
  if (deps) return deps;
  const cfg: Config = loadConfig();
  const assets = new Map(Object.entries(ASSETS).map(([k, v]) => [k, { type: v.type, body: Buffer.from(v.b64, 'base64') }]));
  deps = {
    cfg,
    repo: new GitHubRepo(cfg),
    identify: (code, verifier) => githubIdentify(cfg, code, verifier),
    assets,
    log: (e) => console.log(JSON.stringify({ t: new Date().toISOString(), ...e })),
  };
  return deps;
}

export async function handler(event: YcEvent) {
  const d = getDeps();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = String(v);
  const rawPath = event.url ?? event.path ?? '/';
  const u = new URL(rawPath, 'https://local');
  const query: Record<string, string> = { ...(event.queryStringParameters ?? {}) };
  u.searchParams.forEach((v, k) => { if (!(k in query)) query[k] = v; });
  const req: Req = {
    method: (event.httpMethod ?? 'GET').toUpperCase(),
    path: u.pathname,
    query,
    headers,
    body: event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0),
    ip: event.requestContext?.identity?.sourceIp ?? headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown',
  };
  const res = await handle(req, d);
  const isBinary = Buffer.isBuffer(res.body) && !/^(text\/|application\/json|application\/javascript)/.test(res.headers['Content-Type'] ?? '');
  return {
    statusCode: res.status,
    headers: res.headers,
    multiValueHeaders: res.cookies?.length ? { 'Set-Cookie': res.cookies } : undefined,
    body: Buffer.isBuffer(res.body) ? res.body.toString(isBinary ? 'base64' : 'utf8') : res.body,
    isBase64Encoded: isBinary,
  };
}
