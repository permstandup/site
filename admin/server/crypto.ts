/** Шифрование cookie (AES-256-GCM) и мелкие криптографические помощники. Только node:crypto, без сторонних библиотек. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const b64u = (b: Buffer) => b.toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

/** Зашифровать и подписать объект. Подделать или прочитать без ключа нельзя. */
export function seal(obj: unknown, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [b64u(iv), b64u(data), b64u(c.getAuthTag())].join('.');
}

export function unseal<T>(token: string, key: Buffer, aad: string): T | null {
  try {
    if (token.length > 4096) return null;
    const [iv, data, tag] = token.split('.');
    if (!iv || !data || !tag) return null;
    const d = createDecipheriv('aes-256-gcm', key, fromB64u(iv));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(fromB64u(tag));
    const out = Buffer.concat([d.update(fromB64u(data)), d.final()]);
    return JSON.parse(out.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 32) => b64u(randomBytes(bytes));
export const sha256b64u = (s: string) => b64u(createHash('sha256').update(s).digest());

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
