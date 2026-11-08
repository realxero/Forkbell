const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the device's own time zone. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The date and hour in an IANA time zone ("America/New_York"), or null if it isn't one. */
function inZone(timeZone: string | null | undefined, now: Date): { date: string; hour: number } | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch {
    return null;
  }
}

export const isTimeZone = (timeZone: string) => inZone(timeZone, new Date()) !== null;

/**
 * Today as YYYY-MM-DD for someone in that time zone. Without one (or with one
 * this device doesn't know) it's this device's own today, as todayLocal().
 * On the server, pass the person's time zone: the server's clock is often UTC.
 */
export function todayIn(timeZone: string | null | undefined, now = new Date()): string {
  return inZone(timeZone, now)?.date ?? todayLocal(now);
}

/** This device's time zone, as the server should store it, or null if it can't tell. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** The meal for this time of day, on this device or (on the server) in the person's time zone. */
export function mealForTime(now = new Date(), timeZone?: string | null): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const h = inZone(timeZone, now)?.hour ?? now.getHours();
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
