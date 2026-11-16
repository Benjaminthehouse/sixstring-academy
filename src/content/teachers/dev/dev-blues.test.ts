/**
 * Cross-checks for Dev's unit 5 (The blues) against the engines and the song library: every
 * "string N, fret M" the text pairs with a note is that note; every chord shape is the chord it is
 * called and the sevenths and targets are where the text puts them; the chord charts, shuffles,
 * turnaround lines and the minor-blues melody are the library's studies; the blues-scale passage
 * and Dev's lick only pass through the blue note; the jam tracks play the chords the text names at
 * tempos their band plays; every Player tempo is the song's tempo times the task's percentage.
 * Run with `npx vitest run src/content/teachers/dev/dev-blues.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { allScalePatterns, identifyFretted, midiAt, pitchClassAt, positionsForNote } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, intervalBetween, pcName, scaleNotes } from '@/core/theory';
import { drillById, levelOf } from '@/features/ear/core/drills';
import { parseScaleParams } from '@/features/scales/model/address';
import { estimateLessonSeconds, findTargets, formatProblems, validateCourse, type FretboardFindExercise, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { BLUE_NOTE_PASSAGE, DEV_BLUES_LICK, MINOR_BLUES_A, MINOR_BLUES_MELODY_1_2, QUICK_CHANGE_E, TURNAROUND_A, TURNAROUND_E } from './dev-blues';

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

/** The chord in force at the start of each bar (1-based bars `from` to `to`). */
async function chordsByBar(id: string, from = 1, to?: number): Promise<string[]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const out: string[] = [];
  for (let i = from - 1; i < (to ?? s.bars.length); i++) {
    const inForce = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    out.push(inForce ? inForce.symbol : 'N.C.');
  }
  return out;
}

const pos = (n: TabNote) => ('rest' in n ? null : { string: n.string, fret: n.fret });
const nameAt = (n: TabNote) => ('rest' in n ? '-' : pcName(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][pitchClassAt(pos(n)!)]));
const beats = (notes: TabNote[]) => notes.reduce((sum, n) => sum + BEATS[n.duration], 0);

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
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\}, string (\d) fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  return out;
}

/** Every "{c:X} (shape)" in the text: the shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  for (const m of text.matchAll(/\{c:([^}]+)\} \(([x0-9]{6})\)/g)) {
    const got = identifyFretted(m[2]).symbol;
    if (got !== m[1]) out.push(`${m[0]}: the shape is ${got}`);
  }
  return out;
}

async function playerBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id) continue;
      const where = `${lesson.id} > ${step.id}`;
      if (!songEntry(id)) {
        out.push(`${where}: ${id} is not in the library`);
        continue;
      }
      const bpm = (await song(id)).tempo[0].bpm;
      const pct = Number((step.params!.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
      const text = plain(step.body);
      const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
      for (const m of percents) if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${((bpm * Number(m[1])) / 100).toFixed(1)}`);
      const plainBpm = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '').match(/(\d+) BPM/);
      if (!percents.some((m) => Number(m[1]) === pct)) {
        if (!plainBpm) out.push(`${where}: never says the tempo it opens at`);
        else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
      }
    }
  }
  return out;
}

function jamProblems(u: TeacherUnit, chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const step of u.lessons.flatMap((l) => l.steps).filter(isTaskStep) as TaskStep[]) {
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
    const bpm = Number(plain(step.body).match(/(\d+) BPM/)?.[1]);
    const range = BACKING_STYLES[p.feel.backing].tempo;
    if (!(bpm >= Math.max(30, Math.min(range.min, 50)) && bpm <= range.max + 20)) out.push(`${step.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays`);
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];

describe('Dev unit 5: the blues', () => {
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

  it('pairs every fret in the text with the note that is there, and every shape with its chord', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
    expect(shapeClaimProblems(unit)).toEqual([]);
  });

  it('charts the quick-change blues in E as the study plays it, with the shuffles the cards describe', async () => {
    expect(await chordsByBar('st-blues-shuffle-e', 1, 12)).toEqual([...QUICK_CHANGE_E]);
    const s = await song('st-blues-shuffle-e');
    expect(s.tempo[0].bpm).toBe(88);
    const part = s.tracks[0];
    const pairs = (bar: number) => [...new Set(part.measures[bar - 1].beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join('+')))];
    expect(pairs(1)).toEqual(['6:0+5:2', '6:0+5:4']);
    expect(pairs(2)).toEqual(['5:0+4:2', '5:0+4:4']);
    // The shuffle rocks between the 5th and the 6th of the chord.
    expect([intervalBetween('E', 'B'), intervalBetween('E', 'C#'), intervalBetween('A', 'E'), intervalBetween('A', 'F#')]).toEqual(['P5', 'M6', 'P5', 'M6']);
    // Swung: long-short, two thirds and one third of each beat.
    expect(part.measures[0].beats.slice(0, 2).map((b) => b.duration)).toEqual([640, 320]);
    expect(identifyFretted('x21202').symbol).toBe('B7');
    // The quick change is the IV chord in bar 2; B7 is V and pulls home.
    expect(chordNotes('B7')).toEqual(['B', 'D#', 'F#', 'A']);
  });

  it('builds the sevenths up the neck from the shapes the lesson names, with the sevenths where it says', () => {
    expect([identifyFretted('575655').symbol, identifyFretted('x57575').symbol, identifyFretted('x79797').symbol]).toEqual(['A7', 'D7', 'E7']);
    const b7 = (shape: string) => identifyFretted(shape).notes.filter((n) => n.degree === 'b7').map((n) => `${n.string}:${n.fret} ${n.note}`);
    expect(b7('575655')).toEqual(['4:5 G']);
    expect(b7('x57575')).toEqual(['3:5 C']);
    expect(b7('x79797')).toEqual(['3:7 D']);
    // E7 is D7 slid up two frets.
    expect('x79797').toBe('x57575'.replace(/\d/g, (d) => String(Number(d) + 2)));
    // A seventh chord a whole step under the root: G under A, C under D, D under E.
    expect([intervalBetween('G', 'A'), intervalBetween('C', 'D'), intervalBetween('D', 'E')]).toEqual(['M2', 'M2', 'M2']);
    // E7 vs Emaj7 vs E6, the wrong options of the last question.
    expect(chordNotes('E7')).toContain('D');
    expect(chordNotes('Emaj7')).toContain('D#');
    expect(chordNotes('E6')).toContain('C#');
    // The ear drill the task opens: three sevenths.
    expect(levelOf(drillById('chords')!, '6')!.pool).toEqual(['maj7', '7', 'm7']);
  });

  it('plays the turnarounds the cards show, b7 6 b6 5, as the study has them', async () => {
    const s = await song('st-blues-turnarounds');
    expect(s.tempo[0].bpm).toBe(80);
    const lead = s.tracks.find((t) => t.role === 'lead')!;
    const line = (bar: number, string: number) => lead.measures[bar - 1].beats.filter((b) => b.start % 960 === 0).map((b) => b.notes.find((n) => n.string === string)!).map((n) => ({ string: n.string, fret: n.fret, duration: 'q' }));
    expect(line(1, 3)).toEqual(TURNAROUND_E);
    expect(line(3, 4)).toEqual(TURNAROUND_A);
    // Each beat also strikes the bass string and the open string 1.
    expect(lead.measures[0].beats[0].notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:0', '3:7', '1:0']);
    expect(lead.measures[2].beats[0].notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['5:0', '4:5', '1:0']);
    // The degrees of both lines.
    expect(TURNAROUND_E.map(nameAt)).toEqual(['D', 'C#', 'C', 'B']);
    expect(TURNAROUND_A.map(nameAt)).toEqual(['G', 'F#', 'F', 'E']);
    expect(['D', 'C#', 'C', 'B'].map((n) => intervalBetween('E', n))).toEqual(['m7', 'M6', 'm6', 'P5']);
    expect(['G', 'F#', 'F', 'E'].map((n) => intervalBetween('A', n))).toEqual(['m7', 'M6', 'm6', 'P5']);
    // Then the V chord: B7 after the E line, E7 after the A line.
    const chords = await chordsByBar('st-blues-turnarounds');
    expect([chords[1], chords[3]]).toEqual(['B7', 'E7']);
    // The full choruses put the turnaround in bars 11 and 12 of each 12-bar form.
    expect(chords.slice(4, 16)).toEqual(['E', 'E', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E7', 'B7']);
    expect(chords.slice(17, 29)).toEqual(['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A7', 'E7']);
  });

  it('teaches the blues scale with its blue note where the text puts it, always passing through', () => {
    expect(scaleNotes('A', 'minor-blues')).toEqual(['A', 'C', 'D', 'Eb', 'E', 'G']);
    expect(intervalBetween('A', 'Eb')).toBe('d5');
    expect(positionsForNote('Eb', { minFret: 5, maxFret: 8 }).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['3:8', '5:6']);
    const shape = allScalePatterns('A', 'minor-blues').position!.find((p) => p.id === 'position-1')!;
    expect([shape.minFret, shape.maxFret]).toEqual([5, 8]);
    expect(shape.notes.filter((n) => n.degree === 'b5').map((n) => `${n.string}:${n.fret}`)).toEqual(['5:6', '3:8']);
    expect(parseScaleParams(tasks.find((t) => t.id === 'blues-scale-scales')!.params!)).toEqual({ tonic: 'A', scale: 'minor-blues', shape: 'position-1' });
    // The passage: D Eb E, five times, three bars.
    expect(BLUE_NOTE_PASSAGE.map(nameAt).join(' ')).toBe(Array(5).fill('D Eb E').join(' '));
    expect(beats(BLUE_NOTE_PASSAGE)).toBe(12);
    // Dev's lick: two bars, every note in the blues scale, each Eb between a D and an E, ending on A.
    const names = DEV_BLUES_LICK.map(nameAt);
    expect(beats(DEV_BLUES_LICK)).toBe(8);
    expect(names.every((n) => scaleNotes('A', 'minor-blues').includes(n))).toBe(true);
    const flats = names.map((n, i) => (n === 'Eb' ? i : -1)).filter((i) => i >= 0);
    expect(flats.length).toBe(2);
    for (const i of flats) expect([names[i - 1], names[i + 1]]).toEqual(['D', 'E']);
    expect(names[names.length - 1]).toBe('A');
    expect(DEV_BLUES_LICK.filter((n) => nameAt(n) === 'Eb').map((n) => (pos(n)!.string))).toEqual([3, 5]);
    // Every note of the lick is in box 1 or is one of its two blue notes.
    expect(DEV_BLUES_LICK.every((n) => pos(n)!.fret >= 5 && pos(n)!.fret <= 8)).toBe(true);
  });

  it('puts the target notes where the text says: the third of A7, the seventh of D7, the third of E7', () => {
    expect(midiAt({ string: 3, fret: 6 })).toBe(61); // C#4
    expect(midiAt({ string: 3, fret: 5 })).toBe(60); // C4
    expect(midiAt({ string: 4, fret: 6 })).toBe(56); // G#3
    expect(chordNotes('A7')[1]).toBe('C#');
    expect(chordNotes('D7')[3]).toBe('C');
    expect(chordNotes('E7')[1]).toBe('G#');
    // C is in box 1; C# and G# are a fret away from it (C at 3:5, G at 4:5).
    expect(intervalBetween('G#', 'A')).toBe('m2');
    // The microphone steps name one place for each target; their alternatives accept that place.
    for (const [note, at] of [['C#4', '3:6'], ['C4', '3:5'], ['G#3', '4:6']]) {
      expect(positionsForNote(note, { minFret: 4, maxFret: 8 }).map((p) => `${p.string}:${p.fret}`)).toEqual([at]);
    }
  });

  // Review bug: the three no-microphone alternatives asked to "tap the third of A7 near the 5th
  // fret" with an exact octave, so the C# at string 5, fret 4 (and the C and G# at frets 8 and 4 of
  // strings 6 and 1) were marked wrong although they are the very note asked for.
  it('never marks a right note wrong: every note to find counts wherever it sits in the region', () => {
    const finds: Array<{ lesson: string; ex: FretboardFindExercise; note: string }> = [];
    for (const l of unit.lessons) {
      for (const s of l.steps as Array<{ type?: string; alternative?: { type?: string } }>) {
        for (const ex of [s, s.alternative]) {
          if (ex?.type !== 'fretboard-find') continue;
          const find = (ex as FretboardFindExercise).find;
          if ('note' in find) finds.push({ lesson: l.id, ex: ex as FretboardFindExercise, note: find.note });
        }
      }
    }
    expect(finds.length).toBeGreaterThanOrEqual(6);
    for (const { lesson, ex, note } of finds) {
      const pc = chroma(note.replace(/\d+$/, ''));
      const everywhere: string[] = [];
      for (let string = 1; string <= 6; string++) {
        if (ex.strings && !ex.strings.includes(string)) continue;
        for (let fret = ex.frets[0]; fret <= ex.frets[1]; fret++) if (pitchClassAt({ string, fret }) === pc) everywhere.push(`${string}:${fret}`);
      }
      const accepted = findTargets(ex).map((p) => `${p.string}:${p.fret}`);
      expect(accepted.sort(), `${lesson}: "${ex.prompt}"`).toEqual(everywhere.sort());
    }
    // And the three target alternatives accept the place the play step names.
    const mix = unit.lessons.find((l) => l.id === 'major-and-minor-mix')!;
    const plays = mix.steps.filter((s) => (s as { type?: string }).type === 'play-note') as Array<{ where: { string: number; fret: number }; alternative: FretboardFindExercise }>;
    expect(plays.length).toBe(3);
    for (const p of plays) expect(findTargets(p.alternative).map((x) => `${x.string}:${x.fret}`)).toContain(`${p.where.string}:${p.where.fret}`);
  });

  it('reads aloud and frames the blues the way the lessons mean it (review fixes)', () => {
    const text = JSON.stringify(unit.lessons);
    // A numeral is tagged so it is read "five", not the letter.
    expect(text).not.toMatch(/the V chord/);
    expect(text).toContain('the {r:V} chord');
    // No Dev lesson before this unit plays a 12-bar, so the opening does not assume one.
    const open = unit.lessons[0].steps[0] as { body: string };
    expect(open.body).not.toMatch(/you know/);
    // The E quick-change band plays sevenths: the jam says so.
    const p = getProgression('blues-quick-change')!;
    const played = [...new Set(progressionInKey(p, 'E').bars.flat().map((c) => c.symbol))];
    expect(played).toEqual(['E7', 'A7', 'B7']);
    const jam = (unit.lessons[0].steps.find((s) => isTaskStep(s) && s.id === 'quick-change-jam') as TaskStep).body as string;
    for (const c of played) expect(jam).toContain(`{c:${c}}`);
    // The turnaround tip names both hands: the thumb plucks, it does not fret.
    const tip = (unit.lessons.find((l) => l.id === 'turnarounds')!.steps.find((s) => (s as { tip?: string }).tip?.includes('Thumb') || (s as { tip?: string }).tip?.includes('thumb')) as { tip: string }).tip;
    expect(tip).toMatch(/^Fretting hand: .*Picking hand: thumb/);
  });

  it('sends the minor-blues tasks to parts the Player really has, and says where to pick them', async () => {
    const s = await song('st-minor-blues-a');
    expect(s.tracks.map((t) => t.name)).toEqual(['Melody', 'Rhythm']);
    const tasks = unit.lessons.flatMap((l) => l.steps).filter(isTaskStep) as TaskStep[];
    expect(tasks.find((t) => t.id === 'minor-blues-rhythm')!.body).toContain('under Parts, pick Rhythm');
    expect(tasks.find((t) => t.id === 'minor-blues-melody')!.body).toContain('pick Melody under Parts');
    // The movable sevenths keep a barre down for three choruses: the jam says when to rest.
    expect(tasks.find((t) => t.id === 'sevenths-jam')!.tip).toMatch(/ache, stop/);
  });

  it('charts the minor blues and quotes its melody as the study has them', async () => {
    expect(await chordsByBar('st-minor-blues-a', 1, 12)).toEqual([...MINOR_BLUES_A]);
    expect(MINOR_BLUES_MELODY_1_2).toEqual(await leadBars('st-minor-blues-a', 1, 2));
    expect([identifyFretted('x02010').symbol, identifyFretted('xx0211').symbol, identifyFretted('020100').symbol]).toEqual(['Am7', 'Dm7', 'E7']);
    const s = await song('st-minor-blues-a');
    expect(s.tempo[0].bpm).toBe(80);
    const rhythm = s.tracks.find((t) => t.role === 'rhythm')!;
    expect(rhythm.name).toBe('Rhythm');
    expect(s.tracks.find((t) => t.role === 'lead')!.name).toBe('Melody');
    // Down, down-up, down, down-up.
    expect(rhythm.measures[0].beats.map((b) => `${b.duration}${b.stroke === 'up' ? 'U' : 'D'}`)).toEqual(['960D', '480D', '480U', '960D', '480D', '480U']);
    // The melody stays in box 1 (frets 5 to 8).
    const lead = s.tracks.find((t) => t.role === 'lead')!;
    expect(lead.measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).every((n) => n.fret >= 5 && n.fret <= 8)).toBe(true);
    // Em7 is in A minor, but G sits a whole step under A; E7's G# is a half step under it.
    expect([intervalBetween('G', 'A'), intervalBetween('G#', 'A')]).toEqual(['M2', 'm2']);
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    expect(
      jamProblems(unit, {
        'quick-change-jam': ['E7', 'A7', 'B7'],
        'sevenths-jam': ['A7', 'D7', 'E7'],
        'turnaround-jam': ['E7', 'A7', 'B7'],
        'blues-scale-jam': ['A7', 'D7', 'E7'],
        'mix-jam': ['A7', 'D7', 'E7'],
        'minor-blues-jam': ['Am7', 'Dm7', 'E7'],
      }),
    ).toEqual([]);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems(unit)).toEqual([]);
  });
});
