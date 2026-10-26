// The rest coach: what to say between sets, and, when the phone has a fresh
// heart rate, whether you've recovered. Heart rate is a rough guide (heat,
// caffeine and nerves move it too), so it only ever adds a nudge; the timer
// you set still counts.

/** The heart rate you're "recovered" at: 40% of the way from resting to max. */
export function recoveredAt(restingHr: number | null, age: number | null = null): number {
  const resting = restingHr && restingHr > 30 && restingHr < 120 ? restingHr : 65;
  const max = age && age > 10 && age < 100 ? 208 - 0.7 * age : 188;
  return Math.round(resting + 0.4 * (max - resting));
}

export type RestState = 'too-soon' | 'recovering' | 'ready';

export interface RestAdvice {
  state: RestState;
  /** something to say now, or null to stay quiet */
  say: string | null;
}

/**
 * Advice for this moment of a rest. Heart rate only counts when it's fresh
 * (a minute old at most). `told` lists what's already been said, so each line
 * is said once.
 */
export function restAdvice(o: {
  plannedSeconds: number;
  elapsedSeconds: number;
  hr: number | null;
  hrAgeSeconds: number | null;
  recoveredBpm: number;
  told: ReadonlySet<string>;
}): RestAdvice {
  const fresh = o.hr !== null && o.hrAgeSeconds !== null && o.hrAgeSeconds <= 60;
  const left = o.plannedSeconds - o.elapsedSeconds;
  if (fresh) {
    const hr = Math.round(o.hr!);
    if (hr <= o.recoveredBpm) {
      // Recovered early: say so once, if there's real time left to save.
      if (left > 20 && o.elapsedSeconds >= Math.min(45, o.plannedSeconds * 0.5) && !o.told.has('ready-early'))
        return { state: 'ready', say: `Heart rate's down to ${hr}. You're ready when you are.` };
      return { state: 'ready', say: null };
    }
    if (left <= 0 && hr > o.recoveredBpm + 8 && !o.told.has('too-soon'))
      return { state: 'too-soon', say: `Heart rate's still ${hr}. Give it about 30 more seconds.` };
    return { state: left <= 0 ? 'too-soon' : 'recovering', say: null };
  }
  return { state: left <= 0 ? 'ready' : 'recovering', say: null };
}

/** The timing cues: a heads-up near the end, then what's next. */
export function restCue(secondsLeft: number, plannedSeconds: number, next: string | null): { key: string; say: string } | null {
  if (secondsLeft === 10 && plannedSeconds >= 40) return { key: '10', say: 'Ten seconds.' };
  if (secondsLeft === 30 && plannedSeconds >= 120) return { key: '30', say: 'Thirty seconds left.' };
  if (secondsLeft === 0) return { key: '0', say: next ? `Rest's up. Next: ${next}.` : 'Rest’s up. Next set.' };
  return null;
}

/**
 * A few words after a set, compared with the same set last time and the rep
 * target. Null when there's nothing worth saying (most sets: it should feel
 * like a coach, not a commentator).
 */
export function setFeedback(o: {
  reps: number | null;
  weightKg: number | null;
  previous: { reps: number | null; weightKg: number | null } | null;
  repMax: number | null;
  bestWeightKg: number | null;
  lastSetOfExercise: boolean;
  exerciseName: string;
}): string | null {
  const reps = o.reps ?? 0;
  const w = o.weightKg ?? 0;
  if (o.bestWeightKg !== null && w > o.bestWeightKg + 0.01 && reps > 0) return 'New heaviest set. Huge.';
  if (o.previous && (o.previous.weightKg ?? 0) === w && o.previous.reps !== null && reps > o.previous.reps) {
    const more = reps - o.previous.reps;
    return `${more === 1 ? 'One more rep' : `${more} more reps`} than last time. Nice work.`;
  }
  if (o.previous && w > (o.previous.weightKg ?? 0) + 0.01 && reps >= (o.previous.reps ?? 0)) return 'More weight than last time, same reps or better. Strong.';
  if (o.repMax && reps >= o.repMax && o.lastSetOfExercise) return `Top of the range on ${o.exerciseName}. Time to add weight next session.`;
  if (o.lastSetOfExercise) return `That's ${o.exerciseName} done.`;
  return null;
}
