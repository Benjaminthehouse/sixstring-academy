/**
 * Spoken words: teacher voices and ear-training prompts.
 *
 *  - Inside a Claude artifact the viewer's `tts` capability reads the text in a Claude voice.
 *    When the viewer has turned reading aloud off, nothing is spoken (the browser's own voice is
 *    deliberately NOT used as a way around their choice).
 *  - Everywhere else the browser's `speechSynthesis` is used, with a voice picked per teacher
 *    from the voices installed on the device (only on-device voices, so no text leaves it).
 *
 * Speech is always an extra: the same words must be on screen, and every call degrades to
 * "nothing happens" when no voice is available. Start speech from a click or key press.
 */
import { claudeCapability, host as currentHost, type Host } from './env';

// ---------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------

/** Who is talking: one of the three teachers, or the neutral narrator used for prompts. */
export type SpeechVoice = 'mia' | 'dev' | 'elena' | 'narrator';

/** Options of `speak`. */
export interface SpeakOptions {
  /** Default `'narrator'`. */
  voice?: SpeechVoice;
  /** Pace: 1 is normal, 0.7 to 1.5. Multiplies the voice's own pace. */
  rate?: number;
  /** BCP 47 language of the text. Default `'en'`. */
  lang?: string;
  /** Say it after what is being said instead of replacing it. Default false. */
  queue?: boolean;
}

/** Why nothing (or not everything) was spoken. */
export type SpeakFailure =
  | 'unavailable' // no voice in this view
  | 'empty' // nothing to say after cleaning the text
  | 'no-gesture' // the browser wants a click or key press first
  | 'busy' // the viewer is dictating or being asked something
  | 'stopped' // `stopSpeaking()`, a newer `speak()`, or the listener ended it
  | 'not-granted' // the viewer turned reading aloud off for this app
  | 'rate-limited' // too much speech for now; try later
  | 'failed'; // the speech service broke off

/** Result of `speak`: resolves when the words have been spoken, or says why not. Never rejects. */
export type SpeakResult = { ok: true } | { ok: false; reason: SpeakFailure };

/** Which engine speaks. */
export type SpeechProvider = 'viewer' | 'browser' | 'none';

/** A snapshot of the speech service, for a speaker button. */
export interface SpeechState {
  /** True while something is being said (or is about to be). Show a Stop control. */
  speaking: boolean;
  /** `null` until the first check, then whether any voice is available. */
  available: boolean | null;
  provider: SpeechProvider;
  /** The voice of the current reading. */
  voice: SpeechVoice | null;
}

// ---------------------------------------------------------------------------------------------
// Text preparation
// ---------------------------------------------------------------------------------------------

const ACCIDENTAL_WORDS: Record<string, string> = { '##': 'double sharp', '#': 'sharp', bb: 'double flat', b: 'flat' };
const QUALITY_WORDS: Record<string, string> = { maj: 'major', min: 'minor', m: 'minor', dim: 'diminished', aug: 'augmented', sus: 'sus', add: 'add' };

function spellAccidental(_match: string, note: string, accidental: string, quality: string | undefined, digits: string): string {
  let out = `${note} ${ACCIDENTAL_WORDS[accidental]}`;
  if (quality) out += ` ${QUALITY_WORDS[quality]}`;
  if (digits) out += ` ${digits}`;
  return out;
}

/**
 * Make text speakable: Markdown marks are dropped and note names are spelled out, so `C#` is read
 * "C sharp" and `Bb` "B flat" rather than "C hash" and "bee bee".
 */
export function speakableText(text: string): string {
  return (
    text
      // code fences and inline code keep their words, lose their marks
      .replace(/```[a-zA-Z0-9_-]*\n?/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      // [label](url) is read by its label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
      .replace(/^[ \t]*[-*+][ \t]+/gm, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      // typeset accidentals right after a note letter become the ASCII spelling handled below
      .replace(/([A-G])\u{1D12A}/gu, '$1##')
      .replace(/([A-G])\u{1D12B}/gu, '$1bb')
      .replace(/([A-G])\u266F/g, '$1#')
      .replace(/([A-G])\u266D/g, '$1b')
      // note and chord names with an accidental: "C#" -> "C sharp", "Bbm7" -> "B flat minor 7"
      .replace(/\b([A-G])(##|bb|#|b)(maj|min|dim|aug|sus|add|m)?(\d*)(?![A-Za-z#])/g, spellAccidental)
      .replace(/\u{1D12A}/gu, ' double sharp ')
      .replace(/\u{1D12B}/gu, ' double flat ')
      .replace(/\u266F/g, ' sharp ')
      .replace(/\u266D/g, ' flat ')
      .replace(/\u266E/g, ' natural ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Split text into pieces of at most `maxLength` characters, breaking at paragraph, sentence or
 * word boundaries. Speech engines have hard limits (and some cut long utterances off mid-word).
 */
export function splitForSpeech(text: string, maxLength: number): string[] {
  const out: string[] = [];
  const flush = (piece: string): void => {
    const trimmed = piece.trim();
    if (trimmed) out.push(trimmed);
  };
  for (const paragraph of text.split(/\n{2,}/)) {
    let current = '';
    // Sentence ends, keeping the punctuation with the sentence it closes.
    const sentences = paragraph.replace(/\n/g, ' ').match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
    for (const sentence of sentences) {
      if ((current + sentence).length <= maxLength) {
        current += sentence;
        continue;
      }
      flush(current);
      current = '';
      if (sentence.length <= maxLength) {
        current = sentence;
        continue;
      }
      // One sentence longer than the limit: break it at spaces.
      let line = '';
      for (const word of sentence.split(/\s+/)) {
        if (!word) continue;
        if (line && (line + ' ' + word).length > maxLength) {
          flush(line);
          line = '';
        }
        if (word.length > maxLength) {
          for (let i = 0; i < word.length; i += maxLength) flush(word.slice(i, i + maxLength));
          continue;
        }
        line = line ? `${line} ${word}` : word;
      }
      current = line;
    }
    flush(current);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Browser voices
// ---------------------------------------------------------------------------------------------

/** The parts of a `SpeechSynthesisVoice` used for choosing. */
export interface VoiceInfo {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

interface Persona {
  /** Voice names (one lower-case word each) in order of preference. */
  names: readonly string[];
  /** Region preference among voices of the right language. */
  regions: readonly string[];
  gender: 'female' | 'male' | 'any';
  rate: number;
  pitch: number;
  /** Voice of the viewer's `tts` capability. */
  viewer: 'buttery' | 'airy' | 'glassy' | 'rounded';
}

/**
 * How each speaker should sound. Names are the on-device voices of the common platforms
 * (macOS / iOS, Windows, Android, Chrome OS); the first one installed wins.
 */
const PERSONAS: Record<SpeechVoice, Persona> = {
  // Mia Brooks: patient and encouraging. A warm, slightly brighter voice.
  mia: {
    names: ['samantha', 'ava', 'allison', 'aria', 'jenny', 'zira', 'susan', 'female'],
    regions: ['en-US', 'en-CA', 'en-AU', 'en-GB'],
    gender: 'female',
    rate: 0.98,
    pitch: 1.08,
    viewer: 'airy',
  },
  // Dev Okafor: a bandmate. Relaxed and a little lower.
  dev: {
    names: ['daniel', 'alex', 'tom', 'evan', 'aaron', 'guy', 'davis', 'ryan', 'david', 'mark', 'george', 'male'],
    regions: ['en-GB', 'en-US', 'en-AU', 'en-IE'],
    gender: 'male',
    rate: 1,
    pitch: 0.92,
    viewer: 'rounded',
  },
  // Prof. Elena Varga: conservatory rigour, dry humour. Measured and precise.
  elena: {
    names: ['serena', 'kate', 'stephanie', 'martha', 'sonia', 'libby', 'hazel', 'moira', 'fiona', 'karen', 'tessa', 'female'],
    regions: ['en-GB', 'en-IE', 'en-AU', 'en-US'],
    gender: 'female',
    rate: 0.94,
    pitch: 0.98,
    viewer: 'glassy',
  },
  narrator: { names: [], regions: ['en-US', 'en-GB'], gender: 'any', rate: 1, pitch: 1, viewer: 'buttery' },
};

const FEMALE_HINTS = [
  'female', 'woman', 'samantha', 'ava', 'allison', 'aria', 'jenny', 'zira', 'susan', 'serena', 'kate', 'stephanie', 'martha', 'sonia',
  'libby', 'hazel', 'moira', 'fiona', 'karen', 'tessa', 'victoria', 'nicky', 'catherine', 'heather', 'linda', 'michelle', 'emma', 'amy',
  'joanna', 'salli', 'kendra', 'ivy', 'veena', 'isha', 'sara', 'clara', 'natasha', 'molly', 'neerja', 'emily', 'olivia',
];
const MALE_HINTS = [
  'male', 'man', 'daniel', 'alex', 'tom', 'evan', 'aaron', 'guy', 'davis', 'ryan', 'david', 'mark', 'george', 'fred', 'oliver', 'arthur',
  'gordon', 'rishi', 'james', 'brian', 'matthew', 'joey', 'justin', 'liam', 'william', 'thomas', 'eric', 'roger', 'steffan', 'andrew',
];

/** The words of a voice name, lower case ("Microsoft Aria Online (Natural)" -> microsoft, aria, online, natural). */
function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/** Joke and low-quality system voices that should never be picked for a teacher. */
const NOVELTY_VOICES =
  /compact|eloquence|novelty|whisper|bells|bad news|good news|bubbles|cellos|zarvox|trinoids|organ|jester|wobble|boing|albert|bahh|junior|ralph|kathy|superstar|deranged|hysterical/;

function genderOf(name: string): 'female' | 'male' | 'unknown' {
  const words = nameWords(name);
  if (words.some((word) => FEMALE_HINTS.includes(word))) return 'female';
  if (words.some((word) => MALE_HINTS.includes(word))) return 'male';
  return 'unknown';
}

/**
 * Choose the installed voice that best fits a speaker. Only on-device voices of the right
 * language are considered (a remote voice would send the lesson text to a server); returns null
 * when there is none, in which case the browser's default voice is used.
 */
export function pickVoice<V extends VoiceInfo>(voices: readonly V[], who: SpeechVoice, lang = 'en'): V | null {
  const persona = PERSONAS[who];
  const base = lang.toLowerCase().split('-')[0];
  const norm = (code: string): string => code.replace('_', '-').toLowerCase();
  const candidates = voices.filter((voice) => norm(voice.lang).split('-')[0] === base && voice.localService !== false);
  if (candidates.length === 0) return null;

  let best: V | null = null;
  let bestScore = -Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const voice = candidates[index];
    const name = voice.name.toLowerCase();
    const words = nameWords(voice.name);
    let score = 0;
    const named = persona.names.findIndex((wanted) => words.includes(wanted));
    if (named >= 0) score += 60 - named;
    const gender = genderOf(voice.name);
    if (persona.gender !== 'any') {
      if (gender === persona.gender) score += 30;
      else if (gender !== 'unknown') score -= 30;
    }
    // Only English has per-persona accents; another language just takes what matches it.
    const region = base === 'en' ? persona.regions.findIndex((wanted) => norm(voice.lang) === wanted.toLowerCase()) : -1;
    if (region >= 0) score += 12 - region * 2;
    if (norm(voice.lang) === norm(lang)) score += 6;
    if (/enhanced|premium|natural|neural|siri/.test(name)) score += 8;
    if (NOVELTY_VOICES.test(name)) score -= 80;
    if (voice.default) score += 3;
    score -= index * 0.001; // stable: earlier voices win ties
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

/** Pace and pitch that go with a speaker when the browser's voices are used. */
export function voiceProsody(who: SpeechVoice): { rate: number; pitch: number } {
  return { rate: PERSONAS[who].rate, pitch: PERSONAS[who].pitch };
}

// ---------------------------------------------------------------------------------------------
// The viewer's `tts` capability (shapes copied from the platform's type definitions)
// ---------------------------------------------------------------------------------------------

type ViewerVoice = 'buttery' | 'airy' | 'glassy' | 'rounded';
interface ViewerLine {
  text: string;
  voice?: ViewerVoice;
  rate?: number;
  language?: string;
}
interface ViewerTts {
  speak(what: string | ViewerLine[], options?: { voice?: ViewerVoice; rate?: number; language?: string }): Promise<{ playedMs: number }>;
  add(what: string | ViewerLine[], options?: { voice?: ViewerVoice; rate?: number; language?: string }): Promise<{ playedMs: number }>;
  stop(): Promise<void>;
  onState(handler: (event: { state: 'idle' | 'starting' | 'speaking' | 'paused'; reason?: string }) => void): () => void;
}

const VIEWER_MAX_CHARS = 2000;
const VIEWER_MAX_LINES = 100;
/** Chrome stops long utterances after about fifteen seconds; short ones are safe. */
const BROWSER_MAX_CHARS = 220;

/** Map a rejection of the viewer's `tts` calls (`{ code, reason? }`) to a failure reason. */
export function mapTtsError(rejection: unknown): SpeakFailure {
  const code = (typeof rejection === 'object' && rejection !== null ? (rejection as { code?: unknown }).code : undefined) ?? '';
  switch (code) {
    case 'invalid_argument':
      return 'empty';
    case 'no_gesture':
      return 'no-gesture';
    case 'busy':
      return 'busy';
    case 'stopped':
      return 'stopped';
    case 'not_granted':
      return 'not-granted';
    case 'rate_limited':
      return 'rate-limited';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'failed';
  }
}

// ---------------------------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------------------------

interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: unknown;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}
interface SynthLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices(): VoiceInfo[];
  /** True while an utterance is being spoken / is waiting in the engine's queue. */
  speaking?: boolean;
  pending?: boolean;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  removeEventListener?(type: 'voiceschanged', listener: () => void): void;
}

/** What the service needs from its surroundings; tests swap these for fakes. */
export interface SpeechDeps {
  host: () => Host;
  capability: <T>(name: string) => Promise<T | null>;
  /** The browser's speech synthesiser, or null. */
  synth: () => SynthLike | null;
  /** Build one utterance (`new SpeechSynthesisUtterance(text)`). */
  utterance: (text: string) => UtteranceLike;
  /** How long to wait for the browser to list its voices the first time. */
  voicesTimeoutMs: number;
  /** How often to check that the engine is still busy with an utterance whose end has not been reported. */
  watchdogMs: number;
}

/** The speech service. Use the module-level functions unless you are testing. */
export interface Speech {
  speak(text: string, options?: SpeakOptions): Promise<SpeakResult>;
  stop(): void;
  available(): Promise<boolean>;
  state(): SpeechState;
  subscribe(listener: () => void): () => void;
}

function browserSynth(): SynthLike | null {
  if (typeof window === 'undefined') return null;
  const synth = (window as { speechSynthesis?: SynthLike }).speechSynthesis;
  const hasUtterance = typeof (window as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === 'function';
  return synth && typeof synth.speak === 'function' && hasUtterance ? synth : null;
}

function clampRate(rate: number | undefined): number {
  return typeof rate === 'number' && Number.isFinite(rate) ? Math.min(1.5, Math.max(0.7, rate)) : 1;
}

/** Create a speech service. Production code uses the shared instance behind `speak`. */
export function createSpeech(overrides: Partial<SpeechDeps> = {}): Speech {
  const deps: SpeechDeps = {
    host: currentHost,
    capability: claudeCapability,
    synth: browserSynth,
    utterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    voicesTimeoutMs: 1000,
    watchdogMs: 500,
    ...overrides,
  };

  let snapshot: SpeechState = { speaking: false, available: null, provider: 'none', voice: null };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<SpeechState>): void => {
    const next = { ...snapshot, ...patch };
    if (next.speaking === snapshot.speaking && next.available === snapshot.available && next.provider === snapshot.provider && next.voice === snapshot.voice) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  let viewerPromise: Promise<ViewerTts | null> | null = null;
  /** Set when the viewer turned reading aloud off: stay silent for the rest of the page load. */
  let viewerOff = false;
  /** Each browser reading has a number; a newer one (or `stop`) makes older ones give up. */
  let run = 0;
  let pendingViewerCalls = 0;
  let browserQueue: Promise<SpeakResult> = Promise.resolve({ ok: true });
  /**
   * Utterances the engine is working on. Chrome can garbage-collect an utterance nothing else
   * refers to, and then its `end` event never arrives; holding them here prevents that.
   */
  const live = new Set<UtteranceLike>();
  /** Engine failures in a row. Two mean this device cannot really speak. */
  let brokenStreak = 0;

  const getViewer = (): Promise<ViewerTts | null> => {
    if (!viewerPromise) {
      viewerPromise =
        deps.host() === 'artifact'
          ? deps.capability<ViewerTts>('tts').then((tts) => {
              if (!tts || typeof tts.speak !== 'function') return null;
              try {
                // The viewer can end a reading by itself (its own Stop, Escape, a hidden tab).
                tts.onState?.((event) => {
                  if (event.state === 'idle') update({ speaking: false, voice: null });
                  else update({ speaking: true });
                });
              } catch {
                /* state events are a nicety */
              }
              return tts;
            })
          : Promise.resolve(null);
    }
    return viewerPromise;
  };

  async function provider(): Promise<{ kind: 'viewer'; tts: ViewerTts } | { kind: 'browser'; synth: SynthLike } | { kind: 'none' }> {
    const tts = await getViewer();
    if (tts) return viewerOff ? { kind: 'none' } : { kind: 'viewer', tts };
    const synth = deps.synth();
    return synth ? { kind: 'browser', synth } : { kind: 'none' };
  }

  async function available(): Promise<boolean> {
    const p = await provider();
    // A browser engine that failed twice in a row has no working voice (Linux without a speech
    // service, for instance): better to hide the speaker buttons than to offer silence.
    const works = p.kind === 'viewer' || (p.kind === 'browser' && brokenStreak < 2);
    update({ available: works, provider: p.kind });
    return works;
  }

  function loadVoices(synth: SynthLike): Promise<VoiceInfo[]> {
    const now = synth.getVoices();
    if (now.length > 0 || typeof synth.addEventListener !== 'function') return Promise.resolve(now);
    // Chrome fills the list asynchronously; wait briefly for it, then go on with the default voice.
    return new Promise<VoiceInfo[]>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        synth.removeEventListener?.('voiceschanged', done);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(done, deps.voicesTimeoutMs);
      synth.addEventListener?.('voiceschanged', done);
    });
  }

  async function speakViewer(tts: ViewerTts, text: string, who: SpeechVoice, options: SpeakOptions): Promise<SpeakResult> {
    const voice = PERSONAS[who].viewer;
    const pieces = splitForSpeech(text, VIEWER_MAX_CHARS).slice(0, VIEWER_MAX_LINES);
    const what: string | ViewerLine[] = pieces.length === 1 ? pieces[0] : pieces.map((piece) => ({ text: piece }));
    const settings = { voice, rate: clampRate(options.rate), language: options.lang ?? 'en' };
    pendingViewerCalls += 1;
    update({ speaking: true, voice: who });
    try {
      await (options.queue ? tts.add(what, settings) : tts.speak(what, settings));
      return { ok: true };
    } catch (rejection) {
      const reason = mapTtsError(rejection);
      if (reason === 'not-granted') {
        viewerOff = true;
        update({ available: false, provider: 'none' });
      }
      return { ok: false, reason };
    } finally {
      pendingViewerCalls -= 1;
      if (pendingViewerCalls === 0) update({ speaking: false, voice: null });
    }
  }

  function speakBrowser(synth: SynthLike, text: string, who: SpeechVoice, options: SpeakOptions): Promise<SpeakResult> {
    if (!options.queue) {
      run += 1;
      try {
        synth.cancel();
      } catch {
        /* nothing was playing */
      }
    }
    const mine = run;
    const start = async (): Promise<SpeakResult> => {
      if (mine !== run) return { ok: false, reason: 'stopped' };
      update({ speaking: true, voice: who });
      const voices = await loadVoices(synth);
      const lang = options.lang ?? 'en';
      const chosen = pickVoice(voices, who, lang);
      const prosody = voiceProsody(who);
      let outcome: SpeakResult = { ok: true };
      for (const piece of splitForSpeech(text, BROWSER_MAX_CHARS)) {
        if (mine !== run) {
          outcome = { ok: false, reason: 'stopped' };
          break;
        }
        outcome = await new Promise<SpeakResult>((resolve) => {
          let utterance: UtteranceLike;
          try {
            utterance = deps.utterance(piece);
          } catch {
            resolve({ ok: false, reason: 'unavailable' });
            return;
          }
          let watchdog: ReturnType<typeof setInterval> | undefined;
          let heard = false;
          const settle = (result: SpeakResult): void => {
            if (watchdog !== undefined) clearInterval(watchdog);
            live.delete(utterance);
            resolve(result);
          };
          utterance.lang = chosen?.lang ?? lang;
          if (chosen) utterance.voice = chosen;
          utterance.rate = Math.min(2, Math.max(0.5, prosody.rate * clampRate(options.rate)));
          utterance.pitch = prosody.pitch;
          utterance.volume = 1;
          utterance.onend = () => settle({ ok: true });
          utterance.onerror = (event) => {
            const error = event?.error ?? '';
            if (error === 'canceled' || error === 'interrupted') settle({ ok: false, reason: 'stopped' });
            else if (error === 'not-allowed') settle({ ok: false, reason: 'no-gesture' });
            else settle({ ok: false, reason: 'failed' });
          };
          live.add(utterance);
          try {
            synth.speak(utterance);
          } catch {
            settle({ ok: false, reason: 'failed' });
            return;
          }
          if (typeof synth.speaking === 'boolean') {
            // Some engines never report the end (or never start, with no error). If the engine has
            // gone idle without a word from the utterance, stop waiting for it.
            let idleChecks = 0;
            watchdog = setInterval(() => {
              if (synth.speaking || synth.pending) {
                heard = heard || synth.speaking === true;
                idleChecks = 0;
              } else if (++idleChecks >= 2) {
                if (mine !== run) settle({ ok: false, reason: 'stopped' });
                else settle(heard ? { ok: true } : { ok: false, reason: 'failed' });
              }
            }, deps.watchdogMs);
          }
        });
        if (outcome.ok) brokenStreak = 0;
        else if (outcome.reason === 'failed' && ++brokenStreak >= 2) update({ available: false });
        if (!outcome.ok) break;
      }
      if (mine === run) update({ speaking: false, voice: null });
      return outcome;
    };
    // Queued readings wait for the one before them; a replacing reading starts a new chain.
    browserQueue = options.queue ? browserQueue.then(start, start) : start();
    return browserQueue;
  }

  async function speak(raw: string, options: SpeakOptions = {}): Promise<SpeakResult> {
    const text = speakableText(typeof raw === 'string' ? raw : '');
    if (!text) return { ok: false, reason: 'empty' };
    const who: SpeechVoice = options.voice && options.voice in PERSONAS ? options.voice : 'narrator';
    const p = await provider();
    update({ available: p.kind === 'viewer' || (p.kind === 'browser' && brokenStreak < 2), provider: p.kind });
    if (p.kind === 'viewer') return speakViewer(p.tts, text, who, options);
    if (p.kind === 'browser') return speakBrowser(p.synth, text, who, options);
    return { ok: false, reason: 'unavailable' };
  }

  function stop(): void {
    run += 1;
    try {
      deps.synth()?.cancel();
    } catch {
      /* nothing to cancel */
    }
    void getViewer()
      .then((tts) => tts?.stop())
      .catch(() => undefined);
    update({ speaking: false, voice: null });
  }

  return {
    speak,
    stop,
    available,
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The shared instance
// ---------------------------------------------------------------------------------------------

let shared: Speech | null = null;
const instance = (): Speech => (shared ??= createSpeech());

/**
 * Say `text` aloud. Resolves `{ ok: true }` once it has been spoken, or `{ ok: false, reason }`.
 * A new call replaces what is being said unless `queue` is set. Never rejects.
 */
export function speak(text: string, options?: SpeakOptions): Promise<SpeakResult> {
  return instance().speak(text, options);
}

/** Stop talking, including anything queued. Safe to call at any time. */
export function stopSpeaking(): void {
  instance().stop();
}

/** True when some voice can speak here. Use it to decide whether to show speaker buttons. */
export function speechAvailable(): Promise<boolean> {
  return instance().available();
}

/** True while something is being said. */
export function isSpeaking(): boolean {
  return instance().state().speaking;
}

/** The current snapshot (stable until it changes), for `useSyncExternalStore`. */
export function getSpeechState(): SpeechState {
  return instance().state();
}

/** Be told when the snapshot changes. Returns the unsubscribe function. */
export function subscribeSpeech(listener: () => void): () => void {
  return instance().subscribe(listener);
}

/** The same functions under one name: `speech.speak(...)`, `speech.stop()`. */
export const speech = {
  speak,
  stop: stopSpeaking,
  available: speechAvailable,
  isSpeaking,
  state: getSpeechState,
  subscribe: subscribeSpeech,
};
