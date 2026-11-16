/**
 * Batch 2 cross-checks: the songs in src/content/songs/<id>/ checked against note lists written
 * out by hand, independently of the tab: from the tunes as commonly known and printed
 * (Clementine, Drunken Sailor, Deck the Halls, Amazing Grace) and from the composition plans of
 * the original studies. Each song is parsed with the song core and every sounding pitch of the
 * melody (the tune, or the teacher's tune in a strum study) is compared bar by bar, so a wrong
 * fret shows up as a wrong note name in a named bar. Also checked: rhythm, chord symbols and the
 * shapes the plan names, chord tones on strong beats, key, scale, range, last note, first
 * position, the words, the learner's strum or bass part beat by beat, and the core's difficulty
 * estimate against the level in meta.ts.
 *
 * Bar numbers are 1-based; in a song with a pickup the pickup is bar 0.
 * Michael, Row the Boat Ashore (also in this batch) is not written: see the batch report.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, parseSixTab, validateSong, type Beat, type Song, type Track } from '@/core/song';
import { chordPcs, midiToNote, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;
const STANDARD = [40, 45, 50, 55, 59, 64];
const FOUR = [0, 2 * PPQ];
const ONE = [0];

/** What one song should contain, written out by hand. */
interface Expected {
  id: string;
  /** The melody track checked (the tune; in a strum study, the teacher's tune). */
  melody: string;
  /** Sounding pitches of every struck melody note, bar by bar ("|" between bars). */
  notes: string;
  /** Duration of every beat, bar by bar: w h. h q. q e. e s, then "r" for a rest or "~" for a tie. */
  rhythm: string;
  /** Chord events as written: "bar:symbol" or "bar.beat:symbol". */
  chords: string;
  /** Harmony assumed before the first chord symbol (a pickup). */
  implied?: string;
  /** The key as "tonic mode", and the scale the melody keeps to (tonic + scale id). */
  key: string;
  scale: [string, string];
  /** Notes allowed outside the scale, as "bar:Note" (a chromatic passing note of the tune). */
  chromatic?: string[];
  /** Lowest and highest melody note. */
  range: [string, string];
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
  /** Pitch class of the last melody note. */
  ends: string;
  /** Words of the melody track as sung, syllables joined by hyphens, when the song has words. */
  words?: string[];
}

const rep = (n: number, s: string) => Array.from({ length: n }, () => s);
const join = (...parts: string[]) => parts.join(' | ');

// --- Oh My Darling, Clementine: one 8-bar strophe for verse and chorus, with a pickup "In a". ---
// do do | do sol, mi mi | mi do do mi | sol sol fa mi | re (re mi) | fa fa mi re | mi do do mi |
// re sol, ti, re | do, in D: do = D3 (open string 4), sol, = A2, ti, = C#3.
const CLEM = 'D3 A2 F#3 F#3 | F#3 D3 D3 F#3 | A3 A3 G3 F#3 | E3 E3 F#3 | G3 G3 F#3 E3 | F#3 D3 D3 F#3 | E3 A2 C#3 E3';
const CLEM_R = 'q q e e | q q e e | q q e e | h e e | q q e e | q q e e | q q e e';
const CLEM_CHORUS = 'Oh my dar-ling, oh my dar-ling, oh my dar-ling, Clem-en-tine, you are lost and gone for-ev-er, dread-ful sor-ry, Clem-en-tine.';

// --- Drunken Sailor in E Dorian, 2/4: the chorus and the verse share the notes. ---
const SAILOR_TAIL = 'B3 E3 | G3 B3 | A3 | A3 A3 | A3 D3 | F#3 A3 | B3 | B3 B3 | B3 C#4 | D4 E4 | D4 B3 | A3 F#3 | E3 | E3';
const SAILOR_CHORUS = join('B3', 'B3 B3', SAILOR_TAIL);
const SAILOR_CHORUS_R = 'h | q. e | q q | q q | h | q. e | q q | q q | h | q. e | q q | q q | q q | q q | h | h';
const SAILOR_VERSE = 'B3 B3 B3 B3 | B3 B3 | B3 E3 | G3 B3 | A3 A3 A3 A3 | A3 A3 | A3 D3 | F#3 A3 | B3 B3 B3 B3 | B3 B3 | B3 C#4 | D4 E4 | D4 B3 | A3 F#3 | E3 | E3';
const SAILOR_VERSE_R = 'e e e e | q q | q q | q q | e e e e | q q | q q | q q | e e e e | q q | q q | q q | q q | q q | h | h';
const WAY = 'Way hay and up she ri-ses,';
const PUT = "Put him in the long-boat till he's so-ber,";
const MORNING = 'Ear-ly in the morn-ing.';

// --- Deck the Halls in G: lines 1, 2 and 4 open D. C B A | G A B G. ---
const DECK_A = 'D4 C4 B3 A3 | G3 A3 B3 G3 | A3 B3 C4 A3 B3 A3 | G3 F#3 G3';
const DECK_A_R = 'q. e q q | q q q q | e e e e q. e | q q h';
const DECK_B = 'A3 B3 C4 A3 | B3 C4 D4 A3 | B3 C#4 D4 E4 F#4 G4 | F#4 E4 D4';
const DECK_B_R = 'q. e q q | q. e q q | e e q e e q | q q h';
// Line 4's fa-la-la: four repeated la's on the sixth (E), then down the scale home, la sol fa |
// mi re do (in F, as the tune is usually printed: d d d d c. bb | a g f).
const DECK_END = 'D4 C4 B3 A3 | G3 A3 B3 G3 | E4 E4 E4 E4 D4 C4 | B3 A3 G3';

// --- Amazing Grace (New Britain) in G, 3/4, pickup "A-": one 16-bar verse. ---
const GRACE = 'G3 B3 G3 | B3 A3 | G3 E3 | D3 D3 | G3 B3 G3 | B3 A3 | D4 | B3 | D4 B3 G3 | B3 A3 | G3 E3 | D3 D3 | G3 B3 G3 | B3 A3 | G3';
const GRACE_R = 'h e e | h q | h q | h q | h e e | h q | h. | h~ q | h e e | h q | h q | h q | h e e | h q | h.';

const SONGS: Expected[] = [
  {
    id: 'clementine',
    melody: 'Tune',
    notes: join('D3 D3', CLEM, 'D3 D3 D3', CLEM, 'D3 D3 D3', CLEM, 'D3 D3 D3', CLEM, 'D3'),
    rhythm: join('e e', CLEM_R, 'h e e', CLEM_R, 'h e e', CLEM_R, 'h e e', CLEM_R, 'h.'),
    chords: '1:D 4:A7 6:D 7:A7 8:D 12:A7 14:D 15:A7 16:D 20:A7 22:D 23:A7 24:D 28:A7 30:D 31:A7 32:D',
    implied: 'D',
    key: 'D major',
    scale: ['D', 'major'],
    range: ['A2', 'A3'],
    strong: ONE,
    ends: 'D',
    words: [
      'In a cav-ern, in a can-yon, ex-ca-vat-ing for a mine, dwelt a min-er, for-ty nin-er, and his daugh-ter Clem-en-tine.',
      CLEM_CHORUS,
      'Light she was, and like a fai-ry, and her shoes were num-ber nine, her-ring box-es, with-out top-ses, san-dals were for Clem-en-tine.',
      CLEM_CHORUS,
    ],
  },
  {
    id: 'drunken-sailor',
    melody: 'Tune',
    notes: join(SAILOR_CHORUS, SAILOR_VERSE, SAILOR_CHORUS),
    rhythm: join(SAILOR_CHORUS_R, SAILOR_VERSE_R, SAILOR_CHORUS_R),
    chords: '1:Em 5:D 9:Em 13:D 15:Em 17:Em 21:D 25:Em 29:D 31:Em 33:Em 37:D 41:Em 45:D 47:Em',
    key: 'E minor',
    scale: ['E', 'dorian'],
    range: ['D3', 'E4'],
    strong: ONE,
    ends: 'E',
    words: [`${WAY} ${WAY} ${WAY} ${MORNING}`, `${PUT} ${PUT} ${PUT} ${MORNING}`, `${WAY} ${WAY} ${WAY} ${MORNING}`],
  },
  {
    id: 'deck-the-halls',
    melody: 'Melody',
    notes: join(DECK_A, DECK_A, DECK_B, DECK_END),
    rhythm: join(DECK_A_R, DECK_A_R, DECK_B_R, DECK_A_R),
    chords:
      '1:G 2:C 2.3:G 3:D7 3.3:G 4:G 4.2:D7 4.3:G 5:G 6:C 6.3:G 7:D7 7.3:G 8:G 8.2:D7 8.3:G ' +
      '9:D7 10:G 10.3:D7 11:G 12:D7 13:G 14:C 14.3:G 15:C 15.3:G 16:G 16.2:D7 16.3:G',
    key: 'G major',
    scale: ['G', 'major'],
    // The raised fourth of the "fa la la" climb in line 3 (B C# D, leaning towards D).
    chromatic: ['11:C#4'],
    range: ['F#3', 'G4'],
    strong: FOUR,
    ends: 'G',
    words: [
      'Deck the halls with boughs of hol-ly, Fa la la la la, la la la la.',
      "'Tis the sea-son to be jol-ly, Fa la la la la, la la la la.",
      'Don we now our gay ap-par-el, Fa la la, la la la, la la la.',
      'Troll the an-cient Yule-tide car-ol, Fa la la la la, la la la la.',
    ],
  },
  {
    id: 'amazing-grace',
    melody: 'Tune',
    notes: join('D3', GRACE, 'D3', GRACE, ''),
    rhythm: join('q', GRACE_R, 'h~ q', GRACE_R, 'h~ qr'),
    chords: '1:G 3:C 4:G 7:D7 9:G 10:G7 11:C 12:G 13:Em 14:D7 15:G 17:G 19:C 20:G 23:D7 25:G 26:G7 27:C 28:G 29:Em 30:D7 31:G',
    implied: 'G',
    key: 'G major',
    scale: ['G', 'major-pentatonic'],
    range: ['D3', 'D4'],
    strong: ONE,
    ends: 'G',
    words: [
      'A-maz-ing grace, how sweet the sound that saved a wretch like me. I once was lost, but now am found, was blind, but now I see.',
      "'Twas grace that taught my heart to fear, and grace my fears re-lieved; how pre-cious did that grace ap-pear the hour I first be-lieved.",
    ],
  },
  {
    id: 'st-change-em-d-em-g',
    melody: 'Teacher',
    notes:
      'E4 B3 | G3 A3 B3 | A3 D4 | E4 D4 B3 | F#4 E4 D4 A3 | G3 B3 E4 B3 | A3 D4 B3 G3 | F#4 D4 E4 |' +
      'B3 G3 | E4 F#4 G4 | D4 B3 | E4 D4 B3 | G3 B3 D4 B3 | E4 D4 B3 G3 | D4 B3 E4 B3 | D4 G4 E4',
    rhythm:
      'h h | q q h | h h | q q h | q q q q | q q q q | q q q q | q q h |' +
      'h h | q q h | h h | q q h | q q q q | q q q q | q q q q | q q h',
    chords: '1:Em 3:D 4:Em 5:D 6:Em 7:D 7.3:Em 8:D 8.3:Em 9:Em 11:G 12:Em 13:G 14:Em 15:G 15.3:Em 16:G 16.3:Em',
    key: 'E minor',
    scale: ['E', 'minor'],
    range: ['G3', 'G4'],
    strong: FOUR,
    ends: 'E',
  },
  {
    id: 'st-change-d-a7-a-d',
    melody: 'Teacher',
    notes:
      'F#4 D4 | D4 E4 F#4 | E4 C#4 | D4 A3 | C#4 E4 G4 E4 | F#4 E4 D4 A3 | E4 C#4 D4 F#4 | G4 E4 D4 |' +
      'A3 D4 | F#4 E4 D4 | C#4 E4 | D4 F#4 A3 | E4 C#4 A3 C#4 | D4 E4 F#4 D4 | E4 C#4 D4 A3 | C#4 E4 D4',
    rhythm:
      'h h | q q h | h h | h h | q q q q | q q q q | q q q q | q q h |' +
      'h h | q q h | h h | q q h | q q q q | q q q q | q q q q | q q h',
    chords: '1:D 3:A7 4:D 5:A7 6:D 7:A7 7.3:D 8:A7 8.3:D 9:D 11:A 12:D 13:A 14:D 15:A 15.3:D 16:A 16.3:D',
    key: 'D major',
    scale: ['D', 'major'],
    range: ['A3', 'G4'],
    strong: FOUR,
    ends: 'D',
  },
  {
    id: 'st-strum-eighths',
    melody: 'Teacher',
    notes:
      'E4 B3 G3 B3 | E4 F#4 G4 | F#4 E4 D4 A3 | A3 D4 E4 | G4 E4 B3 | G3 A3 B3 E4 | F#4 D4 A3 D4 | D4 A3 |' +
      'B3 E4 B3 G3 | E4 D4 B3 | A3 D4 F#4 D4 | F#4 G4 A3 | G4 F#4 E4 B3 | G3 B3 | A3 D4 F#4 E4 | D4',
    rhythm:
      'q q q q | q q h | q q q q | h q q | h q q | q q q q | q q q q | h h |' +
      'q q q q | q q h | q q q q | q q h | q q q q | h h | q q q q | w',
    chords: '1:Em 3:D 5:Em 7:D 9:Em 11:D 13:Em 15:D',
    key: 'E minor',
    scale: ['E', 'minor'],
    range: ['G3', 'G4'],
    strong: FOUR,
    // An open ending on D over the D chord: the study loops back to Em.
    ends: 'D',
  },
  {
    id: 'st-strum-waltz',
    melody: 'Teacher',
    notes:
      'F#4 E4 | D4 A3 | C#4 E4 | G4 E4 | F#4 D4 | A3 D4 F#4 | E4 C#4 | A3 |' +
      'D4 E4 F#4 | F#4 D4 | G4 F#4 E4 | C#4 E4 | F#4 E4 D4 | D4 F#4 | E4 D4 C#4 | A3',
    rhythm: 'h q | h q | h q | h q | h q | q q q | h q | h. | q q q | h q | q q q | h q | q q q | h q | q q q | h.',
    chords: '1:D 3:A7 5:D 7:A7 9:D 11:A7 13:D 15:A7',
    key: 'D major',
    scale: ['D', 'major'],
    range: ['A3', 'G4'],
    strong: ONE,
    // A half close on A over A7: the study loops back to D.
    ends: 'A',
  },
  {
    id: 'st-read-first-c',
    melody: 'Your part',
    // Rewritten in review to be mostly stepwise, as the plan asks (the first version moved mostly
    // in thirds): a question to a half close on G, an answer home to C, a climb in three short
    // steps from string 3 to the top G, and the opening again with the closing cadence.
    notes:
      'E4 D4 E4 F4 | G4 E4 | F4 E4 D4 C4 | B3 G3 | A3 B3 C4 D4 | E4 C4 | D4 E4 F4 D4 | E4 D4 C4 |' +
      'A3 B3 C4 | D4 E4 F4 | E4 F4 G4 E4 | F4 D4 | E4 D4 E4 F4 | G4 E4 | D4 E4 F4 D4 | E4 C4',
    rhythm:
      'q q q q | h h | q q q q | h h | q q q q | h h | q q q q | q q h |' +
      'q q h | q q h | q q q q | h h | q q q q | h h | q q q q | h h',
    chords: '1:C 3:Dm 4:G 5:Am 6:C 7:Dm 7.3:G7 8:C 9:Am 10:Dm 11:C 12:G7 13:C 14.3:Am 15:G7 16:C',
    key: 'C major',
    scale: ['C', 'major'],
    range: ['G3', 'G4'],
    strong: FOUR,
    ends: 'C',
  },
];

/**
 * The chord shapes the repertoire plan names for each song (low string first). Chords not
 * listed (the teacher's chords in Deck the Halls) may use the engine's shape.
 */
const SHAPES: Record<string, Record<string, string>> = {
  clementine: { D: 'xx0232', A7: 'x02020' },
  'drunken-sailor': { Em: '022000', D: 'xx0232' },
  'amazing-grace': { G: '320003', C: 'x32010', D7: 'xx0212', G7: '320001', Em: '022000' },
  'st-change-em-d-em-g': { Em: '022000', D: 'xx0232', G: '320003' },
  'st-change-d-a7-a-d': { D: 'xx0232', A7: 'x02020', A: 'x02220' },
  'st-strum-eighths': { Em: '022000', D: 'xx0232' },
  'st-strum-waltz': { D: 'xx0232', A7: 'x02020' },
  'st-read-first-c': { C: 'x32010', Am: 'x02210', F: 'xx3211', Dm: 'xx0231', G: '320003', G7: '320001' },
};

/** Durations as written in SixTab. */
const DURATION: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };

function load(id: string, edit?: (text: string) => string): Song {
  const raw = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(edit ? edit(raw) : raw);
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, name: string): Track {
  const t = song.tracks.find((x) => x.name === name);
  if (!t) throw new Error(`no track "${name}" in ${song.meta.id}: ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

const struck = (b: Beat) => b.notes.filter((n) => !n.tie);
const name = (midi: number) => midiToNote(midi, { prefer: 'sharps' });
const pc = (note: string) => note.replace(/-?\d+$/, '');
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
/** A chord shape as written in SixTab, low string first: x02220. */
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
const hasPickup = (song: Song) => song.bars[0]?.length !== undefined;
/** The bar number a reader sees: 1-based, with a pickup counted as bar 0. */
const barNo = (song: Song, index: number) => (hasPickup(song) ? index : index + 1);

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** Every struck note of a track in written order, with where it sits. */
function notesOf(track: Track): Array<{ bar: number; tick: number; midi: number }> {
  return track.measures.flatMap((m, bar) => m.beats.flatMap((b) => struck(b).map((n) => ({ bar, tick: b.start, midi: n.midi }))));
}

/** The words of a track as sung: syllables ending in "-" join the next one. */
function wordsOf(track: Track): string {
  return track.measures
    .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
    .map((l) => (l.endsWith('-') ? l : `${l} `))
    .join('')
    .trim();
}

/**
 * The learner's part bar by bar, one token per beat: duration, then "D"/"U" for a strum
 * (slash), ":" and the note names for struck notes ("/D" when they are strummed down), "r" for
 * a rest; then "@" and the chord in force.
 */
function partOf(song: Song, trackName: string): string[] {
  return trackNamed(song, trackName).measures.map((m, bar) =>
    m.beats
      .map((b) => {
        const d = DURATION[b.duration] ?? `${b.duration}t`;
        const chord = chordAt(song, bar, b.start) ?? '-';
        if (b.slash) return `${d}${b.stroke === 'down' ? 'D' : b.stroke === 'up' ? 'U' : '/'}@${chord}`;
        if (!b.notes.length) return `${d}r@${chord}`;
        const names = [...b.notes].sort((x, y) => x.midi - y.midi).map((n) => name(n.midi)).join('+');
        return `${d}:${names}${b.stroke === 'down' ? '/D' : b.stroke === 'up' ? '/U' : ''}@${chord}`;
      })
      .join(' '),
  );
}

/** Letters only, lower case: for comparing the words above the chords with the sung words. */
const letters = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z]/g, '');

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 2: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);
  const n = (i: number) => barNo(song, i);

  it('sounds the expected notes, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.flatMap((b) => struck(b).map((x) => name(x.midi))));
    const expected = bars(want.notes);
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${n(i)}`).toEqual(expected[i]));
  });

  it('has the expected rhythm, bar by bar', () => {
    const got = melody.measures.map((m) =>
      m.beats.map((b) => (DURATION[b.duration] ?? `${b.duration}t`) + (b.notes.length === 0 ? 'r' : b.notes.every((x) => x.tie) ? '~' : '')),
    );
    const expected = bars(want.rhythm);
    expect(got.length).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: rhythm of bar ${n(i)}`).toEqual(expected[i]));
  });

  it('has the chord symbols it should, where it should, in the shapes the plan names', () => {
    const got = song.chords.map((c) => `${n(c.bar)}${c.tick ? `.${c.tick / PPQ + 1}` : ''}:${c.symbol}`).join(' ');
    expect(got).toBe(want.chords);
    const shapes = SHAPES[id] ?? {};
    for (const c of song.chords) {
      if (shapes[c.symbol]) expect(shape(c.voicing), `${id}: ${c.symbol} in bar ${n(c.bar)}`).toBe(shapes[c.symbol]);
      if (!c.voicing) continue;
      // The shape sounds exactly its chord: every chord tone, nothing else.
      const sounded = new Set(c.voicing.flatMap((f, i) => (f === null || f < 0 ? [] : [(STANDARD[i] + f) % 12])));
      expect([...sounded].sort((a, b) => a - b), `${id}: ${c.symbol}=${shape(c.voicing)}`).toEqual([...new Set(chordPcs(c.symbol))].sort((a, b) => a - b));
    }
  });

  it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
    const notes = notesOf(melody);
    const problems: string[] = [];
    notes.forEach((x, i) => {
      if (!want.strong.includes(x.tick)) return;
      const symbol = chordAt(song, x.bar, x.tick) ?? want.implied;
      if (!symbol) return problems.push(`bar ${n(x.bar)}: ${name(x.midi)} with no chord in force`);
      if (chordPcs(symbol).includes(x.midi % 12)) return;
      // A non-chord tone on a strong beat must move by step to the next note (passing note,
      // neighbour, appoggiatura): a wrong fret almost never does.
      const next = notes.slice(i + 1).find((y) => y.midi !== x.midi);
      const step = next ? Math.abs(next.midi - x.midi) : 99;
      if (step > 2) problems.push(`bar ${n(x.bar)}, tick ${x.tick}: ${name(x.midi)} over ${symbol} does not resolve by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key, scale and range, and ends where it should', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = scalePcs(want.scale[0], want.scale[1]);
    const notes = notesOf(melody);
    const outside = notes.filter((x) => !allowed.includes(x.midi % 12)).map((x) => `${n(x.bar)}:${name(x.midi)}`);
    expect(outside, `${id}: notes outside ${want.scale.join(' ')}`).toEqual(want.chromatic ?? []);
    const midis = notes.map((x) => x.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    expect(pc(name(midis[midis.length - 1])), `${id}: last note`).toBe(want.ends);
  });

  it('stays in first position, with fingers that match the frets', () => {
    for (const t of song.tracks) {
      for (const [bar, m] of t.measures.entries()) {
        for (const b of m.beats) {
          for (const x of b.notes) {
            expect(x.fret, `${id}: ${t.name} bar ${n(bar)} string ${x.string}`).toBeLessThanOrEqual(4);
            if (x.finger !== undefined) expect(x.finger, `${id}: ${t.name} bar ${n(bar)}: finger on fret ${x.fret}`).toBe(x.fret);
          }
        }
      }
    }
  });

  if (want.words) {
    it('carries the words the plan allows, one syllable per note', () => {
      expect(wordsOf(melody)).toBe(want.words!.join(' '));
    });
  }

  it('is a valid song with nothing to warn about', () => {
    expect(validateSong(song).map((i) => `${i.level}: ${i.message}`)).toEqual([]);
  });

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    // The learner plays the first track; the tune or the teacher's part is played by the app.
    const yours = estimateDifficulty(song, { track: 0 });
    const slow = estimateDifficulty(song, { track: 0, tempoPercent: 70 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(
      `${id}: level ${level}; your part ${yours.level} (${slow.level} at 70%), all tracks ${all.level}; ` +
        `${[...new Set([...yours.reasons, ...all.reasons])].join(' ') || 'no hard spots'}`,
    );
    expect(yours.level, `${id}: estimate ${yours.level} is far below level ${level}`).toBeGreaterThanOrEqual(level - 1);
    expect(yours.level, `${id}: estimate ${yours.level} is far above level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(level + 1);
  });
});

describe('batch 2: the learner parts, beat by beat', () => {
  it('clementine: waits out the pickup, then bass (D3 under D, A2 under A7), strum, strum', () => {
    const song = load('clementine');
    const line = ['D', 'D', 'D', 'A7', 'A7', 'D', 'A7', 'D'];
    const bass: Record<string, string> = { D: 'D3', A7: 'A2' };
    const expected = ['qr@-', ...Array.from({ length: 32 }, (_, i) => {
      const c = line[i % 8];
      return i === 31 ? `q:${bass[c]}@${c} hD@${c}` : `q:${bass[c]}@${c} qD@${c} qD@${c}`;
    })];
    expect(partOf(song, 'Your strum')).toEqual(expected);
  });

  it('drunken-sailor: two downstrums a bar in the first chorus, then down-up eighths, Em D Em D-Em', () => {
    const song = load('drunken-sailor');
    const line = [...rep(4, 'Em'), ...rep(4, 'D'), ...rep(4, 'Em'), 'D', 'D', 'Em', 'Em'];
    const expected = Array.from({ length: 48 }, (_, i) => {
      const c = line[i % 16];
      if (i < 16) return `qD@${c} qD@${c}`;
      if (i === 47) return `hD@${c}`;
      return `eD@${c} eU@${c} eD@${c} eU@${c}`;
    });
    expect(partOf(song, 'Your strum')).toEqual(expected);
  });

  it('amazing-grace: bass on beat 1 (the root), then down-up, down-up, through both verses', () => {
    const song = load('amazing-grace');
    const verse = ['G', 'G', 'C', 'G', 'G', 'G', 'D7', 'D7', 'G', 'G7', 'C', 'G', 'Em', 'D7', 'G', 'G'];
    const bass: Record<string, string> = { G: 'G2', G7: 'G2', C: 'C3', D7: 'D3', Em: 'E2' };
    const expected = ['qr@-', ...Array.from({ length: 32 }, (_, i) => {
      const c = verse[i % 16];
      return i === 31 ? `q:${bass[c]}@${c} hD@${c}` : `q:${bass[c]}@${c} eD@${c} eU@${c} eD@${c} eU@${c}`;
    })];
    expect(partOf(song, 'Your strum')).toEqual(expected);
  });

  const ladder = (home: string, other: string) => [
    `wD@${home}`,
    `wD@${home}`,
    `hD@${other} hD@${other}`,
    `hD@${home} hD@${home}`,
    `qD@${other} qD@${other} qD@${other} qD@${other}`,
    `qD@${home} qD@${home} qD@${home} qD@${home}`,
    `qD@${other} qD@${other} qD@${home} qD@${home}`,
    `qD@${other} qD@${other} qD@${home} qD@${home}`,
  ];

  it('st-change-em-d-em-g: the ladder for Em-D, then for Em-G, every change on a beat', () => {
    const expected = [...ladder('Em', 'D'), ...ladder('Em', 'G')];
    expected[15] = 'qD@G qD@G hD@Em';
    expect(partOf(load('st-change-em-d-em-g'), 'Your strum')).toEqual(expected);
  });

  it('st-change-d-a7-a-d: the ladder for D-A7, then for D-A, every change on a beat', () => {
    const expected = [...ladder('D', 'A7'), ...ladder('D', 'A')];
    expected[15] = 'qD@A qD@A hD@D';
    expect(partOf(load('st-change-d-a7-a-d'), 'Your strum')).toEqual(expected);
  });

  it('st-strum-eighths: down on every beat, up on every "and", Em and D two bars each, accents marked', () => {
    const song = load('st-strum-eighths');
    const chords = ['Em', 'Em', 'D', 'D'];
    const expected = Array.from({ length: 16 }, (_, i) => {
      const c = chords[i % 4];
      const eighths = rep(4, `eD@${c} eU@${c}`).join(' ');
      return i === 15 ? `eD@${c} eU@${c} eD@${c} eU@${c} hD@${c}` : eighths;
    });
    expect(partOf(song, 'Your strum')).toEqual(expected);
    // The accents on 2 and 4 are an instruction over bar 9 (a slash cannot carry an accent mark).
    expect(song.annotations.map((a) => `${a.bar + 1}:${a.text}`)).toContain('9:Accent beats 2 and 4');
  });

  it('st-strum-waltz: the bass note alone on beat 1, then two downstrums on strings 3 to 1 only', () => {
    const song = load('st-strum-waltz');
    const part: Record<string, string> = { D: 'q:D3@D q:A3+D4+F#4/D@D q:A3+D4+F#4/D@D', A7: 'q:A2@A7 q:G3+C#4+E4/D@A7 q:G3+C#4+E4/D@A7' };
    const chords = ['D', 'D', 'A7', 'A7'];
    const expected = Array.from({ length: 16 }, (_, i) => part[chords[i % 4]]);
    expected[15] = 'q:A2@A7 h:G3+C#4+E4/D@A7';
    expect(partOf(song, 'Your strum')).toEqual(expected);
    for (const m of trackNamed(song, 'Your strum').measures) {
      const [bass, ...strums] = m.beats;
      expect(bass.notes.map((x) => x.string)).toEqual([bass.notes[0].midi === 50 ? 4 : 5]);
      for (const s of strums) expect(s.notes.map((x) => x.string).sort()).toEqual([1, 2, 3]);
    }
  });
});

describe('batch 2: what the plan asks of each piece', () => {
  it('the words over the chords match the words of the tune (strum-and-sing songs)', () => {
    const skip = new Set(['Wait: the tune starts on beat 3', 'G7 (or G)', 'Em (or G)']);
    for (const id of ['clementine', 'drunken-sailor', 'amazing-grace']) {
      const song = load(id);
      const sheet = song.annotations.filter((a) => !skip.has(a.text)).map((a) => a.text).join(' ');
      expect(letters(sheet), id).toBe(letters(wordsOf(trackNamed(song, 'Tune'))));
    }
  });

  it('deck-the-halls: the teacher plays only G, C and D7, and the first F# is string 4, fret 4', () => {
    const song = load('deck-the-halls');
    expect([...new Set(song.chords.map((c) => c.symbol))].sort()).toEqual(['C', 'D7', 'G']);
    const fSharps = trackNamed(song, 'Melody').measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).filter((x) => x.midi % 12 === 6);
    expect(fSharps[0]).toMatchObject({ string: 4, fret: 4, midi: 54 });
    // Lines 1, 2 and 4 start on D at string 2, fret 3.
    for (const bar of [0, 4, 12]) expect(trackNamed(song, 'Melody').measures[bar].beats[0].notes[0]).toMatchObject({ string: 2, fret: 3 });
  });

  it('st-read-first-c: strings 3 to 1, open G to G at fret 3, quarters and halves, steps and small skips, all eight notes', () => {
    const song = load('st-read-first-c');
    const beats = trackNamed(song, 'Your part').measures.flatMap((m) => m.beats);
    expect(new Set(beats.map((b) => DURATION[b.duration]))).toEqual(new Set(['q', 'h']));
    expect(beats.every((b) => b.notes.length === 1 && !b.notes[0].tie)).toBe(true);
    const notes = beats.map((b) => b.notes[0]);
    expect(new Set(notes.map((x) => x.string))).toEqual(new Set([1, 2, 3]));
    expect([...new Set(notes.map((x) => name(x.midi)))].sort()).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G3', 'G4']);
    const leaps = notes.slice(1).map((x, i) => Math.abs(x.midi - notes[i].midi));
    expect(Math.max(...leaps), 'no skip wider than a fourth').toBeLessThanOrEqual(5);
    expect(leaps.filter((l) => l <= 4).length / leaps.length, 'mostly steps and thirds').toBeGreaterThan(0.85);
    // "Stepwise with small skips": most moves are to the next letter (1 or 2 semitones).
    expect(leaps.filter((l) => l >= 1 && l <= 2).length / leaps.length, 'mostly steps').toBeGreaterThanOrEqual(0.7);
    // Strings 3, 2 and 1 are all read: both string-3 notes appear.
    expect(notes.filter((x) => x.string === 3).map((x) => name(x.midi)).sort()).toEqual(['A3', 'A3', 'G3']);
  });

  it('deck-the-halls: the last fa-la-la repeats E four times, then steps down home (la la la la sol fa | mi re do)', () => {
    const song = load('deck-the-halls');
    const melody = trackNamed(song, 'Melody');
    const tail = melody.measures.slice(14).flatMap((m) => m.beats.flatMap((b) => struck(b).map((x) => name(x.midi))));
    expect(tail).toEqual(['E4', 'E4', 'E4', 'E4', 'D4', 'C4', 'B3', 'A3', 'G3']);
    // Open string 1 for the E's, then fingers 3 and 1 on string 2, and the open B, A (finger 2) and open G.
    const frets = melody.measures.slice(14).flatMap((m) => m.beats.flatMap((b) => b.notes.map((x) => `${x.string}:${x.fret}`)));
    expect(frets).toEqual(['1:0', '1:0', '1:0', '1:0', '2:3', '2:1', '2:0', '3:2', '3:0']);
  });
});

describe('batch 2: the cross-check catches a wrong fret', () => {
  it("Clementine's low C# one fret too low (string 5 fret 3 = C) fails the note list and the key", () => {
    const broken = load('clementine', (t) => t.replace('q 4:2 5:0 e 5:4 4:2', 'q 4:2 5:0 e 5:3 4:2'));
    const bar7 = trackNamed(broken, 'Tune').measures[7].beats.flatMap((b) => struck(b).map((x) => name(x.midi)));
    expect(bar7).not.toEqual(bars(SONGS[0].notes)[7]);
    expect(bar7[2]).toBe('C3');
    expect(scalePcs('D', 'major')).not.toContain(0);
  });

  it("Deck the Halls' first draft of line 4 (E E E D C. B | A A G, found in review) fails the note list", () => {
    const broken = load('deck-the-halls', (t) =>
      t.replace('"C" e 1:0 1:0 1:0 1:0 "G" q. 2:3 e 2:1 | "G" q 2:0 "D7" 3:2 "G" h 3:0', '"C" e 1:0 1:0 1:0 2:3 q. 2:1 e 2:0 | "D7" q 3:2 3:2 "G" h 3:0'),
    );
    const got = trackNamed(broken, 'Melody').measures.slice(14).map((m) => m.beats.flatMap((b) => struck(b).map((x) => name(x.midi))));
    expect(got).toEqual([['E4', 'E4', 'E4', 'D4', 'C4', 'B3'], ['A3', 'A3', 'G3']]);
    expect(got).not.toEqual(bars(SONGS[2].notes).slice(14));
  });

  it("Deck the Halls' F# one fret too low (string 4 fret 3 = F) fails the note list", () => {
    const broken = load('deck-the-halls', (t) => t.replace('4:4{4}', '4:3{3}'));
    const bar4 = trackNamed(broken, 'Melody').measures[3].beats.flatMap((b) => struck(b).map((x) => name(x.midi)));
    expect(bar4).toEqual(['G3', 'F3', 'G3']);
    expect(bar4).not.toEqual(bars(SONGS[2].notes)[3]);
  });
});
