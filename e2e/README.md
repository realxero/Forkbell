# Forkbell tests that need a running server

## API regression tests (`apps/server/test`)

Real requests against a real server and database. They pin down things that
broke before: every API path the app calls must exist on the server, unknown
paths answer in JSON (not the web page), medication times survive an older
app, exports never include secrets or anyone else's data, Shortcut keys can't
reach the rest of the account.

    pnpm migrate
    DATABASE_ADMIN_URL=... DATABASE_URL=... pnpm --filter @forkbell/server test:api

## Monkey test (`e2e/monkey.mjs`)

A phone-sized, signed-in browser visits every screen of the web app and taps,
types and scrolls at random. Crashes, console errors, server 5xx and missing
screens fail the run. `MONKEY_SEED` replays a run exactly; `monkey-report.json`
has the details.

    cd e2e && npm install && npx playwright install chromium
    BASE_URL=http://localhost:3999 SESSION_SECRET=... DATABASE_ADMIN_URL=... npm run monkey

Both run in CI on every push (.github/workflows/ci.yml). The logic itself also
has random-input tests (`packages/shared/src/fuzz.test.ts`, part of `pnpm test`;
`FUZZ_SEED` replays one).
