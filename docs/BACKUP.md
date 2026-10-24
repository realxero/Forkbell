# Backups

Two kinds, for two jobs:

- **The nightly database backup** (below) keeps the whole server: everyone's
  data, settings and sign-ins. It's what you restore after a broken disk or a
  bad update.
- **Export in the app** (Settings → Export and backup) gives you your own data as
  JSON, and your diary and workouts as CSV. That's for keeping a copy, a
  spreadsheet, or moving to another app.

## Turn on the nightly backup

Add the `backup` service from `docker-compose.yml` to your stack (in Dockge,
paste it into the stack's compose file next to `db`) and redeploy. It uses the
same `POSTGRES_PASSWORD` as the database, runs `pg_dump` once when it starts and
then every 24 hours, and writes files like `forkbell-2026-10-24_0300.dump` into
`./data/backups` next to the stack. Copies older than `BACKUP_KEEP_DAYS` (14 by
default) are removed.

Check it worked:

    docker compose logs backup

You should see `backup: saved /backups/forkbell-….dump`. A backup on the same
disk as the database doesn't survive that disk, so also copy the folder
somewhere else: a snapshot and replication task in TrueNAS, or any sync tool.

The exercise pictures in `MEDIA_DIR` don't need backing up; the server fetches
them again by itself.

## Restore one

1. Stop the server so nothing writes while you restore:

       docker compose stop server

2. Restore the file you want (this replaces what's in the database now):

       docker compose exec -T db pg_restore -U forkbell_admin -d forkbell --clean --if-exists --no-owner < data/backups/forkbell-2026-10-24_0300.dump

3. Run the migrator (in case the backup is older than your Forkbell version)
   and start the server:

       docker compose up -d migrate server

Try a restore on a spare copy once, so you know it works before you need it.
