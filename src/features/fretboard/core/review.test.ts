/**
 * An independent check of the trainer's facts and its adaptive behaviour, written by the reviewer
 * from first principles rather than from the engine:
 *
 *  - note names: open strings from scientific pitch notation, the musical alphabet with its two
 *    half steps (E–F, B–C), one fret = one semitone; every string, frets 0–15, standard and drop D;
 *  - the explanations a miss gives ("The dot at fret 7 is B; one fret up is C") are re-derived;
 *  - the picker, driven through real rounds by adversarial learners, never loops on one place;
 *  - the heat map shows exactly the answers that were given.
 */
import { describe, expect, it } from 'vitest';
import { tuning } from '@/core/guitar';
import { makeRig } from '@/core/progress/testkit';
import { formatNote } from '@/core/theory';
import { DRILLS, drillPlan } from './drills';
import { anchorSentence, explainNameMiss, explanationAnchor, onLandmarkSentence } from './explain';
import { gradeName } from './grade';
import { boardRange, midiAtPos, pcAt, scopeHasAccidentals } from './neck';
import { namesOf, spell } from './notes';
import { STAGES, stageLesson } from './path';
import { cooldownFor } from './picker';
import { bestResult, finishQuestion, nextQuestion, startRound, type RoundPlan } from './round';
import { defaultSettings } from './settings';
import { heatMap, type NeckStats } from './stats';
import type { NameQuestion, NeckContext, Pos, Question } from './types';

// ── first principles ────────────────────────────────────────────────────────────────────────────

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Semitones from each letter to the next: E–F and B–C are the half steps. */
const STEP_AFTER: Record<string, number> = { C: 2, D: 2, E: 1, F: 2, G: 2, A: 2, B: 1 };

/** The twelve sounds from C, named with sharps, built by walking the alphabet. */
function chromaticSharps(): string[] {
  const out: string[] = [];
  for (const l of LETTERS) {
    out.push(l);
    if (STEP_AFTER[l] === 2) out.push(`${l}#`);
  }
  return out;
}
/** The same twelve sounds named with flats: the black key takes the name of the letter above. */
function chromaticFlats(): string[] {
  const out: string[] = [];
  LETTERS.forEach((l, i) => {
    out.push(l);
    if (STEP_AFTER[l] === 2) out.push(`${LETTERS[(i + 1) % 7]}b`);
  });
  return out;
}
const SHARPS = chromaticSharps();
const FLATS = chromaticFlats();

/** MIDI number of a note in scientific pitch notation ("E2", "D2"): C4 = 60. */
function sciToMidi(note: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note)!;
  const semis = SHARPS.indexOf(m[1]) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 12 * (Number(m[3]) + 1) + semis;
}

/** What a guitarist would call the note at a fret: the open note, `fret` semitones up. */
function noteAt(openStrings: string[], string: number, fret: number): { midi: number; sharp: string; flat: string; octave: number } {
  const open = sciToMidi(openStrings[openStrings.length - string]);
  const midi = open + fret;
  return { midi, sharp: SHARPS[midi % 12], flat: FLATS[midi % 12], octave: Math.floor(midi / 12) - 1 };
}

const TUNINGS: Record<string, string[]> = {
  standard: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'drop-d': ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};
const fmt = (n: string) => formatNote(n);

describe('note names on every string, frets 0 to 15 (first principles)', () => {
  for (const [id, open] of Object.entries(TUNINGS)) {
    it(`${id}: the trainer names every place as a guitarist would`, () => {
      const t = tuning(id);
      expect(t.midi).toEqual(open.map(sciToMidi));
      for (const spelling of ['sharps', 'flats'] as const) {
        const ctx: NeckContext = { tuning: t.midi, spelling };
        for (let s = 1; s <= 6; s++) {
          for (let f = 0; f <= 15; f++) {
            const want = noteAt(open, s, f);
            const p = { string: s, fret: f };
            expect(midiAtPos(ctx, p)).toBe(want.midi);
            expect(spell(pcAt(ctx, p), spelling)).toBe(spelling === 'sharps' ? want.sharp : want.flat);
            // The pad accepts both names of one sound, and only those.
            expect(new Set(namesOf(pcAt(ctx, p)))).toEqual(new Set([want.sharp, want.flat]));
          }
        }
      }
    });
  }

  it('spot checks a teacher would make', () => {
    const std = TUNINGS.standard;
    expect(noteAt(std, 2, 1)).toMatchObject({ sharp: 'C', octave: 4, midi: 60 }); // middle C on the B string
    expect(noteAt(std, 3, 5)).toMatchObject({ sharp: 'C', midi: 60 });
    expect(noteAt(std, 6, 5).midi).toBe(sciToMidi('A2')); // fifth fret = next open string
    expect(noteAt(std, 3, 4).midi).toBe(sciToMidi('B3')); // except the G string: fourth fret
    expect(noteAt(TUNINGS['drop-d'], 6, 7).midi).toBe(sciToMidi('A2')); // drop D: seventh fret
    for (let s = 1; s <= 6; s++) expect(noteAt(std, s, 12).midi - noteAt(std, s, 0).midi).toBe(12);
  });

  it('the lessons of steps 2 and 3 list the right naturals in drop D', () => {
    const ctx: NeckContext = { tuning: tuning('drop-d').midi, spelling: 'sharps' };
    const run = (s: number) => {
      const parts: string[] = [];
      for (let f = 0; f <= 12; f++) {
        const n = noteAt(TUNINGS['drop-d'], s, f).sharp;
        if (n.length === 1) parts.push(`${n} ${f === 0 ? 'open' : f}`);
      }
      return parts.join(', ');
    };
    // Two strings are tuned to D, so string 6 is "the low D string".
    const six = stageLesson(STAGES[1], ctx, fmt).points.join(' ');
    expect(run(6)).toBe('D open, E 2, F 3, G 5, A 7, B 9, C 10, D 12');
    expect(six).toContain(`On the low D string: ${run(6)}.`);
    const five = stageLesson(STAGES[2], ctx, fmt).points.join(' ');
    expect(five).toContain(`On the A string: ${run(5)}.`);
  });
});

// ── explanations ────────────────────────────────────────────────────────────────────────────────

const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

describe('explanations after a miss (drop D and standard, frets 0–15)', () => {
  for (const [id, open] of Object.entries(TUNINGS)) {
    it(`${id}: every "landmark plus distance" sentence adds up`, () => {
      const ctx: NeckContext = { tuning: tuning(id).midi, spelling: 'sharps' };
      for (let s = 1; s <= 6; s++) {
        for (let f = 0; f <= 15; f++) {
          const p = { string: s, fret: f };
          const name = noteAt(open, s, f).sharp;
          const on = onLandmarkSentence(p);
          if (on) {
            // The note sits on a landmark: named directly, and no other landmark is drawn.
            expect(explanationAnchor(ctx, p, [0, 15])).toBeNull();
            continue;
          }
          const sentence = anchorSentence(ctx, p, name, fmt, [0, 15]);
          const anchor = explanationAnchor(ctx, p, [0, 15]);
          if (!sentence) {
            expect(anchor).toBeNull();
            continue;
          }
          const m = /^(?:The (?:double )?dot at fret (\d+)|The open string) is ([A-G]♯?); (one|two|three|four) frets? (up|down) is ([A-G]♯?)\.$/.exec(sentence);
          expect(m, sentence).not.toBeNull();
          const anchorFret = m![1] === undefined ? 0 : Number(m![1]);
          const k = WORD[m![3]] * (m![4] === 'up' ? 1 : -1);
          expect(anchorFret + k).toBe(f);
          expect(m![2].replace('♯', '#')).toBe(noteAt(open, s, anchorFret).sharp);
          expect(m![5].replace('♯', '#')).toBe(name);
          // The board draws the same landmark the sentence names.
          expect(anchor).toMatchObject({ fret: anchorFret, distance: k });
        }
      }
    });
  }

  it('a landmark outside the board is never used: frets 4 to 8 do not lean on the dot at 3', () => {
    const ctx: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };
    for (let s = 1; s <= 6; s++) {
      for (let f = 4; f <= 8; f++) {
        const a = explanationAnchor(ctx, { string: s, fret: f }, [4, 8]);
        if (a) expect(a.fret).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('"C is at fret N" points at a place on the board the learner is looking at', () => {
    const ctx: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };
    // A flat at fret 11 of the A string, answered "C": C is at fret 3 on the board (0–12), not fret 15.
    const pos = { string: 5, fret: 11 };
    const q: NameQuestion = { kind: 'name', index: 0, item: '5:11', pc: pcAt(ctx, pos), name: 'G#', pos, midi: midiAtPos(ctx, pos) };
    const g = gradeName(q, 0, ctx, [0, 12]);
    expect(g.givenAt).toEqual({ string: 5, fret: 3 });
    expect(explainNameMiss(q, 0, g.givenAt, ctx, fmt, [0, 12]).join(' ')).toContain('C is at fret 3 on this string.');
    // With no C on the board's frets, the nearest one on the neck is still named.
    expect(gradeName(q, 0, ctx, [9, 12], 15).givenAt).toEqual({ string: 5, fret: 15 });
  });

  it('a board shows at least four frets, and the nut when the range starts there', () => {
    expect(boardRange({ strings: [1], frets: [0, 12], notes: 'all' })).toEqual([0, 12]);
    expect(boardRange({ strings: [1], frets: [5, 5], notes: 'all' })).toEqual([5, 8]);
  });
});

// ── the picker in real rounds ───────────────────────────────────────────────────────────────────

type Learner = (q: Question, i: number) => boolean;

/** Answer a question the way the round screen does, right or wrong. */
function play(plan: RoundPlan, ctx: NeckContext, learner: Learner, n: number, seed: number) {
  let state = startRound(plan, ctx, {}, seed);
  const asked: Question[] = [];
  for (let i = 0; i < n; i++) {
    const q = nextQuestion(state);
    expect(q, `${plan.skillId} question ${i}`).not.toBeNull();
    asked.push(q!);
    const right = learner(q!, i);
    const targets = 'targets' in q! && q!.targets.length ? q!.targets : 'pos' in q! ? [q!.pos] : [];
    const tapped = 'pos' in q! ? q!.pos : targets[0];
    const attempt =
      q!.kind === 'every'
        ? { right, ms: right ? 900 : null, wrongTaps: [], found: right ? targets : targets.slice(1) }
        : { right, ms: right ? 900 : null, wrongTaps: [], found: [], tapped: right ? tapped : null };
    state = finishQuestion(state, q!, attempt).state;
  }
  return { asked, state };
}

describe('the adaptive picker never loops on one place', () => {
  const ctxs: NeckContext[] = [
    { tuning: tuning('standard').midi, spelling: 'both' },
    { tuning: tuning('drop-d').midi, spelling: 'sharps' },
  ];
  const plans = (ctx: NeckContext): RoundPlan[] => [
    ...STAGES.map((st) => ({ skillId: st.id, title: st.title, asks: st.asks, scope: st.scope(ctx, 15), length: 60, seconds: null, passAt: 0.8, options: st.options })),
    ...DRILLS.map((d) => drillPlan(d, defaultSettings(6), { tapInstead: true })),
  ];
  const learners: Record<string, Learner> = {
    'always wrong': () => false,
    'always right': () => true,
    'wrong only on the first item it sees': (() => {
      let first: string | null = null;
      return (q: Question) => {
        first ??= q.item;
        return q.item !== first;
      };
    })(),
  };

  for (const [who, learner] of Object.entries(learners)) {
    it(`${who}: no repeat inside the cooldown, no item over its fair share, every round goes on`, () => {
      for (const ctx of ctxs) {
        for (const plan of plans(ctx)) {
          for (const seed of [1, 99]) {
            const { asked } = play(plan, ctx, learner, 60, seed);
            // Items of one kind share a pool; the cooldown applies within it.
            const byKind = new Map<string, string[]>();
            for (const q of asked) byKind.set(q.kind, [...(byKind.get(q.kind) ?? []), q.item]);
            const counts = new Map<string, number>();
            for (const q of asked) counts.set(q.item, (counts.get(q.item) ?? 0) + 1);
            const max = Math.max(...counts.values());
            const distinct = counts.size;
            // Never the same place twice in a row when there was a choice.
            for (let i = 1; i < asked.length; i++) {
              if (distinct > 1) expect(asked[i].item === asked[i - 1].item && asked[i].kind === asked[i - 1].kind, `${plan.skillId} ${who} at ${i}: ${asked[i].item}`).toBe(false);
            }
            if (distinct > 1) {
              const pool = Math.max(...[...byKind.values()].map((xs) => new Set(xs).size));
              expect(max, `${plan.skillId} (${who}): ${max} of 60 on one item, pool ${pool}`).toBeLessThanOrEqual(Math.ceil(60 / (cooldownFor(pool) + 1)) + 1);
            }
          }
        }
      }
    });
  }
});

// ── fixes from the review ───────────────────────────────────────────────────────────────────────

describe('what the screens show', () => {
  it('a round left part-way shows no "Best 0%": only finished rounds set a best', () => {
    const rig = makeRig();
    rig.actions.recordActivity({ kind: 'fretboard', id: 'fretboard:name-the-note', accuracy: 0.67, completed: false, durationSec: 30 });
    const left = rig.store.getState().skills['fretboard:name-the-note'];
    expect(left.attempts).toBe(1);
    expect(left.bestAccuracy).toBe(0); // the store keeps no best for an abandoned round
    expect(bestResult(left)).toBeNull();
    rig.actions.recordActivity({ kind: 'fretboard', id: 'fretboard:name-the-note', accuracy: 0.75, score: 75, durationSec: 40 });
    expect(bestResult(rig.store.getState().skills['fretboard:name-the-note'])).toEqual({ percent: 75, score: 75 });
    expect(bestResult(undefined)).toBeNull();
  });

  it('the answer pad offers sharps and flats only when the round can ask one', () => {
    const std: NeckContext = { tuning: tuning('standard').midi, spelling: 'both' };
    const open = STAGES[0].scope(std, 15);
    expect(scopeHasAccidentals(open, std)).toBe(false); // E A D G B E, open and at fret 12
    expect(scopeHasAccidentals(STAGES[1].scope(std, 15), std)).toBe(false);
    expect(scopeHasAccidentals(STAGES[7].scope(std, 15), std)).toBe(true);
    expect(scopeHasAccidentals({ strings: [1, 2, 3, 4, 5, 6], frets: [0, 12], notes: 'all' }, std)).toBe(true);
    // A tuning with a sharp on an open string needs the upper row even in step 1.
    const openD: NeckContext = { tuning: tuning('open-d').midi, spelling: 'sharps' };
    expect(scopeHasAccidentals(STAGES[0].scope(openD, 15), openD)).toBe(true);
  });
});

// ── the heat map shows what was answered ────────────────────────────────────────────────────────

describe('the heat map matches the recorded answers', () => {
  it('after a mixed round, each place shows exactly its own answers', () => {
    const ctx: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };
    const plan: RoundPlan = { skillId: 't', title: 't', asks: [{ kind: 'name', weight: 1 }, { kind: 'find', weight: 1 }], scope: { strings: [6, 5], frets: [0, 12], notes: 'naturals' }, length: 40, seconds: null, passAt: 0.8 };
    // Wrong on every third question, whatever it is.
    const { asked, state } = play(plan, ctx, (_q, i) => i % 3 !== 2, 40, 7);
    const tally = new Map<string, { n: number; ok: number }>();
    asked.forEach((q, i) => {
      const p = (q as { pos: Pos }).pos;
      const k = `${p.string}:${p.fret}`;
      const e = tally.get(k) ?? { n: 0, ok: 0 };
      e.n++;
      if (i % 3 !== 2) e.ok++;
      tally.set(k, e);
    });
    const cells = heatMap(state.stats as NeckStats, ctx, [0, 12], [6, 5]);
    for (const c of cells) {
      const want = tally.get(`${c.string}:${c.fret}`);
      if (!want) {
        expect(c.level, `${c.string}:${c.fret}`).toBe('new');
        continue;
      }
      // Fewer than ten answers per place: nothing has faded yet.
      expect(c.n).toBe(want.n);
      expect(Math.round((c.accuracy ?? 0) * c.n)).toBe(want.ok);
      if (want.ok === 0) expect(c.level).toBe('weak');
      if (want.ok === want.n && want.n >= 2) expect(['good', 'fluent']).toContain(c.level);
    }
  });
});
