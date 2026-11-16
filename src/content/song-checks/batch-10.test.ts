/**
 * Independent cross-checks for batch 10 of the built-in songs: st-pent-box-2, st-pent-box-3,
 * st-minor-blues-a, st-power-chords-gallop, st-strum-reggae and hall-of-the-mountain-king.
 * (si-bheag-si-mhor, down-by-the-riverside-travis, carmen-habanera and funeral-march-of-a-marionette
 * were left out of this batch: see the batch report.)
 *
 * The expected notes below are written out by hand as note names: for the studies from their
 * composition plans, and for the Mountain King from the theme as it is commonly printed in Grieg's
 * B minor and in the A minor of beginner books, each transposed here to E minor by the test itself.
 * They are not copied from the tab, so a wrong fret shows up as a wrong note. Each song is parsed
 * with the song core and compared beat by beat, then checked for: notes on strong beats against the
 * chord in force (chord tones, or a passing or neighbour note that moves on by step to one), the key
 * or scale, the range, the shapes, frets and techniques the plan names, and the difficulty estimate
 * against the plan's level.
 *
 * Songs are read from disk rather than through the registry, so that another batch's half-written
 * meta.ts cannot stop these checks from running.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barLength, estimateDifficulty, flattenSong, parseSixTab, soundingPitch, validateSong, type Note, type Song } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { scalePatterns } from '@/core/guitar';
import boxTwoMeta from '@/content/songs/st-pent-box-2/meta';
import boxThreeMeta from '@/content/songs/st-pent-box-3/meta';
import minorBluesMeta from '@/content/songs/st-minor-blues-a/meta';
import gallopMeta from '@/content/songs/st-power-chords-gallop/meta';
import reggaeMeta from '@/content/songs/st-strum-reggae/meta';
import mountainKingMeta from '@/content/songs/hall-of-the-mountain-king/meta';

const BAR_44 = 3840;
const name = (m: number) => midiToNote(m, { prefer: 'sharps' });

/** "G2+B2", "E4s", "D4h" or "A4p" -> canonical sharps spelling, so the comparison is by pitch, not spelling. */
function canon(token: string): string {
  if (token === 'r' || token === 'slash') return token;
  const m = /^(.*\d)([hps]?)$/.exec(token);
  if (!m) throw new Error(`bad expected token ${token}`);
  const names = m[1].split('+').map((n) => noteToMidi(n)).sort((a, b) => a - b).map(name);
  return names.join('+') + m[2];
}

/** Move a list of note names by a number of semitones. */
const transpose = (notes: string[], semis: number) => notes.map((n) => (n === 'r' ? n : name(noteToMidi(n) + semis)));
const times = <T,>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

interface Played {
  bar: number;
  pass: number;
  inBar: number;
  duration: number;
  token: string;
  midis: number[];
  notes: Note[];
  slash: boolean;
  stroke?: 'down' | 'up';
  chord: string | null;
  voicing: string | null;
}

function load(id: string): Song {
  const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(text);
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  expect(result.warnings, `${id}: parse warnings`).toEqual([]);
  expect(validateSong(result.song!).map((i) => i.message), `${id}: validateSong`).toEqual([]);
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
    let token = b.source.slash ? 'slash' : midis.length ? midis.map(name).join('+') : 'r';
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

/** The tokens of a track, one list per bar as played (repeats unrolled). */
function tokensAsPlayed(beats: Played[]): string[][] {
  const out: string[][] = [];
  let key = '';
  for (const b of beats) {
    const k = `${b.bar}:${b.pass}`;
    if (k !== key) out.push([]);
    key = k;
    out[out.length - 1].push(b.token);
  }
  return out;
}

/**
 * A note outside the chord is a passing or neighbour note when the line moves on by step (a half
 * or whole tone) to a chord tone, possibly through further steps in the same direction.
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

/** The estimate for the learner's track. */
function estimate(song: Song, trackName: string) {
  const track = song.tracks.find((t) => t.name === trackName)!;
  const est = estimateDifficulty(song, { track: track.id });
  return { ...est, text: `${song.meta.title}: estimated level ${est.level} (score ${est.score}, ${JSON.stringify(est.factors)}; ${est.reasons.join(' ')})` };
}

/** Frets of a shape string, low string first ("x02010"), as sounding note names low to high. */
function shapeSounds(frets: string): string[] {
  const STANDARD = [40, 45, 50, 55, 59, 64];
  return [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)])).sort((a, b) => a - b).map(name);
}

const keyOf = (text: string | undefined) => {
  const k = text ? parseKey(text) : null;
  return k ? `${k.tonic} ${k.mode}` : null;
};

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Each shape this batch gives, with the notes it should sound, low to high. */
const SHAPES: Record<string, string[]> = {
  'Am7=x02010': ['A2', 'E3', 'G3', 'C4', 'E4'],
  'Dm7=xx0211': ['D3', 'A3', 'C4', 'F4'],
  'E7=020100': ['E2', 'B2', 'D3', 'G#3', 'B3', 'E4'],
  'A5=577xxx': ['A2', 'E3', 'A3'],
  'G5=355xxx': ['G2', 'D3', 'G3'],
  'C5=x355xx': ['C3', 'G3', 'C4'],
  'D5=x577xx': ['D3', 'A3', 'D4'],
  'E5=022xxx': ['E2', 'B2', 'E3'],
  'Am=xx755x': ['A3', 'C4', 'E4'],
  'D=xx777x': ['A3', 'D4', 'F#4'],
};
const IDS = ['st-pent-box-2', 'st-pent-box-3', 'st-minor-blues-a', 'st-power-chords-gallop', 'st-strum-reggae', 'hall-of-the-mountain-king'];

describe('batch 10: the chord shapes', () => {
  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, and every note of its chord', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets)).toEqual(names.map(canon));
    const tones = new Set(chordPcs(symbol));
    expect(names.every((n) => tones.has(noteToMidi(n) % 12)), `${shape} has a note outside ${symbol}`).toBe(true);
    expect([...tones].every((pc) => names.some((n) => noteToMidi(n) % 12 === pc)), `${shape} leaves out a note of ${symbol}`).toBe(true);
  });

  it.each(IDS)('%s gives a shape only from the list above', (id) => {
    const song = load(id);
    for (const c of song.chords.filter((x) => x.voicing)) expect(Object.keys(SHAPES)).toContain(`${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`);
  });
});

// ---------------------------------------------------------------- pentatonic boxes 2 and 3
/** The plan's box notes, string:fret and note name, as given in repertoire.json. */
const BOX_NOTES: Record<'st-pent-box-2' | 'st-pent-box-3', Array<[string, string]>> = {
  'st-pent-box-2': [['6:8', 'C3'], ['6:10', 'D3'], ['5:7', 'E3'], ['5:10', 'G3'], ['4:7', 'A3'], ['4:10', 'C4'], ['3:7', 'D4'], ['3:9', 'E4'], ['2:8', 'G4'], ['2:10', 'A4'], ['1:8', 'C5'], ['1:10', 'D5']],
  'st-pent-box-3': [['6:10', 'D3'], ['6:12', 'E3'], ['5:10', 'G3'], ['5:12', 'A3'], ['4:10', 'C4'], ['4:12', 'D4'], ['3:9', 'E4'], ['3:12', 'G4'], ['2:10', 'A4'], ['2:13', 'C5'], ['1:10', 'D5'], ['1:12', 'E5']],
};

const BOX_CASES = [
  {
    id: 'st-pent-box-2' as const,
    meta: boxTwoMeta,
    box: 2,
    technique: 'slide',
    // Ask, answer, ask, answer: two bars each, written out from the composition plan.
    expected: [
      ['D4', 'E4s', 'G4', 'A4', 'G4', 'E4'], ['C5', 'A4', 'D5', 'C5', 'G4', 'r'],
      ['A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'C4'], ['D4', 'C4', 'A3', 'G3', 'A3', 'r'],
      ['C3', 'D3', 'E3', 'G3', 'E3', 'A3'], ['C4', 'A3', 'D4', 'C4', 'E4', 'r'],
      ['E4', 'G4', 'A4', 'C5', 'D5', 'C5', 'A4'], ['C5', 'A4', 'G4', 'E4', 'A4', 'r'],
    ],
    phraseEnds: ['G4', 'A3', 'E4', 'A4'],
  },
  {
    id: 'st-pent-box-3' as const,
    meta: boxThreeMeta,
    box: 3,
    technique: 'pull',
    expected: [
      ['A4', 'C5', 'A4', 'E5', 'D5', 'E5'], ['D5', 'C5', 'A4', 'G4', 'E4', 'r'],
      ['r', 'D4', 'C4', 'A3', 'G3', 'E3'], ['D3', 'E3', 'G3', 'E3', 'A3', 'r'],
      ['G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'E4'], ['D4', 'C4', 'A3', 'G3', 'C4', 'r'],
      ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'A4'], ['D5', 'E5', 'D5', 'C5', 'A4p', 'r'],
    ],
    phraseEnds: ['E4', 'A3', 'C4', 'A4'],
  },
];

describe.each(BOX_CASES)('batch 10: $id', ({ id, meta, box, technique, expected, phraseEnds }) => {
  it('plays the planned lick, note for note', () => {
    const song = load(id);
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensAsPlayed(played(song, 'Your lick'))).toEqual(expected.map((bar) => bar.map(canon)));
  });

  it('uses every note of the box as the plan lists it, and nothing else, at the planned frets', () => {
    const song = load(id);
    const notes = played(song, 'Your lick').flatMap((b) => b.notes);
    const planned = new Map(BOX_NOTES[id]);
    const used = new Set(notes.map((n) => `${n.string}:${n.fret}`));
    expect([...used].filter((p) => !planned.has(p)), 'positions outside the box').toEqual([]);
    expect([...planned.keys()].filter((p) => !used.has(p)), 'box notes never played').toEqual([]);
    for (const n of notes) expect(name(n.midi), `${n.string}:${n.fret}`).toBe(canon(planned.get(`${n.string}:${n.fret}`)!));
    // The same box as the guitar engine (and so the Scales screen) draws it.
    const pattern = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true })[box - 1];
    expect(pattern.name).toBe(`Box ${box}`);
    expect(pattern.notes.map((n) => `${n.string}:${n.fret}`).sort()).toEqual([...planned.keys()].sort());
  });

  it('gives fingers as the Scales screen does', () => {
    const song = load(id);
    const pattern = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true })[box - 1];
    const engine = new Map(pattern.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    const fingered = played(song, 'Your lick').flatMap((b) => b.notes).filter((n) => n.finger !== undefined);
    expect(fingered.length).toBeGreaterThan(8);
    // Box 2's opening slide starts with finger 3 on fret 7 (as in box 1) and lands in place.
    const exceptions = box === 2 ? fingered.filter((n) => n.string === 3 && n.fret === 7 && n.finger === 3) : [];
    expect(exceptions.length).toBe(box === 2 ? 1 : 0);
    for (const n of fingered.filter((x) => !exceptions.includes(x))) expect(n.finger, `${n.string}:${n.fret}`).toBe(engine.get(`${n.string}:${n.fret}`));
  });

  it('has exactly one of its technique, between two notes of the box on one string', () => {
    const song = load(id);
    const beats = played(song, 'Your lick');
    const hits = beats.filter((b) => b.notes.some((n) => (technique === 'slide' ? n.slide || n.slideIn : n.legato)));
    expect(hits.length).toBe(1);
    const note = hits[0].notes[0];
    if (technique === 'slide') {
      expect([note.string, note.fret, note.slide]).toEqual([3, 9, 'up']);
      expect(beats[beats.indexOf(hits[0]) - 1].notes[0]).toMatchObject({ string: 3, fret: 7, finger: 3 });
    } else {
      expect([note.string, note.fret, note.legato]).toEqual([2, 10, 'pull']);
      expect(beats[beats.indexOf(hits[0]) - 1].notes[0]).toMatchObject({ string: 2, fret: 13 });
    }
    expect(beats.some((b) => b.notes.some((n) => n.legato && technique === 'slide'))).toBe(false);
    expect(beats.some((b) => b.notes.some((n) => (n.slide || n.slideIn) && technique === 'pull'))).toBe(false);
  });

  it('asks and answers: phrases 1 and 3 stop on a chord tone other than A, phrases 2 and 4 on A', () => {
    const song = load(id);
    const beats = played(song, 'Your lick');
    const ends = [1, 3, 5, 7].map((bar) => beats.filter((b) => b.bar === bar && b.midis.length).at(-1)!.token.replace(/[hps]$/, ''));
    expect(ends).toEqual(phraseEnds.map(canon));
    expect(ends.every((n) => chordPcs('Am7').includes(noteToMidi(n) % 12))).toBe(true);
    // Each phrase ends with a quarter note and a quarter rest (except the rests at the ends of bars).
    for (const bar of [1, 3, 5, 7]) expect(beats.filter((b) => b.bar === bar).map((b) => b.duration).slice(-2)).toEqual([960, 960]);
  });

  it('stays in eighths and quarters, with strong beats on chord tones of Am7 or a step from one', () => {
    const song = load(id);
    const beats = played(song, 'Your lick');
    expect([...new Set(beats.map((b) => b.duration))].sort()).toEqual([480, 960]);
    expect(beats.every((b) => b.chord === 'Am7')).toBe(true);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('A', 'minor-pentatonic'))).toEqual([]);
  });

  it('is in A minor, over an Am7 groove, and the estimate lands near level 5', () => {
    const song = load(id);
    expect(keyOf(song.key)).toBe('A minor');
    expect(keyOf(meta.key)).toBe('A minor');
    expect(meta.level).toBe(5);
    const groove = played(song, 'Teacher groove');
    expect(groove.every((b) => b.slash || b.midis.length === 0)).toBe(true);
    expect(song.chords.map((c) => `${c.symbol}=${c.voicing!.join('')}`)).toEqual(['Am7=null02010'.replace('null', 'null')]);
    const est = estimate(song, 'Your lick');
    console.info(est.text);
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- minor blues in A
describe('batch 10: st-minor-blues-a', () => {
  // Written out from the composition plan, as heard: chorus 1 (first ending), then chorus 2 (second ending).
  const CHORUS = [
    ['r', 'E4', 'G4', 'A4'],
    ['G4', 'A4', 'G4', 'E4', 'D4', 'C4'],
    ['A3', 'r', 'C4', 'D4h'],
    ['E4', 'D4', 'C4', 'A3', 'G3', 'r'],
    ['r', 'G4', 'A4', 'C5'],
    ['C5', 'A4', 'G4', 'A4', 'D4'],
    ['r', 'C4', 'D4', 'E4', 'D4', 'C4', 'A3'],
    ['G3', 'E3', 'G3', 'A3'],
    ['E4', 'D4', 'E4', 'G4', 'E4', 'D4'],
    ['C4', 'D4', 'C4', 'A3', 'C4'],
    ['A3', 'r'],
  ];
  const FIRST_ENDING = ['E3', 'G3', 'E3', 'D3', 'E3', 'r'];
  const SECOND_ENDING = ['E3', 'G3', 'E3', 'D3', 'A2'];
  const FORM = ['Am7', 'Am7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'E7', 'Dm7', 'Am7', 'E7'];

  it('plays the melody twice through the 12 bars, with the first and second endings', () => {
    const song = load('st-minor-blues-a');
    expect(song.bars.length).toBe(13);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    const tokens = tokensAsPlayed(played(song, 'Melody'));
    expect(tokens).toEqual([...CHORUS, FIRST_ENDING, ...CHORUS, SECOND_ENDING].map((bar) => bar.map(canon)));
  });

  it('follows the minor 12-bar form, with the planned shapes, and ends on Am7', () => {
    const song = load('st-minor-blues-a');
    const tl = flattenSong(song);
    const perBar = tl.bars.map((b) => tl.chordAt(b.start)!.symbol);
    expect(perBar).toEqual([...FORM, ...FORM.slice(0, 11), 'Am7']);
    const voicings = new Set(song.chords.map((c) => `${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : f)).join('')}`));
    expect([...voicings].sort()).toEqual(['Am7=x02010', 'Dm7=xx0211', 'E7=020100']);
  });

  it('keeps the melody in A minor pentatonic box 1, with strong beats on chord tones or a step from one', () => {
    const song = load('st-minor-blues-a');
    const beats = played(song, 'Melody');
    const box1 = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true })[0];
    const inBox = new Set(box1.notes.map((n) => `${n.string}:${n.fret}`));
    const fingers = new Map(box1.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    for (const n of beats.flatMap((b) => b.notes)) {
      expect(inBox.has(`${n.string}:${n.fret}`), `${n.string}:${n.fret} is outside box 1`).toBe(true);
      if (n.finger !== undefined) expect(n.finger, `${n.string}:${n.fret}`).toBe(fingers.get(`${n.string}:${n.fret}`));
    }
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('A', 'minor-pentatonic'))).toEqual([]);
    expect(strongBeatProblems(beats, [0, 1920])).toEqual([]);
    // Over E7 the melody's strong beats are E or D, the notes box 1 shares with the chord.
    const overE7 = beats.filter((b) => b.chord === 'E7' && b.midis.length && (b.inBar === 0 || b.inBar === 1920));
    expect(overE7.length).toBeGreaterThan(0);
    expect(overE7.every((b) => b.midis.every((m) => [4, 2].includes(m % 12)))).toBe(true);
    expect(range(beats)).toEqual(['A2', 'C5']);
  });

  it('has a hammer-on, vibrato on the long notes, and a written rhythm part strumming every bar', () => {
    const song = load('st-minor-blues-a');
    const beats = played(song, 'Melody');
    const hammers = beats.filter((b) => b.notes.some((n) => n.legato === 'hammer'));
    expect(hammers.map((b) => `${b.notes[0].string}:${b.notes[0].fret}`)).toEqual(['3:7', '3:7']);
    for (const b of beats.filter((x) => x.duration >= 1920 && x.midis.length)) expect(b.notes[0].vibrato, `bar ${b.bar + 1}`).toBe(true);
    const rhythm = played(song, 'Rhythm');
    expect(rhythm.every((b) => b.slash)).toBe(true);
    const bars = tokensAsPlayed(rhythm);
    expect(bars.length).toBe(24);
    for (const b of rhythm.filter((x) => x.bar < 12)) expect(b.stroke).toBe(b.inBar % 960 === 0 ? 'down' : 'up');
    expect(bars.slice(0, 23).every((bar) => bar.length === 6)).toBe(true);
  });

  it('is in A minor and the estimate lands near level 5', () => {
    const song = load('st-minor-blues-a');
    expect(keyOf(song.key)).toBe('A minor');
    expect(keyOf(minorBluesMeta.key)).toBe('A minor');
    const est = estimate(song, 'Melody');
    console.info(est.text);
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- palm-muted gallop
describe('batch 10: st-power-chords-gallop', () => {
  const GAL = ['E2', 'E2', 'E2'];
  const A5 = 'A2+E3+A3';
  const G5 = 'G2+D3+G3';
  const C5 = 'C3+G3+C4';
  const D5 = 'D3+A3+D4';
  const EXPECTED = [
    [...GAL, ...GAL, ...GAL, A5],
    [...GAL, ...GAL, G5, A5],
    [...GAL, ...GAL, ...GAL, C5],
    [...GAL, ...GAL, C5, D5],
    [...GAL, ...GAL, ...GAL, A5],
    [...GAL, ...GAL, G5, A5],
    [...GAL, ...GAL, C5, D5],
    ['E2+B2+E3'],
  ];

  it('plays the planned riff', () => {
    const song = load('st-power-chords-gallop');
    expect(song.bars.length).toBe(8);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    expect(tokensAsPlayed(played(song, 'Your riff'))).toEqual(EXPECTED.map((bar) => bar.map(canon)));
  });

  it('gallops on the palm-muted open E, an eighth and two sixteenths picked down, down, up', () => {
    const song = load('st-power-chords-gallop');
    const beats = played(song, 'Your riff');
    const single = beats.filter((b) => b.notes.length === 1);
    expect(single.length).toBe(3 * 15);
    for (const b of single) {
      expect(b.notes[0]).toMatchObject({ string: 6, fret: 0, palmMute: true });
      expect(b.notes[0].accent).toBeFalsy();
    }
    // Every gallop starts on a beat and runs 480 + 240 + 240 ticks, down, down, up.
    for (let i = 0; i < single.length; i += 3) {
      const g = single.slice(i, i + 3);
      expect(g[0].inBar % 960, `bar ${g[0].bar + 1}`).toBe(0);
      expect(g.map((b) => b.duration)).toEqual([480, 240, 240]);
      expect(g.map((b) => b.stroke)).toEqual(['down', 'down', 'up']);
    }
  });

  it('hits the power chords accented, unmuted and down, on the planned shapes and frets', () => {
    const song = load('st-power-chords-gallop');
    const beats = played(song, 'Your riff');
    const chords = beats.filter((b) => b.notes.length > 1);
    expect(chords.length).toBe(12);
    const shapes: Record<string, string> = { A5: '6:5 5:7 4:7', G5: '6:3 5:5 4:5', C5: '5:3 4:5 3:5', D5: '5:5 4:7 3:7', E5: '6:0 5:2 4:2' };
    for (const b of chords) {
      expect(b.stroke).toBe('down');
      expect(b.notes.every((n) => n.accent && !n.palmMute)).toBe(true);
      expect(b.notes.map((n) => `${n.string}:${n.fret}`).join(' '), `bar ${b.bar + 1}`).toBe(shapes[b.chord!]);
      expect(outside(b.midis, chordPcs(b.chord!))).toEqual([]);
      expect(b.inBar % 960).toBe(0);
    }
    // The movable shapes are fingered 1, 3, 4 the first time each appears.
    for (const sym of ['A5', 'G5', 'C5', 'D5']) expect(chords.find((b) => b.chord === sym)!.notes.map((n) => n.finger)).toEqual([1, 3, 4]);
  });

  it('stays in E minor, and the estimate lands near level 5', () => {
    const song = load('st-power-chords-gallop');
    expect(keyOf(song.key)).toBe('E minor');
    expect(keyOf(gallopMeta.key)).toBe('E minor');
    const beats = played(song, 'Your riff');
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'minor'))).toEqual([]);
    expect(range(beats)).toEqual(['E2', 'D4']);
    const est = estimate(song, 'Your riff');
    console.info(est.text);
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- offbeat chops
describe('batch 10: st-strum-reggae', () => {
  const CHORDS = times(4, ['Am', 'Am', 'D', 'D']).flat();
  const BASS = [
    ['A1', 'A1', 'E2', 'C2'], ['A1', 'E2', 'A2', 'G2'], ['D2', 'D2', 'A2', 'F#2'], ['D2', 'A2', 'F#2', 'E2'],
    ['A1', 'A1', 'E2', 'C2'], ['A1', 'E2', 'A2', 'G2'], ['D2', 'D2', 'A2', 'F#2'], ['D2', 'A2', 'F#2', 'E2'],
    ['A1', 'A1', 'E2', 'r'], ['A1', 'E2', 'A2', 'r'], ['D2', 'D2', 'F#2', 'r'], ['D2', 'A2', 'F#2', 'E2'],
    ['A1', 'A1', 'E2', 'r'], ['A1', 'E2', 'A2', 'r'], ['D2', 'D2', 'F#2', 'r'], ['D2', 'A2', 'D2'],
  ];

  it('has 16 bars: Am and D, two bars each, on the planned three-string shapes', () => {
    const song = load('st-strum-reggae');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    const tl = flattenSong(song);
    expect(tl.bars.map((b) => tl.chordAt(b.start)!.symbol)).toEqual(CHORDS);
    for (const c of song.chords) expect(c.voicing!.map((f) => (f === null ? 'x' : f)).join('')).toBe(c.symbol === 'Am' ? 'xx755x' : 'xx777x');
  });

  it('chops on every "and" with up-strums in bars 1-8, and on beats 2 and 4 with down-strums in bars 9-16', () => {
    const song = load('st-strum-reggae');
    const beats = played(song, 'Your chops');
    expect(beats.every((b) => b.slash || b.midis.length === 0)).toBe(true);
    const chops = beats.filter((b) => b.slash);
    for (const b of chops.filter((x) => x.bar < 8)) {
      expect(b.inBar % 960, `bar ${b.bar + 1}`).toBe(480);
      expect(b.stroke).toBe('up');
      expect(b.duration).toBe(480);
    }
    expect(chops.filter((x) => x.bar < 8).length).toBe(32);
    for (const b of chops.filter((x) => x.bar >= 8)) {
      const pickup = b.bar === 11 && b.inBar === 3360;
      expect(pickup || b.inBar === 960 || b.inBar === 2880, `bar ${b.bar + 1} tick ${b.inBar}`).toBe(true);
      expect(b.stroke).toBe(pickup ? 'up' : 'down');
      expect(b.duration).toBe(480);
    }
    expect(chops.filter((x) => x.bar >= 8).length).toBe(17);
    // No chop ever lands on a beat in the first half, nor on beat 1 or 3 in the second.
    expect(chops.some((b) => b.inBar === 0 || b.inBar === 1920)).toBe(false);
  });

  it('has a teacher bass on the beats that plays the chord tones on beats 1 and 3', () => {
    const song = load('st-strum-reggae');
    const bass = played(song, 'Teacher bass');
    expect(tokensAsPlayed(bass)).toEqual(BASS.map((bar) => bar.map(canon)));
    expect(strongBeatProblems(bass, [0, 1920])).toEqual([]);
    expect(outside(bass.flatMap((b) => b.midis), scalePcs('A', 'dorian'))).toEqual([]);
  });

  it('is written in A minor (the D chord gives the Dorian F#), and the estimate lands near level 5', () => {
    const song = load('st-strum-reggae');
    expect(keyOf(song.key)).toBe('A minor');
    expect(keyOf(reggaeMeta.key)).toBe('A minor');
    const est = estimate(song, 'Your chops');
    console.info(est.text);
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- In the Hall of the Mountain King
describe('batch 10: hall-of-the-mountain-king', () => {
  // The theme as commonly printed in Grieg's key, B minor (bassoon and cello register), and in the
  // A minor of beginner books. Each is transposed to E minor below, and they must agree.
  const B_MINOR = [
    ['B2', 'C#3', 'D3', 'E3', 'F#3', 'D3', 'F#3'],
    ['E#3', 'C#3', 'E#3', 'E3', 'C3', 'E3'],
    ['B2', 'C#3', 'D3', 'E3', 'F#3', 'D3', 'F#3', 'B3'],
    ['A3', 'F#3', 'D3', 'F#3', 'A3'],
  ];
  const A_MINOR = [
    ['A3', 'B3', 'C4', 'D4', 'E4', 'C4', 'E4'],
    ['D#4', 'B3', 'D#4', 'D4', 'Bb3', 'D4'],
    ['A3', 'B3', 'C4', 'D4', 'E4', 'C4', 'E4', 'A4'],
    ['G4', 'E4', 'C4', 'E4', 'G4'],
  ];
  const RHYTHM = [
    [480, 480, 480, 480, 480, 480, 960],
    [480, 480, 960, 480, 480, 960],
    [480, 480, 480, 480, 480, 480, 480, 480],
    [480, 480, 480, 480, 1920],
  ];
  const LOW = B_MINOR.map((bar) => transpose(bar, -7));
  const HIGH = LOW.map((bar) => transpose(bar, 12));
  const TEMPI = [60, 80, 100, 120, 140, 160];

  it('agrees with both common printings of the theme', () => {
    expect(A_MINOR.map((bar) => transpose(bar, -5))).toEqual(LOW.map((bar) => bar.map(canon)));
  });

  it('plays the theme six times, twice low and four times an octave up, then the final chord', () => {
    const song = load('hall-of-the-mountain-king');
    expect(song.bars.length).toBe(25);
    expect(song.bars.every((b) => barLength(b) === BAR_44)).toBe(true);
    const beats = played(song, 'Melody');
    const expected = [...LOW, ...LOW, ...HIGH, ...HIGH, ...HIGH, ...HIGH, ['E2+B2+E3+G3+B3+E4']];
    expect(tokensAsPlayed(beats)).toEqual(expected.map((bar) => bar.map(canon)));
    for (let s = 0; s < 6; s++) {
      for (let i = 0; i < 4; i++) expect(beats.filter((b) => b.bar === s * 4 + i).map((b) => b.duration), `bar ${s * 4 + i + 1}`).toEqual(RHYTHM[i]);
    }
  });

  it('steps the tempo up from 60 to 160, one step for each statement', () => {
    const song = load('hall-of-the-mountain-king');
    expect(song.tempo.map((t) => [t.bar, t.bpm])).toEqual(TEMPI.map((bpm, i) => [i * 4, bpm]));
    expect(song.sections.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual(['Low:0-4', 'Low again:4-8', 'High:8-12', 'High again:12-16', 'Faster:16-20', 'Fastest:20-24', 'Ending:24-25']);
  });

  it('keeps the composer\'s chromatic notes (A#, then A and F in bar 2) and otherwise stays in E minor', () => {
    const song = load('hall-of-the-mountain-king');
    const beats = played(song, 'Melody').filter((b) => b.bar < 24);
    const chromatic = beats.filter((b) => b.midis.some((m) => !scalePcs('E', 'minor').includes(m % 12)));
    expect([...new Set(chromatic.map((b) => b.bar % 4))]).toEqual([1]);
    expect(outside(beats.flatMap((b) => b.midis), scalePcs('E', 'minor'))).toEqual(['A#2', 'F2', 'A#3', 'F3']);
    // A# leads up to B and down through A: the chromatic thirds B/G, A#/F#, A/F.
    expect(range(beats.filter((b) => b.bar < 8))).toEqual(['E2', 'E3']);
    expect(range(beats.filter((b) => b.bar >= 8))).toEqual(['E3', 'E4']);
  });

  it('is staccato throughout, fretted in second position when it moves up (no open strings there)', () => {
    const song = load('hall-of-the-mountain-king');
    const beats = played(song, 'Melody').filter((b) => b.bar < 24);
    for (const b of beats.filter((x) => x.duration < 1920)) expect(b.notes[0].staccato, `bar ${b.bar + 1}`).toBe(true);
    const high = beats.filter((b) => b.bar >= 8).flatMap((b) => b.notes);
    expect(high.every((n) => n.fret >= 2 && n.fret <= 5)).toBe(true);
    for (const n of high.filter((x) => x.finger !== undefined)) expect(n.finger, `${n.string}:${n.fret}`).toBe(n.fret - 1);
    const low = beats.filter((b) => b.bar < 8).flatMap((b) => b.notes);
    expect(low.every((n) => n.fret <= 3)).toBe(true);
    for (const n of low.filter((x) => x.finger !== undefined)) expect(n.finger, `${n.string}:${n.fret}`).toBe(n.fret);
  });

  it('is in E minor and the estimate lands near level 5', () => {
    const song = load('hall-of-the-mountain-king');
    expect(keyOf(song.key)).toBe('E minor');
    expect(keyOf(mountainKingMeta.key)).toBe('E minor');
    const est = estimate(song, 'Melody');
    console.info(est.text);
    expect(Math.abs(est.level - 5), est.text).toBeLessThanOrEqual(1);
  });
});
