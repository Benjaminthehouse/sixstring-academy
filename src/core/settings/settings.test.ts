import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING_ID_FALLBACK, prefsWith } from './testing';
import { SPEECH_PREF_KEY as PROFILE_SPEECH_KEY } from '@/features/profile/settings/model';
import { aiAllowed, cameraDeviceId, cameraMirrored, fretCount, learnerTuning, micOptions, micOptionsWith, showNotation, soundPrefs, SPEECH_PREF_KEY } from './index';

describe('micOptions', () => {
  it('gives the pitch module its own onset default at the default sensitivity', () => {
    expect(micOptions(prefsWith({})).onset).toEqual({ minLevelDb: -55 });
  });

  it('hears quieter playing as sensitivity rises', () => {
    const loud = micOptions(prefsWith({ mic: { deviceId: null, sensitivity: 0 } })).onset!.minLevelDb!;
    const quiet = micOptions(prefsWith({ mic: { deviceId: null, sensitivity: 1 } })).onset!.minLevelDb!;
    expect(loud).toBe(-40);
    expect(quiet).toBe(-70);
  });

  it('passes the reference pitch and only a chosen device', () => {
    expect(micOptions(prefsWith({ a4: 442 }))).toMatchObject({ a4: 442 });
    expect(micOptions(prefsWith({})).deviceId).toBeUndefined();
    expect(micOptions(prefsWith({ mic: { deviceId: 'usb-1', sensitivity: 0.5 } })).deviceId).toBe('usb-1');
  });
});

describe('micOptions: the note gate', () => {
  it("is the note tracker's own default gate at the default sensitivity", () => {
    expect(micOptions(prefsWith({})).tracker).toEqual({ minGateDb: -68, maxGateDb: -38 });
  });

  it('lets quieter notes through as sensitivity rises, and only loud ones at zero', () => {
    const at = (sensitivity: number) => micOptions(prefsWith({ mic: { deviceId: null, sensitivity } })).tracker!;
    expect(at(0)).toEqual({ minGateDb: -58, maxGateDb: -32 });
    expect(at(1)).toEqual({ minGateDb: -78, maxGateDb: -44 });
    for (let s = 0; s < 1; s += 0.1) {
      expect(at(s + 0.1).minGateDb!).toBeLessThanOrEqual(at(s).minGateDb!);
      expect(at(s).maxGateDb!).toBeGreaterThan(at(s).minGateDb!);
    }
  });

  it('treats a broken stored sensitivity as the default', () => {
    expect(micOptions(prefsWith({ mic: { deviceId: null, sensitivity: Number.NaN } })).tracker).toEqual({ minGateDb: -68, maxGateDb: -38 });
    expect(micOptions(prefsWith({ mic: { deviceId: null, sensitivity: 7 } })).tracker).toEqual({ minGateDb: -78, maxGateDb: -44 });
  });
});

describe('micOptionsWith', () => {
  const learner = prefsWith({ a4: 442, mic: { deviceId: 'usb-1', sensitivity: 1 } });

  it("merges a screen's own onset options without losing the learner's sensitivity", () => {
    const o = micOptionsWith({ onset: { minIntervalMs: 70, minLevelDb: -20 }, tracker: { holdMs: 200 }, chroma: true }, learner);
    expect(o.onset).toEqual({ minIntervalMs: 70, minLevelDb: -70 });
    expect(o.tracker).toEqual({ holdMs: 200, minGateDb: -78, maxGateDb: -44 });
    expect(o.chroma).toBe(true);
  });

  it("uses the learner's A4 and input unless the screen chose its own", () => {
    expect(micOptionsWith({}, learner)).toMatchObject({ a4: 442, deviceId: 'usb-1' });
    expect(micOptionsWith({ a4: 432, deviceId: 'other' }, learner)).toMatchObject({ a4: 432, deviceId: 'other' });
    expect(micOptionsWith({ deviceId: '' }, learner).deviceId).toBe('usb-1');
    expect('deviceId' in micOptionsWith({ deviceId: '' }, prefsWith({}))).toBe(false);
  });

  it('passes detector options through and never shares objects with the caller', () => {
    const own = { detector: { peakThreshold: 0.7 }, onset: { thresholdDb: 4 } };
    const o = micOptionsWith(own, learner);
    expect(o.detector).toEqual({ peakThreshold: 0.7 });
    o.onset!.thresholdDb = 9;
    o.detector!.peakThreshold = 0.1;
    expect(own).toEqual({ detector: { peakThreshold: 0.7 }, onset: { thresholdDb: 4 } });
  });
});

describe('learnerTuning', () => {
  it('resolves a catalog id and falls back to standard for an unknown one', () => {
    expect(learnerTuning(prefsWith({ tuningId: 'drop-d' })).midi).toEqual([38, 45, 50, 55, 59, 64]);
    expect(learnerTuning(prefsWith({ tuningId: DEFAULT_TUNING_ID_FALLBACK })).midi).toEqual([40, 45, 50, 55, 59, 64]);
  });
});

describe('simple readers', () => {
  it('reads the AI switch, camera, notation, frets and sound', () => {
    expect(aiAllowed(prefsWith({}))).toBe(false);
    expect(aiAllowed(prefsWith({ ai: { enabled: true } }))).toBe(true);
    expect(cameraMirrored(prefsWith({ camera: { deviceId: null, mirrored: true } }))).toBe(true);
    expect(cameraDeviceId(prefsWith({}))).toBeUndefined();
    expect(showNotation(prefsWith({ notation: 'tab+notation' }))).toBe(true);
    expect(showNotation(prefsWith({ notation: 'tab' }))).toBe(false);
    expect(fretCount(prefsWith({}))).toBeGreaterThanOrEqual(12);
    expect(Object.keys(soundPrefs(prefsWith({})))).toEqual(['guitarTone', 'clickSound', 'volume']);
  });

  it('uses the same speech key as the Settings screen', () => {
    expect(SPEECH_PREF_KEY).toBe(PROFILE_SPEECH_KEY);
  });
});
