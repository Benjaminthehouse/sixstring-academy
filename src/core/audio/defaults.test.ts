import { afterEach, describe, expect, it } from 'vitest';
import { createActions, createProgressStore, memoryStorage, setProgressStore } from '@/core/progress';
import { BUILT_IN_SOUND_DEFAULTS, connectSoundDefaults, setSoundDefaultsSource, soundDefaults } from './defaults';
import { getGuitar } from './guitar';
import { Metronome } from './metronome';
import type { TransportClock } from './transport';

const clock: TransportClock = { now: () => 0, soundingNow: () => 0 };
const metronome = (): Metronome => new Metronome({ clock, timer: 'manual', output: { click: () => undefined } });

afterEach(() => {
  setSoundDefaultsSource(null);
  setProgressStore(null);
});

describe('soundDefaults', () => {
  it("is the engine's own steel guitar and woodblock when nothing says otherwise", () => {
    expect(soundDefaults()).toEqual(BUILT_IN_SOUND_DEFAULTS);
    expect(metronome().sound).toBe('woodblock');
  });

  it('maps stored setting names to engine names and survives nonsense', () => {
    setSoundDefaultsSource(() => ({ guitarTone: 'classical', clickSound: 'wood' }));
    expect(soundDefaults()).toEqual({ guitarTone: 'nylon', clickSound: 'woodblock' });
    setSoundDefaultsSource(() => ({ guitarTone: 42, clickSound: 'no-such-click' }));
    expect(soundDefaults()).toEqual(BUILT_IN_SOUND_DEFAULTS);
    setSoundDefaultsSource(() => {
      throw new Error('store gone');
    });
    expect(soundDefaults()).toEqual(BUILT_IN_SOUND_DEFAULTS);
  });
});

describe('the shared guitar and the metronome follow the defaults', () => {
  it('a new metronome clicks with the default, live, until a screen picks its own', () => {
    let click = 'beep';
    setSoundDefaultsSource(() => ({ clickSound: click }));
    const m = metronome();
    expect(m.sound).toBe('beep');
    click = 'cowbell';
    expect(m.sound).toBe('cowbell');
    m.sound = 'rim';
    click = 'tick';
    expect(m.sound).toBe('rim');
  });

  it('the shared guitar takes the default tone and keeps following it, but a tone a screen set wins', () => {
    let tone = 'electric';
    setSoundDefaultsSource(() => ({ guitarTone: tone }));
    expect(getGuitar().tone).toBe('clean');
    expect(getGuitar().baseTone).toBe('clean');
    tone = 'classical';
    expect(getGuitar().tone).toBe('nylon');
    expect(getGuitar().baseTone).toBe('nylon');
    getGuitar().tone = 'driven';
    tone = 'acoustic';
    expect(getGuitar().tone).toBe('driven');
    // Once the screen hands the default back, the guitar follows Settings again.
    getGuitar().tone = 'nylon';
    expect(getGuitar().tone).toBe('steel');
  });
});

describe("the learner's Settings reach the engine", () => {
  it('once connected, prefs.sound.guitarTone and clickSound are the defaults', async () => {
    const store = createProgressStore({ storage: memoryStorage() });
    setProgressStore(store);
    await connectSoundDefaults();
    expect(soundDefaults()).toEqual({ guitarTone: 'steel', clickSound: 'woodblock' });
    createActions(() => store).setPrefs({ sound: { guitarTone: 'nylon', clickSound: 'hihat' } });
    expect(soundDefaults()).toEqual({ guitarTone: 'nylon', clickSound: 'hihat' });
    expect(metronome().sound).toBe('hihat');
    expect(getGuitar().tone).toBe('nylon');
  });
});
