import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodEmoji } from './emoji.ts';

test('the name decides before the brand', () => {
  assert.equal(foodEmoji('ShackBurger (Single)', 'Shake Shack'), '🍔', 'not a shake');
  assert.equal(foodEmoji('French Fries', 'Shake Shack'), '🍟');
  assert.equal(foodEmoji('Mac Bites', 'Shake Shack'), '🧀');
  assert.equal(foodEmoji('Chocolate Shake', 'Shake Shack'), '🥤', 'a real shake is still a shake');
  assert.equal(foodEmoji('Grande', 'Starbucks Coffee'), '☕', 'the brand helps when the name says nothing');
  assert.equal(foodEmoji('Whopper', 'Burger King'), '🍔');
});

test('sports and energy drinks are drinks, not a can of tomatoes', () => {
  assert.equal(foodEmoji('Gatorade Cool Blue', 'Gatorade'), '🥤');
  assert.equal(foodEmoji('Red Bull'), '🥤');
});
