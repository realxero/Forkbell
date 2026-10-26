// Apple Health / Health Connect, behind one small interface. This file is the
// web version (no health platform); health.ios.ts and health.android.ts are
// picked automatically on phones.
import type { HealthImport, HealthSource } from '@forkbell/shared';

export interface NutritionDay {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface WorkoutForHealth {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string;
}

export const healthName: string | null = null;
export const healthSource: HealthSource | null = null;
export async function healthAvailable(): Promise<boolean> {
  return false;
}
export async function requestHealthAccess(): Promise<boolean> {
  return false;
}
export async function readHealth(_from: string, _to: string): Promise<Omit<HealthImport, 'source'>> {
  return { days: [], weights: [] };
}
export async function readWeights(_from: string, _to: string): Promise<HealthImport['weights']> {
  return [];
}
export async function writeNutrition(_days: NutritionDay[]): Promise<void> {}
export async function writeWorkout(_w: WorkoutForHealth): Promise<void> {}

/** Live heart rate during a workout: Apple Health only, for now. */
export async function latestHeartRate(): Promise<{ bpm: number; at: number } | null> {
  return null;
}
export async function latestRestingHeartRate(): Promise<number | null> {
  return null;
}

/** Water to Apple Health: iPhone only, for now. */
export async function writeWater(_days: { date: string; ml: number }[]): Promise<void> {}
