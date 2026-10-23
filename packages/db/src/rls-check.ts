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

async function as<T>(userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>, profileId?: string) {
  return app.begin(async (tx) => {
    if (userId) await tx`select set_config('app.user_id', ${userId}, true)`;
    if (profileId) await tx`select set_config('app.profile_id', ${profileId}, true)`;
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
  await as(alice, (tx) => tx`insert into day_status (date) values ('2026-10-22')`);
  assert.equal((await as(bob, (tx) => tx`select * from day_status`)).length, 0, "Bob can't see Alice's finished days");
  await assert.rejects(as(bob, (tx) => tx`insert into day_status (user_id, date) values (${alice}, '2026-10-21')`), "Bob can't finish a day for Alice");

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

  // Copying "yesterday" as Bob must not copy Alice's entries into his diary.
  const copied = await as(bob, (tx) => tx`insert into diary_entries (date, meal, food_id, grams) select '2026-10-23', meal, food_id, grams from diary_entries where date = '2026-10-22' returning id`);
  assert.equal(copied.length, 0, "copying a day only copies your own entries");

  // Built-in foods: everyone reads them, nobody using the app can change them.
  const builtins = await as(bob, (tx) => tx`select id from foods where source = 'builtin'`);
  if (builtins.length) {
    assert.equal((await as(bob, (tx) => tx`update foods set kcal = 1 where source = 'builtin' returning id`)).length, 0, "Bob can't edit built-in foods");
    assert.equal((await as(bob, (tx) => tx`delete from foods where source = 'builtin' returning id`)).length, 0, "Bob can't delete built-in foods");
    await assert.rejects(as(bob, (tx) => tx`insert into foods (owner_id, name, source, source_id, kcal, protein, carbs, fat) values (null, 'Fake', 'builtin', ${tag}, 1, 0, 0, 0)`), "Bob can't add built-in foods");
  } else {
    console.warn('No built-in foods found; run the migrator first to check them.');
  }

  // Training: Alice's custom exercise, program, routine and workout.
  const t = await as(alice, async (tx) => {
    const [ex] = await tx`insert into exercises (owner_id, source, name, muscle, equipment, kind) values (${alice}, 'custom', 'Alice press', 'chest', 'machine', 'weight') returning id`;
    const [prog] = await tx`insert into programs (name, active) values ('Alice plan', true) returning id`;
    const [rt] = await tx`insert into routines (program_id, name, position) values (${prog!.id}, 'Day A', 0) returning id`;
    await tx`insert into routine_exercises (routine_id, exercise_id, position, sets, rep_min, rep_max, rest_seconds) values (${rt!.id}, ${ex!.id}, 0, 3, 8, 12, 90)`;
    const [w] = await tx`insert into workouts (date, name, routine_id) values ('2026-10-22', 'Day A', ${rt!.id}) returning id`;
    const [we] = await tx`insert into workout_exercises (workout_id, exercise_id, position, rest_seconds) values (${w!.id}, ${ex!.id}, 0, 90) returning id`;
    await tx`insert into workout_sets (workout_exercise_id, position, weight_kg, reps, done) values (${we!.id}, 0, 60, 10, true)`;
    return { ex: ex!.id as string, routine: rt!.id as string, workout: w!.id as string, we: we!.id as string };
  });
  for (const table of ['programs', 'routines', 'routine_exercises', 'workouts', 'workout_exercises', 'workout_sets']) {
    assert.equal((await as(bob, (tx) => tx`select * from ${tx(table)}`)).length, 0, `Bob can't read Alice's ${table}`);
    assert.equal((await as(bob, (tx) => tx`delete from ${tx(table)} returning 1`)).length, 0, `Bob can't delete Alice's ${table}`);
  }
  assert.equal((await as(bob, (tx) => tx`select * from exercises where owner_id is not null`)).length, 0, "Bob can't see Alice's exercises");
  // Guessed ids still get nowhere: the parent must be yours, and so must a custom exercise.
  await assert.rejects(as(bob, (tx) => tx`insert into workout_exercises (workout_id, exercise_id, position, rest_seconds) select ${t.workout}, id, 0, 90 from exercises where source = 'builtin' limit 1`), "Bob can't add to Alice's workout");
  await assert.rejects(as(bob, (tx) => tx`insert into workout_sets (workout_exercise_id, position, reps) values (${t.we}, 1, 5)`), "Bob can't add sets to Alice's workout");
  await assert.rejects(as(bob, (tx) => tx`insert into workouts (date, name, routine_id) values ('2026-10-22', 'x', ${t.routine})`), "Bob can't link Alice's routine");
  await assert.rejects(
    as(bob, async (tx) => {
      const [w] = await tx`insert into workouts (date, name) values ('2026-10-22', 'Bob day') returning id`;
      await tx`insert into workout_exercises (workout_id, exercise_id, position, rest_seconds) values (${w!.id}, ${t.ex}, 0, 90)`;
    }),
    "Bob can't use Alice's custom exercise",
  );

  // Progress: weigh-ins and measurements are private too.
  await as(alice, async (tx) => {
    await tx`insert into weigh_ins (date, weight_kg) values ('2026-10-22', 80)`;
    await tx`insert into measurements (date, kind, value) values ('2026-10-22', 'waist', 84)`;
  });
  for (const table of ['weigh_ins', 'measurements']) {
    assert.equal((await as(bob, (tx) => tx`select * from ${tx(table)}`)).length, 0, `Bob can't read Alice's ${table}`);
    assert.equal((await as(bob, (tx) => tx`update ${tx(table)} set date = '2026-01-01' returning 1`)).length, 0, `Bob can't edit Alice's ${table}`);
  }
  await assert.rejects(as(bob, (tx) => tx`insert into weigh_ins (user_id, date, weight_kg) values (${alice}, '2026-10-23', 90)`), "Bob can't weigh in as Alice");

  // Health data from the phone is private too.
  await as(alice, (tx) => tx`insert into health_daily (date, kind, value, source) values ('2026-10-22', 'steps', 9000, 'apple_health')`);
  assert.equal((await as(bob, (tx) => tx`select * from health_daily`)).length, 0, "Bob can't read Alice's health data");
  await assert.rejects(as(bob, (tx) => tx`insert into health_daily (user_id, date, kind, value, source) values (${alice}, '2026-10-22', 'steps', 1, 'apple_health')`), "Bob can't write Alice's health data");

  // Family sharing. Bob looks at Alice's data (profile = Alice) before and after she shares.
  const asBobViewingAlice = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => as(bob, fn, alice);
  await as(alice, (tx) => tx`insert into check_ins (date, mood) values ('2026-10-22', 4)`);
  assert.equal((await asBobViewingAlice((tx) => tx`select * from diary_entries`)).length, 0, 'no share: nothing of Alice is visible');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from users where id = ${alice}`)).length, 0, 'no share: not even her name');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from day_status`)).length, 0, 'no share: not her finished days');
  await assert.rejects(as(bob, (tx) => tx`insert into shares (owner_id, grantee_id, permissions) values (${alice}, ${bob}, '{food_read}')`), 'Bob cannot grant himself a share');

  await as(alice, (tx) => tx`insert into share_invites (code_hash, permissions, expires_at) values (${`${tag}-h1`}, '{food_read,progress_read}', now() + interval '1 day')`);
  await as(bob, (tx) => tx`select accept_share_invite(${`${tag}-h1`})`);
  await assert.rejects(as(bob, (tx) => tx`select accept_share_invite(${`${tag}-h1`})`), 'an invite works once');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from diary_entries`)).length, 1, 'shared food: Bob sees her diary');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from foods where owner_id is not null`)).length, 1, 'and her foods');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from weigh_ins`)).length, 1, 'shared progress: her weigh-ins');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from workouts`)).length, 0, 'training was not shared');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from check_ins`)).length, 0, 'wellbeing was not shared');
  assert.equal((await asBobViewingAlice((tx) => tx`update weigh_ins set weight_kg = 1 returning id`)).length, 0, 'shared progress is read-only');
  await assert.rejects(asBobViewingAlice((tx) => tx`insert into diary_entries (date, meal, food_id, grams) values ('2026-10-22', 'lunch', ${aliceFood}, 5)`), 'food_read does not allow logging');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from day_status`)).length, 1, 'shared food: her finished days');
  await assert.rejects(asBobViewingAlice((tx) => tx`insert into day_status (date) values ('2026-10-23')`), 'food_read does not allow finishing her day');
  assert.equal((await as(bob, (tx) => tx`select * from diary_entries`)).length, 0, "viewing himself, Bob doesn't get Alice's rows mixed in");
  const carol = (await app`select auth_upsert_user(${tag}, 'carol', null, 'Carol') as id`)[0]!.id as string;
  assert.equal((await as(carol, (tx) => tx`select * from diary_entries`, alice)).length, 0, "Carol wasn't invited");

  // Logging for someone: food_write.
  await as(alice, (tx) => tx`update shares set permissions = '{food_read,food_write}' where grantee_id = ${bob}`);
  await asBobViewingAlice((tx) => tx`insert into diary_entries (date, meal, food_id, grams) values ('2026-10-22', 'snacks', ${aliceFood}, 20)`);
  assert.equal((await as(alice, (tx) => tx`select * from diary_entries`)).length, 2, "Bob's entry is in Alice's diary");
  await asBobViewingAlice((tx) => tx`insert into day_status (date) values ('2026-10-23')`);
  assert.equal((await as(alice, (tx) => tx`select * from day_status`)).length, 2, 'food_write: Bob can finish her day');
  assert.equal((await asBobViewingAlice((tx) => tx`select * from weigh_ins`)).length, 0, 'progress was taken off the share');

  // Bob leaves; nothing is visible again.
  await as(bob, (tx) => tx`delete from shares where owner_id = ${alice}`);
  assert.equal((await asBobViewingAlice((tx) => tx`select * from diary_entries`)).length, 0, 'after the share ends, nothing');

  // Alice still sees her own data.
  assert.equal((await as(alice, (tx) => tx`select * from diary_entries`)).length, 2, 'Alice sees her entries');
  assert.equal((await as(alice, (tx) => tx`select * from workout_sets`)).length, 1, 'Alice sees her sets');
  console.log('Row-level security: all checks passed.');
} finally {
  await admin`delete from users where oidc_issuer = ${tag}`;
  await Promise.all([admin.end(), app.end()]);
}
