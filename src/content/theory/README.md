# The Theory Path content (`src/content/theory`)

The lessons of the Theory Path (`#learn`). The syllabus fixes **what** each lesson teaches
(`src/content/plan/theory-path.json`, overview in `THEORY-PATH.md`); this folder holds the lessons
as written, in the lesson engine's format (`src/lessons/API.md`, Part B).

```text
units/<unit-id>.ts        one file per unit: `export default` the Unit (the only file you add)
units/<unit-id>.test.ts   optional: your unit's own cross-checks against the engines
glossary.ts               the course's extra glossary terms ({t:id})
outline.ts                GENERATED from the syllabus: every unit and lesson, for the map
index.ts                  the registry: lazy loading, assembly, prerequisites past gaps
theory.test.ts            validates every written unit and checks it against the syllabus
```

**Model unit:** `units/sound-and-pitch.ts` (unit 1) and its test. Copy its shape.

## How a unit gets onto the path

Drop `units/<unit-id>.ts` in this folder. Nothing else to register: the index finds every file in
`units/` (`import.meta.glob`), loads each unit as its own chunk, and puts it in syllabus order.
Units without a file show on the map as "coming soon", with their real number and title. A
prerequisite on a lesson that is not written yet is replaced by that lesson's own prerequisites,
so the path past a gap stays open in the order the syllabus intends.

```ts
import type { Lesson, Unit } from '@/lessons';

const U = 'the-six-strings';
const stringNumbers: Lesson = { id: 'string-numbers', skill: `theory:${U}:string-numbers`, /* ... */ };

const unit: Unit = { id: U, title: 'The six strings', theme: 'basics', description: '...', lessons: [/* ... */], checkpoint: { /* ... */ } };
export default unit;
```

## Run the checks

```bash
npx vitest run src/content/theory          # the registry, every written unit, the outline
npx vitest run src/content/theory/units/the-six-strings.test.ts   # your own cross-checks
npx tsc --noEmit 2>&1 | grep src/content/theory
```

`theory.test.ts` must pass with **no problems at all**: `validateCourse` returns errors *and*
warnings, and both fail the test. Each message names the unit, lesson and step and says how to
fix it. Then open the lesson in the app: `#learn--<unit-id>--<lesson-id>` (or tap it on the map).

## Checklist for one unit

From the syllabus entry (`theory-path.json`), for every lesson, in order:

- [ ] `id` is the slug after the slash; `skill` is `theory:<unit-id>:<lesson-id>`; `minutes` as planned.
- [ ] `requires`: leave it out and the registry uses the syllabus prerequisites, or write exactly
      the planned slugs (the test compares them). `[]` only for the very first lesson.
- [ ] `title` as planned. Over 40 characters (a handful are), shorten it as little as possible.
- [ ] `teaches` from the entry; at most 110 characters, so shorten long ones without changing the idea.
- [ ] Open with a teaching card showing the `onTheGuitar` figure; then the planned exercises in
      order (each planned type must appear; a generated drill producing that type counts); then
      the planned `generators` as generated steps, their pools limited to what has been taught.
- [ ] Every planned fact becomes one `Fact` (front: a question, back: the fact), with an `ask`
      exercise where one fits (never a microphone exercise). Tag the exercise that tests it with `fact`.
- [ ] Fact ids are specific (`pitch-meaning`, not `pitch`): they are stored forever as
      `theory-path:<fact id>`, never rename one, and they must be unique across the whole path.
- [ ] Every `play-*` exercise has a tapping `alternative` that practises the same thing.
- [ ] The answers in brackets in `exercises[].idea` are the expected answers: derive them with
      `@/core/theory` / `@/core/guitar`, and cross-check numbers, frets and spellings in
      `units/<unit-id>.test.ts` (see the model unit's test).
- [ ] Music symbols are tagged (`{n:F#}`, `{c:Am}`, `{i:m3}`, `{r:IV}`); terms are linked once
      with `{t:id}`. A term the built-in glossary lacks goes in `glossary.ts`, in a block headed by
      your unit id.

For the unit:

- [ ] `id`, `title` (at most 32 characters: shorten the planned title if needed), `theme` exactly
      as in the THEORY-PATH.md table, `description` (the planned summary, at most 140 characters).
- [ ] A `checkpoint` that covers what the entry's `checkpoint` line lists: authored `steps`
      (6 to 20 exercises, no cards or flashcards) or a `sample`. Two or three mistakes allowed.
- [ ] No lesson or unit id is `checkpoint`, `practice`, `review` or `placement` (route words).

## How the screen uses it

- **On the go.** The map marks lessons that listen to the guitar (play steps) and lessons with
  listening questions. With "Guitar" off, play steps run as their alternatives; with "Sound" off,
  listening questions (listen-choice, tap-rhythm, ear drills, prompts with an audio figure) are left
  out and listening facts are reviewed as flashcards. Write every lesson so it still teaches with
  those steps gone: do not make a listening question the only place an idea is asked.
- **Placement.** "Find my level" asks a few questions per unit, drawn from the unit's checkpoint
  steps (or its lessons), so a good checkpoint makes a good placement test.
- **Levels.** Lessons run at the level of their stage (beginner, intermediate, expert), which sets
  tap-rhythm timing tolerances and the starting difficulty of generated drills.

## Known limits

- A lesson `Sound` cannot set loudness or pick position, although the audio engine can
  (`velocity`, `brightness` in `@/core/audio` `PluckOptions`). Unit 1 therefore asks the learner
  to try "soft and loud" and "near the bridge and over the neck" on the guitar, and its listening
  questions use what the synth plays truthfully (the same pitch twice; the same pitch on two strings).
- There is no figure of a guitar body (picking zones, a swinging string): use a fretboard figure
  and words.
