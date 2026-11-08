-- Schema v29: each person's time zone ("America/New_York"), as their phone
-- reports it. The server runs on its own clock (often UTC), so anything that
-- works out "today" without the phone saying so - AI apps over MCP, Shortcuts,
-- training tips - uses this instead. Null until the app first reports it.
alter table users add column time_zone text check (length(time_zone) <= 64);
grant update (time_zone) on users to forkbell_app;
