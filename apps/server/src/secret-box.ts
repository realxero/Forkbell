// Encrypting API keys before they're stored: AES-256-GCM with a key derived
// from SESSION_SECRET. If SESSION_SECRET changes, saved keys can't be opened
// any more and people are asked to enter theirs again.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from './env.ts';

const key = () => Buffer.from(hkdfSync('sha256', env.sessionSecret, 'forkbell', 'ai-provider-key', 32));

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

/** The key, or null if it can't be opened (SESSION_SECRET changed, or it was tampered with). */
export function open(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, 'base64');
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
