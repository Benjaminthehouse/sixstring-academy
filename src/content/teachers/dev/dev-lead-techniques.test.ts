/**
 * Cross-checks for Dev's unit 3 (Lead guitar: the techniques) against the engines, the technique
 * exercises and the song library: every note and target the cards name, the whole- and half-step
 * bend targets, the unison and pre-bend pitches, the slides of Lick: Slides, the long notes of
 * Lick: Vibrato, the bends of Lick: Bends in Tune, the technique exercises' own targets and tempos,
 * Dev's three phrases (in A minor pentatonic, box 1 apart from the slide's grace note), the jams,
 * and the BPM of every Player task. Run with
 * `npx vitest run src/content/teachers/dev/dev-lead-techniques.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, noteAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { noteToMidi, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type PlayPhraseExercise, type TabNote } from '@/lessons';
import { parseAddress } from '@/features/progressions/model/address';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit from './dev-lead-techniques';

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

/** Every played position of a lead track, with its technique marks. */
function leadNotes(s: Song) {
  const lead = s.tracks.find((t) => t.role === 'lead')!;
  return lead.measures.flatMap((m, bar) => m.beats.filter((b) => b.notes.length > 0).map((b) => ({ bar, beat: b, note: b.notes[0] })));
}

const course = compileCourse(courseMeta('dev'), [unit]);
const at = (string: number, fret: number) => noteAt({ string, fret }, { octave: false });
const phrases = () => lesson('phrase-like-a-singer').steps.filter((s) => (s as { type?: string }).type === 'play-phrase') as PlayPhraseExercise[];

describe('Dev unit 3: Lead guitar techniques', () => {
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

  it('names the notes on the neck as the engine has them', () => {
    expect([at(3, 5), at(3, 7), at(3, 9)]).toEqual(['C', 'D', 'E']);
    expect(noteAt({ string: 3, fret: 6 }, { context: { key: 'D major' }, octave: false })).toBe('C#');
    expect([at(2, 3), at(2, 5), at(2, 8), at(2, 10)]).toEqual(['D', 'E', 'G', 'A']);
    expect(noteAt({ string: 2, fret: 9 }, { context: { key: 'A major' }, octave: false })).toBe('G#');
    expect([at(1, 5), at(4, 5), at(4, 7), at(4, 10)]).toEqual(['A', 'G', 'A', 'C']);
    expect([at(5, 5), at(5, 7), at(5, 8)]).toEqual(['D', 'E', 'F']);
    expect(midiAt({ string: 3, fret: 9 })).toBe(noteToMidi('E4'));
    expect(midiAt({ string: 2, fret: 9 })).toBe(noteToMidi('G#4'));
    expect(midiAt({ string: 4, fret: 10 })).toBe(noteToMidi('C4'));
    expect(midiAt({ string: 1, fret: 5 })).toBe(noteToMidi('A4'));
  });

  it('sets the bend targets two frets (a whole step) and one fret (a half step) above', () => {
    expect(midiAt({ string: 3, fret: 9 }) - midiAt({ string: 3, fret: 7 })).toBe(2);
    expect(midiAt({ string: 2, fret: 10 }) - midiAt({ string: 2, fret: 8 })).toBe(2);
    expect(midiAt({ string: 2, fret: 9 }) - midiAt({ string: 2, fret: 8 })).toBe(1);
    // The unison bend: string 3 fret 7 bent a whole step meets string 2 fret 5.
    expect(midiAt({ string: 3, fret: 7 }) + 2).toBe(midiAt({ string: 2, fret: 5 }));
    // The technique exercises check the same targets the lessons name.
    const check = (id: string, part = 0) => getExercise(id)!.parts[part].check as { kind: string; string?: number; fret?: number; semitones?: number; toleranceCents?: number; wavesPerBeat?: number };
    expect(check('tech-bend-whole-step')).toMatchObject({ kind: 'bend', string: 3, fret: 7, semitones: 2, toleranceCents: 10 });
    expect(check('tech-bend-whole-step', 1)).toMatchObject({ kind: 'bend', string: 2, fret: 8, semitones: 2 });
    expect(check('tech-bend-half-step')).toMatchObject({ kind: 'bend', string: 2, fret: 8, semitones: 1 });
    expect(check('tech-unison-bend')).toMatchObject({ kind: 'bend', string: 3, fret: 7, semitones: 2 });
    expect(check('tech-prebend-release')).toMatchObject({ kind: 'prebend', string: 3, fret: 7, semitones: 2 });
    expect(getExercise('tech-vibrato-bend')!.parts.map((p) => (p.check as { wavesPerBeat: number }).wavesPerBeat)).toEqual([2, 3, 4]);
    expect(check('tech-vibrato-bend')).toMatchObject({ kind: 'vibrato', string: 2, fret: 8, style: 'bend' });
    // Tempos the task bodies name.
    expect(getExercise('tech-legato-chains')!.tempo).toEqual({ start: 60, step: 4, goal: 120 });
    expect(getExercise('tech-trills')!.tempo.start).toBe(60);
    expect(getExercise('tech-slide-targets')!.tempo.start).toBe(60);
    expect(getExercise('tech-vibrato-bend')!.tempo.start).toBe(60);
  });

  it('keeps the play steps on the pitches the words name', () => {
    const steps = unit.lessons.flatMap((l) => l.steps);
    const playNotes = steps.filter((s) => (s as { type?: string }).type === 'play-note') as Array<{ note: string; where?: { string: number; fret: number } }>;
    for (const p of playNotes) if (p.where) expect(noteToMidi(p.note), p.note).toBe(midiAt(p.where));
    expect(playNotes.map((p) => p.note)).toEqual(['E4', 'A4', 'E4']);
    const trill = lesson('legato').steps.find((s) => (s as { type?: string }).type === 'play-phrase') as PlayPhraseExercise;
    expect(phraseMidi(trill)).toEqual(Array.from({ length: 8 }, () => [60, 62]).flat());
    const slide = lesson('slides').steps.find((s) => (s as { type?: string }).type === 'play-phrase') as PlayPhraseExercise;
    expect(phraseMidi(slide)).toEqual([62, 64]);
  });

  it('describes the slides of Lick: Slides as the library has them', async () => {
    const s = await song('st-lick-slide');
    const slid = leadNotes(s).filter((n) => n.note.slide || (n.note as { technique?: string }).technique === 'slide' || JSON.stringify(n.note).includes('slide'));
    expect(slid.length).toBeGreaterThanOrEqual(3);
    const lead = leadNotes(s).map((n) => `${n.note.string}:${n.note.fret}`);
    // Each slide pair the card names appears in order.
    for (const [a, b] of [['3:7', '3:9'], ['2:8', '2:10'], ['4:5', '4:10']]) {
      const i = lead.findIndex((p, k) => p === a && lead[k + 1] === b);
      expect(i, `${a} -> ${b}`).toBeGreaterThanOrEqual(0);
    }
    expect(s.tempo[0].bpm).toBe(92);
  });

  it('describes Lick: Vibrato and Lick: Bends in Tune as the library has them', async () => {
    const v = await song('st-lick-vibrato');
    const held = leadNotes(v).filter((n) => n.beat.duration >= 1920).map((n) => `${n.note.string}:${n.note.fret}`);
    for (const p of ['1:5', '2:8', '3:7']) expect(held, p).toContain(p);
    expect(v.tempo[0].bpm).toBe(60);
    const b = await song('st-lick-bend');
    const lead = leadNotes(b).map((n) => `${n.note.string}:${n.note.fret}`);
    // The target is played right before each bend.
    for (const [target, bend] of [['3:9', '3:7'], ['2:10', '2:8'], ['2:9', '2:8']]) {
      const i = lead.findIndex((p, k) => p === target && lead[k + 1] === bend);
      expect(i, `${target} before ${bend}`).toBeGreaterThanOrEqual(0);
    }
    expect(b.tempo[0].bpm).toBe(72);
  });

  it('writes Dev\'s phrases in A minor pentatonic, inside box 1 but for the slide\'s first note', () => {
    const box1 = scalePatterns('A', 'minor-pentatonic', { system: 'box' })[0];
    expect(box1.minFret).toBe(5);
    const inBox = new Set(box1.notes.map((n) => `${n.string}:${n.fret}`));
    const pent = scaleNotes('A', 'minor-pentatonic');
    const [p1, p2, p3] = phrases();
    for (const p of [p1, p2, p3]) {
      const fretted = p.notes.filter((n): n is Extract<TabNote, { string: number }> => 'string' in n);
      for (const n of fretted) expect(pent, `${n.string}:${n.fret}`).toContain(at(n.string, n.fret));
      const outside = fretted.filter((n) => !inBox.has(`${n.string}:${n.fret}`)).map((n) => `${n.string}:${n.fret}`);
      expect(outside, 'only the slide-in grace note leaves the box').toEqual(p === p1 ? ['2:3'] : []);
    }
    const names = (p: PlayPhraseExercise) => p.notes.filter((n): n is Extract<TabNote, { string: number }> => 'string' in n).map((n) => at(n.string, n.fret));
    expect(names(p1)).toEqual(['D', 'E', 'A', 'G', 'E', 'C']);
    expect(names(p2)).toEqual(['C', 'D', 'C', 'A', 'G', 'A', 'D', 'C', 'A']);
    expect(names(p3)).toEqual(['G', 'E', 'D', 'E', 'D', 'C', 'A']);
    // The slide goes into E from two frets below; phrase 2 ends home on A; phrase 1 asks on C.
    expect(names(p1).at(-1)).toBe('C');
    expect(names(p2).at(-1)).toBe('A');
    expect(names(p3).at(-1)).toBe('A');
  });

  it('jams on the chords the words name, and opens the Player at the BPM it says', async () => {
    const jam = (params: string[]) => {
      const a = parseAddress(params);
      expect(a.view, params.join('--')).toBe('jam');
      if (a.view !== 'jam') return [];
      return [...new Set(progressionInKey(a.progression, a.tonic ?? undefined).bars.flat().map((c) => c.symbol))];
    };
    expect(jam(task('jam-call-and-response').params!)).toEqual(['Am', 'F', 'G']);
    expect(jam(task('jam-minor-blues').params!)).toEqual(['Am7', 'Dm7', 'E7']);
    expect(await taskBpmProblems(unit)).toEqual([]);
    for (const t of tasks(unit)) {
      const id = taskSong(t);
      if (id) expect(songEntry(id), id).toBeTruthy();
    }
  });

  // ── Added by the independent review ──────────────────────────────────────────────────────────

  it('counts the hammer-ons the legato prompt promises', () => {
    const trill = lesson('legato').steps.find((s) => (s as { type?: string }).type === 'play-phrase') as PlayPhraseExercise;
    const midi = phraseMidi(trill);
    const ups = midi.slice(1).filter((m, i) => m > midi[i]).length;
    const downs = midi.slice(1).filter((m, i) => m < midi[i]).length;
    expect([midi.length, ups, downs]).toEqual([16, 8, 7]);
    expect(plain(trill.prompt)).toContain('eight hammers, one pick');
    expect(plain(trill.prompt)).not.toMatch(/eight times/);
  });

  it('never says a bend or a vibrato can take the pitch below the fretted note', () => {
    const text = JSON.stringify(unit);
    // Bending a string, whichever way it is pushed or pulled, only raises its pitch.
    expect(text).not.toMatch(/wrong way|below the note would|bend[a-z]* (it )?down below/i);
    const below = unit.lessons.flatMap((l) => l.steps).find((s) => (s as { type?: string; statement?: RichText }).type === 'true-false' && /dips below/.test(plain((s as { statement: RichText }).statement))) as { answer: boolean; explain: RichText };
    expect(below.answer).toBe(false);
    expect(plain(below.explain)).toMatch(/can only raise its pitch/);
    // The vibrato exercise and the lick say the same: up from the note, never below.
    expect(getExercise('tech-vibrato-bend')!.steps.join(' ')).toMatch(/never below/);
  });

  it('never sends the learner to compare a vibrato with an example the app cannot sound', () => {
    // The audio engine plays a tab's notes without vibrato, so the Technique demo of the exercise is a plain G.
    const vib = lesson('vibrato').steps.find((s) => (s as { type?: string }).type === 'play-note') as { alternative: { prompt: RichText } };
    expect(plain(vib.alternative.prompt)).toMatch(/Record it on your phone and listen back/);
    expect(JSON.stringify(unit)).not.toMatch(/Technique example|Dev's example/);
  });

  it('names the strings the picking palm mutes as the Technique exercise does', () => {
    expect(getExercise('tech-picking-hand-mute')!.steps[0]).toContain('strings 4 to 6');
    expect(plain(task('picking-hand-mute').body)).toContain('strings 4 to 6 while you play on 3 to 1');
  });
});
