# `@/lessons` — the lesson engine

The pure, UI-free heart of the Theory Path (`#learn`) and the teachers' courses (`#teachers`):
the content format, rich text, figures as data, graders for 17 exercise types, 40 exercise
generators, the session reducer (lesson, checkpoint, practice, review), course map state and
`validateCourse`. Everything runs in Node; nothing here touches the DOM, Web Audio or the progress
store directly (effects are handed to `applyEffects`). Import from the barrel only:
`import { startSession, reduceSession, validateCourse } from '@/lessons'`.

- **Part A** is for screen builders: sessions, effects, the course map, what to render and what to send back.
- **Part B** is the **authoring guide** for content writers: the exact format, every exercise type,
  every generator, figures, text markup, the limits, and how to write a good lesson.
- **Part C** is the **UI** (`@/lessons/ui`): the lesson player, the course map, the review card and
  their parts, ready for the Theory Path and teacher screens. Gallery: `#kit-lessons`.

Conventions are the app's: notes are ASCII (`F#`, `Bb3`) and always **sounding** pitch; string 1 is
the thinnest; fret 0 is the open string; shapes run low string to high (`'x32010'`). Tests:
`npx vitest run src/lessons`. `api-doc.test.ts` keeps the generated parts of this file (marked
`<!-- gen:… -->`) equal to the code; after changing a generator, a limit, the glossary or an example,
run `WRITE_API_DOC=1 npx vitest run src/lessons/api-doc.test.ts`.

---

# Part A — for screen builders

## A1. A lesson in twenty lines

```ts
import { startSession, reduceSession, applyEffects, currentStep, sessionReport, saveSession,
         type SessionAction, type SessionState, type EffectResults } from '@/lessons';
import { getProgress } from '@/core/progress';

let state: SessionState = startSession({ mode: 'lesson', course, lessonId }, getProgress(), Date.now(), { route: 'learn', params: [unitId, lessonId] });
let results: EffectResults = applyEffects([]);

function dispatch(action: SessionAction) {
  const step = reduceSession(state, action);        // pure
  state = step.state;
  const r = applyEffects(step.effects);             // hearts, XP, cards ... through the real progress actions
  if (r.activity) results = r;                      // keep the one that carries the ActivityResult
  saveSession(state);                               // an unfinished session survives closing the app
}

const step = currentStep(state);                    // { kind: 'card', card } | { kind: 'exercise', exercise, presentation, attempt, alternative, usesMic }
dispatch({ type: 'answer', answer: { type: 'choice', selected: [2] }, at: Date.now() });   // -> state.phase === 'feedback', state.feedback.result
dispatch({ type: 'continue', at: Date.now() });     // next step, or state.phase === 'done' with state.summary
if (state.phase === 'done') show(sessionReport(state.summary!, results));
```

## A2. Starting a session

`createSession(source, options): SessionState` is the pure constructor. `startSession(source, progress, now, extras?)`
fills the options from the learner's progress (`sessionOptionsFor(source, progress, now, extras?)`): hearts (null
when unlimited), note naming, the lesson's skill record (for the crown in the summary) and the starting difficulty.

| `source` (`SessionSource`) | What it runs |
|---|---|
| `{ mode: 'lesson', course, lessonId }` | The lesson's steps in order. |
| `{ mode: 'checkpoint', course, unitId }` | The unit's checkpoint: its authored `steps`, or `sample` exercises drawn evenly from the unit's lessons. Works on any unit, reached or not (testing out may jump ahead). |
| `{ mode: 'practice', course, unitId, lessonIds?, size? }` | A drill of `size` (default `DEFAULT_DRILL_SIZE` = 10) exercises drawn from the unit; generated steps lose their authored seed so every drill is fresh. `practiceSource(course, unitId, progress, size?)` limits it to lessons already finished. |
| `{ mode: 'review', courses, cards, size? }` | Due spaced-repetition cards (default `DEFAULT_REVIEW_SIZE` = 20). `reviewSource(courses, progress, now, size?)` builds it; `dueFactCards(courses, progress, now, limit?)` lists the cards (kind `FACT_CARD_KIND` = `'theory-fact'`). A fact with an `ask` is asked as that exercise, any other as a flashcard (`flashcardOf(fact)`). |

`SessionOptions`: `seed` (any fresh integer per session), `now`, `hearts?` (number, or `null` = off), `mic?`
(`false` = play exercises start as their alternatives), `difficulty?` (0–1), `skill?` (the lesson's `SkillRecord`,
`null` = never tried), `naming?`, `route?` / `params?` (stored with the activity). `StartExtras` (for
`startSession`): `seed? mic? route? params?`.

A session that cannot run is returned already finished (`phase: 'done'`, a `summary`, no effects): an unknown
lesson or unit, or a review with no known card, ends `completed` with `exercises: 0`; a theory lesson started
with no heart left ends `out-of-hearts` with `next: 'practice'`. Gate the Start button with `canStartLesson`
from `@/core/progress` anyway.

## A3. State, actions, selectors

`SessionState` is plain JSON. What a screen reads:

| field | meaning |
|---|---|
| `phase` | `'step'` (show `currentStep`), `'feedback'` (show `feedback`, then `continue`), `'done'` (show `summary`) |
| `feedback` | `{ result: GradeResult, answer, skipped, heartLost, willRetry }` after an answer or a skip |
| `hearts` | hearts left, or `null` when this session does not use hearts |
| `stats` | `asked firstTry answers right mistakes skipped combo bestCombo requeued dropped` |
| `mode title kind level courseId unitId lessonId skill` | what is running (`kind` is the progress activity kind it reports as) |
| `difficulty micOff total cleared queue` | adaptive difficulty 0–1; play exercises swapped; progress; remaining `SessionItem`s |
| `summary` / `outcome` | set when `phase === 'done'` |

`reduceSession(state, action): { state, effects }` (a `SessionStep`) — every action carries `at` (epoch ms):

| action | when |
|---|---|
| `{ type: 'answer', answer, at }` | the learner answered the current exercise (see A5 for the `Answer` of each type) |
| `{ type: 'skip', at }` | "I don't know": shows the answer, costs no heart, the exercise comes back |
| `{ type: 'continue', at }` | leave a card, or leave the feedback of an answer |
| `{ type: 'cant-play', scope: 'step' \| 'session', at }` | "I can't play right now": swap the play exercise for its alternative (this one, or all from now on) |
| `{ type: 'mic', available, at }` | the microphone went away (swap from now on) or came back (send this only when the learner asks to play again: the step on screen goes back to its microphone version too) |
| `{ type: 'pause', at }` / `{ type: 'resume', at, hearts? }` | screen hidden / shown; time away is not counted, `hearts` re-syncs the heart count |
| `{ type: 'quit', at }` | leave for good (records an unfinished attempt when something was answered) |

An action that makes no sense in the current phase returns the same state and no effects.

Selectors: `currentStep(state)`, `sessionProgress(state)` → `{ done, total, fraction, remaining }` (come-backs do not
move the bar backwards), `mistakesLeft(state)` (checkpoints), `sessionAccuracy(state)`, `sessionSeconds(state, now)`,
`isFinished(state)`. Lookups: `findLesson(course, id)`, `findUnit(course, id)`, `factIndex(courses)`,
`factCardId(courseId, factId)`, `flashcardOf(fact)`, `activityKindOf(course)`.

### The rules the reducer enforces

- **Wrong answers come back.** A wrong (or skipped) exercise returns `REQUEUE_GAP` (3) steps later, the same
  question, until it is answered right: at most `MAX_RETRIES` (2) come-backs per exercise and `MAX_REQUEUES` (8)
  per session, so nobody is trapped. `feedback.willRetry` says whether this one will return.
- **Hearts** are lost on wrong answers in **theory lessons only** (`course.teacher === 'none'`, mode `lesson`), as
  the progress rules say (`loseHeart()` per mistake in a theory lesson): never in teacher lessons, checkpoints,
  practice or review, never for a skip or a self-rated flashcard, never when `hearts` is `null` (unlimited hearts).
  At zero the lesson ends kindly with `outcome: 'out-of-hearts'` and `summary.next: 'practice'`; a finished
  practice or review session refills the hearts (that is `@/core/progress`'s rule). An answer that finishes the
  lesson on the last heart still completes it.
- **Checkpoints** are tests: no come-backs, and more than `maxMistakes` (default `CHECKPOINT_MISTAKES` = 3)
  mistakes ends them with `outcome: 'failed'` (`summary.next: 'lessons'`). A pass marks every lesson of the unit done.
- **A lesson needs a pass mark.** Reaching the end is not enough: `lessonScore(state)` counts each question 1 when
  right the first time, 1/2 when right on its come-back, 0 when never right; below `LESSON_PASS_SCORE` (0.5) the lesson
  ends `failed` with `summary.next: 'retry'`: it counts as practice (`completed: false`, XP in proportion to what was
  learned, so "I don't know" through a whole lesson earns none), adds no cards, gives no crown and finishes no unit.
  The player says so kindly and offers "Try again". Checkpoints, practice and reviews keep their own rules.
- **Combo** counts right answers in a row (`stats.combo`, `bestCombo`).
- **Time** counts per step up to `MAX_STEP_MS` (90 s); `pause` / `resume` leave time away out.
- **Adaptive difficulty** moves only on generated exercises (A9).

### The summary

`state.summary: SessionSummary` — `mode outcome title exercises accuracy firstTry mistakes perfect bestCombo
durationSec xp crown factsAdded cardsReviewed heartsLeft missed unlocked score next`. `accuracy` is the share of
exercises answered right at the **first** attempt; `score` is `lessonScore` (above). `xp` is the guideline amount (`xpFor`: a theory lesson 10, 15
when perfect; leaving early earns the unfinished half share in proportion to what was done); `crown` is
`{ before, after, gained }` predicted with the progress module's own rule (null when no skill record was given).
`missed` lists the prompts never answered right ("worth another look"); `unlocked` the lessons a passed checkpoint
marked done. `sessionReport(summary, effectResults): SessionReport` adds what the store really did: `xpAwarded
multiplier leveledUp level goalMetNow streakExtended streak gems quests achievements hearts` (and the stored crown).
`outcome`: `completed | out-of-hearts | failed | quit` (`failed`: a checkpoint over its mistakes, or a lesson below
the pass mark); `next`: `continue | practice | lessons | retry | resume`.
The session also keeps `state.taught`: the chord symbols the course has shown up to this lesson (`chordsShown(lessons)`),
so feedback names a wrong chord shape only when it is a chord the learner has met.

## A4. Effects

The reducer never touches the progress store. It returns `SessionEffect`s and
`applyEffects(effects, port = progressPort())` carries them out (pass `progressPort(store)` in tests):

| effect | progress action | emitted when |
|---|---|---|
| `{ type: 'lose-heart' }` | `loseHeart()` | a wrong answer in a theory lesson |
| `{ type: 'grade-review', id, grade }` | `gradeReview(id, grade)` | every answer in a review (`again` when wrong, `good` when right, the rating for a flashcard) |
| `{ type: 'record-activity', input }` | `recordActivity(input)` | the session ends (kind `theory-lesson` / `teacher-lesson` / `practice` / `review`; a lesson sends its skill id and `data: { d }`, the difficulty it ended at; `completed: false` with partial XP when it ended early) |
| `{ type: 'add-cards', items }` | `addReviewItems(items)` | a lesson is completed: its `facts` become cards |
| `{ type: 'mark-skill', id, completed, masteryAtLeast }` | `markSkill(id, …)` | a checkpoint is passed: once per lesson of the unit |
| `{ type: 'skill-data', id, difficulty }` | `setSkillData(id, { …, d })` | a practice drill ends: remembers the difficulty (only on skills that already exist) |

`applyEffects` returns `EffectResults`: `{ activity: ActivityResult | null, heart, cardsAdded, reviews, skillsMarked }`.
Call it with the effects of **every** reducer step, in order. `ProgressPort` is the slice of the store it uses.

## A5. Rendering a step

`currentStep(state)` gives either a card (`CardStep`: `title? body figure? tip?`) or an exercise with its
`presentation` (the shuffled display order; answers still use the **authored** indexes):
`presentExercise(exercise, seed): Presentation` = `{ options?, left?, right?, tiles?, bank?, buttons? }`.

| exercise `type` | show | send as `Answer` | useful helpers |
|---|---|---|---|
| `choice` | options in `presentation.options` order (text and/or figure); checkboxes when `multiple` | `{ type: 'choice', selected: number[] }` | `correctOptions`, `optionLabel` |
| `true-false` | `statement`; True / False | `{ type: 'true-false', value }` | |
| `match-pairs` | left column in `presentation.left` order, right in `presentation.right` | `{ type: 'match-pairs', pairs: [left, right][] }` (every pairing the learner committed, wrong tries included) | |
| `order` | tiles in `presentation.tiles` order (tiles, then distractors) | `{ type: 'order', order: number[] }` | `orderTiles` |
| `fill-blanks` | `text` (blank tokens) and `presentation.bank` | `{ type: 'fill-blanks', blanks: (string \| null)[] }` (the bank word put in each blank) | `fillBank` |
| `type-answer` | a note keypad, number pad or text field by `answer.kind` / `input` | `{ type: 'type-answer', text }` | `checkText`, `specMarkup`, `specValue`, `specAccepted` |
| `listen-choice` | a play button for `sound` (`soundPlan`), then options | `{ type: 'listen-choice', selected }` | `describeSound` |
| `tap-rhythm` | notation and/or audio by `show`; count-in unless `start: 'first-tap'` | `{ type: 'tap-rhythm', taps: number[] }` seconds from beat one | `tapTargets`, `tapToleranceMs`, `RHYTHM_GRADING`, `MAX_LATENCY_MS` |
| `fretboard-find` | a neck from `frets[0]` to `frets[1]` with `shown` dots; tap positions | `{ type: 'fretboard-find', positions: { string, fret }[] }` | `findTargets`, `spellInterval` |
| `fretboard-name` | `position` (and `root`) on the neck; `presentation.buttons` or a keypad | `{ type: 'fretboard-name', text }` (a button's value as it is) | `fretboardNameSpec` |
| `chord-build` (`fingers`) | an empty chord grid; the learner places frets | `{ type: 'chord-build', frets: (number \| null)[] }` low to high | `referenceFrets`, `readFrets` |
| `chord-build` (`missing-note`) | `given` notes and `presentation.buttons` | `{ type: 'chord-build', text }` | `missingChordNote` |
| `staff-read` | the note on a staff (`resolveFigure({ kind: 'staff', notes: [note], key })`); buttons or keypad | `{ type: 'staff-read', text }` | `staffReadSpec` |
| `staff-place` | an empty staff; drag a note head, optional accidental | `{ type: 'staff-place', position, accidental? }` (position 0 = bottom line, within `STAFF_PLACE_RANGE`) | `staffPlaceTarget`, `keyAlteration`, `shownAccidental` |
| `play-note` / `play-chord` / `play-phrase` | the target (`where`, the chord shape, the tab) and a listening meter | whatever `listenFor` resolves with (A8) | `playNoteTarget`, `phraseMidi`, `PLAY_CHORD_THRESHOLD` |
| `flashcard` | `front`; reveal `back` (+ `backFigure`); Again / Hard / Good / Easy | `{ type: 'flashcard', rating }` | |

For every type: `promptOf(exercise)` and `explainOf(exercise)` give the prompt and the "why";
`exercise.hint` is one optional nudge; `exercise.figure` is shown with the prompt; `solve(exercise)` is a
correct `Answer` (for a "show me" button); `answerText(exercise)` is the right answer in plain words.
Button values of `fretboard-name`, `staff-read` and `chord-build` are plain (`'F#'`, `'m3'`, `'b3'`): format them
for display with the theory formatters.

`grade(exercise, answer, { level?, naming?, chordsTaught? }): GradeResult` is what the reducer calls (use it directly in a
gallery): `{ correct, score (0–1 partial credit), near?, invalid?, feedback }`.
`feedback` = `{ answer (markup of the right answer), explain, note? (a line about THIS answer), detail }`.
`near` says why a wrong answer was close: `enharmonic | octave | timing | incomplete | extra | case`.
`feedback.detail` is typed per exercise (`FeedbackDetail`): correct option indexes and each wrong pick's `why`;
right / wrong / unmatched pairs; wrong tile positions; per-blank verdicts; `expected` / `given` / `verdict` for
typed answers; per-note `TapVerdict`s (`hit | early | late | missed`, `errorMs`) with the measured latency
`offsetMs`; fretboard `targets hits wrong missed` (each with the note it sounds); the chord the learner really
built (`built`, `wrongStrings`); the placed staff note; what was played. `wrongAnswers(exercise)` lists the wrong
answers an exercise's own distractors offer (galleries and tests).

Words a beginner understands, never codes: a wrong chord shape gets `chordBuildNote` ("String 2 sounds B, which is
not in Am.", "No string plays G#, and E needs it", "The lowest string you play sounds C; C/G needs G at the bottom"),
named as a chord only when `nameableChord(built, chord, chordsTaught)` allows it (a common chord the course has
taught; never "Cmaj7/E"); the answer is the chord (`{c:Em}`) and the screen draws its box, never a fret string
such as `022000`. A slash chord is graded with its bass even with `accept: 'any-voicing'`. A tap-rhythm's answer is
its counting (`rhythmCounts(spec)`: "1, 2 &, (3) &, 4"), and the screen draws the rhythm, never the pattern code.
A fretboard-find with `strings` says "Right note, but on string 5: this one asks for string 6." for a right pitch
tapped elsewhere.

**Spelling in context.** Pitches that are heard or tapped are named in the music of the exercise, never with the
key-less commonest name: `exerciseSpelling(exercise)` is the context (its `key`; else the written note of a
play-note, the chord or scale of a fretboard-find, the chord of a play-chord or chord-build, the key a phrase's
notes imply), `spellPitch(midi, context, { octave? })` the name (C♯4 in A major, D♯4 in Für Elise, never D♭4).
`inferSpelling(midis)` is the key a set of pitches implies (null for a single pitch class), `keySpelling(key)`,
`spellingOfName(name)` (sharps or flats as a written name suggests), `tabMidi(notes, { tuning?, capo? })`. The
graders, the feedback and the play screens all use them.

Answer normalisers, used by the graders and usable for live input hints: `normalizeNote normalizeInterval
normalizeChord normalizeDegree normalizeRoman normalizeNumber normalizeText`, `compareNoteNames(a, b)`,
`checkText(spec, text, { naming? })`.

## A6. Rich text

Every text is `RichText` (`string | { text, say? }`) in the markup of B3. Render tokens, never HTML:

```ts
for (const t of tokenize(card.body, { glossary: glossaryFor(course) })) {
  // t.type: 'text' | 'note' | 'chord' | 'interval' | 'degree' | 'roman' | 'key' | 'term' | 'break' | 'blank'
  // every inline token has t.text (display) and t.say (speech) and may have t.bold / t.em;
  // symbols have t.value (ASCII); a term has t.id -> glossaryFor(course)(t.id)?.definition; a blank has t.index
}
formatToken(token, { system: prefs.noteNaming });   // note, chord and key tokens in the learner's naming system
speak(speakable(card.body), { voice: course.teacher === 'none' ? 'narrator' : course.teacher });
```

The UI's `RichText` keeps punctuation with the term or symbol before it and hyphenated number runs ("10-8-8",
"x-3-2-0-1-0") on one line. `plainText(text, { format? })`, `textLength(text)` (visible characters), `textKey(text)` (comparison key),
`parseRichText(text)` (tokens + `problems`), `describeSymbol(kind, raw)`, `looseSymbols(text)` (music symbols
typed as plain text), and the speech helpers `sayNote sayChord sayInterval sayDegree sayRoman sayKey`. Glossary:
`GLOSSARY`, `glossaryTerm(id)`, `glossaryFor(course)` (the built-in terms plus the course's own).

## A7. Figures and sounds

A figure is data (B4). `resolveFigure(figure)` returns everything a renderer needs, computed by the
engines, or `null` when it cannot be drawn (`figureProblems(figure)` says why):

| kind | resolved fields |
|---|---|
| `fretboard` | `tuning capo frets [lo, hi] board [lo, hi] root labels caption`, `dots[]`: `string fret midi note degree role label finger` (`frets` counts from the capo like the dots; `board` is the same window in frets on the wood, for `Fretboard`'s `frets` with `capo`: `boardFrets(window, capo)`) |
| `chord` | `symbol frets fingers barres baseFret midi tuning capo voicing caption`, `notes[]`: `string fret midi note degree` (`voicing` carries the capo for the box) |
| `staff` | `clef guitar key { name, fifths, accidentals, positions } time caption`, `notes[]`: `note midi position ledgerPositions accidental stem duration label` (position 0 = bottom line; `accidental` is what must be DRAWN, after the key signature) |
| `keyboard` | `from to` (MIDI, white keys), `keys[]`: `midi note label role black` |
| `circle` | `key { name, mode, fifths, accidentals } show`, `slots[12]`: `index major[] minor[] fifths majorState minorState` (`selected \| highlight \| null`) |
| `rhythm` | `time bars barTicks tempo counting onsetTimes`, `events[]`: `code tick ticks bar value dots triplet rest tied attack count` (`count` = "1", "&", "e", "a") |
| `tab` | `tuning capo time tempo totalTicks`, `notes[]`: `rest string fret midi note tick ticks duration technique` (`technique`: the note's bend, slides, legato, vibrato, or null) |
| `audio` | `plan: SoundPlan`, `strum` (the pattern slots, for drawing arrows), `label` |

A `Sound` becomes plain events with `soundPlan(sound): { events, duration, tempo, drone?, hold? }`; each `SoundEvent` is
`{ at (seconds), type: 'pluck' | 'strum' | 'click', midi[], duration, direction?, muted?, accent?, string?, technique? }`.
`technique` is a tab note's bend, vibrato, legato (hammer/pull/slide from the note before, which is kept ringing into
it) or slide in/out; `drone` (`{ midi, fifth }`) sounds under the whole plan; `hold` (`{ midi[], voice }`) is a chord
held under it while the plucks play over it. The lesson player (`schedulePlan`) hands these to the audio engine:
techniques as `pluck` options (`techniqueOptions(event)`), the drone with `startDrone({ when, duration })`, a held
chord with `playLineOverChord(hold.midi, planLine(plan), t0, { chordVoice })`. A plain schedule from scratch:

```ts
const t0 = audioNow() + 0.05;
for (const e of soundPlan(sound).events) {
  if (e.type === 'strum') strum(e.midi, t0 + e.at, { direction: e.direction, articulation: e.muted ? 'dead' : 'normal', duration: e.duration });
  else if (e.type === 'click') playClick('woodblock', e.accent ? 'accent' : 'beat', t0 + e.at);
  else for (const m of e.midi) pluck(m, t0 + e.at, { duration: e.duration, string: e.string });
}
```

`soundProblems(sound)`, `tabProblems(notes, { tuning?, capo?, techniques? })` (`techniques: false` makes any
technique a problem, as for play-phrase targets), `hasTechnique(note)`, `chordSoundMidi(symbol, opts)`, `voicingFor(symbol, frets)`,
`positionProblem(pos)`, `degreeSemitones(label)`. Rhythm notation helpers: `parseRhythm(spec)`,
`parseDuration(code)`, `durationCode(value)`, `parseStrum(pattern, grid)`, `rhythmOnsetTimes(spec, tempo)`,
`tickSeconds(tick, tempo)`, `countLabel(tick, time)`.

## A8. Microphone exercises

```ts
const tracker = new PitchTracker(trackerOptionsFor(exercise));      // chords need { chroma: true }
const started = await tracker.start();                              // from a tap
if (!started.ok) dispatch({ type: 'mic', available: false, at: Date.now() });   // the alternative takes over
const listening = listenFor(tracker, exercise, { level: state.level, a4: prefs.a4, onNote, onAttempt });
dispatch({ type: 'answer', answer: await listening, at: Date.now() });          // never rejects
// "I can't play right now":  listening.cancel(); dispatch({ type: 'cant-play', scope: 'session', at });
// "Done" on a phrase:        listening.finish();
```

`listenFor(source, exercise, opts): Listening` wires `waitForNote` / `waitForChord` / `NoteRecorder` and
resolves with an `Answer`: right as soon as the note, chord or phrase is heard; wrong after `PLAY_TRIES` (3) other
notes or failed strums, carrying what was heard so the feedback can say so. `noteWaitArgs(exercise)` and
`chordWaitArgs(exercise)` expose the arguments (tolerance `PLAY_TOLERANCE_CENTS` per level: 45 / 35 / 25 cents).
A chord is listened for as the shape the exercise shows (its `frets`, `capo` and `tuning`, else the library
shape): that shape's own pitch classes and lowest note, so shell, rootless and extended grips and power chords can
pass. A phrase is listened to for `phraseListenMs(exercise)`: twice its length at its tempo plus ten seconds, at
least `PHRASE_LISTEN_MIN_MS` (40 s).
`currentStep(state).usesMic` is true while the step still listens; after a swap `alternative` is true and the
exercise is an ordinary one. Always offer "I can't play right now" on a play step.

## A9. Adaptive difficulty

Generated exercises take a difficulty from 0 to 1: how much of each easiest-first pool is in play.
The session moves it by a weighted staircase after every generated answer (`nextDifficulty`: `STEP_UP` 0.04 when
right, `STEP_DOWN` 0.16 when wrong), which settles where the learner is right `TARGET_SUCCESS` (80 %) of the
time. `startingDifficulty(level, records)` picks the start from the learner's recent results for the skill
(`storedDifficulty(record)`, else the recent accuracies, else `START_DIFFICULTY[level]`); `startSession` does this
for you and the session writes it back. Also exported: `difficultyAfter(start, results)`, `successRate(results)`.

## A10. The course map

`courseMap(course, progress, now): CourseMap` — `{ courseId, units, next, done, total, fraction, crowns,
maxCrowns, finished, dueCards }`.

- `UnitNode`: `id title theme description state lessons done total fraction crowns maxCrowns dueForReview checkpoint`.
- `LessonNode`: `id title unitId skill minutes state crown completions bestAccuracy strength rusty dueCards
  dueForReview requires missing`.
- `state` (`NodeState`): `locked` (a prerequisite is unfinished: see `missing`), `available`, `current` (the first
  available lesson that is not done: the one `next` points at), `done` (its skill is completed).
- `checkpoint`: `{ state: 'available' | 'passed', ahead, completes }`, or `null` when the unit has none. Testing out
  is open on every unit not passed; `ahead` is true when the unit is not reached yet (word the button "Jump here"
  rather than "Test out"). `completes` lists the lessons a pass would mark done.
- `dueForReview`: a done lesson whose skill has gone rusty or whose fact cards are due.

`nextLesson(course, progress, now)`, `lessonNode(map, lessonId)`, `lessonsInOrder(course)`,
`prerequisites(course)` (resolved: an omitted `requires` means "the lesson before").
`checkpointUnlocks(course, unitId, progress, now)` → `{ completes, unlocks, next }`: what passing would mark
done, what that opens, and the lesson that would then be next.

## A11. Saving and restoring

`saveSession(state)` after every step (it clears the slot by itself once the session ends);
`loadSession({ mode, courseId?, unitId?, lessonId? }, { now, maxAgeMs? })` when the screen opens (null unless it
matches and is younger than `SESSION_MAX_AGE_MS`, 24 h); then
`dispatch({ type: 'resume', at: now, hearts })`. `clearSession(mode)` forgets it. One slot per mode
(`sessionStorageKey(mode)`), in platform storage. Lower level: `serializeSession(state)`,
`restoreSession(saved)` (null for damaged data or another `SESSION_VERSION`), `isResumable(state)`.

## A12. For galleries and tests

`DEMO_COURSE` (two units, eight lessons, every exercise type), `EXERCISE_EXAMPLES` (one valid exercise per
type) and `FIGURE_EXAMPLES` (one figure per kind). `generateExercise(step, { seed, difficulty, level })` makes
the literal exercise of a generated step (it never throws: a broken step becomes a stand-in question;
`generateStrict` throws instead); `GENERATORS`, `GENERATOR_KINDS`, `getGenerator(kind)`, `isGenerated(step)`,
`generatorProblems(step)`. Seeded randomness: `createRng(seed)`, `hashSeed(...parts)`, `shuffleAway(list, rng)`.
Checks (B9): `validateCourse`, `courseErrors`, `assertValidCourse`, `formatProblems`, `stepProblems`,
`exerciseProblems`, `cardProblems`, `generatedProblems`, `specProblems`, `pitchSignature` (two texts naming one
pitch share it), `estimateLessonSeconds`, `estimateStepSeconds`. Limits: `TEXT_LIMITS COUNT_LIMITS LESSON_LIMITS
COURSE_LIMITS TEMPO_LIMITS MAX_FRET`.

---

# Part B — authoring guide

Content is plain TypeScript data. Type it against `Course` from `@/lessons`, and put this test beside it:

```ts
import { assertValidCourse, validateCourse } from '@/lessons';
it('is a valid course', () => assertValidCourse(MY_COURSE));                                  // no errors
it('follows the lesson guidelines', () => expect(validateCourse(MY_COURSE)).toEqual([]));     // no warnings either
```

Every message names the unit, lesson and step and says how to fix it:
`unit "first-notes" > lesson "open-strings" > step 4 (choice): 2 options are marked correct; a single-answer
question needs exactly one. Mark one option correct: true, or set multiple: true.`
Each `CourseProblem` also carries `severity` (`error` | `warning`), `code` (B9), `unit`, `lesson`, `step` and `where`.

## B1. The shape: Course > Unit > Lesson > Step

| `Course` | |
|---|---|
| `id` | slug (`theory-path`, `mia-first-steps`) |
| `title`, `description?` | |
| `teacher` | `'mia' \| 'dev' \| 'elena'`, or `'none'` for the Theory Path. Hearts are only used when it is `'none'` |
| `level` | `'beginner' \| 'intermediate' \| 'expert'`: sets timing tolerances and the starting difficulty |
| `units` | `Unit[]` |
| `glossary?` | extra `{ id, term, definition }` entries for `{t:id}` |

| `Unit` | |
|---|---|
| `id` | slug, unique in the course |
| `title` | the name on the path |
| `theme` | `basics notes fretboard rhythm intervals scales chords keys harmony reading ear technique songs improvisation composition` (picks icon and colour) |
| `description` | one or two short sentences |
| `lessons` | 2 to 12 `Lesson`s |
| `checkpoint?` | a quiz that tests the learner out of the unit (B8) |

| `Lesson` | |
|---|---|
| `id` | slug, unique in the **course** |
| `title` | |
| `teaches` | the **one** thing it teaches, as a sentence the learner could repeat |
| `minutes` | estimated time, 2 to 5 |
| `skill` | exactly `theory:<unit id>:<lesson id>`, or `teacher:<mia\|dev\|elena>:<lesson id>` in a teacher's course |
| `requires?` | lesson ids that must be finished first. **Omit it** for "the lesson before this one" (a path); `[]` opens the lesson from the start |
| `steps` | 6 to 20 `Step`s: teaching cards and exercises |
| `facts?` | up to 6 things worth remembering for good; each becomes a spaced-repetition card (B7) |

A `Step` is one of:

- a **card** `{ type: 'card', title?, body, figure?, tip? }`: one idea, shown before it is asked;
- an **exercise** `{ type: '<exercise type>', ... }` (B5);
- a **generated exercise** `{ generate: '<generator>', params?, seed? }` (B6).

Any step may carry an `id` (slug, unique in the lesson). Any exercise may carry `fact: '<fact id>'` to say which
fact of the lesson it tests.

## B2. One complete lesson

This is the second lesson of the demo course (`src/lessons/demo/first-notes.ts`), exactly as it ships:

<!-- gen:example:lesson -->
```ts
const openStrings: Lesson = {
  id: 'open-strings',
  title: 'The six open strings',
  teaches: 'The open strings are E A D G B E, numbered 6 (thickest) to 1 (thinnest).',
  minutes: 3,
  skill: 'theory:first-notes:open-strings',
  steps: [
    {
      type: 'card',
      title: 'Six strings, counted from the thin one',
      body: 'Strings are numbered **1 to 6** from the thinnest to the thickest. Played {t:open-string|open}, with no finger down, they sound {n:E} {n:A} {n:D} {n:G} {n:B} {n:E} from string 6 up to string 1.',
      figure: {
        kind: 'fretboard',
        frets: [0, 3],
        dots: [
          { string: 6, fret: 0, note: 'E' },
          { string: 5, fret: 0, note: 'A' },
          { string: 4, fret: 0, note: 'D' },
          { string: 3, fret: 0, note: 'G' },
          { string: 2, fret: 0, note: 'B' },
          { string: 1, fret: 0, note: 'E' },
        ],
      },
      tip: 'String 6 is the one nearest your face when you hold the guitar, and it sounds the lowest.',
    },
    {
      type: 'match-pairs',
      prompt: 'Match each string with its open note.',
      pairs: [
        { left: 'String 5', right: '{n:A}' },
        { left: 'String 4', right: '{n:D}' },
        { left: 'String 3', right: '{n:G}' },
        { left: 'String 2', right: '{n:B}' },
      ],
      explain: 'From string 6 to string 1 the open notes are E A D G B E. Strings 6 and 1 are both {n:E}, two octaves apart.',
    },
    { generate: 'open-strings', params: { ask: 'order' }, fact: 'open-strings' },
    {
      type: 'choice',
      prompt: 'Which string sounds the lowest?',
      options: [
        { text: 'String 6, the thickest', correct: true },
        { text: 'String 1, the thinnest', why: 'String 1 is the highest: thin strings vibrate fastest.' },
        { text: 'String 3' },
        { text: 'String 5' },
      ],
      explain: 'Thicker strings vibrate more slowly, so they sound lower. String 6, the low {n:E}, is the lowest note in standard {t:tuning}.',
    },
    {
      type: 'card',
      title: 'Hear them',
      body: 'Listen to the six open strings from low to high. Many players remember them with a sentence: **E**ddie **A**te **D**ynamite, **G**ood **B**ye **E**ddie.',
      figure: { kind: 'audio', sound: { kind: 'notes', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], tempo: 80 }, label: 'Play the open strings' },
    },
    { generate: 'open-strings', params: { ask: 'name' } },
    {
      type: 'play-note',
      prompt: 'Play the open {n:A} string: string 5, no fingers.',
      note: 'A2',
      octave: 'exact',
      where: { string: 5, fret: 0 },
      explain: 'String 5 played open is {n:A}. A clear, steady note means you plucked just that one string.',
      alternative: {
        type: 'fretboard-find',
        prompt: 'Tap the open {n:A} string.',
        find: { note: 'A2' },
        mode: 'one',
        octave: 'exact',
        frets: [0, 3],
        explain: 'The open 5th string is {n:A}.',
      },
    },
    { generate: 'open-strings', params: { ask: 'number' } },
    {
      type: 'true-false',
      statement: 'String 1 and string 6 are both called {n:E}.',
      answer: true,
      explain: 'Both are {n:E}: string 6 is the low E and string 1 the high E, two {t:octave|octaves} higher.',
    },
  ],
  facts: [
    {
      id: 'open-strings',
      front: 'Name the six open strings from string 6 to string 1.',
      back: '{n:E} {n:A} {n:D} {n:G} {n:B} {n:E}',
      ask: { generate: 'open-strings', params: { ask: 'order' } },
    },
    { id: 'string-numbers', front: 'Which string is number 1?', back: 'The thinnest, highest string: the high {n:E}.' },
  ],
};
```
<!-- /gen -->

## B3. Text

Every text field takes this inline markup. There is no HTML and no Markdown beyond it.

| write | shows | says | |
|---|---|---|---|
| `**strong**` | **strong** | strong | |
| `*emphasis*` | *emphasis* | emphasis | |
| `{n:F#}` | F♯ | "F sharp" | a note; with an octave: `{n:E2}` |
| `{c:Am7}` | Am7 | "A minor seventh" | a chord symbol (`{c:C/E}` "C major over E") |
| `{i:m3}` | m3 | "minor third" | an interval |
| `{d:b3}` | ♭3 | "flat 3" | a scale degree |
| `{r:bVII}` | ♭VII | "flat seven" | a roman numeral (`{r:ii}` "two minor", `{r:V7}` "five seven") |
| `{k:F# minor}` | F♯ minor | "F sharp minor" | a key |
| `{t:barre}` | barre | barre | a glossary term, tappable for its definition |
| `{t:eighth-note\|eighth notes}` | eighth notes | eighth notes | the same with other words on screen |
| `___` | a blank | "blank" | only in the `text` of a fill-blanks exercise |
| a line break | new line | | at most one empty line |

- A backslash makes the next character literal: `\*`, `\{`, `\_`.
- **Always tag music symbols.** `Play Am7` is read aloud as "am seven" and cannot be typeset; `validateCourse`
  rejects chords, intervals (`m3`), numerals (`IV`, `V7`), degrees (`b3`) and notes with accidentals (`C#`) typed as
  plain text. Bare letters (`A B C`), `4/4` and string and fret numbers are fine.
- When speech needs other words than the screen, give both: `{ text: 'Count 1 & 2 &', say: 'Count one and two and' }`.
- Notes, chords and keys are shown in the learner's naming system (letters, solfège, German) automatically.
- Spell notes for their key or chord: `{n:E#}` in F♯ major, never `{n:F}`.

Glossary ids you can link (add your own in `course.glossary`; `glossary.ts` has the definitions):

<!-- gen:glossary -->
`fret` `fretboard` `nut` `open-string` `string-numbers` `tuning` `capo` `position` `fingering` `barre` `mute` `strum` `downstroke` `upstroke` `pick` `pitch` `note` `musical-alphabet` `octave` `natural` `sharp` `flat` `accidental` `enharmonic` `half-step` `whole-step` `interval` `unison` `tritone` `chromatic` `scale` `major-scale` `minor-scale` `pentatonic` `degree` `tonic` `root` `key` `key-signature` `relative-minor` `circle-of-fifths` `mode` `chord` `triad` `major-chord` `minor-chord` `seventh-chord` `power-chord` `arpeggio` `voicing` `inversion` `progression` `roman-numerals` `diatonic` `cadence` `dominant` `subdominant` `harmony` `melody` `rhythm` `beat` `tempo` `bpm` `bar` `time-signature` `note-value` `whole-note` `half-note` `quarter-note` `eighth-note` `sixteenth-note` `rest` `dotted-note` `tie` `triplet` `downbeat` `offbeat` `syncopation` `metronome` `tab` `staff` `treble-clef` `ledger-line`
<!-- /gen -->

## B4. Figures

A figure is `{ kind, ...data }`. It can sit on a card (`figure`), beside a prompt (`figure`), in a choice
option, on the back of a flashcard (`backFigure`) or on a fact. `validateCourse` checks it on the instrument:
positions must exist, and every note or degree you claim must be what is really there.

**`fretboard`** — dots at string and fret.

<!-- gen:example:figure-fretboard -->
```ts
{
  kind: 'fretboard',
  frets: [5, 8],
  root: 'A',
  labels: 'degree',
  dots: [
    { string: 6, fret: 5, note: 'A', degree: '1' },
    { string: 6, fret: 8, note: 'C', degree: 'b3' },
    { string: 5, fret: 5, note: 'D', degree: '4' },
    { string: 5, fret: 7, note: 'E', degree: '5', finger: 3 },
  ],
  caption: 'The start of {n:A} minor pentatonic, box 1.',
}
```
<!-- /gen -->

| field | |
|---|---|
| `dots?` | `{ string, fret, label?, role?, note?, degree?, finger? }`. `note` (`'C'` or `'C3'`) and `degree` (`'b3'`, needs `root`) are **claims that are checked**. `role`: `root third fifth seventh tone target ghost muted`. `finger`: 1–4 |
| `derive?` | let the engine place the dots inside `frets`: `{ scale: 'minor-pentatonic', tonic: 'A' }`, `{ chord: 'C' }` or `{ note: 'E' }` (`'E4'` for one octave). Prefer this to typing dots |
| `frets?` | `[first, last]`, default `[0, 4]`; at most 13 frets wide |
| `strings?` | limit derived dots to these strings |
| `root?` | root note for degree labels and degree claims |
| `labels?` | what unlabelled dots show: `note` (default), `degree`, `finger`, `none` |
| `tuning?`, `capo?` | tuning id (`drop-d`); dots and `frets` count from the capo (fret 0 sits on it); the board drawn moves up the neck with it |
| `key?` | key that spells the dots' note names (`'A major'`: C♯, not D♭). Default: the derived chord or scale, else the sharps or flats of the claimed notes, else the key all the dots imply |
| `caption?` | text under the figure (at most 80 characters) |

On a card the neck is live: tapping it plays the note there, as everywhere in the app. A neck wider than the
phone scrolls inside its box, with a visible edge and arrow where more is hidden.

**`chord`** — a chord diagram: a `symbol`, a shape, or both (then the shape is checked against the symbol).

<!-- gen:example:figure-chord -->
```ts
{ kind: 'chord', symbol: 'C', frets: 'x32010', fingers: 'x32010' }
```
<!-- /gen -->

`symbol?`, `frets?` (`'x32010'` or `[null, 3, 2, 0, 1, 0]`, low string first), `fingers?` (`'x32010'`),
`tuning?`, `capo?`, `caption?`. With only a `symbol`, the first shape of the chord library is drawn. With a `capo`
the frets count from it, the `symbol` names what SOUNDS (shape G at capo 2 is `A`), and the box draws the capo.
A chord box used as a choice option is drawn without its name (the name would be the answer).

**`staff`** — notes in treble clef as the guitar reads it: write the **sounding** pitch and it is drawn an
octave higher (`E3` is the bottom line, `E2` the low E string three ledger lines down).

<!-- gen:example:figure-staff -->
```ts
{ kind: 'staff', key: 'G major', notes: ['G3', 'A3', 'B3', { note: 'D4', duration: 'h', label: 'D' }], time: '4/4' }
```
<!-- /gen -->

`notes` (pitches with octaves, or `{ note, duration?, label? }`), `key?` (draws the signature; accidentals it
covers are not repeated), `time?`, `clef?` (`treble` default, `bass`), `guitar?` (`false` for written pitch),
`caption?`. Within four ledger lines (E2 to E6 for guitar notation); single accidentals only.

**`keyboard`** — highlighted piano keys: the clearest picture of half and whole steps.

<!-- gen:example:figure-keyboard -->
```ts
{ kind: 'keyboard', keys: ['C4', 'E4', { note: 'G4', label: '5th', role: 'fifth' }], from: 'C4', to: 'B4' }
```
<!-- /gen -->

`keys` (pitches with octaves, or `{ note, label?, role? }`), `from?` / `to?` (white keys; default: the octaves
around the keys; at most three octaves), `caption?`. A `ghost` key is drawn faint; when some keys carry degree
roles (`root third fifth seventh`) the plain ones are neutral, so the third's colour is never mistaken for the
accent. Every key sounds when tapped, and the keyboard always fits the phone (nine white keys at 360 px).

**`circle`** — the circle of fifths with one key selected.

<!-- gen:example:figure-circle -->
```ts
{ kind: 'circle', key: 'G major', highlight: ['C major', 'D major', 'E minor'], show: 'both' }
```
<!-- /gen -->

`key`, `highlight?` (other keys to mark), `show?` (`major`, `minor`, `both`), `caption?`.

**`rhythm`** — one or two bars in the compact notation.

<!-- gen:example:figure-rhythm -->
```ts
{ kind: 'rhythm', pattern: 'q e e h | q. e q qr', time: '4/4', tempo: 90 }
```
<!-- /gen -->

`pattern`, `time?` (default `4/4`), `tempo?`, `counting?` (show "1 & 2 &", default true), `caption?`.
The notation, used everywhere a rhythm is written:

| code | |
|---|---|
| `w h q e s` | whole, half, quarter, eighth, sixteenth note |
| `q.` `h.` | dotted |
| `et et et` | a triplet (write all three) |
| `qr` `er` `h.r` | a rest of that length |
| `~q` | tied to the note before (no new attack) |
| `\|` | bar line; every bar must be exactly full |

**`tab`** — a short phrase as string, fret and duration.

<!-- gen:example:figure-tab -->
```ts
{
  kind: 'tab',
  tempo: 80,
  notes: [
    { string: 6, fret: 0, duration: 'q' },
    { string: 6, fret: 3, duration: 'q' },
    { rest: true, duration: 'q' },
    { string: 5, fret: 2, duration: 'q' },
  ],
}
```
<!-- /gen -->

`notes` (`{ string, fret, duration }` or `{ rest: true, duration }`), `tuning?`, `capo?`, `time?`, `tempo?`, `key?`
(spells its notes; default: the key they imply), `caption?`. A fretted note may carry techniques (`TabTechnique`),
drawn on the tab (bend arrow with `full`/`½`, H/P arcs, slide lines, vibrato wave; read out in the figure's label) and
heard when it plays: `bend` (semitones, 0.5–3 in halves: 2 = full), `release` (with a bend), `vibrato: true`,
`legato: 'hammer' | 'pull' | 'slide'` (from the note just before on the same string, no rest between; a hammer-on
goes up, a pull-off down, a slide between two fretted notes), `slideIn: 'below' | 'above'`, `slideOut: 'down' | 'up'`
(not on an open string). Techniques are not allowed in play-phrase targets (the listener would hear other pitches).

```ts
notes: [{ string: 3, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'e', legato: 'hammer' },
        { string: 3, fret: 5, duration: 'e', legato: 'pull' }, { string: 2, fret: 8, duration: 'h', bend: 2, release: true, vibrato: true }]
```

**`audio`** — a play button.

<!-- gen:example:figure-audio -->
```ts
{ kind: 'audio', sound: { kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 80 }, label: 'Hear the strum' }
```
<!-- /gen -->

`sound`, `label?` (at most 28 characters), `caption?`. `describeSound(sound)` is its short description ("one note",
"3 notes together", "a chord", "a scale over a drone"). A `Sound` is one of:

| `kind` | fields |
|---|---|
| `notes` | `notes` (with octaves), `together?`, `tempo?`, `drone?`, `over?` |
| `interval` | `from` (lower note with octave), `interval`, `play?`: `up` (default), `down` (upper note first), `together`, `drone?` |
| `chord` | `chord`, `frets?`, `voicing?`: `guitar` (default, the library shape) or `close` (best for comparing qualities), `octave?`, `style?`: `strum`, `arpeggio`, `block` |
| `scale` | `tonic` (with octave), `scale` (id), `direction?`: `up`, `down`, `up-down`, `tempo?`, `drone?`, `over?` |
| `strum` | `chord`, `pattern` (one character per eighth note: `D` down, `U` up, `X` muted, `-` miss; `\|` between bars), `grid?`: `eighth` or `sixteenth`, `tempo?`, `repeat?` |
| `progression` | `chords`, `tempo?`, `beats?` per chord (default 2), `voicing?` |
| `rhythm` | `pattern`, `time?`, `tempo?` |
| `tab` | `notes` (techniques heard as written), `tempo?`, `tuning?`, `capo?`, `drone?`, `over?` |

Under a melodic sound: `drone: { root: 'D2', fifth?: true }` (`SoundDrone`) (a held root, with its fifth if asked; hear each degree
against the tonic) or `over: { chord: 'Am', frets?, voice?: 'guitar' | 'epiano' | 'organ' }` (`SoundOver`: the chord held while the
line plays over it; a tab sound's capo applies to `frets`). One or the other, not both; not `over` with `together`.

```ts
{ kind: 'scale', tonic: 'D3', scale: 'dorian', drone: { root: 'D2', fifth: true } }
{ kind: 'notes', notes: ['A3', 'C4', 'D4', 'E4', 'G4', 'A4'], over: { chord: 'Am' } }
```

## B5. Exercise types

Every exercise has `prompt` (what is asked), `explain` (**why the right answer is right**: required, shown
after every answer) and may have `figure`, `hint`, `id` and `fact`. `true-false` has a default prompt;
`flashcard` has `front` and `back` instead of `prompt` and `explain`.

Two policies are **yours to state** wherever they apply; the validator insists:

- **`spelling`** (the enharmonic policy): `'exact'` when the name matters (a key-signature question: F♯ is
  right and G♭ is not) or `'any'` when only the pitch does (a "which fret" or "which note is this" question).
- **`octave`**: `'exact'` when only that very pitch counts, `'any'` when any octave of the note does.

And one rule the validator enforces for you: **no distractor may be right by accident.** Two names for one
pitch (`{n:C#}` and `{n:Db}`) in one option list are rejected unless the exercise says `spelling: 'exact'`.

| exercise | how names and octaves are compared |
|---|---|
| `choice`, `fill-blanks` | by what the option or tile says; enharmonic twins are rejected unless `spelling: 'exact'` makes the name the point |
| `listen-choice` | options that sound the same (A4 and d5) are always rejected: the ear cannot tell them apart |
| `match-pairs`, `order` | by what the tile says; tiles that read the same are interchangeable |
| `type-answer` | `spelling` required for `note`, `interval`, `chord`, `degree`; numbers, numerals and text are compared as written |
| `fretboard-name` | `spelling` required; `exact` needs a `key` to decide the name |
| `fretboard-find`, `play-note`, `play-phrase` | `octave` required; the neck and the microphone know pitches, so spelling never matters |
| `chord-build` | `fingers`: by the notes the shape sounds; `missing-note`: `spelling` (default `any`) |
| `staff-read` | the letter is always compared exactly (the staff shows it); the accidental follows the key signature |
| `staff-place` | `octave` required; letter and accidental compared exactly |
| `play-chord` | by the pitch classes heard |

### `choice`

<!-- gen:example:choice -->
```ts
{
  type: 'choice',
  prompt: 'Which note is the fifth of {c:C}?',
  options: [
    { text: '{n:G}', correct: true },
    { text: '{n:E}', why: '{n:E} is the third of {c:C}.' },
    { text: '{n:F}' },
    { text: '{n:A}' },
  ],
  explain: '{c:C} is {n:C}, {n:E} and {n:G}: root, third and fifth.',
}
```
<!-- /gen -->

`options` (2 to 6): `{ text?, figure?, correct?, why? }`; `why` is shown when that wrong option is picked.
Exactly one `correct`, unless `multiple: true` (then every correct option must be picked; partial credit is
given). `shuffle: false` keeps your order (numbers, "higher / lower"). `spelling: 'exact'` only when enharmonic
twins among the options are the point. Options that are chord boxes are drawn without their names; options that
are rhythms, staves, tabs, necks or keyboards get a whole row each on a phone. The validator warns
(`exercise.giveaway`) when the right option is the only picture whose caption or text repeats what the prompt asks
for ("Which box is {c:G}?" with "The {c:G} shape" under the right box).

### `true-false`

<!-- gen:example:true-false -->
```ts
{
  type: 'true-false',
  statement: 'A {t:capo} at fret 2 raises every open string by a whole step.',
  answer: true,
  explain: 'Each fret is a half step, so two frets raise every string by a whole step.',
}
```
<!-- /gen -->

`statement`, `answer` (boolean). Use it for one clear fact; say in `explain` what makes it true or false.

### `match-pairs`

<!-- gen:example:match-pairs -->
```ts
{
  type: 'match-pairs',
  prompt: 'Match each chord with its notes.',
  pairs: [
    { left: '{c:C}', right: '{n:C} {n:E} {n:G}' },
    { left: '{c:G}', right: '{n:G} {n:B} {n:D}' },
    { left: '{c:Am}', right: '{n:A} {n:C} {n:E}' },
  ],
  explain: 'A triad takes every other letter name from its root: root, third, fifth.',
}
```
<!-- /gen -->

`pairs` (3 to 6): `{ left, right }`, each side at most 28 characters and different from the others.

### `order`

<!-- gen:example:order -->
```ts
{
  type: 'order',
  prompt: 'Put the first four sharps in the order they appear in a key signature.',
  tiles: ['{n:F#}', '{n:C#}', '{n:G#}', '{n:D#}'],
  distractors: ['{n:B#}'],
  explain: 'Sharps always arrive in the order F C G D A E B, each a fifth above the last.',
}
```
<!-- /gen -->

`tiles` (3 to 8) **in the correct order** (they are shuffled for the learner, never already solved),
`distractors?` (up to 3 tiles that do not belong). Tiles that read the same are interchangeable (the two E strings).

### `fill-blanks`

<!-- gen:example:fill-blanks -->
```ts
{
  type: 'fill-blanks',
  prompt: 'Complete the {n:A} minor scale.',
  text: '{n:A}  {n:B}  ___  {n:D}  {n:E}  ___  {n:G}',
  blanks: ['{n:C}', '{n:F}'],
  bank: ['{n:C#}', '{n:F#}'],
  explain: '{n:A} natural minor has no sharps or flats: A B C D E F G.',
}
```
<!-- /gen -->

`text` with `___` for each blank (1 to 4), `blanks` (the right word for each, in order), `bank?` (wrong words;
the right ones are added for you), `unordered?` (blanks may be filled in any order: the notes of a chord),
`spelling?` (`exact` when the bank offers one pitch under two names on purpose).

### `type-answer`

<!-- gen:example:type-answer -->
```ts
{
  type: 'type-answer',
  prompt: 'Which note is sharp in the key signature of {k:G major}?',
  // A key-signature question: the NAME matters, so G flat is not accepted for F sharp.
  answer: { kind: 'note', value: 'F#', spelling: 'exact' },
  input: 'keypad',
  explain: '{k:G major} has one sharp, {n:F#}: the seventh note of its scale.',
}
```
<!-- /gen -->

`answer` is one of these; `accept?` lists further right answers:

| `kind` | `value` | understood from the learner | policy |
|---|---|---|---|
| `note` | `'F#'` | `f#`, `F♯`, `f sharp`, `Fa#`; German names when that is their setting | `spelling` required |
| `interval` | `'m3'` | `m3`, `minor third`, `min 3rd`, `tritone`, `octave` | `spelling` required (`any` accepts d5 for A4) |
| `chord` | `'Am7'` | `am7`, `A minor 7`, `A-7` | `spelling` required (`any` accepts D♭m for C♯m) |
| `degree` | `'b3'` | `b3`, `♭3`, `flat 3`, `flat third` | `spelling` required (`any` accepts ♯4 for ♭5) |
| `roman` | `'IV'` | `IV`, `♭VII`; **case matters** (iv is a different chord) | |
| `number` | `12` | `12`, `fret 12`, `twelve`, `12th` | |
| `text` | `'barre'` | compared without case, accents or punctuation; a minus right after a number is kept (`6-`, a Nashville minor, is not `6`) | |

`input?`: `keypad` (notes, numbers) or `keyboard`.

### `listen-choice`

<!-- gen:example:listen-choice -->
```ts
{
  type: 'listen-choice',
  prompt: 'Is this chord major or minor?',
  sound: { kind: 'chord', chord: 'Am', voicing: 'close', octave: 3 },
  options: [{ text: 'Major' }, { text: 'Minor', correct: true }],
  shuffle: false,
  explain: 'That was {c:Am}: its third, {n:C}, is a minor third above the root, which gives the darker sound.',
}
```
<!-- /gen -->

`sound` (a `Sound`, B4), `options` as for `choice` (single answer; an option may be a rhythm figure).
Options that sound the same (A4 and d5) are always rejected.

### `tap-rhythm`

<!-- gen:example:tap-rhythm -->
```ts
{
  type: 'tap-rhythm',
  prompt: 'Tap this rhythm along with the click.',
  rhythm: { pattern: 'q e e q q' },
  tempo: 80,
  show: 'both',
  explain: 'Count 1, 2 &, 3, 4: the two eighth notes share beat 2.',
}
```
<!-- /gen -->

`rhythm` (`{ pattern, time? }`), `tempo` (40 to 160), `show`: `notation`, `audio` or `both`, `level?`
(default: the course level), `start?`: `count-in` (default) or `first-tap`, `counting?` (default true; `false` hides
the "1 & 2 &" under the notation when it would contradict the count-in or the pad). The feedback shows the rhythm
itself and its counting ("Tap on 1, 2 &, 3, 4"), never the pattern code. Graded on timing: a tap counts
within ±150 ms (beginner), ±100 ms (intermediate) or ±65 ms (expert), never more than 40 % of the shortest gap;
beginners need 80 % of the notes, intermediates 90 %, experts all; a constant delay of the device (up to
120 ms) is measured and removed. 2 to 16 notes, 1 or 2 bars, no two notes closer than 140 ms.

### `fretboard-find`

<!-- gen:example:fretboard-find -->
```ts
{
  type: 'fretboard-find',
  prompt: 'Tap every {n:E} from the open strings to fret 5.',
  find: { note: 'E' },
  mode: 'all',
  // Any octave counts here; write find: { note: 'E4' } with octave: 'exact' to ask for one pitch.
  octave: 'any',
  frets: [0, 5],
  explain: 'There are four: the two open {n:E} strings, string 4 at fret 2 and string 2 at fret 5.',
}
```
<!-- /gen -->

`find`: `{ note: 'E' }` (or `'E4'`), `{ chord: 'Am' }`, `{ scale: 'minor-pentatonic', tonic: 'A' }` or
`{ interval: 'M3', from: { string, fret } }`. `mode`: `one` (any right place) or `all` (every right place in the
region, at most 12; partial credit). **`octave` is required.** `frets: [first, last]`, `strings?` (only these strings
take a tap: they are shaded on the neck, a tap elsewhere is not an answer, and a right pitch on another string is
told "right note, but on string N"), `shown?` (dots already on the neck: mark the root of an interval question),
`tuning?`, `capo?`, `key?` (spells the notes named in the feedback; default: the chord, scale or note asked for).

### `fretboard-name`

<!-- gen:example:fretboard-name -->
```ts
{
  type: 'fretboard-name',
  prompt: 'The root (R) is {n:A}. What interval is the other note above it?',
  position: { string: 5, fret: 7 },
  root: { string: 6, fret: 5 },
  ask: 'interval',
  spelling: 'any',
  options: ['P5', 'P4', 'M3', 'm6'],
  explain: 'String 5, fret 7 is {n:E}, seven half steps above {n:A}: a perfect fifth. This two-fret shape is a power chord.',
}
```
<!-- /gen -->

`position`, `ask`: `note`, `interval` or `degree`; `root` (required for the last two, at or below the position
and at most an octave under it). **`spelling` is required**: `any`, or `exact` with a `key` that decides the
name (`key: 'Db major'` makes fret 2 of string 6 a G♭). `options?`: plain values (`'F#'`, `'m3'`, `'b3'`) shown
as buttons; exactly one must be right.

### `chord-build`

<!-- gen:example:chord-build -->
```ts
{
  type: 'chord-build',
  task: 'fingers',
  chord: 'Am',
  frets: 'x02210',
  accept: 'any-voicing',
  prompt: 'Build {c:Am} on the fretboard.',
  explain: '{c:Am} is {n:A}, {n:C} and {n:E}: fret 2 on strings 4 and 3, fret 1 on string 2, and the open {n:A} and {n:E} strings.',
}
```
<!-- /gen -->

`task: 'fingers'`: `chord`, `frets?` (the reference shape; default: the library's first), `accept?`:
`any-voicing` (default: any shape that really is the chord; a slash chord's bass must be its lowest note) or
`this-shape`. `tuning?`, `capo?` (frets count from it). A wrong shape is explained in plain words (which string
sounds a note outside the chord, which chord note nothing plays, which string differs from the box) and the right
box is drawn; the learner's shape is named only when it is a common chord the course has taught.
`task: 'missing-note'`: `chord`, `given` (all its notes but one), `options?`, `spelling?` (default `any`):

```ts
{ type: 'chord-build', task: 'missing-note', chord: 'E', given: ['E', 'B'], options: ['G#', 'G', 'A', 'F#'],
  prompt: 'The {c:E} chord has {n:E}, {n:B} and one more note. Which?', explain: '{c:E} is major, so its third is {n:G#}.' }
```

### `staff-read`

<!-- gen:example:staff-read -->
```ts
{
  type: 'staff-read',
  prompt: 'Which note is this?',
  note: 'D4',
  options: ['D', 'B', 'F', 'C'],
  explain: '{n:D} sits on the fourth line. Lines from the bottom: E G B D F.',
}
```
<!-- /gen -->

`note` (sounding pitch with octave), `key?` (the answer is the note **as altered by the signature**: an F on
the staff in G major is F♯), `options?` (note names), `clef?`. The letter name is always compared exactly.

### `staff-place`

<!-- gen:example:staff-place -->
```ts
{
  type: 'staff-place',
  prompt: 'Put {n:F#} on the staff. Any octave will do.',
  note: 'F#',
  octave: 'any',
  explain: 'F lives in the first space and on the top line; the sharp sign goes just before the note head.',
}
```
<!-- /gen -->

`note`, **`octave` is required** (`exact` needs the octave in `note`: `'B3'` is the open 2nd string, written on
the middle line), `key?`, `clef?`. The learner adds an accidental when the key signature does not supply it.

### `play-note`

The learner plays into the microphone. **Each play exercise must carry an `alternative`**: a non-microphone
exercise (literal or generated) that practises the same thing, used when the microphone is unavailable or the
learner taps "I can't play right now", exactly as language apps do for speaking exercises.

<!-- gen:example:play-note -->
```ts
{
  type: 'play-note',
  prompt: 'Play {n:G}: string 6, fret 3.',
  note: 'G2',
  octave: 'exact',
  where: { string: 6, fret: 3 },
  explain: 'Three frets above the open {n:E} string: {n:F}, {n:F#}, {n:G}.',
  alternative: {
    type: 'fretboard-find',
    prompt: 'Tap {n:G} on string 6.',
    find: { note: 'G2' },
    mode: 'one',
    octave: 'exact',
    frets: [0, 5],
    explain: 'String 6, fret 3 is {n:G}.',
  },
}
```
<!-- /gen -->

`note` (with octave), **`octave` required**, `where?` (shown on the neck and checked against `note`),
`toleranceCents?` (default by level: 45 / 35 / 25 cents), `key?` (spells a note heard that is not the one asked
for; default: as `note` is written), `labels?`: `note` (default, `E2`) or `place` (`string 6, open`; needs `where`;
friendlier before octaves are taught), `hideNames?` (no note name on the target: find it by place or by ear),
`staffOnly?` (the note on a staff only, no neck and no names: a reading test). The feedback always names the note.

### `play-chord`

<!-- gen:example:play-chord -->
```ts
{
  type: 'play-chord',
  prompt: 'Strum {c:G} once, slowly.',
  chord: 'G',
  explain: 'All six strings ring in {c:G}. If the low string buzzes, move your finger closer to fret 3.',
  alternative: { generate: 'chord-shape', params: { chords: ['G'] } },
}
```
<!-- /gen -->

`chord`, `frets?` (the shape to show, and the one listened for: its own notes, so a power chord, a shell or a
rootless grip can pass; default the library's first), `fingers?` (`'x32010'`: the box draws this fingering),
`hideDiagram?` (no box until after the answer: "find it on the neck yourself"), `tuning?`, `capo?` (frets count
from the capo, `chord` names what sounds, the box draws the capo).

### `play-phrase`

<!-- gen:example:play-phrase -->
```ts
{
  type: 'play-phrase',
  prompt: 'Play the first three notes of {n:C} major: {n:C}, {n:D}, {n:E}.',
  notes: [
    { string: 5, fret: 3, duration: 'q' },
    { string: 4, fret: 0, duration: 'q' },
    { string: 4, fret: 2, duration: 'h' },
  ],
  octave: 'exact',
  tempo: 70,
  explain: '{n:C} at fret 3 of string 5, then the open 4th string, {n:D}, and {n:E} at its fret 2.',
  alternative: {
    type: 'order',
    prompt: 'Put the first three notes of {n:C} major in order.',
    tiles: ['{n:C}', '{n:D}', '{n:E}'],
    distractors: ['{n:Eb}'],
    explain: 'The {n:C} major scale starts {n:C}, {n:D}, {n:E}: two whole steps.',
  },
}
```
<!-- /gen -->

`notes` (2 to 16 tab notes), **`octave` required**, `tempo?`, `pass?` (share of notes needed, default 0.8;
timing is not graded; the microphone listens for twice the phrase's length), `tuning?`, `capo?`, `key?` (spells
the notes; default: the key they imply, so an A major line shows C♯ and an F major one B♭), `labels?` (`note`
default, or `place`: "string 5 / fret 3" under the tab), `hideNames?` (numbered pips instead of note names),
`staffOnly?` (the phrase on a staff only: no tab, no names, a sight-reading test; rests are not drawn). Good
alternatives: `fretboard-find` for a note, `chord-build` or `{ generate: 'chord-shape' }` for a chord, `order` or
`fretboard-find` for a phrase.

### `flashcard`

<!-- gen:example:flashcard -->
```ts
{
  type: 'flashcard',
  front: 'What is the relative minor of {k:C major}?',
  back: '{k:A minor}: it starts on the sixth note of the {n:C} major scale.',
  backFigure: { kind: 'circle', key: 'A minor', highlight: ['C major'] },
}
```
<!-- /gen -->

`front`, `back`, `figure?` (with the front), `backFigure?`. Self-rated (Again / Hard / Good / Easy), never
costs a heart, cannot be used in a checkpoint. Facts without an `ask` are reviewed this way automatically.

## B6. Generated exercises

`{ generate: '<kind>', params?, seed? }` asks a generator for a fresh exercise, computed by the theory and
guitar engines, so drills never run out and are always right.

- **Lists are pools, easiest first.** At low difficulty only the start of a list is in play; the rest joins as
  the learner succeeds (about 80 % right is the aim). List what the lesson has taught, simplest first.
- Without a `seed`, every session draws a new exercise. With `seed: 7` the same exercise comes out every time
  (practice drills drop the seed so they stay fresh).
- Every parameter is optional. Unknown parameters and bad values are errors, and `validateCourse` runs each
  generated step over many seeds and difficulties to prove it produces sound exercises.
- A generated step can stand anywhere an exercise can: in a lesson, a checkpoint, a play `alternative`, a fact's `ask`.
- Distractors are plausible (the usual confusions first) and never accidentally right: no enharmonic twin of the
  answer, no duplicate option, and the grader accepts the generated answer (property-tested for every generator).
- Only the names a lesson has taught: `spelling` (`'sharps'`, the default, or `'flats'`) on `note-on-string`,
  `step-up` and `higher-lower` names every in-between note, right or wrong, one way. Key drills (`roman-chord`,
  `diatonic-chord`, `degree-in-key`, `staff-key`) take an explicit `keys` list instead of `maxAccidentals`.
- A generator refuses params it cannot make sound questions from (a 13th that does not fit the strings given,
  a numeral `roman-chord` cannot explain), so `validateCourse` reports them before a learner meets them.

<!-- gen:generators -->
#### `interval-name`

Two notes are named; choose the interval between them. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `intervals` | `string[]` | P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4 | Interval pool, easiest first. |
| `roots` | `string[]` | C G D A E F B Bb Eb F# Ab C# | Lower-note pool, easiest first. |
| `twins` | `boolean` | false | Also offer the other name of the same size (A2 beside m3, d5 beside A4), so the letters decide. |

Sample (`{ generate: 'interval-name' }`, seed 1): choice, "Which interval is it from C up to D?" → Major second

#### `interval-note`

Choose the note an interval above (or below) a given note. The spelling counts. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `intervals` | `string[]` | P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4 | Interval pool, easiest first. |
| `roots` | `string[]` | C G D A E F B Bb Eb F# Ab C# | Starting-note pool, easiest first. |
| `direction` | `'up' \| 'down'` | 'up' | Measure upwards or downwards. |

Sample (`{ generate: 'interval-note' }`, seed 1): choice, "Which note is a major second above C?" → D

#### `semitones-match`

Match interval names with their size in half steps. Produces `match-pairs`.

| param | type | default | meaning |
|---|---|---|---|
| `intervals` | `string[]` | P5 P4 M3 m3 M2 m2 P8 M6 m6 m7 M7 A4 | Interval pool, easiest first. Compound intervals (M9, P11, M13 ... up to P15) are allowed. |
| `pairs` | `number` | 4 | Pairs per exercise, 3 to 5. |

Sample (`{ generate: 'semitones-match' }`, seed 1): match-pairs, "Match each interval with its size." → Minor second = 1 half step; Minor third = 3 half steps; Perfect fourth = 5 half steps; Perfect octave = 12 half steps

#### `step-up`

Which note is one or more frets (half steps) above a note? Wrong options stay within the notes the pools can reach. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `steps` | `number[]` | [1, 2] | Distances in half steps to draw from (1 to 11). |
| `roots` | `string[]` | C D E F G A B | Starting-note pool. |
| `spelling` | `'sharps' \| 'flats'` | 'sharps' | Name the in-between notes with sharps or with flats. |

Sample (`{ generate: 'step-up' }`, seed 1): choice, "On one string, which note is two frets (a whole step) above C?" → D

#### `enharmonic`

Which note sounds the same as this one? Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `notes` | `string[]` | C# D# F# G# A# Db Eb Gb Ab Bb | Notes to ask about, easiest first. Black keys only (a sharp or a flat). |

Sample (`{ generate: 'enharmonic' }`, seed 1): choice, "Which note sounds the same as G♯?" → A♭

#### `scale-notes`

The notes of a scale: arrange them, complete them, or spot the outsider. Produces `order`, `fill-blanks`, `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `scales` | `string[]` | ['major'] | Scale ids, easiest first (5 to 8 notes: whole-tone and diminished too). |
| `tonics` | `string[]` | C G D F A E Bb Eb B Ab | Tonic pool, easiest first. |
| `form` | `'order' \| 'fill' \| 'odd-one-out'` | 'order' | Arrange the notes, complete the scale, or find the note that is not in it. |

Sample (`{ generate: 'scale-notes' }`, seed 1): order, "Put the notes of the F major scale in order, starting on F." → F  G  A  B♭  C  D  E

#### `scale-formula`

Put the whole and half steps of a scale in order. Produces `order`.

| param | type | default | meaning |
|---|---|---|---|
| `scales` | `string[]` | ['major', 'minor'] | Scale ids, easiest first (5 to 7 notes). |

Sample (`{ generate: 'scale-formula' }`, seed 1): order, "Build the natural minor scale: put its steps in order." → Whole  Half  Whole  Whole  Half  Whole  Whole

#### `key-signature`

Sharps and flats of a key: how many, which key, which notes. The spelling counts. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'count' \| 'key' \| 'accidentals'` | 'count' | How many sharps or flats; which key has a signature; which notes are altered. |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Modes to draw keys from. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 1 to 7. |

Sample (`{ generate: 'key-signature' }`, seed 1): choice, "How many sharps or flats does D major have?" → 2 sharps

#### `relative-key`

The relative minor of a major key, or the relative major of a minor key. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `direction` | `'minor' \| 'major' \| 'both'` | 'minor' | Which relative is asked for. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 0 to 7. |

Sample (`{ generate: 'relative-key' }`, seed 1): choice, "What is the relative minor of D major?" → B minor

#### `degree-in-key`

Scale degrees: which note is degree N of a key, or which degree is this note? Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'note' \| 'degree'` | 'note' | Ask for the note of a degree, or the degree of a note. |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Modes to draw keys from. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 0 to 7. |
| `degrees` | `number[]` | [5, 3, 4, 2, 6, 7] | Degrees to ask about (1 to 7), easiest first. |
| `keys` | `string[]` | from modes and maxAccidentals | An explicit key pool, easiest first (['C major', 'A major']). Replaces modes and maxAccidentals. |

Sample (`{ generate: 'degree-in-key' }`, seed 1): choice, "What is the 5th note of the D major scale?" → A

#### `fifths-order`

The circle of fifths, and the order of sharps and flats. Produces `order`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'keys' \| 'sharps' \| 'flats'` | 'keys' | Major keys clockwise, or the order sharps / flats are written. |
| `count` | `number` | 4 | Tiles per exercise, 3 to 7. |

Sample (`{ generate: 'fifths-order' }`, seed 1): order, "Going clockwise round the circle of fifths, put these major keys in order, starting from D♭." → D♭  A♭  E♭  B♭

#### `chord-tones`

The notes inside a chord: all of them, one of them, the missing one, or the chord they spell. Produces `choice`, `chord-build`.

| param | type | default | meaning |
|---|---|---|---|
| `types` | `string[]` | ['major', 'minor'] | Chord type ids, easiest first. |
| `roots` | `string[]` | C G D A E F B Bb Eb F# Ab C# | Root pool, easiest first. |
| `ask` | `'notes' \| 'tone' \| 'missing' \| 'name'` | 'notes' | All the notes; one tone (third, fifth ...); the missing note; or name the chord from its notes. |

Sample (`{ generate: 'chord-tones' }`, seed 1): choice, "Which notes make up the Cm chord?" → C E♭ G

#### `diatonic-chord`

The chords that belong to a key: which chord sits on a degree, and what quality it has. Minor keys use the natural minor scale, and the question says so. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'chord' \| 'quality'` | 'chord' | Name the chord on a degree, or say whether it is major, minor or diminished. |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Modes to draw keys from. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 0 to 7. |
| `sevenths` | `boolean` | false | Seventh chords instead of triads. |
| `keys` | `string[]` | from modes and maxAccidentals | An explicit key pool, easiest first (['C major', 'G major', 'A major', 'E major']). Replaces modes and maxAccidentals. |

Sample (`{ generate: 'diatonic-chord' }`, seed 1): choice, "In D major, which chord is built on the 1st note of the scale?" → D

#### `roman-chord`

Roman numerals and the chords they stand for in a key. Borrowed (bVII, iv in major) and secondary (V/V, V7/ii) numerals are explained; others are refused. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `direction` | `'to-chord' \| 'to-roman'` | 'to-chord' | Numeral given, choose the chord; or chord given, choose the numeral. |
| `numerals` | `string[]` | the diatonic triads of the key, I IV V first | Numeral pool, easiest first. |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Modes to draw keys from. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 0 to 7. |
| `keys` | `string[]` | from modes and maxAccidentals | An explicit key pool, easiest first (['C major', 'G major', 'A major']). Replaces modes and maxAccidentals. |

Sample (`{ generate: 'roman-chord' }`, seed 1): choice, "In the key of D major, which chord is I?" → D

#### `nashville`

The Nashville number system in a major key: which chord a number is, which number a chord is, or a four-chord chart. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'to-chord' \| 'to-number' \| 'chart'` | 'to-chord' | Which chord a number is; which number a chord is; or which chords a four-number chart means. |
| `keys` | `string[]` | C G D A E F Bb major | Major keys, easiest first. |
| `numbers` | `string[]` | ['1', '4', '5', '6m', '2m', '3m', '7°'] | Numbers in play, easiest first. Also b7, 2, 57 (5 with a seventh), 1maj7, 2m7. |

Sample (`{ generate: 'nashville' }`, seed 1): choice, "In D major, which chord is 1?" → D

#### `interval-on-neck`

A root is shown on the fretboard: find the note an interval above it, or name the interval or degree of a second dot. Compound intervals (9ths to 13ths) are named from a picture. Produces `fretboard-find`, `fretboard-name`, `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `intervals` | `string[]` | P5 P4 M3 m3 P8 M2 m2 M6 m6 m7 M7 A4 | Interval pool, easiest first. Compound intervals (M9, M10, P11, M13 ... up to P15) are allowed where the neck fits them. |
| `ask` | `'find' \| 'name' \| 'degree'` | 'find' | Tap the note; name the interval; or name the scale degree (9, 11, 13 for compound intervals). |
| `strings` | `number[]` | [6, 5] | Strings the root may be on. |
| `frets` | `[number, number]` | [0, 7] | Frets the root may be on, inclusive (at least 4 frets wide). The picture widens so every answer near the root is on it. |

Sample (`{ generate: 'interval-on-neck' }`, seed 1): fretboard-find, "The dot (R) is A♭. Tap the note a perfect octave above it." → A♭: string 4, fret 6; string 3, fret 1

#### `note-on-string`

Notes along one string: name a position, find a note, or give its fret number. Produces `fretboard-name`, `fretboard-find`, `type-answer`.

| param | type | default | meaning |
|---|---|---|---|
| `strings` | `number[]` | [6] | Strings to draw from. |
| `frets` | `[number, number]` | [0, 5] | Fret range, inclusive. |
| `naturals` | `boolean` | false | Only ask about natural notes. |
| `ask` | `'name' \| 'find' \| 'fret'` | 'name' | Name the shown position; tap the named note; or type its fret number. |
| `spelling` | `'sharps' \| 'flats' \| 'both'` | 'sharps' | Name the in-between notes with sharps, with flats, or either (each question picks one). |

Sample (`{ generate: 'note-on-string' }`, seed 1): fretboard-name, "Which note is at string 6, fret 3?" → G

#### `open-strings`

The names of the open strings: order them, name one, or find the string of a note. Produces `order`, `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'order' \| 'name' \| 'number'` | 'order' | Arrange low to high; which note is string N; or which string is the open N. |
| `tuning` | `string` | 'standard' | Tuning id (six strings). |

Sample (`{ generate: 'open-strings' }`, seed 1): order, "Put the open strings in order, from the thickest (string 6) to the thinnest (string 1)." → E  A  D  G  B  E

#### `chord-shape`

Build an open chord on the fretboard by placing the fingers. Produces `chord-build`.

| param | type | default | meaning |
|---|---|---|---|
| `chords` | `string[]` | Em Am E A D G C Dm | Chord pool, easiest first. Each needs a shape in the chord library. |
| `accept` | `'any-voicing' \| 'this-shape'` | 'any-voicing' | Accept any correct voicing, or only the library shape. |

Sample (`{ generate: 'chord-shape' }`, seed 1): chord-build, "Build A: put your fingers on the fretboard." → A

#### `neck-tones`

Tap every note of a chord or scale inside a small box of the neck. Produces `fretboard-find`.

| param | type | default | meaning |
|---|---|---|---|
| `what` | `'chord' \| 'scale'` | 'chord' | Find chord tones or scale notes. |
| `chords` | `string[]` | C G D A E Am Em Dm | Chord pool, easiest first. |
| `scales` | `string[]` | ['minor-pentatonic', 'major'] | Scale ids, easiest first. |
| `tonics` | `string[]` | A E G C D | Tonic pool for scales. |
| `span` | `number` | 4 | Width of the box in frets, 3 to 5. |
| `strings` | `number[]` | [6, 5, 4] | Strings of the box (at most three). |

Sample (`{ generate: 'neck-tones' }`, seed 1): fretboard-find, "Tap every note of the C chord on strings 6, 5, 4, frets 7 to 10." → C: string 6, fret 8; string 5, fret 7; string 5, fret 10; string 4, fret 10

#### `play-note` (microphone)

Play a note of a string into the microphone. Falls back to tapping it on the fretboard. Produces `play-note`.

| param | type | default | meaning |
|---|---|---|---|
| `strings` | `number[]` | [6, 5, 4, 3, 2, 1] | Strings to draw from. |
| `frets` | `[number, number]` | [0, 3] | Fret range, inclusive. |
| `naturals` | `boolean` | true | Only natural notes. |

Sample (`{ generate: 'play-note' }`, seed 1): play-note, "Play the open 3rd string: G." → G3

#### `caged-shape`

A chord shape is drawn up the neck: name its CAGED shape, or the chord it plays. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'shape' \| 'chord'` | 'shape' | Which CAGED shape it is; or which chord it plays. |
| `shapes` | `('C' \| 'A' \| 'G' \| 'E' \| 'D')[]` | ['E', 'A', 'D', 'C', 'G'] | Shapes in play, easiest first (the options of a shape question). |
| `roots` | `string[]` | C D G A E F Bb | Chord roots, easiest first. |
| `qualities` | `('major' \| 'minor')[]` | ['major'] | Major chords, minor chords, or both (minor has no G shape). |

Sample (`{ generate: 'caged-shape' }`, seed 1): choice, "Which CAGED shape is this major chord? R marks the root." → A shape

#### `capo-math`

Capo arithmetic: which chord a shape sounds with a capo, which shape gives a chord, or where the capo goes. Produces `choice`, `type-answer`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'sounds' \| 'shape' \| 'capo'` | 'sounds' | Capo and shape given: which chord sounds; chord given: which shape; or which fret the capo goes on. |
| `shapes` | `string[]` | G C D A E Em Am Dm | Open shapes, easiest first (each needs an open shape in the chord library). |
| `capos` | `number[]` | [2, 3, 1, 4, 5, 7] | Capo frets, easiest first, 1 to 9. |

Sample (`{ generate: 'capo-math' }`, seed 1): choice, "With a capo on fret 1, you play the G shape. Which chord sounds?" → A♭

#### `natural-harmonic`

Natural harmonics: which note rings when a string is touched over fret 12, 7, 5 ..., or where a harmonic is. Produces `choice`, `type-answer`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'note' \| 'fret'` | 'note' | Which note rings over a fret; or over which fret a harmonic rings. |
| `frets` | `number[]` | [12, 7, 5] | Harmonic frets, easiest first: 12, 7, 5, 19, 4, 9, 16. |
| `strings` | `number[]` | [6, 5, 4, 3, 2, 1] | Strings to draw from. |

Sample (`{ generate: 'natural-harmonic' }`, seed 1): choice, "Touch string 6 lightly right over fret 7, without pressing, and pick it. Which note rings?" → B3

#### `note-value-math`

Note-value arithmetic: how many fit, how many beats, what two add up to. Produces `type-answer`, `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'fit' \| 'beats' \| 'sum'` | 'fit' | How many X fit in a Y; how many beats X lasts in 4/4; what X plus Y equals. |
| `values` | `('whole' \| 'half' \| 'quarter' \| 'eighth' \| 'sixteenth')[]` | quarter half whole eighth sixteenth | Note values, easiest first (at least two). |
| `dotted` | `boolean` | false | Include dotted notes. |

Sample (`{ generate: 'note-value-math' }`, seed 1): type-answer, "How many quarter notes fit in one half note?" → 2

#### `meter`

Time signatures: what the two numbers mean and how many notes fill a bar. Produces `type-answer`, `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'beats' \| 'unit' \| 'fill'` | 'beats' | The top number; the note the bottom number stands for; how many of a note value fill a bar. |
| `signatures` | `string[]` | 4/4 3/4 2/4 6/8 | Time-signature pool, easiest first. |

Sample (`{ generate: 'meter' }`, seed 1): type-answer, "In 3/4 time, how many quarter notes are in each bar?" → 3

#### `rhythm-tap`

Tap a generated rhythm in 4/4. Produces `tap-rhythm`.

| param | type | default | meaning |
|---|---|---|---|
| `values` | `('half' \| 'quarter' \| 'eighth' \| 'sixteenth')[]` | quarter half eighth | Note values allowed, easiest first. |
| `bars` | `number` | 1 | Bars, 1 or 2. |
| `rests` | `boolean` | false | Allow quarter rests. |
| `tempo` | `number` | 80 | Beats per minute, 50 to 140. |
| `show` | `'notation' \| 'audio' \| 'both'` | 'both' | What the learner gets before tapping. |

Sample (`{ generate: 'rhythm-tap' }`, seed 1): tap-rhythm, "Tap this rhythm along with the click." → 1, 3, 4

#### `rhythm-ear`

Hear a one-bar rhythm and choose its notation. Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `values` | `('half' \| 'quarter' \| 'eighth' \| 'sixteenth')[]` | quarter half eighth | Note values allowed, easiest first. |
| `tempo` | `number` | 80 | Beats per minute, 50 to 140. |

Sample (`{ generate: 'rhythm-ear' }`, seed 1): listen-choice, "Which rhythm do you hear?" → Option 2

#### `rhythm-read`

Triplets and compound meters (6/8, 9/8, 12/8): tap a bar, say on which counts its notes start, or pick the bar you hear. Produces `tap-rhythm`, `choice`, `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'tap' \| 'count' \| 'ear'` | 'tap' | Tap the bar; choose the counts its notes start on; or hear it and choose it. |
| `feels` | `('triplets' \| '6/8' \| '9/8' \| '12/8')[]` | ['6/8', 'triplets'] | Feels in play, easiest first: triplets in 4/4, or a compound meter. |
| `rests` | `boolean` | false | Allow rests (never on the first beat). |
| `tempo` | `number` | 60 | The felt beat per minute (the dotted quarter in compound time), 40 to 100. |

Sample (`{ generate: 'rhythm-read' }`, seed 1): tap-rhythm, "Tap this rhythm with its triplets along with the click." → 1 trip let, 2 &, 3

#### `higher-lower`

Two notes are played: is the second higher or lower? Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `maxSemitones` | `number` | 12 | Largest gap in half steps (the easiest questions). |
| `minSemitones` | `number` | 1 | Smallest gap in half steps (the hardest questions). |
| `spelling` | `'auto' \| 'sharps' \| 'flats'` | 'auto' | How the explanation names black keys: the everyday name of each (C♯ E♭ F♯ A♭ B♭), sharps only, or flats only. |

Sample (`{ generate: 'higher-lower' }`, seed 1): listen-choice, "Is the second note higher or lower than the first?" → Higher

#### `interval-ear`

Hear an interval and name it. Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `intervals` | `string[]` | P8 P5 M3 m3 P4 M2 m2 M6 m6 m7 M7 A4 | Interval pool, easiest first (at least two different sizes). |
| `play` | `'up' \| 'down' \| 'together'` | 'up' | How the two notes are played. |

Sample (`{ generate: 'interval-ear' }`, seed 1): listen-choice, "Which interval do you hear?" → Perfect fourth

#### `chord-quality-ear`

Hear a chord and name its quality. Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `types` | `string[]` | ['major', 'minor'] | Chord type ids, easiest first (at least two that sound different). |

Sample (`{ generate: 'chord-quality-ear' }`, seed 1): listen-choice, "What kind of chord do you hear?" → Minor

#### `scale-ear`

Hear a scale and name it. Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `scales` | `string[]` | ['major', 'minor'] | Scale ids, easiest first (at least two that sound different). |

Sample (`{ generate: 'scale-ear' }`, seed 1): listen-choice, "Which scale do you hear?" → Natural minor

#### `cadence-ear`

Hear a four-chord phrase and name the cadence that ends it. Produces `listen-choice`.

| param | type | default | meaning |
|---|---|---|---|
| `types` | `('authentic' \| 'half' \| 'plagal' \| 'deceptive')[]` | ['authentic', 'half'] | Cadence pool, easiest first (at least two). |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Keys of the phrases. Minor phrases use the major V: i iv V i. |

Sample (`{ generate: 'cadence-ear' }`, seed 1): listen-choice, "How does this phrase end?" → Half: it stops on V

#### `staff-note`

Notes on the guitar staff: name the shown note, or put the named note on the staff. Produces `staff-read`, `staff-place`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'read' \| 'place'` | 'read' | Name the shown note, or place the named note. |
| `low` | `string` | 'E3' | Lowest sounding note (E3 is the bottom line as the guitar reads it). |
| `high` | `string` | 'F4' | Highest sounding note (F4 is the top line). |
| `accidentals` | `boolean` | false | Include sharps and flats. |

Sample (`{ generate: 'staff-note' }`, seed 1): staff-read, "Which note is this?" → C

#### `tab-read`

A bar of tab is shown: name its notes, name one of them, or tap where one is played. Produces `choice`, `fretboard-find`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'notes' \| 'note' \| 'find'` | 'notes' | Which notes the bar plays; which is the Nth note; or tap where the Nth note is played. |
| `strings` | `number[]` | [1, 2] | Strings the bar uses. |
| `frets` | `[number, number]` | [0, 3] | Fret range, inclusive (12 frets wide at most). |
| `length` | `number` | 4 | Notes in the bar, 3 to 8 (quarters up to four, eighths above). |
| `naturals` | `boolean` | true | Only natural notes (and only natural wrong options). |

Sample (`{ generate: 'tab-read' }`, seed 1): choice, "Which notes does this bar of tab play?" → B, E, B, D

#### `tab-play` (microphone)

Play a generated bar of tab into the microphone. Falls back to naming its notes. Produces `play-phrase`.

| param | type | default | meaning |
|---|---|---|---|
| `strings` | `number[]` | [1, 2] | Strings the bar uses. |
| `frets` | `[number, number]` | [0, 3] | Fret range, inclusive (12 frets wide at most). |
| `length` | `number` | 4 | Notes in the bar, 3 to 8 (quarters up to four, eighths above). |
| `naturals` | `boolean` | true | Only natural notes (and only natural wrong options). |
| `tempo` | `number` | 70 | Beats per minute, 40 to 120. |

Sample (`{ generate: 'tab-play' }`, seed 1): play-phrase, "Play this bar of tab, one note at a time." → B E B D

#### `sight-reading`

A short passage on the staff that stays in one key and one hand position: name its notes, or choose the tab that plays it. Produces `choice`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'notes' \| 'tab'` | 'notes' | Which notes the passage plays; or which tab plays it in the position. |
| `positions` | `number[]` | [1] | Hand positions (fret of the index finger, 1 to 12), easiest first. 1 is first position with the open strings. |
| `keys` | `string[]` | C major, A minor, G major, E minor, F major, D major | Keys, easiest first. Minor keys use their natural minor notes. |
| `bars` | `number` | 2 (1 for a tab question) | Bars of 4/4, 1 or 2. |
| `values` | `('half' \| 'quarter' \| 'eighth')[]` | ['quarter'] | Note values the rhythm may use (quarter among them). |

Sample (`{ generate: 'sight-reading' }`, seed 1): choice, "Which notes does this passage play?" → G, G, E, C, B, D, E, G

#### `sight-play` (microphone)

Play a short passage from the staff alone (no tab, no names) into the microphone, in one key and one hand position. Falls back to naming its notes. Produces `play-phrase`.

| param | type | default | meaning |
|---|---|---|---|
| `positions` | `number[]` | [1] | Hand positions (fret of the index finger, 1 to 12), easiest first. 1 is first position with the open strings. |
| `keys` | `string[]` | C major, A minor, G major, E minor, F major, D major | Keys, easiest first. |
| `bars` | `number` | 1 | Bars of 4/4, 1 or 2. |
| `values` | `('half' \| 'quarter' \| 'eighth')[]` | ['quarter'] | Note values the rhythm may use (quarter among them). |
| `tempo` | `number` | 60 | Beats per minute, 40 to 120. |

Sample (`{ generate: 'sight-play' }`, seed 1): play-phrase, "Read it and play it in first position (frets 0 to 4). Take your time." → G E D G

#### `staff-key`

Key signatures on the staff: name the key, pick the staff that shows a key, or read a note the signature alters. Produces `choice`, `staff-read`.

| param | type | default | meaning |
|---|---|---|---|
| `ask` | `'name' \| 'pick' \| 'read'` | 'name' | Which key has the signature shown; which staff shows a key; or name a note the signature alters. |
| `modes` | `('major' \| 'minor')[]` | ['major'] | Modes to draw keys from. |
| `maxAccidentals` | `number` | 4 | Largest signature used, 1 to 7. |
| `keys` | `string[]` | from modes and maxAccidentals | An explicit key pool, easiest first. Replaces modes and maxAccidentals. |

Sample (`{ generate: 'staff-key' }`, seed 1): choice, "Which major key has this key signature?" → D major
<!-- /gen -->

## B7. Facts and reviews

`facts` are the few things from a lesson worth remembering for good. When the lesson is completed each
becomes a spaced-repetition card (id `<course id>:<fact id>`), and the Review session brings it back at growing
intervals.

```ts
facts: [
  { id: 'staff-lines', front: 'Name the five lines of the staff, bottom to top.', back: '{n:E} {n:G} {n:B} {n:D} {n:F}' },
  { id: 'open-strings', front: 'Name the six open strings from string 6 to string 1.', back: '{n:E} {n:A} {n:D} {n:G} {n:B} {n:E}',
    ask: { generate: 'open-strings', params: { ask: 'order' } } },
]
```

`id` (slug, unique in the **course**: never rename one, cards are stored by it), `front` (at most 120
characters), `back` (at most 220), `figure?`, `ask?`: an exercise or generated step to ask instead of a
self-rated flashcard (never a microphone exercise: reviews must work anywhere). Two to four facts per lesson is
right; six is the limit.

## B8. Checkpoints

A unit's `checkpoint` lets a learner who already knows the unit test out of it, even before reaching it: a pass
marks every lesson of the unit done and opens what follows. It is a test: no second tries, no hearts, and more
than `maxMistakes` (default 3) fails it.

```ts
checkpoint: { sample: 8, maxMistakes: 2 }          // draw 8 exercises evenly from the unit's lessons
checkpoint: { maxMistakes: 2, steps: [ /* 6 to 20 exercises or generated steps: no cards, no flashcards */ ] }
```

## B9. The limits `validateCourse` enforces

Text lengths count **visible** characters (markup is free), sized for a 360 px phone.

<!-- gen:limits -->
| text | at most (visible characters) |
|---|---|
| course `title` | 40 |
| course `description` | 160 |
| unit `title` | 32 |
| unit `description` | 140 |
| lesson `title` | 40 |
| lesson `teaches` | 110 |
| card `title` | 40 |
| card `body` | 320 |
| card `tip` | 160 |
| exercise `prompt` | 140 |
| true-false `statement` | 160 |
| `hint` | 120 |
| `explain` | 240 |
| choice option `text` | 48 |
| option `why` | 140 |
| each side of a pair | 28 |
| an order tile | 16 |
| fill-blanks `text` | 120 |
| a bank word | 16 |
| flashcard / fact `front` | 120 |
| flashcard / fact `back` | 220 |
| figure `caption` | 80 |
| audio figure `label` | 28 |
| glossary `term` | 28 |
| glossary `definition` | 160 |

| count | allowed |
|---|---|
| options of a choice or listen-choice | 2 to 6 |
| pairs of a match-pairs | 3 to 6 |
| tiles of an order (distractors not counted) | 3 to 8 |
| distractor tiles of an order | 0 to 3 |
| blanks of a fill-blanks | 1 to 4 |
| words in a fill-blanks bank (right and wrong together) | 2 to 8 |
| positions an `all` fretboard-find asks for | 1 to 12 |
| notes of a play-phrase | 2 to 16 |
| struck notes of a tap-rhythm | 2 to 16 |
| bars of a rhythm | 1 to 2 |
| frets a fretboard figure or exercise spans | 1 to 13 |
| `minutes`, and the estimated time | 2 to 5 |
| steps in a lesson | 6 to 20 |
| exercises (steps that are not cards) | 4 to 16 |
| different exercise types (a warning outside this) | 3 to 6 |
| cards in a row before a question (a warning above this) | at most 2 |
| facts per lesson | 0 to 6 |
| lessons per unit | 2 to 12 |
| authored checkpoint steps | 6 to 20 |
| tempo of anything played (tap-rhythm: 40 to 160) | 40 to 200 BPM |
| highest fret | 22 |
<!-- /gen -->

What else is checked, by problem code:

| code | what it means |
|---|---|
| `id.format`, `id.duplicate` | ids are slugs; unit, lesson and fact ids are unique in the course, step ids in a lesson |
| `skill.format` | `skill` is exactly `theory:<unit>:<lesson>` or `teacher:<teacher>:<lesson>` |
| `requires.unknown`, `requires.cycle`, `requires.shape`, `requires.order` | prerequisites exist, do not loop, and (warning) come earlier on the path |
| `text.empty`, `text.long`, `text.markup`, `text.speech` | required texts are present, within limits, valid markup, with every music symbol tagged (or a `say`) |
| `glossary.unknown`, `glossary.shadow` | `{t:id}` terms exist; (warning) a course term replaces a built-in one |
| `figure.invalid` | a figure or sound is wrong on the instrument |
| `exercise.shape`, `exercise.count`, `exercise.policy` | a field is missing or malformed; too few or too many items; a `spelling` / `octave` policy is missing or contradictory |
| `exercise.ungradable` | no accepted answer, or the grader rejects the exercise's own answer |
| `exercise.distractor`, `exercise.duplicate`, `exercise.enharmonic` | a distractor is also right; two options are the same; two names for one pitch |
| `exercise.giveaway` | warning: the right picture option is the only one whose caption or text repeats what the prompt asks |
| `exercise.alternative` | a play exercise has no non-microphone alternative (or its alternative needs the microphone too) |
| `generator.params`, `generator.failed`, `generator.output` | unknown generator or parameter, a bad value, or params that can produce a faulty exercise |
| `fact.unknown`, `lesson.facts` | a step names a fact the lesson does not have; more than 6 facts |
| `lesson.length` | fewer than 6 or more than 20 steps, fewer than 4 or more than 16 exercises, `minutes` outside 2–5, or an estimated time outside 2–5 minutes (warning when `minutes` is far from the estimate) |
| `lesson.shape`, `lesson.variety` | warnings: the lesson opens with a question, has 3 cards in a row, ends on a card, or uses fewer than 3 or more than 6 kinds of question |
| `checkpoint.shape`, `course.shape` | a malformed checkpoint, unit or course |

`estimateLessonSeconds(lesson)` is the estimate used: reading time (14 characters a second) plus a typical
time per exercise type (`estimateStepSeconds(step)`).

## B10. Writing a good lesson

- **One idea per lesson.** If `teaches` needs an "and", it is two lessons. Two to five minutes, 8 to 12 steps.
- **Show, then ask.** Open with a card: a short text and a figure. Ask about it at once. Never more than two
  cards in a row; end on an exercise the learner will get right.
- **Three to five question types per lesson.** Ask the same idea several ways (recognise it, find it on the
  neck, hear it, play it); do not ask five ideas one way. More than six types makes the learner relearn the
  controls instead of the music.
- **Easy before hard.** Recognition (choice, true-false) before recall (type-answer, fretboard-find), before
  doing (chord-build, tap-rhythm, play). Put the generated drills last: they adapt to the learner.
- **Always say why an answer is right.** `explain` is read after every answer, right or wrong: give the
  reason, not "Correct!". On tempting wrong options add a `why`.
- **Make wrong answers plausible and certainly wrong.** The best distractor is the usual confusion (the minor
  third for the major third). Never offer two names of the same pitch unless the name is the question.
- **Put it on the guitar.** Tie every piece of theory to a fret, a shape or a sound. Whenever the idea can be
  played, add a play exercise with a tapping `alternative`.
- **Teach a word before using it**, and link it once with `{t:term}`. Plain words, second person, no hype.
- **Derive, do not type.** Prefer `derive` on fretboards, chord `symbol`s over hand-written shapes, and
  generators over lists of look-alike questions: the engines do not make spelling mistakes.
- **Pick the facts.** Two to four `facts` per lesson: the things a guitarist must know cold in a year.
- **Run the validator** until it returns nothing, then read the lesson aloud once: `speakable(text)` is what a
  learner with the voice on will hear.

---

# Part C — the lesson screens (`@/lessons/ui`)

React components on top of Part A, in their own barrel so the engine stays UI-free:
`import { LessonPlayer, CourseMap, ReviewEntry } from '@/lessons/ui'`. Gallery of every part and
state: `#kit-lessons` (`#kit-lessons--<section>`: `exercises cards figures feedback map lessons`;
`#kit-lessons--type--<type>` one type in its three states; `#kit-lessons--try--<type>` one exercise
in the real player, recording nothing; `#kit-lessons--play--<lesson>` a demo lesson for real).
Browser check: `node e2e/lessons.cjs`; screenshots: `node e2e/lessons-shots.cjs --all-types [--mobile] [--light]`.

## C1. A whole screen in a few lines

```tsx
import { navigate } from '@/app/router';
import { CourseMap, LessonPlayer, ReviewEntry } from '@/lessons/ui';
import { reviewSource } from '@/lessons';

// #learn--<unit>--<lesson>: the player is the whole screen (it renders its own <Page> and
// calls useImmersive(true, 'focus')).
<LessonPlayer key={lessonId} source={{ mode: 'lesson', course, lessonId }} route="learn" params={[unitId, lessonId]}
  onExit={() => navigate('learn')}
  onNext={(next) => next.kind === 'lesson' ? navigate('learn', next.unitId, next.lessonId)
                  : next.kind === 'practice' ? navigate('learn', next.unitId, 'practice') : navigate('learn')} />

// #learn: the map (two panes on wide screens, a bottom sheet on phones) and the review card.
<ReviewEntry courses={[course]} onStart={() => navigate('learn', 'review')} />
<CourseMap course={course} onStartLesson={(u, l) => navigate('learn', u, l)}
  onStartCheckpoint={(u) => navigate('learn', u, 'checkpoint')} onPractice={(u) => navigate('learn', u, 'practice')} />
```

Key the player by what it runs (`key={lessonId}`) so a new lesson starts a new player.

## C2. `LessonPlayer`

| prop | |
|---|---|
| `source` | any `SessionSource` (A2): `lesson`, `checkpoint`, `practice`, `review` (build it with `reviewSource` / `practiceSource`) |
| `onExit()` | the close button after "Save and leave", and "Back to the path" |
| `onNext?(step)` | the summary's primary button. `step` (`NextStep`): `{ kind: 'lesson', unitId, lessonId, title }` (the course map's next lesson), `{ kind: 'practice', unitId }` (out of hearts), `{ kind: 'path' }`. Without it the player runs the next lesson or the practice drill itself, in place |
| `exitLabel?` | words of the way back (default "Back to the path") |
| `route?`, `params?` | stored with the activity, so Today's "Continue" reopens the session |
| `port?` | where effects go (default the app's progress store); `memoryPort()` records nothing (galleries, try-outs) |
| `persist?` | save the unfinished session after every step and pick it up again (default true) |

What it does for you: starts the session from the learner's progress (`startSession`), or picks up the
unfinished one of the same lesson (`loadSession`, with one "Picked up where you left off · 3 of 10 steps done"
toast offering Start over, gone at the learner's first move and when the player closes);
dispatches every action through `reduceSession` and `applyEffects`; saves after every step; pauses the clock
while the page is hidden and re-syncs hearts on return (`pause` / `resume`); plays `playUi` correct / wrong /
combo / lessonComplete; keeps the screen awake; asks before leaving (Save and leave · Keep going · End now,
which records what was done and clears the saved place: its summary says "Lesson ended … starts from the
beginning"); the answer that uses the last heart says "That was your last heart" and promises no come-back;
when the microphone is refused, `MediaBlocked` explains why and the bar's one primary button is "Tap it
instead"; shows the summary (`sessionReport`: accuracy, time, XP, streak, crowns, cards
added, best run, "worth another look") with confetti when earned. Out of hearts ends kindly with "Practise to
refill hearts"; a failed checkpoint offers "Try again". The microphone is off from the start in the Claude
artifact host (`isArtifact()`), so play steps are their tapping alternatives there. After "I can't play right now"
every later play step opens as its tapping version, with a "Play it on my guitar instead" link under the prompt
that brings the microphone back (`mic` available). A lesson below the pass mark ends on "Good practice" with
"Try again" as the primary button (it restarts in place, whoever hosts the player). Card titles take the text
markup (`{c:Am7}`); plain titles stay plain. A tap-rhythm's feedback draws the rhythm with its counting.

Keyboard (shown on desktop only): number keys pick options, tiles, bank words and buttons (match pairs: the
left column 1…6, the right column A…F); letters type notes on the keypad (`#` sharp, `-` flat); Enter checks and
continues; Space replays the sound, turns a flashcard, taps a rhythm or marks a fret; Backspace takes the last
pick back; arrows nudge a note on the staff and walk the fretboard; Escape asks to leave.

Lower level, for screens that frame the step themselves: `useLessonSession({ source, port?, persist?, resume?,
mic?, route?, params? })` → `{ state, results, dispatch(action without at), restart(source?), resumed, source,
port }`; `TeachingCard`, `ExerciseFrame` (pass `onUseMic` on a tapping version to offer the microphone again),
`FeedbackPanel`, `SummaryView`, `LeaveDialog`, `TeacherBadge`. `teacherLine(teacher, outcome, perfect, mode?)`: pass
the session `mode` so a lesson below the pass mark gets its "once more" line.

## C3. `CourseMap` and `ReviewEntry`

`<CourseMap course onStartLesson(unitId, lessonId) onStartCheckpoint?(unitId) onPractice?(unitId) progress?
autoScroll? />`: the winding path of `courseMap()` (A10) grouped by unit. Nodes show `locked` (a lock),
`available`, `current` (amber, a "Start" bubble beside it on the roomier side, scrolled into view on opening),
`done` (a tick, crowns, a blue dot when due for review). Rows are spaced in rem, so a learner's larger text
keeps every title clear of the next node. Each unit header has its progress, crowns, "Test out" (or "Jump
here" when `ahead`) and "Practise"; it stays in view while its path scrolls on screens at least 36 rem tall
(not on a phone held sideways, nor with very large text). Tapping a node shows its card (title, what it
teaches, minutes, crowns, Start): a bottom sheet on phones, a sticky side pane at 900 px and up. Arrow keys / Home / End walk the nodes; Enter
starts the chosen one. Progress is the learner's, live, unless `progress` is given.

`<ReviewEntry courses onStart hideWhenEmpty? variant? />`: "12 cards due · About 3 minutes · Review now" from
`dueFactCards`; "All caught up" (or nothing, with `hideWhenEmpty`) when none is due; nothing at all before
the learner has any card. `variant`: `card` (default: raised, primary button) or `quiet` (flat, secondary button)
for a screen that already has its own primary action.

## C4. Parts

| export | |
|---|---|
| `EXERCISE_RENDERERS`, `ExerciseBody`, `exerciseKindLabel`, `selfSubmitting` | one renderer per exercise type (`ExerciseViewProps`: `exercise presentation review onDraft onSubmit setPrimary hints level naming uid onCantPlay? onMicUnavailable?`). A type without a renderer is a type error |
| `FIGURE_RENDERERS`, `FigureView` | one renderer per figure kind, on the music kit (`Fretboard`, `ChordDiagram`, `NotationView`, `PianoKeys`, `CircleOfFifths`, `RhythmView`, `StrumPattern`); tab is a small SVG of its own. `inOption` draws a figure as an answer option (a chord box without its name). Necks and keyboards on cards play the note tapped |
| `ScrollHint` | wraps content that may scroll sideways in its own box (a long neck or tab on a phone): a soft edge and a tappable arrow where more is hidden |
| `RichText`, `usePlainText` | the markup of B3 as React: notes in the learner's naming, glossary terms tappable |
| `LessonProvider`, `useLessonContext` | the course for glossary, teacher and level (the player and map provide it) |
| `useSoundPlayer`, `schedulePlan`, `techniqueOptions`, `planLine` | play a `Sound` or `SoundPlan` (normal or slower) with the learner's guitar tone and click: tab techniques as pluck options, a drone under it, a held chord with the line over it (`stretchPlan` keeps both under a slowed line) |
| `useStepKeys`, `StepKeysProvider`, `useKeysRegistry` | the step's keys inside the player's single keyboard listener |
| `feedbackCopy`, `wrongLine` | the feedback panel's words: "Not quite. E is the third of C." + the answer + why |
| `summaryHeadline`, `summaryStats`, `teacherLine`, `nextLabel`, `formatDuration`, `resumeNote` | the summary's words and numbers; the "Picked up" toast's line |
| `memoryPort()` | a `ProgressPort` onto a throwaway store |

Every answer control is a real button of at least 44 px; dragging is never needed (match: tap one item then
its partner; order and fill: tap tiles, tap again to take back; staff: tap a line or space, drag, or step the
note up and down). Exercise controls carry `data-*` attributes with authored indexes (`data-option`,
`data-left`, `data-right`, `data-tile`, `data-bank` + `data-word`, `data-value`, `data-key`, `data-accidental`,
`data-rating`) and the stage carries `data-step-id`, which is how `e2e/lessons.cjs` answers by the engine's
own `solve()`.

