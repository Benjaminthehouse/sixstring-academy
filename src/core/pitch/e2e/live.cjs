#!/usr/bin/env node
/**
 * End-to-end check of the live pitch pipeline in a real browser (pre-installed Chromium):
 * a synthetic WAV (E2, A2, E4 plucks) is fed in as the microphone, PitchTracker is started in the
 * page, and the events it emits are compared with what was "played". Runs the three pipeline
 * variants: worklet + worker, worklet on the main thread, and the AnalyserNode polling fallback.
 *
 *   node src/core/pitch/e2e/live.cjs
 *
 * Exits non-zero on failure. Uses e2e/lib/harness.cjs (dev server + Chromium with a fake microphone).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, loadTs, ROOT } = require(path.resolve(__dirname, '../../../../e2e/lib/harness.cjs'));

const SR = 48000;
const NOTES = [
  { midi: 40, at: 0.5, dur: 1.1, cents: 0 },
  { midi: 45, at: 1.7, dur: 1.1, cents: 12 },
  { midi: 64, at: 2.9, dur: 0.9, cents: -9 },
];
const LOOP = 4.6;

async function makeWav(file) {
  const sig = await loadTs('/src/core/pitch/signals.ts');
  let x = sig.silence(LOOP, SR);
  for (const n of NOTES) {
    const freq = 440 * Math.pow(2, (n.midi - 69 + n.cents / 100) / 12);
    const pluck = sig.pluckedString({
      freq, sampleRate: SR, duration: n.dur, amplitude: 0.5, attackNoise: 0.3, driftCents: 6,
      inharmonicity: 4e-5, decay: 2.5, seed: n.midi,
    });
    // Fade the tail so consecutive notes do not overlap (a damped string).
    const fade = Math.round(0.03 * SR);
    for (let i = 0; i < fade; i++) pluck[pluck.length - 1 - i] *= i / fade;
    x = sig.mix(x, pluck, Math.round(n.at * SR)).subarray(0, Math.round(LOOP * SR));
  }
  x = sig.addNoise(x, 45, 11, Math.round(0.5 * SR), Math.round(3.8 * SR));
  fs.writeFileSync(file, Buffer.from(sig.encodeWav(x, SR, { bitDepth: 16 })));
}

async function runVariant(page, variant) {
  return page.evaluate(async ({ variant, listenMs }) => {
    const pitch = await import('/src/core/pitch/index.ts');
    // Remember every stream and audio context the tracker opens, to check they are released on stop().
    const opened = { streams: [], contexts: [] };
    if (!window.__pitchSpy) {
      window.__pitchSpy = opened;
      const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await realGum(c); window.__pitchSpy.streams.push(s); return s; };
      const RealContext = window.AudioContext;
      window.AudioContext = class extends RealContext { constructor(o) { super(o); window.__pitchSpy.contexts.push(this); } };
    } else {
      window.__pitchSpy.streams.length = 0;
      window.__pitchSpy.contexts.length = 0;
    }
    const tracker = new pitch.PitchTracker({ ...variant.options });
    const log = { noteons: [], noteoffs: [], onsets: [], pitches: [], levels: 0, statuses: [], silences: 0, retriggers: 0 };
    tracker.onStatus((s, fault) => log.statuses.push(fault ? `${s}:${fault}` : s));
    tracker.on('noteon', (e) => { log.noteons.push({ midi: e.midi, time: e.time, detectedAt: e.detectedAt }); if (e.retrigger) log.retriggers++; });
    tracker.on('noteoff', (e) => log.noteoffs.push({ midi: e.midi, time: e.time }));
    tracker.on('onset', (e) => log.onsets.push(e.time));
    tracker.on('pitch', (e) => log.pitches.push({ midi: e.midi, cents: e.cents, age: e.noteAge }));
    tracker.on('level', () => { log.levels++; });
    tracker.on('silence', () => { log.silences++; });
    const res = await tracker.start();
    if (!res.ok) return { res, log };
    const info = tracker.info;
    await new Promise((r) => setTimeout(r, listenMs));
    const ctxState = tracker.audioContext ? tracker.audioContext.state : 'none';
    tracker.stop();
    // A second start/stop cycle must work and release everything again.
    const again = await tracker.start();
    await new Promise((r) => setTimeout(r, 300));
    tracker.stop();
    await new Promise((r) => setTimeout(r, 200));
    const spy = window.__pitchSpy;
    const released = {
      streams: spy.streams.length,
      liveTracks: spy.streams.flatMap((st) => st.getTracks()).filter((t) => t.readyState !== 'ended').length,
      contexts: spy.contexts.length,
      openContexts: spy.contexts.filter((c) => c.state !== 'closed').length,
      trackerContext: tracker.audioContext === null,
    };
    const devices = await pitch.PitchTracker.inputs();
    return { res, again, info, log, ctxState, released, deviceCount: devices.length, status: tracker.status };
  }, { variant, listenMs: 6500 });
}

function check(name, out) {
  const problems = [];
  if (!out.res.ok) return [`start failed: ${JSON.stringify(out.res)}`];
  if (!out.again || !out.again.ok) problems.push(`restart failed: ${JSON.stringify(out.again)}`);
  if (out.status !== 'stopped') problems.push(`status after stop is ${out.status}`);
  if (out.ctxState !== 'running') problems.push(`audio context was ${out.ctxState} while listening`);
  const rel = out.released;
  if (rel.streams !== 2 || rel.contexts !== 2) problems.push(`expected 2 streams and 2 contexts over two runs, saw ${rel.streams} and ${rel.contexts}`);
  if (rel.liveTracks !== 0) problems.push(`${rel.liveTracks} microphone track(s) still live after stop()`);
  if (rel.openContexts !== 0 || !rel.trackerContext) problems.push(`${rel.openContexts} audio context(s) still open after stop()`);
  if (out.deviceCount < 1) problems.push('no input devices listed');
  if (out.log.retriggers !== 0) problems.push(`${out.log.retriggers} false re-plucks reported`);
  if (out.log.onsets.length !== out.log.noteons.length) problems.push(`${out.log.onsets.length} onsets for ${out.log.noteons.length} notes`);
  const { log } = out;
  const seq = log.noteons.map((n) => n.midi);
  // The WAV loops, so look for the E2-A2-E4 pattern anywhere in what was heard.
  const want = NOTES.map((n) => n.midi).join(',');
  if (!seq.join(',').includes(want)) problems.push(`note sequence ${seq.join(',')} does not contain ${want}`);
  if (seq.some((m) => !NOTES.some((n) => n.midi === m))) problems.push(`unexpected notes in ${seq.join(',')}`);
  for (const n of NOTES) {
    const settled = log.pitches.filter((p) => p.midi === n.midi && p.age > 0.2 && p.age < 0.7).map((p) => p.cents).sort((a, b) => a - b);
    if (settled.length < 10) { problems.push(`only ${settled.length} settled readings for midi ${n.midi}`); continue; }
    const med = settled[settled.length >> 1];
    if (Math.abs(med - n.cents) > 2.5) problems.push(`midi ${n.midi}: median ${med.toFixed(2)} cents, expected ${n.cents}`);
  }
  if (log.levels < 100) problems.push(`only ${log.levels} level events`);
  // Onsets should come one per note: check the spacing between consecutive notes (1.2 s apart in the file).
  const gaps = [];
  for (let i = 1; i < log.noteons.length; i++) {
    if (log.noteons[i - 1].midi === 40 && log.noteons[i].midi === 45) gaps.push(log.noteons[i].time - log.noteons[i - 1].time);
  }
  for (const g of gaps) if (Math.abs(g - 1.2) > 0.03) problems.push(`E2->A2 spacing ${g.toFixed(3)} s, expected 1.200`);
  const lat = log.noteons.map((n) => (n.detectedAt - n.time) * 1000);
  console.log(`  ${name}: info ${JSON.stringify(out.info)}`);
  console.log(`    notes ${seq.join(',')}  onsets ${log.onsets.length}  pitch readings ${log.pitches.length}  level events ${log.levels}  note latency ms ${lat.map((v) => v.toFixed(0)).join(',')}`);
  for (const n of NOTES) {
    const settled = log.pitches.filter((p) => p.midi === n.midi && p.age > 0.2 && p.age < 0.7).map((p) => p.cents).sort((a, b) => a - b);
    if (settled.length) console.log(`    midi ${n.midi}: median ${settled[settled.length >> 1].toFixed(2)} cents (expected ${n.cents}), spread ${(settled[settled.length - 1] - settled[0]).toFixed(2)}`);
  }
  console.log(`    statuses ${log.statuses.join(' > ')}; after stop: ${rel.liveTracks} live tracks, ${rel.openContexts} open contexts`);
  return problems;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-e2e-'));
  const wav = path.join(dir, 'mic.wav');
  await makeWav(wav);
  console.log(`fake microphone: ${wav}`);
  const variants = [
    { name: 'worklet + worker', options: {}, expect: { capture: 'worklet', thread: 'worker' } },
    { name: 'worklet + main thread', options: { worker: false }, expect: { capture: 'worklet', thread: 'main' } },
    { name: 'analyser fallback + worker', options: { capture: 'analyser' }, expect: { capture: 'analyser', thread: 'worker' } },
  ];
  let failed = 0;
  await withApp({ fakeAudio: wav }, async ({ page, url, errors }) => {
    await page.goto(url, { waitUntil: 'load' });
    for (const v of variants) {
      const out = await runVariant(page, v);
      const problems = check(v.name, out);
      if (out.info && (out.info.capture !== v.expect.capture || out.info.thread !== v.expect.thread)) {
        problems.push(`pipeline is ${out.info.capture}/${out.info.thread}, expected ${v.expect.capture}/${v.expect.thread}`);
      }
      if (problems.length) {
        failed++;
        console.log(`  FAIL ${v.name}:\n    - ${problems.join('\n    - ')}`);
      } else {
        console.log(`  ok   ${v.name}`);
      }
    }
    const mine = errors.filter((e) => /pitch/i.test(e));
    if (mine.length) {
      failed++;
      console.log(`  page errors mentioning pitch:\n    ${mine.join('\n    ')}`);
    }
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `FAILED (${failed})` : 'PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
