# `@/core/progress` — progress and gamification

The single source of truth for what the learner has done and prefers. Screens **report** activity
here and **read** from here; they never keep their own persistent counters. Framework-free store
with a pure reducer (`reduce(state, action, { now, timeZone })`), an injectable clock, versioned
and debounced persistence through `core/platform/storage` (key `progress`), cross-tab sync, and
React bindings. Everything below is exported from `@/core/progress`.

## State (`ProgressState`, plain JSON)

| slice | holds |
|---|---|
| `profile` | `name`, `avatar` (id from `AVATARS`), `experience` (`beginner/intermediate/expert`), `teacher` (`mia/dev/elena`), `onboarded` |
| `prefs` | `dailyGoalXp` (10/20/30/50), `handedness`, `tuningId`, `a4` (415–466), `theme` (`system/light/dark`), `noteNaming` (`letters/solfege/german`), `accidentals` (`auto/sharps/flats`), `fretboard {frets 12–24, wood, inlay, labels: notes/degrees}`, `accent`, `sound {volume 0–1, guitarTone, clickSound, uiSounds}`, `mic {deviceId, sensitivity 0–1}`, `camera {deviceId, mirrored}`, `motion` (`system/reduce/full`), `notation` (`tab` / `tab+notation`), `ai {enabled}` (opt-in flag only, never a key), `unlimitedHearts`, `review {newPerDay, reviewsPerDay}`, `weekStart` |
| `xp` | `total`, `byTag` (theory, scales, chords, songs, fretboard, ear, rhythm, technique, memory, tools, practice), `boost` |
| `days[YYYY-MM-DD]` | per local day: `xp`, `goal`, `met`, `frozen?`, `sec`, `n` (activities), `kinds` (seconds per kind) |
| `streak` | `current`, `longest`, `lastGoalDay`, `freezes` (0–2), `milestones` |
| `hearts`, `gems`, `cosmetics` | `{count, regenFrom}`, `{balance, earned, spent}`, owned cosmetic ids |
| `skills[id]` | `attempts`, `completions`, `perfects`, `bestScore`, `lastScore`, `bestAccuracy`, `lastAccuracy`, `history` (last 20, %), `timeSec`, `mastery` 0–5, `stars` 0–3, `completed`, `lastAt`, `data` (your small JSON) |
| `srs` | review cards (`items[id]`) and today's counters |
| `log`, `recents`, `favourites` | last 300 sessions, last 12 opened items, bookmarks keyed `kind:id` |
| `quests`, `achievements`, `stats` | 3 daily quests + weekly challenge, unlock times, lifetime counters |
| `meta` | `rev`, `updatedAt`, `deviceId`, `today` (the local day the state is rolled to) |

## Reading (React)

```tsx
const xp = useProgress((s) => s.xp.total);            // re-renders only when this value changes
const level = useProgress(selectLevel);               // memoised select* selectors return stable objects
const pair = useProgress((s) => ({ g: s.gems.balance, h: s.hearts.count }), shallowEqual); // new object => pass shallowEqual
```

Ready-made hooks: `usePrefs() useProfile() useLevel() useDailyGoal() useStreak() useWeek() useQuests()
useAchievements() useGems() useHearts() useXpBoost() useSkill(id) useIsFavourite(kind, id) useFavourites(kind?)
useRecents() useContinue() useReviewCounts(kinds?) useXpHistory(days) useHeatmap(weeks)
useProgressEvent(type, handler) useProgressStore()`. `useHearts` and `useXpBoost` follow the clock by themselves.

Selectors (pure; `now` = `store.now()`): `selectLevel selectDailyGoal selectStreak selectWeek selectQuests
selectAchievements selectPracticeTotals selectContinue` (memoised), and `heartsOf(s, now) canStartLesson(s, now)
xpBoostOf(s, now) xpHistory(s, days) practiceHeatmap(s, weeks) minutesByKind(s, 'today'|'week'|'all')
skillView(s, id, now) skillBest(record) skillsWithPrefix(s, prefix) rustySkills(s, now, {prefix, limit}) masterySummary(s, prefix)
dueReviews(s, now, {kinds, limit, includeNew}) reviewCountsOf(s, now) favouritesOf(s, kind?) isFavourite(s, kind, id)
shopOf(s, now)`. Outside React: `getProgress()` returns the current state, and
`subscribeSelector(getProgressStore(), selector, listener, isEqual?)` calls back only when a slice changes.

## Writing (typed actions)

`recordActivity(input)` · `loseHeart()` · `refillHearts('gift')` · `buy(itemId)` · `equipCosmetic(id)` ·
`setPrefs(deepPartial)` · `setProfile(patch)` · `setDailyGoal(xp)` · `completeOnboarding({name, avatar, experience, teacher?, dailyGoalXp, handedness})` ·
`addReviewItems([{id, kind, ref?}])` · `gradeReview(id, 'again'|'hard'|'good'|'easy')` · `removeReviewItems(ids)` ·
`toggleFavourite({kind, id, title?, route?, params?})` · `setFavourite(item, on)` · `touchRecent({route, params?, title, kind?, fraction?})` · `removeRecent(key)` ·
`setSkillData(id, json)` · `markSkill(id, {completed?, masteryAtLeast?, stars?, data?})` · `awardXp(amount, source, tag?)` ·
`grantGems(amount, reason)` · `startXpBoost(multiplier, minutes)` · `exportProgress()` · `importProgress(data, 'replace'|'newest-wins')` ·
`resetProgress({keepPrefs?})` · `progressChangeStamp()` · `onProgressEvent(type, handler)`.
Every input is validated and clamped; invalid values are ignored, never stored.

## `recordActivity` — the one entry point

Call it once when the learner **finishes or leaves** something. In one transaction it updates XP, level,
daily goal, streak, hearts, the skill, quests, achievements, the log and the recents list, emits the
events, and returns an `ActivityResult` for your summary screen:
`{ xp, baseXp, multiplier, totalXp, level, leveledUp, goal {xp, goal, met, metNow}, streak {current, extended}, hearts, gems, skill {mastery, masteryBefore, stars, starsBefore, bestScore, newBest, firstCompletion, attempts} | null, quests[], achievements[] }`.

| field | meaning |
|---|---|
| `kind` (required) | `theory-lesson teacher-lesson review scale-practice scale-game chord-practice chord-change progression song fretboard ear rhythm technique tuner metronome camera scan practice other` |
| `id` | skill id (see conventions); updates the skill registry |
| `xp` | base XP before boosts. **Omit it** to get the guideline amount below |
| `accuracy` 0–1, `score`, `stars`, `mistakes`, `perfect`, `combo`, `count` | what was measured. `count` = cards / notes named / chord changes |
| `durationSec` | seconds actually spent (feeds practice time and per-minute XP) |
| `completed` | default `true`; pass `false` for a failed or abandoned attempt (half XP, no crowns, no quest credit) |
| `title`, `route`, `params`, `progress` 0–1 | for the log and "continue where you left off" |
| `data`, `meta` | small JSON kept on the skill; a few numbers kept with the log entry |

```ts
// Theory lesson (hearts: call loseHeart() on each mistake while it runs)
const r = recordActivity({ kind: 'theory-lesson', id: 'theory:unit-3:lesson-2', title: 'The major scale formula',
  accuracy: correct / total, mistakes, durationSec, route: 'learn', params: ['unit-3', 'lesson-2'] });
// r.xp, r.leveledUp, r.goal.metNow, r.skill?.mastery, r.quests, r.achievements -> summary screen

// Game round (stars are derived from accuracy for scale-game: 60 % / 80 % / 95 %)
recordActivity({ kind: 'scale-game', id: 'scale:a-minor-pentatonic:box-1', title: 'Fret Rush: A minor pentatonic, box 1',
  accuracy: hits / notes, score, combo: bestCombo, durationSec, route: 'arcade', params: ['fret-rush'] });

// Song play-through (or progress when the learner leaves early)
recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', accuracy, stars, durationSec,
  completed: reachedEnd, progress: position / length, route: 'play', params: ['greensleeves'], data: { tempo } });

// Tuner session (5 XP, at most once a day; still counts for the quest and achievements every time)
recordActivity({ kind: 'tuner', durationSec, route: 'tuner' });
```

**Skill ids** (lower-case; achievements, quests and the planner read the prefixes): `scale:<scale>:<position>` (boxes
`box-1` … `box-5`), `chord:<symbol>` (first completion = a new chord), `chord-change:<a>-<b>`, `progression:<id>` (kind
`progression`, id from `progressionSkillId` in `@/content/progressions`; the builder: `progression:builder`), `song:<id>`,
`technique:<id>`, `theory:<unit>:<lesson>`, `teacher:<mia|dev|elena>:<lesson>`, `ear:<drill>`, `rhythm:<activity>:<level>`.
`markSkill` sets flags: `fretboard:string-6` (a string learned), `teacher:mia:course` (a course finished). **Bests**: only
finished attempts set `bestScore`/`bestAccuracy`, so read them via `skillBest(record)` or `skillView(...).best` (null until set): never "Best 0%".

### XP guideline (`xpFor(kind, factors)`; `XP_RULES`) — daily goals 10 / 20 / 30 / 50 XP = `DAILY_GOALS[].minutes` 5 / 10 / 15 / 25 of planned practice

| kind | formula (clamped to range) | range | daily cap |
|---|---|---|---|
| theory-lesson | 10, +5 if perfect | 10–15 | |
| teacher-lesson | 15, +5 if perfect | 15–20 | |
| review | 2 + 1 per card (`count`) | 5–20 | |
| scale-game | 4 + 6 × accuracy, +2 if perfect | 4–12 | |
| fretboard, ear, rhythm | 3 + 5 × accuracy, +2 if perfect | 3–10 | |
| chord-change | 3 + 1/min + 5 × accuracy | 3–12 | |
| scale-practice, chord-practice, technique, progression | 2 + 1.5/min | 2–20 | |
| song | 8 + 1/min + 8 × accuracy, +4 if perfect | 8–30 | |
| practice (planned routine) | 2/min | 2–120 | |
| tuner | 5 | 5 | 5 |
| metronome | 1/min | 1–10 | 20 |
| camera | 3 + 1/min | 3–10 | 20 |
| scan | 10 per import | 10 | 20 |

Not completed = half; one activity never awards more than 250. Anything new: about 2 XP a focused minute, 10–15 a lesson.

## Rules

- **Daily goal / streak.** A day counts when its XP reaches the goal in effect (latched; lowering the goal applies
  to today at once). The streak is the number of consecutive local days with the goal met. Days are local calendar
  days (`YYYY-MM-DD`), so DST and time zones are safe; a traveller's gap is judged in the zone they are in now.
  A missed day is covered by a streak freeze automatically (max 2 held, 60 gems each); freezes are only spent when
  they bridge every missed day. A frozen day keeps the streak but does not add to it. `selectStreak().practiceDays`
  counts days with any practice. Milestones: 3, 7, 14, 30, 50, 100, 200, 365.
- **Hearts.** Max 5; `loseHeart()` per mistake in a theory lesson; one returns every 20 minutes; a finished
  `review` or `practice` activity refills all, any other playing activity gives one back; 20 gems refill;
  `prefs.unlimitedHearts` switches the mechanic off. Gate lessons with `canStartLesson(state, now)`.
- **Crowns** (`mastery` 0–5): finished attempts at ≥ 60 / 70 / 80 / 85 / 90 % accuracy, needing 1 / 2 / 2 / 3 / 3 of
  them; an attempt without `accuracy` can only earn the first crown. Crowns are never lost; `strength` halves every
  2 / 4 / 7 / 14 / 30 / 60 days (by crown level) and a skill under 50 % is "rusty" (`rustySkills`).
- **Levels.** Level n→n+1 costs 20·n XP up to level 25, then a flat 500 (`levelInfo`, `LEVEL_TITLES`: Open String … Virtuoso).
- **Gems.** Earned: daily quest 5–10, all three +10, weekly challenge 30–40, level-up 10 (25 every fifth), streak
  milestones 10–500, first perfect run of a lesson 2, achievements 5 / 10 / 20 / 40 by tier. Spent in the shop
  (`CONSUMABLES`: streak-freeze 60, heart-refill 20, xp-boost 40; `COSMETICS`: woods, inlays, accents 100–400).
- **Spaced repetition** (SM-2 with 1 min / 10 min learning steps): `addReviewItems` once per card (`kind` such as
  `theory-fact`, `fret-note`, `interval`, `chord-shape`), study `dueReviews(...)` in order, call `gradeReview` per
  answer (this is what advances the "review N cards" quest), and close the session with
  `recordActivity({ kind: 'review', count, accuracy, durationSec })`. `previewGrades` labels the answer buttons.
  Grading a card that is not due yet is safe (extra practice): its schedule is kept and the daily cap is not used.
- **Quests.** `pickDailyQuests(day, level)` is deterministic: one core, one study, one play quest per day, targets by
  level band. Progress comes from `recordActivity` / `gradeReview`; gems are paid on completion. Render `selectQuests`.
- **Achievements.** 104 in `ACHIEVEMENTS` (name, description, lucide `icon`, tier, `secret`); `selectAchievements`
  gives unlock time and progress; secret ones are `hidden` until earned.

## Events (`onProgressEvent(type, handler)` / `useProgressEvent`)

`xp-gained` `level-up` `goal-met` `streak-extended` `streak-milestone` `streak-broken` `streak-freeze-used`
`heart-lost` `hearts-refilled` `gems-changed` `achievement-unlocked` `quest-completed` `quests-all-completed`
`skill-levelled-up` `xp-boost-started` `cosmetic-unlocked` `data-imported` `data-reset` `save-failed` — a
discriminated union `ProgressEvent` (each has `at`). Events nobody listens to yet are held for a minute and
handed to the first listener, so the shell also hears what happened while the app was starting.

```ts
useProgressEvent('achievement-unlocked', (e) => toast(`${e.name}: +${e.gems} gems`));
useProgressEvent('level-up', (e) => celebrate(`Level ${e.to}: ${e.title}`));
```

## Store, persistence, portability

- `getProgressStore()` creates the app's store on first use and connects it to the page: cross-tab sync (storage
  event), save on hide, a tick every minute for the day rollover, and `data-theme` / `data-motion` / `data-accent`
  on `<html>` (`applyAppearance`; removed for `system` / default). **Shell: call it once at startup.**
- Saves are debounced (400 ms) and versioned (`SCHEMA_VERSION`, `MIGRATIONS`). Loading never throws: unreadable data
  is copied to `progress.corrupt` and yesterday's backup (`progress.bak`) is used; damaged fields fall back to
  defaults (`store.loadReport`). `save-failed` fires once if the browser cannot store anything.
- `exportProgress()` → one JSON object `{ app, kind, v, exportedAt, stamp, state }`; `importProgress(objectOrText,
  strategy)` validates and returns `{ ok }` or `{ ok: false, reason }`; `newest-wins` merges per item (see
  `merge.ts`). `progressChangeStamp()` changes whenever the state does: compare it in `store.subscribe` to sync.
- Tests: `createProgressStore({ clock, storage: memoryStorage(), timers })` + `createActions(() => store)`, or
  `setProgressStore(store)` to point the hooks and action functions at it. `testkit.ts` has `makeRig`, `testClock`.
- `store.forgetSafetyCopies` drops `progress.bak` / `.corrupt` / `.newer` (a reset calls it after the store's `flush`).

## Your data, complete: backup, import, reset (`backup.ts`)

`exportProgress` / `importProgress` / `resetProgress` cover the progress alone. **Me > Your data uses these instead**,
which also cover every other thing the learner keeps (the practice journal, routines, goals, arcade records, saved
progressions and drafts, strumming patterns, rhythm calibration, presets, custom tunings, screen settings, the speech
switch: every key `classifyKey` in `@/core/platform/storage-scope` calls learner data) and the learner's own songs.

```ts
const file = await createBackup();        // { app, kind: 'backup', v: 3, exportedAt, progress, data, songs }
const read = readBackup(textOrObject, { now, timeZone, deviceId });   // also v2 progress exports, v1 saves: format 'progress-only'
const preview = previewBackup(read, { state, data: learnerData, songs: myIds }, 'newest-wins', now);   // learnerData: platform getLearnerData's snapshot
// preview.rows: [{ id: 'journal', label: 'Practice journal', unit, before: 12, after: 15 }, ...], .settings, .songs, .progressOnly, .damaged
const r = await applyBackup(read, 'replace' | 'newest-wins');   // { ok, reload, undo, changed, failed, songs, skipped } | { ok: false, reason }
const z = await resetEverything({ keepPrefs?, deleteSongs? });   // { reload, undo, songsDeleted, songsUndoable, erased }
if (r.reload) leaveNotice({ tone: 'ok', title, undo: r.undo });   // then reload the page; takeNotice() after the reload
pendingUndo()  undoLastChange()  discardUndo()   countLearnerData(data)   localSongs()
```

- **Replace**: the progress and the learner data become the file's (keys only this device has go). **Merge**: the
  progress merges per item as before; each data key as `mergeEntry` says (lists joined by id, settings from the side
  changed last). **Songs**: an import never deletes one; missing songs are added with their own id; a song in both
  takes the file's copy with Replace and the later copy with Merge. A damaged entry is skipped (`skipped`,
  `songs.skipped`); a damaged record (`isDamagedRecord`: a journal that is not a list ...) also goes in `read.damaged`
  and this device's copy stays, with Replace too (`preview.damaged`, `damagedLabels(read)` name it). Preview counts
  stop at what the feature keeps (`DATA_ITEMS[].max`). A progress-only file leaves the rest alone. When the browser
  refuses the copy for Undo, Replace changes nothing (`{ ok: false, reason: 'no-room' }`); Merge goes on, `undo: false`.
- **Reset** erases the progress, every learner key and work in progress (`session` keys); it keeps the API key, the
  device's bookkeeping, and the songs unless `deleteSongs`. `keepPrefs` keeps the name, the progress preferences and
  every learner key that is not in `DATA_ITEMS` (settings), and erases what was made or earned.
- **Undo** (`data.undo`, device-only) holds the state from before the last import or reset for 30 minutes; deleted or
  overwritten songs are kept for it up to 1.5 MB (`songsUndoable`). It puts that state back whole: what was done since goes too.
- **Reload**: features keep some data in memory, so when learner data changed (`reload: true`) the caller reloads the
  page (after a dialog has closed: it steps history back, which would cancel an earlier reload). Where storage does not
  survive a reload, the change is announced in place with `storage` events instead.
- **Convention for features**: keep what the learner makes in platform storage under your feature's prefix, and it
  is backed up, synced and reset with no further work. Add a `DATA_RULES` line only for a key that is about the device
  or the screen, work in progress, or secret; add a `DATA_ITEMS` line (label, unit, shape, count) for what the learner
  makes or earns, so Your data counts it, "keep my settings" erases it and a merge joins its lists (an unlisted key is
  a setting, merged whole). If you cache a key in memory, re-read it on the window `storage` event.
