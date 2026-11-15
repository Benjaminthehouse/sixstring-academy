import { describe, expect, it } from 'vitest';
import { midiAt } from '@/core/guitar';
import { SCALES } from '@/core/theory';
import {
  allNoteMarkers,
  compareMarkers,
  compareSummary,
  connectMarkers,
  neighbourOf,
  shapeBox,
  shapeIndex,
  shapeMarkers,
  shapeRange,
  shapesFor,
  shapeWhere,
  stepShape,
  systemsFor,
  withLit,
} from './neck';

const NECK = { lastFret: 15 };
const ctx = (over: Partial<Parameters<typeof allNoteMarkers>[0]> = {}) => ({ tonic: 'A', scale: 'minor-pentatonic', setup: NECK, range: [0, 15] as [number, number], label: 'degree' as const, ...over });

describe('shapes', () => {
  it('gives the five A minor pentatonic boxes as one climb up the neck, box 1 at the 5th fret', () => {
    const boxes = shapesFor('A', 'minor-pentatonic', 'box', NECK);
    expect(boxes.map((b) => b.id)).toEqual(['box-1', 'box-2', 'box-3', 'box-4', 'box-5']);
    expect(boxes[0].minFret).toBe(5);
    expect(boxes[0].maxFret).toBe(8);
    // Box 5 has no room above the 12th fret on a 15-fret neck, so it stays at its lowest place.
    expect(boxes.map((b) => b.minFret)).toEqual([5, 7, 9, 12, 2]);
    expect(shapesFor('A', 'minor-pentatonic', 'box', { lastFret: 22 }).map((b) => b.minFret)).toEqual([5, 7, 9, 12, 14]);
    expect(shapeWhere(boxes[0])).toBe('frets 5–8');
  });

  it('uses the usual system first: boxes for pentatonics, CAGED for the major scale', () => {
    expect(systemsFor('minor-pentatonic')[0]).toBe('box');
    expect(systemsFor('major')[0]).toBe('caged');
    expect(systemsFor('major')).toContain('3nps');
    expect(systemsFor('major', 'dadgad')[0]).toBe('position');
  });

  it('finds shapes for every scale in every system that suits it, inside the learner’s neck', () => {
    for (const s of SCALES) {
      for (const system of systemsFor(s.id)) {
        const shapes = shapesFor('E', s.id, system, { lastFret: 15 });
        expect(shapes.length, `${s.id} ${system}`).toBeGreaterThan(0);
        for (const p of shapes) expect(p.maxFret, `${s.id} ${p.id}`).toBeLessThanOrEqual(15);
      }
    }
  });

  it('steps through shapes and wraps round', () => {
    const boxes = shapesFor('A', 'minor-pentatonic', 'box', NECK);
    expect(stepShape(boxes, 'box-1', 1)?.id).toBe('box-2');
    expect(stepShape(boxes, 'box-1', -1)?.id).toBe('box-5');
    expect(stepShape(boxes, 'box-5', 1)?.id).toBe('box-1');
    expect(shapeIndex(boxes, 'nope')).toBe(0);
    expect(stepShape([], null, 1)).toBeNull();
  });

  it('connects a shape to the next one up the neck', () => {
    const boxes = shapesFor('A', 'minor-pentatonic', 'box', NECK);
    expect(neighbourOf(boxes, boxes[0])?.id).toBe('box-2');
    // Box 5 sits at frets 2–5 here, and box 1 picks up where it ends.
    expect(neighbourOf(boxes, boxes[4])?.id).toBe('box-1');
    const high = shapesFor('A', 'minor-pentatonic', 'box', { lastFret: 22 });
    expect(neighbourOf(high, high[4])?.id).toBe('box-4');
  });

  it('counts frets from the capo, and draws the box on the wood', () => {
    const plain = shapesFor('A', 'minor-pentatonic', 'box', NECK)[0];
    const capo = shapesFor('A', 'minor-pentatonic', 'box', { lastFret: 15, capo: 2 })[0];
    // Same sounding notes: two frets lower behind a capo on 2.
    expect(midiAt(capo.notes[0], { capo: 2 })).toBe(midiAt(plain.notes[0]));
    expect(capo.minFret).toBe(plain.minFret - 2);
    expect(shapeBox([capo], { lastFret: 15, capo: 2 })).toEqual({ from: 5, to: 8, label: undefined });
    expect(shapeRange(plain, NECK)).toEqual([4, 9]);
  });
});

describe('markers', () => {
  it('marks every note of the scale in the range, the roots emphasised', () => {
    const m = allNoteMarkers(ctx());
    expect(m.length).toBeGreaterThan(30);
    expect(m.filter((x) => x.root).every((x) => x.label === 'R')).toBe(true);
    expect(new Set(m.map((x) => x.label))).toEqual(new Set(['R', '♭3', '4', '5', '♭7']));
  });

  it('shows one shape with fingers, over the rest of the scale drawn faintly', () => {
    const box1 = shapesFor('A', 'minor-pentatonic', 'box', NECK)[0];
    const m = shapeMarkers(ctx({ label: 'finger' }), box1);
    const own = m.filter((x) => x.state !== 'ghost');
    expect(own).toHaveLength(box1.notes.length);
    expect(own.map((x) => x.label)).toEqual(box1.notes.map((n) => String(n.finger)));
    expect(own.every((x) => x.color?.startsWith('finger-'))).toBe(true);
    expect(m.filter((x) => x.state === 'ghost').every((x) => !x.label)).toBe(true);
    // No position is drawn twice.
    expect(new Set(m.map((x) => `${x.string}:${x.fret}`)).size).toBe(m.length);
  });

  it('shows where two neighbouring shapes overlap', () => {
    const [b1, b2] = shapesFor('A', 'minor-pentatonic', 'box', NECK);
    const m = connectMarkers(ctx(), b1, b2);
    const shared = m.filter((x) => x.shape === 'square');
    expect(shared.length).toBeGreaterThan(3);
    expect(shared.every((x) => x.description?.includes('in both shapes'))).toBe(true);
    expect(m.filter((x) => x.state === 'ghost').length).toBe(b2.notes.length - shared.length);
  });

  it('compares C major with C Mixolydian: B only in major, B♭ only in Mixolydian', () => {
    const m = compareMarkers(ctx({ tonic: 'C', scale: 'major', range: [0, 12] }), 'mixolydian');
    const onlyA = new Set(m.filter((x) => x.shape === 'square').map((x) => x.note));
    const onlyB = new Set(m.filter((x) => x.shape === 'diamond').map((x) => x.note));
    expect([...onlyA]).toEqual(['B']);
    expect([...onlyB]).toEqual(['Bb']);
    expect(m.filter((x) => x.shape === 'diamond').every((x) => x.label === '♭7')).toBe(true);
    const s = compareSummary('major', 'mixolydian');
    expect(s.onlyA).toEqual(['7']);
    expect(s.onlyB).toEqual(['♭7']);
    expect(s.shared).toHaveLength(6);
    expect(s.sentence).toBe('Mixolydian is Major with a lowered 7th.');
  });

  it('compares minor pentatonic with the blues scale: one added blue note', () => {
    const s = compareSummary('minor-pentatonic', 'minor-blues');
    expect(s.onlyA).toEqual([]);
    expect(s.onlyB).toEqual(['♭5']);
  });

  it('lights the note being heard and keeps everything else', () => {
    const base = allNoteMarkers(ctx());
    const lit = withLit(base, { string: 6, fret: 5 });
    expect(lit).toHaveLength(base.length);
    expect(lit.filter((x) => x.state === 'target')).toHaveLength(1);
    expect(withLit(base, null)).toBe(base);
    expect(withLit([], { string: 1, fret: 3 })).toHaveLength(1);
  });
});
