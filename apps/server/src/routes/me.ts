import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { goalsSchema, type Me } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

export function meRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const [u] = await asUser(c.get('userId'), (tx) => tx.select().from(users).where(eq(users.id, c.get('userId'))).limit(1));
    if (!u) return c.json({ error: 'Account not found.' }, 404);
    const me: Me = {
      id: u.id,
      name: u.name,
      email: u.email,
      goals: { kcal: u.goalKcal, protein: u.goalProtein, carbs: u.goalCarbs, fat: u.goalFat },
      weightUnit: u.weightUnit,
    };
    return c.json(me);
  });

  r.put('/goals', async (c) => {
    const parsed = goalsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your goals.' }, 400);
    const g = parsed.data;
    await asUser(c.get('userId'), (tx) =>
      tx.update(users).set({ goalKcal: g.kcal, goalProtein: g.protein, goalCarbs: g.carbs, goalFat: g.fat }).where(eq(users.id, c.get('userId'))),
    );
    return c.json({ goals: g });
  });

  r.put('/settings', async (c) => {
    const parsed = z.object({ weightUnit: z.enum(['lb', 'kg']) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick lb or kg.' }, 400);
    await asUser(c.get('userId'), (tx) => tx.update(users).set({ weightUnit: parsed.data.weightUnit }).where(eq(users.id, c.get('userId'))));
    return c.json(parsed.data);
  });

  return r;
}
