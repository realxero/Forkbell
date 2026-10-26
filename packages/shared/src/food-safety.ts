// Allergies, diets and dislikes. This works from food names only (Forkbell
// stores no ingredient lists), so it errs toward blocking and can't see
// sauces, hidden ingredients or cross-contact. Screens that use it say so,
// and nothing here ever claims a food is safe.
import { z } from 'zod';
import { trainingSetupSchema } from './training-coach.ts';

export const ALLERGENS = ['milk', 'egg', 'peanut', 'tree nuts', 'soy', 'wheat/gluten', 'fish', 'shellfish', 'sesame'] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const DIETS = ['none', 'pescatarian', 'vegetarian', 'vegan'] as const;
export type Diet = (typeof DIETS)[number];

export const preferencesSchema = z.object({
  allergies: z.array(z.enum(ALLERGENS)).default([]),
  /** other things to keep out completely */
  avoid: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  diet: z.enum(DIETS).default('none'),
  dislikes: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  /** foods never offered as a suggestion (still loggable) */
  neverSuggest: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  suggestions: z
    .object({
      enabled: z.boolean().default(true),
      strictness: z.enum(['gentle', 'balanced', 'thorough']).default('balanced'),
      drinks: z.boolean().default(true),
      protein: z.boolean().default(true),
      fiber: z.boolean().default(true),
      sodium: z.boolean().default(true),
      satFat: z.boolean().default(true),
      sugar: z.boolean().default(true),
      fat: z.boolean().default(true),
      /** your own daily limits; empty uses the standard daily value (sodium, saturated fat) or isn't watched (sugar) */
      limits: z
        .object({ sodiumMg: z.number().min(500).max(10000).nullable().default(null), satFatG: z.number().min(5).max(100).nullable().default(null), sugarG: z.number().min(5).max(300).nullable().default(null) })
        .default({ sodiumMg: null, satFatG: null, sugarG: null }),
    })
    .default({ enabled: true, strictness: 'balanced', drinks: true, protein: true, fiber: true, sodium: true, satFat: true, sugar: true, fat: true, limits: { sodiumMg: null, satFatG: null, sugarG: null } }),
  /** plates and bowls weighed empty once, so a full one can be weighed without taring */
  containers: z
    .array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(40), grams: z.number().min(1).max(5000) }))
    .max(30)
    .default([]),
  trainingTips: z.boolean().default(true),
  /** the rest coach's voice in workouts: off, timings only, or timings plus a few words after good sets */
  workoutVoice: z.enum(['off', 'cues', 'coach']).default('off'),
  /** the Patterns card on Progress */
  patterns: z.boolean().default(true),
  /** the Water card on Today: shown or hidden, and the daily goal in ml */
  water: z
    .object({ show: z.boolean().default(true), goalMl: z.number().int().min(250).max(10000).default(2000) })
    .default({ show: true, goalMl: 2000 }),
  /** the fasting timer on Today: off until you turn it on, and the goal it starts with */
  fasting: z
    .object({ show: z.boolean().default(false), hours: z.number().int().min(10).max(72).default(16) })
    .default({ show: false, hours: 16 }),
  /** finished (or skipped) the first-launch setup */
  onboarded: z.boolean().default(false),
  /** for starting targets: an estimate of your burn until your own numbers take over */
  body: z
    .object({
      sex: z.enum(['male', 'female']).nullable().default(null),
      birthYear: z.number().int().min(1900).max(2100).nullable().default(null),
      heightCm: z.number().min(100).max(250).nullable().default(null),
      activity: z.enum(['sedentary', 'light', 'moderate', 'very']).default('light'),
      goal: z.enum(['lose', 'recomp', 'maintain', 'gain']).nullable().default(null),
      focus: z.enum(['none', 'health', 'size', 'strength', 'both']).default('health'),
    })
    .default({ sex: null, birthYear: null, heightCm: null, activity: 'light', goal: null, focus: 'health' }),
  /** equipment, areas to protect, exercises to leave out, hidden tips and strength goals */
  training: trainingSetupSchema,
  bell: z
    .object({
      /** ask one question instead of guessing a portion or how it was cooked */
      askWhenUnsure: z.boolean().default(true),
      /** a voice message sends when you let go (off: it lands in the text box to edit) */
      voiceSends: z.boolean().default(true),
      /** read Bell's answers out loud: always, only after you asked by voice, or never */
      readAloud: z.enum(['always', 'voice', 'never']).default('voice'),
      /** how Bell talks: a friendly gym buddy, a no-fluff coach, a hype partner, or calm and gentle */
      style: z.enum(['buddy', 'coach', 'hype', 'calm']).default('buddy'),
    })
    .default({ askWhenUnsure: true, voiceSends: true, readAloud: 'voice', style: 'buddy' }),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = (): Preferences => preferencesSchema.parse({});

// Words that mean each allergen, and phrases that look like a match but aren't.
const ALLERGEN_WORDS: Record<Allergen, { words: string[]; not?: string[] }> = {
  milk: {
    words: ['milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'ricotta', 'feta', 'brie', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'ghee', 'latte', 'custard', 'pudding', 'ice cream', 'milkshake', 'queso', 'alfredo'],
    not: ['peanut butter', 'almond butter', 'cashew butter', 'nut butter', 'apple butter', 'cocoa butter', 'coconut milk', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'coconut cream', 'cream of tartar'],
  },
  egg: { words: ['egg', 'omelet', 'omelette', 'mayonnaise', 'mayo', 'meringue', 'quiche', 'frittata', 'custard', 'aioli'], not: ['eggplant'] },
  peanut: { words: ['peanut', 'satay', 'groundnut'] },
  'tree nuts': {
    words: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'praline', 'marzipan', 'nutella', 'nut', 'mixed nuts', 'pesto'],
    not: ['peanut', 'nutmeg', 'coconut', 'butternut', 'nutrition', 'doughnut', 'donut'],
  },
  soy: { words: ['soy', 'soya', 'tofu', 'edamame', 'tempeh', 'miso', 'tamari', 'teriyaki'] },
  'wheat/gluten': {
    words: ['wheat', 'bread', 'pasta', 'spaghetti', 'macaroni', 'flour', 'bagel', 'cracker', 'couscous', 'barley', 'rye', 'seitan', 'noodle', 'pizza', 'croissant', 'muffin', 'cake', 'cookie', 'beer', 'bun', 'wrap', 'pancake', 'waffle', 'pretzel', 'tortilla', 'cereal', 'breaded', 'burger', 'sandwich', 'toast', 'dumpling', 'pie'],
    not: ['corn tortilla', 'rice noodle', 'gluten free', 'gluten-free'],
  },
  fish: { words: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'trout', 'sardine', 'anchovy', 'halibut', 'mackerel', 'haddock', 'pollock', 'snapper', 'catfish', 'sushi'] },
  shellfish: { words: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'crawfish', 'crayfish', 'shellfish'] },
  sesame: { words: ['sesame', 'tahini', 'hummus'] },
};

const MEAT = ['chicken', 'beef', 'pork', 'bacon', 'ham', 'turkey', 'lamb', 'steak', 'sausage', 'salami', 'pepperoni', 'jerky', 'meatball', 'burger', 'veal', 'duck', 'venison', 'brisket', 'ribs', 'chorizo', 'prosciutto', 'hot dog', 'gelatin'];
const SEAFOOD = [...ALLERGEN_WORDS.fish.words, ...ALLERGEN_WORDS.shellfish.words];
const NOT_MEAT = ['veggie burger', 'plant-based', 'impossible burger', 'beyond burger', 'beefsteak tomato'];

// A few everyday synonyms so a dislike of "cilantro" also catches "coriander".
const SYNONYMS: Record<string, string[]> = {
  cilantro: ['coriander'],
  coriander: ['cilantro'],
  eggplant: ['aubergine'],
  aubergine: ['eggplant'],
  zucchini: ['courgette'],
  courgette: ['zucchini'],
  shrimp: ['prawn'],
  prawn: ['shrimp'],
  chickpea: ['garbanzo'],
  garbanzo: ['chickpea'],
};

const normal = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
/** Whole-word (or phrase) match, allowing a plural: "ham" matches "ham" and "hams", not "hamburger". */
function has(name: string, word: string) {
  const w = normal(word).trim();
  if (!w) return false;
  return new RegExp(`(^| )${w.replace(/ /g, ' ')}(e?s)?( |$)`).test(name.trim());
}
function strip(name: string, phrases: string[] = []) {
  let n = name;
  for (const p of phrases) n = n.replace(new RegExp(` ${normal(p).trim()}(e?s)? `, 'g'), ' ');
  return n;
}

export interface SafetyCheck {
  /** never suggest or plan this (allergy, avoid list, diet) */
  blocked: boolean;
  /** a dislike or never-suggest: fine to log, just not suggested */
  skip: boolean;
  reasons: string[];
}

/** Check a food name (and brand) against your allergies, diet and dislikes. */
export function checkFood(text: string, prefs: Preferences): SafetyCheck {
  const name = normal(text);
  const reasons: string[] = [];
  for (const a of prefs.allergies) {
    const def = ALLERGEN_WORDS[a];
    const n = strip(name, def.not);
    if (def.words.some((w) => has(n, w))) reasons.push(`may contain ${a}`);
  }
  for (const a of prefs.avoid) if (has(name, a)) reasons.push(`on your avoid list: ${a}`);
  const meatName = strip(name, NOT_MEAT);
  const meat = MEAT.some((w) => has(meatName, w));
  const sea = SEAFOOD.some((w) => has(name, w));
  if (prefs.diet !== 'none' && meat) reasons.push(`not ${prefs.diet}`);
  else if ((prefs.diet === 'vegetarian' || prefs.diet === 'vegan') && sea) reasons.push(`not ${prefs.diet}`);
  if (prefs.diet === 'vegan') {
    const n1 = strip(name, ALLERGEN_WORDS.milk.not);
    const n2 = strip(name, ALLERGEN_WORDS.egg.not);
    if (ALLERGEN_WORDS.milk.words.some((w) => has(n1, w)) || ALLERGEN_WORDS.egg.words.some((w) => has(n2, w)) || has(name, 'honey')) reasons.push('not vegan');
  }
  const blocked = reasons.length > 0;
  const soft: string[] = [];
  for (const d of prefs.dislikes) if ([d, ...(SYNONYMS[normal(d).trim()] ?? [])].some((x) => has(name, x))) soft.push(`you dislike ${d}`);
  for (const d of prefs.neverSuggest) if (has(name, d)) soft.push('on your never-suggest list');
  return { blocked, skip: blocked || soft.length > 0, reasons: [...new Set([...reasons, ...soft])] };
}
