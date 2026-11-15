import { describe, expect, it } from 'vitest';
import type { Host } from './env';
import { createSpeech, mapTtsError, pickVoice, speakableText, splitForSpeech, voiceProsody, type SpeakFailure, type VoiceInfo } from './speech';

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: unknown;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

function fakeSynth(voices: VoiceInfo[] = []) {
  const spoken: FakeUtterance[] = [];
  let current: FakeUtterance | null = null;
  let cancels = 0;
  const synth = {
    speak(utterance: FakeUtterance) {
      spoken.push(utterance);
      current = utterance;
    },
    cancel() {
      cancels += 1;
      const interrupted = current;
      current = null;
      interrupted?.onerror?.({ error: 'interrupted' });
    },
    getVoices: () => voices,
  };
  return {
    synth,
    spoken,
    cancels: () => cancels,
    /** The engine finishes the utterance it is on. */
    finish() {
      const done = current;
      current = null;
      done?.onend?.({});
    },
    fail(error: string) {
      const failed = current;
      current = null;
      failed?.onerror?.({ error });
    },
  };
}

const utterance = (text: string): FakeUtterance => ({ text, lang: '', rate: 1, pitch: 1, volume: 1, voice: null, onend: null, onerror: null });

interface TtsCall {
  verb: 'speak' | 'add' | 'stop';
  what?: unknown;
  options?: unknown;
}

function fakeTts(outcome: () => Promise<{ playedMs: number }> = async () => ({ playedMs: 1200 })) {
  const calls: TtsCall[] = [];
  let stateHandler: ((event: { state: 'idle' | 'starting' | 'speaking' | 'paused'; reason?: string }) => void) | null = null;
  const tts = {
    speak: (what: unknown, options: unknown) => {
      calls.push({ verb: 'speak', what, options });
      return outcome();
    },
    add: (what: unknown, options: unknown) => {
      calls.push({ verb: 'add', what, options });
      return outcome();
    },
    stop: async () => {
      calls.push({ verb: 'stop' });
    },
    onState: (handler: typeof stateHandler) => {
      stateHandler = handler;
      return () => undefined;
    },
  };
  return { tts, calls, emit: (state: 'idle' | 'starting' | 'speaking' | 'paused', reason?: string) => stateHandler?.({ state, reason }) };
}

function service(options: { host?: Host; tts?: unknown; synth?: { synth: unknown } | null }) {
  return createSpeech({
    host: () => options.host ?? 'standalone',
    capability: async <T>(name: string) => (name === 'tts' ? ((options.tts ?? null) as T | null) : null),
    synth: () => (options.synth ? (options.synth.synth as never) : null),
    utterance: (text) => utterance(text),
    voicesTimeoutMs: 5,
    watchdogMs: 10,
  });
}

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const MAC: VoiceInfo[] = [
  { name: 'Albert', lang: 'en-US', localService: true },
  { name: 'Daniel', lang: 'en-GB', localService: true },
  { name: 'Fred', lang: 'en-US', localService: true },
  { name: 'Kate', lang: 'en-GB', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true, default: true },
  { name: 'Thomas', lang: 'fr-FR', localService: true },
  { name: 'Mónica', lang: 'es-ES', localService: true },
  { name: 'Zarvox', lang: 'en-US', localService: true },
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Google UK English Male', lang: 'en-GB', localService: false },
];
const WINDOWS: VoiceInfo[] = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true, default: true },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Hazel - English (Great Britain)', lang: 'en-GB', localService: true },
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
];

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

describe('speakableText', () => {
  it('spells out accidentals so note names are read as music, not punctuation', () => {
    expect(speakableText('Play C# then Bb.')).toBe('Play C sharp then B flat.');
    expect(speakableText('F## and Cbb exist too')).toBe('F double sharp and C double flat exist too');
    expect(speakableText('The key of F♯ major has E♯; B♭ major has E♭.')).toBe('The key of F sharp major has E sharp; B flat major has E flat.');
    expect(speakableText('G𝄪 and A𝄫')).toBe('G double sharp and A double flat');
    expect(speakableText('a ♮ sign cancels a ♯ or ♭')).toBe('a natural sign cancels a sharp or flat');
  });

  it('reads simple chord symbols with an accidental', () => {
    expect(speakableText('Bbm7 to Eb7 to Abmaj7')).toBe('B flat minor 7 to E flat 7 to A flat major 7');
    expect(speakableText('C#m, F#dim, Gbsus4')).toBe('C sharp minor, F sharp diminished, G flat sus 4');
  });

  it('leaves ordinary words alone', () => {
    const plain = 'Abba, Bob and a Big Band played Ebony tunes. Add a Db... no wait, a Dab.';
    expect(speakableText(plain)).toBe('Abba, Bob and a Big Band played Ebony tunes. Add a D flat... no wait, a Dab.');
    expect(speakableText('Am I ready? A minor is next. Go to fret 3.')).toBe('Am I ready? A minor is next. Go to fret 3.');
  });

  it('drops Markdown marks but keeps the words', () => {
    expect(speakableText('## Step 1\n**Press** the `3rd` fret of the *low* E string. See the [tuner](#tuner).')).toBe(
      'Step 1\nPress the 3rd fret of the low E string. See the tuner.',
    );
    expect(speakableText('- one\n- two\n\n> quoted')).toBe('one\ntwo\n\nquoted');
    expect(speakableText('  \n\n ')).toBe('');
  });
});

describe('splitForSpeech', () => {
  it('keeps short text in one piece', () => {
    expect(splitForSpeech('Tune the low E string.', 200)).toEqual(['Tune the low E string.']);
  });

  it('breaks at sentence ends and never exceeds the limit', () => {
    const text = 'Rest your thumb behind the neck. Curl your fingers so the tips press down! Is every note ringing? If not, move closer to the fret.';
    const pieces = splitForSpeech(text, 60);
    expect(pieces).toEqual([
      'Rest your thumb behind the neck.',
      'Curl your fingers so the tips press down!',
      'Is every note ringing? If not, move closer to the fret.',
    ]);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(60);
  });

  it('breaks over-long sentences at spaces, over-long words by force, and paragraphs always', () => {
    const long = `${'la '.repeat(40)}end. Short one.\n\nNew paragraph ${'x'.repeat(70)}`;
    const pieces = splitForSpeech(long, 50);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(50);
    expect(pieces.join(' ').replace(/\s+/g, '')).toBe(long.replace(/\s+/g, ''));
    expect(pieces.some((piece) => piece.startsWith('New paragraph'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------------------------

describe('pickVoice', () => {
  it('gives each teacher a fitting on-device voice on macOS / iOS', () => {
    expect(pickVoice(MAC, 'mia')?.name).toBe('Samantha');
    expect(pickVoice(MAC, 'dev')?.name).toBe('Daniel');
    expect(pickVoice(MAC, 'elena')?.name).toBe('Kate');
    expect(pickVoice(MAC, 'narrator')?.name).toBe('Samantha'); // the system default
  });

  it('does the same on Windows, where voice names are long', () => {
    expect(pickVoice(WINDOWS, 'mia')?.name).toContain('Zira');
    expect(pickVoice(WINDOWS, 'dev')?.name).toContain('David');
    expect(pickVoice(WINDOWS, 'elena')?.name).toContain('Hazel');
  });

  it('never picks a remote voice (the text would leave the device) or a novelty voice', () => {
    for (const who of ['mia', 'dev', 'elena', 'narrator'] as const) {
      const voice = pickVoice(MAC, who);
      expect(voice?.localService).toBe(true);
      expect(['Zarvox', 'Albert']).not.toContain(voice?.name);
    }
    expect(pickVoice([{ name: 'Google US English', lang: 'en-US', localService: false }], 'mia')).toBeNull();
  });

  it('settles for whatever matches the language when nothing better exists', () => {
    const android: VoiceInfo[] = [{ name: 'English United States', lang: 'en_US', localService: true }, { name: 'Deutsch Deutschland', lang: 'de_DE', localService: true }];
    for (const who of ['mia', 'dev', 'elena'] as const) expect(pickVoice(android, who)?.name).toBe('English United States');
    expect(pickVoice(MAC, 'mia', 'es')?.name).toBe('Mónica');
    expect(pickVoice(MAC, 'mia', 'ja')).toBeNull();
    expect(pickVoice([], 'dev')).toBeNull();
  });

  it('prefers a matching gender over an unknown one, without mistaking "female" for "male"', () => {
    const voices: VoiceInfo[] = [
      { name: 'English (America)', lang: 'en-US', localService: true },
      { name: 'Chrome OS US English Female', lang: 'en-US', localService: true },
      { name: 'Chrome OS UK English Male', lang: 'en-GB', localService: true },
    ];
    expect(pickVoice(voices, 'mia')?.name).toBe('Chrome OS US English Female');
    expect(pickVoice(voices, 'dev')?.name).toBe('Chrome OS UK English Male');
  });

  it('gives each speaker a pace and pitch within what engines accept', () => {
    for (const who of ['mia', 'dev', 'elena', 'narrator'] as const) {
      const { rate, pitch } = voiceProsody(who);
      expect(rate).toBeGreaterThanOrEqual(0.8);
      expect(rate).toBeLessThanOrEqual(1.2);
      expect(pitch).toBeGreaterThanOrEqual(0.8);
      expect(pitch).toBeLessThanOrEqual(1.2);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The viewer's tts capability
// ---------------------------------------------------------------------------------------------

describe('speech inside the artifact viewer', () => {
  it('reads with the viewer voice of the teacher and resolves when the words were spoken', async () => {
    const viewer = fakeTts();
    const synth = fakeSynth(MAC);
    const speech = service({ host: 'artifact', tts: viewer.tts, synth });
    expect(await speech.speak('Play **C#** now.', { voice: 'mia', rate: 2 })).toEqual({ ok: true });
    expect(viewer.calls).toEqual([{ verb: 'speak', what: 'Play C sharp now.', options: { voice: 'airy', rate: 1.5, language: 'en' } }]);
    expect(synth.spoken).toHaveLength(0); // the browser voice stays out of it
    expect(speech.state()).toMatchObject({ available: true, provider: 'viewer', speaking: false });

    await speech.speak('Next.', { voice: 'dev' });
    await speech.speak('Next.', { voice: 'elena' });
    await speech.speak('Next.');
    expect(viewer.calls.slice(1).map((call) => (call.options as { voice: string }).voice)).toEqual(['rounded', 'glassy', 'buttery']);
  });

  it('hands long text over as lines under the length limit, and queues with add', async () => {
    const viewer = fakeTts();
    const speech = service({ host: 'artifact', tts: viewer.tts });
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the pentatonic scale and how to practise it slowly.`).join(' ');
    await speech.speak(long, { voice: 'elena', queue: true });
    expect(viewer.calls[0].verb).toBe('add');
    const lines = viewer.calls[0].what as Array<{ text: string }>;
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(2000);
    expect(lines.map((line) => line.text).join(' ')).toBe(long);
  });

  it('follows the viewer for the speaking state', async () => {
    let finish: (value: { playedMs: number }) => void = () => undefined;
    const viewer = fakeTts(() => new Promise((resolve) => (finish = resolve)));
    const speech = service({ host: 'artifact', tts: viewer.tts });
    const seen: boolean[] = [];
    speech.subscribe(() => seen.push(speech.state().speaking));
    const done = speech.speak('Listen to this interval.', { voice: 'dev' });
    await tick();
    expect(speech.state()).toMatchObject({ speaking: true, voice: 'dev' });
    viewer.emit('speaking');
    viewer.emit('idle', 'viewer_stopped'); // the viewer pressed the platform's own Stop
    expect(speech.state().speaking).toBe(false);
    finish({ playedMs: 10 });
    expect(await done).toEqual({ ok: true });
    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('maps every rejection code', async () => {
    const table: Array<[string, SpeakFailure]> = [
      ['invalid_argument', 'empty'],
      ['no_gesture', 'no-gesture'],
      ['busy', 'busy'],
      ['stopped', 'stopped'],
      ['not_granted', 'not-granted'],
      ['rate_limited', 'rate-limited'],
      ['unavailable', 'unavailable'],
      ['upstream_error', 'failed'],
      ['something_new', 'failed'],
    ];
    for (const [code, reason] of table) {
      expect(mapTtsError({ code, message: 'x' })).toBe(reason);
      const speech = service({ host: 'artifact', tts: fakeTts(async () => Promise.reject({ code, message: 'x' })).tts });
      expect(await speech.speak('Hello')).toEqual({ ok: false, reason });
      expect(speech.state().speaking).toBe(false);
    }
  });

  it('stays silent after the viewer turned reading aloud off: no retry, no browser voice', async () => {
    const viewer = fakeTts(async () => Promise.reject({ code: 'not_granted', message: 'turned off' }));
    const synth = fakeSynth(MAC);
    const speech = service({ host: 'artifact', tts: viewer.tts, synth });
    expect(await speech.speak('Hello')).toEqual({ ok: false, reason: 'not-granted' });
    expect(await speech.speak('Hello again')).toEqual({ ok: false, reason: 'unavailable' });
    expect(await speech.available()).toBe(false);
    expect(viewer.calls.filter((call) => call.verb === 'speak')).toHaveLength(1);
    expect(synth.spoken).toHaveLength(0);
  });

  it('stop() ends the reading through the viewer', async () => {
    const viewer = fakeTts();
    const speech = service({ host: 'artifact', tts: viewer.tts });
    await speech.available();
    speech.stop();
    await tick();
    expect(viewer.calls).toEqual([{ verb: 'stop' }]);
  });

  it('uses the browser voice when the viewer offers none (Safari, the mobile apps)', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ host: 'artifact', tts: null, synth });
    const done = speech.speak('Hello', { voice: 'mia' });
    await tick(10);
    expect(synth.spoken).toHaveLength(1);
    synth.finish();
    expect(await done).toEqual({ ok: true });
    expect(speech.state().provider).toBe('browser');
  });
});

// ---------------------------------------------------------------------------------------------
// The browser's speechSynthesis
// ---------------------------------------------------------------------------------------------

describe('speech with the browser voices', () => {
  it('speaks with the voice, pace and pitch of the teacher', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const done = speech.speak('Welcome to your first lesson.', { voice: 'elena', rate: 1.2 });
    await tick(10);
    expect(speech.state()).toMatchObject({ speaking: true, voice: 'elena', provider: 'browser', available: true });
    const said = synth.spoken[0];
    expect(said.text).toBe('Welcome to your first lesson.');
    expect((said.voice as VoiceInfo).name).toBe('Kate');
    expect(said.lang).toBe('en-GB');
    expect(said.rate).toBeCloseTo(voiceProsody('elena').rate * 1.2, 5);
    expect(said.pitch).toBe(voiceProsody('elena').pitch);
    synth.finish();
    expect(await done).toEqual({ ok: true });
    expect(speech.state()).toMatchObject({ speaking: false, voice: null });
  });

  it('speaks long text as a chain of short utterances', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const text = Array.from({ length: 8 }, (_, i) => `This is sentence ${i} of a rather long explanation about alternate picking.`).join(' ');
    const done = speech.speak(text);
    await tick(10);
    let guard = 0;
    while (synth.spoken.length < 4 && guard++ < 20) {
      synth.finish();
      await tick();
    }
    for (let i = 0; i < 20; i++) {
      synth.finish();
      await tick();
    }
    expect(await done).toEqual({ ok: true });
    expect(synth.spoken.length).toBeGreaterThan(1);
    for (const piece of synth.spoken) expect(piece.text.length).toBeLessThanOrEqual(220);
    expect(synth.spoken.map((piece) => piece.text).join(' ')).toBe(text);
  });

  it('a new speak replaces the one in progress; the old one reports stopped', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const first = speech.speak('The first thing I wanted to say.');
    await tick(10);
    const second = speech.speak('Never mind, this instead.');
    expect(await first).toEqual({ ok: false, reason: 'stopped' });
    await tick(10);
    expect(speech.state().speaking).toBe(true); // the second reading is under way
    expect(synth.spoken[synth.spoken.length - 1].text).toBe('Never mind, this instead.');
    synth.finish();
    expect(await second).toEqual({ ok: true });
  });

  it('queues when asked to', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const first = speech.speak('One.');
    const second = speech.speak('Two.', { queue: true });
    await tick(10);
    expect(synth.spoken.map((u) => u.text)).toEqual(['One.']);
    synth.finish();
    expect(await first).toEqual({ ok: true });
    await tick(10);
    expect(synth.spoken.map((u) => u.text)).toEqual(['One.', 'Two.']);
    synth.finish();
    expect(await second).toEqual({ ok: true });
  });

  it('stop() silences everything, queued readings included', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const first = speech.speak('One.');
    const second = speech.speak('Two.', { queue: true });
    await tick(10);
    speech.stop();
    expect(await first).toEqual({ ok: false, reason: 'stopped' });
    expect(await second).toEqual({ ok: false, reason: 'stopped' });
    expect(speech.state().speaking).toBe(false);
    expect(synth.spoken.map((u) => u.text)).toEqual(['One.']);
  });

  it('reports engine errors and missing permission', async () => {
    const synth = fakeSynth(MAC);
    const speech = service({ synth });
    const blocked = speech.speak('Hello');
    await tick(10);
    synth.fail('not-allowed');
    expect(await blocked).toEqual({ ok: false, reason: 'no-gesture' });
    const broken = speech.speak('Hello');
    await tick(10);
    synth.fail('synthesis-failed');
    expect(await broken).toEqual({ ok: false, reason: 'failed' });
    expect(speech.state().speaking).toBe(false);
  });

  it('does not wait for ever on an engine that never reports back', async () => {
    // Never starts and never says so (seen on systems without a speech service).
    const silent = { synth: { speak: () => undefined, cancel: () => undefined, getVoices: () => MAC, speaking: false, pending: false } };
    const mute = service({ synth: silent });
    expect(await mute.speak('Hello')).toEqual({ ok: false, reason: 'failed' });
    expect(await mute.available()).toBe(true); // one failure can be a hiccup
    expect(await mute.speak('Hello again')).toEqual({ ok: false, reason: 'failed' });
    expect(await mute.available()).toBe(false); // two in a row: hide the speaker buttons
    expect(mute.state().speaking).toBe(false);

    // Speaks, but the end event gets lost: once the engine falls idle the reading counts as done.
    const forgetful = { speak: () => undefined, cancel: () => undefined, getVoices: () => MAC, speaking: false, pending: false };
    forgetful.speak = () => {
      forgetful.speaking = true;
      setTimeout(() => (forgetful.speaking = false), 40);
    };
    const speech = service({ synth: { synth: forgetful } });
    expect(await speech.speak('Hello')).toEqual({ ok: true });
    expect(await speech.available()).toBe(true);
  });

  it('uses the default voice when the device lists none', async () => {
    const synth = fakeSynth([]);
    const speech = service({ synth });
    const done = speech.speak('Hello', { voice: 'mia' });
    await tick(20);
    expect(synth.spoken[0].voice).toBeNull();
    expect(synth.spoken[0].lang).toBe('en');
    synth.finish();
    expect(await done).toEqual({ ok: true });
  });

  it('degrades to nothing where there is no voice at all', async () => {
    const speech = service({ synth: null });
    expect(await speech.available()).toBe(false);
    expect(await speech.speak('Hello')).toEqual({ ok: false, reason: 'unavailable' });
    expect(await speech.speak('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(() => speech.stop()).not.toThrow();
    expect(speech.state()).toEqual({ speaking: false, available: false, provider: 'none', voice: null });
  });
});
