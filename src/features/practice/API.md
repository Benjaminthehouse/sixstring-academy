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
  `chord-change:g-c`, `scale:a-minor-pentatonic:box-1`).

## Start a session from elsewhere

```ts
import { startPracticeSession } from '@/features/practice/session/controller';
import { navigate } from '@/app/router';
startPracticeSession(blocks, { title: '10-minute plan' });   // in a click handler
navigate('practice', 'session');
```

`useSession()` / `getSessionView()` give the running session; it survives reloads (`practice.session`
in platform storage) and logs itself once when it ends: `recordActivity({ kind: 'practice', ... })`
with the practised seconds (time other screens already recorded during it is not counted twice),
`markSkill(id, {})` for each rusty skill whose refresh block was worked through, and a journal entry.

## Data this feature keeps

`practice.data` (routines, journal, focus goals, weekly minutes goal) and `practice.draft` (the plan
being edited) in platform storage. They are not part of the progress export or cloud sync.
