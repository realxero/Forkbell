// Progress photos: front, side and back, kept in your own database (so the
// nightly backup has them) and only ever shown to you. They're always read as
// you, never as someone who shared with you, and row-level security refuses
// anyone else, family included. Bell never sees them.
import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { progressPhotos, type connect } from '@forkbell/db';
import { dateSchema, POSES, type ProgressPhoto } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';

const MAX_BYTES = 4_000_000;
const uploadSchema = z.object({
  date: dateSchema,
  pose: z.enum(POSES),
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Send the photo as a JPEG, PNG or WebP image.')
    .max(Math.ceil((MAX_BYTES * 4) / 3) + 40, 'That photo is too big. Try a smaller one.'),
});
const isId = (v: string) => z.string().uuid().safeParse(v).success;

export function photoRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const rows = await asUser(c.get('userId'), (tx) =>
      tx.select({ id: progressPhotos.id, date: progressPhotos.date, pose: progressPhotos.pose, createdAt: progressPhotos.createdAt }).from(progressPhotos).orderBy(asc(progressPhotos.date), asc(progressPhotos.createdAt)),
    );
    return c.json({ photos: rows as ProgressPhoto[] });
  });

  r.post('/', async (c) => {
    const p = uploadSchema.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? 'Send a photo.' }, 400);
    const [, mime, b64] = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(p.data.image)!;
    const bytes = Buffer.from(b64!, 'base64');
    if (bytes.length < 100) return c.json({ error: 'That photo is empty.' }, 400);
    if (bytes.length > MAX_BYTES) return c.json({ error: 'That photo is too big. Try a smaller one.' }, 400);
    const rows = (await asUser(c.get('userId'), (tx) =>
      tx.execute(sql`insert into progress_photos (date, pose, image, mime) values (${p.data.date}, ${p.data.pose}, ${bytes}, ${mime}) returning id, date::text, pose, created_at as "createdAt"`),
    )) as unknown as ProgressPhoto[];
    return c.json({ photo: rows[0] }, 201);
  });

  r.get('/:id/image', async (c) => {
    if (!isId(c.req.param('id'))) return c.json({ error: 'Not found.' }, 404);
    const rows = (await asUser(c.get('userId'), (tx) => tx.execute(sql`select image, mime from progress_photos where id = ${c.req.param('id')}`))) as unknown as { image: Buffer; mime: string }[];
    if (!rows[0]) return c.json({ error: 'Not found.' }, 404);
    // A photo never changes (a new one gets a new id), so the phone can keep it.
    return new Response(new Uint8Array(rows[0].image), { headers: { 'content-type': rows[0].mime, 'cache-control': 'private, max-age=31536000, immutable' } });
  });

  r.delete('/:id', async (c) => {
    if (!isId(c.req.param('id'))) return c.json({ error: 'Not found.' }, 404);
    const gone = await asUser(c.get('userId'), (tx) => tx.delete(progressPhotos).where(eq(progressPhotos.id, c.req.param('id'))).returning({ id: progressPhotos.id }));
    return gone.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  return r;
}
