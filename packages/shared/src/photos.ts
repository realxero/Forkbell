// Progress photos: front, side and back, and what to compare.
export const POSES = ['front', 'side', 'back'] as const;
export type Pose = (typeof POSES)[number];
export const POSE_NAMES: Record<Pose, string> = { front: 'Front', side: 'Side', back: 'Back' };

export interface ProgressPhoto {
  id: string;
  date: string;
  pose: Pose;
  createdAt: string | null;
}

/** Oldest first: by date, then by when it was added. */
const byTime = (a: ProgressPhoto, b: ProgressPhoto) => (a.date === b.date ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') : a.date < b.date ? -1 : 1);

/**
 * Your first and latest photo of a pose, to see side by side. With one
 * photo there's nothing to compare yet (latest is null); a day with two of
 * the same pose uses the last one added.
 */
export function firstAndLatest(photos: ProgressPhoto[], pose: Pose): { first: ProgressPhoto | null; latest: ProgressPhoto | null } {
  const mine = photos.filter((p) => p.pose === pose).sort(byTime);
  const first = mine[0] ?? null;
  const last = mine.at(-1) ?? null;
  return { first, latest: last && first && last.date !== first.date ? last : null };
}

/** Photos grouped by day, newest day first, each day in pose order. */
export function photoDays(photos: ProgressPhoto[]): { date: string; photos: ProgressPhoto[] }[] {
  const days = new Map<string, ProgressPhoto[]>();
  for (const p of [...photos].sort(byTime)) days.set(p.date, [...(days.get(p.date) ?? []), p]);
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, photos: list.sort((a, b) => POSES.indexOf(a.pose) - POSES.indexOf(b.pose)) }));
}

/**
 * Your weight trend on a day: the trend from the last weigh-in on or before
 * it, or from one in the next 3 days when there's none before. Null without
 * a weigh-in close enough to say.
 */
export function trendOnDate(points: { date: string; trendKg: number }[], date: string): number | null {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const before = sorted.filter((p) => p.date <= date).at(-1);
  if (before) return before.trendKg;
  const after = sorted.find((p) => p.date > date);
  if (!after) return null;
  const gap = (Date.parse(`${after.date}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000;
  return gap <= 3 ? after.trendKg : null;
}
