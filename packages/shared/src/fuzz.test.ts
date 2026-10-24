// Monkey tests for the logic: thousands of random, messy inputs thrown at the
// functions that read what people type or what a sensor reports. They must
// never throw, and their answers must always make sense. A failure prints the
// seed; run again with FUZZ_SEED=<seed> to get exactly the same inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes, buildStretchRoutine, eatenGrams, foodEmoji, gramsFromScale, gramsFromVolumes, parseClock, parseWeight,
  planMedReminders, plateVolumes, MUSCLES, type Stretch,
} from './index.ts';

const SEED = Number(process.env.FUZZ_SEED ?? Date.now() % 1_000_000);
const RUNS = Number(process.env.FUZZ_RUNS ?? 400);
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const r = rng(SEED);
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const messy = () => {
  const bits = ['8', '30', ':', ' ', 'pm', 'am', 'g', 'kg', 'oz', 'lb', '.', ',', '-', '0', '12', '99999', 'grams', 'of rice', 'NaN', '∞', '🍕', '\n', 'a.m.', '1e9', '  ', 'ml', 'pounds', '½'];
  return Array.from({ length: int(0, 6) }, () => pick(bits)).join(pick(['', ' ']));
};
const weird = () => pick([NaN, Infinity, -Infinity, -1, 0, 1e-9, 0.4, 0.37, 2.5, 10, r() * 2]);
const seedNote = `FUZZ_SEED=${SEED}`;

test(`typed and spoken times and weights never throw and stay sensible (${seedNote})`, () => {
  for (let i = 0; i < RUNS * 5; i++) {
    const s = messy();
    const t = parseClock(s);
    assert.ok(t === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t), `${seedNote} parseClock(${JSON.stringify(s)}) = ${t}`);
    const g = parseWeight(s);
    assert.ok(g === null || (g > 0 && g <= 20000), `${seedNote} parseWeight(${JSON.stringify(s)}) = ${g}`);
  }
});

test(`scale readings: one answer per food, never negative, leftovers never add (${seedNote})`, () => {
  for (let i = 0; i < RUNS; i++) {
    const values = Array.from({ length: int(0, 8) }, () => (r() < 0.2 ? null : pick([weird(), int(-50, 2000)])));
    const start = pick([0, int(0, 900), weird()]);
    for (const mode of ['tare', 'total'] as const) {
      const out = gramsFromScale(mode, values, Number.isFinite(start) ? start : 0);
      assert.equal(out.length, values.length, seedNote);
      for (const g of out) assert.ok(g === null || (g > 0 && Number.isFinite(g)), `${seedNote} ${mode} ${JSON.stringify(values)} -> ${out}`);
    }
    const w = int(1, 1000);
    const e = eatenGrams(w, r() < 0.3 ? null : int(-100, 2000), int(0, 600));
    assert.ok(e >= 0 && e <= w, `${seedNote} eatenGrams -> ${e}`);
  }
});

test(`grams from volumes: never negative, and add up to the scale exactly (${seedNote})`, () => {
  for (let i = 0; i < RUNS; i++) {
    const items = Array.from({ length: int(1, 8) }, () => ({ ml: pick([int(0, 800), weird()]), density: pick([weird(), r() * 2]) }));
    const safe = items.map((x) => ({ ml: Number.isFinite(x.ml) ? x.ml : 0, density: Number.isFinite(x.density) ? x.density : 1 }));
    const total = r() < 0.5 ? int(1, 1500) : null;
    const out = gramsFromVolumes(safe, total);
    assert.equal(out.length, safe.length);
    for (const g of out) assert.ok(Number.isFinite(g), `${seedNote} ${JSON.stringify(safe)} -> ${out}`);
    if (total && safe.some((x) => x.ml > 0)) assert.equal(out.reduce((a, b) => a + b, 0), total, `${seedNote} split ${JSON.stringify(safe)} of ${total} -> ${out}`);
    else assert.ok(out.every((g) => g >= 0), `${seedNote} ${out}`);
  }
});

test(`LiDAR volumes: any depth map and any boxes give an answer or a clear error, never a crash (${seedNote})`, () => {
  for (let i = 0; i < Math.ceil(RUNS / 8); i++) {
    const w = int(4, 48);
    const h = int(4, 36);
    const depth = Float32Array.from({ length: w * h }, () => (r() < 0.1 ? weird() : 0.4 - (r() < 0.3 ? r() * 0.05 : 0)));
    const confidence = r() < 0.5 ? Uint8Array.from({ length: w * h }, () => int(0, 2)) : null;
    const boxes = Array.from({ length: int(0, 5) }, () => ({ box: [r() * 1.4 - 0.2, r() * 1.4 - 0.2, r() * 1.4 - 0.2, r() * 1.4 - 0.2] as [number, number, number, number] }));
    const res = plateVolumes({ width: w, height: h, depth, confidence, fx: pick([w, w * 0.8, 1e-3, w * 3]), fy: pick([w, h, w * 2]), cx: w / 2, cy: h / 2 }, boxes);
    if (res.ok) {
      assert.equal(res.volumes.length, boxes.length);
      for (const v of res.volumes) assert.ok(v.ml >= 0 && Number.isFinite(v.ml) && v.coverage >= 0 && v.coverage <= 1, `${seedNote} ${JSON.stringify(v)}`);
    } else assert.ok(res.error.length > 10);
  }
});

test(`stretch routines: right kind, no repeats, never too long (${seedNote})`, () => {
  const kinds = ['dynamic', 'static', 'roll'] as const;
  const all: Stretch[] = Array.from({ length: 60 }, (_, i) => ({
    key: `str:${i}`, name: `S${i}`, kind: pick(kinds), muscles: Array.from({ length: int(1, 3) }, () => pick(MUSCLES)), equipment: pick(['none', 'foam roller', 'something to hold']),
    sides: r() < 0.5, level: pick(['beginner', 'intermediate', null]), steps: ['x'], howToRef: `S${i}`, pictures: 2,
  }));
  for (let i = 0; i < RUNS; i++) {
    const kind = pick(kinds);
    const count = int(1, 10);
    const out = buildStretchRoutine(all, { kind, muscles: Array.from({ length: int(0, 4) }, () => pick(MUSCLES)), count, anyEquipment: r() < 0.5 });
    assert.ok(out.length <= count, seedNote);
    assert.equal(new Set(out).size, out.length, `${seedNote} repeats`);
    assert.ok(out.every((s) => s.kind === kind), seedNote);
  }
});

test(`medication reminders: in order, within the limit, only for active timed doses (${seedNote})`, () => {
  for (let i = 0; i < RUNS / 4; i++) {
    const meds = Array.from({ length: int(0, 6) }, (_, k) => {
      const n = int(1, 6);
      return { id: `m${k}`, name: `Med ${k}`, dose: null, notes: null, active: r() < 0.8, reminderTimes: Array.from({ length: n }, () => (r() < 0.3 ? null : `${String(int(0, 23)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}`)), today: Array.from({ length: n }, () => pick(['taken', 'skipped', null] as const)) };
    });
    const max = int(1, 50);
    const out = planMedReminders({ meds, today: '2026-10-24', nowMinutes: int(0, 1439), days: int(1, 4), max });
    assert.ok(out.length <= max, seedNote);
    for (let k = 1; k < out.length; k++) assert.ok(out[k - 1]!.date < out[k]!.date || (out[k - 1]!.date === out[k]!.date && out[k - 1]!.minutes <= out[k]!.minutes), `${seedNote} order`);
    for (const d of out) assert.ok(meds.find((m) => m.id === d.medicationId)!.active, seedNote);
  }
});

test(`food icons and base64: always something, always the same bytes back (${seedNote})`, () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(foodEmoji(messy(), r() < 0.5 ? messy() : null).length > 0);
    const bytes = Uint8Array.from({ length: int(0, 64) }, () => int(0, 255));
    assert.deepEqual([...base64ToBytes(Buffer.from(bytes).toString('base64'))], [...bytes], seedNote);
  }
});
