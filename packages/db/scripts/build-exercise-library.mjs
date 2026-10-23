// Builds data/exercise-library.json from Free Exercise DB (public domain,
// https://github.com/yuhonas/free-exercise-db), pinned to one commit so the
// pictures the server fetches always match the steps saved here.
//
//   node scripts/build-exercise-library.mjs
//
// It maps the dataset onto Forkbell's own muscles, equipment, kinds and rest
// times, attaches pictures and steps to the built-in exercises, and adds the
// rest as the "full library". Stretches are left out (nothing to log).
import { readFile, writeFile } from 'node:fs/promises';

export const SOURCE_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const url = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${SOURCE_COMMIT}/dist/exercises.json`;

// Built-in exercise key -> the dataset entry that shows the same movement.
const CORE = {
  'bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'incline-bench-press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'db-bench-press': 'Dumbbell_Bench_Press',
  'db-incline-press': 'Incline_Dumbbell_Press',
  'machine-chest-press': 'Leverage_Chest_Press',
  'cable-fly': 'Cable_Crossover',
  'db-fly': 'Dumbbell_Flyes',
  'push-up': 'Pushups',
  dip: 'Dips_-_Chest_Version',
  deadlift: 'Barbell_Deadlift',
  'barbell-row': 'Bent_Over_Barbell_Row',
  'db-row': 'One-Arm_Dumbbell_Row',
  'pull-up': 'Pullups',
  'chin-up': 'Chin-Up',
  'lat-pulldown': 'Wide-Grip_Lat_Pulldown',
  'seated-cable-row': 'Seated_Cable_Rows',
  'chest-supported-row': 'Leverage_Iso_Row',
  'face-pull': 'Face_Pull',
  'back-extension': 'Hyperextensions_Back_Extensions',
  'overhead-press': 'Standing_Military_Press',
  'db-shoulder-press': 'Dumbbell_Shoulder_Press',
  'lateral-raise': 'Side_Lateral_Raise',
  'cable-lateral-raise': 'Standing_Low-Pulley_Deltoid_Raise',
  'rear-delt-fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'machine-shoulder-press': 'Machine_Shoulder_Military_Press',
  'barbell-curl': 'Barbell_Curl',
  'db-curl': 'Dumbbell_Bicep_Curl',
  'hammer-curl': 'Hammer_Curls',
  'cable-curl': 'Standing_Biceps_Cable_Curl',
  'preacher-curl': 'Preacher_Curl',
  'triceps-pushdown': 'Triceps_Pushdown',
  'overhead-triceps-extension': 'Cable_Rope_Overhead_Triceps_Extension',
  'skull-crusher': 'EZ-Bar_Skullcrusher',
  'close-grip-bench': 'Close-Grip_Barbell_Bench_Press',
  'back-squat': 'Barbell_Squat',
  'front-squat': 'Front_Barbell_Squat',
  'goblet-squat': 'Goblet_Squat',
  'leg-press': 'Leg_Press',
  'hack-squat': 'Hack_Squat',
  'bulgarian-split-squat': 'Split_Squat_with_Dumbbells',
  'walking-lunge': 'Dumbbell_Lunges',
  'leg-extension': 'Leg_Extensions',
  'romanian-deadlift': 'Romanian_Deadlift',
  'db-romanian-deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  'lying-leg-curl': 'Lying_Leg_Curls',
  'seated-leg-curl': 'Seated_Leg_Curl',
  'hip-thrust': 'Barbell_Hip_Thrust',
  'glute-bridge': 'Butt_Lift_Bridge',
  'standing-calf-raise': 'Standing_Calf_Raises',
  'seated-calf-raise': 'Seated_Calf_Raise',
  plank: 'Plank',
  'side-plank': 'Side_Bridge',
  'hanging-leg-raise': 'Hanging_Leg_Raise',
  'cable-crunch': 'Cable_Crunch',
  'ab-wheel': 'Ab_Roller',
  'kettlebell-swing': 'One-Arm_Kettlebell_Swings',
  'power-clean': 'Power_Clean',
  'farmers-carry': 'Farmers_Walk',
};

// Where the dataset has pictures but no written steps, Forkbell's own.
const OWN_STEPS = {
  Side_Bridge: [
    'Lie on your side with your forearm on the floor, elbow under your shoulder, and your legs straight and stacked.',
    'Lift your hips until your body makes a straight line from head to feet. Keep your hips from sagging or rolling forward.',
    'Hold for the time you planned, breathing steadily, then lower slowly and switch sides.',
  ],
  'One-Arm_Kettlebell_Swings': [
    'Stand with feet a little wider than your hips and the kettlebell on the floor just in front of you.',
    'Hinge at the hips with a flat back, grab the handle, and hike the bell back between your legs.',
    'Drive your hips forward hard to swing the bell up to about chest height; your arms just guide it.',
    'Let it fall back between your legs, hinging again, and go straight into the next swing. Two hands works the same way.',
  ],
};

// The dataset's muscles onto Forkbell's eleven groups.
const MUSCLE = {
  abdominals: 'core', abductors: 'glutes', adductors: 'quads', biceps: 'biceps', calves: 'calves', chest: 'chest',
  forearms: 'biceps', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'back', 'lower back': 'back', 'middle back': 'back',
  neck: 'shoulders', quadriceps: 'quads', shoulders: 'shoulders', traps: 'shoulders', triceps: 'triceps',
};
const EQUIPMENT = {
  barbell: 'barbell', 'e-z curl bar': 'barbell', dumbbell: 'dumbbell', machine: 'machine', cable: 'cable', kettlebells: 'kettlebell',
  bands: 'band', 'body only': 'bodyweight', 'medicine ball': 'other', 'exercise ball': 'other', 'foam roll': 'other', other: 'other',
};
const TIMED = /\b(plank|hold|wall sit|isometric)\b/i;

const raw = JSON.parse(process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(url)).text());
const byId = new Map(raw.map((e) => [e.id, e]));
for (const [key, id] of Object.entries(CORE)) if (!byId.has(id)) throw new Error(`No dataset entry ${id} for ${key}`);
const coreIds = new Set(Object.values(CORE));

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const howTo = (e) => ({
  ref: e.id,
  level: e.level ?? null,
  secondary: [...new Set((e.secondaryMuscles ?? []).map((m) => MUSCLE[m]).filter(Boolean))],
  steps: (e.instructions?.length ? e.instructions : (OWN_STEPS[e.id] ?? [])).map(clean).filter(Boolean),
  images: (e.images ?? []).length,
});

const library = [];
for (const e of raw) {
  if (e.category === 'stretching' || coreIds.has(e.id) || !(e.images ?? []).length || !(e.instructions ?? []).length) continue;
  const primary = (e.primaryMuscles ?? []).map((m) => MUSCLE[m]).filter(Boolean);
  const muscle = e.category === 'cardio' || ['olympic weightlifting', 'strongman'].includes(e.category) && primary.length > 1 ? 'full body' : (primary[0] ?? 'full body');
  const equipment = EQUIPMENT[e.equipment ?? 'body only'] ?? 'other';
  const kind = e.category === 'cardio' || TIMED.test(e.name) ? 'time' : equipment === 'bodyweight' ? 'bodyweight' : 'weight';
  const lower = ['quads', 'hamstrings', 'glutes'].includes(muscle) || muscle === 'full body';
  const increment = e.mechanic === 'compound' && lower && (equipment === 'barbell' || equipment === 'machine') ? 'large' : 'small';
  const restSeconds = kind === 'time' ? 60 : e.mechanic === 'compound' ? (equipment === 'barbell' ? 180 : 120) : 90;
  library.push({ key: `lib:${e.id}`, name: clean(e.name), muscle, equipment, kind, increment, restSeconds, ...howTo(e) });
}
library.sort((a, b) => a.name.localeCompare(b.name));

const core = Object.fromEntries(Object.entries(CORE).map(([key, id]) => [key, howTo(byId.get(id))]));
const out = {
  source: 'Free Exercise DB by yuhonas, released into the public domain (Unlicense): https://github.com/yuhonas/free-exercise-db',
  commit: SOURCE_COMMIT,
  core,
  library,
};
const path = new URL('../data/exercise-library.json', import.meta.url);
await writeFile(path, JSON.stringify(out) + '\n');
console.log(`core with how-to: ${Object.keys(core).length}, full library: ${library.length}`);
