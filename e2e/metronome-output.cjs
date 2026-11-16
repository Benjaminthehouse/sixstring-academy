#!/usr/bin/env node
/**
 * Independent check of what the Metronome screen (#metronome) actually sends to the speakers.
 * Run: node e2e/metronome-output.cjs
 *
 * Nothing here uses the metronome's own code or events. Before the app loads, an init script wraps
 * `AudioNode.prototype.connect`: whatever the app connects to `ctx.destination` is also connected to
 * an AudioWorklet recorder, so the check hears the real mixed output (after the engine's limiter).
 * Clicks are found as onsets in that signal; their times come from the sample position, so they
 * are exact to a sample (1/48000 s) whatever the load on the machine. The screen is driven only
 * through its controls (typing a tempo, the meter tiles, the grouping cards, switches, steppers).
 *
 * Measured: intervals at 60/120/208 BPM, 4/4 accents, 7/8 in all three groupings (with and without
 * eighths), 6/8 eighths, the swing ratio at 60/67/75 %, the speed trainer's tempo bar by bar,
 * true silence in silent bars, flash-only silence, the lit beat against the heard beat, and that
 * nothing sounds or is scheduled after leaving the route. Prints PASSED or FAILED, exits non-zero on failure.
 */
const { withApp } = require('./lib/harness.cjs');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== '' ? `  (${detail})` : ''}`);
};
const ms = (s, d = 2) => `${(s * 1000).toFixed(d)} ms`;

/** Runs in the page before the app: taps the output and counts every scheduled source. */
function captureInit() {
  const origConnect = AudioNode.prototype.connect;
  const cap = (window.__cap = { list: [], starts: [] });
  const SRC = `class Rec extends AudioWorkletProcessor { constructor(){super(); this.n=0;}
    process(inputs){ const i=inputs[0]; let d=null;
      if(i && i.length){ d=new Float32Array(128); for(const ch of i){ for(let k=0;k<ch.length;k++) d[k]+=ch[k]/i.length; } }
      this.port.postMessage({frame: currentFrame, n: this.n++, d}); return true; } }
    registerProcessor('cap-rec', Rec);`;
  const state = new WeakMap();
  function ensure(ctx) {
    let s = state.get(ctx);
    if (s) return s;
    s = { pending: [], node: null, ctx, blocks: [], recording: false };
    state.set(ctx, s);
    cap.list.push(s);
    const url = URL.createObjectURL(new Blob([SRC], { type: 'application/javascript' }));
    s.ready = ctx.audioWorklet.addModule(url).then(() => {
      const node = new AudioWorkletNode(ctx, 'cap-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const g = ctx.createGain();
      g.gain.value = 0;
      origConnect.call(node, g);
      origConnect.call(g, ctx.destination);
      node.port.onmessage = (e) => { if (s.recording) s.blocks.push(e.data); };
      s.node = node;
      for (const src of s.pending) origConnect.call(src, node);
      s.pending = [];
    });
    return s;
  }
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = origConnect.apply(this, [dest, ...rest]);
    try {
      if (dest instanceof AudioDestinationNode && this.context instanceof AudioContext) {
        const s = ensure(this.context);
        if (s.node) origConnect.call(this, s.node);
        else s.pending.push(this);
      }
    } catch (e) { cap.err = String(e); }
    return r;
  };
  const origStart = AudioScheduledSourceNode.prototype.start;
  AudioScheduledSourceNode.prototype.start = function (when, ...rest) {
    cap.starts.push({ ct: this.context.currentTime, when: when || 0 });
    return origStart.call(this, when, ...rest);
  };
  cap.ctx = () => cap.list[cap.list.length - 1];
  cap.start = async () => { const s = cap.ctx(); await s.ready; s.blocks = []; s.recording = true; return s.ctx.currentTime; };
  cap.stop = () => { const s = cap.ctx(); s.recording = false; return s.blocks.length; };
  // Blocks are placed by count, not by the frame number each reports (Chrome now and then repeats one).
  cap.signal = () => {
    const s = cap.ctx(); const b = s.blocks; const sr = s.ctx.sampleRate;
    if (!b.length) return { t0: 0, sr, x: new Float32Array(0) };
    const offs = b.map((k) => k.frame - (k.n - b[0].n) * 128).sort((p, q) => p - q);
    const f0 = offs[Math.floor(offs.length / 2)];
    const x = new Float32Array(b.length * 128);
    b.forEach((k) => { if (k.d) x.set(k.d, (k.n - b[0].n) * 128); });
    return { t0: f0 / sr, sr, x };
  };
  // An onset: the first sample above `thr` after `quietMs` below it, moved back to where the click
  // rises above 5% of its own peak (so loud and soft clicks are timed at the same point of their attack).
  cap.onsets = (thr = 0.01, quietMs = 15) => {
    const { t0, sr, x } = cap.signal();
    const quiet = Math.round((quietMs / 1000) * sr), win = Math.round(0.03 * sr);
    const out = [];
    let lastLoud = -1e9;
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i]) > thr) {
        if (i - lastLoud > quiet) {
          let pk = 0;
          for (let k = i; k < Math.min(x.length, i + win); k++) pk = Math.max(pk, Math.abs(x[k]));
          let j = i;
          const lim = Math.max(0, i - Math.round(0.002 * sr));
          while (j > lim && Math.abs(x[j - 1]) > pk * 0.05) j--;
          out.push({ t: t0 + j / sr, peak: pk });
        }
        lastLoud = i;
      }
    }
    return out;
  };
  cap.peak = (from, to) => {
    const { t0, sr, x } = cap.signal();
    const a = Math.max(0, Math.round((from - t0) * sr)), b = Math.min(x.length, Math.round((to - t0) * sr));
    let pk = 0;
    for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(x[i]));
    return { peak: pk, n: b - a };
  };
  // The lit pad, as the learner sees it: every change, with the audio time being heard at that moment.
  cap.watchLit = () => {
    cap.lit = [];
    const els = [...document.querySelectorAll('[data-beat-pad]')];
    const mo = new MutationObserver(() => {
      const p = performance.now();
      const idx = els.findIndex((el) => el.hasAttribute('data-lit'));
      const last = cap.lit[cap.lit.length - 1];
      if (!last || last.idx !== idx) {
        const ts = cap.ctx().ctx.getOutputTimestamp();
        cap.lit.push({ idx, heard: ts.contextTime + (p - ts.performanceTime) / 1000 });
      }
    });
    els.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['data-lit'] }));
    cap.unwatch = () => mo.disconnect();
  };
  window.addEventListener('pointerdown', () => {
    const s = cap.list.length ? cap.ctx() : null;
    cap.down = s ? s.ctx.currentTime : null;
  }, true);
}

const intervals = (on) => on.slice(1).map((o, i) => o.t - on[i].t);
const worst = (xs, want) => Math.max(...xs.map((x, i) => Math.abs(x - (Array.isArray(want) ? want[i % want.length] : want))));

(async () => {
  await withApp({ size: 'desktop', theme: 'dark', settle: 800 }, async ({ page, goto, errors }) => {
    await page.addInitScript(captureInit);
    await goto('metronome');
    await page.waitForSelector('[data-start]', { timeout: 30000 });
    const root = () => page.evaluate(() => ({ ...document.querySelector('[data-metronome]').dataset }));
    const typeTempo = async (n) => {
      await page.locator('[data-metronome-tempo]').click();
      await page.keyboard.type(String(n));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    };
    const toggle = () => page.locator('[data-start]').click();
    const stopIfRunning = async () => { if ((await root()).running === 'true') await toggle(); await page.waitForTimeout(250); };
    const run = async (sec, during) => {
      await page.evaluate(() => window.__cap.start());
      await toggle();
      if (during) await during();
      await page.waitForTimeout(sec * 1000);
      await page.evaluate(() => window.__cap.stop());
      const down = await page.evaluate(() => window.__cap.down);
      await stopIfRunning();
      return { on: await page.evaluate(() => window.__cap.onsets()), down };
    };
    // The first start creates the audio context (and with it the recorder).
    await toggle();
    await page.waitForTimeout(500);
    await stopIfRunning();
    check('the output can be recorded', await page.evaluate(async () => { await window.__cap.ctx().ready; return !!window.__cap.ctx().node && !window.__cap.err; }));

    // --- steady tempos, 4/4 accents ---------------------------------------------------------------------------
    for (const bpm of [60, 120, 208]) {
      await typeTempo(bpm);
      const { on, down } = await run(bpm === 60 ? 5.4 : 3.4);
      const iv = intervals(on);
      check(`4/4 at ${bpm}: clicks ${ms(60 / bpm, 1)} apart in the output, to the sample`, on.length >= 5 && worst(iv, 60 / bpm) < 0.05e-3, `${on.length} clicks, worst error ${ms(worst(iv, 60 / bpm), 4)}`);
      const accents = on.map((o) => o.peak > 0.35);
      const pattern = accents.map((a) => (a ? 'A' : 'b')).join('');
      check(`4/4 at ${bpm}: beat 1 louder than 2, 3 and 4`, /^Abbb(Abbb)*A?b{0,3}$/.test(pattern), pattern);
      if (bpm === 120) check('the first click comes soon after Start is pressed', down !== null && on[0].t - down < 0.15, `${ms(on[0].t - down, 0)} after the press, plus the output latency`);
    }

    // --- leaving the route (early, before a minute of running: recording the visit could ring a progress sound) ---
    {
      await typeTempo(120);
      await page.evaluate(() => window.__cap.start());
      await toggle();
      await page.waitForTimeout(1600);
      const at = await page.evaluate(() => {
        const cap = window.__cap;
        const c = cap.ctx().ctx;
        cap.goneAt = null;
        const mo = new MutationObserver(() => {
          if (cap.goneAt === null && !document.querySelector('[data-metronome]')) {
            cap.goneAt = c.currentTime;
            mo.disconnect();
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
        cap.starts = [];
        const t = c.currentTime;
        location.hash = '#tools';
        return t;
      });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.__cap.stop());
      const on = await page.evaluate(() => window.__cap.onsets(0.002));
      const goneAt = await page.evaluate(() => window.__cap.goneAt);
      const starts = await page.evaluate(() => window.__cap.starts);
      const late = goneAt === null ? on : on.filter((o) => o.t > goneAt + 0.03);
      const lateStarts = goneAt === null ? starts : starts.filter((s) => s.ct > goneAt);
      const tail = await page.evaluate((t) => window.__cap.peak(t + 0.5, t + 2.4), goneAt ?? at);
      check('leaving the screen: no click is heard once it has gone', goneAt !== null && on.length >= 2 && late.length === 0, `${on.length - late.length} before, ${late.length} after; the route change took ${goneAt === null ? '?' : ms(goneAt - at, 0)}`);
      check('leaving the screen: nothing more is scheduled, the output is silent', lateStarts.length === 0 && tail.peak === 0, `${lateStarts.length} sources started after leaving, peak ${tail.peak}`);
      await page.evaluate(() => { location.hash = '#metronome'; });
      await page.waitForSelector('[data-start]', { timeout: 30000 });
      await page.waitForTimeout(400);
    }

    // --- a tempo change while running ---------------------------------------------------------------------------
    await typeTempo(100);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    {
      const { on } = await run(2.4, async () => {
        await page.waitForTimeout(2200);
        await page.keyboard.press('Shift+ArrowUp');
      });
      const iv = intervals(on);
      const a = 0.6, b = 60 / 105;
      const at100 = iv.filter((x) => Math.abs(x - a) < 0.05e-3).length;
      const at105 = iv.filter((x) => Math.abs(x - b) < 0.05e-3).length;
      const between = iv.filter((x) => x > b + 0.05e-3 && x < a - 0.05e-3).length;
      const outside = iv.filter((x) => x < b - 0.05e-3 || x > a + 0.05e-3).length;
      check('Shift+Up while running (100 to 105): 600 ms, then 571.4 ms, at most one beat in between, none doubled or dropped', at100 >= 2 && at105 >= 2 && between <= 1 && outside === 0, iv.map((x) => (x * 1000).toFixed(2)).join(' '));
    }

    // --- 7/8 in its three groupings, then 6/8 ------------------------------------------------------------------
    await typeTempo(120);
    await page.locator('[data-meter-chip="more"]').click();
    await page.locator('[data-meter-choice="7/8"]').click();
    await page.waitForTimeout(200);
    const groupings = { '2+2+3': [0.5, 0.5, 0.75], '3+2+2': [0.75, 0.5, 0.5], '2+3+2': [0.5, 0.75, 0.5] };
    for (const [g, want] of Object.entries(groupings)) {
      await page.getByRole('radio', { name: new RegExp('^' + g.replace(/\+/g, '\\+')) }).click();
      await page.waitForTimeout(200);
      const { on } = await run(4.0);
      const iv = intervals(on);
      const pattern = on.map((o) => (o.peak > 0.35 ? 'A' : 'b')).join('');
      check(`7/8 as ${g} at 120: beats ${want.map((w) => w * 1000).join('/')} ms`, iv.length >= 5 && worst(iv, want) < 0.05e-3, iv.map((x) => (x * 1000).toFixed(1)).join(' '));
      check(`7/8 as ${g}: only the first beat of the bar is accented`, /^(Abb)+A?b{0,2}$/.test(pattern), pattern);
    }
    await page.getByRole('radio', { name: /^3\+2\+2/ }).click();
    await page.locator('button[data-subdivision="eighth"]').click();
    await page.waitForTimeout(200);
    {
      const { on } = await run(4.0);
      const iv = intervals(on);
      const levels = on.map((o) => (o.peak > 0.35 ? 'A' : o.peak > 0.22 ? 'B' : 's')).join('');
      check('7/8 as 3+2+2 with eighths: seven even clicks, 250 ms apart', iv.length >= 13 && worst(iv, 0.25) < 0.05e-3, `${on.length} clicks, worst ${ms(worst(iv, 0.25), 4)}`);
      check('7/8 as 3+2+2 with eighths: bar accent, then each group start louder than the eighths between', /^(AssBsBs)+A?/.test(levels), levels);
    }
    await page.locator('[data-meter-chip="6/8"]').click();
    await typeTempo(60);
    await page.waitForTimeout(200);
    {
      const { on } = await run(4.2);
      const iv = intervals(on);
      const levels = on.map((o) => (o.peak > 0.35 ? 'A' : o.peak > 0.22 ? 'B' : 's')).join('');
      check('6/8 at 60 (dotted quarters) with eighths: 333.3 ms apart, two big beats a bar', iv.length >= 10 && worst(iv, 1 / 3) < 0.05e-3 && /^(AssBss)+/.test(levels), levels);
    }
    await page.locator('button[data-subdivision="none"]').click();
    await page.locator('[data-meter-chip="4/4"]').click();

    // --- swing ----------------------------------------------------------------------------------------------------
    await typeTempo(120);
    await page.locator('button[data-subdivision="swing"]').click();
    await page.waitForTimeout(150);
    for (const target of [67, 60, 75]) {
      const slider = page.getByRole('slider', { name: /Swing feel/ });
      await slider.focus();
      let v = Number(await slider.inputValue());
      for (let k = 0; k < 40 && v !== target; k++) {
        await page.keyboard.press(v < target ? 'ArrowRight' : 'ArrowLeft');
        v = Number(await slider.inputValue());
      }
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      const { on } = await run(2.6);
      const iv = intervals(on);
      const longs = iv.filter((_, i) => i % 2 === 0), shorts = iv.filter((_, i) => i % 2 === 1);
      const avg = (a) => a.reduce((p, q) => p + q, 0) / a.length;
      const ratio = avg(longs) / (avg(longs) + avg(shorts));
      const want = target === 67 ? 2 / 3 : target / 100;
      check(`swing ${target}%: the first eighth takes ${(want * 100).toFixed(1)}% of the beat`, iv.length >= 6 && Math.abs(ratio - want) < 0.001, `measured ${(ratio * 100).toFixed(2)}%`);
    }
    await page.locator('button[data-subdivision="none"]').click();

    // --- speed trainer --------------------------------------------------------------------------------------------
    await typeTempo(100);
    await page.getByRole('switch', { name: /Speed trainer/ }).click();
    const setStepper = async (label, n) => {
      const i = page.getByRole('spinbutton', { name: label, exact: true });
      await i.fill(String(n));
      await i.press('Enter');
    };
    await setStepper('Target', 120);
    await setStepper('Step', 10);
    await setStepper('Every', 1);
    await page.waitForTimeout(200);
    {
      const { on } = await run(9.0);
      const iv = intervals(on);
      const bars = [];
      for (let b = 0; b * 4 + 3 < iv.length; b++) bars.push(iv.slice(b * 4, b * 4 + 4).map((x) => Math.round((60 / x) * 100) / 100));
      const perBar = bars.map((b) => b[0]);
      check('speed trainer 100 to 120, +10 every bar: each bar plays at 100, 110, 120, 120', perBar.slice(0, 4).join(',') === '100,110,120,120' && bars.slice(0, 4).every((b) => b.every((x) => x === b[0])), bars.map((b) => b.join('/')).join(' | '));
    }
    await page.getByRole('switch', { name: /Speed trainer/ }).click();

    // --- silent bars ----------------------------------------------------------------------------------------------
    await typeTempo(120);
    await page.getByRole('switch', { name: /Silent bars/ }).click();
    await setStepper('Click for', 1);
    await setStepper('Silent for', 1);
    {
      const { on } = await run(8.2);
      const t0 = on[0].t;
      const bars = await page.evaluate((t0) => [0, 1, 2, 3].map((b) => window.__cap.peak(t0 + b * 2 + 0.25, t0 + b * 2 + 1.95)), t0);
      check('silent bars (1 on, 1 off): the silent bars are digital silence, the others click', bars[1].peak === 0 && bars[3].peak === 0 && bars[0].peak > 0.1 && bars[2].peak > 0.1, bars.map((b) => b.peak.toFixed(4)).join(' '));
      check('silent bars: the click comes back on the bar line, on time', intervals(on).some((x) => Math.abs(x - 2.5) < 0.05e-3), intervals(on).map((x) => (x * 1000).toFixed(1)).join(' '));
    }
    await page.getByRole('switch', { name: /Silent bars/ }).click();

    // --- the lit beat against the heard beat -----------------------------------------------------------------------
    await typeTempo(120);
    {
      await page.evaluate(() => window.__cap.watchLit());
      const { on } = await run(4.2);
      const lit = (await page.evaluate(() => window.__cap.lit)).filter((l) => l.idx >= 0);
      await page.evaluate(() => window.__cap.unwatch());
      // getOutputTimestamp's contextTime is the sample leaving the speakers now, so a click rendered
      // at t is heard when that clock reads t.
      const lags = lit.map((l) => on.reduce((b, o) => (Math.abs(o.t - l.heard) < Math.abs(b - l.heard) ? o.t : b), on[0].t)).map((t, i) => lit[i].heard - t);
      const sorted = lags.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      check('the lit beat changes when its click is heard (median within about a frame and a half)', lit.length >= 6 && Math.abs(median) < 0.025, `median ${ms(median, 1)}, all ${lags.map((x) => (x * 1000).toFixed(0)).join(' ')} ms`);
      check('no lit change is far from its click (busy machine allowed)', lit.length >= 6 && Math.max(...lags.map(Math.abs)) < 0.12, `worst ${ms(Math.max(...lags.map(Math.abs)), 1)}`);
    }

    // --- flash only -----------------------------------------------------------------------------------------------
    await page.getByRole('switch', { name: /Flash only/ }).click();
    {
      const { on } = await run(2.2);
      check('flash only: nothing reaches the speakers', on.length === 0, `${on.length} onsets`);
    }
    await page.getByRole('switch', { name: /Flash only/ }).click();

    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  });
})()
  .catch((e) => check('the check ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : String(e)))
  .finally(() => {
    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}: ${checks.length - failed.length}/${checks.length} checks`);
    process.exit(failed.length ? 1 : 0);
  });
