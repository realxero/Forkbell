import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseKey, guessKind, guessMuscle, nameCandidates, parseCsv, parseWorkoutExport, readLocalDateTime, durationMinutes } from './workout-import.ts';

process.env.TZ = 'America/Los_Angeles';

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-03-15 18:02:31,"Push Day",1h 5m,"Bench Press (Barbell)",W,95,10,0,0,"",,
2026-03-15 18:02:31,"Push Day",1h 5m,"Bench Press (Barbell)",1,185,8,0,0,"",,8
2026-03-15 18:02:31,"Push Day",1h 5m,"Bench Press (Barbell)",2,135,12,0,0,"",,
2026-03-15 18:02:31,"Push Day",1h 5m,"Bench Press (Barbell)",Rest Timer,0,0,0,90,"",,
2026-03-17 07:00:00,"Run",30m,"Running",1,0,0,3.1,1800,"",,`;

test('Strong: sets, warm-ups, the unit the app used, times as local', () => {
  const r = parseWorkoutExport(STRONG, 'lb');
  assert.equal(r.format, 'strong');
  assert.equal(r.workouts.length, 2);
  const push = r.workouts[0]!;
  assert.equal(push.date, '2026-03-15');
  assert.equal(push.startedAt, '2026-03-16T01:02:31.000Z', '6:02 pm in California');
  assert.equal(Date.parse(push.finishedAt) - Date.parse(push.startedAt), 65 * 60_000);
  const bench = push.exercises[0]!;
  assert.equal(bench.sets.length, 3, 'the rest timer row is not a set');
  assert.deepEqual(bench.sets.map((s) => [s.warmup, s.reps]), [[true, 10], [false, 8], [false, 12]]);
  assert.equal(bench.sets[1]!.weightKg, 83.91);
  assert.equal(bench.sets[1]!.rpe, 8);
  const run = r.workouts[1]!.exercises[0]!.sets[0]!;
  assert.deepEqual([run.seconds, Math.round(run.distanceM!)], [1800, 4989]);
});

const HEVY = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
Upper,"15 Mar 2026, 18:02","15 Mar 2026, 19:10",,Bench Press (Barbell),,,0,warmup,40,10,,,
Upper,"15 Mar 2026, 18:02","15 Mar 2026, 19:10",,Bench Press (Barbell),,,1,normal,80,8,,,9
Upper,"15 Mar 2026, 18:02","15 Mar 2026, 19:10",,Bench Press (Barbell),,,2,dropset,60,12,,,
Upper,"15 Mar 2026, 18:02","15 Mar 2026, 19:10",,Bent Over Row (Barbell),0,"Strict",0,normal,70,8,,,
Upper,"15 Mar 2026, 18:02","15 Mar 2026, 19:10",,Pull Up,0,,0,normal,,10,,,`;

test('Hevy: kg in the column name, warm-up and drop sets, supersets, notes', () => {
  const r = parseWorkoutExport(HEVY, 'lb');
  assert.equal(r.format, 'hevy');
  const w = r.workouts[0]!;
  assert.equal(Date.parse(w.finishedAt) - Date.parse(w.startedAt), 68 * 60_000);
  const bench = w.exercises[0]!;
  assert.deepEqual(bench.sets.map((s) => [s.weightKg, s.warmup, s.drop]), [[40, true, false], [80, false, false], [60, false, true]]);
  assert.deepEqual(w.exercises.map((e) => e.superset), [null, 1, 1]);
  assert.equal(w.notes, 'Bent Over Row (Barbell): Strict');
});

const FITNOTES = `Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time,Comment
2026-03-15,Flat Barbell Bench Press,Chest,185.0,8,,,,
2026-03-15,Flat Barbell Bench Press,Chest,185.0,7,,,,Felt heavy
2026-03-16,Treadmill,Cardio,,,5.0,km,0:30:00,`;

test('FitNotes: one workout a day, the unit from the column, cardio time and distance', () => {
  const r = parseWorkoutExport(FITNOTES, 'kg');
  assert.equal(r.format, 'fitnotes');
  assert.equal(r.workouts.length, 2);
  assert.equal(r.workouts[0]!.exercises[0]!.sets[0]!.weightKg, 83.91, 'lb from the column, though the person uses kg');
  assert.equal(r.workouts[0]!.exercises[0]!.category, 'Chest');
  assert.deepEqual(r.workouts[1]!.exercises[0]!.sets[0], { weightKg: null, reps: null, seconds: 1800, distanceM: 5000, rpe: null, warmup: false, drop: false });
});

test('not an export', () => {
  const r = parseWorkoutExport('name,calories\napple,95', 'lb');
  assert.equal(r.format, null);
  assert.match(r.problems[0]!, /doesn’t look like/);
});

test('CSV, dates and durations', () => {
  assert.deepEqual(parseCsv('a;b\n"x;1";"say ""hi"""'), [['a', 'b'], ['x;1', 'say "hi"']]);
  assert.equal(readLocalDateTime('Mar 15, 2026 6:02 PM')?.getHours(), 18);
  assert.equal(readLocalDateTime('nope'), null);
  assert.equal(durationMinutes('1h 5m'), 65);
  assert.equal(durationMinutes('45m'), 45);
});

test('names, muscles and kinds', () => {
  assert.equal(exerciseKey('Bicep Curls (Dumbbell)'), exerciseKey('Biceps Curl (dumbbell)'), 'bicep and biceps, curl and curls are the same');
  assert.deepEqual(nameCandidates('Bench Press (Barbell)'), ['barbell bench press', 'bench press barbell', 'bench press']);
  assert.equal(guessMuscle('Cable Crossover', 'Chest'), 'chest');
  assert.equal(guessMuscle('Lying Leg Curl', 'Legs'), 'hamstrings');
  assert.equal(guessMuscle('Hammer Curl (Dumbbell)', null), 'biceps');
  assert.equal(guessKind('Treadmill', 'Cardio', []), 'cardio');
  assert.equal(guessKind('Pull Up', null, [{ weightKg: null, reps: 10, seconds: null, distanceM: null, rpe: null, warmup: false, drop: false }]), 'bodyweight');
});
