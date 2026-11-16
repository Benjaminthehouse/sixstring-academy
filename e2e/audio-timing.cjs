#!/usr/bin/env node
/**
 * Timing test of the audio engine in a real browser. Run: node e2e/audio-timing.cjs [--quick] [--long]
 *
 * Every check compares three things that must agree: where an event SHOULD be (worked out here from
 * first principles: tempo, meter, swing, ramps, loop), where the Transport SAID it scheduled it (the
 * audio-clock time handed to the callback), and where it actually IS in the output (found by sample
 * in the rendered or recorded signal).
 *
 *  offline  three minutes of metronome driven by a scheduler that wakes up irregularly, with tempo
 *           changes, swing, triplets, 7/8, 5/4 and 6/8, at 48 kHz and 44.1 kHz: every click within
 *           2 ms (in fact a few microseconds), no drift
 *  offline  a tempo map with linear ramps and meter changes, a loop that wraps several times, a seek,
 *           a pause and a resume, a count-in: against a numerically integrated reference
 *  offline  the real voices (every click set, drums, guitar tones, bass, tones): the onset of each
 *           sound sits where it was scheduled
 *  live     the real AudioContext with real timers and a main thread that keeps stalling: every
 *           click recorded by an AudioWorklet within 2 ms of its audio-clock time, no drift; tempo
 *           changes, loop wrap, seek, pause/resume and stop leave no stray or missing clicks
 *
 * --quick shortens the live phases; --long runs the live metronome for a full three minutes.
 * Exits non-zero if any check fails.
 */
const { withApp } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

const quick = process.argv.includes('--quick');
const long = process.argv.includes('--long');

function inPage({ quick, long }) {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const report = { checks: [], info: {} };
    const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ms = (s, d = 4) => `${(s * 1000).toFixed(d)} ms`;
    const PPQ = audio.PPQ;

    const T = window.__audioTools;
    const { rng, impulsePlayer, findImpulses, compare, stall } = T;

    // -------------------------------------------------------------------------------------------
    // Reference model: seconds of a tick, worked out independently of timeline.ts
    // -------------------------------------------------------------------------------------------

    /** Seconds from tick 0 to `tick` through tempo points [{ tick, bpm, ramp? }], by Simpson's rule. */
    const refSeconds = (points, tick) => {
      const bpmAt = (u) => {
        let i = 0;
        while (i + 1 < points.length && points[i + 1].tick <= u) i++;
        const a = points[i], b = points[i + 1];
        if (a.ramp && b && u >= a.tick) return a.bpm + ((b.bpm - a.bpm) * (u - a.tick)) / (b.tick - a.tick);
        return a.bpm;
      };
      let total = 0;
      const edges = [0, ...points.map((p) => p.tick).filter((t) => t > 0 && t < tick), tick];
      for (let s = 0; s + 1 < edges.length; s++) {
        const a = edges[s], b = edges[s + 1];
        if (b <= a) continue;
        const steps = Math.max(2, 2 * Math.ceil((b - a) / 16));
        const h = (b - a) / steps;
        let acc = 0;
        for (let k = 0; k <= steps; k++) {
          const u = a + k * h;
          // Evaluate just inside the segment at its ends, so a step change is not straddled.
          const uu = k === 0 ? a + 1e-9 : k === steps ? b - 1e-9 : u;
          acc += (k === 0 || k === steps ? 1 : k % 2 ? 4 : 2) * (60 / (PPQ * bpmAt(uu)));
        }
        total += (acc * h) / 3;
      }
      return total;
    };
    const refSwing = (tick, ratio, unit) => {
      if (!(ratio > 0.5)) return tick;
      const pair = 2 * unit;
      const base = Math.floor(tick / pair) * pair;
      const pos = tick - base;
      return pos <= unit ? base + pos * 2 * ratio : base + pair * ratio + (pos - unit) * 2 * (1 - ratio);
    };

    // -------------------------------------------------------------------------------------------
    // 1. Offline: three minutes of metronome, scheduler woken irregularly
    // -------------------------------------------------------------------------------------------
    check('OfflineAudioContext is available', audio.offlineSupported(), '');

    const metronomeRun = async (sampleRate, seconds) => {
      const log = []; // { time, level, seg }
      let segment = 0;
      const segments = []; // { from (index into log), tempo, signature, subdivision, swing }
      const r = await audio.renderOffline({ seconds: seconds + 1, sampleRate, reverb: false }, (engine) => {
        const fire = impulsePlayer(engine);
        const clock = { t: 0, now() { return this.t; }, soundingNow() { return this.t; } };
        const m = new audio.Metronome({
          clock, timer: 'manual', tempo: 120, timeSignature: '4/4',
          output: {
            click: (set, level, time) => {
              const entry = { time, level, seg: segment, cancelled: false };
              log.push(entry);
              const cancel = fire(time);
              return () => { entry.cancelled = true; cancel(); };
            },
          },
        });
        m.subdivision = 'eighth';
        const mark = () => { segment = segments.length; segments.push({ at: clock.t, tempo: m.tempo, sig: `${m.timeSignature.numerator}/${m.timeSignature.denominator}`, sub: m.subdivision, swing: m.swingRatio, meter: m.meter }); };
        mark();
        m.start();
        // What a learner might do over three minutes, by the clock.
        const script = [
          [9.3, () => m.setTempo(147)],
          [18.1, () => { m.subdivision = 'swing'; }],
          [27.7, () => { m.swingRatio = 0.6; }],
          [36.2, () => m.setTimeSignature('7/8')],
          [47.9, () => m.setTempo(93)],
          [58.4, () => { m.setTimeSignature('5/4'); m.subdivision = 'triplet'; }],
          [71.6, () => m.setTempo(201)],
          [83.3, () => { m.setTimeSignature('6/8'); m.subdivision = 'eighth'; }],
          [95.8, () => m.setTempo(52)],
          [108.2, () => { m.setTimeSignature('7/8(3+2+2)'); m.subdivision = 'sixteenth'; }],
          [119.5, () => m.setTempo(176)],
          [131.4, () => { m.setTimeSignature('4/4'); m.subdivision = 'sixteenth'; m.setTempo(200); }],
          [146.9, () => { m.subdivision = 'quintuplet'; m.setTempo(71); }],
          [159.3, () => { m.setTimeSignature('3/4'); m.subdivision = 'none'; m.setTempo(388); }],
          [170.7, () => { m.setTimeSignature('4/4'); m.subdivision = 'swing'; m.swingRatio = 2 / 3; m.setTempo(132); }],
        ];
        const rand = rng(sampleRate);
        let next = 0;
        while (clock.t < seconds) {
          // Wake-ups 5..50 ms apart, and every so often a main-thread stall of up to 110 ms.
          clock.t += 0.005 + rand() * 0.045 + (rand() < 0.03 ? rand() * 0.06 : 0);
          while (next < script.length && script[next][0] <= clock.t) { script[next][1](); mark(); next++; }
          m.transport.process();
        }
        m.stop();
      });
      // Clicks the metronome took back (a restart for a new time signature) must not be in the output,
      // and clicks scheduled beyond the rendered length cannot be.
      const heard = log.filter((c) => !c.cancelled);
      const wanted = heard.filter((c) => c.time < seconds).map((c) => c.time).sort((a, b) => a - b);
      const found = findImpulses(r.samples, sampleRate).filter((t) => t < seconds);
      const cmp = compare(wanted, found);

      // Independent check of the grid inside every segment: beats 60/tempo apart (scaled by the beat's
      // length), subdivisions at their fractions, measured on the times the Transport reported.
      let gridWorst = 0, gridN = 0, gridBad = '';
      let late = 0;
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const clicks = heard.filter((c) => c.seg === s);
        // The first beat after a change of tempo alone keeps the old grid position, so compare gaps
        // between clicks that are both well inside the segment (skip the look-ahead window).
        const inside = clicks.filter((c) => c.time > seg.at + 0.2);
        const meter = seg.meter;
        const secPerTick = 60 / (seg.tempo * meter.tempoBeatTicks);
        const pattern = audio.clickPattern(meter, undefined, seg.sub, seg.swing).map((c) => c.tick).sort((a, b) => a - b);
        const gaps = pattern.map((t, i) => ((i + 1 < pattern.length ? pattern[i + 1] : meter.barTicks) - t) * secPerTick);
        // Find the phase of the pattern from the levels: an accent starts a bar.
        const firstAccent = inside.findIndex((c) => c.level === 'accent');
        if (firstAccent < 0) continue;
        for (let i = firstAccent; i + 1 < inside.length; i++) {
          const expected = gaps[(i - firstAccent) % gaps.length];
          const got = inside[i + 1].time - inside[i].time;
          gridN++;
          if (Math.abs(got - expected) > gridWorst) { gridWorst = Math.abs(got - expected); gridBad = `segment ${s} (${seg.sig} ${seg.sub} @${seg.tempo}): gap ${got.toFixed(6)} vs ${expected.toFixed(6)}`; }
        }
        // No drift inside the segment: last click vs first accent, against the sum of expected gaps.
        if (inside.length - firstAccent > 8) {
          let sum = 0;
          for (let i = firstAccent; i + 1 < inside.length; i++) sum += gaps[(i - firstAccent) % gaps.length];
          const drift = inside[inside.length - 1].time - inside[firstAccent].time - sum;
          if (Math.abs(drift) > late) late = Math.abs(drift);
        }
      }
      // Clicks never bunch up at a change: what is heard is strictly in order, and no two clicks are
      // closer than the fastest subdivision in the run (a sixteenth at 200 BPM is 75 ms).
      let monotone = true, closest = Infinity;
      for (let i = 1; i < heard.length; i++) {
        if (!(heard[i].time > heard[i - 1].time)) monotone = false;
        closest = Math.min(closest, heard[i].time - heard[i - 1].time);
      }
      return { cmp, clicks: wanted.length, gridWorst, gridN, gridBad, segmentDrift: late, monotone, closest, takenBack: log.length - heard.length, segments: segments.length };
    };

    for (const rate of [48000, 44100]) {
      const seconds = 181;
      const t0 = performance.now();
      const r = await metronomeRun(rate, seconds);
      report.info[`offline metronome @${rate}`] = `${r.clicks} clicks over ${seconds} s in ${r.segments} settings (${r.takenBack} taken back at restarts), rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
      check(`3 min metronome @${rate}: every click is in the output, none extra`, r.cmp.missing === 0 && r.cmp.extra === 0 && r.cmp.n === r.clicks && r.clicks > 1000, `${r.cmp.n}/${r.clicks} found, ${r.cmp.missing} missing, ${r.cmp.extra} extra`);
      check(`3 min metronome @${rate}: every click within 2 ms of its audio-clock time`, r.cmp.worst < 0.002, `worst ${ms(r.cmp.worst)}, mean offset ${ms(r.cmp.mean)}`);
      check(`3 min metronome @${rate}: jitter under 2 ms (in fact under a sample)`, r.cmp.jitter < 1.01 / rate, `jitter ${ms(r.cmp.jitter)} = ${(r.cmp.jitter * rate).toFixed(3)} samples`);
      check(`3 min metronome @${rate}: no drift between scheduled and rendered time`, Math.abs(r.cmp.drift) < 20e-6, `${ms(r.cmp.drift, 5)} over ${r.cmp.span.toFixed(0)} s`);
      check(`3 min metronome @${rate}: the grid is exact in every tempo, meter and subdivision`, r.gridWorst < 1e-9 && r.gridN > 1000, `worst gap error ${r.gridWorst.toExponential(2)} s over ${r.gridN} gaps${r.gridWorst >= 1e-9 ? ` — ${r.gridBad}` : ''}`);
      check(`3 min metronome @${rate}: no drift inside any setting`, r.segmentDrift < 1e-9, `worst accumulated error ${r.segmentDrift.toExponential(2)} s`);
      check(`3 min metronome @${rate}: no doubled or bunched clicks at any change`, r.monotone && r.closest > 0.03, `closest pair ${ms(r.closest, 1)} apart`);
    }

    // -------------------------------------------------------------------------------------------
    // 2. Offline: tempo map with ramps, meter changes, swing, loop, seek, pause/resume, count-in
    // -------------------------------------------------------------------------------------------
    {
      const sampleRate = 48000;
      const log = []; // { time, tick }
      const marks = {};
      const meters = [{ bar: 0, timeSignature: '4/4' }, { bar: 8, timeSignature: '7/8' }, { bar: 16, timeSignature: '5/4' }, { bar: 20, timeSignature: '6/8' }, { bar: 28, timeSignature: '4/4' }];
      const tlProbe = new audio.Timeline({ meters });
      const B = (bar) => tlProbe.barStart(bar);
      const tempo = [
        { tick: 0, bpm: 96 },
        { tick: B(2), bpm: 96, ramp: true }, { tick: B(6), bpm: 168 },     // accelerando over four bars
        { tick: B(8), bpm: 168, ramp: true }, { tick: B(12), bpm: 60 },    // ritardando through 7/8
        { tick: B(16), bpm: 132 },                                           // step
        { tick: B(20), bpm: 90, ramp: true }, { tick: B(24), bpm: 150 },   // ramp in 6/8
        { tick: B(28), bpm: 120 },
      ];
      let swingFrom = Infinity, swingTo = Infinity;
      const total = 125;
      const r = await audio.renderOffline({ seconds: total, sampleRate, reverb: false }, (engine) => {
        const fire = impulsePlayer(engine);
        const clock = { t: 0, now() { return this.t; }, soundingNow() { return this.t; } };
        const tr = new audio.Transport({ clock, timer: 'manual' });
        tr.setMeters(meters);
        tr.setTempoMap(tempo);
        tr.scheduleRepeat((time, tick) => { log.push({ time, tick }); fire(time); }, 240);
        // Swing switched on and off exactly at bar lines, from inside the callback.
        tr.on('bar', (e) => {
          if (e.bar === 28 && swingFrom === Infinity) { tr.setSwing(0.64); swingFrom = e.tick; }
          if (e.bar === 32 && swingTo === Infinity) { tr.setSwing(0.5); swingTo = e.tick; }
          if (e.bar === 34 && !marks.loopSet) { tr.setLoop({ bar: 34 }, { bar: 36 }); marks.loopSet = true; }
        });
        tr.on('loop', (e) => { marks.loops = e.count; if (e.count === 4) tr.clearLoop(); });
        tr.on('beat', (e) => { if (e.countIn) (marks.countIn ??= []).push(e.time); });
        tr.on('start', (e) => { (marks.starts ??= []).push(e); });
        tr.on('seek', (e) => { marks.seek = e; });
        tr.on('pause', (e) => { marks.pause = e; });
        const rand = rng(7);
        const run = (until) => {
          while (clock.t < until && tr.state === 'playing') {
            clock.t += 0.004 + rand() * 0.05;
            tr.process();
          }
        };
        tr.start({ countIn: 2, at: 0.0507 });
        run(96);
        // A seek while playing: back to bar 30 (inside the swung section, which is over by now).
        marks.beforeSeek = log.length;
        tr.seek({ bar: 3 });
        run(104);
        marks.beforePause = log.length;
        tr.pause();
        marks.pausedAt = tr.position().absTick;
        clock.t += 1.7; // paused for a while
        tr.start();
        run(118);
        tr.stop();
        marks.end = clock.t;
      });

      // --- reference -------------------------------------------------------------------------
      const sec = (tick) => refSeconds(tempo, tick);
      const swung = (tick) => (tick >= swingFrom && tick < swingTo ? refSwing(tick, 0.64, 480) : tick);
      const first = marks.starts[0];
      // Count-in: two bars of 4/4 at 96 bpm before bar 0.
      const beat = 60 / 96;
      const ci = marks.countIn || [];
      let ciWorst = 0;
      for (let i = 0; i < ci.length; i++) ciWorst = Math.max(ciWorst, Math.abs(ci[i] - (0.0507 + i * beat)));
      check('count-in: two bars of beats, then bar 1 exactly two bars after the start', ci.length === 8 && ciWorst < 1e-9 && Math.abs(log[0].time - (0.0507 + 8 * beat)) < 1e-9 && log[0].tick === 0, `${ci.length} count-in beats, worst ${ciWorst.toExponential(2)} s, first event at ${log[0].time.toFixed(6)} s (tick ${log[0].tick})`);
      report.info['count-in start event'] = JSON.stringify(first);

      // Walk the log and compare every gap between consecutive events with the reference.
      const loopStart = B(34), loopEnd = B(36);
      let worstGap = 0, gapAt = '', wraps = 0, sumRef = 0, n = 0;
      const upTo = marks.beforeSeek;
      for (let i = 1; i < upTo; i++) {
        const a = log[i - 1], b = log[i];
        let expected;
        if (b.tick > a.tick) expected = sec(swung(b.tick)) - sec(swung(a.tick));
        else { wraps++; expected = sec(loopEnd) - sec(a.tick) + sec(b.tick) - sec(loopStart); }
        const got = b.time - a.time;
        sumRef += expected; n++;
        if (Math.abs(got - expected) > worstGap) { worstGap = Math.abs(got - expected); gapAt = `tick ${a.tick} -> ${b.tick}: ${got.toFixed(7)} vs ${expected.toFixed(7)}`; }
      }
      const driftRef = log[upTo - 1].time - log[0].time - sumRef;
      check('tempo ramps, steps, meter changes and swing match the integrated reference', worstGap < 2e-7 && n > 600, `worst gap error ${worstGap.toExponential(2)} s over ${n} gaps (${gapAt})`);
      check('no drift against the reference over the whole passage', Math.abs(driftRef) < 2e-6, `${driftRef.toExponential(2)} s after ${(log[upTo - 1].time - log[0].time).toFixed(1)} s`);
      check('the loop wraps four times, seamlessly, then plays on', wraps === 4 && marks.loops === 4, `${wraps} wraps in the event log`);
      // A wrap is seamless when the gap across it is one grid step at the loop's tempo: covered by the
      // gap check above (the wrap gaps use loopEnd/loopStart); state it by itself as well.
      {
        let w = 0;
        for (let i = 1; i < upTo; i++) if (log[i].tick < log[i - 1].tick) w = Math.max(w, Math.abs(log[i].time - log[i - 1].time - 240 * (60 / (PPQ * 120))));
        check('the gap across a loop wrap is exactly one grid step', w < 1e-9, `${w.toExponential(2)} s`);
      }

      // Seek: playback continues from the new place at the time the seek event names.
      const afterSeek = log.slice(marks.beforeSeek).filter((e) => e.time >= marks.seek.time - 1e-9 && e.tick >= B(3) && e.tick < B(12));
      const stale = log.slice(0, marks.beforeSeek).filter((e) => e.time >= marks.seek.time).length;
      const s0 = afterSeek[0];
      let seekWorst = 0;
      for (let i = 1; i < Math.min(afterSeek.length, 200); i++) {
        if (afterSeek[i].tick <= afterSeek[i - 1].tick) break;
        seekWorst = Math.max(seekWorst, Math.abs(afterSeek[i].time - afterSeek[i - 1].time - (sec(afterSeek[i].tick) - sec(afterSeek[i - 1].tick))));
      }
      check('seek while playing: the new place starts exactly at the seek time and keeps the grid', !!s0 && s0.tick === B(3) && Math.abs(s0.time - marks.seek.time) < 1e-9 && seekWorst < 2e-7, s0 ? `first event tick ${s0.tick} at ${s0.time.toFixed(6)} s (seek at ${marks.seek.time.toFixed(6)} s), worst gap error ${seekWorst.toExponential(2)} s` : 'no event after the seek');
      report.info['events already scheduled when seek was called (their owner must cancel them)'] = stale;

      // Pause / resume: the place is kept to the tick.
      const resume = marks.starts[1];
      const afterResume = log.slice(marks.beforePause).filter((e) => e.time >= resume.time - 1e-9);
      const r0 = afterResume[0];
      const expectedFirst = Math.ceil(marks.pausedAt / 240 - 1e-9) * 240;
      const expectedTime = resume.time + (sec(expectedFirst) - sec(marks.pausedAt));
      check('pause keeps the position, resume continues from it', Math.abs(resume.tick - marks.pausedAt) < 1e-6 && !!r0 && r0.tick === expectedFirst && Math.abs(r0.time - expectedTime) < 2e-7, r0 ? `paused at tick ${marks.pausedAt.toFixed(2)}, resumed at tick ${resume.tick.toFixed(2)}; next event tick ${r0.tick} at ${r0.time.toFixed(6)} s, expected ${expectedTime.toFixed(6)} s` : 'no event after resume');

      // And all of it is in the audio where the Transport said.
      const wanted = log.map((e) => e.time).filter((t) => t < total - 0.01).sort((a, b) => a - b);
      const cmp = compare(wanted, findImpulses(r.samples, sampleRate));
      check('ramps / loop / seek / resume: every event is in the output at its time', cmp.missing === 0 && cmp.extra === 0 && cmp.worst < 0.002, `${cmp.n}/${wanted.length} found, worst ${ms(cmp.worst)}, jitter ${ms(cmp.jitter)}, drift ${ms(cmp.drift, 5)}`);
      report.info['offline transport passage'] = `${log.length} events, ${marks.end.toFixed(1)} s`;
    }

    // -------------------------------------------------------------------------------------------
    // 3. Offline: the real voices start where they are scheduled
    // -------------------------------------------------------------------------------------------
    for (const rate of [48000, 44100]) {
      const wanted = [];
      const sounds = [];
      const r = await audio.renderOffline({ seconds: 42, sampleRate: rate, reverb: false }, (e) => {
        const kit = new audio.DrumKit(e);
        const guitar = new audio.GuitarSynth({ engine: e });
        const bass = new audio.GuitarSynth({ engine: e, bus: 'bass', tone: 'bass-finger', mono: true });
        for (const set of audio.CLICK_SETS) for (const level of ['accent', 'beat', 'sub']) sounds.push([`click ${set}/${level}`, (t) => audio.playClick(set, level, t, 1, e)]);
        for (const d of ['kick', 'snare', 'sidestick', 'hihatClosed', 'rimshot', 'tomHigh', 'cowbell', 'clap']) sounds.push([`drum ${d}`, (t) => kit.play(d, t, 1)]);
        for (const tone of ['steel', 'nylon', 'clean', 'driven', 'muted']) for (const midi of [45, 64]) sounds.push([`${tone} ${midi}`, (t) => guitar.pluck(midi, t, { tone, velocity: 1, duration: 0.12 })]);
        for (const tone of ['bass-finger', 'bass-pick', 'bass-upright']) sounds.push([tone, (t) => bass.pluck(33, t, { tone, velocity: 1, duration: 0.12 })]);
        for (const voice of ['epiano', 'organ']) sounds.push([`tone ${voice}`, (t) => audio.playTone(57, t, { voice, duration: 0.1, velocity: 1 }, e)]);
        const tr = new audio.Transport({ clock: e.clock, timer: 'manual', bpm: 113 });
        let i = 0;
        // 0.9 s apart and never on a whole sample: every sound has died away before the next.
        tr.scheduleRepeat((time) => {
          if (i >= sounds.length) return;
          wanted.push({ time, name: sounds[i][0] });
          sounds[i++][1](time);
        }, Math.round((0.9 * 113 * PPQ) / 60) + 1);
        tr.start({ at: 0.0503 });
        tr.advanceTo(41.5);
      });
      const onsets = audio.findOnsets(r.samples, rate, 0.006, 0.08).map((i) => i / rate);
      let worst = 0, worstName = '', matched = 0;
      for (const w of wanted) {
        let best = Infinity;
        for (const o of onsets) if (Math.abs(o - w.time) < Math.abs(best)) best = o - w.time;
        if (Math.abs(best) < 0.01) matched++;
        if (Math.abs(best) > worst) { worst = Math.abs(best); worstName = w.name; }
      }
      check(`real voices @${rate}: every sound starts within 2 ms of its scheduled time`, matched === wanted.length && wanted.length === sounds.length && worst < 0.002, `${matched}/${wanted.length} sounds, worst ${ms(worst)} (${worstName})`);
    }

    // -------------------------------------------------------------------------------------------
    // 4. Live: real context, real timers, a main thread that stalls
    // -------------------------------------------------------------------------------------------
    const unlocked = await new Promise((resolve) => {
      document.addEventListener('pointerdown', () => resolve(audio.unlockAudio()), { once: true });
      window.__readyForClick = true;
    });
    const ctx = audio.getAudioContext();
    const engine = audio.getEngine();
    const fs = ctx.sampleRate;
    report.info.liveSampleRate = fs;
    check('live context is running', unlocked === true && ctx.state === 'running', ctx.state);

    const recorder = await T.recorder(ctx, engine.output);
    const capture = () => recorder.capture();

    // 4a. Dense metronome (impulses) with tempo and meter changes while the main thread stalls.
    {
      const seconds = long ? 180 : quick ? 12 : 40;
      const fire = impulsePlayer(engine);
      const log = [];
      let minLead = Infinity, lateCount = 0;
      const m = new audio.Metronome({
        tempo: 200, timeSignature: '4/4',
        output: {
          click: (set, level, time) => {
            const lead = time - ctx.currentTime;
            minLead = Math.min(minLead, lead);
            if (lead <= 0) lateCount++;
            const entry = { time, cancelled: false };
            log.push(entry);
            const cancel = fire(time);
            // A click whose source has already started (the master chain looks 6 ms ahead) cannot be
            // taken back any more: it counts as heard.
            return () => { if (ctx.currentTime < time - 0.0065) entry.cancelled = true; cancel(); };
          },
        },
      });
      m.subdivision = 'sixteenth'; // a sixteenth-note run at 200 BPM: 75 ms apart
      const stop = capture();
      // The first click now comes 20 ms after start(): give the capture a moment first, so that click
      // is inside the window the comparison below looks at.
      await sleep(100);
      const t0 = performance.now();
      m.start();
      const rand = rng(99);
      const script = [
        [0.12, () => m.setTempo(120)], [0.2, () => { m.subdivision = 'swing'; }], [0.3, () => m.setTimeSignature('7/8')], [0.42, () => m.setTempo(168)],
        [0.52, () => { m.setTimeSignature('5/4'); m.subdivision = 'triplet'; }], [0.63, () => m.setTempo(96)], [0.72, () => { m.setTimeSignature('6/8'); m.subdivision = 'eighth'; }],
        [0.82, () => { m.setTimeSignature('4/4'); m.subdivision = 'sixteenth'; m.setTempo(200); }],
      ];
      let next = 0, stalls = 0, longestStall = 0;
      while ((performance.now() - t0) / 1000 < seconds) {
        const frac = (performance.now() - t0) / 1000 / seconds;
        while (next < script.length && script[next][0] <= frac) script[next++][1]();
        await sleep(40 + rand() * 120);
        // Stalls of 20..100 ms: inside the look-ahead, so they must not be heard at all.
        if (rand() < 0.5) { const d = 20 + rand() * 80; stall(d); stalls++; longestStall = Math.max(longestStall, d); }
      }
      const stopAt = ctx.currentTime;
      m.stop();
      await sleep(400);
      const cap = stop();
      m.dispose();
      const capEnd = (cap.start + cap.samples.length) / fs;
      const found = findImpulses(cap.samples, fs, cap.start);
      const wanted = log.filter((c) => !c.cancelled && c.time > cap.start / fs + 0.02 && c.time < capEnd - 0.02).map((c) => c.time).sort((a, b) => a - b);
      const cmp = compare(wanted, found);
      const cancelledCount = log.filter((c) => c.cancelled).length;
      const afterStop = found.filter((t) => t > stopAt + 0.005).length;
      report.info['live metronome'] = `${wanted.length} clicks in ${seconds} s, ${stalls} main-thread stalls up to ${longestStall.toFixed(0)} ms, smallest scheduling lead ${ms(minLead, 1)}, ${cancelledCount} clicks cancelled by restarts and stop, capture gaps ${cap.gaps}`;
      report.info['live recording holes'] = cap.gaps;
      // For a failure: each sound found that nobody asked for, with the nearest click the metronome logged.
      const strays = found.filter((t) => !wanted.some((w) => Math.abs(w - t) < 0.01)).map((t) => {
        const near = log.reduce((b, c) => (Math.abs(c.time - t) < Math.abs(b.time - t) ? c : b), log[0]);
        const twins = log.filter((c) => Math.abs(c.time - t) < 0.0005).length;
        return `${t.toFixed(4)} s, ${(t - cap.start / fs).toFixed(3)} s into the capture of ${(capEnd - cap.start / fs).toFixed(3)} s (nearest click ${near ? `${((near.time - t) * 1000).toFixed(2)} ms away, ${near.cancelled ? 'taken back' : 'kept'}, ${twins} clicks logged there` : 'none'})`;
      });
      check('live: every click of a long, changing metronome run is heard, none extra', cmp.missing === 0 && cmp.extra === 0 && cmp.n > seconds * 4, `${cmp.n}/${wanted.length} found, ${cmp.missing} missing, ${cmp.extra} extra${strays.length ? `: ${strays.join('; ')}` : ''}`);
      check('live: every click within 2 ms of its audio-clock time', cmp.worst < 0.002, `worst ${ms(cmp.worst)}, mean offset ${ms(cmp.mean)}`);
      check('live: jitter under 2 ms', cmp.jitter < 0.002, `${ms(cmp.jitter)} (${(cmp.jitter * fs).toFixed(2)} samples)`);
      check('live: no drift', Math.abs(cmp.drift) < 0.0002, `${ms(cmp.drift, 5)} over ${cmp.span.toFixed(0)} s`);
      check('live: nothing was scheduled late, despite the stalls', lateCount === 0 && minLead > 0.005, `smallest lead ${ms(minLead, 1)}, ${lateCount} late`);
      check('live: stop() silences clicks that were already scheduled', afterStop === 0, `${afterStop} clicks heard after stop()`);
    }

    // 4b. The real metronome sounds, each click found by its onset.
    {
      const scheduled = [];
      const m = new audio.Metronome({ tempo: 132, timeSignature: '7/8' });
      m.sound = 'woodblock';
      m.subdivision = 'eighth';
      const off = m.onSchedule(() => undefined);
      const tr = m.transport;
      tr.on('bar', (e) => {
        const spt = 60 / (tr.bpm * PPQ);
        for (const c of m.pattern()) scheduled.push(e.time + c.tick * spt);
      });
      const stop = capture();
      m.start();
      await sleep(quick ? 3000 : 6000);
      const stopAt = ctx.currentTime;
      m.stop();
      await sleep(300);
      const cap = stop();
      off();
      m.dispose();
      const onsets = audio.findOnsets(cap.samples, fs, 0.012, 0.03).map((i) => (cap.start + i) / fs);
      const wanted = scheduled.filter((t) => t < stopAt - 0.01);
      let worst = 0, matched = 0;
      for (const t of wanted) {
        let best = Infinity;
        for (const o of onsets) if (Math.abs(o - t) < Math.abs(best)) best = o - t;
        if (Math.abs(best) < 0.01) matched++;
        worst = Math.max(worst, Math.abs(best));
      }
      check('live: woodblock clicks in 7/8 land within 2 ms', matched === wanted.length && wanted.length >= 12 && worst < 0.002, `${matched}/${wanted.length} clicks, worst ${ms(worst)}`);
      check('live: no click sounds after the metronome is stopped', onsets.filter((o) => o > stopAt + 0.004).length === 0, `${onsets.filter((o) => o > stopAt + 0.004).length} late clicks`);
    }

    // 4c. Loop wrap, seek, pause and resume on the live clock.
    {
      const fire = impulsePlayer(engine);
      const tr = new audio.Transport({ clock: audio.engineClock, bpm: 150 });
      const log = [];
      const cancels = [];
      tr.scheduleRepeat((time, tick) => { log.push({ time, tick }); cancels.push({ time, cancel: fire(time) }); }, 240);
      // What an owner of sounds does on seek and pause: take back what has not sounded. A click whose
      // source has already started (the master chain looks 6 ms ahead) is past recall and counts as heard.
      const dropScheduled = () => {
        const now = ctx.currentTime;
        for (const c of cancels.splice(0)) {
          if (c.time <= now) continue;
          c.cancel();
          if (c.time <= now + 0.0065) continue;
          const i = log.findIndex((l) => l.time === c.time);
          if (i >= 0) log.splice(i, 1);
        }
      };
      tr.on('seek', dropScheduled);
      tr.on('pause', dropScheduled);
      tr.setLoop({ bar: 0 }, { bar: 1 });
      const stop = capture();
      tr.start();
      await sleep(quick ? 2500 : 4200); // several wraps of a one-bar loop (1.6 s)
      const loops = tr.loopCount;
      tr.clearLoop();
      await sleep(500);
      tr.seek({ bar: 8 });
      await sleep(700);
      tr.pause();
      const pausedTick = tr.position().absTick;
      const pauseTime = ctx.currentTime;
      await sleep(600);
      const quietFrom = pauseTime + 0.01, quietTo = ctx.currentTime - 0.01;
      tr.start();
      const resumedTick = tr.position(ctx.currentTime + 1).absTick;
      await sleep(700);
      const endAt = ctx.currentTime;
      tr.stop();
      dropScheduled();
      await sleep(300);
      const cap = stop();
      tr.dispose();
      const found = findImpulses(cap.samples, fs, cap.start);
      const wanted = log.map((l) => l.time).filter((t) => t < endAt).sort((a, b) => a - b);
      const cmp = compare(wanted, found.filter((t) => t < endAt + 0.001));
      const step = (240 * 60) / (150 * PPQ);
      // Gaps between clicks heard: all one grid step, except across the seek and the pause.
      const heard = found.filter((t) => t < endAt);
      let offGrid = 0;
      for (let i = 1; i < heard.length; i++) {
        const gap = heard[i] - heard[i - 1];
        if (Math.abs(gap - step) > 0.0005) offGrid++;
      }
      const inPause = found.filter((t) => t > quietFrom && t < quietTo).length;
      check('live loop: wraps are seamless (every gap is one grid step)', loops >= 1 && offGrid <= 2, `${loops} wraps, ${heard.length} clicks, ${offGrid} gaps off the grid (the seek and the pause)`);
      check('live seek / pause / resume: every click is where it was scheduled, none extra', cmp.missing === 0 && cmp.extra === 0 && cmp.worst < 0.002, `${cmp.n}/${wanted.length} found, ${cmp.extra} extra, worst ${ms(cmp.worst)}`);
      check('live pause: nothing sounds while paused', inPause === 0, `${inPause} clicks during the pause`);
      check('live resume: continues from the paused position', resumedTick >= pausedTick - 1e-6 && resumedTick < pausedTick + 240 * 12, `paused at tick ${pausedTick.toFixed(1)}, a second after resuming at ${resumedTick.toFixed(1)}`);
    }

    // 4d. A backing band is paused, resumed and stopped: silence when it should be silent.
    {
      const C = audio.chordFromIntervals(0, [4, 7], 'C');
      const G = audio.chordFromIntervals(7, [4, 7], 'G');
      const band = new audio.BackingBand();
      band.load([C, G], { style: 'funk', tempo: 110, loop: true, countInBars: 0 });
      await band.prepare();
      const stop = capture();
      band.start();
      await sleep(quick ? 2500 : 4000);
      band.pause();
      const posPaused = band.transport.position().absTick;
      await sleep(250); // releases and the room die away
      const q0 = ctx.currentTime;
      await sleep(500);
      const q1 = ctx.currentTime;
      band.resume();
      await sleep(1200);
      const posAfter = band.transport.position().absTick;
      band.stop();
      await sleep(250);
      const s0 = ctx.currentTime;
      await sleep(400);
      const s1 = ctx.currentTime;
      const cap = stop();
      band.dispose();
      const rmsBetween = (a, b) => {
        const i0 = Math.max(0, Math.round(a * fs) - cap.start), i1 = Math.min(cap.samples.length, Math.round(b * fs) - cap.start);
        let s = 0;
        for (let i = i0; i < i1; i++) s += cap.samples[i] * cap.samples[i];
        return Math.sqrt(s / Math.max(1, i1 - i0));
      };
      const playing = rmsBetween(q0 - 2, q0 - 0.5);
      // (What is left a quarter of a second after the pause is the tail of the room, some 40 dB down.)
      check('live band: pause silences the band, including notes already scheduled', rmsBetween(q0, q1) < playing * 0.04 && playing > 0.02, `rms while playing ${playing.toFixed(4)}, while paused ${rmsBetween(q0, q1).toFixed(5)}`);
      check('live band: resume carries on from the same bar', posAfter > posPaused && posAfter < posPaused + PPQ * 4, `tick ${posPaused.toFixed(0)} -> ${posAfter.toFixed(0)} after 1.2 s`);
      check('live band: stop leaves silence', rmsBetween(s0, s1) < playing * 0.04, `rms after stop ${rmsBetween(s0, s1).toFixed(5)}`);
    }

    return report;
  })();
}

withApp({}, async ({ page, goto, errors }) => {
  await installPageTools(page);
  await goto('home');
  const run = page.evaluate(inPage, { quick, long });
  await page.waitForFunction(() => window.__readyForClick === true, null, { timeout: 300000 });
  await page.mouse.click(8, 8); // the user gesture that unlocks audio
  const report = await run;
  const failed = printChecks(report.checks);
  console.log('\ninfo:', JSON.stringify(report.info, null, 1));
  const audioErrors = errors.filter((e) => /audio|AudioContext|worklet/i.test(e));
  if (audioErrors.length) console.log(`page errors mentioning audio:\n  ${audioErrors.join('\n  ')}`);
  console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
  if (failed || audioErrors.length) process.exitCode = 1;
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
