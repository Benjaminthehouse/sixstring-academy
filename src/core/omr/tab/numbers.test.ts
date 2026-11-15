/**
 * From glyphs to fret numbers: confidences, alternatives, plausibility, brackets and letters.
 */
import { describe, expect, it } from 'vitest';
import type { ClassScore } from './glyph';
import { type Glyph, MAX_FRET, assembleLine, buildNumber, detectLineThrough, facePenalties, glyphConfidence, isDigitLabel } from './numbers';
import { labelComponents } from '../image/cc';
import { synthStaff } from './dev/synth';
import { findLineBlobs } from './segment';
import { GLYPH_LABELS } from './templates';

/** A glyph at x with the given ranking: [label, score] pairs, best first. */
function glyph(x: number, ranking: [string, number][], width = 11, height = 19): Glyph {
  const ranked: ClassScore[] = ranking.map(([label, score]) => ({ label, score, cls: GLYPH_LABELS.indexOf(label), template: 0 }));
  return { box: { x0: x, y0: 100, x1: x + width, y1: 100 + height }, line: 2, ranked, label: ranked[0].label, score: ranked[0].score, margin: ranked[0].score - (ranked[1]?.score ?? 0), fused: false };
}

describe('glyphConfidence', () => {
  it('rises with the score and with the lead, and stays inside 0..1', () => {
    expect(glyphConfidence(0.97, 0.3)).toBeGreaterThan(0.9);
    expect(glyphConfidence(0.97, 0.01)).toBeLessThan(0.5);
    expect(glyphConfidence(0.7, 0.3)).toBeLessThan(glyphConfidence(0.9, 0.3));
    expect(glyphConfidence(0.9, 0.02)).toBeLessThan(glyphConfidence(0.9, 0.1));
    for (const [s, m] of [[0, 0], [1, 1], [0.5, 0], [2, 2]]) {
      const c = glyphConfidence(s, m);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(1);
    }
  });
});

describe('buildNumber', () => {
  it('reads one and two digits and passes the confidence of the weaker digit on', () => {
    const one = buildNumber([glyph(0, [['7', 0.96], ['1', 0.6]])], 19);
    expect(one.fret).toBe(7);
    expect(one.confidence).toBeGreaterThan(0.9);
    const two = buildNumber([glyph(0, [['1', 0.97], ['7', 0.6]]), glyph(13, [['2', 0.8], ['7', 0.76]])], 19);
    expect(two.fret).toBe(12);
    expect(two.confidence).toBeLessThan(0.5); // the 2 is a close call
    expect(two.alternatives[0].value).toBe(17);
    expect(two.gap).toBeCloseTo(2 / 19, 5);
  });

  it('lists the confusable readings as alternatives, best first, each below the reading itself', () => {
    const n = buildNumber([glyph(0, [['3', 0.9], ['8', 0.86], ['9', 0.8], ['0', 0.5]])], 19);
    expect(n.fret).toBe(3);
    expect(n.alternatives.map((a) => a.value)).toEqual([8, 9]);
    for (const a of n.alternatives) expect(a.confidence).toBeLessThanOrEqual(n.confidence);
  });

  it('does not report a fret above 24 as fact: it takes a plausible reading if one is close and keeps the raw one visible', () => {
    const swap = buildNumber([glyph(0, [['7', 0.9], ['1', 0.85]]), glyph(13, [['2', 0.95], ['7', 0.5]])], 19);
    expect(swap.fret).toBe(12);
    expect(swap.confidence).toBeLessThan(0.5);
    expect(swap.alternatives.map((a) => a.value)).toContain(72);
    expect(swap.flags).toContain('implausible-fret');
    const stuck = buildNumber([glyph(0, [['9', 0.97]]), glyph(13, [['9', 0.97]])], 19);
    expect(stuck.fret).toBe(99);
    expect(stuck.fret).toBeGreaterThan(MAX_FRET);
    expect(stuck.confidence).toBeLessThanOrEqual(0.2);
  });

  it('doubts a leading zero and a wide gap inside a number', () => {
    const zero = buildNumber([glyph(0, [['0', 0.95], ['8', 0.7]]), glyph(13, [['5', 0.95]])], 19);
    expect(zero.flags).toContain('leading-zero');
    expect(zero.confidence).toBeLessThan(0.5);
    const wide = buildNumber([glyph(0, [['1', 0.97]]), glyph(11 + 6, [['0', 0.97]])], 19);
    expect(wide.fret).toBe(10);
    expect(wide.flags).toContain('wide-gap');
    expect(wide.alternatives.map((a) => a.value)).toEqual(expect.arrayContaining([1, 0]));
  });
});

describe('assembleLine', () => {
  const d = (x: number, label: string, score = 0.95): Glyph => glyph(x, [[label, score]]);

  it('joins neighbouring digits and separates distant ones', () => {
    const nums = assembleLine([d(0, '1'), d(13, '2'), d(60, '5'), d(120, '7'), d(133, '9')], 19);
    expect(nums.map((n) => n.fret)).toEqual([12, 5, 79]);
    expect(nums[2].confidence).toBeLessThan(0.5);
    // Three digits in a row cannot be one fret.
    expect(assembleLine([d(0, '1'), d(13, '2'), d(26, '3')], 19).map((n) => n.fret)).toEqual([12, 3]);
  });

  it('reads x as a dead note and brackets only in pairs around a number', () => {
    const nums = assembleLine([d(0, 'x'), d(50, '('), d(58, '5'), d(71, ')'), d(120, '<'), d(132, '1'), d(145, '2'), d(158, '>'), d(220, '7'), d(233, '>')], 19);
    expect(nums.map((n) => [n.fret, !!n.dead, !!n.parenthesized, !!n.harmonic])).toEqual([[0, true, false, false], [5, false, true, false], [12, false, false, true], [7, false, false, false]]);
  });

  it('takes a 1 that could be a bracket for the bracket when its partner is there', () => {
    const maybe = (x: number, alt: string): Glyph => glyph(x, [['1', 0.8], [alt, 0.72]], 6, 24);
    expect(assembleLine([maybe(0, '('), d(9, '5'), d(22, ')')], 19).map((n) => [n.fret, !!n.parenthesized])).toEqual([[5, true]]);
    expect(assembleLine([d(0, '('), d(9, '5'), maybe(22, ')')], 19).map((n) => [n.fret, !!n.parenthesized])).toEqual([[5, true]]);
    // With the true bracket present the 1 stays a 1: "(12)".
    expect(assembleLine([d(0, '('), maybe(9, '('), d(18, '2'), d(31, ')')], 19).map((n) => [n.fret, !!n.parenthesized])).toEqual([[12, true]]);
    // No partner at all: a plain 15.
    expect(assembleLine([maybe(0, '('), d(9, '5')], 19).map((n) => n.fret)).toEqual([15]);
  });

  it('attaches a technique letter to the number before it and re-reads a stray letter as the digit it resembles', () => {
    const h = glyph(13, [['h', 0.9], ['4', 0.6]]);
    const nums = assembleLine([d(0, '5'), h, d(40, '7'), glyph(100, [['b', 0.85], ['6', 0.8]])], 19);
    expect(nums.map((n) => [n.fret, n.technique ?? ''])).toEqual([[5, 'h'], [7, ''], [6, '']]);
    expect(assembleLine([d(0, '7'), glyph(13, [['/', 0.9]]), d(30, '9')], 19).map((n) => n.technique ?? '')).toEqual(['/', '']);
    expect(isDigitLabel('7')).toBe(true);
    expect(isDigitLabel('x')).toBe(false);
    expect(isDigitLabel('r8')).toBe(false);
  });
});

describe('staff-level evidence', () => {
  it('tells a struck-through staff from a blanked one', () => {
    for (const lineThrough of [false, true]) {
      const { input } = synthStaff({ lineThrough, items: ['0', '2', '3', '5', '7', '10'].map((text, i) => ({ line: 2, x: 130 + i * 80, text })) });
      const blobs = findLineBlobs(labelComponents(input.noLines), input, labelComponents(input.binary));
      expect(detectLineThrough(input.gray, blobs, input.lineYs, 19)).toBe(lineThrough);
    }
  });

  it('needs a handful of clear digits before it favours a face', () => {
    expect(facePenalties([], [], 4)).toBeNull();
  });
});
