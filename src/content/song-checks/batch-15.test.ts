/**
 * Independent cross-checks for batch 15 of the built-in songs (level-7 and level-8 studies):
 * st-read-seventh-position, st-solea-compas, st-dadgad-air, st-open-g-slide, st-arpeggio-sweep,
 * st-mode-locrian, st-jazz-drop2, st-jazz-minor-ii-v.
 * (paganini-caprice-24-theme and maple-leaf-rag, the other two ids of the batch, were left out:
 * no early edition could be consulted, and the plan forbids reconstructing them from memory.)
 *
 * The expected notes below were written out by hand as note names from the composition plans,
 * not copied from the tab, so a wrong fret (or a fret read in the wrong tuning) shows up as a
 * wrong note. Each song is parsed with the song core and compared bar by bar; the checks then
 * cover the tunings, the chord shapes and what they sound, notes on strong beats against the
 * chord in force, the key or mode, the range and hand position, what each plan's spec asks for,
 * and the difficulty estimate against the plan's level (with the reason where it differs).
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, type Song } from '@/core/song';
import { buildVoicing, checkVoicingFingering, chordDifficulty } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const STANDARD = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const IDS = ['st-read-seventh-position', 'st-solea-compas', 'st-dadgad-air', 'st-open-g-slide', 'st-arpeggio-sweep', 'st-mode-locrian', 'st-jazz-drop2', 'st-jazz-minor-ii-v'];

/** "G2+B2" -> canonical sharps spelling, notes low to high, so comparisons are by pitch. */
function canon(token: string): string {
  if (token === 'r' || token === 'slash' || token === 'tie') return token;
  return token
    .split('+')
    .map((n) => noteToMidi(n))
    .sort((a, b) => a - b)
    .map((x) => midiToNote(x, { prefer: 'sharps' }))
    .join('+');
}

/** Split a bar written as "E4 D4 C4" into canonical tokens. */
const bar = (s: string): string[] => s.trim().split(/\s+/).map(canon);
/** Note names to MIDI numbers. */
const midis = (s: string): number[] => s.trim().split(/\s+/).map((n) => noteToMidi(n));
const pc = (m: number) => ((m % 12) + 12) % 12;

interface Played {
  bar: number;
  inBar: number;
  duration: number;
  token: string;
  midis: number[];
  frets: Array<{ string: number; fret: number; finger?: number | 'T'; pluck?: string; slide?: 'up' | 'down'; slideIn?: string; legato?: 'hammer' | 'pull'; accent?: boolean; harmonic?: string; vibrato?: boolean; letRing?: boolean }>;
  slash: boolean;
  stroke?: 'down' | 'up';
  chord: string | null;
  voicing: string | null;
  tuplet: boolean;
}

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  return result.song!;
}

/** Frets low string first as text: [null, 3, 2, 0, 1, 0] -> "x32010" (two-digit frets joined with hyphens). */
function shapeText(v: ReadonlyArray<number | null>): string {
  const parts = v.map((f) => (f === null ? 'x' : String(f)));
  return parts.some((p) => p.length > 1) ? parts.join('-') : parts.join('');
}

/** Every beat of a track (rests included), in order, with what it sounds. */
function played(song: Song, trackName: string): Played[] {
  const track = song.tracks.find((t) => t.name === trackName);
  if (!track) throw new Error(`no track ${trackName}`);
  const tl = flattenSong(song);
  return tl.trackBeats(track.id).map((b) => {
    const start = tl.barAt(b.tick).start;
    const chord = tl.chordAt(b.tick);
    const struck = b.notes.filter((n) => !n.tie);
    const ms = struck.map((n) => n.midi).sort((x, y) => x - y);
    const token = b.source.slash ? 'slash' : ms.length ? ms.map((x) => midiToNote(x, { prefer: 'sharps' })).join('+') : b.notes.length ? 'tie' : 'r';
    return {
      bar: b.bar,
      inBar: b.tick - start,
      duration: b.duration,
      token,
      midis: ms,
      frets: struck.map((n) => ({ string: n.string, fret: n.fret, finger: n.finger, pluck: n.pluck, slide: n.slide, slideIn: n.slideIn, legato: n.legato, accent: n.accent, harmonic: n.harmonic, vibrato: n.vibrato, letRing: n.letRing })),
      slash: !!b.source.slash,
      stroke: b.source.stroke,
      chord: chord?.symbol ?? null,
      voicing: chord?.voicing ? shapeText(chord.voicing) : null,
      tuplet: !!b.source.value?.tuplet,
    };
  });
}

/** The tokens of a track, bar by bar. */
function tokensByBar(beats: Played[], bars: number): string[][] {
  const out: string[][] = Array.from({ length: bars }, () => []);
  for (const b of beats) out[b.bar].push(b.token);
  return out;
}

/** The tokens of a track, bar by bar, rests and ties left out. */
function notesByBar(beats: Played[], bars: number): string[][] {
  return tokensByBar(beats.filter((b) => b.midis.length > 0), bars);
}

/** What a shape sounds in a tuning, low to high ("x32010" or "8-10-10-9-8-8"). */
function shapeSounds(frets: string, tuning = STANDARD): number[] {
  const parts = frets.includes('-') ? frets.split('-') : [...frets];
  return parts.flatMap((f, i) => (f === 'x' ? [] : [tuning[i] + Number(f)])).sort((a, b) => a - b);
}

/** Pitch classes outside a set, as note names. */
function outside(ms: number[], pcs: number[]): string[] {
  const allowed = new Set(pcs);
  return [...new Set(ms.filter((m) => !allowed.has(pc(m))).map((m) => midiToNote(m, { prefer: 'sharps' })))];
}

/**
 * Notes on strong beats must be tones of the chord in force, or a passing or neighbour note: a
 * single note a step (one or two semitones) from the next note, which is a chord tone. Notes
 * struck together on a strong beat must all be chord tones.
 */
function strongBeatProblems(beats: Played[], strong: (b: Played) => boolean): string[] {
  const notes = beats.filter((b) => b.midis.length > 0);
  const problems: string[] = [];
  notes.forEach((b, i) => {
    if (!strong(b) || !b.chord) return;
    const tones = new Set(chordPcs(b.chord));
    const out = b.midis.filter((m) => !tones.has(pc(m)));
    if (!out.length) return;
    const next = notes[i + 1];
    const resolves = b.midis.length === 1 && !!next && next.midis.length === 1 && Math.abs(next.midis[0] - b.midis[0]) <= 2 && tones.has(pc(next.midis[0]));
    if (!resolves) problems.push(`bar ${b.bar + 1} tick ${b.inBar}: ${b.token} is not in ${b.chord} and does not step to a chord tone`);
  });
  return problems;
}
const beats13 = (b: Played) => b.inBar === 0 || b.inBar === 1920;
const beat1 = (b: Played) => b.inBar === 0;

/** Estimated difficulty of a track. */
function estimate(song: Song, trackName: string) {
  const track = song.tracks.find((t) => t.name === trackName)!;
  return estimateDifficulty(song, { track: track.id });
}

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Every shape used in the batch (standard tuning), with the notes it should sound, low to high. */
const SHAPES: Record<string, string> = {
  'G=320003': 'G2 B2 D3 G3 B3 G4',
  'C=x32010': 'C3 E3 G3 C4 E4',
  'Am=x02210': 'A2 E3 A3 C4 E4',
  'D=xx0232': 'D3 A3 D4 F#4',
  'Em=022000': 'E2 B2 E3 G3 B3 E4',
  'B7=x21202': 'B2 D#3 A3 B3 F#4',
  'E=022100': 'E2 B2 E3 G#3 B3 E4',
  'F=xx3211': 'F3 A3 C4 F4',
  'Am7b5=x0101x': 'A2 Eb3 G3 C4',
  'Bbmaj7=x1323x': 'Bb2 F3 A3 D4',
  'Dm7=xx3535': 'F3 C4 D4 A4',
  'G7=xx3433': 'F3 B3 D4 G4',
  'Cmaj7=xx2413': 'E3 B3 C4 G4',
  'Gm7=x-x-8-10-8-10': 'Bb3 F4 G4 D5',
  'C7=xx8988': 'Bb3 E4 G4 C5',
  'Fmaj7=xx7968': 'A3 E4 F4 C5',
  'Bm7b5=x2323x': 'B2 F3 A3 D4',
  'E7=xx2434': 'E3 B3 D4 G#4',
  'Am7=x02213': 'A2 E3 A3 C4 G4',
};

/** Root, third and (for seventh chords) the seventh: a shape may leave out only the fifth. */
function requiredPcs(symbol: string): number[] {
  const pcs = chordPcs(symbol);
  return pcs.length >= 4 ? [pcs[0], pcs[1], pcs[3]] : [pcs[0], pcs[1]];
}

describe('batch 15: the chord shapes', () => {
  it('reads chord tones root first (the helper below depends on it)', () => {
    expect(chordPcs('G7')).toEqual([7, 11, 2, 5]);
    expect(chordPcs('Am7b5')).toEqual([9, 0, 3, 7]);
  });

  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, only chord tones, with root, third and seventh', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets).map((m) => midiToNote(m, { prefer: 'sharps' }))).toEqual(bar(names));
    const ms = midis(names);
    expect(outside(ms, chordPcs(symbol)), `${shape} has a note outside ${symbol}`).toEqual([]);
    for (const p of requiredPcs(symbol)) expect(ms.some((m) => pc(m) === p), `${shape} leaves out an essential note of ${symbol}`).toBe(true);
    expect(() => buildVoicing(symbol, frets), `${shape}: the guitar engine accepts it as ${symbol}`).not.toThrow();
  });

  it('every chord event with a shape uses one from the table', async () => {
    for (const id of IDS) {
      const song = await load(id);
      for (const c of song.chords) {
        if (!c.voicing) continue;
        expect(Object.keys(SHAPES), `${id} bar ${c.bar + 1}`).toContain(`${c.symbol}=${shapeText(c.voicing)}`);
      }
    }
  });

  it('every song is in its plan and at the plan level', async () => {
    for (const id of IDS) {
      const song = await load(id);
      expect(songEntry(id)?.plan).toBe(id);
      expect(song.meta.difficulty).toBe(songEntry(id)?.level);
    }
  });
});

// ---------------------------------------------------------------- reading in seventh position
describe('batch 15: st-read-seventh-position', () => {
  /** The melody, written out from the composition plan: G major in 4/4, then E minor in 6/8. */
  const TUNE = [
    'G3 B3 D4 G4 B4 A4 G4', 'C5 B4 G4 E4', 'A4 B4 C5 B4 A4 E4 A4 C5', 'D5 A4 F#4 D4',
    'D3 G3 B3 D4 G4 B4 D5', 'E4 F#4 G4 A4 B4 C5 B4 A4 G4 E4', 'C5 B4 A4 F#4 A4 C5', 'B4 A4 F#4 G4',
    'E3 G3 B3 E4 B3', 'A3 C4 E4 A4', 'F#4 D#4 B3 A3 B3 D#4 F#4 A4', 'G4 F#4 E4',
    'C4 E4 G4 C5 B4', 'A4 B4 C5 B4 A4 E4 C4', 'B2 F#3 A3 B3 D#4 F#4', 'E4 B3 E3',
  ];
  const CHORDS = ['G', 'C', 'Am', 'D', 'G', 'Em', 'Am|D', 'G', 'Em', 'Am', 'B7', 'Em', 'C', 'Am', 'B7', 'Em'];

  it('reads the melody written out for it, over the planned chords', async () => {
    const song = await load('st-read-seventh-position');
    expect(song.bars.length).toBe(16);
    expect(tokensByBar(played(song, 'Melody'), 16)).toEqual(TUNE.map(bar));
    const byBar = CHORDS.map((_, i) => song.chords.filter((c) => c.bar === i).map((c) => c.symbol).join('|'));
    expect(byBar).toEqual(CHORDS);
  });

  it('is 4/4 in G major for bars 1-8 and 6/8 in E minor for bars 9-16, the eighth note unchanged', async () => {
    const song = await load('st-read-seventh-position');
    expect(song.bars.slice(0, 8).every((b) => b.time.numerator === 4 && b.time.denominator === 4)).toBe(true);
    expect(song.bars.slice(8).every((b) => b.time.numerator === 6 && b.time.denominator === 8)).toBe(true);
    expect(song.key).toMatch(/^G/);
    expect(song.bars[8].key).toMatch(/^Em|^E minor/);
    expect(song.tempo).toHaveLength(1);
    const beats = played(song, 'Melody').filter((b) => b.midis.length);
    expect(outside(beats.filter((b) => b.bar < 8).flatMap((b) => b.midis), scalePcs('G', 'major'))).toEqual([]);
    expect(outside(beats.filter((b) => b.bar >= 8).flatMap((b) => b.midis), scalePcs('E', 'harmonic-minor').concat(scalePcs('E', 'minor')))).toEqual([]);
    // D# (the leading note) only over B7, always on string 3 fret 8.
    const sharps = beats.filter((b) => pc(b.midis[0]) === 3);
    expect(sharps.length).toBeGreaterThanOrEqual(3);
    for (const b of sharps) {
      expect(b.chord, `bar ${b.bar + 1}`).toBe('B7');
      expect(`${b.frets[0].string}:${b.frets[0].fret}`).toBe('3:8');
    }
  });

  it('keeps the hand in seventh position: frets 7-10 only, each finger on its own fret, all six strings', async () => {
    const beats = played(await load('st-read-seventh-position'), 'Melody').filter((b) => b.midis.length);
    for (const b of beats) {
      const f = b.frets[0];
      expect(f.fret >= 7 && f.fret <= 10, `bar ${b.bar + 1}: fret ${f.fret}`).toBe(true);
      if (typeof f.finger === 'number') expect(f.finger, `bar ${b.bar + 1}: ${f.string}:${f.fret}`).toBe(f.fret - 6);
    }
    expect(new Set(beats.map((b) => b.frets[0].string))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    const ms = beats.flatMap((b) => b.midis);
    expect([Math.min(...ms), Math.max(...ms)].map((m) => midiToNote(m))).toEqual(['B2', 'D5']);
    expect(beats.filter((b) => typeof b.frets[0].finger === 'number').length).toBeGreaterThanOrEqual(15);
  });

  it('has sixteenths in bars 3, 6, 11, 14 and 15, a dotted eighth, and chord tones (or steps) on the strong beats', async () => {
    const song = await load('st-read-seventh-position');
    const beats = played(song, 'Melody');
    expect([...new Set(beats.filter((b) => b.duration === 240).map((b) => b.bar + 1))]).toEqual([3, 6, 11, 14, 15]);
    expect(beats.some((b) => b.duration === 720)).toBe(true);
    const strong = (b: Played) => (b.bar < 8 ? beats13(b) : b.inBar === 0 || b.inBar === 1440);
    expect(strongBeatProblems(beats, strong)).toEqual([]);
    const teacher = played(song, 'Teacher');
    expect(new Set(teacher.filter((b) => b.slash).map((b) => b.bar)).size).toBe(16);
  });

  it('estimates within two levels below the plan (7): the reading, not the hands, is the hard part', async () => {
    // The estimate sees single notes at 76 bpm in one position with some sixteenths (about 5);
    // what makes it level 7 is reading in a new position and the change from 4/4 to 6/8.
    const est = estimate(await load('st-read-seventh-position'), 'Melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(5);
    expect(est.level).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------- solea compas
describe('batch 15: st-solea-compas', () => {
  const E_CHORD = 'E2 B2 E3 G#3 B3 E4';
  const F_CHORD = 'F3 A3 C4 F4';
  /** The falseta (bars 17-24), written out from the composition plan. */
  const FALSETA = [
    'E3 F3 G3 F3 E3', 'D3 E3 F3 E3 B2', 'F2 A2 C3 F3', 'E3 F3 E3 B2',
    'E3 G3 A3 G3 B3', 'C4 B3 A3 G3 E3', 'F3 A3 G3 F3', E_CHORD.replace(/ /g, '+'),
  ];
  /** Count of the 12-beat cycle (1-12) for a beat on a quarter. */
  const count = (b: Played) => (b.bar % 4) * 3 + b.inBar / 960 + 1;

  it('is 24 bars of 3/4: four cycles of compas, then two cycles of falseta', async () => {
    const song = await load('st-solea-compas');
    expect(song.bars.length).toBe(24);
    expect(song.bars.every((b) => b.time.numerator === 3 && b.time.denominator === 4)).toBe(true);
    expect(song.sections.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual(['Compas:0-16', 'Falseta:16-24']);
  });

  it('accents 3, 6, 8, 10 and 12 in every cycle (the last cycle closes on 10)', async () => {
    const beats = played(await load('st-solea-compas'), 'Your part');
    for (let cycle = 0; cycle < 6; cycle++) {
      const accents = beats.filter((b) => Math.floor(b.bar / 4) === cycle && b.frets.some((f) => f.accent)).map(count);
      expect(accents, `cycle ${cycle + 1}`).toEqual(cycle === 5 ? [3, 6, 8, 10] : [3, 6, 8, 10, 12]);
      // Every accent falls on a count (a quarter-note beat), never between them.
      for (const b of beats.filter((x) => Math.floor(x.bar / 4) === cycle && x.frets.some((f) => f.accent))) expect(b.inBar % 960).toBe(0);
    }
  });

  it('plays a rasgueado on each accent of the compas and one thumb stroke on every other count', async () => {
    const beats = played(await load('st-solea-compas'), 'Your part').filter((b) => b.bar < 16);
    for (let barIndex = 0; barIndex < 16; barIndex++) {
      for (let q = 0; q < 3; q++) {
        const inBeat = beats.filter((b) => b.bar === barIndex && b.inBar >= q * 960 && b.inBar < (q + 1) * 960);
        const c = barIndex % 4 * 3 + q + 1;
        if ([3, 6, 8, 10, 12].includes(c)) {
          // Four sixteenth downstrokes: the full chord (accented), then three strums.
          expect(inBeat.map((b) => b.duration), `bar ${barIndex + 1} count ${c}`).toEqual([240, 240, 240, 240]);
          expect(inBeat[0].frets.every((f) => f.accent)).toBe(true);
          expect(inBeat[0].stroke).toBe('down');
          expect(inBeat.slice(1).every((b) => b.slash && b.stroke !== 'up')).toBe(true);
          expect(inBeat[0].token).toBe(canon((inBeat[0].chord === 'F' ? F_CHORD : E_CHORD).replace(/ /g, '+')));
        } else {
          expect(inBeat.map((b) => `${b.duration}:${b.slash}`), `bar ${barIndex + 1} count ${c}`).toEqual(['960:true']);
        }
      }
    }
  });

  it('is E on counts 1-6, F on 7-9 and E on 10-12, with the planned shapes', async () => {
    const song = await load('st-solea-compas');
    const beats = played(song, 'Your part').filter((b) => b.bar < 16 && b.inBar % 960 === 0);
    for (const b of beats) {
      const c = count(b);
      expect(`${b.chord}=${b.voicing}`, `bar ${b.bar + 1} count ${c}`).toBe(c >= 7 && c <= 9 ? 'F=xx3211' : 'E=022100');
    }
  });

  it('closes with a falseta in E Phrygian, thumb-picked, accented notes in the chord, ending on E on count 10', async () => {
    const song = await load('st-solea-compas');
    const beats = played(song, 'Your part').filter((b) => b.bar >= 16);
    expect(notesByBar(beats, 24).slice(16)).toEqual(FALSETA.map(bar));
    const single = beats.filter((b) => b.midis.length === 1);
    expect(outside(single.flatMap((b) => b.midis), scalePcs('E', 'phrygian'))).toEqual([]);
    expect(scalePcs('E', 'phrygian').slice().sort()).toEqual(scalePcs('A', 'minor').slice().sort());
    expect(single[0].frets[0].pluck).toBe('p');
    // Accented notes and every note on count 1 or 7 belong to the chord (or step to it).
    expect(strongBeatProblems(beats, (b) => b.frets.some((f) => f.accent) || b.inBar === 0)).toEqual([]);
    const last = beats.at(-1)!;
    expect([last.bar, last.inBar, last.duration, count(last)]).toEqual([23, 0, 2880, 10]);
    expect(last.frets.every((f) => f.accent)).toBe(true);
    // The falseta stays in first position, on strings 2 to 6.
    expect(Math.max(...single.flatMap((b) => b.frets.map((f) => f.fret)))).toBeLessThanOrEqual(3);
    expect(new Set(single.map((b) => b.frets[0].string))).toEqual(new Set([2, 3, 4, 5, 6]));
  });

  it('estimates within two levels below the plan (7): the cycle, not the hands, is the hard part', async () => {
    // The estimate sees sixteenth-note strokes on E and F (about 5); what makes it level 7 is
    // holding a 12-count cycle whose accents cross the bar lines. Gap note (integration pass 2): it
    // used to read 6 because the F was scored by its symbol as the full barre; the core now scores
    // the small F the song writes (xx3211), the better estimate, 5.
    const est = estimate(await load('st-solea-compas'), 'Your part');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(5);
    expect(est.level).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------- DADGAD air
describe('batch 15: st-dadgad-air', () => {
  /** Every beat of the air, written out from the composition plan (bass and tune together). */
  const AIR = [
    'D2+A3 D4 E4', 'D3+F#4 G4 F#4 E4 D4', 'G2+B3 D4 G4', 'A2+E4 C#4',
    'D2+A3 D4 E4', 'D3+F#4 G4 A4', 'G3+B4 A4 F#4 A2+E4', 'D2+F#3+A3+D4',
    'B2+B4 A4 F#4', 'G3+G4 B4 D5', 'D2+A4 B4 A4 F#4 E4', 'A2+C#4+E4',
    'B2+D4 F#4 B4', 'G3+G4 F#4 E4', 'A2+G4 E4 C#4', 'D2+F#3+A3+D4',
  ];
  const CHORDS = ['D', '', 'G', 'A', 'D', '', 'G|A', 'D', 'Bm', 'G', 'D', 'A', 'Bm', 'G', 'A7', 'D'];

  it('is tuned D A D G A D, low to high', async () => {
    const song = await load('st-dadgad-air');
    expect(song.tuning).toEqual(midis('D2 A2 D3 G3 A3 D4'));
    expect(song.capo).toBe(0);
  });

  it('plays the air written out for it, every fret read in DADGAD', async () => {
    const song = await load('st-dadgad-air');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 3 && b.time.denominator === 4)).toBe(true);
    expect(tokensByBar(played(song, 'Melody'), 16)).toEqual(AIR.map(bar));
    const byBar = CHORDS.map((_, i) => song.chords.filter((c) => c.bar === i).map((c) => c.symbol).join('|'));
    expect(byBar).toEqual(CHORDS);
  });

  it('would be wrong in standard tuning: the same frets give other notes', async () => {
    const song = await load('st-dadgad-air');
    const beats = played(song, 'Melody').filter((b) => b.midis.length);
    const inStandard = beats.flatMap((b) => b.frets.map((f) => STANDARD[6 - f.string] + f.fret));
    const differs = inStandard.filter((m, i) => m !== beats.flatMap((b) => b.frets.map((f) => song.tuning[6 - f.string] + f.fret))[i]).length;
    expect(differs).toBeGreaterThan(10);
  });

  it('is in D major, chord tones on every downbeat, with open-string drones and ringing notes', async () => {
    const beats = played(await load('st-dadgad-air'), 'Melody');
    const notes = beats.filter((b) => b.midis.length);
    expect(outside(notes.flatMap((b) => b.midis), scalePcs('D', 'major'))).toEqual([]);
    expect(strongBeatProblems(beats, beat1)).toEqual([]);
    // A bass under the tune on the first beat of every bar, an open string in most bars.
    const downbeats = notes.filter((b) => b.inBar === 0);
    expect(downbeats.length).toBe(16);
    expect(downbeats.every((b) => b.midis.length >= 2)).toBe(true);
    const openBass = downbeats.filter((b) => b.frets.some((f) => f.fret === 0 && f.string >= 3));
    expect(openBass.length).toBeGreaterThanOrEqual(11);
    expect(downbeats.filter((b) => b.frets.some((f) => f.letRing)).length).toBe(16);
    // Ends on D, with D in the bass.
    const last = notes.at(-1)!;
    expect(pc(Math.min(...last.midis))).toBe(2);
    expect(pc(Math.max(...last.midis))).toBe(2);
  });

  it('uses the ornaments it promises: hammer-on and pull-off triplets, slides and a harmonic at fret 12 sounding D5', async () => {
    const beats = played(await load('st-dadgad-air'), 'Melody').filter((b) => b.midis.length);
    const frets = beats.flatMap((b) => b.frets);
    expect(frets.filter((f) => f.legato === 'hammer').length).toBeGreaterThanOrEqual(3);
    expect(frets.filter((f) => f.legato === 'pull').length).toBeGreaterThanOrEqual(5);
    expect(frets.filter((f) => f.slide).length).toBe(2);
    const harm = beats.filter((b) => b.frets.some((f) => f.harmonic === 'natural'));
    expect(harm.map((b) => `${b.bar + 1}:${b.frets[0].string}:${b.frets[0].fret}=${b.token}`)).toEqual(['10:1:12=D5']);
    expect(beats.some((b) => b.tuplet)).toBe(true);
    // No fretted note above fret 10 except the harmonic.
    expect(Math.max(...frets.filter((f) => !f.harmonic).map((f) => f.fret))).toBe(10);
  });

  it('estimates within three levels below the plan (7): the estimate cannot see the new tuning', async () => {
    // A slow air of single notes and drones estimates about 5; the level-7 demands are a
    // retuned neck where every familiar fret is a different note, and the ringing touch.
    const est = estimate(await load('st-dadgad-air'), 'Melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(4);
    expect(est.level).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------- open G slide blues
describe('batch 15: st-open-g-slide', () => {
  const SLIDE = [
    'G4+B4+D5 F5 D5 B4', 'Bb4 B4 D5 B4 G4', 'G4+B4+D5 D5 B4 G4', 'D5 F5 D5 B4 F4',
    'C4+E4+G4 Bb4 G4 E4', 'E4 G4 Bb4 G4 C4+E4+G4', 'G4+B4+D5 F5 D5', 'Bb4 B4 G4 F4 G4',
    'D4+F#4+A4 C5 A4 F#4', 'C4+E4+G4 Bb4 G4 E4', 'G4+B4+D5 F5 D5 B4 G4', 'A4 C5 A4 F#4 D4+F#4+A4',
    'D3+G3+D4+G4+B4+D5',
  ];
  const BASS_LINE = [
    'G1 B1 D2 E2', 'G2 E2 D2 B1', 'G1 B1 D2 E2', 'G2 F2 D2 B1',
    'C2 E2 G2 A2', 'Bb2 A2 G2 E2', 'G1 B1 D2 E2', 'G2 E2 D2 C#2',
    'D2 F#2 A2 B2', 'C2 E2 G2 E2', 'G1 B1 D2 E2', 'D2 F#2 A2 C3', 'G1',
  ];
  const FORM = ['G7', 'G7', 'G7', 'G7', 'C7', 'C7', 'G7', 'G7', 'D7', 'C7', 'G7', 'D7', 'G'];

  it('is tuned D G D G B D, low to high, and plays the 12-bar form plus an ending bar', async () => {
    const song = await load('st-open-g-slide');
    expect(song.tuning).toEqual(midis('D2 G2 D3 G3 B3 D4'));
    expect(song.bars.length).toBe(13);
    const atBar = FORM.map((_, i) => flattenSong(song).chordAt(flattenSong(song).bars[i].start)?.symbol);
    expect(atBar).toEqual(FORM);
  });

  it('plays the slide part written out for it, every fret read in open G', async () => {
    const song = await load('st-open-g-slide');
    expect(tokensByBar(played(song, 'Your slide'), 13)).toEqual(SLIDE.map(bar));
  });

  it('slides into whole chords at fret 12 (G), 5 (C) and 7 (D), each a plain major triad', async () => {
    const beats = played(await load('st-open-g-slide'), 'Your slide').filter((b) => b.midis.length >= 3);
    const want: Record<number, string> = { 12: 'G', 5: 'C', 7: 'D' };
    // Bars 1, 3, 5, 6, 7, 9, 10, 11, 12 and the ending.
    expect(beats.map((b) => b.bar + 1)).toEqual([1, 3, 5, 6, 7, 9, 10, 11, 12, 13]);
    for (const b of beats) {
      const fret = b.frets[0].fret;
      expect(b.frets.every((f) => f.fret === fret && !!f.slideIn), `bar ${b.bar + 1}: one fret, slid into`).toBe(true);
      expect(Object.keys(want).map(Number)).toContain(fret);
      expect([...new Set(b.midis.map(pc))].sort((x, y) => x - y)).toEqual([...chordPcs(want[fret])].sort((x, y) => x - y));
      expect(b.frets.every((f) => f.vibrato)).toBe(true);
    }
    expect(new Set(beats.map((b) => b.frets[0].fret))).toEqual(new Set([12, 5, 7]));
    // Bar 10 slides down into C from above; the last bar slides all six strings into G.
    expect(beats.find((b) => b.bar === 9)!.frets.every((f) => f.slideIn === 'above')).toBe(true);
    expect(beats.at(-1)!.frets.length).toBe(6);
  });

  it('keeps the single-note melody on strings 1-3, in the chord in force or the blue note sliding up to B', async () => {
    const beats = played(await load('st-open-g-slide'), 'Your slide');
    const single = beats.filter((b) => b.midis.length === 1);
    expect(single.every((b) => b.frets[0].string <= 3)).toBe(true);
    single.forEach((b) => {
      if (chordPcs(b.chord!).includes(pc(b.midis[0]))) return;
      // Bb over G7: the blue note, always followed by B slid into on the same string.
      const next = single[single.indexOf(b) + 1];
      expect(`${b.chord} ${midiToNote(b.midis[0], { prefer: 'flats' })}`, `bar ${b.bar + 1}`).toBe('G7 Bb4');
      expect(next.token).toBe('B4');
      expect(next.frets[0].slide).toBe('up');
      expect(next.frets[0].string).toBe(b.frets[0].string);
    });
    expect(strongBeatProblems(beats, beats13)).toEqual([]);
    expect(single.filter((b) => b.frets[0].slide).length).toBeGreaterThanOrEqual(12);
  });

  it('has a walking bass in the right places, chord tones on beats 1 and 3', async () => {
    const song = await load('st-open-g-slide');
    const bassTrack = song.tracks.find((t) => t.name === 'Bass')!;
    expect(bassTrack.role).toBe('bass');
    expect(bassTrack.tuning).toEqual(BASS);
    const beats = played(song, 'Bass');
    expect(tokensByBar(beats, 13)).toEqual(BASS_LINE.map(bar));
    expect(strongBeatProblems(beats, beats13)).toEqual([]);
  });

  it('estimates within one level of the plan (7)', async () => {
    const est = estimate(await load('st-open-g-slide'), 'Your slide');
    expect(Math.abs(est.level - 7), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- sweep picking
describe('batch 15: st-arpeggio-sweep', () => {
  const AM3 = 'A4 C5 E5 C5 A4';
  const C3 = 'G4 C5 E5 C5 G4';
  const AM5 = 'A3 E4 A4 C5 E5 A5 E5 C5 A4 E4 A3';
  const SWEEPS = [
    `${AM3} ${C3}`, `${C3} ${AM3}`, AM5, `${C3} ${AM3}`,
    `${AM5} ${AM5}`, `${C3} ${C3} ${AM3} ${AM3}`, `${AM5} ${AM5}`, 'A3 E4 A4 C5 E5 A5',
  ];
  /** The three shapes of the plan, string:fret. */
  const SHAPE_FRETS: Record<string, string[]> = {
    am3: ['3:14', '2:13', '1:12'],
    c3: ['3:12', '2:13', '1:12'],
    am5: ['5:12', '4:14', '3:14', '2:13', '1:12', '1:17'],
  };

  it('plays the arpeggios written out for it', async () => {
    const song = await load('st-arpeggio-sweep');
    expect(song.bars.length).toBe(8);
    expect(notesByBar(played(song, 'Your sweeps'), 8)).toEqual(SWEEPS.map(bar));
  });

  it('uses only the plan shapes: every note of a group of beats belongs to one of them', async () => {
    const beats = played(await load('st-arpeggio-sweep'), 'Your sweeps').filter((b) => b.midis.length);
    const allowed = new Set(Object.values(SHAPE_FRETS).flat());
    for (const b of beats) expect(allowed.has(`${b.frets[0].string}:${b.frets[0].fret}`), `bar ${b.bar + 1}`).toBe(true);
    // Each beat (quarter) holds one shape only.
    const byBeat = new Map<string, Set<string>>();
    for (const b of beats) {
      const key = `${b.bar}:${Math.floor(b.inBar / 960)}`;
      const set = byBeat.get(key) ?? new Set<string>();
      set.add(`${b.frets[0].string}:${b.frets[0].fret}`);
      byBeat.set(key, set);
    }
    for (const [key, set] of byBeat) {
      const fits = Object.values(SHAPE_FRETS).some((s) => [...set].every((x) => s.includes(x)));
      expect(fits, `beat ${key}: ${[...set].join(' ')}`).toBe(true);
    }
    expect(beats.every((b) => b.midis.every((m) => chordPcs(b.chord!).includes(pc(m))))).toBe(true);
  });

  it('sweeps: one stroke per direction, each picked note on the next string, the top A by hammer-on and pull-off', async () => {
    const beats = played(await load('st-arpeggio-sweep'), 'Your sweeps').filter((b) => b.midis.length);
    let direction: 'down' | 'up' | undefined;
    let last: Played | undefined;
    for (const b of beats) {
      const f = b.frets[0];
      if (f.legato) {
        // The legato notes are the A at fret 17 and the E back at fret 12 on string 1.
        expect(`${f.string}:${f.fret}:${f.legato}`).toMatch(/^1:(17:hammer|12:pull)$/);
        last = b;
        continue;
      }
      if (b.stroke) direction = b.stroke;
      if (last && last.bar === b.bar && !b.stroke) {
        // Inside a sweep the pick moves to the neighbouring string: towards string 1 down, away from it up.
        expect(last.frets[0].string - f.string, `bar ${b.bar + 1} tick ${b.inBar}`).toBe(direction === 'down' ? 1 : -1);
      }
      last = b;
    }
    expect(beats.filter((b) => b.frets[0].fret === 17).every((b) => b.frets[0].legato === 'hammer')).toBe(true);
    // Once in bar 3, twice in bars 5 and 7, once in bar 8.
    expect(beats.filter((b) => b.frets[0].fret === 17).map((b) => b.bar + 1)).toEqual([3, 5, 5, 7, 7, 8]);
    expect(beats.flatMap((b) => b.frets).some((f) => f.letRing)).toBe(false);
  });

  it('is in triplets in bars 1-4 and 8, sextuplets in bars 5-7, and ends holding the top A', async () => {
    const beats = played(await load('st-arpeggio-sweep'), 'Your sweeps');
    for (const b of beats.filter((x) => x.midis.length)) {
      const allowed = b.bar >= 4 && b.bar <= 6 ? [160, 320] : [320, 640];
      expect(allowed, `bar ${b.bar + 1}`).toContain(b.duration);
      expect(b.tuplet).toBe(true);
    }
    const end = beats.at(-1)!;
    expect([end.bar, end.inBar, end.duration, end.token]).toEqual([7, 1920, 1920, 'tie']);
  });

  it('marks the fingers of each shape the first time: 3-2-1 for Am, 1-2-1 for C, 1-3-3-2-1-4 for the five strings', async () => {
    const beats = played(await load('st-arpeggio-sweep'), 'Your sweeps').filter((b) => b.bar < 3 && b.midis.length);
    const fingers = new Map<string, number>();
    for (const b of beats) if (typeof b.frets[0].finger === 'number') fingers.set(`${b.frets[0].string}:${b.frets[0].fret}`, b.frets[0].finger);
    expect(Object.fromEntries(fingers)).toEqual({ '3:14': 3, '2:13': 2, '1:12': 1, '3:12': 1, '5:12': 1, '4:14': 3, '1:17': 4 });
  });

  it('estimates within one level of the plan (8)', async () => {
    const est = estimate(await load('st-arpeggio-sweep'), 'Your sweeps');
    expect(Math.abs(est.level - 8), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- Locrian
describe('batch 15: st-mode-locrian', () => {
  const TUNE = [
    'A4 C5 A4 Eb4', 'D4 Eb4 F4 G4 A4 G4', 'Bb4 A4 F4', 'D4 F4 A4 F4 D4 Bb3',
    'C4 A3 C4 Eb4', 'G4 F4 Eb4 D4 C4 A3', 'Bb3 D4 F4 Bb4', 'A4 Bb4 C5 Bb4 A4 F4',
    'Eb4 C4 D4 Eb4', 'G4 A4 G4 Eb4 C4 A3', 'Bb3 D4 F4 A4 Bb4', 'C5 Bb4 A4 F4 D4',
    'C4 Eb4 G4 A4 G4 Eb4', 'Eb4 D4 C4', 'Bb3 D4 F4 A4 Bb4', 'A4',
  ];
  const VAMP = ['0:0:Am7b5=x0101x', '2:0:Bbmaj7=x1323x', '4:0:Am7b5=x0101x', '6:0:Bbmaj7=x1323x', '8:0:Am7b5=x0101x', '10:0:Bbmaj7=x1323x', '12:0:Am7b5=x0101x', '14:0:Bbmaj7=x1323x', '15:0:Am7b5=x0101x'];
  const LANDINGS = ['1:3', '3:1', '5:3', '7:1', '7:3', '9:1', '10:3', '11:3', '14:1', '15:1'];

  it('plays the melody written out for it, over the vamp changing every two bars', async () => {
    const song = await load('st-mode-locrian');
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 4 && b.time.denominator === 4)).toBe(true);
    expect(tokensByBar(played(song, 'Your melody'), 16)).toEqual(TUNE.map(bar));
    expect(song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}=${shapeText(c.voicing!)}`)).toEqual(VAMP);
  });

  it('stays in A Locrian, the only mode on A without E (its fifth is flat); Bb it shares only with Phrygian', async () => {
    const song = await load('st-mode-locrian');
    const pcs = scalePcs('A', 'locrian');
    expect(pcs.map((p) => midiToNote(60 + ((p - 0 + 12) % 12), { prefer: 'flats' }).replace(/\d/, ''))).toEqual(['A', 'Bb', 'C', 'D', 'Eb', 'F', 'G']);
    expect(outside(played(song, 'Your melody').flatMap((b) => b.midis), pcs)).toEqual([]);
    for (const c of song.chords) expect(outside(chordPcs(c.symbol).map((p) => p + 60), pcs), c.symbol).toEqual([]);
    expect(pcs).not.toContain(4);
    for (const mode of ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor']) expect(scalePcs('A', mode), mode).toContain(4);
    for (const mode of ['major', 'dorian', 'lydian', 'mixolydian', 'minor']) expect(scalePcs('A', mode), mode).not.toContain(10);
    expect(scalePcs('A', 'phrygian')).toContain(10);
    // The home chord is half-diminished: its fifth is Eb, a diminished fifth above A.
    expect((chordPcs('Am7b5')[2] - chordPcs('Am7b5')[0] + 12) % 12).toBe(6);
    expect(songEntry('st-mode-locrian')!.about).toMatch(/diminished/);
  });

  it('lands on a colour note (Eb or Bb) on a strong beat ten times, each over a chord that holds it', async () => {
    const beats = played(await load('st-mode-locrian'), 'Your melody');
    const landings = beats.filter((b) => b.midis.length === 1 && [3, 10].includes(pc(b.midis[0])) && beats13(b) && b.duration >= 960);
    expect(landings.map((b) => `${b.bar + 1}:${b.inBar / 960 + 1}`)).toEqual(LANDINGS);
    for (const b of landings) expect(chordPcs(b.chord!), `bar ${b.bar + 1}`).toContain(pc(b.midis[0]));
    expect(landings.filter((b) => pc(b.midis[0]) === 3).length).toBeGreaterThanOrEqual(4);
    expect(landings.filter((b) => pc(b.midis[0]) === 10).length).toBeGreaterThanOrEqual(4);
  });

  it('puts chord tones (or steps to them) on beats 1 and 3, and ends with Bb falling to A over Am7b5', async () => {
    const beats = played(await load('st-mode-locrian'), 'Your melody');
    expect(strongBeatProblems(beats, beats13)).toEqual([]);
    const notes = beats.filter((b) => b.midis.length);
    const [before, last] = notes.slice(-2);
    expect([midiToNote(before.midis[0], { prefer: 'flats' }), midiToNote(last.midis[0])]).toEqual(['Bb4', 'A4']);
    expect([last.bar, last.inBar, last.chord]).toEqual([15, 0, 'Am7b5']);
  });

  it('uses quarters and eighths (long notes only for held colour notes) in fifth position', async () => {
    const beats = played(await load('st-mode-locrian'), 'Your melody').filter((b) => b.midis.length);
    expect(beats.every((b) => [480, 960, 1920, 3840].includes(b.duration))).toBe(true);
    expect(beats.filter((b) => b.duration <= 960).length / beats.length).toBeGreaterThan(0.85);
    const long = beats.filter((b) => b.duration > 960);
    expect(long.every((b) => [3, 10, 9].includes(pc(b.midis[0])))).toBe(true);
    const frets = beats.flatMap((b) => b.frets);
    expect([Math.min(...frets.map((f) => f.fret)), Math.max(...frets.map((f) => f.fret))]).toEqual([5, 8]);
    for (const f of frets) if (typeof f.finger === 'number') expect(f.finger, `${f.string}:${f.fret}`).toBe(f.fret - 4);
    // Eb always on string 3 fret 8; Bb on string 1 fret 6 or string 4 fret 8.
    expect(new Set(beats.filter((b) => pc(b.midis[0]) === 3).map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['3:8']));
    expect(new Set(beats.filter((b) => pc(b.midis[0]) === 10).map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['1:6', '4:8']));
  });

  it('has a backing part strumming in every bar', async () => {
    const song = await load('st-mode-locrian');
    expect(song.tracks.find((t) => t.name === 'Backing')?.role).toBe('rhythm');
    expect(new Set(played(song, 'Backing').filter((b) => b.slash).map((b) => b.bar)).size).toBe(16);
  });

  it('estimates well below the plan (8): the difficulty is in the ear and the theory, not the hands', async () => {
    // The plan asks for quarters and eighths over a vamp; in one position with slurs the estimate
    // is about 3-4. What makes this level 8 is hearing and aiming for two unstable colour notes
    // over a home chord that is itself unstable.
    const est = estimate(await load('st-mode-locrian'), 'Your melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------- drop-2 voicings
describe('batch 15: st-jazz-drop2', () => {
  const SOUND: Record<string, string> = {
    Dm7: 'F3 C4 D4 A4', G7: 'F3 B3 D4 G4', Cmaj7: 'E3 B3 C4 G4',
    Gm7: 'Bb3 F4 G4 D5', C7: 'Bb3 E4 G4 C5', Fmaj7: 'A3 E4 F4 C5',
  };
  const PLAN = ['Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7', 'Gm7', 'C7', 'Fmaj7', 'Fmaj7'];
  const BASS_LINE = [
    'D2 F2 A2 G#2', 'G2 F2 D2 B1', 'C2 E2 G2 E2', 'C2 B1 G1 A1',
    'D2 C2 A1 G#1', 'G1 B1 D2 B1', 'C2 D2 E2 G2', 'C2 E2 G2 F#2',
    'G2 F2 D2 C#2', 'C2 E2 G2 E2', 'F2 G2 A2 C3', 'C3 A2 F2 G#2',
    'G2 F2 D2 C#2', 'C2 Bb1 G1 E1', 'F1 A1 C2 E2', 'F1',
  ];

  it('strikes the planned voicing, all four top strings, every time; ii-V-I in C, then in F', async () => {
    const song = await load('st-jazz-drop2');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your comping').filter((b) => b.midis.length);
    for (const b of beats) {
      expect(b.chord, `bar ${b.bar + 1}`).toBe(PLAN[b.bar]);
      expect(b.token, `bar ${b.bar + 1} tick ${b.inBar}`).toBe(canon(SOUND[b.chord!].replace(/ /g, '+')));
      expect(b.frets.map((f) => f.string).sort()).toEqual([1, 2, 3, 4]);
    }
    expect(song.bars[8].key).toMatch(/^F/);
  });

  it('voice-leads by the plan: at each change two voices step down, two stay', async () => {
    const moves = (a: string, b: string) => midis(SOUND[b]).map((m, i) => m - midis(SOUND[a])[i]);
    expect(moves('Dm7', 'G7')).toEqual([0, -1, 0, -2]);   // F stays, C to B, D stays, A to G
    expect(moves('G7', 'Cmaj7')).toEqual([-1, 0, -2, 0]); // F to E, B stays, D to C, G stays
    expect(moves('Gm7', 'C7')).toEqual([0, -1, 0, -2]);
    expect(moves('C7', 'Fmaj7')).toEqual([-1, 0, -2, 0]);
    // Each voice stays on its own string, so the moves are what the hand does.
    const song = await load('st-jazz-drop2');
    const beats = played(song, 'Your comping').filter((b) => b.midis.length);
    for (let i = 1; i < beats.length; i++) {
      const a = beats[i - 1];
      const b = beats[i];
      if (a.chord === b.chord || a.bar === 7) continue;
      for (let s = 1; s <= 4; s++) {
        const fa = a.frets.find((f) => f.string === s)!;
        const fb = b.frets.find((f) => f.string === s)!;
        expect(Math.abs(fb.fret - fa.fret), `bar ${b.bar + 1} string ${s}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('moves every shape up exactly 5 frets for F', () => {
    const pairs: Array<[string, string]> = [['Dm7=xx3535', 'Gm7=x-x-8-10-8-10'], ['G7=xx3433', 'C7=xx8988'], ['Cmaj7=xx2413', 'Fmaj7=xx7968']];
    for (const [c, f] of pairs) {
      const a = shapeSounds(c.split('=')[1]);
      const b = shapeSounds(f.split('=')[1]);
      expect(b).toEqual(a.map((m) => m + 5));
    }
  });

  it('plays half notes first, then the Charleston (1 and the swung and of 2, held)', async () => {
    const beats = played(await load('st-jazz-drop2'), 'Your comping');
    const onsets = (n: number) => beats.filter((b) => b.bar === n && b.midis.length).map((b) => b.inBar);
    for (const n of [0, 1, 2, 8, 9, 10]) expect(onsets(n), `bar ${n + 1}`).toEqual([0, 1920]);
    for (const n of [4, 5, 6, 12, 13, 14]) {
      expect(onsets(n), `bar ${n + 1}`).toEqual([0, 1600]);
      expect(beats.filter((b) => b.bar === n).map((b) => b.token).at(-1)).toBe('tie');
    }
    expect(onsets(3)).toEqual([0]);
    expect(onsets(7)).toEqual([0]);
    expect(beats.filter((b) => b.bar === 15).map((b) => `${b.duration}`)).toEqual(['3840']);
  });

  it('has a walking bass in quarter notes, chord tones on beats 1 and 3', async () => {
    const song = await load('st-jazz-drop2');
    expect(song.tracks.find((t) => t.name === 'Teacher bass')?.tuning).toEqual(BASS);
    const beats = played(song, 'Teacher bass');
    expect(tokensByBar(beats, 16)).toEqual(BASS_LINE.map(bar));
    expect(strongBeatProblems(beats, beats13)).toEqual([]);
  });

  it('estimates below the plan (8): it scores the drop-2 grips played, and the swung pushes', async () => {
    // Gap note (integration pass 2): the estimate used to rate Dm7, G7 and Cmaj7 as their easy open
    // shapes (4). It now scores the drop-2 grips the comping holds and counts the Charleston push
    // held across beat 3 as syncopation: 5, a better estimate. The level-8 demands it still cannot
    // see are the voice leading between the grips and the swing feel.
    const song = await load('st-jazz-drop2');
    const est = estimate(song, 'Your comping');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(5);
    expect(est.level).toBeLessThanOrEqual(8);
    // The grips played are harder than the open shapes, and the chord factor now reflects them.
    expect(buildVoicing('Cmaj7', 'xx2413').difficulty).toBeGreaterThan(chordDifficulty('Cmaj7') + 2);
    expect(est.factors.chords, JSON.stringify(est)).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------- minor ii-V-i
describe('batch 15: st-jazz-minor-ii-v', () => {
  const B_A = 'B2+F3+A3+D4 F3+A3+D4 B2 F3+A3+D4';
  const E_B = 'E3 B3+D4+G#4 E3 B3+D4+G#4';
  const A_A = 'A2+A3+C4+G4 A3+C4+G4 E3 A3+C4+G4';
  const A_B = 'A2 A3+C4+G4 E3 A3+C4+G4';
  const COMP = [B_A, E_B, A_A, A_B, B_A, E_B, A_A, A_B, B_A, E_B, A_A, A_B, B_A, E_B, A_A, 'A2+E3+A3+C4+G4'];
  const MELODY = ['D5 C5 B4 F4', 'E4 G#4 B4 D5', 'C5 B4 A4', 'G4', 'B4 A4 F4 D4', 'E4 F4 G#4 A4 B4 G#4', 'A4 C5 B4 G4', 'A4'];

  it('comps the bossa pattern written out for it: Bm7b5, E7, Am7, Am7, four times', async () => {
    const song = await load('st-jazz-minor-ii-v');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your comping');
    expect(notesByBar(beats, 16)).toEqual(COMP.map(bar));
    const plan = ['Bm7b5', 'E7', 'Am7', 'Am7'];
    for (const b of beats) expect(b.chord, `bar ${b.bar + 1}`).toBe(plan[b.bar % 4]);
    // The two-bar rhythm: 1, the and of 2, 3, 4 | 1, 2, 3, the and of 3.
    const ticks = (n: number) => beats.filter((b) => b.bar === n && b.midis.length).map((b) => b.inBar);
    for (let n = 0; n < 15; n++) expect(ticks(n), `bar ${n + 1}`).toEqual(n % 2 === 0 ? [0, 1440, 1920, 2880] : [0, 960, 1920, 2400]);
  });

  it('puts the root in the thumb on beat 1 (and the fifth E on beat 3 of Am7), the rest of the grip in the fingers', async () => {
    const beats = played(await load('st-jazz-minor-ii-v'), 'Your comping').filter((b) => b.midis.length && b.bar < 15);
    for (const b of beats.filter((x) => x.inBar === 0)) expect(pc(b.midis[0]), `bar ${b.bar + 1}`).toBe(chordPcs(b.chord!)[0]);
    for (const b of beats.filter((x) => x.inBar === 1920)) {
      expect(b.midis.length).toBe(1);
      expect(pc(b.midis[0])).toBe(b.chord === 'Am7' ? 4 : chordPcs(b.chord!)[0]);
    }
    // The grips are the plan's: x2323x, xx2434 and xx2213 (with the open A below it).
    const frets = (symbol: string) => [...new Set(beats.filter((b) => b.chord === symbol).flatMap((b) => b.frets.map((f) => `${f.string}:${f.fret}`)))].sort();
    expect(frets('Bm7b5')).toEqual(['2:3', '3:2', '4:3', '5:2']);
    expect(frets('E7')).toEqual(['1:4', '2:3', '3:4', '4:2']);
    expect(frets('Am7')).toEqual(['1:3', '2:1', '3:2', '4:2', '5:0']);
    const first = beats[0];
    expect(first.frets.map((f) => f.pluck)).toEqual(['p', 'i', 'm', 'a']);
  });

  it('plays the 8-bar melody in bars 9-16, after eight bars of rest', async () => {
    const song = await load('st-jazz-minor-ii-v');
    const beats = played(song, 'Melody');
    expect(beats.filter((b) => b.bar < 8).every((b) => b.token === 'r')).toBe(true);
    expect(notesByBar(beats, 16).slice(8)).toEqual(MELODY.map(bar));
  });

  it('uses A harmonic minor over E7 (G#) and the natural minor elsewhere (G)', async () => {
    const beats = played(await load('st-jazz-minor-ii-v'), 'Melody').filter((b) => b.midis.length);
    for (const b of beats) {
      const scale = b.chord === 'E7' ? scalePcs('A', 'harmonic-minor') : scalePcs('A', 'minor');
      expect(outside(b.midis, scale), `bar ${b.bar + 1} over ${b.chord}`).toEqual([]);
    }
    expect(beats.filter((b) => pc(b.midis[0]) === 8).every((b) => b.chord === 'E7')).toBe(true);
    expect(beats.filter((b) => pc(b.midis[0]) === 8).length).toBe(3);
    expect(beats.filter((b) => pc(b.midis[0]) === 7).every((b) => b.chord === 'Am7')).toBe(true);
    // Bar 14 climbs E F G# A B: the step and a half from F to G#.
    const run = beats.filter((b) => b.bar === 13).map((b) => b.midis[0]);
    expect(run[2] - run[1]).toBe(3);
    expect(strongBeatProblems(played(await load('st-jazz-minor-ii-v'), 'Melody'), beats13)).toEqual([]);
  });

  it('keeps the melody in seventh position: frets 7-10, finger = fret - 6', async () => {
    const beats = played(await load('st-jazz-minor-ii-v'), 'Melody').filter((b) => b.midis.length);
    for (const b of beats) {
      const f = b.frets[0];
      expect(f.fret >= 7 && f.fret <= 10, `bar ${b.bar + 1}`).toBe(true);
      expect(f.finger, `bar ${b.bar + 1}: ${f.string}:${f.fret}`).toBe(f.fret - 6);
    }
    // G# is string 2 fret 9, one fret above G on string 2 fret 8.
    expect(new Set(beats.filter((b) => pc(b.midis[0]) === 8).map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['2:9']));
    expect(new Set(beats.filter((b) => pc(b.midis[0]) === 7).map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['2:8']));
  });

  it('estimates well below the plan (8): the estimate rates Am7 and E7 as open chords', async () => {
    const song = await load('st-jazz-minor-ii-v');
    for (const t of ['Your comping', 'Melody']) {
      const est = estimate(song, t);
      expect(est.level, `${t}: ${JSON.stringify(est)}`).toBeGreaterThanOrEqual(3);
      expect(est.level).toBeLessThanOrEqual(8);
    }
    expect(buildVoicing('E7', 'xx2434').difficulty).toBeGreaterThan(chordDifficulty('E7') + 1.5);
  });
});

// ---------------------------------------------------------------- review checks (second pass)
// Added by the independent review of batch 15: what the first pass did not cover, and what the
// review corrected (a fingering that cut off a drone, three learner texts that said something
// the music does not do, and an ornament called by the wrong name).
describe('batch 15 review: st-dadgad-air fingering lets the drones ring', () => {
  /** Fretted notes of the melody in order, with their let-ring flag and finger. */
  async function notes() {
    const song = await load('st-dadgad-air');
    return played(song, 'Melody').filter((b) => b.midis.length).flatMap((b) => b.frets.map((f) => ({ ...f, bar: b.bar, inBar: b.inBar })));
  }

  it('never needs a finger that is holding a ringing note on another string (bars 9 and 13: the low B takes finger 2)', async () => {
    const ns = await notes();
    const problems: string[] = [];
    ns.forEach((n, i) => {
      if (!n.letRing || n.fret === 0 || typeof n.finger !== 'number') return;
      for (const later of ns.slice(i + 1)) {
        if (later.bar !== n.bar) break; // the next bar starts a new drone
        if (later.string === n.string) break; // the ringing note is replaced on its own string
        if (later.finger === n.finger && later.inBar > n.inBar) problems.push(`bar ${n.bar + 1}: finger ${n.finger} holds ${n.string}:${n.fret} and is needed on ${later.string}:${later.fret}`);
      }
    });
    expect(problems).toEqual([]);
    const lowB = ns.filter((n) => n.string === 6 && n.fret === 9);
    expect(lowB.map((n) => `${n.bar + 1}:${n.finger}`)).toEqual(['9:2', '13:2']);
  });

  it('bar 13 is one Bm grip the hand can hold whole (9-x-x-7-9-9 in DADGAD, fingers 2-1-3-4)', () => {
    expect(checkVoicingFingering([9, null, null, 7, 9, 9], [2, null, null, 1, 3, 4])).toEqual([]);
    expect(shapeSounds('9-x-x-7-9-9', midis('D2 A2 D3 G3 A3 D4')).map((m) => midiToNote(m))).toEqual(['B2', 'D4', 'F#4', 'B4']);
  });

  it('names its ornaments for what they are: hammer-on and pull-off triplets, not Celtic rolls', async () => {
    const entry = songEntry('st-dadgad-air')!;
    expect(entry.teaches.join(' ')).not.toMatch(/roll/i);
    // A roll returns to its main note; these figures move on: F# G F# E then D, and A B A F# then E.
    const beats = played(await load('st-dadgad-air'), 'Melody').filter((b) => b.midis.length);
    const tops = (n: number) => beats.filter((b) => b.bar === n - 1).map((b) => midiToNote(Math.max(...b.midis)));
    expect(tops(2)).toEqual(['F#4', 'G4', 'F#4', 'E4', 'D4']);
    expect(tops(11)).toEqual(['A4', 'B4', 'A4', 'F#4', 'E4']);
    for (const n of [2, 11]) expect(beats.filter((b) => b.bar === n - 1 && b.tuplet).length).toBe(3);
  });
});

describe('batch 15 review: the learner texts say what the music does', () => {
  it('st-jazz-drop2: the moving voices step down one or two frets (not "each by one fret")', () => {
    const fretMoves = (a: string, b: string) => {
      const fa = a.split('').slice(2).map(Number);
      const fb = b.split('').slice(2).map(Number);
      return fb.map((f, i) => f - fa[i]);
    };
    // Strings 4, 3, 2, 1.
    expect(fretMoves('xx3535', 'xx3433')).toEqual([0, -1, 0, -2]); // C to B one fret, A to G two
    expect(fretMoves('xx3433', 'xx2413')).toEqual([-1, 0, -2, 0]); // F to E one fret, D to C two
    const about = songEntry('st-jazz-drop2')!.about;
    expect(about).not.toMatch(/each by one fret/);
    expect(about).toMatch(/C to B is one fret, A to G two/);
    expect(about).toMatch(/F to E, D to C/);
  });

  it('st-mode-locrian: Eb is the flat fifth of Am7b5 and Bb the root of Bbmaj7, a half step above A', () => {
    expect((chordPcs('Am7b5')[2] - 9 + 12) % 12).toBe(6);
    expect(chordPcs('Bbmaj7')[0]).toBe(10);
    expect((10 - 9 + 12) % 12).toBe(1);
    const about = songEntry('st-mode-locrian')!.about;
    expect(about).toMatch(/tritone above the A/);
    expect(about).toMatch(/Bb is the root/);
    expect(about).not.toMatch(/hear how strange each one sounds/);
  });

  it('st-jazz-minor-ii-v: the fingers play the chord on 1, the and of 2 and 4, then on 2 and the and of 3', async () => {
    const beats = played(await load('st-jazz-minor-ii-v'), 'Your comping').filter((b) => b.bar < 15 && b.midis.length >= 3);
    for (let n = 0; n < 15; n++) {
      const at = beats.filter((b) => b.bar === n).map((b) => b.inBar / 960 + 1);
      expect(at, `bar ${n + 1}`).toEqual(n % 2 === 0 ? [1, 2.5, 4] : [2, 3.5]);
    }
    const about = songEntry('st-jazz-minor-ii-v')!.about;
    expect(about).toMatch(/with the thumb on 1, then on the "and" of 2 and on 4; in the next bar on 2 and the "and" of 3/);
    expect(about).not.toMatch(/pluck the chord off the beat/);
  });
});
