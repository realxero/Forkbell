// Training suggestions: rules, not AI. Instant, offline, and the same every time.
// Exercise matching works from names and the exercise's muscle and equipment,
// so custom exercises are covered as long as their names are plain.
import { z } from 'zod';
import { estimatedOneRepMax, type Exercise, type SetEntry } from './training.ts';
import { addDays } from './dates.ts';
import { daysBetween, weekStart } from './progress.ts';

// ---------------------------------------------------------------------------
// Your training setup

export const BODY_AREAS = ['shoulders', 'elbows', 'wrists', 'lower back', 'knees'] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
export const EQUIPMENT_KINDS = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band'] as const;

export const trainingSetupSchema = z
  .object({
    /** what you have; empty means everything (a full gym). Bodyweight is always available. */
    equipment: z.array(z.enum(EQUIPMENT_KINDS)).default([]),
    /** areas to go easy on: swaps steer away from exercises that load them */
    protectedAreas: z.array(z.enum(BODY_AREAS)).default([]),
    /** exercises never offered as a swap or suggestion (still loggable) */
    neverSuggest: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
    /** exercises whose tips you hid (pain notes still show) */
    hiddenTips: z.array(z.string().uuid()).max(500).default([]),
    /** strength goals: exercise id to an estimated one-rep max, in kg */
    goals: z.record(z.string().uuid(), z.number().positive().max(1000)).default({}),
  })
  .default({ equipment: [], protectedAreas: [], neverSuggest: [], hiddenTips: [], goals: {} });
export type TrainingSetup = z.infer<typeof trainingSetupSchema>;

// Name fragments for movements that put real load on each area.
const AREA_WORDS: Record<BodyArea, string[]> = {
  shoulders: ['overhead press', 'shoulder press', 'military press', 'push press', 'dip', 'upright row', 'behind the neck', 'snatch', 'handstand', 'bench press', 'incline'],
  elbows: ['skull crusher', 'close-grip', 'triceps extension', 'preacher', 'chin-up', 'dip'],
  wrists: ['front squat', 'push-up', 'skull crusher', 'barbell curl', 'clean', 'snatch', 'handstand'],
  'lower back': ['deadlift', 'barbell row', 'bent-over', 'good morning', 'back extension', 'romanian', 'back squat', 'clean', 'swing', 't-bar'],
  knees: ['squat', 'lunge', 'leg press', 'leg extension', 'step-up', 'jump', 'pistol'],
};

/** The protected areas an exercise loads, judged by its name. */
export function areasLoaded(name: string, areas: readonly BodyArea[] = BODY_AREAS): BodyArea[] {
  const n = name.toLowerCase();
  return areas.filter((a) => AREA_WORDS[a].some((w) => n.includes(w)));
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Whether a name is on a never-suggest list (whole words, so "row" doesn't block "narrow grip"). */
export function onList(name: string, list: string[]): boolean {
  const have = ` ${words(name).join(' ')} `;
  return list.some((item) => {
    const w = words(item);
    return w.length > 0 && have.includes(` ${w.join(' ')} `);
  });
}

const hasEquipment = (ex: Pick<Exercise, 'equipment'>, setup: TrainingSetup) =>
  !setup.equipment.length || ex.equipment === 'bodyweight' || (setup.equipment as string[]).includes(ex.equipment);

// ---------------------------------------------------------------------------
// Swaps

export interface Swap {
  exercise: Exercise;
  reasons: string[];
}

/**
 * Exercises that train the same muscle, best first, each with why it fits.
 * Leaves out what you can't do (equipment), shouldn't (protected areas) or
 * don't want (never-suggest).
 */
export function rankSwaps(target: Exercise, library: (Exercise & { uses?: number })[], setup: TrainingSetup, limit = 5): Swap[] {
  const strained = areasLoaded(target.name, setup.protectedAreas);
  const out: (Swap & { score: number })[] = [];
  for (const ex of library) {
    if (ex.id === target.id || ex.muscle !== target.muscle) continue;
    if (!hasEquipment(ex, setup) || onList(ex.name, setup.neverSuggest)) continue;
    if (areasLoaded(ex.name, setup.protectedAreas).length) continue;
    const reasons = [`works your ${ex.muscle}`];
    let score = 0;
    const eased = strained.filter((a) => !areasLoaded(ex.name, [a]).length);
    if (eased.length) {
      reasons.push(`easier on your ${eased.join(' and ')}`);
      score += 4;
    }
    if ((ex.uses ?? 0) > 0) {
      reasons.push('you’ve done it before');
      score += 3;
    }
    if (ex.kind === target.kind) score += 2;
    if (ex.equipment !== target.equipment) {
      reasons.push(ex.equipment === 'bodyweight' ? 'no equipment needed' : `uses a ${ex.equipment}`);
      score += 1;
    }
    out.push({ exercise: ex, reasons, score });
  }
  return out
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, limit)
    .map(({ exercise, reasons }) => ({ exercise, reasons }));
}

// ---------------------------------------------------------------------------
// Stalled lifts

/** The best effort in a session: estimated one-rep max, or most reps for bodyweight work. */
export function sessionBest(sets: SetEntry[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.done || s.warmup || !s.reps) continue;
    const v = s.weightKg ? estimatedOneRepMax(s.weightKg, s.reps) : s.reps;
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

/**
 * True when the last three sessions (spread over at least two weeks) did no
 * better than the sessions before them. Sessions are newest first.
 */
export function isStalled(sessions: { date: string; sets: SetEntry[] }[]): boolean {
  const bests = sessions.map((s) => ({ date: s.date, best: sessionBest(s.sets) })).filter((s): s is { date: string; best: number } => s.best !== null);
  if (bests.length < 5) return false;
  if (daysBetween(bests[3]!.date, bests[0]!.date) < 14) return false;
  const recent = Math.max(...bests.slice(0, 3).map((b) => b.best));
  const before = Math.max(...bests.slice(3, 8).map((b) => b.best));
  return recent <= before * 1.01;
}

// ---------------------------------------------------------------------------
// This week's gaps

export const MAJOR_GROUPS: Record<string, string[]> = {
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  legs: ['quads', 'hamstrings', 'glutes'],
};

/**
 * Major muscle groups with no working sets this week (Monday to Sunday). Quiet
 * early in the week: it only speaks from Thursday, or once you've trained twice.
 */
export function weeklyGaps(setsByMuscle: Record<string, number>, workoutsThisWeek: number, today: string): string[] {
  const dayOfWeek = daysBetween(weekStart(today), today); // 0 = Monday
  if (dayOfWeek < 3 && workoutsThisWeek < 2) return [];
  if (workoutsThisWeek === 0) return [];
  const full = (setsByMuscle['full body'] ?? 0) > 0;
  return Object.entries(MAJOR_GROUPS)
    .filter(([, muscles]) => !full && muscles.every((m) => !setsByMuscle[m]))
    .map(([group]) => group);
}

// ---------------------------------------------------------------------------
// Strength goals

export type GoalProjection =
  | { status: 'reached'; currentKg: number }
  | { status: 'projected'; currentKg: number; perWeekKg: number; date: string; capped: boolean }
  | { status: 'flat'; currentKg: number }
  | { status: 'not-enough'; currentKg: number | null };

/** Fastest pace a projection will assume: 1.5% of your current strength a week. */
export const MAX_WEEKLY_GAIN = 0.015;

/**
 * When you'd reach a target one-rep max at your recent pace: a straight-line
 * trend through the last eight weeks of sessions, never faster than 1.5% a week.
 * An estimate to aim at, not a promise. Sessions are newest first.
 */
export function projectGoal(sessions: { date: string; sets: SetEntry[] }[], targetKg: number, today: string): GoalProjection {
  const pts = sessions
    .filter((s) => daysBetween(s.date, today) <= 56)
    .map((s) => ({ x: daysBetween(today, s.date), y: sessionBestKg(s.sets) }))
    .filter((p): p is { x: number; y: number } => p.y !== null);
  const latest = sessions.map((s) => sessionBestKg(s.sets)).find((v) => v !== null) ?? null;
  if (latest !== null && latest >= targetKg) return { status: 'reached', currentKg: latest };
  if (pts.length < 3 || Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) < 14) return { status: 'not-enough', currentKg: latest };
  const n = pts.length;
  const mx = pts.reduce((t, p) => t + p.x, 0) / n;
  const my = pts.reduce((t, p) => t + p.y, 0) / n;
  const slope = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  const current = Math.max(my + slope * (0 - mx), latest ?? 0);
  if (current >= targetKg) return { status: 'reached', currentKg: current };
  let perWeek = slope * 7;
  if (perWeek < current * 0.001) return { status: 'flat', currentKg: current };
  const capped = perWeek > current * MAX_WEEKLY_GAIN;
  if (capped) perWeek = current * MAX_WEEKLY_GAIN;
  const weeks = (targetKg - current) / perWeek;
  if (weeks > 104) return { status: 'flat', currentKg: current };
  return { status: 'projected', currentKg: current, perWeekKg: perWeek, date: addDays(today, Math.ceil(weeks * 7)), capped };
}

const sessionBestKg = (sets: SetEntry[]) => {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.done || s.warmup || !s.reps || !s.weightKg) continue;
    const v = estimatedOneRepMax(s.weightKg, s.reps);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
};

// ---------------------------------------------------------------------------
// A bit of fun for the finish screen

const THINGS: [one: string, many: string, kg: number][] = [
  ['car', 'cars', 1400],
  ['grand piano', 'grand pianos', 480],
  ['motorcycle', 'motorcycles', 200],
  ['fridge', 'fridges', 90],
  ['golden retriever', 'golden retrievers', 32],
  ['bowling ball', 'bowling balls', 7],
];

/** "That's about 6 grand pianos." Picks the biggest thing you lifted at least two of. */
export function volumeComparison(volumeKg: number): string | null {
  for (const [one, many, kg] of THINGS) {
    if (volumeKg / kg < 2) continue;
    const n = Math.round(volumeKg / kg);
    return `That’s about ${n} ${n === 1 ? one : many} lifted today.`;
  }
  return null;
}
