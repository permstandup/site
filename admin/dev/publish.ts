/**
 * «Опубликовать на сайт» для локальной админки (пока сайт живёт на GitHub Pages и онлайн-админки нет).
 *
 * Как устроено:
 *  - сравниваем файлы контента на компьютере (src/content, public/uploads) с тем, что лежит в GitHub;
 *  - изменённые, новые и удалённые файлы отправляем ОДНИМ коммитом через GitHub API;
 *  - публикуются только пути из белого списка админки (isAllowedPath) — код сайта, настройки сборки
 *    и workflow этим способом изменить нельзя;
 *  - если в GitHub за это время появился чужой коммит, публикация не перезапишет его (обновление ветки без force).
 *
 * Ключ доступа (fine-grained token GitHub) хранится только на этом компьютере в admin/.local/github-token,
 * в браузер не передаётся и в GitHub не попадает (папка в .gitignore).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isAllowedPath } from '../server/content';

export const REPO = { owner: process.env.REPO_OWNER ?? 'permstandup', name: process.env.REPO_NAME ?? 'site', branch: process.env.REPO_BRANCH ?? 'main' };
const ROOTS = ['src/content', 'public/uploads'];
const TOKEN_RE = /^(github_pat_[A-Za-z0-9_]{20,255}|ghp_[A-Za-z0-9]{30,255})$/;

export interface Change { path: string; kind: 'added' | 'changed' | 'deleted' }

export class Publisher {
  constructor(private root: string) {}

  private tokenFile() { return join(this.root, 'admin', '.local', 'github-token'); }

  async token(): Promise<string | null> {
    try { const t = (await readFile(this.tokenFile(), 'utf8')).trim(); return TOKEN_RE.test(t) ? t : null; } catch { return null; }
  }

  /** Проверяем ключ у GitHub (есть ли право записи в репозиторий) и сохраняем на диск */
  async saveToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const t = token.trim();
    if (!TOKEN_RE.test(t)) return { ok: false, error: 'Это не похоже на ключ GitHub. Он начинается с github_pat_' };
    const r = await gh(t, 'GET', `/repos/${REPO.owner}/${REPO.name}`);
    if (r.status === 401) return { ok: false, error: 'GitHub не принял ключ — возможно, он истёк или скопирован не целиком' };
    if (r.status === 404) return { ok: false, error: `У ключа нет доступа к репозиторию ${REPO.owner}/${REPO.name}` };
    if (!r.ok) return { ok: false, error: `GitHub ответил ошибкой ${r.status}` };
    const perm = (r.data as { permissions?: { push?: boolean } }).permissions;
    if (perm && !perm.push) return { ok: false, error: 'У ключа нет права записи (Contents: Read and write)' };
    await mkdir(join(this.root, 'admin', '.local'), { recursive: true });
    await writeFile(this.tokenFile(), t + '\n', { mode: 0o600 });
    return { ok: true };
  }

  async forgetToken() { await rm(this.tokenFile(), { force: true }); }

  /** Локальные файлы контента: путь → sha как у git (чтобы сравнить без скачивания) */
  private async local(): Promise<Map<string, { sha: string; abs: string }>> {
    const out = new Map<string, { sha: string; abs: string }>();
    const walk = async (dir: string) => {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        if (!e.isFile()) continue;
        const path = relative(this.root, abs).split(sep).join('/');
        if (!isAllowedPath(path)) continue;
        out.set(path, { sha: gitBlobSha(await readFile(abs)), abs });
      }
    };
    for (const r of ROOTS) await walk(join(this.root, r));
    return out;
  }

  private async remote(token: string) {
    const ref = await gh(token, 'GET', `/repos/${REPO.owner}/${REPO.name}/git/ref/heads/${REPO.branch}`);
    if (!ref.ok) throw new PublishError(ref.status === 401 ? 'Ключ GitHub больше не действует — подключите заново' : `Не удалось прочитать GitHub (${ref.status})`, ref.status === 401);
    const head = (ref.data as { object: { sha: string } }).object.sha;
    const commit = await gh(token, 'GET', `/repos/${REPO.owner}/${REPO.name}/git/commits/${head}`);
    const treeSha = (commit.data as { tree: { sha: string } }).tree.sha;
    const tree = await gh(token, 'GET', `/repos/${REPO.owner}/${REPO.name}/git/trees/${treeSha}?recursive=1`);
    const data = tree.data as { truncated: boolean; tree: Array<{ path: string; type: string; sha: string }> };
    if (data.truncated) throw new PublishError('Репозиторий слишком большой для сравнения');
    const files = new Map<string, string>();
    for (const it of data.tree) if (it.type === 'blob' && isAllowedPath(it.path)) files.set(it.path, it.sha);
    return { head, treeSha, files };
  }

  async status(): Promise<{ connected: boolean; changes: Change[] }> {
    const token = await this.token();
    if (!token) return { connected: false, changes: [] };
    const [loc, rem] = await Promise.all([this.local(), this.remote(token)]);
    return { connected: true, changes: diff(loc, rem.files) };
  }

  async publish(login: string): Promise<{ commit: string; count: number }> {
    const token = await this.token();
    if (!token) throw new PublishError('Сначала подключите GitHub', true);
    const [loc, rem] = await Promise.all([this.local(), this.remote(token)]);
    const changes = diff(loc, rem.files);
    if (!changes.length) return { commit: rem.head, count: 0 };

    const tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string | null }> = [];
    for (const c of changes) {
      if (c.kind === 'deleted') { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const content = await readFile(loc.get(c.path)!.abs);
      const b = await gh(token, 'POST', `/repos/${REPO.owner}/${REPO.name}/git/blobs`, { content: content.toString('base64'), encoding: 'base64' });
      if (!b.ok) throw new PublishError(`Не удалось отправить ${c.path} (${b.status})`);
      tree.push({ path: c.path, mode: '100644', type: 'blob', sha: (b.data as { sha: string }).sha });
    }
    const t = await gh(token, 'POST', `/repos/${REPO.owner}/${REPO.name}/git/trees`, { base_tree: rem.treeSha, tree });
    if (!t.ok) throw new PublishError(`GitHub не принял изменения (${t.status})`);
    const c = await gh(token, 'POST', `/repos/${REPO.owner}/${REPO.name}/git/commits`, {
      message: `Публикация из админки: ${changes.length} ${plural(changes.length)}\n\nИзменил: ${login} (локальная админка)`,
      tree: (t.data as { sha: string }).sha,
      parents: [rem.head],
    });
    if (!c.ok) throw new PublishError(`GitHub не принял изменения (${c.status})`);
    const sha = (c.data as { sha: string }).sha;
    const u = await gh(token, 'PATCH', `/repos/${REPO.owner}/${REPO.name}/git/refs/heads/${REPO.branch}`, { sha, force: false });
    if (u.status === 422) throw new PublishError('В GitHub только что появились другие изменения. Нажмите «Опубликовать» ещё раз.');
    if (!u.ok) throw new PublishError(`GitHub не принял изменения (${u.status})`);
    return { commit: sha, count: changes.length };
  }
}

export class PublishError extends Error {
  constructor(message: string, public needsToken = false) { super(message); }
}

function diff(loc: Map<string, { sha: string }>, rem: Map<string, string>): Change[] {
  const out: Change[] = [];
  for (const [path, l] of loc) {
    const r = rem.get(path);
    if (!r) out.push({ path, kind: 'added' });
    else if (r !== l.sha) out.push({ path, kind: 'changed' });
  }
  for (const path of rem.keys()) if (!loc.has(path)) out.push({ path, kind: 'deleted' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** sha файла так, как его считает git (sha1 от «blob <размер>\0<содержимое>») */
export function gitBlobSha(buf: Buffer): string {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'файла' : 'файлов');

async function gh(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'permstandup-local-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  let data: unknown = null;
  try { data = await r.json(); } catch { /* пусто */ }
  return { ok: r.ok, status: r.status, data };
}
