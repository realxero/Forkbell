-- Schema v5: Apple Health and Health Connect.
--   health_daily  one number per day per kind per source (steps, active calories...)
--   weigh_ins     now remember where a weight came from; one you typed in
--                 always wins over an imported one for the same day

alter table weigh_ins add column source text not null default 'manual'
  check (source in ('manual', 'apple_health', 'health_connect'));

create table health_daily (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  kind       text not null check (kind in ('steps', 'active_kcal', 'resting_kcal', 'resting_hr')),
  value      numeric(10,1) not null check (value >= 0 and value < 1000000),
  source     text not null check (source in ('apple_health', 'health_connect')),
  updated_at timestamptz not null default now(),
  unique (user_id, date, kind, source)
);

alter table health_daily enable row level security;
alter table health_daily force row level security;
create policy health_daily_own on health_daily for all using (user_id = app_user_id()) with check (user_id = app_user_id());
grant select, insert, update, delete on health_daily to forkbell_app;
