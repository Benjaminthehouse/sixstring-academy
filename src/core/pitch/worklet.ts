/**
 * The audio-thread half of the live pipeline: a tiny AudioWorklet processor that only copies the
 * microphone samples out, in fixed chunks stamped with their position on the audio clock. All
 * analysis happens elsewhere (a worker, or the main thread as a fallback), so the audio thread
 * never does real work and never glitches.
 *
 * The processor source is kept as a string and loaded from a blob: URL (then a data: URL if blobs
 * are refused), so it needs no separate file, works offline and survives any bundling.
 */

/** Registered name of the capture processor. */
export const CAPTURE_PROCESSOR = 'sixstring-capture';

/** Frames per message from the audio thread (about 5.8 ms at 44.1 kHz). */
export const CAPTURE_CHUNK = 256;

/** Source of the AudioWorklet module. Plain JavaScript: it runs in the AudioWorkletGlobalScope. */
export const CAPTURE_WORKLET_SOURCE = `
class SixstringCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    var o = (options && options.processorOptions) || {};
    this.size = o.chunk || ${CAPTURE_CHUNK};
    this.buf = new Float32Array(this.size);
    this.fill = 0;
    this.start = 0;
    this.out = this.port;
    this.alive = true;
    var self = this;
    this.port.onmessage = function (e) {
      var d = e.data || {};
      if (d.type === 'port' && d.port) self.out = d.port;
      else if (d.type === 'stop') self.alive = false;
    };
  }
  process(inputs) {
    if (!this.alive) return false;
    var input = inputs[0];
    if (!input || input.length === 0) return true;
    var ch = input[0];
    var n = ch.length;
    var chans = input.length;
    for (var i = 0; i < n; i++) {
      var s = ch[i];
      if (chans > 1) {
        for (var c = 1; c < chans; c++) s += input[c][i];
        s /= chans;
      }
      if (this.fill === 0) this.start = currentFrame + i;
      this.buf[this.fill++] = s;
      if (this.fill === this.size) {
        this.out.postMessage({ type: 'audio', frame: this.start, samples: this.buf }, [this.buf.buffer]);
        this.buf = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return true;
  }
}
try { registerProcessor('${CAPTURE_PROCESSOR}', SixstringCapture); } catch (e) { /* already registered on this context */ }
`;

const registered = new WeakSet<BaseAudioContext>();

/**
 * Make the capture processor available on `ctx`. Resolves false when AudioWorklet is missing or
 * the module could not be loaded (the caller then falls back to AnalyserNode polling).
 */
export async function addCaptureWorklet(ctx: BaseAudioContext): Promise<boolean> {
  if (registered.has(ctx)) return true;
  const worklet = (ctx as { audioWorklet?: AudioWorklet }).audioWorklet;
  if (!worklet || typeof worklet.addModule !== 'function' || typeof AudioWorkletNode === 'undefined') return false;
  const attempts: Array<() => { url: string; revoke?: () => void }> = [
    () => {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'text/javascript' }));
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
    () => ({ url: `data:text/javascript;charset=utf-8,${encodeURIComponent(CAPTURE_WORKLET_SOURCE)}` }),
  ];
  for (const make of attempts) {
    let made: { url: string; revoke?: () => void } | null = null;
    try {
      made = make();
      await worklet.addModule(made.url);
      registered.add(ctx);
      return true;
    } catch {
      // Try the next way of handing the module over.
    } finally {
      made?.revoke?.();
    }
  }
  return false;
}
