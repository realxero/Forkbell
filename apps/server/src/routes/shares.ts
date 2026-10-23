import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { createHmac, randomInt } from 'node:crypto';
import { shareInvites, shares, type connect } from '@forkbell/db';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { env } from '../env.ts';

export const PERMISSIONS = ['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read'] as const;
const permsSchema = z
  .array(z.enum(PERMISSIONS))
  .min(1, 'Pick at least one thing to share.')
  // Logging food for someone means seeing their diary too.
  .transform((p) => [...new Set(p.includes('food_write') ? [...p, 'food_read' as const] : p)]);

// Codes are 8 letters and digits without look-alikes (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const hashCode = (code: string) => createHmac('sha256', env.sessionSecret).update(`invite:${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest('base64url');

/** Family sharing. Always about your own account, whatever profile you're viewing. */
export function shareRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();
  const me = (c: { get: (k: 'userId') => string }) => c.get('userId');

  r.get('/', async (c) => {
    const data = await asUser(me(c), async (tx) => {
      const people = (await tx.execute(sql`select * from share_list()`)) as unknown as {
        share_id: string; direction: 'mine' | 'with_me'; person_id: string; person_name: string | null; person_email: string | null; permissions: string[];
      }[];
      const invites = await tx.select().from(shareInvites).where(sql`${shareInvites.usedAt} is null and ${shareInvites.expiresAt} > now()`);
      return { people, invites };
    });
    const person = (p: (typeof data.people)[number]) => ({ shareId: p.share_id, personId: p.person_id, name: p.person_name ?? p.person_email ?? 'Someone', permissions: p.permissions });
    return c.json({
      sharingWith: data.people.filter((p) => p.direction === 'mine').map(person),
      sharedWithMe: data.people.filter((p) => p.direction === 'with_me').map(person),
      invites: data.invites.map((i) => ({ id: i.id, permissions: i.permissions, expiresAt: i.expiresAt })),
    });
  });

  /** Make an invite code. Whoever enters it gets these permissions on your data, until you end it. */
  r.post('/invites', async (c) => {
    const parsed = z.object({ permissions: permsSchema }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Pick what to share.' }, 400);
    const code = newCode();
    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    await asUser(me(c), (tx) => tx.insert(shareInvites).values({ codeHash: hashCode(code), permissions: parsed.data.permissions, expiresAt } as typeof shareInvites.$inferInsert));
    // The code is only ever shown here; the server keeps a hash of it.
    return c.json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt }, 201);
  });

  r.delete('/invites/:id', async (c) => {
    await asUser(me(c), (tx) => tx.delete(shareInvites).where(eq(shareInvites.id, c.req.param('id'))));
    return c.json({ ok: true });
  });

  r.post('/accept', async (c) => {
    const parsed = z.object({ code: z.string().trim().min(8).max(12) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Enter the 8-character code.' }, 400);
    try {
      await asUser(me(c), (tx) => tx.execute(sql`select accept_share_invite(${hashCode(parsed.data.code)})`));
      return c.json({ ok: true });
    } catch (e) {
      const msg = JSON.stringify(e, Object.getOwnPropertyNames(e)) + String((e as { cause?: unknown }).cause ?? '');
      if (msg.includes('your own invite')) return c.json({ error: 'That’s your own invite. Send it to the person you want to share with.' }, 400);
      if (msg.includes('not found or expired')) return c.json({ error: 'That code isn’t valid, was already used, or has expired.' }, 404);
      throw e;
    }
  });

  /** Change what you share with someone. */
  r.put('/:id', async (c) => {
    const parsed = z.object({ permissions: permsSchema }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Pick what to share.' }, 400);
    const rows = await asUser(me(c), (tx) => tx.update(shares).set({ permissions: parsed.data.permissions }).where(and(eq(shares.id, c.req.param('id')), eq(shares.ownerId, me(c)))).returning({ id: shares.id }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  /** Stop sharing (owner), or stop seeing someone's data (the person it's shared with). */
  r.delete('/:id', async (c) => {
    const rows = await asUser(me(c), (tx) => tx.delete(shares).where(eq(shares.id, c.req.param('id'))).returning({ id: shares.id }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  return r;
}
