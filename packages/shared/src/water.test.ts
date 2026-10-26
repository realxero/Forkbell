import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWater, parseWaterGoal, reachedGoal, waterButtons, waterGoalMl, waterText, waterTotal } from './water.ts';

test('buttons: a cup, a bottle and a big bottle, in your unit', () => {
  assert.deepEqual(waterButtons('lb').map((b) => b.label), ['+8 oz', '+16.9 oz', '+24 oz']);
  assert.deepEqual(waterButtons('lb').map((b) => b.ml), [237, 500, 710]);
  assert.deepEqual(waterButtons('kg').map((b) => b.ml), [250, 500, 750]);
});

test('typed amounts', () => {
  assert.equal(parseWater('20 oz', 'kg'), 591);
  assert.equal(parseWater('16,9 fl oz', 'kg'), 500);
  assert.equal(parseWater('1.5 L', 'lb'), 1500);
  assert.equal(parseWater('500ml', 'lb'), 500);
  assert.equal(parseWater('2 cups', 'lb'), 473);
  assert.equal(parseWater('12', 'lb'), 355, 'a plain number is oz with pounds');
  assert.equal(parseWater('300', 'kg'), 300, 'and ml with kilograms');
  assert.equal(parseWater('a lot', 'lb'), null);
  assert.equal(parseWater('20 lb', 'lb'), null);
  assert.equal(parseWater('0', 'lb'), null);
  assert.equal(parseWater('500 oz', 'lb'), null, 'a typo, not a drink');
});

test('goals', () => {
  assert.equal(parseWaterGoal('2.5', 'kg'), 2500);
  assert.equal(parseWaterGoal('2500', 'kg'), 2500);
  assert.equal(parseWaterGoal('100 oz', 'kg'), 2957);
  assert.equal(parseWaterGoal('80', 'lb'), 2366);
  assert.equal(parseWaterGoal('3 L', 'lb'), 3000);
  assert.equal(parseWaterGoal('50 L', 'lb'), null);
  assert.equal(waterGoalMl(null), 2000);
  assert.equal(waterGoalMl(3000), 3000);
});

test('totals, text and reaching the goal', () => {
  assert.equal(waterTotal([{ ml: 500 }, { ml: 250 }]), 750);
  assert.equal(waterText(2000, 'lb'), '68 oz');
  assert.equal(waterText(237, 'lb'), '8 oz');
  assert.equal(waterText(1500, 'kg'), '1.5 L');
  assert.equal(waterText(750, 'kg'), '750 ml');
  assert.equal(reachedGoal(1800, 2100, 2000), true);
  assert.equal(reachedGoal(2100, 2400, 2000), false, 'only the drink that crosses it');
});
