/**
 * Cross-checks for Dev's unit 9 (The major scale, everywhere) against the engines and the song
 * library: every "string N, fret M" the text pairs with a note is that note; the G major run is the
 * guitar engine's first position and the technique exercise's notes; the five CAGED positions,
 * their frets and roots are the engine's; the melody bars are the library study's in the C and E
 * shapes; the sequences are the engine's order of the E-shape position; the double stops are
 * thirds of G major; the fiddle tunes and jigs match the repertoire plan and the library; every
 * tool address opens what the text says; every Player tempo is the song's tempo (or the plan's,
 * for songs still missing) times the task's percentage, in dotted quarters for 6/8.
 * Run with `npx vitest run src/content/teachers/dev/dev-major-scale.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import repertoire from '@/content/plan/repertoire.json';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, partSong } from '@/content/technique';
import { BACKING_STYLES } from '@/core/audio';
import { identifyFretted, midiAt, pitchClassAt, positionsForNote, rootToRoot, scalePatterns, SEQUENCES } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chroma, degreeInScale, intervalBetween, parseTimeSignature, pcName, scaleContains } from '@/core/theory';
import { focusFromParams } from '@/features/arcade/core/focus';
import { isGameId } from '@/features/arcade/core/games';
import { DRILLS } from '@/features/fretboard/core/drills';
import { readLevel } from '@/features/rhythm/core/generate';
import { parseScaleParams } from '@/features/scales/model/address';
import { estimateLessonSeconds, formatProblems, rhythmOnsetTimes, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { CROSSING_A, G_MAJOR_UP, MELODY_C_SHAPE, MELODY_E_SHAPE, THIRDS_E_SHAPE, THIRDS_G_STRINGS_3_2, THREES_E_SHAPE, WASHERWOMAN_START } from './dev-major-scale';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const TICKS: Record<string, number> = { w: 3840, 'h.': 2880, h: 1920, 'q.': 1440, q: 960, 'e.': 720, e: 480, s: 240 };
const pos = (n: TabNote) => ('rest' in n ? null : `${n.string}:${n.fret}`);
const posOf = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;
const nameAt = (p: { string: number; fret: number }) => pcName(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][pitchClassAt(p)]);
const tabName = (n: TabNote) => ('rest' in n ? '-' : nameAt(n));

/** Every note of a bar (1-based, as the Player counts), in playing order, as "string:fret". */
async function barNotes(id: string, n: number, track = 0): Promise<string[]> {
  return (await song(id)).tracks[track].measures[n - 1].beats.flatMap((b) => b.notes.map(posOf));
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

function noteClaims(u: TeacherUnit): { problems: string[]; checked: number } {
  const text = JSON.stringify(u);
  const problems: string[] = [];
  let checked = 0;
  const check = (s: string, f: string, n: string, where: string) => {
    checked++;
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) problems.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} (?:is |sits )?at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/the open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  return { problems, checked };
}

interface RepertoireEntry { id: string; tempo?: number; key?: string; meter?: string; notes?: string }
const PLANNED = (repertoire as { pieces: RepertoireEntry[] }).pieces;
const planned = (id: string) => PLANNED.find((p) => p.id === id)!;

async function beatBpm(id: string): Promise<{ bpm: number; source: string } | null> {
  if (songEntry(id)) {
    const s = await song(id);
    const time = s.bars[s.bars.length - 1].time;
    return { bpm: s.tempo[0].bpm / (time.numerator === 6 && time.denominator === 8 ? 1.5 : 1), source: 'library' };
  }
  const p = PLANNED.find((x) => x.id === id);
  return p?.tempo ? { bpm: p.tempo, source: 'repertoire plan' } : null;
}

async function playerBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const targets: Array<{ params?: string[]; body: RichText; where: string }> = [];
      if (taskSong(step)) targets.push({ params: step.params, body: step.body, where: `${lesson.id} > ${step.id}` });
      if (step.fallback?.tool === 'player') targets.push({ params: step.fallback.params, body: step.fallback.body, where: `${lesson.id} > ${step.id} (fallback)` });
      for (const t of targets) {
        const id = t.params![0];
        const beat = await beatBpm(id);
        if (!beat) {
          out.push(`${t.where}: no tempo known for ${id}`);
          continue;
        }
        const pct = Number((t.params!.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
        const claims = [...plain(t.body).matchAll(/(\d+) % \((?:about )?(\d+) BPM/g)];
        for (const m of claims) {
          const expected = (beat.bpm * Number(m[1])) / 100;
          if (Math.abs(expected - Number(m[2])) > 1) out.push(`${t.where}: "${m[0]}", but ${m[1]} % of ${beat.bpm} (${beat.source}) is ${expected.toFixed(1)}`);
        }
        if (!t.params!.includes('wait') && !claims.some((m) => Number(m[1]) === pct)) out.push(`${t.where}: never says the tempo it opens at (${pct} %)`);
      }
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((t) => t.id === id)!;
const cMajor = scalePatterns('C', 'major');
const shapeOf = (name: string) => cMajor.find((p) => p.name === name)!;

describe('Dev unit 9: the major scale, everywhere', () => {
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

  it('pairs every fret in the text with the note that is there', () => {
    const { problems, checked } = noteClaims(unit);
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(15);
    const text = JSON.stringify(unit);
    for (const m of text.matchAll(/\{c:([^}]+)\} \(([x0-9-]{6,})\)/g)) expect(identifyFretted(m[2]).symbol, m[0]).toBe(m[1]);
  });

  it('runs G major in first position as the engine and the technique exercise have it', () => {
    const first = scalePatterns('G', 'major').find((p) => p.minFret === 0)!;
    expect(first.positionName).toBe('Open position');
    const fromLowG = first.notes.slice(first.notes.findIndex((n) => n.string === 6 && n.fret === 3));
    expect(G_MAJOR_UP.map(pos)).toEqual(fromLowG.map(posOf));
    expect(G_MAJOR_UP.length).toBe(15);
    expect(G_MAJOR_UP.reduce((t, n) => t + TICKS[n.duration], 0)).toBe(2 * 3840);
    expect([midiAt({ string: 6, fret: 3 }), midiAt({ string: 3, fret: 0 }), midiAt({ string: 1, fret: 3 })]).toEqual([43, 55, 67]);
    expect(positionsForNote('G', { maxFret: 4 }).map(posOf).sort()).toEqual(['1:3', '3:0', '6:3']);
    expect(positionsForNote('F#', { maxFret: 4 }).filter((p) => p.string <= 4).map(posOf).sort()).toEqual(['1:2', '4:4']);
    // One finger per fret in first position.
    expect(fromLowG.every((n) => n.fret === 0 ? n.finger === 0 : n.finger === n.fret)).toBe(true);
    // The technique exercise plays the same run.
    const e = getExercise('tech-alternate-scale-g')!;
    expect(e.tempo.start).toBe(60);
    const ex = partSong(e, e.parts[0], 60);
    const exNotes = ex.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map(posOf)));
    expect(exNotes.slice(0, 15)).toEqual(G_MAJOR_UP.map(pos));
    // Degrees: B is 3, F# is 7.
    expect(degreeInScale('G', 'major', 'B')).toBe('3');
    expect(degreeInScale('G', 'major', 'F#')).toBe('7');
    expect(['G', 'A', 'B', 'C', 'D', 'E', 'F#'].map((n) => degreeInScale('G', 'major', n))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('lays C major out in the five positions the text names, with their roots', async () => {
    expect(cMajor.map((p) => `${p.name} ${p.minFret}-${p.maxFret}`)).toEqual(['C shape 0-3', 'A shape 2-6', 'G shape 4-8', 'E shape 7-10', 'D shape 9-13']);
    expect(shapeOf('E shape').roots.map(posOf)).toEqual(['6:8', '4:10', '1:8']);
    expect(shapeOf('A shape').roots.map(posOf)).toEqual(['5:3', '3:5']);
    expect(shapeOf('D shape').roots.map(posOf)).toEqual(['4:10', '2:13']);
    expect(identifyFretted('x-x-10-12-13-12').symbol).toBe('C');
    // The derived figures (every C major note in the frets) are exactly the C-shape and E-shape positions.
    const inFrets = (lo: number, hi: number) => positionsForNote('C', { minFret: lo, maxFret: hi }).length;
    expect(inFrets(7, 10)).toBe(3);
    expect(inFrets(2, 6)).toBe(2);
    for (const name of ['C shape', 'E shape']) {
      const p = shapeOf(name);
      const all: string[] = [];
      for (let s = 1; s <= 6; s++) for (let f = p.minFret; f <= p.maxFret; f++) if (scaleContains('C', 'major', midiAt({ string: s, fret: f }))) all.push(`${s}:${f}`);
      expect(all.sort(), name).toEqual(p.notes.map(posOf).sort());
    }
    // A and G overlap at frets 4 to 6; each position starts a fret or two below where the last ends.
    expect([Math.max(2, 4), Math.min(6, 8)]).toEqual([shapeOf('G shape').minFret, shapeOf('A shape').maxFret]);
    for (let i = 1; i < cMajor.length; i++) expect(cMajor[i - 1].maxFret - cMajor[i].minFret, cMajor[i].name).toBeGreaterThanOrEqual(1);
    // The A-shape question: string 3, fret 4 is B, the 7 of C.
    expect(degreeInScale('C', 'major', nameAt({ string: 3, fret: 4 }))).toBe('7');
    // The study: six bars per position, in this order.
    const s = await song('st-caged-scale');
    expect(s.sections.map((x) => [x.name, x.start + 1, x.end])).toEqual([['C shape', 1, 6], ['A shape', 7, 12], ['G shape', 13, 18], ['E shape', 19, 24], ['D shape', 25, 30]]);
    // The tool addresses.
    expect(parseScaleParams(task('caged-scales').params!)).toEqual({ tonic: 'C', scale: 'major', shape: 'caged-a' });
    const [game, slug, shape] = task('caged-arcade').params!;
    expect(isGameId(game)).toBe(true);
    expect(focusFromParams(slug, shape)).toEqual({ tonic: 'C', scale: 'major', shape: 'caged-e' });
  });

  it('quotes one melody in two positions at the same pitch, as the study plays it', async () => {
    expect(MELODY_C_SHAPE.map(pos)).toEqual(await barNotes('st-caged-melody', 1));
    expect(MELODY_E_SHAPE.map(pos)).toEqual(await barNotes('st-caged-melody', 25));
    const midi = (n: TabNote) => ('rest' in n ? 0 : midiAt(n));
    expect(MELODY_E_SHAPE.map(midi)).toEqual(MELODY_C_SHAPE.map(midi));
    expect(MELODY_C_SHAPE.map(tabName)).toEqual(['E', 'G', 'E', 'D', 'C']);
    // The G shape plays D at string 3, fret 7: the same D as string 2, fret 3.
    expect(await barNotes('st-caged-melody', 17)).toContain('3:7');
    expect(midiAt({ string: 3, fret: 7 })).toBe(midiAt({ string: 2, fret: 3 }));
    const s = await song('st-caged-melody');
    expect(s.sections.map((x) => [x.name, x.start + 1, x.end])).toEqual([['C shape', 1, 8], ['A shape', 9, 16], ['G shape', 17, 24], ['E shape', 25, 32], ['D shape', 33, 40]]);
    // The tune stays between G3 and G4 in every position.
    const all = s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
    expect([Math.min(...all), Math.max(...all)]).toEqual([55, 67]);
    // The chords under it: the five C shapes.
    expect(['x32010', 'x35553', '875558', '8-10-10-9-8-8', 'x-x-10-12-13-12'].map((f) => identifyFretted(f).symbol)).toEqual(['C', 'C', 'C', 'C', 'C']);
    expect(DRILLS.map((d) => d.id)).toContain(task('name-the-notes').params![1]);
  });

  it('builds the sequences from the E-shape position in the engine\'s scale order', () => {
    const run = rootToRoot(shapeOf('E shape'), { octaves: 1 });
    expect(run.map((n) => n.note)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
    const thirds = [0, 1, 2, 3].flatMap((i) => [run[i], run[i + 2]]).map(posOf);
    expect(THIRDS_E_SHAPE.map(pos)).toEqual(thirds);
    const threes = [0, 1, 2, 3].flatMap((i) => [run[i], run[i + 1], run[i + 2]]).map(posOf);
    expect(THREES_E_SHAPE.map(pos)).toEqual(threes);
    expect(THIRDS_E_SHAPE.map(tabName)).toEqual(['C', 'E', 'D', 'F', 'E', 'G', 'F', 'A']);
    expect(SEQUENCES.filter((x) => ['thirds', 'groups-3', 'groups-4'].includes(x.id)).map((x) => x.name)).toEqual(['Groups of three', 'Groups of four', 'In thirds']);
    expect(parseScaleParams(task('scales-thirds').params!)).toEqual({ tonic: 'C', scale: 'major', shape: 'caged-e' });
    // Double stops: thirds of G major on strings 3 and 2.
    for (const [lo, hi] of THIRDS_G_STRINGS_3_2) {
      expect(['m3', 'M3'], `${posOf(lo)} ${posOf(hi)}`).toContain(intervalBetween(nameAt(lo), nameAt(hi)));
      expect(scaleContains('G', 'major', midiAt(lo)) && scaleContains('G', 'major', midiAt(hi))).toBe(true);
    }
    expect(intervalBetween('A', 'C')).toBe('m3');
    expect(getExercise('tech-double-stops')!.tempo.start).toBe(60);
  });

  it('teaches the fiddle tunes and the jig as the plan and the library have them', async () => {
    expect(planned('soldiers-joy')).toMatchObject({ key: 'D major', meter: '2/4' });
    expect(planned('turkey-in-the-straw')).toMatchObject({ key: 'G major', meter: '2/4' });
    for (const id of ['soldiers-joy', 'turkey-in-the-straw']) expect(planned(id).notes, id).toMatch(/AABB, 8 bars per part/);
    expect(planned('soldiers-joy').notes).toMatch(/D \(xx0232\), A \(x02220\), G \(320003\)/);
    expect(planned('turkey-in-the-straw').notes).toMatch(/G \(320003\), C \(x32010\), D \(xx0232\)/);
    expect(planned('haste-to-the-wedding')).toMatchObject({ key: 'D major', meter: '6/8' });
    expect(CROSSING_A.map(tabName)).toEqual(Array(4).fill(['C', 'E']).flat());
    expect(getExercise('tech-string-crossing')!.tempo.start).toBe(60);
    // The fallbacks: a 2/4 tune of continuous notes, and the G run in G with G, C and D.
    expect((await song('rondo-alla-turca')).bars[1].time).toMatchObject({ numerator: 2, denominator: 4 });
    expect(new Set((await song('st-bluegrass-g-run')).chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D']));
    // 6/8: two beats; at 90 quarters a minute each eighth is a third of a second.
    expect(parseTimeSignature('6/8')!.beats).toBe(2);
    expect(rhythmOnsetTimes({ pattern: 'e e e e e e', time: '6/8' }, 90).map((x) => Math.round(x * 3))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(readLevel(Number(task('rhythm-six-eight').params![1]))).toMatchObject({ meter: '6/8', title: 'Six-eight time' });
    // The Irish Washerwoman: pickup and bars 1 and 2, the parts' bars, and the B part's first notes.
    const pickupAnd2 = [...(await barNotes('irish-washerwoman', 1)), ...(await barNotes('irish-washerwoman', 2)), ...(await barNotes('irish-washerwoman', 3))];
    expect(WASHERWOMAN_START.map(pos)).toEqual(pickupAnd2);
    expect(WASHERWOMAN_START.slice(2, 8).map(tabName)).toEqual(['B', 'G', 'G', 'D', 'G', 'G']);
    const s = await song('irish-washerwoman');
    expect(s.sections.map((x) => [x.name, x.start + 1, x.end])).toEqual([['A', 1, 10], ['B', 11, 18]]);
    expect((await barNotes('irish-washerwoman', 11)).slice(0, 2)).toEqual(['2:8', '3:7']);
    expect([nameAt({ string: 2, fret: 8 }), nameAt({ string: 3, fret: 7 })]).toEqual(['G', 'D']);
    expect(task('washerwoman-a').params).toEqual(['irish-washerwoman', 'm1-10', 't65']);
    expect(task('washerwoman-b').params).toEqual(['irish-washerwoman', 'm11-18', 't65']);
  });

  it('jams on the chords the text names, at a tempo the band plays', () => {
    const jam = task('sequence-jam');
    const p = getProgression(jam.params![0])!;
    expect(p.keys).toContain('C');
    expect([...new Set(progressionInKey(p, 'C').bars.flat().map((c) => c.symbol))]).toEqual(['C', 'G', 'Am', 'F']);
    const bpm = Number(plain(jam.body).match(/(\d+) BPM/)![1]);
    const range = BACKING_STYLES[p.feel.backing].tempo;
    expect(bpm).toBeGreaterThanOrEqual(range.min);
    expect(bpm).toBeLessThanOrEqual(range.max);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems(unit)).toEqual([]);
    for (const t of tasks) if (taskSong(t) && !songEntry(taskSong(t)!)) expect(t.fallback, t.id).toBeTruthy();
  });
});

// ── checks added by the independent review ──────────────────────────────────────────────────────

/** Every fretboard-name note question: its prompt must not already name the answer. */
function giveawayProblems(u: TeacherUnit): string[] {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const s of l.steps) {
      const step = s as { type?: string; ask?: string; prompt?: RichText; position?: { string: number; fret: number } };
      if (step.type !== 'fretboard-name' || step.ask !== 'note' || !step.position) continue;
      const answer = pitchClassAt(step.position);
      for (const m of plain(step.prompt!).matchAll(/\{n:([A-G][#b]*)\d?\}/g)) if (chroma(m[1]) === answer) out.push(`${l.id}: "${plain(step.prompt!)}" names its own answer`);
    }
  }
  return out;
}

describe('Dev unit 9: review fixes', () => {
  it('counts strict alternation in 6/8 right: the second group starts up, the next bar down again', () => {
    const strokes = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 'D' : 'U'));
    expect(strokes.slice(0, 3).join('')).toBe('DUD');
    expect(strokes.slice(3, 6).join('')).toBe('UDU');
    expect(strokes[6]).toBe('D');
    const tf = unit.lessons.find((l) => l.id === 'jig-time')!.steps.find((s) => (s as { type?: string }).type === 'true-false') as { explain: RichText };
    expect(plain(tf.explain)).toMatch(/next bar starts on a down/);
    expect(plain(tf.explain)).not.toMatch(/[Tt]wo bars later/);
  });

  it('asks no note question whose prompt already names the answer, and the G-shape note is the tune\'s fourth', async () => {
    expect(giveawayProblems(unit)).toEqual([]);
    expect((await barNotes('st-caged-melody', 17))[3]).toBe('3:7');
    expect(nameAt({ string: 3, fret: 7 })).toBe('D');
  });

  it('says what the screens show: R for the root in Scales, quarter-note bpm in the Player', async () => {
    const text = JSON.stringify(unit);
    expect(text).not.toMatch(/the 1s/);
    let checked = 0;
    for (const t of tasks) {
      if (!taskSong(t)) continue;
      for (const m of plain(t.body).matchAll(/(\d+) % \([^)]*shows (\d+) bpm/g)) {
        const quarters = (await song(taskSong(t)!)).tempo[0].bpm;
        expect(Math.round((quarters * Number(m[1])) / 100), `${t.id}: ${m[0]}`).toBe(Number(m[2]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(1);
  });

  it('does not claim every fiddle tune is AABB', () => {
    expect(JSON.stringify(unit)).not.toMatch(/[Ee]very fiddle tune/);
  });
});
