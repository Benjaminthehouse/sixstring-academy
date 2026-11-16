import { it } from 'vitest';
import { renderSequence, strumPlan, type SequenceNote } from '@/core/audio';
import { detectOnsets, whiteNoise } from '@/core/pitch';
import { meterInfo } from './meter';
import { STRUM_PATTERNS, quietUpstroke, strokes } from './strum';

const EM = { midi: [40, 47, 52, 55, 59, 64], strings: [6, 5, 4, 3, 2, 1] };

it('measures', () => {
  const sr = 44100;
  let qFound = 0, qTotal = 0, oFound = 0, oTotal = 0, extra = 0;
  const missedBy: Record<string, number> = {};
  const errs: number[] = [];
  for (const p of STRUM_PATTERNS) {
    const meter = meterInfo(p.meter);
    const secPerTick = 60 / p.bpm / meter.tempoBeatTicks;
    const list = strokes(p).filter((s) => s.kind !== 'ghost');
    const notes: SequenceNote[] = [];
    const targets: Array<{ t: number; quiet: boolean }> = [];
    const lead = 0.5;
    for (let bar = 0; bar < 4; bar++) {
      for (const s of list) {
        const t = lead + (bar * meter.barTicks + s.playTick) * secPerTick;
        const up = s.dir === 'U';
        const from = up ? 2 : 0;
        const muted = s.kind === 'mute';
        const slotSeconds = (p.grid === 'sixteenth' ? 240 : 480) * secPerTick;
        const plan = strumPlan(EM.midi.slice(from), {
          direction: up ? 'up' : 'down',
          velocity: s.kind === 'accent' ? 1 : muted ? 0.72 : up ? 0.56 : 0.76,
          spread: Math.min(up ? 0.014 : 0.02, slotSeconds * 0.2),
          strings: EM.strings.slice(from),
          align: 'start',
        });
        for (const n of plan) notes.push({ time: t + n.offset, midi: n.midi, velocity: n.velocity, string: n.string, direction: n.direction, articulation: muted ? 'dead' : 'normal', duration: muted ? 0.08 : p.staccato ? Math.min(0.14, slotSeconds * 0.8) : undefined });
        targets.push({ t, quiet: quietUpstroke(p, s) });
      }
    }
    const x = renderSequence(notes, { sampleRate: sr, tail: 1.5, tone: 'steel' });
    const on = detectOnsets(x, sr, process.env.THR ? { fluxThreshold: Number(process.env.THR) } : {}).map((o) => o.time);
    const used = new Set<number>();
    for (const tg of targets) {
      const i = on.findIndex((o, k) => !used.has(k) && Math.abs(o - tg.t) < 0.03);
      if (i >= 0) used.add(i);
      if (i >= 0 && tg.quiet) errs.push((on[i] - tg.t) * 1000);
      if (tg.quiet) { qTotal++; if (i >= 0) qFound++; else missedBy[p.id] = (missedBy[p.id] ?? 0) + 1; }
      else { oTotal++; if (i >= 0) oFound++; else missedBy[p.id + '*'] = (missedBy[p.id + '*'] ?? 0) + 1; }
    }
    extra += on.length - used.size;
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b); const srt = [...errs].sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ qFound, qTotal, oFound, oTotal, extra, missedBy, med: srt[srt.length >> 1], p95: abs[Math.floor(abs.length * 0.95)], max: abs[abs.length - 1] }) + "\n");
  let fa = 0;
  for (const [lvl, seed] of [[0.1, 11], [0.03, 12], [0.01, 13], [0.003, 15]] as const) { const n = whiteNoise(60 * sr, lvl, seed); fa += detectOnsets(n, sr).filter((o) => o.time > 0.1).length; const pk = whiteNoise(60 * sr, lvl, seed + 5); let acc = 0; for (let i = 0; i < pk.length; i++) { acc = 0.98 * acc + pk[i]; pk[i] = acc * 0.2; } fa += detectOnsets(pk, sr).filter((o) => o.time > 0.1).length; }
  process.stdout.write(`noise FA in 480 s: ${fa}\n`);
}, 120000);
