/**
 * Cross-checks for Dev's unit 2 (CAGED: one chord, five places) against the engines and the song
 * library: every grip the cards name (built and identified by the guitar engine) and the CAGED shape
 * the engine sees in it, where each shape puts its roots, every root the quizzes ask for, the order
 * the shapes climb, the triad inversions and the top-note melody, the triads of G major, the study
 * bars and jams the tasks open, the milestone show, and the fallbacks for the songs still missing.
 * Run with `npx vitest run src/content/teachers/dev/dev-caged.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { buildVoicing, cagedShapeOfRoots, identifyFretted, midiAt, noteAt, parseFrets, positionsForPitchClass } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, harmonizeScale, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type FretboardFindExercise, type PlayPhraseExercise } from '@/lessons';
import { parseAddress } from '@/features/progressions/model/address';
import { drillById, drillPlan } from '@/features/fretboard/core/drills';
import { defaultSettings } from '@/features/fretboard/core/settings';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit from './dev-caged';

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function plain(text: RichText): string {
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

/** Problems with the tempos the Player tasks name: "about N BPM" first, "100 % (M BPM)" after. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const step of tasks(u)) {
    const id = taskSong(step);
    if (!id || !songEntry(id)) continue;
    const bpm = (await song(id)).tempo[0].bpm;
    const pctParam = (step.params ?? []).find((p) => /^t\d+$/.test(p));
    const pct = pctParam ? Number(pctParam.slice(1)) : 100;
    let text = plain(step.body);
    for (const m of text.matchAll(/(\d+) % \((\d+) BPM\)/g)) {
      if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${step.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    }
    text = text.replace(/(\d+) % \((\d+) BPM\)/g, '');
    const first = text.match(/(\d+) BPM/);
    if (!first) {
      if (pct !== 100) out.push(`${step.id}: opens at ${pct} % but names no BPM`);
      continue;
    }
    const opens = (bpm * pct) / 100;
    if (Math.abs(opens - Number(first[1])) > 1) out.push(`${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
  }
  return out;
}

/** Root positions (`string:fret`) of a grip, for a chord root. */
function roots(frets: string, root: string): string[] {
  return parseFrets(frets)
    .map((f, i) => (f === null ? '' : noteAt({ string: 6 - i, fret: f }, { octave: false }) === root ? `${6 - i}:${f}` : ''))
    .filter(Boolean);
}

/** Every position of a note inside a fretboard-find region. */
function region(ex: FretboardFindExercise): string[] {
  const target = (ex.find as { note: string }).note;
  return positionsForPitchClass(target, { minFret: ex.frets[0], maxFret: ex.frets[1] })
    .filter((p) => !ex.strings || ex.strings.includes(p.string))
    .map((p) => `${p.string}:${p.fret}`)
    .sort();
}

const course = compileCourse(courseMeta('dev'), [unit]);
const sym = (frets: string) => identifyFretted(frets).symbol;

describe('Dev unit 2: CAGED', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
      expect(Math.abs(l.minutes - s / 60), `${l.id}: minutes ${l.minutes}, estimated ${(s / 60).toFixed(1)}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('names every grip for what it sounds', () => {
    const grips: Array<[string, string]> = [
      ['x32010', 'C'], ['x02220', 'A'], ['320003', 'G'], ['022100', 'E'], ['xx0232', 'D'],
      ['x35553', 'C'], ['875558', 'C'], ['8-10-10-9-8-8', 'C'], ['x-x-10-12-13-12', 'C'], ['x-15-14-12-13-12', 'C'],
      ['355433', 'G'], ['x-x-5-7-8-7', 'G'], ['x-10-9-7-8-7', 'G'], ['x-10-12-12-12-10', 'G'],
      ['x57775', 'D'], ['x-x-7-9-10-9', 'A'], ['x-7-9-9-9-7', 'E'], ['x-12-11-9-10-9', 'A'], ['xx2454', 'E'], ['xx3565', 'F'], ['x54232', 'D'], ['577655', 'A'],
      ['xxx553', 'C'], ['xxx988', 'C/E'], ['x-x-x-12-13-12', 'C/G'], ['xxx433', 'G/B'], ['xxx775', 'D'], ['xxx787', 'G/D'],
      ['xxx543', 'Cm'], ['xxx765', 'Dm'], ['xxx555', 'Am/C'], ['xxx432', 'Bm'], ['xxx453', 'Em/B'],
    ];
    for (const [frets, chord] of grips) {
      expect(sym(frets), frets).toBe(chord);
      expect(() => buildVoicing(chord, frets), frets).not.toThrow();
    }
  });

  it('puts the roots where the cards and quizzes say', () => {
    expect(roots('x32010', 'C')).toEqual(['5:3', '2:1']);
    expect(roots('x02220', 'A')).toEqual(['5:0', '3:2']);
    expect(roots('320003', 'G')).toEqual(['6:3', '3:0', '1:3']);
    expect(roots('022100', 'E')).toEqual(['6:0', '4:2', '1:0']);
    expect(roots('xx0232', 'D')).toEqual(['4:0', '2:3']);
    // The moved shapes keep their root strings, and the engine names each CAGED shape from its roots.
    const shapeOf = (frets: string, root: string) => cagedShapeOfRoots(roots(frets, root).map((p) => ({ string: Number(p.split(':')[0]), fret: Number(p.split(':')[1]) })));
    expect(shapeOf('x57775', 'D')).toBe('A');
    expect(shapeOf('x-x-5-7-8-7', 'G')).toBe('D');
    expect(shapeOf('x-x-10-12-13-12', 'C')).toBe('D');
    expect(shapeOf('875558', 'C')).toBe('G');
    expect(shapeOf('8-10-10-9-8-8', 'C')).toBe('E');
    expect(shapeOf('x35553', 'C')).toBe('A');
    expect(shapeOf('x-15-14-12-13-12', 'C')).toBe('C');
    expect(shapeOf('x-10-9-7-8-7', 'G')).toBe('C');
    expect(shapeOf('x-10-12-12-12-10', 'G')).toBe('A');
    expect(shapeOf('x-x-7-9-10-9', 'A')).toBe('D');
    expect(shapeOf('x-7-9-9-9-7', 'E')).toBe('A');
    expect(shapeOf('x-12-11-9-10-9', 'A')).toBe('C');
    expect(shapeOf('xx2454', 'E')).toBe('D');
    expect(shapeOf('xx3565', 'F')).toBe('D');
    expect(shapeOf('x54232', 'D')).toBe('C');
    expect(shapeOf('577655', 'A')).toBe('E');
    // The C shape comes back twelve frets up.
    expect(parseFrets('x-15-14-12-13-12')).toEqual(parseFrets('x32010').map((f) => (f === null ? null : f + 12)));
  });

  it('asks fretboard-find calls whose answers are exactly the roots of the called shape', () => {
    const calls: Record<string, [string, string]> = {
      '{c:A} in the C shape': ['x-12-11-9-10-9', 'A'],
      '{c:E} in the D shape': ['xx2454', 'E'],
      '{c:G} in the C shape': ['x-10-9-7-8-7', 'G'],
      '{c:F} in the D shape': ['xx3565', 'F'],
    };
    const finds = lesson('caged-review').steps.filter((s) => (s as { type?: string }).type === 'fretboard-find') as FretboardFindExercise[];
    expect(finds).toHaveLength(Object.keys(calls).length);
    for (const ex of finds) {
      const key = Object.keys(calls).find((k) => plain(ex.prompt).startsWith(k))!;
      expect(key, plain(ex.prompt)).toBeTruthy();
      const [frets, root] = calls[key];
      expect(region(ex), key).toEqual(roots(frets, root).sort());
    }
    // The alternatives of the played calls, and of the C and G lessons.
    const alternatives = unit.lessons.flatMap((l) => l.steps)
      .map((s) => (s as { alternative?: FretboardFindExercise }).alternative)
      .filter((a): a is FretboardFindExercise => !!a && a.type === 'fretboard-find' && 'note' in a.find);
    const expected: Record<string, string[]> = {
      'the E-shape {c:C}': roots('8-10-10-9-8-8', 'C'),
      'the D-shape {c:C}': roots('x-x-10-12-13-12', 'C'),
      'the D-shape {c:G}': roots('x-x-5-7-8-7', 'G'),
      '{c:C} in the A shape': roots('x35553', 'C'),
      '{c:D} in the C shape': roots('x54232', 'D'),
      '{c:E} in the A shape': roots('x-7-9-9-9-7', 'E'),
    };
    for (const a of alternatives) {
      const key = Object.keys(expected).find((k) => plain(a.prompt).includes(k));
      expect(key, plain(a.prompt)).toBeTruthy();
      expect(region(a), key).toEqual(expected[key!].sort());
    }
    // Every C from the nut to fret 12.
    expect(positionsForPitchClass('C', { minFret: 0, maxFret: 12 }).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['1:8', '2:1', '3:5', '4:10', '5:3', '6:8']);
  });

  it('keeps the nearest C within two frets of each G', () => {
    const pairs: Array<[string, string]> = [['355433', 'x35553'], ['x-x-5-7-8-7', '875558'], ['x-10-9-7-8-7', '8-10-10-9-8-8'], ['x-10-12-12-12-10', 'x-x-10-12-13-12']];
    for (const [g, c] of pairs) {
      const lo = (f: string) => Math.min(...parseFrets(f).filter((x): x is number => x !== null && x > 0));
      expect(Math.abs(lo(g) - lo(c)), `${g} / ${c}`).toBeLessThanOrEqual(2);
      expect(sym(g)).toBe('G');
      expect(sym(c)).toBe('C');
    }
  });

  it('names the triad inversions and the top-note melody right', () => {
    const lowest = (frets: string) => identifyFretted(frets).notes[0].note;
    expect([lowest('xxx553'), lowest('xxx988'), lowest('x-x-x-12-13-12')]).toEqual(['C', 'E', 'G']);
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
    const show = lesson('triads-on-top').steps.find((s) => (s as { type?: string }).type === 'play-phrase') as PlayPhraseExercise;
    const top = phraseMidi(show).filter((_, i) => i % 3 === 2).map((m) => noteAt({ string: 1, fret: m - 64 }, { octave: false }));
    expect(top).toEqual(['G', 'G', 'A', 'B']);
    const chords = [0, 1, 2, 3].map((i) => sym(`xxx${show.notes.slice(i * 3, i * 3 + 3).map((n) => ('fret' in n ? n.fret : 0)).join('')}`));
    expect(chords).toEqual(['G/B', 'C', 'D', 'G/D']);
    // Between frets 3 and 8.
    expect(show.notes.every((n) => 'fret' in n && n.fret >= 3 && n.fret <= 8)).toBe(true);
  });

  it('fits every main chord of G major between frets 2 and 7 on strings 3 to 1', () => {
    const triads = ['xxx433', 'xxx555', 'xxx432', 'xxx553', 'xxx775', 'xxx453'];
    expect(triads.map((t) => sym(t)!.split('/')[0])).toEqual(harmonizeScale('G', 'major').slice(0, 6).map((c) => c.symbol));
    for (const t of triads) expect(parseFrets(t).every((f) => f === null || (f >= 2 && f <= 7)), t).toBe(true);
    // The minor triads: each third one fret lower.
    expect(noteAt({ string: 2, fret: 5 }, { octave: false })).toBe('E');
    expect(noteAt({ string: 2, fret: 4 }, { context: { chord: 'Cm' }, octave: false })).toBe('Eb');
    expect(noteAt({ string: 2, fret: 7 }, { octave: false })).toBe('F#');
    expect(noteAt({ string: 2, fret: 6 }, { context: { chord: 'Dm' }, octave: false })).toBe('F');
    expect(scaleNotes('G', 'major')).not.toContain('Eb');
  });

  it('plays the show as D, G and A in the shapes the card names', () => {
    const show = lesson('caged-review').steps.at(-1) as PlayPhraseExercise;
    expect(show.id).toBe('show');
    const grip = (i: number) => show.notes.slice(i * 4, i * 4 + 4) as Array<{ string: number; fret: number }>;
    const inShape = (notes: Array<{ string: number; fret: number }>, frets: string) => notes.every((n) => parseFrets(frets)[6 - n.string] === n.fret);
    expect(inShape(grip(0), 'x57775')).toBe(true);
    expect(inShape(grip(1), 'x-10-9-7-8-7')).toBe(true);
    expect(inShape(grip(2), '577655')).toBe(true);
    expect(inShape(grip(3), 'x57775')).toBe(true);
    expect(show.notes.every((n) => 'fret' in n && n.fret >= 5 && n.fret <= 10)).toBe(true);
    // Every note is a tone of its chord.
    show.notes.forEach((n, i) => {
      const chord = ['D', 'G', 'A', 'D'][Math.floor(i / 4)];
      const p = n as { string: number; fret: number };
      expect(chordNotes(chord), `${chord} ${p.string}:${p.fret}`).toContain(noteAt(p, { context: { chord }, octave: false }));
    });
    expect(phraseMidi(show)).toHaveLength(16);
  });

  it('opens the study bars the Player tasks describe', async () => {
    const s = await song('st-caged-chords');
    const shapes = s.chords.slice().sort((a, b) => a.bar - b.bar).map((c) => `${c.symbol}=${(c.voicing ?? []).map((f) => (f === null ? 'x' : f)).join('-')}`);
    expect(shapes.slice(0, 6)).toEqual(['C=x-3-2-0-1-0', 'C=x-3-5-5-5-3', 'C=8-7-5-5-5-8', 'C=8-10-10-9-8-8', 'C=x-x-10-12-13-12', 'C=x-15-14-12-13-12']);
    expect(s.bars.length).toBe(20);
    const bars = (from: number, to: number) => [...new Set(s.chords.filter((c) => c.bar >= from - 1 && c.bar <= to - 1).map((c) => c.symbol))];
    expect(bars(1, 11)).toEqual(['C']);
    expect(bars(12, 20)).toEqual(['G']);
    expect(task('caged-c-bars').params).toEqual(['st-caged-chords', 'm1-11', 't83']);
    expect(task('caged-g-bars').params).toEqual(['st-caged-chords', 'm12-20', 't83']);
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('jams on the chords the words name', () => {
    const jam = (params: string[]) => {
      const a = parseAddress(params);
      expect(a.view, params.join('--')).toBe('jam');
      if (a.view !== 'jam') return [];
      return [...new Set(progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol))];
    };
    expect(jam(task('jam-g-c').params!)).toEqual(['G', 'C']);
    expect(jam(task('jam-triads').params!)).toEqual(['G', 'C', 'D']);
    expect(jam(task('jam-key-of-g').params!)).toEqual(['G', 'Em', 'C', 'D']);
    expect(jam(task('first-noel').fallback!.params!)).toEqual(['D', 'G', 'A']);
    expect(parseAddress(task('first-noel').fallback!.params!).view === 'jam' && (parseAddress(task('first-noel').fallback!.params!) as { progression: { feel: { meter: string } } }).progression.feel.meter).toBe('3/4');
  });

  it('falls back to a library tune in G with the same chords while Simple Gifts is missing', async () => {
    const fb = task('simple-gifts').fallback!;
    expect(fb.tool).toBe('player');
    const id = fb.params![0];
    expect(songEntry(id)).toBeTruthy();
    const s = await song(id);
    expect(s.key).toMatch(/^G/);
    expect(new Set(s.chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D7']));
    expect(Math.round((s.tempo[0].bpm * Number(fb.params![1].slice(1))) / 100)).toBe(76);
    for (const id2 of ['simple-gifts', 'the-first-noel']) {
      const t = tasks(unit).find((x) => taskSong(x) === id2)!;
      if (!songEntry(id2)) expect(t.fallback, id2).toBeTruthy();
    }
  });

  // ── Added by the independent review ──────────────────────────────────────────────────────────

  it('explains slash-chord names before the first one appears', () => {
    const steps = unit.lessons.flatMap((l) => l.steps.map((s) => ({ lesson: l.id, text: JSON.stringify(s) })));
    const first = steps.find((s) => /\{c:[A-G][#b]?m?\/[A-G][#b]?\}/.test(s.text));
    expect(first?.lesson).toBe('triads-on-top');
    expect(first?.text).toContain('The slash names the bass: {c:C/E} is {c:C} with {n:E} lowest.');
    // And the claim is the engine's: in C/E the lowest note is E.
    expect(identifyFretted('xxx988').notes[0].note).toBe('E');
  });

  it('describes the Find every one round as long as the Fretboard screen makes it', () => {
    const t = task('find-every-note');
    expect(t.params).toEqual(['drill', 'find-every-note']);
    const drill = drillById(t.params?.[1]);
    expect(drill).toBeTruthy();
    const plan = drillPlan(drill!, defaultSettings());
    expect(plan.length).toBe(5);
    expect(plan.seconds).toBeNull();
    expect(plain(t.body)).toContain('five notes');
    expect(plain(t.body)).not.toMatch(/one minute/i);
  });

  it('celebrates what the unit taught: the system, any major chord in five places', () => {
    expect(plain(unit.milestone!.celebrate)).toContain('You can find any major chord in five places');
  });
});

void midiAt;
