import { describe, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { PitchDetector } from './detector';
import { addHum, harmonicTone, mix, pluckedString, rmsOf } from './signals';

describe('scratch debug', () => {
  it('worst cases', () => {
    const sr = 44100;
    const det = new PitchDetector({ sampleRate: sr, minFreq: 30 });
    const out: string[] = [];
    const open = [40, 45, 50, 55, 59, 64];
    for (const cond of ['steady', 'hum', 'symp']) {
      const rows: { e: number; s: string }[] = [];
      let seed = 1;
      for (let midi = 28; midi <= 88; midi++) {
        for (const dc of [-45, -30, -15, 0, 15, 30, 45]) {
          const freq = midiToFreq(midi) * Math.pow(2, dc / 1200);
          seed++;
          let x: Float32Array;
          let other = 0;
          if (cond === 'steady') x = harmonicTone({ freq, sampleRate: sr, duration: 0.4, harmonics: 10, seed });
          else if (cond === 'hum') {
            x = pluckedString({ freq, sampleRate: sr, duration: 0.4, seed });
            x = addHum(x, sr, { freq: 50, rms: rmsOf(x) * 0.1 });
          } else {
            x = pluckedString({ freq, sampleRate: sr, duration: 0.4, seed });
            other = open[(midi + seed) % 6];
            const y = pluckedString({ freq: midiToFreq(other) * 1.002, sampleRate: sr, duration: 0.4, seed: seed + 9, attackMs: 40, decay: 0.8 });
            x = mix(x, y, 0, 0.126);
          }
          for (const t of [0.2, 0.26, 0.32, 0.38]) {
            const est = det.detect(x, 0, Math.round(t * sr));
            const err = 1200 * Math.log2(est.freq / freq);
            rows.push({ e: Math.abs(err), s: `${cond} midi ${midi}${dc >= 0 ? '+' : ''}${dc} other ${other} t${t} err ${err.toFixed(2)} cl ${est.clarity.toFixed(3)} win ${est.window}` });
          }
        }
      }
      rows.sort((a, b) => b.e - a.e);
      out.push(...rows.slice(0, 14).map((r) => r.s));
    }
    console.log(out.join('\n'));
  }, 300_000);
});
