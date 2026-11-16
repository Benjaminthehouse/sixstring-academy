/**
 * Cross-checks for Dev's unit 1 (Barre chords that move) against the engines and the song library:
 * every shape the cards name (built and identified by the guitar engine), the roots under finger 1,
 * the natural notes on strings 6 and 5, the minor versions, the keys and progressions, the Canon's
 * ground bass, the study bars each Player task opens, the jams the fallbacks lead to, the chord
 * trainer addresses, and the BPM every Player task names. Run with
 * `npx vitest run src/content/teachers/dev/dev-barre-chords.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { buildVoicing, identifyFretted, midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, harmonizeScale, progressionToChords, scaleNotes, semitones, intervalBetween } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type PlayPhraseExercise } from '@/lessons';
import { viewFromParams } from '@/features/chords/model/symbols';
import { parseAddress } from '@/features/progressions/model/address';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit from './dev-barre-chords';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

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

/** Every chord symbol in each bar of a track (the chord in force at the bar line and any that start in it). */
function chordsInBars(s: Song): string[][] {
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  return s.bars.map((_, i) => {
    const start = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    const inside = events.filter((e) => e.bar === i && e.tick > 0).map((e) => e.symbol);
    return [...(start ? [start.symbol] : []), ...inside];
  });
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

const course = compileCourse(courseMeta('dev'), [unit]);
const at = (string: number, fret: number, chord?: string) => noteAt({ string, fret }, { context: chord ? { chord } : undefined, octave: false });
const sym = (frets: string) => identifyFretted(frets).symbol;

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Dev unit 1: Barre chords that move', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window, and the whole lesson near the plan', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
      expect(Math.abs(l.minutes - s / 60), `${l.id}: minutes ${l.minutes}, estimated ${(s / 60).toFixed(1)}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('names every barre shape for what it sounds', () => {
    const shapes: Array<[string, string]> = [
      ['133211', 'F'], ['355433', 'G'], ['577655', 'A'], ['133111', 'Fm'], ['355333', 'Gm'], ['577555', 'Am'], ['8-10-10-9-8-8', 'C'], ['799777', 'Bm'],
      ['x13331', 'Bb'], ['x24442', 'B'], ['x35553', 'C'], ['x24432', 'Bm'], ['x35543', 'Cm'], ['x57775', 'D'], ['10-12-12-11-10-10', 'D'],
      ['244222', 'F#m'], ['x-5-7-7-6-5', 'Dm'], ['x20202', 'Bm7'], ['020100', 'E7'],
    ];
    for (const [frets, chord] of shapes) {
      expect(sym(frets), frets).toBe(chord);
      expect(() => buildVoicing(chord, frets), frets).not.toThrow();
    }
  });

  it('puts the root under finger 1 on string 6 (E shapes) and string 5 (A shapes)', () => {
    expect([at(6, 1), at(6, 3), at(6, 5), at(6, 7), at(6, 8), at(6, 10)]).toEqual(['F', 'G', 'A', 'B', 'C', 'D']);
    expect([at(5, 1, 'Bb'), at(5, 2), at(5, 3), at(5, 5)]).toEqual(['Bb', 'B', 'C', 'D']);
    // The fretboard-find answers: A2 at string 6 fret 5, G2 at fret 3, C3 at fret 8; C3 at string 5 fret 3, B2 at fret 2.
    expect(midiAt({ string: 6, fret: 5 })).toBe(45);
    expect(midiAt({ string: 6, fret: 3 })).toBe(43);
    expect(midiAt({ string: 6, fret: 8 })).toBe(48);
    expect(midiAt({ string: 5, fret: 3 })).toBe(48);
    expect(midiAt({ string: 5, fret: 2 })).toBe(47);
    // D3 sits at string 5 fret 5 and string 6 fret 10, and nowhere else on those strings below fret 13.
    expect([midiAt({ string: 5, fret: 5 }), midiAt({ string: 6, fret: 10 })]).toEqual([50, 50]);
  });

  it('lists the natural notes on strings 6 and 5 as the neck has them', () => {
    const naturals = (string: number, from: number) =>
      Array.from({ length: 13 - from }, (_, i) => from + i)
        .map((f) => ({ f, n: at(string, f) }))
        .filter((x) => x.n.length === 1)
        .map((x) => `${x.n}${x.f}`);
    expect(naturals(6, 1)).toEqual(['F1', 'G3', 'A5', 'B7', 'C8', 'D10', 'E12']);
    expect(naturals(5, 2)).toEqual(['B2', 'C3', 'D5', 'E7', 'F8', 'G10', 'A12']);
  });

  it('makes each barre minor by lowering its third one fret', () => {
    // E shape: the third on string 3 under finger 2 (G: string 3 fret 4 = B); lifted, the barre plays Bb.
    expect(at(3, 4, 'G')).toBe(chordNotes('G')[1]);
    expect(at(3, 3, 'Gm')).toBe(chordNotes('Gm')[1]);
    // A shape: the third on string 2 (C: string 2 fret 5 = E, Cm: fret 4 = Eb).
    expect(at(2, 5, 'C')).toBe(chordNotes('C')[1]);
    expect(at(2, 4, 'Cm')).toBe(chordNotes('Cm')[1]);
    // Dm in the Am shape at fret 5: string 2 fret 6 is F, the minor third.
    expect(at(2, 6, 'Dm')).toBe('F');
    expect(chordNotes('Bm')).toEqual(['B', 'D', 'F#']);
  });

  it('spells the progressions and keys the cards name', () => {
    expect(progressionToChords('I vi IV V', 'A')).toEqual(['A', 'F#m', 'D', 'E']);
    expect(progressionToChords('I vi IV V', 'C')).toEqual(['C', 'Am', 'F', 'G']);
    expect(harmonizeScale('A', 'major').map((c) => c.symbol)).toEqual(['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim']);
    expect(harmonizeScale('D', 'major')[5].symbol).toBe('Bm');
    expect(harmonizeScale('D', 'major').map((c) => c.symbol).slice(0, 5)).toEqual(['D', 'Em', 'F#m', 'G', 'A']);
    expect(scaleNotes('D', 'major')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    // E7 is outside D major (G#), and G# is a half step under A.
    expect(chordNotes('E7')).toEqual(['E', 'G#', 'B', 'D']);
    expect(scaleNotes('D', 'major')).not.toContain('G#');
    expect(semitones(intervalBetween('G#', 'A'))).toBe(1);
  });

  it('teaches the Canon ground bass as the library has it', async () => {
    const s = await song('canon-in-d');
    const part = s.tracks[0];
    const bass = part.measures.slice(0, 2).flatMap((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => b.notes[0].midi));
    const show = lesson('barre-progressions').steps.find((x) => (x as { type?: string }).type === 'play-phrase') as PlayPhraseExercise;
    expect(phraseMidi(show)).toEqual(bass);
    expect(phraseMidi(show).map((m) => at(...positionOf(show, m)))).toEqual(['D', 'A', 'B', 'F#', 'G', 'D', 'G', 'A']);
    expect(s.tempo[0].bpm).toBe(60);
    // The chords half: D A Bm7 F#m G D G A.
    const bars = chordsInBars(s);
    expect(bars[8]).toEqual(['D', 'A', 'Bm7', 'F#m', 'G', 'D', 'G', 'A'].slice(0, 4));
    expect(bars[9]).toEqual(['G', 'D', 'G', 'A']);
  });

  it('opens the study bars the Player tasks describe', async () => {
    const shapes = chordsInBars(await song('st-barre-shapes'));
    expect(shapes.slice(0, 6).map((b) => b[0])).toEqual(['F', 'G', 'A', 'Fm', 'Gm', 'Am']);
    expect(shapes.slice(6, 11).map((b) => b[0])).toEqual(['Bb', 'B', 'C', 'Bm', 'Cm']);
    expect(task('barre-shapes-e').params).toEqual(['st-barre-shapes', 'm1-6', 't75']);
    expect(task('barre-shapes-a').params).toEqual(['st-barre-shapes', 'm7-11', 't75']);
    const prog = chordsInBars(await song('st-barre-progression'));
    expect(new Set(prog.slice(0, 8).flat())).toEqual(new Set(['A', 'F#m', 'D', 'E']));
    expect(new Set(prog.slice(8, 16).flat())).toEqual(new Set(['C', 'Am', 'F', 'G']));
    const s = await song('st-barre-progression');
    const shapeOf = (symbol: string) => s.chords.find((c) => c.symbol === symbol)?.voicing;
    expect([shapeOf('F#m'), shapeOf('C'), shapeOf('Am'), shapeOf('F'), shapeOf('G')].map((f) => f && f.map((x) => (x === null ? 'x' : x)).join(''))).toEqual(['244222', 'x35553', '577555', '133211', '355433']);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('sends the chord trainer the changes the words name', () => {
    const trainer = (id: string) => {
      const v = viewFromParams(task(id).params ?? []);
      return v.view === 'trainer' ? v.chords : null;
    };
    expect(trainer('changes-g-c')).toEqual(['G', 'C']);
    expect(trainer('changes-am-f')).toEqual(['Am', 'F']);
    expect(trainer('changes-a-f-sharp-m')).toEqual(['A', 'F#m']);
    expect(trainer('changes-f-b-flat')).toEqual(['F', 'Bb']);
  });

  it('falls back to jams on the planned chords while the songs are missing', () => {
    const jam = (id: string) => {
      const a = parseAddress(task(id).fallback!.params ?? []);
      expect(a.view, id).toBe('jam');
      if (a.view !== 'jam') return [];
      return progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol);
    };
    expect([...new Set(jam('loch-lomond'))]).toEqual(['D', 'Bm', 'G', 'A']);
    expect(jam('waltzing-matilda')).toEqual(['D', 'D', 'E7', 'E7', 'A7', 'A7', 'D', 'D']);
    for (const id of ['loch-lomond', 'waltzing-matilda']) {
      const t = task(id);
      if (songEntry(taskSong(t)!)) continue;
      expect(t.fallback, id).toBeTruthy();
    }
  });
});

/** The position of a phrase note (first match), for naming it. */
function positionOf(ex: PlayPhraseExercise, midi: number): [number, number] {
  const n = ex.notes.find((x) => 'string' in x && midiAt({ string: x.string, fret: x.fret }) === midi) as { string: number; fret: number };
  return [n.string, n.fret];
}
