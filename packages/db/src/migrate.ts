// One-shot migrator. Runs as the Postgres admin (DATABASE_ADMIN_URL), makes
// sure the limited forkbell_app role exists with APP_DB_PASSWORD, then applies
// any migrations/*.sql that haven't run yet, each in its own transaction.
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!adminUrl || !appPassword) {
  console.error('Set DATABASE_ADMIN_URL and APP_DB_PASSWORD.');
  process.exit(1);
}

const dir = process.env.MIGRATIONS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });

try {
  const [role] = await sql`select 1 from pg_roles where rolname = 'forkbell_app'`;
  if (!role) await sql.unsafe('create role forkbell_app login nosuperuser nocreatedb nocreaterole nobypassrls');
  // ALTER ROLE can't take a bind parameter; quote the literal safely.
  await sql.unsafe(`alter role forkbell_app with password ${quoteLiteral(appPassword)}`);

  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log('database is up to date');
} finally {
  await sql.end();
}

function quoteLiteral(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}
