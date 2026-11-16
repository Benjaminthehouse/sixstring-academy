/**
 * Batch 8 cross-checks: the songs this batch wrote in src/content/songs/<id>/, checked against note
 * lists written out by hand from the composition plans (not copied from the tab), so a wrong fret
 * shows up as a wrong note name in a named bar. Each song is parsed with the song core and checked
 * for: sounding pitches and rhythm bar by bar, chord symbols and where they fall, chord tones on
 * strong beats, key, range and last note, the chord shapes the plan names and what they sound,
 * the study's structure (the change ladder, the folk pattern with its decorations, the 12-bar form
 * with the quick change), first-position frets and fingers, and the core's difficulty estimate.
 *
 * Only the four original studies of the batch are here. The six pieces of the batch were left out
 * (see the batch report): their notes could not be checked against a source in this environment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, type Beat, type Song, type Track } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;
const STANDARD = [40, 45, 50, 55, 59, 64];

/** What one song should contain, written out by hand. */
interface Expected {
  id: string;
  /** The track whose notes are listed (the teacher's tune, or the learner's riff). */
  melody: string;
  /** Every beat of that track, bar by bar ("|" between bars): "C4", "E2+B2" (struck together), "D"/"U" (strums), "r". */
  notes: string;
  /** Duration of every beat, bar by bar: w h. h q. q e. e s q3 e3. */
  rhythm: string;
  /** Chord events as written: "bar:symbol" or "bar@tick:symbol" (bars 1-based). */
  chords: string;
  /** The header key and the key in force at the end, as "tonic mode". */
  key: string;
  endKey: string;
  /** Note names the melody may use. */
  allowed: string[];
  /** Lowest and highest melody note. */
  range: [string, string];
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
}

const BEATS_1_3 = [0, 2 * PPQ];
const C_MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const SHUFFLE_E = 'E2+B2 E2+B2 E2+C#3 E2+C#3 E2+B2 E2+B2 E2+C#3 E2+C#3';
const SHUFFLE_A = 'A2+E3 A2+E3 A2+F#3 A2+F#3 A2+E3 A2+E3 A2+F#3 A2+F#3';
const STRUM_B7 = 'D U D U D U D U';
const SWING_BAR = 'q3 e3 q3 e3 q3 e3 q3 e3';

const SONGS: Expected[] = [
  {
    id: 'st-change-am-fmaj7-c-f',
    melody: 'Teacher',
    // Plan: an A minor tune that floats on A, C and E (shared by Am and Fmaj7) and leans on F over
    // Fmaj7; then a C major answer with F over the F chord, ending A B C.
    notes:
      // Bar 6 (review): C D E, so Am arrives on its own C instead of a B rubbing against the strummed C.
      'A3 C4 E4 | D4 C4 A3 | C4 E4 | E4 D4 C4 | F4 E4 C4 A3 | C4 D4 E4 | F4 E4 | C4 A3 |' +
      'C4 E4 G4 | F4 E4 C4 | C4 F4 | E4 C4 | F4 C4 A3 C4 | G4 E4 C4 | F4 E4 | A3 B3 C4',
    rhythm:
      'q q h | q q h | h h | q q h | q q q q | q q h | h h | h h |' +
      'q q h | q q h | h h | h h | q q q q | q q h | h h | q q h',
    chords: '1:Am 3:Fmaj7 4:Am 5:Fmaj7 6:Am 7:Fmaj7 7@1920:Am 8:Fmaj7 8@1920:Am 9:C 11:F 12:C 13:F 14:C 15:F 15@1920:C 16:F 16@1920:C',
    key: 'A minor',
    endKey: 'C major',
    allowed: C_MAJOR,
    range: ['A3', 'G4'],
    strong: BEATS_1_3,
  },
  {
    id: 'st-change-em-am-em-b7',
    melody: 'Teacher',
    // Plan: an E minor tune; over B7 it uses D#, the leading note, and the last bars resolve
    // A -> G (the seventh of B7 falling to the third of Em) and D# -> E.
    notes:
      'G4 F#4 E4 | B3 | C4 E4 | B3 G3 | A3 C4 E4 C4 | G4 E4 B3 | C4 B3 | A3 C4 B3 |' +
      'E4 G4 F#4 | E4 | D#4 F#4 | E4 B3 | B3 D#4 F#4 D#4 | G4 F#4 E4 | A3 G3 | D#4 E4',
    rhythm:
      'h q q | w | h h | h h | q q q q | q q h | h h | q q h |' +
      'h q q | w | h h | h h | q q q q | q q h | h h | h h',
    chords: '1:Em 3:Am 4:Em 5:Am 6:Em 7:Am 7@1920:Em 8:Am 8@1920:Em 9:Em 11:B7 12:Em 13:B7 14:Em 15:B7 15@1920:Em 16:B7 16@1920:Em',
    key: 'E minor',
    endKey: 'E minor',
    allowed: ['E', 'F#', 'G', 'A', 'B', 'C', 'D#'],
    range: ['G3', 'G4'],
    strong: BEATS_1_3,
  },
  {
    id: 'st-sus-embellish',
    melody: 'Teacher',
    // Plan: the tune sings the moving note of each decoration (G over Dsus4, D over Asus4 and
    // Cadd9, E over Dsus2, B over Asus2) and returns to the chord's third on beat 4.
    notes:
      'F#4 G4 F#4 | E4 D4 A3 | C#4 D4 C#4 | B3 A3 E4 | E4 D4 E4 | G4 E4 C4 | F#4 G4 F#4 | A3 B3 D4 |' +
      'F#4 E4 F#4 | G4 F#4 D4 | C#4 B3 C#4 | E4 C#4 A3 | E4 D4 E4 | C4 E4 G4 | E4 C#4 D4 C#4 | D4',
    rhythm:
      'h q q | q q h | h q q | q q h | h q q | q q h | h q q | q q h |' +
      'h q q | q q h | h q q | q q h | h q q | q q h | q q q q | w',
    chords:
      '1:D 1@2400:Dsus4 1@2880:D 2@2400:Dsus4 2@2880:D 3:A 3@2400:Asus4 3@2880:A 4@2400:Asus4 4@2880:A ' +
      '5:C 5@2400:Cadd9 5@2880:C 6@2400:Cadd9 6@2880:C 7:D 7@2400:Dsus4 7@2880:D 8@2400:Dsus4 8@2880:D ' +
      '9:D 9@2400:Dsus2 9@2880:D 10@2400:Dsus2 10@2880:D 11:A 11@2400:Asus2 11@2880:A 12@2400:Asus2 12@2880:A ' +
      '13:C 13@2400:Cadd9 13@2880:C 14@2400:Cadd9 14@2880:C 15:A 15@2400:Asus4 15@2880:A 16:D 16@2400:Dsus2 16@2880:D',
    key: 'D major',
    endKey: 'D major',
    // D major, plus the C natural of the C chord (bVII).
    allowed: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'C'],
    range: ['A3', 'G4'],
    strong: BEATS_1_3,
  },
  {
    id: 'st-blues-shuffle-e',
    melody: 'Your shuffle',
    // Plan: E A E E | A A E E | B7 A E B7, the E and A shuffles of st-blues-shuffle-a moved to E,
    // B7 strummed long-short; then the last E7 (020100).
    notes: [SHUFFLE_E, SHUFFLE_A, SHUFFLE_E, SHUFFLE_E, SHUFFLE_A, SHUFFLE_A, SHUFFLE_E, SHUFFLE_E, STRUM_B7, SHUFFLE_A, SHUFFLE_E, STRUM_B7, 'E2+B2+D3+G#3+B3+E4'].join(' | '),
    rhythm: [...Array.from({ length: 12 }, () => SWING_BAR), 'w'].join(' | '),
    chords: '1:E 2:A 3:E 5:A 7:E 9:B7 10:A 11:E 12:B7 13:E7',
    key: 'E major',
    endKey: 'E major',
    // E major, plus the D of the final E7.
    allowed: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#', 'D'],
    range: ['E2', 'E4'],
    strong: BEATS_1_3,
  },
];

/**
 * Songs whose estimate is known to sit outside level +/- 1, with the reason (checked and kept on
 * purpose; the estimate must stay within `min`..`max`).
 */
const ESTIMATE_GAPS: Record<string, { min: number; max: number; why: string }> = {
  'st-change-em-am-em-b7': {
    min: 2,
    max: 5,
    why:
      'The core rates a strum study by its chord shapes and how often they change. Em, Am and B7 are open shapes, so it ' +
      'gives 2 for the strum part (3 with the teacher\'s tune), as it does for the level-3 st-change-am-e-e-b7. The plan ' +
      'puts this study at level 4 for its place in the course (the minor-key changes of the level-4 songs); the spec ' +
      'fixes one, two and four downstrums a bar, so nothing in it can be made harder without leaving the plan.',
  },
};

const DURATION: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 640: 'q3', 480: 'e', 320: 'e3', 240: 's' };

function text(id: string): string {
  return readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
}

function parse(source: string, id: string): Song {
  const result = parseSixTab(source);
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  return result.song!;
}

const load = (id: string) => parse(text(id), id);

function trackNamed(song: Song, name: string): Track {
  const t = song.tracks.find((x) => x.name === name);
  if (!t) throw new Error(`no track "${name}" in ${song.meta.id}: ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

const name = (midi: number) => midiToNote(midi, { prefer: 'sharps' });
const pc = (note: string) => noteToMidi(`${note}4`) % 12;
const struck = (b: Beat) => b.notes.filter((n) => !n.tie);
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
/** A chord shape low string first: x02220. */
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');

/** One beat as a token: "C4", "E2+B2", "D" / "U" for a strum, "r" for a rest. */
function token(b: Beat): string {
  if (b.slash) return b.stroke === 'up' ? 'U' : b.stroke === 'down' ? 'D' : '/';
  const notes = struck(b);
  if (!notes.length) return b.notes.length ? '~' : 'r';
  return [...notes].sort((x, y) => x.midi - y.midi).map((n) => name(n.midi)).join('+');
}

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** The voicing given with a symbol somewhere in the song. */
function voicingOf(song: Song, symbol: string): string {
  const c = song.chords.find((x) => x.symbol === symbol && x.voicing);
  return shape(c?.voicing);
}

/** Pitch classes a shape sounds in standard tuning, and its lowest note. */
function shapeSound(frets: string): { pcs: number[]; bass: string } {
  const midis = [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)]));
  return { pcs: [...new Set(midis.map((m) => m % 12))].sort((a, b) => a - b), bass: name(Math.min(...midis)) };
}
const sorted = (pcs: number[]) => [...new Set(pcs)].sort((a, b) => a - b);

/** Fretted (string, fret) pairs of a shape, as "s:f" with the guitarist's string numbers. */
function fretted(frets: string): string[] {
  return [...frets].flatMap((f, i) => (f === 'x' || f === '0' ? [] : [`${6 - i}:${f}`]));
}

/** Every struck note of a track in written order, with where it sits. */
function notesOf(track: Track): Array<{ bar: number; tick: number; midi: number }> {
  return track.measures.flatMap((m, bar) => m.beats.flatMap((b) => struck(b).map((n) => ({ bar, tick: b.start, midi: n.midi }))));
}

/** The key in force at the last bar. */
function endKey(song: Song): string | null {
  let k = song.key ?? '';
  for (const b of song.bars) if (b.key) k = b.key;
  const parsed = parseKey(k);
  return parsed ? `${parsed.tonic} ${parsed.mode}` : null;
}

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 8: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);

  it('sounds the expected notes, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.map(token));
    const expected = bars(want.notes);
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the expected rhythm, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.map((b) => DURATION[b.duration] ?? `${b.duration}t`));
    const expected = bars(want.rhythm);
    expect(got.length).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: rhythm of bar ${i + 1}`).toEqual(expected[i]));
  });

  it('has the chord symbols it should, where it should', () => {
    const got = song.chords.map((c) => `${c.bar + 1}${c.tick ? `@${c.tick}` : ''}:${c.symbol}`).join(' ');
    expect(got).toBe(want.chords);
  });

  it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
    const notes = notesOf(melody);
    const problems: string[] = [];
    notes.forEach((n, i) => {
      if (!want.strong.includes(n.tick)) return;
      const symbol = chordAt(song, n.bar, n.tick);
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
    expect(endKey(song)).toBe(want.endKey);
    const allowed = want.allowed.map(pc);
    const notes = notesOf(melody);
    const outside = notes.filter((n) => !allowed.includes(n.midi % 12)).map((n) => `bar ${n.bar + 1}: ${name(n.midi)}`);
    expect(outside, `${id}: notes outside ${want.allowed.join(' ')}`).toEqual([]);
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    const lastBeat = melody.measures[melody.measures.length - 1].beats.filter((b) => struck(b).length).pop()!;
    const lowest = Math.min(...struck(lastBeat).map((n) => n.midi));
    expect(name(lowest).replace(/\d+$/, ''), `${id}: last note`).toBe(want.endKey.split(' ')[0]);
    // The key in meta.ts is the header key.
    expect(parseKey(songEntry(id)!.key)?.tonic).toBe(want.key.split(' ')[0]);
  });

  it('stays in first position (frets 0 to 4), with fingers that fit the frets', () => {
    for (const t of song.tracks) {
      for (const [bar, m] of t.measures.entries()) {
        for (const b of m.beats) {
          for (const n of b.notes) {
            expect(n.fret, `${id}: ${t.name} bar ${bar + 1} string ${n.string}`).toBeLessThanOrEqual(4);
            if (n.finger !== undefined) expect(n.fret - Number(n.finger), `${id}: ${t.name} bar ${bar + 1}: finger ${n.finger} on fret ${n.fret}`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
    for (const c of song.chords) if (c.voicing) for (const f of c.voicing) expect(f ?? 0, `${id}: ${c.symbol} shape`).toBeLessThanOrEqual(4);
  });

  it('every chord shape sounds its symbol, with the root in the bass', () => {
    for (const c of song.chords) {
      if (!c.voicing) continue;
      const s = shapeSound(shape(c.voicing));
      expect(s.pcs, `${id}: ${c.symbol}=${shape(c.voicing)}`).toEqual(sorted(chordPcs(c.symbol)));
      expect(s.bass.replace(/\d+$/, ''), `${id}: ${c.symbol} bass`).toBe(c.symbol.match(/^[A-G][#b]?/)![0]);
    }
  });

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    const yours = estimateDifficulty(song, { track: 0 });
    const slow = estimateDifficulty(song, { track: 0, tempoPercent: 70 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(
      `${id}: level ${level}; your part ${yours.level} (${slow.level} at 70%), all tracks ${all.level}; ` +
        `${[...new Set([...yours.reasons, ...all.reasons])].join(' ') || 'no hard spots'}`,
    );
    const gap = ESTIMATE_GAPS[id];
    expect(yours.level, `${id}: estimate ${yours.level} is far below level ${level}`).toBeGreaterThanOrEqual(gap?.min ?? level - 1);
    expect(yours.level, `${id}: estimate ${yours.level} is far above level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(gap?.max ?? level + 1);
  });
});

describe('batch 8: the chord-change ladders', () => {
  /** Strums of the learner's part: duration and chord in force, bar by bar. */
  function ladder(song: Song) {
    const strum = trackNamed(song, 'Your strum');
    expect(strum.role).toBe('rhythm');
    for (const [i, m] of strum.measures.entries()) {
      expect(m.beats.every((b) => b.slash && b.stroke === 'down'), `bar ${i + 1}: downstrums only`).toBe(true);
    }
    return {
      durations: strum.measures.map((m) => m.beats.map((b) => DURATION[b.duration]).join(' ')),
      chords: strum.measures.map((m, bar) => m.beats.map((b) => chordAt(song, bar, b.start)).join(' ')),
    };
  }
  // 2 bars held (one strum each), 2 bars changing every bar with two strums, 2 with four, 2 changing every two beats.
  const RUNG = ['w', 'w', 'h h', 'h h', 'q q q q', 'q q q q', 'q q q q', 'q q q q'];

  it('st-change-am-fmaj7-c-f: the ladder twice, Am-Fmaj7 then C-F, with the plan\'s shapes', () => {
    const song = load('st-change-am-fmaj7-c-f');
    const { durations, chords } = ladder(song);
    expect(durations).toEqual([...RUNG, ...RUNG.slice(0, 7), 'q q h']);
    expect(chords).toEqual([
      'Am', 'Am', 'Fmaj7 Fmaj7', 'Am Am', 'Fmaj7 Fmaj7 Fmaj7 Fmaj7', 'Am Am Am Am', 'Fmaj7 Fmaj7 Am Am', 'Fmaj7 Fmaj7 Am Am',
      'C', 'C', 'F F', 'C C', 'F F F F', 'C C C C', 'F F C C', 'F F C',
    ]);
    expect(['Am', 'Fmaj7', 'C', 'F'].map((s) => voicingOf(song, s))).toEqual(['x02210', 'xx3210', 'x32010', 'xx3211']);
    // Am to Fmaj7: finger 1 stays on string 2 fret 1 (C); Fmaj7 has 3 on string 4 fret 3 (F) and 2 on string 3 fret 2 (A).
    expect(fretted('x02210')).toContain('2:1');
    expect(fretted('xx3210')).toEqual(['4:3', '3:2', '2:1']);
    expect(name(STANDARD[2] + 3)).toBe('F3');
    expect(name(STANDARD[3] + 2)).toBe('A3');
    // C to F: string 2 fret 1 stays, and the same finger flattens onto string 1 fret 1 (two-string barre).
    expect(fretted('x32010')).toContain('2:1');
    expect(fretted('xx3211').filter((p) => p.endsWith(':1'))).toEqual(['2:1', '1:1']);
    // Both F shapes are strummed on strings 4 to 1.
    for (const s of ['Fmaj7', 'F']) expect(voicingOf(song, s).slice(0, 2)).toBe('xx');
  });

  it('st-change-em-am-em-b7: the ladder twice, Em-Am then Em-B7, with the plan\'s shapes', () => {
    const song = load('st-change-em-am-em-b7');
    const { durations, chords } = ladder(song);
    expect(durations).toEqual([...RUNG, ...RUNG.slice(0, 7), 'q q h']);
    expect(chords).toEqual([
      'Em', 'Em', 'Am Am', 'Em Em', 'Am Am Am Am', 'Em Em Em Em', 'Am Am Em Em', 'Am Am Em Em',
      'Em', 'Em', 'B7 B7', 'Em Em', 'B7 B7 B7 B7', 'Em Em Em Em', 'B7 B7 Em Em', 'B7 B7 Em',
    ]);
    expect(['Em', 'Am', 'B7'].map((s) => voicingOf(song, s))).toEqual(['022000', 'x02210', 'x21202']);
    // Em fingered 2 and 3 on strings 5 and 4: for Am the pair moves one string toward string 1 and 1 adds C.
    expect(fretted('022000')).toEqual(['5:2', '4:2']);
    expect(fretted('x02210')).toEqual(['4:2', '3:2', '2:1']);
    expect([name(STANDARD[2] + 2), name(STANDARD[3] + 2), name(STANDARD[4] + 1)]).toEqual(['E3', 'A3', 'C4']);
    // Em to B7: string 5 fret 2 (B) is in both.
    expect(fretted('x21202')).toContain('5:2');
    expect(name(STANDARD[1] + 2)).toBe('B2');
  });
});

describe('batch 8: st-sus-embellish', () => {
  const song = load('st-sus-embellish');
  const strum = trackNamed(song, 'Your strum');
  // The decorated chord of every bar, and how it is made from the plain one.
  const PAIRS: Array<[string, string]> = [
    ['D', 'Dsus4'], ['D', 'Dsus4'], ['A', 'Asus4'], ['A', 'Asus4'], ['C', 'Cadd9'], ['C', 'Cadd9'], ['D', 'Dsus4'], ['D', 'Dsus4'],
    ['D', 'Dsus2'], ['D', 'Dsus2'], ['A', 'Asus2'], ['A', 'Asus2'], ['C', 'Cadd9'], ['C', 'Cadd9'], ['A', 'Asus4'], ['D', 'Dsus2'],
  ];
  const SHAPES: Record<string, string> = {
    D: 'xx0232', Dsus4: 'xx0233', Dsus2: 'xx0230', A: 'x02220', Asus4: 'x02230', Asus2: 'x02200', C: 'x32010', Cadd9: 'x32030',
  };

  it('plays the folk pattern of st-strum-folk in all 16 bars (the last ends on a quarter down)', () => {
    const folk = '0:q:D 960:e:D 1440:q:U 2400:e:U 2880:e:D 3360:e:U';
    expect(strum.measures.length).toBe(16);
    strum.measures.forEach((m, i) => {
      const got = m.beats.map((b) => `${b.start}:${DURATION[b.duration]}:${b.slash ? (b.stroke === 'up' ? 'U' : 'D') : '?'}`).join(' ');
      expect(got, `bar ${i + 1}`).toBe(i === 15 ? '0:q:D 960:e:D 1440:q:U 2400:e:U 2880:q:D' : folk);
    });
  });

  it('plain chord on beats 1 and 2, the decoration on the up-strum after the missed beat 3, plain again on beat 4', () => {
    strum.measures.forEach((m, bar) => {
      const [plain, decorated] = PAIRS[bar];
      for (const b of m.beats) {
        const want = b.start === 2400 ? decorated : plain;
        expect(chordAt(song, bar, b.start), `bar ${bar + 1}, tick ${b.start}`).toBe(want);
      }
    });
  });

  it('uses the plan\'s shapes, and each decoration adds or lifts one finger with nothing else moving', () => {
    for (const [s, frets] of Object.entries(SHAPES)) expect(voicingOf(song, s), s).toBe(frets);
    for (const [plain, decorated] of [...new Set(PAIRS.map((p) => p.join('>')))].map((p) => p.split('>') as [string, string])) {
      const a = SHAPES[plain];
      const b = SHAPES[decorated];
      const changed = [...a].map((f, i) => (f === b[i] ? -1 : i)).filter((i) => i >= 0);
      expect(changed.length, `${plain} -> ${decorated}: one string changes`).toBe(1);
      const i = changed[0];
      if (decorated.includes('sus2')) expect(b[i], `${decorated}: a finger lifts (open string)`).toBe('0');
      else expect(Number(b[i]), `${decorated}: a finger goes down above the old one`).toBeGreaterThan(Number(a[i]));
    }
  });

  it('names the decorations correctly: sus4 and sus2 replace the third, add9 keeps it and adds the ninth', () => {
    for (const [plain, decorated] of PAIRS) {
      const root = chordPcs(plain)[0];
      const third = (root + 4) % 12;
      const base = chordPcs(plain);
      const expected = decorated.endsWith('sus4')
        ? base.filter((x) => x !== third).concat((root + 5) % 12)
        : decorated.endsWith('sus2')
          ? base.filter((x) => x !== third).concat((root + 2) % 12)
          : base.concat((root + 2) % 12);
      expect(sorted(chordPcs(decorated)), `${decorated} from ${plain}`).toEqual(sorted(expected));
      // What the shape sounds agrees with the name (third gone or kept).
      const sound = shapeSound(SHAPES[decorated]).pcs;
      expect(sound.includes(third), `${decorated}=${SHAPES[decorated]}: third ${decorated.includes('add9') ? 'kept' : 'gone'}`).toBe(decorated.includes('add9'));
    }
  });

  it("the teacher's note on the decorated up-strum belongs to the decorated chord, and on beat 4 to the plain one", () => {
    const tl = flattenSong(song, { unroll: false });
    const teacher = trackNamed(song, 'Teacher');
    const problems: string[] = [];
    for (let bar = 0; bar < 16; bar++) {
      const start = tl.bars[bar].start;
      for (const [tick, symbol] of [[2400, PAIRS[bar][1]], [2880, PAIRS[bar][0]]] as Array<[number, string]>) {
        const beat = tl.beatAt(teacher.id, start + tick);
        const sounding = beat ? struck(beat.source).concat(beat.source.notes.filter((n) => n.tie)) : [];
        for (const n of sounding) if (!chordPcs(symbol).includes(n.midi % 12)) problems.push(`bar ${bar + 1} @${tick}: ${name(n.midi)} against ${symbol}`);
        if (!sounding.length) problems.push(`bar ${bar + 1} @${tick}: nothing sounding`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('batch 8: st-blues-shuffle-e', () => {
  const song = load('st-blues-shuffle-e');
  const shuffle = trackNamed(song, 'Your shuffle');

  it('plays the 12-bar form with the quick change, twice, then the last E7', () => {
    const tl = flattenSong(song);
    const played = tl.bars.map((b) => chordAt(song, b.bar, 0));
    const form = ['E', 'A', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E', 'B7'];
    expect(played).toEqual([...form, ...form, 'E7']);
    expect(played[1], 'quick change: IV in bar 2').toBe('A');
  });

  it('shuffles as the plan says: root with fifth then sixth, long-short, fingers 1 and 3', () => {
    for (const [bar, m] of shuffle.measures.entries()) {
      const chord = chordAt(song, bar, 0);
      if (chord !== 'E' && chord !== 'A') continue;
      const [open, other] = chord === 'E' ? [6, 5] : [5, 4];
      m.beats.forEach((b, i) => {
        expect(b.duration, `bar ${bar + 1} beat ${i}`).toBe(i % 2 === 0 ? 640 : 320);
        const frets = b.notes.map((n) => `${n.string}:${n.fret}`).join(' ');
        expect(frets, `bar ${bar + 1} beat ${i}`).toBe(`${open}:0 ${other}:${Math.floor(i / 2) % 2 === 0 ? 2 : 4}`);
        for (const n of b.notes) if (n.finger !== undefined) expect(n.finger, `bar ${bar + 1}: finger on fret ${n.fret}`).toBe(n.fret === 2 ? 1 : 3);
      });
    }
  });

  it('strums B7 (x21202) down on the beat and up on the short note in bars 9 and 12', () => {
    for (const bar of [8, 11]) {
      const beats = shuffle.measures[bar].beats;
      expect(beats.every((b) => b.slash), `bar ${bar + 1}`).toBe(true);
      expect(beats.map((b) => `${b.duration}${b.stroke === 'up' ? 'U' : 'D'}`).join(' ')).toBe('640D 320U 640D 320U 640D 320U 640D 320U');
      expect(chordAt(song, bar, 0)).toBe('B7');
    }
    expect(voicingOf(song, 'B7')).toBe('x21202');
    expect(voicingOf(song, 'E7')).toBe('020100');
  });
});

describe('batch 8 review: what the teacher plays against your chords', () => {
  /** The struck pitches of a track sounding at a bar and tick (the beat that covers it). */
  function soundingAt(track: Track, bar: number, tick: number): number[] {
    const beat = track.measures[bar].beats.find((b) => b.start <= tick && tick < b.start + b.duration);
    return beat ? beat.notes.map((n) => n.midi) : [];
  }
  /** Strong-beat (beats 1 and 3) notes of the teacher that are not in the chord in force, as "bar@tick:Note/Chord". */
  function offChord(song: Song): string[] {
    const teacher = trackNamed(song, 'Teacher');
    return notesOf(teacher)
      .filter((n) => BEATS_1_3.includes(n.tick) && !chordPcs(chordAt(song, n.bar, n.tick)!).includes(n.midi % 12))
      .map((n) => `${n.bar + 1}@${n.tick}:${name(n.midi)}/${chordAt(song, n.bar, n.tick)}`);
  }

  for (const id of ['st-change-am-fmaj7-c-f', 'st-change-em-am-em-b7']) {
    it(`${id}: at every change the teacher sounds only notes of the new chord`, () => {
      const song = load(id);
      const teacher = trackNamed(song, 'Teacher');
      const problems: string[] = [];
      song.chords.forEach((c, i) => {
        if (i > 0 && song.chords[i - 1].symbol === c.symbol) return;
        const pitches = soundingAt(teacher, c.bar, c.tick);
        if (!pitches.length) problems.push(`bar ${c.bar + 1}: silent at the change to ${c.symbol}`);
        for (const m of pitches) if (!chordPcs(c.symbol).includes(m % 12)) problems.push(`bar ${c.bar + 1}@${c.tick}: ${name(m)} against the new ${c.symbol}`);
      });
      expect(problems).toEqual([]);
    });
  }

  it('the only strong-beat notes off the chord are the ones written on purpose', () => {
    // Am-Fmaj7: two suspensions in the second bar of a held chord (D falling to C over Am, F to E over C).
    expect(offChord(load('st-change-am-fmaj7-c-f'))).toEqual(['2@0:D4/Am', '10@0:F4/C']);
    // Em-B7: one passing note, G F# E in bar 1.
    expect(offChord(load('st-change-em-am-em-b7'))).toEqual(['1@1920:F#4/Em']);
    // Each suspension sits in a bar that keeps the previous bar's chord and falls one step to a chord tone.
    const song = load('st-change-am-fmaj7-c-f');
    const teacher = trackNamed(song, 'Teacher');
    for (const bar of [1, 9]) {
      expect(chordAt(song, bar, 0), `bar ${bar + 1} holds its chord`).toBe(chordAt(song, bar - 1, 3839));
      const [first, second] = teacher.measures[bar].beats.map((b) => b.notes[0].midi);
      expect(first - second, `bar ${bar + 1}: falls a step`).toBeGreaterThanOrEqual(1);
      expect(first - second).toBeLessThanOrEqual(2);
      expect(chordPcs(chordAt(song, bar, 0)!)).toContain(second % 12);
    }
  });

  it('st-sus-embellish: the tune sings the moving note on beat 3 of every odd bar, and a note of the decoration in every bar', () => {
    const song = load('st-sus-embellish');
    const teacher = trackNamed(song, 'Teacher');
    const problems: string[] = [];
    for (let bar = 0; bar < 16; bar++) {
      const plain = chordAt(song, bar, 0)!;
      const decorated = chordAt(song, bar, 2400)!;
      const moving = chordPcs(decorated).filter((p) => !chordPcs(plain).includes(p));
      expect(moving.length, `bar ${bar + 1}: ${plain} -> ${decorated} adds one note`).toBe(1);
      const at3 = soundingAt(teacher, bar, 1920);
      for (const m of at3) if (!chordPcs(decorated).includes(m % 12)) problems.push(`bar ${bar + 1}: ${name(m)} on beat 3 is not in ${decorated}`);
      const startsOn3 = teacher.measures[bar].beats.some((b) => b.start === 1920 && b.notes.length);
      if (bar % 2 === 0 && !(startsOn3 && at3.some((m) => m % 12 === moving[0]))) problems.push(`bar ${bar + 1}: beat 3 does not sing the moving note of ${decorated}`);
    }
    expect(problems).toEqual([]);
    // The second section names its chord where it starts, for a learner who loops it.
    expect(song.chords.find((c) => c.bar === 8 && c.tick === 0)?.symbol).toBe('D');
  });
});

describe('batch 8: the cross-check catches a wrong fret', () => {
  it('the leading note D# played a fret low (string 2 fret 3 = D) fails the note list and the scale', () => {
    const broken = parse(text('st-change-em-am-em-b7').replace('h 2:4 1:2', 'h 2:3 1:2'), 'broken');
    const bar11 = trackNamed(broken, 'Teacher').measures[10].beats.map(token);
    expect(bar11).toEqual(['D4', 'F#4']);
    expect(bar11).not.toEqual(bars(SONGS[1].notes)[10]);
    expect(scalePcs('E', 'harmonic-minor')).not.toContain(noteToMidi('D4') % 12);
  });

  it('a Dsus4 with the finger one fret too high (xx0234) no longer sounds Dsus4', () => {
    const broken = parse(text('st-sus-embellish').replace('"Dsus4=xx0233" e U "D=xx0232" D U |', '"Dsus4=xx0234" e U "D=xx0232" D U |'), 'broken');
    const v = shape(broken.chords.find((c) => c.symbol === 'Dsus4')?.voicing);
    expect(v).toBe('xx0234');
    expect(shapeSound(v).pcs).not.toEqual(sorted(chordPcs('Dsus4')));
  });

  it('the shuffle\'s sixth played a fret high (string 5 fret 5 = D) fails the note list', () => {
    const broken = parse(text('st-blues-shuffle-e').replace('q3 (6:0 5:4{3})', 'q3 (6:0 5:5{3})'), 'broken');
    const bar1 = trackNamed(broken, 'Your shuffle').measures[0].beats.map(token);
    expect(bar1[2]).toBe('E2+D3');
    expect(bar1).not.toEqual(bars(SONGS[3].notes)[0]);
  });
});
