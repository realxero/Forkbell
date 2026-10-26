import { Hono } from 'hono';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { checkIns, medicationLogs, medications, waterEntries, type connect } from '@forkbell/db';
import { addDays, dateSchema, MAX_WATER_ML, todayLocal, waterTotal, type WaterDay } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';

const scale = z.number().int().min(1).max(5).nullable();
const checkInSchema = z.object({
  date: dateSchema,
  sleepHours: z.number().min(0).max(24).nullable(),
  sleepQuality: scale,
  mood: scale,
  energy: scale,
  note: z.string().trim().max(1000).nullable(),
});
const medSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dose: z.string().trim().max(60).nullable(),
  timesPerDay: z.number().int().min(1).max(6),
  notes: z.string().trim().max(500).nullable(),
  active: z.boolean().default(true),
  /** a local time per dose ("HH:MM"), or '' for no reminder */
  reminderTimes: z.array(z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:30.'), z.literal('')])).max(6).optional(), // left as it is when not sent
});
const logSchema = z.object({ medicationId: z.string().uuid(), date: dateSchema, slot: z.number().int().min(0).max(5), status: z.enum(['taken', 'skipped']).nullable() });

/** Sleep, mood and energy check-ins, and medications you take. */
export function wellbeingRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const t = dateSchema.safeParse(c.req.query('today'));
    const today = t.success ? t.data : todayLocal();
    const data = await asUser(c.get('profileId'), async (tx) => ({
      checkIns: await tx.select().from(checkIns).where(gte(checkIns.date, addDays(today, -29))).orderBy(desc(checkIns.date)),
      meds: await tx.select().from(medications).orderBy(desc(medications.active), asc(medications.name)),
      logs: await tx.select().from(medicationLogs).where(gte(medicationLogs.date, addDays(today, -6))),
    }));
    return c.json({
      today,
      checkIns: data.checkIns.map(({ id: _id, userId: _u, ...rest }) => rest),
      medications: data.meds.map((m) => {
        const mine = data.logs.filter((l) => l.medicationId === m.id);
        const taken7 = mine.filter((l) => l.status === 'taken').length;
        return {
          id: m.id,
          name: m.name,
          dose: m.dose,
          timesPerDay: m.timesPerDay,
          notes: m.notes,
          active: m.active,
          reminderTimes: Array.from({ length: m.timesPerDay }, (_, slot) => m.reminderTimes[slot] || null),
          today: Array.from({ length: m.timesPerDay }, (_, slot) => mine.find((l) => l.date === today && l.slot === slot)?.status ?? null),
          lastWeek: { taken: taken7, planned: m.timesPerDay * 7 },
        };
      }),
    });
  });

  r.put('/check-ins', async (c) => {
    const parsed = checkInSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the check-in.' }, 400);
    const { date, ...rest } = parsed.data;
    await asUser(c.get('profileId'), (tx) =>
      tx.insert(checkIns).values({ date, ...rest } as typeof checkIns.$inferInsert).onConflictDoUpdate({ target: [checkIns.userId, checkIns.date], set: rest }),
    );
    return c.json({ ok: true });
  });

  r.post('/medications', async (c) => {
    const parsed = medSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the medication.' }, 400);
    const [row] = await asUser(c.get('profileId'), (tx) => tx.insert(medications).values(parsed.data as typeof medications.$inferInsert).returning({ id: medications.id }));
    return c.json({ id: row!.id }, 201);
  });

  r.put('/medications/:id', async (c) => {
    const parsed = medSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the medication.' }, 400);
    const rows = await asUser(c.get('profileId'), (tx) => tx.update(medications).set(parsed.data).where(eq(medications.id, c.req.param('id'))).returning({ id: medications.id }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  r.delete('/medications/:id', async (c) => {
    const rows = await asUser(c.get('profileId'), (tx) => tx.delete(medications).where(eq(medications.id, c.req.param('id'))).returning({ id: medications.id }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  /** Mark a dose taken or skipped; null clears it. */
  r.put('/medication-logs', async (c) => {
    const parsed = logSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the dose.' }, 400);
    const { medicationId, date, slot, status } = parsed.data;
    await asUser(c.get('profileId'), async (tx) => {
      if (status === null) await tx.delete(medicationLogs).where(and(eq(medicationLogs.medicationId, medicationId), eq(medicationLogs.date, date), eq(medicationLogs.slot, slot)));
      else
        await tx
          .insert(medicationLogs)
          .values({ medicationId, date, slot, status } as typeof medicationLogs.$inferInsert)
          .onConflictDoUpdate({ target: [medicationLogs.medicationId, medicationLogs.date, medicationLogs.slot], set: { status } });
    });
    return c.json({ ok: true });
  });

  // Water ---------------------------------------------------------------------
  // The day is in the path (not a query), so the app keeps one copy per day for offline use.
  r.get('/water/:date', async (c) => {
    const d = dateSchema.safeParse(c.req.param('date'));
    if (!d.success) return c.json({ error: 'Use a date like 2026-10-25.' }, 400);
    const entries = await asUser(c.get('profileId'), (tx) =>
      tx.select({ id: waterEntries.id, ml: waterEntries.ml, at: waterEntries.createdAt }).from(waterEntries).where(eq(waterEntries.date, d.data)).orderBy(asc(waterEntries.createdAt), asc(waterEntries.id)),
    );
    return c.json({ date: d.data, entries, totalMl: waterTotal(entries) } satisfies WaterDay);
  });
  r.post('/water', async (c) => {
    const p = z
      .object({ id: z.string().uuid().optional(), date: dateSchema, ml: z.number().int().min(1, 'Add at least 1 ml.').max(MAX_WATER_ML, 'That’s more than one drink; add it in parts.') })
      .safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? 'Send a date and an amount in ml.' }, 400);
    const { id, date, ml } = p.data;
    // Sent twice (an answer lost on a bad connection): the second does nothing.
    const [row] = await asUser(c.get('userId'), (tx) =>
      tx.insert(waterEntries).values({ ...(id ? { id } : {}), date, ml } as typeof waterEntries.$inferInsert).onConflictDoNothing({ target: waterEntries.id }).returning({ id: waterEntries.id }),
    );
    return c.json({ id: row?.id ?? id }, 201);
  });
  r.delete('/water/:id', async (c) => {
    if (!z.string().uuid().safeParse(c.req.param('id')).success) return c.json({ error: 'Not found.' }, 404);
    const gone = await asUser(c.get('userId'), (tx) => tx.delete(waterEntries).where(eq(waterEntries.id, c.req.param('id'))).returning({ id: waterEntries.id }));
    return gone.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  return r;
}
