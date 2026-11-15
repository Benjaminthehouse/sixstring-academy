#!/usr/bin/env node
/**
 * Robustness test of the audio engine in a real browser. Run: node e2e/audio-stress.cjs [--quick] [--soak]
 *
 * Tries to break the engine the way a real session does, and counts what is left behind:
 *
 *  - hundreds of note-ons in a burst (tremolo on one string, a sixteenth-note run at 200 BPM, strums
 *    faster than anyone can strum), with garbage mixed in (NaN times, unknown tones, negative lengths)
 *  - the transport started and stopped as fast as timers allow; tempo swept while it runs
 *  - unlockAudio() called over and over; the context suspended and resumed behind the engine's back
 *  - engines at 44.1 kHz and at 48 kHz side by side
 *  - the note cache filled far beyond its budget
 *  - a backing band with every player for minutes, then a count of the audio nodes still alive
 *    (through the DevTools protocol, after a forced garbage collection)
 *
 * --quick shortens everything; --soak plays the backing band for a full five minutes in real time.
 * Exits non-zero if any check fails.
 */
const { withApp } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

const quick = process.argv.includes('--quick');
const soak = process.argv.includes('--soak');

/** Count live Web Audio nodes through the DevTools protocol. */
async function nodeCounter(context, page) {
  const cdp = await context.newCDPSession(page);
  const nodes = new Map(); // nodeId -> type
  let contexts = 0;
  cdp.on('WebAudio.audioNodeCreated', (e) => nodes.set(e.node.nodeId, e.node.nodeType));
  cdp.on('WebAudio.audioNodeWillBeDestroyed', (e) => nodes.delete(e.nodeId));
  cdp.on('WebAudio.contextCreated', () => { contexts++; });
  cdp.on('WebAudio.contextWillBeDestroyed', () => { contexts--; });
  await cdp.send('WebAudio.enable');
  await cdp.send('HeapProfiler.enable');
  return {
    /** Live nodes after a forced garbage collection, by type. */
    async count() {
      for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        await page.waitForTimeout(250);
      }
      const byType = {};
      for (const t of nodes.values()) byType[t] = (byType[t] || 0) + 1;
      return { total: nodes.size, byType, contexts };
    },
  };
}

function partOne({ quick }) {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const T = window.__audioTools;
    const { sleep, stats } = T;
    const report = { checks: [], info: {} };
    const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    const fmt = (n, d = 3) => Number(n).toFixed(d);
    const CEILING = 0.985;
    const thrown = [];
    const guard = (label, fn) => { try { return fn(); } catch (e) { thrown.push(`${label}: ${e && e.message ? e.message : e}`); return undefined; } };

    // Count the AudioContexts the engine makes.
    let contextsMade = 0;
    const RealContext = window.AudioContext;
    window.AudioContext = class extends RealContext { constructor(...a) { super(...a); contextsMade++; } };

    // ---------------------------------------------------------------------------------------
    // unlockAudio: once inside the gesture, then over and over
    // ---------------------------------------------------------------------------------------
    const unlocked = await new Promise((resolve) => {
      document.addEventListener('pointerdown', () => resolve(Promise.all([audio.unlockAudio(), audio.unlockAudio(), audio.unlockAudio()])), { once: true });
      window.__readyForClick = true;
    });
    const ctx = audio.getAudioContext();
    const engine = audio.getEngine();
    const fs = ctx.sampleRate;
    const again = await Promise.all(Array.from({ length: 40 }, () => audio.unlockAudio()));
    for (let i = 0; i < 20; i++) { await audio.unlockAudio(); }
    check('unlockAudio() called 63 times: always true, one context, still running', unlocked.every((u) => u === true) && again.every((u) => u === true) && contextsMade === 1 && ctx.state === 'running' && audio.audioState() === 'running', `contexts made ${contextsMade}, state ${ctx.state}`);

    const recorder = await T.recorder(ctx, engine.output);
    const guitar = audio.getGuitar();

    // ---------------------------------------------------------------------------------------
    // Hundreds of rapid note-ons
    // ---------------------------------------------------------------------------------------
    {
      // Tremolo: 400 strokes on one string, 16 a second.
      const stop = recorder.capture();
      const t0 = audio.audioNow() + 0.1;
      let most = 0;
      guard('tremolo', () => {
        for (let i = 0; i < 400; i++) {
          audio.pluck(64, t0 + i * 0.0625 * (quick ? 0.25 : 1), { string: 1, velocity: 0.55 + 0.4 * ((i * 7) % 5) / 4, direction: i % 2 ? 'up' : 'down' });
          most = Math.max(most, guitar.activeVoices);
        }
      });
      const scheduledVoices = guitar.activeVoices;
      const seconds = 400 * 0.0625 * (quick ? 0.25 : 1);
      // While it plays: only the newest note on the string may be sounding.
      await sleep(Math.min(3000, seconds * 500));
      const ringing = guitar.activeVoices;
      await sleep(seconds * 1000 - Math.min(3000, seconds * 500) + 400);
      const cap = stop();
      const s = stats(cap.samples);
      await sleep(5200);
      check('tremolo, 400 strokes on one string: no error, nothing clips', thrown.length === 0 && s.peak <= CEILING && s.bad === 0 && s.rms > 0.01, `peak ${fmt(s.peak)}, rms ${fmt(s.rms, 4)}`);
      check('tremolo: every stroke is cleaned up when it has sounded', guitar.activeVoices === 0, `${scheduledVoices} voices scheduled at once, ${ringing} mid-way, ${guitar.activeVoices} left after the last has rung out`);
      report.info.tremolo = `${scheduledVoices} scheduled, ${ringing} alive mid-way`;
    }
    {
      // A sixteenth-note run at 200 BPM up and down three octaves, played "live" (no schedule-ahead).
      const stop = recorder.capture();
      const scale = [0, 2, 4, 5, 7, 9, 11];
      const notes = [];
      for (let o = 0; o < 3; o++) for (const d of scale) notes.push(40 + o * 12 + d);
      const run = [...notes, ...notes.slice().reverse()];
      const total = quick ? 80 : 240;
      let peakVoices = 0;
      await new Promise((resolve) => {
        let i = 0;
        const t0 = performance.now();
        const tick = () => {
          // Catch up if the timer was late: a real player does not wait for the browser.
          while (i < total && performance.now() - t0 >= i * 75) {
            guard('run', () => audio.pluck(run[i % run.length], undefined, { velocity: 0.8 }));
            i++;
          }
          peakVoices = Math.max(peakVoices, guitar.activeVoices);
          if (i < total) setTimeout(tick, 5); else resolve();
        };
        tick();
      });
      await sleep(300);
      const cap = stop();
      const s = stats(cap.samples);
      check('sixteenth-note run at 200 BPM over three octaves: no error, nothing clips', thrown.length === 0 && s.peak <= CEILING && s.bad === 0, `peak ${fmt(s.peak)}, rms ${fmt(s.rms, 4)}, most voices at once ${peakVoices}`);
      check('the run never holds more voices than the synth allows', peakVoices <= 29, `${peakVoices} voices`);
      audio.stopAll();
      await sleep(400);
      check('stopAll() after the run leaves no voice', guitar.activeVoices === 0, `${guitar.activeVoices} voices`);
    }
    {
      // Strumming far faster than a hand can: 150 six-string strums 30 ms apart, all tones.
      const stop = recorder.capture();
      const tones = ['steel', 'nylon', 'clean', 'driven', 'muted'];
      const chords = [[40, 47, 52, 56, 59, 64], [45, 52, 57, 60, 64], [43, 47, 50, 55, 59, 67], [41, 48, 53, 57, 60, 65]];
      const n = quick ? 50 : 150;
      const t0 = audio.audioNow() + 0.1;
      guard('strums', () => {
        for (let i = 0; i < n; i++) audio.strum(chords[i % 4], t0 + i * 0.03, { tone: tones[(i >> 3) % tones.length], direction: i % 2 ? 'up' : 'down', velocity: 1 });
      });
      const scheduled = guitar.activeVoices;
      await sleep(n * 30 + 600);
      const mid = guitar.activeVoices;
      const cap = stop();
      const s = stats(cap.samples);
      audio.stopAll();
      await sleep(400);
      check('150 strums 30 ms apart in five tones: no error, limited, never clipped', thrown.length === 0 && s.peak <= CEILING && s.bad === 0, `peak ${fmt(s.peak)}, rms ${fmt(s.rms, 4)}; ${scheduled} voices scheduled, ${mid} alive at the end`);
      check('six strings ring, the rest have been replaced', mid <= 6 && guitar.activeVoices === 0, `${mid} voices after the last strum, ${guitar.activeVoices} after stopAll`);
    }

    // ---------------------------------------------------------------------------------------
    // Garbage in: nothing may throw, nothing may reach the speakers as noise
    // ---------------------------------------------------------------------------------------
    {
      const stop = recorder.capture();
      const before = thrown.length;
      const bad = [NaN, Infinity, -Infinity, -1, 1e9, undefined, null, 'x', {}];
      for (const v of bad) {
        guard(`pluck midi ${v}`, () => audio.pluck(v));
        guard(`pluck when ${v}`, () => audio.pluck(60, v, { velocity: 0.2, duration: 0.05 }));
        guard(`pluck velocity ${v}`, () => audio.pluck(60, undefined, { velocity: v, duration: 0.05, gain: 0.2 }));
        guard(`pluck duration ${v}`, () => audio.pluck(60, undefined, { duration: v, velocity: 0.2 }).stop());
        guard(`pluck cents ${v}`, () => audio.pluck(60, undefined, { cents: v, a4: v, brightness: v, gain: v, string: v, velocity: 0.1, duration: 0.05 }));
        guard(`pluck tone ${v}`, () => audio.pluck(60, undefined, { tone: v, articulation: v, velocity: 0.1, duration: 0.05 }));
        guard(`strum ${v}`, () => audio.strum([v, 52, v], v, { spread: v, velocity: v, duration: 0.05, gain: 0.2 }));
        guard(`bass ${v}`, () => audio.playBass(v, v, { velocity: v }));
        guard(`tone ${v}`, () => audio.playTone(v, v, { duration: 0.05 }).stop(v));
        guard(`tone freq ${v}`, () => audio.playTone({ freq: v }, undefined, { duration: 0.05 }).stop());
        guard(`tone options ${v}`, () => audio.playTone(60, undefined, { voice: v, velocity: v, cents: v, a4: v, gain: typeof v === 'number' && v > 1 ? 1 : v, bus: v, duration: v }).stop());
        guard(`chord ${v}`, () => audio.playChord([60, v, 67], v, { roll: v, duration: 0.05, gain: 0.2 }));
        guard(`drum ${v}`, () => audio.playDrum(v, v, v));
        guard(`click ${v}`, () => audio.playClick(v, v, v, v)());
        guard(`ui ${v}`, () => audio.playUi(v, { volume: v, step: v, when: v }));
        guard(`stopAll ${v}`, () => audio.stopAll(v, v));
        guard(`bus ${v}`, () => { audio.setBusVolume(v, v); audio.setBusMuted(v, false); audio.setBusVolume('guitar', v); });
        guard(`master ${v}`, () => audio.setMasterVolume(v));
        guard(`visual ${v}`, () => audio.scheduleVisual(v, () => undefined));
        guard(`stopString ${v}`, () => guitar.stopString(v, v, v));
      }
      guard('drone', () => { const d = audio.startDrone({ root: NaN, a4: NaN, volume: NaN, fadeIn: NaN }); d.setRoot(NaN); d.setVolume(NaN); d.stop(NaN); });
      guard('alias tone', () => audio.pluck(60, undefined, { tone: 'acoustic', velocity: 0.2, duration: 0.05 }));
      guard('alias click', () => audio.playClick('wood', 'beat', undefined, 0.2));
      const m = new audio.Metronome();
      guard('metronome', () => { m.setTempo(NaN); m.volume = NaN; m.setAccent(NaN, 9); m.setAccents([]); m.countInBars = NaN; m.sound = 'nonsense'; m.start(); m.setTempo(Infinity); m.transport.setTempoScale(NaN); m.transport.setSwing(NaN); m.transport.seek(NaN); m.transport.setLoop(NaN, NaN); m.transport.setEnd(NaN); });
      await sleep(600);
      const metroOk = m.running && Number.isFinite(m.tempo) && Number.isFinite(m.transport.bpm) && Number.isFinite(m.transport.position().absTick);
      guard('metronome stop', () => { m.stop(); m.dispose(); });
      const band = new audio.BackingBand();
      guard('band', () => { band.setTempo(NaN); band.setVolume('drums', NaN); band.setVolume('nobody', 1); band.setMuted('nobody', true); band.start(); band.load([], { style: 'pop-rock', tempo: NaN, countInBars: NaN }); band.start(); band.stop(); band.dispose(); });
      audio.setMasterVolume(0.85);
      audio.setBusVolume('guitar', 1);
      await sleep(500);
      audio.stopAll();
      await sleep(300);
      const cap = stop();
      const s = stats(cap.samples);
      check('garbage arguments (NaN, Infinity, null, strings, objects) never throw', thrown.length === before, thrown.slice(before, before + 4).join(' | '));
      check('garbage arguments never produce bad samples or a blast', s.bad === 0 && s.peak <= CEILING, `peak ${fmt(s.peak)}`);
      check('a metronome fed NaN keeps a finite tempo and keeps running', metroOk, `tempo ${m.tempo}`);
    }

    // ---------------------------------------------------------------------------------------
    // Transport: start and stop as fast as possible, tempo swept while running
    // ---------------------------------------------------------------------------------------
    {
      const fire = T.impulsePlayer(engine);
      const log = [];
      const m = new audio.Metronome({
        tempo: 240,
        output: { click: (set, level, time) => { const e = { time, cancelled: false }; log.push(e); const c = fire(time); return () => { if (ctx.currentTime < time - 0.0065) e.cancelled = true; c(); }; } },
      });
      m.subdivision = 'sixteenth';
      const stop = recorder.capture();
      const rand = T.rng(5);
      const before = thrown.length;
      const cycles = quick ? 60 : 200;
      for (let i = 0; i < cycles; i++) {
        guard('start', () => m.start());
        if (rand() < 0.3) guard('start twice', () => m.start());
        await sleep(rand() < 0.5 ? 0 : rand() * 60);
        guard('stop', () => m.stop());
        if (rand() < 0.3) guard('stop twice', () => m.stop());
        if (rand() < 0.2) guard('toggle', () => { m.toggle(); m.toggle(); });
        if (rand() < 0.5) await sleep(rand() * 20);
      }
      const settledAt = ctx.currentTime;
      await sleep(500);
      const quietFrom = settledAt + 0.01;
      // And it still works: a clean run afterwards, on the grid.
      const mark = log.length;
      m.start();
      await sleep(1500);
      const stopAt = ctx.currentTime;
      m.stop();
      await sleep(300);
      const cap = stop();
      const found = T.findImpulses(cap.samples, fs, cap.start);
      const strays = found.filter((t) => t > quietFrom && t < log[mark].time - 0.005).length;
      const wanted = log.filter((c) => !c.cancelled).map((c) => c.time).sort((a, b) => a - b);
      const cmp = T.compare(wanted, found);
      const lastRun = log.slice(mark).filter((c) => !c.cancelled && c.time < stopAt).map((c) => c.time);
      let grid = 0;
      for (let i = 1; i < lastRun.length; i++) grid = Math.max(grid, Math.abs(lastRun[i] - lastRun[i - 1] - 60 / 240 / 4));
      check(`metronome started and stopped ${cycles} times in a row: no error`, thrown.length === before && !m.running, thrown.slice(before, before + 3).join(' | '));
      check('start/stop storm: only clicks that were not taken back are heard, each at its time', cmp.missing === 0 && cmp.extra === 0 && cmp.worst < 0.002, `${cmp.n}/${wanted.length} heard, ${cmp.extra} strays, ${log.length - wanted.length} taken back, worst ${fmt(cmp.worst * 1000, 4)} ms`);
      check('start/stop storm: silence once it is stopped', strays === 0, `${strays} clicks in the silence after the last stop`);
      check('start/stop storm: the next start is clean and on the grid', lastRun.length >= 20 && grid < 1e-9, `${lastRun.length} clicks, worst grid error ${grid.toExponential(2)} s`);
      m.dispose();
    }
    {
      const fire = T.impulsePlayer(engine);
      const log = [];
      const m = new audio.Metronome({ tempo: 120, output: { click: (set, level, time) => { log.push(time); fire(time); } } });
      m.subdivision = 'eighth';
      const stop = recorder.capture();
      const before = thrown.length;
      m.start();
      const seconds = quick ? 2 : 5;
      const t0 = performance.now();
      let changes = 0;
      while (performance.now() - t0 < seconds * 1000) {
        const x = (performance.now() - t0) / (seconds * 1000);
        guard('tempo sweep', () => m.setTempo(20 + 380 * Math.abs(Math.sin(x * 9))));
        changes++;
        await sleep(4);
      }
      m.setTempo(180);
      await sleep(1000);
      const stopAt = ctx.currentTime;
      m.stop();
      await sleep(300);
      const cap = stop();
      const found = T.findImpulses(cap.samples, fs, cap.start);
      const wanted = log.filter((t) => t <= stopAt - 0.007).sort((a, b) => a - b);
      const cmp = T.compare(wanted, found.filter((t) => t <= stopAt - 0.006));
      let order = true, closest = Infinity;
      for (let i = 1; i < log.length; i++) { if (!(log[i] > log[i - 1])) order = false; closest = Math.min(closest, log[i] - log[i - 1]); }
      const tail = log.filter((t) => t > stopAt - 0.7 && t <= stopAt);
      let grid = 0;
      for (let i = 1; i < tail.length; i++) grid = Math.max(grid, Math.abs(tail[i] - tail[i - 1] - 60 / 180 / 2));
      check(`tempo changed ${changes} times while running (20..400 BPM): no error, clicks in order`, thrown.length === before && order && closest > 0.03, `closest clicks ${fmt(closest * 1000, 1)} ms apart`);
      check('tempo sweep: every click heard at its time, and the final tempo is exact', cmp.missing === 0 && cmp.extra === 0 && cmp.worst < 0.002 && grid < 1e-9 && tail.length > 2, `${cmp.n} clicks, worst ${fmt(cmp.worst * 1000, 4)} ms, final grid error ${grid.toExponential(2)} s`);
      m.dispose();
    }

    // ---------------------------------------------------------------------------------------
    // The context suspended and resumed behind the engine's back, while a metronome runs
    // ---------------------------------------------------------------------------------------
    {
      const fire = T.impulsePlayer(engine);
      const log = [];
      const m = new audio.Metronome({ tempo: 150, output: { click: (set, level, time) => { log.push(time); fire(time); } } });
      const stop = recorder.capture();
      m.start();
      await sleep(1200);
      await ctx.suspend();
      const frozenAt = ctx.currentTime;
      const stateWhileSuspended = audio.audioState();
      await sleep(1500);
      const scheduledWhileFrozen = log.filter((t) => t > frozenAt + 0.2).length;
      // A sound asked for while suspended wakes the context by itself.
      const h = audio.pluck(57, undefined, { velocity: 0.6, duration: 0.2 });
      await sleep(700);
      const woke = ctx.state === 'running';
      await sleep(1300);
      const stopAt = ctx.currentTime;
      m.stop();
      await sleep(300);
      const cap = stop();
      const s = stats(cap.samples, Math.max(0, Math.round((frozenAt + 0.05) * fs) - cap.start));
      const after = log.filter((t) => t > frozenAt + 0.25 && t < stopAt - 0.01);
      let grid = 0;
      for (let i = 1; i < after.length; i++) grid = Math.max(grid, Math.abs(after[i] - after[i - 1] - 0.4));
      // No burst: in the half second after waking there is room for two beats, not for a pile-up.
      const burst = log.filter((t) => t > frozenAt && t < frozenAt + 0.5).length;
      check('context suspended under a running metronome: reported as suspended, nothing piles up', stateWhileSuspended === 'suspended' && scheduledWhileFrozen <= 1, `state "${stateWhileSuspended}", ${scheduledWhileFrozen} clicks scheduled while frozen`);
      check('a note requested while suspended wakes the context and is heard', woke && h.queued === true && s.rms > 0.003, `state ${ctx.state}, handle.queued ${h.queued}, rms after waking ${fmt(s.rms, 4)}`);
      check('after waking the metronome carries on, on the grid, without a burst', after.length >= 3 && grid < 1e-9 && burst <= 2, `${after.length} beats after waking, grid error ${grid.toExponential(2)} s, ${burst} clicks in the first half second`);
      m.dispose();
    }

    // ---------------------------------------------------------------------------------------
    // 44.1 kHz and 48 kHz engines side by side
    // ---------------------------------------------------------------------------------------
    for (const rate of [44100, 48000]) {
      let c2;
      try {
        c2 = new RealContext({ sampleRate: rate });
      } catch (e) {
        check(`an engine at ${rate} Hz can be built`, false, String(e));
        continue;
      }
      await c2.resume();
      const e2 = new audio.AudioEngine(c2);
      e2.markUnlocked();
      const rec2 = await T.recorder(c2, e2.output);
      const g2 = new audio.GuitarSynth({ engine: e2 });
      const kit2 = new audio.DrumKit(e2);
      const stop = rec2.capture();
      const t0 = e2.now() + 0.15;
      g2.pluck(57, t0, { velocity: 0.9 });
      await sleep(1200);
      const capNote = stop();
      g2.stopAll();
      await sleep(350);
      const stop2 = rec2.capture();
      const t1 = e2.now() + 0.15;
      kit2.play('sidestick', t1, 1);
      audio.playClick('woodblock', 'accent', t1 + 0.3, 1, e2);
      audio.playTone(64, t1 + 0.6, { voice: 'epiano', duration: 0.1 }, e2);
      audio.playTone(69, t1 + 1.1, { voice: 'reference', duration: 0.4 }, e2);
      await sleep(2000);
      const capHits = stop2();
      const onset = audio.findOnsets(capNote.samples, rate, 0.01)[0];
      const noteAt = (capNote.start + onset) / rate;
      const est = audio.estimatePitch(capNote.samples, rate, { start: onset + Math.round(0.15 * rate), length: 16384, minHz: 150 });
      const cents = est ? audio.centsFromMidi(est.hz, 57) : NaN;
      const hits = audio.findOnsets(capHits.samples, rate, 0.01, 0.1).map((i) => (capHits.start + i) / rate);
      const hitErr = Math.max(Math.abs(hits[0] - t1), Math.abs(hits[1] - (t1 + 0.3)), Math.abs(hits[2] - (t1 + 0.6)));
      const a = audio.measureFundamental(capHits.samples, rate, 440, { start: Math.round((t1 + 1.18) * rate) - capHits.start });
      check(`engine at ${rate} Hz: A3 on the guitar is in tune and on time`, c2.sampleRate === rate && Math.abs(cents) < 2 && Math.abs(noteAt - t0) < 0.002, `context rate ${c2.sampleRate}, ${fmt(cents)} cents, onset ${fmt((noteAt - t0) * 1000, 3)} ms from its time`);
      check(`engine at ${rate} Hz: drum, click and tone start on time; A4 is 440 Hz`, hits.length >= 3 && hitErr < 0.002 && Math.abs(audio.centsFromMidi(a, 69)) < 0.5, `${hits.length} onsets, worst ${fmt(hitErr * 1000, 3)} ms, reference ${fmt(audio.centsFromMidi(a, 69), 4)} cents`);
      rec2.dispose();
      g2.dispose();
      kit2.dispose();
      e2.dispose();
      await c2.close();
    }

    // ---------------------------------------------------------------------------------------
    // The note cache stays inside its budget
    // ---------------------------------------------------------------------------------------
    {
      const limit = engine.buffers.stats.limit;
      let most = 0, count = 0;
      const t0 = performance.now();
      const tones = ['steel', 'clean', 'nylon'];
      const total = quick ? 150 : 360;
      for (let i = 0; i < total; i++) {
        // Different pitch, string, dynamic and tone every time: every one a new buffer.
        guitar.pluck(40 + (i % 40), audio.audioNow() + 0.05, { string: 1 + (i % 6), velocity: [0.3, 0.55, 0.8, 1][i % 4], tone: tones[i % 3], gain: 0.02, duration: 0.03 });
        most = Math.max(most, engine.buffers.stats.bytes);
        count = Math.max(count, engine.buffers.stats.count);
        if (i % 12 === 11) await sleep(0);
      }
      const took = performance.now() - t0;
      const st = engine.buffers.stats;
      report.info.cache = `${total} different notes rendered in ${fmt(took / 1000, 1)} s (${fmt(took / total, 1)} ms each): most held ${fmt(most / 1e6, 1)} MB in ${count} buffers, budget ${fmt(limit / 1e6, 0)} MB`;
      check('note cache: far more notes than fit are played, memory stays inside the budget', most <= limit && st.bytes <= limit && count < total, `peak ${fmt(most / 1e6, 1)} MB of ${fmt(limit / 1e6, 0)} MB, ${st.count} buffers kept of ${total} rendered`);
      // A note that was evicted long ago still plays.
      audio.stopAll();
      await sleep(300);
      const stop = recorder.capture();
      guitar.pluck(40, audio.audioNow() + 0.05, { string: 1, velocity: 0.3, tone: 'steel' });
      await sleep(500);
      const s = stats(stop().samples);
      check('note cache: an evicted note is rendered again when it is needed', s.rms > 0.002, `rms ${fmt(s.rms, 4)}`);
      audio.stopAll();
    }

    report.thrown = thrown;
    return report;
  })();
}

/** A backing band with every player: warm up, then play and count what is left. */
function bandRun({ seconds, tempoFactor }) {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const T = window.__audioTools;
    const chord = (root, iv, symbol) => audio.chordFromIntervals(root, iv, symbol);
    const bars = [chord(0, [4, 7, 11], 'Cmaj7'), chord(9, [3, 7, 10], 'Am7'), chord(2, [3, 7, 10], 'Dm7'), chord(7, [4, 7, 10], 'G7')];
    const styles = audio.BACKING_STYLE_IDS;
    const perStyle = seconds / styles.length;
    const ctx = audio.getAudioContext();
    const recorder = window.__stressRecorder || (window.__stressRecorder = await T.recorder(ctx, audio.getEngine().output));
    const stop = recorder.capture();
    let chords = 0, peakVoices = 0;
    const band = new audio.BackingBand();
    band.setMuted('guitar', false);
    const off = band.onChord(() => { chords++; });
    for (const id of styles) {
      const style = audio.BACKING_STYLES[id];
      band.load(bars, { style: id, tempo: Math.min(style.tempo.max, style.tempo.default * tempoFactor), loop: true, countInBars: 0 });
      await band.prepare();
      band.start();
      const t0 = performance.now();
      while (performance.now() - t0 < perStyle * 1000) {
        await T.sleep(250);
        // The learner plays along on top of it.
        audio.strum([48, 52, 55, 60, 64], undefined, { velocity: 0.7 });
        peakVoices = Math.max(peakVoices, audio.getGuitar().activeVoices);
      }
      band.stop();
      await T.sleep(60);
    }
    off();
    band.dispose();
    audio.stopAll();
    await T.sleep(1500);
    const cap = stop();
    const s = T.stats(cap.samples);
    return { chords, peak: s.peak, rms: s.rms, bad: s.bad, peakVoices, cache: audio.getEngine().buffers.stats, guitarVoices: audio.getGuitar().activeVoices, bassVoices: audio.getBass().activeVoices, drumHits: audio.getDrums().activeHits, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 };
  })();
}

withApp({}, async ({ page, context, goto, errors }) => {
  await installPageTools(page);
  await goto('home');
  const counter = await nodeCounter(context, page);
  const run = page.evaluate(partOne, { quick });
  await page.waitForFunction(() => window.__readyForClick === true, null, { timeout: 60000 });
  await page.mouse.click(8, 8); // the user gesture that unlocks audio
  const report = await run;
  const checks = report.checks;
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

  // --- node cleanup: a warm-up builds whatever is permanent, then the long run must add nothing ---
  await page.evaluate(bandRun, { seconds: 14, tempoFactor: 1.5 });
  const base = await counter.count();
  const seconds = soak ? 300 : quick ? 28 : 90;
  const t0 = Date.now();
  const r = await page.evaluate(bandRun, { seconds, tempoFactor: soak ? 1 : 1.5 });
  const after = await counter.count();
  const grew = after.total - base.total;
  const diff = {};
  for (const t of new Set([...Object.keys(base.byType), ...Object.keys(after.byType)])) {
    const d = (after.byType[t] || 0) - (base.byType[t] || 0);
    if (d) diff[t] = d;
  }
  report.info['backing band run'] = `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.chords} chord changes, peak ${r.peak.toFixed(3)}, rms ${r.rms.toFixed(4)}, most guitar voices ${r.peakVoices}, cache ${(r.cache.bytes / 1e6).toFixed(1)} MB in ${r.cache.count} buffers`;
  report.info['audio nodes alive'] = `before ${base.total}, after ${after.total} (${JSON.stringify(after.byType)})`;
  check(`${seconds} s of backing band, every player, 14 styles: nothing clips, no bad samples`, r.peak <= 0.985 && r.bad === 0 && r.rms > 0.03 && r.chords > seconds / 4, `peak ${r.peak.toFixed(3)}, rms ${r.rms.toFixed(4)}, ${r.chords} chord changes`);
  check('after the band stops, no voice is left sounding or scheduled', r.guitarVoices === 0 && r.bassVoices === 0 && r.drumHits === 0, `guitar ${r.guitarVoices}, bass ${r.bassVoices}, drums ${r.drumHits}`);
  check('no audio node leak: as many nodes alive after the run as before it', grew <= 12, `${base.total} -> ${after.total} (${grew >= 0 ? '+' : ''}${grew})${Object.keys(diff).length ? ' ' + JSON.stringify(diff) : ''}`);
  check('the band made no AudioContext of its own', after.contexts <= base.contexts, `${base.contexts} contexts alive before, ${after.contexts} after`);
  check('note cache still inside its budget after the band', r.cache.bytes <= r.cache.limit, `${(r.cache.bytes / 1e6).toFixed(1)} MB of ${(r.cache.limit / 1e6).toFixed(0)} MB`);

  const failed = printChecks(checks);
  console.log('\ninfo:', JSON.stringify(report.info, null, 1));
  if (report.thrown.length) console.log(`errors thrown by the engine:\n  ${report.thrown.join('\n  ')}`);
  const audioErrors = errors.filter((e) => /audio|AudioContext|worklet/i.test(e));
  if (audioErrors.length) console.log(`page errors mentioning audio:\n  ${audioErrors.join('\n  ')}`);
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  if (failed || audioErrors.length) process.exitCode = 1;
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
