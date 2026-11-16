/**
 * Batch 1 cross-checks: the songs in src/content/songs/<id>/ checked against note lists written
 * out independently (from the tunes as commonly known and printed, and from the composition plans
 * of the original studies). The SixTab is parsed with the song core and every sounding pitch of the
 * melody is compared bar by bar, so a wrong fret shows up as a wrong note name in a named bar.
 * Also checked: rhythm, the harmony on strong beats, key, range, first-position frets and fingers,
 * the words, and the core's difficulty estimate against the level in meta.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultVoicing, estimateDifficulty, parseSixTab, type Beat, type Song, type Track } from '@/core/song';
import { identifyFretted } from '@/core/guitar';
import { chordPcs, midiToNote, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;

/** What one song should contain, written out by hand. */
interface Expected {
  id: string;
  /** The melody track checked (the tune; in strum studies the teacher's tune). */
  melody: string;
  /** Sounding pitches of every struck melody note, bar by bar ("|" between bars). */
  notes: string;
  /** Duration of every beat, bar by bar: w h. h q. q e. e s, then "r" for a rest or "~" for a tie. */
  rhythm: string;
  /** Chord events as written: "bar:symbol" or "bar.beat:symbol" (1-based). */
  chords: string;
  /** Harmony assumed when no chord symbol is written (a round over one chord). */
  implied?: string;
  /** The key as "tonic mode", and the scale the melody keeps to (tonic + scale id). */
  key: string;
  scale: [string, string];
  /** Lowest and highest melody note. */
  range: [string, string];
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
  /** Words of the melody track as sung, syllables joined by hyphens, when the song has words. */
  words?: string[];
}

const FOUR = [0, 2 * PPQ];

const SONGS: Expected[] = [
  {
    id: 'st-first-notes-string-6',
    melody: 'Melody',
    // Plan: rising E F G, neighbour G around F, falling G F E, neighbour E under F; then the answer
    // phrase and the Phrygian close F -> E.
    notes: 'E2 F2 G2 | F2 G2 F2 | G2 F2 E2 | F2 E2 F2 | E2 F2 G2 E2 | F2 G2 F2 E2 | G2 F2 | E2',
    rhythm: 'q q h | q q h | q q h | q q h | q q q q | q q q q | h h | w',
    chords: '1:Em 2:F 3:Em 4:F 5:Em 6:F 7:Em 7.3:F 8:Em',
    key: 'E minor',
    scale: ['E', 'phrygian'],
    range: ['E2', 'G2'],
    strong: FOUR,
  },
  {
    id: 'st-strum-quarters',
    melody: 'Teacher',
    notes:
      'B3 G3 B3 | E4 B3 | G3 A3 B3 | B3 A3 G3 | C#4 A3 C#4 | E4 C#4 | A3 B3 C#4 | C#4 B3 A3 |' +
      'B3 G3 B3 | E4 F#4 G4 | E4 D4 B3 | G3 A3 B3 | C#4 E4 C#4 | A3 C#4 | A3 B3 C#4 | E4',
    rhythm:
      'h q q | h h | q q h | q q h | h q q | h h | q q h | q q h |' +
      'h q q | q q h | q q h | q q h | h q q | h h | q q h | w',
    chords: '1:Em 5:A 9:Em 13:A',
    key: 'E minor',
    scale: ['E', 'dorian'],
    range: ['G3', 'G4'],
    strong: FOUR,
  },
  {
    id: 'st-change-a-e7',
    melody: 'Teacher',
    notes:
      'E4 C#4 A3 | A3 C#4 | B3 D4 | C#4 A3 | G#3 B3 D4 B3 | A3 C#4 E4 C#4 | B3 C#4 | D4 C#4 |' +
      'E4 C#4 A3 | C#4 E4 | D4 B3 | C#4 A3 | B3 D4 G#3 B3 | C#4 E4 A3 C#4 | B3 C#4 | D4 B3 A3',
    rhythm:
      'h q q | h h | h h | h h | q q q q | q q q q | h h | h h |' +
      'h q q | h h | h h | h h | q q q q | q q q q | h h | q q h',
    chords: '1:A 3:E7 4:A 5:E7 6:A 7:E7 7.3:A 8:E7 8.3:A 9:A 11:E7 12:A 13:E7 14:A 15:E7 15.3:A 16:E7 16.3:A',
    key: 'A major',
    scale: ['A', 'major'],
    range: ['G#3', 'E4'],
    strong: FOUR,
  },
  {
    id: 'ode-to-joy-theme',
    melody: 'Melody',
    // Beethoven's theme in G: A (ends on A), A (ends on G), B (eighth pairs, ends on the low D), A.
    notes:
      'B3 B3 C4 D4 | D4 C4 B3 A3 | G3 G3 A3 B3 | B3 A3 A3 |' +
      'B3 B3 C4 D4 | D4 C4 B3 A3 | G3 G3 A3 B3 | A3 G3 G3 |' +
      'A3 A3 B3 G3 | A3 B3 C4 B3 G3 | A3 B3 C4 B3 A3 | G3 A3 D3 |' +
      'B3 B3 C4 D4 | D4 C4 B3 A3 | G3 G3 A3 B3 | A3 G3 G3',
    rhythm:
      'q q q q | q q q q | q q q q | q. e h |' +
      'q q q q | q q q q | q q q q | q. e h |' +
      'q q q q | q e e q q | q e e q q | q q h |' +
      'q q q q | q q q q | q q q q | q. e h',
    chords: '1:G 2:D 3:G 4.3:D 5:G 6:D 7:G 8:D 8.3:G 9:D 9.3:G 10:D 10.3:G 11:D 12:G 12.3:D 13:G 14:D 15:G 16:D 16.3:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['D3', 'D4'],
    strong: FOUR,
  },
  {
    id: 'twinkle-twinkle-little-star',
    melody: 'Melody',
    notes:
      'G3 G3 D4 D4 | E4 E4 D4 | C4 C4 B3 B3 | A3 A3 G3 |' +
      'D4 D4 C4 C4 | B3 B3 A3 | D4 D4 C4 C4 | B3 B3 A3 |' +
      'G3 G3 D4 D4 | E4 E4 D4 | C4 C4 B3 B3 | A3 A3 G3',
    rhythm: 'q q q q | q q h | q q q q | q q h | q q q q | q q h | q q q q | q q h | q q q q | q q h | q q q q | q q h',
    chords: '1:G 2:C 2.3:G 3:C 3.3:G 4:D7 4.3:G 5:G 5.3:C 6:G 6.3:D7 7:G 7.3:C 8:G 8.3:D7 9:G 10:C 10.3:G 11:C 11.3:G 12:D7 12.3:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'E4'],
    strong: FOUR,
    words: [
      'Twin-kle, twin-kle, lit-tle star, how I won-der what you are.',
      'Up a-bove the world so high, like a dia-mond in the sky.',
      'Twin-kle, twin-kle, lit-tle star, how I won-der what you are.',
    ],
  },
  {
    id: 'frere-jacques-round',
    melody: 'You (first voice)',
    notes:
      'G3 A3 B3 G3 | G3 A3 B3 G3 | B3 C4 D4 | B3 C4 D4 | D4 E4 D4 C4 B3 G3 | D4 E4 D4 C4 B3 G3 | G3 D3 G3 | G3 D3 G3 |' +
      'G3 A3 B3 G3 | G3 A3 B3 G3 | B3 C4 D4 | B3 C4 D4 | D4 E4 D4 C4 B3 G3 | D4 E4 D4 C4 B3 G3 | G3 D3 G3 | G3 D3 G3 |' +
      'G3 | ',
    rhythm:
      'q q q q | q q q q | q q h | q q h | e e e e q q | e e e e q q | q q h | q q h |' +
      'q q q q | q q q q | q q h | q q h | e e e e q q | e e e e q q | q q h | q q h |' +
      'w | w~',
    chords: '',
    implied: 'G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['D3', 'E4'],
    strong: FOUR,
  },
  {
    id: 'row-row-row-your-boat',
    melody: 'Melody',
    notes:
      'G3 G3 | G3 A3 B3 | B3 A3 B3 C4 | D4 | G4 G4 G4 D4 D4 D4 | B3 B3 B3 G3 G3 G3 | D4 C4 B3 A3 | G3 |' +
      'G3 G3 | G3 A3 B3 | B3 A3 B3 C4 | D4 | G4 G4 G4 D4 D4 D4 | B3 B3 B3 G3 G3 G3 | D4 C4 B3 A3 | G3 |' +
      'G3 | ',
    rhythm:
      'q. q. | q e q. | q e q e | h. | e e e e e e | e e e e e e | q e q e | h. |' +
      'q. q. | q e q. | q e q e | h. | e e e e e e | e e e e e e | q e q e | h. |' +
      'h. | h.~',
    chords: '1:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'G4'],
    strong: [0, 3 * (PPQ / 2)],
    // The tune twice through (the second time as a round).
    words: [
      'Row, row, row your boat, gent-ly down the stream. Mer-ri-ly, mer-ri-ly, mer-ri-ly, mer-ri-ly, life is but a dream.',
      'Row, row, row your boat, gent-ly down the stream. Mer-ri-ly, mer-ri-ly, mer-ri-ly, mer-ri-ly, life is but a dream.',
    ],
  },
  {
    id: 'jingle-bells',
    melody: 'Melody',
    notes:
      'B3 B3 B3 | B3 B3 B3 | B3 D4 G3 A3 | B3 |' +
      'C4 C4 C4 C4 | C4 B3 B3 B3 B3 | B3 A3 A3 B3 | A3 D4 |' +
      'B3 B3 B3 | B3 B3 B3 | B3 D4 G3 A3 | B3 |' +
      'C4 C4 C4 C4 | C4 B3 B3 B3 B3 | D4 D4 C4 A3 | G3',
    rhythm:
      'q q h | q q h | q q q. e | w |' +
      'q q q. e | q q q e e | q q q q | h h |' +
      'q q h | q q h | q q q. e | w |' +
      'q q q q | q q q e e | q q q q | w',
    chords: '1:G 5:C 6:G 7:A7 8:D7 9:G 13:C 14:G 15:D7 16:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'D4'],
    strong: FOUR,
    words: [
      'Jin-gle bells, jin-gle bells, jin-gle all the way; Oh what fun it is to ride in a one-horse o-pen sleigh.',
      'Jin-gle bells, jin-gle bells, jin-gle all the way; Oh what fun it is to ride in a one-horse o-pen sleigh.',
    ],
  },
  {
    id: 'london-bridge',
    melody: 'Melody',
    notes: 'D4 E4 D4 C4 | B3 C4 D4 | A3 B3 C4 | B3 C4 D4 | D4 E4 D4 C4 | B3 C4 D4 | A3 D4 | B3 G3',
    rhythm: 'e. s e e | e e q | e e q | e e q | e. s e e | e e q | q q | q q',
    chords: '1:G 3:D7 4:G 7:D7 8:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'E4'],
    strong: [0, PPQ],
    words: ['Lon-don Bridge is fall-ing down, fall-ing down, fall-ing down. Lon-don Bridge is fall-ing down, my fair la-dy.'],
  },
];

/**
 * Songs whose estimate is known to sit above the plan's level, with the reason (checked and kept
 * on purpose; the estimate must not climb past `max`).
 */
const ESTIMATE_GAPS: Record<string, { max: number; why: string }> = {
  'london-bridge': {
    max: 5,
    why:
      'The plan writes "Lon-don" as a dotted eighth and a sixteenth at 92. The core rates that one sixteenth as a fast note ' +
      '(6 a second) and sixteenths as a hard subdivision, but the quick note is the open string 1 with the left hand still on ' +
      'fret 3: a pick-hand skip, a level-2 rhythm in the plan.',
  },
};

/** Durations as written in SixTab. */
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
/** A chord shape as written in SixTab, low string first: x02220. */
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));

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

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 1: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);

  it('sounds the expected notes, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.flatMap((b) => struck(b).map((n) => name(n.midi))));
    const expected = bars(want.notes);
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the expected rhythm, bar by bar', () => {
    const got = melody.measures.map((m) =>
      m.beats.map((b) => (DURATION[b.duration] ?? `${b.duration}t`) + (b.notes.length === 0 ? 'r' : b.notes.every((n) => n.tie) ? '~' : '')),
    );
    const expected = bars(want.rhythm);
    expect(got.length).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: rhythm of bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the chord symbols it should, where it should', () => {
    const got = song.chords.map((c) => `${c.bar + 1}${c.tick ? `.${c.tick / PPQ + 1}` : ''}:${c.symbol}`).join(' ');
    expect(got).toBe(want.chords);
  });

  it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
    const notes = notesOf(melody);
    const problems: string[] = [];
    notes.forEach((n, i) => {
      if (!want.strong.includes(n.tick)) return;
      const symbol = chordAt(song, n.bar, n.tick) ?? want.implied;
      if (!symbol) return problems.push(`bar ${n.bar + 1}: ${name(n.midi)} with no chord in force`);
      if (chordPcs(symbol).includes(n.midi % 12)) return;
      // A non-chord tone on a strong beat must resolve by step (passing note, neighbour,
      // appoggiatura or suspension): a wrong fret almost never does.
      const next = notes.slice(i + 1).find((x) => x.midi !== n.midi);
      const step = next ? Math.abs(next.midi - n.midi) : 99;
      if (step > 2) problems.push(`bar ${n.bar + 1}, tick ${n.tick}: ${name(n.midi)} over ${symbol} does not resolve by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key and range, and ends on the tonic', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = scalePcs(want.scale[0], want.scale[1]);
    const notes = notesOf(melody);
    const outside = notes.filter((n) => !allowed.includes(n.midi % 12)).map((n) => `bar ${n.bar + 1}: ${name(n.midi)}`);
    expect(outside, `${id}: notes outside ${want.scale.join(' ')}`).toEqual([]);
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    expect(name(midis[midis.length - 1]).replace(/\d+$/, ''), `${id}: last note`).toBe(want.key.split(' ')[0]);
  });

  it('stays in first position, with fingers that match the frets', () => {
    for (const t of song.tracks) {
      for (const [bar, m] of t.measures.entries()) {
        for (const b of m.beats) {
          for (const n of b.notes) {
            expect(n.fret, `${id}: ${t.name} bar ${bar + 1} string ${n.string}`).toBeLessThanOrEqual(4);
            if (n.finger !== undefined) expect(n.finger, `${id}: ${t.name} bar ${bar + 1}: finger on fret ${n.fret}`).toBe(n.fret);
          }
        }
      }
    }
  });

  if (want.words) {
    it('carries the words', () => {
      const text = (t: Track) =>
        t.measures
          .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
          .map((l) => (l.endsWith('-') ? l : `${l} `))
          .join('')
          .trim();
      expect(text(melody)).toBe(want.words!.join(' '));
    });
  }

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    // The learner plays the first track; the teacher's parts are played by the app.
    const yours = estimateDifficulty(song, { track: 0 });
    const slow = estimateDifficulty(song, { track: 0, tempoPercent: 70 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(
      `${id}: level ${level}; your part ${yours.level} (${slow.level} at 70%), all tracks ${all.level}; ` +
        `${[...new Set([...yours.reasons, ...all.reasons])].join(' ') || 'no hard spots'}`,
    );
    const gap = ESTIMATE_GAPS[id];
    expect(yours.level, `${id}: estimate ${yours.level} is far below level ${level}`).toBeGreaterThanOrEqual(level - 1);
    expect(yours.level, `${id}: estimate ${yours.level} is far above level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(gap?.max ?? level + 1);
  });
});

describe('batch 1: the strum parts', () => {
  it('st-strum-quarters: four downstrums in every bar, Em then A, four bars each', () => {
    const song = load('st-strum-quarters');
    const strum = trackNamed(song, 'Your strum');
    strum.measures.forEach((m, i) => {
      const bar = i + 1;
      // The plan: downstrums on every beat, never stopping, so the last bar has four as well.
      const expected = ['q', 'q', 'q', 'q'];
      expect(m.beats.map((b) => DURATION[b.duration]), `bar ${bar}`).toEqual(expected);
      expect(m.beats.every((b) => b.slash && b.stroke === 'down'), `bar ${bar}: downstrums`).toBe(true);
      expect(chordAt(song, i, 0), `bar ${bar}`).toBe(Math.floor(i / 4) % 2 === 0 ? 'Em' : 'A');
    });
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(c.symbol === 'Em' ? '022000' : 'x02220');
  });

  it('st-change-a-e7: the 8-bar ladder, twice, with the plan\'s shapes', () => {
    const song = load('st-change-a-e7');
    const strum = trackNamed(song, 'Your strum');
    const ladder = ['w', 'w', 'h h', 'h h', 'q q q q', 'q q q q', 'q q q q', 'q q q q'];
    strum.measures.forEach((m, i) => {
      const want = i === 15 ? 'q q h' : ladder[i % 8];
      expect(m.beats.map((b) => DURATION[b.duration]).join(' '), `bar ${i + 1}`).toBe(want);
      expect(m.beats.every((b) => b.slash && b.stroke === 'down')).toBe(true);
    });
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(c.symbol === 'A' ? 'x02220' : '020100');
  });

  it('down-in-the-valley: bass on 1 (string 5 under A, string 6 under E7), strums on 2 and 3', () => {
    const song = load('down-in-the-valley');
    const strum = trackNamed(song, 'Your strum');
    // Two bars per half-line: A A E7 E7 | E7 E7 A A, for each couplet.
    const plan = ['A', 'A', 'E7', 'E7', 'E7', 'E7', 'A', 'A'];
    expect(strum.measures.length).toBe(32);
    strum.measures.forEach((m, i) => {
      const chord = chordAt(song, i, 0);
      expect(chord, `bar ${i + 1}`).toBe(plan[i % 8]);
      const [bass, ...rest] = m.beats;
      expect(bass.start).toBe(0);
      expect(bass.notes.map((n) => name(n.midi)), `bar ${i + 1}: bass note`).toEqual([chord === 'A' ? 'A2' : 'E2']);
      expect(rest.length).toBeGreaterThan(0);
      expect(rest.every((b) => b.slash && b.stroke === 'down'), `bar ${i + 1}: downstrums after the bass`).toBe(true);
      expect(rest[0].start, `bar ${i + 1}: first strum on beat 2`).toBe(PPQ);
    });
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(c.symbol === 'A' ? 'x02220' : '020100');
    // The words sit over the bars where the chords change, one half-line per two bars.
    const words = song.annotations.map((a) => `${a.bar + 1}:${a.text}`);
    expect(words.slice(0, 4)).toEqual(['1:Down in the valley,', '3:valley so low,', '5:hang your head over,', '7:hear the wind blow.']);
    expect(words.join(' ')).not.toMatch(/birmingham|letter/i);
    const est = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(`down-in-the-valley: level 2; estimate ${est.level}; ${est.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(est.level - songEntry('down-in-the-valley')!.level)).toBeLessThanOrEqual(1);
  });
});

describe('batch 1: the cross-check catches a wrong fret', () => {
  it('a D played one fret too high in Ode to Joy (string 2 fret 4 = D#) fails the note list and the key', () => {
    const text = readFileSync(new URL('../songs/ode-to-joy-theme/song.sixtab', import.meta.url), 'utf8');
    const broken = parseSixTab(text.replace('2:3{3}', '2:4{3}')).song!;
    const bar1 = broken.tracks[0].measures[0].beats.flatMap((b) => struck(b).map((n) => name(n.midi)));
    expect(bar1).not.toEqual(bars(SONGS.find((s) => s.id === 'ode-to-joy-theme')!.notes)[0]);
    expect(bar1[3]).toBe('D#4');
    expect(scalePcs('G', 'major')).not.toContain(broken.tracks[0].measures[0].beats[3].notes[0].midi % 12);
  });
});

/*
 * Reviewer's checks (an independent review of batch 1). They cover what the checks above leave
 * out: every chord shape against the guitar engine, the second voices of the two rounds and the
 * harmony between the voices, the words of Down in the Valley, and the fixes made in review.
 */
const BATCH = [
  'st-first-notes-string-6',
  'st-strum-quarters',
  'st-change-a-e7',
  'ode-to-joy-theme',
  'twinkle-twinkle-little-star',
  'frere-jacques-round',
  'row-row-row-your-boat',
  'jingle-bells',
  'london-bridge',
  'down-in-the-valley',
];

/** The standard open shapes a teacher means by these symbols (low string first). */
const OPEN_SHAPES: Record<string, string> = { G: '320003', C: 'x32010', D: 'xx0232', D7: 'xx0212', A7: 'x02020' };

/** "G3/960" per beat of a bar (or "r/960" for a rest): pitch and length, so a shifted voice compares exactly. */
function barCells(track: Track, bar: number): string[] {
  return track.measures[bar].beats.map((b) => (b.notes.length ? `${b.notes.map((n) => name(n.midi)).join('+')}/${b.duration}` : `r/${b.duration}`));
}

/** Pitches sounding in a track at a tick of a bar (struck or still held). */
function soundingAt(track: Track, bar: number, tick: number): number[] {
  const beat = track.measures[bar].beats.find((b) => b.start <= tick && tick < b.start + b.duration);
  return beat ? beat.notes.map((n) => n.midi) : [];
}

describe('batch 1 review: chords', () => {
  it.each(BATCH)('%s: every chord sounds its symbol, and a symbol without a shape gets the standard open shape', (id) => {
    const song = load(id);
    for (const c of song.chords) {
      const frets = c.voicing ?? defaultVoicing(c.symbol, song.tuning, song.capo);
      expect(frets, `${id}: bar ${c.bar + 1}: ${c.symbol} has a shape`).not.toBeNull();
      expect(identifyFretted(shape(frets!)).symbol, `${id}: bar ${c.bar + 1}: ${c.symbol}=${shape(frets!)}`).toBe(c.symbol);
      if (!c.voicing) expect(shape(frets!), `${id}: ${c.symbol} as the teacher strums it`).toBe(OPEN_SHAPES[c.symbol]);
    }
  });
});

describe('batch 1 review: the rounds', () => {
  it('frere-jacques-round: the teacher plays your tune two bars behind you, twice through', () => {
    const song = load('frere-jacques-round');
    const you = trackNamed(song, 'You (first voice)');
    const teacher = trackNamed(song, 'Teacher (second voice)');
    expect([0, 1].map((i) => barCells(teacher, i))).toEqual([['r/3840'], ['r/3840']]);
    for (let i = 0; i < 16; i++) expect(barCells(teacher, i + 2), `teacher bar ${i + 3} = your bar ${i + 1}`).toEqual(barCells(you, i));
  });

  it('row-row-row-your-boat: in the round the second voice is the tune two bars behind', () => {
    const song = load('row-row-row-your-boat');
    const you = trackNamed(song, 'Melody');
    const second = trackNamed(song, 'Second voice');
    for (let i = 0; i < 10; i++) expect(barCells(second, i), `second voice bar ${i + 1} rests`).toEqual(['r/2880']);
    for (let i = 8; i < 16; i++) expect(barCells(second, i + 2), `second voice bar ${i + 3} = your bar ${i + 1}`).toEqual(barCells(you, i));
  });

  it.each([
    ['frere-jacques-round', [0, 2 * PPQ]],
    ['row-row-row-your-boat', [0, 3 * (PPQ / 2)]],
  ] as Array<[string, number[]]>)('%s: on every strong beat both voices sound notes of the G chord', (id, strong) => {
    const song = load(id);
    const voices = song.tracks.filter((t) => t.role === 'lead');
    expect(voices.length).toBe(2);
    const g = chordPcs('G');
    const clashes: string[] = [];
    song.bars.forEach((_, bar) => {
      for (const tick of strong) {
        const midis = voices.flatMap((v) => soundingAt(v, bar, tick));
        const off = midis.filter((m) => !g.includes(m % 12));
        if (off.length) clashes.push(`bar ${bar + 1}, tick ${tick}: ${midis.map(name).join(' ')}`);
      }
    });
    expect(clashes).toEqual([]);
  });
});

describe('batch 1 review: fixes and gaps', () => {
  it('st-strum-quarters: beat 1 is asked for in plain words, and the about is true about the A shape', () => {
    const song = load('st-strum-quarters');
    expect(song.annotations.map((a) => `${a.bar + 1}:${a.text}`)).toEqual(['1:beat 1 a little stronger']);
    // The open string 6 (E) is the fifth of A: the shape leaves it out so A stays the lowest note.
    expect(chordPcs('A')).toContain(4);
    const about = songEntry('st-strum-quarters')!.about;
    expect(about).not.toMatch(/not part of A/);
    expect(about).toMatch(/leaves string 6 out/);
  });

  it('london-bridge: the quick note behind the level-2 exception is an open string', () => {
    const song = load('london-bridge');
    const sixteenths = song.tracks[0].measures.flatMap((m) => m.beats.filter((b) => b.duration === PPQ / 4));
    expect(sixteenths.length).toBe(2);
    for (const b of sixteenths) expect(b.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['1:0']);
  });

  it('down-in-the-valley: the two traditional verses over the chords, and no claim to a tune it does not have', () => {
    const song = load('down-in-the-valley');
    // Written out from the traditional words, one half-line per two bars.
    const verses = [
      'Down in the valley, | valley so low, | hang your head over, | hear the wind blow. |',
      'Hear the wind blow, dear, | hear the wind blow; | hang your head over, | hear the wind blow. |',
      'Roses love sunshine, | violets love dew, | angels in heaven | know I love you. |',
      'Know I love you, dear, | know I love you; | angels in heaven | know I love you.',
    ]
      .join(' ')
      .split('|')
      .map((s) => s.trim());
    expect(song.annotations.map((a) => a.text)).toEqual(verses);
    expect(song.annotations.map((a) => a.bar)).toEqual(verses.map((_, i) => 2 * i));
    // No melody track and no sung syllables yet (see the review report), so it must not claim singing.
    expect(song.tracks.map((t) => t.role)).toEqual(['rhythm']);
    expect(song.tracks.some((t) => t.measures.some((m) => m.beats.some((b) => b.lyric !== undefined)))).toBe(false);
    expect(songEntry('down-in-the-valley')!.skills).not.toContain('singing');
  });
});
