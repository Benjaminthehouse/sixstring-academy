/**
 * Cross-checks for Dev's unit 8 (Seventh chords) against the engines and the song library: every
 * chord shape the text names is that chord (open, movable, up the neck); the spellings, formulas
 * and colours of the four sevenths; the sevenths of C major and their numerals, and one dominant
 * seventh per major key; every signpost resolves a fifth down and is the secondary dominant the
 * text says; the ragtime cycle as the jam and the study play it; the habanera; the jam tracks play
 * the chords the text names at tempos their band plays; every Player tempo is the song's tempo
 * (or the repertoire plan's, for songs still missing) times the task's percentage.
 * Run with `npx vitest run src/content/teachers/dev/dev-seventh-chords.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import repertoire from '@/content/plan/repertoire.json';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { identifyFretted, parseFrets, pitchClassAt, positionsForNote } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chordToRoman, chroma, degreeInKey, getChordType, harmonizeScale, intervalBetween, MAJOR_KEYS } from '@/core/theory';
import { drillById, levelOf } from '@/features/ear/core/drills';
import { chordFromParam } from '@/features/chords/model/symbols';
import { estimateLessonSeconds, formatProblems, parseRhythm, rhythmOnsetTimes, validateCourse } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { RAGTIME_CYCLE, SEVENTHS_OF_C, SEVENTHS_OF_C_SHAPES } from './dev-seventh-chords';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const posOf = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;

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

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

function noteClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const check = (s: string, f: string, n: string, where: string) => {
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} (?:is |sits )?at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} is at fret (\d+) of string (\d)/g)) check(m[3], m[2], m[1], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} is the open string (\d)/g)) check(m[2], '0', m[1], m[0]);
  return out;
}

/** "{c:X} (shape)", "{c:X} shape" (facts) and hyphenated shapes: each shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): { problems: string[]; checked: number } {
  const text = JSON.stringify(u);
  const problems: string[] = [];
  let checked = 0;
  for (const m of [...text.matchAll(/\{c:([^}]+)\} \(([x0-9-]{6,})\)/g), ...text.matchAll(/\{c:([^}]+)\} ([x0-9]{6})(?![0-9-])/g)]) {
    checked++;
    const got = identifyFretted(m[2]).symbol;
    if (got !== m[1]) problems.push(`${m[0]}: the shape is ${got}`);
  }
  return { problems, checked };
}

interface RepertoireEntry { id: string; tempo?: number; key?: string; meter?: string; notes?: string; teaches?: string[] }
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

function jamProblems(u: TeacherUnit, chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  const steps = u.lessons.flatMap((l) => l.steps).filter(isTaskStep) as TaskStep[];
  const jams = steps.flatMap((s) => [s, ...(s.fallback ? [{ ...s.fallback, id: `${s.id}/fallback` } as TaskStep] : [])]).filter((s) => s.tool === 'progressions');
  for (const step of jams) {
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
    if (!(bpm >= range.min && bpm <= range.max)) out.push(`${step.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays (${range.min} to ${range.max})`);
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((t) => t.id === id)!;
const shape = (frets: string) => identifyFretted(frets).symbol;
const diffs = (a: string, b: string) => parseFrets(a).filter((f, i) => f !== parseFrets(b)[i]).length;
const notesOf = (frets: string) => identifyFretted(frets).notes.map((n) => `${n.string}:${n.fret} ${n.note} ${n.degree}`);

describe('Dev unit 8: seventh chords', () => {
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

  it('pairs every fret in the text with its note, and every shape with its chord', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
    const { problems, checked } = shapeClaimProblems(unit);
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(40);
  });

  it('spells the four colours on C with the formulas the text gives', () => {
    expect(chordNotes('Cmaj7')).toEqual(['C', 'E', 'G', 'B']);
    expect(chordNotes('C7')).toEqual(['C', 'E', 'G', 'Bb']);
    expect(chordNotes('Cm7')).toEqual(['C', 'Eb', 'G', 'Bb']);
    expect(chordNotes('Cm7b5')).toEqual(['C', 'Eb', 'Gb', 'Bb']);
    expect(getChordType('maj7')!.degrees).toEqual(['1', '3', '5', '7']);
    expect(getChordType('7')!.degrees).toEqual(['1', '3', '5', 'b7']);
    expect(getChordType('m7')!.degrees).toEqual(['1', 'b3', '5', 'b7']);
    expect(getChordType('m7b5')!.degrees).toEqual(['1', 'b3', 'b5', 'b7']);
    // The dominant seventh's restlessness: its third and seventh are a tritone apart.
    expect(intervalBetween('E', 'Bb')).toBe('d5');
  });

  it('makes each open seventh from a chord you know by moving, lifting or adding one finger', () => {
    const fromTriad: Array<[string, string, string]> = [['Cmaj7', 'x32000', 'x32010'], ['Fmaj7', 'xx3210', 'xx3211'], ['Amaj7', 'x02120', 'x02220'], ['Dmaj7', 'xx0222', 'xx0232'], ['Am7', 'x02010', 'x02210'], ['Em7', '022030', '022000'], ['Dm7', 'xx0211', 'xx0231']];
    for (const [sym, seventh, triad] of fromTriad) {
      expect(shape(seventh), seventh).toBe(sym);
      expect(diffs(seventh, triad), `${sym} vs ${shape(triad)}`).toBe(1);
    }
    // Cmaj7: the open string 2 is the major seventh; Am7: the open string 3 is the flat seventh.
    expect(notesOf('x32000')).toContain('2:0 B 7');
    expect(notesOf('x02010')).toContain('3:0 G b7');
    // Dmaj7 is D with string 2 down a fret, D to C#.
    expect(notesOf('xx0232')).toContain('2:3 D 1');
    expect(notesOf('xx0222')).toContain('2:2 C# 7');
    // Gmaj7 (3x443x) sounds G F# B D with string 5 muted.
    expect(shape('3x443x')).toBe('Gmaj7');
    expect(identifyFretted('3x443x').notes.map((n) => n.note)).toEqual(['G', 'F#', 'B', 'D']);
    expect(chordFromParam(task('open-sevenths').params![0])).toBe('Fmaj7');
    expect(levelOf(drillById('chords')!, task('sevenths-ear').params![1])!.pool).toEqual(['maj7', '7', 'm7', 'm7b5', 'dim7']);
  });

  it('builds the movable shapes with the thirds and sevenths where the text puts them', () => {
    expect([shape('575655'), shape('575555'), shape('5x665x')]).toEqual(['A7', 'Am7', 'Amaj7']);
    expect([shape('x57575'), shape('x57565'), shape('x5767x'), shape('x2323x')]).toEqual(['D7', 'Dm7', 'Dmaj7', 'Bm7b5']);
    expect(notesOf('575555')).toContain('3:5 C b3');
    expect(notesOf('575655')).toContain('3:6 C# 3');
    expect(notesOf('575555')).toContain('4:5 G b7');
    expect(notesOf('5x665x')).toContain('4:6 G# 7');
    // Only one C in the fretboard-find region (frets 5 to 7): string 3, fret 5.
    expect(positionsForNote('C', { minFret: 5, maxFret: 7 }).map(posOf)).toEqual(['3:5']);
    // Moving shapes: Gm7 is Am7 two frets down, Em7b5 is Bm7b5 five up, Bbmaj7 is Dmaj7 four down.
    const move = (f: string, by: number) => [...f].map((ch) => (/\d/.test(ch) ? String(Number(ch) + by) : ch)).join('');
    expect(move('575555', -2)).toBe('353333');
    expect(shape('353333')).toBe('Gm7');
    expect(move('x2323x', 5)).toBe('x7878x');
    expect(shape('x7878x')).toBe('Em7b5');
    expect(notesOf('x7878x')).toEqual(['5:7 E 1', '4:8 Bb b5', '3:7 D b7', '2:8 G b3']);
    expect(shape('x1323x')).toBe('Bbmaj7');
    expect(positionsForNote('E3', { maxFret: 12 }).filter((p) => p.string === 5).map(posOf)).toEqual(['5:7']);
    expect(positionsForNote('Bb', { maxFret: 12 }).filter((p) => p.string === 5).map(posOf)).toEqual(['5:1']);
  });

  it('gives C major its seven sevenths, a shape each between frets 3 and 10, and one dominant per key', () => {
    const c = harmonizeScale('C', 'major', { sevenths: true });
    expect(c.map((x) => x.symbol)).toEqual([...SEVENTHS_OF_C]);
    expect(c.map((x) => x.roman)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
    for (const sym of SEVENTHS_OF_C) {
      const f = SEVENTHS_OF_C_SHAPES[sym];
      expect(shape(f), f).toBe(sym);
      const fretted = parseFrets(f).filter((x): x is number => x !== null);
      expect(Math.min(...fretted), f).toBeGreaterThanOrEqual(3);
      expect(Math.max(...fretted), f).toBeLessThanOrEqual(10);
    }
    // Roots on string 5 for I to IV, on string 6 for V to vii, climbing in each group.
    const rootFret = (f: string, string: number) => parseFrets(f)[6 - string];
    expect(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7'].map((s) => rootFret(SEVENTHS_OF_C_SHAPES[s as keyof typeof SEVENTHS_OF_C_SHAPES], 5))).toEqual([3, 5, 7, 8]);
    expect(['G7', 'Am7', 'Bm7b5'].map((s) => rootFret(SEVENTHS_OF_C_SHAPES[s as keyof typeof SEVENTHS_OF_C_SHAPES], 6))).toEqual([3, 5, 7]);
    // Em7 is the Dm7 shape up two frets; Fmaj7 is the Dmaj7 shape up three.
    expect(parseFrets('x79787')).toEqual(parseFrets('x57565').map((f) => (f === null ? null : f + 2)));
    expect(parseFrets('x-8-10-9-10-x')).toEqual(parseFrets('x5767x').map((f) => (f === null ? null : f + 3)));
    expect(notesOf('7x776x')).toEqual(['6:7 B 1', '4:7 A b7', '3:7 D b3', '2:6 F b5']);
    // Every major key has exactly one dominant seventh, on V; in G major it is D7.
    for (const k of MAJOR_KEYS) {
      const sevenths = harmonizeScale(k.tonic, 'major', { sevenths: true });
      expect(sevenths.filter((x) => x.type.id === '7').map((x) => x.roman), k.name).toEqual(['V7']);
    }
    expect(harmonizeScale('G', 'major', { sevenths: true })[4].symbol).toBe('D7');
    expect(harmonizeScale('G', 'major', { sevenths: true })[3].symbol).toBe('Cmaj7');
  });

  it('calls every signpost what the theory engine calls it, and each one points a fifth down', async () => {
    const roots: Record<string, string> = { A7: 'A', D7: 'D', E7: 'E', G7: 'G', B7: 'B' };
    const signposts: Array<[string, string, string, string]> = [
      ['A7', 'D7', 'G', 'V7/V'], ['D7', 'G', 'C', 'V7/V'], ['E7', 'Am', 'C', 'V7/vi'], ['B7', 'Em', 'G', 'V7/vi'], ['G7', 'C', 'G', 'V7/IV'],
    ];
    for (const [from, to, key, roman] of signposts) {
      expect(chordToRoman(from, key, { next: to }).roman, `${from} in ${key}`).toBe(roman);
      expect(intervalBetween(to.replace(/m$|7$/, ''), roots[from]), `${from} to ${to}`).toBe('P5');
    }
    // The songs: Home on the Range and Danny Boy carry the chords the lesson names.
    expect(planned('home-on-the-range').notes).toMatch(/A7 \(x02020\), the V of V that leads into D7/);
    expect(planned('home-on-the-range').key).toBe('G major');
    expect(planned('danny-boy').notes).toMatch(/D7 \(xx0212\), E7 \(020100\)/);
    expect(planned('danny-boy').key).toBe('C major');
    // The fallbacks: Amazing Grace's G7 in line 3 leads to C; Jingle Bells has A7 then D7 in bars 7 and 8.
    const grace = await chordsByBar('amazing-grace');
    const line3 = grace.slice(9, 13);
    expect(line3).toEqual(['G', 'G7', 'C', 'G']);
    expect((await chordsByBar('jingle-bells', 7, 8))).toEqual(['A7', 'D7']);
    expect((await song('amazing-grace')).bars[1].time).toMatchObject({ numerator: 3, denominator: 4 });
  });

  it('plays the ragtime cycle as the jam and the study do, with the thumb on each root', async () => {
    expect(progressionInKey(getProgression('secondary-ragtime')!, 'C').bars.flat().map((c) => c.symbol)).toEqual([...RAGTIME_CYCLE]);
    // Each seventh is the dominant of the next: A7 to D, D7 to G, G7 to C.
    for (const [a, b] of [['A', 'D'], ['D', 'G'], ['G', 'C']]) expect(intervalBetween(b, a)).toBe('P5');
    expect(intervalBetween('Bb', 'F')).toBe('P5');
    expect(await chordsByBar('st-ragtime-blues-c', 1, 8)).toEqual(['C', 'C', 'A7', 'A7', 'D7', 'D7', 'G7', 'G7']);
    expect(await chordsByBar('st-ragtime-blues-c', 9, 16)).toEqual(['C', 'C', 'A7', 'A7', 'D7', 'D7', 'G7', 'G7']);
    const s = await song('st-ragtime-blues-c');
    const thumb = (barNo: number) => s.tracks[0].measures[barNo - 1].beats.filter((b) => b.start % 960 === 0).map((b) => posOf(b.notes.reduce((lo, x) => (x.string > lo.string ? x : lo))));
    expect(thumb(1)[0]).toBe('5:3');
    expect(thumb(3)).toEqual(['5:0', '4:2', '6:0', '4:2']);
    expect(thumb(5)[0]).toBe('4:0');
    expect(thumb(7)[0]).toBe('6:3');
    expect(['x32010', 'x02020', 'xx0212', '320001'].map(shape)).toEqual(['C', 'A7', 'D7', 'G7']);
    expect(notesOf('x02020')).toContain('3:0 G b7');
    // The swing tap: long-short, the second tap two thirds into each beat.
    const swing = rhythmOnsetTimes('et ~et et et ~et et et ~et et et ~et et', 60);
    expect(swing.map((x) => Math.round(x * 3))).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
  });

  it('puts the blue note in the IV7, the habanera in 2/4, and the songbook chords where they belong', async () => {
    expect(notesOf('x32310')).toContain('3:3 Bb b7');
    expect(degreeInKey('Bb', 'G')).toBe('b3');
    expect(chordToRoman('C7', 'G').literal).toBe('IV7');
    expect(parseRhythm({ pattern: 'e. s e e', time: '2/4' }).problems).toEqual([]);
    expect(rhythmOnsetTimes({ pattern: 'e. s e e', time: '2/4' }, 60)).toEqual([0, 0.75, 1, 1.5]);
    expect(planned('la-paloma').notes).toMatch(/habanera rhythm \(dotted eighth, sixteenth, eighth, eighth in each bar\)/);
    expect(planned('la-paloma').meter).toBe('2/4');
    expect(planned('nobody-knows').notes).toMatch(/C7 \(a IV7 chord\)/);
    expect(planned('john-henry').notes).toMatch(/E7 \(020100\), A7 \(x02020\) and B7 \(x21202\)/);
    // The fallbacks: Coming 'Round the Mountain has a C to turn into C7; Oh! Susanna is 2/4 on G, C and D7.
    expect((await song('coming-round-the-mountain')).chords.some((c) => c.symbol === 'C')).toBe(true);
    expect(new Set((await song('oh-susanna')).chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D7']));
    expect((await song('oh-susanna')).bars[1].time).toMatchObject({ numerator: 2, denominator: 4 });
    // The shape quiz: the shapes the explanations give.
    expect([shape('x24232'), shape('797777'), shape('x6878x'), shape('2x221x')]).toEqual(['Bm7', 'Bm7', 'Ebmaj7', 'F#m7b5']);
    expect(chordNotes('F#m7b5')).toEqual(['F#', 'A', 'C', 'E']);
    expect(chordNotes('Ebmaj7')).toEqual(['Eb', 'G', 'Bb', 'D']);
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    expect(
      jamProblems(unit, {
        'soul-jam': ['Cmaj7', 'Fmaj7'],
        'funk-vamp': ['Dm7', 'G7'],
        'rnb-jam': ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
        'ragtime-jam': ['C', 'A7', 'D7', 'G7'],
        'john-henry/fallback': ['E7', 'A7', 'B7'],
      }),
    ).toEqual([]);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems(unit)).toEqual([]);
    // The Gymnopedie fallback sets the Metronome to the tempo the task names.
    expect(plain(task('gymnopedie').fallback!.body)).toMatch(/3\/4 at 50 BPM/);
    for (const t of tasks) if (taskSong(t) && !songEntry(taskSong(t)!)) expect(t.fallback, t.id).toBeTruthy();
  });
});

// ── checks added by the independent review ──────────────────────────────────────────────────────

describe('Dev unit 8: review fixes', () => {
  it('describes an Ear Training round as the app runs it: one round of ten chords, five colours', () => {
    const level = levelOf(drillById('chords')!, '7')!;
    expect(level.questions).toBe(10);
    expect(level.pool.length).toBe(5);
    for (const id of ['sevenths-ear', 'quiz-ear']) {
      const body = plain(task(id).body);
      expect(body, id).toMatch(/one round of ten/);
      expect(body, id).not.toMatch(/ten rounds/);
    }
  });

  it('gives health advice where the barre grips start', () => {
    const card = unit.lessons.find((l) => l.id === 'movable-sevenths')!.steps[0] as { tip?: RichText };
    expect(plain(card.tip!)).toMatch(/aches/);
  });
});
