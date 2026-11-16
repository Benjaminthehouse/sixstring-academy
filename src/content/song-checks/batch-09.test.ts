/**
 * Independent cross-checks for batch 9 of the built-in songs: st-blues-turnarounds, st-pent-box-1,
 * st-lick-slide, st-lick-harmonics, st-travis-picking, st-read-first-sharps and irish-washerwoman.
 * (old-joe-clark, arkansas-traveler and haste-to-the-wedding were left out of this batch: see the
 * batch report.)
 *
 * The expected notes below were written out by hand as note names, from the composition plan of
 * each study and, for The Irish Washerwoman, as the jig is commonly printed in ABC (fiddle pitch,
 * converted here an octave down to the guitar's sounding pitch). They are not copied from the tab,
 * so a wrong fret shows up as a wrong note. Each song is parsed with the song core and compared
 * beat by beat (sounding pitches, so harmonics count at the pitch you hear), and then checked for:
 * notes on strong beats against the chord in force (chord tones, or a passing or neighbour note
 * that moves on by step to one), the key or scale, the range, the frets and fingers the plan
 * names, and the difficulty estimate against the plan's level.
 */
import { describe, expect, it } from 'vitest';
import { barLength, estimateDifficulty, flattenSong, parseSixTab, soundingPitch, type Note, type Song } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';
import { identifyFretted, scalePatterns } from '@/core/guitar';

const BAR_44 = 3840;
const BAR_68 = 2880;
const name = (m: number) => midiToNote(m, { prefer: 'sharps' });

/** "G2+B2", "E4s" or "D4h" -> canonical sharps spelling, so the comparison is by pitch, not by spelling. */
function canon(token: string): string {
  if (token === 'r' || token === '~' || token === 'slash') return token;
  const m = /^(.*\d)([hps]?)$/.exec(token);
  if (!m) throw new Error(`bad expected token ${token}`);
  const names = m[1].split('+').map((n) => noteToMidi(n)).sort((a, b) => a - b).map(name);
  return names.join('+') + m[2];
}

/** Repeat a bar's worth of tokens. */
const times = <T,>(n: number, bar: T): T[] => Array.from({ length: n }, () => bar);

interface Played {
  /** Song bar (0-based) and the pass through it (1 = the first time it is played). */
  bar: number;
  pass: number;
  inBar: number;
  duration: number;
  token: string;
  /** Sounding pitches struck on this beat, low to high (harmonics at the pitch heard). */
  midis: number[];
  notes: Note[];
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
      inBar: b.tick - bar.start,
      duration: b.duration,
      token,
      midis,
      notes: struck,
      slash: !!b.source.slash,
      stroke: b.source.stroke,
      chord: chord?.symbol ?? null,
      voicing: chord?.voicing ? chord.voicing.map((f) => (f === null ? 'x' : String(f))).join('') : null,
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
 * or whole tone) to a chord tone, possibly through further steps in the same direction (a
 * chromatic line). Repeats of the same note, and other notes sounding with it, are skipped over.
 */
function resolvesByStep(beats: Played[], from: number, pitch: number): boolean {
  let p = pitch;
  let dir = 0;
  for (let j = from + 1; j < beats.length && j <= from + 8; j++) {
    const b = beats[j];
    if (b.midis.includes(p)) continue;
    const q = b.midis.reduce((best, m) => (Math.abs(m - p) < Math.abs(best - p) ? m : best), b.midis[0]);
    const step = q - p;
    if (Math.abs(step) > 2 || (dir !== 0 && Math.sign(step) !== dir)) return false;
    if (b.chord && chordPcs(b.chord).includes(q % 12)) return true;
    dir = Math.sign(step);
    p = q;
  }
  return false;
}

/** Notes on the strong beats that are neither chord tones nor passing or neighbour notes. */
function strongBeatProblems(beats: Played[], strong: number[]): string[] {
  const sounding = beats.filter((b) => b.midis.length > 0);
  const problems: string[] = [];
  sounding.forEach((b, i) => {
    if (!strong.includes(b.inBar) || !b.chord) return;
    const tones = new Set(chordPcs(b.chord));
    for (const p of b.midis.filter((m) => !tones.has(m % 12))) {
      if (!resolvesByStep(sounding, i, p)) problems.push(`bar ${b.bar + 1} tick ${b.inBar}: ${name(p)} is not in ${b.chord} and does not move by step to a chord tone`);
    }
  });
  return problems;
}

/** Pitch names outside a set of pitch classes. */
function outside(midis: number[], pcs: number[]): string[] {
  const allowed = new Set(pcs);
  return [...new Set(midis.filter((m) => !allowed.has(m % 12)).map(name))];
}

/** Lowest and highest sounding note of a list of beats. */
function range(beats: Played[]): [string, string] {
  const all = beats.flatMap((b) => b.midis);
  return [name(Math.min(...all)), name(Math.max(...all))];
}

/** The estimate for the learner's track, its level and the plan's level. */
function estimate(song: Song, trackName: string): { level: number; text: string } {
  const track = song.tracks.find((t) => t.name === trackName)!;
  const est = estimateDifficulty(song, { track: track.id });
  return { level: est.level, text: `${song.meta.title}: estimated level ${est.level} (score ${est.score}, ${JSON.stringify(est.factors)})` };
}

/** Frets of a shape string, low string first ("x21202"). */
function shapeSounds(frets: string): string[] {
  const STANDARD = [40, 45, 50, 55, 59, 64];
  return [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)])).sort((a, b) => a - b).map(name);
}

const chordList = (song: Song) => song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}${c.voicing ? '=' + c.voicing.map((f) => (f === null ? 'x' : f)).join('') : ''}`);

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Each shape this batch uses, with the notes it should sound, low to high. */
const SHAPES: Record<string, string[]> = {
  'G=320003': ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
  'C=x32010': ['C3', 'E3', 'G3', 'C4', 'E4'],
  'D=xx0232': ['D3', 'A3', 'D4', 'F#4'],
  'A=x02220': ['A2', 'E3', 'A3', 'C#4', 'E4'],
  'A7=x02020': ['A2', 'E3', 'G3', 'C#4', 'E4'],
  'Am=x02210': ['A2', 'E3', 'A3', 'C4', 'E4'],
  'Am7=x02010': ['A2', 'E3', 'G3', 'C4', 'E4'],
  'E=022100': ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
  'E7=020100': ['E2', 'B2', 'D3', 'G#3', 'B3', 'E4'],
  'B7=x21202': ['B2', 'D#3', 'A3', 'B3', 'F#4'],
  'G7=320001': ['G2', 'B2', 'D3', 'G3', 'B3', 'F4'],
};

describe('batch 9: the chord shapes', () => {
  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, and every note of its chord', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets)).toEqual(names.map(canon));
    const tones = new Set(chordPcs(symbol));
    expect(names.every((n) => tones.has(noteToMidi(n) % 12)), `${shape} has a note outside ${symbol}`).toBe(true);
    expect([...tones].every((pc) => names.some((n) => noteToMidi(n) % 12 === pc)), `${shape} leaves out a note of ${symbol}`).toBe(true);
  });

  it.each(['st-blues-turnarounds', 'st-pent-box-1', 'st-lick-slide', 'st-lick-harmonics', 'st-travis-picking', 'st-read-first-sharps', 'irish-washerwoman'])(
    '%s gives a shape only from the list above',
    async (id) => {
      const song = await load(id);
      for (const c of song.chords.filter((x) => x.voicing)) expect(Object.keys(SHAPES)).toContain(`${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`);
    },
  );
});

// ---------------------------------------------------------------- blues turnarounds
describe('batch 9: st-blues-turnarounds', () => {
  const E_TURN = ['E2+D4+E4', 'D4+E4', 'C#4+E4', 'C#4+E4', 'C4+E4', 'C4+E4', 'B3+E4', 'B3+E4'];
  const A_TURN = ['A2+G3+E4', 'G3+E4', 'F#3+E4', 'F#3+E4', 'F3+E4', 'F3+E4', 'E3+E4', 'E3+E4'];
  const B7 = 'B2+D#3+A3+B3+F#4';
  const E7 = 'E2+B2+D3+G#3+B3+E4';
  const B7_END = [B7, B7, B7, 'r'];
  const E7_END = [E7, E7, E7, 'r'];
  const shuffle = (root: string, fifth: string, sixth: string) => times(2, [`${root}+${fifth}`, `${root}+${fifth}`, `${root}+${sixth}`, `${root}+${sixth}`]).flat();
  const E_SH = shuffle('E2', 'B2', 'C#3');
  const A_SH = shuffle('A2', 'E3', 'F#3');
  const D_SH = shuffle('D3', 'A3', 'B3');
  const B7_SWING = times(8, B7);
  const E_CHORUS = [...times(4, E_SH), ...times(2, A_SH), ...times(2, E_SH), B7_SWING, A_SH, E_TURN, B7_END, ['E2+B2+E3+G#3+B3+E4']];
  const A_CHORUS = [...times(4, A_SH), ...times(2, D_SH), ...times(2, A_SH), E_SH, D_SH, A_TURN, E7_END, ['A2+E3+A3+C#4+E4']];
  const EXPECTED = [E_TURN, B7_END, A_TURN, E7_END, ...E_CHORUS, ...A_CHORUS];
  const CHORDS = ['E7', 'B7', 'A7', 'E7', 'E', 'E', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E7', 'B7', 'E', 'A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A7', 'E7', 'A'];

  it('plays both turnarounds, then a 12-bar chorus in E and one in A, each with its turnaround', async () => {
    const song = await load('st-blues-turnarounds');
    expect(song.bars.length).toBe(30);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    const beats = played(song, 'Your part');
    expect(tokensByBar(beats, 30)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    const tl = flattenSong(song);
    expect(song.bars.map((_, i) => tl.chordAt(tl.bars[i].start)?.symbol)).toEqual(CHORDS);
    expect(song.sections.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual(['Turnaround in E:0-2', 'Turnaround in A:2-4', '12-bar in E:4-17', '12-bar in A:17-30']);
  });

  it('runs b7, 6, b6, 5 of the key, one note per beat on the planned string and frets, each with the open string 1', async () => {
    const song = await load('st-blues-turnarounds');
    const beats = played(song, 'Your part');
    const cases = [
      { bars: [0, 14], tonic: 'E', string: 3, frets: [7, 6, 5, 4], bass: { string: 6, fret: 0 } },
      { bars: [2, 27], tonic: 'A', string: 4, frets: [5, 4, 3, 2], bass: { string: 5, fret: 0 } },
    ];
    for (const c of cases) {
      for (const bar of c.bars) {
        const inBar = beats.filter((b) => b.bar === bar);
        // Every beat is a swung long-short pair (two thirds, one third of the beat).
        expect(inBar.map((b) => b.duration), `bar ${bar + 1}`).toEqual(times(4, [640, 320]).flat());
        // Every note pairs the moving note with the open string 1 (E4).
        for (const b of inBar) expect(b.notes.some((n) => n.string === 1 && n.fret === 0), `bar ${bar + 1}`).toBe(true);
        const line = inBar.filter((_, i) => i % 2 === 0).map((b) => b.notes.find((n) => n.string === c.string)!);
        expect(line.map((n) => n.fret), `bar ${bar + 1}`).toEqual(c.frets);
        const tonic = noteToMidi(`${c.tonic}2`) % 12;
        expect(line.map((n) => (((n.midi - tonic) % 12) + 12) % 12), `bar ${bar + 1}: b7 6 b6 5`).toEqual([10, 9, 8, 7]);
        // The open bass string sounds on beat 1.
        expect(inBar[0].notes.some((n) => n.string === c.bass.string && n.fret === c.bass.fret), `bar ${bar + 1}`).toBe(true);
      }
    }
    // The first time each turnaround appears it carries the fingers: 4 3 2 1 on the line, P I A on the right hand.
    for (const bar of [0, 2]) {
      const line = beats.filter((b) => b.bar === bar && b.inBar % 960 === 0).map((b) => b.notes.find((n) => n.fret > 0)!);
      expect(line.map((n) => n.finger)).toEqual([4, 3, 2, 1]);
      expect(beats.find((b) => b.bar === bar)!.notes.map((n) => n.pluck).sort()).toEqual(['a', 'i', 'p']);
    }
  });

  it('ends each turnaround on the V7 chord, B7 (x21202) in E and E7 (020100) in A, and each chorus on its I chord', async () => {
    const song = await load('st-blues-turnarounds');
    // Shapes are given where a chord first needs one: B7 in bar 2 (and again for the strummed bar 9 of the E chorus).
    expect(chordList(song).filter((c) => c.includes('='))).toEqual(['1:0:B7=x21202', '3:0:E7=020100', '12:0:B7=x21202', '16:0:E=022100', '29:0:A=x02220']);
    const beats = played(song, 'Your part');
    for (const bar of [1, 15]) expect(beats.find((b) => b.bar === bar)!.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['5:2', '4:1', '3:2', '2:0', '1:2']);
    for (const bar of [3, 28]) expect(beats.find((b) => b.bar === bar)!.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:0', '5:2', '4:0', '3:1', '2:0', '1:0']);
  });

  it('keeps the swing in every shuffle bar and has chord tones (or a chromatic line) on beats 1 and 3', async () => {
    const song = await load('st-blues-turnarounds');
    const beats = played(song, 'Your part');
    // Bars 12 (B7 or E7 with a rest) and the final chords are the only bars of the choruses not in swung pairs.
    const unswung = new Set([15, 16, 28, 29]);
    for (const b of beats.filter((x) => x.bar >= 4 && !unswung.has(x.bar))) {
      expect(b.duration, `bar ${b.bar + 1} tick ${b.inBar}`).toBe(b.inBar % 960 === 0 ? 640 : 320);
    }
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    // Shuffle pairs: the chord's root with its fifth or its sixth.
    for (const b of beats.filter((x) => x.midis.length === 2 && x.notes.every((n) => n.string >= 3 && n.string <= 6) && x.bar >= 4)) {
      const root = noteToMidi(`${b.chord!.replace('7', '')}2`) % 12;
      expect([0, 7, 9]).toEqual(expect.arrayContaining(b.midis.map((m) => (((m - root) % 12) + 12) % 12)));
    }
    expect(range(beats)).toEqual(['E2', 'F#4']);
    expect(Math.max(...beats.flatMap((b) => b.notes.map((n) => n.fret)))).toBe(7);
  });

  it('changes key with its sections: E, A, E, A', async () => {
    const song = await load('st-blues-turnarounds');
    expect(parseKey(song.key ?? '')?.tonic).toBe('E');
    expect(song.bars.map((b, i) => (b.key ? `${i}:${parseKey(b.key)?.tonic}` : null)).filter(Boolean)).toEqual(['2:A', '4:E', '17:A']);
  });

  it('estimates near level 4', async () => {
    const est = estimate(await load('st-blues-turnarounds'), 'Your part');
    expect(Math.abs(est.level - 4), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- pentatonic box 1
describe('batch 9: st-pent-box-1', () => {
  const EXPECTED = [
    ['A3', 'C4', 'D4', 'E4', 'D4', 'E4'],
    ['G4', 'E4', 'G4', 'A4', 'G4', 'r'],
    ['A4', 'G4', 'E4', 'G4', 'E4', 'D4'],
    ['C4', 'A3', 'G3', 'A3', 'r'],
    ['A2', 'C3', 'D3', 'E3', 'G3', 'E3'],
    ['A3', 'C4', 'D4h', 'C4', 'E4', 'r'],
    ['C5', 'A4', 'G4', 'A4', 'G4', 'E4'],
    ['G4', 'E4', 'D4', 'C4', 'A3', 'r'],
  ];
  /** Box 1 as the plan lists it. */
  const BOX_1 = ['6:5', '6:8', '5:5', '5:7', '4:5', '4:7', '3:5', '3:7', '2:5', '2:8', '1:5', '1:8'];

  it('plays the lick as composed', async () => {
    const song = await load('st-pent-box-1');
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your lick'), 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('uses every note of box 1 and nothing else, one finger per fret, with one hammer-on', async () => {
    const song = await load('st-pent-box-1');
    const beats = played(song, 'Your lick');
    const used = new Set(beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret}`)));
    expect([...used].sort()).toEqual([...BOX_1].sort());
    const finger: Record<number, number> = { 5: 1, 7: 3, 8: 4 };
    for (const b of beats) for (const n of b.notes) if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(finger[n.fret]);
    const legato = beats.flatMap((b) => b.notes.filter((n) => n.legato).map((n) => `${b.bar}:${n.string}:${n.fret}${n.legato}`));
    expect(legato).toEqual(['5:3:7hammer']);
    // Eighth and quarter notes only.
    expect(new Set(beats.map((b) => b.duration))).toEqual(new Set([480, 960]));
  });

  it('asks and answers: phrases 1 and 3 stop on G and E, phrases 2 and 4 come home to A', async () => {
    const song = await load('st-pent-box-1');
    const beats = played(song, 'Your lick');
    const last = (bar: number) => beats.filter((b) => b.bar === bar && b.midis.length).pop()!.token;
    expect([1, 3, 5, 7].map(last)).toEqual(['G4', 'A3', 'E4', 'A3'].map(canon));
    for (const t of [1, 3, 5, 7].map(last)) expect(chordPcs('Am7')).toContain(noteToMidi(t) % 12);
    expect(song.sections.map((s) => s.name)).toEqual(['Ask 1', 'Answer 1', 'Ask 2', 'Answer 2']);
  });

  it('stays in A minor pentatonic over Am7, with chord tones (or steps to them) on beats 1 and 3', async () => {
    const song = await load('st-pent-box-1');
    const beats = played(song, 'Your lick');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('A', 'minor-pentatonic'))).toEqual([]);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    expect(range(beats)).toEqual(['A2', 'C5']);
    expect(chordList(song)).toEqual(['0:0:Am7=x02010']);
    const groove = played(song, 'Teacher groove');
    expect(groove.filter((b) => !b.slash && b.token !== 'r')).toEqual([]);
  });

  it('estimates near level 4', async () => {
    const est = estimate(await load('st-pent-box-1'), 'Your lick');
    expect(Math.abs(est.level - 4), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- slides
describe('batch 9: st-lick-slide', () => {
  const EXPECTED = [
    ['A3', 'C4', 'D4', 'E4s', 'D4', 'C4'],
    ['D4', 'E4', 'G4', 'E4', 'r'],
    ['C4', 'D4', 'E4', 'G4', 'A4s', 'C5', 'A4'],
    ['D5', 'C5', 'A4', 'G4', 'A4', 'r'],
    ['A2', 'C3', 'D3', 'E3', 'G3'],
    ['C4s', 'E4', 'A4', 'G4', 'r'],
    ['C5', 'A4', 'G4', 'A4', 'E4', 'D4s'],
    ['C4', 'A3', 'G3', 'E3', 'A2'],
  ];

  it('plays the lick as composed', async () => {
    const song = await load('st-lick-slide');
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your lick'), 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('has the three planned slides (and one back down), every one with finger 3', async () => {
    const song = await load('st-lick-slide');
    const beats = played(song, 'Your lick');
    const slides: string[] = [];
    beats.forEach((b, i) => {
      for (const n of b.notes.filter((x) => x.slide)) {
        const before = beats.slice(0, i).reverse().find((x) => x.notes.some((y) => y.string === n.string))!;
        const from = before.notes.find((y) => y.string === n.string)!;
        slides.push(`${n.string}:${from.fret}>${n.string}:${n.fret}`);
        expect(n.finger, `slide to ${n.string}:${n.fret}`).toBe(3);
        expect(from.finger, `slide from ${n.string}:${from.fret}`).toBe(3);
      }
    });
    expect(slides).toEqual(['3:7>3:9', '2:8>2:10', '4:5>4:10', '3:9>3:7']);
    // The long slide crosses the bar line: it leaves G on beat 3 of bar 5 and lands on C on beat 1 of bar 6.
    const long = beats.find((b) => b.bar === 5 && b.inBar === 0)!;
    expect(long.token).toBe(canon('C4s'));
  });

  it('stays in A minor pentatonic over Am7, with chord tones (or steps to them) on beats 1 and 3', async () => {
    const song = await load('st-lick-slide');
    const beats = played(song, 'Your lick');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('A', 'minor-pentatonic'))).toEqual([]);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    expect(range(beats)).toEqual(['A2', 'D5']);
    const frets = beats.flatMap((b) => b.notes.map((n) => n.fret));
    expect([Math.min(...frets), Math.max(...frets)]).toEqual([5, 10]);
    // Phrases end on chord tones: E and G ask, A answers.
    const last = (bar: number) => beats.filter((b) => b.bar === bar && b.midis.length).pop()!.token;
    expect([1, 3, 5, 7].map(last)).toEqual(['E4', 'A4', 'G4', 'A2'].map(canon));
  });

  it('estimates near level 4', async () => {
    const est = estimate(await load('st-lick-slide'), 'Your lick');
    expect(Math.abs(est.level - 4), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- harmonics
describe('batch 9: st-lick-harmonics', () => {
  const EXPECTED = [
    ['D4', 'G4', 'B4'],
    ['G4', 'B4', 'D5'],
    ['F#5', 'D5', 'A4'],
    ['D5', 'A4', 'D4'],
    ['D4', 'G4', 'B4'],
    ['D5', 'G5', 'B5'],
    ['A4', 'D5', 'F#5'],
    ['D5+G5+B5'],
  ];
  /** What a natural harmonic sounds on strings 4, 3 and 2, from the plan: fret 12 an octave up, fret 7 an octave and a fifth, fret 5 two octaves. */
  const HARMONIC: Record<string, string> = {
    '4:12': 'D4', '3:12': 'G4', '2:12': 'B4',
    '4:7': 'A4', '3:7': 'D5', '2:7': 'F#5',
    '4:5': 'D5', '3:5': 'G5', '2:5': 'B5',
  };

  it('plays the tune as composed, at the pitches the harmonics sound', async () => {
    const song = await load('st-lick-harmonics');
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your harmonics'), 8)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('uses only natural harmonics on strings 4, 3 and 2 over frets 12, 7 and 5', async () => {
    const song = await load('st-lick-harmonics');
    const beats = played(song, 'Your harmonics');
    for (const b of beats) {
      for (const n of b.notes) {
        expect(n.harmonic, `bar ${b.bar + 1}`).toBe('natural');
        expect(HARMONIC[`${n.string}:${n.fret}`], `bar ${b.bar + 1}: ${n.string}:${n.fret}`).toBeDefined();
        expect(name(soundingPitch(n)!), `bar ${b.bar + 1}: ${n.string}:${n.fret}`).toBe(canon(HARMONIC[`${n.string}:${n.fret}`]));
      }
    }
    // All nine harmonic spots the plan names are used.
    expect(new Set(beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret}`)))).toEqual(new Set(Object.keys(HARMONIC)));
  });

  it('is in G major over G and D, with chord tones (or steps to them) on beats 1 and 3, and ends F# to G', async () => {
    const song = await load('st-lick-harmonics');
    const beats = played(song, 'Your harmonics');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('G', 'major'))).toEqual([]);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    expect(range(beats)).toEqual(['D4', 'B5']);
    expect(chordList(song)).toEqual(['0:0:G=320003', '2:0:D=xx0232', '4:0:G', '6:0:D', '7:0:G']);
    const notes = beats.filter((b) => b.midis.length);
    expect(notes[notes.length - 2].token).toBe(canon('F#5'));
    expect(notes[notes.length - 1].midis).toContain(noteToMidi('G5'));
    expect(played(song, 'Teacher').filter((b) => !b.slash)).toEqual([]);
  });

  it('estimates near level 4', async () => {
    const est = estimate(await load('st-lick-harmonics'), 'Your harmonics');
    expect(Math.abs(est.level - 4), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- Travis picking
describe('batch 9: st-travis-picking', () => {
  const C = ['C3', 'C4', 'E3', 'E4', 'G2', 'C4', 'E3', 'E4'];
  const AM = ['A2', 'C4', 'E3', 'E4', 'A2', 'C4', 'E3', 'E4'];
  const G7 = ['G2', 'B3', 'D3', 'F4', 'G2', 'B3', 'D3', 'F4'];
  const pinch = (bar: string[]) => [`${bar[0]}+${bar[3]}`, ...bar.slice(1)];
  const FIRST = [C, C, AM, AM, G7, G7, C, C];
  /** The last bar (review fix): the pinch and two beats of the pattern, then a C rung by p, i and m on beat 3. */
  const LAST = ['C3+E4', 'C4', 'E3', 'E4', 'C3+C4+E4'];
  const EXPECTED = [...FIRST, ...FIRST.slice(0, 7).map(pinch), LAST];

  it('plays C C Am Am G7 G7 C C twice, the second time with a pinch on beat 1, and ends on a ringing C', async () => {
    const song = await load('st-travis-picking');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your part'), 16)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
    expect(chordList(song)).toEqual(['0:0:C=x32010', '2:0:Am=x02210', '4:0:G7=320001', '6:0:C', '8:0:C', '10:0:Am', '12:0:G7', '14:0:C']);
  });

  it('keeps the thumb on every beat, alternating the planned bass strings, palm muted; i on string 2 and m on string 1 between', async () => {
    const song = await load('st-travis-picking');
    const beats = played(song, 'Your part');
    const BASS: Record<string, string[]> = { C: ['5:3', '4:2', '6:3', '4:2'], Am: ['5:0', '4:2', '5:0', '4:2'], G7: ['6:3', '4:0', '6:3', '4:0'] };
    for (let bar = 0; bar < 16; bar++) {
      const inBar = beats.filter((b) => b.bar === bar);
      // The last bar keeps the pattern for two beats, then holds the final chord (beats 3 and 4).
      const last = bar === 15;
      const pattern = last ? inBar.filter((b) => b.inBar < 1920) : inBar;
      expect(inBar.map((b) => b.inBar), `bar ${bar + 1}`).toEqual(last ? [0, 480, 960, 1440, 1920] : [0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
      const thumb = pattern.filter((b) => b.inBar % 960 === 0).map((b) => b.notes.find((n) => n.string >= 4)!);
      expect(thumb.map((n) => `${n.string}:${n.fret}`), `bar ${bar + 1}`).toEqual(BASS[inBar[0].chord!].slice(0, thumb.length));
      expect(thumb.every((n) => n.palmMute), `bar ${bar + 1}: the bass is palm muted`).toBe(true);
      const fingers = pattern.filter((b) => b.inBar % 960 !== 0).map((b) => b.notes.map((n) => n.string).join());
      expect(fingers, `bar ${bar + 1}`).toEqual(last ? ['2', '1'] : ['2', '1', '2', '1']);
      // Only the thumb notes are muted (and the final chord rings, unmuted).
      expect(inBar.flatMap((b) => b.notes.filter((n) => n.string < 4)).some((n) => n.palmMute)).toBe(false);
      if (last) {
        const end = inBar[inBar.length - 1];
        expect(end.duration, 'the final chord is a half note on beat 3').toBe(1920);
        expect(end.notes.map((n) => `${n.string}:${n.fret}${n.pluck}${n.letRing ? ' ring' : ''}${n.palmMute ? ' pm' : ''}`)).toEqual(['5:3p ring', '2:1i ring', '1:0m ring']);
      }
      // Bars 9-16: thumb and m (string 1) together on beat 1; bars 1-8: the thumb alone.
      expect(inBar[0].notes.length, `bar ${bar + 1}`).toBe(bar < 8 ? 1 : 2);
      expect(inBar[0].notes.some((n) => n.string === 1), `bar ${bar + 1}`).toBe(bar >= 8);
    }
    // Where picking fingers are written they agree with the plan: P on the bass, I on string 2, M on string 1.
    for (const b of beats) for (const n of b.notes) if (n.pluck) expect(n.pluck, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(n.string >= 4 ? 'p' : n.string === 2 ? 'i' : 'm');
  });

  it('plays only chord tones, in C major, in first position', async () => {
    const song = await load('st-travis-picking');
    const beats = played(song, 'Your part');
    for (const b of beats) expect(outside(b.midis, chordPcs(b.chord!)), `bar ${b.bar + 1}`).toEqual([]);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('C', 'major'))).toEqual([]);
    expect(Math.max(...beats.flatMap((b) => b.notes.map((n) => n.fret)))).toBe(3);
    expect(range(beats)).toEqual(['G2', 'F4']);
  });

  it('estimates near level 4', async () => {
    const est = estimate(await load('st-travis-picking'), 'Your part');
    expect(Math.abs(est.level - 4), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- reading
describe('batch 9: st-read-first-sharps', () => {
  const EXPECTED = [
    ['F#4', 'E4', 'D4', 'A3'],
    ['B3', 'C#4', 'D4', 'B3'],
    ['A3', 'B3', 'C#4', 'E4'],
    ['~', 'D4', 'C#4', 'D4'],
    ['D3', 'F#3', 'A3', 'D4'],
    ['B3', 'A3', 'G3', 'B3'],
    ['A2', 'C#3', 'E3', 'G3'],
    ['F#3', 'E3', 'D3'],
    ['E4', 'C#4', 'A3', 'C#4'],
    ['F#4', 'E4', 'D4', 'B3'],
    ['G#3', 'A3', 'B3'],
    ['~', 'A3', 'G#3', 'A3'],
    ['A2', 'C#3', 'E3', 'A3'],
    ['F#3', 'E3', 'D3', 'F#3'],
    ['E3', 'G#3', 'B3', 'D4'],
    ['C#4', 'B3', 'A3'],
  ];

  it('plays the two tunes as composed', async () => {
    const song = await load('st-read-first-sharps');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensByBar(played(song, 'Your part'), 16)).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('is in D major for bars 1-8 and A major for bars 9-16, with chord tones on beats 1 and 3', async () => {
    const song = await load('st-read-first-sharps');
    const beats = played(song, 'Your part');
    expect(parseKey(song.key ?? '')?.tonic).toBe('D');
    expect(song.bars.map((b, i) => (b.key ? `${i}:${parseKey(b.key)?.tonic} ${parseKey(b.key)?.mode}` : null)).filter(Boolean)).toEqual(['8:A major']);
    expect(outside(beats.filter((b) => b.bar < 8).flatMap((b) => b.midis), scalePcs('D', 'major'))).toEqual([]);
    expect(outside(beats.filter((b) => b.bar >= 8).flatMap((b) => b.midis), scalePcs('A', 'major'))).toEqual([]);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    expect(range(beats)).toEqual(['A2', 'F#4']);
  });

  it('reads the sharps where the plan puts them, in first position with finger = fret', async () => {
    const song = await load('st-read-first-sharps');
    const beats = played(song, 'Your part');
    const at = (s: number, f: number) => beats.filter((b) => b.notes.some((n) => n.string === s && n.fret === f));
    expect(at(5, 4).length, 'C# at string 5 fret 4').toBeGreaterThanOrEqual(2);
    expect(at(2, 2).length, 'C# at string 2 fret 2').toBeGreaterThanOrEqual(4);
    expect(at(3, 1).length, 'G# at string 3 fret 1').toBeGreaterThanOrEqual(3);
    expect(at(3, 1).every((b) => b.bar >= 8), 'G# only in A major').toBe(true);
    for (const b of beats) for (const n of b.notes) {
      expect(n.fret, `bar ${b.bar + 1}`).toBeLessThanOrEqual(4);
      if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(n.fret);
    }
  });

  it('has dotted quarters and two ties across the bar line', async () => {
    const song = await load('st-read-first-sharps');
    const beats = played(song, 'Your part');
    expect(beats.filter((b) => b.duration === 1440).length).toBeGreaterThanOrEqual(10);
    // Each dotted quarter is followed by an eighth, so the beat comes back on beat 2 or 4.
    beats.forEach((b, i) => { if (b.duration === 1440) expect(beats[i + 1].duration, `bar ${b.bar + 1}`).toBe(480); });
    const ties = beats.filter((b) => b.token === '~');
    expect(ties.map((b) => `${b.bar}:${b.inBar}`)).toEqual(['3:0', '11:0']);
    const tl = flattenSong(song);
    const track = song.tracks[0];
    for (const t of ties) {
      const beat = tl.trackBeats(track.id).find((b) => b.bar === t.bar && b.tick - tl.barAt(b.tick).start === 0)!;
      const tied = beat.notes[0];
      const prev = beats.filter((b) => b.bar === t.bar - 1).pop()!;
      expect(prev.notes.map((n) => `${n.string}:${n.fret}`)).toEqual([`${tied.string}:${tied.fret}`]);
    }
  });

  it('estimates 2 against the plan\'s 4: the estimate measures the hands, not the reading', async () => {
    // Gap note (integration pass 2): this used to estimate 3, but only because the core's hand
    // window started at the first fretted note and reported a five-fret stretch that is not there.
    // The hand model now fits the part into first position (frets 1-4, one finger per fret), so the
    // better estimate is 2: quarters, halves and dotted quarters in first position. The plan's
    // level 4 is the reading (two key signatures with sharps, dotted rhythms, ties across the bar
    // line), which the estimate does not measure.
    const est = estimate(await load('st-read-first-sharps'), 'Your part');
    expect(est.level, est.text).toBeGreaterThanOrEqual(2);
    expect(est.level, est.text).toBeLessThanOrEqual(5);
    // No stretch: the stretch factor is zero (the text lists every factor by name).
    expect(est.text).toMatch(/"stretch":0[,}]/);
  });
});

// ---------------------------------------------------------------- The Irish Washerwoman
/**
 * Notes as fiddle tunes are commonly printed in ABC: C-B is the octave from middle C, c-b the one
 * above; F is sharp in G major. Each letter is an eighth note unless a digit follows (G3 = three
 * eighths). The guitar plays the tune at the fiddle's written pitch, so it sounds an octave lower.
 */
function abcNotes(abc: string): Array<{ note: string; eighths: number }> {
  return [...abc.matchAll(/([A-Ga-g])(\d?)/g)].map((m) => {
    const letter = m[1].toUpperCase();
    const octave = m[1] === letter ? 4 : 5;
    return { note: name(noteToMidi(`${letter}${letter === 'F' ? '#' : ''}${octave}`) - 12), eighths: m[2] ? Number(m[2]) : 1 };
  });
}

/** The A part without its last bar, and the B part, as the jig is commonly printed. */
const WASHERWOMAN_A = 'BGG DGG|BGB dcB|cAA EAA|cAc edc|BGG DGG|BGB dcB|cBc Adc';
const WASHERWOMAN_B = 'gdd gdd|gdg bag|fdd fdd|fdf agf|egg dgg|cgg Bgg|cBc Adc|BGG G3';
/** AABB as played: pickup, A with its first ending (leading back in), A with its second ending, B twice. */
const WASHERWOMAN = `dc|${WASHERWOMAN_A}|BGG Gdc|${WASHERWOMAN_A}|BGG G3|${WASHERWOMAN_B}|${WASHERWOMAN_B}`;

describe('batch 9: irish-washerwoman', () => {
  const TUNE = WASHERWOMAN;

  it('plays the jig as it is commonly printed, AABB, note for note and in rhythm', async () => {
    const song = await load('irish-washerwoman');
    const beats = played(song, 'Melody').filter((b) => b.midis.length);
    expect(beats.every((b) => b.midis.length === 1)).toBe(true);
    expect(beats.map((b) => ({ note: name(b.midis[0]), eighths: b.duration / 480 }))).toEqual(abcNotes(TUNE));
  });

  it('has the AABB form: a pickup, 8-bar parts, first and second endings', async () => {
    const song = await load('irish-washerwoman');
    const tl = flattenSong(song);
    expect(tl.bars.map((b) => b.bar)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(barLength(song.bars[0])).toBe(960);
    expect(song.bars.slice(1).every((b) => barLength(b) === BAR_68)).toBe(true);
    expect(song.bars.every((b) => b.time.numerator === 6 && b.time.denominator === 8)).toBe(true);
    // 6/8 at a dotted quarter of 92, the plan's tempo, is 138 quarters a minute.
    expect(song.tempo[0].bpm).toBe(138);
    expect(song.sections.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('is harmonised with G, C and D only, with chord tones (or passing notes) on both beats of every bar', async () => {
    const song = await load('irish-washerwoman');
    const beats = played(song, 'Melody');
    expect(chordList(song)).toEqual([
      '1:0:G=320003', '3:0:C=x32010', '4:1440:D=xx0232', '5:0:G', '7:0:C', '7:1440:D', '8:0:G', '9:0:G',
      '10:0:G', '12:0:D', '14:0:C', '14:1440:G', '15:0:C', '15:1440:G', '16:0:C', '16:1440:D', '17:0:G',
    ]);
    expect(strongBeatProblems(beats, [0, 1440])).toEqual([]);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('G', 'major'))).toEqual([]);
    expect(range(beats)).toEqual(['D3', 'B4']);
    const backup = played(song, 'Backup');
    expect(backup.filter((b) => b.token !== 'r').every((b) => b.slash)).toBe(true);
    // The backup strums down on each beat and up on the third eighth.
    for (const b of backup.filter((x) => x.slash && x.bar > 0 && x.duration !== 1440)) expect(`${b.inBar}${b.stroke}`).toMatch(/^(0down|960up|1440down|2400up)$/);
  });

  it('puts the A part in first position and the B part in fifth position (open strings aside), with the planned picking', async () => {
    const song = await load('irish-washerwoman');
    const beats = played(song, 'Melody');
    const fretted = (from: number, to: number) => beats.filter((b) => b.bar >= from && b.bar <= to).flatMap((b) => b.notes.filter((n) => n.fret > 0).map((n) => n.fret));
    expect(Math.max(...fretted(0, 9))).toBe(3);
    expect([Math.min(...fretted(10, 17)), Math.max(...fretted(10, 17))]).toEqual([5, 8]);
    const fingerFor = (bar: number, fret: number) => (bar <= 9 ? fret : fret - 4);
    for (const b of beats) for (const n of b.notes) if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(fingerFor(b.bar, n.fret));
    expect(beats.filter((b) => b.bar === 1 && b.pass === 1).map((b) => b.stroke)).toEqual(['down', 'up', 'down', 'down', 'up', 'down']);
  });

  it('estimates near level 5', async () => {
    const est = estimate(await load('irish-washerwoman'), 'Melody');
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- the checks catch mistakes
describe('batch 9: the checks themselves', () => {
  it('catch a wrong fret in a study, a wrong note in the jig and a harmonic over the wrong fret', async () => {
    const box = await loadSongText('st-pent-box-1');
    const wrong = parseSixTab(box.replace('e 1:5 2:8 q 2:5', 'e 1:5 2:7 q 2:5')).song!;
    expect(tokensByBar(played(wrong, 'Your lick'), 8)[2][1]).toBe('F#4');
    expect(outside(played(wrong, 'Your lick').flatMap((b) => b.midis), scalePcs('A', 'minor-pentatonic'))).toEqual(['F#4']);

    // E (string 4 fret 2) in bar 3 of the jig played two frets too high: the comparison with the printed tune fails at
    // exactly that note, the first time (pickup 2 + bars 1-2 + 3 = note 17) and on the repeat (2 + 48 + 12 + 3 = note 65).
    const jig = await loadSongText('irish-washerwoman');
    const wrongJig = parseSixTab(jig.replace('2:1 3:2{2} 3:2 4:2{2}', '2:1 3:2{2} 3:2 4:4{2}')).song!;
    const notes = played(wrongJig, 'Melody').filter((b) => b.midis.length).map((b) => name(b.midis[0]));
    const printed = abcNotes(WASHERWOMAN).map((n) => n.note);
    expect(notes.flatMap((n, i) => (n === printed[i] ? [] : [`${i}:${n} for ${printed[i]}`]))).toEqual(['17:F#3 for E3', '65:F#3 for E3']);

    const bells = await loadSongText('st-lick-harmonics');
    const wrongBells = parseSixTab(bells.replace('q 2:<7> 3:<7> h 4:<7>', 'q 2:<9> 3:<7> h 4:<7>')).song!;
    expect(tokensByBar(played(wrongBells, 'Your harmonics'), 8)[2][0]).not.toBe(canon('F#5'));
  });
});

// ---------------------------------------------------------------- independent review
/**
 * Added by the batch review. The jig's notes are written out again here, by a second person and in
 * a different form (sounding note names, bar by bar), so the comparison does not rest on one
 * transcription. Chord shapes and the pentatonic boxes are checked against the guitar engine, not
 * against hand-written note lists, and every bar that a learner-facing text names must exist and
 * hold what the text says.
 */
describe('batch 9 review: cross-checks against the engines and a second transcription', () => {
  it('every chord shape in the batch is the chord its symbol names, by the guitar engine', async () => {
    for (const id of ['st-blues-turnarounds', 'st-pent-box-1', 'st-lick-slide', 'st-lick-harmonics', 'st-travis-picking', 'st-read-first-sharps', 'irish-washerwoman']) {
      const song = await load(id);
      for (const c of song.chords.filter((x) => x.voicing)) {
        const frets = c.voicing!.map((f) => (f === null ? 'x' : String(f))).join('');
        expect(identifyFretted(frets).symbol, `${id} bar ${c.bar + 1}: ${c.symbol}=${frets}`).toBe(c.symbol);
      }
    }
  });

  it('the box-1 lick sits exactly in the engine\'s box 1, with the engine\'s fingers', async () => {
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    expect(box1.minFret).toBe(5);
    const engine = new Map(box1.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    const beats = played(await load('st-pent-box-1'), 'Your lick');
    for (const b of beats) for (const n of b.notes) {
      expect(engine.has(`${n.string}:${n.fret}`), `bar ${b.bar + 1}: ${n.string}:${n.fret} is outside box 1`).toBe(true);
      if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1}: ${n.string}:${n.fret}`).toBe(engine.get(`${n.string}:${n.fret}`));
    }
  });

  it('the slide lick moves from box 1 into the engine\'s box 2 after its first slide, fingered as the engine fingers it', async () => {
    const [box1, box2] = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    const in1 = new Map(box1.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    const in2 = new Map(box2.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    const beats = played(await load('st-lick-slide'), 'Your lick');
    // Bar 1 before the slide: box 1. From the slide to the end of bar 2: box 2, with the engine's fingers where written.
    for (const b of beats.filter((x) => x.bar === 0 && x.inBar < 1920)) for (const n of b.notes) expect(in1.has(`${n.string}:${n.fret}`), `bar 1 ${n.string}:${n.fret}`).toBe(true);
    for (const b of beats.filter((x) => (x.bar === 0 && x.inBar >= 1920) || x.bar === 1)) {
      for (const n of b.notes) {
        expect(in2.has(`${n.string}:${n.fret}`), `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(true);
        if (n.finger !== undefined) expect(n.finger, `bar ${b.bar + 1} ${n.string}:${n.fret}`).toBe(in2.get(`${n.string}:${n.fret}`));
      }
    }
    // The lick ends home in box 1, on the root.
    const end = beats.filter((x) => x.bar === 7);
    for (const b of end) for (const n of b.notes) expect(in1.has(`${n.string}:${n.fret}`), `bar 8 ${n.string}:${n.fret}`).toBe(true);
    expect(end[end.length - 1].token).toBe(canon('A2'));
  });

  it('The Irish Washerwoman matches a second transcription, bar by bar (first time through each bar)', async () => {
    const SECOND = [
      'D4 C4',
      'B3 G3 G3 D3 G3 G3', 'B3 G3 B3 D4 C4 B3', 'C4 A3 A3 E3 A3 A3', 'C4 A3 C4 E4 D4 C4',
      'B3 G3 G3 D3 G3 G3', 'B3 G3 B3 D4 C4 B3', 'C4 B3 C4 A3 D4 C4', 'B3 G3 G3 G3 D4 C4', 'B3 G3 G3 G3',
      'G4 D4 D4 G4 D4 D4', 'G4 D4 G4 B4 A4 G4', 'F#4 D4 D4 F#4 D4 D4', 'F#4 D4 F#4 A4 G4 F#4',
      'E4 G4 G4 D4 G4 G4', 'C4 G4 G4 B3 G4 G4', 'C4 B3 C4 A3 D4 C4', 'B3 G3 G3 G3',
    ];
    const song = await load('irish-washerwoman');
    // The first time each bar is heard (the second ending is only ever heard on the repeat).
    const firstHeard = (all: Played[]) => song.bars.map((_, i) => {
      const bar = all.filter((b) => b.bar === i);
      const pass = Math.min(...bar.map((b) => b.pass));
      return bar.filter((b) => b.pass === pass).map((b) => b.token);
    });
    expect(firstHeard(played(song, 'Melody'))).toEqual(SECOND.map((bar) => bar.split(' ').map(canon)));
    // The fifth-position B part: the G-D pairs on fingers 4 and 3, the F#-D pairs both on fret 7.
    const beats = played(song, 'Melody');
    const b1 = beats.find((b) => b.bar === 10 && b.inBar === 0)!.notes[0];
    const b1d = beats.find((b) => b.bar === 10 && b.inBar === 480)!.notes[0];
    expect([`${b1.string}:${b1.fret}f${b1.finger}`, `${b1d.string}:${b1d.fret}f${b1d.finger}`]).toEqual(['2:8f4', '3:7f3']);
    const f = beats.find((b) => b.bar === 12 && b.inBar === 0)!.notes[0];
    const fd = beats.find((b) => b.bar === 12 && b.inBar === 480)!.notes[0];
    expect([`${f.string}:${f.fret}f${f.finger}`, `${fd.string}:${fd.fret}f${fd.finger}`]).toEqual(['2:7f3', '3:7f3']);
  });

  it('the harmonics study plays the same G chord an octave apart at frets 12 and 5, as its metadata says', async () => {
    const beats = played(await load('st-lick-harmonics'), 'Your harmonics');
    const at12 = beats.filter((b) => b.bar === 4).flatMap((b) => b.midis);
    const at5 = beats.filter((b) => b.bar === 5).flatMap((b) => b.midis);
    expect(at12.map(name)).toEqual(['D4', 'G4', 'B4']);
    expect(at5.map((m, i) => m - at12[i])).toEqual([12, 12, 12]);
    const meta = songEntry('st-lick-harmonics')!;
    expect(meta.teaches.join(' ')).not.toMatch(/two octaves apart/);
    expect(meta.teaches.join(' ')).toMatch(/an octave higher at fret 5/);
  });

  it('every bar a learner-facing text names exists, and the turnaround bars named in its advice are turnarounds', async () => {
    for (const id of ['st-blues-turnarounds', 'st-pent-box-1', 'st-lick-slide', 'st-lick-harmonics', 'st-travis-picking', 'st-read-first-sharps', 'irish-washerwoman']) {
      const song = await load(id);
      const meta = songEntry(id)!;
      const text = [meta.about, ...meta.teaches].join(' ');
      for (const m of text.matchAll(/\bbars? (\d+)(?:(?: to |-| and )(\d+))?/g)) {
        for (const n of [m[1], m[2]].filter(Boolean).map(Number)) expect(n, `${id}: "${m[0]}"`).toBeLessThanOrEqual(song.bars.length);
      }
    }
    // The turnaround advice names bars 1, 3, 15 and 28: each must be the falling line over the open string 1.
    const song = await load('st-blues-turnarounds');
    const about = songEntry('st-blues-turnarounds')!.about;
    const named = [...about.matchAll(/\bbar (\d+)/g)].map((m) => Number(m[1]));
    expect(named).toEqual([1, 3, 15, 28]);
    const beats = played(song, 'Your part');
    for (const bar of named) {
      const inBar = beats.filter((b) => b.bar === bar - 1);
      expect(inBar.every((b) => b.notes.some((n) => n.string === 1 && n.fret === 0)), `bar ${bar}`).toBe(true);
      const line = inBar.filter((b) => b.inBar % 960 === 0).map((b) => b.notes.find((n) => n.fret > 0)!.fret);
      expect(line, `bar ${bar}`).toEqual(line[0] === 7 ? [7, 6, 5, 4] : [5, 4, 3, 2]);
    }
  });
});
