-- Schema v31: food search uses an index, signing in doesn't scan every session,
-- and nutrients can't be negative.

-- Search is "name or brand contains the words" (ilike '%q%'), which a plain
-- index can't help; trigram indexes can.
create extension if not exists pg_trgm;
create index if not exists foods_name_trgm_idx on foods using gin (name gin_trgm_ops);
create index if not exists foods_brand_trgm_idx on foods using gin (brand gin_trgm_ops) where brand is not null;

-- Every sign-in clears expired sessions (auth_create_session).
create index if not exists sessions_expires_idx on sessions (expires_at);

-- kcal and macros were already checked; a negative fiber or sodium would
-- subtract from a day's totals. Any already there become "unknown".
update foods set fiber = null where fiber < 0;
update foods set sugar = null where sugar < 0;
update foods set sodium_mg = null where sodium_mg < 0;
alter table foods
  add constraint foods_fiber_nonneg check (fiber >= 0),
  add constraint foods_sugar_nonneg check (sugar >= 0),
  add constraint foods_sodium_nonneg check (sodium_mg >= 0);
