import { z } from 'zod';
import { dateSchema, per100Schema } from './schemas.ts';
import { MEALS, type Food, type Meal, type Per100 } from './types.ts';

/** A food Bell suggests logging. Nothing is logged until you confirm it. */
export interface FoodProposal {
  name: string;
  brand: string | null;
  grams: number;
  meal: Meal;
  date: string;
  /** one of your foods or a built-in food, when Bell matched one */
  food: Food | null;
  /** Bell's numbers per 100 g, when there's no matching food (from a label or an estimate) */
  per100: Per100 | null;
  /** true when the numbers are Bell's estimate rather than a database or label */
  estimate: boolean;
  note: string | null;
  /** name-based allergy or diet flags, e.g. "may contain milk" */
  warnings: string[];
}

export const bellChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(4000),
        image: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp|gif);base64,/).optional(),
      }),
    )
    .min(1)
    .max(40),
  today: dateSchema,
  /** the meal that fits the time on the phone, for "log a coffee" */
  meal: z.enum(MEALS),
  localTime: z.string().max(40).optional(),
});
export type BellChatInput = z.infer<typeof bellChatSchema>;

/** A question Bell asks instead of guessing, with answers you can tap. */
export interface BellQuestion {
  text: string;
  choices: string[];
}

export interface BellReply {
  reply: string;
  proposals: FoodProposal[];
  /** set when Bell needs one detail before it can log something well */
  question?: BellQuestion | null;
}

/** What the model may send to ask_question. */
export const askArgsSchema = z.object({
  question: z.string().trim().min(3).max(200),
  choices: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
});

/** The answer button that's always offered, so a question never blocks logging. */
export const JUST_ESTIMATE = 'Just estimate it';

/**
 * True when an amount is exactly 100 g but the person never said 100: almost
 * always the model copying the per-100 g basis instead of working out what
 * was eaten.
 */
export function looksLikeDefaultAmount(grams: number, userText: string): boolean {
  if (Math.abs(grams - 100) > 0.001) return false;
  return !/(^|[^\d.,])100([^\d.,]|$)/.test(userText);
}

/** What the model may send to propose_food_entries. */
export const proposeArgsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        brand: z.string().trim().max(200).nullish(),
        grams: z.number().positive().max(5000),
        meal: z.enum(MEALS).optional(),
        date: dateSchema.optional(),
        food_id: z.string().uuid().optional(),
        per100: per100Schema.optional(),
        estimate: z.boolean().optional(),
        note: z.string().max(300).nullish(),
        /** calories seen on a photo or label, or said by the person, for this amount */
        expected_kcal: z.number().positive().max(20000).optional(),
        /** set when exactly 100 g really is what they had (their usual, or the serving size) */
        amount_confirmed: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(15),
});

// ---------------------------------------------------------------------------
// Reading a nutrition label from a photo. The model reports what's printed;
// the conversion to per 100 g happens here, in code, so the maths can't drift.

const labelNumbers = z
  .object({
    kcal: z.number().nonnegative().nullish(),
    kj: z.number().nonnegative().nullish(),
    protein: z.number().nonnegative().nullish(),
    carbs: z.number().nonnegative().nullish(),
    fat: z.number().nonnegative().nullish(),
    fiber: z.number().nonnegative().nullish(),
    sugar: z.number().nonnegative().nullish(),
    /** milligrams */
    sodium_mg: z.number().nonnegative().nullish(),
    /** grams of salt, on European labels */
    salt_g: z.number().nonnegative().nullish(),
  })
  .nullish();

/** What the model may send back after reading a label. */
export const labelReadSchema = z.object({
  readable: z.boolean(),
  name: z.string().trim().max(200).nullish(),
  brand: z.string().trim().max(200).nullish(),
  serving_label: z.string().trim().max(100).nullish(),
  /** grams (or ml) in one serving, as printed */
  serving_g: z.number().positive().max(5000).nullish(),
  per100: labelNumbers,
  per_serving: labelNumbers,
  note: z.string().trim().max(300).nullish(),
});
export type LabelRead = z.infer<typeof labelReadSchema>;

export interface LabelFood {
  name: string | null;
  brand: string | null;
  per100: Per100;
  servingGrams: number | null;
  servingLabel: string | null;
  /** how the numbers were worked out, shown so you can check them */
  basis: 'per 100 g column' | 'per serving, converted';
  note: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Turn what was read off a label into per-100 g numbers, or say why it can't. */
export function labelToFood(read: LabelRead): { food: LabelFood } | { error: string } {
  if (!read.readable) return { error: read.note || 'I couldn’t read a nutrition label in that photo. Try again closer, with the table flat and in focus.' };
  const kcalOf = (n: NonNullable<LabelRead['per100']>) => (n.kcal ?? (n.kj != null ? n.kj / 4.184 : null));
  let source = read.per100 && kcalOf(read.per100) != null ? read.per100 : null;
  let factor = 1;
  let basis: LabelFood['basis'] = 'per 100 g column';
  if (!source) {
    if (!read.per_serving || kcalOf(read.per_serving) == null) return { error: 'I couldn’t find the calories on that label. Make sure the whole table is in the photo.' };
    if (!read.serving_g) return { error: 'The label gives numbers per serving but I couldn’t read the serving size in grams. Type the numbers in, or retake the photo with the serving size showing.' };
    source = read.per_serving;
    factor = 100 / read.serving_g;
    basis = 'per serving, converted';
  }
  const scale = (v: number | null | undefined) => (v == null ? null : round1(v * factor));
  const sodium = source.sodium_mg ?? (source.salt_g != null ? source.salt_g * 400 : null); // salt is 40% sodium
  const per100: Per100 = {
    kcal: Math.round(kcalOf(source)! * factor),
    protein: scale(source.protein) ?? 0,
    carbs: scale(source.carbs) ?? 0,
    fat: scale(source.fat) ?? 0,
    fiber: scale(source.fiber),
    sugar: scale(source.sugar),
    sodium: sodium == null ? null : Math.round(sodium * factor),
  };
  return {
    food: {
      name: read.name || null,
      brand: read.brand || null,
      per100,
      servingGrams: read.serving_g ?? null,
      servingLabel: read.serving_label || null,
      basis,
      note: read.note || null,
    },
  };
}

/** Pull the first JSON object out of a model's answer (it may add fences or words). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** An image link in a message (what you get pasting “copy image address”). */
export function imageLinkIn(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>"']*)?(?=$|[\s)>\]"'])/i.exec(text);
  return m ? m[0] : null;
}
