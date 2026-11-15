#!/usr/bin/env node
/**
 * Browser smoke test of the audio engine (src/core/audio). Run: node e2e/audio-smoke.cjs
 *
 * Opens the app in Chromium, imports the audio module through the dev server and checks the real
 * Web Audio output:
 *
 *  live context   unlock on a click · notes, a strum, tones, drone, interface sounds, the metronome
 *                 and every backing style for two bars make sound (analyser) and never clip (every
 *                 output sample is captured by an AudioWorklet) · metronome clicks land within 2 ms
 *                 of their scheduled audio-clock time · the context suspends when idle and wakes up
 *  offline graph  the same engine graph rendered with OfflineAudioContext: pitch of A2 and E4,
 *                 event timing to the sample, every style, a deliberately overloaded mix
 *
 * Exits non-zero if any check fails.
 */
const { withApp } = require('./lib/harness.cjs');

const quick = process.argv.includes('--quick'); // skip the idle-suspend wait and play one bar per style

function inPage({ quick }) {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const report = { checks: [], info: {} };
    const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fmt = (n, d = 3) => Number(n).toFixed(d);

    // ---------------------------------------------------------------------------------------
    // Unlock on a real user gesture
    // ---------------------------------------------------------------------------------------
    const unlocked = await new Promise((resolve) => {
      document.addEventListener('pointerdown', () => resolve(audio.unlockAudio()), { once: true });
      window.__readyForClick = true;
    });
    const ctx = audio.getAudioContext();
    const engine = audio.getEngine();
    const fs = ctx.sampleRate;
    report.info.sampleRate = fs;
    report.info.outputLatency = engine.outputLatency;
    check('unlockAudio() resumes the context inside a click', unlocked === true && ctx.state === 'running', `state=${ctx.state}`);
    check('context sample rate is usable', fs >= 22050 && fs <= 192000, fs);

    // ---------------------------------------------------------------------------------------
    // Capture every output sample with an AudioWorklet (frame-exact, unlike an analyser)
    // ---------------------------------------------------------------------------------------
    const workletSrc = `
      class Rec extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (ch) this.port.postMessage({ frame: currentFrame, data: ch.slice() });
          return true;
        }
      }
      registerProcessor('smoke-rec', Rec);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([workletSrc], { type: 'application/javascript' })));
    const rec = new AudioWorkletNode(ctx, 'smoke-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    engine.output.connect(rec);
    rec.connect(sink);
    sink.connect(ctx.destination);
    let chunks = [];
    rec.port.onmessage = (e) => chunks.push(e.data);
    /** Start a capture; returns a function that stops it and returns { start (frame), samples }. */
    const capture = () => {
      chunks = [];
      return () => {
        const list = chunks;
        chunks = [];
        if (!list.length) return { start: 0, samples: new Float32Array(0), gaps: 0 };
        const start = list[0].frame;
        const end = list[list.length - 1].frame + list[list.length - 1].data.length;
        const samples = new Float32Array(end - start);
        let gaps = 0, expect = start;
        for (const c of list) {
          if (c.frame !== expect) gaps++;
          samples.set(c.data, c.frame - start);
          expect = c.frame + c.data.length;
        }
        return { start, samples, gaps };
      };
    };
    const stats = (x) => {
      let peak = 0, sum = 0, bad = 0;
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (!(v === v) || !isFinite(v)) bad++;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        sum += v * v;
      }
      return { peak, rms: Math.sqrt(sum / Math.max(1, x.length)), bad };
    };
    /** Poll the analyser tap while something plays. */
    const watchAnalyser = () => {
      let maxRms = 0, maxPeak = 0, n = 0;
      const id = setInterval(() => {
        const l = audio.getOutputLevel();
        maxRms = Math.max(maxRms, l.rms);
        maxPeak = Math.max(maxPeak, l.peak);
        n++;
      }, 20);
      return () => {
        clearInterval(id);
        return { maxRms, maxPeak, n };
      };
    };
    const CEILING = 0.985; // the master soft clipper tops out at 0.98

    /** Play something for `ms`, then report level through both the analyser and the full capture. */
    const audition = async (name, ms, play, minRms = 0.004) => {
      const stopCap = capture();
      const stopWatch = watchAnalyser();
      const cleanup = await play();
      await sleep(ms);
      const a = stopWatch();
      const c = stopCap();
      if (typeof cleanup === 'function') cleanup();
      const s = stats(c.samples);
      check(`${name}: sound is produced (analyser)`, a.maxRms > minRms, `analyser rms max ${fmt(a.maxRms, 4)}, peak max ${fmt(a.maxPeak)}`);
      check(`${name}: nothing clips`, s.peak <= CEILING && a.maxPeak <= CEILING && s.bad === 0, `captured peak ${fmt(s.peak)}, rms ${fmt(s.rms, 4)}, ${c.samples.length} samples`);
      return { capture: c, stats: s, analyser: a };
    };

    // ---------------------------------------------------------------------------------------
    // Live: notes, strum, tones, drone, interface sounds
    // ---------------------------------------------------------------------------------------
    {
      const r = await audition('pluck E3 (steel)', 1300, () => { audio.pluck(52, audio.audioNow() + 0.1, { velocity: 0.9 }); });
      const first = audio.findOnsets(r.capture.samples, fs, 0.01)[0];
      const est = audio.estimatePitch(r.capture.samples, fs, { start: (first || 0) + Math.round(0.1 * fs), length: 16384 });
      const cents = est ? audio.centsFromMidi(est.hz, 52) : NaN;
      check('live pluck E3 is in tune (captured output)', Math.abs(cents) < 2, `${fmt(cents)} cents`);
      audio.stopAll();
    }
    await audition('strum E major (down, then up)', 1500, () => {
      const t = audio.audioNow() + 0.1;
      audio.strum([40, 47, 52, 56, 59, 64], t, { velocity: 0.9, direction: 'down' });
      audio.strum([40, 47, 52, 56, 59, 64], t + 0.6, { velocity: 0.8, direction: 'up' });
    });
    audio.stopAll();
    for (const tone of ['nylon', 'clean', 'driven', 'muted', 'harmonic']) {
      await audition(`pluck A2 (${tone})`, 500, () => { audio.pluck(45, audio.audioNow() + 0.05, { tone, velocity: 0.9 }); }, 0.002);
      audio.stopAll();
    }
    await audition('bass E1', 600, () => { audio.playBass(28, audio.audioNow() + 0.05, { duration: 0.4 }); }, 0.002);
    for (const voice of ['sine', 'reference', 'epiano', 'organ']) {
      await audition(`tone A3 (${voice})`, 500, () => { audio.playTone(57, audio.audioNow() + 0.05, { voice, duration: 0.35 }); }, 0.002);
    }
    {
      let drone;
      await audition('drone A + fifth', 1300, () => { drone = audio.startDrone({ root: 45, fifth: true, fadeIn: 0.2 }); }, 0.002);
      drone.setRoot(47);
      drone.setFifth(false);
      await sleep(500);
      check('drone can change root while running', drone.running === true, '');
      drone.stop(0.1);
      await sleep(350);
      check('drone stops', drone.running === false, '');
    }
    await audition('rolled chord on the electric piano', 700, () => { audio.playChord([57, 60, 64, 69], audio.audioNow() + 0.05, { voice: 'epiano', duration: 0.5, roll: 0.03 }); }, 0.002);
    await audition('drum kit (every piece)', audio.DRUM_NAMES.length * 110 + 500, () => {
      const t = audio.audioNow() + 0.1;
      audio.DRUM_NAMES.forEach((d, i) => audio.playDrum(d, t + i * 0.11, 0.9));
    });
    await audition('interface sounds', 1700, () => {
      ['correct', 'wrong', 'gem', 'streak', 'heartLost', 'levelUp'].forEach((n, i) => setTimeout(() => audio.playUi(n), i * 220));
    }, 0.001);

    // ---------------------------------------------------------------------------------------
    // Live: metronome, with event timing measured against the audio clock
    // ---------------------------------------------------------------------------------------
    await sleep(2300); // let the last interface sound ring out: the timing check needs silence between clicks
    {
      const metro = new audio.Metronome({ tempo: 187, timeSignature: '7/8' });
      metro.sound = 'woodblock';
      metro.subdivision = 'eighth';
      const scheduled = [];
      const visual = [];
      let minLead = Infinity;
      metro.onSchedule((b) => {
        minLead = Math.min(minLead, b.time - ctx.currentTime);
      });
      metro.onBeat((b) => visual.push({ time: b.time, heardAt: audio.audioSoundingNow(), now: ctx.currentTime }));
      // Record every click (beats and subdivisions) at scheduling time.
      const tr = metro.transport;
      const pattern = () => metro.pattern();
      tr.on('bar', (e) => {
        const spt = 60 / (tr.bpm * audio.PPQ);
        for (const c of pattern()) scheduled.push(e.time + c.tick * spt);
      });
      const r = await audition('metronome 7/8 with eighth subdivisions', 2600, () => { metro.start(); });
      const pos = metro.position();
      metro.stop();
      const onsets = audio.findOnsets(r.capture.samples, fs, 0.012, 0.03).map((i) => (r.capture.start + i) / fs);
      const windowEnd = (r.capture.start + r.capture.samples.length) / fs - 0.05;
      const wanted = scheduled.filter((t) => t < windowEnd);
      let worst = 0, matched = 0;
      for (const t of wanted) {
        let best = Infinity;
        for (const o of onsets) if (Math.abs(o - t) < Math.abs(best)) best = o - t;
        if (Math.abs(best) < 0.02) matched++;
        worst = Math.max(worst, Math.abs(best));
      }
      report.info.liveTimingWorstMs = worst * 1000;
      report.info.liveClicks = wanted.length;
      check('metronome: every scheduled click is heard', wanted.length >= 12 && matched === wanted.length, `${matched}/${wanted.length} clicks found, ${onsets.length} onsets`);
      check('metronome: clicks land within 2 ms of their audio-clock time (live)', worst < 0.002, `worst ${fmt(worst * 1000, 4)} ms over ${wanted.length} clicks`);
      check('metronome: nothing is scheduled late', minLead > 0, `smallest lead ${fmt(minLead * 1000, 1)} ms`);
      const lateness = visual.map((v) => v.heardAt - v.time);
      const worstVisual = Math.max(...lateness.map(Math.abs));
      check('metronome: visual beat callbacks fire when the beat is heard', visual.length >= 4 && worstVisual < 0.05, `${visual.length} callbacks, worst offset ${fmt(worstVisual * 1000, 1)} ms`);
      check('transport position is reported in bars/beats', pos.state === 'playing' && pos.bar >= 0 && pos.beatsInBar === 3, `bar ${pos.bar} beat ${pos.beat} tick ${fmt(pos.tick, 0)}`);
      metro.dispose();
      await sleep(250);
    }

    // ---------------------------------------------------------------------------------------
    // Live: every backing style for a couple of bars
    // ---------------------------------------------------------------------------------------
    const C = audio.chordFromIntervals(0, [4, 7], 'C');
    const Am = audio.chordFromIntervals(9, [3, 7], 'Am');
    const Dm7 = audio.chordFromIntervals(2, [3, 7, 10], 'Dm7');
    const G7 = audio.chordFromIntervals(7, [4, 7, 10], 'G7');
    const band = new audio.BackingBand();
    const bars = quick ? 1 : 2;
    for (const id of audio.BACKING_STYLE_IDS) {
      const style = audio.BACKING_STYLES[id];
      const a = band.load([[C, Am], [Dm7, G7]].slice(0, bars), { style: id, tempo: style.tempo.max, choruses: 1, countInBars: 0, ending: true });
      await band.prepare();
      const seconds = (a.lengthTicks / audio.PPQ) * (60 / audio.styleQuarterBpm(id, style.tempo.max));
      const chords = [];
      const off = band.onChord((c) => chords.push(c.segment.chord.symbol));
      const r = await audition(`backing: ${id}`, seconds * 1000 + 350, () => { band.start(); }, 0.006);
      off();
      check(`backing: ${id} reaches its ending and stops`, !band.playing && chords.length >= bars * 2, `chords heard: ${chords.join(' ')}`);
      report.info[`live:${id}`] = `peak ${fmt(r.stats.peak)} rms ${fmt(r.stats.rms, 4)}`;
      band.stop();
      await sleep(120);
    }
    // The learner's guitar on top of a band with its rhythm guitar unmuted: the busiest case.
    {
      band.load([C, G7], { style: 'metal', tempo: 180, choruses: 1, countInBars: 0 });
      band.setMuted('guitar', false);
      await band.prepare();
      await audition('full band + rhythm guitar + lead strums + click', 3300, () => {
        band.start();
        const t = audio.audioNow() + 0.1;
        for (let i = 0; i < 12; i++) {
          audio.strum([40, 47, 52, 56, 59, 64], t + i * 0.25, { velocity: 1, tone: 'steel' });
          audio.playClick('cowbell', 'accent', t + i * 0.25, 1.5);
        }
      });
      band.stop();
      band.setMuted('guitar', true);
      audio.stopAll();
    }
    band.dispose();

    // ---------------------------------------------------------------------------------------
    // Live: mixer controls
    // ---------------------------------------------------------------------------------------
    {
      audio.setMuted(true);
      await sleep(120);
      const r = await (async () => {
        const stop = capture();
        audio.pluck(52, audio.audioNow() + 0.05, { velocity: 1 });
        await sleep(400);
        return stop();
      })();
      check('mute silences the output', stats(r.samples).peak < 1e-3, `peak ${stats(r.samples).peak.toExponential(2)}`);
      audio.setMuted(false);
      audio.stopAll();
      audio.setMasterVolume(0.3);
      await sleep(120);
      const quiet = await (async () => { const stop = capture(); audio.pluck(52, audio.audioNow() + 0.05, { velocity: 1 }); await sleep(400); return stats(stop().samples).peak; })();
      audio.stopAll();
      audio.setMasterVolume(0.85);
      await sleep(120);
      const loud = await (async () => { const stop = capture(); audio.pluck(52, audio.audioNow() + 0.05, { velocity: 1 }); await sleep(400); return stats(stop().samples).peak; })();
      audio.stopAll();
      check('master volume scales the output', quiet > 0 && loud > quiet * 3, `0.3 -> ${fmt(quiet)}, 0.85 -> ${fmt(loud)}`);
    }

    // ---------------------------------------------------------------------------------------
    // Offline: the same engine graph, measured exactly
    // ---------------------------------------------------------------------------------------
    check('OfflineAudioContext is available', audio.offlineSupported(), '');
    for (const rate of [48000, 44100]) {
      for (const [midi, name] of [[45, 'A2'], [64, 'E4']]) {
        for (const tone of ['steel', 'nylon', 'clean']) {
          const play = (e) => { new audio.GuitarSynth({ engine: e }).pluck(midi, 0.1, { tone, velocity: 0.85 }); };
          // Dry (no room reverb): the fundamental can be measured to a thousandth of a cent.
          const dry = await audio.renderOffline({ seconds: 1.6, sampleRate: rate, reverb: false }, play);
          // With the reverb, as it is heard: measured the way a tuner would.
          const wet = await audio.renderOffline({ seconds: 1.6, sampleRate: rate }, play);
          const start = Math.round(0.25 * rate);
          const f0 = 440 * Math.pow(2, (midi - 69) / 12);
          const phase = audio.centsFromMidi(audio.measureFundamental(dry.samples, rate, f0, { start }), midi);
          const estDry = audio.estimatePitch(dry.samples, rate, { start, length: 16384 });
          const estWet = audio.estimatePitch(wet.samples, rate, { start, length: 16384 });
          const autoDry = estDry ? audio.centsFromMidi(estDry.hz, midi) : NaN;
          const autoWet = estWet ? audio.centsFromMidi(estWet.hz, midi) : NaN;
          check(`offline ${name} ${tone} @${rate}: pitch within 2 cents`, Math.abs(phase) < 2 && Math.abs(autoDry) < 2 && Math.abs(autoWet) < 2,
            `fundamental ${fmt(phase, 4)} c, autocorrelation ${fmt(autoDry, 4)} c dry / ${fmt(autoWet, 4)} c with reverb`);
        }
      }
    }
    {
      const r = await audio.renderOffline({ seconds: 1.2, reverb: false }, (e) => { audio.playTone(69, 0.05, { voice: 'reference', duration: 1 }, e); });
      const c = audio.centsFromMidi(audio.measureFundamental(r.samples, 48000, 440, { start: 9600 }), 69);
      check('offline reference tone A4 = 440 Hz', Math.abs(c) < 0.1, `${fmt(c, 4)} c`);
      const r2 = await audio.renderOffline({ seconds: 1.2, reverb: false }, (e) => { audio.playTone(64, 0.05, { voice: 'epiano', duration: 1, a4: 442 }, e); });
      const c2 = audio.centsFromMidi(audio.measureFundamental(r2.samples, 48000, 331, { start: 9600 }), 64, 442);
      check('offline electric piano E4 follows A4 = 442', Math.abs(c2) < 0.5, `${fmt(c2, 4)} c`);
      const r3 = await audio.renderOffline({ seconds: 1.2, reverb: false }, (e) => { new audio.GuitarSynth({ engine: e }).pluck(57, 0.05, { cents: 30 }); });
      const c3 = audio.centsFromMidi(audio.measureFundamental(r3.samples, 48000, 220, { start: 9600 }), 57);
      check('offline detuned pluck (+30 cents) is exactly that', Math.abs(c3 - 30) < 0.5, `${fmt(c3, 4)} c`);
      const r4 = await audio.renderOffline({ seconds: 1.2, reverb: false }, (e) => { const g = new audio.GuitarSynth({ engine: e }); g.a4 = 432; g.pluck(69, 0.05); });
      const c4 = audio.centsFromMidi(audio.measureFundamental(r4.samples, 48000, 432, { start: 9600 }), 69, 432);
      check('offline guitar follows A4 = 432', Math.abs(c4) < 0.5, `${fmt(c4, 4)} c`);
    }
    // Event timing through Transport -> voices -> mixer -> limiter, to the sample.
    {
      const wanted = [];
      const names = ['kick', 'pluck E3', 'sidestick', 'woodblock click', 'snare', 'pluck E4 (clean)', 'bass A1', 'hi-hat'];
      const r = await audio.renderOffline({ seconds: 10.3, reverb: false }, (e) => {
        const tr = new audio.Transport({ clock: e.clock, timer: 'manual', bpm: 150 });
        const kit = new audio.DrumKit(e);
        const guitar = new audio.GuitarSynth({ engine: e });
        const bass = new audio.GuitarSynth({ engine: e, bus: 'bass', tone: 'bass-finger', mono: true });
        const sounds = [
          (t) => kit.play('kick', t, 1),
          (t) => guitar.pluck(52, t, { velocity: 1, duration: 0.15 }),
          (t) => kit.play('sidestick', t, 1),
          (t) => audio.playClick('woodblock', 'accent', t, 1, e),
          (t) => kit.play('snare', t, 1),
          (t) => guitar.pluck(64, t, { velocity: 1, duration: 0.15, tone: 'clean' }),
          (t) => bass.pluck(33, t, { velocity: 1, duration: 0.15 }),
          (t) => kit.play('hihatClosed', t, 1),
        ];
        let i = 0;
        // 0.62 s apart (every sound has died away before the next), never on a round sample number.
        tr.scheduleRepeat((time) => {
          wanted.push({ time, name: names[i % sounds.length] });
          sounds[i++ % sounds.length](time);
        }, 1488);
        tr.start({ at: 0.0503 });
        tr.advanceTo(10.0);
      });
      const onsets = audio.findOnsets(r.samples, 48000, 0.003, 0.08).map((i) => i / 48000);
      let worst = 0, matched = 0, worstName = '';
      for (const w of wanted) {
        let best = Infinity;
        for (const o of onsets) if (Math.abs(o - w.time) < Math.abs(best)) best = o - w.time;
        if (Math.abs(best) < 0.01) matched++;
        if (Math.abs(best) > worst) { worst = Math.abs(best); worstName = w.name; }
      }
      report.info.offlineTimingWorstMs = worst * 1000;
      check('offline: every scheduled event is in the output', matched === wanted.length && wanted.length >= 16, `${matched}/${wanted.length} events, ${onsets.length} onsets`);
      check('offline: events land within 2 ms of their audio-clock time', worst < 0.002, `worst ${fmt(worst * 1000, 4)} ms (${worstName}) over ${wanted.length} events: drums, guitar, bass, click`);
    }
    // Every style, all four players, rendered and measured.
    for (const id of audio.BACKING_STYLE_IDS) {
      const style = audio.BACKING_STYLES[id];
      const qpm = audio.styleQuarterBpm(id, style.tempo.default);
      let arrangement;
      const seconds = (bars2) => (bars2 * audio.resolveMeter(style.timeSignature).barTicks / audio.PPQ) * (60 / qpm);
      const total = seconds(5) + 1.5;
      const r = await audio.renderOffline({ seconds: total }, async (e) => {
        const b = new audio.BackingBand({ engine: e, timer: 'manual' });
        arrangement = b.load([C, Am, Dm7, G7], { style: id, choruses: 1, countInBars: 0 });
        b.setMuted('guitar', false);
        b.start();
        b.transport.advanceTo(total);
      });
      const s = stats(r.samples);
      const sL = stats(r.channels[0]);
      const body = stats(r.samples.subarray(Math.round(0.2 * 48000), Math.round(seconds(4) * 48000)));
      check(`offline backing ${id}: sound, no clipping, no bad samples`, body.rms > 0.02 && sL.peak <= CEILING && s.bad === 0, `rms ${fmt(body.rms, 4)}, peak ${fmt(sL.peak)}, ${arrangement.events.length} events`);
      report.info[`offline:${id}`] = `rms ${fmt(body.rms, 4)} peak ${fmt(sL.peak)}`;
    }
    // A deliberately overloaded mix must still stay inside full scale.
    {
      const r = await audio.renderOffline({ seconds: 3 }, (e) => {
        const g = new audio.GuitarSynth({ engine: e });
        const kit = new audio.DrumKit(e);
        e.masterVolume = 1;
        for (const bus of ['guitar', 'drums', 'click', 'tone']) e.setBusVolume(bus, 1.5);
        for (let i = 0; i < 10; i++) {
          const t = 0.1 + i * 0.25;
          g.strum([40, 47, 52, 56, 59, 64], t, { velocity: 1, gain: 3, tone: i % 2 ? 'driven' : 'steel' });
          kit.play('kick', t, 1, 3);
          kit.play('crash', t, 1, 3);
          audio.playClick('beep', 'accent', t, 3, e);
          audio.playChord([48, 52, 55, 60], t, { voice: 'organ', duration: 0.2, gain: 3 }, e);
        }
      });
      const l = stats(r.channels[0]), rr = stats(r.channels[1]);
      check('offline: an overloaded mix is limited, never clipped', Math.max(l.peak, rr.peak) <= CEILING && l.bad + rr.bad === 0 && l.rms > 0.2, `peak L ${fmt(l.peak)} R ${fmt(rr.peak)}, rms ${fmt(l.rms)}`);
    }

    // ---------------------------------------------------------------------------------------
    // Live: suspend when idle, wake on the next note
    // ---------------------------------------------------------------------------------------
    if (!quick) {
      audio.stopAll();
      // A transport with nothing to play (think: the metronome's silent bars) must keep the clock
      // running well past the idle limit.
      const silent = new audio.Transport({ clock: audio.engineClock, bpm: 60 });
      silent.start();
      await sleep(9500);
      const sp = silent.position();
      check('a running transport keeps the context awake through silence', ctx.state === 'running' && sp.bar >= 2, `state ${ctx.state}, bar ${sp.bar} beat ${sp.beat} after 9.5 s at 60 bpm`);
      silent.stop();
      silent.dispose();
      const t0 = performance.now();
      while (ctx.state === 'running' && performance.now() - t0 < 16000) await sleep(250);
      const idleAfter = (performance.now() - t0) / 1000;
      check('context suspends when idle', ctx.state === 'suspended' && idleAfter > 4, `state ${ctx.state} after ${fmt(idleAfter, 1)} s`);
      const stop = capture();
      audio.pluck(57, undefined, { velocity: 0.9 });
      await sleep(900);
      const s = stats(stop().samples);
      check('context wakes up for the next note', ctx.state === 'running' && s.rms > 0.003, `state ${ctx.state}, rms ${fmt(s.rms, 4)}`);
    }
    report.info.cache = engine.buffers.stats;
    return report;
  })();
}

/**
 * Second phase: the autoplay policy real browsers apply. Sounds requested before the first gesture
 * must not burst out later, and a Play button that calls pluck() directly must start audio.
 *
 * Playwright's page.evaluate counts as a user gesture, so this phase runs as an init script inside
 * the page and talks to the test through console messages until the real click has happened.
 */
function lockedScript() {
  window.addEventListener('load', async () => {
    const out = { checks: [], initialState: 'unknown', error: null };
    window.__locked = out;
    const check = (name, pass, detail) => out.checks.push({ name, pass: !!pass, detail: String(detail ?? '') });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const audio = await import('/src/core/audio/index.ts');
      const ctx = audio.getAudioContext();
      out.initialState = ctx.state;
      out.activeAtStart = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
      if (ctx.state !== 'running') {
        // Requested with no user gesture: must never be heard.
        audio.pluck(60, undefined, { velocity: 1 });
        audio.playUi('levelUp');
        audio.playDrum('crash');
        const workletSrc = "class Rec extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage({ frame: currentFrame, data: ch.slice() }); return true; } } registerProcessor('smoke-rec', Rec);";
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([workletSrc], { type: 'application/javascript' })));
        const rec = new AudioWorkletNode(ctx, 'smoke-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        const sink = ctx.createGain();
        sink.gain.value = 0;
        audio.getEngine().output.connect(rec);
        rec.connect(sink);
        sink.connect(ctx.destination);
        const chunks = [];
        rec.port.onmessage = (e) => chunks.push(e.data);
        await sleep(900);
        check('audio stays locked until a user gesture', ctx.state === 'suspended', ctx.state);
        // The "Play" button: calls pluck() directly, without unlockAudio().
        const clicked = new Promise((resolve) => {
          document.addEventListener('pointerdown', () => { audio.pluck(64, undefined, { velocity: 1 }); resolve(); }, { once: true });
        });
        console.log('__locked:ready');
        await clicked;
        await sleep(1000);
        check('pluck() inside a click handler starts audio by itself', ctx.state === 'running', ctx.state);
        const fs = ctx.sampleRate;
        const start = chunks.length ? chunks[0].frame : 0;
        const end = chunks.length ? chunks[chunks.length - 1].frame + 128 : 0;
        const x = new Float32Array(Math.max(0, end - start));
        for (const c of chunks) x.set(c.data, c.frame - start);
        const first = audio.findOnsets(x, fs, 0.01)[0] ?? 0;
        const est = x.length > 9000 ? audio.estimatePitch(x, fs, { start: first + Math.round(0.05 * fs), length: 8192 }) : null;
        const cents = est ? audio.centsFromMidi(est.hz, 64) : NaN;
        check('the note played from the click is heard, in tune', Math.abs(cents) < 3, `${cents.toFixed(3)} cents from E4`);
        const amp = (f) => audio.harmonicAmplitudes(x, fs, f, 1, first / fs + 0.05, 0.25)[0];
        // The stale requests were a C4 pluck and a fanfare starting on C5; the click played E4.
        // (With the guard switched off, C4 comes out at about two thirds of E4's level.)
        const c4 = amp(261.63), c5 = amp(523.25), e4 = amp(329.63);
        check('sounds requested before the gesture were dropped, not played late', c4 < e4 * 0.2 && c5 < e4 * 0.2,
          `C4 ${c4.toExponential(2)}, C5 ${c5.toExponential(2)} vs E4 ${e4.toExponential(2)}`);
      }
    } catch (e) {
      out.error = String(e && e.stack ? e.stack : e);
    }
    console.log('__locked:done');
  });
}

async function lockedPhase() {
  const { chromium } = require('playwright');
  const { startServer } = require('./lib/harness.cjs');
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=document-user-activation-required'] });
  try {
    const context = await browser.newContext();
    await context.addInitScript(lockedScript);
    const page = await context.newPage();
    const waitFor = (text, ms) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      page.on('console', (m) => {
        if (m.text() === text) {
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
    const done = waitFor('__locked:done', 40000);
    const ready = waitFor('__locked:ready', 30000);
    await page.goto(server.url + '#home', { waitUntil: 'load' });
    // No evaluate / waitForSelector before the click: they would count as a user gesture.
    const first = await Promise.race([ready.then((ok) => (ok ? 'ready' : 'timeout')), done.then(() => 'done')]);
    if (first === 'ready') await page.mouse.click(8, 8);
    await done;
    return await page.evaluate(() => window.__locked);
  } finally {
    await browser.close();
    await server.close();
  }
}

withApp({}, async ({ page, goto, errors }) => {
  await goto('home');
  const run = page.evaluate(inPage, { quick });
  await page.waitForFunction(() => window.__readyForClick === true, null, { timeout: 30000 });
  await page.mouse.click(8, 8); // the user gesture that unlocks audio
  const report = await run;
  let failed = 0;
  for (const c of report.checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  }
  console.log('\ninfo:', JSON.stringify(report.info, null, 1));
  const audioErrors = errors.filter((e) => /audio|AudioContext|worklet/i.test(e));
  if (audioErrors.length) console.log(`page errors mentioning audio:\n  ${audioErrors.join('\n  ')}`);
  console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
  if (failed || audioErrors.length) process.exitCode = 1;
}).then(async () => {
  const locked = (await lockedPhase()) || { checks: [], initialState: 'no result', error: 'the in-page script did not run' };
  console.log(`\nautoplay-locked browser (initial context state: ${locked.initialState})`);
  if (locked.error) {
    console.log(`FAIL locked-start phase crashed: ${locked.error}`);
    process.exitCode = 1;
  } else if (!locked.checks.length) console.log('  this browser does not block autoplay; locked-start checks skipped');
  let failed = 0;
  for (const c of locked.checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  }
  if (failed) process.exitCode = 1;
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
