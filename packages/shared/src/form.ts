// Form check: count reps and spot common form problems from body landmarks
// (the 33 MediaPipe pose points) tracked on the phone. Pure functions, so the
// same logic runs in the camera page and in tests. 2D only, from a side view:
// it can see depth, range of motion, lockout, torso lean and swinging, but
// not everything a coach would (like a rounding back or knees caving).
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type Frame = { t: number; lm: Point[] };
export type FormPattern = 'squat' | 'hinge' | 'bench' | 'press' | 'curl' | 'pull' | 'generic';

export function formPattern(name: string): FormPattern {
  const n = name.toLowerCase();
  if (/squat|leg press|lunge|split squat|step[- ]?up/.test(n)) return 'squat';
  if (/deadlift|rdl|romanian|good morning|hip thrust|hinge|swing/.test(n)) return 'hinge';
  if (/bench|chest press|push[- ]?up|dip|floor press/.test(n)) return 'bench';
  if (/overhead|shoulder press|military|push press|arnold/.test(n)) return 'press';
  if (/curl/.test(n)) return 'curl';
  if (/row|pulldown|pull[- ]?up|chin[- ]?up/.test(n)) return 'pull';
  return 'generic';
}

/** Whether we have checks for this lift (otherwise reps only). */
export const formChecked = (p: FormPattern) => p !== 'generic';

// MediaPipe pose landmark indexes, left / right.
const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };

const angle = (a: Point, b: Point, c: Point) => {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const vis = (p?: Point) => p?.visibility ?? 1;
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] ?? 0;
};

export interface RepResult {
  index: number;
  seconds: number;
  issues: string[];
}
export interface FormResult {
  pattern: FormPattern;
  reps: number;
  repDetails: RepResult[];
  /** short, plain lines for the summary */
  summary: string[];
  /** how well the camera could see the joints that matter, 0–1 */
  visibility: number;
  goodReps: number;
}

/** Which side faces the camera better, over the whole clip. */
function pickSide(frames: Frame[], keys: (keyof typeof L)[]) {
  const score = (side: typeof L) => frames.reduce((s, f) => s + keys.reduce((k, key) => k + vis(f.lm[side[key]]), 0), 0);
  return score(L) >= score(R) ? L : R;
}

/** The movement signal each lift is counted on, and which way is the "bottom" of a rep. */
function signalFor(p: FormPattern, f: Frame, S: typeof L): number {
  const lm = f.lm;
  switch (p) {
    case 'squat':
      return angle(lm[S.hip]!, lm[S.knee]!, lm[S.ankle]!); // knee angle: small at the bottom
    case 'hinge':
      return angle(lm[S.shoulder]!, lm[S.hip]!, lm[S.knee]!); // hip angle: small at the bottom
    default:
      return angle(lm[S.shoulder]!, lm[S.elbow]!, lm[S.wrist]!); // elbow angle
  }
}

/** Curls and pulls are "bottom" when the elbow is bent; presses when it's bent too. All use small = flexed. */
export function analyzeForm(frames: Frame[], exerciseName: string): FormResult {
  const pattern = formPattern(exerciseName);
  const keys: (keyof typeof L)[] = pattern === 'squat' || pattern === 'hinge' ? ['shoulder', 'hip', 'knee', 'ankle'] : ['shoulder', 'elbow', 'wrist', 'hip'];
  const usable = frames.filter((f) => f.lm.length >= 29);
  const empty: FormResult = { pattern, reps: 0, repDetails: [], summary: [], visibility: 0, goodReps: 0 };
  if (usable.length < 10) return { ...empty, summary: ['Not enough of the video showed your body. Film side-on with your whole body in the frame.'] };
  const S = pickSide(usable, keys);
  const visibility = usable.reduce((s, f) => s + keys.reduce((k, key) => k + vis(f.lm[S[key]]), 0) / keys.length, 0) / usable.length;

  // Smooth the signal so jitter doesn't count as reps.
  const raw = usable.map((f) => signalFor(pattern, f, S));
  const sig: number[] = [];
  raw.forEach((v, i) => sig.push(i ? sig[i - 1]! * 0.6 + v * 0.4 : v));
  const lo = pct(sig, 5);
  const hi = pct(sig, 95);
  if (hi - lo < 25) return { ...empty, visibility, summary: ['No clear reps found. Make sure the whole movement is in view.'] };
  const downAt = lo + (hi - lo) * 0.35; // below this: bottom of the rep
  const upAt = lo + (hi - lo) * 0.7; // above this: back at the top

  // Reps: top → bottom → top, with the frames of each rep.
  const reps: { start: number; bottom: number; end: number }[] = [];
  let state: 'top' | 'down' = sig[0]! > upAt ? 'top' : 'down';
  let start = 0;
  let bottom = 0;
  for (let i = 1; i < sig.length; i++) {
    if (state === 'top' && sig[i]! < downAt) {
      state = 'down';
      bottom = i;
    } else if (state === 'down') {
      if (sig[i]! < sig[bottom]!) bottom = i;
      if (sig[i]! > upAt) {
        if (reps.length || sig[0]! > upAt || start > 0) reps.push({ start, bottom, end: i });
        state = 'top';
        start = i;
      }
    } else if (state === 'top' && sig[i]! > sig[start]!) start = i;
  }

  const legLen = (f: Frame) => dist(f.lm[S.hip]!, f.lm[S.knee]!) + dist(f.lm[S.knee]!, f.lm[S.ankle]!);
  const armLen = (f: Frame) => dist(f.lm[S.shoulder]!, f.lm[S.elbow]!);
  const details: RepResult[] = reps.map((r, k) => {
    const fb = usable[r.bottom]!;
    const top = usable[r.end]!;
    const issues: string[] = [];
    const between = usable.slice(r.start, r.end + 1);
    if (pattern === 'squat') {
      // Depth: hip crease at or below the top of the knee (image y grows downward).
      if (fb.lm[S.hip]!.y < fb.lm[S.knee]!.y - legLen(fb) * 0.04) issues.push('Not quite to depth: hips stayed above your knees');
      const torso = Math.abs((Math.atan2(fb.lm[S.shoulder]!.x - fb.lm[S.hip]!.x, fb.lm[S.hip]!.y - fb.lm[S.shoulder]!.y) * 180) / Math.PI);
      if (torso > 55) issues.push('Chest dropped forward at the bottom');
    }
    if (pattern === 'hinge') {
      if (signalFor('hinge', top, S) < 160) issues.push('Didn’t finish standing tall: squeeze your glutes at the top');
      if (/rdl|romanian|stiff/.test(exerciseName.toLowerCase()) && angle(fb.lm[S.hip]!, fb.lm[S.knee]!, fb.lm[S.ankle]!) < 130) issues.push('Knees bent a lot: keep them soft and push your hips back');
    }
    if (pattern === 'bench' || pattern === 'press') {
      if (sig[r.bottom]! > 100) issues.push(pattern === 'bench' ? 'Short range: bring it down to your chest' : 'Short range: lower it to your shoulders');
      if (signalFor(pattern, top, S) < 155) issues.push('Didn’t lock out at the top');
    }
    if (pattern === 'curl') {
      if (sig[r.bottom]! > 70) issues.push('Didn’t curl all the way up');
      if (Math.max(...between.map((f) => signalFor(pattern, f, S))) < 145) issues.push('Didn’t straighten your arm at the bottom');
      const drift = Math.max(...between.map((f) => Math.abs(f.lm[S.elbow]!.x - f.lm[S.shoulder]!.x)));
      if (drift > armLen(fb) * 0.45) issues.push('Elbow swung forward: keep it by your side');
    }
    if (pattern === 'pull') {
      if (sig[r.bottom]! > 95) issues.push('Pull a bit further: elbows to your sides');
      if (Math.max(...between.map((f) => signalFor(pattern, f, S))) < 145) issues.push('Let your arms straighten between reps');
    }
    return { index: k + 1, seconds: Math.round(((usable[r.end]!.t - usable[r.start]!.t) / 1000) * 10) / 10, issues };
  });

  const good = details.filter((d) => !d.issues.length).length;
  const summary: string[] = [];
  if (details.length) summary.push(`${details.length} reps${formChecked(pattern) ? `, ${good} with no form flags` : ''}.`);
  // The same issue on several reps is one line, with which reps.
  const byIssue = new Map<string, number[]>();
  for (const d of details) for (const i of d.issues) byIssue.set(i, [...(byIssue.get(i) ?? []), d.index]);
  for (const [issue, which] of byIssue) summary.push(`${issue} (rep${which.length > 1 ? 's' : ''} ${which.join(', ')}).`);
  // A last rep much slower than the rest: you were close to your limit.
  if (details.length >= 3) {
    const times = details.map((d) => d.seconds).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    if (details.at(-1)!.seconds > median * 1.6) summary.push('Your last rep slowed right down: that set was close to your limit.');
  }
  if (visibility < 0.6) summary.push('The camera couldn’t see you clearly: film side-on, whole body in frame, good light.');
  if (!formChecked(pattern)) summary.push('Reps counted only; there are no form checks for this exercise yet.');
  return { pattern, reps: details.length, repDetails: details, summary, visibility: Math.round(visibility * 100) / 100, goodReps: good };
}
