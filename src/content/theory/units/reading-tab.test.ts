/**
 * Unit 5 of the Theory Path, cross-checked against the engines: every tab figure plays the pitches
 * the text names, every "tap the note this tab shows" has exactly the tab's own position as its
 * answer, the chord columns are the chords they claim, the rhythms under the tab match the tab's
 * durations, and "Ode to Joy" is the syllabus's frets, in four full bars.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { identifyFretted, midiAt, noteAt } from '@/core/guitar';
import { pcName } from '@/core/theory';
import {
  findTargets, formatProblems, parseRhythm, plainText, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type OrderExercise,
  type PlayPhraseExercise, type Step, type TabFigure, type TabNote, type TapRhythmExercise,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit from './reading-tab';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const allExercises = (): Exercise[] => [
  ...unit.lessons.flatMap((l) => {
    const own = exercises(l);
    const alts = own.flatMap((e) => ('alternative' in e && !('generate' in e.alternative) ? [e.alternative as Exercise] : []));
    const asks = (l.facts ?? []).flatMap((f) => (f.ask && !('generate' in f.ask) ? [f.ask as Exercise] : []));
    return [...own, ...alts, ...asks];
  }),
  ...(unit.checkpoint?.steps ?? []).flatMap((s) => ('generate' in s ? [] : [s as Exercise, ...('alternative' in s && !('generate' in s.alternative) ? [s.alternative as Exercise] : [])])),
];
const played = (n: TabNote) => ('rest' in n ? null : n);
const midiOf = (n: TabNote): number => {
  const p = played(n);
  if (!p) throw new Error('rest');
  return midiAt({ string: p.string, fret: p.fret });
};
const nameOf = (n: TabNote): string => pcName(noteAt(played(n)!, { context: { prefer: 'sharps' } }));
const tileOf = (n: TabNote): string => {
  const p = played(n)!;
  return p.fret === 0 ? `String ${p.string}, open` : `String ${p.string}, fret ${p.fret}`;
};
const pos = (list: Array<{ string: number; fret: number }>) => list.map(({ string, fret }) => ({ string, fret }));
const beats: Record<string, number> = { w: 4, h: 2, 'h.': 3, q: 1, 'q.': 1.5, e: 0.5 };
const patternOf = (notes: TabNote[]): string => notes.map((n) => n.duration).join(' ');

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('reading-tab: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word "tab"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^tab-/);
  });
});

describe('reading-tab: six lines, six strings', () => {
  it('draws one open string per line, string 1 on top, sounding E4 B3 G3 D3 A2 E2', () => {
    const card = lesson('six-lines-six-strings').steps[0];
    expect(cards(lesson('six-lines-six-strings'))[0]).toBe(card);
    const tab = (card as { figure: TabFigure }).figure;
    expect(tab.notes.map((n) => played(n)!.string)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tab.notes.map(midiOf)).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('the second-line note is string 2, the B string; the fifth line open is A2', () => {
    const q = exercises(lesson('six-lines-six-strings')).find((e): e is ChoiceExercise => e.type === 'choice' && e.prompt === 'Which string is this note on?')!;
    const n = played((q.figure as TabFigure).notes[0])!;
    expect(n.string).toBe(2);
    expect(nameOf(n)).toBe('B');
    expect(plainText(q.options.find((o) => o.correct)!.text!)).toBe('String 2');
    const find = exercises(lesson('six-lines-six-strings')).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(pos(findTargets(find))).toEqual([{ string: 5, fret: 0 }]);
  });

  it('orders the line labels as the standard tuning reads from string 1 down', () => {
    const order = exercises(lesson('six-lines-six-strings')).find((e): e is OrderExercise => e.type === 'order')!;
    const open = [1, 2, 3, 4, 5, 6].map((s) => pcName(noteAt({ string: s, fret: 0 })));
    expect(order.tiles.map((t) => plainText(t))).toEqual(open);
    expect(open.join(' ')).toBe('E B G D A E');
  });
});

describe('reading-tab: every "tap the note this tab shows" answers with the tab position itself', () => {
  const finds = allExercises().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find' && e.figure?.kind === 'tab' && (e.figure as TabFigure).notes.length === 1);

  it('finds them all', () => {
    expect(finds.length).toBeGreaterThanOrEqual(4);
  });

  for (const e of finds) {
    const n = played((e.figure as TabFigure).notes[0])!;
    it(`string ${n.string}, fret ${n.fret}`, () => {
      expect('note' in e.find && e.find.note).toBe(noteAt(n, { context: { prefer: 'sharps' } }));
      expect(pos(findTargets(e))).toEqual([{ string: n.string, fret: n.fret }]);
      // The explanation names the note the tab plays.
      expect(e.explain).toContain(`{n:${nameOf(n)}}`);
    });
  }

  it('the one-note choice questions name the note they show', () => {
    const q = exercises(lesson('numbers-are-frets')).find((e): e is ChoiceExercise => e.type === 'choice' && e.figure?.kind === 'tab')!;
    const n = played((q.figure as TabFigure).notes[0])!;
    expect([n.string, n.fret]).toEqual([6, 3]);
    expect(nameOf(n)).toBe('G');
    const cp = unit.checkpoint!.steps!.find((s): s is ChoiceExercise => !('generate' in s) && s.type === 'choice' && s.figure?.kind === 'tab')!;
    const m = played((cp.figure as TabFigure).notes[0])!;
    expect([m.string, m.fret]).toEqual([4, 2]);
    expect(nameOf(m)).toBe('E');
    expect(cp.explain).toContain('{n:E}');
  });
});

describe('reading-tab: numbers are frets', () => {
  it('plays E4 F4 G4 C4, as the syllabus and the neck picture say', () => {
    const card = lesson('numbers-are-frets').steps[0] as { figure: TabFigure };
    expect(card.figure.notes.map(midiOf)).toEqual([64, 65, 67, 60]);
    const neck = lesson('numbers-are-frets').steps[1] as { figure: { dots: Array<{ string: number; fret: number; note: string }> } };
    expect(neck.figure.dots.map((d) => midiAt(d))).toEqual([64, 65, 67, 60]);
    expect(neck.figure.dots.map((d) => d.note)).toEqual(['E4', 'F4', 'G4', 'C4']);
  });

  it('the play step and its tapping version are the same four notes, in order', () => {
    const play = exercises(lesson('numbers-are-frets')).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    const alt = play.alternative as OrderExercise;
    expect(alt.tiles).toEqual(play.notes.map(tileOf));
    expect((alt.figure as TabFigure).notes).toEqual(play.notes);
  });
});

describe('reading-tab: numbers in a column', () => {
  it('the column 0 1 0 2 3 (top line down, nothing on string 6) is the open C chord', () => {
    const l = lesson('stacked-numbers');
    const neck = l.steps[0] as { figure: { dots: Array<{ string: number; fret: number }> } };
    const column = [1, 2, 3, 4, 5].map((s) => neck.figure.dots.find((d) => d.string === s)!.fret);
    expect(column).toEqual([0, 1, 0, 2, 3]);
    expect(neck.figure.dots.some((d) => d.string === 6)).toBe(false);
    // Low string first, as a shape is spelled: the column read from the bottom up.
    expect(identifyFretted([null, ...[...column].reverse()]).symbol).toBe('C');
    const build = exercises(l).find((e) => e.type === 'chord-build')!;
    expect(build.type === 'chord-build' && build.frets).toBe('x32010');
    expect(identifyFretted('x32010').symbol).toBe('C');
  });

  it('the review column 0 1 2 2 0 is Am', () => {
    const fact = lesson('stacked-numbers').facts!.find((f) => f.id === 'tab-chord-column')!;
    expect(fact.ask && 'frets' in fact.ask && fact.ask.frets).toBe('x02210');
    expect(identifyFretted('x02210').symbol).toBe('Am');
    expect([...'x02210'].reverse().slice(0, 5).join(' ')).toBe('0 1 2 2 0');
  });

  it('spreads the same five notes as a row, and strums them as the listening example', () => {
    const l = lesson('stacked-numbers');
    const spread = (cards(l).find((s) => s.figure?.kind === 'tab')!.figure as TabFigure);
    expect(spread.notes.map(midiOf)).toEqual([48, 52, 55, 60, 64]);
    expect(spread.notes.map(nameOf)).toEqual(['C', 'E', 'G', 'C', 'E']);
    const listen = exercises(l).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const events = soundPlan(listen.sound).events;
    expect(events).toHaveLength(1); // one strum: all together
    expect([...events[0].midi].sort((a, b) => a - b)).toEqual([48, 52, 55, 60, 64]);
  });
});

describe('reading-tab: technique symbols', () => {
  it('string 3 frets 5, 7 and 9 are C4, D4 and E4, as the captions say', () => {
    expect(noteAt({ string: 3, fret: 5 })).toBe('C4');
    expect(noteAt({ string: 3, fret: 7 })).toBe('D4');
    expect(noteAt({ string: 3, fret: 9 })).toBe('E4');
    const play = exercises(lesson('technique-symbols')).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(play.notes.map(midiOf)).toEqual([60, 62]);
  });

  it('writes every planned mark, and the backslash survives the markup', () => {
    const text = JSON.stringify(lesson('technique-symbols'));
    for (const mark of ['5h7', '7p5', '5/7', '7b9', '7~']) expect(text).toContain(mark);
    const slides = cards(lesson('technique-symbols')).find((s) => s.title?.startsWith('Slides'))!;
    expect(plainText(slides.body)).toContain('7\\5');
    // Card titles are shown as written (no markup), so the title carries a single backslash.
    expect(slides.title).toBe('Slides: / and \\');
  });
});

describe('reading-tab: what tab does not tell you', () => {
  const l = lesson('tab-and-rhythm');
  const line = (l.steps[0] as { figure: TabFigure }).figure.notes;

  it('the line is string 1, frets 0 1 3 1, quarter quarter half | whole', () => {
    expect(line.map((n) => played(n)!.fret)).toEqual([0, 1, 3, 1]);
    expect(line.every((n) => played(n)!.string === 1)).toBe(true);
    expect(patternOf(line)).toBe('q q h w');
    const stems = (l.steps[1] as { figure: { pattern: string } }).figure.pattern;
    expect(stems.replace(/ \| /g, ' ')).toBe(patternOf(line));
  });

  it('the listening question plays that line and its right option is its rhythm; the others start notes elsewhere', () => {
    const q = exercises(l).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(q.sound.kind === 'tab' && q.sound.notes).toEqual(line);
    const right = q.options.find((o) => o.correct)!.figure as { pattern: string };
    expect(right.pattern).toBe('q q h | w');
    const onsets = q.options.map((o) => parseRhythm((o.figure as { pattern: string }).pattern).onsets.join(','));
    expect(new Set(onsets).size).toBe(q.options.length);
  });

  it('the tap-rhythm pattern is the rhythm of the tab it shows', () => {
    const tap = exercises(l).find((e): e is TapRhythmExercise => e.type === 'tap-rhythm')!;
    expect(patternOf((tap.figure as TabFigure).notes)).toBe(tap.rhythm.pattern);
  });
});

describe('reading-tab: Ode to Joy', () => {
  const l = lesson('first-tab-tune');
  const ode = (l.steps[0] as { figure: TabFigure }).figure.notes;

  it('plays the syllabus frets, bar by bar', () => {
    const plan = JSON.parse(readFileSync(new URL('../../plan/theory-path.json', import.meta.url), 'utf8')) as {
      course: { stages: Array<{ units: Array<{ id: string; lessons: Array<{ id: string; onTheGuitar: string }> }> }> };
    };
    const entry = plan.course.stages[0].units.find((u) => u.id === 'reading-tab')!.lessons.find((x) => x.id.endsWith('/first-tab-tune'))!;
    // "bar 1 string 1 frets 0 0 1 3; bar 2 string 1 frets 3 1 0, string 2 fret 3; ..."
    const planned = entry.onTheGuitar
      .split(/bar \d /)
      .slice(1)
      .flatMap((bar) => [...bar.matchAll(/string (\d) frets? ([\d ]+)/g)].flatMap((m) => m[2].trim().split(' ').map((f) => [Number(m[1]), Number(f)])));
    expect(ode.map((n) => [played(n)!.string, played(n)!.fret])).toEqual(planned);
  });

  it('is the tune: E E F G | G F E D | C C D E | E. D D, in four full bars', () => {
    expect(ode.map(nameOf).join(' ')).toBe('E E F G G F E D C C D E E D D');
    const bars: number[] = [];
    let sum = 0;
    for (const n of ode) {
      sum += beats[n.duration];
      if (sum >= 4) {
        bars.push(sum);
        sum = 0;
      }
    }
    expect(bars).toEqual([4, 4, 4, 4]);
    expect(sum).toBe(0);
    expect(ode[ode.length - 1].duration).toBe('h'); // "ends on a long D"
  });

  it('its highest note is G4 at string 1, fret 3, and its last note D4 at string 2, fret 3', () => {
    const top = Math.max(...ode.map(midiOf));
    expect(top).toBe(67);
    const find = exercises(l).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(pos(findTargets(find))).toEqual([{ string: 1, fret: 3 }]);
    const last = unit.checkpoint!.steps!.find((s): s is FretboardFindExercise => !('generate' in s) && s.type === 'fretboard-find' && (s.figure as TabFigure | undefined)?.notes.length === ode.length)!;
    expect(pos(findTargets(last))).toEqual([{ string: 2, fret: 3 }]);
    expect(midiOf(ode[ode.length - 1])).toBe(62);
  });

  it('every order exercise over a tab lists that tab position by position', () => {
    const orders = allExercises().filter((e): e is OrderExercise => e.type === 'order' && e.figure?.kind === 'tab');
    expect(orders.length).toBeGreaterThanOrEqual(5);
    for (const o of orders) expect(o.tiles).toEqual((o.figure as TabFigure).notes.map(tileOf));
  });

  it('the explanations name the notes of each bar', () => {
    const play = exercises(l).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    const named = [...String(play.explain).matchAll(/\{n:([A-G]#?)\}/g)].map((m) => m[1]);
    expect(named.join(' ')).toBe(ode.map(nameOf).join(' '));
  });
});
