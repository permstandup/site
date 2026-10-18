/**
 * Хранилище контента — git-репозиторий сайта.
 * Боевая реализация работает через GitHub API от имени GitHub App
 * с токеном, суженным до ОДНОГО репозитория и права contents:write.
 */
import { createHash, createSign } from 'node:crypto';
import type { Config } from './config';

export interface FileEntry { path: string; sha: string; text: string | null }
export interface Change { path: string; content: Buffer | null } // null — удалить
export interface Author { name: string; email: string }
export interface HistoryItem { sha: string; message: string; date: string; author: string }

export class ConflictError extends Error {
  constructor(public path: string) { super(`Файл ${path} уже изменили`); }
}

export interface Repo {
  /** Все файлы папки (без вложенных) вместе с текстом */
  readDir(dir: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<{ sha: string; content: Buffer } | null>;
  /** Атомарный коммит нескольких файлов. expect: путь → ожидаемый sha (null — файла быть не должно). */
  commit(changes: Change[], message: string, author: Author, expect: Record<string, string | null>): Promise<string>;
  history(path: string, limit: number): Promise<HistoryItem[]>;
  readAt(path: string, commit: string): Promise<Buffer | null>;
}

/** sha, который git даёт содержимому файла — чтобы ловить одновременные правки */
export const gitBlobSha = (content: Buffer) =>
  createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');

// ------------------------------------------------------------------ GitHub

const API = 'https://api.github.com';
const UA = 'permstandup-admin';

export class GitHubRepo implements Repo {
  private token: { value: string; until: number } | null = null;
  constructor(private cfg: Config) {}

  private appJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iat: now - 60, exp: now + 540, iss: this.cfg.github.appId })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(this.cfg.github.privateKey).toString('base64url');
    return `${unsigned}.${sig}`;
  }

  /** Токен установки GitHub App: живёт 1 час, ограничен одним репозиторием и правом contents:write */
  private async installationToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const r = await fetch(`${API}/app/installations/${this.cfg.github.installationId}/access_tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.appJwt()}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
      body: JSON.stringify({ repositories: [this.cfg.repo.name], permissions: { contents: 'write' } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`GitHub: не удалось получить токен (${r.status})`);
    const j = (await r.json()) as { token: string; expires_at: string };
    this.token = { value: j.token, until: new Date(j.expires_at).getTime() - 5 * 60_000 };
    return j.token;
  }

  private async gh(path: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
    const token = await this.installationToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: init.accept ?? 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': UA,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  }

  private async ghJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await this.gh(path, init);
    if (!r.ok) throw Object.assign(new Error(`GitHub ${init.method ?? 'GET'} ${path.split('?')[0]}: ${r.status}`), { status: r.status });
    return (await r.json()) as T;
  }

  private get base() { return `/repos/${this.cfg.repo.owner}/${this.cfg.repo.name}`; }

  async readDir(dir: string): Promise<FileEntry[]> {
    const query = `query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name type oid object{... on Blob{text isBinary}}}}}}}`;
    const j = await this.ghJson<{ data?: { repository?: { object?: { entries?: Array<{ name: string; type: string; oid: string; object: { text: string | null; isBinary: boolean } | null }> } } }; errors?: unknown }>(
      '/graphql',
      { method: 'POST', body: JSON.stringify({ query, variables: { o: this.cfg.repo.owner, n: this.cfg.repo.name, e: `${this.cfg.repo.branch}:${dir}` } }) },
    );
    if (j.errors) throw new Error('GitHub GraphQL: ошибка чтения папки');
    const entries = j.data?.repository?.object?.entries ?? [];
    return entries.filter((e) => e.type === 'blob').map((e) => ({
      path: `${dir}/${e.name}`, sha: e.oid, text: e.object && !e.object.isBinary ? e.object.text : null,
    }));
  }

  private async contentAt(path: string, ref: string): Promise<{ sha: string; content: Buffer } | null> {
    const meta = await this.gh(`${this.base}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`GitHub: чтение ${path}: ${meta.status}`);
    const m = (await meta.json()) as { sha: string; type: string };
    if (m.type !== 'file') return null;
    const raw = await this.gh(`${this.base}/git/blobs/${m.sha}`, { accept: 'application/vnd.github.raw' });
    if (!raw.ok) throw new Error(`GitHub: чтение ${path}: ${raw.status}`);
    return { sha: m.sha, content: Buffer.from(await raw.arrayBuffer()) };
  }

  readFile(path: string) { return this.contentAt(path, this.cfg.repo.branch); }

  async readAt(path: string, commit: string) {
    if (!/^[0-9a-f]{40}$/.test(commit)) return null;
    return (await this.contentAt(path, commit))?.content ?? null;
  }

  async history(path: string, limit: number): Promise<HistoryItem[]> {
    const list = await this.ghJson<Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }>>(
      `${this.base}/commits?path=${encodeURIComponent(path)}&sha=${this.cfg.repo.branch}&per_page=${limit}`,
    );
    return list.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], date: c.commit.author.date, author: c.commit.author.name }));
  }

  async commit(changes: Change[], message: string, author: Author, expect: Record<string, string | null>): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = await this.ghJson<{ object: { sha: string } }>(`${this.base}/git/ref/heads/${this.cfg.repo.branch}`);
      const head = ref.object.sha;
      const headCommit = await this.ghJson<{ tree: { sha: string } }>(`${this.base}/git/commits/${head}`);

      // Защита от одновременных правок: файл должен быть ровно тем, что видел редактор
      for (const [path, sha] of Object.entries(expect)) {
        const meta = await this.gh(`${this.base}/contents/${encodeURI(path)}?ref=${head}`);
        const cur = meta.status === 404 ? null : ((await meta.json()) as { sha: string }).sha;
        if (cur !== sha) throw new ConflictError(path);
      }

      const tree = [];
      for (const ch of changes) {
        if (ch.content === null) { tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: null }); continue; }
        const blob = await this.ghJson<{ sha: string }>(`${this.base}/git/blobs`, {
          method: 'POST', body: JSON.stringify({ content: ch.content.toString('base64'), encoding: 'base64' }),
        });
        tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await this.ghJson<{ sha: string }>(`${this.base}/git/trees`, {
        method: 'POST', body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
      });
      const commit = await this.ghJson<{ sha: string }>(`${this.base}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: newTree.sha, parents: [head], author: { ...author, date: new Date().toISOString() } }),
      });
      // force:false — если ветка ушла вперёд, GitHub откажет, и мы перепроверим всё заново
      const upd = await this.gh(`${this.base}/git/refs/heads/${this.cfg.repo.branch}`, {
        method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      if (upd.ok) return commit.sha;
      if (upd.status !== 422) throw new Error(`GitHub: обновление ветки ${upd.status}`);
    }
    throw new Error('Сайт одновременно меняют из другого места — попробуйте ещё раз');
  }
}
