import { describe, expect, it } from 'vitest';
import { NO_FORMAT, NO_RECORDER, recorderSupport, type SupportFacts } from './support';

const GOOD: SupportFacts = { artifact: false, hasMediaApi: true, secure: true, hasRecorder: true, isTypeSupported: (t) => t === 'audio/webm;codecs=opus' };

describe('recorderSupport', () => {
  it('records where the browser can', () => {
    expect(recorderSupport(GOOD)).toEqual({ ok: true, mimeType: 'audio/webm;codecs=opus' });
  });

  it('says the viewer refuses the microphone inside a Claude artifact, whatever else is true', () => {
    expect(recorderSupport({ ...GOOD, artifact: true })).toEqual({ ok: false, kind: 'media', reason: 'blocked-by-host' });
    expect(recorderSupport({ ...GOOD, artifact: true, hasMediaApi: false, hasRecorder: false })).toEqual({ ok: false, kind: 'media', reason: 'blocked-by-host' });
  });

  it('explains a missing microphone API and an insecure address with the media wording', () => {
    expect(recorderSupport({ ...GOOD, hasMediaApi: false })).toEqual({ ok: false, kind: 'media', reason: 'unsupported' });
    expect(recorderSupport({ ...GOOD, secure: false })).toEqual({ ok: false, kind: 'media', reason: 'insecure-context' });
  });

  it('explains a browser without MediaRecorder, or without a format it can play back', () => {
    expect(recorderSupport({ ...GOOD, hasRecorder: false })).toEqual({ ok: false, kind: 'recorder', ...NO_RECORDER });
    expect(recorderSupport({ ...GOOD, isTypeSupported: () => false })).toEqual({ ok: false, kind: 'recorder', ...NO_FORMAT });
  });

  it('lets the browser choose when it cannot be asked about formats', () => {
    expect(recorderSupport({ ...GOOD, isTypeSupported: null })).toEqual({ ok: true, mimeType: null });
  });
});
