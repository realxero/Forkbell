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

export type FoodSource = 'custom' | 'off' | 'usda' | 'builtin';

/** A named amount, like "1 large" = 50 g. */
export interface Portion {
  label: string;
  grams: number;
}

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
  /** EAN/UPC digits, when known */
  barcode: string | null;
  portions: Portion[];
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
  weightUnit: 'lb' | 'kg';
}

/** A food you've logged before, with the amount you used last time. */
export interface RecentFood {
  food: Food;
  lastGrams: number;
  lastMeal: Meal;
  uses: number;
}

export interface RecentFoods {
  /** most recently logged first */
  recent: RecentFood[];
  /** most logged in the last 60 days first */
  frequent: RecentFood[];
}
