// Measuring food from a LiDAR depth map. The iPhone gives a small depth image
// (256 × 192, metres) lined up with the photo. Bell boxes each food in the
// photo; here we find the table (or plate) as a flat plane, then add up how
// far each food rises above it, pixel by pixel, to get its volume. Grams then
// come from the volume and the food's density, or, when the plate was
// weighed, from splitting the scale's exact total in proportion.

export interface DepthScan {
  width: number;
  height: number;
  /** metres from the camera, row by row; 0 or NaN where there's no reading */
  depth: ArrayLike<number>;
  /** 0 low, 1 medium, 2 high, per pixel; optional */
  confidence?: ArrayLike<number> | null;
  /** camera focal lengths and centre, in depth-map pixels */
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** A food's box in the photo, as fractions of its width and height from the top-left. */
export interface FoodBox {
  box: [left: number, top: number, right: number, bottom: number];
}

export interface FoodVolume {
  ml: number;
  /** how much of the box had a usable depth reading, 0 to 1 */
  coverage: number;
}

export type VolumeResult = { ok: true; volumes: FoodVolume[]; tableTilt: number } | { ok: false; error: string };

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** A small seeded random number generator, so the same scan always gives the same answer. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const NOISE_M = 0.003; // under 3 mm above the base is the sensor's noise, not food
const PLANE_M = 0.008; // a point within 8 mm of the plane is on it

export function plateVolumes(scan: DepthScan, foods: FoodBox[]): VolumeResult {
  const { width: w, height: h, depth, confidence, fx, fy, cx, cy } = scan;
  const point = (x: number, y: number): V3 | null => {
    const z = depth[y * w + x]!;
    if (!(z > 0.05 && z < 3) || (confidence && (confidence[y * w + x] ?? 0) < 1)) return null;
    return [((x - cx) / fx) * z, ((y - cy) / fy) * z, z];
  };
  // Boxes in depth pixels; each pixel belongs to the smallest box it's in.
  const boxes = foods.map((f) => {
    const [l, t, r, b] = f.box;
    return { x0: Math.max(0, Math.floor(l * w)), y0: Math.max(0, Math.floor(t * h)), x1: Math.min(w, Math.ceil(r * w)), y1: Math.min(h, Math.ceil(b * h)) };
  });
  const area = (b: (typeof boxes)[number]) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const owner = new Int16Array(w * h).fill(-1);
  boxes
    .map((b, i) => ({ b, i }))
    .sort((a, c) => area(c.b) - area(a.b)) // big first, so smaller boxes overwrite
    .forEach(({ b, i }) => {
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) owner[y * w + x] = i;
    });

  // The table: a plane through the points outside every box, found by trying many and keeping the best.
  const pad = (b: (typeof boxes)[number]) => ({ x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3 });
  const padded = boxes.map(pad);
  const background: V3[] = [];
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      if (padded.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
      const p = point(x, y);
      if (p) background.push(p);
    }
  if (background.length < 30) return { ok: false, error: 'Not enough of the table showed around the food. Hold the phone higher so some table shows on every side.' };
  const rand = rng(background.length * 7919 + w);
  let best: { n: V3; d: number; inliers: number } | null = null;
  for (let it = 0; it < 250; it++) {
    const a = background[Math.floor(rand() * background.length)]!;
    const b = background[Math.floor(rand() * background.length)]!;
    const c = background[Math.floor(rand() * background.length)]!;
    let n = cross(sub(b, a), sub(c, a));
    const len = norm(n);
    if (len < 1e-9) continue;
    n = [n[0] / len, n[1] / len, n[2] / len];
    let d = -dot(n, a);
    // Facing the camera: the camera (the origin) is on the positive side, so food has positive height.
    if (d < 0) {
      n = [-n[0], -n[1], -n[2]];
      d = -d;
    }
    // Only surfaces the phone looks down on (tilted under 60°) can be the table: a fridge wall or
    // the side of a container seen edge-on is often the biggest flat thing in view, and measuring
    // food against it gave 0 ml.
    if (Math.abs(n[2]) < 0.5) continue;
    let inliers = 0;
    for (const p of background) if (Math.abs(dot(n, p) + d) < PLANE_M) inliers++;
    if (!best || inliers > best.inliers) best = { n, d, inliers };
  }
  if (!best || best.inliers < Math.max(30, background.length * 0.2)) return { ok: false, error: 'Couldn’t find a flat table around the plate. Try again on a clear table, holding the phone straight above.' };
  // Refine: a least-squares plane through all the table points the best guess agreed with,
  // so the answer doesn't depend on which three random points happened to win.
  const { n, d } = refinePlane(background.filter((p) => Math.abs(dot(best!.n, p) + best!.d) < PLANE_M), best);
  const heightOf = (p: V3) => dot(n, p) + d;
  // How far the phone is from straight above (the plane's tilt), in degrees.
  const tableTilt = Math.round((Math.acos(Math.min(1, Math.abs(n[2]))) * 180) / Math.PI);

  const volumes = boxes.map((b, i) => {
    // The base: the plate around this food (the lower part of a ring just outside its box).
    const ring: number[] = [];
    const m = Math.max(2, Math.round(Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.12));
    for (let y = Math.max(0, b.y0 - m); y < Math.min(h, b.y1 + m); y++)
      for (let x = Math.max(0, b.x0 - m); x < Math.min(w, b.x1 + m); x++) {
        const inside = x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
        if (inside || owner[y * w + x] !== -1) continue;
        const p = point(x, y);
        if (p) ring.push(heightOf(p));
      }
    ring.sort((a, c) => a - c);
    const base = ring.length ? Math.min(0.03, Math.max(0, ring[Math.floor(ring.length * 0.25)]!)) : 0;
    let vol = 0;
    let total = 0;
    let valid = 0;
    for (let y = b.y0; y < b.y1; y++)
      for (let x = b.x0; x < b.x1; x++) {
        if (owner[y * w + x] !== i) continue;
        total++;
        const p = point(x, y);
        if (!p) continue;
        valid++;
        const rise = heightOf(p) - base;
        if (rise <= NOISE_M) continue;
        // The pixel's footprint on the table: bigger farther away, and when seen at an angle.
        const ray: V3 = [(x - cx) / fx, (y - cy) / fy, 1];
        const cos = Math.max(0.4, Math.abs(dot(n, ray)) / norm(ray));
        vol += (rise * (p[2] * p[2])) / (fx * fy) / cos;
      }
    const coverage = total ? valid / total : 0;
    // Pixels without a reading are assumed to be like the rest of this food.
    const ml = coverage > 0 ? (vol / coverage) * 1e6 : 0;
    return { ml: Math.round(ml), coverage: Math.round(coverage * 100) / 100 };
  });
  return { ok: true, volumes, tableTilt };
}

/**
 * Grams for each food: volume × density, or, with the scale's total for the
 * food on the plate, that exact total split in the same proportions.
 */
export function gramsFromVolumes(items: { ml: number; density: number }[], scaleTotal?: number | null): number[] {
  const raw = items.map((i) => Math.max(0, i.ml) * Math.min(3, Math.max(0.05, i.density)));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (scaleTotal && scaleTotal > 0 && sum > 0) {
    const out = raw.map((g) => Math.round((g / sum) * scaleTotal));
    // Rounding can be a gram off; the biggest takes it, so they add up to the scale exactly.
    const big = out.indexOf(Math.max(...out));
    out[big]! += Math.round(scaleTotal) - out.reduce((a, b) => a + b, 0);
    return out;
  }
  return raw.map((g) => Math.round(g));
}

/** Base64 to bytes, for the depth map from the phone. */
export function base64ToBytes(b64: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map = new Int16Array(128).fill(-1);
  for (let i = 0; i < A.length; i++) map[A.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (map[clean.charCodeAt(i)]! << 18) | (map[clean.charCodeAt(i + 1)]! << 12) | ((map[clean.charCodeAt(i + 2)] ?? 0) & 63) << 6 | ((map[clean.charCodeAt(i + 3)] ?? 0) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** Fit z = a·x + b·y + c through the points; falls back to the guess if that's degenerate. */
function refinePlane(points: V3[], guess: { n: V3; d: number }): { n: V3; d: number } {
  if (points.length < 10) return guess;
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const [x, y, z] of points) {
    sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z;
  }
  const k = points.length;
  // Solve the 3×3 normal equations by Cramer's rule.
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, k],
  ];
  const r = [sxz, syz, sz];
  const det3 = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const D = det3(m);
  if (Math.abs(D) < 1e-12) return guess;
  const col = (i: number) => m.map((row, j) => row.map((v, c) => (c === i ? r[j]! : v)));
  const [a, b, c] = [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
  // a·x + b·y − z + c = 0, facing the camera (positive at the origin).
  let n: V3 = [a, b, -1];
  const len = norm(n);
  n = [n[0] / len, n[1] / len, n[2] / len];
  let d = c / len;
  if (d < 0) {
    n = [-n[0], -n[1], -n[2]];
    d = -d;
  }
  return { n, d };
}
