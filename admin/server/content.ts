/**
 * Что и куда админка может записывать. Всё остальное в репозитории (код сайта,
 * настройки сборки, .github/workflows) из админки изменить НЕЛЬЗЯ — даже при
 * украденной сессии злоумышленник не сможет подменить код сайта.
 */
import YAML from 'yaml';
import { z } from 'zod';
import {
  SLUG_RE, eventSchema, comedianSchema, gallerySchema, videosSchema, settingsSchema,
  EVENT_BODY_MAX, COMEDIAN_BODY_MAX, text,
} from '../../shared/schema';

export const PATHS = {
  eventsDir: 'src/content/events',
  comediansDir: 'src/content/comedians',
  gallery: 'src/content/gallery.json',
  videos: 'src/content/videos.json',
  settings: 'src/content/settings.json',
  uploadsDir: 'public/uploads',
  state: 'admin-state.json',
} as const;

export type Kind = 'events' | 'comedians';
export const dirOf = (k: Kind) => (k === 'events' ? PATHS.eventsDir : PATHS.comediansDir);
export const entryPath = (k: Kind, id: string) => {
  if (!SLUG_RE.test(id) || id.length > 80) throw new Error('bad id');
  return `${dirOf(k)}/${id}.md`;
};

/** Белый список путей: только эти файлы можно читать историю / восстанавливать. */
export function isAllowedPath(path: string): boolean {
  if (path.includes('..') || path.includes('//') || path.startsWith('/')) return false;
  if ([PATHS.gallery, PATHS.videos, PATHS.settings].includes(path as never)) return true;
  const m = /^src\/content\/(events|comedians)\/([a-z0-9-]+)\.md$/.exec(path);
  if (m) return SLUG_RE.test(m[2]);
  return /^public\/uploads\/[a-z0-9-]{8,80}\.(jpg|webp)$/.test(path);
}

// ---------- markdown с frontmatter ----------

export function parseEntry(raw: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  // Без пользовательских тегов YAML: только простые типы
  const data = YAML.parse(m[1], { schema: 'core', customTags: [], maxAliasCount: 0 }) ?? {};
  return { data: typeof data === 'object' && !Array.isArray(data) ? data : {}, body: m[2].trim() };
}

export function serializeEntry(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
  const yaml = YAML.stringify(clean, { lineWidth: 0 });
  return `---\n${yaml}---\n${body.replace(/\r\n?/g, '\n').trim()}\n`;
}

const bodyOf = (max: number) => text(max);

export const eventInput = z.object({ data: eventSchema, body: bodyOf(EVENT_BODY_MAX) }).strict();
export const comedianInput = z.object({ data: comedianSchema, body: bodyOf(COMEDIAN_BODY_MAX) }).strict();
export const listInputs = { gallery: gallerySchema, videos: videosSchema } as const;
export { settingsSchema };

/** Человекочитаемые ошибки проверки для формы */
export function issues(e: z.ZodError) {
  return e.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
}

// ---------- новые записи ----------

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};
export function slugify(s: string, max = 50): string {
  const out = s.toLowerCase().split('').map((c) => TR[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  return out || 'item';
}
