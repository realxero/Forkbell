// Your meal slots on this phone: their names and which show, from your
// preferences. MEAL_NAMES is one shared object so every screen that names a
// meal shows your name for it; the app refreshes it whenever your account
// loads (see auth.tsx).
import { DEFAULT_MEAL_NAMES, MEALS, shownMealSlots, type Meal, type MealSlot } from '@forkbell/shared';

export const MEAL_NAMES: Record<Meal, string> = { ...DEFAULT_MEAL_NAMES };
let shown: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export function applyMealPrefs(saved: MealSlot[] | null | undefined) {
  const slots = shownMealSlots(saved);
  for (const key of MEALS) MEAL_NAMES[key] = DEFAULT_MEAL_NAMES[key];
  for (const s of slots) MEAL_NAMES[s.key] = s.name;
  shown = slots.map((s) => s.key);
}

/** The meal slots that show, in your order. */
export const shownMeals = (): Meal[] => shown;

/** The slot for this time of day, or the nearest one that shows. */
export function mealNow(base: Meal): Meal {
  if (shown.includes(base)) return base;
  const order: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const at = order.indexOf(base);
  return order.slice(at).concat(order.slice(0, at).reverse()).find((m) => shown.includes(m)) ?? shown[0] ?? 'breakfast';
}
