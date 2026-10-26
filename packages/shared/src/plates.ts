// Plate maths: what to load on each side of a bar or plate-loaded machine to
// reach a weight, with the plates your gym actually has. Weights are worked
// in the unit you use (lb plates in lb, kg plates in kg), never converted.
import type { WeightUnit } from './training.ts';

export interface Bar {
  id: string;
  name: string;
  /** what the bar or empty sled weighs, in the unit it's listed in */
  weight: number;
  unit: WeightUnit;
  /** plates go on both sides (a bar, a leg press) or one (a landmine/T-bar row) */
  sides: 1 | 2;
  custom?: boolean;
}

/** Common bars and plate-loaded machines. Machines vary a lot: check yours and add it as custom. */
export const BARS: Bar[] = [
  { id: 'olympic-lb', name: 'Olympic bar', weight: 45, unit: 'lb', sides: 2 },
  { id: 'womens-lb', name: 'Women’s bar', weight: 35, unit: 'lb', sides: 2 },
  { id: 'ez-lb', name: 'EZ curl bar', weight: 25, unit: 'lb', sides: 2 },
  { id: 'trap-lb', name: 'Trap / hex bar', weight: 55, unit: 'lb', sides: 2 },
  { id: 'smith-lb', name: 'Smith machine (typical)', weight: 20, unit: 'lb', sides: 2 },
  { id: 'legpress-lb', name: 'Leg press sled (typical)', weight: 100, unit: 'lb', sides: 2 },
  { id: 'hack-lb', name: 'Hack squat sled (typical)', weight: 75, unit: 'lb', sides: 2 },
  { id: 'tbar-lb', name: 'T-bar row / landmine', weight: 0, unit: 'lb', sides: 1 },
  { id: 'none-lb', name: 'No bar (plates only)', weight: 0, unit: 'lb', sides: 2 },
  { id: 'olympic-kg', name: 'Olympic bar', weight: 20, unit: 'kg', sides: 2 },
  { id: 'womens-kg', name: 'Women’s bar', weight: 15, unit: 'kg', sides: 2 },
  { id: 'ez-kg', name: 'EZ curl bar', weight: 10, unit: 'kg', sides: 2 },
  { id: 'trap-kg', name: 'Trap / hex bar', weight: 25, unit: 'kg', sides: 2 },
  { id: 'smith-kg', name: 'Smith machine (typical)', weight: 10, unit: 'kg', sides: 2 },
  { id: 'legpress-kg', name: 'Leg press sled (typical)', weight: 45, unit: 'kg', sides: 2 },
  { id: 'hack-kg', name: 'Hack squat sled (typical)', weight: 35, unit: 'kg', sides: 2 },
  { id: 'tbar-kg', name: 'T-bar row / landmine', weight: 0, unit: 'kg', sides: 1 },
  { id: 'none-kg', name: 'No bar (plates only)', weight: 0, unit: 'kg', sides: 2 },
];

/** A typical gym's plates, per side (pairs). */
export const DEFAULT_PLATES: Record<WeightUnit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export interface PlateLoad {
  /** plates on ONE side, heaviest first (for sides: 1, the only side) */
  perSide: number[];
  /** the weight this loads */
  total: number;
  /** target minus total; 0 when exact */
  short: number;
  /** the nearest weights you can load, below and above, when it isn't exact */
  nearest: { below: number; above: number | null } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plates for a target weight. Greedy from the heaviest plate, which is exact
 * for normal plate sets; `plates` are the sizes you have (assume enough of each).
 */
export function loadPlates(target: number, bar: Pick<Bar, 'weight' | 'sides'>, plates: number[]): PlateLoad {
  const sizes = [...new Set(plates)].filter((p) => p > 0).sort((a, b) => b - a);
  const perSideTarget = (target - bar.weight) / bar.sides;
  const perSide: number[] = [];
  let left = Math.max(0, perSideTarget);
  for (const p of sizes) {
    while (left + 1e-9 >= p) {
      perSide.push(p);
      left = r2(left - p);
    }
  }
  const total = r2(bar.weight + perSide.reduce((a, b) => a + b, 0) * bar.sides);
  const short = r2(target - total);
  let nearest: PlateLoad['nearest'] = null;
  if (short > 0.001) {
    const smallest = sizes.at(-1);
    nearest = { below: total, above: smallest ? r2(total + smallest * bar.sides) : null };
  }
  return { perSide, total, short, nearest };
}

/** Round a weight to what can actually be loaded (the smallest jump is two of the smallest plate). */
export function loadable(weight: number, bar: Pick<Bar, 'weight' | 'sides'>, plates: number[]) {
  const step = Math.min(...plates.filter((p) => p > 0)) * bar.sides;
  if (!Number.isFinite(step) || step <= 0) return weight;
  return Math.max(bar.weight, r2(bar.weight + Math.round((weight - bar.weight) / step) * step));
}

export interface WarmupSet {
  weight: number;
  reps: number;
}

/**
 * Warm-up sets before a working weight: the empty bar, then about 40%, 60%
 * and 80%, each a little lighter in reps, loadable with your plates. Light
 * working weights get fewer warm-ups.
 */
export function warmupSets(working: number, bar: Pick<Bar, 'weight' | 'sides'>, plates: number[]): WarmupSet[] {
  if (!(working > 0)) return [];
  const out: WarmupSet[] = [];
  if (bar.weight > 0 && working > bar.weight * 1.15) out.push({ weight: bar.weight, reps: 10 });
  for (const [share, reps] of [[0.4, 5], [0.6, 3], [0.8, 2]] as const) {
    const w = loadable(working * share, bar, plates);
    if (w <= (out.at(-1)?.weight ?? 0) || w >= working || w < bar.weight) continue;
    out.push({ weight: w, reps });
  }
  // Light lifts: one or two warm-ups is plenty.
  return working < bar.weight * 2 && bar.weight > 0 ? out.slice(0, 2) : out;
}
