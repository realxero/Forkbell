// Plan a day (or a week) from foods you already eat and the built-in ones:
// a protein, a starch and a vegetable or fruit per meal, sized to what's left
// of your calories and protein. Never uses a food your allergies, diet or
// dislikes rule out, and never repeats a food within a day.
import { checkFood, type Preferences } from './food-safety.ts';
import { forAmount, sumEntries } from './nutrition.ts';
import { addDays } from './dates.ts';
import { MEALS, type DiaryDay, type Food, type Meal, type RecentFood } from './types.ts';

export type Role = 'protein' | 'starch' | 'veg' | 'fruit' | 'dairy' | 'fat' | 'other';

const ROLE_WORDS: [Role, RegExp][] = [
  ['protein', /\b(chicken|beef|turkey|pork|steak|salmon|tuna|shrimp|tilapia|cod|fish|tofu|tempeh|egg white|eggs?|lentils?|beans?|chickpeas?|edamame|cottage cheese|greek yogurt|jerky|protein)\b/i],
  ['starch', /\b(rice|pasta|potato|sweet potato|bread|bagel|tortilla|oats?|quinoa|couscous|noodles?|corn|cereal|granola)\b/i],
  ['veg', /\b(broccoli|spinach|kale|lettuce|romaine|carrots?|tomato(es)?|cucumber|peppers?|onion|mushrooms?|green beans|zucchini|cauliflower|peas|asparagus|brussels|salad|vegetables?)\b/i],
  ['fruit', /\b(apple|banana|orange|strawberr(y|ies)|blueberr(y|ies)|raspberr(y|ies)|grapes|pineapple|mango|watermelon|pear|peach|berries|fruit)\b/i],
  ['dairy', /\b(milk|yogurt|cheese)\b/i],
  ['fat', /\b(oil|butter|almonds?|walnuts?|cashews?|peanuts?|avocado|peanut butter|nuts?)\b/i],
];

// Drinks, condiments and sweets are never a planned meal part.
const NOT_A_PART = /\b(oil|butter|cream|juice|drink|cola|soda|tea|coffee|sauce|ketchup|mayonnaise|syrup|sugar|honey|salt|chocolate|ice cream|popcorn|dressing|candy)\b/i;
const FAT = /\b(peanut butter|almonds?|walnuts?|cashews?|peanuts?|avocado|nuts?)\b/i;

export function roleOf(food: Food): Role {
  if (/\b(peanut|almond|cashew) butter\b/i.test(food.name)) return 'fat';
  if (NOT_A_PART.test(food.name)) return 'other';
  if (FAT.test(food.name)) return 'fat';
  for (const [role, re] of ROLE_WORDS) if (re.test(food.name)) return role;
  return 'other';
}

/** Share of the day's calories each meal gets. */
const SHARE: Record<Meal, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snacks: 0.1 };
const SHAPE: Record<Meal, Role[]> = { breakfast: ['protein', 'starch', 'fruit'], lunch: ['protein', 'starch', 'veg'], dinner: ['protein', 'starch', 'veg'], snacks: ['fruit', 'fat'] };
// Breakfast proteins that read like breakfast.
const BREAKFAST = /\b(eggs?|egg white|greek yogurt|cottage cheese|oats?|bagel|bread|cereal|granola|banana|berries|strawberr|blueberr)\b/i;
// Concentrated foods (powders, nuts) make poor main dishes.
const MAX_GRAMS: Record<Role, number> = { protein: 250, starch: 300, veg: 200, fruit: 200, dairy: 250, fat: 30, other: 200 };

export interface PlannedItem {
  food: Food;
  grams: number;
  meal: Meal;
}
export interface DayPlan {
  date: string;
  items: PlannedItem[];
  kcal: number;
  protein: number;
  notes: string[];
}

/** Small seeded random number generator, so "shuffle" is repeatable for tests. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function planDay(opts: {
  day: DiaryDay;
  foods: Food[];
  recent: RecentFood[];
  prefs: Preferences;
  kcalTarget: number;
  proteinTarget: number | null;
  seed?: number;
  /** foods to avoid repeating (e.g. yesterday's dinner) */
  avoidIds?: string[];
}): DayPlan {
  const random = rng(opts.seed ?? 1);
  const usual = new Set(opts.recent.map((r) => r.food.id));
  const allowed = (f: Food) => !checkFood(`${f.name} ${f.brand ?? ''}`, opts.prefs).skip && f.per100.kcal > 0;
  const seen = new Set<string>();
  const pool = [...opts.recent.map((r) => r.food), ...opts.foods].filter((f) => !seen.has(f.id) && seen.add(f.id) && allowed(f));
  const byRole = new Map<Role, Food[]>();
  for (const f of pool) {
    const r = roleOf(f);
    // Foods you log come first, then a shuffle so plans vary.
    byRole.set(r, [...(byRole.get(r) ?? []), f]);
  }
  for (const [r, list] of byRole) byRole.set(r, list.map((f) => ({ f, k: (usual.has(f.id) ? 0 : 1) + random() })).sort((a, b) => a.k - b.k).map((x) => x.f));

  const planned = new Set([...(opts.avoidIds ?? []), ...opts.day.entries.map((e) => e.food.id)]);
  const empty = MEALS.filter((m) => !opts.day.entries.some((e) => e.meal === m));
  const kcalLeft = Math.max(0, opts.kcalTarget - opts.day.totals.kcal);
  const proteinLeft = Math.max(0, (opts.proteinTarget ?? 0) - opts.day.totals.protein);
  const shareTotal = empty.reduce((s, m) => s + SHARE[m], 0) || 1;
  const items: PlannedItem[] = [];

  const pick = (role: Role, meal: Meal) => {
    const list = byRole.get(role) ?? [];
    const f = list.find((x) => !planned.has(x.id) && (meal !== 'breakfast' || role === 'fruit' || role === 'veg' || BREAKFAST.test(x.name)));
    if (f) planned.add(f.id);
    return f ?? null;
  };

  for (const meal of empty) {
    const kcal = (kcalLeft * SHARE[meal]) / shareTotal;
    const protein = (proteinLeft * SHARE[meal]) / shareTotal;
    const parts: PlannedItem[] = [];
    let used = 0;
    for (const role of SHAPE[meal]) {
      const f = pick(role, meal);
      if (!f) continue;
      let grams: number;
      if (role === 'protein') grams = protein > 0 ? (protein / Math.max(f.per100.protein, 1)) * 100 : (kcal * 0.4 * 100) / f.per100.kcal;
      else if (role === 'veg' || role === 'fruit') grams = f.portions[0]?.grams ?? f.servingGrams ?? 120;
      else grams = 0; // starch and fats fill what's left, below
      grams = Math.min(MAX_GRAMS[role], Math.max(role === 'fat' ? 10 : 30, Math.round(grams / 5) * 5));
      if (role === 'starch' || role === 'fat') parts.push({ food: f, grams: -1, meal });
      else {
        parts.push({ food: f, grams, meal });
        used += forAmount(f.per100, grams).kcal;
      }
    }
    // Starch (or fat for snacks) takes up the rest of the meal's calories.
    for (const p of parts.filter((x) => x.grams === -1)) {
      const g = ((kcal - used) * 100) / p.food.per100.kcal;
      p.grams = Math.min(MAX_GRAMS[roleOf(p.food)], Math.max(roleOf(p.food) === 'fat' ? 10 : 30, Math.round(g / 5) * 5));
      used += forAmount(p.food.per100, p.grams).kcal;
    }
    items.push(...parts.filter((p) => p.grams > 0));
  }

  const totals = sumEntries(items.map((i) => ({ grams: i.grams, food: i.food })));
  const notes: string[] = [];
  if (!empty.length) notes.push('Every meal already has food. Clear one to plan it.');
  if (kcalLeft > 0 && Math.abs(totals.kcal - kcalLeft) > kcalLeft * 0.15) notes.push(`About ${totals.kcal.toLocaleString()} of the ${Math.round(kcalLeft).toLocaleString()} kcal left. Adjust amounts before adding.`);
  if (proteinLeft > 0 && totals.protein < proteinLeft * 0.85) notes.push(`About ${Math.round(totals.protein)} g of the ${Math.round(proteinLeft)} g protein left.`);
  return { date: opts.day.date, items, kcal: totals.kcal, protein: totals.protein, notes };
}

/** Plans for several days in a row, never repeating the previous day's dinner. */
export function planDays(days: DiaryDay[], opts: Omit<Parameters<typeof planDay>[0], 'day'>) {
  const out: DayPlan[] = [];
  let prevDinner: string[] = [];
  for (const [i, day] of days.entries()) {
    const plan = planDay({ ...opts, day, seed: (opts.seed ?? 1) + i * 7919, avoidIds: prevDinner });
    prevDinner = plan.items.filter((x) => x.meal === 'dinner').map((x) => x.food.id);
    out.push(plan);
  }
  return out;
}

// Shopping list -------------------------------------------------------------------------
export type Aisle = 'Produce' | 'Meat and fish' | 'Dairy and eggs' | 'Bread and grains' | 'Pantry' | 'Drinks' | 'Other';
const AISLES: [Aisle, RegExp][] = [
  ['Dairy and eggs', /\b(milk|yogurt|cheese|butter|cream|eggs?|egg white)\b/i],
  ['Meat and fish', /\b(chicken|beef|turkey|pork|steak|salmon|tuna|shrimp|tilapia|cod|fish|bacon|ham|sausage)\b/i],
  ['Produce', /\b(apple|banana|orange|berr(y|ies)|grapes|pineapple|mango|melon|pear|peach|avocado|broccoli|spinach|kale|lettuce|romaine|carrots?|tomato(es)?|cucumber|peppers?|onion|mushrooms?|beans? green|green beans|zucchini|cauliflower|asparagus|brussels|potato|sweet potato|dates|raisins)\b/i],
  ['Bread and grains', /\b(bread|bagel|tortilla|rice|pasta|oats?|quinoa|cereal|couscous|noodles?)\b/i],
  ['Drinks', /\b(juice|cola|soda|water|tea|coffee|drink)\b/i],
  ['Pantry', /\b(oil|peanut butter|almonds?|walnuts?|cashews?|peanuts?|chia|honey|maple|sugar|salt|soy sauce|ketchup|mayonnaise|hummus|lentils?|chickpeas?|beans?|tofu|popcorn|chocolate)\b/i],
];
export const aisleOf = (name: string): Aisle => AISLES.find(([, re]) => re.test(name))?.[0] ?? 'Other';

export interface ShoppingItem {
  name: string;
  grams: number;
  aisle: Aisle;
}
/** Add up the same foods across days, grouped by aisle. */
export function shoppingList(entries: { food: Food; grams: number }[]): ShoppingItem[] {
  const by = new Map<string, ShoppingItem>();
  for (const e of entries) {
    const name = e.food.brand ? `${e.food.name} (${e.food.brand})` : e.food.name;
    const cur = by.get(name) ?? { name, grams: 0, aisle: aisleOf(e.food.name) };
    cur.grams += e.grams;
    by.set(name, cur);
  }
  const order: Aisle[] = ['Produce', 'Meat and fish', 'Dairy and eggs', 'Bread and grains', 'Pantry', 'Drinks', 'Other'];
  return [...by.values()].sort((a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name));
}

export const nextDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i));
