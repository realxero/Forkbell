import { z } from 'zod';
import { addDays } from './dates.ts';
import { dateSchema } from './schemas.ts';
import { KG_PER_LB, formatWeight, type WeightUnit } from './training.ts';

/** Energy in a kilogram of body weight change, the usual working figure. */
export const KCAL_PER_KG = 7700;

export interface WeighIn {
  date: string;
  weightKg: number;
  bodyFat: number | null;
}

export interface TrendPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);

/**
 * A smoothed weight that ignores day-to-day water swings: each weigh-in moves
 * it 10% of the way per day since the last one. One heavy morning barely
 * moves it; a real change shows up within a couple of weeks.
 */
export function weightTrend(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let last: string | null = null;
  for (const w of sorted) {
    if (trend === null || last === null) trend = w.weightKg;
    else {
      const gap = Math.max(1, daysBetween(last, w.date));
      trend += (1 - Math.pow(0.9, gap)) * (w.weightKg - trend);
    }
    last = w.date;
    out.push({ date: w.date, weightKg: w.weightKg, trendKg: trend });
  }
  return out;
}

/** The trend as of a date (the last weigh-in on or before it), or null. */
export function trendOn(series: TrendPoint[], date: string): TrendPoint | null {
  let found: TrendPoint | null = null;
  for (const p of series) {
    if (p.date > date) break;
    found = p;
  }
  return found;
}

export interface EnergyEstimate {
  /** estimated calories burned per day, or null when there isn't enough data yet */
  kcal: number | null;
  /** kg per week, + gaining, - losing, over the same days */
  rateKgPerWeek: number | null;
  loggedDays: number;
  spanDays: number;
  confidence: 'low' | 'medium' | 'high' | null;
  /** what's missing, when kcal is null */
  needs: string | null;
}

/**
 * Adaptive energy expenditure: what you ate against how your trend weight
 * moved. Eating 2,500 a day while the trend drops half a kilo a week means
 * you burn about 2,500 + 0.5 × 7,700 / 7 ≈ 3,050. Today is left out because
 * it isn't finished. Days with nothing logged are skipped, not counted as zero.
 */
export function estimateEnergy(intake: Record<string, number>, series: TrendPoint[], today: string, windowDays = 28): EnergyEstimate {
  const end = addDays(today, -1);
  let start = addDays(end, -(windowDays - 1));
  const first = series[0];
  if (first && first.date > start) start = first.date;
  const empty = (needs: string, loggedDays = 0, spanDays = 0): EnergyEstimate => ({ kcal: null, rateKgPerWeek: null, loggedDays, spanDays, confidence: null, needs });

  const startPoint = trendOn(series, start);
  const endPoint = trendOn(series, end);
  const spanDays = startPoint && endPoint ? daysBetween(startPoint.date, endPoint.date) : 0;
  const logged = Object.entries(intake).filter(([d, kcal]) => d >= start && d <= end && kcal > 0);
  if (!startPoint || !endPoint || spanDays < 10) {
    const have = series.filter((p) => p.date <= end).length;
    return empty(have < 2 ? 'Weigh in a few times a week for two weeks.' : `Keep weighing in: ${Math.max(1, 10 - spanDays)} more days of weigh-ins needed.`, logged.length, spanDays);
  }
  if (logged.length < 10) return empty(`Log your food on ${10 - logged.length} more days.`, logged.length, spanDays);

  const avgIntake = logged.reduce((s, [, k]) => s + k, 0) / logged.length;
  const changeKg = endPoint.trendKg - startPoint.trendKg;
  const kcal = avgIntake - (changeKg * KCAL_PER_KG) / spanDays;
  if (!(kcal > 800 && kcal < 7000)) return empty('The numbers so far don’t add up yet. Keep logging every day.', logged.length, spanDays);
  const score = Math.min(logged.length, spanDays);
  return {
    kcal: Math.round(kcal / 10) * 10,
    rateKgPerWeek: (changeKg / spanDays) * 7,
    loggedDays: logged.length,
    spanDays,
    confidence: score >= 21 ? 'high' : score >= 14 ? 'medium' : 'low',
    needs: null,
  };
}

export interface GoalPlan {
  remainingKg: number;
  reached: boolean;
  /** estimated date range at your recent pace, when you're heading the right way */
  estimate: { from: string; to: string } | null;
  /** when not heading toward the goal */
  pace: 'toward' | 'away' | 'flat' | 'unknown';
  /** calories a day to reach the goal date, if one is set and the burn is known */
  kcalForDate: number | null;
  /** a calorie goal that fits the goal at a sustainable pace */
  suggestedKcal: number | null;
  warnings: string[];
}

/** Never suggest below this; very low intakes need a professional's eye. */
export const MIN_SUGGESTED_KCAL = 1200;

export function planGoal(opts: { currentKg: number; goalKg: number; goalDate: string | null; today: string; energy: EnergyEstimate; unit?: WeightUnit }): GoalPlan {
  const { currentKg, goalKg, goalDate, today, energy, unit = 'kg' } = opts;
  const remainingKg = goalKg - currentKg;
  const warnings: string[] = [];
  const reached = Math.abs(remainingKg) < 0.3;
  const losing = remainingKg < 0;

  let pace: GoalPlan['pace'] = 'unknown';
  let estimate: GoalPlan['estimate'] = null;
  const rate = energy.rateKgPerWeek;
  if (rate !== null && !reached) {
    if (Math.abs(rate) < 0.05) pace = 'flat';
    else if (Math.sign(rate) === Math.sign(remainingKg)) {
      pace = 'toward';
      const weeks = remainingKg / rate;
      // A range, not a promise: pace drifts as you go.
      estimate = { from: addDays(today, Math.round((weeks / 1.25) * 7)), to: addDays(today, Math.round((weeks / 0.75) * 7)) };
    } else pace = 'away';
  }

  // Sustainable pace: lose about 0.5% of body weight a week, or gain about 0.25%.
  let suggestedKcal: number | null = null;
  if (energy.kcal !== null) {
    if (reached) suggestedKcal = energy.kcal;
    else {
      const weekly = currentKg * (losing ? -0.005 : 0.0025);
      suggestedKcal = Math.round((energy.kcal + (weekly * KCAL_PER_KG) / 7) / 10) * 10;
    }
    if (suggestedKcal < MIN_SUGGESTED_KCAL) suggestedKcal = MIN_SUGGESTED_KCAL;
  }

  let kcalForDate: number | null = null;
  if (goalDate && !reached) {
    const days = daysBetween(today, goalDate);
    if (days <= 0) warnings.push('Your goal date has passed. Pick a new one, or clear it.');
    else {
      const perWeek = (remainingKg / days) * 7;
      if (Math.abs(perWeek) > currentKg * 0.01)
        warnings.push(`That date needs about ${formatWeight(Math.abs(perWeek), unit)} ${unit} a week, faster than the usual limit of 1% of body weight a week. A later date is easier to stick to.`);
      if (energy.kcal !== null) {
        const needed = Math.round((energy.kcal + (remainingKg * KCAL_PER_KG) / days) / 10) * 10;
        // A number under the floor is never shown as a target, only the warning.
        if (needed < MIN_SUGGESTED_KCAL) warnings.push(`That date would mean eating under ${MIN_SUGGESTED_KCAL.toLocaleString()} kcal a day. Talk to a doctor or dietitian before going that low.`);
        else kcalForDate = needed;
      }
    }
  }
  return { remainingKg, reached, estimate, pace, kcalForDate, suggestedKcal, warnings };
}

export interface Streaks {
  /** days in a row with food logged, counting today only once it has food */
  foodDays: number;
  bestFoodDays: number;
  /** weeks in a row that met your weekly workout goal; this week only adds once it's met */
  workoutWeeks: number;
  bestWorkoutWeeks: number;
  workoutsThisWeek: number;
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export function computeStreaks(loggedDates: string[], workoutDates: string[], weeklyGoal: number, today: string): Streaks {
  const logged = new Set(loggedDates);
  let foodDays = 0;
  for (let d = logged.has(today) ? today : addDays(today, -1); logged.has(d); d = addDays(d, -1)) foodDays++;
  let bestFoodDays = 0;
  for (const d of [...logged].sort()) {
    if (logged.has(addDays(d, -1))) continue;
    let n = 0;
    for (let x = d; logged.has(x); x = addDays(x, 1)) n++;
    bestFoodDays = Math.max(bestFoodDays, n);
  }

  const perWeek = new Map<string, number>();
  for (const d of workoutDates) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const thisWeek = weekStart(today);
  const met = (w: string) => (perWeek.get(w) ?? 0) >= weeklyGoal;
  let workoutWeeks = 0;
  // The current week never breaks a streak; it only adds once the goal is met.
  for (let w = addDays(thisWeek, -7); met(w); w = addDays(w, -7)) workoutWeeks++;
  if (met(thisWeek)) workoutWeeks++;
  let bestWorkoutWeeks = 0;
  for (const w of [...perWeek.keys()].sort()) {
    if (!met(w) || met(addDays(w, -7))) continue;
    let n = 0;
    for (let x = w; met(x); x = addDays(x, 7)) n++;
    bestWorkoutWeeks = Math.max(bestWorkoutWeeks, n);
  }
  return { foodDays, bestFoodDays: Math.max(bestFoodDays, foodDays), workoutWeeks, bestWorkoutWeeks: Math.max(bestWorkoutWeeks, workoutWeeks), workoutsThisWeek: perWeek.get(thisWeek) ?? 0 };
}

export interface Milestone {
  key: string;
  label: string;
  detail: string | null;
  reached: boolean;
  date: string | null;
}

// Something familiar to picture each step by (in pounds; kilogram steps use the nearest).
const PICTURE: Record<number, string> = {
  5: 'a bag of flour',
  10: 'a house cat',
  15: 'a bowling ball',
  20: 'a car tire',
  25: 'a full suitcase',
  30: 'a big bag of dog food',
  40: 'a sack of potatoes and then some',
  50: 'a bag of cement',
};

/**
 * Milestones for logging, training and progress toward a goal weight. Weight
 * milestones use the trend, so a single light morning can't fake one and a
 * heavy one can't take it away.
 */
export function milestones(opts: { loggedDates: string[]; workoutDates: string[]; series: TrendPoint[]; goalKg: number | null; unit: WeightUnit }): Milestone[] {
  const out: Milestone[] = [];
  const days = [...new Set(opts.loggedDates)].sort();
  for (const n of [1, 7, 30, 100, 365]) {
    out.push({ key: `days-${n}`, label: n === 1 ? 'First day logged' : `${n} days logged`, detail: null, reached: days.length >= n, date: days[n - 1] ?? null });
  }
  const workouts = [...opts.workoutDates].sort();
  for (const n of [1, 10, 25, 50, 100]) {
    out.push({ key: `workouts-${n}`, label: n === 1 ? 'First workout' : `${n} workouts`, detail: null, reached: workouts.length >= n, date: workouts[n - 1] ?? null });
  }

  const start = opts.series[0];
  if (start && opts.goalKg !== null && Math.abs(opts.goalKg - start.trendKg) >= 1) {
    const dir = Math.sign(opts.goalKg - start.trendKg);
    const stepUnits = opts.unit === 'lb' ? 5 : 2.5;
    const stepKg = opts.unit === 'lb' ? 5 * KG_PER_LB : 2.5;
    const total = Math.abs(opts.goalKg - start.trendKg);
    const verb = dir < 0 ? 'down' : 'up';
    for (let i = 1; i * stepKg <= total + 1e-9 && i <= 30; i++) {
      const target = start.trendKg + dir * i * stepKg;
      const hit = opts.series.find((p) => (dir < 0 ? p.trendKg <= target : p.trendKg >= target));
      const amount = i * stepUnits;
      const lb = opts.unit === 'lb' ? amount : Math.round(amount / KG_PER_LB / 5) * 5;
      out.push({
        key: `weight-${amount}`,
        label: `${amount} ${opts.unit} ${verb}`,
        detail: PICTURE[lb] ? `About the weight of ${PICTURE[lb]}.` : null,
        reached: Boolean(hit),
        date: hit?.date ?? null,
      });
    }
    const goalHit = opts.series.find((p) => (dir < 0 ? p.trendKg <= opts.goalKg! : p.trendKg >= opts.goalKg!));
    out.push({ key: 'goal', label: 'Goal weight reached', detail: null, reached: Boolean(goalHit), date: goalHit?.date ?? null });
  }
  return out;
}

// Health platforms ---------------------------------------------------------------------

export const HEALTH_KINDS = ['steps', 'active_kcal', 'resting_kcal', 'resting_hr'] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];
export type HealthSource = 'apple_health' | 'health_connect';

export const healthImportSchema = z.object({
  source: z.enum(['apple_health', 'health_connect']),
  days: z.array(z.object({ date: dateSchema, kind: z.enum(HEALTH_KINDS), value: z.number().min(0).max(999999) })).max(1000),
  weights: z.array(z.object({ date: dateSchema, weightKg: z.number().min(20).max(400), bodyFat: z.number().min(2).max(70).nullish() })).max(400),
});
export type HealthImport = z.infer<typeof healthImportSchema>;

export interface Activity {
  today: { steps: number | null; activeKcal: number | null };
  /** averages over the last 7 full days with data */
  week: { steps: number | null; activeKcal: number | null };
  restingHr: number | null;
  source: HealthSource | null;
}

// Goal presets ------------------------------------------------------------------------
export type GoalPreset = 'lose' | 'maintain' | 'gain';
/**
 * Starting goals from your measured burn and trend weight: lose about 0.5% of
 * body weight a week, maintain, or gain about 0.25%. Protein 1.6 g per kg,
 * fat about 28% of calories, carbs the rest. Never below 1,200 kcal.
 */
export function presetGoals(preset: GoalPreset, burnKcal: number, weightKg: number) {
  const weekly = preset === 'lose' ? -0.005 : preset === 'gain' ? 0.0025 : 0;
  const kcal = Math.max(MIN_SUGGESTED_KCAL, Math.round((burnKcal + (weightKg * weekly * KCAL_PER_KG) / 7) / 10) * 10);
  const protein = Math.round(weightKg * 1.6);
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}
