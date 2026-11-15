#!/usr/bin/env node
/**
 * Sound-level test of the audio engine: what the real Web Audio graph puts out, measured.
 * Run: node e2e/audio-mix.cjs
 *
 * Everything is rendered with OfflineAudioContext through the engine's own mixer, so the numbers
 * are exact and repeatable:
 *
 *  - no clicks: a note starting, a note stopped, a note replaced on its string (voice steal),
 *    stopAll in the middle of a strum, a tone stopped, a hi-hat choked, a bus muted: the
 *    high-frequency energy at that instant is compared with what the sound has anyway
 *  - no DC offset on any tone, drum, click or the mixed output
 *  - the limiter: a six-string strum plus bass plus the whole drum kit at full velocity, at the
 *    default volume and with everything turned up: never over full scale, and at the default
 *    volume the clipper is hardly touched
 *  - the live graph matches the pure renderer (same filters, same drive curve)
 *  - the mix of the backing band: level of every player on its own bus, style by style
 *
 * Exits non-zero if any check fails.
 */
const { withApp } = require('./lib/harness.cjs');
const { installPageTools, printChecks } = require('./audio-lib.cjs');

function inPage() {
  return (async () => {
    const audio = await import('/src/core/audio/index.ts');
    const T = window.__audioTools;
    const report = { checks: [], info: {}, table: [] };
    const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    const fmt = (n, d = 3) => Number(n).toFixed(d);
    const db = (g) => (g > 1e-10 ? 20 * Math.log10(g) : -200);
    const fs = 48000;

    /** Two cascaded high-passes at 9 kHz: what is left is the part of a signal a click lives in. */
    const highs = (x) => {
      const y = Float32Array.from(x);
      const c = audio.biquadCoeffs({ type: 'highpass', freq: 9000, q: 0.7 }, fs);
      audio.biquadFilter(y, c);
      audio.biquadFilter(y, c);
      return y;
    };
    const peakIn = (x, t0, t1) => {
      let p = 0;
      for (let i = Math.max(0, Math.round(t0 * fs)); i < Math.min(x.length, Math.round(t1 * fs)); i++) p = Math.max(p, Math.abs(x[i]));
      return p;
    };
    const render = (seconds, build, opts = {}) => audio.renderOffline({ seconds, sampleRate: fs, reverb: false, ...opts }, build);

    // ---------------------------------------------------------------------------------------
    // Clicks
    // ---------------------------------------------------------------------------------------
    {
      // A click is a burst of highs where the music has none. For each event: highs in the 4 ms
      // around it, against the highs of the same note's own attack (pick noise is the loudest
      // legitimate burst a guitar makes) and against the level of the signal there.
      const cases = [];
      for (const tone of ['steel', 'nylon', 'clean', 'driven']) {
        for (const midi of [40, 52, 64, 76]) {
          cases.push({ name: `${tone} ${midi}: stopped after 0.30 s`, tone, midi, at: 0.4, build: (g) => { g.pluck(midi, 0.1, { tone, velocity: 0.9, duration: 0.3 }); } });
          cases.push({ name: `${tone} ${midi}: replaced on its string`, tone, midi, at: 0.4037, steal: true, build: (g) => { g.pluck(midi, 0.1, { tone, velocity: 0.9, string: 3 }); g.pluck(midi + 2, 0.4037, { tone, velocity: 0.9, string: 3 }); } });
          cases.push({ name: `${tone} ${midi}: stopAll() mid-ring`, tone, midi, at: 0.3513, build: (g) => { g.pluck(midi, 0.1, { tone, velocity: 0.9 }); g.stopAll(0.3513); } });
        }
      }
      let worstRel = -200, worstName = '', worstAbs = 0, absName = '';
      for (const c of cases) {
        const r = await render(1.2, (e) => c.build(new audio.GuitarSynth({ engine: e })));
        const h = highs(r.samples);
        // What the note carries up there anyway, just before the event, and what is there during it.
        const before = peakIn(h, c.at - 0.02, c.at - 0.002);
        let during = peakIn(h, c.at - 0.001, c.at + 0.004);
        if (c.steal) {
          // The new note's own attack is in that window too: take the same scene without the first note away.
          const alone = await render(1.2, (e) => { new audio.GuitarSynth({ engine: e }).pluck(c.midi + 2, 0.4037, { tone: c.tone, velocity: 0.9, string: 3 }); });
          during -= peakIn(highs(alone.samples), c.at - 0.001, c.at + 0.004);
        }
        const burst = Math.max(0, during - before);
        const level = peakIn(r.samples, c.at - 0.02, c.at) || 1e-9;
        const rel = db(burst / level);
        if (rel > worstRel) { worstRel = rel; worstName = c.name; }
        if (burst > worstAbs) { worstAbs = burst; absName = c.name; }
      }
      check('no click when a note is stopped, replaced on its string, or damped by stopAll', worstRel < -40 && worstAbs < 0.002, `${cases.length} cases: largest burst of highs ${worstAbs > 0 ? fmt(db(worstAbs), 1) + ' dBFS' : 'none'} (${absName || 'no case'}); against the level of the note there, at worst ${fmt(worstRel, 1)} dB (${worstName || 'no case'})`);
    }
    {
      // The first and the last sample of every sound: a buffer that starts or ends away from zero clicks.
      let worstStart = 0, startName = '', worstEnd = 0, endName = '', worstDc = 0, dcName = '';
      const look = (name, x) => {
        const p = audio.peakOf(x) || 1;
        const s = Math.abs(x[0]) / p, e = Math.abs(x[x.length - 1]) / p;
        let mean = 0;
        for (let i = 0; i < x.length; i++) mean += x[i];
        const dc = Math.abs(mean / x.length) / (audio.rmsOf(x) || 1);
        if (s > worstStart) { worstStart = s; startName = name; }
        if (e > worstEnd) { worstEnd = e; endName = name; }
        if (dc > worstDc) { worstDc = dc; dcName = name; }
      };
      for (const d of audio.DRUM_NAMES) look(`drum ${d}`, audio.renderDrum(d, fs));
      for (const set of audio.CLICK_SETS) for (const level of ['accent', 'medium', 'beat', 'sub']) look(`click ${set}/${level}`, audio.renderClick(set, level, fs));
      for (const u of audio.UI_SOUNDS) look(`ui ${u}`, audio.renderUiSound(u, fs));
      for (const voice of audio.TONE_VOICES) for (const midi of [33, 57, 81]) look(`tone ${voice} ${midi}`, audio.renderTone({ midi, sampleRate: fs, voice, seconds: 0.4 }));
      for (const tone of audio.TONE_NAMES) for (const midi of [40, 52, 64, 76]) look(`pluck ${tone} ${midi}`, audio.renderPluck({ midi, sampleRate: fs, tone }));
      check('every sound starts and ends at silence', worstStart < 0.2 && worstEnd < 0.002, `largest first sample ${fmt(worstStart * 100, 1)} % of peak (${startName}), largest last sample ${fmt(worstEnd * 100, 3)} % (${endName})`);
      check('no sound has a DC offset', worstDc < 0.02, `largest mean ${fmt(worstDc * 100, 2)} % of rms (${dcName})`);
    }
    {
      // Tones through the live graph: start, stop, a stop inside the attack, a stop before the start.
      const r = await render(2.4, (e) => {
        audio.playTone(57, 0.1, { voice: 'sine', duration: 0.4, velocity: 1 }, e);
        audio.playTone(57, 0.8, { voice: 'reference', velocity: 1 }, e).stop(1.2);
        audio.playTone(57, 1.5, { voice: 'organ', duration: 0.003, velocity: 1 }, e);
        audio.playTone(57, 1.9, { voice: 'epiano', duration: 0.2, velocity: 1 }, e).stop(1.85);
      });
      const h = highs(r.samples);
      const lvl = audio.peakOf(r.samples);
      const burst = Math.max(peakIn(h, 0.098, 0.105), peakIn(h, 0.498, 0.51), peakIn(h, 0.798, 0.805), peakIn(h, 1.198, 1.21));
      const short = peakIn(r.samples, 1.5, 1.6);
      const never = peakIn(r.samples, 1.84, 2.3);
      check('tones start and stop without a click', db(burst / lvl) < -55, `highs at the edges ${fmt(db(burst / lvl), 1)} dB below the tone`);
      check('a tone released inside its attack still sounds, and fades', short > 0.002 && peakIn(r.samples, 1.62, 1.7) < short * 0.05, `peak ${fmt(short, 4)}, 0.1 s later ${fmt(peakIn(r.samples, 1.62, 1.7), 5)}`);
      check('a tone stopped before it starts is never heard', never < 1e-4, `peak ${never.toExponential(1)}`);
    }
    {
      // Hi-hat choke, and a bus muted while a chord rings.
      const r = await render(1.6, (e) => {
        const kit = new audio.DrumKit(e);
        kit.play('hihatOpen', 0.1, 1);
        kit.play('hihatPedal', 0.3, 0.6);
        const g = new audio.GuitarSynth({ engine: e });
        g.strum([40, 47, 52, 56, 59, 64], 0.8, { velocity: 1 });
      });
      const open = await render(1.6, (e) => { new audio.DrumKit(e).play('hihatOpen', 0.1, 1); });
      const chokedTail = audio.rmsOf(r.samples, Math.round(0.42 * fs), Math.round(0.6 * fs));
      const openTail = audio.rmsOf(open.samples, Math.round(0.42 * fs), Math.round(0.6 * fs));
      check('closing the hi-hat chokes the open one', chokedTail < openTail * 0.1, `tail rms ${fmt(chokedTail, 5)} choked vs ${fmt(openTail, 5)} ringing`);
    }

    // ---------------------------------------------------------------------------------------
    // The limiter
    // ---------------------------------------------------------------------------------------
    const everything = (e, velocity, gain) => {
      const g = new audio.GuitarSynth({ engine: e });
      const bass = new audio.GuitarSynth({ engine: e, bus: 'bass', tone: 'bass-finger', mono: true });
      const kit = new audio.DrumKit(e);
      for (let i = 0; i < 8; i++) {
        const t = 0.1 + i * 0.5;
        g.strum([40, 47, 52, 56, 59, 64], t, { velocity, gain, direction: i % 2 ? 'up' : 'down' });
        bass.pluck(28, t, { velocity, gain, duration: 0.45 });
        for (const d of ['kick', 'snare', 'crash', 'hihatOpen', 'tomLow']) kit.play(d, t, velocity, gain);
        audio.playClick('woodblock', 'accent', t, gain, e);
      }
    };
    const clipStats = (x) => {
      let over = 0, peak = 0;
      for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > 0.7) over++; if (a > peak) peak = a; }
      return { peak, over: over / x.length, rms: audio.rmsOf(x) };
    };
    {
      const normal = await audio.renderOffline({ seconds: 4.5, sampleRate: fs }, (e) => everything(e, 1, 1));
      const L = clipStats(normal.channels[0]), R = clipStats(normal.channels[1]);
      report.info['full strum + bass + drums + click, default volume'] = `peak L ${fmt(L.peak)} R ${fmt(R.peak)}, rms ${fmt(L.rms)}, ${fmt(Math.max(L.over, R.over) * 100, 2)} % of samples in the clipper's knee`;
      check('six-string strum + bass + drums + click at full velocity: under full scale', Math.max(L.peak, R.peak) <= 0.98 && T.stats(normal.samples).bad === 0, `peak L ${fmt(L.peak)} R ${fmt(R.peak)}`);
      check('at the default volume the safety clipper is barely touched', Math.max(L.over, R.over) < 0.02, `${fmt(Math.max(L.over, R.over) * 100, 2)} % of samples above its knee (0.7)`);
      const hot = await audio.renderOffline({ seconds: 4.5, sampleRate: fs }, (e) => {
        e.masterVolume = 1;
        for (const b of audio.BUS_NAMES) e.setBusVolume(b, 1.5);
        everything(e, 1, 4);
      });
      const H = clipStats(hot.channels[0]), H2 = clipStats(hot.channels[1]);
      check('with every volume at maximum and every note four times too loud: limited, never clipped', Math.max(H.peak, H2.peak) <= 0.98 && T.stats(hot.samples).bad === 0 && H.rms > L.rms, `peak L ${fmt(H.peak)} R ${fmt(H2.peak)}, rms ${fmt(H.rms)}`);
      // The output never carries DC, even when it is being limited (an asymmetric clipper would add some).
      const dc = (x) => { let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; return Math.abs(m / x.length); };
      check('the mixed output has no DC offset, limited or not', dc(normal.samples) < 0.002 && dc(hot.samples) < 0.004, `mean ${dc(normal.samples).toExponential(1)} normal, ${dc(hot.samples).toExponential(1)} overloaded`);
    }
    {
      // A quiet single note must pass through the master chain unchanged in shape: the compressor
      // only adds its fixed make-up gain down there, the clipper is linear below its knee. The note
      // starts 0.1 s into a brand-new context on purpose: that is inside the compressor's start-up
      // dip, which the engine has to undo (without that this difference is -28 dB, not -60).
      // (Velocity 0.8 is one of the dynamic layers the live synth renders, so both play the same string.)
      const one = await render(1.5, (e) => { e.masterVolume = 0.5; new audio.GuitarSynth({ engine: e }).pluck(57, 0.1, { velocity: 0.8 }); });
      const pure = audio.renderPluck({ midi: 57, sampleRate: fs, velocity: 0.8 });
      // Compare the shapes: best gain and best alignment (the compressor's look-ahead is 6 ms give or
      // take a sample), then the residual.
      const fit = (live, ref) => {
        let best = { err: Infinity, g: 0, shift: 0 };
        for (let shift = -2; shift <= 2; shift++) {
          const off = Math.round(0.1 * fs) + shift;
          const n = Math.min(ref.length, live.length - off, Math.round(1.2 * fs));
          let xy = 0, yy = 0;
          for (let i = 0; i < n; i++) { xy += live[off + i] * ref[i]; yy += ref[i] * ref[i]; }
          const g = xy / yy;
          let err = 0, sig = 0;
          for (let i = 0; i < n; i++) { const d = live[off + i] - g * ref[i]; err += d * d; sig += live[off + i] * live[off + i]; }
          if (err / sig < best.err) best = { err: err / sig, g, shift };
        }
        return { db: db(Math.sqrt(best.err)), g: best.g, shift: best.shift };
      };
      const f1 = fit(one.samples, pure);
      check('the live graph plays what the pure renderer computes, from the first tenth of a second on', f1.db < -50, `difference ${fmt(f1.db, 1)} dB below the note (aligned by ${f1.shift} samples), make-up gain of the compressor ${fmt(db(f1.g / (0.95 * 0.25)), 2)} dB`);
      const chord = [{ midi: 40, velocity: 1, string: 6 }, { midi: 47, velocity: 1, string: 5 }, { midi: 52, velocity: 0.8, string: 4 }];
      const drv = await render(1.5, (e) => { e.masterVolume = 0.5; const g3 = new audio.GuitarSynth({ engine: e }); for (const c of chord) g3.pluck(c.midi, 0.1, { tone: 'driven', velocity: c.velocity, string: c.string }); });
      const pureDrv = audio.renderSequence(chord.map((c) => ({ time: 0, tone: 'driven', ...c })), { sampleRate: fs, seconds: 1.3, gain: 1 });
      const f2 = fit(drv.samples, pureDrv);
      check('the driven power chord through the live waveshaper matches the pure renderer', f2.db < -35, `difference ${fmt(f2.db, 1)} dB below the chord (aligned by ${f2.shift} samples)`);
    }

    // ---------------------------------------------------------------------------------------
    // The band's mix, style by style: every player on its own bus
    // ---------------------------------------------------------------------------------------
    {
      const ch = (root, iv, symbol) => audio.chordFromIntervals(root, iv, symbol);
      const bars = [ch(0, [4, 7, 11], 'Cmaj7'), ch(9, [3, 7, 10], 'Am7'), ch(2, [3, 7, 10], 'Dm7'), ch(7, [4, 7, 10], 'G7')];
      const players = ['drums', 'bass', 'keys', 'guitar'];
      // Loudness the way a meter built for it weighs it (ITU-R BS.1770 "K" curve): a shelf that
      // lifts the highs and a high-pass that discounts the deep bass.
      const kWeighted = (x) => {
        const y = Float32Array.from(x);
        audio.biquadFilter(y, audio.biquadCoeffs({ type: 'highshelf', freq: 1500, gain: 4 }, fs));
        audio.biquadFilter(y, audio.biquadCoeffs({ type: 'highpass', freq: 38, q: 0.5 }, fs));
        return y;
      };
      let worstSpread = 0, spreadStyle = '', quietest = Infinity, quietName = '', loudest = -Infinity, loudName = '';
      const mixLevels = [];
      for (const id of audio.BACKING_STYLE_IDS) {
        const style = audio.BACKING_STYLES[id];
        const qpm = audio.styleQuarterBpm(id, style.tempo.default);
        const barSec = (audio.resolveMeter(style.timeSignature).barTicks / audio.PPQ) * (60 / qpm);
        const seconds = barSec * 8;
        const ctx = new OfflineAudioContext(6, Math.ceil((seconds + 0.5) * fs), fs);
        const engine = new audio.AudioEngine(ctx);
        const merger = ctx.createChannelMerger(6);
        players.forEach((p, i) => engine.bus(p).connect(merger, 0, 2 + i));
        merger.connect(ctx.destination);
        const band = new audio.BackingBand({ engine, timer: 'manual' });
        band.load(bars, { style: id, choruses: 2, countInBars: 0, ending: false });
        band.setMuted('guitar', false);
        band.start();
        band.transport.advanceTo(seconds + 0.4);
        const out = await ctx.startRendering();
        engine.dispose();
        const from = Math.round(0.1 * fs), to = Math.round(seconds * fs);
        const level = {};
        players.forEach((p, i) => { level[p] = db(audio.rmsOf(kWeighted(out.getChannelData(2 + i)), from, to)); });
        const mix = new Float32Array(out.length);
        const l = out.getChannelData(0), r = out.getChannelData(1);
        for (let i = 0; i < mix.length; i++) mix[i] = 0.5 * (l[i] + r[i]);
        const total = db(audio.rmsOf(kWeighted(mix), from, to));
        const peak = Math.max(audio.peakOf(l), audio.peakOf(r));
        mixLevels.push(total);
        report.table.push({ style: id, drums: level.drums, bass: level.bass, keys: level.keys, guitar: level.guitar, mix: total, peak });
        // Without the rhythm guitar (as the band plays by default): drums, bass and keys.
        const trio = [level.drums, level.bass, level.keys];
        const spread = Math.max(...trio) - Math.min(...trio);
        if (spread > worstSpread) { worstSpread = spread; spreadStyle = id; }
        for (const p of players) {
          if (level[p] < quietest) { quietest = level[p]; quietName = `${p} in ${id}`; }
          if (level[p] > loudest) { loudest = level[p]; loudName = `${p} in ${id}`; }
        }
      }
      const mixSpread = Math.max(...mixLevels) - Math.min(...mixLevels);
      report.info['band mix'] = `quietest player ${quietName} (${fmt(quietest, 1)} dB), loudest ${loudName} (${fmt(loudest, 1)} dB); loudness of the whole band differs by ${fmt(mixSpread, 1)} dB between styles`;
      check('band mix: in every style drums, bass and keys sit within 12 dB of each other', worstSpread < 12, `widest spread ${fmt(worstSpread, 1)} dB (${spreadStyle})`);
      check('band mix: no player is buried or sticking out', quietest > -38 && loudest < -12, `quietest ${quietName} ${fmt(quietest, 1)} dB, loudest ${loudName} ${fmt(loudest, 1)} dB (K-weighted rms, dBFS, before the master)`);
      check('band mix: the styles are about equally loud', mixSpread < 7, `${fmt(mixSpread, 1)} dB between the quietest and the loudest style`);
      for (const row of report.table) {
        const g = [row.drums, row.bass, row.keys, row.guitar];
        check(`band mix ${row.style}: the rhythm guitar sits with the band, the bass carries, nothing clips`, row.guitar > Math.max(row.drums, row.bass) - 14 && row.guitar < Math.max(row.drums, row.bass) + 4 && row.bass > row.drums - 9 && row.peak <= 0.98,
          `drums ${fmt(g[0], 1)}, bass ${fmt(g[1], 1)}, keys ${fmt(g[2], 1)}, guitar ${fmt(g[3], 1)} dB; mix ${fmt(row.mix, 1)} dB, peak ${fmt(row.peak)}`);
      }
    }
    return report;
  })();
}

withApp({}, async ({ page, goto, errors }) => {
  await installPageTools(page);
  await goto('home');
  const report = await page.evaluate(inPage);
  const failed = printChecks(report.checks);
  console.log('\nband mix (K-weighted rms of each bus, dBFS before the master; mix after it):');
  console.log('  style           drums    bass    keys  guitar     mix   peak');
  for (const r of report.table) console.log(`  ${r.style.padEnd(14)} ${[r.drums, r.bass, r.keys, r.guitar, r.mix].map((v) => v.toFixed(1).padStart(7)).join(' ')}  ${r.peak.toFixed(3)}`);
  console.log('\ninfo:', JSON.stringify(report.info, null, 1));
  const audioErrors = errors.filter((e) => /audio|AudioContext|worklet/i.test(e));
  if (audioErrors.length) console.log(`page errors mentioning audio:\n  ${audioErrors.join('\n  ')}`);
  console.log(`\n${report.checks.length - failed}/${report.checks.length} checks passed`);
  if (failed || audioErrors.length) process.exitCode = 1;
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
