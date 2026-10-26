// Fasting: a timer from your last meal toward a goal in hours, and a streak of
// fasts that reached their goal. Optional, and off until you turn it on.
import { addDays } from './dates.ts';

export const FAST_PRESETS = [12, 14, 16, 18, 20, 24] as const;

export interface Fast {
  id: string;
  startedAt: string;
  endedAt: string | null;
  targetHours: number;
}

export interface Fasts {
  /** the fast going now, if any */
  open: Fast | null;
  /** the last few finished ones, newest first */
  recent: Fast[];
  /** days in a row ending with a fast that reached its goal */
  streak: number;
}

export interface FastProgress {
  hours: number;
  /** 0 to 1 */
  fraction: number;
  done: boolean;
  remainingMinutes: number;
}

export function fastProgress(f: Pick<Fast, 'startedAt' | 'endedAt' | 'targetHours'>, now = Date.now()): FastProgress {
  const end = f.endedAt ? Date.parse(f.endedAt) : now;
  const hours = Math.max(0, end - Date.parse(f.startedAt)) / 3_600_000;
  return { hours, fraction: Math.min(1, hours / f.targetHours), done: hours >= f.targetHours - 1e-6, remainingMinutes: Math.max(0, Math.ceil((f.targetHours - hours) * 60)) };
}

/** "16h 05m". */
export const hoursText = (hours: number) => `${Math.floor(hours)}h ${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}m`;

/** The local day an instant falls on, in this device's (or server's) time zone. */
const localDay = (iso: string, offsetMinutes?: number) => {
  const t = new Date(Date.parse(iso) - (offsetMinutes ?? new Date(iso).getTimezoneOffset()) * 60_000);
  return t.toISOString().slice(0, 10);
};

/**
 * Days in a row, up to today, that ended a fast which reached its goal. A day
 * without one yet (today, with a fast still going) doesn't break the streak.
 * `offsetMinutes` is the phone's getTimezoneOffset(), so days are its days.
 */
export function fastStreak(fasts: Fast[], today: string, offsetMinutes?: number): number {
  const met = new Set(fasts.filter((f) => f.endedAt && fastProgress(f).done).map((f) => localDay(f.endedAt!, offsetMinutes)));
  let d = met.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (met.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
