import { describe, expect, it } from 'vitest';
import { PROGRESSIONS, progression } from '@/content/progressions';
import { chordPcs, isNote, parseChord } from '@/core/theory';
import { capoAdvice, keyOptions } from './keys';
import { chartLines, pageModel, playedSymbols } from './page';

const pcs = (midi: readonly number[]) => [...new Set(midi.map((m) => m % 12))];

describe('the page model of every catalog progression in every key', () => {
  it('builds, covers every bar, and gives every chord a shape that plays it', { timeout: 240_000 }, () => {
    let pages = 0;
    for (const p of PROGRESSIONS) {
      for (const { tonic } of keyOptions(p).all) {
        const m = pageModel(p, tonic);
        pages++;
        expect(m.tonic).toBe(tonic);
        // The chart: every bar once, in order, with sections intact.
        const shown = m.lines.flatMap((l) => l.bars.map((b) => b.index));
        expect(shown).toEqual(p.bars.map((_, i) => i));
        for (const line of m.lines) expect(line.bars.length).toBeLessThanOrEqual(4);
        m.resolved.bars.forEach((bar, i) => expect(bar.map((c) => c.token)).toEqual([...p.bars[i]]));
        // Chords: one card per distinct symbol, each a real chord with a shape made of its notes.
        expect(m.chords.map((c) => c.symbol)).toEqual(m.resolved.chords);
        for (const c of m.chords) {
          const parsed = parseChord(c.symbol);
          expect(parsed, `${p.id} in ${tonic}: ${c.symbol}`).not.toBeNull();
          expect(c.voicing, `${p.id} in ${tonic}: no shape for ${c.symbol}`).not.toBeNull();
          const want = chordPcs(c.symbol);
          for (const pc of pcs(c.voicing!.midi)) expect(want, `${p.id} ${tonic} ${c.symbol}`).toContain(pc);
          expect(c.token.length).toBeGreaterThan(0);
        }
        // Scales to solo with are real scales on real tonics.
        expect(m.scales.length).toBeGreaterThan(0);
        for (const s of m.scales) expect(isNote(s.tonic)).toBe(true);
        expect(m.related.every((r) => r.id !== p.id)).toBe(true);
      }
    }
    expect(pages).toBe(PROGRESSIONS.length * 12);
  });
});

describe('chart lines', () => {
  it('starts a new line at each section and labels it', () => {
    const p = progression('jazz-rhythm-changes');
    const m = pageModel(p, 'Bb');
    expect(p.sections).toBeTruthy();
    const labelled = m.lines.filter((l) => l.label);
    expect(labelled.map((l) => l.label)).toEqual(p.sections!.map((s) => s.label));
    expect(m.lines.length).toBe(p.sections!.reduce((n, s) => n + Math.ceil(s.bars / 4), 0));
  });

  it('lays a 12-bar blues out in three lines of four', () => {
    const p = progression('blues-12-bar');
    const lines = chartLines(p, pageModel(p, 'A').resolved);
    expect(lines.map((l) => l.bars.length)).toEqual([4, 4, 4]);
    expect(lines.every((l) => l.label === null)).toBe(true);
  });

  it('plays the chords in order with held bars repeated', () => {
    const m = pageModel(progression('pop-axis'), 'G');
    expect(playedSymbols(m.resolved)).toEqual(['G', 'D', 'Em', 'C']);
    expect(m.chords.map((c) => c.symbol)).toEqual(['G', 'D', 'Em', 'C']);
    expect(m.practise).not.toBeNull();
  });
});

describe('capo shapes on the page', () => {
  it('fingers the shapes behind the capo and names them', () => {
    const p = progression('pop-axis');
    const advice = capoAdvice(p, 'Bb')!;
    const m = pageModel(p, 'Bb', { capo: advice.capo, capoShapes: advice.shapes });
    expect(m.capo).toBe(3);
    expect(m.chords.map((c) => c.shape)).toEqual(['G', 'D', 'Em', 'C']);
    for (const c of m.chords) expect(c.voicing!.capo).toBe(3);
  });
});
