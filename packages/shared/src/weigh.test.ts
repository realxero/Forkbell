import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eatenGrams, gramsFromScale, parseWeight, preferencesSchema } from './index.ts';

test('tare between foods: each number is that food', () => {
  assert.deepEqual(gramsFromScale('tare', [182, null, 0, 95.25]), [182, null, null, 95.3]);
});

test('reading the total: each food is the difference, from the empty plate', () => {
  // A 410 g plate, then rice to 592, chicken to 740, sauce to 765.
  assert.deepEqual(gramsFromScale('total', [592, 740, 765], 410), [182, 148, 25]);
  assert.deepEqual(gramsFromScale('total', [182, 330]), [182, 148], 'tared the empty plate');
  assert.deepEqual(gramsFromScale('total', [592, 500, 650], 410), [182, null, 58], 'a lower reading is a mistake, and the next counts from the last good one');
  assert.deepEqual(gramsFromScale('total', [592, null, 650], 410), [182, null, 58]);
});

test('leftovers come off, with or without the plate on the scale', () => {
  assert.equal(eatenGrams(182, null), 182);
  assert.equal(eatenGrams(182, 30), 152);
  assert.equal(eatenGrams(182, 440, 410), 152, 'the plate weighs 410 g');
  assert.equal(eatenGrams(182, 300), 0);
});

test('weights as typed or said', () => {
  const cases: [string, number | null][] = [
    ['182', 182], ['182g', 182], ['182 grams', 182], ['182 grams of rice', 182], ['1.2 kg', 1200], ['6 oz', 170.1],
    ['6,5 ounces', 184.3], ['1 lb', 453.6], ['250 ml', 250], ['zero', null], ['0', null], ['', null], ['30000', null],
  ];
  for (const [t, want] of cases) assert.equal(parseWeight(t), want, t);
});

test('saved plates and bowls are part of preferences', () => {
  assert.deepEqual(preferencesSchema.parse({}).containers, []);
  const p = preferencesSchema.parse({ containers: [{ id: 'a', name: 'Big plate', grams: 410 }] });
  assert.equal(p.containers[0]!.grams, 410);
  assert.throws(() => preferencesSchema.parse({ containers: [{ id: 'a', name: '', grams: 410 }] }));
});
