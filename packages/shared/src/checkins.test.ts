import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodCheckIn, planTrainingWeek, starterFor, trainingCheckIn, type FoodWeek } from './checkins.ts';
import type { Program } from './training.ts';

const week = (kcal: (number | null)[], extra: Partial<FoodWeek> = {}): FoodWeek => ({
  days: kcal.map((k, i) => ({ date: `2026-10-${String(16 + i).padStart(2, '0')}`, kcal: k, sodium: k ? 2500 : null, fiber: k ? 20 : null })),
  burn: 2600, trendFromKg: 100, trendToKg: 100, goalKg: 90, goalDate: null, calorieGoal: 2100, today: '2026-10-23', ...extra,
});

test('food check-in needs 4 logged days', () => {
  const c = foodCheckIn(week([2000, null, null, 2100, null, null, null]));
  assert.equal(c.suggestion, null);
  assert.match(c.verdict, /2 of the last 7/);
});

test('slower than planned: the intake that matches the plan, never under 1,200', () => {
  const c = foodCheckIn(week([2100, 2100, 2100, 2100, 2100, 2100, 2100], { trendToKg: 99.9 }));
  // burn 2600 and a plan of -0.5 kg a week: 2600 - 0.5 × 7700 / 7 = 2050
  assert.equal(c.suggestion?.kcal, 2050);
  assert.equal(c.suggestion?.delta, -50);
  assert.match(c.verdict, /50 less than you've been eating/);
  assert.equal(c.sodium?.daysOver, 7);
  const floor = foodCheckIn(week([1300, 1300, 1300, 1300, 1300, 1300, 1300], { trendToKg: 99.9, burn: 1400, calorieGoal: 2100 }));
  assert.equal(floor.suggestion?.kcal, 1200);
  assert.match(floor.verdict, /floor/);
});

test('faster than planned: room for more; on track: no change', () => {
  // Losing faster than planned while eating under the goal: the goal is fine, eat up to it.
  const fast = foodCheckIn(week([1800, 1800, 1800, 1800, 1800, 1800, 1800], { trendToKg: 98.9 }));
  assert.equal(fast.suggestion, null);
  assert.match(fast.verdict, /260 more than you've been eating/);
  const fastLowGoal = foodCheckIn(week([1800, 1800, 1800, 1800, 1800, 1800, 1800], { trendToKg: 98.9, calorieGoal: 1800 }));
  assert.equal(fastLowGoal.suggestion?.kcal, 2060);
  const ok = foodCheckIn(week([2100, 2100, 2100, 2100, 2100, 2100, 2100], { trendToKg: 99.5 }));
  assert.equal(ok.suggestion, null);
  assert.match(ok.verdict, /on track/);
});

test('training check-in: hard week first, then consistency, volume', () => {
  const base = { weekOf: '2026-10-19', workouts: 3, weeklyGoal: 3, sets: 60, muscles: { chest: 12, back: 12, shoulders: 10, quads: 6, hamstrings: 4, glutes: 2 }, ratedTopSets: 0, hardTopSets: 0 };
  assert.equal(trainingCheckIn({ ...base, ratedTopSets: 6, hardTopSets: 5 }).tone, 'hold');
  assert.match(trainingCheckIn({ ...base, workouts: 1 }).advice, /2 short/);
  assert.match(trainingCheckIn({ ...base, muscles: { ...base.muscles, chest: 24 } }).advice, /chest/);
  assert.equal(trainingCheckIn(base).tone, 'good');
  assert.match(trainingCheckIn({ ...base, muscles: { ...base.muscles, back: 6 } }).advice, /back/);
});

test('your week: the program continues on your days; a done day is shown, not skipped', () => {
  const r = (id: string) => ({ id, name: id, position: 0, exercises: [] });
  const program = { id: 'p', name: 'PPL', active: true, routines: [r('Push'), r('Pull'), r('Legs')], nextRoutineId: 'Pull' } as unknown as Program;
  // 2026-10-23 is a Friday; train Mon, Wed, Fri
  const plan = planTrainingWeek(program, [1, 3, 5], '2026-10-23', []);
  assert.deepEqual(plan.map((d) => d.routine?.name ?? '-'), ['Pull', '-', '-', 'Legs', '-', 'Push', '-']);
  const doneToday = planTrainingWeek(program, [1, 3, 5], '2026-10-23', [{ date: '2026-10-23', name: 'Push' }]);
  assert.equal(doneToday[0]!.done, 'Push');
  assert.equal(doneToday[3]!.routine?.name, 'Pull');
  assert.equal(starterFor(3), 'full-body-3');
  assert.equal(starterFor(5), 'ppl-6');
});
