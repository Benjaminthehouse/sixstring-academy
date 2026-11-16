import { describe, expect, it } from 'vitest';
import { AMAZING_GRACE, CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER } from './examples';
import { buildPlayEvents, feltBeats, strumVelocity, type PlayNote, type PlayStrum } from './schedule';
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
  it('joins ties, softens legato, lifts harmonics, and hands every technique to the guitar voice', () => {
    const events = buildPlayEvents(flattenSong(sixTab(TECHNIQUE_SAMPLER)));
    const notes = events.filter((e): e is PlayNote => e.kind === 'note');
    const at = (tick: number, string?: number): PlayNote => notes.find((n) => n.tick === tick && (string === undefined || n.string === string))!;
    const tie = at(4 * 3840, 4);
    expect(tie.ticks).toBe(3840);
    expect(notes.some((n) => n.tick === 4 * 3840 + 1920 && n.string === 4)).toBe(false);
    // | e 3:5 3:7h 3:5p 3:7 s 3:9s 3:7s ...: a hammer-on, a pull-off, slides up and down. The schedule
    // does not soften them: the guitar voice plays a legato note without a pick and at its own lower
    // level (softened twice, a hammer-on in a song sat about 9 dB under the note before it).
    expect(at(480)).toMatchObject({ midi: 62, legato: 'hammer' });
    expect(at(480).velocity).toBe(at(0).velocity);
    expect(at(960)).toMatchObject({ midi: 60, legato: 'pull' });
    expect(at(960).velocity).toBe(0.78);
    expect(at(1440).legato).toBeUndefined();
    expect(at(1920)).toMatchObject({ midi: 64, legato: 'slide' });
    expect(at(1920).slideIn).toBeUndefined();
    // A slide down: where the string cannot be carried on, the fresh note slides in from above.
    expect(at(2160)).toMatchObject({ midi: 62, legato: 'slide', slideIn: 'above' });
    const harmonic = at(2 * 3840);
    expect(harmonic).toMatchObject({ midi: 76, articulation: 'harmonic' });
    const dead = at(2 * 3840 + 2880);
    expect(dead.articulation).toBe('dead');
    // 3:7b2r in bar 0 (tick 2880): one note that bends up a whole tone and comes back (the voice glides).
    expect(notes.filter((n) => n.tick >= 2880 && n.tick < 3840)).toHaveLength(1);
    expect(at(2880)).toMatchObject({ midi: 62, bend: { amount: 2, release: true } });
    expect(at(3840)).toMatchObject({ midi: 67, bend: { amount: 1 } });
    expect(at(4800)).toMatchObject({ vibrato: true });
    const pm = events.find((e) => e.tick === 3840 + 1920)!;
    expect(pm.kind).toBe('note');
    expect((pm as PlayNote).articulation).toBe('palm-mute');
    // Bar 3: /4:7 slides in from below, 4:7\ slides out down; 3:5> is accented.
    expect(at(3 * 3840)).toMatchObject({ slideIn: 'below' });
    expect(at(3 * 3840 + 480)).toMatchObject({ slideOut: 'down' });
    const accented = at(3 * 3840 + 1920);
    expect(accented.accent).toBe(true);
    expect(accented.velocity).toBeGreaterThan(0.78);
    // Bar 7: \3:9 from above, a pre-bend (struck bent), a bend and release with vibrato.
    expect(at(7 * 3840)).toMatchObject({ slideIn: 'above' });
    const pre = at(7 * 3840 + 960);
    expect(pre).toMatchObject({ midi: 62, bend: { amount: 2, pre: true } });
    expect(pre.cents).toBeUndefined();
    expect(at(7 * 3840 + 1920)).toMatchObject({ bend: { amount: 2, release: true }, vibrato: true });
  });

  it('strums with per-stroke strength: down on the beat, down between beats, up; an accent lifts any of them', () => {
    expect(strumVelocity('down', 0, false)).toBe(0.8);
    expect(strumVelocity('down', 480, false)).toBe(0.72);
    expect(strumVelocity('up', 480, false)).toBe(0.62);
    expect(strumVelocity('down', 960, true)).toBe(1);
    const song = sixTab('title: Strokes\ntempo: 120\ntime: 4/4\n| "G" q. D e D q U D |\n');
    song.tracks[0].measures[0].beats[2].accent = true;
    const strums = buildPlayEvents(flattenSong(song)).filter((e): e is PlayStrum => e.kind === 'strum');
    expect(strums.map((s) => [s.tick, s.direction, s.velocity, !!s.accent])).toEqual([
      [0, 'down', 0.8, false], [1440, 'down', 0.72, false], [1920, 'up', 0.81, true], [2880, 'down', 0.8, false],
    ]);
    // beat.accent on single notes too.
    const line = sixTab('title: Line\ntempo: 120\ntime: 4/4\n| q 3:5 3:5 3:5 3:5 |\n');
    line.tracks[0].measures[0].beats[0].accent = true;
    const notes = buildPlayEvents(flattenSong(line)).filter((e): e is PlayNote => e.kind === 'note');
    expect(notes.map((n) => [!!n.accent, n.velocity])).toEqual([[true, 0.98], [false, 0.78], [false, 0.78], [false, 0.78]]);
  });

  it('strokes are strongest on the felt beats of the meter: 1 and 4 of six eighths in 6/8, 2+2+3 in 7/8, halves in 2/2', () => {
    expect(feltBeats({ numerator: 6, denominator: 8 })).toEqual([0, 1440]);
    expect(feltBeats({ numerator: 7, denominator: 8 })).toEqual([0, 960, 1920]);
    expect(feltBeats({ numerator: 2, denominator: 2 })).toEqual([0, 1920]);
    const strums = (text: string) => buildPlayEvents(flattenSong(sixTab(text))).filter((e): e is PlayStrum => e.kind === 'strum').map((s) => s.velocity);
    // Before, every quarter note counted as a beat, so 6/8 was strummed like 3/4 (eighths 1, 3, 5 strong).
    expect(strums('title: J\ntempo: 60\ntime: 6/8\n| "C" e D D D D D D |\n')).toEqual([0.8, 0.72, 0.72, 0.8, 0.72, 0.72]);
    expect(strums('title: S\ntempo: 60\ntime: 7/8\n| "C" e D D D D D D D |\n')).toEqual([0.8, 0.72, 0.8, 0.72, 0.8, 0.72, 0.72]);
    expect(strums('title: W\ntempo: 90\ntime: 3/4\n| "C" q D D D |\n')).toEqual([0.8, 0.8, 0.8]);
    // A pickup is the end of a bar: an eighth-note pickup in 4/4 is the "and" of 4, not a downbeat.
    expect(strums('title: P\ntempo: 90\ntime: 4/4\npickup: e\n| "C" e D | q D D D D |\n')[0]).toBe(0.72);
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

  it('tells when the first beat is heard, after the count-in, so timing can be judged against the click', () => {
    const { player, rec, runTo, setNow } = setup(ODE_TO_JOY, { countInBars: 1 });
    expect(player.firstBeatTime).toBeNull();
    setNow(3);
    player.play();
    // Start 0.08 s from now, then one bar of count-in at 100 bpm (2.4 s).
    expect(player.firstBeatTime).toBeCloseTo(3 + 0.08 + 2.4, 9);
    runTo(7);
    expect(rec.notes[0].time).toBeCloseTo(player.firstBeatTime!, 9);
    expect(rec.clicks[0].time).toBeCloseTo(player.firstBeatTime! - 2.4, 9);
    expect(player.audioTimeAt(960 * 4)).toBeCloseTo(player.firstBeatTime! + 2.4, 9);
    // A seek while playing moves it to where the music lands.
    player.seek(3840 * 4);
    const t = player.firstBeatTime!;
    runTo(9);
    expect(rec.notes.find((n) => n.e.tick === 3840 * 4)!.time).toBeCloseTo(t, 9);
    player.pause();
    expect(player.audioTimeAt(0)).toBeNull();
    // Without a count-in the music starts right away.
    const b = setup(ODE_TO_JOY, { countInBars: 0 });
    b.player.play();
    expect(b.player.firstBeatTime).toBeCloseTo(0.08, 9);
  });

  it('disposes cleanly', () => {
    const { player, rec } = setup(ODE_TO_JOY);
    player.play();
    player.dispose();
    expect(rec.stops()).toBeGreaterThan(0);
  });
});
