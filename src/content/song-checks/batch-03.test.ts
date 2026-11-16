/**
 * Batch 3 cross-checks: the songs in src/content/songs/<id>/ checked against note lists written
 * out by hand, independently of the SixTab files (the tunes as commonly known and printed). Each
 * file is parsed with the song core and every sounding pitch of the tune is compared bar by bar,
 * so a wrong fret shows up as a wrong note name in a named bar. Also checked: rhythm, the chord
 * symbols and the harmony on strong beats, key, scale and range, first-position frets and fingers,
 * the words, the learner's strum or picking part, and the core's difficulty estimate.
 *
 * Joy to the World began here as its first two lines; it is now the whole carol, written from the
 * agreed melody of the song recovery, and src/content/song-checks/recovery-a0.test.ts checks its
 * notes, rhythm, chords and words. This file keeps its plan details (first phrase, counting tip,
 * estimate) and the wrong-fret check.
 *
 * Batch 3 in the plan also lists go-tell-it-on-the-mountain, down-by-the-riverside,
 * swing-low-sweet-chariot, go-down-moses and wade-in-the-water. They are not written: their tunes
 * (and so where their chords change) could not be given note for note with certainty.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, parseSixTab, type Beat, type Song, type Track } from '@/core/song';
import { chordPcs, keyModeName, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;

/** What one tune should contain, written out by hand. */
interface Expected {
  id: string;
  /** The track that carries the tune. */
  melody: string;
  /** True when the first bar is a pickup: bars are then numbered from 0, as musicians do. */
  pickup?: boolean;
  /** Sounding pitches of every struck note, bar by bar ("|" between bars). */
  notes: string;
  /** Duration of every beat, bar by bar: w h. h q. q e. e s, then "r" for a rest or "~" for a tie. */
  rhythm: string;
  /** Chord events as written, "bar:symbol" or "bar.beat:symbol" (bar numbers as musicians count them). */
  chords: string;
  /** The key as "tonic mode", and the scale the tune keeps to (tonic + scale id). */
  key: string;
  scale: [string, string];
  /** Lowest and highest note of the tune. */
  range: [string, string];
  /** Ticks from the bar line that count as strong beats. */
  strong: number[];
  /** The words as sung, syllables joined by hyphens. */
  words?: string[];
}

const TWO = [0, PPQ];
const SIX_EIGHT = [0, 3 * (PPQ / 2)];

// Silent Night: the same tune twice (strummed with the English words, then picked with the German).
const SILENT_NOTES =
  'D3 E3 D3 | B2 | D3 E3 D3 | B2 | A3 A3 | F#3 | G3 G3 | D3 |' +
  'E3 E3 | G3 F#3 E3 | D3 E3 D3 | B2 | E3 E3 | G3 F#3 E3 | D3 E3 D3 | B2 |' +
  'A3 A3 | C4 A3 F#3 | G3 | B3 | G3 D3 B2 | D3 C3 A2 | G2 | ';
const SILENT_RHYTHM =
  'q. e q | h. | q. e q | h. | h q | h. | h q | h. |' +
  'h q | q. e q | q. e q | h. | h q | q. e q | q. e q | h. |' +
  'h q | q. e q | h. | h. | q. e q | q. e q | h. | h.~';
const SILENT_CHORDS = (from: number) =>
  [1, 5, 7, 9, 11, 13, 15, 17, 19, 22, 23]
    .map((b, i) => `${b + from}:${['G', 'D7', 'G', 'C', 'G', 'C', 'G', 'D7', 'G', 'D7', 'G'][i]}`)
    .join(' ');

// Oh! Susanna, in G: the verse's two lines share a shape, the first ending on A, the second on G.
const SUSANNA_LINE = 'B3 D4 D4 E4 | D4 B3 G3 A3';
const SUSANNA_LINE_RHYTHM = 'e e e. s | e e e. s';

const SONGS: Expected[] = [
  {
    id: 'oh-susanna',
    melody: 'Tune',
    pickup: true,
    // Review: the verse is all four lines of Foster's first verse ("It rained all night" sings
    // to the music of the first two lines), so the verse is these 16 bars twice over.
    notes:
      `A3 | ${SUSANNA_LINE} | B3 B3 A3 G3 | A3 A3 | ${SUSANNA_LINE} | B3 B3 A3 A3 | G3 A3 |` +
      `${SUSANNA_LINE} | B3 B3 A3 G3 | A3 A3 | ${SUSANNA_LINE} | B3 B3 A3 A3 | G3 |` +
      `C4 C4 | E4 E4 E4 | D4 D4 B3 G3 | A3 G3 A3 | ${SUSANNA_LINE} | B3 B3 A3 A3 | G3`,
    rhythm:
      `e | ${SUSANNA_LINE_RHYTHM} | e e e e | q. e | ${SUSANNA_LINE_RHYTHM} | e e e e | q. e |` +
      `${SUSANNA_LINE_RHYTHM} | e e e e | q. e | ${SUSANNA_LINE_RHYTHM} | e e e e | h |` +
      `q q | e q e | e e e e | q e e | ${SUSANNA_LINE_RHYTHM} | e e e e | h`,
    chords: '1:G 4:D7 5:G 7.2:D7 8:G 9:G 12:D7 13:G 15.2:D7 16:G 17:C 19:G 20:D7 21:G 23.2:D7 24:G',
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G3', 'E4'],
    strong: TWO,
    words: [
      "I come from Al-a-bam-a with a ban-jo on my knee, I'm going to Lou-i-si-an-a, my true love for to see.",
      "It rained all night the day I left, the wea-ther it was dry, the sun so hot I froze to death; Su-san-na, don't you cry.",
      "Oh! Su-san-na, oh don't you cry for me, for I come from Al-a-bam-a with a ban-jo on my knee.",
    ],
  },
  {
    id: 'silent-night',
    melody: 'Tune',
    notes: `${SILENT_NOTES}| ${SILENT_NOTES}`,
    rhythm: `${SILENT_RHYTHM} | ${SILENT_RHYTHM}`,
    chords: `${SILENT_CHORDS(0)} ${SILENT_CHORDS(24)}`,
    key: 'G major',
    scale: ['G', 'major'],
    range: ['G2', 'C4'],
    strong: SIX_EIGHT,
    words: [
      'Si-lent night, ho-ly night, All is calm, all is bright, Round yon Vir-gin Mo-ther and Child, Ho-ly In-fant so ten-der and mild, Sleep in heav-en-ly peace, Sleep in heav-en-ly peace.',
      'Stil-le Nacht, hei-li-ge Nacht, Al-les schläft, ein-sam wacht nur das trau-te hoch-hei-li-ge Paar. Hol-der Kna-be im lo-cki-gen Haar, schlaf in himm-li-scher Ruh, Schlaf in himm-li-scher Ruh.',
    ],
  },
  {
    id: 'sakura',
    melody: 'Melody',
    notes:
      'A3 A3 B3 | A3 A3 B3 | A3 B3 C4 B3 | A3 B3 A3 F3 | E3 C3 E3 F3 | E3 E3 C3 B2 | A3 B3 C4 B3 |' +
      'A3 B3 A3 F3 | E3 C3 E3 F3 | E3 E3 C3 B2 | A3 A3 B3 | A3 A3 B3 | E3 F3 B3 A3 F3 | E3',
    rhythm:
      'q q h | q q h | q q q q | q e e h | q q q q | q e e h | q q q q |' +
      'q e e h | q q q q | q e e h | q q h | q q h | q q e e q | w',
    chords: '',
    // The key line reads E Phrygian (see sakura/meta.ts); the tune keeps to the E in scale, five of its notes.
    key: 'E phrygian',
    scale: ['E', 'in'],
    range: ['B2', 'C4'],
    strong: [],
  },
];

/** Songs whose estimate sits outside level +-1, with the reason (checked and kept on purpose). */
const ESTIMATE_GAPS: Record<string, { min?: number; max?: number; why: string }> = {
  'joy-to-the-world': {
    max: 5,
    why:
      'The plan asks for "to the" as a dotted eighth and a sixteenth at 72, which the core rates as a sixteenth-note rhythm ' +
      'and a fast note (about 5 a second), though it happens once per verse. Gap note (integration pass 2): the core also ' +
      'used to report a 5-fret stretch that is not there (its hand window started at the first fretted note, D on string 2 ' +
      'fret 3, so the C# at fret 2 looked like a reach); the hand model now fits the whole part into first position and the ' +
      'stretch is gone, which the test checks. The sixteenth alone still lifts it to 5.',
  },
};

/** Durations as written in SixTab. */
const DURATION: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };

function load(id: string): Song {
  const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
  const result = parseSixTab(text);
  expect(result.errors, `${id}/song.sixtab parses`).toEqual([]);
  return result.song!;
}

function trackNamed(song: Song, name: string): Track {
  const t = song.tracks.find((x) => x.name === name);
  if (!t) throw new Error(`no track "${name}" in ${song.meta.id}: ${song.tracks.map((x) => x.name).join(', ')}`);
  return t;
}

const struck = (b: Beat) => b.notes.filter((n) => !n.tie);
const name = (midi: number) => midiToNote(midi, { prefer: 'sharps' });
/** A chord shape as written in SixTab, low string first: x02220. */
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
const dur = (b: Beat) => DURATION[b.duration] ?? `${b.duration}t`;

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** Every struck note of a track in written order, with where it sits. */
function notesOf(track: Track): Array<{ bar: number; tick: number; midi: number }> {
  return track.measures.flatMap((m, bar) => m.beats.flatMap((b) => struck(b).map((n) => ({ bar, tick: b.start, midi: n.midi }))));
}

/** The words of a track as sung: syllables ending in "-" join the next one. */
function wordsOf(track: Track): string {
  return track.measures
    .flatMap((m) => m.beats.map((b) => b.lyric).filter((l): l is string => !!l))
    .map((l) => (l.endsWith('-') ? l : `${l} `))
    .join('')
    .trim();
}

/** Bar numbers as musicians count them: a pickup is bar 0. */
const barNo = (want: { pickup?: boolean }, index: number) => (want.pickup ? index : index + 1);

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 3: %s', (id, want) => {
  const song = load(id);
  const melody = trackNamed(song, want.melody);

  it('sounds the expected notes, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.flatMap((b) => struck(b).map((n) => name(n.midi))));
    const expected = bars(want.notes);
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${barNo(want, i)}`).toEqual(expected[i]));
  });

  it('has the expected rhythm, bar by bar', () => {
    const got = melody.measures.map((m) => m.beats.map((b) => dur(b) + (b.notes.length === 0 ? 'r' : b.notes.every((n) => n.tie) ? '~' : '')));
    const expected = bars(want.rhythm);
    expect(got.length).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: rhythm of bar ${barNo(want, i)}`).toEqual(expected[i]));
  });

  it('has the chord symbols it should, where it should', () => {
    const got = song.chords.map((c) => `${barNo(want, c.bar)}${c.tick ? `.${c.tick / PPQ + 1}` : ''}:${c.symbol}`).join(' ');
    expect(got).toBe(want.chords);
  });

  if (want.strong.length) {
    it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
      const notes = notesOf(melody);
      const problems: string[] = [];
      notes.forEach((n, i) => {
        // A pickup is an upbeat, not a strong beat.
        if (want.pickup && n.bar === 0) return;
        if (!want.strong.includes(n.tick)) return;
        const symbol = chordAt(song, n.bar, n.tick);
        if (!symbol) return problems.push(`bar ${barNo(want, n.bar)}: ${name(n.midi)} with no chord in force`);
        if (chordPcs(symbol).includes(n.midi % 12)) return;
        // A non-chord tone on a strong beat must move by step to the next note (passing note,
        // neighbour, appoggiatura): a wrong fret almost never does.
        const next = notes.slice(i + 1).find((x) => x.midi !== n.midi);
        const step = next ? Math.abs(next.midi - n.midi) : 99;
        if (step > 2) problems.push(`bar ${barNo(want, n.bar)}, tick ${n.tick}: ${name(n.midi)} over ${symbol} does not resolve by step`);
      });
      expect(problems).toEqual([]);
    });
  }

  it('keeps to its key, scale and range, and ends on the home note', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${keyModeName(k)}`).toBe(want.key);
    const allowed = scalePcs(want.scale[0], want.scale[1]);
    const notes = notesOf(melody);
    const outside = notes.filter((n) => !allowed.includes(n.midi % 12)).map((n) => `bar ${barNo(want, n.bar)}: ${name(n.midi)}`);
    expect(outside, `${id}: notes outside ${want.scale.join(' ')}`).toEqual([]);
    const midis = notes.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range);
    expect(name(midis[midis.length - 1]).replace(/\d+$/, ''), `${id}: last note`).toBe(want.scale[0]);
  });

  it('stays in first position, with fingers that match the frets', () => {
    for (const t of song.tracks) {
      for (const [bar, m] of t.measures.entries()) {
        for (const b of m.beats) {
          for (const n of b.notes) {
            expect(n.fret, `${id}: ${t.name} bar ${barNo(want, bar)} string ${n.string}`).toBeLessThanOrEqual(4);
            if (typeof n.finger === 'number') expect(n.finger, `${id}: ${t.name} bar ${barNo(want, bar)}: finger on fret ${n.fret}`).toBe(n.fret);
          }
        }
      }
    }
  });

  if (want.words) {
    it('carries the words', () => {
      expect(wordsOf(melody)).toBe(want.words!.join(' '));
    });
  }

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    // The learner plays the first track; the teacher's parts are played by the app.
    const yours = estimateDifficulty(song, { track: 0 });
    const all = estimateDifficulty(song);
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; your part ${yours.level}, all tracks ${all.level}; ${[...new Set([...yours.reasons, ...all.reasons])].join(' ') || 'no hard spots'}`);
    const gap = ESTIMATE_GAPS[id];
    expect(yours.level, `${id}: estimate ${yours.level} is far below level ${level}`).toBeGreaterThanOrEqual(gap?.min ?? level - 1);
    expect(yours.level, `${id}: estimate ${yours.level} is far above level ${level}: ${yours.reasons.join(' ')}`).toBeLessThanOrEqual(gap?.max ?? level + 1);
  });
});

describe('batch 3: the plan details', () => {
  it("oh-susanna: two strums a bar (down, down-up), the plan's shapes, the chorus on C", () => {
    const song = load('oh-susanna');
    const strum = trackNamed(song, 'Your strum');
    expect(strum.measures.length).toBe(25);
    expect(strum.measures[0].beats.map((b) => dur(b) + (b.notes.length || b.slash ? '' : 'r'))).toEqual(['er']);
    strum.measures.slice(1).forEach((m, i) => {
      const bar = i + 1;
      const want = bar === 24 ? ['h D'] : ['q D', 'e D', 'e U'];
      expect(m.beats.map((b) => `${dur(b)} ${b.stroke === 'down' ? 'D' : b.stroke === 'up' ? 'U' : '?'}`), `bar ${bar}`).toEqual(want);
      expect(m.beats.every((b) => b.slash)).toBe(true);
    });
    const shapes: Record<string, string> = { G: '320003', C: 'x32010', D7: 'xx0212' };
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
    expect(chordAt(song, 17, 0), 'the chorus ("Oh! Susanna") starts on C').toBe('C');
    expect(song.sections.map((s) => `${s.name}@${s.start}`)).toEqual(['Verse@0', 'Chorus@17']);
    // Review: the whole first verse is sung, its four lines in order, each with its own words above the strum.
    expect(song.annotations.filter((a) => a.bar > 0).map((a) => `${a.bar}:${a.text.split(' ').slice(0, 3).join(' ')}`)).toEqual([
      '1:I come from',
      "5:I'm going to",
      '9:It rained all',
      '13:the sun so',
      '17:Oh! Susanna, oh',
      '21:for I come',
    ]);
    // Only the first verse and the chorus: the original second verse never appears.
    const text = `${wordsOf(trackNamed(song, 'Tune'))} ${song.annotations.map((a) => a.text).join(' ')}`;
    expect(text).not.toMatch(/jump|telegraph|bullgine|lightning/i);
  });

  it('coming-round-the-mountain: down-up eighths, the chords line by line, three traditional verses, no invented tune', () => {
    const song = load('coming-round-the-mountain');
    expect(song.tracks.map((t) => `${t.name}/${t.role}`)).toEqual(['Your strum/rhythm']);
    const strum = song.tracks[0];
    expect(strum.measures.length).toBe(25);
    strum.measures.slice(1).forEach((m, i) => {
      const bar = i + 1;
      const got = m.beats.map((b) => `${dur(b)}${b.stroke === 'down' ? 'D' : b.stroke === 'up' ? 'U' : '?'}`).join(' ');
      expect(got, `bar ${bar}`).toBe(bar === 24 ? 'eD eU eD eU hD' : 'eD eU eD eU eD eU eD eU');
    });
    // Two bars per sung line: G | G D7 | G C | G (D7 from beat 3) G, for each verse.
    const verse = ['G G', 'G G', 'G G', 'D7 D7', 'G G', 'C C', 'G D7', 'G G'];
    for (let bar = 1; bar <= 24; bar++) {
      const want = verse[(bar - 1) % 8];
      expect(`${chordAt(song, bar, 0)} ${chordAt(song, bar, 2 * PPQ)}`, `bar ${bar}`).toBe(want);
    }
    const shapes: Record<string, string> = { G: '320003', C: 'x32010', D7: 'xx0212' };
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
    const lines = song.annotations.map((a) => `${a.bar}:${a.text}`);
    expect(lines).toContain("1:She'll be coming 'round the mountain when she comes,");
    expect(lines).toContain('9:She\'ll be driving six white horses when she comes,');
    expect(lines).toContain('17:We will all go out to meet her when she comes,');
    expect(lines.filter((l) => /when she comes\.$/.test(l)).map((l) => l.split(':')[0])).toEqual(['7', '15', '23']);
  });

  it('silent-night: one downstrum on 1 and 4, then thumb on 1 and 4 with strings 3, 2, 1 in between', () => {
    const song = load('silent-night');
    const part = trackNamed(song, 'Your part');
    expect(part.measures.length).toBe(48);
    part.measures.slice(0, 24).forEach((m, i) => {
      expect(m.beats.map((b) => `${dur(b)} ${b.slash && b.stroke === 'down' ? 'D' : '?'}`), `bar ${i + 1}`).toEqual(['q. D', 'q. D']);
    });
    part.measures.slice(24, 47).forEach((m, i) => {
      const bar = i + 25;
      expect(m.beats.map(dur).join(' '), `bar ${bar}`).toBe('e e e e e e');
      const notes = m.beats.map((b) => b.notes[0]);
      expect(m.beats.every((b) => b.notes.length === 1), `bar ${bar}: one note at a time`).toBe(true);
      // Thumb on counts 1 and 4 (strings 4 to 6), then strings 3, 2 | 1, 2.
      expect(notes[0].string, `bar ${bar} count 1`).toBeGreaterThanOrEqual(4);
      expect(notes[3].string, `bar ${bar} count 4`).toBeGreaterThanOrEqual(4);
      expect([notes[1], notes[2], notes[4], notes[5]].map((n) => n.string), `bar ${bar}`).toEqual([3, 2, 1, 2]);
      const chord = chordAt(song, bar - 1, 0)!;
      for (const [j, n] of notes.entries()) {
        expect(chordPcs(chord), `bar ${bar}, count ${j + 1}: ${name(n.midi)} belongs to ${chord}`).toContain(n.midi % 12);
        if (n.pluck) expect(n.pluck, `bar ${bar}, count ${j + 1}`).toBe(['p', 'i', 'm', 'p', 'a', 'm'][j]);
      }
      // The thumb plays the root on count 1.
      expect(name(notes[0].midi).replace(/\d+$/, ''), `bar ${bar}: root on 1`).toBe(chord.replace('7', ''));
    });
    const last = part.measures[47].beats;
    // Review: the closing chord is the whole G shape, swept with the thumb. Five strings with
    // string 5 left out (as first written) cannot be plucked at once: p would have to take
    // strings 6 and 4 while skipping 5.
    expect(last.map((b) => `${dur(b)} ${b.notes.map((n) => name(n.midi)).join(' ')}`)).toEqual(['h. G2 B2 D3 G3 B3 G4']);
    expect(last[0].notes.map((n) => `${n.string}:${n.fret}`).join(' ')).toBe('6:3 5:2 4:0 3:0 2:0 1:3');
    // Any note group struck together in the picked part sits on neighbouring strings (one sweep or one pinch).
    for (const [bar, m] of part.measures.entries()) {
      for (const b of m.beats) {
        if (b.notes.length < 2) continue;
        const strings = b.notes.map((n) => n.string).sort((x, y) => x - y);
        const gaps = strings.slice(1).filter((s, i) => s - strings[i] > 1);
        if (b.notes.length > 2) expect(gaps, `bar ${bar + 1}: a struck group with a string skipped`).toEqual([]);
      }
    }
    const shapes: Record<string, string> = { G: '320003', C: 'x32010', D7: 'xx0212' };
    for (const c of song.chords) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
  });

  it("joy-to-the-world: the first phrase on exactly the plan's strings and frets", () => {
    const song = load('joy-to-the-world');
    const melody = trackNamed(song, 'Melody');
    const first = melody.measures.slice(0, 4).flatMap((m) => m.beats.flatMap((b) => struck(b).map((n) => `${n.string}:${n.fret}`)));
    expect(first.slice(0, 8)).toEqual(['2:3', '2:2', '2:0', '3:2', '3:0', '4:4', '4:2', '4:0']);
    // The plan's rhythm of that phrase: D quarter, C# dotted eighth, B sixteenth | A dotted quarter, G eighth | F# E | D.
    const rhythm = melody.measures.slice(0, 4).flatMap((m) => m.beats.map(dur));
    expect(rhythm.slice(0, 8)).toEqual(['q', 'e.', 's', 'q.', 'e', 'q', 'q', 'q.']);
    const teacher = trackNamed(song, 'Teacher');
    expect(teacher.role).toBe('rhythm');
    expect([...new Set(song.chords.map((c) => c.symbol))].sort()).toEqual(['A7', 'D', 'G']);
  });

  it("sakura: the plan's first-position notes, vibrato only on long fretted notes, an open-string drone", () => {
    const song = load('sakura');
    const melody = trackNamed(song, 'Melody');
    const plan: Record<string, string> = { E3: '4:2', F3: '4:3', A3: '3:2', B3: '2:0', C4: '2:1', B2: '5:2', C3: '5:3' };
    for (const n of notesOf(melody)) {
      const note = melody.measures[n.bar].beats.find((b) => b.start === n.tick)!.notes[0];
      expect(`${note.string}:${note.fret}`, `bar ${n.bar + 1}: ${name(n.midi)}`).toBe(plan[name(n.midi)]);
    }
    const shaken = melody.measures.flatMap((m, bar) => m.beats.filter((b) => b.notes.some((n) => n.vibrato)).map((b) => ({ bar, b })));
    expect(shaken.length).toBeGreaterThan(0);
    for (const { bar, b } of shaken) {
      expect(b.duration, `bar ${bar + 1}: vibrato on a long note`).toBeGreaterThanOrEqual(2 * PPQ);
      expect(b.notes[0].fret, `bar ${bar + 1}: vibrato needs a fretted note`).toBeGreaterThan(0);
    }
    expect(song.chords).toEqual([]);
    const drone = trackNamed(song, 'Drone');
    const droneNotes = new Set(drone.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret === 0 ? 0 : n.fret}${n.tie ? '-' : ''}`))));
    expect([...droneNotes].sort()).toEqual(['2:0', '2:0-', '6:0', '6:0-']);
    const words = song.annotations.map((a) => a.text);
    expect(words).toEqual(['Sakura, sakura', 'yayoi no sora wa', 'miwatasu kagiri', 'kasumi ka kumo ka', 'nioi zo izuru', 'iza ya, iza ya', 'mi ni yukan']);
  });

  it('joy-to-the-world: the estimate stays within its documented gap', () => {
    const id = 'joy-to-the-world';
    const yours = estimateDifficulty(load(id), { track: 0 });
    const gap = ESTIMATE_GAPS[id];
    expect(yours.level).toBeGreaterThanOrEqual(gap.min ?? songEntry(id)!.level - 1);
    expect(yours.level, yours.reasons.join(' ')).toBeLessThanOrEqual(gap.max!);
    // First position, one finger per fret: no stretch (the old hand window reported one).
    expect(yours.factors.stretch).toBe(0);
  });

  it('coming-round-the-mountain lands near its level in the estimate', () => {
    const id = 'coming-round-the-mountain';
    const est = estimateDifficulty(load(id));
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${songEntry(id)!.level}; estimate ${est.level}; ${est.reasons.join(' ') || 'no hard spots'}`);
    expect(Math.abs(est.level - songEntry(id)!.level)).toBeLessThanOrEqual(1);
  });
});

/**
 * Review (second pair of ears): each tune written out again from memory by the reviewer, in scale
 * degrees above a home note rather than as note names, so it shares nothing with the lists above.
 * `'` puts a degree an octave higher, `,` an octave lower; "|" marks bars but is not compared.
 * The engine turns the degrees into exact pitches, and every struck note of the tune must match.
 */
const SEMITONES: Record<string, number> = { '1': 0, b2: 1, '2': 2, b3: 3, '3': 4, '4': 5, '#4': 6, '5': 7, b6: 8, '6': 9, b7: 10, '7': 11 };
function degreesToMidi(home: string, degrees: string): number[] {
  const base = noteToMidi(home);
  return degrees
    .replace(/\|/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((d) => {
      const m = /^(b?#?\d)('*)(,*)$/.exec(d);
      if (!m || SEMITONES[m[1]] === undefined) throw new Error(`bad degree "${d}"`);
      return base + SEMITONES[m[1]] + 12 * m[2].length - 12 * m[3].length;
    });
}

// Oh! Susanna, sol-fa in G: re | mi sol sol la | sol mi do re | mi mi re do | re ... ; the chorus fa fa | la la la | sol sol mi do | re.
const SUSANNA_HALF = '3 5 5 6 | 5 3 1 2 | 3 3 2 1 | 2 2 | 3 5 5 6 | 5 3 1 2 | 3 3 2 2';
const REVIEW: Array<{ id: string; track: string; home: string; degrees: string }> = [
  {
    id: 'oh-susanna',
    track: 'Tune',
    home: 'G3',
    degrees: `2 | ${SUSANNA_HALF} | 1 2 | ${SUSANNA_HALF} | 1 | 4 4 | 6 6 6 | 5 5 3 1 | 2 1 2 | 3 5 5 6 | 5 3 1 2 | 3 3 2 2 | 1`,
  },
  {
    id: 'silent-night',
    track: 'Tune',
    home: 'G2',
    degrees: Array(2)
      .fill(
        "5 6 5 | 3 | 5 6 5 | 3 | 2' 2' | 7 | 1' 1' | 5 | 6 6 | 1' 7 6 | 5 6 5 | 3 | 6 6 | 1' 7 6 | 5 6 5 | 3 | " +
          "2' 2' | 4' 2' 7 | 1' | 3' | 1' 5 3 | 5 4 2 | 1",
      )
      .join(' | '),
  },
  {
    // The in scale on E: 1 b2 4 5 b6 (E F A B C).
    id: 'sakura',
    track: 'Melody',
    home: 'E3',
    degrees:
      '4 4 5 | 4 4 5 | 4 5 b6 5 | 4 5 4 b2 | 1 b6, 1 b2 | 1 1 b6, 5, | 4 5 b6 5 | 4 5 4 b2 | 1 b6, 1 b2 | 1 1 b6, 5, | ' +
      '4 4 5 | 4 4 5 | 1 b2 5 4 b2 | 1',
  },
];

describe('batch 3 review: the tunes as the reviewer knows them, in scale degrees', () => {
  it.each(REVIEW.map((r) => [r.id, r] as const))('%s', (id, r) => {
    const song = load(id);
    const got = notesOf(trackNamed(song, r.track)).map((n) => name(n.midi));
    expect(got).toEqual(degreesToMidi(r.home, r.degrees).map(name));
  });

  it('coming-round-the-mountain still carries no tune track (the tune is not certain enough to write)', () => {
    expect(load('coming-round-the-mountain').tracks.every((t) => t.role !== 'lead')).toBe(true);
  });

  it("joy-to-the-world's counting tip puts the dotted rhythm in beat 2, where it is", () => {
    const song = load('joy-to-the-world');
    const bar1 = trackNamed(song, 'Melody').measures[0].beats;
    expect(bar1.map((b) => b.start / PPQ)).toEqual([0, 1, 1.75]);
    expect(songEntry('joy-to-the-world')!.about).toMatch(/beat 2 as "2 e and a"/);
  });
});

describe('batch 3: the cross-check catches a wrong fret', () => {
  it('an F# played one fret low in Joy to the World (string 4 fret 3 = F) fails the note list and the key', () => {
    const text = readFileSync(new URL('../songs/joy-to-the-world/song.sixtab', import.meta.url), 'utf8');
    const broken = parseSixTab(text.replace('4:4{4}', '4:3{3}')).song!;
    const bar3 = broken.tracks[0].measures[2].beats.flatMap((b) => struck(b).map((n) => name(n.midi)));
    expect(bar3).not.toEqual(['F#3', 'E3']);
    expect(bar3[0]).toBe('F3');
    expect(scalePcs('D', 'major')).not.toContain(broken.tracks[0].measures[2].beats[0].notes[0].midi % 12);
  });

  it('a C played as C# in Sakura (string 2 fret 2) leaves the in scale', () => {
    const text = readFileSync(new URL('../songs/sakura/song.sixtab', import.meta.url), 'utf8');
    const broken = parseSixTab(text.replace('2:1{1}', '2:2{1}')).song!;
    const pcs = notesOf(broken.tracks[0]).map((n) => n.midi % 12);
    expect(pcs.some((pc) => !scalePcs('E', 'in').includes(pc))).toBe(true);
  });
});
