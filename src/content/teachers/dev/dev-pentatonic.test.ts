/**
 * Cross-checks for Dev's unit 4 (The pentatonic, all five boxes) against the plan, the engines and
 * the song library: the boxes the lessons draw are the plan's boxes, note for note; every "string N,
 * fret M" the text pairs with a note is that note on the neck; the tab quoted on the cards is the
 * library's; the licks have the slide, pull-off, bend and vibrato the tasks describe; the jam tracks
 * play the chords the text names at a tempo their band can play; every Player tempo is the song's
 * tempo times the task's percentage. Run with `npx vitest run src/content/teachers/dev/dev-pentatonic.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/teachers.json';
import repertoire from '@/content/plan/repertoire.json';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { identifyFretted, pitchClassAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chroma, scaleNotes, scalePcs } from '@/core/theory';
import { findShape, focusFromParams } from '@/features/arcade/core/focus';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { A_MAJOR_A_TO_A, BOX_2_LICK_BAR_1, CONNECT_BARS_1_2, box } from './dev-pentatonic';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const CODES: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };

/** The notes of some bars of a song's first lead track, as tab notes (single notes only). */
async function leadBars(id: string, from: number, to: number): Promise<TabNote[]> {
  const s = await song(id);
  const lead = s.tracks.find((t) => t.role === 'lead')!;
  const out: TabNote[] = [];
  for (let i = from - 1; i < to; i++) {
    for (const b of lead.measures[i].beats) {
      if (b.notes.length === 0) out.push({ rest: true, duration: CODES[b.duration] ?? String(b.duration) });
      else out.push({ string: b.notes[0].string, fret: b.notes[0].fret, duration: CODES[b.duration] ?? String(b.duration) });
    }
  }
  return out;
}

/** Every lead note of a song with its bar (1-based) and the note before it on the same track. */
async function leadNotes(id: string) {
  const s = await song(id);
  const lead = s.tracks.find((t) => t.role === 'lead')!;
  return lead.measures.flatMap((m, i) => m.beats.flatMap((b) => b.notes.map((n) => ({ ...n, bar: i + 1, duration: b.duration }))));
}

/** "s:f" keys of a pattern's notes. */
const keys = (notes: ReadonlyArray<{ string: number; fret: number }>) => new Set(notes.map((n) => `${n.string}:${n.fret}`));

/** The plan's `string N fret M (X)` positions in a lesson's show, as "s:f:X". */
function planPositions(slug: string): string[] {
  const lessons = (plan as { courses: Array<{ units: Array<{ lessons: Array<{ id: string; show: string }> }> }> }).courses.flatMap((c) => c.units.flatMap((u) => u.lessons));
  const l = lessons.find((x) => x.id.endsWith(`/${slug}`))!;
  return [...l.show.matchAll(/string (\d) fret (\d+) \(([A-G][#b]?)\)/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`);
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/** Every "string N, fret M" the text pairs with a note, checked on the neck. */
function noteClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const check = (s: string, f: string, n: string, where: string) => {
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} \(string (\d), fret (\d+)\)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  return out;
}

/** The tempo a song is written at, or the repertoire's tempo for a song not in the library yet. */
async function writtenBpm(id: string): Promise<number | null> {
  if (songEntry(id)) return (await song(id)).tempo[0].bpm;
  const r = repertoire as { pieces: Array<{ id: string; tempo?: number }> };
  return r.pieces.find((p) => p.id === id)?.tempo ?? null;
}

/** Problems with the tempos a Player task (or its fallback) names: every "N % (M BPM)" and the opening tempo. */
async function bpmProblems(where: string, params: readonly string[], body: RichText, mode: 'wait' | 'other'): Promise<string[]> {
  const id = params[0];
  const bpm = await writtenBpm(id);
  if (bpm === null) return [`${where}: no tempo known for ${id}`];
  const pct = Number((params.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
  const text = plain(body);
  const out: string[] = [];
  const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
  for (const m of percents) {
    const want = (bpm * Number(m[1])) / 100;
    if (Math.abs(want - Number(m[2])) > 1) out.push(`${where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
  }
  const opens = percents.find((m) => Number(m[1]) === pct);
  const plainBpm = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '').match(/(\d+) BPM/);
  if (!opens && mode !== 'wait') {
    if (!plainBpm) out.push(`${where}: never says the tempo it opens at (${pct} % of ${bpm})`);
    else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
  }
  return out;
}

async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const where = `${lesson.id} > ${step.id}`;
      if (taskSong(step)) out.push(...(await bpmProblems(where, step.params!, step.body, step.params!.includes('wait') ? 'wait' : 'other')));
      if (step.fallback && step.fallback.tool === 'player') out.push(...(await bpmProblems(`${where} (fallback)`, step.fallback.params!, step.fallback.body, 'other')));
    }
  }
  return out;
}

/** Every progressions task: the jam track exists, plays the chords the text names, at a tempo its band can play. */
function jamProblems(u: TeacherUnit, chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step) || step.tool !== 'progressions') continue;
      const [id, key] = step.params!;
      const p = getProgression(id);
      if (!p) {
        out.push(`${step.id}: no progression ${id}`);
        continue;
      }
      const tonic = key.length > 1 && key.endsWith('b') ? key[0].toUpperCase() + 'b' : key[0].toUpperCase() + key.slice(1).replace('-sharp', '#');
      if (!p.keys.includes(tonic)) out.push(`${step.id}: ${id} is not offered in ${tonic}`);
      const chords = [...new Set(progressionInKey(p, tonic).bars.flat().map((c) => c.symbol))];
      if (chordsNamed[step.id] && JSON.stringify(chords) !== JSON.stringify(chordsNamed[step.id])) out.push(`${step.id}: ${id} in ${tonic} plays ${chords.join(' ')}`);
      const bpm = Number(plain(step.body).match(/(\d+) BPM/)?.[1]);
      const range = BACKING_STYLES[p.feel.backing].tempo;
      if (!(bpm >= Math.max(30, Math.min(range.min, 50)) && bpm <= range.max + 20)) out.push(`${step.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays`);
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];

describe('Dev unit 4: the pentatonic, all five boxes', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
    }
  });

  it('draws the boxes the plan lists, note for note', () => {
    const asPlan = (p: ReturnType<typeof box>) => p.notes.map((n) => `${n.string}:${n.fret}:${n.note}`).sort();
    expect(asPlan(box(2))).toEqual(planPositions('box-2').sort());
    expect(asPlan(box(3))).toEqual(planPositions('box-3').sort());
    expect([...asPlan(box(4)), ...asPlan(box(5, true))].sort()).toEqual(planPositions('boxes-4-and-5').sort());
    // The frets each lesson gives.
    const span = (p: ReturnType<typeof box>) => [p.minFret, p.maxFret];
    expect([span(box(1)), span(box(2)), span(box(3)), span(box(4)), span(box(5))]).toEqual([[5, 8], [7, 10], [9, 13], [12, 15], [14, 17]]);
    expect([span(box(4, true)), span(box(5, true))]).toEqual([[0, 3], [2, 5]]);
    // Box 4 in open position is box 4 at fret 12, twelve frets lower, string for string.
    expect([...keys(box(4, true).notes)].sort()).toEqual([...box(4).notes.map((n) => `${n.string}:${n.fret - 12}`)].sort());
    // Every box holds the five notes of A minor pentatonic and nothing else.
    for (const n of [1, 2, 3, 4, 5] as const) expect(new Set(box(n).notes.map((x) => x.note))).toEqual(new Set(['A', 'C', 'D', 'E', 'G']));
  });

  it('shares the notes the text says between neighbouring boxes', () => {
    const shared = [...keys(box(1).notes)].filter((k) => keys(box(2).notes).has(k)).sort();
    expect(shared).toEqual(['1:8', '2:8', '3:7', '4:7', '5:7', '6:8']);
    const fiveToOne = [...keys(box(5, true).notes)].filter((k) => keys(box(1).notes).has(k)).sort();
    expect(fiveToOne).toEqual(['1:5', '2:5', '3:5', '4:5', '5:5', '6:5']);
    // Box 2's roots, box 3's roots, box 5's roots.
    expect(box(2).notes.filter((n) => n.note === 'A').map((n) => `${n.string}:${n.fret}`)).toEqual(['4:7', '2:10']);
    expect(box(3).notes.filter((n) => n.note === 'A').map((n) => `${n.string}:${n.fret}`)).toEqual(['5:12', '2:10']);
    expect(box(5, true).notes.filter((n) => n.note === 'A').map((n) => `${n.string}:${n.fret}`)).toEqual(['6:5', '3:2', '1:5']);
  });

  it('fingers box 2 one finger per fret and box 3 as the card says', () => {
    for (const n of box(2).notes) expect(n.finger, `${n.string}:${n.fret}`).toBe(n.fret - 6);
    const f3 = Object.fromEntries(box(3).notes.map((n) => [`${n.string}:${n.fret}`, n.finger]));
    expect(f3).toEqual({ '6:10': 1, '6:12': 3, '5:10': 1, '5:12': 3, '4:10': 1, '4:12': 3, '3:9': 1, '3:12': 4, '2:10': 1, '2:13': 4, '1:10': 1, '1:12': 3 });
  });

  it('pairs every fret in the text with the note that is there', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
  });

  it('quotes the licks and the study as the library has them', async () => {
    expect(BOX_2_LICK_BAR_1).toEqual(await leadBars('st-pent-box-2', 1, 1));
    expect(CONNECT_BARS_1_2).toEqual(await leadBars('st-pent-connect', 1, 2));
    // Box 2 lick: finger 3 slides on string 3 from fret 7 (D) to fret 9 (E).
    const b2 = await leadNotes('st-pent-box-2');
    expect([b2[0].string, b2[0].fret, b2[0].finger, b2[1].string, b2[1].fret, b2[1].slide]).toEqual([3, 7, 3, 3, 9, 'up']);
    // Box 3 lick: it ends with a pull-off from string 2 fret 13 (C) to fret 10 (A).
    const b3 = await leadNotes('st-pent-box-3');
    const [penult, last] = b3.slice(-2);
    expect([penult.string, penult.fret, last.string, last.fret, last.legato, last.finger]).toEqual([2, 13, 2, 10, 'pull', 1]);
    // Box 4 lick: bars 1-8 at fret 12, bars 9-16 the same an octave lower; the bend in bars 7 and 15.
    const b4 = await leadNotes('st-pent-box-4');
    const high = b4.filter((n) => n.bar <= 8);
    const low = b4.filter((n) => n.bar > 8);
    expect(high.every((n) => n.fret >= 12 && n.fret <= 15)).toBe(true);
    expect(low.map((n) => `${n.string}:${n.fret}`)).toEqual(high.map((n) => `${n.string}:${n.fret - 12}`));
    for (const bar of [7, 15]) {
      const i = b4.findIndex((n) => n.bar === bar);
      expect(b4[i].bend?.amount, `bar ${bar}`).toBe(2);
      expect(b4[i].string).toBe(2);
      expect(pitchClassAt(b4[i])).toBe(chroma('D'));
      expect([b4[i + 1].string, pitchClassAt(b4[i + 1])]).toEqual([1, chroma('E')]);
      expect(b4[i].finger).toBe(3);
    }
    // Box 5 lick: it ends on A at string 3 fret 2, two beats, vibrato, finger 1.
    const b5 = await leadNotes('st-pent-box-5');
    const end = b5[b5.length - 1];
    expect([end.string, end.fret, end.duration, end.vibrato, end.finger]).toEqual([3, 2, 1920, true, 1]);
    // Each lick uses its own box and nothing else.
    expect([...keys(b2)].every((k) => keys(box(2).notes).has(k))).toBe(true);
    expect([...keys(b3)].every((k) => keys(box(3).notes).has(k))).toBe(true);
    expect([...keys(b4.filter((n) => n.bar <= 8))].every((k) => keys(box(4).notes).has(k))).toBe(true);
    expect([...keys(b5)].every((k) => keys(box(5, true).notes).has(k))).toBe(true);
  });

  it('climbs the study the way the lesson says: slides between the boxes, then the same notes over C', async () => {
    const s = await song('st-pent-connect');
    expect(s.bars.length).toBe(32);
    const notes = await leadNotes('st-pent-connect');
    const slides = notes.filter((n) => n.slide && n.bar <= 16).map((n) => `${n.bar} ${n.string}:${n.fret} ${n.slide} f${n.finger}`);
    expect(slides).toEqual([
      '2 3:7 up f3', // box 5 -> box 1
      '4 3:9 up f3', // box 1 -> box 2
      '6 1:12 up f3', // box 2 -> box 3
      '7 3:14 up f3', // box 3 -> box 4
      '10 3:9 down f1', // box 4 -> box 3
      '10 4:7 down f1', // box 3 -> box 2
      '12 3:5 down f1', // box 2 -> box 1
      '14 3:2 down f1', // box 1 -> box 5
    ]);
    // The climb reaches box 4 (fret 15) in bar 8.
    expect(notes.filter((n) => n.bar <= 7).every((n) => n.fret < 15)).toBe(true);
    expect(notes.some((n) => n.bar === 8 && n.fret === 15)).toBe(true);
    // Bars 1-16 over Am7, bars 17-32 over C, the same notes but for the last one.
    const chordAt = (bar: number) => [...s.chords].filter((c) => c.bar <= bar - 1).pop()!.symbol;
    expect([chordAt(1), chordAt(16), chordAt(17), chordAt(32)]).toEqual(['Am7', 'Am7', 'C', 'C']);
    const first = notes.filter((n) => n.bar <= 16).map((n) => `${n.string}:${n.fret}`);
    const second = notes.filter((n) => n.bar > 16).map((n) => `${n.string}:${n.fret}`);
    expect(second.slice(0, -1)).toEqual(first.slice(0, -1));
    expect([first[first.length - 1], second[second.length - 1]]).toEqual(['3:2', '3:5']); // home to A, then home to C
  });

  it('teaches major pentatonic with the right notes and shapes', () => {
    expect(new Set(scalePcs('A', 'minor-pentatonic'))).toEqual(new Set(scalePcs('C', 'major-pentatonic')));
    expect(scaleNotes('A', 'major-pentatonic')).toEqual(['A', 'B', 'C#', 'E', 'F#']);
    expect(scaleNotes('G', 'major-pentatonic')).toEqual(['G', 'A', 'B', 'D', 'E']);
    expect(scaleNotes('E', 'major-pentatonic')).toEqual(['E', 'F#', 'G#', 'B', 'C#']);
    // The box 1 shape at fret 2 is F# minor pentatonic box 1, and its notes are A major pentatonic.
    const fs = scalePatterns('F#', 'minor-pentatonic').find((p) => p.id === 'box-1')!;
    expect([fs.minFret, fs.maxFret]).toEqual([2, 5]);
    expect(new Set(fs.notes.map((n) => pitchClassAt(n)))).toEqual(new Set(scalePcs('A', 'major-pentatonic')));
    // Three frets down from box 1, string for string.
    expect(fs.notes.map((n) => `${n.string}:${n.fret + 3}`)).toEqual(box(1).notes.map((n) => `${n.string}:${n.fret}`));
    // From A to A: A B C# E F# A, rising.
    expect(A_MAJOR_A_TO_A.map((n) => ('rest' in n ? -1 : pitchClassAt(n)))).toEqual(['A', 'B', 'C#', 'E', 'F#', 'A'].map((x) => chroma(x)));
    // The relative minor of A major is F# minor; the shape at the nut is E minor pentatonic = G major pentatonic.
    const em = scalePatterns('E', 'minor-pentatonic').find((p) => p.id === 'box-1')!;
    expect([em.minFret, em.maxFret]).toEqual([0, 3]);
    expect(new Set(em.notes.map((n) => pitchClassAt(n)))).toEqual(new Set(scalePcs('G', 'major-pentatonic')));
  });

  it('marks the A and C roots of the two-moods map where they are', () => {
    const map = unit.lessons.find((l) => l.id === 'pentatonic-jam')!.steps[0] as { figure: { dots: Array<{ string: number; fret: number; role: string }> } };
    const roots = map.figure.dots.filter((d) => d.role === 'root');
    const cs = map.figure.dots.filter((d) => d.role === 'target');
    expect(roots.every((d) => pitchClassAt(d) === chroma('A'))).toBe(true);
    expect(cs.every((d) => pitchClassAt(d) === chroma('C'))).toBe(true);
    expect(cs.map((d) => `${d.string}:${d.fret}`).sort()).toEqual(['1:8', '2:13', '3:17', '3:5', '4:10', '5:15', '6:8']);
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    expect(
      jamProblems(unit, {
        'box-2-jam': ['Am7'],
        'box-3-jam': ['Am', 'F', 'G'],
        'boxes-4-5-jam': ['Am7', 'Dm7', 'E7'],
        'major-pent-jam': ['A', 'E'],
        'minor-jam': ['Am', 'G', 'F'],
        'major-jam': ['C', 'G', 'Am', 'F'],
      }),
    ).toEqual([]);
  });

  it('sends the arcade tasks to real scales and shapes (box 4 at fret 12, as on the Scales screen)', () => {
    for (const step of tasks.filter((t) => t.tool === 'arcade')) {
      const [, slug, shape] = step.params!;
      const focus = focusFromParams(slug, shape);
      expect(focus, step.id).toMatchObject({ tonic: 'A', scale: 'minor-pentatonic' });
      if (shape) expect(findShape('A', 'minor-pentatonic', shape), `${step.id} ${shape}`).toBeTruthy();
    }
    // The arcade lays the boxes out up the neck like the Scales screen (features/arcade/core/focus.ts).
    expect(findShape('A', 'minor-pentatonic', 'box-4')!.minFret).toBe(12);
    expect(plain(tasks.find((t) => t.id === 'boxes-hunt')!.body)).toContain('frets 12 to 15');
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('falls back to library pieces in the same scale while Mo Li Hua and Morning Mood are missing', async () => {
    // Amazing Grace's tune uses only G major pentatonic, the five notes of Mo Li Hua.
    const grace = await song('amazing-grace');
    const tune = grace.tracks.find((t) => t.role === 'lead')!;
    const pcs = new Set(tune.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi % 12))));
    expect(pcs).toEqual(new Set(scalePcs('G', 'major-pentatonic')));
    expect(tune.name).toBe('Tune');
    // Review fix: the fallback says where the Player lets you choose your part (options, Parts).
    const grace2 = tasks.find((t) => t.id === 'mo-li-hua')!;
    expect(plain(grace2.fallback!.body)).toContain('under Parts, pick Tune');
    // The fallback for Morning Mood loops bars 17 to 32 of the study: the part over C.
    const mm = tasks.find((t) => t.id === 'morning-mood')!;
    expect(mm.fallback!.params).toEqual(['st-pent-connect', 'm17-32', 't91']);
    for (const t of tasks) if (taskSong(t) && !songEntry(taskSong(t)!)) expect(t.fallback, t.id).toBeTruthy();
    // Shapes named in the text exist (C is the groove of bars 17 to 32).
    expect(identifyFretted('x32010').symbol).toBe('C');
  });
});
