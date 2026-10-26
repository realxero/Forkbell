import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from './dates.ts';
import { presetGoals, computeStreaks, estimateEnergy, milestones, planGoal, weekStart, weightTrend, type WeighIn } from './progress.ts';

const today = '2026-10-23';

/** 60 days, eating 2,500 and losing 0.5 kg a week, with ±0.6 kg daily water noise. */
function scenario() {
  const weighIns: WeighIn[] = [];
  const intake: Record<string, number> = {};
  for (let i = 60; i >= 1; i--) {
    const d = addDays(today, -i);
    const noise = [0.6, -0.4, 0.2, -0.6, 0.3, 0, -0.2][i % 7]!;
    weighIns.push({ date: d, weightKg: 90 - ((60 - i) * 0.5) / 7 + noise, bodyFat: null });
    intake[d] = 2500;
  }
  return { weighIns, intake };
}

test('the trend shrugs off a single heavy morning', () => {
  const t = weightTrend([
    { date: '2026-10-01', weightKg: 80, bodyFat: null },
    { date: '2026-10-02', weightKg: 80, bodyFat: null },
    { date: '2026-10-03', weightKg: 82, bodyFat: null },
  ]);
  assert.ok(Math.abs(t.at(-1)!.trendKg - 80.2) < 0.01);
});

test('adaptive burn recovers what the numbers imply', () => {
  const { weighIns, intake } = scenario();
  const e = estimateEnergy(intake, weightTrend(weighIns), today);
  // 2,500 + 0.5 kg × 7,700 / 7 ≈ 3,050
  assert.ok(e.kcal !== null && Math.abs(e.kcal - 3050) < 120, `got ${e.kcal}`);
  assert.equal(e.confidence, 'high');
  assert.ok(Math.abs(e.rateKgPerWeek! + 0.5) < 0.1);
});

test('no estimate until there is enough to go on', () => {
  const e = estimateEnergy({ [addDays(today, -1)]: 2000 }, weightTrend([{ date: addDays(today, -1), weightKg: 80, bodyFat: null }]), today);
  assert.equal(e.kcal, null);
  assert.ok(e.needs);
});

test('goal plan: a date range, a sustainable suggestion, and honest warnings', () => {
  const { weighIns, intake } = scenario();
  const series = weightTrend(weighIns);
  const energy = estimateEnergy(intake, series, today);
  const plan = planGoal({ currentKg: series.at(-1)!.trendKg, goalKg: 80, goalDate: null, today, energy });
  assert.equal(plan.pace, 'toward');
  assert.ok(plan.estimate && plan.estimate.from < plan.estimate.to);
  assert.ok(plan.suggestedKcal! >= 2400 && plan.suggestedKcal! < energy.kcal!);

  const rushed = planGoal({ currentKg: series.at(-1)!.trendKg, goalKg: 70, goalDate: addDays(today, 30), today, energy });
  assert.ok(rushed.warnings.some((w) => w.includes('1% of body weight')));
  assert.ok(rushed.warnings.some((w) => w.includes('1,200')));
  assert.equal(rushed.kcalForDate, null, 'a target under the floor is never offered');
  const inLb = planGoal({ currentKg: 80, goalKg: 70, goalDate: addDays(today, 30), today, energy, unit: 'lb' });
  assert.ok(inLb.warnings[0]!.includes(' lb a week'));
});

test('streaks: today only counts once logged; rest weeks never break a workout streak mid-week', () => {
  const logged = [-3, -2, -1].map((n) => addDays(today, n));
  assert.equal(computeStreaks(logged, [], 3, today).foodDays, 3);
  assert.equal(computeStreaks([...logged, today], [], 3, today).foodDays, 4);
  assert.equal(weekStart('2026-10-23'), '2026-10-19'); // a Friday → Monday
  const lastWeek = ['2026-10-12', '2026-10-14', '2026-10-16'];
  const weekBefore = ['2026-10-05', '2026-10-07', '2026-10-09'];
  const s = computeStreaks([], [...weekBefore, ...lastWeek, '2026-10-20'], 3, today);
  assert.equal(s.workoutWeeks, 2);
  assert.equal(s.workoutsThisWeek, 1);
});

test('weight milestones follow the trend toward the goal', () => {
  const { weighIns } = scenario();
  const series = weightTrend(weighIns);
  const m = milestones({ loggedDates: [], workoutDates: [], series, goalKg: 80, unit: 'lb' });
  const five = m.find((x) => x.key === 'weight-5')!;
  assert.ok(five.reached && five.date);
  assert.equal(five.detail, 'About the weight of a bag of flour.');
  assert.equal(m.find((x) => x.key === 'goal')!.reached, false);
});

test('goal presets add up and respect the floor', () => {
  const g = presetGoals('lose', 2600, 80);
  assert.equal(g.kcal, 2160); // 2600 - 80 × 0.005 × 7700 / 7 = 2160
  assert.equal(g.protein, 128);
  assert.ok(Math.abs(g.protein * 4 + g.carbs * 4 + g.fat * 9 - g.kcal) < 15);
  assert.equal(presetGoals('lose', 1250, 50).kcal, 1200);
});

import { recipePer100 } from './nutrition.ts';
test('recipes: numbers per 100 g of the finished dish', () => {
  const rice = { per100: { kcal: 360, protein: 7, carbs: 79, fat: 0.6, fiber: 1, sugar: 0, sodium: 5 } };
  const beans = { per100: { kcal: 130, protein: 9, carbs: 23, fat: 0.5, fiber: 7, sugar: 0, sodium: 2 } };
  const raw = recipePer100([{ food: rice, grams: 200 }, { food: beans, grams: 300 }]);
  assert.equal(raw.weight, 500);
  assert.equal(raw.total.kcal, 720 + 390);
  assert.equal(raw.per100.kcal, 222);
  // Rice soaks up water: weighed after cooking, the same food is spread over more grams.
  const cooked = recipePer100([{ food: rice, grams: 200 }, { food: beans, grams: 300 }], 1110);
  assert.equal(cooked.per100.kcal, 100);
});

test('streak milestones are cheered once per streak', async () => {
  const { computeStreaks, streakCheer, addDays } = await import('./index.ts');
  const today = '2026-10-25';
  const days = (n: number, end = today) => Array.from({ length: n }, (_, i) => addDays(end, -i));
  const s7 = computeStreaks(days(7), [], 3, today);
  assert.equal(s7.foodSince, addDays(today, -6));
  const cheer = streakCheer(s7, []);
  assert.equal(cheer?.count, 7);
  assert.equal(cheer?.kind, 'food');
  // Shown already: nothing more until 14.
  assert.equal(streakCheer(s7, [cheer!.key]), null);
  assert.equal(streakCheer(computeStreaks(days(2), [], 3, today), []), null);
  // Tomorrow, still 7-ish: the same streak, the same key.
  const s8 = computeStreaks(days(8, addDays(today, 1)), [], 3, addDays(today, 1));
  assert.equal(streakCheer(s8, [cheer!.key]), null);
  // A new streak after a break can earn 3 again.
  const fresh = computeStreaks(days(3, addDays(today, 10)), [], 3, addDays(today, 10));
  assert.equal(streakCheer(fresh, [cheer!.key])?.count, 3);
});

test('training streaks cheer at 2, 4 and 8 weeks', async () => {
  const { computeStreaks, streakCheer, addDays } = await import('./index.ts');
  const today = '2026-10-25'; // a Sunday
  const workouts = Array.from({ length: 4 }, (_, w) => [0, 2, 4].map((d) => addDays('2026-10-19', d - w * 7))).flat();
  const s = computeStreaks([], workouts, 3, today);
  assert.equal(s.workoutWeeks, 4);
  assert.equal(streakCheer(s, [])?.title, '4 weeks of training in a row!');
});
