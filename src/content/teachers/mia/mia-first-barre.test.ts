/**
 * Cross-checks for Mia's unit 10 (Your first barre chord) against the engines and the song library:
 * every shape and the note under each finger the cards name, the fingerings of the chord library,
 * the fingers that stay or move between Am and Fmaj7, C and the small F, C and G7, the full F as the
 * E shape one fret up and Bm as the Am shape two frets up, the chords of C major and D major, the
 * verse of Auld Lang Syne and its bass notes against the library's song (whose chart has the open
 * Bm7 where the lesson asks for the barre Bm), the strum-once rule of the bass-following
 * microphone steps, the change studies, the jam fallback, the chord trainer addresses and the BPM
 * of every Player task.
 * Run with `npx vitest run src/content/teachers/mia/mia-first-barre.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { chordVoicings, identifyFretted, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, diatonicChords, scaleNotes } from '@/core/theory';
import { viewFromParams } from '@/features/chords/model/symbols';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileLesson, isTaskStep, loadTeacherCourse, taskSong } from '../index';
import type { RichText, TeacherLesson, TeacherUnit } from '../types';
import unit from './mia-first-barre';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const stepsOf = <T>(l: string, type: string) => lesson(l).steps.filter((s) => (s as { type?: string }).type === type) as T[];
const at = (string: number, fret: number, chord?: string) => noteAt({ string, fret }, { octave: false, ...(chord ? { context: { chord } } : {}) });
const symbols = (text: string) => [...text.matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]);

/** The chord library's shape and fingering of a chord at an index, as `x32010` strings. */
function libraryShape(chord: string, index = 0): { frets: string; fingers: string } {
  const v = chordVoicings(chord)[index];
  return { frets: v.frets.map((f) => (f === null ? 'x' : String(f))).join(''), fingers: v.fingers.map((f) => (f === null ? 'x' : String(f))).join('') };
}

/** Where each finger sits in a shape: `{ 1: ['2:1'], 3: ['4:3'] }` (a barre finger has several places). */
function fingerPlaces(frets: string, fingers: string): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  [...fingers].forEach((f, i) => {
    if (f >= '1' && f <= '4') (out[Number(f)] ??= []).push(`${6 - i}:${frets[i]}`);
  });
  return out;
}

/** Every fretted string of a shape moved by `n` frets (open strings become the barre). */
function shift(frets: string, n: number): string {
  return [...frets].map((f) => (f === 'x' ? 'x' : String(Number(f) + n))).join('');
}

/** The chord symbols of each bar of a song (the one in force at the bar line first). */
function chordsByBar(s: Song): string[][] {
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  return s.bars.map((_, i) => {
    const start = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    const inside = events.filter((e) => e.bar === i && e.tick > 0).map((e) => e.symbol);
    return [...(start ? [start.symbol] : []), ...inside];
  });
}

/** Problems with the tempos the Player tasks name (see mia-power-chords.test.ts). */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const step of l.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id || !songEntry(id)) continue;
      const bpm = (await song(id)).tempo[0].bpm;
      const pctParam = (step.params ?? []).find((p) => /^t\d+$/.test(p));
      const pct = pctParam ? Number(pctParam.slice(1)) : 100;
      let text = plain(step.body);
      for (const m of text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)) {
        const want = (bpm * Number(m[1])) / 100;
        if (Math.abs(want - Number(m[2])) > 1) out.push(`${l.id} > ${step.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
      }
      text = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '');
      const first = text.match(/(\d+) BPM/);
      if (!first) {
        out.push(`${l.id} > ${step.id}: names no BPM`);
        continue;
      }
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Mia unit 10: Your first barre chord', () => {
  it('passes the lesson engine with no error and no warning, in the whole course', async () => {
    const tc = await loadTeacherCourse('mia');
    const problems = validateCourse(tc.course).filter((p) => p.unit === unit.id);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(120);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(310);
    }
  });

  it('names every shape and the note under each finger as the neck has them', () => {
    for (const [shape, sym] of [['xx3210', 'Fmaj7'], ['xx3211', 'F'], ['133211', 'F'], ['320001', 'G7'], ['x24432', 'Bm'], ['x02210', 'Am'], ['x32010', 'C'], ['022100', 'E']]) {
      expect(identifyFretted(shape).symbol, shape).toBe(sym);
    }
    expect([at(4, 3), at(3, 2), at(2, 1), at(1, 0)]).toEqual(['F', 'A', 'C', 'E']); // Fmaj7
    expect([at(2, 1), at(1, 1)]).toEqual(['C', 'F']); // the small F's two-string barre
    expect(at(1, 1)).toBe('F'); // G7's finger 1
    expect(chordNotes('G7')).toEqual(['G', 'B', 'D', 'F']);
    expect([at(6, 1), at(5, 3), at(4, 3), at(3, 2), at(2, 1), at(1, 1)]).toEqual(['F', 'C', 'F', 'A', 'C', 'F']); // full F
    expect([at(5, 2), at(4, 4, 'Bm'), at(3, 4), at(2, 3), at(1, 2, 'Bm')]).toEqual(['B', 'F#', 'B', 'D', 'F#']); // Bm
    // The play steps play those notes.
    const smallF = stepsOf<{ notes: TabNote[] }>('fmaj7-and-small-f', 'play-phrase')[0].notes;
    expect(smallF.map((n) => ('rest' in n ? '' : `${n.string}:${n.fret}`))).toEqual(['2:1', '1:1', '2:1', '1:1']);
  });

  it('teaches the fingerings the chord library has', () => {
    expect(libraryShape('Fmaj7')).toEqual({ frets: 'xx3210', fingers: 'xx3210' });
    expect(libraryShape('F')).toEqual({ frets: '133211', fingers: '134211' });
    expect(chordVoicings('F').map((v) => v.frets.map((f) => (f === null ? 'x' : String(f))).join(''))).toContain('xx3211');
    expect(libraryShape('G7')).toEqual({ frets: '320001', fingers: '320001' });
    expect(libraryShape('Bm')).toEqual({ frets: 'x24432', fingers: 'x13421' });
    expect(libraryShape('Am')).toEqual({ frets: 'x02210', fingers: 'x02310' });
    expect(libraryShape('C')).toEqual({ frets: 'x32010', fingers: 'x32010' });
  });

  it('moves the fingers between shapes as the lessons say', () => {
    const am = fingerPlaces('x02210', 'x02310');
    const fmaj7 = fingerPlaces('xx3210', 'xx3210');
    const c = fingerPlaces('x32010', 'x32010');
    const smallF = fingerPlaces('xx3211', 'xx3211');
    const g7 = fingerPlaces('320001', '320001');
    // Am to Fmaj7: finger 1 stays on string 2 fret 1; finger 2 to string 3 fret 2, finger 3 to string 4 fret 3.
    expect(am[1]).toEqual(fmaj7[1]);
    expect([am[2], fmaj7[2], am[3], fmaj7[3]]).toEqual([['4:2'], ['3:2'], ['3:2'], ['4:3']]);
    // C to the small F: fingers 3 and 2 each one string toward string 1, same fret; finger 1 flattens over strings 2 and 1.
    const toward1 = (p: string) => `${Number(p.split(':')[0]) - 1}:${p.split(':')[1]}`;
    expect([toward1(c[3][0]), toward1(c[2][0])]).toEqual([smallF[3][0], smallF[2][0]]);
    expect(smallF[1].sort()).toEqual(['1:1', '2:1']);
    // C to G7: the 3-2 pair one string toward string 6, finger 1 from string 2 fret 1 to string 1 fret 1.
    const toward6 = (p: string) => `${Number(p.split(':')[0]) + 1}:${p.split(':')[1]}`;
    expect([toward6(c[3][0]), toward6(c[2][0])]).toEqual([g7[3][0], g7[2][0]]);
    expect([c[1], g7[1]]).toEqual([['2:1'], ['1:1']]);
  });

  it('makes the full F the E shape one fret up, and Bm the Am shape two frets up', () => {
    expect(shift('022100', 1)).toBe('133211');
    expect(shift('x02210', 2)).toBe('x24432');
    // The fingers in front of the barre are the open chord's fingers, plus one.
    const f = fingerPlaces('133211', '134211');
    expect([f[3], f[4], f[2]]).toEqual([['5:3'], ['4:3'], ['3:2']]);
    expect([at(5, 3), at(4, 3), at(3, 2)]).toEqual(['C', 'F', 'A']);
    expect(f[1].sort()).toEqual(['1:1', '2:1', '6:1']);
    const bm = fingerPlaces('x24432', 'x13421');
    expect([bm[3], bm[4], bm[2]]).toEqual([['4:4'], ['3:4'], ['2:3']]);
  });

  it('places the chords in C major and D major where the lessons say', () => {
    const c = Object.fromEntries(diatonicChords('C major').map((ch) => [ch.roman, ch.symbol]));
    expect([c.I, c.IV, c.V, c.vi]).toEqual(['C', 'F', 'G', 'Am']);
    const pairs = stepsOf<{ pairs: Array<{ left: string; right: string }> }>('f-in-the-key-of-c', 'match-pairs')[0].pairs;
    for (const p of pairs) expect(`{c:${c[p.left.slice(3, -1)]}}`, p.left).toBe(p.right);
    const d = Object.fromEntries(diatonicChords('D major').map((ch) => [ch.roman, ch.symbol]));
    expect(d.vi).toBe('Bm');
    expect(scaleNotes('D', 'major')[5]).toBe('B');
    // The bass notes of C, Am, F (the barre) and G in the play step are the roots.
    const bass = stepsOf<{ notes: TabNote[] }>('f-in-the-key-of-c', 'play-phrase')[0].notes;
    expect(bass.map((n) => ('rest' in n ? '' : at(n.string, n.fret)))).toEqual(['C', 'A', 'F', 'G']);
    // The C to G7 bass line alternates C and G.
    const cg7 = stepsOf<{ notes: TabNote[] }>('la-cucaracha', 'play-phrase')[0].notes;
    expect(cg7.map((n) => ('rest' in n ? '' : at(n.string, n.fret)))).toEqual(['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G']);
  });

  it('writes the verse of Auld Lang Syne in D major, and follows its bass notes in the show', async () => {
    const verse = ['D', 'A', 'D', 'G', 'D', 'A', 'Bm', 'D'];
    const inD = new Set(diatonicChords('D major').map((ch) => ch.symbol));
    for (const ch of verse) expect(inD.has(ch), ch).toBe(true);
    const l = lesson('auld-lang-syne');
    const show = l.steps.find((s) => (s as { id?: string }).id === 'show') as { notes: TabNote[]; alternative: { tiles: string[] } };
    expect(show.notes.map((n) => ('rest' in n ? '' : at(n.string, n.fret)))).toEqual(verse.map((ch) => chordNotes(ch)[0]));
    expect(show.alternative.tiles.flatMap(symbols)).toEqual(verse);
    const chart = l.steps.find((s) => (s as { title?: string }).title === 'The chords, one a bar') as { body: string };
    expect(symbols(chart.body).slice(0, 8)).toEqual(verse);
    const blanks = stepsOf<{ text: string; blanks: string[] }>('auld-lang-syne', 'fill-blanks')[0];
    let i = 0;
    const filled = blanks.text.replace(/___/g, () => blanks.blanks[i++]);
    expect(symbols(filled)).toEqual(verse);
  });

  it('follows the library\'s Auld Lang Syne, with the barre Bm where its chart has the open Bm7', async () => {
    expect(songEntry('auld-lang-syne')).toBeTruthy();
    const s = await song('auld-lang-syne');
    expect(s.tempo[0].bpm).toBe(80);
    // The pickup bar is silent for the strummer; then verse and chorus, one chord a bar.
    const full = chordsByBar(s).filter((_, b) => s.bars[b].length === undefined);
    expect(full.length).toBe(16);
    const chart = full.map((b) => b[0]);
    const verse = ['D', 'A', 'D', 'G', 'D', 'A', 'Bm', 'D'];
    const asTaught = chart.map((c) => (c === 'Bm7' ? 'Bm' : c));
    expect(asTaught.slice(0, 8), 'the verse').toEqual(verse);
    expect(asTaught.slice(8), 'the chorus uses the same eight chords').toEqual(verse);
    // Bm fits wherever the chart has Bm7: the same root, and every note of Bm is in Bm7.
    expect(chordNotes('Bm')[0]).toBe(chordNotes('Bm7')[0]);
    expect(chordNotes('Bm').every((n) => chordNotes('Bm7').includes(n))).toBe(true);
    const shapes = new Set(s.chords.filter((c) => c.symbol === 'Bm7' && c.voicing).map((c) => (c.voicing as Array<number | null>).map((f) => (f === null ? 'x' : String(f))).join('')));
    expect([...shapes]).toEqual(['x20202']);
    // The lesson says so where the learner meets the chart, and in the Player task.
    const l = lesson('auld-lang-syne');
    const chartCard = l.steps.find((st) => (st as { title?: string }).title === 'The chords, one a bar') as { body: string };
    expect(symbols(chartCard.body).slice(0, 8)).toEqual(verse);
    expect(chartCard.body).toContain('{c:Bm7}');
    expect(chartCard.body).toMatch(/play your barre \{c:Bm\} there instead/);
    const task = l.steps.find((st) => isTaskStep(st) && st.id === 'auld-lang-syne-play');
    expect(task && isTaskStep(task) && task.params?.[0]).toBe('auld-lang-syne');
    if (!task || !isTaskStep(task)) return;
    expect(plain(task.body)).toMatch(/Where it says \{c:Bm7\}, play your barre \{c:Bm\}/);
    // The song is in the library, so the task needs no stand-in, and the unit's show links it.
    expect(task.fallback).toBeUndefined();
    expect(unit.milestone?.song).toBe('auld-lang-syne');
    // The celebration claims only what the microphone heard: the verse's bass, not its timing.
    expect(unit.milestone?.celebrate).toMatch(/the verse of Auld Lang Syne/);
    expect(unit.milestone?.celebrate).not.toMatch(/on time/);
  });

  it('asks for one strum per chord wherever the microphone follows the bass of a strummed chord', () => {
    // The phrase listener stops once it hears clearly more notes than the phrase has, so a
    // learner strumming every beat would fail: each such step says to strum each chord once.
    const once = /one strum each|strum each chord once/i;
    for (const l of unit.lessons) {
      const steps = l.steps;
      steps.forEach((s, i) => {
        const ex = s as { type?: string; octave?: string; prompt?: string };
        if (ex.type !== 'play-phrase' || ex.octave !== 'any') return;
        const before = steps[i - 1] as { body?: string } | undefined;
        expect(once.test(ex.prompt ?? '') || once.test(before?.body ?? ''), `${l.id} > step ${i}`).toBe(true);
      });
    }
  });

  it('describes the change studies as the library has them', async () => {
    const change = await song('st-change-am-fmaj7-c-f');
    expect(change.tempo[0].bpm).toBe(72);
    const bars = chordsByBar(change);
    expect(new Set(bars.slice(0, 8).flat())).toEqual(new Set(['Am', 'Fmaj7']));
    expect(new Set(bars.slice(8, 16).flat())).toEqual(new Set(['C', 'F']));
    const shapeOf = (s: Song, sym: string) => [...new Set(s.chords.filter((c) => c.symbol === sym && c.voicing).map((c) => (c.voicing as Array<number | null>).map((f) => (f === null ? 'x' : String(f))).join('')))];
    expect(shapeOf(change, 'F')).toEqual(['xx3211']);
    const barre = await song('st-barre-f');
    expect(barre.tempo[0].bpm).toBe(72);
    expect(new Set(chordsByBar(barre).flat())).toEqual(new Set(['C', 'F', 'Am']));
    expect(shapeOf(barre, 'F')).toEqual(['133211']);
  });

  it('opens the chord trainer on the chords each task names', () => {
    for (const l of unit.lessons) {
      for (const step of l.steps) {
        if (!isTaskStep(step) || step.tool !== 'chords') continue;
        const view = viewFromParams(step.params ?? []);
        expect(view.view, step.id).toBe('trainer');
        // "One minute of {c:C} to {c:F} and back": the first pair the body names.
        expect((view as { chords: string[] }).chords, step.id).toEqual(symbols(plain(step.body)).slice(0, 2));
      }
    }
  });

  it('falls back to a jam on the same chords while La Cucaracha is missing', () => {
    const chords = (id: string, key: string) => [...new Set(progressionInKey(id, key).bars.flat().map((ch) => ch.symbol))];
    expect(chords('folk-i-iv-i-v', 'C')).toEqual(['C', 'F', 'G']);
    expect(chords('fifties-i-vi-iv-v', 'C')).toEqual(['C', 'Am', 'F', 'G']);
    // G7 is G with one note added, so it fits where the band plays G.
    expect(chordNotes('G7').slice(0, 3)).toEqual(chordNotes('G'));
    for (const l of unit.lessons) {
      for (const step of l.steps) {
        if (!isTaskStep(step)) continue;
        const id = taskSong(step);
        if (id && !songEntry(id)) expect(step.fallback, `${l.id} > ${step.id}`).toBeTruthy();
      }
    }
  });

  it('falls back to the C and G7 half of the change study for La Cucaracha', async () => {
    const task = lesson('la-cucaracha').steps.find((s) => (s as { id?: string }).id === 'cucaracha') as { fallback: { tool: string; params: string[]; body: string } };
    expect(task.fallback.tool).toBe('player');
    expect(task.fallback.params).toEqual(['st-change-g-c-c-g7', 'm9-16', 't83']);
    const study = await song('st-change-g-c-c-g7');
    expect(new Set(chordsByBar(study).slice(8, 16).flat())).toEqual(new Set(['C', 'G7']));
    // "about 60 BPM, then at 100 % (72 BPM)": 83 % of the study's 72 BPM.
    expect(study.tempo[0].bpm).toBe(72);
    expect(Math.round((72 * 83) / 100)).toBe(60);
    expect(task.fallback.body).toContain('100 % (72 BPM)');
  });

  it('names a BPM in every Player task that the task really opens at', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});
