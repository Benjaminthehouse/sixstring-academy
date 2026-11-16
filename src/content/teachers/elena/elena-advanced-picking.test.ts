/**
 * Cross-checks for Prof. Varga's unit 3 (Advanced picking) against the technique exercises, the
 * guitar and theory engines, the progression catalog and the song library: every tab the cards show
 * is the Technique exercise's own material, note for note (and stroke for stroke where the strokes
 * are the point), every note name and interval, the arpeggio the fretboard question asks for, the
 * jams, the Mountain King tempo ramp the fallback relies on, the ladders the tasks quote, and the BPM
 * every Player task names. Run with
 * `npx vitest run src/content/teachers/elena/elena-advanced-picking.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, partSong } from '@/content/technique';
import { midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { parseAddress } from '@/features/progressions/model/address';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, { BURST, ECONOMY_START, HYBRID_C, SKIP_OCTAVES, SWEEP_AM, SWEEP_C, SWEEP_FIVE } from './elena-advanced-picking';

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

/** Problems with the tempos the Player tasks name: "about N BPM" first, "100 % (M BPM)" after. */
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

/** The struck notes of a technique exercise part, in order: `string:fret`, and the stroke marks. */
function material(exercise: string, part: string): { pos: string[]; strokes: (string | undefined)[] } {
  const e = getExercise(exercise)!;
  const p = e.parts.find((x) => x.id === part)!;
  const s = partSong(e, p, e.tempo.start);
  const beats = s.tracks[0].measures.flatMap((m) => m.beats).filter((b) => b.notes.length > 0);
  return { pos: beats.map((b) => `${b.notes[0].string}:${b.notes[0].fret}`), strokes: beats.map((b) => b.stroke) };
}

const course = compileCourse(courseMeta('elena'), [unit]);
const pos = (notes: TabNote[]) => notes.filter((n): n is TabNote & { string: number; fret: number } => 'string' in n).map((n) => `${n.string}:${n.fret}`);
const midis = (notes: TabNote[]) => notes.filter((n): n is TabNote & { string: number; fret: number } => 'string' in n).map((n) => midiAt(n));
const name = (string: number, fret: number) => noteAt({ string, fret }, { octave: false });

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 3: Advanced picking', () => {
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

  it('shows the economy run as the exercise plays it, with its strokes: down-up-down, down-up-down', () => {
    const m = material('tech-economy-picking', 'g-major');
    expect(m.pos.slice(0, ECONOMY_START.length)).toEqual(pos(ECONOMY_START));
    expect(m.strokes.slice(0, 6)).toEqual(['down', 'up', 'down', 'down', 'up', 'down']);
    // Descending mirrors it: up-down-up on each string (the run turns at string 1 fret 8).
    const top = m.pos.lastIndexOf('1:8');
    expect(m.pos.slice(top, top + 6)).toEqual(['1:8', '1:7', '1:5', '2:8', '2:7', '2:5']);
    expect(m.strokes.slice(top, top + 6)).toEqual(['up', 'down', 'up', 'up', 'down', 'up']);
    expect(midis(ECONOMY_START).map((x) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][x % 12])).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(midis(ECONOMY_START)[7] - midis(ECONOMY_START)[0]).toBe(12);
    expect(getExercise('tech-economy-picking')!.tempo).toEqual({ start: 60, step: 4, goal: 132 });
    // String 5 between frets 3 and 7 holds C, D and E of G major.
    const g = scaleNotes('G', 'major');
    expect([3, 4, 5, 6, 7].filter((f) => g.includes(name(5, f))).map((f) => name(5, f))).toEqual(['C', 'D', 'E']);
  });

  it('shows the three-string sweeps as the exercise plays them', () => {
    const m = material('tech-sweep-three-string', 'am-c');
    expect(m.pos.slice(0, 5)).toEqual(pos(SWEEP_AM));
    const c = m.pos.indexOf('3:12');
    expect(m.pos.slice(c, c + 5)).toEqual(pos(SWEEP_C));
    expect(pos(SWEEP_AM).map((p) => name(Number(p[0]), Number(p.slice(2))))).toEqual(['A', 'C', 'E', 'C', 'A']);
    expect(pos(SWEEP_C).map((p) => name(Number(p[0]), Number(p.slice(2))))).toEqual(['G', 'C', 'E', 'C', 'G']);
    expect(chordNotes('Am')).toEqual(['A', 'C', 'E']);
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
    expect(getExercise('tech-sweep-three-string')!.tempo).toEqual({ start: 50, step: 5, goal: 120 });
  });

  it('shows the five-string sweep as the exercise plays it, and asks for exactly its five notes', () => {
    const m = material('tech-sweep-five-string', 'am-arpeggio');
    expect(m.pos.slice(0, 11)).toEqual(pos(SWEEP_FIVE));
    expect(midis(SWEEP_FIVE)).toEqual([57, 64, 69, 72, 76, 81, 76, 72, 69, 64, 57]);
    // Every Am chord tone on strings 5 to 1 between frets 12 and 14: the five the explanation lists.
    const found: string[] = [];
    for (let s = 1; s <= 5; s++) for (let f = 12; f <= 14; f++) if (chordNotes('Am').includes(name(s, f))) found.push(`${s}:${f}`);
    expect(found.sort()).toEqual(['1:12', '2:13', '3:14', '4:14', '5:12']);
    expect(midiAt({ string: 4, fret: 14 }) - midiAt({ string: 5, fret: 12 })).toBe(7);
    expect(getExercise('tech-sweep-five-string')!.tempo.start).toBe(50);
  });

  it('skips strings exactly as the exercise does: octaves A to A and D to D', () => {
    const m = material('tech-string-skipping', 'octaves');
    // The exercise plays each pair four times a bar; the card and the phrase play it twice.
    expect(m.pos).toEqual([...Array(4).fill(['6:5', '4:7']).flat(), ...Array(4).fill(['5:5', '3:7']).flat()]);
    expect(pos(SKIP_OCTAVES)).toEqual([...m.pos.slice(0, 4), ...m.pos.slice(8, 12)]);
    expect(midis(SKIP_OCTAVES).slice(0, 2)).toEqual([45, 57]);
    expect(midis(SKIP_OCTAVES).slice(4, 6)).toEqual([50, 62]);
    // The box-1 interval question: string 2 fret 8 is G, a minor seventh above the A at string 4 fret 7.
    expect([name(4, 7), name(2, 8)]).toEqual(['A', 'G']);
    expect(midiAt({ string: 2, fret: 8 }) - midiAt({ string: 4, fret: 7 })).toBe(10);
    expect(getExercise('tech-string-skipping')!.tempo).toEqual({ start: 60, step: 4, goal: 120 });
  });

  it('plays the hybrid pattern as the exercise does: pick, m, pick, a over C', () => {
    const m = material('tech-hybrid-picking', 'pattern');
    expect(m.pos.slice(0, 8)).toEqual(pos(HYBRID_C));
    expect(pos(HYBRID_C).slice(0, 4).map((p) => name(Number(p[0]), Number(p.slice(2))))).toEqual(['C', 'C', 'E', 'E']);
    expect(getExercise('tech-hybrid-picking')!.tempo.start).toBe(60);
  });

  it('bursts on the exercise\'s own figure, C B A G, and keeps tremolo thirty-seconds at half tempo', () => {
    const m = material('tech-speed-bursts', 'one-two-four');
    expect(m.pos.slice(0, 4)).toEqual(pos(BURST));
    expect(pos(BURST).map((p) => name(Number(p[0]), Number(p.slice(2))))).toEqual(['C', 'B', 'A', 'G']);
    const tremolo = getExercise('tech-tremolo-picking')!;
    expect(tremolo.parts.find((p) => p.id === 'thirty-seconds')!.tempoScale).toBe(0.5);
    // The open string 1 and string 2 fret 5 are the same E.
    expect(midiAt({ string: 1, fret: 0 })).toBe(midiAt({ string: 2, fret: 5 }));
  });

  it('jams on the chords the words name', () => {
    const jam = (id: string) => {
      const a = parseAddress(task(id).params ?? []);
      expect(a.view, id).toBe('jam');
      return a.view === 'jam' ? progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol) : [];
    };
    expect(new Set(jam('skipping-jam'))).toEqual(new Set(['Am7']));
    expect(jam('hybrid-jam')).toEqual(['G', 'G', 'A7', 'A7', 'D7', 'D7', 'G', 'G']);
  });

  it('climbs Mountain King from 60 to 160 BPM, four bars a statement, the last two in bars 17 to 24', async () => {
    const s = await song('hall-of-the-mountain-king');
    expect(s.tempo.map((t) => t.bpm)).toEqual([60, 80, 100, 120, 140, 160]);
    const at = (bar: number) => [...s.tempo].filter((t) => t.bar <= bar).pop()!.bpm;
    expect([0, 4, 8, 12, 16, 20].map(at)).toEqual([60, 80, 100, 120, 140, 160]); // a statement every four bars
    expect(s.bars.length).toBe(25); // six statements and the closing chord
    expect(task('longer-goals').fallback!.params).toEqual(['hall-of-the-mountain-king', 'm17-24']);
    expect(plain(task('mountain-king').body)).toContain('from 60 BPM toward 160');
  });

  it('opens the sweep study at about 60 BPM, with 72 as the goal', async () => {
    expect((await song('st-arpeggio-sweep')).tempo[0].bpm).toBe(72);
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('gives every missing piece a fallback and names no Player tempo it cannot know', () => {
    for (const id of ['devils-dream', 'longer-goals']) {
      const t = task(id);
      if (songEntry(taskSong(t)!)) continue;
      expect(t.fallback, id).toBeTruthy();
      expect((t.params ?? []).some((p) => /^t\d+$/.test(p)), id).toBe(false);
    }
    expect(task('devils-dream').fallback!.params).toEqual(['irish-washerwoman']);
    expect(songEntry('irish-washerwoman')).toBeTruthy();
  });

  it('warns about strain wherever the exercise does', () => {
    const strained = ['tech-sweep-five-string', 'tech-speed-bursts', 'tech-tremolo-picking'];
    for (const id of strained) expect(getExercise(id)!.strain, id).toBeTruthy();
    expect(plain(task('sweep-five').body)).toMatch(/wrist aches/);
    expect(plain(task('speed-bursts').body)).toMatch(/few minutes/i);
    expect(plain(task('tremolo').body)).toMatch(/rest/);
    expect(lesson('speed-and-tremolo').steps.some((s) => /stop at once/.test(plain((s as { body?: RichText }).body)))).toBe(true);
  });
});
