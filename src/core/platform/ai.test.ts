import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import {
  AiError,
  ANTHROPIC_MODELS,
  aiErrorMessage,
  buildMessages,
  createAi,
  encodeImage,
  extractJson,
  fitToBudget,
  isAiError,
  mapAnthropicError,
  mapSampleError,
  type Ai,
  type AiDeps,
  type AiErrorKind,
} from './ai';
import type { Host } from './env';

const KEY = 'sk-ant-api03-THISISAFAKEKEYFORTESTS-abcd';

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

interface SampleCall {
  verb: 'text' | 'json';
  input: unknown;
  options: Record<string, unknown>;
}

interface SampleBehaviour {
  text?: (call: SampleCall) => Promise<{ text: string; truncated: boolean; modelTierApplied?: string }>;
  json?: (call: SampleCall) => Promise<unknown>;
  limits?: () => Promise<unknown>;
  withoutJson?: boolean;
}

function fakeSample(behaviour: SampleBehaviour = {}) {
  const calls: SampleCall[] = [];
  const emit = (call: SampleCall, text: string): void => {
    const onText = call.options.onText as ((u: { text: string; delta: string }) => void) | undefined;
    onText?.({ text, delta: text });
  };
  const fn = async (input: unknown, options: Record<string, unknown> = {}) => {
    const call: SampleCall = { verb: 'text', input, options };
    calls.push(call);
    if (behaviour.text) return behaviour.text(call);
    emit(call, 'Hello from Claude');
    return { text: 'Hello from Claude', truncated: false, modelTierApplied: (options.modelTier as string) ?? 'default' };
  };
  const api = fn as typeof fn & { json?: unknown; limits: unknown };
  if (!behaviour.withoutJson) {
    api.json = async (input: unknown, options: Record<string, unknown> = {}) => {
      const call: SampleCall = { verb: 'json', input, options };
      calls.push(call);
      if (behaviour.json) return behaviour.json(call);
      emit(call, '{"ok":true}');
      return { ok: true };
    };
  }
  api.limits = behaviour.limits ?? (async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 20_000_000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } }));
  return { api, calls };
}

interface FetchCall {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

type Reply = Response | Error | ((call: FetchCall) => Response | Error);

function fakeFetch(replies: Reply[]) {
  const calls: FetchCall[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const call: FetchCall = { url, init, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    const next = replies.shift();
    if (next === undefined) throw new Error('unexpected request');
    const reply = typeof next === 'function' ? next(call) : next;
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetch, calls };
}

/** A streamed Messages API response, delivered in awkwardly cut chunks. */
function sse(events: Array<Record<string, unknown>>, options: { chunk?: number; crlf?: boolean; unfinished?: boolean } = {}): Response {
  const eol = options.crlf ? '\r\n' : '\n';
  let text = '';
  for (const event of events) text += `event: ${String(event.type)}${eol}data: ${JSON.stringify(event)}${eol}${eol}`;
  if (options.unfinished) text = text.replace(/(\r?\n){2}$/, '');
  const bytes = new TextEncoder().encode(text);
  const size = options.chunk ?? 17;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function answer(text: string, stopReason = 'end_turn', options: Parameters<typeof sse>[1] = {}): Response {
  const pieces = text.match(/[\s\S]{1,7}/g) ?? [];
  return sse(
    [
      { type: 'message_start', message: { id: 'msg_1', model: 'claude-opus-5-5' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'ping' },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      ...pieces.map((piece) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: piece } })),
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 12 } },
      { type: 'message_stop' },
    ],
    options,
  );
}

function apiError(status: number, type: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_1' }), { status, headers });
}

interface Rig {
  ai: Ai;
  fetchCalls: FetchCall[];
  sleeps: number[];
  store: { key: string | null };
}

function rig(options: { host?: Host; sample?: unknown; key?: string | null; replies?: Reply[]; deps?: Partial<AiDeps> } = {}): Rig {
  const store = { key: options.key === undefined ? null : options.key };
  const { fetch, calls } = fakeFetch(options.replies ?? []);
  const sleeps: number[] = [];
  const ai = createAi({
    host: () => options.host ?? 'standalone',
    capability: async <T>(name: string) => (name === 'sample' ? ((options.sample ?? null) as T | null) : null),
    fetch,
    readKey: () => store.key,
    writeKey: (key) => {
      store.key = key;
    },
    removeKey: () => {
      store.key = null;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options.deps,
  });
  return { ai, fetchCalls: calls, sleeps, store };
}

async function failure(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (err) {
    expect(isAiError(err)).toBe(true);
    return err as AiError;
  }
  throw new Error('expected the call to fail');
}

function pngBlob(type = 'image/png'): Blob {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  return new Blob([new Uint8Array(PNG.sync.write(png))], type ? { type } : undefined);
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

describe('extractJson', () => {
  it('parses a reply that is JSON and nothing else', () => {
    expect(extractJson(' {"bars":[1,2]} \n')).toEqual({ ok: true, value: { bars: [1, 2] } });
    expect(extractJson('[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] });
    expect(extractJson('﻿"just a string"')).toEqual({ ok: true, value: 'just a string' });
  });

  it('takes the body of a Markdown code fence', () => {
    expect(extractJson('Here you go:\n```json\n{"key":"A minor"}\n```\nEnjoy.')).toEqual({ ok: true, value: { key: 'A minor' } });
    expect(extractJson('```\n[{"fret":3}]\n```')).toEqual({ ok: true, value: [{ fret: 3 }] });
  });

  it('finds a bracketed value inside prose, ignoring brackets within strings', () => {
    expect(extractJson('Sure. {"text":"a } tricky \\" one","n":1} Hope that helps!')).toEqual({ ok: true, value: { text: 'a } tricky " one', n: 1 } });
    expect(extractJson('The notes are [40, 45, 50] as asked.')).toEqual({ ok: true, value: [40, 45, 50] });
  });

  it('reports what is wrong when there is nothing usable', () => {
    expect(extractJson('')).toEqual({ ok: false, error: 'the reply was empty' });
    expect(extractJson('I could not read the sheet.')).toEqual({ ok: false, error: 'the reply contains no JSON value' });
    const cut = extractJson('{"bars":[{"notes":[1,2');
    expect(cut.ok).toBe(false);
  });
});

describe('fitToBudget', () => {
  /** A stand-in encoder: bytes grow with the pixel count and with JPEG quality. */
  const encoder = (bytesPerPixel: number) => {
    const calls: Array<{ width: number; height: number; type: string; quality: number }> = [];
    const encode = async (width: number, height: number, type: 'image/jpeg' | 'image/png', quality: number): Promise<Blob> => {
      calls.push({ width, height, type, quality });
      const size = Math.round(width * height * bytesPerPixel * (type === 'image/png' ? 1 : quality));
      return { size } as Blob;
    };
    return { encode, calls };
  };
  const options = { maxBytes: 100_000, maxEdge: 1000, type: 'image/jpeg' as const, quality: 0.9 };

  it('keeps the size when it already fits, scaling only down to the longest allowed edge', async () => {
    const { encode, calls } = encoder(0.05);
    const out = await fitToBudget({ width: 4000, height: 3000 }, options, encode);
    expect([out.width, out.height]).toEqual([1000, 750]);
    expect(calls).toHaveLength(1);
    expect(calls[0].quality).toBe(0.9);
    const small = await fitToBudget({ width: 300, height: 200 }, options, encoder(0.05).encode);
    expect([small.width, small.height]).toEqual([300, 200]); // never scaled up
  });

  it('lowers the quality before giving up pixels', async () => {
    const { encode, calls } = encoder(0.16); // 1000 x 750 at 0.9 = 108 kB: just over
    const out = await fitToBudget({ width: 1000, height: 750 }, options, encode);
    expect([out.width, out.height]).toEqual([1000, 750]);
    expect(out.blob.size).toBeLessThanOrEqual(options.maxBytes);
    expect(calls.map((c) => c.quality)).toEqual([0.9, 0.82]);
  });

  it('shrinks until the budget is met, keeping the aspect ratio', async () => {
    const { encode } = encoder(2);
    const out = await fitToBudget({ width: 4000, height: 3000 }, options, encode);
    expect(out.blob.size).toBeLessThanOrEqual(options.maxBytes);
    expect(out.width).toBeLessThan(1000);
    expect(out.width / out.height).toBeCloseTo(4 / 3, 1);
  });

  it('has only the size to work with for PNG', async () => {
    const { encode, calls } = encoder(1);
    const out = await fitToBudget({ width: 800, height: 800 }, { ...options, type: 'image/png' }, encode);
    expect(out.type).toBe('image/png');
    expect(out.blob.size).toBeLessThanOrEqual(options.maxBytes);
    expect(new Set(calls.map((c) => c.quality))).toEqual(new Set([1]));
  });

  it('fails with a clear error when nothing can fit', async () => {
    const encode = async (): Promise<Blob> => ({ size: 5_000_000 }) as Blob;
    const err = await failure(fitToBudget({ width: 100, height: 100 }, options, encode));
    expect(err.kind).toBe('bad-image');
  });

  it('encodeImage reports a bad image where there is no canvas (plain Node)', async () => {
    expect((await failure(encodeImage(pngBlob()))).kind).toBe('bad-image');
  });
});

describe('buildMessages', () => {
  it('sends a lone prompt as plain text', () => {
    expect(buildMessages(undefined, 'What is a capo?')).toEqual([{ role: 'user', content: 'What is a capo?' }]);
  });

  it('puts pictures before the prompt', () => {
    const image = { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png', data: 'AAAA' } };
    expect(buildMessages([], 'Read this tab.', [image])).toEqual([{ role: 'user', content: [image, { type: 'text', text: 'Read this tab.' }] }]);
  });

  it('keeps the conversation in order, starts on a user turn and merges neighbours of one role', () => {
    const messages = buildMessages(
      [
        { role: 'assistant', content: 'Welcome!' }, // a conversation cannot start with the assistant
        { role: 'user', content: 'Hi Mia' },
        { role: 'user', content: 'How do I hold a pick?' },
        { role: 'assistant', content: 'Between thumb and index finger.' },
        { role: 'assistant', content: '   ' }, // blank turns are dropped
      ],
      'And how tight?',
    );
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hi Mia' }, { type: 'text', text: 'How do I hold a pick?' }] },
      { role: 'assistant', content: 'Between thumb and index finger.' },
      { role: 'user', content: 'And how tight?' },
    ]);
  });
});

describe('error mapping', () => {
  it('maps every sample rejection code to a kind', () => {
    const table: Array<[string, AiErrorKind]> = [
      ['cancelled', 'aborted'],
      ['not_granted', 'not-granted'],
      ['session_expired', 'not-granted'],
      ['sampling_disabled', 'not-available'],
      ['not_declared', 'not-available'],
      ['capability_disabled', 'not-available'],
      ['capability_removed', 'not-available'],
      ['images_unavailable', 'not-available'],
      ['tools_unavailable', 'not-available'],
      ['rate_limited', 'rate-limited'],
      ['refused', 'refused'],
      ['prompt_too_large', 'too-large'],
      ['image_rejected', 'bad-image'],
      ['empty_completion', 'bad-response'],
      ['invalid_json', 'bad-response'],
      ['invalid_request', 'invalid'],
      ['transform_error', 'invalid'],
      ['queue_overflow', 'invalid'],
      ['upstream_error', 'server'],
      ['some_code_from_the_future', 'server'],
    ];
    for (const [code, kind] of table) {
      const err = mapSampleError({ code, message: 'developer text', text: 'partial answer' });
      expect([code, err.kind]).toEqual([code, kind]);
      expect(err.code).toBe(code);
      expect(err.detail).toBe('developer text');
      expect(err.message).not.toContain('developer text'); // the learner never sees developer English
    }
  });

  it('keeps partial text except after a refusal, which withdraws it', () => {
    expect(mapSampleError({ code: 'upstream_error', message: 'x', text: 'half an answer' }).partial).toBe('half an answer');
    expect(mapSampleError({ code: 'refused', message: 'x', text: 'half an answer' }).partial).toBeUndefined();
  });

  it('treats anything that is not a rejection object as a service problem', () => {
    expect(mapSampleError(new Error('boom')).kind).toBe('server');
    expect(mapSampleError(undefined).kind).toBe('server');
  });

  it('maps Anthropic HTTP errors', () => {
    const body = (type: string, message: string) => ({ type: 'error', error: { type, message } });
    expect(mapAnthropicError(401, body('authentication_error', 'invalid x-api-key')).kind).toBe('bad-key');
    const cors = mapAnthropicError(401, body('authentication_error', 'CORS requests are not allowed for this Organization because of its settings'));
    expect(cors.kind).toBe('not-available');
    expect(cors.message).toMatch(/organization/i);
    expect(mapAnthropicError(402, body('billing_error', 'x')).kind).toBe('billing');
    expect(mapAnthropicError(403, body('permission_error', 'x')).kind).toBe('not-granted');
    expect(mapAnthropicError(404, body('not_found_error', 'model: claude-opus-5-5')).kind).toBe('not-available');
    expect(mapAnthropicError(413, null).kind).toBe('too-large');
    expect(mapAnthropicError(429, body('rate_limit_error', 'x'), '12')).toMatchObject({ kind: 'rate-limited', retryAfterMs: 12_000 });
    expect(mapAnthropicError(500, body('api_error', 'x')).kind).toBe('server');
    expect(mapAnthropicError(504, body('timeout_error', 'x')).kind).toBe('server');
    expect(mapAnthropicError(529, body('overloaded_error', 'Overloaded')).kind).toBe('server');
    expect(mapAnthropicError(400, body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')).kind).toBe('billing');
    expect(mapAnthropicError(400, body('invalid_request_error', 'prompt is too long: 1200000 tokens > 1000000 maximum')).kind).toBe('too-large');
    const invalid = mapAnthropicError(400, body('invalid_request_error', 'messages: at least one message is required'));
    expect(invalid.kind).toBe('invalid');
    expect(invalid.message).toContain('at least one message is required');
    expect(mapAnthropicError(418, null).kind).toBe('server');
  });

  it('has a sentence for every kind and marks which ones can be tried again', () => {
    const kinds: AiErrorKind[] = ['not-available', 'not-granted', 'rate-limited', 'network', 'bad-key', 'refused', 'aborted', 'too-large', 'bad-image', 'bad-response', 'server', 'billing', 'invalid'];
    for (const kind of kinds) {
      expect(aiErrorMessage(kind).length).toBeGreaterThan(5);
      expect(new AiError(kind).message).toBe(aiErrorMessage(kind));
    }
    expect(new AiError('server').retryable).toBe(true);
    expect(new AiError('rate-limited').retryable).toBe(true);
    expect(new AiError('bad-key').retryable).toBe(false);
    expect(new AiError('refused').retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------------------------

describe('provider selection', () => {
  it('standalone without a key: nothing is available and no request is ever made', async () => {
    const r = rig();
    expect(await r.ai.status()).toEqual({ available: false, provider: 'none', images: false, maxImages: 0, reason: 'no-key' });
    const err = await failure(r.ai.ask({ prompt: 'Hello?' }));
    expect(err).toMatchObject({ kind: 'not-available', code: 'no-key' });
    expect(err.message).toMatch(/API key/);
    expect(r.fetchCalls).toHaveLength(0);
  });

  it('standalone with a key: the Anthropic API, pictures included', async () => {
    const r = rig({ key: KEY });
    expect(await r.ai.status()).toEqual({ available: true, provider: 'anthropic', images: true, maxImages: 20 });
  });

  it('inside an artifact: the viewer capability, with pictures only when its limits offer them', async () => {
    const withImages = rig({ host: 'artifact', sample: fakeSample().api });
    expect(await withImages.ai.status()).toEqual({ available: true, provider: 'artifact', images: true, maxImages: 4 });

    const textOnly = rig({ host: 'artifact', sample: fakeSample({ limits: async () => ({ maxPromptBytes: 262144 }) }).api });
    expect(await textOnly.ai.status()).toEqual({ available: true, provider: 'artifact', images: false, maxImages: 0 });

    const brokenLimits = rig({ host: 'artifact', sample: fakeSample({ limits: async () => Promise.reject({ code: 'upstream_error' }) }).api });
    expect(await brokenLimits.ai.status()).toMatchObject({ available: true, provider: 'artifact', images: false });
  });

  it('inside an artifact without the capability: unavailable, and a stored key is NOT used (the viewer blocks the network)', async () => {
    const r = rig({ host: 'artifact', sample: null, key: KEY, replies: [answer('should never be asked')] });
    expect(await r.ai.status()).toEqual({ available: false, provider: 'none', images: false, maxImages: 0, reason: 'not-offered' });
    expect((await failure(r.ai.ask({ prompt: 'Hello?' }))).kind).toBe('not-available');
    expect(r.fetchCalls).toHaveLength(0);
  });

  it('inside an artifact with the capability, a stored key is ignored too', async () => {
    const sample = fakeSample();
    const r = rig({ host: 'artifact', sample: sample.api, key: KEY });
    expect((await r.ai.ask({ prompt: 'Hello?' })).provider).toBe('artifact');
    expect(r.fetchCalls).toHaveLength(0);
    expect(sample.calls).toHaveLength(1);
  });

  it('rejects an empty prompt and an already aborted signal before doing anything', async () => {
    const r = rig({ key: KEY });
    expect((await failure(r.ai.ask({ prompt: '   ' }))).kind).toBe('invalid');
    const controller = new AbortController();
    controller.abort();
    expect((await failure(r.ai.ask({ prompt: 'Hi', signal: controller.signal }))).kind).toBe('aborted');
    expect(r.fetchCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The artifact provider
// ---------------------------------------------------------------------------------------------

describe('artifact provider (sample capability)', () => {
  it('sends a lone prompt as a string and leaves the default tier unnamed', async () => {
    const sample = fakeSample();
    const r = rig({ host: 'artifact', sample: sample.api });
    const result = await r.ai.ask({ prompt: 'Name the open strings.' });
    expect(result).toEqual({ text: 'Hello from Claude', truncated: false, provider: 'artifact', tier: 'default' });
    expect(sample.calls[0].input).toBe('Name the open strings.');
    expect(sample.calls[0].options).not.toHaveProperty('modelTier');
    expect(sample.calls[0].options).not.toHaveProperty('cache');
    expect(sample.calls[0].options).not.toHaveProperty('signal');
    expect(sample.calls[0].options).not.toHaveProperty('images');
  });

  it('turns system instructions into a leading user turn and keeps the conversation', async () => {
    const sample = fakeSample();
    const r = rig({ host: 'artifact', sample: sample.api });
    await r.ai.ask({
      system: 'You are Mia, a patient guitar teacher.',
      history: [
        { role: 'user', content: 'My fingers hurt.' },
        { role: 'assistant', content: 'That is normal in the first weeks.' },
      ],
      prompt: 'How long should I practise?',
    });
    expect(sample.calls[0].input).toEqual([
      { role: 'user', content: 'You are Mia, a patient guitar teacher.' },
      { role: 'user', content: 'My fingers hurt.' },
      { role: 'assistant', content: 'That is normal in the first weeks.' },
      { role: 'user', content: 'How long should I practise?' },
    ]);
  });

  it('streams, passes the tier, the signal and the cache switch through, and reports the tier that answered', async () => {
    const sample = fakeSample({
      text: async (call) => {
        const onText = call.options.onText as (u: { text: string; delta: string }) => void;
        onText({ text: 'E A', delta: 'E A' });
        onText({ text: 'E A D G B E', delta: ' D G B E' });
        return { text: 'E A D G B E', truncated: true, modelTierApplied: 'default' };
      },
    });
    const r = rig({ host: 'artifact', sample: sample.api });
    const seen: Array<[string, string]> = [];
    const controller = new AbortController();
    const result = await r.ai.ask({ prompt: 'Strings?', tier: 'complex', fresh: true, signal: controller.signal, onText: (text, delta) => seen.push([text, delta]) });
    expect(seen).toEqual([['E A', 'E A'], ['E A D G B E', ' D G B E']]);
    expect(result).toMatchObject({ text: 'E A D G B E', truncated: true, tier: 'default' }); // the plan substituted a tier
    expect(sample.calls[0].options).toMatchObject({ modelTier: 'complex', cache: false, signal: controller.signal });
  });

  it('only names a tier the view accepts', async () => {
    const sample = fakeSample({ limits: async () => ({ maxPromptBytes: 262144, modelTiers: ['default', 'quick'] }) });
    const r = rig({ host: 'artifact', sample: sample.api });
    await r.ai.ask({ prompt: 'Hi', tier: 'complex' });
    await r.ai.ask({ prompt: 'Hi', tier: 'quick' });
    expect(sample.calls[0].options).not.toHaveProperty('modelTier');
    expect(sample.calls[1].options).toMatchObject({ modelTier: 'quick' });
  });

  it('passes pictures as blobs, labelling untyped ones from their bytes', async () => {
    const sample = fakeSample();
    const r = rig({ host: 'artifact', sample: sample.api });
    const typed = pngBlob();
    await r.ai.ask({ prompt: 'What chord is this diagram?', images: [typed, pngBlob('')] });
    const images = sample.calls[0].options.images as Blob[];
    expect(images).toHaveLength(2);
    expect(images[0]).toBe(typed);
    expect(images[1].type).toBe('image/png');
  });

  it('refuses pictures up front when the view cannot send them, and too many of them', async () => {
    const noImages = fakeSample({ limits: async () => ({ maxPromptBytes: 262144 }) });
    const a = rig({ host: 'artifact', sample: noImages.api });
    const err = await failure(a.ai.ask({ prompt: 'Look', images: [pngBlob()] }));
    expect(err).toMatchObject({ kind: 'not-available', code: 'images_unavailable' });
    expect(noImages.calls).toHaveLength(0);

    const sample = fakeSample();
    const b = rig({ host: 'artifact', sample: sample.api });
    const many = await failure(b.ai.ask({ prompt: 'Look', images: [pngBlob(), pngBlob(), pngBlob(), pngBlob(), pngBlob()] }));
    expect(many.kind).toBe('too-large');
    expect(many.message).toContain('4');
    expect(sample.calls).toHaveLength(0);
  });

  it('refuses a prompt over the size limit without calling', async () => {
    const sample = fakeSample({ limits: async () => ({ maxPromptBytes: 100 }) });
    const r = rig({ host: 'artifact', sample: sample.api });
    expect((await failure(r.ai.ask({ prompt: 'é'.repeat(60) }))).kind).toBe('too-large'); // 120 bytes of UTF-8
    expect(sample.calls).toHaveLength(0);
  });

  it('JSON mode uses sample.json and returns the parsed value with the raw reply', async () => {
    const sample = fakeSample({
      json: async (call) => {
        (call.options.onText as (u: { text: string; delta: string }) => void)({ text: '```json\n{"key":"G"}\n```', delta: '```json\n{"key":"G"}\n```' });
        return { key: 'G' };
      },
    });
    const r = rig({ host: 'artifact', sample: sample.api });
    const result = await r.ai.ask({ prompt: 'Which key? Reply as {"key": string}.', json: true });
    expect(result).toMatchObject({ json: { key: 'G' }, text: '```json\n{"key":"G"}\n```', provider: 'artifact' });
    expect(sample.calls[0].verb).toBe('json');
    expect(String(sample.calls[0].input)).toMatch(/Which key\?[\s\S]*JSON value only/);
  });

  it('rescues JSON the platform reader gave up on, and falls back on an old runtime without sample.json', async () => {
    const strict = fakeSample({ json: async () => Promise.reject({ code: 'invalid_json', message: 'two values', text: 'First: {"a":1}. Or maybe {"a":2}.' }) });
    const a = rig({ host: 'artifact', sample: strict.api });
    expect((await a.ai.ask({ prompt: 'x', json: true })).json).toEqual({ a: 1 });

    const hopeless = fakeSample({ json: async () => Promise.reject({ code: 'invalid_json', message: 'no value', text: 'I cannot read this sheet.' }) });
    const b = rig({ host: 'artifact', sample: hopeless.api });
    const err = await failure(b.ai.ask({ prompt: 'x', json: true }));
    expect(err).toMatchObject({ kind: 'bad-response', code: 'invalid_json', partial: 'I cannot read this sheet.' });

    const old = fakeSample({ withoutJson: true, text: async () => ({ text: 'Here: [1,2]', truncated: false }) });
    const c = rig({ host: 'artifact', sample: old.api });
    expect((await c.ai.ask({ prompt: 'x', json: true })).json).toEqual([1, 2]);
  });

  it('after the viewer declines, never asks again in this page load', async () => {
    const sample = fakeSample({ text: async () => Promise.reject({ code: 'not_granted', message: 'viewer declined' }) });
    const r = rig({ host: 'artifact', sample: sample.api });
    expect((await failure(r.ai.ask({ prompt: 'Hi' }))).kind).toBe('not-granted');
    expect(await r.ai.status()).toMatchObject({ available: false, reason: 'declined' });
    expect((await failure(r.ai.ask({ prompt: 'Hi again' }))).kind).toBe('not-granted');
    expect(sample.calls).toHaveLength(1);
  });

  it('switches pictures off for the page load when the platform says they are unavailable', async () => {
    const sample = fakeSample({ text: async () => Promise.reject({ code: 'images_unavailable', message: 'no images' }) });
    const r = rig({ host: 'artifact', sample: sample.api });
    await failure(r.ai.ask({ prompt: 'Look', images: [pngBlob()] }));
    expect(await r.ai.status()).toMatchObject({ available: true, images: false });
  });

  it('reports a cancelled call as aborted and keeps what had streamed', async () => {
    const sample = fakeSample({ text: async () => Promise.reject({ code: 'cancelled', message: 'aborted', text: 'The open str' }) });
    const r = rig({ host: 'artifact', sample: sample.api });
    expect(await failure(r.ai.ask({ prompt: 'Hi' }))).toMatchObject({ kind: 'aborted', partial: 'The open str' });
  });
});

// ---------------------------------------------------------------------------------------------
// The Anthropic provider
// ---------------------------------------------------------------------------------------------

describe('standalone provider (Anthropic Messages API)', () => {
  it('sends exactly the documented request and only to api.anthropic.com', async () => {
    const r = rig({ key: KEY, replies: [answer('Hello!')] });
    const result = await r.ai.ask({ system: 'You are Dev.', prompt: 'What is a barre chord?', maxTokens: 900 });
    expect(result).toEqual({ text: 'Hello!', truncated: false, provider: 'anthropic', tier: 'default' });
    expect(r.fetchCalls).toHaveLength(1);
    const call = r.fetchCalls[0];
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.init.method).toBe('POST');
    expect(call.init.credentials).toBe('omit');
    expect(call.init.referrerPolicy).toBe('no-referrer');
    expect(call.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    });
    expect(call.body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 900,
      stream: true,
      output_config: { effort: 'medium' },
      system: 'You are Dev.',
      messages: [{ role: 'user', content: 'What is a barre chord?' }],
      fallbacks: 'default',
    });
    // Parameters the current API rejects must never be sent.
    for (const forbidden of ['temperature', 'top_p', 'top_k', 'thinking']) expect(call.body).not.toHaveProperty(forbidden);
  });

  it('picks the model and effort by tier; the quick model takes no fallback beta', async () => {
    const r = rig({ key: KEY, replies: [answer('a'), answer('b')] });
    await r.ai.ask({ prompt: 'Hi', tier: 'quick' });
    await r.ai.ask({ prompt: 'Hi', tier: 'complex' });
    expect(r.fetchCalls[0].body).toMatchObject({ model: ANTHROPIC_MODELS.quick.model, output_config: { effort: 'low' }, max_tokens: 64000 });
    expect(r.fetchCalls[0].body).not.toHaveProperty('fallbacks');
    expect(r.fetchCalls[0].headers).not.toHaveProperty('anthropic-beta');
    expect(r.fetchCalls[1].body).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'high' }, fallbacks: 'default' });
    expect(ANTHROPIC_MODELS.quick.model).toBe('claude-haiku-5-5');
  });

  it('assembles streamed text whatever the chunking and line endings, calling onText as it grows', async () => {
    const text = 'Press the string just behind the fret, not on top of it. — Mia ♪';
    for (const options of [{ chunk: 1 }, { chunk: 5, crlf: true }, { chunk: 4096 }, { chunk: 9, unfinished: true }]) {
      const r = rig({ key: KEY, replies: [answer(text, 'end_turn', options)] });
      const seen: string[] = [];
      let deltas = '';
      const result = await r.ai.ask({
        prompt: 'Tip?',
        onText: (whole, delta) => {
          seen.push(whole);
          deltas += delta;
        },
      });
      expect(result.text).toBe(text);
      expect(deltas).toBe(text);
      expect(seen[seen.length - 1]).toBe(text);
      expect(seen.length).toBeGreaterThan(3);
    }
  });

  it('sends pictures as base64 blocks before the prompt, typed from their bytes', async () => {
    const r = rig({ key: KEY, replies: [answer('It is a C major chord.')] });
    const blob = pngBlob('');
    await r.ai.ask({ prompt: 'Which chord?', images: [blob] });
    const content = (r.fetchCalls[0].body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: Buffer.from(await blob.arrayBuffer()).toString('base64') },
    });
    expect(content[1]).toEqual({ type: 'text', text: 'Which chord?' });
  });

  it('refuses a file that is not a picture', async () => {
    const r = rig({ key: KEY, replies: [answer('x')] });
    const err = await failure(r.ai.ask({ prompt: 'Look', images: [new Blob(['%PDF-1.7 not an image'], { type: 'application/pdf' })] }));
    expect(err.kind).toBe('bad-image');
    expect(r.fetchCalls).toHaveLength(0);
  });

  it('marks an answer that hit the length limit as truncated', async () => {
    const r = rig({ key: KEY, replies: [answer('The Dorian mode is', 'max_tokens')] });
    expect(await r.ai.ask({ prompt: 'Explain modes' })).toMatchObject({ text: 'The Dorian mode is', truncated: true });
  });

  it('treats a refusal as refused and throws away what had streamed', async () => {
    const r = rig({ key: KEY, replies: [answer('I will begin by', 'refusal')] });
    const seen: string[] = [];
    const err = await failure(r.ai.ask({ prompt: 'x', onText: (t) => seen.push(t) }));
    expect(err.kind).toBe('refused');
    expect(err.partial).toBeUndefined();
    expect(err.retryable).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
    expect(r.fetchCalls).toHaveLength(1); // never retried

    const before = rig({ key: KEY, replies: [sse([{ type: 'message_start', message: {} }, { type: 'message_delta', delta: { stop_reason: 'refusal' } }, { type: 'message_stop' }])] });
    expect((await failure(before.ai.ask({ prompt: 'x' }))).kind).toBe('refused');
  });

  it('keeps reading across a server-side fallback switch', async () => {
    const r = rig({
      key: KEY,
      replies: [
        sse([
          { type: 'message_start', message: { model: 'claude-opus-4-8' } },
          { type: 'content_block_start', index: 0, content_block: { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Answered by the fallback.' } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
          { type: 'message_stop' },
        ]),
      ],
    });
    expect((await r.ai.ask({ prompt: 'x' })).text).toBe('Answered by the fallback.');
  });

  it('reports an empty answer as a bad response', async () => {
    const r = rig({ key: KEY, replies: [sse([{ type: 'message_start', message: {} }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }])] });
    expect(await failure(r.ai.ask({ prompt: 'x' }))).toMatchObject({ kind: 'bad-response', code: 'empty' });
  });

  it('surfaces an error event in the middle of the stream, keeping the text so far', async () => {
    const r = rig({
      key: KEY,
      replies: [
        sse([
          { type: 'message_start', message: {} },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'A scale is' } },
          { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
        ]),
      ],
    });
    const err = await failure(r.ai.ask({ prompt: 'x' }));
    expect(err).toMatchObject({ kind: 'server', code: 'overloaded_error', partial: 'A scale is' });
    expect(r.fetchCalls).toHaveLength(1); // text was already shown: no silent restart
  });

  it('retries a stream that died before any text, but not one that had started to answer', async () => {
    const dead = sse([{ type: 'message_start', message: {} }]);
    const a = rig({ key: KEY, replies: [dead, answer('Second time lucky.')] });
    expect((await a.ai.ask({ prompt: 'x' })).text).toBe('Second time lucky.');
    expect(a.sleeps).toEqual([1000]);

    const half = sse([{ type: 'message_start', message: {} }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Half an' } }]);
    const b = rig({ key: KEY, replies: [half, answer('never requested')] });
    expect(await failure(b.ai.ask({ prompt: 'x' }))).toMatchObject({ kind: 'network', partial: 'Half an' });
    expect(b.fetchCalls).toHaveLength(1);
  });

  it('retries overload and server errors twice with growing pauses, then gives up', async () => {
    const ok = rig({ key: KEY, replies: [apiError(529, 'overloaded_error', 'Overloaded'), apiError(500, 'api_error', 'oops'), answer('Recovered.')] });
    expect((await ok.ai.ask({ prompt: 'x' })).text).toBe('Recovered.');
    expect(ok.sleeps).toEqual([1000, 3000]);

    const down = rig({ key: KEY, replies: [1, 2, 3].map(() => apiError(529, 'overloaded_error', 'Overloaded')) });
    const err = await failure(down.ai.ask({ prompt: 'x' }));
    expect(err).toMatchObject({ kind: 'server', status: 529 });
    expect(down.fetchCalls).toHaveLength(3);
  });

  it('waits out a short rate limit once, and reports a long or open-ended one', async () => {
    const brief = rig({ key: KEY, replies: [apiError(429, 'rate_limit_error', 'slow down', { 'retry-after': '2' }), answer('Thanks for waiting.')] });
    expect((await brief.ai.ask({ prompt: 'x' })).text).toBe('Thanks for waiting.');
    expect(brief.sleeps).toEqual([2000]);

    const long = rig({ key: KEY, replies: [apiError(429, 'rate_limit_error', 'slow down', { 'retry-after': '120' })] });
    expect(await failure(long.ai.ask({ prompt: 'x' }))).toMatchObject({ kind: 'rate-limited', retryAfterMs: 120_000 });

    const open = rig({ key: KEY, replies: [apiError(429, 'rate_limit_error', 'monthly cap reached')] });
    expect((await failure(open.ai.ask({ prompt: 'x' }))).kind).toBe('rate-limited');
    expect(open.fetchCalls).toHaveLength(1);
  });

  it('never retries errors that cannot get better', async () => {
    const cases: Array<[Response, AiErrorKind]> = [
      [apiError(401, 'authentication_error', 'invalid x-api-key'), 'bad-key'],
      [apiError(403, 'permission_error', 'not allowed'), 'not-granted'],
      [apiError(404, 'not_found_error', 'model: claude-opus-5-5'), 'not-available'],
      [apiError(402, 'billing_error', 'payment required'), 'billing'],
      [apiError(400, 'invalid_request_error', 'messages: something is wrong'), 'invalid'],
      [new Response('<html>Request Entity Too Large</html>', { status: 413 }), 'too-large'],
    ];
    for (const [reply, kind] of cases) {
      const r = rig({ key: KEY, replies: [reply, answer('never requested')] });
      expect((await failure(r.ai.ask({ prompt: 'x' }))).kind).toBe(kind);
      expect(r.fetchCalls).toHaveLength(1);
      expect(r.sleeps).toEqual([]);
    }
  });

  it('goes on without the fallback beta when the organization does not accept it, and remembers that', async () => {
    const r = rig({
      key: KEY,
      replies: [apiError(400, 'invalid_request_error', 'Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.'), answer('Fine without it.'), answer('Still fine.')],
    });
    expect((await r.ai.ask({ prompt: 'x' })).text).toBe('Fine without it.');
    expect(r.fetchCalls).toHaveLength(2);
    expect(r.fetchCalls[1].headers).not.toHaveProperty('anthropic-beta');
    expect(r.fetchCalls[1].body).not.toHaveProperty('fallbacks');
    expect(r.sleeps).toEqual([]); // not a failure of the request: no pause
    await r.ai.ask({ prompt: 'y' });
    expect(r.fetchCalls[2].body).not.toHaveProperty('fallbacks');
  });

  it('reports a network failure after retrying, without ever leaking the key', async () => {
    const boom = (): Error => new TypeError(`Failed to fetch (headers: x-api-key=${KEY})`);
    const r = rig({ key: KEY, replies: [boom, boom, boom] });
    const err = await failure(r.ai.ask({ prompt: 'x' }));
    expect(err.kind).toBe('network');
    expect(r.fetchCalls).toHaveLength(3);
    expect(JSON.stringify([err.message, err.detail, err.code, err.partial])).not.toContain(KEY);
    expect(err.detail).toContain('[key]');
  });

  it('never puts the key into an error, whatever the API echoes back', async () => {
    const r = rig({ key: KEY, replies: [apiError(400, 'invalid_request_error', `bad header value ${KEY}`)] });
    const err = await failure(r.ai.ask({ prompt: 'x', tier: 'quick' }));
    expect(`${err.message} ${err.detail}`).not.toContain(KEY);
  });

  it('stops promptly when aborted during the request or between retries', async () => {
    const controller = new AbortController();
    const r = rig({
      key: KEY,
      replies: [
        () => {
          controller.abort();
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          return err;
        },
      ],
    });
    expect((await failure(r.ai.ask({ prompt: 'x', signal: controller.signal }))).kind).toBe('aborted');
    expect(r.fetchCalls[0].init.signal).toBe(controller.signal);

    const second = new AbortController();
    const waiting = rig({
      key: KEY,
      replies: [apiError(529, 'overloaded_error', 'Overloaded'), answer('never requested')],
      deps: {
        sleep: async () => {
          second.abort();
          throw new AiError('aborted');
        },
      },
    });
    expect((await failure(waiting.ai.ask({ prompt: 'x', signal: second.signal }))).kind).toBe('aborted');
    expect(waiting.fetchCalls).toHaveLength(1);
  });

  it('JSON mode asks for JSON, parses the reply, and flags a reply it cannot parse', async () => {
    const r = rig({ key: KEY, replies: [answer('```json\n{"tuning":[40,45,50,55,59,64]}\n```'), answer('The tuning is standard.'), answer('{"bars":[1,2', 'max_tokens')] });
    const good = await r.ai.ask({ prompt: 'Tuning as {"tuning": number[]}', json: true });
    expect(good.json).toEqual({ tuning: [40, 45, 50, 55, 59, 64] });
    const sent = (r.fetchCalls[0].body.messages as Array<{ content: string }>)[0].content;
    expect(sent).toMatch(/^Tuning as[\s\S]*JSON value only/);

    expect(await failure(r.ai.ask({ prompt: 'x', json: true }))).toMatchObject({ kind: 'bad-response', code: 'unparseable', partial: 'The tuning is standard.' });
    const cut = await failure(r.ai.ask({ prompt: 'x', json: true }));
    expect(cut).toMatchObject({ kind: 'bad-response', code: 'truncated' });
    expect(cut.message).toMatch(/cut short/);
  });
});

// ---------------------------------------------------------------------------------------------
// askJson
// ---------------------------------------------------------------------------------------------

describe('askJson', () => {
  interface Tab {
    bars: number[];
  }
  const validate = (value: unknown): Tab => {
    const bars = (value as { bars?: unknown } | null)?.bars;
    if (!Array.isArray(bars)) throw new Error('"bars" must be an array');
    if (bars.length === 0) throw new Error('"bars" is empty');
    return { bars: bars.map(Number) };
  };

  it('returns the validated value on the first try', async () => {
    const r = rig({ key: KEY, replies: [answer('{"bars":[1,2,3]}')] });
    const result = await r.ai.askJson({ prompt: 'Transcribe.', validate });
    expect(result).toEqual({ value: { bars: [1, 2, 3] }, text: '{"bars":[1,2,3]}', attempts: 1, provider: 'anthropic', tier: 'default' });
    expect(r.fetchCalls).toHaveLength(1);
  });

  it('asks once more with the validation error, showing the model its own reply', async () => {
    const r = rig({ key: KEY, replies: [answer('{"measures":[1,2]}'), answer('{"bars":[1,2]}')] });
    const image = pngBlob();
    const result = await r.ai.askJson({ system: 'You read tablature.', prompt: 'Transcribe this photo.', images: [image], tier: 'complex', validate });
    expect(result).toMatchObject({ value: { bars: [1, 2] }, attempts: 2 });
    expect(r.fetchCalls).toHaveLength(2);
    const retry = r.fetchCalls[1].body;
    expect(retry.system).toBe('You read tablature.');
    expect(retry.model).toBe('claude-opus-5-5');
    const messages = retry.messages as Array<{ role: string; content: unknown }>;
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0].content).toBe('Transcribe this photo.');
    expect(messages[1].content).toBe('{"measures":[1,2]}');
    const last = messages[2].content as Array<Record<string, unknown>>;
    expect(last[0].type).toBe('image'); // the picture travels with the retry
    expect(String(last[1].text)).toContain('"bars" must be an array');
    expect(String(last[1].text)).toMatch(/JSON value only/);
  });

  it('gives up after one retry, reporting the last problem and the raw reply', async () => {
    const r = rig({ key: KEY, replies: [answer('{"bars":"none"}'), answer('{"bars":[]}')] });
    const err = await failure(r.ai.askJson({ prompt: 'Transcribe.', validate }));
    expect(err).toMatchObject({ kind: 'bad-response', code: 'invalid', detail: '"bars" is empty', partial: '{"bars":[]}' });
    expect(r.fetchCalls).toHaveLength(2);
  });

  it('retries a reply that is not JSON, but not one that was cut short', async () => {
    const a = rig({ key: KEY, replies: [answer('Sorry, here is prose.'), answer('{"bars":[4]}')] });
    expect(await a.ai.askJson({ prompt: 'Transcribe.', validate })).toMatchObject({ value: { bars: [4] }, attempts: 2 });
    const second = (a.fetchCalls[1].body.messages as Array<{ content: string }>)[2].content;
    expect(second).toContain('no JSON value');

    const b = rig({ key: KEY, replies: [answer('{"bars":[1,2', 'max_tokens'), answer('never requested')] });
    expect((await failure(b.ai.askJson({ prompt: 'Transcribe.', validate }))).code).toBe('truncated');
    expect(b.fetchCalls).toHaveLength(1);
  });

  it('does not retry when told not to, nor for failures a retry cannot fix', async () => {
    const a = rig({ key: KEY, replies: [answer('{"bars":"none"}'), answer('never requested')] });
    expect((await failure(a.ai.askJson({ prompt: 'x', validate, retry: false }))).kind).toBe('bad-response');
    expect(a.fetchCalls).toHaveLength(1);

    const b = rig({ key: KEY, replies: [apiError(401, 'authentication_error', 'invalid x-api-key')] });
    expect((await failure(b.ai.askJson({ prompt: 'x', validate }))).kind).toBe('bad-key');
  });

  it('on the artifact host: retries a failed validation with the cache off, never an invalid_json', async () => {
    let n = 0;
    const sample = fakeSample({
      json: async (call) => {
        n += 1;
        const raw = n === 1 ? '{"measures":[]}' : '{"bars":[7]}';
        (call.options.onText as (u: { text: string; delta: string }) => void)({ text: raw, delta: raw });
        return JSON.parse(raw) as unknown;
      },
    });
    const r = rig({ host: 'artifact', sample: sample.api });
    expect(await r.ai.askJson({ prompt: 'Transcribe.', validate })).toMatchObject({ value: { bars: [7] }, attempts: 2, provider: 'artifact' });
    expect(sample.calls).toHaveLength(2);
    expect(sample.calls[0].options).not.toHaveProperty('cache');
    expect(sample.calls[1].options).toMatchObject({ cache: false });
    const turns = sample.calls[1].input as Array<{ role: string; content: string }>;
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(turns[1].content).toBe('{"measures":[]}');
    expect(turns[2].content).toContain('"bars" must be an array');

    const strict = fakeSample({ json: async () => Promise.reject({ code: 'invalid_json', message: 'no value', text: 'nothing here' }) });
    const s = rig({ host: 'artifact', sample: strict.api });
    expect((await failure(s.ai.askJson({ prompt: 'x', validate }))).code).toBe('invalid_json');
    expect(strict.calls).toHaveLength(1); // the capability's contract: do not retry this from code
  });
});

// ---------------------------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------------------------

describe('API key handling', () => {
  it('stores a plausible key, trimmed, and nothing else', () => {
    const r = rig();
    expect(r.ai.hasApiKey()).toBe(false);
    expect(r.ai.apiKeyHint()).toBeNull();
    expect(r.ai.setApiKey(`  "${KEY}"\n`)).toEqual({ ok: true });
    expect(r.store.key).toBe(KEY);
    expect(r.ai.hasApiKey()).toBe(true);
    expect(r.ai.apiKeyHint()).toBe('sk-ant-…abcd');
    expect(r.ai.apiKeyHint()).not.toContain('FAKEKEY');
    r.ai.clearApiKey();
    expect(r.store.key).toBeNull();
    expect(r.ai.hasApiKey()).toBe(false);
    expect(r.fetchCalls).toHaveLength(0); // storing a key sends nothing
  });

  it('explains what is wrong with input that cannot be a key', () => {
    const r = rig();
    const bad = ['', '   ', 'hunter2', 'sk-proj-abcdefghijklmnopqrstuvwxyz', 'sk-ant-api03 with spaces inside it', 'sk-ant-short', 'sk-ant-admin01-abcdefghijklmnopqrstuvwxyz'];
    for (const input of bad) {
      const result = r.ai.setApiKey(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(10);
    }
    expect(r.store.key).toBeNull();
  });

  it('checks a key with a request that writes no answer', async () => {
    const r = rig({ key: KEY, replies: [new Response(JSON.stringify({ content: [], stop_reason: 'max_tokens' }), { status: 200 })] });
    expect(await r.ai.verifyApiKey()).toEqual({ ok: true });
    expect(r.fetchCalls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.fetchCalls[0].body).toEqual({ model: 'claude-haiku-5-5', max_tokens: 0, messages: [{ role: 'user', content: 'ping' }] });
    expect(r.fetchCalls[0].headers['x-api-key']).toBe(KEY);
    expect(r.fetchCalls[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('can check a key before it is stored, and says why a key is no good', async () => {
    const candidate = 'sk-ant-api03-ANOTHERFAKEKEY-wxyz1234';
    const r = rig({ replies: [apiError(401, 'authentication_error', 'invalid x-api-key')] });
    const result = await r.ai.verifyApiKey(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('bad-key');
    expect(r.fetchCalls[0].headers['x-api-key']).toBe(candidate);
    expect(r.store.key).toBeNull(); // checking does not store

    const none = rig();
    const missing = await none.ai.verifyApiKey();
    expect(missing.ok).toBe(false);
    expect(none.fetchCalls).toHaveLength(0);
  });

  it('falls back to a one-token probe if the empty probe is not accepted', async () => {
    const r = rig({
      key: KEY,
      replies: [apiError(400, 'invalid_request_error', 'max_tokens: must be greater than or equal to 1'), new Response('{"content":[]}', { status: 200 })],
    });
    expect(await r.ai.verifyApiKey()).toEqual({ ok: true });
    expect(r.fetchCalls[1].body.max_tokens).toBe(1);
  });

  it('does not check keys from inside an artifact, where the network is blocked', async () => {
    const r = rig({ host: 'artifact', key: KEY });
    expect((await r.ai.verifyApiKey()).ok).toBe(false);
    expect(r.fetchCalls).toHaveLength(0);
  });
});

describe('the shared instance', () => {
  it('reads and writes the key through platform storage and reports no provider in a bare environment', async () => {
    const platform = await import('./ai');
    const storage = await import('./storage');
    platform.clearApiKey();
    expect(platform.hasApiKey()).toBe(false);
    expect(await platform.aiStatus()).toMatchObject({ available: false, provider: 'none', reason: 'no-key' });
    expect(platform.setApiKey(KEY)).toEqual({ ok: true });
    expect(storage.readRaw('ai.anthropic-key')).toBe(KEY);
    expect(platform.ai.hasApiKey()).toBe(true);
    expect(await platform.ai.status()).toMatchObject({ available: true, provider: 'anthropic' });
    platform.clearApiKey();
    expect(storage.readRaw('ai.anthropic-key')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('robustness', () => {
  it('an exception thrown by onText does not fail the answer, on either provider', async () => {
    const standalone = rig({ key: KEY, replies: [answer('All six strings.')] });
    const a = await standalone.ai.ask({
      prompt: 'x',
      onText: () => {
        throw new Error('render bug');
      },
    });
    expect(a.text).toBe('All six strings.');

    const sample = fakeSample();
    const viewer = rig({ host: 'artifact', sample: sample.api });
    const b = await viewer.ai.ask({
      prompt: 'x',
      onText: () => {
        throw new Error('render bug');
      },
    });
    expect(b.text).toBe('Hello from Claude');
  });

  it('closes the connection when it stops reading early', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: error\ndata: {"type":"error","error":{"type":"api_error","message":"boom"}}\n\n'));
        // The server would keep the stream open; the client must hang up.
      },
      cancel() {
        cancelled = true;
      },
    });
    const r = rig({ key: KEY, replies: [new Response(stream, { status: 200 }), answer('Recovered.')] });
    expect((await r.ai.ask({ prompt: 'x' })).text).toBe('Recovered.');
    expect(cancelled).toBe(true);
  });
});
