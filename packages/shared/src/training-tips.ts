// Safety tips for training, in an encouraging tone. Shown on each exercise
// card; Settings can turn them off. Pain notes always show.
import type { SetEntry, WeightUnit } from './training.ts';
import { formatWeight, toKg } from './training.ts';
import { daysBetween } from './progress.ts';
import { isStalled } from './training-coach.ts';

export interface PastSession {
  date: string;
  sets: SetEntry[];
  pain: boolean;
  painNote: string | null;
}
export interface TrainingTip {
  kind: 'pain' | 'checkup' | 'lighter' | 'stalled';
  text: string;
}

const topWorking = (sets: SetEntry[]) => sets.filter((s) => s.done && !s.warmup && s.weightKg !== null).sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0] ?? null;

/** Tips from your recent sessions of one exercise, newest first. */
export function trainingTips(sessions: PastSession[], today: string): TrainingTip[] {
  const tips: TrainingTip[] = [];
  const last = sessions[0];
  if (last?.pain) tips.push({ kind: 'pain', text: `You flagged pain here last time${last.painNote ? ` (“${last.painNote}”)` : ''}. Start light, and stop or swap to a variation if it comes back. Never push through pain.` });
  const recentPain = sessions.filter((s) => s.pain && daysBetween(s.date, today) <= 30).length;
  if (recentPain >= 2) tips.push({ kind: 'checkup', text: 'Pain on this lift more than once this month. It’s worth getting it checked by a doctor or physical therapist.' });
  const hard = sessions.slice(0, 3);
  if (hard.length === 3 && hard.every((s) => (topWorking(s.sets)?.rpe ?? 0) >= 9)) {
    tips.push({ kind: 'lighter', text: 'Your last three sessions here were near your limit (RPE 9+). A lighter day, or a few fewer reps, helps you keep progressing.' });
  }
  if (isStalled(sessions)) {
    tips.push({ kind: 'stalled', text: 'No progress here across your last three sessions. A few weeks in a different rep range, or a similar exercise, can get it moving again.' });
  }
  return tips;
}

/**
 * A heads-up when a working weight jumps a lot over last time's top set:
 * more than 10% and at least 15 lb (7.5 kg).
 */
export function bigJump(weightKg: number | null, previous: SetEntry[], unit: WeightUnit): string | null {
  const top = topWorking(previous);
  if (!weightKg || !top?.weightKg) return null;
  const jump = weightKg - top.weightKg;
  if (jump > top.weightKg * 0.1 && jump >= toKg(unit === 'lb' ? 15 : 7.5, unit) - 0.01) {
    return `That’s ${formatWeight(jump, unit)} ${unit} more than last time’s top set. Big jumps are where injuries happen; consider a smaller step.`;
  }
  return null;
}
