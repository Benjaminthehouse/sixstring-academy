// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setProgressStore } from '@/core/progress';
import { makeRig } from '@/core/progress/testkit';
import { AiHelper } from './AiHelper';
import { keyCheckOutcome } from './model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The platform's key store and the check with Anthropic, under the test's control.
const key = vi.hoisted(() => ({ stored: null as string | null, answer: null as ((result: unknown) => void) | null }));
vi.mock('@/core/platform', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/platform')>();
  return {
    ...real,
    host: () => 'standalone',
    setApiKey: (text: string) => {
      key.stored = text.trim();
      return { ok: true };
    },
    clearApiKey: () => {
      key.stored = null;
    },
    hasApiKey: () => key.stored !== null,
    apiKeyHint: () => (key.stored ? `sk-ant-…${key.stored.slice(-4)}` : null),
    verifyApiKey: () =>
      new Promise((resolve) => {
        key.answer = resolve;
      }),
  };
});

const BAD = { ok: false, error: { kind: 'bad-key', message: 'Anthropic did not accept the key.' } } as const;

describe('what a key check means', () => {
  it('switches the helper on for a good key, forgets a rejected one, keeps one it could not check', () => {
    expect(keyCheckOutcome({ ok: true })).toEqual({ forget: false, enabled: true, check: { state: 'ok' } });
    const rejected = keyCheckOutcome(BAD);
    expect(rejected.forget).toBe(true);
    expect(rejected.enabled).toBe(false);
    expect(rejected.check.state).toBe('rejected');
    const offline = keyCheckOutcome({ ok: false, error: { kind: 'network', message: 'No connection.' } });
    expect(offline).toEqual({ forget: false, enabled: null, check: { state: 'unsure', message: 'No connection.' } });
  });
});

describe('the AI helper settings', () => {
  let host: HTMLDivElement;
  let root: Root;
  let rig: ReturnType<typeof makeRig>;

  beforeEach(() => {
    key.stored = null;
    key.answer = null;
    rig = makeRig({ start: '2026-11-15T19:00:00Z' });
    setProgressStore(rig.store);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<AiHelper />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    setProgressStore(null);
  });

  async function submitKey(text: string): Promise<void> {
    const input = host.querySelector<HTMLInputElement>('input[type="password"]');
    if (!input) throw new Error('no key field');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('forgets a rejected key and says so', async () => {
    await submitKey('sk-ant-api03-wrongwrongwrong1234');
    expect(key.stored).not.toBeNull();
    await act(async () => key.answer?.(BAD));
    expect(key.stored).toBeNull();
    expect(host.textContent).toContain('That key was not accepted');
    expect(host.textContent).not.toContain('wrongwrong');
    expect(rig.store.getState().prefs.ai.enabled).toBe(false);
  });

  // Review: leaving the screen while the key was being checked skipped the clean-up, so a key
  // Anthropic had rejected stayed saved and showed up as "Saved" on the next visit.
  it('forgets a rejected key even when the screen was left during the check', async () => {
    await submitKey('sk-ant-api03-wrongwrongwrong1234');
    act(() => root.unmount());
    await act(async () => key.answer?.(BAD));
    expect(key.stored).toBeNull();
    expect(rig.store.getState().prefs.ai.enabled).toBe(false);
    // The afterEach unmount must not fail on an already unmounted root.
    root = createRoot(host);
  });

  it('switches the helper on when the key works, and shows only its last four characters', async () => {
    await submitKey('sk-ant-api03-goodgoodgood9XyZ');
    await act(async () => key.answer?.({ ok: true }));
    expect(rig.store.getState().prefs.ai.enabled).toBe(true);
    expect(host.textContent).toContain('sk-ant-…9XyZ');
    expect(host.textContent).not.toContain('goodgoodgood');
    expect(host.querySelector('input[type="password"]')).toBeNull();
  });
});
