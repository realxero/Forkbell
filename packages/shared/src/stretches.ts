// Warm-ups, stretches and foam rolling, with pictures. Not logged like sets:
// they're a guided routine you follow with a timer. Pure functions here; the
// list itself comes from the server (Free Exercise DB, public domain).
import { MUSCLES, type Muscle } from './training.ts';

/** dynamic: moves to warm up before training. static: holds for after. roll: foam rolling. */
export type StretchKind = 'dynamic' | 'static' | 'roll';

export interface Stretch {
  key: string;
  name: string;
  kind: StretchKind;
  /** the main one first */
  muscles: Muscle[];
  /** 'none', 'foam roller', 'exercise ball' or 'something to hold' */
  equipment: string;
  /** done one side, then the other */
  sides: boolean;
  level: string | null;
  steps: string[];
  howToRef: string;
  pictures: number;
}

export const STRETCH_KINDS: { kind: StretchKind; label: string; when: string }[] = [
  { kind: 'dynamic', label: 'Warm-up', when: 'Moving stretches to get warm before you lift.' },
  { kind: 'static', label: 'Stretch', when: 'Holds for after training, when you’re warm.' },
  { kind: 'roll', label: 'Foam roll', when: 'Slow rolling over tight spots, before or after.' },
];

/** How long each one runs, per side. */
export function stretchDose(s: Pick<Stretch, 'kind' | 'sides'>): { seconds: number; label: string } {
  const each = s.sides ? ' each side' : '';
  if (s.kind === 'dynamic') return { seconds: 30, label: `30 s${each}, smooth and controlled` };
  if (s.kind === 'roll') return { seconds: 45, label: `45 s${each}, slowly` };
  return { seconds: 30, label: `Hold 30 s${each}, easy breathing` };
}

/** Seconds for the whole thing, both sides. */
export const stretchSeconds = (s: Pick<Stretch, 'kind' | 'sides'>) => stretchDose(s).seconds * (s.sides ? 2 : 1);

const LEVEL = { beginner: 0, intermediate: 1, expert: 2 } as Record<string, number>;
// A good start to any warm-up: whole-body moves that raise your temperature.
const OPENERS = ['str:Arm_Circles', 'str:Worlds_Greatest_Stretch', 'str:Inchworm'];

/**
 * A short routine for the muscles you're training (or trained): one for each
 * muscle in turn, then the ones that cover the most of them. Without a foam
 * roller or a ball, only moves that need nothing.
 */
export function buildStretchRoutine(all: Stretch[], opts: { kind: StretchKind; muscles: Muscle[]; count?: number; anyEquipment?: boolean }): Stretch[] {
  const count = opts.count ?? (opts.kind === 'roll' ? 4 : 6);
  const pool = all.filter((s) => s.kind === opts.kind && (opts.anyEquipment || opts.kind === 'roll' || s.equipment === 'none'));
  const wanted = [...new Set(opts.muscles.includes('full body') || !opts.muscles.length ? MUSCLES.filter((m) => m !== 'full body') : opts.muscles)];
  const picked: Stretch[] = [];
  const take = (s: Stretch | undefined) => s && !picked.includes(s) && picked.length < count && picked.push(s);
  const score = (s: Stretch, m: Muscle) =>
    (s.muscles[0] === m ? 10 : s.muscles.includes(m) ? 5 : 0) + s.muscles.filter((x) => wanted.includes(x)).length - (LEVEL[s.level ?? ''] ?? 1);

  if (opts.kind === 'dynamic') take(pool.find((s) => s.key === OPENERS.find((k) => pool.some((p) => p.key === k && p.muscles.some((m) => wanted.includes(m))))));
  for (let round = 0; round < 2 && picked.length < count; round++)
    for (const m of wanted) {
      if (picked.length >= count) break;
      const covered = picked.filter((p) => p.muscles.includes(m)).length;
      if (covered > round) continue;
      take(pool.filter((s) => !picked.includes(s) && s.muscles.includes(m)).sort((a, b) => score(b, m) - score(a, m) || a.name.localeCompare(b.name))[0]);
    }
  return picked;
}
