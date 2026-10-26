// Supersets, circuits and drop sets: which exercises go back to back, and
// what happens after you tick a set (rest, or go straight to the next one).
import type { WorkoutExercise } from './training.ts';

type Group = number | null | undefined;

/**
 * Clean up superset numbers: a superset is a run of neighbours with the same
 * number. Runs of one aren't supersets; numbers are renumbered 1, 2, 3 in
 * order. The same number in two places is two supersets.
 */
export function tidySupersets(groups: Group[]): (number | null)[] {
  const out: (number | null)[] = groups.map(() => null);
  let next = 1;
  for (let i = 0; i < groups.length; ) {
    const g = groups[i];
    let j = i + 1;
    if (g != null) while (j < groups.length && groups[j] === g) j++;
    if (g != null && j - i >= 2) {
      for (let k = i; k < j; k++) out[k] = next;
      next++;
    }
    i = j;
  }
  return out;
}

/** The indexes of the superset an exercise is in (just itself when it isn't in one). */
export function supersetRun(groups: Group[], i: number): number[] {
  const g = groups[i];
  if (g == null) return [i];
  let a = i;
  let b = i;
  while (a > 0 && groups[a - 1] === g) a--;
  while (b < groups.length - 1 && groups[b + 1] === g) b++;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** "Superset with the next exercise": join it (and its own superset, if any) to this one's. */
export function linkWithNext(groups: Group[], i: number): (number | null)[] {
  if (i < 0 || i >= groups.length - 1) return tidySupersets(groups);
  const list = [...groups];
  const g = list[i] ?? Math.max(0, ...list.map((x) => x ?? 0)) + 1;
  list[i] = g;
  for (const k of supersetRun(list, i + 1)) list[k] = g;
  return tidySupersets(list);
}

/** "Leave the superset". */
export function leaveSuperset(groups: Group[], i: number): (number | null)[] {
  const list = [...groups];
  list[i] = null;
  return tidySupersets(list);
}

/** "A", "B", "C"... for showing a superset. */
export const supersetLetter = (n: number) => String.fromCharCode(64 + Math.min(26, Math.max(1, n)));

export interface AfterSet {
  /** seconds to rest now (0: go straight on) */
  rest: number;
  /** the exercise to do next, or null when everything is ticked */
  next: number | null;
  /** drop: the next set is a drop set; superset: on to the next exercise in the superset; rest: a normal rest */
  why: 'drop' | 'superset' | 'rest';
}

const hasUndone = (e: Pick<WorkoutExercise, 'sets'>) => e.sets.some((s) => !s.done);

/**
 * After ticking set k of exercise i. A drop set comes straight after the set
 * before it. In a superset you go straight to the next exercise in it, and
 * rest once after the last, for the longest rest time of the group.
 */
export function afterSet(list: Pick<WorkoutExercise, 'sets' | 'restSeconds' | 'superset'>[], i: number, k: number): AfterSet {
  const e = list[i]!;
  const set = e.sets[k];
  const following = e.sets[k + 1];
  if (following && following.drop && !following.done) return { rest: 0, next: i, why: 'drop' };
  const later = (from: number) => list.findIndex((x, j) => j >= from && hasUndone(x));
  const groups = list.map((x) => x.superset ?? null);
  const run = supersetRun(groups, i);
  if (run.length > 1 && !set?.warmup) {
    const onward = run.find((j) => j > i && hasUndone(list[j]!));
    if (onward !== undefined) return { rest: 0, next: onward, why: 'superset' };
    const rest = Math.max(...run.map((j) => list[j]!.restSeconds));
    const back = run.find((j) => hasUndone(list[j]!));
    const next = back ?? later(run.at(-1)! + 1);
    return { rest, next: next < 0 ? null : next, why: 'rest' };
  }
  const next = hasUndone(e) ? i : later(i + 1);
  return { rest: e.restSeconds, next: next < 0 ? null : next, why: 'rest' };
}

/** Tapping a set's number: working → warm-up (W) → drop set (D) → working. The first set can't be a drop set. */
export function nextSetKind(set: { warmup: boolean; drop?: boolean }, isFirst: boolean): { warmup: boolean; drop: boolean } {
  if (set.drop) return { warmup: false, drop: false };
  if (set.warmup) return isFirst ? { warmup: false, drop: false } : { warmup: false, drop: true };
  return { warmup: true, drop: false };
}
