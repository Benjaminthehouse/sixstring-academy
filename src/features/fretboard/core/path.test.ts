import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, tuning } from '@/core/guitar';
import { formatNote } from '@/core/theory';
import { drillById, drillPlan, DRILLS } from './drills';
import { pcAt } from './neck';
import { pcOfName } from './notes';
import { hasStandardShapes, STAGES, stageLesson, stageTitle, stringName, type Stage } from './path';
import { candidatesFor } from './questions';
import { finishQuestion, nextQuestion, roundDone, startRound, summarize, usableAsks, type RoundPlan } from './round';
import { cleanSettings, defaultSettings, describeSettings, settingsScope } from './settings';
import type { NeckContext, Question } from './types';

const std: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };
const fmt = (n: string) => formatNote(n);
const stage = (id: string): Stage => STAGES.find((s) => s.id === id)!;

/** Every "<note> at fret <n>" / "fret <n> is <note>" claim in a sentence about one string, checked against the engine. */
function checkClaims(text: string, string: number, ctx: NeckContext) {
  const claims = [...text.matchAll(/fret (\d+) is ([A-G][♯♭]?)/g)].map((m) => ({ fret: Number(m[1]), note: m[2] }));
  for (const c of claims) {
    const ascii = c.note.replace('♯', '#').replace('♭', 'b');
    expect(pcAt(ctx, { string, fret: c.fret }), `${text}: fret ${c.fret}`).toBe(pcOfName(ascii));
  }
  return claims.length;
}

describe('the method', () => {
  it('has ten steps with unique ids, in order', () => {
    expect(STAGES.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(10);
  });

  it('every step has something to ask in standard, drop D, DADGAD and on a seven-string', () => {
    for (const id of ['standard', 'drop-d', 'dadgad', 'standard-7']) {
      const ctx: NeckContext = { tuning: tuning(id).midi, spelling: 'both' };
      for (const s of STAGES) {
        const plan: RoundPlan = { skillId: `fretboard:${s.id}`, title: s.title, asks: s.asks, scope: s.scope(ctx, 15), length: s.length, seconds: null, passAt: 0.8, options: s.options };
        expect(usableAsks(plan, ctx).length, `${id} ${s.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('octave steps really ask octave questions in standard tuning', () => {
    for (const id of ['octaves-4-and-3', 'octaves-2-and-1']) {
      const s = stage(id);
      expect(candidatesFor('octave', s.scope(std, 15), std, s.options).length).toBeGreaterThan(6);
    }
  });

  it('the lessons say true things about the notes (checked against core/guitar)', () => {
    const s6 = stageLesson(stage('string-6-naturals'), std, fmt);
    expect(s6.points[1]).toBe('On the low E string: E open, F 1, G 3, A 5, B 7, C 8, D 10, E 12.');
    expect(checkClaims(s6.points[2], 6, std)).toBeGreaterThanOrEqual(3);
    expect(s6.points[3]).toContain('A barre at fret 3 gives you G major, at fret 5 A major.');
    const s5 = stageLesson(stage('string-5-naturals'), std, fmt);
    expect(s5.points[1]).toBe('On the A string: A open, B 2, C 3, D 5, E 7, F 8, G 10, A 12.');
    checkClaims(s5.points[2], 5, std);
    expect(s5.points[3]).toContain('A barre at fret 3 gives you C major, at fret 5 D major.');
    // Every dot drawn carries the name of the note at its place.
    for (const st of STAGES) {
      for (const d of stageLesson(st, std, fmt).dots) {
        expect(pcOfName(d.name), `${st.id} ${d.pos.string}:${d.pos.fret}`).toBe(pcAt(std, d.pos));
        expect(noteAt(d.pos, { octave: false, context: { prefer: d.name.includes('b') ? 'flats' : 'sharps' } })).toBe(d.name);
      }
    }
  });

  it('octave lessons draw shapes that land on the same note, an octave or two up', () => {
    for (const id of ['octaves-4-and-3', 'octaves-2-and-1']) {
      const l = stageLesson(stage(id), std, fmt);
      expect(l.links.length).toBe(stage(id).options!.octavePairs!.length);
      for (const [a, b] of l.links) {
        const d = midiAt(b) - midiAt(a);
        expect([12, 24]).toContain(d);
      }
    }
    const l6 = stageLesson(stage('octaves-2-and-1'), std, fmt);
    expect(l6.points.join(' ')).toContain('two strings up, three frets up');
    expect(l6.points.join(' ')).toContain('same fret (two octaves up)');
  });

  it('the first step lists the open strings and the mnemonic only for standard tuning', () => {
    const l = stageLesson(stage('open-strings'), std, fmt);
    expect(l.points[0]).toBe('From the thickest string to the thinnest, the open strings are E A D G B E.');
    expect(l.points[1]).toContain('Eddie');
    const dropD = stageLesson(stage('open-strings'), { tuning: tuning('drop-d').midi, spelling: 'sharps' }, fmt);
    expect(dropD.points[0]).toBe('From the thickest string to the thinnest, the open strings are D A D G B E.');
    expect(dropD.points.join(' ')).not.toContain('Eddie');
  });

  it('names strings the way guitarists do', () => {
    expect(stringName(std, 6, fmt)).toBe('the low E string');
    expect(stringName(std, 1, fmt)).toBe('the high E string');
    expect(stringName(std, 5, fmt)).toBe('the A string');
    expect(stageTitle(stage('string-6-naturals'), std, fmt)).toBe('The low E string');
    expect(hasStandardShapes(std)).toBe(true);
    expect(hasStandardShapes({ tuning: tuning('drop-d').midi, spelling: 'sharps' })).toBe(false);
  });

  it('sharps and flats are explained with a real pair of frets in any tuning', () => {
    for (const id of ['standard', 'drop-d', 'open-g']) {
      const ctx: NeckContext = { tuning: tuning(id).midi, spelling: 'both' };
      const text = stageLesson(stage('sharps-and-flats'), ctx, fmt).points[0];
      const m = /between (\S+) and (\S+) is both (\S+) and (\S+):/.exec(text);
      expect(m, text).not.toBeNull();
      const [lo, hi, sharp, flat] = m!.slice(1).map((n) => pcOfName(n.replace('♯', '#').replace('♭', 'b'))!);
      expect((lo + 1) % 12).toBe(sharp);
      expect(sharp).toBe(flat);
      expect((sharp + 1) % 12).toBe(hi);
    }
  });
});

/** Answer a question right or wrong, as a learner would by tapping or naming. */
function answer(q: Question, right: boolean) {
  const at = 'pos' in q ? q.pos : q.targets[0];
  if (q.kind === 'every') return { right: false, ms: null, wrongTaps: right ? [] : [{ string: 6, fret: 0 }], found: right ? q.targets : [] };
  return { right, ms: right ? 1500 : null, wrongTaps: [], found: [], tapped: right ? at : null };
}

describe('rounds', () => {
  it('a step round asks its length, mixes its kinds and summarises', () => {
    const s = stage('all-naturals');
    const plan: RoundPlan = { skillId: 'fretboard:all-naturals', title: s.title, asks: s.asks, scope: s.scope(std, 15), length: s.length, seconds: null, passAt: 0.8 };
    let state = startRound(plan, std, {}, 42);
    const kinds = new Set<string>();
    let i = 0;
    while (!roundDone(state)) {
      const q = nextQuestion(state)!;
      kinds.add(q.kind);
      state = finishQuestion(state, q, answer(q, i++ % 5 !== 0)).state;
    }
    expect(state.results.length).toBe(12);
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    const sum = summarize(state.results, plan.passAt);
    expect(sum.asked).toBe(12);
    expect(sum.accuracy).toBeGreaterThan(0.6);
    expect(sum.missed.length).toBeGreaterThan(0);
  });

  it('never three questions of one kind in a row when a round mixes kinds', () => {
    const s = stage('string-6-naturals');
    const plan: RoundPlan = { skillId: 'x', title: s.title, asks: s.asks, scope: s.scope(std, 15), length: 60, seconds: null, passAt: 0.8 };
    let state = startRound(plan, std, {}, 7);
    const kinds: string[] = [];
    while (!roundDone(state)) {
      const q = nextQuestion(state)!;
      kinds.push(q.kind);
      state = finishQuestion(state, q, answer(q, true)).state;
    }
    for (let i = 2; i < kinds.length; i++) expect(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const plan = drillPlan(drillById('name-the-note')!, defaultSettings());
    const a = nextQuestion(startRound(plan, std, {}, 99));
    const b = nextQuestion(startRound(plan, std, {}, 99));
    expect(a).toEqual(b);
  });

  it('every drill builds a round that asks questions with the default settings', () => {
    for (const d of DRILLS) {
      const plan = drillPlan(d, defaultSettings());
      const q = nextQuestion(startRound(plan, std, {}, 1));
      expect(q, d.id).not.toBeNull();
    }
    expect(drillPlan(drillById('play-the-note')!, defaultSettings(), { tapInstead: true }).asks[0].kind).toBe('find');
    expect(drillPlan(drillById('sprint')!, defaultSettings()).seconds).toBe(60);
  });

  it('a find question names a note on its string and lists every place of it in range', () => {
    const plan = drillPlan(drillById('find-the-note')!, cleanSettings({ frets: [0, 15], notes: 'all' }));
    let state = startRound(plan, std, {}, 3);
    for (let i = 0; i < 30; i++) {
      const q = nextQuestion(state)!;
      expect(q.kind).toBe('find');
      if (q.kind !== 'find') return;
      for (const t of q.targets) {
        expect(t.string).toBe(q.string);
        expect(pcAt(std, t)).toBe(q.pc);
      }
      expect(q.targets.length).toBe(q.pos.fret <= 3 || q.pos.fret >= 12 ? 2 : 1);
      state = finishQuestion(state, q, answer(q, true)).state;
    }
  });

  it('blind spots: the round asks only those places', () => {
    const blind = ['3:2', '2:1', '4:7', '1:10'];
    const plan = drillPlan(drillById('blind-spots')!, defaultSettings(), { blind });
    let state = startRound(plan, std, {}, 5);
    for (let i = 0; i < 20; i++) {
      const q = nextQuestion(state)!;
      expect(blind).toContain(q.item);
      state = finishQuestion(state, q, answer(q, i % 2 === 0)).state;
    }
  });

  it('a spelling of "both" asks with sharps and with flats', () => {
    const ctx: NeckContext = { ...std, spelling: 'both' };
    const plan = drillPlan(drillById('name-the-note')!, cleanSettings({ notes: 'all' }));
    let state = startRound(plan, ctx, {}, 11);
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const q = nextQuestion(state)!;
      names.add(q.name);
      state = finishQuestion(state, q, answer(q, true)).state;
    }
    expect([...names].some((n) => n.includes('#'))).toBe(true);
    expect([...names].some((n) => n.endsWith('b'))).toBe(true);
  });
});

describe('settings', () => {
  it('cleans stored settings', () => {
    expect(cleanSettings(null)).toEqual(defaultSettings());
    expect(cleanSettings({ frets: [14, 3], strings: [9, 2, 2, 0], notes: 'all' }, 6, 15)).toMatchObject({ frets: [3, 14], strings: [2], notes: 'all' });
    expect(cleanSettings({ frets: [0, 30], strings: [] }, 6, 15)).toMatchObject({ frets: [0, 15], strings: [1, 2, 3, 4, 5, 6] });
    expect(settingsScope(defaultSettings())).toEqual({ strings: [1, 2, 3, 4, 5, 6], frets: [0, 12], notes: 'naturals' });
    expect(describeSettings(defaultSettings())).toBe('Frets 0–12 · all strings · natural notes');
  });
});
