// Where food data comes from, and checking one source against another.
import type { FoodCandidate, FoodSource } from './types.ts';

export const SOURCE_NAMES: Record<FoodSource, string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
  builtin: 'Forkbell',
  custom: 'you',
  recipe: 'your recipe',
};

/** Two barcodes for the same product (UPC-A, EAN-13 and GTIN-14 differ only by leading zeros). */
export const sameBarcode = (a: string, b: string) => a.replace(/\D/g, '').replace(/^0+/, '') === b.replace(/\D/g, '').replace(/^0+/, '');

/**
 * For a scanned barcode, USDA's branded foods come from the manufacturer's own
 * label data, so they win over Open Food Facts (crowd-sourced) when both have it.
 */
export function chooseBarcodeMatch(found: { usda: FoodCandidate | null; off: FoodCandidate | null }) {
  if (found.usda) return { pick: found.usda, other: found.off };
  return { pick: found.off, other: null };
}

export interface NutritionCheck {
  /** the other source it was checked against */
  source: FoodSource;
  agrees: boolean;
  text: string;
}

/**
 * Compare two sources' numbers for the same product. Close enough when calories
 * are within 10% (or 15 kcal) and protein within 15% (or 2 g) per 100 g.
 */
export function crossCheck(pick: FoodCandidate, other: FoodCandidate | null): NutritionCheck | null {
  if (!other) return null;
  const a = pick.per100;
  const b = other.per100;
  const close = (x: number, y: number, pct: number, abs: number) => Math.abs(x - y) <= Math.max(abs, pct * Math.max(x, y));
  const agrees = close(a.kcal, b.kcal, 0.1, 15) && close(a.protein, b.protein, 0.15, 2);
  const name = SOURCE_NAMES[other.source];
  return {
    source: other.source,
    agrees,
    text: agrees
      ? `Checked against ${name}: the numbers match.`
      : `${name} lists ${Math.round(b.kcal)} kcal and ${Math.round(b.protein)} g protein per 100 g; this uses ${SOURCE_NAMES[pick.source]}’s ${Math.round(a.kcal)} kcal and ${Math.round(a.protein)} g, from the maker’s label. If your package says otherwise, fix it from the label.`,
  };
}
