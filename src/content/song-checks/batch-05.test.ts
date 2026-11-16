/**
 * Independent cross-checks for batch 5 of the built-in songs (level-3 original studies):
 * st-change-g-d7-d-g, st-change-c-am-am-dm, st-change-am-e-e-b7, st-strum-folk, st-strum-6-8,
 * st-boom-chick, st-power-chords-open, st-lick-hammer-on, st-lick-pull-off, st-pima-arpeggios.
 *
 * The expected notes below were written out by hand as note names from the composition plan,
 * not copied from the tab, so a wrong fret shows up as a wrong note. Each song is parsed with the
 * song core and compared beat by beat: sounding pitches (chords low to high), hammer-ons and
 * pull-offs, strum directions and positions, chord shapes and what they sound, notes on strong
 * beats against the chord in force, the key or scale, the range, the frets used, and the
 * difficulty estimate against the plan's level.
 */
import { describe, expect, it } from 'vitest';
import { barLength, estimateDifficulty, flattenSong, parseSixTab, type Song } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { loadSongText } from '@/content/songs';

const STANDARD = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const BAR_44 = 3840;
const BAR_68 = 2880;

/** "G2+B2" or "E3h" -> canonical sharps spelling, so the comparison is by pitch, not by spelling. */
function canon(token: string): string {
  if (token === 'r') return 'r';
  const m = /^(.*\d)([hp]?)$/.exec(token);
  if (!m) throw new Error(`bad expected token ${token}`);
  const names = m[1].split('+').map((n) => noteToMidi(n)).sort((a, b) => a - b).map((x) => midiToNote(x, { prefer: 'sharps' }));
  return names.join('+') + m[2];
}

/** Repeat a bar's worth of tokens. */
const times = (n: number, bar: string[]): string[][] => Array.from({ length: n }, () => bar);

interface Played {
  bar: number;
  inBar: number;
  token: string;
  midis: number[];
  frets: Array<{ string: number; fret: number; legato?: 'hammer' | 'pull'; pluck?: string }>;
  slash: boolean;
  stroke?: 'down' | 'up';
  chord: string | null;
  voicing: string | null;
}

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  return result.song!;
}

/** Every beat of a track (rests included), in order, with what it sounds. */
function played(song: Song, trackName: string): Played[] {
  const track = song.tracks.find((t) => t.name === trackName);
  if (!track) throw new Error(`no track ${trackName}`);
  const tl = flattenSong(song);
  return tl.trackBeats(track.id).map((b) => {
    const bar = tl.barAt(b.tick);
    const chord = tl.chordAt(b.tick);
    const struck = b.notes.filter((n) => !n.tie);
    const midis = struck.map((n) => n.midi).sort((x, y) => x - y);
    let token = b.source.slash ? 'slash' : midis.length ? midis.map((x) => midiToNote(x, { prefer: 'sharps' })).join('+') : 'r';
    if (struck.length === 1 && struck[0].legato) token += struck[0].legato === 'hammer' ? 'h' : 'p';
    return {
      bar: b.bar,
      inBar: b.tick - bar.start,
      token,
      midis,
      frets: struck.map((n) => ({ string: n.string, fret: n.fret, legato: n.legato, pluck: n.pluck })),
      slash: !!b.source.slash,
      stroke: b.source.stroke,
      chord: chord?.symbol ?? null,
      voicing: chord?.voicing ? chord.voicing.map((f) => (f === null ? 'x' : String(f))).join('') : null,
    };
  });
}

/** The tokens of a note track, bar by bar. */
function tokensByBar(beats: Played[], bars: number): string[][] {
  const out: string[][] = Array.from({ length: bars }, () => []);
  for (const b of beats) out[b.bar].push(b.token);
  return out;
}

/** What a shape sounds in standard tuning, low to high (frets low string first, x = not played). */
function shapeSounds(frets: string): number[] {
  return [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)])).sort((a, b) => a - b);
}

/** Notes on strong beats must be chord tones, or a step away from a chord tone that follows (a neighbour or passing note). */
function strongBeatProblems(beats: Played[], strong: number[]): string[] {
  const notes = beats.filter((b) => b.midis.length > 0);
  const problems: string[] = [];
  notes.forEach((b, i) => {
    if (!strong.includes(b.inBar) || !b.chord) return;
    const tones = new Set(chordPcs(b.chord));
    const out = b.midis.filter((m) => !tones.has(m % 12));
    if (!out.length) return;
    const next = notes[i + 1];
    const resolves = b.midis.length === 1 && !!next && next.midis.length >= 1 && Math.abs(next.midis[0] - b.midis[0]) <= 2 && tones.has(next.midis[0] % 12);
    if (!resolves) problems.push(`bar ${b.bar + 1} tick ${b.inBar}: ${b.token} is not in ${b.chord} and does not step to a chord tone`);
  });
  return problems;
}

/** Pitch classes outside a set. */
function outside(midis: number[], pcs: number[]): string[] {
  const allowed = new Set(pcs);
  return [...new Set(midis.filter((m) => !allowed.has(m % 12)).map((m) => midiToNote(m, { prefer: 'sharps' })))];
}

/** The difficulty estimate of the learner's track lands within one level of the plan's 3. */
function expectLevelNear(song: Song, trackName: string, level: number): void {
  const track = song.tracks.find((t) => t.name === trackName)!;
  const est = estimateDifficulty(song, { track: track.id });
  expect(Math.abs(est.level - level), `${song.meta.title}: estimated level ${est.level} (score ${est.score}, ${JSON.stringify(est.factors)})`).toBeLessThanOrEqual(1);
}

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Each shape the plan names, with the notes it should sound, low to high. */
const SHAPES: Record<string, string[]> = {
  'G=320003': ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
  'G=320033': ['G2', 'B2', 'D3', 'G3', 'D4', 'G4'],
  'D7=xx0212': ['D3', 'A3', 'C4', 'F#4'],
  'D=xx0232': ['D3', 'A3', 'D4', 'F#4'],
  'C=x32010': ['C3', 'E3', 'G3', 'C4', 'E4'],
  'Am=x02210': ['A2', 'E3', 'A3', 'C4', 'E4'],
  'Dm=xx0231': ['D3', 'A3', 'D4', 'F4'],
  'E=022100': ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
  'B7=x21202': ['B2', 'D#3', 'A3', 'B3', 'F#4'],
  'Em=022000': ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'],
  'G7=320001': ['G2', 'B2', 'D3', 'G3', 'B3', 'F4'],
  'E5=022xxx': ['E2', 'B2', 'E3'],
  'A5=x022xx': ['A2', 'E3', 'A3'],
  'D5=xx023x': ['D3', 'A3', 'D4'],
  'G5=355xxx': ['G2', 'D3', 'G3'],
  'C5=x355xx': ['C3', 'G3', 'C4'],
};

describe('batch 5: the chord shapes', () => {
  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, and only its chord tones', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets).map((m) => midiToNote(m, { prefer: 'sharps' }))).toEqual(names.map(canon));
    const tones = new Set(chordPcs(symbol));
    expect(names.every((n) => tones.has(noteToMidi(n) % 12)), `${shape} has a note outside ${symbol}`).toBe(true);
    expect([...tones].every((pc) => names.some((n) => noteToMidi(n) % 12 === pc)), `${shape} leaves out a note of ${symbol}`).toBe(true);
  });
});

// ---------------------------------------------------------------- change studies
interface ChangeStudy {
  id: string;
  key: string;
  /** The chord shape of each strum, bar by bar. */
  strums: string[][];
  /** Each half's key and the bars it covers. */
  halves: Array<{ key: string; scale: string; from: number; to: number }>;
}

/** The ladder of one half: home chord two bars, then Y X with 2 strums, Y X with 4, (Y X)(Y X) every two beats. */
function ladder(home: string, other: string): string[][] {
  return [[home], [home], [other, other], [home, home], [other, other, other, other], [home, home, home, home], [other, other, home, home], [other, other, home, home]];
}

const CHANGES: ChangeStudy[] = [
  {
    id: 'st-change-g-d7-d-g',
    key: 'G major',
    strums: [...ladder('G=320003', 'D7=xx0212'), ...ladder('G=320033', 'D=xx0232')],
    halves: [{ key: 'G', scale: 'major', from: 0, to: 16 }],
  },
  {
    id: 'st-change-c-am-am-dm',
    key: 'C major',
    strums: [...ladder('C=x32010', 'Am=x02210'), ...ladder('Am=x02210', 'Dm=xx0231')],
    halves: [{ key: 'C', scale: 'major', from: 0, to: 8 }, { key: 'A', scale: 'minor', from: 8, to: 16 }],
  },
  {
    id: 'st-change-am-e-e-b7',
    key: 'A minor',
    strums: [...ladder('Am=x02210', 'E=022100'), ...ladder('E=022100', 'B7=x21202')],
    halves: [{ key: 'A', scale: 'harmonic-minor', from: 0, to: 8 }, { key: 'E', scale: 'major', from: 8, to: 16 }],
  },
];

describe.each(CHANGES)('batch 5: $id', (study) => {
  it('strums the ladder: shapes, counts and downstrokes as planned, every change on a beat', async () => {
    const song = await load(study.id);
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 4 && b.time.denominator === 4)).toBe(true);
    const beats = played(song, 'Your strum');
    expect(beats.every((b) => b.slash && b.stroke === 'down'), 'every beat is a down-strum').toBe(true);
    const byBar: string[][] = Array.from({ length: 16 }, () => []);
    for (const b of beats) byBar[b.bar].push(`${b.chord}=${b.voicing}`);
    expect(byBar).toEqual(study.strums);
    // Strums are evenly spaced inside each bar (1, 2 or 4 per bar), so each lands on a beat.
    for (const b of beats) expect(b.inBar % 960, `bar ${b.bar + 1}: a strum off the beat`).toBe(0);
    for (const c of song.chords) expect(c.tick % 960, `chord ${c.symbol} in bar ${c.bar + 1} changes off the beat`).toBe(0);
  });

  it('uses only shapes from the plan, and each half stays in its key', async () => {
    const song = await load(study.id);
    expect(parseKey(song.key ?? '')?.tonic + ' ' + parseKey(song.key ?? '')?.mode).toBe(study.key);
    for (const c of song.chords) expect(Object.keys(SHAPES), `${c.symbol}`).toContain(`${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`);
    for (const half of study.halves) {
      const pcs = song.chords.filter((c) => c.bar >= half.from && c.bar < half.to).flatMap((c) => chordPcs(c.symbol));
      expect(outside(pcs.map((pc) => pc + 60), scalePcs(half.key, half.scale)), `bars ${half.from + 1}-${half.to}: outside ${half.key} ${half.scale}`).toEqual([]);
    }
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load(study.id), 'Your strum', 3);
  });
});

// ---------------------------------------------------------------- strumming studies
describe('batch 5: st-strum-folk', () => {
  it('plays down, down-up, (miss), up, down-up in all 16 bars over G C D G', async () => {
    const song = await load('st-strum-folk');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your strum');
    for (let bar = 0; bar < 16; bar++) {
      const inBar = beats.filter((b) => b.bar === bar);
      expect(inBar.map((b) => `${b.inBar}${b.stroke === 'up' ? 'U' : 'D'}`), `bar ${bar + 1}`).toEqual(['0D', '960D', '1440U', '2400U', '2880D', '3360U']);
      const shape = bar < 4 || bar >= 12 ? 'G=320003' : bar < 8 ? 'C=x32010' : 'D=xx0232';
      expect(inBar.every((b) => `${b.chord}=${b.voicing}` === shape), `bar ${bar + 1} is ${shape}`).toBe(true);
    }
    // Nothing is struck on beat 3 (tick 1920) or on the and of 1 (tick 480): the hand moves without touching.
    expect(beats.some((b) => b.inBar === 1920 || b.inBar === 480)).toBe(false);
  });

  it('has a teacher bass of root and fifth on beats 1 and 3', async () => {
    const song = await load('st-strum-folk');
    const bass = song.tracks.find((t) => t.name === 'Teacher bass')!;
    expect(bass.role).toBe('bass');
    expect(song.tracks.find((t) => t.name === 'Teacher bass')?.tuning ?? BASS).toEqual(BASS);
    const tokens = tokensByBar(played(song, 'Teacher bass'), 16);
    const expected = [...times(4, ['G1', 'D2']), ...times(4, ['C2', 'G1']), ...times(4, ['D2', 'A1']), ...times(3, ['G1', 'D2']), ['G1']];
    expect(tokens).toEqual(expected.map((bar) => bar.map(canon)));
    expect(strongBeatProblems(played(song, 'Teacher bass'), [0, 1920])).toEqual([]);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-strum-folk'), 'Your strum', 3);
  });
});

describe('batch 5: st-strum-6-8', () => {
  it('plays down, down, up twice in every 6/8 bar over Em C D Em', async () => {
    const song = await load('st-strum-6-8');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 6 && b.time.denominator === 8)).toBe(true);
    expect(parseKey(song.key ?? '')?.tonic).toBe('E');
    const beats = played(song, 'Your strum');
    for (let bar = 0; bar < 16; bar++) {
      const inBar = beats.filter((b) => b.bar === bar);
      expect(inBar.map((b) => `${b.inBar}${b.stroke === 'up' ? 'U' : 'D'}`), `bar ${bar + 1}`).toEqual(['0D', '480D', '960U', '1440D', '1920D', '2400U']);
      const shape = bar < 4 || bar >= 12 ? 'Em=022000' : bar < 8 ? 'C=x32010' : 'D=xx0232';
      expect(inBar.every((b) => `${b.chord}=${b.voicing}` === shape), `bar ${bar + 1} is ${shape}`).toBe(true);
    }
    expect(song.annotations.some((a) => /accent/i.test(a.text) && /1/.test(a.text) && /4/.test(a.text))).toBe(true);
  });

  it('has a teacher bass on 1 and 4 (root, fifth) that fits each chord', async () => {
    const song = await load('st-strum-6-8');
    const beats = played(song, 'Teacher bass');
    const expected = [...times(4, ['E1', 'B1']), ...times(4, ['C2', 'G1']), ...times(4, ['D2', 'A1']), ...times(3, ['E1', 'B1']), ['E1']];
    expect(tokensByBar(beats, 16)).toEqual(expected.map((bar) => bar.map(canon)));
    expect(beats.filter((b) => b.midis.length).every((b) => b.inBar === 0 || b.inBar === 1440)).toBe(true);
    expect(strongBeatProblems(beats, [0, 1440])).toEqual([]);
    expect(song.bars.every((b) => barLength(b) === BAR_68)).toBe(true);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-strum-6-8'), 'Your strum', 3);
  });
});

// ---------------------------------------------------------------- boom-chick
describe('batch 5: st-boom-chick', () => {
  const G = ['G2', 'D3+G3+B3+G4', 'D3', 'D3+G3+B3+G4'];
  const C = ['C3', 'E3+G3+C4+E4', 'G2', 'E3+G3+C4+E4'];
  const D7 = ['D3', 'D3+A3+C4+F#4', 'A2', 'D3+A3+C4+F#4'];
  const WALK = ['G2', 'G2', 'A2', 'B2'];
  const EXPECTED = [...times(3, G), WALK, ...times(4, C), ...times(4, D7), ...times(4, G)];

  it('alternates bass and strings 4-1 strums, with the walk-up G A B into C', async () => {
    const song = await load('st-boom-chick');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your part');
    expect(tokensByBar(beats, 16)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    // Every chick is a down-strum of exactly strings 4, 3, 2 and 1; every boom is one note.
    for (const b of beats) {
      if (b.midis.length > 1) {
        expect(b.stroke, `bar ${b.bar + 1}`).toBe('down');
        expect(b.frets.map((f) => f.string).sort()).toEqual([1, 2, 3, 4]);
      } else expect(b.midis.length).toBe(1);
    }
    // The bass strings the plan names: G 6 and 4, C 5 and 6, D7 4 and 5.
    const bassStrings = (from: number, to: number) => [...new Set(beats.filter((b) => b.bar >= from && b.bar < to && b.midis.length === 1).map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))].sort();
    expect(bassStrings(0, 3)).toEqual(['4:0', '6:3']);
    expect(bassStrings(4, 8)).toEqual(['5:3', '6:3']);
    expect(bassStrings(8, 12)).toEqual(['4:0', '5:0']);
    expect(bassStrings(3, 4)).toEqual(['5:0', '5:2', '6:3']);
    expect(beats.find((b) => b.bar === 4 && b.inBar === 0)?.frets).toEqual([expect.objectContaining({ string: 5, fret: 3 })]);
  });

  it('puts chord tones on beats 1 and 3, except the passing A of the walk-up, and every chick fits its chord', async () => {
    const song = await load('st-boom-chick');
    const beats = played(song, 'Your part');
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    for (const b of beats.filter((x) => x.midis.length > 1)) expect(outside(b.midis, chordPcs(b.chord!)), `bar ${b.bar + 1}`).toEqual([]);
    expect(song.chords.map((c) => `${c.bar}:${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`)).toEqual(['0:G=320003', '4:C=x32010', '8:D7=xx0212', '12:G=320003']);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('G', 'major'))).toEqual([]);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-boom-chick'), 'Your part', 3);
  });
});

// ---------------------------------------------------------------- power chords
describe('batch 5: st-power-chords-open', () => {
  const E5 = 'E2+B2+E3';
  const A5 = 'A2+E3+A3';
  const D5 = 'D3+A3+D4';
  const G5 = 'G2+D3+G3';
  const C5 = 'C3+G3+C4';
  const HOOK = [E5, E5, 'r', E5, E5, 'r', E5, 'r'];
  const EXPECTED = [
    HOOK,
    [C5, C5, C5, 'r', D5, D5, D5, 'r'],
    HOOK,
    [A5, A5, A5, 'r', G5, G5, G5, 'r'],
    HOOK,
    [C5, C5, C5, 'r', D5, D5, D5, 'r'],
    [G5, G5, G5, 'r', C5, C5, C5, 'r'],
    [D5, D5, D5, 'r', E5],
  ];

  it('plays the riff as planned, all downstrokes, using all five shapes', async () => {
    const song = await load('st-power-chords-open');
    expect(song.bars.length).toBe(8);
    const beats = played(song, 'Your riff');
    expect(tokensByBar(beats, 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    expect(beats.filter((b) => b.midis.length).every((b) => b.stroke === 'down')).toBe(true);
    // Eighth notes throughout, except the last E5, which rings for a half note.
    const last = beats[beats.length - 1];
    expect(last.inBar).toBe(1920);
    expect(new Set(song.chords.map((c) => c.symbol))).toEqual(new Set(['E5', 'A5', 'D5', 'G5', 'C5']));
    for (const b of beats.filter((x) => x.midis.length)) expect(Object.keys(SHAPES)).toContain(`${b.chord}=${b.voicing}`);
  });

  it('has a rest before every jump between an open shape and a movable one', async () => {
    const song = await load('st-power-chords-open');
    const beats = played(song, 'Your riff');
    const movable = (c: string | null) => c === 'G5' || c === 'C5';
    for (let i = 1; i < beats.length; i++) {
      const cur = beats[i];
      if (!cur.midis.length) continue;
      const prev = beats[i - 1];
      if (prev.midis.length && movable(prev.chord) !== movable(cur.chord)) throw new Error(`bar ${cur.bar + 1}: ${prev.chord} to ${cur.chord} with no rest between`);
    }
  });

  it('stays in E minor, in the first five frets', async () => {
    const song = await load('st-power-chords-open');
    const beats = played(song, 'Your riff');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'minor'))).toEqual([]);
    const frets = beats.flatMap((b) => b.frets.map((f) => f.fret));
    expect(Math.max(...frets)).toBe(5);
    const all = beats.flatMap((b) => b.midis);
    expect([Math.min(...all), Math.max(...all)].map((m) => midiToNote(m))).toEqual(['E2', 'D4']);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-power-chords-open'), 'Your riff', 3);
  });
});

// ---------------------------------------------------------------- licks
describe('batch 5: st-lick-hammer-on', () => {
  const EXPECTED = [
    ['D3', 'E3h', 'D3', 'E3h', 'G3', 'A3h', 'G3'],
    ['E3', 'D3', 'E3h', 'E2'],
    ['G3', 'A3h', 'G3', 'A3h', 'B3', 'D4h', 'B3'],
    ['A3', 'G3', 'A3h', 'E3'],
    ['B3', 'D4h', 'B3', 'D4h', 'E4', 'G4h', 'E4'],
    ['D4', 'B3', 'D4h', 'G3'],
    ['D3', 'E3h', 'G3', 'A3h', 'B3', 'D4h', 'E4', 'G4h'],
    ['E4', 'D4', 'B3', 'E2+B2+E3+G3+B3+E4'],
  ];

  it('plays the lick as planned', async () => {
    const song = await load('st-lick-hammer-on');
    expect(song.bars.length).toBe(8);
    expect(tokensByBar(played(song, 'Your lick'), 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('hammers on only from open strings, to exactly the four frets the plan names', async () => {
    const song = await load('st-lick-hammer-on');
    const beats = played(song, 'Your lick');
    const hammers = new Set<string>();
    beats.forEach((b, i) => {
      for (const f of b.frets.filter((x) => x.legato)) {
        expect(f.legato).toBe('hammer');
        const before = beats.slice(0, i).reverse().find((x) => x.frets.some((y) => y.string === f.string));
        hammers.add(`${f.string}:${before!.frets.find((y) => y.string === f.string)!.fret}>${f.fret}`);
      }
    });
    expect([...hammers].sort()).toEqual(['1:0>3', '2:0>3', '3:0>2', '4:0>2']);
  });

  it('keeps to E minor pentatonic in open position, with Em7 tones on the beats', async () => {
    const song = await load('st-lick-hammer-on');
    const beats = played(song, 'Your lick');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'minor-pentatonic'))).toEqual([]);
    expect(Math.max(...beats.flatMap((b) => b.frets.map((f) => f.fret)))).toBe(3);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    const all = beats.flatMap((b) => b.midis);
    expect([Math.min(...all), Math.max(...all)].map((m) => midiToNote(m))).toEqual(['E2', 'G4']);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-lick-hammer-on'), 'Your lick', 3);
  });
});

describe('batch 5: st-lick-pull-off', () => {
  const EXPECTED = [
    ['G4', 'E4p', 'G4', 'E4p', 'D4', 'B3p', 'A3'],
    ['G3p', 'A3', 'G3p', 'E3'],
    ['D4', 'B3p', 'D4', 'B3p', 'A3', 'G3p', 'E3'],
    ['A3', 'G3p', 'E3', 'D3', 'E3h'],
    ['G3', 'A3h', 'G3p', 'A3h', 'G3p', 'A3h', 'G3p'],
    ['B3', 'D4h', 'B3p', 'D4h', 'B3p', 'D4h', 'B3p'],
    ['E4', 'G4h', 'E4p', 'G4h', 'E4p', 'G4h', 'E4p', 'D4'],
    ['B3p', 'A3', 'G3p', 'E3', 'E2+B2+E3+G3+B3+E4'],
  ];

  it('plays the lick as planned', async () => {
    const song = await load('st-lick-pull-off');
    expect(song.bars.length).toBe(8);
    expect(tokensByBar(played(song, 'Your lick'), 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('pulls off only to open strings from the three frets the plan names, and the trills join both', async () => {
    const song = await load('st-lick-pull-off');
    const beats = played(song, 'Your lick');
    const moves = { hammer: new Set<string>(), pull: new Set<string>() };
    beats.forEach((b, i) => {
      for (const f of b.frets.filter((x) => x.legato)) {
        const before = beats.slice(0, i).reverse().find((x) => x.frets.some((y) => y.string === f.string));
        moves[f.legato!].add(`${f.string}:${before!.frets.find((y) => y.string === f.string)!.fret}>${f.fret}`);
      }
    });
    expect([...moves.pull].sort()).toEqual(['1:3>0', '2:3>0', '3:2>0']);
    expect([...moves.hammer].sort()).toEqual(['1:0>3', '2:0>3', '3:0>2', '4:0>2']);
    // Bars 5-7 are trills: after the first picked note, every note is a hammer-on or a pull-off on one string.
    for (const bar of [4, 5, 6]) {
      const notes = beats.filter((b) => b.bar === bar && b.midis.length).slice(0, 7);
      expect(new Set(notes.map((b) => b.frets[0].string)).size, `bar ${bar + 1} stays on one string`).toBe(1);
      expect(notes.slice(1).every((b) => !!b.frets[0].legato), `bar ${bar + 1} is legato after the first note`).toBe(true);
    }
  });

  it('keeps to E minor pentatonic in open position, with Em7 tones (or an A pulling to G) on the beats', async () => {
    const song = await load('st-lick-pull-off');
    const beats = played(song, 'Your lick');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'minor-pentatonic'))).toEqual([]);
    expect(Math.max(...beats.flatMap((b) => b.frets.map((f) => f.fret)))).toBe(3);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    const all = beats.flatMap((b) => b.midis);
    expect([Math.min(...all), Math.max(...all)].map((m) => midiToNote(m))).toEqual(['E2', 'G4']);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-lick-pull-off'), 'Your lick', 3);
  });
});

// ---------------------------------------------------------------- p i m a
describe('batch 5: st-pima-arpeggios', () => {
  const C = ['C3', 'G3', 'C4', 'E4', 'C3', 'G3', 'C4', 'E4'];
  const AM = ['A2', 'A3', 'C4', 'E4', 'A2', 'A3', 'C4', 'E4'];
  const DM = ['D3', 'F4', 'D4', 'A3', 'D3', 'F4', 'D4', 'A3'];
  const G7 = ['G2', 'G3', 'B3', 'F4', 'B3', 'G3', 'B3', 'G3'];
  const G7_PINCH = ['G2+F4', 'G3', 'B3', 'F4', 'B3', 'G3', 'B3', 'G3'];
  const EXPECTED = [...times(4, C), ...times(4, AM), ...times(4, DM), ...times(2, G7), ...times(2, G7_PINCH)];

  it('plays the planned notes: eight eighths a bar, C Am Dm G7 four bars each', async () => {
    const song = await load('st-pima-arpeggios');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Arpeggios');
    expect(tokensByBar(beats, 16)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    expect(beats.every((b) => b.inBar % 480 === 0)).toBe(true);
    expect(song.chords.map((c) => `${c.bar}:${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`)).toEqual(['0:C=x32010', '4:Am=x02210', '8:Dm=xx0231', '12:G7=320001']);
  });

  it('gives each finger its string: p the root (5, 5, 4, 6), i 3, m 2, a 1, in the planned patterns', async () => {
    const song = await load('st-pima-arpeggios');
    const beats = played(song, 'Arpeggios');
    const bassString = (bar: number) => (bar < 8 ? 5 : bar < 12 ? 4 : 6);
    const finger: Record<number, string> = { 3: 'i', 2: 'm', 1: 'a' };
    for (let bar = 0; bar < 16; bar++) {
      const pattern = beats.filter((b) => b.bar === bar).map((b) => b.frets.map((f) => (f.string === bassString(bar) ? 'p' : finger[f.string] ?? '?')).sort((x, y) => (x === 'p' ? -1 : y === 'p' ? 1 : 0)).join('+'));
      const want = bar < 8 ? 'p i m a p i m a' : bar < 12 ? 'p a m i p a m i' : bar < 14 ? 'p i m a m i m i' : 'p+a i m a m i m i';
      expect(pattern.join(' '), `bar ${bar + 1}`).toBe(want);
    }
    // The fingering marks that are written agree with the strings.
    for (const b of beats) for (const f of b.frets) if (f.pluck) expect(f.pluck, `bar ${b.bar + 1} string ${f.string}`).toBe(f.string === bassString(b.bar) ? 'p' : finger[f.string]);
  });

  it('plays only chord tones, in C major, in first position', async () => {
    const song = await load('st-pima-arpeggios');
    const beats = played(song, 'Arpeggios');
    for (const b of beats) expect(outside(b.midis, chordPcs(b.chord!)), `bar ${b.bar + 1}`).toEqual([]);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('C', 'major'))).toEqual([]);
    expect(Math.max(...beats.flatMap((b) => b.frets.map((f) => f.fret)))).toBe(3);
    const all = beats.flatMap((b) => b.midis);
    expect([Math.min(...all), Math.max(...all)].map((m) => midiToNote(m))).toEqual(['G2', 'F4']);
  });

  it('estimates near level 3', async () => {
    expectLevelNear(await load('st-pima-arpeggios'), 'Arpeggios', 3);
  });
});

describe('batch 5: the checks themselves', () => {
  it('catch a wrong fret, a missing hammer-on and a wrong strum shape', async () => {
    const text = await loadSongText('st-lick-hammer-on');
    const wrongFret = parseSixTab(text.replace('2:0 2:3h{3} q 2:0', '2:0 2:2h{3} q 2:0')).song!;
    const right = parseSixTab(text).song!;
    expect(tokensByBar(played(wrongFret, 'Your lick'), 8)).not.toEqual(tokensByBar(played(right, 'Your lick'), 8));
    const noHammer = parseSixTab(text.replace('e 4:0 4:2h{2} 4:0', 'e 4:0 4:2{2} 4:0')).song!;
    expect(tokensByBar(played(noHammer, 'Your lick'), 8)[0][1]).toBe('E3');
    const strum = await loadSongText('st-change-g-d7-d-g');
    const wrongShape = parseSixTab(strum.replace('"D7=xx0212" h D D', '"D7=xx0213" h D D')).song!;
    expect(played(wrongShape, 'Your strum').find((b) => b.bar === 2)?.voicing).toBe('xx0213');
    expect(Object.keys(SHAPES)).not.toContain('D7=xx0213');
  });
});

describe('batch 5: every song', () => {
  it.each(['st-change-g-d7-d-g', 'st-change-c-am-am-dm', 'st-change-am-e-e-b7', 'st-strum-folk', 'st-boom-chick', 'st-power-chords-open', 'st-lick-hammer-on', 'st-lick-pull-off', 'st-pima-arpeggios'])(
    '%s has full 4/4 bars and the plan level',
    async (id) => {
      const song = await load(id);
      expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
      expect(song.meta.difficulty).toBe(3);
    },
  );
});
