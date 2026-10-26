// Settings → Sign-in and security: your password, and where you're signed in.
// Always about the signed-in person, never a profile shared with them.
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { connect } from '@forkbell/db';
import type { AccountSecurity } from '@forkbell/shared';
import { z } from 'zod';
import { newSignInCode, type AppEnv } from '../auth.ts';
import { env } from '../env.ts';
import { USERNAME, hashPassword, lockedFor, noteFailure, noteSuccess, passwordProblem, verifyPassword } from '../password.ts';

export function accountRoutes({ db, asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();
  const run = <T>(c: { get: (k: 'userId') => string }, q: ReturnType<typeof sql>) =>
    asUser(c.get('userId'), async (tx) => (await tx.execute(q)) as unknown as T[]);

  r.get('/', async (c) => {
    const [pw] = await run<{ username: string; changed_at: string }>(c, sql`select * from auth_password_info()`);
    const [local] = await run<{ local: boolean }>(c, sql`select auth_is_local() as local`);
    const sessions = await run<{ id: string; method: string | null; device: string | null; created_at: string; expires_at: string; current: boolean }>(
      c,
      sql`select * from auth_list_sessions(${c.get('tokenHash')})`,
    );
    const out: AccountSecurity = {
      passwordLogin: env.password.enabled,
      sso: env.oidc ? env.oidc.name : null,
      accountKind: local?.local ? 'password' : 'sso',
      username: pw?.username ?? null,
      passwordChangedAt: pw ? new Date(pw.changed_at).toISOString() : null,
      sessions: sessions.map((s) => ({
        id: s.id,
        method: (s.method as 'sso' | 'password' | null) ?? null,
        device: s.device,
        createdAt: new Date(s.created_at).toISOString(),
        expiresAt: new Date(s.expires_at).toISOString(),
        current: s.current,
      })),
    };
    return c.json(out);
  });

  /** Add a password (Authelia accounts) or change it. Signs out your other devices. */
  r.put('/password', async (c) => {
    if (!env.password.enabled) return c.json({ error: 'Password sign-in is off on this server.' }, 403);
    const parsed = z
      .object({ username: z.string().trim().toLowerCase(), password: z.string().max(500), current: z.string().max(500).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Check the form and try again.' }, 400);
    const { username, password, current } = parsed.data;
    if (!USERNAME.test(username)) return c.json({ error: 'Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.' }, 400);
    const problem = passwordProblem(password, username);
    if (problem) return c.json({ error: problem }, 400);

    const [pw] = await run<{ username: string }>(c, sql`select username from auth_password_info()`);
    if (pw) {
      // Changing a password needs the old one.
      const key = `account:${c.get('userId')}`;
      if (lockedFor(key, '')) return c.json({ error: 'Too many wrong passwords. Wait a few minutes.' }, 429);
      const [row] = await db.execute<{ password_hash: string }>(sql`select password_hash from auth_password_lookup(${pw.username})`);
      if (!current || !row || !(await verifyPassword(current, row.password_hash))) {
        noteFailure(key, '');
        return c.json({ error: 'Your current password isn’t right.' }, 403);
      }
      noteSuccess(key);
    }
    const [ok] = await run<{ ok: boolean }>(c, sql`select auth_password_set(${username}, ${await hashPassword(password)}) as ok`);
    if (!ok?.ok) return c.json({ error: 'That username is taken. Pick another.' }, 409);
    const [ended] = await run<{ n: number }>(c, sql`select auth_end_other_sessions(${c.get('tokenHash')}) as n`);
    return c.json({ ok: true, username, signedOut: Number(ended?.n ?? 0) });
  });

  /** Accounts made with Authelia can go back to Authelia only. */
  r.delete('/password', async (c) => {
    const [ok] = await run<{ ok: boolean }>(c, sql`select auth_password_remove() as ok`);
    if (!ok?.ok) return c.json({ error: 'Your account signs in with this password only, so it can’t be removed. Change it instead.' }, 400);
    return c.json({ ok: true });
  });

  /** A one-time code to sign in another device (5 minutes, one use). */
  r.post('/sign-in-code', (c) => c.json(newSignInCode(c.get('userId'))));

  r.post('/sessions/sign-out-others', async (c) => {
    const [ended] = await run<{ n: number }>(c, sql`select auth_end_other_sessions(${c.get('tokenHash')}) as n`);
    return c.json({ signedOut: Number(ended?.n ?? 0) });
  });

  r.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (c.get('tokenHash').startsWith(id)) return c.json({ error: 'That’s this device. Use Sign out instead.' }, 400);
    const [ok] = await run<{ ok: boolean }>(c, sql`select auth_end_session_by_id(${id}) as ok`);
    if (!ok?.ok) return c.json({ error: 'That sign-in has already ended.' }, 404);
    return c.json({ ok: true });
  });

  return r;
}
