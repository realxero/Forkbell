// Smart starting targets: calories from your measured burn (or an estimate
// from your body until there's enough data), and macros from your goal and
// how you train. Evidence-based ranges, explained in plain words; never
// under 1,200 kcal, never faster than about 1% of body weight a week.
import { fitMacros, MIN_SUGGESTED_KCAL } from './progress.ts';

export type BodyGoal = 'lose' | 'recomp' | 'maintain' | 'gain';
export type TrainingFocus = 'none' | 'health' | 'size' | 'strength' | 'both';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };

/** Mifflin–St Jeor resting burn times activity: a starting estimate until your own numbers take over. */
export function estimateBurn(o: { sex: 'male' | 'female'; age: number; heightCm: number; weightKg: number; activity: ActivityLevel }) {
  const bmr = 10 * o.weightKg + 6.25 * o.heightCm - 5 * o.age + (o.sex === 'male' ? 5 : -161);
  return Math.round(bmr * ACTIVITY_FACTOR[o.activity]);
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** kg a week this aims for, + gain / - lose */
  weeklyKg: number;
  why: string[];
}

export function smartTargets(o: { goal: BodyGoal; focus: TrainingFocus; weightKg: number; burnKcal: number; goalWeightKg?: number | null; heightCm?: number | null; measured?: boolean; unit?: 'lb' | 'kg' }): Targets {
  const pace = (kg: number) => (o.unit === 'lb' ? `${(Math.abs(kg) * 2.20462).toFixed(1)} lb` : `${Math.abs(kg).toFixed(2)} kg`);
  const lifting = o.focus === 'size' || o.focus === 'strength' || o.focus === 'both';
  const why: string[] = [];

  // Calories: a pace that keeps muscle.
  let weeklyKg = 0;
  if (o.goal === 'lose') weeklyKg = -o.weightKg * (lifting ? 0.005 : 0.0075);
  if (o.goal === 'recomp') weeklyKg = -o.weightKg * 0.0025;
  if (o.goal === 'gain') weeklyKg = o.weightKg * (o.focus === 'size' || o.focus === 'both' ? 0.0035 : o.focus === 'strength' ? 0.002 : 0.0025);
  const raw = o.burnKcal + (weeklyKg * 7700) / 7;
  const kcal = Math.max(MIN_SUGGESTED_KCAL, Math.round(raw / 10) * 10);
  if (kcal !== Math.round(raw / 10) * 10) why.push('Calories are held at the 1,200 kcal floor: below that it’s hard to get enough nutrients from food, and very low-calorie diets need medical supervision.');
  const burnNote = o.measured ? 'your measured daily burn' : 'an estimate of your daily burn (it updates once you’ve logged and weighed in for about two weeks)';
  const floored = kcal !== Math.round(raw / 10) * 10;
  why.push(
    floored && kcal >= o.burnKcal
      ? `${burnNote[0]!.toUpperCase()}${burnNote.slice(1)} is about ${o.burnKcal.toLocaleString()} kcal, so the floor is above it. If that seems low, check that the days you've logged are complete.`
      : o.goal === 'lose'
      ? `About ${Math.round(o.burnKcal - kcal)} kcal under ${burnNote}, to lose around ${pace(weeklyKg)} a week${lifting ? ', a slower pace that protects your strength' : ''}.`
      : o.goal === 'recomp'
        ? `A small deficit under ${burnNote}: you lose fat slowly while training builds muscle. Expect the scale to move slowly.`
        : o.goal === 'gain'
          ? `About ${Math.round(kcal - o.burnKcal)} kcal over ${burnNote}, a lean gain of around ${pace(weeklyKg)} a week${o.focus === 'strength' ? ' (strength needs less surplus than size)' : ''}.`
          : `Matches ${burnNote}.`,
  );

  // Protein: per kg, based on a sensible reference weight when you carry extra.
  const bmi = o.heightCm ? o.weightKg / (o.heightCm / 100) ** 2 : null;
  const refKg = bmi && bmi > 30 && o.heightCm ? 25 * (o.heightCm / 100) ** 2 : o.weightKg; // weight at a BMI of 25
  const perKg = o.goal === 'lose' || o.goal === 'recomp' ? (lifting ? 2.2 : 2.0) : o.goal === 'gain' ? (lifting ? 2.0 : 1.8) : lifting ? 1.8 : 1.6;
  const wantProtein = Math.round(refKg * perKg);
  const wantFat = Math.max(Math.round(0.6 * o.weightKg), Math.round((kcal * (lifting ? 0.25 : 0.3)) / 9));
  // On a low calorie goal the full protein and fat would leave no room for carbs: they give way a little.
  const { protein, carbs, fat } = fitMacros(kcal, wantProtein, wantFat, refKg);
  if (protein < wantProtein || fat < wantFat) why.push('Protein and fat are trimmed a little so the calories still leave room for at least 50 g of carbs.');
  why.push(`${perKg} g of protein per kg${refKg !== o.weightKg ? ' of a healthy reference weight' : ''}: ${o.goal === 'lose' || o.goal === 'recomp' ? 'keeps muscle while you lose fat' : lifting ? 'enough to build muscle' : 'covers your needs'}.`);

  // Fat: a share of calories, never too low for hormones; carbs fuel the rest.
  why.push(lifting ? 'Fat at about a quarter of calories, leaving more carbs to fuel training.' : 'Fat at about 30% of calories; carbs make up the rest.');
  return { kcal, protein, carbs, fat, weeklyKg: Math.round(weeklyKg * 100) / 100, why };
}
