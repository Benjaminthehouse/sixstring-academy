/**
 * Independent cross-checks for batch 13 of the built-in songs (level-6 original studies):
 * st-pent-connect, st-barre-progression, st-caged-chords, st-mode-ionian, st-mode-dorian,
 * st-mode-mixolydian, st-mode-aeolian, st-chord-melody-1, st-read-fifth-position.
 * (the-entertainer, the tenth id of the batch, was left out: no early edition of Joplin's score
 * could be consulted, and the plan forbids reconstructing it from memory.)
 *
 * The expected notes below were written out by hand as note names from the composition plans,
 * not copied from the tab, so a wrong fret shows up as a wrong note. Each song is parsed with the
 * song core and compared bar by bar; the checks then cover the chord shapes and what they sound,
 * notes on strong beats against the chord in force, the key or mode, the colour notes, the hand
 * positions and fingers, the range, and the difficulty estimate against the plan's level.
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, type Song } from '@/core/song';
import { buildVoicing, scalePatterns } from '@/core/guitar';
import { chordPcs, chroma, midiToNote, noteToMidi, parseChord, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const STANDARD = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];

/** "G2+B2" -> canonical sharps spelling, so comparisons are by pitch, not by spelling. */
function canon(token: string): string {
  if (token === 'r') return 'r';
  return token
    .split('+')
    .map((n) => noteToMidi(n))
    .sort((a, b) => a - b)
    .map((x) => midiToNote(x, { prefer: 'sharps' }))
    .join('+');
}

/** Split a bar written as "E4 D4 C4" into tokens. */
const bar = (s: string): string[] => s.trim().split(/\s+/);

interface Played {
  bar: number;
  inBar: number;
  duration: number;
  token: string;
  midis: number[];
  frets: Array<{ string: number; fret: number; finger?: number | 'T'; slide?: 'up' | 'down'; legato?: 'hammer' | 'pull' }>;
  slash: boolean;
  stroke?: 'down' | 'up';
  chord: string | null;
  voicing: string | null;
  dotted: boolean;
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

/** Every beat of a track (rests included), in order, with what it sounds. */
function played(song: Song, trackName: string): Played[] {
  const track = song.tracks.find((t) => t.name === trackName);
  if (!track) throw new Error(`no track ${trackName}`);
  const tl = flattenSong(song);
  return tl.trackBeats(track.id).map((b) => {
    const start = tl.barAt(b.tick).start;
    const chord = tl.chordAt(b.tick);
    const struck = b.notes.filter((n) => !n.tie);
    const midis = struck.map((n) => n.midi).sort((x, y) => x - y);
    const token = b.source.slash ? 'slash' : midis.length ? midis.map((x) => midiToNote(x, { prefer: 'sharps' })).join('+') : 'r';
    return {
      bar: b.bar,
      inBar: b.tick - start,
      duration: b.duration,
      token,
      midis,
      frets: struck.map((n) => ({ string: n.string, fret: n.fret, finger: n.finger, slide: n.slide, legato: n.legato })),
      slash: !!b.source.slash,
      stroke: b.source.stroke,
      chord: chord?.symbol ?? null,
      voicing: chord?.voicing ? shapeText(chord.voicing) : null,
      dotted: !!b.source.value?.dots,
    };
  });
}

/** The tokens of a note track, bar by bar. */
function tokensByBar(beats: Played[], bars: number): string[][] {
  const out: string[][] = Array.from({ length: bars }, () => []);
  for (const b of beats) out[b.bar].push(b.token);
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
  return [...new Set(midis.filter((m) => !allowed.has(((m % 12) + 12) % 12)).map((m) => midiToNote(m, { prefer: 'sharps' })))];
}

/**
 * Single notes on strong beats must be tones of the chord in force, or a passing or neighbour
 * note: a step (one or two semitones) to the next note, which is a chord tone. Chords struck on a
 * strong beat must be all chord tones.
 */
function strongBeatProblems(beats: Played[], strong: number[] = [0, 1920]): string[] {
  const notes = beats.filter((b) => b.midis.length > 0);
  const problems: string[] = [];
  notes.forEach((b, i) => {
    if (!strong.includes(b.inBar) || !b.chord) return;
    const tones = new Set(chordPcs(b.chord));
    const out = b.midis.filter((m) => !tones.has(m % 12));
    if (!out.length) return;
    const next = notes[i + 1];
    const resolves = b.midis.length === 1 && !!next && next.midis.length === 1 && Math.abs(next.midis[0] - b.midis[0]) <= 2 && tones.has(next.midis[0] % 12);
    if (!resolves) problems.push(`bar ${b.bar + 1} tick ${b.inBar}: ${b.token} is not in ${b.chord} and does not step to a chord tone`);
  });
  return problems;
}

/** Left-hand finger marks that differ from the finger the chord box in force shows for that string and fret. */
function fingerMismatches(beats: Played[]): string[] {
  const out: string[] = [];
  for (const b of beats) {
    if (!b.chord || !b.voicing) continue;
    const v = buildVoicing(b.chord, b.voicing);
    for (const f of b.frets) {
      if (typeof f.finger !== 'number' || f.fret === 0) continue;
      const i = 6 - f.string;
      if (v.frets[i] !== f.fret) continue;
      if (v.fingers[i] !== f.finger) out.push(`bar ${b.bar + 1}: ${b.chord}=${b.voicing} ${f.string}:${f.fret} finger ${f.finger} in the tab, ${v.fingers[i]} in the box`);
    }
  }
  return out;
}

/** Estimated difficulty of a track. */
function estimate(song: Song, trackName: string) {
  const track = song.tracks.find((t) => t.name === trackName)!;
  return estimateDifficulty(song, { track: track.id });
}

// ---------------------------------------------------------------- chord shapes (written out by hand)
/** Every shape used in the batch, with the notes it should sound, low to high. */
const SHAPES: Record<string, string> = {
  'Am7=x02010': 'A2 E3 G3 C4 E4',
  'C=x32010': 'C3 E3 G3 C4 E4',
  'A=x02220': 'A2 E3 A3 C#4 E4',
  'F#m=244222': 'F#2 C#3 F#3 A3 C#4 F#4',
  'D=xx0232': 'D3 A3 D4 F#4',
  'E=022100': 'E2 B2 E3 G#3 B3 E4',
  'C=x35553': 'C3 G3 C4 E4 G4',
  'Am=577555': 'A2 E3 A3 C4 E4 A4',
  'F=133211': 'F2 C3 F3 A3 C4 F4',
  'G=355433': 'G2 D3 G3 B3 D4 G4',
  'C=875558': 'C3 E3 G3 C4 E4 C5',
  'C=8-10-10-9-8-8': 'C3 G3 C4 E4 G4 C5',
  'C=x-x-10-12-13-12': 'C4 G4 C5 E5',
  'C=x-15-14-12-13-12': 'C4 E4 G4 C5 E5',
  'G=320003': 'G2 B2 D3 G3 B3 G4',
  'G=xx5787': 'G3 D4 G4 B4',
  'G=x-10-9-7-8-7': 'G3 B3 D4 G4 B4',
  'G=x-10-12-12-12-10': 'G3 D4 G4 B4 D5',
  'Amaj7=x02120': 'A2 E3 G#3 C#4 E4',
  'Am=x02210': 'A2 E3 A3 C4 E4',
  'C=x32013': 'C3 E3 G3 C4 G4',
  'C=x3201x': 'C3 E3 G3 C4',
  'Am=x07555': 'A2 A3 C4 E4 A4',
  'Am=x0755x': 'A2 A3 C4 E4',
  'F=xx3211': 'F3 A3 C4 F4',
  'F=xx35x5': 'F3 C4 A4',
  'G7=320001': 'G2 B2 D3 G3 B3 F4',
  'G7=32303x': 'G2 B2 F3 G3 D4',
  'G7=323003': 'G2 B2 F3 G3 B3 G4',
  'Em=022003': 'E2 B2 E3 G3 B3 G4',
  'Em=022000': 'E2 B2 E3 G3 B3 E4',
  'Dm=xx0231': 'D3 A3 D4 F4',
  'Dm/F=xx3235': 'F3 A3 D4 A4',
  'Bb=x13331': 'Bb2 F3 Bb3 D4 F4',
  'C7=x32310': 'C3 E3 Bb3 C4 E4',
};

/**
 * Root, third and (for seventh chords) the seventh: a shape may leave out only the fifth. Read
 * root first from the parsed chord, because chordPcs puts a slash chord's bass first (Dm/F: F D A).
 */
function requiredPcs(symbol: string): number[] {
  const pcs = parseChord(symbol)!.notes.map((n) => chroma(n));
  return pcs.length >= 4 ? [pcs[0], pcs[1], pcs[3]] : [pcs[0], pcs[1]];
}

const BATCH = ['st-pent-connect', 'st-barre-progression', 'st-caged-chords', 'st-mode-ionian', 'st-mode-dorian', 'st-mode-mixolydian', 'st-mode-aeolian', 'st-chord-melody-1', 'st-read-fifth-position'];

describe('batch 13: the chord shapes', () => {
  it('reads chord tones root first (the helper below depends on it)', () => {
    expect(chordPcs('G7')).toEqual([7, 11, 2, 5]);
    expect(chordPcs('Am')).toEqual([9, 0, 4]);
  });

  it.each(Object.entries(SHAPES))('%s sounds the notes written out for it, only chord tones, with root and third', (shape, names) => {
    const [symbol, frets] = shape.split('=');
    expect(shapeSounds(frets).map((m) => midiToNote(m, { prefer: 'sharps' }))).toEqual(bar(names).map(canon));
    const midis = bar(names).map((n) => noteToMidi(n));
    expect(outside(midis, chordPcs(symbol)), `${shape} has a note outside ${symbol}`).toEqual([]);
    for (const pc of requiredPcs(symbol)) expect(midis.some((m) => m % 12 === pc), `${shape} leaves out an essential note of ${symbol}`).toBe(true);
    expect(() => buildVoicing(symbol, frets), `${shape}: the guitar engine accepts it as ${symbol}`).not.toThrow();
  });

  it('every chord event in the batch uses a shape from the table', async () => {
    for (const id of BATCH) {
      const song = await load(id);
      for (const c of song.chords) {
        expect(c.voicing, `${id} bar ${c.bar + 1}: ${c.symbol} has no shape`).toBeDefined();
        expect(Object.keys(SHAPES), `${id} bar ${c.bar + 1}`).toContain(`${c.symbol}=${shapeText(c.voicing!)}`);
      }
    }
  });

  it.each(Object.keys(SHAPES))('%s: the symbol names what the grip sounds, bass included', (shape) => {
    // validateSong accepts any chord tones, so a first-inversion grip under a plain symbol
    // (Dm over xx3235, whose lowest note is F) passed it; the engine names the inversion.
    const [symbol, frets] = shape.split('=');
    expect(buildVoicing(symbol, frets).chord, `${shape}: the lowest note is ${midiToNote(shapeSounds(frets)[0])}`).toBe(symbol);
    const bass = parseChord(symbol)!.bass ?? parseChord(symbol)!.root;
    expect(shapeSounds(frets)[0] % 12, `${shape}: the lowest note is the bass the symbol names`).toBe(chroma(bass));
  });
});

// ---------------------------------------------------------------- pentatonic across the neck
describe('batch 13: st-pent-connect', () => {
  /** The 16-bar tune, written out from the composition plan (box 5 up to box 4 and down again). */
  const TUNE = [
    'E4 D4 C4 A3 G3', 'E3 G3 A3 C4 D4', 'G4 E4 D4 C4 A3', 'G3 A3 C4 D4 E4',
    'C5 A4 G4 E4 D4 E4', 'G4 A4 C5 D5 E5 D5', 'C5 A4 C5 E5 G4 A4', 'C5 D5 E5 G5',
    'E5 D5 C5 A4 G4', 'E4 G4 E4 D4 C4 A3', 'G3 A3 C4 E4 D4 C4', 'E4 D4 C4',
    'G4 A4 G4 E4 D4 C4', 'G3 A3 C4 D4 C4 A3', 'E4 D4 C4 A3 G3', 'A3',
  ];
  /** The box each note is played in, bar by bar: a change of box is a slide. */
  const BOX_OF_NOTE = [
    [5, 5, 5, 5, 5], [5, 5, 5, 5, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 2],
    [2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 3, 3], [3, 3, 3, 3, 3, 4], [4, 4, 4, 4],
    [4, 4, 4, 4, 4], [3, 3, 3, 3, 3, 2], [2, 2, 2, 2, 2, 2], [2, 2, 1],
    [1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 5], [5, 5, 5, 5, 5], [5],
  ];
  /** The three notes (bar:index in the bar) played with finger 3 instead of the box's finger 4, so the ring finger can slide from them. */
  const SLIDE_PREP = ['2:3', '6:3', '7:4'];

  /** Box number -> "string:fret" -> finger, from the guitar engine (box 4 at frets 12-15, box 5 at frets 2-5). */
  function boxes(): Map<number, Map<string, number>> {
    const out = new Map<number, Map<string, number>>();
    const climb = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    const low = scalePatterns('A', 'minor-pentatonic');
    for (const p of [...climb.filter((x) => x.id !== 'box-5'), ...low.filter((x) => x.id === 'box-5')]) {
      out.set(Number(p.id.replace('box-', '')), new Map(p.notes.map((n) => [`${n.string}:${n.fret}`, n.finger])));
    }
    return out;
  }

  it('the engine boxes are where the plan says: 5 at frets 2-5, 1 at 5-8, 4 at 12-15', () => {
    const b = boxes();
    const frets = (n: number) => [...b.get(n)!.keys()].map((k) => Number(k.split(':')[1]));
    expect([Math.min(...frets(5)), Math.max(...frets(5))]).toEqual([2, 5]);
    expect([Math.min(...frets(1)), Math.max(...frets(1))]).toEqual([5, 8]);
    expect([Math.min(...frets(4)), Math.max(...frets(4))]).toEqual([12, 15]);
  });

  it('plays the tune over Am7, then the same notes over C, ending on A and then on C', async () => {
    const song = await load('st-pent-connect');
    expect(song.bars.length).toBe(32);
    const tokens = tokensByBar(played(song, 'Your melody'), 32);
    const first = TUNE.map((b) => bar(b).map(canon));
    const second = [...TUNE.slice(0, 15), 'C4'].map((b) => bar(b).map(canon));
    expect(tokens).toEqual([...first, ...second]);
    expect(song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}=${shapeText(c.voicing!)}`)).toEqual(['0:0:Am7=x02010', '16:0:C=x32010']);
  });

  it('plays the same frets in both halves (only the last note differs)', async () => {
    const beats = played(await load('st-pent-connect'), 'Your melody');
    const frets = (from: number, to: number) => beats.filter((b) => b.bar >= from && b.bar < to).map((b) => b.frets.map((f) => `${f.string}:${f.fret}`).join());
    expect(frets(16, 31)).toEqual(frets(0, 15));
  });

  it('keeps every note in its box, and moves to the next box only by a slide', async () => {
    const b = boxes();
    const beats = played(await load('st-pent-connect'), 'Your melody').filter((x) => x.bar < 16 && x.midis.length);
    const flat = BOX_OF_NOTE.flat();
    expect(beats.length).toBe(flat.length);
    beats.forEach((x, i) => {
      const pos = `${x.frets[0].string}:${x.frets[0].fret}`;
      expect(b.get(flat[i])!.has(pos), `bar ${x.bar + 1}: ${pos} (${x.token}) is not in box ${flat[i]}`).toBe(true);
      const changes = i > 0 && flat[i] !== flat[i - 1];
      expect(!!x.frets[0].slide, `bar ${x.bar + 1}: ${pos} ${changes ? 'moves to a new box without a slide' : 'slides inside a box'}`).toBe(changes);
      if (changes) {
        // The slide stays on one string: the note before it is on the same string, in the box it leaves.
        const prev = beats[i - 1].frets[0];
        expect(prev.string, `bar ${x.bar + 1}: the slide starts on the same string`).toBe(x.frets[0].string);
        expect(b.get(flat[i - 1])!.has(`${prev.string}:${prev.fret}`)).toBe(true);
      }
    });
    // Up through 5, 1, 2, 3, 4 and back down through 3, 2, 1 to 5.
    const order = flat.filter((n, i) => i === 0 || n !== flat[i - 1]);
    expect(order).toEqual([5, 1, 2, 3, 4, 3, 2, 1, 5]);
  });

  it('fingers every note as the box does, except the three ring-finger slide starts', async () => {
    const b = boxes();
    const beats = played(await load('st-pent-connect'), 'Your melody').filter((x) => x.bar < 16 && x.midis.length);
    const flat = BOX_OF_NOTE.flat();
    beats.forEach((x, i) => {
      const f = x.frets[0];
      const inBar = beats.filter((y, k) => k < i && y.bar === x.bar).length;
      expect(f.finger, `bar ${x.bar + 1}: ${f.string}:${f.fret} has no finger mark`).toBeDefined();
      if (SLIDE_PREP.includes(`${x.bar + 1}:${inBar}`)) {
        expect(f.finger, `bar ${x.bar + 1}: slide with the ring finger`).toBe(3);
        expect(b.get(flat[i])!.get(`${f.string}:${f.fret}`), `bar ${x.bar + 1}: the box itself uses finger 4 here`).toBe(4);
        expect(beats[i + 1].frets[0].slide, `bar ${x.bar + 1}: the next note is the slide`).toBeDefined();
      }
      else expect(f.finger, `bar ${x.bar + 1}: ${f.string}:${f.fret} in box ${flat[i]}`).toBe(b.get(flat[i])!.get(`${f.string}:${f.fret}`));
    });
  });

  it('puts C, E or G (or a step to one) on beats 1 and 3, so both chords fit', async () => {
    const beats = played(await load('st-pent-connect'), 'Your melody');
    expect(strongBeatProblems(beats)).toEqual([]);
    expect(beats.filter((x) => x.bar < 16).every((x) => x.chord === 'Am7')).toBe(true);
    expect(beats.filter((x) => x.bar >= 16).every((x) => x.chord === 'C')).toBe(true);
  });

  it('stays in A minor pentatonic (= C major pentatonic), from E3 to G5, frets 2 to 15', async () => {
    const beats = played(await load('st-pent-connect'), 'Your melody');
    const midis = beats.flatMap((x) => x.midis);
    expect(outside(midis, scalePcs('A', 'minor-pentatonic'))).toEqual([]);
    expect(scalePcs('A', 'minor-pentatonic').slice().sort()).toEqual(scalePcs('C', 'major-pentatonic').slice().sort());
    expect([Math.min(...midis), Math.max(...midis)].map((m) => midiToNote(m))).toEqual(['E3', 'G5']);
    const frets = beats.flatMap((x) => x.frets.map((f) => f.fret));
    expect([Math.min(...frets), Math.max(...frets)]).toEqual([2, 15]);
  });

  it('has a backing strum in every bar, and estimates within one level of the plan (6)', async () => {
    const song = await load('st-pent-connect');
    const backing = played(song, 'Backing');
    expect(song.tracks.find((t) => t.name === 'Backing')?.role).toBe('rhythm');
    expect(new Set(backing.filter((x) => x.slash).map((x) => x.bar)).size).toBe(32);
    const est = estimate(song, 'Your melody');
    expect(Math.abs(est.level - 6), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- barre progression
describe('batch 13: st-barre-progression', () => {
  const ONE = ['0D', '960D', '1440U', '2400U', '2880D', '3360U'];
  const TWO = ['0D', '960D', '1440U', '1920D', '2880D', '3360U'];
  const IN_A = ['A=x02220', 'F#m=244222', 'D=xx0232', 'E=022100', 'A=x02220', 'F#m=244222', 'D=xx0232|E=022100', 'A=x02220'];
  const IN_C = ['C=x35553', 'Am=577555', 'F=133211', 'G=355433', 'C=x35553', 'Am=577555', 'F=133211|G=355433', 'C=x35553'];

  it('strums the folk pattern with the planned shapes, changing on beat 3 in bars 7 and 15', async () => {
    const song = await load('st-barre-progression');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your strum');
    expect(beats.every((b) => b.slash || b.token === 'r')).toBe(true);
    const plan = [...IN_A, ...IN_C];
    for (let i = 0; i < 16; i++) {
      const inBar = beats.filter((b) => b.bar === i && b.slash);
      const pattern = i === 7 || i === 15 ? ['0D'] : plan[i].includes('|') ? TWO : ONE;
      expect(inBar.map((b) => `${b.inBar}${b.stroke === 'up' ? 'U' : 'D'}`), `bar ${i + 1}`).toEqual(pattern);
      const shapes = [...new Set(inBar.map((b) => `${b.chord}=${b.voicing}`))].join('|');
      expect(shapes, `bar ${i + 1}`).toBe(plan[i]);
    }
  });

  it('is I-vi-IV-V in A, then in C, with every chord of the C half a barre', async () => {
    const song = await load('st-barre-progression');
    const degree = (symbol: string, key: string) => scalePcs(key, 'major').indexOf(chordPcs(symbol)[0]) + 1;
    const half = (from: number, to: number) => song.chords.filter((c) => c.bar >= from && c.bar < to);
    expect(half(0, 8).map((c) => degree(c.symbol, 'A'))).toEqual([1, 6, 4, 5, 1, 6, 4, 5, 1]);
    expect(half(8, 16).map((c) => degree(c.symbol, 'C'))).toEqual([1, 6, 4, 5, 1, 6, 4, 5, 1]);
    for (const c of half(0, 8)) expect(outside(chordPcs(c.symbol).map((p) => p + 60), scalePcs('A', 'major'))).toEqual([]);
    for (const c of half(8, 16)) {
      expect(outside(chordPcs(c.symbol).map((p) => p + 60), scalePcs('C', 'major'))).toEqual([]);
      const v = buildVoicing(c.symbol, c.voicing!);
      expect(v.barres.length, `${c.symbol}=${shapeText(c.voicing!)} is a barre`).toBeGreaterThan(0);
      expect(c.voicing!.includes(0), `${c.symbol} has no open strings`).toBe(false);
    }
    // In A, only F#m is a barre.
    expect(half(0, 8).filter((c) => buildVoicing(c.symbol, c.voicing!).barres.length > 0).map((c) => c.symbol)).toEqual(['F#m', 'F#m']);
  });

  it('has a teacher bass of root and fifth on beats 1 and 3', async () => {
    const song = await load('st-barre-progression');
    const bassTrack = song.tracks.find((t) => t.name === 'Teacher bass')!;
    expect(bassTrack.role).toBe('bass');
    expect(bassTrack.tuning ?? song.tuning).toEqual(BASS);
    const beats = played(song, 'Teacher bass');
    const expected = [
      'A1 E2', 'F#1 C#2', 'D2 A1', 'E1 B1', 'A1 E2', 'F#1 C#2', 'D2 E2', 'A1',
      'C2 G1', 'A1 E1', 'F1 C2', 'G1 D2', 'C2 G1', 'A1 E1', 'F1 G1', 'C2',
    ];
    expect(tokensByBar(beats, 16)).toEqual(expected.map((b) => bar(b).map(canon)));
    expect(strongBeatProblems(beats)).toEqual([]);
  });

  it('estimates within two levels below the plan (6): the estimate sees an even strum of known chords', async () => {
    // Gap note (integration pass 2): the estimate used to rate chords by symbol (each as the
    // engine's standard shape). It now scores the barre shapes written in the song, which raises
    // the chord factor (0.43 to 0.51), but it still counts a strummed part as one arm motion, so a
    // barre-chord strum study at one change a bar lands at about level 4.
    const est = estimate(await load('st-barre-progression'), 'Your strum');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(4);
    expect(est.level).toBeLessThanOrEqual(6);
    expect(est.factors.chords, JSON.stringify(est)).toBeGreaterThan(0.45);
  });
});

// ---------------------------------------------------------------- CAGED
describe('batch 13: st-caged-chords', () => {
  /** One shape per bar: C up and back down, then G up and back down. */
  const PLAN: Array<[string, string]> = [
    ['C', 'C=x32010'], ['A', 'C=x35553'], ['G', 'C=875558'], ['E', 'C=8-10-10-9-8-8'], ['D', 'C=x-x-10-12-13-12'], ['C', 'C=x-15-14-12-13-12'],
    ['D', 'C=x-x-10-12-13-12'], ['E', 'C=8-10-10-9-8-8'], ['G', 'C=875558'], ['A', 'C=x35553'], ['C', 'C=x32010'],
    ['G', 'G=320003'], ['E', 'G=355433'], ['D', 'G=xx5787'], ['C', 'G=x-10-9-7-8-7'], ['A', 'G=x-10-12-12-12-10'],
    ['C', 'G=x-10-9-7-8-7'], ['D', 'G=xx5787'], ['E', 'G=355433'], ['G', 'G=320003'],
  ];
  /** The roots of each bar: the lowest one (beat 1) and the one an octave up (beat 3), written out. */
  const ROOTS = [
    'C3 C4', 'C3 C4', 'C3 C4', 'C3 C4', 'C4 C5', 'C4 C5', 'C4 C5', 'C3 C4', 'C3 C4', 'C3 C4', 'C3 C4',
    'G2 G3', 'G2 G3', 'G3 G4', 'G3 G4', 'G3 G4', 'G3 G4', 'G3 G4', 'G2 G3', 'G2',
  ];

  it('plays one shape per bar in the planned order: root, shape, upper root, shape', async () => {
    const song = await load('st-caged-chords');
    expect(song.bars.length).toBe(20);
    const beats = played(song, 'Your shapes');
    for (let i = 0; i < 20; i++) {
      const [, shape] = PLAN[i];
      const inBar = beats.filter((b) => b.bar === i);
      const full = SHAPES[shape];
      const [low, high] = bar(ROOTS[i]);
      const want = i === 19 ? [low, full.replace(/ /g, '+'), full.replace(/ /g, '+')] : [low, full.replace(/ /g, '+'), high, full.replace(/ /g, '+')];
      expect(inBar.map((b) => b.token), `bar ${i + 1}`).toEqual(want.map(canon));
      expect(inBar.every((b) => `${b.chord}=${b.voicing}` === shape), `bar ${i + 1} is ${shape}`).toBe(true);
      // The single note on beat 1 is the lowest note of the shape and a root.
      expect(noteToMidi(low)).toBe(shapeSounds(shape.split('=')[1])[0]);
      expect(noteToMidi(low) % 12).toBe(chordPcs(shape.split('=')[0])[0]);
    }
  });

  it('climbs in CAGED order and comes back the same way', () => {
    const cycle = 'CAGED';
    const up = (from: number, to: number) => PLAN.slice(from, to).map((p) => p[0]);
    const next = (s: string) => cycle[(cycle.indexOf(s) + 1) % 5];
    for (const [from, to] of [[0, 6], [11, 16]]) {
      const shapes = up(from, to);
      shapes.slice(1).forEach((s, i) => expect(s, `after the ${shapes[i]} shape`).toBe(next(shapes[i])));
    }
    expect(up(6, 11)).toEqual(['D', 'E', 'G', 'A', 'C']);
    expect(up(16, 20)).toEqual(['C', 'D', 'E', 'G']);
    // Going up, each shape sits higher on the neck than the one before (its lowest fretted note).
    const lowestFret = (i: number) => {
      const frets = PLAN[i][1].split('=')[1];
      const parts = frets.includes('-') ? frets.split('-') : [...frets];
      return Math.min(...parts.filter((f) => f !== 'x' && f !== '0').map(Number));
    };
    for (const [from, to] of [[0, 6], [11, 16]]) {
      const lows = Array.from({ length: to - from }, (_, k) => lowestFret(from + k));
      expect(lows, `bars ${from + 1}-${to}`).toEqual([...lows].sort((a, b) => a - b));
      expect(new Set(lows).size).toBe(lows.length);
    }
  });

  it('names each shape, and on the way up the strings its roots are on', async () => {
    const song = await load('st-caged-chords');
    for (let i = 0; i < 20; i++) {
      const [name, shape] = PLAN[i];
      const label = song.annotations.find((a) => a.bar === i && a.tick === 0)?.text ?? '';
      expect(label, `bar ${i + 1}`).toMatch(new RegExp(`^${name} shape`));
      const frets = shape.split('=')[1];
      const parts = frets.includes('-') ? frets.split('-') : [...frets];
      const rootPc = chordPcs(shape.split('=')[0])[0];
      const strings = parts.flatMap((f, k) => (f !== 'x' && (STANDARD[k] + Number(f)) % 12 === rootPc ? [6 - k] : []));
      const firstTime = PLAN.findIndex((p) => p[1] === shape) === i;
      if (firstTime) {
        const words = strings.length === 2 ? `${strings[0]} and ${strings[1]}` : `${strings.slice(0, -1).join(', ')} and ${strings.at(-1)}`;
        expect(label, `bar ${i + 1}: roots of ${shape}`).toContain(`roots on strings ${words}`);
      }
    }
  });

  it('marks the root fingers as the chord box does, and estimates near the plan (6)', async () => {
    const song = await load('st-caged-chords');
    const beats = played(song, 'Your shapes');
    expect(fingerMismatches(beats)).toEqual([]);
    expect(beats.filter((b) => b.frets.some((f) => typeof f.finger === 'number')).length).toBeGreaterThanOrEqual(10);
    const est = estimate(song, 'Your shapes');
    expect(Math.abs(est.level - 6), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- mode studies
interface ModeStudy {
  id: string;
  scale: string;
  colour: string;
  /** Chord events: "bar:tick:symbol=shape". */
  vamp: string[];
  tune: string[];
  /** Frets the hand covers (the position). */
  frets: [number, number];
  /** Strong-beat landings on the colour note, as "bar:beat" (1-based), written out from the plan. */
  landings: string[];
}

const two = (I: string, X: string): string[] => [`0:0:${I}`, `2:0:${X}`, `4:0:${I}`, `6:0:${X}`, `8:0:${I}`, `10:0:${X}`, `12:0:${I}`, `14:0:${X}`, `15:0:${I}`];

const MODES: ModeStudy[] = [
  {
    id: 'st-mode-ionian',
    scale: 'major',
    colour: 'G#',
    vamp: two('Amaj7=x02120', 'D=xx0232'),
    tune: [
      'C#4 E4 F#4 G#4', 'A4 G#4 E4 C#4 E4', 'D4 F#4 A4 B4 A4', 'F#4 E4 D4 A3',
      'E4 C#4 E4 G#4', 'A4 B4 A4 G#4 E4 C#4', 'D4 E4 F#4 A4 F#4 E4', 'F#4 E4 D4 E4 F#4 G#4',
      'A4 G#4', 'E4 F#4 G#4 A4 B4 A4', 'F#4 A4 F#4 D4 E4 F#4', 'A4 B4 A4 F#4',
      'E4 C#4 E4 G#4', 'A4 G#4 E4 C#4 B3 C#4', 'D4 E4 F#4 A4 G#4', 'A4',
    ],
    frets: [4, 7],
    landings: ['1:3', '5:3', '9:3', '13:3'],
  },
  {
    id: 'st-mode-dorian',
    scale: 'dorian',
    colour: 'F#',
    vamp: two('Am=x02210', 'D=xx0232'),
    tune: [
      'A4 G4 E4 C4 D4', 'E4 D4 C4 D4 E4', 'F#4 A4 F#4 D4 E4 F#4', 'A4 B4 A4 F#4',
      'E4 C4 D4 E4 G4', 'A4 G4 E4 D4 C4 A3', 'D4 E4 F#4 A4 F#4', 'F#4 E4 F#4 G4',
      'A4 C5 B4 A4 G4 E4', 'C4 D4 E4 F#4 E4', 'F#4 A4 B4 A4 F#4 E4', 'D4 E4 F#4 A4 F#4',
      'E4 F#4 G4 A4 G4 E4', 'C5 B4 A4 E4 G4', 'F#4 E4 F#4 A4 B4', 'A4',
    ],
    frets: [5, 8],
    landings: ['3:1', '4:3', '8:1', '11:1', '12:3', '15:1'],
  },
  {
    id: 'st-mode-mixolydian',
    scale: 'mixolydian',
    colour: 'G',
    vamp: two('A=x02220', 'G=320003'),
    tune: [
      'C#4 E4 F#4 E4 C#4 A3', 'E4 F#4 G4 A4', 'G4 F#4 E4 D4 B3 D4', 'E4 D4 B3 D4 G3',
      'A3 C#4 E4 A4 G4 E4', 'E4 C#4 B3 A3', 'B3 D4 E4 G4 E4 D4', 'D4 B3 A3 G3',
      'A3 C#4 E4 F#4 E4', 'A4 G4 E4 C#4 E4', 'G4 A4 G4 D4 B3', 'D4 E4 G4 A4 G4',
      'E4 C#4 E4 A4 G4 E4', 'C#4 E4 C#4 A3', 'G3 B3 D4 G4 F#4 G4', 'A4',
    ],
    frets: [0, 5],
    landings: ['3:1', '4:3', '7:3', '11:1', '12:3', '15:1', '15:3'],
  },
  {
    id: 'st-mode-aeolian',
    scale: 'minor',
    colour: 'F',
    vamp: ['0:0:Am=x02210', '2:0:F=133211', '3:0:G=320003', '4:0:Am=x02210', '6:0:F=133211', '7:0:G=320003', '8:0:Am=x02210', '10:0:F=133211', '11:0:G=320003', '12:0:Am=x02210', '14:0:F=133211', '14:1920:G=320003', '15:0:Am=x02210'],
    tune: [
      'A4 C5 B4 A4', 'E4 D4 C4 D4 E4', 'F4 A4 G4 F4', 'G4 F4 E4 D4',
      'E4 C4 E4 A4 G4 E4', 'C4 D4 E4 A3', 'F4 E4 F4 A4', 'G4 F4 E4 D4 B3',
      'C4 E4 G4 A4 C5 B4', 'C5 B4 A4', 'A4 C5 A4 F4', 'B4 A4 G4 F4 G4 D4',
      'E4 A4 G4 E4 D4 C4', 'A3 C4 D4 E4', 'F4 E4 F4 G4 A4 B4', 'A4',
    ],
    frets: [4, 8],
    landings: ['3:1', '3:3', '7:1', '11:3', '15:1'],
  },
];

describe.each(MODES)('batch 13: $id', (m) => {
  it('plays the melody written out for it, over the planned vamp', async () => {
    const song = await load(m.id);
    expect(song.bars.length).toBe(16);
    expect(song.bars.every((b) => b.time.numerator === 4 && b.time.denominator === 4)).toBe(true);
    expect(tokensByBar(played(song, 'Your melody'), 16)).toEqual(m.tune.map((b) => bar(b).map(canon)));
    expect(song.chords.map((c) => `${c.bar}:${c.tick}:${c.symbol}=${shapeText(c.voicing!)}`)).toEqual(m.vamp);
  });

  it('stays in A ' + m.scale + ' and the vamp chords are built from it, one of them carrying the colour note', async () => {
    const song = await load(m.id);
    const pcs = scalePcs('A', m.scale);
    expect(outside(played(song, 'Your melody').flatMap((b) => b.midis), pcs)).toEqual([]);
    const colour = noteToMidi(m.colour + '4') % 12;
    for (const c of song.chords) expect(outside(chordPcs(c.symbol).map((p) => p + 60), pcs), c.symbol).toEqual([]);
    expect(song.chords.some((c) => chordPcs(c.symbol).includes(colour) && shapeSounds(shapeText(c.voicing!)).some((x) => x % 12 === colour))).toBe(true);
    // The colour note is what separates this mode from its neighbours: it is in the scale, and the
    // parallel major or minor scale does not have it.
    const parallel = m.scale === 'major' || m.scale === 'mixolydian' ? (m.scale === 'major' ? 'mixolydian' : 'major') : m.scale === 'dorian' ? 'minor' : 'dorian';
    expect(pcs).toContain(colour);
    expect(scalePcs('A', parallel)).not.toContain(colour);
  });

  it('lands on the colour note on a strong beat at least four times, each time over a chord that holds it', async () => {
    const beats = played(await load(m.id), 'Your melody');
    const colour = noteToMidi(m.colour + '4') % 12;
    const landings = beats.filter((b) => b.midis.length === 1 && b.midis[0] % 12 === colour && (b.inBar === 0 || b.inBar === 1920) && b.duration >= 960);
    expect(landings.map((b) => `${b.bar + 1}:${b.inBar / 960 + 1}`)).toEqual(m.landings);
    expect(landings.length).toBeGreaterThanOrEqual(4);
    for (const b of landings) expect(chordPcs(b.chord!), `bar ${b.bar + 1}`).toContain(colour);
  });

  it('puts chord tones (or steps to them) on beats 1 and 3, and ends on A over the A chord', async () => {
    const beats = played(await load(m.id), 'Your melody');
    expect(strongBeatProblems(beats)).toEqual([]);
    const last = beats.filter((b) => b.midis.length).at(-1)!;
    expect([last.bar, last.inBar, midiToNote(last.midis[0])]).toEqual([15, 0, 'A4']);
    expect(chordPcs(last.chord!)[0]).toBe(9);
  });

  it('uses quarter and eighth notes, with longer notes only for held notes, in one hand position', async () => {
    const beats = played(await load(m.id), 'Your melody');
    const notes = beats.filter((b) => b.midis.length);
    expect(notes.every((b) => [480, 960, 1920, 3840].includes(b.duration) && !b.dotted), 'only e, q, h and w').toBe(true);
    expect(notes.filter((b) => b.duration <= 960).length / notes.length).toBeGreaterThan(0.8);
    const frets = notes.flatMap((b) => b.frets.map((f) => f.fret));
    expect([Math.min(...frets), Math.max(...frets)]).toEqual(m.frets);
    expect(beats.every((b) => b.slash === false)).toBe(true);
  });

  it('has a backing part strumming in every bar', async () => {
    const song = await load(m.id);
    const backing = song.tracks.find((t) => t.name === 'Backing');
    expect(backing?.role).toBe('rhythm');
    expect(new Set(played(song, 'Backing').filter((b) => b.slash).map((b) => b.bar)).size).toBe(16);
  });

  it('estimates between levels 3 and 6: the difficulty is in the ear, not the hands', async () => {
    // The plan asks for a melody of quarter and eighth notes in one place on the neck, so the
    // estimate (speed, stretches, shifts, techniques) stays low: about 3 to 4 against the plan's 6.
    // What makes these level 6 is hearing and aiming for the colour note over a vamp.
    const est = estimate(await load(m.id), 'Your melody');
    expect(est.level, JSON.stringify(est)).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThanOrEqual(6);
  });
});

describe('batch 13: what the mode abouts say is in the music', () => {
  it('Ionian holds G# (two beats, vibrato) over Amaj7 in the bars the about names', async () => {
    const beats = played(await load('st-mode-ionian'), 'Your melody');
    const held = beats.filter((b) => b.midis.length === 1 && b.midis[0] % 12 === 8 && b.duration === 1920);
    expect(held.map((b) => b.bar + 1)).toEqual([1, 5, 9, 13]);
    expect(held.every((b) => b.chord === 'Amaj7')).toBe(true);
    expect(songEntry('st-mode-ionian')!.about).toContain('bars 1, 5, 9 and 13');
  });

  it('Dorian passes through F# over Am in exactly the bars the about names', async () => {
    const beats = played(await load('st-mode-dorian'), 'Your melody');
    expect([...new Set(beats.filter((b) => b.midis[0] % 12 === 6 && b.chord === 'Am').map((b) => b.bar + 1))]).toEqual([10, 13]);
    expect(songEntry('st-mode-dorian')!.about).toContain('bars 10 and 13');
  });

  it('Aeolian leans on F over the F chord in exactly the bars the about names', async () => {
    const beats = played(await load('st-mode-aeolian'), 'Your melody');
    const onBeat = beats.filter((b) => b.midis[0] % 12 === 5 && (b.inBar === 0 || b.inBar === 1920) && b.duration >= 960);
    expect([...new Set(onBeat.map((b) => b.bar + 1))]).toEqual([3, 7, 11, 15]);
    expect(onBeat.every((b) => b.chord === 'F')).toBe(true);
    expect(songEntry('st-mode-aeolian')!.about).toContain('bars 3, 7, 11 and 15');
  });

  it('Mixolydian ends G to A: the flat seventh rising home', async () => {
    const notes = played(await load('st-mode-mixolydian'), 'Your melody').filter((b) => b.midis.length);
    expect(notes.slice(-2).map((b) => `${midiToNote(b.midis[0])}/${b.chord}`)).toEqual(['G4/G', 'A4/A']);
  });
});

describe('batch 13: Dorian and Aeolian sit in the same place', () => {
  it('play every F# (Dorian) and every F (Aeolian) on string 2, one fret apart, in fifth position', async () => {
    const dorian = played(await load('st-mode-dorian'), 'Your melody').filter((b) => b.midis[0] % 12 === 6);
    const aeolian = played(await load('st-mode-aeolian'), 'Your melody').filter((b) => b.midis[0] % 12 === 5);
    expect(new Set(dorian.map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['2:7']));
    expect(new Set(aeolian.map((b) => `${b.frets[0].string}:${b.frets[0].fret}`))).toEqual(new Set(['2:6']));
    expect(songEntry('st-mode-aeolian')!.about).toMatch(/Dorian/);
  });
});

// ---------------------------------------------------------------- chord melody
describe('batch 13: st-chord-melody-1', () => {
  /** The tune (the top note of every beat), written out from the composition plan. */
  const TOP = [
    'E4 D4 E4 G4', 'A4 G4 F4 E4', 'F4 E4 F4 A4 G4', 'F4 D4 B3',
    'C4 D4 E4 G4 E4', 'E4 C4 E4 A4', 'F4 D4 G4 F4', 'E4',
    'A4 G4 F4 E4', 'G4 A4 G4 E4', 'F4 E4 F4 A4', 'G4 F4 E4 D4 B3',
    'C4 D4 E4 G4 E4', 'A4 G4 F4 E4', 'A4 G4 F4 D4 B3', 'C4',
  ];

  it('carries the tune on top, always on strings 1 and 2', async () => {
    const song = await load('st-chord-melody-1');
    expect(song.bars.length).toBe(16);
    const beats = played(song, 'Your part').filter((b) => b.midis.length);
    const top = Array.from({ length: 16 }, () => [] as string[]);
    for (const b of beats) top[b.bar].push(midiToNote(Math.max(...b.midis), { prefer: 'sharps' }));
    expect(top).toEqual(TOP.map((b) => bar(b).map(canon)));
    for (const b of beats) {
      const high = b.frets.reduce((a, f) => (STANDARD[6 - f.string] + f.fret > STANDARD[6 - a.string] + a.fret ? f : a));
      expect(high.string, `bar ${b.bar + 1}: the melody is on string 1 or 2`).toBeLessThanOrEqual(2);
    }
  });

  it('puts a chord under the tune on every beat 1 and 3, and the tune alone between them', async () => {
    const beats = played(await load('st-chord-melody-1'), 'Your part').filter((b) => b.midis.length);
    for (const b of beats) {
      const strong = b.inBar === 0 || b.inBar === 1920;
      if (strong) {
        expect(b.midis.length, `bar ${b.bar + 1} beat ${b.inBar / 960 + 1}: a chord`).toBeGreaterThanOrEqual(3);
        expect(outside(b.midis, chordPcs(b.chord!)), `bar ${b.bar + 1}: ${b.token} over ${b.chord}`).toEqual([]);
        for (const pc of requiredPcs(b.chord!)) expect(b.midis.some((x) => x % 12 === pc), `bar ${b.bar + 1}: ${b.chord} keeps its root and third`).toBe(true);
        // The grip played is the one the chord box shows.
        const shape = Array.from({ length: 6 }, (_, k) => b.frets.find((f) => f.string === 6 - k)?.fret ?? null);
        expect(shapeText(shape), `bar ${b.bar + 1}: the chord box shows the grip played`).toBe(b.voicing);
      } else {
        expect(b.midis.length, `bar ${b.bar + 1} tick ${b.inBar}: the melody alone`).toBe(1);
      }
    }
  });

  it('uses C, Am, F, G7, Em and Dm, all in C major, with diatonic melody notes', async () => {
    const song = await load('st-chord-melody-1');
    const name = (s: string) => s.split('/')[0];
    expect(new Set(song.chords.map((c) => name(c.symbol)))).toEqual(new Set(['C', 'Am', 'F', 'G7', 'Em', 'Dm']));
    // The one inversion: Dm with A on top (xx3235) has F in the bass, the ii chord before G7.
    expect(song.chords.filter((c) => c.symbol.includes('/')).map((c) => `${c.bar + 1}:${c.symbol}=${shapeText(c.voicing!)}`)).toEqual(['11:Dm/F=xx3235', '15:Dm/F=xx3235']);
    expect(song.chords.find((c) => c.bar === 14 && c.tick === 1920)?.symbol, 'Dm/F goes to G7').toBe('G7');
    expect(outside(played(song, 'Your part').flatMap((b) => b.midis), scalePcs('C', 'major'))).toEqual([]);
    const ends = song.chords.filter((c) => c.bar === 7 || c.bar === 15).map((c) => c.symbol);
    expect(ends).toEqual(['C', 'C']);
    expect(song.chords.find((c) => c.bar === 3)?.symbol, 'the first phrase ends on G7').toBe('G7');
  });

  it('stays in first position except the Am with A on top at fifth position, and estimates near the plan (6)', async () => {
    const song = await load('st-chord-melody-1');
    const beats = played(song, 'Your part').filter((b) => b.midis.length);
    const high = beats.filter((b) => b.frets.some((f) => f.fret > 5)).map((b) => b.bar + 1);
    expect([...new Set(high)]).toEqual([2, 6, 14]);
    const est = estimate(song, 'Your part');
    expect(Math.abs(est.level - 6), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- reading in fifth position
describe('batch 13: st-read-fifth-position', () => {
  const TUNE = [
    'G3 C4 E4 G4 E4 C5', 'B4 A4 G4 r', 'A4 C5 B4 A4 E4 C4 E4', 'D4 E4 F4 G4',
    'A4 G4 F4 C4 A3 F3', 'G3 E3 G3 C4 r E4', 'D4 F4 D4 B3 G3', 'C4 C3',
    'F3 A3 C4 A3 C4 F4', 'F4 D4 Bb3 D4 F4', 'E4 G4 Bb4 G4', 'A4 C5 A4 G4 F4 r',
    'D4 E4 F4 A4 G4 F4', 'Bb3 D4 F4 Bb4 A4 G4', 'E4 C4 E4 G4 Bb4', 'A4 F4 F3',
  ];

  it('reads the melody written out for it', async () => {
    const song = await load('st-read-fifth-position');
    expect(song.bars.length).toBe(16);
    expect(tokensByBar(played(song, 'Melody'), 16)).toEqual(TUNE.map((b) => bar(b).map(canon)));
  });

  it('is C major in bars 1-8 and F major from bar 9, with Bb on string 4 fret 8 and string 1 fret 6', async () => {
    const song = await load('st-read-fifth-position');
    expect(song.bars[8].key).toMatch(/^F/);
    const beats = played(song, 'Melody').filter((b) => b.midis.length);
    const c = beats.filter((b) => b.bar < 8);
    const f = beats.filter((b) => b.bar >= 8);
    expect(outside(c.flatMap((b) => b.midis), scalePcs('C', 'major'))).toEqual([]);
    expect(outside(f.flatMap((b) => b.midis), scalePcs('F', 'major'))).toEqual([]);
    expect(c.some((b) => b.midis[0] % 12 === 11), 'B natural in the C half').toBe(true);
    const flats = f.filter((b) => b.midis[0] % 12 === 10);
    expect(new Set(flats.map((b) => `${b.frets[0].string}:${b.frets[0].fret}=${midiToNote(b.midis[0], { prefer: 'flats' })}`))).toEqual(new Set(['4:8=Bb3', '1:6=Bb4']));
  });

  it('keeps the hand in fifth position: frets 5-8 with fingers 1-4, finger 1 reaching back to fret 4', async () => {
    const beats = played(await load('st-read-fifth-position'), 'Melody').filter((b) => b.midis.length);
    for (const b of beats) {
      const f = b.frets[0];
      expect(f.fret >= 4 && f.fret <= 8, `bar ${b.bar + 1}: fret ${f.fret}`).toBe(true);
      if (typeof f.finger === 'number') expect(f.finger, `bar ${b.bar + 1}: ${f.string}:${f.fret}`).toBe(f.fret === 4 ? 1 : f.fret - 4);
    }
    expect(beats.filter((b) => b.frets[0].fret === 4).map((b) => `${b.frets[0].string}:4`)).toEqual(['3:4']);
    expect(new Set(beats.map((b) => b.frets[0].string))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('puts chord tones (or steps to them) on beats 1 and 3, with dotted rhythms and rests to read', async () => {
    const song = await load('st-read-fifth-position');
    const beats = played(song, 'Melody');
    expect(strongBeatProblems(beats)).toEqual([]);
    expect(beats.some((b) => b.dotted && b.duration === 1440), 'a dotted quarter').toBe(true);
    expect(beats.some((b) => b.dotted && b.duration === 720), 'a dotted eighth').toBe(true);
    expect(beats.filter((b) => b.token === 'r').length).toBeGreaterThanOrEqual(3);
    expect(played(song, 'Teacher').filter((b) => b.slash).length).toBeGreaterThanOrEqual(30);
  });

  it('estimates near the plan (6)', async () => {
    const est = estimate(await load('st-read-fifth-position'), 'Melody');
    expect(Math.abs(est.level - 6), JSON.stringify(est)).toBeLessThanOrEqual(1);
  });
});
