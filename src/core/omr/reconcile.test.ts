import { describe, expect, it } from 'vitest';
import { alignSequences, checkMeasures, estimateRhythmFromSpacing, linkSystem, reconcileRhythm, spellPitch } from './reconcile';
import {
  type BBox, type DurationValue, type OmrDuration, type OmrMeasure, type OmrNotationEvent, type OmrNote, type OmrPage, type OmrStaff, type OmrTabEvent,
  type OmrTabNote, durationTicks, midiAtFret, pitchAtStaffPosition,
} from './types';

const box = (x: number, y = 0): BBox => ({ x: x - 5, y, w: 10, h: 10 });
const dur = (value: DurationValue, dots: 0 | 1 = 0, confidence = 0.9): OmrDuration => ({ value, dots, ticks: durationTicks(value, dots), confidence, source: 'image' });

function head(pos: number, alter = 0, confidence = 0.9, alts?: number[]): OmrNote {
  return {
    id: `h${pos}`, bbox: box(0), confidence, staffPosition: pos, head: 'filled', pitch: pitchAtStaffPosition(pos, alter),
    alternatives: alts?.map((a) => ({ value: pitchAtStaffPosition(pos, a), confidence: 0.3 })),
  };
}

function chord(x: number, notes: OmrNote[], d: OmrDuration = dur('quarter')): OmrNotationEvent {
  return { id: `n${x}`, kind: 'chord', x, bbox: box(x), confidence: 0.9, notes, duration: d };
}

function tabNote(string: number, fret: number, confidence = 0.95, alts?: number[]): OmrTabNote {
  return { id: `t${string}.${fret}`, bbox: box(0, 100), confidence, string, fret, midi: midiAtFret(string, fret), alternatives: alts?.map((a) => ({ value: a, confidence: 0.3 })) };
}

function column(x: number, notes: OmrTabNote[], d?: OmrDuration): OmrTabEvent {
  return { id: `c${x}`, kind: 'tab', x, bbox: box(x, 100), confidence: 0.9, notes, duration: d };
}

function measure(id: string, index: number, x0: number, x1: number, events: OmrMeasure['events']): OmrMeasure {
  return { id, bbox: { x: x0, y: 0, w: x1 - x0, h: 40 }, confidence: 1, index, x0, x1, events };
}

function staff(id: string, kind: 'notation' | 'tab', measures: OmrMeasure[], partner?: string): OmrStaff {
  const lines = kind === 'tab' ? 6 : 5;
  return {
    id, bbox: box(0), confidence: 1, kind, lineCount: lines,
    geometry: { lines: [], space: 10, lineThickness: 1, x0: 0, x1: 400, bbox: { x: 0, y: 0, w: 400, h: 40 }, contentBox: { x: 0, y: 0, w: 400, h: 40 } },
    barlines: [{ id: `${id}.b1`, bbox: box(200), confidence: 1, x: 200, type: 'single' }], measures, linkedStaffId: partner,
  };
}

describe('spelling a sounding pitch for the notation', () => {
  it('keeps the staff position when an accidental makes it fit, else follows the key', () => {
    // Guitar: sounding F#3 (54) is written F#4, the first space (position 1).
    expect(spellPitch(54, 0, 1)).toMatchObject({ step: 'F', alter: 1, octave: 4, written: 66, midi: 54 });
    expect(spellPitch(54, -1)).toMatchObject({ step: 'G', alter: -1 });
    expect(spellPitch(54, 2)).toMatchObject({ step: 'F', alter: 1 });
  });
});

describe('aligning two sequences', () => {
  it('pairs in order and skips what has no partner', () => {
    const a = [10, 20, 30, 40];
    const b = [11, 31, 41];
    expect(alignSequences(a.length, b.length, (i, j) => (Math.abs(a[i] - b[j]) < 3 ? 1 : -Infinity))).toEqual([[0, 0], [2, 1], [3, 2]]);
  });
});

describe('linking a notation staff with its tab staff', () => {
  it('raises agreeing notes, copies string / fret and rhythm, and flags what only one staff has', () => {
    // G3 sounding = string 3 open; written G4 = staff position 1? (E4 = 0, F4 = 1, G4 = 2).
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 200, [chord(50, [head(2)]), chord(100, [head(4)]), chord(150, [head(6)])])], 't');
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 200, [column(51, [tabNote(3, 0, 0.6)]), column(99, [tabNote(2, 0)])])], 'n');
    const stats = linkSystem(n, t);
    expect(stats.pairs).toBe(2);
    expect(stats.agree).toBe(2);
    expect(stats.notationOnly).toBe(1);
    const [g, b, d] = n.measures[0].events as OmrNotationEvent[];
    expect(g.notes[0]).toMatchObject({ string: 3, fret: 0 });
    expect(g.notes[0].confidence).toBeGreaterThan(0.9);
    const tg = t.measures[0].events[0] as OmrTabEvent;
    expect(tg.notes[0].confidence).toBeGreaterThan(0.9);
    expect(tg.duration?.value).toBe('quarter');
    expect(tg.duration?.source).toBe('merged');
    expect(b.notes[0]).toMatchObject({ string: 2, fret: 0 });
    expect(d.issues?.[0].code).toBe('unlinked');
  });

  it('settles a disagreement in favour of a reading both staves allow', () => {
    // Notation reads G4 (written) = G3 sounding; the tab says string 3 fret 1 = G#3. The note had
    // G#4 as its runner-up (a faint sharp), so the two readers agree on G#.
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 200, [chord(50, [head(2, 0, 0.55, [1])])])], 't');
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 200, [column(50, [tabNote(3, 1)])])], 'n');
    const stats = linkSystem(n, t);
    expect(stats.resolved).toBe(1);
    const h = (n.measures[0].events[0] as OmrNotationEvent).notes[0];
    expect(h.pitch.midi).toBe(56);
    expect(h.pitch.alter).toBe(1);
    expect(h.issues?.[0].code).toBe('resolved');
    expect(h.alternatives?.[0].value.midi).toBe(55);
    expect(h.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('leaves an unexplained disagreement as two guesses with each other as alternatives', () => {
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 200, [chord(50, [head(2)])])], 't');
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 200, [column(50, [tabNote(3, 4)])])], 'n');
    const stats = linkSystem(n, t);
    expect(stats.disagree).toBe(1);
    const h = (n.measures[0].events[0] as OmrNotationEvent).notes[0];
    const q = (t.measures[0].events[0] as OmrTabEvent).notes[0];
    expect(h.confidence).toBeLessThan(0.5);
    expect(q.confidence).toBeLessThan(0.5);
    expect(h.pitch.midi).toBe(55);
    expect(h.alternatives?.[0].value.midi).toBe(59);
    expect(q.fret).toBe(4);
    expect(q.alternatives?.[0].value).toBe(0);
    expect(h.issues?.[0].code).toBe('staves-disagree');
  });
});

describe('measures', () => {
  it('checks the metre and allows an upbeat', () => {
    const st = staff('n', 'notation', [
      measure('m0', 0, 0, 100, [chord(50, [head(2)])]),
      measure('m1', 1, 100, 200, [chord(120, [head(2)], dur('half')), chord(160, [head(2)], dur('half'))]),
      measure('m2', 2, 200, 300, [chord(220, [head(2)], dur('half')), chord(260, [head(2)])]),
    ]);
    const r = checkMeasures(st, 3840, true);
    expect(st.measures[0].pickup).toBe(true);
    expect(st.measures[0].addsUp).toBeUndefined();
    expect(st.measures[1].addsUp).toBe(true);
    expect(st.measures[2].addsUp).toBe(false);
    expect(r).toEqual({ checked: 2, bad: 1 });
  });

  it('works out note lengths from the spacing when no rhythm is printed', () => {
    const even = measure('a', 0, 0, 440, [column(50, [tabNote(1, 0)]), column(150, [tabNote(1, 1)]), column(250, [tabNote(1, 3)]), column(350, [tabNote(1, 5)])]);
    expect(estimateRhythmFromSpacing(even, 3840, 50)).toBe(true);
    expect(even.events.map((e) => e.duration?.value)).toEqual(['quarter', 'quarter', 'quarter', 'quarter']);
    expect(even.events.every((e) => e.duration?.source === 'inferred' && (e.duration?.confidence ?? 1) < 0.5)).toBe(true);
    expect(even.issues?.[0].code).toBe('rhythm-estimated');
    const long = measure('b', 0, 0, 420, [column(40, [tabNote(1, 0)]), column(240, [tabNote(1, 1)]), column(320, [tabNote(1, 3)])]);
    estimateRhythmFromSpacing(long, 3840, 40);
    expect(long.events.map((e) => e.duration?.value)).toEqual(['half', 'quarter', 'quarter']);
  });

  it('lets the staff whose measure adds up decide a rhythm disagreement', () => {
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 200, [chord(50, [head(2)], dur('half')), chord(150, [head(4)], dur('half'))])], 't');
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 200, [column(50, [tabNote(3, 0)], dur('quarter')), column(150, [tabNote(2, 0)], dur('half'))])], 'n');
    linkSystem(n, t);
    checkMeasures(n, 3840);
    checkMeasures(t, 3840);
    const page = { systems: [{ staves: [n, t] }] } as unknown as OmrPage;
    expect(reconcileRhythm(page)).toBe(1);
    const first = t.measures[0].events[0] as OmrTabEvent;
    expect(first.duration?.value).toBe('half');
    expect(first.issues?.some((i) => i.code === 'resolved')).toBe(true);
  });
});
