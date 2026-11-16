import { describe, expect, it } from 'vitest';
import { roomFor } from './room';

describe('room for the proofreader', () => {
  it('gives phones and desktops at normal text size the full layout', () => {
    expect(roomFor(390, 844, 16)).toEqual({ short: false, tight: false });
    expect(roomFor(1280, 800, 16)).toEqual({ short: false, tight: false });
    expect(roomFor(1366, 650, 16)).toEqual({ short: false, tight: false });
  });
  it('a phone held sideways is short whatever the text size', () => {
    expect(roomFor(844, 390, 16)).toEqual({ short: true, tight: false });
    expect(roomFor(740, 360, 32)).toEqual({ short: true, tight: false });
  });
  it('text at 200 %: a desktop goes side by side, an upright phone goes tight', () => {
    expect(roomFor(1280, 800, 32)).toEqual({ short: true, tight: false });
    expect(roomFor(390, 844, 32)).toEqual({ short: false, tight: true });
  });
  it('a tall tablet keeps the full layout even with large text', () => {
    expect(roomFor(820, 1180, 32)).toEqual({ short: false, tight: false });
  });
});
