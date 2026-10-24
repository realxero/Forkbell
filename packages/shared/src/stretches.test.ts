import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStretchRoutine, stretchDose, stretchSeconds, type Stretch } from './index.ts';

const s = (key: string, kind: Stretch['kind'], muscles: Stretch['muscles'], extra: Partial<Stretch> = {}): Stretch => ({
  key, name: key, kind, muscles, equipment: 'none', sides: false, level: 'beginner', steps: ['Do it.'], howToRef: key, pictures: 2, ...extra,
});
const all = [
  s('str:Arm_Circles', 'dynamic', ['shoulders']),
  s('str:Dynamic_Chest', 'dynamic', ['chest', 'back']),
  s('str:Leg_Swing', 'dynamic', ['hamstrings'], { sides: true }),
  s('str:Torso_Ball', 'dynamic', ['core'], { equipment: 'exercise ball' }),
  s('str:Chest_Hold', 'static', ['chest']),
  s('str:Doorway', 'static', ['chest', 'shoulders'], { equipment: 'something to hold' }),
  s('str:Quad_Hold', 'static', ['quads'], { sides: true }),
  s('str:Hams_Hold', 'static', ['hamstrings'], { sides: true }),
  s('str:Quad_Roll', 'roll', ['quads'], { equipment: 'foam roller', sides: true }),
];

test('a warm-up is moving stretches for what you train, opener first', () => {
  const r = buildStretchRoutine(all, { kind: 'dynamic', muscles: ['chest', 'shoulders'] });
  assert.deepEqual(r.map((x) => x.key), ['str:Arm_Circles', 'str:Dynamic_Chest']);
  assert.ok(r.every((x) => x.kind === 'dynamic'));
});

test('no equipment unless asked for; foam rolling always uses a roller', () => {
  assert.ok(!buildStretchRoutine(all, { kind: 'dynamic', muscles: ['core'] }).length);
  assert.equal(buildStretchRoutine(all, { kind: 'dynamic', muscles: ['core'], anyEquipment: true })[0]?.key, 'str:Torso_Ball');
  assert.equal(buildStretchRoutine(all, { kind: 'roll', muscles: ['quads'] })[0]?.key, 'str:Quad_Roll');
});

test('a cool-down covers each muscle once before doubling up, and stops at the count', () => {
  const r = buildStretchRoutine(all, { kind: 'static', muscles: ['quads', 'hamstrings', 'chest'], count: 2 });
  assert.deepEqual(r.map((x) => x.key), ['str:Quad_Hold', 'str:Hams_Hold']);
  const full = buildStretchRoutine(all, { kind: 'static', muscles: ['full body'] });
  assert.equal(new Set(full).size, full.length, 'no repeats');
});

test('doses and timing', () => {
  assert.equal(stretchDose({ kind: 'static', sides: true }).label, 'Hold 30 s each side, easy breathing');
  assert.equal(stretchSeconds({ kind: 'roll', sides: true }), 90);
  assert.equal(stretchSeconds({ kind: 'dynamic', sides: false }), 30);
});
