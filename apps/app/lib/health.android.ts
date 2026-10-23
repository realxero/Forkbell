// Health Connect on Android.
import { aggregateGroupByPeriod, getSdkStatus, initialize, insertRecords, readRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import { addDays, todayLocal, type HealthImport, type HealthSource } from '@forkbell/shared';
import type { NutritionDay, WorkoutForHealth } from './health';

export type { NutritionDay, WorkoutForHealth } from './health';
export const healthName: string | null = 'Health Connect';
export const healthSource: HealthSource | null = 'health_connect';

const startOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
let ready = false;
async function init() {
  if (!ready) ready = await initialize();
  return ready;
}

export async function healthAvailable() {
  try {
    return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export async function requestHealthAccess() {
  if (!(await init())) return false;
  const granted = await requestPermission([
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    { accessType: 'read', recordType: 'BasalMetabolicRate' },
    { accessType: 'read', recordType: 'RestingHeartRate' },
    { accessType: 'read', recordType: 'Weight' },
    { accessType: 'read', recordType: 'BodyFat' },
    { accessType: 'read', recordType: 'Distance' },
    { accessType: 'read', recordType: 'FloorsClimbed' },
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
    { accessType: 'read', recordType: 'OxygenSaturation' },
    { accessType: 'read', recordType: 'RespiratoryRate' },
    { accessType: 'read', recordType: 'Vo2Max' },
    { accessType: 'read', recordType: 'LeanBodyMass' },
    { accessType: 'read', recordType: 'SleepSession' },
    { accessType: 'read', recordType: 'ExerciseSession' },
    { accessType: 'write', recordType: 'Nutrition' },
    { accessType: 'write', recordType: 'ExerciseSession' },
  ]);
  return granted.length > 0;
}

export async function readHealth(from: string, to: string): Promise<Omit<HealthImport, 'source'>> {
  await init();
  const timeRangeFilter = { operator: 'between' as const, startTime: startOf(from).toISOString(), endTime: startOf(addDays(to, 1)).toISOString() };
  const timeRangeSlicer = { period: 'DAYS' as const, length: 1 };
  const days: HealthImport['days'] = [];
  const push = (date: string, kind: HealthImport['days'][number]['kind'], v: number | undefined) => {
    if (v !== undefined && v > 0) days.push({ date, kind, value: Math.round(v * 10) / 10 });
  };
  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'Steps', timeRangeFilter, timeRangeSlicer })) push(todayLocal(new Date(g.startTime)), 'steps', g.result.COUNT_TOTAL);
  } catch { /* not allowed */ }
  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'ActiveCaloriesBurned', timeRangeFilter, timeRangeSlicer }))
      push(todayLocal(new Date(g.startTime)), 'active_kcal', g.result.ACTIVE_CALORIES_TOTAL?.inKilocalories);
  } catch { /* not allowed */ }
  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'RestingHeartRate', timeRangeFilter, timeRangeSlicer }))
      push(todayLocal(new Date(g.startTime)), 'resting_hr', g.result.BPM_AVG);
  } catch { /* not allowed */ }

  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'Distance', timeRangeFilter, timeRangeSlicer }))
      push(todayLocal(new Date(g.startTime)), 'distance_m', g.result.DISTANCE?.inMeters);
  } catch { /* not allowed */ }
  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'FloorsClimbed', timeRangeFilter, timeRangeSlicer }))
      push(todayLocal(new Date(g.startTime)), 'flights', g.result.FLOORS_CLIMBED_TOTAL);
  } catch { /* not allowed */ }
  try {
    for (const g of await aggregateGroupByPeriod({ recordType: 'HeartRate', timeRangeFilter, timeRangeSlicer }))
      push(todayLocal(new Date(g.startTime)), 'hr_avg', g.result.BPM_AVG);
  } catch { /* not allowed */ }
  // Readings without a built-in daily total: average them per day.
  const perDay = async (recordType: string, kind: HealthImport['days'][number]['kind'], pick: (r: Record<string, unknown>) => number | undefined, when: (r: Record<string, unknown>) => string) => {
    try {
      const { records } = await readRecords(recordType as 'HeartRateVariabilityRmssd', { timeRangeFilter });
      const by = new Map<string, number[]>();
      for (const r of records as unknown as Record<string, unknown>[]) {
        const v = pick(r);
        if (v === undefined || !(v > 0)) continue;
        const d = todayLocal(new Date(when(r)));
        by.set(d, [...(by.get(d) ?? []), v]);
      }
      for (const [d, vs] of by) push(d, kind, vs.reduce((a, b) => a + b, 0) / vs.length);
    } catch { /* not allowed */ }
  };
  const at = (r: Record<string, unknown>) => r.time as string;
  await perDay('HeartRateVariabilityRmssd', 'hrv_ms', (r) => r.heartRateVariabilityMillis as number, at);
  await perDay('OxygenSaturation', 'spo2_pct', (r) => (r.percentage as { value?: number } | number | undefined) && (typeof r.percentage === 'number' ? r.percentage : (r.percentage as { value: number }).value), at);
  await perDay('RespiratoryRate', 'resp_rate', (r) => r.rate as number, at);
  await perDay('Vo2Max', 'vo2max', (r) => r.vo2MillilitersPerMinuteKilogram as number, at);
  await perDay('LeanBodyMass', 'lean_kg', (r) => (r.mass as { inKilograms: number } | undefined)?.inKilograms, at);
  // Sleep and exercise sessions: minutes, on the day they ended.
  const minutes = async (recordType: string, kind: HealthImport['days'][number]['kind']) => {
    try {
      const { records } = await readRecords(recordType as 'SleepSession', { timeRangeFilter });
      const by = new Map<string, number>();
      for (const r of records as unknown as { startTime: string; endTime: string }[]) {
        const d = todayLocal(new Date(r.endTime));
        by.set(d, (by.get(d) ?? 0) + (Date.parse(r.endTime) - Date.parse(r.startTime)) / 60000);
      }
      for (const [d, m] of by) push(d, kind, Math.round(m));
    } catch { /* not allowed */ }
  };
  await minutes('SleepSession', 'sleep_min');
  await minutes('ExerciseSession', 'exercise_min');

  const weights = new Map<string, { date: string; weightKg: number; bodyFat: number | null }>();
  try {
    const { records } = await readRecords('Weight', { timeRangeFilter });
    for (const r of records) {
      const date = todayLocal(new Date(r.time));
      const kg = r.weight.inKilograms;
      if (kg >= 20 && kg <= 400) weights.set(date, { date, weightKg: Math.round(kg * 100) / 100, bodyFat: null });
    }
    const fat = await readRecords('BodyFat', { timeRangeFilter });
    for (const r of fat.records) {
      const w = weights.get(todayLocal(new Date(r.time)));
      if (w && r.percentage >= 2 && r.percentage <= 70) w.bodyFat = Math.round(r.percentage * 10) / 10;
    }
  } catch { /* not allowed */ }
  return { days, weights: [...weights.values()] };
}

/** One record per day; the same client record id with a newer version replaces it. */
export async function writeNutrition(days: NutritionDay[]) {
  await init();
  const records = days
    .filter((d) => d.kcal > 0)
    .map((d) => {
      const start = startOf(d.date);
      const end = new Date(Math.min(startOf(addDays(d.date, 1)).getTime() - 1000, Date.now()));
      return {
        recordType: 'Nutrition' as const,
        mealType: 0, // a whole day, not one meal
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        energy: { unit: 'kilocalories' as const, value: d.kcal },
        protein: { unit: 'grams' as const, value: d.protein },
        totalCarbohydrate: { unit: 'grams' as const, value: d.carbs },
        totalFat: { unit: 'grams' as const, value: d.fat },
        metadata: { clientRecordId: `forkbell-${d.date}`, clientRecordVersion: Date.now() },
      };
    })
    .filter((r) => r.endTime > r.startTime);
  if (records.length) await insertRecords(records);
}

export async function writeWorkout(w: WorkoutForHealth) {
  await init();
  await insertRecords([
    {
      recordType: 'ExerciseSession',
      exerciseType: 70, // strength training
      title: w.name,
      startTime: w.startedAt,
      endTime: w.finishedAt,
      metadata: { clientRecordId: `forkbell-workout-${w.id}`, clientRecordVersion: 1 },
    },
  ]);
}
