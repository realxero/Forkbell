// Reading and writing workouts, shared by the training routes. Every function
// takes a transaction from asUser(), so row-level security applies throughout.
import { and, asc, desc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { exercises, routineExercises, routines, workoutExercises, workoutSets, workouts, type Tx } from '@forkbell/db';
import type { Exercise, Routine, SaveWorkoutInput, SetEntry, Workout, WorkoutExercise } from '@forkbell/shared';

type ExerciseRow = typeof exercises.$inferSelect;
type SetRow = typeof workoutSets.$inferSelect;

export function toExercise(r: ExerciseRow): Exercise {
  return { id: r.id, name: r.name, muscle: r.muscle, equipment: r.equipment, kind: r.kind, increment: r.increment, restSeconds: r.restSeconds, custom: r.source === 'custom' };
}

export const toSet = (r: Pick<SetRow, 'weightKg' | 'reps' | 'seconds' | 'rpe' | 'warmup' | 'done'>): SetEntry => ({
  weightKg: r.weightKg,
  reps: r.reps,
  seconds: r.seconds,
  rpe: r.rpe,
  warmup: r.warmup,
  done: r.done,
});

/** Sets grouped by workout_exercise id, in order. */
async function setsFor(tx: Tx, workoutExerciseIds: string[]) {
  const by = new Map<string, SetEntry[]>();
  if (!workoutExerciseIds.length) return by;
  const rows = await tx.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, workoutExerciseIds)).orderBy(asc(workoutSets.position));
  for (const r of rows) {
    const list = by.get(r.workoutExerciseId) ?? [];
    list.push(toSet(r));
    by.set(r.workoutExerciseId, list);
  }
  return by;
}

/**
 * The sets from the most recent finished session of each exercise, before a
 * given workout (or before now). Powers the "previous" column and progression.
 */
export async function lastSessions(tx: Tx, exerciseIds: string[], before?: { id: string; startedAt: string }) {
  const out = new Map<string, SetEntry[]>();
  if (!exerciseIds.length) return out;
  const latest = await tx
    .selectDistinctOn([workoutExercises.exerciseId], { exerciseId: workoutExercises.exerciseId, id: workoutExercises.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        isNotNull(workouts.finishedAt),
        ...(before ? [ne(workouts.id, before.id), lt(workouts.startedAt, before.startedAt)] : []),
      ),
    )
    .orderBy(workoutExercises.exerciseId, desc(workouts.date), desc(workouts.startedAt));
  const sets = await setsFor(tx, latest.map((l) => l.id));
  for (const l of latest) out.set(l.exerciseId, sets.get(l.id) ?? []);
  return out;
}

/** All done sets of these exercises from finished workouts started before this one. */
export async function historyBefore(tx: Tx, exerciseIds: string[], workout: { id: string; startedAt: string }) {
  const out = new Map<string, SetEntry[]>();
  if (!exerciseIds.length) return out;
  const rows = await tx
    .select({ exerciseId: workoutExercises.exerciseId, set: workoutSets })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        isNotNull(workouts.finishedAt),
        ne(workouts.id, workout.id),
        lt(workouts.startedAt, workout.startedAt),
        eq(workoutSets.done, true),
      ),
    );
  for (const r of rows) {
    const list = out.get(r.exerciseId) ?? [];
    list.push(toSet(r.set));
    out.set(r.exerciseId, list);
  }
  return out;
}

export async function loadWorkout(tx: Tx, id: string): Promise<Workout | null> {
  const [w] = await tx.select().from(workouts).where(eq(workouts.id, id)).limit(1);
  if (!w) return null;
  const items = await tx
    .select({ we: workoutExercises, ex: exercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, id))
    .orderBy(asc(workoutExercises.position));
  const sets = await setsFor(tx, items.map((i) => i.we.id));
  const previous = await lastSessions(tx, [...new Set(items.map((i) => i.ex.id))], { id: w.id, startedAt: w.startedAt });
  const list: WorkoutExercise[] = items.map(({ we, ex }) => ({
    exercise: toExercise(ex),
    restSeconds: we.restSeconds,
    targetSets: we.targetSets,
    repMin: we.repMin,
    repMax: we.repMax,
    sets: sets.get(we.id) ?? [],
    previous: previous.get(ex.id) ?? [],
  }));
  return { id: w.id, date: w.date, name: w.name, routineId: w.routineId, startedAt: w.startedAt, finishedAt: w.finishedAt, notes: w.notes, exercises: list };
}

/** Replace a workout's exercises and sets with what the app sent. */
export async function saveWorkout(tx: Tx, id: string, input: SaveWorkoutInput) {
  const updated = await tx.update(workouts).set({ name: input.name, date: input.date, notes: input.notes }).where(eq(workouts.id, id)).returning({ id: workouts.id });
  if (!updated.length) return false;
  await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, id)); // sets go with them
  for (const [position, e] of input.exercises.entries()) {
    const [we] = await tx
      .insert(workoutExercises)
      .values({ workoutId: id, exerciseId: e.exerciseId, position, restSeconds: e.restSeconds, targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax } as typeof workoutExercises.$inferInsert)
      .returning({ id: workoutExercises.id });
    if (e.sets.length) {
      await tx.insert(workoutSets).values(e.sets.map((s, i) => ({ workoutExerciseId: we!.id, position: i, ...s }) as typeof workoutSets.$inferInsert));
    }
  }
  return true;
}

export async function loadRoutines(tx: Tx, programIds: string[]): Promise<Map<string, Routine[]>> {
  const out = new Map<string, Routine[]>();
  if (!programIds.length) return out;
  const rs = await tx.select().from(routines).where(inArray(routines.programId, programIds)).orderBy(asc(routines.position));
  const items = rs.length
    ? await tx
        .select({ re: routineExercises, ex: exercises })
        .from(routineExercises)
        .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
        .where(inArray(routineExercises.routineId, rs.map((r) => r.id)))
        .orderBy(asc(routineExercises.position))
    : [];
  for (const r of rs) {
    const list = out.get(r.programId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      position: r.position,
      exercises: items
        .filter((i) => i.re.routineId === r.id)
        .map(({ re, ex }) => ({ exercise: toExercise(ex), sets: re.sets, repMin: re.repMin, repMax: re.repMax, restSeconds: re.restSeconds })),
    });
    out.set(r.programId, list);
  }
  return out;
}

/** The routine after the one you last finished, so a missed day shifts the plan instead of skipping a session. */
export async function nextRoutineId(tx: Tx, list: Routine[]): Promise<string | null> {
  if (!list.length) return null;
  const [last] = await tx
    .select({ routineId: workouts.routineId })
    .from(workouts)
    .where(and(inArray(workouts.routineId, list.map((r) => r.id)), isNotNull(workouts.finishedAt)))
    .orderBy(desc(workouts.finishedAt))
    .limit(1);
  const i = last ? list.findIndex((r) => r.id === last.routineId) : -1;
  return list[(i + 1) % list.length]!.id;
}

export const volumeSql = sql<number>`coalesce(sum(case when ${workoutSets.done} and not ${workoutSets.warmup} then ${workoutSets.weightKg} * ${workoutSets.reps} end), 0)::float8`;

/** True when Postgres refused a row because its exercise isn't yours or built in. */
export function isMissingExercise(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if (String((e as { message?: unknown }).message ?? '').includes('exercise not found')) return true;
  }
  return false;
}
