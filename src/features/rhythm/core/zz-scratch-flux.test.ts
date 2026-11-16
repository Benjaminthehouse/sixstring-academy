import { it } from 'vitest';
import { renderSequence, strumPlan, type SequenceNote } from '@/core/audio';
import { detectOnsets, fftPlan, hannWindow } from '@/core/pitch';
import { addNoise, addHum, harmonicTone, mix, pluckedString, silence, strum, whiteNoise } from '@/core/pitch';
import { meterInfo } from './meter';
import { STRUM_PATTERNS, quietUpstroke, strokes } from './strum';

const EM = { midi: [40, 47, 52, 55, 59, 64], strings: [6, 5, 4, 3, 2, 1] };
const P = { thr: Number(process.env.THR ?? 0.85), rise: Number(process.env.RISE ?? 0), eps: Number(process.env.EPS ?? 1e-4), L: Number(process.env.L ?? 2), back: Number(process.env.BACK ?? 20) };

function fluxOnsets(x: Float32Array, sr: number): number[] {
  const N = 512;
  const hop = Math.round(sr / 350);
  const fft = fftPlan(N);
  const w = hannWindow(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const k0 = Math.ceil((1000 * N) / sr);
  const k1 = Math.min(N / 2 - 1, Math.floor((8000 * N) / sr));
  const mags: Float64Array[] = [];
  const E: number[] = [];
  const peaks: number[] = [];
  const out: number[] = [];
  let last = -1;
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft.forward(re, im);
    const m = new Float64Array(k1 - k0 + 1);
    let pk = 0;
    for (let k = 1; k < N / 2; k++) pk = Math.max(pk, Math.hypot(re[k], im[k]));
    peaks.push(pk);
    let e = 0;
    for (let k = k0; k <= k1; k++) { m[k - k0] = Math.hypot(re[k], im[k]); e += m[k - k0] ** 2; }
    mags.push(m);
    E.push(e);
    const j = mags.length - 1;
    const prev = mags[j - P.L];
    if (!prev || j < P.back + P.L) continue;
    let lf = 0;
    const eps = P.eps;
    for (let k = 0; k < m.length; k++) lf += Math.max(0, Math.log((eps + m[k]) / (eps + prev[k])));
    lf /= m.length;
    let mx = 0;
    if (P.back > 0) { for (let b = j - P.L; b >= j - P.L - P.back; b--) mx = Math.max(mx, E[b]); } else mx = E[j - P.L];
    const rise = 10 * Math.log10((e + 1e-12) / (mx + 1e-12));
    const t = (s + N) / sr;
    if (lf >= P.thr && rise >= P.rise && e / N > 1e-7 && j - last > 20) { out.push(t - (N * 0.75) / sr); last = j; }
  }
  return out;
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

it('flux', () => {
  const sr = 44100;
  let qFound = 0, qTotal = 0, oFound = 0, oTotal = 0, extra = 0, fluxExtra = 0;
  const errs: number[] = [];
  for (const p of STRUM_PATTERNS) {
    const meter = meterInfo(p.meter);
    const secPerTick = 60 / p.bpm / meter.tempoBeatTicks;
    const list = strokes(p).filter((s) => s.kind !== 'ghost');
    const notes: SequenceNote[] = [];
    const targets: Array<{ t: number; quiet: boolean }> = [];
    for (let bar = 0; bar < 4; bar++) {
      for (const s of list) {
        const t = 0.5 + (bar * meter.barTicks + s.playTick) * secPerTick;
        const up = s.dir === 'U';
        const from = up ? 2 : 0;
        const muted = s.kind === 'mute';
        const slotSeconds = (p.grid === 'sixteenth' ? 240 : 480) * secPerTick;
        const plan = strumPlan(EM.midi.slice(from), { direction: up ? 'up' : 'down', velocity: s.kind === 'accent' ? 1 : muted ? 0.72 : up ? 0.56 : 0.76, spread: Math.min(up ? 0.014 : 0.02, slotSeconds * 0.2), strings: EM.strings.slice(from), align: 'start' });
        for (const n of plan) notes.push({ time: t + n.offset, midi: n.midi, velocity: n.velocity, string: n.string, direction: n.direction, articulation: muted ? 'dead' : 'normal', duration: muted ? 0.08 : p.staccato ? Math.min(0.14, slotSeconds * 0.8) : undefined });
        targets.push({ t, quiet: quietUpstroke(p, s) });
      }
    }
    const x = addNoise(renderSequence(notes, { sampleRate: sr, tail: 1.5, tone: 'steel' }), 40, 3);
    const base = detectOnsets(x, sr).map((o) => o.time);
    const flux = fluxOnsets(x, sr);
    // union, 60 ms merge, base preferred
    const all = [...base];
    for (const f of flux) if (all.every((b) => Math.abs(b - f) > 0.06)) all.push(f);
    all.sort((a, b) => a - b);
    const used = new Set<number>();
    for (const tg of targets) {
      const i = all.findIndex((o, k) => !used.has(k) && Math.abs(o - tg.t) < 0.03);
      if (i >= 0) { used.add(i); if (!base.includes(all[i])) errs.push((all[i] - tg.t) * 1000); }
      if (tg.quiet) { qTotal++; if (i >= 0) qFound++; } else { oTotal++; if (i >= 0) oFound++; }
    }
    extra += all.length - used.size;
    fluxExtra += flux.filter((f) => targets.every((tg) => Math.abs(tg.t - f) > 0.03)).length;
  }
  const sigs: Array<[string, Float32Array]> = [];
  for (const midi of [40, 43, 45, 50, 55, 59, 64, 69, 76]) for (const seed of [1, 2, 3]) {
    sigs.push([`s${midi}`, pluckedString({ freq: 440 * Math.pow(2, (midi - 69) / 12), sampleRate: sr, duration: 3, decay: 0.5 + seed * 0.4, decayTilt: 0.004 * seed, rolloff: 0.5 + 0.25 * seed, seed, attackNoise: 0.3 })]);
    sigs.push([`n${midi}`, addNoise(pluckedString({ freq: 440 * Math.pow(2, (midi - 69) / 12), sampleRate: sr, duration: 3, seed, highpassHz: 200, highpassOrder: 3, attackNoise: 0.3 }), 30, seed)]);
  }
  sigs.push(['beat', mix(harmonicTone({ freq: 196, sampleRate: sr, duration: 4, harmonics: 5 }), harmonicTone({ freq: 199, sampleRate: sr, duration: 4, harmonics: 5, seed: 3 }))]);
  sigs.push(['loudnoise', whiteNoise(4 * sr, 0.05, 3)]);
  sigs.push(['quietnoise', whiteNoise(4 * sr, 0.003, 4)]);
  sigs.push(['hum', addHum(silence(4, sr), sr, { rms: 0.01 })]);
  sigs.push(['E', strum({ freqs: [82.4, 123.5, 164.8, 207.7, 246.9, 329.6], sampleRate: sr, duration: 4, decay: 0.7 })]);
  if (process.env.LONG) {
    for (const [lvl, seed] of [[0.05, 11], [0.01, 12], [0.002, 13]] as const) sigs.push([`white${lvl}`, whiteNoise(60 * sr, lvl, seed)]);
    // pink-ish: integrate white
    const pk = whiteNoise(60 * sr, 0.05, 14); let acc = 0; for (let i = 0; i < pk.length; i++) { acc = 0.995 * acc + pk[i]; pk[i] = acc * 0.1; }
    sigs.push(['brown', pk]);
  }
  sigs.push(['Am', strum({ freqs: [110, 164.8, 220, 261.6, 329.6], sampleRate: sr, duration: 4, decay: 0.5, seed: 4 })]);
  const fa: string[] = [];
  for (const [name, x] of sigs) {
    const f = fluxOnsets(x, sr).filter((t) => t > 0.08);
    if (f.length) fa.push(`${name}:${f.length}`);
  }
  const abs = errs.map(Math.abs);
  process.stdout.write(`${JSON.stringify(P)} quiet ${qFound}/${qTotal} other ${oFound}/${oTotal} extra ${extra} fluxExtra ${fluxExtra} err med ${q(errs, 0.5)?.toFixed(1)} p95abs ${q(abs, 0.95)?.toFixed(1)} max ${q(abs, 1)?.toFixed(1)} FA ${fa.length} ${fa.slice(0, 8).join(' ')}\n`);
}, 300000);
