// Exercise adding to the day's calorie goal, if you want it to. Your daily
// burn (Progress) already includes how active you usually are, so only the
// activity above your usual day is added: a long run adds, an ordinary day
// doesn't, and nothing is counted twice.
export type ExerciseAdds = 'off' | 'half' | 'all';

export interface ExerciseBonus {
  /** added to the goal */
  kcal: number;
  /** active calories today, and on a usual day (the last four weeks' average) */
  activeKcal: number;
  usualKcal: number;
}

/** Days of activity needed before "usual" means anything. */
export const BONUS_MIN_DAYS = 7;

export function exerciseBonus(mode: ExerciseAdds, activeToday: number | null, earlier: number[]): ExerciseBonus | null {
  if (mode === 'off' || activeToday === null || earlier.length < BONUS_MIN_DAYS) return null;
  const usual = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const extra = Math.max(0, activeToday - usual) * (mode === 'half' ? 0.5 : 1);
  return { kcal: Math.min(1500, Math.round(extra / 10) * 10), activeKcal: Math.round(activeToday), usualKcal: Math.round(usual) };
}
