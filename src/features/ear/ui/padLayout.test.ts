/**
 * The answer pad keeps whole words: found in review, "Mixolydian" broke as "Mixolydi an" and the
 * progression names ran past their buttons on a 390 px phone, and at 200 % text the scale names
 * broke into syllables. The pad now drops to fewer columns instead.
 */
import { describe, expect, it } from 'vitest';
import { DRILLS } from '../core/drills';
import { PHONE_PAD_REM, columnsAt, labelEm, padLayout } from './padLayout';

/** Widths measured in the browser (em at 1 rem, bold display face), to keep the estimate honest. */
const MEASURED: Record<string, number> = { Mixolydian: 5.38, 'Major pentatonic': 8.39, 'Harmonic minor': 7.9, 'I–IV–V–I': 3.72, 'I–V–vi–IV': 4.31, 'With turnaround': 8.13, Augmented: 5.68, M3: 1.55, 'm7♭5': 2.5 };

const items = (...labels: string[]) => labels.map((label) => ({ label }));

describe('answer pad layout', () => {
  it('never underestimates a label', () => {
    for (const [label, em] of Object.entries(MEASURED)) expect(labelEm(label), label).toBeGreaterThanOrEqual(em);
  });

  it('every label of every level fits its column on a 360 px phone', () => {
    for (const drill of Object.values(DRILLS)) {
      for (const level of drill.levels) {
        const layout = padLayout(level.pool.map((id) => drill.info(id)));
        const cols = columnsAt(layout, PHONE_PAD_REM);
        const colWidth = (PHONE_PAD_REM - (cols - 1) * 0.5) / cols;
        expect(colWidth, `${drill.id} ${level.n}`).toBeGreaterThanOrEqual(layout.minCol - 1e-9);
      }
    }
  });

  it('three modes on a phone: two columns, not three cramped ones; three on a desk', () => {
    const layout = padLayout(items('Major', 'Lydian', 'Mixolydian'));
    expect(columnsAt(layout, PHONE_PAD_REM)).toBe(2);
    expect(columnsAt(layout, 36)).toBe(3);
  });

  it('three progressions on a phone keep their numerals whole', () => {
    const layout = padLayout(items('I–IV–V–I', 'I–V–vi–IV', 'I–vi–IV–V'));
    expect(columnsAt(layout, PHONE_PAD_REM)).toBeLessThan(3);
  });

  it('at 200 % text the same phone gives one column (the pad works in rem, so it scales with the text)', () => {
    const layout = padLayout(items('Major', 'Lydian', 'Mixolydian'));
    expect(columnsAt(layout, PHONE_PAD_REM / 2)).toBe(1);
  });

  it('short labels keep the familiar grid: two big buttons, a 2×2 of four, three across for twelve', () => {
    expect(columnsAt(padLayout([{ label: 'Same', icon: 'Equal' }, { label: 'Different', icon: 'Split' }]), PHONE_PAD_REM)).toBe(2);
    expect(columnsAt(padLayout(items('M3', 'P4', 'P5', 'P8')), PHONE_PAD_REM)).toBe(2);
    const twelve = padLayout(items('m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'));
    expect(columnsAt(twelve, PHONE_PAD_REM)).toBe(3);
    expect(twelve.colsWide).toBe(4);
  });
});
