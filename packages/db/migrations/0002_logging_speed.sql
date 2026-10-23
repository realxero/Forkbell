-- Schema v2: faster logging.
--   * foods.barcode: scanned codes for your own foods and saved products.
--   * foods.portions: named amounts like "1 large egg = 50 g".
--   * source 'builtin': common foods everyone can read. The migrator keeps
--     them up to date from packages/db/src/builtin-foods.ts after migrations.

alter table foods add column barcode text;
alter table foods add column portions jsonb;
alter table foods add constraint foods_portions_array check (portions is null or jsonb_typeof(portions) = 'array');

alter table foods drop constraint foods_source_check;
alter table foods add constraint foods_source_check check (source in ('custom', 'off', 'usda', 'builtin'));
-- Built-in foods have no owner; your own foods always do.
alter table foods add constraint foods_builtin_unowned check ((source = 'builtin') = (owner_id is null));

-- Saved Open Food Facts products are keyed by their barcode already. FORCE
-- row-level security would hide every row from a non-superuser admin, so it
-- is lifted for this one statement.
alter table foods no force row level security;
update foods set barcode = source_id where source = 'off' and barcode is null;
alter table foods force row level security;

create index foods_owner_barcode_idx on foods(owner_id, barcode) where barcode is not null;
create unique index foods_builtin_key_idx on foods(source_id) where source = 'builtin';

-- Recent and frequent foods read the diary by user and time.
create index diary_user_created_idx on diary_entries(user_id, created_at desc);
