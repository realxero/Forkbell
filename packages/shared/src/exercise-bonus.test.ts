import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseBonus } from './exercise-bonus.ts';

const usual = Array(14).fill(400);

test('only activity above a usual day is added', () => {
  assert.deepEqual(exerciseBonus('all', 900, usual), { kcal: 500, activeKcal: 900, usualKcal: 400 });
  assert.equal(exerciseBonus('half', 900, usual)!.kcal, 250);
  assert.equal(exerciseBonus('all', 350, usual)!.kcal, 0, 'a quiet day takes nothing away');
  assert.equal(exerciseBonus('off', 900, usual), null);
  assert.equal(exerciseBonus('all', 900, [400, 400]), null, 'not enough days to know what usual is');
  assert.equal(exerciseBonus('all', 5000, usual)!.kcal, 1500, 'capped');
});
