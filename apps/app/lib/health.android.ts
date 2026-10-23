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
