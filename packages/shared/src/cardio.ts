// Cardio: runs, rides, rows and the rest, logged as a time and a distance.
// Calories use METs (the Compendium of Physical Activities), which are rough,
// so they're shown as an estimate. A watch's own number is better when you have one.

export interface CardioActivity {
  key: string;
  name: string;
  /** effort when the pace isn't known */
  met: number;
  /** distance makes sense for it */
  distance: boolean;
}

export const CARDIO_ACTIVITIES: CardioActivity[] = [
  { key: 'run', name: 'Run', met: 9.8, distance: true },
  { key: 'treadmill', name: 'Treadmill', met: 8.3, distance: true },
  { key: 'walk', name: 'Walk', met: 3.5, distance: true },
  { key: 'hike', name: 'Hike', met: 6, distance: true },
  { key: 'bike', name: 'Bike ride', met: 7.5, distance: true },
  { key: 'stationary-bike', name: 'Stationary bike', met: 6.8, distance: true },
  { key: 'row', name: 'Rowing machine', met: 7, distance: true },
  { key: 'elliptical', name: 'Elliptical', met: 5, distance: false },
  { key: 'stairs', name: 'Stair climber', met: 9, distance: false },
  { key: 'swim', name: 'Swim', met: 7, distance: true },
  { key: 'jump-rope', name: 'Jump rope', met: 11, distance: false },
  { key: 'hiit', name: 'HIIT', met: 8, distance: false },
];

/** Which activity an exercise is, from its name. */
export function cardioActivityFor(name: string): CardioActivity {
  const n = name.toLowerCase();
  const by = (k: string) => CARDIO_ACTIVITIES.find((a) => a.key === k)!;
  if (/treadmill/.test(n)) return by('treadmill');
  if (/stationary|spin|bike.*(indoor|stationary)|assault|air bike/.test(n)) return by('stationary-bike');
  if (/run|jog/.test(n)) return by('run');
  if (/hike/.test(n)) return by('hike');
  if (/walk/.test(n)) return by('walk');
  if (/bike|cycl|ride/.test(n)) return by('bike');
  if (/row/.test(n)) return by('row');
  if (/elliptical|cross.?trainer/.test(n)) return by('elliptical');
  if (/stair|step ?mill/.test(n)) return by('stairs');
  if (/swim/.test(n)) return by('swim');
  if (/jump ?rope|skipping/.test(n)) return by('jump-rope');
  return by('hiit');
}

/**
 * Effort for running and walking from the pace: faster is harder. km/h × 1.0
 * is close to the running METs (8 km/h ≈ 8.3, 12 km/h ≈ 12.3); walking is
 * gentler per km/h.
 */
function metFor(a: CardioActivity, minutes: number, distanceM: number | null): number {
  if (!distanceM || minutes <= 0) return a.met;
  const kmh = distanceM / 1000 / (minutes / 60);
  if (a.key === 'run' || a.key === 'treadmill') return Math.min(20, Math.max(6, kmh * 1.02));
  if (a.key === 'walk') return Math.min(7, Math.max(2.5, 0.68 * kmh + 0.4));
  if (a.key === 'bike') return Math.min(16, Math.max(4, kmh * 0.4));
  return a.met;
}

/** Estimated calories burned (kcal), from METs, time and body weight. */
export function cardioKcal(name: string, seconds: number, weightKg: number | null, distanceM: number | null = null): number {
  const minutes = seconds / 60;
  if (minutes <= 0) return 0;
  const a = cardioActivityFor(name);
  return Math.round(metFor(a, minutes, distanceM) * (weightKg ?? 75) * (minutes / 60));
}

/** Pace per km or mile ("8:42 /mi"), for distance activities. */
export function paceText(seconds: number, distanceM: number | null, unit: 'lb' | 'kg'): string | null {
  if (!distanceM || distanceM < 50 || seconds <= 0) return null;
  const per = unit === 'lb' ? distanceM / 1609.344 : distanceM / 1000;
  const s = Math.round(seconds / per);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${unit === 'lb' ? 'mi' : 'km'}`;
}

export const toDistanceUnit = (m: number, unit: 'lb' | 'kg') => (unit === 'lb' ? m / 1609.344 : m / 1000);
export const fromDistanceUnit = (v: number, unit: 'lb' | 'kg') => (unit === 'lb' ? v * 1609.344 : v * 1000);

/** "3.1 mi", "5 km". */
export function distanceText(m: number, unit: 'lb' | 'kg'): string {
  const v = toDistanceUnit(m, unit);
  return `${v < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10} ${unit === 'lb' ? 'mi' : 'km'}`;
}

/**
 * Minutes typed for cardio: "30", "30.5", "32:15" (minutes:seconds) or
 * "1:05:00" (hours too). Returns seconds, or null.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  const secs = n.length === 1 ? n[0]! * 60 : n.length === 2 ? n[0]! * 60 + n[1]! : n[0]! * 3600 + n[1]! * 60 + n[2]!;
  const out = Math.round(secs);
  return out > 0 && out <= 86400 ? out : null;
}

/** "32:15" or "1:05:00", for showing a duration in a box. */
export function durationText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : s ? `${m}:${String(s).padStart(2, '0')}` : String(m);
}
