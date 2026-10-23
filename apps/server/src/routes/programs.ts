import { Hono } from 'hono';
import { and, desc, eq, inArray, max, ne } from 'drizzle-orm';
import { exercises, programs, routineExercises, routines, type connect, type Tx } from '@forkbell/db';
import { STARTER_PROGRAMS, saveRoutineSchema, type Program } from '@forkbell/shared';
import { z } from 'zod';
import type { AppEnv } from '../auth.ts';
import { isMissingExercise, loadRoutines, nextRoutineId } from '../training.ts';

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

async function activate(tx: Tx, id: string) {
  await tx.update(programs).set({ active: false }).where(and(eq(programs.active, true), ne(programs.id, id)));
  return tx.update(programs).set({ active: true }).where(eq(programs.id, id)).returning({ id: programs.id });
}

export function programRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Your programs (active first) with their routines, plus the starter programs you can copy. */
  r.get('/', async (c) => {
    const list = await asUser(c.get('profileId'), async (tx) => {
      const rows = await tx.select().from(programs).orderBy(desc(programs.active), desc(programs.createdAt));
      const byProgram = await loadRoutines(tx, rows.map((p) => p.id));
      const out: Program[] = [];
      for (const p of rows) {
        const rs = byProgram.get(p.id) ?? [];
        out.push({ id: p.id, name: p.name, active: p.active, routines: rs, nextRoutineId: p.active ? await nextRoutineId(tx, rs) : null });
      }
      return out;
    });
    const starters = STARTER_PROGRAMS.map(({ key, name, daysPerWeek, description, routines }) => ({ key, name, daysPerWeek, description, routines: routines.map((x) => x.name) }));
    return c.json({ programs: list, starters });
  });

  /** Copy a starter program into your own and make it active. You can change it freely afterwards. */
  r.post('/starter', async (c) => {
    const body = await c.req.json<{ key?: string }>().catch(() => ({}) as { key?: string });
    const starter = STARTER_PROGRAMS.find((p) => p.key === body.key);
    if (!starter) return c.json({ error: 'That starter program was not found.' }, 404);
    const id = await asUser(c.get('profileId'), async (tx) => {
      const keys = [...new Set(starter.routines.flatMap((x) => x.exercises.map(([k]) => k)))];
      const found = await tx.select({ id: exercises.id, key: exercises.key, rest: exercises.restSeconds }).from(exercises).where(and(eq(exercises.source, 'builtin'), inArray(exercises.key, keys)));
      const byKey = new Map(found.map((f) => [f.key!, f]));
      const [p] = await tx.insert(programs).values({ name: starter.name, active: false } as typeof programs.$inferInsert).returning({ id: programs.id });
      for (const [position, rt] of starter.routines.entries()) {
        const [row] = await tx.insert(routines).values({ programId: p!.id, name: rt.name, position } as typeof routines.$inferInsert).returning({ id: routines.id });
        const items = rt.exercises.filter(([k]) => byKey.has(k));
        if (items.length)
          await tx.insert(routineExercises).values(
            items.map(([k, sets, repMin, repMax], i) => ({ routineId: row!.id, exerciseId: byKey.get(k)!.id, position: i, sets, repMin, repMax, restSeconds: byKey.get(k)!.rest }) as typeof routineExercises.$inferInsert),
          );
      }
      await activate(tx, p!.id);
      return p!.id;
    });
    return c.json({ id }, 201);
  });

  /** A new empty program of your own. */
  r.post('/', async (c) => {
    const parsed = nameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Give the program a name.' }, 400);
    const id = await asUser(c.get('profileId'), async (tx) => {
      const [p] = await tx.insert(programs).values({ name: parsed.data.name, active: false } as typeof programs.$inferInsert).returning({ id: programs.id });
      await activate(tx, p!.id);
      return p!.id;
    });
    return c.json({ id }, 201);
  });

  r.post('/:id/activate', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That program was not found.' }, 404);
    const done = await asUser(c.get('profileId'), (tx) => activate(tx, id));
    return done.length ? c.json({ ok: true }) : c.json({ error: 'That program was not found.' }, 404);
  });

  r.delete('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That program was not found.' }, 404);
    const deleted = await asUser(c.get('profileId'), (tx) => tx.delete(programs).where(eq(programs.id, id)).returning({ id: programs.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That program was not found.' }, 404);
  });

  /** Add a training day to a program. */
  r.post('/:id/routines', async (c) => {
    const id = c.req.param('id');
    const parsed = nameSchema.safeParse(await c.req.json().catch(() => null));
    if (!isUuid(id) || !parsed.success) return c.json({ error: 'Give the day a name.' }, 400);
    const routineId = await asUser(c.get('profileId'), async (tx) => {
      const [p] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, id)).limit(1);
      if (!p) return null;
      const [{ last }] = (await tx.select({ last: max(routines.position) }).from(routines).where(eq(routines.programId, id))) as [{ last: number | null }];
      const [row] = await tx.insert(routines).values({ programId: id, name: parsed.data.name, position: (last ?? -1) + 1 } as typeof routines.$inferInsert).returning({ id: routines.id });
      return row!.id;
    });
    return routineId ? c.json({ id: routineId }, 201) : c.json({ error: 'That program was not found.' }, 404);
  });

  return r;
}

export function routineRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Rename a day and replace its exercises with what the app sent. */
  r.put('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That day was not found.' }, 404);
    const parsed = saveRoutineSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the day.' }, 400);
    try {
      const ok = await asUser(c.get('profileId'), async (tx) => {
        const updated = await tx.update(routines).set({ name: parsed.data.name }).where(eq(routines.id, id)).returning({ id: routines.id });
        if (!updated.length) return false;
        await tx.delete(routineExercises).where(eq(routineExercises.routineId, id));
        if (parsed.data.exercises.length)
          await tx.insert(routineExercises).values(parsed.data.exercises.map((e, position) => ({ routineId: id, position, ...e }) as typeof routineExercises.$inferInsert));
        return true;
      });
      return ok ? c.json({ ok: true }) : c.json({ error: 'That day was not found.' }, 404);
    } catch (err) {
      if (isMissingExercise(err)) return c.json({ error: 'One of those exercises was not found.' }, 400);
      throw err;
    }
  });

  r.delete('/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: 'That day was not found.' }, 404);
    const deleted = await asUser(c.get('profileId'), (tx) => tx.delete(routines).where(eq(routines.id, id)).returning({ id: routines.id }));
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That day was not found.' }, 404);
  });

  return r;
}
