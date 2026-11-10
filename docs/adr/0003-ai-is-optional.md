# 3. Bell (the AI) is optional

**Status:** accepted

## Context
Forkbell is self-hosted. Some people won't want an AI provider seeing their
food and health data, some can't pay for one, and providers go down.

## Decision
The app is complete without Bell. Bell uses the model and key the server
owner (or each user) brings: Anthropic, an OpenAI-compatible endpoint
(including a local one) or Gemini. Bell never writes on someone's behalf
without a review card they accept.

## Consequences
- Every feature needs a way to do it by hand; Bell is a shortcut, not the
  only door.
- Suggestions that don't need a model (better options, patterns) are rules,
  not AI calls.
- Tests run against `apps/server/scripts/mock-ai.mjs`, not a real provider.
