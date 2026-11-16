// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Callbacks handed to `scheduleVisual`, run by the test when "the audio clock" reaches them. */
const visuals: Array<() => void> = [];
const stopAll = vi.fn();

vi.mock('@/core/audio', () => ({
  audioNow: () => 0,
  normalizeTone: () => 'steel',
  pluck: vi.fn(),
  strum: vi.fn(),
  stopAll: (...args: unknown[]) => stopAll(...args),
  scheduleVisual: (_time: number, fn: () => void) => visuals.push(fn),
  unlockAudio: () => Promise.resolve(true),
}));
vi.mock('@/core/guitar', () => ({
  chordVoicings: () => [{ notes: [{ string: 5, midi: 48 }, { string: 4, midi: 52 }, { string: 3, midi: 55 }] }],
}));
vi.mock('@/core/settings', () => ({ soundPrefs: () => ({ guitarTone: 'steel' }) }));
vi.mock('@/core/song', () => ({ SongPlayer: class {}, liveOutput: () => ({}) }));

const { playProgression, useSounder } = await import('./sound');
type Sounder = ReturnType<typeof useSounder>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLElement | null = null;

function mountSounder(): { current: Sounder } {
  const result = { current: undefined as unknown as Sounder };
  function Probe() {
    result.current = useSounder();
    return null;
  }
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(<Probe />));
  return result;
}

/** Let the unlock promise and the run settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The audio clock reaches every scheduled highlight. */
function runVisuals() {
  act(() => {
    for (const fn of visuals.splice(0)) fn();
  });
}

beforeEach(() => {
  visuals.length = 0;
  stopAll.mockClear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe('useSounder', () => {
  it('drops the scheduled steps of a progression that was stopped', async () => {
    const s = mountSounder();
    const steps: number[] = [];
    act(() => s.current.toggle('cadence', (alive) => playProgression(['C', 'F', 'G', 'C'], 'standard', (i) => alive() && steps.push(i))));
    await settle();
    expect(s.current.playing).toBe('cadence');
    expect(visuals.length).toBe(5); // four chords and the end

    // The first chord is heard, then the learner presses Stop.
    act(() => visuals.shift()!());
    act(() => s.current.stop());
    runVisuals();
    expect(steps).toEqual([0]);
    expect(s.current.playing).toBeNull();
  });

  it('drops the old steps when another sound replaces the progression', async () => {
    const s = mountSounder();
    const first: number[] = [];
    const second: number[] = [];
    act(() => s.current.toggle('cadence:c-major', (alive) => playProgression(['C', 'F', 'G', 'C'], 'standard', (i) => alive() && first.push(i))));
    await settle();
    const stale = visuals.splice(0);
    act(() => s.current.toggle('cadence:e-major', (alive) => playProgression(['E', 'A', 'B', 'E'], 'standard', (i) => alive() && second.push(i))));
    await settle();
    act(() => stale.forEach((fn) => fn()));
    runVisuals();
    expect(first).toEqual([]);
    expect(second).toEqual([0, 1, 2, 3, -1]);
  });

  it('tapping the playing sound again stops it', async () => {
    const s = mountSounder();
    act(() => s.current.toggle('x', () => 1));
    await settle();
    expect(s.current.playing).toBe('x');
    act(() => s.current.toggle('x', () => 1));
    expect(s.current.playing).toBeNull();
    expect(stopAll).toHaveBeenCalled();
  });

  it('a sound that fails to start does not leave a Stop button behind', async () => {
    const s = mountSounder();
    act(() =>
      s.current.toggle('broken', () => {
        throw new Error('no shape');
      }),
    );
    await settle();
    expect(s.current.playing).toBeNull();
  });
});
