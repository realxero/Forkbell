// Changes that work offline: each updates the copy on the device first, so the
// screen shows it straight away, then sends it (now or when back online).
import {
  addDays,
  barcodeVariants,
  setVolumeKg,
  sumEntries,
  weightTrend,
  type DiaryDay,
  type DiaryEntry,
  type Food,
  type FoodCandidate,
  type Me,
  type Meal,
  type Program,
  type RecentFoods,
  type Workout,
  type WorkoutSummary,
} from '@forkbell/shared';
import { cachedGet, cachedPaths, newId, readCache, send, updateCache, writeCache } from './sync';

const emptyDay = (date: string): DiaryDay => {
  const me = readCache<Me>('/api/me');
  return {
    date,
    entries: [],
    totals: sumEntries([]),
    goals: me?.goals ?? { kcal: null, protein: null, carbs: null, fat: null },
  };
};
const withEntries = (day: DiaryDay, entries: DiaryEntry[]): DiaryDay => ({ ...day, entries, totals: sumEntries(entries) });

// Food ----------------------------------------------------------------------

/** Log a food. Works offline; a database search hit is saved to your foods by the server when it arrives. */
export async function addEntry(input: { date: string; meal: Meal; grams: number; food: Food | FoodCandidate }) {
  const id = newId();
  const food: Food = 'id' in input.food ? input.food : { ...input.food, id: `pending-${id}` };
  updateCache<DiaryDay>(`/api/diary/${input.date}`, (day) => {
    const d = day ?? emptyDay(input.date);
    return withEntries(d, [...d.entries, { id, date: input.date, meal: input.meal, grams: input.grams, food }]);
  });
  if ('id' in input.food) {
    updateCache<RecentFoods>('/api/foods/recent', (r) => {
      if (!r) return r;
      const entry = { food, lastGrams: input.grams, lastMeal: input.meal, uses: (r.recent.find((x) => x.food.id === food.id)?.uses ?? 0) + 1 };
      return { ...r, recent: [entry, ...r.recent.filter((x) => x.food.id !== food.id)].slice(0, 15) };
    });
  }
  const body = 'id' in input.food ? { id, date: input.date, meal: input.meal, grams: input.grams, foodId: input.food.id } : { id, date: input.date, meal: input.meal, grams: input.grams, food: input.food };
  const r = await send<{ entry: DiaryEntry }>('POST', '/api/diary', body, { label: `Log ${food.name}` });
  if (!r.queued && r.data?.entry) {
    // Swap in the server's copy (a saved database food now has its real id).
    const real = r.data.entry;
    updateCache<DiaryDay>(`/api/diary/${input.date}`, (day) => day && withEntries(day, day.entries.map((e) => (e.id === id ? real : e))));
  }
  return r;
}

export async function updateEntry(entry: DiaryEntry, patch: { grams: number; meal: Meal }) {
  updateCache<DiaryDay>(`/api/diary/${entry.date}`, (day) => day && withEntries(day, day.entries.map((e) => (e.id === entry.id ? { ...e, ...patch } : e))));
  return send('PATCH', `/api/diary/${entry.id}`, patch, { label: `Change ${entry.food.name}`, coalesceKey: `entry:${entry.id}` });
}

export async function deleteEntry(entry: DiaryEntry) {
  updateCache<DiaryDay>(`/api/diary/${entry.date}`, (day) => day && withEntries(day, day.entries.filter((e) => e.id !== entry.id)));
  return send('DELETE', `/api/diary/${entry.id}`, undefined, { label: `Remove ${entry.food.name}` });
}

/** An entry from any day on the device, for opening it offline. */
export function findCachedEntry(id: string): DiaryEntry | null {
  for (const path of cachedPaths('/api/diary/')) {
    const e = readCache<DiaryDay>(path)?.entries?.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

/** Copy a meal (or the whole day) from one day to another, entry by entry, so it works offline too. */
export async function copyDay(from: string, to: string, meal?: Meal) {
  const day = await cachedGet<DiaryDay>(`/api/diary/${from}`);
  const items = day.entries.filter((e) => !meal || e.meal === meal);
  for (const e of items) await addEntry({ date: to, meal: e.meal, grams: e.grams, food: e.food });
  return items.length;
}

/** Your foods and the common foods, kept on the device for searching offline. */
export async function foodLibrary(): Promise<Food[]> {
  try {
    return (await cachedGet<{ foods: Food[] }>('/api/foods/library')).foods;
  } catch {
    return [];
  }
}

export async function searchOffline(q: string): Promise<Food[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await foodLibrary();
  return all.filter((f) => words.every((w) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(w))).slice(0, 30);
}

export async function findByBarcodeOffline(code: string): Promise<Food | null> {
  const codes = barcodeVariants(code);
  return (await foodLibrary()).find((f) => f.barcode && codes.includes(f.barcode)) ?? null;
}

/** Create your own food; offline it gets its id on the device and is sent later. */
export async function createFood(input: Omit<FoodCandidate, 'barcode' | 'portions' | 'sourceId' | 'servingLabel'> & { barcode: string | null }): Promise<Food> {
  const id = newId();
  const body = { ...input, id };
  const r = await send<{ food: Food }>('POST', '/api/foods', body, { label: `Create ${input.name}` });
  const food: Food = !r.queued && r.data?.food ? r.data.food : { ...input, id, sourceId: null, servingLabel: null, portions: [] };
  updateCache<{ foods: Food[] }>('/api/foods/library', (lib) => lib && { foods: [food, ...lib.foods] });
  return food;
}

// Training ----------------------------------------------------------------------

/**
 * Start a workout. Online, the server fills in this session's suggested
 * weights. Offline, it starts from the routine on the device with empty sets.
 */
export async function startWorkout(date: string, routineId?: string): Promise<Workout> {
  const id = newId();
  const startedAt = new Date().toISOString();
  const r = await send<{ workout: Workout }>('POST', '/api/workouts', { id, date, startedAt, ...(routineId ? { routineId } : {}) }, { label: 'Start workout' });
  let workout: Workout;
  if (!r.queued && r.data?.workout) workout = r.data.workout;
  else {
    const routine = readCache<{ programs: Program[] }>('/api/programs')?.programs.flatMap((p) => p.routines).find((x) => x.id === routineId);
    workout = {
      id,
      date,
      name: routine?.name ?? 'Workout',
      routineId: routineId ?? null,
      startedAt,
      finishedAt: null,
      notes: null,
      exercises: (routine?.exercises ?? []).map((x) => ({
        exercise: x.exercise,
        restSeconds: x.restSeconds,
        targetSets: x.sets,
        repMin: x.repMin,
        repMax: x.repMax,
        sets: Array.from({ length: x.sets }, () => ({ weightKg: null, reps: null, seconds: null, rpe: null, warmup: false, done: false })),
        previous: [],
      })),
    };
    await saveWorkout(workout);
  }
  writeCache(`/api/workouts/${workout.id}`, { workout });
  writeCache('/api/workouts/open', { workout });
  return workout;
}

export async function saveWorkout(w: Workout) {
  writeCache(`/api/workouts/${w.id}`, { workout: w });
  if (!w.finishedAt) writeCache('/api/workouts/open', { workout: w });
  return send(
    'PUT',
    `/api/workouts/${w.id}`,
    {
      name: w.name,
      date: w.date,
      notes: w.notes,
      exercises: w.exercises.map((e) => ({ exerciseId: e.exercise.id, restSeconds: e.restSeconds, targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax, sets: e.sets, pain: e.pain ?? false, painNote: e.painNote ?? null })),
    },
    { label: `Save ${w.name}`, coalesceKey: `workout:${w.id}` },
  );
}

export type FinishSummary = { durationSeconds: number; sets: number; volumeKg: number; records: import('@forkbell/shared').PersonalRecord[]; offline?: boolean };

/** Finish a workout. Offline, records are worked out when it reaches the server. */
export async function finishWorkout(w: Workout): Promise<{ discarded: boolean; summary: FinishSummary | null }> {
  const finishedAt = new Date().toISOString();
  const r = await send<{ summary?: FinishSummary; discarded?: boolean }>('POST', `/api/workouts/${w.id}/finish`, { finishedAt }, { label: `Finish ${w.name}` });
  updateCache('/api/workouts/open', () => ({ workout: null }));
  const kept = w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
  if (!r.queued) {
    if (r.data?.discarded) return { discarded: true, summary: null };
    updateCache(`/api/workouts/${w.id}`, () => undefined); // reload fresh next time
    return { discarded: false, summary: r.data!.summary! };
  }
  if (!kept.length) return { discarded: true, summary: null };
  const finished: Workout = { ...w, finishedAt, exercises: kept };
  writeCache(`/api/workouts/${w.id}`, { workout: finished });
  const sets = kept.flatMap((e) => e.sets).filter((s) => !s.warmup);
  const summary: FinishSummary = {
    durationSeconds: Math.round((Date.parse(finishedAt) - Date.parse(w.startedAt)) / 1000),
    sets: sets.length,
    volumeKg: Math.round(sets.reduce((v, s) => v + setVolumeKg(s), 0)),
    records: [],
    offline: true,
  };
  updateCache<{ workouts: WorkoutSummary[] }>('/api/workouts', (h) => ({
    workouts: [{ id: w.id, date: w.date, name: w.name, startedAt: w.startedAt, finishedAt, exercises: kept.length, sets: summary.sets, volumeKg: summary.volumeKg }, ...(h?.workouts ?? []).filter((x) => x.id !== w.id)],
  }));
  return { discarded: false, summary };
}

export async function discardWorkout(w: Workout) {
  updateCache('/api/workouts/open', (o: { workout: Workout | null } | undefined) => (o?.workout?.id === w.id ? { workout: null } : o));
  updateCache(`/api/workouts/${w.id}`, () => undefined);
  updateCache<{ workouts: WorkoutSummary[] }>('/api/workouts', (h) => h && { workouts: h.workouts.filter((x) => x.id !== w.id) });
  return send('DELETE', `/api/workouts/${w.id}`, undefined, { label: `Delete ${w.name}` });
}

// Progress ------------------------------------------------------------------------

type ProgressCache = { today: string; weighIns: ({ date: string; weightKg: number; trendKg: number; bodyFat: number | null })[] };

export async function saveWeighIn(date: string, weightKg: number) {
  updateCache<ProgressCache>('/api/progress', (p) => {
    if (!p) return p;
    const raw = [...p.weighIns.filter((w) => w.date !== date).map((w) => ({ date: w.date, weightKg: w.weightKg, bodyFat: w.bodyFat })), { date, weightKg, bodyFat: null }];
    return { ...p, weighIns: weightTrend(raw).map((t) => ({ ...t, bodyFat: null })) };
  });
  return send('PUT', '/api/progress/weigh-ins', { date, weightKg }, { label: 'Weigh-in', coalesceKey: `weigh:${date}` });
}

export const yesterdayOf = (date: string) => addDays(date, -1);
