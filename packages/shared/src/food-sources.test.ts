import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBarcodeMatch, crossCheck, dataKind, matchScore, rankResults, sameBarcode, type FoodCandidate } from './index.ts';

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

const hit = (name: string, brand: string | null, source: FoodCandidate['source'], kind?: FoodCandidate['kind'], extra: Partial<FoodCandidate['per100']> = {}): FoodCandidate => ({
  name, brand, source, kind, sourceId: name, per100: { kcal: 100, protein: 5, carbs: 10, fat: 3, fiber: 1, sugar: 1, ...extra }, servingGrams: null, servingLabel: null, barcode: null, portions: [],
});

test('every food gets a kind', () => {
  assert.equal(dataKind({ source: 'usda', kind: 'lab' }), 'lab');
  assert.equal(dataKind({ source: 'usda' }), 'label');
  assert.equal(dataKind({ source: 'off' }), 'community');
  assert.equal(dataKind({ source: 'custom' }), 'yours');
});

test('matching: exact and starting names first, unrelated ones score nothing', () => {
  assert.ok(matchScore('banana', hit('Banana', null, 'usda')) > matchScore('banana', hit('Banana bread', null, 'usda')));
  assert.ok(matchScore('banana', hit('Banana bread', null, 'usda')) > matchScore('banana', hit('Muffin, banana nut', null, 'usda')));
  assert.equal(matchScore('banana', hit('Apple', null, 'usda')), 0);
  assert.ok(matchScore('cheerios', hit('Honey Nut', 'Cheerios', 'off')) > 0, 'brand counts');
});

test('a plain food: lab data beats a community copy of the same thing', () => {
  const r = rankResults('broccoli', [hit('Broccoli', null, 'off', 'community'), hit('Broccoli, raw', null, 'usda', 'lab'), hit('Broccoli', null, 'usda', 'lab')]);
  assert.equal(r[0]!.kind, 'lab');
  assert.equal(r[0]!.name, 'Broccoli');
});

test('a brand search still finds the brand, makers’ labels before community', () => {
  const r = rankResults('cheerios', [hit('Oats, raw', null, 'usda', 'lab'), hit('Cheerios', 'General Mills', 'off', 'community'), hit('Cheerios', 'General Mills', 'usda', 'label')]);
  assert.equal(r[0]!.kind, 'label');
  assert.equal(r.length, 2, 'the same product from two sources shows once');
  assert.equal(r.at(-1)!.name, 'Oats, raw');
});

test('community entries missing fibre and sugar rank a little lower', () => {
  const r = rankResults('protein bar', [hit('Protein bar', 'A', 'off', 'community', { fiber: null, sugar: null }), hit('Protein bar', 'B', 'off', 'community')]);
  assert.equal(r[0]!.brand, 'B');
});
