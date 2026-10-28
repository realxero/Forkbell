// Importing workouts from Strong, Hevy or FitNotes. The phone reads the file
// (so its times are read in the phone's time zone) and sends plain workouts;
// this matches exercise names to yours and the built-in library, adds the
// rest as your own, and skips workouts already here (same start time), so
// importing the same file twice adds nothing. First a preview (dryRun),
// then the import itself, in one transaction: all of it or none.
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { dayStatus, diaryEntries, exercises, foods, workouts, type connect } from '@forkbell/db';
import { guessEquipment, guessKind, guessMuscle, nameCandidates, exerciseKey, workoutImportSchema, type ImportedSet, type WorkoutImportResult, foodImportSchema, type FoodImportResult } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { saveWorkout } from '../training.ts';

const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

export function importRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.post('/workouts', async (c) => {
    const parsed = workoutImportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: `The file couldn’t be read: ${parsed.error.issues[0]?.message ?? 'check it'}.` }, 400);
    const { workouts: list, dryRun } = parsed.data;
    // Always into your own account, never a profile shared with you.
    const result = await asUser(c.get('userId'), async (tx) => {
      // Your exercises win over built-in ones with the same name; everyday built-ins over the big library.
      const rows = await tx.select({ id: exercises.id, name: exercises.name, ownerId: exercises.ownerId, library: exercises.library }).from(exercises);
      const rank = (x: { ownerId: string | null; library: boolean }) => (x.ownerId ? 0 : x.library ? 2 : 1);
      const byKey = new Map<string, { id: string; name: string; rank: number }>();
      for (const x of rows) {
        const k = exerciseKey(x.name);
        const had = byKey.get(k);
        if (!had || rank(x) < had.rank) byKey.set(k, { id: x.id, name: x.name, rank: rank(x) });
      }
      const have = new Set(
        ((await tx.execute(sql`select floor(extract(epoch from started_at) / 60)::bigint as m from workouts`)) as unknown as { m: string }[]).map((x) => Number(x.m)),
      );
      const fresh = list.filter((w) => !have.has(minute(w.startedAt)));

      // Each name in the file once: matched, or to be added (with its sets, to guess what kind it is).
      const names = new Map<string, { category: string | null; sets: ImportedSet[] }>();
      for (const w of fresh) for (const e of w.exercises) {
        const n = names.get(e.name) ?? { category: e.category, sets: [] };
        if (n.sets.length < 50) n.sets.push(...e.sets.slice(0, 50 - n.sets.length));
        names.set(e.name, n);
      }
      const matched: WorkoutImportResult['matched'] = [];
      const added: string[] = [];
      const idFor = new Map<string, string>();
      for (const [name] of names) {
        const hit = nameCandidates(name).map((k) => byKey.get(k)).find(Boolean);
        if (hit) {
          idFor.set(name, hit.id);
          matched.push({ from: name, to: hit.name });
        } else added.push(name);
      }
      const summary: WorkoutImportResult = {
        workouts: fresh.length,
        sets: fresh.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
        skipped: list.length - fresh.length,
        from: fresh[0]?.date ?? null,
        to: fresh.at(-1)?.date ?? null,
        matched,
        added,
        dryRun,
      };
      if (dryRun || !fresh.length) return summary;

      for (const name of added) {
        const info = names.get(name)!;
        const kind = guessKind(name, info.category, info.sets);
        const [row] = await tx
          .insert(exercises)
          .values({ ownerId: c.get('userId'), source: 'custom', name, muscle: guessMuscle(name, info.category), equipment: guessEquipment(name, kind), kind, increment: 'small', restSeconds: kind === 'cardio' ? 0 : 90 } as typeof exercises.$inferInsert)
          .returning({ id: exercises.id });
        idFor.set(name, row!.id);
      }
      for (const w of fresh) {
        const [row] = await tx
          .insert(workouts)
          .values({ date: w.date, name: w.name, startedAt: w.startedAt, finishedAt: w.finishedAt } as typeof workouts.$inferInsert)
          .returning({ id: workouts.id });
        await saveWorkout(tx, row!.id, {
          name: w.name,
          date: w.date,
          notes: w.notes,
          exercises: w.exercises.map((e) => ({
            exerciseId: idFor.get(e.name)!,
            restSeconds: 90,
            targetSets: null,
            repMin: null,
            repMax: null,
            superset: e.superset,
            sets: e.sets.map((s) => ({ ...s, warmup: s.warmup, drop: s.drop && !s.warmup, done: true })),
          })),
        });
      }
      return summary;
    });
    return c.json(result);
  });

  /**
   * Food history from another app. Days that already have food in Forkbell
   * are left as they are. Each line becomes its own food (kept out of search
   * and your lists), logged at a weight that keeps its numbers within a
   * food's limits, so every day adds up to exactly what the other app had.
   */
  r.post('/foods', async (c) => {
    const parsed = foodImportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: `The file couldn’t be read: ${parsed.error.issues[0]?.message ?? 'check it'}.` }, 400);
    const { lines, dryRun, markComplete } = parsed.data;
    const userId = c.get('userId');
    const result = await asUser(userId, async (tx) => {
      const dates = [...new Set(lines.map((l) => l.date))].sort();
      const had = new Set(
        (await tx.selectDistinct({ date: diaryEntries.date }).from(diaryEntries).where(sql`${diaryEntries.date} between ${dates[0]}::date and ${dates.at(-1)}::date`)).map((d) => d.date),
      );
      const fresh = lines.filter((l) => !had.has(l.date));
      const freshDays = [...new Set(fresh.map((l) => l.date))].sort();
      const summary: FoodImportResult = { days: freshDays.length, lines: fresh.length, skippedDays: dates.length - freshDays.length, from: freshDays[0] ?? null, to: freshDays.at(-1) ?? null, dryRun };
      if (dryRun || !fresh.length) return summary;
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500);
        // The weight that keeps every number per 100 g within a food's limits (900 kcal, 100 g of anything).
        const grams = chunk.map((l) => Math.max(100, Math.ceil(l.kcal / 9), Math.ceil(l.protein), Math.ceil(l.carbs), Math.ceil(l.fat), Math.ceil(l.fiber ?? 0), Math.ceil(l.sugar ?? 0)));
        const per = (v: number | null, g: number) => (v === null ? null : Math.round(((v * 100) / g) * 10) / 10);
        const made = await tx
          .insert(foods)
          .values(chunk.map((l, j) => ({ ownerId: userId, source: 'import', name: l.name, brand: null, kcal: per(l.kcal, grams[j]!)!, protein: per(l.protein, grams[j]!)!, carbs: per(l.carbs, grams[j]!)!, fat: per(l.fat, grams[j]!)!, fiber: per(l.fiber, grams[j]!), sugar: per(l.sugar, grams[j]!), sodiumMg: per(l.sodium, grams[j]!), servingGrams: grams[j]! }) as typeof foods.$inferInsert))
          .returning({ id: foods.id });
        await tx.insert(diaryEntries).values(chunk.map((l, j) => ({ userId, date: l.date, meal: l.meal, grams: grams[j]!, foodId: made[j]!.id, amount: 1, unit: 'serving' }) as typeof diaryEntries.$inferInsert));
      }
      if (markComplete) await tx.insert(dayStatus).values(freshDays.map((date) => ({ userId, date }) as typeof dayStatus.$inferInsert)).onConflictDoNothing();
      return summary;
    });
    return c.json(result);
  });

  return r;
}
