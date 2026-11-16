/**
 * Batch 4 cross-checks. Each song in src/content/songs/<id>/ is parsed with the song core and its
 * melody is compared, bar by bar and note by note (pitch and length), with a list written out
 * here by hand from the tune as it is commonly printed: the keyboard right hand for the minuet,
 * the violins for Mozart, the familiar C major version for Brahms, the hymnal voice part for the
 * carol. The test moves those lists into the arrangement's key and octave itself, so a wrong fret
 * and a wrong transposition both show up as a wrong note name in a named bar. Also checked: the
 * harmony on strong beats, key, scale and range, fingerings, the plan's chord shapes, the strum
 * parts, the words, and the core's difficulty estimate against the level in meta.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, validateSong, type Beat, type Song, type Track } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { checkVoicingFingering, identifyFretted } from '@/core/guitar';
import { songEntry } from '@/content/songs';

const PPQ = 960;
const LEN: Record<string, number> = { w: 4 * PPQ, h: 2 * PPQ, q: PPQ, e: PPQ / 2, s: PPQ / 4 };

/** One written beat: a pitch (null for a rest), its length in ticks, and whether it is tied over. */
interface Written {
  midi: number | null;
  ticks: number;
  tie: boolean;
}

/** What one song should contain, written out by hand. */
interface Expected {
  id: string;
  /** The track that carries the tune. */
  melody: string;
  /**
   * The tune bar by bar ("|" between bars, the pickup counts as a bar): pitch then length, e.g.
   * `D5q G4e`, `re` for an eighth rest, `~D4h.` for a note tied over from the bar before.
   */
  tune: string;
  /** Semitones from the printed form to the arrangement's sounding pitch. */
  shift: number;
  /** Chord in force on every strong beat, bar by bar ("-" where none is in force). */
  harmony?: string;
  /** Bars (0-based, pickup = 0) whose strong beats the harmony check skips. */
  skipHarmony?: number[];
  key: string;
  /** The scale the tune keeps to, plus any notes allowed outside it (pitch classes as names). */
  scale: [string, string, string[]?];
  range: [string, string];
  /** Strong beats as ticks from the bar line. */
  strong: number[];
  /** The first bar is a pickup (an upbeat, not a strong beat). */
  pickup?: boolean;
  /** The written bars that repeat, as [first, last] (0-based), and the bars heard in total. */
  repeats?: { spans: Array<[number, number]>; played: number };
  words?: string;
  /** Exact chord shapes for each symbol, low string first (the plan's voicings). */
  shapes?: Record<string, string>;
  /** Fret limits and finger rules for the lead part: position (finger 1's fret) by bar. */
  position: (bar: number, beat: number) => number;
  /** Bars where frets above 4 are expected (0-based). */
  highBars?: number[];
}

const MINUET =
  // First half (bars 1-16), as printed for the keyboard's right hand.
  'D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q |' +
  'C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | F#4q G4e A4e B4e G4e | A4h. |' +
  'D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q |' +
  'C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | A4q B4e A4e G4e F#4e | G4h. |' +
  // Second half (bars 17-32): up to the high B, through D major (C#), and home.
  'B5q G5e A5e B5e G5e | A5q D5e E5e F#5e D5e | G5q E5e F#5e G5e D5e | C#5q B4e C#5e A4q |' +
  'A4e B4e C#5e D5e E5e F#5e | G5q F#5q E5q | F#5q A4q C#5q | D5h. |' +
  'D5q G4e F#4e G4q | E5q G4e F#4e G4q | D5q C5q B4q | A4e G4e F#4e G4e A4q |' +
  'D4e E4e F#4e G4e A4e B4e | C5q B4q A4q | B4e D5e G4q F#4q | G4h.';

const NACHTMUSIK =
  // Bars 1-4 of K. 525 as the first violins play them (the whole orchestra in octaves).
  'G4q re D4e G4q re D4e | G4e D4e G4e B4e D5q rq | C5q re A4e C5q re A4e | C5e A4e F#4e A4e D4q rq';

const BRAHMS =
  // The lullaby as commonly printed in C major (pickup, then 16 bars).
  'E4e E4e | G4h E4e E4e | G4h E4e G4e | C5q B4q. A4e | A4q G4q D4e E4e |' +
  'F4q D4q D4e E4e | F4h D4e F4e | B4e A4e G4q B4q | C5h C4e C4e |' +
  'C5h A4e F4e | G4h E4e C4e | F4q G4q A4q | G4h C4e C4e |' +
  'C5h A4e F4e | G4h E4e C4e | F4q E4q D4q | C4h.';

const ADESTE =
  // Adeste Fideles as a hymnal prints the voice part in G (pickup, then 20 bars).
  'G4q | G4h D4q G4q | A4h D4h | B4q A4q B4q C5q | B4h A4q G4q |' +
  'G4h F#4q E4q | F#4q G4q A4q B4q | F#4h E4q. D4e | ~D4h. rq |' +
  'D5h C5q B4q | C5h B4h | A4q B4q G4q A4q | F#4q. E4e D4q G4q |' +
  'G4q F#4q G4q A4q | G4h D4q B4q | B4q A4q B4q C5q | B4h A4q B4q |' +
  'C5q B4q A4q G4q | F#4h G4q C5q | B4h A4q. G4e | ~G4h. rq';

const firstPosition = () => 1;

const SONGS: Expected[] = [
  {
    id: 'minuet-in-g-melody',
    melody: 'Melody',
    tune: MINUET,
    shift: -12, // guitar sounds an octave below the keyboard part it reads
    // No chord symbols (a single line); the first half's harmony, read from its bass, on beat 1.
    harmony: 'G | G | C | G | Am | G | D | D | G | G | C | G | Am | G | D | G',
    key: 'G major',
    scale: ['G', 'major', ['C#']],
    range: ['D3', 'B4'],
    strong: [0],
    repeats: { spans: [[0, 15], [16, 31]], played: 64 },
    // Bar 17 and the first note of bar 18 in fifth position, everything else in first.
    position: (bar, beat) => (bar === 16 || (bar === 17 && beat === 0) ? 5 : 1),
    highBars: [16, 17],
  },
  {
    id: 'eine-kleine-nachtmusik',
    melody: 'Melody',
    tune: NACHTMUSIK,
    shift: -12,
    // The orchestra plays in octaves here; the notes spell G, then D7.
    harmony: 'G G | G G | D7 D7 | D7 D7',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['D3', 'D4'],
    strong: [0, 2 * PPQ],
    position: firstPosition,
  },
  {
    id: 'brahms-lullaby',
    melody: 'Melody',
    tune: BRAHMS,
    shift: -5, // C major down a fourth to G major: the tune then runs from G3 to G4
    harmony: '- | G | G | D7 | G | D7 | D7 | D7 | G | C | G | D7 | G | C | G | D7 | G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'G4'],
    strong: [0],
    pickup: true,
    shapes: { G: '320003', D7: 'xx0212', C: 'x32010' },
    position: firstPosition,
  },
  {
    id: 'o-come-all-ye-faithful',
    melody: 'Tune',
    tune: ADESTE,
    shift: -12,
    harmony:
      '- | G G | D D | G G | G D | Em D | D D | D D | D D | G G | C G | Am Em | D D |' +
      'G G | G G | Em Em | G D | C Am | D C | G D | G G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['D3', 'D4'],
    strong: [0, 2 * PPQ],
    pickup: true,
    shapes: { G: '320003', C: 'x32010', D: 'xx0232', Em: '022000', Am: 'x02210' },
    words:
      'O come, all ye faith-ful, joy-ful and tri-um-phant, O come ye, O come ye to Beth-le-hem; ' +
      'Come and be-hold him, born the King of an-gels: ' +
      'O come, let us a-dore him, O come, let us a-dore him, O come, let us a-dore him, Christ the Lord.',
    position: firstPosition,
  },
];

/** Songs whose harmony above is an analysis of the tune, not chord symbols written in the file. */
const ANALYSIS_ONLY = new Set(['minuet-in-g-melody']);

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

const name = (midi: number | null) => (midi === null ? 'rest' : midiToNote(midi, { prefer: 'sharps' }));
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
const shapeOf = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');

/** `~D4h.` -> a tied D4 held a dotted half, moved by `shift` semitones. */
function readToken(tok: string, shift: number): Written {
  const m = /^(~)?(r|[A-G](?:#|b)?\d)(w|h|q|e|s)(\.)?$/.exec(tok);
  if (!m) throw new Error(`bad token "${tok}" in an expected list`);
  const ticks = LEN[m[3]] * (m[4] ? 1.5 : 1);
  return { midi: m[2] === 'r' ? null : noteToMidi(m[2]) + shift, ticks, tie: !!m[1] };
}

/** The melody as written: one entry per beat (a melody plays one note at a time). */
function writtenOf(track: Track): Written[][] {
  return track.measures.map((m) =>
    m.beats.map((b) => {
      expect(b.notes.length, `${track.name}: one note at a time`).toBeLessThanOrEqual(1);
      const n = b.notes[0];
      return { midi: n ? n.midi : null, ticks: b.duration, tie: !!n?.tie };
    }),
  );
}

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** Every struck note of a track in order, with where it sits. */
function struckNotes(track: Track): Array<{ bar: number; tick: number; beat: number; midi: number; string: number; fret: number; finger?: number | 'T' }> {
  return track.measures.flatMap((m, bar) =>
    m.beats.flatMap((b: Beat, beat) => b.notes.filter((n) => !n.tie).map((n) => ({ bar, tick: b.start, beat, midi: n.midi, string: n.string, fret: n.fret, finger: n.finger }))),
  );
}

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 4: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);
  const expected = bars(want.tune).map((bar) => bar.map((t) => readToken(t, want.shift)));
  const got = writtenOf(melody);

  it('is valid for the song core', () => {
    expect(validateSong(song).map((i) => `${i.level}: ${i.message}`)).toEqual([]);
  });

  it('sounds the expected notes, bar by bar', () => {
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => {
      const names = bar.filter((w) => w.midi !== null && !w.tie).map((w) => name(w.midi));
      const want = expected[i].filter((w) => w.midi !== null && !w.tie).map((w) => name(w.midi));
      expect(names, `${id}: notes of bar ${i + 1}${want.length ? '' : ' (rests only)'}`).toEqual(want);
    });
  });

  it('has the expected rhythm, rests and ties, bar by bar', () => {
    got.forEach((bar, i) => {
      const fmt = (w: Written) => `${w.tie ? '~' : ''}${name(w.midi)}:${w.ticks}`;
      expect(bar.map(fmt), `${id}: bar ${i + 1}`).toEqual(expected[i].map(fmt));
    });
  });

  it('has the chords written where the harmony plan of this check puts them', () => {
    if (!want.harmony || ANALYSIS_ONLY.has(id)) return;
    const harmony = bars(want.harmony);
    expect(harmony.length, `${id}: harmony bars`).toBe(song.bars.length);
    harmony.forEach((slots, bar) => {
      if (want.pickup && bar === 0) return;
      const written = want.strong.map((tick) => chordAt(song, bar, tick) ?? '-');
      expect(written, `${id}: chords on the strong beats of bar ${bar}`).toEqual(slots);
    });
  });

  it('puts chord tones on the strong beats, or steps off them to the next note', () => {
    if (!want.harmony) return;
    const harmony = bars(want.harmony);
    const notes = struckNotes(melody);
    const problems: string[] = [];
    notes.forEach((n, i) => {
      if (want.pickup && n.bar === 0) return;
      const slot = want.strong.indexOf(n.tick);
      if (slot < 0) return;
      const symbol = harmony[n.bar]?.[slot];
      if (!symbol || symbol === '-') return;
      if (chordPcs(symbol).includes(n.midi % 12)) return;
      // Passing note, neighbour, appoggiatura or suspension: it moves by step to a different note.
      // A wrong fret almost never does.
      const next = notes.slice(i + 1).find((x) => x.midi !== n.midi);
      const prev = notes[i - 1];
      const step = next ? Math.abs(next.midi - n.midi) : 99;
      const passing = prev && next && Math.abs(prev.midi - n.midi) <= 2 && step <= 2 && Math.sign(n.midi - prev.midi) === Math.sign(next.midi - n.midi);
      if (step > 2 && !passing) problems.push(`bar ${n.bar + 1}: ${name(n.midi)} over ${symbol} neither belongs to it nor resolves by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key, scale and range, and ends on the tonic', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = [...scalePcs(want.scale[0], want.scale[1]), ...(want.scale[2] ?? []).map((n) => noteToMidi(`${n}4`) % 12)];
    const notes = struckNotes(melody);
    const outside = notes.filter((n) => !allowed.includes(n.midi % 12)).map((n) => `bar ${n.bar + 1}: ${name(n.midi)}`);
    expect(outside, `${id}: notes outside ${want.scale[0]} ${want.scale[1]}`).toEqual([]);
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    const last = name(midis[midis.length - 1]).replace(/\d+$/, '');
    // The Mozart excerpt stops on the dominant, as the opening does.
    expect(last, `${id}: last note`).toBe(id === 'eine-kleine-nachtmusik' ? 'D' : want.key.split(' ')[0]);
  });

  it('uses frets and fingers a teacher would give', () => {
    for (const n of struckNotes(melody)) {
      const where = `${id}: bar ${n.bar + 1}, string ${n.string} fret ${n.fret}`;
      const pos = want.position(n.bar, n.beat);
      if (!(want.highBars ?? []).includes(n.bar)) expect(n.fret, `${where}: first position`).toBeLessThanOrEqual(4);
      if (n.fret > 0) {
        // Inside one position each finger has its own fret: finger = fret - position + 1.
        expect(n.fret - pos, `${where}: within the hand's four frets (position ${pos})`).toBeGreaterThanOrEqual(0);
        expect(n.fret - pos, `${where}: within the hand's four frets (position ${pos})`).toBeLessThanOrEqual(3);
        if (n.finger !== undefined) expect(n.finger, `${where}: finger`).toBe(n.fret - pos + 1);
      }
    }
  });

  if (want.repeats) {
    it('repeats each half', () => {
      const spans = song.bars.flatMap((b, i) => (b.repeatStart ? [i] : [])).map((start) => [start, song.bars.findIndex((b, j) => j >= start && !!b.repeatEnd)]);
      expect(spans).toEqual(want.repeats!.spans);
      expect(flattenSong(song).bars.length).toBe(want.repeats!.played);
    });
  }

  if (want.shapes) {
    it("uses the plan's chord shapes, and only those chords", () => {
      const used = [...new Set(song.chords.map((c) => c.symbol))].sort();
      expect(used).toEqual(Object.keys(want.shapes!).sort());
      for (const c of song.chords) expect(shapeOf(c.voicing), `${id}: bar ${c.bar + 1}: ${c.symbol}`).toBe(want.shapes![c.symbol]);
    });
  }

  if (want.words) {
    it('carries the words, one syllable per note', () => {
      const text = melody.measures
        .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
        .map((l) => (l.endsWith('-') ? l : `${l} `))
        .join('')
        .trim();
      expect(text).toBe(want.words);
    });
  }

  it("lands near its level in the song core's difficulty estimate", () => {
    const level = songEntry(id)!.level;
    // The learner's part is the first track; a teacher part is played by the app.
    const yours = estimateDifficulty(song, { track: 0 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; your part ${yours.level} (score ${yours.score}), all tracks ${all.level}; ${yours.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(yours.level - level), `${id}: estimate ${yours.level} vs level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(1);
  });
});

describe('batch 4: the parts around the tunes', () => {
  it('eine-kleine-nachtmusik: the answer uses exactly the frets the plan names', () => {
    const song = load('eine-kleine-nachtmusik');
    const answer = struckNotes(trackNamed(song, 'Melody')).filter((n) => n.bar >= 2);
    const frets = [...new Set(answer.map((n) => `${n.string}:${n.fret}`))].sort();
    // string 2 fret 1 (C), string 3 fret 2 (A), string 4 fret 4 (F#), open string 4 (D)
    expect(frets).toEqual(['2:1', '3:2', '4:0', '4:4']);
    const call = struckNotes(trackNamed(song, 'Melody')).filter((n) => n.bar < 2);
    expect([...new Set(call.map((n) => `${n.string}:${n.fret}`))].sort()).toEqual(['2:0', '2:3', '3:0', '4:0']);
    // Every rest of the original is there: two in bars 1 and 3, one in bars 2 and 4.
    expect(song.tracks[0].measures.map((m) => m.beats.filter((b) => !b.notes.length).length)).toEqual([2, 1, 2, 1]);
  });

  it('brahms-lullaby: the octave leap G3 to G4 comes in the second half', () => {
    const song = load('brahms-lullaby');
    const notes = struckNotes(trackNamed(song, 'Melody'));
    const leaps = notes.slice(1).flatMap((n, i) => (n.midi - notes[i].midi === 12 ? [`${n.bar}:${name(notes[i].midi)}-${name(n.midi)}`] : []));
    expect(leaps).toEqual(['9:G3-G4', '13:G3-G4']);
    expect(notes.find((n) => n.midi === 67)).toMatchObject({ string: 1, fret: 3 });
  });

  it('brahms-lullaby: the teacher rocks: bass on beat 1, the chord on beats 2 and 3', () => {
    const song = load('brahms-lullaby');
    const teacher = trackNamed(song, 'Teacher');
    const ROOT: Record<string, string> = { G: 'G2', D7: 'D3', C: 'C3' };
    teacher.measures.forEach((m, bar) => {
      if (bar === 0) return expect(m.beats.every((b) => !b.notes.length), 'the pickup is a rest').toBe(true);
      const chord = chordAt(song, bar, 0)!;
      const [bass, ...rest] = m.beats;
      expect(bass.start).toBe(0);
      expect(bass.notes.map((n) => name(n.midi)), `bar ${bar}: bass of ${chord}`).toEqual([ROOT[chord]]);
      expect(rest.length, `bar ${bar}`).toBeGreaterThan(0);
      expect(rest[0].start, `bar ${bar}: the chord starts on beat 2`).toBe(PPQ);
      for (const b of rest) {
        expect(b.notes.length, `bar ${bar}: three chord notes`).toBe(3);
        for (const n of b.notes) expect(chordPcs(chord), `bar ${bar}: ${name(n.midi)} in ${chord}`).toContain(n.midi % 12);
        // The notes come from the plan's shape for that chord.
        const shape = song.chords.find((c) => c.symbol === chord)!.voicing!;
        for (const n of b.notes) expect(shape[6 - n.string], `bar ${bar}: string ${n.string}`).toBe(n.fret);
      }
    });
    const swap = estimateDifficulty(song, { track: 'Teacher' });
    expect(Math.abs(swap.level - 3), `the accompaniment, when you swap: ${swap.reasons.join(' ')}`).toBeLessThanOrEqual(1);
  });

  it('o-come-all-ye-faithful: four strums a bar in the verse, and the refrain builds', () => {
    const song = load('o-come-all-ye-faithful');
    const strum = trackNamed(song, 'Your strum');
    const DUR: Record<number, string> = { 3840: 'w', 1920: 'h', 960: 'q', 480: 'e' };
    const want = (bar: number) =>
      bar === 0 ? 'q' : bar <= 12 ? 'q q q q' : bar <= 14 ? 'h h' : bar <= 16 ? 'q q q q' : bar <= 19 ? 'q e e q e e' : 'w';
    strum.measures.forEach((m, bar) => {
      expect(m.beats.map((b) => DUR[b.duration]).join(' '), `bar ${bar}`).toBe(want(bar));
      if (bar === 0) return;
      for (const b of m.beats) {
        expect(b.slash, `bar ${bar}: strummed`).toBe(true);
        // Down on the beat, up on the "and".
        expect(b.stroke, `bar ${bar}, tick ${b.start}`).toBe(b.start % PPQ === 0 ? 'down' : 'up');
      }
    });
    // The chord in force on each beat of the strum track agrees with the harmony of the tune check.
    const expected = bars(SONGS.find((s) => s.id === 'o-come-all-ye-faithful')!.harmony!);
    for (let bar = 1; bar < strum.measures.length; bar++) {
      expect([chordAt(song, bar, 0), chordAt(song, bar, 2 * PPQ)], `bar ${bar}`).toEqual(expected[bar]);
    }
    expect(song.sections.map((s) => s.name)).toEqual(['Verse', 'Refrain']);
  });
});

describe('batch 4: st-change-g-c-c-g7', () => {
  const song = load('st-change-g-c-c-g7');
  const strum = trackNamed(song, 'Your strum');

  it('is valid for the song core', () => {
    expect(validateSong(song).map((i) => `${i.level}: ${i.message}`)).toEqual([]);
  });

  it('climbs the ladder in each half: 1, 2, 4 strums a bar, then a change every 2 beats', () => {
    const DUR: Record<number, string> = { 3840: 'w', 1920: 'h', 960: 'q' };
    const ladder = ['w', 'w', 'h h', 'h h', 'q q q q', 'q q q q', 'q q q q', 'q q q q'];
    expect(strum.measures.length).toBe(16);
    strum.measures.forEach((m, i) => {
      // The very last chord rings for two beats.
      expect(m.beats.map((b) => DUR[b.duration]).join(' '), `bar ${i + 1}`).toBe(i === 15 ? 'q q h' : ladder[i % 8]);
      expect(m.beats.every((b) => b.slash && b.stroke === 'down'), `bar ${i + 1}: downstrums`).toBe(true);
    });
  });

  it('changes chords exactly where the composition plan says, and ends G7 to C', () => {
    // Home chord two bars, then every bar (two and four strums), then every two beats.
    const plan = [
      'G G', 'G G', 'C C', 'G G', 'C C', 'G G', 'C G', 'C G',
      'C C', 'C C', 'G7 G7', 'C C', 'G7 G7', 'C C', 'G7 C', 'G7 C',
    ];
    plan.forEach((p, bar) => expect(`${chordAt(song, bar, 0)} ${chordAt(song, bar, 2 * PPQ)}`, `bar ${bar + 1}`).toBe(p));
    const last = song.chords[song.chords.length - 1];
    expect(last.symbol).toBe('C');
    expect(song.chords[song.chords.length - 2].symbol).toBe('G7');
    // Every chord change lands on a beat.
    for (const c of song.chords) expect(c.tick % PPQ, `${c.symbol} in bar ${c.bar + 1}`).toBe(0);
  });

  it("uses the plan's shapes: G 320003, C x32010, G7 320001", () => {
    const SHAPES: Record<string, string> = { G: '320003', C: 'x32010', G7: '320001' };
    for (const c of song.chords) expect(shapeOf(c.voicing), `bar ${c.bar + 1}: ${c.symbol}`).toBe(SHAPES[c.symbol]);
    // The 3-2 shape of G (string 6 fret 3, string 5 fret 2) moves one string toward string 1 for C
    // (string 5 fret 3, string 4 fret 2) and back for G7; finger 1 goes to string 2 fret 1, then
    // to string 1 fret 1.
    const g = SHAPES.G.split('');
    const c = SHAPES.C.split('');
    const g7 = SHAPES.G7.split('');
    expect([g[0], g[1]]).toEqual([c[1], c[2]]);
    expect([g7[0], g7[1]]).toEqual([c[1], c[2]]);
    expect([c[4], g7[5]]).toEqual(['1', '1']);
  });

  it('sits in G for the first half and in C for the second', () => {
    expect(song.key && `${parseKey(song.key)!.tonic} ${parseKey(song.key)!.mode}`).toBe('G major');
    expect(song.bars[8].key && parseKey(song.bars[8].key)?.tonic).toBe('C');
    expect(song.sections.map((s) => s.name)).toEqual(['G and C', 'C and G7']);
  });

  it("lands near its level in the song core's difficulty estimate", () => {
    const est = estimateDifficulty(song, { track: 0 });
    // eslint-disable-next-line no-console
    console.log(`st-change-g-c-c-g7: level 3; estimate ${est.level} (score ${est.score}); ${est.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(est.level - songEntry('st-change-g-c-c-g7')!.level)).toBeLessThanOrEqual(1);
  });
});

/*
 * Added by the independent review of batch 4. Each block covers something the review changed or
 * checked with another engine: the carol's words under its slurred figures, the teacher's tune
 * added to st-change-g-c-c-g7, and every chord shape of the batch named by @/core/guitar.
 */
describe('batch 4 review', () => {
  const BATCH = ['minuet-in-g-melody', 'eine-kleine-nachtmusik', 'brahms-lullaby', 'o-come-all-ye-faithful', 'st-change-g-c-c-g7'];

  it.each(BATCH)('%s: every chord shape sounds the chord it is named for (@/core/guitar)', (id) => {
    const song = load(id);
    for (const c of song.chords) {
      if (!c.voicing) continue;
      const found = identifyFretted(c.voicing);
      expect(found.symbol, `${id}: bar ${c.bar + 1}: "${c.symbol}=${shapeOf(c.voicing)}" sounds ${found.notes.map((n) => n.note).join(' ')}`).toBe(c.symbol);
    }
  });

  it('st-change-g-c-c-g7: the fingerings in the annotations are playable, and the 3-2 shape really moves one string', () => {
    // G with 3, 2 and 4; C x32010 with 3, 2, 1; G7 320001 with 3, 2, 1 (fingers low string first).
    expect(checkVoicingFingering([3, 2, 0, 0, 0, 3], [3, 2, 0, 0, 0, 4])).toEqual([]);
    expect(checkVoicingFingering([null, 3, 2, 0, 1, 0], [null, 3, 2, 0, 1, 0])).toEqual([]);
    expect(checkVoicingFingering([3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1])).toEqual([]);
    const song = load('st-change-g-c-c-g7');
    const notes = song.tracks[0].measures.flatMap((m, bar) => m.beats.map((b) => ({ bar, ann: song.annotations.filter((a) => a.bar === bar).map((a) => a.text) })));
    expect(notes.some((n) => n.ann.some((t) => /3, 2 and 4/.test(t)))).toBe(true);
  });

  it('o-come-all-ye-faithful: each slurred figure carries one syllable, the next note the next one', () => {
    const song = load('o-come-all-ye-faithful');
    const tune = trackNamed(song, 'Tune');
    const at = (bar: number) => tune.measures[bar].beats.map((b) => `${b.lyric ?? '_'}:${name(b.notes[0]?.midi ?? null)}`);
    // "to Beth-le-hem": le on the half-note F#, hem on E with the D slurred to it, then the held D.
    expect(at(7)).toEqual(['le-:F#3', 'hem;:E3', '_:D3']);
    // "King of an-gels": an on the dotted F# with the E slurred to it, gels on D (as in the Latin
    // "an-ge-lo-rum", where -rum takes the D), then "O" leads into the refrain.
    expect(at(12)).toEqual(['an-:F#3', '_:E3', 'gels::D3', 'O:G3']);
    // "Christ the Lord": the on B, Lord on A with the G slurred to it and held.
    expect(at(19)).toEqual(['the:B3', 'Lord.:A3', '_:G3']);
  });

  describe('st-change-g-c-c-g7: the teacher tune', () => {
    const song = load('st-change-g-c-c-g7');
    const teacher = trackNamed(song, 'Teacher');
    // Composition plan, bar by bar, as sounding pitch and length: a chord tone on beats 1 and 3.
    const TUNE =
      'D4h B3q D4q | G4h. F#4q | E4h C4h | D4h B3h | C4q E4q G4q E4q | D4q B3q G3q B3q | C4q E4q D4q B3q | C4q A3q G3h |' +
      'E4h G4q E4q | C4h E4h | F4h D4h | E4h C4h | B3q D4q F4q D4q | E4q G4q E4q C4q | D4q F4q E4q G4q | F4q D4q C4h';
    const want = bars(TUNE).map((bar) => bar.map((t) => readToken(t, 0)));

    it('is a second track, so your strum stays the part you play', () => {
      expect(song.tracks.map((t) => [t.name, t.role])).toEqual([
        ['Your strum', 'rhythm'],
        ['Teacher', 'lead'],
      ]);
    });

    it('sounds the planned notes and rhythm', () => {
      const got = writtenOf(teacher);
      expect(got.length).toBe(16);
      got.forEach((bar, i) => {
        const fmt = (w: Written) => `${name(w.midi)}:${w.ticks}`;
        expect(bar.map(fmt), `teacher bar ${i + 1}`).toEqual(want[i].map(fmt));
      });
    });

    it('puts a chord tone of the chord in force on every strong beat', () => {
      teacher.measures.forEach((m, bar) => {
        for (const tick of [0, 2 * PPQ]) {
          const sounding = m.beats.find((b) => b.start <= tick && tick < b.start + b.duration)!;
          const midi = sounding.notes[0].midi;
          const chord = chordAt(song, bar, tick)!;
          expect(chordPcs(chord), `bar ${bar + 1}, beat ${tick / PPQ + 1}: ${name(midi)} over ${chord}`).toContain(midi % 12);
        }
      });
    });

    it('keeps to G major, then C major, in first position, and ends each half on its home note', () => {
      const notes = struckNotes(teacher);
      const g = scalePcs('G', 'major');
      const c = scalePcs('C', 'major');
      for (const n of notes) {
        expect((n.bar < 8 ? g : c).includes(n.midi % 12), `bar ${n.bar + 1}: ${name(n.midi)}`).toBe(true);
        expect(n.fret, `bar ${n.bar + 1}: first position`).toBeLessThanOrEqual(3);
      }
      const midis = notes.map((n) => n.midi);
      expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(['G3', 'G4']);
      expect(name(notes.filter((n) => n.bar === 7).at(-1)!.midi)).toBe('G3');
      expect(name(notes.at(-1)!.midi)).toBe('C4');
    });
  });
});
