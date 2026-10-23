-- Schema v12: how to do each exercise, and a much bigger library.
--
-- Built-in exercises get step-by-step instructions and demonstration pictures
-- from Free Exercise DB (public domain). The pictures stay on the internet:
-- the server fetches one the first time it's needed and keeps a copy. The
-- extra ~700 exercises are marked `library` so the picker can keep your usual
-- list short and still find everything when you search.

alter table exercises
  add column library           boolean not null default false,
  add column how_to_ref        text,
  add column level             text,
  add column secondary_muscles text[] not null default '{}',
  add column steps             text[] not null default '{}',
  add column image_count       integer not null default 0;
