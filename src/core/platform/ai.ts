/**
 * One way to "ask an AI model", whatever the host:
 *
 *  - **Claude artifact**: the viewer's `sample` capability (text, images when the page declares
 *    them, streaming, JSON). It spends the viewer's own Claude usage and asks their consent on
 *    the first call, so only call it from an explicit action ("Ask", "Read my sheet").
 *  - **Standalone app**: the Anthropic Messages API, called straight from the browser with an API
 *    key the learner pasted into their preferences. This is the ONE place the app makes a network
 *    request, and only after a key was entered. The key is kept on this device (platform storage),
 *    is sent to api.anthropic.com and nowhere else, and is never logged or put into an error.
 *
 * Used by the sheet scanner (photo in, JSON out), "ask your teacher" and feedback features.
 * Every failure is an `AiError` with a `kind` to branch on and a message that can be shown as is.
 */
import { claudeCapability, host as currentHost, type Host } from './env';
import { bytesToBase64, createCanvas, jpegInfo, loadImage, readFileBytes, sniffBytes } from './files';
import { readRaw, remove, writeRaw } from './storage';

// ---------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------

/** Who answers: the artifact viewer's Claude, the Anthropic API with the learner's key, or nobody. */
export type AiProvider = 'artifact' | 'anthropic' | 'none';

/** Speed against depth: `quick` for short routine answers, `complex` for the hardest reasoning. */
export type AiTier = 'quick' | 'default' | 'complex';

/** What `aiStatus()` reports. */
export interface AiStatus {
  /** True when this host can answer right now. `ask` also needs `enabled`: check both. */
  available: boolean;
  provider: AiProvider;
  /** True when pictures can be sent along. */
  images: boolean;
  /** Most pictures one question may carry (0 when `images` is false). */
  maxImages: number;
  /**
   * The learner's own switch (Settings > AI helper, `prefs.ai.enabled`). While it is false, `ask` and
   * `askJson` refuse with `AiError('disabled')` and send nothing, whatever the host offers.
   */
  enabled: boolean;
  /** Why it is not available: no key entered, not offered in this view, or declined by the viewer. */
  reason?: 'no-key' | 'not-offered' | 'declined';
}

/** One earlier turn of a conversation the caller keeps (the model remembers nothing between calls). */
export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A picture to send: a file / blob, or a canvas (encoded for you). */
export type AiImage = Blob | HTMLCanvasElement | OffscreenCanvas;

/** Options of `ask`. */
export interface AskOptions {
  /** Standing instructions: who the model is and how to answer. */
  system?: string;
  /** The question or task. Required. */
  prompt: string;
  /** Earlier turns, oldest first, for a chat. */
  history?: readonly AiTurn[];
  /** Pictures shown with the prompt (check `aiStatus().images` first). */
  images?: readonly AiImage[];
  /** Ask for JSON: the reply is parsed and returned as `json`. Describe the shape in the prompt. */
  json?: boolean;
  /** Default `'default'`. */
  tier?: AiTier;
  /** Called as the answer is written: `text` is the whole answer so far, `delta` the new part. */
  onText?: (text: string, delta: string) => void;
  /** Abort to stop the answer (a Stop button, an unmount). Use a new controller per call. */
  signal?: AbortSignal;
  /** Upper bound of the answer length in tokens (standalone only; the artifact host sets its own). */
  maxTokens?: number;
  /** Always ask anew: skip the artifact host's five-minute answer cache (chat turns, "Try again"). */
  fresh?: boolean;
}

/** What `ask` resolves with. */
export interface AskResult {
  /** The complete answer. */
  text: string;
  /** True when the answer hit a length limit and stops mid-thought. */
  truncated: boolean;
  provider: AiProvider;
  /** The tier that answered (the host may substitute a nearby one). */
  tier: AiTier;
  /** The parsed value, when `json` was requested. */
  json?: unknown;
}

/** Options of `askJson`: `ask` plus a validator. */
export interface AskJsonOptions<T> extends Omit<AskOptions, 'json'> {
  /**
   * Check the parsed value and return it typed. Throw an `Error` whose message says what is wrong
   * ("bars[2].notes is missing"); that message is sent back to the model for the one retry.
   */
  validate: (value: unknown) => T;
  /** Ask once more with the validation error when the first reply is unusable. Default true. */
  retry?: boolean;
}

/** What `askJson` resolves with. */
export interface AskJsonResult<T> {
  value: T;
  /** The raw reply the value came from. */
  text: string;
  /** 1, or 2 when the retry was needed. */
  attempts: number;
  provider: AiProvider;
  tier: AiTier;
}

/** Failure classes. Branch on these, never on message text. */
export type AiErrorKind =
  | 'disabled' // the learner has the AI helper switched off in Settings: nothing was sent
  | 'not-available' // no provider here (no key / not offered), or this feature (pictures, this model) is not
  | 'not-granted' // the viewer declined, or the key is not allowed to do this
  | 'rate-limited' // too many requests or a usage limit; let the learner retry later
  | 'network' // could not reach the service
  | 'bad-key' // the API key was rejected
  | 'refused' // the model declined this request; any partial answer is withdrawn
  | 'aborted' // the caller's signal fired
  | 'too-large' // the prompt (or the pictures) is more than can be sent
  | 'bad-image' // a picture is of a kind or size that cannot be used
  | 'bad-response' // empty or unusable answer (JSON that does not parse or validate)
  | 'server' // the service had a problem; retrying later can work
  | 'billing' // the Anthropic account needs attention
  | 'invalid'; // the request was malformed: a bug on our side

const MESSAGES: Record<AiErrorKind, string> = {
  disabled: 'The AI helper is switched off, so nothing was sent. You can turn it on in Settings, under AI helper.',
  'not-available': 'Claude is not available here, so this feature is switched off.',
  'not-granted': 'This app does not have permission to use Claude.',
  'rate-limited': 'Claude is getting a lot of requests right now. Wait a minute, then try again.',
  network: 'Could not reach Claude. Check your internet connection, then try again.',
  'bad-key': 'Anthropic did not accept that API key. Check it in your preferences: it may be mistyped, expired or revoked.',
  refused: 'Claude declined to answer that. Try asking in a different way.',
  aborted: 'Stopped.',
  'too-large': 'That is too much to send at once. Try a shorter question, or fewer and smaller pictures.',
  'bad-image': 'That picture could not be used. Try a JPEG or PNG photo.',
  'bad-response': 'The answer did not come back in a usable form. Try again.',
  server: 'Claude is having trouble right now. Try again in a moment.',
  billing: 'Your Anthropic account needs attention (billing or credit). Check it in the Anthropic Console.',
  invalid: 'Something went wrong while preparing the question.',
};

const RETRYABLE: Record<AiErrorKind, boolean> = {
  disabled: false,
  'not-available': false,
  'not-granted': false,
  'rate-limited': true,
  network: true,
  'bad-key': false,
  refused: false,
  aborted: true,
  'too-large': false,
  'bad-image': false,
  'bad-response': true,
  server: true,
  billing: false,
  invalid: false,
};

/** Extra facts an `AiError` can carry. */
export interface AiErrorInfo {
  /** Replaces the default user-facing message of the kind. */
  message?: string;
  /** Developer-facing detail (the service's own words). Never contains the API key. */
  detail?: string;
  /** The provider's own code (`rate_limited`, `overloaded_error`, `unparseable` ...). */
  code?: string;
  /** HTTP status, for the Anthropic API. */
  status?: number;
  /** Text that had streamed before the failure and may stay on screen. Absent on `refused`. */
  partial?: string;
  /** How long to wait before a retry can work, when the service said so. */
  retryAfterMs?: number;
}

/** The one error type of this module. `message` is written for the learner. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** True when asking again unchanged can succeed (now or a little later). */
  readonly retryable: boolean;
  readonly detail?: string;
  readonly code?: string;
  readonly status?: number;
  readonly partial?: string;
  readonly retryAfterMs?: number;

  constructor(kind: AiErrorKind, info: AiErrorInfo = {}) {
    super(info.message ?? MESSAGES[kind]);
    this.name = 'AiError';
    this.kind = kind;
    this.retryable = RETRYABLE[kind];
    if (info.detail !== undefined) this.detail = info.detail;
    if (info.code !== undefined) this.code = info.code;
    if (info.status !== undefined) this.status = info.status;
    if (info.partial !== undefined) this.partial = info.partial;
    if (info.retryAfterMs !== undefined) this.retryAfterMs = info.retryAfterMs;
  }
}

/** Type guard for `AiError`. */
export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

/** The default user-facing sentence for a failure kind. */
export function aiErrorMessage(kind: AiErrorKind): string {
  return MESSAGES[kind];
}

// ---------------------------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------------------------

/** Result of `extractJson`. */
export type JsonExtraction = { ok: true; value: unknown } | { ok: false; error: string };

function tryParse(text: string): JsonExtraction {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}

/** The text from the first `{` or `[` to the bracket that closes it, skipping over strings. */
function balancedSlice(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Find the JSON value in a model reply, tolerantly: the whole reply; else the body of a Markdown
 * code fence; else the first bracketed value (a sentence before or after it is ignored).
 */
export function extractJson(reply: string): JsonExtraction {
  const text = reply.replace(/^﻿/, '').trim();
  if (!text) return { ok: false, error: 'the reply was empty' };
  const whole = tryParse(text);
  if (whole.ok) return whole;

  for (const match of text.matchAll(/```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g)) {
    const fenced = tryParse(match[1].trim());
    if (fenced.ok) return fenced;
  }

  const balanced = balancedSlice(text);
  if (balanced !== null) {
    const parsed = tryParse(balanced);
    if (parsed.ok) return parsed;
  }
  const first = text.search(/[{[]/);
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (first >= 0 && last > first) {
    const span = tryParse(text.slice(first, last + 1));
    if (span.ok) return span;
    return { ok: false, error: `the reply is not valid JSON (${span.error})` };
  }
  return { ok: false, error: 'the reply contains no JSON value' };
}

const JSON_INSTRUCTION = '\n\nReply with one JSON value only: no explanation, no Markdown code fence.';

// ---------------------------------------------------------------------------------------------
// Image encoding
// ---------------------------------------------------------------------------------------------

/** Options of `encodeImage`. */
export interface EncodeImageOptions {
  /** Largest result in bytes. Default 3.5 MB. */
  maxBytes?: number;
  /** Longest edge in pixels; larger pictures are scaled down. Default 2576 (as much as Claude reads). */
  maxEdge?: number;
  /** Default JPEG. PNG keeps line art crisp but is several times larger. */
  type?: 'image/jpeg' | 'image/png';
  /** First JPEG quality tried, 0 to 1. Default 0.9. */
  quality?: number;
}

/** What `encodeImage` resolves with. */
export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  type: 'image/jpeg' | 'image/png';
}

/** Default limits for pictures sent to a model. */
export const IMAGE_DEFAULTS = { maxBytes: 3_500_000, maxEdge: 2576, quality: 0.9 } as const;

const JPEG_QUALITIES = [0.82, 0.72, 0.6];

/**
 * Search for the largest rendition that fits the byte budget: first at the wanted size with
 * falling JPEG quality, then at smaller and smaller sizes. `encode` renders one candidate.
 * Exported so the search can be tested without a canvas.
 */
export async function fitToBudget(
  size: { width: number; height: number },
  options: Required<EncodeImageOptions>,
  encode: (width: number, height: number, type: 'image/jpeg' | 'image/png', quality: number) => Promise<Blob>,
): Promise<EncodedImage> {
  const longest = Math.max(size.width, size.height, 1);
  let scale = Math.min(1, options.maxEdge / longest);
  const qualities = options.type === 'image/jpeg' ? [options.quality, ...JPEG_QUALITIES.filter((q) => q < options.quality)] : [1];
  let smallest: EncodedImage | null = null;

  for (let step = 0; step < 12; step++) {
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    let lastBytes = 0;
    for (const quality of qualities) {
      const blob = await encode(width, height, options.type, quality);
      lastBytes = blob.size;
      const candidate: EncodedImage = { blob, width, height, type: options.type };
      if (blob.size <= options.maxBytes) return candidate;
      if (!smallest || blob.size < smallest.blob.size) smallest = candidate;
      // Lower quality buys perhaps a factor of two; beyond that only fewer pixels help.
      if (blob.size > options.maxBytes * 2.5) break;
    }
    if (width <= 16 || height <= 16) break;
    // Bytes scale roughly with the pixel count, so aim a little under the budget.
    scale *= Math.min(0.9, Math.max(0.4, Math.sqrt(options.maxBytes / Math.max(1, lastBytes)) * 0.95));
  }
  throw new AiError('bad-image', {
    message: 'That picture could not be made small enough to send. Try a smaller one.',
    detail: `smallest rendition: ${smallest?.blob.size ?? 0} bytes, budget ${options.maxBytes}`,
  });
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be encoded.'))), type, quality);
  });
}

/** True when this environment can draw and re-encode pictures (any browser; not plain Node). */
export function canEncodeImages(): boolean {
  return typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && typeof document.createElement === 'function');
}

/**
 * Downscale and encode a picture (a file, a blob or a canvas) to a JPEG or PNG that fits a byte
 * budget. A photo's EXIF rotation is applied and its metadata (camera, location) is dropped.
 */
export async function encodeImage(source: AiImage, options: EncodeImageOptions = {}): Promise<EncodedImage> {
  const settings: Required<EncodeImageOptions> = {
    maxBytes: options.maxBytes ?? IMAGE_DEFAULTS.maxBytes,
    maxEdge: options.maxEdge ?? IMAGE_DEFAULTS.maxEdge,
    type: options.type ?? 'image/jpeg',
    quality: options.quality ?? IMAGE_DEFAULTS.quality,
  };
  if (!canEncodeImages()) throw new AiError('bad-image', { detail: 'no canvas in this environment' });

  let drawable: CanvasImageSource;
  let width: number;
  let height: number;
  let release = (): void => undefined;
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    try {
      const loaded = await loadImage(source);
      drawable = loaded.source;
      width = loaded.width;
      height = loaded.height;
      release = () => loaded.release();
    } catch (err) {
      throw new AiError('bad-image', {
        message: 'That picture could not be opened. Try a JPEG or PNG photo.',
        detail: String((err as Error)?.message ?? err),
      });
    }
  } else {
    const canvas = source as HTMLCanvasElement | OffscreenCanvas;
    drawable = canvas;
    width = canvas.width;
    height = canvas.height;
  }
  if (width < 1 || height < 1) {
    release();
    throw new AiError('bad-image', { detail: 'the picture has no pixels' });
  }

  try {
    return await fitToBudget({ width, height }, settings, async (w, h, type, quality) => {
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new AiError('bad-image', { detail: 'no 2d context' });
      if (type === 'image/jpeg') {
        // JPEG has no transparency; without a backdrop, see-through areas turn black.
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(drawable, 0, 0, w, h);
      const blob = await canvasToBlob(canvas, type, quality);
      canvas.width = 0;
      canvas.height = 0;
      return blob;
    });
  } finally {
    release();
  }
}

const MODEL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Pictures above this size are re-encoded before upload even when their type is fine. */
const REENCODE_ABOVE_BYTES = 1_500_000;

interface ImageLimits {
  mediaTypes: readonly string[];
  /** Hard cap of one picture in bytes. */
  maxBytes: number;
  /** Re-encode JPEGs that carry EXIF data (rotation to apply, location to drop). */
  normalizeExif: boolean;
}

/** Turn whatever the caller passed into a blob the provider accepts. */
async function prepareImage(image: AiImage, limits: ImageLimits): Promise<Blob> {
  const budget = Math.min(limits.maxBytes, IMAGE_DEFAULTS.maxBytes);
  if (!(typeof Blob !== 'undefined' && image instanceof Blob)) return (await encodeImage(image, { maxBytes: budget })).blob;

  // Trust the bytes, not the label: pasted and dropped files often have no type at all.
  const head = await readFileBytes(image.slice(0, 65536));
  const sniffed = sniffBytes(head);
  const type = sniffed.family === 'image' ? sniffed.mime : image.type.toLowerCase();
  const accepted = limits.mediaTypes.includes(type);
  const exif = limits.normalizeExif && type === 'image/jpeg' && jpegInfo(head)?.hasExif === true;
  const heavy = image.size > Math.min(budget, REENCODE_ABOVE_BYTES);
  if (accepted && !exif && !heavy) return image.type === type ? image : new Blob([image], { type });
  if (canEncodeImages()) return (await encodeImage(image, { maxBytes: budget })).blob;
  if (accepted && image.size <= limits.maxBytes) return image.type === type ? image : new Blob([image], { type });
  throw new AiError('bad-image', { detail: `type ${type || 'unknown'}, ${image.size} bytes` });
}

// ---------------------------------------------------------------------------------------------
// The artifact `sample` capability (shapes copied from the platform's type definitions)
// ---------------------------------------------------------------------------------------------

interface SampleTurn {
  role: 'user' | 'assistant';
  content: string;
}
type SampleInput = string | SampleTurn[];
interface SampleOptions {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob[];
  modelTier?: AiTier;
  cache?: boolean;
}
interface SampleLimits {
  maxPromptBytes: number;
  images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
  modelTiers?: string[];
}
interface SampleFn {
  (input: SampleInput, options?: SampleOptions): Promise<{ text: string; truncated: boolean; modelTierApplied?: AiTier }>;
  json(input: SampleInput, options?: SampleOptions): Promise<unknown>;
  limits(): Promise<SampleLimits>;
}

/** Codes after which the feature is gone for this page load and must not be asked for again. */
const SAMPLE_GONE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

/** Map a rejection of the `sample` capability (`{ code, message, text? }`) to an `AiError`. */
export function mapSampleError(rejection: unknown): AiError {
  if (rejection instanceof AiError) return rejection;
  const r = (typeof rejection === 'object' && rejection !== null ? rejection : {}) as { code?: unknown; message?: unknown; text?: unknown };
  const code = typeof r.code === 'string' ? r.code : 'upstream_error';
  const info: AiErrorInfo = { code, detail: typeof r.message === 'string' ? r.message : String(rejection) };
  if (typeof r.text === 'string' && r.text) info.partial = r.text;
  switch (code) {
    case 'cancelled':
      return new AiError('aborted', info);
    case 'not_granted':
      return new AiError('not-granted', {
        ...info,
        message: "You chose not to let this app use Claude. You can change that in the artifact's Permissions menu.",
      });
    case 'session_expired':
      return new AiError('not-granted', { ...info, message: 'Your Claude session has ended. Sign in again, then try once more.' });
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return new AiError('not-available', info);
    case 'images_unavailable':
      return new AiError('not-available', { ...info, message: 'Claude cannot look at pictures in this view. You can still ask in words.' });
    case 'tools_unavailable':
      return new AiError('not-available', info);
    case 'rate_limited':
      return new AiError('rate-limited', info);
    case 'refused':
      // A refusal withdraws whatever had streamed, so no partial text is passed on.
      return new AiError('refused', { code, detail: info.detail });
    case 'prompt_too_large':
      return new AiError('too-large', info);
    case 'image_rejected':
      return new AiError('bad-image', info);
    case 'empty_completion':
    case 'invalid_json':
      return new AiError('bad-response', info);
    case 'invalid_request':
    case 'transform_error':
    case 'queue_overflow':
      return new AiError('invalid', info);
    default:
      return new AiError('server', info);
  }
}

// ---------------------------------------------------------------------------------------------
// The Anthropic Messages API, called from the browser
// ---------------------------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2026-10-21';
/** Lets a request the safety classifiers decline be re-run on the model Anthropic recommends. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const DEFAULT_MAX_TOKENS = 64_000;
const MAX_AUTO_RETRIES = 2;

/**
 * Model and thinking effort per tier for the standalone provider. Thinking is adaptive on both
 * models (the request does not set it); `effort` is what controls depth.
 */
export const ANTHROPIC_MODELS: Readonly<Record<AiTier, { model: string; effort: 'low' | 'medium' | 'high'; fallbacks: boolean }>> = {
  quick: { model: 'claude-haiku-5-5', effort: 'low', fallbacks: false },
  default: { model: 'claude-opus-5-5', effort: 'medium', fallbacks: true },
  complex: { model: 'claude-opus-5-5', effort: 'high', fallbacks: true },
};

/** Where the learner's key is kept (platform storage, this device only). */
const KEY_STORAGE = 'ai.anthropic-key';

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/** Build the `messages` array: earlier turns, then the prompt with its pictures in front. */
export function buildMessages(history: readonly AiTurn[] | undefined, prompt: string, images: readonly ContentBlock[] = []): ApiMessage[] {
  const turns: Array<{ role: 'user' | 'assistant'; blocks: ContentBlock[] }> = [];
  const push = (role: 'user' | 'assistant', blocks: ContentBlock[]): void => {
    const last = turns[turns.length - 1];
    // The API reads same-role neighbours as one turn; merging them keeps strict validators happy.
    if (last && last.role === role) last.blocks.push(...blocks);
    else turns.push({ role, blocks: [...blocks] });
  };
  for (const turn of history ?? []) {
    if ((turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string' || !turn.content.trim()) continue;
    if (turns.length === 0 && turn.role === 'assistant') continue; // a conversation starts with the user
    push(turn.role, [{ type: 'text', text: turn.content }]);
  }
  push('user', [...images, { type: 'text', text: prompt }]);
  return turns.map((turn) => ({
    role: turn.role,
    content: turn.blocks.length === 1 && turn.blocks[0].type === 'text' ? turn.blocks[0].text : turn.blocks,
  }));
}

/** Map an HTTP error of the Anthropic API to an `AiError`. `body` is the parsed error JSON, if any. */
export function mapAnthropicError(status: number, body: unknown, retryAfterHeader?: string | null): AiError {
  const error = (typeof body === 'object' && body !== null ? (body as { error?: { type?: unknown; message?: unknown } }).error : undefined) ?? {};
  const type = typeof error.type === 'string' ? error.type : '';
  const apiMessage = typeof error.message === 'string' ? error.message : '';
  const info: AiErrorInfo = { status, code: type || `http_${status}`, detail: apiMessage || `HTTP ${status}` };
  const seconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) info.retryAfterMs = Math.round(seconds * 1000);

  if (status === 401 || type === 'authentication_error') {
    // A valid key from an organization that forbids browser requests gets a 401 as well.
    if (apiMessage.startsWith('CORS requests are not allowed')) {
      return new AiError('not-available', {
        ...info,
        message: 'Your Anthropic organization does not allow its keys to be used from a browser, so this key cannot be used here.',
      });
    }
    return new AiError('bad-key', info);
  }
  if (status === 402 || type === 'billing_error') return new AiError('billing', info);
  if (status === 403 || type === 'permission_error') {
    return new AiError('not-granted', { ...info, message: 'This API key is not allowed to do that. Check its permissions in the Anthropic Console.' });
  }
  if (status === 404 || type === 'not_found_error') {
    return new AiError('not-available', {
      ...info,
      message: 'This API key cannot use the Claude model this feature needs. Check which models your Anthropic workspace can use.',
    });
  }
  if (status === 413 || type === 'request_too_large') return new AiError('too-large', info);
  if (status === 429 || type === 'rate_limit_error') return new AiError('rate-limited', info);
  if (status === 529 || type === 'overloaded_error') {
    return new AiError('server', { ...info, message: 'Claude is very busy right now. Try again in a moment.' });
  }
  if (status >= 500 || type === 'api_error' || type === 'timeout_error') return new AiError('server', info);
  if (status === 400 || type === 'invalid_request_error') {
    const lower = apiMessage.toLowerCase();
    if (lower.includes('credit balance') || lower.includes('billing') || lower.includes('spend limit')) return new AiError('billing', info);
    if (lower.includes('too long') || lower.includes('too large') || lower.includes('exceed')) return new AiError('too-large', info);
    // With their own key the learner is best served by Anthropic's own words.
    const said = apiMessage ? ` Anthropic said: ${apiMessage.slice(0, 240)}` : '';
    return new AiError('invalid', { ...info, message: `The request was not accepted.${said}` });
  }
  return new AiError('server', info);
}

/** Incremental parser for a server-sent event stream. */
class SseParser {
  private buffer = '';

  /** Feed more text; returns the `data` payloads of every event completed by it. */
  feed(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) break;
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = SseParser.dataOf(block);
      if (data !== null) out.push(data);
    }
    return out;
  }

  /** The payload of a final event that was not followed by a blank line. */
  end(): string[] {
    const data = SseParser.dataOf(this.buffer);
    this.buffer = '';
    return data !== null ? [data] : [];
  }

  private static dataOf(block: string): string | null {
    const lines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
    }
    return lines.length > 0 ? lines.join('\n') : null;
  }
}

interface StreamOutcome {
  text: string;
  stopReason: string | null;
}

async function* bodyChunks(response: Response): AsyncGenerator<string> {
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') {
    yield await response.text();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
    finished = true;
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    // Leaving early (an error event, a refusal): close the connection instead of letting it run on.
    if (!finished) void reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/** Read a streamed Messages API response. Throws an `AiError` for a mid-stream error event. */
async function readMessageStream(response: Response, onDelta: (text: string, delta: string) => void): Promise<StreamOutcome> {
  const parser = new SseParser();
  let text = '';
  let stopReason: string | null = null;
  let finished = false;

  const handle = (payload: string): void => {
    let event: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string | null }; error?: { type?: string; message?: string } };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      return; // not JSON: a keep-alive or something newer than this code; skip it
    }
    switch (event.type) {
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string' && event.delta.text) {
          text += event.delta.text;
          onDelta(text, event.delta.text);
        }
        break;
      case 'message_delta':
        if (typeof event.delta?.stop_reason === 'string') stopReason = event.delta.stop_reason;
        break;
      case 'message_stop':
        finished = true;
        break;
      case 'error': {
        const type = event.error?.type ?? 'api_error';
        const status = type === 'overloaded_error' ? 529 : type === 'rate_limit_error' ? 429 : 500;
        const mapped = mapAnthropicError(status, { error: event.error ?? {} });
        throw new AiError(mapped.kind, { message: mapped.message, detail: mapped.detail, code: type, status, ...(text ? { partial: text } : {}) });
      }
      default:
        break; // ping, message_start, block starts and stops, thinking deltas, future event types
    }
  };

  for await (const chunk of bodyChunks(response)) for (const payload of parser.feed(chunk)) handle(payload);
  for (const payload of parser.end()) handle(payload);
  if (!finished && stopReason === null) {
    throw new AiError('network', {
      message: 'The connection dropped before the answer was complete. Try again.',
      code: 'stream_cut',
      ...(text ? { partial: text } : {}),
    });
  }
  return { text, stopReason };
}

// ---------------------------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------------------------

/** What the service needs from its surroundings; tests swap these for fakes. */
export interface AiDeps {
  host: () => Host;
  capability: <T>(name: string) => Promise<T | null>;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  readKey: () => string | null;
  writeKey: (key: string) => void;
  removeKey: () => void;
  /** Wait, or reject early when the signal aborts. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The learner's opt-in (`prefs.ai.enabled`). False, or a failure to read it, means nothing may be sent. */
  enabled: () => boolean | Promise<boolean>;
}

/** Result of `setApiKey`. */
export type SetKeyResult = { ok: true } | { ok: false; message: string };

/** The AI service. Use the module-level functions (`ask`, `askJson`, ...) unless you are testing. */
export interface Ai {
  /** What can be asked right now, and of whom. On the artifact host this can take a few seconds the first time. */
  status(): Promise<AiStatus>;
  /** Ask a question. Rejects with an `AiError`. */
  ask(options: AskOptions): Promise<AskResult>;
  /** Ask for JSON, validate it, and retry once with the validation error if it is unusable. */
  askJson<T>(options: AskJsonOptions<T>): Promise<AskJsonResult<T>>;
  /** Store the learner's Anthropic API key on this device (after a shape check; nothing is sent). */
  setApiKey(key: string): SetKeyResult;
  /** Forget the stored key. */
  clearApiKey(): void;
  /** True when a key is stored. */
  hasApiKey(): boolean;
  /** The stored key with everything but its last four characters hidden, for the preferences screen. */
  apiKeyHint(): string | null;
  /** Check a key (the stored one by default) with a request that produces no output. */
  verifyApiKey(key?: string): Promise<{ ok: true } | { ok: false; error: AiError }>;
}

/** Call the caller's `onText` without letting an exception in it break the answer. */
function notify(onText: AskOptions['onText'], text: string, delta: string): void {
  if (!onText) return;
  try {
    onText(text, delta);
  } catch {
    /* a rendering bug on the caller's side must not look like a failed answer */
  }
}

function abortedError(partial?: string): AiError {
  return new AiError('aborted', partial ? { partial } : {});
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * The learner's opt-in, read from Settings (`aiAllowed()` in `@/core/settings`). Loaded when needed
 * because the progress store behind Settings depends on this module. Fails closed.
 */
async function learnerAllowsAi(): Promise<boolean> {
  try {
    const settings = await import('@/core/settings');
    return settings.aiAllowed() === true;
  } catch {
    return false;
  }
}

function cleanKey(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '').trim();
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Create an AI service. Production code uses the shared instance behind `ask` / `askJson`. */
export function createAi(overrides: Partial<AiDeps> = {}): Ai {
  const deps: AiDeps = {
    host: currentHost,
    capability: claudeCapability,
    fetch: (input, init) => globalThis.fetch(input, init),
    readKey: () => readRaw(KEY_STORAGE),
    writeKey: (key) => {
      writeRaw(KEY_STORAGE, key);
    },
    removeKey: () => remove(KEY_STORAGE),
    sleep: defaultSleep,
    enabled: learnerAllowsAi,
    ...overrides,
  };

  let samplePromise: Promise<SampleFn | null> | null = null;
  let limitsPromise: Promise<SampleLimits | null> | null = null;
  /** Set once the viewer (or the platform) said no for this page load. */
  let sampleGone: 'declined' | 'not-offered' | null = null;
  let sampleImagesGone = false;
  /** Cleared when the API rejects the fallback beta for this key, so later requests go without it. */
  let fallbacksAccepted = true;

  const getSample = (): Promise<SampleFn | null> => {
    samplePromise ??= deps.capability<SampleFn>('sample').then((fn) => (typeof fn === 'function' ? fn : null));
    return samplePromise;
  };
  const getLimits = async (): Promise<SampleLimits | null> => {
    const sample = await getSample();
    if (!sample) return null;
    limitsPromise ??= Promise.resolve()
      .then(() => sample.limits())
      .catch(() => null);
    return limitsPromise;
  };

  const storedKey = (): string | null => {
    const key = deps.readKey();
    return key && key.trim() ? key.trim() : null;
  };

  /** Remove the key from anything that may be shown or stored. */
  const scrub = (text: string | undefined, key: string): string | undefined => (text && key ? text.split(key).join('[key]') : text);

  /** The learner's switch; anything but a clear yes (including an error reading it) is a no. */
  async function enabledByLearner(): Promise<boolean> {
    try {
      return (await deps.enabled()) === true;
    } catch {
      return false;
    }
  }

  /** What the host offers, before the learner's switch is taken into account. */
  async function offered(): Promise<Omit<AiStatus, 'enabled'>> {
    if (deps.host() === 'artifact') {
      // The viewer blocks every outside request, so a pasted key could not be used here anyway.
      const sample = await getSample();
      if (!sample) return { available: false, provider: 'none', images: false, maxImages: 0, reason: 'not-offered' };
      if (sampleGone) return { available: false, provider: 'none', images: false, maxImages: 0, reason: sampleGone };
      const limits = await getLimits();
      const images = !!limits?.images && !sampleImagesGone;
      return { available: true, provider: 'artifact', images, maxImages: images ? Math.max(1, limits?.images?.maxCount ?? 1) : 0 };
    }
    if (!storedKey()) return { available: false, provider: 'none', images: false, maxImages: 0, reason: 'no-key' };
    // 20 keeps a request clear of the API's stricter per-picture size rule for many-picture requests.
    return { available: true, provider: 'anthropic', images: true, maxImages: 20 };
  }

  async function status(): Promise<AiStatus> {
    // What the host offers and the learner's switch are told apart, so a screen can say which one
    // stands in the way ("add a key" against "turn it on in Settings").
    const [host, enabled] = await Promise.all([offered(), enabledByLearner()]);
    return { ...host, enabled };
  }

  // -- artifact ---------------------------------------------------------------------------------

  async function askSample(options: AskOptions, tier: AiTier): Promise<AskResult> {
    const sample = await getSample();
    if (!sample) throw new AiError('not-available');
    const limits = await getLimits();

    const prompt = options.json ? options.prompt + JSON_INSTRUCTION : options.prompt;
    const turns: SampleTurn[] = [];
    // The page controls no system prompt there: standing instructions are a leading user turn.
    if (options.system?.trim()) turns.push({ role: 'user', content: options.system });
    for (const turn of options.history ?? []) {
      if ((turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string' || !turn.content.trim()) continue;
      if (turns.length === 0 && turn.role === 'assistant') continue;
      turns.push({ role: turn.role, content: turn.content });
    }
    turns.push({ role: 'user', content: prompt });
    const input: SampleInput = turns.length === 1 ? turns[0].content : turns;

    const maxPromptBytes = limits?.maxPromptBytes ?? 262144;
    if (turns.reduce((sum, turn) => sum + utf8Bytes(turn.content), 0) > maxPromptBytes) throw new AiError('too-large');

    const images: Blob[] = [];
    if (options.images?.length) {
      const imageLimits = limits?.images;
      if (!imageLimits) throw mapSampleError({ code: 'images_unavailable', message: 'this view cannot send images' });
      for (const image of options.images) {
        images.push(await prepareImage(image, { mediaTypes: imageLimits.mediaTypes, maxBytes: imageLimits.maxInputBytes, normalizeExif: false }));
      }
    }
    if (options.signal?.aborted) throw abortedError();

    let streamed = '';
    const sampleOptions: SampleOptions = {
      onText: ({ text, delta }) => {
        streamed = text;
        notify(options.onText, text, delta);
      },
    };
    if (options.signal) sampleOptions.signal = options.signal;
    if (images.length > 0) sampleOptions.images = images;
    if (tier !== 'default' && (!limits?.modelTiers || limits.modelTiers.includes(tier))) sampleOptions.modelTier = tier;
    if (options.fresh) sampleOptions.cache = false;

    try {
      if (options.json && typeof sample.json === 'function') {
        const value = await sample.json(input, sampleOptions);
        return { text: streamed || JSON.stringify(value), truncated: false, provider: 'artifact', tier, json: value };
      }
      const answer = await sample(input, sampleOptions);
      if (options.json) {
        // A viewer app from before `sample.json` existed: read the JSON out of the plain answer.
        const extracted = extractJson(answer.text);
        if (!extracted.ok) throw new AiError('bad-response', { code: 'invalid_json', detail: extracted.error, partial: answer.text });
        return { text: answer.text, truncated: answer.truncated === true, provider: 'artifact', tier, json: extracted.value };
      }
      const applied = answer.modelTierApplied;
      return {
        text: answer.text,
        truncated: answer.truncated === true,
        provider: 'artifact',
        tier: applied === 'quick' || applied === 'default' || applied === 'complex' ? applied : tier,
      };
    } catch (rejection) {
      const error = mapSampleError(rejection);
      if (error.code && SAMPLE_GONE.has(error.code)) sampleGone = error.code === 'not_granted' ? 'declined' : 'not-offered';
      if (error.code === 'images_unavailable') sampleImagesGone = true;
      if (options.json && error.code === 'invalid_json' && error.partial) {
        // The platform's reader gave up; ours is a little more forgiving, so look once more.
        const salvaged = extractJson(error.partial);
        if (salvaged.ok) return { text: error.partial, truncated: false, provider: 'artifact', tier, json: salvaged.value };
      }
      throw error;
    }
  }

  // -- Anthropic API ----------------------------------------------------------------------------

  async function send(key: string, body: Record<string, unknown>, beta: string | null, signal: AbortSignal | undefined): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      // The API only accepts cross-origin (browser) requests that opt in with this header.
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (beta) headers['anthropic-beta'] = beta;
    let response: Response;
    try {
      response = await deps.fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: signal ?? null,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    } catch (err) {
      if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') throw abortedError();
      throw new AiError('network', { detail: scrub(String((err as Error)?.message ?? err), key) });
    }
    if (response.ok) return response;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await response.text()) as unknown;
    } catch {
      parsed = null; // an HTML error page from a proxy, for example
    }
    const mapped = mapAnthropicError(response.status, parsed, response.headers?.get?.('retry-after'));
    throw new AiError(mapped.kind, {
      message: scrub(mapped.message, key),
      detail: scrub(mapped.detail, key),
      code: mapped.code,
      status: mapped.status,
      retryAfterMs: mapped.retryAfterMs,
    });
  }

  /** True for the 400 that means "this key's organization does not take the fallback beta". */
  const isFallbackRejection = (error: AiError): boolean =>
    error.status === 400 && /anthropic-beta|fallbacks|server-side-fallback/i.test(error.detail ?? '');

  async function askAnthropic(options: AskOptions, tier: AiTier, key: string): Promise<AskResult> {
    const blocks: ContentBlock[] = [];
    for (const image of options.images ?? []) {
      const blob = await prepareImage(image, { mediaTypes: MODEL_IMAGE_TYPES, maxBytes: IMAGE_DEFAULTS.maxBytes, normalizeExif: true });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: blob.type, data: bytesToBase64(await readFileBytes(blob)) } });
    }
    if (options.signal?.aborted) throw abortedError();

    const choice = ANTHROPIC_MODELS[tier];
    const prompt = options.json ? options.prompt + JSON_INSTRUCTION : options.prompt;
    const base: Record<string, unknown> = {
      model: choice.model,
      max_tokens: Math.max(1, Math.round(options.maxTokens ?? DEFAULT_MAX_TOKENS)),
      stream: true,
      output_config: { effort: choice.effort },
      messages: buildMessages(options.history, prompt, blocks),
    };
    if (options.system?.trim()) base.system = options.system;

    let streamedAny = false;
    for (let attempt = 0; ; attempt++) {
      const withFallbacks = choice.fallbacks && fallbacksAccepted;
      const body = withFallbacks ? { ...base, fallbacks: 'default' } : base;
      try {
        const response = await send(key, body, withFallbacks ? FALLBACK_BETA : null, options.signal);
        let outcome: StreamOutcome;
        try {
          outcome = await readMessageStream(response, (text, delta) => {
            streamedAny = true;
            notify(options.onText, text, delta);
          });
        } catch (err) {
          if (err instanceof AiError) throw err;
          if (options.signal?.aborted || (err as { name?: string })?.name === 'AbortError') throw abortedError();
          throw new AiError('network', {
            message: 'The connection dropped before the answer was complete. Try again.',
            detail: scrub(String((err as Error)?.message ?? err), key),
          });
        }
        // A refusal can arrive after some text; that text is incomplete and must not be kept.
        if (outcome.stopReason === 'refusal') throw new AiError('refused', { code: 'refusal' });
        if (!outcome.text.trim()) {
          throw new AiError('bad-response', {
            code: outcome.stopReason === 'max_tokens' ? 'truncated' : 'empty',
            detail: `no text in the answer (stop reason: ${outcome.stopReason ?? 'none'})`,
          });
        }
        const result: AskResult = { text: outcome.text, truncated: outcome.stopReason === 'max_tokens', provider: 'anthropic', tier };
        if (options.json) {
          const extracted = extractJson(outcome.text);
          if (!extracted.ok) {
            throw new AiError('bad-response', {
              code: result.truncated ? 'truncated' : 'unparseable',
              detail: extracted.error,
              partial: outcome.text,
              ...(result.truncated ? { message: 'The answer was cut short before it was complete. Try asking for less at a time.' } : {}),
            });
          }
          result.json = extracted.value;
        }
        return result;
      } catch (err) {
        const error = err instanceof AiError ? err : new AiError('server', { detail: scrub(String((err as Error)?.message ?? err), key) });
        if (error.kind === 'aborted' || options.signal?.aborted) throw error.kind === 'aborted' ? error : abortedError(error.partial);
        if (withFallbacks && isFallbackRejection(error)) {
          fallbacksAccepted = false;
          attempt -= 1; // not a failure of the request itself: go again without the beta
          continue;
        }
        // Start over only while nothing was shown: a second answer must never be glued to half a first.
        const transient = (error.kind === 'server' || error.kind === 'network') && !streamedAny;
        const briefLimit = error.kind === 'rate-limited' && !streamedAny && error.retryAfterMs !== undefined && error.retryAfterMs <= 8000;
        if ((transient || briefLimit) && attempt < MAX_AUTO_RETRIES) {
          await deps.sleep(briefLimit ? (error.retryAfterMs ?? 1000) : 1000 * 3 ** attempt, options.signal);
          continue;
        }
        throw error;
      }
    }
  }

  // -- public -----------------------------------------------------------------------------------

  async function ask(options: AskOptions): Promise<AskResult> {
    if (options.signal?.aborted) throw abortedError();
    if (typeof options.prompt !== 'string' || !options.prompt.trim()) throw new AiError('invalid', { detail: 'empty prompt' });
    const tier: AiTier = options.tier === 'quick' || options.tier === 'complex' ? options.tier : 'default';
    // The opt-in is enforced here, so no caller can forget it: switched off, nothing is sent and no
    // host permission is asked for.
    if (!(await enabledByLearner())) throw new AiError('disabled', { code: 'disabled' });
    if (options.signal?.aborted) throw abortedError();
    const current = await offered();
    if (!current.available) {
      if (current.reason === 'no-key') {
        throw new AiError('not-available', {
          code: 'no-key',
          message: 'This needs Claude. Add your Anthropic API key in your preferences to switch it on.',
        });
      }
      if (current.reason === 'declined') throw mapSampleError({ code: 'not_granted', message: 'declined earlier in this view' });
      throw new AiError('not-available', { code: 'not-offered' });
    }
    const count = options.images?.length ?? 0;
    if (count > 0 && !current.images) throw mapSampleError({ code: 'images_unavailable', message: 'pictures cannot be sent in this view' });
    if (count > current.maxImages && current.maxImages > 0) {
      throw new AiError('too-large', {
        message: `That is more pictures than can be sent at once. Send at most ${current.maxImages}.`,
        detail: `${count} images, limit ${current.maxImages}`,
      });
    }
    if (current.provider === 'artifact') return askSample(options, tier);
    const key = storedKey();
    if (!key) throw new AiError('not-available', { code: 'no-key' });
    return askAnthropic(options, tier, key);
  }

  async function askJson<T>(options: AskJsonOptions<T>): Promise<AskJsonResult<T>> {
    const { validate, retry, ...rest } = options;
    const attempts = retry === false ? 1 : 2;
    let current: AskOptions = rest;
    for (let attempt = 1; ; attempt++) {
      let raw = '';
      let problem = '';
      let answer: AskResult | null = null;
      try {
        answer = await ask({ ...current, json: true });
      } catch (err) {
        // Only our own "did not parse" may be asked again. The artifact host's `invalid_json`
        // is not retried from code (its contract forbids it), and a reply cut short by the
        // length limit would only be cut short again.
        if (!(err instanceof AiError) || err.code !== 'unparseable' || attempt >= attempts) throw err;
        raw = err.partial ?? '';
        problem = err.detail ?? 'it was not valid JSON';
      }
      if (answer) {
        try {
          return { value: validate(answer.json), text: answer.text, attempts: attempt, provider: answer.provider, tier: answer.tier };
        } catch (err) {
          if (err instanceof AiError) throw err;
          raw = answer.text;
          problem = String((err as Error)?.message ?? err);
        }
        if (attempt >= attempts) {
          throw new AiError('bad-response', { code: 'invalid', detail: problem, partial: raw });
        }
      }
      current = {
        ...rest,
        history: [
          ...(rest.history ?? []),
          { role: 'user', content: rest.prompt },
          { role: 'assistant', content: raw.trim() ? raw.slice(0, 20_000) : '(no usable reply)' },
        ],
        prompt: `That reply could not be used: ${problem.slice(0, 600)}\nSend the complete, corrected JSON again.`,
        // A retry must reach the model, not replay the stored first answer.
        fresh: true,
      };
    }
  }

  function setApiKey(raw: string): SetKeyResult {
    const key = cleanKey(typeof raw === 'string' ? raw : '');
    if (!key) return { ok: false, message: 'Paste your API key first.' };
    if (/\s/.test(key)) return { ok: false, message: 'An API key has no spaces or line breaks. Copy it again and paste the whole key.' };
    if (!key.startsWith('sk-ant-')) return { ok: false, message: 'That does not look like an Anthropic API key. They start with "sk-ant-".' };
    if (key.startsWith('sk-ant-admin')) {
      return { ok: false, message: 'That is an admin key, which cannot ask Claude questions. Create a regular API key in the Anthropic Console.' };
    }
    if (key.length < 24) return { ok: false, message: 'That key looks cut off. Copy it again and paste the whole key.' };
    deps.writeKey(key);
    fallbacksAccepted = true;
    return { ok: true };
  }

  function apiKeyHint(): string | null {
    const key = storedKey();
    return key ? `sk-ant-…${key.slice(-4)}` : null;
  }

  async function verifyApiKey(candidate?: string): Promise<{ ok: true } | { ok: false; error: AiError }> {
    const key = candidate !== undefined ? cleanKey(candidate) : storedKey();
    if (!key) return { ok: false, error: new AiError('not-available', { code: 'no-key', message: 'There is no API key to check yet.' }) };
    if (deps.host() === 'artifact') return { ok: false, error: new AiError('not-available', { code: 'not-offered' }) };
    const probe = (maxTokens: number): Promise<Response> =>
      send(key, { model: ANTHROPIC_MODELS.quick.model, max_tokens: maxTokens, messages: [{ role: 'user', content: 'ping' }] }, null, undefined);
    try {
      // `max_tokens: 0` is read and billed as a few input tokens but writes nothing.
      await probe(0);
      return { ok: true };
    } catch (err) {
      let error = err instanceof AiError ? err : new AiError('server');
      if (error.status === 400 && /max_tokens/i.test(error.detail ?? '')) {
        try {
          await probe(1);
          return { ok: true };
        } catch (second) {
          error = second instanceof AiError ? second : new AiError('server');
        }
      }
      return { ok: false, error };
    }
  }

  return {
    status,
    ask,
    askJson,
    setApiKey,
    clearApiKey: () => deps.removeKey(),
    hasApiKey: () => storedKey() !== null,
    apiKeyHint,
    verifyApiKey,
  };
}

// ---------------------------------------------------------------------------------------------
// The shared instance
// ---------------------------------------------------------------------------------------------

let shared: Ai | null = null;
const instance = (): Ai => (shared ??= createAi());

/** What can be asked right now: `{ available, provider, images, maxImages, reason? }`. */
export function aiStatus(): Promise<AiStatus> {
  return instance().status();
}

/** Ask the model. Resolves with `{ text, truncated, provider, tier, json? }`; rejects with an `AiError`. */
export function ask(options: AskOptions): Promise<AskResult> {
  return instance().ask(options);
}

/** Ask for JSON, check it with `validate`, and ask once more with the validation error if needed. */
export function askJson<T>(options: AskJsonOptions<T>): Promise<AskJsonResult<T>> {
  return instance().askJson(options);
}

/** Store the learner's Anthropic API key on this device. Nothing is sent anywhere by this call. */
export function setApiKey(key: string): SetKeyResult {
  return instance().setApiKey(key);
}

/** Forget the stored API key. */
export function clearApiKey(): void {
  instance().clearApiKey();
}

/** True when an API key is stored on this device. */
export function hasApiKey(): boolean {
  return instance().hasApiKey();
}

/** The stored key, masked (`sk-ant-…abcd`), for display. Null when there is none. */
export function apiKeyHint(): string | null {
  return instance().apiKeyHint();
}

/** Check that a key works (the stored one by default) without producing an answer. */
export function verifyApiKey(key?: string): Promise<{ ok: true } | { ok: false; error: AiError }> {
  return instance().verifyApiKey(key);
}

/** The same functions under one name: `ai.status()`, `ai.ask(...)`, `ai.askJson(...)`. */
export const ai: Ai = {
  status: aiStatus,
  ask,
  askJson,
  setApiKey,
  clearApiKey,
  hasApiKey,
  apiKeyHint,
  verifyApiKey,
};
