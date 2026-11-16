import { it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { matchChord } from '@/core/pitch/chords';
import { computeChroma } from '@/core/pitch/chroma';
import { addNoise, seededRandom, strum } from '@/core/pitch/signals';
import { buildVoicing } from '@/core/guitar';
import { chordWaitArgs } from '@/lessons/listen';
import jazz from './elena-jazz-harmony';

function strummed(midis: number[], sr: number, seed: number, noisy: boolean, up = false): Float32Array {
  const rand = seededRandom(seed * 131 + midis[0]);
  let freqs = midis.map((m) => midiToFreq(m) * Math.pow(2, ((rand() - 0.5) * 16) / 1200));
  let levels = midis.map(() => 0.6 + 0.4 * rand());
  if (up) { freqs = freqs.reverse(); levels = levels.reverse().map((l, i, all) => l * (i >= all.length - 2 ? 0.45 : 1)); }
  let x = strum({ freqs, levels, sampleRate: sr, duration: 0.5, startTime: 0.05, strumMs: 8 + 10 * rand(), seed, attackNoise: 0.2, inharmonicity: 5e-5, pluckPosition: 0.12 + 0.12 * rand(), ...(noisy ? { highpassHz: 180, highpassOrder: 2 } : {}) });
  if (noisy) x = addNoise(x, 25, seed);
  return x.subarray(0, Math.round(0.37 * sr));
}
it('probe', () => {
  const out: string[] = [];
  for (const l of jazz.lessons) for (const s of l.steps as any[]) {
    if (s.type !== 'play-chord') continue;
    const v = buildVoicing(s.chord, s.frets);
    const midis = v.notes.map((n: any) => n.midi);
    const { chord, options } = chordWaitArgs(s);
    const scores: string[] = [];
    let pass = 0, n = 0;
    for (const [noisy, up] of [[false, false], [true, false], [true, true]] as const) for (let seed = 1; seed <= 6; seed++) {
      const frame = computeChroma(strummed(midis, 44100, seed, noisy, up), 44100);
      const m = matchChord(frame, chord);
      const rivalBeat = (options.rivals ?? []).some((r) => matchChord(frame, r).score > m.score);
      n++; if (m.score >= 0.6 && !rivalBeat) pass++;
      scores.push(m.score.toFixed(2) + (rivalBeat ? 'R' : ''));
    }
    const nums = scores.map((x) => parseFloat(x)); out.push(`${l.id} ${s.chord} ${s.frets} pcs=${chord.pcs.length} pass ${pass}/${n} min ${Math.min(...nums).toFixed(2)} ${scores.filter((x)=>x.includes('R')).length}R`);
  }
  process.stdout.write(out.join('\n') + '\n');
}, 120000);
