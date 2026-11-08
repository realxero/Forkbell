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
  assert.deepEqual(restAdvice({ ...base, elapsedSeconds: 60, secondsLeft: 60, hr: 100, hrAgeSeconds: 5 }).say, "Heart rate's down to 100. You're ready when you are.");
  assert.equal(restAdvice({ ...base, elapsedSeconds: 60, secondsLeft: 60, hr: 100, hrAgeSeconds: 600 }).say, null, 'a reading from ten minutes ago means nothing');
  assert.equal(restAdvice({ ...base, elapsedSeconds: 60, secondsLeft: 60, hr: 100, hrAgeSeconds: 5, told: new Set(['ready-early']) }).say, null, 'said once');
  assert.equal(restAdvice({ ...base, elapsedSeconds: 120, secondsLeft: 0, hr: null, hrAgeSeconds: null }).state, 'ready', 'no heart rate: the timer decides');
});

test('not recovered near the end: 30 more seconds, once', () => {
  const base = { plannedSeconds: 120, elapsedSeconds: 118, recoveredBpm: 115, hrAgeSeconds: 3, told: new Set<string>() };
  const a = restAdvice({ ...base, secondsLeft: 2, hr: 140 });
  assert.equal(a.state, 'too-soon');
  assert.equal(a.extendSeconds, 30);
  assert.match(a.say ?? '', /still 140.*30 more seconds/);
  assert.equal(restAdvice({ ...base, secondsLeft: 2, hr: 140, told: new Set(['too-soon']) }).extendSeconds, undefined, 'only once per rest');
  assert.equal(restAdvice({ ...base, secondsLeft: 2, hr: 120 }).extendSeconds, undefined, 'within 8 bpm of recovered: let the timer run');
  assert.equal(restAdvice({ ...base, secondsLeft: 10, hr: 140 }).extendSeconds, undefined, 'too early to call');
  assert.equal(restAdvice({ ...base, secondsLeft: 0, hr: 140 }).extendSeconds, undefined, 'the timer is already up');
  assert.equal(restAdvice({ ...base, secondsLeft: 2, hr: 140, hrAgeSeconds: 90 }).extendSeconds, undefined, 'a stale reading never stretches the rest');
  assert.equal(restAdvice({ ...base, elapsedSeconds: 133, secondsLeft: 2, hr: 140 }).extendSeconds, 30, 'uses the timer as shown, after a +15');
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
