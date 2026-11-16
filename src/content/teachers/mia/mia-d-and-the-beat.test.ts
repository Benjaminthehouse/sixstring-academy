/**
 * Cross-checks for Mia's unit 4 (D, A7 and the steady beat) against the engines and the song
 * library: every fretted note the cards name is the note on the neck, every chord shape is that
 * chord, the chord charts and bass notes the lessons describe are the library's, and the BPM each
 * Player task names is the song's tempo times the task's percentage. Run with
 * `npx vitest run src/content/teachers/mia/mia-d-and-the-beat.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { identifyFretted, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, parseChord } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TeacherUnit } from '../types';
import unit from './mia-d-and-the-beat';
import { A_WIDE_FINGERS, SHAPES } from './mia-first-chords';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

/** True when bar `i` is a pickup (shorter than its time signature). */
function isPickup(s: Song, i: number): boolean {
  const b = s.bars[i];
  return b.length !== undefined && b.length < (b.time.numerator * 3840) / b.time.denominator;
}

/** The chord in force at the start of every full bar (pickups left out). */
async function chordsByBar(id: string): Promise<string[]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const out: string[] = [];
  for (let i = 0; i < s.bars.length; i++) {
    if (isPickup(s, i)) continue;
    const inForce = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    out.push(inForce ? inForce.symbol : 'N.C.');
  }
  return out;
}

/** Every chord sounding in each full bar (the one in force at the bar line and any that start in it). */
async function chordsInBars(id: string): Promise<string[][]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const out: string[][] = [];
  for (let i = 0; i < s.bars.length; i++) {
    if (isPickup(s, i)) continue;
    const start = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    const inside = events.filter((e) => e.bar === i && e.tick > 0).map((e) => e.symbol);
    out.push([...(start ? [start.symbol] : []), ...inside]);
  }
  return out;
}

/** The single note on beat 1 of each bar of the strum part, by the chord in force: `{ D: '4:0' }`. */
async function bassByChord(id: string): Promise<Record<string, string>> {
  const s = await song(id);
  const rhythm = s.tracks.find((t) => t.role === 'rhythm')!;
  const chords = await chordsByBar(id);
  const full = s.bars.map((_, i) => i).filter((i) => !isPickup(s, i));
  const out: Record<string, string> = {};
  full.forEach((barIndex, k) => {
    const first = rhythm.measures[barIndex].beats[0];
    if (first.start !== 0 || first.notes.length !== 1) return;
    const pos = `${first.notes[0].string}:${first.notes[0].fret}`;
    const chord = chords[k];
    expect(out[chord] === undefined || out[chord] === pos, `${id} bar ${barIndex + 1}: ${chord} bass ${pos} (was ${out[chord]})`).toBe(true);
    out[chord] = pos;
  });
  return out;
}

/** The strings a shape plays, from string 6 to string 1. */
function stringsOf(shape: string): number[] {
  return [...shape].map((c, i) => (c === 'x' ? 0 : 6 - i)).filter((n) => n > 0);
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/**
 * Problems with the tempos the Player tasks name: every "N % (M BPM)" must be right, and the first
 * other "M BPM" must be the tempo the task opens at (the song's tempo times its percentage).
 */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id) continue;
      if (!songEntry(id)) continue; // a fallback task: no tempo to check against yet
      const bpm = (await song(id)).tempo[0].bpm;
      const pctParam = (step.params ?? []).find((p) => /^t\d+$/.test(p));
      const pct = pctParam ? Number(pctParam.slice(1)) : 100;
      let text = plain(step.body);
      for (const m of text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)) {
        const want = (bpm * Number(m[1])) / 100;
        if (Math.abs(want - Number(m[2])) > 1) out.push(`${lesson.id} > ${step.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
      }
      text = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '');
      const first = text.match(/(\d+) BPM/);
      if (!first) {
        out.push(`${lesson.id} > ${step.id}: names no BPM`);
        continue;
      }
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(first[1])) > 1) out.push(`${lesson.id} > ${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('mia'), [unit]);
const at = (string: number, fret: number, chord: string) => noteAt({ string, fret }, { context: { chord }, octave: false });

describe('Mia unit 4: D, A7 and the steady beat', () => {
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

  it('names the notes under the fingers as the neck has them', () => {
    // D: finger 1 on string 3 fret 2 (A), finger 3 on string 2 fret 3 (D), finger 2 on string 1 fret 2 (F#), open string 4 (D).
    expect([at(3, 2, 'D'), at(2, 3, 'D'), at(1, 2, 'D'), at(4, 0, 'D')]).toEqual(['A', 'D', 'F#', 'D']);
    // A7: finger 2 on string 4 fret 2 (E), finger 3 on string 2 fret 2 (C#), the open string 3 (G) between them.
    expect([at(4, 2, 'A7'), at(2, 2, 'A7'), at(3, 0, 'A7')]).toEqual(['E', 'C#', 'G']);
    expect(chordNotes('A7')).toEqual(['A', 'C#', 'E', 'G']);
    // Bass notes: the open strings 4, 5 and 6 under D, A / A7 and E7, each the chord's own root.
    expect([at(4, 0, 'D'), at(5, 0, 'A7'), at(5, 0, 'A'), at(6, 0, 'E7')]).toEqual(['D', 'A', 'A', 'E']);
    for (const c of ['D', 'A7', 'A', 'E7']) expect(parseChord(c)!.root).toBe(c[0]);
  });

  it('draws shapes that are the chords they are called, on the strings the lessons name', () => {
    expect(identifyFretted('xx0232').symbol).toBe('D');
    expect(identifyFretted('x02020').symbol).toBe('A7');
    expect(identifyFretted('020100').symbol).toBe('E7');
    expect(stringsOf('xx0232')).toEqual([4, 3, 2, 1]);
    expect(stringsOf('x02020')).toEqual([5, 4, 3, 2, 1]);
    // The "muddy" D of the listening question is the D shape with the open strings 6 and 5 ringing too,
    // and their E is not a note of D at all.
    const muddy = identifyFretted('000232').notes.map((n) => n.midi);
    expect(muddy).toEqual([40, 45, 50, 57, 62, 66]); // E2 A2 D3 A3 D4 F#4
    expect(chordNotes('D')).not.toContain('E');
    // D to A7: finger 3 slides from string 2 fret 3 (D) to fret 2 (C#); finger 2 goes from string 1 to string 4.
    expect([at(2, 3, 'D'), at(2, 2, 'A7')]).toEqual(['D', 'C#']);
  });

  it('describes Strumming: Steady Quarters and the Em-D ladder as the library has them', async () => {
    const em4a4 = ['Em', 'Em', 'Em', 'Em', 'A', 'A', 'A', 'A'];
    expect(await chordsByBar('st-strum-quarters')).toEqual([...em4a4, ...em4a4]);
    const ladder = await chordsInBars('st-change-em-d-em-g');
    expect(ladder.length).toBe(16);
    expect(new Set(ladder.slice(0, 8).flat())).toEqual(new Set(['Em', 'D']));
    expect(new Set(ladder.slice(8, 16).flat())).toEqual(new Set(['Em', 'G']));
  });

  it('describes Strumming: Down-Up Eighths as the library has it: Em two bars, D two bars', async () => {
    const two = ['Em', 'Em', 'D', 'D'];
    expect(await chordsByBar('st-strum-eighths')).toEqual([...two, ...two, ...two, ...two]);
    const s = await song('st-strum-eighths');
    expect(s.sections.map((x) => [x.name, x.start])).toEqual([['Even eighths', 0], ['Accents on 2 and 4', 8]]);
  });

  it("plays Drunken Sailor's chords line by line, two downstrums a bar in the first chorus", async () => {
    const line = ['Em', 'Em', 'Em', 'Em', 'D', 'D', 'D', 'D', 'Em', 'Em', 'Em', 'Em', 'D', 'D', 'Em', 'Em'];
    expect(await chordsByBar('drunken-sailor')).toEqual([...line, ...line, ...line]);
    const s = await song('drunken-sailor');
    expect(s.bars[0].time).toEqual({ numerator: 2, denominator: 4 });
    const strum = s.tracks.find((t) => t.role === 'rhythm')!;
    // Bars 1 to 16: two quarter-note slashes a bar; bars 17 on: four eighth-note slashes.
    for (let i = 0; i < 16; i++) expect(strum.measures[i].beats.map((b) => b.duration), `bar ${i + 1}`).toEqual([960, 960]);
    for (let i = 16; i < 47; i++) expect(strum.measures[i].beats.map((b) => b.duration), `bar ${i + 1}`).toEqual([480, 480, 480, 480]);
  });

  it('puts the waltz bass notes where the lessons say', async () => {
    expect(await bassByChord('st-strum-waltz')).toEqual({ D: '4:0', A7: '5:0' });
    expect(await bassByChord('down-in-the-valley')).toEqual({ A: '5:0', E7: '6:0' });
    expect(await bassByChord('clementine')).toEqual({ D: '4:0', A7: '5:0' });
    expect([...new Set(await chordsByBar('down-in-the-valley'))]).toEqual(['A', 'E7']);
    expect([...new Set(await chordsByBar('clementine'))]).toEqual(['D', 'A7']);
    for (const id of ['st-strum-waltz', 'down-in-the-valley', 'clementine']) expect((await song(id)).bars[1].time, id).toEqual({ numerator: 3, denominator: 4 });
  });

  it("starts Clementine's tune in a one-beat pickup, and the strum on the next 1", async () => {
    const s = await song('clementine');
    expect(isPickup(s, 0)).toBe(true);
    expect(s.bars[0].length).toBe(960);
    const lead = s.tracks.find((t) => t.role === 'lead')!;
    const strum = s.tracks.find((t) => t.role === 'rhythm')!;
    expect(lead.measures[0].beats.some((b) => b.notes.length > 0)).toBe(true);
    expect(strum.measures[0].beats.every((b) => b.notes.length === 0 && !b.slash)).toBe(true);
    expect(strum.measures[1].beats[0].start).toBe(0);
    expect(strum.measures[1].beats[0].notes.length).toBe(1);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});

// ── checks added by the review ──────────────────────────────────────────────────────────────────

/** Where each finger sits in a shape: `{ 1: '3:2' }` from frets `xx0232` and fingers `xx0132`. */
function places(frets: string, fingers: string): Record<number, string> {
  const out: Record<number, string> = {};
  [...fingers].forEach((f, i) => {
    if (f >= '1' && f <= '4') out[Number(f)] = `${6 - i}:${frets[i]}`;
  });
  return out;
}

function task(lessonId: string, taskId: string) {
  const step = unit.lessons.find((l) => l.id === lessonId)!.steps.find((s) => isTaskStep(s) && s.id === taskId);
  if (!step || !isTaskStep(step)) throw new Error(`no task ${lessonId} > ${taskId}`);
  return step;
}

describe('Mia unit 4: what the review fixed', () => {
  it('never offers chord boxes as answer options (the engine prints each box\'s name on it)', () => {
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        const st = s as { type?: string; options?: Array<{ figure?: { kind: string } }> };
        if (st.type === 'choice') for (const o of st.options ?? []) expect(o.figure?.kind, l.id).not.toBe('chord');
      }
    }
  });

  it('gives every lesson two to four facts', () => {
    for (const l of unit.lessons) expect((l.facts ?? []).length, l.id).toBeGreaterThanOrEqual(2);
    for (const l of unit.lessons) expect((l.facts ?? []).length, l.id).toBeLessThanOrEqual(4);
  });

  it('says only true things about the Em to D change', () => {
    const em = places('022000', '023000');
    const d = places('xx0232', 'xx0132');
    const travel = (f: number) => Math.abs(Number(em[f].split(':')[0]) - Number(d[f].split(':')[0]));
    // Finger 2 travels from string 5 to string 1, farther than finger 3 (string 4 to string 2) ...
    expect(travel(2)).toBe(4);
    expect(travel(3)).toBe(2);
    expect(JSON.stringify(unit.lessons.find((l) => l.id === 'the-d-chord'))).not.toMatch(/farthest/);
    // ... and finger 3 is the only finger at fret 3: the top of the triangle.
    expect(Object.entries(d).filter(([, p]) => p.endsWith(':3')).map(([f]) => f)).toEqual(['3']);
  });

  it('finds the D triangle on strings 3 to 1 at exactly the three fretted notes', () => {
    const shape = identifyFretted('xx0232');
    const fretted = shape.notes.filter((n) => n.fret > 0).map((n) => `${n.string}:${n.fret}`).sort();
    expect(fretted).toEqual(['1:2', '2:3', '3:2']);
    // Every chord tone of D in frets 1 to 3 of strings 3, 2 and 1 (what the fretboard-find step asks for).
    const tones = new Set(chordNotes('D'));
    const found: string[] = [];
    for (const string of [3, 2, 1]) for (let fret = 1; fret <= 3; fret++) if (tones.has(at(string, fret, 'D'))) found.push(`${string}:${fret}`);
    expect(found.sort()).toEqual(fretted);
  });

  it('names the A fingering that really keeps finger 1 on string 3, fret 2 from D', async () => {
    const d = places('xx0232', 'xx0132');
    expect(d[1]).toBe('3:2');
    expect(places(SHAPES.A.frets, A_WIDE_FINGERS)[1]).toBe('3:2');
    // With the 1-2-3 fingering (the one unit 2 teaches first), finger 1 is on string 4: it does not stay.
    expect(places(SHAPES.A.frets, SHAPES.A.fingers)[1]).toBe('4:2');
    expect(plain(task('a7-and-waltz-time', 'd-a7-ladder').body)).toMatch(/fingered 2, 1, 3/);
    expect(await loadSongText('st-change-d-a7-a-d')).toMatch(/A \(x02220\), fingered 2-1-3/);
  });

  it('keeps Technique tasks on chords already taught, or says which chord to stay on', () => {
    // Unit 2: Em, E, Am, the one-finger G, A, E7. This unit: D, A7.
    const known = new Set(['022000', '022100', 'x02210', 'xx0003', 'x02220', '020100', 'xx0232', 'x02020']);
    let checked = 0;
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        if (!isTaskStep(s) || s.tool !== 'technique') continue;
        const ex = getExercise(s.params![0])!;
        const shapes = new Map(ex.parts.flatMap((p) => [...p.tab.matchAll(/"([A-G][^="]*)=([x0-9]{6})"/g)].map((m) => [m[2], m[1]] as const)));
        expect(shapes.size, s.id).toBeGreaterThan(0);
        for (const [frets, name] of shapes) {
          checked++;
          if (known.has(frets)) continue;
          // tech-strum-constant switches to the full G (320003) for its last eight bars; G comes in unit 5.
          expect(plain(s.body), `${s.id}: ${name} ${frets}`).toContain(`{c:${name}}`);
          expect(plain(s.body), `${s.id}: ${name} ${frets}`).toMatch(/stay on it/);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
