// Where you should feel an exercise, and the signs the weight is too heavy.
// General coaching cues by movement pattern (from the name) and by muscle,
// so every exercise in the library gets sensible ones. Not medical advice:
// sharp or joint pain always means stop.
export interface Cues {
  feel: string;
  tooHeavy: string[];
}

const PATTERNS: [RegExp, Cues][] = [
  [/\b(squat|leg press|hack squat|lunge|split squat|step[- ]?up)\b/i, {
    feel: 'Front of your thighs and your glutes, pushing through the whole foot.',
    tooHeavy: ['Knees cave inward', 'Heels lift or weight shifts to your toes', 'You can’t reach your usual depth', 'Your lower back rounds at the bottom'],
  }],
  [/\b(deadlift|rdl|romanian|good morning|hip hinge|stiff[- ]leg)\b/i, {
    feel: 'Back of your thighs and your glutes; your back stays firm, not sore.',
    tooHeavy: ['Your back rounds as the bar leaves the floor', 'The bar drifts away from your legs', 'Hips shoot up before the bar moves', 'You feel it in your lower back instead of your hamstrings'],
  }],
  [/\b(hip thrust|glute bridge|kickback)\b/i, {
    feel: 'Your glutes, squeezing hard at the top.',
    tooHeavy: ['You arch your lower back to finish', 'You can’t pause at the top', 'You feel it in your lower back or hamstrings more than glutes'],
  }],
  [/\b(bench|chest press|push[- ]?up|dip|fly|flye|pec deck)\b/i, {
    feel: 'Across your chest, with your shoulders pulled back and down.',
    tooHeavy: ['Your bum lifts off the bench', 'Elbows flare out wide', 'The weight stalls or one side lags', 'Front-of-shoulder pain'],
  }],
  [/\b(overhead press|shoulder press|military press|arnold|push press)\b/i, {
    feel: 'Your shoulders and triceps, with your ribs down and glutes tight.',
    tooHeavy: ['You lean back and arch to finish the rep', 'The weight drifts forward', 'Pinching in the shoulder joint'],
  }],
  [/\b(lateral raise|front raise|rear delt|reverse fly|face pull|upright row)\b/i, {
    feel: 'The side or back of your shoulders, not your neck or traps.',
    tooHeavy: ['You swing your body to lift it', 'Shrugging up toward your ears', 'You can’t control it on the way down'],
  }],
  [/\b(row|pulldown|pull[- ]?up|chin[- ]?up|lat|pullover)\b/i, {
    feel: 'Your back (lats and between the shoulder blades), pulling with your elbows.',
    tooHeavy: ['You jerk or swing your body to move it', 'Your shoulders roll forward', 'Most of the work is in your biceps', 'You can’t pause with the weight pulled in'],
  }],
  [/\b(curl)\b/i, {
    feel: 'The front of your upper arm, elbows staying still at your sides.',
    tooHeavy: ['You swing your hips or lean back', 'Elbows drift forward', 'Wrists bend back'],
  }],
  [/\b(triceps|pushdown|skull ?crusher|extension|kickback|close[- ]grip)\b/i, {
    feel: 'The back of your upper arm.',
    tooHeavy: ['Elbows flare out or move', 'Elbow pain (not just effort)', 'You use your shoulders or body to push'],
  }],
  [/\b(calf)\b/i, {
    feel: 'Your calves, with a full stretch at the bottom.',
    tooHeavy: ['You bounce instead of pausing', 'Only a tiny range of motion'],
  }],
  [/\b(plank|crunch|sit[- ]?up|ab|rollout|leg raise|pallof|carry|woodchop|dead bug)\b/i, {
    feel: 'Your abs and the muscles around your waist, braced like before a cough.',
    tooHeavy: ['Your lower back sags or aches', 'Your hips pike up or drop', 'You hold your breath and shake from the start'],
  }],
];

const BY_MUSCLE: Record<string, string> = {
  chest: 'Across your chest.',
  back: 'Your back, pulling with your elbows.',
  shoulders: 'Your shoulders.',
  biceps: 'The front of your upper arms.',
  triceps: 'The back of your upper arms.',
  quads: 'The front of your thighs.',
  hamstrings: 'The back of your thighs.',
  glutes: 'Your glutes.',
  calves: 'Your calves.',
  core: 'Your abs and waist.',
};

const GENERAL = ['Your form changes to finish a rep', 'You can’t control the way down', 'Reps get much slower than usual long before the last one'];

/** Cues for one exercise. Always ends with the rule that sharp pain means stop. */
export function exerciseCues(e: { name: string; muscle: string }): Cues & { stop: string } {
  const hit = PATTERNS.find(([re]) => re.test(e.name))?.[1];
  return {
    feel: hit?.feel ?? BY_MUSCLE[e.muscle] ?? 'The muscle the exercise is for, not your joints.',
    tooHeavy: hit?.tooHeavy ?? GENERAL,
    stop: 'Sharp, pinching or joint pain is different from effort: stop, and swap or lighten it.',
  };
}

/** How a set should feel by the end, by reps left in the tank (RPE). */
export const EFFORT_GUIDE = 'Working sets should end with about 1–3 good reps left (RPE 7–9): hard, but your form looks the same as the first rep.';
