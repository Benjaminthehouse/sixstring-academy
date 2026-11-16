/**
 * Cross-checks for Dev's unit 7 (Fingerstyle) against the engines and the song library: every
 * "string N, fret M" the text pairs with a note is that note; every chord shape is the chord it is
 * called; every tab figure is the library study it quotes (p i m a, p i m a m i, Travis, the
 * Travis melody, thumb-lead, the steady-thumb blues, Greensleeves); the Greensleeves show is the
 * tune note on every beat of the A section and its harmony is the library's; the technique tasks
 * start at the tempo the text names; every Player tempo is the song's tempo times the task's
 * percentage (dotted quarters in 6/8), for songs in the library and, for songs still missing, the
 * repertoire plan's tempo. Run with `npx vitest run src/content/teachers/dev/dev-fingerstyle.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import repertoire from '@/content/plan/repertoire.json';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { identifyFretted, midiAt, pitchClassAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { barCapacity, chroma, intervalBetween, parseTimeSignature } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, {
  CARTER_THUMB_1, DELTA_SLIDE, GREENSLEEVES_A_CHORDS, GREENSLEEVES_SHOW, GREENSLEEVES_TUNE_1_2, PIMAMI_AM, PIMAMI_E, PIMA_C, TRAVIS_C, TRAVIS_THUMB_C, TRAVIS_TUNE_1_2,
} from './dev-fingerstyle';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

type Beat = Song['tracks'][number]['measures'][number]['beats'][number];

const TICKS: Record<string, number> = { w: 3840, 'h.': 2880, h: 1920, 'q.': 1440, q: 960, 'e.': 720, e: 480, s: 240 };
const pos = (n: TabNote) => ('rest' in n ? null : `${n.string}:${n.fret}`);
const posOf = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;
const ticksOf = (notes: TabNote[]) => notes.reduce((sum, n) => sum + TICKS[n.duration], 0);

/** The beats of one bar (1-based, as the Player counts, pickup bar included) of a track. */
async function bar(id: string, n: number, track = 0): Promise<Beat[]> {
  return (await song(id)).tracks[track].measures[n - 1].beats;
}

/** Every note of a bar, in playing order, as "string:fret". */
async function barNotes(id: string, n: number): Promise<string[]> {
  return (await bar(id, n)).flatMap((b) => b.notes.map(posOf));
}

/** The chord in force at the start of each bar (1-based bars `from` to `to`). */
async function chordsByBar(id: string, from = 1, to?: number): Promise<string[]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const out: string[] = [];
  for (let i = from - 1; i < (to ?? s.bars.length); i++) {
    const inBar = events.filter((e) => e.bar === i).map((e) => e.symbol);
    const before = events.filter((e) => e.bar < i).pop();
    out.push(inBar.length > 0 && events.find((e) => e.bar === i)!.tick === 0 ? inBar.join(' ') : [before?.symbol ?? 'N.C.', ...inBar].join(' '));
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
  const check = (s: string, f: string, n: string, where: string) => {
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} (?:is |sits )?at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} is string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} \(string (\d), fret (\d+)\)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} is the open string (\d)/g)) check(m[2], '0', m[1], m[0]);
  return out;
}

/** Every "{c:X} (shape)" in the text: the shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  for (const m of text.matchAll(/\{c:([^}]+)\} \(([x0-9-]{6,})\)/g)) {
    const got = identifyFretted(m[2]).symbol;
    if (got !== m[1]) out.push(`${m[0]}: the shape is ${got}`);
  }
  return out;
}

interface RepertoireEntry { id: string; tempo?: number; meter?: string; key?: string }
const PLANNED = (repertoire as { pieces: RepertoireEntry[] }).pieces;

/** The beat a song's tempo is counted in: dotted quarters in 6/8, else quarters (SixTab tempo is always quarters). */
async function beatBpm(id: string): Promise<{ bpm: number; source: string } | null> {
  if (songEntry(id)) {
    const s = await song(id);
    const time = s.bars[s.bars.length - 1].time;
    const compound = time.numerator === 6 && time.denominator === 8;
    return { bpm: s.tempo[0].bpm / (compound ? 1.5 : 1), source: 'library' };
  }
  const planned = PLANNED.find((p) => p.id === id);
  return planned?.tempo ? { bpm: planned.tempo, source: 'repertoire plan' } : null;
}

/** Player tasks (and Player fallbacks): every "N % (M BPM)" and the tempo the task opens at match the song. */
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
        const text = plain(t.body);
        const claims = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM/g)];
        for (const m of claims) {
          const expected = (beat.bpm * Number(m[1])) / 100;
          if (Math.abs(expected - Number(m[2])) > 1) out.push(`${t.where}: "${m[0]}", but ${m[1]} % of ${beat.bpm} (${beat.source}) is ${expected.toFixed(1)}`);
        }
        const wait = t.params!.includes('wait');
        if (!wait && !claims.some((m) => Number(m[1]) === pct)) out.push(`${t.where}: never says the tempo it opens at (${pct} %)`);
      }
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((t) => t.id === id)!;

describe('Dev unit 7: fingerstyle', () => {
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
    // The checks above are not vacuous: the text makes many such claims.
    const text = JSON.stringify(unit);
    expect(text.match(/[Ss]tring \d, fret \d+ \(\{n:|[Ss]tring \d, fret \d+ is \{n:/g)!.length).toBeGreaterThan(15);
    expect(text.match(/\{c:[^}]+\} \([x0-9-]{6,}\)/g)!.length).toBeGreaterThan(15);
  });

  it('teaches p i m a as the study plays it: the thumb on the root, i m a on strings 3, 2, 1', async () => {
    expect(PIMA_C.map(pos)).toEqual(await barNotes('st-pima-arpeggios', 1));
    expect((await bar('st-pima-arpeggios', 1)).every((b) => b.duration === 480)).toBe(true);
    // Thumb on the root of each chord: string 5 for C and Am, 4 for Dm, 6 for G7.
    const firstNote = async (n: number) => (await bar('st-pima-arpeggios', n))[0].notes.map(posOf)[0];
    expect([await firstNote(1), await firstNote(5), await firstNote(9), await firstNote(13)]).toEqual(['5:3', '5:0', '4:0', '6:3']);
    expect(await chordsByBar('st-pima-arpeggios', 1, 16)).toEqual([...Array(4).fill('C'), ...Array(4).fill('Am'), ...Array(4).fill('Dm'), ...Array(4).fill('G7')]);
    // i, m and a always own strings 3, 2 and 1.
    const s = await song('st-pima-arpeggios');
    for (const m of s.tracks[0].measures) {
      for (const b of m.beats) {
        const fingers = b.notes.filter((x) => x.string <= 3);
        const thumb = b.notes.filter((x) => x.string >= 4);
        expect(fingers.length + thumb.length).toBe(b.notes.length);
        expect(thumb.length).toBeLessThanOrEqual(1);
      }
    }
    // p-a-m-i in the Dm bars, p-i-m-a-m-i-m-i in the G7 bars, the pinch on beat 1 of bars 15 and 16.
    expect(await barNotes('st-pima-arpeggios', 9)).toEqual(['4:0', '1:1', '2:3', '3:2', '4:0', '1:1', '2:3', '3:2']);
    expect(await barNotes('st-pima-arpeggios', 13)).toEqual(['6:3', '3:0', '2:0', '1:1', '2:0', '3:0', '2:0', '3:0']);
    for (const n of [15, 16]) expect((await bar('st-pima-arpeggios', n))[0].notes.map(posOf)).toEqual(['6:3', '1:1']);
    expect((await bar('st-pima-arpeggios', 14))[0].notes.length).toBe(1);
    // The chord shapes the lesson names, and the thumb's string for Em in All Through the Night.
    expect(['x32010', 'x02210', 'xx0231', '320001', '022000', 'xx0232', '320003'].map((f) => identifyFretted(f).symbol)).toEqual(['C', 'Am', 'Dm', 'G7', 'Em', 'D', 'G']);
    expect(getExercise('tech-pima-free-stroke')!.tempo.start).toBe(60);
  });

  it('fills a 3/4 bar with p-i-m-a-m-i and puts the pinched tune where the lesson says', async () => {
    expect(barCapacity('3/4') / 480).toBe(6);
    expect(PIMAMI_AM.map(pos)).toEqual(await barNotes('st-pimami-3-4', 1));
    expect(PIMAMI_E.map(pos)).toEqual(await barNotes('st-pimami-3-4', 3));
    expect(ticksOf(PIMAMI_AM)).toBe(barCapacity('3/4'));
    expect(await chordsByBar('st-pimami-3-4', 1, 4)).toEqual(['Am', 'Dm', 'E', 'Am']);
    // Thumb strings 5, 4, 6, 5.
    for (const [n, root] of [[1, '5:0'], [2, '4:0'], [3, '6:0'], [4, '5:0']] as const) expect((await barNotes('st-pimami-3-4', n))[0]).toBe(root);
    // Bars 9 to 16: a pinch on beat 1, its top note the tune E F G# E, G F E.
    const tune: number[] = [];
    for (let n = 9; n <= 15; n++) {
      const first = (await bar('st-pimami-3-4', n))[0];
      expect(first.notes.length, `bar ${n} starts with a pinch`).toBe(2);
      tune.push(Math.max(...first.notes.map((x) => x.midi)) % 12);
    }
    expect(tune).toEqual(['E', 'F', 'G#', 'E', 'G', 'F', 'E'].map(chroma));
    expect(await barNotes('st-pimami-3-4', 11)).toContain('1:4');
    // The audio pinch is the study's first pinch: the open A with the open E on top.
    expect((await bar('st-pimami-3-4', 9))[0].notes.map((x) => x.midi).sort()).toEqual([45, 64]);
  });

  it('teaches the Travis thumb and fingers exactly as the study plays them', async () => {
    expect(TRAVIS_C.map(pos)).toEqual(await barNotes('st-travis-picking', 1));
    const beats = await bar('st-travis-picking', 1);
    // The thumb on every beat: string 5, 4, 6, 4; i on string 2 and m on string 1 on the "ands".
    expect(beats.filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes[0]))).toEqual(TRAVIS_THUMB_C.map(pos));
    expect(beats.filter((b) => b.start % 960 === 480).map((b) => posOf(b.notes[0]))).toEqual(['2:1', '1:0', '2:1', '1:0']);
    expect(midiAt({ string: 6, fret: 3 }) % 12).toBe(chroma('G'));
    expect(intervalBetween('C', 'G')).toBe('P5');
    // G7: string 6, fret 3 and the open string 4; Am: the open string 5 and string 4, fret 2.
    const thumb = async (n: number) => (await bar('st-travis-picking', n)).filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes.reduce((lo, x) => (x.string > lo.string ? x : lo))));
    expect(await thumb(3)).toEqual(['5:0', '4:2', '5:0', '4:2']);
    expect(await thumb(5)).toEqual(['6:3', '4:0', '6:3', '4:0']);
    // Bars 9 to 16 pinch the thumb and m (string 1) on beat 1; bars 1 to 8 do not.
    for (let n = 1; n <= 16; n++) {
      const first = (await bar('st-travis-picking', n))[0];
      expect(first.notes.some((x) => x.string === 1), `bar ${n}`).toBe(n >= 9);
    }
    expect(getExercise('tech-travis-thumb')!.tempo.start).toBe(60);
  });

  it('quotes the tune of the Travis melody study and the thumb under F', async () => {
    // The tune of bars 1 and 2: the notes on strings 1 and 2, with their onsets.
    const tuneOf = async (n: number) => (await bar('st-travis-melody', n)).flatMap((b) => b.notes.filter((x) => x.string <= 2).map((x) => ({ at: b.start, pos: posOf(x) })));
    const tune = [...(await tuneOf(1)), ...(await tuneOf(2)).map((x) => ({ ...x, at: x.at + 3840 }))];
    let at = 0;
    const expected = TRAVIS_TUNE_1_2.map((n) => {
      const out = { at, pos: pos(n)! };
      at += TICKS[n.duration];
      return out;
    });
    expect(tune).toEqual(expected);
    expect(ticksOf(TRAVIS_TUNE_1_2)).toBe(2 * 3840);
    // The tune of bar 1 lands on beat 1, the "and" of 2 and beat 4.
    expect(tune.slice(0, 3).map((x) => x.at)).toEqual([0, 1440, 2880]);
    // The tune stays on strings 1 and 2 over a thumb on every beat: each beat has exactly one thumb
    // note (strings 3 to 6), and every note between the beats is on string 1 or 2.
    const s = await song('st-travis-melody');
    for (const [i, m] of s.tracks[0].measures.entries()) {
      for (const b of m.beats) {
        if (b.start % 960 === 0) expect(b.notes.filter((x) => x.string >= 3).length, `bar ${i + 1} beat at ${b.start}`).toBe(1);
        else expect(b.notes.every((x) => x.string <= 2), `bar ${i + 1} at ${b.start}`).toBe(true);
        expect(b.notes.filter((x) => x.string <= 2).length, `bar ${i + 1} at ${b.start}`).toBeLessThanOrEqual(1);
      }
    }
    // Under F (xx3211) the thumb alternates string 4, fret 3 and string 3, fret 2.
    const fBar = s.chords.find((c) => c.symbol === 'F')!.bar + 1;
    const fThumb = (await bar('st-travis-melody', fBar)).filter((b) => b.start % 960 === 0).map((b) => b.notes.map(posOf).filter((p) => p === '4:3' || p === '3:2')[0]);
    expect(fThumb).toEqual(['4:3', '3:2', '4:3', '3:2']);
    expect(identifyFretted('xx3211').symbol).toBe('F');
    // The fallback's bars 9 to 16 have F under the thumb.
    expect((await chordsByBar('st-travis-melody', 9, 16)).join(' ')).toContain('F');
  });

  it('quotes the thumb-lead tune and the blue-note slide of the steady-thumb blues', async () => {
    const lead = (await bar('st-carter-style', 1)).filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes[0]));
    expect(lead).toEqual(CARTER_THUMB_1.map(pos));
    // Each "and" is an index brush across strings 3 to 1.
    for (const b of (await bar('st-carter-style', 1)).filter((x) => x.start % 960 === 480)) expect(b.notes.map((x) => x.string).sort()).toEqual([1, 2, 3]);
    expect(await chordsByBar('st-carter-style', 1, 16)).toEqual(expect.arrayContaining(['C', 'F', 'G7']));
    // The blues: string 3 of bar 2 slides Bb to B, then A and G; the thumb thumps open strings.
    expect((await bar('st-delta-blues-e', 2)).flatMap((b) => b.notes.filter((x) => x.string === 3).map(posOf))).toEqual(DELTA_SLIDE.map(pos));
    expect(intervalBetween('E', 'Bb')).toBe('d5');
    expect(midiAt({ string: 3, fret: 3 })).toBe(58);
    const thumbOf = async (n: number) => [...new Set((await bar('st-delta-blues-e', n)).filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes.reduce((lo, x) => (x.string > lo.string ? x : lo)))))];
    expect(await thumbOf(1)).toEqual(['6:0']);
    expect(await thumbOf(5)).toEqual(['5:0']);
    expect(await thumbOf(9)).toEqual(['5:2']);
    expect(await chordsByBar('st-delta-blues-e', 1, 12)).toEqual(['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'E7']);
    expect(getExercise('tech-thumb-independence')!.tempo.start).toBe(50);
  });

  it('plays Greensleeves as the library arranges it: the tune, the F sharp, the chords and the show', async () => {
    const s = await song('greensleeves-fingerstyle');
    expect(parseTimeSignature('6/8')!.beats).toBe(2);
    // Bar 1 is the pickup; the A section is bars 1 to 9.
    expect(s.sections.find((x) => x.name === 'A')).toMatchObject({ start: 0, end: 9 });
    expect((await bar('greensleeves-fingerstyle', 1)).flatMap((b) => b.notes.map(posOf))).toEqual(['3:2']);
    // The tune of bars 2 and 3 (the first two full bars): each tune note sounds at its onset.
    let at = 0;
    for (const n of GREENSLEEVES_TUNE_1_2) {
      const barNo = 2 + Math.floor(at / 2880);
      const tick = at % 2880;
      const there = (await bar('greensleeves-fingerstyle', barNo)).find((b) => b.start === tick);
      expect(there?.notes.map(posOf), `${pos(n)} at bar ${barNo}, tick ${tick}`).toContain(pos(n));
      at += TICKS[n.duration];
    }
    expect(at).toBe(2 * 2880);
    // The show: the top note on every dotted-quarter beat of bars 2 to 9 (bar 9: beat 1 only).
    const top: string[] = [];
    for (let n = 2; n <= 9; n++) {
      for (const tick of n === 9 ? [0] : [0, 1440]) {
        const b = (await bar('greensleeves-fingerstyle', n)).find((x) => x.start === tick)!;
        top.push(posOf(b.notes.reduce((hi, x) => (x.midi > hi.midi ? x : hi))));
      }
    }
    expect(GREENSLEEVES_SHOW.map(pos)).toEqual(top);
    // Bass on each beat: a note below the tune at every dotted-quarter beat of the A section.
    for (let n = 2; n <= 8; n++) for (const tick of [0, 1440]) expect((await bar('greensleeves-fingerstyle', n)).find((x) => x.start === tick)!.notes.length, `bar ${n} tick ${tick}`).toBeGreaterThanOrEqual(2);
    // The chords of the A section, bar by bar.
    expect(await chordsByBar('greensleeves-fingerstyle', 2, 9)).toEqual([...GREENSLEEVES_A_CHORDS]);
    // F sharp every time, never F: only at string 1, fret 2 and string 4, fret 4.
    const all = s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(all.filter((x) => x.midi % 12 === chroma('F'))).toEqual([]);
    expect([...new Set(all.filter((x) => x.midi % 12 === chroma('F#')).map(posOf))].sort()).toEqual(['1:2', '4:4']);
    expect(new Set(s.chords.map((c) => c.symbol))).toEqual(new Set(['Am', 'G', 'E', 'C']));
    expect(['x02210', '320003', '022100', 'x32010'].map((f) => identifyFretted(f).symbol)).toEqual(['Am', 'G', 'E', 'C']);
    // E's G# is a half step under A.
    expect(intervalBetween('G#', 'A')).toBe('m2');
  });

  it('opens every task at an address that plays what the text says', async () => {
    expect(task('greensleeves-wait').params).toEqual(['greensleeves-fingerstyle', 'm1-9', 'wait']);
    expect(task('greensleeves-loop').params).toEqual(['greensleeves-fingerstyle', 'm2-3', 't74']);
    expect(task('pima-study-2').params).toEqual(['st-pima-arpeggios', 'm9-16', 't91']);
    expect(task('pimami-study-2').params).toEqual(['st-pimami-3-4', 'm9-16', 't91']);
    // The fallbacks name the chords those songs really use.
    expect(new Set((await song('o-come-all-ye-faithful')).chords.map((c) => c.symbol))).toEqual(new Set(['G', 'D', 'Em', 'C', 'Am']));
    expect(new Set((await song('brahms-lullaby')).chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D7']));
    expect((await song('brahms-lullaby')).bars[1].time).toMatchObject({ numerator: 3, denominator: 4 });
    // A song not in the library yet always has a fallback.
    for (const t of tasks) if (taskSong(t) && !songEntry(taskSong(t)!)) expect(t.fallback, t.id).toBeTruthy();
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems(unit)).toEqual([]);
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

describe('Dev unit 7: review fixes', () => {
  it('swings the blue-note slide exactly as the study writes it (long-short in each beat)', async () => {
    const TRIPLET: Record<string, number> = { qt: 640, et: 320 };
    const s3 = (await bar('st-delta-blues-e', 2)).flatMap((b) => b.notes.filter((x) => x.string === 3).map((x) => ({ at: b.start, pos: posOf(x), dur: b.duration })));
    let at = 0;
    const expected = DELTA_SLIDE.map((n) => {
      const out = { at, pos: pos(n)!, dur: TRIPLET[n.duration] };
      at += TRIPLET[n.duration];
      return out;
    });
    expect(s3).toEqual(expected);
  });

  it('never claims the steady thumb sits on an open string under every chord (under B7 it is fretted)', async () => {
    expect(JSON.stringify(unit)).not.toMatch(/one open (low |bass )?string per chord|[Rr]epeats one open string/);
    const b7 = (await chordsByBar('st-delta-blues-e', 1, 12)).indexOf('B7') + 1;
    const thumb = (await bar('st-delta-blues-e', b7)).filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes.reduce((lo, x) => (x.string > lo.string ? x : lo))));
    expect(new Set(thumb)).toEqual(new Set(['5:2']));
  });

  it('places the 3/4 study\'s pinched melody in the bars the text names', async () => {
    const explain = JSON.stringify(unit).match(/The melody of bars (\d+) to (\d+) runs ((?:\{n:[^}]+\}(?:, )?)+)/)!;
    const [from, to] = [Number(explain[1]), Number(explain[2])];
    const named = [...explain[3].matchAll(/\{n:([^}]+)\}/g)].map((m) => chroma(m[1]));
    const top: number[] = [];
    for (let n = from; n <= to; n++) top.push(Math.max(...(await bar('st-pimami-3-4', n))[0].notes.map((x) => x.midi)) % 12);
    expect(top).toEqual(named);
  });

  it('gives the quarter-note bpm the Player shows wherever a 6/8 task names it', async () => {
    let checked = 0;
    for (const t of tasks) {
      if (!taskSong(t)) continue;
      for (const m of plain(t.body).matchAll(/(\d+) % \([^)]*shows (\d+) bpm/g)) {
        const quarters = (await song(taskSong(t)!)).tempo[0].bpm;
        expect(Math.round((quarters * Number(m[1])) / 100), `${t.id}: ${m[0]}`).toBe(Number(m[2]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('asks no note question whose prompt already names the answer', () => {
    expect(giveawayProblems(unit)).toEqual([]);
  });

  it('celebrates what the show heard: the A section of Greensleeves, start to finish', () => {
    expect(unit.milestone!.celebrate).toMatch(/A section/);
    expect(GREENSLEEVES_SHOW.length).toBe(15);
  });
});
