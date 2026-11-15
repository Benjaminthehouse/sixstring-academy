import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER } from './examples';
import { buildPlayEvents, type PlayNote, type PlayStrum } from './schedule';
import { sixTab } from './sixtab-parse';
import { SongPlayer, type SongPlayerEvent, type SongPlayerOutput } from './song-player';
import { flattenSong } from './timeline';

function recorder() {
  const notes: Array<{ e: PlayNote; time: number; seconds: number }> = [];
  const strums: Array<{ e: PlayStrum; time: number; seconds: number }> = [];
  const clicks: Array<{ level: string; time: number }> = [];
  let stops = 0;
  const output: SongPlayerOutput = {
    note: (e, time, seconds) => notes.push({ e, time, seconds }),
    strum: (e, time, seconds) => strums.push({ e, time, seconds }),
    click: (level, time) => clicks.push({ level, time }),
    stopAll: () => {
      stops++;
    },
  };
  return { output, notes, strums, clicks, stops: () => stops };
}

function setup(text: string, opts: { countInBars?: number; metronome?: boolean } = {}) {
  let now = 0;
  const clock = { now: () => now, soundingNow: () => now };
  const rec = recorder();
  const player = new SongPlayer(sixTab(text), { output: rec.output, clock, timer: 'manual', countInBars: opts.countInBars ?? 0, metronome: opts.metronome });
  const events: SongPlayerEvent[] = [];
  player.subscribe((e) => events.push(e));
  /** Let audio time pass: schedule everything up to `t` and deliver what is heard by then. */
  const runTo = (t: number) => {
    for (let x = now; x <= t; x += 0.05) {
      now = x;
      player.transport.process(x);
      player.transport.flushVisual(x);
    }
    now = t;
    player.transport.process(t);
    player.transport.flushVisual(t);
  };
  return { player, rec, events, runTo, setNow: (t: number) => (now = t) };
}

describe('playback schedule', () => {
  it('joins ties, softens legato, lifts harmonics and steps through bends', () => {
    const events = buildPlayEvents(flattenSong(sixTab(TECHNIQUE_SAMPLER)));
    const notes = events.filter((e): e is PlayNote => e.kind === 'note');
    const tie = notes.find((n) => n.tick === 4 * 3840 && n.string === 4)!;
    expect(tie.ticks).toBe(3840);
    expect(notes.some((n) => n.tick === 4 * 3840 + 1920 && n.string === 4)).toBe(false);
    const hammer = notes.find((n) => n.tick === 480)!;
    expect(hammer.velocity).toBeLessThan(0.78);
    const harmonic = notes.find((n) => n.tick === 2 * 3840)!;
    expect(harmonic).toMatchObject({ midi: 76, articulation: 'harmonic' });
    const dead = notes.find((n) => n.tick === 2 * 3840 + 2880)!;
    expect(dead.articulation).toBe('dead');
    // 3:7b2r in bar 1 (tick 2880): the note, a soft step up two semitones, a step back down.
    expect(notes.filter((n) => n.tick >= 2880 && n.tick < 3840).map((n) => n.midi)).toEqual([62, 64, 62]);
    const pm = events.find((e) => e.tick === 3840 + 1920)!;
    expect(pm.kind).toBe('note');
    expect((pm as PlayNote).articulation).toBe('palm-mute');
    const pre = notes.find((n) => n.tick === 7 * 3840 + 960)!;
    expect(pre.cents).toBe(200);
  });

  it('strums slashes with the chord voicing in force', () => {
    const events = buildPlayEvents(flattenSong(sixTab(CAMPFIRE_GROOVE)));
    const strums = events.filter((e): e is PlayStrum => e.kind === 'strum');
    expect(strums[0]).toMatchObject({ tick: 0, symbol: 'G', direction: 'down', midis: [43, 47, 50, 55, 59, 67], strings: [6, 5, 4, 3, 2, 1] });
    expect(strums[2]).toMatchObject({ direction: 'up' });
    const em = strums.find((s) => s.symbol === 'Em')!;
    expect(em.midis).toEqual([40, 47, 52, 55, 59, 64]);
    const bass = events.filter((e) => e.track === 'bass');
    expect(bass.every((e) => e.instrument === 'bass')).toBe(true);
  });
});

describe('SongPlayer', () => {
  it('plays every note on the audio clock at the written tempo', () => {
    const { player, rec, events, runTo } = setup(ODE_TO_JOY);
    player.play();
    runTo(25);
    expect(rec.notes).toHaveLength(30);
    const t0 = rec.notes[0].time;
    expect(rec.notes[1].time - t0).toBeCloseTo(0.6, 6);
    expect(rec.notes[0].seconds).toBeCloseTo(0.6, 6);
    // Bar 4: dotted quarter, eighth, half.
    expect(rec.notes[13].time - rec.notes[12].time).toBeCloseTo(0.9, 6);
    expect(events.filter((e) => e.type === 'beat')).toHaveLength(30);
    expect(events.some((e) => e.type === 'end')).toBe(true);
    expect(player.state).toBe('stopped');
  });

  it('changes tempo without touching pitch, and counts in', () => {
    const { player, rec, runTo } = setup(ODE_TO_JOY, { countInBars: 1 });
    player.tempoPercent = 50;
    player.play();
    runTo(10);
    expect(rec.clicks.map((c) => c.level)).toEqual(['accent', 'beat', 'beat', 'beat']);
    expect(rec.clicks[1].time - rec.clicks[0].time).toBeCloseTo(1.2, 6);
    expect(rec.notes[0].time - rec.clicks[0].time).toBeCloseTo(4.8, 6);
    expect(rec.notes[1].time - rec.notes[0].time).toBeCloseTo(1.2, 6);
    expect(rec.notes[0].e.midi).toBe(64);
    player.tempoPercent = 400;
    expect(player.tempoPercent).toBe(150);
    player.tempoPercent = 5;
    expect(player.tempoPercent).toBe(25);
  });

  it('starts a pickup bar after a full count-in bar in its meter', () => {
    const { player, rec, runTo } = setup(AMAZING_GRACE, { countInBars: 1 });
    player.play();
    runTo(6);
    // 3/4 at 80: three clicks 0.75 s apart, then the pickup note on the next beat.
    expect(rec.clicks).toHaveLength(3);
    expect(rec.notes[0].time - rec.clicks[0].time).toBeCloseTo(2.25, 6);
    expect(rec.notes[1].time - rec.notes[0].time).toBeCloseTo(0.75, 6);
    expect(rec.notes[0].e.midi).toBe(50);
  });

  it('mutes and solos tracks, and clicks along when asked', () => {
    const a = setup(CAMPFIRE_GROOVE, { metronome: true });
    a.player.setTrackMuted('bass', true);
    a.player.play();
    a.runTo(3);
    expect(a.rec.notes).toHaveLength(0);
    expect(a.rec.strums.length).toBeGreaterThan(0);
    expect(a.rec.clicks[0].level).toBe('accent');
    const b = setup(CAMPFIRE_GROOVE);
    b.player.setTrackSolo('bass', true);
    expect(b.player.isAudible('rhythm')).toBe(false);
    b.player.play();
    b.runTo(3);
    expect(b.rec.strums).toHaveLength(0);
    expect(b.rec.notes.length).toBeGreaterThan(0);
    expect(b.rec.notes[0].e).toMatchObject({ instrument: 'bass', midi: 31 });
  });

  it('loops bars and speeds up each pass (speed trainer)', () => {
    const { player, rec, events, runTo } = setup(ODE_TO_JOY);
    player.setLoop(0, 1, { ramp: { start: 50, step: 25, target: 100 } });
    expect(player.tempoPercent).toBe(50);
    player.play();
    runTo(30);
    const gaps = rec.notes.slice(0, 20).map((n, i, a) => (i ? Math.round((n.time - a[i - 1].time) * 100) / 100 : 0));
    // Pass 1 at 50 % (1.2 s a quarter), pass 2 at 75 % (0.8 s), then 100 % (0.6 s).
    expect(gaps.slice(1, 8)).toEqual([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2]);
    expect(gaps.slice(9, 16)).toEqual([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
    expect(gaps.slice(17, 20)).toEqual([0.6, 0.6, 0.6]);
    const loops = events.filter((e): e is Extract<SongPlayerEvent, { type: 'loop' }> => e.type === 'loop');
    expect(loops.slice(0, 3).map((l) => l.tempoPercent)).toEqual([75, 100, 100]);
    expect(rec.notes.every((n) => n.e.tick < 2 * 3840)).toBe(true);
  });

  it('seeks, pauses, reports its position and maps audio time to song time', () => {
    const { player, rec, runTo, setNow } = setup(ODE_TO_JOY);
    player.seekBar(4);
    expect(player.position()).toMatchObject({ tick: 4 * 3840, bar: 4, state: 'stopped' });
    player.play();
    runTo(0.08 + 1.3);
    expect(rec.notes[0].e.tick).toBe(4 * 3840);
    const pos = player.position();
    expect(pos.bar).toBe(4);
    expect(pos.tick).toBeGreaterThan(4 * 3840 + 2 * 960);
    expect(player.beatNow('guitar')!.beat).toBe(2);
    expect(player.songTimeAt(0.08 + 0.6)).toBeCloseTo(4 * 2.4 + 0.6, 6);
    player.pause();
    expect(player.state).toBe('paused');
    const n = rec.notes.length;
    setNow(5);
    runTo(6);
    expect(rec.notes.length).toBe(n);
    player.play();
    runTo(8);
    expect(rec.notes.length).toBeGreaterThan(n);
    expect(rec.stops()).toBeGreaterThan(0);
    player.stop();
    expect(player.position().tick).toBe(0);
  });

  it('plays a range and pauses at its end (wait mode)', () => {
    const { player, rec, events, runTo } = setup(ODE_TO_JOY);
    player.playRange(960, 3840);
    runTo(5);
    expect(rec.notes.map((n) => n.e.tick)).toEqual([960, 1920, 2880]);
    expect(events.some((e) => e.type === 'range-end')).toBe(true);
    expect(player.state).toBe('paused');
    expect(player.position().tick).toBe(3840);
    player.play();
    runTo(6);
    expect(rec.notes[3].e.tick).toBe(3840);
  });

  it('disposes cleanly', () => {
    const { player, rec } = setup(ODE_TO_JOY);
    player.play();
    player.dispose();
    expect(rec.stops()).toBeGreaterThan(0);
  });
});
