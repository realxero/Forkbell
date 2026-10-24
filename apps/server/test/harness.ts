// A real Forkbell server for tests: started from the source against a real,
// already-migrated Postgres, with sign-in sessions made straight in the
// database (no OIDC provider needed). Each test run uses fresh throwaway users.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SECRET = 'test-session-secret-that-is-long-enough-0123456789';
export const PORT = Number(process.env.TEST_PORT ?? 3999);
export const BASE = `http://localhost:${PORT}`;

let server: ChildProcess | null = null;
let admin: postgres.Sql | null = null;
const log: string[] = [];

export async function startServer(extraEnv: Record<string, string> = {}) {
  if (!process.env.DATABASE_ADMIN_URL || !process.env.DATABASE_URL) throw new Error('Set DATABASE_ADMIN_URL and DATABASE_URL (and run the migrations first).');
  admin = postgres(process.env.DATABASE_ADMIN_URL, { max: 2, onnotice: () => {} });
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(here, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      PUBLIC_URL: BASE,
      SESSION_SECRET: SECRET,
      OIDC_ISSUER: 'http://localhost:1/not-used',
      OIDC_CLIENT_ID: 'test',
      OIDC_CLIENT_SECRET: 'test',
      AI_PROVIDER: '',
      PREFETCH_PICTURES: 'off',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (d) => log.push(String(d)));
  server.stderr!.on('data', (d) => log.push(String(d)));
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The server didn't start:\n${log.join('')}`);
}

export async function stopServer() {
  server?.kill();
  await admin?.end();
}

/** The server's output, for when a test fails. */
export const serverLog = () => log.join('');

/** A new user with a signed-in session; returns a fetch that sends their token. */
export async function newUser(name = 'Tester') {
  const tag = `test-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const [row] = await admin!`select auth_upsert_user(${tag}, ${name}, null, ${name}) as id`;
  const id = row!.id as string;
  const token = randomBytes(32).toString('base64url');
  const hash = createHmac('sha256', SECRET).update(token).digest('base64url');
  await admin!`select auth_create_session(${id}::uuid, ${hash}, ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz)`;
  return { id, token, call: caller(token) };
}

export type Reply = { status: number; type: string; body: any; text: string };

/** fetch as someone (or nobody), JSON in and out. */
export function caller(token: string | null) {
  return async (method: string, p: string, body?: unknown): Promise<Reply> => {
    const res = await fetch(BASE + p, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const type = res.headers.get('content-type') ?? '';
    let parsed: unknown = null;
    if (type.includes('application/json')) parsed = JSON.parse(text);
    return { status: res.status, type, body: parsed, text };
  };
}
