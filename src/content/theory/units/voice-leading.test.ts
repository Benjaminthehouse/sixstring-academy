/**
 * Unit 38 of the Theory Path, cross-checked against the engines: every chord shape written in the
 * text, figures and exercises, the notes each voice keeps or moves, the motion of every two-voice
 * example, the sixths and fifths, the line clichés, the non-chord tones, the voice-led ii-V-I and
 * its guide tones, what each listening question plays, and that every lesson still teaches with the
 * guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, intervalBetween, parseChord, scaleNotes, scalePcs } from '@/core/theory';
import { buildVoicing, identifyFretted, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type PlayChordExercise, type PlayPhraseExercise, type RichText, type Step,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './voice-leading';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
/** Every literal exercise: lesson steps, play alternatives, fact asks and the checkpoint. */
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const ofType = <T extends Exercise>(type: T['type']): T[] => allExercises().filter((e): e is T => e.type === type);
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText[] => e.options.filter((o) => o.correct).map((o) => o.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const heard = (e: ListenChoiceExercise): number[][] => soundPlan(e.sound).events.map((ev) => ev.midi);
/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const card = (l: Lesson, index: number) => {
  const step = l.steps[index];
  if (isGenerated(step) || step.type !== 'card') throw new Error(`${l.id} step ${index} is not a card`);
  return step;
};

describe('voice-leading: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^voice-/);
  });
});

/** The note each string sounds in a shape, by string number. */
const byString = (symbol: string, shape: string): Map<number, number> => new Map(buildVoicing(symbol, shape).notes.map((n) => [n.string, n.midi]));
/** How two voices move: each voice is [from, to] in MIDI. */
function motion(low: [number, number], high: [number, number]): 'parallel' | 'similar' | 'contrary' | 'oblique' {
  const a = Math.sign(low[1] - low[0]);
  const b = Math.sign(high[1] - high[0]);
  if (a === 0 || b === 0) return 'oblique';
  if (a !== b) return 'contrary';
  const before = high[0] - low[0];
  const after = high[1] - low[1];
  // Parallel keeps the same kind of interval: a third stays a third (3 or 4 half steps), a sixth a sixth.
  const kind = (s: number): number => [0, 2, 2, 3, 3, 4, 4.5, 5, 6, 6, 7, 7, 8][s % 12];
  return kind(before) === kind(after) ? 'parallel' : 'similar';
}

describe('voice-leading: every shape written in the text', () => {
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(12);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('names the shapes quoted without a chord symbol beside them', () => {
    // Triads on strings 3-2-1, written as frets.
    expect(buildVoicing('G/B', 'xxx433').chord).toBe('G/B');
    expect(buildVoicing('C', 'xxx553').chord).toBe('C');
    expect(buildVoicing('D/A', 'xxx232').chord).toBe('D/A');
    // The line clichés and the facts that quote shapes.
    // The cliché names follow the held Am; the identifier may prefer another name for the same notes (C6/G, F#m7b5).
    const cliche: Array<[string, string]> = [['Am', 'xx7555'], ['AmMaj7/G#', 'xx6555'], ['Am7/G', 'xx5555'], ['Am6/F#', 'xx4555']];
    for (const [c, f] of cliche) expect(buildVoicing(c, f).chord).toBe(c);
    expect(identifyFretted('xx5555').matches.map((m) => m.symbol)).toContain('Am7/G');
    expect(identifyFretted('xx4555').matches.map((m) => m.symbol)).toContain('Am6/F#');
    expect(['x32010', 'x32110', 'x32310'].map((s) => identifyFretted(s).symbol)).toEqual(['C', 'Caug', 'C7']);
    expect(identifyFretted('x32210').symbol).toBe('Am/C'); // C6 without its 5th
    expect(identifyFretted('x5546x').symbol).toBe('G7/D');
    expect(identifyFretted('x-10-12-10-12-x').symbol).toBe('G7');
  });

  it('builds every chord-build and play-chord shape as its chord', () => {
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(16);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });
});

describe('voice-leading: common tones', () => {
  it('keeps C and E from C to Am, and moves only G', () => {
    expect(chordNotes('C').filter((n) => chordNotes('Am').includes(n))).toEqual(['C', 'E']);
    expect(chordNotes('C').filter((n) => !chordNotes('Am').includes(n))).toEqual(['G']);
    expect(intervalBetween('G', 'A')).toBe('M2');
    const c = byString('C', 'x32010');
    const am = byString('Am', 'x02210');
    expect([4, 2, 1].map((s) => c.get(s) === am.get(s))).toEqual([true, true, true]);
    expect(am.get(3)! - c.get(3)!).toBe(2); // G up to A
    expect(c.get(5)! - am.get(5)!).toBe(3); // the bass C down to A
    const q = ofType<ChoiceExercise>('choice').filter((e) => /from \{c:C\} to \{c:Am\}, which notes stay/i.test(String(e.prompt)));
    expect(q.length).toBe(2);
    for (const e of q) expect(tagged(correct(e)[0], 'note')).toEqual(['C', 'E']);
  });

  it('asks for exactly the two new A notes between frets 0 and 3', () => {
    const find = exercises(lesson('what-voice-leading-is').steps).find((e) => e.type === 'fretboard-find');
    if (find?.type !== 'fretboard-find') throw new Error('expected a fretboard-find');
    const places: string[] = [];
    for (let s = 1; s <= 6; s++) for (let f = find.frets[0]; f <= find.frets[1]; f++) if (midiAt({ string: s, fret: f }) % 12 === 9) places.push(`${s}:${f}`);
    expect(places.sort()).toEqual(['3:2', '5:0']);
    for (const d of find.shown ?? []) expect(byString('Am', 'x02210').get(d.string)).toBe(midiAt(d));
    const fig = card(lesson('what-voice-leading-is'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.filter((d) => d.role === 'target').map((d) => `${d.string}:${d.fret}`).sort()).toEqual(['3:2', '5:0']);
    expect(fig.dots!.filter((d) => d.role === 'ghost').map((d) => midiAt(d))).toEqual([48, 55]); // where C had C and G
  });

  it('keeps G and B from G to Em, and moves only D', () => {
    expect(chordNotes('G').filter((n) => !chordNotes('Em').includes(n))).toEqual(['D']);
    expect(intervalBetween('D', 'E')).toBe('M2');
    const q = ofType<ChoiceExercise>('choice').find((e) => /From \{c:G\} to \{c:Em\}/.test(String(e.prompt)))!;
    expect(tagged(correct(q)[0], 'note')).toEqual(['D', 'E']);
  });

  it('moves only string 4 from Am to Fmaj7', () => {
    const am = byString('Am', 'x02210');
    const f = byString('Fmaj7', 'xx3210');
    expect([4, 3, 2, 1].filter((s) => am.get(s) !== f.get(s))).toEqual([4]);
    expect(f.get(4)! - am.get(4)!).toBe(1);
    expect(f.has(5)).toBe(false);
  });

  it('plays a jumpy progression in close root position and a smooth one in open shapes', () => {
    const [jumpy, smooth] = listens(lesson('what-voice-leading-is'));
    const shared = (chords: number[][]): number[] => chords.slice(1).map((c, i) => c.filter((m) => chords[i].includes(m)).length);
    expect(jumpy.sound).toMatchObject({ kind: 'progression', chords: ['C', 'Am', 'C', 'Am'], voicing: 'close' });
    expect(shared(heard(jumpy))).toEqual([0, 0, 0]);
    const d = heard(jumpy);
    for (let i = 0; i + 1 < d.length; i++) expect(d[i + 1].map((m, j) => Math.abs(m - d[i][j]))).toEqual([9, 8, 9]); // every voice leaps a sixth
    expect(plainText(correct(jumpy)[0])).toBe('Jumpy');
    expect(shared(heard(smooth))).toEqual([3, 3, 2]); // open C, Am, Fmaj7, C: two or three notes kept at every change
    expect(plainText(correct(smooth)[0])).toBe('Smooth');
  });
});

describe('voice-leading: inversions on strings 3-2-1', () => {
  const shapes: Array<[string, string]> = [['G/B', 'xxx433'], ['C', 'xxx553'], ['D/A', 'xxx232'], ['G/B', 'xxx433']];
  const strings = shapes.map(([c, s]) => byString(c, s));

  it('keeps the hand within frets 2 to 5, no voice moving more than three frets', () => {
    for (const [c, s] of shapes) for (const n of buildVoicing(c, s).notes) expect(n.fret, `${c} ${s}`).toBeGreaterThanOrEqual(2);
    for (const [c, s] of shapes) for (const n of buildVoicing(c, s).notes) expect(n.fret, `${c} ${s}`).toBeLessThanOrEqual(5);
    for (let i = 0; i + 1 < strings.length; i++) for (const s of [3, 2, 1]) expect(Math.abs(strings[i + 1].get(s)! - strings[i].get(s)!)).toBeLessThanOrEqual(3);
    // G to C: string 1 keeps G; B and D step up to C and E.
    expect([3, 2, 1].map((s) => strings[1].get(s)! - strings[0].get(s)!)).toEqual([1, 2, 0]);
    // D back to G: string 2 keeps D.
    expect([3, 2, 1].map((s) => strings[3].get(s)! - strings[2].get(s)!)).toEqual([2, 0, 1]);
    expect(buildVoicing('G/B', 'xxx433').notes.map((n) => n.note)).toEqual(['B', 'D', 'G']);
    expect(buildVoicing('D/A', 'xxx232').notes.map((n) => n.note)).toEqual(['A', 'D', 'F#']);
  });

  it('draws and plays the same shapes', () => {
    const fig = card(lesson('inversions-for-smoothness'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const drawn = new Set(fig.dots!.map((d) => `${d.string}:${d.fret}`));
    const used = new Set(shapes.flatMap(([c, s]) => buildVoicing(c, s).notes.map((n) => `${n.string}:${n.fret}`)));
    expect([...drawn].sort()).toEqual([...used].sort());
    const audio = card(lesson('inversions-for-smoothness'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    expect(soundPlan(audio.sound).events.map((e) => e.midi[0])).toEqual(shapes.flatMap(([c, s]) => buildVoicing(c, s).midi));
    // The top voice the card describes: G, G, F#, G.
    expect(strings.map((m) => m.get(1)! % 12)).toEqual([7, 7, 6, 7]);
  });
});

describe('voice-leading: kinds of motion', () => {
  /** The two voices of a labelled two-voice figure: string 3 is the low voice, string 1 the high one. */
  const voices = (dots: Array<{ string: number; fret: number; label?: string }>): { low: [number, number]; high: [number, number] } => {
    const at = (s: number, label: string): number => midiAt(dots.find((d) => d.string === s && d.label === label)!);
    return { low: [at(3, '1'), at(3, '2')], high: [at(1, '1'), at(1, '2')] };
  };

  it('shows each motion the caption or question names', () => {
    const parallel = card(lesson('kinds-of-motion'), 0).figure;
    const contrary = card(lesson('kinds-of-motion'), 2).figure;
    const similar = exercises(lesson('kinds-of-motion').steps).find((e) => e.type === 'choice' && e.figure?.kind === 'fretboard')!;
    for (const [fig, name] of [[parallel, 'parallel'], [contrary, 'contrary'], [similar.figure, 'similar']] as const) {
      if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
      const v = voices(fig.dots!);
      expect(motion(v.low, v.high), name).toBe(name);
    }
    if (similar.type !== 'choice') throw new Error('expected a choice');
    expect(plainText(correct(similar)[0])).toBe('Similar');
    // Oblique: an open string held under a moving line.
    expect(motion([55, 55], [64, 65])).toBe('oblique');
    // Parallel and similar motion go down as well as up (review fix: the card no longer says "both up").
    expect(motion([57, 55], [66, 64])).toBe('parallel');
    expect(motion([57, 55], [67, 64])).toBe('similar');
    expect(card(lesson('kinds-of-motion'), 0).body).not.toMatch(/Both up/);
  });

  it('plays contrary and then parallel motion in the listening questions', () => {
    const [contrary, parallel] = listens(lesson('kinds-of-motion'));
    const moves = (q: ListenChoiceExercise): string[] => {
      const d = heard(q);
      expect(d.every((pair) => pair.length === 2)).toBe(true);
      return d.slice(1).map((pair, i) => motion([d[i][0], pair[0]], [d[i][1], pair[1]]));
    };
    expect(heard(contrary)).toEqual([[50, 53], [48, 55], [50, 53]]);
    expect(moves(contrary)).toEqual(['contrary', 'contrary']);
    expect(plainText(correct(contrary)[0])).toBe('Contrary');
    expect(heard(parallel)).toEqual([[48, 52], [50, 53], [52, 55]]);
    expect(moves(parallel)).toEqual(['parallel', 'parallel']);
    expect(plainText(correct(parallel)[0])).toBe('Parallel');
  });
});

describe('voice-leading: parallel fifths, thirds and sixths', () => {
  it('draws power chords in parallel fifths and the corrected version', () => {
    const fifths = card(lesson('parallel-fifths'), 0).figure;
    if (fifths?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const low = fifths.dots!.filter((d) => d.string === 5).map((d) => midiAt(d));
    const high = fifths.dots!.filter((d) => d.string === 4).map((d) => midiAt(d));
    expect(high.map((m, i) => m - low[i])).toEqual([7, 7, 7, 7]);
    for (const [i, c] of ['C5', 'D5', 'E5', 'F5'].entries()) expect([low[i], high[i]].map((m) => m % 12)).toEqual(chordPcs(c));
    // The fix: bass C D E F, top G F G A (string 4 at 5, 3, 5, 7).
    const bass = [48, 50, 52, 53];
    const top = [55, 53, 55, 57];
    expect(bass.slice(1).map((b, i) => motion([bass[i], b], [top[i], top[i + 1]]))).toEqual(['contrary', 'parallel', 'parallel']);
    expect(top.map((t, i) => t - bass[i])).toEqual([7, 3, 3, 4]);
    const fix = card(lesson('parallel-fifths'), 1).figure;
    if (fix?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fix.dots!.filter((d) => d.string === 5).map((d) => midiAt(d))).toEqual(bass);
    expect([...new Set(fix.dots!.filter((d) => d.string === 4).map((d) => midiAt(d)))].sort()).toEqual([...new Set(top)].sort());
  });

  it('plays fifths and then thirds, both voices climbing together', () => {
    const [fifths, thirds] = listens(lesson('parallel-fifths'));
    expect(heard(fifths).map(([a, b]) => b - a)).toEqual([7, 7, 7, 7]);
    expect(heard(thirds).map(([a, b]) => b - a)).toEqual([4, 3, 3, 4]);
    for (const q of [fifths, thirds]) {
      const d = heard(q);
      expect(d.slice(1).every((p, i) => p[0] > d[i][0] && p[1] > d[i][1])).toBe(true);
    }
    expect(plainText(correct(fifths)[0])).toBe('Parallel fifths');
    expect(plainText(correct(thirds)[0])).toBe('Parallel thirds');
    expect(heard(exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!).map(([a, b]) => b - a)).toEqual([7, 7, 7, 7]);
  });

  it('plays G major in sixths on strings 3 and 1, as the syllabus gives the frets', async () => {
    const { readFileSync } = await import('node:fs');
    const plan = JSON.parse(readFileSync(new URL('../../plan/theory-path.json', import.meta.url), 'utf8')) as {
      course: { stages: Array<{ units: Array<{ id: string; lessons: Array<{ id: string; exercises: Array<{ type: string; idea: string }> }> }> }> };
    };
    const entry = plan.course.stages.flatMap((s) => s.units).find((u) => u.id === 'voice-leading')!.lessons.find((l) => l.id.endsWith('/parallel-fifths'))!;
    const idea = entry.exercises.find((e) => e.type === 'play-phrase')!.idea;
    const planned = [...idea.matchAll(/(\d+)-(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const phrases = exercises(lesson('parallel-fifths').steps).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
    expect(phrases.length).toBe(2);
    const notes = phrases.flatMap((p) => p.notes).filter((n): n is { string: number; fret: number; duration: 'e' } => 'string' in n);
    const played: number[][] = [];
    for (let i = 0; i < notes.length; i += 2) {
      expect([notes[i].string, notes[i + 1].string]).toEqual([3, 1]);
      played.push([notes[i].fret, notes[i + 1].fret]);
    }
    expect(played).toEqual(planned);
    const gMajor = scalePcs('G', 'major');
    const low = played.map(([f]) => midiAt({ string: 3, fret: f }));
    const high = played.map(([, f]) => midiAt({ string: 1, fret: f }));
    expect(low.map((m) => m % 12)).toEqual([...scalePcs('G', 'major'), 7]);
    for (const [i, h] of high.entries()) {
      expect(gMajor).toContain(h % 12);
      expect([8, 9]).toContain(h - low[i]); // a minor or major sixth
    }
    expect(scaleNotes('G', 'major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(played.filter(([a, b]) => a !== b)).toEqual([[4, 3], [9, 8], [11, 10]]);
    // Same fret on strings 3 and 1 is a major sixth; one fret lower on string 1 is a minor sixth.
    played.forEach(([a, b], i) => expect(high[i] - low[i] === 8, `${a}-${b}`).toBe(a !== b));
    const tiles = phrases.flatMap((p) => (!isGenerated(p.alternative) && p.alternative.type === 'order' ? p.alternative.tiles.map((t) => plainText(t)) : []));
    expect(tiles).toEqual(planned.map(([a, b]) => `${a}-${b}`));
    // Each tapping version has a near miss to reject (review fix): the same fret on string 1 where the
    // sixth is minor, which puts a note outside G major on top.
    const distractors = phrases.flatMap((p) => (!isGenerated(p.alternative) && p.alternative.type === 'order' ? (p.alternative.distractors ?? []).map((t) => plainText(t)) : []));
    expect(distractors).toEqual(['4-4', '9-9']);
    for (const d of distractors) {
      const [a, b] = d.split('-').map(Number);
      expect(gMajor, d).toContain(midiAt({ string: 3, fret: a }) % 12);
      expect(gMajor, d).not.toContain(midiAt({ string: 1, fret: b }) % 12);
      expect(played.some(([x]) => x === a), d).toBe(true);
    }
    const fig = card(lesson('parallel-fifths'), 4).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.map((d) => `${d.string}:${d.fret}`).sort()).toEqual(played.flatMap(([a, b]) => [`3:${a}`, `1:${b}`]).sort());
  });
});

describe('voice-leading: line clichés', () => {
  it('moves only string 4 of the Am shape, A G# G F#', () => {
    const shapes: Array<[string, string]> = [['Am', 'xx7555'], ['AmMaj7/G#', 'xx6555'], ['Am7/G', 'xx5555'], ['Am6/F#', 'xx4555']];
    const s = shapes.map(([c, f]) => byString(c, f));
    expect(s.map((m) => m.get(4))).toEqual([57, 56, 55, 54]);
    for (const str of [3, 2, 1]) expect(new Set(s.map((m) => m.get(str))).size).toBe(1);
    expect(chordNotes('AmMaj7')).toEqual(['A', 'C', 'E', 'G#']);
    expect(chordNotes('Am7')).toEqual(['A', 'C', 'E', 'G']);
    expect(chordNotes('Am6')).toEqual(['A', 'C', 'E', 'F#']);
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /line clich/.test(String(e.prompt)));
    expect(fills.length).toBe(2);
    for (const e of fills) {
      const shown = tagged(e.text, 'note');
      const all = ['A', 'G#', 'G', 'F#'];
      const gap = all.findIndex((n, i) => shown[i] !== n);
      expect(tagged(e.blanks[0], 'note')[0]).toBe(all[gap]);
    }
    const q = ofType<ChoiceExercise>('choice').filter((e) => /xx7555 with string 4 at fret/.test(String(e.prompt)));
    expect(q.length).toBe(2);
    for (const e of q) {
      const fret = Number(plainText(e.prompt).match(/fret (\d)/)![1]);
      const answer = tagged(correct(e)[0], 'chord')[0];
      expect(buildVoicing(answer, `xx${fret}555`).chord).toBe(answer);
      for (const o of e.options.filter((x) => !x.correct)) expect(tryBuildVoicing(tagged(o.text ?? '', 'chord')[0], `xx${fret}555`)).toBeNull();
    }
    const fig = card(lesson('line-cliches'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.filter((d) => d.string === 4).map((d) => midiAt(d))).toEqual([57, 56, 55, 54]);
  });

  it('falls in the minor cliché and climbs in the major one', () => {
    const [falling, rising] = listens(lesson('line-cliches'));
    const groups = (q: ListenChoiceExercise, size: number): number[][] => {
      const notes = heard(q).map((m) => m[0]);
      return Array.from({ length: notes.length / size }, (_v, i) => notes.slice(i * size, i * size + size));
    };
    expect(groups(falling, 4).map((g) => g[0])).toEqual([57, 56, 55, 54]);
    expect(plainText(correct(falling)[0])).toBe('Falling');
    expect(groups(rising, 5).map((g) => g[2])).toEqual([55, 56, 57, 58]); // string 3: G G# A Bb
    expect(plainText(correct(rising)[0])).toBe('Rising');
    expect(chordNotes('C6')).toEqual(['C', 'E', 'G', 'A']);
    expect(chordNotes('C7')[3]).toBe('Bb');
  });
});

describe('voice-leading: non-chord tones', () => {
  const C = chordPcs('C');

  it('passes on D and turns on F over C', () => {
    const fig = card(lesson('non-chord-tones'), 0).figure;
    if (fig?.kind !== 'tab') throw new Error('expected a tab');
    const line = fig.notes.flatMap((n) => ('rest' in n ? [] : [midiAt(n)]));
    expect(line).toEqual([60, 62, 64, 64, 65, 64]); // C D E, E F E
    expect(C.includes(62 % 12)).toBe(false);
    expect(C.includes(65 % 12)).toBe(false);
    expect([line[1] - line[0], line[2] - line[1]]).toEqual([2, 2]); // D: by step between two chord tones
    expect([line[4] - line[3], line[5] - line[4]]).toEqual([1, -1]); // F: away and back
  });

  it('holds G from the G chord over D, then falls to F#: a 4-3 suspension', () => {
    const top = (symbol: string, shape: string): number => byString(symbol, shape).get(1)!;
    expect([top('G', '320003'), top('Dsus4', 'xx0233'), top('D', 'xx0232')]).toEqual([67, 67, 66]);
    // "String 1 stays at fret 3 until the last chord" (review fix: the D chord has it at fret 2).
    expect(['320003', 'xx0233', 'xx0232'].map((s) => Number(s[5]))).toEqual([3, 3, 2]);
    expect(card(lesson('non-chord-tones'), 3).body).toMatch(/String 1 stays at fret 3 until the last chord/);
    expect(chordPcs('G')).toContain(7);
    expect(chordPcs('D')).not.toContain(7);
    expect(intervalBetween('D', 'G')).toBe('P4');
    expect(intervalBetween('D', 'F#')).toBe('M3');
    const [yes, no] = listens(lesson('non-chord-tones'));
    expect(heard(yes).map((m) => Math.max(...m))).toEqual([67, 67, 66]);
    expect(plainText(correct(yes)[0])).toMatch(/^Yes/);
    expect(heard(no).map((m) => Math.max(...m))).toEqual([67, 67, 67]);
    expect(plainText(correct(no)[0])).toMatch(/^No/);
    const q = ofType<ChoiceExercise>('choice').filter((e) => /\{c:Dsus4\}, \{c:D\}, which note is (the suspension|suspended)/.test(String(e.prompt)));
    expect(q.length).toBe(2);
    for (const e of q) expect(tagged(correct(e)[0], 'note')).toEqual(['G']);
  });

  it('leaps to F on the strong beat and steps down to E: an appoggiatura', () => {
    const fig = card(lesson('non-chord-tones'), 7).figure;
    if (fig?.kind !== 'tab') throw new Error('expected a tab');
    const line = fig.notes.flatMap((n) => ('rest' in n ? [] : [midiAt(n)]));
    expect(line).toEqual([60, 65, 64]);
    expect(line[1] - line[0]).toBe(5); // a leap of a fourth
    expect(line[1] - line[2]).toBe(1); // then a step down
    expect(C.includes(65 % 12)).toBe(false);
    expect(fig.notes[0].duration).toBe('w'); // so the F falls on beat 1 of bar 2
  });
});

describe('voice-leading: a voice-led ii-V-I', () => {
  const shapes: Array<[string, string]> = [['Dm7', 'x5756x'], ['G7/D', 'x5546x'], ['Cmaj7', 'x3545x']];
  const s = shapes.map(([c, f]) => byString(c, f));

  it('moves no voice more than a whole step', () => {
    for (let i = 0; i + 1 < s.length; i++) for (const str of [5, 4, 3, 2]) expect(Math.abs(s[i + 1].get(str)! - s[i].get(str)!), `string ${str}`).toBeLessThanOrEqual(2);
    expect([5, 4, 3, 2].filter((str) => s[0].get(str) === s[1].get(str))).toEqual([5, 2]); // D and F stay
    expect([5, 4, 3, 2].filter((str) => s[1].get(str) === s[2].get(str))).toEqual([4, 3]); // G and B stay
    expect(buildVoicing('Dm7', 'x5756x').notes.map((n) => n.note)).toEqual(['D', 'A', 'C', 'F']);
    expect(buildVoicing('G7/D', 'x5546x').notes.map((n) => n.note)).toEqual(['D', 'G', 'B', 'F']);
    expect(buildVoicing('Cmaj7', 'x3545x').notes.map((n) => n.note)).toEqual(['C', 'G', 'B', 'E']);
  });

  it('moves the guide tones by half step: C to B and F to E', () => {
    const tone = (symbol: string, degree: string): string => buildVoicing(...shapes.find(([c]) => c === symbol)!).notes.find((n) => n.degree === degree)!.note;
    expect([tone('Dm7', 'b7'), tone('G7/D', '3')]).toEqual(['C', 'B']);
    expect([tone('G7/D', 'b7'), tone('Cmaj7', '3')]).toEqual(['F', 'E']);
    expect(intervalBetween('B', 'C')).toBe('m2');
    expect(intervalBetween('E', 'F')).toBe('m2');
    const q = ofType<ChoiceExercise>('choice').find((e) => /7th of \{c:G7\}, \{n:F\}/.test(String(e.prompt)))!;
    expect(tagged(correct(q)[0], 'note')).toEqual(['E']);
    const fig = card(lesson('voice-led-two-five-one'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.map((d) => `${d.string}:${d.fret}`).sort()).toEqual([...new Set(shapes.flatMap(([c, f]) => buildVoicing(c, f).notes.map((n) => `${n.string}:${n.fret}`)))].sort());
  });

  it('plays the voice-led shapes, then a version where every voice leaps', () => {
    const [led, jumpy] = listens(lesson('voice-led-two-five-one'));
    expect(heard(led).map((m) => m[0])).toEqual(shapes.flatMap(([c, f]) => buildVoicing(c, f).midi));
    const jumpyShapes: Array<[string, string]> = [['Dm7', 'x5756x'], ['G7', 'x-10-12-10-12-x'], ['Cmaj7', 'x3545x']];
    expect(heard(jumpy).map((m) => m[0])).toEqual(jumpyShapes.flatMap(([c, f]) => buildVoicing(c, f).midi));
    const leaps = buildVoicing('G7', 'x-10-12-10-12-x').midi.map((m, i) => m - buildVoicing('Dm7', 'x5756x').midi[i]);
    expect(leaps.every((d) => Math.abs(d) > 2)).toBe(true);
    expect(plainText(correct(led)[0])).toBe('Voice-led');
    expect(plainText(correct(jumpy)[0])).toBe('Jumpy');
    expect(parseChord('G7/D')!.bass).toBe('D');
  });
});

describe('voice-leading: words a learner can rely on', () => {
  it('names the moving voice of the arpeggiated cliché by its string, not as "the third note"', () => {
    // Picked low to high, x32010 sounds C E G C E: the climbing voice is on string 3.
    expect(identifyFretted('x32010').notes.map((n) => n.string)).toEqual([5, 4, 3, 2, 1]);
    for (const text of texts(unit)) expect(text, text).not.toMatch(/third note of each/i);
  });

  it('keeps music symbols out of the plain-text "teaches" lines', () => {
    for (const l of unit.lessons) expect(l.teaches, l.id).not.toMatch(/[#{}]/);
  });
});

describe('voice-leading: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(12);
    }
  });

  it('asks every fact without sound somewhere in its lesson', () => {
    for (const l of adaptUnit(unit, { guitar: false, sound: false }).lessons) {
      for (const f of l.facts ?? []) expect(l.steps.some((s) => !isGenerated(s) && s.type !== 'card' && s.fact === f.id), `${l.id}: ${f.id}`).toBe(true);
    }
  });
});
