import { describe, expect, it } from 'vitest';
import { parsePlayerParams, requestKey, resolveRequest } from './params';
import { defaultSession, openingState, RESUME_WITHIN_MS, sanitizeSession, sessionKey } from './session';

const SHAPE = { barCount: 16, totalTicks: 16 * 3840, trackIds: ['melody', 'teacher'] };
const SONG = { bars: Array.from({ length: 16 }, () => ({ time: { numerator: 4, denominator: 4 } })), sections: [{ name: 'Chorus', start: 8, end: 16 }] };
const NOW = 1_800_000_000_000;

function open(params: string[], saved: ReturnType<typeof defaultSession> | null, now = NOW, micBlocked = false) {
  const req = resolveRequest(parsePlayerParams(params), SONG);
  return openingState(saved, req, requestKey(params), { now, layer: 'tab', micBlocked });
}

describe('player session', () => {
  it('has a key per song', () => {
    expect(sessionKey('greensleeves')).toBe('player.session.greensleeves');
  });

  it('reads a stored session field by field and drops what does not fit the song', () => {
    expect(sanitizeSession(null, SHAPE)).toBeNull();
    expect(sanitizeSession({ v: 2 }, SHAPE)).toBeNull();
    const s = sanitizeSession({ v: 1, tick: 99_999_999, bar: 40, tempo: 7, loop: { from: 20, to: 30 }, mode: 'dance', track: 'bass', muted: ['teacher', 'drums'], countIn: false, trainer: { on: true } }, SHAPE)!;
    expect(s).toMatchObject({ tick: SHAPE.totalTicks, bar: 15, tempo: 25, loop: null, mode: 'listen', track: null, muted: ['teacher'], countIn: false, metronome: false, neck: true });
    expect(s.trainer).toMatchObject({ on: true, start: 70 });
  });

  it('restores everything on a reload of the same address', () => {
    const saved = { ...defaultSession(), opened: 'm9-12--t70', at: NOW - 60_000, tick: 40_000, bar: 10, tempo: 85, loop: { from: 8, to: 11 }, mode: 'flow' as const };
    const r = open(['x', 'm9-12', 't70'], saved);
    expect(r.resumed).toBe(true);
    expect(r.session).toMatchObject({ tick: 40_000, tempo: 85, loop: { from: 8, to: 11 }, mode: 'flow' });
  });

  it('follows a new address, keeping the learner’s preferences for the song', () => {
    const saved = { ...defaultSession(), opened: '', at: NOW - 60_000, tick: 40_000, bar: 10, tempo: 85, layer: 'both' as const, countIn: false, muted: ['teacher'] };
    const r = open(['x', 'chorus', 't70'], saved);
    expect(r.resumed).toBe(false);
    expect(r.session).toMatchObject({ loop: { from: 8, to: 15 }, bar: 8, tick: -1, tempo: 70, layer: 'both', countIn: false, muted: ['teacher'], opened: 'chorus--t70' });
  });

  it('offers the saved place back when the address names none and it is recent', () => {
    const saved = { ...defaultSession(), opened: 'flow', at: NOW - 60_000, tick: 40_000, bar: 10 };
    expect(open(['x'], saved)).toMatchObject({ resumed: true, session: { tick: 40_000, bar: 10 } });
    // Next week it starts from the top.
    expect(open(['x'], { ...saved, at: NOW - RESUME_WITHIN_MS - 1 })).toMatchObject({ resumed: false, session: { tick: 0, bar: 0 } });
  });

  it('starts fresh without a saved session, in the learner’s view', () => {
    const r = openingState(null, resolveRequest(parsePlayerParams(['x']), SONG), '', { now: NOW, layer: 'both', micBlocked: false });
    expect(r).toMatchObject({ resumed: false, session: { tick: 0, tempo: 100, mode: 'listen', layer: 'both', countIn: true } });
  });

  it('turns a microphone mode into tap-along where there is no microphone', () => {
    expect(open(['x', 'wait'], null, NOW, true).session.mode).toBe('tap');
    expect(open(['x', 'listen'], null, NOW, true).session.mode).toBe('listen');
  });
});
