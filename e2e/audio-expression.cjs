#!/usr/bin/env node
/**
 * Expressive guitar, measured. Run: node e2e/audio-expression.cjs   (--wav also writes the renders
 * to e2e/out/audio-expression-*.wav, to listen to)
 *
 * Renders the real engine graph to an OfflineAudioContext in Chromium and measures what comes out:
 *
 *  bends        pitch follows the curve to a whole tone up (and back for a release), held within 3 cents
 *  vibrato      sharp-only wobble about 30 cents wide at about 5.5 Hz
 *  hammer-on    the pitch steps on the beat (within 4 ms), no new pick click, softer than a picked note,
 *               and the string does not drop out; a pull-off lands on its pitch
 *  slide        glides through the frets in between and lands on the new note, no new attack
 *  accent       an accented strum is about 3 dB louder
 *  phrases      "5b7" and "5h7" as a lesson sound plays them (tabPhrase + playPhrase)
 *  song         a SongPlayer playing "3:5b2" and "3:7h" through the voice; its first-beat time
 *  drone        starts and stops where it was scheduled
 *  line + chord the chord keeps ringing under the line
 *  live         the metronome's first click comes 20 ms after Start (not 80); a backing band changes
 *               style while playing without stopping or dropping out
 *
 * Exits non-zero if any check fails.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withApp } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

const wantWav = process.argv.includes('--wav');

function inPage({ wantWav }) {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const songs = await import('/src/core/song/index.ts');
    const T = window.__audioTools;
    const report = { checks: [], info: {}, wavs: {} };
    const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    const fmt = (n, d = 1) => Number(n).toFixed(d);
    const FS = 48000;
    const render = (seconds, build) => audio.renderOffline({ seconds, sampleRate: FS, reverb: false }, build);
    const synth = (e) => new audio.GuitarSynth({ engine: e });
    const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    /** Pitch at time t (seconds), in cents from `midi`, over a window of `win` seconds centred there. */
    const pitchAt = (x, t, midi, win = 0.03, lo = 0.75, hi = 1.6) => {
      const len = Math.round(win * FS);
      const start = Math.max(0, Math.round(t * FS - len / 2));
      const est = audio.estimatePitch(x, FS, { start, length: len, minHz: hz(midi) * lo, maxHz: hz(midi) * hi });
      return est ? audio.centsFromMidi(est.hz, midi) : NaN;
    };
    const rms = (x, a, b) => audio.rmsOf(x, Math.round(a * FS), Math.round(b * FS));
    const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
    /** Level of the highs (above 4 kHz): a pick's click lives there. */
    const highs = (x, a, b) => {
      const y = x.slice(Math.round(a * FS), Math.round(b * FS));
      audio.biquadFilter(y, audio.biquadCoeffs({ type: 'highpass', freq: 4000, q: 0.7 }, FS));
      audio.biquadFilter(y, audio.biquadCoeffs({ type: 'highpass', freq: 4000, q: 0.7 }, FS));
      return audio.rmsOf(y, 0, y.length);
    };
    const keep = (name, x) => {
      if (!wantWav) return;
      const bytes = audio.encodeWav(x, FS);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      report.wavs[name] = btoa(bin);
    };

    // -----------------------------------------------------------------------------------------
    // Bends
    // -----------------------------------------------------------------------------------------
    {
      const t0 = 0.1;
      const r = await render(1.8, (e) => { synth(e).pluck(60, t0, { string: 3, duration: 1.4, bend: 2 }); });
      keep('bend', r.samples);
      const curve = audio.pitchCurve({ bend: 2 }, 1.4);
      let worst = 0, worstAt = 0;
      for (let t = 0.06; t <= 0.5; t += 0.01) {
        const got = pitchAt(r.samples, t0 + t, 60, 0.02);
        let want = 0;
        for (let k = -10; k <= 10; k++) want += curve.at(t + k * 0.001) / 21;
        if (Math.abs(got - want) > worst) { worst = Math.abs(got - want); worstAt = t; }
      }
      const held = [0.6, 0.8, 1.0, 1.2].map((t) => pitchAt(r.samples, t0 + t, 60, 0.04));
      const heldErr = Math.max(...held.map((c) => Math.abs(c - 200)));
      const start = pitchAt(r.samples, t0 + 0.012, 60, 0.012);
      check('bend: struck at the fretted pitch', Math.abs(start) < 6, `${fmt(start, 2)} cents at the pick`);
      check('bend: the pitch follows the bend curve as it rises', worst < 12, `worst ${fmt(worst, 1)} cents from the curve (at ${fmt(worstAt * 1000, 0)} ms)`);
      check('bend: holds a whole tone up, within 3 cents', heldErr < 3, held.map((c) => fmt(c, 2)).join(', ') + ' cents');

      const rr = await render(1.8, (e) => { synth(e).pluck(60, t0, { string: 3, duration: 1.4, bend: { amount: 2, release: true } }); });
      keep('bend-release', rr.samples);
      const top = pitchAt(rr.samples, t0 + 0.45, 60, 0.04);
      const back = pitchAt(rr.samples, t0 + 1.3, 60, 0.04);
      check('bend and release: up a whole tone, then back to the fretted pitch', Math.abs(top - 200) < 3 && Math.abs(back) < 3, `top ${fmt(top, 2)}, back ${fmt(back, 2)} cents`);

      const rp = await render(1.2, (e) => { synth(e).pluck(60, t0, { string: 3, duration: 0.9, bend: { amount: 1, pre: true } }); });
      const pre = pitchAt(rp.samples, t0 + 0.2, 60, 0.04);
      check('pre-bend: sounds bent from the start', Math.abs(pre - 100) < 3, `${fmt(pre, 2)} cents`);
    }

    // -----------------------------------------------------------------------------------------
    // Vibrato
    // -----------------------------------------------------------------------------------------
    {
      const t0 = 0.1;
      const r = await render(2.4, (e) => { synth(e).pluck(57, t0, { string: 3, duration: 2.1, vibrato: true }); });
      keep('vibrato', r.samples);
      const track = [];
      for (let t = 0.6; t <= 1.9; t += 0.005) track.push(pitchAt(r.samples, t0 + t, 57, 0.024));
      const min = Math.min(...track), max = Math.max(...track);
      let peaks = 0;
      for (let i = 1; i < track.length - 1; i++) if (track[i] > track[i - 1] && track[i] >= track[i + 1] && track[i] > min + (max - min) * 0.6) peaks++;
      const rate = peaks / 1.3;
      check('vibrato: about 30 cents wide, sharp only', max - min > 20 && max - min < 38 && min > -5, `${fmt(min, 1)} .. ${fmt(max, 1)} cents`);
      check('vibrato: about 5.5 cycles a second', rate > 4.6 && rate < 6.4, `${fmt(rate, 2)} Hz`);
    }

    // -----------------------------------------------------------------------------------------
    // Hammer-on, pull-off, slide: one string carried on
    // -----------------------------------------------------------------------------------------
    {
      const t0 = 0.1, t1 = 0.6;
      const two = (second) => render(1.6, (e) => {
        const g = synth(e);
        g.pluck(60, t0, { string: 3, duration: t1 - t0 });
        g.pluck(62, t1, { string: 3, duration: 0.8, ...second });
      });
      const hammer = await two({ legato: 'hammer' });
      const picked = await two({});
      keep('hammer-on', hammer.samples);
      const before = pitchAt(hammer.samples, 0.45, 60, 0.04);
      const after = pitchAt(hammer.samples, 0.8, 62, 0.04);
      check('hammer-on: C4, then D4 in tune', Math.abs(before) < 3 && Math.abs(after) < 3, `${fmt(before, 2)} / ${fmt(after, 2)} cents`);
      let cross = NaN;
      for (let t = t1 - 0.02; t <= t1 + 0.02; t += 0.0005) {
        if (pitchAt(hammer.samples, t, 60, 0.006, 0.8, 1.4) > 100) { cross = t; break; }
      }
      check('hammer-on: the pitch steps on the beat', Math.abs(cross - t1) < 0.004, `${fmt((cross - t1) * 1000, 2)} ms from the beat`);
      const hiH = highs(hammer.samples, t1, t1 + 0.012), hiP = highs(picked.samples, t1, t1 + 0.012);
      check('hammer-on: no pick click (the highs of the attack well under a pick stroke)', db(hiH) < db(hiP) - 6, `${fmt(db(hiH) - db(hiP), 1)} dB against a picked note`);
      const lvH = rms(hammer.samples, t1, t1 + 0.06), lvP = rms(picked.samples, t1, t1 + 0.06), lvBefore = rms(hammer.samples, t1 - 0.06, t1);
      check('hammer-on: softer than picking the note', db(lvH) < db(lvP) - 2, `${fmt(db(lvH) - db(lvP), 1)} dB against a picked note`);
      // The string carries on (it never drops out under the note before), and the finger's attack
      // sits between the ringing string and a fresh pick stroke.
      check('hammer-on: the string carries on (no drop-out), the new attack between the ringing note and a pick', db(lvH) > db(lvBefore) - 3 && db(lvH) < db(lvP) - 2,
        `${fmt(db(lvH) - db(lvBefore), 1)} dB over the ringing note, ${fmt(db(lvH) - db(lvP), 1)} dB under a pick`);
      // ... and it rings on as a note, not a blip: 0.3 s later it is still above the old note's decay.
      const lvLater = rms(hammer.samples, t1 + 0.3, t1 + 0.36), lvOld = rms(picked.samples, t1 - 0.06, t1);
      check('hammer-on: the hammered note rings on', db(lvLater) > db(lvOld) - 3, `${fmt(db(lvLater) - db(lvOld), 1)} dB 0.3 s later against the note before the hammer`);

      const pull = await render(1.6, (e) => {
        const g = synth(e);
        g.pluck(62, t0, { string: 3, duration: t1 - t0 });
        g.pluck(60, t1, { string: 3, duration: 0.8, legato: 'pull' });
      });
      keep('pull-off', pull.samples);
      const pulled = pitchAt(pull.samples, 0.8, 60, 0.04);
      check('pull-off: lands on C4 in tune', Math.abs(pulled) < 3, `${fmt(pulled, 2)} cents`);

      const slide = await render(1.6, (e) => {
        const g = synth(e);
        g.pluck(60, t0, { string: 3, duration: t1 - t0 });
        g.pluck(64, t1, { string: 3, duration: 0.8, legato: 'slide' });
      });
      const slidePicked = await render(1.6, (e) => {
        const g = synth(e);
        g.pluck(60, t0, { string: 3, duration: t1 - t0 });
        g.pluck(64, t1, { string: 3, duration: 0.8 });
      });
      keep('slide', slide.samples);
      const s0 = pitchAt(slide.samples, 0.42, 60, 0.04);
      const mid = pitchAt(slide.samples, t1 - 0.05, 60, 0.012, 0.8, 1.6);
      const s1 = pitchAt(slide.samples, 0.8, 64, 0.04);
      check('slide: from C4 it passes through the frets between and lands on E4', Math.abs(s0) < 3 && mid > 60 && mid < 340 && Math.abs(s1) < 3, `${fmt(s0, 1)} cents, ${fmt(mid, 0)} cents mid-slide, then ${fmt(s1, 2)} cents from E4`);
      const hiS = highs(slide.samples, t1, t1 + 0.012), hiSP = highs(slidePicked.samples, t1, t1 + 0.012);
      check('slide: no new attack where it lands', db(hiS) < db(hiSP) - 6, `${fmt(db(hiS) - db(hiSP), 1)} dB of highs against a picked note`);
    }

    // -----------------------------------------------------------------------------------------
    // Accents
    // -----------------------------------------------------------------------------------------
    {
      const E = [40, 47, 52, 56, 59, 64];
      const plain = await render(0.8, (e) => { synth(e).strum(E, 0.1, { velocity: 0.7 }); });
      const accented = await render(0.8, (e) => { synth(e).strum(E, 0.1, { velocity: 0.7, accent: true }); });
      const diff = db(rms(accented.samples, 0.1, 0.4)) - db(rms(plain.samples, 0.1, 0.4));
      check('accent: an accented strum is about 3 dB louder', diff > 2 && diff < 5, `+${fmt(diff, 2)} dB`);
    }

    // -----------------------------------------------------------------------------------------
    // Phrases as a lesson sound plays them
    // -----------------------------------------------------------------------------------------
    {
      const bend = await render(1.8, (e) => { audio.playPhrase(audio.tabPhrase('5b7', 3), 0.1, { synth: synth(e) }); });
      keep('phrase-5b7', bend.samples);
      const up = pitchAt(bend.samples, 0.1 + 0.6, 60, 0.04);
      check('"5b7" on the G string: fret 5 bent up to the pitch of fret 7', Math.abs(up - 200) < 3, `${fmt(up, 2)} cents above C4`);
      const notes = audio.tabPhrase('5h7', 3, { noteSeconds: 0.4 });
      const ham = await render(1.6, (e) => { audio.playPhrase(notes, 0.1, { synth: synth(e) }); });
      const pickedNotes = notes.map(({ legato, ...n }) => n);
      const pic = await render(1.6, (e) => { audio.playPhrase(pickedNotes, 0.1, { synth: synth(e) }); });
      keep('phrase-5h7', ham.samples);
      const d = pitchAt(ham.samples, 0.1 + 0.6, 62, 0.04);
      const hi = db(highs(ham.samples, 0.5, 0.512)) - db(highs(pic.samples, 0.5, 0.512));
      check('"5h7": fret 5, then 7 hammered (in tune, no pick click)', Math.abs(d) < 3 && hi < -6, `${fmt(d, 2)} cents from D4, highs ${fmt(hi, 1)} dB against picking it`);
    }

    // -----------------------------------------------------------------------------------------
    // A song with techniques through the SongPlayer
    // -----------------------------------------------------------------------------------------
    {
      let first = null;
      const r = await render(4.6, async (e) => {
        const song = songs.sixTab('title: Techniques\ntempo: 60\ntime: 4/4\n| h 3:5b2 q 3:5 3:7h |\n');
        const player = new songs.SongPlayer(song, { output: songs.liveOutput({ engine: e }), clock: e.clock, timer: 'manual', countInBars: 0 });
        await player.prepare();
        player.play();
        first = player.firstBeatTime;
        player.transport.advanceTo(4.5);
      });
      keep('song', r.samples);
      const t0 = first ?? 0.08;
      const bent = pitchAt(r.samples, t0 + 1.2, 60, 0.04);
      const plain = pitchAt(r.samples, t0 + 2.5, 60, 0.04);
      const hammered = pitchAt(r.samples, t0 + 3.4, 62, 0.04);
      check('song: "3:5b2" bends up a whole tone, "3:5 3:7h" hammers on to D4', Math.abs(bent - 200) < 3 && Math.abs(plain) < 3 && Math.abs(hammered) < 3,
        `${fmt(bent, 2)} / ${fmt(plain, 2)} / ${fmt(hammered, 2)} cents`);
      const onset = (() => { const x = r.samples; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.01) return i / FS; return NaN; })();
      check('song: firstBeatTime is when the first note is heard', first !== null && Math.abs(onset - first) < 0.003, `firstBeatTime ${fmt(first ?? NaN, 4)} s, first sound at ${fmt(onset, 4)} s`);
    }

    // -----------------------------------------------------------------------------------------
    // The drone on the audio clock, and a line over a held chord
    // -----------------------------------------------------------------------------------------
    {
      const r = await render(2.2, (e) => { audio.startDrone({ root: 45, fifth: true, when: 0.5, duration: 1, fadeIn: 0.02, fadeOut: 0.1 }, e); });
      const silentBefore = rms(r.samples, 0.05, 0.48), on = rms(r.samples, 0.7, 1.3), after = rms(r.samples, 1.9, 2.15);
      let start = NaN;
      for (let i = Math.round(0.3 * FS); i < r.samples.length; i++) if (Math.abs(r.samples[i]) > 0.002) { start = i / FS; break; }
      check('drone: silent until its time, sounds, and is gone after its duration', silentBefore < 1e-4 && on > 0.003 && after < on * 0.02, `rms before ${silentBefore.toExponential(1)}, during ${fmt(on, 4)}, after ${after.toExponential(1)}`);
      check('drone: starts where it was placed', Math.abs(start - 0.5) < 0.03, `first sound at ${fmt(start, 3)} s (asked for 0.5)`);

      const chord = [48, 52, 55, 60];
      const line = [64, 65, 67].map((midi, i) => ({ midi, at: 0.4 + i * 0.4, duration: 0.4, string: 1 }));
      const both = await render(2.2, (e) => { audio.playLineOverChord(chord, line, 0.1, { engine: e }); });
      const lineOnly = await render(2.2, (e) => { audio.playPhrase(line, 0.1, { synth: synth(e) }); });
      keep('line-over-chord', both.samples);
      const c = both.samples.map((v, i) => v - lineOnly.samples[i]);
      const early = rms(c, 0.15, 0.45), late = rms(c, 1.4, 1.7);
      check('line over a held chord: the chord still rings under the last note of the line', late > early * 0.1 && early > 0.01, `chord ${fmt(db(late) - db(early), 1)} dB from its start by the last note`);
    }

    // -----------------------------------------------------------------------------------------
    // Live: the metronome's first click, and the band changing style while it plays
    // -----------------------------------------------------------------------------------------
    await new Promise((resolve) => {
      document.addEventListener('pointerdown', () => resolve(audio.unlockAudio()), { once: true });
      window.__readyForClick = true;
    });
    const ctx = audio.getAudioContext();
    const engine = audio.getEngine();
    const liveFs = ctx.sampleRate;
    const recorder = await T.recorder(ctx, engine.output);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    {
      audio.preloadClicks('woodblock');
      await sleep(400);
      const leads = [];
      for (let round = 0; round < 3; round++) {
        const stopCap = recorder.capture();
        await sleep(150);
        const m = new audio.Metronome({ tempo: 120 });
        m.sound = 'woodblock';
        const tCall = ctx.currentTime;
        m.start();
        await sleep(1300);
        m.stop();
        m.dispose();
        await sleep(100);
        const cap = stopCap();
        const x = cap.samples;
        let peak = 0;
        for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
        let first = NaN;
        for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.05) { first = (cap.start + i) / liveFs; break; }
        leads.push(first - tCall);
      }
      report.info.metronomeFirstClickMs = leads.map((l) => +(l * 1000).toFixed(2));
      check('metronome: the first click comes about 20 ms after Start (was 80 ms)', leads.every((l) => l > 0.014 && l < 0.032), `${leads.map((l) => fmt(l * 1000, 1)).join(', ')} ms on the audio clock`);
      check('metronome: the first click is on time, not late', leads.every((l) => Math.abs(l - audio.METRONOME_START_DELAY) < 0.0025), `scheduled ${fmt(audio.METRONOME_START_DELAY * 1000, 0)} ms after Start`);
    }
    {
      const ch = (root, iv, s) => audio.chordFromIntervals(root, iv, s);
      const band = new audio.BackingBand();
      band.load([ch(0, [4, 7], 'C'), ch(7, [4, 7], 'G'), ch(9, [3, 7], 'Am'), ch(5, [4, 7], 'F')], { style: 'pop-rock', tempo: 140, loop: true, countInBars: 0 });
      await band.prepare();
      let stops = 0;
      band.transport.on('stop', () => stops++);
      const stopCap = recorder.capture();
      band.start();
      await sleep(2300);
      const changedAt = ctx.currentTime;
      band.change([ch(2, [3, 7, 10], 'Dm7'), ch(7, [4, 7, 10], 'G7')], { style: 'funk', tempo: 100, loop: true });
      await sleep(4000);
      const stopsWhilePlaying = stops;
      const styleNow = band.style.id;
      band.stop();
      await sleep(200);
      const cap = stopCap();
      band.dispose();
      const x = cap.samples;
      const win = Math.round(0.02 * liveFs);
      let longest = 0, run = 0;
      const from = Math.round(0.2 * liveFs), to = x.length - Math.round(0.5 * liveFs);
      for (let i = from; i + win <= to; i += win) {
        let s = 0;
        for (let k = 0; k < win; k++) s += x[i + k] * x[i + k];
        if (Math.sqrt(s / win) < 1e-3) { run++; longest = Math.max(longest, run); } else run = 0;
      }
      check('band: changes style and tempo live, without stopping', stopsWhilePlaying === 0 && styleNow === 'funk', `${stopsWhilePlaying} stop events, style now ${styleNow}`);
      check('band: no drop-out around the change', longest * 0.02 < 0.3, `longest silence ${fmt(longest * 20, 0)} ms (changed at ${fmt(changedAt, 2)} s)`);
    }
    recorder.dispose();
    return report;
  })();
}

withApp({}, async ({ page, goto, errors }) => {
  await installPageTools(page);
  await goto('home');
  const run = page.evaluate(inPage, { wantWav });
  await page.waitForFunction(() => window.__readyForClick === true, null, { timeout: 120000 });
  await page.mouse.click(8, 8); // the user gesture that unlocks audio for the live checks
  const report = await run;
  const failed = printChecks(report.checks);
  console.log('\ninfo:', JSON.stringify(report.info));
  if (wantWav) {
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, b64] of Object.entries(report.wavs)) {
      const file = path.join(dir, `audio-expression-${name}.wav`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  }
  const audioErrors = errors.filter((e) => /audio|AudioContext|worklet/i.test(e));
  if (audioErrors.length) console.log(`page errors mentioning audio:\n  ${audioErrors.join('\n  ')}`);
  console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
  if (failed || audioErrors.length) process.exitCode = 1;
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
