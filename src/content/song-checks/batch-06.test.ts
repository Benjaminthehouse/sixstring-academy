/**
 * Batch 6 cross-checks: greensleeves-melody, fur-elise-theme, st-read-first-g, st-duet-round.
 *
 * The expected notes below were written out by hand as note names, from the tunes as commonly
 * known and printed (Greensleeves, the A section of Für Elise) and from the composition plans of
 * the two original studies, not copied from the tab. Each song is parsed with the song core and
 * compared bar by bar, so a wrong fret shows up as a wrong note name in a named bar. Also checked:
 * rhythm, chord symbols and shapes, notes on strong beats against the chord in force, key and
 * range, first-position frets and fingers, the words, the plan's specific demands (F# kept in
 * Greensleeves, G# in the E chords, the D# neighbour in Für Elise, F# on string 4 fret 4 and
 * string 1 fret 2 in the reading study, the round's two-bar entry and its intervals), and the
 * core's difficulty estimate against the level in meta.ts.
 *
 * The other six ids of the batch (danny-boy, loch-lomond, shenandoah, simple-gifts,
 * all-through-the-night, the-ash-grove) were left out on purpose: no printed source could be
 * consulted and the tunes could not be written note for note with certainty.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, type Beat, type Song, type Track } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;
const STANDARD = [40, 45, 50, 55, 59, 64];

/** What one song should contain, written out by hand. */
interface Expected {
  id: string;
  /** The melody track checked (the learner's part). */
  melody: string;
  /** Sounding pitches of every struck melody note, bar by bar ("|" between bars), as written (repeats not unrolled). */
  notes: string;
  /** Duration of every beat, bar by bar: w h. h q. q e. e s, with "r" for a rest. */
  rhythm: string;
  /** Chord events as written, "bar:symbol" or "bar@tick:symbol" (bars 1-based, a pickup is bar 1). */
  chords: string;
  /** Harmony assumed where no chord symbol is in force yet (an unaccompanied opening). */
  implied?: string;
  /** The key as "tonic mode". */
  key: string;
  /** Pitch classes the melody may use (names), and those that are chromatic neighbours only. */
  pitches: string[];
  neighbours?: string[];
  /** Lowest and highest melody note. */
  range: [string, string];
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
  /** Bars (1-based) whose first beat is a pickup and is not checked against the harmony. */
  pickupBars?: number[];
  /** The note the tune ends on (pitch class). */
  ends: string;
  /** Words of the melody track as sung, syllables joined by hyphens. */
  words?: string[];
}

const SONGS: Expected[] = [
  {
    id: 'greensleeves-melody',
    melody: 'Melody',
    // The Elizabethan tune in A minor, pickup A. Verse: two 4-bar lines, the second ending
    // C. B A G#. F# G# | A. Refrain: G. G. F# E | D B G. A B | C A A. G# A | B G# E., then the
    // same with the verse's close. The sixth degree is F# everywhere; the seventh is G# at the
    // cadences and G in the descending bars over G.
    notes:
      'A3 | C4 D4 E4 F#4 E4 | D4 B3 G3 A3 B3 | C4 A3 A3 G#3 A3 | B3 G#3 E3 A3 |' +
      'C4 D4 E4 F#4 E4 | D4 B3 G3 A3 B3 | C4 B3 A3 G#3 F#3 G#3 | A3 |' +
      'G4 G4 F#4 E4 | D4 B3 G3 A3 B3 | C4 A3 A3 G#3 A3 | B3 G#3 E3 |' +
      'G4 G4 F#4 E4 | D4 B3 G3 A3 B3 | C4 B3 A3 G#3 F#3 G#3 | A3',
    rhythm:
      'e | q e e. s e | q e e. s e | q e e. s e | q e q e |' +
      'q e e. s e | q e e. s e | e. s e e. s e | h. |' +
      'q. e. s e | q e e. s e | q e e. s e | q e q. |' +
      'q. e. s e | q e e. s e | e. s e e. s e | h.',
    chords: '2:Am 3:G 4:Am 5:E 6:Am 7:G 8:Am 8@1440:E 9:Am 10:C 11:G 12:Am 13:E 14:C 15:G 16:Am 16@1440:E 17:Am',
    key: 'A minor',
    pitches: ['A', 'B', 'C', 'D', 'E', 'F#', 'G', 'G#'],
    range: ['E3', 'G4'],
    strong: [0, 3 * (PPQ / 2)],
    pickupBars: [1],
    ends: 'A',
    words: [
      'A-las, my love, you do me wrong, to cast me off dis-cour-teous-ly. For I have loved you well and long, de-light-ing in your com-pa-ny.',
      'Green-sleeves was all my joy, and Green-sleeves was my de-light. Green-sleeves was my heart of gold, and who but my la-dy Green-sleeves.',
    ],
  },
  {
    id: 'fur-elise-theme',
    melody: 'Melody',
    // Beethoven's right hand an octave down: the pickup E D#, the rocking bar, then answers of
    // A + C E A, B + E G# B, C + E E D#; the rocking bar again, A + C E A, B + E C B; first ending
    // A + E D# (back to the rocking bar), second ending the final A.
    notes: 'E4 D#4 | E4 D#4 E4 B3 D4 C4 | A3 C3 E3 A3 | B3 E3 G#3 B3 | C4 E3 E4 D#4 | E4 D#4 E4 B3 D4 C4 | A3 C3 E3 A3 | B3 E3 C4 B3 | A3 E4 D#4 | A3',
    rhythm: 's s | s s s s s s | e sr s s s | e sr s s s | e sr s s s | s s s s s s | e sr s s s | e sr s s s | e er s s | q.',
    chords: '3:Am 4:E 5:Am 7:Am 8:E 9:Am 10:Am',
    implied: 'E',
    key: 'A minor',
    pitches: ['A', 'B', 'C', 'D', 'E', 'F', 'G#'],
    neighbours: ['D#'],
    range: ['C3', 'E4'],
    strong: [0],
    pickupBars: [1],
    ends: 'A',
  },
  {
    id: 'st-read-first-g',
    melody: 'Your part',
    // The composition plan: G arpeggio up from string 6, down by step to D; Am arpeggio; a
    // stepwise fall to A (half close). The answer: the same first bar, C with a turn, D7 down to
    // C, home on B and G. Bars 9-12 = bars 1-4 an octave higher. Then G4 down to G2.
    notes:
      'G2 B2 D3 G3 | F#3 E3 D3 | E3 C3 A2 C3 | D3 C3 B2 A2 |' +
      'G2 B2 D3 G3 | E3 C3 D3 E3 G3 | A3 F#3 E3 D3 C3 | B2 G2 |' +
      'G3 B3 D4 G4 | F#4 E4 D4 | E4 C4 A3 C4 | D4 C4 B3 A3 |' +
      'G4 F#4 E4 D4 B3 | C4 B3 A3 G3 E3 | F#3 D3 C3 A2 | G2',
    rhythm:
      'q q q q | q q h | q q q q | e e q h |' +
      'q q q q | q e e q q | q q e e q | h h |' +
      'q q q q | q q h | q q q q | e e q h |' +
      'q e e q q | q e e q q | q q q q | w',
    chords: '1:G 2:D 3:Am 4:D 5:G 6:C 7:D7 8:G 9:G 10:D 11:Am 12:D 13:G 14:C 15:D7 16:G',
    key: 'G major',
    pitches: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
    range: ['G2', 'G4'],
    strong: [0, 2 * PPQ],
    ends: 'G',
  },
  {
    id: 'st-duet-round',
    melody: 'You (first voice)',
    // Four segments (G bar, D bar): S1 B C B G | A B A F#; S2 D G | F#; S3 B C B A B C D B |
    // A B C B A G F# A; S4 G D | D F#. Twice through, then B | A | G.
    notes:
      'B3 C4 B3 G3 | A3 B3 A3 F#3 | D4 G4 | F#4 | B3 C4 B3 A3 B3 C4 D4 B3 | A3 B3 C4 B3 A3 G3 F#3 A3 | G3 D3 | D3 F#3 |' +
      'B3 C4 B3 G3 | A3 B3 A3 F#3 | D4 G4 | F#4 | B3 C4 B3 A3 B3 C4 D4 B3 | A3 B3 C4 B3 A3 G3 F#3 A3 | G3 D3 | D3 F#3 |' +
      'B3 | A3 | G3',
    rhythm:
      'q q q q | q q q q | h h | w | e e e e e e e e | e e e e e e e e | h h | h h |' +
      'q q q q | q q q q | h h | w | e e e e e e e e | e e e e e e e e | h h | h h |' +
      'w | w | w',
    chords: '1:G 2:D 3:G 4:D 5:G 6:D 7:G 8:D 9:G 10:D 11:G 12:D 13:G 14:D 15:G 16:D 17:G 18:D 19:G',
    key: 'G major',
    pitches: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
    range: ['D3', 'G4'],
    strong: [0, 2 * PPQ],
    ends: 'G',
  },
];

/** Plan shapes for the chord symbols the batch uses, with the notes each should sound (low to high). */
const SHAPES: Record<string, string> = {
  'Am=x02210': 'A2 E3 A3 C4 E4',
  'G=320003': 'G2 B2 D3 G3 B3 G4',
  'E=022100': 'E2 B2 E3 G#3 B3 E4',
  'C=x32010': 'C3 E3 G3 C4 E4',
  'D=xx0232': 'D3 A3 D4 F#4',
  'D7=xx0212': 'D3 A3 C4 F#4',
};

const DURATION: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };

function load(id: string): Song {
  const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(text);
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
const pc = (note: string) => noteToMidi(`${note}4`) % 12;
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
/** Note names compared by pitch (so "Gb3" and "F#3" are the same). */
const canon = (names: string[]) => names.map((n) => name(noteToMidi(n)));

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** Every struck note of a track in written order, with where it sits. */
function notesOf(track: Track): Array<{ bar: number; tick: number; midi: number; string: number; fret: number; finger?: number | 'T' }> {
  return track.measures.flatMap((m, bar) =>
    m.beats.flatMap((b) => struck(b).map((n) => ({ bar, tick: b.start, midi: n.midi, string: n.string, fret: n.fret, finger: n.finger }))),
  );
}

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 6: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);

  it('sounds the expected notes, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.flatMap((b) => struck(b).map((n) => name(n.midi))));
    const expected = bars(want.notes).map(canon);
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the expected rhythm, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.map((b) => (DURATION[b.duration] ?? `${b.duration}t`) + (b.notes.length === 0 ? 'r' : '')));
    const expected = bars(want.rhythm);
    expect(got.length).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: rhythm of bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the chord symbols it should, where it should, with the plan shapes', () => {
    const got = song.chords.map((c) => `${c.bar + 1}${c.tick ? `@${c.tick}` : ''}:${c.symbol}`).join(' ');
    expect(got).toBe(want.chords);
    for (const c of song.chords) {
      if (!c.voicing) continue;
      const key = `${c.symbol}=${shape(c.voicing)}`;
      expect(Object.keys(SHAPES), `${id}: bar ${c.bar + 1}: ${key} is not a plan shape`).toContain(key);
      const sounds = c.voicing.flatMap((f, i) => (f === null || f < 0 ? [] : [STANDARD[i] + f])).map(name);
      expect(sounds, `${id}: ${key} sounds`).toEqual(canon(SHAPES[key].split(' ')));
      expect(sounds.every((n) => chordPcs(c.symbol).includes(noteToMidi(n) % 12)), `${key} sounds only ${c.symbol}`).toBe(true);
    }
  });

  it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
    const notes = notesOf(melody);
    const problems: string[] = [];
    notes.forEach((n, i) => {
      if (!want.strong.includes(n.tick) || want.pickupBars?.includes(n.bar + 1)) return;
      const symbol = chordAt(song, n.bar, n.tick) ?? want.implied;
      if (!symbol) return problems.push(`bar ${n.bar + 1}: ${name(n.midi)} with no chord in force`);
      if (chordPcs(symbol).includes(n.midi % 12)) return;
      // A non-chord tone on a strong beat must resolve by step (passing note, neighbour,
      // appoggiatura): a wrong fret almost never does.
      const next = notes.slice(i + 1).find((x) => x.midi !== n.midi);
      const step = next ? Math.abs(next.midi - n.midi) : 99;
      if (step > 2) problems.push(`bar ${n.bar + 1}, tick ${n.tick}: ${name(n.midi)} over ${symbol} does not resolve by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key and range, and ends on the tonic', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = want.pitches.map(pc);
    const notes = notesOf(melody);
    const neighbours = (want.neighbours ?? []).map(pc);
    const outside = notes.filter((n) => !allowed.includes(n.midi % 12) && !neighbours.includes(n.midi % 12)).map((n) => `bar ${n.bar + 1}: ${name(n.midi)}`);
    expect(outside, `${id}: notes outside the key`).toEqual([]);
    // A chromatic neighbour moves by a half step to a note of the key, in the order it is played
    // (the first ending's D# goes back to the E at the top of the repeat).
    const played = flattenSong(song).trackBeats(melody.id).flatMap((b) => b.notes.filter((n) => !n.tie).map((n) => ({ midi: n.midi, bar: b.bar })));
    played.forEach((n, i) => {
      if (!neighbours.includes(n.midi % 12)) return;
      const next = played[i + 1];
      expect(next && Math.abs(next.midi - n.midi), `${id}: bar ${n.bar + 1}: ${name(n.midi)} is a neighbour and moves by a half step`).toBe(1);
      expect(allowed, `${id}: bar ${n.bar + 1}: the neighbour resolves into the key`).toContain(next.midi % 12);
    });
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(canon(want.range));
    expect(midis[midis.length - 1] % 12, `${id}: last note`).toBe(pc(want.ends));
  });

  it('stays in first position, with fingers that match the frets', () => {
    for (const t of song.tracks) {
      for (const n of notesOf(t)) {
        expect(n.fret, `${id}: ${t.name} bar ${n.bar + 1} string ${n.string}`).toBeLessThanOrEqual(4);
        if (n.finger !== undefined) expect(n.finger, `${id}: ${t.name} bar ${n.bar + 1}: finger on fret ${n.fret}`).toBe(n.fret);
      }
    }
  });

  if (want.words) {
    it('carries the words', () => {
      const text = melody.measures
        .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
        .map((l) => (l.endsWith('-') ? l : `${l} `))
        .join('')
        .trim();
      expect(text).toBe(want.words!.join(' '));
    });
  }

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    const yours = estimateDifficulty(song, { track: 0 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; your part ${yours.level} (score ${yours.score}), all tracks ${all.level}; ${yours.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(yours.level - level), `${id}: estimate ${yours.level} vs level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(1);
  });
});

describe('batch 6: greensleeves-melody, what the plan asks for', () => {
  const song = load('greensleeves-melody');
  const notes = notesOf(trackNamed(song, 'Melody'));

  it('keeps the sixth degree as F# everywhere (never F)', () => {
    expect(notes.filter((n) => n.midi % 12 === pc('F')).map((n) => `bar ${n.bar + 1}`)).toEqual([]);
    expect(notes.filter((n) => n.midi % 12 === pc('F#')).length).toBeGreaterThan(0);
  });

  it('uses G#, never G, wherever the E chord is in force', () => {
    const overE = notes.filter((n) => chordAt(song, n.bar, n.tick) === 'E' && [pc('G'), pc('G#')].includes(n.midi % 12));
    expect(overE.length).toBeGreaterThan(0);
    expect(overE.filter((n) => n.midi % 12 === pc('G')).map((n) => `bar ${n.bar + 1}`)).toEqual([]);
  });

  it('is in 6/8 with a one-eighth pickup, and the teacher strums each chord on the two dotted-quarter beats', () => {
    expect(song.bars[0].length).toBe(PPQ / 2);
    expect(song.bars.every((b) => b.time.numerator === 6 && b.time.denominator === 8)).toBe(true);
    const strum = trackNamed(song, 'Teacher');
    expect(strum.role).toBe('rhythm');
    strum.measures.forEach((m, bar) => {
      if (bar === 0) return expect(m.beats.every((b) => !b.slash)).toBe(true);
      const starts = m.beats.filter((b) => b.slash).map((b) => b.start);
      expect(starts, `bar ${bar + 1}`).toEqual(bar === 8 || bar === 16 ? [0] : [0, 1440]);
    });
  });
});

describe('batch 6: fur-elise-theme, what the plan asks for', () => {
  const song = load('fur-elise-theme');
  const melody = trackNamed(song, 'Melody');

  it('opens E D# E D# E B D C A on the frets the plan names', () => {
    const opening = notesOf(melody).slice(0, 9).map((n) => `${name(n.midi)}=${n.string}:${n.fret}`);
    expect(opening).toEqual(['E4=1:0', 'D#4=2:4', 'E4=1:0', 'D#4=2:4', 'E4=1:0', 'B3=2:0', 'D4=2:3', 'C4=2:1', 'A3=3:2']);
  });

  it('answers with Am (A C E) and E (E G# B) arpeggios, with G# and never G', () => {
    const notes = notesOf(melody);
    expect(notes.some((n) => n.midi % 12 === pc('G'))).toBe(false);
    const g = notes.filter((n) => n.midi % 12 === pc('G#'));
    expect(g.map((n) => `${n.string}:${n.fret}`)).toEqual(['3:1']);
    for (const [bar, chord] of [[2, 'Am'], [3, 'E'], [6, 'Am']] as const) {
      const answer = melody.measures[bar].beats.slice(2).flatMap((b) => struck(b).map((n) => n.midi % 12));
      expect(answer.every((p) => chordPcs(chord).includes(p)), `bar ${bar + 1} outlines ${chord}`).toBe(true);
    }
  });

  it('plays the A section twice: first ending back to the top, second ending on A', () => {
    const tl = flattenSong(song);
    const played = tl.trackBeats(melody.id).flatMap((b) => b.notes.filter((n) => !n.tie).map((n) => name(n.midi)));
    const once = 'E4 D#4 E4 B3 D4 C4 A3 C3 E3 A3 B3 E3 G#3 B3 C4 E3 E4 D#4 E4 D#4 E4 B3 D4 C4 A3 C3 E3 A3 B3 E3 C4 B3';
    expect(played.join(' ')).toBe(`E4 D#4 ${once} A3 E4 D#4 ${once} A3`);
    expect(song.bars.every((b) => b.time.numerator === 3 && b.time.denominator === 8)).toBe(true);
    // 3/8 at an eighth = 120 is a quarter = 60.
    expect(song.tempo[0].bpm).toBe(60);
  });
});

describe('batch 6: st-read-first-g, what the plan asks for', () => {
  const song = load('st-read-first-g');
  const notes = notesOf(trackNamed(song, 'Your part'));

  it('is 16 bars of 4/4 in G, with eighth notes', () => {
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 4 && b.time.denominator === 4 && !b.length)).toBe(true);
    expect(trackNamed(song, 'Your part').measures.some((m) => m.beats.some((b) => b.duration === PPQ / 2))).toBe(true);
  });

  it('runs from G on string 6 fret 3 to G on string 1 fret 3, over all six strings', () => {
    const low = notes.reduce((a, b) => (b.midi < a.midi ? b : a));
    const high = notes.reduce((a, b) => (b.midi > a.midi ? b : a));
    expect(`${low.string}:${low.fret}`).toBe('6:3');
    expect(`${high.string}:${high.fret}`).toBe('1:3');
    expect([...new Set(notes.map((n) => n.string))].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has F# only on string 4 fret 4 and string 1 fret 2 (both used), and no F natural', () => {
    const fs = notes.filter((n) => n.midi % 12 === pc('F#'));
    expect([...new Set(fs.map((n) => `${n.string}:${n.fret}`))].sort()).toEqual(['1:2', '4:4']);
    expect(notes.some((n) => n.midi % 12 === pc('F'))).toBe(false);
  });

  it('repeats bars 1-4 an octave higher in bars 9-12', () => {
    const at = (from: number, to: number) => notes.filter((n) => n.bar >= from && n.bar < to);
    expect(at(8, 12).map((n) => n.midi)).toEqual(at(0, 4).map((n) => n.midi + 12));
    expect(at(8, 12).every((n) => n.string <= 3)).toBe(true);
    expect(at(0, 4).every((n) => n.string >= 3)).toBe(true);
  });
});

describe('batch 6: st-duet-round, what the plan asks for', () => {
  const song = load('st-duet-round');
  const you = trackNamed(song, 'You (first voice)');
  const teacher = trackNamed(song, 'Teacher (second voice)');
  const tune = (t: Track, from: number, to: number) => t.measures.slice(from, to).map((m) => m.beats.map((b) => `${DURATION[b.duration]}${struck(b).map((n) => n.midi).join('+') || 'r'}`));

  it('is an 8-bar tune that alternates G and D, played twice by you and entered two bars later by the teacher', () => {
    expect(tune(you, 0, 8)).toEqual(tune(you, 8, 16));
    expect(tune(teacher, 2, 18)).toEqual(tune(you, 0, 16));
    expect(teacher.measures.slice(0, 2).every((m) => m.beats.every((b) => !b.notes.length))).toBe(true);
    for (let bar = 0; bar < 18; bar++) expect(chordAt(song, bar, 0), `bar ${bar + 1}`).toBe(bar % 2 === 0 ? 'G' : 'D');
    expect(chordAt(song, 18, 0)).toBe('G');
  });

  it('stays on strings 4 to 1 in first position, in both parts', () => {
    for (const t of [you, teacher]) for (const n of notesOf(t)) expect(n.string <= 4 && n.fret <= 4, `${t.name} bar ${n.bar + 1}`).toBe(true);
  });

  it('sounds a third, a sixth or a fifth between the parts on every beat 1 and 3, with no parallel fifths or octaves', () => {
    const tl = flattenSong(song);
    const sounding = (t: Track, tick: number) => {
      const b = tl.trackBeats(t.id).filter((x) => x.tick <= tick && x.notes.length).pop();
      return b && b.tick + b.duration > tick ? b.notes[0].midi : null;
    };
    const problems: string[] = [];
    let strongChecked = 0;
    let prev: { a: number; b: number; iv: number } | null = null;
    for (let tick = 0; tick < tl.totalTicks; tick += PPQ / 2) {
      const a = sounding(you, tick);
      const b = sounding(teacher, tick);
      if (a === null || b === null) {
        prev = null;
        continue;
      }
      const iv = Math.abs(a - b) % 12;
      const bar = Math.floor(tick / (4 * PPQ));
      if (tick % (2 * PPQ) === 0) strongChecked++;
      if (tick % (2 * PPQ) === 0 && ![3, 4, 7, 8, 9].includes(iv)) problems.push(`bar ${bar + 1} beat ${((tick / PPQ) % 4) + 1}: ${name(a)} against ${name(b)}`);
      if (prev && (iv === 0 || iv === 7) && prev.iv === iv && (prev.a !== a || prev.b !== b)) problems.push(`bar ${bar + 1}: parallel ${iv ? 'fifths' : 'octaves'}`);
      prev = { a, b, iv };
    }
    // Both parts sound from bar 3 to bar 19: 17 bars, two strong beats each.
    expect(strongChecked).toBe(34);
    expect(problems).toEqual([]);
  });
});

describe('batch 6: the cross-check catches a wrong fret', () => {
  it('an open G for the G# in Für Elise (string 3 fret 0 instead of fret 1) fails the note list and the key', () => {
    const text = readFileSync(new URL('../songs/fur-elise-theme/song.sixtab', import.meta.url), 'utf8');
    const broken = parseSixTab(text.replace('3:1{1}', '3:0')).song!;
    const bar4 = broken.tracks[0].measures[3].beats.flatMap((b) => struck(b).map((n) => name(n.midi)));
    expect(bar4).not.toEqual(bars(SONGS.find((s) => s.id === 'fur-elise-theme')!.notes)[3]);
    expect(bar4).toContain('G3');
  });

  it('a C# for the C in the reading study (string 2 fret 2 instead of fret 1) fails the note list', () => {
    const text = readFileSync(new URL('../songs/st-read-first-g/song.sixtab', import.meta.url), 'utf8');
    const broken = parseSixTab(text.replace('2:1{1}', '2:2{2}')).song!;
    const bar11 = broken.tracks[0].measures[10].beats.flatMap((b) => struck(b).map((n) => name(n.midi)));
    expect(bar11).toEqual(['E4', 'C#4', 'A3', 'C4']);
    expect(bar11).not.toEqual(bars(SONGS.find((s) => s.id === 'st-read-first-g')!.notes)[10]);
  });
});
