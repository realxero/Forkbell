// The lock screen / Dynamic Island card during a workout (live-activity.ios.ts).
// Other platforms have none, so this does nothing.
export interface WorkoutActivity {
  title: string;
  subtitle: string;
  /** When the rest ends (ms), for the countdown. */
  restEnd: number | null;
}

/** Show or update the card; null takes it down. */
export function workoutActivity(_a: WorkoutActivity | null): void {}
