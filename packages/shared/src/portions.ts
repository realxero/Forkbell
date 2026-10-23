import type { Food, FoodCandidate } from './types.ts';

export interface AmountChip {
  label: string;
  grams: number;
}

const fmt = (g: number) => `${Math.round(g * 10) / 10} g`;

/**
 * Quick amounts for a food, most useful first: what you had last time, the
 * food's own named portions, its serving (with half and double), then plain
 * gram amounts. Duplicate gram values are dropped so every chip does something
 * different.
 */
export function amountChips(food: Pick<Food | FoodCandidate, 'servingGrams' | 'servingLabel' | 'portions'>, lastGrams?: number | null): AmountChip[] {
  const chips: AmountChip[] = [];
  if (lastGrams && lastGrams > 0) chips.push({ label: `Last time (${fmt(lastGrams)})`, grams: lastGrams });
  for (const p of food.portions ?? []) chips.push({ label: `${p.label} (${fmt(p.grams)})`, grams: p.grams });
  if (food.servingGrams) {
    const s = food.servingGrams;
    const name = food.servingLabel && !/^\d+(\.\d+)?\s*g$/i.test(food.servingLabel.trim()) ? food.servingLabel : null;
    chips.push({ label: name ? `1 serving, ${name} (${fmt(s)})` : `1 serving (${fmt(s)})`, grams: s });
    chips.push({ label: `½ serving (${fmt(s / 2)})`, grams: Math.round((s / 2) * 10) / 10 });
    chips.push({ label: `2 servings (${fmt(s * 2)})`, grams: s * 2 });
  }
  for (const g of [50, 100, 150, 200]) chips.push({ label: fmt(g), grams: g });

  const seen = new Set<number>();
  return chips.filter((c) => (seen.has(c.grams) ? false : (seen.add(c.grams), true)));
}

/**
 * Barcode digits in the form Open Food Facts stores them. Scanners report
 * UPC-A as 12 digits; the same product is the 13-digit EAN with a leading 0.
 */
export function barcodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, '');
  if (!/^\d{6,14}$/.test(digits)) return [];
  const out = [digits];
  if (digits.length === 12) out.push(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) out.push(digits.slice(1));
  return out;
}
