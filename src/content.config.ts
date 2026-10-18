/**
 * Коллекции контента сайта. Сами схемы — в shared/schema.ts:
 * по ним же админка проверяет каждое сохранение на сервере.
 */
import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'zod';
import { eventSchema, comedianSchema, galleryItemSchema, videoItemSchema } from '../shared/schema';

/** Шоу. Один файл = одно шоу: src/content/events/<дата>-<название>.md, текст файла — описание (обычный текст). */
const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: eventSchema.extend({
    comedians: z.array(reference('comedians')).max(20).default([]),
    host: reference('comedians').optional(),
  }),
});

/** Комики. Один файл = один комик, текст файла — био. */
const comedians = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comedians' }),
  schema: comedianSchema,
});

/** Фото из клуба: список в одном файле. Первые 7 видны на главной. */
const gallery = defineCollection({
  loader: file('src/content/gallery.json'),
  schema: galleryItemSchema,
});

/** Видео на главной. */
const videos = defineCollection({
  loader: file('src/content/videos.json'),
  schema: videoItemSchema,
});

export const collections = { events, comedians, gallery, videos };
