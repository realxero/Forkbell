// Vitamins and minerals: the ones on US nutrition labels and in most food
// databases, with the FDA daily values for adults. Stored per 100 g, in mg or
// µg as listed. Many foods don't list them, so a day's totals only count the
// foods that do, and say how many that is.
import { z } from 'zod';
import type { DiaryEntry } from './types.ts';

export const MICROS = [
  { key: 'vitaminA', name: 'Vitamin A', unit: 'µg', dv: 900, usda: '320', off: 'vitamin-a_100g', offScale: 1e6 },
  { key: 'vitaminC', name: 'Vitamin C', unit: 'mg', dv: 90, usda: '401', off: 'vitamin-c_100g', offScale: 1e3 },
  { key: 'vitaminD', name: 'Vitamin D', unit: 'µg', dv: 20, usda: '328', off: 'vitamin-d_100g', offScale: 1e6 },
  { key: 'vitaminB12', name: 'Vitamin B12', unit: 'µg', dv: 2.4, usda: '418', off: 'vitamin-b12_100g', offScale: 1e6 },
  { key: 'folate', name: 'Folate', unit: 'µg', dv: 400, usda: '435', off: 'vitamin-b9_100g', offScale: 1e6 },
  { key: 'calcium', name: 'Calcium', unit: 'mg', dv: 1300, usda: '301', off: 'calcium_100g', offScale: 1e3 },
  { key: 'iron', name: 'Iron', unit: 'mg', dv: 18, usda: '303', off: 'iron_100g', offScale: 1e3 },
  { key: 'potassium', name: 'Potassium', unit: 'mg', dv: 4700, usda: '306', off: 'potassium_100g', offScale: 1e3 },
  { key: 'magnesium', name: 'Magnesium', unit: 'mg', dv: 420, usda: '304', off: 'magnesium_100g', offScale: 1e3 },
  { key: 'zinc', name: 'Zinc', unit: 'mg', dv: 11, usda: '309', off: 'zinc_100g', offScale: 1e3 },
] as const;

export type MicroKey = (typeof MICROS)[number]['key'];
/** mg or µg per 100 g (or per serving on a label); missing or null when not listed */
export type Micros = Partial<Record<MicroKey, number | null>>;

const microValue = z.number().min(0).max(1_000_000);
export const microsSchema = z
  .object(Object.fromEntries(MICROS.map((m) => [m.key, microValue.nullish()])) as Record<MicroKey, z.ZodOptional<z.ZodNullable<typeof microValue>>>)
  .partial();

/** Only the numbers that are there (no nulls), or null when there are none. */
export function cleanMicros(m: Record<string, unknown> | null | undefined): Micros | null {
  if (!m) return null;
  const out: Micros = {};
  for (const { key } of MICROS) {
    const v = m[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = Math.round(v * 1000) / 1000;
  }
  return Object.keys(out).length ? out : null;
}

/** From Open Food Facts' nutriments (grams per 100 g). */
export function microsFromOff(nm: Record<string, unknown>): Micros | null {
  const out: Record<string, number> = {};
  for (const m of MICROS) {
    const v = Number(nm[m.off]);
    if (nm[m.off] !== undefined && nm[m.off] !== '' && Number.isFinite(v)) out[m.key] = v * m.offScale;
  }
  return cleanMicros(out);
}

/** From USDA's nutrient numbers (already mg or µg per 100 g). */
export function microsFromUsda(get: (num: string) => number | null): Micros | null {
  return cleanMicros(Object.fromEntries(MICROS.map((m) => [m.key, get(m.usda)])));
}

/** Per serving (a label) → per 100 g. */
export const microsPer100 = (perServing: Micros | null | undefined, servingGrams: number) =>
  cleanMicros(perServing ? Object.fromEntries(Object.entries(perServing).map(([k, v]) => [k, v === null || v === undefined ? null : (v * 100) / servingGrams])) : null);

export interface DayMicros {
  /** totals from the foods that list them */
  totals: Micros;
  /** how many of the day's entries list any */
  known: number;
  of: number;
}

/** A day's vitamins and minerals, from the entries whose foods list them. */
export function sumMicros(entries: Pick<DiaryEntry, 'grams' | 'food'>[]): DayMicros {
  const totals: Micros = {};
  let known = 0;
  for (const e of entries) {
    const m = e.food.per100.micros;
    if (!m || !Object.keys(m).length) continue;
    known++;
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number') totals[k as MicroKey] = (totals[k as MicroKey] ?? 0) + (v * e.grams) / 100;
  }
  return { totals, known, of: entries.length };
}

/** "45 mg", "2.4 µg". */
export const microText = (key: MicroKey, v: number) => {
  const m = MICROS.find((x) => x.key === key)!;
  return `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v)} ${m.unit}`;
};
