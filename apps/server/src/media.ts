// Exercise pictures, from Free Exercise DB (public domain). The server fetches
// a picture the first time anyone needs it, from the one version of the
// dataset the steps came from, and keeps a copy on disk. Only pictures listed
// in the library can be fetched, so this can't be pointed anywhere else.
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { exerciseLibrary, howToImages } from '@forkbell/db';

// Set MEDIA_DIR to a mounted folder to keep the copies across updates.
const kept = Boolean(process.env.MEDIA_DIR);
const dir = process.env.MEDIA_DIR || path.join(tmpdir(), 'forkbell-media');
const upstream = (ref: string, n: number) =>
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${exerciseLibrary.commit}/exercises/${encodeURIComponent(ref)}/${n}.jpg`;

/** In-flight downloads, so ten people opening the same exercise make one request. */
const pending = new Map<string, Promise<Buffer | null>>();

async function picture(ref: string, n: number): Promise<Buffer | null> {
  const file = path.join(dir, `${ref}-${n}.jpg`);
  try {
    return await readFile(file);
  } catch {
    /* not kept yet */
  }
  const key = `${ref}/${n}`;
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      const res = await fetch(upstream(ref, n), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > 2_000_000) return null;
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, file);
      return body;
    })().finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

/**
 * With MEDIA_DIR set (copies that last), fetch every picture once in the
 * background, a few at a time, so no one waits on a first view. Pictures
 * already kept are skipped, so this is quick after the first run.
 */
export async function prefetchPictures() {
  if (!kept || process.env.PREFETCH_PICTURES === 'off') return;
  const todo = [...howToImages.entries()].flatMap(([ref, count]) => Array.from({ length: count }, (_, n) => [ref, n] as const));
  let fetched = 0;
  let failed = 0;
  const missing: (readonly [string, number])[] = [];
  for (const [ref, n] of todo) {
    try {
      await access(path.join(dir, `${ref}-${n}.jpg`));
    } catch {
      missing.push([ref, n]);
    }
  }
  if (!missing.length) return;
  console.log(`exercise pictures: fetching ${missing.length} in the background`);
  const worker = async () => {
    for (let job = missing.shift(); job; job = missing.shift()) {
      const ok = await picture(job[0], job[1]).catch(() => null);
      if (ok) fetched++;
      else failed++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log(`exercise pictures: ${fetched} fetched${failed ? `, ${failed} couldn't be (they'll be tried again when needed)` : ''}`);
}

export function mediaRoutes() {
  const r = new Hono();
  // Public on purpose: these are public-domain pictures, and phones load them like any image.
  r.get('/exercise/:ref/:file', async (c) => {
    const ref = c.req.param('ref');
    const m = /^(\d)\.jpg$/.exec(c.req.param('file'));
    const count = howToImages.get(ref);
    if (!m || count === undefined || Number(m[1]) >= count) return c.json({ error: 'No such picture.' }, 404);
    const body = await picture(ref, Number(m[1])).catch(() => null);
    if (!body) return c.json({ error: 'That picture couldn’t be fetched right now.' }, 502);
    return c.body(new Uint8Array(body), 200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' });
  });
  return r;
}
