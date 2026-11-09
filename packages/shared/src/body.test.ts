import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmi, ffmi, navyBodyFat, phaseTimeline } from './body.ts';

test('US Navy body fat from a tape measure', () => {
  // 5'10", 15" neck, 34" waist: about 17.4% by the Navy formula.
  const man = navyBodyFat({ sex: 'male', heightCm: 177.8, neckCm: 38.1, waistCm: 86.36 })!;
  assert.ok(Math.abs(man - 17.43) < 0.01, String(man));
  const woman = navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 71, hipCm: 97 })!;
  assert.ok(woman > 20 && woman < 32, String(woman));
  assert.equal(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 38 }), null, 'a waist smaller than the neck is a typo');
  assert.equal(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 71 }), null, 'women need hips');
});

test('BMI and fat-free mass index', () => {
  assert.ok(Math.abs(bmi(80, 180) - 24.69) < 0.01);
  // 80 kg at 15% fat and 1.8 m: 68 kg lean / 3.24 = 21.0, no height adjustment at 1.8 m.
  assert.ok(Math.abs(ffmi(80, 180, 15) - 20.99) < 0.01);
});

test('a cut at 0.5% a week reaches its target with weekly checkpoints', () => {
  const t = phaseTimeline({ startKg: 90, targetKg: 85, pctPerWeek: 0.5, start: '2026-01-05' })!;
  assert.equal(t.weeks, 12); // 90 × 0.995^12 = 84.7
  assert.equal(t.end, '2026-03-30');
  assert.equal(t.checkpoints.length, 12);
  assert.ok(Math.abs(t.checkpoints[0]!.kg - 89.55) < 1e-9);
  assert.equal(t.checkpoints.at(-1)!.kg, 85);
  assert.ok(phaseTimeline({ startKg: 70, targetKg: 75, pctPerWeek: 0.25, start: '2026-01-05' })!.weeks > 20, 'a lean bulk is slow');
  assert.equal(phaseTimeline({ startKg: 80, targetKg: 80, pctPerWeek: 0.5, start: '2026-01-05' }), null);
});
