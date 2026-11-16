# The teachers' courses: how to write a unit

Three courses, one per teacher, each written as one file per unit:

```text
src/content/teachers/
  mia/mia-hello-guitar.ts      Mia, unit 1 (the model: read it first)
  dev/dev-barre-chords.ts      Dev, unit 1 (when written)
  elena/...                    Prof. Varga
  outline.ts                   every unit and lesson of the reviewed plan (generated, checked)
  profiles.ts                  who the teachers are; lines in their voices
  tasks.ts                     helpers for task steps
  types.ts, compile.ts, index.ts   the format and the registry
```

The plan is the source: `src/content/plan/TEACHERS.md` (read "Writing a lesson from an entry") and
`src/content/plan/teachers.json`. Nothing else needs editing to add a unit: the registry finds the
file, loads it lazily (each unit is its own chunk, fetched when that teacher's course is opened),
puts it in the plan's order and the teacher's map shows it. Units not written yet are listed on the
teacher's page as "later in the course", so write them in any order.

## Steps

1. **Pick a unit from the plan** and name the file after its id: `mia/mia-first-chords.ts`. Only
   unit ids from the plan are allowed (the test lists stray files).
2. **Copy the shape of `mia/mia-hello-guitar.ts`**: one `TeacherLesson` per plan entry, in plan
   order, then `export default` a `TeacherUnit`.
3. **One lesson per plan entry**, with the plan's slug as `id` (the part after the second slash of
   `mia/mia-first-chords/em-first`) and `skill: 'teacher:<teacher>:<slug>'`. The plan's `minutes`
   are the whole lesson with practice in the tools; the engine part is 2 to 5 minutes, and the rest
   are task steps (below).
4. **Write in the teacher's voice** (the build brief and `profiles.ts`): Mia patient and concrete,
   one idea at a time, no word before it is explained; Dev a bandmate who ties everything to a song
   tonight; Prof. Varga rigorous, dry, respectful. Keep every fact of the plan's `explain`.
5. **Run the test** until it is green: `npx vitest run src/content/teachers`. It runs the lesson
   engine's validator (errors **and** warnings must be empty), checks the ids against the plan, every
   task's address, song and exercise, the milestone, and the course's own rules.
6. **Look at it**: `node e2e/shot.cjs teachers--mia--<lesson-slug> --mobile` (and without
   `--mobile`), and play it through once on `#teachers--mia`.

## The format

Everything is the lesson engine's format (`src/lessons/API.md`, Part B: cards, exercises, generated
steps, figures, facts, text markup, limits) with two small additions.

### Task steps: "go and do this in the app, then come back"

A plan practice step that happens in a tool (`Player`, `Tuner`, `Metronome`, `Technique`, `Chords`,
`Practice Plan` ...) becomes a task. Build it with a helper so the address is right:

```ts
import { playerTask, techniqueTask, toolTask } from '../tasks';

playerTask({ id: 'buns-wait', title: 'Hot Cross Buns in wait mode', song: 'hot-cross-buns', mode: 'wait', minutes: 6,
  body: 'In wait mode the music waits until you play each right note ...', tip: 'When it feels easy ...' }),
playerTask({ id: 'show-band', title: 'Rehearse with the band', song: 'hot-cross-buns', mode: 'flow', tempo: 85, bars: [1, 4], minutes: 4, body: '...' }),
toolTask({ id: 'tune-all', title: 'Tune all six strings', tool: 'tuner', minutes: 4, body: '...' }),
techniqueTask({ id: 'alternate-open', title: 'Down-up on every string', exercise: 'tech-alternate-open', minutes: 5, body: '...' }),
toolTask({ id: 'changes', title: 'One-minute changes', tool: 'chords', params: ['trainer', 'g-major', 'c-major'], minutes: 3, body: '...' }),
```

- `title` (at most 40 characters), `body` (at most 320) and `tip` (160) are the teacher's words:
  what to do there, for how long, what to listen for. The learner sees an "Open the Player" button,
  their place in the lesson is kept, and when they come back the card welcomes them and says what
  the app saw them do there (a song played, a tuning session, an exercise). "Skip for now" is always
  offered.
- Player `tempo` is a percentage of the song's own tempo (the Player's `t70`); give the BPM in the
  words ("about 60 BPM").
- **A song that is not in the library yet** (`src/content/songs`) needs a `fallback`: another tool
  and its own `body` (and `title` if the task's title names the piece), used until the song lands.
  The test insists.
- A task is never the first step of a lesson, never two cards in a row before a question (it counts
  as a card), and never the last step: end on an exercise.

For the engine a task is a teaching card with the same id (`compile.ts`), so sessions, saving,
progress and the course map need nothing new.

### Drawings on cards

A teaching card may carry `art: 'guitar-parts' | 'posture' | 'pick-grip' | 'fretting'` (and needs
an `id`): drawings the engine's figures cannot make, drawn by the teachers screen. Ask for a new one
in your report rather than describing a picture in words.

### The milestone

A unit whose plan has a `milestone` lesson declares it:

```ts
milestone: {
  lesson: 'first-week-show',        // the plan's milestone lesson
  step: 'show',                     // the id of its performance: a play step (play-note, play-chord, play-phrase) with an alternative, and the lesson's last step
  piece: 'Hot Cross Buns',
  song: 'hot-cross-buns',           // to play it again with the band in the Player's flow mode
  celebrate: 'You played a whole tune, start to finish ...',   // the teacher's words when the unit is done (at most 240)
},
```

The screen frames the performance as a show and, when the lesson is finished, the teacher celebrates
the unit. `celebrate` may say the learner played the piece: it is shown only when the microphone heard
the performance. When the show was answered by its tapping version (no microphone, as always in the
Claude artifact host), the teacher's `tappedShow` line from `profiles.ts` is shown instead, which never
claims the piece was played.

### Unit glossary

Terms the unit introduces (`{t:headstock}`) go in the unit's `glossary`; units' glossaries are merged
into the course's. Do not redefine a built-in term (the validator warns).

## Rules the content follows

- **Correctness is the product.** Notes, frets, shapes and tab are checked by the engine's validator
  against the instrument; music shared with the song library is cross-checked by the test (Mia's Hot
  Cross Buns is the library's melody). Add a test of that kind for every piece you transcribe.
- **Copyright.** Only what the plan names: public-domain or traditional tunes and original studies.
  Never name, quote or tab a modern song in these courses.
- Mia never says *vibrato* or *dominant* (she never teaches them); terms are taught where first used.
- No lesson asks anyone to play into pain: say what is normal (sore fingertips at first) and what is
  not (aching joints, numbness, sharp pain: stop and rest).
- Facts: two to four per lesson, the things a guitarist knows cold in a year. Fact ids are stored
  as review cards (`<teacher>:<fact id>`): never rename one.

## The outline

`outline.ts` is generated from the plan. If the plan changes, the test fails with the difference;
regenerate it with:

```bash
node -e '
const j=require("./src/content/plan/teachers.json");const q=(s)=>JSON.stringify(s).slice(1,-1).replace(/\x27/g,"\\\x27");
let o="/**\n * The outline of the three reviewed course plans (`src/content/plan/teachers.json`): every unit and\n * lesson in plan order, with titles, kinds and minutes. Generated from the plan, so the app knows the\n * whole journey (and can show units not written yet) without bundling the 350 kB plan.\n * `registry.test.ts` checks it equals the plan; to regenerate, see README.md (\"The outline\").\n */\nimport type { CourseOutline } from \x27./types\x27;\n\n/** Every course of the plan, beginner to expert. */\nexport const OUTLINE: readonly CourseOutline[] = [\n";
for(const c of j.courses){o+=`  {\n    id: \x27${c.id}\x27,\n    title: \x27${q(c.title)}\x27,\n    units: [\n`;for(const u of c.units){o+=`      {\n        id: \x27${u.id}\x27,\n        title: \x27${q(u.title)}\x27,\n        goal: \x27${q(u.goal)}\x27,\n        lessons: [\n`;for(const l of u.lessons)o+=`          [\x27${l.id.split("/")[2]}\x27, \x27${q(l.title)}\x27, \x27${l.kind}\x27, ${l.minutes}],\n`;o+="        ],\n      },\n";}o+="    ],\n  },\n";}
require("fs").writeFileSync("src/content/teachers/outline.ts",o+"];\n");'
```
