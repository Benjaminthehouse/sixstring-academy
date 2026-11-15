import { describe, expect, it } from 'vitest';
import { getTuning, STANDARD_TUNING } from '@/core/guitar';
import type { PitchTrackerOptions } from '@/core/pitch';
import { TunerSession, type Confirmation, type ReadoutState, type SessionOptions } from './session';
import { buildTargets } from './targets';
import { FakeTracker, join, pluck, rest } from './testkit';

interface Rig {
  session: TunerSession;
  tracker: FakeTracker;
  confirmations: Confirmation[];
}

function rig(overrides: Partial<SessionOptions> = {}): Rig {
  let tracker: FakeTracker | null = null;
  const session = new TunerSession({
    targets: buildTargets(STANDARD_TUNING),
    a4: 440,
    toleranceCents: 3,
    createTracker: (o: PitchTrackerOptions) => (tracker = new FakeTracker(o)),
    sleep: async () => undefined,
    wallClock: () => 1_000_000,
    ...overrides,
  });
  const confirmations: Confirmation[] = [];
  session.onConfirm((c) => confirmations.push(c));
  return { session, tracker: tracker as unknown as FakeTracker, confirmations };
}

/** What the readout mirrored while a buffer played: every distinct (state, note, string) and the settled cents. */
function listen(r: Rig, samples: Float32Array) {
  const states: ReadoutState[] = [];
  const notes = new Set<string>();
  const strings = new Set<string>();
  const cents: Array<{ t: number; c: number }> = [];
  let noteStart = -1;
  r.tracker.play(samples, (e) => {
    const f = r.session.frame;
    if (states[states.length - 1] !== f.state) states.push(f.state);
    if (f.note) notes.add(f.note);
    if (f.string) strings.add(f.string);
    if (e.type === 'noteon') noteStart = e.time;
    if (e.type === 'pitch' && f.live && noteStart >= 0) cents.push({ t: e.time - noteStart, c: Number(f.centsText) });
  });
  const settled = cents.filter((x) => x.t > 0.6).map((x) => x.c).sort((a, b) => a - b);
  return { states, notes: [...notes], strings: [...strings], settled: settled.length ? settled[settled.length >> 1] : Number.NaN };
}

describe('TunerSession: microphone', () => {
  it('starts idle, listens after start and goes back to idle on stop', async () => {
    const r = rig();
    expect(r.session.getView().state).toBe('idle');
    expect(await r.session.start()).toBe(true);
    expect(r.session.getView()).toMatchObject({ source: 'mic', state: 'listening', mode: 'auto', instruction: 'pluck' });
    r.session.stop();
    expect(r.session.getView()).toMatchObject({ source: 'off', state: 'idle' });
    expect(r.tracker.stops).toBe(1);
  });

  it('asks the pipeline for a range low enough for the tuning', async () => {
    const standard = rig();
    await standard.session.start();
    expect(standard.tracker.starts[0]).toMatchObject({ a4: 440, minFreq: 60 });
    const bass = rig({ targets: buildTargets(getTuning('bass')!) });
    await bass.session.start();
    expect(bass.tracker.starts[0].minFreq).toBeCloseTo(30.9, 1);
  });

  it('reports a refused microphone and can try again', async () => {
    const r = rig();
    r.tracker.startResult = { ok: false, reason: 'denied', detail: 'nope' };
    expect(await r.session.start()).toBe(false);
    expect(r.session.getView()).toMatchObject({ source: 'off', state: 'idle', failure: { reason: 'denied', detail: 'nope' } });
    r.tracker.startResult = { ok: true };
    expect(await r.session.start()).toBe(true);
    expect(r.session.getView().failure).toBeNull();
  });

  it('falls back to the default microphone when the remembered one is gone', async () => {
    const r = rig({ deviceId: 'old-headset' });
    let calls = 0;
    r.tracker.start = async (o = {}) => {
      r.tracker.starts.push(o);
      return ++calls === 1 ? { ok: false, reason: 'no-device' } : { ok: true };
    };
    expect(await r.session.start()).toBe(true);
    expect(r.tracker.starts[0].deviceId).toBe('old-headset');
    expect(r.tracker.starts[1].deviceId).toBeUndefined();
  });

  it('an automatic start that the browser will not run asks for a tap instead of failing', async () => {
    const r = rig();
    r.tracker.audioContext = { state: 'suspended' };
    expect(await r.session.start({ gesture: false })).toBe(false);
    expect(r.session.getView()).toMatchObject({ source: 'off', needsTap: true, failure: null });
    expect(r.tracker.stops).toBe(1);
    // The same situation after a tap is a real failure.
    expect(await r.session.start({ gesture: true })).toBe(false);
    expect(r.session.getView().failure).toMatchObject({ reason: 'audio-failed' });
  });

  it('a stop while the permission prompt is open wins', async () => {
    const r = rig();
    let release: (v: { ok: true }) => void = () => undefined;
    r.tracker.start = () => new Promise((resolve) => (release = resolve));
    const starting = r.session.start();
    expect(r.session.getView().source).toBe('starting');
    r.session.stop();
    release({ ok: true });
    expect(await starting).toBe(false);
    expect(r.session.getView().source).toBe('off');
  });

  it('says so when the microphone is unplugged', async () => {
    const r = rig();
    await r.session.start();
    r.tracker.fail('device-lost');
    expect(r.session.getView()).toMatchObject({ source: 'off', fault: 'device-lost', state: 'idle' });
  });
});

describe('TunerSession: automatic mode on real analysed audio', () => {
  const strings = [
    { midi: 40, note: 'E2', string: '6' },
    { midi: 45, note: 'A2', string: '5' },
    { midi: 50, note: 'D3', string: '4' },
    { midi: 55, note: 'G3', string: '3' },
    { midi: 59, note: 'B3', string: '2' },
    { midi: 64, note: 'E4', string: '1' },
  ];
  const offsets = [-30, -8, -2, 0, 2, 8, 30];

  for (const s of strings) {
    it(`names ${s.note}, reads its offset and confirms only inside the tolerance`, async () => {
      const r = rig();
      await r.session.start();
      for (const cents of offsets) {
        const before = r.confirmations.length;
        const heard = listen(r, join(pluck(s.midi, cents), rest(0.6)));
        expect(heard.notes, `${s.note} ${cents}`).toEqual([s.note]);
        expect(heard.strings).toEqual([s.string]);
        expect(Math.abs(heard.settled - cents), `${s.note} at ${cents}: read ${heard.settled}`).toBeLessThan(1.5);
        const confirmed = r.confirmations.length > before;
        expect(confirmed, `${s.note} at ${cents} cents`).toBe(Math.abs(cents) <= 3);
        expect(heard.states.includes('in-tune')).toBe(Math.abs(cents) <= 3);
        expect(heard.states[heard.states.length - 1]).toBe('listening');
      }
    });
  }

  it('ticks a string when it is confirmed and un-ticks it when it is heard out of tune', async () => {
    const r = rig();
    await r.session.start();
    r.tracker.play(join(pluck(45, 1), rest(0.5)));
    expect(r.session.getView().confirmed).toEqual([false, true, false, false, false, false]);
    expect(r.confirmations).toHaveLength(1);
    expect(r.confirmations[0]).toMatchObject({ index: 1, count: 1, all: false, fresh: true, guided: false });
    // Confirmed again: no second celebration.
    r.tracker.play(join(pluck(45, -1), rest(0.5)));
    expect(r.confirmations[1]).toMatchObject({ index: 1, fresh: false });
    expect(r.session.getView().confirmations).toBe(1);
    r.tracker.play(join(pluck(45, 25), rest(0.5)));
    expect(r.session.getView().confirmed[1]).toBe(false);
  });

  it('keeps the last note readable for a moment after it stops, then clears it', async () => {
    const r = rig();
    await r.session.start();
    r.tracker.play(join(pluck(55, -12, { duration: 1.2 }), rest(0.6)));
    expect(r.session.getView()).toMatchObject({ state: 'listening', shownNote: 'G3', shownLive: false, instruction: 'pluck' });
    expect(r.session.frame.note).toBe('');
    r.tracker.play(rest(3));
    expect(r.session.getView()).toMatchObject({ shownNote: '', shownIndex: -1 });
  });

  it('silence and steady noise show no note', async () => {
    const r = rig();
    await r.session.start();
    const quiet = listen(r, rest(3));
    expect(quiet.notes).toEqual([]);
    expect(quiet.states).toEqual(['listening']);
    // Deterministic noise at about -32 dBFS.
    let seed = 7;
    const noise = new Float32Array(4 * 48000).map(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 0xffffffff - 0.5) * 0.09;
    });
    const noisy = listen(r, noise);
    expect(noisy.notes).toEqual([]);
    expect(noisy.states).toEqual(['listening']);
    expect(r.confirmations).toHaveLength(0);
  });

  it('admits when its guess of the string is shaky', async () => {
    const r = rig();
    await r.session.start();
    const unsure = new Set<boolean>();
    const watch = () => {
      if (r.session.frame.live) unsure.add(r.session.getView().unsure);
    };
    // The A string a minor third flat sounds nearer to the low E: automatic mode cannot know.
    r.tracker.play(join(pluck(42, 0), rest(0.4)), watch);
    expect(unsure.has(true)).toBe(true);
    unsure.clear();
    r.tracker.play(join(pluck(45, -30), rest(0.4)), watch);
    expect([...unsure]).toEqual([false]);
    // The octave harmonic at the 12th fret is that string, not a doubt.
    unsure.clear();
    r.tracker.play(join(pluck(62, 2), rest(0.4)), watch);
    expect([...unsure]).toEqual([false]);
    expect(r.session.getView().confirmed[2]).toBe(true);
    // A locked string has no guess to doubt.
    r.session.lock(1);
    unsure.clear();
    r.tracker.play(join(pluck(42, 0), rest(0.4)), watch);
    expect([...unsure]).toEqual([false]);
  });

  it('gives the instruction in words for each side', async () => {
    const r = rig();
    await r.session.start();
    const seen = new Set<string>();
    const watch = () => seen.add(r.session.getView().instruction);
    r.tracker.play(join(pluck(50, -30), rest(0.4)), watch);
    expect(seen.has('tighten')).toBe(true);
    seen.clear();
    r.tracker.play(join(pluck(50, -7), rest(0.4)), watch);
    expect(seen.has('tighten-little')).toBe(true);
    expect(seen.has('loosen')).toBe(false);
    seen.clear();
    r.tracker.play(join(pluck(50, 7), rest(0.4)), watch);
    expect(seen.has('loosen-little')).toBe(true);
    seen.clear();
    r.tracker.play(join(pluck(50, 40), rest(0.4)), watch);
    expect(seen.has('loosen')).toBe(true);
    seen.clear();
    r.tracker.play(join(pluck(50, 0), rest(0.4)), watch);
    expect(seen.has('hold')).toBe(true);
    expect(seen.has('in-tune')).toBe(true);
  });
});

describe('TunerSession: tunings, capo, reference pitch, tolerance', () => {
  it('follows drop D and an open tuning', async () => {
    const drop = rig({ targets: buildTargets(getTuning('drop-d')!) });
    await drop.session.start();
    const low = listen(drop, join(pluck(38, -6), rest(0.5)));
    expect(low.notes).toEqual(['D2']);
    expect(low.strings).toEqual(['6']);
    expect(Math.abs(low.settled + 6)).toBeLessThan(1.5);

    const openG = rig({ targets: buildTargets(getTuning('open-g')!) });
    await openG.session.start();
    const fifth = listen(openG, join(pluck(43, 2), rest(0.5)));
    expect(fifth.notes).toEqual(['G2']);
    expect(fifth.strings).toEqual(['5']);
    expect(openG.session.getView().confirmed[1]).toBe(true);
    const first = listen(openG, join(pluck(62, 9), rest(0.5)));
    expect(first.notes).toEqual(['D4']);
    expect(first.strings).toEqual(['1']);
  });

  it('a capo shifts every target', async () => {
    const r = rig({ targets: buildTargets(STANDARD_TUNING, { capo: 2 }) });
    await r.session.start();
    const heard = listen(r, join(pluck(42, 1), rest(0.5)));
    expect(heard.notes).toEqual(['F#2']);
    expect(heard.strings).toEqual(['6']);
    expect(Math.abs(heard.settled - 1)).toBeLessThan(1.5);
    expect(r.confirmations).toHaveLength(1);
    // The open string is now a whole step flat: it must not be accepted.
    r.tracker.play(join(pluck(40, 0), rest(0.5)));
    expect(r.confirmations).toHaveLength(1);
  });

  it('a different reference pitch moves the targets', async () => {
    const r = rig({ targets: buildTargets(STANDARD_TUNING, { a4: 432 }), a4: 432 });
    await r.session.start();
    const atOld = listen(r, join(pluck(45, 0, { a4: 440 }), rest(0.5)));
    // A2 at 440 is 31.8 cents sharp of A2 at 432.
    expect(Math.abs(atOld.settled - 31.8)).toBeLessThan(1.5);
    expect(r.confirmations).toHaveLength(0);
    const atNew = listen(r, join(pluck(45, 0, { a4: 432 }), rest(0.5)));
    expect(Math.abs(atNew.settled)).toBeLessThan(1.5);
    expect(r.confirmations).toHaveLength(1);
  });

  it('changing the tuning while running clears the ticks and reconfigures the pipeline', async () => {
    const r = rig();
    await r.session.start();
    r.tracker.play(join(pluck(40, 0), rest(0.5)));
    expect(r.session.getView().confirmed[0]).toBe(true);
    r.session.configure({ targets: buildTargets(getTuning('drop-c')!) });
    expect(r.session.getView().confirmed).toEqual([false, false, false, false, false, false]);
    expect(r.tracker.configured[0].minFreq).toBeLessThan(60);
    const low = listen(r, join(pluck(36, 0), rest(0.5)));
    expect(low.notes).toEqual(['C2']);
  });

  it('the fine tolerance accepts one cent and refuses two', async () => {
    const r = rig({ toleranceCents: 1 });
    await r.session.start();
    r.tracker.play(join(pluck(59, 2.2), rest(0.5)));
    expect(r.confirmations).toHaveLength(0);
    r.tracker.play(join(pluck(59, 0.3), rest(0.5)));
    expect(r.confirmations).toHaveLength(1);
    // Back to standard: two cents is fine again, and the tick survived the change.
    r.session.configure({ toleranceCents: 3 });
    expect(r.session.getView().confirmed[4]).toBe(true);
    r.tracker.play(join(pluck(55, 2.2), rest(0.5)));
    expect(r.session.getView().confirmed[3]).toBe(true);
  });
});

describe('TunerSession: chromatic and locked modes', () => {
  it('chromatic mode names notes that are not in the tuning', async () => {
    const r = rig();
    await r.session.start();
    r.session.setMode('chromatic');
    const fSharp = listen(r, join(pluck(54, -5), rest(0.5)));
    expect(fSharp.notes).toEqual(['F#3']);
    expect(fSharp.strings).toEqual([]);
    expect(Math.abs(fSharp.settled + 5)).toBeLessThan(1.5);
    const c4 = listen(r, join(pluck(60, 1), rest(0.5)));
    expect(c4.notes).toEqual(['C4']);
    expect(r.confirmations.at(-1)).toMatchObject({ index: -1, midi: 60, all: false });
    expect(r.session.getView().confirmed.some(Boolean)).toBe(false);
  });

  it('chromatic mode can spell with flats', async () => {
    const r = rig({ preferFlats: true });
    await r.session.start();
    r.session.setMode('chromatic');
    expect(listen(r, join(pluck(51, 0), rest(0.5))).notes).toEqual(['Eb3']);
  });

  it('a locked string stays the target, warns about another string and releases', async () => {
    const r = rig();
    await r.session.start();
    r.session.lock(1);
    expect(r.session.getView()).toMatchObject({ mode: 'locked', target: 1, shownNote: 'A2', shownLive: false });
    const seen = new Set<string>();
    r.tracker.play(join(pluck(50, 0), rest(0.5)), () => seen.add(`${r.session.getView().instruction}:${r.session.getView().otherIndex}`));
    expect(seen.has('other-string:2')).toBe(true);
    expect(r.confirmations).toHaveLength(0);
    r.session.lock(null);
    expect(r.session.getView()).toMatchObject({ mode: 'auto', target: -1 });
  });

  it('a string a minor third flat gets the far-below warning instead of snapping to another string', async () => {
    const r = rig();
    await r.session.start();
    r.session.lock(1);
    const seen = new Set<string>();
    const heard = new Set<string>();
    r.tracker.play(join(pluck(42, 0, { duration: 2 }), rest(0.5)), () => {
      seen.add(r.session.getView().instruction);
      if (r.session.frame.note) heard.add(`${r.session.frame.note}/${r.session.frame.string}`);
    });
    expect([...heard]).toEqual(['A2/5']);
    expect(seen.has('far-below')).toBe(true);
    expect(seen.has('other-string')).toBe(false);
    // The thickest string has nothing below it, so automatic mode warns as well.
    r.session.lock(null);
    seen.clear();
    r.tracker.play(join(pluck(37, 0, { duration: 2 }), rest(0.5)), () => seen.add(r.session.getView().instruction));
    expect(seen.has('far-below')).toBe(true);
  });
});

describe('TunerSession: the guided flow', () => {
  it('walks from the thickest string to the thinnest and finishes with everything confirmed', async () => {
    const r = rig();
    await r.session.start();
    r.session.startGuide();
    expect(r.session.getView()).toMatchObject({ mode: 'guide', target: 0, shownNote: 'E2', instruction: 'pluck' });
    const order = [40, 45, 50, 55, 59, 64];
    order.forEach((midi, i) => {
      expect(r.session.getView().guide?.index).toBe(i);
      // Each string rings on into the next pluck, as it does on a real guitar.
      r.tracker.play(pluck(midi, i % 2 ? 1.5 : -1, { duration: 1.4, damp: false }));
    });
    r.tracker.play(rest(0.6));
    const view = r.session.getView();
    expect(view.guide?.finished).toBe(true);
    expect(view.mode).toBe('auto');
    expect(view.allConfirmed).toBe(true);
    expect(r.confirmations.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.confirmations.every((c) => c.guided && c.fresh)).toBe(true);
    expect(r.confirmations.at(-1)).toMatchObject({ count: 6, all: true });
    r.session.leaveGuide();
    expect(r.session.getView().guide).toBeNull();
  });

  it('shows the success for a moment, then asks for the next string without reading the old one', async () => {
    const r = rig();
    await r.session.start();
    r.session.startGuide();
    const afterConfirm: string[] = [];
    r.tracker.play(pluck(40, 0, { duration: 3, damp: false }), () => {
      if (r.confirmations.length) afterConfirm.push(`${r.session.getView().state}:${r.session.getView().shownNote}:${r.session.getView().instruction}`);
    });
    // Right after the confirmation the readout celebrates E2; later it waits for A2. The ringing E is never judged against A.
    expect(afterConfirm[0]).toBe('in-tune:E2:in-tune');
    expect(afterConfirm.at(-1)).toBe('listening:A2:pluck');
    expect(afterConfirm.some((s) => s.includes('other-string') || s.includes('far-'))).toBe(false);
    expect(r.session.getView().guide?.index).toBe(1);
  });

  it('can skip a string and jump to another', async () => {
    const r = rig();
    await r.session.start();
    r.session.startGuide();
    r.session.skipGuideString();
    expect(r.session.getView().guide).toMatchObject({ index: 1, skipped: [true, false, false, false, false, false] });
    r.session.lock(4);
    expect(r.session.getView()).toMatchObject({ mode: 'guide', target: 4 });
    r.tracker.play(join(pluck(59, 0), rest(0.3)));
    expect(r.session.getView().guide?.index).toBe(5);
    r.tracker.play(join(pluck(64, 0), rest(0.3)));
    // Wraps round to the strings not done yet (the skipped one stays skipped).
    expect(r.session.getView().guide?.index).toBe(1);
    for (const midi of [45, 50, 55]) r.tracker.play(join(pluck(midi, 0), rest(0.3)));
    expect(r.session.getView().guide?.finished).toBe(true);
    expect(r.session.getView().allConfirmed).toBe(false);
    expect(r.session.getView().confirmed).toEqual([false, true, true, true, true, true]);
  });

  it('a new tuning restarts a running guide', async () => {
    const r = rig();
    await r.session.start();
    r.session.startGuide();
    r.tracker.play(join(pluck(40, 0), rest(0.3)));
    expect(r.session.getView().guide?.index).toBe(1);
    r.session.configure({ targets: buildTargets(getTuning('dadgad')!) });
    expect(r.session.getView()).toMatchObject({ mode: 'guide', target: 0, shownNote: 'D2' });
  });
});

describe('TunerSession: ignoring its own sounds', () => {
  it('drops readings while a reference note plays and waits for a new pluck afterwards', async () => {
    const r = rig();
    await r.session.start();
    r.session.setPaused(true);
    expect(r.session.getView().paused).toBe(true);
    const during = listen(r, pluck(45, 0, { duration: 1.5, damp: false }));
    expect(during.notes).toEqual([]);
    expect(r.confirmations).toHaveLength(0);
    r.session.setPaused(false);
    // The note that began under the reference tone is not judged; the next pluck is.
    const tail = listen(r, join(pluck(45, 0, { duration: 0.4 }), rest(0.4)));
    expect(tail.notes.length).toBeLessThanOrEqual(1);
    const next = listen(r, join(pluck(45, 0), rest(0.5)));
    expect(next.notes).toEqual(['A2']);
  });

  it('a short hush freezes the readout instead of clearing it', async () => {
    const r = rig();
    await r.session.start();
    let hushed = false;
    const states: string[] = [];
    r.session.onConfirm(() => {
      r.session.hush(0.5);
      hushed = true;
    });
    r.tracker.play(join(pluck(64, 0, { duration: 2 }), rest(0.5)), () => {
      if (hushed) states.push(r.session.getView().state);
    });
    expect(hushed).toBe(true);
    // In tune all through the hush and until the string really stops.
    expect(states[0]).toBe('in-tune');
    expect(states.at(-1)).toBe('listening');
  });

  it('marks strings by ear without the microphone', () => {
    const r = rig();
    for (let i = 0; i < 6; i++) r.session.confirmByEar(i);
    expect(r.session.getView().allConfirmed).toBe(true);
    expect(r.confirmations.at(-1)).toMatchObject({ index: 5, count: 6, all: true, fresh: true });
    r.session.resetConfirmed();
    expect(r.session.getView().confirmed.some(Boolean)).toBe(false);
  });
});

describe('TunerSession: the view', () => {
  it('does not notify React for every audio frame', async () => {
    const r = rig();
    await r.session.start();
    let renders = 0;
    let frames = 0;
    r.session.subscribe(() => renders++);
    r.session.onFrame(() => frames++);
    r.tracker.play(join(pluck(55, -14, { duration: 2 }), rest(0.5)));
    expect(frames).toBeGreaterThan(200);
    expect(renders).toBeLessThan(12);
  });
});
