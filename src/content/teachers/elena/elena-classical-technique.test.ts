/**
 * Cross-checks for Prof. Varga's unit 9 (Classical technique) against the technique exercises, the
 * song library and the guitar and theory engines: every tab a card shows is the Technique
 * exercise's own material or the library piece's own notes, every note name, the shapes, the
 * ladders the tasks quote, the bars and BPM every Player task names, and the swaps for the classical
 * solos the library does not hold. Run with
 * `npx vitest run src/content/teachers/elena/elena-classical-technique.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, partSong } from '@/content/technique';
import { midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { noteToMidi, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, { DUO_BASS, DUO_UPPER, GALLOP, LATE_A, PIMAMI_C, PIMI_C, REST_STROKE_EIGHTHS, SHIFTS, SHIFTS_UP, SLURS_S1, TREMOLO_OPEN } from './elena-classical-technique';

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
  const found = tasks(unit).find((x) => x.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
}

/** Problems with the tempos the Player tasks name: "about N BPM" is where it opens, "P % (M BPM)" must add up. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const s of tasks(u)) {
    const id = taskSong(s);
    if (!id || !songEntry(id)) continue;
    const bpm = (await song(id)).tempo[0].bpm;
    const pctParam = (s.params ?? []).find((p) => /^t\d+$/.test(p));
    const pct = pctParam ? Number(pctParam.slice(1)) : 100;
    const text = plain(s.body);
    for (const m of text.matchAll(/(\d+) % \((\d+) BPM\)/g)) {
      if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${s.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    }
    const about = text.match(/about (\d+) BPM/);
    if (about) {
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(about[1])) > 1) out.push(`${s.id}: says about ${about[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    } else if (pct !== 100) out.push(`${s.id}: opens at ${pct} % but names no BPM`);
  }
  return out;
}

/** The struck notes of a technique exercise part, in order: `string:fret`. */
function material(exercise: string, part: string): string[] {
  const e = getExercise(exercise)!;
  const p = e.parts.find((x) => x.id === part)!;
  const s = partSong(e, p, e.tempo.start);
  return s.tracks[0].measures.flatMap((m) => m.beats).filter((b) => b.notes.length > 0).map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join('+'));
}

/** The struck notes of one track of a library song, bar by bar (1-based, as the Player counts). */
async function songBars(id: string, track = 0): Promise<string[][]> {
  const s = await song(id);
  return s.tracks[track].measures.map((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join('+')));
}

const course = compileCourse(courseMeta('elena'), [unit]);
type Fretted = TabNote & { string: number; fret: number };
const struck = (notes: TabNote[]) => notes.filter((n): n is Fretted => 'string' in n);
const pos = (notes: TabNote[]) => struck(notes).map((n) => `${n.string}:${n.fret}`);
const names = (notes: TabNote[]) => struck(notes).map((n) => noteAt({ string: n.string, fret: n.fret }, { octave: false }));
const durations = (notes: TabNote[]) => notes.map((n) => n.duration);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 9: Classical technique', () => {
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

  it('shows the Rest Stroke Scale as the exercise plays it: C major on strings 3 to 1, G up to G and back', () => {
    expect(pos(REST_STROKE_EIGHTHS)).toEqual(material('tech-rest-stroke', 'eighths'));
    const c = scaleNotes('C', 'major');
    expect(names(REST_STROKE_EIGHTHS).every((n) => c.includes(n))).toBe(true);
    expect(names(REST_STROKE_EIGHTHS)).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'G']);
    expect(struck(REST_STROKE_EIGHTHS).every((n) => n.string <= 3 && n.fret <= 3)).toBe(true); // first position, strings 3 to 1
    expect(midiAt({ string: 1, fret: 3 }) - midiAt({ string: 3, fret: 0 })).toBe(12);
    expect(getExercise('tech-rest-stroke')!.tempo).toEqual({ start: 60, step: 4, goal: 120 });
    // The two strokes are played on C at string 2 fret 1; a rest stroke there lands on string 3.
    for (const id of ['free-stroke', 'rest-stroke']) {
      const s = lesson('the-classical-position').steps.find((x) => (x as { id?: string }).id === id) as { note: string; where: { string: number; fret: number } };
      expect(noteAt(s.where)).toBe(s.note);
      expect(s.note).toBe('C4');
    }
    // The scale's notes on string 2 in first position: B, C and D (the fretboard question's answer).
    expect([0, 1, 2, 3].filter((f) => c.includes(noteAt({ string: 2, fret: f }, { octave: false }))).map((f) => noteAt({ string: 2, fret: f }, { octave: false }))).toEqual(['B', 'C', 'D']);
    expect(getExercise('tech-posture')!.steps.join(' ')).toMatch(/classical: put your left foot on a footstool or a support under the guitar, rest the guitar on your left thigh and bring the headstock up to about eye level/);
  });

  it('plays the arpeggio patterns of the Free-Stroke exercise on C, and the G7 the study holds', () => {
    const m = material('tech-pima-free-stroke', 'patterns');
    // p-i-m-a, then p-a-m-i, then p-i-m-a-m-i in 3/4: the 3/4 bar is the card's figure.
    expect(m.slice(0, 4)).toEqual(['5:3', '3:0', '2:1', '1:0']);
    expect(m.slice(16, 22)).toEqual(pos(PIMAMI_C));
    // p-i-m-i: the thumb on the root, i and m on strings 3 and 2 of the same C shape.
    expect(pos(PIMI_C)).toEqual(['5:3', '3:0', '2:1', '3:0', '5:3', '3:0', '2:1', '3:0']);
    expect(names(PIMI_C).slice(0, 4)).toEqual(['C', 'G', 'C', 'G']);
    expect(getExercise('tech-pima-free-stroke')!.tempo).toEqual({ start: 60, step: 4, goal: 120 });
    // The late-a recording: p-i-m-a on C, the fourth note a sixteenth (240 ticks) after its place.
    expect(pos(LATE_A).slice(0, 4)).toEqual(m.slice(0, 4));
    const ticks = { e: 480, 'e.': 720, s: 240 } as Record<string, number>;
    const onsets = durations(LATE_A).reduce<number[]>((acc, d, i) => [...acc, i === 0 ? 0 : acc[i - 1] + ticks[durations(LATE_A)[i - 1]]], []);
    expect(onsets.slice(0, 4)).toEqual([0, 480, 960, 1680]); // a should fall at 1440
    expect(onsets.slice(4)).toEqual([1920, 2400, 2880, 3600]);
  });

  it('sends the Giuliani and Aguado work to studies that really hold it', async () => {
    const study = await songBars('st-pima-arpeggios');
    expect(study.length).toBe(16);
    // Pinches (two notes struck together) only on beat 1 of bars 15 and 16.
    const pinches = study.flatMap((bar, i) => bar.filter((b) => b.includes('+')).map((b) => `${i + 1}:${b}`));
    expect(pinches).toEqual(['15:6:3+1:1', '16:6:3+1:1']);
    // The thumb's string follows the chord: 5 for C and Am (bars 1-8), 4 for Dm (9-12), 6 for G7 (13-16).
    expect(study.map((bar) => bar[0].split('+')[0].split(':')[0])).toEqual([...Array(8).fill('5'), ...Array(4).fill('4'), ...Array(4).fill('6')]);
    const s = await song('st-pima-arpeggios');
    expect(s.chords.map((c) => c.symbol)).toEqual(['C', 'Am', 'Dm', 'G7']);
    expect(s.tempo[0].bpm).toBe(66);
    // The G7 the chord-build asks for is the study's G7, and every struck note of bars 13-16 is in it.
    const g7 = study.slice(12).flat().flatMap((b) => b.split('+'));
    const shape = [3, 2, 0, 0, 0, 1]; // 320001, string 6 to string 1
    expect(g7.every((p) => shape[6 - Number(p.split(':')[0])] === Number(p.split(':')[1]))).toBe(true);
    expect(['6:3', '5:2', '4:0', '3:0', '2:0', '1:1'].map((p) => noteAt({ string: Number(p[0]), fret: Number(p.slice(2)) }, { octave: false }))).toEqual(['G', 'B', 'D', 'G', 'B', 'F']);
    // The A minor study: 3/4, Am Dm E (Am7 once), no barre, pinches with the tune on top in bars 9-16.
    const am = await song('st-pimami-3-4');
    expect(am.bars[0].time).toMatchObject({ numerator: 3, denominator: 4 });
    expect([...new Set(am.chords.map((c) => c.symbol))].sort()).toEqual(['Am', 'Am7', 'Dm', 'E']);
    const amBars = await songBars('st-pimami-3-4');
    expect(amBars.slice(0, 8).every((bar) => bar.every((b) => !b.includes('+')))).toBe(true);
    expect(amBars.slice(8, 15).every((bar) => bar[0].includes('+'))).toBe(true);
    const tune = amBars.slice(8, 15).map((bar) => bar[0].split('+')[1]).map((p) => midiAt({ string: Number(p[0]), fret: Number(p.slice(2)) }));
    expect(tune).toEqual(['E4', 'F4', 'G#4', 'E4', 'G4', 'F4', 'E4'].map((n) => noteToMidi(n)));
    expect(am.tempo[0].bpm).toBe(66);
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('shows bars 1 and 2 of the duo, both voices, exactly as the library has them', async () => {
    const s = await song('st-duet-baroque');
    const bar = (track: number, i: number) => s.tracks[track].measures[i].beats.filter((b) => b.notes.length > 0).map((b) => `${b.notes[0].string}:${b.notes[0].fret}/${b.duration}`);
    const ticks: Record<string, number> = { e: 480, q: 960, h: 1920 };
    const mine = (notes: TabNote[]) => struck(notes).map((n) => `${n.string}:${n.fret}/${ticks[n.duration]}`);
    expect(mine(DUO_UPPER)).toEqual([...bar(0, 0), ...bar(0, 1)]);
    expect(mine(DUO_BASS)).toEqual([...bar(1, 0), ...bar(1, 1)]);
    // The staff figures are the same notes, at sounding pitch.
    const l = lesson('first-classical-pieces');
    const staffs = l.steps.filter((x) => (x as { figure?: { kind: string } }).figure?.kind === 'staff').map((x) => (x as unknown as { figure: { notes: Array<{ note: string; duration: string }> } }).figure.notes);
    expect(staffs[0].map((n) => noteToMidi(n.note))).toEqual(struck(DUO_UPPER).map((n) => midiAt(n)));
    expect(staffs[0].map((n) => n.duration)).toEqual(durations(DUO_UPPER));
    expect(staffs[1].map((n) => noteToMidi(n.note))).toEqual(struck(DUO_BASS).map((n) => midiAt(n)));
    expect(staffs[1].map((n) => n.note)).toEqual(['D3', 'A2', 'C#3', 'A2']);
    expect(staffs[0].map((n) => n.note)).toEqual(['D4', 'E4', 'F4', 'E4', 'D4', 'C#4', 'D4', 'E4', 'F4', 'G4']);
    // First position, finger = fret: finger 4 holds string 5 fret 4 while the melody uses frets 1 to 3.
    expect(Math.max(...struck(DUO_UPPER).map((n) => n.fret))).toBe(3);
    expect(s.tempo[0].bpm).toBe(108);
    expect(s.bars.length).toBe(24);
    // Greensleeves, the solo two-voice piece: a bass struck with the tune on every dotted-quarter beat of bar 2.
    const g = await song('greensleeves-fingerstyle');
    expect(g.bars[0].length).toBe(480); // the pickup: the Player's bar 1
    expect(g.bars[1].time).toMatchObject({ numerator: 6, denominator: 8 });
    const twoVoices = g.tracks[0].measures[1].beats.filter((b) => b.notes.length === 2).map((b) => b.start);
    expect(twoVoices).toEqual([0, 1440]);
  });

  it('shows the slurs and the shift as the exercises play them, and the partial barre as the ballad holds it', async () => {
    const chains = material('tech-legato-chains', 'up-and-down');
    const s1 = pos(SLURS_S1);
    const at = chains.findIndex((p, i) => chains.slice(i, i + 6).join() === s1.join());
    expect(at).toBeGreaterThan(0);
    expect(names(SLURS_S1)).toEqual(['A', 'B', 'C', 'C', 'B', 'A']);
    expect(pos(SHIFTS)).toEqual(material('tech-position-shifts', 'quarters'));
    expect(pos(SHIFTS_UP)).toEqual(material('tech-position-shifts', 'quarters').slice(0, 5));
    expect(names(SHIFTS_UP)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(getExercise('tech-position-shifts')!.tempo).toEqual({ start: 60, step: 4, goal: 112 });
    expect(getExercise('tech-legato-chains')!.tempo.start).toBe(60);
    // The ballad: bar 2 is the fifth-position Am (x07555), bar 3 holds the hammer-on, bars 1-4 the loop.
    const b = await song('st-chord-melody-1');
    const chord = b.tracks[0].measures[1].beats[0].notes.map((n) => `${n.string}:${n.fret}`).sort();
    expect(chord).toEqual(['1:5', '2:5', '3:5', '4:7', '5:0']);
    expect(chord.map((p) => noteAt({ string: Number(p[0]), fret: Number(p.slice(2)) }, { octave: false })).sort()).toEqual(['A', 'A', 'A', 'C', 'E']);
    expect(b.tracks[0].measures[2].beats.some((x) => x.notes.some((n) => n.legato === 'hammer'))).toBe(true);
    expect(task('ballad-wait').params).toEqual(['st-chord-melody-1', 'm1-4', 'wait']);
  });

  it('vibrates the exercise\'s own note, and keeps the vibrato ladder', () => {
    const e = getExercise('tech-vibrato-classical')!;
    expect(e.parts[0].check).toMatchObject({ kind: 'vibrato', string: 1, fret: 7, style: 'classical', wavesPerBeat: 4 });
    expect(noteAt({ string: 1, fret: 7 })).toBe('B4');
    expect(e.tempo).toEqual({ start: 60, step: 4, goal: 72 });
    // The opening phrase loop: the pickup and four bars of Greensleeves are the Player's bars 1 to 5.
    expect(task('colours-phrase').params).toEqual(['greensleeves-fingerstyle', 'm1-5']);
  });

  it('plays tremolo as the exercise does, warns where it strains, and keeps Recuerdos behind a fallback', () => {
    const e = getExercise('tech-tremolo-pami')!;
    expect(pos(TREMOLO_OPEN)).toEqual(material('tech-tremolo-pami', 'open').slice(0, 16));
    expect(e.tempo).toEqual({ start: 40, step: 4, goal: 92 });
    expect(e.strain).toBeTruthy();
    expect(plain(task('tremolo-40').body)).toMatch(/stop if the hand or forearm aches/);
    // The gallop: the thumb holds half a beat, a-m-i share the other half as sixteenth triplets.
    expect(durations(GALLOP)).toEqual(['e', 'st', 'st', 'st', 'e', 'st', 'st', 'st']);
    expect(pos(GALLOP)).toEqual(['6:0', '1:0', '1:0', '1:0', '5:0', '1:0', '1:0', '1:0']);
    const etude = task('tremolo-etude');
    expect(etude.fallback).toMatchObject({ tool: 'technique', params: ['tech-tremolo-pami'] });
    expect(e.parts.map((p) => p.id)).toContain('melody');
    expect((etude.params ?? []).some((p) => /^t\d+$/.test(p))).toBe(false);
    expect(etude.params).toEqual(['st-concert-tremolo-etude', 'm1-4', 'wait']);
  });

  it('sends Recuerdos players to an etude that is p-a-m-i tremolo from its first bar, once it is in the library', async () => {
    if (!songEntry('st-concert-tremolo-etude')) return;
    const s = await song('st-concert-tremolo-etude');
    const bar1 = s.tracks[0].measures[0].beats.filter((b) => b.notes.length > 0);
    // Groups of four: the thumb on a bass string, then a, m and i on one treble note.
    for (let g = 0; g < bar1.length; g += 4) {
      const [p, a, m, i] = bar1.slice(g, g + 4).map((b) => b.notes[0]);
      expect(p.string).toBeGreaterThanOrEqual(3);
      expect([a, m, i].every((n) => n.midi === a.midi && n.string <= 2)).toBe(true);
    }
    expect(bar1[0].notes[0].pluck).toBe('p');
    expect(bar1.slice(1, 4).map((b) => b.notes[0].pluck)).toEqual(['a', 'm', 'i']);
    expect(s.bars.length).toBeGreaterThanOrEqual(4);
  });

  it('swaps only pieces the library does not hold', () => {
    for (const id of ['giuliani-op1-arpeggios', 'aguado-estudio-a-minor', 'carulli-andantino-op241-no5', 'sor-op60-no1', 'minuet-in-g-two-voice', 'lagrima', 'adelita', 'recuerdos-de-la-alhambra']) {
      expect(songEntry(id), id).toBeUndefined();
    }
    for (const id of ['st-pima-arpeggios', 'st-pimami-3-4', 'st-duet-baroque', 'greensleeves-fingerstyle', 'st-chord-melody-1']) expect(songEntry(id), id).toBeTruthy();
  });
});
