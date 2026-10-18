// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://permstandup.ru',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [sitemap()],
  security: {
    // Content-Security-Policy в <meta>: браузер выполнит только скрипты и стили самого сайта
    // (Astro сам добавляет их хэши), картинки — только свои, карта — только с yandex.ru.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://mc.yandex.ru",
        "font-src 'self'",
        "connect-src 'self' https://mc.yandex.ru",
        'frame-src https://yandex.ru',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      // Яндекс Метрика (подключается, только если в админке указан номер счётчика)
      scriptDirective: { resources: ["'self'", 'https://mc.yandex.ru', 'https://yastatic.net'] },
    },
  },
});
