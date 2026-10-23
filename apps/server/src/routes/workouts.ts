import { Hono } from 'hono';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { exercises, routineExercises, routines, users, workoutExercises, workoutSets, workouts, type connect } from '@forkbell/db';
import {
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
} from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { historyBefore, isMissingExercise, lastSessions, loadWorkout, saveWorkout, volumeSql } from '../training.ts';

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
/** A time sent by the app, never later than now (a phone clock can be off). */
const pastOrNow = (iso: string) => new Date(Math.min(Date.parse(iso), Date.now())).toISOString();

export function workoutRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Recent sessions, newest first. */
  r.get('/', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
    const rows = await asUser(c.get('userId'), (tx) =>
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
    const workout = await asUser(c.get('userId'), async (tx) => {
      const [w] = await tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.finishedAt)).limit(1);
      return w ? loadWorkout(tx, w.id) : null;
    });
    return c.json({ workout });
  });

  /** Start a session, empty or from a routine with this time's suggested weights filled in. */
  r.post('/', async (c) => {
    const parsed = startWorkoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the workout.' }, 400);
    const userId = c.get('userId');
    const result = await asUser(userId, async (tx) => {
      if (parsed.data.id) {
        const [prior] = await tx.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, parsed.data.id)).limit(1);
        if (prior) return { workout: await loadWorkout(tx, prior.id) }; // started earlier, offline
      }
      const [open] = await tx.select({ id: workouts.id }).from(workouts).where(isNull(workouts.finishedAt)).limit(1);
      if (open) return { conflict: open.id };

      let name = 'Workout';
      let plan: SaveWorkoutInput['exercises'] = [];
      if (parsed.data.routineId) {
        const [routine] = await tx.select().from(routines).where(eq(routines.id, parsed.data.routineId)).limit(1);
        if (!routine) return { missing: true };
        name = routine.name;
        const items = await tx
          .select({ re: routineExercises, ex: exercises })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(eq(routineExercises.routineId, routine.id))
          .orderBy(asc(routineExercises.position));
        const [me] = await tx.select({ unit: users.weightUnit }).from(users).where(eq(users.id, userId)).limit(1);
        const last = await lastSessions(tx, items.map((i) => i.ex.id));
        plan = items.map(({ re, ex }) => {
          const target = nextTarget(last.get(ex.id) ?? [], re.repMin, re.repMax, incrementKg(ex.increment, me?.unit ?? 'lb'), ex.kind);
          const sets: SetEntry[] = Array.from({ length: re.sets }, () => ({
            weightKg: target?.weightKg ?? null,
            reps: target && ex.kind !== 'time' ? target.reps : null,
            seconds: null,
            rpe: null,
            warmup: false,
            done: false,
          }));
          return { exerciseId: ex.id, restSeconds: re.restSeconds, targetSets: re.sets, repMin: re.repMin, repMax: re.repMax, sets };
        });
      }
      const [w] = await tx
        .insert(workouts)
        .values({ ...(parsed.data.id ? { id: parsed.data.id } : {}), ...(parsed.data.startedAt ? { startedAt: pastOrNow(parsed.data.startedAt) } : {}), date: parsed.data.date, name, routineId: parsed.data.routineId ?? null } as typeof workouts.$inferInsert)
        .returning({ id: workouts.id });
      await saveWorkout(tx, w!.id, { name, date: parsed.data.date, notes: null, exercises: plan });
      return { workout: await loadWorkout(tx, w!.id) };
    });
    if ('conflict' in result) return c.json({ error: 'You already have a workout going. Finish or discard it first.', id: result.conflict }, 409);
    if ('missing' in result) return c.json({ error: 'That routine was not found.' }, 404);
    return c.json(result, 201);
  });

  r.get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const workout = await asUser(c.get('userId'), (tx) => loadWorkout(tx, id));
    return workout ? c.json({ workout }) : c.json({ error: 'That workout was not found.' }, 404);
  });

  /** Save the whole session. The app sends it after each change, so nothing is lost if the phone dies mid-workout. */
  r.put('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That workout was not found.' }, 404);
    const parsed = saveWorkoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the workout.' }, 400);
    try {
      const ok = await asUser(c.get('userId'), (tx) => saveWorkout(tx, id, parsed.data));
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
    const result = await asUser(c.get('userId'), async (tx) => {
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
    const deleted = await asUser(c.get('userId'), (tx) => tx.delete(workouts).where(eq(workouts.id, id)).returning({ id: workouts.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That workout was not found.' }, 404);
  });

  return r;
}
