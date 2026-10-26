import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { exercises, workoutExercises, workoutSets, workouts, type connect } from '@forkbell/db';
import { estimatedOneRepMax, exerciseInputSchema, preferencesSchema, progressIdeas, setVolumeKg, todayLocal, trainingTips, variationsOf, type PersonalRecord, type SetEntry } from '@forkbell/shared';
import { users } from '@forkbell/db';
import type { AppEnv } from '../auth.ts';
import { recentSessions, toExercise, toHowTo, toSet } from '../training.ts';

// Spelled out in full: inside the subquery a bare "id" would mean the workout row's id.
const usesSql = sql<number>`(select count(*) from workout_exercises we where we.exercise_id = "exercises"."id")::int`;
const likeEscape = (s: string) => s.replace(/[%_\\]/g, '\\$&');

export function exerciseRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** The library: your own exercises and the built-in ones, ones you use most first. */
  r.get('/', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const userId = c.get('profileId');
    const rows = await asUser(userId, (tx) =>
      tx
        .select({ ex: exercises, uses: usesSql })
        .from(exercises)
        .where(
          and(
            or(eq(exercises.ownerId, userId), isNull(exercises.ownerId)),
            q ? or(ilike(exercises.name, `%${likeEscape(q)}%`), ilike(exercises.muscle, `${likeEscape(q)}%`), ilike(exercises.equipment, `${likeEscape(q)}%`)) : undefined,
          ),
        )
        .orderBy(desc(usesSql), asc(exercises.name))
        .limit(q ? 50 : 2000), // the whole library, kept lean: steps come with each exercise's own page
    );
    return c.json({ exercises: rows.map((r) => ({ ...toExercise(r.ex), uses: r.uses })) });
  });

  r.post('/', async (c) => {
    const parsed = exerciseInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the exercise.' }, 400);
    const userId = c.get('profileId');
    const [row] = await asUser(userId, (tx) =>
      tx.insert(exercises).values({ ownerId: userId, source: 'custom', ...parsed.data }).returning(),
    );
    return c.json({ exercise: toExercise(row!) }, 201);
  });

  /** One exercise: your records and recent sessions. */
  r.get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'That exercise was not found.' }, 404);
    const data = await asUser(c.get('profileId'), async (tx) => {
      const [ex] = await tx.select().from(exercises).where(eq(exercises.id, id)).limit(1);
      if (!ex) return null;
      const rows = await tx
        .select({ workoutId: workouts.id, date: workouts.date, name: workouts.name, set: workoutSets })
        .from(workoutSets)
        .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
        .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
        .where(and(eq(workoutExercises.exerciseId, id), isNotNull(workouts.finishedAt), eq(workoutSets.done, true)))
        .orderBy(desc(workouts.date), desc(workouts.startedAt), asc(workoutExercises.position), asc(workoutSets.position));
      // Safety tips for adding this exercise to today's workout.
      const recent = await recentSessions(tx, [id], { id: '00000000-0000-0000-0000-000000000000', startedAt: new Date().toISOString() });
      const [me] = await tx.select({ prefs: users.preferences }).from(users).limit(1);
      const prefs = preferencesSchema.parse(me?.prefs ?? {});
      const tips = trainingTips(recent.get(id) ?? [], todayLocal()).filter((t) => t.kind === 'pain' || (prefs.trainingTips && !prefs.training.hiddenTips.includes(id)));
      // Everything you could pick, for variations of the same movement.
      const library = await tx
        .select({ ex: exercises, uses: usesSql })
        .from(exercises)
        .where(and(or(eq(exercises.ownerId, c.get('profileId')), isNull(exercises.ownerId)), eq(exercises.muscle, ex.muscle)));
      return { ex, rows, tips, library };
    });
    if (!data) return c.json({ error: 'That exercise was not found.' }, 404);
    const exercise = toExercise(data.ex);

    const sessions: { workoutId: string; date: string; name: string; sets: SetEntry[] }[] = [];
    for (const row of data.rows) {
      let s = sessions.at(-1);
      if (!s || s.workoutId !== row.workoutId) sessions.push((s = { workoutId: row.workoutId, date: row.date, name: row.name, sets: [] }));
      s.sets.push(toSet(row.set));
    }

    // Best of each kind across all sessions, with the date it happened.
    const records: PersonalRecord[] = [];
    const consider = (kind: PersonalRecord['kind'], f: (s: SetEntry) => number | null) => {
      let best: PersonalRecord | null = null;
      for (const sess of [...sessions].reverse()) // oldest first, so a tie keeps the first time
        for (const s of sess.sets) {
          if (s.warmup || s.drop) continue; // drop sets are lighter on purpose
          const v = f(s);
          if (v && (!best || v > best.value + 0.01))
            best = { exerciseId: id, exerciseName: exercise.name, kind, value: v, weightKg: s.weightKg, reps: s.reps, seconds: s.seconds, date: sess.date };
        }
      if (best) records.push(best);
    };
    if (exercise.kind === 'time' || exercise.kind === 'cardio') consider('time', (s) => s.seconds);
    else if (exercise.kind === 'bodyweight') {
      consider('reps', (s) => (s.weightKg ? null : s.reps));
      consider('weight', (s) => s.weightKg);
    } else {
      consider('weight', (s) => s.weightKg);
      consider('e1rm', (s) => (s.weightKg && s.reps ? estimatedOneRepMax(s.weightKg, s.reps) : null));
      consider('volume', (s) => setVolumeKg(s) || null);
    }

    // Best estimated max per session, oldest first, for a trend.
    const trend = [...sessions]
      .reverse()
      .map((s) => ({ date: s.date, e1rmKg: Math.max(0, ...s.sets.filter((x) => !x.warmup && x.weightKg && x.reps).map((x) => estimatedOneRepMax(x.weightKg!, x.reps!) ?? 0)) }))
      .filter((p) => p.e1rmKg > 0);

    const variations = variationsOf(exercise, data.library.map((r) => ({ ...toExercise(r.ex), uses: r.uses })));
    return c.json({ exercise, howTo: toHowTo(data.ex), records, sessions: sessions.slice(0, 30), trend, tips: data.tips, variations, progressIdeas: progressIdeas(exercise) });
  });

  return r;
}
