import { describe, expect, it } from 'vitest';
import { Metronome, TapTempo, clickPattern, isSilentBar, speedTrainerBpm, speedTrainerLength, subdivisionOffsets, type MetronomeBeat } from './metronome';
import type { ClickLevel } from './percussion';
import { resolveMeter } from './timeline';
import type { TransportClock } from './transport';

class FakeClock implements TransportClock {
  t = 0;
  now(): number {
    return this.t;
  }
  soundingNow(): number {
    return this.t;
  }
}

interface Played {
  level: ClickLevel;
  time: number;
  gain: number;
  set: string;
}

function rig(opts: { tempo?: number; ts?: string } = {}): { m: Metronome; clock: FakeClock; played: Played[]; run: (until: number) => void } {
  const clock = new FakeClock();
  const played: Played[] = [];
  const m = new Metronome({
    clock,
    timer: 'manual',
    tempo: opts.tempo ?? 120,
    timeSignature: opts.ts ?? '4/4',
    output: { click: (set, level, time, gain) => played.push({ set, level, time, gain }) },
  });
  const run = (until: number): void => {
    while (clock.t < until - 1e-9) {
      clock.t = Math.min(until, clock.t + 0.02);
      m.transport.process();
      m.transport.flushVisual();
    }
  };
  return { m, clock, played, run };
}

const levels = (meter: string, sub: Parameters<typeof clickPattern>[2] = 'none', accents?: Parameters<typeof clickPattern>[1]) =>
  clickPattern(resolveMeter(meter), accents, sub).map((c) => c.level);
const ticks = (meter: string, sub: Parameters<typeof clickPattern>[2] = 'none') => clickPattern(resolveMeter(meter), undefined, sub).map((c) => c.tick);

describe('click patterns', () => {
  it('4/4: accent on one', () => {
    expect(levels('4/4')).toEqual(['accent', 'beat', 'beat', 'beat']);
    expect(ticks('4/4')).toEqual([0, 960, 1920, 2880]);
  });

  it('compound meters click the dotted beats, with eighths as subdivisions', () => {
    expect(levels('6/8')).toEqual(['accent', 'beat']);
    expect(ticks('6/8')).toEqual([0, 1440]);
    expect(levels('6/8', 'eighth')).toEqual(['accent', 'sub', 'sub', 'beat', 'sub', 'sub']);
    expect(ticks('6/8', 'eighth')).toEqual([0, 480, 960, 1440, 1920, 2400]);
    expect(levels('12/8')).toEqual(['accent', 'beat', 'beat', 'beat']);
    expect(ticks('12/8', 'sixteenth').length).toBe(24);
    // "Triplets" inside a dotted beat are its three eighths.
    expect(ticks('9/8', 'triplet')).toEqual(ticks('9/8', 'eighth'));
  });

  it('odd meters follow the grouping', () => {
    expect(ticks('7/8')).toEqual([0, 960, 1920]);
    expect(levels('7/8', 'eighth')).toEqual(['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'sub']);
    expect(ticks('7/8', 'eighth')).toEqual([0, 480, 960, 1440, 1920, 2400, 2880]);
    const threeTwoTwo = clickPattern(resolveMeter('7/8(3+2+2)'), undefined, 'eighth');
    expect(threeTwoTwo.map((c) => c.level)).toEqual(['accent', 'sub', 'sub', 'beat', 'sub', 'beat', 'sub']);
    expect(threeTwoTwo.filter((c) => c.sub === 0).map((c) => c.tick)).toEqual([0, 1440, 2400]);
    expect(levels('5/8', 'eighth')).toEqual(['accent', 'sub', 'sub', 'beat', 'sub']);
    expect(levels('5/4')).toEqual(['accent', 'beat', 'beat', 'medium', 'beat']);
    expect(levels('7/4')).toEqual(['accent', 'beat', 'beat', 'beat', 'medium', 'beat', 'beat']);
    expect(clickPattern(resolveMeter({ numerator: 5, denominator: 4, grouping: [2, 3] }), undefined, 'none').map((c) => c.level))
      .toEqual(['accent', 'beat', 'medium', 'beat', 'beat']);
    expect(ticks('11/8')).toEqual([0, 1440, 2880, 4320]);
  });

  it('per-beat accent levels override the defaults, 0 silences a beat', () => {
    expect(levels('4/4', 'none', [1, 3, 0, 2])).toEqual(['beat', 'accent', null, 'medium']);
    expect(levels('3/4', 'eighth', [3, 0, 1])).toEqual(['accent', 'sub', null, 'sub', 'beat', 'sub']);
  });

  it('subdivisions land where they should', () => {
    expect(subdivisionOffsets(960, 'none')).toEqual([]);
    expect(subdivisionOffsets(960, 'eighth')).toEqual([480]);
    expect(subdivisionOffsets(960, 'triplet')).toEqual([320, 640]);
    expect(subdivisionOffsets(960, 'sixteenth')).toEqual([240, 480, 720]);
    expect(subdivisionOffsets(960, 'quintuplet')).toEqual([192, 384, 576, 768]);
    expect(subdivisionOffsets(960, 'sextuplet').length).toBe(5);
    expect(subdivisionOffsets(960, 'swing')).toEqual([640]);
    expect(subdivisionOffsets(960, 'swing', 0.6)).toEqual([576]);
    expect(subdivisionOffsets(1920, 'eighth')).toEqual([480, 960, 1440]); // 2/2
    expect(subdivisionOffsets(1920, 'swing')).toEqual([640, 960, 1600]);
    expect(subdivisionOffsets(1440, 'swing')).toEqual([480, 960]);
    expect(subdivisionOffsets(480, 'eighth')).toEqual([]); // the beat is already an eighth
    expect(subdivisionOffsets(480, 'sixteenth')).toEqual([240]);
  });
});

describe('speed trainer and silent bars', () => {
  it('raises the tempo in steps up to the target', () => {
    const cfg = { startBpm: 60, targetBpm: 100, stepBpm: 5, everyBars: 4 };
    expect(speedTrainerBpm(cfg, 0)).toBe(60);
    expect(speedTrainerBpm(cfg, 3)).toBe(60);
    expect(speedTrainerBpm(cfg, 4)).toBe(65);
    expect(speedTrainerBpm(cfg, 31)).toBe(95);
    expect(speedTrainerBpm(cfg, 32)).toBe(100);
    expect(speedTrainerBpm(cfg, 400)).toBe(100);
    expect(speedTrainerLength(cfg)).toBe(32);
    // The last step does not overshoot.
    expect(speedTrainerBpm({ startBpm: 60, targetBpm: 72, stepBpm: 5, everyBars: 1 }, 3)).toBe(72);
  });

  it('can also slow down', () => {
    const cfg = { startBpm: 120, targetBpm: 90, stepBpm: 10, everyBars: 2 };
    expect(speedTrainerBpm(cfg, 2)).toBe(110);
    expect(speedTrainerBpm(cfg, 6)).toBe(90);
    expect(speedTrainerBpm(cfg, 60)).toBe(90);
  });

  it('silent bars cycle', () => {
    const cfg = { playBars: 2, muteBars: 1 };
    expect([0, 1, 2, 3, 4, 5, 6].map((b) => isSilentBar(cfg, b))).toEqual([false, false, true, false, false, true, false]);
    expect(isSilentBar(null, 5)).toBe(false);
    expect(isSilentBar({ playBars: 4, muteBars: 0 }, 5)).toBe(false);
  });
});

describe('tap tempo', () => {
  it('needs two taps, averages, and ignores a fumble', () => {
    const tap = new TapTempo();
    expect(tap.tap(1000)).toBeNull();
    expect(tap.tap(1500)).toBeCloseTo(120, 6);
    expect(tap.tap(2000)).toBeCloseTo(120, 6);
    expect(tap.tap(2510)).toBeCloseTo(60000 / ((500 + 500 + 510) / 3), 6);
    tap.tap(3010);
    // One wildly late tap is thrown out of the average.
    const bpm = tap.tap(3990)!;
    expect(bpm).toBeGreaterThan(115);
    expect(bpm).toBeLessThan(121);
  });

  it('starts over after a pause and clamps to the metronome range', () => {
    const tap = new TapTempo();
    tap.tap(0);
    tap.tap(500);
    expect(tap.tap(5000)).toBeNull();
    expect(tap.count).toBe(1);
    expect(tap.tap(5050)).toBe(400);
    tap.reset();
    expect(tap.bpm).toBeNull();
  });
});

describe('metronome on the transport', () => {
  it('clicks 7/8 in 2+2+3 with the right sounds at the right times', () => {
    const { m, played, run } = rig({ tempo: 120, ts: '7/8' });
    m.subdivision = 'eighth';
    m.start();
    run(1.9);
    // Quarter = 120, so an eighth is 0.25 s; the first bar starts after the 0.08 s start delay.
    const bar = played.slice(0, 7);
    expect(bar.map((p) => p.level)).toEqual(['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'sub']);
    bar.forEach((p, i) => expect(p.time).toBeCloseTo(0.08 + i * 0.25, 9));
    expect(played[7].level).toBe('accent');
    expect(played[7].time).toBeCloseTo(0.08 + 7 * 0.25, 9);
    m.stop();
    expect(m.running).toBe(false);
  });

  it('counts 6/8 in dotted quarters: tempo 60 means two beats a second apart', () => {
    const { m, played, run } = rig({ tempo: 60, ts: '6/8' });
    expect(m.tempoBeatTicks).toBe(1440);
    expect(m.transport.bpm).toBe(90);
    m.start();
    run(3.2);
    expect(played.slice(0, 4).map((p) => p.level)).toEqual(['accent', 'beat', 'accent', 'beat']);
    expect(played[1].time - played[0].time).toBeCloseTo(1, 9);
    expect(m.tempo).toBe(60);
  });

  it('reports beats to the UI when they are heard, including muted and silent ones', () => {
    const { m, played, run } = rig({ tempo: 240 });
    const seen: MetronomeBeat[] = [];
    m.onBeat((b) => seen.push(b));
    m.setAccent(2, 0);
    m.silentBars = { playBars: 1, muteBars: 1 };
    m.start();
    run(2.2);
    expect(seen.slice(0, 8).map((b) => [b.bar, b.beat])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3]]);
    expect(seen.slice(0, 4).map((b) => b.level)).toEqual(['accent', 'beat', null, 'beat']);
    expect(seen.slice(4, 8).every((b) => b.silent && b.level === null)).toBe(true);
    expect(seen[0].tempo).toBe(240);
    // Only the audible clicks reached the output: 3 in bar 0, none in bar 1, 3 in bar 2.
    const inFirstTwoBars = played.filter((p) => p.time < 0.08 + 2 - 1e-6);
    expect(inFirstTwoBars.length).toBe(3);
  });

  it('the speed trainer changes tempo exactly on the bar line', () => {
    const { m, played, run } = rig({ tempo: 120 });
    m.speedTrainer = { startBpm: 120, targetBpm: 240, stepBpm: 120, everyBars: 1 };
    m.start();
    run(4);
    // Bar 0 at 120 (0.5 s per beat), bar 1 onwards at 240 (0.25 s per beat).
    const t = played.map((p) => p.time);
    expect(t[1] - t[0]).toBeCloseTo(0.5, 9);
    expect(t[4] - t[3]).toBeCloseTo(0.5, 9);
    expect(t[5] - t[4]).toBeCloseTo(0.25, 9);
    expect(t[9] - t[8]).toBeCloseTo(0.25, 9);
    expect(m.tempo).toBe(240);
  });

  it('plays a count-in, then bar 0', () => {
    const { m, played, run } = rig({ tempo: 120, ts: '3/4' });
    const seen: MetronomeBeat[] = [];
    m.onBeat((b) => seen.push(b));
    m.countInBars = 1;
    m.start();
    run(3.2);
    expect(seen.slice(0, 4).map((b) => [b.countIn, b.bar, b.beat])).toEqual([[true, -1, 0], [true, -1, 1], [true, -1, 2], [false, 0, 0]]);
    expect(played.slice(0, 4).map((p) => p.level)).toEqual(['accent', 'beat', 'beat', 'accent']);
    expect(played[3].time).toBeCloseTo(0.08 + 1.5, 9);
  });

  it('follows tempo, accent and sound changes while running', () => {
    const { m, played, run } = rig({ tempo: 120 });
    m.start();
    run(1);
    m.setTempo(60);
    m.sound = 'beep';
    m.volume = 0.5;
    run(4);
    const late = played.filter((p) => p.time > 2);
    expect(late.length).toBeGreaterThanOrEqual(2);
    expect(late[1].time - late[0].time).toBeCloseTo(1, 9);
    expect(late[0].set).toBe('beep');
    expect(late[0].gain).toBe(0.5);
    expect(m.cycleAccent(1)).toBe(2);
    expect(m.cycleAccent(1)).toBe(3);
    expect(m.cycleAccent(1)).toBe(0);
    expect(m.accents).toEqual([3, 0, 1, 1]);
  });

  it('clamps tempo, taps tempo and restarts cleanly on a new time signature', () => {
    const { m, played, clock, run } = rig({ tempo: 100 });
    m.setTempo(5);
    expect(m.tempo).toBe(20);
    m.setTempo(900);
    expect(m.tempo).toBe(400);
    m.tap(0);
    m.tap(600);
    expect(m.tempo).toBe(100);
    m.start();
    run(1);
    m.setTimeSignature('5/8');
    expect(m.accents.length).toBe(2);
    expect(m.running).toBe(true);
    const from = clock.t;
    run(from + 2);
    const fresh = played.filter((p) => p.time > from);
    expect(fresh[0].level).toBe('accent');
    expect(m.pattern().map((c) => c.tick)).toEqual([0, 1440]);
    expect(m.toggle()).toBe(false);
    m.dispose();
  });
});

describe('metronome: nothing clicks after it has been told to stop', () => {
  /** An output whose clicks can be taken back, like the real one. */
  function rigWithCancel(tempo: number, ts = '4/4') {
    const clock = new FakeClock();
    const clicks: Array<{ time: number; level: ClickLevel; cancelled: boolean }> = [];
    const m = new Metronome({
      clock, timer: 'manual', tempo, timeSignature: ts,
      output: {
        click: (_set, level, time) => {
          const c = { time, level, cancelled: false };
          clicks.push(c);
          return () => { c.cancelled = true; };
        },
      },
    });
    const run = (until: number): void => {
      while (clock.t < until - 1e-9) {
        clock.t = Math.min(until, clock.t + 0.02);
        m.transport.process();
      }
    };
    return { m, clock, clicks, run };
  }

  it('stop takes back every click that was scheduled but not yet heard, and only those', () => {
    const { m, clock, clicks, run } = rigWithCancel(240);
    m.subdivision = 'sixteenth';
    m.start();
    run(1.013);
    m.stop();
    const heard = clicks.filter((c) => c.time <= clock.t), ahead = clicks.filter((c) => c.time > clock.t);
    expect(ahead.length).toBeGreaterThan(0); // the look-ahead had scheduled some
    expect(ahead.every((c) => c.cancelled)).toBe(true);
    expect(heard.length).toBeGreaterThan(10);
    expect(heard.some((c) => c.cancelled)).toBe(false);
  });

  it('pause, seek and a change of time signature do the same', () => {
    const a = rigWithCancel(200);
    a.m.start();
    a.run(1);
    a.m.transport.pause();
    expect(a.clicks.filter((c) => c.time > a.clock.t).every((c) => c.cancelled)).toBe(true);
    expect(a.clicks.filter((c) => c.time <= a.clock.t).some((c) => c.cancelled)).toBe(false);

    const b = rigWithCancel(200);
    b.m.start();
    b.run(1);
    let seekTime = 0;
    b.m.transport.on('seek', (e) => { seekTime = e.time; });
    b.m.transport.seek({ bar: 8 });
    // Clicks before the new position's first sound still belong to the music; later ones would double.
    expect(b.clicks.filter((c) => c.time >= seekTime).every((c) => c.cancelled)).toBe(true);
    expect(b.clicks.filter((c) => c.time < seekTime).some((c) => c.cancelled)).toBe(false);

    const c = rigWithCancel(180);
    c.m.subdivision = 'eighth';
    c.m.start();
    c.run(1.5);
    const before = c.clicks.length;
    c.m.setTimeSignature('7/8');
    c.run(4);
    const heard = c.clicks.filter((k) => !k.cancelled).map((k) => k.time);
    // No two clicks closer than the fastest subdivision either side of the change: no flam.
    for (let i = 1; i < heard.length; i++) expect(heard[i] - heard[i - 1]).toBeGreaterThan(0.079);
    expect(c.clicks.length).toBeGreaterThan(before);
    expect(c.m.running).toBe(true);
  });

  it('a new subdivision starts on the next beat, never in the middle of one', () => {
    const { m, clicks, run } = rigWithCancel(60);
    m.subdivision = 'sixteenth';
    m.start();
    run(2.3); // inside the third beat: clicks at 2.08, 2.33 ... are scheduled or about to be
    m.subdivision = 'triplet';
    run(6);
    const times = clicks.map((c) => +(c.time - 0.08).toFixed(6));
    // Beat 3 (2.0 .. 3.0) is finished in sixteenths; beat 4 onwards is in triplets.
    expect(times.filter((t) => t >= 2 && t < 3)).toEqual([2, 2.25, 2.5, 2.75]);
    expect(times.filter((t) => t >= 3 && t < 4)).toEqual([3, 3.333333, 3.666667]);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(0.24);
  });

  it('ignores a tempo that is not a number and survives a volume that is not one', () => {
    const { m, clock, played, run } = rig({ tempo: 120 });
    m.setTempo(NaN);
    m.setTempo(Infinity);
    expect(m.tempo).toBe(120);
    m.volume = NaN;
    m.start();
    run(1.2);
    expect(played.length).toBeGreaterThan(1);
    expect(played.every((p) => Number.isFinite(p.gain) && Number.isFinite(p.time))).toBe(true);
    expect(clock.t).toBeGreaterThan(1);
  });
});
