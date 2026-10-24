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

// Medication reminders --------------------------------------------------------
// Unlike the meal nudges these are at the times you set, every day, because a
// dose isn't a habit to learn. Today's skip any dose you've already ticked off.

/**
 * A time as typed ("8", "8:30", "830", "8:30pm", "8 pm", "20:30") to "HH:MM",
 * or null if it isn't one.
 */
export function parseClock(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const half = m[3]?.[0];
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    if (half === 'a' && h === 12) h = 0;
    if (half === 'p' && h < 12) h += 12;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "20:30" to "8:30 PM" (or "20:30" for a 24-hour phone). */
export function formatClock(hhmm: string, twentyFour = false): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  if (twentyFour) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const clockMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export interface MedForReminders {
  id: string;
  name: string;
  dose: string | null;
  notes: string | null;
  active: boolean;
  /** "HH:MM" per dose; a dose without a time has no reminder */
  reminderTimes: (string | null)[];
  /** today's doses: taken, skipped, or not yet */
  today: ('taken' | 'skipped' | null)[];
}

export interface PlannedDose {
  id: string;
  date: string;
  minutes: number;
  medicationId: string;
  slot: number;
  title: string;
  body: string;
}

/** Each dose with a time, today and the next days. Paused medications and ticked-off doses are left out. */
export function planMedReminders(opts: { meds: MedForReminders[]; today: string; nowMinutes: number; days?: number; max?: number }): PlannedDose[] {
  const out: PlannedDose[] = [];
  for (let i = 0; i < (opts.days ?? 3); i++) {
    const date = addDays(opts.today, i);
    for (const m of opts.meds) {
      if (!m.active) continue;
      m.reminderTimes.forEach((time, slot) => {
        if (!time) return;
        const minutes = clockMinutes(time);
        if (i === 0 && (m.today[slot] || minutes <= opts.nowMinutes)) return;
        const doses = m.reminderTimes.filter(Boolean).length;
        out.push({
          id: `forkbell-med-${m.id}-${date}-${slot}`,
          date,
          minutes,
          medicationId: m.id,
          slot,
          title: `Time for ${m.name}`,
          body: [m.dose, doses > 1 ? `dose ${slot + 1} of ${doses}` : null, m.notes].filter(Boolean).join(' · ') || 'Tap Taken once you’ve had it.',
        });
      });
    }
  }
  out.sort((a, b) => (a.date === b.date ? a.minutes - b.minutes : a.date < b.date ? -1 : 1));
  // Phones only keep so many scheduled notifications; the soonest matter most.
  return out.slice(0, opts.max ?? 40);
}
