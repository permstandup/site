/**
 * Схемы данных сайта. Каждый тип контента описан здесь один раз —
 * по этим же схемам потом строится админка (см. ТЗ, раздел «Расширяемость»).
 * Новое поле добавляется сюда со значением по умолчанию, чтобы старые записи не ломались.
 */
import { defineCollection, reference, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/** Шоу. Один файл = одно шоу: src/content/events/<дата>-<название>.md, текст файла — описание. */
const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    format: z.enum(['standup', 'openmic', 'test', 'solo']).default('standup'),
    /** Дата и время начала по Перми, формат 2026-10-24T20:00 */
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    age: z.enum(['18+', '16+']).default('18+'),
    priceFrom: z.number().int().positive().optional(),
    ticketUrl: z.string().url().optional(),
    seats: z.enum(['ok', 'few', 'out']).default('ok'),
    status: z.enum(['plan', 'moved', 'cancelled']).default('plan'),
    /** Для перенесённых: исходная дата, формат как у start */
    movedFrom: z.string().optional(),
    cancelReason: z.string().optional(),
    cover: z.string().optional(),
    comedians: z.array(reference('comedians')).default([]),
    /** Пусто — берётся «Важно знать» по умолчанию из настроек клуба */
    important: z.array(z.string()).optional(),
    published: z.boolean().default(true),
    seoDescription: z.string().optional(),
  }),
});

/** Комики. Один файл = один комик, текст файла — био (до 300 знаков). */
const comedians = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comedians' }),
  schema: z.object({
    name: z.string(),
    role: z.enum(['resident', 'guest']).default('resident'),
    city: z.string().optional(),
    photo: z.string().optional(),
    telegram: z.string().url().optional(),
    vk: z.string().url().optional(),
    videos: z.array(z.string().url()).default([]),
    order: z.number().default(100),
    visible: z.boolean().default(true),
  }),
});

/** Фото из клуба: список в одном файле. Первые 7 видны на главной. */
const gallery = defineCollection({
  loader: file('src/content/gallery.json'),
  schema: z.object({
    src: z.string().optional(),
    caption: z.string(),
    alt: z.string(),
    author: z.string().optional(),
    order: z.number().default(100),
  }),
});

/** Видео на главной. */
const videos = defineCollection({
  loader: file('src/content/videos.json'),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    comedian: z.string().optional(),
    order: z.number().default(100),
  }),
});

export const collections = { events, comedians, gallery, videos };
