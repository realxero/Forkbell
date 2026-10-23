// "Better option": lighter or higher-protein versions of a food you logged,
// from foods you already have and the built-in ones. Works even with
// suggestions turned off, because you asked for it.
import { checkFood, type Preferences } from './food-safety.ts';
import { forAmount } from './nutrition.ts';
import type { Food } from './types.ts';

// Words that name what a food is; two foods sharing one are comparable.
const KINDS = /\b(cola|soda|tea|coffee|juice|milk|yogurt|yoghurt|cheese|bread|bagel|tortilla|wrap|cereal|granola|oats|pasta|rice|noodles?|chips|crackers|cookies?|ice cream|chocolate|bar|burger|pizza|sandwich|chicken|beef|turkey|pork|sausage|bacon|eggs?|fish|salmon|tuna|shrimp|tofu|beans?|peanut butter|butter|oil|dressing|sauce|mayo|mayonnaise|cream|sugar|syrup|jam|drink|beer|wine|fries|potato|popcorn|nuts?|almonds?)\b/gi;
const kinds = (name: string) => new Set((name.toLowerCase().match(KINDS) ?? []).map((k) => k.replace(/s$/, '')));

export interface BetterOption {
  food: Food;
  grams: number;
  savesKcal: number;
  moreProtein: number;
  why: string;
}

export function betterOptions(entry: { food: Food; grams: number }, foods: Food[], prefs: Preferences): BetterOption[] {
  const mine = kinds(entry.food.name);
  if (!mine.size) return [];
  const now = forAmount(entry.food.per100, entry.grams);
  const out: BetterOption[] = [];
  for (const f of foods) {
    if (f.id === entry.food.id || f.per100.kcal <= 0) continue;
    if (![...kinds(f.name)].some((k) => mine.has(k))) continue;
    if (checkFood(`${f.name} ${f.brand ?? ''}`, prefs).skip) continue;
    const alt = forAmount(f.per100, entry.grams);
    const savesKcal = now.kcal - alt.kcal;
    const moreProtein = Math.round((alt.protein - now.protein) * 10) / 10;
    // Worth showing: clearly lighter, or clearly more protein for about the same calories.
    const lighter = savesKcal >= Math.max(25, now.kcal * 0.15);
    const leaner = moreProtein >= 5 && alt.kcal <= now.kcal * 1.1;
    if (!lighter && !leaner) continue;
    const why = [lighter ? `${savesKcal} kcal less` : '', moreProtein >= 3 ? `${moreProtein} g more protein` : '', alt.sugar < now.sugar - 5 ? `${Math.round(now.sugar - alt.sugar)} g less sugar` : '']
      .filter(Boolean)
      .join(', ');
    out.push({ food: f, grams: entry.grams, savesKcal, moreProtein, why });
  }
  return out.sort((a, b) => b.savesKcal + b.moreProtein * 8 - (a.savesKcal + a.moreProtein * 8)).slice(0, 4);
}

/** A food that, on past days, usually came with going over the calorie goal. */
export interface Pattern {
  foodId: string;
  name: string;
  days: number;
  overDays: number;
}

export type Watched = 'sodium' | 'satFat' | 'sugar' | 'fat';

/**
 * A lighter version of one food for a nutrient that's running high: the same
 * kind of food with clearly less of it (at least 30% less), and not more
 * calories. Processed meats, fries and the like are never "the better option".
 */
export function lighterFor(entry: { food: Food; grams: number }, foods: Food[], prefs: Preferences, nutrient: Watched): BetterOption | null {
  const mine = kinds(entry.food.name);
  if (!mine.size) return null;
  const now = forAmount(entry.food.per100, entry.grams);
  let best: BetterOption | null = null;
  let bestCut = 0;
  for (const f of foods) {
    if (f.id === entry.food.id || NEVER_BETTER.test(f.name) || ![...kinds(f.name)].some((k) => mine.has(k))) continue;
    if (nutrient !== 'fat' && f.per100[nutrient] == null) continue; // unknown isn't "less"
    if (checkFood(`${f.name} ${f.brand ?? ''}`, prefs).skip) continue;
    const alt = forAmount(f.per100, entry.grams);
    const cut = now[nutrient] - alt[nutrient];
    if (cut < now[nutrient] * 0.3 || alt.kcal > now.kcal * 1.15) continue;
    if (cut > bestCut) {
      bestCut = cut;
      const unit = nutrient === 'sodium' ? 'mg' : 'g';
      best = { food: f, grams: entry.grams, savesKcal: now.kcal - alt.kcal, moreProtein: Math.round((alt.protein - now.protein) * 10) / 10, why: `${Math.round(cut * (unit === 'g' ? 10 : 1)) / (unit === 'g' ? 10 : 1)} ${unit} less ${NAMES[nutrient]}` };
    }
  }
  return best;
}

const NAMES: Record<Watched, string> = { sodium: 'sodium', satFat: 'saturated fat', sugar: 'sugar', fat: 'fat' };
const NEVER_BETTER = /\b(bacon|sausage|salami|pepperoni|hot dog|fries|donut|doughnut|chips|candy)\b/i;
