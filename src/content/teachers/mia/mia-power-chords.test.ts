/**
 * Cross-checks for Mia's unit 9 (Power chords and the blues) against the engines and the song
 * library: every power-chord shape and the notes under its fingers, the D5 top note and the tuning
 * gap that moves it, the movable roots on strings 6 and 5, the 12-bar form and the shuffle figure
 * against the library's study, the sevenths of E7 and A7, the Open Riff bars the tasks name, Mia's
 * riff (its roots and its rhythm agree), the jam tracks, and the BPM of every Player task. Run with
 * `npx vitest run src/content/teachers/mia/mia-power-chords.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { identifyFretted, midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, scaleNotes } from '@/core/theory';
import { viewFromParams } from '@/features/chords/model/symbols';
import { estimateLessonSeconds, formatProblems, validateCourse, type Figure, type TabNote } from '@/lessons';
import { compileLesson, isTaskStep, loadTeacherCourse, taskSong } from '../index';
import type { RichText, TeacherLesson, TeacherUnit } from '../types';
import unit from './mia-power-chords';

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
const card = (l: string, title: string) => lesson(l).steps.find((s) => (s as { title?: string }).title === title) as { body: string; figure?: Figure };
const at = (string: number, fret: number) => noteAt({ string, fret }, { octave: false });

/** Problems with the tempos the Player tasks name: "about 80 BPM" must be the song's tempo times the task's percentage. */
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
        if (step.params?.includes('wait')) continue;
        out.push(`${l.id} > ${step.id}: names no BPM`);
        continue;
      }
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    }
  }
  return out;
}

/** The chord symbols of each bar of a song, in order (the one in force at the bar line first). */
function chordsByBar(s: Song): string[][] {
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  return s.bars.map((_, i) => {
    const start = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    const inside = events.filter((e) => e.bar === i && e.tick > 0).map((e) => e.symbol);
    return [...(start ? [start.symbol] : []), ...inside];
  });
}

/** Tab notes as a rhythm pattern (`e e er q`), bar lines left out. */
function rhythmOf(notes: readonly TabNote[]): string {
  return notes.map((n) => ('rest' in n ? `${n.duration}r` : n.duration)).join(' ');
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Mia unit 9: Power chords and the blues', () => {
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

  it('builds every power chord from a root and its fifth, with the root again on top', () => {
    const shapes: Array<[string, string, Array<[number, number]>]> = [
      ['022xxx', 'E5', [[6, 0], [5, 2], [4, 2]]],
      ['x022xx', 'A5', [[5, 0], [4, 2], [3, 2]]],
      ['xx023x', 'D5', [[4, 0], [3, 2], [2, 3]]],
      ['355xxx', 'G5', [[6, 3], [5, 5], [4, 5]]],
      ['x355xx', 'C5', [[5, 3], [4, 5], [3, 5]]],
      ['x577xx', 'D5', [[5, 5], [4, 7], [3, 7]]],
    ];
    for (const [frets, symbol, positions] of shapes) {
      expect(identifyFretted(frets).symbol, frets).toBe(symbol);
      const [root, fifth] = chordNotes(symbol);
      expect(positions.map(([s, f]) => at(s, f)), symbol).toEqual([root, fifth, root]);
      const midis = positions.map(([s, f]) => midiAt({ string: s, fret: f }));
      // Root to fifth is 7 half steps, root to the top note an octave.
      expect([midis[1] - midis[0], midis[2] - midis[0]], symbol).toEqual([7, 12]);
    }
    // The E5 card: string 5 fret 2 is B, string 4 fret 2 is E.
    expect([at(5, 2), at(4, 2)]).toEqual(['B', 'E']);
  });

  it('moves the top note of D5 up a fret because strings 3 and 2 are four frets apart, not five', () => {
    const open = [6, 5, 4, 3, 2, 1].map((s) => midiAt({ string: s, fret: 0 }));
    const gaps = open.slice(1).map((m, i) => m - open[i]);
    expect(gaps).toEqual([5, 5, 5, 4, 5]);
    expect(at(2, 3)).toBe('D');
    expect(midiAt({ string: 2, fret: 2 }) % 12).toBe(1); // C#, the wrong answer the choice explains
    expect(at(3, 3)).not.toBe('A');
  });

  it('names the movable roots and the natural notes of strings 6 and 5 as the neck has them', () => {
    const s6: Record<number, string> = { 0: 'E', 1: 'F', 3: 'G', 5: 'A', 7: 'B', 8: 'C', 10: 'D', 12: 'E' };
    for (const [fret, note] of Object.entries(s6)) expect(at(6, Number(fret)), `string 6 fret ${fret}`).toBe(note);
    expect([at(5, 3), at(5, 5), at(5, 7)]).toEqual(['C', 'D', 'E']);
    // The match-pairs: finger 1 on string 6 at frets 3, 5, 7, 8 gives G5, A5, B5, C5.
    const pairs = (lesson('movable-power-chords').steps.find((s) => (s as { type?: string }).type === 'match-pairs') as { pairs: Array<{ left: string; right: string }> }).pairs;
    for (const p of pairs) {
      const fret = Number(p.left.replace('Fret ', ''));
      expect(p.right, p.left).toBe(`{c:${at(6, fret)}5}`);
    }
    // The figure of the natural notes claims exactly those.
    const fig = card('movable-power-chords', 'The notes on string 6').figure as { dots: Array<{ fret: number; note: string }> };
    expect(fig.dots.map((d) => [d.fret, d.note.replace(/\d/, '')])).toEqual(Object.entries(s6).map(([f, n]) => [Number(f), n]));
  });

  it('describes the Open Riff as the library has it', async () => {
    const riff = await song('st-power-chords-open');
    expect(riff.tempo[0].bpm).toBe(92);
    const bars = chordsByBar(riff).map((b) => [...new Set(b)]);
    expect(bars.length).toBe(8);
    // Bars 1, 3 and 5 are the E5 hook (the bars the palm-muting task mutes); bar 2 brings C5 and D5, bar 4 A5 and G5.
    expect([bars[0], bars[2], bars[4]]).toEqual([['E5'], ['E5'], ['E5']]);
    expect(bars[1]).toEqual(['C5', 'D5']);
    expect(bars[3]).toEqual(['A5', 'G5']);
    // Every shape the lessons teach is the shape the song names.
    const shapes = new Map(riff.chords.map((c) => [c.symbol, c.voicing]));
    for (const sym of ['E5', 'A5', 'D5', 'G5', 'C5']) expect(shapes.has(sym), sym).toBe(true);
    // Bar 1: hit, hit, gap, hit, hit, gap, hit, gap, as the first task says.
    const bar1 = riff.tracks[0].measures[0].beats.map((b) => (b.notes.length ? 'e' : 'er'));
    expect(bar1.join(' ')).toBe('e e er e e er e er');
  });

  it('asks lesson 1 to play only the shapes taught so far, and leaves the movable ones to the Player', async () => {
    // Lesson 1 teaches E5, A5 and D5; G5 and C5 (the movable shape) come in lesson 2.
    const taught = ['E5', 'A5', 'D5'];
    const task = lesson('power-chords').steps.find((s) => isTaskStep(s) && s.id === 'open-riff-1-4');
    expect(task && isTaskStep(task)).toBe(true);
    if (!task || !isTaskStep(task)) return;
    expect(task.params).toEqual(['st-power-chords-open', 'm1-4', 't87']);
    const bars = chordsByBar(await song('st-power-chords-open')).slice(0, 4);
    // Where the body says each taught shape is.
    expect(bars[0]).toEqual(['E5']);
    expect(bars[2]).toEqual(['E5']);
    expect(bars[1][1]).toBe('D5'); // the second half of bar 2
    expect(bars[3][0]).toBe('A5'); // the first half of bar 4
    const untaught = [...new Set(bars.flat())].filter((c) => !taught.includes(c)).sort();
    expect(untaught).toEqual(['C5', 'G5']);
    const body = plain(task.body);
    for (const c of untaught) expect(body, c).toContain(`{c:${c}}`);
    expect(body).toMatch(/come next lesson/);
    expect(body).toMatch(/let the Player play them/);
    // The movable shapes really are taught in lesson 2.
    const next = JSON.stringify(lesson('movable-power-chords').steps);
    for (const c of untaught) expect(next, c).toContain(`symbol":"${c}"`);
  });

  it('teaches the 12-bar form and the shuffle figure as the library\'s study plays them', async () => {
    const twelve = ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E'];
    const blues = await song('st-blues-shuffle-a');
    expect(blues.tempo[0].bpm).toBe(84);
    expect(chordsByBar(blues).slice(0, 12).map((b) => b[0])).toEqual(twelve);
    // The loop task, bars 8 to 10: one bar each of A, E and D.
    expect(chordsByBar(blues).slice(7, 10).map((b) => b[0])).toEqual(['A', 'E', 'D']);
    // The shuffle: open root with fret 2, then fret 4, of the next string.
    const pairs = (bar: number) => [...new Set(blues.tracks[0].measures[bar].beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join(' ')))];
    expect(pairs(0)).toEqual(['5:0 4:2', '5:0 4:4']);
    expect(pairs(4)).toEqual(['4:0 3:2', '4:0 3:4']);
    expect(pairs(8)).toEqual(['6:0 5:2', '6:0 5:4']);
    expect([at(5, 0), at(4, 2), noteAt({ string: 4, fret: 4 }, { context: { chord: 'D' }, octave: false })]).toEqual(['A', 'E', 'F#']);
    expect([at(4, 0), at(3, 2), at(3, 4)]).toEqual(['D', 'A', 'B']);
    expect([at(6, 0), at(5, 2), noteAt({ string: 5, fret: 4 }, { context: { chord: 'A' }, octave: false })]).toEqual(['E', 'B', 'C#']);
    // The three chords sit on the 1st, 4th and 5th notes of A major.
    const a = scaleNotes('A', 'major');
    expect([a[0], a[3], a[4]]).toEqual(['A', 'D', 'E']);
    // The order exercise's lines are the form, four bars each.
    const order = lesson('blues-shuffle-in-a').steps.find((s) => (s as { type?: string }).type === 'order') as { tiles: string[] };
    expect(order.tiles.map((t) => [...t.matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1])).flat()).toEqual(twelve);
  });

  it('puts the 7 of E7 and A7 on the open strings the lesson names', () => {
    expect(chordNotes('E7')).toEqual(['E', 'G#', 'B', 'D']);
    expect(chordNotes('A7')).toEqual(['A', 'C#', 'E', 'G']);
    // E (022100) to E7 (020100): only string 4 changes, from fret 2 (E) to open (D, the 7).
    expect(identifyFretted('022100').symbol).toBe('E');
    expect(identifyFretted('020100').symbol).toBe('E7');
    expect([at(4, 2), at(4, 0)]).toEqual(['E', 'D']);
    // A (x02220) to A7 (x02020): string 3 goes from fret 2 to open G.
    expect(identifyFretted('x02020').symbol).toBe('A7');
    expect(at(3, 0)).toBe('G');
    expect(identifyFretted('x21202').symbol).toBe('B7');
    expect(chordNotes('B7')[3]).toBe('A');
    expect(at(3, 2)).toBe('A');
  });

  it('writes Mia\'s riff as roots on string 6 that match its rhythm line', () => {
    const riffCard = card('your-own-riff', 'Mia\'s riff').figure as { kind: 'rhythm'; pattern: string };
    const rootsCard = card('your-own-riff', 'Start with the roots').figure as { kind: 'tab'; notes: TabNote[] };
    expect(rhythmOf(rootsCard.notes)).toBe(riffCard.pattern.replace(/ \| /g, ' '));
    // Each root is the root of its power chord: open E (E5), fret 3 G (G5), fret 5 A (A5).
    const struck = rootsCard.notes.filter((n): n is Extract<TabNote, { fret: number }> => !('rest' in n));
    expect(new Set(struck.map((n) => n.string))).toEqual(new Set([6]));
    expect([...new Set(struck.map((n) => `${n.fret}:${at(6, n.fret)}`))].sort()).toEqual(['0:E', '3:G', '5:A']);
    // The play step plays the same notes as the card.
    const play = lesson('your-own-riff').steps.find((s) => (s as { type?: string }).type === 'play-phrase') as { notes: TabNote[] };
    expect(play.notes).toEqual(rootsCard.notes);
  });

  it('sends the jams to progressions with the chords the tasks name', () => {
    const chords = (id: string, key: string) => [...new Set(progressionInKey(id, key).bars.flat().map((c) => c.symbol))];
    expect(chords('rock-i-biii-iv', 'E')).toEqual(['E5', 'G5', 'A5']);
    expect(chords('blues-12-bar', 'E')).toEqual(['E7', 'A7', 'B7']);
  });

  it('opens the chord trainer on the chords each task names', () => {
    for (const l of unit.lessons) {
      for (const step of l.steps) {
        if (!isTaskStep(step) || step.tool !== 'chords') continue;
        const view = viewFromParams(step.params ?? []) as { view: string; chords: string[] };
        expect(view.view, step.id).toBe('trainer');
        expect(view.chords, step.id).toEqual([...plain(step.body).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]).slice(0, 2));
      }
    }
  });

  it('names a BPM in every Player task that the task really opens at', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('gives the missing John Henry a fallback, and links only real songs otherwise', () => {
    for (const l of unit.lessons) {
      for (const step of l.steps) {
        if (!isTaskStep(step)) continue;
        const id = taskSong(step);
        if (id && !songEntry(id)) expect(step.fallback, `${l.id} > ${step.id}`).toBeTruthy();
      }
    }
  });
});
