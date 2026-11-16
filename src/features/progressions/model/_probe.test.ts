import { it } from 'vitest';
import { scalesForChord, getScale } from '@/core/theory';
import { PROGRESSIONS } from '@/content/progressions';
it('p', () => {
  console.log(scalesForChord('E7', { limit: 30 }).map((s) => `${s.tonic} ${s.scale.id} t${s.scale.tier} ${s.fit}`).join('\n'));
  console.log(getScale('phrygian-dominant')!.tier);
  console.log(PROGRESSIONS.filter((p) => p.bars.some((b) => b.length > 1)).slice(0, 8).map((p) => p.id + ' ' + p.chart));
});
