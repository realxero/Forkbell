import { Hono } from 'hono';
import { exerciseLibrary } from '@forkbell/db';
import type { Stretch } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';

const list: Stretch[] = exerciseLibrary.stretches.map((s) => ({
  key: s.key,
  name: s.name,
  kind: s.kind,
  muscles: s.muscles,
  equipment: s.equipment,
  sides: s.sides,
  level: s.level,
  steps: s.steps,
  howToRef: s.ref,
  pictures: s.images,
}));

/** Warm-ups, stretches and foam rolling, with pictures. The same for everyone. */
export function stretchRoutes() {
  const r = new Hono<AppEnv>();
  r.get('/', (c) => c.json({ stretches: list, credit: 'Steps and pictures: Free Exercise DB (public domain)' }));
  return r;
}
