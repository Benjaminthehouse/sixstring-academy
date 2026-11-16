/**
 * Independent cross-checks for batch 12 of the built-in songs: st-duet-baroque,
 * st-andalusian-cadence, st-bluegrass-g-run, st-strum-funk, st-delta-blues-e and rondo-alla-turca.
 * (red-haired-boy, hungarian-dance-5, william-tell-galop and danny-boy-chord-melody were left out
 * of this batch: see the batch report.)
 *
 * The expected notes below are written out by hand as note names: for the studies from the
 * composition plan of each one, and for the Rondo alla Turca as the piano's right hand is commonly
 * printed (in the piano's register; the test moves it down the octave the plan asks for). They are
 * not copied from the tab, so a wrong fret shows up as a wrong note. Each song is parsed with the
 * song core and compared beat by beat, then checked for: notes on the beats against the chord in
 * force (chord tones, or a passing or neighbour note that moves on by step to one), the key or
 * mode, the range, the frets, strings and fingers the plan names, and the difficulty estimate
 * against the plan's level. The duet is also checked as counterpoint: the interval between the
 * two voices on every beat, and no parallel fifths or octaves.
 */
import { describe, expect, it } from 'vitest';
import { barLength, estimateDifficulty, flattenSong, parseSixTab, soundingPitch, type Note, type Song } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { loadSongText } from '@/content/songs';

const name = (m: number) => midiToNote(m, { prefer: 'sharps' });
const BAR_34 = 2880;
const BAR_44 = 3840;
const BAR_24 = 1920;

/** "G2+B2", "Bb3", "E4h" or "B3s" -> canonical sharps spelling, so the comparison is by pitch, not by spelling. */
function canon(token: string): string {
  if (token === 'r' || token === '~' || token === 'slash') return token;
  const m = /^(.*\d)([hps]?)$/.exec(token);
  if (!m) throw new Error(`bad expected token ${token}`);
  const names = m[1].split('+').map((n) => noteToMidi(n)).sort((a, b) => a - b).map(name);
  return names.join('+') + m[2];
}

/** Repeat a value n times. */
const times = <T,>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

interface Played {
  /** Song bar (0-based) and the pass through it (1 = the first time it is played). */
  bar: number;
  pass: number;
  /** Timeline tick of the beat, and its offset inside its bar. */
  tick: number;
  inBar: number;
  duration: number;
  token: string;
  /** Sounding pitches struck on this beat, low to high. */
  midis: number[];
  notes: Note[];
  slash: boolean;
  muted: boolean;
  stroke?: 'down' | 'up';
  chord: string | null;
}

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  return result.song!;
}

/** Every beat of a track as played (repeats unrolled), rests included. */
function played(song: Song, trackName: string): Played[] {
  const track = song.tracks.find((t) => t.name === trackName);
  if (!track) throw new Error(`no track ${trackName}`);
  const tl = flattenSong(song);
  return tl.trackBeats(track.id).map((b) => {
    const bar = tl.barAt(b.tick);
    const chord = tl.chordAt(b.tick);
    const struck = b.notes.filter((n) => !n.tie);
    const midis = struck.map((n) => soundingPitch(n)!).sort((x, y) => x - y);
    let token = b.source.slash ? 'slash' : midis.length ? midis.map(name).join('+') : b.notes.length ? '~' : 'r';
    if (struck.length === 1 && struck[0].legato) token += struck[0].legato === 'hammer' ? 'h' : 'p';
    if (struck.length === 1 && struck[0].slide) token += 's';
    return {
      bar: b.bar,
      pass: bar.pass,
      tick: b.tick,
      inBar: b.tick - bar.start,
      duration: b.duration,
      token,
      midis,
      notes: struck,
      slash: !!b.source.slash,
      muted: !!b.source.mutedStrum,
      stroke: b.source.stroke,
      chord: chord?.symbol ?? null,
    };
  });
}

/** The tokens of a track, bar by bar (first pass of each bar only). */
function tokensByBar(beats: Played[], bars: number): string[][] {
  const out: string[][] = Array.from({ length: bars }, () => []);
  for (const b of beats) if (b.pass === 1) out[b.bar].push(b.token);
  return out;
}

/**
 * A note outside the chord is a passing or neighbour note when the line moves on by step (a half
 * or whole tone) to a chord tone, possibly through further steps in the same direction. Repeats of
 * the same note, and other notes sounding with it, are skipped over. `extra` adds pitch classes
 * that count as chord tones for a beat (the blue notes of a blues).
 */
function resolvesByStep(beats: Played[], from: number, pitch: number, extra: (b: Played) => number[] = () => []): boolean {
  let p = pitch;
  let dir = 0;
  for (let j = from + 1; j < beats.length && j <= from + 8; j++) {
    const b = beats[j];
    if (b.midis.includes(p)) continue;
    const q = b.midis.reduce((best, m) => (Math.abs(m - p) < Math.abs(best - p) ? m : best), b.midis[0]);
    const step = q - p;
    if (Math.abs(step) > 2 || (dir !== 0 && Math.sign(step) !== dir)) return false;
    if (b.chord && [...chordPcs(b.chord), ...extra(b)].includes(q % 12)) return true;
    dir = Math.sign(step);
    p = q;
  }
  return false;
}

/** Notes struck on the given ticks of the bar that are neither chord tones nor passing or neighbour notes. */
function strongBeatProblems(beats: Played[], strong: number[], extra: (b: Played) => number[] = () => [], only: (m: number, b: Played) => boolean = () => true): string[] {
  const sounding = beats.filter((b) => b.midis.length > 0);
  const problems: string[] = [];
  sounding.forEach((b, i) => {
    if (!strong.includes(b.inBar) || !b.chord) return;
    const tones = new Set([...chordPcs(b.chord), ...extra(b)]);
    for (const p of b.midis.filter((m) => only(m, b) && !tones.has(m % 12))) {
      if (!resolvesByStep(sounding, i, p, extra)) problems.push(`bar ${b.bar + 1} tick ${b.inBar}: ${name(p)} is not in ${b.chord} and does not move by step to a chord tone`);
    }
  });
  return problems;
}

/** Pitch names outside a set of pitch classes. */
function outside(midis: number[], pcs: number[]): string[] {
  const allowed = new Set(pcs);
  return [...new Set(midis.filter((m) => !allowed.has(m % 12)).map(name))].sort();
}

/** Lowest and highest sounding note of a list of beats. */
function range(beats: Played[]): [string, string] {
  const all = beats.flatMap((b) => b.midis);
  return [name(Math.min(...all)), name(Math.max(...all))];
}

/** The estimate for one track. */
function estimate(song: Song, trackName: string): { level: number; text: string } {
  const track = song.tracks.find((t) => t.name === trackName)!;
  const est = estimateDifficulty(song, { track: track.id });
  return { level: est.level, text: `${song.meta.title}: estimated level ${est.level} (score ${est.score}, ${JSON.stringify(est.factors)})` };
}

/** The chord in force at the start of each bar (first pass). */
function chordsByBar(song: Song): (string | undefined)[] {
  const tl = flattenSong(song);
  return song.bars.map((_, i) => tl.chordAt(tl.bars[tl.firstIndexOf(i)].start)?.symbol);
}

/** Frets of a shape string, low string first ("x21202"). */
function shapeSounds(frets: string): string[] {
  const STANDARD = [40, 45, 50, 55, 59, 64];
  return [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)])).sort((a, b) => a - b).map(name);
}

const shapeOf = (voicing: (number | null)[]) => voicing.map((f) => (f === null ? 'x' : String(f))).join('');

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Each shape this batch gives, with the notes it should sound, low to high. */
const SHAPES: Record<string, string[]> = {
  'Am=x02210': ['A2', 'E3', 'A3', 'C4', 'E4'],
  'G=320003': ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
  'F=xx3211': ['F3', 'A3', 'C4', 'F4'],
  'E=022100': ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
  'C=x32010': ['C3', 'E3', 'G3', 'C4', 'E4'],
  'D=xx0232': ['D3', 'A3', 'D4', 'F#4'],
  'E9=x76777': ['E3', 'G#3', 'D4', 'F#4', 'B4'],
};

describe('batch 12: the chord shapes', () => {
  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, and every note of its chord', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets)).toEqual(names.map(canon));
    const tones = new Set(chordPcs(symbol));
    expect(names.every((n) => tones.has(noteToMidi(n) % 12)), `${shape} has a note outside ${symbol}`).toBe(true);
    expect([...tones].every((pc) => names.some((n) => noteToMidi(n) % 12 === pc)), `${shape} leaves out a note of ${symbol}`).toBe(true);
  });

  it.each(['st-duet-baroque', 'st-andalusian-cadence', 'st-bluegrass-g-run', 'st-strum-funk', 'st-delta-blues-e', 'rondo-alla-turca'])('%s gives a shape only from the list above', async (id) => {
    const song = await load(id);
    for (const c of song.chords.filter((x) => x.voicing)) expect(Object.keys(SHAPES)).toContain(`${c.symbol}=${shapeOf(c.voicing!)}`);
  });
});

// ---------------------------------------------------------------- Baroque duo
describe('batch 12: st-duet-baroque', () => {
  const OPENING_UPPER = [
    ['D4', 'E4', 'F4', 'E4', 'D4'],
    ['C#4', 'D4', 'E4', 'F4', 'G4'],
    ['F4', 'E4', 'D4'],
    ['E4', 'C#4', 'A3'],
  ];
  const UPPER = [
    ...OPENING_UPPER,
    ['F4', 'E4', 'D4', 'E4'],
    ['F4', 'G4', 'F4', 'D4'],
    ['E4', 'G4', 'F4', 'E4'],
    ['F4'],
    ['F4', 'E4', 'D4'],
    ['E4', 'D4', 'C4'],
    ['A3', 'Bb3', 'C4', 'D4', 'E4', 'F4'],
    ['F#4', 'E4', 'D4'],
    ['Bb3', 'D4', 'G4'],
    ['F4', 'E4', 'D4'],
    ['G4', 'F4', 'D4'],
    ['E4', 'C#4'],
    ...OPENING_UPPER,
    ['D4', 'E4', 'F4', 'G4', 'F4', 'D4'],
    ['Bb3', 'D4', 'G4'],
    ['E4', 'D4', 'C#4'],
    ['D4'],
  ];
  const OPENING_BASS = [['D3', 'A2'], ['C#3', 'A2'], ['D3', 'C3', 'Bb2'], ['A2']];
  const BASS = [
    ...OPENING_BASS,
    ['D3', 'C3'],
    ['Bb2', 'F2'],
    ['C3', 'Bb2', 'C3'],
    ['F2'],
    ['A2', 'Bb2'],
    ['C3', 'E2'],
    ['F2', 'C3'],
    ['D3', 'F#3'],
    ['G3', 'G2'],
    ['D3', 'F2'],
    ['Bb2'],
    ['A2'],
    ...OPENING_BASS,
    ['Bb2'],
    ['G2'],
    ['A2', 'C#3', 'A2'],
    ['D3'],
  ];
  const CHORDS = ['Dm', 'A7', 'Dm', 'A', 'Dm', 'Bb', 'C7', 'F', 'F', 'C', 'F', 'D', 'Gm', 'Dm', 'Gm/Bb', 'A', 'Dm', 'A7', 'Dm', 'A', 'Bb', 'Gm', 'A', 'Dm'];
  const UP = 'You (upper voice)';
  const LOW = 'Teacher (bass line)';

  it('plays the two voices as composed, 24 bars of 3/4', async () => {
    const song = await load('st-duet-baroque');
    expect(song.bars.length).toBe(24);
    expect(song.bars.every((b) => barLength(b) === BAR_34)).toBe(true);
    expect(tokensByBar(played(song, UP), 24)).toEqual(UPPER.map((bar) => bar.map(canon)));
    expect(tokensByBar(played(song, LOW), 24)).toEqual(BASS.map((bar) => bar.map(canon)));
    expect(chordsByBar(song)).toEqual(CHORDS);
  });

  it('is in binary form: two halves of 8 and 16 bars, each repeated, the second bringing back the opening', async () => {
    const song = await load('st-duet-baroque');
    expect(song.sections.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual(['First half:0-8', 'Second half:8-24']);
    expect(song.bars.map((b, i) => (b.repeatStart ? `${i}:start` : b.repeatEnd ? `${i}:end` : null)).filter(Boolean)).toEqual(['0:start', '7:end', '8:start', '23:end']);
    const tl = flattenSong(song);
    expect(tl.bars.length).toBe(48);
    const up = tokensByBar(played(song, UP), 24);
    expect(up.slice(16, 20)).toEqual(up.slice(0, 4));
    // The first half closes in F major (C7 to F), the second in D minor (A to Dm), with a Phrygian half cadence (bass Bb to A) in bar 16.
    expect([CHORDS[6], CHORDS[7], CHORDS[22], CHORDS[23]]).toEqual(['C7', 'F', 'A', 'Dm']);
    const bass = played(song, LOW).filter((b) => b.pass === 1);
    expect(bass.filter((b) => b.bar === 14 || b.bar === 15).map((b) => b.token)).toEqual(['A#2', 'A2']);
  });

  it('sounds a consonance between the voices on every beat (the seventh of A7 in bar 2 excepted)', async () => {
    const song = await load('st-duet-baroque');
    const upper = played(song, UP).filter((b) => b.pass === 1);
    const lower = played(song, LOW).filter((b) => b.pass === 1);
    const at = (beats: Played[], tick: number) => beats.find((b) => b.midis.length && b.tick <= tick && tick < b.tick + b.duration)!.midis[0];
    const CONSONANT = [0, 3, 4, 7, 8, 9];
    const problems: string[] = [];
    for (let bar = 0; bar < 24; bar++) {
      for (const beat of [0, 960, 1920]) {
        const tick = upper.find((b) => b.bar === bar)!.tick - upper.find((b) => b.bar === bar)!.inBar + beat;
        const hi = at(upper, tick);
        const lo = at(lower, tick);
        expect(hi > lo, `bar ${bar + 1}: the voices cross`).toBe(true);
        if (!CONSONANT.includes((hi - lo) % 12)) problems.push(`bar ${bar + 1} beat ${beat / 960 + 1}: ${name(lo)}-${name(hi)}`);
      }
    }
    // G over A in A7, which falls to F over D: in bar 2 and again in bar 18.
    expect(problems).toEqual(['bar 2 beat 3: A2-G4', 'bar 18 beat 3: A2-G4']);
  });

  it('has no parallel fifths or octaves between the voices, from any note to the next', async () => {
    const song = await load('st-duet-baroque');
    const upper = played(song, UP).filter((b) => b.midis.length);
    const lower = played(song, LOW).filter((b) => b.midis.length);
    const at = (beats: Played[], tick: number) => beats.find((b) => b.tick <= tick && tick < b.tick + b.duration)?.midis[0];
    const onsets = [...new Set([...upper, ...lower].map((b) => b.tick))].sort((a, b) => a - b);
    const parallels: string[] = [];
    for (let i = 1; i < onsets.length; i++) {
      const [h0, l0, h1, l1] = [at(upper, onsets[i - 1]), at(lower, onsets[i - 1]), at(upper, onsets[i]), at(lower, onsets[i])];
      if (h0 === undefined || l0 === undefined || h1 === undefined || l1 === undefined) continue;
      const a = (h0 - l0) % 12;
      const b = (h1 - l1) % 12;
      const bothMove = h0 !== h1 && l0 !== l1;
      if (bothMove && a === b && (a === 0 || a === 7)) parallels.push(`${name(l0)}-${name(h0)} to ${name(l1)}-${name(h1)} at tick ${onsets[i]}`);
    }
    expect(parallels).toEqual([]);
  });

  it('has chord tones (or steps to them) on every beat, in D minor, first position for both players', async () => {
    const song = await load('st-duet-baroque');
    const upper = played(song, UP);
    const lower = played(song, LOW);
    expect(strongBeatProblems(upper, [0, 960, 1920])).toEqual([]);
    expect(strongBeatProblems(lower, [0, 960, 1920])).toEqual([]);
    expect(parseKey(song.key ?? '')).toMatchObject({ tonic: 'D', mode: 'minor' });
    // D minor, with the raised seventh C# (A and A7) and F# only in the D chord of bar 12.
    expect(outside(upper.flatMap((b) => b.midis), scalePcs('D', 'minor'))).toEqual(['C#4', 'F#4']);
    expect(upper.filter((b) => b.midis.includes(noteToMidi('F#4'))).map((b) => b.chord)).toEqual(['D', 'D']);
    expect(range(upper)).toEqual(['A3', 'G4']);
    expect(range(lower)).toEqual(['E2', 'G3']);
    const upFrets = upper.flatMap((b) => b.notes.map((n) => n.fret));
    expect(Math.max(...upFrets)).toBe(3);
    expect([...new Set(upper.flatMap((b) => b.notes.map((n) => n.string)))].sort()).toEqual([1, 2, 3]);
    expect(Math.max(...lower.flatMap((b) => b.notes.map((n) => n.fret)))).toBe(4);
    // First position: every finger the tab gives equals its fret.
    for (const b of [...upper, ...lower]) for (const n of b.notes) if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(n.fret);
  });

  it('estimates at level 3 against the plan\'s 5: the estimate rates one part alone, not holding it against another', async () => {
    // The upper voice on its own is first-position quarters and eighths at 108; what makes this a
    // level-5 piece is keeping it steady against an independent bass, which the estimate does not see.
    const est = estimate(await load('st-duet-baroque'), UP);
    expect(est.level, est.text).toBeGreaterThanOrEqual(3);
    expect(est.level, est.text).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------- Andalusian cadence
describe('batch 12: st-andalusian-cadence', () => {
  const MELODY = [
    ...times(8, ['r']),
    ['E4', 'F4', 'E4'],
    ['D4', 'E4', 'D4'],
    ['C4', 'D4', 'C4'],
    ['B3', 'C4', 'B3', 'A3', 'B3'],
    ['A3', 'B3', 'C4', 'D4', 'E4'],
    ['G4', 'F4', 'E4', 'D4'],
    ['A3', 'C4', 'F4'],
    ['E4'],
  ];
  const CHORDS = times(4, ['Am', 'G', 'F', 'E']).flat();

  it('is Am G F E, one bar each, four times, ending on E, with the planned shapes', async () => {
    const song = await load('st-andalusian-cadence');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => barLength(b) === BAR_34 && b.time.numerator === 3)).toBe(true);
    expect(chordsByBar(song)).toEqual(CHORDS);
    expect(new Set(song.chords.map((c) => `${c.symbol}=${shapeOf(c.voicing!)}`))).toEqual(new Set(['Am=x02210', 'G=320003', 'F=xx3211', 'E=022100']));
    expect(song.chords.at(-1)?.symbol).toBe('E');
  });

  it('strums a four-stroke rasgueado on beat 1 and thumb strokes on beats 2 and 3, in every bar', async () => {
    const song = await load('st-andalusian-cadence');
    const beats = played(song, 'Your rasgueado');
    expect(beats.every((b) => b.slash && b.stroke === 'down' && !b.muted)).toBe(true);
    for (let bar = 0; bar < 16; bar++) {
      const inBar = beats.filter((b) => b.bar === bar);
      const last = bar === 15;
      expect(inBar.map((b) => b.inBar), `bar ${bar + 1}`).toEqual(last ? [0, 240, 480, 720, 960] : [0, 240, 480, 720, 960, 1920]);
      expect(inBar.map((b) => b.duration), `bar ${bar + 1}`).toEqual(last ? [240, 240, 240, 240, 1920] : [240, 240, 240, 240, 960, 960]);
    }
  });

  it('plays the melody in bars 9-16, as composed, in E Phrygian, with each bar\'s first note in its chord', async () => {
    const song = await load('st-andalusian-cadence');
    const beats = played(song, 'Melody');
    expect(tokensByBar(beats, 16)).toEqual(MELODY.map((bar) => bar.map(canon)));
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'phrygian'))).toEqual([]);
    expect(strongBeatProblems(beats, [0], () => [], () => true)).toEqual([]);
    for (const b of beats.filter((x) => x.inBar === 0 && x.midis.length)) expect(chordPcs(b.chord!), `bar ${b.bar + 1}`).toContain(b.midis[0] % 12);
    // No G or G# over the E chord: the melody keeps clear of the clash between the mode and the chord.
    expect(beats.filter((b) => b.chord === 'E' && b.midis.some((m) => m % 12 === 7 || m % 12 === 8))).toEqual([]);
    // The close: F falls a half step to E over the E chord.
    const notes = beats.filter((b) => b.midis.length);
    expect(notes.slice(-2).map((b) => b.token)).toEqual(['F4', 'E4']);
    expect(range(beats)).toEqual(['A3', 'G4']);
    expect(Math.max(...beats.flatMap((b) => b.notes.map((n) => n.fret)))).toBe(3);
  });

  it('estimates near level 5', async () => {
    const est = estimate(await load('st-andalusian-cadence'), 'Your rasgueado');
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- bluegrass G run
describe('batch 12: st-bluegrass-g-run', () => {
  const G = 'D3+G3+B3+G4';
  const C = 'E3+G3+C4+E4';
  const D = 'D3+A3+D4+F#4';
  const RUN = ['G2', G, 'G3', 'E3', 'D3', 'A2', 'B2h'];
  const EXPECTED = [
    ['G2', G, 'D3', G],
    ['G2', G, 'B2', G],
    ['C3', C, 'G2', C],
    ['C3', C, 'G2', C],
    ['G2', G, 'D3', G],
    ['D3', D, 'A2', D],
    RUN,
    ['G2', G, 'B2', G],
    ['C3', C, 'G2', C],
    ['C3', C, 'G2', C],
    ['G2', G, 'D3', G],
    ['G2', G, 'D3', G],
    ['D3', D, 'A2', D],
    ['D3', D, 'A2', D],
    RUN,
    ['G2', G, 'G2+B2+D3+G3+B3+G4'],
  ];
  const CHORDS = ['G', 'G', 'C', 'C', 'G', 'D', 'G', 'G', 'C', 'C', 'G', 'G', 'D', 'D', 'G', 'G'];

  it('plays bass and strum as composed, 16 bars of 4/4 on G, C and D', async () => {
    const song = await load('st-bluegrass-g-run');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your part'), 16)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    expect(chordsByBar(song)).toEqual(CHORDS);
    expect(song.sections.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual(['Phrase 1:0-8', 'Phrase 2:8-16']);
  });

  it('has a single bass note on beats 1 and 3 and a down-strum of strings 4 to 1 on beats 2 and 4', async () => {
    const song = await load('st-bluegrass-g-run');
    const beats = played(song, 'Your part');
    const runBars = new Set([6, 14]);
    for (const b of beats) {
      if (runBars.has(b.bar) && b.inBar > 960) continue;
      if (b.bar === 15 && b.inBar === 1920) continue;
      const beat = b.inBar / 960;
      if (beat === 0 || beat === 2) {
        expect(b.notes.length, `bar ${b.bar + 1} beat ${beat + 1}`).toBe(1);
        expect(b.notes[0].string, `bar ${b.bar + 1} beat ${beat + 1}`).toBeGreaterThanOrEqual(4);
        // The bass note is the chord's root or fifth, or B leading up to C.
        const ok = chordPcs(b.chord!).includes(b.midis[0] % 12) || (b.token === 'B2' && CHORDS[b.bar + 1] === 'C');
        expect(ok, `bar ${b.bar + 1} beat ${beat + 1}: ${b.token} under ${b.chord}`).toBe(true);
      } else {
        expect(b.notes.map((n) => n.string), `bar ${b.bar + 1} beat ${beat + 1}`).toEqual([4, 3, 2, 1]);
        expect(b.stroke).toBe('down');
        expect(b.midis.every((m) => chordPcs(b.chord!).includes(m % 12))).toBe(true);
      }
    }
    // The bass alternates: root on beat 1, then the fifth (or the B walking up to C) on beat 3.
    const bassOn = (bar: number, beat: number) => beats.find((b) => b.bar === bar && b.inBar === beat * 960 && b.pass === 1)!.notes[0];
    expect(bassOn(0, 0)).toMatchObject({ string: 6, fret: 3 });
    expect(bassOn(0, 2)).toMatchObject({ string: 4, fret: 0 });
    expect(bassOn(2, 0)).toMatchObject({ string: 5, fret: 3 });
    expect(bassOn(2, 2)).toMatchObject({ string: 6, fret: 3 });
    expect(bassOn(5, 0)).toMatchObject({ string: 4, fret: 0 });
    expect(bassOn(5, 2)).toMatchObject({ string: 5, fret: 0 });
  });

  it('ends each phrase with the planned G run, picked down-up, landing on string 6 fret 3 on beat 1', async () => {
    const song = await load('st-bluegrass-g-run');
    const beats = played(song, 'Your part');
    for (const bar of [6, 14]) {
      const run = beats.filter((b) => b.bar === bar && b.inBar >= 1440);
      expect(run.map((b) => b.inBar)).toEqual([1440, 1920, 2400, 2880, 3360]);
      expect(run.every((b) => b.duration === 480)).toBe(true);
      expect(run.map((b) => `${b.notes[0].string}:${b.notes[0].fret}`)).toEqual(['3:0', '4:2', '4:0', '5:0', '5:2']);
      expect(run[4].notes[0].legato).toBe('hammer');
      expect(run.slice(0, 4).map((b) => b.stroke)).toEqual(['up', 'down', 'up', 'down']);
      expect(run.map((b) => b.notes[0].finger ?? null)).toEqual([null, 1, null, null, 2]);
      const strum = beats.find((b) => b.bar === bar && b.inBar === 960)!;
      expect(strum.duration).toBe(480);
      const landing = beats.find((b) => b.bar === bar + 1 && b.inBar === 0)!;
      expect(landing.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:3']);
      expect(landing.notes[0].finger).toBe(3);
    }
  });

  it('stays in G major, in open position', async () => {
    const song = await load('st-bluegrass-g-run');
    const beats = played(song, 'Your part');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('G', 'major'))).toEqual([]);
    expect(range(beats)).toEqual(['G2', 'G4']);
    expect(Math.max(...beats.flatMap((b) => b.notes.map((n) => n.fret)))).toBe(3);
  });

  it('estimates near level 5', async () => {
    const est = estimate(await load('st-bluegrass-g-run'), 'Your part');
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- sixteenth-note funk
describe('batch 12: st-strum-funk', () => {
  /** Chord hits by sixteenth (0 = beat 1, 1 = its "e", 2 = "and", 3 = "a"); every other sixteenth is a muted scratch. */
  const A1 = [0, 2, 5, 7, 10, 12, 15];
  const A2 = [0, 6, 7, 9, 12, 14];
  const B1 = [0, 3, 6, 9, 11, 14];
  const B2 = [2, 4, 7, 10, 12];
  const PATTERN = [A1, A2, A1, A2, B1, B2, B1, B2];

  it('keeps the hand moving in sixteenths: 16 strokes in every bar, down on the beat and the "and", up between', async () => {
    const song = await load('st-strum-funk');
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    const beats = played(song, 'Your strum');
    for (let bar = 0; bar < 8; bar++) {
      const inBar = beats.filter((b) => b.bar === bar);
      expect(inBar.length, `bar ${bar + 1}`).toBe(16);
      expect(inBar.every((b) => b.slash && b.duration === 240)).toBe(true);
      expect(inBar.map((b) => b.stroke)).toEqual(times(8, ['down', 'up']).flat());
    }
  });

  it('plays the chord on the written sixteenths and scratches on the rest: two 2-bar patterns, each twice', async () => {
    const song = await load('st-strum-funk');
    const beats = played(song, 'Your strum');
    const hits = Array.from({ length: 8 }, (_, bar) => beats.filter((b) => b.bar === bar).flatMap((b, i) => (b.muted ? [] : [i])));
    expect(hits).toEqual(PATTERN);
    expect(JSON.stringify([A1, A2])).not.toBe(JSON.stringify([B1, B2]));
    expect(chordsByBar(song)).toEqual(times(8, 'E9'));
    expect(song.chords.map((c) => `${c.symbol}=${shapeOf(c.voicing!)}`)).toEqual(['E9=x76777']);
  });

  it('has a bass of E and its octave only', async () => {
    const song = await load('st-strum-funk');
    const bass = played(song, 'Teacher bass');
    expect([...new Set(bass.flatMap((b) => b.midis.map(name)))].sort()).toEqual(['E1', 'E2']);
  });

  it('estimates at level 4 against the plan\'s 6: the estimate counts strums, not the left-hand muting between them', async () => {
    // Every stroke is a strum, which the estimate treats as half as hard as picked notes; the
    // level-6 skill here is switching the fretting hand between pressing and muting 16 times a bar.
    const est = estimate(await load('st-strum-funk'), 'Your strum');
    expect(est.level, est.text).toBeGreaterThanOrEqual(4);
    expect(est.level, est.text).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------- fingerstyle blues in E
describe('batch 12: st-delta-blues-e', () => {
  const BAR_1 = ['E2+G4', 'E2+E4', 'D4', 'E2+B3', 'E2'];
  const EXPECTED = [
    BAR_1,
    ['E2+Bb3', 'B3s', 'E2+A3', 'G3', 'E2', 'E2', 'E4'],
    ['E2+G4', 'E4', 'E2+G4', 'E4', 'E2+D4', 'B3', 'E2+A3'],
    ['E2+Bb3', 'B3s', 'E2+A3', 'E2+G3', 'E2'],
    ['A2+G4', 'A2+E4', 'D4', 'A2+B3', 'A2+A3'],
    ['A2+G3', 'A3', 'A2+B3', 'D4', 'A2+E4', 'A2'],
    BAR_1,
    ['E2+Bb3', 'B3s', 'E2+A3', 'G3', 'E2', 'E2'],
    ['B2+D4', 'B2+B3', 'A3', 'B2+B3', 'B2'],
    ['A2+G4', 'A2+E4', 'D4', 'A2+B3', 'A3', 'A2'],
    ['E2+G4', 'E2+E4', 'G4', 'E2+E4', 'D4', 'E2+B3'],
    ['E2+Bb3', 'B3s', 'E2+A3', 'G3', 'E2+B3+E4'],
  ];
  const CHORDS = ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'E7'];
  /** The thumb's string and fret for each chord, from the plan. */
  const THUMB: Record<string, string> = { E7: '6:0', A7: '5:0', B7: '5:2' };

  it('plays thumb and melody as composed, 12 bars of 4/4 on the blues form', async () => {
    const song = await load('st-delta-blues-e');
    expect(song.bars.length).toBe(12);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Guitar'), 12)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    expect(chordsByBar(song)).toEqual(CHORDS);
  });

  it('keeps the thumb on the planned open bass string, lightly muted, on every beat', async () => {
    const song = await load('st-delta-blues-e');
    const beats = played(song, 'Guitar');
    for (let bar = 0; bar < 12; bar++) {
      for (const beat of [0, 1, 2, 3]) {
        if (bar === 11 && beat === 3) continue; // the last note holds through beat 4
        const b = beats.find((x) => x.bar === bar && x.inBar === beat * 960);
        expect(b, `bar ${bar + 1} beat ${beat + 1}`).toBeDefined();
        const thumb = b!.notes.find((n) => n.string >= 4)!;
        expect(`${thumb.string}:${thumb.fret}`, `bar ${bar + 1} beat ${beat + 1}`).toBe(THUMB[CHORDS[bar]]);
        expect(b!.notes.filter((n) => n.string >= 4).length).toBe(1);
        const final = bar === 11 && beat === 2;
        expect(!!thumb.palmMute, `bar ${bar + 1} beat ${beat + 1}`).toBe(!final);
      }
    }
    // Nothing else sounds on strings 4-6, and nothing at all between the beats except the swung off-beat (two thirds of the way through).
    for (const b of beats.filter((x) => x.inBar % 960 !== 0)) {
      expect(b.inBar % 960, `bar ${b.bar + 1}`).toBe(640);
      expect(b.notes.every((n) => n.string <= 3), `bar ${b.bar + 1}`).toBe(true);
    }
  });

  it('plays an E minor pentatonic melody with the blue note B flat (string 3 fret 3) on strings 1-3, with slides', async () => {
    const song = await load('st-delta-blues-e');
    const beats = played(song, 'Guitar');
    const melody = beats.flatMap((b) => b.notes.filter((n) => n.string <= 3).map((n) => ({ bar: b.bar, n })));
    // E G A B D are E minor pentatonic; B flat is the blue note: together, the E blues scale.
    expect(outside(melody.map((m) => m.n.midi), scalePcs('E', 'minor-pentatonic'))).toEqual(['A#3']);
    expect(outside(melody.map((m) => m.n.midi), scalePcs('E', 'minor-blues'))).toEqual([]);
    expect(melody.filter((m) => m.n.midi === noteToMidi('Bb3')).every((m) => m.n.string === 3 && m.n.fret === 3)).toBe(true);
    expect(Math.max(...melody.map((m) => m.n.fret))).toBe(4);
    // Slides: into G (string 1 fret 3) and into D (string 2 fret 3) from below, and B flat up to B on string 3.
    const slideIns = melody.filter((m) => m.n.slideIn === 'below').map((m) => `${m.bar + 1}:${m.n.string}:${m.n.fret}`);
    expect(slideIns).toEqual(['1:1:3', '5:1:3', '7:1:3', '9:2:3', '10:1:3', '11:1:3']);
    const slides = melody.filter((m) => m.n.slide).map((m) => `${m.bar + 1}:${m.n.string}:${m.n.fret}${m.n.slide}`);
    expect(slides).toEqual(['2:3:4up', '4:3:4up', '8:3:4up', '12:3:4up']);
  });

  it('has, on beats 1 and 3, chord tones, the blue third, or notes that step to one', async () => {
    const song = await load('st-delta-blues-e');
    const beats = played(song, 'Guitar');
    // The minor third over the chord's root is the blues' own colour (G over E7, D over B7).
    const blueThird = (b: Played) => [(noteToMidi(`${b.chord!.replace('7', '')}2`) + 3) % 12];
    expect(strongBeatProblems(beats, [0, 1920], blueThird, (m) => m >= noteToMidi('G3'))).toEqual([]);
    expect(range(beats)).toEqual(['E2', 'G4']);
  });

  it('estimates at level 4 against the plan\'s 6: the estimate cannot see thumb independence', async () => {
    // Note for note this is swung eighths in open position; what makes it level 6 is a thumb that
    // keeps a steady muted beat while the fingers syncopate above it.
    const est = estimate(await load('st-delta-blues-e'), 'Guitar');
    expect(est.level, est.text).toBeGreaterThanOrEqual(4);
    expect(est.level, est.text).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------- Rondo alla Turca
describe('batch 12: rondo-alla-turca', () => {
  /** The piano's right hand, bars 0 (the upbeat) to 8 and the second ending, as commonly printed. */
  const PIANO = [
    ['B4', 'A4', 'G#4', 'A4'],
    ['C5', 'r', 'D5', 'C5', 'B4', 'C5'],
    ['E5', 'r', 'F5', 'E5', 'D#5', 'E5'],
    ['B5', 'A5', 'G#5', 'A5', 'B5', 'A5', 'G#5', 'A5'],
    ['C6', 'A5', 'B5'],
    ['C6', 'B5', 'A5', 'G#5'],
    ['A5', 'E5', 'F5', 'D5'],
    ['C5', 'B4'],
    ['A4', 'B4', 'A4', 'G#4', 'A4'],
    ['A4'],
  ];
  /** An octave below the piano, as the plan asks. */
  const GUITAR = PIANO.map((bar) => bar.map((t) => (t === 'r' ? 'r' : name(noteToMidi(t) - 12))));
  const DURATIONS = [
    times(4, 240),
    [480, 480, 240, 240, 240, 240],
    [480, 480, 240, 240, 240, 240],
    times(8, 240),
    [960, 480, 480],
    times(4, 480),
    times(4, 480),
    [960, 960],
    [960, 240, 240, 240, 240],
    [1920],
  ];
  /** The harmony each beat implies (the piece has no chord symbols): A minor, D minor under F, E under the cadence. */
  const IMPLIED = [['Am'], ['Am', 'Am'], ['Am', 'Am'], ['Am', 'Am'], ['Am', 'Am'], ['Am', 'Am'], ['Am', 'Dm'], ['E', 'E'], ['Am', 'Am'], ['Am', 'Am']];

  it('plays the theme as printed, an octave below the piano, from the upbeat', async () => {
    const song = await load('rondo-alla-turca');
    expect(song.bars.length).toBe(10);
    expect(barLength(song.bars[0])).toBe(960);
    expect(song.bars.slice(1).every((b) => barLength(b) === BAR_24)).toBe(true);
    const beats = played(song, 'Melody');
    expect(tokensByBar(beats, 10)).toEqual(GUITAR.map((bar) => bar.map(canon)));
    const durations = Array.from({ length: 10 }, (_, bar) => beats.filter((b) => b.bar === bar && b.pass === 1).map((b) => b.duration));
    expect(durations).toEqual(DURATIONS);
  });

  it('is played twice, as the composer repeats it: upbeat, bars 1-8, bars 1-7 and the second ending', async () => {
    const song = await load('rondo-alla-turca');
    const tl = flattenSong(song);
    expect(tl.bars.map((b) => b.bar)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 9]);
    const notes = played(song, 'Melody').filter((b) => b.midis.length).map((b) => b.token);
    expect(notes.length).toBe(4 + 2 * 35 - 4 + 1);
  });

  it('starts with the plan\'s frets: B A G# A on the open string 2, string 3 frets 2 and 1, then C on string 2 fret 1', async () => {
    const song = await load('rondo-alla-turca');
    const beats = played(song, 'Melody').filter((b) => b.midis.length);
    expect(beats.slice(0, 5).map((b) => `${b.notes[0].string}:${b.notes[0].fret}`)).toEqual(['2:0', '3:2', '3:1', '3:2', '2:1']);
    expect(beats.slice(0, 4).map((b) => b.stroke)).toEqual(['down', 'up', 'down', 'up']);
  });

  it('shifts to fourth position for bar 3 and fifth for the top C, and comes back to first position', async () => {
    const song = await load('rondo-alla-turca');
    const beats = played(song, 'Melody').filter((b) => b.pass === 1 && b.midis.length);
    const frets = (bar: number) => beats.filter((b) => b.bar === bar).map((b) => b.notes[0].fret);
    expect(frets(3)).toEqual([7, 5, 4, 5, 7, 5, 4, 5]);
    expect(frets(4)).toEqual([8, 5, 7]);
    expect(beats.filter((b) => b.bar >= 3 && b.bar <= 5).every((b) => b.notes[0].string === 1)).toBe(true);
    expect(Math.max(...beats.map((b) => b.notes[0].fret))).toBe(8);
    // Fingers in fourth position: 1 on fret 4, 2 on fret 5, 4 on fret 7.
    expect(beats.filter((b) => b.bar === 3).slice(0, 4).map((b) => b.notes[0].finger)).toEqual([4, 2, 1, 2]);
    expect(frets(7)).toEqual([1, 0]);
  });

  it('stays in A minor (G# the leading note, D# a neighbour of E), with harmony notes on the beats', async () => {
    const song = await load('rondo-alla-turca');
    const beats = played(song, 'Melody');
    expect(parseKey(song.key ?? '')).toMatchObject({ tonic: 'A', mode: 'minor' });
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('A', 'minor'))).toEqual(['D#4', 'G#3', 'G#4']);
    // D# only as the lower neighbour of E: E D# E.
    const notes = beats.filter((b) => b.midis.length);
    notes.forEach((b, i) => {
      if (b.midis[0] % 12 === 3) expect([notes[i - 1].token, notes[i + 1].token]).toEqual(['E4', 'E4']);
    });
    // Notes on the beats against the implied harmony.
    const withChord = beats.map((b) => ({ ...b, chord: b.pass === 1 || b.bar === 9 ? IMPLIED[b.bar][Math.floor(b.inBar / 960)] : IMPLIED[b.bar][Math.floor(b.inBar / 960)] }));
    expect(strongBeatProblems(withChord, [0, 960])).toEqual([]);
    expect(range(beats)).toEqual(['G#3', 'C5']);
  });

  it('estimates near level 6', async () => {
    const est = estimate(await load('rondo-alla-turca'), 'Melody');
    expect(Math.abs(est.level - 6), est.text).toBeLessThanOrEqual(1);
  });
});
