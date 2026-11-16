import { it } from 'vitest';
import { figureProblems, parseRhythm, resolveFigure } from '@/lessons';
import { resolveMeter } from '@/core/audio';
import { loadSongText } from '@/content/songs';
import { parseSixTab } from '@/core/song';

it('probe', async () => {
  const fig = { kind: 'fretboard' as const, frets: [4, 8] as [number, number], derive: { scale: 'major', tonic: 'C' }, dots: [{ string: 4, fret: 8, note: 'Bb3', role: 'target' as const }] };
  console.log(figureProblems(fig), JSON.stringify(resolveFigure(fig)).slice(0, 400));
  for (const [p, t] of [['qt et et qt', '2/4'], ['qt et et qt | qt et et qt', '2/4'], ['h. h | h. h', '3+2/4'], ['q q q. | q q q.', '2+2+3/8'], ['q. q q', '3+2+2/8'], ['e q e q e e', '4/4']]) {
    const r = parseRhythm({ pattern: p, time: t });
    console.log(p, t, r.problems, r.onsets);
  }
  const m = resolveMeter('7/8');
  console.log(JSON.stringify(m));
  const { song } = parseSixTab(await loadSongText('st-read-shifting'));
  const b = song!.tracks[0].measures[7];
  console.log(JSON.stringify(b.beats.map((x) => x.notes.map((n) => ({ s: n.string, f: n.fret, m: n.midi, fi: (n as unknown as { finger?: number }).finger, k: Object.keys(n) })))));
});
