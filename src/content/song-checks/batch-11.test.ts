/**
 * Batch 11 cross-checks: ten original level-5 studies in src/content/songs/<id>/, checked against
 * note lists written out by hand from the composition plan, independently of the SixTab files.
 * Each file is parsed with the song core and the sounding pitches of its tune are compared bar by
 * bar (a bend is written "D5>E5", vibrato "A3~", an eighth-note slot "E4@3"), so a wrong fret
 * shows up as a wrong note name in a named bar. Also checked: chord tones on strong beats, key,
 * scale and range, the plan's spec for each study (box positions against the guitar engine, bends
 * and their targets, vibrato, the Travis bass, the thumb-lead brushes, arpeggio shapes, barre
 * shapes and their roots, second position), and the song core's difficulty estimate.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlayEvents, estimateDifficulty, flattenSong, parseSixTab, type Beat, type Note, type Song, type Track } from '@/core/song';
import { chordVoicings, scalePatterns } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, parseKey, scalePcs } from '@/core/theory';
import { songEntry } from '@/content/songs';

const PPQ = 960;
const EIGHTH = PPQ / 2;
/** Sounding standard tuning, low to high. */
const STANDARD = [40, 45, 50, 55, 59, 64];

/** What one study's tune should contain, written out by hand. */
interface Expected {
  id: string;
  /** The track that carries the tune. */
  track: string;
  /** Which notes of the track are the tune (default: beats holding a single note). */
  tune?: (n: Note, b: Beat) => boolean;
  /** Mark every tune note with its eighth-note slot in the bar ("E4@3" = the "and" of 2). */
  slots?: boolean;
  /** Sounding pitches of the tune, bar by bar ("|" between bars). */
  notes: string;
  /** The key as "tonic mode", and the scale the tune keeps to. */
  key: string;
  scale: [string, string];
  /** Notes allowed outside the scale, and only over these chords. */
  extra?: { notes: string[]; over: string[] };
  /** Lowest and highest note of the tune. */
  range: [string, string];
  /** Pitch class of the last tune note. */
  final: string;
}

const single = (_n: Note, b: Beat) => b.notes.length === 1;

const SONGS: Expected[] = [
  {
    id: 'st-pent-box-4',
    track: 'Your lick',
    // Bars 1-8 at the 12th fret, bars 9-16 the same an octave lower in open position.
    notes:
      'A4 C5 D5 C5 A4 G4 | A4 C5 A4 G4 E4 | G5 E5 D5 C5 A4 C5 | D5 C5 A4 G4 A4 | E3 G3 A3 C4 E4 D4 C4 | A3 C4 A3 G3 | D5>E5 E5 D5 C5 A4 G4 | E4 D4 C4 A3 |' +
      'A3 C4 D4 C4 A3 G3 | A3 C4 A3 G3 E3 | G4 E4 D4 C4 A3 C4 | D4 C4 A3 G3 A3 | E2 G2 A2 C3 E3 D3 C3 | A2 C3 A2 G2 | D4>E4 E4 D4 C4 A3 G3 | E3 D3 C3 A2',
    key: 'A minor',
    scale: ['A', 'minor-pentatonic'],
    range: ['E2', 'G5'],
    final: 'A',
  },
  {
    id: 'st-pent-box-5',
    track: 'Your lick',
    notes: 'A3 C4 D4 C4 E4 D4 C4 | A3 G3 A3 C4 E4 | G4 A4 G4 E4 D4 E4 | D4 C4 G3 A3 | G2 A2 C3 D3 E3 D3 C3 | A2 C3 D3 G3 | G4 E4 D4 C4 D4 C4 | A3 G3 E3 G3 A3~',
    key: 'A minor',
    scale: ['A', 'minor-pentatonic'],
    range: ['G2', 'A4'],
    final: 'A',
  },
  {
    id: 'st-lick-bend',
    track: 'Your lick',
    // Target, bend to it, (check): E D>E E | ... | A G>A A | ... | over E7: G# G>G#.
    notes: 'E4 D4>E4 E4 | G4 E4 D4 C4 A3 | A4 G4>A4 A4 | C5 A4 G4 E4 D4 | E4 D4>E4 E4 G4 A4 | A4 G4>A4 E4 D4 C4 | G#4 G4>G#4 E4 D4 | C4 A3 G3 A3',
    key: 'A minor',
    scale: ['A', 'minor-pentatonic'],
    extra: { notes: ['G#'], over: ['E7'] },
    range: ['G3', 'C5'],
    final: 'A',
  },
  {
    id: 'st-lick-vibrato',
    track: 'Your lick',
    notes: 'C4 D4 E4 G4 A4~ | G4~ E4 D4 C4 A3 | A3 C4 A3 C4 D4~ | A4~ C5 A4 G4 E4 | D4 E4 D4 E4 G4~ | D4~ E4 D4 E4 G4 | A4~ G4 E4 D4 C4 | A3~',
    key: 'A minor',
    scale: ['A', 'minor-pentatonic'],
    range: ['A3', 'C5'],
    final: 'A',
  },
  {
    id: 'st-travis-melody',
    track: 'Your part',
    // The tune on strings 1 and 2; slot 0, 2, 4, 6 = on a beat (pinched), 1, 3, 5, 7 = on an "and".
    tune: (n) => n.string <= 2,
    slots: true,
    notes:
      'E4@0 G4@3 E4@6 | D4@0 C4@2 | F4@0 G4@3 F4@6 | E4@0 C4@7 | E4@3 D4@6 | C4@0 B3@2 | D4@0 F4@3 D4@6 | B3@0 C4@7 |' +
      'F4@3 G4@6 | E4@0 D4@2 C4@4 | F4@0 G4@3 F4@6 | G4@0 F4@3 D4@6 | E4@0 G4@3 E4@6 | C4@0 E4@3 D4@6 | F4@0 D4@3 B3@6 | C4@0',
    key: 'C major',
    scale: ['C', 'major'],
    range: ['B3', 'G4'],
    final: 'C',
  },
  {
    id: 'st-carter-style',
    track: 'Your part',
    // The tune is the thumb's single notes on strings 6-4 (ties are held, not struck).
    tune: (n, b) => n.string >= 4 && b.notes.length === 1,
    notes:
      'C3 D3 E3 C3 | G2 A2 B2 | C3 A2 C3 F3 | E3 C3 | C3 D3 E3 C3 | E3 F3 E3 C3 | B2 D3 B2 | G2 |' +
      'F3 C3 A2 | C3 D3 C3 A2 | E3 G2 C3 | E3 D3 C3 B2 | C3 D3 E3 C3 | F3 C3 A2 | G2 B2 D3 B2 | C3',
    key: 'C major',
    scale: ['C', 'major'],
    range: ['G2', 'F3'],
    final: 'C',
  },
  {
    id: 'st-arpeggio-triads',
    track: 'Your part',
    notes:
      'C3 E3 G3 C4 G3 E3 C3 E3 | G3 C4 G3 E3 C3 | D3 F3 A3 D4 A3 F3 D3 F3 | A3 D4 A3 F3 D3 | E3 G3 B3 E4 B3 G3 E3 G3 | B3 E4 B3 G3 E3 |' +
      'F3 A3 C4 F4 C4 A3 F3 A3 | C4 F4 C4 A3 F3 | G2 B2 D3 G3 D3 B2 G2 B2 | D3 G3 D3 B2 G2 | A2 C3 E3 A3 E3 C3 A2 C3 | E3 A3 E3 C3 A2 |' +
      'F3 A3 C4 A3 G3 B3 D4 B3 | G3 B3 E4 B3 E3 A3 C4 A3 | F3 A3 D4 A3 D3 G3 B3 G3 | C3 E3 G3 C4',
    key: 'C major',
    scale: ['C', 'major'],
    range: ['G2', 'F4'],
    final: 'C',
  },
  {
    id: 'st-read-second-position',
    track: 'Your part',
    notes:
      'A3 B3 C#4 E4 C#4 | D4 E4 F#4 D4 | E4 F#4 E4 D4 B3 | C#4 A3 | E4 F#4 G#4 A4 E4 | F#4 E4 D4 A3 D4 | B3 C#4 D4 B3 | A3 |' +
      'F#2 G#2 A2 C#3 A2 | B2 C#3 D3 F#3 D3 | C#3 B2 C#3 E#3 C#3 | F#3 | D3 E3 F#3 A3 F#3 | B3 A3 F#3 B2 | G#2 B2 C#3 E#3 | F#3',
    key: 'A major',
    // A major, then its relative F# minor (same pitches) with the raised seventh, E#, over C#7.
    scale: ['A', 'major'],
    extra: { notes: ['E#'], over: ['C#7'] },
    range: ['F#2', 'A4'],
    final: 'F#',
  },
];

/**
 * Songs whose estimate sits outside the plan's level +-1, with the reason (checked and kept on
 * purpose). The core measures what the hands do (speed, stretch, height on the neck, techniques,
 * chord shapes); these studies are hard for reasons it does not see.
 */
const ESTIMATE_GAPS: Record<string, { min: number; why: string }> = {
  'st-pent-box-5': {
    min: 3,
    why:
      'One box at frets 2-5 with no shifts, eighth notes at 88 and vibrato once: the core scores it like box 1 and box 2 (3). ' +
      'The plan places it at 5 as the last of the five boxes, learned after boxes 1-4.',
  },
  'st-arpeggio-triads': {
    min: 3,
    why:
      'Eighth notes at 88 in first position: the core counts notes per second and stretches, not the string crossings with ' +
      'strict alternate picking (up-strokes landing on a new string) that make arpeggios hard.',
  },
  // Gap note (integration pass 2): st-barre-f no longer needs an entry. It estimated 3; the core now
  // scores the shapes written in the song (the full F barre 133211, 6.9 of 10) rather than the
  // chord symbols, and the estimate is 4, within one of the plan's 5.
  'st-travis-melody': {
    min: 3,
    why:
      'Gap note (integration pass 2): it used to estimate 4 from two artefacts, a five-fret stretch that is not there (the ' +
      'old hand window started at the first fretted note) and an F scored by its symbol as the full barre, though the song ' +
      'holds the small F (xx3211). With both fixed the core scores the shapes the hand holds (C, small F, Am, G7: open ' +
      'grips) and the fingerstyle: 3, a better estimate of what the hands do. What makes it level 5 is a melody that ' +
      'mostly lands together with the alternating thumb, which its thumb-independence measure sees only a little of.',
  },
  'st-read-second-position': {
    min: 2,
    why:
      'A reading study: quarters and eighths at 76 within frets 2-5. The difficulty is reading in a position with no open ' +
      'strings (and E#), which the physical estimate cannot see.',
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
/** A pitch written by hand ("E#3", "Bb2") as the core names it ("F3", "A#2"). */
const canon = (s: string) => name(noteToMidi(s));
const pcOf = (s: string) => noteToMidi(`${s}4`) % 12;
const letter = (midi: number) => name(midi).replace(/-?\d+$/, '');
const dur = (b: Beat) => DURATION[b.duration] ?? `${b.duration}t`;
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
/** A chord shape as written in SixTab, low string first: x02220. */
const shape = (v: Array<number | null> | undefined) => (v ?? []).map((f) => (f === null || f < 0 ? 'x' : String(f))).join('');
/** The pitch a note sounds at its peak: the bend's target when it is bent. */
const peak = (n: Note) => n.midi + (n.bend ? Math.round(n.bend.amount) : 0);
const pos = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;

/** A token as written in the expected lists: "D5>E5", "A3~", "E4@3". */
function token(n: Note, b: Beat, slots?: boolean): string {
  return `${name(n.midi)}${n.bend ? `>${name(peak(n))}` : ''}${n.vibrato ? '~' : ''}${slots ? `@${b.start / EIGHTH}` : ''}`;
}
/** The same token with its pitches spelled as the core spells them. */
function canonToken(t: string): string {
  const m = /^([A-G][#b]*-?\d)(?:>([A-G][#b]*-?\d))?(~)?(@\d+)?$/.exec(t);
  if (!m) throw new Error(`bad token "${t}"`);
  return `${canon(m[1])}${m[2] ? `>${canon(m[2])}` : ''}${m[3] ?? ''}${m[4] ?? ''}`;
}

/** The chord symbol in force at a bar and tick (chord events are song-wide). */
function chordAt(song: Song, bar: number, tick: number): string | undefined {
  let found: string | undefined;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) found = c.symbol;
  return found;
}

/** Every struck note of a track in written order, with where it sits. */
function notesOf(track: Track, pick: (n: Note, b: Beat) => boolean = () => true) {
  return track.measures.flatMap((m, bar) => m.beats.flatMap((b) => struck(b).filter((n) => pick(n, b)).map((n) => ({ bar, tick: b.start, beat: b, note: n, midi: n.midi }))));
}

/** The voicing of a chord event, as sounding pitches low to high. */
function voicingPitches(v: Array<number | null> | undefined): string[] {
  return (v ?? []).flatMap((f, i) => (f === null || f < 0 ? [] : [name(STANDARD[i] + f)]));
}

describe.each(SONGS.map((s) => [s.id, s] as [string, Expected]))('batch 11: %s', (id, want) => {
  const song = load(id);
  const track = trackNamed(song, want.track);
  const pick = want.tune ?? single;
  const tune = notesOf(track, pick);

  it('sounds the expected notes, bar by bar', () => {
    const got = track.measures.map((m) => m.beats.flatMap((b) => struck(b).filter((n) => pick(n, b)).map((n) => token(n, b, want.slots))));
    const expected = bars(want.notes).map((bar) => bar.map(canonToken));
    expect(got.length, `${id}: number of bars`).toBe(expected.length);
    got.forEach((bar, i) => expect(bar, `${id}: bar ${i + 1}`).toEqual(expected[i]));
  });

  it('puts chord tones on the strong beats (or steps off them to the next note)', () => {
    const problems: string[] = [];
    tune.forEach((n, i) => {
      if (n.tick !== 0 && n.tick !== 2 * PPQ) return;
      const symbol = chordAt(song, n.bar, n.tick);
      if (!symbol) return problems.push(`bar ${n.bar + 1}: ${name(n.midi)} with no chord in force`);
      // A bent note is heard at the top of its bend.
      const heard = peak(n.note);
      if (chordPcs(symbol).includes(heard % 12)) return;
      const next = tune.slice(i + 1).find((x) => x.midi !== heard);
      const step = next ? Math.abs(next.midi - heard) : 99;
      if (step > 2) problems.push(`bar ${n.bar + 1}, tick ${n.tick}: ${name(heard)} over ${symbol} does not resolve by step`);
    });
    expect(problems).toEqual([]);
  });

  it('keeps to its key, scale and range, and ends on the home note', () => {
    const k = parseKey(song.key ?? '');
    expect(k && `${k.tonic} ${k.mode}`).toBe(want.key);
    const allowed = scalePcs(want.scale[0], want.scale[1]);
    const extra = (want.extra?.notes ?? []).map(pcOf);
    const outside: string[] = [];
    for (const n of tune) {
      for (const midi of [n.midi, peak(n.note)]) {
        if (allowed.includes(midi % 12)) continue;
        const chord = chordAt(song, n.bar, n.tick) ?? '';
        if (extra.includes(midi % 12) && want.extra!.over.includes(chord)) continue;
        outside.push(`bar ${n.bar + 1}: ${name(midi)} over ${chord}`);
      }
    }
    expect(outside, `${id}: notes outside ${want.scale.join(' ')}`).toEqual([]);
    const midis = tune.map((n) => n.midi);
    expect([name(Math.min(...midis)), name(Math.max(...midis))]).toEqual(want.range.map(canon));
    expect(midis[midis.length - 1] % 12, `${id}: last note`).toBe(pcOf(want.final));
  });

  it("lands near its level in the song core's difficulty estimate (the learner's part)", () => {
    const level = songEntry(id)!.level;
    const est = estimateDifficulty(song, { track: 0 });
    // eslint-disable-next-line no-console
    console.log(`${id}: level ${level}; estimate ${est.level}; ${est.reasons.join(' ') || 'no hard spots'}`);
    const gap = ESTIMATE_GAPS[id];
    expect(est.level, `${id}: estimate ${est.level} is far below level ${level}`).toBeGreaterThanOrEqual(gap?.min ?? level - 1);
    expect(est.level, `${id}: estimate ${est.level} is far above level ${level}: ${est.reasons.join(' ')}`).toBeLessThanOrEqual(level + 1);
  });
});

/** The engine's A minor pentatonic box, as "string:fret" -> finger. */
function box(index: number, upTheNeck: boolean): Map<string, number> {
  const p = scalePatterns('A', 'minor-pentatonic', { upTheNeck }).find((x) => x.id === `box-${index}`)!;
  return new Map(p.notes.map((n) => [pos(n), n.finger]));
}

/** Last struck note of a bar. */
function lastOf(track: Track, bar: number): Note {
  const notes = track.measures[bar].beats.flatMap(struck);
  return notes[notes.length - 1];
}

describe('batch 11: the plan details', () => {
  it('st-pent-box-4: only box 4 at fret 12, then the same music in open position, one bend in each', () => {
    const song = load('st-pent-box-4');
    const lick = trackNamed(song, 'Your lick');
    expect(lick.measures.length).toBe(16);
    const high = box(4, true);
    const open = box(4, false);
    // The plan's list of box 4 notes at the 12th fret, and in open position.
    expect([...high.keys()].sort()).toEqual(['6:12', '6:15', '5:12', '5:15', '4:12', '4:14', '3:12', '3:14', '2:13', '2:15', '1:12', '1:15'].sort());
    expect([...open.keys()].sort()).toEqual(['6:0', '6:3', '5:0', '5:3', '4:0', '4:2', '3:0', '3:2', '2:1', '2:3', '1:0', '1:3'].sort());
    for (const [half, shapeMap, from] of [['fret 12', high, 0], ['open', open, 8]] as const) {
      const notes = notesOf({ ...lick, measures: lick.measures.slice(from, from + 8) });
      for (const n of notes) {
        const bar = from + n.bar + 1;
        expect(shapeMap.has(pos(n.note)), `${half}, bar ${bar}: ${pos(n.note)} is in box 4`).toBe(true);
        // Fingers as the Scales screen shows them; the bend takes finger 3 (finger 2 behind it).
        const want = n.note.bend ? 3 : shapeMap.get(pos(n.note));
        if (typeof n.note.finger === 'number') expect(n.note.finger, `${half}, bar ${bar}: finger on ${pos(n.note)}`).toBe(want);
      }
      expect(new Set(notes.map((n) => pos(n.note))).size, `${half}: all 12 notes of the box`).toBe(12);
      const bends = notes.filter((n) => n.note.bend);
      expect(bends.map((n) => `${from + n.bar + 1} ${pos(n.note)} b${n.note.bend!.amount}`), `${half}: one whole-step bend`).toEqual([`${from + 7} 2:${from ? 3 : 15} b2`]);
      // Straight after the bend: the real E on string 1, the pitch the bend should reach.
      const after = notes[notes.indexOf(bends[0]) + 1];
      expect(after.midi, `${half}: the note after the bend matches it`).toBe(peak(bends[0].note));
      expect(after.note.string).toBe(1);
    }
    // The open version is the fret-12 version with every fret 12 lower, on the same strings, in the same rhythm.
    for (let bar = 0; bar < 8; bar++) {
      const a = lick.measures[bar].beats.map((b) => `${dur(b)} ${b.notes.map((n) => `${n.string}:${n.fret - 12}${n.bend ? 'b' : ''}`).join(' ')}`);
      const b = lick.measures[bar + 8].beats.map((x) => `${dur(x)} ${x.notes.map((n) => `${n.string}:${n.fret}${n.bend ? 'b' : ''}`).join(' ')}`);
      expect(b, `bar ${bar + 9} is bar ${bar + 1} in open position`).toEqual(a);
    }
    // Eighth and quarter notes only; asks (bars 2 and 6) stop on C, E or G, answers (4 and 8) on A.
    for (const m of lick.measures) for (const b of m.beats) expect(['e', 'q']).toContain(dur(b));
    for (const from of [0, 8]) {
      for (const bar of [1, 5]) expect(['C', 'E', 'G'], `ask ending in bar ${from + bar + 1}`).toContain(letter(lastOf(lick, from + bar).midi));
      for (const bar of [3, 7]) expect(letter(lastOf(lick, from + bar).midi), `answer ending in bar ${from + bar + 1}`).toBe('A');
    }
    expect(song.chords.map((c) => `${c.symbol}=${shape(c.voicing)}`)).toEqual(['Am7=x02010']);
  });

  it('st-pent-box-5: only box 5 at frets 2-5, one finger per fret, vibrato on the last note only', () => {
    const song = load('st-pent-box-5');
    const lick = trackNamed(song, 'Your lick');
    expect(lick.measures.length).toBe(8);
    const five = box(5, false);
    expect([...five.keys()].sort()).toEqual(['6:3', '6:5', '5:3', '5:5', '4:2', '4:5', '3:2', '3:5', '2:3', '2:5', '1:3', '1:5'].sort());
    const notes = notesOf(lick);
    for (const n of notes) {
      expect(five.has(pos(n.note)), `bar ${n.bar + 1}: ${pos(n.note)} is in box 5`).toBe(true);
      if (typeof n.note.finger === 'number') expect(n.note.finger, `bar ${n.bar + 1}: finger on ${pos(n.note)}`).toBe(five.get(pos(n.note)));
    }
    expect(new Set(notes.map((n) => pos(n.note))).size, 'all 12 notes of the box').toBe(12);
    const last = notes[notes.length - 1];
    expect(notes.filter((n) => n.note.vibrato)).toEqual([last]);
    expect(notes.some((n) => n.note.bend || n.note.legato || n.note.slide)).toBe(false);
    // Eighths and quarters; the last note is held for two beats so the vibrato has time.
    const beats = lick.measures.flatMap((m) => m.beats);
    beats.slice(0, -1).forEach((b) => expect(['e', 'q']).toContain(dur(b)));
    expect(dur(beats[beats.length - 1])).toBe('h');
    for (const bar of [1, 5]) expect(['C', 'E', 'G']).toContain(letter(lastOf(lick, bar).midi));
    for (const bar of [3, 7]) expect(letter(lastOf(lick, bar).midi)).toBe('A');
  });

  it('st-lick-bend: every bend follows its target fret, whole steps D-E and G-A, a half step G-G# over E7', () => {
    const song = load('st-lick-bend');
    const lick = trackNamed(song, 'Your lick');
    const notes = notesOf(lick);
    const bends = notes.filter((n) => n.note.bend);
    expect(bends.map((n) => `${n.bar + 1} ${pos(n.note)} b${n.note.bend!.amount} ${chordAt(song, n.bar, n.tick)}`)).toEqual([
      '1 3:7 b2 Am7',
      '3 2:8 b2 Dm7',
      '5 3:7 b2 Am7',
      '6 2:8 b2 Am7',
      '7 2:8 b1 E7',
    ]);
    for (const b of bends) {
      const before = notes[notes.indexOf(b) - 1];
      // The target is played first, on the same string, at the fret the bend has to reach.
      expect(pos(before.note), `bar ${b.bar + 1}: target before the bend`).toBe(`${b.note.string}:${b.note.fret + b.note.bend!.amount}`);
      expect(before.midi).toBe(peak(b.note));
      expect(b.note.finger, `bar ${b.bar + 1}: bend with finger 3`).toBe(3);
      expect(b.note.bend!.release).toBeFalsy();
    }
    // Everything else is box 1, as the engine has it.
    const one = box(1, false);
    const targets = new Set(['3:9', '2:10', '2:9']);
    for (const n of notes) {
      if (targets.has(pos(n.note))) continue;
      expect(one.has(pos(n.note)), `bar ${n.bar + 1}: ${pos(n.note)} is in box 1`).toBe(true);
      if (!n.note.bend && typeof n.note.finger === 'number') expect(n.note.finger, `bar ${n.bar + 1}: finger on ${pos(n.note)}`).toBe(one.get(pos(n.note)));
    }
    const shapes: Record<string, string> = { Am7: 'x02010', Dm7: 'xx0211', E7: '020100' };
    for (const c of song.chords) if (c.voicing) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
    expect(song.chords.map((c) => `${c.bar + 1}:${c.symbol}`).join(' ')).toBe('1:Am7 3:Dm7 5:Am7 7:E7 8:Am7');
  });

  it('st-lick-vibrato: long notes on A (1:5), G (2:8) and D (3:7), all with vibrato, at 2, then 3, then 4 waves a beat', () => {
    const song = load('st-lick-vibrato');
    const lick = trackNamed(song, 'Your lick');
    const notes = notesOf(lick);
    const long = notes.filter((n) => n.beat.duration >= 2 * PPQ);
    expect(long.map((n) => `${n.bar + 1} ${pos(n.note)}${n.note.vibrato ? '~' : ''}`)).toEqual(['1 1:5~', '2 2:8~', '3 3:7~', '4 1:5~', '5 2:8~', '6 3:7~', '7 1:5~', '8 4:7~']);
    expect(notes.filter((n) => n.note.vibrato && n.beat.duration < 2 * PPQ)).toEqual([]);
    // The strongest finger for each: finger 1 on A at fret 5, finger 3 on G and D.
    for (const n of long) expect(n.note.finger, `bar ${n.bar + 1}`).toBe(n.note.fret === 5 ? 1 : 3);
    const rates = song.annotations.filter((a) => /waves per beat/.test(a.text)).map((a) => `${a.bar + 1}: ${a.text}`);
    expect(rates).toEqual(['1: vibrato: 2 waves per beat', '3: vibrato: 3 waves per beat', '5: vibrato: 4 waves per beat']);
    const one = box(1, false);
    for (const n of notes) expect(one.has(pos(n.note)), `bar ${n.bar + 1}: ${pos(n.note)} is in box 1`).toBe(true);
    expect(song.tempo[0].bpm, 'a slow blues').toBeLessThanOrEqual(66);
  });

  it('st-travis-melody: the alternating thumb on every beat, the tune on strings 1-2, pinched or between', () => {
    const song = load('st-travis-melody');
    const part = trackNamed(song, 'Your part');
    expect(part.measures.length).toBe(16);
    const bass: Record<string, string> = { C: 'C3 E3 G2 E3', Am: 'A2 E3 A2 E3', G7: 'G2 D3 G2 D3', F: 'F3 A3 F3 A3' };
    let pinches = 0;
    let between = 0;
    part.measures.forEach((m, bar) => {
      const chord = chordAt(song, bar, 0)!;
      const thumb = m.beats.filter((b) => b.start % PPQ === 0).map((b) => b.notes.filter((n) => n.string >= 3));
      if (bar < 15) {
        expect(thumb.map((t) => t.map((n) => name(n.midi)).join(' ')).join(' '), `bar ${bar + 1}: thumb over ${chord}`).toBe(bass[chord]);
        for (const t of thumb) expect(t[0].palmMute, `bar ${bar + 1}: thumb notes are palm muted`).toBe(true);
      }
      for (const b of m.beats) {
        const low = b.notes.filter((n) => n.string >= 3);
        // A tie holds an earlier tune note (the early arrivals in bars 4 and 8): it is not plucked.
        const top = b.notes.filter((n) => n.string <= 2 && !n.tie);
        expect(top.length, `bar ${bar + 1}: one tune note at a time`).toBeLessThanOrEqual(1);
        if (b.start % PPQ !== 0) expect(low.length, `bar ${bar + 1}: the thumb plays only on the beat`).toBe(0);
        if (top.length) {
          expect(top[0].palmMute, `bar ${bar + 1}: the tune rings`).toBeFalsy();
          expect(top[0].fret, `bar ${bar + 1}: tune notes stay in first position`).toBeLessThanOrEqual(3);
          if (b.start % PPQ === 0) {
            expect(low.length, `bar ${bar + 1}: a tune note on the beat is pinched with the thumb`).toBe(1);
            pinches++;
          } else between++;
        }
      }
    });
    expect(pinches).toBeGreaterThan(15);
    expect(between).toBeGreaterThan(10);
    const shapes: Record<string, string> = { C: 'x32010', F: 'xx3211', G7: '320001', Am: 'x02210' };
    for (const c of song.chords) if (c.voicing) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
    expect(new Set(song.chords.map((c) => c.symbol))).toEqual(new Set(['C', 'F', 'Am', 'G7']));
  });

  it('st-carter-style: the thumb on every beat on strings 6-4, a down-brush of strings 3-1 of the chord on every "and"', () => {
    const song = load('st-carter-style');
    const part = trackNamed(song, 'Your part');
    expect(part.measures.length).toBe(16);
    const shapes: Record<string, string> = { C: 'x32010', F: 'xx3211', G7: '320001' };
    for (const c of song.chords) if (c.voicing) expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
    // Strings 3, 2, 1 of each shape, as pitches written out by hand.
    const top: Record<string, string> = { C: 'G3 C4 E4', F: 'A3 C4 F4', G7: 'G3 B3 F4' };
    part.measures.forEach((m, bar) => {
      const chord = chordAt(song, bar, 0)!;
      const beats = bar === 15 ? m.beats.slice(0, 4) : m.beats;
      expect(beats.map(dur), `bar ${bar + 1}: eighth notes`).toEqual(beats.map(() => 'e'));
      expect(beats.length, `bar ${bar + 1}`).toBe(bar === 15 ? 4 : 8);
      beats.forEach((b, i) => {
        if (i % 2 === 0) {
          expect(b.notes.length, `bar ${bar + 1}, beat ${i / 2 + 1}: one thumb note`).toBe(1);
          const n = b.notes[0];
          expect(n.string, `bar ${bar + 1}: the tune is on strings 6-4`).toBeGreaterThanOrEqual(4);
          expect(n.fret, `bar ${bar + 1}: first position`).toBeLessThanOrEqual(3);
        } else {
          expect(b.notes.map((n) => name(n.midi)).join(' '), `bar ${bar + 1}: brush on the "and" of ${(i + 1) / 2}`).toBe(top[chord]);
          expect(b.stroke, `bar ${bar + 1}: brush down`).toBe('down');
        }
      });
    });
    const last = part.measures[15].beats;
    expect(last.map(dur)).toEqual(['e', 'e', 'e', 'e', 'h']);
    expect(last[4].notes.map((n) => name(n.midi)).join(' ')).toBe('C3 E3 G3 C4 E4');
    // Held notes: ties on the thumb's string, never on a brush.
    const ties = part.measures.flatMap((m, bar) => m.beats.flatMap((b) => b.notes.filter((n) => n.tie).map(() => `${bar + 1}.${b.start / PPQ + 1}`)));
    expect(ties).toEqual(['2.2', '4.2', '4.4', '7.2', '8.2', '8.3', '8.4', '9.2', '11.2', '14.2', '16.2']);
  });

  it('st-arpeggio-triads: each chord of C major up and down from its root in first position, then a tune of them', () => {
    const song = load('st-arpeggio-triads');
    const part = trackNamed(song, 'Your part');
    expect(part.measures.length).toBe(16);
    expect(song.chords.map((c) => `${c.bar + 1}${c.tick ? `.${c.tick / PPQ + 1}` : ''}:${c.symbol}`).join(' ')).toBe(
      '1:C 3:Dm 5:Em 7:F 9:G 11:Am 13:F 13.3:G 14:Em 14.3:Am 15:Dm 15.3:G 16:C',
    );
    const order = ['C', 'Dm', 'Em', 'F', 'G', 'Am'];
    for (let k = 0; k < 6; k++) {
      const [a, b] = [part.measures[2 * k], part.measures[2 * k + 1]];
      const pitches = [...a.beats, ...b.beats].map((x) => x.notes[0].midi);
      const root = pitches[0];
      // Root, third, fifth, octave: one octave, the triad of the chord, landing on the root.
      expect(Math.max(...pitches) - root, `${order[k]}: one octave`).toBe(12);
      expect(Math.min(...pitches), `${order[k]}: starts on its lowest note, the root`).toBe(root);
      expect(pitches[pitches.length - 1]).toBe(root);
      expect(letter(root)).toBe(order[k].replace('m', ''));
      for (const p of pitches) expect(chordPcs(order[k]), `${order[k]}: ${name(p)}`).toContain(p % 12);
      expect([...a.beats, ...b.beats].map(dur).join(' ')).toBe('e e e e e e e e e e e e h');
    }
    // Alternate picking marked in bar 1: down on the beat, up on the "and".
    expect(part.measures[0].beats.map((b) => b.stroke)).toEqual(['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up']);
    for (const [bar, m] of part.measures.entries()) {
      for (const b of m.beats) {
        for (const n of b.notes) {
          expect(n.fret, `bar ${bar + 1}: first position`).toBeLessThanOrEqual(3);
          // First position: the finger is the fret, or finger 4 on fret 3 when finger 3 is busy, or the
          // finger the engine's open shape of the chord in force uses there (Am: finger 3 on string 3).
          if (typeof n.finger === 'number') {
            const v = chordVoicings(chordAt(song, bar, b.start)!)[0];
            const inShape = v.frets[6 - n.string] === n.fret && v.fingers[6 - n.string] === n.finger;
            expect(n.finger === n.fret || (n.fret === 3 && n.finger === 4) || inShape, `bar ${bar + 1}: finger ${n.finger} on fret ${n.fret}`).toBe(true);
          }
        }
        if (bar >= 12 && b.notes.length === 1) expect(chordPcs(chordAt(song, bar, b.start)!), `bar ${bar + 1}: ${name(b.notes[0].midi)}`).toContain(b.notes[0].midi % 12);
      }
    }
    // The tune's top notes, one per group of four eighths: C D | E C | D B | C.
    const tops = part.measures.slice(12).flatMap((m) => {
      const ns = m.beats.filter((b) => b.notes.length === 1).map((b) => b.notes[0].midi);
      return [ns.slice(0, 4), ns.slice(4, 8)].filter((g) => g.length).map((g) => name(Math.max(...g)));
    });
    expect(tops).toEqual(['C4', 'D4', 'E4', 'C4', 'D4', 'B3', 'C4']);
    expect(song.chords.some((c) => /dim|°/.test(c.symbol)), 'B diminished waits for the seventh-chord study').toBe(false);
  });

  it('st-barre-f: C to F and back, then Am to F, two strums a bar, the barre checked string by string', () => {
    const song = load('st-barre-f');
    const part = trackNamed(song, 'Your strum');
    expect(part.measures.length).toBe(16);
    const perBar = part.measures.map((_, bar) => chordAt(song, bar, 0));
    expect(perBar.join(' ')).toBe('C C F F C C F F Am Am F F Am Am F F');
    // The plan's shapes, and what they sound, written out by hand.
    const sounds: Record<string, string> = { C: 'C3 E3 G3 C4 E4', F: 'F2 C3 F3 A3 C4 F4', Am: 'A2 E3 A3 C4 E4' };
    const shapes: Record<string, string> = { C: 'x32010', F: '133211', Am: 'x02210' };
    for (const c of song.chords) {
      if (!c.voicing) continue;
      expect(shape(c.voicing), `${c.symbol} shape`).toBe(shapes[c.symbol]);
      expect(voicingPitches(c.voicing).join(' '), `${c.symbol} sounds`).toBe(sounds[c.symbol]);
    }
    part.measures.forEach((m, bar) => {
      if (bar % 4 !== 3) {
        expect(m.beats.map((b) => `${dur(b)}${b.slash ? (b.stroke === 'down' ? 'D' : '/') : '?'}`), `bar ${bar + 1}: two half-note strums`).toEqual(['hD', 'hD']);
        return;
      }
      // The check: strings 6 to 1 of the F barre one at a time, then time to change (or the last strum).
      const picked = m.beats.filter((b) => b.notes.length).map((b) => `${pos(b.notes[0])} ${name(b.notes[0].midi)}`);
      expect(picked, `bar ${bar + 1}: the barre string by string`).toEqual(['6:1 F2', '5:3 C3', '4:3 F3', '3:2 A3', '2:1 C4', '1:1 F4']);
      expect(m.beats.map(dur)).toEqual(['e', 'e', 'e', 'e', 'e', 'e', 'q']);
      const end = m.beats[6];
      expect(bar === 15 ? end.slash : end.notes.length === 0 && !end.slash, `bar ${bar + 1}: ${bar === 15 ? 'a last strum' : 'a rest to change'}`).toBe(true);
      // Fingers of the full barre: 1 across fret 1, 3 and 4 on fret 3, 2 on string 3.
      expect(m.beats.slice(0, 6).map((b) => b.notes[0].finger)).toEqual([1, 3, 4, 2, 1, 1]);
    });
    expect(song.annotations.map((a) => a.text).join(' ')).toMatch(/Fmaj7 \(xx3210\)/);
  });

  it('st-barre-shapes: the four movable shapes, one bar each, roots on string 6 or 5 named aloud', () => {
    const song = load('st-barre-shapes');
    const part = trackNamed(song, 'Your strum');
    expect(part.measures.length).toBe(16);
    const perBar = part.measures.map((_, bar) => song.chords.find((c) => c.bar === bar)!);
    expect(perBar.map((c) => `${c.symbol}=${shape(c.voicing)}`)).toEqual([
      'F=133211', 'G=355433', 'A=577655',
      'Fm=133111', 'Gm=355333', 'Am=577555',
      'Bb=x13331', 'B=x24442', 'C=x35553',
      'Bm=x24432', 'Cm=x35543',
      'C=x35553', 'Am=577555', 'F=133211', 'G=355433', 'C=x35553',
    ]);
    // What each shape sounds, written out by hand from the fretboard.
    const sounds: Record<string, string> = {
      F: 'F2 C3 F3 A3 C4 F4', G: 'G2 D3 G3 B3 D4 G4', A: 'A2 E3 A3 C#4 E4 A4',
      Fm: 'F2 C3 F3 Ab3 C4 F4', Gm: 'G2 D3 G3 Bb3 D4 G4', Am: 'A2 E3 A3 C4 E4 A4',
      Bb: 'Bb2 F3 Bb3 D4 F4', B: 'B2 F#3 B3 D#4 F#4', C: 'C3 G3 C4 E4 G4',
      Bm: 'B2 F#3 B3 D4 F#4', Cm: 'C3 G3 C4 Eb4 G4',
    };
    // Each shape is the open E, Em, A or Am shape moved up by the barre fret.
    const base: Record<string, Array<number | null>> = { E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], A: [null, 0, 2, 2, 2, 0], Am: [null, 0, 2, 2, 1, 0] };
    const family = ['E', 'E', 'E', 'Em', 'Em', 'Em', 'A', 'A', 'A', 'Am', 'Am', 'A', 'Em', 'E', 'E', 'A'];
    perBar.forEach((c, i) => {
      expect(voicingPitches(c.voicing).join(' '), `bar ${i + 1}: ${c.symbol} sounds`).toBe(sounds[c.symbol].split(' ').map(canon).join(' '));
      const v = c.voicing!;
      const lowest = v.findIndex((f) => f !== null);
      const f = family[i];
      // The root is the lowest note: on string 6 for the E shapes, on string 5 for the A shapes.
      expect(6 - lowest, `bar ${i + 1}: ${c.symbol} (${f} shape) has its root on string ${f.startsWith('E') ? 6 : 5}`).toBe(f.startsWith('E') ? 6 : 5);
      expect((STANDARD[lowest] + v[lowest]!) % 12, `bar ${i + 1}: ${c.symbol} has its root in the bass`).toBe(pcOf(c.symbol.replace(/m$/, '')));
      const fret = v[lowest]!;
      expect(v, `bar ${i + 1}: ${c.symbol} is the ${f} shape at fret ${fret}`).toEqual(base[f].map((x) => (x === null ? null : x + fret)));
    });
    // Four steady down-strums a bar, a held last chord.
    part.measures.forEach((m, bar) => {
      const want = bar === 15 ? ['wD'] : ['qD', 'qD', 'qD', 'qD'];
      expect(m.beats.map((b) => `${dur(b)}${b.slash && b.stroke === 'down' ? 'D' : '?'}`), `bar ${bar + 1}`).toEqual(want);
    });
    // The root named on beat 1 of every bar.
    const sung = part.measures.map((m) => {
      const words = m.beats.map((b) => b.lyric ?? '');
      return words[0] === 'B-' && words[1] === 'flat' ? 'Bb' : words[0];
    });
    expect(sung).toEqual(perBar.map((c) => c.symbol.replace(/m$/, '')));
  });

  it('st-read-second-position: finger 1 on fret 2 throughout, no open strings, A major then F# minor', () => {
    const song = load('st-read-second-position');
    const part = trackNamed(song, 'Your part');
    expect(part.measures.length).toBe(16);
    for (const [bar, m] of part.measures.entries()) {
      for (const b of m.beats) {
        for (const n of b.notes) {
          expect(n.fret, `bar ${bar + 1}: no open strings`).toBeGreaterThanOrEqual(2);
          expect(n.fret, `bar ${bar + 1}: second position`).toBeLessThanOrEqual(5);
          if (typeof n.finger === 'number') expect(n.finger, `bar ${bar + 1}: finger on fret ${n.fret}`).toBe(n.fret - 1);
        }
      }
    }
    const k = parseKey(song.bars[8].key ?? '');
    expect(k && `${k.tonic} ${k.mode}`, 'bar 9 changes to F# minor').toBe('F# minor');
    const notes = notesOf(part);
    const major = scalePcs('A', 'major');
    const harmonic = scalePcs('F#', 'harmonic-minor');
    const natural = scalePcs('F#', 'minor');
    for (const n of notes) {
      if (n.bar < 8) expect(major, `bar ${n.bar + 1}: ${name(n.midi)} in A major`).toContain(n.midi % 12);
      else if (chordAt(song, n.bar, n.tick) === 'C#7') expect(harmonic, `bar ${n.bar + 1}: ${name(n.midi)} in F# harmonic minor`).toContain(n.midi % 12);
      else expect(natural, `bar ${n.bar + 1}: ${name(n.midi)} in F# minor`).toContain(n.midi % 12);
    }
    // Every string is read, across the two halves.
    expect(new Set(notes.map((n) => n.note.string))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    // E# appears only over C#7, at string 4 fret 3.
    const eSharp = notes.filter((n) => n.midi % 12 === 5);
    expect(eSharp.map((n) => `${n.bar + 1} ${pos(n.note)} ${chordAt(song, n.bar, n.tick)}`)).toEqual(['11 4:3 C#7', '15 4:3 C#7']);
    expect(new Set(song.chords.map((c) => c.symbol))).toEqual(new Set(['A', 'D', 'E7', 'F#m', 'Bm', 'C#7']));
  });
});

/**
 * Independent review (a second musician, after the writer). Pitches are recomputed from string and
 * fret without the song core, and the claims the review corrected are pinned down: the Travis
 * tune's early arrivals are held over the bar line (and sound held), the second-position study
 * reads strings 3-1 and then 6-3 and never plays B or E open, the thumb-lead study's F bars keep
 * finger 3 on string 4 fret 3 apart from one open D, and box 4's about names its two bends rightly.
 */
const REVIEWED = [
  'st-pent-box-4', 'st-pent-box-5', 'st-lick-bend', 'st-lick-vibrato', 'st-travis-melody',
  'st-carter-style', 'st-arpeggio-triads', 'st-barre-f', 'st-barre-shapes', 'st-read-second-position',
];

describe('batch 11: independent review', () => {
  it('every note sounds what its string and fret give in standard tuning with no capo', () => {
    for (const id of REVIEWED) {
      const text = readFileSync(new URL(`../songs/${id}/song.sixtab`, import.meta.url), 'utf8');
      expect(/^\s*(tuning|capo):/m.test(text), `${id}: standard tuning, no capo`).toBe(false);
      const song = load(id);
      for (const t of song.tracks) {
        t.measures.forEach((m, bar) => {
          for (const b of m.beats) for (const n of b.notes) expect(n.midi, `${id}, ${t.name}, bar ${bar + 1}: ${pos(n)}`).toBe(STANDARD[6 - n.string] + n.fret);
        });
      }
    }
  });

  it('st-travis-melody: the early C at the ends of bars 4 and 8 is tied over the bar line and sounds held', () => {
    const song = load('st-travis-melody');
    const part = trackNamed(song, 'Your part');
    const ties = part.measures.flatMap((m, bar) => m.beats.flatMap((b) => b.notes.filter((n) => n.tie).map((n) => `${bar + 1}.${b.start / PPQ + 1} ${pos(n)}`)));
    expect(ties).toEqual(['5.1 2:1', '9.1 2:1']);
    for (const bar of [3, 7]) {
      const beats = part.measures[bar].beats;
      const last = beats[beats.length - 1];
      expect(last.start, `bar ${bar + 1}: on the "and" of 4`).toBe(3.5 * PPQ);
      expect(last.notes.map((n) => `${pos(n)} ${name(n.midi)}`), `bar ${bar + 1}: the early C`).toEqual(['2:1 C4']);
    }
    // Playback holds it for its eighth plus beat 1 of the next bar.
    const timeline = flattenSong(song);
    const held = buildPlayEvents(timeline).flatMap((e) => (e.kind === 'note' && e.midi === 60 ? [e] : []));
    for (const bar of [3, 7]) {
      const tick = timeline.bars.find((b) => b.bar === bar)!.start + 3.5 * PPQ;
      expect(held.find((e) => e.tick === tick)?.ticks, `bar ${bar + 1}: the early C rings into the next bar`).toBe(EIGHTH + PPQ);
    }
  });

  it('st-read-second-position: strings 3-1 in A major, 6-3 in F# minor, and B and E are never open', () => {
    const song = load('st-read-second-position');
    const part = trackNamed(song, 'Your part');
    const strings = (from: number, to: number) => [...new Set(part.measures.slice(from, to).flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.string))))].sort();
    expect(strings(0, 8)).toEqual([1, 2, 3]);
    expect(strings(8, 16)).toEqual([3, 4, 5, 6]);
    expect(songEntry('st-read-second-position')!.teaches).toContain('Low notes on strings 6 to 3');
    // The about: the B and E a learner would play open are string 3 fret 4 and string 2 fret 5 here.
    const at = (note: string) => [...new Set(notesOf(part).filter((n) => n.midi === noteToMidi(note)).map((n) => pos(n.note)))];
    expect(at('B3')).toEqual(['3:4']);
    expect(at('E4')).toEqual(['2:5']);
  });

  it('st-carter-style: under F the thumb uses string 4 fret 3 (finger 3 of the chord) except one open D in bar 10', () => {
    const song = load('st-carter-style');
    const part = trackNamed(song, 'Your part');
    const string4 = part.measures.flatMap((m, bar) =>
      m.beats.flatMap((b) => (chordAt(song, bar, b.start) === 'F' ? b.notes.filter((n) => n.string === 4 && !n.tie).map((n) => `${bar + 1} ${pos(n)}`) : [])),
    );
    expect(string4.filter((s) => !s.endsWith(' 4:3'))).toEqual(['10 4:0']);
  });

  it('st-pent-box-4: the about names the bars and frets of its two bends', () => {
    const bends = notesOf(trackNamed(load('st-pent-box-4'), 'Your lick')).filter((n) => n.note.bend);
    expect(bends.map((n) => `${n.bar + 1} ${pos(n.note)}`)).toEqual(['7 2:15', '15 2:3']);
    const about = songEntry('st-pent-box-4')!.about;
    expect(about).toMatch(/In bar 7 bend the D on string 2/);
    expect(about).toMatch(/bar 15 at fret 3/);
  });
});
