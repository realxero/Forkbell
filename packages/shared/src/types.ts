export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

/** Nutrition per 100 g (or 100 ml, treated as grams). Always stored this way. */
export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  /** milligrams */
  sodium?: number | null;
}

export type FoodSource = 'custom' | 'off' | 'usda';

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  sourceId: string | null;
  per100: Per100;
  /** grams in one serving, if known */
  servingGrams: number | null;
  servingLabel: string | null;
}

/** A search hit from an outside database, not saved yet. */
export type FoodCandidate = Omit<Food, 'id'>;

export interface DiaryEntry {
  id: string;
  date: string;
  meal: Meal;
  grams: number;
  food: Food;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface Goals {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface DiaryDay {
  date: string;
  entries: DiaryEntry[];
  totals: Totals;
  goals: Goals;
}

export interface Me {
  id: string;
  name: string | null;
  email: string | null;
  goals: Goals;
}
