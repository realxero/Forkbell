// Keeping Forkbell and Apple Health / Health Connect in step, from the phone.
//   in:  steps, active and resting calories, resting heart rate, weight (14 days)
//   out: each day's calories and macros, and finished workouts
import { addDays, todayLocal, type WorkoutSummary } from '@forkbell/shared';
import { api } from './api';
import { healthAvailable, healthName, healthSource, readHealth, readWeights, requestHealthAccess, writeNutrition, writeWater, writeWorkout } from './health';
import { readCache, writeCache } from './sync';

export interface HealthSettings {
  connected: boolean;
  readActivity: boolean;
  writeNutrition: boolean;
  /** each day's water (iPhone only) */
  writeWater?: boolean;
  /** days whose water was sent, so a day taken back to nothing is set to 0 there too */
  waterSent?: string[];
  writeWorkouts: boolean;
  lastSync: string | null;
  /** workouts finished after this were not sent yet */
  workoutsSentUntil: string | null;
  lastError: string | null;
  /** which set of health types we've asked for; new types are asked for once */
  permVersion?: number;
  /** your weigh-in history (two years) has been brought in once */
  weightHistoryImported?: boolean;
  weightHistoryCount?: number;
}

const KEY = 'device:health';
const defaults: HealthSettings = { connected: false, readActivity: true, writeNutrition: true, writeWorkouts: true, lastSync: null, workoutsSentUntil: null, lastError: null };

export const healthSupported = healthName !== null;
export { healthName };

export function getHealthSettings(): HealthSettings {
  return { ...defaults, ...(readCache<HealthSettings>(KEY) ?? {}) };
}
export function setHealthSettings(patch: Partial<HealthSettings>) {
  writeCache(KEY, { ...getHealthSettings(), ...patch });
}

export async function connectHealth(): Promise<string | null> {
  if (!(await healthAvailable())) return `${healthName ?? 'Health'} isn’t available on this phone.`;
  const ok = await requestHealthAccess();
  if (!ok) return `${healthName} didn’t give access. You can allow it in its settings.`;
  // Don't send years of old workouts on the first connect; start from now.
  setHealthSettings({ connected: true, permVersion: 3, workoutsSentUntil: getHealthSettings().workoutsSentUntil ?? new Date().toISOString() });
  return syncHealth(true);
}

let running: Promise<string | null> | null = null;

/** Run a sync. At most every 15 minutes unless forced. Returns an error message, or null. */
export function syncHealth(force = false): Promise<string | null> {
  running ??= (async () => {
    const s = getHealthSettings();
    if (!s.connected || !healthSource) return null;
    if (!force && s.lastSync && Date.now() - Date.parse(s.lastSync) < 15 * 60 * 1000) return null;
    const today = todayLocal();
    try {
      // Version 2 reads more types (sleep, heart, distance...); version 3 writes water. Ask once for what's new.
      if ((s.permVersion ?? 1) < 3) {
        await requestHealthAccess();
        setHealthSettings({ permVersion: 3 });
      }
      if (s.readActivity && !s.weightHistoryImported) {
        // Once: your weigh-in history (two years), so the trend and chart start with it
        // instead of "weigh in a few more times". In batches the server accepts.
        const history = await readWeights(addDays(today, -730), today);
        for (let i = 0; i < history.length; i += 300)
          await api('/api/health/import', { method: 'POST', body: JSON.stringify({ source: healthSource, days: [], weights: history.slice(i, i + 300) }) });
        setHealthSettings({ weightHistoryImported: true, weightHistoryCount: history.length });
      }
      if (s.readActivity) {
        const data = await readHealth(addDays(today, -13), today);
        if (data.days.length || data.weights.length) await api('/api/health/import', { method: 'POST', body: JSON.stringify({ source: healthSource, ...data }) });
      }
      if (s.writeNutrition) {
        const { days } = await api<{ days: { date: string; totals: { kcal: number; protein: number; carbs: number; fat: number } }[] }>(
          `/api/diary/totals?from=${addDays(today, -6)}&to=${today}`,
        );
        await writeNutrition(days.map((d) => ({ date: d.date, ...d.totals })));
      }
      if (s.writeWater !== false && healthSource === 'apple_health') {
        // Days with water are sent; a day sent before and now taken back to nothing is sent as 0.
        // Days never sent stay untouched (sending 0 there would look like you drank nothing).
        const from = addDays(today, -6);
        const { days } = await api<{ days: { date: string; ml: number }[] }>(`/api/wellbeing/water?from=${from}&to=${today}`);
        const had = new Set(days.map((d) => d.date));
        const emptied = (s.waterSent ?? []).filter((d) => d >= from && !had.has(d)).map((date) => ({ date, ml: 0 }));
        await writeWater([...days.filter((d) => d.ml > 0), ...emptied]);
        setHealthSettings({ waterSent: days.filter((d) => d.ml > 0).map((d) => d.date) });
      }
      if (s.writeWorkouts) {
        const { workouts } = await api<{ workouts: WorkoutSummary[] }>('/api/workouts?limit=30');
        const since = s.workoutsSentUntil ?? '';
        const todo = workouts.filter((w) => w.finishedAt && w.finishedAt > since).sort((a, b) => (a.finishedAt! < b.finishedAt! ? -1 : 1));
        for (const w of todo) {
          await writeWorkout({ id: w.id, name: w.name, startedAt: w.startedAt, finishedAt: w.finishedAt! });
          setHealthSettings({ workoutsSentUntil: w.finishedAt });
        }
      }
      setHealthSettings({ lastSync: new Date().toISOString(), lastError: null });
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHealthSettings({ lastError: msg });
      return msg;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
