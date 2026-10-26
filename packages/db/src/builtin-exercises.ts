// Built-in exercises, available to everyone. Keys are permanent: workouts
// point at these rows, so names and settings can change but a key is never
// reused or renamed.
//
// kind: weight (weight x reps), bodyweight (reps, optional added weight),
// time (seconds). increment: small = 5 lb / 2.5 kg steps, large = 10 lb / 5 kg.

import type { Muscle } from '@forkbell/shared';

export interface BuiltinExercise {
  key: string;
  name: string;
  muscle: Muscle;
  equipment: string;
  kind: 'weight' | 'bodyweight' | 'time' | 'cardio';
  increment: 'small' | 'large';
  restSeconds: number;
}

type Row = [key: string, name: string, muscle: Muscle, equipment: string, kind?: BuiltinExercise['kind'], increment?: BuiltinExercise['increment'], rest?: number];

// Compound lifts rest longer by default; isolation work shorter.
const C = 180;
const I = 90;

const rows: Row[] = [
  // Chest
  ['bench-press', 'Bench press', 'chest', 'barbell', 'weight', 'small', C],
  ['incline-bench-press', 'Incline bench press', 'chest', 'barbell', 'weight', 'small', C],
  ['db-bench-press', 'Dumbbell bench press', 'chest', 'dumbbell', 'weight', 'small', 120],
  ['db-incline-press', 'Incline dumbbell press', 'chest', 'dumbbell', 'weight', 'small', 120],
  ['machine-chest-press', 'Machine chest press', 'chest', 'machine', 'weight', 'small', 120],
  ['cable-fly', 'Cable fly', 'chest', 'cable', 'weight', 'small', I],
  ['db-fly', 'Dumbbell fly', 'chest', 'dumbbell', 'weight', 'small', I],
  ['push-up', 'Push-up', 'chest', 'bodyweight', 'bodyweight', 'small', I],
  ['dip', 'Dip', 'chest', 'bodyweight', 'bodyweight', 'small', 120],

  // Back
  ['deadlift', 'Deadlift', 'back', 'barbell', 'weight', 'large', C],
  ['barbell-row', 'Barbell row', 'back', 'barbell', 'weight', 'small', C],
  ['db-row', 'One-arm dumbbell row', 'back', 'dumbbell', 'weight', 'small', 120],
  ['pull-up', 'Pull-up', 'back', 'bodyweight', 'bodyweight', 'small', 120],
  ['chin-up', 'Chin-up', 'back', 'bodyweight', 'bodyweight', 'small', 120],
  ['lat-pulldown', 'Lat pulldown', 'back', 'cable', 'weight', 'small', 120],
  ['seated-cable-row', 'Seated cable row', 'back', 'cable', 'weight', 'small', 120],
  ['chest-supported-row', 'Chest-supported row', 'back', 'machine', 'weight', 'small', 120],
  ['face-pull', 'Face pull', 'back', 'cable', 'weight', 'small', I],
  ['back-extension', 'Back extension', 'back', 'bodyweight', 'bodyweight', 'small', I],

  // Shoulders
  ['overhead-press', 'Overhead press', 'shoulders', 'barbell', 'weight', 'small', C],
  ['db-shoulder-press', 'Dumbbell shoulder press', 'shoulders', 'dumbbell', 'weight', 'small', 120],
  ['lateral-raise', 'Lateral raise', 'shoulders', 'dumbbell', 'weight', 'small', I],
  ['cable-lateral-raise', 'Cable lateral raise', 'shoulders', 'cable', 'weight', 'small', I],
  ['rear-delt-fly', 'Rear delt fly', 'shoulders', 'dumbbell', 'weight', 'small', I],
  ['machine-shoulder-press', 'Machine shoulder press', 'shoulders', 'machine', 'weight', 'small', 120],

  // Arms
  ['barbell-curl', 'Barbell curl', 'biceps', 'barbell', 'weight', 'small', I],
  ['db-curl', 'Dumbbell curl', 'biceps', 'dumbbell', 'weight', 'small', I],
  ['hammer-curl', 'Hammer curl', 'biceps', 'dumbbell', 'weight', 'small', I],
  ['cable-curl', 'Cable curl', 'biceps', 'cable', 'weight', 'small', I],
  ['preacher-curl', 'Preacher curl', 'biceps', 'machine', 'weight', 'small', I],
  ['triceps-pushdown', 'Triceps pushdown', 'triceps', 'cable', 'weight', 'small', I],
  ['overhead-triceps-extension', 'Overhead triceps extension', 'triceps', 'cable', 'weight', 'small', I],
  ['skull-crusher', 'Skull crusher', 'triceps', 'barbell', 'weight', 'small', I],
  ['close-grip-bench', 'Close-grip bench press', 'triceps', 'barbell', 'weight', 'small', C],

  // Legs
  ['back-squat', 'Back squat', 'quads', 'barbell', 'weight', 'large', C],
  ['front-squat', 'Front squat', 'quads', 'barbell', 'weight', 'large', C],
  ['goblet-squat', 'Goblet squat', 'quads', 'dumbbell', 'weight', 'small', 120],
  ['leg-press', 'Leg press', 'quads', 'machine', 'weight', 'large', 120],
  ['hack-squat', 'Hack squat', 'quads', 'machine', 'weight', 'large', 120],
  ['bulgarian-split-squat', 'Bulgarian split squat', 'quads', 'dumbbell', 'weight', 'small', 120],
  ['walking-lunge', 'Walking lunge', 'quads', 'dumbbell', 'weight', 'small', 120],
  ['leg-extension', 'Leg extension', 'quads', 'machine', 'weight', 'small', I],
  ['romanian-deadlift', 'Romanian deadlift', 'hamstrings', 'barbell', 'weight', 'large', C],
  ['db-romanian-deadlift', 'Dumbbell Romanian deadlift', 'hamstrings', 'dumbbell', 'weight', 'small', 120],
  ['lying-leg-curl', 'Lying leg curl', 'hamstrings', 'machine', 'weight', 'small', I],
  ['seated-leg-curl', 'Seated leg curl', 'hamstrings', 'machine', 'weight', 'small', I],
  ['hip-thrust', 'Hip thrust', 'glutes', 'barbell', 'weight', 'large', 120],
  ['glute-bridge', 'Glute bridge', 'glutes', 'bodyweight', 'bodyweight', 'small', I],
  ['standing-calf-raise', 'Standing calf raise', 'calves', 'machine', 'weight', 'small', I],
  ['seated-calf-raise', 'Seated calf raise', 'calves', 'machine', 'weight', 'small', I],

  // Core and full body
  ['plank', 'Plank', 'core', 'bodyweight', 'time', 'small', 60],
  // Cardio: logged as a time and a distance; no rest timer.
  ['cardio-run', 'Run', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-treadmill', 'Treadmill', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-walk', 'Walk', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-hike', 'Hike', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-bike', 'Bike ride', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-stationary-bike', 'Stationary bike', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-row', 'Rowing machine', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-elliptical', 'Elliptical', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-stairs', 'Stair climber', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-swim', 'Swim', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-jump-rope', 'Jump rope', 'full body', 'cardio', 'cardio', 'small', 0],
  ['cardio-hiit', 'HIIT', 'full body', 'cardio', 'cardio', 'small', 0],
  ['side-plank', 'Side plank', 'core', 'bodyweight', 'time', 'small', 60],
  ['hanging-leg-raise', 'Hanging leg raise', 'core', 'bodyweight', 'bodyweight', 'small', I],
  ['cable-crunch', 'Cable crunch', 'core', 'cable', 'weight', 'small', I],
  ['ab-wheel', 'Ab wheel rollout', 'core', 'bodyweight', 'bodyweight', 'small', I],
  ['farmers-carry', "Farmer's carry", 'full body', 'dumbbell', 'time', 'small', 120],
  ['kettlebell-swing', 'Kettlebell swing', 'full body', 'kettlebell', 'weight', 'small', 120],
  ['power-clean', 'Power clean', 'full body', 'barbell', 'weight', 'small', C],
];

export const builtinExercises: BuiltinExercise[] = rows.map(([key, name, muscle, equipment, kind = 'weight', increment = 'small', rest = 120]) => ({
  key,
  name,
  muscle,
  equipment,
  kind,
  increment,
  restSeconds: rest,
}));
