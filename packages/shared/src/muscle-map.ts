// The muscle map: how much each muscle got this week and how recently, so
// you can see at a glance what to train next and what to let recover.
import { daysBetween } from './progress.ts';

export const MAP_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'core', 'quads', 'hamstrings', 'glutes', 'calves'] as const;
export type MapMuscle = (typeof MAP_MUSCLES)[number];
export type MuscleState = 'due' | 'some' | 'good' | 'recovering' | 'plenty';
export interface MuscleStat {
  muscle: string;
  /** working sets in the last 7 days */
  sets7: number;
  last: string | null;
}
export interface MuscleStatus {
  muscle: MapMuscle;
  state: MuscleState;
  sets7: number;
  daysSince: number | null;
  /** one plain line about it */
  note: string;
}

/** Roughly 10–20 hard sets a week per muscle grows it; 48 hours between hard sessions lets it recover. */
export function muscleStatuses(stats: MuscleStat[], today: string): MuscleStatus[] {
  return MAP_MUSCLES.map((muscle) => {
    const s = stats.find((x) => x.muscle === muscle);
    const sets7 = s?.sets7 ?? 0;
    const daysSince = s?.last ? daysBetween(s.last, today) : null;
    const ago = daysSince === null ? '' : daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`;
    let state: MuscleState;
    let note: string;
    if (sets7 > 20) {
      state = 'plenty';
      note = `${sets7} sets this week, more than it needs. Ease off until next week.`;
    } else if (daysSince !== null && daysSince <= 1 && sets7 >= 4) {
      state = 'recovering';
      note = `Trained ${ago}. Give it about 48 hours before training it hard again.`;
    } else if (sets7 >= 10) {
      state = 'good';
      note = `${sets7} sets this week: on track.`;
    } else if (sets7 > 0) {
      state = 'some';
      note = `${sets7} sets this week. About ${10 - sets7} more would help it grow.`;
    } else {
      state = 'due';
      note = daysSince === null ? 'Not trained yet. Worth adding.' : `Last trained ${ago}. Due for some work.`;
    }
    return { muscle, state, sets7, daysSince, note };
  });
}

/** Which to train next (least work first) and which to rest. */
export function trainNext(statuses: MuscleStatus[]) {
  const next = statuses.filter((s) => s.state === 'due' || s.state === 'some').sort((a, b) => a.sets7 - b.sets7);
  const rest = statuses.filter((s) => s.state === 'recovering' || s.state === 'plenty');
  return { next, rest };
}
