/**
 * Cross-checks for Prof. Varga's unit 4 (`elena-legato-and-tapping.ts`) against the engines, the
 * technique exercises and the song library: the legato run is the exercise's G major and its picks,
 * hammers and pull-offs are where the cards say; the hammer-on, tapping, bend and slide notes are
 * the exercises' notes; the harmonic points are where the string divides into 2, 3 and 4; open G
 * is the tuning the Tuner and the Player use, with its chords at frets 5, 7 and 12; every
 * "string N fret M ({n:X})" names the right note; every BPM a task gives is what the tool plays.
 * Run: `npx vitest run src/content/teachers/elena/elena-legato-and-tapping.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, keyChoices } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, ladderRungs, partSong } from '@/content/technique';
import { fretDistance, identifyFretted, midiAt, pitchClassAt, retuneSteps, scalePatterns, tuning } from '@/core/guitar';
import { parseSixTab, type Note, type Song } from '@/core/song';
import { chordPcs, chroma, noteToMidi, scalePcs } from '@/core/theory';
import { parsePlayerParams } from '@/features/player/model/params';
import type { TabNote } from '@/lessons';
import { isTaskStep, type TaskStep, type TeacherLesson } from '../index';
import unit, { LEGATO_BAR, LEGATO_OCTAVE, OPEN_G_CHORDS, TAP_AM_BAR } from './elena-legato-and-tapping';
import unitOne from './elena-practice-and-precision';

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const tasks = (): Array<{ lesson: string; task: TaskStep }> => unit.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
const textOf = (t: unknown): string => (typeof t === 'string' ? t : (t as { text: string }).text);
const allText = (): string => JSON.stringify(unit).replace(/\\"/g, '"');
const fretted = (notes: readonly TabNote[]) => notes.filter((n): n is { string: number; fret: number; duration: string } => 'string' in n);

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

/** Struck notes of a track, in order (one per beat: these parts play single notes). */
function struck(track: Song['tracks'][number]): Note[] {
  return track.measures.flatMap((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => b.notes[0]));
}

function exerciseNotes(id: string, part = 0): Note[] {
  const e = getExercise(id)!;
  expect(e, id).toBeTruthy();
  return struck(partSong(e, e.parts[part], e.tempo.start).tracks[0]);
}

describe('three-notes-per-string legato', () => {
  it('is the technique exercise\'s G major, from string 6 fret 3', () => {
    const run = exerciseNotes('tech-legato-3nps');
    expect(LEGATO_BAR.map((n) => ({ ...n }))).toEqual(run.slice(0, 12).map((n) => ({ string: n.string, fret: n.fret, duration: 'et' })));
    const g = new Set(scalePcs('G', 'major'));
    for (const n of fretted(LEGATO_BAR)) expect(g.has(pitchClassAt(n)), `${n.string}:${n.fret}`).toBe(true);
    expect(midiAt(fretted(LEGATO_BAR)[0])).toBe(noteToMidi('G2'));
    // One octave G2 to G3, every step of the scale, ascending.
    const octave = fretted(LEGATO_OCTAVE).map((n) => midiAt(n));
    expect(octave[0]).toBe(noteToMidi('G2'));
    expect(octave[octave.length - 1]).toBe(noteToMidi('G3'));
    expect(octave.map((m) => m % 12)).toEqual([...scalePcs('G', 'major'), chroma('G')]);
    // Three picked notes in it: the first on each of strings 6, 5 and 4.
    expect(new Set(fretted(LEGATO_OCTAVE).map((n) => n.string))).toEqual(new Set([6, 5, 4]));
  });

  it('picks only the first note of each string: hammers going up, pull-offs coming down', () => {
    const run = exerciseNotes('tech-legato-3nps');
    for (let i = 0; i < run.length; i++) {
      const first = i === 0 || run[i - 1].string !== run[i].string || run[i - 1].fret === run[i].fret;
      if (first) expect(run[i].legato, `note ${i}`).toBeUndefined();
      else expect(run[i].legato, `note ${i}`).toBe(run[i].fret > run[i - 1].fret ? 'hammer' : 'pull');
    }
    // The frets per pair of strings: 3-5-7, 4-5-7, 5-7-8 (the match-pairs).
    const byString = new Map<number, number[]>();
    for (const n of run.slice(0, 18)) byString.set(n.string, [...(byString.get(n.string) ?? []), n.fret]);
    expect(Object.fromEntries(byString)).toEqual({ 6: [3, 5, 7], 5: [3, 5, 7], 4: [4, 5, 7], 3: [4, 5, 7], 2: [5, 7, 8], 1: [5, 7, 8] });
  });

  it('gives the ladder the exercise really has', () => {
    const e = getExercise('tech-legato-3nps')!;
    expect(e.tempo).toEqual({ start: 60, step: 4, goal: 132 });
    expect(ladderRungs(e)[0]).toBe(60);
  });
});

describe('hammer-ons from nowhere', () => {
  it('starts on the exercise\'s three notes, each hammered, none picked', () => {
    const notes = exerciseNotes('tech-hammer-from-nowhere');
    expect(notes.map((n) => [n.string, n.fret])).toEqual([[3, 7], [2, 8], [1, 5], [3, 7]]);
    const plays = lesson('hammer-from-nowhere').steps.filter((s) => (s as { type?: string }).type === 'play-note') as Array<{ note: string; where: { string: number; fret: number } }>;
    expect(plays.map((p) => [p.where.string, p.where.fret])).toEqual([[3, 7], [2, 8], [1, 5]]);
    for (const p of plays) expect(midiAt(p.where)).toBe(noteToMidi(p.note));
    expect(getExercise('tech-hammer-from-nowhere')!.tempo.start).toBe(60);
  });
});

describe('tapping', () => {
  it('plays the lick\'s four shapes, each an arpeggio of its chord', async () => {
    const lick = await song('st-lick-tapping');
    const notes = struck(lick.tracks[0]);
    // Bar 1 of the lick is the card's bar.
    expect(TAP_AM_BAR.map((n) => ('string' in n ? [n.string, n.fret] : null))).toEqual(notes.slice(0, 12).map((n) => [n.string, n.fret]));
    expect(notes[0].tap).toBe(true);
    expect(notes[1].legato).toBe('pull');
    expect(notes[2].legato).toBe('hammer');
    // Two bars per chord: tap, pull-off, hammer frets and the chord they spell (the match-pairs).
    const shapes: Record<string, number[]> = { Am: [12, 5, 8], F: [13, 5, 8], G: [15, 7, 10], E: [12, 4, 7] };
    Object.entries(shapes).forEach(([chord, frets], k) => {
      expect(notes.slice(k * 24, k * 24 + 3).map((n) => n.fret), chord).toEqual(frets);
      const pcs = new Set(chordPcs(chord));
      expect(new Set(frets.map((fret) => pitchClassAt({ string: 1, fret }))), chord).toEqual(pcs);
    });
    expect(getExercise('tech-tapping')!.tempo.start).toBe(50);
  });
});

describe('harmonics', () => {
  it('sit where the string divides into 2, 3 and 4: an octave, an octave and a fifth, two octaves', () => {
    expect(fretDistance(12)).toBeCloseTo(1 / 2, 6);
    expect(Math.abs(fretDistance(7) - 1 / 3)).toBeLessThan(0.001);
    expect(Math.abs(fretDistance(5) - 1 / 4)).toBeLessThan(0.001);
    // Partial n sounds 12 log2(n) half steps above the open string.
    expect([2, 3, 4].map((n) => Math.round(12 * Math.log2(n)))).toEqual([12, 19, 24]);
  });

  it('names the pitches the lesson asks for', () => {
    const steps = lesson('harmonics').steps as Array<{ type?: string; note?: string; where?: { string: number; fret: number }; sound?: { notes: string[] } }>;
    const plays = steps.filter((s) => s.type === 'play-note');
    // String 3 over fret 12: its octave; string 2 over fret 7: an octave and a fifth.
    expect(noteToMidi(plays[0].note!)).toBe(midiAt({ string: 3, fret: 0 }) + 12);
    expect(noteToMidi(plays[1].note!)).toBe(midiAt({ string: 2, fret: 0 }) + 19);
    // The listening question: open E2, then its fret-7 harmonic.
    const listen = steps.find((s) => s.type === 'listen-choice')!;
    expect(listen.sound!.notes.map((n) => noteToMidi(n))).toEqual([midiAt({ string: 6, fret: 0 }), midiAt({ string: 6, fret: 0 }) + 19]);
    // Artificial: fretted note plus twelve frets (string 5 fret 3 touched over 15; string 4 fret 2 over 14).
    const art = getExercise('tech-artificial-harmonics')!;
    expect(art.steps.join(' ')).toContain('string 5 fret 3 (C)');
    expect(art.steps.join(' ')).toContain('over fret 15');
    expect(pitchClassAt({ string: 4, fret: 2 })).toBe(chroma('E'));
    expect(getExercise('tech-pinch-harmonics')!.steps.join(' ')).toContain('string 3 fret 7 (D)');
  });

  it('plays the melody at the BPM the task names', async () => {
    const s = await song('st-lick-harmonics');
    expect(s.tempo[0].bpm).toBe(60);
  });
});

describe('wide bends', () => {
  it('bend string 2 fret 5 up three frets to the pitch of fret 8', () => {
    expect(midiAt({ string: 2, fret: 5 }) + 3).toBe(midiAt({ string: 2, fret: 8 }));
    expect(midiAt({ string: 2, fret: 8 })).toBe(noteToMidi('G4'));
    const bend = getExercise('tech-bend-minor-third')!;
    expect(bend.parts[0].check).toMatchObject({ kind: 'bend', string: 2, fret: 5, semitones: 3, toleranceCents: 10 });
    // The whole steps the lesson names: string 3 fret 7 D to E, string 2 fret 8 G to A.
    expect(midiAt({ string: 3, fret: 7 }) + 2).toBe(noteToMidi('E4'));
    expect(midiAt({ string: 2, fret: 8 }) + 2).toBe(noteToMidi('A4'));
    const vib = getExercise('tech-vibrato-bend')!;
    expect(vib.parts.map((p) => p.check)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'vibrato', string: 2, fret: 8, wavesPerBeat: 2 })]));
    // The listening question: target G4, then a bend a half step short.
    const listen = lesson('wide-bends').steps.find((s) => (s as { type?: string }).type === 'listen-choice') as { sound: { notes: string[] } };
    expect(listen.sound.notes.map((n) => noteToMidi(n))).toEqual([noteToMidi('G4'), noteToMidi('G4') - 1]);
  });
});

describe('slide in open G', () => {
  it('uses the engine\'s open G: D G D G B D, strings 6, 5 and 1 down a whole step', () => {
    expect(tuning('open-g').notes).toEqual(['D2', 'G2', 'D3', 'G3', 'B3', 'D4']);
    const steps = retuneSteps('open-g').filter((s) => s.semitones !== 0);
    expect(steps.map((s) => [s.string, s.semitones])).toEqual([[6, -2], [5, -2], [1, -2]]);
  });

  it('finds C at fret 5, D at fret 7 and G at fret 12, across all six strings', () => {
    const at = (fret: number) => identifyFretted(Array(6).fill(fret), { tuning: 'open-g' }).notes.map((n) => n.note.replace(/\d/g, ''));
    expect(at(5)).toEqual(['G', 'C', 'G', 'C', 'E', 'G']);
    expect(at(7)).toEqual(['A', 'D', 'A', 'D', 'F#', 'A']);
    expect(at(12)).toEqual(['D', 'G', 'D', 'G', 'B', 'D']);
    // Fret 2 is an A chord (the wrong option says so).
    expect(at(2)).toEqual(['E', 'A', 'E', 'A', 'C#', 'E']);
    // The microphone phrase: strings 3, 2, 1 at 12, 5, 7 spell G, C and D.
    const pcs = (fret: number) => new Set(fretted(OPEN_G_CHORDS).filter((n) => n.fret === fret).map((n) => pitchClassAt(n, { tuning: 'open-g' })));
    expect(pcs(12)).toEqual(new Set(chordPcs('G')));
    expect(pcs(5)).toEqual(new Set(chordPcs('C')));
    expect(pcs(7)).toEqual(new Set(chordPcs('D')));
  });

  it('plays the library\'s slide blues in open G, with chord slides at frets 12, 5 and 7', async () => {
    const s = await song('st-open-g-slide');
    expect(s.tuning).toEqual(tuning('open-g').midi);
    const chordFrets = new Set<number>();
    for (const m of s.tracks[0].measures) for (const b of m.beats) if (b.notes.length >= 3) chordFrets.add(b.notes[0].fret);
    expect([...chordFrets].sort((a, b) => a - b)).toEqual([5, 7, 12]);
  });

  it('drills slide intonation in standard tuning before retuning', () => {
    const notes = exerciseNotes('tech-slide-bottleneck');
    expect([...new Set(notes.map((n) => n.fret))]).toEqual([12, 10, 7, 5]);
    expect(notes.every((n) => n.string === 1)).toBe(true);
    const ids = lesson('slide-in-open-g').steps.map((s) => (s as { id?: string }).id ?? '');
    expect(ids.indexOf('slide-intonation')).toBeLessThan(ids.indexOf('retune-open-g'));
    expect(ids.indexOf('retune-open-g')).toBeLessThan(ids.indexOf('slide-blues'));
    expect(ids.indexOf('slide-blues')).toBeLessThan(ids.indexOf('back-to-standard'));
  });
});

describe('the text of unit 4', () => {
  it('names the right note at every "string N fret M ({n:X})"', () => {
    const claims = [...allText().matchAll(/string (\d) fret (\d+) \(\{n:([A-G][#b]?)\}\)/g)];
    expect(claims.length).toBeGreaterThan(10);
    for (const m of claims) expect(pitchClassAt({ string: Number(m[1]), fret: Number(m[2]) }), m[0]).toBe(chroma(m[3]));
  });
});

describe('the tasks of unit 4', () => {
  it('name the BPM the Player will play', async () => {
    for (const { lesson: l, task } of tasks()) {
      if (task.tool !== 'player') continue;
      const req = parsePlayerParams(task.params ?? []);
      expect(songEntry(req.songId!), `${l} > ${task.id}`).toBeTruthy();
      const s = await song(req.songId!);
      const bpm = s.tempo[0].bpm;
      const body = textOf(task.body);
      // "at 60 {t:bpm|BPM}" when no percentage is given is the address's own speed.
      const plain = /at (\d+) \{t:bpm\|BPM\}/.exec(body);
      if (plain) expect(Math.abs(Number(plain[1]) - bpm * (req.tempo ?? 100) / 100), `${task.id}: ${plain[0]}`).toBeLessThanOrEqual(1);
      for (const m of body.matchAll(/(\d+) % \((\d+) (?:\{t:bpm\|BPM\}|BPM)\)/g)) expect(Math.abs(Number(m[2]) - bpm * Number(m[1]) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      expect(plain || /%/.test(body), `${task.id} says a tempo`).toBeTruthy();
    }
  });

  it('jam on real tracks, in offered keys, at tempos the track allows', () => {
    for (const { task } of tasks()) {
      if (task.tool !== 'progressions') continue;
      const [id, key] = task.params ?? [];
      const p = getProgression(id)!;
      expect(p, id).toBeTruthy();
      expect(keyChoices(p).map((k) => k.toLowerCase()), id).toContain(key);
      const bpm = Number(/(\d+) \{t:bpm\|BPM\}/.exec(textOf(task.body))?.[1]);
      expect(bpm, task.id).toBeGreaterThanOrEqual(p.feel.tempo[0]);
      expect(bpm, task.id).toBeLessThanOrEqual(p.feel.tempo[1]);
    }
  });

  it('start each Technique ladder where the task says', () => {
    const said: Record<string, number> = { 'ladder-60': 60, 'from-nowhere-60': 60, 'tapping-50': 50 };
    for (const { task } of tasks()) {
      if (!(task.id in said)) continue;
      expect(getExercise(task.params![0])!.tempo.start, task.id).toBe(said[task.id]);
    }
  });
});

// ── Review of batch 11: what the review fixed ─────────────────────────────────────────────────

describe('the corrected claims of unit 4', () => {
  it('the legato run is pattern 1 of the first unit, and the glossary shares its term', () => {
    const run = exerciseNotes('tech-legato-3nps').slice(0, 18).map((n) => `${n.string}:${n.fret}`);
    const p1 = scalePatterns('G', 'major', { system: '3nps' }).find((x) => x.id === '3nps-1')!;
    expect(new Set(run)).toEqual(new Set(p1.notes.map((n) => `${n.string}:${n.fret}`)));
    // One id for "three notes per string" across the course: unit 1's.
    const ids = (u: typeof unit) => (u.glossary ?? []).map((g) => g.id);
    expect(ids(unitOne)).toContain('three-notes-per-string');
    expect(ids(unit)).toContain('three-notes-per-string');
    expect(ids(unit)).not.toContain('three-nps');
    expect(JSON.stringify(unit)).not.toContain('{t:three-nps');
  });

  it('the ladder task asks for the exercise as written: up the six strings, then back down', () => {
    const midis = exerciseNotes('tech-legato-3nps').map((n) => midiAt(n));
    expect(midis.length).toBe(36);
    for (let i = 1; i < 18; i++) expect(midis[i], `up, note ${i}`).toBeGreaterThan(midis[i - 1]);
    for (let i = 19; i < 36; i++) expect(midis[i], `down, note ${i}`).toBeLessThan(midis[i - 1]);
    const body = textOf(tasks().find((t) => t.task.id === 'ladder-60')!.task.body);
    expect(body).toMatch(/back down as written/);
    expect(body).not.toMatch(/then down three times/);
  });

  it('keeps the bending inside the exercises\' strain limits', () => {
    const minutes = Object.fromEntries(tasks().filter((t) => t.lesson === 'wide-bends').map((t) => [t.task.id, t.task.minutes]));
    expect(minutes['bend-minor-third']).toBeLessThanOrEqual(getExercise('tech-bend-minor-third')!.strain!.maxMinutes);
    expect(minutes['vibrato-bend']).toBeLessThanOrEqual(getExercise('tech-vibrato-bend')!.strain!.maxMinutes);
    // The whole lesson stays near the plan's 12 minutes of bending (engine part plus tasks).
    expect(Object.values(minutes).reduce((a, b) => a + b, 0) + lesson('wide-bends').minutes).toBeLessThanOrEqual(15);
  });
});
