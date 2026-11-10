## What changed


## How it was checked
- [ ] `pnpm typecheck` and `pnpm test`
- [ ] API tests, if the server changed (`node --test --test-concurrency=1 test/*.test.ts` in `apps/server`)
- [ ] Tried it in the app, if the UI changed (iPhone or web)

## Rules this could touch
- [ ] New tables have RLS policies and `pnpm --filter @forkbell/db rls-check` passes
- [ ] Logging still works offline; nothing needs Bell
- [ ] Colours, sizes and copy follow `apps/app/DESIGN.md`

By opening this pull request you agree to the terms in `CONTRIBUTING.md`.
