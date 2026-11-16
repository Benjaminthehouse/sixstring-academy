# `@/app/shell` — what the app shell gives a screen

```tsx
import { useImmersive, useScreenTitle, useRewardHold, openStats, openOnboarding, WeekStrip } from '@/app/shell';
```

The shell (`App.tsx` → `shell/Shell.tsx`) wraps every screen in `UIProvider` and renders it in
`<main id="main" data-route={routeName}>`: lazily from the registry, inside Suspense (a page-shaped
skeleton, `[data-shell-fallback]`) and an error boundary that resets on navigation (its panel offers "Try again", then "Reload the app"; see `shell/failure.ts`), with `{ params }`. A screen stays mounted
when only its params change. Unknown addresses are redirected to `#home`.

## Layout you can rely on

| | phones and tablets (< 900 px) | wide (≥ 900 px, `WIDE_LAYOUT_QUERY`) |
|---|---|---|
| chrome | sticky top bar, 52 px (`TOPBAR_HEIGHT`) + fixed bottom tab bar (`--nav-h`: 60 px, growing with the learner's text size, about 73 px at 200 %) | fixed sidebar, `--side-w` (15 rem) |

- The document scrolls (`window.scrollY`). A new screen starts at the top; back / forward returns
  to where that screen was left.
- Start with `<Page>`: it owns the gutters and the 72 rem maximum (`width="full"` for edge-to-edge
  tools). `<main>` adds no side padding, so a screen without `Page` sits flush against the edges (only a root element with no class at all is given the page column, as a safety net).
- `<main>` sets `--sticky-top` and `--sticky-bottom`: use `top: var(--sticky-top, 0px)` /
  `bottom: var(--sticky-bottom, 0px)` for sticky parts and they clear the bars (`ActionBar` does).
- The shell's bars are `z-index: 30`: above sticky page parts (20), below dialogs (200). Toasts are kept clear of the tab bar at every width, and below 900 px the document has `scroll-padding` for both bars, so keyboard focus and `scrollIntoView` never land underneath them. While an immersive screen hides the tab bar, `--nav-h` is `0px` document-wide, so nothing keeps clear of a bar that is not there (a `bare` screen drops the top-bar padding too).
- Bottom controls: an `ActionBar` stuck at the bottom publishes `--action-bar-h` and toasts sit above it; bottom controls that are not an ActionBar use the kit's `useBottomClearance(ref)`. Toasts also move up clear of the practice session bar while it shows. An immersive phone screen with neither (the kit has not marked `<html data-ui-bottom-controls>`) gets its toasts at the top, under the slim top bar, so they never sit on a transport it keeps at the bottom: call `useBottomClearance` on your bottom controls to keep toasts at the bottom, above them.
- At a large text size the phone top bar gives way instead of running off its edge: the repeated title first, then the brand mark, the chips' padding, the gems chip (`shell/topbarFit.ts`).

## Screen title

The browser tab reads `<route title> · Sixstring Academy`; the phone top bar repeats the title once your `h1` has scrolled out of view, or at once when the screen's heading is hidden (`<Page hideHeader>`). It re-checks on scroll, resize and any change inside `<main>`, so a screen that hides its header part-way (the live camera view once the camera starts) gets its title in the bar at scroll 0. `useScreenTitle('Greensleeves')` names the particular thing on screen (pass `null` while it loads).

## Immersive screens

`useImmersive(active = true, level = 'focus')` while a lesson, song, game or camera is running:

| level | phones | wide |
|---|---|---|
| `'focus'` | tab bar gone; top bar is a Back button + title | sidebar folds to an icon rail |
| `'bare'` | top bar gone too: **you must offer the way out** | icon rail |
| `'none'` | full navigation, even on a route immersive by default | full sidebar |

Immersive by default (`IMMERSIVE_ROUTES`): `play`, `camera`, `learn--<unit>--<lesson>`,
`teachers--<id>--<lesson>`, `arcade--<game>`. A `useImmersive` call always wins over that list.

## Feedback is the shell's job

Report what happened through `core/progress` (`recordActivity`, `loseHeart`, `awardXp` …) and the shell reacts everywhere: **one reward card** per moment (XP, a met goal and streak, quests, achievements, crowns: a headline and a line for each of the rest; one piece of news alone is shown as itself, the XP as one growing "+N XP"), confetti, a dialog for a new level, a streak milestone and gold/platinum achievements, a flash when a heart is lost, warnings (saving failed, out of hearts) as toasts of their own, and the matching interface sound. Events of one moment are merged (`feedback/digest.ts`).
The kit shows at most three toasts at once, and the shell's are news (`news: true`): they never cover an open Sheet or Modal (a results sheet, a summary dialog) but show once it closes, and wait their turn rather than push a reply off. Confetti and the sound still come at the moment itself.
So **do not** toast XP, levels, streaks, quests or achievements yourself or fire confetti for them; show the `ActivityResult` in your own summary instead. Sounds for answers (`correct` …) are yours.

**Rewards wait for the end of a lesson.** `useRewardHold(active)` (also `holdRewards()` → release, `rewardsHeld()`) while a lesson's steps are on screen, and `false` on its summary: when the hold starts, the moment that is over leaves the screen (its card was seen on the summary), and a level-up or milestone dialog nobody has answered is put away; news that arrives meanwhile waits (several moments merge, `mergePlans`), then shows when the hold ends (the next summary, or the learner leaving): dialogs first, then one card. A lost heart's flash still shows at once. The teachers' lessons hold while not done; the Theory Path holds from the moment a lesson address opens until its summary. Before this, going straight from a summary to the next lesson left "+XP / achievement / daily goal" and the level-up dialog over its first card for several seconds. Other runners that should not be interrupted (an arcade round, the practice runner) can call it the same way.
The reward card fits the learner's text: its icons are sized in rem, its lines wrap at words (never "3 achieveme…"), and on a phone with large text (the card under 18 rem wide, `compactCard`) each line is just its title, so the card stays small over a summary.
The shell also calls `installAudioUnlock()` and keeps the engine in line with `prefs.sound` (master volume; the `ui` bus is muted when interface sounds are off), so just call `playUi`.

## Keyboard and Back

- The first Tab stop is "Jump to content" (focuses `<main>`); when the screen has a main action the second is "Jump to “Start session”", named after it: the last control of its `ActionBar`, else the first primary `Button` / `LinkButton` or the `PlayButton` in `<main>` (`data-ui-primary`; `findMainAction()` in `shell/Shell.tsx`).
- The phone's Back gesture closes an open kit Sheet or Modal instead of leaving the screen (kit digest). A sheet opened from the address that `redirect()`s when it closes (`#songs--add`) does not come back on the next Back.

## Small things to call

- `openStats('goal' | 'streak' | 'hearts' | 'gems')` opens the sheet behind the top-bar chips
  (goal size, week strip, heart refill, relaxed mode). Use it instead of rebuilding those panels.
- `openOnboarding()` reopens the first-run flow (also `#home--setup`). It opens by itself only on
  `#home`, for a learner who has neither finished nor skipped it; other routes are never interrupted.
- `<WeekStrip days={useWeek()} size="sm" />` draws the week as Today and the stats sheet do.
- `DESTINATIONS`, `destinationFor(route)`, `hubRoutes(section)`: the five tabs and what is under them.
- `@/app/teachers`: `TEACHERS`, `teacherById`, `teacherForLevel` (name, level, welcome line, avatar
  tone), so the three teachers are named the same way everywhere.

## Hubs, search, Today, e2e

- `inHub: true` gives a route a hub card and a sidebar entry; `needs: ['mic']` / `['camera']` adds
  a "No microphone here" badge where the host cannot provide the device.
- Hub search matches title, blurb and `ROUTE_KEYWORDS` in `hubs/search.ts` (words a learner types).
- Today's plan ticks a step when its activity kind was recorded today, and "Continue" comes from
  `recents`: pass `route`, `params`, `title` and `progress` to `recordActivity` (or `touchRecent`)
  and your screen shows up there with a working link.
- e2e: a fresh profile gets the first-run dialog on `#home` only; click "Skip for now" or pre-seed
  `localStorage['ssa:shell.onboarding'] = '{"skipped":true}'`. The shell root carries
  `data-layout="phone|wide"` and `data-immersive="none|focus|bare"`. `node e2e/shell-smoke.cjs [--only tuner,scales]` opens every route on a phone and a desktop and fails on the error panel, sideways scroll (measure `scrollWidth` against `documentElement.clientWidth`: on touch viewports `innerWidth` grows with the overflow) or any `console.error`. `node e2e/overlays.cjs` checks toasts against sheets, the three-toast limit, bottom clearance, 200 % text, Back with a sheet open and the skip links.

## Tool addresses (open a tool set up, for lessons)

A lesson that sends the learner to a tool can link to it ready to go instead of listing what to
tap. The params below follow the route name (`href('metronome', 't80', '3-4')`, or a task's
`params`); they are slug-safe, go in any order after the fixed part, and one a tool does not know
is ignored. Each tool applies them once per arrival, the same as setting the controls by hand (so
they stay set), unless marked "this visit". Details and the code helpers are in each feature's
`API.md`.

| tool | address | params |
|---|---|---|
| Metronome | `#metronome--…` | `t80` tempo · `3-4`, `6-8`, `7-8-3-2-2` time signature (+ grouping) · `beats` `eighth` `triplet` `sixteenth` `swing` `quintuplet` `sextuplet` subdivision · `swing-60` swing % (50–75) · `accents-2-3-1` per beat, 0 silent to 3 strong · `gap-1-1` silent bars. A whole setup: what is not named goes back to plain 4/4. |
| Chord trainer | `#chords--trainer--<chord>--<chord>…` | `minute` · `timed` · `check` (ring-true, mic) mode · `t70` tempo (40–160) · `beats-2` beats per chord (8, 4, 2, 1); a tempo or beats alone means `timed` |
| Chord page | `#chords--<chord>[--n]` | n = the page's nth shape; the page links on to the camera ("See it on your guitar") |
| Live camera | `#camera--chord--<slug>[--n]` | see `src/features/camera/model/address.ts` (scales, chords, songs, find-the-note) |
| Jam | `#progressions--<id>--<key>--jam--…` | `t96` tempo · a band style id (`waltz`, `blues-shuffle` …) · `x2` times through then an ending · `hide-chart` chord names hidden until "Show the chords" (this visit) |
| Tuner | `#tuner--…` | a tuning id or slugged name (`dadgad`, `drop-d`, `open-g`, `eb-standard`, `standard`): becomes the learner's tuning app-wide · `capo-2` (this visit) |
| Fretboard drill | `#fretboard--drill--<id>--…` | `strings-6-5` · `frets-4-8` · `naturals` / `all-notes` (stored as the drill settings) · `note-c`, `note-f-sharp` one note to find (this round; find-the-note, find-every-note, play-the-note) |

```text
#metronome--t50--3-4--accents-2-3-1                    a sarabande, beat 2 strong
#chords--trainer--g-major--d-7--timed--t70--beats-2     G to D7 in time
#progressions--blues-12-bar--a--jam--t84--x2           two times through at 84
#progressions--pop-axis--a--jam--hide-chart             chords by ear, then reveal
#tuner--dadgad                                          retune to DADGAD
#fretboard--drill--sprint--string-6--frets-0-3--naturals
#fretboard--drill--find-every-note--note-c
```

Tested parsers for content checks: `parseMetronomeParams` (`@/features/metronome/model/address`),
`trainerSetup` (`@/features/chords/model/trainer`), `parseAddress` (`@/features/progressions/model/address`),
`parseTunerParams` (`@/features/tuner/model/address`), `parseDrillParams` (`@/features/fretboard/core/address`).
