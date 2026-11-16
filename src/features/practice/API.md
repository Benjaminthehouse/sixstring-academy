# Practice Plan (`#practice`) — what other code can use

The screen: `#practice` (plan), `#practice--routines`, `#practice--journal`, `#practice--goals`,
`#practice--session` (runner, then summary). The global "session in progress" bar is
`SessionBar.tsx`, mounted lazily by `src/app/App.tsx`.

## Ask for a plan (pure, no React)

```ts
import { suggestPracticePlan } from '@/features/practice/model/signals';
import { getProgress, getProgressStore } from '@/core/progress';

const blocks = suggestPracticePlan(getProgress(), getProgressStore().now(), 10);
// [{ area: 'warmup', minutes: 2, title, goal, reason, reasonKind, target: { route, params, label }, ... }, ...]
// minutes add up to exactly 10; every target.route exists in the route registry.

// With the app's content (technique exercises, songs and studies, unit drills): a lazy chunk.
const library = await loadPracticeLibrary();          // model/library-loader.ts; usePracticeLibrary() in React
suggestPracticePlan(state, now, 10, { journal, goals }, library);
```

- `buildPlan(input: PlannerInput): PlanBlock[]` (`model/planner.ts`) is the planner itself;
  `plannerInputFrom(state, now, { journal, goals }, minutes, seed?)` (`model/signals.ts`) reads its input
  from the progress store. Same input, same plan (a reload never reshuffles); `seed` gives "a new mix".
- Priorities: pinned focus goals, then the most faded (rusty) skill, then a song from 15 minutes up,
  then areas drawn by weight (level, rust, weak spots, what was neglected this week, due reviews,
  a little less of the last session's areas). The level weights follow Today's plan
  (`features/home/plan.ts`).
- `DURATIONS` = 5, 10, 15, 30, 45, 60. `planShape(minutes)`: warm-up first, free play last from 30.
- A beginner's later exercises (F barre chord, A minor pentatonic box 1, G major in two octaves,
  hammer-ons) wait until `practiceDays` (days with any practice, read by `plannerInputFrom`) reaches
  their `beginnerFrom`. Leave `practiceDays` out and nothing is held back.
- Exercises name the skills they train with the progress digest's lower-case ids (`chord:f`,
  `chord-change:g-c`, `scale:a-minor-pentatonic:box-1`, `technique:tech-spider`, `song:<id>`).
- **The content library** (`model/library.ts`, `PRACTICE_LIBRARY`) joins the hand-written pool when
  the input carries it (`PlannerInput.library`): every timed technique exercise of the plan's list
  (`#technique--<id>`; guides and the warm-up / cool-down routines are not blocks), every built-in
  song and study (`#play--<id>`; studies of changes, scales, licks and grooves go to those areas),
  and a drill of each Theory Path unit (`#learn--<unit>--practice`), offered only for a unit with a
  finished lesson (`PlannerInput.studiedUnits`, read by `plannerInputFrom`). Items suit a level by
  the plan's 1-10 difficulty (`LEVEL_BANDS`: beginner 1-3, intermediate 3-6, expert 6-10, as the
  Technique screen's); a beginner waits 7 practice days for level 2 and 14 for level 3. The practice
  screen imports the library; Today loads it lazily (`usePracticeLibrary`) and holds its drill and
  music steps as skeletons until it is in (1.5 s at most), then keeps that one plan for the day; the
  session bar never loads it (`weight.test.ts` checks the import graph).

## Start a session from elsewhere

```ts
import { startPracticeSession } from '@/features/practice/session/controller';
import { navigate } from '@/app/router';
startPracticeSession(blocks, { title: '10-minute plan' });   // in a click handler
navigate('practice', 'session');
```

`useSession()` / `getSessionView()` give the running session; it survives reloads (`practice.session`
in platform storage) and logs itself once when it ends: `recordActivity({ kind: 'practice', ... })`
with the practised seconds (2 XP a minute, so a session as long as the daily goal's minutes meets
it), `markSkill(id, {})` for each rusty skill whose refresh block was worked through, and a journal
entry. Time other screens recorded while the session's clock ran is not counted twice: the session
keeps the wall-clock spans it counted (`SessionState.runs`, pauses left out) and `overlapSeconds(log,
runs)` subtracts only activities inside them, each moment once; an activity done during a pause
takes nothing off.

## Data this feature keeps

`practice.data` (routines, journal, focus goals, weekly minutes goal) and `practice.draft` (the plan
being edited) in platform storage. `model/store.ts` reads routines with the light parser of
`model/routine-data.ts` (an exercise id is checked for its form only; one that no longer exists
runs as planner's choice for its area), so the session bar on every screen loads neither the
exercise pool nor the planner.
