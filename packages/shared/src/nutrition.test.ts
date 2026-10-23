import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forAmount, sumEntries, per100Problems } from './nutrition.ts';
import { addDays } from './dates.ts';
import { amountChips, barcodeVariants } from './portions.ts';

const tea = { kcal: 27, protein: 0, carbs: 6.8, fat: 0 };

test('scales per-100 values to the amount eaten', () => {
  // 547 ml of a 27 kcal/100 ml tea is ~148 kcal, not 27
  assert.equal(forAmount(tea, 547).kcal, 148);
  assert.equal(forAmount(tea, 547).carbs, 37.2);
});

test('sums a day', () => {
  const food = { id: 'x', name: 'Egg', brand: null, source: 'custom' as const, sourceId: null, per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, servingGrams: 50, servingLabel: '1 large', barcode: null, portions: [] };
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

test('amount chips put last time first and drop duplicates', () => {
  const chips = amountChips({ servingGrams: 100, servingLabel: '1 cup', portions: [{ label: '1 large', grams: 50 }] }, 150);
  assert.deepEqual(chips.map((c) => c.grams), [150, 50, 100, 200]);
  assert.equal(chips[0]!.label, 'Last time (150 g)');
  assert.equal(chips[2]!.label, '1 serving, 1 cup (100 g)');
});

test('a serving label that only repeats the grams is not shown twice', () => {
  const chips = amountChips({ servingGrams: 30, servingLabel: '30 g', portions: [] });
  assert.equal(chips[0]!.label, '1 serving (30 g)');
});

test('UPC-A and EAN-13 forms of a barcode match', () => {
  assert.deepEqual(barcodeVariants('012345678905'), ['012345678905', '0012345678905']);
  assert.deepEqual(barcodeVariants('0012345678905'), ['0012345678905', '012345678905']);
  assert.deepEqual(barcodeVariants('abc'), []);
});
