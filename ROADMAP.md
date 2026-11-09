# Roadmap

Each phase ends with something usable on web and iPhone.

1. **Diary (done).** Sign-in, food search, logging, daily goals and totals.
2. **Food logging speed (done).** Barcode scanning, recent and frequent foods, copy
   meals between days, portion chips, editing an entry's amount, built-in
   common foods.
3. **Training (done).** Exercise library, workout logging with sets, reps, weight and
   RPE, rest timer, programs with progression, personal records.
4. **Progress (done).** Weigh-ins and measurements, adaptive energy expenditure,
   goal-date estimate with a weight trend chart, streaks and milestones.
5. **Offline (done).** On-device database with sync, so logging works with no signal.
6. **Health platforms (done).** Apple Health and Health Connect, reading and writing.
7. **AI assistant (Bell) (done).** Bring-your-own model; chat logging, photo logging
   with a review step, questions about your own data.
   Since then: asks when unsure, voice, pasted photos and image links, and fixing
   barcode data from a label photo.
8. **Smart suggestions (done).** Swaps, protein and fiber ideas, nutrient limits,
   restaurant options, day and week planning, shopping list, allergy and
   dislike filtering, safety tips for training.
9. **More health (done).** Sleep, mood, medications, custom measurements, goal
   presets and per-weekday targets, family sharing with permissions.

Since then (0.11): password sign-in alongside Authelia or instead of it,
sign-up codes, a list of your sign-ins with sign-out, and version markers in the
app, the server and every build.

0.12: the quick Bell keeps the conversation, Bell's faces and reactions,
streak celebrations, exercise variations and ways to progress besides weight,
and a better voice for Bell (the phone's best voice, or Kokoro on your server).

0.13: water on Today, supersets and circuits, drop sets, a plate calculator
for barbell lifts, and progress photos with a first-and-latest comparison.

0.14: fasting, cardio, a spoken rest coach with heart-rate recovery, water in
Apple Health, Bell knowing your water and fasting, and supersets saved in
program days.

0.15: Training setup on its own page, logging past workouts and fixing a
workout's day and times, the screen staying on, a rest flash, swipe to
delete or copy a set, reps per side, a before/after photo slider, and
signing in another device with a one-time code.

0.16: Bell can log water (you tap Add), and importing workouts from Strong,
Hevy or FitNotes.

0.17: fixes for the workout clock (NaN:NaN) and the web wake lock, Bell
corrections that replace the old entry, optional web search for Bell, the
muscle map opening exercises, scanning a barcode for a new food, Close on
the form check, and a tidier exercise options sheet.

0.18: amounts in servings, oz, cups and ml; entries remember how you said the
amount and can be renamed; new foods follow the label (per serving); goal
bars on amounts; Days logged as a month; Quick add fixed; Bell answers
before Cloudflare gives up, and clearer errors when something else answers.

0.19: Bell answers by checking back instead of one long wait (no more "needs
a connection" on slow answers), × 2 / × 3 and "make this one serving" for
amounts, and vitamins and minerals.

0.20: days keep their goals, recipe vitamins and minerals, a fuller diary
export, Bell sees vitamins and minerals, Siri adds water and fasting,
importing recipes (link, Mealie, text), and live heart rate from a Garmin or
chest strap over Bluetooth.

0.21: your own meal names and two more meals, splitting a recipe across days,
sleep and readiness scores, and AI apps (Claude Desktop) over MCP.

0.22: importing food history from MyFitnessPal, Lose It, Cronometer or Yazio.

0.23: a design pass over every tab. Food has an iron calorie ring and one way
into each meal; Train puts starting a workout first and gives training its
own colours; Progress leads with your trend, goal and burn, edits goals in a
sheet with a calendar, and keeps training together. Bell can be retried
without logging twice, stays usable offline and can be stopped; signing out
can't hand waiting changes to the next person. AI apps and Shortcuts log to
your day in your own time zone.

0.24: wide screens get a sidebar and Tools (daily burn, cut or bulk, body fat,
BMI and FFMI, one-rep max, plates), with Simple and Advanced and a source for
every formula; Progress in three columns; four ways to show macros; a calmer
Today, with water and an idle fast on one line each; coaching, where someone
can plan your training or your food (a weekly meal plan and suggested targets)
and you choose what to start or apply; pounds by default; and server hardening
(request size caps, sign-in tied to the device that started it, tighter rate
limits, private addresses refused for recipe links).

Possible next steps: medication reminders as phone notifications, sleep from
Apple Health and Health Connect, an importer for NutriTrace and LiftTrace
data, and per-user AI keys for Bell.
