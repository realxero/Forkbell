import { Hono } from 'hono';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { healthDaily, measurements, users, weighIns, workouts, type connect } from '@forkbell/db';
import { addDays, computeStreaks, dateSchema, estimateEnergy, HEALTH_KINDS, milestones, planGoal, todayLocal, weightTrend, type Activity, type HealthMetric, type HealthSource } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

export const MEASUREMENT_KINDS = ['waist', 'hips', 'chest', 'neck', 'arm', 'thigh', 'calf'] as const;

const weighInSchema = z.object({ date: dateSchema, weightKg: z.number().min(20).max(400), bodyFat: z.number().min(2).max(70).nullish() });
/** Body measurements (cm) or anything you want to track with your own unit. */
const measurementSchema = z.object({ date: dateSchema, kind: z.string().trim().toLowerCase().min(1).max(40), value: z.number().min(0).max(100000), unit: z.string().trim().min(1).max(12).default('cm') });
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
    const userId = c.get('profileId');
    const data = await asUser(userId, async (tx) => {
      const [me] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      const weights = await tx.select().from(weighIns).orderBy(asc(weighIns.date));
      const intakeRows = await tx.execute<{ date: string; kcal: string; protein: string; carbs: string; fat: string }>(sql`
        select d.date::text as date, sum(d.grams / 100 * f.kcal) as kcal,
               sum(d.grams / 100 * f.protein) as protein, sum(d.grams / 100 * f.carbs) as carbs, sum(d.grams / 100 * f.fat) as fat
        from diary_entries d join foods f on f.id = d.food_id
        where d.date >= ${addDays(today, -400)}::date and d.date <= ${today}::date
        group by d.date`);
      const done = await tx.select({ date: workouts.date }).from(workouts).where(isNotNull(workouts.finishedAt)).orderBy(asc(workouts.date));
      const ms = await tx.select().from(measurements).orderBy(asc(measurements.date));
      const health = await tx.select().from(healthDaily).where(sql`${healthDaily.date} >= ${addDays(today, -60)}::date`);
      // Days you marked as finished: the burn estimate can trust these completely.
      const finished = await tx.execute<{ date: string }>(sql`select date::text as date from day_status where date >= ${addDays(today, -60)}::date`);
      return { me: me!, weights, intakeRows, done, ms, health, finished };
    });

    const unit = data.me.weightUnit;
    const series = weightTrend(data.weights.map((w) => ({ date: w.date, weightKg: w.weightKg, bodyFat: w.bodyFat })));
    const intake: Record<string, number> = {};
    for (const row of data.intakeRows) intake[row.date] = Number(row.kcal);
    const loggedDates = Object.keys(intake).filter((d) => intake[d]! > 0);
    const workoutDates = data.done.map((w) => w.date);
    const energy = estimateEnergy(intake, series, today, 28, new Set([...data.finished].map((f) => f.date)));
    const current = series.at(-1) ?? null;
    const goalKg = data.me.goalWeightKg;
    const plan = current && goalKg !== null ? planGoal({ currentKg: current.trendKg, goalKg, goalDate: data.me.goalDate, today, energy, unit }) : null;

    const byKind = new Map<string, { date: string; value: number; unit: string }[]>();
    for (const m of data.ms) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), { date: m.date, value: m.value, unit: m.unit }]);
    const custom = [...byKind.keys()].filter((k) => !(MEASUREMENT_KINDS as readonly string[]).includes(k));

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
    // Every health number: latest, 7-day average, and four weeks for a small chart.
    const metrics: HealthMetric[] = HEALTH_KINDS.filter((k) => data.health.some((h) => h.kind === k)).map((kind) => {
      const series = Array.from({ length: 28 }, (_, i) => valueOn(kind, addDays(today, i - 27)));
      const dated = data.health.filter((h) => h.kind === kind).sort((a, b) => (a.date < b.date ? 1 : -1));
      const latestDate = dated[0]?.date ?? null;
      const last7 = [0, 1, 2, 3, 4, 5, 6].map((i) => valueOn(kind, addDays(today, -i))).filter((v): v is number => v !== null);
      return {
        kind,
        latest: latestDate ? valueOn(kind, latestDate) : null,
        latestDate,
        avg7: last7.length ? Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 10) / 10 : null,
        series,
      };
    });
    const activity: Activity = {
      metrics,
      today: { steps: valueOn('steps', today), activeKcal: valueOn('active_kcal', today) },
      week: { steps: avg('steps'), activeKcal: avg('active_kcal') },
      restingHr: hr,
      source: (data.health[0]?.source as HealthSource | undefined) ?? null,
    };

    // The last four weeks, day by day, for the charts.
    const byDate = new Map(data.intakeRows.map((r) => [r.date, r]));
    const weekdayGoals = (data.me.weekdayGoals ?? {}) as Record<string, { kcal: number | null } | undefined>;
    const days = Array.from({ length: 28 }, (_, i) => {
      const date = addDays(today, i - 27);
      const r = byDate.get(date);
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      const goal = weekdayGoals[String(new Date(Date.UTC(y, m - 1, d)).getUTCDay())]?.kcal ?? data.me.goalKcal;
      return { date, kcal: Math.round(Number(r?.kcal ?? 0)), protein: Math.round(Number(r?.protein ?? 0)), carbs: Math.round(Number(r?.carbs ?? 0)), fat: Math.round(Number(r?.fat ?? 0)), goal };
    });

    return c.json({
      today,
      unit,
      activity,
      days,
      weighIns: series.slice(-400).map((p, i, all) => {
        const w = data.weights[data.weights.length - all.length + i];
        return { ...p, bodyFat: w?.bodyFat ?? null, source: w?.source ?? 'manual' };
      }),
      energy,
      calorieGoal: data.me.goalKcal,
      goal: { weightKg: goalKg, date: data.me.goalDate, weeklyWorkoutGoal: data.me.weeklyWorkoutGoal, plan },
      streaks: computeStreaks(loggedDates, workoutDates, data.me.weeklyWorkoutGoal, today),
      milestones: milestones({ loggedDates, workoutDates, series, goalKg, unit }),
      measurements: [...MEASUREMENT_KINDS, ...custom].map((kind) => {
        const list = byKind.get(kind) ?? [];
        return { kind, custom: custom.includes(kind), unit: list.at(-1)?.unit ?? 'cm', latest: list.at(-1) ?? null, first: list.length > 1 ? list[0]! : null };
      }),
    });
  });

  /** Log a weight. A second one on the same day replaces the first. */
  /**
   * Patterns from the last 90 days: foods that, on the days you ate them,
   * usually came with going over your calorie goal. Needs 3+ such days, and
   * a clearly higher rate than your days overall.
   */
  r.get('/patterns', async (c) => {
    const t = dateSchema.safeParse(c.req.query('today'));
    const today = t.success ? t.data : todayLocal();
    const rows = await asUser(c.get('profileId'), async (tx) => {
      const [me] = await tx.select({ goal: users.goalKcal }).from(users).where(eq(users.id, c.get('profileId'))).limit(1);
      if (!me?.goal) return { goal: null, rows: [] as { food_id: string; name: string; days: string; over_days: string; base: string }[] };
      const result = await tx.execute<{ food_id: string; name: string; days: string; over_days: string; base: string }>(sql`
        with day_totals as (
          select d.date, sum(d.grams / 100 * f.kcal) as kcal
          from diary_entries d join foods f on f.id = d.food_id
          where d.date >= ${addDays(today, -90)}::date and d.date < ${today}::date
          group by d.date
        ),
        base as (select avg(case when kcal > ${me.goal} * 1.05 then 1.0 else 0 end) as rate from day_totals),
        food_days as (
          select distinct d.date, d.food_id, f.name
          from diary_entries d join foods f on f.id = d.food_id
          where d.date >= ${addDays(today, -90)}::date and d.date < ${today}::date
        )
        select fd.food_id, fd.name, count(*) as days,
               sum(case when dt.kcal > ${me.goal} * 1.05 then 1 else 0 end) as over_days,
               (select rate from base) as base
        from food_days fd join day_totals dt on dt.date = fd.date
        group by fd.food_id, fd.name
        having count(*) >= 3
      `);
      return { goal: me.goal, rows: result as unknown as { food_id: string; name: string; days: string; over_days: string; base: string }[] };
    });
    const patterns = rows.rows
      .map((r) => ({ foodId: r.food_id, name: r.name, days: Number(r.days), overDays: Number(r.over_days), base: Number(r.base) }))
      .filter((p) => p.overDays / p.days >= 0.6 && p.overDays / p.days >= p.base + 0.25)
      .sort((a, b) => b.overDays / b.days - a.overDays / a.days)
      .slice(0, 20)
      .map(({ base: _b, ...p }) => p);
    return c.json({ patterns });
  });

  /** This month next to last month: logging, calories, protein, weight and workouts. */
  r.get('/recap', async (c) => {
    const t = dateSchema.safeParse(c.req.query('today'));
    const today = t.success ? t.data : todayLocal();
    const thisStart = `${today.slice(0, 7)}-01`;
    const lastStart = addDays(thisStart, -1).slice(0, 7) + '-01';
    const month = async (from: string, to: string) =>
      asUser(c.get('profileId'), async (tx) => {
        const [food] = (await tx.execute<{ days: string; kcal: string | null; protein: string | null }>(sql`
          select count(*) as days, avg(kcal) as kcal, avg(protein) as protein from (
            select d.date, sum(d.grams / 100 * f.kcal) as kcal, sum(d.grams / 100 * f.protein) as protein
            from diary_entries d join foods f on f.id = d.food_id
            where d.date between ${from}::date and ${to}::date group by d.date) x`)) as unknown as { days: string; kcal: string | null; protein: string | null }[];
        const w = await tx.select({ date: weighIns.date, kg: weighIns.weightKg }).from(weighIns).where(sql`${weighIns.date} between ${from}::date and ${to}::date`).orderBy(asc(weighIns.date));
        const [wk] = (await tx.execute<{ n: string }>(sql`select count(*) as n from workouts where finished_at is not null and date between ${from}::date and ${to}::date`)) as unknown as { n: string }[];
        return {
          daysLogged: Number(food?.days ?? 0),
          avgKcal: food?.kcal ? Math.round(Number(food.kcal)) : null,
          avgProtein: food?.protein ? Math.round(Number(food.protein)) : null,
          weightChangeKg: w.length >= 2 ? Math.round((w.at(-1)!.kg - w[0]!.kg) * 10) / 10 : null,
          workouts: Number(wk?.n ?? 0),
        };
      });
    const lastEnd = addDays(thisStart, -1);
    return c.json({ thisMonth: { start: thisStart, ...(await month(thisStart, today)) }, lastMonth: { start: lastStart, ...(await month(lastStart, lastEnd)) } });
  });

  r.put('/weigh-ins', async (c) => {
    const parsed = weighInSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Enter a weight between 20 and 400 kg (44 and 880 lb).' }, 400);
    const { date, weightKg, bodyFat } = parsed.data;
    await asUser(c.get('profileId'), (tx) =>
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
    const deleted = await asUser(c.get('profileId'), (tx) => tx.delete(weighIns).where(eq(weighIns.date, date.data)).returning({ id: weighIns.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'No weigh-in that day.' }, 404);
  });

  r.put('/measurements', async (c) => {
    const parsed = measurementSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the measurement.' }, 400);
    const { date, kind, value, unit } = parsed.data;
    if ((MEASUREMENT_KINDS as readonly string[]).includes(kind) && (unit !== 'cm' || value < 5 || value > 300)) return c.json({ error: 'Body measurements are 5 to 300 cm.' }, 400);
    await asUser(c.get('profileId'), (tx) =>
      tx
        .insert(measurements)
        .values({ date, kind, value, unit } as typeof measurements.$inferInsert)
        .onConflictDoUpdate({ target: [measurements.userId, measurements.date, measurements.kind], set: { value, unit } }),
    );
    return c.json({ ok: true });
  });

  r.delete('/measurements/:date/:kind', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    const deleted = await asUser(c.get('profileId'), (tx) =>
      tx.delete(measurements).where(and(eq(measurements.date, date.data), eq(measurements.kind, c.req.param('kind')))).returning({ id: measurements.id }),
    );
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'No measurement like that.' }, 404);
  });

  r.put('/goal', async (c) => {
    const parsed = goalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check your goal.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.update(users).set(parsed.data).where(eq(users.id, c.get('profileId'))));
    return c.json(parsed.data);
  });

  return r;
}
