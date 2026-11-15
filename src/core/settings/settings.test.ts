import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING_ID_FALLBACK, prefsWith } from './testing';
import { SPEECH_PREF_KEY as PROFILE_SPEECH_KEY } from '@/features/profile/settings/model';
import { aiAllowed, cameraDeviceId, cameraMirrored, fretCount, learnerTuning, micOptions, showNotation, soundPrefs, SPEECH_PREF_KEY } from './index';

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
