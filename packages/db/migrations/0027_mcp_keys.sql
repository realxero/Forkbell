-- Schema v27: keys for AI apps (Claude Desktop and others, over the Model
-- Context Protocol at /mcp), kept with the Shortcut keys. Same rules: a key
-- is a sign-in session that works in one place only, here /mcp, and reads
-- your data; it logs food and water only if you allowed that when you made it.
alter table shortcut_keys add column kind text not null default 'shortcuts' check (kind in ('shortcuts', 'mcp'));
alter table shortcut_keys add column can_write boolean not null default false;
