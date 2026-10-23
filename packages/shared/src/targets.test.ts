import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBurn, smartTargets } from './targets.ts';

test('estimated burn (Mifflin–St Jeor)', () => {
  // 10×100 + 6.25×180 − 5×25 + 5 = 2005 × 1.55
  assert.equal(estimateBurn({ sex: 'male', age: 25, heightCm: 180, weightKg: 100, activity: 'moderate' }), 3108);
});

test('losing while lifting: slower pace, more protein, macros add up', () => {
  const t = smartTargets({ goal: 'lose', focus: 'both', weightKg: 100, burnKcal: 3100, heightCm: 180 });
  assert.equal(t.weeklyKg, -0.5);
  assert.equal(t.kcal, 2550); // 3100 − 0.5 × 7700 / 7
  // BMI 30.9: protein from a reference of 81 kg × 2.2
  assert.equal(t.protein, 178);
  assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal) < 15);
});

test('gaining for size vs strength; never under 1,200', () => {
  const size = smartTargets({ goal: 'gain', focus: 'size', weightKg: 70, burnKcal: 2600 });
  const strength = smartTargets({ goal: 'gain', focus: 'strength', weightKg: 70, burnKcal: 2600 });
  assert.ok(size.kcal > strength.kcal);
  const tiny = smartTargets({ goal: 'lose', focus: 'none', weightKg: 50, burnKcal: 1300 });
  assert.equal(tiny.kcal, 1200);
  assert.match(tiny.why.join(' '), /floor/);
});
