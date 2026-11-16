/**
 * Recovery batch b0: Mo Li Hua (Jasmine Flower), left out earlier because no single writer could
 * vouch for the tune note for note, now written from a melody that independent recollections
 * agreed on exactly: bars 1-17 by 2 of 5, then bar 18 by 3 of 5 recollections that were given the
 * agreed opening and wrote only what follows (recovery d0 checks the song against that text too).
 *
 * Only the first 18 bars were agreed. Bars 1-16 are a complete musical unit, the first half of the
 * verse: four four-bar phrases, the first three resting on D, the fourth coming home to the tonic
 * G, held for the whole of bar 16. Bars 17-18 open the next phrase (four running eighths, then a
 * dotted A and an eighth B that stop mid-line), so they cannot end a piece; the song is bars 1-16,
 * played twice (plain, then ornamented), and nothing outside the agreed span is added. The last
 * describe block records that evidence from the agreed text itself.
 *
 * The agreed melody below is copied exactly as it was handed to the arranger (PITCH:DURATION as
 * sung, C4 = middle C), not from the SixTab file. The song is parsed with the song core and its
 * melody track's sounding notes and durations must equal the agreed melody exactly, bar by bar,
 * in both passes, with one octave shift allowed for the whole line (the guitar plays it an octave
 * below the sung pitch). Then: notes on strong beats against the chord in force, the chord shapes
 * against what they sound, the pentatonic, the position and fingers, where the ornaments are, the
 * teacher's strum, the plan's details and the origin line in meta.ts.
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, flattenSong, parseSixTab, validateSong, type Note, type Song, type Track } from '@/core/song';
import { buildVoicing } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';
import plan from '@/content/plan/repertoire.json';

const PPQ = 960;
const STANDARD = [40, 45, 50, 55, 59, 64];
const ID = 'mo-li-hua';

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

// ------------------------------------------------------------------ the agreed melody, verbatim

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

/** The agreed bars the song plays: 1-16 (bars 17-18 open the next phrase; see the last block). */
const WRITTEN_BARS = 16;

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

async function load(): Promise<Song> {
  const result = parseSixTab(await loadSongText(ID));
  expect(result.errors, `${ID}/song.sixtab parses`).toEqual([]);
  expect(result.warnings, `${ID}/song.sixtab has no warnings`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, trackName: string): Track {
  const t = song.tracks.find((x) => x.name === trackName);
  if (!t) throw new Error(`no track "${trackName}": ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

/** A chord shape low string first: x32010. */
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
      const note = b.notes.find((n) => !n.tie)!;
      return {
        bar: b.bar,
        inBar: b.tick - bar.start,
        duration: b.duration,
        midi: note.midi,
        note,
        chord: tl.chordAt(b.tick)?.symbol ?? null,
      };
    });
}

/** "bar 4 beat 1" for a note (bars counted from 1). */
const where = (n: { bar: number; inBar: number }) => `bar ${n.bar + 1} beat ${n.inBar / PPQ + 1}`;

/**
 * Notes on strong beats must be tones of the chord in force. The one exception allowed is an
 * accented non-chord tone that resolves at once by step (one or two semitones) to the next note,
 * itself a tone of the chord then in force; those are returned separately so each one is named.
 */
function strongBeats(song: Song, track: Track, strong: number[]) {
  const notes = struckNotes(song, track);
  const problems: string[] = [];
  const resolved: string[] = [];
  notes.forEach((n, i) => {
    if (!strong.includes(n.inBar)) return;
    if (!n.chord) return problems.push(`${where(n)}: ${name(n.midi)} with no chord in force`);
    if (chordPcs(n.chord).includes(pc(n.midi))) return;
    const next = notes[i + 1];
    const step = next ? Math.abs(next.midi - n.midi) : 99;
    if (next && step >= 1 && step <= 2 && next.chord && chordPcs(next.chord).includes(pc(next.midi))) {
      resolved.push(`${where(n)}: ${name(n.midi)} over ${n.chord} resolves to ${name(next.midi)}`);
    } else problems.push(`${where(n)}: ${name(n.midi)} is not in ${n.chord} and does not resolve by step`);
  });
  return { problems, resolved };
}

/** The ornaments on a note, as written: hammer-on, pull-off, legato slide, slide in from below. */
function ornaments(n: Note): string[] {
  const out: string[] = [];
  if (n.legato === 'hammer') out.push('hammer-on');
  if (n.legato === 'pull') out.push('pull-off');
  if (n.slide) out.push(`slide ${n.slide}`);
  if (n.slideIn) out.push(`slide in from ${n.slideIn}`);
  if (n.slideOut) out.push(`slide out ${n.slideOut}`);
  if (n.bend) out.push('bend');
  if (n.vibrato) out.push('vibrato');
  return out;
}

/** The two passes through the agreed bars: plain (bars 1-16), ornamented (bars 17-32). */
const PASSES: Array<[number, number]> = [
  [0, WRITTEN_BARS],
  [WRITTEN_BARS, 2 * WRITTEN_BARS],
];

/**
 * The melody track against the agreed melody, pass by pass and bar by bar: the octave shift taken
 * from the first note, and every bar whose notes or durations differ (with both versions).
 */
function compareMelody(song: Song): { shift: number; mismatches: string[] } {
  const track = trackNamed(song, 'Melody');
  const want = parseAgreed(MO_LI_HUA_AGREED).slice(0, WRITTEN_BARS);
  const mismatches: string[] = [];
  const total = PASSES[PASSES.length - 1][1];
  if (track.measures.length !== total) mismatches.push(`${track.measures.length} bars in the melody track, ${total} expected`);
  const firstGot = trackEvents(track, 0, 1)[0].find((e) => e.midi !== null)!.midi!;
  const firstWant = want.flat().find((e) => e.midi !== null)!.midi!;
  const shift = firstGot - firstWant;
  for (const [from, to] of PASSES) {
    const got = trackEvents(track, from, to);
    if (got.length !== want.length) mismatches.push(`bars ${from + 1}-${to}: ${got.length} bars, ${want.length} agreed`);
    got.forEach((bar, i) => {
      const g = bar.map((e) => token(e)).join(' ');
      const w = (want[i] ?? []).map((e) => token(e, shift)).join(' ');
      if (g !== w) mismatches.push(`bar ${i + 1} (pass from bar ${from + 1}): plays "${g}", agreed "${w}"`);
    });
  }
  return { shift, mismatches };
}

describe('recovery b0: the agreed melody is read correctly', () => {
  it('reads the notation and every one of the 18 agreed bars adds up to 2/4', () => {
    expect(parseAgreed('bar 1: C#5:e. r:s B4:q~')[0].map((e) => token(e))).toEqual(['C#5:e.', 'r:s', 'B4:q~']);
    const bars = parseAgreed(MO_LI_HUA_AGREED);
    expect(bars).toHaveLength(18);
    bars.forEach((bar, i) => expect(bar.reduce((s, e) => s + e.ticks, 0), `bar ${i + 1}`).toBe(2 * PPQ));
  });
});

describe('recovery b0: mo-li-hua', () => {
  it('plays agreed bars 1-16 exactly, note for note and duration for duration, in both passes (one octave shift for the whole line)', async () => {
    const song = await load();
    const { shift, mismatches } = compareMelody(song);
    expect(Math.abs(shift % 12), `the line may move only by whole octaves (moved ${shift} semitones)`).toBe(0);
    expect(shift, 'the guitar plays the sung line an octave lower').toBe(-12);
    expect(mismatches).toEqual([]);
  });

  it('is a single line: one note at a time, no rests, no ties', async () => {
    const song = await load();
    const melody = trackNamed(song, 'Melody');
    expect(song.tracks[0]).toBe(melody);
    expect(melody.role).toBe('lead');
    for (const [i, m] of melody.measures.entries()) {
      for (const b of m.beats) {
        expect(b.notes, `bar ${i + 1}: exactly one note per beat`).toHaveLength(1);
        expect(b.notes[0].tie ?? false, `bar ${i + 1}: no ties`).toBe(false);
      }
    }
  });

  it('puts chord tones on both beats of every bar (no exceptions needed)', async () => {
    const song = await load();
    const { problems, resolved } = strongBeats(song, trackNamed(song, 'Melody'), [0, PPQ]);
    expect(problems).toEqual([]);
    expect(resolved).toEqual([]);
  });

  it('uses G, C, D and Em in the planned order, and every shape sounds its symbol', async () => {
    const song = await load();
    expect([...new Set(song.chords.map((ch) => ch.symbol))].sort()).toEqual(['C', 'D', 'Em', 'G']);
    const shapes: Record<string, string> = { G: '320003', C: 'x32010', D: 'xx0232', Em: '022000' };
    for (const ch of song.chords) {
      const frets = shapeText(ch.voicing);
      expect(frets, `${ch.symbol} at bar ${ch.bar + 1}: shape`).toBe(shapes[ch.symbol]);
      const sounds = shapeSounds(frets);
      const tones = chordPcs(ch.symbol);
      expect(sounds.map(pc).filter((p) => !tones.includes(p)), `${ch.symbol}=${frets}: notes outside the chord`).toEqual([]);
      expect([...new Set(sounds.map(pc))].sort(), `${ch.symbol}=${frets}: every chord tone sounds`).toEqual([...tones].sort());
      expect(() => buildVoicing(ch.symbol, frets)).not.toThrow();
    }
    expect(validateSong(song).map((i) => i.message)).toEqual([]);
    // Beat 1 and beat 2 of every bar, both passes alike.
    const tl = flattenSong(song);
    const byBar = tl.bars.map((b) => `${tl.chordAt(b.start)?.symbol} ${tl.chordAt(b.start + PPQ)?.symbol}`);
    const pass = ['G G', 'C C', 'G G', 'D D', 'G G', 'C C', 'G G', 'G G', 'D D', 'G G', 'C C', 'G G', 'Em D', 'G G', 'C C', 'G G'];
    expect(byBar).toEqual([...pass, ...pass]);
  });

  it('keeps every note to the five notes of G major pentatonic, G3 to G4', async () => {
    const song = await load();
    const notes = struckNotes(song, trackNamed(song, 'Melody'));
    const penta = scalePcs('G', 'major-pentatonic');
    expect([...penta].sort((a, b) => a - b)).toEqual([2, 4, 7, 9, 11]);
    expect(notes.filter((n) => !penta.includes(pc(n.midi))).map((n) => `${where(n)}: ${name(n.midi)}`)).toEqual([]);
    expect(name(Math.min(...notes.map((n) => n.midi)))).toBe('G3');
    expect(name(Math.max(...notes.map((n) => n.midi)))).toBe('G4');
  });

  it('sits in seventh position (finger 1 on fret 7) until bar 15, then in fifth position for the low G', async () => {
    const song = await load();
    const melody = trackNamed(song, 'Melody');
    const places = new Map<string, string>();
    // The finger last used on each string, carried across bar lines (a slide can cross one).
    const lastFinger = new Map<number, number>();
    for (const [i, m] of melody.measures.entries()) {
      const barInPass = i % WRITTEN_BARS;
      const low = barInPass >= 14;
      const base = low ? 4 : 6; // finger = fret - base
      for (const b of m.beats) {
        for (const n of b.notes) {
          expect(STANDARD[6 - n.string] + n.fret, `bar ${i + 1}: string ${n.string} fret ${n.fret} sounds its midi`).toBe(n.midi);
          const p = `${name(n.midi)}=${n.string}:${n.fret}`;
          places.set(name(n.midi) + (low ? ' (fifth position)' : ''), p);
          expect(n.fret, `bar ${i + 1}: ${p} is inside the position`).toBeGreaterThanOrEqual(base + 1);
          expect(n.fret, `bar ${i + 1}: ${p} is inside the position`).toBeLessThanOrEqual(base + 3);
          if (typeof n.finger === 'number') {
            // A legato slide keeps the finger it slides with (the last G: finger 3 slides from A).
            const want = n.slide ? lastFinger.get(n.string) : n.fret - base;
            expect(n.finger, `bar ${i + 1}: finger on ${p}`).toBe(want);
          }
          lastFinger.set(n.string, typeof n.finger === 'number' ? n.finger : n.fret - base);
        }
      }
    }
    // One place for each note: A, B on string 4; D, E on string 3; G on string 2; the low G on string 4.
    expect(Object.fromEntries(places)).toEqual({
      B3: 'B3=4:9',
      D4: 'D4=3:7',
      E4: 'E4=3:9',
      G4: 'G4=2:8',
      A3: 'A3=4:7',
      'G3 (fifth position)': 'G3=4:5',
      'A3 (fifth position)': 'A3=4:7',
    });
  });

  it('plays the first pass plain and ornaments only the second: slurs on the turns, a slide into every long note', async () => {
    const song = await load();
    const notes = struckNotes(song, trackNamed(song, 'Melody'));
    const plain = notes.filter((n) => n.bar < WRITTEN_BARS && ornaments(n.note).length);
    expect(plain.map((n) => `${where(n)}: ${ornaments(n.note).join(', ')}`)).toEqual([]);
    const second = notes
      .filter((n) => n.bar >= WRITTEN_BARS && ornaments(n.note).length)
      .map((n) => `bar ${n.bar - WRITTEN_BARS + 1} beat ${n.inBar / PPQ + 1} ${name(n.midi)}: ${ornaments(n.note).join(', ')}`);
    expect(second).toEqual([
      'bar 3 beat 2.5 E4: hammer-on',
      'bar 4 beat 1 D4: slide in from below',
      'bar 7 beat 2.5 E4: hammer-on',
      'bar 8 beat 1 D4: slide in from below',
      'bar 12 beat 1 D4: slide in from below',
      'bar 13 beat 2 A3: pull-off',
      'bar 13 beat 2.5 B3: hammer-on',
      'bar 14 beat 2.5 A3: pull-off',
      'bar 15 beat 2.5 A3: hammer-on',
      'bar 16 beat 1 G3: slide down',
    ]);
    // The long notes are exactly the half notes, and in the second pass each one is slid into.
    const long = notes.filter((n) => n.bar >= WRITTEN_BARS && n.duration >= 2 * PPQ);
    expect(long.map((n) => n.bar - WRITTEN_BARS + 1)).toEqual([4, 8, 12, 16]);
    for (const n of long) expect(!!(n.note.slide || n.note.slideIn), `${where(n)}: a slide into the long ${name(n.midi)}`).toBe(true);
    // The rest of the second pass is picked exactly as the first.
    const fingerprint = (from: number) =>
      notes.filter((n) => n.bar >= from && n.bar < from + WRITTEN_BARS).map((n) => `${n.note.string}:${n.note.fret}`);
    expect(fingerprint(WRITTEN_BARS)).toEqual(fingerprint(0));
  });

  it('has the teacher strum two beats a bar and once under each long note, in two sections', async () => {
    const song = await load();
    const teacher = trackNamed(song, 'Teacher');
    expect(teacher.role).toBe('rhythm');
    expect(teacher.measures).toHaveLength(2 * WRITTEN_BARS);
    teacher.measures.forEach((m, i) => {
      const held = [3, 7, 11, 15].includes(i % WRITTEN_BARS);
      expect(m.beats.map((b) => `${NAME_OF_TICKS.get(b.duration)}${b.slash ? '/' : '?'}`), `bar ${i + 1}`).toEqual(held ? ['h/'] : ['q/', 'q/']);
    });
    expect(song.sections.map((s) => `${s.name}@${s.start}`)).toEqual(['Tune@0', 'Tune with slides@16']);
  });

  it("follows the plan: level 4, a single-line melody in G major, 2/4 at 66", async () => {
    const song = await load();
    const item = (plan as { pieces: Array<{ id: string; level: number; key: string; meter: string; tempo: number; arrangement: string }> }).pieces.find((p) => p.id === ID)!;
    expect(item.arrangement).toBe('single-line melody');
    const entry = songEntry(ID)!;
    expect(entry.kind).toBe('melody');
    expect(entry.level).toBe(item.level);
    expect(song.meta.difficulty).toBe(item.level);
    expect(song.key).toBe('G');
    expect(entry.key).toBe(item.key);
    expect(`${song.bars[0].time.numerator}/${song.bars[0].time.denominator}`).toBe(item.meter);
    expect(song.tempo.map((t) => t.bpm)).toEqual([item.tempo]);
    expect(song.bars.every((b) => b.length === undefined), 'no pickup bar').toBe(true);
    // Instrumental: no words anywhere.
    expect(song.tracks.flatMap((t) => t.measures.flatMap((m) => m.beats)).filter((b) => b.lyric)).toEqual([]);
  });

  it('says in meta.ts that the melody is the one commonly sung or played today and that older printings vary', () => {
    const origin = songEntry(ID)!.origin ?? '';
    expect(origin).toMatch(/commonly sung or played today/);
    expect(origin).toMatch(/older printings vary/);
  });

  it("lands near its level in the song core's difficulty estimate (the learner's part)", async () => {
    const song = await load();
    const level = songEntry(ID)!.level;
    const yours = estimateDifficulty(song, { track: 0 });
    // eslint-disable-next-line no-console
    console.log(`${ID}: level ${level}; estimate ${yours.level}; ${yours.reasons.join(' ') || 'no hard spots'}`);
    // It estimates 4. The core reports a 5-fret stretch: its hand window spans the shift in bar
    // 15 (B at fret 9 just before, the low G at fret 5 just after), which the hand plays by
    // moving, not stretching (positions and fingers are checked above).
    expect(yours.level).toBeGreaterThanOrEqual(level - 1);
    expect(yours.level, yours.reasons.join(' ')).toBeLessThanOrEqual(level + 2);
  });
});

describe('recovery b0: the comparison catches a wrong note and a wrong rhythm', () => {
  it('a B played for the A of bar 14 (string 4 fret 9 for fret 7) fails in bar 14 of the first pass', async () => {
    const text = await loadSongText(ID);
    const marker = '| q 3:7{1} e 4:9{3} 4:7{1} |';
    expect(text.split(marker)).toHaveLength(2);
    const broken = parseSixTab(text.replace(marker, '| q 3:7{1} e 4:9{3} 4:9{3} |')).song!;
    expect(compareMelody(broken).mismatches).toEqual(['bar 14 (pass from bar 1): plays "D4:q B3:e B3:e", agreed "D4:q B3:e A3:e"']);
  });

  it('even eighths for the long-short "B B D" of bar 1 fail in bar 1 of the second pass', async () => {
    const text = await loadSongText(ID);
    const before = '| ^"Second time: slurs and slides" q 4:9 e 4:9 3:7 |';
    expect(text.split(before)).toHaveLength(2);
    const broken = parseSixTab(text.replace(before, '| ^"Second time: slurs and slides" e 4:9 4:9 4:9 3:7 |')).song!;
    expect(compareMelody(broken).mismatches).toEqual(['bar 1 (pass from bar 17): plays "B3:e B3:e B3:e D4:e", agreed "B3:q B3:e D4:e"']);
  });
});

describe('recovery b0: why the song stops at bar 16 of the 18 agreed bars', () => {
  it('bar 16 holds the tonic G for the whole bar; bars 17-18 open the next phrase and stop mid-line on a short B', () => {
    const bars = parseAgreed(MO_LI_HUA_AGREED);
    const sixteen = bars[15];
    expect(sixteen.map((e) => token(e))).toEqual(['G4:h']);
    expect(pc(sixteen[0].midi!)).toBe(pc(noteToMidi('G4')));
    // Phrase 4 (bars 13-16) steps down B A B | D B A | G G A | G: the line comes home by step.
    expect(bars.slice(12, 16).flat().map((e) => name(e.midi!))).toEqual(['B4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', 'G4', 'A4', 'G4']);
    const seventeen = bars[16];
    expect(seventeen.map((e) => token(e))).toEqual(['B4:e', 'A4:e', 'G4:e', 'B4:e']);
    const last = seventeen[seventeen.length - 1];
    expect(pc(last.midi!), 'bar 17 does not end on the tonic').not.toBe(pc(noteToMidi('G4')));
    expect(last.ticks, 'and its last note is short, on the off-beat').toBe(PPQ / 2);
    // Bar 18, the continuation agreed later, goes on from there: a dotted A, then an eighth B on
    // the off-beat, so the span still stops in the middle of a line.
    const eighteen = bars[17];
    expect(eighteen.map((e) => token(e))).toEqual(['A4:q.', 'B4:e']);
    const end = eighteen[eighteen.length - 1];
    expect(pc(end.midi!), 'bar 18 does not end on the tonic').not.toBe(pc(noteToMidi('G4')));
    expect(end.ticks, 'and its last note is short, on the off-beat').toBe(PPQ / 2);
    // Every four-bar phrase of the span ends on a note held for the whole bar; bars 17-18 hold nothing.
    const phraseEnds = bars.map((bar, i) => (bar.length === 1 && bar[0].ticks === 2 * PPQ ? `${i + 1}:${name(bar[0].midi!)}` : null)).filter(Boolean);
    expect(phraseEnds).toEqual(['4:D5', '8:D5', '12:D5', '16:G4']);
  });
});
