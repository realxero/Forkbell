const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the device's own time zone. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function mealForTime(now = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  return baseMealForTime(now);
}

function baseMealForTime(now: Date): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const h = now.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

/**
 * Milliseconds for a time from the server or the phone, whether ISO 8601
 * ("2026-10-21T00:10:00Z") or how older servers sent it ("2026-10-21
 * 00:10:00+00", which iPhones can't read on their own). NaN if neither.
 */
export function instant(t: string | null | undefined): number {
  if (!t) return NaN;
  const direct = Date.parse(t);
  if (!Number.isNaN(direct) && t.includes('T')) return direct;
  return Date.parse(t.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)$/, '$1:00'));
}

/** The same time as ISO 8601, for sending back. */
export const toIso = (t: string) => {
  const ms = instant(t);
  return Number.isNaN(ms) ? t : new Date(ms).toISOString();
};
