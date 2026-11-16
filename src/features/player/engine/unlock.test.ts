import { describe, expect, it } from 'vitest';
import { createUnlockQueue } from './unlock';

describe('unlock queue', () => {
  // Review: each engine opened before the first tap registered a hook the audio module never
  // drops, keeping the disposed engine (song, timeline, player) in memory.
  it('registers one hook, runs what is waiting once, and forgets what was cancelled', () => {
    const hooks: Array<() => void> = [];
    const when = createUnlockQueue((fn) => hooks.push(fn));
    const ran: string[] = [];
    const offA = when(() => ran.push('a'));
    when(() => ran.push('b'));
    offA();
    expect(hooks).toHaveLength(1);
    hooks[0]();
    expect(ran).toEqual(['b']);
    // A second unlock (the context resumed) runs nothing twice.
    hooks[0]();
    expect(ran).toEqual(['b']);
    when(() => ran.push('c'));
    expect(hooks).toHaveLength(1);
    hooks[0]();
    expect(ran).toEqual(['b', 'c']);
  });
});
