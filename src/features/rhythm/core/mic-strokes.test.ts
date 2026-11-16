/**
 * What a play-along round through the microphone can hear: four bars of every library pattern,
 * strummed by the audio engine's guitar the way the round itself plays it (a downstroke on all
 * six strings of Em, an upstroke on the top four, lighter), with a little room noise, through the
 * pitch module's onset detector.
 */
import { describe, expect, it } from 'vitest';
import { renderSequence, strumPlan, type SequenceNote } from '@/core/audio';
import { addNoise, detectOnsets } from '@/core/pitch';
import { meterInfo } from './meter';
import { quietUpstroke, STRUM_PATTERNS, strokes } from './strum';

const EM = { midi: [40, 47, 52, 55, 59, 64], strings: [6, 5, 4, 3, 2, 1] };

describe('every stroke of every library pattern through the microphone', () => {
  it('is heard, including the quick upstroke after a ringing downstroke, and nothing else is', () => {
    const sr = 44100;
    let quiet = 0;
    let quietHeard = 0;
    let other = 0;
    let otherHeard = 0;
    let extra = 0;
    let worstMs = 0;
    for (const p of STRUM_PATTERNS) {
      const meter = meterInfo(p.meter);
      const secPerTick = 60 / p.bpm / meter.tempoBeatTicks;
      const slotSeconds = (p.grid === 'sixteenth' ? 240 : 480) * secPerTick;
      const notes: SequenceNote[] = [];
      const targets: Array<{ t: number; quiet: boolean }> = [];
      for (let bar = 0; bar < 4; bar++) {
        for (const s of strokes(p)) {
          if (s.kind === 'ghost') continue;
          const t = 0.5 + (bar * meter.barTicks + s.playTick) * secPerTick;
          const up = s.dir === 'U';
          const from = up ? 2 : 0;
          const muted = s.kind === 'mute';
          // As `engine/sounds.ts` plays a stroke.
          const plan = strumPlan(EM.midi.slice(from), {
            direction: up ? 'up' : 'down',
            velocity: s.kind === 'accent' ? 1 : muted ? 0.72 : up ? 0.56 : 0.76,
            spread: Math.min(up ? 0.014 : 0.02, slotSeconds * 0.2),
            strings: EM.strings.slice(from),
            align: 'start',
          });
          for (const n of plan) {
            notes.push({ time: t + n.offset, midi: n.midi, velocity: n.velocity, string: n.string, direction: n.direction, articulation: muted ? 'dead' : 'normal', duration: muted ? 0.08 : p.staccato ? Math.min(0.14, slotSeconds * 0.8) : undefined });
          }
          targets.push({ t, quiet: quietUpstroke(p, s) });
        }
      }
      const x = addNoise(renderSequence(notes, { sampleRate: sr, tail: 1.5, tone: 'steel' }), 40, p.bpm);
      const onsets = detectOnsets(x, sr).map((o) => o.time);
      const used = new Set<number>();
      for (const target of targets) {
        const i = onsets.findIndex((o, k) => !used.has(k) && Math.abs(o - target.t) < 0.03);
        if (i >= 0) {
          used.add(i);
          worstMs = Math.max(worstMs, Math.abs(onsets[i] - target.t) * 1000);
        }
        if (target.quiet) {
          quiet++;
          if (i >= 0) quietHeard++;
        } else {
          other++;
          if (i >= 0) otherHeard++;
        }
      }
      extra += onsets.length - used.size;
    }
    process.stdout.write(`\nLibrary patterns through the microphone: quick upstrokes ${quietHeard}/${quiet}, other strokes ${otherHeard}/${other}, extra ${extra}, worst ${worstMs.toFixed(1)} ms\n`);
    expect(quiet).toBeGreaterThan(60);
    expect(quietHeard).toBe(quiet);
    expect(otherHeard).toBe(other);
    expect(extra).toBe(0);
    // (The same bound as the onset tests: a muted "chuck" is placed a little late.)
    expect(worstMs).toBeLessThan(15);
  }, 120_000);
});
