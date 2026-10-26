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
  /** saturated fat, grams */
  satFat?: number | null;
  /** vitamins and minerals, in mg or µg per 100 g (see MICROS), when the food lists them */
  micros?: import('./micros.ts').Micros | null;
}

export type FoodSource = 'custom' | 'off' | 'usda' | 'builtin' | 'recipe';

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
  /** what kind of data this is, on search results (see food-sources.ts) */
  kind?: DataKind;
}

/**
 * How a food's numbers were made, most trustworthy first: lab analysis (USDA
 * Foundation and SR Legacy), USDA's survey of everyday dishes, a maker's
 * label (USDA branded foods), or community-entered (Open Food Facts).
 */
export type DataKind = 'lab' | 'survey' | 'label' | 'community' | 'builtin' | 'yours' | 'recipe';

/** A search hit from an outside database, not saved yet. */
export type FoodCandidate = Omit<Food, 'id'>;

export interface DiaryEntry {
  id: string;
  date: string;
  meal: Meal;
  grams: number;
  food: Food;
  /** how the amount was said ("1" "serving", "4" "oz"); grams is what the numbers use */
  amount?: number | null;
  unit?: string | null;
  /** this entry's own name, shown instead of the food's */
  name?: string | null;
}

/** What to call an entry: its own name, or its food's. */
export const entryName = (e: Pick<DiaryEntry, 'name' | 'food'>) => e.name?.trim() || e.food.name;

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
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
  /** you marked this day finished: everything eaten is logged */
  complete?: boolean;
}

export interface Me {
  id: string;
  name: string | null;
  email: string | null;
  goals: Goals;
  weightUnit: 'lb' | 'kg';
  preferences: import('./food-safety.ts').Preferences;
  /** goals for particular weekdays, "0" = Sunday */
  weekdayGoals: Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', Goals>>;
}

/** A food you've logged before, with the amount you used last time. */
export interface RecentFood {
  food: Food;
  lastGrams: number;
  /** how last time's amount was said, when it was ("1" "serving") */
  lastAmount?: number | null;
  lastUnit?: string | null;
  lastMeal: Meal;
  uses: number;
}

export interface RecentFoods {
  /** most recently logged first */
  recent: RecentFood[];
  /** most logged in the last 60 days first */
  frequent: RecentFood[];
}

export interface SavedMeal {
  id: string;
  name: string;
  items: { food: Food; grams: number }[];
}

export interface Recipe {
  food: Food;
  servings: number;
  cookedGrams: number | null;
  items: { food: Food; grams: number }[];
}

/** Settings → Sign-in and security. */
export interface AccountSecurity {
  /** Whether this server lets people sign in with a username and password. */
  passwordLogin: boolean;
  /** The single sign-on's name (e.g. Authelia), or null if it's off. */
  sso: string | null;
  /** How the account was made: an Authelia account can also have a password. */
  accountKind: 'sso' | 'password';
  username: string | null;
  passwordChangedAt: string | null;
  sessions: { id: string; method: 'sso' | 'password' | null; device: string | null; createdAt: string; expiresAt: string; current: boolean }[];
}

/** GET /auth/methods: how to sign in to a server, before anyone has. */
export interface SignInMethods {
  server: { version: string; commit: string | null; buildNumber: string | null; builtAt: string | null };
  sso: { name: string } | null;
  password: { signup: 'off' | 'code' | 'open' } | null;
}
