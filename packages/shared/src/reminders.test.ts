import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEnergy, formatClock, parseClock, planMedReminders, planReminders, usualFinishTime, usualMealTimes, type HabitPoint, type MedForReminders } from './index.ts';

const days = (n: number, meal: string, minutes: (i: number) => number): HabitPoint[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, meal, minutes: minutes(i) }));

test('a meal is a habit after eight days, at your median time', () => {
  const usual = usualMealTimes([...days(10, 'breakfast', (i) => 7 * 60 + i), ...days(5, 'snacks', () => 15 * 60)]);
  assert.equal(usual.breakfast, 7 * 60 + 5); // median of 7:00..7:09 is 7:04.5, rounded
  assert.equal(usual.snacks, undefined, 'five days is not a habit yet');
});

test('the first log of a meal each day is what counts', () => {
  const points = [...days(8, 'lunch', () => 12 * 60), ...days(8, 'lunch', () => 15 * 60)];
  assert.equal(usualMealTimes(points).lunch, 12 * 60);
});

test('finish time defaults until there are a few finished days', () => {
  assert.equal(usualFinishTime([20 * 60]), 21 * 60 + 30);
  assert.equal(usualFinishTime([20 * 60, 20 * 60 + 30, 21 * 60]), 20 * 60 + 30);
});

const base = { today: '2026-10-23', usual: { breakfast: 7 * 60, dinner: 19 * 60 }, finishAt: 21 * 60, meals: true, finish: true };

test("today's reminders skip logged meals and past times", () => {
  const r = planReminders({ ...base, nowMinutes: 9 * 60, loggedToday: ['breakfast'], finishedToday: false, days: 1 });
  assert.deepEqual(r.map((x) => [x.kind, x.meal ?? null, x.minutes]), [['meal', 'dinner', 20 * 60], ['finish', null, 21 * 60 + 30]]);
  const late = planReminders({ ...base, nowMinutes: 20 * 60 + 30, loggedToday: ['breakfast'], finishedToday: false, days: 1 });
  assert.deepEqual(late.map((x) => x.kind), ['finish'], 'the dinner nudge time has passed');
});

test('no finish nudge on an empty or finished day', () => {
  assert.equal(planReminders({ ...base, nowMinutes: 8 * 60, loggedToday: [], finishedToday: false, days: 1 }).some((r) => r.kind === 'finish'), false);
  assert.equal(planReminders({ ...base, nowMinutes: 8 * 60, loggedToday: ['breakfast'], finishedToday: true, days: 1 }).some((r) => r.kind === 'finish'), false);
});

test('later days get every habit, with stable ids, and settings switch kinds off', () => {
  const r = planReminders({ ...base, nowMinutes: 23 * 60, loggedToday: [], finishedToday: false });
  assert.deepEqual(r.map((x) => x.id), ['forkbell-2026-10-24-breakfast', 'forkbell-2026-10-24-dinner', 'forkbell-2026-10-24-finish', 'forkbell-2026-10-25-breakfast', 'forkbell-2026-10-25-dinner', 'forkbell-2026-10-25-finish']);
  assert.equal(planReminders({ ...base, meals: false, nowMinutes: 23 * 60, loggedToday: [], finishedToday: false }).every((x) => x.kind === 'finish'), true);
});

test('reminders stay out of quiet hours', () => {
  const r = planReminders({ ...base, usual: { snacks: 23 * 60 + 30 }, finish: false, nowMinutes: 0, loggedToday: [], finishedToday: false, days: 1 });
  assert.equal(r[0]!.minutes, 23 * 60);
});

test('the burn estimate switches to finished days once there are ten', () => {
  const series = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, weightKg: 80, trendKg: 80 }));
  const intake: Record<string, number> = {};
  const finished = new Set<string>();
  for (let i = 1; i <= 28; i++) {
    const d = `2026-09-${String(i).padStart(2, '0')}`;
    // Finished days are complete (2500); the others were only half logged.
    intake[d] = i % 2 ? 2500 : 1200;
    if (i % 2) finished.add(d);
  }
  const all = estimateEnergy(intake, series as never, '2026-09-30');
  const fin = estimateEnergy(intake, series as never, '2026-09-30', 28, finished);
  assert.equal(fin.usesFinishedDays, true);
  assert.equal(fin.kcal, 2500);
  assert.ok((all.kcal ?? 0) < 2000, 'half-logged days drag it down');
  assert.equal(estimateEnergy(intake, series as never, '2026-09-30', 28, new Set([...finished].slice(0, 5))).usesFinishedDays, false);
});

test('times are read the way people type them', () => {
  const cases: [string, string | null][] = [
    ['8', '08:00'], ['8:30', '08:30'], ['830', '08:30'], ['8:30pm', '20:30'], ['8 PM', '20:00'], ['12am', '00:00'],
    ['12 pm', '12:00'], ['20:30', '20:30'], ['7.15 a.m.', '07:15'], ['24:00', null], ['13pm', null], ['8:75', null], ['soon', null],
  ];
  for (const [input, want] of cases) assert.equal(parseClock(input), want, input);
  assert.equal(formatClock('20:30'), '8:30 PM');
  assert.equal(formatClock('00:05'), '12:05 AM');
});

test('medication reminders: each timed dose, skipping ticked and past ones today', () => {
  const meds: MedForReminders[] = [
    { id: 'a', name: 'Vitamin D', dose: '1000 IU', notes: null, active: true, reminderTimes: ['08:00', '20:00'], today: ['taken', null] },
    { id: 'b', name: 'Paused', dose: null, notes: null, active: false, reminderTimes: ['09:00'], today: [null] },
    { id: 'c', name: 'No time', dose: null, notes: null, active: true, reminderTimes: [null], today: [null] },
  ];
  const r = planMedReminders({ meds, today: '2026-10-23', nowMinutes: 7 * 60, days: 2 });
  assert.deepEqual(r.map((x) => `${x.date} ${x.minutes / 60}`), ['2026-10-23 20', '2026-10-24 8', '2026-10-24 20']);
  assert.equal(r[0]!.title, 'Time for Vitamin D');
  assert.equal(r[0]!.body, '1000 IU · dose 2 of 2');
  assert.equal(planMedReminders({ meds, today: '2026-10-23', nowMinutes: 21 * 60, days: 1 }).length, 0, 'the evening dose has passed');
  assert.equal(planMedReminders({ meds, today: '2026-10-23', nowMinutes: 0, days: 3, max: 2 }).length, 2);
});
