import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { z } from 'zod';
import { bellChatSchema, extractJson, labelReadSchema, labelToFood, preferencesSchema, type BellQuestion, type BellReply, type FoodProposal } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { anthropic, openai, type ToolCall } from '../bell/providers.ts';
import { aiConfigFor } from '../bell/config.ts';
import { runTool, systemPrompt, toolsFor, type ToolContext } from '../bell/tools.ts';

const MAX_ROUNDS = 8;
// A simple guard against runaway costs: 40 messages per person per 10 minutes.
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 40) return false;
  recent.set(userId, [...list, now]);
  return true;
}

const labelSchema = z.object({ image: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp|gif);base64,/, 'Send a JPEG, PNG, WebP or GIF photo.') });

const LABEL_PROMPT = `You read nutrition labels from photos for a food tracker. Report only what is printed; never estimate or fill in missing numbers.
Answer with one JSON object and nothing else:
{"readable": boolean, "name": string|null, "brand": string|null, "serving_label": string|null, "serving_g": number|null,
 "per100": {"kcal","kj","protein","carbs","fat","fiber","sugar","sodium_mg","salt_g"} | null,
 "per_serving": {same keys} | null, "note": string|null}
Rules:
- per100 is the "per 100 g" or "per 100 ml" column. per_serving is the "per serving" or "amount per serving" column. Fill whichever columns are printed; use null for anything not printed.
- serving_g is the serving size in grams or ml, e.g. "2/3 cup (55g)" gives 55. If no gram or ml amount is printed, use null.
- kcal is food energy in kcal (US "Calories"). If only kJ is printed, put it in kj and set kcal to null.
- carbs is total carbohydrate. sodium_mg in milligrams; salt_g only if salt is printed instead of sodium.
- name and brand only if you can read them on the pack; otherwise null.
- If the photo isn't a nutrition label, or you can't read the numbers clearly, set readable to false and say why in note.`;

export function bellRoutes(db: ReturnType<typeof connect>, internal: (path: string, userId: string) => Promise<unknown>) {
  const { asUser } = db;
  const r = new Hono<AppEnv>();

  r.get('/status', async (c) => {
    const cfg = await aiConfigFor(db, c.get('userId'));
    if (!cfg) return c.json({ enabled: false, provider: null, model: null, source: null });
    if ('error' in cfg) return c.json({ enabled: false, provider: null, model: null, source: 'yours', error: cfg.error });
    return c.json({ enabled: true, provider: cfg.provider, model: cfg.model, source: cfg.source });
  });

  r.post('/chat', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai) return c.json({ error: 'Bell needs an AI key. Add yours in Settings → Bell.' }, 503);
    if ('error' in ai) return c.json({ error: ai.error }, 503);
    const userId = c.get('profileId');
    if (!allowed(userId)) return c.json({ error: 'That’s a lot of messages in a short time. Try again in a few minutes.' }, 429);
    const parsed = bellChatSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the message.' }, 400);
    const { messages, today, meal, localTime } = parsed.data;

    const [me] = await asUser(userId, (tx) => tx.select({ name: users.name, unit: users.weightUnit, prefs: users.preferences }).from(users).where(eq(users.id, userId)).limit(1));
    // Only the newest photo goes to the model; older ones are just mentioned.
    const window = messages.slice(-20);
    const lastImage = window.map((m) => Boolean(m.image)).lastIndexOf(true);
    const turns = window.map((m, i) => ({
      role: m.role,
      // Models reject empty turns; an assistant turn can be empty when it only asked a question.
      text: m.image && i !== lastImage ? `${m.text} [photo]` : m.text || (m.role === 'assistant' ? '(asked a question)' : ''),
      image: i === lastImage ? m.image : undefined,
    }));
    const prefs = preferencesSchema.parse(me?.prefs ?? {});
    const system = systemPrompt({ today, localTime, unit: me?.unit ?? 'lb', name: me?.name ?? null, prefs });
    const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
    const tools = toolsFor(prefs);
    const model = ai.format === 'anthropic' ? anthropic(cfg, system, turns, tools) : openai(cfg, system, turns, tools);

    const ctx: ToolContext = {
      call: (path: string) => internal(path, userId),
      today,
      meal,
      proposals: [] as FoodProposal[],
      prefs,
      // The last few things they said, so an amount given before a question still counts.
      userText: messages.filter((m) => m.role === 'user').slice(-3).map((m) => m.text).join('\n'),
      question: null as BellQuestion | null,
    };
    let results: { call: ToolCall; output: string }[] | undefined;
    let text = '';
    let unfinished = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const step = await model.step(results);
        text = step.text || text;
        unfinished = step.calls.length > 0;
        if (!step.calls.length) break;
        results = [];
        for (const tc of step.calls) {
          let output: string;
          try {
            output = await runTool(tc.name, tc.args, ctx);
          } catch (e) {
            output = `Tool failed: ${e instanceof Error ? e.message : String(e)}`;
          }
          results.push({ call: tc, output });
        }
        // A question means waiting for the person; another model call would only guess.
        if (ctx.question) {
          unfinished = false;
          break;
        }
      }
    } catch (e) {
      console.error('Bell:', e);
      return c.json({ error: e instanceof Error && e.message.startsWith('The AI service') ? e.message : 'Bell couldn’t reach the AI service. Check the server log.' }, 502);
    }
    const { proposals, question } = ctx;
    // Bell always answers with something you can act on, never an empty bubble.
    const fallback = question
      ? ''
      : proposals.length
        ? 'Here’s what I’d log. Check the amounts and tap Add.'
        : unfinished
          ? 'That took more steps than I’m allowed. Try asking about one thing at a time.'
          : 'I didn’t get an answer from the model. Try asking again, or rephrase it.';
    const body: BellReply = { reply: unfinished && !proposals.length ? fallback : text || fallback, proposals, question };
    return c.json(body);
  });

  /** Read a nutrition label photo. Nothing is saved: the app shows the numbers to check first. */
  r.post('/label', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai || 'error' in ai) return c.json({ error: ai && 'error' in ai ? ai.error : 'Reading labels needs Bell: add an AI key in Settings → Bell.' }, 503);
    const userId = c.get('profileId');
    if (!allowed(userId)) return c.json({ error: 'That’s a lot of requests in a short time. Try again in a few minutes.' }, 429);
    const parsed = labelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send a photo of the label.' }, 400);
    const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
    const turns = [{ role: 'user' as const, text: 'Read this nutrition label.', image: parsed.data.image }];
    let answer: string;
    try {
      const model = ai.format === 'anthropic' ? anthropic(cfg, LABEL_PROMPT, turns, []) : openai(cfg, LABEL_PROMPT, turns, []);
      answer = (await model.step()).text;
    } catch (e) {
      console.error('Bell label:', e);
      return c.json({ error: 'Couldn’t reach the AI service. Type the numbers in instead.' }, 502);
    }
    const read = labelReadSchema.safeParse(extractJson(answer));
    if (!read.success) return c.json({ error: 'The model’s answer didn’t make sense. Try another photo, or type the numbers in.' }, 422);
    const result = labelToFood(read.data);
    if ('error' in result) return c.json({ error: result.error }, 422);
    return c.json(result);
  });

  return r;
}
