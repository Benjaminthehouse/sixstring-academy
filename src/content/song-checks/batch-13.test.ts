import { it } from 'vitest';
import { scalePatterns, identifyFretted, buildVoicing } from '@/core/guitar';
it('explore', () => {
  for (const up of [false, true]) {
    for (const p of scalePatterns('A', 'minor-pentatonic', { upTheNeck: up })) {
      console.log(up, p.id, p.name, p.positionName, p.position, p.minFret, p.maxFret, p.notes.map((n) => `${n.string}:${n.fret}${n.note}{${n.finger}}${n.stretch ? 'S' : ''}${n.shift ? 'H' : ''}`).join(' '));
    }
  }
  for (const s of ['x02120', 'xx0232', 'x02210', 'x02220', '320003', '133211', '244222', '022100', 'x35553', '577555', '355433', '875558', '8-10-10-9-8-8', 'x-x-10-12-13-12', 'x-15-14-12-13-12', 'x-x-5-7-8-7', 'x-10-9-7-8-7', 'x-10-12-12-12-10']) {
    const v = (() => { try { return buildVoicing(identifyFretted(s)?.symbol ?? 'C', s); } catch (e) { return String(e); } })();
    console.log(s, identifyFretted(s)?.symbol, typeof v === 'string' ? v : `${v.fingers.join(',')} ${v.label} diff ${v.difficulty} barres ${JSON.stringify(v.barres)}`);
  }
});
