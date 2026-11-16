/**
 * Recovery batch a0: songs left out earlier because no single writer could vouch for the tune note
 * for note, now written from a melody that independent recollections agreed on exactly (2 of 5
 * for Joy to the World, 2 of 3 for Auld Lang Syne).
 *
 * The agreed melodies below are copied exactly as they were handed to the arranger (PITCH:DURATION
 * as sung, C4 = middle C), not from the SixTab files. Each song is parsed with the song core and
 * its melody track's sounding notes and durations must equal the agreed melody exactly, bar by bar,
 * with one octave shift allowed for the whole line (the guitar plays it an octave below the sung
 * pitch, in first position). Then: notes on strong beats against the chord in force, the chord
 * shapes against what they sound, first-position frets and fingers, the plan's details, the words
 * under the notes, the learner's strum, and the origin line in meta.ts.
 *
 * god-rest-ye-merry-gentlemen is not written. Only its first 15 bars were agreed, and they stop
 * one note short of a phrase end: the last agreed note is F# on beat 4 of bar 15 ("comfort and
 * joy" resolves to E in bar 16), and the refrain's closing line ("O tidings of comfort and joy",
 * which returns to E minor as the plan asks) is not in the span. The last describe block records
 * that evidence from the agreed text itself.
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, validateSong, type Song, type Track } from '@/core/song';
import { buildVoicing } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const PPQ = 960;
const STANDARD = [40, 45, 50, 55, 59, 64];

/** Durations in the agreed notation, in ticks. */
const TICKS: Record<string, number> = {
  w: 4 * PPQ,
  'h.': 3 * PPQ,
  h: 2 * PPQ,
  'q.': 1.5 * PPQ,
  q: PPQ,
  'e.': 0.75 * PPQ,
  e: PPQ / 2,
  's.': 0.375 * PPQ,
  s: PPQ / 4,
  q3: (2 * PPQ) / 3,
  e3: PPQ / 3,
};
const NAME_OF_TICKS = new Map(Object.entries(TICKS).map(([k, v]) => [v, k]));

// ------------------------------------------------------------------ the agreed melodies, verbatim

const JOY_AGREED = `
bar 1: D5:q C#5:e. B4:s
bar 2: A4:q. G4:e
bar 3: F#4:q E4:q
bar 4: D4:q. A4:e
bar 5: B4:q. B4:e
bar 6: C#5:q. C#5:e
bar 7: D5:q. D5:e
bar 8: D5:e C#5:e B4:e A4:e
bar 9: A4:e. G4:s F#4:e D5:e
bar 10: D5:e C#5:e B4:e A4:e
bar 11: A4:e. G4:s F#4:e F#4:e
bar 12: F#4:e F#4:e F#4:e F#4:s G4:s
bar 13: A4:q. G4:s F#4:s
bar 14: E4:e E4:e E4:e E4:s F#4:s
bar 15: G4:q. F#4:s E4:s
bar 16: D4:e D5:q B4:e
bar 17: A4:e. G4:s F#4:e G4:e
bar 18: F#4:q E4:q
bar 19: D4:h
`;

const AULD_AGREED = `
pickup: A3:q
bar 1: D4:q. D4:e D4:q F#4:q
bar 2: E4:q. D4:e E4:q F#4:q
bar 3: D4:q. D4:e F#4:q A4:q
bar 4: B4:h. B4:q
bar 5: A4:q. F#4:e F#4:q D4:q
bar 6: E4:q. D4:e E4:q F#4:q
bar 7: D4:q. B3:e B3:q A3:q
bar 8: D4:h. B4:q
bar 9: A4:q. F#4:e F#4:q D4:q
bar 10: E4:q. D4:e E4:q B4:q
bar 11: A4:q. F#4:e F#4:q A4:q
bar 12: B4:h. D5:q
bar 13: A4:q. F#4:e F#4:q D4:q
bar 14: E4:q. D4:e E4:q F#4:q
bar 15: D4:q. B3:e B3:q A3:q
bar 16: D4:h. r:q
`;

const GOD_REST_AGREED = `
pickup: E4:q
bar 1: E4:q B4:q B4:q A4:q
bar 2: G4:q F#4:q E4:q D4:q
bar 3: E4:q F#4:q G4:q A4:q
bar 4: B4:h. E4:q
bar 5: E4:q B4:q B4:q A4:q
bar 6: G4:q F#4:q E4:q D4:q
bar 7: E4:q F#4:q G4:q A4:q
bar 8: B4:h. B4:q
bar 9: C5:q A4:q B4:q C5:q
bar 10: D5:q E5:q B4:q A4:q
bar 11: G4:q E4:q F#4:q G4:q
bar 12: A4:h G4:q A4:q
bar 13: B4:h C5:q B4:q
bar 14: B4:q A4:q G4:q F#4:q
bar 15: E4:h G4:q F#4:q
`;

/** One note or rest of a melody: MIDI (null for a rest), length in ticks, tied to the next. */
interface Ev {
  midi: number | null;
  ticks: number;
  tie: boolean;
}

/** "bar 3: D4:q. r:e A4:e~" lines into bars of events (a pickup line, when present, is bar 0). */
function parseAgreed(text: string): Ev[][] {
  const bars: Ev[][] = [];
  for (const line of text.trim().split('\n')) {
    const m = /^(pickup|bar \d+):\s*(.*)$/.exec(line.trim());
    if (!m) throw new Error(`unreadable line "${line}"`);
    bars.push(
      m[2]
        .trim()
        .split(/\s+/)
        .map((tok) => {
          const t = /^(r|[A-G][#b]?\d):([whqes]\.?3?)(~?)$/.exec(tok);
          if (!t || TICKS[t[2]] === undefined) throw new Error(`unreadable note "${tok}" in "${line}"`);
          return { midi: t[1] === 'r' ? null : noteToMidi(t[1]), ticks: TICKS[t[2]], tie: t[3] === '~' };
        }),
    );
  }
  return bars;
}

/** The melody bars of a track, from bar `from` (inclusive) to `to` (exclusive), as events. */
function trackEvents(track: Track, from: number, to: number): Ev[][] {
  return track.measures.slice(from, to).map((m) => {
    const out: Ev[] = [];
    for (const b of m.beats) {
      const struck = b.notes.filter((n) => !n.tie);
      if (b.notes.length && !struck.length) {
        // A tied beat: the note before it carries the tie.
        if (out.length) out[out.length - 1].tie = true;
        out.push({ midi: b.notes[0].midi, ticks: b.duration, tie: false });
        continue;
      }
      if (struck.length > 1) throw new Error(`a chord in the melody track (bar ${b.start})`);
      out.push({ midi: struck.length ? struck[0].midi : null, ticks: b.duration, tie: false });
    }
    return out;
  });
}

const name = (midi: number) => midiToNote(midi, { prefer: 'sharps' });
const pc = (m: number) => ((m % 12) + 12) % 12;
/** "D4:q", "r:e", "E4:h~": an event as text, its pitch moved by `shift` semitones. */
const token = (e: Ev, shift = 0) => `${e.midi === null ? 'r' : name(e.midi + shift)}:${NAME_OF_TICKS.get(e.ticks) ?? `${e.ticks}t`}${e.tie ? '~' : ''}`;

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, trackName: string): Track {
  const t = song.tracks.find((x) => x.name === trackName);
  if (!t) throw new Error(`no track "${trackName}": ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

/** A chord shape low string first: x20202. */
const shapeText = (v: ReadonlyArray<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');

/** What a shape sounds in standard tuning, low to high. */
const shapeSounds = (frets: string) => [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)]));

/** Every struck note of a track with its bar, position in the bar and the chord in force. */
function struckNotes(song: Song, track: Track) {
  const tl = flattenSong(song);
  return tl
    .trackBeats(track.id)
    .filter((b) => b.notes.some((n) => !n.tie))
    .map((b) => {
      const bar = tl.barAt(b.tick);
      return {
        bar: b.bar,
        inBar: b.tick - bar.start,
        midi: b.notes.find((n) => !n.tie)!.midi,
        chord: tl.chordAt(b.tick)?.symbol ?? null,
        notes: b.notes,
        lyric: b.source.lyric,
      };
    });
}

/**
 * Notes on strong beats must be tones of the chord in force. The one exception allowed is an
 * accented non-chord tone that resolves at once by step (one or two semitones) to the next note,
 * itself a tone of the chord then in force; those are returned separately so each one is named.
 */
function strongBeats(song: Song, track: Track, strong: number[], skipBar0: boolean) {
  const notes = struckNotes(song, track);
  const problems: string[] = [];
  const resolved: string[] = [];
  notes.forEach((n, i) => {
    if (skipBar0 && n.bar === 0) return;
    if (!strong.includes(n.inBar)) return;
    const where = `bar ${skipBar0 ? n.bar : n.bar + 1} beat ${n.inBar / PPQ + 1}`;
    if (!n.chord) return problems.push(`${where}: ${name(n.midi)} with no chord in force`);
    if (chordPcs(n.chord).includes(pc(n.midi))) return;
    const next = notes[i + 1];
    const step = next ? Math.abs(next.midi - n.midi) : 99;
    if (next && step >= 1 && step <= 2 && next.chord && chordPcs(next.chord).includes(pc(next.midi))) {
      resolved.push(`${where}: ${name(n.midi)} over ${n.chord} resolves to ${name(next.midi)}`);
    } else problems.push(`${where}: ${name(n.midi)} is not in ${n.chord} and does not resolve by step`);
  });
  return { problems, resolved };
}

/** The words of a stretch of a track as sung: "ac-" joins "quain-" joins "tance". */
function wordsOf(track: Track, from: number, to: number): string {
  return track.measures
    .slice(from, to)
    .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
    .map((l) => (l.endsWith('-') ? l.slice(0, -1) : `${l} `))
    .join('')
    .trim();
}

interface Case {
  id: string;
  melody: string;
  agreed: string;
  /** Each stretch of bars [from, to) that plays the agreed melody once (one per verse). */
  passes: Array<[number, number]>;
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
  pickup: boolean;
  /** Strong-beat non-chord tones that are there on purpose (each resolves by step). */
  resolved: string[];
  /** Chord symbols the plan allows. */
  chords: string[];
  /** The words, verse by verse, written out by hand from the source texts. */
  words: string[];
}

const CASES: Case[] = [
  {
    id: 'joy-to-the-world',
    melody: 'Melody',
    agreed: JOY_AGREED,
    passes: [
      [0, 19],
      [19, 38],
    ],
    strong: [0, PPQ],
    pickup: false,
    resolved: [],
    chords: ['A7', 'D', 'G'],
    words: [
      "Joy to the world! the Lord is come; Let earth receive her King; Let every heart prepare Him room, And heav'n and nature sing, And heav'n and nature sing, and heav'n and nature sing, And heav'n, and heav'n, and nature sing.",
      'Joy to the earth! the Saviour reigns; Let men their songs employ; While fields and floods, rocks, hills and plains Repeat the sounding joy, Repeat the sounding joy, repeat the sounding joy, Repeat, repeat the sounding joy.',
    ],
  },
  {
    id: 'auld-lang-syne',
    melody: 'Tune',
    agreed: AULD_AGREED,
    passes: [[0, 17]],
    strong: [0, 2 * PPQ],
    pickup: true,
    // Bm7 fills bars 7 and 15 (D, B, B, A are all tones of Bm7), so no strong beat needs an exception.
    resolved: [],
    chords: ['A', 'Bm7', 'D', 'G'],
    words: [
      "Should auld acquaintance be forgot, And never brought to mind? Should auld acquaintance be forgot, And auld lang syne? For auld lang syne, my jo, For auld lang syne, We'll tak a cup o' kindness yet, For auld lang syne.",
    ],
  },
];

/**
 * The melody track against the agreed melody, pass by pass and bar by bar: the octave shift taken
 * from the first note, and every bar whose notes or durations differ (with both versions).
 */
function compareMelody(song: Song, c: Case): { shift: number; mismatches: string[] } {
  const track = trackNamed(song, c.melody);
  const want = parseAgreed(c.agreed);
  const mismatches: string[] = [];
  const total = c.passes[c.passes.length - 1][1];
  if (track.measures.length !== total) mismatches.push(`${track.measures.length} bars in the melody track, ${total} expected`);
  const firstGot = trackEvents(track, 0, 1)[0].find((e) => e.midi !== null)!.midi!;
  const firstWant = want.flat().find((e) => e.midi !== null)!.midi!;
  const shift = firstGot - firstWant;
  for (const [from, to] of c.passes) {
    const got = trackEvents(track, from, to);
    if (got.length !== want.length) mismatches.push(`bars ${from + 1}-${to}: ${got.length} bars, ${want.length} agreed`);
    got.forEach((bar, i) => {
      const label = c.pickup ? (i === 0 ? 'pickup' : `bar ${i}`) : `bar ${i + 1}`;
      const g = bar.map((e) => token(e)).join(' ');
      const w = (want[i] ?? []).map((e) => token(e, shift)).join(' ');
      if (g !== w) mismatches.push(`${label} (pass from bar ${from + 1}): plays "${g}", agreed "${w}"`);
    });
  }
  return { shift, mismatches };
}

describe('recovery a0: the agreed melodies are read correctly', () => {
  it('reads the notation (durations, rests, sharps) and every bar adds up to its meter', () => {
    expect(parseAgreed('bar 1: C#5:e. r:s B4:q~')[0].map((e) => token(e))).toEqual(['C#5:e.', 'r:s', 'B4:q~']);
    const joy = parseAgreed(JOY_AGREED);
    expect(joy).toHaveLength(19);
    joy.forEach((bar, i) => expect(bar.reduce((s, e) => s + e.ticks, 0), `joy bar ${i + 1}`).toBe(2 * PPQ));
    const auld = parseAgreed(AULD_AGREED);
    expect(auld).toHaveLength(17);
    expect(auld[0].reduce((s, e) => s + e.ticks, 0)).toBe(PPQ);
    auld.slice(1).forEach((bar, i) => expect(bar.reduce((s, e) => s + e.ticks, 0), `auld bar ${i + 1}`).toBe(4 * PPQ));
  });
});

describe.each(CASES.map((c) => [c.id, c] as [string, Case]))('recovery a0: %s', (id, c) => {
  it('plays the agreed melody exactly, note for note and duration for duration (one octave shift for the whole line)', async () => {
    const song = await load(id);
    const { shift, mismatches } = compareMelody(song, c);
    expect(Math.abs(shift % 12), `${id}: the line may move only by whole octaves (moved ${shift} semitones)`).toBe(0);
    expect(shift, `${id}: the guitar plays the sung line an octave lower`).toBe(-12);
    expect(mismatches).toEqual([]);
  });

  it('puts chord tones on the strong beats (any exception must resolve by step at once and be named)', async () => {
    const song = await load(id);
    const { problems, resolved } = strongBeats(song, trackNamed(song, c.melody), c.strong, c.pickup);
    expect(problems).toEqual([]);
    expect(resolved).toEqual(c.resolved);
  });

  it("uses only the plan's chords, and every shape sounds its symbol", async () => {
    const song = await load(id);
    expect([...new Set(song.chords.map((ch) => ch.symbol))].sort()).toEqual(c.chords);
    for (const ch of song.chords) {
      if (!ch.voicing) continue;
      const frets = shapeText(ch.voicing);
      const sounds = shapeSounds(frets);
      const tones = chordPcs(ch.symbol);
      expect(sounds.map(pc).filter((p) => !tones.includes(p)), `${ch.symbol}=${frets}: notes outside the chord`).toEqual([]);
      expect([...new Set(sounds.map(pc))].sort(), `${ch.symbol}=${frets}: every chord tone sounds`).toEqual([...tones].sort());
      expect(() => buildVoicing(ch.symbol, frets)).not.toThrow();
    }
    expect(validateSong(song).map((i) => i.message)).toEqual([]);
  });

  it('stays in first position, one finger per fret', async () => {
    const song = await load(id);
    for (const n of struckNotes(song, trackNamed(song, c.melody))) {
      for (const note of n.notes) {
        expect(note.fret, `bar ${n.bar}: ${name(note.midi)}`).toBeLessThanOrEqual(4);
        if (typeof note.finger === 'number') expect(note.finger, `bar ${n.bar}: finger on fret ${note.fret}`).toBe(note.fret);
      }
    }
  });

  it('carries the words, one syllable per note, verse by verse', async () => {
    const song = await load(id);
    const track = trackNamed(song, c.melody);
    c.passes.forEach(([from, to], i) => expect(wordsOf(track, from, to), `${id}: verse ${i + 1}`).toBe(c.words[i]));
  });

  it('says in meta.ts that the melody is the one commonly sung today and that older printings vary', () => {
    const origin = songEntry(id)!.origin ?? '';
    expect(origin).toMatch(/commonly sung or played today/);
    expect(origin).toMatch(/older printings vary/);
  });

  it("lands near its level in the song core's difficulty estimate (the learner's part)", async () => {
    const song = await load(id);
    const level = songEntry(id)!.level;
    const yours = estimateDifficulty(song, { track: 0 });
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; estimate ${yours.level}; ${yours.reasons.join(' ') || 'no hard spots'}`);
    // Joy to the World estimates 5: the agreed dotted-eighth-sixteenth pairs at 72 read as
    // sixteenth-note rhythm and "fast notes", and the core's hand window starts at the first
    // fretted note (D, string 2 fret 3), so the C# at fret 2 looks like a 5-fret stretch that is
    // not there (first position, finger = fret, checked above). Auld Lang Syne's strum part
    // estimates 2: four even chords, all on frets 0 to 3.
    expect(yours.level).toBeGreaterThanOrEqual(level - 1);
    expect(yours.level, `${id}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(level + 2);
  });
});

describe('recovery a0: joy-to-the-world, the plan details', () => {
  it("plays the first phrase on exactly the plan's strings and frets, in the plan's rhythm", async () => {
    const song = await load('joy-to-the-world');
    const melody = trackNamed(song, 'Melody');
    const first = melody.measures.slice(0, 4).flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret}`)));
    expect(first.slice(0, 8)).toEqual(['2:3', '2:2', '2:0', '3:2', '3:0', '4:4', '4:2', '4:0']);
    // The eight notes are the D major scale walking down, home to home.
    const names = first.slice(0, 8).map((p) => {
      const [s, f] = p.split(':').map(Number);
      return name(STANDARD[6 - s] + f);
    });
    expect(names).toEqual(['D4', 'C#4', 'B3', 'A3', 'G3', 'F#3', 'E3', 'D3']);
    expect([...scalePcs('D', 'major')].sort((a, b) => a - b)).toEqual([...new Set(names.map((n) => pc(noteToMidi(n))))].sort((a, b) => a - b));
    const rhythm = melody.measures.slice(0, 4).flatMap((m) => m.beats.map((b) => NAME_OF_TICKS.get(b.duration)));
    expect(rhythm.slice(0, 8)).toEqual(['q', 'e.', 's', 'q.', 'e', 'q', 'q', 'q.']);
  });

  it('has the teacher strum two beats a bar through both verses, ending on a held D', async () => {
    const song = await load('joy-to-the-world');
    const teacher = trackNamed(song, 'Teacher');
    expect(teacher.role).toBe('rhythm');
    expect(teacher.measures).toHaveLength(38);
    teacher.measures.forEach((m, i) => {
      const end = i === 18 || i === 37;
      expect(m.beats.map((b) => `${NAME_OF_TICKS.get(b.duration)}${b.slash ? '/' : '?'}`), `bar ${i + 1}`).toEqual(end ? ['h/'] : ['q/', 'q/']);
    });
    expect(song.sections.map((s) => `${s.name}@${s.start}`)).toEqual(['Verse 1@0', 'Verse 2@19']);
  });
});

describe('recovery a0: auld-lang-syne, the plan details', () => {
  it('keeps the tune to the five notes of D major pentatonic, and every line starts with a pickup on beat 4', async () => {
    const song = await load('auld-lang-syne');
    const tune = trackNamed(song, 'Tune');
    const notes = struckNotes(song, tune);
    const penta = scalePcs('D', 'major-pentatonic');
    expect([...penta].sort((a, b) => a - b)).toEqual([2, 4, 6, 9, 11]);
    expect(notes.filter((n) => !penta.includes(pc(n.midi))).map((n) => `bar ${n.bar}: ${name(n.midi)}`)).toEqual([]);
    expect(song.bars[0].length, 'a one-beat pickup').toBe(PPQ);
    // The first word of each line (verse lines 1-4, chorus lines 1-4) sits on beat 4 of the bar before.
    const lineStarts = notes.filter((n) => /^(Should|And|For|We'll)$/.test(n.lyric ?? '')).map((n) => `${n.bar}@${n.inBar / PPQ + 1}:${n.lyric}`);
    expect(lineStarts).toEqual(['0@1:Should', '2@4:And', '4@4:Should', '6@4:And', '8@4:For', '10@4:For', '12@4:We\'ll', '14@4:For']);
  });

  it('gives you a silent pickup, quarters through the verse, down, down-up through the chorus, and one last strum', async () => {
    const song = await load('auld-lang-syne');
    const strum = trackNamed(song, 'Your strum');
    expect(song.tracks[0]).toBe(strum);
    expect(strum.role).toBe('rhythm');
    const dir = (b: { stroke?: string; slash?: boolean }) => (b.slash ? (b.stroke === 'down' ? 'D' : b.stroke === 'up' ? 'U' : '/') : 'r');
    const row = (i: number) => strum.measures[i].beats.map((b) => `${NAME_OF_TICKS.get(b.duration)}${dir(b)}`).join(' ');
    expect(row(0)).toBe('qr');
    for (let bar = 1; bar <= 8; bar++) expect(row(bar), `bar ${bar}`).toBe('qD qD qD qD');
    for (let bar = 9; bar <= 15; bar++) expect(row(bar), `bar ${bar}`).toBe('qD eD eU qD eD eU');
    expect(row(16)).toBe('wD');
    // The chords line by line, beat 1 and beat 3 of every bar.
    const tl = flattenSong(song);
    const byBar = tl.bars.slice(1).map((b) => `${tl.chordAt(b.start)?.symbol} ${tl.chordAt(b.start + 2 * PPQ)?.symbol}`);
    // One chord a bar, as in Mia's chart for the verse (D A D G, D A Bm D, with the open Bm7).
    const half = ['D D', 'A A', 'D D', 'G G', 'D D', 'A A', 'Bm7 Bm7', 'D D'];
    expect(byBar).toEqual([...half, ...half]);
    expect(song.chords.every((ch) => ch.tick === 0), 'no chord changes inside a bar').toBe(true);
    const shapes: Record<string, string> = { D: 'xx0232', A: 'x02220', G: '320003', Bm7: 'x20202' };
    for (const ch of song.chords) expect(shapeText(ch.voicing), `${ch.symbol} shape`).toBe(shapes[ch.symbol]);
    expect(song.sections.map((s) => `${s.name}@${s.start}`)).toEqual(['Verse@0', 'Chorus@9']);
  });

  it('glosses the Scots words beside the tune', async () => {
    const song = await load('auld-lang-syne');
    expect(song.annotations.map((a) => a.text)).toEqual(['auld lang syne: long ago', 'jo: dear', "tak: take; o': of"]);
  });
});

describe('recovery a0: the comparison catches a wrong note and a wrong rhythm', () => {
  it('a G played for the F# of the refrain in Joy to the World (string 3 open for string 4 fret 4) fails in bar 12', async () => {
    const text = await loadSongText('joy-to-the-world');
    const marker = '| e 4:4 4:4 4:4 s 4:4 3:0 |';
    expect(text.split(marker)).toHaveLength(3);
    const broken = parseSixTab(text.replace(marker, '| e 4:4 3:0 4:4 s 4:4 3:0 |')).song!;
    const { mismatches } = compareMelody(broken, CASES[0]);
    expect(mismatches).toEqual(['bar 12 (pass from bar 1): plays "F#3:e G3:e F#3:e F#3:s G3:s", agreed "F#3:e F#3:e F#3:e F#3:s G3:s"']);
  });

  it('even quarters for the long-short "be for-" of Auld Lang Syne fail in bar 2', async () => {
    const text = await loadSongText('auld-lang-syne');
    const before = '| q. 4:2{2} e 4:0 q 4:2 4:4 |';
    expect(text.split(before)).toHaveLength(2);
    const broken = parseSixTab(text.replace(before, '| q 4:2{2} 4:0 4:2 4:4 |')).song!;
    const { mismatches } = compareMelody(broken, CASES[1]);
    expect(mismatches).toEqual(['bar 2 (pass from bar 1): plays "E3:q D3:q E3:q F#3:q", agreed "E3:q. D3:e E3:q F#3:q"']);
  });
});

describe('recovery a0: why god-rest-ye-merry-gentlemen is left out', () => {
  it('the 15 agreed bars stop before a phrase end: the last note is F#, not the tonic E, on the weak beat 4', () => {
    const bars = parseAgreed(GOD_REST_AGREED);
    expect(bars).toHaveLength(16);
    bars.slice(1).forEach((bar, i) => expect(bar.reduce((s, e) => s + e.ticks, 0), `bar ${i + 1}`).toBe(4 * PPQ));
    const last = bars[bars.length - 1];
    const lastNote = last[last.length - 1];
    expect(name(lastNote.midi!)).toBe('F#4');
    const onset = last.slice(0, -1).reduce((s, e) => s + e.ticks, 0);
    expect(onset / PPQ + 1, 'beat of the last agreed note').toBe(4);
    expect(lastNote.ticks).toBe(PPQ);
    expect(pc(lastNote.midi!)).not.toBe(pc(noteToMidi('E4')));
    // The held notes of the span: the dominant B ending lines 1 and 2 (bars 4 and 8), A ending
    // line 3 (bar 12), B in the refrain (bar 13). The tonic E is held only in bar 15, and the tune
    // moves off it again (G, F#) before the agreed span ends.
    const held = bars.flatMap((bar, i) => bar.filter((e) => e.ticks >= 2 * PPQ).map((e) => `${i}:${name(e.midi!)}`));
    expect(held).toEqual(['4:B4', '8:B4', '12:A4', '13:B4', '15:E4']);
  });
});
