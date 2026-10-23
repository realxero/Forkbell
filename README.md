# Forkbell

Food and training, logged in one place on your own server. Web, iPhone and
Android from one codebase, with Postgres row-level security and sign-in through
Authelia (or any OpenID Connect provider).

**Status:** phase 2. Sign in, search foods (Open Food Facts, USDA, about a
hundred built-in common foods, your own), scan barcodes, log with one tap from
recent and most-logged foods, copy meals from the day before, edit entries, set
daily goals, and see calories and macros against them. See
[ROADMAP.md](ROADMAP.md) for what comes next.

## How it fits together

```
apps/app        Expo + Expo Router (TypeScript): iOS, Android and web
apps/server     Hono API on Node: sign-in, diary, food search
packages/shared Types, validation and nutrition math used by both
packages/db     Postgres schema, migrations (with RLS policies), migrator
```

## Security model

- **Row-level security.** The server connects as `forkbell_app`, a role that
  cannot bypass RLS. Each request runs in a transaction that tells Postgres who
  is signed in, and the policies in `packages/db/migrations` only let that user
  read or change their own rows. A query that forgets to filter by user still
  can't leak anyone else's data. `pnpm --filter @forkbell/db rls-check` proves
  it against a real database, and CI runs it on every push.
- **No passwords.** Sign-in is OIDC with PKCE. Authelia handles two-factor and
  passkeys.
- **Sessions** are random tokens; only an HMAC of each is stored, in a table the
  app role can't read. The web app uses an httpOnly cookie; the phone app keeps
  its token in the iOS Keychain / Android Keystore via SecureStore.
- **Admin credentials** are only given to the one-shot `migrate` container.

## Self-hosting

1. In Authelia, add the client from `docker/authelia-client.yml`, with your
   real address in `redirect_uris`.
2. `cp .env.example .env` and fill in the top sections.
3. `docker compose up -d --build`
4. Point your reverse proxy at port 3000 and open `PUBLIC_URL`.

Back up `./data/postgres` (or use `pg_dump`).

Updating: pull, rebuild the image, and redeploy. The `migrate` container
upgrades the database and refreshes the built-in foods before the server
starts.

Barcode scanning in the web app needs the camera, which browsers only allow on
an `https://` address (or `localhost`).

## Development

Needs Node 22+ and pnpm (`corepack enable`).

```sh
pnpm install
docker run -d --name forkbell-db -p 5432:5432 \
  -e POSTGRES_DB=forkbell -e POSTGRES_USER=forkbell_admin -e POSTGRES_PASSWORD=change-me-admin \
  postgres:18-alpine
cp .env.example .env        # uncomment the development block
echo "EXPO_PUBLIC_API_URL=http://localhost:3000" > apps/app/.env
pnpm migrate
pnpm dev:server             # API on :3000
pnpm dev:app                # Expo: press w for web, or scan with Expo Go
```

Add `http://localhost:3000/auth/callback` as a second redirect URI on the
Authelia client while developing. On a phone, set `PUBLIC_URL` and the server
address in the app to your computer's LAN address instead of localhost.

Checks: `pnpm typecheck`, `pnpm test`, and `pnpm --filter @forkbell/db rls-check`.

## iPhone builds

Actions, then *iOS IPA*, then *Run workflow*. It builds an unsigned IPA for
SideStore or LiveContainer and attaches it to a release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Forkbell is an original codebase. Its feature ideas were inspired by
[NutriTrace and LiftTrace](https://github.com/TraceApps) by TraceApps and by
[SparkyFitness](https://github.com/CodeWithCJ/SparkyFitness) by CodeWithCJ; it
contains no code from either. Food data comes from
[Open Food Facts](https://openfoodfacts.org) (ODbL) and
[USDA FoodData Central](https://fdc.nal.usda.gov) (public domain), which the
built-in common foods are also based on. Barcodes are read in the browser with
[ZXing](https://github.com/zxing-js/library) (Apache 2.0).

## Licence

Copyright © 2026 Nate (realxero). Forkbell is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). For any noncommercial
purpose, such as self-hosting it for yourself or your family, you may use it,
change it, and share it or your changed version, as long as you pass on the
licence and its `Required Notice` line. Commercial use needs written
permission. Ask by opening an issue.

Forkbell is not open source. The copyright holder may also offer it under other
terms, including in app stores and as a paid service.
