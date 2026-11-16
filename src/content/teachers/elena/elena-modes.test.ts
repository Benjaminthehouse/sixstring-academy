/**
 * Cross-checks for Prof. Varga's unit 2 (The modes in practice) against the theory and guitar
 * engines, the progression catalog and the song library: the seven modes on A and their colour
 * notes, the positions the figures and the Scales task use, every play-note and fretboard-name
 * claim, the chords of every vamp and jam, Phrygian dominant and the Andalusian cadence, the Locrian
 * chords, the model Lydian phrase, the claims each Player task makes about its study, and the BPM
 * every Player task names. Run with `npx vitest run src/content/teachers/elena/elena-modes.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { identifyFretted, midiAt, noteAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, intervalBetween, progressionToChords, scaleNotes, semitones } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type PlayPhraseExercise } from '@/lessons';
import { levelOf, drillById } from '@/features/ear/core/drills';
import { parseAddress } from '@/features/progressions/model/address';
import { parseScaleParams } from '@/features/scales/model/address';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, { modePosition } from './elena-modes';

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

function steps<T>(lessonId: string, type: string): T[] {
  return lesson(lessonId).steps.filter((x) => (x as { type?: string }).type === type) as unknown as T[];
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

/** The chord symbols of a jam task, in order, as the band plays them. */
function jamChords(id: string): string[] {
  const a = parseAddress(task(id).params ?? []);
  expect(a.view, id).toBe('jam');
  if (a.view !== 'jam') return [];
  return progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol);
}

/** Every chord symbol a song uses. */
function songChords(s: Song): Set<string> {
  return new Set(s.chords.map((c) => c.symbol));
}

const course = compileCourse(courseMeta('elena'), [unit]);
const name = (string: number, fret: number, context?: { chord: string } | { tonic: string; scale: string }) => noteAt({ string, fret }, { octave: false, context });
const above = (low: { string: number; fret: number }, high: { string: number; fret: number }) => midiAt(high) - midiAt(low);

/** The colour notes on A, with their degree labels and their distance above A in half steps. */
const COLOUR: Record<string, [note: string, degree: string, half: number]> = {
  dorian: ['F#', '6', 9],
  phrygian: ['Bb', 'b2', 1],
  lydian: ['D#', '#4', 6],
  mixolydian: ['G', 'b7', 10],
  minor: ['F', 'b6', 8],
  locrian: ['Eb', 'b5', 6],
};

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 2: The modes in practice', () => {
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

  it('spells the seven modes on A as the plan\'s table does', () => {
    expect(scaleNotes('A', 'major')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']);
    expect(scaleNotes('A', 'dorian')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(scaleNotes('A', 'phrygian')).toEqual(['A', 'Bb', 'C', 'D', 'E', 'F', 'G']);
    expect(scaleNotes('A', 'lydian')).toEqual(['A', 'B', 'C#', 'D#', 'E', 'F#', 'G#']);
    expect(scaleNotes('A', 'mixolydian')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G']);
    expect(scaleNotes('A', 'minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(scaleNotes('A', 'locrian')).toEqual(['A', 'Bb', 'C', 'D', 'Eb', 'F', 'G']);
  });

  it('names each colour note as the one note that sets its mode apart from plain major or minor', () => {
    for (const [mode, [note, , half]] of Object.entries(COLOUR)) {
      const notes = scaleNotes('A', mode);
      expect(notes, mode).toContain(note);
      expect(semitones(intervalBetween('A', note)), mode).toBe(half);
      // Major modes against A major, minor modes against A natural minor: one note differs, and it is the colour.
      const yardstick = notes.includes('C#') ? scaleNotes('A', 'major') : scaleNotes('A', 'minor');
      const differs = notes.filter((n) => !yardstick.includes(n));
      if (mode === 'locrian') expect(differs.sort(), mode).toEqual(['Bb', 'Eb']);
      else if (mode !== 'minor') expect(differs, mode).toEqual([note]);
    }
    // The match-pairs say exactly this.
    const match = steps<{ pairs: Array<{ left: string; right: string }> }>('modes-as-colours', 'match-pairs')[0];
    const byMode: Record<string, string> = { Dorian: 'dorian', Phrygian: 'phrygian', Lydian: 'lydian', Mixolydian: 'mixolydian', Aeolian: 'minor', Locrian: 'locrian' };
    for (const p of match.pairs) {
      const [note, degree] = COLOUR[byMode[p.left]];
      expect(p.right, p.left).toBe(`{d:${degree}}: {n:${note}}`);
    }
  });

  it('draws each mode in the position the cards and the Scales task name', () => {
    const fifth = ['dorian', 'phrygian', 'minor', 'locrian'];
    const fourth = ['major', 'lydian', 'mixolydian'];
    for (const m of fifth) expect(modePosition(m).position, m).toBe(5);
    for (const m of fourth) expect(modePosition(m).position, m).toBe(4);
    for (const m of ['dorian', 'minor', 'phrygian', 'locrian', 'mixolydian']) {
      const p = modePosition(m);
      expect(p.notes.every((n) => scaleNotes('A', m).includes(n.note)), m).toBe(true);
      expect(p.notes.some((n) => n.note === COLOUR[m][0]), `${m} shows its colour note`).toBe(true);
    }
    expect(parseScaleParams(task('scales-modes-on-a').params ?? [])).toEqual({ tonic: 'A', scale: 'dorian', shape: 'caged-e' });
  });

  it('plays every colour note where the steps say', () => {
    const plays = unit.lessons.flatMap((l) => l.steps.filter((s) => (s as { type?: string }).type === 'play-note')) as Array<{ note: string; where: { string: number; fret: number } }>;
    const want: Array<[string, number, number]> = [['F#4', 2, 7], ['F4', 2, 6], ['G3', 4, 5], ['D#4', 3, 8]];
    expect(plays.map((p) => [p.note, p.where.string, p.where.fret])).toEqual(want);
    expect([midiAt({ string: 2, fret: 7 }), midiAt({ string: 2, fret: 6 }), midiAt({ string: 4, fret: 5 }), midiAt({ string: 3, fret: 8 })]).toEqual([66, 65, 55, 63]);
    // String 3 fret 8 and string 2 fret 4 are the same D#; string 4 fret 5 is the open G string's pitch.
    expect(midiAt({ string: 2, fret: 4 })).toBe(midiAt({ string: 3, fret: 8 }));
    expect(midiAt({ string: 3, fret: 0 })).toBe(midiAt({ string: 4, fret: 5 }));
  });

  it('asks fretboard-name questions whose explanations count the half steps right', () => {
    const root = { string: 4, fret: 7 };
    expect(name(4, 7)).toBe('A');
    expect(above(root, { string: 2, fret: 7 })).toBe(9);
    expect(above(root, { string: 3, fret: 8 })).toBe(6);
    expect(name(2, 7)).toBe('F#');
    expect(name(3, 8, { tonic: 'A', scale: 'lydian' })).toBe('D#');
    expect(name(3, 8, { tonic: 'A', scale: 'locrian' })).toBe('Eb');
  });

  it('builds every vamp and jam on the chords the words name, each holding its colour note', () => {
    expect(progressionToChords('I II', 'A')).toEqual(['A', 'B']);
    expect(progressionToChords('i IV', 'A')).toEqual(['Am', 'D']);
    expect(progressionToChords('I bVII', 'A')).toEqual(['A', 'G']);
    expect(progressionToChords('i bII', 'A')).toEqual(['Am', 'Bb']);
    expect(chordNotes('B')).toContain('D#');
    expect(chordNotes('D')).toContain('F#');
    expect(chordNotes('G')).toContain('G');
    expect(chordNotes('Bb')).toContain('Bb');
    expect(chordNotes('F')).toContain('F');
    expect(chordNotes('Am7b5')).toEqual(['A', 'C', 'Eb', 'G']);
    expect(jamChords('jam-dorian')).toEqual(['Am7', 'D7']);
    expect(chordNotes('D7')).toContain('F#');
    expect(jamChords('jam-aeolian')).toEqual(['Am', 'F', 'G', 'Am']);
    expect(jamChords('jam-lydian')).toEqual(['A', 'B']);
    expect(jamChords('jam-locrian')).toEqual(['Am7b5', 'Bbmaj7']);
    expect(jamChords('play-your-piece')).toEqual(['A', 'B']);
    const fallback = parseAddress(task('red-haired-boy').fallback!.params ?? []);
    expect(fallback.view === 'jam' ? progressionInKey(fallback.progression, fallback.tonic ?? undefined).bars.flat().map((c) => c.symbol) : []).toEqual(['A', 'G']);
    // The Dorian vamp is also ii7 to V7 of G major, and the Lydian one IV to V of E major, as the tasks warn.
    expect(progressionToChords('ii7 V7', 'G')).toEqual(['Am7', 'D7']);
    expect(progressionToChords('IV V', 'E')).toEqual(['A', 'B']);
  });

  it('wrecks Mixolydian with E7 and not with the other options', () => {
    const mixo = scaleNotes('A', 'mixolydian');
    expect(chordNotes('E7')).toContain('G#');
    expect(mixo).not.toContain('G#');
    for (const c of ['G', 'D', 'Em']) expect(chordNotes(c).every((n) => mixo.includes(n)), c).toBe(true);
  });

  it('names the shapes on the cards for what they sound', () => {
    expect(identifyFretted('x24442').symbol).toBe('B');
    expect(name(2, 4, { chord: 'B' })).toBe('D#');
    expect(identifyFretted('x0101x').symbol).toBe('Am7b5');
    expect(identifyFretted('x1323x').symbol).toBe('Bbmaj7');
    expect([name(5, 1, { chord: 'Bbmaj7' }), name(4, 3), name(3, 2), name(2, 3)]).toEqual(['Bb', 'F', 'A', 'D']);
  });

  it('teaches Phrygian dominant and the Andalusian cadence as the engines and the study have them', async () => {
    expect(scaleNotes('E', 'phrygian-dominant')).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D']);
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
    expect(scaleNotes('E', 'phrygian')).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D']);
    const s = await song('st-andalusian-cadence');
    expect(s.tempo[0].bpm).toBe(80);
    expect(s.bars[0].time).toEqual({ numerator: 3, denominator: 4 });
    expect(s.chords.slice(0, 4).map((c) => c.symbol)).toEqual(['Am', 'G', 'F', 'E']);
    // The melody of bars 9 to 16 ends F falling to E.
    const melody = s.tracks.find((t) => t.role === 'lead')!;
    const notes = melody.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
    expect(notes.slice(-2).map((m) => m % 12)).toEqual([5, 4]);
    expect(getExercise('tech-rasgueado')!.tempo.start).toBe(52);
  });

  it('says true things about each mode study', async () => {
    const chords = async (id: string) => songChords(await song(id));
    expect(await chords('st-mode-dorian')).toEqual(new Set(['Am', 'D']));
    expect(await chords('st-mode-aeolian')).toEqual(new Set(['Am', 'F', 'G']));
    expect(await chords('st-mode-mixolydian')).toEqual(new Set(['A', 'G']));
    expect(await chords('st-mode-lydian')).toEqual(new Set(['A', 'B']));
    expect(await chords('st-mode-phrygian')).toEqual(new Set(['Am', 'Bb']));
    // Colour notes where the tasks put them.
    expect(name(1, 3)).toBe('G');
    expect(name(2, 4, { tonic: 'A', scale: 'lydian' })).toBe('D#');
    expect(name(3, 8, { tonic: 'A', scale: 'locrian' })).toBe('Eb');
    expect(name(1, 6, { tonic: 'A', scale: 'locrian' })).toBe('Bb');
    // The Phrygian study ends Bb to A, and the Mixolydian study G to A.
    const ending = async (id: string) => {
      const lead = (await song(id)).tracks.find((t) => t.role === 'lead')!;
      return lead.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi % 12))).slice(-2);
    };
    expect(await ending('st-mode-phrygian')).toEqual([10, 9]);
    expect(await ending('st-mode-mixolydian')).toEqual([7, 9]);
    expect(await ending('st-mode-locrian')).toEqual([10, 9]);
  });

  it('plays a model Lydian phrase in A Lydian with the colour note on the first beat of two bars', () => {
    const phrase = steps<PlayPhraseExercise>('modal-composition', 'play-phrase')[0];
    const names = phraseMidi(phrase).map((m) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12]);
    expect(names).toEqual(['D#', 'E', 'F#', 'D#', 'E', 'A']);
    expect(names.every((n) => scaleNotes('A', 'lydian').includes(n))).toBe(true);
    const durations = (phrase.notes as Array<{ duration: string }>).map((n) => n.duration);
    expect(durations).toEqual(['h', 'q', 'q', 'h', 'h', 'w']); // bar 1 = h q q, bar 2 = h h, bar 3 = w
  });

  it('sends the ear task to the Scales and modes drill, levels that hold the modes it names', () => {
    const [drillId, levelId] = task('ear-modes').params ?? [];
    const drill = drillById(drillId)!;
    expect(levelOf(drill, levelId)!.pool).toEqual(['major', 'lydian', 'mixolydian']);
    expect(levelOf(drill, 6)!.pool).toEqual(['minor', 'dorian', 'phrygian']);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('puts the Aeolian cadence where the study has it: F and G share bar 15, Am is bar 16', async () => {
    const s = await song('st-mode-aeolian');
    const inBar = (bar: number) => s.chords.filter((c) => c.bar === bar).map((c) => c.symbol);
    expect(inBar(14)).toEqual(['F', 'G']);
    expect(inBar(15)).toEqual(['Am']);
    expect(plain(task('study-aeolian').body)).toContain('bars 15 and 16 are {c:F} and {c:G}, then {c:Am}');
    expect(plain(task('study-aeolian').body)).not.toMatch(/bar 15 is/);
  });

  it('starts the unit on real music: the Ionian study as the yardstick, as the task describes it', async () => {
    const t = task('study-ionian');
    expect(t.params).toEqual(['st-mode-ionian', 't82']);
    const ionian = await song('st-mode-ionian');
    const lydian = await song('st-mode-lydian');
    expect(songChords(ionian)).toEqual(new Set(['Amaj7', 'D']));
    const notes = (s: Song) => s.tracks.find((x) => x.role === 'lead')!.measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    // Both in fourth position (frets 4 to 7), G# under finger 1 on string 1.
    for (const s of [ionian, lydian]) for (const n of notes(s)) expect(n.fret, `${s.meta.title} ${n.string}:${n.fret}`).toBeGreaterThanOrEqual(4);
    for (const s of [ionian, lydian]) for (const n of notes(s)) expect(n.fret, `${s.meta.title} ${n.string}:${n.fret}`).toBeLessThanOrEqual(7);
    expect(name(1, 4, { tonic: 'A', scale: 'major' })).toBe('G#');
    expect(notes(ionian).some((n) => n.string === 1 && n.fret === 4)).toBe(true);
    // Only D becomes D#: the Ionian study has no D#, the Lydian study no D natural.
    const pcs = (s: Song) => new Set(notes(s).map((n) => n.midi % 12));
    expect(pcs(ionian).has(3)).toBe(false);
    expect(pcs(ionian).has(2)).toBe(true);
    expect(pcs(lydian).has(2)).toBe(false);
    expect(pcs(lydian).has(3)).toBe(true);
    // Every note of the Ionian study is in A major.
    const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const pc of pcs(ionian)) expect(scaleNotes('A', 'major').map((n) => PCS.indexOf(n)), `pc ${pc}`).toContain(pc);
    expect(plain(t.body)).toContain('about 72 BPM');
    expect(plain(t.body)).toContain('fourth position');
  });

  it('describes the colour notes without claiming every mode is one note from major or minor', () => {
    const match = steps<{ explain: string }>('modes-as-colours', 'match-pairs')[0];
    expect(match.explain).not.toMatch(/^Each mode differs/);
    // Dorian and Phrygian are one note from natural minor; Lydian and Mixolydian one from major;
    // Aeolian is one note from Dorian and Locrian one from Phrygian.
    const diff = (a: string, b: string) => scaleNotes('A', a).filter((n) => !scaleNotes('A', b).includes(n));
    expect(diff('dorian', 'minor')).toEqual(['F#']);
    expect(diff('phrygian', 'minor')).toEqual(['Bb']);
    expect(diff('lydian', 'major')).toEqual(['D#']);
    expect(diff('mixolydian', 'major')).toEqual(['G']);
    expect(diff('minor', 'dorian')).toEqual(['F']);
    expect(diff('locrian', 'phrygian')).toEqual(['Eb']);
    expect(diff('locrian', 'minor').length).toBe(2);
  });

  it('draws E Phrygian dominant on the flamenco card, and gives the cadence its sound beside the question', () => {
    const card = lesson('phrygian-and-flamenco').steps.find((s) => (s as { title?: string }).title === 'Flamenco\'s home is major') as { figure: { kind: string; derive?: { scale: string; tonic: string } } };
    expect(card.figure.kind).toBe('fretboard');
    expect(card.figure.derive).toEqual({ scale: 'phrygian-dominant', tonic: 'E' });
    const build = steps<{ figure?: { kind: string; sound?: { chords?: string[] } } }>('phrygian-and-flamenco', 'chord-build')[0];
    expect(build.figure?.sound?.chords).toEqual(['Am', 'G', 'F', 'E']);
    // The open-position pattern holds both the flat second and the major third of E.
    const p = scalePatterns('E', 'phrygian-dominant').find((x) => x.minFret === 0)!;
    expect(p.notes.some((n) => n.note === 'F')).toBe(true);
    expect(p.notes.some((n) => n.note === 'G#')).toBe(true);
  });

  it('names the Andalusian study\'s melody part as the Player lists it', async () => {
    const s = await song('st-andalusian-cadence');
    expect(s.tracks.map((x) => x.name)).toContain('Melody');
    expect(plain(task('andalusian').body)).toContain('choose the Melody under Parts');
  });

  it('falls back to a jam while Red Haired Boy is missing, and names no Player tempo it cannot know', () => {
    const t = task('red-haired-boy');
    expect(t.fallback).toBeTruthy();
    expect((t.params ?? []).some((p) => /^t\d+$/.test(p))).toBe(false);
  });
});
