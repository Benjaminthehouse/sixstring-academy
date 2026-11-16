/**
 * The generators the syllabus asked for, checked answer by answer against the engines over many
 * seeds and difficulties: every right answer is recomputed here from `@/core/theory` and
 * `@/core/guitar` (pitches from `midiAt`, shapes from `identifyFretted`, fret positions from
 * `fretDistance`), never read back from the generator's own helpers.
 */
import { describe, expect, it } from 'vitest';
import { chordVoicings, fretAtDistance, fretDistance, identifyFretted, midiAt } from '@/core/guitar';
import { chordPcs, getKey, keyFromSignature, parseChord, parseNote, parseTimeSignature, romanToChord, scalePcs } from '@/core/theory';
import { exerciseProblems } from '../check';
import { grade, solve } from '../grade';
import { parseRhythm } from '../rhythm';
import { plainText } from '../text';
import type { ChoiceExercise, Exercise, FretboardFigure, GeneratedStep, StaffFigure, TabFigure } from '../types';
import { generateStrict, generatorProblems } from './index';

const SEEDS = 120;
const runs = (step: GeneratedStep, n = SEEDS): Exercise[] => Array.from({ length: n }, (_u, seed) => generateStrict(step, { seed, difficulty: (seed % 5) / 4 }));
const tags = (t: string, tag: string): string[] => [...t.matchAll(new RegExp(`\\{${tag}:([^}|]+)\\}`, 'g'))].map((m) => m[1]);
const right = (e: Exercise): ChoiceExercise['options'][number] => {
  if (e.type !== 'choice' && e.type !== 'listen-choice') throw new Error(`not a choice: ${e.type}`);
  return e.options.find((o) => o.correct)!;
};
const pcs = (names: readonly string[]): number[] => names.map((n) => parseNote(n)!.chroma);
const samePcs = (a: string, b: string): boolean => [...chordPcs(a)].sort().join() === [...chordPcs(b)].sort().join() && parseNote(parseChord(a)!.root)!.chroma === parseNote(parseChord(b)!.root)!.chroma;
const sound = (tab: TabFigure): number[] => tab.notes.flatMap((n) => ('rest' in n ? [] : [midiAt(n)]));

function valid(e: Exercise, label: string): void {
  expect(exerciseProblems(e).filter((p) => p.severity === 'error'), `${label}\n${JSON.stringify(e)}`).toEqual([]);
  expect(grade(e, solve(e)).correct, label).toBe(true);
}

describe('tab-read and tab-play: the notes are the pitches of the tab', () => {
  const steps: GeneratedStep[] = [
    { generate: 'tab-read' },
    { generate: 'tab-read', params: { strings: [1, 2, 3, 4, 5, 6], frets: [0, 7], length: 8, naturals: false } },
    { generate: 'tab-read', params: { ask: 'note', strings: [3, 4, 5], frets: [2, 9], length: 6 } },
    { generate: 'tab-read', params: { ask: 'find', strings: [6, 5, 4], frets: [0, 12], naturals: false } },
  ];
  it('names every note, the Nth note, and finds its pitch on the neck', () => {
    for (const step of steps) {
      for (const e of runs(step)) {
        valid(e, JSON.stringify(step));
        const tab = e.figure as TabFigure;
        const midis = sound(tab);
        expect(midis.length).toBe((step.params as { length?: number })?.length ?? 4);
        // The bar fills one bar of 4/4.
        expect(parseRhythm({ pattern: tab.notes.map((n) => n.duration).join(' '), time: '4/4' }).problems).toEqual([]);
        if ((step.params as { naturals?: boolean } | undefined)?.naturals !== false) expect(midis.every((m) => [0, 2, 4, 5, 7, 9, 11].includes(m % 12))).toBe(true);
        const ask = (step.params as { ask?: string } | undefined)?.ask ?? 'notes';
        if (ask === 'notes') expect(pcs(tags(String(right(e).text), 'n'))).toEqual(midis.map((m) => m % 12));
        if (ask === 'note') {
          const n = Number(/the (\d)\w\w note/.exec(String((e as ChoiceExercise).prompt))![1]);
          expect(pcs(tags(String(right(e).text), 'n'))).toEqual([midis[n - 1] % 12]);
        }
        if (ask === 'find') {
          if (e.type !== 'fretboard-find' || !('note' in e.find)) throw new Error(e.type);
          const n = Number(/its (\d)\w\w note/.exec(String(e.prompt))![1]);
          expect(parseNote(e.find.note)!.midi).toBe(midis[n - 1]);
        }
      }
    }
  });

  it('tab-play asks for those pitches, and its fallback names the same bar', () => {
    for (const e of runs({ generate: 'tab-play', params: { strings: [1, 2, 3], frets: [0, 5], length: 6, naturals: false } })) {
      valid(e, 'tab-play');
      if (e.type !== 'play-phrase') throw new Error(e.type);
      const alt = e.alternative as ChoiceExercise;
      expect(sound(alt.figure as TabFigure)).toEqual(sound({ kind: 'tab', notes: e.notes }));
      expect(pcs(tags(String(right(alt).text), 'n'))).toEqual(sound({ kind: 'tab', notes: e.notes }).map((m) => m % 12));
    }
  });
});

describe('caged-shape: the picture is the shape it is named for, and plays the chord', () => {
  // The five open grips (and their minor forms), low string to high.
  const OPEN: Record<string, Array<number | null>> = {
    C: [null, 3, 2, 0, 1, 0], A: [null, 0, 2, 2, 2, 0], G: [3, 2, 0, 0, 0, 3], E: [0, 2, 2, 1, 0, 0], D: [null, null, 0, 2, 3, 2],
    Cm: [null, 3, 1, 0, 1, null], Am: [null, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], Dm: [null, null, 0, 2, 3, 1],
  };
  it('the dots are an open grip moved up, and identifyFretted names the right chord', () => {
    for (const step of [{ generate: 'caged-shape' }, { generate: 'caged-shape', params: { ask: 'chord', qualities: ['major', 'minor'] } }] as GeneratedStep[]) {
      for (const e of runs(step)) {
        valid(e, JSON.stringify(step));
        const figure = (e as ChoiceExercise).figure as FretboardFigure;
        const frets: Array<number | null> = [6, 5, 4, 3, 2, 1].map((s) => figure.dots!.find((d) => d.string === s)?.fret ?? null);
        const named = identifyFretted(frets).symbol!;
        const minor = parseChord(named)!.type.id === 'minor';
        const shape = /(\w) shape/.exec(plainText(String((e as ChoiceExercise).explain)))![1];
        const open = OPEN[`${shape}${minor ? 'm' : ''}`];
        const offset = Math.min(...frets.filter((f): f is number => f !== null)) - Math.min(...open.filter((f): f is number => f !== null));
        frets.forEach((f, i) => {
          if (f !== null) expect(open[i], `${shape} ${frets.join(',')}`).toBe(f - offset);
        });
        if ((step.params as { ask?: string } | undefined)?.ask === 'chord') expect(samePcs(tags(String(right(e).text), 'c')[0], named)).toBe(true);
        else expect(plainText(String(right(e).text))).toBe(`${shape} shape`);
      }
    }
  });
});

describe('capo-math: what sounds is what the guitar engine hears through the capo', () => {
  it('every answer matches identifyFretted of the open shape with the capo on', () => {
    for (const ask of ['sounds', 'shape', 'capo'] as const) {
      for (const e of runs({ generate: 'capo-math', params: { ask } })) {
        valid(e, ask);
        const p = plainText(String(e.type === 'type-answer' || e.type === 'choice' ? e.prompt : ''));
        const capo = ask === 'capo' ? (e.type === 'type-answer' && e.answer.kind === 'number' ? e.answer.value : -1) : Number(/fret (\d+)/.exec(p)![1]);
        const shape = ask === 'shape' ? tags(String(right(e).text), 'c')[0] : tags(String(e.type === 'choice' || e.type === 'type-answer' ? e.prompt : ''), 'c')[0];
        const target = ask === 'sounds' ? tags(String(right(e).text), 'c')[0] : tags(String(e.type === 'choice' || e.type === 'type-answer' ? e.prompt : ''), 'c')[ask === 'shape' ? 0 : 1];
        const heard = identifyFretted(chordVoicings(shape)[0].frets, { capo }).symbol!;
        expect(samePcs(heard, target), `${shape} capo ${capo}: ${heard} vs ${target}`).toBe(true);
      }
    }
  });
});

describe('nashville: numbers are roman numerals by another name', () => {
  const ROMAN: Record<string, string> = { '1': 'I', '2m': 'ii', '3m': 'iii', '4': 'IV', '5': 'V', '6m': 'vi', '7°': 'vii°', b7: 'bVII', '2': 'II', '57': 'V7', '1maj7': 'Imaj7', '2m7': 'ii7' };
  const numberOf = (t: string): string => plainText(t).replace('♭', 'b');
  it('to-chord, to-number and charts agree with romanToChord', () => {
    const numbers = Object.keys(ROMAN);
    for (const ask of ['to-chord', 'to-number', 'chart'] as const) {
      for (const e of runs({ generate: 'nashville', params: { ask, numbers, keys: ['C major', 'G major', 'D major', 'A major', 'E major', 'F major', 'Bb major', 'Eb major'] } })) {
        valid(e, ask);
        const key = tags(String((e as ChoiceExercise).prompt), 'k')[0];
        if (ask === 'chart') {
          const chart = /reads (.+)\. Which/.exec(plainText(String((e as ChoiceExercise).prompt)))![1].split(' ').map((n) => n.replace('♭', 'b'));
          const chords = tags(String(right(e).text), 'c');
          chart.forEach((n, i) => expect(samePcs(chords[i], romanToChord(ROMAN[n], key)), `${n} in ${key}`).toBe(true));
        } else if (ask === 'to-chord') {
          const n = numberOf(/which chord is (.+)\?$/.exec(String((e as ChoiceExercise).prompt))![1]);
          expect(samePcs(tags(String(right(e).text), 'c')[0], romanToChord(ROMAN[n], key))).toBe(true);
        } else {
          const chord = tags(String((e as ChoiceExercise).prompt), 'c')[0];
          expect(samePcs(chord, romanToChord(ROMAN[numberOf(String(right(e).text))], key))).toBe(true);
        }
      }
    }
  });
});

describe('rhythm-read: triplets and compound bars are full and counted where their notes start', () => {
  const EIGHTH = 480;
  it('every bar parses in its meter, and the counts are the onsets', () => {
    for (const ask of ['tap', 'count', 'ear'] as const) {
      for (const e of runs({ generate: 'rhythm-read', params: { ask, feels: ['triplets', '6/8', '9/8', '12/8'], rests: true } })) {
        valid(e, ask);
        const spec = e.type === 'tap-rhythm' ? e.rhythm : e.type === 'listen-choice' && e.sound.kind === 'rhythm' ? { pattern: e.sound.pattern, time: e.sound.time } : (e.figure as { pattern: string; time: string });
        const parsed = parseRhythm(spec);
        expect(parsed.problems).toEqual([]);
        const ts = parseTimeSignature(spec.time ?? '4/4')!;
        if (ts.text === '4/4') expect(spec.pattern).toMatch(/et/);
        else expect(ts.kind).toBe('compound');
        if (ask === 'count') {
          const said = plainText(String(right(e).text)).split(' ');
          const expected = parsed.onsets.map((tick) => {
            if (ts.kind === 'compound') return String(tick / EIGHTH + 1);
            const beat = Math.floor(tick / 960) + 1;
            const within = tick % 960;
            return within === 0 ? String(beat) : within === 480 ? '&' : within === 320 ? 'trip' : 'let';
          });
          expect(said).toEqual(expected);
        }
      }
    }
  });
});

describe('staff-key: the staff shows the key named', () => {
  it('names, picks and reads with the signature the theory engine gives', () => {
    for (const ask of ['name', 'pick', 'read'] as const) {
      for (const e of runs({ generate: 'staff-key', params: { ask, modes: ['major', 'minor'], maxAccidentals: 7 } })) {
        valid(e, ask);
        if (ask === 'name') {
          const shown = getKey(((e as ChoiceExercise).figure as StaffFigure).key!)!;
          const answer = getKey(tags(String(right(e).text), 'k')[0])!;
          expect(answer.name).toBe(keyFromSignature(shown.fifths, answer.mode).name);
          expect(/major|minor/.exec(String((e as ChoiceExercise).prompt))![0]).toBe(answer.mode);
        } else if (ask === 'pick') {
          const named = getKey(tags(String((e as ChoiceExercise).prompt), 'k')[0])!;
          expect(getKey((right(e).figure as StaffFigure).key!)!.fifths).toBe(named.fifths);
        } else {
          if (e.type !== 'staff-read') throw new Error(e.type);
          const key = getKey(e.key!)!;
          const n = parseNote(e.note)!;
          // The note is in the key, and its accidental is the one the signature gives its letter.
          expect(scalePcs(key.tonic, key.mode === 'minor' ? 'minor' : 'major')).toContain(n.chroma);
          const fromSignature = key.signature.accidentals.find((a) => a[0] === n.letter);
          expect(n.alt).toBe(fromSignature ? parseNote(fromSignature)!.alt : 0);
        }
      }
    }
  });
});

describe('natural-harmonic: the note is the overtone of the node over that fret', () => {
  it('fretDistance puts the fret on a node of the string, and the note is that many times the open pitch', () => {
    for (const ask of ['note', 'fret'] as const) {
      for (const e of runs({ generate: 'natural-harmonic', params: { ask, frets: [12, 7, 5, 19, 4, 9, 16] } }, 300)) {
        valid(e, ask);
        const string = Number(/string (\d)/.exec(String((e as ChoiceExercise).prompt))![1]);
        const open = midiAt({ string, fret: 0 });
        const note = ask === 'note' ? tags(String(right(e).text), 'n')[0] : tags(String((e as ChoiceExercise).prompt), 'n')[0];
        const ratio = 2 ** ((parseNote(note)!.midi! - open) / 12);
        const parts = Math.round(ratio);
        // Within a sixth of a half step of a whole-number multiple (the fifth harmonic is 14 cents flat of a tempered note).
        expect(Math.abs(1200 * Math.log2(ratio / parts))).toBeLessThan(16);
        const frets = ask === 'fret' && e.type === 'type-answer' && e.answer.kind === 'number' ? [e.answer.value, ...(e.answer.accept ?? [])] : [Number(/over fret (\d+)/.exec(String((e as ChoiceExercise).prompt))![1])];
        // A node sits at k/parts of the string; the fret named is the one nearest it (the 4th-fret node is at 3.86).
        for (const fret of frets) {
          const nodes = Array.from({ length: parts - 1 }, (_u, k) => fretAtDistance((k + 1) / parts));
          expect(Math.min(...nodes.map((n) => Math.abs(n - fret))), `fret ${fret} is a node of ${parts} parts (${nodes.map((n) => n.toFixed(2)).join(', ')})`).toBeLessThan(0.2);
          expect(fretDistance(fret)).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('sight-reading: a passage in one key, in reach of one hand position', () => {
  const window = (position: number): [number, number] => (position <= 1 ? [0, 4] : [position, position + 3]);
  it('every note is in the key and playable in the position; the tab plays exactly the staff', () => {
    const steps: GeneratedStep[] = [
      { generate: 'sight-reading' },
      { generate: 'sight-reading', params: { ask: 'tab', positions: [1, 2, 5, 7], keys: ['C major', 'G major', 'D major', 'F major', 'A minor', 'E minor'], values: ['quarter', 'eighth', 'half'] } },
      { generate: 'sight-reading', params: { positions: [7, 9, 12], keys: ['G major', 'E minor', 'Bb major'], bars: 1 } },
    ];
    for (const step of steps) {
      const positions = (step.params as { positions?: number[] } | undefined)?.positions ?? [1];
      for (const e of runs(step)) {
        valid(e, JSON.stringify(step));
        const staff = (e as ChoiceExercise).figure as StaffFigure;
        const key = getKey(staff.key!)!;
        const scale = scalePcs(key.tonic, key.mode === 'minor' ? 'minor' : 'major');
        const midis = staff.notes.map((n) => parseNote(typeof n === 'string' ? n : n.note)!.midi!);
        expect(midis.every((m) => scale.includes(m % 12))).toBe(true);
        // Starts and ends on the key note.
        expect(midis[0] % 12).toBe(parseNote(key.tonic)!.chroma);
        expect(midis[midis.length - 1] % 12).toBe(parseNote(key.tonic)!.chroma);
        expect(midis.length).toBeLessThanOrEqual(12);
        // Some position in the pool reaches every note.
        const reach = (position: number): boolean => {
          const [lo, hi] = window(position);
          return midis.every((m) => [1, 2, 3, 4, 5, 6].some((s) => m - midiAt({ string: s, fret: 0 }) >= lo && m - midiAt({ string: s, fret: 0 }) <= hi));
        };
        expect(positions.some(reach)).toBe(true);
        if (e.type === 'choice' && right(e).figure) {
          const tab = right(e).figure as TabFigure;
          expect(sound(tab)).toEqual(midis);
          const position = Number(/in (\d+)\w\w position/.exec(String(e.prompt))?.[1] ?? 1);
          const [lo, hi] = window(position);
          for (const n of tab.notes) if (!('rest' in n)) expect(n.fret >= lo && n.fret <= hi, `${n.string}:${n.fret} in ${lo}-${hi}`).toBe(true);
          for (const o of e.options.filter((x) => !x.correct)) expect(sound(o.figure as TabFigure)).not.toEqual(midis);
        } else {
          const names = tags(String(right(e).text), 'n');
          expect(pcs(names)).toEqual(midis.map((m) => m % 12));
        }
      }
    }
  });

  it('sight-play shows only the staff, spells in the key, and asks for the very pitches of the passage', () => {
    for (const e of runs({ generate: 'sight-play', params: { positions: [1, 5, 7], keys: ['G major', 'F major', 'E minor'], bars: 2 } })) {
      valid(e, 'sight-play');
      if (e.type !== 'play-phrase') throw new Error(e.type);
      expect(e.staffOnly).toBe(true);
      const key = getKey(e.key!)!;
      const midis = sound({ kind: 'tab', notes: e.notes });
      expect(midis.every((m) => scalePcs(key.tonic, key.mode === 'minor' ? 'minor' : 'major').includes(m % 12))).toBe(true);
      const position = Number(/in (\d+)\w\w position/.exec(String(e.prompt))?.[1] ?? 1);
      const [lo, hi] = window(position);
      expect(e.notes.every((n) => 'rest' in n || (n.fret >= lo && n.fret <= hi))).toBe(true);
      // The fallback is the same passage, named.
      const alt = e.alternative as ChoiceExercise;
      expect(pcs(tags(String(right(alt).text), 'n'))).toEqual(midis.map((m) => m % 12));
      expect(((alt.figure as StaffFigure).notes).map((n) => parseNote(typeof n === 'string' ? n : n.note)!.midi)).toEqual(midis);
    }
  });

  it('refuses a position where the key has too few notes', () => {
    expect(generatorProblems({ generate: 'sight-reading', params: { positions: [13] } })[0]).toMatch(/"positions"/);
    expect(generatorProblems({ generate: 'sight-reading', params: { values: ['eighth'] } })[0]).toMatch(/must include quarter/);
    expect(generatorProblems({ generate: 'sight-reading', params: { keys: ['A dorian'] } })[0]).toMatch(/"A dorian"/);
  });
});
