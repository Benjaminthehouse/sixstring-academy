/**
 * Cross-checks for Prof. Varga's unit 1 (Practice and precision) against the engines, the song
 * library and the technique exercises: the C major positions the audition names, the twelve chord
 * shapes, the F to Bb changes, the Travis study's bars, the unseen reading bars and the note asked
 * there, the jam, G major three-notes-per-string pattern 1 with its roots and the E-shape G inside
 * it, the chromatic and string-crossing notes, the ladder arithmetic, every tool address and the BPM
 * every Player task names. Run with
 * `npx vitest run src/content/teachers/elena/elena-practice-and-precision.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { MAJOR_KEYS, getExercise } from '@/content/technique';
import { G_MAJOR_3NPS } from '@/content/technique/exercises/picking';
import { buildVoicing, identifyFretted, midiAt, noteAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { viewFromParams } from '@/features/chords/model/symbols';
import { parseAddress } from '@/features/progressions/model/address';
import { parseScaleParams } from '@/features/scales/model/address';
import { DRILLS } from '@/features/rhythm/core/ladder';
import { afterPass } from '@/features/technique/model/ladder';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, { G_3NPS_1 } from './elena-practice-and-precision';

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
  const t = tasks(unit).find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
}

function step<T>(lessonId: string, pred: (s: Record<string, unknown>) => boolean): T {
  const s = lesson(lessonId).steps.find((x) => pred(x as unknown as Record<string, unknown>));
  if (!s) throw new Error(`no such step in ${lessonId}`);
  return s as unknown as T;
}

/** Problems with the tempos the Player tasks name: "about N BPM" (or "N BPM") first, "100 % (M BPM)" after. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const s of tasks(u)) {
    const id = taskSong(s);
    if (!id || !songEntry(id)) continue;
    const bpm = (await song(id)).tempo[0].bpm;
    const pctParam = (s.params ?? []).find((p) => /^t\d+$/.test(p));
    const pct = pctParam ? Number(pctParam.slice(1)) : 100;
    let text = plain(s.body);
    for (const m of text.matchAll(/(\d+) % \((\d+) BPM\)/g)) {
      if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${s.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    }
    text = text.replace(/(\d+) % \((\d+) BPM\)/g, '');
    const first = text.match(/(\d+) BPM/);
    if (!first) {
      if (pct !== 100) out.push(`${s.id}: opens at ${pct} % but names no BPM`);
      continue;
    }
    const opens = (bpm * pct) / 100;
    if (Math.abs(opens - Number(first[1])) > 1) out.push(`${s.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
  }
  return out;
}

const course = compileCourse(courseMeta('elena'), [unit]);
const pos = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;
const sym = (frets: string) => identifyFretted(frets).symbol;

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 1: Practice and precision', () => {
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

  it('puts the C major positions where the audition says (E shape frets 7 to 10, A shape 2 to 6)', () => {
    const c = scalePatterns('C', 'major');
    const e = c.find((p) => p.id === 'caged-e')!;
    const a = c.find((p) => p.id === 'caged-a')!;
    expect([e.minFret, e.maxFret]).toEqual([7, 10]);
    expect([a.minFret, a.maxFret]).toEqual([2, 6]);
    expect(c).toHaveLength(5);
    expect(plain(task('audition-scale').body)).toContain('frets 7 to 10');
    expect(plain(task('audition-scale').body)).toContain('frets 2 to 6');
  });

  it('names the twelve audition shapes for what they sound: two majors, two minors, two sevenths', () => {
    const card = step<{ body: string }>('elena-audition', (s) => s.title === 'Item 2: six chords, two places');
    const pairs = [...card.body.matchAll(/\{c:([A-Za-z0-9#]+)\}: (\S+) and (\S+?)\./g)].map((m) => [m[1], m[2], m[3]] as const);
    expect(pairs.map((p) => p[0])).toEqual(['G', 'C', 'Am', 'Bm', 'D7', 'E7']);
    for (const [chord, a, b] of pairs) {
      for (const shape of [a, b]) {
        expect(sym(shape), `${chord} ${shape}`).toBe(chord);
        expect(() => buildVoicing(chord, shape), `${chord} ${shape}`).not.toThrow();
      }
      expect(a, chord).not.toBe(b);
    }
    // The two play-chord steps are shapes from the card.
    const plays = lesson('elena-audition').steps.filter((s) => (s as { type?: string }).type === 'play-chord') as Array<{ chord: string; frets: string | (number | null)[] }>;
    const asText = (f: string | (number | null)[]) => (typeof f === 'string' ? f : f.map((x) => (x === null ? 'x' : String(x))).join('-'));
    expect(plays.map((p) => [p.chord, asText(p.frets)])).toEqual([['C', 'x35553'], ['E7', 'x79797']]);
    for (const p of plays) expect(identifyFretted(asText(p.frets)).symbol, p.chord).toBe(p.chord);
  });

  it('measures what the audition card names: five items, with the F to Bb changes under the chords', () => {
    const match = step<{ pairs: Array<{ left: string; right: string }> }>('elena-audition', (x) => x.type === 'match-pairs');
    expect(match.pairs.map((p) => p.left)).toEqual(['Five C major positions', 'Six chords, two places', '{c:F} to {c:Bb} changes', 'Travis pattern', 'Eight bars at sight', 'A chorus of improvising']);
    // The improvising item is counted in boxes, and the jam task asks for that number.
    expect(match.pairs[5].right).toBe('Boxes reached, out of 5');
    expect(plain(task('audition-jam').body)).toMatch(/how many you reached/);
    // The Travis task measures the top tempo: up as well as down.
    expect(plain(task('audition-travis').body)).toMatch(/raise it if it holds/);
  });

  it('sends the chord trainer F to Bb, the shapes the words name', () => {
    const v = viewFromParams(task('audition-changes').params ?? []);
    expect(v.view === 'trainer' ? v.chords : null).toEqual(['F', 'Bb']);
    expect([sym('133211'), sym('x13331')]).toEqual(['F', 'Bb']);
  });

  it('opens Travis Picking on its first eight bars, C, Am and G7, at 80 BPM', async () => {
    const s = await song('st-travis-picking');
    expect(s.tempo[0].bpm).toBe(80);
    expect(task('audition-travis').params).toEqual(['st-travis-picking', 'm1-8']);
    const inBar = (bar: number) => s.chords.filter((c) => c.bar === bar).map((c) => c.symbol);
    const firstEight = new Set(Array.from({ length: 8 }, (_, i) => inBar(i)).flat());
    expect(firstEight).toEqual(new Set(['C', 'Am', 'G7']));
  });

  it('reads bars 9 to 16 of the second-position study, and asks for the note that really ends bar 12', async () => {
    const s = await song('st-read-second-position');
    expect(task('audition-reading').params).toEqual(['st-read-second-position', 'm9-16', 't79']);
    const bar12 = s.tracks[0].measures[11].beats.filter((b) => b.notes.length > 0);
    const last = bar12[bar12.length - 1];
    const read = step<{ note: string; key: string }>('elena-audition', (x) => x.type === 'staff-read');
    expect(last.notes[0].midi).toBe(54); // F#3
    expect(read.note).toBe('F#3');
    expect(last.duration).toBe(1920); // a half note
    expect(noteAt({ string: last.notes[0].string, fret: last.notes[0].fret }, { octave: true, context: { key: 'F# minor' } })).toBe('F#3');
    expect([last.notes[0].string, last.notes[0].fret]).toEqual([4, 4]);
  });

  it('jams on the 12-bar blues in A', () => {
    const a = parseAddress(task('audition-jam').params ?? []);
    expect(a.view).toBe('jam');
    if (a.view !== 'jam') return;
    expect(new Set(progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol))).toEqual(new Set(['A7', 'D7', 'E7']));
  });

  it('does the ladder arithmetic of the deliberate-practice lesson on the Technique screen\'s own ladder', () => {
    const e = getExercise('tech-string-crossing')!;
    expect(e.tempo).toEqual({ start: 60, step: 4, goal: 120 });
    const q = step<{ answer: { value: number }; prompt: string }>('deliberate-practice', (x) => x.type === 'type-answer');
    expect(q.prompt).toContain('96 BPM');
    // The screen's rule (features/technique/model/ladder.ts): one pass that is not clean stays, the second steps back one rung.
    const once = afterPass({ tempo: 96, missesHere: 0 }, 'not-yet', e.tempo);
    expect(once.state.tempo).toBe(96);
    const twice = afterPass(once.state, 'not-yet', e.tempo);
    expect(twice.move).toBe('down');
    expect(q.answer.value).toBe(twice.state.tempo);
    expect(q.answer.value).toBe(92);
    // A clean pass climbs one rung.
    expect(afterPass({ tempo: 96, missesHere: 0 }, 'clean', e.tempo).state.tempo).toBe(100);
    // The card and the task describe that rule, not "two rungs back after one failure".
    const card = step<{ body: string }>('deliberate-practice', (x) => x.title === 'The ladder');
    expect(card.body).toMatch(/two passes in a row that are not clean send you back one/);
    expect(plain(task('climb-ladder').body)).not.toMatch(/two rungs/);
    expect(card.body).not.toMatch(/two rungs/);
  });

  it('teaches the string-crossing and chromatic notes the neck really has', () => {
    expect([noteAt({ string: 3, fret: 5 }, { octave: false }), noteAt({ string: 2, fret: 5 }, { octave: false })]).toEqual(['C', 'E']);
    const phrase = step<{ notes: Array<{ string: number; fret: number }> }>('picking-hygiene', (x) => x.type === 'play-phrase');
    const names = phrase.notes.map((n) => noteAt(n, { octave: false, context: { prefer: 'sharps' } }));
    expect(names).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G']);
    expect(getExercise('tech-hands-in-sync')!.tempo.start).toBe(40);
  });

  it('teaches G major pattern 1 exactly as the engine and the technique exercises finger it', () => {
    expect(G_3NPS_1.notes.map(pos)).toEqual(G_MAJOR_3NPS.map((n) => `${n.s}:${n.f}`));
    expect([G_3NPS_1.minFret, G_3NPS_1.maxFret]).toEqual([3, 8]);
    const first = G_3NPS_1.notes[0];
    const last = G_3NPS_1.notes[G_3NPS_1.notes.length - 1];
    expect([pos(first), first.note, pos(last), last.note]).toEqual(['6:3', 'G', '1:8', 'C']);
    expect(G_3NPS_1.notes.filter((n) => n.isRoot).map(pos)).toEqual(['6:3', '4:5', '2:8']);
    // Every note per string: three.
    for (let s = 1; s <= 6; s++) expect(G_3NPS_1.notes.filter((n) => n.string === s), `string ${s}`).toHaveLength(3);
  });

  it('puts the E-shape G at the bottom of pattern 1, as the card says', () => {
    const g = buildVoicing('G', '355433');
    const inPattern = new Set(G_3NPS_1.notes.map(pos));
    const chordPositions = g.notes.map(pos);
    expect(chordPositions.filter((p) => inPattern.has(p))).toEqual(['6:3', '5:5', '4:5', '3:4']);
    expect(chordPositions.filter((p) => !inPattern.has(p))).toEqual(['2:3', '1:3']);
    // The pattern on strings 2 and 1 sits at frets 5 to 8.
    const top = G_3NPS_1.notes.filter((n) => n.string <= 2).map((n) => n.fret);
    expect([Math.min(...top), Math.max(...top)]).toEqual([5, 8]);
    // Every G between frets 3 and 8: the pattern's three roots and the chord's string 1 fret 3.
    const gs: string[] = [];
    for (let s = 1; s <= 6; s++) for (let f = 3; f <= 8; f++) if (noteAt({ string: s, fret: f }, { octave: false }) === 'G') gs.push(`${s}:${f}`);
    expect(gs.sort()).toEqual(['1:3', '2:8', '4:5', '6:3']);
  });

  it('places patterns 2 and 3 and the CAGED positions where the task says', () => {
    const three = scalePatterns('G', 'major', { system: '3nps' });
    const range = (id: string) => {
      const p = three.find((x) => x.id === id)!;
      return [p.minFret, p.maxFret];
    };
    expect(range('3nps-2')).toEqual([5, 10]);
    expect(range('3nps-3')).toEqual([7, 12]);
    const caged = scalePatterns('G', 'major');
    const shape = (id: string) => {
      const p = caged.find((x) => x.id === id)!;
      return [p.minFret, p.maxFret];
    };
    expect(shape('caged-d')).toEqual([4, 8]);
    expect(shape('caged-c')).toEqual([7, 10]);
    expect(shape('caged-a')).toEqual([9, 13]);
    expect(plain(task('g-patterns-2-3').body)).toContain('A-shape (9 to 13)');
    // Pattern 1's lowest strings span frets 3 to 7: the stretch the task warns about.
    const low = G_3NPS_1.notes.filter((n) => n.string >= 5).map((n) => n.fret);
    expect([Math.min(...low), Math.max(...low)]).toEqual([3, 7]);
    expect(plain(task('g-pattern-1').body)).toMatch(/aches, stop/);
    expect(parseScaleParams(task('g-pattern-1').params ?? [])).toEqual({ tonic: 'G', scale: 'major', shape: '3nps-1' });
    expect(parseScaleParams(task('g-patterns-2-3').params ?? [])).toEqual({ tonic: 'G', scale: 'major', shape: '3nps-2' });
  });

  it('starts the all-keys routine on the first three keys of its circle, at the bottom of its ladder', () => {
    expect(MAJOR_KEYS.slice(0, 3)).toEqual(['C', 'G', 'D']);
    expect(getExercise('tech-all-keys-scales')!.tempo.start).toBe(80);
  });

  it('sends the timing tasks to drills and settings that exist', () => {
    expect(DRILLS.some((d) => d.id === task('offbeat-drill').params?.[1] && d.kind === 'offbeat')).toBe(true);
    const parts = getExercise('tech-metronome-2-4')!.parts.map((p) => p.click);
    expect(parts).toEqual(['backbeat', 'offbeat']);
    // The plan's "click on the offbeats only" is that exercise's second part, and the task sends the learner to it.
    expect(plain(task('click-two-four').body)).toMatch(/second part, the click only on the and/);
    expect(plain(task('offbeat-drill').body)).toMatch(/three stars/);
    expect(midiAt({ string: 4, fret: 4 })).toBe(54);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});
