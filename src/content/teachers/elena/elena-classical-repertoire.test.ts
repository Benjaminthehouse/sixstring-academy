/**
 * Cross-checks for Prof. Varga's unit 10 (Classical repertoire) against the song library, the
 * technique exercises and the guitar and theory engines: the passages the cards and the show quote
 * are the library's own notes, the form maps and bar loops are the pieces' real sections, the solea
 * accents fall where the lesson says, the tunings and tempos the tasks name are right, and every
 * swapped classical solo really is missing from the library. Run with
 * `npx vitest run src/content/teachers/elena/elena-classical-repertoire.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, noteAt, retuneSteps } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, noteToMidi, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, parseRhythm, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import { AREA_INFO } from '@/features/practice/model/areas';
import minorHarmony from './elena-minor-harmony';
import unit, { BOURREE, HEMIOLA, INVENTION_SUBJECT, PEDAL, SARABANDE, TRIPLETS } from './elena-classical-repertoire';

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

function task(id: string, lessonId?: string): TaskStep {
  const pool = lessonId ? lesson(lessonId).steps.filter(isTaskStep) : tasks(unit);
  const found = pool.find((x) => x.id === id);
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

const course = compileCourse(courseMeta('elena'), [unit]);
type Fretted = TabNote & { string: number; fret: number };
const struck = (notes: TabNote[]) => notes.filter((n): n is Fretted => 'string' in n);
const pos = (notes: TabNote[]) => struck(notes).map((n) => `${n.string}:${n.fret}`);
const midis = (notes: TabNote[]) => struck(notes).map((n) => midiAt(n));
const TICKS: Record<string, number> = { s: 240, e: 480, q: 960, h: 1920, et: 320 };

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 10: Classical repertoire', () => {
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

  it('names Player tempos that add up, and loops bars that exist', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
    for (const s of tasks(unit)) {
      const id = taskSong(s);
      if (!id || !songEntry(id)) continue;
      const bars = (await song(id)).bars.length;
      for (const p of s.params ?? []) {
        const m = p.match(/^m(\d+)-(\d+)$/);
        if (m) expect(Number(m[2]), `${s.id}: ${p} in ${bars} bars`).toBeLessThanOrEqual(bars);
      }
    }
  });

  it('teaches Scan & Import where the app has it', async () => {
    const { ROUTE_BY_NAME } = await import('@/app/routes');
    expect(ROUTE_BY_NAME.scan).toMatchObject({ title: 'Scan & Import', section: 'tools' });
    const card = lesson('studies-of-the-masters').steps.find((x) => (x as { id?: string }).id === 'scan-import') as { body: RichText };
    expect(plain(card.body)).toMatch(/In Tools, open Scan & Import/);
  });

  it('shows the tune inside the A minor study as the library has it, and spells Sor\'s chord', async () => {
    const s = await song('st-pimami-3-4');
    const tops = s.tracks[0].measures.slice(8, 15).map((m) => Math.max(...m.beats[0].notes.map((n) => n.midi)));
    const card = lesson('studies-of-the-masters').steps.find((x) => (x as { figure?: { kind: string } }).figure?.kind === 'staff') as unknown as { figure: { notes: Array<{ note: string; duration: string }> } };
    expect(card.figure.notes.map((n) => noteToMidi(n.note))).toEqual(tops);
    expect(s.tracks[0].measures.slice(8, 15).every((m) => m.beats[0].notes.length === 2 && m.beats[0].notes.some((n) => n.pluck === 'p' || n.string >= 4))).toBe(true);
    expect(task('tune-inside').params).toEqual(['st-pimami-3-4', 'm9-16', 'wait']);
    expect(chordNotes('Bm')).toEqual(['B', 'D', 'F#']);
  });

  it('writes the dance rhythms as the cards describe them', () => {
    const sar = parseRhythm({ pattern: SARABANDE, time: '3/4' });
    expect(sar.problems).toEqual([]);
    const bar1 = sar.events.filter((e) => e.bar === 0 && e.attack);
    expect(bar1.map((e) => [e.tick, e.ticks])).toEqual([[0, 960], [960, 1920]]); // beat 2 is the long note
    const bou = parseRhythm({ pattern: BOURREE, time: '2/2' });
    expect(bou.problems).toEqual([]);
    expect(bou.onsets[0]).toBe(2880); // the upbeat: a quarter before bar 2
    expect(bou.barTicks).toBe(3840);
    const hem = parseRhythm({ pattern: HEMIOLA, time: '6/8' });
    expect(hem.problems).toEqual([]);
    expect(hem.onsets).toEqual([0, 1440, 2880, 3840, 4800]); // two dotted quarters, then three quarters
    const tri = parseRhythm({ pattern: TRIPLETS, time: '3/4' });
    expect(tri.problems).toEqual([]);
    expect(tri.onsets).toEqual(Array.from({ length: 9 }, (_, i) => i * 320)); // three to each beat: 9/8 in effect
  });

  it('accents the solea cycle on 3, 6, 8, 10 and 12, and keeps its falseta in bars 17 to 24', async () => {
    const s = await song('st-solea-compas');
    const counts = (from: number) =>
      s.tracks[0].measures.slice(from, from + 4).flatMap((m, b) => m.beats.filter((x) => x.notes.some((n) => n.accent) && x.start % 960 === 0).map((x) => b * 3 + x.start / 960 + 1));
    for (const from of [0, 4, 8, 12]) expect(counts(from)).toEqual([3, 6, 8, 10, 12]);
    expect(s.sections).toEqual([{ name: 'Compas', start: 0, end: 16 }, { name: 'Falseta', start: 16, end: 24 }]);
    expect(s.bars.length).toBe(24);
    expect(s.tempo[0].bpm).toBe(108);
    // The falseta is a single line (the E chord on count 10 of bar 24 aside), in E Phrygian: the notes of A minor.
    const amNotes = scaleNotes('A', 'minor');
    const line = s.tracks[0].measures.slice(16, 23).flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(line.every((n) => amNotes.includes(noteAt(n, { octave: false, context: { key: 'A minor' } })))).toBe(true);
    expect(task('solea-hemiola').params).toEqual(['st-solea-compas', 'm1-16', 't67']);
    expect(task('singing-falseta').params).toEqual(['st-solea-compas', 'm17-24', 't67']);
  });

  it('maps the DADGAD Air as it is written, and retunes it correctly', async () => {
    const s = await song('st-dadgad-air');
    expect(s.sections).toEqual([{ name: 'A', start: 0, end: 8 }, { name: 'B', start: 8, end: 16 }]);
    expect(s.tuning).toEqual([38, 45, 50, 55, 57, 62]); // D2 A2 D3 G3 A3 D4
    const steps = retuneSteps('dadgad').filter((x) => x.semitones !== 0);
    expect(steps.map((x) => [x.string, x.semitones])).toEqual([[6, -2], [2, -2], [1, -2]]);
    expect(plain(task('hardest-bars').body)).toMatch(/Retune strings 6, 2 and 1 down a whole step, to D A D G A D/);
    const fretted = (from: number, to: number) => s.tracks[0].measures.slice(from, to).flatMap((m) => m.beats.flatMap((b) => b.notes)).filter((n) => n.fret > 0);
    // A, bars 1 to 8: mostly second position (frets 1 to 5); B, bars 9 to 15: seventh position (frets 6 up).
    const a = fretted(0, 8);
    expect(a.filter((n) => n.fret <= 5).length / a.length).toBeGreaterThanOrEqual(0.75);
    expect(fretted(8, 15).every((n) => n.fret >= 6)).toBe(true);
    // Bar 16 comes home to bar 8's open D chord, D F# A D; bar 9 leaps to fret 9.
    const chord = (i: number) => s.tracks[0].measures[i].beats[0].notes.map((n) => n.midi);
    expect(chord(15)).toEqual(chord(7));
    expect(chord(15).map((m) => m % 12).sort((x, y) => x - y)).toEqual([2, 2, 6, 9]);
    expect(Math.min(...s.tracks[0].measures[8].beats[0].notes.map((n) => n.fret))).toBe(9);
    // The harmonic in bar 10 and the hammer-and-pull triplet in bar 11, inside the loop of bars 9 to 12.
    expect(s.tracks[0].measures[9].beats.some((b) => b.notes.some((n) => n.harmonic))).toBe(true);
    const bar11 = s.tracks[0].measures[10].beats.flatMap((b) => b.notes);
    expect(bar11.some((n) => n.legato === 'hammer') && bar11.some((n) => n.legato === 'pull')).toBe(true);
    expect(plain(task('hardest-bars').body)).not.toMatch(/\broll\b/);
    expect(task('hardest-bars').params).toEqual(['st-dadgad-air', 'm9-12', 't79']);
    expect(task('the-join').params).toEqual(['st-dadgad-air', 'm7-10', 't79']);
    expect(s.tempo[0].bpm).toBe(76);
  });

  it('sends Coste to a study in seventh position that changes key and meter at bar 9', async () => {
    const s = await song('st-read-seventh-position');
    expect(s.sections.map((x) => [x.start, x.end])).toEqual([[0, 8], [8, 16]]);
    expect(s.bars[8]).toMatchObject({ time: { numerator: 6, denominator: 8 }, key: 'Em' });
    const fretted = s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(fretted.every((n) => n.fret >= 6 && n.fret <= 11)).toBe(true);
    expect(task('position-study').params).toEqual(['st-read-seventh-position', 'm1-8', 'wait']);
  });

  it('plays Canon in D as variations over a two-bar ground, the chords on the same roots', async () => {
    const s = await song('canon-in-d');
    const ground = s.tracks[0].measures.slice(0, 8).map((m) => m.beats.map((b) => `${b.notes[0].string}:${b.notes[0].fret}`).join(' '));
    expect(new Set(ground.filter((_, i) => i % 2 === 0)).size).toBe(1);
    expect(new Set(ground.filter((_, i) => i % 2 === 1)).size).toBe(1);
    const roots = s.tracks[0].measures.slice(0, 2).flatMap((m) => m.beats.map((b) => noteAt(b.notes[0], { octave: false, context: { key: 'D major' } })));
    expect(roots).toEqual(['D', 'A', 'B', 'F#', 'G', 'D', 'G', 'A']);
    const chordRoots = s.chords.filter((c) => c.bar >= 8 && c.bar < 10).map((c) => c.symbol.match(/^[A-G][#b]?/)![0]);
    expect(chordRoots).toEqual(roots);
  });

  it('turns E major to E minor by the notes the card names', () => {
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
    expect(chordNotes('Em')).toEqual(['E', 'G', 'B']);
    const lost = scaleNotes('E', 'major').filter((n) => !scaleNotes('E', 'minor').includes(n));
    expect(lost).toEqual(['G#', 'C#', 'D#']);
    expect(noteAt({ string: 3, fret: 1 }, { octave: false, context: { chord: 'E' } })).toBe('G#');
  });

  it('builds the pedal exercise on the open B, the line in E Phrygian dominant, and the pedal on degree 5', () => {
    expect(PEDAL.reduce((n, x) => n + TICKS[x.duration], 0)).toBe(3840);
    const notes = struck(PEDAL);
    expect(notes.filter((_, i) => i % 3 !== 0).every((n) => n.string === 2 && n.fret === 0)).toBe(true);
    const line = notes.filter((_, i) => i % 3 === 0).map((n) => noteAt(n, { octave: false, context: { tonic: 'E', scale: 'phrygian-dominant' } }));
    expect(line).toEqual(['E', 'F', 'G#', 'F']);
    const pd = scaleNotes('E', 'phrygian-dominant');
    expect(pd).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D']);
    expect(line.every((n) => pd.includes(n))).toBe(true);
    // The fretboard question: the scale's notes on string 3, frets 0 to 5.
    expect([0, 1, 2, 3, 4, 5].filter((f) => pd.includes(noteAt({ string: 3, fret: f }, { octave: false, context: { tonic: 'E', scale: 'phrygian-dominant' } })))).toEqual([1, 2, 4, 5]);
    expect(scaleNotes('E', 'minor')[4]).toBe('B');
    expect(midiAt({ string: 2, fret: 0 })).toBe(noteToMidi('B3'));
  });

  it('performs the subject of the Two-Voice Invention exactly as the library has it', async () => {
    const s = await song('st-two-voice-invention');
    // Bar 1: the treble alone, one note at a time; the show is that bar, note for note and value for value.
    const lib = s.tracks[0].measures[0].beats.map((b) => (b.notes.length ? `${b.notes[0].string}:${b.notes[0].fret}/${b.duration}` : `r/${b.duration}`));
    expect(s.tracks[0].measures[0].beats.every((b) => b.notes.length === 1)).toBe(true);
    const mine = INVENTION_SUBJECT.map((n) => ('string' in n ? `${n.string}:${n.fret}/${TICKS[n.duration]}` : `r/${TICKS[n.duration]}`));
    expect(mine).toEqual(lib);
    expect(INVENTION_SUBJECT.reduce((n, x) => n + TICKS[x.duration], 0)).toBe(3840);
    expect(midis(INVENTION_SUBJECT)).toEqual(['E4', 'B4', 'A4', 'G4', 'F#4', 'E4', 'D#4', 'B3', 'E4'].map((n) => noteToMidi(n)));
    // Seventh position: finger 1 on fret 7, nothing below it or above fret 10.
    expect(struck(INVENTION_SUBJECT).every((n) => n.fret >= 7 && n.fret <= 10)).toBe(true);
    // One line implying Em, B7, Em: every note is a tone of the chord the library names over it.
    const em = chordNotes('Em');
    const b7 = chordNotes('B7');
    const names = struck(INVENTION_SUBJECT).map((n) => noteAt(n, { octave: false, context: { key: 'E minor' } }));
    expect([names[0], names[1], names[5], names[8]].every((n) => em.includes(n))).toBe(true);
    expect([names[6], names[7]].every((n) => b7.includes(n))).toBe(true);
    expect(s.chords.filter((c) => c.bar === 0).map((c) => c.symbol)).toEqual(['Em', 'B7', 'Em']);
    expect(s.tempo[0].bpm).toBe(56);
    const show = lesson('summit-pieces').steps.find((x) => (x as { id?: string }).id === 'show') as { tempo: number; alternative: { tiles: string[] } };
    expect(show.tempo).toBe(56);
    expect(show.alternative.tiles.map((x) => x.replace(/[{}n:]/g, ''))).toEqual(names.slice(0, 6));
    expect(task('show-band').params).toEqual(['st-two-voice-invention', 'm1-1', 'flow']);
    expect(unit.milestone).toMatchObject({ lesson: 'summit-pieces', step: 'show', song: 'st-two-voice-invention' });
    // The learner took this bar in wait mode twice before the show: the Bourree and Jesu, Joy tasks.
    expect(task('two-lines').params).toEqual(['st-two-voice-invention', 'm1-4', 'wait']);
    expect(task('clear-voices').params).toEqual(['st-two-voice-invention', 'm1-2', 'wait']);
  });

  it('defines the Asturias pedal in a term no earlier unit shadows, and tests the facts it names', () => {
    // The course keeps the first definition of a term id; unit 8 defines `pedal-point` as a bass note.
    const full = compileCourse(courseMeta('elena'), [minorHarmony, unit]);
    const pedal = full.glossary?.find((g) => g.id === 'pedal');
    expect(pedal?.definition).toMatch(/above or inside/);
    const asturias = lesson('spanish-masterpiece');
    expect(JSON.stringify(asturias.steps)).toContain('{t:pedal}');
    expect(JSON.stringify(asturias.steps)).not.toContain('{t:pedal-point');
    // Every fact of the lesson is asked by at least one exercise, and the origin by an origin question.
    for (const f of asturias.facts ?? []) expect(asturias.steps.some((x) => (x as { fact?: string }).fact === f.id), f.id).toBe(true);
    const origin = asturias.steps.find((x) => (x as { fact?: string }).fact === 'asturias-origin') as { statement?: string };
    expect(origin.statement).toMatch(/Albeniz/);
  });

  it('names the Practice Plan as the app shows it, and opens the etude at its first section', async () => {
    expect(AREA_INFO.repertoire.label).toBe('Songs');
    const goal = task('summit-goal');
    expect(goal.params).toEqual(['goals']);
    expect(plain(goal.body)).toMatch(/area Songs/);
    const etude = task('tremolo-etude', 'summit-pieces');
    expect(etude.params).toEqual(['st-concert-tremolo-etude', 'm1-16', 'wait']);
    if (songEntry('st-concert-tremolo-etude')) {
      const s = await song('st-concert-tremolo-etude');
      expect(s.sections[0]).toMatchObject({ start: 0, end: 16 });
    }
  });

  it('keeps the invention and the tremolo etude behind fallbacks until they are in the library', async () => {
    for (const id of ['two-lines', 'clear-voices']) {
      const t = task(id);
      expect(taskSong(t)).toBe('st-two-voice-invention');
      expect((t.params ?? []).some((p) => /^t\d+$/.test(p)), id).toBe(false);
      if (!songEntry('st-two-voice-invention')) expect(t.fallback, id).toBeTruthy();
    }
    expect(task('two-lines').fallback!.params).toEqual(['st-duet-baroque', 'm9-16', 'wait']);
    expect(task('clear-voices').fallback!.params).toEqual(['st-duet-baroque', 'm17-24', 'wait']);
    expect((await song('st-duet-baroque')).bars.length).toBe(24);
    if (songEntry('st-two-voice-invention')) {
      const inv = await song('st-two-voice-invention');
      expect(inv.key).toMatch(/^Em|E minor/);
      // Bar 1: the subject alone (one note at a time); bar 2: two voices.
      expect(inv.tracks[0].measures[0].beats.every((b) => b.notes.length <= 1)).toBe(true);
      expect(inv.tracks[0].measures[1].beats.some((b) => b.notes.length === 2)).toBe(true);
    }
    const etude = task('tremolo-etude', 'summit-pieces');
    if (!songEntry('st-concert-tremolo-etude')) expect(etude.fallback).toMatchObject({ tool: 'technique', params: ['tech-tremolo-pami'] });
    expect(getExercise('tech-tremolo-pami')).toBeTruthy();
  });

  it('says no more than it can stand behind', () => {
    // Pachelbel's ground is older than Sor's Folies, not the oldest form of variation (the Folia itself is older).
    expect(plain(task('ground-variations').body)).not.toMatch(/oldest/);
    // The Gavotte is not in the library, so the card cannot say "here it is".
    const gavotte = lesson('bach-on-guitar').steps.find((x) => (x as { title?: string }).title === 'The Gavotte en Rondeau') as { body: RichText };
    expect(plain(gavotte.body)).not.toMatch(/Here it is/);
    expect(plain(gavotte.body)).toMatch(/Guitarists play it in \{k:E major\}/);
    // The only rondo in the library was played to tempo in unit 8: the task says so and asks for something new.
    expect(plain(task('rondo-refrain').body)).toMatch(/minor-key unit/);
    expect(minorHarmony.lessons.flatMap((l) => l.steps.filter(isTaskStep)).some((x) => taskSong(x) === 'rondo-alla-turca')).toBe(true);
    // The library holds classical arrangements (Mozart, Beethoven, Pachelbel), only not this unit's solos.
    const scan = lesson('studies-of-the-masters').steps.find((x) => (x as { id?: string }).id === 'scan-import') as { body: RichText };
    expect(plain(scan.body)).toMatch(/^None of this unit's solos is in the library/);
  });

  it('swaps only pieces the library does not hold', () => {
    const named = ['carcassi-op60-no7', 'sor-op35-no22', 'de-visee-sarabande', 'handel-sarabande', 'bach-bourree-e-minor', 'sanz-canarios', 'lagrima', 'mertz-romanze-e-minor', 'chopin-prelude-7',
      'gran-vals', 'coste-op38-no1', 'sor-folies-op15a', 'jesu-joy', 'gavotte-en-rondeau', 'asturias', 'cello-suite-1-prelude', 'recuerdos-de-la-alhambra', 'bach-chaconne', 'bach-prelude-bwv1006a'];
    for (const id of named) expect(songEntry(id), id).toBeUndefined();
    for (const id of ['st-pimami-3-4', 'st-duet-baroque', 'st-solea-compas', 'fur-elise-theme', 'st-chord-melody-1', 'st-dadgad-air', 'st-read-seventh-position', 'canon-in-d', 'rondo-alla-turca']) expect(songEntry(id), id).toBeTruthy();
  });
});
