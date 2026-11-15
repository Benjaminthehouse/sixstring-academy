/**
 * The optional vision-model second opinion: parsing, merging rules, and the recognizer with and
 * without a model.
 */
import { describe, expect, it } from 'vitest';
import type { OmrTabEvent, OmrVisionModel } from '../types';
import { synthStaff } from './dev/synth';
import { recognizeTabStaff } from './index';
import { TAB_VISION_PROMPT, mergeVision, needsSecondOpinion, parseVisionColumns } from './second-opinion';

const geometry = {
  space: 24,
  lineYs: [84, 108, 132, 156, 180, 204],
  toPage: (x: number, y: number) => ({ x, y }),
  toPageBox: (x: number, y: number, w: number, h: number) => ({ x, y, w, h }),
};

function event(x: number, notes: [number, number, number, number[]?][]): OmrTabEvent {
  return {
    id: '', bbox: { x: x - 6, y: 0, w: 12, h: 20 }, confidence: Math.min(...notes.map((n) => n[2])), kind: 'tab', x,
    notes: notes.map(([string, fret, confidence, alts]) => ({ id: '', bbox: { x: x - 6, y: 0, w: 12, h: 20 }, confidence, string, fret, midi: 0, alternatives: alts?.map((value) => ({ value, confidence: 0.3 })) })),
  };
}

describe('parseVisionColumns', () => {
  it('keeps what is in the agreed shape and drops the rest', () => {
    const cols = parseVisionColumns({ columns: [
      { x: 0.5, notes: [{ string: 2, fret: 3 }, { string: 2, fret: 5 }, { string: 9, fret: 1 }, { string: 1, fret: 30 }] },
      { x: 0.2, notes: [{ string: 1, fret: 0 }] },
      { x: 1.4, notes: [{ string: 1, fret: 0 }] },
      { x: 0.7, notes: [] },
      'nonsense',
    ] }, 6);
    expect(cols).toEqual([{ x: 0.2, notes: [{ string: 1, fret: 0 }] }, { x: 0.5, notes: [{ string: 2, fret: 3 }] }]);
    expect(parseVisionColumns(null, 6)).toBeNull();
    expect(parseVisionColumns({ notes: [] }, 6)).toBeNull();
    expect(TAB_VISION_PROMPT).toContain('"columns"');
  });
});

describe('mergeVision', () => {
  it('raises a doubtful reading the model agrees with and leaves a clear one alone', () => {
    const events = [event(100, [[1, 5, 0.4]]), event(200, [[2, 7, 0.95]])];
    const changed = mergeVision(geometry, events, [100, 200], [{ x: 0.1, notes: [{ string: 1, fret: 5 }] }, { x: 0.2, notes: [{ string: 2, fret: 1 }] }], { x0: 0, width: 1000 }, 0.9);
    expect(changed).toBe(1);
    expect(events[0].notes[0]).toMatchObject({ fret: 5, source: 'merged' });
    expect(events[0].notes[0].confidence).toBeCloseTo(0.65, 5);
    // The clear 7 stays; the model's 1 is only noted as a remote alternative.
    expect(events[1].notes[0]).toMatchObject({ fret: 7, confidence: 0.95 });
    expect(events[1].notes[0].alternatives).toEqual([{ value: 1, confidence: 0.15 }]);
  });

  it('takes the model\'s fret for a guess only when the reader had it among its alternatives', () => {
    const events = [event(100, [[3, 8, 0.3, [0, 6]]]), event(300, [[3, 8, 0.3, [0]]])];
    mergeVision(geometry, events, [100, 300], [{ x: 0.1, notes: [{ string: 3, fret: 0 }] }, { x: 0.3, notes: [{ string: 3, fret: 4 }] }], { x0: 0, width: 1000 }, 0.9);
    expect(events[0].notes[0]).toMatchObject({ fret: 0, source: 'merged' });
    expect(events[0].notes[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(events[0].notes[0].alternatives?.[0].value).toBe(8);
    expect(events[1].notes[0].fret).toBe(8);
    expect(events[1].notes[0].alternatives?.[0]).toEqual({ value: 4, confidence: 0.3 });
  });

  it('adds numbers only the model saw as guesses on a poorly read staff, and not on a good one', () => {
    const vision = [{ x: 0.5, notes: [{ string: 4, fret: 2 }] }, { x: 0.1, notes: [{ string: 2, fret: 3 }] }];
    const good = [event(100, [[1, 5, 0.9]])];
    mergeVision(geometry, good, [100], vision, { x0: 0, width: 1000 }, 0.9);
    expect(good.length).toBe(1);
    expect(good[0].notes.length).toBe(1);
    const poor = [event(100, [[1, 5, 0.4]])];
    const xs = [100];
    mergeVision(geometry, poor, xs, vision, { x0: 0, width: 1000 }, 0.3);
    expect(poor.map((e) => e.notes.map((n) => `${n.string}:${n.fret}:${n.source ?? 'image'}`))).toEqual([['1:5:image', '2:3:ai'], ['4:2:ai']]);
    expect(xs).toEqual([100, 500]);
    expect(poor[1].confidence).toBeLessThan(0.5);
  });
});

describe('recognizeTabStaff with a model', () => {
  it('does not ask when the picture is clear, and asks once when it is not', async () => {
    let calls = 0;
    const ai: OmrVisionModel = { ask: async () => { calls++; return { columns: [] }; } };
    const clear = synthStaff({ items: [{ line: 1, x: 200, text: '5' }, { line: 2, x: 300, text: '12' }] });
    const reading = recognizeTabStaff(clear.input, { ai });
    expect(reading).not.toBeInstanceOf(Promise);
    expect(calls).toBe(0);
    expect(needsSecondOpinion([], 0.3)).toBe(false);
    // An implausible fret is a guess: now the model is consulted.
    const doubtful = synthStaff({ items: [{ line: 1, x: 200, text: '29' }, { line: 2, x: 300, text: '12' }] });
    const merged = await recognizeTabStaff(doubtful.input, { ai: { ask: async (image) => { calls++; expect('gray' in image).toBe(true); return { columns: [{ x: 200 / 900 + 0.01, notes: [{ string: 2, fret: 19 }] }] }; } } });
    expect(calls).toBe(1);
    expect(merged.events.length).toBe(2);
    expect([merged.events[0].notes[0].fret, ...(merged.events[0].notes[0].alternatives ?? []).map((a) => a.value)]).toContain(19);
  });

  it('keeps its own reading when the model fails or answers nonsense', async () => {
    const doubtful = synthStaff({ items: [{ line: 1, x: 200, text: '29' }] });
    const failing = await recognizeTabStaff(doubtful.input, { ai: { ask: async () => { throw new Error('offline'); } } });
    expect(failing.events.length).toBe(1);
    expect(failing.warnings?.some((w) => w.code === 'ai-unavailable')).toBe(true);
    const silly = await recognizeTabStaff(doubtful.input, { ai: { ask: async () => 'forty-two' } });
    expect(silly.events.length).toBe(1);
    const none = recognizeTabStaff(doubtful.input, { ai: null });
    expect(none).not.toBeInstanceOf(Promise);
  });

  it('stops waiting for a model that never answers once the reading is aborted', async () => {
    const doubtful = synthStaff({ items: [{ line: 1, x: 200, text: '29' }] });
    const ctl = new AbortController();
    const pending = recognizeTabStaff(doubtful.input, { ai: { ask: () => new Promise(() => undefined) }, signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    const reading = await pending;
    expect(reading.events.length).toBe(1);
    expect(reading.warnings?.some((w) => w.code === 'ai-unavailable')).toBe(true);
  });
});
