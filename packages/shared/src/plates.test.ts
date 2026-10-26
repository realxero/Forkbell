import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesPlates, BARS, DEFAULT_PLATES, loadPlates, warmupSets } from './plates.ts';

const oly = BARS.find((b) => b.id === 'olympic-lb')!;
test('plates per side on an Olympic bar', () => {
  const r = loadPlates(225, oly, DEFAULT_PLATES.lb);
  assert.deepEqual(r.perSide, [45, 45]);
  assert.equal(r.short, 0);
  assert.deepEqual(loadPlates(185, oly, DEFAULT_PLATES.lb).perSide, [45, 25]);
  assert.deepEqual(loadPlates(100, BARS.find((b) => b.id === 'olympic-kg')!, DEFAULT_PLATES.kg).perSide, [25, 15]);
});

test('weights you can’t load exactly get the nearest options', () => {
  const r = loadPlates(137, oly, DEFAULT_PLATES.lb);
  assert.equal(r.total, 135);
  assert.deepEqual(r.nearest, { below: 135, above: 140 });
  // A landmine loads one side only.
  assert.deepEqual(loadPlates(70, BARS.find((b) => b.id === 'tbar-lb')!, DEFAULT_PLATES.lb).perSide, [45, 25]);
  // Only 45s and 25s in this gym.
  assert.deepEqual(loadPlates(205, oly, [45, 25]).perSide, [45, 25, 10].filter((p) => [45, 25].includes(p)).slice(0, 2));
});

test('warm-up sets ramp up to the working weight', () => {
  const w = warmupSets(225, oly, DEFAULT_PLATES.lb);
  assert.deepEqual(w, [{ weight: 45, reps: 10 }, { weight: 90, reps: 5 }, { weight: 135, reps: 3 }, { weight: 180, reps: 2 }]);
  assert.ok(warmupSets(65, oly, DEFAULT_PLATES.lb).length <= 2);
});


test('plates only for bars and plate-loaded machines', () => {
  assert.equal(usesPlates({ name: 'Bench press', equipment: 'barbell' }), true);
  assert.equal(usesPlates({ name: 'Leg press', equipment: 'machine' }), true);
  assert.equal(usesPlates({ name: 'EZ-bar curl', equipment: 'e-z curl bar' }), true);
  assert.equal(usesPlates({ name: 'Dumbbell bench press', equipment: 'dumbbell' }), false);
  assert.equal(usesPlates({ name: 'Lat pulldown', equipment: 'cable' }), false);
  assert.equal(usesPlates({ name: 'Leg extension', equipment: 'machine' }), false);
});

test('a 15 lb or 10 kg technique bar', () => {
  assert.ok(BARS.some((b) => b.id === 'technique-lb' && b.weight === 15));
  assert.ok(BARS.some((b) => b.id === 'technique-kg' && b.weight === 10));
});
