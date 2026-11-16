import { it } from 'vitest';
import { computeChroma, matchChord, pluckedString } from '@/core/pitch';
import { chordPcs } from '@/core/theory';
import { chordWaitArgs } from '../listen';
import { PLAY_CHORD_THRESHOLD } from '../grade';

it('control', () => {
  const sr = 48000;
  const mix = new Float32Array(sr * 2);
  [43, 53, 59, 64].forEach((m, i) => {
    const one = pluckedString({ freq: 440 * 2 ** ((m - 69) / 12), sampleRate: sr, duration: 1.8, amplitude: 0.25, seed: 5 + i });
    const at = Math.round(i * 0.018 * sr);
    for (let k = 0; k < one.length && at + k < mix.length; k++) mix[at + k] += one[k];
  });
  const frame = computeChroma(mix.subarray(Math.round(0.15 * sr), Math.round(0.35 * sr)), sr, {});
  const ex = { type: 'play-chord' as const, prompt: 'p', chord: 'G13', frets: '3x345x', explain: 'e', alternative: { type: 'true-false' as const, statement: 's', answer: true, explain: 'e' } };
  const now = chordWaitArgs(ex).chord;
  const old = { name: 'G13', pcs: chordPcs('G13'), bass: 7 };
  console.log('threshold', PLAY_CHORD_THRESHOLD, 'new', JSON.stringify(matchChord(frame, now)), '\nold', JSON.stringify(matchChord(frame, old)));
});
