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
import { playerTask, recordTask, techniqueTask, theoryTask, toolTask } from '../tasks';

playerTask({ id: 'buns-wait', title: 'Hot Cross Buns in wait mode', song: 'hot-cross-buns', mode: 'wait', minutes: 6,
  body: 'In wait mode the music waits until you play each right note ...', tip: 'When it feels easy ...' }),
playerTask({ id: 'show-band', title: 'Rehearse with the band', song: 'hot-cross-buns', mode: 'flow', tempo: 85, bars: [1, 4], minutes: 4, body: '...' }),
toolTask({ id: 'tune-all', title: 'Tune all six strings', tool: 'tuner', minutes: 4, body: '...' }),
techniqueTask({ id: 'alternate-open', title: 'Down-up on every string', exercise: 'tech-alternate-open', minutes: 5, body: '...' }),
toolTask({ id: 'changes', title: 'One-minute changes', tool: 'chords', params: ['trainer', 'g-major', 'c-major'], minutes: 3, body: '...' }),
theoryTask({ id: 'numbers', title: 'String numbers, in theory', lesson: 'the-six-strings/string-numbers', minutes: 4, body: '...' }),
recordTask({ id: 'record-show', title: 'Record your show', label: 'hot-cross-buns-week-1', minutes: 3, body: '...' }),
toolTask({ id: 'scan-it', title: 'Scan a page of tab', tool: 'scan', minutes: 5, body: '...' }),
```

The tools: `player`, `tuner`, `metronome`, `technique`, `chords`, `practice`, `rhythm`, `ear`, `fretboard`,
`scales`, `arcade`, `progressions`, `scan` (Scan & Import, `#scan`), `record` (the Recorder,
`#record--<label>`: the label, a slug, names the take) and `theory` (a Theory Path lesson,
`#learn--<unit>--<lesson>`, named as the plan's theory links are: `'unit/lesson'`; the test checks
it is a lesson of the path, and one ahead of the learner still opens, with a note saying so).
Many tools take more params that open them set up (a tempo, a time signature, a tuning): see "Tool
addresses" in `src/app/API.md`. A tool whose screen is not in the app yet (no route) uses the
task's fallback, or the task can only be skipped.

- `title` (at most 40 characters), `body` (at most 320) and `tip` (160) are the teacher's words:
  what to do there, for how long, what to listen for. The learner sees an "Open the Player" button,
  their place in the lesson is kept, and when they come back the card welcomes them and says what
  the app saw them do there (a song played, a tuning session, an exercise). "Skip for now" is always
  offered.
- Player `tempo` is a percentage of the song's own tempo (the Player's `t70`); give the BPM in the
  words ("about 60 BPM").
- **A song that is not in the library yet** (`src/content/songs`) needs a `fallback`: another tool
  and its own `body` (and `title` if the task's title names the piece), used until the song lands.
  The test insists. Once the song is in the library the task opens it, never the fallback
  (`resolveTaskTarget`), so the task's own words must fit the library's version: the test fails a
  task that mentions a chorus or verse 2 the library's song does not have.
- **Played along in listen mode** (a Player task with no `wait`, `flow` or `tap`): the Player judges
  nothing and logs a listen run only after 30 s in one go, so when the learner comes back and goes
  on, the lesson logs the time away as practice of that song (at most the task's minutes and two
  more) and says so on the card.
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
into the course's. Do not redefine a built-in term (the validator warns). Each unit's test compiles
the unit alone, so a unit that uses a term defines it, even when an earlier unit already did; the
course keeps the first definition, so **every unit that defines a term uses the same words**
(`registry.test.ts` fails on two versions). To improve a definition, change it in every unit that
has it. Never define a term with the answer to a question that links it (the secondary dominant of
`{c:Gm7}` in F is not the glossary's example).

### Theory links

The plan lists, for most lessons, the Theory Path lessons behind it (`theory`: `'unit/lesson'`).
`outline.ts` carries them as `THEORY_LINKS` (generated with the outline; the test checks each is a
lesson of the path), and the lesson's summary lists them ("The theory behind it"), each a tap away,
with a tick for those done. A link is a side trip: the finished lesson's address (which would start
the lesson over) is replaced by the teacher's course page, so Back from the theory lesson lands
there.

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
o+="];\n\n/**\n * The Theory Path lessons each teacher lesson links to (the plan\x27s `theory`: `\x27unit/lesson\x27`), by lesson\n * slug. Lessons without links are left out. Shown on the lesson\x27s summary, so the ideas behind it are\n * one tap away.\n */\nexport const THEORY_LINKS: Readonly<Record<string, readonly string[]>> = {\n";
for(const c of j.courses)for(const u of c.units)for(const l of u.lessons)if(l.theory&&l.theory.length)o+=`  \x27${l.id.split("/")[2]}\x27: [${l.theory.map((t)=>`\x27${t}\x27`).join(", ")}],\n`;
require("fs").writeFileSync("src/content/teachers/outline.ts",o+"};\n");'
```

It writes `OUTLINE` and, after it, `THEORY_LINKS` (each lesson's Theory Path links).
