import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { healthDaily, weighIns, type connect } from '@forkbell/db';
import { healthImportSchema } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';

export function healthRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /**
   * The phone sends what Apple Health or Health Connect holds for recent days.
   * Sending the same days again just updates them. Weights fill in days you
   * didn't weigh in yourself; a weight you typed in is never replaced.
   */
  r.post('/import', async (c) => {
    const parsed = healthImportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the health data.' }, 400);
    const { source, days, weights } = parsed.data;
    const counts = await asUser(c.get('profileId'), async (tx) => {
      if (days.length)
        await tx
          .insert(healthDaily)
          .values(days.map((d) => ({ ...d, source }) as typeof healthDaily.$inferInsert))
          .onConflictDoUpdate({
            target: [healthDaily.userId, healthDaily.date, healthDaily.kind, healthDaily.source],
            set: { value: sql`excluded.value`, updatedAt: sql`now()` } as Record<string, unknown>,
          });
      // One statement for every day (up to 400). One row per day: the last reading
      // given for a day wins, as it did when they went in one at a time.
      const byDay = [...new Map(weights.map((w) => [w.date, w])).values()];
      const kept = byDay.length
        ? await tx
            .insert(weighIns)
            .values(byDay.map((w) => ({ date: w.date, weightKg: w.weightKg, bodyFat: w.bodyFat ?? null, source }) as typeof weighIns.$inferInsert))
            .onConflictDoUpdate({
              target: [weighIns.userId, weighIns.date],
              set: { weightKg: sql`excluded.weight_kg`, bodyFat: sql`excluded.body_fat`, source: sql`excluded.source` } as Record<string, unknown>,
              setWhere: sql`${weighIns.source} <> 'manual'`,
            })
            .returning({ id: weighIns.id })
        : [];
      return { days: days.length, weights: kept.length };
    });
    return c.json(counts);
  });

  return r;
}
