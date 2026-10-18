/** Обращения к серверу админки. Все изменяющие запросы несут X-Admin: 1 (часть защиты от CSRF). */
import type { EventData, ComedianData, GalleryItem, VideoItem, Settings } from '../../../shared/schema';

export interface Entry<T> { id: string; sha: string; data: T; body: string }
export interface Content {
  events: Entry<EventData>[];
  comedians: Entry<ComedianData>[];
  gallery: { sha: string; data: GalleryItem[] };
  videos: { sha: string; data: VideoItem[] };
  settings: { sha: string; data: Settings };
}
export interface Session { login: string; expires: number; admins: string[]; require2fa: boolean }
export interface Issue { path: string; message: string }
export interface Imported { title?: string; start?: string; priceFrom?: number; age?: '18+' | '16+'; description?: string; ticketUrl: string; sure: string[] }
export interface DeployStatus { state: 'deployed' | 'building' | 'failed' | 'waiting' | 'unknown' | 'local'; head?: string; updatedAt?: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues: Issue[] = []) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json', 'X-Admin': '1' } : { 'X-Admin': '1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let j: { error?: string; issues?: Issue[] } & Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* пусто */ }
  if (r.status === 401) { location.hash = '#/login'; throw new ApiError(401, 'Нужно войти'); }
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'Ошибка', j.issues ?? []);
  if (method !== 'GET' && 'commit' in j) window.dispatchEvent(new Event('admin:saved'));
  return j as T;
}

export const api = {
  session: () => call<Session>('GET', '/api/session'),
  content: () => call<Content>('GET', '/api/content'),
  saveEntry: (kind: 'events' | 'comedians', id: string, data: unknown, body: string, baseSha: string | null) =>
    call<{ commit: string }>('PUT', `/api/entries/${kind}/${id}`, { data, body, baseSha }),
  deleteEntry: (kind: 'events' | 'comedians', id: string, baseSha: string) =>
    call<{ commit: string }>('DELETE', `/api/entries/${kind}/${id}`, { baseSha }),
  saveList: (name: 'gallery' | 'videos' | 'settings', data: unknown, baseSha: string) =>
    call<{ commit: string }>('PUT', `/api/${name}`, { data, baseSha }),
  saveOrder: (items: Array<{ id: string; baseSha: string }>) => call<{ commit: string }>('PUT', '/api/comedians-order', { items }),
  saveSeries: (items: Array<{ id: string; data: unknown; body: string }>) => call<{ commit: string; ids: string[] }>('PUT', '/api/events-batch', { items }),
  importQtickets: (url: string) => call<Imported>('POST', '/api/import/qtickets', { url }),
  deployStatus: () => call<DeployStatus>('GET', '/api/deploy-status'),
  upload: (base64: string) => call<{ src: string }>('POST', '/api/upload', { data: base64 }),
  history: (path: string) => call<{ items: Array<{ sha: string; message: string; date: string; author: string }> }>('GET', `/api/history?path=${encodeURIComponent(path)}`),
  restore: (path: string, commit: string) => call<{ commit: string }>('POST', '/api/restore', { path, commit }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  logoutAll: () => call<{ ok: true }>('POST', '/api/auth/logout-all', {}),
};

/** Адрес картинки для показа в админке: через API (видно и ещё не выложенные на сайт файлы) */
export const imageUrl = (src: string | undefined) =>
  src && /^\/uploads\/[a-z0-9-]{8,80}\.(jpg|webp)$/.test(src) ? `/api/file?path=${encodeURIComponent('public' + src)}` : undefined;
