/** Локальная публикация: сравнение с GitHub и один коммит только из разрешённых путей (GitHub подменён). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Publisher, gitBlobSha } from '../dev/publish';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'pub-'));
  await mkdir(join(root, 'src/content/events'), { recursive: true });
  await mkdir(join(root, 'public/uploads'), { recursive: true });
  await mkdir(join(root, 'admin/.local'), { recursive: true });
  await writeFile(join(root, 'src/content/settings.json'), '{"a":1}\n');            // не менялся
  await writeFile(join(root, 'src/content/events/new-show.md'), '---\ntitle: x\n---\n'); // новый
  await writeFile(join(root, 'public/uploads/2026-10-20-abcdefgh.jpg'), Buffer.from([1, 2, 3])); // новый
  await writeFile(join(root, 'src/content/notes.txt'), 'не публикуется');                // не из белого списка
  await writeFile(join(root, 'admin/.local/github-token'), 'github_pat_' + 'a'.repeat(40));
  return root;
}

test('публикация: только изменения из белого списка, одним коммитом, без force', async () => {
  const root = await setup();
  const calls: Array<{ method: string; url: string; body: any }> = [];
  const remoteTree = [
    { path: 'src/content/settings.json', type: 'blob', sha: gitBlobSha(Buffer.from('{"a":1}\n')) },
    { path: 'src/content/events/old-show.md', type: 'blob', sha: 'f'.repeat(40) },   // удалён локально
    { path: '.github/workflows/pages.yml', type: 'blob', sha: 'e'.repeat(40) },       // не трогаем
    { path: 'src/pages/index.astro', type: 'blob', sha: 'd'.repeat(40) },             // не трогаем
  ];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.endsWith('/git/ref/heads/main')) return ok({ object: { sha: 'h'.repeat(40) } });
    if (url.includes('/git/commits/') && method === 'GET') return ok({ tree: { sha: 't'.repeat(40) } });
    if (url.includes('/git/trees/') && method === 'GET') return ok({ truncated: false, tree: remoteTree });
    if (url.endsWith('/git/blobs')) return ok({ sha: 'b'.repeat(40) }, 201);
    if (url.endsWith('/git/trees')) return ok({ sha: 'n'.repeat(40) }, 201);
    if (url.endsWith('/git/commits')) return ok({ sha: 'c'.repeat(40) }, 201);
    if (url.endsWith('/git/refs/heads/main')) return ok({}, 200);
    return ok({}, 404);
  }) as typeof fetch;
  try {
    const p = new Publisher(root);
    const st = await p.status();
    assert.deepEqual(st.changes.map((c) => `${c.kind} ${c.path}`), [
      'added public/uploads/2026-10-20-abcdefgh.jpg',
      'added src/content/events/new-show.md',
      'deleted src/content/events/old-show.md',
    ]);
    const r = await p.publish('local-admin');
    assert.equal(r.count, 3);
    const tree = calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/trees'))!.body;
    assert.equal(tree.base_tree, 't'.repeat(40));
    assert.ok(tree.tree.every((e: any) => /^(src\/content|public\/uploads)\//.test(e.path)), 'только контент');
    assert.ok(tree.tree.some((e: any) => e.path === 'src/content/events/old-show.md' && e.sha === null), 'удаление');
    const upd = calls.find((c) => c.method === 'PATCH')!;
    assert.equal(upd.body.force, false);
    assert.ok(calls.every((c) => c.url.startsWith('https://api.github.com/repos/permstandup/site/')));
  } finally { globalThis.fetch = orig; }
});

test('публикация: неправильный ключ не сохраняется', async () => {
  const root = await setup();
  const p = new Publisher(root);
  const r = await p.saveToken('мой пароль');
  assert.equal(r.ok, false);
});
