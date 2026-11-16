// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remove, writeJSON } from '@/core/platform/storage';
import { SPEECH_PREF_KEY } from '@/core/settings';
import { SpeakButton } from './Speak';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The device's voice, under the test's control: every `speak` is recorded.
const voice = vi.hoisted(() => ({ said: [] as Array<{ text: string; voice?: string }>, state: { speaking: false, available: true, provider: 'browser', voice: null } }));
vi.mock('@/core/platform', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/platform')>();
  return {
    ...real,
    speechAvailable: async () => true,
    speak: async (text: string, opts: { voice?: string } = {}) => {
      voice.said.push({ text, voice: opts.voice });
      return { ok: true };
    },
    stopSpeaking: () => undefined,
    subscribeSpeech: () => () => undefined,
    getSpeechState: () => voice.state,
  };
});

describe('reading a teacher card aloud', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    voice.said = [];
    remove(SPEECH_PREF_KEY);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    remove(SPEECH_PREF_KEY);
  });

  async function show(props: { text: string; auto?: boolean }): Promise<void> {
    await act(async () => root.render(<SpeakButton teacher="mia" text={props.text} auto={props.auto} />));
    await act(async () => undefined);
  }

  it('reads a card by itself, once, in the teacher’s voice, while "Read explanations aloud" is on (the default)', async () => {
    await show({ text: 'Hold the pick loosely.', auto: true });
    expect(voice.said).toEqual([{ text: 'Hold the pick loosely.', voice: 'mia' }]);
    await show({ text: 'Hold the pick loosely.', auto: true });
    expect(voice.said).toHaveLength(1);
    await show({ text: 'Now strum down.', auto: true });
    expect(voice.said.map((s) => s.text)).toEqual(['Hold the pick loosely.', 'Now strum down.']);
  });

  it('stays quiet by itself when the learner switched reading aloud off, but the button still reads on request', async () => {
    writeJSON(SPEECH_PREF_KEY, false);
    await show({ text: 'Hold the pick loosely.', auto: true });
    expect(voice.said).toEqual([]);
    const button = host.querySelector<HTMLButtonElement>('[data-speak]');
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(voice.said).toEqual([{ text: 'Hold the pick loosely.', voice: 'mia' }]);
  });

  it('never reads by itself without `auto` (reactions, the unit summary)', async () => {
    await show({ text: 'Nicely done.' });
    expect(voice.said).toEqual([]);
  });
});
