import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeForm, formPattern, type Frame, type Point } from './form.ts';

const P = (x: number, y: number): Point => ({ x, y, visibility: 0.95 });
/** A side-view stick figure squatting: t from 0 (standing) to 1 (bottom). */
function squatFrame(t: number, ms: number, deep: boolean): Frame {
  const lm: Point[] = Array.from({ length: 33 }, () => P(0.5, 0.5));
  const ankle = P(0.5, 0.95);
  const knee = P(0.5 + 0.12 * t, 0.75);
  // Standing hip is above the knee; at the bottom a deep squat puts the hip just below the knee.
  const hip = P(0.5 - 0.1 * t, 0.55 + (deep ? 0.22 : 0.1) * t);
  const shoulder = P(hip.x + 0.12 * t, hip.y - 0.3);
  for (const [i, p] of [[11, shoulder], [23, hip], [25, knee], [27, ankle]] as const) lm[i] = p;
  return { t: ms, lm };
}
function squatSet(reps: { deep: boolean; frames?: number }[]) {
  const out: Frame[] = [];
  let ms = 0;
  for (let k = 0; k < 4; k++) out.push(squatFrame(0, (ms += 33), true));
  for (const r of reps) {
    const n = r.frames ?? 40;
    for (let i = 0; i <= n; i++) out.push(squatFrame(Math.sin((Math.PI * i) / n), (ms += 33), r.deep));
  }
  for (let k = 0; k < 4; k++) out.push(squatFrame(0, (ms += 33), true));
  return out;
}

test('picks the right checks from the exercise name', () => {
  assert.equal(formPattern('Barbell back squat'), 'squat');
  assert.equal(formPattern('Romanian deadlift'), 'hinge');
  assert.equal(formPattern('Incline bench press'), 'bench');
  assert.equal(formPattern('Lat pulldown'), 'pull');
  assert.equal(formPattern('Plank'), 'generic');
});

test('counts squat reps and flags the shallow one', () => {
  const r = analyzeForm(squatSet([{ deep: true }, { deep: true }, { deep: false }, { deep: true }]), 'Back squat');
  assert.equal(r.reps, 4);
  assert.deepEqual(r.repDetails.map((d) => d.issues.length > 0), [false, false, true, false]);
  assert.match(r.summary.join(' '), /4 reps, 3 with no form flags/);
  assert.match(r.summary.join(' '), /Not quite to depth.*rep 3/);
});

test('a slow grinding last rep is called out', () => {
  const r = analyzeForm(squatSet([{ deep: true }, { deep: true }, { deep: true }, { deep: true, frames: 90 }]), 'Back squat');
  assert.match(r.summary.join(' '), /last rep slowed right down/);
});

test('stays honest with too little to go on', () => {
  assert.equal(analyzeForm(squatSet([]).slice(0, 5), 'Back squat').reps, 0);
  const still = squatSet([]).concat(squatSet([]));
  assert.match(analyzeForm(still, 'Back squat').summary.join(' '), /No clear reps/);
});
