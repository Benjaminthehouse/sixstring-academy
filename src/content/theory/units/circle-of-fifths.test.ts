/**
 * Unit 15 of the Theory Path, cross-checked against the engines: every key signature, count and
 * order the text quotes, the rules for naming keys, the circle's order and enharmonic pairs, the
 * neighbour keys and their I-IV-V chords, the frets on each figure and what each sound plays.
 */
import { describe, expect, it } from 'vitest';
import {
  MAJOR_KEYS, circleOfFifths, getKey, intervalBetween, keySignature, neighborKeys, parseNote, progressionToChords, scalePcs, staffPosition, transpose,
} from '@/core/theory';
import { midiAt } from '@/core/guitar';
import {
  findTargets, formatProblems, plainText, soundPlan, validateCourse, type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise,
  type Figure, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise, type OrderExercise, type StaffReadExercise,
  type Step, type TrueFalseExercise, type TypeAnswerExercise,
} from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './circle-of-fifths';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const isExercise = (s: Step): s is Exercise => !('generate' in s) && s.type !== 'card';
const isCard = (s: Step): s is CardStep => !('generate' in s) && s.type === 'card';
/** The figures of a lesson's cards that have the given kind, in order. */
function cardFigures<K extends Figure['kind']>(l: string, kind: K): Array<Extract<Figure, { kind: K }>> {
  return lesson(l).steps.filter(isCard).flatMap((c) => (c.figure && c.figure.kind === kind ? [c.figure as Extract<Figure, { kind: K }>] : []));
}
/** Every literal exercise of a lesson: its steps and its facts' asks. */
const exercisesOf = (l: Lesson): Exercise[] => [
  ...l.steps.filter(isExercise),
  ...(l.facts ?? []).map((f) => f.ask).filter((a): a is Exercise => !!a && !('generate' in a)),
];
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(isExercise);
const all = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const prompt = (e: Exercise): string => plainText('prompt' in e && e.prompt ? e.prompt : 'statement' in e ? e.statement : '');
function find<T extends Exercise>(list: Exercise[], type: T['type'], text: string): T {
  const hit = list.find((e) => e.type === type && prompt(e).includes(text));
  if (!hit) throw new Error(`no ${type} exercise with "${text}"`);
  return hit as T;
}
const right = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
/** The tonic of a key written as a {k:...} tag: "{k:Eb major}" -> "Eb". */
const keyOfTag = (tag: string): string => /\{k:([A-G][#b]?) (major|minor)\}/.exec(tag)![1];
const major = (tonic: string) => getKey(`${tonic} major`)!;
/** Sharps (positive) or flats (negative) of a major key. */
const fifths = (tonic: string): number => major(tonic).fifths;

describe('circle-of-fifths: the unit on its own', () => {
  it('passes the lesson validator with no problems', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('still asks at least four questions per lesson with Sound off (no listening, tapping along or ear drills)', () => {
    const heard = new Set(['listen-choice', 'tap-rhythm']);
    const earDrills = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);
    for (const l of unit.lessons) {
      const quiet = l.steps.filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : s.type !== 'card' && !heard.has(s.type)));
      expect(quiet.length, l.id).toBeGreaterThanOrEqual(4);
    }
    const quietCheckpoint = (unit.checkpoint?.steps ?? []).filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : !heard.has(s.type)));
    expect(quietCheckpoint.length).toBeGreaterThanOrEqual(6);
  });

  it('starts every fact id with the unit word "circle"', () => {
    for (const f of unit.lessons.flatMap((l) => l.facts ?? [])) expect(f.id).toMatch(/^circle-/);
  });
});

describe('circle-of-fifths: key signatures as the engine has them', () => {
  it('orders sharps F C G D A E B and flats B E A D G C F, each a fifth from the last', () => {
    expect(keySignature(7).accidentals).toEqual(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']);
    expect(keySignature(-7).accidentals).toEqual(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']);
    const letters = (a: string[]) => a.map((n) => n[0]);
    expect(letters(keySignature(-7).accidentals)).toEqual([...letters(keySignature(7).accidentals)].reverse());
    const sharps = keySignature(7).accidentals;
    for (let i = 1; i < 7; i++) expect(transpose(sharps[i - 1], 'P5')).toBe(sharps[i]);
    const flats = keySignature(-7).accidentals;
    for (let i = 1; i < 7; i++) expect(transpose(flats[i - 1], '-P5')).toBe(flats[i]);
  });

  it('gives every major key the count the lessons quote', () => {
    const quoted: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
    for (const [tonic, n] of Object.entries(quoted)) expect(fifths(tonic), tonic).toBe(n);
    const back = (id: string) => plainText(unit.lessons.flatMap((l) => l.facts ?? []).find((f) => f.id === id)!.back);
    expect(back('circle-sharp-counts')).toBe('G major 1, D major 2, A major 3, E major 4, B major 5, F♯ major 6 and C♯ major 7.');
    expect(back('circle-flat-counts')).toBe('F major 1, B♭ major 2, E♭ major 3, A♭ major 4, D♭ major 5, G♭ major 6 and C♭ major 7.');
  });

  it('matches every "key -> number of sharps or flats" pair with the engine', () => {
    let checked = 0;
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs')) {
      for (const p of e.pairs) {
        const m = /^(\d) (sharp|flat)s?$/.exec(plainText(p.right));
        if (!m || !/^\{k:/.test(String(p.left))) continue;
        expect(fifths(keyOfTag(String(p.left))), String(p.left)).toBe(Number(m[1]) * (m[2] === 'sharp' ? 1 : -1));
        checked++;
      }
    }
    expect(checked).toBe(16);
  });

  it('spells the sharp and flat keys a fifth apart, as the blanks and orders say', () => {
    const up = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
    for (let i = 1; i < up.length; i++) {
      expect(transpose(up[i - 1], 'P5')).toBe(up[i]);
      expect(fifths(up[i])).toBe(i);
    }
    const down = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
    for (let i = 1; i < down.length; i++) {
      expect(transpose(down[i - 1], '-P5')).toBe(down[i]);
      expect(fifths(down[i])).toBe(-i);
    }
    expect(find<FillBlanksExercise>(exercisesOf(lesson('sharp-keys')), 'fill-blanks', 'sharp keys').blanks).toEqual(['{n:A}', '{n:B}']);
    expect(find<FillBlanksExercise>(exercisesOf(lesson('flat-keys')), 'fill-blanks', 'flat keys').blanks).toEqual(['{n:Eb}', '{n:Db}']);
    const tiles = (l: string, text: string) => find<OrderExercise>(exercisesOf(lesson(l)), 'order', text).tiles.map((t) => String(t).slice(3, -1));
    expect(tiles('sharp-keys', 'sharps in the order')).toEqual(keySignature(4).accidentals);
    expect(tiles('flat-keys', 'flats in the order')).toEqual(keySignature(-4).accidentals);
    expect(tiles('sharp-keys', 'sharp keys in order')).toEqual(up.slice(1, 6));
    expect(tiles('flat-keys', 'flat keys in order')).toEqual(down.slice(1, 6));
    expect(tiles('the-circle', 'clockwise from')).toEqual(up.slice(1, 5));
  });
});

describe('circle-of-fifths: naming keys from signatures', () => {
  it('makes the last sharp degree 7, a half step below the tonic, in every sharp key', () => {
    for (const k of MAJOR_KEYS.filter((x) => x.fifths > 0)) {
      const last = k.signature.accidentals[k.signature.accidentals.length - 1];
      expect(k.scale[6], k.name).toBe(last);
      expect(transpose(last, 'm2'), k.name).toBe(k.tonic);
    }
  });

  it('makes the second-to-last flat the tonic from two flats on; one flat is F', () => {
    for (const k of MAJOR_KEYS.filter((x) => x.fifths < -1)) {
      const acc = k.signature.accidentals;
      expect(acc[acc.length - 2], k.name).toBe(k.tonic);
    }
    expect(major('F').signature.accidentals).toEqual(['Bb']);
    // "Every flat major key except F has a flat in its name."
    for (const k of MAJOR_KEYS.filter((x) => x.fifths < 0)) expect(parseNote(k.tonic)!.alt === -1, k.name).toBe(k.tonic !== 'F');
  });

  it('answers each naming question as the engine does', () => {
    const sharp = exercisesOf(lesson('naming-sharp-keys'));
    expect(right(find<ChoiceExercise>(sharp, 'choice', 'two sharps'))).toBe('D major');
    expect(fifths('D')).toBe(2);
    expect(find<TypeAnswerExercise>(sharp, 'type-answer', 'Five sharps').answer.value).toBe('B');
    expect(major('B').signature.accidentals).toEqual(['F#', 'C#', 'G#', 'D#', 'A#']);
    expect(find<TrueFalseExercise>(sharp, 'true-false', 'four sharps').answer).toBe(true);
    expect(major('E').signature.accidentals).toEqual(['F#', 'C#', 'G#', 'D#']);
    expect(right(find<ChoiceExercise>(sharp, 'choice', 'last sharp of a key signature is A♯'))).toBe('B major');
    expect(right(find<ChoiceExercise>(sharp, 'choice', 'Ends'))).toBe('E♯');
    expect(keySignature(6).accidentals[5]).toBe('E#');
    for (const p of find<MatchPairsExercise>(sharp, 'match-pairs', 'last sharp').pairs) {
      expect(major(keyOfTag(String(p.right))).signature.accidentals.at(-1), String(p.right)).toBe(String(p.left).slice(3, -1));
    }
    const flat = exercisesOf(lesson('naming-flat-keys'));
    expect(right(find<ChoiceExercise>(flat, 'choice', 'Four flats'))).toBe('A♭ major');
    expect(fifths('Ab')).toBe(-4);
    expect(find<TypeAnswerExercise>(flat, 'type-answer', 'two flats').answer.value).toBe('Bb');
    expect(fifths('Bb')).toBe(-2);
    expect(find<TrueFalseExercise>(flat, 'true-false', 'One flat').answer).toBe(false);
    expect(right(find<ChoiceExercise>(flat, 'choice', 'Five flats'))).toBe('D♭ major');
    expect(fifths('Db')).toBe(-5);
    expect(right(find<ChoiceExercise>(flat, 'choice', 'no flat in its name'))).toBe('F major');
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'three sharps'))).toBe('A major');
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'five flats'))).toBe('D♭ major');
    expect(find<TypeAnswerExercise>(checkpoint(), 'type-answer', 'six sharps').answer.value).toBe('F#');
    expect(fifths('F#')).toBe(6);
    expect(find<TrueFalseExercise>(checkpoint(), 'true-false', 'One flat').answer).toBe(true);
  });

  it('counts the sharps and flats the choices ask about', () => {
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('sharp-keys')), 'choice', 'How many sharps does E major'))).toBe('4');
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('flat-keys')), 'choice', 'How many flats does E♭ major'))).toBe('3');
    expect(major('Eb').signature.accidentals).toEqual(['Bb', 'Eb', 'Ab']);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('key-signatures')), 'choice', 'C major'))).toBe('None');
    expect(find<TypeAnswerExercise>(exercisesOf(lesson('key-signatures')), 'type-answer', 'C major').answer.value).toBe(0);
    expect(fifths('C')).toBe(0);
    const staffs = find<ChoiceExercise>(exercisesOf(lesson('sharp-keys')), 'choice', 'key signature of D major');
    const keys = staffs.options.map((o) => (o.figure?.kind === 'staff' ? o.figure.key! : ''));
    expect(keys[staffs.options.findIndex((o) => o.correct)]).toBe('D major');
    expect(keys.map((k) => getKey(k)!.fifths)).toEqual([2, 3, 1]);
  });
});

describe('circle-of-fifths: the staff and the neck', () => {
  it('reads the F in G major as F sharp and the B in F major as B flat', () => {
    const [f, b] = exercisesOf(lesson('key-signatures')).filter((e): e is StaffReadExercise => e.type === 'staff-read');
    expect(f.note).toBe('F#3');
    expect(staffPosition('F#3').position).toBe(1); // the bottom space
    expect(getKey(f.key!)!.signature.accidentals).toEqual(['F#']);
    expect(midiAt({ string: 4, fret: 4 })).toBe(parseNote('F#3')!.midi); // "string 4, fret 4"
    expect(b.note).toBe('Bb3');
    expect(staffPosition('Bb3').position).toBe(4); // the middle line
    expect(getKey(b.key!)!.signature.accidentals).toEqual(['Bb']);
    expect(midiAt({ string: 3, fret: 3 })).toBe(parseNote('Bb3')!.midi); // "string 3, fret 3"
  });

  it('plays the staff melody of the first card, with its Fs at string 1 fret 2 and string 4 fret 4', () => {
    const [staff] = cardFigures('key-signatures', 'staff');
    const written = staff.notes.map((n) => parseNote(typeof n === 'string' ? n : n.note)!.midi!);
    const [audio] = cardFigures('key-signatures', 'audio');
    const played = soundPlan(audio.sound).events.flatMap((e) => e.midi);
    expect(played).toEqual(written);
    expect(written.filter((m) => m % 12 === 6)).toEqual([midiAt({ string: 1, fret: 2 }), midiAt({ string: 4, fret: 4 })]);
    expect(staffPosition('F#4').position).toBe(8); // the top line, where the signature's sharp sits
  });

  it('finds every F sharp up to fret 4 where the explanation says', () => {
    const e = find<FretboardFindExercise>(exercisesOf(lesson('key-signatures')), 'fretboard-find', 'every');
    expect(findTargets(e).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['1:2', '4:4', '6:2']);
  });

  it('climbs the sharp keys in fifths and the flat keys in fourths', () => {
    const dots = (l: string): number[] => cardFigures(l, 'fretboard')[0].dots!.map((d) => midiAt(d));
    const sharp = dots('sharp-keys');
    expect(sharp.slice(1).map((m, i) => m - sharp[i])).toEqual([7, 7, 7]);
    const flat = dots('flat-keys');
    expect(flat.slice(1).map((m, i) => m - flat[i])).toEqual([5, 5, 5]);
    expect(transpose('F', 'P4')).toBe(transpose('F', '-P5')); // a fourth up, a fifth down: the same letter
    const shape = dots('the-circle');
    expect(shape).toEqual([midiAt({ string: 6, fret: 3 }), midiAt({ string: 5, fret: 5 }), midiAt({ string: 4, fret: 7 })]);
    expect(shape.slice(1).map((m, i) => m - shape[i])).toEqual([7, 7]);
  });

  it('puts each tonic the fretboard questions ask for at the fret the explanation names', () => {
    const one = (l: string, text: string) => findTargets(find<FretboardFindExercise>(exercisesOf(lesson(l)), 'fretboard-find', text)).map((p) => `${p.string}:${p.fret}`);
    expect(one('sharp-keys', 'next sharp key')).toEqual(['5:5']);
    expect(one('naming-sharp-keys', 'Three sharps')).toEqual(['6:5']);
    expect(midiAt({ string: 6, fret: 4 }) % 12).toBe(parseNote('G#')!.chroma);
    expect(one('flat-keys', 'next flat key')).toEqual(['4:1']);
    expect(midiAt({ string: 5, fret: 1 }) % 12).toBe(parseNote('Bb')!.chroma);
    expect(one('the-circle', 'next key clockwise')).toEqual(['4:7']);
    expect(midiAt({ string: 5, fret: 6 }) % 12).toBe(parseNote('D#')!.chroma);
    expect(midiAt({ string: 5, fret: 7 }) % 12).toBe(parseNote('E')!.chroma);
  });
});

describe('circle-of-fifths: the circle and its neighbours', () => {
  it('runs clockwise C G D A E B F# Db Ab Eb Bb F, with three doubled slots', () => {
    const slots = circleOfFifths();
    expect(slots.map((s) => s.major[0].tonic)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']);
    expect(slots.filter((s) => s.major.length === 2).map((s) => s.major.map((k) => k.tonic).sort().join('/'))).toEqual(['B/Cb', 'F#/Gb', 'C#/Db']);
    const same = (a: string, b: string) => expect([...scalePcs(a, 'major')].sort(), `${a}/${b}`).toEqual([...scalePcs(b, 'major')].sort());
    same('B', 'Cb');
    same('F#', 'Gb');
    same('C#', 'Db');
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('sounds the same'))) {
      for (const p of e.pairs) same(keyOfTag(String(p.left)), keyOfTag(String(p.right)));
    }
  });

  it('steps clockwise a fifth up and anticlockwise a fifth down', () => {
    const circle = exercisesOf(lesson('the-circle'));
    expect(right(find<ChoiceExercise>(circle, 'choice', 'clockwise from E♭'))).toBe('B♭ major');
    expect(neighborKeys('Eb major').dominant.tonic).toBe('Bb');
    expect(neighborKeys('Eb major').subdominant.tonic).toBe('Ab');
    expect(neighborKeys(neighborKeys('Eb major').dominant).dominant.tonic).toBe('F'); // F is two steps clockwise
    expect(right(find<ChoiceExercise>(circle, 'choice', 'anticlockwise from D major'))).toBe('It loses a sharp');
    expect(neighborKeys('D major').subdominant.fifths).toBe(1);
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'anticlockwise from A major'))).toBe('D major');
  });

  it('counts how many notes two keys differ by, as the questions claim', () => {
    const differ = (a: string, b: string) => {
      const x = new Set(scalePcs(a, 'major'));
      return scalePcs(b, 'major').filter((pc) => !x.has(pc)).length;
    };
    expect(differ('C', 'G')).toBe(1);
    expect(differ('D', 'A')).toBe(1);
    expect(differ('D', 'Bb')).toBe(4);
    expect(differ('D', 'E')).toBe(2);
    expect(differ('F', 'C')).toBe(1);
    expect(differ('F', 'G')).toBe(2);
    expect(differ('F', 'D')).toBe(3);
    expect(differ('F', 'Eb')).toBe(2);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('neighbour-keys')), 'choice', 'differs from D major'))).toBe('A major');
    expect(right(find<ChoiceExercise>(checkpoint(), 'choice', 'differs from F major'))).toBe('C major');
    expect(major('G').scale.filter((n) => !major('C').scale.includes(n))).toEqual(['F#']);
    expect(major('A').scale.filter((n) => !major('D').scale.includes(n))).toEqual(['G#']);
  });

  it('measures every "N steps clockwise / anticlockwise / away" claim of a wrong option on the real circle', () => {
    // Slot of each tonic on the circle (the enharmonic names share a slot).
    const slot = (tonic: string): number => circleOfFifths().findIndex((s) => s.major.some((k) => k.tonic === tonic));
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    let checked = 0;
    for (const e of all().filter((x): x is ChoiceExercise => x.type === 'choice')) {
      const ref = /\{k:([A-G][#b]?) major\}/.exec(String(e.prompt));
      if (!ref) continue;
      for (const o of e.options) {
        const why = String(o.why ?? '');
        const own = /^\{k:([A-G][#b]?) major\}$/.exec(String(o.text ?? ''));
        if (!own) continue;
        const clockwise = (slot(own[1]) - slot(ref[1]) + 12) % 12;
        const m = /\b(one|two|three|four|five|six) steps? (clockwise|anticlockwise|away)\b/.exec(why);
        if (m) {
          const n = words[m[1]];
          if (m[2] === 'clockwise') expect(clockwise, why).toBe(n);
          else if (m[2] === 'anticlockwise') expect(12 - clockwise, why).toBe(n);
          else expect(Math.min(clockwise, 12 - clockwise), why).toBe(n);
          checked++;
        }
        // "Right across the circle" is the key six steps away, and nothing else.
        if (/across the circle/.test(why)) expect(clockwise, why).toBe(6);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(9);
    // The fixed case: E major is five steps from E flat major; the key across from E flat is A.
    expect(slot('E') - slot('Eb') + 12).toBe(7);
    expect(circleOfFifths()[(slot('Eb') + 6) % 12].major[0].tonic).toBe('A');
  });

  it('names the dominant key on degree 5 and the subdominant key on degree 4', () => {
    for (const k of ['C', 'G', 'D', 'A', 'F', 'Bb']) {
      expect(neighborKeys(`${k} major`).dominant.tonic).toBe(major(k).scale[4]);
      expect(neighborKeys(`${k} major`).subdominant.tonic).toBe(major(k).scale[3]);
    }
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('neighbour-keys')), 'choice', 'subdominant key of G major'))).toBe('C major');
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('neighbour-keys')), 'choice', 'dominant key of A major'))).toBe('E major');
  });

  it('pairs every key with its own I, IV and V chords, and draws the chord shapes it names', () => {
    let checked = 0;
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('I, IV and V'))) {
      for (const p of e.pairs) {
        const chords = [...String(p.right).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]);
        expect(chords, String(p.left)).toEqual(progressionToChords('I IV V', `${keyOfTag(String(p.left))} major`));
        checked++;
      }
    }
    expect(checked).toBe(6);
    // G 320003 sounds only G, B and D; the small F xx3211 sounds F A C F.
    expect([3, 2, 0, 0, 0, 3].map((f, i) => midiAt({ string: 6 - i, fret: f }) % 12).every((pc) => [7, 11, 2].includes(pc))).toBe(true);
    expect([3, 2, 1, 1].map((f, i) => midiAt({ string: 4 - i, fret: f }) % 12)).toEqual([5, 9, 0, 5]);
  });

  it('plays the neighbour phrase first with F (C major), then with F sharp (G major), ending on G', () => {
    const q = lesson('neighbour-keys').steps.filter(isExercise).find((s): s is ListenChoiceExercise => s.type === 'listen-choice')!;
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes).toHaveLength(16);
    const [first, second] = [notes.slice(0, 8), notes.slice(8)];
    expect(first.filter((m, i) => m !== second[i])).toEqual([parseNote('F4')!.midi]);
    expect(second.filter((m, i) => m !== first[i])).toEqual([parseNote('F#4')!.midi]);
    expect(first.every((m) => scalePcs('C', 'major').includes(m % 12))).toBe(true);
    expect(second.every((m) => scalePcs('G', 'major').includes(m % 12))).toBe(true);
    expect(second.at(-1)).toBe(parseNote('G4')!.midi);
    expect(intervalBetween('F#4', 'G4')).toBe('m2');
    expect(right(q)).toBe('The second time');
  });
});
