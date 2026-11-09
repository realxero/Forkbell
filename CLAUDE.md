# Forkbell: notes for coding agents

Food and training logged in one place, on a server the user owns. Read
`README.md` for the feature set and setup, `ROADMAP.md` for scope, and
`apps/app/PRODUCT.md` + `apps/app/DESIGN.md` before any UI change.

## Layout
- `apps/app`: Expo client (iOS first, plus Android and web from one codebase).
- `apps/server`: Hono API on Node 24, serves the web build too.
- `packages/shared`: logic and zod schemas used by both (most tests live here).
- `packages/db`: Drizzle schema, SQL migrations, built-in foods and exercises.
- `e2e`: monkey test, API test harness, iPhone screenshot flows.

## Commands
pnpm comes from corepack (`corepack pnpm …` if `pnpm` isn't on PATH).

    pnpm typecheck        # every package
    pnpm test             # shared + db unit tests (no database needed)
    pnpm migrate          # needs DATABASE_ADMIN_URL, DATABASE_URL, APP_DB_PASSWORD
    cd apps/app && CI=1 npx expo export --platform web --output-dir dist

API tests and the monkey test need Postgres; see `e2e/README.md` and
`.github/workflows/ci.yml` for the exact environment.

## Rules that are easy to break
- **Privacy is enforced by Postgres row-level security.** Every query for a
  user goes through `asUser(...)` (`packages/db/src/index.ts`); new tables need RLS policies, and
  `pnpm --filter @forkbell/db rls-check` must pass.
- **Offline-first:** every logging flow works with no connection (outbox in
  `packages/shared/src/outbox.ts`). Bell (the AI) is optional; the app must be
  complete without it.
- **Colour means something** (DESIGN.md): plate colours only for their macro
  (blue protein, yellow carbs, green fat, red over); a screen's main action is
  iron, not the accent; completion is iron, never green. No raw hex in
  screens: go through `color` in `apps/app/lib/theme.ts`.
- Sizes from `textSize`/`type`, corners from `radius`, 44 pt tap targets
  (`buttons.link` for text links), `useReduceMotion()` for anything that moves.
- Never judge food (no good/bad language); never write on the user's behalf
  without a review step.
- Copy is plain and short, in the product's own voice.

## Git
- Work on the long-lived `dev` branch; PRs go `dev` → `main`.
- After a merge, bring `dev` back in line: `git merge --ff-only origin/main`
  for a merge commit; a squash merge needs `git diff dev origin/main` first.
