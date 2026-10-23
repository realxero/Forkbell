import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areasLoaded, isStalled, onList, preferencesSchema, projectGoal, rankSwaps, trainingSetupSchema, trainingTips, volumeComparison, weeklyGaps, type Exercise, type SetEntry } from './index.ts';

const ex = (id: string, name: string, muscle: string, equipment: string, kind: Exercise['kind'] = 'weight'): Exercise & { uses: number } => ({
  id: `00000000-0000-0000-0000-${id.padStart(12, '0')}`, name, muscle, equipment, kind, increment: 'small', restSeconds: 120, custom: false, uses: 0,
});
const set = (weightKg: number, reps: number): SetEntry => ({ weightKg, reps, seconds: null, rpe: null, warmup: false, done: true });
const setup = (s: Partial<ReturnType<typeof trainingSetupSchema.parse>> = {}) => trainingSetupSchema.parse(s);

const bench = ex('1', 'Bench press', 'chest', 'barbell');
const library = [
  bench,
  ex('2', 'Dumbbell bench press', 'chest', 'dumbbell'),
  ex('3', 'Machine chest press', 'chest', 'machine'),
  ex('4', 'Push-up', 'chest', 'bodyweight', 'bodyweight'),
  ex('5', 'Cable fly', 'chest', 'cable'),
  ex('6', 'Barbell row', 'back', 'barbell'),
];

test('areas are judged from exercise names', () => {
  assert.deepEqual(areasLoaded('Overhead press'), ['shoulders']);
  assert.deepEqual(areasLoaded('Back squat'), ['lower back', 'knees']);
  assert.deepEqual(areasLoaded('Lateral raise'), []);
});

test('never-suggest matches whole words only', () => {
  assert.equal(onList('Barbell row', ['row']), true);
  assert.equal(onList('Narrow-stance squat', ['row']), false);
  assert.equal(onList('Dumbbell fly', ['cable fly']), false);
});

test('swaps stay on the same muscle and give reasons', () => {
  const swaps = rankSwaps(bench, library, setup());
  assert.ok(swaps.length >= 3);
  assert.ok(swaps.every((s) => s.exercise.muscle === 'chest' && s.exercise.id !== bench.id));
  assert.ok(swaps.every((s) => s.reasons[0] === 'works your chest'));
});

test('swaps respect equipment, protected areas and never-suggest', () => {
  const homeGym = rankSwaps(bench, library, setup({ equipment: ['dumbbell'] }));
  assert.deepEqual(homeGym.map((s) => s.exercise.name).sort(), ['Dumbbell bench press', 'Push-up']);
  const shoulders = rankSwaps(bench, library, setup({ protectedAreas: ['shoulders'] }));
  assert.ok(!shoulders.some((s) => /bench press/i.test(s.exercise.name)), 'pressing that loads the shoulders is left out');
  assert.ok(shoulders.some((s) => s.reasons.includes('easier on your shoulders')));
  const never = rankSwaps(bench, library, setup({ neverSuggest: ['push-up'] }));
  assert.ok(!never.some((s) => s.exercise.name === 'Push-up'));
});

test('exercises you have done come first', () => {
  const lib = library.map((e) => (e.name === 'Cable fly' ? { ...e, uses: 4 } : e));
  assert.equal(rankSwaps(bench, lib, setup())[0]!.exercise.name, 'Cable fly');
});

const sessions = (bests: number[], everyDays = 5, today = '2026-10-22') =>
  bests.map((kg, i) => ({ date: new Date(Date.parse(`${today}T00:00:00Z`) - i * everyDays * 86400000).toISOString().slice(0, 10), sets: [set(kg, 5)] }));

test('a lift is stalled when three sessions over two weeks did no better', () => {
  assert.equal(isStalled(sessions([100, 100, 99, 100, 98])), true);
  assert.equal(isStalled(sessions([105, 100, 99, 100, 98])), false, 'a new best is progress');
  assert.equal(isStalled(sessions([100, 100, 99, 100])), false, 'too few sessions');
  assert.equal(isStalled(sessions([100, 100, 99, 100, 98], 2)), false, 'too short a time');
});

test('a stall shows up as a tip', () => {
  const tips = trainingTips(sessions([100, 100, 99, 100, 98]).map((s) => ({ ...s, pain: false, painNote: null })), '2026-10-22');
  assert.ok(tips.some((t) => t.kind === 'stalled'));
});

test('weekly gaps wait until later in the week', () => {
  // 2026-10-19 is a Monday.
  assert.deepEqual(weeklyGaps({ chest: 9 }, 1, '2026-10-20'), []);
  assert.deepEqual(weeklyGaps({ chest: 9, back: 8 }, 1, '2026-10-22'), ['shoulders', 'legs']);
  assert.deepEqual(weeklyGaps({ chest: 9, quads: 6 }, 2, '2026-10-20'), ['back', 'shoulders']);
  assert.deepEqual(weeklyGaps({ 'full body': 6 }, 2, '2026-10-22'), []);
  assert.deepEqual(weeklyGaps({}, 0, '2026-10-25'), []);
});

test('a goal projection follows the trend', () => {
  // About 1 kg a week of e1RM gain, sessions twice a week for six weeks.
  const s = Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.parse('2026-10-22T00:00:00Z') - i * 3.5 * 86400000).toISOString().slice(0, 10), sets: [set(100 - i * 0.5, 5)] }));
  const p = projectGoal(s, 125, '2026-10-22');
  assert.equal(p.status, 'projected');
  if (p.status === 'projected') {
    assert.ok(p.perWeekKg > 0.8 && p.perWeekKg < 1.4, `pace ${p.perWeekKg}`);
    assert.ok(p.date > '2026-12-01' && p.date < '2027-01-15', p.date); // about 7 weeks out
  }
});

test('a projection never assumes more than 1.5% a week', () => {
  const fast = Array.from({ length: 6 }, (_, i) => ({ date: new Date(Date.parse('2026-10-22T00:00:00Z') - i * 7 * 86400000).toISOString().slice(0, 10), sets: [set(100 - i * 5, 5)] }));
  const p = projectGoal(fast, 200, '2026-10-22');
  assert.equal(p.status, 'projected');
  if (p.status === 'projected') {
    assert.equal(p.capped, true);
    assert.ok(Math.abs(p.perWeekKg - p.currentKg * 0.015) < 0.01);
  }
});

test('goal projection edge cases', () => {
  const flat = Array.from({ length: 6 }, (_, i) => ({ date: new Date(Date.parse('2026-10-22T00:00:00Z') - i * 7 * 86400000).toISOString().slice(0, 10), sets: [set(100, 5)] }));
  assert.equal(projectGoal(flat, 150, '2026-10-22').status, 'flat');
  assert.equal(projectGoal(flat, 100, '2026-10-22').status, 'reached');
  assert.equal(projectGoal(flat.slice(0, 2), 150, '2026-10-22').status, 'not-enough');
});

test('volume comparisons pick a sensible thing', () => {
  assert.equal(volumeComparison(3000), 'That’s about 2 cars lifted today.');
  assert.equal(volumeComparison(2400), 'That’s about 5 grand pianos lifted today.');
  assert.equal(volumeComparison(10), null);
});

test('old preferences get training defaults', () => {
  const p = preferencesSchema.parse({ trainingTips: false });
  assert.deepEqual(p.training, { equipment: [], protectedAreas: [], neverSuggest: [], hiddenTips: [], goals: {}, trainingDays: [] });
});
