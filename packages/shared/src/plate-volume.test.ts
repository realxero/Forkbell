import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, gramsFromVolumes, plateVolumes, type DepthScan } from './index.ts';

const W = 64;
const H = 48;
const f = 50;
/** A table 40 cm below the phone, with food blocks of a given height. */
function scan(blocks: { x0: number; y0: number; x1: number; y1: number; cm: number }[], tilt = 0): DepthScan {
  const depth = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // A tilted table: depth changes across the width.
      const table = 0.4 + tilt * ((x - W / 2) / f) * 0.4;
      const block = blocks.find((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);
      depth[y * W + x] = table - (block ? block.cm / 100 : 0);
    }
  return { width: W, height: H, depth, fx: f, fy: f, cx: W / 2, cy: H / 2 };
}
const box = (x0: number, y0: number, x1: number, y1: number) => ({ box: [x0 / W, y0 / H, x1 / W, y1 / H] as [number, number, number, number] });

test('a 3 cm block of food has the volume of its footprint times its height', () => {
  const r = plateVolumes(scan([{ x0: 20, y0: 14, x1: 40, y1: 30, cm: 3 }]), [box(18, 12, 42, 32)]);
  assert.ok(r.ok);
  // 20 × 16 pixels, each (0.37 m / 50)² at the top surface, 3 cm tall: about 526 ml.
  assert.ok(Math.abs(r.volumes[0]!.ml - 526) < 526 * 0.1, `${r.volumes[0]!.ml} ml`);
  assert.equal(r.tableTilt, 0);
});

test('two foods are measured separately, and a slightly tilted phone still works', () => {
  const blocks = [{ x0: 8, y0: 10, x1: 24, y1: 26, cm: 2 }, { x0: 36, y0: 10, x1: 56, y1: 30, cm: 4 }];
  const r = plateVolumes(scan(blocks, 0.15), [box(6, 8, 26, 28), box(34, 8, 58, 32)]);
  assert.ok(r.ok);
  const [a, b] = r.volumes;
  assert.ok(b!.ml > a!.ml * 2.5, `${a!.ml} vs ${b!.ml}`);
  assert.ok(r.tableTilt > 0 && r.tableTilt < 20);
});

test('no table showing is an error, not a guess', () => {
  const r = plateVolumes(scan([]), [box(0, 0, 64, 48)]);
  assert.equal(r.ok, false);
});

test('grams: volume times density, or the scale total split the same way', () => {
  assert.deepEqual(gramsFromVolumes([{ ml: 230, density: 0.8 }, { ml: 150, density: 1 }]), [184, 150]);
  assert.deepEqual(gramsFromVolumes([{ ml: 230, density: 0.8 }, { ml: 150, density: 1 }], 330), [182, 148]);
  const three = gramsFromVolumes([{ ml: 100, density: 1 }, { ml: 100, density: 1 }, { ml: 100, density: 1 }], 100);
  assert.equal(three.reduce((a, b) => a + b, 0), 100, 'adds up to the scale exactly');
});

test('base64 decodes to the same bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  const b64 = Buffer.from(bytes).toString('base64');
  assert.deepEqual([...base64ToBytes(b64)], [...bytes]);
  const floats = new Float32Array([0.4, 0.37, 1.5]);
  const back = new Float32Array(base64ToBytes(Buffer.from(floats.buffer).toString('base64')).buffer);
  assert.deepEqual([...back].map((x) => Math.round(x * 100)), [40, 37, 150]);
});
