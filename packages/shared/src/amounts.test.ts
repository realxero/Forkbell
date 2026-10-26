import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountFromGrams, amountText, densityOf, entryAmountText, isLiquid, parseQuantity, servingWord, unitFor, unitsFor } from './amounts.ts';

const shake = { name: 'Vanilla Protein Shake', servingGrams: 325.3, servingLabel: '11 fl oz', portions: [] };
const bar = { name: 'Chewy Granola Bar', servingGrams: 24, servingLabel: '1 bar', portions: [] };
const bread = { name: 'Bread', servingGrams: null, servingLabel: null, portions: [{ label: 'Slice', grams: 30 }] };

test('units for a food, the natural ones first', () => {
  assert.deepEqual(unitsFor(bar, 'lb').map((u) => u.label), ['bar', 'oz', 'g', 'lb']);
  assert.deepEqual(unitsFor(shake, 'lb').slice(0, 3).map((u) => u.label), ['serving', 'fl oz', 'cup']);
  assert.deepEqual(unitsFor(bread, 'kg').map((u) => u.label), ['slice', 'g', 'oz', 'kg']);
  assert.equal(isLiquid(shake), true);
  assert.equal(isLiquid(bar), false);
  assert.ok(Math.abs(densityOf(shake) - 1) < 0.01);
  assert.ok(Math.abs(unitFor(shake, 'floz').grams - 29.57) < 0.1);
});

test('serving words', () => {
  assert.equal(servingWord('1 bar'), 'bar');
  assert.equal(servingWord('1 bars (24 g)'), 'bar');
  assert.equal(servingWord('11 fl oz'), 'serving');
  assert.equal(servingWord('1 cup'), 'serving');
  assert.equal(servingWord(null), 'serving');
});

test('typed quantities', () => {
  assert.equal(parseQuantity('1'), 1);
  assert.equal(parseQuantity('1.5'), 1.5);
  assert.equal(parseQuantity('2,5'), 2.5);
  assert.equal(parseQuantity('1/2'), 0.5);
  assert.equal(parseQuantity('1 1/2'), 1.5);
  assert.equal(parseQuantity('½'), 0.5);
  assert.equal(parseQuantity('abc'), null);
});

test('saying an amount', () => {
  assert.equal(amountText(1, { label: 'bar', count: true }), '1 bar');
  assert.equal(amountText(2, { label: 'bar', count: true }), '2 bars');
  assert.equal(amountText(1.5, { label: 'cup', count: false }), '1½ cups');
  assert.equal(amountText(325.3, { label: 'g', count: false }), '325 g');
  assert.deepEqual(amountFromGrams(bar, 48).quantity, 2, 'two bars');
  assert.equal(amountFromGrams(bar, 50).unit.key, 'g', 'not a tidy number of bars');
  assert.equal(entryAmountText({ grams: 325.3, food: shake }), '1 serving (325 g)');
  assert.equal(entryAmountText({ grams: 48, amount: 2, unit: 'serving', food: bar }), '2 bars (48 g)');
  assert.equal(entryAmountText({ grams: 50, food: bar }), '50 g');
});
