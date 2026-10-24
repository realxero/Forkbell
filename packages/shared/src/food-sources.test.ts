import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBarcodeMatch, crossCheck, sameBarcode, type FoodCandidate } from './index.ts';

const food = (source: FoodCandidate['source'], kcal: number, protein: number): FoodCandidate => ({
  name: 'Granola', brand: 'Test Co', source, sourceId: '1', per100: { kcal, protein, carbs: 60, fat: 15 }, servingGrams: 55, servingLabel: null, barcode: '012345678905', portions: [],
});

test('barcodes match whatever their length', () => {
  assert.equal(sameBarcode('012345678905', '0012345678905'), true);
  assert.equal(sameBarcode('12345678905', '00012345678905'), true);
  assert.equal(sameBarcode('012345678905', '012345678906'), false);
});

test('USDA (the maker’s label) wins when both have the barcode', () => {
  const usda = food('usda', 418, 5.5);
  const off = food('off', 420, 5);
  assert.equal(chooseBarcodeMatch({ usda, off }).pick, usda);
  assert.equal(chooseBarcodeMatch({ usda, off }).other, off);
  assert.equal(chooseBarcodeMatch({ usda: null, off }).pick, off);
  assert.equal(chooseBarcodeMatch({ usda: null, off }).other, null);
  assert.equal(chooseBarcodeMatch({ usda: null, off: null }).pick, null);
});

test('close numbers agree; different ones say what differs', () => {
  assert.equal(crossCheck(food('usda', 418, 5.5), food('off', 420, 5))!.agrees, true);
  assert.equal(crossCheck(food('usda', 30, 1), food('off', 40, 1.5))!.agrees, true, 'small foods get a few kcal of slack');
  const off = crossCheck(food('usda', 418, 5.5), food('off', 520, 9))!;
  assert.equal(off.agrees, false);
  assert.match(off.text, /Open Food Facts lists 520 kcal and 9 g protein/);
  assert.match(off.text, /USDA’s 418 kcal/);
  assert.equal(crossCheck(food('usda', 418, 5.5), null), null);
});
