import { test } from 'node:test';
import assert from 'node:assert/strict';
import { per100Problems } from '@forkbell/shared';
import { builtinFoods } from './builtin-foods.ts';

test('every built-in food passes the same checks as foods people enter', () => {
  for (const f of builtinFoods) assert.deepEqual(per100Problems(f.per100), [], `${f.key}: ${per100Problems(f.per100).join(' ')}`);
});

test('built-in keys are unique and permanent-looking', () => {
  const keys = builtinFoods.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate key');
  for (const k of keys) assert.match(k, /^[a-z0-9-]+$/);
});

test('portions are sensible', () => {
  for (const f of builtinFoods) for (const p of f.portions) assert.ok(p.grams > 0 && p.grams < 1000, `${f.key}: ${p.label}`);
});
