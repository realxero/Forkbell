// The lock screen / Dynamic Island card during a workout, through expo-live-activity.
import * as LiveActivity from 'expo-live-activity';
import type { WorkoutActivity } from './live-activity';

export type { WorkoutActivity } from './live-activity';

let id: string | null = null;

export function workoutActivity(a: WorkoutActivity | null): void {
  try {
    if (!a) {
      if (id) LiveActivity.stopActivity(id, { title: 'Workout done' });
      id = null;
      return;
    }
    const state = { title: a.title, subtitle: a.subtitle, ...(a.restEnd ? { progressBar: { date: a.restEnd } } : {}) };
    if (id) LiveActivity.updateActivity(id, state);
    // The library's 24 pt padding and title-size text overflow the lock screen card; tighter padding keeps the bar and timer inside it.
    else id = LiveActivity.startActivity(state, { timerType: 'digital', padding: { horizontal: 18, vertical: 14 } }) || null;
  } catch {
    // Live Activities off, or an install without them: the workout screen is unaffected.
  }
}
