import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { goalsAtKcal, goalsSchema, isTimeZone, preferencesSchema, reverseDietStep, shiftWeekdayGoals, todayIn, type Me } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

export function meRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    let [u] = await asUser(c.get('profileId'), (tx) => tx.select().from(users).where(eq(users.id, c.get('profileId'))).limit(1));
    if (!u) return c.json({ error: 'Account not found.' }, 404);
    // A diet break you planned ends by itself: the goals you had come back the day after.
    // ponytail: checked when the app loads you, so a server-only read (Shortcuts, MCP) waits for the next app open.
    const prefs = preferencesSchema.parse(u.preferences ?? {});
    if (prefs.dietBreak && todayIn(u.timeZone) > prefs.dietBreak.until) {
      const g = prefs.dietBreak.goals;
      [u] = await asUser(c.get('profileId'), (tx) =>
        tx
          .update(users)
          .set({ goalKcal: g.kcal, goalProtein: g.protein, goalCarbs: g.carbs, goalFat: g.fat, weekdayGoals: shiftWeekdayGoals(u!.weekdayGoals as Me['weekdayGoals'], (g.kcal ?? 0) - (u!.goalKcal ?? g.kcal ?? 0)), preferences: { ...prefs, dietBreak: null } })
          .where(eq(users.id, c.get('profileId')))
          .returning(),
      );
      if (!u) return c.json({ error: 'Account not found.' }, 404);
    }
    // A reverse diet moves your calories up a step each new week (carbs, fat and weekday goals with it), then ends at its target.
    const rev = preferencesSchema.parse(u.preferences ?? {});
    const step = rev.reverseDiet ? reverseDietStep(rev.reverseDiet, todayIn(u.timeZone), u.goalKcal) : null;
    if (rev.reverseDiet && step) {
      const g = goalsAtKcal({ kcal: u.goalKcal, protein: u.goalProtein, carbs: u.goalCarbs, fat: u.goalFat }, step.kcal);
      const was = u;
      [u] = await asUser(c.get('profileId'), (tx) =>
        tx
          .update(users)
          .set({ goalKcal: g.kcal, goalCarbs: g.carbs, goalFat: g.fat, weekdayGoals: shiftWeekdayGoals(was.weekdayGoals as Me['weekdayGoals'], step.kcal - (was.goalKcal ?? step.kcal)), preferences: { ...rev, reverseDiet: step.done ? null : { ...rev.reverseDiet!, week: step.week } } })
          .where(eq(users.id, c.get('profileId')))
          .returning(),
      );
      if (!u) return c.json({ error: 'Account not found.' }, 404);
    }
    const me: Me = {
      id: u.id,
      name: u.name,
      email: u.email,
      goals: { kcal: u.goalKcal, protein: u.goalProtein, carbs: u.goalCarbs, fat: u.goalFat },
      weightUnit: u.weightUnit,
      // Stored as given; defaults fill anything missing (and anything added later).
      preferences: preferencesSchema.parse(u.preferences ?? {}),
      weekdayGoals: (u.weekdayGoals ?? {}) as Me['weekdayGoals'],
      timeZone: u.timeZone,
    };
    return c.json(me);
  });

  /**
   * Save your goals. Setting them yourself ends a diet break (so its old goals
   * don't come back over the new ones) and drops a check-in's Undo. A change
   * that comes from a plan sends shiftWeekdays, and weekday goals move with it.
   */
  r.put('/goals', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = goalsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your goals.' }, 400);
    const g = parsed.data;
    const shift = (body as { shiftWeekdays?: unknown }).shiftWeekdays === true;
    const endedBreak = await asUser(c.get('profileId'), async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, c.get('profileId'))).limit(1);
      if (!u) return false;
      const prefs = preferencesSchema.parse(u.preferences ?? {});
      const delta = shift && g.kcal !== null && u.goalKcal !== null ? g.kcal - u.goalKcal : 0;
      await tx
        .update(users)
        .set({ goalKcal: g.kcal, goalProtein: g.protein, goalCarbs: g.carbs, goalFat: g.fat, weekdayGoals: shiftWeekdayGoals(u.weekdayGoals as Me['weekdayGoals'], delta), preferences: { ...prefs, dietBreak: null, checkInUndo: null } })
        .where(eq(users.id, c.get('profileId')));
      return !!prefs.dietBreak;
    });
    return c.json({ goals: g, endedBreak });
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
    // The app sends back its whole copy, which can be older than the server's. The
    // server's own bookkeeping wins, or a stale copy would make a weekly check-in or
    // a reverse-diet step run twice: which check-in week is handled, its Undo (the
    // app may only clear it), and how many reverse-diet steps are done.
    const next = parsed.data;
    await asUser(c.get('profileId'), async (tx) => {
      const [u] = await tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, c.get('profileId'))).limit(1);
      const now = preferencesSchema.parse(u?.preferences ?? {});
      next.checkInWeek = now.checkInWeek;
      next.checkInUndo = next.checkInUndo === null ? null : now.checkInUndo;
      if (next.reverseDiet && now.reverseDiet && next.reverseDiet.from === now.reverseDiet.from) next.reverseDiet.week = now.reverseDiet.week;
      await tx.update(users).set({ preferences: next }).where(eq(users.id, c.get('profileId')));
    });
    return c.json({ preferences: next });
  });

  r.put('/settings', async (c) => {
    const parsed = z.object({ weightUnit: z.enum(['lb', 'kg']) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick lb or kg.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.update(users).set({ weightUnit: parsed.data.weightUnit }).where(eq(users.id, c.get('profileId'))));
    return c.json(parsed.data);
  });

  /** The phone's time zone, so "today" on the server (AI apps, Shortcuts) is your today. Always your own, even while viewing someone else. */
  r.put('/time-zone', async (c) => {
    const parsed = z.object({ timeZone: z.string().max(64).refine(isTimeZone, 'Unknown time zone.') }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send a time zone.' }, 400);
    await asUser(c.get('userId'), (tx) => tx.update(users).set({ timeZone: parsed.data.timeZone }).where(eq(users.id, c.get('userId'))));
    return c.json(parsed.data);
  });

  return r;
}
