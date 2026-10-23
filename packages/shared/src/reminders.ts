// Smart reminders, planned on the phone from your own habits. They only nudge
// about meals you usually log, a while after you usually log them, and only
// if that meal is still empty. Pure functions: the app schedules what these return.
import { addDays } from './dates.ts';
import type { Meal } from './types.ts';

/** A meal counts as a habit when you logged it on at least this many of the last 28 days. */
export const HABIT_DAYS = 8;
/** Nudge this long after your usual time. */
export const NUDGE_AFTER_MIN = 60;
const QUIET_START = 6 * 60; // nothing before 6:00
const QUIET_END = 23 * 60; // or after 23:00
const DEFAULT_FINISH = 21 * 60 + 30;

export interface HabitPoint {
  date: string;
  meal: string;
  /** minutes after local midnight */
  minutes: number;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
};

/** Your usual time for each meal you log often enough to call it a habit. */
export function usualMealTimes(points: HabitPoint[]): Partial<Record<Meal, number>> {
  const byMeal = new Map<string, Map<string, number>>();
  for (const p of points) {
    const days = byMeal.get(p.meal) ?? new Map<string, number>();
    // The first time you logged that meal that day.
    days.set(p.date, Math.min(days.get(p.date) ?? Infinity, p.minutes));
    byMeal.set(p.meal, days);
  }
  const out: Partial<Record<Meal, number>> = {};
  for (const [meal, days] of byMeal) if (days.size >= HABIT_DAYS) out[meal as Meal] = median([...days.values()]);
  return out;
}

/** When you usually finish your day, from days you marked finished; 21:30 until there are a few. */
export function usualFinishTime(minutes: number[]): number {
  return minutes.length >= 3 ? median(minutes) : DEFAULT_FINISH;
}

export interface PlannedReminder {
  /** stable, so rescheduling replaces rather than duplicates */
  id: string;
  date: string;
  minutes: number;
  kind: 'meal' | 'finish';
  meal?: Meal;
}

const MEAL_WORD: Record<Meal, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'your snacks' };

export function reminderText(r: PlannedReminder): { title: string; body: string } {
  return r.kind === 'meal'
    ? { title: `Log ${MEAL_WORD[r.meal!]}?`, body: 'You usually have it logged by now. Already did it somewhere else? Ignore this.' }
    : { title: 'Finish today’s log?', body: 'Mark the day finished once everything’s in, so your daily-burn estimate can count it.' };
}

/**
 * Reminders for today and the next two days. Today's skip meals you've logged,
 * times that have passed, and the finish nudge if the day is empty or already
 * finished. Later days assume nothing is logged yet; the phone replans each
 * time the app opens or you log something.
 */
export function planReminders(opts: {
  today: string;
  nowMinutes: number;
  usual: Partial<Record<Meal, number>>;
  finishAt: number;
  loggedToday: Meal[];
  finishedToday: boolean;
  meals: boolean;
  finish: boolean;
  days?: number;
}): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const clamp = (m: number) => Math.min(QUIET_END, Math.max(QUIET_START, m));
  for (let i = 0; i < (opts.days ?? 3); i++) {
    const date = addDays(opts.today, i);
    const isToday = i === 0;
    if (opts.meals) {
      for (const [meal, usual] of Object.entries(opts.usual) as [Meal, number][]) {
        const at = clamp(usual + NUDGE_AFTER_MIN);
        if (isToday && (opts.loggedToday.includes(meal) || at <= opts.nowMinutes)) continue;
        out.push({ id: `forkbell-${date}-${meal}`, date, minutes: at, kind: 'meal', meal });
      }
    }
    if (opts.finish) {
      const at = clamp(opts.finishAt + 30);
      if (isToday && (opts.finishedToday || !opts.loggedToday.length || at <= opts.nowMinutes)) continue;
      out.push({ id: `forkbell-${date}-finish`, date, minutes: at, kind: 'finish' });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.minutes - b.minutes : a.date < b.date ? -1 : 1));
}
