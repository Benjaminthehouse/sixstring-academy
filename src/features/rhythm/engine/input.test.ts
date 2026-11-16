import { describe, expect, it } from 'vitest';
import { prefsWith } from '@/core/settings/testing';
import { rhythmTrackerOptions } from './input';

describe('rhythmTrackerOptions', () => {
  it("hears with the learner's microphone settings and keeps its own strum spacing", () => {
    const prefs = prefsWith({ a4: 443, mic: { deviceId: 'usb-2', sensitivity: 0 } });
    const o = rhythmTrackerOptions(undefined, null, prefs);
    expect(o.a4).toBe(443);
    expect(o.deviceId).toBe('usb-2');
    // Sensitivity 0: only loud strums count, and the screen's 70 ms spacing survives the merge.
    expect(o.onset).toEqual({ minIntervalMs: 70, minLevelDb: -40 });
    expect(o.tracker).toEqual({ minGateDb: -58, maxGateDb: -32 });
  });

  it('opens the input it is handed, and shares the playback clock', () => {
    const ctx = {} as AudioContext;
    const o = rhythmTrackerOptions(ctx, 'picked', prefsWith({ mic: { deviceId: 'usb-2', sensitivity: 0.5 } }));
    expect(o.deviceId).toBe('picked');
    expect(o.audioContext).toBe(ctx);
    expect(o.onset).toEqual({ minIntervalMs: 70, minLevelDb: -55 });
  });
});
