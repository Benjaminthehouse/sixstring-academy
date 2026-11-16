#!/usr/bin/env node
/**
 * Browser check of the Metronome screen (#metronome). Run: node e2e/metronome.cjs [--quick]
 *
 * Everything is driven through the screen (clicks, typing, keys, drags), and every timing claim is
 * checked twice: against the audio-clock times the metronome scheduled (its `onSchedule` events and
 * every click the screen's session sent to the speakers), and against the engine's real output,
 * recorded sample by sample after the limiter (an AudioWorklet on `getEngine().output`, see
 * e2e/audio-lib.cjs), where each click is found by its onset. Timing assertions use audio-clock
 * times only; anything measured on the wall clock (the lit beat, tap tempo) gets generous limits,
 * because this machine is shared and busy.
 *
 *  desktop  tempo accuracy at 60, 120 and 208 BPM (with a count-in); the lit beat follows what is
 *           heard; a tempo change while running; 7/8 as 3+2+2 and 5/4 accent patterns, with the
 *           louder accent measured in the output; triplets; the speed trainer stepping bar by bar;
 *           silent bars that are silent; flash-only mode; the dial (drag), hold-to-repeat, typing,
 *           tap tempo (key and button), the keyboard, the wake lock; a hidden tab; leaving the
 *           route stops the click at once and the visit is recorded once after a minute of running;
 *           presets and settings survive a reload; screenshots in both themes
 *  phone    sheets open from the tiles and close with Esc, a setting chosen in a sheet applies, no
 *           sideways scroll, screenshots in both themes (and a phone held sideways)
 *
 * --quick shortens the runs and skips the one-minute progress check. Exits non-zero on failure.
 *
 * Two more checks sit beside this one: e2e/metronome-output.cjs measures the real output with its
 * own tap on the audio graph (nothing from the screen's code), and e2e/metronome-layout.cjs keeps
 * the review's layout, toast, keyboard-focus and practice-report fixes from coming back.
 */
const path = require('node:path');
const fs = require('node:fs');
const { withApp, ROOT } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

const quick = process.argv.includes('--quick');
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const info = {};
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
const ms = (s, d = 2) => `${(s * 1000).toFixed(d)} ms`;

/** Installed in the page once the screen is up: listens to the session, records the output. */
function probeSetup() {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const sessions = await import('/src/features/metronome/model/session.ts');
    const P = { audio, sessions, sched: [], clicks: [], shown: [], session: null, rec: null, stopCap: null };
    P.attach = () => {
      const s = sessions.currentSession();
      if (!s || P.session === s) return !!s;
      P.session = s;
      s.onClick((c) => P.clicks.push({ time: c.time, level: c.level, audible: c.audible }));
      s.metronome.onSchedule((b) => P.sched.push({ time: b.time, bar: b.bar, beat: b.beat, level: b.level, tempo: b.tempo, countIn: b.countIn, silent: b.silent, n: b.beatsInBar }));
      return true;
    };
    // The lit beat, as the screen mirrors it, with the audio time being heard at that moment.
    const root = document.querySelector('[data-metronome]');
    P.observe = (el) => {
      if (P.mo) P.mo.disconnect();
      P.mo = new MutationObserver(() => {
        const beat = Number(el.getAttribute('data-beat'));
        if (beat >= 0 && audio.hasEngine()) P.shown.push({ beat, t: audio.audioSoundingNow() });
      });
      P.mo.observe(el, { attributes: true, attributeFilter: ['data-beat'] });
    };
    if (root) P.observe(root);
    P.begin = async () => {
      if (!P.rec) P.rec = await window.__audioTools.recorder(audio.getAudioContext(), audio.getEngine().output);
      P.sched.length = 0;
      P.clicks.length = 0;
      P.shown.length = 0;
      P.stopCap = P.rec.capture();
    };
    /** End a capture: onsets (with their peak level) found in the output, and the logs. */
    P.end = (stopAt) => {
      const cap = P.stopCap();
      const ctx = audio.getAudioContext();
      const fs = ctx.sampleRate;
      const x = cap.samples;
      const all = audio.findOnsets(x, fs, 0.012, 0.03).map((i) => {
        let peak = 0;
        for (let k = i; k < Math.min(x.length, i + Math.round(0.02 * fs)); k++) peak = Math.max(peak, Math.abs(x[k]));
        return { t: (cap.start + i) / fs, peak };
      });
      // A click peaks at 0.1 or more (a soft subdivision included). The room reverb's tail can wobble
      // back over the onset threshold after a long gap (slow tempos): those are not clicks.
      const onsets = all.filter((o) => o.peak >= 0.05);
      const tails = all.filter((o) => o.peak < 0.05).map((o) => `${o.t.toFixed(3)}s/${o.peak.toFixed(3)}`);
      let level = 0;
      for (let k = 0; k < x.length; k++) level = Math.max(level, Math.abs(x[k]));
      return { onsets, tails, from: cap.start / fs, to: (cap.start + x.length) / fs, gaps: cap.gaps, level, state: audio.audioState(), stopAt, sched: P.sched.slice(), clicks: P.clicks.slice(), shown: P.shown.slice() };
    };
    window.__probe = P;
    return P.attach();
  })();
}

/** Match scheduled click times against found onsets: worst error, misses and strays. */
function matchClicks(r, opts = {}) {
  const lo = r.from + 0.02;
  const hi = Math.min(r.to, r.stopAt) - 0.02;
  const wanted = r.clicks.filter((c) => c.audible && c.time > lo && c.time < hi).map((c) => c.time).sort((a, b) => a - b);
  const found = r.onsets.filter((o) => o.t > lo - 0.005 && o.t < hi + 0.005);
  const used = new Set();
  let worst = 0;
  let missing = 0;
  for (const t of wanted) {
    let best = -1;
    for (let k = 0; k < found.length; k++) if (!used.has(k) && (best < 0 || Math.abs(found[k].t - t) < Math.abs(found[best].t - t))) best = k;
    if (best < 0 || Math.abs(found[best].t - t) > (opts.window ?? 0.01)) {
      missing++;
      continue;
    }
    used.add(best);
    worst = Math.max(worst, Math.abs(found[best].t - t));
  }
  const strays = found.filter((_, k) => !used.has(k));
  return { n: wanted.length, missing, extra: strays.length, worst, strays: strays.map((o) => `${o.t.toFixed(3)}s/${o.peak.toFixed(3)}`).join(' ') };
}

/** Least-squares tempo of a list of beat times (one per beat). */
function fittedBpm(times) {
  const n = times.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  times.forEach((t, i) => { sx += i; sy += t; sxx += i * i; sxy += i * t; });
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return 60 / slope;
}

/** Beats (not subdivisions) found in the output: the onset nearest each scheduled beat. */
function heardBeats(r, sched) {
  return sched.map((b) => {
    let best = null;
    for (const o of r.onsets) if (!best || Math.abs(o.t - b.time) < Math.abs(best.t - b.time)) best = o;
    return best && Math.abs(best.t - b.time) < 0.01 ? best : null;
  });
}

async function desktop() {
  await withApp({ size: 'desktop', theme: 'dark' }, async ({ page, goto, errors }) => {
    await installPageTools(page);
    await goto('metronome');
    await page.waitForSelector('[data-metronome]');
    const attached = await page.evaluate(probeSetup);
    check('the screen opens with a session the check can listen to', attached);
    const state = () => page.evaluate(() => {
      const el = document.querySelector('[data-metronome]');
      return { running: el.dataset.running === 'true', bpm: Number(el.dataset.bpm), beat: Number(el.dataset.beat), meter: el.dataset.meter, sub: el.dataset.subdivision, layout: el.dataset.layout };
    });
    const first = await state();
    check('opens ready: stopped, 80 BPM, 4/4, beats only, two panes', !first.running && first.bpm === 80 && first.meter === '4/4' && first.sub === 'none' && first.layout === 'two-pane', JSON.stringify(first));
    check('the primary action is visible without scrolling and says what it does', await page.evaluate(() => {
      const b = document.querySelector('[data-start]');
      const r = b.getBoundingClientRect();
      return b.textContent.trim() === 'Start' && r.bottom <= innerHeight && r.top >= 0;
    }));

    const typeTempo = async (bpm) => {
      await page.click('[data-metronome-tempo]');
      await page.keyboard.press('Control+A');
      await page.keyboard.type(String(bpm));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    };
    const start = async () => {
      if (!(await state()).running) await page.click('[data-start]');
      await page.waitForFunction(() => document.querySelector('[data-metronome]').dataset.running === 'true', null, { timeout: 5000 });
    };
    const stop = async () => {
      if ((await state()).running) await page.click('[data-start]');
      await page.waitForFunction(() => document.querySelector('[data-metronome]').dataset.running === 'false', null, { timeout: 5000 });
    };
    /** Run for `seconds` while recording; returns the probe's capture with the stop time. */
    const run = async (seconds, during) => {
      await page.evaluate(() => window.__probe.begin());
      await start();
      if (during) await during();
      else await page.waitForTimeout(seconds * 1000);
      const stopAt = await page.evaluate(() => window.__probe.audio.audioNow());
      await stop();
      await page.waitForTimeout(350);
      return page.evaluate((t) => window.__probe.end(t), stopAt);
    };
    const realBeats = (r) => r.sched.filter((b) => !b.countIn && b.time < r.stopAt - 0.01);
    const intervals = (list) => list.slice(1).map((b, i) => b.time - list[i].time);

    // --- tempo accuracy at 60, 120 and 208 -------------------------------------------------------------
    const tempoRun = async (bpm, seconds, label) => {
      await typeTempo(bpm);
      const s = await state();
      const r = await run(seconds);
      const beats = realBeats(r);
      const iv = intervals(beats);
      const want = 60 / bpm;
      const worstSched = iv.reduce((w, d) => Math.max(w, Math.abs(d - want)), 0);
      const m = matchClicks(r);
      const heard = heardBeats(r, beats.filter((b) => b.time > r.from + 0.02)).filter(Boolean).map((o) => o.t);
      const measured = heard.length > 2 ? fittedBpm(heard) : 0;
      check(`${label}: the screen shows ${bpm} BPM`, s.bpm === bpm, s.bpm);
      check(`${label}: scheduled beats are exactly ${(want * 1000).toFixed(1)} ms apart on the audio clock`, iv.length >= 3 && worstSched < 1e-6, `${iv.length} intervals, worst error ${ms(worstSched, 6)}`);
      check(`${label}: every click is in the output within 3 ms of its time, none extra`, m.n >= 3 && m.missing === 0 && m.extra === 0 && m.worst < 0.003, `${m.n - m.missing}/${m.n} found, ${m.extra} extra, worst ${ms(m.worst, 3)}, capture holes ${r.gaps}, capture ${r.from.toFixed(2)}-${r.to.toFixed(2)} s peak ${r.level.toFixed(3)}, audio ${r.state}, clicks ${r.clicks.length ? `${r.clicks[0].time.toFixed(2)}-${r.clicks[r.clicks.length - 1].time.toFixed(2)} s` : 'none'}${m.extra ? `, strays ${m.strays}` : ''}${r.tails.length ? `, reverb tails ignored: ${r.tails.join(' ')}` : ''}`);
      check(`${label}: tempo measured in the output is ${bpm} BPM`, Math.abs(measured - bpm) < 0.05, `${measured.toFixed(4)} BPM from ${heard.length} heard beats`);
      return r;
    };

    const r60 = await tempoRun(60, quick ? 5 : 8, '60 BPM');
    // The lit beat agrees with what is heard: at each change, the newest beat already heard is that beat.
    {
      const sched = realBeats(r60);
      // Every scheduled beat, including one heard just as Stop was pressed.
      const everyBeat = r60.sched.filter((b) => !b.countIn);
      let agree = 0, lagWorst = 0;
      for (const s of r60.shown) {
        const heardSoFar = everyBeat.filter((b) => b.time <= s.t + 0.012);
        const last = heardSoFar[heardSoFar.length - 1];
        if (last && last.beat === s.beat) {
          agree++;
          lagWorst = Math.max(lagWorst, s.t - last.time);
        }
      }
      const order = r60.shown.every((s, i) => i === 0 || s.beat === (r60.shown[i - 1].beat + 1) % 4);
      check('the lit beat is the beat being heard (60 BPM)', r60.shown.length >= sched.length - 1 && agree === r60.shown.length && order, `${agree}/${r60.shown.length} changes agree, ${sched.length} beats heard, in order: ${order}`);
      check('the beat lights within 150 ms of being heard (wall clock, generous)', lagWorst < 0.15, `latest ${ms(lagWorst, 1)} after its audio time`);
      const levels = sched.slice(0, 4).map((b) => b.level).join(',');
      check('4/4 accents: strong on 1', levels === 'accent,beat,beat,beat', levels);
    }
    check('the screen is clear when stopped (no lit beat)', (await state()).beat === -1);

    await tempoRun(120, quick ? 3 : 5, '120 BPM');

    // 208 with a one-bar count-in (Sound section).
    await page.getByRole('radio', { name: '1 bar', exact: true }).click();
    const r208 = await tempoRun(208, quick ? 3 : 5, '208 BPM with a count-in');
    {
      const ci = r208.sched.filter((b) => b.countIn);
      const all = r208.sched.filter((b) => b.time < r208.stopAt - 0.01);
      const iv = intervals(all);
      check('count-in: one bar of four clicks before bar 1, in the same tempo', ci.length === 4 && ci.every((b) => b.bar < 0) && all[4] && all[4].bar === 0 && all[4].beat === 0 && iv.every((d) => Math.abs(d - 60 / 208) < 1e-6), `${ci.length} count-in beats, then bar ${all[4] && all[4].bar}`);
    }
    await page.getByRole('radio', { name: 'No count-in', exact: true }).click();

    // --- a tempo change while running --------------------------------------------------------------------
    await typeTempo(100);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const rChange = await run(0, async () => {
      await page.waitForTimeout(2200);
      await page.keyboard.press('Shift+ArrowUp');
      await page.waitForTimeout(2500);
    });
    {
      const s = await state();
      const beats = realBeats(rChange);
      const iv = intervals(beats);
      const a = 0.6, b = 60 / 105;
      const inRange = iv.every((d) => d > b - 1e-6 && d < a + 1e-6);
      const before = iv.filter((d) => Math.abs(d - a) < 1e-6).length;
      const after = iv.filter((d) => Math.abs(d - b) < 1e-6).length;
      const m = matchClicks(rChange);
      check('tempo change while running: Shift+Up goes from 100 to 105', s.bpm === 105, s.bpm);
      check('tempo change while running: beats move from 600 ms to 571 ms apart, no beat doubled or dropped', inRange && before >= 2 && after >= 2 && before + after >= iv.length - 1, `${before} at 100, ${after} at 105, ${iv.length - before - after} in between`);
      check('tempo change while running: the output follows, none missing or extra', m.missing === 0 && m.extra === 0 && m.worst < 0.003, `${m.n - m.missing}/${m.n}, ${m.extra} extra, worst ${ms(m.worst, 3)}${m.extra ? `, strays ${m.strays}` : ''}`);
    }

    // --- odd meters ---------------------------------------------------------------------------------------
    await typeTempo(120);
    await page.click('[data-meter-choice="7/8"]');
    await page.getByRole('radio', { name: /^3\+2\+2/ }).check();
    await page.waitForTimeout(150);
    const r78 = await run(quick ? 4 : 6);
    {
      const s = await state();
      const beats = realBeats(r78);
      const iv = intervals(beats);
      // 3+2+2 eighths at quarter = 120: 750, 500, 500 ms.
      const pattern = beats.map((b) => b.beat).join('');
      const ok = iv.every((d, i) => Math.abs(d - [0.75, 0.5, 0.5][beats[i].beat]) < 1e-6);
      const levels = beats.slice(0, 3).map((b) => b.level).join(',');
      const heard = heardBeats(r78, beats.filter((b) => b.time > r78.from + 0.02));
      const accentPeaks = heard.filter((o, i) => o && beats.filter((b) => b.time > r78.from + 0.02)[i].level === 'accent').map((o) => o.peak);
      const beatPeaks = heard.filter((o, i) => o && beats.filter((b) => b.time > r78.from + 0.02)[i].level === 'beat').map((o) => o.peak);
      const minAccent = Math.min(...accentPeaks), maxBeat = Math.max(...beatPeaks);
      const m = matchClicks(r78);
      check('7/8 as 3+2+2: the screen says so', s.meter === '7/8(3+2+2)', s.meter);
      check('7/8 as 3+2+2: beats 750, 500, 500 ms apart, bar after bar', ok && pattern.startsWith('012012'), `${pattern}`);
      check('7/8 as 3+2+2: strong first beat, then two normal ones', levels === 'accent,beat,beat', levels);
      check('7/8 as 3+2+2: every accent is louder in the output than every plain beat', accentPeaks.length >= 2 && beatPeaks.length >= 3 && minAccent > maxBeat * 1.1, `accents ≥ ${minAccent.toFixed(3)}, beats ≤ ${maxBeat.toFixed(3)}`);
      check('7/8 as 3+2+2: every click in the output on time', m.missing === 0 && m.extra === 0 && m.worst < 0.003, `${m.n - m.missing}/${m.n}, worst ${ms(m.worst, 3)}`);
    }
    await page.click('[data-meter-choice="5/4"]');
    const r54 = await run(quick ? 3 : 4);
    {
      const beats = realBeats(r54);
      const levels = beats.slice(0, 5).map((b) => b.level).join(',');
      check('5/4 (3+2): strong 1, medium 4 where the second group starts', levels === 'accent,beat,beat,medium,beat', levels);
    }
    await page.click('[data-meter-chip="4/4"]');

    // --- a subdivision --------------------------------------------------------------------------------------
    await typeTempo(90);
    await page.click('[data-subdivision="triplet"]');
    const rTrip = await run(quick ? 3 : 4);
    {
      const clicks = rTrip.clicks.filter((c) => c.time < rTrip.stopAt - 0.01);
      const iv = intervals(clicks);
      const want = 60 / 90 / 3;
      const even = iv.every((d) => Math.abs(d - want) < 1e-6);
      const shape = clicks.slice(0, 6).map((c) => c.level).join(',');
      const m = matchClicks(rTrip);
      check('triplets at 90: three clicks a beat, 222 ms apart', even && iv.length >= 9, `${iv.length} intervals`);
      check('triplets: the beat clicks, the two in between are softer', shape === 'accent,sub,sub,beat,sub,sub', shape);
      check('triplets: every click (soft ones too) is in the output on time', m.missing === 0 && m.extra === 0 && m.worst < 0.003, `${m.n - m.missing}/${m.n}, ${m.extra} extra, worst ${ms(m.worst, 3)}`);
    }
    await page.click('[data-subdivision="none"]');

    // --- speed trainer -----------------------------------------------------------------------------------------
    await typeTempo(150);
    await page.getByRole('switch', { name: 'Speed trainer' }).check();
    const setSpin = async (name, value) => {
      const box = page.getByRole('spinbutton', { name, exact: true });
      await box.fill(String(value));
      await box.press('Enter');
    };
    await setSpin('Target', 170);
    await setSpin('Step', 10);
    await setSpin('Every', 1);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const rTrain = await run(0, async () => {
      await page.waitForFunction(() => window.__probe.sched.filter((b) => b.bar >= 4).length > 0, null, { timeout: 20000 }).catch(() => undefined);
    });
    {
      const beats = realBeats(rTrain);
      const perBar = new Map();
      for (const b of beats) if (!perBar.has(b.bar)) perBar.set(b.bar, b.tempo);
      const tempos = [0, 1, 2, 3].map((b) => perBar.get(b));
      const iv = intervals(beats);
      const fits = iv.every((d, i) => Math.abs(d - 60 / beats[i].tempo) < 1e-6);
      const m = matchClicks(rTrain);
      check('speed trainer: 150, 160, 170, then stays at 170', tempos.join(',') === '150,160,170,170', tempos.join(','));
      check('speed trainer: each beat lasts what its bar\'s tempo says', fits, `${iv.length} intervals`);
      check('speed trainer: the output keeps up, every click on time', m.missing === 0 && m.extra === 0 && m.worst < 0.003, `${m.n - m.missing}/${m.n}, worst ${ms(m.worst, 3)}`);
    }
    await page.getByRole('switch', { name: 'Speed trainer' }).uncheck();
    check('switching the trainer off keeps the tempo it reached', (await state()).bpm === 170, (await state()).bpm);

    // --- silent bars --------------------------------------------------------------------------------------------
    await typeTempo(160);
    await page.getByRole('switch', { name: 'Silent bars' }).check();
    await setSpin('Click for', 1);
    await setSpin('Silent for', 1);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    let silentCaption = '';
    const rGap = await run(0, async () => {
      await page.waitForFunction(() => window.__probe.sched.some((b) => b.bar === 1 && b.beat === 2), null, { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      silentCaption = await page.evaluate(() => document.querySelector('[data-phase] [class*="phase"]').textContent);
      await page.waitForFunction(() => window.__probe.sched.some((b) => b.bar === 4), null, { timeout: 10000 }).catch(() => undefined);
    });
    {
      const beats = realBeats(rGap);
      const bar = 60 / 160 * 4;
      const silentBars = [...new Set(beats.filter((b) => b.silent).map((b) => b.bar))];
      const shape = [0, 1, 2, 3].map((n) => beats.some((b) => b.bar === n && b.silent)).join(',');
      const starts = new Map();
      for (const b of beats) if (b.beat === 0) starts.set(b.bar, b.time);
      let inSilence = 0, clicksInSilence = 0, playing = 0;
      for (const n of silentBars) {
        const t0 = starts.get(n);
        if (t0 === undefined || t0 + bar > rGap.stopAt) continue;
        inSilence += rGap.onsets.filter((o) => o.t > t0 - 0.004 && o.t < t0 + bar - 0.004).length;
        clicksInSilence += rGap.clicks.filter((c) => c.time >= t0 - 1e-6 && c.time < t0 + bar - 1e-6).length;
      }
      for (const [n, t0] of starts) if (!silentBars.includes(n) && t0 + bar < rGap.stopAt) playing += rGap.onsets.filter((o) => o.t > t0 - 0.004 && o.t < t0 + bar - 0.004).length;
      check('silent bars (1 on, 1 off): every other bar is silent', shape === 'false,true,false,true', shape);
      check('silent bars: nothing at all is heard in a silent bar', silentBars.length >= 1 && inSilence === 0 && clicksInSilence === 0, `${inSilence} onsets and ${clicksInSilence} clicks in ${silentBars.length} silent bars, ${playing} onsets in the playing bars`);
      check('silent bars: the playing bars still click', playing >= 4, playing);
      check('silent bars: the screen says to keep counting', /Silent bar/.test(silentCaption), silentCaption);
    }
    await page.getByRole('switch', { name: 'Silent bars' }).uncheck();

    // --- flash only ------------------------------------------------------------------------------------------------
    await page.getByRole('switch', { name: 'Flash only, no sound' }).check();
    const rVis = await run(quick ? 2 : 3);
    {
      const audible = rVis.clicks.filter((c) => c.audible).length;
      const onsets = rVis.onsets.filter((o) => o.t < rVis.stopAt).length;
      check('flash only: beats still run and light, nothing is played or heard', rVis.sched.length >= 4 && rVis.shown.length >= 3 && audible === 0 && onsets === 0, `${rVis.sched.length} beats, ${rVis.shown.length} lit, ${audible} audible clicks, ${onsets} onsets`);
    }
    await page.getByRole('switch', { name: 'Flash only, no sound' }).uncheck();

    // --- the dial, hold to repeat, the keyboard, tap tempo ------------------------------------------------------------
    await typeTempo(100);
    {
      const box = await page.locator('[role="slider"][aria-label^="Tempo dial"]').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.45;
      await page.mouse.move(cx, cy - r);
      await page.mouse.down();
      for (let deg = 0; deg <= 90; deg += 6) {
        const a = (deg * Math.PI) / 180;
        await page.mouse.move(cx + r * Math.sin(a), cy - r * Math.cos(a));
      }
      await page.mouse.up();
      const after = (await state()).bpm;
      check('the dial: a quarter turn clockwise is +30 BPM', Math.abs(after - 130) <= 1, `100 -> ${after}`);
      await page.mouse.move(cx, cy - r);
      await page.mouse.down();
      for (let deg = 0; deg >= -60; deg -= 6) {
        const a = (deg * Math.PI) / 180;
        await page.mouse.move(cx + r * Math.sin(a), cy - r * Math.cos(a));
      }
      await page.mouse.up();
      const back = (await state()).bpm;
      check('the dial: turning back slows it down', Math.abs(back - (after - 20)) <= 1, `${after} -> ${back}`);
    }
    await typeTempo(100);
    {
      const plus = page.locator('[data-tempo-step="1"]');
      const b = await plus.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1500);
      await page.mouse.up();
      const held = (await state()).bpm;
      await page.click('[data-tempo-step="-1"]');
      const one = (await state()).bpm;
      check('holding + keeps going faster; one click on - is one BPM', held >= 108 && one === held - 1, `100 -> held ${held} -> ${one}`);
    }
    await typeTempo(100);
    {
      // Click on plain text so no button has focus: the keys then belong to the metronome.
      await page.locator('[data-metronome] [class*="caption"]').first().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('ArrowUp');
      const up1 = (await state()).bpm;
      await page.keyboard.press('Shift+ArrowUp');
      const up5 = (await state()).bpm;
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Shift+ArrowDown');
      const down = (await state()).bpm;
      check('keys: Up +1, Shift+Up +5, Down -1, Shift+Down -5', up1 === 101 && up5 === 106 && down === 100, `${up1}, ${up5}, ${down}`);
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const on = (await state()).running;
      const wake = await page.evaluate(async () => (await import('/src/core/platform/index.ts')).getWakeLockState());
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      const off = (await state()).running;
      const wakeAfter = await page.evaluate(async () => (await import('/src/core/platform/index.ts')).getWakeLockState());
      check('keys: Space starts and stops', on && !off);
      check('the screen is asked to stay awake while running, and let go after', wake.wanted && !wakeAfter.wanted, `running ${JSON.stringify(wake)}, stopped ${JSON.stringify(wakeAfter)}`);
      const accentBefore = await page.getAttribute('[data-beat-pad="1"]', 'data-accent');
      await page.keyboard.press('2');
      const accentAfter = await page.getAttribute('[data-beat-pad="1"]', 'data-accent');
      await page.click('[data-beat-pad="1"]');
      await page.click('[data-beat-pad="1"]');
      const cycled = await page.getAttribute('[data-beat-pad="1"]', 'data-accent');
      await page.click('[data-beat-pad="1"]');
      const restored = await page.getAttribute('[data-beat-pad="1"]', 'data-accent');
      check('key 2 and taps on beat 2 cycle its accent: normal, medium, strong, silent, normal', accentBefore === '1' && accentAfter === '2' && cycled === '0' && restored === '1', `${accentBefore} -> ${accentAfter} -> ${cycled} -> ${restored}`);
      // Tap tempo. The taps' own times are recorded too, so the screen is held to the tempo the taps
      // really had (the check's 500 ms waits stretch on a busy machine), and that has to be near 120.
      const implied = (stamps) => {
        const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).slice(-6);
        const sorted = gaps.slice().sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        const good = gaps.filter((g) => g > median * 0.6 && g < median * 1.6);
        return 60000 / (good.reduce((a, b) => a + b, 0) / good.length);
      };
      await page.evaluate(() => {
        window.__taps = [];
        window.addEventListener('keydown', (e) => { if (e.key === 't') window.__taps.push(e.timeStamp); }, { capture: true });
        document.querySelector('[data-tap]').addEventListener('pointerdown', (e) => window.__taps.push(e.timeStamp), { capture: true });
        document.activeElement && document.activeElement.blur();
      });
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('t');
        if (i < 7) await page.waitForTimeout(500);
      }
      const keyTaps = await page.evaluate(() => window.__taps.splice(0));
      const tapped = (await state()).bpm;
      const keyWant = implied(keyTaps);
      check('tap tempo (T key, 8 taps about 500 ms apart) converges on the tapped tempo', keyTaps.length === 8 && Math.abs(tapped - keyWant) <= 1 && Math.abs(keyWant - 120) <= 15, `screen ${tapped} BPM, taps were ${keyWant.toFixed(1)} BPM`);
      // In the page, on a precise schedule: 400 ms apart is 150 BPM.
      await page.waitForTimeout(2300);
      await page.evaluate(() => new Promise((resolve) => {
        const el = document.querySelector('[data-tap]');
        const t0 = performance.now();
        let i = 0;
        const fire = () => {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true }));
          if (++i >= 7) return resolve();
          setTimeout(fire, Math.max(0, t0 + i * 400 - performance.now()));
        };
        fire();
      }));
      const btnTaps = await page.evaluate(() => window.__taps.splice(0));
      const tapped2 = (await state()).bpm;
      const btnWant = implied(btnTaps);
      check('tap tempo (button, 7 taps 400 ms apart) converges on 150 BPM', btnTaps.length === 7 && Math.abs(tapped2 - btnWant) <= 1 && Math.abs(tapped2 - 150) <= 4, `screen ${tapped2} BPM, taps were ${btnWant.toFixed(1)} BPM`);
    }

    // --- a hidden tab -----------------------------------------------------------------------------------------------------
    // Headless Chromium keeps a page "visible" whatever is in front, so the hidden tab is emulated:
    // the page reports itself hidden (the transport then schedules 1.5 s ahead) and the main thread
    // only gets to run its timers about once a second, as a background tab's timers do.
    await typeTempo(120);
    {
      const rHidden = await run(0, async () => {
        await page.waitForTimeout(800);
        await page.evaluate(async () => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          for (let i = 0; i < 4; i++) {
            const end = performance.now() + 950;
            while (performance.now() < end) { /* a background tab's timers sleep */ }
            await new Promise((r) => setTimeout(r, 50));
          }
          delete document.hidden;
          delete document.visibilityState;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(400);
      });
      const m = matchClicks(rHidden);
      const iv = intervals(realBeats(rHidden));
      info['hidden tab'] = 'emulated (document.hidden + timers running once a second); a real background tab was not available in headless Chromium';
      check('hidden tab (emulated, timers once a second): the click carries on, every click on time', m.missing === 0 && m.extra === 0 && m.n >= 8 && iv.every((d) => Math.abs(d - 0.5) < 1e-6), `${m.n - m.missing}/${m.n}, ${m.extra} extra, worst ${ms(m.worst, 3)}`);
    }

    // --- a long steady run (and enough running time for the visit to count) -----------------------------------------------
    const elapsedSoFar = await page.evaluate(() => window.__probe.session.time().visitSec);
    const longFor = quick ? 6 : Math.max(10, 64 - elapsedSoFar);
    await typeTempo(132);
    await page.click('[data-subdivision="eighth"]');
    const rLong = await run(longFor);
    {
      const beats = realBeats(rLong);
      const m = matchClicks(rLong);
      const heard = heardBeats(rLong, beats.filter((b) => b.time > rLong.from + 0.02)).filter(Boolean).map((o) => o.t);
      const measured = fittedBpm(heard);
      check(`${longFor.toFixed(0)} s at 132 with eighths: every click on time, no drift`, m.missing === 0 && m.extra === 0 && m.worst < 0.003 && Math.abs(measured - 132) < 0.02, `${m.n - m.missing}/${m.n}, worst ${ms(m.worst, 3)}, measured ${measured.toFixed(4)} BPM`);
    }

    // --- leaving the route ---------------------------------------------------------------------------------------------------
    await page.evaluate(() => window.__probe.begin());
    await start();
    await page.waitForTimeout(1500);
    // The moment the screen let go of the click, on the audio clock (the route change itself takes
    // a moment on a busy machine: the next screen is loaded and drawn first).
    const leftAt = await page.evaluate(() => {
      const P = window.__probe;
      // Leaving records the visit, and the shell answers with an interface sound: listen to the click only.
      P.audio.setBusMuted('ui', true);
      P.stoppedAt = null;
      const off = P.session.onRunning((r) => {
        if (!r && P.stoppedAt === null) P.stoppedAt = P.audio.audioNow();
      });
      P.offStopped = off;
      const t = P.audio.audioNow();
      location.hash = '#tools';
      return t;
    });
    await page.waitForTimeout(900);
    const stoppedAt = await page.evaluate(() => window.__probe.stoppedAt);
    const rLeave = await page.evaluate((t) => {
      const r = window.__probe.end(t);
      window.__probe.audio.setBusMuted('ui', false);
      return r;
    }, leftAt);
    {
      const late = stoppedAt === null ? -1 : rLeave.onsets.filter((o) => o.t > stoppedAt + 0.03).length;
      const gone = await page.evaluate(() => window.__probe.sessions.currentSession() === null);
      check('leaving the screen stops the click at once (nothing heard 30 ms after it goes)', stoppedAt !== null && late === 0 && rLeave.onsets.length >= 2 && stoppedAt - leftAt < 2, `${late} clicks after, ${rLeave.onsets.length} before; the route change took ${stoppedAt === null ? '?' : ms(stoppedAt - leftAt, 0)}`);
      check('leaving the screen lets go of the session', gone);
    }
    const visit = await page.evaluate(async () => {
      const p = await import('/src/core/progress/index.ts');
      await new Promise((r) => setTimeout(r, 300));
      return { visitSec: window.__probe.session.time().visitSec, log: p.getProgress().log.filter((e) => e.kind === 'metronome') };
    });
    if (!quick) check('a visit with a minute of running is recorded once, with its practice time', visit.log.length === 1 && visit.log[0].durationSec >= 60, `${visit.log.length} entries, ${JSON.stringify(visit.log[0] || {})}, ran ${visit.visitSec.toFixed(0)} s`);
    else info['progress'] = `skipped with --quick (ran ${visit.visitSec.toFixed(0)} s, ${visit.log.length} entries)`;

    // --- presets and reload ---------------------------------------------------------------------------------------------------
    await page.evaluate(() => { location.hash = '#metronome'; });
    await page.waitForSelector('[data-metronome]');
    await page.waitForTimeout(300);
    await page.click('[data-preset="builtin-ballad-68"]');
    await page.waitForTimeout(150);
    const ballad = await state();
    check('a built-in preset applies in one tap (6/8 ballad)', ballad.meter === '6/8' && ballad.bpm === 46 && ballad.sub === 'eighth', JSON.stringify(ballad));
    await typeTempo(97);
    await page.click('[data-meter-choice="7/8"]');
    await page.getByRole('radio', { name: /^2\+3\+2/ }).check();
    await page.getByLabel('Save this setup as').fill('E2E groove');
    await page.getByRole('button', { name: 'Save preset' }).click();
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-metronome]');
    await page.waitForTimeout(500);
    const after = await state();
    const mine = page.locator('[data-preset^="p-"]', { hasText: 'E2E groove' });
    const presetThere = await mine.count();
    check('after a reload: tempo, time signature, grouping and subdivision are as left', after.bpm === 97 && after.meter === '7/8(2+3+2)' && after.sub === 'eighth' && !after.running, JSON.stringify(after));
    check('after a reload: the saved preset is there and marked as the current setup', presetThere === 1 && (await mine.getAttribute('aria-pressed')) === 'true');
    await page.click('[data-preset="builtin-slow-60"]');
    await mine.click();
    const recalled = await state();
    check('recalling a saved preset brings its setup back in one tap', recalled.bpm === 97 && recalled.meter === '7/8(2+3+2)', JSON.stringify(recalled));
    await page.click('[data-preset="builtin-slow-60"]');

    // --- screenshots --------------------------------------------------------------------------------------------------------------
    for (const theme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(() => window.scrollTo(0, 0));
      await start();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `metronome-desktop-${theme}.png`) });
      await stop();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('desktop: no sideways scroll', overflow <= 1, `${overflow}px`);
    check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  });
}

async function phone() {
  await withApp({ mobile: true, theme: 'light' }, async ({ page, goto, errors }) => {
    await goto('metronome');
    await page.waitForSelector('[data-metronome]');
    const layout = await page.getAttribute('[data-metronome]', 'data-layout');
    check('phone: one column', layout === 'column', layout);
    const zone = await page.evaluate(() => {
      const start = document.querySelector('[data-start]').getBoundingClientRect();
      const dial = document.querySelector('[role="slider"][aria-label^="Tempo dial"]').getBoundingClientRect();
      // Visible means above the tab bar, not just inside the window (review: Start once sat under it).
      const nav = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).find((r) => r.height > 0 && r.top > innerHeight / 2);
      return { startTop: start.top, startBottom: start.bottom, dialMid: dial.top + dial.height / 2, h: innerHeight, navTop: nav ? nav.top : innerHeight };
    });
    check('phone: Start and the tempo dial sit in the lower part of the screen, Start fully visible above the tab bar', zone.startBottom <= zone.navTop && zone.startTop > zone.h * 0.7 && zone.dialMid > zone.h * 0.45, JSON.stringify(zone));
    const targets = await page.evaluate(() => [...document.querySelectorAll('[data-metronome] button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, t: b.getAttribute('aria-label') || b.textContent.trim() }; }).filter((r) => r.h < 43.5 || r.w < 43.5));
    // Chips are 36 px tall with a 44 px hit area (UI kit), so only fully small controls are a problem.
    const tooSmall = targets.filter((t) => t.h < 30 || t.w < 30);
    check('phone: touch targets are big enough', tooSmall.length === 0, tooSmall.map((t) => `${t.t} ${t.w.toFixed(0)}x${t.h.toFixed(0)}`).join(', '));

    await page.screenshot({ path: path.join(OUT, 'metronome-phone-light.png') });
    await page.click('[data-sheet="rhythm"]');
    await page.waitForSelector('[role="dialog"]');
    await page.click('[role="dialog"] [data-subdivision="eighth"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'metronome-phone-sheet-rhythm.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 }).catch(() => undefined);
    const closed = (await page.locator('[role="dialog"]').count()) === 0;
    check('phone: a sheet opens from its tile, its choice applies, Esc closes it', closed && (await page.getAttribute('[data-metronome]', 'data-subdivision')) === 'eighth');
    for (const id of ['sound', 'practice', 'presets']) {
      await page.click(`[data-sheet="${id}"]`);
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `metronome-phone-sheet-${id}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 }).catch(() => undefined);
    }
    await page.click('[data-meter-chip="more"]');
    await page.waitForSelector('[role="dialog"]');
    await page.click('[role="dialog"] [data-meter-choice="7/8"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'metronome-phone-sheet-meter.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('phone: More opens every time signature; 7/8 applies', (await page.getAttribute('[data-metronome]', 'data-meter')) === '7/8');
    await page.click('[data-meter-chip="4/4"]');
    await page.click('[data-start]');
    await page.waitForTimeout(1300);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'metronome-phone-dark.png') });
    await page.click('[data-start]');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: no sideways scroll', overflow <= 1, `${overflow}px`);
    // Sideways.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    const side = await page.evaluate(() => {
      const el = document.querySelector('[data-metronome]');
      const start = document.querySelector('[data-start]').getBoundingClientRect();
      return { layout: el.dataset.layout, startBottom: start.bottom, h: innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    await page.screenshot({ path: path.join(OUT, 'metronome-phone-sideways.png') });
    check('phone sideways: dial beside the controls, Start on screen, no sideways scroll', side.layout === 'sideways' && side.startBottom <= side.h + 1 && side.overflow <= 1, JSON.stringify(side));
    check('phone: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  });
}

(async () => {
  const t0 = Date.now();
  try {
    await desktop();
    await phone();
  } catch (e) {
    check('the check ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' / ') : String(e));
  }
  const failed = printChecks(checks);
  for (const [k, v] of Object.entries(info)) console.log(`info ${k}: ${v}`);
  console.log(`screenshots: e2e/out/metronome-*.png  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(failed ? `FAILED (${failed} of ${checks.length})` : `PASSED (${checks.length} checks)`);
  process.exit(failed ? 1 : 0);
})();
