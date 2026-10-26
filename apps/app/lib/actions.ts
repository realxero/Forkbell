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
  type SavedMeal,
  type WaterDay,
  waterTotal,
  type Fast,
  type Fasts,
  fastProgress,
  fastStreak,
  todayLocal,
} from '@forkbell/shared';
import { cachedGet, cachedPaths, newId, readCache, send, updateCache, writeCache } from './sync';
import { haptic } from './haptics';

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
  nudgeReminders();
  haptic.success();
  return r;
}

/** A meal just got logged (or removed): replan this phone's reminders. */
const nudgeReminders = () => void import('./reminders').then((m) => m.refreshReminders()).catch(() => {});

export async function updateEntry(entry: DiaryEntry, patch: { grams: number; meal: Meal }) {
  updateCache<DiaryDay>(`/api/diary/${entry.date}`, (day) => day && withEntries(day, day.entries.map((e) => (e.id === entry.id ? { ...e, ...patch } : e))));
  return send('PATCH', `/api/diary/${entry.id}`, patch, { label: `Change ${entry.food.name}`, coalesceKey: `entry:${entry.id}` });
}

export async function deleteEntry(entry: DiaryEntry) {
  updateCache<DiaryDay>(`/api/diary/${entry.date}`, (day) => day && withEntries(day, day.entries.filter((e) => e.id !== entry.id)));
  nudgeReminders();
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
        superset: x.superset ?? null,
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
      exercises: w.exercises.map((e) => ({ exerciseId: e.exercise.id, restSeconds: e.restSeconds, targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax, sets: e.sets, pain: e.pain ?? false, painNote: e.painNote ?? null, superset: e.superset ?? null })),
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

/**
 * Mark a day finished (everything eaten is logged) or reopen it. Works offline:
 * the day changes here at once and the server catches up. Repeating it is harmless.
 */
export async function setDayFinished(date: string, finished: boolean) {
  updateCache<DiaryDay>(`/api/diary/${date}`, (day) => day && { ...day, complete: finished });
  const r = await send(finished ? 'PUT' : 'DELETE', `/api/diary/${date}/complete`, finished ? {} : undefined, {
    label: finished ? 'Finish the day' : 'Reopen the day',
    coalesceKey: `day-finished:${date}`,
  });
  nudgeReminders();
  return r;
}

// Saved meals, previous meals, several at once ------------------------------------

/** Log several foods into one meal (a saved meal, or a meal from an earlier day). Works offline. */
export async function logItems(date: string, meal: Meal, items: { food: Food; grams: number }[]) {
  for (const it of items) await addEntry({ date, meal, grams: it.grams, food: it.food });
}

/** Save foods as a named meal to log again later. Needs a connection. */
export async function saveMeal(name: string, items: { food: Food; grams: number }[]) {
  const usable = items.filter((i) => !i.food.id.startsWith('pending-'));
  const r = await send<{ id: string }>('POST', '/api/meals', { name, items: usable.map((i) => ({ foodId: i.food.id, grams: i.grams })) }, { label: `Save ${name}` });
  updateCache<{ meals: SavedMeal[] }>('/api/meals', (m) => m && { meals: [...m.meals, { id: !r.queued ? r.data.id : `pending-${newId()}`, name, items: usable }].sort((a, b) => a.name.localeCompare(b.name)) });
  return r;
}

export async function deleteSavedMeal(m: SavedMeal) {
  updateCache<{ meals: SavedMeal[] }>('/api/meals', (x) => x && { meals: x.meals.filter((y) => y.id !== m.id) });
  return send('DELETE', `/api/meals/${m.id}`, undefined, { label: `Remove ${m.name}` });
}

/**
 * Correct the numbers of one logged food: a copy of the food with the
 * numbers you entered for this amount, and the entry points at it. The
 * original food (and other days that used it) stay as they were.
 */
export async function changeEntryNutrition(entry: DiaryEntry, totals: { kcal: number; protein: number; carbs: number; fat: number }) {
  const k = 100 / entry.grams;
  const old = entry.food.per100;
  const per100 = {
    kcal: Math.round(totals.kcal * k),
    protein: Math.round(totals.protein * k * 10) / 10,
    carbs: Math.round(totals.carbs * k * 10) / 10,
    fat: Math.round(totals.fat * k * 10) / 10,
    fiber: old.fiber ?? null,
    sugar: old.sugar ?? null,
    sodium: old.sodium ?? null,
  };
  const food = await createFood({ name: entry.food.name, brand: entry.food.brand, source: 'custom', per100, servingGrams: entry.food.servingGrams, barcode: null } as Parameters<typeof createFood>[0]);
  updateCache<DiaryDay>(`/api/diary/${entry.date}`, (day) => day && withEntries(day, day.entries.map((e) => (e.id === entry.id ? { ...e, food } : e))));
  return send('PATCH', `/api/diary/${entry.id}`, { foodId: food.id }, { label: `Correct ${entry.food.name}`, coalesceKey: `entry-food:${entry.id}` });
}

// Water ---------------------------------------------------------------------

const waterPath = (date: string) => `/api/wellbeing/water/${date}`;
const waterDay = (date: string): WaterDay => readCache<WaterDay>(waterPath(date)) ?? { date, entries: [], totalMl: 0 };

/** Log a drink. Shows straight away; sent now, or when back online. Returns the new total. */
export async function addWater(date: string, ml: number) {
  const id = newId();
  updateCache<WaterDay>(waterPath(date), (d) => {
    const entries = [...(d ?? waterDay(date)).entries, { id, ml, at: new Date().toISOString() }];
    return { date, entries, totalMl: waterTotal(entries) };
  });
  await send('POST', '/api/wellbeing/water', { id, date, ml }, { label: 'Log water' });
  return waterDay(date).totalMl;
}

/** Take back the last drink of the day. */
export async function undoWater(date: string) {
  const last = waterDay(date).entries.at(-1);
  if (!last) return null;
  updateCache<WaterDay>(waterPath(date), (d) => {
    const entries = (d ?? waterDay(date)).entries.filter((e) => e.id !== last.id);
    return { date, entries, totalMl: waterTotal(entries) };
  });
  await send('DELETE', `/api/wellbeing/water/${last.id}`, undefined, { label: 'Undo water' });
  return last;
}

// Fasting -------------------------------------------------------------------

const FASTS = '/api/wellbeing/fasts';
const fastsNow = (): Fasts => readCache<Fasts>(FASTS) ?? { open: null, recent: [], streak: 0 };

/** Start a fast now, or from when you last ate. Shows straight away; sent now or when back online. */
export async function startFast(targetHours: number, startedAt = new Date().toISOString()) {
  const fast: Fast = { id: newId(), startedAt, endedAt: null, targetHours };
  updateCache<Fasts>(FASTS, (f) => ({ ...(f ?? fastsNow()), open: fast }));
  await send('POST', FASTS, { id: fast.id, startedAt, targetHours }, { label: 'Start fast' });
  return fast;
}

/** End the fast that's going. */
export async function endFast(fast: Fast) {
  const endedAt = new Date().toISOString();
  const ended = { ...fast, endedAt };
  updateCache<Fasts>(FASTS, (f) => {
    const cur = f ?? fastsNow();
    // Reached its goal today: the streak goes up now, not on the next refresh.
    const streak = fastProgress(ended).done ? fastStreak([ended, ...cur.recent], todayLocal()) : cur.streak;
    return { open: null, recent: [ended, ...cur.recent].slice(0, 10), streak: Math.max(cur.streak, streak) };
  });
  await send('POST', `${FASTS}/${fast.id}/end`, { endedAt }, { label: 'End fast' });
  return ended;
}

/** Take a fast out completely, as if it never started. */
export async function removeFast(fast: Fast) {
  updateCache<Fasts>(FASTS, (f) => ({ ...(f ?? fastsNow()), open: null }));
  await send('DELETE', `${FASTS}/${fast.id}`, undefined, { label: 'Remove fast' });
}
