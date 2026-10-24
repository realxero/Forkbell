// Apple Health through HealthKit.
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryCategorySamples,
  CategoryValueSleepAnalysis,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
  saveQuantitySample,
  saveWorkoutSample,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import { addDays, todayLocal, type HealthImport, type HealthKind, type HealthSource } from '@forkbell/shared';
import type { NutritionDay, WorkoutForHealth } from './health';

export type { NutritionDay, WorkoutForHealth } from './health';
export const healthName: string | null = 'Apple Health';
export const healthSource: HealthSource | null = 'apple_health';

const startOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export async function healthAvailable() {
  return isHealthDataAvailableAsync();
}

export async function requestHealthAccess() {
  return requestAuthorization({
    toRead: [
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierBodyMass',
      'HKQuantityTypeIdentifierBodyFatPercentage',
      'HKQuantityTypeIdentifierAppleExerciseTime',
      'HKQuantityTypeIdentifierFlightsClimbed',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKQuantityTypeIdentifierOxygenSaturation',
      'HKQuantityTypeIdentifierRespiratoryRate',
      'HKQuantityTypeIdentifierVO2Max',
      'HKQuantityTypeIdentifierLeanBodyMass',
      'HKCategoryTypeIdentifierSleepAnalysis',
    ],
    toShare: [
      'HKQuantityTypeIdentifierDietaryEnergyConsumed',
      'HKQuantityTypeIdentifierDietaryProtein',
      'HKQuantityTypeIdentifierDietaryCarbohydrates',
      'HKQuantityTypeIdentifierDietaryFatTotal',
      'HKWorkoutTypeIdentifier',
    ],
  });
}

export async function readHealth(from: string, to: string): Promise<Omit<HealthImport, 'source'>> {
  const startDate = startOf(from);
  const endDate = startOf(addDays(to, 1));
  const filter = { date: { startDate, endDate } };
  const days: HealthImport['days'] = [];
  const daily = async (kind: HealthKind, run: () => Promise<readonly { startDate?: Date; sumQuantity?: { quantity: number }; averageQuantity?: { quantity: number } }[]>) => {
    try {
      for (const r of await run()) {
        const v = r.sumQuantity?.quantity ?? r.averageQuantity?.quantity;
        if (r.startDate && v !== undefined && v > 0) days.push({ date: todayLocal(r.startDate), kind, value: Math.round(v * 10) / 10 });
      }
    } catch {
      /* not allowed or no data: skip this kind */
    }
  };
  await daily('steps', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'count' }));
  await daily('active_kcal', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'kcal' }));
  await daily('resting_kcal', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierBasalEnergyBurned', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'kcal' }));
  await daily('resting_hr', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'count/min' }));
  await daily('exercise_min', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierAppleExerciseTime', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'min' }));
  await daily('flights', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierFlightsClimbed', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'count' }));
  await daily('distance_m', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', ['cumulativeSum'], startDate, { day: 1 }, { filter, unit: 'm' }));
  await daily('hr_avg', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'count/min' }));
  await daily('hrv_ms', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'ms' }));
  await daily('resp_rate', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierRespiratoryRate', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'count/min' }));
  await daily('vo2max', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierVO2Max', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'ml/(kg*min)' }));
  await daily('lean_kg', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierLeanBodyMass', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: 'kg' }));
  // Blood oxygen comes as a fraction (0.97 = 97%).
  const before = days.length;
  await daily('spo2_pct', () => queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierOxygenSaturation', ['discreteAverage'], startDate, { day: 1 }, { filter, unit: '%' }));
  for (const d of days.slice(before)) if (d.value <= 1) d.value = Math.round(d.value * 1000) / 10;

  // Sleep: time actually asleep (not just in bed), counted on the morning you woke up.
  try {
    const asleep = new Set<number>([CategoryValueSleepAnalysis.asleepUnspecified, CategoryValueSleepAnalysis.asleepCore, CategoryValueSleepAnalysis.asleepDeep, CategoryValueSleepAnalysis.asleepREM]);
    const byNight = new Map<string, number>();
    const sleepFilter = { date: { startDate: new Date(startDate.getTime() - 86400000), endDate } };
    for (const s of await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 5000, ascending: true, filter: sleepFilter })) {
      if (!asleep.has(s.value as number)) continue;
      const end = new Date(s.endDate);
      const night = todayLocal(end);
      byNight.set(night, (byNight.get(night) ?? 0) + (end.getTime() - new Date(s.startDate).getTime()) / 60000);
    }
    for (const [date, min] of byNight) if (date >= from && date <= to && min > 0) days.push({ date, kind: 'sleep_min', value: Math.round(min) });
  } catch {
    /* not allowed */
  }

  return { days, weights: await readWeights(from, to) };
}

/** Weigh-ins between two dates: the last reading of each day. Body fat comes as a fraction (0.2 = 20%). */
export async function readWeights(from: string, to: string): Promise<HealthImport['weights']> {
  const filter = { date: { startDate: startOf(from), endDate: startOf(addDays(to, 1)) } };
  const weights = new Map<string, { date: string; weightKg: number; bodyFat: number | null }>();
  try {
    // Oldest first, so a later reading the same day replaces an earlier one.
    for (const s of await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 20000, ascending: true, unit: 'kg', filter })) {
      const date = todayLocal(new Date(s.startDate));
      if (s.quantity >= 20 && s.quantity <= 400) weights.set(date, { date, weightKg: Math.round(s.quantity * 100) / 100, bodyFat: null });
    }
    for (const s of await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', { limit: 20000, ascending: true, unit: '%', filter })) {
      const w = weights.get(todayLocal(new Date(s.startDate)));
      const pct = s.quantity <= 1 ? s.quantity * 100 : s.quantity;
      if (w && pct >= 2 && pct <= 70) w.bodyFat = Math.round(pct * 10) / 10;
    }
  } catch {
    /* not allowed */
  }
  return [...weights.values()];
}

/**
 * One sample per nutrient per day. HealthKit's sync identifier means writing
 * a day again replaces the earlier total instead of adding to it.
 */
export async function writeNutrition(days: NutritionDay[]) {
  const kinds = [
    ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', 'kcal'],
    ['HKQuantityTypeIdentifierDietaryProtein', 'g', 'protein'],
    ['HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', 'carbs'],
    ['HKQuantityTypeIdentifierDietaryFatTotal', 'g', 'fat'],
  ] as const;
  for (const d of days) {
    const start = startOf(d.date);
    const end = new Date(Math.min(startOf(addDays(d.date, 1)).getTime() - 1000, Date.now()));
    if (end <= start) continue;
    for (const [id, unit, key] of kinds) {
      if (!(d[key] > 0)) continue;
      await saveQuantitySample(id, unit, d[key], start, end, {
        HKMetadataKeySyncIdentifier: `forkbell:${d.date}:${key}`,
        HKMetadataKeySyncVersion: Date.now(),
      }).catch(() => {});
    }
  }
}

export async function writeWorkout(w: WorkoutForHealth) {
  await saveWorkoutSample(WorkoutActivityType.traditionalStrengthTraining, [], new Date(w.startedAt), new Date(w.finishedAt), undefined, {
    HKMetadataKeySyncIdentifier: `forkbell:workout:${w.id}`,
    HKMetadataKeySyncVersion: 1,
  });
}
