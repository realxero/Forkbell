import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMicros, microsFromOff, microsFromUsda, microsPer100, sumMicros } from './micros.ts';
import { labelToFood } from './bell.ts';

test('Open Food Facts lists grams; we keep mg and µg', () => {
  assert.deepEqual(microsFromOff({ 'calcium_100g': 0.12, 'vitamin-d_100g': 0.000002, 'iron_100g': '' }), { calcium: 120, vitaminD: 2 });
  assert.equal(microsFromOff({}), null);
});

test('USDA numbers and labels per serving', () => {
  const nums: Record<string, number> = { '301': 125, '306': 150 };
  assert.deepEqual(microsFromUsda((n) => nums[n] ?? null), { calcium: 125, potassium: 150 });
  assert.deepEqual(microsPer100({ calcium: 260, iron: null }, 240), { calcium: 108.333 });
  assert.equal(cleanMicros({ calcium: -1 }), null);
});

test('a label photo keeps its vitamins and minerals, per 100 g', () => {
  const r = labelToFood({ readable: true, name: 'Milk', brand: null, serving_label: '1 cup', serving_g: 240, per100: null, per_serving: { kcal: 150, protein: 8, carbs: 12, fat: 8, micros: { calcium: 300, vitaminD: 2.5 } }, note: null });
  assert.ok(!('error' in r));
  assert.deepEqual((r as { food: { per100: { micros: unknown } } }).food.per100.micros, { calcium: 125, vitaminD: 1.042 });
});

test('a day counts the foods that list them, and says how many', () => {
  const food = (micros: Record<string, number> | null) => ({ name: 'x', brand: null, source: 'custom' as const, sourceId: null, per100: { kcal: 100, protein: 1, carbs: 1, fat: 1, micros }, servingGrams: null, servingLabel: null, barcode: null, portions: [], id: 'a' });
  const day = sumMicros([{ grams: 200, food: food({ calcium: 120 }) }, { grams: 100, food: food(null) }]);
  assert.deepEqual(day, { totals: { calcium: 240 }, known: 1, of: 2 });
});
