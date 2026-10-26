import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Who is signed in for the request being handled (set once by the server's auth middleware). */
const requestUser = new AsyncLocalStorage<{ userId: string }>();
export const withRequestUser = <T>(userId: string, fn: () => T) => requestUser.run({ userId }, fn);

export { schema };
export * from './schema.ts';

/** "2026-10-21 00:10:00.123456+00" → "2026-10-21T00:10:00.123+00:00" (milliseconds, like JavaScript). */
export const isoTimestamp = (v: string) => v.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)$/, '$1:00');

export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  // Times with a time zone come out of Postgres as "2026-10-21 00:10:00+00".
  // Phones (Hermes) can't read that, so a workout's clock showed NaN:NaN and
  // times sent back were refused. Send them on as ISO 8601 instead:
  // "2026-10-21T00:10:00+00:00", which every JavaScript engine reads.
  client.options.parsers[1184] = isoTimestamp;

  /**
   * Run fn inside a transaction where Postgres knows who the user is. Every
   * query on user data must go through here: row-level security returns
   * nothing (and refuses writes) outside it.
   */
  /**
   * profileId is whose data to read or write: yours, or someone who shared
   * with you. The signed-in person comes from the request; Postgres checks the
   * share on every row.
   */
  async function asUser<T>(profileId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const userId = requestUser.getStore()?.userId ?? profileId;
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.profile_id', ${profileId}, true)`);
      return fn(tx);
    });
  }

  return { db, client, asUser };
}

export type Database = ReturnType<typeof connect>['db'];
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export { exerciseLibrary, howToImages, type HowTo } from './exercise-library.ts';
