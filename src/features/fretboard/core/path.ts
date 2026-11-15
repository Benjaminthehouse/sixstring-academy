/**
 * The method: the neck taught in ten steps, the way a teacher would. Natural notes on the two
 * lowest strings first (the roots of every barre chord), then the octave shapes that carry them
 * to the other strings, every natural note, sharps and flats, the whole neck, and above fret 12.
 * Landmarks (the open strings, the dots, the double dot at 12) are the anchors throughout.
 *
 * Every sentence a step teaches is computed from the tuning, so the notes, frets and shapes are
 * always right for the learner's guitar.
 */
import { pcOf, spell } from './notes';
import { describeShape, inlayFretsIn, midiAtPos, octaveShape, pcAt, placesInScope, scopePositions, stringOpenPc } from './neck';
import type { NoteFormatter } from './explain';
import type { Ask, AskOptions } from './questions';
import type { NeckContext, Pos, Scope } from './types';

/** One step of the method. */
export interface Stage {
  /** Route param and skill suffix: skill id `fretboard:<id>`. */
  id: string;
  n: number;
  title: string;
  /** One line under the title. */
  blurb: string;
  asks: Ask[];
  options?: AskOptions;
  /** Questions in the step's round. */
  length: number;
  scope(ctx: NeckContext, maxFret: number): Scope;
}

const all = (ctx: NeckContext): number[] => Array.from({ length: ctx.tuning.length }, (_, i) => i + 1);
const only = (ctx: NeckContext, strings: number[]): number[] => strings.filter((s) => s <= ctx.tuning.length);

/** The ten steps, in order. */
export const STAGES: readonly Stage[] = [
  {
    id: 'open-strings',
    n: 1,
    title: 'Open strings and fret 12',
    blurb: 'The six notes you already have, and the fret where they come back.',
    asks: [{ kind: 'name', weight: 1 }],
    length: 10,
    scope: (ctx) => ({ strings: all(ctx), frets: [0, 12], notes: 'all', onlyFrets: [0, 12] }),
  },
  {
    id: 'string-6-naturals',
    n: 2,
    title: 'The low string',
    blurb: 'Natural notes on string 6: where every E-shape barre chord has its root.',
    asks: [
      { kind: 'name', weight: 0.55 },
      { kind: 'find', weight: 0.45 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: only(ctx, [6]), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'string-5-naturals',
    n: 3,
    title: 'String 5',
    blurb: 'Natural notes on string 5: the roots of A-shape barre chords.',
    asks: [
      { kind: 'name', weight: 0.55 },
      { kind: 'find', weight: 0.45 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: only(ctx, [5]), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'roots-6-and-5',
    n: 4,
    title: 'Barre chord roots',
    blurb: 'Strings 6 and 5 together: find a chord by finding its root.',
    asks: [
      { kind: 'find', weight: 0.6, flavor: 'barre-root' },
      { kind: 'name', weight: 0.4 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: only(ctx, [6, 5]), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'octaves-4-and-3',
    n: 5,
    title: 'Octave shapes to strings 4 and 3',
    blurb: 'Two strings up, two frets up: what you know on 6 and 5, carried across.',
    asks: [
      { kind: 'octave', weight: 0.6 },
      { kind: 'name', weight: 0.4 },
    ],
    options: { octavePairs: [[6, 4], [5, 3]] },
    length: 12,
    scope: (ctx) => ({ strings: only(ctx, [4, 3]), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'octaves-2-and-1',
    n: 6,
    title: 'Octave shapes to strings 2 and 1',
    blurb: 'Across the B string the shape stretches by a fret; string 1 mirrors string 6.',
    asks: [
      { kind: 'octave', weight: 0.6 },
      { kind: 'name', weight: 0.4 },
    ],
    options: { octavePairs: [[4, 2], [3, 1], [6, 1]] },
    length: 12,
    scope: (ctx) => ({ strings: only(ctx, [2, 1]), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'all-naturals',
    n: 7,
    title: 'Every natural note',
    blurb: 'All six strings, frets 0 to 12, naturals only.',
    asks: [
      { kind: 'name', weight: 0.4 },
      { kind: 'find', weight: 0.3 },
      { kind: 'find-any', weight: 0.15 },
      { kind: 'every', weight: 0.15 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: all(ctx), frets: [0, 12], notes: 'naturals' }),
  },
  {
    id: 'sharps-and-flats',
    n: 8,
    title: 'Sharps and flats',
    blurb: 'The frets in between: one fret up is sharp, one fret down is flat.',
    asks: [
      { kind: 'name', weight: 0.55 },
      { kind: 'find', weight: 0.45 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: all(ctx), frets: [0, 12], notes: 'accidentals' }),
  },
  {
    id: 'whole-neck',
    n: 9,
    title: 'The whole neck',
    blurb: 'Every note on every string, up to fret 12.',
    asks: [
      { kind: 'name', weight: 0.4 },
      { kind: 'find', weight: 0.3 },
      { kind: 'find-any', weight: 0.15 },
      { kind: 'every', weight: 0.15 },
    ],
    length: 12,
    scope: (ctx) => ({ strings: all(ctx), frets: [0, 12], notes: 'all' }),
  },
  {
    id: 'upper-neck',
    n: 10,
    title: 'Above fret 12',
    blurb: 'The neck starts again: add twelve to what you know.',
    asks: [
      { kind: 'name', weight: 0.5 },
      { kind: 'find', weight: 0.5 },
    ],
    length: 12,
    scope: (ctx, maxFret) => ({ strings: all(ctx), frets: [12, Math.min(24, Math.max(17, maxFret))], notes: 'all' }),
  },
];

/** Skill id of a step. */
export function stageSkillId(stage: Stage): string {
  return `fretboard:${stage.id}`;
}

/** A step by its route param. */
export function stageById(id: string | undefined): Stage | null {
  return STAGES.find((s) => s.id === id) ?? null;
}

/** True when neighbouring strings are tuned like a standard guitar (fourths, a major third from 3 to 2). */
export function hasStandardShapes(ctx: NeckContext): boolean {
  if (ctx.tuning.length !== 6) return false;
  const gaps = ctx.tuning.slice(1).map((m, i) => m - ctx.tuning[i]);
  return gaps.join(',') === '5,5,5,4,5';
}

/** "the A string", "the low E string": a string by its open note, as guitarists say it. */
export function stringName(ctx: NeckContext, s: number, fmt: NoteFormatter): string {
  const pc = stringOpenPc(ctx, s);
  const name = fmt(spell(pc, 'sharps'));
  const same: number[] = [];
  for (let i = 1; i <= ctx.tuning.length; i++) if (stringOpenPc(ctx, i) === pc) same.push(i);
  if (same.length > 1) return `the ${s === Math.max(...same) ? 'low' : s === Math.min(...same) ? 'high' : 'middle'} ${name} string`;
  return `the ${name} string`;
}

/** A note to draw in a step's picture. */
export interface LessonDot {
  pos: Pos;
  /** ASCII note name. */
  name: string;
  /** A landmark (drawn larger, with a halo). */
  anchor?: boolean;
  /** Drawn in the accent: the thing this step adds. */
  accent?: boolean;
}

/** What a step teaches before its round: a few sentences and one picture of the neck. */
export interface StageLesson {
  points: string[];
  frets: [number, number];
  dots: LessonDot[];
  /** Pairs joined by a line (octave shapes). */
  links: Array<[Pos, Pos]>;
}

function naturalRun(ctx: NeckContext, s: number, fmt: NoteFormatter): string {
  const scope: Scope = { strings: [s], frets: [0, 12], notes: 'naturals' };
  return scopePositions(scope, ctx)
    .map((p) => `${fmt(spell(pcAt(ctx, p), 'sharps'))} ${p.fret === 0 ? 'open' : p.fret}`)
    .join(', ');
}

function anchorsOn(ctx: NeckContext, s: number, fmt: NoteFormatter): string {
  const notes = inlayFretsIn(1, 11)
    .map((fret) => ({ fret, pc: pcAt(ctx, { string: s, fret }) }))
    .filter((a) => [0, 2, 4, 5, 7, 9, 11].includes(a.pc))
    .map((a) => `fret ${a.fret} is ${fmt(spell(a.pc, 'sharps'))}`);
  return notes.length ? `Use the dots as anchors: ${listWords(notes)}, and the double dot at 12 is ${fmt(spell(stringOpenPc(ctx, s), 'sharps'))} again.` : `The double dot at 12 is ${fmt(spell(stringOpenPc(ctx, s), 'sharps'))} again.`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function naturalDots(ctx: NeckContext, strings: number[], frets: [number, number]): LessonDot[] {
  const anchors = new Set([0, 12, ...inlayFretsIn(frets[0], frets[1])]);
  return scopePositions({ strings, frets, notes: 'naturals' }, ctx).map((p) => ({ pos: p, name: spell(pcAt(ctx, p), 'sharps'), anchor: anchors.has(p.fret) }));
}

/** Example of an octave shape: a natural note near the nut on `from`, and where it lands. */
function shapeExample(ctx: NeckContext, from: number, to: number): { a: Pos; b: Pos; text: string } | null {
  const shape = octaveShape(ctx, from, to);
  if (!shape) return null;
  // Prefer a start on a dot (3, 5, 7): the shape then links two landmarks.
  for (const fret of [3, 5, 7, 2, 1, 4, 6]) {
    const a = { string: from, fret };
    const b = { string: to, fret: fret + shape.shift };
    if (b.fret < 0 || ![0, 2, 4, 5, 7, 9, 11].includes(pcAt(ctx, a))) continue;
    if (pcOf(midiAtPos(ctx, b) - midiAtPos(ctx, a)) !== 0) continue;
    return { a, b, text: describeShape(shape) };
  }
  return null;
}

/** The lesson of a step, computed for the tuning. `fmt` writes note names in the reader's naming. */
export function stageLesson(stage: Stage, ctx: NeckContext, fmt: NoteFormatter, maxFret = 15): StageLesson {
  const standard = hasStandardShapes(ctx);
  const n = ctx.tuning.length;
  const name = (s: number) => stringName(ctx, s, fmt);
  const note = (p: Pos) => fmt(spell(pcAt(ctx, p), ctx.spelling === 'flats' ? 'flats' : 'sharps'));
  switch (stage.id) {
    case 'open-strings': {
      const opens = Array.from({ length: n }, (_, i) => fmt(spell(stringOpenPc(ctx, n - i), 'sharps')));
      const points = [`From the thickest string to the thinnest, the open strings are ${opens.join(' ')}.`];
      if (standard) points.push('A way to remember them: Eddie Ate Dynamite, Good Bye Eddie.');
      points.push(`Strings are numbered from the thinnest: string 1 is ${name(1)}, string ${n} is ${name(n)}.`);
      points.push('Fret 12, the double dot, sounds the same note one octave higher. From there the neck repeats itself.');
      const dots: LessonDot[] = [];
      for (let s = 1; s <= n; s++) for (const fret of [0, 12]) dots.push({ pos: { string: s, fret }, name: spell(pcAt(ctx, { string: s, fret }), 'sharps'), anchor: fret === 12 });
      return { points, frets: [0, 12], dots, links: [] };
    }
    case 'string-6-naturals':
    case 'string-5-naturals': {
      const s = stage.id === 'string-6-naturals' ? 6 : 5;
      const points = [
        'The natural notes are A B C D E F G, then A again. Most of them are two frets apart; B to C and E to F are only one fret apart.',
        `On ${name(s)}: ${naturalRun(ctx, s, fmt)}.`,
        anchorsOn(ctx, s, fmt),
      ];
      if (standard) {
        const shapeName = s === 6 ? 'E-shape' : 'A-shape';
        points.push(`Why it matters: ${name(s)} holds the root of every ${shapeName} barre chord. A barre at fret 3 gives you ${note({ string: s, fret: 3 })} major, at fret 5 ${note({ string: s, fret: 5 })} major.`);
      }
      return { points, frets: [0, 12], dots: naturalDots(ctx, [s], [0, 12]), links: [] };
    }
    case 'roots-6-and-5': {
      const points = standard
        ? [
            'A barre chord is one shape you slide up and down the neck. The E shape has its root on string 6, the A shape on string 5: find the root and you have found the chord.',
            `Learn them in pairs, fret by fret: at fret 3, string 6 is ${note({ string: 6, fret: 3 })} and string 5 is ${note({ string: 5, fret: 3 })}; at fret 5, ${note({ string: 6, fret: 5 })} and ${note({ string: 5, fret: 5 })}; at fret 7, ${note({ string: 6, fret: 7 })} and ${note({ string: 5, fret: 7 })}.`,
            'Some questions name a chord ("the root of a G barre chord, E shape"): tap its root on the string they name.',
          ]
        : [`Strings 6 and 5 together: ${name(6)} and ${name(5)}. Work each note out from the open string or a dot.`];
      return { points, frets: [0, 12], dots: naturalDots(ctx, only(ctx, [6, 5]), [0, 12]), links: [] };
    }
    case 'octaves-4-and-3':
    case 'octaves-2-and-1': {
      const pairs = stage.options?.octavePairs ?? [];
      const points: string[] = [];
      if (stage.id === 'octaves-4-and-3') points.push('An octave is the same note, higher up. Octave shapes carry what you know on strings 6 and 5 to the rest of the neck.');
      else if (standard) points.push(`Neighbouring strings are five frets apart, except ${name(3)} and ${name(2)}, which are four. So a shape that crosses ${name(2)} moves one fret further.`);
      const dots: LessonDot[] = [];
      const links: Array<[Pos, Pos]> = [];
      for (const [from, to] of pairs) {
        const ex = shapeExample(ctx, from, to);
        if (!ex) continue;
        const shape = octaveShape(ctx, from, to)!;
        const twice = shape.octaves === 2 ? ' (two octaves up)' : '';
        points.push(`String ${from} to string ${to}: ${ex.text}${twice}. ${note(ex.a)} at fret ${ex.a.fret} becomes ${note(ex.b)} at fret ${ex.b.fret}.`);
        dots.push({ pos: ex.a, name: spell(pcAt(ctx, ex.a), 'sharps'), anchor: true }, { pos: ex.b, name: spell(pcAt(ctx, ex.b), 'sharps'), accent: true });
        links.push([ex.a, ex.b]);
      }
      points.push('Fret the low note with your first finger. Two frets up, the octave falls under your third finger; three frets up, under your little finger.');
      return { points, frets: [0, 12], dots, links };
    }
    case 'all-naturals': {
      const cScope: Scope = { strings: all(ctx), frets: [0, 12], notes: 'all' };
      const cs = placesInScope(cScope, ctx, 0);
      return {
        points: [
          'Now every string at once. Work each note out from the nearest landmark: the open string, a dot, or the double dot at 12.',
          `A note lives in many places: between the nut and fret 12 there are ${cs.length} ${fmt('C')}s. The octave shapes link them.`,
          'Some questions ask for one string, some for anywhere, and some for every place a note sits.',
        ],
        frets: [0, 12],
        dots: cs.map((p) => ({ pos: p, name: 'C', accent: true })),
        links: [],
      };
    }
    case 'sharps-and-flats': {
      // A natural, a black-key note and the next natural, side by side on the lowest string.
      const low = Math.min(6, n);
      let f = { string: low, fret: 1 };
      for (let fret = 0; fret <= 9; fret++) {
        const nat = (x: number) => [0, 2, 4, 5, 7, 9, 11].includes(pcAt(ctx, { string: low, fret: x }));
        if (nat(fret) && !nat(fret + 1) && nat(fret + 2)) {
          f = { string: low, fret };
          break;
        }
      }
      const mid = { ...f, fret: f.fret + 1 };
      const points = [
        `A sharp (♯) is one fret above a natural note, a flat (♭) one fret below. So the fret between ${note(f)} and ${note({ ...f, fret: f.fret + 2 })} is both ${fmt(spell(pcAt(ctx, mid), 'sharps'))} and ${fmt(spell(pcAt(ctx, mid), 'flats'))}: one sound, two names.`,
        'There is no fret between B and C or between E and F, so those pairs have no sharp or flat in between.',
        ctx.spelling === 'both' ? 'You will see both names. Either answer is right: they are the same fret.' : `You spell them with ${ctx.spelling}. You can change that in Practice settings.`,
      ];
      const dots: LessonDot[] = [];
      for (const s of only(ctx, [6, 5])) {
        for (let fret = 0; fret <= 12; fret++) {
          const p = { string: s, fret };
          const pc = pcAt(ctx, p);
          const natural = [0, 2, 4, 5, 7, 9, 11].includes(pc);
          dots.push({ pos: p, name: spell(pc, ctx.spelling === 'flats' ? 'flats' : 'sharps'), accent: !natural });
        }
      }
      return { points, frets: [0, 12], dots, links: [] };
    }
    case 'whole-neck': {
      const s = Math.min(6, n);
      const dots: LessonDot[] = [];
      for (let fret = 0; fret <= 12; fret++) {
        const p = { string: s, fret };
        const pc = pcAt(ctx, p);
        dots.push({ pos: p, name: spell(pc, ctx.spelling === 'flats' ? 'flats' : 'sharps'), accent: ![0, 2, 4, 5, 7, 9, 11].includes(pc), anchor: [0, 12].includes(fret) });
      }
      return {
        points: [
          'Every note on every string, up to fret 12. Twelve notes, then the octave: the whole chromatic run fits between the nut and the double dot.',
          'The naturals are your landmarks now. A sharp or flat is always one fret from one of them.',
          'Go for speed as well as accuracy: a note you can name in under two seconds is a note you can use while playing.',
        ],
        frets: [0, 12],
        dots,
        links: [],
      };
    }
    case 'upper-neck': {
      const hi = Math.min(24, Math.max(17, maxFret));
      const s = Math.min(6, n);
      const dots: LessonDot[] = [];
      for (const fret of [12, 15, 17]) if (fret <= hi) dots.push({ pos: { string: s, fret }, name: spell(pcAt(ctx, { string: s, fret }), 'sharps'), anchor: true });
      return {
        points: [
          `Above the double dot the neck starts over, one octave higher: fret 15 is fret 3 again, fret 17 is fret 5. On ${name(s)} that is ${note({ string: s, fret: 15 })} and ${note({ string: s, fret: 17 })}.`,
          'Subtract twelve from the fret and you are back on ground you know.',
          `This step covers frets 12 to ${hi}.`,
        ],
        frets: [12, hi],
        dots,
        links: [],
      };
    }
    default:
      return { points: [stage.blurb], frets: [0, 12], dots: [], links: [] };
  }
}

/** A step's title for this guitar: "The low E string" rather than "The low string". */
export function stageTitle(stage: Stage, ctx: NeckContext, fmt: NoteFormatter): string {
  if (stage.id === 'string-6-naturals' || stage.id === 'string-5-naturals') {
    const s = stage.id === 'string-6-naturals' ? 6 : 5;
    if (s > ctx.tuning.length) return stage.title;
    const t = stringName(ctx, s, fmt);
    return t[0].toUpperCase() + t.slice(1);
  }
  return stage.title;
}
