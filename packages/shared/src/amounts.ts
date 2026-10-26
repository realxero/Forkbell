// Amounts the way people say them: 1 bar, 1 serving (11 fl oz), 2 slices,
// 4 oz, 1.5 cups, 250 ml. Foods keep their numbers per 100 g underneath, so
// every unit here is "how many grams one of it is" for this food.
import type { Food, FoodCandidate } from './types.ts';
import type { WeightUnit } from './training.ts';

type AmountFood = Pick<Food | FoodCandidate, 'name' | 'servingGrams' | 'servingLabel' | 'portions'>;

export interface AmountUnit {
  /** stored with the entry: 'serving', 'g', 'oz', 'floz', a portion's name... */
  key: string;
  /** "serving", "bar", "slice", "oz", "fl oz", "cup" */
  label: string;
  /** grams in one of it, for this food */
  grams: number;
  /** count units (servings, portions) get ½, 1, 1½, 2 chips; measures don't */
  count: boolean;
}

export const WEIGHTS: Record<string, { label: string; grams: number }> = {
  g: { label: 'g', grams: 1 },
  oz: { label: 'oz', grams: 28.349523 },
  lb: { label: 'lb', grams: 453.59237 },
  kg: { label: 'kg', grams: 1000 },
};
/** millilitres in each */
export const VOLUMES: Record<string, { label: string; ml: number }> = {
  ml: { label: 'ml', ml: 1 },
  floz: { label: 'fl oz', ml: 29.5735 },
  cup: { label: 'cup', ml: 236.588 },
  tbsp: { label: 'tbsp', ml: 14.7868 },
  tsp: { label: 'tsp', ml: 4.92892 },
  l: { label: 'L', ml: 1000 },
};

const VOLUME_WORDS: [RegExp, string][] = [
  [/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|fluid ounces?)/i, 'floz'],
  [/(\d+(?:\.\d+)?)\s*ml\b/i, 'ml'],
  [/(\d+(?:\.\d+)?)\s*(?:l|liters?|litres?)\b/i, 'l'],
  [/(\d+(?:\.\d+)?|½|1\/2|¼|1\/4|¾|3\/4|⅓|1\/3)\s*cups?\b/i, 'cup'],
  [/(\d+(?:\.\d+)?)\s*(?:tbsp|tablespoons?)\b/i, 'tbsp'],
  [/(\d+(?:\.\d+)?)\s*(?:tsp|teaspoons?)\b/i, 'tsp'],
];
const LIQUID = /\b(shake|milk|juice|soda|cola|coffee|latte|cappuccino|tea|water|smoothie|kombucha|beer|wine|drink|lemonade|broth|soup|creamer|oil|syrup|sauce|dressing|yogurt drink|kefir|horchata|energy drink|sports drink|seltzer|spritz)\b/i;

/** A serving label that's a volume ("11 fl oz", "1 cup (240 ml)"): its millilitres. */
export function servingMl(label: string | null | undefined): number | null {
  if (!label) return null;
  for (const [re, unit] of VOLUME_WORDS) {
    const m = re.exec(label);
    if (m) return parseQuantity(m[1]!)! * VOLUMES[unit]!.ml;
  }
  return null;
}

/** Drinks, soups, oils and sauces get cups, fl oz and ml too. */
export function isLiquid(food: AmountFood): boolean {
  return servingMl(food.servingLabel) !== null || LIQUID.test(food.name);
}

/** Grams per millilitre: from a volume serving label when there is one, else water's 1. */
export function densityOf(food: AmountFood): number {
  const ml = servingMl(food.servingLabel);
  if (ml && food.servingGrams) {
    const d = food.servingGrams / ml;
    if (d > 0.5 && d < 2) return d;
  }
  return 1;
}

/**
 * What one serving is called: "bar" for "1 bar", "serving" for "11 fl oz",
 * "45 g" or nothing. A count word reads better than "serving" when the label
 * gives one.
 */
export function servingWord(label: string | null | undefined): string {
  const m = /^\s*1\s+([a-z][a-z \-]{1,20}?)s?\s*(\(.*\))?\s*$/i.exec(label ?? '');
  if (!m) return 'serving';
  const word = m[1]!.trim().toLowerCase();
  if (/^(g|grams?|oz|ounces?|ml|cups?|tbsp|tsp|fl oz|serving|portion|lb|kg|l)$/.test(word)) return 'serving';
  return word;
}

/** Every way to say an amount of this food, the most natural first. */
export function unitsFor(food: AmountFood, prefer: WeightUnit = 'lb'): AmountUnit[] {
  const out: AmountUnit[] = [];
  if (food.servingGrams && food.servingGrams > 0) out.push({ key: 'serving', label: servingWord(food.servingLabel), grams: food.servingGrams, count: true });
  for (const p of food.portions ?? []) if (p.grams > 0 && !out.some((u) => u.label === p.label.toLowerCase())) out.push({ key: `p:${p.label}`, label: p.label.toLowerCase(), grams: p.grams, count: true });
  const weights = prefer === 'lb' ? ['oz', 'g', 'lb'] : ['g', 'oz', 'kg'];
  const liquid = isLiquid(food);
  if (liquid) {
    const d = densityOf(food);
    const vols = prefer === 'lb' ? ['floz', 'cup', 'ml', 'tbsp', 'tsp'] : ['ml', 'cup', 'floz', 'tbsp', 'tsp', 'l'];
    for (const v of vols) out.push({ key: v, label: VOLUMES[v]!.label, grams: VOLUMES[v]!.ml * d, count: false });
  }
  for (const w of weights) out.push({ key: w, label: WEIGHTS[w]!.label, grams: WEIGHTS[w]!.grams, count: false });
  return out;
}

/** The unit with this key for this food, or grams if it no longer applies. */
export function unitFor(food: AmountFood, key: string | null | undefined, prefer: WeightUnit = 'lb'): AmountUnit {
  const all = unitsFor(food, prefer);
  return all.find((u) => u.key === key) ?? all.find((u) => u.key === 'g')!;
}

/** "1", "1.5", "1 1/2", "1/2", "½", "2,5" → a number; null when it isn't one. */
export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(',', '.').replace('½', ' 1/2').replace('¼', ' 1/4').replace('¾', ' 3/4').replace('⅓', ' 1/3').replace('⅔', ' 2/3').trim();
  let m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t);
  if (m && Number(m[3]) > 0) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return null;
}

const nice = (n: number) => {
  const whole = Math.floor(n);
  const frac = n - whole;
  const named = [
    [0.25, '¼'],
    [0.5, '½'],
    [0.75, '¾'],
    [1 / 3, '⅓'],
    [2 / 3, '⅔'],
  ] as const;
  for (const [v, s] of named) if (Math.abs(frac - v) < 0.01) return `${whole || ''}${s}`;
  return String(Math.round(n * 100) / 100);
};

/** "1 bar", "2 servings", "1½ cups", "4 oz", "325 g". */
export function amountText(quantity: number, unit: Pick<AmountUnit, 'label' | 'count'>): string {
  const q = nice(quantity);
  const plural = unit.count && quantity > 1 && !/s$/.test(unit.label) ? `${unit.label}s` : unit.label === 'cup' && quantity > 1 ? 'cups' : unit.label;
  return unit.label === 'g' || unit.label === 'ml' ? `${Math.round(quantity)} ${unit.label}` : `${q} ${plural}`;
}

/**
 * How to show an amount logged in grams (older entries, or ones logged in g):
 * as servings when it's a tidy number of them, otherwise in g (or oz).
 */
export function amountFromGrams(food: AmountFood, grams: number, prefer: WeightUnit = 'lb'): { quantity: number; unit: AmountUnit } {
  const units = unitsFor(food, prefer).filter((u) => u.count);
  for (const u of units) {
    const q = grams / u.grams;
    const quarter = Math.round(q * 4) / 4;
    if (quarter > 0 && quarter <= 20 && Math.abs(q - quarter) / q < 0.02) return { quantity: quarter, unit: u };
  }
  return { quantity: Math.round(grams * 10) / 10, unit: unitFor(food, 'g', prefer) };
}

/** An entry's amount as words: what was picked when it was logged, or worked out from grams. */
export function entryAmountText(e: { grams: number; amount?: number | null; unit?: string | null; food: AmountFood }, prefer: WeightUnit = 'lb'): string {
  if (e.amount && e.unit) {
    const u = unitFor(e.food, e.unit, prefer);
    if (u.key === e.unit) return amountText(e.amount, u) + (u.key === 'g' ? '' : ` (${Math.round(e.grams)} g)`);
  }
  const { quantity, unit } = amountFromGrams(e.food, e.grams, prefer);
  return unit.key === 'g' ? amountText(quantity, unit) : `${amountText(quantity, unit)} (${Math.round(e.grams)} g)`;
}
