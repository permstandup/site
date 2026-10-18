// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://permstandup.ru',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // Локальный сервер слушает 127.0.0.1: так он открывается и по localhost, и по 127.0.0.1 (в т.ч. с VPN)
  server: { host: '127.0.0.1', port: 4321 },
  // Подсветка кода не нужна (тексты — обычный текст); без неё нет предупреждения о CSP
  markdown: { syntaxHighlight: false },
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
