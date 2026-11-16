// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setProgressStore } from '@/core/progress';
import { makeRig, type TestRig } from '@/core/progress/testkit';
import { useBandLog, type BandStatus } from './useBand';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeBand {
  status: BandStatus;
  started: boolean;
  takeStats: () => { seconds: number; changes: number };
}

function Logger({ band }: { band: FakeBand }) {
  useBandLog(band, { skillId: 'progression:pop-axis', title: 'Jam: I–V–vi–IV', params: ['pop-axis', 'g', 'jam'] });
  return null;
}

let rig: TestRig;
let root: Root;
let host: HTMLElement;
let played: number;

const band = (status: BandStatus): FakeBand => ({
  status,
  started: true,
  takeStats: () => {
    const out = { seconds: played, changes: Math.round(played / 2) };
    played = 0;
    return out;
  },
});
const jams = () => rig.store.getState().log.filter((e) => e.kind === 'progression');
/** The log as written to storage (the store saves an envelope: `{ app, v, savedAt, state }`). */
const stored = (): { log: Array<{ kind: string }> } => {
  const raw = [...rig.storage.data.values()].find((v) => v.includes('"log"'));
  return raw ? JSON.parse(raw).state : { log: [] };
};

function hide() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  rig = makeRig();
  setProgressStore(rig.store);
  played = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setProgressStore(null);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('logging the time played with the band', () => {
  it('logs a jam when the band stops, once, and nothing under 20 s', () => {
    act(() => root.render(<Logger band={band('playing')} />));
    played = 12;
    act(() => root.render(<Logger band={band('idle')} />));
    expect(jams()).toHaveLength(0);
    act(() => root.render(<Logger band={band('playing')} />));
    played = 45;
    act(() => root.render(<Logger band={band('idle')} />));
    expect(jams()).toHaveLength(1);
    expect(jams()[0]).toMatchObject({ kind: 'progression' });
  });

  // Bug: a jam was logged only on pagehide, after the store's own save on hide had already run,
  // so the record waited for a debounced save that a closing page never makes; and a phone that
  // switched apps (the page only hidden, later discarded) logged nothing at all.
  it('logs and writes it to storage at once when the page is hidden', () => {
    act(() => root.render(<Logger band={band('playing')} />));
    played = 90;
    act(() => hide());
    expect(jams()).toHaveLength(1);
    expect(rig.store.hasPendingSave()).toBe(false);
    expect(stored().log.filter((e) => e.kind === 'progression')).toHaveLength(1);
  });

  it('writes a jam logged as the page closes', () => {
    act(() => root.render(<Logger band={band('playing')} />));
    played = 30;
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(rig.store.hasPendingSave()).toBe(false);
    expect(stored().log.filter((e) => e.kind === 'progression')).toHaveLength(1);
  });
});

// ── The band hook itself (the real BackingBand runs silently on the wall clock in jsdom) ─────

import { backingFor, type BackingSetup } from '@/content/progressions';
import { currentBand, useBand, type Band } from './useBand';

let latestBand: Band | null = null;
function Player({ setup, onEnd }: { setup: BackingSetup; onEnd?: () => void }) {
  latestBand = useBand(setup, { muted: { drums: true, bass: true, keys: true, guitar: true }, onEnd });
  return null;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await act(() => wait(25));
  return fn();
}

describe('the band hook', () => {
  const inKey = (tonic: string, opts: { loop?: boolean; choruses?: number } = {}) =>
    backingFor('pop-axis', tonic, { loop: opts.loop ?? true, choruses: opts.choruses ?? 1, countInBars: 0, tempo: 240 });

  // Bug: a change while the band played (a new key, a chord added in the builder) reloads and
  // restarts the band, but the 'stop' that reloading sends arrived after the restart and was taken
  // for the end of the passes: the screen went back to "Play" (and stopped counting the time)
  // while the band went on playing.
  it('keeps playing, and says so, when the key changes mid-play', async () => {
    act(() => root.render(<Player setup={inKey('G')} />));
    await act(() => latestBand!.play());
    expect(await until(() => latestBand!.status === 'playing')).toBe(true);
    act(() => root.render(<Player setup={inKey('A')} />));
    await act(() => wait(600));
    expect(latestBand!.status).toBe('playing');
    expect(currentBand()?.playing).toBe(true);
    expect(await until(() => latestBand!.heard?.segment.chord.symbol === 'A' || latestBand!.heard?.segment.chord.symbol === 'E')).toBe(true);
  });

  it('reports the end of its passes, and a stop by the learner is no end', async () => {
    let ends = 0;
    act(() => root.render(<Player setup={inKey('G', { loop: false })} onEnd={() => ends++} />));
    await act(() => latestBand!.play());
    expect(await until(() => latestBand!.status === 'playing')).toBe(true);
    act(() => latestBand!.stop());
    await act(() => wait(300));
    expect(ends).toBe(0);
    await act(() => latestBand!.play());
    expect(await until(() => latestBand!.status === 'idle', 9000)).toBe(true);
    expect(ends).toBe(1);
  });
});
