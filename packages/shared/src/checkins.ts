// Weekly check-ins (food and training) and the training week planner, from
// the NutriTrace and LiftTrace forks. Rules only, so they're instant, work
// offline and can be tested. Encouraging either way; never below 1,200 kcal,
// never faster than about 1% of body weight a week.
import { addDays } from './dates.ts';
import { KCAL_PER_KG, MIN_SUGGESTED_KCAL, weekStart } from './progress.ts';
import { MAJOR_GROUPS } from './training-coach.ts';
import type { Program, Routine } from './training.ts';

// Food --------------------------------------------------------------------------------

export interface FoodWeek {
  /** the 7 days before today, oldest first; kcal null where nothing was logged */
  days: { date: string; kcal: number | null; sodium: number | null; fiber: number | null }[];
  burn: number | null;
  /** smoothed weight a week ago and yesterday */
  trendFromKg: number | null;
  trendToKg: number | null;
  goalKg: number | null;
  goalDate: string | null;
  calorieGoal: number | null;
  today: string;
  /** how weights are shown in the text */
  unit?: 'lb' | 'kg';
}

export interface FoodCheckIn {
  weekOf: string;
  loggedDays: number;
  avgKcal: number | null;
  /** what the logged food should have done to your weight, and what the trend did */
  expectedKg: number | null;
  actualKg: number | null;
  verdict: string;
  /** a calorie goal to try, when a change is worth making */
  suggestion: { kcal: number; delta: number; why: string } | null;
  sodium: { avg: number; daysOver: number } | null;
  fiber: { avg: number; daysUnder: number } | null;
}

const r10 = (n: number) => Math.round(n / 10) * 10;

export function foodCheckIn(w: FoodWeek): FoodCheckIn {
  const logged = w.days.filter((d) => d.kcal !== null && d.kcal > 0);
  const avgKcal = logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal!, 0) / logged.length) : null;
  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0);
  const sodiumDays = logged.filter((d) => d.sodium !== null).map((d) => d.sodium!);
  const fiberDays = logged.filter((d) => d.fiber !== null).map((d) => d.fiber!);
  const base = {
    weekOf: weekStart(w.today),
    loggedDays: logged.length,
    avgKcal,
    sodium: sodiumDays.length ? { avg: avg(sodiumDays), daysOver: sodiumDays.filter((s) => s > 2300).length } : null,
    fiber: fiberDays.length ? { avg: avg(fiberDays), daysUnder: fiberDays.filter((f) => f < 28).length } : null,
  };
  if (logged.length < 4) {
    return { ...base, expectedKg: null, actualKg: null, verdict: `You logged ${logged.length} of the last 7 days. Log at least 4 to get a check-in you can trust.`, suggestion: null };
  }
  const expectedKg = w.burn !== null && avgKcal !== null ? Math.round((((avgKcal - w.burn) * 7) / KCAL_PER_KG) * 100) / 100 : null;
  const actualKg = w.trendFromKg !== null && w.trendToKg !== null ? Math.round((w.trendToKg - w.trendFromKg) * 100) / 100 : null;
  if (actualKg === null || w.burn === null) {
    return { ...base, expectedKg, actualKg, verdict: `Average ${avgKcal!.toLocaleString()} kcal on ${logged.length} days. Weigh in a few times a week and the check-in will compare it with your weight.`, suggestion: null };
  }

  const current = w.trendToKg!;
  // The pace to aim for: what the goal date needs, else a steady default; capped at 1% a week.
  let targetKg = 0; // per week, + gain / - lose
  if (w.goalKg !== null && Math.abs(w.goalKg - current) > 0.3) {
    const toGo = w.goalKg - current;
    const weeksLeft = w.goalDate ? Math.max(1, (Date.parse(w.goalDate) - Date.parse(w.today)) / (7 * 86400000)) : null;
    const wanted = weeksLeft ? toGo / weeksLeft : toGo < 0 ? -current * 0.005 : current * 0.0025;
    targetKg = Math.sign(toGo) * Math.min(Math.abs(wanted), current * 0.01);
  }
  const gap = actualKg - targetKg; // + means heavier than planned
  // Turn the difference into calories a day, in steps of 50, at most 300 at a time.
  const perDay = Math.max(-300, Math.min(300, Math.round(((gap * KCAL_PER_KG) / 7) / 50) * 50));
  const fmt = (kg: number) => {
    const v = w.unit === 'lb' ? kg * 2.20462 : kg;
    return `${v > 0 ? '+' : ''}${v.toFixed(1)} ${w.unit ?? 'kg'}`;
  };
  const parts = `You averaged ${avgKcal!.toLocaleString()} kcal on ${logged.length} days against a burn of about ${w.burn.toLocaleString()}. Your trend moved ${fmt(actualKg)} this week${targetKg ? ` (plan: ${fmt(targetKg)})` : ''}.`;

  let suggestion: FoodCheckIn['suggestion'] = null;
  let verdict: string;
  if (!targetKg) {
    verdict = Math.abs(actualKg) < 0.25 ? `${parts} Steady, which is right for maintaining.` : `${parts} ${actualKg > 0 ? 'Drifting up' : 'Drifting down'} a little; one week is often water, so watch next week.`;
  } else if (Math.abs(perDay) < 100) {
    verdict = `${parts} Right on track. Keep going.`;
  } else {
    // The intake that gives the planned pace with the burn measured from your own logs.
    const target = r10(Math.max(MIN_SUGGESTED_KCAL, w.burn + (targetKg * KCAL_PER_KG) / 7));
    const delta = w.calorieGoal ? target - w.calorieGoal : 0;
    const vsAvg = target - avgKcal!;
    if (w.calorieGoal && Math.abs(delta) >= 50) {
      suggestion = { kcal: target, delta, why: vsAvg < 0 ? 'Progress was slower than your plan.' : 'You moved faster than your plan; a bit more food makes it easier to keep up.' };
    }
    verdict = `${parts} About ${target.toLocaleString()} kcal a day would match your plan (${vsAvg < 0 ? `${Math.abs(vsAvg)} less` : `${vsAvg} more`} than you've been eating).`;
    if (target === MIN_SUGGESTED_KCAL && vsAvg < 0) verdict += ' That’s the 1,200 kcal floor; a later goal date or more activity is the safer way to speed up.';
    if (!w.calorieGoal) verdict += ' Set a calorie goal to apply it.';
  }
  return { ...base, expectedKg, actualKg, verdict, suggestion };
}

// Training ----------------------------------------------------------------------------

export interface TrainingWeek {
  weekOf: string;
  workouts: number;
  weeklyGoal: number;
  sets: number;
  /** working sets per muscle */
  muscles: Record<string, number>;
  /** exercises whose top set had an RPE, and how many of those were RPE 9+ */
  ratedTopSets: number;
  hardTopSets: number;
}

export interface TrainingCheckIn {
  headline: string;
  advice: string;
  tone: 'good' | 'hold' | 'nudge';
}

/** One adjustment for the coming week, in order: a very hard week, consistency, too much, too little, else progress. */
export function trainingCheckIn(w: TrainingWeek): TrainingCheckIn {
  const headline = `${w.workouts} of ${w.weeklyGoal} workouts · ${w.sets} working sets`;
  if (w.ratedTopSets >= 3 && w.hardTopSets / w.ratedTopSets > 0.5) {
    return { headline, tone: 'hold', advice: 'Most of your top sets were RPE 9 or harder. Hold your weights this week, or take a lighter week; don’t add load yet.' };
  }
  if (w.workouts < w.weeklyGoal) {
    return { headline, tone: 'nudge', advice: w.workouts === 0 ? 'A quiet week. Any session this week counts; a short one is better than none.' : `${w.weeklyGoal - w.workouts} short of your goal. Plan the days now (Your week) so they happen.` };
  }
  const group = (names: string[]) => names.reduce((s, m) => s + (w.muscles[m] ?? 0), 0);
  const heavy = Object.entries(MAJOR_GROUPS).find(([, ms]) => group(ms) > 20);
  if (heavy) return { headline, tone: 'nudge', advice: `${group(heavy[1])} sets for ${heavy[0]} is a lot for one week. Trim a few; recovery is where you get stronger.` };
  const light = Object.entries(MAJOR_GROUPS).find(([, ms]) => group(ms) < 10);
  if (light) return { headline, tone: 'nudge', advice: `Only ${group(light[1])} sets for ${light[0]}. About 10 a week keeps it growing; add a few.` };
  return { headline, tone: 'good', advice: 'Solid week. Where you hit every rep, add a little weight next time.' };
}

// Your week ---------------------------------------------------------------------------

export interface PlannedDay {
  date: string;
  /** 0 = Sunday */
  weekday: number;
  routine: Routine | null;
  /** you already finished a workout on this day */
  done: string | null;
}

/**
 * Lay the program's workouts over the next 7 days on your training days, in
 * order, continuing after the last one you finished, so a missed day moves the
 * plan along instead of skipping a workout.
 */
export function planTrainingWeek(program: Program | null, trainingDays: number[], today: string, finished: { date: string; name: string }[]): PlannedDay[] {
  const order = program?.routines ?? [];
  let i = Math.max(0, order.findIndex((r) => r.id === program?.nextRoutineId));
  return Array.from({ length: 7 }, (_, k) => {
    const date = addDays(today, k);
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const done = finished.find((f) => f.date === date)?.name ?? null;
    if (done) return { date, weekday, routine: null, done };
    if (!order.length || !trainingDays.includes(weekday)) return { date, weekday, routine: null, done: null };
    const routine = order[i % order.length]!;
    i++;
    return { date, weekday, routine, done: null };
  });
}

/** A starter program for how many days a week you train. */
export function starterFor(daysPerWeek: number): string {
  return daysPerWeek <= 3 ? 'full-body-3' : daysPerWeek === 4 ? 'upper-lower-4' : 'ppl-6';
}
