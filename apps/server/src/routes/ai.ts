import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { aiSettings, type connect } from '@forkbell/db';
import type { AppEnv } from '../auth.ts';
import { env } from '../env.ts';
import { open, seal } from '../secret-box.ts';
import { customAllowed, listModels, PROVIDERS, type ProviderName } from '../bell/config.ts';

const providerSchema = z.enum(['gemini', 'anthropic', 'openai', 'custom']);
const saveSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(120),
  /** only for "custom" */
  baseUrl: z.string().trim().url().max(300).nullish(),
  /** leave out to keep the saved key */
  apiKey: z.string().trim().min(8).max(400).optional(),
});
const modelsSchema = z.object({ provider: providerSchema, baseUrl: z.string().trim().url().max(300).nullish(), apiKey: z.string().trim().max(400).optional() });

/** Your own AI provider for Bell. Always about your own account; never shared. */
export function aiRoutes(db: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();
  const me = (c: { get: (k: 'userId') => string }) => c.get('userId');
  const savedKey = async (userId: string) => {
    const [row] = await db.asUser(userId, (tx) => tx.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1));
    return row?.keyCiphertext ? open(row.keyCiphertext) : null;
  };
  const urlFor = (provider: ProviderName, baseUrl?: string | null) => (provider === 'custom' ? (baseUrl ?? '') : PROVIDERS[provider].baseUrl);

  r.get('/', async (c) => {
    const [row] = await db.asUser(me(c), (tx) => tx.select().from(aiSettings).where(eq(aiSettings.userId, me(c))).limit(1));
    return c.json({
      settings: row ? { provider: row.provider, model: row.model, baseUrl: row.baseUrl, keyHint: row.keyHint, keyOk: row.keyCiphertext ? open(row.keyCiphertext) !== null : row.provider === 'custom' } : null,
      server: env.ai.provider ? { provider: env.ai.provider, model: env.ai.model } : null,
      customAllowed: customAllowed(),
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label })),
    });
  });

  /** Check a key and list its models. Uses the saved key when none is given. */
  r.post('/models', async (c) => {
    const parsed = modelsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details.' }, 400);
    const { provider, baseUrl } = parsed.data;
    if (provider === 'custom' && (!customAllowed() || !baseUrl)) return c.json({ error: customAllowed() ? 'Enter the server address.' : 'Custom AI servers are turned off on this server (AI_ALLOW_CUSTOM_URL).' }, 400);
    const apiKey = parsed.data.apiKey || (await savedKey(me(c))) || '';
    if (!apiKey && provider !== 'custom') return c.json({ error: 'Paste your API key first.' }, 400);
    try {
      const models = await listModels(PROVIDERS[provider].format, urlFor(provider, baseUrl), apiKey, provider);
      return c.json({ models });
    } catch (e) {
      return c.json({ error: e instanceof Error && !/fetch failed/i.test(e.message) ? e.message : 'Couldn’t reach the AI service.' }, 400);
    }
  });

  r.put('/', async (c) => {
    const parsed = saveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the details.' }, 400);
    const { provider, model, baseUrl, apiKey } = parsed.data;
    if (provider === 'custom' && !customAllowed()) return c.json({ error: 'Custom AI servers are turned off on this server.' }, 400);
    const userId = me(c);
    const [existing] = await db.asUser(userId, (tx) => tx.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1));
    if (!apiKey && !existing?.keyCiphertext && provider !== 'custom') return c.json({ error: 'Paste your API key.' }, 400);
    const keyFields = apiKey ? { keyCiphertext: seal(apiKey), keyHint: apiKey.slice(-4) } : {};
    const values = { provider, model, baseUrl: provider === 'custom' ? (baseUrl ?? null) : null, ...keyFields, updatedAt: new Date().toISOString() };
    await db.asUser(userId, (tx) =>
      tx.insert(aiSettings).values({ userId, ...values } as typeof aiSettings.$inferInsert).onConflictDoUpdate({ target: aiSettings.userId, set: values }),
    );
    return c.json({ ok: true });
  });

  /** Forget your key: Bell goes back to the server's AI, if it has one. */
  r.delete('/', async (c) => {
    await db.asUser(me(c), (tx) => tx.delete(aiSettings).where(eq(aiSettings.userId, me(c))));
    return c.json({ ok: true });
  });

  return r;
}
