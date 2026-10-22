import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forAmount, sumEntries, per100Problems } from './nutrition.ts';
import { addDays } from './dates.ts';

const tea = { kcal: 27, protein: 0, carbs: 6.8, fat: 0 };

test('scales per-100 values to the amount eaten', () => {
  // 547 ml of a 27 kcal/100 ml tea is ~148 kcal, not 27
  assert.equal(forAmount(tea, 547).kcal, 148);
  assert.equal(forAmount(tea, 547).carbs, 37.2);
});

test('sums a day', () => {
  const food = { id: 'x', name: 'Egg', brand: null, source: 'custom' as const, sourceId: null, per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, servingGrams: 50, servingLabel: '1 large' };
  const t = sumEntries([{ grams: 50, food }, { grams: 100, food }]);
  assert.equal(t.kcal, 215);
  assert.equal(t.protein, 18.9);
});

test('flags impossible per-100 values', () => {
  assert.deepEqual(per100Problems({ kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }), []);
  assert.ok(per100Problems({ kcal: 1200, protein: 0, carbs: 0, fat: 100 }).length > 0);
  // per-serving numbers typed in as per-100 g: 250 kcal but 60 g of protein
  assert.ok(per100Problems({ kcal: 250, protein: 60, carbs: 30, fat: 10 }).length > 0);
});

test('date math crosses months', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
