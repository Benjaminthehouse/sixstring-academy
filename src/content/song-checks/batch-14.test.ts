/**
 * Independent cross-checks for batch 14 of the built-in songs (level-7 original studies):
 * st-ragtime-blues-c, st-lick-tapping, st-arpeggio-sevenths, st-caged-scale, st-caged-melody,
 * st-mode-phrygian, st-mode-lydian, st-jazz-shells, st-bossa-groove.
 * (devils-dream, the tenth id of the batch, was left out: its A and B parts could not be written
 * note for note with certainty, and the plan forbids presenting an invented tune as the fiddle tune.)
 *
 * The expected notes below were written out by hand as note names from the composition plans,
 * not copied from the tab, so a wrong fret shows up as a wrong note. Each song is parsed with the
 * song core and compared bar by bar; the checks then cover the chord shapes and what they sound,
 * notes on strong beats against the chord in force, the key or mode, the colour notes, the hand
 * positions and fingers (against the guitar engine's scale patterns and chord boxes), the range,
 * the rhythm the plan asks for, and the difficulty estimate against the plan's level.
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, getTrackStats, parseSixTab, validateSong, type Song } from '@/core/song';
import { buildVoicing, scalePatterns, type ScalePattern } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const STANDARD = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const BEAT = 960;
const IDS = ['st-ragtime-blues-c', 'st-lick-tapping', 'st-arpeggio-sevenths', 'st-caged-scale', 'st-caged-melody', 'st-mode-phrygian', 'st-mode-lydian', 'st-jazz-shells', 'st-bossa-groove'];

const pc = (m: number) => ((m % 12) + 12) % 12;
/** One note name in the sharps spelling, so comparisons are by pitch, not by spelling. */
const canon = (n: string) => midiToNote(noteToMidi(n), { prefer: 'sharps' });
/** "E4 G4 E4" -> canonical names. */
const names = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(canon);
/** "C3+E3+G3" -> canonical chord token, low to high. */
const chordToken = (s: string) => s.split('+').map((n) => noteToMidi(n)).sort((a, b) => a - b).map((m) => midiToNote(m, { prefer: 'sharps' })).join('+');
const nameOf = (m: number) => midiToNote(m, { prefer: 'sharps' });

interface PlayedNote {
  string: number;
  fret: number;
  midi: number;
  finger?: number | 'T';
  pluck?: string;
  tap?: boolean;
  legato?: 'hammer' | 'pull';
  tie?: boolean;
  staccato?: boolean;
  letRing?: boolean;
}
interface Hit {
  bar: number;
  at: number;
  dur: number;
  struck: PlayedNote[];
  ties: PlayedNote[];
  midis: number[];
  chord: string | null;
  voicing: string | null;
  slash: boolean;
  stroke?: 'down' | 'up';
}

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  return result.song!;
}

/** Frets low string first as text: [null, 3, 2, 0, 1, 0] -> "x32010" (two-digit frets joined with hyphens). */
function shapeText(v: Array<number | null>): string {
  const parts = v.map((f) => (f === null ? 'x' : String(f)));
  return parts.some((p) => p.length > 1) ? parts.join('-') : parts.join('');
}

/** Every beat of a track (rests included), in order. */
function hits(song: Song, trackName: string): Hit[] {
  const track = song.tracks.find((t) => t.name === trackName);
  if (!track) throw new Error(`no track ${trackName}`);
  const tl = flattenSong(song);
  return tl.trackBeats(track.id).map((b) => {
    const start = tl.barAt(b.tick).start;
    const chord = tl.chordAt(b.tick);
    const all = b.notes as PlayedNote[];
    const struck = all.filter((n) => !n.tie);
    return {
      bar: b.bar,
      at: b.tick - start,
      dur: b.duration,
      struck,
      ties: all.filter((n) => n.tie),
      midis: struck.map((n) => n.midi).sort((x, y) => x - y),
      chord: chord?.symbol ?? null,
      voicing: chord?.voicing ? shapeText(chord.voicing) : null,
      slash: !!b.source.slash,
      stroke: b.source.stroke,
    };
  });
}

/** The struck notes of a single-line part, bar by bar, as names. */
function lineByBar(hs: Hit[], bars: number): string[][] {
  const out: string[][] = Array.from({ length: bars }, () => []);
  for (const h of hs) for (const m of h.midis) out[h.bar].push(nameOf(m));
  return out;
}

/** What a shape sounds in standard tuning, low to high ("x32010" or "8-10-10-9-8-8"). */
function shapeSounds(frets: string): number[] {
  const parts = frets.includes('-') ? frets.split('-') : [...frets];
  return parts.flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)])).sort((a, b) => a - b);
}

/** Pitch classes outside a set, as note names. */
function outside(midis: number[], pcs: number[]): string[] {
  const allowed = new Set(pcs);
  return [...new Set(midis.filter((m) => !allowed.has(pc(m))).map(nameOf))];
}

interface LineNote {
  bar: number;
  at: number;
  midi: number;
  chord: string | null;
}

/**
 * A single line's notes on strong beats (beats 1 and 3) must be tones of the chord in force, or a
 * passing or neighbour note: a step (one or two semitones) to the next note, which is a tone of
 * the chord in force there.
 */
function strongBeatProblems(line: LineNote[], strong: number[] = [0, 2 * BEAT]): string[] {
  const problems: string[] = [];
  line.forEach((n, i) => {
    if (!strong.includes(n.at) || !n.chord) return;
    if (chordPcs(n.chord).includes(pc(n.midi))) return;
    const next = line[i + 1];
    const steps = !!next && Math.abs(next.midi - n.midi) <= 2 && next.chord !== null && chordPcs(next.chord).includes(pc(next.midi));
    if (!steps) problems.push(`bar ${n.bar + 1} tick ${n.at}: ${nameOf(n.midi)} is not in ${n.chord} and does not step to a chord tone`);
  });
  return problems;
}

/** A single-note part as a line (one note per beat). */
function asLine(hs: Hit[]): LineNote[] {
  return hs.filter((h) => h.midis.length).map((h) => ({ bar: h.bar, at: h.at, midi: h.midis[h.midis.length - 1], chord: h.chord }));
}

/** Left-hand finger marks that differ from the finger the chord box in force shows for that string and fret. */
function boxFingerMismatches(hs: Hit[]): string[] {
  const out: string[] = [];
  for (const h of hs) {
    if (!h.chord || !h.voicing) continue;
    const v = buildVoicing(h.chord, h.voicing);
    for (const n of h.struck) {
      if (typeof n.finger !== 'number' || n.fret === 0) continue;
      const i = 6 - n.string;
      if (v.frets[i] !== n.fret) continue;
      if (v.fingers[i] !== n.finger) out.push(`bar ${h.bar + 1}: ${h.chord}=${h.voicing} ${n.string}:${n.fret} finger ${n.finger} in the tab, ${v.fingers[i]} in the box`);
    }
  }
  return out;
}

/** The engine's CAGED patterns of C major, by shape letter. */
function cagedC(): Map<string, ScalePattern> {
  return new Map(scalePatterns('C', 'major').map((p) => [p.shape!, p]));
}

/** Notes outside a pattern, or fingered differently from it (only where the tab marks a finger, unless `all`). */
function patternProblems(hs: Hit[], pattern: ScalePattern, all = false): string[] {
  const fingerAt = new Map(pattern.notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
  const out: string[] = [];
  for (const h of hs) {
    for (const n of h.struck) {
      const key = `${n.string}:${n.fret}`;
      // An open string needs no finger mark (the pattern's finger 0).
      const finger = n.finger ?? (n.fret === 0 ? 0 : undefined);
      if (!fingerAt.has(key)) out.push(`bar ${h.bar + 1}: ${key} (${nameOf(n.midi)}) is not in the ${pattern.name}`);
      else if (finger === undefined ? all : finger !== fingerAt.get(key)) out.push(`bar ${h.bar + 1}: ${key} finger ${finger ?? 'none'}, the ${pattern.name} uses ${fingerAt.get(key)}`);
    }
  }
  return out;
}

/** Estimated difficulty of a track. */
function estimate(song: Song, trackName: string) {
  const track = song.tracks.find((t) => t.name === trackName)!;
  return estimateDifficulty(song, { track: track.id });
}

/** Onset positions of a track in each bar: "0", "1440" ... */
function onsetsByBar(hs: Hit[], bars: number): number[][] {
  const out: number[][] = Array.from({ length: bars }, () => []);
  for (const h of hs) if (h.midis.length || h.slash) out[h.bar].push(h.at);
  return out;
}

// ---------------------------------------------------------------- every song
describe('batch 14: every song parses, validates and is registered', () => {
  it.each(IDS)('%s', async (id) => {
    expect(songEntry(id), `${id} is not registered`).toBeDefined();
    const result = parseSixTab(await loadSongText(id));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(validateSong(result.song!).map((i) => `${i.level}: ${i.message}`)).toEqual([]);
    expect(result.song!.meta.difficulty).toBe(7);
  });
});

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Every shape used in the batch, with the notes it should sound, low to high. */
const SHAPES: Record<string, string> = {
  'C=x32010': 'C3 E3 G3 C4 E4',
  'A7=x02020': 'A2 E3 G3 C#4 E4',
  'D7=xx0212': 'D3 A3 C4 F#4',
  'G7=320001': 'G2 B2 D3 G3 B3 F4',
  'Am=x02210': 'A2 E3 A3 C4 E4',
  'F=133211': 'F2 C3 F3 A3 C4 F4',
  'G=320003': 'G2 B2 D3 G3 B3 G4',
  'E=022100': 'E2 B2 E3 G#3 B3 E4',
  'Cmaj7=x32000': 'C3 E3 G3 B3 E4',
  'Dm7=xx0211': 'D3 A3 C4 F4',
  'Em7=022030': 'E2 B2 E3 G3 D4 E4',
  'Fmaj7=xx3210': 'F3 A3 C4 E4',
  'Am7=x02010': 'A2 E3 G3 C4 E4',
  'Bm7b5=x2323x': 'B2 F3 A3 D4',
  'C=x35553': 'C3 G3 C4 E4 G4',
  'C=875558': 'C3 E3 G3 C4 E4 C5',
  'C=8-10-10-9-8-8': 'C3 G3 C4 E4 G4 C5',
  'C=x-x-10-12-13-12': 'C4 G4 C5 E5',
  'Bb=x13331': 'Bb2 F3 Bb3 D4 F4',
  'B=x24442': 'B2 F#3 B3 D#4 F#4',
  'A=x02220': 'A2 E3 A3 C#4 E4',
  'Dm7=x535xx': 'D3 F3 C4',
  'G7=3x34xx': 'G2 F3 B3',
  'Cmaj7=x324xx': 'C3 E3 B3',
  'Am7=5x555x': 'A2 G3 C4 E4',
  'D7=x5453x': 'D3 F#3 C4 D4',
};

/** Root, third and (for seventh chords) the seventh: a shape may leave out only the fifth. */
function requiredPcs(symbol: string): number[] {
  const pcs = chordPcs(symbol);
  return pcs.length >= 4 ? [pcs[0], pcs[1], pcs[3]] : [pcs[0], pcs[1]];
}

/** Chord symbols that may appear without a shape: the teacher's strum in the CAGED scale tunes. */
const SHAPELESS: Record<string, string[]> = { 'st-caged-scale': ['C', 'F', 'G7', 'Am', 'Dm', 'Em'] };

describe('batch 14: the chord shapes', () => {
  it('reads chord tones root first (the helpers depend on it)', () => {
    expect(chordPcs('G7')).toEqual([7, 11, 2, 5]);
    expect(chordPcs('Bm7b5')).toEqual([11, 2, 5, 9]);
    expect(chordPcs('Cmaj7')).toEqual([0, 4, 7, 11]);
  });

  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, only chord tones, with root, third and seventh', (shape, written) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets).map(nameOf)).toEqual(names(written));
    const midis = names(written).map((n) => noteToMidi(n));
    expect(outside(midis, chordPcs(symbol)), `${shape} has a note outside ${symbol}`).toEqual([]);
    for (const p of requiredPcs(symbol)) expect(midis.some((m) => pc(m) === p), `${shape} leaves out an essential note of ${symbol}`).toBe(true);
    expect(() => buildVoicing(symbol, frets), `${shape}: the guitar engine accepts it as ${symbol}`).not.toThrow();
  });

  it('the three shells are exactly root, third and seventh', () => {
    for (const s of ['Dm7=x535xx', 'G7=3x34xx', 'Cmaj7=x324xx']) {
      const [symbol, frets] = s.split('=');
      const pcs = shapeSounds(frets).map(pc);
      const [r, third, , seventh] = chordPcs(symbol);
      expect(new Set(pcs), s).toEqual(new Set([r, third, seventh]));
      expect(pcs.length, s).toBe(3);
    }
  });

  it.each(IDS)('every chord event in %s uses a shape from the table', async (id) => {
    const song = await load(id);
    for (const c of song.chords) {
      if (!c.voicing) {
        expect(SHAPELESS[id] ?? [], `${id} bar ${c.bar + 1}: ${c.symbol} has no shape`).toContain(c.symbol);
        continue;
      }
      expect(Object.keys(SHAPES), `${id} bar ${c.bar + 1}`).toContain(`${c.symbol}=${shapeText(c.voicing)}`);
    }
  });
});

// ---------------------------------------------------------------- ragtime blues
describe('batch 14: st-ragtime-blues-c', () => {
  const CHORDS = ['C', 'C', 'A7', 'A7', 'D7', 'D7', 'G7', 'G7', 'C', 'C', 'A7', 'A7', 'D7', 'D7', 'G7', 'G7', 'C'];
  /** The thumb on beats 1-4 of each chord: root, next string up, alternate bass, next string up. */
  const THUMB: Record<string, string> = { C: 'C3 E3 G2 E3', A7: 'A2 E3 E2 E3', D7: 'D3 A3 A2 A3', G7: 'G2 D3 B2 D3' };
  /** The tune, bars 1-16: every struck note that is not the thumb's, written from the composition plan. */
  const TUNE = [
    'E4 G4 E4 C4 D4 E4', 'G4 E4 C4 G3 C4 E4', 'G4 E4 C#4 E4 G4 E4 C#4', 'E4 C#4 E4 G4 F#4',
    'D4 C4 D4 F#4 E4 C4', 'D4 F#4 D4 C4 E4 C4 B3', 'D4 F4 D4 B3 G3 B3', 'F4 D4 B3 G3 D4 D#4',
    'E4 G4 E4 G4 E4 D4 C4', 'C4 E4 G4 E4 C4 C#4', 'E4 G4 E4 C#4 B3 C#4', 'E4 G4 E4 C#4 E4 C#4',
    'C4 F#4 D4 F#4 E4 D4', 'C4 D4 F#4 D4 C4 B3', 'D4 G4 F4 D4 B3 D4', 'F4 D4 B3 G3 B3 C4 D4 D#4',
  ];

  /** Split each beat into the thumb (the lowest note struck on a beat) and the tune (everything else). */
  async function parts() {
    const song = await load('st-ragtime-blues-c');
    const hs = hits(song, 'Your part');
    const thumb: Array<{ bar: number; at: number; note: PlayedNote; chord: string | null }> = [];
    const tune: Array<{ bar: number; at: number; note: PlayedNote; chord: string | null }> = [];
    for (const h of hs) {
      const sorted = [...h.struck].sort((a, b) => a.midi - b.midi);
      sorted.forEach((n, i) => (h.at % BEAT === 0 && i === 0 ? thumb : tune).push({ bar: h.bar, at: h.at, note: n, chord: h.chord }));
    }
    return { song, hs, thumb, tune };
  }

  it('is the ragtime cycle twice, then an ending on C', async () => {
    const { song, hs } = await parts();
    expect(song.bars.length).toBe(17);
    for (let b = 0; b < 17; b++) expect(hs.filter((h) => h.bar === b).every((h) => h.chord === CHORDS[b]), `bar ${b + 1}`).toBe(true);
    expect(song.chords.map((c) => `${c.symbol}=${shapeText(c.voicing!)}`)).toEqual([
      'C=x32010', 'A7=x02020', 'D7=xx0212', 'G7=320001', 'C=x32010', 'A7=x02020', 'D7=xx0212', 'G7=320001', 'C=x32010',
    ]);
    // I, VI7, II7, V7 in C.
    expect(['C', 'A7', 'D7', 'G7'].map((c) => scalePcs('C', 'major').indexOf(chordPcs(c)[0]) + 1)).toEqual([1, 6, 2, 5]);
  });

  it('keeps the thumb on every beat, alternating two bass strings, root first', async () => {
    const { thumb } = await parts();
    for (let b = 0; b < 16; b++) {
      const t = thumb.filter((x) => x.bar === b);
      expect(t.map((x) => x.at), `bar ${b + 1}: a thumb note on every beat`).toEqual([0, 960, 1920, 2880]);
      expect(t.map((x) => nameOf(x.note.midi)), `bar ${b + 1}`).toEqual(names(THUMB[CHORDS[b]]));
      for (let i = 1; i < 4; i++) expect(t[i].note.string, `bar ${b + 1}: beat ${i + 1} changes string`).not.toBe(t[i - 1].note.string);
      expect(t[0].note.string).not.toBe(t[2].note.string);
      expect(outside(t.map((x) => x.note.midi), chordPcs(CHORDS[b])), `bar ${b + 1}: the thumb plays chord tones`).toEqual([]);
      // The thumb uses strings 4-6, and string 3 only in the D7 bars.
      for (const x of t) expect(x.note.string >= 4 || (x.note.string === 3 && CHORDS[b] === 'D7'), `bar ${b + 1}: thumb on string ${x.note.string}`).toBe(true);
    }
  });

  it('plays the tune written out for it, on strings 1-3 (1-2 in the D7 bars)', async () => {
    const { tune } = await parts();
    const byBar: string[][] = Array.from({ length: 16 }, () => []);
    for (const x of tune.filter((y) => y.bar < 16)) byBar[x.bar].push(nameOf(x.note.midi));
    expect(byBar).toEqual(TUNE.map(names));
    for (const x of tune.filter((y) => y.bar < 16)) {
      const top = CHORDS[x.bar] === 'D7' ? 2 : 3;
      expect(x.note.string <= top, `bar ${x.bar + 1}: tune note on string ${x.note.string}`).toBe(true);
    }
  });

  it('is syncopated: 18 tune notes struck on an "and" are tied over the next beat', async () => {
    const { hs } = await parts();
    // For each tie, find when the note it continues was struck.
    const lastStruck = new Map<number, { bar: number; at: number }>();
    let syncopated = 0;
    let anticipations = 0;
    for (const h of hs) {
      for (const t of h.ties) {
        const from = lastStruck.get(t.string)!;
        expect(t.string, 'only tune notes are tied').toBeLessThanOrEqual(2);
        expect(h.at % BEAT, 'a tie carries a note over a beat').toBe(0);
        if (from.at % BEAT !== 0) syncopated++;
        if (from.bar !== h.bar) anticipations++;
      }
      for (const n of h.struck) lastStruck.set(n.string, { bar: h.bar, at: h.at });
    }
    expect(syncopated).toBe(18);
    // Four of them cross the bar line into the next chord: F# into D7, B into G7, C# into A7, B into G7.
    expect(anticipations).toBe(4);
  });

  it('puts chord tones on beats 1 and 3, and is C major plus the chords\' own sharps', async () => {
    const { tune, hs } = await parts();
    const line = tune.filter((x) => x.bar < 16).map((x) => ({ bar: x.bar, at: x.at, midi: x.note.midi, chord: x.chord }));
    expect(strongBeatProblems(line)).toEqual([]);
    // Outside C major only C# (the third of A7), F# (the third of D7) and D#, the chromatic step D-D#-E into bars 9 and 17.
    // C# and F# may also come on the last "and" of the bar before their chord, tied into it (bars 4 and 10).
    for (const x of tune) {
      const p = pc(x.note.midi);
      if (scalePcs('C', 'major').includes(p)) continue;
      const early = x.at === 3360;
      const ok = (p === 1 && (x.chord === 'A7' || (x.chord === 'C' && early && x.bar === 9))) || (p === 6 && (x.chord === 'D7' || (x.chord === 'A7' && early))) || (p === 3 && x.chord === 'G7' && early);
      expect(ok, `bar ${x.bar + 1} tick ${x.at}: ${nameOf(x.note.midi)} over ${x.chord}`).toBe(true);
    }
  });

  it('ends on the C chord, fingers as the chord boxes show, from E2 to G4 in first position', async () => {
    const { song, hs } = await parts();
    const last = hs.filter((h) => h.bar === 16);
    expect(last.map((h) => h.midis.map(nameOf).join('+'))).toEqual(['C3+E4', 'E3+C4', chordToken('C3+E3+G3+C4+E4')]);
    expect(boxFingerMismatches(hs)).toEqual([]);
    const midis = hs.flatMap((h) => h.midis);
    expect([Math.min(...midis), Math.max(...midis)].map(nameOf)).toEqual(['E2', 'G4']);
    const frets = hs.flatMap((h) => h.struck.map((n) => n.fret));
    expect(Math.max(...frets)).toBe(4);
    expect(song.tracks.length).toBe(1);
  });

  it('estimates below the plan (7): tied syncopation over a steady thumb, open chords at a moderate tempo', async () => {
    // Gap note (integration pass 2): the estimate used to count an off-beat note as syncopated only
    // when nothing was struck on the next beat, so with the thumb on every beat the tied
    // syncopations scored zero. It now counts an off-beat note that sounds on through the next beat
    // (and sees the melody held over the thumb as two voices), so both show in the factors; the open
    // chords and the moderate tempo still keep it at about level 4.
    const est = estimate(await load('st-ragtime-blues-c'), 'Your part');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
    expect(est.factors.voices, JSON.stringify(est)).toBeGreaterThan(0.3);
    expect(getTrackStats(await load('st-ragtime-blues-c'), 'Your part')!.syncopation).toBeGreaterThan(0.1);
  });
});

// ---------------------------------------------------------------- tapping
describe('batch 14: st-lick-tapping', () => {
  /** Tap, pull-off, hammer-on per beat, written from the plan's spec. */
  const GROUP: Record<string, { notes: string; frets: [number, number, number] }> = {
    Am: { notes: 'E5 A4 C5', frets: [12, 5, 8] },
    F: { notes: 'F5 A4 C5', frets: [13, 5, 8] },
    G: { notes: 'G5 B4 D5', frets: [15, 7, 10] },
    E: { notes: 'E5 G#4 B4', frets: [12, 4, 7] },
  };
  const CHORDS = ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'];

  it('plays four tap-pull-hammer groups a bar, two bars per chord, ending on a held tap', async () => {
    const song = await load('st-lick-tapping');
    expect(song.bars.length).toBe(8);
    const hs = hits(song, 'Your lick');
    const expected = CHORDS.map((c, i) => {
      const g = names(GROUP[c].notes);
      return i === 7 ? [...g, ...g, ...g, canon('E5')] : [...g, ...g, ...g, ...g];
    });
    expect(lineByBar(hs, 8)).toEqual(expected);
    for (const h of hs) expect(h.chord).toBe(CHORDS[h.bar]);
  });

  it('is all on string 1: tap, then pull-off, then hammer-on, in triplet eighths', async () => {
    const hs = hits(await load('st-lick-tapping'), 'Your lick');
    const notes = hs.flatMap((h) => h.struck.map((n) => ({ h, n })));
    expect(notes.every(({ n }) => n.string === 1)).toBe(true);
    notes.forEach(({ h, n }, i) => {
      if (h.bar === 7 && h.at === 2880) {
        expect(n.tap, 'the last note is a held tap').toBe(true);
        expect(h.dur).toBe(BEAT);
        return;
      }
      const role = i % 3;
      expect(h.dur, `bar ${h.bar + 1}: triplet eighths`).toBe(320);
      expect(n.fret, `bar ${h.bar + 1} note ${i}`).toBe(GROUP[CHORDS[h.bar]].frets[role]);
      if (role === 0) expect(!!n.tap && !n.legato, `bar ${h.bar + 1}: the beat starts with a tap`).toBe(true);
      if (role === 1) expect(n.legato).toBe('pull');
      if (role === 2) expect(n.legato).toBe('hammer');
      if (role === 0) expect(h.at % BEAT, 'every tap is on a beat').toBe(0);
    });
  });

  it('plays only chord tones, the left hand a minor third wide (fingers 1 and 4), the taps singing E F G E', async () => {
    const hs = hits(await load('st-lick-tapping'), 'Your lick');
    for (const h of hs) expect(outside(h.midis, chordPcs(h.chord!)), `bar ${h.bar + 1}`).toEqual([]);
    for (const g of Object.values(GROUP)) expect(g.frets[2] - g.frets[1]).toBe(3);
    const marked = hs.flatMap((h) => h.struck.filter((n) => n.finger !== undefined).map((n) => `${h.bar + 1}:${n.fret}:${n.finger}`));
    expect(marked).toEqual(['1:5:1', '1:8:4', '3:5:1', '3:8:4', '5:7:1', '5:10:4', '7:4:1', '7:7:4']);
    const taps = hs.filter((h) => h.struck[0]?.tap && h.at === 0 && h.bar % 2 === 0).map((h) => nameOf(h.midis[0]));
    expect(taps).toEqual(names('E5 F5 G5 E5'));
  });

  it('has the teacher strumming the chords, and estimates at the plan\'s level (7): taps belong to the picking hand', async () => {
    const song = await load('st-lick-tapping');
    expect(song.tracks.find((t) => t.name === 'Teacher')?.role).toBe('rhythm');
    expect(new Set(hits(song, 'Teacher').filter((h) => h.slash).map((h) => h.bar)).size).toBe(8);
    // Gap note (integration pass 2): the hand-position tracker used to take every tapped fret 12 as
    // the fretting hand jumping there and back (62 shifts), so position scored near its maximum and
    // the lick rated 9. Tapped notes now belong to the picking hand: the fretting hand stays in its
    // positions, and the better estimate is the plan's 7, carried by the tapping technique.
    const est = estimate(song, 'Your lick');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(6);
    expect(est.level, JSON.stringify(est)).toBeLessThanOrEqual(8);
    expect(est.factors.techniques).toBeGreaterThan(0.75);
    expect(getTrackStats(song, 'Your lick')!.shifts, 'taps are not hand shifts').toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------- seventh-chord arpeggios
describe('batch 14: st-arpeggio-sevenths', () => {
  const ARPS = [
    'C3 E3 G3 B3 C4 B3 G3 E3', 'D3 F3 A3 C4 D4 C4 A3 F3', 'E3 G3 B3 D4 E4 D4 B3 G3', 'F3 A3 C4 E4 F4 E4 C4 A3',
    'G3 B3 D4 F4 G4 F4 D4 B3', 'A3 C4 E4 G4 A4 G4 E4 C4', 'B3 D4 F4 A4 B4 A4 F4 D4', 'C4 E4 G4 B4 C5',
  ];
  const TUNE = ['F4 A4 G4 F4 D4', 'B3 D4 F4 G4 F4', 'E4 G4 B4', 'C5 B4 G4', 'A4 F4 A4 C5 A4', 'B4 G4 F4 D4 B3', 'C4 E4 G4 B4 A4 G4', 'C4'];
  const BAR_CHORDS = ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5', 'Cmaj7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7'];

  it('plays the arpeggios and the tune written out for them', async () => {
    const song = await load('st-arpeggio-sevenths');
    expect(song.bars.length).toBe(16);
    const hs = hits(song, 'Your part');
    expect(lineByBar(hs, 16)).toEqual([...ARPS, ...TUNE].map(names));
    for (const h of hs) expect(h.chord, `bar ${h.bar + 1}`).toBe(BAR_CHORDS[h.bar]);
  });

  it('spells each of bars 1-7 as root, 3, 5, 7, octave, 7, 5, 3 of its chord (from the theory engine)', async () => {
    const hs = hits(await load('st-arpeggio-sevenths'), 'Your part');
    for (let b = 0; b < 7; b++) {
      const bar = hs.filter((h) => h.bar === b).map((h) => h.midis[0]);
      const [r, t, f, s] = chordPcs(BAR_CHORDS[b]);
      expect(bar.map(pc), `bar ${b + 1}`).toEqual([r, t, f, s, r, s, f, t]);
      expect(bar[4] - bar[0], `bar ${b + 1}: one octave`).toBe(12);
      expect([...bar.slice(0, 5)].every((m, i, a) => i === 0 || m > a[i - 1]), `bar ${b + 1}: up`).toBe(true);
      expect(hs.filter((h) => h.bar === b).every((h) => h.dur === 480), `bar ${b + 1}: eighth notes`).toBe(true);
    }
    // The seven chords are the diatonic sevenths of C, climbing a step at a time.
    expect(BAR_CHORDS.slice(0, 7).map((c) => chordPcs(c)[0])).toEqual(scalePcs('C', 'major'));
  });

  it('stays in the engine\'s G-shape (fifth) position of C major, every note with the engine\'s finger', async () => {
    const hs = hits(await load('st-arpeggio-sevenths'), 'Your part');
    const g = cagedC().get('G')!;
    expect(g.position).toBe(5);
    expect(patternProblems(hs, g, true)).toEqual([]);
  });

  it('puts chord tones on the strong beats of the tune, stays in C major, from C3 to C5', async () => {
    const hs = hits(await load('st-arpeggio-sevenths'), 'Your part');
    expect(strongBeatProblems(asLine(hs.filter((h) => h.bar >= 8)))).toEqual([]);
    const midis = hs.flatMap((h) => h.midis);
    expect(outside(midis, scalePcs('C', 'major'))).toEqual([]);
    expect([Math.min(...midis), Math.max(...midis)].map(nameOf)).toEqual(['C3', 'C5']);
    // Guide tones: F (Dm7) stays for G7 and falls to E on Cmaj7 at the start of bar 11.
    expect(nameOf(hs.find((h) => h.bar === 10)!.midis[0])).toBe('E4');
    expect(nameOf(hs.filter((h) => h.bar === 9).at(-1)!.midis[0])).toBe('F4');
  });

  it('alternates the pick in bar 1, has the teacher strum every bar, and estimates below the plan (7)', async () => {
    const song = await load('st-arpeggio-sevenths');
    const first = hits(song, 'Your part').filter((h) => h.bar === 0);
    expect(first.map((h) => h.stroke)).toEqual(['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up']);
    expect(new Set(hits(song, 'Teacher').filter((h) => h.slash).map((h) => h.bar)).size).toBe(16);
    // Even eighths in one position at 104 bpm: the estimate sees moderate speed and one reach, about
    // level 4. What makes it level 7 is knowing seven chord spellings and their shapes, which the
    // estimate does not measure.
    const est = estimate(song, 'Your part');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------- CAGED: the scale in five positions
describe('batch 14: st-caged-scale', () => {
  const BLOCKS: Array<{ shape: string; chord: string; scale: [string, string]; tune: string[]; chords: string[] }> = [
    { shape: 'C', chord: 'C=x32010', scale: ['C3 D3 E3 F3 G3 A3 B3 C4', 'B3 A3 G3 F3 E3 D3 C3'], tune: ['E4 D4 C4 G3 C4', 'F4 E4 D4 C4 A3', 'G3 B3 D4 G4 F4 E4 D4', 'E4 D4 B3 C4'], chords: ['C', 'F', 'G7', 'C'] },
    { shape: 'A', chord: 'C=x35553', scale: ['C3 D3 E3 F3 G3 A3 B3 C4', 'B3 A3 G3 F3 E3 D3 C3'], tune: ['A4 G4 E4 C4 D4 E4', 'F4 E4 D4 A3 C4 D4', 'B3 D4 F4 G4 F4 D4', 'E4 D4 C4'], chords: ['Am', 'Dm', 'G7', 'C'] },
    { shape: 'G', chord: 'C=875558', scale: ['C3 D3 E3 F3 G3 A3 B3 C4', 'B3 A3 G3 F3 E3 D3 C3'], tune: ['G4 A4 G4 E4 C4', 'B4 A4 G4 E4 B3', 'A4 C5 A4 F4 E4 F4', 'B4 A4 F4 D4'], chords: ['C', 'Em', 'F', 'G7'] },
    { shape: 'E', chord: 'C=8-10-10-9-8-8', scale: ['C3 D3 E3 F3 G3 A3 B3 C4', 'B3 A3 G3 F3 E3 D3 C3'], tune: ['C5 B4 A4 E4 A4 C5', 'D5 C5 A4 F4 D4 F4', 'B4 D5 B4 G4 F4 D4', 'E4 C4'], chords: ['Am', 'Dm', 'G7', 'C'] },
    { shape: 'D', chord: 'C=x-x-10-12-13-12', scale: ['C4 D4 E4 F4 G4 A4 B4 C5', 'B4 A4 G4 F4 E4 D4 C4'], tune: ['C5 A4 C5 F5 E5 C5', 'B4 D5 F5 D5 B4 G4', 'E5 D5 C5 G4 C5 E5', 'C5'], chords: ['F', 'G7', 'C', 'C'] },
  ];

  it('plays each position as two bars of scale and a 4-bar tune, climbing C, A, G, E, D', async () => {
    const song = await load('st-caged-scale');
    expect(song.bars.length).toBe(30);
    const hs = hits(song, 'Your part');
    const expected = BLOCKS.flatMap((b) => [...b.scale, ...b.tune]).map(names);
    expect(lineByBar(hs, 30)).toEqual(expected);
    BLOCKS.forEach((b, i) => {
      const first = hs.find((h) => h.bar === i * 6)!;
      expect(`${first.chord}=${first.voicing}`, `position ${b.shape}: the chord shape of the position`).toBe(b.chord);
      b.chords.forEach((c, k) => expect(hs.find((h) => h.bar === i * 6 + 2 + k)!.chord, `bar ${i * 6 + 3 + k}`).toBe(c));
    });
  });

  it('plays the scale root to root and back in eighth notes', async () => {
    const hs = hits(await load('st-caged-scale'), 'Your part');
    BLOCKS.forEach((_, i) => {
      const up = hs.filter((h) => h.bar === i * 6).map((h) => h.midis[0]);
      const down = hs.filter((h) => h.bar === i * 6 + 1).map((h) => h.midis[0]);
      expect(up.map(pc), `position ${i + 1}: C major from C`).toEqual([...scalePcs('C', 'major'), 0]);
      expect(down.at(-1), 'back to the starting C').toBe(up[0]);
      expect(hs.filter((h) => h.bar === i * 6).every((h) => h.dur === 480)).toBe(true);
    });
  });

  it('keeps every note of each position inside the engine\'s CAGED pattern, fingered as the engine fingers it', async () => {
    const hs = hits(await load('st-caged-scale'), 'Your part');
    const patterns = cagedC();
    expect([...patterns.values()].map((p) => `${p.shape}:${p.minFret}-${p.maxFret}`)).toEqual(['C:0-3', 'A:2-6', 'G:4-8', 'E:7-10', 'D:9-13']);
    BLOCKS.forEach((b, i) => {
      const block = hs.filter((h) => h.bar >= i * 6 && h.bar < i * 6 + 6);
      expect(patternProblems(block, patterns.get(b.shape)!), `${b.shape} shape`).toEqual([]);
      // The scale's first bar has every finger marked.
      expect(patternProblems(block.filter((h) => h.bar === i * 6), patterns.get(b.shape)!, true)).toEqual([]);
      // The C chord shape sits inside the same frets as the scale position.
      const frets = b.chord.split('=')[1];
      const fretted = (frets.includes('-') ? frets.split('-') : [...frets]).filter((f) => f !== 'x' && f !== '0').map(Number);
      const p = patterns.get(b.shape)!;
      expect(fretted.every((f) => f >= p.minFret && f <= p.maxFret), b.chord).toBe(true);
    });
  });

  it('puts chord tones on the strong beats of the tunes, stays in C major, and climbs from E4 to F5', async () => {
    const song = await load('st-caged-scale');
    const hs = hits(song, 'Your part');
    const tunes = hs.filter((h) => h.bar % 6 >= 2);
    expect(strongBeatProblems(asLine(tunes))).toEqual([]);
    expect(outside(hs.flatMap((h) => h.midis), scalePcs('C', 'major'))).toEqual([]);
    const tops = BLOCKS.map((_, i) => Math.max(...tunes.filter((h) => Math.floor(h.bar / 6) === i).flatMap((h) => h.midis)));
    expect(tops.map(nameOf)).toEqual(['G4', 'A4', 'C5', 'D5', 'F5']);
    expect(new Set(hits(song, 'Teacher').filter((h) => h.slash).map((h) => h.bar)).size).toBe(30);
  });

  it('estimates below the plan (7): the challenge is the map of the neck, not speed', async () => {
    // Eighth notes at 100 bpm with one hand position per section: the estimate sees the frets up to
    // 13 and four shifts, one into each new position, about level 4.
    const est = estimate(await load('st-caged-scale'), 'Your part');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------- CAGED: one melody everywhere
describe('batch 14: st-caged-melody', () => {
  /** The 8-bar tune, written from the composition plan. */
  const TUNE = ['E4 G4 E4 D4 C4', 'E4 D4 C4 A3 G3', 'C4 E4 G4 F4 E4', 'D4 E4 D4', 'E4 G4 E4 D4 C4', 'E4 D4 C4 A3 G3 A3 B3', 'C4 E4 G4 F4 E4 D4', 'C4'];
  const PASSES: Array<[string, string]> = [['C', 'C=x32010'], ['A', 'C=x35553'], ['G', 'C=875558'], ['E', 'C=8-10-10-9-8-8'], ['D', 'C=x-x-10-12-13-12']];

  it('plays the same eight bars, at the same pitch, five times', async () => {
    const song = await load('st-caged-melody');
    expect(song.bars.length).toBe(40);
    const hs = hits(song, 'Your melody');
    expect(lineByBar(hs, 40)).toEqual(PASSES.flatMap(() => TUNE).map(names));
    // The rhythm is the same in every pass too.
    const rhythm = (p: number) => hs.filter((h) => h.bar >= p * 8 && h.bar < p * 8 + 8).map((h) => `${h.bar - p * 8}:${h.at}:${h.dur}`);
    for (let p = 1; p < 5; p++) expect(rhythm(p)).toEqual(rhythm(0));
  });

  it('plays each pass in its CAGED position, with the matching C shape from the CAGED chord study', async () => {
    const song = await load('st-caged-melody');
    const hs = hits(song, 'Your melody');
    const patterns = cagedC();
    const fretsOf = (p: number) => hs.filter((h) => h.bar >= p * 8 && h.bar < p * 8 + 8).map((h) => h.struck.map((n) => `${n.string}:${n.fret}`).join());
    PASSES.forEach(([shape, chord], p) => {
      const pass = hs.filter((h) => h.bar >= p * 8 && h.bar < p * 8 + 8);
      expect(pass.every((h) => `${h.chord}=${h.voicing}` === chord), `pass ${p + 1}: ${chord}`).toBe(true);
      expect(patternProblems(pass, patterns.get(shape)!), `${shape} shape`).toEqual([]);
      for (let q = 0; q < p; q++) expect(fretsOf(p), `pass ${p + 1} is in a new place`).not.toEqual(fretsOf(q));
    });
    expect(song.chords.map((c) => c.bar)).toEqual([0, 8, 16, 24, 32]);
    expect(new Set(hits(song, 'Teacher').filter((h) => h.slash).map((h) => h.bar)).size).toBe(40);
  });

  it('stays from G3 to G4 in C major, with C, E or G (or a step to one) on beats 1 and 3', async () => {
    const hs = hits(await load('st-caged-melody'), 'Your melody');
    const midis = hs.flatMap((h) => h.midis);
    expect([Math.min(...midis), Math.max(...midis)].map(nameOf)).toEqual(['G3', 'G4']);
    expect(outside(midis, scalePcs('C', 'major'))).toEqual([]);
    expect(strongBeatProblems(asLine(hs))).toEqual([]);
    expect(nameOf(hs.at(-1)!.midis[0])).toBe('C4');
  });

  it('estimates below the plan (7): the same easy tune, five times, in harder places', async () => {
    const est = estimate(await load('st-caged-melody'), 'Your melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------- the two modes
interface ModeCase {
  id: string;
  mode: string;
  colour: string;
  home: string;
  away: string;
  shapes: [string, string];
  position: number;
  tune: string[];
  landings: string[];
  backing: number[];
}
const MODES: ModeCase[] = [
  {
    id: 'st-mode-phrygian',
    mode: 'phrygian',
    colour: 'Bb',
    home: 'Am',
    away: 'Bb',
    shapes: ['Am=x02210', 'Bb=x13331'],
    position: 5,
    tune: [
      'A4 Bb4 A4 E4 F4 E4', 'C5 Bb4 A4 E4', 'Bb4 A4 G4 F4 G4 A4', 'F4 G4 F4 D4',
      'E4 F4 E4 C4 D4 E4', 'Bb4 A4 G4 A4', 'Bb3 D4 F4 Bb4 A4 G4', 'F4 E4 D4 F4',
      'E4 A4 C5 A4', 'Bb4 A4 G4 F4 E4 D4', 'Bb4 F4 G4 A4', 'Bb4 C5 Bb4 F4 D4 F4',
      'A4 G4 F4 E4 D4 C4', 'C4 D4 E4 A3', 'Bb3 D4 F4 Bb4 C5 Bb4', 'A4',
    ],
    landings: ['3:0', '6:0', '7:0', '7:1920', '10:0', '11:0', '12:0', '15:0', '15:1920'],
    backing: [0, 1440, 2880],
  },
  {
    id: 'st-mode-lydian',
    mode: 'lydian',
    colour: 'D#',
    home: 'A',
    away: 'B',
    shapes: ['A=x02220', 'B=x24442'],
    position: 4,
    tune: [
      'E4 F#4 G#4 A4', 'B4 A4 F#4 D#4 E4', 'D#4 F#4 B4', 'B4 A4 G#4 F#4 E4 D#4',
      'E4 C#4 B3 C#4', 'D#4 E4 C#4', 'F#4 D#4 F#4 B4 A4 G#4', 'D#4 C#4 D#4',
      'A4 G#4 A4 E4 C#4 E4', 'B4 A4 G#4 A4', 'D#4 E4 F#4 B4 A4 F#4', 'D#4 E4 F#4',
      'A4 B4 A4 E4 F#4 E4', 'C#4 D#4 E4 A4', 'B4 A4 F#4 D#4 F#4 G#4', 'A4',
    ],
    landings: ['2:1920', '3:0', '6:0', '8:0', '11:0', '12:0', '15:1920'],
    backing: [0, 1920],
  },
];

describe.each(MODES.map((m) => [m.id, m] as [string, ModeCase]))('batch 14: %s', (id, m) => {
  /** Two bars of each chord, with the faster change in bars 15 and 16. */
  const VAMP = [...Array.from({ length: 14 }, (_, i) => (Math.floor(i / 2) % 2 === 0 ? m.home : m.away)), m.away, m.home];

  it('plays the melody written out for it over the vamp, ending on A', async () => {
    const song = await load(id);
    expect(song.bars.length).toBe(16);
    const hs = hits(song, 'Your melody');
    expect(lineByBar(hs, 16)).toEqual(m.tune.map(names));
    for (const h of hs) expect(h.chord, `bar ${h.bar + 1}`).toBe(VAMP[h.bar]);
    expect(song.chords.map((c) => `${c.symbol}=${shapeText(c.voicing!)}`)).toEqual(VAMP.filter((c, i) => i === 0 || c !== VAMP[i - 1]).map((c) => (c === m.home ? m.shapes[0] : m.shapes[1])));
    expect(nameOf(hs.at(-1)!.midis[0])).toBe('A4');
    // Quarter and eighth notes only (a held note may be a half or the last whole).
    expect(hs.every((h) => [480, 960, 1440, 1920, 3840].includes(h.dur))).toBe(true);
  });

  it(`stays in A ${m.mode}, and the vamp fits it with the colour note ${m.colour} in the second chord only`, async () => {
    const hs = hits(await load(id), 'Your melody');
    const pcs = scalePcs('A', m.mode);
    expect(outside(hs.flatMap((h) => h.midis), pcs)).toEqual([]);
    for (const s of m.shapes) expect(outside(shapeSounds(s.split('=')[1]), pcs), s).toEqual([]);
    const colour = pc(noteToMidi(m.colour + '4'));
    expect(pcs).toContain(colour);
    expect(chordPcs(m.away)).toContain(colour);
    expect(chordPcs(m.home)).not.toContain(colour);
  });

  it(`lands on ${m.colour} on a strong beat at least four times (exactly where the plan put it)`, async () => {
    const hs = hits(await load(id), 'Your melody');
    const colour = pc(noteToMidi(m.colour + '4'));
    const landings = hs.filter((h) => (h.at === 0 || h.at === 1920) && h.midis.length && pc(h.midis[0]) === colour).map((h) => `${h.bar + 1}:${h.at}`);
    expect(landings).toEqual(m.landings);
    expect(landings.length).toBeGreaterThanOrEqual(4);
    expect(strongBeatProblems(asLine(hs))).toEqual([]);
  });

  it(`stays in position ${m.position} (one finger per fret), with a backing strum in every bar`, async () => {
    const song = await load(id);
    const hs = hits(song, 'Your melody');
    for (const h of hs) {
      for (const n of h.struck) {
        expect(n.fret >= m.position && n.fret <= m.position + 3, `bar ${h.bar + 1}: ${n.string}:${n.fret}`).toBe(true);
        if (n.finger !== undefined) expect(n.finger, `bar ${h.bar + 1}: ${n.string}:${n.fret}`).toBe(n.fret - m.position + 1);
      }
    }
    const back = onsetsByBar(hits(song, 'Backing'), 16);
    for (let b = 0; b < 15; b++) expect(back[b], `backing bar ${b + 1}`).toEqual(m.backing);
    expect(back[15]).toEqual([0]);
    expect(song.tracks.find((t) => t.name === 'Backing')?.role).toBe('rhythm');
  });

  it('estimates below the plan (7): a modal tune is a test of the ear, not of the hands', async () => {
    // As with the level-6 mode studies (estimated about 3 to 4), quarter and eighth notes in one
    // position leave speed, stretch and shifts low; the hammer-ons, pull-offs and vibrato raise it a
    // little, to about 4.
    const est = estimate(await load(id), 'Your melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------- jazz shells
describe('batch 14: st-jazz-shells', () => {
  const PROG = ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'];
  const SHELL: Record<string, string> = { Dm7: 'D3+F3+C4', G7: 'G2+F3+B3', Cmaj7: 'C3+E3+B3' };
  /** The walking bass, written from the composition plan. */
  const BASS_LINE = [
    'D2 E2 F2 A2', 'G2 F2 D2 B1', 'C2 E2 G2 E2', 'C2 D2 E2 C#2', 'D2 C2 A1 F1', 'G1 A1 B1 D2', 'C2 E2 G2 A2', 'C3 B2 G2 F2 Eb2',
    'D2 F2 A2 C3', 'G2 F2 D2 Db2', 'C2 D2 E2 G2', 'C3 G2 E2 D2 C#2', 'D2 E2 F2 F#2', 'G2 D2 B1 Db2', 'C2 E2 G2 B2', 'C2 G1 C2',
  ];

  it('comps ii-V-I four times with the three shells', async () => {
    const song = await load('st-jazz-shells');
    expect(song.bars.length).toBe(16);
    const hs = hits(song, 'Your comping').filter((h) => h.midis.length);
    for (const h of hs) {
      expect(h.chord, `bar ${h.bar + 1}`).toBe(PROG[h.bar % 4]);
      expect(h.midis.map(nameOf).join('+'), `bar ${h.bar + 1}`).toBe(chordToken(SHELL[h.chord!]));
    }
    // The progression is ii-V-I in C.
    expect(['Dm7', 'G7', 'Cmaj7'].map((c) => scalePcs('C', 'major').indexOf(chordPcs(c)[0]) + 1)).toEqual([2, 5, 1]);
  });

  it('plays four short chords a bar in bars 1-8 and the Charleston (1 and the swung "and" of 2) in bars 9-16', async () => {
    const hs = hits(await load('st-jazz-shells'), 'Your comping');
    const on = onsetsByBar(hs, 16);
    for (let b = 0; b < 8; b++) expect(on[b], `bar ${b + 1}`).toEqual([0, 960, 1920, 2880]);
    // The swung "and" is the last third of the beat: 960 + 640.
    for (let b = 8; b < 16; b++) expect(on[b], `bar ${b + 1}`).toEqual([0, 1600]);
    const struck = hs.filter((h) => h.midis.length);
    for (const h of struck.filter((x) => x.bar < 8 || x.at === 0)) expect(h.struck.every((n) => n.staccato), `bar ${h.bar + 1} tick ${h.at}: short`).toBe(true);
  });

  it('moves two voices by a half step or not at all, and fingers the shells as the chord boxes do', async () => {
    const hs = hits(await load('st-jazz-shells'), 'Your comping');
    const top2 = (c: string) => chordToken(SHELL[c]).split('+').slice(1).map((n) => noteToMidi(n));
    const moves = [['Dm7', 'G7'], ['G7', 'Cmaj7']].map(([a, b]) => top2(b).map((m, i) => m - top2(a)[i]));
    expect(moves).toEqual([[0, -1], [-1, 0]]);
    expect(boxFingerMismatches(hs)).toEqual([]);
  });

  it('has a walking bass, root on beat 1 and a chord tone on beat 3', async () => {
    const song = await load('st-jazz-shells');
    const bassTrack = song.tracks.find((t) => t.name === 'Walking bass')!;
    expect(bassTrack.role).toBe('bass');
    expect(bassTrack.tuning ?? song.tuning).toEqual(BASS);
    const bs = hits(song, 'Walking bass');
    expect(lineByBar(bs, 16)).toEqual(BASS_LINE.map(names));
    for (const h of bs.filter((x) => x.at === 0)) expect(pc(h.midis[0]), `bar ${h.bar + 1}: root`).toBe(chordPcs(h.chord!)[0]);
    for (const h of bs.filter((x) => x.at === 1920)) expect(chordPcs(h.chord!), `bar ${h.bar + 1}: beat 3`).toContain(pc(h.midis[0]));
  });

  it('estimates below the plan (7): three-note shells are easy grips, the swing is the hard part', async () => {
    // Gap note (integration pass 2): the estimate used to score these chords by name (Dm7, G7 and
    // Cmaj7 as their open shapes). It now scores the shells actually held, which are three-note
    // grips and still easy to hold, and counts the swung pushes as syncopation: about level 4. The
    // movable shells and the swing feel are what make it level 7.
    const est = estimate(await load('st-jazz-shells'), 'Your comping');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------- bossa groove
describe('batch 14: st-bossa-groove', () => {
  const CHORDS = [...Array.from({ length: 16 }, (_, i) => (Math.floor(i / 2) % 2 === 0 ? 'Am7' : 'D7')), 'Am7'];
  const ROOT: Record<string, string> = { Am7: 'A2', D7: 'D3' };
  const UPPER: Record<string, string> = { Am7: 'G3+C4+E4', D7: 'F#3+C4+D4' };
  /** The two-bar pattern from the plan, in ticks: what is struck there (T thumb, F fingers). */
  const FIRST = ['0:TF', '1440:F', '1920:T', '2880:F'];
  const SECOND = ['0:T', '480:F', '1920:TF', '2400:F'];

  it('plays the two-bar pattern on every pair of bars, then an Am7 ending', async () => {
    const song = await load('st-bossa-groove');
    expect(song.bars.length).toBe(17);
    const hs = hits(song, 'Your part').filter((h) => h.midis.length);
    for (let b = 0; b < 16; b++) {
      const bar = hs.filter((h) => h.bar === b);
      const c = CHORDS[b];
      const got = bar.map((h) => {
        const root = noteToMidi(ROOT[c]);
        const hasT = h.midis.includes(root);
        const rest = h.midis.filter((m) => m !== root).map(nameOf).join('+');
        if (rest) expect(rest, `bar ${b + 1} tick ${h.at}`).toBe(chordToken(UPPER[c]));
        return `${h.at}:${hasT ? 'T' : ''}${rest ? 'F' : ''}`;
      });
      expect(got, `bar ${b + 1}`).toEqual(b % 2 === 0 ? FIRST : SECOND);
      expect(bar.every((h) => h.chord === c)).toBe(true);
    }
    const end = hs.filter((h) => h.bar === 16);
    expect(end.map((h) => h.midis.map(nameOf).join('+'))).toEqual([chordToken('A2+G3+C4+E4')]);
  });

  it('keeps the thumb on the root on beats 1 and 3 only, and the fingers off it', async () => {
    const hs = hits(await load('st-bossa-groove'), 'Your part').filter((h) => h.midis.length && h.bar < 16);
    for (const h of hs) {
      const root = noteToMidi(ROOT[CHORDS[h.bar]]);
      const thumb = h.struck.filter((n) => n.midi === root);
      expect(thumb.length > 0, `bar ${h.bar + 1} tick ${h.at}`).toBe(h.at === 0 || h.at === 1920);
      for (const n of thumb) expect(n.string).toBe(CHORDS[h.bar] === 'Am7' ? 6 : 5);
    }
    // The fingers land off the beat in most of their chords: the syncopation the plan asks for.
    const fingerHits = hs.filter((h) => h.midis.length >= 3);
    expect(fingerHits.filter((h) => h.at % BEAT !== 0).length).toBe(8 * 3);
  });

  it('plays only chord tones, fingers as the chord boxes show, and marks thumb and fingers in bar 1', async () => {
    const hs = hits(await load('st-bossa-groove'), 'Your part');
    for (const h of hs) expect(outside(h.midis, chordPcs(h.chord!)), `bar ${h.bar + 1}`).toEqual([]);
    expect(boxFingerMismatches(hs)).toEqual([]);
    const first = hs.find((h) => h.bar === 0 && h.at === 0)!;
    expect(first.struck.map((n) => `${n.string}${n.pluck}`).sort()).toEqual(['2a', '3m', '4i', '6p']);
    // Am7 to D7: C stays on string 3, G falls to F# and E falls to D.
    const up = (c: string) => chordToken(UPPER[c]).split('+').map((n) => noteToMidi(n));
    expect(up('D7').map((m, i) => m - up('Am7')[i])).toEqual([-1, 0, -2]);
  });

  it('estimates below the plan (7): the thumb independence shows, the feel does not', async () => {
    // Gap note (integration pass 2): it used to land at 3, with the off-beat chords between steady
    // thumb notes not counted as syncopated and Am7 and D7 scored by name. The estimate now scores
    // the grips held (5x555x, x5453x), counts the chords held across the beat as syncopation and
    // sees the fingers moving off the thumb's half-bar pulse (thumb independence): 4, a better
    // estimate, still below the plan's 7, whose demand is keeping the bossa feel relaxed and even.
    const est = estimate(await load('st-bossa-groove'), 'Your part');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(7);
    expect(est.factors.voices, JSON.stringify(est)).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------- review: what the learner is told
/**
 * Added in the independent review of batch 14. A learner alone with the guitar reads only the
 * `about` text, so each claim it makes about the music is checked against the parsed song here,
 * and the three teaching points the review added (the tapping hand's little finger, the thumb's
 * notes outside the ragtime chord boxes, the muted fifth string of the G7 shell) are tied to the
 * music that makes them necessary.
 */
describe('batch 14 review: the about text says true things about the music', () => {
  const about = (id: string) => songEntry(id)!.about;

  it('tapping: each pull-off lands below the note just hammered, so the little finger must lift first', async () => {
    const hs = hits(await load('st-lick-tapping'), 'Your lick');
    const notes = hs.flatMap((h) => h.struck);
    let checked = 0;
    notes.forEach((n, i) => {
      if (n.legato !== 'pull' || i < 3) return;
      // The note before the tap is the hammered one; if it were still held, the pull-off would sound it again.
      const hammered = notes[i - 2];
      expect(hammered.legato).toBe('hammer');
      expect(n.fret, `note ${i}: pull-off target below the hammered fret`).toBeLessThan(hammered.fret);
      checked++;
    });
    // 31 tap groups (the last beat is a held tap); the first pull-off follows no hammer-on.
    expect(checked).toBe(30);
    expect(about('st-lick-tapping')).toMatch(/Lift that little finger as you tap/);
  });

  it('ragtime: the thumb takes exactly the strings the chord boxes mark x (C string 6 fret 3, A7 string 6 open, D7 string 5 open)', async () => {
    const song = await load('st-ragtime-blues-c');
    const hs = hits(song, 'Your part');
    const outsideBox = new Set<string>();
    for (const h of hs.filter((x) => x.bar < 16 && x.at % BEAT === 0)) {
      const thumb = [...h.struck].sort((a, b) => a.midi - b.midi)[0];
      const box = buildVoicing(h.chord!, h.voicing!).frets;
      if (box[6 - thumb.string] !== thumb.fret) outsideBox.add(`${h.chord} ${thumb.string}:${thumb.fret}`);
    }
    expect([...outsideBox].sort()).toEqual(['A7 6:0', 'C 6:3', 'D7 5:0']);
    // Each is a chord tone (the fifth), and on C it is the finger that holds string 5 fret 3 that moves.
    expect(chordPcs('C')).toContain(pc(STANDARD[0] + 3));
    expect(chordPcs('A7')).toContain(pc(STANDARD[0]));
    expect(chordPcs('D7')).toContain(pc(STANDARD[1]));
    const cThumb = hs.filter((h) => h.bar === 0).flatMap((h) => h.struck).filter((n) => n.string >= 5 && n.finger !== undefined);
    expect(cThumb.map((n) => `${n.string}:${n.fret}:${n.finger}`)).toEqual(['5:3:3', '6:3:3']);
    expect(about('st-ragtime-blues-c')).toMatch(/chord box marks x: on C finger 3 hops from string 5 to string 6, and A7 and D7 borrow the open sixth and fifth strings/);
  });

  it('jazz shells: the top two notes move C to B, then F to E; only the G7 shell skips a string (5), which the text says to mute', async () => {
    const song = await load('st-jazz-shells');
    const strings = (symbol: string) => song.chords.find((c) => c.symbol === symbol)!.voicing!.map((f, i) => (f === null ? null : 6 - i)).filter((s): s is number => s !== null);
    expect(strings('Dm7')).toEqual([5, 4, 3]);
    expect(strings('Cmaj7')).toEqual([5, 4, 3]);
    expect(strings('G7')).toEqual([6, 4, 3]);
    const top2 = (symbol: string) => hits(song, 'Your comping').find((h) => h.chord === symbol && h.midis.length)!.midis.slice(1).map(nameOf);
    expect([top2('Dm7'), top2('G7'), top2('Cmaj7')]).toEqual([['F3', 'C4'], ['F3', 'B3'], ['E3', 'B3']]);
    expect(about('st-jazz-shells')).toMatch(/\(C to B, then F to E\)/);
    expect(about('st-jazz-shells')).toMatch(/in G7 the tip of finger 1 touches string 5/);
  });

  it('Lydian: in bars 2 and 6 D# sounds over the A chord and rises to E', async () => {
    const hs = hits(await load('st-mode-lydian'), 'Your melody');
    for (const bar of [1, 5]) {
      const line = hs.filter((h) => h.bar === bar).map((h) => ({ name: nameOf(h.midis[0]), chord: h.chord }));
      const i = line.findIndex((x) => x.name === 'D#4');
      expect(line[i].chord, `bar ${bar + 1}`).toBe('A');
      expect(line[i + 1].name, `bar ${bar + 1}`).toBe('E4');
    }
    expect(about('st-mode-lydian')).toMatch(/in bars 2 and 6 it holds D# over the A chord itself/);
  });

  it('Phrygian: every B flat over Am falls straight to A; the tune ends B flat to A', async () => {
    const hs = hits(await load('st-mode-phrygian'), 'Your melody');
    const line = hs.filter((h) => h.midis.length).map((h) => ({ midi: h.midis[0], chord: h.chord }));
    const overAm = line.map((x, i) => ({ ...x, i })).filter((x) => x.chord === 'Am' && pc(x.midi) === 10);
    // Bars 1 and 2 (the turns A-Bb-A and C-Bb-A) and bars 6 and 10 (on beat 1).
    expect(overAm.length).toBe(4);
    for (const x of overAm) expect(line[x.i + 1].midi - x.midi, 'B flat to A, a half step down').toBe(-1);
    expect(line.slice(-2).map((x) => nameOf(x.midi))).toEqual(['A#4', 'A4']);
  });

  it('CAGED melody: its lowest note is G, then A and B lead back up to C', async () => {
    const hs = hits(await load('st-caged-melody'), 'Your melody');
    const bar6 = hs.filter((h) => h.bar === 5).map((h) => nameOf(h.midis[0]));
    expect(bar6.slice(-3)).toEqual(['G3', 'A3', 'B3']);
    expect(nameOf(hs.find((h) => h.bar === 6)!.midis[0])).toBe('C4');
    expect(about('st-caged-melody')).toMatch(/G, then A and B leading back up/);
  });

  it('seventh arpeggios: F falls to E as G7 resolves to Cmaj7 (bars 10 to 11)', async () => {
    const hs = hits(await load('st-arpeggio-sevenths'), 'Your part');
    expect(nameOf(hs.filter((h) => h.bar === 9).at(-1)!.midis[0])).toBe('F4');
    expect(nameOf(hs.find((h) => h.bar === 10)!.midis[0])).toBe('E4');
    expect(about('st-arpeggio-sevenths')).toMatch(/F falling to E as G7 resolves to Cmaj7/);
  });
});
