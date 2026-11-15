import { Hono } from 'hono';
import { and, asc, count, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { exercises, routineExercises, routines, users, workoutExercises, workoutSets, workouts, type connect } from '@forkbell/db';
import {
  todayLocal,
  dateSchema,
  findRecords,
  incrementKg,
  nextTarget,
  saveWorkoutSchema,
  setVolumeKg,
  startWorkoutSchema,
  finishWorkoutSchema,
  type PersonalRecord,
  type SaveWorkoutInput,
  type SetEntry,
  type WorkoutSummary,
  todayIn,
  deloaded,
  generateWorkout,
  blockWeek,
  weeksTrainedInARow,
  preferencesSchema,
} from '@forkbell/shared';
import { timeZoneOf } from '../today.ts';
import type { AppEnv } from '../auth.ts';
import { historyBefore, isMissingExercise, lastSessions, loadWorkout, saveWorkout, toExercise, volumeSql } from '../training.ts';

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
/** A time sent by the app, never later than now (a phone clock can be off). */
const pastOrNow = (iso: string) => new Date(Math.min(Date.parse(iso), Date.now())).toISOString();

export function workoutRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Working sets per muscle between two dates, and how many workouts, for "this week" gaps. */
  /** For the muscle map: working sets per muscle this past week, and when each was last trained. */
  r.get('/muscle-map', async (c) => {
    const t = dateSchema.safeParse(c.req.query('today'));
    const today = t.success ? t.data : todayIn(await timeZoneOf(asUser, c.get('profileId')));
    const rows = (await asUser(c.get('profileId'), (tx) =>
      tx.execute<{ muscle: string; sets7: string; last: string | null }>(sql`
        select e.muscle,
               count(*) filter (where w.date > ${today}::date - 7) as sets7,
               max(w.date)::text as last
        from workout_sets s
        join workout_exercises we on we.id = s.workout_exercise_id
        join workouts w on w.id = we.workout_id
        join exercises e on e.id = we.exercise_id
        where w.finished_at is not null and s.done and not s.warmup and w.date > ${today}::date - 60 and w.date <= ${today}::date
        group by e.muscle`),
    )) as unknown as { muscle: string; sets7: string; last: string | null }[];
    return c.json({ today, muscles: rows.map((r) => ({ muscle: r.muscle, sets7: Number(r.sets7), last: r.last })) });
  });

  r.get('/muscles', async (c) => {
    const from = dateSchema.safeParse(c.req.query('from'));
    const to = dateSchema.safeParse(c.req.query('to'));
    if (!from.success || !to.success || from.data > to.data) return c.json({ error: 'Use from and to dates like 2026-10-22.' }, 400);
    const rows = await asUser(c.get('profileId'), (tx) =>
      tx
        .select({ muscle: exercises.muscle, sets: sql<number>`count(${workoutSets.id})::int` })
        .from(workoutSets)
        .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
        .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
        .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
        .where(and(sql`${workouts.date} between ${from.data}::date and ${to.data}::date`, sql`${workouts.finishedAt} is not null`, eq(workoutSets.done, true), eq(workoutSets.warmup, false)))
        .groupBy(exercises.muscle),
    );
    const [n] = await asUser(c.get('profileId'), (tx) =>
      tx.select({ n: count() }).from(workouts).where(and(sql`${workouts.date} between ${from.data}::date and ${to.data}::date`, sql`${workouts.finishedAt} is not null`)),
    );
    return c.json({ muscles: Object.fromEntries(rows.map((r) => [r.muscle, r.sets])), workouts: n?.n ?? 0 });
  });

  /**
   * A week in review for the training check-in: workouts, working sets per
   * muscle, and how many top sets were RPE 9 or harder.
   */
  r.get('/review', async (c) => {
    const from = dateSchema.safeParse(c.req.query('from'));
    const to = dateSchema.safeParse(c.req.query('to'));
    if (!from.success || !to.success || from.data > to.data) return c.json({ error: 'Use from and to dates like 2026-10-22.' }, 400);
    const out = await asUser(c.get('profileId'), async (tx) => {
      const range = sql`${workouts.date} between ${from.data}::date and ${to.data}::date and ${workouts.finishedAt} is not null`;
      const muscles = await tx
        .select({ muscle: exercises.muscle, sets: sql<number>`count(${workoutSets.id})::int` })
        .from(workoutSets)
        .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
        .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
        .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
        .where(and(range, eq(workoutSets.done, true), eq(workoutSets.warmup, false)))
        .groupBy(exercises.muscle);
      const [n] = await tx.select({ n: count() }).from(workouts).where(range);
      // The heaviest working set of each exercise in each session, and its RPE.
      const tops = (await tx.execute<{ rpe: string | null }>(sql`
        select distinct on (we.id) s.rpe
        from workout_sets s join workout_exercises we on we.id = s.workout_exercise_id join workouts w on w.id = we.workout_id
        where w.date between ${from.data}::date and ${to.data}::date and w.finished_at is not null and s.done and not s.warmup and s.weight_kg is not null
        order by we.id, s.weight_kg desc, s.reps desc`)) as unknown as { rpe: string | null }[];
      const [me] = await tx.select({ goal: users.weeklyWorkoutGoal }).from(users).where(eq(users.id, c.get('profileId'))).limit(1);
      const rated = tops.filter((t) => t.rpe !== null);
      return {
        weekOf: from.data,
        workouts: n?.n ?? 0,
        weeklyGoal: me?.goal ?? 3,
        sets: muscles.reduce((s, m) => s + m.sets, 0),
        muscles: Object.fromEntries(muscles.map((m) => [m.muscle, m.sets])),
        ratedTopSets: rated.length,
        hardTopSets: rated.filter((t) => Number(t.rpe) >= 9).length,
      };
    });
    return c.json(out);
  });

  /** Recent sessions, newest first. */
  r.get('/', async (c) => {
    const limit = Math.max(1, Math.min(Math.floor(Number(c.req.query('limit'))) || 20, 100));
    const rows = await asUser(c.get('profileId'), (tx) =>
      tx
        .select({
          w: workouts,
          exercises: sql<number>`count(distinct ${workoutExercises.id})::int`,
          sets: sql<number>`count(${workoutSets.id}) filter (where ${workoutSets.done} and not ${workoutSets.warmup})::int`,
          volumeKg: volumeSql,
        })
        .from(workouts)
        .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
        .leftJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
        .groupBy(workouts.id)
        .orderBy(desc(workouts.date), desc(workouts.startedAt))
        .limit(limit),
    );
    const list: WorkoutSummary[] = rows.map(({ w, ...n }) => ({ id: w.id, date: w.date, name: w.name, startedAt: w.startedAt, finishedAt: w.finishedAt, ...n }));
    return c.json({ workouts: list });
  });

  /** The session in progress, if any. There is at most one. */
  r.get('/open', async (c) => {
    const workout = await asUser(c.get('profileId'), async (tx) => {
      const [w] = await tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.finishedAt)).limit(1);
      return w ? loadWorkout(tx, w.id) : null;
    });
    return c.json({ workout });
  });

  /** Start a session, empty or from a routine with this time's suggested weights filled in. */
  r.post('/', async (c) => {
    const parsed = startWorkoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the workout.' }, 400);
    const userId = c.get('profileId');
    const result = await asUser(userId, async (tx) => {
      if (parsed.data.id) {
        const [prior] = await tx.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, parsed.data.id)).limit(1);
        if (prior) return { workout: await loadWorkout(tx, prior.id) }; // started earlier, offline
      }
      // A workout logged afterwards is saved finished, so it never clashes with one that's going.
      const past = parsed.data.finishedAt && parsed.data.startedAt ? { startedAt: pastOrNow(parsed.data.startedAt), finishedAt: pastOrNow(parsed.data.finishedAt) } : null;
      if (past && past.finishedAt <= past.startedAt) return { bad: 'The end is before the start.' };
      if (!past) {
        const [open] = await tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.finishedAt)).limit(1);
        if (open) return { conflict: open.id };
      }

      let name = 'Workout';
      let plan: SaveWorkoutInput['exercises'] = [];
      type Item = { re: { sets: number; repMin: number; repMax: number; restSeconds: number; superset: number | null }; ex: typeof exercises.$inferSelect };
      let items: Item[] | null = null;
      const [me] = await tx.select({ unit: users.weightUnit, prefs: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
      const training = preferencesSchema.parse(me?.prefs ?? {}).training;
      if (parsed.data.routineId) {
        const [routine] = await tx.select().from(routines).where(eq(routines.id, parsed.data.routineId)).limit(1);
        if (!routine) return { missing: true };
        name = routine.name;
        items = await tx
          .select({ re: routineExercises, ex: exercises })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(eq(routineExercises.routineId, routine.id))
          .orderBy(asc(routineExercises.position));
      } else if (parsed.data.generate) {
        // Picked for you: the most rested muscles, from your library and setup.
        const library = await tx
          .select({ ex: exercises, uses: sql<number>`(select count(*) from workout_exercises we where we.exercise_id = "exercises"."id")::int` })
          .from(exercises)
          .where(or(eq(exercises.ownerId, userId), isNull(exercises.ownerId)));
        const trained = await tx.execute<{ muscle: string; last: string }>(
          sql`select e.muscle, max(w.date)::text as last from workout_exercises we join exercises e on e.id = we.exercise_id join workouts w on w.id = we.workout_id where w.finished_at is not null group by e.muscle`,
        );
        const byId = new Map(library.map((l) => [l.ex.id, l.ex]));
        const made = generateWorkout(library.map((l) => ({ ...toExercise(l.ex), uses: l.uses })), training, Object.fromEntries([...trained].map((t) => [t.muscle, t.last])), parsed.data.date);
        name = made.name;
        items = made.items.map((i) => ({ re: { sets: i.sets, repMin: i.repMin, repMax: i.repMax, restSeconds: i.exercise.restSeconds, superset: null }, ex: byId.get(i.exercise.id)! }));
      }
      if (items) {
        const { deload } = training;
        const span = deload.from && deload.until ? { from: deload.from, until: deload.until } : null;
        const lighter = !!span && parsed.data.date >= span.from && parsed.data.date <= span.until;
        const last = await lastSessions(tx, items.map((i) => i.ex.id), undefined, span);
        // The week of your training block sets the reps in reserve to aim for.
        const done = await tx.select({ date: workouts.date }).from(workouts).where(isNotNull(workouts.finishedAt));
        const block = lighter ? null : blockWeek(weeksTrainedInARow(done.map((x) => x.date), parsed.data.date, deload.until), deload.every);
        plan = items.map(({ re, ex }) => {
          const step = incrementKg(ex.increment, me?.unit ?? 'lb');
          const target = nextTarget(last.get(ex.id) ?? [], re.repMin, re.repMax, step, ex.kind, block?.rir ?? null);
          const d = lighter ? deloaded(re.sets, target?.weightKg ?? null, step) : { sets: re.sets, weightKg: target?.weightKg ?? null };
          const sets: SetEntry[] = Array.from({ length: d.sets }, () => ({
            weightKg: d.weightKg,
            reps: target && ex.kind !== 'time' ? target.reps : null,
            seconds: null,
            rpe: null,
            warmup: false,
            done: false,
          }));
          return { exerciseId: ex.id, restSeconds: re.restSeconds, targetSets: d.sets, repMin: re.repMin, repMax: re.repMax, sets, superset: re.superset };
        });
      }
      const [w] = await tx
        .insert(workouts)
        .values({ ...(parsed.data.id ? { id: parsed.data.id } : {}), ...(parsed.data.startedAt ? { startedAt: pastOrNow(parsed.data.startedAt) } : {}), ...(past ?? {}), date: parsed.data.date, name, routineId: parsed.data.routineId ?? null } as typeof workouts.$inferInsert)
        .returning({ id: workouts.id });
      await saveWorkout(tx, w!.id, { name, date: parsed.data.date, notes: null, exercises: plan });
      return { workout: await loadWorkout(tx, w!.id) };
    });
    if ('conflict' in result) return c.json({ error: 'You already have a workout going. Finish or discard it first.', id: result.conflict }, 409);
    if ('missing' in result) return c.json({ error: 'That routine was not found.' }, 404);
    if ('bad' in result) return c.json({ error: result.bad }, 400);
    return c.json(result, 201);
  });

  r.get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const workout = await asUser(c.get('profileId'), (tx) => loadWorkout(tx, id));
    return workout ? c.json({ workout }) : c.json({ error: 'That workout was not found.' }, 404);
  });

  /** Save the whole session. The app sends it after each change, so nothing is lost if the phone dies mid-workout. */
  r.put('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const parsed = saveWorkoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the workout.' }, 400);
    try {
      const ok = await asUser(c.get('profileId'), (tx) => saveWorkout(tx, id, parsed.data));
      return ok ? c.json({ ok: true }) : c.json({ error: 'That workout was not found.' }, 404);
    } catch (err) {
      if (isMissingExercise(err)) return c.json({ error: 'One of those exercises was not found.' }, 400);
      throw err;
    }
  });

  /**
   * Finish: unticked sets and empty exercises are dropped, then the session is
   * compared with everything before it for records.
   */
  r.post('/:id/finish', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const body = finishWorkoutSchema.safeParse(await c.req.json().catch(() => ({})));
    const finishedAt = body.success && body.data.finishedAt ? pastOrNow(body.data.finishedAt) : null;
    const result = await asUser(c.get('profileId'), async (tx) => {
      const [w] = await tx.select().from(workouts).where(eq(workouts.id, id)).limit(1);
      if (!w) return null;
      const ids = tx.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.workoutId, id));
      await tx.delete(workoutSets).where(and(sql`${workoutSets.workoutExerciseId} in ${ids}`, eq(workoutSets.done, false)));
      await tx.execute(sql`delete from workout_exercises we where we.workout_id = ${id} and not exists (select 1 from workout_sets s where s.workout_exercise_id = we.id)`);
      const [{ n }] = (await tx.select({ n: count() }).from(workoutExercises).where(eq(workoutExercises.workoutId, id))) as [{ n: number }];
      if (!n) {
        await tx.delete(workouts).where(eq(workouts.id, id));
        return { discarded: true as const };
      }
      const [finished] = await tx
        .update(workouts)
        .set({ finishedAt: w.finishedAt ?? finishedAt ?? sql`now()` } as Partial<typeof workouts.$inferInsert>)
        .where(eq(workouts.id, id))
        .returning({ finishedAt: workouts.finishedAt });
      const workout = (await loadWorkout(tx, id))!;
      const history = await historyBefore(tx, workout.exercises.map((e) => e.exercise.id), workout);
      const records: PersonalRecord[] = [];
      const seen = new Set<string>();
      for (const e of workout.exercises) {
        if (seen.has(e.exercise.id)) continue; // the same lift twice in one session counts once
        seen.add(e.exercise.id);
        const all = workout.exercises.filter((x) => x.exercise.id === e.exercise.id).flatMap((x) => x.sets);
        records.push(...findRecords(e.exercise, all, history.get(e.exercise.id) ?? [], workout.date));
      }
      const sets = workout.exercises.flatMap((e) => e.sets).filter((s) => !s.warmup);
      return {
        workout,
        summary: {
          durationSeconds: Math.max(0, Math.round((Date.parse(finished!.finishedAt!) - Date.parse(workout.startedAt)) / 1000)),
          sets: sets.length,
          volumeKg: Math.round(sets.reduce((v, s) => v + setVolumeKg(s), 0)),
          records,
        },
      };
    });
    if (!result) return c.json({ error: 'That workout was not found.' }, 404);
    return c.json(result);
  });

  r.delete('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const deleted = await asUser(c.get('profileId'), (tx) => tx.delete(workouts).where(eq(workouts.id, id)).returning({ id: workouts.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That workout was not found.' }, 404);
  });

  return r;
}
