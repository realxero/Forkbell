import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

export { schema };
export * from './schema.ts';

export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });

  /**
   * Run fn inside a transaction where Postgres knows who the user is. Every
   * query on user data must go through here: row-level security returns
   * nothing (and refuses writes) outside it.
   */
  async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return fn(tx);
    });
  }

  return { db, client, asUser };
}

export type Database = ReturnType<typeof connect>['db'];
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
