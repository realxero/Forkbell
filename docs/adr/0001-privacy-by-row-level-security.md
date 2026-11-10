# 1. Privacy is enforced by Postgres row-level security

**Status:** accepted

## Context
Forkbell holds food, weight, medication and training records, and people can
share some of them with a partner or coach. A missed `where user_id = …` in
one route would show one person's data to another.

## Decision
Every table holding someone's data has row-level security enabled *and*
forced, with policies keyed on the current app user. The server only reaches
those tables through `asUser(...)` (`packages/db/src/index.ts`), which sets
that user for the transaction. Sharing is decided in SQL (`may()`,
`may_view_profile()`), not in route code.

## Consequences
- A route that forgets a filter returns nothing, not someone else's rows.
- Every new table needs policies, and `pnpm --filter @forkbell/db rls-check`
  has to pass; CI runs it.
- Admin-only work (migrations, backfills) runs as the admin role; a
  backfill on a forced table lifts `force` for that one statement.
