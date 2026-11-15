#!/usr/bin/env node
/**
 * Live check of `@/core/pitch` in a real browser with a fake microphone.
 *
 *   node e2e/pitch-live.cjs             the session below + resource hygiene (about 50 s)
 *   node e2e/pitch-live.cjs --formats   also try other WAV formats as the fake microphone
 *   node e2e/pitch-live.cjs --keep      keep the fixture WAV and print where it is
 *
 * A 22 s practice session is rendered in Node with the app's own guitar (`@/core/audio`), put
 * through a laptop microphone (150 Hz high-pass, desk and wall reflections, room noise) and handed
 * to Chromium as the microphone. In the page the real `PitchTracker` runs on `getUserMedia`
 * (AudioWorklet capture, analysis in a worker) with a `Tuner` and the chord helpers attached:
 *
 *   1 s    six open strings, 2 s apart, each left ringing while the next is tuned:
 *          E2 +1.5 cents, A2 -6, D3 0, G3 +8, B3 -2, E4 +12
 *   13.6 s a C major scale, four notes a second
 *   16.6 s a strummed G major chord, then at 19.1 s a D major chord
 *
 * Checked: every note named correctly and in order, readings and the tuner needle within 3 cents
 * of the truth (median within 1), the in-tune verdict right for every string, note-on times on
 * the session's clock, both chords matched. Then resource hygiene: 20 start/stop cycles and the
 * racy ways of calling start/stop leave no AudioContext, worker or microphone track behind; a
 * lost device, a device change, a shared context and a context the system suspended while the
 * page was hidden all behave. (Headless Chromium never really hides a page: the hidden state is
 * emulated around a genuinely suspended context, and a second tab is put in front as well.)
 *
 * About the fake microphone (measured with this script, see --formats): Chromium takes a WAV with
 * 16-bit PCM (mono or stereo; 22.05, 44.1 or 48 kHz) or 32-bit float samples and resamples it to
 * the AudioContext's rate, pitch intact. 24-bit PCM plays as silence. The file starts from the top
 * for every `getUserMedia` call and loops; `%noloop` after the path plays it once (used here), after
 * which Chromium goes on repeating the last 10 ms of the file: a 100 Hz buzz, not silence.
 *
 * Exits non-zero if any check fails.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp, loadTs } = require('./lib/harness.cjs');

const SR = 48000;
const TUNING = [
  { midi: 40, string: 6, cents: 1.5, name: 'E2' },
  { midi: 45, string: 5, cents: -6, name: 'A2' },
  { midi: 50, string: 4, cents: 0, name: 'D3' },
  { midi: 55, string: 3, cents: 8, name: 'G3' },
  { midi: 59, string: 2, cents: -2, name: 'B3' },
  { midi: 64, string: 1, cents: 12, name: 'E4' },
];
const TUNE_AT = 1;
const TUNE_STEP = 2;
const TUNE_END = TUNE_AT + TUNE_STEP * TUNING.length; // 13
// C major from C3, fingered in open position.
const SCALE = [
  { midi: 48, string: 5 }, { midi: 50, string: 4 }, { midi: 52, string: 4 }, { midi: 53, string: 4 },
  { midi: 55, string: 3 }, { midi: 57, string: 3 }, { midi: 59, string: 2 }, { midi: 60, string: 2 },
];
const SCALE_AT = 13.6;
const SCALE_STEP = 0.25;
const CHORDS = [
  { name: 'G', at: 16.6, midis: [43, 47, 50, 55, 59, 67], pcs: [7, 11, 2], bass: 7 },
  { name: 'D', at: 19.1, midis: [50, 57, 62, 66], pcs: [2, 6, 9], bass: 2 },
];
const RIVALS = [
  { name: 'G', pcs: [7, 11, 2] }, { name: 'D', pcs: [2, 6, 9] }, { name: 'C', pcs: [0, 4, 7] }, { name: 'Em', pcs: [4, 7, 11] },
  { name: 'Am', pcs: [9, 0, 4] }, { name: 'E', pcs: [4, 8, 11] }, { name: 'A', pcs: [9, 1, 4] }, { name: 'Dm', pcs: [2, 5, 9] },
  { name: 'Bm', pcs: [11, 2, 6] }, { name: 'F', pcs: [5, 9, 0] },
];
const TOTAL = 22.4;

/** Render the session and write it as the fake microphone (48 kHz, 16-bit, mono). */
async function makeSession(file) {
  const audio = await loadTs('/src/core/audio/index.ts');
  const kit = await loadTs('/src/core/pitch/adversarial-kit.ts');
  const notes = [];
  // Tuning: nobody damps the last string before plucking the next, so they ring on underneath.
  TUNING.forEach((s, i) => {
    const time = TUNE_AT + i * TUNE_STEP;
    notes.push({ time, midi: s.midi, string: s.string, cents: s.cents, velocity: 0.8, duration: TUNE_END + 0.2 - time });
  });
  SCALE.forEach((n, i) => notes.push({ time: SCALE_AT + i * SCALE_STEP, midi: n.midi, string: n.string, velocity: 0.75, duration: 0.24 }));
  for (const chord of CHORDS) {
    for (const p of audio.strumPlan(chord.midis, { direction: 'down', spread: 0.03, velocity: 0.8 })) {
      notes.push({ time: chord.at + p.offset, midi: p.midi, string: p.string, velocity: p.velocity, direction: p.direction, duration: 2.2 });
    }
  }
  let x = audio.renderSequence(notes, { sampleRate: SR, seconds: TOTAL, tone: 'steel' });
  x = kit.micHighpass(kit.earlyReflections(x, SR), SR, 150);
  x = kit.mixInto(x, kit.background('pink', SR, x.length, 7), Math.pow(10, -52 / 20));
  fs.writeFileSync(file, Buffer.from(audio.encodeWav(x, SR, { bitDepth: 16 })));
  return { peak: kit.peak(x), rms: kit.rms(x) };
}

/** Runs in the page: the whole session through the real tracker, a tuner and the chord helpers. */
function listenToSession({ total, chords, rivals }) {
  return (async () => {
    const pitch = await import('/src/core/pitch/index.ts');
    const tracker = new pitch.PitchTracker({ chroma: true });
    const tuner = new pitch.Tuner();
    const log = { noteOns: [], noteOffs: [], pitches: [], onsets: [], tuner: [], tuned: [], chroma: [], levels: 0, clipping: 0, hum: [], silences: [], statuses: [], chords: [] };
    let now = 0;
    tracker.onStatus((s, fault) => log.statuses.push(fault ? `${s}:${fault}` : s));
    tracker.on('noteon', (e) => log.noteOns.push({ midi: e.midi, time: e.time, detectedAt: e.detectedAt, retrigger: e.retrigger }));
    tracker.on('noteoff', (e) => log.noteOffs.push({ midi: e.midi, time: e.time }));
    tracker.on('pitch', (e) => { now = e.time; log.pitches.push({ time: e.time, midi: e.midi, cents: e.cents, clarity: e.clarity, age: e.noteAge }); });
    tracker.on('onset', (e) => log.onsets.push(e.time));
    tracker.on('silence', (e) => log.silences.push(e.time));
    tracker.on('level', (e) => { log.levels++; if (e.clipping) log.clipping++; if (e.hum) log.hum.push({ time: e.time, db: e.db, gateDb: e.gateDb }); });
    tracker.on('chroma', (e) => log.chroma.push({ time: e.time, chroma: e.chroma, bass: e.bass }));
    tuner.onTuned((index) => log.tuned.push({ index, time: now }));
    pitch.attachTuner(tracker, tuner, (s) => {
      if (s.active) log.tuner.push({ time: now, string: s.string, cents: s.cents, inTune: s.inTune, hint: s.hint.code, direction: s.direction, tuned: s.tuned.slice() });
    });
    const res = await tracker.start();
    if (!res.ok) return { res, log };
    const ctx = tracker.audioContext;
    const started = ctx.currentTime;
    const info = tracker.info;
    // One chord after the other, each asked for half a second before it is strummed, the way a
    // lesson would (asked for earlier, every pluck of the tuning would count as a failed attempt).
    (async () => {
      for (const chord of chords) {
        while (ctx.currentTime < started + chord.at - 0.5) await new Promise((ok) => setTimeout(ok, 50));
        const r = await pitch.waitForChord(tracker, chord, { rivals: rivals.filter((c) => c.name !== chord.name), timeoutMs: 4000 });
        log.chords.push({ name: chord.name, ok: r.ok, time: r.time, failedAttempts: r.failedAttempts, score: r.ok ? r.match.score : r.lastAttempt ? r.lastAttempt.score : null, reason: r.ok ? '' : r.reason });
      }
    })();
    while (ctx.currentTime < started + total + 0.8) await new Promise((ok) => setTimeout(ok, 100));
    const state = ctx.state;
    tracker.stop();
    return { res, info, log, started, state, status: tracker.status };
  })();
}

/** Runs in the page: start/stop cycles, races, lost device, device change, shared context, background, suspend. */
function hygiene() {
  return (async () => {
    const pitch = await import('/src/core/pitch/index.ts');
    const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
    // Spies: everything the tracker opens is remembered so that it can be checked for being released.
    const spy = { streams: [], contexts: [], workers: 0, terminated: 0, worklets: 0 };
    const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await realGum(c); spy.streams.push(s); return s; };
    const RealContext = window.AudioContext;
    window.AudioContext = class extends RealContext { constructor(o) { super(o); spy.contexts.push(this); } };
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      constructor(...a) { super(...a); spy.workers++; }
      terminate() { spy.terminated++; super.terminate(); }
    };
    const RealNode = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends RealNode { constructor(...a) { super(...a); spy.worklets++; } };
    const open = () => ({
      liveTracks: spy.streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== 'ended').length,
      openContexts: spy.contexts.filter((c) => c.state !== 'closed').length,
      liveWorkers: spy.workers - spy.terminated,
    });
    const out = {};

    // 1. Twenty start/stop cycles.
    {
      const tracker = new pitch.PitchTracker();
      let events = 0;
      let late = 0;
      let stopped = true;
      tracker.on('level', () => { if (stopped) late++; else events++; });
      const failures = [];
      const before = { ...spy, streams: spy.streams.length, contexts: spy.contexts.length };
      for (let i = 0; i < 20; i++) {
        stopped = false;
        const r = await tracker.start();
        if (!r.ok) failures.push(`cycle ${i}: ${JSON.stringify(r)}`);
        await sleep(220);
        tracker.stop();
        stopped = true;
        if (tracker.audioContext !== null || tracker.info !== null || tracker.status !== 'stopped') failures.push(`cycle ${i}: not released`);
        await sleep(40);
      }
      await sleep(300);
      out.cycles = {
        failures, events, late, ...open(),
        streams: spy.streams.length - before.streams, contexts: spy.contexts.length - before.contexts,
        workers: spy.workers - before.workers, worklets: spy.worklets - before.worklets,
      };
    }

    // 2. stop() while start() is still waiting for the microphone, ten times over.
    {
      const tracker = new pitch.PitchTracker();
      const results = [];
      for (let i = 0; i < 10; i++) {
        const p = tracker.start();
        tracker.stop();
        results.push(p);
        if (i % 3 === 0) await sleep(15);
      }
      const settled = await Promise.all(results);
      await sleep(400);
      out.race = { oks: settled.filter((r) => r.ok).length, status: tracker.status, ...open() };
    }

    // 3. start() twice without waiting: one pipeline, not two.
    {
      const tracker = new pitch.PitchTracker();
      const [a, b] = await Promise.all([tracker.start(), tracker.start()]);
      await sleep(300);
      const during = open();
      tracker.stop();
      await sleep(300);
      out.double = { first: a, second: b, during, after: open() };
    }

    // 4. The microphone goes away while a note is sounding (the fixture's E2 starts 1 s in).
    {
      const tracker = new pitch.PitchTracker();
      const seen = { statuses: [], noteOns: 0, noteOffs: 0, lateEvents: 0 };
      let lost = false;
      tracker.onStatus((s, fault) => seen.statuses.push(fault ? `${s}:${fault}` : s));
      tracker.on('noteon', () => { seen.noteOns++; });
      tracker.on('noteoff', () => { seen.noteOffs++; });
      tracker.on('level', () => { if (lost) seen.lateEvents++; });
      await tracker.start();
      const stream = spy.streams[spy.streams.length - 1];
      const deadline = performance.now() + 4000;
      while (seen.noteOns === 0 && performance.now() < deadline) await sleep(50);
      await sleep(250);
      const offsBefore = seen.noteOffs;
      // What the browser does when a USB microphone is unplugged: the track ends by itself.
      stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));
      lost = true;
      await sleep(400);
      out.lost = { ...seen, noteOffAtLoss: seen.noteOffs - offsBefore, status: tracker.status, context: tracker.audioContext === null, ...open() };
    }

    // 5. Another microphone, then one that does not exist.
    {
      const tracker = new pitch.PitchTracker();
      let events = 0;
      tracker.on('level', () => { events++; });
      await tracker.start();
      const inputs = await pitch.PitchTracker.inputs();
      const first = tracker.info ? tracker.info.deviceId : '';
      const other = inputs.find((d) => d.deviceId && d.deviceId !== first && d.deviceId !== 'default');
      const info = { count: inputs.length, labels: inputs.map((d) => d.label) };
      if (other) {
        const r = await tracker.setDevice(other.deviceId);
        await sleep(400);
        info.switched = r;
        info.deviceId = tracker.info ? tracker.info.deviceId === other.deviceId : false;
        info.duringSwitch = open();
        const n = events;
        await sleep(400);
        info.eventsAfter = events - n;
      }
      const bogus = await tracker.setDevice('no-such-microphone');
      await sleep(300);
      info.bogus = bogus;
      info.statusAfterBogus = tracker.status;
      info.afterBogus = open();
      tracker.stop();
      await sleep(200);
      out.devices = { ...info, after: open() };
    }

    // 6. A stream and a context that belong to the caller are left alone.
    {
      const ctx = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracker = new pitch.PitchTracker({ stream, audioContext: ctx });
      let events = 0;
      let lastTime = 0;
      tracker.on('level', (e) => { events++; lastTime = e.time; });
      const r = await tracker.start();
      await sleep(600);
      const clockError = Math.abs(lastTime - ctx.currentTime);
      tracker.stop();
      await sleep(200);
      out.shared = { start: r, events, clockError, contextState: ctx.state, trackState: stream.getAudioTracks()[0].readyState };
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    }

    // 7. The system suspends the audio context (a phone call, the page in the background); when
    //    the page is in front again the tracker has to wake it up by itself.
    {
      const tracker = new pitch.PitchTracker();
      let events = 0;
      tracker.on('level', () => { events++; });
      await tracker.start();
      await sleep(300);
      const ctx = tracker.audioContext;
      const running = events;
      // Suspended while "hidden": nothing may restart it behind the user's back.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await ctx.suspend();
      await sleep(400);
      const stateHidden = ctx.state;
      const whileSuspended = events - running;
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      await sleep(500);
      const afterWake = events - running - whileSuspended;
      out.suspend = { stateHidden, whileSuspended, stateAfter: ctx.state, afterWake, status: tracker.status };
      tracker.stop();
      await sleep(200);
    }

    out.final = { ...open(), streams: spy.streams.length, contexts: spy.contexts.length, workers: spy.workers, terminated: spy.terminated, worklets: spy.worklets };
    return out;
  })();
}

/** Runs in the page: how many level events arrive in `ms` with the given capture mode. */
function countEvents({ capture, ms }) {
  return (async () => {
    const pitch = await import('/src/core/pitch/index.ts');
    const tracker = new pitch.PitchTracker(capture ? { capture } : {});
    window.__bgTracker = tracker;
    window.__bgCount = 0;
    tracker.on('level', () => { window.__bgCount++; });
    const r = await tracker.start();
    await new Promise((ok) => setTimeout(ok, ms));
    return { ok: r.ok, info: tracker.info, count: window.__bgCount };
  })();
}

const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const quant = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(q * (s.length - 1)))] : NaN; };

function checkSession(out, check) {
  if (!out.res.ok) { check('microphone opened', false, JSON.stringify(out.res)); return; }
  const { log, info } = out;
  check('pipeline is AudioWorklet capture + worker analysis', info.capture === 'worklet' && info.thread === 'worker', `${info.capture}/${info.thread} at ${info.sampleRate} Hz, device "${info.deviceLabel}"`);
  check('audio context was running, then released', out.state === 'running' && out.status === 'stopped', `${out.state}, ${log.statuses.join(' > ')}`);

  // File time: the first E2 is 1.000 s into the session.
  const firstE = log.noteOns.find((n) => n.midi === TUNING[0].midi);
  if (!firstE) { check('the first string is heard', false, `note-ons: ${log.noteOns.map((n) => n.midi).join(',')}`); return; }
  const offset = firstE.time - TUNE_AT;
  const ft = (t) => t - offset;
  check('the session starts with the stream', Math.abs(offset - out.started) < 0.6, `file time 0 is ${(offset - out.started).toFixed(3)} s after start() resolved`);
  const inside = (t, a, b) => ft(t) >= a && ft(t) < b;

  // --- 1. tuning -------------------------------------------------------------------------------
  const tuningOns = log.noteOns.filter((n) => inside(n.time, 0, TUNE_END + 0.3));
  check('tuning: six note-ons, the six strings in order', tuningOns.map((n) => n.midi).join() === TUNING.map((s) => s.midi).join(), tuningOns.map((n) => `${n.midi}@${ft(n.time).toFixed(2)}`).join(' '));
  check('tuning: no false re-plucks', tuningOns.every((n) => !n.retrigger), '');
  TUNING.forEach((s, i) => {
    const at = TUNE_AT + i * TUNE_STEP;
    const on = tuningOns.find((n) => n.midi === s.midi);
    const readings = log.pitches.filter((p) => p.midi === s.midi && inside(p.time, at + 0.3, at + 1.9));
    const errs = readings.map((p) => Math.abs(p.cents - s.cents));
    const med = median(readings.map((p) => p.cents));
    const within3 = errs.filter((e) => e <= 3).length / Math.max(1, errs.length);
    check(
      `${s.name} (${s.cents >= 0 ? '+' : ''}${s.cents} cents): pitch readings`,
      !!on && Math.abs(ft(on.time) - at) < 0.04 && readings.length > 90 && Math.abs(med - s.cents) <= 1 && within3 >= 0.95 && Math.max(...errs) <= 6,
      `note-on at ${on ? ft(on.time).toFixed(3) : '-'} s (pluck at ${at}), ${readings.length} readings, median ${med.toFixed(2)}, ${(100 * within3).toFixed(1)} % within 3 cents, worst ${Math.max(...errs).toFixed(2)}`,
    );
    const states = log.tuner.filter((r) => inside(r.time, at + 0.3, at + 1.9));
    const needle = states.map((r) => Math.abs(r.cents - s.cents));
    const shouldBeInTune = Math.abs(s.cents) <= 2;
    const everInTune = log.tuner.filter((r) => inside(r.time, at, at + TUNE_STEP)).some((r) => r.inTune && r.string === i);
    const firstIn = log.tuner.find((r) => inside(r.time, at, at + TUNE_STEP) && r.inTune && r.string === i);
    const dirOk = shouldBeInTune || states.every((r) => r.direction === (s.cents < 0 ? 'up' : 'down'));
    check(
      `${s.name}: tuner shows string ${i + 1} of 6, needle within 3 cents, ${shouldBeInTune ? 'confirms in tune' : `says "${s.cents < 0 ? 'tighten' : 'loosen'}" and never "in tune"`}`,
      states.length > 90 && states.every((r) => r.string === i) && Math.max(...needle) <= 3 && median(needle) <= 1 && everInTune === shouldBeInTune && dirOk,
      `${states.length} states, needle error median ${median(needle).toFixed(2)} max ${Math.max(...needle).toFixed(2)}, in tune: ${everInTune}${firstIn ? ` after ${((ft(firstIn.time) - at) * 1000).toFixed(0)} ms` : ''}, hint ${[...new Set(states.map((r) => r.hint))].join('/')}`,
    );
  });
  const wantTuned = TUNING.map((s) => Math.abs(s.cents) <= 2);
  const tunedOrder = log.tuned.filter((t) => inside(t.time, 0, TUNE_END + 0.2)).map((t) => t.index);
  const lastState = [...log.tuner].reverse().find((r) => inside(r.time, 0, TUNE_END + 0.2));
  check('tuning: onTuned fired for the in-tune strings only, in order', tunedOrder.join() === wantTuned.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0).join(), `fired for ${tunedOrder.join(',')}`);
  check('tuning: the per-string ticks at the end are right', !!lastState && lastState.tuned.join() === wantTuned.join(), lastState ? lastState.tuned.join(',') : 'no state');

  // --- 2. scale run -----------------------------------------------------------------------------
  const scaleOns = log.noteOns.filter((n) => inside(n.time, SCALE_AT - 0.15, SCALE_AT + SCALE.length * SCALE_STEP + 0.2));
  check('scale: eight note-ons in the right order', scaleOns.map((n) => n.midi).join() === SCALE.map((n) => n.midi).join(), scaleOns.map((n) => n.midi).join(','));
  if (scaleOns.length === SCALE.length) {
    const timing = scaleOns.map((n, i) => (ft(n.time) - (SCALE_AT + i * SCALE_STEP)) * 1000);
    const latency = scaleOns.map((n) => (n.detectedAt - n.time) * 1000);
    check('scale: note-on times within 30 ms of the plucks', timing.every((e) => Math.abs(e) <= 30), `errors ms ${timing.map((e) => e.toFixed(0)).join(' ')}`);
    check('scale: every note reported within 100 ms', Math.max(...latency) <= 100, `latency ms ${latency.map((e) => e.toFixed(0)).join(' ')}`);
    const scaleCents = SCALE.map((n, i) => {
      const r = log.pitches.filter((p) => p.midi === n.midi && inside(p.time, SCALE_AT + i * SCALE_STEP + 0.1, SCALE_AT + (i + 1) * SCALE_STEP - 0.02));
      return r.length ? median(r.map((p) => p.cents)) : NaN;
    });
    check('scale: every note within 3 cents', scaleCents.every((c) => Math.abs(c) <= 3), `medians ${scaleCents.map((c) => c.toFixed(1)).join(' ')}`);
  }
  const scaleOnsets = log.onsets.filter((t) => inside(t, SCALE_AT - 0.05, SCALE_AT + SCALE.length * SCALE_STEP));
  check('scale: one onset per pluck', scaleOnsets.length === SCALE.length, `${scaleOnsets.length} onsets`);

  // --- 3. chords --------------------------------------------------------------------------------
  CHORDS.forEach((chord, i) => {
    const r = log.chords[i];
    check(`chord ${chord.name}: waitForChord resolves on the strum, first try`, !!r && r.ok && r.failedAttempts === 0 && Math.abs(ft(r.time) - chord.at) < 0.08, r ? `ok ${r.ok} ${r.reason} at ${ft(r.time).toFixed(3)} s (strum at ${chord.at}), score ${r.score === null ? '-' : r.score.toFixed(2)}, ${r.failedAttempts} failed attempts` : 'no result');
    out.rankInput = out.rankInput || [];
    out.rankInput.push({ name: chord.name, frames: log.chroma.filter((c) => inside(c.time, chord.at + 0.25, chord.at + 1.2)).map((c) => c.chroma) });
  });

  // --- the rest ----------------------------------------------------------------------------------
  const seconds = TOTAL + 0.8;
  // Only the session itself counts: once a %noloop file has ended, Chromium keeps repeating its
  // last 10 ms buffer, a 100 Hz buzz at the level of the room noise, and about a second later the
  // tracker flags exactly that as hum (and, rightly, never as a note).
  const hums = log.hum.filter((h) => ft(h.time) < TOTAL);
  const humAt = hums.map((h) => `${ft(h.time).toFixed(2)} s (${h.db.toFixed(0)} dBFS, gate ${h.gateDb.toFixed(0)})`);
  const afterEnd = log.hum.length - hums.length;
  check(
    'level meter: about 30 events a second, no clipping, no hum flag during the session',
    log.levels / seconds > 24 && log.levels / seconds < 36 && log.clipping === 0 && hums.length === 0,
    `${(log.levels / seconds).toFixed(1)}/s, clipping ${log.clipping}, hum flagged ${hums.length ? `at ${humAt.slice(0, 4).join(', ')}` : 'never'}${afterEnd ? ` (after the file ended: ${afterEnd} events, the fake microphone's repeated last buffer)` : ''}`,
  );
  const lateNotes = log.noteOns.filter((n) => ft(n.time) >= TOTAL);
  check('nothing is named a note after the file has ended', lateNotes.length === 0, lateNotes.map((n) => `m${n.midi}@${ft(n.time).toFixed(2)}`).join(' '));
  if (hums.length) {
    const t0 = ft(hums[0].time);
    console.log(`         around it: ${[...log.noteOns.map((n) => ({ t: n.time, s: `on m${n.midi}` })), ...log.noteOffs.map((n) => ({ t: n.time, s: `off m${n.midi}` })), ...log.onsets.map((t) => ({ t, s: 'onset' }))].filter((e) => ft(e.t) > t0 - 3 && ft(e.t) < t0 + 1).sort((a, b) => a.t - b.t).map((e) => `${e.s}@${ft(e.t).toFixed(2)}`).join(' ')}`);
  }
  check('silence is reported after the last chord', log.silences.some((t) => ft(t) > CHORDS[1].at + 2), `silence events at ${log.silences.map((t) => ft(t).toFixed(1)).join(' ')}`);
}

function checkHygiene(h, check) {
  const c = h.cycles;
  check('20 start/stop cycles: all start, events flow, none after stop()', c.failures.length === 0 && c.events > 20 * 3 && c.late === 0, `${c.events} level events while running, ${c.late} after stop() ${c.failures.join('; ')}`);
  check('20 cycles: 20 contexts, 20 streams, 20 workers, 20 worklet nodes made', c.contexts === 20 && c.streams === 20 && c.workers === 20 && c.worklets === 20, `${c.contexts}/${c.streams}/${c.workers}/${c.worklets}`);
  check('20 cycles: nothing left open', c.openContexts === 0 && c.liveTracks === 0 && c.liveWorkers === 0, `${c.openContexts} contexts, ${c.liveTracks} tracks, ${c.liveWorkers} workers`);
  check('stop() during start(), ten times: nothing left open', h.race.oks === 0 && h.race.openContexts === 0 && h.race.liveTracks === 0 && h.race.liveWorkers === 0 && h.race.status === 'stopped', JSON.stringify(h.race));
  const d = h.double;
  check('start() twice at once: the first gives way, one pipeline runs', !d.first.ok && d.second.ok && d.during.openContexts === 1 && d.during.liveTracks === 1 && d.during.liveWorkers === 1, `first ${JSON.stringify(d.first)}, during ${JSON.stringify(d.during)}`);
  check('...and stop() releases it', d.after.openContexts === 0 && d.after.liveTracks === 0 && d.after.liveWorkers === 0, JSON.stringify(d.after));
  const l = h.lost;
  check('device lost mid-note: status stopped with fault device-lost', l.statuses[l.statuses.length - 1] === 'stopped:device-lost' && l.status === 'stopped', l.statuses.join(' > '));
  check('device lost: the sounding note is closed, no events afterwards, everything released', l.noteOns >= 1 && l.noteOffAtLoss === 1 && l.lateEvents === 0 && l.context && l.openContexts === 0 && l.liveTracks === 0 && l.liveWorkers === 0, JSON.stringify(l));
  const v = h.devices;
  if (v.switched) {
    check('setDevice(): switches microphone, one pipeline, events continue', v.switched.ok && v.deviceId && v.duringSwitch.openContexts === 1 && v.duringSwitch.liveTracks === 1 && v.eventsAfter > 5, `${v.count} inputs (${v.labels.join(' | ')}), ${JSON.stringify(v.duringSwitch)}, ${v.eventsAfter} events after`);
  } else {
    check('setDevice(): a second microphone to switch to', false, `only ${v.count} inputs: ${v.labels.join(' | ')}`);
  }
  check('setDevice() with an unknown id: fails as no-device, tracker stopped, nothing open', !v.bogus.ok && v.bogus.reason === 'no-device' && v.statusAfterBogus === 'stopped' && v.afterBogus.openContexts === 0 && v.afterBogus.liveTracks === 0, `${JSON.stringify(v.bogus)}, ${JSON.stringify(v.afterBogus)}`);
  const s = h.shared;
  check('supplied stream + shared AudioContext: used, on the shared clock, and left running on stop()', s.start.ok && s.events > 8 && s.clockError < 0.25 && s.contextState === 'running' && s.trackState === 'live', JSON.stringify(s));
  const z = h.suspend;
  check('context suspended by the system: stays quiet while hidden, wakes when the page is visible again', z.stateHidden === 'suspended' && z.whileSuspended <= 2 && z.stateAfter === 'running' && z.afterWake > 5 && z.status === 'running', JSON.stringify(z));
  const f = h.final;
  check('at the end: every context closed, every track ended, every worker terminated', f.openContexts === 0 && f.liveTracks === 0 && f.workers === f.terminated, `${f.contexts} contexts, ${f.streams} streams, ${f.workers} workers (${f.terminated} terminated), ${f.worklets} worklet nodes`);
}

async function runFormats(dir, check) {
  const audio = await loadTs('/src/core/audio/index.ts');
  const make = (name, sr, bits, stereo) => {
    const x = audio.renderSequence([
      { time: 0.5, midi: 45, string: 5, cents: 5, duration: 0.9 },
      { time: 1.8, midi: 64, string: 1, cents: -7, duration: 0.9 },
    ], { sampleRate: sr, seconds: 3.5 });
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.from(audio.encodeWav(x, sr, { bitDepth: bits, channels: stereo ? [x, x] : undefined })));
    return file;
  };
  const formats = [
    ['48 kHz 16-bit mono', make('f1.wav', 48000, 16, false), true],
    ['48 kHz 16-bit stereo', make('f2.wav', 48000, 16, true), true],
    ['44.1 kHz 16-bit mono', make('f3.wav', 44100, 16, false), true],
    ['22.05 kHz 16-bit mono', make('f4.wav', 22050, 16, false), true],
    ['48 kHz 32-bit float mono', make('f5.wav', 48000, 32, false), true],
    ['48 kHz 24-bit mono', make('f6.wav', 48000, 24, false), false],
  ];
  for (const [name, file, works] of formats) {
    await withApp({ fakeAudio: `${file}%noloop` }, async ({ page, url }) => {
      await page.goto(url, { waitUntil: 'load' });
      const r = await page.evaluate(async () => {
        const pitch = await import('/src/core/pitch/index.ts');
        const tracker = new pitch.PitchTracker();
        const ons = [];
        const cents = {};
        tracker.on('noteon', (e) => ons.push(e.midi));
        tracker.on('pitch', (p) => { if (p.noteAge > 0.2) (cents[p.midi] = cents[p.midi] || []).push(p.cents); });
        const res = await tracker.start();
        await new Promise((ok) => setTimeout(ok, 4000));
        const sampleRate = tracker.info ? tracker.info.sampleRate : 0;
        tracker.stop();
        const med = (v) => (v && v.length ? v.sort((a, b) => a - b)[v.length >> 1] : NaN);
        return { ok: res.ok, ons, a: med(cents[45]), e: med(cents[64]), sampleRate };
      });
      const heard = r.ok && r.ons.join() === '45,64' && Math.abs(r.a - 5) < 1 && Math.abs(r.e + 7) < 1;
      check(`fake microphone format ${name}: ${works ? 'works, pitch intact' : 'plays as silence (known Chromium limit)'}`, heard === works, `context at ${r.sampleRate} Hz, note-ons ${r.ons.join(',') || 'none'}, A2 ${Number(r.a).toFixed(2)} (want 5), E4 ${Number(r.e).toFixed(2)} (want -7)`);
    });
  }
}

(async () => {
  const args = process.argv.slice(2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-live-'));
  const wav = path.join(dir, 'session.wav');
  const checks = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass });
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `\n         ${detail}` : ''}`);
  };

  const level = await makeSession(wav);
  console.log(`fake microphone: ${wav} (${TOTAL} s, 48 kHz 16-bit mono, peak ${level.peak.toFixed(2)}, rms ${level.rms.toFixed(3)})`);

  console.log('\nThe session');
  await withApp({ fakeAudio: `${wav}%noloop` }, async ({ page, url, errors }) => {
    await page.goto(url, { waitUntil: 'load' });
    const out = await page.evaluate(listenToSession, { total: TOTAL, chords: CHORDS, rivals: RIVALS });
    checkSession(out, check);
    if (out.rankInput) {
      // Name each chord among ten candidates from the chroma averaged over the second after the strum.
      const ranks = await page.evaluate(async ({ inputs, rivals }) => {
        const pitch = await import('/src/core/pitch/index.ts');
        return inputs.map((i) => {
          const ranked = pitch.rankChords(pitch.averageChroma(i.frames), rivals);
          return { name: i.name, frames: i.frames.length, top: ranked.slice(0, 3).map((r) => `${r.chord.name} ${r.score.toFixed(2)}`) };
        });
      }, { inputs: out.rankInput, rivals: RIVALS });
      for (const r of ranks) check(`chord ${r.name}: ranked first of ${RIVALS.length} candidates`, r.top.length > 0 && r.top[0].startsWith(`${r.name} `), `${r.frames} chroma frames; ${r.top.join(', ')}`);
    }
    const mine = errors.filter((e) => /pitch|worklet|AudioContext/i.test(e));
    check('no page errors from the pitch module', mine.length === 0, mine.join(' | '));
  });

  console.log('\nResource hygiene');
  await withApp({ fakeAudio: wav }, async ({ page, context, url, errors }) => {
    await page.goto(url, { waitUntil: 'load' });
    checkHygiene(await page.evaluate(hygiene), check);

    // A page that really is in the background: another tab in front for two seconds.
    for (const capture of ['', 'analyser']) {
      await page.evaluate(countEvents, { capture, ms: 600 });
      const other = await context.newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      const hidden = await page.evaluate(async () => {
        const state = document.visibilityState;
        const before = window.__bgCount;
        await new Promise((ok) => setTimeout(ok, 2000));
        const context = window.__bgTracker.audioContext ? window.__bgTracker.audioContext.state : 'none';
        return { state, events: window.__bgCount - before, context, status: window.__bgTracker.status };
      });
      await other.close();
      await page.bringToFront();
      const back = await page.evaluate(async () => {
        const before = window.__bgCount;
        await new Promise((ok) => setTimeout(ok, 700));
        const events = window.__bgCount - before;
        window.__bgTracker.stop();
        return { events, state: document.visibilityState };
      });
      const label = capture ? 'AnalyserNode fallback' : 'AudioWorklet capture';
      // Headless Chromium keeps reporting the page as visible (the script prints what it saw), so
      // here this only shows that a second tab does not disturb the tracker. In a real browser a
      // capturing page keeps its audio thread and worker; what a hidden tab throttles are
      // main-thread timers, which only the analyser fallback depends on.
      check(
        `another tab in front for 2 s (${label}): tracker keeps running and is alive when the page is back`,
        hidden.status === 'running' && hidden.context === 'running' && back.events > 10 && (capture ? true : hidden.events > 40),
        `page reported "${hidden.state}", ${hidden.events} level events in 2 s behind the other tab, ${back.events} in 0.7 s after coming back`,
      );
    }
    const mine = errors.filter((e) => /pitch|worklet|AudioContext/i.test(e));
    check('no page errors from the pitch module', mine.length === 0, mine.join(' | '));
  });

  if (args.includes('--formats')) {
    console.log('\nFake microphone formats');
    await runFormats(dir, check);
  }

  if (args.includes('--keep')) console.log(`\nkept ${wav}`);
  else fs.rmSync(dir, { recursive: true, force: true });
  const failed = checks.filter((c) => !c.pass);
  console.log(failed.length ? `\nFAILED ${failed.length} of ${checks.length} checks` : `\nPASSED all ${checks.length} checks`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
