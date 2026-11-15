# `@/app/shell` — what the app shell gives a screen

```tsx
import { useImmersive, useScreenTitle, openStats, openOnboarding, WeekStrip } from '@/app/shell';
```

The shell (`App.tsx` → `shell/Shell.tsx`) wraps every screen in `UIProvider` and renders it in
`<main id="main" data-route={routeName}>`: lazily from the registry, inside Suspense (a page-shaped
skeleton) and an error boundary that resets on navigation, with `{ params }`. A screen keeps its
state when only the params change. Unknown addresses are redirected to `#home`.

## Layout you can rely on

| | phones and tablets (< 900 px) | wide (≥ 900 px, `WIDE_LAYOUT_QUERY`) |
|---|---|---|
| chrome | sticky top bar, 52 px (`TOPBAR_HEIGHT`) + fixed bottom tab bar (`--nav-h`) | fixed sidebar, `--side-w` (15 rem) |

- The document scrolls (`window.scrollY`). A new screen starts at the top; back / forward returns
  to where that screen was left.
- Start with `<Page>`: it owns the gutters and the 72 rem maximum (`width="full"` for edge-to-edge
  tools). `<main>` adds no side padding, so a screen without `Page` sits flush against the edges.
- `<main>` sets `--sticky-top` and `--sticky-bottom`: use `top: var(--sticky-top, 0px)` /
  `bottom: var(--sticky-bottom, 0px)` for sticky parts and they clear the bars (`ActionBar` does).
- The shell's bars are `z-index: 30`: above sticky page parts (20), below dialogs (200). Toasts
  are kept clear of the tab bar at every width.

## Screen title

The browser tab reads `<route title> · Sixstring Academy`; the phone top bar repeats the title once
your `h1` has scrolled out of view (so use `Page title`, and the name never shows twice).
`useScreenTitle('Greensleeves')` names the particular thing on screen; pass `null` while loading.

## Immersive screens

`useImmersive(active = true, level = 'focus')` while a lesson, song, game or camera is running:

| level | phones | wide |
|---|---|---|
| `'focus'` | tab bar gone; top bar is a Back button + title | sidebar folds to an icon rail |
| `'bare'` | top bar gone too: **you must offer the way out** | icon rail |
| `'none'` | full navigation, even on a route immersive by default | full sidebar |

Immersive by default (`IMMERSIVE_ROUTES`): `play`, `camera`, `learn--<unit>--<lesson>`,
`teachers--<id>--<lesson>`, `arcade--<game>`. A `useImmersive` call always wins over that list;
`useImmersive(playing)` switches with your state. Combine with `useWakeLock(playing)` from `@/ui`.

## Feedback is the shell's job

Report what happened through `core/progress` (`recordActivity`, `loseHeart`, `awardXp` …) and the
shell reacts everywhere: one growing "+N XP" toast, goal-met and streak toast with confetti, quest
and achievement toasts, a dialog for a new level, a streak milestone and gold/platinum
achievements, a flash when a heart is lost, a warning if saving fails, and the matching interface
sound (`playUi`, when sounds are on). Events of one moment are merged (`feedback/digest.ts`): at
most three toasts, dialogs first. So **do not** toast XP, levels, streaks, quests or achievements
yourself or fire confetti for them; show the `ActivityResult` in your own summary instead. Sounds
for answers (`correct`, `wrong` …) remain yours.

## Small things to call

- `openStats('goal' | 'streak' | 'hearts' | 'gems')` opens the sheet behind the top-bar chips
  (goal size, week strip, heart refill, relaxed mode). Use it instead of rebuilding those panels.
- `openOnboarding()` reopens the first-run flow (also `#home--setup`). It opens by itself only on
  `#home`, for a learner who has neither finished nor skipped it; other routes are never interrupted.
- `<WeekStrip days={useWeek()} size="sm" />` draws the week as Today and the stats sheet do.
- `DESTINATIONS`, `destinationFor(route)`, `hubRoutes(section)`: the five tabs and what is under them.
- `@/app/teachers`: `TEACHERS`, `teacherById`, `teacherForLevel` (name, first name, level, a line
  of welcome, avatar tone), so the three teachers are named the same way everywhere.

## Hubs, search, Today, e2e

- A route with `inHub: true` gets a hub card and a sidebar entry automatically. `needs: ['mic']` /
  `['camera']` adds a "No microphone here" badge where the host cannot provide the device.
- Hub search matches title, blurb and `ROUTE_KEYWORDS` in `hubs/search.ts` (words a learner types).
- Today's plan ticks a step when its activity kind was recorded today, and "Continue" comes from
  `recents`: pass `route`, `params`, `title` and `progress` to `recordActivity` (or `touchRecent`)
  and your screen shows up there with a working link.
- e2e: a fresh profile gets the first-run dialog on `#home` only; click "Skip for now" or pre-seed
  `localStorage['ssa:shell.onboarding'] = '{"skipped":true}'`. The shell root carries
  `data-layout="phone|wide"` and `data-immersive="none|focus|bare"`.
