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

export interface BellReply {
  reply: string;
  proposals: FoodProposal[];
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
      }),
    )
    .min(1)
    .max(15),
});
