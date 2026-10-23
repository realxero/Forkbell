// Smart suggestions for a diary day: lighter drink swaps, protein and fiber
// ideas, and a sodium heads-up. Rules only, no AI, so they're instant and
// work offline. Every food offered passes your allergies, diet and dislikes.
import { checkFood, type Preferences } from './food-safety.ts';
import { forAmount } from './nutrition.ts';
import type { DiaryDay, DiaryEntry, Food, RecentFood } from './types.ts';

export const SODIUM_LIMIT_MG = 2300;
export const FIBER_TARGET_G = 28;

export interface SuggestedItem {
  food: Food;
  grams: number;
}
export interface Suggestion {
  /** stable per day, for "hide for today" */
  key: string;
  kind: 'swap' | 'protein' | 'fiber' | 'sodium';
  title: string;
  detail: string;
  items: SuggestedItem[];
  /** for swaps: the entry it would replace */
  replaces?: DiaryEntry;
}

const THRESHOLDS = {
  gentle: { sugar: 25, protein: 30, fiber: Infinity, sodium: 1.0, after: 14 },
  balanced: { sugar: 15, protein: 15, fiber: 8, sodium: 0.85, after: 12 },
  thorough: { sugar: 8, protein: 10, fiber: 5, sodium: 0.7, after: 0 },
} as const;

const SUGARY = /\b(cola|coke|pepsi|soda|pop|lemonade|sweet tea|iced tea|energy drink|red bull|monster|sports drink|gatorade|powerade|juice|frappuccino|sweetened|slushie|punch|sprite|fanta|dr pepper|mountain dew|root beer|ginger ale)\b/i;
const ZERO = /\b(zero|diet|sugar[ -]?free|unsweetened|no sugar|light|lite)\b/i;

/** The zero-sugar twin for a sugary drink, from the built-in foods. */
function twinFor(name: string, foods: Food[]) {
  const n = name.toLowerCase();
  const key = /cola|coke|pepsi|dr pepper|root beer/.test(n) ? 'cola-zero' : /energy|red bull|monster/.test(n) ? 'energy-drink-zero' : /tea/.test(n) ? 'iced-tea-unsweetened' : 'sparkling-water';
  return foods.find((f) => f.source === 'builtin' && f.sourceId === key) ?? null;
}

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/** A sensible portion: the food's own portion or serving if it has one, else enough to matter, capped. */
function portion(food: Food, wantGrams: number) {
  const named = food.portions[0]?.grams ?? food.servingGrams;
  if (named && named > 0) {
    const times = Math.max(1, Math.min(3, Math.round(wantGrams / named)));
    return named * times;
  }
  return round5(Math.min(300, Math.max(30, wantGrams)));
}

export function suggestForDay(opts: {
  day: DiaryDay;
  foods: Food[];
  recent: RecentFood[];
  prefs: Preferences;
  /** hour of day on the phone, for today */
  hour: number;
  isToday: boolean;
  /** suggestions you hid today */
  hidden?: string[];
}): Suggestion[] {
  const { day, prefs } = opts;
  if (!prefs.suggestions.enabled) return [];
  const t = THRESHOLDS[prefs.suggestions.strictness];
  const out: Suggestion[] = [];
  const ok = (f: Food) => !checkFood(`${f.name} ${f.brand ?? ''}`, prefs).skip;
  // Foods you log first, then the rest; never the same food twice.
  const pool: Food[] = [];
  const seen = new Set<string>();
  for (const f of [...opts.recent.map((r) => r.food), ...opts.foods]) if (!seen.has(f.id) && ok(f)) (seen.add(f.id), pool.push(f));
  const kcalLeft = day.goals.kcal !== null ? day.goals.kcal - day.totals.kcal : null;
  const lateEnough = !opts.isToday || opts.hour >= t.after;

  if (prefs.suggestions.drinks) {
    for (const e of day.entries) {
      const n = forAmount(e.food.per100, e.grams);
      if (!SUGARY.test(e.food.name) || ZERO.test(e.food.name) || n.sugar < t.sugar) continue;
      if (checkFood(`${e.food.name} ${e.food.brand ?? ''}`, prefs).reasons.includes('on your never-suggest list')) continue;
      const twin = twinFor(e.food.name, opts.foods);
      if (!twin || !ok(twin)) continue;
      const saves = n.kcal - forAmount(twin.per100, e.grams).kcal;
      out.push({
        key: `swap:${e.id}`,
        kind: 'swap',
        title: `Swap ${e.food.name} for ${twin.name}`,
        detail: `Saves about ${saves} kcal and ${Math.round(n.sugar)} g of sugar.`,
        items: [{ food: twin, grams: e.grams }],
        replaces: e,
      });
    }
  }

  if (prefs.suggestions.protein && day.goals.protein !== null && lateEnough) {
    const gap = day.goals.protein - day.totals.protein;
    if (gap >= t.protein) {
      const want = Math.min(gap, 35);
      const lean = pool
        .filter((f) => f.per100.kcal > 0 && (f.per100.protein * 4) / f.per100.kcal >= 0.35 && f.per100.protein >= 8)
        .map((f) => ({ food: f, grams: portion(f, (want / f.per100.protein) * 100) }))
        .filter((x) => kcalLeft === null || forAmount(x.food.per100, x.grams).kcal <= Math.max(kcalLeft, 150))
        .slice(0, 3);
      if (lean.length)
        out.push({
          key: 'protein',
          kind: 'protein',
          title: `${Math.round(gap)} g of protein to go`,
          detail: kcalLeft !== null ? `Ideas that fit the ${Math.max(0, kcalLeft)} kcal you have left.` : 'Lean ideas, foods you log first.',
          items: lean,
        });
    }
  }

  if (prefs.suggestions.fiber && lateEnough && day.entries.length) {
    const gap = FIBER_TARGET_G - day.totals.fiber;
    if (gap >= t.fiber) {
      const rich = pool
        .filter((f) => (f.per100.fiber ?? 0) >= 4 && f.per100.kcal < 450)
        .map((f) => ({ food: f, grams: portion(f, (Math.min(gap, 10) / (f.per100.fiber ?? 1)) * 100) }))
        .slice(0, 3);
      if (rich.length) out.push({ key: 'fiber', kind: 'fiber', title: `Fiber is at ${Math.round(day.totals.fiber)} g of about ${FIBER_TARGET_G}`, detail: 'Beans, berries, oats and vegetables close the gap.', items: rich });
    }
  }

  if (prefs.suggestions.sodium && day.totals.sodium >= SODIUM_LIMIT_MG * t.sodium) {
    const top = [...day.entries].sort((a, b) => forAmount(b.food.per100, b.grams).sodium - forAmount(a.food.per100, a.grams).sodium)[0];
    if (top) {
      out.push({
        key: 'sodium',
        kind: 'sodium',
        title: `Sodium is at ${Math.round((100 * day.totals.sodium) / SODIUM_LIMIT_MG)}% of the daily limit`,
        detail: `${top.food.name} is the biggest part (${forAmount(top.food.per100, top.grams).sodium.toLocaleString()} mg). Water and fresh foods help balance the rest of the day.`,
        items: [],
      });
    }
  }
  return out.filter((s) => !(opts.hidden ?? []).includes(s.key));
}
