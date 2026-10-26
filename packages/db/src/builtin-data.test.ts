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

test('every built-in exercise has steps and pictures (cardio needs none)', async () => {
  const { exerciseLibrary } = await import('./exercise-library.ts');
  for (const e of builtinExercises.filter((x) => x.kind !== 'cardio')) {
    const h = exerciseLibrary.core[e.key];
    assert.ok(h, `${e.key} has a how-to`);
    assert.ok(h.steps.length >= 1 && h.images >= 1, `${e.key} has steps and a picture`);
  }
});

test('the full library fits Forkbell and never clashes with built-ins', async () => {
  const { exerciseLibrary, howToImages } = await import('./exercise-library.ts');
  const { MUSCLES } = await import('@forkbell/shared');
  const keys = new Set(builtinExercises.map((e) => e.key));
  const names = new Set(builtinExercises.map((e) => e.name.toLowerCase()));
  assert.ok(exerciseLibrary.library.length > 500);
  assert.match(exerciseLibrary.commit, /^[0-9a-f]{40}$/, 'pinned to one dataset version');
  for (const e of exerciseLibrary.library) {
    assert.ok(e.key.startsWith('lib:') && !keys.has(e.key), `${e.key} is its own key`);
    keys.add(e.key);
    assert.ok(!names.has(e.name.toLowerCase()), `${e.name} isn't a second copy of a built-in`);
    assert.ok((MUSCLES as readonly string[]).includes(e.muscle), `${e.name}: ${e.muscle}`);
    assert.ok(['weight', 'bodyweight', 'time'].includes(e.kind));
    assert.ok(e.steps.length > 0 && e.images > 0, `${e.name} has steps and pictures`);
    assert.match(e.ref, /^[A-Za-z0-9_\-(),']+$/, `${e.ref} is a safe picture folder name`);
  }
  assert.equal(howToImages.size, Object.keys(exerciseLibrary.core).length + exerciseLibrary.library.length + exerciseLibrary.stretches.length);
});

test('stretches are sorted into warm-ups, holds and foam rolling, with pictures', async () => {
  const { exerciseLibrary } = await import('./exercise-library.ts');
  const { MUSCLES } = await import('@forkbell/shared');
  const s = exerciseLibrary.stretches;
  for (const kind of ['dynamic', 'static', 'roll'] as const) assert.ok(s.filter((x) => x.kind === kind).length >= 10, `enough ${kind}`);
  for (const x of s) {
    assert.ok(x.key.startsWith('str:'), x.key);
    assert.ok(x.muscles.length && x.muscles.every((m) => (MUSCLES as readonly string[]).includes(m)), `${x.name}: ${x.muscles}`);
    assert.ok(x.steps.length > 0 && x.images > 0, `${x.name} has steps and pictures`);
    assert.match(x.ref, /^[A-Za-z0-9_\-(),']+$/);
  }
  assert.equal(new Set(s.map((x) => x.key)).size, s.length);
});
