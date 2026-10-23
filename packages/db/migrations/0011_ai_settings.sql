-- Schema v11: your own AI provider and key for Bell, set in the app.
-- The key is encrypted by the server (AES-256-GCM, from SESSION_SECRET)
-- before it is stored, and is never sent back to the app. Never shared: not
-- even someone you share your diary with can see or use it.
create table ai_settings (
  user_id        uuid primary key default app_user_id() references users(id) on delete cascade,
  provider       text not null check (provider in ('gemini', 'anthropic', 'openai', 'custom')),
  model          text not null check (length(model) between 1 and 120),
  base_url       text check (length(base_url) <= 300),
  key_ciphertext text check (length(key_ciphertext) <= 2000),
  key_hint       text check (length(key_hint) <= 12),
  updated_at     timestamptz not null default now()
);
alter table ai_settings enable row level security;
alter table ai_settings force row level security;
create policy ai_settings_own on ai_settings for all
  using (user_id = app_user_id() and is_self())
  with check (user_id = app_user_id() and is_self());
grant select, insert, update, delete on ai_settings to forkbell_app;
