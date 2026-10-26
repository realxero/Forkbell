import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardioActivityFor, cardioKcal, distanceText, durationText, paceText, parseDuration } from './cardio.ts';

test('which activity, from the name', () => {
  assert.equal(cardioActivityFor('Treadmill').key, 'treadmill');
  assert.equal(cardioActivityFor('Stationary bike').key, 'stationary-bike');
  assert.equal(cardioActivityFor('Morning jog').key, 'run');
  assert.equal(cardioActivityFor('Rowing machine').key, 'row');
  assert.equal(cardioActivityFor('Battle ropes').key, 'hiit');
});

test('calories: faster runs burn more, and a rough number without a pace', () => {
  const slow = cardioKcal('Run', 30 * 60, 80, 4000);
  const fast = cardioKcal('Run', 30 * 60, 80, 6000);
  assert.ok(fast > slow, `${fast} > ${slow}`);
  assert.equal(cardioKcal('Elliptical', 30 * 60, 80), 200);
  assert.equal(cardioKcal('Walk', 0, 80), 0);
});

test('pace, distance and time', () => {
  assert.equal(paceText(30 * 60, 5000, 'kg'), '6:00 /km');
  assert.equal(paceText(30 * 60, 1609.344 * 3, 'lb'), '10:00 /mi');
  assert.equal(paceText(30 * 60, null, 'lb'), null);
  assert.equal(distanceText(5000, 'kg'), '5 km');
  assert.equal(distanceText(5000, 'lb'), '3.11 mi');
  assert.equal(parseDuration('30'), 1800);
  assert.equal(parseDuration('32:15'), 1935);
  assert.equal(parseDuration('1:05:00'), 3900);
  assert.equal(parseDuration('abc'), null);
  assert.equal(durationText(1935), '32:15');
  assert.equal(durationText(1800), '30');
  assert.equal(durationText(3900), '1:05:00');
});
