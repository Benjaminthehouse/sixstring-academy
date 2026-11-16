import { it } from 'vitest';
import { scalePatterns } from '@/core/guitar';
it('explore', () => {
  for (const p of scalePatterns('A', 'minor-pentatonic', { upTheNeck: true })) {
    console.log(p.id, p.name, p.positionName, p.position, p.minFret, p.maxFret, p.notes.map((n) => `${n.string}:${n.fret}${n.note}{${n.finger}}${n.stretch ? 'S' : ''}${n.shift ? 'H' : ''}`).join(' '));
  }
});
