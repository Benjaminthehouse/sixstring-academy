import { describe, expect, it } from 'vitest';
import { buildLine } from '../model/play';
import { shapesFor } from '../model/neck';
import { vampFor } from '../model/backing';
import { BAR_TICKS } from '../model/play';
import { ScalePlayer, currentPlayer, type ClickLike, type PlayRequest, type PlayerDeps } from './player';

/** A player on a clock the test moves by hand. */
function rig(over: Partial<PlayerDeps> = {}) {
  let t = 1;
  const clock = { now: () => t, soundingNow: () => t };
  const plucks: Array<{ midi: number; when: number; string: number }> = [];
  const stopped: number[] = [];
  const drones: Array<{ root: number; fifth: boolean; stopped: boolean }> = [];
  const clicks = { started: 0, stopped: 0 };
  const player = new ScalePlayer({
    clock,
    timer: 'manual',
    pluck: (midi, when, opts) => {
      const i = plucks.push({ midi, when, string: opts.string }) - 1;
      return { stop: () => stopped.push(i) };
    },
    drone: (opts) => {
      const d = { root: opts.root, fifth: opts.fifth, stopped: false };
      drones.push(d);
      return { stop: () => (d.stopped = true) };
    },
    band: null,
    click: () => ({ sound: 'woodblock', start: () => clicks.started++, stop: () => clicks.stopped++, dispose: () => undefined }) as ClickLike,
    preload: async () => undefined,
    ...over,
  });
  const steps: Array<{ index: number; at: number }> = [];
  const states: boolean[] = [];
  player.onStep((index) => steps.push({ index, at: t }));
  player.onState((p) => states.push(p));
  /** Move time forward in small steps, scheduling and running the visuals like the browser would. */
  const run = (seconds: number) => {
    const end = t + seconds;
    while (t < end) {
      t = Math.min(end, t + 0.005);
      player.transport.process(t);
      player.transport.flushVisual(t);
    }
  };
  return { player, plucks, stopped, drones, clicks, steps, states, run, now: () => t };
}

const line = () => buildLine(shapesFor('A', 'minor-pentatonic', 'box', { lastFret: 15 })[0], 'shape', 'up');
const request = (over: Partial<PlayRequest> = {}): PlayRequest => ({
  line: line(),
  perBeat: 2,
  bpm: 120,
  loop: false,
  accompaniment: 'none',
  vamp: null,
  drone: { midi: 45, fifth: true },
  click: false,
  tone: 'steel',
  ...over,
});

describe('ScalePlayer', () => {
  it('plays every note of the line in order, an eighth note apart at 120 BPM', async () => {
    const r = rig();
    await r.player.play(request());
    expect(r.player.playing).toBe(true);
    r.run(4);
    const l = line();
    expect(r.plucks.map((p) => p.midi)).toEqual(l.map((n) => n.midi));
    expect(r.plucks.map((p) => p.string)).toEqual(l.map((n) => n.string));
    const gaps = r.plucks.slice(1).map((p, i) => p.when - r.plucks[i].when);
    for (const g of gaps) expect(g).toBeCloseTo(0.25, 6);
  });

  it('lights each note when it is heard, not when it is scheduled', async () => {
    const r = rig();
    await r.player.play(request());
    r.run(4);
    const lit = r.steps.filter((s) => s.index >= 0);
    expect(lit.map((s) => s.index)).toEqual(line().map((_n, i) => i));
    // Each step fires with its note: at most half a frame early (the engine's frame lead) and
    // within one 5 ms tick of this test's clock late.
    lit.forEach((s, i) => {
      expect(s.at - r.plucks[i].when).toBeGreaterThanOrEqual(-0.0081);
      expect(s.at - r.plucks[i].when).toBeLessThan(0.006);
    });
  });

  it('stops by itself at the end of the line and says so', async () => {
    const r = rig();
    await r.player.play(request());
    r.run(5);
    expect(r.player.playing).toBe(false);
    expect(r.states).toEqual([true, false]);
    expect(r.steps[r.steps.length - 1].index).toBe(-1);
  });

  it('loops until stopped, then silences every note it handed out', async () => {
    const r = rig();
    await r.player.play(request({ loop: true }));
    r.run(8);
    const n = line().length;
    expect(r.plucks.length).toBeGreaterThan(n * 2);
    // The loop wraps on a bar line with a breath: the second pass starts two bars after the first.
    expect(r.plucks[n].when - r.plucks[0].when).toBeCloseTo(4, 6);
    expect(r.player.playing).toBe(true);
    r.player.stop();
    expect(r.player.playing).toBe(false);
    expect(r.stopped.length).toBeGreaterThan(0);
    const before = r.plucks.length;
    r.run(2);
    expect(r.plucks.length).toBe(before);
  });

  it('starts a drone on the root for the drone, and stops it with the line', async () => {
    const r = rig();
    await r.player.play(request({ accompaniment: 'drone' }));
    expect(r.drones).toEqual([{ root: 45, fifth: true, stopped: false }]);
    r.player.stop();
    expect(r.drones[0].stopped).toBe(true);
  });

  it('falls back to a drone when no band is available', async () => {
    const r = rig();
    await r.player.play(request({ accompaniment: 'band', vamp: vampFor('A', 'minor-pentatonic') }));
    expect(r.drones).toHaveLength(1);
  });

  it('keeps playing the line all through the band’s loop (the blues used to drop it for 21 of 24 bars)', async () => {
    const loads: Array<{ bars: number; choruses?: number }> = [];
    const r = rig({
      band: (tr) => ({
        // Like the real band: the loop is the arrangement's body (bars × choruses).
        load: (bars, opts) => {
          loads.push({ bars: bars.length, choruses: opts.choruses });
          tr.setTimeSignature('4/4');
          tr.setTempo(opts.tempo ?? 120);
          tr.setLoop(0, bars.length * (opts.choruses ?? 2) * BAR_TICKS);
          tr.setEnd(null);
          tr.seek(0);
          return undefined as never;
        },
        prepare: async () => undefined,
        start: () => tr.start({ from: 0 }),
        stop: () => tr.stop(),
        setTempo: (bpm) => tr.setTempo(bpm),
        setMuted: () => undefined,
        dispose: () => undefined,
      }),
    });
    await r.player.play(request({ loop: true, accompaniment: 'band', vamp: vampFor('A', 'minor-blues') }));
    expect(loads).toEqual([{ bars: 12, choruses: 1 }]);
    // 12 bars at 120 BPM = 24 s: the 2-bar line plays six times (the sixth ends at 23 s), and the
    // gap between passes is the line's breath (2⅓ beats, swung), never a silent bar (2 s).
    r.run(23.5);
    const n = line().length;
    expect(r.plucks.length).toBe(n * 6);
    const gaps = r.plucks.slice(1).map((p, i) => p.when - r.plucks[i].when);
    expect(Math.max(...gaps)).toBeLessThan(1.2);
    r.player.stop();
  });

  it('counts in one bar of clicks before the line when the click is on', async () => {
    const r = rig();
    const t0 = r.now();
    await r.player.play(request({ click: true }));
    r.run(4);
    expect(r.clicks.started).toBe(1);
    // One 4/4 bar at 120 BPM = 2 s of count-in.
    expect(r.plucks[0].when - t0).toBeGreaterThan(1.9);
    r.player.stop();
    expect(r.clicks.stopped).toBeGreaterThan(0);
  });

  it('changes tempo while playing', async () => {
    const r = rig();
    await r.player.play(request({ loop: true }));
    r.run(1);
    r.player.setTempo(60);
    r.run(3);
    const last = r.plucks.slice(-3);
    expect(last[2].when - last[1].when).toBeCloseTo(0.5, 6);
    r.player.stop();
  });

  it('keeps time played, and lets go of everything on dispose', async () => {
    const r = rig();
    expect(currentPlayer()).toBe(r.player);
    await r.player.play(request({ loop: true }));
    r.run(3);
    expect(r.player.secondsPlayed()).toBeGreaterThan(2.9);
    r.player.dispose();
    expect(currentPlayer()).toBeNull();
    expect(r.player.playing).toBe(false);
  });

  it('does nothing for an empty line', async () => {
    const r = rig();
    await r.player.play(request({ line: [] }));
    expect(r.player.playing).toBe(false);
    expect(r.states).toEqual([]);
  });
});
