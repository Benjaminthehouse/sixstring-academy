/**
 * Cross-checks for Dev's unit 11 (Improvising with intent) against the engines and the song library:
 * every "string N, fret M" the text pairs with a note is that note and every chord shape is its
 * chord; the arpeggios, chord tones and thirds are the chords' own and sit where the text puts them
 * in the E-shape position of C major; Dev's lines land a chord tone (or the third) on every beat 1
 * and walk into each change by a step; the motif's variations change exactly what the lesson says;
 * the modes, their colour notes and vamps are the theory engine's; the studies the tasks open are the
 * library's; the jam tracks play the chords the text names at tempos their band plays; every Player
 * tempo is the song's tempo times the task's percentage.
 * Run with `npx vitest run src/content/teachers/dev/dev-improvising.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { identifyFretted, midiAt, pitchClassAt, positionsForNote, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, diatonicChords, intervalBetween, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse, type FretboardFigure, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, {
  ARPEGGIO_TUNE_BAR_13, C_ARPEGGIO_UP_DOWN, MOTIF, MOTIF_NEW_NOTES, MOTIF_NEW_RHYTHM, MOTIF_UP_THE_NECK, MOTIF_WITH_BEND, ONE_NOTE_LINE, SOLO_ENDING, TARGET_LINE,
} from './dev-improvising';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const CODES: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };
const BEATS: Record<string, number> = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, e: 0.5, s: 0.25 };

/** Some bars of a song's lead track as tab notes (the first note of each beat). */
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

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
type Played = { string: number; fret: number; duration: string };
const played = (notes: readonly TabNote[]): Played[] => notes.filter((n): n is Played => !('rest' in n));
const nameAt = (n: Played) => PCS[pitchClassAt(n)];
const midi = (n: Played) => midiAt(n);
const at = (p: { string: number; fret: number }) => `${p.string}:${p.fret}`;
const beats = (notes: readonly TabNote[]) => notes.reduce((sum, n) => sum + BEATS[n.duration], 0);
const has = (chord: string, note: string) => chordNotes(chord).map(chroma).includes(chroma(note));

/** The note that starts each bar of 4/4, and the note just before each bar line. */
function barStarts(notes: readonly TabNote[]): { first: Played; last: Played | null }[] {
  const out: { first: Played; last: Played | null }[] = [];
  let t = 0;
  let prev: Played | null = null;
  for (const n of notes) {
    if (t % 4 === 0 && !('rest' in n)) out.push({ first: n, last: prev });
    if (!('rest' in n)) prev = n;
    t += BEATS[n.duration];
  }
  return out;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/** Every "string N, fret M" the text pairs with a note, checked on the neck. */
function noteClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  let count = 0;
  const check = (s: string, f: string, n: string, where: string) => {
    count++;
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\}, string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  if (count < 15) out.push(`only ${count} claims found: the patterns no longer match the text`);
  return out;
}

/** Every "{c:X} (shape)" in the text: the shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const found = [...text.matchAll(/\{c:([^}]+)\} \(([x0-9]{6})\)/g)];
  for (const m of found) {
    const got = identifyFretted(m[2]).symbol;
    if (got !== m[1]) out.push(`${m[0]}: the shape is ${got}`);
  }
  if (found.length < 4) out.push(`only ${found.length} shapes found`);
  return out;
}

const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((x) => x.id === id)!;
const lesson = (id: string) => unit.lessons.find((l) => l.id === id)!;

function jamProblems(chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const step of tasks) {
    if (step.tool !== 'progressions') continue;
    const [id, key] = step.params!;
    const p = getProgression(id);
    if (!p) {
      out.push(`${step.id}: no progression ${id}`);
      continue;
    }
    const tonic = key.toUpperCase();
    if (!p.keys.includes(tonic)) out.push(`${step.id}: ${id} is not offered in ${tonic}`);
    const chords = [...new Set(progressionInKey(p, tonic).bars.flat().map((c) => c.symbol))];
    if (JSON.stringify(chords) !== JSON.stringify(chordsNamed[step.id])) out.push(`${step.id}: ${id} in ${tonic} plays ${chords.join(' ')}`);
    for (const c of chordsNamed[step.id] ?? []) if (/\{c:/.test(plain(step.body)) && !plain(step.body).includes(`{c:${c}}`) && !/7/.test(c)) out.push(`${step.id}: the words do not name ${c}`);
    const bpm = Number(plain(step.body).match(/(\d+) BPM/)?.[1]);
    const range = BACKING_STYLES[p.feel.backing].tempo;
    if (!(bpm >= Math.max(30, Math.min(range.min, 50)) && bpm <= range.max + 20)) out.push(`${step.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays`);
  }
  return out;
}

/** "N % (M BPM)" and "M BPM" in a Player task's words (and its fallback's), against the song's tempo. */
async function playerBpmProblems(): Promise<string[]> {
  const out: string[] = [];
  const targets = tasks.flatMap((s) => [{ where: s.id, params: s.params ?? [], tool: s.tool, body: s.body }, ...(s.fallback ? [{ where: `${s.id} (fallback)`, params: s.fallback.params ?? [], tool: s.fallback.tool, body: s.fallback.body }] : [])]);
  for (const t of targets) {
    if (t.tool !== 'player') continue;
    const id = taskSong({ tool: 'player', params: t.params });
    if (!id || !songEntry(id)) continue;
    const bpm = (await song(id)).tempo[0].bpm;
    const pct = Number((t.params.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
    const text = plain(t.body);
    const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
    for (const m of percents) if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${t.where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    if (t.params.includes('wait')) continue;
    const plainBpm = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '').match(/(\d+) BPM/);
    if (!percents.some((m) => Number(m[1]) === pct)) {
      if (!plainBpm) out.push(`${t.where}: never says the tempo it opens at`);
      else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${t.where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
    }
  }
  return out;
}

const course = compileCourse(courseMeta('dev'), [unit]);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Dev unit 11: improvising with intent', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(120);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(300);
    }
  });

  it('pairs every fret in the text with the note that is there, and every shape with its chord', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
    expect(shapeClaimProblems(unit)).toEqual([]);
  });

  it('spells the arpeggios of C major as the chords and the study have them', async () => {
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
    expect(chordNotes('Dm')).toEqual(['D', 'F', 'A']);
    expect(chordNotes('Em')).toEqual(['E', 'G', 'B']);
    expect(chordNotes('F')).toEqual(['F', 'A', 'C']);
    expect(chordNotes('G')).toEqual(['G', 'B', 'D']);
    expect(chordNotes('Am')).toEqual(['A', 'C', 'E']);
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
    // The study: C from string 5, fret 3; Em from string 4, fret 2 over the open strings; F the small F.
    const bar = async (n: number) => (await leadBars('st-arpeggio-triads', n, n)).slice(0, 4).map((x) => at(x as Played));
    expect(await bar(1)).toEqual(['5:3', '4:2', '3:0', '2:1']);
    expect(await bar(5)).toEqual(['4:2', '3:0', '2:0', '1:0']);
    expect(await bar(7)).toEqual(['4:3', '3:2', '2:1', '1:1']);
    // The figures' degree claims, and the arpeggio played up and down.
    expect(played(C_ARPEGGIO_UP_DOWN).map(nameAt).join(' ')).toBe('C E G C G E C');
    expect(beats(C_ARPEGGIO_UP_DOWN)).toBe(8);
    // Bar 13 is the library's, F then G; the tops of the groups in bars 13 to 16 sing C D, E C, D B, C.
    expect(ARPEGGIO_TUNE_BAR_13).toEqual(await leadBars('st-arpeggio-triads', 13, 13));
    const tune = played(await leadBars('st-arpeggio-triads', 13, 16));
    const tops: string[] = [];
    for (let i = 0; i < 28; i += 4) tops.push(PCS[Math.max(...tune.slice(i, i + 4).map(midi)) % 12]);
    expect(tops.join(' ')).toBe('C D E C D B C');
    // Every note of F from the nut to fret 3: seven of them.
    expect(['F', 'A', 'C'].flatMap((n) => positionsForNote(n, { minFret: 0, maxFret: 3 })).map(at).sort()).toEqual(['1:1', '2:1', '3:2', '4:3', '5:0', '5:3', '6:1'].sort());
    expect((await song('st-arpeggio-triads')).tempo[0].bpm).toBe(88);
  });

  it('finds the chord tones of C, Am, F and G in the E-shape position of C major, as many as the text says', () => {
    const shape = scalePatterns('C', 'major').find((p) => p.id === 'caged-e')!;
    expect([shape.minFret, shape.maxFret]).toEqual([7, 10]);
    const tones = (chord: string) => chordNotes(chord).flatMap((n) => positionsForNote(n, { minFret: 7, maxFret: 10 })).map(at).sort();
    expect(tones('C').length).toBe(7);
    expect(tones('Am').length).toBe(7);
    expect(tones('F').length).toBe(7);
    expect(tones('G').length).toBe(8);
    expect(positionsForNote('F', { minFret: 7, maxFret: 10 }).map(at).sort()).toEqual(['3:10', '5:8']);
    // G shares nothing with F; Am shares C and E with C.
    expect(chordNotes('G').filter((n) => chordNotes('F').includes(n))).toEqual([]);
    expect(chordNotes('Am').filter((n) => chordNotes('C').includes(n))).toEqual(['C', 'E']);
    // The one-note line: C is in C, Am and F, and B is the third of G, a fret below.
    const [c1, c2, c3, b] = played(ONE_NOTE_LINE);
    expect([c1, c2, c3].map(at)).toEqual(['1:8', '1:8', '1:8']);
    expect([has('C', 'C'), has('Am', 'C'), has('F', 'C'), has('G', 'C')]).toEqual([true, true, true, false]);
    expect(nameAt(b)).toBe('B');
    expect(chordNotes('G')[1]).toBe('B');
    expect(midi(c3) - midi(b)).toBe(1);
  });

  it('puts the thirds where the text says, and Dev\'s target line lands on each one at the change', () => {
    const thirds = ['C', 'Am', 'F', 'G'].map((c) => chordNotes(c)[1]);
    expect(thirds).toEqual(['E', 'C', 'A', 'B']);
    const all = thirds.flatMap((n) => positionsForNote(n, { minFret: 7, maxFret: 10 })).map(at).sort();
    const fig = (lesson('target-notes').steps[0] as { figure: FretboardFigure }).figure;
    expect(fig.dots!.map(at).sort()).toEqual(all);
    expect(positionsForNote('A', { minFret: 7, maxFret: 10 }).map(at).sort()).toEqual(['2:10', '4:7']);
    expect(positionsForNote('B', { minFret: 7, maxFret: 10 }).map(at).sort()).toEqual(['1:7', '4:9', '6:7']);
    // Bar by bar: the third of the chord on beat 1, the note before each change a step from it.
    const bars = barStarts(TARGET_LINE);
    expect(bars.map((b) => nameAt(b.first))).toEqual(thirds);
    expect(beats(TARGET_LINE)).toBe(16);
    for (const b of bars.slice(1)) expect([1, 2], `${at(b.last!)} to ${at(b.first)}`).toContain(Math.abs(midi(b.first) - midi(b.last!)));
    expect(played(TARGET_LINE).every((n) => scaleNotes('C', 'major').includes(nameAt(n)))).toBe(true);
    // The third of G over its root on string 2, fret 8: a major third; the third of Am is a minor third.
    expect(intervalBetween('G', 'B')).toBe('M3');
    expect(midiAt({ string: 1, fret: 7 }) - midiAt({ string: 2, fret: 8 })).toBe(4);
    expect(intervalBetween('A', 'C')).toBe('m3');
  });

  it('varies the motif exactly as each question says', () => {
    const notes = (n: readonly TabNote[]) => played(n).map(nameAt);
    const rhythm = (n: readonly TabNote[]) => n.map((x) => ('rest' in x ? `${x.duration}r` : x.duration)).join(' ');
    const box1 = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true }).find((p) => p.id === 'box-1')!;
    const pent = scaleNotes('A', 'minor-pentatonic');
    expect(notes(MOTIF)).toEqual(['A', 'C', 'E', 'D']);
    expect(played(MOTIF).every((n) => box1.notes.some((b) => b.string === n.string && b.fret === n.fret))).toBe(true);
    for (const m of [MOTIF, MOTIF_NEW_NOTES, MOTIF_NEW_RHYTHM, MOTIF_UP_THE_NECK, MOTIF_WITH_BEND]) {
      expect(beats(m)).toBe(8);
      expect(played(m).every((n) => pent.includes(nameAt(n)))).toBe(true);
      expect(m[m.length - 1]).toMatchObject({ rest: true });
    }
    // The shape: up, up, then down a step (a whole step, two half steps).
    const moves = (m: readonly TabNote[]) => played(m).slice(1).map((n, i) => midi(n) - midi(played(m)[i]));
    const contour = (m: readonly TabNote[]) => moves(m).map((d) => Math.sign(d));
    expect(contour(MOTIF)).toEqual([1, 1, -1]);
    expect(moves(MOTIF)[2]).toBe(-2);
    // 1: same rhythm, same shape, new notes (C E A G), ending a step below where it turned.
    expect(rhythm(MOTIF_NEW_NOTES)).toBe(rhythm(MOTIF));
    expect(notes(MOTIF_NEW_NOTES)).toEqual(['C', 'E', 'A', 'G']);
    expect(contour(MOTIF_NEW_NOTES)).toEqual(contour(MOTIF));
    expect(moves(MOTIF_NEW_NOTES)[2]).toBe(-2);
    // 2: same notes, new rhythm (a dotted quarter first).
    expect(played(MOTIF_NEW_RHYTHM).map(at)).toEqual(played(MOTIF).map(at));
    expect(rhythm(MOTIF_NEW_RHYTHM)).not.toBe(rhythm(MOTIF));
    expect(MOTIF_NEW_RHYTHM.map((n) => n.duration).slice(0, 2)).toEqual(['q.', 'e']);
    // 3: the same notes and rhythm an octave higher, in box 4.
    expect(rhythm(MOTIF_UP_THE_NECK)).toBe(rhythm(MOTIF));
    expect(played(MOTIF_UP_THE_NECK).map(midi)).toEqual(played(MOTIF).map((n) => midi(n) + 12));
    expect(played(MOTIF_UP_THE_NECK).map((n) => n.fret)).toEqual([14, 13, 12, 15]);
    const box4 = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true }).find((p) => p.id === 'box-4')!;
    expect(played(MOTIF_UP_THE_NECK).every((n) => box4.notes.some((b) => b.string === n.string && b.fret === n.fret))).toBe(true);
    // 4: the motif, then G at string 2, fret 8, whose whole-step bend reaches A.
    expect(played(MOTIF_WITH_BEND).slice(0, 4).map(at)).toEqual(played(MOTIF).map(at));
    const extra = played(MOTIF_WITH_BEND)[4];
    expect([at(extra), nameAt(extra), PCS[(pitchClassAt(extra) + 2) % 12]]).toEqual(['2:8', 'G', 'A']);
    // Readable tab: two quick notes in a row (under a beat apart) never share a string.
    for (const m of [MOTIF, MOTIF_NEW_NOTES, MOTIF_NEW_RHYTHM, MOTIF_UP_THE_NECK, MOTIF_WITH_BEND, SOLO_ENDING, TARGET_LINE, ARPEGGIO_TUNE_BAR_13]) {
      let tick = 0;
      let prev: { n: Played; at: number } | null = null;
      for (const n of m) {
        if (!('rest' in n)) {
          if (prev && prev.n.string === n.string && tick - prev.at < 1 && m !== ARPEGGIO_TUNE_BAR_13) throw new Error(`${at(prev.n)} and ${at(n)} are only ${tick - prev.at} beat apart on one string`);
          prev = { n, at: tick };
        }
        tick += BEATS[n.duration];
      }
    }
    // The tap-rhythm is the motif's rhythm with its bar of space.
    const tap = lesson('motifs-and-space').steps.find((s) => (s as { type?: string }).type === 'tap-rhythm') as { rhythm: { pattern: string } };
    expect(tap.rhythm.pattern).toBe('e e q h | wr');
  });

  it('spells the modes, their colour notes and vamps as the theory engine does', async () => {
    expect(scaleNotes('A', 'dorian')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(scaleNotes('A', 'mixolydian')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G']);
    const differ = (a: string[], b: string[]) => a.filter((n) => !b.includes(n));
    expect(differ(scaleNotes('A', 'dorian'), scaleNotes('A', 'minor'))).toEqual(['F#']);
    expect(differ(scaleNotes('A', 'mixolydian'), scaleNotes('A', 'major'))).toEqual(['G']);
    expect(differ(scaleNotes('E', 'dorian'), scaleNotes('E', 'minor'))).toEqual(['C#']);
    // The wrong options: G# gives harmonic minor, Bb gives Phrygian.
    expect(scaleNotes('A', 'harmonic-minor')).toContain('G#');
    expect(scaleNotes('A', 'phrygian')).toContain('Bb');
    // The vamps: D carries F#, G is built on the flat seventh; every chord is in its mode.
    expect(chordNotes('D')).toContain('F#');
    expect(identifyFretted('xx0232').notes.find((n) => n.note === 'F#')).toMatchObject({ string: 1, fret: 2 });
    for (const c of ['Am', 'D']) expect(chordNotes(c).every((n) => scaleNotes('A', 'dorian').includes(n)), c).toBe(true);
    for (const c of ['A', 'G']) expect(chordNotes(c).every((n) => scaleNotes('A', 'mixolydian').includes(n)), c).toBe(true);
    // Fifth position, frets 4 to 8: both F#s, and the figures mark the colour notes.
    expect(positionsForNote('F#', { minFret: 4, maxFret: 8 }).map(at).sort()).toEqual(['2:7', '4:4']);
    const figs = lesson('dorian-and-mixolydian').steps.filter((s) => (s as { type?: string }).type === 'card').map((s) => (s as { figure: FretboardFigure }).figure);
    expect(figs[0].dots!.filter((d) => d.role === 'target').map((d) => d.note!.replace(/\d/, ''))).toEqual(expect.arrayContaining(['F#']));
    expect(new Set(figs[0].dots!.filter((d) => d.role === 'target').map((d) => d.note!.replace(/\d/, '')))).toEqual(new Set(['F#']));
    expect(new Set(figs[1].dots!.filter((d) => d.role === 'target').map((d) => d.note!.replace(/\d/, '')))).toEqual(new Set(['G']));
    // The studies: Dorian over Am and D in fifth position, its F#s on string 2, fret 7; Mixolydian ends G to A.
    const dorian = await song('st-mode-dorian');
    expect(dorian.tempo[0].bpm).toBe(96);
    const dorianNotes = dorian.tracks.find((t) => t.role === 'lead')!.measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(dorianNotes.filter((n) => PCS[pitchClassAt(n)] === 'F#').every((n) => at(n) === '2:7' || at(n) === '1:2' || at(n) === '4:4')).toBe(true);
    expect(dorianNotes.some((n) => at(n) === '2:7')).toBe(true);
    const mixo = await song('st-mode-mixolydian');
    expect(mixo.tempo[0].bpm).toBe(104);
    const mixoBars = mixo.tracks.find((t) => t.role === 'lead')!.measures;
    expect(PCS[pitchClassAt(mixoBars[15].beats[0].notes[0])]).toBe('A');
    // Drunken Sailor, the Red Haired Boy fallback: its Tune track has the C# of E Dorian.
    const sailor = await song('drunken-sailor');
    const tune = sailor.tracks.find((t) => t.name === 'Tune')!;
    expect(tune.measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).some((n) => PCS[pitchClassAt(n)] === 'C#')).toBe(true);
    expect(task('red-haired-boy').fallback!.params).toEqual(['drunken-sailor', 'wait']);
  });

  it('plans the solo on a map of the five boxes, and ends it on A in box 1', () => {
    const boxes = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    const range = (id: string) => {
      const b = boxes.find((p) => p.id === id)!;
      return [b.minFret, b.maxFret];
    };
    expect(range('box-1')).toEqual([5, 8]);
    expect(range('box-2')).toEqual([7, 10]);
    expect(range('box-3')).toEqual([9, 13]);
    expect(range('box-4')[0]).toBe(12);
    const box5 = scalePatterns('A', 'minor-pentatonic').find((p) => p.id === 'box-5')!;
    expect([box5.minFret, box5.maxFret]).toEqual([2, 5]);
    // The ending: down A minor pentatonic box 1 to the A at string 4, fret 7, held two beats.
    expect(played(SOLO_ENDING).map(nameAt).join(' ')).toBe('C A G E D C A');
    expect(played(SOLO_ENDING).every((n) => n.fret >= 5 && n.fret <= 8)).toBe(true);
    const last = played(SOLO_ENDING).pop()!;
    expect([at(last), last.duration]).toEqual(['4:7', 'h']);
    expect(beats(SOLO_ENDING)).toBe(8);
    // "Six of the seven notes is a pass": the show's pass mark is 0.8.
    const show = lesson('solo-with-a-story').steps.find((s) => (s as { id?: string }).id === 'show') as { pass: number; notes: TabNote[] };
    expect(show.notes.length).toBe(7);
    expect([Math.ceil(show.pass * 7 - 1e-9), 5 / 7 < show.pass, 6 / 7 >= show.pass]).toEqual([6, true, true]);
    // Every A between fret 2 and fret 14 is a possible last note.
    expect(positionsForNote('A', { minFret: 2, maxFret: 14 }).length).toBe(7);
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    const fifties = ['C', 'Am', 'F', 'G'];
    expect(
      jamProblems({
        'arpeggio-jam': fifties,
        'one-note-a-bar': fifties,
        'eighths-between': fifties,
        'thirds-only': fifties,
        'land-on-thirds': fifties,
        'motif-jam': ['Am', 'F', 'G'],
        'motif-record': ['Am', 'F', 'G'],
        'mixolydian-jam': ['A', 'G'],
        'story-jam': ['A7', 'D7', 'E7'],
      }),
    ).toEqual([]);
    // The quick-change 12-bar: I7 IV7 I7 I7 | IV7 IV7 I7 I7 | V7 IV7 I7 V7, so bar 9 (the peak) is E7.
    const blues = progressionInKey(getProgression('blues-quick-change')!, 'A').bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(blues).toEqual(['A7', 'D7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7']);
  });

  it('opens the licks and studies the milestone uses, at the tempos it names', async () => {
    expect((await song('st-lick-bend')).tempo[0].bpm).toBe(72);
    expect((await song('st-lick-vibrato')).tempo[0].bpm).toBe(60);
    const connect = await song('st-pent-connect');
    expect(connect.tempo[0].bpm).toBe(88);
    // Bars 1 to 8 climb from box 5 (frets 2 to 5) to box 4 (frets 12 to 15).
    const climb = played(await leadBars('st-pent-connect', 1, 8));
    expect(Math.min(...climb.map((n) => n.fret))).toBe(2);
    expect(Math.max(...climb.map((n) => n.fret))).toBe(15);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems()).toEqual([]);
  });
});

// ── review fixes (batch 8 review): each guards a problem found and fixed ───────────────────────

describe('Dev unit 11, review checks', () => {
  type Step = { type?: string; id?: string; title?: string; body?: RichText; tip?: RichText; prompt?: string; figure?: { kind: string; labels?: string }; notes?: TabNote[]; options?: Array<{ text: string; correct?: boolean; why?: string }>; alternative?: { prompt?: string } };
  const steps = (id: string) => lesson(id).steps as unknown as Step[];

  it('asks for the C on every beat 1 as separate notes, because a held note is heard once', () => {
    const phrase = steps('chord-tones-on-the-beat').find((s) => s.type === 'play-phrase')!;
    // Three separate Cs, then B: the microphone counts attacks, so a C held for three bars would be one note of four.
    expect(played(phrase.notes!).map(at)).toEqual(['1:8', '1:8', '1:8', '1:7']);
    expect(phrase.prompt).not.toMatch(/\bhold\b/i);
    expect(phrase.prompt).toMatch(/pick \{n:C\}.*on beat 1/);
    expect(phrase.alternative!.prompt).not.toMatch(/\bhold\b/i);
  });

  it('asks for the third of F without printing the degrees on the figure', () => {
    const q = steps('arpeggios').find((s) => s.type === 'choice' && /third/.test(s.prompt ?? ''))!;
    expect(q.figure!.labels).not.toBe('degree');
    expect(chordNotes('F')[1]).toBe('A');
    expect(q.options!.find((o) => o.correct)!.text).toContain('{n:A}');
  });

  it('teaches the word mode before the lesson uses it', () => {
    // The words the learner reads on a step (ids, song ids and fact ids are not words on screen).
    const TEXT_KEYS = new Set(['title', 'body', 'tip', 'prompt', 'text', 'why', 'explain', 'statement', 'caption']);
    const words = (x: unknown): string[] =>
      x && typeof x === 'object' ? Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => (TEXT_KEYS.has(k) && typeof v === 'string' ? [v] : words(v))) : [];
    const l = steps('dorian-and-mixolydian');
    const first = l.findIndex((s) => words(s).some((w) => /\bmodes?\b/i.test(w.replace(/\{t:mode\|modes\}/g, 'modes'))));
    expect(first).toBe(0);
    expect(plain(l[0].body!)).toContain('{t:mode|modes}');
    // Nothing earlier in the course's unit says it either.
    for (const id of ['arpeggios', 'chord-tones-on-the-beat', 'target-notes', 'motifs-and-space']) expect(words(lesson(id)).some((w) => /\bmodes?\b/i.test(w)), id).toBe(false);
  });

  it('does not call Phrygian the darkest mode (Locrian is darker, as the rest of the app orders them)', () => {
    expect(JSON.stringify(unit)).not.toMatch(/darkest/);
    // Phrygian lowers four degrees of the major scale, Locrian five: Locrian is the darker one.
    const lowered = (mode: string) => scaleNotes('C', mode).filter((n) => n.includes('b')).length;
    expect([lowered('phrygian'), lowered('locrian')]).toEqual([4, 5]);
  });

  it('calls the six arpeggios the major and minor chords of C major, since the key also has Bdim', () => {
    const triads = diatonicChords('C major').map((c) => c.symbol);
    expect(triads).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    const text = JSON.stringify(lesson('arpeggios'));
    expect(text).not.toMatch(/every chord of \{k:C major\}/);
    expect(text).toContain('the six major and minor chords of {k:C major}');
  });

  it('gives health advice where the milestone asks for bends', () => {
    const t = task('peak-bends');
    expect(plain(t.tip!)).toMatch(/pain/);
    expect(plain(t.tip!)).toMatch(/stop/);
  });

  it('celebrates only what the microphone heard: the planned ending landing on A', () => {
    expect(unit.milestone!.celebrate).not.toMatch(/played it/);
    expect(played(SOLO_ENDING).map(nameAt).pop()).toBe('A');
  });
});
