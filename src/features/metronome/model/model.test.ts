import { describe, expect, it } from 'vitest';
import { defaultGrouping, resolveMeter, type TransportClock } from '@/core/audio';
import { COMMON_METERS, METER_CHOICES, beatNoteWords, groupingWords, meterChoice, meterKey, meterLabel, meterOf, normalizeMeterKey, parseMeterKey, tempoBeatNote, tempoForRegrouping } from './meters';
import { MetronomeSession, practiceSeconds, practiceToCredit, timerRemaining, type SessionClick } from './session';
import {
  BUILT_IN_PRESETS,
  DEFAULT_SETTINGS,
  accentsOf,
  applyPreset,
  cleanAccents,
  cycleBeatAccent,
  describeSetup,
  makePreset,
  nextAccent,
  presetMatches,
  sanitizePresets,
  sanitizeSettings,
  setupOf,
  suggestPresetName,
  type MetronomeSettings,
} from './settings';
import { clampSwing, clicksPerBeat, perBeatWords, subdivisionChoices, swingWords } from './subdivisions';
import { DIAL_DEGREES_PER_BPM, angleDelta, clampTempo, gaugeFraction, nudgeTempo, parseTempoInput, pointAngle, tempoAfterTurn, tempoName } from './tempo';
import { gapConfig, gapStatus, trainerConfig, trainerLine, trainerPlanWords, trainerProgress } from './trainer';

describe('meters', () => {
  it('offers the four common meters first and every choice resolves in the engine', () => {
    expect(METER_CHOICES.slice(0, 4).map((m) => m.id)).toEqual([...COMMON_METERS]);
    for (const choice of METER_CHOICES) {
      // The usual grouping listed first is the engine's own default, so a plain key means it.
      expect(choice.groupings[0], choice.id).toEqual(defaultGrouping(choice.numerator, choice.denominator));
      for (const g of choice.groupings) {
        expect(g.reduce((a, b) => a + b, 0), `${choice.id} ${g}`).toBe(choice.numerator);
        const meter = resolveMeter({ numerator: choice.numerator, denominator: choice.denominator, grouping: g });
        expect(meter.grouping).toEqual(g);
      }
    }
  });

  it('round-trips keys and spells the usual grouping without brackets', () => {
    expect(meterKey({ numerator: 7, denominator: 8, grouping: [2, 2, 3] })).toBe('7/8');
    expect(meterKey({ numerator: 7, denominator: 8, grouping: [3, 2, 2] })).toBe('7/8(3+2+2)');
    expect(parseMeterKey('7/8(3+2+2)')).toEqual({ numerator: 7, denominator: 8, grouping: [3, 2, 2] });
    expect(parseMeterKey('4/4')).toEqual({ numerator: 4, denominator: 4, grouping: [4] });
    for (const choice of METER_CHOICES) {
      for (const g of choice.groupings) {
        const key = meterKey({ numerator: choice.numerator, denominator: choice.denominator, grouping: g });
        expect(meterKey(parseMeterKey(key)!)).toBe(key);
      }
    }
  });

  it('refuses meters and groupings the picker does not offer', () => {
    expect(parseMeterKey('13/16')).toBeNull();
    expect(parseMeterKey('7/8(4+3)')).toBeNull();
    expect(parseMeterKey('nonsense')).toBeNull();
    expect(parseMeterKey(42)).toBeNull();
    expect(normalizeMeterKey('7/8(2+2+3)')).toBe('7/8');
    expect(normalizeMeterKey('99/8')).toBe('4/4');
    expect(meterChoice('7/8(3+2+2)')?.id).toBe('7/8');
  });

  it('labels the grouping only where there is a choice', () => {
    expect(meterLabel('4/4')).toBe('4/4');
    expect(meterLabel('6/8')).toBe('6/8');
    expect(meterLabel('7/8')).toBe('7/8 · 2+2+3');
    expect(meterLabel('7/8(3+2+2)')).toBe('7/8 · 3+2+2');
  });

  it('explains groupings in plain words', () => {
    expect(groupingWords([2, 2, 3])).toBe('Count 1-2  1-2  1-2-3: two short beats, then a long one.');
    expect(groupingWords([3, 2, 2])).toBe('Count 1-2-3  1-2  1-2: one long beat, then two short ones.');
    expect(groupingWords([2, 3, 2])).toBe('Count 1-2  1-2-3  1-2: one short beat, a long one, then a short one.');
    expect(groupingWords([3, 3, 3])).toBe('Count 1-2-3  1-2-3  1-2-3: three even groups of three.');
  });

  it('names the note the tempo counts', () => {
    expect(tempoBeatNote(meterOf('4/4'))).toBe('quarter');
    expect(tempoBeatNote(meterOf('6/8'))).toBe('dotted-quarter');
    expect(tempoBeatNote(meterOf('12/8'))).toBe('dotted-quarter');
    expect(tempoBeatNote(meterOf('2/2'))).toBe('half');
    expect(tempoBeatNote(meterOf('3/8'))).toBe('eighth');
    expect(tempoBeatNote(meterOf('7/8'))).toBe('quarter');
    expect(beatNoteWords('dotted-quarter')).toBe('dotted quarter notes');
  });

  it('keeps the eighth-note pulse when only the grouping changes', () => {
    // 9/8 as 3+3+3 at 80 dotted quarters = 240 eighths a minute = 120 quarters as 2+2+2+3.
    expect(tempoForRegrouping(80, meterOf('9/8'), meterOf('9/8(2+2+2+3)'))).toBe(120);
    expect(tempoForRegrouping(120, meterOf('9/8(2+2+2+3)'), meterOf('9/8'))).toBe(80);
    expect(tempoForRegrouping(100, meterOf('7/8'), meterOf('7/8(3+2+2)'))).toBe(100);
    expect(tempoForRegrouping(100, meterOf('4/4'), meterOf('6/8'))).toBe(100);
  });
});

describe('tempo', () => {
  it('clamps to the engine range and whole numbers', () => {
    expect(clampTempo(10)).toBe(20);
    expect(clampTempo(1000)).toBe(400);
    expect(clampTempo(96.6)).toBe(97);
    expect(clampTempo(NaN, 77)).toBe(77);
  });

  it('names tempos the Italian way', () => {
    expect(tempoName(50).name).toBe('Largo');
    expect(tempoName(120)).toEqual({ name: 'Allegro', meaning: 'fast and bright' });
    expect(tempoName(220).name).toBe('Prestissimo');
    expect(tempoName(30).name).toBe('Grave');
  });

  it('parses typed tempos', () => {
    expect(parseTempoInput('96')).toBe(96);
    expect(parseTempoInput(' 120 bpm')).toBe(120);
    expect(parseTempoInput('72,5')).toBe(72.5);
    expect(parseTempoInput('fast')).toBeNull();
    expect(parseTempoInput('')).toBeNull();
  });

  it('turns the dial by a fixed number of degrees per BPM, either way across twelve o\'clock', () => {
    expect(pointAngle(0, -10, 0, 0)).toBeCloseTo(0);
    expect(pointAngle(10, 0, 0, 0)).toBeCloseTo(90);
    expect(pointAngle(0, 10, 0, 0)).toBeCloseTo(180);
    expect(pointAngle(-10, 0, 0, 0)).toBeCloseTo(270);
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(tempoAfterTurn(100, 10 * DIAL_DEGREES_PER_BPM)).toBe(110);
    expect(tempoAfterTurn(100, -10 * DIAL_DEGREES_PER_BPM)).toBe(90);
    expect(tempoAfterTurn(30, -1000)).toBe(20);
  });

  it('puts the everyday range on most of the gauge', () => {
    expect(gaugeFraction(20)).toBe(0);
    expect(gaugeFraction(400)).toBeCloseTo(1);
    expect(gaugeFraction(200) - gaugeFraction(40)).toBeGreaterThan(0.5);
  });

  it('nudges by one, or five with Shift, within limits', () => {
    expect(nudgeTempo(100, 1)).toBe(101);
    expect(nudgeTempo(100, -1, true)).toBe(95);
    expect(nudgeTempo(398, 1, true)).toBe(400);
  });
});

describe('subdivisions', () => {
  it('counts the clicks of each beat, also in uneven meters', () => {
    expect(clicksPerBeat(meterOf('4/4'), 'eighth')).toEqual([2, 2, 2, 2]);
    expect(clicksPerBeat(meterOf('6/8'), 'eighth')).toEqual([3, 3]);
    expect(clicksPerBeat(meterOf('7/8'), 'eighth')).toEqual([2, 2, 3]);
    expect(perBeatWords([2, 2, 3])).toBe('2 or 3 clicks a beat');
    expect(perBeatWords([1, 1])).toBe('1 click a beat');
    expect(perBeatWords([4])).toBe('4 clicks a beat');
  });

  it('offers everything in 4/4 and drops choices that would sound the same in 6/8', () => {
    expect(subdivisionChoices(meterOf('4/4')).map((c) => c.id)).toEqual(['none', 'eighth', 'triplet', 'sixteenth', 'swing', 'quintuplet', 'sextuplet']);
    const six = subdivisionChoices(meterOf('6/8')).map((c) => c.id);
    expect(six).toContain('eighth');
    expect(six).toContain('sixteenth');
    expect(six).not.toContain('swing');
    expect(six).not.toContain('triplet');
    // A stored choice is never hidden.
    expect(subdivisionChoices(meterOf('6/8'), 'swing').map((c) => c.id)).toContain('swing');
  });

  it('keeps swing ratios in range and names them', () => {
    expect(clampSwing(0.9)).toBe(0.75);
    expect(clampSwing(0.4)).toBe(0.5);
    expect(clampSwing(0.667)).toBe(2 / 3);
    expect(clampSwing(NaN)).toBe(2 / 3);
    expect(swingWords(0.5)).toBe('Straight');
    expect(swingWords(2 / 3)).toBe('Triplet');
    expect(swingWords(0.75)).toBe('Hard');
  });
});

describe('settings', () => {
  it('opens on a sensible default and survives garbage', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ tempo: 9999, meter: '13/16', subdivision: 'polka', swing: 2, volume: -3, countIn: 9, trainer: { on: 'yes', step: 0 }, gap: { on: true, play: 0 }, timerMinutes: 7 });
    expect(s.tempo).toBe(400);
    expect(s.meter).toBe('4/4');
    expect(s.subdivision).toBe('none');
    expect(s.swing).toBe(0.75);
    expect(s.volume).toBe(0);
    expect(s.countIn).toBe(2);
    expect(s.trainer.on).toBe(false);
    expect(s.trainer.step).toBe(1);
    expect(s.gap).toEqual({ on: true, play: 1, mute: 2 });
    expect(s.timerMinutes).toBe(0);
  });

  it('keeps accents only when they fit the meter and differ from the usual ones', () => {
    expect(cleanAccents([3, 1, 1, 1], '4/4')).toBeNull();
    expect(cleanAccents([0, 3, 0, 3], '4/4')).toEqual([0, 3, 0, 3]);
    expect(cleanAccents([3, 1, 1], '4/4')).toBeNull();
    expect(cleanAccents([3, 1, 5, 1], '4/4')).toBeNull();
    expect(accentsOf({ meter: '5/4', accents: null })).toEqual([3, 1, 1, 2, 1]);
  });

  it('cycles a tapped beat normal, medium, strong, silent, normal (as the engine does)', () => {
    expect([1, 2, 3, 0].map((l) => nextAccent(l as 0 | 1 | 2 | 3))).toEqual([2, 3, 0, 1]);
    let s: MetronomeSettings = { ...DEFAULT_SETTINGS };
    s = cycleBeatAccent(s, 1);
    expect(accentsOf(s)).toEqual([3, 2, 1, 1]);
    s = cycleBeatAccent(s, 0);
    expect(accentsOf(s)).toEqual([0, 2, 1, 1]);
    // Back to the usual pattern = stored as null.
    for (let i = 0; i < 3; i++) s = cycleBeatAccent(cycleBeatAccent(s, 1), 0);
    expect(s.accents).toBeNull();
    expect(cycleBeatAccent(s, 9)).toBe(s);
  });
});

describe('presets', () => {
  it('built-ins are valid, distinct and each one is recognised once applied', () => {
    const ids = new Set(BUILT_IN_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(BUILT_IN_PRESETS.length);
    for (const p of BUILT_IN_PRESETS) {
      const applied = applyPreset(DEFAULT_SETTINGS, p);
      expect(setupOf(applied), p.name).toEqual(setupOf(sanitizeSettings({ ...DEFAULT_SETTINGS, ...p.setup })));
      expect(presetMatches(applied, p), p.name).toBe(true);
      const others = BUILT_IN_PRESETS.filter((q) => q.id !== p.id && presetMatches(applied, q));
      expect(others, p.name).toEqual([]);
    }
  });

  it('applies the musical setup and keeps the volume and helpers that are not part of it', () => {
    const mine = { ...DEFAULT_SETTINGS, volume: 0.5, timerMinutes: 10, visualOnly: true };
    const swing = BUILT_IN_PRESETS.find((p) => p.id === 'builtin-swing-120')!;
    const s = applyPreset(mine, swing);
    expect(s.tempo).toBe(120);
    expect(s.subdivision).toBe('swing');
    expect(s.volume).toBe(0.5);
    expect(s.timerMinutes).toBe(10);
    expect(s.visualOnly).toBe(true);
  });

  it('describes and names a setup', () => {
    const s = sanitizeSettings({ tempo: 92, meter: '7/8(3+2+2)', subdivision: 'eighth' });
    expect(describeSetup(setupOf(s))).toBe('92 BPM · 7/8 · 3+2+2 · Eighths');
    expect(suggestPresetName(setupOf(s))).toBe('92 BPM 7/8 3+2+2 eighths');
    const t = sanitizeSettings({ trainer: { on: true, start: 60, target: 100, step: 5, every: 4 } });
    expect(describeSetup(setupOf(t))).toBe('60 to 100 BPM · 4/4 · speed trainer');
  });

  it('makes presets with unique ids and a name, and cleans stored ones', () => {
    const a = makePreset('  My   groove  ', DEFAULT_SETTINGS, [], 1000);
    expect(a.name).toBe('My groove');
    const b = makePreset('', DEFAULT_SETTINGS, [a], 1000);
    expect(b.id).not.toBe(a.id);
    expect(b.name).toBe('80 BPM 4/4');
    const cleaned = sanitizePresets([a, b, a, { id: 'builtin-x', name: 'x' }, { id: 'z' }, null, { id: 'q', name: 'Q', setup: { tempo: 5000 } }]);
    expect(cleaned.map((p) => p.id)).toEqual([a.id, b.id, 'q']);
    expect(cleaned[2].setup.tempo).toBe(400);
    expect(sanitizePresets('x')).toEqual([]);
  });
});

describe('practice helpers', () => {
  it('maps the trainer and gap settings to the engine', () => {
    expect(trainerConfig({ on: false, start: 60, target: 100, step: 5, every: 4 })).toBeNull();
    expect(trainerConfig({ on: true, start: 60, target: 60, step: 5, every: 4 })).toBeNull();
    expect(trainerConfig({ on: true, start: 60, target: 100, step: 5, every: 4 })).toEqual({ startBpm: 60, targetBpm: 100, stepBpm: 5, everyBars: 4 });
    expect(gapConfig({ on: false, play: 2, mute: 2 })).toBeNull();
    expect(gapConfig({ on: true, play: 2, mute: 1 })).toEqual({ playBars: 2, muteBars: 1 });
  });

  it('shows where the speed trainer is on the way up', () => {
    const cfg = { startBpm: 60, targetBpm: 100, stepBpm: 5, everyBars: 4 };
    const p0 = trainerProgress(cfg, 0);
    expect(p0).toMatchObject({ bpm: 60, fraction: 0, step: 0, steps: 8, barsToNext: 4, done: false, rising: true });
    expect(trainerLine(p0, cfg)).toBe('Step 1 of 9. Next: 65 BPM in 4 bars.');
    const p = trainerProgress(cfg, 9);
    expect(p).toMatchObject({ bpm: 70, step: 2, barsToNext: 3 });
    expect(p.fraction).toBeCloseTo(0.25);
    const end = trainerProgress(cfg, 40);
    expect(end).toMatchObject({ bpm: 100, fraction: 1, done: true, barsToNext: 0 });
    expect(trainerLine(end, cfg)).toBe('Target reached: 100 BPM. It stays here.');
    expect(trainerPlanWords(cfg)).toBe('8 steps, 32 bars to the target');
    // Coming down works the same way.
    const down = { startBpm: 120, targetBpm: 100, stepBpm: 10, everyBars: 2 };
    expect(trainerProgress(down, 2)).toMatchObject({ bpm: 110, rising: false });
  });

  it('tells playing bars from silent ones', () => {
    const cfg = { playBars: 2, muteBars: 1 };
    expect([0, 1, 2, 3].map((b) => gapStatus(cfg, b))).toEqual([
      { silent: false, barOfPhase: 1, phaseBars: 2 },
      { silent: false, barOfPhase: 2, phaseBars: 2 },
      { silent: true, barOfPhase: 1, phaseBars: 1 },
      { silent: false, barOfPhase: 1, phaseBars: 2 },
    ]);
  });

  it('credits a visit only after a minute of running, and caps it', () => {
    expect(practiceSeconds(59.9)).toBeNull();
    expect(practiceSeconds(60)).toBe(60);
    expect(practiceSeconds(1e9)).toBe(3 * 3600);
    expect(timerRemaining(0, 100)).toBeNull();
    expect(timerRemaining(5, 100)).toBe(200);
    expect(timerRemaining(1, 100)).toBe(0);
  });

  it('credits a visit in parts (timer done, page hidden, leaving) without counting a second twice', () => {
    // Review fix: practice used to be reported only on leaving, so a finished session timer showed
    // no progress and a phone that never came back from the background lost the whole visit.
    let credited = 0;
    const report = (visitSec: number) => {
      const sec = practiceToCredit(visitSec, credited);
      if (sec !== null) credited = visitSec;
      return sec;
    };
    expect(report(45)).toBeNull(); // hidden after 45 s: too short, nothing yet
    expect(report(130)).toBe(130); // a 2-minute timer finishes
    expect(report(150)).toBeNull(); // hidden 20 s later: only 20 s are new
    expect(report(215)).toBe(85); // leaving: the 85 s since the last report
    expect(report(215)).toBeNull(); // pagehide right after: nothing left
    expect(credited).toBe(215);
    expect(practiceToCredit(100, -5)).toBe(100);
    expect(practiceToCredit(Number.NaN, 0)).toBeNull();
  });
});

describe('session', () => {
  class Clock implements TransportClock {
    t = 0;
    now() {
      return this.t;
    }
    soundingNow() {
      return this.t;
    }
  }

  function rig() {
    const clock = new Clock();
    let wall = 0;
    const played: Array<{ level: string; time: number; set: string }> = [];
    const heard: SessionClick[] = [];
    const s = new MetronomeSession({ clock, timer: 'manual', now: () => wall, unlock: () => undefined, play: (set, level, time) => played.push({ set, level, time }) });
    s.onClick((c) => heard.push(c));
    const run = (until: number) => {
      while (clock.t < until - 1e-9) {
        clock.t = Math.min(until, clock.t + 0.02);
        wall = clock.t * 1000;
        s.metronome.transport.process();
        s.metronome.transport.flushVisual();
      }
    };
    return { s, clock, played, heard, run };
  }

  it('plays the configured bar: tempo, meter, accents, subdivision, sound', () => {
    const { s, played, run } = rig();
    s.configure(sanitizeSettings({ tempo: 120, meter: '7/8(3+2+2)', accents: [3, 0, 2], subdivision: 'eighth' }), 'rim');
    s.start();
    run(2);
    s.stop();
    const bar = played.slice(0, 7);
    // 3+2+2 with the second beat silenced: its own click is gone, its eighth still ticks.
    expect(bar.map((c) => c.level)).toEqual(['accent', 'sub', 'sub', 'sub', 'medium', 'sub', 'accent']);
    expect(new Set(played.map((c) => c.set))).toEqual(new Set(['rim']));
    // Eighths at quarter = 120 are 0.25 s apart; the silent beat leaves a hole at 0.75 s.
    const rel = bar.map((c) => c.time - bar[0].time);
    [0, 0.25, 0.5, 1, 1.25, 1.5, 1.75].forEach((t, i) => expect(rel[i]).toBeCloseTo(t, 6));
  });

  it('visual-only sends nothing to the speakers but still reports the clicks', () => {
    const { s, played, heard, run } = rig();
    s.configure(sanitizeSettings({ tempo: 120, visualOnly: true }), 'woodblock');
    s.start();
    run(1.1);
    s.stop();
    expect(played).toEqual([]);
    expect(heard.length).toBeGreaterThanOrEqual(2);
    expect(heard.every((c) => !c.audible)).toBe(true);
  });

  it('lets the speed trainer own the tempo and counts practice time', () => {
    const { s, run } = rig();
    const beats: Array<{ bar: number; tempo: number }> = [];
    s.onBeat((b) => beats.push({ bar: b.bar, tempo: b.tempo }));
    s.configure(sanitizeSettings({ tempo: 100, trainer: { on: true, start: 100, target: 120, step: 10, every: 1 } }), 'woodblock');
    s.start();
    run(9);
    // A tempo change from the screen while the trainer runs does not fight it.
    s.configure(sanitizeSettings({ tempo: 100, trainer: { on: true, start: 100, target: 120, step: 10, every: 1 } }), 'woodblock');
    run(10);
    s.stop();
    const perBar = new Map<number, number>();
    for (const b of beats) perBar.set(b.bar, b.tempo);
    expect([0, 1, 2, 3, 4].map((b) => perBar.get(b))).toEqual([100, 110, 120, 120, 120]);
    expect(s.time().visitSec).toBeCloseTo(10, 0);
    expect(s.running).toBe(false);
  });

  it('restarts the bar for a new time signature and is gone after dispose', async () => {
    const { s, run, played } = rig();
    const runs: boolean[] = [];
    s.onRunning((r) => runs.push(r));
    s.configure(DEFAULT_SETTINGS, 'woodblock');
    s.start();
    run(0.6);
    const before = played.length;
    s.configure({ ...DEFAULT_SETTINGS, meter: '3/4' }, 'woodblock');
    expect(s.running).toBe(true);
    run(3);
    const after = played.slice(before).map((c) => c.level);
    expect(after.slice(0, 4)).toEqual(['accent', 'beat', 'beat', 'accent']);
    const { currentSession } = await import('./session');
    expect(currentSession()).toBeNull();
    s.attach();
    expect(currentSession()).toBe(s);
    s.detach();
    expect(s.running).toBe(false);
    expect(currentSession()).toBeNull();
    s.attach();
    s.dispose();
    expect(currentSession()).toBeNull();
    expect(runs).toEqual([true, false]);
  });
});
