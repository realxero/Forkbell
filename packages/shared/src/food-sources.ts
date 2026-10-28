// Where food data comes from, and checking one source against another.
import type { DataKind, FoodCandidate, FoodSource } from './types.ts';

export const SOURCE_NAMES: Record<FoodSource, string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
  builtin: 'Forkbell',
  custom: 'you',
  recipe: 'your recipe',
  import: 'another app (imported)',
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

/** The tag shown on a food, and how much its numbers are trusted when ranking. */
export const KIND_INFO: Record<DataKind, { tag: string; about: string; trust: number }> = {
  lab: { tag: 'USDA lab', about: 'Measured in a lab by USDA.', trust: 2 },
  survey: { tag: 'USDA', about: 'USDA’s figures for an everyday dish, with typical portions.', trust: 1.6 },
  builtin: { tag: 'Forkbell', about: 'A common food built into Forkbell, from USDA data.', trust: 1.6 },
  label: { tag: 'Maker’s label', about: 'The manufacturer’s label data, through USDA.', trust: 1.2 },
  community: { tag: 'Community', about: 'Entered by Open Food Facts volunteers. Usually right; worth a glance.', trust: 0.5 },
  yours: { tag: 'Yours', about: 'A food you saved.', trust: 1.6 },
  recipe: { tag: 'Recipe', about: 'One of your recipes.', trust: 1.6 },
};

/** What kind of data a food is, from its source when the search didn't say. */
export function dataKind(f: Pick<FoodCandidate, 'source' | 'kind'>): DataKind {
  if (f.kind) return f.kind;
  return f.source === 'usda' ? 'label' : f.source === 'off' ? 'community' : f.source === 'builtin' ? 'builtin' : f.source === 'recipe' ? 'recipe' : 'yours';
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** How well a food's name and brand match what was typed, 0 when not at all. */
export function matchScore(query: string, f: Pick<FoodCandidate, 'name' | 'brand'>): number {
  const q = norm(query);
  const words = q.split(' ').filter(Boolean);
  if (!words.length) return 0;
  const name = norm(f.name);
  const text = `${name} ${norm(f.brand ?? '')}`;
  const found = words.filter((w) => text.includes(w)).length;
  if (!found) return 0;
  let score = (3 * found) / words.length;
  if (name === q) score += 3;
  else if (name.startsWith(q)) score += 2;
  else if (name.startsWith(words[0]!)) score += 1;
  return score - Math.min(1, name.length / 60); // shorter names first among equals
}

/**
 * Order outside search results: best match first, and among similar matches
 * the more trustworthy data. Community entries missing fibre and sugar count a
 * little less. Repeats (same name and brand) keep only the best one.
 */
export function rankResults<T extends FoodCandidate>(query: string, results: T[]): T[] {
  const scored = results.map((f) => {
    const kind = dataKind(f);
    const sparse = kind === 'community' && f.per100.fiber == null && f.per100.sugar == null ? 0.3 : 0;
    return { f, score: matchScore(query, f) + KIND_INFO[kind].trust - sparse };
  });
  const best = new Map<string, { f: T; score: number }>();
  for (const s of scored) {
    const key = `${norm(s.f.name)}|${norm(s.f.brand ?? '')}`;
    const had = best.get(key);
    if (!had || s.score > had.score) best.set(key, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).map((s) => s.f);
}
