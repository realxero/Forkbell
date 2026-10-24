// Siri and the Shortcuts app. Make a Shortcut key in Settings, then a Shortcut
// can ask Bell anything ("how much protein do I have left?", "I had two eggs
// and toast"), read the answer out, and, once you say yes, add what Bell
// suggested. Nothing is logged without that yes, the same as in the app.
// Every answer has a `speak` line made for Siri to read out.
import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { shortcutKeys, type connect } from '@forkbell/db';
import { dateSchema, mealForTime, todayLocal, type BellReply, type DiaryDay, type FoodProposal } from '@forkbell/shared';
import { hashToken, SHORTCUT_PREFIX, type AppEnv } from '../auth.ts';

type Internal = (path: string, userId: string, init?: { method: string; body: unknown }) => Promise<unknown>;

const KEY_YEARS = 5;
const pending = new Map<string, { userId: string; proposals: FoodProposal[]; expires: number }>();
const sweep = () => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
};

const askSchema = z.object({
  text: z.string().trim().min(1, 'Say something to ask Bell.').max(1000),
  today: dateSchema.optional(),
  localTime: z.string().max(40).optional(),
});

const kcalOf = (p: FoodProposal) => Math.round((((p.food?.per100 ?? p.per100)?.kcal ?? 0) * p.grams) / 100);
const listWords = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function shortcutRoutes(db: ReturnType<typeof connect>, internal: Internal) {
  const { asUser } = db;
  const r = new Hono<AppEnv>();
  /** Note when a key was last used, so an old one you forgot about is easy to spot. */
  const touch = (c: { req: { header: (n: string) => string | undefined }; get: (k: 'userId') => string }) => {
    const auth = c.req.header('authorization') ?? '';
    if (!auth.startsWith(`Bearer ${SHORTCUT_PREFIX}`)) return;
    const hash = hashToken(auth.slice(7));
    void asUser(c.get('userId'), (tx) => tx.update(shortcutKeys).set({ lastUsedAt: sql`now()` }).where(eq(shortcutKeys.tokenHash, hash))).catch(() => {});
  };

  // Keys: made and removed in the app, never with a key.
  r.get('/keys', async (c) => {
    const rows = await asUser(c.get('userId'), (tx) => tx.select({ id: shortcutKeys.id, label: shortcutKeys.label, hint: shortcutKeys.hint, createdAt: shortcutKeys.createdAt, lastUsedAt: shortcutKeys.lastUsedAt }).from(shortcutKeys).orderBy(desc(shortcutKeys.createdAt)));
    return c.json({ keys: rows });
  });
  r.post('/keys', async (c) => {
    const { label } = (await c.req.json().catch(() => ({}))) as { label?: string };
    const userId = c.get('userId');
    const token = SHORTCUT_PREFIX + randomBytes(32).toString('base64url');
    const hash = hashToken(token);
    const expires = new Date(Date.now() + KEY_YEARS * 365 * 86_400_000);
    await db.db.execute(sql`select auth_create_session(${userId}::uuid, ${hash}, ${expires.toISOString()}::timestamptz)`);
    await asUser(userId, (tx) => tx.insert(shortcutKeys).values({ label: (label ?? '').trim().slice(0, 60) || 'Shortcuts', tokenHash: hash, hint: `…${token.slice(-4)}` } as typeof shortcutKeys.$inferInsert));
    return c.json({ token }, 201);
  });
  r.delete('/keys/:id', async (c) => {
    const [row] = await asUser(c.get('userId'), (tx) => tx.delete(shortcutKeys).where(eq(shortcutKeys.id, c.req.param('id'))).returning({ hash: shortcutKeys.tokenHash }));
    if (!row) return c.json({ error: 'Not found.' }, 404);
    await db.db.execute(sql`select auth_end_session(${row.hash})`);
    return c.json({ ok: true });
  });

  /** Ask Bell. Food it suggests comes back as a question to confirm, with an addId for /add. */
  r.post('/ask', async (c) => {
    touch(c);
    sweep();
    const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send text.', speak: 'Sorry, I didn’t get a question.' }, 400);
    const userId = c.get('userId');
    let reply: BellReply;
    try {
      reply = (await internal('/api/bell/chat', userId, {
        method: 'POST',
        body: { messages: [{ role: 'user', text: parsed.data.text }], today: parsed.data.today ?? todayLocal(), meal: mealForTime(), localTime: parsed.data.localTime },
      })) as BellReply;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg, speak: msg }, 502);
    }
    const answer = reply.question ? `${reply.question.text} You can say: ${listWords(reply.question.choices)}.` : reply.reply;
    if (!reply.proposals.length) return c.json({ speak: answer, reply: answer, proposals: [], addId: null, confirm: null });
    const addId = randomBytes(12).toString('base64url');
    pending.set(addId, { userId, proposals: reply.proposals, expires: Date.now() + 15 * 60_000 });
    const items = reply.proposals.map((p) => `${p.name}, ${Math.round(p.grams)} grams, ${kcalOf(p)} calories`);
    const confirm = `Add ${listWords(items)} to ${reply.proposals[0]!.meal}?`;
    return c.json({ speak: `${answer} ${confirm}`, reply: answer, confirm, addId, proposals: reply.proposals.map((p) => ({ name: p.name, grams: p.grams, kcal: kcalOf(p), meal: p.meal, date: p.date, estimate: p.estimate })) });
  });

  /** Add what /ask suggested, after you said yes. Each suggestion can be added once, within 15 minutes. */
  r.post('/add', async (c) => {
    touch(c);
    sweep();
    const { addId } = (await c.req.json().catch(() => ({}))) as { addId?: string };
    const job = addId ? pending.get(addId) : undefined;
    if (!job || job.userId !== c.get('userId')) return c.json({ error: 'That suggestion expired.', speak: 'That one expired. Ask me again.' }, 404);
    pending.delete(addId!);
    let added = 0;
    for (const p of job.proposals) {
      const food = p.food
        ? { foodId: p.food.id }
        : { food: { name: p.name, brand: p.brand, source: 'custom', sourceId: null, per100: p.per100!, servingGrams: null, servingLabel: null, barcode: null, portions: [] } };
      try {
        await internal('/api/diary', job.userId, { method: 'POST', body: { date: p.date, meal: p.meal, grams: p.grams, ...food } });
        added++;
      } catch (e) {
        console.error('Shortcut add:', e);
      }
    }
    const kcal = job.proposals.reduce((n, p) => n + kcalOf(p), 0);
    return c.json({
      added,
      speak: added === job.proposals.length ? `Added, ${kcal} calories.` : added ? `Added ${added} of ${job.proposals.length}. Check the rest in Forkbell.` : 'I couldn’t add that. Try in the app.',
    });
  });

  /** What's left today, without the AI: quick and free. */
  r.get('/today', async (c) => {
    touch(c);
    const q = dateSchema.safeParse(c.req.query('today'));
    const day = (await internal(`/api/diary/${q.success ? q.data : todayLocal()}`, c.get('userId'))) as DiaryDay;
    const left = (goal: number | null | undefined, have: number) => (goal ? Math.round(goal - have) : null);
    const kcal = left(day.goals?.kcal, day.totals.kcal);
    const protein = left(day.goals?.protein, day.totals.protein);
    const parts = [
      kcal === null ? `${Math.round(day.totals.kcal)} calories so far` : kcal >= 0 ? `${kcal} calories left` : `${-kcal} calories over`,
      protein === null ? null : protein > 0 ? `${protein} grams of protein to go` : 'protein done',
    ].filter(Boolean);
    return c.json({ speak: `${parts.join(', and ')}.`, caloriesLeft: kcal, proteinLeft: protein, totals: day.totals, goals: day.goals });
  });

  return r;
}
