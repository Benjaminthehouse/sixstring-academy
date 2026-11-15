# Built-in songs: how to add one

Every built-in song is one folder in this directory. The folder name is the song's id: it appears
in links (`#play--hot-cross-buns`), in progress (`song:hot-cross-buns`) and in favourites, so pick
it once and never rename it.

```text
src/content/songs/
  hot-cross-buns/
    song.sixtab     the notes, chords and lyrics (SixTab, the format of @/core/song)
    meta.ts         what the Songs screen shows and filters on
```

Nothing else needs editing: the registry (`index.ts`) finds new folders by itself, the Songs screen
lists them, and the Player opens them. The song's notes are loaded only when someone opens it.

## Steps

1. **Check the rights first.** Only public-domain or traditional music, or an original study written
   for this app (see "Rights" below). If the piece is in `src/content/plan/repertoire.json`, use its
   id as the folder name and follow its `notes` / `spec` exactly.
2. **Copy a folder** that is close to what you are writing (a strummed song: `frere-jacques/`; a
   melody: `hot-cross-buns/`; fingerstyle: `greensleeves-fingerstyle/`; a classical-style study:
   `st-pimami-3-4/`; a riff-based study: `st-blues-shuffle-a/`) and rename it to the new id:
   lowercase letters, digits and single hyphens, never starting with `my-` (that prefix belongs to
   the learner's own songs).
3. **Write `song.sixtab`.** The grammar is in `src/core/song/API.md` ("SixTab"). The header needs
   `title:` (exactly the title in `meta.ts`), `composer:`, `licence:`, `difficulty:` (the level in
   `meta.ts`), `tempo:`, `time:` and `key:`. Leave `id:` out (the folder name is the id) or make it
   equal to the folder name. Start with a `#` comment saying what the arrangement is.
4. **Write `meta.ts`** with `export default defineSong({ ... })`. Your editor completes and checks
   every field; the comments in `types.ts` say what each one is for.
5. **Run the test:** `npx vitest run src/content/songs`. It parses every song, validates it with the
   song core, and checks the metadata. Each failure names the file and, for SixTab, the line and
   column: `hot-cross-buns/song.sixtab: line 21, column 9: Bar 3 adds up to 2880 ticks but 4/4
   needs 3840: a quarter is missing.`
6. **Look at it:** `node e2e/shot.cjs songs--<id>` shows it selected in the library, and
   `#play--<id>` opens it in the Player.

## `meta.ts` fields

| Field | What to write |
|---|---|
| `title` | The title as the learner sees it. Same as `title:` in the SixTab file. |
| `composer` | The composer, or the tradition for anonymous music: `Traditional English`. Original studies: `Sixstring Academy`. |
| `origin` | When and where, a few words: `Anonymous tune, registered in 1580`. |
| `publicDomain` | Why it is free to use, in plain sentences. Judge the music and the words separately. |
| `level` | 1 (first week) to 10 (concert level). Use the plan's level when it has one. |
| `style` | One of `SONG_STYLES` in `types.ts` (folk, children, classical, blues, ...). |
| `kind` | How it is arranged: `melody`, `strum-and-sing`, `melody-with-chords`, `fingerstyle`, `classical-solo`, `flatpicking`, `duet`, `riff`, `study`. |
| `key` | For people: `G major`, `A minor`. Same key as `key:` in the SixTab file. |
| `teaches` | Two to four short phrases a learner understands: `Your first chord: a one-finger G`. |
| `skills` | One to four filter categories from `SONG_SKILLS`. The test checks the music backs them up: `singing` needs lyrics, `strumming` needs strummed slashes, `chords` needs chord symbols. |
| `tags` | Lower-case search words: `round`, `12-bar`, `6/8`. |
| `about` | Two to four sentences for a learner alone with a guitar: what it should feel and sound like, the common mistake, and how to fix it. Second person, plain words, no exclamation marks. |
| `plan` | The repertoire plan id, when the song comes from the plan (it must equal the folder name). |
| `added` | Today's date, `YYYY-MM-DD`. |

## Writing the music

- **Data is sounding pitch** and fret numbers count from the capo; the song core computes every
  pitch from string, fret and tuning, so a wrong fret is a wrong note: play it through in the
  Player before you commit it.
- **Spell it for a guitarist.** Fingerings that a teacher would give: put the hand in one position,
  use `{1}`–`{4}` for left-hand fingers where they help, `{P}{I}{M}{A}` for the right hand in
  fingerstyle, and only on the bars where the learner needs them.
- **Chord symbols name what sounds.** Give a shape when it is not the usual one: `"G=xx0003"`.
- **Lyrics** go on the line right under the music they are sung to, one syllable per note
  (`pen- ny`); `_` skips a note.
- **A strum-along song** puts the learner's part first (`track: Your strum`, `role: rhythm`, slashes
  `D U`), with the tune as a second track (`role: lead`) that carries the lyrics.
- **Swing** is written as triplets: `q3` (long) then `e3` (short) in each beat.
- Keep it short enough to learn in a sitting: a verse and a chorus, an A and a B section.

## Rights

A piece may be added only if every part used passes (the full rule is at the top of
`src/content/plan/REPERTOIRE.md`):

- the composer died in 1954 or earlier **and** the work was published in 1930 or earlier, or the
  music is traditional/anonymous with a record before 1930;
- the words pass the same test separately, or the song is instrumental;
- the arrangement is new, written for this app: never copy a modern edition, tab, chord chart or
  recording;
- classical pieces are transcribed from the first or an early edition; if you cannot consult one,
  do not reconstruct the piece from memory;
- modern songs may be named as examples elsewhere in the app, never transcribed here.

When in doubt, leave it out.
