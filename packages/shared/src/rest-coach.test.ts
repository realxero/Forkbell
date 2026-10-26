import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoveredAt, restAdvice, restCue, setFeedback } from './rest-coach.ts';

test('recovered heart rate: 40% of the way from resting to max', () => {
  assert.equal(recoveredAt(60, 30), Math.round(60 + 0.4 * (208 - 21 - 60)));
  assert.equal(recoveredAt(null, null), Math.round(65 + 0.4 * (188 - 65)), 'sensible defaults');
  assert.equal(recoveredAt(10, null), recoveredAt(null, null), 'a nonsense resting rate is ignored');
});

test('heart rate only counts when it is fresh', () => {
  const base = { plannedSeconds: 120, recoveredBpm: 115, told: new Set<string>() };
  assert.deepEqual(restAdvice({ ...base, elapsedSeconds: 60, hr: 100, hrAgeSeconds: 5 }).say, "Heart rate's down to 100. You're ready when you are.");
  assert.equal(restAdvice({ ...base, elapsedSeconds: 60, hr: 100, hrAgeSeconds: 600 }).say, null, 'a reading from ten minutes ago means nothing');
  assert.equal(restAdvice({ ...base, elapsedSeconds: 60, hr: 100, hrAgeSeconds: 5, told: new Set(['ready-early']) }).say, null, 'said once');
  assert.match(restAdvice({ ...base, elapsedSeconds: 120, hr: 140, hrAgeSeconds: 3 }).say ?? '', /30 more seconds/);
  assert.equal(restAdvice({ ...base, elapsedSeconds: 120, hr: null, hrAgeSeconds: null }).state, 'ready', 'no heart rate: the timer decides');
});

test('timing cues', () => {
  assert.deepEqual(restCue(10, 90, null), { key: '10', say: 'Ten seconds.' });
  assert.equal(restCue(10, 30, null), null, 'not on a short rest');
  assert.equal(restCue(0, 90, 'squat, set 2')?.say, "Rest's up. Next: squat, set 2.");
});

test('a few words after a set, only when it matters', () => {
  const base = { weightKg: 100, previous: { reps: 8, weightKg: 100 }, repMax: 10, bestWeightKg: 110, lastSetOfExercise: false, exerciseName: 'squat' };
  assert.equal(setFeedback({ ...base, reps: 10 }), '2 more reps than last time. Nice work.');
  assert.equal(setFeedback({ ...base, reps: 8 }), null, 'most sets: nothing');
  assert.equal(setFeedback({ ...base, reps: 5, weightKg: 115 }), 'New heaviest set. Huge.');
});
