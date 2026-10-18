/**
 * ТОЛЬКО ДЛЯ ЛОКАЛЬНОЙ ПРОВЕРКИ. Вместо GitHub пишет прямо в файлы проекта на компьютере.
 * В боевую функцию этот файл не попадает (его импортирует только admin/dev/server.ts).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ConflictError, gitBlobSha, type Change, type DeployStatus, type FileEntry, type HistoryItem, type Repo } from '../server/repo';

export class LocalRepo implements Repo {
  private log: Array<HistoryItem & { path: string; content: Buffer | null }> = [];
  constructor(private root: string) {}

  async readDir(dir: string): Promise<FileEntry[]> {
    const names = await readdir(join(this.root, dir)).catch(() => [] as string[]);
    const out: FileEntry[] = [];
    for (const n of names.sort()) {
      const buf = await readFile(join(this.root, dir, n)).catch(() => null);
      if (buf) out.push({ path: `${dir}/${n}`, sha: gitBlobSha(buf), text: buf.toString('utf8') });
    }
    return out;
  }

  async readFile(path: string) {
    const buf = await readFile(join(this.root, path)).catch(() => null);
    return buf ? { sha: gitBlobSha(buf), content: buf } : null;
  }

  async commit(changes: Change[], message: string, author: { name: string }, expect: Record<string, string | null>) {
    for (const [p, sha] of Object.entries(expect)) {
      const cur = await this.readFile(p);
      if ((cur?.sha ?? null) !== sha) throw new ConflictError(p);
    }
    const id = gitBlobSha(Buffer.from(message + Date.now()));
    for (const c of changes) {
      const prev = await this.readFile(c.path);
      if (prev && !this.log.some((l) => l.path === c.path)) {
        this.log.unshift({ sha: gitBlobSha(Buffer.concat([prev.content, Buffer.from(c.path)])), message: 'Исходная версия', date: new Date(Date.now() - 60_000).toISOString(), author: '—', path: c.path, content: prev.content });
      }
      this.log.unshift({ sha: id, message, date: new Date().toISOString(), author: author.name, path: c.path, content: c.content });
      if (c.content === null) await rm(join(this.root, c.path), { force: true });
      else { await mkdir(dirname(join(this.root, c.path)), { recursive: true }); await writeFile(join(this.root, c.path), c.content); }
    }
    return id;
  }

  async history(path: string, limit: number) {
    return this.log.filter((l) => l.path === path).slice(0, limit).map(({ sha, message, date, author }) => ({ sha, message, date, author }));
  }

  /** Содержимое файла в момент этого изменения (как у GitHub) */
  async readAt(path: string, commit: string) {
    return this.log.find((l) => l.path === path && l.sha === commit)?.content ?? null;
  }

  async deployStatus(): Promise<DeployStatus> { return { state: 'local' }; }
}
