// Proves row-level security works against a real database:
//   DATABASE_ADMIN_URL=... DATABASE_URL=... pnpm --filter @forkbell/db rls-check
// Creates two throwaway users, gives each a diary entry, then checks — as the
// limited app role — that neither can see, change or delete the other's data,
// even with queries that "forget" to filter by user.
import postgres from 'postgres';
import assert from 'node:assert/strict';

const admin = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1, onnotice: () => {} });
const app = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const tag = `rls-check-${Date.now()}`;

async function as<T>(userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return app.begin(async (tx) => {
    if (userId) await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

try {
  const alice = (await app`select auth_upsert_user(${tag}, 'alice', null, 'Alice') as id`)[0]!.id as string;
  const bob = (await app`select auth_upsert_user(${tag}, 'bob', null, 'Bob') as id`)[0]!.id as string;

  const aliceFood = await as(alice, async (tx) => {
    const [f] = await tx`insert into foods (owner_id, name, source, kcal, protein, carbs, fat) values (${alice}, 'Alice oats', 'custom', 380, 13, 67, 7) returning id`;
    await tx`insert into diary_entries (date, meal, food_id, grams) values ('2026-10-22', 'breakfast', ${f!.id}, 50)`;
    return f!.id as string;
  });

  // No user set: nothing visible, nothing writable.
  assert.equal((await as(null, (tx) => tx`select * from diary_entries`)).length, 0, 'anonymous sees no diary rows');
  await assert.rejects(as(null, (tx) => tx`insert into diary_entries (date, meal, food_id, grams) values ('2026-10-22', 'lunch', ${aliceFood}, 1)`), 'anonymous cannot write');

  // Bob, with deliberately unfiltered queries.
  assert.equal((await as(bob, (tx) => tx`select * from diary_entries`)).length, 0, "Bob can't read Alice's diary");
  assert.equal((await as(bob, (tx) => tx`select * from foods where owner_id is not null`)).length, 0, "Bob can't read Alice's foods");
  assert.equal((await as(bob, (tx) => tx`select * from users`)).length, 1, 'Bob only sees himself');
  assert.equal((await as(bob, (tx) => tx`update diary_entries set grams = 999 returning id`)).length, 0, "Bob can't edit Alice's diary");
  assert.equal((await as(bob, (tx) => tx`delete from diary_entries returning id`)).length, 0, "Bob can't delete Alice's diary");
  await assert.rejects(as(bob, (tx) => tx`insert into diary_entries (user_id, date, meal, food_id, grams) values (${alice}, '2026-10-22', 'lunch', ${aliceFood}, 1)`), "Bob can't write into Alice's diary");
  await assert.rejects(as(bob, (tx) => tx`select * from sessions`), 'the app role cannot read sessions at all');

  // Alice still sees her own data.
  assert.equal((await as(alice, (tx) => tx`select * from diary_entries`)).length, 1, 'Alice sees her entry');
  console.log('Row-level security: all checks passed.');
} finally {
  await admin`delete from users where oidc_issuer = ${tag}`;
  await Promise.all([admin.end(), app.end()]);
}
