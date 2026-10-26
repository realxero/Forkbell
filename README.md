# Forkbell

Food and training, logged in one place on your own server. Web, iPhone and
Android from one codebase, with Postgres row-level security and sign-in through
Authelia (or any OpenID Connect provider), a username and password, or both.

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
- **Sign-in.** Single sign-on is OIDC with PKCE; Authelia handles two-factor
  and passkeys. Password sign-in is optional (`PASSWORD_LOGIN`): passwords are
  hashed with scrypt on the server and kept in a table the app role can't
  read, a wrong username takes as long as a wrong password, and guessing is
  limited per username and per address. Changing a password signs out your
  other devices, and Settings → Sign-in and security lists every sign-in so you
  can end any of them.
- **Sessions** are random tokens; only an HMAC of each is stored, in a table the
  app role can't read. The web app uses an httpOnly cookie; the phone app keeps
  its token in the iOS Keychain / Android Keystore via SecureStore.
- **Admin credentials** are only given to the one-shot `migrate` container.
- **No borrowing ids.** Rows in a workout or program point at their parent by
  id and owner together, and a workout can only use built-in exercises or your
  own, so a guessed id from someone else's data is refused by Postgres itself.

## Self-hosting

1. In Authelia, add the client from `docker/authelia-client.yml`, with your
   real address in `redirect_uris`. (Or skip Authelia: leave `OIDC_ISSUER`
   empty and Forkbell uses usernames and passwords, and the first person to
   open it creates the first account.)
2. `cp .env.example .env` and fill in the top sections.
3. `docker compose build --pull && docker compose up -d`
4. Point your reverse proxy at port 3000 and open `PUBLIC_URL`.

Back up `./data/postgres` (or use `pg_dump`).

Updating: pull, rebuild the image with `--pull` (so Docker fetches the newest
Node 24 with its security fixes, instead of reusing the copy it has), and
redeploy. A build on a Node with a known security hole stops with a message
saying so. The `migrate` container
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

The first sync after connecting (or after updating) also brings in up to two years of past weigh-ins, once, so the weight trend and chart start with your history.

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

The easy way: Settings → Bell, pick Google Gemini, Anthropic or OpenAI, paste
your key, check it, pick a model. The key is encrypted on the server
(AES-256-GCM, derived from SESSION_SECRET) and never sent back to the app or
shared. Rotating SESSION_SECRET means re-entering it. The server-wide AI_*
settings below still work as the default for anyone without their own key.

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

### Bell's voice

Bell reads answers aloud with the best voice the phone or browser has, and
skips the robotic ones. On iPhone, download a Premium voice (Settings →
Accessibility → Spoken Content → Voices → English, e.g. Ava, Zoe, Evan or
Nathan) and Bell uses it by itself. Settings → Bell → Bell's voice lists the
voices with a play button.

For the most natural voice, run [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
on a computer on your network (its GPU image needs the NVIDIA Container
Toolkit; the CPU image works too, just slower) and set
`TTS_BASE_URL=http://<that computer>:8880/v1`. The phone streams the audio
through your Forkbell server, so the speech server never needs to be on the
internet. If it's off, Bell falls back to the phone's voice.


**Corrections.** Tell Bell the real numbers for something already logged
("Peet's says it's 470") and it offers the corrected item marked *Replaces
… when you tap Add*; the old entry is removed when you add the new one, so
you don't end up with both. A calorie count you give is used exactly. Bell
is told never to say it'll change something unless it does it in that reply.

**Web search (optional).** Set `SEARCH_URL` to a SearXNG instance (with the
JSON format turned on: `search: formats: [html, json]` in its
`settings.yml`) and Bell searches for a restaurant or chain item's published
nutrition before estimating, and says where the numbers came from. Only
Bell's search words leave your server, to your SearXNG. A small one in the
same Dockge stack:

```yaml
  searxng:
    image: searxng/searxng:latest
    restart: unless-stopped
    volumes:
      - ./data/searxng:/etc/searxng
```

then `SEARCH_URL=http://searxng:8080` for the app.
## Offline

The web app keeps its own files with a service worker, and each device keeps a
copy of the data its screens show plus an outbox of changes made offline.
Records made offline get their id on the device, so sending one twice (when an
answer is lost on a bad connection) never logs it twice. Food search offline
covers your own foods and the built-in ones; Open Food Facts and USDA need a
connection. Personal records for a workout finished offline are worked out
when it syncs.

## Development

Needs Node 24 (24.22.1 or newer; `.nvmrc` says which) and pnpm (`corepack enable`).

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

## Amounts: servings, oz, cups

Foods keep their numbers per 100 g underneath, but you never have to think
in grams. When you log a food, pick how much in the unit that fits: the
label's serving or its word for one (*1 bar*, *1 slice*), oz or g, and for
drinks, soups and sauces fl oz, cups, ml, tbsp and tsp (½, 1, 1½ and 2 are a
tap away). Switching units keeps the same amount of food. The entry
remembers how you said it ("2 bars (48 g)"), and editing it opens in the
same unit. The bars under the numbers show how much of the day's goal that
amount is.

Adding a food of your own follows the label: the serving size as printed
("1 bar", 24 g) and the numbers per serving, or per 100 g if that's what
your label shows. A label photo is read the same way, so a granola bar's
label shows 100 kcal per bar, not 417 per 100 g.

Any entry can be renamed (Edit → *Name in your diary*); only that entry
changes, not the food.

## Water

A Water card on Today. Tap +8, +16.9 or +24 oz (+250, +500 or +750 ml if you
use kilograms), or *Other amount* and type anything like "20 oz", "1.5 L" or
"2 cups". *Undo* takes back the last one. The bar fills toward your daily goal
(2 L to start); reaching it gets a small celebration. Change the goal, or hide
the card, in Settings → Goals and targets. It works offline like the diary, is
included in Export, and people you share wellbeing with can see it.

On iPhone, each day's water also goes to Apple Health as one entry, so
another glass or an Undo updates it there (Settings → Apple Health → Send
water). Bell knows today's water and your goal, so "how am I doing today?"
includes it. Tell Bell "I drank a bottle of water" and it offers an Add button for 16.9 oz (500 ml); nothing is logged until you tap it, the same as food.

## Fasting

Off until you turn it on in Settings → Goals and targets. Then Today has a
fasting timer: pick a goal (12 to 24 hours), say when you last ate (just now,
or up to 4 hours ago), and it counts up with a bar toward the goal. The phone
notifies you when the goal is reached; *End fast* (or *End early*) stops it.
Fasts that reach their goal build a streak. It works offline, is in Export,
and people you share wellbeing with can see it.

## Progress photos

On the Progress tab: tap Front, Side or Back to take today's photo (the
picture icon under each picks one from your library instead; on the web it's
always the library). *First and latest* shows your first and newest photo of
a pose side by side, each with your weight trend on that day, and the change
in between. *Slider* puts them in one frame instead: drag across to wipe from the first to the latest. *See all* lists every day; tap a photo to see it big or delete it.

They're stored in Postgres, so the nightly backup has them. Only you can see
them: they're left out of family sharing whatever it allows (the database
refuses it, not just the app), Bell never sees them, and Export lists them
without the pictures. Adding one needs a connection to your server.

## Cardio

Twelve built-in cardio exercises (Run, Treadmill, Walk, Hike, Bike ride,
Stationary bike, Rowing machine, Elliptical, Stair climber, Swim, Jump rope,
HIIT), and *Cardio* as a kind when you make your own. Add one to any workout
and log each bout as minutes ("30", or "32:15") and a distance in miles or
km. The card shows the total time, distance, pace and a rough calorie
estimate from your weight trend (a watch's number is better when you have
one; it isn't added to your daily burn, which already comes from your
logging and weight trend). No rest timer between bouts. The longest time is
the exercise's record, and the workouts CSV has a distance column.

## Supersets, circuits, drop sets and plates

- **Supersets and circuits.** An exercise's ⋯ menu has *Superset with the next exercise*. Do it again on the next one for a circuit of three or more. You go straight from one exercise to the next with no rest, then rest once after the last, for the longest rest time in the group. Moving an exercise out of the group, or *Leave the superset*, takes it out. Supersets can be saved in a program's day too: in the day's editor, *Superset with the next exercise* between two cards (and *Split the superset here* to undo it), so every workout started from that day begins with them.
- **Drop sets.** Tap a set's number to cycle it: working, warm-up (W), drop set (D). A drop set starts straight after the set before it, with no rest. Drop sets count toward your volume but not toward records or next time's targets, since they're lighter on purpose.
- **Plates.** Barbell exercises and plate-loaded machines have a *Plates* button that draws what to load on each side. Pick the bar (45, 35 or 15 lb; 20, 15 or 10 kg; or EZ, trap bar, machines, your own), set the plates your gym has, and it says when a weight can't be loaded exactly and offers the nearest ones.

## In the gym

- The screen stays on while a workout is going, so the timer is always there.
- When a rest is up the screen flashes as well as buzzing and chiming, for gyms too loud to hear it.
- Swipe a set left to delete it, or right to copy it just below.
- An exercise's ⋯ menu has *Count reps per side* for lunges, single-arm rows and the like; the column then reads Reps/side.

The first two can be turned off in Settings → Training setup.

## Importing workouts from Strong, Hevy or FitNotes

Settings → Export, import and backup → *Import workouts*. In the other app,
export your workouts as a CSV file (it's in that app's settings, usually
under Export), save it to Files, and pick it. Forkbell works out which app
made it from its columns, then shows a preview: how many workouts and sets,
the dates, which exercise names match ones Forkbell has (including the
built-in library, so "Bench Press (Barbell)" finds the barbell bench press),
and which will be added as your own. Nothing is saved until you tap Import.

- Warm-up and drop sets, RPE, supersets (Hevy), cardio time and distance,
  and notes come across.
- Hevy and FitNotes say whether weights are in pounds or kilograms; Strong
  doesn't, so pick the unit Strong was set to.
- FitNotes has no times, so its workouts are put at noon for an hour.
- Workouts already in Forkbell (same start time) are skipped, so importing
  the same file again adds nothing. Up to 5,000 workouts at a time.

If a file from one of these apps doesn't come through right, the columns may
have changed: open an issue with the first few lines of the file.

## Past workouts

*+ Log a past workout* at the bottom of Train is for one you did without
logging it: pick the day, start time and minutes, and optionally a program
day. It's saved as finished (even with another workout going) and opens so
you can add exercises and tick the sets you did. Any workout in History can
be opened to change its sets, and *Change* at the top fixes its day and
times. Records and history are read from the workouts as they now stand, so
fixing one fixes those too.

## Rest coach

Off until you pick it in Settings → Training setup. *Timings* speaks in Bell's voice during rests: "Ten seconds", then
"Rest's up. Next: bench press, set 3, 185 pounds for 8." *Timings and
encouragement* adds a few words after a set that beats last time.

On iPhone, with Apple Health connected, the rest bar shows your heart rate
when there's a reading less than a minute old. Recovered means 40% of the
way from your resting heart rate (from Apple Health) to your max (from your
birth year in your profile). Recovered early, it says you're ready; still
high with a few seconds to go, it adds 30 seconds, once. An Apple Watch
tracking a workout writes a reading every few seconds. Garmin and most
other watches sync to Apple Health in batches, so with them the coach
usually just keeps time.

## Training suggestions

Rules, not AI, so they're instant and work offline. Set them up in Settings → Training setup: the equipment you have, areas to go easy on (shoulders, elbows, wrists, lower back, knees), and exercises never to suggest.

- **Swaps.** An exercise's menu, or *See swaps* under a tip, lists exercises for the same muscle, best first, each with why it fits ("easier on your shoulders", "you've done it before"). *Pick any exercise* is always there.
- **Stalled lifts.** When three sessions over two weeks do no better than the ones before, a tip suggests a different rep range or a swap.
- **This week.** From Thursday (or after two workouts), the Train tab says which major groups (chest, back, shoulders, legs) have had no work yet.
- **Strength goals.** Set a target one-rep max on an exercise's page. Forkbell draws a trend through your last eight weeks and gives an estimated date, never assuming more than 1.5% a week.
- **Tips.** *Got it* hides them for the session; *Hide tips for this exercise* hides them for good (pain notes always show). Settings can bring them back.
- **Finish screen.** Your volume as something real: "That's about 6 grand pianos lifted today."

Bell follows the same setup when it suggests exercises.

## Food data and barcode checks

Search covers your own foods, about a hundred built-in common foods, Open Food Facts, and USDA FoodData Central (with a free `USDA_API_KEY`). Every result is tagged with where its numbers come from (**USDA lab**, **USDA** everyday dishes, **Maker's label**, **Community** for Open Food Facts, **Forkbell**, **Yours**), and results are ordered by how well they match, then by how trustworthy the data is, with repeats shown once. Open Food Facts text search uses its newer Search-a-licious service, falling back to the old search when that's busy. USDA brings lab-analysed basics (Foundation, SR Legacy), everyday dishes with household portions like "1 cup" (Survey, FNDDS), and branded foods.

**Scanning a barcode** asks Open Food Facts and USDA at the same time. USDA's branded foods come from the manufacturer's own label data, so they win when both have the product, and the screen says whether the two agree ("Checked against Open Food Facts: the numbers match", or what differs). Anything still wrong can be fixed from a photo of the label, and your corrected copy is what scans from then on.

fatsecret was considered and left out: its API terms only allow keeping food IDs, not nutrition, for more than 24 hours, and Forkbell keeps a copy of every food you log so your history and offline mode work.

## Exercise library and how-to pictures

Every built-in exercise shows how to do it: the start and end positions fading back and forth so you can see the movement (side by side with Reduce Motion on), plus step-by-step instructions and the level. Tap **?** on an exercise during a workout, or see it on the exercise's page.

The exercise picker keeps your everyday list short. Search covers a full library of about 690 more exercises, or tap *Show the full library*.

Steps and pictures come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (public domain), pinned to one version in `packages/db/data/exercise-library.json`; `packages/db/scripts/build-exercise-library.mjs` rebuilds it. Your server fetches each picture the first time it's needed and keeps a copy, so phones only ever talk to your server, and only pictures in the library can be requested. Set `MEDIA_DIR` to a mounted folder and the copies last across updates; the server then also fetches the whole set (about 90 MB) once in the background, picking up where it left off after a restart.

**On the phone**, pictures for your everyday exercises and any you've done save by themselves (about 7 MB), so how-to works at the gym with no signal. Settings, *Exercise pictures on this phone*, can download the whole library (about 87 MB) or remove the saved pictures.

## Sign-in options

- **Authelia only** (the default when `OIDC_ISSUER` is set): nothing changes.
- **Authelia and passwords:** `PASSWORD_LOGIN=on`. The sign-in screen shows both.
  Anyone with an Authelia account can add a password in Settings → Sign-in and
  security. To let family make their own accounts without Authelia, set
  `PASSWORD_SIGNUP=code` and a `SIGNUP_CODE`, and give them the code.
- **Passwords only:** leave `OIDC_ISSUER` empty.
- **Another provider** (Authentik, Pocket ID, Keycloak, Google...): point the
  `OIDC_*` settings at it and set `OIDC_NAME` for the button.


**Sign in another device with a code.** On a device that's signed in,
Settings → Sign-in and security → *Sign in another device* shows a code like
`K7QM-4XPA`. On the new phone or browser, tap *Signed in on another device?
Use a code* on the sign-in screen and type it. Codes last 5 minutes, work
once, and making a new one ends the last; ten wrong codes from one address
wait 15 minutes. Handy for the iPhone app: no password or Authelia redirect
to type on the phone. Codes live only in the server's memory, so restarting
the server ends any that are waiting.
## Versions

The version lives in the root `package.json`; change it everywhere with
`node scripts/set-version.mjs 0.12.0`. Each release that adds features bumps
the middle number (0.11 → 0.12), fixes bump the last.

Builds are stamped with their commit and build number (`scripts/build-info.mjs`,
run by the Dockerfile and the iOS workflow). To check what's running:

- **App:** Settings, at the bottom: `App 0.11.0 (build 42, a1b2c3d)`, and the
  server it's talking to. It warns when the two are different releases.
  iOS Settings → General → iPhone Storage → Forkbell shows `0.11.0 (42)`.
- **Server:** `curl https://forkbell.example.com/healthz`, or the
  `x-forkbell-version` header on any answer. The server log says it on start.

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
built-in common foods are also based on. Exercise steps and pictures come from
[Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (public domain). Barcodes are read in the browser with
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
