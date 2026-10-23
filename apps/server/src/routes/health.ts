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
      let kept = 0;
      for (const w of weights) {
        const rows = await tx
          .insert(weighIns)
          .values({ date: w.date, weightKg: w.weightKg, bodyFat: w.bodyFat ?? null, source } as typeof weighIns.$inferInsert)
          .onConflictDoUpdate({
            target: [weighIns.userId, weighIns.date],
            set: { weightKg: w.weightKg, bodyFat: w.bodyFat ?? null, source },
            setWhere: sql`${weighIns.source} <> 'manual'`,
          })
          .returning({ id: weighIns.id });
        kept += rows.length;
      }
      return { days: days.length, weights: kept };
    });
    return c.json(counts);
  });

  return r;
}
