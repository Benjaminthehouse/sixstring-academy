import { it } from 'vitest';
import { parseKey } from '@/core/theory';
import { scalePatterns } from '@/core/guitar';
it('explore', () => {
  for (const s of ['A mixolydian','A','Am','E phrygian','E major','C','D minor','Dm','E', 'E minor']) { const k = parseKey(s); console.log(s, k ? `${k.tonic} ${k.mode}` : null); }
});
