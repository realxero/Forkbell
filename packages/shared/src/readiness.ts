// Sleep and readiness, worked out from what your watch already sends to Apple
// Health: last night's sleep against your own usual, and resting heart rate
// and HRV against your own last four weeks. Rules, not AI; each score says
// what moved it. Without enough of your own history a part is left out
// rather than guessed.
export interface DayHealth {
  date: string;
  sleepMin: number | null;
  restingHr: number | null;
  hrvMs: number | null;
}

export interface Readiness {
  /** 0–100 */
  score: number;
  label: 'Ready to push' | 'Normal' | 'Take it easier';
  /** what moved it, in plain words, biggest first */
  reasons: string[];
  sleep: { score: number; minutes: number; usualMinutes: number | null } | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Enough days of your own to compare against. */
const BASELINE_DAYS = 7;

/** `today` is the morning you're asking about; `history` the days before it (any order). */
export function readiness(today: DayHealth, history: DayHealth[]): Readiness | null {
  const past = history.filter((d) => d.date < today.date);
  const parts: { delta: number; why: string }[] = [];

  // Sleep: against your own usual (at least 7 nights), else against 7½ hours.
  let sleep: Readiness['sleep'] = null;
  if (today.sleepMin !== null && today.sleepMin > 0) {
    const nights = past.map((d) => d.sleepMin).filter((v): v is number => v !== null && v > 60);
    const usual = nights.length >= BASELINE_DAYS ? mean(nights) : null;
    const need = Math.max(420, usual ?? 450);
    const score = Math.round(clamp((today.sleepMin / need) * 100, 0, 100));
    sleep = { score, minutes: Math.round(today.sleepMin), usualMinutes: usual === null ? null : Math.round(usual) };
    const diffH = (today.sleepMin - (usual ?? 450)) / 60;
    if (Math.abs(diffH) >= 0.5) parts.push({ delta: clamp(diffH * 8, -15, 10), why: `${Math.abs(diffH).toFixed(1)} h ${diffH > 0 ? 'more' : 'less'} sleep than usual` });
  }
  // Resting heart rate: higher than your usual means less recovered.
  const rhrs = past.map((d) => d.restingHr).filter((v): v is number => v !== null);
  if (today.restingHr !== null && rhrs.length >= BASELINE_DAYS) {
    const z = (today.restingHr - mean(rhrs)) / sd(rhrs);
    const diff = Math.round(today.restingHr - mean(rhrs));
    if (Math.abs(z) >= 0.5) parts.push({ delta: clamp(-z * 8, -20, 10), why: `resting heart rate ${Math.abs(diff)} bpm ${diff > 0 ? 'above' : 'below'} usual` });
  }
  // HRV: higher than your usual means more recovered.
  const hrvs = past.map((d) => d.hrvMs).filter((v): v is number => v !== null);
  if (today.hrvMs !== null && hrvs.length >= BASELINE_DAYS) {
    const z = (today.hrvMs - mean(hrvs)) / sd(hrvs);
    const diff = Math.round(today.hrvMs - mean(hrvs));
    if (Math.abs(z) >= 0.5) parts.push({ delta: clamp(z * 8, -20, 15), why: `HRV ${Math.abs(diff)} ms ${diff > 0 ? 'above' : 'below'} usual` });
  }
  const hasAny = sleep !== null || (today.restingHr !== null && rhrs.length >= BASELINE_DAYS) || (today.hrvMs !== null && hrvs.length >= BASELINE_DAYS);
  if (!hasAny) return null;
  const score = Math.round(clamp(72 + parts.reduce((n, p) => n + p.delta, 0), 0, 100));
  return {
    score,
    label: score >= 80 ? 'Ready to push' : score >= 55 ? 'Normal' : 'Take it easier',
    reasons: parts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((p) => p.why),
    sleep,
  };
}
