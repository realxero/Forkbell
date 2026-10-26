// Importing workouts from Strong, Hevy and FitNotes. Each app exports a CSV
// file; this reads any of the three (found by its column names) into plain
// workouts, on the phone, so times are read in the phone's own time zone.
// The server then matches exercise names to yours and the built-in library,
// adds the ones it can't match as your own, and skips workouts it already has.
import { z } from 'zod';
import type { ExerciseKind, Muscle, WeightUnit } from './training.ts';

export type ImportFormat = 'strong' | 'hevy' | 'fitnotes';
export const IMPORT_APPS: Record<ImportFormat, string> = { strong: 'Strong', hevy: 'Hevy', fitnotes: 'FitNotes' };

const LB = 0.45359237;
const MILE = 1609.344;

export const importedSetSchema = z.object({
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  seconds: z.number().int().min(0).max(86400).nullable(),
  distanceM: z.number().min(0).max(1_000_000).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  warmup: z.boolean(),
  drop: z.boolean(),
});
export const importedWorkoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).nullable(),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        /** FitNotes' category, to guess the muscle of an exercise Forkbell doesn't have */
        category: z.string().max(60).nullable(),
        superset: z.number().int().min(1).max(20).nullable(),
        sets: z.array(importedSetSchema).min(1).max(100),
      }),
    )
    .min(1)
    .max(60),
});
export const workoutImportSchema = z.object({
  format: z.enum(['strong', 'hevy', 'fitnotes']),
  workouts: z.array(importedWorkoutSchema).min(1).max(5000),
  /** true: only say what would happen */
  dryRun: z.boolean().default(true),
});
export type ImportedSet = z.infer<typeof importedSetSchema>;
export type ImportedWorkout = z.infer<typeof importedWorkoutSchema>;
export type WorkoutImportInput = z.infer<typeof workoutImportSchema>;

export interface WorkoutImportResult {
  workouts: number;
  sets: number;
  /** already in Forkbell (same start time), so left alone */
  skipped: number;
  from: string | null;
  to: string | null;
  /** exercise names from the file matched to one Forkbell has: file name → Forkbell name */
  matched: { from: string; to: string }[];
  /** names Forkbell will add as your own exercises */
  added: string[];
  dryRun: boolean;
}

// CSV ------------------------------------------------------------------------

/** Rows of a CSV file: quoted fields, "" inside quotes, commas or semicolons. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const nl = t.search(/\r?\n/);
  const firstLine = nl < 0 ? t : t.slice(0, nl);
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** Which app made the file, from its column names. */
export function detectFormat(headers: string[]): ImportFormat | null {
  const h = new Set(headers.map(norm));
  if (h.has('exercise_title') && h.has('start_time')) return 'hevy';
  if (h.has('exercise name') && h.has('set order')) return 'strong';
  if (h.has('exercise') && h.has('date') && (h.has('category') || h.has('reps'))) return 'fitnotes';
  return null;
}

// Numbers, times and dates ------------------------------------------------------

const num = (v: string | undefined) => {
  if (v === undefined) return null;
  const t = v.trim().replace(/\s/g, '');
  if (!t) return null;
  // "62,5" in a semicolon file is 62.5
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** "1h 5m", "45m", "1:05:00", "3900" (seconds) → minutes. */
export function durationMinutes(v: string | undefined): number | null {
  const t = (v ?? '').trim().toLowerCase();
  if (!t) return null;
  const hm = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?$/.exec(t);
  if (hm && (hm[1] || hm[2] || hm[3])) return Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0) + Number(hm[3] ?? 0) / 60;
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (clock) return clock[3] !== undefined ? Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3]) / 60 : Number(clock[1]) + Number(clock[2]) / 60;
  const n = Number(t);
  return Number.isFinite(n) ? n / 60 : null;
}

/** "0:30:00" or "30:00" or "1800" → seconds. */
const clockSeconds = (v: string | undefined) => {
  const m = durationMinutes(v);
  return m === null ? null : Math.round(m * 60);
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date and time as the app wrote it, read as the phone's local time:
 * "2023-03-15 18:02:31", "2023-03-15T18:02:31", "15 Mar 2023, 18:02",
 * "Mar 15, 2023 6:02 PM", "2023-03-15". Null if it can't be read.
 */
export function readLocalDateTime(v: string | undefined): Date | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  let y: number, mo: number, d: number;
  let h = 0;
  let mi = 0;
  let s = 0;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  } else if ((m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? ?(?:(\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp][Mm])?)?/.exec(t))) {
    [d, mo, y] = [Number(m[1]), MONTHS.indexOf(m[2]!.toLowerCase()) + 1, Number(m[3])];
    if (m[4]) [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    if (m[7]) h = (h % 12) + (m[7].toLowerCase() === 'pm' ? 12 : 0);
  } else if ((m = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4}),? ?(?:(\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp][Mm])?)?/.exec(t))) {
    [mo, d, y] = [MONTHS.indexOf(m[1]!.toLowerCase()) + 1, Number(m[2]), Number(m[3])];
    if (m[4]) [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    if (m[7]) h = (h % 12) + (m[7].toLowerCase() === 'pm' ? 12 : 0);
  } else return null;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 && h < 24 && mi < 60)) return null;
  return new Date(y, mo - 1, d, h, mi, s);
}

const ymd = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

// The three apps --------------------------------------------------------------

type Row = Record<string, string>;
type Draft = { date: string; startedAt: Date; finishedAt: Date | null; name: string; notes: string[]; exercises: Map<string, ImportedWorkout['exercises'][number]> };

const kgFrom = (v: string | undefined, unit: WeightUnit) => {
  const n = num(v);
  return n === null ? null : Math.round((unit === 'lb' ? n * LB : n) * 100) / 100;
};
const metresFrom = (v: string | undefined, unit: 'mi' | 'km' | 'm') => {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return Math.round(unit === 'mi' ? n * MILE : unit === 'km' ? n * 1000 : n);
};

function addSet(draft: Draft, name: string, set: ImportedSet, extra: { category?: string | null; superset?: number | null } = {}) {
  const ex = draft.exercises.get(name) ?? { name: name.slice(0, 120), category: extra.category ?? null, superset: extra.superset ?? null, sets: [] };
  if (ex.sets.length < 100) ex.sets.push(set);
  draft.exercises.set(name, ex);
}

/**
 * Read an export from Strong, Hevy or FitNotes. `unit` is for files that
 * don't say (Strong writes weights in whatever unit the app was set to).
 */
export function parseWorkoutExport(text: string, unit: WeightUnit): { format: ImportFormat | null; workouts: ImportedWorkout[]; problems: string[] } {
  const rows = parseCsv(text);
  const headers = (rows[0] ?? []).map(norm);
  const format = detectFormat(headers);
  if (!format) return { format: null, workouts: [], problems: ['This doesn’t look like a workout export from Strong, Hevy or FitNotes (the column names don’t match). Export a CSV file from the app and pick that.'] };
  const problems: string[] = [];
  const drafts = new Map<string, Draft>();
  let unreadable = 0;
  const get = (r: string[]): Row => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']));

  for (const raw of rows.slice(1)) {
    const r = get(raw);
    if (format === 'strong') {
      const order = (r['set order'] ?? '').trim();
      // Rest timers and notes come as their own rows; only sets count.
      if (!r['exercise name']?.trim() || /rest|note/i.test(order)) continue;
      const start = readLocalDateTime(r['date']);
      if (!start) {
        unreadable++;
        continue;
      }
      const key = `${start.getTime()}|${r['workout name']}`;
      const mins = durationMinutes(r['duration']);
      const draft: Draft = drafts.get(key) ?? { date: ymd(start), startedAt: start, finishedAt: mins ? new Date(start.getTime() + mins * 60_000) : null, name: r['workout name']?.trim() || 'Workout', notes: [], exercises: new Map() };
      if (r['workout notes']?.trim() && !draft.notes.includes(r['workout notes'].trim())) draft.notes.push(r['workout notes'].trim());
      drafts.set(key, draft);
      const sec = num(r['seconds']);
      addSet(draft, r['exercise name'].trim(), {
        weightKg: kgFrom(r['weight'], unit),
        reps: num(r['reps']) === null ? null : Math.round(num(r['reps'])!),
        seconds: sec && sec > 0 ? Math.round(sec) : null,
        distanceM: metresFrom(r['distance'], unit === 'lb' ? 'mi' : 'km'),
        rpe: rpeOf(r['rpe']),
        warmup: /^w/i.test(order),
        drop: /^d/i.test(order),
      });
    } else if (format === 'hevy') {
      const start = readLocalDateTime(r['start_time']);
      if (!r['exercise_title']?.trim() || !start) {
        if (r['exercise_title']?.trim()) unreadable++;
        continue;
      }
      const key = `${start.getTime()}|${r['title']}`;
      const end = readLocalDateTime(r['end_time']);
      const draft: Draft = drafts.get(key) ?? { date: ymd(start), startedAt: start, finishedAt: end && end > start ? end : null, name: r['title']?.trim() || 'Workout', notes: [], exercises: new Map() };
      if (r['description']?.trim() && !draft.notes.includes(r['description'].trim())) draft.notes.push(r['description'].trim());
      const exNote = r['exercise_notes']?.trim();
      if (exNote && !draft.notes.includes(`${r['exercise_title'].trim()}: ${exNote}`)) draft.notes.push(`${r['exercise_title'].trim()}: ${exNote}`);
      drafts.set(key, draft);
      const type = (r['set_type'] ?? '').toLowerCase();
      const ss = num(r['superset_id']);
      addSet(
        draft,
        r['exercise_title'].trim(),
        {
          weightKg: 'weight_kg' in r ? kgFrom(r['weight_kg'], 'kg') : kgFrom(r['weight_lbs'], 'lb'),
          reps: num(r['reps']) === null ? null : Math.round(num(r['reps'])!),
          seconds: num(r['duration_seconds']) ? Math.round(num(r['duration_seconds'])!) : null,
          distanceM: 'distance_km' in r ? metresFrom(r['distance_km'], 'km') : 'distance_miles' in r ? metresFrom(r['distance_miles'], 'mi') : metresFrom(r['distance_meters'], 'm'),
          rpe: rpeOf(r['rpe']),
          warmup: type.startsWith('warm'),
          drop: type.startsWith('drop'),
        },
        { superset: ss === null ? null : Math.min(20, Math.round(ss) + 1) },
      );
    } else {
      // FitNotes: one workout per day, with no times; it's put at noon for an hour.
      const day = readLocalDateTime(r['date']);
      if (!r['exercise']?.trim() || !day) {
        if (r['exercise']?.trim()) unreadable++;
        continue;
      }
      const date = ymd(day);
      const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
      const draft: Draft = drafts.get(date) ?? { date, startedAt: noon, finishedAt: new Date(noon.getTime() + 3_600_000), name: 'Workout', notes: [], exercises: new Map() };
      drafts.set(date, draft);
      const wUnit: WeightUnit | null = 'weight (kgs)' in r || 'weight (kg)' in r ? 'kg' : 'weight (lbs)' in r || 'weight (lb)' in r ? 'lb' : /lb/i.test(r['weight unit'] ?? '') ? 'lb' : /kg/i.test(r['weight unit'] ?? '') ? 'kg' : null;
      const weight = r['weight (kgs)'] ?? r['weight (kg)'] ?? r['weight (lbs)'] ?? r['weight (lb)'] ?? r['weight'];
      const dUnit = (r['distance unit'] ?? '').toLowerCase();
      const comment = r['comment']?.trim();
      if (comment) draft.notes.push(`${r['exercise'].trim()}: ${comment}`);
      addSet(
        draft,
        r['exercise'].trim(),
        {
          weightKg: kgFrom(weight, wUnit ?? unit),
          reps: num(r['reps']) === null ? null : Math.round(num(r['reps'])!),
          seconds: clockSeconds(r['time']) || null,
          distanceM: metresFrom(r['distance'], dUnit.startsWith('mi') ? 'mi' : dUnit === 'm' ? 'm' : 'km'),
          rpe: null,
          warmup: false,
          drop: false,
        },
        { category: r['category']?.trim() || null },
      );
    }
  }
  if (unreadable) problems.push(`${unreadable} row${unreadable === 1 ? '' : 's'} had a date that couldn’t be read and ${unreadable === 1 ? 'was' : 'were'} left out.`);

  const workouts: ImportedWorkout[] = [];
  for (const d of drafts.values()) {
    const exercises = [...d.exercises.values()].filter((e) => e.sets.length).slice(0, 60);
    if (!exercises.length) continue;
    const finishedAt = d.finishedAt && d.finishedAt > d.startedAt ? d.finishedAt : new Date(d.startedAt.getTime() + 3_600_000);
    workouts.push({ date: d.date, startedAt: d.startedAt.toISOString(), finishedAt: finishedAt.toISOString(), name: d.name.slice(0, 120), notes: d.notes.join('\n').slice(0, 2000) || null, exercises });
  }
  workouts.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  if (!workouts.length) problems.push('No workouts with sets were found in the file.');
  return { format, workouts, problems };
}

const rpeOf = (v: string | undefined) => {
  const n = num(v);
  return n !== null && n >= 1 && n <= 10 ? n : null;
};

// Matching exercise names -------------------------------------------------------

const SYNONYMS: [RegExp, string][] = [
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bez bar\b/g, 'ez curl bar'],
  [/\bpull ?ups?\b/g, 'pullup'],
  [/\bchin ?ups?\b/g, 'chinup'],
  [/\bpush ?ups?\b/g, 'pushup'],
  [/\bsit ?ups?\b/g, 'situp'],
  [/\bpull ?downs?\b/g, 'pulldown'],
  [/\bpush ?downs?\b/g, 'pushdown'],
];

/** "Bench Press (Barbell)" → "bench press barbell": lower case, no punctuation, common spellings. */
export function exerciseKey(name: string): string {
  let t = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.replace(/\b(\w+?)s\b/g, (w, stem: string) => (stem.length > 3 && !/ss$/.test(w) ? stem : w)).replace(/\s+/g, ' ').trim();
}

/**
 * Ways the same exercise may be named: "Bench Press (Barbell)" is also
 * "Barbell Bench Press" and "Bench Press". Tried in this order.
 */
export function nameCandidates(name: string): string[] {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name.trim());
  const out = m ? [`${m[2]} ${m[1]}`, `${m[1]} ${m[2]}`, name, m[1]!] : [name];
  return [...new Set(out.map(exerciseKey).filter(Boolean))];
}

/** For an exercise Forkbell doesn't have: its muscle, from FitNotes' category or the name. */
export function guessMuscle(name: string, category: string | null): Muscle {
  const c = (category ?? '').toLowerCase();
  const n = name.toLowerCase();
  const by: [RegExp, Muscle][] = [
    [/calf|calves/, 'calves'],
    [/curl(?!.*leg)|biceps?|hammer/, 'biceps'],
    [/leg curl|hamstring|romanian|rdl|good morning/, 'hamstrings'],
    [/triceps?|push ?down|skull|dip|close.?grip/, 'triceps'],
    [/hip thrust|glute|bridge|kickback/, 'glutes'],
    [/squat|lunge|leg press|leg extension|step.?up|split/, 'quads'],
    [/bench|chest|fly|pec|push.?up/, 'chest'],
    [/row|pull.?down|pull.?up|chin.?up|lat\b|deadlift|back extension|shrug/, 'back'],
    [/shoulder|overhead|military|lateral|raise|delt|arnold|face pull/, 'shoulders'],
    [/crunch|plank|ab\b|abs|sit.?up|core|oblique|leg raise|russian/, 'core'],
  ];
  if (/leg/.test(c)) return /curl|hamstring/.test(n) ? 'hamstrings' : /calf/.test(n) ? 'calves' : 'quads';
  for (const m of ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'calves', 'glutes', 'core'] as const) if (c.includes(m)) return m;
  if (/abs|core/.test(c)) return 'core';
  return by.find(([re]) => re.test(n))?.[1] ?? 'full body';
}

/** For an exercise Forkbell doesn't have: weight, bodyweight, time or cardio, from its sets. */
export function guessKind(name: string, category: string | null, sets: ImportedSet[]): ExerciseKind {
  if (/cardio/i.test(category ?? '') || sets.some((s) => s.distanceM)) return 'cardio';
  if (/run|walk|cycl|bike|row(ing)? machine|elliptical|swim|treadmill|stair/i.test(name) && !sets.some((s) => s.weightKg)) return 'cardio';
  if (sets.some((s) => s.weightKg)) return 'weight';
  if (sets.some((s) => s.reps)) return 'bodyweight';
  return sets.some((s) => s.seconds) ? 'time' : 'weight';
}

/** "(Barbell)" → "barbell", for a new exercise's equipment. */
export function guessEquipment(name: string, kind: ExerciseKind): string {
  const m = /\(([^)]+)\)\s*$/.exec(name);
  if (m) return m[1]!.trim().toLowerCase().slice(0, 40);
  if (kind === 'cardio') return 'cardio';
  if (kind === 'bodyweight' || kind === 'time') return 'bodyweight';
  return /dumbbell/i.test(name) ? 'dumbbell' : /cable/i.test(name) ? 'cable' : /machine/i.test(name) ? 'machine' : /barbell/i.test(name) ? 'barbell' : 'other';
}
