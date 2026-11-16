# The three teachers: course plan

Three guided courses that take a learner from never having held a guitar to an independent
musician. The Theory Path teaches theory in bite-sized cards; the teachers teach **playing**, the way
weekly lessons with a good teacher go: a short explanation in the teacher's voice, a demonstration
(tab or fretboard figure with audio), guided practice with the microphone listening where that
helps, and a real piece of music. The source of truth is [`teachers.json`](./teachers.json);
[`teachers.test.ts`](./teachers.test.ts) checks it. Music ids point into
[`repertoire.json`](./repertoire.json), theory ids into [`theory-path.json`](./theory-path.json).

| Course | Teacher | Lessons | Practice time | Repertoire levels used | Theory links (stages) |
|---|---|---|---|---|---|
| `mia` First Steps with Mia | Mia Brooks, beginner | 74 in 12 units | about 16 hours | levels 1 to 5 (pieces 1 to 4) | mostly beginner |
| `dev` The Whole Neck with Dev | Dev Okafor, intermediate | 73 in 12 units | about 18 hours | levels 2 to 7 (pieces 3 to 6) | mostly intermediate |
| `elena` Mastery with Prof. Elena Varga | Prof. Elena Varga, expert | 80 in 13 units | about 24 hours | levels 1 to 10 (pieces 2 to 10) | mostly expert |

## Mia: from the first open string to your first solo

Promise: tune and hold the guitar comfortably, read tab and chord boxes, change cleanly between 14
open chords plus F and Bm, strum in 4/4, 3/4 and 6/8, play melodies, riffs, power chords and a 12-bar
shuffle, improvise with A minor pentatonic, play with others, and keep a daily practice habit.
Music from minute one (the Open-String Duet in lesson 1), a real tune in lesson 5 (Hot Cross Buns),
a first strummed song in lesson 9 (Frere Jacques), then a new song almost every lesson. Chords arrive
in order of difficulty, the order the lesson engine's own chord drill uses: Em; then E and Am, which
are one shape; then A, E7, D, A7, G, C and D7; then Dm, B7, Fmaj7, the small F, G7, the F barre and
Bm. No lesson pairs a new hard chord with a new strumming pattern.

1. **Hello, guitar** (6): parts and strings, posture, tuning, the pick, Hot Cross Buns, a first-week show.
2. **Your first chords** (7): chord boxes and Em, E and Am as one moving shape, a one-finger G and Frere Jacques, A, E7, Skip to My Lou, a first songbook.
3. **Melodies from tab** (6): tab with rhythm, notes on strings 1 to 3, Mary, Lightly Row, Twinkle, London Bridge, Ode to Joy, a recital.
4. **D, A7 and the steady beat** (6): counting, D, down-up eighths, Drunken Sailor, A7 and waltz time, two waltzes.
5. **G, C and three-chord songs** (6): G, C and D7 with anchor fingers, Michael Row, Coming 'Round the Mountain, Amazing Grace from memory.
6. **Minor chords, minor songs** (6): the C to Am change, Dm, B7, Go Down Moses, Wade in the Water, hearing major and minor.
7. **Strumming patterns** (7): the folk pattern (Wade in the Water's own groove), Down by the Riverside, accents and chucks, 6/8, Silent Night with a first fingerpicking pattern, boom-chick, a three-strum set.
8. **Riffs and melodies on all six strings** (6): low-string notes, hammer-ons and pull-offs, Deck the Halls, Joy to the World, The Rakes of Mallow, Fur Elise.
9. **Power chords and the blues** (6): power chords, movable shapes, palm muting, the 12-bar shuffle in A, John Henry, a riff of your own.
10. **Your first barre chord** (6): Fmaj7 and the small F, La Cucaracha with G7, the full F, the key of C with the band, Bm, Auld Lang Syne.
11. **Your first scale and your first solo** (6): box 1, call and response, a first improvisation, box 1 over the blues, open E minor pentatonic, rhythm then a solo.
12. **Playing with others, and a habit for life** (6): tuning by ear, rounds and duets, the capo, following a chart with the band, your own routine, a graduation concert.

## Dev: from open chords to the whole neck

Promise: any major, minor or seventh chord in several places, the five pentatonic boxes and the
major scale in every position with slides, bends and vibrato, rhythm in rock, blues, funk, reggae,
country and folk, a steady fingerstyle thumb, first-position reading, songs by ear, and a place in
a band. Every idea is tied to something to play tonight, and 37 lessons include a jam with the backing band.

1. **Barre chords that move** (6): a placement check, E-shape and A-shape barres, I-vi-IV-V and Canon in D, faster changes, Waltzing Matilda and Loch Lomond.
2. **CAGED: one chord, five places** (6): the five shapes, C and G everywhere, triads on the top strings, a whole key on three strings, a second-guitar part.
3. **Lead guitar: the expressive techniques** (6): legato and finger independence, slides, bends in tune, vibrato, unison bends and pre-bends, phrasing like a singer, all inside box 1.
4. **The pentatonic, all five boxes** (6): boxes 2 to 5, each through its lick (which uses the slides, bends and vibrato of unit 3) and a jam, one map of the neck, major pentatonic in the same shapes, same notes in two moods.
5. **The blues** (6): the 12-bar in E with the quick change, seventh chords up the neck, turnarounds, the blues scale, major and minor mixed with target notes, the minor blues.
6. **Rhythm guitar in every style** (6): rock gallop, funk sixteenths, reggae chops, bluegrass and the G run, swing with the click on 2 and 4, folk sus colours.
7. **Fingerstyle: thumb and fingers** (6): p i m a, a 3/4 arpeggio, Travis picking, a melody over the thumb, thumb-lead and fingerstyle blues, Greensleeves.
8. **Seventh chords** (6): four colours, movable shapes, the sevenths of a key, dominants that point elsewhere, the ragtime cycle, a songbook.
9. **The major scale, everywhere** (6): first position, five CAGED positions, one melody in five places, sequences and double stops, fiddle tunes, jigs.
10. **Know the neck, read the music** (6): strings 6 and 5 instantly, every note by octave shapes, reading strings 1 to 3, all six strings, sharps and second position, the Minuet in G.
11. **Improvising with intent** (6): arpeggios, chord tones on the beat, aiming for the third, motifs and space, Dorian and Mixolydian, a solo with a story.
12. **By ear, in time, in a band** (7): the key by ear, chords by ear, a melody by ear, any song in any key, locking in with the band, tone and dynamics, the gig.

## Elena: advanced harmony, technique, style and composition

Promise: improvise and compose in every mode, comp with shells, drop-2, drop-3 and extended
voicings, chord melody with clean voice leading, lines that spell the changes, advanced picking,
legato and tapping, classical technique and repertoire, sight-reading up the neck and in odd meters,
transcription, arranging and composing, and the habits of a professional.

1. **Practice and precision** (5): the audition (Dev's hand-over checks, measured), deliberate practice, time without the click, clean picking, three notes per string.
2. **The modes in practice** (6): modes as colours, Dorian and Aeolian, Mixolydian and Lydian, Phrygian and flamenco, Locrian, composing in a mode.
3. **Advanced picking** (6): economy picking, three- and five-string sweeps, string skipping, hybrid picking, speed bursts and tremolo.
4. **Legato, tapping and harmonics** (6): 3NPS legato, hammer-ons from nowhere, tapping, natural, artificial and pinch harmonics, wide bends, slide in open G.
5. **Jazz harmony and comping** (7): shells, guide tones, drop-2, drop-3, ninths and thirteenths, the minor ii-V-i, comping and bossa.
6. **Voice leading and chord melody** (6): voice leading, triads on every string set, line cliches, chord melody, reharmonisation, a jazz-ballad arrangement.
7. **Arpeggios and playing the changes** (6): seventh arpeggios, horizontal and vertical, approach notes and enclosures, arpeggios a third up, the altered dominant, outside and back.
8. **Harmonic and melodic minor in practice** (6): harmonic-minor harmony, Phrygian dominant and the solea cycle, melodic-minor harmony, minor-key showpieces, the Neapolitan and augmented sixth, Bach's Prelude BWV 999.
9. **Classical technique** (6): position and the two strokes, right-hand arpeggios, two voices (Carulli, Sor), slurs and shifts, vibrato and tone colour, tremolo.
10. **Classical repertoire** (7): Carcassi and Sor studies, Baroque dances, Romantic rubato, longer forms (Gran Vals, Coste, Sor's Folies), Bach (Jesu Joy, Gavotte), Asturias, a summit piece with a three-month plan.
11. **Sight-reading and rhythm** (6): fifth and seventh position, a daily sight-reading routine, reading through the neck, fives and sevens, hemiola and three against two.
12. **Composition and arranging** (7): writing a progression and a melody, arranging for solo guitar, ragtime on guitar, counterpoint, a fugue exposition, composing in DADGAD.
13. **Transcription and performance** (6): melodies, harmony and a solo by ear, memorising, preparing to perform, a 15-minute recital.

## How the courses hand over

- **Mia to Dev.** Mia's graduation concert ends with the hand-over check: one-minute changes G to C
  and Am to F at 30 or more clean changes, the folk pattern on G, C and D at 90 bpm, A minor
  pentatonic box 1 up and down at 80 bpm, and the F barre ringing on all six strings. Dev's first
  lesson repeats exactly those checks, one practice step each, as his baseline
  and links each weak one back to the Mia lesson that fixes it, so a self-taught player can start
  with Dev directly.
- **Dev to Elena.** Dev's gig ends with the hand-over check: any major, minor or seventh chord in two
  places, all five pentatonic boxes, C major in five positions, and eight bars read at sight.
  Elena's audition measures the same things in numbers (tempo, clean notes out of ten, changes per
  minute), adds a Travis pattern, and turns them into goals. Its sight-reading is bars 9 to 16 of
  Reading: Second Position, which Dev's course leaves unplayed, so it really is at sight.
- **The Theory Path runs alongside.** Mia links almost only to the beginner stage, Dev mostly to the
  intermediate stage, Elena mostly to the expert stage; a teacher lesson recommends the theory
  lessons it builds on, but never repeats them. Repertoire rises the same way: Mia uses levels 1 to
  5, Dev 2 to 7, Elena up to 10, and pieces return at a higher level (Greensleeves strummed with Mia,
  fingerstyle with Dev; Down by the Riverside strummed, then Travis-picked; Danny Boy with chords,
  then as chord melody).

## Writing a lesson from an entry

- One entry is one teacher lesson. In the lesson engine its slug (the part after the second slash,
  unique across all three courses) is `Lesson.id`, and `skill` is `teacher:<mia|dev|elena>:<slug>`.
- `explain` gives the substance of the teacher's words, not the final wording: write it in the
  teacher's voice (Mia patient and concrete, Dev a bandmate, Elena rigorous with dry humour) and
  keep every fact. `show` is the figure or tab to build; `practice` steps become exercises or
  hand-offs to the app's tools; `music` and `theory` become links.
- `minutes` is the whole lesson including practice with the tools. The engine limits one lesson to
  2 to 5 minutes, so build the interactive part as an engine lesson and the rest as tool tasks, or
  split a long entry into two or three engine lessons.
- A `Lesson` step names an exercise type the lesson engine has (`choice`, `chord-build`,
  `fretboard-find`, `staff-read`, `tap-rhythm` ...) or one of its generators (`degree-in-key`,
  `chord-tones`, `key-signature`). `fretboard-name` asks for a note, interval or degree at a
  position, so naming a chord shape or a tab number is a `choice`.
- Each practice step starts with where it happens: `Lesson` (an in-lesson exercise), `Mic`
  (play-note, play-chord or play-phrase, always with its no-microphone alternative), `Player` (tab
  player: wait mode, loop, tempo), `Metronome`, `Tuner`, `Chords` (change trainer, one-minute
  changes), `Jam` (backing band with a named `jam track <id> in <key>` from the progressions
  catalog), `Rhythm`, `Ear`, `Fretboard`, `Arcade`, `Scales`, `Technique` (exercise with tempo
  ladder), `Practice Plan`, `Live Fretboard`, `Scan`, `Record`, `Create`, `With others` or
  `Away from the guitar`.
- Shapes are written `Chord (x32010)` low string first, positions `string N fret M (X)` in standard
  tuning; both are checked by the test. Every tune named is public domain or traditional, or an
  original study; modern songs are never named or transcribed in these courses.

## What the test checks (`npx vitest run src/content/plan/teachers.test.ts`)

Exact JSON shape; 55 to 90 lessons per course in units of 4 to 8; unique, prefixed unit ids and
unique lesson ids and slugs; kinds, minutes, ASCII text, no placeholders; at least two practice
steps, each naming its tool; every Mic step names its exercise type and an alternative; every Jam
step names a real jam track in a key the catalog offers; every music id exists in the repertoire and
every theory id in the Theory Path; songs and milestones have real music; theory links stay mostly
within each course's stage; music levels rise from Mia to Dev to Elena; Player tempos never exceed
a piece's target. Teaching order: each of Mia's chord shapes first appears in the lesson that teaches
it, in the engine's easiest-first order; each term Mia uses is defined in the lesson that first uses it,
and she never says vibrato or dominant; Dev teaches slides, bends and vibrato before the box licks that
need them; the hand-over checks match word for word; no lesson asks anyone to play into pain. Against the engines: every `string N fret M (X)` and `open string N (X)`, every
`Chord (shape)` (built with `voicingProblem`, right bass, every note a chord tone), and about 80
claims tied to the lesson text: tunings and retuning, the capo table, the fifth-fret rule, the five
pentatonic boxes and the major-pentatonic trick, CAGED positions, triad top notes, blues forms and
turnarounds, seventh-chord spellings and the sevenths of a key, secondary dominants, mode spellings
and colour notes, harmonic- and melodic-minor harmony, the altered scale, guide tones, drop-2 voice
leading, arpeggio substitution, tritone substitution, line cliches, staff positions, harmonics and
meter groupings, the reggae count, the D5 shape and the E-to-Am shape move.

`plan.test.ts` checks the references between the three plan files: unique ids in each file; every
repertoire, Theory Path and teacher id mentioned in any of the three files exists; every id on the
three pages exists unless the page lists it as deleted; the id-change lists on the pages are true
(added ids exist, deleted ids appear nowhere); Theory Path prerequisites exist and come earlier;
teacher lessons link only to real music, theory lessons and jam tracks in offered keys; a lesson that
names a repertoire entry by its full title links it, and a lesson names every piece it links; and this
page's table and unit lists match teachers.json.

## What the expert review changed

- **Mia.** Chord order fixed: E and Am now come in the first chord unit as one shape (a new lesson),
  so C to Am and Dm are applications, not first meetings, and lesson 33 no longer brings two new
  chords. Wade in the Water no longer smuggles in the folk pattern right after B7; the song comes back
  in the folk-pattern lesson. G7 moved from the boom-chick lesson to La Cucaracha, the song that needs
  it. Lesson 5 no longer asks for notes on strings 2 and 1 nine lessons before they are taught. Linked
  but unplayed music now has a step (Eine kleine Nachtmusik, First Notes on String 3), Korobeiniki is
  strummed rather than added as a second melody, Sakura has no vibrato (Mia never teaches it), and the
  terms bar, bpm, tab, accent, tempo, scale, roman numerals, first position, arpeggio, riff, lick,
  root, octave, fifth, relative major and progression are defined where first used. Fixed facts: D5
  is not the E5 shape moved over (its top note is a fret higher), and "dominant" is gone from John Henry.
- **Dev.** Lead techniques now come before the pentatonic boxes, whose licks use slides, bends and
  vibrato; each new box gets a jam. The reggae count was backwards (chops on every "and" are on 2 and 4
  when counted twice as fast, not half as fast). The stretch no longer says "stop at the first fret that
  hurts". The welcome lesson checks the folk pattern it promised; the duplicate Nobody Knows step is gone;
  the gallop jam runs at the study's tempo; the four-sevenths goal no longer claims open dominant and
  half-diminished shapes it does not show; Red Haired Boy and O Come, All Ye Faithful are played, not
  just linked; naming a CAGED shape is a `choice` exercise.
- **Elena.** The audition measures Dev's hand-over checks on unseen reading. Pieces linked without a step
  now have one (Hungarian Dance No. 5, Aguado, the Bourree as a counterpoint model, Danny Boy as an
  arranging model) or were unlinked (Drunken Sailor, Ragtime Blues). Shells: the fifth matters when it
  is altered. Tremolo thirty-seconds at half tempo. The unverifiable "harmonics" in Gran Vals is gone.
  The sight-reading routine no longer depends on a generator that does not exist.

## Id changes after the expert review

- **Added:** `mia/mia-first-chords/e-and-am` (E and Am: one shape, two chords).
- **Deleted:** none. No id was renamed or reused. Changed in place: `mia/mia-minor-chords/am-and-c` and
  `mia/mia-minor-chords/dm-and-e` (they now apply Am and E), `mia/mia-strumming-patterns/boom-chick`
  (G7 moved out) and `mia/mia-first-barre/la-cucaracha` (G7 moved in). Dev's units `dev-lead-techniques`
  and `dev-pentatonic` swapped places; their ids are unchanged.
