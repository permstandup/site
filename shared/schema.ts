/**
 * Единые схемы данных сайта.
 *
 * Используются в двух местах:
 *  1) сайт (src/content.config.ts) — проверка при сборке;
 *  2) админка (admin/server) — проверка КАЖДОГО сохранения на сервере.
 *
 * Правила безопасности, зашитые здесь:
 *  - ссылки только https://, без логина/пароля внутри адреса;
 *  - ссылки на соцсети и видео — только с разрешённых доменов;
 *  - картинки — только загруженные через админку файлы /uploads/<имя>.jpg|webp;
 *  - у всех текстов есть предел длины, управляющие символы запрещены;
 *  - идентификаторы (имена файлов) — только латиница, цифры и дефис.
 */
import { z } from 'zod';

// ---------- базовые типы ----------

/** Имя файла записи: латиница в нижнем регистре, цифры, дефисы. Защищает от «../» и прочих путей. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slug = z.string().min(1).max(80).regex(SLUG_RE, 'Только латиница, цифры и дефис');

/** Запрещаем управляющие символы (кроме перевода строки и табуляции в многострочных полях). */
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]');
export const line = (max: number) =>
  z.string().max(max, `Не длиннее ${max} символов`).refine((s) => !CONTROL.test(s) && !/[\r\n]/.test(s), 'Недопустимые символы');
export const text = (max: number) =>
  z.string().max(max, `Не длиннее ${max} символов`).refine((s) => !CONTROL.test(s), 'Недопустимые символы');

function parseHttps(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' || x.username || x.password) return null;
    return x;
  } catch {
    return null;
  }
}
const hostIn = (host: string, allowed: readonly string[]) =>
  allowed.some((a) => host === a || host.endsWith('.' + a));

/** Любая https-ссылка (билеты и т. п.) */
export const httpsUrl = z.string().max(500).refine((u) => parseHttps(u) !== null, 'Нужна ссылка, начинающаяся с https://');

const linkFrom = (allowed: readonly string[], hint: string) =>
  z.string().max(300).refine((u) => {
    const x = parseHttps(u);
    return !!x && hostIn(x.hostname, allowed);
  }, hint);

export const TELEGRAM_HOSTS = ['t.me', 'telegram.me'] as const;
export const VK_HOSTS = ['vk.com', 'vk.ru'] as const;
export const VIDEO_HOSTS = ['vk.com', 'vk.ru', 'vkvideo.ru', 'rutube.ru', 'youtube.com', 'youtu.be'] as const;
export const telegramUrl = linkFrom(TELEGRAM_HOSTS, 'Нужна ссылка вида https://t.me/…');
export const vkUrl = linkFrom(VK_HOSTS, 'Нужна ссылка вида https://vk.ru/…');
export const videoUrl = linkFrom(VIDEO_HOSTS, 'Видео — только VK Видео, Rutube или YouTube');

/** Картинка, загруженная через админку */
export const UPLOAD_RE = /^\/uploads\/[a-z0-9-]{8,80}\.(jpg|webp)$/;
export const uploadPath = z.string().regex(UPLOAD_RE, 'Картинку нужно загрузить через админку');

/** Дата-время по Перми: 2026-10-24T20:00 */
export const LOCAL_DT_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;
export const localDateTime = z.string().regex(LOCAL_DT_RE, 'Дата и время в формате ГГГГ-ММ-ДДTЧЧ:ММ')
  .refine((v) => !Number.isNaN(new Date(`${v}:00+05:00`).getTime()), 'Такой даты нет');

// ---------- шоу ----------

export const FORMATS = ['standup', 'openmic', 'test', 'solo'] as const;
export const eventFields = {
  title: line(120).min(1, 'Укажите название'),
  format: z.enum(FORMATS).default('standup'),
  start: localDateTime,
  age: z.enum(['18+', '16+']).default('18+'),
  priceFrom: z.number().int().min(0).max(100_000).optional(),
  ticketUrl: httpsUrl.optional(),
  seats: z.enum(['ok', 'few', 'out']).default('ok'),
  status: z.enum(['plan', 'moved', 'cancelled']).default('plan'),
  movedFrom: localDateTime.optional(),
  cancelReason: line(200).optional(),
  cover: uploadPath.optional(),
  comedians: z.array(slug).max(20).default([]),
  important: z.array(line(200)).max(10).optional(),
  published: z.boolean().default(true),
  seoDescription: line(200).optional(),
};
export const eventSchema = z.object(eventFields).strict();
export const EVENT_BODY_MAX = 3000;

// ---------- комики ----------

export const comedianFields = {
  name: line(80).min(1, 'Укажите имя'),
  role: z.enum(['resident', 'guest']).default('resident'),
  tagline: line(120).optional(),
  city: line(60).optional(),
  photo: uploadPath.optional(),
  telegram: telegramUrl.optional(),
  vk: vkUrl.optional(),
  videos: z.array(videoUrl).max(10).default([]),
  order: z.number().int().min(0).max(10_000).default(100),
  visible: z.boolean().default(true),
};
export const comedianSchema = z.object(comedianFields).strict();
export const COMEDIAN_BODY_MAX = 600;

// ---------- фото и видео (списки в одном файле) ----------

export const galleryItemSchema = z.object({
  id: slug,
  src: uploadPath.optional(),
  caption: line(120),
  alt: line(200),
  author: line(80).optional(),
  order: z.number().int().min(0).max(10_000).default(100),
}).strict();
export const gallerySchema = z.array(galleryItemSchema).max(200)
  .refine((a) => new Set(a.map((i) => i.id)).size === a.length, 'Повторяющиеся id');

export const videoItemSchema = z.object({
  id: slug,
  title: line(120).min(1),
  url: videoUrl,
  comedian: line(80).optional(),
  order: z.number().int().min(0).max(10_000).default(100),
}).strict();
export const videosSchema = z.array(videoItemSchema).max(50)
  .refine((a) => new Set(a.map((i) => i.id)).size === a.length, 'Повторяющиеся id');

// ---------- настройки клуба ----------

export const settingsSchema = z.object({
  name: line(80).min(1),
  shortName: line(40),
  city: line(40).min(1),
  address: line(120).min(1),
  howToGet: text(400),
  phone: line(30).regex(/^[+\d\s()-]{5,30}$/, 'Только цифры, +, пробелы, скобки и дефис'),
  links: z.object({
    telegram: telegramUrl,
    vk: vkUrl,
    qtickets: httpsUrl,
    yandexAfisha: httpsUrl,
    openMicHost: z.union([z.literal(''), telegramUrl, vkUrl]),
  }).strict(),
  sections: z.object({
    comics: z.boolean(), photos: z.boolean(), openmic: z.boolean(), facts: z.boolean(), video: z.boolean(),
  }).strict(),
  importantDefault: z.array(line(200)).max(10),
  texts: z.object({ heroLead: text(400), openMic: text(400) }).strict(),
  facts: z.array(z.object({ title: line(30), text: line(120) }).strict()).max(4),
  openMic: z.object({
    schedule: line(60),
    contactNote: line(200),
    steps: z.array(z.object({ title: line(60), text: line(200) }).strict()).max(5),
    rules: z.array(line(200)).max(12),
    faq: z.array(z.object({ q: line(150), a: text(800) }).strict()).max(12),
  }).strict(),
  about: z.object({ paragraphs: z.array(text(1200)).max(6), requisites: line(300) }).strict(),
  comicsLead: line(200),
}).strict();

export type EventData = z.infer<typeof eventSchema>;
export type ComedianData = z.infer<typeof comedianSchema>;
export type GalleryItem = z.infer<typeof galleryItemSchema>;
export type VideoItem = z.infer<typeof videoItemSchema>;
export type Settings = z.infer<typeof settingsSchema>;
