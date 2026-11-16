import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, midiAt, tuning as getTuning } from '@/core/guitar';
import { sixTab } from '@/core/song';
import { chroma, scaleNotes as theoryScaleNotes, chordPcs } from '@/core/theory';
import { boardEdgeY, fretX, poseFromWireTaps, projectMarker, projectPlanePoint, stringY, type FretboardPose, type TrackerUpdate } from '@/core/vision';
import { DEFAULT_CONTENT, cameraParams, parseCameraParams, sanitizeContent, type CameraContent } from './address';
import { DEFAULT_WIRES, fretChoices, stickerPrompt, tapSteps, tooClose, validPair, wireTaps } from './calibrate';
import { MAX_FRET, boardRange, chordNotes, chordTitle, joinChord, matchHeard, noteLabel, scaleNotes, scaleTitle, splitChord, toFretMarkers, toOverlay } from './content';
import { answers, drillCandidates, drillNote, nextTarget } from './drill';
import { GUITAR_KINDS, defaultGuitarKind, isGuitarKind, neckFor, stringCountOf, stringNamesFor } from './guitar';
import { FAR_FROM_WIRE, frettingHand, handAdvice, readFingers } from './hands';
import { describeStep, songPlan, stepHeard, stepIndexAt, stepNotes } from './song';
import { GHOST_MS, MARK_THE_NECK, SOLID_CONFIDENCE, STARTING_STATUS, announcement, describeStatus, sameStatus } from './status';

const SETUP = { tuning: STANDARD_TUNING, capo: 0 };

describe('address', () => {
  it('reads and writes every kind of content', () => {
    const cases: Array<[string[], CameraContent]> = [
      [['scale', 'a', 'minor-pentatonic', 'box-1'], { kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }],
      [['scale', 'f-sharp', 'dorian', 'caged-e'], { kind: 'scale', tonic: 'F#', scale: 'dorian', shape: 'caged-e' }],
      [['scale', 'bb', 'major', 'all'], { kind: 'scale', tonic: 'Bb', scale: 'major', shape: 'all' }],
      [['chord', 'g-major'], { kind: 'chord', symbol: 'G', voicing: 0 }],
      [['chord', 'a-m7', '3'], { kind: 'chord', symbol: 'Am7', voicing: 2 }],
      [['song', 'hot-cross-buns'], { kind: 'song', id: 'hot-cross-buns' }],
      [['note', 'c', '5'], { kind: 'note', note: 'C', string: 5 }],
      [['note'], { kind: 'note', note: null, string: null }],
    ];
    for (const [params, content] of cases) {
      expect(parseCameraParams(params)).toEqual(content);
      expect(parseCameraParams(cameraParams(content))).toEqual(content);
    }
  });

  it('accepts the one-piece scale slug and fills a missing shape with every note', () => {
    expect(parseCameraParams(['scale', 'a-minor-pentatonic'])).toEqual({ kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'all' });
    expect(parseCameraParams(['scale', 'a', 'minor-pentatonic', 'nonsense'])).toMatchObject({ shape: 'all' });
  });

  it('refuses what names nothing', () => {
    expect(parseCameraParams([])).toBeNull();
    expect(parseCameraParams(['scale', 'h', 'nope'])).toBeNull();
    expect(parseCameraParams(['chord', 'zz'])).toBeNull();
    expect(parseCameraParams(['dance'])).toBeNull();
    expect(parseCameraParams(['song', 'Bad Id!'])).toEqual({ kind: 'song', id: null });
  });

  it('cleans stored content', () => {
    expect(sanitizeContent(null)).toEqual(DEFAULT_CONTENT);
    expect(sanitizeContent({ kind: 'scale', tonic: 'Q', scale: 'major' })).toEqual(DEFAULT_CONTENT);
    expect(sanitizeContent({ kind: 'chord', symbol: 'Dm7', voicing: 2.5 })).toEqual({ kind: 'chord', symbol: 'Dm7', voicing: 0 });
    expect(sanitizeContent({ kind: 'note', note: 'F#', string: 9 })).toEqual({ kind: 'note', note: 'F#', string: null });
    expect(sanitizeContent({ kind: 'song', id: 'greensleeves-fingerstyle' })).toEqual({ kind: 'song', id: 'greensleeves-fingerstyle' });
  });
});

describe('content', () => {
  it('a scale shape: every note belongs to the scale, at its real pitch, with its degree', () => {
    const { notes, shape, options } = scaleNotes({ kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }, SETUP);
    expect(shape).toMatchObject({ id: 'box-1', name: 'Box 1' });
    expect(options.map((o) => o.id)).toEqual(['box-1', 'box-2', 'box-3', 'box-4', 'box-5', 'all']);
    const pcs = new Set(theoryScaleNotes('A', 'minor-pentatonic').map((n) => chroma(n)));
    expect(notes.length).toBe(12);
    for (const n of notes) {
      expect(pcs.has(chroma(n.note))).toBe(true);
      expect(n.midi).toBe(midiAt(n, { tuning: STANDARD_TUNING }));
      expect(n.fret).toBeGreaterThanOrEqual(5);
      expect(n.fret).toBeLessThanOrEqual(8);
    }
    expect(notes.filter((n) => n.root).every((n) => chroma(n.note) === chroma('A'))).toBe(true);
  });

  it('"every note" covers frets 0-12 and an unknown shape falls back to the first', () => {
    const all = scaleNotes({ kind: 'scale', tonic: 'C', scale: 'major', shape: 'all' }, SETUP).notes;
    expect(Math.min(...all.map((n) => n.fret))).toBe(0);
    expect(Math.max(...all.map((n) => n.fret))).toBe(12);
    // Every string has its open note in C major, so eight notes per string over frets 0-12.
    expect(all.length).toBe(48);
    const fallback = scaleNotes({ kind: 'scale', tonic: 'C', scale: 'major', shape: 'box-9' }, SETUP);
    expect(fallback.shape.id).toBe(fallback.options[0].id);
  });

  it('with a capo the scale still sounds right and frets count from the capo', () => {
    const capo = 2;
    const { notes } = scaleNotes({ kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }, { tuning: STANDARD_TUNING, capo });
    const pcs = new Set(theoryScaleNotes('A', 'minor-pentatonic').map((n) => chroma(n)));
    for (const n of notes) {
      expect(n.midi).toBe(STANDARD_TUNING.midi[6 - n.string] + capo + n.fret);
      expect(pcs.has(n.midi % 12)).toBe(true);
    }
    const overlay = toOverlay(notes, capo, 'degree');
    expect(overlay.map((o) => o.fret)).toEqual(notes.map((n) => n.fret + capo));
  });

  it('a chord voicing: the open G, its tones and its muted strings', () => {
    const g = chordNotes({ kind: 'chord', symbol: 'G', voicing: 0 }, SETUP);
    expect(g.voicing?.frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(g.muted).toEqual([]);
    const pcs = new Set(chordPcs('G'));
    expect(g.notes.every((n) => pcs.has(n.midi % 12))).toBe(true);
    const c = chordNotes({ kind: 'chord', symbol: 'C', voicing: 0 }, SETUP);
    expect(c.muted).toEqual([6]);
    expect(c.count).toBeGreaterThan(1);
    // A voicing index past the end clamps to the last one.
    expect(chordNotes({ kind: 'chord', symbol: 'C', voicing: 999 }, SETUP).voicing?.id).toBe(chordNotes({ kind: 'chord', symbol: 'C', voicing: c.count - 1 }, SETUP).voicing?.id);
    expect(chordNotes({ kind: 'chord', symbol: 'Xyz', voicing: 0 }, SETUP).notes).toEqual([]);
  });

  it('labels: root as R, degrees with glyphs, note names, fingers', () => {
    expect(noteLabel({ degree: '1', note: 'A', root: true }, 'degree')).toBe('R');
    expect(noteLabel({ degree: 'b3', note: 'C', root: false }, 'degree')).toBe('♭3');
    expect(noteLabel({ degree: 'b3', note: 'F#', root: false }, 'note')).toBe('F♯');
    expect(noteLabel({ degree: '5', note: 'E', root: false }, 'note', 'solfege')).toBe('Mi');
    expect(noteLabel({ degree: '5', note: 'E', root: false, finger: 3 }, 'finger')).toBe('3');
    expect(noteLabel({ degree: '5', note: 'E', root: false, finger: 0 }, 'finger')).toBe('');
    expect(noteLabel({ degree: '', note: 'Bb', root: false }, 'degree')).toBe('B♭');
  });

  it('titles', () => {
    expect(scaleTitle({ tonic: 'A', scale: 'minor-pentatonic' })).toBe('A minor pentatonic');
    expect(scaleTitle({ tonic: 'F#', scale: 'dorian' })).toBe('F♯ dorian');
    expect(chordTitle('G')).toBe('G major');
    expect(chordTitle('Am7')).toBe('Am7');
    expect(chordTitle('C/E')).toBe('C/E');
  });

  it('overlay and drawn-neck markers keep degree colours with labels; open strings behind a capo are outlines', () => {
    const { notes } = chordNotes({ kind: 'chord', symbol: 'G', voicing: 0 }, SETUP);
    const overlay = toOverlay(notes, 0, 'degree');
    expect(overlay.find((o) => o.string === 6)).toMatchObject({ fret: 3, label: 'R', degree: 1 });
    expect(overlay.find((o) => o.string === 5)).toMatchObject({ fret: 2, label: '3', degree: 3 });
    expect(overlay.every((o) => !o.ghost)).toBe(true);
    expect(toOverlay(notes, 2, 'degree').filter((o) => o.ghost).length).toBe(notes.filter((n) => n.fret === 0).length);
    const markers = toFretMarkers(notes, 'degree');
    expect(markers.find((m) => m.string === 6)).toMatchObject({ fret: 3, label: 'R', color: 'deg-1', root: true, state: 'normal' });
    const named = toFretMarkers(notes, 'note');
    expect(named.every((m) => m.noteLabel === true)).toBe(true);
  });

  it('a drawn neck shows the notes with room either side and at least five frets', () => {
    const box = scaleNotes({ kind: 'scale', tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }, SETUP).notes;
    expect(boardRange(box, 0)).toEqual([4, 9]);
    const open = chordNotes({ kind: 'chord', symbol: 'G', voicing: 0 }, SETUP).notes;
    expect(boardRange(open, 0)).toEqual([0, 5]);
    expect(boardRange([], 0)).toEqual([0, 12]);
    expect(boardRange(box, 3)[0]).toBeLessThanOrEqual(2);
  });

  it('a heard pitch finds the note on the neck, targets first, never an outline', () => {
    const notes = [
      { string: 3, fret: 2, midi: 57, note: 'A', degree: '1', root: true },
      { string: 4, fret: 7, midi: 57, note: 'A', degree: '1', root: true, target: true },
      { string: 2, fret: 1, midi: 60, note: 'C', degree: 'b3', root: false, ghost: true },
    ];
    expect(matchHeard(notes, 57).map((n) => n.string)).toEqual([4, 3]);
    expect(matchHeard(notes, 60)).toEqual([]);
    expect(matchHeard(notes, 58)).toEqual([]);
  });

  it('splits and joins chord symbols for the root and type pickers', () => {
    expect(splitChord('Am7')).toEqual({ root: 'A', type: 'm7' });
    expect(splitChord('G')).toEqual({ root: 'G', type: 'major' });
    expect(splitChord('C#m')).toEqual({ root: 'C#', type: 'minor' });
    expect(splitChord('Bb7')).toEqual({ root: 'Bb', type: '7' });
    expect(splitChord('C/E')).toEqual({ root: 'C', type: 'major' });
    for (const s of ['Am7', 'G', 'C#m', 'Bb7', 'Fmaj7', 'Dsus4', 'Em7b5']) expect(joinChord(splitChord(s).root, splitChord(s).type)).toBe(s);
  });

  it('caps the shapes at a reachable fret', () => {
    expect(MAX_FRET).toBeGreaterThanOrEqual(12);
  });
});

describe('drill', () => {
  it('natural notes only by default, every one at its real pitch', () => {
    const all = drillCandidates({ tuning: STANDARD_TUNING, capo: 0, string: null, note: null });
    for (const t of all) {
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(t.midi % 12);
      expect(t.midi).toBe(midiAt(t, { tuning: STANDARD_TUNING }));
      expect(chroma(t.note)).toBe(t.midi % 12);
    }
    expect(all.length).toBe(48);
  });

  it('a chosen note on a chosen string', () => {
    const c5 = drillCandidates({ tuning: STANDARD_TUNING, capo: 0, string: 5, note: 'C' });
    expect(c5).toEqual([{ note: 'C', string: 5, fret: 3, midi: 48 }]);
    const fs = drillCandidates({ tuning: STANDARD_TUNING, capo: 0, string: 1, note: 'F#' });
    expect(fs.map((t) => t.fret)).toEqual([2]);
    expect(fs[0].note).toBe('F#');
  });

  it('never asks the same note twice in a row when there is a choice', () => {
    let prev = null;
    let r = 0.123;
    const random = () => (r = (r * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 50; i++) {
      const t = nextTarget({ tuning: STANDARD_TUNING, capo: 0, string: 6, note: null }, prev, random);
      expect(t).not.toBeNull();
      if (prev) expect(chroma(t!.note)).not.toBe(chroma(prev.note));
      prev = t;
    }
  });

  it('answers: the exact pitch, or any octave when allowed; the target pulses', () => {
    const t = { note: 'C', string: 5, fret: 3, midi: 48 };
    expect(answers(t, 48)).toBe(true);
    expect(answers(t, 60)).toBe(false);
    expect(answers(t, 60, true)).toBe(true);
    expect(answers(t, 49, true)).toBe(false);
    expect(drillNote(t)).toMatchObject({ string: 5, fret: 3, target: true });
    // Drawn in the strongest colour, labelled with its name.
    expect(toOverlay([drillNote(t)], 0, 'note')[0]).toMatchObject({ string: 5, fret: 3, degree: 1, label: 'C', target: true });
    expect(toFretMarkers([drillNote(t)], 'note')[0]).toMatchObject({ color: 'deg-1', state: 'target', noteLabel: true });
  });
});

describe('guitar', () => {
  it('maps guitar kinds to neck models with the right string count', () => {
    for (const g of GUITAR_KINDS) {
      const neck = neckFor(g.id);
      const strings = typeof neck === 'string' ? 6 : neck.stringCount;
      expect(strings).toBe(stringCountOf(g.id));
    }
    expect(isGuitarKind('steel')).toBe(true);
    expect(isGuitarKind('banjo')).toBe(false);
  });

  it('picks a default from the tuning and names the strings low to high', () => {
    expect(defaultGuitarKind(STANDARD_TUNING)).toBe('steel');
    expect(defaultGuitarKind(getTuning('standard-7'))).toBe('seven');
    expect(defaultGuitarKind(getTuning('bass'))).toBe('bass');
    expect(stringNamesFor(STANDARD_TUNING, 'steel')).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    expect(stringNamesFor(getTuning('drop-d'), 'electric')).toEqual(['D', 'A', 'D', 'G', 'B', 'E']);
    expect(stringNamesFor(STANDARD_TUNING, 'bass')).toEqual(['E', 'A', 'D', 'G']);
  });
});

describe('song', () => {
  const SONG = sixTab`
title: Test tune
tempo: 120
time: 4/4
key: G

| q 4:0 3:0 (2:0 1:3) r | h 4:2 3:2 |
`;

  it('steps follow the notes, with real pitches, degrees in the key and note names', () => {
    const plan = songPlan(SONG)!;
    expect(plan).not.toBeNull();
    expect(plan.steps.map((s) => s.notes.map((n) => `${n.string}:${n.fret}`).join(' '))).toEqual(['4:0', '3:0', '2:0 1:3', '4:2', '3:2']);
    const first = plan.steps[0].notes[0];
    expect(first).toMatchObject({ midi: 50, note: 'D', degree: '5' });
    expect(plan.steps[1].notes[0]).toMatchObject({ midi: 55, note: 'G', degree: '1', root: true });
    expect(plan.steps.map((s) => s.tick)).toEqual([0, 960, 1920, 3840, 5760]);
    expect(plan.steps[2].endTick).toBe(3840);
  });

  it('the step at a tick, the notes now and next', () => {
    const { steps } = songPlan(SONG)!;
    expect(stepIndexAt(steps, -100)).toBe(0);
    expect(stepIndexAt(steps, 0)).toBe(0);
    expect(stepIndexAt(steps, 959)).toBe(0);
    expect(stepIndexAt(steps, 2000)).toBe(2);
    expect(stepIndexAt(steps, 3000)).toBe(2);
    expect(stepIndexAt(steps, 99999)).toBe(4);
    const dots = stepNotes(steps, 1);
    expect(dots.filter((d) => d.target).map((d) => `${d.string}:${d.fret}`)).toEqual(['3:0']);
    expect(dots.filter((d) => d.ghost).map((d) => `${d.string}:${d.fret}`)).toEqual(['2:0', '1:3']);
    expect(stepNotes(steps, 4).every((d) => d.target)).toBe(true);
    expect(stepNotes(steps, 9)).toEqual([]);
  });

  it('describes a step and hears it', () => {
    const { steps } = songPlan(SONG)!;
    expect(describeStep(steps[0])).toBe('D, open string 4');
    expect(describeStep(steps[3])).toBe('E on string 4, fret 2');
    expect(describeStep(steps[2])).toBe('B and G together');
    expect(stepHeard(steps[0], [50])).toBe(true);
    expect(stepHeard(steps[0], [62])).toBe(false);
    expect(stepHeard(steps[2], [59])).toBe(false);
    expect(stepHeard(steps[2], [59, 67])).toBe(true);
  });

  it('a strummed rhythm track gives its chord shapes', () => {
    const strum = sixTab`
title: Strum
tempo: 90
time: 4/4
key: G

| "G" q D D D D | "C" D D D D |
`;
    const plan = songPlan(strum)!;
    expect(plan.steps.length).toBe(8);
    expect(plan.steps[0].symbol).toBe('G');
    expect(plan.steps[4].symbol).toBe('C');
    const pcs = new Set(chordPcs('C'));
    expect(plan.steps[4].notes.every((n) => pcs.has(n.midi % 12))).toBe(true);
    expect(describeStep(plan.steps[0])).toBe('G chord');
  });
});

/** A board seen front-on: nut at the right (a right-handed player facing the camera), 12th fret on the left. */
function testPose(): FretboardPose {
  const pose = poseFromWireTaps({ fret: 0, ends: [{ x: 1100, y: 300 }, { x: 1100, y: 372 }] }, { fret: 12, ends: [{ x: 260, y: 290 }, { x: 260, y: 382 }] }, 1280, 720, { model: 'steel' });
  if (!pose) throw new Error('no pose');
  return pose;
}

describe('calibrate', () => {
  it('four taps in order: the nut then the 12th fret, thick side first', () => {
    const steps = tapSteps();
    expect(steps.map((s) => `${s.wire}:${s.side}`)).toEqual(['0:bass', '0:treble', '12:bass', '12:treble']);
    expect(steps[0].prompt).toMatch(/nut/);
    expect(steps[2].prompt).toMatch(/fret 12/);
    expect(tapSteps({ near: 3, far: 10 })[0].prompt).toMatch(/fret 3/);
  });

  it('builds wire taps the vision module turns into a pose that lands on the right frets', () => {
    const truth = testPose();
    const m = truth.model;
    const at = (fret: number, side: 'bass' | 'treble') => projectPlanePoint(truth, fretX(m, fret), boardEdgeY(m, fretX(m, fret), side));
    const taps = [at(0, 'bass'), at(0, 'treble'), at(12, 'bass'), at(12, 'treble')];
    const pair = wireTaps(DEFAULT_WIRES, taps)!;
    expect(pair[0].fret).toBe(0);
    const pose = poseFromWireTaps(pair[0], pair[1], 1280, 720, { model: 'steel' })!;
    expect(pose.numbering).toBe('user');
    for (const [s, f] of [[6, 1], [3, 5], [1, 11]]) {
      const a = projectMarker(pose, s, f);
      const b = projectMarker(truth, s, f);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
    }
    expect(wireTaps(DEFAULT_WIRES, taps.slice(0, 3))).toBeNull();
  });

  it('checks wire pairs, close taps, sticker prompts and fret choices', () => {
    expect(validPair({ near: 0, far: 12 })).toEqual({ near: 0, far: 12 });
    expect(validPair({ near: 7, far: 5 })).toBeNull();
    expect(validPair({ near: -1, far: 5 })).toBeNull();
    expect(tooClose({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
    expect(tooClose({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(false);
    expect(stickerPrompt(0)).toMatch(/fret 5/);
    expect(stickerPrompt(1)).toMatch(/fret 12/);
    expect(fretChoices(5)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fretChoices(12)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(fretChoices(20)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(fretChoices(null)).toContain(5);
  });
});

describe('hands', () => {
  const pose = testPose();
  const m = pose.model;
  /** A landmark list with the four fingertips at plane points (x along the neck, string). */
  const hand = (tips: Array<[number, number] | null>) => {
    const out = Array.from({ length: 21 }, () => ({ x: 0.01, y: 0.01 }));
    [8, 12, 16, 20].forEach((lm, i) => {
      const t = tips[i];
      if (!t) {
        out[lm] = { x: 0.02, y: 0.02 };
        return;
      }
      const p = projectPlanePoint(pose, t[0], stringY(m, t[1], t[0]));
      out[lm] = { x: p.x / pose.frameWidth, y: p.y / pose.frameHeight };
    });
    return out;
  };
  const nearWire = (fret: number, share: number) => fretX(m, fret) - share * (fretX(m, fret) - fretX(m, fret - 1));

  it('reads which fret and string each fingertip is on', () => {
    const f = readFingers(hand([[nearWire(5, 0.2), 3], [nearWire(7, 0.2), 2], null, null]), pose);
    expect(f.find((x) => x.finger === 1)).toMatchObject({ onBoard: true, fret: 5, string: 3, advice: 'good' });
    expect(f.find((x) => x.finger === 2)).toMatchObject({ onBoard: true, fret: 7, string: 2, advice: 'good' });
    expect(f.find((x) => x.finger === 3)?.onBoard).toBe(false);
  });

  it('a fingertip in the back of its cell is told to move up to the wire', () => {
    const f = readFingers(hand([[nearWire(5, 0.85), 4], null, null, null]), pose);
    expect(f[0].behindWire).toBeGreaterThan(FAR_FROM_WIRE);
    expect(f[0].advice).toBe('far');
    expect(handAdvice(f)).toMatchObject({ tone: 'warn' });
    expect(handAdvice(f).text).toMatch(/Finger 1/);
    expect(handAdvice(readFingers(hand([[nearWire(5, 0.1), 4], null, null, null]), pose)).tone).toBe('ok');
    expect(handAdvice([]).tone).toBe('info');
  });

  it('picks the hand that is on the board', () => {
    const strum = hand([null, null, null, null]);
    const fret = hand([[nearWire(3, 0.2), 5], [nearWire(4, 0.2), 4], null, null]);
    expect(frettingHand([strum, fret], pose)?.index).toBe(1);
    expect(frettingHand([strum], pose)).toBeNull();
  });
});

describe('status', () => {
  const guidance = (code: TrackerUpdate['guidance']['code'], trust: TrackerUpdate['guidance']['trust'] = 'wait', message = `msg ${code}`) => ({
    code,
    trust,
    message,
    measures: { brightness: 100, clipped: 0, noise: 2, stringSpacingPx: 8, offNormalDeg: 10, visibleFrets: 12, nutInView: true },
  });
  const update = (over: Partial<TrackerUpdate>): Parameters<typeof describeStatus>[0] => ({
    state: 'searching',
    confidence: 0,
    guidance: guidance('point-camera'),
    suggestCalibration: false,
    question: null,
    numberingConfirmed: false,
    stringsSeen: null,
    ...over,
  });

  it('locked: notes drawn, ok tone, nothing to say', () => {
    const s = describeStatus(update({ state: 'locked', confidence: 0.92, guidance: guidance('ok', 'auto'), numberingConfirmed: true }));
    expect(s).toMatchObject({ state: 'locked', word: 'Locked', tone: 'ok', bars: 5, message: '', notes: 'solid', offers: [] });
    expect(announcement(s)).toBe('Locked: the notes are on your frets.');
  });

  it('a locked board the tracker is no longer sure of draws outlines only', () => {
    const s = describeStatus(update({ state: 'locked', confidence: 0.4, guidance: guidance('ok', 'auto'), numberingConfirmed: true }));
    expect(s.notes).toBe('ghost');
    expect(describeStatus(update({ state: 'locked', confidence: SOLID_CONFIDENCE, guidance: guidance('ok', 'auto'), numberingConfirmed: true })).notes).toBe('solid');
  });

  it('a locked board whose dots were measured off the neck draws outlines and says why', () => {
    const locked = update({ state: 'locked', confidence: 0.95, guidance: guidance('ok', 'auto'), numberingConfirmed: true });
    expect(describeStatus(locked, 0, true)).toMatchObject({ notes: 'ghost', message: expect.stringMatching(/catch up/) });
    expect(describeStatus(locked, 0, false)).toMatchObject({ notes: 'solid', message: '' });
    // Coaching from the tracker comes first.
    expect(describeStatus(update({ state: 'locked', confidence: 0.95, guidance: guidance('move-closer'), numberingConfirmed: true }), 0, true).message).toBe('msg move-closer');
  });

  it('locked outside the limits still draws, and coaches', () => {
    const s = describeStatus(update({ state: 'locked', confidence: 0.7, guidance: guidance('move-closer'), numberingConfirmed: true }));
    expect(s.notes).toBe('solid');
    expect(s.message).toBe('msg move-closer');
  });

  it('a candidate never draws notes; it asks or offers to fix the numbers', () => {
    const asking = describeStatus(update({ state: 'candidate', confidence: 0.5, guidance: guidance('confirm-fret', 'confirm'), question: { point: { x: 10, y: 20 }, fret: 5 } }));
    expect(asking).toMatchObject({ notes: 'none', offers: ['confirm-fret'], question: { fret: 5, x: 10, y: 20 } });
    const guess = describeStatus(update({ state: 'candidate', confidence: 0.5, guidance: guidance('show-nut', 'confirm') }));
    expect(guess.offers).toEqual(['fix-numbers']);
    const type = describeStatus(update({ state: 'candidate', confidence: 0.5, guidance: guidance('check-guitar-type', 'confirm'), stringsSeen: 7, numberingConfirmed: true }));
    expect(type.offers).toEqual(['guitar-type']);
  });

  it('lost: notes as outlines for a moment, then none', () => {
    const lost = update({ state: 'lost', confidence: 0.4, guidance: guidance('hold-still') });
    expect(describeStatus(lost, 100).notes).toBe('ghost');
    expect(describeStatus(lost, GHOST_MS + 1).notes).toBe('none');
    expect(describeStatus(lost).message).toMatch(/Hold the guitar still/);
  });

  it('searching for a while offers the four taps, in this screen\'s words', () => {
    const s = describeStatus(update({ suggestCalibration: true, guidance: guidance('calibrate', 'calibrate', 'Automatic tracking is struggling here. Tap Calibrate and mark the nut and the 12th fret.') }));
    expect(s.offers).toEqual(['calibrate']);
    // The button beside the line is "Mark the neck": the line must not send the learner looking for "Calibrate".
    expect(s.message).toBe(MARK_THE_NECK);
    expect(s.message).toMatch(/Mark the neck/);
    expect(s.message).not.toMatch(/Calibrate/);
    expect(s.bars).toBe(0);
    expect(s.tone).toBe('info');
    expect(sameStatus(s, describeStatus(update({ suggestCalibration: true, guidance: guidance('calibrate', 'calibrate') })))).toBe(true);
    expect(sameStatus(s, STARTING_STATUS)).toBe(false);
  });
});
