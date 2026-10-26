import { z } from 'zod';
import { dateSchema } from './schemas.ts';

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full body'] as const;
export type Muscle = (typeof MUSCLES)[number];
export type ExerciseKind = 'weight' | 'bodyweight' | 'time' | 'cardio';
export type WeightUnit = 'lb' | 'kg';

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  kind: ExerciseKind;
  increment: 'small' | 'large';
  restSeconds: number;
  custom: boolean;
  /** in the big searchable library rather than the everyday list */
  library?: boolean;
  /** has steps and pictures showing how to do it */
  howTo?: boolean;
  /** where its how-to pictures live, and how many there are */
  howToRef?: string | null;
  pictures?: number;
}

/** A how-to picture's path on your Forkbell server. */
export const picturePath = (ref: string, n: number) => `/api/media/exercise/${encodeURIComponent(ref)}/${n}.jpg`;

/** All of an exercise's how-to picture paths. */
export const picturePaths = (e: Pick<Exercise, 'howToRef' | 'pictures'>) =>
  e.howToRef ? Array.from({ length: e.pictures ?? 0 }, (_, n) => picturePath(e.howToRef!, n)) : [];

/** How to do an exercise: steps and pictures (start and end of the movement). */
export interface ExerciseHowTo {
  steps: string[];
  /** beginner, intermediate or expert */
  level: string | null;
  /** muscles that help, besides the main one */
  secondary: string[];
  /** picture paths on your Forkbell server, in order */
  images: string[];
  credit: string;
}

export interface SetEntry {
  /** stored in kg; null for no added weight */
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  rpe: number | null;
  warmup: boolean;
  done: boolean;
  /** a drop set: straight after the set before it, lighter, with no rest (never also a warm-up) */
  drop?: boolean;
  /** cardio: metres covered (the time is `seconds`) */
  distanceM?: number | null;
}

export interface WorkoutExercise {
  exercise: Exercise;
  restSeconds: number;
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  sets: SetEntry[];
  /** what you did last time, for the "previous" column */
  previous: SetEntry[];
  /** you flagged pain or discomfort on this lift in this session */
  pain?: boolean;
  painNote?: string | null;
  /** safety tips from recent sessions */
  tips?: import('./training-tips.ts').TrainingTip[];
  /** exercises with the same number are a superset (two) or circuit (three or more), done back to back */
  superset?: number | null;
}

export interface Workout {
  id: string;
  date: string;
  name: string;
  routineId: string | null;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutSummary {
  id: string;
  date: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  exercises: number;
  sets: number;
  volumeKg: number;
}

export interface RoutineExercise {
  exercise: Exercise;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
}

export interface Routine {
  id: string;
  name: string;
  position: number;
  exercises: RoutineExercise[];
}

export interface Program {
  id: string;
  name: string;
  active: boolean;
  routines: Routine[];
  /** the routine that comes after the last one you finished */
  nextRoutineId: string | null;
}

export type RecordKind = 'weight' | 'e1rm' | 'reps' | 'volume' | 'time';

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  /** kg for weight, e1rm and volume; reps; seconds */
  value: number;
  /** the set that set it, for display */
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  date: string;
}

// Units --------------------------------------------------------------------
export const KG_PER_LB = 0.45359237;

export const toKg = (value: number, unit: WeightUnit) => (unit === 'kg' ? value : value * KG_PER_LB);
export const fromKg = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg / KG_PER_LB);

/** A weight in your unit, to the nearest 0.1 and without a trailing ".0". */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return '';
  const v = Math.round(fromKg(kg, unit) * 10) / 10;
  return String(v);
}

/** One progression step in kg: 5 lb / 2.5 kg, or 10 lb / 5 kg for big lower-body lifts. */
export function incrementKg(increment: 'small' | 'large', unit: WeightUnit): number {
  return unit === 'kg' ? (increment === 'large' ? 5 : 2.5) : toKg(increment === 'large' ? 10 : 5, 'lb');
}

// Strength math ---------------------------------------------------------------
/**
 * Estimated one-rep max (Epley). Only trusted up to 12 reps; past that the
 * estimate drifts too far to call it a record.
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Sets that say what you can lift: done, not warm-ups, and not drop sets (lighter on purpose). */
const working = (sets: SetEntry[]) => sets.filter((s) => s.done && !s.warmup && !s.drop);

export function setVolumeKg(s: SetEntry): number {
  return s.done && !s.warmup && s.weightKg && s.reps ? s.weightKg * s.reps : 0;
}

export interface NextTarget {
  weightKg: number | null;
  reps: number;
  /** why, in plain words */
  note: string;
}

/**
 * Double progression: stay at a weight until every working set reaches the
 * top of the rep range, then add one step and start again at the bottom.
 * Never suggests more than one step at a time.
 */
export function nextTarget(last: SetEntry[], repMin: number, repMax: number, stepKg: number, kind: ExerciseKind): NextTarget | null {
  const sets = working(last);
  if (!sets.length || kind === 'cardio') return null;
  if (kind === 'time') {
    const best = Math.max(...sets.map((s) => s.seconds ?? 0));
    return { weightKg: null, reps: 0, note: best ? `Last time ${best} s. Try to match or beat it.` : 'Log your time.' };
  }
  // The heaviest weight you did working sets at last time.
  const top = Math.max(...sets.map((s) => s.weightKg ?? 0));
  const atTop = sets.filter((s) => (s.weightKg ?? 0) === top);
  const allAtMax = atTop.length > 0 && atTop.every((s) => (s.reps ?? 0) >= repMax);
  const hardest = Math.max(...atTop.map((s) => s.rpe ?? 0));
  if (allAtMax && hardest < 10 && (kind === 'weight' || top > 0)) {
    return { weightKg: top + stepKg, reps: repMin, note: `You hit ${repMax} reps on every set. Add a step and start at ${repMin}.` };
  }
  if (allAtMax && hardest >= 10) {
    return { weightKg: top || null, reps: repMax, note: `That was all-out (RPE 10). Repeat it once more before adding weight.` };
  }
  if (allAtMax && kind === 'bodyweight') {
    return { weightKg: top || null, reps: Math.min(repMax + 1, 100), note: `You hit ${repMax} on every set. Go for one more rep, or add weight.` };
  }
  const lowest = Math.min(...atTop.map((s) => s.reps ?? 0));
  const goal = Math.min(Math.max(lowest + 1, repMin), repMax);
  return { weightKg: top || null, reps: goal, note: `Same weight. Aim for ${goal} reps on each set.` };
}

/**
 * Records a set of finished sets beats, compared with everything before.
 * One record per kind per exercise, the best of the session.
 */
export function findRecords(
  exercise: { id: string; name: string; kind: ExerciseKind },
  session: SetEntry[],
  history: SetEntry[],
  date: string,
): PersonalRecord[] {
  const now = working(session);
  if (!now.length) return [];
  const before = working(history);
  const out: PersonalRecord[] = [];
  const add = (kind: RecordKind, value: number, s: SetEntry) =>
    out.push({ exerciseId: exercise.id, exerciseName: exercise.name, kind, value, weightKg: s.weightKg, reps: s.reps, seconds: s.seconds, date });
  const best = (sets: SetEntry[], f: (s: SetEntry) => number | null) =>
    sets.reduce<{ v: number; s: SetEntry | null }>((b, s) => {
      const v = f(s) ?? 0;
      return v > b.v ? { v, s } : b;
    }, { v: 0, s: null });
  // A first session sets a baseline; calling everything a record would be noise.
  if (!before.length) return [];

  const metrics: [RecordKind, (s: SetEntry) => number | null][] =
    exercise.kind === 'time'
      ? [['time', (s) => s.seconds]]
      : exercise.kind === 'bodyweight'
        ? [['reps', (s) => (s.weightKg ? null : s.reps)], ['weight', (s) => s.weightKg]]
        : [['weight', (s) => s.weightKg], ['e1rm', (s) => (s.weightKg && s.reps ? estimatedOneRepMax(s.weightKg, s.reps) : null)], ['volume', (s) => setVolumeKg(s) || null]];

  for (const [kind, f] of metrics) {
    const was = best(before, f).v;
    const is = best(now, f);
    // Small tolerance so unit rounding (135 lb stored as 61.235 kg) never fakes a record.
    if (is.s && is.v > was + 0.01) add(kind, is.v, is.s);
  }
  return out;
}

// Starter programs ---------------------------------------------------------------
export interface StarterProgram {
  key: string;
  name: string;
  daysPerWeek: string;
  description: string;
  routines: { name: string; exercises: [exerciseKey: string, sets: number, repMin: number, repMax: number][] }[];
}

export const STARTER_PROGRAMS: StarterProgram[] = [
  {
    key: 'full-body-3',
    name: 'Full body, 3 days',
    daysPerWeek: '3 days a week',
    description: 'Two full-body days, A and B, taken in turn. A good start or a busy week.',
    routines: [
      { name: 'Full body A', exercises: [['back-squat', 3, 5, 8], ['bench-press', 3, 5, 8], ['barbell-row', 3, 6, 10], ['lateral-raise', 2, 10, 15], ['plank', 2, 1, 1]] },
      { name: 'Full body B', exercises: [['romanian-deadlift', 3, 6, 10], ['overhead-press', 3, 5, 8], ['lat-pulldown', 3, 8, 12], ['db-curl', 2, 10, 15], ['triceps-pushdown', 2, 10, 15]] },
    ],
  },
  {
    key: 'upper-lower-4',
    name: 'Upper / lower, 4 days',
    daysPerWeek: '4 days a week',
    description: 'Upper and lower body days, twice each a week.',
    routines: [
      { name: 'Upper A', exercises: [['bench-press', 3, 5, 8], ['barbell-row', 3, 6, 10], ['db-shoulder-press', 3, 8, 12], ['lat-pulldown', 2, 8, 12], ['triceps-pushdown', 2, 10, 15]] },
      { name: 'Lower A', exercises: [['back-squat', 3, 5, 8], ['romanian-deadlift', 3, 6, 10], ['leg-extension', 2, 10, 15], ['standing-calf-raise', 3, 8, 12], ['hanging-leg-raise', 2, 8, 15]] },
      { name: 'Upper B', exercises: [['overhead-press', 3, 5, 8], ['pull-up', 3, 5, 10], ['db-incline-press', 3, 8, 12], ['seated-cable-row', 2, 8, 12], ['db-curl', 2, 10, 15]] },
      { name: 'Lower B', exercises: [['deadlift', 2, 3, 6], ['leg-press', 3, 8, 12], ['lying-leg-curl', 3, 10, 15], ['seated-calf-raise', 3, 10, 15], ['plank', 2, 1, 1]] },
    ],
  },
  {
    key: 'ppl-6',
    name: 'Push / pull / legs',
    daysPerWeek: '3 to 6 days a week',
    description: 'Push, pull and legs days in turn. Run it once or twice a week.',
    routines: [
      { name: 'Push', exercises: [['bench-press', 3, 5, 8], ['overhead-press', 3, 6, 10], ['db-incline-press', 2, 8, 12], ['lateral-raise', 3, 10, 15], ['triceps-pushdown', 3, 10, 15]] },
      { name: 'Pull', exercises: [['deadlift', 2, 3, 6], ['pull-up', 3, 5, 10], ['barbell-row', 3, 6, 10], ['face-pull', 2, 12, 20], ['hammer-curl', 3, 8, 12]] },
      { name: 'Legs', exercises: [['back-squat', 3, 5, 8], ['romanian-deadlift', 3, 6, 10], ['leg-press', 2, 8, 12], ['lying-leg-curl', 2, 10, 15], ['standing-calf-raise', 3, 8, 12]] },
    ],
  },
];

// Validation for what the app sends ----------------------------------------------
const setSchema = z.object({
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  seconds: z.number().int().min(0).max(86400).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  warmup: z.boolean(),
  done: z.boolean(),
  drop: z.boolean().optional(),
  distanceM: z.number().min(0).max(1_000_000).nullish(),
});

export const saveWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: dateSchema,
  notes: z.string().max(2000).nullable(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().uuid(),
        restSeconds: z.number().int().min(0).max(900),
        targetSets: z.number().int().min(1).max(20).nullable(),
        repMin: z.number().int().min(1).max(100).nullable(),
        repMax: z.number().int().min(1).max(100).nullable(),
        sets: z.array(setSchema).max(50),
        pain: z.boolean().optional(),
        painNote: z.string().max(300).nullish(),
        superset: z.number().int().min(1).max(20).nullish(),
      }),
    )
    .max(40),
});

export const startWorkoutSchema = z.object({
  /** made on the device for workouts started offline */
  id: z.string().uuid().optional(),
  date: dateSchema,
  routineId: z.string().uuid().nullish(),
  /** when the workout really started, for ones started offline and sent later */
  startedAt: z.string().datetime({ offset: true }).optional(),
});

export const finishWorkoutSchema = z.object({ finishedAt: z.string().datetime({ offset: true }).optional() });

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  muscle: z.enum(MUSCLES),
  equipment: z.string().trim().min(1).max(40),
  kind: z.enum(['weight', 'bodyweight', 'time', 'cardio']),
  increment: z.enum(['small', 'large']).default('small'),
  restSeconds: z.number().int().min(0).max(900).default(120),
});

export const saveRoutineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  exercises: z
    .array(
      z
        .object({
          exerciseId: z.string().uuid(),
          sets: z.number().int().min(1).max(20),
          repMin: z.number().int().min(1).max(100),
          repMax: z.number().int().min(1).max(100),
          restSeconds: z.number().int().min(0).max(900),
        })
        .refine((e) => e.repMax >= e.repMin, 'The top of the rep range is below the bottom.'),
    )
    .max(40),
});

export type SaveWorkoutInput = z.infer<typeof saveWorkoutSchema>;
export type SaveRoutineInput = z.infer<typeof saveRoutineSchema>;
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
