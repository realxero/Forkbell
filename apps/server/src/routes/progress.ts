import { Hono } from 'hono';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { healthDaily, measurements, users, weighIns, workouts, type connect } from '@forkbell/db';
import { addDays, computeStreaks, dateSchema, estimateEnergy, milestones, planGoal, todayLocal, weightTrend, type Activity, type HealthSource } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

export const MEASUREMENT_KINDS = ['waist', 'hips', 'chest', 'neck', 'arm', 'thigh', 'calf'] as const;

const weighInSchema = z.object({ date: dateSchema, weightKg: z.number().min(20).max(400), bodyFat: z.number().min(2).max(70).nullish() });
const measurementSchema = z.object({ date: dateSchema, kind: z.enum(MEASUREMENT_KINDS), valueCm: z.number().min(5).max(300) });
const goalSchema = z.object({
  goalWeightKg: z.number().min(20).max(400).nullable(),
  goalDate: dateSchema.nullable(),
  weeklyWorkoutGoal: z.number().int().min(1).max(14),
});

export function progressRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Everything the Progress screen shows, worked out from your own data. */
  r.get('/', async (c) => {
    const t = dateSchema.safeParse(c.req.query('today'));
    const today = t.success ? t.data : todayLocal();
    const userId = c.get('userId');
    const data = await asUser(userId, async (tx) => {
      const [me] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      const weights = await tx.select().from(weighIns).orderBy(asc(weighIns.date));
      const intakeRows = await tx.execute<{ date: string; kcal: string }>(sql`
        select d.date::text as date, sum(d.grams / 100 * f.kcal) as kcal
        from diary_entries d join foods f on f.id = d.food_id
        where d.date >= ${addDays(today, -400)}::date and d.date <= ${today}::date
        group by d.date`);
      const done = await tx.select({ date: workouts.date }).from(workouts).where(isNotNull(workouts.finishedAt)).orderBy(asc(workouts.date));
      const ms = await tx.select().from(measurements).orderBy(asc(measurements.date));
      const health = await tx.select().from(healthDaily).where(sql`${healthDaily.date} >= ${addDays(today, -8)}::date`);
      return { me: me!, weights, intakeRows, done, ms, health };
    });

    const unit = data.me.weightUnit;
    const series = weightTrend(data.weights.map((w) => ({ date: w.date, weightKg: w.weightKg, bodyFat: w.bodyFat })));
    const intake: Record<string, number> = {};
    for (const row of data.intakeRows) intake[row.date] = Number(row.kcal);
    const loggedDates = Object.keys(intake).filter((d) => intake[d]! > 0);
    const workoutDates = data.done.map((w) => w.date);
    const energy = estimateEnergy(intake, series, today);
    const current = series.at(-1) ?? null;
    const goalKg = data.me.goalWeightKg;
    const plan = current && goalKg !== null ? planGoal({ currentKg: current.trendKg, goalKg, goalDate: data.me.goalDate, today, energy, unit }) : null;

    const byKind = new Map<string, { date: string; valueCm: number }[]>();
    for (const m of data.ms) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), { date: m.date, valueCm: m.valueCm }]);

    // Activity from the phone: today, and the average of the last 7 full days.
    const valueOn = (kind: string, date: string) => {
      const rows = data.health.filter((h) => h.kind === kind && h.date === date);
      return rows.length ? Math.max(...rows.map((h) => h.value)) : null; // two sources: take the larger, never add
    };
    const avg = (kind: string) => {
      const vals = [1, 2, 3, 4, 5, 6, 7].map((i) => valueOn(kind, addDays(today, -i))).filter((v): v is number => v !== null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const hr = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => valueOn('resting_hr', addDays(today, -i))).find((v) => v !== null) ?? null;
    const activity: Activity = {
      today: { steps: valueOn('steps', today), activeKcal: valueOn('active_kcal', today) },
      week: { steps: avg('steps'), activeKcal: avg('active_kcal') },
      restingHr: hr,
      source: (data.health[0]?.source as HealthSource | undefined) ?? null,
    };

    return c.json({
      today,
      unit,
      activity,
      weighIns: series.slice(-400).map((p, i, all) => {
        const w = data.weights[data.weights.length - all.length + i];
        return { ...p, bodyFat: w?.bodyFat ?? null, source: w?.source ?? 'manual' };
      }),
      energy,
      calorieGoal: data.me.goalKcal,
      goal: { weightKg: goalKg, date: data.me.goalDate, weeklyWorkoutGoal: data.me.weeklyWorkoutGoal, plan },
      streaks: computeStreaks(loggedDates, workoutDates, data.me.weeklyWorkoutGoal, today),
      milestones: milestones({ loggedDates, workoutDates, series, goalKg, unit }),
      measurements: MEASUREMENT_KINDS.map((kind) => {
        const list = byKind.get(kind) ?? [];
        return { kind, latest: list.at(-1) ?? null, first: list.length > 1 ? list[0]! : null };
      }),
    });
  });

  /** Log a weight. A second one on the same day replaces the first. */
  r.put('/weigh-ins', async (c) => {
    const parsed = weighInSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Enter a weight between 20 and 400 kg (44 and 880 lb).' }, 400);
    const { date, weightKg, bodyFat } = parsed.data;
    await asUser(c.get('userId'), (tx) =>
      tx
        .insert(weighIns)
        .values({ date, weightKg, bodyFat: bodyFat ?? null } as typeof weighIns.$inferInsert)
        .onConflictDoUpdate({ target: [weighIns.userId, weighIns.date], set: { weightKg, bodyFat: bodyFat ?? null } }),
    );
    return c.json({ ok: true });
  });

  r.delete('/weigh-ins/:date', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    const deleted = await asUser(c.get('userId'), (tx) => tx.delete(weighIns).where(eq(weighIns.date, date.data)).returning({ id: weighIns.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'No weigh-in that day.' }, 404);
  });

  r.put('/measurements', async (c) => {
    const parsed = measurementSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the measurement.' }, 400);
    const { date, kind, valueCm } = parsed.data;
    await asUser(c.get('userId'), (tx) =>
      tx
        .insert(measurements)
        .values({ date, kind, valueCm } as typeof measurements.$inferInsert)
        .onConflictDoUpdate({ target: [measurements.userId, measurements.date, measurements.kind], set: { valueCm } }),
    );
    return c.json({ ok: true });
  });

  r.delete('/measurements/:date/:kind', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    const deleted = await asUser(c.get('userId'), (tx) =>
      tx.delete(measurements).where(and(eq(measurements.date, date.data), eq(measurements.kind, c.req.param('kind')))).returning({ id: measurements.id }),
    );
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'No measurement like that.' }, 404);
  });

  r.put('/goal', async (c) => {
    const parsed = goalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your goal.' }, 400);
    await asUser(c.get('userId'), (tx) => tx.update(users).set(parsed.data).where(eq(users.id, c.get('userId'))));
    return c.json(parsed.data);
  });

  return r;
}
