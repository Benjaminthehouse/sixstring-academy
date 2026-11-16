/**
 * Batch 0 cross-checks (au-clair-de-la-lune, mary-had-a-little-lamb, lightly-row, skip-to-my-lou,
 * st-open-string-duet, st-first-notes-string-1 … 5).
 *
 * The song core computes every pitch from string + fret + tuning, so a wrong fret is a wrong note.
 * These tests compare what it computes with note lists written out here by hand: for the
 * traditional tunes from memory of the tune (and a second time in C major, the key nursery books
 * usually print them in, transposed to G), for the original studies from their composition plan.
 * They also check the harmony (strong-beat notes belong to the chord in force or pass/neighbour by
 * step), the key, the range, the plan's fingerings and spec, and the difficulty estimate.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultVoicing, estimateDifficulty, flattenSong, formatSixTabError, parseSixTab, type Song, type SongTimeline, type TimelineBeat } from '@/core/song';
import { chordNotes, chroma, getKey, noteToMidi, parseChord, scalePcs, spellInKey } from '@/core/theory';
import { identifyFretted } from '@/core/guitar';
import repertoire from '@/content/plan/repertoire.json';
import auClairMeta from '../songs/au-clair-de-la-lune/meta';
import skipMeta from '../songs/skip-to-my-lou/meta';

/** Parse a song of this batch from disk, failing with every positioned error. */
function load(id: string): Song {
  const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(text);
  if (!result.song || result.errors.length) throw new Error(`${id}: ${result.errors.map(formatSixTabError).join('; ')}`);
  return result.song;
}

/** "G3 A3 B3" -> ['G3', 'A3', 'B3']. */
const names = (s: string): string[] => s.trim().split(/\s+/);

/** Move written note names by semitones (C-major printing -> G-major arrangement), spelled in the key. */
function transpose(list: string[], semis: number, key: string): string[] {
  return list.map((n) => spellInKey(noteToMidi(n) + semis, key));
}

interface Played {
  beat: TimelineBeat;
  midi: number;
  name: string;
  string: number;
  fret: number;
  /** Ticks from the start of its bar. */
  inBar: number;
  chord: string | null;
}

/** The struck notes of one track in playing order (single-note lines: one note per beat). */
function line(song: Song, timeline: SongTimeline, trackIndex: number, key: string): Played[] {
  const track = song.tracks[trackIndex];
  return timeline
    .trackBeats(track.id)
    .filter((b) => b.notes.length > 0)
    .map((b) => {
      expect(b.notes.length, `${track.name}, bar ${b.bar + 1}: a single-note line has one note per beat`).toBe(1);
      const n = b.notes[0];
      return {
        beat: b,
        midi: n.midi,
        name: spellInKey(n.midi, key),
        string: n.string,
        fret: n.fret,
        inBar: b.tick - timeline.bars[b.index].start,
        chord: timeline.chordAt(b.tick)?.symbol ?? null,
      };
    });
}

/** Pitch classes of a chord symbol. */
const chordPcs = (symbol: string): number[] => chordNotes(symbol).map((n) => chroma(n));

/** Strong beats of a bar: 1 and 3 in 4/4, beat 1 in 2/4 and 3/4. */
function isStrong(p: Played, song: Song): boolean {
  const time = song.bars[p.beat.bar].time;
  const quarter = 960 * (4 / time.denominator);
  return time.numerator === 4 ? p.inBar % (2 * quarter) === 0 : p.inBar === 0;
}

const step = (a: number, b: number) => Math.abs(a - b) === 1 || Math.abs(a - b) === 2;

/**
 * Notes that are neither in the chord in force nor a passing/neighbour note (reached and left by
 * step). `all` checks every note, otherwise only strong beats.
 */
function harmonyProblems(notes: Played[], song: Song, all = false): string[] {
  const out: string[] = [];
  for (let i = 0; i < notes.length; i++) {
    const p = notes[i];
    if (!all && !isStrong(p, song)) continue;
    if (!p.chord) {
      out.push(`bar ${p.beat.bar + 1}: ${p.name} has no chord in force`);
      continue;
    }
    if (chordPcs(p.chord).includes(p.midi % 12)) continue;
    const prev = notes[i - 1];
    const next = notes[i + 1];
    if (prev && next && step(prev.midi, p.midi) && step(p.midi, next.midi)) continue;
    out.push(`bar ${p.beat.bar + 1}: ${p.name} over ${p.chord} is not a chord tone and not reached and left by step`);
  }
  return out;
}

/** Notes outside the key's scale. */
function outsideKey(notes: Played[], tonic: string, scale: string): string[] {
  const pcs = scalePcs(tonic, scale);
  return notes.filter((p) => !pcs.includes(p.midi % 12)).map((p) => `bar ${p.beat.bar + 1}: ${p.name}`);
}

/** Lowest and highest note. */
function range(notes: Played[], key: string): [string, string] {
  const midis = notes.map((p) => p.midi);
  return [spellInKey(Math.min(...midis), key), spellInKey(Math.max(...midis), key)];
}

/** The chord in force at the start of each bar (and at the half bar in 4/4 when it changes there). */
function chordsByBar(song: Song, timeline: SongTimeline): string[] {
  return timeline.bars.map((b) => {
    const first = timeline.chordAt(b.start)?.symbol ?? '-';
    const mid = b.time.numerator === 4 ? timeline.chordAt(b.start + b.length / 2)?.symbol ?? '-' : first;
    return mid === first ? first : `${first} ${mid}`;
  });
}

/** Every chord change has a strum on the teacher's rhythm track. */
function strumsOnEveryChange(song: Song, timeline: SongTimeline, trackIndex: number): string[] {
  const strums = new Set(timeline.trackBeats(song.tracks[trackIndex].id).filter((b) => b.source.slash).map((b) => b.tick));
  return timeline.chords.filter((c) => !strums.has(c.tick)).map((c) => `${c.symbol} at tick ${c.tick} has no strum`);
}

/** Fingered notes that break the position: first position = finger equals fret, second = fret - 1. */
function fingeringProblems(notes: Played[], song: Song, trackIndex: number, position: 1 | 2): string[] {
  const out: string[] = [];
  const beats = song.tracks[trackIndex].measures.flatMap((m, bar) => m.beats.map((b) => ({ b, bar })));
  for (const { b, bar } of beats)
    for (const n of b.notes)
      if (typeof n.finger === 'number' && n.finger !== n.fret - (position - 1)) out.push(`bar ${bar + 1}: string ${n.string} fret ${n.fret} marked finger ${n.finger}`);
  const fretted = notes.filter((p) => p.fret > 0);
  for (const p of fretted) if (p.fret - (position - 1) < 1 || p.fret - (position - 1) > 4) out.push(`bar ${p.beat.bar + 1}: fret ${p.fret} is outside position ${position}`);
  return out;
}

/** The finger marks used in a track, as "string:fret=finger". */
function fingerMarks(song: Song, trackIndex: number): Set<string> {
  const out = new Set<string>();
  for (const m of song.tracks[trackIndex].measures) for (const b of m.beats) for (const n of b.notes) if (n.finger !== undefined) out.add(`${n.string}:${n.fret}=${n.finger}`);
  return out;
}

/**
 * The plan puts every song of this batch at level 1. The estimator rates the learner's part of the
 * level-1 seed songs Hot Cross Buns and Frere Jacques at 2, so 1 or 2 is "near the plan's level".
 * One known estimator artefact is tolerated and checked: its hand-position window starts at the
 * first fretted note and ignores finger marks, so a first-position part whose first fretted note
 * is fret 2 or 3 and that later uses a lower fret reads as a five-fret stretch. That is accepted
 * only when it is the sole reason and every fretted note really sits under fingers 1-4 at frets 1-4.
 */
function expectNearLevelOne(song: Song): void {
  const part = song.tracks[0];
  const d = estimateDifficulty(song, { track: part.id });
  if (d.level <= 2) return;
  expect(d.reasons, `${part.name}: rated ${d.level}`).toEqual(['Wide stretches: up to 5 frets under one hand.']);
  const others = Object.entries(d.factors).filter(([k, v]) => k !== 'stretch' && v > 0.12);
  expect(others, `${part.name}: other difficulty factors`).toEqual([]);
  const frets = part.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.fret))).filter((f) => f > 0);
  expect(Math.min(...frets) >= 1 && Math.max(...frets) <= 4, `${part.name}: frets ${Math.min(...frets)}-${Math.max(...frets)} fit first position`).toBe(true);
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

describe('batch 00: au-clair-de-la-lune', () => {
  const song = load('au-clair-de-la-lune');
  const tl = flattenSong(song);
  const key = 'G major';
  const tune = line(song, tl, 0, key);

  // From memory of the tune, in G as the plan writes it: A A B A.
  const A = 'G3 G3 G3 A3  B3 A3  G3 B3 A3 A3  G3';
  const B = 'A3 A3 A3 A3  E3 E3  A3 G3 F#3 E3  D3';
  // The same tune as usually printed in C (do do do re mi re ...), a fifth higher than our G.
  const A_IN_C = 'C4 C4 C4 D4  E4 D4  C4 E4 D4 D4  C4';
  const B_IN_C = 'D4 D4 D4 D4  A3 A3  D4 C4 B3 A3  G3';

  it('au-clair-de-la-lune: the melody is the tune, A A B A', () => {
    expect(tune.map((p) => p.name)).toEqual(names(`${A} ${A} ${B} ${A}`));
    expect(tune.map((p) => p.name)).toEqual(transpose(names(`${A_IN_C} ${A_IN_C} ${B_IN_C} ${A_IN_C}`), -5, key));
  });

  it('au-clair-de-la-lune: rhythm, bars and lyrics', () => {
    expect(song.bars.length).toBe(16);
    const phraseA = [960, 960, 960, 960, 1920, 1920, 960, 960, 960, 960, 3840];
    expect(tune.map((p) => p.beat.duration)).toEqual([...phraseA, ...phraseA, ...phraseA, ...phraseA]);
    const sung = song.tracks[0].measures.flatMap((m) => m.beats.filter((b) => b.notes.length && b.lyric !== undefined));
    expect(sung.length, 'one syllable per note').toBe(44);
  });

  it('au-clair-de-la-lune: strings, positions and the plan\'s fingering', () => {
    // A phrases: strings 3 and 2 only (open G, fret 2 A, open B). B phrase: also string 4.
    const aPhrases = tune.filter((p) => p.beat.bar < 8 || p.beat.bar >= 12);
    expect(new Set(aPhrases.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['3:0', '3:2', '2:0']));
    const bPhrase = tune.filter((p) => p.beat.bar >= 8 && p.beat.bar < 12);
    expect(new Set(bPhrase.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['3:2', '3:0', '4:0', '4:2', '4:4']));
    expect(fingeringProblems(tune, song, 0, 2)).toEqual([]);
    expect(fingerMarks(song, 0)).toEqual(new Set(['3:2=1', '4:2=1', '4:4=3']));
  });

  it('au-clair-de-la-lune: harmony, key and range', () => {
    expect(chordsByBar(song, tl)).toEqual([
      'G', 'G D7', 'G D7', 'G',
      'G', 'G D7', 'G D7', 'G',
      'D', 'A7', 'A7 D', 'D',
      'G', 'G D7', 'G D7', 'G',
    ]);
    expect(harmonyProblems(tune, song)).toEqual([]);
    expect(outsideKey(tune, 'G', 'major')).toEqual([]);
    expect(range(tune, key)).toEqual(['D3', 'B3']);
    expect(strumsOnEveryChange(song, tl, 1)).toEqual([]);
  });

  it('au-clair-de-la-lune: difficulty is near the plan\'s level 1', () => {
    expectNearLevelOne(song);
  });
});

describe('batch 00: mary-had-a-little-lamb', () => {
  const song = load('mary-had-a-little-lamb');
  const tl = flattenSong(song);
  const key = 'G major';
  const tune = line(song, tl, 0, key);

  const IN_G = 'B3 A3 G3 A3  B3 B3 B3  A3 A3 A3  B3 D4 D4  B3 A3 G3 A3  B3 B3 B3 B3  A3 A3 B3 A3  G3';
  const IN_C = 'E4 D4 C4 D4  E4 E4 E4  D4 D4 D4  E4 G4 G4  E4 D4 C4 D4  E4 E4 E4 E4  D4 D4 E4 D4  C4';

  it('mary-had-a-little-lamb: the melody is the tune', () => {
    expect(tune.map((p) => p.name)).toEqual(names(IN_G));
    expect(tune.map((p) => p.name)).toEqual(transpose(names(IN_C), -5, key));
  });

  it('mary-had-a-little-lamb: rhythm and lyrics', () => {
    expect(song.bars.length).toBe(8);
    const q = 960, h = 1920, w = 3840;
    expect(tune.map((p) => p.beat.duration)).toEqual([q, q, q, q, q, q, h, q, q, h, q, q, h, q, q, q, q, q, q, q, q, q, q, q, q, w]);
    const lyrics = song.tracks[0].measures.flatMap((m) => m.beats.map((b) => b.lyric)).filter(Boolean);
    expect(lyrics.length).toBe(26);
  });

  it('mary-had-a-little-lamb: strings and the plan\'s fingers (A with 2, D with 3)', () => {
    expect(new Set(tune.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['3:0', '3:2', '2:0', '2:3']));
    expect(fingeringProblems(tune, song, 0, 1)).toEqual([]);
    expect(fingerMarks(song, 0)).toEqual(new Set(['3:2=2', '2:3=3']));
  });

  it('mary-had-a-little-lamb: harmony (G, with D7 under bars 3 and 7), key and range', () => {
    expect(chordsByBar(song, tl)).toEqual(['G', 'G', 'D7', 'G', 'G', 'G', 'D7', 'G']);
    expect(harmonyProblems(tune, song)).toEqual([]);
    expect(outsideKey(tune, 'G', 'major')).toEqual([]);
    expect(range(tune, key)).toEqual(['G3', 'D4']);
    expect(strumsOnEveryChange(song, tl, 1)).toEqual([]);
  });

  it('mary-had-a-little-lamb: difficulty is near the plan\'s level 1', () => {
    expectNearLevelOne(song);
  });
});

describe('batch 00: lightly-row', () => {
  const song = load('lightly-row');
  const tl = flattenSong(song);
  const key = 'G major';
  const tune = line(song, tl, 0, key);

  // Haenschen klein, from memory, in G: A A B A.
  const A1 = 'D4 B3 B3  C4 A3 A3  G3 A3 B3 C4  D4 D4 D4';
  const A2 = 'D4 B3 B3  C4 A3 A3  G3 B3 D4 D4  G3';
  const B = 'A3 A3 A3 A3  A3 B3 C4  B3 B3 B3 B3  B3 C4 D4';
  // As printed in C: sol mi mi, fa re re, do re mi fa, sol sol sol ...
  const A1_IN_C = 'G4 E4 E4  F4 D4 D4  C4 D4 E4 F4  G4 G4 G4';
  const A2_IN_C = 'G4 E4 E4  F4 D4 D4  C4 E4 G4 G4  C4';
  const B_IN_C = 'D4 D4 D4 D4  D4 E4 F4  E4 E4 E4 E4  E4 F4 G4';

  it('lightly-row: the melody is the tune, A A B A', () => {
    expect(tune.map((p) => p.name)).toEqual(names(`${A1} ${A2} ${B} ${A2}`));
    expect(tune.map((p) => p.name)).toEqual(transpose(names(`${A1_IN_C} ${A2_IN_C} ${B_IN_C} ${A2_IN_C}`), -5, key));
  });

  it('lightly-row: sixteen bars of quarter, half and whole notes', () => {
    expect(song.bars.length).toBe(16);
    expect(new Set(tune.map((p) => p.beat.duration))).toEqual(new Set([960, 1920, 3840]));
    expect(song.tracks[0].measures.flatMap((m) => m.beats).some((b) => b.lyric)).toBe(false);
  });

  it('lightly-row: strings 3 and 2 only, one finger per fret', () => {
    expect(new Set(tune.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['3:0', '3:2', '2:0', '2:1', '2:3']));
    expect(fingeringProblems(tune, song, 0, 1)).toEqual([]);
    expect(fingerMarks(song, 0)).toEqual(new Set(['2:1=1', '3:2=2', '2:3=3']));
  });

  it('lightly-row: harmony (D7 under bars 2, 6, 9, 10 and 14), key and range', () => {
    const chords = chordsByBar(song, tl);
    const d7Bars = chords.map((c, i) => (c === 'D7' ? i + 1 : 0)).filter(Boolean);
    expect(d7Bars).toEqual([2, 6, 9, 10, 14]);
    expect(chords.filter((c) => c !== 'D7').every((c) => c === 'G')).toBe(true);
    expect(harmonyProblems(tune, song)).toEqual([]);
    expect(outsideKey(tune, 'G', 'major')).toEqual([]);
    expect(range(tune, key)).toEqual(['G3', 'D4']);
    expect(strumsOnEveryChange(song, tl, 1)).toEqual([]);
  });

  it('lightly-row: difficulty is near the plan\'s level 1', () => {
    expectNearLevelOne(song);
  });
});

describe('batch 00: skip-to-my-lou', () => {
  const song = load('skip-to-my-lou');
  const tl = flattenSong(song);

  it('skip-to-my-lou: two bars a line, A / E7 / A / E7 A, five times', () => {
    expect(song.bars.length).toBe(40);
    const block = ['A', 'A', 'E7', 'E7', 'A', 'A', 'E7', 'A'];
    expect(chordsByBar(song, tl)).toEqual([...block, ...block, ...block, ...block, ...block]);
  });

  it('skip-to-my-lou: the plan\'s shapes, A (x02220) and E7 (020100)', () => {
    const shapes = new Map(song.chords.map((c) => [c.symbol, JSON.stringify(c.voicing)]));
    expect(shapes.get('A')).toBe(JSON.stringify([null, 0, 2, 2, 2, 0]));
    expect(shapes.get('E7')).toBe(JSON.stringify([0, 2, 0, 1, 0, 0]));
    expect(song.chords.every((c) => c.voicing)).toBe(true);
  });

  it('skip-to-my-lou: one downstrum on every beat', () => {
    const track = song.tracks[0];
    expect(track.role).toBe('rhythm');
    const beats = track.measures.flatMap((m) => m.beats);
    expect(beats.every((b) => b.slash && b.stroke === 'down')).toBe(true);
    track.measures.forEach((m, i) => expect(m.beats.length, `bar ${i + 1}`).toBe(i === 39 ? 1 : 2));
  });

  it('skip-to-my-lou: the words of each line sit on its first strum', () => {
    const lines = (first: string) => [first, first, first, 'Skip to my Lou, my darling.'];
    const chorus = lines('Lou, Lou, skip to my Lou,');
    const words = [...chorus, ...lines("Lost my partner, what'll I do?"), ...chorus, ...lines("Fly's in the buttermilk, shoo, fly, shoo,"), ...chorus];
    expect(song.annotations.map((a) => a.text)).toEqual(words);
    expect(song.annotations.map((a) => a.bar)).toEqual(words.map((_, i) => 2 * i));
    expect(song.annotations.every((a) => a.tick === 0)).toBe(true);
  });

  it('skip-to-my-lou: key A major, and the strum part rates near level 1', () => {
    const k = getKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe('A major');
    expectNearLevelOne(song);
  });
});

// ---------------------------------------------------------------------------------------------
// Original studies
// ---------------------------------------------------------------------------------------------

describe('batch 00: st-open-string-duet', () => {
  const song = load('st-open-string-duet');
  const tl = flattenSong(song);
  const key = 'E minor';
  const part = line(song, tl, 0, key);
  const tune = line(song, tl, 1, key);

  it('st-open-string-duet: your part is the open strings 6, 5 and 4 in the planned order', () => {
    expect(song.bars.length).toBe(16);
    const strings = [6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 6, 5, 4, 6];
    for (const p of part) {
      expect(p.fret, `bar ${p.beat.bar + 1}`).toBe(0);
      expect(p.string, `bar ${p.beat.bar + 1}`).toBe(strings[p.beat.bar]);
    }
    const group = 'h h  h h  q q q q  q q h'.split(/\s+/);
    const last = 'q q h  q q h  q q h  h h'.split(/\s+/);
    const len: Record<string, number> = { q: 960, h: 1920 };
    expect(part.map((p) => p.beat.duration)).toEqual([...group, ...group, ...group, ...last].map((d) => len[d]));
    const eleven = (n: string) => Array<string>(11).fill(n);
    expect(part.map((p) => p.name)).toEqual([...eleven('E2'), ...eleven('A2'), ...eleven('D3'), ...names('E2 E2 E2  A2 A2 A2  D3 D3 D3  E2 E2')]);
  });

  it('st-open-string-duet: each open string is the root of the chord in force', () => {
    expect(chordsByBar(song, tl)).toEqual(['Em', 'Em', 'Em', 'Em', 'Am', 'Am', 'Am', 'Am', 'D', 'D', 'D', 'D', 'Em', 'Am', 'D', 'Em']);
    for (const p of part) expect(chroma(parseChord(p.chord!)!.root), `bar ${p.beat.bar + 1}`).toBe(p.midi % 12);
  });

  it('st-open-string-duet: the teacher\'s tune is the composed one, in chord on strong beats', () => {
    const plan =
      'B3 E4 G4  G4 F#4 E4  E4 F#4 G4 F#4  E4 B3 ' + // Em: up the chord, down by step, a turn, a landing
      'A3 C4 E4  E4 D4 C4  C4 D4 E4 D4  C4 A3 ' + // Am: the same shape
      'A3 D4 F#4  F#4 E4 D4  D4 E4 F#4 E4  D4 F#4 ' + // D: the same shape, landing on F# to lead into Em
      'G4 F#4 E4  E4 D4 C4  D4 E4 F#4  E4'; // Em Am D Em, home to E
    expect(tune.map((p) => p.name)).toEqual(names(plan));
    expect(harmonyProblems(tune, song)).toEqual([]);
    expect(outsideKey(tune, 'E', 'minor')).toEqual([]);
    expect(range(tune, key)).toEqual(['A3', 'G4']);
    expect(tune.every((p) => p.fret <= 3), 'the teacher stays in first position').toBe(true);
    expect(strumsOnEveryChange(song, tl, 2)).toEqual([]);
  });

  it('st-open-string-duet: your part rates near level 1', () => {
    expectNearLevelOne(song);
  });
});

/** Shared checks of the five first-notes studies. */
interface FirstNotes {
  id: string;
  key: string;
  tonic: string;
  scale: string;
  plan: string;
  chords: string[];
  range: [string, string];
  fingers: string[];
  /** Check every note against its chord, not only strong beats. */
  everyNote?: boolean;
}

const FIRST_NOTES: FirstNotes[] = [
  {
    id: 'st-first-notes-string-1',
    key: 'C major',
    tonic: 'C',
    scale: 'major',
    // E F G | F E F | G F E | F G F | E G | G F E | F G | G F E
    plan: 'E4 F4 G4  F4 E4 F4  G4 F4 E4  F4 G4 F4  E4 G4  G4 F4 E4  F4 G4  G4 F4 E4',
    chords: ['C', 'G7', 'C', 'G7', 'C', 'C', 'G7', 'C'],
    range: ['E4', 'G4'],
    fingers: ['1:1=1', '1:3=3'],
    everyNote: true,
  },
  {
    id: 'st-first-notes-string-2',
    key: 'G major',
    tonic: 'G',
    scale: 'major',
    // string 2 only, then across to string 1 and back down to B
    plan: 'B3 C4 D4  C4 B3 C4  D4 C4 B3 C4  D4 B3  C4 E4 G4  G4 E4 D4  E4 D4 C4 E4  D4 C4 B3',
    chords: ['G', 'C', 'G', 'G', 'C', 'G', 'C', 'G'],
    range: ['B3', 'G4'],
    fingers: ['2:1=1', '2:3=3', '1:3=3'],
  },
  {
    id: 'st-first-notes-string-3',
    key: 'G major',
    tonic: 'G',
    scale: 'major',
    // G and A call and answer, then up the G chord and back down to G
    plan: 'G3 A3 G3  A3 G3 A3  G3 G3 A3 G3  A3 A3 A3  G3 B3 D4  D4 E4 D4 B3  C4 B3 A3 C4  D4 B3 G3',
    chords: ['G', 'D7', 'G', 'D7', 'G', 'G', 'D7', 'G'],
    range: ['G3', 'E4'],
    fingers: ['3:2=2', '2:3=3', '2:1=1'],
  },
  {
    id: 'st-first-notes-string-4',
    key: 'D minor',
    tonic: 'D',
    scale: 'minor',
    // whole step then half step; turns around the half step (E F E) and the whole step (E D E)
    plan: 'D3 E3 F3  E3 F3 E3  F3 E3 D3  E3 D3 E3  F3 D3  D3 E3 F3 E3  E3 F3 E3  F3 E3 D3',
    chords: ['Dm', 'A7', 'Dm', 'A7', 'Dm', 'Dm', 'A7', 'Dm'],
    range: ['D3', 'F3'],
    fingers: ['4:2=2', '4:3=3'],
  },
  {
    id: 'st-first-notes-string-5',
    key: 'A minor',
    tonic: 'A',
    scale: 'minor',
    // low and march-like; the last bar turns from E7 back to Am
    plan: 'A2 A2 C3  B2 B2 B2  C3 B2 A2 C3  B2 C3 B2  A2 A2 C3  B2 A2 B2  C3 B2 A2 C3  B2 A2',
    chords: ['Am', 'E7', 'Am', 'E7', 'Am', 'E7', 'Am', 'E7 Am'],
    range: ['A2', 'C3'],
    fingers: ['5:3=3', '5:2=2'],
  },
];

for (const spec of FIRST_NOTES) {
  describe(`batch 00: ${spec.id}`, () => {
    const song = load(spec.id);
    const tl = flattenSong(song);
    const tune = line(song, tl, 0, spec.key);

    it(`${spec.id}: the melody is the composed one`, () => {
      expect(song.bars.length).toBe(8);
      expect(tune.map((p) => p.name)).toEqual(names(spec.plan));
    });

    it(`${spec.id}: quarter and half notes only, ending on a held note`, () => {
      expect(new Set(tune.map((p) => p.beat.duration))).toEqual(new Set([960, 1920]));
      expect(tune[tune.length - 1].beat.duration).toBe(1920);
    });

    it(`${spec.id}: harmony, key and range`, () => {
      expect(chordsByBar(song, tl)).toEqual(spec.chords);
      expect(harmonyProblems(tune, song, spec.everyNote)).toEqual([]);
      expect(outsideKey(tune, spec.tonic, spec.scale)).toEqual([]);
      expect(range(tune, spec.key)).toEqual(spec.range);
      expect(strumsOnEveryChange(song, tl, 1)).toEqual([]);
      const k = getKey(song.key ?? '');
      expect(k && `${k.tonic} ${k.mode}`).toBe(spec.key);
    });

    it(`${spec.id}: first position, with the plan's fingers`, () => {
      expect(fingeringProblems(tune, song, 0, 1)).toEqual([]);
      expect(fingerMarks(song, 0)).toEqual(new Set(spec.fingers));
    });

    it(`${spec.id}: rates near level 1`, () => {
      expectNearLevelOne(song);
    });
  });
}

describe('batch 00: st-first-notes spec details', () => {
  const notesOf = (id: string, key: string) => {
    const song = load(id);
    return { song, tune: line(song, flattenSong(song), 0, key) };
  };

  it('st-first-notes-string-1: string 1 only, mostly steps with one skip E-G, ending on E over C', () => {
    const { tune } = notesOf('st-first-notes-string-1', 'C major');
    expect(new Set(tune.map((p) => p.string))).toEqual(new Set([1]));
    const skips = tune.slice(1).map((p, i) => [tune[i], p] as const).filter(([a, b]) => Math.abs(a.midi - b.midi) > 2);
    expect(skips.map(([a, b]) => `${a.name}-${b.name}`)).toEqual(['E4-G4']);
    const last = tune[tune.length - 1];
    expect([last.name, last.chord]).toEqual(['E4', 'C']);
  });

  it('st-first-notes-string-2: string 2 alone, then strings 2 and 1; ends on B or D over G', () => {
    const { tune } = notesOf('st-first-notes-string-2', 'G major');
    expect(new Set(tune.filter((p) => p.beat.bar < 4).map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['2:0', '2:1', '2:3']));
    expect(new Set(tune.filter((p) => p.beat.bar >= 4).map((p) => p.string))).toEqual(new Set([1, 2]));
    const last = tune[tune.length - 1];
    expect(['B3', 'D4']).toContain(last.name);
    expect(last.chord).toBe('G');
  });

  it('st-first-notes-string-3: G and A on string 3, then G A B C D and open E across strings 3, 2, 1; ends on G', () => {
    const { tune } = notesOf('st-first-notes-string-3', 'G major');
    expect(new Set(tune.filter((p) => p.beat.bar < 4).map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['3:0', '3:2']));
    const later = tune.filter((p) => p.beat.bar >= 4);
    expect(new Set(later.map((p) => p.string))).toEqual(new Set([1, 2, 3]));
    expect(new Set(later.map((p) => p.name))).toEqual(new Set(['G3', 'A3', 'B3', 'C4', 'D4', 'E4']));
    expect(later.find((p) => p.name === 'E4')?.fret).toBe(0);
    expect(tune[tune.length - 1].name).toBe('G3');
  });

  it('st-first-notes-string-4: string 4 only, both the whole step D-E and the half step E-F, labelled; ends on D', () => {
    const { song, tune } = notesOf('st-first-notes-string-4', 'D minor');
    expect(new Set(tune.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['4:0', '4:2', '4:3']));
    const moves = new Set(tune.slice(1).map((p, i) => [tune[i].name, p.name].sort().join('-')));
    expect(moves.has('D3-E3') && moves.has('E3-F3')).toBe(true);
    expect(song.annotations.map((a) => a.text)).toEqual(['whole step', 'half step']);
    expect(tune[tune.length - 1].name).toBe('D3');
  });

  it('st-first-notes-string-5: string 5 only (B sits in E7, A and C in Am); ends on A', () => {
    const { tune } = notesOf('st-first-notes-string-5', 'A minor');
    expect(new Set(tune.map((p) => `${p.string}:${p.fret}`))).toEqual(new Set(['5:0', '5:2', '5:3']));
    for (const p of tune.filter((x) => isStrong(x, load('st-first-notes-string-5')))) {
      const expected = p.name === 'B2' ? 'E7' : 'Am';
      expect(p.chord, `bar ${p.beat.bar + 1}: ${p.name}`).toBe(expected);
    }
    expect(tune[tune.length - 1].name).toBe('A2');
  });
});

// ---------------------------------------------------------------------------------------------
// Review cross-checks (added in the independent review of batch 0)
// ---------------------------------------------------------------------------------------------

const BATCH = [
  'au-clair-de-la-lune', 'mary-had-a-little-lamb', 'lightly-row', 'skip-to-my-lou', 'st-open-string-duet',
  'st-first-notes-string-1', 'st-first-notes-string-2', 'st-first-notes-string-3', 'st-first-notes-string-4', 'st-first-notes-string-5',
];

/** The plan's own text for a piece (its `notes`). */
function planNotes(id: string): string {
  const entry = (repertoire as { pieces: { id: string; notes: string }[] }).pieces.find((p) => p.id === id);
  if (!entry) throw new Error(`${id} is not a piece in the plan`);
  return entry.notes;
}

/**
 * The plan writes melodies as "B A G A | B B B (half) | ... | G (whole)": a note is a quarter unless
 * "(half)" or "(whole)" follows it. Returns one "letter:length" list per bar.
 */
function planBars(text: string): string[][] {
  return text.split('|').map((bar) => {
    const out: string[] = [];
    for (const tok of bar.trim().split(/\s+/)) {
      if (tok === '(half)') out[out.length - 1] = out[out.length - 1].replace(/:q$/, ':h');
      else if (tok === '(whole)') out[out.length - 1] = out[out.length - 1].replace(/:q$/, ':w');
      else out.push(`${tok}:q`);
    }
    return out;
  });
}

/** What the lead track sounds, bar by bar, as "letter:length" (letters spelled in the key, no octave). */
function songBars(song: Song, key: string): string[][] {
  const len: Record<number, string> = { 960: 'q', 1920: 'h', 3840: 'w' };
  return song.tracks[0].measures.map((m) =>
    m.beats.filter((b) => b.notes.length).map((b) => `${spellInKey(b.notes[0].midi, key, { octave: false })}:${len[b.duration] ?? b.duration}`),
  );
}

describe('batch 00 review: the pieces against the plan\'s own note lists, bar by bar', () => {
  it('au-clair-de-la-lune: the plan\'s day-one A phrase and B phrase, in A A B A order', () => {
    const notes = planNotes('au-clair-de-la-lune');
    const a = /strings 3 and 2: (.+?), using/.exec(notes)?.[1];
    const b = /the B phrase \((.+?)\) drops/.exec(notes)?.[1];
    expect(a && b, 'the plan names the A and B phrases').toBeTruthy();
    expect(songBars(load('au-clair-de-la-lune'), 'G major')).toEqual([...planBars(a!), ...planBars(a!), ...planBars(b!), ...planBars(a!)]);
  });

  it('mary-had-a-little-lamb: the plan\'s 8 bars', () => {
    const bars = /8 bars: (.+?)\. /.exec(planNotes('mary-had-a-little-lamb'))?.[1];
    expect(songBars(load('mary-had-a-little-lamb'), 'G major')).toEqual(planBars(bars!));
  });

  it('lightly-row: the plan\'s 16 bars', () => {
    const bars = /16 bars: (.+?)\. /.exec(planNotes('lightly-row'))?.[1];
    expect(songBars(load('lightly-row'), 'G major')).toEqual(planBars(bars!));
  });
});

describe('batch 00 review: lyrics, one syllable under the right note', () => {
  /** Sung syllables with the bar and beat (1-based) they start on. */
  const sung = (song: Song) =>
    song.tracks[0].measures.flatMap((m, bar) => m.beats.filter((b) => b.notes.length && b.lyric).map((b) => ({ text: b.lyric!, bar: bar + 1, beat: b.start / 960 + 1, ticks: b.duration })));

  it('au-clair-de-la-lune: the first French verse, each line starting on beat 1 of its two bars', () => {
    const verse = [
      'Au clair de la lu- ne,', 'mon a- mi Pier- rot,', 'Prê- te- moi ta plu- me', 'pour é- crire un mot.',
      'Ma chan- delle est mor- te,', 'je n\'ai plus de feu.', 'Ou- vre- moi ta por- te', 'pour l\'a- mour de Dieu.',
    ];
    const s = sung(load('au-clair-de-la-lune'));
    expect(s.map((x) => x.text)).toEqual(verse.join(' ').split(' '));
    let i = 0;
    verse.forEach((line, n) => {
      expect([s[i].text, s[i].bar, s[i].beat], `line ${n + 1} starts its pair of bars`).toEqual([line.split(' ')[0], 2 * n + 1, 1]);
      i += line.split(' ').length;
    });
    // The long notes carry the line ends: "rot," "mot." "feu." "Dieu." on whole notes.
    expect(s.filter((x) => x.ticks === 3840).map((x) => x.text)).toEqual(['rot,', 'mot.', 'feu.', 'Dieu.']);
  });

  it('mary-had-a-little-lamb: verse 1, "lamb" on the held notes and "snow" on the whole note', () => {
    const s = sung(load('mary-had-a-little-lamb'));
    expect(s.map((x) => x.text).join(' ')).toBe('Ma- ry had a lit- tle lamb, lit- tle lamb, lit- tle lamb, Ma- ry had a lit- tle lamb, its fleece was white as snow.');
    expect(s.filter((x) => x.ticks > 960).map((x) => `${x.text}@${x.bar}`)).toEqual(['lamb,@2', 'lamb,@3', 'lamb,@4', 'snow.@8']);
  });
});

describe('batch 00 review: chord shapes, checked with the guitar engine', () => {
  it.each(BATCH)('%s: every chord sounds its symbol, in open position for a first-week player', (id) => {
    const song = load(id);
    for (const c of song.chords) {
      const frets = c.voicing ?? defaultVoicing(c.symbol, song.tuning, song.capo);
      expect(frets, `${id} bar ${c.bar + 1}: ${c.symbol} has a shape`).toBeTruthy();
      expect(identifyFretted([...frets!]).symbol, `${id} bar ${c.bar + 1}: ${c.symbol} = ${JSON.stringify(frets)}`).toBe(c.symbol);
      expect(Math.max(...frets!.filter((f): f is number => f !== null)), `${id} bar ${c.bar + 1}: ${c.symbol} stays in open position`).toBeLessThanOrEqual(3);
    }
  });

  it('skip-to-my-lou: the given shapes are exactly the plan\'s A (x02220) and E7 (020100)', () => {
    expect(identifyFretted('x02220').symbol).toBe('A');
    expect(identifyFretted('020100').symbol).toBe('E7');
  });
});

describe('batch 00 review: learner copy says what the music does', () => {
  it('au-clair-de-la-lune: the day-one notes in "about" are the first four bars', () => {
    const sentence = auClairMeta.about.split(/(?<=\.)\s/).find((x) => /day one/i.test(x)) ?? '';
    const letters = sentence.slice(sentence.indexOf(':')).match(/\b[A-G]\b/g) ?? [];
    const firstFour = songBars(load('au-clair-de-la-lune'), 'G major').slice(0, 4).flat().map((n) => n.split(':')[0]);
    expect(letters).toEqual(firstFour);
  });

  it('skip-to-my-lou: with no tune track, it claims no singing skill and says the tune is not written out', () => {
    const song = load('skip-to-my-lou');
    expect(song.tracks.some((t) => t.role === 'lead')).toBe(false);
    expect(skipMeta.skills).not.toContain('singing');
    expect(skipMeta.about).toMatch(/tune itself is not written out/);
  });
});
