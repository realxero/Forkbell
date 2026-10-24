// Weighing food on a kitchen scale. Two ways to do it, both exact:
//  - tare between foods: each number typed is that food's grams;
//  - read the total: each number is what the scale shows after adding a
//    food, and the food is the difference from the reading before (starting
//    from the empty plate or bowl, if you picked one you've saved).
// Leftovers: weigh what's left after eating and it comes off.

export type WeighMode = 'tare' | 'total';

/**
 * Grams of each food from what was typed. `start` is the scale before the
 * first food: the saved plate's weight, or 0 if you tared the empty plate.
 * A reading lower than the one before is a mistake (returned as null).
 */
export function gramsFromScale(mode: WeighMode, values: (number | null)[], start = 0): (number | null)[] {
  // Anything that isn't a real number, or rounds to nothing, counts as not weighed yet.
  const real = (v: number | null): v is number => v !== null && Number.isFinite(v);
  if (mode === 'tare') return values.map((v) => (real(v) && round1(v) > 0 ? round1(v) : null));
  let prev = Number.isFinite(start) ? start : 0;
  return values.map((v) => {
    if (!real(v)) return null;
    const g = round1(v - prev);
    if (g <= 0) return null;
    prev = v;
    return g;
  });
}

/** What you ate: weighed minus what's left. With a plate picked, the leftover reading includes the plate. */
export function eatenGrams(weighed: number, leftover: number | null, plate = 0): number {
  if (leftover === null) return weighed;
  const left = Math.max(0, leftover - plate);
  return round1(Math.max(0, weighed - left));
}

const UNIT_GRAMS: [RegExp, number][] = [
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 1000],
  [/^(g|gs|gram|grams|gr|grm)$/, 1],
  [/^(oz|ounce|ounces)$/, 28.3495],
  [/^(lb|lbs|pound|pounds)$/, 453.592],
  [/^(ml|milliliter|milliliters|millilitre|millilitres)$/, 1],
];

/**
 * A weight from what you typed or said: "182", "182 g", "182 grams",
 * "1.2 kg", "6 oz", "6.5 ounces", "182 grams of rice". Grams, or null.
 */
export function parseWeight(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*([a-z]+)?/i.exec(text.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const factor = unit ? (UNIT_GRAMS.find(([re]) => re.test(unit))?.[1] ?? 1) : 1;
  const g = round1(n * factor);
  return g > 0 && g <= 20000 ? g : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
