// Variations of an exercise (the same movement done another way) and ways to
// keep progressing when adding weight isn't the answer.
import type { Exercise } from './training.ts';

export type VariationLevel = 'harder' | 'angle' | 'easier';
export const VARIATION_LABEL: Record<VariationLevel, string> = { harder: 'Harder', angle: 'Different angle', easier: 'Easier' };

export interface Variation {
  exercise: Exercise;
  level: VariationLevel;
  why: string;
}

/** Words that change how a movement is done, not what it is, and what each one does to it. */
const MODIFIERS: { words: RegExp; key: string; effect: VariationLevel; why: string }[] = [
  { words: /\b(single|one)[ -]?(arm|hand)(ed)?\b/, key: 'one-arm', effect: 'harder', why: 'one arm at a time: each side has to do its own work' },
  { words: /\b(single|one)[ -]?leg(ged)?\b|\bpistol\b|\bbulgarian\b/, key: 'one-leg', effect: 'harder', why: 'one leg at a time: more balance and each side works alone' },
  { words: /\bdeficit\b/, key: 'deficit', effect: 'harder', why: 'a longer range of motion' },
  { words: /\bpaused?\b/, key: 'pause', effect: 'harder', why: 'a pause takes away the bounce' },
  { words: /\btempo\b/, key: 'tempo', effect: 'harder', why: 'slower reps, more time under tension' },
  { words: /\bweighted\b/, key: 'weighted', effect: 'harder', why: 'added weight' },
  { words: /\barcher\b|\bclap(ping)?\b|\bplyo(metric)?\b|\bexplosive\b/, key: 'power', effect: 'harder', why: 'more demanding version' },
  { words: /\b(band|machine)[ -]?assisted\b|\bassisted\b/, key: 'assisted', effect: 'easier', why: 'help on the hard part' },
  { words: /\bknee(ling)?\b|\bon knees\b/, key: 'knees', effect: 'easier', why: 'less of your body weight to move' },
  { words: /\bwall\b/, key: 'wall', effect: 'easier', why: 'less of your body weight to move' },
  { words: /\bmachine\b|\bsmith\b|\blever\b|\bsled\b/, key: 'machine', effect: 'easier', why: 'the machine keeps the path steady' },
  { words: /\bpartial\b|\bhalf\b|\bquarter\b|\bbox\b/, key: 'partial', effect: 'easier', why: 'a shorter range to start with' },
  { words: /\bincline\b/, key: 'incline', effect: 'angle', why: 'works the upper part more' },
  { words: /\bdecline\b/, key: 'decline', effect: 'angle', why: 'works the lower part more' },
  { words: /\b(close|narrow)[ -]?grip\b/, key: 'close', effect: 'angle', why: 'more triceps and inner chest' },
  { words: /\bwide[ -]?grip\b|\bwide\b/, key: 'wide', effect: 'angle', why: 'a wider grip or stance' },
  { words: /\breverse[ -]?grip\b|\bunderhand\b|\bsupinated\b/, key: 'reverse', effect: 'angle', why: 'a different grip' },
  { words: /\bneutral[ -]?grip\b|\bhammer\b/, key: 'neutral', effect: 'angle', why: 'palms facing in, often easier on shoulders and wrists' },
  { words: /\bseated\b/, key: 'seated', effect: 'angle', why: 'seated, so less body English' },
  { words: /\bstanding\b/, key: 'standing', effect: 'angle', why: 'standing, so your core works too' },
  { words: /\bsumo\b/, key: 'sumo', effect: 'angle', why: 'a wide stance, more hips and inner thighs' },
  { words: /\bfront\b/, key: 'front', effect: 'angle', why: 'the weight in front, more upright' },
  { words: /\bromanian\b|\bstiff[ -]?leg(ged)?\b/, key: 'rdl', effect: 'angle', why: 'more hamstrings' },
  { words: /\bdumbbells?\b/, key: 'dumbbell', effect: 'angle', why: 'dumbbells: each side works on its own and more range' },
  { words: /\bkettlebells?\b/, key: 'kettlebell', effect: 'angle', why: 'with a kettlebell' },
  { words: /\bgoblet\b/, key: 'goblet', effect: 'easier', why: 'the weight held in front makes good form easier' },
  { words: /\bcables?\b/, key: 'cable', effect: 'angle', why: 'a cable keeps tension the whole way' },
  { words: /\bbarbell\b/, key: 'barbell', effect: 'angle', why: 'a barbell lets you load it heavier' },
  { words: /\bbands?\b|\bbanded\b/, key: 'band', effect: 'angle', why: 'a band gets harder toward the top' },
  { words: /\bdb\b/, key: 'dumbbell', effect: 'angle', why: 'dumbbells: each side works on its own and more range' },
  { words: /\bbb\b/, key: 'barbell', effect: 'angle', why: 'a barbell lets you load it heavier' },
];

// For push-ups, raising your hands makes it easier and raising your feet harder.
const PUSHUP_FLIP: Record<string, VariationLevel> = { incline: 'easier', decline: 'harder' };
const PUSHUP_WHY: Record<string, string> = { incline: 'hands up on a bench: less body weight', decline: 'feet up: more body weight on your arms' };

/** The movement itself, without the words that only say how it's done: "Incline dumbbell bench press" → "bench press". */
export function movementOf(name: string): { base: string; mods: Set<string> } {
  let s = ` ${name.toLowerCase().replace(/[()–—,/]/g, ' ').replace(/-/g, ' ')} `
    .replace(/\bpush ?ups?\b|\bpress ?ups?\b/g, ' push up ')
    .replace(/\bpull ?ups?\b/g, ' pull up ')
    .replace(/\bchin ?ups?\b/g, ' chin up ')
    .replace(/\bsit ?ups?\b/g, ' sit up ')
    .replace(/\bstep ?ups?\b/g, ' step up ');
  const mods = new Set<string>();
  // Longer phrases first, so "single arm" goes before "arm" could ever matter.
  for (const m of MODIFIERS) {
    const re = new RegExp(m.words.source.replace(/-/g, ' '), 'g');
    if (re.test(s)) {
      mods.add(m.key);
      s = s.replace(re, ' ');
    }
  }
  const FILLER = new Set(['with', 'on', 'the', 'a', 'an', 'to', 'and', 'grip', 'alternating', 'alternate', 'exercise', 'variation', 'medium', 'regular', 'normal', 'flat']);
  const singular = (w: string) => (/(ss|ch|sh|x)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w);
  const base = s
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(singular)
    .join(' ');
  return { base, mods };
}

function levelFor(target: Set<string>, other: Set<string>, pushup: boolean): { level: VariationLevel; why: string } {
  const added = [...other].filter((k) => !target.has(k));
  const removed = [...target].filter((k) => !other.has(k));
  const effect = (k: string) => (pushup && PUSHUP_FLIP[k]) || MODIFIERS.find((m) => m.key === k)!.effect;
  const why = (k: string) => (pushup && PUSHUP_WHY[k]) || MODIFIERS.find((m) => m.key === k)!.why;
  const flip = (l: VariationLevel): VariationLevel => (l === 'harder' ? 'easier' : l === 'easier' ? 'harder' : 'angle');
  // Adding something that makes it easier wins over everything: assisted is always easier.
  const steps = [...added.map((k) => ({ level: effect(k), why: why(k) })), ...removed.map((k) => ({ level: flip(effect(k)), why: `without the ${k === 'machine' ? 'machine' : k.replace('-', ' ')}` }))];
  const pick = steps.find((s) => s.level === 'easier') ?? steps.find((s) => s.level === 'harder') ?? steps[0];
  return pick ?? { level: 'angle', why: 'another way to do it' };
}

/**
 * The same movement done another way, from the exercises you can pick:
 * bench press → incline, decline, dumbbell and single-arm versions. Each is
 * labelled Harder, Different angle or Easier. Your own and the everyday
 * exercises come before the big library.
 */
export function variationsOf(target: Exercise, library: (Exercise & { uses?: number })[], limit = 6): Variation[] {
  const t = movementOf(target.name);
  if (!t.base) return [];
  const pushup = t.base === 'push up';
  const words = t.base.split(' ');
  const out: (Variation & { score: number })[] = [];
  for (const ex of library) {
    if (ex.id === target.id) continue;
    if ((ex.kind === 'time') !== (target.kind === 'time')) continue;
    const o = movementOf(ex.name);
    // The same movement: the same base, or the base inside the other name ("bench press" in "bench press, wide").
    const same = o.base === t.base || (words.length > 1 && (o.base.includes(t.base) || (o.base.split(' ').length > 1 && t.base.includes(o.base))));
    if (!same) continue;
    if (o.base !== t.base && o.base.split(' ').length > words.length + 1) continue; // "bench press to neck" style oddities
    const { level, why } = levelFor(t.mods, o.mods, pushup);
    let score = 0;
    if ((ex.uses ?? 0) > 0) score += 4;
    if (!ex.library) score += 3;
    if (ex.howTo) score += 1;
    if (o.base === t.base) score += 2;
    out.push({ exercise: ex, level, why, score });
  }
  const order: Record<VariationLevel, number> = { harder: 0, angle: 1, easier: 2 };
  // Best few, but keep every level represented if there is one.
  const ranked = out.sort((a, b) => b.score - a.score || a.exercise.name.length - b.exercise.name.length);
  const picked: typeof ranked = [];
  for (const level of ['harder', 'angle', 'easier'] as const) {
    const first = ranked.find((v) => v.level === level);
    if (first) picked.push(first);
  }
  for (const v of ranked) if (picked.length < limit && !picked.includes(v)) picked.push(v);
  // No two with the same name (the library has a few near-duplicates).
  const seen = new Set<string>();
  return picked
    .filter((v) => !seen.has(v.exercise.name.toLowerCase()) && seen.add(v.exercise.name.toLowerCase()))
    .slice(0, limit)
    .sort((a, b) => order[a.level] - order[b.level] || b.score - a.score)
    .map(({ exercise, level, why }) => ({ exercise, level, why }));
}

export interface ProgressIdea {
  key: string;
  title: string;
  detail: string;
}

/**
 * Ways to make an exercise harder without adding weight: for when the next
 * jump is too big (5 lb on a 15 lb lateral raise is a third more), you've
 * stalled, or there's no heavier weight to add.
 */
export function progressIdeas(ex: Pick<Exercise, 'name' | 'kind' | 'equipment'>): ProgressIdea[] {
  const { mods } = movementOf(ex.name);
  const oneSide = mods.has('one-arm') || mods.has('one-leg');
  const canSplit = !oneSide && ['dumbbell', 'cable', 'kettlebell', 'machine', 'band', 'bodyweight'].includes(ex.equipment);
  if (ex.kind === 'time') {
    return [
      { key: 'longer', title: 'Hold longer', detail: 'Add 5–10 seconds to each hold. Once you can do 60 s, make it harder instead.' },
      { key: 'set', title: 'Add a set', detail: 'One more round at the same time.' },
      { key: 'rest', title: 'Shorter rest', detail: 'Cut the rest between holds by 15 seconds.' },
      ...(canSplit ? [{ key: 'side', title: 'One side at a time', detail: 'Lift an arm or a leg (or both) for a harder hold.' }] : []),
      { key: 'harder', title: 'A harder variation', detail: 'When long holds get easy, move to a harder version below.' },
    ];
  }
  return [
    { key: 'reps', title: 'More reps', detail: 'Same weight, 1–2 more reps each set. When you hit the top of your range on every set, then add weight.' },
    { key: 'set', title: 'Add a set', detail: 'One more working set at the same weight.' },
    { key: 'slow', title: 'Slow the lowering', detail: 'Take 3–4 seconds on the way down. Much harder at the same weight.' },
    { key: 'pause', title: 'Pause at the bottom', detail: 'Hold 1–2 seconds at the hardest point, no bounce.' },
    { key: 'half', title: '1½ reps', detail: 'Go all the way down, halfway up, back down, then all the way up. That’s one.' },
    { key: 'rest', title: 'Shorter rest', detail: 'Same sets and reps with 30 seconds less rest.' },
    ...(canSplit ? [{ key: 'side', title: 'One side at a time', detail: 'Each side alone: the same weight feels much heavier.' }] : []),
    ...(ex.kind === 'bodyweight' && /pull up|chin up|dip|push up/.test(movementOf(ex.name).base)
      ? [{ key: 'load', title: 'Add a little weight', detail: 'A weight vest, a backpack or a dip belt, once 12+ clean reps are easy.' }]
      : []),
  ];
}

/** How much the smallest jump would add, as a share of the weight. Over ~7.5% is a big step. */
export function jumpShare(weightKg: number, jumpKg: number) {
  return weightKg > 0 ? jumpKg / weightKg : 1;
}
export const BIG_JUMP = 0.075;
