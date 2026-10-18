/**
 * Сборка боевой функции админки:
 *   1) интерфейс (Vite) → admin/dist/ui
 *   2) все файлы интерфейса встраиваются в код функции (assets.generated.ts)
 *   3) сервер (esbuild) → admin/dist/function/index.js — один файл, загружается в Yandex Cloud Functions
 * Локальный режим (admin/dev) в боевую сборку не попадает.
 */
import { build as vite } from 'vite';
import { build as esbuild } from 'esbuild';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const onlyUi = process.argv.includes('--ui');

await vite({ configFile: join(here, 'vite.config.mjs'), logLevel: 'warn' });
if (onlyUi) process.exit(0);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };
const assets = {};
async function walk(dir, prefix) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}/${e.name}`);
    else {
      const type = TYPES[extname(e.name)];
      if (!type) continue; // лишние форматы шрифтов и т.п. не берём
      assets[`${prefix}/${e.name}`] = { type, b64: (await readFile(join(dir, e.name))).toString('base64') };
    }
  }
}
await walk(join(here, 'dist/ui'), '');
await writeFile(join(here, 'server/assets.generated.ts'),
  `// Создаётся admin/build.mjs — не редактировать\nexport const ASSETS: Record<string, { type: string; b64: string }> = ${JSON.stringify(assets)};\n`);

await mkdir(join(here, 'dist/function'), { recursive: true });
await esbuild({
  entryPoints: [join(here, 'server/handler.ts')],
  outfile: join(here, 'dist/function/index.js'),
  bundle: true, platform: 'node', target: 'node22', format: 'cjs', minify: false, legalComments: 'none',
  logLevel: 'warning',
});
const size = (await readFile(join(here, 'dist/function/index.js'))).length;
console.log(`Функция собрана: admin/dist/function/index.js (${Math.round(size / 1024)} КБ), файлов интерфейса: ${Object.keys(assets).length}`);
