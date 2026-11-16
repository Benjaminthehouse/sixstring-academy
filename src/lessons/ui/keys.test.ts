import { describe, expect, it } from 'vitest';
import { registerStepKeys, type StepKeyHandlers } from './keys';

describe('step keys from nested parts of one step', () => {
  it('a listening step registers Space after its options registered the numbers: both keep working', () => {
    const registry: { current: StepKeyHandlers | null } = { current: null };
    const picked: number[] = [];
    let played = 0;
    // React runs the child's effect (the options) before the parent's (the play button).
    const offOptions = registerStepKeys(registry, { current: { digit: (p) => (picked.push(p), true) } });
    const offListen = registerStepKeys(registry, { current: { space: () => (played++, true) } });
    expect(registry.current?.digit?.(1)).toBe(true);
    expect(registry.current?.space?.()).toBe(true);
    expect(picked).toEqual([1]);
    expect(played).toBe(1);
    // With the answer shown the options stop listening; Space still plays.
    offOptions();
    expect(registry.current?.digit?.(0)).toBeUndefined();
    expect(registry.current?.space?.()).toBe(true);
    offListen();
    expect(registry.current).toBeNull();
  });

  it('for a key both handle, the newest wins and its answer is final', () => {
    const registry: { current: StepKeyHandlers | null } = { current: null };
    const calls: string[] = [];
    registerStepKeys(registry, { current: { digit: () => (calls.push('old'), true) } });
    const off = registerStepKeys(registry, { current: { digit: (p) => (calls.push('new'), p < 2) } });
    expect(registry.current?.digit?.(5)).toBe(false);
    expect(calls).toEqual(['new']);
    off();
    expect(registry.current?.digit?.(5)).toBe(true);
    expect(calls).toEqual(['new', 'old']);
  });

  it('reads the handlers as they are now (a part can add or drop a key between renders)', () => {
    const registry: { current: StepKeyHandlers | null } = { current: null };
    const entry: { current: StepKeyHandlers } = { current: {} };
    registerStepKeys(registry, { current: { char: () => true } });
    registerStepKeys(registry, entry);
    expect(registry.current?.char?.('a')).toBe(true);
    entry.current = { char: () => false };
    expect(registry.current?.char?.('a')).toBe(false);
  });
});
