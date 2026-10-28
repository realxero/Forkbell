import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseBonus } from './exercise-bonus.ts';

const usual = Array(14).fill(400);

test('only activity above a usual day is added', () => {
  assert.deepEqual(exerciseBonus('all', 900, usual), { kcal: 500, activeKcal: 900, usualKcal: 400 });
  assert.equal(exerciseBonus('half', 900, usual)!.kcal, 250);
  assert.equal(exerciseBonus('all', 350, usual)!.kcal, 0, 'a quiet day takes nothing away');
  assert.equal(exerciseBonus('off', 900, usual), null);
  assert.equal(exerciseBonus('all', 900, [400, 400]), null, 'not enough days to know what usual is');
  assert.equal(exerciseBonus('all', 5000, usual)!.kcal, 1500, 'capped');
});

test('meal slots: your order and names, at least one showing', async () => {
  const { mealSlots, shownMealSlots } = await import('./meals.ts');
  assert.deepEqual(shownMealSlots(undefined).map((s) => s.key), ['breakfast', 'lunch', 'dinner', 'snacks']);
  const mine = shownMealSlots([{ key: 'meal5', name: 'Pre-workout', show: true }, { key: 'breakfast', name: ' ', show: true }]);
  assert.deepEqual(mine.map((s) => [s.key, s.name]), [['meal5', 'Pre-workout'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']]);
  assert.equal(mealSlots(['breakfast', 'lunch', 'dinner', 'snacks', 'meal5', 'meal6'].map((key) => ({ key, name: key, show: false })) as never).filter((s) => s.show).length, 1);
});
