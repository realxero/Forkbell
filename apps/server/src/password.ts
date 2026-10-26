// Password hashing and guessing limits for username + password sign-in.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

// scrypt with N=2^15, r=8: about 32 MB and ~100 ms per check. The settings are
// stored with each hash, so they can be raised later without breaking old ones.
const N = 2 ** 15, R = 8, P = 1, LEN = 32;
const MAXMEM = 128 * N * R * 2;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64url');
  const opts = { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 };
  const got = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), want.length, opts);
  return got.length === want.length && timingSafeEqual(got, want);
}

// Checked against when the username doesn't exist, so a wrong username takes as
// long as a wrong password and can't be told apart.
let decoy: Promise<string> | null = null;
export const decoyHash = () => (decoy ??= hashPassword(randomBytes(16).toString('hex')));

export const USERNAME = /^[a-z0-9._-]{3,32}$/;

/** Why a new password won't do, or null if it's fine. */
export function passwordProblem(password: string, username: string) {
  if (password.length < 10) return 'Use at least 10 characters for your password.';
  if (password.length > 200) return 'That password is too long (200 characters at most).';
  if (password.toLowerCase().includes(username.toLowerCase())) return 'Your password can’t contain your username.';
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|password\d*|qwertyuiop)/i.test(password)) return 'That password is too easy to guess.';
  return null;
}

/**
 * Guessing limits, kept in memory (one server process): 8 wrong passwords for a
 * username, or 30 from one address, in 15 minutes, then a wait.
 */
const WINDOW = 15 * 60_000;
const failures = new Map<string, { count: number; since: number }>();
const LIMITS = { user: 8, ip: 30 };

function over(key: string, limit: number) {
  const f = failures.get(key);
  if (!f) return 0;
  if (Date.now() - f.since > WINDOW) {
    failures.delete(key);
    return 0;
  }
  return f.count >= limit ? Math.ceil((f.since + WINDOW - Date.now()) / 60_000) : 0;
}

/** Minutes to wait before trying again, or 0. */
export function lockedFor(username: string, ip: string) {
  return Math.max(over(`u:${username}`, LIMITS.user), over(`i:${ip}`, LIMITS.ip));
}

export function noteFailure(username: string, ip: string) {
  if (failures.size > 50_000) failures.clear(); // never grow without bound
  for (const key of [`u:${username}`, `i:${ip}`]) {
    const f = failures.get(key);
    if (!f || Date.now() - f.since > WINDOW) failures.set(key, { count: 1, since: Date.now() });
    else f.count++;
  }
}

export function noteSuccess(username: string) {
  failures.delete(`u:${username}`);
}
