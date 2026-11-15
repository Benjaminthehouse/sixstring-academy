# Sixstring Academy — the guitar school (`guitar/`)

A complete, offline-first guitar school that runs entirely in the browser: tuner, live fretboard
camera, sheet scanner/importer, interactive song player, a bite-sized theory course, three teachers
(beginner / intermediate / expert), every scale and chord, scale games, progressions, ear, rhythm
and technique training. It is independent of the MMO packages in this repo: nothing here imports
from `extension/` or `backend/`, and nothing there depends on this.

There is **no backend**. All logic, content and assets ship with the app.

## Commands (run from `guitar/`)

```bash
npm run dev            # http://localhost:5173 (localhost is a secure context: mic + camera work)
npm run dev:phone      # self-signed HTTPS on the LAN, so a phone gets mic + camera
npm run typecheck      # tsc --noEmit (strict)
npm test               # vitest (unit tests, node environment)
npx vitest run src/core/theory        # just one area
npm run build          # typecheck + production build -> dist/
npm run build:artifact # build for hosting as a Claude artifact -> dist-artifact/
node e2e/shot.cjs <route> [--mobile] [--light] [--full] [--click "text"] [--wait ms]   # screenshot a screen -> e2e/out/*.png
```

`e2e/lib/harness.cjs` (`withApp`) starts its own dev server on a free port and drives the
pre-installed Chromium (`require('playwright')` works; never install Playwright). It can feed a WAV
file as the microphone and an MJPEG/Y4M file as the camera (`fakeAudio`, `fakeVideo`).

## Two hosts

| | standalone (own origin / installed PWA) | Claude artifact |
|---|---|---|
| Microphone, camera | yes (https or localhost) | **refused by the viewer** |
| Network | none needed at runtime | blocked except files published with the page |
| Downloads / print | yes | only through the `downloads` capability / never |
| Ask Claude (text + images) | only with the user's own API key | `sample` capability |

So: never fetch from a CDN or any third-party host at runtime — every asset (fonts, WASM, models,
OCR data, worker scripts) is bundled or served from `public/`. Never call `getUserMedia`,
`localStorage`, `alert/confirm/prompt`, `window.print` or `<a download>` directly; use
`src/core/platform/*` (`media.ts`, `storage.ts`, `env.ts`, and the services added beside them).
Audio only starts after a user gesture.

### Bundled runtime assets (`public/vendor/`, served at `./vendor/...`)

`scripts/vendor-assets.mjs` (runs before `dev` and `build`) fills `public/vendor/`, which is
git-ignored. Build URLs with `new URL('vendor/…', document.baseURI)` (the app is served from a
relative base, so never start these paths with `/`).

| Path | What | Use |
|---|---|---|
| `vendor/tesseract/worker.min.js`, `vendor/tesseract/core/`, `vendor/tesseract/lang/eng.traineddata.gz` | Tesseract.js OCR | pass as `workerPath`, `corePath`, `langPath` (`gzip: true`) so nothing loads from a CDN |
| `vendor/mediapipe/wasm/`, `vendor/mediapipe/hand_landmarker.task` | MediaPipe hand landmarks | `FilesetResolver.forVisionTasks(<wasm dir>)`, `modelAssetPath` |
| `vendor/pdfjs/{cmaps,standard_fonts,wasm}/` | pdf.js extras | `cMapUrl`, `standardFontDataUrl`, `wasmUrl`; the pdf.js worker itself is bundled with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` |

A missing vendor file must degrade to a clear "not available" message, never a crash. The artifact
build ships without the Tesseract and MediaPipe files (the camera is unavailable there and sheet
reading uses the AI service instead).

## Layout and ownership

```text
src/
  app/            router.ts, routes.ts (route registry), App shell, navigation, hubs/ (study, studio, tools)
  ui/             tokens.css, global.css, primitives (Button, Card, Tabs, Modal, Toast ...)
  ui/music/       Fretboard, ChordDiagram, TabView, NotationView, CircleOfFifths ...
  core/
    math/         pitch-math.ts (MIDI <-> Hz, cents)
    platform/     env, storage, media, ai, download
    theory/       notes, intervals, scales, chords, keys, harmony, roman numerals
    guitar/       tunings, fretboard mapping, scale positions, chord voicings
    audio/        Web Audio engine: guitar synth, drums, bass, metronome, transport
    pitch/        pitch detection, mic pipeline, note tracker, chord detection
    progress/     profile, XP, streak, hearts, achievements, spaced repetition, settings
    song/         song model, parsers/importers, arranger, playback engine
    vision/       fretboard detection + tracking from camera frames
    omr/          sheet recognition (tab, chord sheets, standard notation)
  features/<name>/index.tsx   one directory per screen, default-exports the screen component
  content/        authored data: theory units, teacher courses, songs, progressions, exercises
e2e/              harness + end-to-end scripts (CommonJS .cjs)
```

Each core module keeps an `index.ts` barrel (import from `@/core/theory`, not from inner files) and
an `API.md` next to it: a short digest of the exports with signatures and two or three usage
examples. **Read a module's `API.md` before using it.** Unit tests sit beside the code
(`*.test.ts`).

### Rules for working in parallel

Many agents build this at once in the same checkout. To stay out of each other's way:

- **Only create or edit files inside the paths you were given.** Everything else is read-only.
- **Never edit**: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`,
  `index.html`, `src/main.tsx`, `src/app/routes.ts`, `src/app/router.ts`, `src/ui/tokens.css`,
  `src/ui/global.css`, `src/core/math/*`, `src/core/platform/{env,storage,media}.ts`,
  this file. Never run `npm install`, `npm uninstall` or any `git` command that changes state
  (no add/commit/checkout/stash/reset/clean). Never delete files you did not create.
- All dependencies you may use are already installed: `react`, `react-dom`, `lucide-react`,
  `pdfjs-dist`, `tesseract.js`, `vexflow` (v4), `@coderline/alphatab`, `@tonejs/midi`, `jszip`,
  `@mediapipe/tasks-vision`; dev: `vitest`, `jsdom`, `pngjs`, `jpeg-js`. Nothing else.
- If something you need is missing from another module, do **not** patch that module. Implement
  what you need inside your own directory and list it under "gaps" in your final report.
- `npm run typecheck` checks the whole tree. Errors in files you do not own are not yours to fix:
  check that **your** files are clean (`npx tsc --noEmit 2>&1 | grep <your path>`).
- Other agents may be mid-edit, so the dev server can fail transiently on someone else's file.
  Retry once after a short wait before concluding anything is wrong with your code.

## Code conventions

- TypeScript strict, ES modules, React 18 function components + hooks. No class components except
  error boundaries. No `any` in exported signatures.
- Imports use the `@/` alias (`@/core/theory`, `@/ui`, `@/app/router`).
- Styling: **CSS Modules** (`Thing.module.css`) next to the component, built only from the tokens
  in `src/ui/tokens.css`. No literal colours, no inline hex, no CSS-in-JS libraries, no Tailwind.
  Inline `style` is fine for computed geometry (positions, sizes), not for colours or type.
- Heavy libraries (`pdfjs-dist`, `tesseract.js`, `vexflow`, `@coderline/alphatab`,
  `@mediapipe/tasks-vision`) are loaded with dynamic `import()` at the point of use, never at
  module top level of a screen.
- Real-time work (audio analysis, camera frames) never runs through React state per frame: draw to
  a canvas / mutate refs, and set state only when a displayed value changes meaningfully.
- Always clean up: stop media tracks, cancel `requestAnimationFrame`, close/suspend audio nodes,
  remove listeners in effect cleanups. Screens are mounted and unmounted constantly.
- Pure logic goes in `core/` with unit tests; screens stay thin.
- Comments explain why, not what. Every exported function/type has a one-line doc comment.

## Routing

`#name` or `#name--param--param` (see `src/app/router.ts`). Names and params are slug-safe:
lowercase letters, digits, single hyphens — use `slug()` for ids. Use `href('scales', 'a-minor')`
for links and `navigate()` in handlers. The registry in `src/app/routes.ts` lists every screen;
a feature gets `{ params }`. Sub-screens of a feature are params (`#teachers--mia--lesson-3`), not
new routes. Never use the names `settings`, `sidebar`, `customize`, `upgrade`, `downloads`.

## Music conventions (every module agrees on these)

- **Pitch**: MIDI note numbers, C4 = 60, A4 = 69. Pitch class 0–11 with C = 0.
- **Guitar sounds an octave below where it is written.** Sounding standard tuning is
  E2 A2 D3 G3 B3 E4 = MIDI 40 45 50 55 59 64. Data always stores sounding pitch; only notation
  rendering transposes (treble clef 8vb).
- **Strings** are numbered the guitarist's way: string 1 = thinnest/highest (high E), string 6 =
  low E. A fretted position is `{ string, fret }` with fret 0 = open. Per-string arrays such as a
  tuning are ordered **low to high** (index 0 = string 6 on a six-string).
- **Tab and fretboard diagrams** are drawn the standard way: high E string on top, low E at the
  bottom, nut on the left. Left-handed mode is a display flip only; data never changes.
- **Spelling** is ASCII in data: `C#`, `Bb`, `F##`, `Cb`. Display uses ♯ ♭ 𝄪 𝄫 via the theory
  module's formatter. Spell notes correctly for their key/chord (F♯ major contains E♯, not F).
- **Intervals** `P1 m2 M2 m3 M3 P4 A4 d5 P5 m6 M6 m7 M7 P8` (+ compound `M9` …); **degrees**
  `1 b2 2 b3 3 4 #4 b5 5 #5 b6 6 bb7 b7 7`.
- **Chord symbols** `C Cm C7 Cmaj7 Cm7 Cm7b5 Cdim7 Csus4 Cadd9 C7#9 C/E`; **roman numerals**
  `I ii iii IV V vi vii° V7 bVII iiø7 V/V`.
- **Time** in songs is in ticks, 960 per quarter note.
- Degree colours and finger colours are fixed tokens (`--deg-1`…`--deg-7`, `--finger-1`…); a
  colour is always paired with a text label.

## Design and UX

**The bar, set by the owner: super intuitive, easy and fun to use, and it has to look and feel
good on both desktop and mobile.** A screen that works but feels clumsy, cramped, confusing or
dull is not finished. Check every screen you build at phone size *and* desktop size
(`node e2e/shot.cjs <route> --mobile` and without), in both themes, and use it the way a learner
would before you call it done.

### Intuitive and easy

- **One obvious next step.** Each screen has one primary action, visually dominant and reachable
  without scrolling. Everything else is secondary or tucked behind "More".
- **Zero-instruction start.** A new user should succeed in the first 10 seconds without reading:
  sensible defaults already selected, a real example already loaded, the main control labelled
  with a verb ("Start tuning", "Play", "Check my answer"). No setup walls, no empty states.
- **Progressive disclosure.** Show the simple version first; advanced options (alternate tunings,
  exotic scales, tempo ramps) live one tap away, never in the way of a beginner.
- **Immediate, kind feedback.** Every tap responds within 100 ms (state change, sound or motion).
  Mistakes are explained and recoverable: say what was expected, show it, let them retry. Never
  punish, never dead-end, never lose their work; destructive actions ask first and offer undo.
- **Same pattern everywhere.** Picking a key, a scale, a tempo, a tuning, starting/stopping audio,
  enabling the mic, going back: each works identically on every screen (use the shared
  components, do not reinvent them). Learn it once, know it everywhere.
- **Plain words.** Teach a term before using it; where a term is unavoidable, make it tappable for
  a one-line explanation. Numbers come with units and meaning ("12 cents flat: tighten slightly").
- **Always a way forward.** Finishing anything offers the next thing ("Next lesson", "Try it
  faster", "Play it on your guitar"). No screen ends in a blank.

### Fun

- Progress is visible and celebrated: XP ticks up, rings fill, streaks flame, a short tasteful
  celebration on completion (motion + sound, reduced-motion aware). Small wins come often.
- Practice feels like play: short rounds (30–120 s), clear goal, instant scoring, "one more try"
  is one tap. Difficulty adapts so the learner succeeds roughly 80% of the time.
- The instrument is the star: fretboards, strings and notes animate and sound when touched.
  Anything that shows a note can play it.
- Personality without noise: warm teacher voices, a little humour, no nagging, no guilt, no fake
  urgency, no dark patterns.

### Feels good on a phone

- **Mobile first.** Every screen works at 360 px wide with no horizontal page scroll and touch
  targets ≥ 44 px, and uses the space well at 1280 px. Phones get a bottom tab bar (Today, Learn,
  Play, Tools, Me); wide screens get a sidebar. Wide content (tab, fretboards) scrolls inside its
  own container.
- Primary controls sit in the thumb zone (lower half); pickers and options open as bottom sheets;
  nothing important hides behind hover. Fretboards and tab use the full width and work in
  landscape; while practising, the screen stays awake and the chrome gets out of the way.
- No layout jumps while audio or camera starts; reserve the space. Lists scroll smoothly; taps are
  never swallowed by a scrolling container.

### Feels good on a desktop

- Use the width on purpose: two-pane layouts (controls beside the fretboard, lesson text beside
  the interactive example), never a phone column stretched or stranded in the middle of a 1440 px
  screen, never lines of text wider than about 70 characters.
- Keyboard first-class: Space = play/pause, arrows = step/adjust, Enter = confirm/next, Esc =
  close/back, number keys = pick an answer. Show the shortcut in the button's tooltip.
- Hover and focus states on everything interactive; pointer cursor on clickable things.

### Both

- Both themes must look deliberate (tokens handle it). Respect `prefers-reduced-motion`.
- Smooth: animations at 60 fps using transform/opacity, 150–300 ms, eased; never block input.
- Fast: a screen is interactive in under a second on a mid-range phone; heavy modules load
  lazily behind a skeleton, not a blank.
- Visible keyboard focus, real `<button>`/`<a>`, labels on inputs, `aria-live` for feedback that
  appears (correct/incorrect, detected note). Colour is never the only signal.
- A screen opens in a useful state — a selected key, a loaded example — never an empty shell.
- When the microphone or camera is unavailable, the screen still works by tap/click wherever that
  makes sense, and explains what is missing using `explainMediaFailure()`.
- Copy: plain, warm, specific. Second person. No exclamation-mark hype, no emoji as decoration,
  no jargon before it has been taught. Buttons say what they do.
- Identity: pearl-and-ink neutrals, one sunburst-amber accent, the fretboard in real instrument
  materials. Display type Bricolage Grotesque, body Instrument Sans, tab/numbers JetBrains Mono.
- This is an original product. Do not copy the name, characters, art, sounds or screen layouts of
  any existing app or game. Genre mechanics (streaks, XP, lesson paths, falling-note games) are fine.

## The three teachers

| id | Name | Level | Voice |
|---|---|---|---|
| `mia` | Mia Brooks | Beginner — never held a guitar → first songs | Patient, encouraging, concrete. One idea at a time. Zero jargon until taught. |
| `dev` | Dev Okafor | Intermediate — open chords → the whole neck, improvising | A bandmate. Connects every bit of theory to something you can play tonight. |
| `elena` | Prof. Elena Varga | Expert — advanced harmony, technique, style, composition | Conservatory rigor, dry humor, high standards, deep respect for the student. |

They are fictional. Their lessons are authored content, so they work offline.

## Content rules

- **Correctness is the product.** Every theory statement, spelling, fingering and tab must be
  right. Where a fact can be computed (notes of a scale, a chord's tones, a fret's pitch), derive
  it from `core/theory` / `core/guitar` rather than typing it, and cover authored data with tests
  that cross-check it against the engine.
- **Copyright.** Only public-domain or traditional music may be transcribed (melodies, tabs,
  arrangements): e.g. traditional folk songs, and composers who died before 1955 (Carcassi, Sor,
  Tárrega, Giuliani, Bach, Beethoven…). Original exercises and études written for this app are
  welcome. Modern songs may be *named* as examples ("the I–V–vi–IV progression, as in …") but
  never transcribed, tabbed or quoted (no lyrics, no riffs).
- Write for a learner with no teacher in the room: say what it should feel and sound like, the
  common mistake, and how to fix it.

## Gamification vocabulary

XP (experience), level, daily goal, streak (consecutive days with XP), hearts (mistake budget
inside theory lessons), gems (earned currency), crowns/stars (mastery per skill), achievements.
All state lives in `core/progress`; screens report activity through it and never keep their own
persistent counters.
