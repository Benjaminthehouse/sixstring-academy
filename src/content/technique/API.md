# `@/content/technique` — the technique exercises

Every technique exercise of the plan (`src/content/plan/repertoire.json`, list `technique`: 67
exercises) written out as playable material, with its tempo ladder, the plan's "watch for" list and
a fix for each, health warnings, and what the microphone can check. The screen is `#technique`
(`src/features/technique`); an exercise is `#technique--<id>` (`#technique--tech-spider`; the
`tech-` prefix may be left out). Tests: `npx vitest run src/content/technique`.

```ts
import { TECHNIQUE_EXERCISES, getExercise, partSong, techniqueSkillId } from '@/content/technique';
const e = getExercise('tech-spider')!;            // or getExercise('spider')
const song = partSong(e, e.parts[0], 72);          // a Song at a ladder tempo, ready for SongPlayer / TabView
recordActivity({ kind: 'technique', id: techniqueSkillId(e.id), ... }); // 'technique:tech-spider'
```

## The data (`types.ts`)

```ts
TechniqueExercise = {
  id, title, hand: 'fretting' | 'picking' | 'both', level: 1..10,          // = the plan
  skill: SkillGroup,           // health setup independence alternate-picking strumming fingerstyle legato bends
                               // vibrato chords shapes shifts muting sweep tone time (SKILL_GROUPS: name, description, icon)
  mode: 'ladder' | 'changes' | 'routine' | 'guide',
  tempo: { start, step, goal }, // = the plan; step 0 = a fixed tempo (bends, posture)
  teaches: string[],            // = the plan
  summary, steps: string[], feel,                     // learner copy: what, how, what it should feel like
  mistakes: { watch, fix }[],   // watch = the plan's watchFor, in order; fix = what to do about it
  strain?: { text, maxMinutes },// can strain the hand: shown with the exercise; the screen suggests a rest after maxMinutes
  parts: ExercisePart[],        // the playable material
  pairs?: ChordPair[],          // changes: { id ('em-g'), a/b: { symbol, shape }, tip }
  routine?: RoutineStep[],      // routine: { id, title, seconds, text, part?, link?, reflect? }
  checklist?: string[], reference?: { midi, label }, tools?: { route, label, icon }[],   // guide
}
ExercisePart = { id, name, note?, tab /* SixTab body */, time?, key?, capo?, pulse?: 'quarter' | 'eighth',
                 tempoScale?, click?: 'beats' | 'backbeat' | 'offbeat' | { unit, groups }, check: CheckSpec }
CheckSpec = { kind: 'notes', intonation? } | { kind: 'onsets' } | { kind: 'bend', string, fret, semitones, toleranceCents, alone? }
          | { kind: 'prebend', string, fret, semitones, toleranceCents } | { kind: 'vibrato', string, fret, style, wavesPerBeat }
          | { kind: 'level', shape: 'steps' | 'swell' } | { kind: 'none', why }
```

Tempo is the ladder's number: quarter notes per minute, except a part with `pulse: 'eighth'` (7/8,
where the ladder counts eighths) or a `tempoScale` (thirty-seconds at half the ladder tempo).
`songBpm(part, ladderBpm)` converts.

## Lookups (`index.ts`)

```ts
TECHNIQUE_EXERCISES                 // all, easiest first (level, then authored order)
getExercise(id) | null              exercisesBySkill('bends')            SKILL_GROUPS  HANDS
techniqueSkillId(id)                // 'technique:<id>' (progress skill; the screen keeps { best, log } in its data)
chordChangeSkillId(pair)            // 'chord-change:<pair id>' (one-minute changes record kind 'chord-change')
hasLadder(e)  ladderRungs(e)        // [start, start+step, ..., goal]
partSixTab(e, part, ladderBpm)      // the whole SixTab file    partSong(e, part, ladderBpm)  // parsed, cached
MAJOR_KEYS  MELODIC_MINOR_KEYS      // the circle-of-fifths order of the all-keys exercise
```

## How it was written

Systematic material is generated (`generate.ts`: finger orders, the chromatic pattern, alternate
strokes, legato strings, 3nps scales from `@/core/guitar`); the rest is hand-written SixTab. The test
checks: one exercise per plan entry with the plan's fields; every part parses with no error or
warning at the start and goal tempos; every note on the neck; every chord shape (copy, tab, pairs)
builds with `voicingProblem`; every "string N fret M (X)" in the copy names the right note; the
spider and the 24 finger orders; G major and pentatonic material against the engines; the tapped
triads; all 24 keys in their own scale, root to root over two octaves; bends and vibrato put in the
tab what the microphone checks, with the target played first.

Two places where this module says something different from the plan's wording, on purpose:
`tech-fretting-mute` (the plan says E5 (022xxx) leaves "only strings 6 and 5"; the shape sounds
strings 6, 5 and 4, and the copy says so) and `tech-string-crossing` (pattern B is written starting
on the downstroke E so downstrokes stay on the beat; the strokes are the plan's).
