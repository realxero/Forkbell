-- Schema v18: progress photos.
--
-- Kept in the database itself, so the nightly backup (pg_dump) has them with
-- everything else. Only ever yours: unlike the diary or check-ins, nobody you
-- share with can see them, not even family with every permission. Bell never
-- reads them.
create table progress_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  pose       text not null check (pose in ('front', 'side', 'back')),
  image      bytea not null check (octet_length(image) between 100 and 4000000),
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now()
);
create index progress_photos_user_date_idx on progress_photos(user_id, date);

alter table progress_photos enable row level security;
alter table progress_photos force row level security;
create policy progress_photos_own on progress_photos for all
  using (user_id = app_user_id() and is_self())
  with check (user_id = app_user_id() and is_self());
grant select, insert, update, delete on progress_photos to forkbell_app;
