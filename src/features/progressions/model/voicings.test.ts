import { describe, expect, it } from 'vitest';
import { formatFrets } from '@/core/guitar';
import { chordPcs } from '@/core/theory';
import { changePairs, planVoicings } from './voicings';

const pcsOf = (midi: number[]) => [...new Set(midi.map((m) => m % 12))].sort((a, b) => a - b);

describe('change pairs', () => {
  it('counts each change and the loop back to the top', () => {
    expect(changePairs(['C', 'G', 'Am', 'F'])).toEqual([
      { from: 'C', to: 'G', count: 1 },
      { from: 'G', to: 'Am', count: 1 },
      { from: 'Am', to: 'F', count: 1 },
      { from: 'F', to: 'C', count: 1 },
    ]);
  });

  it('skips held chords and counts repeated changes', () => {
    expect(changePairs(['C', 'C', 'F', 'C', 'F', 'C'], false)).toEqual([
      { from: 'C', to: 'F', count: 2 },
      { from: 'F', to: 'C', count: 2 },
    ]);
  });
});

describe('planVoicings', () => {
  it('keeps the open chords for a beginner loop in G', () => {
    const plan = planVoicings(['G', 'D', 'Em', 'C'], { beginner: true });
    for (const s of ['G', 'D', 'Em', 'C']) {
      const v = plan.bySymbol.get(s)!;
      expect(v).toBeTruthy();
      expect(v.baseFret).toBeLessThanOrEqual(3);
      expect(v.category).toBe('open');
    }
    expect(plan.changes).toHaveLength(4);
    expect(plan.hardest).not.toBeNull();
    expect(plan.hardest!.tips.length).toBeGreaterThan(0);
  });

  it('gives a beginner the small F rather than the full barre', () => {
    const plan = planVoicings(['C', 'Am', 'F', 'G'], { beginner: true });
    expect(formatFrets(plan.bySymbol.get('F')!.frets)).toBe('xx3211');
  });

  it('every shape plays the chord it is drawn for', () => {
    const seq = ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm', 'Gm'];
    const plan = planVoicings(seq);
    for (const s of new Set(seq)) {
      const v = plan.bySymbol.get(s)!;
      expect(v).toBeTruthy();
      const want = chordPcs(s);
      for (const pc of pcsOf(v.midi)) expect(want).toContain(pc);
    }
  });

  it('smooth shapes cost no more than the standard ones, and keep a ii–V–I close together', () => {
    const seq = ['Cm7', 'F7', 'Bbmaj7', 'Bbmaj7'];
    const smooth = planVoicings(seq, { mode: 'smooth' });
    const standard = planVoicings(seq, { mode: 'standard' });
    expect(smooth.cost).toBeLessThanOrEqual(standard.cost);
    const frets = [...smooth.bySymbol.values()].flatMap((v) => v!.frets.filter((f): f is number => f !== null && f > 0));
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(5);
  });

  it('standard mode takes each chord’s usual shape', () => {
    const plan = planVoicings(['C', 'F'], { mode: 'standard' });
    expect(formatFrets(plan.bySymbol.get('C')!.frets)).toBe('x32010');
    expect(formatFrets(plan.bySymbol.get('F')!.frets)).toBe('133211');
  });

  it('fingers shapes behind a capo', () => {
    const plan = planVoicings(['Bb', 'F', 'Gm', 'Eb'], { capo: 3, beginner: true });
    const bb = plan.bySymbol.get('Bb')!;
    expect(bb.capo).toBe(3);
    expect(formatFrets(bb.frets)).toBe('320003');
  });
});
