// A believable month for one person, so screenshots show real screens instead
// of empty states. Talks to a fresh server through its public API only (the
// same calls the app makes), as a new password account.
//
//   BASE_URL=http://localhost:3999 node seed.mjs
//
// Prints nothing but progress; exits non-zero if the account can't be made.
// Anything after that is best effort: a missing piece shows as an empty card,
// not a failed run.
const BASE = process.env.BASE_URL ?? 'http://localhost:3999';
export const USERNAME = process.env.SEED_USERNAME ?? 'sam';
export const PASSWORD = process.env.SEED_PASSWORD ?? 'screenshots-only-0123';

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const at = (date, hh, mm = 0) => `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;

const signup = await fetch(`${BASE}/auth/password/signup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD, name: 'Sam Rivera', platform: 'native' }),
});
if (!signup.ok) {
  console.error(`sign-up failed: ${signup.status} ${await signup.text()}`);
  process.exit(1);
}
const { token } = await signup.json();

let problems = 0;
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    problems++;
    console.warn(`  ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.status === 204 ? {} : res.json();
}

console.log('account and goals');
const me = await call('GET', '/api/me');
await call('PUT', '/api/me/preferences', { ...me.preferences, onboarded: true, training: { ...me.preferences.training, trainingDays: [1, 3, 5] } });
await call('PUT', '/api/me/goals', { kcal: 2300, protein: 165, carbs: 240, fat: 75 });

console.log('weigh-ins');
// Down about a kilo and a half over a month, with the usual day-to-day noise.
for (let i = 34; i >= 0; i--) {
  const kg = 84.2 - (34 - i) * 0.045 + Math.sin(i * 1.7) * 0.35;
  if (i % 5 === 3) continue; // a few missed days, like a real person
  await call('PUT', '/api/progress/weigh-ins', { date: day(-i), weightKg: Math.round(kg * 10) / 10 });
}
await call('PUT', '/api/progress/goal', { goalWeightKg: 79, goalDate: day(120), weeklyWorkoutGoal: 3 });

console.log('program and workouts');
await call('POST', '/api/programs/starter', { key: 'ppl-6' });
const { exercises = [] } = (await call('GET', '/api/exercises')) ?? {};
const find = (name) => exercises.find((e) => e.name.toLowerCase() === name) ?? exercises.find((e) => e.name.toLowerCase().includes(name));
const plans = [
  { name: 'Push', lifts: [['bench press', 80], ['overhead press', 47.5], ['lateral raise', 10]] },
  { name: 'Pull', lifts: [['deadlift', 140], ['lat pulldown', 65], ['barbell curl', 30]] },
  { name: 'Legs', lifts: [['squat', 110], ['leg press', 180], ['calf raise', 60]] },
];
const set = (kg, reps) => ({ weightKg: kg, reps, seconds: null, rpe: null, warmup: false, done: true });
let n = 0;
for (const offset of [-20, -18, -16, -13, -11, -9, -6, -4, -2]) {
  const plan = plans[n % 3];
  const bump = Math.floor(n / 3) * 2.5; // a little heavier each round
  n++;
  const date = day(offset);
  const w = await call('POST', '/api/workouts', { date, startedAt: at(date, 17, 30), finishedAt: at(date, 18, 35) });
  if (!w) continue;
  const lifts = plan.lifts.map(([name, kg]) => [find(name), kg + bump]).filter(([e]) => e);
  await call('PUT', `/api/workouts/${w.workout.id}`, {
    name: plan.name,
    date,
    notes: null,
    exercises: lifts.map(([e, kg]) => ({ exerciseId: e.id, restSeconds: 120, targetSets: 3, repMin: 6, repMax: 10, superset: null, sets: [set(kg, 8), set(kg, 8), set(kg, 7)] })),
  });
}

console.log('food');
const food = (name, kcal, protein, carbs, fat, servingGrams = null, servingLabel = null) => ({ name, brand: null, source: 'custom', sourceId: null, per100: { kcal, protein, carbs, fat }, servingGrams, servingLabel, barcode: null, portions: [] });
const oats = food('Overnight oats', 160, 7, 24, 4);
const eggs = food('Scrambled eggs', 150, 11, 1.5, 11);
const toast = food('Sourdough toast', 260, 9, 50, 2, 45, 'slice');
const chicken = food('Chicken and rice bowl', 165, 12, 18, 4.5);
const salmon = food('Salmon with potatoes', 155, 10, 12, 7);
const yogurt = food('Greek yogurt', 97, 9, 4, 5);
const shake = food('Protein shake', 120, 24, 3, 1.5, 300, 'shake');
const banana = food('Banana', 89, 1.1, 23, 0.3, 120, 'banana');
for (let i = 13; i >= 0; i--) {
  const date = day(-i);
  const meals = [
    ['breakfast', i % 2 ? oats : eggs, i % 2 ? 300 : 180],
    ...(i % 2 ? [] : [['breakfast', toast, 90]]),
    ['lunch', chicken, 450],
    ['snacks', i % 3 ? shake : yogurt, i % 3 ? 300 : 200],
    ['snacks', banana, 120],
    // Today is only half logged: it's the middle of the day.
    ...(i === 0 ? [] : [['dinner', salmon, 480]]),
  ];
  for (const [meal, f, grams] of meals) await call('POST', '/api/diary', { date, meal, grams, food: f });
}

console.log('water and measurements');
await call('POST', '/api/wellbeing/water', { date: day(0), ml: 500 });
await call('POST', '/api/wellbeing/water', { date: day(0), ml: 750 });
for (const [i, cm] of [[28, 91], [14, 89.5], [0, 88]]) await call('PUT', '/api/progress/measurements', { date: day(-i), kind: 'waist', value: cm, unit: 'cm' });

console.log(problems ? `seeded, with ${problems} call(s) refused (see above)` : 'seeded');
