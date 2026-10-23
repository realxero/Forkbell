import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { goalsSchema, preferencesSchema, type Me } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

export function meRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const [u] = await asUser(c.get('profileId'), (tx) => tx.select().from(users).where(eq(users.id, c.get('profileId'))).limit(1));
    if (!u) return c.json({ error: 'Account not found.' }, 404);
    const me: Me = {
      id: u.id,
      name: u.name,
      email: u.email,
      goals: { kcal: u.goalKcal, protein: u.goalProtein, carbs: u.goalCarbs, fat: u.goalFat },
      weightUnit: u.weightUnit,
      // Stored as given; defaults fill anything missing (and anything added later).
      preferences: preferencesSchema.parse(u.preferences ?? {}),
      weekdayGoals: (u.weekdayGoals ?? {}) as Me['weekdayGoals'],
    };
    return c.json(me);
  });

  r.put('/goals', async (c) => {
    const parsed = goalsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your goals.' }, 400);
    const g = parsed.data;
    await asUser(c.get('profileId'), (tx) =>
      tx.update(users).set({ goalKcal: g.kcal, goalProtein: g.protein, goalCarbs: g.carbs, goalFat: g.fat }).where(eq(users.id, c.get('profileId'))),
    );
    return c.json({ goals: g });
  });

  /** Different goals for particular weekdays, e.g. more on training days or weekends. */
  r.put('/weekday-goals', async (c) => {
    const parsed = z.partialRecord(z.enum(['0', '1', '2', '3', '4', '5', '6']), goalsSchema.nullable()).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the weekday goals.' }, 400);
    // A null day goes back to the everyday goals.
    const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, g]) => g !== null));
    await asUser(c.get('profileId'), (tx) => tx.update(users).set({ weekdayGoals: clean }).where(eq(users.id, c.get('profileId'))));
    return c.json({ weekdayGoals: clean });
  });

  r.put('/preferences', async (c) => {
    const parsed = preferencesSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your preferences.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.update(users).set({ preferences: parsed.data }).where(eq(users.id, c.get('profileId'))));
    return c.json({ preferences: parsed.data });
  });

  r.put('/settings', async (c) => {
    const parsed = z.object({ weightUnit: z.enum(['lb', 'kg']) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick lb or kg.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.update(users).set({ weightUnit: parsed.data.weightUnit }).where(eq(users.id, c.get('profileId'))));
    return c.json(parsed.data);
  });

  return r;
}
