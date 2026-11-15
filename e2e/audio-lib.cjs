/**
 * In-page helpers shared by the audio end-to-end scripts (audio-smoke, audio-timing, audio-stress).
 *
 *   const { installPageTools } = require('./audio-lib.cjs');
 *   await installPageTools(page);           // before the first goto()
 *   ... inside page.evaluate:  const T = window.__audioTools;
 *
 * Everything here runs in the browser page, so it is written as one self-contained function.
 */
function pageTools() {
  const T = {};

  /** Small seeded generator, so every run stalls and wakes at the same moments. */
  T.rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  T.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Block the main thread, as a heavy render would. */
  T.stall = (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) { /* burn */ }
  };

  T.stats = (x, from = 0, to = x.length) => {
    let peak = 0, sum = 0, bad = 0, dc = 0;
    for (let i = from; i < to; i++) {
      const v = x[i];
      if (!(v === v) || !isFinite(v)) bad++;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
      dc += v;
    }
    const n = Math.max(1, to - from);
    return { peak, rms: Math.sqrt(sum / n), bad, dc: dc / n };
  };

  /**
   * Record every sample that leaves the engine with an AudioWorklet.
   *
   * Blocks are put together by counting them, not by the `currentFrame` each one reports: now and
   * then Chrome hands two consecutive blocks the same frame number (and corrects itself on the next),
   * which is a mislabelled block, not a missing one. A real hole (blocks that never came) shows up as
   * a lasting shift between the count and the frame numbers and is reported in `gaps`.
   */
  T.recorder = async (ctx, tapNode) => {
    const src = `
      class Rec extends AudioWorkletProcessor {
        constructor() { super(); this.n = 0; }
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          this.port.postMessage({ frame: currentFrame, n: this.n++, data: ch ? ch.slice() : null });
          return true;
        }
      }
      registerProcessor('audio-test-rec', Rec);`;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ctx, 'audio-test-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    tapNode.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    let chunks = [];
    node.port.onmessage = (e) => chunks.push(e.data);
    const BLOCK = 128;
    return {
      /** Start a capture; the returned function stops it and gives { start (frame of samples[0]), samples, gaps }. */
      capture() {
        chunks = [];
        return () => {
          const list = chunks;
          chunks = [];
          if (!list.length) return { start: 0, samples: new Float32Array(0), gaps: 0 };
          // Offset between a block's frame label and its count; constant in a healthy stream.
          const off = (c) => c.frame - c.n * BLOCK;
          let offset = off(list[0]);
          // The label of the very first block can be the stale one: trust the second if they differ and the third agrees with it.
          if (list.length > 2 && off(list[1]) !== offset && off(list[2]) === off(list[1])) offset = off(list[1]);
          let gaps = 0;
          const placed = [];
          for (let i = 0; i < list.length; i++) {
            const o = off(list[i]);
            if (o !== offset) {
              const lasting = i + 1 < list.length ? off(list[i + 1]) === o : false;
              if (lasting) { offset = o; gaps++; }
            }
            placed.push(list[i].n * BLOCK + offset);
          }
          const start = placed[0];
          const end = placed[placed.length - 1] + BLOCK;
          const samples = new Float32Array(end - start);
          for (let i = 0; i < list.length; i++) if (list[i].data) samples.set(list[i].data, placed[i] - start);
          return { start, samples, gaps };
        };
      },
      dispose() {
        try { tapNode.disconnect(node); node.disconnect(); sink.disconnect(); node.port.onmessage = null; } catch { /* gone */ }
      },
    };
  };

  /**
   * A one-sample click through the real mixer: fire(time) plays it at audio time `time` and returns
   * a function that takes it back.
   */
  T.impulsePlayer = (engine) => {
    const ctx = engine.ctx;
    const buf = ctx.createBuffer(1, 1, engine.sampleRate);
    buf.getChannelData(0)[0] = 0.5;
    return (time) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(engine.bus('click'));
      src.start(engine.nodeTime(time));
      src.onended = () => src.disconnect();
      return () => { try { src.onended = null; src.stop(); src.disconnect(); } catch { /* gone */ } };
    };
  };

  /**
   * Every impulse in a signal, as a time in seconds (centre of gravity of the one or two samples a
   * sub-sample start spreads it over). `offset` is the frame number of x[0].
   */
  T.findImpulses = (x, fs, offset = 0, threshold = 0.02) => {
    const out = [];
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i]) < threshold) continue;
      let num = 0, den = 0, j = Math.max(0, i - 1);
      const from = j;
      for (; j < x.length && j < from + 5 && (j <= i || Math.abs(x[j]) >= threshold * 0.05); j++) { num += Math.abs(x[j]) * j; den += Math.abs(x[j]); }
      out.push((offset + num / den) / fs);
      i = j + 2;
    }
    return out;
  };

  /** Compare scheduled times with found ones (both sorted): matches, strays, worst error, jitter, drift. */
  T.compare = (wanted, found, window = 0.01) => {
    let j = 0, worst = 0, sum = 0, n = 0, missing = 0;
    const errs = [];
    const used = new Uint8Array(found.length);
    for (const t of wanted) {
      while (j < found.length - 1 && found[j + 1] <= t) j++;
      let best = -1;
      for (const k of [j - 1, j, j + 1]) if (k >= 0 && k < found.length && !used[k] && (best < 0 || Math.abs(found[k] - t) < Math.abs(found[best] - t))) best = k;
      if (best < 0 || Math.abs(found[best] - t) > window) { missing++; continue; }
      used[best] = 1;
      const e = found[best] - t;
      errs.push([t, e]);
      sum += e; n++;
      if (Math.abs(e) > worst) worst = Math.abs(e);
    }
    let extra = 0;
    for (let k = 0; k < found.length; k++) if (!used[k]) extra++;
    const mean = n ? sum / n : 0;
    let jitter = 0;
    for (const [, e] of errs) jitter = Math.max(jitter, Math.abs(e - mean));
    // Drift: slope of the error against time (least squares), times the span.
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [t, e] of errs) { sx += t; sy += e; sxx += t * t; sxy += t * e; }
    const den = n * sxx - sx * sx;
    const slope = den > 0 ? (n * sxy - sx * sy) / den : 0;
    const span = errs.length ? errs[errs.length - 1][0] - errs[0][0] : 0;
    return { n, missing, extra, worst, mean, jitter, drift: slope * span, span };
  };

  window.__audioTools = T;
}

/** Make `window.__audioTools` available in every page of this Playwright page (call before goto). */
async function installPageTools(pageOrContext) {
  await pageOrContext.addInitScript(pageTools);
}

/** Print a list of { name, pass, detail } checks; returns how many failed. */
function printChecks(checks) {
  let failed = 0;
  for (const c of checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  }
  return failed;
}

module.exports = { installPageTools, pageTools, printChecks };
