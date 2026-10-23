# Forkbell

Food and training, logged in one place on your own server. Web, iPhone and
Android from one codebase, with Postgres row-level security and sign-in through
Authelia (or any OpenID Connect provider).

**Status:** all nine roadmap phases are in. Food: search (Open Food Facts, USDA, about a hundred
built-in common foods, your own), barcode scanning, one-tap logging from recent
and most-logged foods, copying meals, daily goals. Training: a library of about
60 exercises plus your own, starter programs, workout logging with weight,
reps, RPE and warm-ups, a rest timer, suggested weights each session, and
personal records. Progress: weigh-ins with a smoothed trend and chart, your
real daily burn worked out from your own logs, a goal date range and a
sustainable calorie suggestion, body measurements, streaks and milestones.
Offline: the app opens and logging works with no signal; changes are kept on
the device and sync by themselves when the connection returns. Health: the
phone app reads steps, activity, resting heart rate and weigh-ins from Apple
Health or Health Connect, and sends back daily calories, macros and workouts.
Bell, the assistant: ask about your own data, or log food by describing it or
sending a photo, with every item reviewed before it's added. Suggestions:
lighter drink swaps, protein and fiber ideas, a sodium heads-up, planning a
day or a week, a shopping list, allergy, diet and dislike filtering, and
safety tips for training. More health: sleep, mood and energy check-ins, a
medications checklist, custom measurements, goal presets and per-weekday
goals, and family sharing with permissions. See
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
- **No borrowing ids.** Rows in a workout or program point at their parent by
  id and owner together, and a workout can only use built-in exercises or your
  own, so a guessed id from someone else's data is refused by Postgres itself.

## Self-hosting

1. In Authelia, add the client from `docker/authelia-client.yml`, with your
   real address in `redirect_uris`.
2. `cp .env.example .env` and fill in the top sections.
3. `docker compose up -d --build`
4. Point your reverse proxy at port 3000 and open `PUBLIC_URL`.

Back up `./data/postgres` (or use `pg_dump`).

Updating: pull, rebuild the image, and redeploy. The `migrate` container
upgrades the database and refreshes the built-in foods and exercises before
the server starts.

Barcode scanning in the web app needs the camera, and offline use needs a
service worker; browsers only allow both on an `https://` address (or
`localhost`).

## Apple Health and Health Connect

These only exist on phones, so they work in the native app (Settings, then
Connect). Each sync reads the last 14 days and sends the last 7 days of food
totals and any newly finished workouts. Writing a day again replaces it in
Apple Health (sync identifiers) and Health Connect (client record ids), so
nothing is counted twice. Imported weights fill in days you didn't weigh in
yourself; one you typed into Forkbell is never replaced. The iOS build is
ad-hoc signed with the HealthKit entitlement so a sideloading tool can keep it
when it re-signs the app.

## Family sharing

Share with someone who has an account on the same server: pick what they can
see (food diary, workouts, weight and progress, sleep/mood/medications) and
whether they can log food for you, then send them a one-time code (7 days).
Either of you can end it at any time.

This is enforced by Postgres, not just the app. Each request carries who is
signed in and whose data it's about (`app.user_id` and `app.profile_id`);
every policy shows one person's rows, and someone else's only when a share
grants that kind of data. Logging food for someone is the only write allowed;
everything else is read-only for them. Invite codes are stored as hashes. The
row-level security check covers all of it, including that a share can't be
created except by accepting a real invite.

## Suggestions and planning

Rules, not AI: instant, offline, and the same every time. They live in
`packages/shared` (`suggestions.ts`, `planner.ts`, `food-safety.ts`,
`training-tips.ts`) with tests.

- Allergies, diet and dislikes are matched on food names only (whole words,
  plurals, a few synonyms). It errs toward keeping things out, can't see
  hidden ingredients, and never calls anything safe. Logged foods whose names
  match get a small flag in the diary; Bell gets the same rules.
- Plans fill empty meals with a protein, a starch and a vegetable or fruit
  from foods you log first, sized to what's left of your calories and protein,
  never repeating a food in a day or the previous day's dinner.
- Training tips: a pain flag on a lift shows next time, two in a month suggest
  getting it checked, three near-limit sessions suggest a lighter day, and a
  jump of more than 10% and 15 lb (7.5 kg) over last time gets a heads-up.

## Bell (the assistant)

Bell uses the model you choose, set on the server: `AI_PROVIDER=anthropic`
with an Anthropic key, or `AI_PROVIDER=openai` for OpenAI and anything that
speaks its API (Ollama, LM Studio, OpenRouter...; set `AI_BASE_URL`). Photo
logging needs a model that can see images. Leave `AI_PROVIDER` empty and Bell
stays off.

- Bell reads your data through the same routes as the app, as you, so row-level
  security applies to everything it sees. It never writes on its own.
- Food it wants to log comes back as a review card: change amounts or meals,
  untick items, then add. Numbers it makes up are checked with the same
  impossible-number rules as foods you type, and marked as estimates.
- Photos are sent to the model only with the message they're attached to and
  are not stored on the server.
- About 40 messages per person per 10 minutes, to keep API costs in check.
- **Asks when it's unsure.** When a portion or how something was cooked would change the calories a lot, Bell asks one question with answers you can tap, always including *Just estimate it*. It never logs exactly 100 g unless you said 100 (that's the per-100 g basis, not an amount). Turn the questions off in Settings, Food and suggestions.
- **Talk to it.** Hold the mic, speak, and let go to send; the words show as you speak. A quick tap listens hands-free until you tap again. Speech is turned into text on the iPhone when it can be; in Chrome on the web, the browser sends audio to Google to do it.
- **Paste a photo.** Ctrl/Cmd+V on the web, or the *Paste image* button on a phone. Pasting an image link loads the picture. The server never fetches links itself, so a link can't be used to reach anything on your network.
- **Fix a wrong barcode entry from the label.** After scanning, *Numbers look wrong?* opens the food form; photograph the label and Bell reads what's printed (it isn't allowed to estimate). Forkbell converts per-serving, kJ and salt figures to per 100 g itself, fills the form for you to check, and your corrected copy is what scans from then on.
- `apps/server/scripts/mock-ai.mjs` is a stand-in model for testing without a key (it also asks a question, tries a 100 g default, and answers label photos).

## Offline

The web app keeps its own files with a service worker, and each device keeps a
copy of the data its screens show plus an outbox of changes made offline.
Records made offline get their id on the device, so sending one twice (when an
answer is lost on a bad connection) never logs it twice. Food search offline
covers your own foods and the built-in ones; Open Food Facts and USDA need a
connection. Personal records for a workout finished offline are worked out
when it syncs.

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

## Finishing a day and reminders

- **Finish the day.** Once everything you ate is logged, tap *Finish today* at the bottom of the diary (or *Finish day* on a past day). The calendar shows finished days with a solid dot and logged-but-unfinished days with an outline, so gaps are easy to spot.
- **A better burn estimate.** Once you have ten finished days in the last four weeks, the daily-burn estimate uses only finished days, so a half-logged day can't make it look like you burn less than you do.
- **Smart reminders (phone only).** In Settings, *Reminders on this phone*. Forkbell learns when you usually log each meal and only nudges about meals you log most days, about an hour after your usual time, and only if that meal is still empty. An evening nudge to finish the day comes around when you usually do. They're local notifications scheduled on the phone, replanned whenever the app opens or you log something, so nothing goes through a push service. If you log on the web instead, the phone hears about it next time Forkbell opens there.

## Training suggestions

Rules, not AI, so they're instant and work offline. Set them up in Settings, Food and suggestions, under Training: the equipment you have, areas to go easy on (shoulders, elbows, wrists, lower back, knees), and exercises never to suggest.

- **Swaps.** An exercise's menu, or *See swaps* under a tip, lists exercises for the same muscle, best first, each with why it fits ("easier on your shoulders", "you've done it before"). *Pick any exercise* is always there.
- **Stalled lifts.** When three sessions over two weeks do no better than the ones before, a tip suggests a different rep range or a swap.
- **This week.** From Thursday (or after two workouts), the Train tab says which major groups (chest, back, shoulders, legs) have had no work yet.
- **Strength goals.** Set a target one-rep max on an exercise's page. Forkbell draws a trend through your last eight weeks and gives an estimated date, never assuming more than 1.5% a week.
- **Tips.** *Got it* hides them for the session; *Hide tips for this exercise* hides them for good (pain notes always show). Settings can bring them back.
- **Finish screen.** Your volume as something real: "That's about 6 grand pianos lifted today."

Bell follows the same setup when it suggests exercises.

## App icon

`apps/app/assets/Forkbell.icon` is the iPhone icon (iOS 26 and later): one flat layer, and iOS adds the Liquid Glass light and depth and switches between Light, Dark, Tinted and Clear with the home screen. It opens in Apple's Icon Composer on a Mac if you want to adjust it. `icon.png` is the Android and web version, and `forkbell-mark.svg` is the logo on its own.

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
