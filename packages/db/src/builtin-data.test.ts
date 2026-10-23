import { test } from 'node:test';
import assert from 'node:assert/strict';
import { per100Problems } from '@forkbell/shared';
import { builtinFoods } from './builtin-foods.ts';
import { builtinExercises } from './builtin-exercises.ts';
import { STARTER_PROGRAMS, MUSCLES } from '@forkbell/shared';

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

test('built-in exercise keys are unique and valid', () => {
  const keys = builtinExercises.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate key');
  for (const e of builtinExercises) {
    assert.match(e.key, /^[a-z0-9-]+$/);
    assert.ok((MUSCLES as readonly string[]).includes(e.muscle), `${e.key}: muscle`);
    assert.ok(e.restSeconds >= 0 && e.restSeconds <= 900);
  }
});

test('every starter program only uses built-in exercises', () => {
  const keys = new Set(builtinExercises.map((e) => e.key));
  for (const p of STARTER_PROGRAMS)
    for (const r of p.routines)
      for (const [key, sets, min, max] of r.exercises) {
        assert.ok(keys.has(key), `${p.key}/${r.name}: unknown exercise ${key}`);
        assert.ok(sets >= 1 && min >= 1 && max >= min, `${p.key}/${r.name}/${key}: targets`);
      }
});
