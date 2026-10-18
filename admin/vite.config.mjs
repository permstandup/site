// Сборка интерфейса админки. Скрипты и стили — только отдельными файлами (никакого inline),
// чтобы работала строгая политика CSP: script-src 'self'; style-src 'self'.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./ui', import.meta.url)),
  base: '/',
  build: {
    outDir: fileURLToPath(new URL('./dist/ui', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: 'es2022',
  },
});
