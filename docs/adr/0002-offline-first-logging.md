# 2. Logging works offline first

**Status:** accepted

## Context
Food and sets get logged in kitchens and gyms, often with weak signal. A
log that fails because the server is out of reach gets lost, or never
entered again.

## Decision
Every logging flow writes locally first and queues the change in an outbox
(`packages/shared/src/outbox.ts`), which sends it when the server can be
reached, in the order they were made. A whole-workout save or a weigh-in
for the same day replaces the one already waiting, so a long offline
session doesn't pile up copies. Food search keeps your own and built-in
foods on the device.

## Consequences
- New logging features need an outbox path, not just an API call.
- Changes that depend on each other must queue in order; one that can be
  replaced needs a `coalesceKey`.
- The app shows when changes are waiting (`SyncBanner`) instead of failing
  quietly.
