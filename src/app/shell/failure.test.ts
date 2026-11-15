import { describe, expect, it } from 'vitest';
import { isLoadFailure, recoveryFor } from './failure';

describe('isLoadFailure', () => {
  it('recognises a screen whose code could not be fetched, in every browser wording', () => {
    expect(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: http://localhost/assets/tuner-abc.js'))).toBe(true);
    expect(isLoadFailure(new TypeError('error loading dynamically imported module: http://localhost/assets/tuner-abc.js'))).toBe(true);
    expect(isLoadFailure(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isLoadFailure(new Error('Unable to preload CSS for /assets/tuner-abc.css'))).toBe(true);
    const chunk = new Error('Loading chunk 12 failed.');
    chunk.name = 'ChunkLoadError';
    expect(isLoadFailure(chunk)).toBe(true);
  });

  it('does not mistake an ordinary crash for a load failure', () => {
    expect(isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'frequency')"))).toBe(false);
    expect(isLoadFailure(new Error('Failed to fetch'))).toBe(false); // a screen's own network call, not its code
    expect(isLoadFailure('Failed to fetch dynamically imported module')).toBe(false);
    expect(isLoadFailure(null)).toBe(false);
  });
});

describe('recoveryFor', () => {
  it('retries a crash once, then leads with a reload', () => {
    const crash = new Error('boom');
    expect(recoveryFor(crash, 0)).toBe('retry');
    expect(recoveryFor(crash, 1)).toBe('reload');
    expect(recoveryFor(crash, 3)).toBe('reload');
  });

  it('goes straight to a reload when the code never arrived', () => {
    expect(recoveryFor(new TypeError('Failed to fetch dynamically imported module: x'), 0)).toBe('reload');
  });
});
