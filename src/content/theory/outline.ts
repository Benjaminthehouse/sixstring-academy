/**
 * GENERATED from src/content/plan/theory-path.json (and the unit themes in THEORY-PATH.md) by
 * outline.test.ts. Do not edit by hand; regenerate with
 *   WRITE_OUTLINE=1 npx vitest run src/content/theory/outline.test.ts
 *
 * Every stage, unit and lesson of the reviewed syllabus, small enough to draw the whole path at
 * once while the written units load.
 */
import type { Outline } from './types';

/** The Theory Path as the syllabus plans it. */
export const OUTLINE: Outline = {
  "id": "theory-path",
  "title": "The Theory Path",
  "stages": [
    {
      "id": "beginner",
      "title": "Beginner",
      "subtitle": "From first note to first songs",
      "units": [
        {
          "id": "sound-and-pitch",
          "title": "Sound and pitch",
          "theme": "basics",
          "summary": "What a musical note is, why some notes sound high and others low, and what a fret does to a string.",
          "why": "Knowing why a string sounds the way it does makes every later idea, from tuning to chords, make sense.",
          "lessons": [
            {
              "id": "a-sound-is-a-vibration",
              "title": "A sound is a vibration",
              "minutes": 2,
              "requires": [],
              "play": true
            },
            {
              "id": "pitch-high-and-low",
              "title": "Pitch: high and low",
              "minutes": 3,
              "requires": [
                "a-sound-is-a-vibration"
              ],
              "listen": true
            },
            {
              "id": "loud-is-not-high",
              "title": "Loud is not high",
              "minutes": 2,
              "requires": [
                "pitch-high-and-low"
              ],
              "listen": true
            },
            {
              "id": "frets-shorten-the-string",
              "title": "Frets make the string shorter",
              "minutes": 4,
              "requires": [
                "loud-is-not-high",
                "pitch-high-and-low"
              ],
              "play": true
            },
            {
              "id": "the-octave",
              "title": "The octave: the same note, higher",
              "minutes": 3,
              "requires": [
                "frets-shorten-the-string"
              ],
              "listen": true
            },
            {
              "id": "tone-colour",
              "title": "Tone colour",
              "minutes": 3,
              "requires": [
                "the-octave"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "the-six-strings",
          "title": "The six strings",
          "theme": "basics",
          "summary": "Number, name and tune the six open strings, and learn what \"high\", \"low\" and \"up the neck\" mean.",
          "why": "Every chord chart, tab and lesson tells you where to play by string name or number.",
          "lessons": [
            {
              "id": "string-numbers",
              "title": "String numbers",
              "minutes": 2,
              "requires": [
                "pitch-high-and-low"
              ]
            },
            {
              "id": "string-names",
              "title": "E A D G B E",
              "minutes": 3,
              "requires": [
                "string-numbers"
              ],
              "play": true
            },
            {
              "id": "using-a-tuner",
              "title": "Using a tuner",
              "minutes": 3,
              "requires": [
                "string-names"
              ],
              "play": true
            },
            {
              "id": "the-fifth-fret-rule",
              "title": "The fifth-fret rule",
              "minutes": 3,
              "requires": [
                "using-a-tuner"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "up-and-down-the-neck",
              "title": "High, low and up the neck",
              "minutes": 2,
              "requires": [
                "the-fifth-fret-rule"
              ]
            }
          ]
        },
        {
          "id": "the-musical-alphabet",
          "title": "The musical alphabet",
          "theme": "notes",
          "summary": "The seven letter names, half and whole steps, sharps, flats and the twelve notes.",
          "why": "With twelve note names you can find, name and talk about every note on the guitar.",
          "lessons": [
            {
              "id": "seven-letters",
              "title": "Seven letters, round and round",
              "minutes": 2,
              "requires": [
                "the-octave"
              ]
            },
            {
              "id": "half-and-whole-steps",
              "title": "Half steps and whole steps",
              "minutes": 3,
              "requires": [
                "seven-letters",
                "frets-shorten-the-string"
              ],
              "listen": true
            },
            {
              "id": "e-f-and-b-c",
              "title": "The two natural half steps",
              "minutes": 3,
              "requires": [
                "half-and-whole-steps"
              ],
              "listen": true
            },
            {
              "id": "sharps",
              "title": "Sharps raise by a half step",
              "minutes": 3,
              "requires": [
                "e-f-and-b-c"
              ]
            },
            {
              "id": "flats",
              "title": "Flats lower by a half step",
              "minutes": 3,
              "requires": [
                "sharps"
              ]
            },
            {
              "id": "one-sound-two-names",
              "title": "One sound, two names",
              "minutes": 3,
              "requires": [
                "flats"
              ]
            },
            {
              "id": "the-twelve-notes",
              "title": "The twelve notes",
              "minutes": 3,
              "requires": [
                "one-sound-two-names"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "pulse-and-beat",
          "title": "Pulse and beat",
          "theme": "rhythm",
          "summary": "The steady beat, tempo, bars of 4/4, the first note values and rests, and down-up strumming.",
          "why": "Playing in time is what makes a few simple chords sound like real music.",
          "lessons": [
            {
              "id": "the-beat",
              "title": "The beat",
              "minutes": 2,
              "requires": [
                "a-sound-is-a-vibration"
              ],
              "listen": true
            },
            {
              "id": "tempo-and-bpm",
              "title": "Tempo and BPM",
              "minutes": 2,
              "requires": [
                "the-beat"
              ],
              "listen": true
            },
            {
              "id": "bars-and-four-four",
              "title": "Bars and counting to four",
              "minutes": 3,
              "requires": [
                "tempo-and-bpm"
              ],
              "listen": true
            },
            {
              "id": "quarter-half-whole",
              "title": "Quarter, half and whole notes",
              "minutes": 3,
              "requires": [
                "bars-and-four-four"
              ],
              "listen": true
            },
            {
              "id": "eighth-notes",
              "title": "Eighth notes and the \"&\"",
              "minutes": 3,
              "requires": [
                "quarter-half-whole"
              ],
              "listen": true
            },
            {
              "id": "rests",
              "title": "Rests: counted silence",
              "minutes": 3,
              "requires": [
                "eighth-notes"
              ],
              "listen": true
            },
            {
              "id": "down-up-strumming",
              "title": "Down on the beat, up on the \"&\"",
              "minutes": 3,
              "requires": [
                "rests"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "reading-tab",
          "title": "Reading tab",
          "theme": "reading",
          "summary": "Read guitar tablature: strings, frets, chords, technique symbols and rhythm.",
          "why": "Tab is the quickest way to read guitar music, and most guitar parts you find are written in it.",
          "lessons": [
            {
              "id": "six-lines-six-strings",
              "title": "Six lines, six strings",
              "minutes": 2,
              "requires": [
                "string-names"
              ]
            },
            {
              "id": "numbers-are-frets",
              "title": "Numbers are frets",
              "minutes": 3,
              "requires": [
                "six-lines-six-strings"
              ],
              "play": true
            },
            {
              "id": "stacked-numbers",
              "title": "Numbers in a column",
              "minutes": 3,
              "requires": [
                "numbers-are-frets"
              ]
            },
            {
              "id": "technique-symbols",
              "title": "Slides, hammers and bends",
              "minutes": 4,
              "requires": [
                "stacked-numbers"
              ],
              "play": true
            },
            {
              "id": "tab-and-rhythm",
              "title": "What tab does not tell you",
              "minutes": 3,
              "requires": [
                "technique-symbols",
                "quarter-half-whole"
              ],
              "listen": true
            },
            {
              "id": "first-tab-tune",
              "title": "Your first tab tune",
              "minutes": 4,
              "requires": [
                "tab-and-rhythm"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "notes-on-the-neck",
          "title": "Notes on the neck",
          "theme": "fretboard",
          "summary": "Name the notes on strings 6 and 5, use the dots and fret 12 as landmarks, and find octaves with shapes.",
          "why": "Knowing where the notes are lets you find any chord, scale or riff instead of memorising positions blindly.",
          "lessons": [
            {
              "id": "string-6-naturals",
              "title": "The natural notes on string 6",
              "minutes": 3,
              "requires": [
                "sharps",
                "flats"
              ]
            },
            {
              "id": "string-5-naturals",
              "title": "The natural notes on string 5",
              "minutes": 3,
              "requires": [
                "string-6-naturals"
              ],
              "play": true
            },
            {
              "id": "the-neck-repeats",
              "title": "The neck repeats at fret 12",
              "minutes": 2,
              "requires": [
                "string-5-naturals"
              ]
            },
            {
              "id": "dots-as-landmarks",
              "title": "The dots as landmarks",
              "minutes": 2,
              "requires": [
                "the-neck-repeats"
              ]
            },
            {
              "id": "same-note-many-places",
              "title": "The same note in several places",
              "minutes": 3,
              "requires": [
                "dots-as-landmarks",
                "the-fifth-fret-rule"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "octave-shapes-6-and-5",
              "title": "Octave shapes from strings 6 and 5",
              "minutes": 3,
              "requires": [
                "same-note-many-places",
                "the-octave"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "octave-shapes-4-and-3",
              "title": "Octave shapes across the B string",
              "minutes": 3,
              "requires": [
                "octave-shapes-6-and-5"
              ]
            }
          ]
        },
        {
          "id": "first-scale",
          "title": "Your first scale",
          "theme": "scales",
          "summary": "What a scale is, and the A minor pentatonic scale in the shape guitarists use most.",
          "why": "With one five-note shape you can already play melodies and solos that sound like real guitar music.",
          "lessons": [
            {
              "id": "what-a-scale-is",
              "title": "What a scale is",
              "minutes": 2,
              "requires": [
                "string-5-naturals",
                "numbers-are-frets"
              ],
              "listen": true
            },
            {
              "id": "a-minor-pentatonic",
              "title": "Five notes: A C D E G",
              "minutes": 3,
              "requires": [
                "what-a-scale-is"
              ]
            },
            {
              "id": "the-box-at-fret-5",
              "title": "The box at fret 5",
              "minutes": 4,
              "requires": [
                "a-minor-pentatonic"
              ],
              "play": true
            },
            {
              "id": "roots-in-the-box",
              "title": "Where the roots are",
              "minutes": 3,
              "requires": [
                "the-box-at-fret-5",
                "octave-shapes-6-and-5"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "moving-the-box",
              "title": "Move the box, change the key",
              "minutes": 3,
              "requires": [
                "roots-in-the-box"
              ]
            },
            {
              "id": "making-music-with-five-notes",
              "title": "Making music with five notes",
              "minutes": 3,
              "requires": [
                "moving-the-box"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "major-and-minor-chords",
          "title": "Why a chord is major or minor",
          "theme": "chords",
          "summary": "What a chord is, how to read a chord box, and the one note that makes a chord major or minor.",
          "why": "Once you see the third, every open chord you learn makes sense, and you can fix a wrong chord by ear.",
          "lessons": [
            {
              "id": "what-a-chord-is",
              "title": "What a chord is",
              "minutes": 3,
              "requires": [
                "stacked-numbers",
                "string-6-naturals"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "reading-a-chord-box",
              "title": "Reading a chord box",
              "minutes": 3,
              "requires": [
                "what-a-chord-is"
              ]
            },
            {
              "id": "root-third-fifth",
              "title": "Root, third and fifth",
              "minutes": 3,
              "requires": [
                "reading-a-chord-box",
                "seven-letters"
              ]
            },
            {
              "id": "major-and-minor-thirds",
              "title": "Four frets or three",
              "minutes": 3,
              "requires": [
                "root-third-fifth",
                "half-and-whole-steps"
              ],
              "listen": true
            },
            {
              "id": "e-and-e-minor",
              "title": "E and Em: one finger apart",
              "minutes": 3,
              "requires": [
                "major-and-minor-thirds"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "a-am-d-dm",
              "title": "A, Am, D and Dm",
              "minutes": 4,
              "requires": [
                "e-and-e-minor"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "hearing-major-and-minor",
              "title": "Hearing major and minor",
              "minutes": 3,
              "requires": [
                "a-am-d-dm"
              ],
              "listen": true
            },
            {
              "id": "power-chords",
              "title": "Power chords: neither major nor minor",
              "minutes": 3,
              "requires": [
                "hearing-major-and-minor"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "strumming-rhythm",
          "title": "Rhythm for strumming",
          "theme": "rhythm",
          "summary": "Dotted notes, ties, 3/4 time and time signatures, pickup notes, sixteenth notes, chord changes in time, accents and muted strums.",
          "why": "These are the rhythms behind nearly every strummed song you will want to play.",
          "lessons": [
            {
              "id": "dotted-notes",
              "title": "Dotted notes",
              "minutes": 3,
              "requires": [
                "down-up-strumming"
              ],
              "listen": true
            },
            {
              "id": "ties",
              "title": "Ties",
              "minutes": 2,
              "requires": [
                "dotted-notes"
              ],
              "listen": true
            },
            {
              "id": "three-four-time",
              "title": "Three beats in a bar",
              "minutes": 3,
              "requires": [
                "ties",
                "a-am-d-dm"
              ],
              "listen": true
            },
            {
              "id": "pickup-notes",
              "title": "Pickup notes: starting before beat 1",
              "minutes": 3,
              "requires": [
                "three-four-time",
                "first-tab-tune"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "sixteenth-notes",
              "title": "Sixteenth notes",
              "minutes": 3,
              "requires": [
                "pickup-notes"
              ],
              "listen": true
            },
            {
              "id": "changing-chords-in-time",
              "title": "Changing chords in time",
              "minutes": 3,
              "requires": [
                "sixteenth-notes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "accents-and-muted-strums",
              "title": "Accents and muted strums",
              "minutes": 3,
              "requires": [
                "changing-chords-in-time"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "intervals-1",
          "title": "Intervals: measuring distance",
          "theme": "intervals",
          "summary": "Name the distance between two notes, from the half step to the octave, and hear the common ones.",
          "why": "Intervals are the building blocks of every scale, chord and melody, and the neck is a map of them.",
          "lessons": [
            {
              "id": "what-an-interval-is",
              "title": "What an interval is",
              "minutes": 2,
              "requires": [
                "root-third-fifth"
              ],
              "listen": true
            },
            {
              "id": "seconds-and-thirds",
              "title": "Seconds and thirds",
              "minutes": 3,
              "requires": [
                "what-an-interval-is",
                "major-and-minor-thirds"
              ]
            },
            {
              "id": "fourths-fifths-octaves",
              "title": "Fourths, fifths and octaves",
              "minutes": 3,
              "requires": [
                "seconds-and-thirds",
                "the-fifth-fret-rule"
              ]
            },
            {
              "id": "sixths-and-sevenths",
              "title": "Sixths and sevenths",
              "minutes": 3,
              "requires": [
                "fourths-fifths-octaves"
              ],
              "listen": true
            },
            {
              "id": "the-tritone",
              "title": "The tritone",
              "minutes": 2,
              "requires": [
                "sixths-and-sevenths"
              ],
              "listen": true
            },
            {
              "id": "intervals-by-ear",
              "title": "Hearing intervals with tunes you know",
              "minutes": 4,
              "requires": [
                "the-tritone"
              ],
              "listen": true
            },
            {
              "id": "intervals-in-chords",
              "title": "Intervals inside chords",
              "minutes": 3,
              "requires": [
                "intervals-by-ear",
                "power-chords"
              ]
            }
          ]
        },
        {
          "id": "major-scale",
          "title": "The major scale",
          "theme": "scales",
          "summary": "The step pattern behind the major scale, scale degrees, spelling major scales, and a movable one-octave shape.",
          "why": "The major scale is the measuring stick for keys, chords, modes and almost everything else in theory.",
          "lessons": [
            {
              "id": "the-step-pattern",
              "title": "Whole, whole, half",
              "minutes": 3,
              "requires": [
                "seconds-and-thirds",
                "what-a-scale-is"
              ],
              "play": true
            },
            {
              "id": "scale-degrees",
              "title": "Scale degrees",
              "minutes": 3,
              "requires": [
                "the-step-pattern"
              ]
            },
            {
              "id": "g-major",
              "title": "G major and its F#",
              "minutes": 3,
              "requires": [
                "scale-degrees"
              ],
              "play": true
            },
            {
              "id": "building-major-scales",
              "title": "Building any major scale",
              "minutes": 4,
              "requires": [
                "g-major"
              ]
            },
            {
              "id": "one-octave-shape",
              "title": "The major scale in one position",
              "minutes": 4,
              "requires": [
                "building-major-scales",
                "string-6-naturals"
              ],
              "play": true
            },
            {
              "id": "the-major-sound",
              "title": "How the major scale sounds",
              "minutes": 3,
              "requires": [
                "one-octave-shape"
              ],
              "listen": true
            },
            {
              "id": "major-pentatonic",
              "title": "Major pentatonic: the major scale minus two",
              "minutes": 3,
              "requires": [
                "the-major-sound",
                "a-minor-pentatonic"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "chords-in-a-key",
          "title": "Chords that belong together",
          "theme": "harmony",
          "summary": "What a key is, the seven chords of a major key, roman numerals, and the progressions built from them.",
          "why": "This is why G, C, D and Em sound good together, and how you can work out the chords of any song in a major key.",
          "lessons": [
            {
              "id": "what-a-key-is",
              "title": "What a key is",
              "minutes": 3,
              "requires": [
                "building-major-scales",
                "hearing-major-and-minor"
              ],
              "listen": true
            },
            {
              "id": "triads-from-the-scale",
              "title": "Stacking thirds in the scale",
              "minutes": 4,
              "requires": [
                "what-a-key-is"
              ]
            },
            {
              "id": "the-major-key-pattern",
              "title": "Major, minor, minor, major, major, minor, diminished",
              "minutes": 3,
              "requires": [
                "triads-from-the-scale"
              ]
            },
            {
              "id": "roman-numerals",
              "title": "Roman numerals",
              "minutes": 3,
              "requires": [
                "the-major-key-pattern"
              ]
            },
            {
              "id": "one-four-five",
              "title": "I, IV and V",
              "minutes": 4,
              "requires": [
                "roman-numerals"
              ],
              "play": true
            },
            {
              "id": "the-six-chord",
              "title": "Adding vi",
              "minutes": 3,
              "requires": [
                "one-four-five"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "reading-the-staff",
          "title": "Reading music: the staff",
          "theme": "reading",
          "summary": "The staff, the treble clef, how guitar music is written an octave up, the open strings on the staff, and first reading on strings 1 to 3.",
          "why": "Standard notation opens up method books, classical guitar and any music written for other instruments.",
          "lessons": [
            {
              "id": "the-staff",
              "title": "Five lines, four spaces",
              "minutes": 2,
              "requires": [
                "quarter-half-whole",
                "seven-letters"
              ],
              "listen": true
            },
            {
              "id": "the-treble-clef",
              "title": "The treble clef",
              "minutes": 3,
              "requires": [
                "the-staff"
              ]
            },
            {
              "id": "an-octave-lower",
              "title": "Guitar sounds an octave lower",
              "minutes": 3,
              "requires": [
                "the-treble-clef"
              ]
            },
            {
              "id": "open-strings-on-the-staff",
              "title": "The open strings on the staff",
              "minutes": 3,
              "requires": [
                "an-octave-lower"
              ],
              "play": true
            },
            {
              "id": "ledger-lines",
              "title": "Ledger lines and the low strings",
              "minutes": 3,
              "requires": [
                "open-strings-on-the-staff"
              ]
            },
            {
              "id": "reading-strings-1-to-3",
              "title": "Reading on strings 1 to 3",
              "minutes": 4,
              "requires": [
                "ledger-lines"
              ],
              "play": true
            }
          ]
        }
      ]
    },
    {
      "id": "intermediate",
      "title": "Intermediate",
      "subtitle": "The whole neck and how harmony works",
      "units": [
        {
          "id": "intervals-2",
          "title": "Intervals: quality, spelling and shapes",
          "theme": "intervals",
          "summary": "Full interval names, spelling by letters, inversions, interval shapes on the neck, compound intervals and consonance.",
          "why": "Seeing intervals as shapes lets you build any chord or melody anywhere on the neck without memorising positions.",
          "lessons": [
            {
              "id": "interval-quality",
              "title": "Perfect, major, minor, augmented, diminished",
              "minutes": 4,
              "requires": [
                "intervals-in-chords",
                "building-major-scales"
              ]
            },
            {
              "id": "spelling-counts",
              "title": "The spelling decides the name",
              "minutes": 3,
              "requires": [
                "interval-quality"
              ]
            },
            {
              "id": "interval-inversions",
              "title": "Turning intervals upside down",
              "minutes": 3,
              "requires": [
                "spelling-counts"
              ]
            },
            {
              "id": "adjacent-string-shapes",
              "title": "Interval shapes on neighbouring strings",
              "minutes": 4,
              "requires": [
                "interval-inversions",
                "fourths-fifths-octaves"
              ]
            },
            {
              "id": "skip-a-string-shapes",
              "title": "Sixths, sevenths and octaves across a string",
              "minutes": 3,
              "requires": [
                "adjacent-string-shapes"
              ]
            },
            {
              "id": "the-b-string-shift",
              "title": "The B-string shift",
              "minutes": 3,
              "requires": [
                "skip-a-string-shapes",
                "octave-shapes-4-and-3"
              ]
            },
            {
              "id": "compound-intervals",
              "title": "Ninths, elevenths and thirteenths",
              "minutes": 3,
              "requires": [
                "the-b-string-shift"
              ]
            },
            {
              "id": "consonance-and-dissonance",
              "title": "Stable and tense",
              "minutes": 3,
              "requires": [
                "compound-intervals"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "circle-of-fifths",
          "title": "Key signatures and the circle of fifths",
          "theme": "keys",
          "summary": "How key signatures work, the order of sharps and flats, naming keys from signatures, and the circle of fifths.",
          "why": "The circle tells you at a glance which keys and chords are close relatives, which is how songs and modulations are built.",
          "lessons": [
            {
              "id": "key-signatures",
              "title": "What a key signature is",
              "minutes": 3,
              "requires": [
                "the-treble-clef",
                "what-a-key-is"
              ]
            },
            {
              "id": "sharp-keys",
              "title": "The sharp keys",
              "minutes": 3,
              "requires": [
                "key-signatures"
              ]
            },
            {
              "id": "naming-sharp-keys",
              "title": "Naming a sharp key",
              "minutes": 3,
              "requires": [
                "sharp-keys"
              ]
            },
            {
              "id": "flat-keys",
              "title": "The flat keys",
              "minutes": 3,
              "requires": [
                "naming-sharp-keys"
              ]
            },
            {
              "id": "naming-flat-keys",
              "title": "Naming a flat key",
              "minutes": 2,
              "requires": [
                "flat-keys"
              ]
            },
            {
              "id": "the-circle",
              "title": "The circle of fifths",
              "minutes": 4,
              "requires": [
                "naming-flat-keys"
              ]
            },
            {
              "id": "neighbour-keys",
              "title": "Neighbours on the circle",
              "minutes": 3,
              "requires": [
                "the-circle",
                "one-four-five"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "minor-scales",
          "title": "The minor scales",
          "theme": "scales",
          "summary": "Natural, harmonic and melodic minor, relative and parallel keys, minor key signatures, and minor on the neck.",
          "why": "Minor keys are half of all music, and knowing the three minors explains why minor songs so often use a major V chord.",
          "lessons": [
            {
              "id": "natural-minor",
              "title": "The natural minor scale",
              "minutes": 3,
              "requires": [
                "scale-degrees",
                "a-minor-pentatonic"
              ]
            },
            {
              "id": "relative-minor",
              "title": "The relative minor",
              "minutes": 3,
              "requires": [
                "natural-minor",
                "key-signatures"
              ]
            },
            {
              "id": "parallel-minor",
              "title": "The parallel minor",
              "minutes": 3,
              "requires": [
                "relative-minor"
              ],
              "listen": true
            },
            {
              "id": "minor-key-signatures",
              "title": "Minor key signatures",
              "minutes": 3,
              "requires": [
                "parallel-minor"
              ],
              "listen": true
            },
            {
              "id": "harmonic-minor",
              "title": "Harmonic minor",
              "minutes": 4,
              "requires": [
                "minor-key-signatures"
              ],
              "listen": true
            },
            {
              "id": "melodic-minor",
              "title": "Melodic minor",
              "minutes": 3,
              "requires": [
                "harmonic-minor"
              ],
              "listen": true
            },
            {
              "id": "minor-in-fifth-position",
              "title": "A minor in fifth position",
              "minutes": 4,
              "requires": [
                "melodic-minor",
                "the-box-at-fret-5"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "triplets-swing-syncopation",
          "title": "Rhythm: triplets, swing and syncopation",
          "theme": "rhythm",
          "summary": "Triplets, swing and shuffle feel, syncopation and anticipations, sixteenth-note grooves, and tempo words.",
          "why": "These rhythms are what make blues, funk, rock and pop guitar parts feel alive instead of stiff.",
          "lessons": [
            {
              "id": "triplets",
              "title": "Triplets",
              "minutes": 3,
              "requires": [
                "sixteenth-notes"
              ],
              "listen": true
            },
            {
              "id": "swing",
              "title": "Swing feel",
              "minutes": 3,
              "requires": [
                "triplets"
              ],
              "listen": true
            },
            {
              "id": "the-shuffle",
              "title": "The shuffle",
              "minutes": 3,
              "requires": [
                "swing",
                "power-chords"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "syncopation",
              "title": "Syncopation",
              "minutes": 3,
              "requires": [
                "the-shuffle"
              ],
              "listen": true
            },
            {
              "id": "sixteenth-grooves",
              "title": "Sixteenth-note grooves",
              "minutes": 4,
              "requires": [
                "syncopation"
              ],
              "listen": true
            },
            {
              "id": "tempo-words",
              "title": "Tempo words",
              "minutes": 2,
              "requires": [
                "sixteenth-grooves"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "triads-and-inversions",
          "title": "Triads and inversions",
          "theme": "chords",
          "summary": "The four kinds of triad, inversions and slash names, and compact triad shapes across the neck.",
          "why": "Small triad shapes let you play any chord high on the neck, which is how good rhythm guitarists fit around a band.",
          "lessons": [
            {
              "id": "four-triads",
              "title": "Major, minor, diminished, augmented",
              "minutes": 3,
              "requires": [
                "interval-quality",
                "the-major-key-pattern"
              ],
              "listen": true
            },
            {
              "id": "triad-inversions",
              "title": "Root position and inversions",
              "minutes": 3,
              "requires": [
                "four-triads"
              ],
              "listen": true
            },
            {
              "id": "major-triads-strings-3-2-1",
              "title": "Major triads on the top three strings",
              "minutes": 4,
              "requires": [
                "triad-inversions"
              ]
            },
            {
              "id": "minor-triads-strings-3-2-1",
              "title": "Minor triads on the top three strings",
              "minutes": 3,
              "requires": [
                "major-triads-strings-3-2-1"
              ],
              "listen": true
            },
            {
              "id": "triads-strings-4-3-2",
              "title": "Triads on strings 4, 3 and 2",
              "minutes": 3,
              "requires": [
                "minor-triads-strings-3-2-1",
                "the-b-string-shift"
              ]
            },
            {
              "id": "the-key-on-one-string-set",
              "title": "The chords of a key on three strings",
              "minutes": 4,
              "requires": [
                "triads-strings-4-3-2",
                "triads-from-the-scale"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "caged",
          "title": "CAGED: five shapes, one neck",
          "theme": "fretboard",
          "summary": "How the open C, A, G, E and D shapes become barre chords, link up to cover the whole neck, and frame the five positions of the major scale.",
          "why": "CAGED turns five chords you already know into a map of the entire fretboard.",
          "lessons": [
            {
              "id": "five-open-shapes",
              "title": "Five shapes: C, A, G, E, D",
              "minutes": 3,
              "requires": [
                "triad-inversions",
                "one-four-five"
              ]
            },
            {
              "id": "the-barre",
              "title": "The barre replaces the nut",
              "minutes": 3,
              "requires": [
                "five-open-shapes"
              ],
              "play": true
            },
            {
              "id": "e-shape-barre",
              "title": "E-shape barre chords",
              "minutes": 4,
              "requires": [
                "the-barre",
                "string-6-naturals"
              ],
              "listen": true
            },
            {
              "id": "a-shape-barre",
              "title": "A-shape barre chords",
              "minutes": 4,
              "requires": [
                "e-shape-barre",
                "string-5-naturals"
              ]
            },
            {
              "id": "the-caged-order",
              "title": "C-A-G-E-D up the neck",
              "minutes": 4,
              "requires": [
                "a-shape-barre"
              ]
            },
            {
              "id": "one-chord-five-places",
              "title": "One chord in five places",
              "minutes": 4,
              "requires": [
                "the-caged-order"
              ],
              "listen": true
            },
            {
              "id": "major-scale-positions",
              "title": "The major scale in five positions",
              "minutes": 4,
              "requires": [
                "one-chord-five-places",
                "one-octave-shape"
              ],
              "play": true
            },
            {
              "id": "shapes-inside-scales",
              "title": "Chord shapes inside scale positions",
              "minutes": 3,
              "requires": [
                "major-scale-positions"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "pentatonic-boxes",
          "title": "The pentatonic in five boxes",
          "theme": "scales",
          "summary": "All five boxes of the minor pentatonic, how they link up the neck, the major pentatonic in the same shapes, and in-tune bends.",
          "why": "Five linked boxes free you from one position, so you can solo anywhere on the neck in any key.",
          "lessons": [
            {
              "id": "pentatonic-formulas",
              "title": "Minor and major pentatonic",
              "minutes": 3,
              "requires": [
                "moving-the-box",
                "natural-minor",
                "major-pentatonic"
              ]
            },
            {
              "id": "box-2",
              "title": "Box 2",
              "minutes": 3,
              "requires": [
                "pentatonic-formulas"
              ],
              "play": true
            },
            {
              "id": "box-3",
              "title": "Box 3",
              "minutes": 3,
              "requires": [
                "box-2"
              ],
              "play": true
            },
            {
              "id": "boxes-4-and-5",
              "title": "Boxes 4 and 5",
              "minutes": 4,
              "requires": [
                "box-3"
              ],
              "play": true
            },
            {
              "id": "connecting-the-boxes",
              "title": "Connecting the boxes",
              "minutes": 3,
              "requires": [
                "boxes-4-and-5"
              ],
              "play": true
            },
            {
              "id": "major-pentatonic-boxes",
              "title": "Major pentatonic in the same boxes",
              "minutes": 3,
              "requires": [
                "connecting-the-boxes"
              ],
              "listen": true
            },
            {
              "id": "bends-that-land",
              "title": "Bends that land on scale notes",
              "minutes": 3,
              "requires": [
                "major-pentatonic-boxes",
                "technique-symbols"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "the-blues",
          "title": "The blues",
          "theme": "harmony",
          "summary": "The blues scales, the 12-bar form, dominant seventh chords, common variations, and which scale to use over which chord.",
          "why": "The blues is the root of rock, jazz and soul, and the 12-bar form is the first jam every guitarist is expected to know.",
          "lessons": [
            {
              "id": "the-blues-scale",
              "title": "The blues scale",
              "minutes": 3,
              "requires": [
                "connecting-the-boxes"
              ],
              "listen": true
            },
            {
              "id": "the-major-blues-scale",
              "title": "The major blues scale",
              "minutes": 3,
              "requires": [
                "the-blues-scale"
              ],
              "play": true
            },
            {
              "id": "the-12-bar-form",
              "title": "The 12-bar form",
              "minutes": 4,
              "requires": [
                "the-major-blues-scale",
                "one-four-five",
                "changing-chords-in-time"
              ],
              "play": true
            },
            {
              "id": "dominant-sevenths",
              "title": "Dominant seventh chords",
              "minutes": 4,
              "requires": [
                "the-12-bar-form"
              ],
              "listen": true
            },
            {
              "id": "quick-change-and-turnaround",
              "title": "Quick change and turnaround",
              "minutes": 3,
              "requires": [
                "dominant-sevenths"
              ],
              "play": true
            },
            {
              "id": "which-pentatonic-over-a-blues",
              "title": "Minor or major pentatonic over a blues",
              "minutes": 3,
              "requires": [
                "quick-change-and-turnaround",
                "major-pentatonic-boxes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "the-minor-blues",
              "title": "The minor blues",
              "minutes": 3,
              "requires": [
                "which-pentatonic-over-a-blues",
                "harmonic-minor"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "functional-harmony",
          "title": "How chords work: function and cadence",
          "theme": "harmony",
          "summary": "Tonic, subdominant and dominant, why V pulls home, the four cadences, common progressions, and how to find a song's key.",
          "why": "Knowing what each chord does lets you predict, remember and write progressions instead of memorising them.",
          "lessons": [
            {
              "id": "three-functions",
              "title": "Home, away and tension",
              "minutes": 4,
              "requires": [
                "neighbour-keys",
                "the-six-chord"
              ],
              "listen": true
            },
            {
              "id": "substitute-chords",
              "title": "Chords that do the same job",
              "minutes": 3,
              "requires": [
                "three-functions"
              ],
              "listen": true
            },
            {
              "id": "why-v-pulls-home",
              "title": "Why V pulls home",
              "minutes": 4,
              "requires": [
                "substitute-chords",
                "the-tritone",
                "dominant-sevenths"
              ],
              "listen": true
            },
            {
              "id": "cadences",
              "title": "Cadences: how phrases end",
              "minutes": 4,
              "requires": [
                "why-v-pulls-home"
              ],
              "listen": true
            },
            {
              "id": "hearing-cadences",
              "title": "Hearing cadences",
              "minutes": 3,
              "requires": [
                "cadences"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "common-progressions",
              "title": "The progressions everyone uses",
              "minutes": 4,
              "requires": [
                "hearing-cadences"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "finding-the-key",
              "title": "Finding the key of a song",
              "minutes": 3,
              "requires": [
                "common-progressions"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "reading-first-position",
          "title": "Reading music: the whole first position",
          "theme": "reading",
          "summary": "All six strings in first position, accidentals within a bar, rhythm on the staff, repeats and road signs, dynamics and articulation.",
          "why": "With first position, accidentals and the road map you can read most beginner and folk guitar music at sight.",
          "lessons": [
            {
              "id": "strings-4-to-6",
              "title": "Reading on strings 4 to 6",
              "minutes": 4,
              "requires": [
                "reading-strings-1-to-3",
                "ledger-lines"
              ],
              "play": true
            },
            {
              "id": "accidentals-in-a-bar",
              "title": "Accidentals last until the bar line",
              "minutes": 3,
              "requires": [
                "strings-4-to-6"
              ]
            },
            {
              "id": "sharps-and-flats-in-position",
              "title": "Sharps and flats in first position",
              "minutes": 3,
              "requires": [
                "accidentals-in-a-bar"
              ]
            },
            {
              "id": "rhythm-on-the-staff",
              "title": "Stems, beams and reading rhythm",
              "minutes": 3,
              "requires": [
                "sharps-and-flats-in-position",
                "sixteenth-notes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "the-road-map",
              "title": "Repeats and road signs",
              "minutes": 4,
              "requires": [
                "rhythm-on-the-staff"
              ]
            },
            {
              "id": "dynamics-and-articulation",
              "title": "Dynamics and articulation",
              "minutes": 3,
              "requires": [
                "the-road-map",
                "loud-is-not-high"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "minor-key-harmony",
          "title": "Harmony in minor keys",
          "theme": "harmony",
          "summary": "The chords of a minor key, the borrowed major V, common minor progressions, the Andalusian cadence and other minor-key colours.",
          "why": "Most rock, metal, flamenco and many pop songs live in minor keys, and their chords follow these patterns.",
          "lessons": [
            {
              "id": "natural-minor-chords",
              "title": "The chords of a minor key",
              "minutes": 4,
              "requires": [
                "minor-key-signatures",
                "three-functions"
              ]
            },
            {
              "id": "the-major-v",
              "title": "The borrowed major V",
              "minutes": 3,
              "requires": [
                "natural-minor-chords",
                "harmonic-minor"
              ],
              "listen": true
            },
            {
              "id": "minor-progressions",
              "title": "Common minor progressions",
              "minutes": 3,
              "requires": [
                "the-major-v"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "the-andalusian-cadence",
              "title": "The Andalusian cadence",
              "minutes": 3,
              "requires": [
                "minor-progressions"
              ],
              "listen": true
            },
            {
              "id": "relative-keys-in-songs",
              "title": "Moving between relative keys",
              "minutes": 3,
              "requires": [
                "the-andalusian-cadence"
              ],
              "listen": true
            },
            {
              "id": "minor-key-colours",
              "title": "The Picardy third and the major IV",
              "minutes": 3,
              "requires": [
                "relative-keys-in-songs",
                "melodic-minor"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "seventh-chords",
          "title": "Seventh chords",
          "theme": "chords",
          "summary": "The five main seventh chords, their formulas, the sevenths of major and minor keys, open and barre shapes, and what each one does.",
          "why": "Seventh chords are the sound of jazz, soul, funk and the blues, and they explain how chords pull from one to the next.",
          "lessons": [
            {
              "id": "what-a-seventh-chord-is",
              "title": "Adding a seventh",
              "minutes": 3,
              "requires": [
                "four-triads",
                "dominant-sevenths"
              ],
              "listen": true
            },
            {
              "id": "the-five-formulas",
              "title": "Five seventh-chord formulas",
              "minutes": 4,
              "requires": [
                "what-a-seventh-chord-is"
              ]
            },
            {
              "id": "sevenths-in-a-key",
              "title": "The seventh chords of a major key",
              "minutes": 3,
              "requires": [
                "the-five-formulas",
                "the-major-key-pattern"
              ]
            },
            {
              "id": "sevenths-in-a-minor-key",
              "title": "The seventh chords of a minor key",
              "minutes": 4,
              "requires": [
                "sevenths-in-a-key",
                "the-major-v"
              ],
              "listen": true
            },
            {
              "id": "open-seventh-shapes",
              "title": "Open seventh-chord shapes",
              "minutes": 4,
              "requires": [
                "sevenths-in-a-minor-key",
                "a-am-d-dm"
              ],
              "play": true
            },
            {
              "id": "barre-seventh-shapes",
              "title": "Movable seventh-chord shapes",
              "minutes": 4,
              "requires": [
                "open-seventh-shapes",
                "a-shape-barre"
              ]
            },
            {
              "id": "hearing-sevenths",
              "title": "Hearing seventh chords",
              "minutes": 3,
              "requires": [
                "barre-seventh-shapes"
              ],
              "listen": true
            },
            {
              "id": "sevenths-and-function",
              "title": "What each seventh chord does",
              "minutes": 3,
              "requires": [
                "hearing-sevenths",
                "why-v-pulls-home"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "modes",
          "title": "The modes",
          "theme": "scales",
          "summary": "The seven modes of the major scale as scales and as colours, their characteristic notes and vamps, and how to hear them.",
          "why": "Modes give you seven distinct moods from one set of notes, and explain the sound of a lot of rock, folk, funk and film music.",
          "lessons": [
            {
              "id": "modes-as-rotations",
              "title": "Same notes, new home",
              "minutes": 3,
              "requires": [
                "relative-minor",
                "parallel-minor"
              ]
            },
            {
              "id": "modes-against-major",
              "title": "Comparing each mode with major",
              "minutes": 4,
              "requires": [
                "modes-as-rotations"
              ]
            },
            {
              "id": "dorian",
              "title": "Dorian",
              "minutes": 3,
              "requires": [
                "modes-against-major",
                "minor-key-colours"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "mixolydian",
              "title": "Mixolydian",
              "minutes": 3,
              "requires": [
                "dorian"
              ],
              "listen": true
            },
            {
              "id": "lydian",
              "title": "Lydian",
              "minutes": 3,
              "requires": [
                "mixolydian"
              ],
              "listen": true
            },
            {
              "id": "phrygian-and-locrian",
              "title": "Phrygian and Locrian",
              "minutes": 3,
              "requires": [
                "lydian"
              ],
              "listen": true
            },
            {
              "id": "hearing-the-modes",
              "title": "Hearing the modes",
              "minutes": 4,
              "requires": [
                "phrygian-and-locrian"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "colour-chords",
          "title": "Colour chords: sus, add, 6 and slash",
          "theme": "chords",
          "summary": "Suspended, added-note and sixth chords, slash chords, bass lines and pedal points.",
          "why": "These small changes to familiar shapes are where much of the shimmer in acoustic and pop guitar comes from.",
          "lessons": [
            {
              "id": "sus-chords",
              "title": "Suspended chords",
              "minutes": 3,
              "requires": [
                "the-five-formulas",
                "four-triads"
              ],
              "listen": true
            },
            {
              "id": "add-chords",
              "title": "Added-note chords",
              "minutes": 3,
              "requires": [
                "sus-chords"
              ]
            },
            {
              "id": "sixth-chords",
              "title": "Sixth chords",
              "minutes": 3,
              "requires": [
                "add-chords"
              ],
              "listen": true
            },
            {
              "id": "slash-chords",
              "title": "Slash chords",
              "minutes": 3,
              "requires": [
                "sixth-chords",
                "triad-inversions"
              ],
              "listen": true
            },
            {
              "id": "walking-bass-with-slash-chords",
              "title": "Bass lines with slash chords",
              "minutes": 3,
              "requires": [
                "slash-chords"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "pedal-points",
              "title": "Pedal points",
              "minutes": 3,
              "requires": [
                "walking-bass-with-slash-chords"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "capo-and-transposition",
          "title": "Transposing, the capo and Nashville numbers",
          "theme": "keys",
          "summary": "Moving music to a new key by interval and by numerals, capo arithmetic, choosing a key, and writing progressions as numbers.",
          "why": "With these you can play any song in a key that suits your voice using the chord shapes you already know.",
          "lessons": [
            {
              "id": "transposing",
              "title": "Transposing",
              "minutes": 4,
              "requires": [
                "common-progressions",
                "the-circle"
              ],
              "listen": true
            },
            {
              "id": "the-capo",
              "title": "How a capo works",
              "minutes": 2,
              "requires": [
                "transposing",
                "roman-numerals"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "capo-arithmetic",
              "title": "Capo arithmetic",
              "minutes": 4,
              "requires": [
                "the-capo"
              ]
            },
            {
              "id": "choosing-a-key",
              "title": "Choosing a key to sing in",
              "minutes": 3,
              "requires": [
                "capo-arithmetic"
              ]
            },
            {
              "id": "nashville-numbers",
              "title": "The Nashville number system",
              "minutes": 3,
              "requires": [
                "choosing-a-key"
              ]
            }
          ]
        },
        {
          "id": "improvising-1",
          "title": "Improvising: notes that fit",
          "theme": "improvisation",
          "summary": "Arpeggios, chord tones on strong beats, target notes at chord changes, motifs, and call and response.",
          "why": "These ideas turn running up and down a scale into solos that follow the chords and say something.",
          "lessons": [
            {
              "id": "arpeggios",
              "title": "Arpeggios",
              "minutes": 3,
              "requires": [
                "shapes-inside-scales",
                "connecting-the-boxes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "seventh-arpeggios",
              "title": "Seventh-chord arpeggios",
              "minutes": 3,
              "requires": [
                "arpeggios",
                "the-five-formulas"
              ],
              "play": true
            },
            {
              "id": "chord-tones-on-strong-beats",
              "title": "Chord tones on strong beats",
              "minutes": 3,
              "requires": [
                "seventh-arpeggios",
                "three-functions"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "target-notes",
              "title": "Aiming at the change",
              "minutes": 4,
              "requires": [
                "chord-tones-on-strong-beats"
              ],
              "play": true
            },
            {
              "id": "motifs",
              "title": "Motifs",
              "minutes": 3,
              "requires": [
                "target-notes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "call-and-response",
              "title": "Call and response, and space",
              "minutes": 3,
              "requires": [
                "motifs"
              ],
              "play": true,
              "listen": true
            }
          ]
        }
      ]
    },
    {
      "id": "expert",
      "title": "Expert",
      "subtitle": "Advanced harmony, improvisation and the physics of sound",
      "units": [
        {
          "id": "compound-and-odd-meters",
          "title": "Rhythm: compound and odd meters",
          "theme": "rhythm",
          "summary": "Simple versus compound time, 6/8, 9/8 and 12/8, odd meters, mixed meter, hemiola and polyrhythm.",
          "why": "Folk jigs, slow blues, progressive rock and much of the world's music live in these meters.",
          "lessons": [
            {
              "id": "simple-and-compound",
              "title": "Simple and compound time",
              "minutes": 3,
              "requires": [
                "triplets",
                "rhythm-on-the-staff"
              ],
              "listen": true
            },
            {
              "id": "six-eight",
              "title": "6/8 time",
              "minutes": 3,
              "requires": [
                "simple-and-compound"
              ],
              "listen": true
            },
            {
              "id": "nine-and-twelve-eight",
              "title": "9/8 and 12/8",
              "minutes": 3,
              "requires": [
                "six-eight"
              ],
              "listen": true
            },
            {
              "id": "odd-meters",
              "title": "Fives and sevens",
              "minutes": 4,
              "requires": [
                "nine-and-twelve-eight"
              ],
              "listen": true
            },
            {
              "id": "mixed-meter-and-hemiola",
              "title": "Mixed meter and hemiola",
              "minutes": 3,
              "requires": [
                "odd-meters"
              ],
              "listen": true
            },
            {
              "id": "three-against-two",
              "title": "Three against two",
              "minutes": 4,
              "requires": [
                "mixed-meter-and-hemiola"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "extended-chords",
          "title": "Extended chords: 9, 11 and 13",
          "theme": "chords",
          "summary": "Ninth, eleventh and thirteenth chords, which notes to keep and drop, and which extensions belong to a key.",
          "why": "Extensions are the rich colours of jazz, soul, funk and gospel, and they are easy to grab on guitar once you know what to leave out.",
          "lessons": [
            {
              "id": "beyond-the-seventh",
              "title": "Beyond the seventh",
              "minutes": 3,
              "requires": [
                "sevenths-and-function",
                "compound-intervals"
              ]
            },
            {
              "id": "ninth-chords",
              "title": "Ninth chords",
              "minutes": 3,
              "requires": [
                "beyond-the-seventh"
              ],
              "listen": true
            },
            {
              "id": "elevenths",
              "title": "Elevenths: natural and sharp",
              "minutes": 4,
              "requires": [
                "ninth-chords"
              ],
              "listen": true
            },
            {
              "id": "thirteenths",
              "title": "Thirteenth chords",
              "minutes": 3,
              "requires": [
                "elevenths"
              ]
            },
            {
              "id": "what-to-leave-out",
              "title": "What to leave out",
              "minutes": 3,
              "requires": [
                "thirteenths"
              ]
            },
            {
              "id": "extensions-in-a-key",
              "title": "Which extensions fit the key",
              "minutes": 4,
              "requires": [
                "what-to-leave-out",
                "sevenths-in-a-key"
              ]
            }
          ]
        },
        {
          "id": "secondary-dominants",
          "title": "Secondary dominants",
          "theme": "harmony",
          "summary": "Dominants of chords other than the tonic, how to spot them, chains of dominants and secondary leading-tone chords.",
          "why": "Secondary dominants are the chromatic chords you meet most often, in everything from Bach to ragtime to pop.",
          "lessons": [
            {
              "id": "what-a-secondary-dominant-is",
              "title": "The dominant of another chord",
              "minutes": 3,
              "requires": [
                "why-v-pulls-home",
                "sevenths-in-a-key"
              ],
              "listen": true
            },
            {
              "id": "the-five-in-c",
              "title": "The secondary dominants of C",
              "minutes": 3,
              "requires": [
                "what-a-secondary-dominant-is"
              ]
            },
            {
              "id": "spotting-and-resolving",
              "title": "Spotting and resolving them",
              "minutes": 3,
              "requires": [
                "the-five-in-c"
              ],
              "listen": true
            },
            {
              "id": "chains-of-dominants",
              "title": "Chains of dominants",
              "minutes": 3,
              "requires": [
                "spotting-and-resolving",
                "the-circle"
              ],
              "play": true
            },
            {
              "id": "secondary-leading-tone-chords",
              "title": "Secondary leading-tone chords",
              "minutes": 3,
              "requires": [
                "chains-of-dominants",
                "sevenths-and-function"
              ],
              "listen": true
            },
            {
              "id": "hearing-secondary-dominants",
              "title": "Hearing secondary dominants",
              "minutes": 3,
              "requires": [
                "secondary-leading-tone-chords"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "modal-harmony-and-borrowing",
          "title": "Modal harmony and borrowed chords",
          "theme": "harmony",
          "summary": "Building chord progressions in a mode, and borrowing chords from the parallel minor and other modes.",
          "why": "These are the colours behind rock's bVII, the bittersweet minor iv and the modal sound of much film and folk music.",
          "lessons": [
            {
              "id": "modal-progressions",
              "title": "Progressions in a mode",
              "minutes": 4,
              "requires": [
                "hearing-the-modes",
                "minor-progressions"
              ],
              "listen": true
            },
            {
              "id": "drones-and-quartal-chords",
              "title": "Drones and chords in fourths",
              "minutes": 3,
              "requires": [
                "modal-progressions"
              ],
              "listen": true
            },
            {
              "id": "modal-interchange",
              "title": "Borrowing from the parallel minor",
              "minutes": 3,
              "requires": [
                "drones-and-quartal-chords",
                "natural-minor-chords",
                "parallel-minor"
              ],
              "listen": true
            },
            {
              "id": "the-minor-four",
              "title": "The minor iv",
              "minutes": 3,
              "requires": [
                "modal-interchange"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "flat-seven-and-flat-six",
              "title": "bVII and bVI",
              "minutes": 3,
              "requires": [
                "the-minor-four"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "neapolitan-and-dark-ii",
              "title": "The Neapolitan and the borrowed iiø7",
              "minutes": 3,
              "requires": [
                "flat-seven-and-flat-six"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "jazz-harmony",
          "title": "Jazz harmony basics",
          "theme": "harmony",
          "summary": "The major and minor ii-V-I, guide tones, shell, drop-2 and drop-3 voicings, turnarounds and comping.",
          "why": "With ii-V-Is, guide tones and a handful of voicings you can play through most jazz standards.",
          "lessons": [
            {
              "id": "major-two-five-one",
              "title": "The major ii-V-I",
              "minutes": 3,
              "requires": [
                "chains-of-dominants",
                "ninth-chords"
              ],
              "listen": true
            },
            {
              "id": "minor-two-five-one",
              "title": "The minor ii-V-i",
              "minutes": 3,
              "requires": [
                "major-two-five-one",
                "the-major-v",
                "sevenths-in-a-minor-key"
              ],
              "listen": true
            },
            {
              "id": "guide-tones",
              "title": "Guide tones",
              "minutes": 4,
              "requires": [
                "minor-two-five-one",
                "sevenths-and-function"
              ],
              "play": true
            },
            {
              "id": "shell-voicings",
              "title": "Shell voicings",
              "minutes": 4,
              "requires": [
                "guide-tones",
                "e-shape-barre"
              ],
              "play": true
            },
            {
              "id": "drop-2-voicings",
              "title": "Drop-2 voicings",
              "minutes": 4,
              "requires": [
                "shell-voicings"
              ]
            },
            {
              "id": "drop-3-voicings",
              "title": "Drop-3 voicings",
              "minutes": 3,
              "requires": [
                "drop-2-voicings"
              ]
            },
            {
              "id": "turnarounds",
              "title": "Turnarounds",
              "minutes": 3,
              "requires": [
                "drop-3-voicings",
                "hearing-secondary-dominants"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "comping",
              "title": "Comping",
              "minutes": 3,
              "requires": [
                "turnarounds"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "altered-dominants",
          "title": "Altered dominants and substitutions",
          "theme": "harmony",
          "summary": "Altered tensions, the 7#9 and 7alt chords, tritone substitution, the backdoor dominant and the diminished seventh as a dominant.",
          "why": "These are the tensions and substitutions that make jazz, soul and blues-rock harmony sound sophisticated.",
          "lessons": [
            {
              "id": "altered-tensions",
              "title": "Altered tensions",
              "minutes": 3,
              "requires": [
                "elevenths",
                "guide-tones"
              ],
              "listen": true
            },
            {
              "id": "the-sharp-nine-chord",
              "title": "The 7#9 chord",
              "minutes": 3,
              "requires": [
                "altered-tensions"
              ]
            },
            {
              "id": "seven-alt-and-the-altered-scale",
              "title": "7alt and the altered scale",
              "minutes": 4,
              "requires": [
                "the-sharp-nine-chord",
                "melodic-minor"
              ],
              "listen": true
            },
            {
              "id": "tritone-substitution",
              "title": "Tritone substitution",
              "minutes": 4,
              "requires": [
                "seven-alt-and-the-altered-scale"
              ],
              "listen": true
            },
            {
              "id": "backdoor-dominant",
              "title": "The backdoor dominant",
              "minutes": 3,
              "requires": [
                "tritone-substitution",
                "the-minor-four"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "diminished-as-dominant",
              "title": "The diminished seventh as a dominant",
              "minutes": 3,
              "requires": [
                "backdoor-dominant",
                "secondary-leading-tone-chords"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "symmetric-sounds",
          "title": "Diminished, augmented and whole-tone sounds",
          "theme": "scales",
          "summary": "Chords and scales that divide the octave equally: diminished sevenths, diminished scales, augmented triads and the whole-tone scale.",
          "why": "Symmetry makes these sounds easy to move around the neck, and they supply much of the drama in jazz, film and classical music.",
          "lessons": [
            {
              "id": "dim7-symmetry",
              "title": "The symmetry of the diminished seventh",
              "minutes": 3,
              "requires": [
                "diminished-as-dominant"
              ]
            },
            {
              "id": "one-dim7-four-dominants",
              "title": "One diminished chord, four dominants",
              "minutes": 4,
              "requires": [
                "dim7-symmetry"
              ],
              "listen": true
            },
            {
              "id": "diminished-scales",
              "title": "The diminished scales",
              "minutes": 4,
              "requires": [
                "one-dim7-four-dominants"
              ],
              "listen": true
            },
            {
              "id": "augmented-symmetry",
              "title": "The augmented triad",
              "minutes": 3,
              "requires": [
                "diminished-scales"
              ],
              "listen": true
            },
            {
              "id": "whole-tone-scale",
              "title": "The whole-tone scale",
              "minutes": 3,
              "requires": [
                "augmented-symmetry"
              ],
              "listen": true
            },
            {
              "id": "augmented-in-progressions",
              "title": "Augmented chords in progressions",
              "minutes": 3,
              "requires": [
                "whole-tone-scale"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "scales-beyond",
          "title": "Scales beyond the basics",
          "theme": "scales",
          "summary": "Chord-scale thinking, the modes of melodic and harmonic minor, bebop scales, exotic scales and pentatonic superimposition.",
          "why": "These scales give you a precise colour for every chord, from Lydian dominant to Phrygian dominant to the altered scale.",
          "lessons": [
            {
              "id": "chord-scales",
              "title": "A scale for every chord",
              "minutes": 3,
              "requires": [
                "modes-against-major",
                "seven-alt-and-the-altered-scale"
              ],
              "listen": true
            },
            {
              "id": "melodic-minor-modes",
              "title": "The modes of melodic minor",
              "minutes": 4,
              "requires": [
                "chord-scales"
              ],
              "listen": true
            },
            {
              "id": "phrygian-dominant",
              "title": "Phrygian dominant",
              "minutes": 3,
              "requires": [
                "melodic-minor-modes",
                "the-andalusian-cadence"
              ],
              "listen": true
            },
            {
              "id": "bebop-scales",
              "title": "Bebop scales",
              "minutes": 3,
              "requires": [
                "phrygian-dominant",
                "major-two-five-one"
              ],
              "play": true
            },
            {
              "id": "exotic-scales",
              "title": "Exotic scales",
              "minutes": 3,
              "requires": [
                "bebop-scales"
              ],
              "listen": true
            },
            {
              "id": "pentatonic-superimposition",
              "title": "Pentatonics on other roots",
              "minutes": 4,
              "requires": [
                "exotic-scales",
                "major-pentatonic-boxes"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "voice-leading",
          "title": "Voice leading",
          "theme": "composition",
          "summary": "How the notes of one chord move to the next: common tones, motion types, parallel fifths, line clichés, non-chord tones and smooth seventh chords.",
          "why": "Good voice leading makes simple progressions sound polished and makes chord changes easier for your hand.",
          "lessons": [
            {
              "id": "what-voice-leading-is",
              "title": "What voice leading is",
              "minutes": 3,
              "requires": [
                "drop-2-voicings",
                "the-key-on-one-string-set"
              ],
              "listen": true
            },
            {
              "id": "inversions-for-smoothness",
              "title": "Choosing inversions for smooth changes",
              "minutes": 3,
              "requires": [
                "what-voice-leading-is"
              ],
              "play": true
            },
            {
              "id": "kinds-of-motion",
              "title": "Parallel, similar, contrary, oblique",
              "minutes": 3,
              "requires": [
                "inversions-for-smoothness"
              ],
              "listen": true
            },
            {
              "id": "parallel-fifths",
              "title": "Parallel fifths and the rule of style",
              "minutes": 3,
              "requires": [
                "kinds-of-motion",
                "power-chords"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "line-cliches",
              "title": "Line clichés",
              "minutes": 3,
              "requires": [
                "parallel-fifths"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "non-chord-tones",
              "title": "Notes outside the chord",
              "minutes": 4,
              "requires": [
                "line-cliches",
                "sus-chords",
                "chord-tones-on-strong-beats"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "voice-led-two-five-one",
              "title": "A voice-led ii-V-I",
              "minutes": 4,
              "requires": [
                "non-chord-tones",
                "line-cliches",
                "guide-tones"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "modulation",
          "title": "Modulation and chromatic chords",
          "theme": "harmony",
          "summary": "Changing key: tonicization versus modulation, related keys, pivot chords, direct key changes, chromatic mediants and augmented sixth chords.",
          "why": "Key changes give songs and pieces their sense of journey, and recognising them stops a chart full of strange chords from being confusing.",
          "lessons": [
            {
              "id": "tonicization-or-modulation",
              "title": "Visiting or moving",
              "minutes": 3,
              "requires": [
                "spotting-and-resolving",
                "neighbour-keys"
              ],
              "listen": true
            },
            {
              "id": "closely-related-keys",
              "title": "Closely related keys",
              "minutes": 3,
              "requires": [
                "tonicization-or-modulation"
              ]
            },
            {
              "id": "pivot-chords",
              "title": "Pivot chords",
              "minutes": 4,
              "requires": [
                "closely-related-keys"
              ],
              "listen": true
            },
            {
              "id": "direct-modulation",
              "title": "Direct and common-tone modulation",
              "minutes": 3,
              "requires": [
                "pivot-chords"
              ],
              "listen": true
            },
            {
              "id": "chromatic-mediants",
              "title": "Chromatic mediants",
              "minutes": 3,
              "requires": [
                "direct-modulation"
              ],
              "listen": true
            },
            {
              "id": "augmented-sixth-chords",
              "title": "Augmented sixth chords",
              "minutes": 4,
              "requires": [
                "chromatic-mediants",
                "tritone-substitution"
              ],
              "listen": true
            }
          ]
        },
        {
          "id": "playing-the-changes",
          "title": "Improvising: playing the changes",
          "theme": "improvisation",
          "summary": "Horizontal and vertical playing, guide-tone lines, approach notes, enclosures, arpeggio substitution and outside playing.",
          "why": "These are the tools for soloing over progressions that leave the key, from jazz standards to sophisticated pop.",
          "lessons": [
            {
              "id": "horizontal-and-vertical",
              "title": "One scale or every chord",
              "minutes": 3,
              "requires": [
                "target-notes",
                "guide-tones"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "guide-tone-lines",
              "title": "Guide-tone lines",
              "minutes": 4,
              "requires": [
                "horizontal-and-vertical"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "approach-notes",
              "title": "Approach notes",
              "minutes": 3,
              "requires": [
                "guide-tone-lines"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "enclosures",
              "title": "Enclosures",
              "minutes": 3,
              "requires": [
                "approach-notes"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "arpeggio-substitution",
              "title": "Arpeggios a third up",
              "minutes": 4,
              "requires": [
                "enclosures",
                "seventh-arpeggios",
                "extensions-in-a-key"
              ],
              "listen": true
            },
            {
              "id": "playing-outside",
              "title": "Going outside and coming back",
              "minutes": 3,
              "requires": [
                "arpeggio-substitution",
                "tritone-substitution"
              ],
              "play": true,
              "listen": true
            }
          ]
        },
        {
          "id": "song-form-and-arranging",
          "title": "Song form, arranging and writing",
          "theme": "composition",
          "summary": "Song sections and forms, phrases and periods, the guitar's roles in a band, chord melody, bass lines and writing your own progressions.",
          "why": "Form and arranging turn chords you know into finished songs and parts that fit with other musicians.",
          "lessons": [
            {
              "id": "song-sections",
              "title": "Verse, chorus, bridge",
              "minutes": 3,
              "requires": [
                "finding-the-key",
                "the-road-map"
              ],
              "listen": true
            },
            {
              "id": "common-forms",
              "title": "Forms by letter",
              "minutes": 3,
              "requires": [
                "song-sections"
              ],
              "listen": true
            },
            {
              "id": "phrases-and-periods",
              "title": "Phrases and periods",
              "minutes": 3,
              "requires": [
                "common-forms",
                "cadences"
              ],
              "listen": true
            },
            {
              "id": "the-guitar-in-a-band",
              "title": "The guitar's jobs in a band",
              "minutes": 3,
              "requires": [
                "phrases-and-periods",
                "one-chord-five-places"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "chord-melody",
              "title": "Chord melody",
              "minutes": 4,
              "requires": [
                "the-guitar-in-a-band",
                "major-triads-strings-3-2-1"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "bass-lines",
              "title": "Writing a bass line",
              "minutes": 3,
              "requires": [
                "chord-melody"
              ],
              "play": true,
              "listen": true
            },
            {
              "id": "writing-a-progression",
              "title": "Writing your own progression",
              "minutes": 4,
              "requires": [
                "bass-lines",
                "flat-seven-and-flat-six"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "reading-up-the-neck",
          "title": "Reading music: positions up the neck",
          "theme": "reading",
          "summary": "Positions and how they are marked, fifth position, choosing where to play, ledger lines above the staff and a sight-reading routine.",
          "why": "Reading beyond first position opens up classical études, jazz heads and any melody written for another instrument.",
          "lessons": [
            {
              "id": "what-a-position-is",
              "title": "Positions and how they are marked",
              "minutes": 3,
              "requires": [
                "sharps-and-flats-in-position"
              ]
            },
            {
              "id": "fifth-position",
              "title": "Fifth position",
              "minutes": 4,
              "requires": [
                "what-a-position-is"
              ],
              "play": true
            },
            {
              "id": "choosing-a-position",
              "title": "Choosing a position",
              "minutes": 3,
              "requires": [
                "fifth-position"
              ],
              "listen": true
            },
            {
              "id": "ledger-lines-above",
              "title": "Ledger lines above the staff and 8va",
              "minutes": 3,
              "requires": [
                "choosing-a-position"
              ]
            },
            {
              "id": "sight-reading-routine",
              "title": "A sight-reading routine",
              "minutes": 3,
              "requires": [
                "ledger-lines-above"
              ],
              "play": true
            }
          ]
        },
        {
          "id": "tuning-and-physics",
          "title": "Tuning, harmonics and the physics of the string",
          "theme": "basics",
          "summary": "Frequency and concert pitch, what sets a string's pitch, the harmonic series, natural harmonics, fret spacing, equal temperament and alternate tunings.",
          "why": "Knowing the physics explains harmonics, intonation and why a guitar can never be perfectly in tune in every key, and it lets you set up and retune your instrument with confidence.",
          "lessons": [
            {
              "id": "frequency-and-concert-pitch",
              "title": "Frequency and concert pitch",
              "minutes": 3,
              "requires": [
                "the-octave",
                "using-a-tuner"
              ],
              "play": true
            },
            {
              "id": "what-sets-the-pitch",
              "title": "Length, tension and mass",
              "minutes": 3,
              "requires": [
                "frequency-and-concert-pitch"
              ]
            },
            {
              "id": "the-harmonic-series",
              "title": "The harmonic series",
              "minutes": 3,
              "requires": [
                "what-sets-the-pitch",
                "tone-colour",
                "compound-intervals"
              ],
              "listen": true
            },
            {
              "id": "natural-harmonics",
              "title": "Natural harmonics on the neck",
              "minutes": 4,
              "requires": [
                "the-harmonic-series"
              ],
              "play": true
            },
            {
              "id": "fret-spacing-and-intonation",
              "title": "Fret spacing and intonation",
              "minutes": 3,
              "requires": [
                "natural-harmonics"
              ]
            },
            {
              "id": "equal-temperament",
              "title": "Equal temperament",
              "minutes": 4,
              "requires": [
                "fret-spacing-and-intonation"
              ],
              "listen": true
            },
            {
              "id": "alternate-tunings",
              "title": "Alternate tunings",
              "minutes": 3,
              "requires": [
                "equal-temperament",
                "the-caged-order"
              ],
              "play": true
            }
          ]
        }
      ]
    }
  ]
};
