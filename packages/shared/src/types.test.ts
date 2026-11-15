import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyName } from './types.ts';

test('food names get even capitals; capitals already there, small words and units stay', () => {
  assert.equal(tidyName('overnight oats Vanilla Bean'), 'Overnight Oats Vanilla Bean');
  assert.equal(tidyName('Pure leaf lemon'), 'Pure Leaf Lemon');
  assert.equal(tidyName('MUSH oats with milk 8 fl oz'), 'MUSH Oats with Milk 8 fl oz');
  assert.equal(tidyName("reese's puffs"), "Reese's Puffs");
  assert.equal(tidyName('iPhone of the day'), 'iPhone of the Day');
});
