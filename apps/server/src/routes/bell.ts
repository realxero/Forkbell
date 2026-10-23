import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { bellChatSchema, preferencesSchema, type BellReply, type FoodProposal } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { env } from '../env.ts';
import { anthropic, openai, type ToolCall } from '../bell/providers.ts';
import { runTool, systemPrompt, TOOLS } from '../bell/tools.ts';

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

export function bellRoutes({ asUser }: ReturnType<typeof connect>, internal: (path: string, userId: string) => Promise<unknown>) {
  const r = new Hono<AppEnv>();

  r.get('/status', (c) => c.json({ enabled: Boolean(env.ai.provider), provider: env.ai.provider, model: env.ai.provider ? env.ai.model : null }));

  r.post('/chat', async (c) => {
    if (!env.ai.provider) return c.json({ error: 'Bell isn’t set up on this server. Set AI_PROVIDER, AI_API_KEY and AI_MODEL.' }, 503);
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
      text: m.image && i !== lastImage ? `${m.text} [photo]` : m.text,
      image: i === lastImage ? m.image : undefined,
    }));
    const prefs = preferencesSchema.parse(me?.prefs ?? {});
    const system = systemPrompt({ today, localTime, unit: me?.unit ?? 'lb', name: me?.name ?? null, prefs });
    const cfg = { apiKey: env.ai.apiKey, model: env.ai.model, baseUrl: env.ai.baseUrl };
    const model = env.ai.provider === 'anthropic' ? anthropic(cfg, system, turns, TOOLS) : openai(cfg, system, turns, TOOLS);

    const proposals: FoodProposal[] = [];
    const call = (path: string) => internal(path, userId);
    let results: { call: ToolCall; output: string }[] | undefined;
    let text = '';
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const step = await model.step(results);
        text = step.text || text;
        if (!step.calls.length) break;
        results = [];
        for (const tc of step.calls) {
          let output: string;
          try {
            output = await runTool(tc.name, tc.args, { call, today, meal, proposals, prefs });
          } catch (e) {
            output = `Tool failed: ${e instanceof Error ? e.message : String(e)}`;
          }
          results.push({ call: tc, output });
        }
      }
    } catch (e) {
      console.error('Bell:', e);
      return c.json({ error: e instanceof Error && e.message.startsWith('The AI service') ? e.message : 'Bell couldn’t reach the AI service. Check the server log.' }, 502);
    }
    const body: BellReply = { reply: text || (proposals.length ? 'Here’s what I’d log. Check the amounts and tap Add.' : 'Sorry, I didn’t get an answer. Try asking again.'), proposals };
    return c.json(body);
  });

  return r;
}
