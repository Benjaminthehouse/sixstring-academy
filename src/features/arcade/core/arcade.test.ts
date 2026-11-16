import { describe, expect, it } from 'vitest';
import { scalePcs, chroma, getScale, scaleNotes, noteToMidi } from '@/core/theory';
import { midiAt, noteAt, STANDARD_TUNING, tuning as getTuning } from '@/core/guitar';
import { parseSixTab } from '@/core/song';
import { hashSeed, makeRng, rotation, shuffle } from './rng';
import { arcadeScales, boxOf, DEFAULT_FOCUS, focusFromParams, focusSlug, normalizeFocus, patternOf, regionOf, scaleTitle, shapesFor, tonicsFor } from './focus';
import { NOTE_HUNT_LEVELS, makeNoteHuntRound, answersTarget, targetMidis } from './noteHunt';
import { makeShapeRound, judgeShapeTap, shapeBuilderLevels, shapeScore } from './shapeBuilder';
import { RUN_LEVELS, RunJudge, runNotes, runOutcome, runTimeline, nextTempo, lateLimit, noteSeconds, runTip } from './runScale';
import { DARTS_LEVELS, DEGREE_INFO, degreePool, makeDartsRound } from './degreeDarts';
import { MODES, MODE_LEVELS, makeModeRound, modeLabel } from './modeMatch';
import { LICK_LEVELS, lickTab, makeLickRound, markLick } from './lickEcho';
import { SPRINT_LEVELS, makeSprintRound, sprintScore } from './sprint';
import { comboMultiplier, findPoints, judgeTiming, onTimeWindow, speedOf, starsFor } from './scoring';
import { GAMES, levelsOf, scopeOf, gameById } from './games';
import { applyDaily, applyRound, emptyRecords, highestOpen, isUnlocked, nextLevel, sanitizeRecords, starsIn } from './records';
import { dailyChallenge, dailyStars, DAILY_SIZE, localDateKey } from './daily';
import { gameParams, levelParams, parseLevelParam, skillIdFor } from './skill';

/** Every position in a pattern's region that sounds a note of its scale is drawable and in the scale. */
function inScale(tonic: string, scale: string, midi: number): boolean {
  return scalePcs(tonic, scale).includes(((midi % 12) + 12) % 12);
}

const SAMPLE_FOCI = [
  { tonic: 'A', scale: 'minor-pentatonic' },
  { tonic: 'E', scale: 'minor-pentatonic' },
  { tonic: 'G', scale: 'major-pentatonic' },
  { tonic: 'C', scale: 'major' },
  { tonic: 'F#', scale: 'major' },
  { tonic: 'Bb', scale: 'dorian' },
  { tonic: 'D', scale: 'mixolydian' },
  { tonic: 'A', scale: 'minor-blues' },
  { tonic: 'E', scale: 'harmonic-minor' },
  { tonic: 'C', scale: 'whole-tone' },
  { tonic: 'D', scale: 'hirajoshi' },
  { tonic: 'Eb', scale: 'bebop-dominant' },
];

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs);
    expect(hashSeed('2026-11-15')).toBe(hashSeed('2026-11-15'));
    expect(shuffle(makeRng(1), [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('rotation is fair and never repeats an item back to back', () => {
    for (let seed = 1; seed < 200; seed++) {
      const out = rotation(makeRng(seed), ['A', 'C', 'D', 'E', 'G'], 23);
      expect(out).toHaveLength(23);
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
      const counts = ['A', 'C', 'D', 'E', 'G'].map((x) => out.filter((y) => y === x).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });
});

describe('focus', () => {
  it('defaults to A minor pentatonic, box 1, and repairs bad input', () => {
    expect(normalizeFocus(null)).toEqual(DEFAULT_FOCUS);
    expect(normalizeFocus({ tonic: 'H', scale: 'nope', shape: 'x' })).toEqual(DEFAULT_FOCUS);
    expect(normalizeFocus({ tonic: 'A#', scale: 'major' }).tonic).toBe('Bb');
    expect(normalizeFocus({ tonic: 'C', scale: 'major', shape: 'box-1' }).shape).toBe(shapesFor('C', 'major')[0].id);
    expect(normalizeFocus({ tonic: 'C', scale: 'chromatic' }).scale).toBe('minor-pentatonic');
  });

  it('keeps a shape named by the Scales page even outside the drilled systems', () => {
    expect(normalizeFocus({ tonic: 'A', scale: 'minor-pentatonic', shape: 'string-6' }).shape).toBe('string-6');
    expect(patternOf({ tonic: 'A', scale: 'minor-pentatonic', shape: 'string-6' }).notes.every((n) => n.string === 6)).toBe(true);
    expect(normalizeFocus({ tonic: 'A', scale: 'minor-pentatonic', shape: 'nope-9' }).shape).toBe('box-1');
  });

  it('offers the five boxes for pentatonics, CAGED then 3NPS for seven-note scales', () => {
    expect(shapesFor('A', 'minor-pentatonic').map((p) => p.id)).toEqual(['box-1', 'box-2', 'box-3', 'box-4', 'box-5']);
    const major = shapesFor('G', 'major').map((p) => p.id);
    expect(major.slice(0, 5).every((id) => id.startsWith('caged-'))).toBe(true);
    expect(major.slice(5)).toEqual(['3nps-1', '3nps-2', '3nps-3', '3nps-4', '3nps-5', '3nps-6', '3nps-7']);
    expect(shapesFor('A', 'minor-blues')[0].id).toBe('position-1');
  });

  it('every arcade scale has playable shapes made of its own notes, in every tonic it offers', () => {
    expect(arcadeScales().find((s) => s.id === 'chromatic')).toBeUndefined();
    expect(arcadeScales().length).toBeGreaterThan(80);
    for (const s of arcadeScales()) {
      const tonics = tonicsFor(s.id);
      expect(tonics).toHaveLength(12);
      for (const tonic of [tonics[0], tonics[9]]) {
        const shapes = shapesFor(tonic, s.id);
        expect(shapes.length, `${tonic} ${s.id}`).toBeGreaterThan(0);
        for (const p of shapes) {
          const [from, to] = regionOf(p);
          for (const n of p.notes) {
            expect(inScale(tonic, s.id, n.midi), `${tonic} ${s.id} ${p.id} ${n.note}`).toBe(true);
            expect(midiAt(n)).toBe(n.midi);
            expect(n.fret).toBeGreaterThanOrEqual(from);
            expect(n.fret).toBeLessThanOrEqual(to);
          }
        }
      }
    }
  });

  it('reads route params and writes titles', () => {
    expect(focusFromParams('a-minor-pentatonic', 'box-2')).toEqual({ tonic: 'A', scale: 'minor-pentatonic', shape: 'box-2' });
    expect(focusFromParams('f-sharp-dorian')).toEqual({ tonic: 'F#', scale: 'dorian' });
    expect(focusFromParams('nonsense')).toBeNull();
    expect(focusFromParams('c-chromatic')).toBeNull();
    expect(focusSlug({ tonic: 'Bb', scale: 'major' })).toBe('bb-major');
    expect(scaleTitle({ tonic: 'A', scale: 'minor-pentatonic' })).toBe('A minor pentatonic');
    expect(scaleTitle({ tonic: 'D', scale: 'dorian' })).toBe('D Dorian');
    expect(scaleTitle({ tonic: 'F#', scale: 'major' })).toBe('F♯ major');
    expect(scaleTitle({ tonic: 'A', scale: 'minor' })).toBe('A natural minor');
  });

  it('draws a spare fret either side, and the open strings for low shapes', () => {
    expect(regionOf({ minFret: 5, maxFret: 8 })).toEqual([4, 9]);
    expect(regionOf({ minFret: 0, maxFret: 3 })).toEqual([0, 5]);
    expect(regionOf({ minFret: 2, maxFret: 5 })).toEqual([1, 6]);
    expect(boxOf({ minFret: 5, maxFret: 8, name: 'Box 1' })).toEqual({ from: 5, to: 8, label: 'Box 1' });
  });
});

describe('Note Hunt', () => {
  it('is deterministic per seed', () => {
    const p = patternOf(DEFAULT_FOCUS);
    for (const level of NOTE_HUNT_LEVELS) {
      expect(makeNoteHuntRound(p, level, 7).targets).toEqual(makeNoteHuntRound(p, level, 7).targets);
    }
    expect(makeNoteHuntRound(p, NOTE_HUNT_LEVELS[0], 7).targets.map((t) => t.lit)).not.toEqual(makeNoteHuntRound(p, NOTE_HUNT_LEVELS[0], 8).targets.map((t) => t.lit));
  });

  it('only ever asks for notes of the scale inside the shape', () => {
    for (const f of SAMPLE_FOCI) {
      for (const pattern of shapesFor(f.tonic, f.scale)) {
        const keys = new Set(pattern.notes.map((n) => `${n.string}:${n.fret}`));
        for (const level of NOTE_HUNT_LEVELS) {
          const round = makeNoteHuntRound(pattern, level, hashSeed(`${f.tonic}${f.scale}${pattern.id}${level.n}`));
          expect(round.targets).toHaveLength(level.targets);
          let prev = '';
          for (const t of round.targets) {
            expect(t.answers.length).toBeGreaterThan(0);
            for (const a of t.answers) {
              expect(keys.has(`${a.string}:${a.fret}`)).toBe(true);
              expect(inScale(f.tonic, f.scale, a.midi)).toBe(true);
              expect(a.note).toBe(t.note);
              expect(noteAt(a, { context: { tonic: f.tonic, scale: f.scale }, octave: false })).toBe(t.note);
            }
            if (level.mode === 'named') expect(t.answers).toEqual(pattern.notes.filter((n) => n.note === t.note));
            else expect(t.answers).toEqual([t.lit]);
            if (pattern.notes.length > 2 && new Set(pattern.notes.map((n) => n.note)).size > 1) expect(t.note).not.toBe(prev);
            prev = t.note;
            expect(answersTarget(t, t.answers[0])).toBe(true);
            expect(targetMidis(t)).toEqual([...new Set(t.answers.map((a) => a.midi))]);
          }
        }
      }
    }
  });

  it('scores speed and combo', () => {
    expect(findPoints(0.5, 0, true)).toBe(200);
    expect(findPoints(5, 0, true)).toBe(100);
    expect(findPoints(0.5, 10, true)).toBe(400);
    expect(findPoints(0.5, 0, false)).toBe(100);
    expect(speedOf(1)).toBe('fast');
    expect(speedOf(2)).toBe('good');
    expect(speedOf(3.5)).toBe('slow');
  });
});

describe('Shape Builder', () => {
  it('has one level per shape and keeps the roots as anchors', () => {
    for (const f of SAMPLE_FOCI) {
      const shapes = shapesFor(f.tonic, f.scale);
      const levels = shapeBuilderLevels(shapes);
      expect(levels.map((l) => l.shape)).toEqual(shapes.map((s) => s.id));
      expect(levels.map((l) => l.n)).toEqual(shapes.map((_, i) => i + 1));
      for (const p of shapes) {
        const r = makeShapeRound(p);
        expect(r.anchors.every((n) => n.degree === '1' && n.isRoot)).toBe(true);
        expect(r.anchors.length).toBeGreaterThan(0);
        expect([...r.anchors, ...r.toPlace].sort((a, b) => a.midi - b.midi)).toEqual([...p.notes].sort((a, b) => a.midi - b.midi));
        for (const n of r.toPlace) expect(inScale(f.tonic, f.scale, n.midi)).toBe(true);
      }
    }
    expect(levelsOf('shape-builder', { tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }).map((l) => l.title)).toEqual(['Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5']);
  });

  it('judges taps kindly and scores the build', () => {
    const r = makeShapeRound(patternOf(DEFAULT_FOCUS));
    const placed = new Set<string>();
    expect(judgeShapeTap(r, placed, { string: 6, fret: 5 })).toEqual({ kind: 'anchor' });
    const c = judgeShapeTap(r, placed, { string: 6, fret: 8 });
    expect(c.kind).toBe('place');
    placed.add('6:8');
    expect(judgeShapeTap(r, placed, { string: 6, fret: 8 })).toEqual({ kind: 'already' });
    expect(judgeShapeTap(r, placed, { string: 6, fret: 7 })).toEqual({ kind: 'miss' });
    expect(shapeScore({ placed: 9, mistakes: 0, peeks: 0, seconds: 20 }).accuracy).toBe(1);
    expect(shapeScore({ placed: 9, mistakes: 1, peeks: 0, seconds: 20 }).accuracy).toBeCloseTo(0.9);
    expect(shapeScore({ placed: 9, mistakes: 0, peeks: 1, seconds: 20 }).accuracy).toBeCloseTo(0.9);
    expect(shapeScore({ placed: 9, mistakes: 0, peeks: 0, seconds: 10 }).score).toBeGreaterThan(shapeScore({ placed: 9, mistakes: 0, peeks: 0, seconds: 30 }).score);
  });
});

describe('Run the Scale', () => {
  const box1 = patternOf(DEFAULT_FOCUS);

  it('runs are the shape in playing order', () => {
    const up = runNotes(box1, RUN_LEVELS[0]);
    expect(up.map((n) => n.midi)).toEqual([...box1.notes].map((n) => n.midi));
    for (let i = 1; i < up.length; i++) expect(up[i].midi).toBeGreaterThan(up[i - 1].midi);
    const upDown = runNotes(box1, RUN_LEVELS[1]);
    expect(upDown).toHaveLength(box1.notes.length * 2 - 1);
    const thirds = runNotes(box1, RUN_LEVELS[4]);
    for (let i = 1; i < thirds.length; i++) expect(thirds[i].midi).not.toBe(thirds[i - 1].midi);
    for (const f of SAMPLE_FOCI) {
      for (const p of shapesFor(f.tonic, f.scale)) {
        for (const level of RUN_LEVELS) for (const n of runNotes(p, level)) expect(inScale(f.tonic, f.scale, n.midi)).toBe(true);
      }
    }
  });

  it('lays clicks and notes on the beat after a count-in', () => {
    const t = runTimeline(12, 60, 1, 10);
    expect(t.clicks).toHaveLength(16);
    expect(t.clicks[0]).toEqual({ time: 10, accent: true, countIn: true });
    expect(t.noteTimes[0]).toBe(14);
    expect(t.noteTimes[11]).toBe(25);
    expect(t.end).toBe(26);
    const e = runTimeline(5, 120, 2, 0);
    expect(e.noteTimes).toEqual([2, 2.25, 2.5, 2.75, 3]);
    expect(e.clicks).toHaveLength(4 + 3);
    expect(noteSeconds(60, 2)).toBe(0.5);
  });

  it('judges on time, early, late, wrong, skipped and missed notes', () => {
    const midis = [45, 48, 50, 52, 55, 57];
    const times = [10, 11, 12, 13, 14, 15];
    const j = new RunJudge(midis, times, 1);
    expect(j.window).toBeCloseTo(onTimeWindow(1));
    expect(j.play(45, 10.02)).toMatchObject({ kind: 'judged', judgement: { index: 0, kind: 'on-time' } });
    expect(j.play(48, 10.8)).toMatchObject({ kind: 'judged', judgement: { index: 1, kind: 'early' } });
    expect(j.play(60, 12)).toEqual({ kind: 'wrong', index: 2, midi: 60 });
    // 50 is skipped: 52 is heard, so 50 is missed and 52 judged late.
    const skip = j.play(52, 13.3);
    expect(skip).toMatchObject({ kind: 'judged', judgement: { index: 3, kind: 'late' }, skipped: [{ index: 2, kind: 'missed', wrong: 1 }] });
    expect(j.tick(14.5)).toEqual([]);
    expect(j.tick(14 + lateLimit(1) + 0.01)).toMatchObject([{ index: 4, kind: 'missed' }]);
    expect(j.play(57, 15)).toMatchObject({ kind: 'judged', judgement: { index: 5, kind: 'on-time' } });
    expect(j.done).toBe(true);
    const o = runOutcome(j.results);
    expect(o).toMatchObject({ notes: 6, onTime: 2, early: 1, late: 1, missed: 2, wrong: 1, clean: false });
    expect(o.accuracy).toBeCloseTo((1 + 1 + 0.5 + 0.5) / 6);
    expect(runTip(o)).toMatch(/./);
  });

  it('ignores leftovers from before the run and accepts any octave when asked', () => {
    const j = new RunJudge([45, 48], [10, 11], 1, { octaves: 'any' });
    expect(j.play(45, 5)).toEqual({ kind: 'ignored' });
    expect(j.play(57, 10)).toMatchObject({ kind: 'judged', judgement: { kind: 'on-time' } });
    expect(j.accepting()).toEqual([48]);
  });

  it('a clean run climbs the ladder; a messy one stays', () => {
    const j = new RunJudge([45, 48, 50, 52], [0, 1, 2, 3], 1);
    [0, 1, 2, 3].forEach((i) => j.play([45, 48, 50, 52][i], i + 0.01));
    const o = runOutcome(j.results);
    expect(o.clean).toBe(true);
    expect(nextTempo(RUN_LEVELS[0], 60, o.clean)).toBe(66);
    expect(nextTempo(RUN_LEVELS[0], 60, false)).toBe(60);
    expect(j.bestCombo).toBe(4);
    expect(j.score).toBe(Math.round(100 * comboMultiplier(0)) + Math.round(100 * comboMultiplier(1)) + Math.round(100 * comboMultiplier(2)) + Math.round(100 * comboMultiplier(3)));
  });

  it('timing windows', () => {
    expect(onTimeWindow(1)).toBeCloseTo(0.11);
    expect(onTimeWindow(0.25)).toBeCloseTo(0.06);
    expect(judgeTiming(-0.2, 0.1)).toBe('early');
    expect(judgeTiming(0.05, 0.1)).toBe('on-time');
    expect(judgeTiming(0.2, 0.1)).toBe('late');
  });
});

describe('Degree Darts', () => {
  it('calls degrees of the scale and accepts every place they sit in the shape', () => {
    for (const f of SAMPLE_FOCI) {
      const degrees = getScale(f.scale)!.degrees;
      const notes = scaleNotes(f.tonic, f.scale);
      for (const pattern of shapesFor(f.tonic, f.scale)) {
        for (const level of DARTS_LEVELS) {
          const round = makeDartsRound(pattern, degrees, level, hashSeed(`${f.scale}${pattern.id}${level.n}`));
          expect(round.darts).toEqual(makeDartsRound(pattern, degrees, level, hashSeed(`${f.scale}${pattern.id}${level.n}`)).darts);
          for (const d of round.darts) {
            expect(degrees).toContain(d.degree);
            expect(d.note).toBe(notes[degrees.indexOf(d.degree)]);
            expect(d.answers).toEqual(pattern.notes.filter((n) => n.degree === d.degree));
            for (const a of d.answers) expect(chroma(a.note)).toBe(((a.midi % 12) + 12) % 12);
          }
          for (let i = 1; i < round.darts.length; i++) if (new Set(round.darts.map((d) => d.degree)).size > 1) expect(round.darts[i].degree).not.toBe(round.darts[i - 1].degree);
        }
      }
    }
  });

  it('pools: root and fifth, the triad, everything', () => {
    expect(degreePool(['1', 'b3', '4', '5', 'b7'], 'root-fifth')).toEqual(['1', '5']);
    expect(degreePool(['1', 'b3', '4', '5', 'b7'], 'triad')).toEqual(['1', 'b3', '5']);
    expect(degreePool(['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'], 'root-fifth')).toEqual(['1', 'b5']);
    expect(degreePool(['1', '2', '3', '#4', '#5', 'b7'], 'triad')).toEqual(['1', '3', '#5']);
    for (const s of arcadeScales()) for (const d of s.degrees) expect(DEGREE_INFO[d], d).toBeDefined();
  });
});

describe('Mode Match', () => {
  it('plays the right mode over a drone on its tonic', () => {
    for (const level of MODE_LEVELS) {
      for (let seed = 1; seed < 12; seed++) {
        const round = makeModeRound(level, seed);
        expect(round.questions).toEqual(makeModeRound(level, seed).questions);
        expect(round.questions).toHaveLength(level.questions);
        for (const q of round.questions) {
          expect(level.modes).toContain(q.mode);
          expect(q.options).toEqual(MODES.map((m) => m.id).filter((id) => level.modes.includes(id)));
          const pcs = scalePcs(q.tonic, q.mode);
          expect(q.notes).toHaveLength(15);
          expect(q.notes[0] % 12).toBe(chroma(q.tonic));
          expect(q.notes[7] - q.notes[0]).toBe(12);
          for (const m of q.notes) expect(pcs).toContain(m % 12);
          expect(q.drone % 12).toBe(chroma(q.tonic));
          expect(q.drone).toBe(q.notes[0] - 12);
          expect(q.drone).toBeGreaterThanOrEqual(40);
          expect(Math.max(...q.notes)).toBeLessThanOrEqual(76);
          if (q.kind === 'eye') {
            expect(q.pattern).not.toBeNull();
            for (const n of q.pattern!.notes) expect(pcs).toContain(n.midi % 12);
            expect(q.pattern!.notes.some((n) => n.isRoot)).toBe(true);
          }
        }
        if (level.eye === 0) expect(round.questions.every((q) => q.kind === 'ear')).toBe(true);
        if (level.eye === 1) expect(round.questions.every((q) => q.kind === 'eye')).toBe(true);
      }
    }
  });

  it('pins the tonic when asked and labels modes plainly on the first level', () => {
    const r = makeModeRound(MODE_LEVELS[4], 3, { tonic: 'G', size: 4 });
    expect(r.questions).toHaveLength(4);
    for (const q of r.questions) expect(chroma(q.tonic)).toBe(7);
    expect(modeLabel('major', true)).toBe('Major');
    expect(modeLabel('minor', false)).toBe('Aeolian (minor)');
    expect(modeLabel('dorian', false)).toBe('Dorian');
  });
});

describe('Lick Echo', () => {
  it('phrases are notes of the shape, stepwise mostly, ending on the root or 5th', () => {
    for (const f of SAMPLE_FOCI) {
      for (const pattern of shapesFor(f.tonic, f.scale)) {
        const keys = new Set(pattern.notes.map((n) => `${n.string}:${n.fret}`));
        for (const level of LICK_LEVELS) {
          const round = makeLickRound(pattern, level, hashSeed(`${f.scale}${pattern.id}${level.n}`));
          expect(round.licks).toEqual(makeLickRound(pattern, level, hashSeed(`${f.scale}${pattern.id}${level.n}`)).licks);
          expect(round.licks).toHaveLength(level.licks);
          for (const lick of round.licks) {
            expect(lick.notes).toHaveLength(level.length);
            expect(lick.midis).toEqual(lick.notes.map((n) => n.midi));
            for (const n of lick.notes) {
              expect(keys.has(`${n.string}:${n.fret}`)).toBe(true);
              expect(inScale(f.tonic, f.scale, n.midi)).toBe(true);
            }
            for (let i = 1; i < lick.midis.length; i++) expect(lick.midis[i]).not.toBe(lick.midis[i - 1]);
            const parsed = parseSixTab(`title: Lick\ntempo: ${lick.bpm}\ntime: 4/4\n${lick.tab}\n`);
            expect(parsed.errors, lick.tab).toEqual([]);
            const played = parsed.song!.tracks[0].measures.flatMap((b) => b.beats.flatMap((beat) => beat.notes.map((n) => n.midi)));
            expect(played).toEqual(lick.midis);
          }
        }
      }
    }
  });

  it('most phrases come to rest on the root or the 5th', () => {
    const p = patternOf(DEFAULT_FOCUS);
    const round = makeLickRound(p, LICK_LEVELS[3], 99, 40);
    const resting = round.licks.filter((l) => ['1', '5'].includes(l.notes[l.notes.length - 1].degree)).length;
    expect(resting / round.licks.length).toBeGreaterThan(0.8);
  });

  it('writes tab bars that add up and marks what was played', () => {
    expect(lickTab([{ string: 6, fret: 5 }, { string: 6, fret: 8 }, { string: 5, fret: 5 }])).toBe('| q 6:5 6:8 5:5 r |');
    expect(lickTab([1, 2, 3, 4, 5].map((f) => ({ string: 1, fret: f })))).toBe('| e 1:1 1:2 1:3 1:4 1:5 r q r |');
    const m = markLick([45, 48, 51, 52], [45, 48, 50, 52]);
    expect(m.perNote).toEqual(['right', 'right', 'wrong', 'right']);
    expect(m.perfect).toBe(false);
    expect(markLick([45, 48], [45, 48]).points).toBe(200);
    expect(markLick([57, 60], [45, 48], 'any').perfect).toBe(true);
    expect(markLick([45], [45, 48]).perNote).toEqual(['right', 'missed']);
  });
});

describe('Fretboard Sprint', () => {
  it('finds every place of the note within the frets', () => {
    for (const f of SAMPLE_FOCI) {
      const degrees = getScale(f.scale)!.degrees;
      for (const level of SPRINT_LEVELS) {
        const round = makeSprintRound(f, degrees, level, 5);
        expect(round.sprints).toHaveLength(level.sprints);
        expect(round.frets).toEqual([0, level.maxFret]);
        for (const s of round.sprints) {
          expect(degrees).toContain(s.degree);
          expect(s.positions.length).toBeGreaterThanOrEqual(level.maxFret >= 11 ? 6 : 3);
          for (const p of s.positions) {
            expect(p.fret).toBeLessThanOrEqual(level.maxFret);
            expect(midiAt(p) % 12).toBe(chroma(s.note));
          }
          // And nothing is left out: every cell of that pitch class is listed.
          let all = 0;
          for (let string = 1; string <= 6; string++) for (let fret = 0; fret <= level.maxFret; fret++) if (midiAt({ string, fret }) % 12 === chroma(s.note)) all++;
          expect(s.positions).toHaveLength(all);
        }
        if (level.pool === 'root') expect(round.sprints.every((s) => s.degree === '1')).toBe(true);
      }
    }
  });

  it('follows the tuning', () => {
    const dropD = getTuning('drop-d');
    const r = makeSprintRound({ tonic: 'D', scale: 'major' }, getScale('major')!.degrees, SPRINT_LEVELS[0], 1, { tuning: dropD });
    expect(r.sprints[0].positions.some((p) => p.string === 6 && p.fret === 0)).toBe(true);
    expect(sprintScore({ found: 8, total: 8, wrong: 0, secondsLeft: 12.4 })).toEqual({ score: 920, accuracy: 1 });
    expect(sprintScore({ found: 6, total: 8, wrong: 2, secondsLeft: 0 }).accuracy).toBeCloseTo(0.6);
  });
});

describe('records', () => {
  it('opens levels one star at a time and keeps bests', () => {
    let rec = emptyRecords();
    expect(isUnlocked(rec, 'note-hunt', 'minor-pentatonic', 1)).toBe(true);
    expect(isUnlocked(rec, 'note-hunt', 'minor-pentatonic', 2)).toBe(false);
    expect(nextLevel(rec, 'note-hunt', 'minor-pentatonic', 5)).toBe(1);
    let ch = applyRound(rec, { game: 'note-hunt', scope: 'minor-pentatonic', level: 1, levelCount: 5, stars: 0, score: 500, scaleSlug: 'a-minor-pentatonic', at: 1 });
    expect(ch.unlocked).toBeNull();
    expect(ch.gameBest).toBe(true);
    rec = ch.records;
    ch = applyRound(rec, { game: 'note-hunt', scope: 'minor-pentatonic', level: 1, levelCount: 5, stars: 2, score: 400, scaleSlug: 'a-minor-pentatonic', at: 2 });
    expect(ch.unlocked).toBe(2);
    expect(ch.gameBest).toBe(false);
    expect(ch.levelBest).toBe(false);
    expect(ch.starsBefore).toBe(0);
    rec = ch.records;
    expect(rec.levels['note-hunt']!['minor-pentatonic']['1']).toMatchObject({ stars: 2, best: 500, plays: 2 });
    expect(isUnlocked(rec, 'note-hunt', 'minor-pentatonic', 2)).toBe(true);
    expect(highestOpen(rec, 'note-hunt', 'minor-pentatonic', 5)).toBe(2);
    expect(nextLevel(rec, 'note-hunt', 'minor-pentatonic', 5)).toBe(2);
    expect(starsIn(rec, 'note-hunt', 'minor-pentatonic', 5)).toEqual({ stars: 2, max: 15 });
    // Another scale is its own world.
    expect(isUnlocked(rec, 'note-hunt', 'major', 2)).toBe(false);
    // A worse replay never lowers stars.
    rec = applyRound(rec, { game: 'note-hunt', scope: 'minor-pentatonic', level: 1, levelCount: 5, stars: 1, score: 10, scaleSlug: 'x', at: 3 }).records;
    expect(rec.levels['note-hunt']!['minor-pentatonic']['1'].stars).toBe(2);
  });

  it('when every level has stars, points at the first short of three', () => {
    let rec = emptyRecords();
    for (const [n, s] of [[1, 3], [2, 1], [3, 3]] as const) rec = applyRound(rec, { game: 'degree-darts', scope: 'major', level: n, levelCount: 3, stars: s, score: 1, scaleSlug: 'c-major', at: n }).records;
    expect(nextLevel(rec, 'degree-darts', 'major', 3)).toBe(2);
  });

  it('survives damaged storage', () => {
    expect(sanitizeRecords(null)).toEqual(emptyRecords());
    expect(sanitizeRecords('junk')).toEqual(emptyRecords());
    const s = sanitizeRecords({ focus: { tonic: 'C', scale: 'major', shape: 'caged-c' }, input: 'mic', levels: { 'note-hunt': { major: { '1': { stars: 9, best: -4, plays: 'x' }, bad: 1 } } }, bests: { 'note-hunt': { score: 50 } }, daily: { date: '2026-01-01', score: 3, stars: 2, done: true } });
    expect(s.focus).toEqual({ tonic: 'C', scale: 'major', shape: 'caged-c' });
    expect(s.input).toBe('mic');
    expect(s.levels['note-hunt']!.major['1']).toEqual({ stars: 3, best: 0, plays: 0, at: 0 });
    expect(s.bests['note-hunt']).toMatchObject({ score: 50, level: 1 });
    expect(s.daily).toEqual({ date: '2026-01-01', score: 3, stars: 2, done: true });
  });

  it('keeps the better daily result of the day', () => {
    let rec = applyDaily(emptyRecords(), { date: '2026-11-15', score: 900, stars: 2, done: true });
    rec = applyDaily(rec, { date: '2026-11-15', score: 500, stars: 3, done: true });
    expect(rec.daily).toEqual({ date: '2026-11-15', score: 900, stars: 3, done: true });
    rec = applyDaily(rec, { date: '2026-11-16', score: 100, stars: 1, done: false });
    expect(rec.daily).toEqual({ date: '2026-11-16', score: 100, stars: 1, done: false });
    expect(rec.dailyBest).toBe(900);
  });
});

describe('games, skills and the daily challenge', () => {
  it('every game has levels and a scope', () => {
    expect(GAMES).toHaveLength(7);
    for (const g of GAMES) {
      const levels = levelsOf(g.id, DEFAULT_FOCUS);
      expect(levels.length, g.id).toBeGreaterThanOrEqual(5);
      expect(levels.map((l) => l.n)).toEqual(levels.map((_, i) => i + 1));
      expect(gameById(g.id)).toBe(g);
    }
    expect(scopeOf('mode-match', DEFAULT_FOCUS)).toBe('modes');
    expect(scopeOf('note-hunt', DEFAULT_FOCUS)).toBe('minor-pentatonic');
    expect(gameById('nope')).toBeNull();
  });

  it('skill ids follow the progress conventions', () => {
    expect(skillIdFor('note-hunt', DEFAULT_FOCUS, 2)).toBe('scale:a-minor-pentatonic:box-1');
    expect(skillIdFor('shape-builder', { tonic: 'G', scale: 'major', shape: 'caged-e' }, 2)).toBe('scale:g-major:caged-e');
    expect(skillIdFor('fretboard-sprint', DEFAULT_FOCUS, 1)).toBe('scale:a-minor-pentatonic:neck');
    expect(skillIdFor('mode-match', DEFAULT_FOCUS, 3)).toBe('arcade:mode-match:level-3');
    expect(gameParams('note-hunt', DEFAULT_FOCUS)).toEqual(['note-hunt', 'a-minor-pentatonic', 'box-1']);
    expect(levelParams('note-hunt', DEFAULT_FOCUS, 4)).toEqual(['note-hunt', 'a-minor-pentatonic', 'box-1', 'level-4']);
    expect(parseLevelParam('level-12')).toBe(12);
    expect(parseLevelParam('box-1')).toBeNull();
  });

  it('the daily challenge is the same all day, three different games, one on the shape', () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-02-${String(day).padStart(2, '0')}`;
      const a = dailyChallenge(date, DEFAULT_FOCUS, () => 2);
      expect(a).toEqual(dailyChallenge(date, DEFAULT_FOCUS, () => 2));
      expect(new Set(a.map((s) => s.game)).size).toBe(3);
      expect(a.some((s) => ['note-hunt', 'shape-builder', 'degree-darts', 'fretboard-sprint'].includes(s.game))).toBe(true);
      for (const s of a) {
        expect(s.level).toBe(2);
        expect(s.size).toBe(DAILY_SIZE[s.game]);
      }
    }
    const days = new Set(Array.from({ length: 10 }, (_, d) => dailyChallenge(`2026-03-0${d}`, DEFAULT_FOCUS, () => 1).map((s) => s.game).join()));
    expect(days.size).toBeGreaterThan(3);
    expect(dailyStars([3, 2, 3])).toBe(2);
    expect(localDateKey(new Date(2026, 10, 5))).toBe('2026-11-05');
  });

  it('stars follow the app-wide 60 / 80 / 95 rule', () => {
    expect([0, 0.59, 0.6, 0.79, 0.8, 0.94, 0.95, 1].map(starsFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('midi of default focus and tuning agree', () => {
    expect(STANDARD_TUNING.midi).toEqual([40, 45, 50, 55, 59, 64]);
    expect(noteToMidi('A2')).toBe(45);
  });
});
