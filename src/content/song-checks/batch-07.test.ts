/**
 * Batch 7 cross-checks (korobeiniki, canon-in-d). The other eight ids of the batch (nobody-knows,
 * waltzing-matilda, turkey-in-the-straw, soldiers-joy, mo-li-hua, la-paloma, la-cucaracha,
 * dance-of-the-sugar-plum-fairy) were left out: their tunes could not be confirmed note for note
 * without a printed source, so nothing is checked for them here.
 *
 * The song core computes every pitch from string + fret + tuning, so a wrong fret is a wrong note.
 * Each song is parsed and its melody compared, bar by bar and note by note (pitch and length), with
 * a list written out here by hand in written pitch (the guitar sounds it an octave lower): the
 * folk melody as folk-song books print it, and Pachelbel's first violin as the canon opens. Each
 * tune is then derived a second, independent way (Korobeiniki as scale degrees, the canon lines as
 * chord-tone roles of the ground bass), so a slip in one list cannot hide a slip in the tab. Also
 * checked: the chords on every strong beat and the notes against them, key, scale, range and
 * tonic, the frets and fingers, the plan's chord shapes and bass frets (read from the plan's own
 * text), the canon entries, the strum parts, and the core's difficulty estimate against the level.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, validateSong, type Beat, type Song, type Track } from '@/core/song';
import { chordNotes, chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';
import plan from '@/content/plan/repertoire.json';

const PPQ = 960;
const LEN: Record<string, number> = { w: 4 * PPQ, h: 2 * PPQ, q: PPQ, e: PPQ / 2, s: PPQ / 4 };
const STANDARD = [40, 45, 50, 55, 59, 64];

/** One written beat: a pitch (null for a rest) and its length in ticks. */
interface Written {
  midi: number | null;
  ticks: number;
}

/** What one song's tune should be, written out by hand. */
interface Expected {
  id: string;
  /** The track that carries the tune. */
  melody: string;
  /** Bar by bar ("|" between bars): pitch and length (`D5q`, `F#4e`, `A4h`, `B4q.`), `rq` a rest. */
  tune: string;
  /** Semitones from the written form to the sounding pitch (guitar: an octave lower). */
  shift: number;
  /** Chord symbol written in force on each strong beat, bar by bar ("-" where none is written). */
  harmony: string;
  /** The harmony the notes are checked against where it differs from what is written. */
  analysis?: string;
  /** Strong beats, ticks from the bar line. */
  strong: number[];
  key: string;
  /** Tonic and scale the tune keeps to. */
  scale: [string, string];
  /** Lowest and highest sounding note of the tune. */
  range: [string, string];
  /** Hand position (finger 1's fret) for a note: bar and beat index, both 0-based. */
  position: (bar: number, beat: number) => number;
  /** Bars (0-based) where a fret above 4 is expected. */
  highBars: number[];
}

// Korobeiniki: the eight-bar folk melody, played twice. Bars 3 and 7 differ (B dotted, then B B).
const KOROBEINIKI =
  'E5q B4e C5e D5q C5e B4e | A4q A4e C5e E5q D5e C5e | B4q. C5e D5q E5q | C5q A4q A4h |' +
  'D5q. F5e A5q G5e F5e | E5q. C5e E5q D5e C5e | B4q B4e C5e D5q E5q | C5q A4q A4h';

// Pachelbel's first violin: two bars of rest over the ground, then three two-bar statements
// (quarters F# E D C# B A B C#, quarters D C# B A G F# G E, eighths from D4), then in this
// arrangement a landing F# in bar 9, the same opening again, and a closing F#.
const OPENING =
  'F#5q E5q D5q C#5q | B4q A4q B4q C#5q | D5q C#5q B4q A4q | G4q F#4q G4q E4q |' +
  'D4e F#4e A4e G4e F#4e D4e F#4e E4e | D4e B3e D4e A4e G4e B4e A4e G4e';
const VIOLIN_1 = `rw | rw | ${OPENING} | F#4q rq rh | rw | ${OPENING} | F#4w`;

// The ground's harmony, one chord per beat. In the first half nothing is written over your bass
// notes (no chord diagrams before you strum); in the second half you strum the plan's shapes.
const GROUND = 'D A Bm F#m | G D G A';
const GROUND_STRUMMED = 'D A Bm7 F#m | G D G A';
const UNWRITTEN = '- - - - | - - - -';
const twice4 = (s: string) => [s, s, s, s];
const CANON_WRITTEN = [...twice4(UNWRITTEN), ...twice4(GROUND_STRUMMED), 'D D D D'].join(' | ');
const CANON_ANALYSIS = [...twice4(GROUND), ...twice4(GROUND_STRUMMED), 'D D D D'].join(' | ');
const EVERY_BEAT = [0, PPQ, 2 * PPQ, 3 * PPQ];

const SONGS: Expected[] = [
  {
    id: 'korobeiniki',
    melody: 'Melody',
    tune: KOROBEINIKI,
    shift: -12,
    harmony: 'E7 E7 | Am Am | E7 E7 | Am Am | Dm Dm | Am Am | E7 E7 | Am Am',
    strong: [0, 2 * PPQ],
    key: 'A minor',
    scale: ['A', 'minor'],
    range: ['A3', 'A4'],
    // First position, except the high A and the G after it in bar 5 (hand one fret higher).
    position: (bar, beat) => (bar === 4 && (beat === 2 || beat === 3) ? 2 : 1),
    highBars: [4],
  },
  {
    id: 'canon-in-d',
    melody: 'Violin 1',
    tune: VIOLIN_1,
    shift: -12,
    harmony: CANON_WRITTEN,
    analysis: CANON_ANALYSIS,
    strong: EVERY_BEAT,
    key: 'D major',
    scale: ['D', 'major'],
    range: ['B2', 'F#4'],
    position: () => 1,
    highBars: [],
  },
];

function load(id: string): Song {
  const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(text);
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  expect(result.warnings, `${id}/song.sixtab has no warnings`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, name: string): Track {
  const t = song.tracks.find((x) => x.name === name);
  if (!t) throw new Error(`no track "${name}" in ${song.meta.id}: ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

const name = (midi: number | null) => (midi === null ? 'rest' : midiToNote(midi, { prefer: 'sharps' }));
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
const shapeOf = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');

/** `B4q.` -> B4 a dotted quarter long, moved by `shift`; `rq` -> a quarter rest. */
function readToken(tok: string, shift: number): Written {
  const m = /^(r|[A-G](?:#|b)?\d)(w|h|q|e|s)(\.)?$/.exec(tok);
  if (!m) throw new Error(`bad token "${tok}" in an expected list`);
  return { midi: m[1] === 'r' ? null : noteToMidi(m[1]) + shift, ticks: LEN[m[2]] * (m[3] ? 1.5 : 1) };
}

/** The melody as written: one entry per beat (one note at a time). */
function writtenOf(track: Track): Written[][] {
  return track.measures.map((m) =>
    m.beats.map((b) => {
      expect(b.notes.length, `${track.name}: one note at a time`).toBeLessThanOrEqual(1);
      return { midi: b.notes[0]?.midi ?? null, ticks: b.duration };
    }),
  );
}

/** The chord event in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number) {
  let found: Song['chords'][number] | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c;
  return found;
}

/** The harmony a note on a strong beat is checked against: the analysis, else what is written. */
function harmonyAt(want: Expected, bar: number, tick: number): string | undefined {
  const slot = bars(want.analysis ?? want.harmony)[bar]?.[want.strong.indexOf(tick)];
  return slot && slot !== '-' ? slot : undefined;
}

/** Every struck note of a track in order, with where it sits. */
function struckNotes(track: Track) {
  return track.measures.flatMap((m, bar) =>
    m.beats.flatMap((b: Beat, beat) => b.notes.filter((n) => !n.tie).map((n) => ({ bar, tick: b.start, beat, midi: n.midi, string: n.string, fret: n.fret, finger: n.finger }))),
  );
}

/** Chord shapes the plan names in an entry's notes: `Am (x02210)` -> { Am: 'x02210' }. */
function planShapes(id: string): Record<string, string> {
  const entry = (plan as { pieces: Array<{ id: string; notes?: string }> }).pieces.find((p) => p.id === id)!;
  const out: Record<string, string> = {};
  for (const m of entry.notes!.matchAll(/\b([A-G][#b]?(?:m|7|m7|maj7)?) \(([x0-9]{6})\)/g)) out[m[1]] = m[2];
  return out;
}

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 7: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);
  const expected = bars(want.tune).map((bar) => bar.map((t) => readToken(t, want.shift)));
  const got = writtenOf(melody);

  it('is valid for the song core', () => {
    expect(validateSong(song).map((i) => `${i.level}: ${i.message}`)).toEqual([]);
  });

  it('sounds the expected notes, bar by bar', () => {
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => {
      const names = bar.filter((w) => w.midi !== null).map((w) => name(w.midi));
      const wantNames = expected[i].filter((w) => w.midi !== null).map((w) => name(w.midi));
      expect(names, `${id}: notes of bar ${i + 1}`).toEqual(wantNames);
    });
  });

  it('has the expected rhythm and rests, bar by bar', () => {
    got.forEach((bar, i) => {
      const fmt = (w: Written) => `${name(w.midi)}:${w.ticks}`;
      expect(bar.map(fmt), `${id}: bar ${i + 1}`).toEqual(expected[i].map(fmt));
    });
  });

  it('has the chords written where the harmony plan of this check puts them', () => {
    const harmony = bars(want.harmony);
    expect(harmony.length, `${id}: harmony bars`).toBe(song.bars.length);
    harmony.forEach((slots, bar) => {
      const written = want.strong.map((tick) => chordAt(song, bar, tick)?.symbol ?? '-');
      expect(written, `${id}: chords on the strong beats of bar ${bar + 1}`).toEqual(slots);
    });
  });

  it('puts chord tones on the strong beats, or steps off them to the next note', () => {
    const notes = struckNotes(melody);
    const problems: string[] = [];
    notes.forEach((n, i) => {
      if (!want.strong.includes(n.tick)) return;
      const symbol = harmonyAt(want, n.bar, n.tick);
      if (!symbol) return problems.push(`bar ${n.bar + 1}: no harmony for ${name(n.midi)} on a strong beat`);
      if (chordPcs(symbol).includes(n.midi % 12)) return;
      const next = notes.slice(i + 1).find((x) => x.midi !== n.midi);
      if (!next || Math.abs(next.midi - n.midi) > 2) problems.push(`bar ${n.bar + 1}: ${name(n.midi)} over ${symbol} neither belongs to it nor moves on by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key, scale and range, and ends on the tonic', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = scalePcs(want.scale[0], want.scale[1]);
    const notes = struckNotes(melody);
    expect(notes.filter((n) => !allowed.includes(n.midi % 12)).map((n) => `bar ${n.bar + 1}: ${name(n.midi)}`)).toEqual([]);
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    expect(name(midis[midis.length - 1]).replace(/\d+$/, ''), `${id}: last note`).toBe(id === 'canon-in-d' ? 'F#' : 'A');
  });

  it('uses frets and fingers a teacher would give', () => {
    for (const track of song.tracks) {
      for (const n of struckNotes(track)) {
        const where = `${id}: ${track.name}, bar ${n.bar + 1}, string ${n.string} fret ${n.fret}`;
        if (!want.highBars.includes(n.bar)) expect(n.fret, `${where}: first position`).toBeLessThanOrEqual(4);
        if (track !== melody || n.fret === 0) continue;
        const pos = want.position(n.bar, n.beat);
        expect(n.fret - pos, `${where}: inside the hand (position ${pos})`).toBeGreaterThanOrEqual(0);
        expect(n.fret - pos, `${where}: inside the hand (position ${pos})`).toBeLessThanOrEqual(3);
        if (n.finger !== undefined) expect(n.finger, `${where}: finger`).toBe(n.fret - pos + 1);
      }
    }
  });

  it("uses the plan's chord shapes wherever a shape is given", () => {
    const shapes = planShapes(id);
    const shaped = song.chords.filter((c) => c.voicing);
    expect(shaped.length, `${id}: some chords carry a shape`).toBeGreaterThan(0);
    for (const c of shaped) expect(shapeOf(c.voicing), `${id}: bar ${c.bar + 1}: ${c.symbol}`).toBe(shapes[c.symbol]);
    // Every shape also sounds its own symbol (the song core computes the pitches).
    for (const c of shaped) {
      const pcs = new Set(c.voicing!.flatMap((f, i) => (f === null ? [] : [(STANDARD[i] + f) % 12])));
      expect([...pcs].sort(), `${id}: ${c.symbol}=${shapeOf(c.voicing)}`).toEqual([...new Set(chordPcs(c.symbol))].sort());
    }
  });

  it("lands near its level in the song core's difficulty estimate", () => {
    const level = songEntry(id)!.level;
    const yours = estimateDifficulty(song, { track: 0 });
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; your part ${yours.level} (score ${yours.score}); ${yours.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(yours.level - level), `${id}: estimate ${yours.level} vs level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(1);
  });
});

describe('batch 7: korobeiniki, the parts around the tune', () => {
  const song = load('korobeiniki');

  it('is the same tune when written as scale degrees of A minor', () => {
    // Degrees from the tonic A3 (1) up to A4 (8): an independent spelling of the folk tune.
    const DEGREES = '5 2 3 4 3 2 | 1 1 3 5 4 3 | 2 3 4 5 | 3 1 1 | 4 6 8 7 6 | 5 3 5 4 3 | 2 2 3 4 5 | 3 1 1';
    const A_MINOR = [57, 59, 60, 62, 64, 65, 67, 69];
    const want = bars(DEGREES).map((bar) => bar.map((d) => name(A_MINOR[Number(d) - 1])));
    const got = trackNamed(song, 'Melody').measures.map((m) => m.beats.flatMap((b) => b.notes.map((n) => name(n.midi))));
    expect(got).toEqual(want);
  });

  it('plays the tune twice, and only bar 5 leaves first position', () => {
    expect(song.bars[0].repeatStart).toBe(true);
    expect(song.bars[7].repeatEnd).toBeTruthy();
    expect(flattenSong(song).bars.length).toBe(16);
    const high = struckNotes(trackNamed(song, 'Melody')).filter((n) => n.fret > 4);
    expect(high.map((n) => `${n.bar + 1}:${n.string}:${n.fret}:${name(n.midi)}`)).toEqual(['5:1:5:A4']);
  });

  it('the strum part is one downstrum per beat on Am, E7 and Dm', () => {
    const strum = trackNamed(song, 'Strum');
    expect(strum.role).toBe('rhythm');
    strum.measures.forEach((m, bar) => {
      expect(m.beats.map((b) => b.start), `bar ${bar + 1}`).toEqual(EVERY_BEAT);
      for (const b of m.beats) {
        expect(b.slash && b.stroke, `bar ${bar + 1}, tick ${b.start}`).toBe('down');
        expect(['Am', 'E7', 'Dm']).toContain(chordAt(song, bar, b.start)?.symbol);
      }
    });
    expect(Object.keys(planShapes('korobeiniki')).sort()).toEqual(['Am', 'Dm', 'E7']);
  });
});

describe('batch 7: canon-in-d, the ground bass and the canon', () => {
  const song = load('canon-in-d');
  const yours = trackNamed(song, 'Your part');

  it("your bass line is exactly the plan's frets, one note per beat, four times", () => {
    // Read from the plan's own words: "the open string 4 (D), ..., string 6 fret 3 (G), ...".
    const notes = (plan as { pieces: Array<{ id: string; notes?: string }> }).pieces.find((p) => p.id === 'canon-in-d')!.notes!;
    const bassText = notes.slice(0, notes.indexOf('later as chords'));
    const fromPlan = [...bassText.matchAll(/(?:the open string (\d)|string (\d) fret (\d+)) \(([A-G]#?)\)/g)].map((m) =>
      m[1] ? { string: Number(m[1]), fret: 0, note: m[4] } : { string: Number(m[2]), fret: Number(m[3]), note: m[4] },
    );
    expect(fromPlan.map((p) => p.note)).toEqual(['D', 'A', 'B', 'F#', 'G', 'D', 'G', 'A']);
    const played = struckNotes(yours).filter((n) => n.bar < 8);
    expect(played.length).toBe(32);
    played.forEach((n, i) => {
      const p = fromPlan[i % 8];
      expect(n.tick % PPQ, `note ${i + 1} on the beat`).toBe(0);
      expect({ string: n.string, fret: n.fret, note: name(n.midi).replace(/\d+$/, '') }, `bass note ${i + 1}`).toEqual(p);
    });
    // Sounding: D3 A2 B2 F#2 G2 D3 G2 A2 (the D an octave up where a guitar has no low D).
    expect(played.slice(0, 8).map((n) => name(n.midi))).toEqual(['D3', 'A2', 'B2', 'F#2', 'G2', 'D3', 'G2', 'A2']);
  });

  it('then strums the chords, one downstrum per beat, and ends on D', () => {
    for (let bar = 8; bar < 16; bar++) {
      const m = yours.measures[bar];
      expect(m.beats.map((b) => b.start), `bar ${bar + 1}`).toEqual(EVERY_BEAT);
      for (const b of m.beats) expect(b.slash && b.stroke, `bar ${bar + 1}`).toBe('down');
    }
    expect(yours.measures[16].beats.map((b) => [b.duration, b.slash])).toEqual([[4 * PPQ, true]]);
    const strummed = [...new Set(song.chords.filter((c) => c.bar >= 8).map((c) => `${c.symbol}=${shapeOf(c.voicing)}`))].sort();
    // The plan's shapes, with the open Bm7 and the small F#m it asks for before barre chords.
    expect(strummed).toEqual(['A=x02220', 'Bm7=x20202', 'D=xx0232', 'F#m=xx4222', 'G=320003']);
    expect(planShapes('canon-in-d')).toMatchObject({ D: 'xx0232', A: 'x02220', Bm7: 'x20202', 'F#m': 'xx4222', G: '320003' });
  });

  it('the first violin line is the chord-tone pattern of the ground', () => {
    // An independent derivation: each quarter of the first statement is the third or fifth of
    // the chord in force, of the second the root or third, descending by step throughout.
    const roles = (symbol: string, role: number) => chordNotes(symbol)[role];
    const first = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'].map((c, i) => roles(c, [1, 2, 1, 2, 1, 2, 1, 1][i]));
    const second = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'].map((c, i) => roles(c, [0, 1, 0, 1, 0, 1, 0, 2][i]));
    const v1 = struckNotes(trackNamed(song, 'Violin 1'));
    expect(v1.filter((n) => n.bar === 2 || n.bar === 3).map((n) => name(n.midi).replace(/\d+$/, ''))).toEqual(first);
    expect(v1.filter((n) => n.bar === 4 || n.bar === 5).map((n) => name(n.midi).replace(/\d+$/, ''))).toEqual(second);
    expect(first).toEqual(['F#', 'E', 'D', 'C#', 'B', 'A', 'B', 'C#']);
    expect(second).toEqual(['D', 'C#', 'B', 'A', 'G', 'F#', 'G', 'E']);
  });

  it('is a canon: violins 2 and 3 play the first violin line two and four bars later', () => {
    const line = (t: string) => trackNamed(song, t).measures.map((m) => m.beats.map((b) => `${b.notes.map((n) => n.midi).join('+') || 'r'}:${b.duration}`).join(' '));
    const [v1, v2, v3] = ['Violin 1', 'Violin 2', 'Violin 3'].map(line);
    for (const start of [0, 8]) {
      for (let k = 2; k < 8; k++) {
        if (k + 2 < 8) expect(v2[start + k + 2], `violin 2, bar ${start + k + 3}`).toBe(v1[start + k]);
        if (k + 4 < 8) expect(v3[start + k + 4], `violin 3, bar ${start + k + 5}`).toBe(v1[start + k]);
      }
      // In the second half, bar 9 holds each violin's landing note (one quarter, then rests).
      const from = start === 0 ? 0 : 1;
      for (let k = from; k < 4; k++) expect(v2[start + k], `violin 2 rests, bar ${start + k + 1}`).toMatch(/^r:\d+$/);
      for (let k = from; k < 6; k++) expect(v3[start + k], `violin 3 rests, bar ${start + k + 1}`).toMatch(/^r:\d+$/);
      if (start === 8) expect(v1[start + 1], 'violin 1 rests in bar 10').toMatch(/^r:\d+$/);
    }
    // The landing notes resolve each violin's last note by step: G-F#, E-D, C#-D.
    const land = ['Violin 1', 'Violin 2', 'Violin 3'].map((t) => trackNamed(song, t).measures[8].beats.map((b) => [name(b.notes[0]?.midi ?? null), b.duration]));
    expect(land).toEqual([
      [['F#3', PPQ], ['rest', PPQ], ['rest', 2 * PPQ]],
      [['D3', PPQ], ['rest', PPQ], ['rest', 2 * PPQ]],
      [['D4', PPQ], ['rest', PPQ], ['rest', 2 * PPQ]],
    ]);
  });

  it('every violin note on a beat belongs to the chord of that beat', () => {
    const want = SONGS.find((s) => s.id === 'canon-in-d')!;
    const problems: string[] = [];
    for (const t of ['Violin 1', 'Violin 2', 'Violin 3']) {
      for (const n of struckNotes(trackNamed(song, t))) {
        if (n.tick % PPQ) continue;
        const symbol = harmonyAt(want, n.bar, n.tick)!;
        if (!chordPcs(symbol).includes(n.midi % 12)) problems.push(`${t}, bar ${n.bar + 1}: ${name(n.midi)} over ${symbol}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the last bar is a D major chord in every part', () => {
    const last = song.tracks.flatMap((t) => t.measures[16].beats.flatMap((b) => b.notes.map((n) => n.midi % 12)));
    expect(new Set(last).size).toBeGreaterThan(0);
    for (const pc of last) expect(chordPcs('D')).toContain(pc);
    expect(chordAt(song, 16, 0)?.symbol).toBe('D');
  });
});
