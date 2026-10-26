import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIG_JUMP, jumpShare, movementOf, progressIdeas, variationsOf, type Exercise } from './index.ts';

let n = 0;
const ex = (name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id: `id-${n++}`,
  name,
  muscle: 'chest',
  equipment: /dumbbell/i.test(name) ? 'dumbbell' : /machine/i.test(name) ? 'machine' : /cable/i.test(name) ? 'cable' : /push|dip|pull/i.test(name) ? 'bodyweight' : 'barbell',
  kind: /push|pull|dip/i.test(name) ? 'bodyweight' : /plank|hold/i.test(name) ? 'time' : 'weight',
  increment: 'small',
  restSeconds: 120,
  custom: false,
  ...extra,
});

test('the movement without the words that say how', () => {
  assert.equal(movementOf('Incline dumbbell bench press').base, 'bench press');
  assert.deepEqual([...movementOf('Incline dumbbell bench press').mods].sort(), ['dumbbell', 'incline']);
  assert.equal(movementOf('Single-arm dumbbell row').base, 'row');
  assert.equal(movementOf('Push-ups').base, 'push up');
  assert.equal(movementOf('Kneeling push up').base, 'push up');
  assert.equal(movementOf('Close-grip bench press').base, 'bench press');
});

test('bench press: incline, decline, dumbbell and single-arm, labelled', () => {
  const bench = ex('Bench press');
  const lib = [
    bench,
    ex('Incline bench press'),
    ex('Decline bench press'),
    ex('Dumbbell bench press'),
    ex('Single-arm dumbbell bench press'),
    ex('Machine chest press'),
    ex('Cable fly'),
    ex('Squat', { muscle: 'quads' }),
  ];
  const v = variationsOf(bench, lib);
  const names = v.map((x) => x.exercise.name);
  for (const want of ['Incline bench press', 'Decline bench press', 'Dumbbell bench press', 'Single-arm dumbbell bench press']) assert.ok(names.includes(want), want);
  assert.ok(!names.includes('Cable fly'));
  assert.ok(!names.includes('Squat'));
  assert.ok(!names.includes('Bench press'), 'not itself');
  assert.equal(v.find((x) => x.exercise.name === 'Incline bench press')?.level, 'angle');
  assert.equal(v.find((x) => x.exercise.name === 'Single-arm dumbbell bench press')?.level, 'harder');
  assert.equal(v.find((x) => x.exercise.name === 'Dumbbell bench press')?.level, 'angle');
});

test('push-ups: hands up is easier, feet up and one arm harder, knees easier', () => {
  const pu = ex('Push-up');
  const v = variationsOf(pu, [pu, ex('Incline push-up'), ex('Decline push-up'), ex('Kneeling push-up'), ex('Archer push-up'), ex('Plank')]);
  const level = (name: string) => v.find((x) => x.exercise.name === name)?.level;
  assert.equal(level('Incline push-up'), 'easier');
  assert.equal(level('Decline push-up'), 'harder');
  assert.equal(level('Kneeling push-up'), 'easier');
  assert.equal(level('Archer push-up'), 'harder');
  assert.equal(level('Plank'), undefined);
  // From the knee version, the full push-up is harder.
  const knee = v.find((x) => x.exercise.name === 'Kneeling push-up')!.exercise;
  assert.equal(variationsOf(knee, [pu, knee]).find((x) => x.exercise.name === 'Push-up')?.level, 'harder');
});

test('an assisted pull-up is easier; the order is harder, angle, easier', () => {
  const pull = ex('Pull-up', { muscle: 'back' });
  const v = variationsOf(pull, [pull, ex('Assisted pull-up', { muscle: 'back' }), ex('Weighted pull-up', { muscle: 'back' }), ex('Wide-grip pull-up', { muscle: 'back' })]);
  assert.deepEqual(v.map((x) => x.level), ['harder', 'angle', 'easier']);
});

test('ways to progress besides weight fit the exercise', () => {
  const keys = (e: Pick<Exercise, 'name' | 'kind' | 'equipment'>) => progressIdeas(e).map((i) => i.key);
  assert.ok(keys({ name: 'Lateral raise', kind: 'weight', equipment: 'dumbbell' }).includes('side'));
  assert.ok(!keys({ name: 'Bench press', kind: 'weight', equipment: 'barbell' }).includes('side'), 'no one-arm barbell bench');
  assert.ok(!keys({ name: 'Single-arm row', kind: 'weight', equipment: 'dumbbell' }).includes('side'), 'already one arm');
  assert.ok(keys({ name: 'Pull-up', kind: 'bodyweight', equipment: 'bodyweight' }).includes('load'));
  assert.deepEqual(keys({ name: 'Plank', kind: 'time', equipment: 'bodyweight' })[0], 'longer');
  for (const k of ['reps', 'set', 'slow', 'pause', 'half', 'rest']) assert.ok(keys({ name: 'Curl', kind: 'weight', equipment: 'dumbbell' }).includes(k), k);
});

test('a 5 lb jump on 15 lb is big; on 225 it isn’t', () => {
  assert.ok(jumpShare(6.8, 2.27) > BIG_JUMP);
  assert.ok(jumpShare(102, 2.27) < BIG_JUMP);
});
