/**
 * Cross-checks for Prof. Varga's unit 11 (Sight-reading and rhythm) against the song library, the
 * technique exercises and the guitar, theory and audio engines: every "string N, fret M ({n:X})"
 * the text names is that note, the positions, phrases and shift counts are what the cards claim,
 * the shift points and keys of the Shifting study are the library's, the rhythms group as the
 * lessons say, the Metronome counts 7/8 as the card says, the Player tempos add up, and the swapped
 * Canarios really is missing from the library. Run with
 * `npx vitest run src/content/teachers/elena/elena-reading-and-meter.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { resolveMeter } from '@/core/audio';
import { midiAt, positionsForPitchClass, scalePatterns, scalePositions } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chroma, noteToMidi, parseNote, scaleNotes, staffPosition } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, parseRhythm, validateCourse, type RichText, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, {
  FIFTH_POSITION_F, FIFTH_POSITION_F_STAFF, HEMIOLA_BARS, PHRASE_FIRST, PHRASE_SEVENTH, RIFF_SEVEN, SEVEN_2_2_3, SEVEN_3_2_2, SEVENTH_ONLY, STEPS_UP_C,
  THREE_AGAINST_TWO, THREE_TWOS,
} from './elena-reading-and-meter';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function plain(text: RichText | undefined): string {
  if (text === undefined) return '';
  return typeof text === 'string' ? text : text.text;
}

function lesson(id: string): TeacherLesson {
  const l = unit.lessons.find((x) => x.id === id);
  if (!l) throw new Error(`no lesson ${id}`);
  return l;
}

function tasks(u: TeacherUnit): TaskStep[] {
  return u.lessons.flatMap((l) => l.steps.filter(isTaskStep));
}

function task(id: string): TaskStep {
  const found = tasks(unit).find((x) => x.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
}

/** Every string in the unit: cards, tasks, prompts, options, explanations, captions, facts. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** Problems with the tempos the Player tasks name: "about N BPM" is where it opens, "P % (M BPM)" must add up. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const s of tasks(u)) {
    const id = taskSong(s);
    if (!id || !songEntry(id)) continue;
    const bpm = (await song(id)).tempo[0].bpm;
    const pctParam = (s.params ?? []).find((p) => /^t\d+$/.test(p));
    const pct = pctParam ? Number(pctParam.slice(1)) : 100;
    const text = plain(s.body);
    for (const m of text.matchAll(/(\d+) % \((\d+) BPM\)/g)) {
      if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${s.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    }
    const about = text.match(/about (\d+) BPM/);
    if (about) {
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(about[1])) > 1) out.push(`${s.id}: says about ${about[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    } else if (pct !== 100) out.push(`${s.id}: opens at ${pct} % but names no BPM`);
  }
  return out;
}

type Fretted = Extract<TabNote, { string: number }>;
const struck = (notes: TabNote[]) => notes.filter((n): n is Fretted => 'string' in n);
const midis = (notes: TabNote[]) => struck(notes).map((n) => midiAt(n));
const TICKS: Record<string, number> = { s: 240, e: 480, q: 960, h: 1920, 'h.': 2880, qt: 640, et: 320 };
/** Onsets (ticks) of a tab line. */
function onsets(notes: TabNote[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const n of notes) {
    if ('string' in n) out.push(at);
    at += TICKS[n.duration];
  }
  return out;
}

/** Fits a fret into a position: one finger per fret from `p`; first position also takes open strings. */
const fits = (p: number, fret: number) => (p === 1 && fret === 0) || (fret >= p && fret <= p + 3);

/** The fewest shifts a fingering of these frets needs (positions 1 to 19). */
function fewestShifts(frets: number[]): number {
  let cost = new Map<number, number>();
  for (let p = 1; p <= 19; p++) if (fits(p, frets[0])) cost.set(p, 0);
  for (const f of frets.slice(1)) {
    const next = new Map<number, number>();
    const best = Math.min(...cost.values());
    for (let p = 1; p <= 19; p++) {
      if (!fits(p, f)) continue;
      next.set(p, Math.min(cost.has(p) ? cost.get(p)! : Infinity, best + 1));
    }
    cost = next;
  }
  return Math.min(...cost.values());
}

/** Can every pitch be played inside position p (some string, a fret the position covers)? */
function playableIn(p: number, pitches: number[]): boolean {
  return pitches.every((m) => [1, 2, 3, 4, 5, 6].some((s) => Array.from({ length: 23 }, (_, f) => f).some((f) => fits(p, f) && midiAt({ string: s, fret: f }) === m)));
}

const course = compileCourse(courseMeta('elena'), [unit]);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 11: Sight-reading and rhythm', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window, and its minutes near the estimate', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
      expect(Math.abs(l.minutes - s / 60), `${l.id}: minutes ${l.minutes}, estimated ${(s / 60).toFixed(1)}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('names every "string N, fret M ({n:X})" as the note that is there', () => {
    let checked = 0;
    for (const text of allStrings(unit)) {
      for (const m of text.matchAll(/string (\d), fret (\d+) \(\{n:([^}]+)\}\)/g)) {
        const at = midiAt({ string: Number(m[1]), fret: Number(m[2]) });
        const n = parseNote(m[3])!;
        expect(n, m[0]).toBeTruthy();
        if (n.octave !== null) expect(at, `${m[0]} in "${text.slice(0, 60)}..."`).toBe(n.midi);
        else expect(at % 12, m[0]).toBe(n.chroma);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(12);
  });

  it('puts fifth position, F major and the moved B flat where the cards say', () => {
    // The fretboard: C major at frets 4 to 8; fret 4 is used only by B on string 3.
    const atFour = scalePositions('C', 'major', { minFret: 4, maxFret: 4 }).map((p) => `${p.string}:${p.fret}`);
    expect(atFour).toEqual(['3:4']);
    // F major in fifth position: each position sounds its staff note, and finger = fret - 4.
    expect(FIFTH_POSITION_F.map(([s, f]) => midiAt({ string: s, fret: f }))).toEqual(FIFTH_POSITION_F_STAFF.map((n) => noteToMidi(n.note)));
    for (const [, f, finger] of FIFTH_POSITION_F) expect(finger).toBe(f - 4);
    expect(FIFTH_POSITION_F_STAFF.map((n) => parseNote(n.note)!.pcName)).toEqual(scaleNotes('F', 'major').concat('F'));
    // The same B flat: string 3 fret 3 and string 4 fret 8; the high one at string 1 fret 6.
    expect(midiAt({ string: 3, fret: 3 })).toBe(midiAt({ string: 4, fret: 8 }));
    expect(midiAt({ string: 1, fret: 6 })).toBe(noteToMidi('Bb4'));
    // Steps up from C: C D E F G, fingers from the fret.
    expect(STEPS_UP_C.map(([s, f]) => midiAt({ string: s, fret: f }))).toEqual(['C4', 'D4', 'E4', 'F4', 'G4'].map((n) => noteToMidi(n)));
    for (const [, f, finger] of STEPS_UP_C) expect(finger).toBe(f - 4);
    // C4 is written in the third space (position 5: lines are even, spaces odd, from the bottom line).
    expect(staffPosition('C4')).toMatchObject({ position: 5, onLine: false });
    // Every C in frets 5 to 8: three places.
    expect(positionsForPitchClass('C', { minFret: 5, maxFret: 8 }).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['1:8', '3:5', '6:8']);
  });

  it('shows seventh position and the position choices truthfully', () => {
    const g = scalePositions('G', 'major', { minFret: 7, maxFret: 10 });
    const lowest = Math.min(...g.map((p) => p.midi));
    const highest = Math.max(...g.map((p) => p.midi));
    expect(lowest).toBe(noteToMidi('B2'));
    expect(highest).toBe(noteToMidi('D5'));
    expect(highest - lowest).toBeGreaterThan(24);
    // F# in seventh position: two places.
    expect(positionsForPitchClass('F#', { minFret: 7, maxFret: 10 }).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['2:7', '5:9']);
    // The phrase: the same notes both ways; two shifts at least in first position, none in seventh.
    expect(midis(PHRASE_FIRST)).toEqual(midis(PHRASE_SEVENTH));
    expect(fewestShifts(struck(PHRASE_FIRST).map((n) => n.fret))).toBe(2);
    expect(fewestShifts(struck(PHRASE_SEVENTH).map((n) => n.fret))).toBe(0);
    expect(struck(PHRASE_SEVENTH).every((n) => n.fret >= 7 && n.fret <= 10)).toBe(true);
    // Elena's fingering of the first-position version: up to fifth position for A and B, back for G.
    const frets = struck(PHRASE_FIRST).map((n) => n.fret);
    expect(frets.slice(0, 4).every((f) => fits(1, f))).toBe(true);
    expect(frets.slice(4, 7).every((f) => fits(5, f))).toBe(true);
    expect(frets.slice(7).every((f) => fits(1, f))).toBe(true);
    expect(struck(PHRASE_FIRST)[4]).toMatchObject({ string: 1, fret: 5 });
    expect(midiAt(struck(PHRASE_FIRST)[4])).toBe(noteToMidi('A4'));
    expect(midiAt(struck(PHRASE_FIRST)[7])).toBe(noteToMidi('G4'));
    // The B2-to-D5 phrase: only seventh position of the candidates plays it without a shift.
    const pitches = SEVENTH_ONLY.map((n) => noteToMidi(n.note));
    expect(pitches.every((m) => scaleNotes('G', 'major').map((x) => chroma(x)).includes(m % 12))).toBe(true);
    expect(Math.min(...pitches)).toBe(noteToMidi('B2'));
    expect(Math.max(...pitches)).toBe(noteToMidi('D5'));
    expect([1, 5, 7, 9, 12].filter((p) => playableIn(p, pitches))).toEqual([7]);
    expect(midiAt({ string: 6, fret: 12 })).toBe(noteToMidi('E3'));
  });

  it('reads the studies the tasks name as the library has them', async () => {
    const fifth = await song('st-read-fifth-position');
    expect(fifth.bars.length).toBe(16);
    expect(fifth.bars[8].key).toBe('F');
    const flatsAfterNine = fifth.tracks[0].measures.slice(8).flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => `${n.string}:${n.fret}`)));
    expect(flatsAfterNine).toContain('4:8');
    expect(flatsAfterNine).toContain('1:6');
    const seventh = await song('st-read-seventh-position');
    expect(seventh.bars.slice(0, 8).every((b) => b.time.numerator === 4 && b.time.denominator === 4)).toBe(true);
    expect(seventh.bars.slice(8).every((b) => b.time.numerator === 6 && b.time.denominator === 8)).toBe(true);
    expect(seventh.tempo).toHaveLength(1);
    const sixteenthBars = seventh.tracks[0].measures.map((m, i) => (m.beats.some((b) => b.duration === 240) ? i + 1 : 0)).filter(Boolean);
    expect(sixteenthBars).toEqual([3, 6, 11, 14, 15]);
    const notes7 = seventh.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes7.every((n) => n.fret >= 7 && n.fret <= 10)).toBe(true);
    expect(notes7.some((n) => n.string === 3 && n.fret === 8)).toBe(true);
    expect(task('seventh-sixteenths').params).toEqual(['st-read-seventh-position', 'm3-6', 't66']);
  });

  it('marks the four shifts of the Shifting study where they are, with the keys and meters it has', async () => {
    const s = await song('st-read-shifting');
    const raw = await loadSongText('st-read-shifting');
    expect(s.bars.length).toBe(32);
    const lead = s.tracks[0].measures;
    const first = (bar: number) => lead[bar - 1].beats.find((b) => b.notes.length)!.notes[0];
    const last = (bar: number) => [...lead[bar - 1].beats].reverse().find((b) => b.notes.length)!.notes.slice(-1)[0];
    // Bars 8 to 9: the open B, then string 4 fret 6 (Ab) with finger 2.
    expect(last(8)).toMatchObject({ string: 2, fret: 0 });
    expect(first(9)).toMatchObject({ string: 4, fret: 6, finger: 2 });
    expect(first(9).midi).toBe(noteToMidi('Ab3'));
    // Bars 14 to 15: the same E4 on a new string.
    expect(last(14)).toMatchObject({ string: 2, fret: 5 });
    expect(first(15)).toMatchObject({ string: 3, fret: 9 });
    expect(last(14).midi).toBe(first(15).midi);
    expect(first(15).midi).toBe(noteToMidi('E4'));
    // Bar 20: G# with finger 1, into ninth position.
    expect(last(20)).toMatchObject({ string: 2, fret: 9, finger: 1 });
    expect(last(20).midi % 12).toBe(chroma('G#'));
    // Bars 26 to 27: the open B, then twelfth position.
    expect(last(26)).toMatchObject({ string: 2, fret: 0 });
    expect(first(27)).toMatchObject({ string: 1, fret: 12, finger: 1 });
    expect(raw).toMatch(/Open B: shift to fifth position/);
    expect(raw).toMatch(/Open B: shift to twelfth position/);
    // Keys: E, F minor, C, A, E; meters 4/4, 3/4, 6/8, 3/4, 4/4; never more than four sharps or flats.
    expect([0, 8, 14, 20, 26].map((b) => s.bars[b].key ?? s.key)).toEqual(['E', 'Fm', 'C', 'A', 'E']);
    expect([0, 8, 14, 20, 26].map((b) => `${s.bars[b].time.numerator}/${s.bars[b].time.denominator}`)).toEqual(['4/4', '3/4', '6/8', '3/4', '4/4']);
    // One tempo throughout: the eighth note keeps its speed.
    expect(s.tempo).toHaveLength(1);
    expect(task('shift-points').params).toEqual(['st-read-shifting', 'm8-9', 't63']);
    expect(task('daily-eight-bars').params).toEqual(['st-read-shifting', 'm1-8', 't75']);
  });

  it('sends the duo task to a duet whose bass the app can play, and the solea to its 12 counts', async () => {
    const duo = await song('st-duet-baroque');
    expect(duo.tracks.map((t) => t.name)).toEqual(['You (upper voice)', 'Teacher (bass line)']);
    expect(duo.key).toBe('Dm');
    expect(duo.bars[0].time).toMatchObject({ numerator: 3, denominator: 4 });
    const solea = await song('st-solea-compas');
    const accents = solea.tracks[0].measures.slice(0, 4).flatMap((m, b) => m.beats.filter((x) => x.notes.some((n) => n.accent) && x.start % 960 === 0).map((x) => b * 3 + x.start / 960 + 1));
    expect(accents).toEqual([3, 6, 8, 10, 12]);
    // Accents three apart, then two apart: 3+3+2+2+2.
    const gaps = [accents[0], ...accents.slice(1).map((a, i) => a - accents[i])];
    expect(gaps).toEqual([3, 3, 2, 2, 2]);
  });

  it('groups the odd meters, the hemiola and three against two as the lessons say', () => {
    const at = (pattern: string, time: string) => parseRhythm({ pattern, time }).onsets;
    // 5/4 as 3+2: beats 1 and 4; as 2+3: beats 1 and 3.
    expect(at('h. h | h. h', '3+2/4')).toEqual([0, 3, 5, 8].map((b) => b * 960));
    expect(at('h h. | h h.', '2+3/4')).toEqual([0, 2, 5, 7].map((b) => b * 960));
    // 7/8 as 3+2+2: eighths 1, 4 and 6.
    expect(at('q. q q | q. q q', '3+2+2/8')).toEqual([0, 3, 5, 7, 10, 12].map((e) => e * 480));
    // Nice cup of tea: the threes at 0, 640, 1280, the twos at 0, 960.
    const combined = at('qt et et qt', '2/4');
    expect(combined).toEqual([...new Set([0, 640, 1280, 0, 960])].sort((a, b) => a - b));
    expect(onsets(THREE_AGAINST_TWO)).toEqual(combined);
    expect(struck(THREE_AGAINST_TWO).map((n) => n.string)).toEqual([6, 1, 6, 1]);
    // The thumb (string 6) plays the twos.
    expect(onsets(THREE_AGAINST_TWO).filter((_, i) => struck(THREE_AGAINST_TWO)[i].string === 6)).toEqual([0, 960]);
    // The low E starts each group.
    const lows = (notes: TabNote[], s: number) => onsets(notes).filter((_, i) => struck(notes)[i].string === s).map((x) => x / 480 + 1);
    expect(lows(SEVEN_2_2_3, 6)).toEqual([1, 3, 5]);
    expect(lows(SEVEN_3_2_2, 5)).toEqual([1, 4, 6]);
    expect(lows(HEMIOLA_BARS, 6)).toEqual([1, 4, 7, 9, 11]);
    expect(lows(THREE_TWOS, 6)).toEqual([1, 3, 5, 7, 9, 11]);
    // The riff: A minor pentatonic box 1, two bars of seven eighths, the lowest note first in each group.
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    expect(box1.name).toBe('Box 1');
    const inBox = new Set(box1.notes.map((n) => `${n.string}:${n.fret}`));
    expect(struck(RIFF_SEVEN).every((n) => inBox.has(`${n.string}:${n.fret}`))).toBe(true);
    expect(RIFF_SEVEN).toHaveLength(14);
    for (const bar of [0, 7]) {
      for (const [from, to] of [[0, 2], [2, 4], [4, 7]]) {
        const group = midis(RIFF_SEVEN.slice(bar + from, bar + to));
        expect(group[0], `bar ${bar / 7 + 1}, group at ${from}`).toBe(Math.min(...group));
      }
    }
  });

  it('describes the Metronome in 7/8 and the Odd Meters ladder as they are', () => {
    const m = resolveMeter('7/8');
    expect(m.grouping).toEqual([2, 2, 3]);
    // The tempo counts quarter notes: 80 BPM is 160 eighths a minute.
    expect(m.tempoBeatTicks).toBe(960);
    expect(m.beats.map((b) => b.tick / 480 + 1)).toEqual([1, 3, 5]);
    const ex = getExercise('tech-odd-meters')!;
    expect(ex).toBeTruthy();
    const groupsOf = (c: unknown) => (c && typeof c === 'object' && 'groups' in c ? (c as { groups: number[] }).groups.join('+') : null);
    expect(ex.parts.map((p) => [p.time, groupsOf(p.click)])).toEqual([
      ['5/4', '3+2'], ['5/4', '2+3'], ['7/8', '2+2+3'], ['7/8', '3+2+2'],
    ]);
    expect(ex.parts.map((p) => p.tab).join(' ')).toMatch(/Em=022000/);
    expect(ex.parts.map((p) => p.tab).join(' ')).toMatch(/Am=x02210/);
  });

  it('names Player tempos that add up, and loops bars that exist', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
    for (const s of tasks(unit)) {
      const id = taskSong(s);
      if (!id) continue;
      expect(songEntry(id), id).toBeTruthy();
      const bars = (await song(id)).bars.length;
      for (const p of s.params ?? []) {
        const m = p.match(/^m(\d+)-(\d+)$/);
        if (m) expect(Number(m[2]), `${s.id}: ${p} in ${bars} bars`).toBeLessThanOrEqual(bars);
      }
    }
  });

  it('swaps Canarios because it is really missing, and teaches Scan & Import instead', () => {
    expect(songEntry('sanz-canarios')).toBeFalsy();
    const card = lesson('hemiola-and-polyrhythm').steps.find((x) => (x as { title?: string }).title === 'Your own Canarios') as { body: RichText };
    expect(plain(card.body)).toMatch(/in Tools, open Scan & Import/);
  });

  it('uses unique fact ids, each with the unit prefix', () => {
    const ids = unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^rd-/);
  });
});
