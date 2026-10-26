// Your data, all of it, to keep or take elsewhere: one JSON file with every
// table that's yours, plus spreadsheet-friendly CSVs of the food diary and
// every set you've logged. Read as you, so row-level security applies, and
// always about you (never someone who shared with you). Secrets (your AI key,
// sign-in data, Shortcut keys) are never included.
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import * as t from '@forkbell/db';
import type { AppEnv } from '../auth.ts';

const TABLES = {
  foods: t.foods,
  diaryEntries: t.diaryEntries,
  dayStatus: t.dayStatus,
  exercises: t.exercises,
  programs: t.programs,
  routines: t.routines,
  routineExercises: t.routineExercises,
  workouts: t.workouts,
  workoutExercises: t.workoutExercises,
  workoutSets: t.workoutSets,
  weighIns: t.weighIns,
  healthDaily: t.healthDaily,
  measurements: t.measurements,
  checkIns: t.checkIns,
  medications: t.medications,
  medicationLogs: t.medicationLogs,
  savedMeals: t.savedMeals,
  savedMealItems: t.savedMealItems,
  recipes: t.recipes,
  recipeItems: t.recipeItems,
  waterEntries: t.waterEntries,
  fasts: t.fasts,
  // the list of photos (date and pose); the pictures themselves are in the nightly backup
  progressPhotos: t.progressPhotos,
} as const;

/** One CSV cell: quoted when it needs to be. */
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
const round = (n: number | null, d = 1) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);
const stamp = () => new Date().toISOString().slice(0, 10);

export function exportRoutes({ asUser }: ReturnType<typeof t.connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const me = c.get('userId');
    const data: Record<string, unknown[]> = {};
    const skipped: string[] = [];
    await asUser(me, async (tx) => {
      for (const [name, table] of Object.entries(TABLES)) {
        try {
          const rows = (await tx.select().from(table)) as Record<string, unknown>[];
          // Built-in foods and exercises are everyone's; only yours are exported.
          data[name] = rows.filter((row) => ('ownerId' in row ? row.ownerId === me : 'userId' in row ? row.userId === me : true));
        } catch {
          skipped.push(name);
        }
      }
      try {
        const [u] = await tx.select({ name: t.users.name, weightUnit: t.users.weightUnit, preferences: t.users.preferences }).from(t.users).where(eq(t.users.id, me)).limit(1);
        data.profile = u ? [u] : [];
      } catch {
        skipped.push('profile');
      }
    });
    c.header('content-disposition', `attachment; filename="forkbell-${stamp()}.json"`);
    return c.json({ app: 'Forkbell', exportedAt: new Date().toISOString(), format: 1, weightsIn: 'kg', foodsPer: '100 g', skipped, data });
  });

  r.get('/diary.csv', async (c) => {
    const me = c.get('userId');
    const rows = await asUser(me, (tx) =>
      tx
        .select({ date: t.diaryEntries.date, meal: t.diaryEntries.meal, grams: t.diaryEntries.grams, name: t.foods.name, brand: t.foods.brand, kcal: t.foods.kcal, protein: t.foods.protein, carbs: t.foods.carbs, fat: t.foods.fat, fiber: t.foods.fiber })
        .from(t.diaryEntries)
        .innerJoin(t.foods, eq(t.foods.id, t.diaryEntries.foodId))
        .where(eq(t.diaryEntries.userId, me))
        .orderBy(asc(t.diaryEntries.date), asc(t.diaryEntries.createdAt)),
    );
    const per = (v: number | null, g: number) => (v === null ? null : round((v * g) / 100));
    const body = csv(
      ['date', 'meal', 'food', 'brand', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
      rows.map((x) => [x.date, x.meal, x.name, x.brand, round(x.grams), per(x.kcal, x.grams), per(x.protein, x.grams), per(x.carbs, x.grams), per(x.fat, x.grams), per(x.fiber, x.grams)]),
    );
    return c.body(body, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="forkbell-diary-${stamp()}.csv"` });
  });

  r.get('/workouts.csv', async (c) => {
    const me = c.get('userId');
    const rows = await asUser(me, (tx) =>
      tx
        .select({
          date: t.workouts.date, workout: t.workouts.name, exercise: t.exercises.name, muscle: t.exercises.muscle, exPos: t.workoutExercises.position,
          set: t.workoutSets.position, warmup: t.workoutSets.warmup, drop: t.workoutSets.drop, distanceM: t.workoutSets.distanceM, weightKg: t.workoutSets.weightKg, reps: t.workoutSets.reps, seconds: t.workoutSets.seconds, rpe: t.workoutSets.rpe,
        })
        .from(t.workoutSets)
        .innerJoin(t.workoutExercises, eq(t.workoutExercises.id, t.workoutSets.workoutExerciseId))
        .innerJoin(t.workouts, eq(t.workouts.id, t.workoutExercises.workoutId))
        .innerJoin(t.exercises, eq(t.exercises.id, t.workoutExercises.exerciseId))
        .where(and(eq(t.workoutSets.userId, me), eq(t.workoutSets.done, true)))
        .orderBy(asc(t.workouts.startedAt), asc(t.workoutExercises.position), asc(t.workoutSets.position)),
    );
    const body = csv(
      ['date', 'workout', 'exercise', 'muscle', 'set', 'warmup', 'weight_kg', 'weight_lb', 'reps', 'seconds', 'rpe', 'drop_set', 'distance_km'],
      rows.map((x) => [x.date, x.workout, x.exercise, x.muscle, x.set + 1, x.warmup ? 'yes' : '', round(x.weightKg, 2), x.weightKg === null ? null : round(x.weightKg * 2.20462), x.reps, x.seconds, x.rpe, x.drop ? 'yes' : '', x.distanceM === null ? null : round(x.distanceM / 1000, 3)]),
    );
    return c.body(body, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="forkbell-workouts-${stamp()}.csv"` });
  });

  return r;
}
