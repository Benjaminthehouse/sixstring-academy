/**
 * Cross-checks for Prof. Varga's unit 13 (Transcription and performance) against the theory and
 * guitar engines, the progression catalog, the song library, Ear Training's drills, the technique
 * exercises and the Practice Plan: Elena's melody and solo are what the cards and questions say
 * they are, the progressions are the catalog's and their bass lines are what the learner is asked
 * to hear, the memory map is the A minor study's real form and harmony, the show is the library's
 * Irish Washerwoman, every tempo and bar a task names exists, and every swapped classical solo is
 * really missing from the library. Run with
 * `npx vitest run src/content/teachers/elena/elena-ear-and-stage.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/teachers.json';
import repertoire from '@/content/plan/repertoire.json';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, classifyCadence, noteToMidi, romanToChord, scaleNotes, staffPosition } from '@/core/theory';
import { DRILLS } from '@/features/ear/core/drills';
import { AREA_INFO } from '@/features/practice/model/areas';
import { MAX_OPEN_GOALS } from '@/features/practice/model/goals';
import { chordSoundMidi } from '@/lessons/sound';
import { estimateLessonSeconds, formatProblems, parseRhythm, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson } from '../types';
import unit, { DECEPTIVE, MELODY, MELODY_BARS, MELODY_STAFF, MELODY_TEMPO, SOLO, SOLO_BARS, SOLO_CHORDS, SOLO_TEMPO, STUDY_TUNE, TURNAROUND, WASHERWOMAN_OPENING } from './elena-ear-and-stage';

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

function tasks(): TaskStep[] {
  return unit.lessons.flatMap((l) => l.steps.filter(isTaskStep));
}

function task(id: string): TaskStep {
  const found = tasks().find((x) => x.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
}

/** A step of a lesson by type and a piece of its prompt, title or statement. */
function step<T = Record<string, unknown>>(lessonId: string, type: string, text: string): T {
  const found = lesson(lessonId).steps.find((s) => {
    const x = s as { type?: string; prompt?: string; title?: string; statement?: string };
    return x.type === type && [x.prompt, x.title, x.statement].some((v) => typeof v === 'string' && v.includes(text));
  });
  if (!found) throw new Error(`no ${type} "${text}" in ${lessonId}`);
  return found as T;
}

/** The note names a text marks with `{n:...}`, in order. */
function tagged(text: string): string[] {
  return [...text.matchAll(/\{n:([A-G][#b]?)\d?\}/g)].map((m) => m[1]);
}

type Fretted = TabNote & { string: number; fret: number };
const struck = (notes: readonly TabNote[]) => notes.filter((n): n is Fretted => 'string' in n);
const TICKS: Record<string, number> = { s: 240, e: 480, q: 960, 'q.': 1440, h: 1920, 'h.': 2880, w: 3840 };
const ticksOf = (notes: readonly TabNote[]) => notes.reduce((sum, n) => sum + TICKS[n.duration], 0);
const names = (notes: readonly TabNote[], context: NonNullable<Parameters<typeof noteAt>[1]>['context']) => struck(notes).map((n) => noteAt(n, { octave: false, context }));
/** The notes struck in a bar, with where they start. */
function onsets(bar: readonly TabNote[]): Array<{ tick: number; note: Fretted }> {
  const out: Array<{ tick: number; note: Fretted }> = [];
  let tick = 0;
  for (const n of bar) {
    if ('string' in n) out.push({ tick, note: n as Fretted });
    tick += TICKS[n.duration];
  }
  return out;
}

const course = compileCourse(courseMeta('elena'), [unit]);
const planUnit = (plan as { courses: Array<{ id: string; units: Array<{ id: string; lessons: Array<{ id: string; minutes: number; music: string[] }> }> }> }).courses
  .find((c) => c.id === 'elena')!
  .units.find((u) => u.id === 'elena-ear-and-stage')!;

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 13: Transcription and performance', () => {
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

  it('follows the plan: one lesson per entry, and the engine part plus its tasks near the planned minutes', () => {
    expect(unit.lessons.map((l) => l.id)).toEqual(planUnit.lessons.map((l) => l.id.split('/')[2]));
    for (const l of unit.lessons) {
      const planned = planUnit.lessons.find((p) => p.id.endsWith(`/${l.id}`))!.minutes;
      const total = l.minutes + l.steps.filter(isTaskStep).reduce((n, s) => n + s.minutes, 0);
      expect(Math.abs(total - planned), `${l.id}: ${total} min against the plan's ${planned}`).toBeLessThanOrEqual(5);
    }
    const ids = unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, 'fact ids carry the unit prefix, so no other unit can collide').toMatch(/^es-/);
  });

  describe("Elena's melody", () => {
    it('is eight full bars of 3/4 in first position, all in G major', () => {
      expect(MELODY_BARS.length).toBe(8);
      for (const bar of MELODY_BARS) expect(ticksOf(bar)).toBe(2880);
      expect(struck(MELODY).every((n) => n.fret <= 4)).toBe(true);
      const g = scaleNotes('G', 'major');
      expect(names(MELODY, { key: 'G major' }).every((n) => g.includes(n))).toBe(true);
      expect(parseRhythm({ pattern: 'q q q', time: '3/4' }).barTicks).toBe(2880);
    });

    it('opens on the open string 4, holds C natural and F sharp, and ends home on G: G major, not E minor or D or C', () => {
      const ns = names(MELODY, { key: 'G major' });
      expect(struck(MELODY)[0]).toMatchObject({ string: 4, fret: 0 });
      expect(ns.slice(0, 3)).toEqual(['D', 'G', 'B']); // a G triad climbing
      expect(ns[ns.length - 1]).toBe('G');
      expect(names(MELODY_BARS[1], { key: 'G major' })).toContain('C');
      expect(names(MELODY_BARS[6], { key: 'G major' })).toContain('C');
      expect(ns).toContain('F#');
      expect(scaleNotes('D', 'major')).toContain('C#');
      expect(scaleNotes('C', 'major')).not.toContain('F#');
      expect(scaleNotes('E', 'minor').sort()).toEqual(scaleNotes('G', 'major').sort()); // the same signature
    });

    it('ends phrase one open, on A, and spells D7 without its root in bar 7', () => {
      expect(names(MELODY_BARS[3], { key: 'G major' })).toEqual(['A']);
      expect(MELODY_BARS[3][0].duration).toBe('h.');
      const bar7 = names(MELODY_BARS[6], { key: 'G major' });
      expect(bar7).toEqual(['C', 'A', 'F#']);
      expect(chordNotes('D7')).toEqual(['D', 'F#', 'A', 'C']);
      expect(bar7.every((n) => chordNotes('D7').includes(n)) && !bar7.includes('D')).toBe(true);
      const m = struck(MELODY_BARS[6]).map((n) => midiAt(n));
      expect([m[0] - m[1], m[1] - m[2]]).toEqual([3, 3]); // falling minor thirds
    });

    it('asks the questions the melody answers', () => {
      // Pass two: bars 3 and 4, tapped.
      const tap = step<{ rhythm: { pattern: string; time: string }; tempo: number }>('transcribing-melodies', 'tap-rhythm', 'Bars 3 and 4');
      expect(tap.rhythm.pattern.replace(/\s*\|\s*/g, ' ').split(' ')).toEqual([...MELODY_BARS[2], ...MELODY_BARS[3]].map((n) => n.duration));
      expect(tap.tempo).toBe(MELODY_TEMPO);
      // Pass three: bars 1 and 2 in order, bar 7 filled, the leading note written.
      const order = step<{ tiles: string[] }>('transcribing-melodies', 'order', 'Bars 1 and 2');
      expect(order.tiles.map((x) => tagged(x)[0])).toEqual(names(MELODY_BARS.slice(0, 2).flat(), { key: 'G major' }));
      const fill = step<{ blanks: string[]; text: string }>('transcribing-melodies', 'fill-blanks', 'bar 7');
      expect([tagged(fill.text)[0], ...fill.blanks.map((b) => tagged(b)[0])]).toEqual(names(MELODY_BARS[6], { key: 'G major' }));
      const place = step<{ note: string; key: string }>('transcribing-melodies', 'staff-place', 'leading note');
      const last7 = struck(MELODY_BARS[6])[2];
      expect(last7).toMatchObject({ string: 4, fret: 4 });
      expect(noteAt(last7, { context: { key: 'G major' } })).toBe(place.note);
      expect(staffPosition(place.note).position).toBe(1); // the bottom space, as the explanation says
      expect(scaleNotes('G', 'major')[6]).toBe('F#'); // the leading note, already in the signature
      // Bar 3 is not three even quarters.
      expect(MELODY_BARS[2].map((n) => n.duration)).toEqual(['q.', 'e', 'q']);
    });

    it('reveals exactly the melody it plays', () => {
      expect(MELODY_STAFF.map((n) => noteToMidi(n.note))).toEqual(struck(MELODY).map((n) => midiAt(n)));
      expect(MELODY_STAFF.map((n) => n.duration)).toEqual(MELODY.map((n) => n.duration));
      expect(MELODY_STAFF.some((n) => n.note === 'F#3')).toBe(true);
    });
  });

  describe("Elena's solo", () => {
    it('is two full choruses of the 12-bar blues in A', () => {
      expect(SOLO_BARS.length).toBe(24);
      expect(SOLO_CHORDS.length).toBe(24);
      for (const bar of SOLO_BARS) expect(ticksOf(bar)).toBe(3840);
      const chorus = ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7'];
      expect(SOLO_CHORDS.slice(0, 11)).toEqual(chorus);
      expect(SOLO_CHORDS.slice(12, 23)).toEqual(chorus);
      expect([SOLO_CHORDS[11], SOLO_CHORDS[23]]).toEqual(['E7', 'A7']); // a turnaround, then the ending
      expect(SOLO).toEqual(SOLO_BARS.flat());
    });

    it('strikes a chord tone on every beat 1 and 3, except the blue third in bar 2', () => {
      const misses: string[] = [];
      let strongNotes = 0;
      SOLO_BARS.forEach((bar, i) => {
        for (const { tick, note } of onsets(bar)) {
          if (tick !== 0 && tick !== 1920) continue;
          strongNotes++;
          const name = noteAt(note, { octave: false, context: { chord: SOLO_CHORDS[i] } });
          if (!chordNotes(SOLO_CHORDS[i]).includes(name)) misses.push(`bar ${i + 1} beat ${tick / 960 + 1}: ${name}`);
        }
      });
      expect(misses).toEqual(['bar 2 beat 1: C']);
      expect(chordNotes('A7')).toEqual(['A', 'C#', 'E', 'G']);
      expect(names(SOLO_BARS[1], { chord: 'A7' }).slice(0, 2)).toEqual(['C', 'C#']); // resolved at once
      expect(strongNotes, 'most strong beats carry a note').toBeGreaterThan(24);
      // The pentatonic would put D and C on strong beats over A7: neither is a chord tone.
      expect(scaleNotes('A', 'minor-pentatonic')).toEqual(['A', 'C', 'D', 'E', 'G']);
      expect(['C', 'D'].some((n) => chordNotes('A7').includes(n))).toBe(false);
    });

    it('builds everything from one motif: moved to D7, played backwards, and closing the solo', () => {
      const bar = (n: number, chord: string) => names(SOLO_BARS[n - 1], { chord });
      const rhythm = (n: number) => SOLO_BARS[n - 1].map((x) => ('rest' in x ? `${x.duration}r` : x.duration)).join(' ');
      expect(bar(1, 'A7')).toEqual(['E', 'C#', 'A']);
      expect(rhythm(1)).toBe('qr e e q qr');
      for (const n of [3, 7]) expect(SOLO_BARS[n - 1]).toEqual(SOLO_BARS[0]);
      // Bar 5: the same shape, fifth-third-root of D7, in the same rhythm.
      expect(bar(5, 'D7')).toEqual(['A', 'F#', 'D']);
      expect(rhythm(5)).toBe(rhythm(1));
      const role = (names_: string[], chord: string) => names_.map((x) => chordNotes(chord).indexOf(x));
      expect(role(bar(1, 'A7'), 'A7')).toEqual([2, 1, 0]);
      expect(role(bar(5, 'D7'), 'D7')).toEqual([2, 1, 0]);
      // Chorus 2: backwards on A7 (bars 13 and 15) and on D7 (bar 17); the first idea returns at bar 23.
      expect(bar(13, 'A7')).toEqual([...bar(1, 'A7')].reverse());
      expect(SOLO_BARS[14]).toEqual(SOLO_BARS[12]);
      expect(bar(17, 'D7')).toEqual([...bar(5, 'D7')].reverse());
      expect(SOLO_BARS[22].slice(0, 4)).toEqual(SOLO_BARS[0].slice(0, 4));
      // The tab card shows bar 1, then bar 5.
      const card = lesson('transcribing-a-solo').steps.find((s) => (s as { title?: string }).title === 'Then analyse it') as { figure: { notes: TabNote[] } };
      expect(card.figure.notes).toEqual([...SOLO_BARS[0], ...SOLO_BARS[4]]);
      const choice = step<{ prompt: string }>('transcribing-a-solo', 'choice', 'Bar 5 plays');
      expect(tagged(choice.prompt)).toEqual(bar(5, 'D7'));
    });

    it('leaves space in bar 8 and climbs to its high C in bars 16 and 18', () => {
      expect(SOLO_BARS[7].map((n) => ('rest' in n ? `r${n.duration}` : n.duration))).toEqual(['h', 'rh']);
      const top = (bars: readonly TabNote[][]) => Math.max(...struck(bars.flat()).map((n) => midiAt(n)));
      expect(top(SOLO_BARS.slice(0, 12))).toBeLessThan(noteToMidi('C5'));
      expect(top(SOLO_BARS)).toBe(noteToMidi('C5'));
      const highC = SOLO_BARS.map((b, i) => (struck(b).some((n) => midiAt(n) === noteToMidi('C5')) ? i + 1 : 0)).filter(Boolean);
      expect(highC).toEqual([16, 18]);
      // Bar 4 holds the seventh of A7, G, at string 2 fret 8, then falls to E.
      expect(names(SOLO_BARS[3], { chord: 'A7' })).toEqual(['G', 'E']);
      expect(struck(SOLO_BARS[3])[0]).toMatchObject({ string: 2, fret: 8, duration: 'h' });
    });

    it('asks the questions bars 1 to 4 answer', () => {
      const tap = step<{ rhythm: { pattern: string }; tempo: number }>('transcribing-a-solo', 'tap-rhythm', 'Bars 1 and 2');
      const want = [...SOLO_BARS[0], ...SOLO_BARS[1]].map((n) => ('rest' in n ? `${n.duration}r` : n.duration));
      expect(tap.rhythm.pattern.replace(/\s*\|\s*/g, ' ').split(' ')).toEqual(want);
      expect(tap.tempo).toBe(SOLO_TEMPO);
      const order = step<{ tiles: string[] }>('transcribing-a-solo', 'order', 'bars 1 and 2');
      expect(order.tiles.map((x) => tagged(x)[0])).toEqual(names([...SOLO_BARS[0], ...SOLO_BARS[1]], { key: 'A major' }));
      const play = step<{ notes: TabNote[]; alternative: { tiles: string[] } }>('transcribing-a-solo', 'play-phrase', 'Bars 1 to 4');
      expect(play.notes).toEqual(SOLO_BARS.slice(0, 4).flat());
      expect(play.alternative.tiles.map((x) => tagged(x)[0])).toEqual(names([...SOLO_BARS[2], ...SOLO_BARS[3]], { key: 'A major' }));
      expect(struck(SOLO_BARS.slice(0, 22).flat()).every((n) => n.fret >= 4 && n.fret <= 8)).toBe(true); // around fifth position
    });
  });

  describe('the progressions', () => {
    it("are the catalog's, in C", () => {
      const symbols = (id: string) => progressionInKey(id, 'C').bars.flatMap((b) => b.map((c) => c.symbol));
      expect(symbols('jazz-i-vi7-ii-v')).toEqual([...TURNAROUND]);
      expect(symbols('classical-deceptive')).toEqual([...DECEPTIVE]);
      for (const id of ['jazz-i-vi7-ii-v', 'classical-deceptive']) expect(keyChoices(getProgression(id)!)).toContain('C');
      expect(task('deceptive-hidden').params).toEqual(['classical-deceptive', 'c', 'jam']);
      expect(task('turnaround-band').params).toEqual(['jazz-i-vi7-ii-v', 'c', 'jam']);
    });

    it('sound the bass lines the learner is asked to hear', () => {
      const bass = (chords: readonly string[]) => chords.map((c) => Math.min(...chordSoundMidi(c)!));
      const jazz = bass(TURNAROUND);
      expect(jazz).toEqual(['C3', 'A2', 'D3', 'G2'].map((n) => noteToMidi(n)));
      expect([jazz[1] - jazz[0], jazz[2] - jazz[1], jazz[3] - jazz[2]]).toEqual([-3, 5, -7]); // falls to A, up a fourth to D, down a fifth to G
      const listen = step<{ options: Array<{ text: string; correct?: boolean }> }>('transcribing-harmony', 'listen-choice', 'the bass');
      expect(tagged(listen.options.find((o) => o.correct)!.text)).toEqual(['C', 'A', 'D', 'G']);
      const dec = bass(DECEPTIVE).map((m) => m % 12);
      expect(dec).toEqual(['C', 'F', 'G', 'A', 'F', 'D', 'G', 'C'].map((n) => noteToMidi(`${n}4`) % 12));
      const order = step<{ tiles: string[] }>('transcribing-harmony', 'order', 'bass line');
      expect(order.tiles.map((x) => tagged(x)[0])).toEqual(['C', 'F', 'G', 'A', 'F', 'D', 'G', 'C']);
      // Bar 4: G7 up a step to Am, a deceptive cadence; bar 8 the real one.
      expect(bass(DECEPTIVE)[3] - bass(DECEPTIVE)[2]).toBe(2);
      expect(classifyCadence([DECEPTIVE[2], DECEPTIVE[3]], 'C')!.type).toBe('deceptive');
      expect(classifyCadence([DECEPTIVE[6], DECEPTIVE[7]], 'C')!.type).toBe('authentic');
      // Chord 3 of the turnaround shares three notes with F.
      expect(chordNotes('Dm7').filter((n) => chordNotes('F').includes(n))).toEqual(['F', 'A', 'C']);
    });

    it('make the A7 a secondary dominant, given away by its C sharp', () => {
      expect(romanToChord('V7/ii', 'C')).toBe('A7');
      expect(chordNotes('A7')).toContain('C#');
      expect(scaleNotes('C', 'major')).not.toContain('C#');
      expect(chordNotes('Am7')).toEqual(['A', 'C', 'E', 'G']);
      expect(chordNotes('Amaj7')).toContain('G#');
      const fill = step<{ blanks: string[]; text: string }>('transcribing-harmony', 'fill-blanks', 'chart');
      expect(fill.blanks).toEqual(['{c:A7}', '{c:G7}']);
      expect(fill.text).toMatch(/\{c:Cmaj7\}.*___.*\{c:Dm7\}.*___/);
    });
  });

  describe('the memory map', () => {
    it("is the A minor study's real form, harmony, cadences and tune", async () => {
      const s = await song('st-pimami-3-4');
      expect(s.sections).toEqual([{ name: 'Arpeggios', start: 0, end: 8 }, { name: 'Melody on top', start: 8, end: 16 }]);
      expect(s.bars.length).toBe(16);
      expect(s.tempo[0].bpm).toBe(66); // the metronome task's tempo
      const chords = s.chords.map((c) => c.symbol);
      for (const start of [0, 4, 8, 12]) expect(chords.slice(start, start + 4).map((c) => c.replace('Am7', 'Am'))).toEqual(['Am', 'Dm', 'E', 'Am']);
      expect(chords[12]).toBe('Am7');
      expect(chordNotes('Am7')).toContain('G');
      expect(chordNotes('E')).toContain('G#');
      expect(classifyCadence(['E', 'Am'], 'A minor')!.type).toBe('authentic');
      // Bar 9: thumb and a together, the a finger on the tune.
      const pinch = s.tracks[0].measures[8].beats[0].notes;
      expect(pinch.map((n) => n.pluck)).toEqual(['p', 'a']);
      // The tune of bars 9 to 15 is the play-phrase, and its chords are the ones the explanation names.
      const tops = s.tracks[0].measures.slice(8, 15).map((m) => Math.max(...m.beats[0].notes.map((n) => n.midi)));
      expect(struck(STUDY_TUNE).map((n) => midiAt(n))).toEqual(tops);
      expect(names(STUDY_TUNE, { key: 'A minor' })).toEqual(['E', 'F', 'G#', 'E', 'G', 'F', 'E']);
      expect(chords.slice(8, 15)).toEqual(['Am', 'Dm', 'E', 'Am', 'Am7', 'Dm', 'E']);
      const play = step<{ notes: TabNote[]; tempo: number }>('memorising', 'play-phrase', 'tune');
      expect(play.notes).toEqual(STUDY_TUNE);
      expect(play.tempo).toBe(66);
      expect(ticksOf(STUDY_TUNE)).toBe(7 * 2880);
    });

    it('starts the study anywhere, and sends the recovery points to phrase starts', async () => {
      const s = await song('st-pimami-3-4');
      expect(task('start-anywhere').params).toEqual(['st-pimami-3-4', 'm7']);
      for (const b of [7, 12, 3, 14, 10]) expect(b).toBeLessThanOrEqual(s.bars.length);
      expect(plain(task('start-anywhere').body)).toMatch(/bars 12, 3, 14 and 10/);
      // Phrases of four bars start at 1, 5, 9 and 13: after a slip in bar 10 the next is 13.
      expect([1, 5, 9, 13].find((b) => b > 10)).toBe(13);
      const type = step<{ answer: { value: number } }>('memorising', 'type-answer', 'section B');
      expect(type.answer.value).toBe(s.sections[1].start + 1);
    });

    it('describes Lagrima and the Prelude BWV 999 as the plan has them', () => {
      const pieces = (repertoire as { pieces: Array<{ id: string; key: string; meter: string; notes: string; tempo: number }> }).pieces;
      const lagrima = pieces.find((p) => p.id === 'lagrima')!;
      expect(lagrima.key).toBe('E major');
      expect(lagrima.notes).toMatch(/first in E major, the second in E minor, then a return to the opening/);
      const bwv = pieces.find((p) => p.id === 'bach-prelude-bwv999')!;
      expect(bwv.key).toBe('D minor');
      expect(bwv.notes).toMatch(/continuous arpeggio/);
      expect(pieces.find((p) => p.id === 'asturias')!.tempo).toBe(120); // the goal in the recital lesson
      expect(planUnit.lessons.find((l) => l.id.endsWith('/memorising'))!.music).toEqual(['lagrima', 'bach-prelude-bwv999']);
    });
  });

  describe('the tasks', () => {
    it('name tempos that add up, and loop bars that exist', async () => {
      const bpm = async (id: string) => (await song(id)).tempo[0].bpm;
      expect(task('korobeiniki-by-ear').params).toEqual(['korobeiniki', 'm1-4', 't70']);
      expect(((await bpm('korobeiniki')) * 70) / 100).toBe(70);
      expect(plain(task('korobeiniki-by-ear').body)).toMatch(/70 % \(70 BPM\)/);
      expect((await song('korobeiniki')).bars.length).toBe(8); // "then bars 5 to 8"
      expect(task('second-solo').params).toEqual(['st-minor-blues-a', 'm1-2']);
      expect(await bpm('st-minor-blues-a')).toBe(80);
      expect(task('ballad-flow').params).toEqual(['st-chord-melody-2', 'flow']);
      expect(await bpm('st-chord-melody-2')).toBe(60);
      expect(task('run-through').params).toEqual(['st-pimami-3-4', 'flow']);
      // The blues jam's band shuffles, and 100 BPM is inside its range.
      const blues = getProgression('blues-12-bar')!;
      expect(blues.feel.backing).toBe('blues-shuffle');
      expect(blues.feel.tempo[0] <= 100 && blues.feel.tempo[1] >= 100).toBe(true);
      expect(task('own-solo').params).toEqual(['blues-12-bar', 'a', 'jam']);
      expect(keyChoices(blues)).toContain('A');
    });

    it('send the learner to the Ear Training drills they describe', () => {
      const level = (drill: 'melody' | 'degrees' | 'chords', n: number) => DRILLS[drill].levels.find((l) => l.n === n)!;
      expect(task('melodic-dictation').params).toEqual(['melody', '7']);
      expect(level('melody', 7).blurb).toBe('Six notes, leaps and repeats');
      expect(Math.max(...DRILLS.melody.levels.map((l) => l.n))).toBe(7); // the longest the drill offers
      expect(task('bass-dictation').params).toEqual(['degrees', '4']);
      expect(level('degrees', 4).pool).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect(task('sevenths-drill').params).toEqual(['chords', '7']);
      expect(level('chords', 7).pool).toEqual(['maj7', '7', 'm7', 'm7b5', 'dim7']);
    });

    it('use the technique exercises and Practice Plan features they describe', () => {
      const warm = getExercise('tech-warm-up')!;
      expect(warm.routine!.map((r) => r.id)).toEqual(['open-strings', 'spider', 'changes', 'legato', 'scale']);
      expect(plain(task('warm-up-plan').body)).toMatch(/open strings, the spider, two easy chords, slurs, a slow scale/);
      expect(getExercise('tech-play-without-pain')).toBeTruthy();
      expect(AREA_INFO.repertoire.label).toBe('Songs'); // "one Songs block per piece"
      expect(MAX_OPEN_GOALS).toBe(3); // "the plan keeps three open at once"
      expect(task('recital-recorded').params).toEqual(['routines']);
      expect(task('next-year').params).toEqual(['goals']);
    });

    it('teach Scan & Import where the app has it', async () => {
      const { ROUTE_BY_NAME } = await import('@/app/routes');
      expect(ROUTE_BY_NAME.scan).toMatchObject({ title: 'Scan & Import', section: 'tools' });
      const texts = unit.lessons.flatMap((l) => l.steps.map((s) => plain((s as { body?: RichText }).body)));
      expect(texts.filter((x) => x.includes('Scan & Import')).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('the recital', () => {
    it("times the jazz ballad from the library's own bars and tempo", async () => {
      const s = await song('st-chord-melody-2');
      const ans = step<{ answer: { value: number }; prompt: string }>('recital', 'type-answer', 'jazz ballad');
      expect(s.bars.length).toBe(32);
      expect(s.bars[0].time).toEqual({ numerator: 4, denominator: 4 });
      expect(ans.prompt).toMatch(/32 bars of 4\/4 at 60 BPM/);
      expect(ans.answer.value).toBe((32 * 4 * 60) / s.tempo[0].bpm);
      // The bars move between eighth and tenth position, as the rehearsal task warns.
      const frets = new Set(s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.fret))).filter((f) => f > 0));
      expect(frets.has(8) && frets.has(10)).toBe(true);
    });

    it('performs the opening of The Irish Washerwoman exactly as the library has it, at full speed', async () => {
      const s = await song('irish-washerwoman');
      const lib = s.tracks[0].measures.slice(0, 3).flatMap((m) => m.beats.map((b) => `${b.notes[0].string}:${b.notes[0].fret}/${b.duration}`));
      expect(WASHERWOMAN_OPENING.map((n) => `${(n as Fretted).string}:${(n as Fretted).fret}/${TICKS[n.duration]}`)).toEqual(lib);
      const show = lesson('recital').steps.find((x) => (x as { id?: string }).id === 'show') as { tempo: number; explain: string; notes: TabNote[]; alternative: { tiles: string[] } };
      expect(show.notes).toEqual(WASHERWOMAN_OPENING);
      expect(show.tempo).toBe(s.tempo[0].bpm);
      expect(tagged(show.explain)).toEqual(names(WASHERWOMAN_OPENING, { key: 'G major' }));
      expect(show.alternative.tiles.map((x) => tagged(x)[0])).toEqual(names(WASHERWOMAN_OPENING.slice(2, 8), { key: 'G major' }));
      expect(unit.milestone).toMatchObject({ lesson: 'recital', step: 'show', song: 'irish-washerwoman', piece: 'The Irish Washerwoman' });
      expect(songEntry('irish-washerwoman')!.title).toBe(unit.milestone!.piece);
    });

    it('swaps only the classical solos the library does not hold', () => {
      for (const id of ['lagrima', 'bach-prelude-bwv999', 'gran-vals', 'asturias']) expect(songEntry(id), id).toBeUndefined();
      for (const id of ['st-pimami-3-4', 'st-concert-tremolo-etude', 'st-chord-melody-2', 'irish-washerwoman', 'korobeiniki', 'st-minor-blues-a']) expect(songEntry(id), id).toBeTruthy();
      const music = planUnit.lessons.flatMap((l) => l.music);
      for (const id of music) {
        if (songEntry(id) || getExercise(id)) continue;
        expect(['lagrima', 'bach-prelude-bwv999', 'gran-vals', 'asturias'], `${id} is missing and not reported as a swap`).toContain(id);
      }
      for (const id of ['tech-warm-up', 'tech-play-without-pain']) expect(music).toContain(id);
      const linked = tasks().map((x) => taskSong(x)).filter(Boolean);
      expect(linked).toContain('st-chord-melody-2');
    });
  });
});
