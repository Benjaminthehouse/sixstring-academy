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
