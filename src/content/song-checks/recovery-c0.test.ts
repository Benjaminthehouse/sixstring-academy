/**
 * Recovery batch c0: We Three Kings, The First Noel and Home on the Range. All three were left
 * out earlier because no single writer could vouch for the tune note for note. This time two of
 * five independent recollections agreed exactly on the opening of each tune, but none of the
 * agreed spans ends where a piece can end, so **none of the three is written**. The arranger's
 * rule: write only the agreed span, and only if it is a complete musical phrase; otherwise skip
 * the song. A shorter complete stretch at the start of a span counts only if it still gives what
 * the repertoire plan asks for (as Mo Li Hua's first 16 bars did in recovery b0).
 *
 * - we-three-kings (17 bars): bars 1-15 are the whole first verse, ending on the tonic E held
 *   for a bar. Bars 16-17 are the first three notes of the refrain ("O star of", three Ds), and
 *   the span stops on the D of "of", a quarter on beat 3. The verse alone would leave out the G
 *   major refrain that the plan entry names and that Mia's lesson asks the learner to listen for.
 * - the-first-noel (pickup + 23 bars): the span stops on G4, a quarter on beat 3 of bar 23. Each
 *   time this D A G bar comes earlier in the tune (bars 7 and 15), G falls to F# on the next
 *   downbeat, and that F# ends the line. The refrain's F# would be in bar 24, outside the span.
 *   The verse alone ends in bar 16 with the two eighths that lead into the refrain, and it would
 *   leave out the refrain that the plan asks the arrangement to compare with the verse.
 * - home-on-the-range (pickup + 13 bars): the span stops on a B4 eighth, the second half of beat
 *   3 of bar 13 ("and the skies are not ..."), in the first bar of the verse's fourth four-bar
 *   line. No line in the span comes home to G (the lines end on C, A and C), and the chorus is
 *   not in the span at all.
 *
 * What this file checks, all from the agreed text (copied exactly as it was handed to the arranger,
 * PITCH:DURATION as sung, C4 = middle C): the notation is read correctly and every bar adds up to
 * 3/4. The song core parses each span, laid on the guitar by the core's own arranger, and plays
 * back exactly the agreed notes and durations (so the claims below are about the agreed notes,
 * not about a misreading). Then: where each span stops and why that is not a phrase end, why the
 * complete stretch at its start does not meet the plan, and that every teacher lesson pointing to
 * these ids keeps its fallback while the song is not in the library.
 */
import { describe, expect, it } from 'vitest';
import { arrangeLine, flattenSong, parseSixTab, validateSong, type Song, type Track } from '@/core/song';
import { chordPcs, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';
import plan from '@/content/plan/repertoire.json';
import { TEACHER_KEYS, isTaskStep, loadTeacherCourse, taskSong, type TaskStep } from '@/content/teachers';

const PPQ = 960;
const BAR = 3 * PPQ;

/** Durations in the agreed notation, in ticks (the same tokens SixTab uses). */
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

const KINGS_AGREED = `
bar 1: B4:h A4:q
bar 2: G4:h E4:q
bar 3: F#4:q G4:q F#4:q
bar 4: E4:h.
bar 5: B4:h A4:q
bar 6: G4:h E4:q
bar 7: F#4:q G4:q F#4:q
bar 8: E4:h.
bar 9: G4:h G4:q
bar 10: A4:h B4:q
bar 11: B4:h B4:q
bar 12: D5:q C5:q B4:q
bar 13: A4:q B4:q A4:q
bar 14: G4:h F#4:q
bar 15: E4:h.
bar 16: D5:h.
bar 17: D5:h D5:q
`;

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
/** "D4:q", "r:e", "A4:h.~": an event as text. */
const token = (e: Ev) => `${e.midi === null ? 'r' : name(e.midi)}:${NAME_OF_TICKS.get(e.ticks) ?? `${e.ticks}t`}${e.tie ? '~' : ''}`;
const barText = (bar: Ev[]) => bar.map(token).join(' ');

interface Span {
  id: string;
  title: string;
  agreed: string;
  /** SixTab key. */
  key: string;
  pickup: boolean;
  /** Bars after the pickup that the recollections agreed on. */
  bars: number;
}

const SPANS: Span[] = [
  { id: 'we-three-kings', title: 'We Three Kings', agreed: KINGS_AGREED, key: 'Em', pickup: false, bars: 17 },
  { id: 'the-first-noel', title: 'The First Noel', agreed: NOEL_AGREED, key: 'D', pickup: true, bars: 23 },
  { id: 'home-on-the-range', title: 'Home on the Range', agreed: HOME_AGREED, key: 'G', pickup: true, bars: 13 },
];
const span = (id: string) => SPANS.find((s) => s.id === id)!;

/** The bars of a span numbered as the agreed text numbers them: bar n (pickup = bar 0). */
function numbered(s: Span): Map<number, Ev[]> {
  const bars = parseAgreed(s.agreed);
  return new Map(bars.map((b, i) => [s.pickup ? i : i + 1, b]));
}

/**
 * The span as a SixTab song: one lead track, each note on the string and fret the song core's
 * arranger picks for the whole line, at the sung pitch, a tie written as `string:-`.
 */
function spanSixTab(s: Span): string {
  const bars = parseAgreed(s.agreed);
  const flat = bars.flat();
  const tiedIn = flat.map((_, i) => i > 0 && flat[i - 1].tie);
  const struck = flat.filter((e, i) => e.midi !== null && !tiedIn[i]).map((e) => e.midi!);
  const places = arrangeLine(struck);
  let k = 0;
  let i = 0;
  let lastString = 0;
  const body = bars.map((bar) =>
    bar
      .map((e) => {
        const d = NAME_OF_TICKS.get(e.ticks)!;
        const into = tiedIn[i++];
        if (e.midi === null) return `${d} r`;
        if (into) return `${d} ${lastString}:-`;
        const p = places[k++];
        lastString = p.string;
        return `${d} ${p.string}:${p.fret}`;
      })
      .join(' '),
  );
  const pickupTicks = s.pickup ? bars[0].reduce((t, e) => t + e.ticks, 0) : 0;
  return [
    `title: ${s.title} (agreed span)`,
    'tempo: 96',
    'time: 3/4',
    `key: ${s.key}`,
    ...(s.pickup ? [`pickup: ${NAME_OF_TICKS.get(pickupTicks)}`] : []),
    '',
    'track: Agreed span',
    'role: lead',
    `| ${body.join(' | ')} ||`,
  ].join('\n');
}

/** A track's bars as events, ties joined the same way the agreed text writes them. */
function trackEvents(track: Track): Ev[][] {
  return track.measures.map((m) => {
    const out: Ev[] = [];
    for (const b of m.beats) {
      const struck = b.notes.filter((n) => !n.tie);
      if (b.notes.length && !struck.length) {
        // A tied beat: the note before it carries the tie (it may sit in the bar before).
        out.push({ midi: b.notes[0].midi, ticks: b.duration, tie: false });
        continue;
      }
      if (struck.length > 1) throw new Error('a chord in a single-line span');
      out.push({ midi: struck.length ? struck[0].midi : null, ticks: b.duration, tie: false });
    }
    return out;
  });
}

/** Mark ties across the whole track: an event is tied when the next one is its held continuation. */
function withTies(track: Track, bars: Ev[][]): Ev[][] {
  const beats = track.measures.flatMap((m) => m.beats);
  const flat = bars.flat();
  for (let i = 0; i < beats.length - 1; i++) {
    const next = beats[i + 1];
    if (next.notes.length && next.notes.every((n) => n.tie)) flat[i].tie = true;
  }
  return bars;
}

function parseSpan(s: Span): Song {
  const result = parseSixTab(spanSixTab(s));
  expect(result.errors, `${s.id}: the span as SixTab`).toEqual([]);
  return result.song!;
}

/** Where the last struck note of a song sits, in the agreed text's numbering. */
function lastNote(s: Span, song: Song) {
  const tl = flattenSong(song);
  const beats = tl.trackBeats(song.tracks[0].id).filter((b) => b.notes.some((n) => !n.tie));
  const b = beats[beats.length - 1];
  const bar = tl.barAt(b.tick);
  const note = b.notes.find((n) => !n.tie)!;
  return {
    bar: s.pickup ? b.bar : b.bar + 1,
    beat: (b.tick - bar.start) / PPQ + 1,
    name: name(note.midi),
    length: NAME_OF_TICKS.get(b.duration),
  };
}

interface PlanPiece {
  id: string;
  key: string;
  meter: string;
  tempo: number;
  teaches: string[];
  notes: string;
}
const planned = (id: string) => (plan as { pieces: PlanPiece[] }).pieces.find((p) => p.id === id)!;

/**
 * Every teacher task, in every written unit of every teacher, that opens the given song. Taken
 * from the registry rather than from named unit files, so a teacher moving or rewording a task
 * does not break this file: only what the songs depend on is checked.
 */
async function tasksFor(id: string): Promise<Array<{ unit: string; task: TaskStep }>> {
  const courses = await Promise.all(TEACHER_KEYS.map((t) => loadTeacherCourse(t)));
  return courses.flatMap((c) =>
    c.units.flatMap((u) =>
      u.lessons.flatMap((l) => l.steps.filter((s): s is TaskStep => isTaskStep(s) && taskSong(s) === id).map((task) => ({ unit: u.id, task }))),
    ),
  );
}
const plain = (t: TaskStep['body']) => (typeof t === 'string' ? t : t.text);

// ------------------------------------------------------------------ the checks

describe('recovery c0: the agreed melodies are read correctly', () => {
  it('reads the notation (dots, sharps, ties) and every bar adds up to 3/4', () => {
    expect(parseAgreed('bar 1: C#5:q. r:e A4:h.~')[0].map(token)).toEqual(['C#5:q.', 'r:e', 'A4:h.~']);
    for (const s of SPANS) {
      const bars = numbered(s);
      expect(bars.size, `${s.id}: bars`).toBe(s.bars + (s.pickup ? 1 : 0));
      for (const [n, bar] of bars) {
        const total = bar.reduce((t, e) => t + e.ticks, 0);
        expect(total, `${s.id} bar ${n}`).toBe(n === 0 ? PPQ : BAR);
      }
    }
  });
});

describe.each(SPANS.map((s) => [s.id, s] as [string, Span]))('recovery c0: %s, the span in the song core', (id, s) => {
  it('parses as a valid song and plays back exactly the agreed notes and durations, bar by bar', () => {
    const song = parseSpan(s);
    expect(validateSong(song).map((i) => i.message)).toEqual([]);
    const got = withTies(song.tracks[0], trackEvents(song.tracks[0])).map(barText);
    const want = parseAgreed(s.agreed).map(barText);
    expect(got).toEqual(want);
    expect(song.bars).toHaveLength(want.length);
    if (s.pickup) expect(song.bars[0].length, `${id}: a one-beat pickup`).toBe(PPQ);
  });

  it('a changed note is caught by that comparison', () => {
    const text = spanSixTab(s);
    // Raise the first fretted or open note by one fret: one pitch in bar 1 changes.
    const broken = text.replace(/(\| [whqes.]+ )(\d):(\d+)/, (_, pre: string, str: string, fret: string) => `${pre}${str}:${Number(fret) + 1}`);
    expect(broken).not.toBe(text);
    const song = parseSixTab(broken).song!;
    const got = withTies(song.tracks[0], trackEvents(song.tracks[0])).map(barText);
    const want = parseAgreed(s.agreed).map(barText);
    expect(got[0]).not.toBe(want[0]);
    expect(got.slice(1)).toEqual(want.slice(1));
  });
});

describe('recovery c0: why we-three-kings is not written', () => {
  const s = span('we-three-kings');
  const bars = numbered(s);

  it('the span stops on a D quarter on beat 3 of bar 17', () => {
    expect(lastNote(s, parseSpan(s))).toEqual({ bar: 17, beat: 3, name: 'D5', length: 'q' });
  });

  it('bars 1-15 are the whole first verse: its lines rest on the tonic E for a whole bar, in bars 4, 8 and 15', () => {
    const wholeBar = [...bars].filter(([, b]) => b.length === 1).map(([n, b]) => `${n}:${token(b[0])}`);
    expect(wholeBar).toEqual(['4:E4:h.', '8:E4:h.', '15:E4:h.', '16:D5:h.']);
    expect(chordPcs('Em')).toContain(pc(noteToMidi('E4')));
    // Lines 1 and 2 are the same four bars.
    for (let n = 1; n <= 4; n++) expect(barText(bars.get(n + 4)!), `bar ${n + 4}`).toBe(barText(bars.get(n)!));
    // The whole verse stays in the notes of E minor (no D#, the leading note B7 adds below the tune).
    const verse = [...bars].filter(([n]) => n <= 15).flatMap(([, b]) => b.map((e) => pc(e.midi!)));
    expect(verse.filter((p) => !scalePcs('E', 'minor').includes(p))).toEqual([]);
  });

  it('bars 16-17 are only the first three notes of the refrain, all D, so the refrain has no cadence in the span', () => {
    const refrain = [16, 17].flatMap((n) => bars.get(n)!);
    expect(refrain.map(token)).toEqual(['D5:h.', 'D5:h', 'D5:q']);
    expect(new Set(refrain.map((e) => pc(e.midi!)))).toEqual(new Set([pc(noteToMidi('D5'))]));
    // One pitch cannot close a phrase in G major: G, the tonic the plan names for the refrain, never sounds in it.
    expect(refrain.some((e) => pc(e.midi!) === pc(noteToMidi('G4')))).toBe(false);
    // And D is not a note of the tonic chord E minor that the verse rests on.
    expect(chordPcs('Em')).not.toContain(pc(noteToMidi('D5')));
  });

  it('the verse alone does not meet the plan, which names the G major refrain', () => {
    const p = planned('we-three-kings');
    expect(p.notes).toContain('the refrain (O star of wonder) is in G major (G (320003), C (x32010), D)');
    expect(p.teaches).toContain('minor verse, major refrain');
    expect(p).toMatchObject({ key: 'E minor', meter: '3/4', tempo: 96 });
  });

  it('the teacher task that opens it (Mia) plays the refrain chords G and C, so a verse-only song would contradict it', async () => {
    // Checked on the chord tags, not the wording: the verse's chords are Em, B7, Am and D, so G
    // and C in the task are the refrain's. If no task opens the song any more, there is nothing
    // to contradict.
    for (const { unit, task } of await tasksFor('we-three-kings')) {
      const body = plain(task.body);
      expect(body, `${unit} > ${task.id}`).toContain('{c:G}');
      expect(body, `${unit} > ${task.id}`).toContain('{c:C}');
    }
  });
});

describe('recovery c0: why the-first-noel is not written', () => {
  const s = span('the-first-noel');
  const bars = numbered(s);

  it('the span stops on G4, a quarter on beat 3 of bar 23', () => {
    expect(lastNote(s, parseSpan(s))).toEqual({ bar: 23, beat: 3, name: 'G4', length: 'q' });
  });

  it('everywhere else that bar comes, its G falls to F# on the next downbeat and the line ends there', () => {
    for (const n of [7, 15, 23]) expect(barText(bars.get(n)!), `bar ${n}`).toBe('D5:q A4:q G4:q');
    for (const n of [8, 16]) expect(token(bars.get(n)![0]), `bar ${n}`).toBe('F#4:h');
    expect(bars.has(24), 'bar 24, where the refrain would close, is not agreed').toBe(false);
    // G is not a note of the home chord D; F#, where the line ends, is.
    expect(chordPcs('D')).not.toContain(pc(noteToMidi('G4')));
    expect(chordPcs('D')).toContain(pc(noteToMidi('F#4')));
  });

  it("the refrain's last line repeats the verse's last line, which is exactly why its missing end matters", () => {
    for (const n of [21, 22, 23]) {
      expect(barText(bars.get(n)!), `bar ${n}`).toBe(barText(bars.get(n - 16)!));
      expect(barText(bars.get(n)!), `bar ${n}`).toBe(barText(bars.get(n - 8)!));
    }
    // And the refrain opens with the verse's opening figure: F# E | D. E F# G | A.
    const opening = (pick: number, bar: number) => [...bars.get(pick)!.slice(-2), ...bars.get(bar)!, bars.get(bar + 1)![0]].map(token);
    expect(opening(16, 17)).toEqual(opening(0, 1));
    expect(opening(16, 17).join(' ')).toBe('F#4:e E4:e D4:q. E4:e F#4:e G4:e A4:h');
  });

  it('the verse alone ends in bar 16 with the two eighths that lead into the refrain', () => {
    // The verse is one eight-bar line played twice.
    for (let n = 1; n <= 8; n++) expect(barText(bars.get(n + 8)!), `bar ${n + 8}`).toBe(barText(bars.get(n)!));
    expect(barText(bars.get(16)!)).toBe('F#4:h F#4:e E4:e');
    // Those two eighths are the pickup figure the tune starts with: they belong to the next line.
    expect(bars.get(16)!.slice(1).map(token)).toEqual(bars.get(0)!.map(token));
  });

  it('the verse alone does not meet the plan, which asks to show the phrase verse and refrain share', () => {
    const p = planned('the-first-noel');
    expect(p.notes).toContain('Point out how the verse and the refrain reuse the same phrase.');
    expect(p).toMatchObject({ key: 'D major', meter: '3/4', tempo: 92 });
  });
});

describe('recovery c0: why home-on-the-range is not written', () => {
  const s = span('home-on-the-range');
  const bars = numbered(s);

  it('the span stops on a B4 eighth on the second half of beat 3 of bar 13', () => {
    expect(lastNote(s, parseSpan(s))).toEqual({ bar: 13, beat: 3.5, name: 'B4', length: 'e' });
  });

  it('bars 9-12 repeat bars 1-4, so the lines are four bars long and bar 13 opens the fourth', () => {
    for (let n = 1; n <= 4; n++) expect(barText(bars.get(n + 8)!), `bar ${n + 8}`).toBe(barText(bars.get(n)!));
    // Lines 1 and 3 are picked up by the same low D on the beat before.
    expect(barText(bars.get(0)!)).toBe('D4:q');
    expect(token(bars.get(8)![1])).toBe('D4:q');
    // Line 4 sets off differently from line 2 and is cut after its first bar.
    expect(barText(bars.get(5)!)).toBe('D5:h G4:e G4:e');
    expect(barText(bars.get(13)!)).toBe('D5:h C5:e B4:e');
    expect(bars.has(14)).toBe(false);
  });

  it('no line in the span comes home: they end on C, A and C, and G is never held anywhere', () => {
    const lineEnds = [4, 7, 12].map((n) => token(bars.get(n)![0]));
    expect(lineEnds).toEqual(['C5:h', 'A4:h.~', 'C5:h']);
    expect(token(bars.get(8)![0]), 'the A of line 2 is tied on into bar 8').toBe('A4:h');
    const g = pc(noteToMidi('G4'));
    expect(lineEnds.map((t) => pc(noteToMidi(t.split(':')[0])))).not.toContain(g);
    // Every G in the span is a quarter or an eighth: the tune never rests on its tonic.
    const gs = [...bars].flatMap(([n, b]) => b.filter((e) => e.midi !== null && pc(e.midi) === g).map((e) => `${n}:${token(e)}`));
    expect(gs.length).toBeGreaterThan(0);
    expect(gs.filter((t) => !/:(q|e)$/.test(t))).toEqual([]);
    // So no stretch at the start of the span can end a song in the plan's key.
    expect(planned('home-on-the-range')).toMatchObject({ key: 'G major', meter: '3/4', tempo: 96 });
  });
});

describe.each(SPANS.map((s) => [s.id] as [string]))('recovery c0: %s while it is not in the library', (id) => {
  it('every teacher task that opens it keeps a fallback', async () => {
    // The same rule as src/content/teachers/registry.test.ts, kept here so this batch's decision
    // carries its consequence with it.
    if (songEntry(id)) return;
    for (const { unit, task } of await tasksFor(id)) expect(task.fallback, `${unit} > ${task.id}`).toBeTruthy();
  });
});
