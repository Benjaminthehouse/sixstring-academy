# Sixstring Academy: what is in it, its limits, and what is left

## What the app does

A guitar school that runs in the browser, on a phone or a computer, with no server of its own.

| Area | What a learner gets |
|---|---|
| **Today** | A daily plan for the goal they chose, streak, XP, and where they left off. |
| **Theory Path** | 35 units of bite-sized lessons, from the six strings to modulation and the physics of tuning. Works with the sound off on a bus. |
| **Teachers** | Three courses with their own voices: Mia (beginner, 10 units), Dev (intermediate, 13 units) and Prof. Elena Varga (expert, 16 units). Lessons send the learner to the right tool, ready to go, and back ("Back to your lesson"). |
| **Songs and Player** | About 130 traditional songs and original studies. Tab and notation, wait mode (it waits until you play the right note or chord), loop, speed trainer, hide-the-chart, capo and transpose, a backing band. |
| **Scales, chords, progressions** | Every scale and mode in every key and shape; the chord library with voicings and a chord-change trainer; progressions by style with a jam band. |
| **Games and drills** | Scale Arcade (seven games), the fretboard trainer, ear training, rhythm and technique exercises with tempo ladders. |
| **Tools** | Tuner (alternate tunings), metronome, recorder, the Live Fretboard camera, and Scan & Import (photos, PDFs and tab files of your own sheets). |
| **Me** | Progress, achievements, settings honoured everywhere, backups, and optional accounts that keep progress the same on every device. |

It installs on a phone's home screen and works offline. Inside a Claude artifact it runs too, without the
microphone and camera.

## How it was checked

- 9,888 unit tests, including cross-checks of every song, lesson and exercise against the app's own
  music-theory and guitar engines (every note, chord, interval and fingering is computed, not typed).
- About 50 browser checks (Playwright with Chromium), each screen at phone and desktop sizes, both
  themes and 200 percent text.
- Every feature was built by one agent and then reviewed by another, who used it, tried to break it
  and fixed what they found.

## Honest limits

- **The Live Fretboard camera** was tested only on rendered, synthetic video, never with a real
  webcam, guitar or hands. Expect it to need tuning on a real guitar: good light, the neck across the
  picture and the nut in view help; the "Mark the neck" and "Fix the fret numbers" tools are there
  for when it gets the frets wrong. On a slow phone with a swaying neck it shows outlines rather than
  solid dots.
- **Microphone checks** (tuner, wait mode, play-it steps) were tested with recorded and synthetic
  sound through Chromium's fake microphone, not a real guitar in a real room.
- **Songs**: only public-domain or traditional melodies, or studies written for the app. About 70
  well-known traditional tunes and classical pieces are left out because their notes could not be
  confirmed without a printed source; nothing was guessed. Recovered melodies are labelled "as
  commonly sung or played today". A learner can bring in their own printed pieces with Scan & Import.
- **Accounts** were tested against a stand-in for Supabase, not the real service (this machine
  could not reach it). Follow `docs/accounts-setup.md` and try two devices once it is set up.
- **Sound** is synthesised in the browser: a good practice guitar, not a recording.
- Tested in Chromium only. Safari and Firefox should work but were not tried here.

## To do (known, not yet fixed)

Small things the reviewers found that were left for later:

- Player: in "notes only" view an empty band remains where the tab was; on 3/8 songs the header
  and the score show the tempo with different note values; held sideways on a phone the staff can
  sit below the fold; in wait mode the microphone can hear the app's own backing through the
  speakers.
- The compact upright fretboard exists but no screen uses it yet (the fretboard trainer and the
  arcade's sprint would benefit on phones).
- Learners' own modal songs (imported) are listed as "A minor" instead of "A Dorian".
- The jam band does not yet change style without restarting (the audio engine supports it now), and
  the rumba style plays no chords in the jam.
- Teacher tasks that open the Player do not yet choose the learner's part through the address.
- Ear training: nothing links to the new "train this progression by ear" rounds yet.
- Browser Back to a finished lesson starts it again; the "ahead of where you are" note exists only
  on the Theory Path.
- A few focus rings (chords, arcade) are invisible to keyboard users.
- Recorder takes are not listed in Me > Your data, and recordings earn no XP.
- Performance: the first screen loads the whole UI kit; the Theory Path loads every unit at once.
- Synced lists have no deletion markers: a journal entry deleted on one device while the other
  device changed the same list can come back.
