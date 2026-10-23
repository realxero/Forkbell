// Apple Health through HealthKit.
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
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

  // Weights: the last reading of each day. Body fat comes as a fraction (0.2 = 20%).
  const weights = new Map<string, { date: string; weightKg: number; bodyFat: number | null }>();
  try {
    for (const s of await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 500, ascending: true, unit: 'kg', filter })) {
      const date = todayLocal(new Date(s.startDate));
      if (s.quantity >= 20 && s.quantity <= 400) weights.set(date, { date, weightKg: Math.round(s.quantity * 100) / 100, bodyFat: null });
    }
    for (const s of await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', { limit: 500, ascending: true, unit: '%', filter })) {
      const w = weights.get(todayLocal(new Date(s.startDate)));
      const pct = s.quantity <= 1 ? s.quantity * 100 : s.quantity;
      if (w && pct >= 2 && pct <= 70) w.bodyFat = Math.round(pct * 10) / 10;
    }
  } catch {
    /* not allowed */
  }
  return { days, weights: [...weights.values()] };
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
