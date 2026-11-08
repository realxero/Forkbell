---
name: Forkbell
description: Food and training, logged in one place on your own server.
colors:
  chalk: "#F4F5F2"
  card: "#FFFFFF"
  raised: "#EEF0EC"
  iron: "#1C252B"
  iron-soft: "#5F6B73"
  line: "#DDE2E4"
  track: "#E6E9EA"
  placeholder: "#7C868C"
  accent: "#2B6BD6"
  on-accent: "#FFFFFF"
  protein: "#2B6BD6"
  carbs: "#D99A00"
  carbs-text: "#8A5A00"
  fat: "#2E9E62"
  fat-text: "#1F7A4A"
  water: "#1E88C8"
  water-text: "#13689C"
  over: "#D2423A"
  rest-fill: "#2F4350"
  success-bg: "#E5F4EC"
  info-bg: "#EAF1FC"
  warn-bg: "#FFF4D6"
  warn-text: "#8A5A00"
  danger-bg: "#FDECEA"
  tile-purple: "#6A4BD1"
  tile-magenta: "#B0337A"
  tile-teal: "#0F7F80"
  tile-copper: "#A4572A"
  tile-slate: "#1C252B"
  tile-grey: "#5B6B73"
typography:
  display:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    fontFeature: "tnum"
  hero:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    letterSpacing: "-1px"
  page-title:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    letterSpacing: "-1px"
  stat:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    fontFeature: "tnum"
  title:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  heading:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  control:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  small:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.6px"
  caption:
    fontFamily: "system-ui, -apple-system, SF Pro, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
rounded:
  input: "10px"
  row: "12px"
  card: "18px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
components:
  button-filled:
    backgroundColor: "{colors.iron}"
    textColor: "{colors.chalk}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    padding: "14px 16px"
  button-small:
    backgroundColor: "{colors.iron}"
    textColor: "{colors.chalk}"
    typography: "{typography.control}"
    rounded: "{rounded.row}"
    padding: "12px 16px"
  button-quiet:
    backgroundColor: "{colors.card}"
    textColor: "{colors.iron}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    padding: "14px 16px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.row}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.iron}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: "12px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.iron}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  chip-on:
    backgroundColor: "{colors.iron}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
  sheet:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "16px"
  tab-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.iron-soft}"
    typography: "{typography.caption}"
---

# Design System: Forkbell

## Overview

**Creative North Star: "The Chalked Bar"**

A weight room is mostly chalk and iron. The bar, the floor and the racks are pale, worn and neutral, and the only colour comes from the plates. Forkbell works the same way. Screens are pale chalk with white cards, words and main buttons are dark iron, and colour shows up only where it carries meaning. Protein is a 20 kg blue plate, carbs a 15 kg yellow, fat a 10 kg green, and "over" a 25 kg red. Water is its own clear blue, and one chosen accent belongs to Bell and the app's links.

The feel is soft and friendly rather than hard-edged. Cards have generous 18 pt corners. Buttons are heavy and easy to hit, but rounded. Bell, a little kettlebell with a face, sets the warmth: it blinks, bobs and reacts. The app is a tool you use several times a day, often one-handed and mid-set, so it stays calm and dense where numbers live and saves expression for Bell, celebrations and goal moments. It follows iPhone conventions first (system font, tab bar, bottom sheets, 44 pt targets), and Android and web keep the same look.

It must never look clinical. Forkbell holds health data, but it is not a lab report: no cold hospital blues, no grey forms, no sterile tables. Numbers are reported warmly and without judgement.

**Key Characteristics:**
- Chalk background, white cards, iron type and iron main buttons.
- Colour is meaning: macro "plates", water, the accent and the red "over" state.
- Rounded and friendly: 18 pt cards, 12 pt buttons, pill chips.
- Flat at rest; only floating things cast shadows.
- System font with heavy weights for numbers and tabular figures throughout.
- Full light and dark versions, plus a user-chosen accent (seven options).

## Colors

A neutral chalk-and-iron base with bumper-plate macro colours. Every colour has a dark-mode twin (see the sidecar), and coloured text uses a darker `*-text` version in light mode so it reaches 4.5:1 on white.

### Primary
- **Iron** (#1C252B): the colour of words, page titles and the main buttons (filled and small). Selected chips turn iron. On dark it flips to a pale iron (#E9EDEF) with chalk-dark text.

### Secondary
- **Bell Blue, the accent** (#2B6BD6): links, the active tab tint, the Ask Bell button, Bell's body and accent buttons. The user can change it to teal, green, orange, red, pink or purple in Settings. Each option is kept at 4.5:1 or better with its button text.

### Tertiary (the plates)
- **20 kg Blue, protein** (#2B6BD6): protein rings, bars and icons.
- **15 kg Yellow, carbs** (#D99A00): carb rings and bars; words use **Carb Text** (#8A5A00).
- **10 kg Green, fat** (#2E9E62): fat rings and bars, plus success marks; words use **Fat Text** (#1F7A4A).
- **25 kg Red, over** (#D2423A): a ring past its goal, errors, destructive actions.
- **Water Blue** (#1E88C8): water card, glasses and actions; words use **Water Text** (#13689C).

### Neutral
- **Chalk** (#F4F5F2): the page background behind every screen and tab, and the fill of inputs set inside cards.
- **Card White** (#FFFFFF): cards, sheets, dialogs and the tab bar.
- **Raised Chalk** (#EEF0EC): inner rows and segments sitting on a card.
- **Soft Iron** (#5F6B73): secondary lines, labels, inactive tabs.
- **Chalk Line** (#DDE2E4): 1 pt borders on inputs, chips, quiet buttons and dividers.
- **Empty Track** (#E6E9EA): the unfilled part of rings and bars.
- **Rest Slate** (#2F4350): the rest-timer fill.
- **Tints**: Success (#E5F4EC), Info (#EAF1FC), Warn (#FFF4D6 with #8A5A00 words) and Danger (#FDECEA) backgrounds for banners and notes.

### Tiles
The small coloured squares behind icons in Settings rows and on the Health card, iPhone Settings style. They use their own six colours, chosen to stay clear of every plate so a tile never reads as a macro: **Purple** (#6A4BD1), **Magenta** (#B0337A), **Teal** (#0F7F80), **Copper** (#A4572A), **Slate** (#1C252B) and **Grey** (#5B6B73), each with a lighter dark-mode twin. Icons on them are On Accent (white in light mode, near-black in dark), at 4.2:1 or better. Bell's tile is the accent, and Sign out's is Over red (a destructive action).

### Named Rules
**The Plates Carry Meaning Rule.** A plate colour always means its subject: blue is protein, yellow carbs, green fat, red over, water blue water. A plate colour may mark an action about its own subject (an "Add water" button in water blue), but never decorates something unrelated.

**The Text Twin Rule.** Bright plate colours are for rings, bars, fills and icons. Words in those colours use the `*-text` twin, never the bright fill colour on white.

**The Iron Main Action Rule.** A screen's main action is iron with chalk words, not the accent. The accent belongs to Bell, links and the active tab.

## Typography

**Display Font:** the system font (SF Pro on iPhone, Roboto on Android, system-ui on web)
**Body Font:** the same system font
**Label/Mono Font:** none; numbers use tabular figures of the system font

**Character:** one native family at heavy weights for the big numbers and bold labels. It reads like the phone itself, and the weight (800 for numbers and titles) adds the solid gym feel.

### Hierarchy
- **Display** (800, 48 pt, tabular): timers and the plate calculator's target, read from across a room.
- **Hero** (800, 44 pt, -1 tracking): onboarding and the day's main number.
- **Page Title** (800, 32 pt, -1 tracking): the title at the top of every page, plus big numbers like kcal left.
- **Stat** (800, 22 pt, tabular): numbers you type or read at a glance inside a card.
- **Title** (700, 20 pt): a sheet's or section's title.
- **Heading** (700, 18 pt): a card's own heading (Breakfast, Water).
- **Body** (400, 16 pt): reading text, rows and main button words.
- **Control** (700, 15 pt): words on small buttons, chips, links and toasts.
- **Small** (400, 13 pt, Soft Iron): secondary lines under a row.
- **Label** (700, 12 pt, 0.6 tracking, uppercase, Soft Iron): section labels, tags and badges.
- **Caption** (400, 11 pt): credits, units under a ring, tab labels (700 there).

### Named Rules
**The One Scale Rule.** Every size comes from `textSize` / `type` in `lib/theme.ts`. The only exceptions are the rotated plate labels and weekday cells (9 and 10, to fit fixed shapes) and the sign-in wordmark.

**The Steady Numbers Rule.** Any number that changes or sits in a column uses tabular figures so it doesn't jitter.

## Layout

A single column on a chalk page, one card per subject (a meal, water, a workout's exercise), stacked with even gaps. Spacing is a 4 pt grid (`space(n) = n × 4`): 8 between items in a card, 12 to 16 inside cards, 16 page gutters. Sheets rise from the bottom up to 640 pt wide and 92% tall; dialogs are centred, up to 440 wide. On the web, content keeps these widths and chip rows wrap instead of scrolling sideways. Ask Bell floats bottom-right over Food, Train and Progress. Touch targets stay at 44 pt or more.

## Elevation & Depth

Flat at rest. Depth comes from tone: chalk page, white card, raised-chalk rows on the card. Shadows exist only on things that float above the page.

### Shadow Vocabulary
- **Float** (`shadowColor #000, opacity 0.25, radius 10 to 12, offset 0/4`): toasts, the Ask Bell button, the voice button, the selection bar.
- **Bubble** (`opacity 0.2, radius 8, offset 0/3`, plus a Chalk Line border): Bell's speech bubble above the button.
- **Backdrop** (`rgba(0,0,0,0.45)`): behind every sheet and dialog.

### Named Rules
**The Only Floaters Cast Shadows Rule.** Cards, rows and buttons never carry a shadow. If it doesn't float over the page, it's flat.

## Shapes

Soft, generous corners in four steps: **card** (18 pt) for cards, sheets and dialogs; **row** (12 pt) for buttons and list rows; **input** (10 pt) for text fields and inner items set on a card; **pill** (999) for chips, badges and the round Ask Bell button. Borders are 1 pt Chalk Line. A grouped set (supersets) is marked by a 4 pt accent bar on its left edge. Bell and the Forkbell mark share one silhouette: a kettlebell.

**The Four Corners Rule.** Use only 18, 12, 10 or pill. The 14, 16 and 8 pt corners found in some screens are drift to bring back to these steps when those screens are next touched.

## Components

### Buttons
Heavy, rounded and easy to hit.
- **Shape:** gently rounded (12 pt).
- **Filled (main action):** iron with chalk words, 16 pt bold, 14 pt vertical padding, usually full width.
- **Small:** the same look at 15 pt words and 12 pt padding, for actions inside a card.
- **Quiet:** white with a 1 pt Chalk Line border and iron words; the second choice beside a filled button.
- **Accent / subject:** accent (or a plate colour for its own subject) with on-accent words, for Bell actions and subject-specific adds.
- **Press:** haptic tap on phones; no hover-only states.

### Chips
- **Style:** pill, white with a 1 pt Chalk Line border, 15 pt bold iron words, 12 pt side padding and at least 44 pt tall.
- **State:** selected chips fill with iron and chalk words. On phones a chip row scrolls sideways; on the web it wraps.

### Cards / Containers
- **Corner Style:** 18 pt.
- **Background:** Card White on Chalk.
- **Shadow Strategy:** none (see Elevation).
- **Border:** none by default; 1 pt Chalk Line when a card sits on white.
- **Internal Padding:** 16 pt, 8 to 12 pt gaps.

### Inputs / Fields
- **Style:** 16 pt body text, Chalk fill (Card White when on chalk), 1 pt Chalk Line border, 10 pt corners, 12 pt padding. Placeholder in #7C868C.
- **Error:** a Danger tint note beneath, words in Over red.

### Navigation
- **Tab bar:** five tabs (Food, Train, Progress, Bell, Settings) on Card White with a Chalk Line top edge. Ionicons filled when active and outlined when not; Bell's tab is Bell's own outline. Active tint is the accent, inactive Soft Iron, labels 11 pt bold.
- **Pages:** no header bar; each page starts with its 32 pt Page Title.

### Progress Ring (signature)
A circular track in Empty Track with a plate-colour arc for the subject. The value sits in the middle in Stat or Page Title figures with a Caption unit below. Past 100% (with 2% leeway) the whole ring turns Over red and stays full.

### Bell (signature)
A kettlebell with a face, drawn in the accent with on-accent features. Moods: happy, thinking, listening, curious, excited, proud, concerned. When alive it blinks, bobs and glances around. All motion stops with Reduce Motion.

### Sheets and Toasts
Sheets rise from the bottom with 18 pt top corners over the 45% backdrop. Toasts are iron pills (14 pt corners) with chalk words and the Float shadow.

## Do's and Don'ts

### Do:
- **Do** keep the page Chalk and cards Card White; let colour come only from plates, water, the accent and the over state.
- **Do** use iron filled buttons for the main action and the quiet outlined button for the second choice.
- **Do** use the `*-text` twin whenever words take a plate colour.
- **Do** use tabular figures and 800 weight for headline numbers.
- **Do** keep corners to 18 / 12 / 10 / pill, and touch targets at 44 pt or more.
- **Do** define every new colour in both the light and dark palettes in `lib/theme.ts`.
- **Do** stop Bell's motion and the confetti when Reduce Motion is on.

### Don't:
- **Don't** make it look clinical or medical: no cold hospital blues, grey form-heavy screens or lab-report tables.
- **Don't** put shadows on cards, rows or buttons.
- **Don't** use a plate colour for something outside its subject (no yellow for a non-carb warning, no green for "good food").
- **Don't** colour food as good or bad; red means over a goal, not a bad choice.
- **Don't** introduce a second typeface or one-off text sizes outside the scale.
- **Don't** hard-code hex values in screens; go through `color` so dark mode and the accent keep working.
