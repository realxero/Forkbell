// Your meal slots: their names, which show, and in what order.
import { MEALS, type Meal } from './types.ts';

export const DEFAULT_MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks', meal5: 'Meal 5', meal6: 'Meal 6' };
export type MealSlot = { key: Meal; name: string; show: boolean };
export const DEFAULT_MEAL_SLOTS: MealSlot[] = MEALS.map((key) => ({ key, name: DEFAULT_MEAL_NAMES[key], show: !key.startsWith('meal') }));

/** All six slots in your order (any missing are added at the end), with names. */
export function mealSlots(saved: MealSlot[] | null | undefined): MealSlot[] {
  const seen = new Set<Meal>();
  const out: MealSlot[] = [];
  for (const s of saved ?? []) {
    if (!MEALS.includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    out.push({ key: s.key, name: s.name.trim() || DEFAULT_MEAL_NAMES[s.key], show: s.show });
  }
  for (const d of DEFAULT_MEAL_SLOTS) if (!seen.has(d.key)) out.push(d);
  // At least one slot always shows.
  if (!out.some((s) => s.show)) out[0] = { ...out[0]!, show: true };
  return out;
}

/** The slots that show, in order. */
export const shownMealSlots = (saved: MealSlot[] | null | undefined) => mealSlots(saved).filter((s) => s.show);
