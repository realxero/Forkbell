import type { Per100, Totals, DiaryEntry } from './types.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

export const emptyTotals = (): Totals => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });

/** Nutrition for an amount in grams, from per-100 g values. */
export function forAmount(per100: Per100, grams: number): Totals {
  const f = grams / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    protein: round1(per100.protein * f),
    carbs: round1(per100.carbs * f),
    fat: round1(per100.fat * f),
    fiber: round1((per100.fiber ?? 0) * f),
    sugar: round1((per100.sugar ?? 0) * f),
    sodium: Math.round((per100.sodium ?? 0) * f),
  };
}

export function sumEntries(entries: Pick<DiaryEntry, 'grams' | 'food'>[]): Totals {
  const t = emptyTotals();
  for (const e of entries) {
    const n = forAmount(e.food.per100, e.grams);
    for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += n[k];
  }
  for (const k of Object.keys(t) as (keyof Totals)[]) t[k] = k === 'kcal' || k === 'sodium' ? Math.round(t[k]) : round1(t[k]);
  return t;
}

/**
 * Reasons a per-100 g entry can't be right. Pure fat is ~900 kcal/100 g, so
 * anything above that is a unit mistake; macros that don't roughly add up to
 * the stated calories usually mean per-serving and per-100 g got mixed.
 */
export function per100Problems(p: Per100): string[] {
  const problems: string[] = [];
  const values = [p.kcal, p.protein, p.carbs, p.fat];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) problems.push('Values must be zero or more.');
  if (p.kcal > 900) problems.push('More than 900 kcal per 100 g is not possible.');
  if (p.protein + p.carbs + p.fat > 100) problems.push('Protein, carbs and fat add up to more than 100 g per 100 g.');
  const fromMacros = p.protein * 4 + p.carbs * 4 + p.fat * 9;
  // Below 10 kcal, rounding alone can throw the ratio off (black coffee: 1 kcal).
  if (p.kcal >= 10 && fromMacros > 0) {
    const ratio = fromMacros / p.kcal;
    // Alcohol, fiber and sugar alcohols explain some gap; this only catches big ones.
    if (ratio < 0.5 || ratio > 1.6) problems.push(`Macros add up to about ${Math.round(fromMacros)} kcal, not ${p.kcal}.`);
  }
  return problems;
}
