/**
 * Recovery batch d0: The First Noel, Home on the Range and Mo Li Hua (Jasmine Flower). All three
 * were left out or cut short earlier (recovery b0 and c0) because no single writer could vouch for
 * the tune note for note. Their melodies were then recovered in two steps, each by comparing
 * independent recollections: first the opening (two of five agreed exactly), then the rest of the
 * tune (recollections given the agreed opening wrote only what follows). The agreed melody is the
 * two parts joined. The arranger's rule: write the agreed span only if it ends where a piece can
 * end; if not, write the longest stretch from the start that does and still gives what the plan
 * entry asks for, or skip the song.
 *
 * - the-first-noel (pickup + 24 bars; bars 1-23 by 2 of 5, bar 24 by 2 of 3 continuations): the
 *   span ends on F#4 held for the whole of bar 24, the last note of the refrain ("Israel"), over
 *   the home chord D. It is written whole: verse 1 (pickup to bar 16) and the refrain (17-24).
 * - home-on-the-range (pickup + 17 bars; bars 1-13 by 2 of 5, bars 14-17 by 4 of 5): bar 17 is
 *   the first note of the chorus ("Home", D5 held for the bar), so the span does not end where a
 *   piece can end. Bars 15-16 hold the tonic G on "day" for five beats, the end of the verse, so
 *   the song is the pickup and bars 1-16, the whole first verse. That verse has every chord the
 *   plan names (G, C, D7 and A7) and its A7-to-D7 move, in waltz time.
 * - mo-li-hua (18 bars; bars 1-17 by 2 of 5, bar 18 by 3 of 5): bars 17-18 open the second half
 *   of the verse and stop on a short B, mid-line. The longest stretch from the start that ends is
 *   still bars 1-16, the first half of the verse ending on G, which recovery b0 already wrote, so
 *   the song is unchanged (b0 keeps its detailed checks; this file checks it against the longer
 *   agreed text).
 *
 * The agreed melodies below are copied exactly as they were handed to the arranger (PITCH:DURATION
 * as sung, C4 = middle C), not from the SixTab files. Each song is parsed with the song core and
 * its melody track's sounding notes and durations must equal the agreed melody exactly, bar by
 * bar (ties included), with one octave shift allowed for the whole line. Then: notes on strong
 * beats against the chord in force, the chord shapes against what they sound, the plan's chords,
 * key, meter, level and tempo, the words and where their syllables fall, the parts (the teacher's
 * strum, the learner's waltz strum), the phrase reuse The First Noel is meant to show, the teacher
 * tasks that open these songs, and the origin line in meta.ts.
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, validateSong, type Song, type Track } from '@/core/song';
import { buildVoicing } from '@/core/guitar';
import { chordPcs, chordToRoman, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';
import plan from '@/content/plan/repertoire.json';
import { TEACHER_KEYS, isTaskStep, loadTeacherCourse, taskSong, type TaskStep } from '@/content/teachers';

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

const NOEL_AGREED = `
pickup: F#4:e E4:e
bar 1: D4:q. E4:e F#4:e G4:e
bar 2: A4:h B4:e C#5:e
bar 3: D5:q C#5:q B4:q
bar 4: A4:h B4:e C#5:e
bar 5: D5:q C#5:q B4:q
bar 6: A4:q B4:q C#5:q
bar 7: D5:q A4:q G4:q
bar 8: F#4:h F#4:e E4:e
bar 9: D4:q. E4:e F#4:e G4:e
bar 10: A4:h B4:e C#5:e
bar 11: D5:q C#5:q B4:q
bar 12: A4:h B4:e C#5:e
bar 13: D5:q C#5:q B4:q
bar 14: A4:q B4:q C#5:q
bar 15: D5:q A4:q G4:q
bar 16: F#4:h F#4:e E4:e
bar 17: D4:q. E4:e F#4:e G4:e
bar 18: A4:h D5:e C#5:e
bar 19: B4:h B4:q
bar 20: A4:h.
bar 21: D5:q C#5:q B4:q
bar 22: A4:q B4:q C#5:q
bar 23: D5:q A4:q G4:q
bar 24: F#4:h.
`;

const HOME_AGREED = `
pickup: D4:q
bar 1: D4:q G4:q A4:q
bar 2: B4:h G4:e F#4:e
bar 3: E4:q C5:q C5:q
bar 4: C5:h B4:e C5:e
bar 5: D5:h G4:e G4:e
bar 6: G4:q F#4:q G4:q
bar 7: A4:h.~
bar 8: A4:h D4:q
bar 9: D4:q G4:q A4:q
bar 10: B4:h G4:e F#4:e
bar 11: E4:q C5:q C5:q
bar 12: C5:h B4:e C5:e
bar 13: D5:h C5:e B4:e
bar 14: A4:q G4:q F#4:q
bar 15: G4:h.~
bar 16: G4:h r:q
bar 17: D5:h.
`;

const MO_LI_HUA_AGREED = `
bar 1: B4:q B4:e D5:e
bar 2: E5:e G5:e G5:e E5:e
bar 3: D5:q D5:e E5:e
bar 4: D5:h
bar 5: B4:q B4:e D5:e
bar 6: E5:e G5:e G5:e E5:e
bar 7: D5:q D5:e E5:e
bar 8: D5:h
bar 9: D5:q D5:q
bar 10: D5:q B4:e D5:e
bar 11: E5:q E5:q
bar 12: D5:h
bar 13: B4:q A4:e B4:e
bar 14: D5:q B4:e A4:e
bar 15: G4:q G4:e A4:e
bar 16: G4:h
bar 17: B4:e A4:e G4:e B4:e
bar 18: A4:q. B4:e
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

const name = (midi: number) => midiToNote(midi, { prefer: 'sharps' });
const pc = (m: number) => ((m % 12) + 12) % 12;
/** "D4:q", "r:e", "A4:h.~": an event as text, its pitch moved by `shift` semitones. */
const token = (e: Ev, shift = 0) => `${e.midi === null ? 'r' : name(e.midi + shift)}:${NAME_OF_TICKS.get(e.ticks) ?? `${e.ticks}t`}${e.tie ? '~' : ''}`;
const barText = (bar: Ev[], shift = 0) => bar.map((e) => token(e, shift)).join(' ');

/**
 * A track's bars as events, in the agreed text's form: a held (tied) beat is its own event, and
 * the event before it carries the tie, even across a bar line.
 */
function trackEvents(track: Track): Ev[][] {
  const bars: Ev[][] = [];
  let last: Ev | null = null;
  for (const m of track.measures) {
    const out: Ev[] = [];
    for (const b of m.beats) {
      const struck = b.notes.filter((n) => !n.tie);
      if (struck.length > 1) throw new Error('a chord in the melody track');
      if (b.notes.length && !struck.length) {
        if (last) last.tie = true;
        last = { midi: b.notes[0].midi, ticks: b.duration, tie: false };
      } else last = { midi: struck.length ? struck[0].midi : null, ticks: b.duration, tie: false };
      out.push(last);
    }
    bars.push(out);
  }
  return bars;
}

interface Spec {
  id: string;
  agreed: string;
  /** The melody track's name. */
  melody: string;
  /** The agreed bars the song plays (pickup = bar 0), in the agreed text's numbering. */
  written: [number, number];
  /** How many times the song plays them. */
  passes: number;
  pickup: boolean;
  /** Ticks in a bar, and the strong beats inside it (ticks from the bar line). */
  bar: number;
  strong: number[];
}

const SPECS: Spec[] = [
  { id: 'the-first-noel', agreed: NOEL_AGREED, melody: 'Melody', written: [0, 24], passes: 1, pickup: true, bar: 3 * PPQ, strong: [0, PPQ, 2 * PPQ] },
  { id: 'home-on-the-range', agreed: HOME_AGREED, melody: 'Tune', written: [0, 16], passes: 1, pickup: true, bar: 3 * PPQ, strong: [0, PPQ, 2 * PPQ] },
  { id: 'mo-li-hua', agreed: MO_LI_HUA_AGREED, melody: 'Melody', written: [1, 16], passes: 2, pickup: false, bar: 2 * PPQ, strong: [0, PPQ] },
];
const spec = (id: string) => SPECS.find((s) => s.id === id)!;

/** The agreed bars by number (pickup = 0). */
function numbered(s: Spec): Map<number, Ev[]> {
  return new Map(parseAgreed(s.agreed).map((b, i) => [s.pickup ? i : i + 1, b]));
}

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  expect(result.warnings, `${id}/song.sixtab has no warnings`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, trackName: string): Track {
  const t = song.tracks.find((x) => x.name === trackName);
  if (!t) throw new Error(`no track "${trackName}": ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

/**
 * The melody track against the agreed bars it plays, pass by pass and bar by bar: the octave
 * shift taken from the first note, and every bar whose notes, durations or ties differ.
 */
function compareMelody(s: Spec, song: Song): { shift: number; mismatches: string[] } {
  const bars = numbered(s);
  const want: Array<[number, Ev[]]> = [];
  for (let n = s.written[0]; n <= s.written[1]; n++) want.push([n, bars.get(n)!]);
  const got = trackEvents(trackNamed(song, s.melody));
  const mismatches: string[] = [];
  if (got.length !== want.length * s.passes) mismatches.push(`${got.length} bars in the melody track, ${want.length * s.passes} expected`);
  const firstGot = got.flat().find((e) => e.midi !== null)!.midi!;
  const firstWant = want.flatMap(([, b]) => b).find((e) => e.midi !== null)!.midi!;
  const shift = firstGot - firstWant;
  for (let p = 0; p < s.passes; p++) {
    want.forEach(([n, bar], i) => {
      const g = barText(got[p * want.length + i] ?? []);
      const w = barText(bar, shift);
      if (g !== w) mismatches.push(`bar ${n}${s.passes > 1 ? ` (pass ${p + 1})` : ''}: plays "${g}", agreed "${w}"`);
    });
  }
  return { shift, mismatches };
}

/** Every struck note of a track with its bar, position in the bar and the chord in force. */
function struckNotes(song: Song, track: Track) {
  const tl = flattenSong(song);
  return tl
    .trackBeats(track.id)
    .filter((b) => b.notes.some((n) => !n.tie))
    .map((b) => {
      const bar = tl.barAt(b.tick);
      const note = b.notes.find((n) => !n.tie)!;
      return { bar: b.bar, inBar: b.tick - bar.start, pickup: song.bars[b.bar].length !== undefined, midi: note.midi, note, lyric: b.source.lyric, chord: tl.chordAt(b.tick)?.symbol ?? null };
    });
}

/** "bar 4 beat 1" for a note: bars numbered as in the agreed text. */
const where = (s: Spec, n: { bar: number; inBar: number }) => `bar ${s.pickup ? n.bar : n.bar + 1} beat ${n.inBar / PPQ + 1}`;

/**
 * Notes on the beat against the chord in force. Beat 1, the strong beat, must always be a chord
 * tone. On the other beats listed a non-chord tone is allowed only as a passing or neighbour note:
 * the line leaves it by step (one or two semitones) and keeps moving by step until it reaches a
 * tone of the chord then in force. Those are returned so each one is named. The pickup has no
 * chord in force and is not checked.
 */
function strongBeats(s: Spec, song: Song) {
  const notes = struckNotes(song, trackNamed(song, s.melody));
  const isChordTone = (n: (typeof notes)[number]) => !!n.chord && chordPcs(n.chord).includes(pc(n.midi));
  const problems: string[] = [];
  const passing: string[] = [];
  notes.forEach((n, i) => {
    if (n.pickup || !s.strong.includes(n.inBar)) return;
    if (!n.chord) return problems.push(`${where(s, n)}: ${name(n.midi)} with no chord in force`);
    if (isChordTone(n)) return;
    if (n.inBar === 0) return problems.push(`${where(s, n)}: ${name(n.midi)} is not in ${n.chord} (beat 1)`);
    let target: (typeof notes)[number] | null = null;
    for (let j = i; j + 1 < notes.length; j++) {
      const step = Math.abs(notes[j + 1].midi - notes[j].midi);
      if (step < 1 || step > 2) break;
      if (isChordTone(notes[j + 1])) {
        target = notes[j + 1];
        break;
      }
    }
    if (target) passing.push(`${where(s, n)}: ${name(n.midi)} over ${n.chord}, by step to ${name(target.midi)}`);
    else problems.push(`${where(s, n)}: ${name(n.midi)} is not in ${n.chord} and does not move by step to a chord tone`);
  });
  return { problems, passing };
}

/** A chord shape low string first: x32010. */
const shapeText = (v: ReadonlyArray<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
/** What a shape sounds in standard tuning, low to high. */
const shapeSounds = (frets: string) => [...frets].flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)]));

/** Every chord change checked against its shape: the shape sounds every chord tone and nothing else. */
function shapeProblems(song: Song, shapes: Record<string, string>): string[] {
  const out: string[] = [];
  for (const ch of song.chords) {
    const frets = shapeText(ch.voicing);
    if (frets !== shapes[ch.symbol]) out.push(`${ch.symbol} at bar ${ch.bar}: shape ${frets}, planned ${shapes[ch.symbol]}`);
    const sounds = shapeSounds(frets);
    const tones = chordPcs(ch.symbol);
    if (sounds.some((m) => !tones.includes(pc(m)))) out.push(`${ch.symbol}=${frets} sounds a note outside the chord`);
    if ([...new Set(sounds.map(pc))].sort().join() !== [...tones].sort().join()) out.push(`${ch.symbol}=${frets} leaves out a chord tone`);
    try {
      buildVoicing(ch.symbol, frets);
    } catch {
      out.push(`${ch.symbol}=${frets}: the guitar engine cannot build it`);
    }
  }
  return out;
}

/** The chord in force on beat 1 of every bar (pickup = bar 0, null when none). */
function chordsByBar(song: Song): Array<string | null> {
  const tl = flattenSong(song);
  return tl.bars.map((b) => tl.chordAt(b.start)?.symbol ?? null);
}

/** The words of a track as text: "A-" joins the next syllable, other syllables are separated by a space. */
function words(track: Track): string {
  let out = '';
  for (const b of track.measures.flatMap((m) => m.beats)) {
    if (!b.lyric) continue;
    const joined = out.endsWith('-');
    out = joined ? out.slice(0, -1) + b.lyric : out ? `${out} ${b.lyric}` : b.lyric;
  }
  return out;
}

interface PlanPiece {
  id: string;
  level: number;
  key: string;
  meter: string;
  tempo: number;
  arrangement: string;
  notes: string;
  teaches: string[];
  publicDomain: { music: string; lyrics: string };
}
const planned = (id: string) => (plan as { pieces: PlanPiece[] }).pieces.find((p) => p.id === id)!;
const KIND_OF_ARRANGEMENT: Record<string, string> = {
  'melody with chords': 'melody-with-chords',
  'strum and sing': 'strum-and-sing',
  'single-line melody': 'melody',
};

/** Every teacher task, in every written unit of every teacher, that opens the given song. */
async function tasksFor(id: string): Promise<Array<{ unit: string; task: TaskStep }>> {
  const courses = await Promise.all(TEACHER_KEYS.map((t) => loadTeacherCourse(t)));
  return courses.flatMap((c) =>
    c.units.flatMap((u) =>
      u.lessons.flatMap((l) => l.steps.filter((st): st is TaskStep => isTaskStep(st) && taskSong(st) === id).map((task) => ({ unit: u.id, task }))),
    ),
  );
}
const plain = (t: TaskStep['body']) => (typeof t === 'string' ? t : t.text);

// ------------------------------------------------------------------ the checks

describe('recovery d0: the agreed melodies are read correctly', () => {
  it('reads the notation (dots, sharps, ties, rests) and every bar adds up to its meter', () => {
    expect(parseAgreed('bar 1: C#5:q. r:e A4:h.~')[0].map((e) => token(e))).toEqual(['C#5:q.', 'r:e', 'A4:h.~']);
    const sizes: Record<string, number> = { 'the-first-noel': 25, 'home-on-the-range': 18, 'mo-li-hua': 18 };
    for (const s of SPECS) {
      const bars = numbered(s);
      expect(bars.size, `${s.id}: bars`).toBe(sizes[s.id]);
      for (const [n, bar] of bars) expect(bar.reduce((t, e) => t + e.ticks, 0), `${s.id} bar ${n}`).toBe(n === 0 ? PPQ : s.bar);
    }
  });
});

describe.each(SPECS.map((s) => [s.id, s] as [string, Spec]))('recovery d0: %s', (id, s) => {
  it('plays the agreed bars it writes exactly, note for note, duration for duration and tie for tie (one octave shift for the whole line)', async () => {
    const song = await load(id);
    const { shift, mismatches } = compareMelody(s, song);
    expect(Math.abs(shift % 12), `the line may move only by whole octaves (moved ${shift} semitones)`).toBe(0);
    expect(shift, 'the guitar plays the sung line an octave lower').toBe(-12);
    expect(mismatches).toEqual([]);
    expect(song.bars, 'one bar of the song per agreed bar written, per pass').toHaveLength((s.written[1] - s.written[0] + 1) * s.passes);
    expect(song.bars[0].length, s.pickup ? 'a one-beat pickup' : 'no pickup').toBe(s.pickup ? PPQ : undefined);
  });

  it('is a single line in the melody track: one note at a time, and every pitch is the fret it is written on', async () => {
    const song = await load(id);
    for (const [i, m] of trackNamed(song, s.melody).measures.entries()) {
      for (const b of m.beats) {
        expect(b.notes.length, `bar ${i}: at most one note per beat`).toBeLessThanOrEqual(1);
        for (const n of b.notes) expect(STANDARD[6 - n.string] + n.fret, `bar ${i}: string ${n.string} fret ${n.fret}`).toBe(n.midi);
      }
    }
  });

  it('follows the plan: level, key, meter, tempo and kind of arrangement', async () => {
    const song = await load(id);
    const item = planned(id);
    const entry = songEntry(id)!;
    expect(entry.level).toBe(item.level);
    expect(song.meta.difficulty).toBe(item.level);
    expect(entry.key).toBe(item.key);
    expect(entry.kind).toBe(KIND_OF_ARRANGEMENT[item.arrangement]);
    expect(`${song.bars[1].time.numerator}/${song.bars[1].time.denominator}`).toBe(item.meter);
    expect(song.tempo.map((t) => t.bpm)).toEqual([item.tempo]);
    expect(entry.plan).toBe(id);
    expect(validateSong(song).map((i) => i.message)).toEqual([]);
  });

  it('says in meta.ts that the melody is the one commonly sung or played today and that older printings vary', () => {
    const origin = songEntry(id)!.origin ?? '';
    expect(origin).toMatch(/commonly sung or played today/);
    expect(origin).toMatch(/older printings vary/);
  });

  it("lands near its level in the song core's difficulty estimate (the learner's first part)", async () => {
    const song = await load(id);
    const level = songEntry(id)!.level;
    const est = estimateDifficulty(song, { track: 0 });
    // The First Noel estimates 2 and Home on the Range 3: the estimate rates only the first part
    // (a first-position tune with no fast notes; a strum of open chords), not what the plan's
    // level 4 also asks for, swapping parts, singing over the strum and the A7-D7 change. Mo Li
    // Hua estimates 4 (its 5-fret "stretch" is the shift in bar 15; see recovery b0).
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; estimate ${est.level}; ${est.reasons.join(' ') || 'no hard spots'}`);
    expect(est.level, est.reasons.join(' ')).toBeGreaterThanOrEqual(level - 2);
    expect(est.level, est.reasons.join(' ')).toBeLessThanOrEqual(level + 2);
  });
});

describe('recovery d0: the comparison catches a wrong note, a wrong rhythm and a lost tie', () => {
  it('a G for the F# of bar 8 of The First Noel fails in bar 8 only', async () => {
    const text = await loadSongText('the-first-noel');
    const line ='"D=xx0232" q 2:3 3:2 3:0 | h 4:4 e 4:4 4:2 |\nlyrics: cer- tain';
    expect(text.split(line)).toHaveLength(2);
    const broken = parseSixTab(text.replace(line, line.replace('h 4:4', 'h 3:0'))).song!;
    expect(compareMelody(spec('the-first-noel'), broken).mismatches).toEqual(['bar 8: plays "G3:h F#3:e E3:e", agreed "F#3:h F#3:e E3:e"']);
  });

  it('even quarters for the dotted "D. E" of bar 17 of The First Noel fail in bar 17', async () => {
    const text = await loadSongText('the-first-noel');
    const line = '"D=xx0232" q. 4:0 e 4:2 4:4 3:0 | h 3:2 e 2:3 2:2 |';
    expect(text.split(line)).toHaveLength(2);
    const broken = parseSixTab(text.replace(line, '"D=xx0232" q 4:0 4:2 e 4:4 3:0 | h 3:2 e 2:3 2:2 |')).song!;
    expect(compareMelody(spec('the-first-noel'), broken).mismatches).toEqual(['bar 17: plays "D3:q E3:q F#3:e G3:e", agreed "D3:q. E3:e F#3:e G3:e"']);
  });

  it('a struck A for the held A of bar 8 of Home on the Range fails in bar 7, where the tie is lost', async () => {
    const text = await loadSongText('home-on-the-range');
    const line = '| h. 3:2 | h 3:- q 4:0 |';
    expect(text.split(line)).toHaveLength(2);
    const parsed = parseSixTab(text.replace(line, '| h. 3:2 | h 3:2 q 4:0 |').replace('lope play, where', 'lope play, _ where'));
    expect(parsed.errors).toEqual([]);
    expect(compareMelody(spec('home-on-the-range'), parsed.song!).mismatches).toEqual([
      'bar 7: plays "A3:h.", agreed "A3:h.~"',
    ]);
  });
});

describe('recovery d0: the-first-noel, verse 1 and the refrain', () => {
  const s = spec('the-first-noel');
  const bars = numbered(s);
  const SHAPES = { D: 'xx0232', G: '320003', A: 'x02220' };

  it('the agreed span ends where the carol ends: F#, the third of the home chord D, held for the whole of bar 24', () => {
    expect(barText(bars.get(24)!)).toBe('F#4:h.');
    expect(chordPcs('D')).toContain(pc(noteToMidi('F#4')));
    expect(Math.max(...bars.keys())).toBe(24);
  });

  it('has the chords D, G and A only, one a bar, each shape as the plan gives it and sounding its symbol', async () => {
    const song = await load(s.id);
    expect([...new Set(song.chords.map((c) => c.symbol))].sort()).toEqual(['A', 'D', 'G']);
    expect(shapeProblems(song, SHAPES)).toEqual([]);
    for (const ch of song.chords) expect(ch.tick, `${ch.symbol} at bar ${ch.bar}: changes on beat 1`).toBe(0);
    const line = ['D', 'D', 'G', 'D', 'G', 'A', 'D', 'D'];
    expect(chordsByBar(song)).toEqual([null, ...line, ...line, 'D', 'D', 'G', 'A', 'G', 'A', 'D', 'D']);
    expect(planned(s.id).notes).toContain('D (xx0232), G (320003), A (x02220)');
  });

  it('puts a chord tone on every beat 1, and every other note on a beat is a chord tone or steps to one', async () => {
    const song = await load(s.id);
    const { problems, passing } = strongBeats(s, song);
    expect(problems).toEqual([]);
    // The same passing notes in each line: B and C# run up to D, C# falls to B, G falls to F#.
    const line = (from: number) => [
      `bar ${from + 1} beat 3: B3 over D, by step to D4`,
      `bar ${from + 2} beat 2: C#4 over G, by step to B3`,
      `bar ${from + 3} beat 3: B3 over D, by step to D4`,
      `bar ${from + 4} beat 2: C#4 over G, by step to B3`,
      `bar ${from + 5} beat 2: B3 over A, by step to C#4`,
      `bar ${from + 6} beat 3: G3 over D, by step to F#3`,
    ];
    // The refrain has them only in its last line (bars 21-23), which is the verse's last line.
    expect(passing).toEqual([...line(1), ...line(9), ...line(17).slice(3)]);
    expect(passing.slice(-3)).toEqual(['bar 21 beat 2: C#4 over G, by step to B3', 'bar 22 beat 2: B3 over A, by step to C#4', 'bar 23 beat 3: G3 over D, by step to F#3']);
  });

  it('reuses one phrase: the verse is one line sung twice, and the refrain starts and ends with the verse', async () => {
    const song = await load(s.id);
    const got = trackEvents(trackNamed(song, 'Melody'));
    const chords = chordsByBar(song);
    // Bars 9-16 are bars 1-8, notes and chords.
    for (let n = 1; n <= 8; n++) {
      expect(barText(got[n + 8]), `bar ${n + 8}`).toBe(barText(got[n]));
      expect(chords[n + 8], `chord of bar ${n + 8}`).toBe(chords[n]);
    }
    // The refrain's last line, bars 21-24, is the verse's last line, bars 5-8 (the last note held).
    for (let n = 21; n <= 23; n++) {
      expect(barText(got[n]), `bar ${n}`).toBe(barText(got[n - 16]));
      expect(chords[n], `chord of bar ${n}`).toBe(chords[n - 16]);
    }
    expect(got[24][0].midi).toBe(got[8][0].midi);
    expect(chords[24]).toBe(chords[8]);
    // The refrain opens with the verse's opening figure: F# E | D. E F# G | A.
    const opening = (pick: number, bar: number) => [...got[pick].slice(-2), ...got[bar], got[bar + 1][0]].map((e) => token(e));
    expect(opening(16, 17)).toEqual(opening(0, 1));
    expect(opening(0, 1).join(' ')).toBe('F#3:e E3:e D3:q. E3:e F#3:e G3:e A3:h');
    // The score points it out where it happens.
    expect(song.annotations.map((a) => `${a.bar}:${a.text}`)).toEqual([
      '0:First position: the fret number is the finger',
      "9:The same eight bars again",
      '17:Refrain: it opens like the verse',
      "21:The verse's last line, note for note",
    ]);
    expect(song.sections.map((x) => `${x.name}@${x.start}`)).toEqual(['Verse@0', 'Refrain@17']);
    expect(planned(s.id).notes).toContain('Point out how the verse and the refrain reuse the same phrase.');
  });

  it('sings verse 1 and the refrain, with a syllable on every beat 1', async () => {
    const song = await load(s.id);
    const melody = trackNamed(song, 'Melody');
    expect(words(melody)).toBe(
      'The first Noel the angel did say, Was to certain poor shepherds in fields as they lay; In fields where they lay keeping their sheep, On a cold winter\'s night that was so deep. Noel, Noel, Noel, Noel, Born is the King of Israel.',
    );
    const downbeats = struckNotes(song, melody).filter((n) => !n.pickup && n.inBar === 0);
    expect(downbeats).toHaveLength(24);
    expect(downbeats.filter((n) => !n.lyric).map((n) => where(s, n))).toEqual([]);
    expect(planned(s.id).publicDomain.lyrics).toBe('Traditional words (verse 1 and the refrain).');
  });

  it('plays the tune in first position on strings 4, 3 and 2, one finger per fret, D3 to D4', async () => {
    const song = await load(s.id);
    const notes = struckNotes(song, trackNamed(song, 'Melody'));
    expect([...new Set(notes.map((n) => n.note.string))].sort()).toEqual([2, 3, 4]);
    for (const n of notes) {
      expect(n.note.fret, `${where(s, n)}: first position`).toBeLessThanOrEqual(4);
      if (n.note.finger !== undefined) expect(n.note.finger, `${where(s, n)}: finger = fret`).toBe(n.note.fret);
    }
    expect(name(Math.min(...notes.map((n) => n.midi)))).toBe('D3');
    expect(name(Math.max(...notes.map((n) => n.midi)))).toBe('D4');
    expect(notes.filter((n) => !scalePcs('D', 'major').includes(pc(n.midi)))).toEqual([]);
  });

  it('has the teacher strum the open chords on every beat, waiting through the pickup', async () => {
    const song = await load(s.id);
    const chords = trackNamed(song, 'Chords');
    expect(song.tracks.map((t) => `${t.name}:${t.role}`)).toEqual(['Melody:lead', 'Chords:rhythm']);
    expect(chords.measures[0].beats.map((b) => (b.slash ? 'strum' : b.notes.length ? 'note' : 'rest'))).toEqual(['rest']);
    chords.measures.slice(1).forEach((m, i) => {
      const last = i === chords.measures.length - 2;
      expect(m.beats.map((b) => `${NAME_OF_TICKS.get(b.duration)}${b.slash ? '/' : '?'}`), `bar ${i + 1}`).toEqual(last ? ['h./'] : ['q/', 'q/', 'q/']);
    });
  });
});

describe('recovery d0: home-on-the-range, the first verse', () => {
  const s = spec('home-on-the-range');
  const bars = numbered(s);
  const SHAPES = { G: '320003', C: 'x32010', D7: 'xx0212', A7: 'x02020' };
  /** The root the learner picks on beat 1 under each chord: string and fret. */
  const BASS: Record<string, string> = { G: '6:3', C: '5:3', A7: '5:0', D7: '4:0' };

  it('stops at bar 16: bar 17 is the chorus starting on D, and bars 15-16 hold the tonic G to end the verse', () => {
    expect(barText(bars.get(17)!)).toBe('D5:h.');
    expect(pc(noteToMidi('D5'))).not.toBe(pc(noteToMidi('G4')));
    expect(barText(bars.get(15)!)).toBe('G4:h.~');
    expect(barText(bars.get(16)!)).toBe('G4:h r:q');
    // Bars 13-16 come down by step to G: D C B | A G F# | G.
    expect([13, 14, 15].flatMap((n) => bars.get(n)!.map((e) => name(e.midi!)))).toEqual(['D5', 'C5', 'B4', 'A4', 'G4', 'F#4', 'G4']);
    // The four four-bar lines: the first three end on C, A and C; only the fourth comes home to G.
    expect([4, 7, 12, 15].map((n) => name(bars.get(n)![0].midi!))).toEqual(['C5', 'A4', 'C5', 'G4']);
  });

  it('has G, C, D7 and A7, each shape as the plan gives it and sounding its symbol', async () => {
    const song = await load(s.id);
    expect([...new Set(song.chords.map((c) => c.symbol))].sort()).toEqual(['A7', 'C', 'D7', 'G']);
    expect(shapeProblems(song, SHAPES)).toEqual([]);
    expect(chordsByBar(song)).toEqual([null, 'G', 'G', 'C', 'C', 'G', 'G', 'A7', 'D7', 'G', 'G', 'C', 'C', 'G', 'D7', 'G', 'G']);
    expect(planned(s.id).notes).toContain('G (320003), C (x32010), D7 (xx0212) and A7 (x02020)');
  });

  it('uses A7 as the V of V: it goes to D7, the V7 of G, which goes home to G', async () => {
    const song = await load(s.id);
    const seq = song.chords.map((c) => c.symbol);
    const at = seq.indexOf('A7');
    expect(seq.filter((c) => c === 'A7')).toHaveLength(1);
    expect(seq.slice(at, at + 3)).toEqual(['A7', 'D7', 'G']);
    expect(chordToRoman('A7', 'G', { next: 'D7' }).roman).toBe('V7/V');
    expect(chordToRoman('D7', 'G', { next: 'G' }).roman).toBe('V7');
  });

  it('puts a chord tone on every beat 1, and every other note on a beat is a chord tone or steps to one', async () => {
    const song = await load(s.id);
    const { problems, passing } = strongBeats(s, song);
    expect(problems).toEqual([]);
    expect(passing).toEqual([
      'bar 1 beat 3: A3 over G, by step to B3',
      'bar 4 beat 3: B3 over C, by step to C4',
      'bar 6 beat 2: F#3 over G, by step to G3',
      'bar 9 beat 3: A3 over G, by step to B3',
      'bar 12 beat 3: B3 over C, by step to C4',
      'bar 13 beat 3: C4 over G, by step to B3',
      // D7 is D F# A C: the G on "all" passes down to F#, the third.
      'bar 14 beat 2: G3 over D7, by step to F#3',
    ]);
    expect(chordPcs('D7')).not.toContain(pc(noteToMidi('G3')));
  });

  it('gives you the waltz strum Dev asks for: the root alone on beat 1, then down-up on beats 2 and 3', async () => {
    const song = await load(s.id);
    expect(song.tracks.map((t) => `${t.name}:${t.role}`)).toEqual(['Your strum:rhythm', 'Tune:lead']);
    const strum = trackNamed(song, 'Your strum');
    const tl = flattenSong(song);
    expect(strum.measures[0].beats.map((b) => (b.slash || b.notes.length ? 'sound' : 'rest')), 'the pickup: wait').toEqual(['rest']);
    strum.measures.slice(1).forEach((m, i) => {
      const n = i + 1;
      const chord = tl.chordAt(tl.bars[n].start)!.symbol;
      const [bass, ...rest] = m.beats;
      expect(bass.notes.map((x) => `${x.string}:${x.fret}`), `bar ${n}: the root of ${chord} alone on beat 1`).toEqual([BASS[chord]]);
      expect(pc(bass.notes[0].midi), `bar ${n}`).toBe(pc(noteToMidi(`${chord.replace('7', '')}4`)));
      expect(bass.duration).toBe(PPQ);
      const strums = rest.map((b) => `${NAME_OF_TICKS.get(b.duration)}${b.slash ? (b.stroke === 'up' ? 'U' : 'D') : '?'}`);
      expect(strums, `bar ${n}`).toEqual(n === 16 ? ['hD'] : ['eD', 'eU', 'eD', 'eU']);
    });
    const tasks = await tasksFor(s.id);
    expect(tasks.length).toBeGreaterThan(0);
    for (const { unit, task } of tasks) expect(plain(task.body), `${unit} > ${task.id}`).toContain('bass on 1 and down-up on 2 and 3');
  });

  it('sings the first verse, with a syllable on every struck beat 1', async () => {
    const song = await load(s.id);
    const tune = trackNamed(song, 'Tune');
    expect(words(tune)).toBe(
      'Oh, give me a home where the buffalo roam, where the deer and the antelope play, where seldom is heard a discouraging word, and the skies are not cloudy all day.',
    );
    const downbeats = struckNotes(song, tune).filter((n) => !n.pickup && n.inBar === 0);
    // Bars 8 and 16 begin with a held note (tied over the bar line), so 14 bars strike beat 1.
    expect(downbeats).toHaveLength(14);
    expect(downbeats.filter((n) => !n.lyric).map((n) => where(s, n))).toEqual([]);
    expect(planned(s.id).publicDomain.lyrics).toBe("Higley's words (verse 1 and the chorus).");
  });

  it('plays the tune in first position on strings 4, 3 and 2, D3 to D4', async () => {
    const song = await load(s.id);
    const notes = struckNotes(song, trackNamed(song, 'Tune'));
    expect([...new Set(notes.map((n) => n.note.string))].sort()).toEqual([2, 3, 4]);
    for (const n of notes) expect(n.note.fret, `${where(s, n)}: first position`).toBeLessThanOrEqual(4);
    expect(name(Math.min(...notes.map((n) => n.midi)))).toBe('D3');
    expect(name(Math.max(...notes.map((n) => n.midi)))).toBe('D4');
    expect(notes.filter((n) => !scalePcs('G', 'major').includes(pc(n.midi)))).toEqual([]);
  });
});

describe('recovery d0: mo-li-hua, still the first half of the verse', () => {
  const s = spec('mo-li-hua');
  const bars = numbered(s);

  it('bars 17-18, the newly agreed continuation, stop mid-line on a short B, so the song still ends at bar 16', () => {
    expect(barText(bars.get(17)!)).toBe('B4:e A4:e G4:e B4:e');
    expect(barText(bars.get(18)!)).toBe('A4:q. B4:e');
    const last = bars.get(18)!.at(-1)!;
    expect(pc(last.midi!), 'bar 18 does not end on the tonic').not.toBe(pc(noteToMidi('G4')));
    expect(last.ticks, 'and its last note is an eighth after the beat').toBe(PPQ / 2);
    // Every phrase end in the span is a note held for the whole bar; bars 17 and 18 hold nothing.
    const held = [...bars].filter(([, b]) => b.length === 1 && b[0].ticks === s.bar).map(([n, b]) => `${n}:${token(b[0])}`);
    expect(held).toEqual(['4:D5:h', '8:D5:h', '12:D5:h', '16:G4:h']);
  });

  it('puts chord tones on both beats of every bar, in both passes', async () => {
    const song = await load(s.id);
    expect(strongBeats(s, song)).toEqual({ problems: [], passing: [] });
  });

  it('keeps to the five notes of G major pentatonic', async () => {
    const song = await load(s.id);
    const notes = struckNotes(song, trackNamed(song, 'Melody'));
    expect(notes.filter((n) => !scalePcs('G', 'major-pentatonic').includes(pc(n.midi)))).toEqual([]);
  });
});

describe('recovery d0: the teacher tasks that open these songs', () => {
  it("name BPMs that are the song's tempo times the task's percentage (the plan's tempo is kept)", async () => {
    for (const id of ['the-first-noel', 'home-on-the-range', 'mo-li-hua']) {
      const song = await load(id);
      const bpm = song.tempo[0].bpm;
      expect(bpm).toBe(planned(id).tempo);
      const tasks = await tasksFor(id);
      expect(tasks.length, `${id}: a teacher task opens it`).toBeGreaterThan(0);
      for (const { unit, task } of tasks) {
        const where = `${unit} > ${task.id}`;
        const percent = Number((task.params ?? []).find((p) => /^t\d+$/.test(p))?.slice(1) ?? 100);
        const body = plain(task.body);
        expect(body, where).toContain(`100 % (${bpm} BPM)`);
        expect(body, where).toContain(`${Math.round((bpm * percent) / 100)} BPM`);
      }
    }
  });

  it("The First Noel task's open-chord version is what the song's Chords track plays", async () => {
    const song = await load('the-first-noel');
    const tasks = await tasksFor('the-first-noel');
    expect(tasks.length).toBeGreaterThan(0);
    for (const { unit, task } of tasks) {
      const body = plain(task.body);
      expect(body, `${unit} > ${task.id}`).toContain('The app plays the open-chord version');
      expect(body, `${unit} > ${task.id}`).toContain('One strum on each beat 1, two lighter ones after');
    }
    expect(trackNamed(song, 'Chords').role).toBe('rhythm');
    expect(new Set(song.chords.map((c) => shapeText(c.voicing)))).toEqual(new Set(['xx0232', '320003', 'x02220']));
  });
});
