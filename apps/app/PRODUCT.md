# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Built for its owner first: one person running their own Forkbell server, logging food and training every day, with household members joining through family sharing. Second audience: other self-hosters who adopt it, so it has to hold up for people who did not write it (sign-up codes, OIDC or password sign-in, Docker deploy).

Their job: log what they ate and how they trained quickly, several times a day, often one-handed on a phone, sometimes with no signal (in the gym, in the kitchen), then see whether they are on track.

## Product Purpose

Food and training logged in one place, on a server the user owns. Success means logging is fast enough to keep up every day, and the progress picture (weight trend, real daily burn, goal date, records, streaks) is trustworthy because it comes from the user's own data.

## Positioning

- **Your data, your server.** Self-hosted, with Postgres row-level security enforcing privacy in the database itself. No vendor holds the user's health data.
- **Food and training in one diary.** It replaces a separate nutrition app and lifting app; the two inform each other (burn, calorie suggestions, Bell's answers).
- **Fast, private logging.** One-tap from recent and most-logged foods, barcode scanning, and logging that works offline and syncs later. Suggestions and planning are rules, not AI: instant, offline, and the same every time.
- **Bell, bring-your-own AI.** An assistant that runs on the user's own model and key, reads data as the user, and never writes on its own: everything it wants to log comes back as a review card.

## Operating Context

- Daily use on iPhone (primary), plus Android and the web app from the same Expo codebase.
- Gym: workout logging with sets, rest timer, spoken rest coach, heart-rate sensor, screen kept awake.
- Kitchen and meals: barcode camera, photo logging through Bell, recipes, portions in servings, oz, cups, ml.
- Apple Health and Health Connect sync in the phone app.
- Family sharing: someone else can view chosen data and, if allowed, log food for the owner.

## Capabilities and Constraints

- Feature set per README.md and ROADMAP.md (diary, training, progress, offline, health platforms, Bell, suggestions, sleep/mood/medications, sharing). Those files are the source of truth for scope.
- Offline-first: every logging flow must work without a connection.
- Bell is optional. With no AI provider set, it is off, and the app must be complete without it.
- Web needs https (or localhost) for the camera and service worker.
- One codebase ships iOS, Android and web; one look across all three, with iPhone conventions first.

## Brand Commitments

- **Name and logo:** Forkbell, with the existing mark (`assets/forkbell-mark.svg`, `assets/Forkbell.icon`, `components/Logo.tsx`) and Bell's avatar (`components/BellAvatar.tsx`).
- **Bell's character:** Bell is a named assistant with faces and reactions; keep it.
- **Never judges food:** no good/bad food language. Allergy, diet and dislike filters err toward keeping things out and never call anything safe.

## Evidence on Hand

- Real product: a working app with all nine roadmap phases shipped (README.md, ROADMAP.md changelog through 0.19).
- Assets: app icon, mark SVG, Bell avatar component, sounds in `assets/sounds`.
- No testimonials, user counts, reviews or press exist. Do not invent any.

## Product Principles

1. Logging speed comes first. Every extra tap on a daily logging path is a cost.
2. Privacy is structural: enforced by the server and the database, never just claimed in copy.
3. The user stays in control. Nothing is written on their behalf without review, Bell included.
4. Works without a connection and without AI; both are improvements, not requirements.
5. Neutral about food. The app reports numbers and offers options; it does not moralize.
