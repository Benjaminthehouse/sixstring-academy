import { describe, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { PitchDetector } from './detector';
import { addHum, addNoise, harmonicTone, mix, pluckedString } from './signals';

interface Row {
  name: string;
  errs: number[];
  gross: number;
  octave: number;
  miss: number;
  n: number;
  worst: string;
}

type Maker = (freq: number, sr: number, seed: number, midi: number) => Float32Array;

const makers: Record<string, Maker> = {
  'steady harmonic': (freq, sr, seed) => harmonicTone({ freq, sampleRate: sr, duration: 0.4, harmonics: 10, seed }),
  'clean pluck': (freq, sr, seed) => pluckedString({ freq, sampleRate: sr, duration: 0.4, seed }),
  'weak fundamental': (freq, sr, seed) =>
    pluckedString({ freq, sampleRate: sr, duration: 0.4, seed, highpassHz: 220, highpassOrder: 4, fundamentalGain: 0.3 }),
  'noise 20 dB': (freq, sr, seed) => addNoise(pluckedString({ freq, sampleRate: sr, duration: 0.4, seed }), 20, seed + 5),
  'inharmonic 1e-4': (freq, sr, seed) => pluckedString({ freq, sampleRate: sr, duration: 0.4, seed, inharmonicity: 1e-4 }),
  'hum -20 dB': (freq, sr, seed) => {
    const x = pluckedString({ freq, sampleRate: sr, duration: 0.4, seed });
    let s = 0;
    for (const v of x) s += v * v;
    return addHum(x, sr, { freq: 50, rms: Math.sqrt(s / x.length) * 0.1 });
  },
  'sympathetic -18 dB': (freq, sr, seed, midi) => {
    const x = pluckedString({ freq, sampleRate: sr, duration: 0.4, seed });
    const open = [40, 45, 50, 55, 59, 64];
    const other = open[(midi + seed) % 6];
    const y = pluckedString({ freq: midiToFreq(other) * 1.002, sampleRate: sr, duration: 0.4, seed: seed + 9, attackMs: 40, decay: 0.8 });
    return mix(x, y, 0, 0.126);
  },
  'laptop mic (all)': (freq, sr, seed, midi) => {
    const x = pluckedString({
      freq, sampleRate: sr, duration: 0.4, seed, highpassHz: 220, highpassOrder: 4, fundamentalGain: 0.3,
      inharmonicity: 8e-5, driftCents: 8, driftMs: 40, attackNoise: 0.3,
    });
    const open = [40, 45, 50, 55, 59, 64];
    const other = open[(midi + seed) % 6];
    const y = pluckedString({ freq: midiToFreq(other) * 1.002, sampleRate: sr, duration: 0.4, seed: seed + 9, attackMs: 40, decay: 0.8, highpassHz: 220, highpassOrder: 4 });
    let s = 0;
    for (const v of x) s += v * v;
    const rms = Math.sqrt(s / x.length);
    return addNoise(addHum(mix(x, y, 0, 0.1), sr, { freq: 50, rms: rms * 0.05 }), 20, seed + 5);
  },
};

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function run(name: string, maker: Maker, sr: number, minFreq: number, lo: number, hi: number, useHint: boolean): Row {
  const det = new PitchDetector({ sampleRate: sr, minFreq });
  const row: Row = { name: `${name} @${sr / 1000}k min${minFreq}${useHint ? ' hint' : ''}`, errs: [], gross: 0, octave: 0, miss: 0, n: 0, worst: '' };
  let worstErr = 0;
  let seed = 1;
  for (let midi = lo; midi <= hi; midi++) {
    for (const det_c of [-45, -30, -15, 0, 15, 30, 45]) {
      const freq = midiToFreq(midi) * Math.pow(2, det_c / 1200);
      const x = maker(freq, sr, seed++, midi);
      let hint = 0;
      for (const t of [0.2, 0.26, 0.32, 0.38]) {
        const end = Math.round(t * sr);
        const est = det.detect(x, useHint ? hint : 0, end);
        row.n++;
        if (est.freq <= 0 || est.clarity < 0.8) {
          row.miss++;
          hint = 0;
          continue;
        }
        hint = est.freq;
        const err = 1200 * Math.log2(est.freq / freq);
        if (Math.abs(err) > 50) {
          row.gross++;
          const k = Math.abs(err) / 1200;
          if (Math.abs(k - Math.round(k)) < 0.06 && Math.round(k) >= 1) row.octave++;
          if (row.gross < 4) row.worst += ` [midi ${midi}${det_c >= 0 ? '+' : ''}${det_c} t${t}: ${err.toFixed(0)}c cl ${est.clarity.toFixed(2)}]`;
        } else {
          row.errs.push(Math.abs(err));
          if (Math.abs(err) > worstErr) {
            worstErr = Math.abs(err);
          }
        }
      }
    }
  }
  return row;
}

function fmt(r: Row): string {
  const s = [...r.errs].sort((a, b) => a - b);
  return `${r.name.padEnd(40)} n=${String(r.n).padStart(5)} med=${pct(s, 0.5).toFixed(3)} p95=${pct(s, 0.95).toFixed(3)} max=${(s[s.length - 1] ?? NaN).toFixed(3)} gross=${((100 * r.gross) / r.n).toFixed(2)}% oct=${((100 * r.octave) / r.n).toFixed(2)}% miss=${((100 * r.miss) / r.n).toFixed(2)}%${r.worst}`;
}

describe('scratch accuracy', () => {
  it('sweeps', () => {
    const lines: string[] = [];
    const t0 = performance.now();
    for (const [name, maker] of Object.entries(makers)) {
      lines.push(fmt(run(name, maker, 44100, 30, 28, 88, false)));
      lines.push(fmt(run(name, maker, 48000, 60, 36, 88, false)));
      lines.push(fmt(run(name, maker, 44100, 60, 36, 88, true)));
    }
    console.log(lines.join('\n') + `\n${(performance.now() - t0).toFixed(0)} ms`);
  }, 300_000);
});
