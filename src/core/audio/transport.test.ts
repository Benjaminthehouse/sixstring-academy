import { describe, expect, it } from 'vitest';
import { PPQ } from './timeline';
import { Transport, beatTempo, type BeatEvent, type TransportClock } from './transport';

/** A hand-cranked audio clock. */
class FakeClock implements TransportClock {
  t = 0;
  latency = 0;
  now(): number {
    return this.t;
  }
  soundingNow(): number {
    return this.t - this.latency;
  }
}

function make(opts: { bpm?: number; ts?: string } = {}): { tr: Transport; clock: FakeClock; run: (until: number, step?: number) => void } {
  const clock = new FakeClock();
  const tr = new Transport({ clock, timer: 'manual', bpm: opts.bpm ?? 120, timeSignature: opts.ts, lookahead: 0.1, startDelay: 0.05 });
  const run = (until: number, step = 0.02): void => {
    while (clock.t < until - 1e-9) {
      clock.t = Math.min(until, clock.t + step);
      tr.process();
      tr.flushVisual();
    }
  };
  return { tr, clock, run };
}

describe('transport: scheduling on the clock', () => {
  it('fires beats at exact audio times, each once', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(3);
    // Start delay 0.05 s, then a beat every 0.5 s; at t = 3 the look-ahead reaches 3.1 s.
    expect(beats.length).toBe(7);
    beats.forEach((b, i) => {
      expect(b.time).toBeCloseTo(0.05 + i * 0.5, 9);
      expect(b.tick).toBe(i * 960);
      expect(b.bar).toBe(Math.floor(i / 4));
      expect(b.beat).toBe(i % 4);
      expect(b.downbeat).toBe(i % 4 === 0);
      expect(b.countIn).toBe(false);
      expect(b.bpm).toBe(120);
      expect(b.seconds).toBeCloseTo(0.5, 9);
    });
    expect(beats[0].accent).toBe(3);
    expect(beats[1].accent).toBe(1);
  });

  it('never schedules in the past and never later than the look-ahead', () => {
    const { tr, clock, run } = make({ bpm: 200 });
    const lead: number[] = [];
    tr.scheduleRepeat((time) => lead.push(time - clock.now()), 120);
    tr.start();
    run(4, 0.013);
    expect(lead.length).toBeGreaterThan(100);
    expect(Math.min(...lead)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...lead)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('timing does not depend on how often the scheduler wakes up', () => {
    const times = (step: number): number[] => {
      const { tr, run } = make({ bpm: 93 });
      const out: number[] = [];
      tr.scheduleRepeat((time) => out.push(time), 240);
      tr.start();
      run(5, step);
      return out;
    };
    const a = times(0.005), b = times(0.09);
    const n = Math.min(a.length, b.length);
    expect(n).toBeGreaterThan(25);
    for (let i = 0; i < n; i++) expect(a[i]).toBeCloseTo(b[i], 9);
  });

  it('schedule, scheduleRepeat and addPart deliver in tick order with exact times', () => {
    const { tr, run } = make({ bpm: 60 });
    const log: Array<[string, number, number]> = [];
    tr.schedule({ bar: 0, beat: 2 }, (time, tick) => log.push(['once', tick, time]));
    tr.scheduleRepeat((time, tick) => log.push(['rep', tick, time]), 960, 480, 480 + 960 * 3);
    tr.addPart([{ tick: 1000, n: 'b' }, { tick: 10, n: 'a' }, { tick: 1920, n: 'c' }], (time, ev) => log.push([ev.n, ev.tick, time]));
    tr.start();
    run(4);
    expect(log.map((l) => l[0])).toEqual(['a', 'rep', 'b', 'rep', 'once', 'c', 'rep']);
    for (const [, tick, time] of log) expect(time).toBeCloseTo(0.05 + tick / 960, 9);
    const id = tr.schedule(3840, () => log.push(['late', 0, 0]));
    tr.clear(id);
    run(6);
    expect(log.some((l) => l[0] === 'late')).toBe(false);
  });

  it('reports bar events before the beats of that bar', () => {
    const { tr, run } = make({ bpm: 240, ts: '3/4' });
    const order: string[] = [];
    tr.on('bar', (e) => order.push(`bar${e.bar}`));
    tr.on('beat', (e) => order.push(`b${e.bar}.${e.beat}`));
    tr.start();
    run(1.6);
    expect(order.slice(0, 8)).toEqual(['bar0', 'b0.0', 'b0.1', 'b0.2', 'bar1', 'b1.0', 'b1.1', 'b1.2']);
  });
});

describe('transport: tempo', () => {
  it('a tempo change takes effect within the look-ahead and keeps the beat grid continuous', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(1.0);
    tr.setTempo(60);
    run(4);
    // Beats 0..2 at 120 (0.05, 0.55, 1.05); the change lands at the scheduling frontier (~1.1 s),
    // so beat 3 comes a little later than 1.55 and every beat after that is 1 s apart.
    expect(beats[2].time).toBeCloseTo(1.05, 9);
    expect(beats[3].time).toBeGreaterThan(1.55);
    expect(beats[3].time).toBeLessThan(2.05);
    expect(beats[4].time - beats[3].time).toBeCloseTo(1, 9);
    expect(beats[5].time - beats[4].time).toBeCloseTo(1, 9);
    expect(beats[4].bpm).toBe(60);
    expect(tr.bpm).toBe(60);
  });

  it('a change made inside a callback applies exactly at that tick', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('bar', (e) => {
      if (e.bar === 1) tr.setTempo(240);
    });
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(4);
    // Bar 0: four beats at 0.5 s. Bar 1 starts at 2.05 s and its beats are 0.25 s apart.
    expect(beats[4].time).toBeCloseTo(2.05, 9);
    expect(beats[5].time).toBeCloseTo(2.3, 9);
    expect(beats[6].time).toBeCloseTo(2.55, 9);
    expect(beats.filter((b) => b.tick === 3840).length).toBe(1);
  });

  it('ramps the tempo over a number of beats', () => {
    const { tr, run } = make({ bpm: 60 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.setTempo(120, { rampBeats: 4 });
    tr.start();
    run(6);
    const gaps = beats.slice(1).map((b, i) => b.time - beats[i].time);
    // Each beat of the ramp is shorter than the one before; afterwards they are 0.5 s.
    expect(gaps[0]).toBeLessThan(1);
    for (let i = 1; i < 4; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    expect(gaps[4]).toBeCloseTo(0.5, 9);
    expect(gaps[0] + gaps[1] + gaps[2] + gaps[3]).toBeCloseTo((60 / PPQ) * Math.log(2) / (60 / 3840), 9);
  });

  it('tempo scale plays a tempo map slower without changing it', () => {
    const { tr, run } = make();
    tr.setTempoMap([{ tick: 0, bpm: 120 }, { tick: 1920, bpm: 60 }]);
    tr.setTempoScale(0.5);
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(8);
    expect(beats[1].time - beats[0].time).toBeCloseTo(1, 9);
    expect(beats[3].time - beats[2].time).toBeCloseTo(2, 9);
    expect(beats[3].bpm).toBe(30);
    expect(tr.tempoScale).toBe(0.5);
  });

  it('swing delays the off-beats that are scheduled', () => {
    const { tr, run } = make({ bpm: 120 });
    tr.setSwing(2 / 3);
    const times: number[] = [];
    tr.scheduleRepeat((time) => times.push(time), 480);
    tr.start();
    run(1.5);
    expect(times[0]).toBeCloseTo(0.05, 9);
    expect(times[1]).toBeCloseTo(0.05 + 0.5 * (2 / 3), 9);
    expect(times[2]).toBeCloseTo(0.55, 9);
    expect(times[3]).toBeCloseTo(0.55 + 0.5 * (2 / 3), 9);
  });

  it('converts a quarter-note tempo to the meter beat', () => {
    expect(beatTempo(90, '6/8')).toBe(60);
    expect(beatTempo(120, '4/4')).toBe(120);
  });
});

describe('transport: loop, count-in, seek, pause, end', () => {
  it('wraps the loop exactly and plays loop events once per pass', () => {
    const { tr, run } = make({ bpm: 120 });
    const hits: Array<[number, number]> = [];
    const loops: number[] = [];
    tr.addPart([{ tick: 0 }, { tick: 960 }, { tick: 1900 }], (time, ev) => hits.push([ev.tick, time]));
    tr.on('loop', (e) => loops.push(e.time));
    tr.setLoop(0, 1920);
    tr.start();
    run(3.2);
    // Loop length = 1 s.
    expect(loops.map((t) => +t.toFixed(9))).toEqual([1.05, 2.05, 3.05]);
    expect(hits.slice(0, 7).map((h) => h[0])).toEqual([0, 960, 1900, 0, 960, 1900, 0]);
    expect(hits[3][1]).toBeCloseTo(1.05, 9);
    expect(hits[4][1]).toBeCloseTo(1.55, 9);
    expect(hits[5][1]).toBeCloseTo(1.05 + 1900 / 1920, 9);
    expect(tr.loopCount).toBe(3);
    expect(tr.loop).toEqual({ start: 0, end: 1920 });
  });

  it('a loop in the middle of the piece jumps back to its start', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.setLoop({ bar: 1 }, { bar: 2 });
    tr.start();
    run(6.2);
    expect(beats.slice(0, 13).map((b) => b.bar)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    beats.forEach((b, i) => expect(b.time).toBeCloseTo(0.05 + i * 0.5, 9));
    tr.clearLoop();
    run(9);
    expect(beats[beats.length - 1].bar).toBeGreaterThan(1);
  });

  it('counts in before the first bar', () => {
    const { tr, clock, run } = make({ bpm: 120, ts: '3/4' });
    const beats: BeatEvent[] = [];
    const notes: number[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.schedule(0, (time) => notes.push(time));
    tr.countInBars = 2;
    tr.start();
    run(1.0);
    const during = tr.position();
    expect(during.countIn).not.toBeNull();
    expect(during.countIn!.bars).toBe(2);
    expect(during.countIn!.bar).toBe(0);
    expect(during.countIn!.beat).toBe(1);
    expect(during.absTick).toBe(0);
    run(5);
    const countIn = beats.filter((b) => b.countIn);
    expect(countIn.length).toBe(6);
    expect(countIn.map((b) => b.bar)).toEqual([-2, -2, -2, -1, -1, -1]);
    expect(countIn.map((b) => b.beat)).toEqual([0, 1, 2, 0, 1, 2]);
    countIn.forEach((b, i) => expect(b.time).toBeCloseTo(0.05 + i * 0.5, 9));
    // The music starts right after the count-in, on the grid.
    expect(notes).toEqual([expect.closeTo(3.05, 9)]);
    const first = beats.find((b) => !b.countIn)!;
    expect(first.time).toBeCloseTo(3.05, 9);
    expect(first.bar).toBe(0);
    expect(tr.position(clock.now()).countIn).toBeNull();
  });

  it('position follows the sounding time, compensating latency', () => {
    const { tr, clock, run } = make({ bpm: 120 });
    clock.latency = 0.1;
    tr.start();
    run(2.05);
    // Scheduling time 2.05 s -> tick 3840; what is heard is 0.1 s earlier.
    expect(tr.tickAt(2.05)).toBeCloseTo(3840, 6);
    const p = tr.position();
    expect(p.absTick).toBeCloseTo(3840 - 192, 6);
    expect(p.bar).toBe(0);
    expect(p.beat).toBe(3);
    expect(p.beatProgress).toBeCloseTo(0.8, 6);
    expect(p.state).toBe('playing');
    expect(tr.timeAt(3840 * 2)).toBeCloseTo(4.05, 9);
  });

  it('visual callbacks fire when the beat is heard, not when it is scheduled', () => {
    const { tr, clock, run } = make({ bpm: 120 });
    clock.latency = 0.05;
    const seen: Array<[number, number]> = [];
    tr.onVisual('beat', (e) => seen.push([e.time, clock.soundingNow()]));
    tr.start();
    run(2, 0.004);
    expect(seen.length).toBe(4);
    for (const [time, heardAt] of seen) {
      expect(heardAt).toBeGreaterThanOrEqual(time - 0.009);
      expect(heardAt).toBeLessThan(time + 0.01);
    }
  });

  it('pause keeps the place, stop returns to the start, seek jumps', () => {
    const { tr, clock, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(1.3);
    tr.pause();
    expect(tr.state).toBe('paused');
    const pausedAt = tr.position().absTick;
    expect(pausedAt).toBeCloseTo((1.3 - 0.05) * 1920, 6);
    const before = beats.length;
    run(3);
    expect(beats.length).toBe(before);
    tr.start();
    run(3.6);
    // Resumed at 3.05 s from tick 2400: the next beat (tick 2880) is 0.25 s later.
    const next = beats[before];
    expect(next.tick).toBe(2880);
    expect(next.time).toBeCloseTo(3.05 + 0.25, 9);
    tr.stop();
    expect(tr.state).toBe('stopped');
    expect(tr.position().absTick).toBeCloseTo(pausedAt, 6);
    tr.seek({ bar: 4 });
    expect(tr.position().bar).toBe(4);
    tr.start();
    run(clock.t + 0.3);
    expect(beats[beats.length - 1].bar).toBe(4);
    tr.seek(0);
    run(clock.t + 0.3);
    expect(beats[beats.length - 1].bar).toBe(0);
  });

  it('stops by itself at the end and says so', () => {
    const { tr, run } = make({ bpm: 120 });
    const events: string[] = [];
    tr.on('end', (e) => events.push(`end@${e.time.toFixed(2)}`));
    tr.on('stop', () => events.push('stop'));
    let count = 0;
    tr.scheduleRepeat(() => count++, 960);
    tr.setEnd({ bar: 1 });
    tr.start();
    run(4);
    expect(count).toBe(4);
    expect(events).toEqual(['end@2.05', 'stop']);
    expect(tr.state).toBe('stopped');
    expect(tr.position().bar).toBe(1);
  });

  it('slips time instead of firing a burst after a long freeze', () => {
    const { tr, clock, run } = make({ bpm: 120 });
    const times: number[] = [];
    tr.on('beat', (e) => times.push(e.time));
    tr.start();
    run(1);
    const before = times.length;
    clock.t = 6; // the tab was frozen for five seconds
    tr.process();
    const fresh = times.slice(before);
    expect(fresh.length).toBeLessThanOrEqual(1);
    for (const t of fresh) expect(t).toBeGreaterThanOrEqual(6);
    run(8);
    const gaps = times.slice(before + 1).map((t, i) => t - times[before + i]);
    for (const g of gaps.slice(1)) expect(g).toBeCloseTo(0.5, 9);
  });

  it('advanceTo schedules a whole passage at once (offline rendering)', () => {
    const clock = new FakeClock();
    const tr = new Transport({ clock, timer: 'manual', bpm: 120 });
    const times: number[] = [];
    tr.scheduleRepeat((time) => times.push(time), 960);
    tr.start({ at: 0 });
    tr.advanceTo(10);
    expect(times.length).toBe(20);
    expect(times[19]).toBeCloseTo(9.5, 9);
  });

  it('meter changes move the bar lines', () => {
    const { tr, run } = make({ bpm: 240 });
    tr.setMeters([{ bar: 0, timeSignature: '4/4' }, { bar: 1, timeSignature: '6/8' }]);
    const bars: Array<[number, number]> = [];
    tr.on('bar', (e) => bars.push([e.bar, e.time]));
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(3);
    expect(bars[1][1]).toBeCloseTo(0.05 + 1, 9);
    expect(bars[2][1]).toBeCloseTo(0.05 + 1 + 0.75, 9);
    expect(beats.filter((b) => b.bar === 1).map((b) => b.beatsInBar)).toEqual([2, 2]);
    expect(beats.find((b) => b.bar === 1 && b.beat === 1)!.time).toBeCloseTo(0.05 + 1 + 0.375, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Hardening: a reference model worked out here, independently of timeline.ts, and a scheduler
// that wakes up as irregularly as a busy main thread does.
// ---------------------------------------------------------------------------------------------

/** Seconds from tick 0 to `tick` through tempo points, by Simpson's rule (no closed forms). */
function refSeconds(points: ReadonlyArray<{ tick: number; bpm: number; ramp?: boolean }>, tick: number): number {
  const bpmAt = (u: number): number => {
    let i = 0;
    while (i + 1 < points.length && points[i + 1].tick <= u) i++;
    const a = points[i], b = points[i + 1];
    if (a.ramp && b && u >= a.tick) return a.bpm + ((b.bpm - a.bpm) * (u - a.tick)) / (b.tick - a.tick);
    return a.bpm;
  };
  let total = 0;
  const edges = [0, ...points.map((p) => p.tick).filter((t) => t > 0 && t < tick), tick];
  for (let s = 0; s + 1 < edges.length; s++) {
    const a = edges[s], b = edges[s + 1];
    if (b <= a) continue;
    const steps = Math.max(2, 2 * Math.ceil((b - a) / 16));
    const h = (b - a) / steps;
    let acc = 0;
    for (let k = 0; k <= steps; k++) {
      // Just inside the segment at its ends, so a step change is not straddled.
      const u = k === 0 ? a + 1e-9 : k === steps ? b - 1e-9 : a + k * h;
      acc += (k === 0 || k === steps ? 1 : k % 2 ? 4 : 2) * (60 / (PPQ * bpmAt(u)));
    }
    total += (acc * h) / 3;
  }
  return total;
}

/** Deterministic pseudo-random numbers for wake-up jitter. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('transport: three minutes against an independent reference', () => {
  it('tempo ramps, steps, meter changes, swing and a loop: every event where the reference puts it, with a scheduler that wakes irregularly', () => {
    const clock = new FakeClock();
    const tr = new Transport({ clock, timer: 'manual' });
    const meters = [{ bar: 0, timeSignature: '4/4' }, { bar: 12, timeSignature: '7/8' }, { bar: 28, timeSignature: '5/4' }, { bar: 40, timeSignature: '6/8' }, { bar: 60, timeSignature: '4/4' }];
    tr.setMeters(meters);
    const B = (bar: number): number => tr.timeline.barStart(bar);
    const tempo = [
      { tick: 0, bpm: 100 },
      { tick: B(4), bpm: 100, ramp: true }, { tick: B(10), bpm: 176 },
      { tick: B(12), bpm: 176, ramp: true }, { tick: B(24), bpm: 58 },
      { tick: B(28), bpm: 138 },
      { tick: B(40), bpm: 84, ramp: true }, { tick: B(52), bpm: 160 },
      { tick: B(60), bpm: 126 },
    ];
    tr.setTempoMap(tempo);
    const log: Array<{ time: number; tick: number }> = [];
    tr.scheduleRepeat((time, tick) => log.push({ time, tick }), 240);
    let swingFrom = Infinity, swingTo = Infinity, loops = 0, lates = 0, minLead = Infinity;
    tr.on('bar', (e) => {
      if (e.bar === 60 && swingFrom === Infinity) { tr.setSwing(0.61); swingFrom = e.tick; }
      if (e.bar === 68 && swingTo === Infinity) { tr.setSwing(0.5); swingTo = e.tick; }
      if (e.bar === 70 && loops === 0) tr.setLoop({ bar: 70 }, { bar: 74 });
    });
    tr.on('loop', (e) => { loops = e.count; if (e.count === 6) tr.clearLoop(); });
    tr.on('beat', (e) => { const lead = e.time - clock.now(); minLead = Math.min(minLead, lead); if (lead < 0) lates++; });
    tr.start({ at: 0.0371 });
    tr.process(); // a transport on a timer does this itself when it starts
    const rand = lcg(12345);
    while (clock.t < 185) {
      // Wake-ups 4..60 ms apart, with a stall of up to 0.12 s now and then (inside the look-ahead).
      clock.t += 0.004 + rand() * 0.056 + (rand() < 0.02 ? rand() * 0.06 : 0);
      tr.process();
    }
    expect(log.length).toBeGreaterThan(1400);
    expect(loops).toBe(6);
    expect(lates).toBe(0);
    expect(minLead).toBeGreaterThan(0.02);

    const sec = (tick: number): number => refSeconds(tempo, tick);
    const swung = (tick: number): number => {
      if (tick < swingFrom || tick >= swingTo) return tick;
      const base = Math.floor(tick / 960) * 960, pos = tick - base;
      return pos <= 480 ? base + pos * 2 * 0.61 : base + 960 * 0.61 + (pos - 480) * 2 * (1 - 0.61);
    };
    const loopStart = B(70), loopEnd = B(74);
    let worst = 0, sum = 0, wraps = 0;
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1], b = log[i];
      let expected: number;
      if (b.tick > a.tick) expected = sec(swung(b.tick)) - sec(swung(a.tick));
      else { wraps++; expected = sec(loopEnd) - sec(a.tick) + sec(b.tick) - sec(loopStart); }
      sum += expected;
      worst = Math.max(worst, Math.abs(b.time - a.time - expected));
      // Every grid step fires exactly once, in order.
      if (b.tick > a.tick) expect(b.tick - a.tick).toBe(240);
    }
    expect(wraps).toBe(6);
    // Each gap to a fraction of a microsecond (the reference is a numerical integral), and no
    // drift at all over three minutes.
    expect(worst).toBeLessThan(2e-7);
    expect(Math.abs(log[log.length - 1].time - log[0].time - sum)).toBeLessThan(2e-6);
    expect(log[log.length - 1].time).toBeGreaterThan(180);
    expect(log[0].time).toBeCloseTo(0.0371, 12);
  });

  it('timing is identical whether the scheduler wakes every 5 ms or stalls for 150 ms', () => {
    const play = (seed: number, maxGap: number): number[] => {
      const clock = new FakeClock();
      const tr = new Transport({ clock, timer: 'manual', bpm: 173, timeSignature: '7/8' });
      const times: number[] = [];
      tr.setSwing(0.58, 'sixteenth');
      tr.scheduleRepeat((time) => times.push(time), 120);
      tr.on('bar', (e) => { if (e.bar === 6) tr.setTempo(91, { rampBeats: 9 }); });
      tr.start({ at: 0.05 });
      const rand = lcg(seed);
      while (clock.t < 30) {
        clock.t += 0.005 + rand() * maxGap;
        tr.process();
      }
      return times.filter((t) => t < 29.5);
    };
    const smooth = play(1, 0.001), rough = play(2, 0.145);
    expect(rough.length).toBe(smooth.length);
    let worst = 0;
    for (let i = 0; i < smooth.length; i++) worst = Math.max(worst, Math.abs(smooth[i] - rough[i]));
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('transport: a tempo glide belongs to the moment, not to the place', () => {
  it('glides exactly, arrives, and stays at the target', () => {
    const { tr, run } = make({ bpm: 60 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.on('bar', (e) => { if (e.bar === 1) tr.setTempo(120, { rampBeats: 4 }); });
    tr.start({ at: 0.1 });
    run(20);
    // Bar 0 at 60: beats one second apart. Bar 1 glides 60 -> 120 over four beats: beat k of it
    // starts where the integral of 60 / bpm puts it. Bar 2 onwards: half a second apart, exactly.
    const t = (bar: number, beat: number): number => beats.find((b) => b.bar === bar && b.beat === beat)!.time;
    expect(t(1, 0) - t(0, 0)).toBeCloseTo(4, 9);
    const ramp = [{ tick: 0, bpm: 60 }, { tick: 3840, bpm: 60, ramp: true }, { tick: 7680, bpm: 120 }];
    for (let k = 1; k <= 4; k++) {
      const got = (k < 4 ? t(1, k) : t(2, 0)) - t(1, 0);
      expect(Math.abs(got - (refSeconds(ramp, 3840 + k * 960) - refSeconds(ramp, 3840)))).toBeLessThan(1e-7);
    }
    for (let bar = 2; bar < 6; bar++) for (let beat = 0; beat < 3; beat++) expect(t(bar, beat + 1) - t(bar, beat)).toBeCloseTo(0.5, 9);
    expect(tr.bpm).toBeCloseTo(120, 9);
  });

  it('does not come back when the music goes back before it: loop, seek, stop and start again', () => {
    const { tr, clock, run } = make({ bpm: 60 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.setLoop({ bar: 0 }, { bar: 2 });
    tr.start({ at: 0.1 });
    run(5);
    tr.setTempo(120, { rampBeats: 2 }); // somewhere in bar 1
    run(14);
    // After the wrap the tempo is 120 everywhere, including the bars before the glide started.
    const late = beats.filter((b) => b.time > 10);
    expect(late.length).toBeGreaterThan(5);
    for (let i = 1; i < late.length; i++) expect(late[i].time - late[i - 1].time).toBeCloseTo(0.5, 9);
    expect(late.every((b) => Math.abs(b.bpm - 120) < 1e-9)).toBe(true);

    // The same with a seek back to the start in the middle of a glide.
    tr.clearLoop();
    tr.setTempo(90, { rampBeats: 8 });
    run(clock.t + 0.5);
    tr.seek(0);
    const mark = beats.length;
    run(clock.t + 4);
    const after = beats.slice(mark).filter((b) => b.tick < 960 * 8 && b.time > clock.t - 3.9);
    for (let i = 1; i < after.length; i++) if (after[i].tick > after[i - 1].tick) expect(after[i].time - after[i - 1].time).toBeCloseTo(60 / 90, 9);
    expect(tr.bpm).toBeCloseTo(90, 9);

    // And with stop / start: the playhead returns to where it began, at the new tempo.
    tr.setTempo(150, { rampBeats: 16 });
    run(clock.t + 0.3);
    tr.stop();
    expect(tr.bpm).toBeCloseTo(150, 9);
    const mark2 = beats.length;
    tr.start();
    run(clock.t + 2);
    const again = beats.slice(mark2);
    expect(again.length).toBeGreaterThan(3);
    for (let i = 1; i < again.length; i++) expect(again[i].time - again[i - 1].time).toBeCloseTo(0.4, 9);
  });

  it('a pause in the middle of a glide resumes the glide where it was', () => {
    const { tr, clock, run } = make({ bpm: 60 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start({ at: 0.1 });
    run(1.5);
    tr.setTempo(180, { rampBeats: 8 });
    run(3);
    const bpmAtPause = tr.bpm;
    tr.pause();
    expect(bpmAtPause).toBeGreaterThan(61);
    expect(bpmAtPause).toBeLessThan(180);
    clock.t += 3;
    tr.start();
    run(clock.t + 8);
    expect(tr.bpm).toBeCloseTo(180, 9);
    // Tempo only ever rises through the glide: beat lengths shrink, then settle at a third of a second.
    const lengths = beats.map((b) => b.seconds);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1] + 1e-9);
    expect(lengths[lengths.length - 1]).toBeCloseTo(1 / 3, 9);
  });
});

describe('transport: loop, seek and pause under hands that are not gentle', () => {
  it('looping bars the playhead has already passed goes there at once, on the grid', () => {
    const { tr, run } = make({ bpm: 120 });
    const log: Array<{ time: number; tick: number }> = [];
    tr.scheduleRepeat((time, tick) => log.push({ time, tick }), 480);
    tr.start({ at: 0.1 });
    run(9); // well into bar 4
    tr.setLoop({ bar: 1 }, { bar: 2 });
    run(14);
    const jump = log.findIndex((e, i) => i > 0 && e.tick < log[i - 1].tick);
    expect(jump).toBeGreaterThan(0);
    // The jump lands on the loop start, one grid step after the last event before it, and from
    // then on only the looped bar is heard.
    expect(log[jump].tick).toBe(3840);
    for (let i = 1; i < log.length; i++) expect(log[i].time - log[i - 1].time).toBeCloseTo(0.25, 9);
    expect(log.slice(jump).every((e) => e.tick >= 3840 && e.tick < 7680)).toBe(true);
    expect(tr.loopCount).toBeGreaterThanOrEqual(1);
    // A loop that lies ahead is simply entered when the music gets there.
    const b = make({ bpm: 120 });
    const ticks: number[] = [];
    b.tr.scheduleRepeat((_t, tick) => ticks.push(tick), 960);
    b.tr.start({ at: 0.1 });
    b.run(0.5);
    b.tr.setLoop({ bar: 2 }, { bar: 3 });
    b.run(10);
    expect(ticks.slice(0, 12)).toEqual([0, 960, 1920, 2880, 3840, 4800, 5760, 6720, 7680, 8640, 9600, 10560]);
    expect(ticks[12]).toBe(7680);
  });

  it('seek and pause/resume keep the grid and the place to the tick', () => {
    const { tr, clock, run } = make({ bpm: 96, ts: '6/8' });
    const log: Array<{ time: number; tick: number }> = [];
    tr.scheduleRepeat((time, tick) => log.push({ time, tick }), 240);
    let seekAt = 0;
    tr.on('seek', (e) => { seekAt = e.time; });
    tr.start({ at: 0.1 });
    run(3.21);
    tr.seek({ bar: 7, beat: 1 });
    const mark = log.length;
    run(5.07);
    const fresh = log.slice(mark).filter((e) => e.time >= seekAt - 1e-12 && e.tick >= tr.toTicks({ bar: 7, beat: 1 }));
    expect(fresh[0].tick).toBe(tr.toTicks({ bar: 7, beat: 1 }));
    expect(fresh[0].time).toBeCloseTo(seekAt, 12);
    for (let i = 1; i < fresh.length; i++) expect(fresh[i].time - fresh[i - 1].time).toBeCloseTo(240 * (60 / (96 * PPQ)), 12);
    tr.pause();
    const paused = tr.position().absTick;
    expect(tr.state).toBe('paused');
    clock.t += 7.3;
    expect(tr.position().absTick).toBe(paused);
    let resumedAt = 0;
    tr.on('start', (e) => { resumedAt = e.time; expect(e.tick).toBe(paused); });
    const mark2 = log.length;
    tr.start();
    run(clock.t + 1);
    const next = log.slice(mark2).filter((e) => e.time >= resumedAt)[0];
    expect(next.tick).toBe(Math.ceil(paused / 240) * 240);
    expect(next.time).toBeCloseTo(resumedAt + (next.tick - paused) * (60 / (96 * PPQ)), 12);
  });

  it('started, stopped, paused and sought two hundred times in a row, it still keeps time', () => {
    const { tr, clock } = make({ bpm: 200 });
    const rand = lcg(77);
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    for (let i = 0; i < 200; i++) {
      const r = rand();
      if (r < 0.3) tr.start(); else if (r < 0.5) tr.stop(); else if (r < 0.65) tr.pause(); else if (r < 0.8) tr.seek(Math.floor(rand() * 20000)); else if (r < 0.9) tr.setTempo(60 + rand() * 300); else tr.setLoop(rand() * 4000, 4000 + rand() * 4000);
      clock.t += rand() * 0.07;
      tr.process();
      const p = tr.position();
      expect(Number.isFinite(p.absTick) && Number.isFinite(p.bpm)).toBe(true);
      expect(p.absTick).toBeGreaterThanOrEqual(0);
    }
    tr.stop();
    tr.clearLoop();
    tr.setTempo(120);
    beats.length = 0;
    tr.start({ from: 0 });
    while (clock.t < 500 && beats.length < 9) { clock.t += 0.02; tr.process(); }
    for (let i = 1; i < beats.length; i++) expect(beats[i].time - beats[i - 1].time).toBeCloseTo(0.5, 9);
    expect(beats.map((b) => b.beat)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
  });

  it('nonsense is ignored: NaN tempo, scale, swing, seek, loop, end, start time', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.setTempo(NaN);
    tr.setTempo(Infinity);
    tr.setTempo(100, { rampBeats: NaN });
    tr.setTempoScale(NaN);
    tr.setSwing(NaN);
    tr.seek(NaN);
    tr.seek(-5000);
    tr.setLoop(NaN, 1000);
    tr.setEnd(NaN);
    tr.setTempoMap([]);
    tr.setTempoMap([{ tick: NaN, bpm: 80 }, { tick: 0, bpm: NaN }]);
    tr.addPart([{ tick: NaN }, { tick: 480 }], () => undefined);
    tr.scheduleRepeat(() => undefined, NaN, NaN, NaN);
    expect(tr.bpm).toBeCloseTo(100, 9);
    expect(tr.loop).toBeNull();
    expect(tr.position().absTick).toBe(0);
    tr.start({ at: NaN, from: NaN, countIn: NaN });
    run(3);
    expect(beats.length).toBeGreaterThan(3);
    for (const b of beats) expect(Number.isFinite(b.time)).toBe(true);
    for (let i = 1; i < beats.length; i++) expect(beats[i].time - beats[i - 1].time).toBeCloseTo(0.6, 9);
    expect(tr.now()).toBeCloseTo(3, 9);
  });
});

describe('transport: jumps and restarts', () => {
  it('jumpAt carries on from another tick at the very moment, like a loop wrap: no gap, nothing doubled', () => {
    const { tr, run } = make({ bpm: 120 });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    const notes: Array<{ tick: number; time: number }> = [];
    tr.scheduleRepeat((time, tick) => notes.push({ tick, time }), 960);
    tr.start();
    run(0.5);
    const at = tr.nextBarLine();
    expect(at).toBe(3840);
    let jumpedAt = -1;
    expect(tr.jumpAt(at, 8 * 3840, (time) => (jumpedAt = time))).toBe(true);
    run(4);
    // Bar 0 played to its end, then bar 8 at once, on the same grid.
    expect(jumpedAt).toBeCloseTo(0.05 + 2, 9);
    expect(notes.map((n) => n.tick).slice(0, 7)).toEqual([0, 960, 1920, 2880, 8 * 3840, 8 * 3840 + 960, 8 * 3840 + 1920]);
    for (let i = 1; i < notes.length; i++) expect(notes[i].time - notes[i - 1].time).toBeCloseTo(0.5, 9);
    expect(beats.map((b) => b.bar).slice(0, 6)).toEqual([0, 0, 0, 0, 8, 8]);
    // Where the music is, as heard.
    expect(tr.position(0.05 + 2.6).bar).toBe(8);
  });

  it('a change made at the jump (meter, tempo) applies exactly there', () => {
    const { tr, run } = make({ bpm: 120, ts: '4/4' });
    const beats: BeatEvent[] = [];
    tr.on('beat', (e) => beats.push(e));
    tr.start();
    run(0.2);
    tr.jumpAt(tr.nextBarLine(), 0, () => {
      tr.setTimeSignature('3/4');
      tr.setTempo(60);
    });
    run(6);
    const after = beats.slice(4);
    expect(after[0].time - beats[3].time).toBeCloseTo(0.5, 9);
    expect(after.slice(0, 4).map((b) => [b.bar, b.beat, b.beatsInBar])).toEqual([[0, 0, 3], [0, 1, 3], [0, 2, 3], [1, 0, 3]]);
    expect(after[1].time - after[0].time).toBeCloseTo(1, 9);
  });

  it('a jump is refused when not playing or already behind, replaced by a newer one, and dropped by stop', () => {
    const { tr, run } = make({ bpm: 120 });
    expect(tr.jumpAt(3840, 0)).toBe(false);
    tr.start();
    run(1.5);
    expect(tr.jumpAt(0, 3840)).toBe(false);
    const seen: number[] = [];
    tr.jumpAt(tr.nextBarLine(), 3840 * 4, () => seen.push(4));
    tr.jumpAt(tr.nextBarLine(), 3840 * 6, () => seen.push(6));
    run(3);
    expect(seen).toEqual([6]);
    tr.jumpAt(tr.nextBarLine(), 0, () => seen.push(0));
    tr.stop();
    tr.start();
    run(6);
    expect(seen).toEqual([6]);
  });

  it('stopping and starting again at once does not tell visual listeners "stop" after the music is back', () => {
    const { tr, clock, run } = make({ bpm: 120 });
    clock.latency = 0.05;
    const heard: string[] = [];
    tr.onVisual('stop', () => heard.push('stop'));
    tr.onVisual('start', () => heard.push('start'));
    tr.start();
    run(1);
    heard.length = 0;
    tr.stop();
    tr.start();
    run(2);
    expect(heard).toEqual(['start']);
    // A plain stop is still heard.
    tr.stop();
    run(3);
    expect(heard).toEqual(['start', 'stop']);
  });

  it('scheduleVisual hands back a cancel', () => {
    const { tr, clock } = make();
    const ran: number[] = [];
    const off = tr.scheduleVisual(0.1, () => ran.push(1));
    tr.scheduleVisual(0.1, () => ran.push(2));
    off();
    clock.t = 0.2;
    tr.flushVisual();
    expect(ran).toEqual([2]);
  });
});
