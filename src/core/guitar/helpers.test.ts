import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HAND_WEIGHTS, RESTING_HAND, bestCapo, buildVoicing, capoShapes, changeDifficulty, chordVoicings, closestVoicing, formatFrets, handMove,
  libraryVoicings, midiAt, planFingering, positionChangeCost, progressionDifficulty, rankTranspositions, simultaneousCost, suggestCapo,
  transpositionDifficulty, voicingTransition,
} from './index';

describe('capo suggestions', () => {
  it('finds the capo that turns flat-key chords into open shapes', () => {
    const best = bestCapo(['Bb', 'Eb', 'F', 'Gm']);
    expect(best.capo).toBe(3);
    expect(best.shapes.map((s) => `${s.chord}->${s.shape}`)).toEqual(['Bb->G', 'Eb->C', 'F->D', 'Gm->Em']);
    expect(best.shapes.map((s) => formatFrets(s.voicing!.frets))).toEqual(['320003', 'x32010', 'xx0232', '022000']);
    expect(best.shapes.every((s) => s.easy)).toBe(true);
    expect([best.easyCount, best.easyShare]).toEqual([4, 1]);
    // The voicings are built behind the capo: they really sound the chords of the song.
    expect(best.shapes.map((s) => s.voicing!.chord)).toEqual(['Bb', 'Eb', 'F', 'Gm']);
    expect(best.shapes[0].voicing!.capo).toBe(3);
    expect(best.shapes[0].voicing!.notes[0].midi).toBe(midiAt({ string: 6, fret: 3 }, { capo: 3 }));
  });

  it('gets the classic cases right', () => {
    expect(bestCapo(['B', 'E', 'F#', 'G#m']).capo).toBe(4); // G C D Em
    expect(bestCapo(['Eb', 'Ab', 'Bb', 'Cm']).capo).toBe(3); // C F G Am
    expect(bestCapo(['Ab', 'Db', 'Eb', 'Fm', 'Bbm']).capo).toBe(1); // G C D Em Am
    expect(bestCapo(['C#m', 'A', 'E', 'B']).shapes.filter((s) => s.easy).length).toBe(4);
    expect(bestCapo(['F#m', 'D', 'A', 'E']).capo).toBe(2); // Em C G D
  });

  it('leaves songs in open keys alone', () => {
    expect(bestCapo(['G', 'C', 'D', 'Em']).capo).toBe(0);
    expect(bestCapo(['A', 'D', 'E']).capo).toBe(0);
    expect(bestCapo(['Am', 'F', 'C', 'G']).capo).toBe(0);
    expect(bestCapo(['E', 'A', 'B7']).capo).toBe(0);
  });

  it('ranks every position and weighs chords by how often they occur', () => {
    const all = suggestCapo(['Bb', 'Eb', 'F', 'Gm']);
    expect(all).toHaveLength(8);
    expect(all.map((s) => s.capo).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
    expect(suggestCapo(['C'], { maxCapo: 2 })).toHaveLength(3);
    const weighted = capoShapes(['G', 'G', 'G', 'F#m', 'N.C.', '???'], 0);
    expect(weighted.map((s) => [s.chord, s.count])).toEqual([['G', 3], ['F#m', 1]]);
    expect(weighted[1].easy).toBe(false);
    expect(suggestCapo([])[0].capo).toBe(0);
    expect(capoShapes(['Bb'], 3)[0]).toMatchObject({ chord: 'Bb', shape: 'G', easy: true });
    expect(capoShapes(['Bb'], 0)[0]).toMatchObject({ chord: 'Bb', shape: 'Bb', easy: false });
  });

  it('measures how hard a progression is, in every key', () => {
    const easy = progressionDifficulty(['G', 'C', 'D', 'Em']);
    const hard = progressionDifficulty(['Ab', 'Db', 'Eb', 'Fm']);
    expect(easy.difficulty).toBeLessThan(hard.difficulty);
    expect(easy.easyShare).toBe(1);
    expect(hard.easyShare).toBe(0);
    expect(progressionDifficulty(['C', 'F', 'Bb']).hardest).toBe('Bb');
    expect(progressionDifficulty([]).hardest).toBeNull();
    expect(transpositionDifficulty(['Ab', 'Db', 'Eb', 'Fm'], -1)).toBeCloseTo(easy.difficulty, 6);
    expect(transpositionDifficulty(['G', 'C', 'D'], 0)).toBeCloseTo(progressionDifficulty(['G', 'C', 'D']).difficulty, 6);
    const ranked = rankTranspositions(['Eb', 'Ab', 'Bb']);
    expect(ranked).toHaveLength(12);
    expect(ranked.slice(0, 3).map((r) => r.chords.join(' ')).sort()).toEqual(['A D E', 'D G A', 'G C D']);
    expect(ranked[0].easyShare).toBe(1);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].difficulty).toBeLessThanOrEqual(ranked[i].difficulty);
    expect(ranked.find((r) => r.semitones === 0)!.chords).toEqual(['Eb', 'Ab', 'Bb']);
  });
});

describe('hand movement cost', () => {
  it('prices a single move: staying is free, stretching costs, shifting costs more', () => {
    const start = handMove(RESTING_HAND, { string: 6, fret: 5 });
    expect(start.shift).toBe(false);
    expect(start.state.position).not.toBeNull();
    const at5 = { position: 5, last: { string: 6, fret: 5 }, finger: 1 } as const;
    const inPosition = handMove(at5, { string: 6, fret: 8 });
    expect(inPosition).toMatchObject({ finger: 4, shift: false, stretch: false });
    const stretch = handMove(at5, { string: 6, fret: 9 });
    expect(stretch).toMatchObject({ finger: 4, shift: false, stretch: true });
    const shift = handMove(at5, { string: 6, fret: 12 });
    expect(shift.shift).toBe(true);
    expect(inPosition.cost).toBeLessThan(stretch.cost);
    expect(stretch.cost).toBeLessThan(shift.cost);
    // The further the shift, the dearer; time to make it (a small `ease`) makes it cheaper.
    expect(handMove(at5, { string: 6, fret: 17 }).cost).toBeGreaterThan(shift.cost);
    expect(handMove(at5, { string: 6, fret: 12 }, {}, 0.25).cost).toBeLessThan(shift.cost);
    // Open strings need no hand at all and leave it where it was.
    const open = handMove(at5, { string: 5, fret: 0 });
    expect(open).toMatchObject({ finger: 0, shift: false, stretch: false });
    expect(open.state.position).toBe(5);
    expect(handMove({ position: 1, last: { string: 5, fret: 3 }, finger: 3 }, { string: 4, fret: 0 }).cost).toBe(0);
    // Skipping strings costs the fretting fingers something.
    expect(handMove(at5, { string: 3, fret: 5 }).cost).toBeGreaterThan(handMove(at5, { string: 5, fret: 5 }).cost - DEFAULT_HAND_WEIGHTS.roll);
    expect(positionChangeCost({ string: 6, fret: 5 }, { string: 6, fret: 7 })).toBeLessThan(positionChangeCost({ string: 6, fret: 5 }, { string: 6, fret: 14 }));
    expect(handMove(at5, { string: 6, fret: 12 }, { shift: 0, shiftPerFret: 0 }).cost).toBeLessThan(shift.cost);
  });

  it('plays a one-octave C major scale in open position, as every method book does', () => {
    const plan = planFingering([48, 50, 52, 53, 55, 57, 59, 60]);
    expect(plan.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['5:3', '4:0', '4:2', '4:3', '3:0', '3:2', '2:0', '2:1']);
    expect(plan.notes.map((n) => n.finger)).toEqual([3, 0, 2, 3, 0, 2, 0, 1]);
    expect(plan.notes.some((n) => n.shift || n.stretch)).toBe(false);
    expect(plan.unplayable).toEqual([]);
    expect(plan.cost).toBeCloseTo(plan.notes.reduce((sum, n) => sum + n.cost, 0), 1);
  });

  it('keeps a melody in one position when it fits', () => {
    // A minor pentatonic up and down, kept fretted: the box at the fifth fret.
    const midi = [57, 60, 62, 64, 67, 69, 72, 69, 67, 64, 62, 60, 57];
    const plan = planFingering(midi, { minFret: 4 });
    expect(plan.notes.every((n) => n.fret >= 5 && n.fret <= 8)).toBe(true);
    expect(plan.notes.every((n) => !n.shift)).toBe(true);
    expect(new Set(plan.notes.map((n) => n.position))).toEqual(new Set([5]));
    for (const n of plan.notes) {
      expect(n.midi).toBe(midiAt(n));
      expect(n.finger).toBe(n.fret - 4);
    }
  });

  it('places every note at its pitch and reports what it cannot reach', () => {
    const midi = [64, 67, 71, 72, 76, 79, 83, 86, 30, 100];
    const plan = planFingering(midi);
    expect(plan.unplayable).toEqual([8, 9]);
    expect(plan.notes).toHaveLength(8);
    plan.notes.forEach((n, i) => {
      expect(n.midi).toBe(midi[i]);
      expect(midiAt(n)).toBe(midi[i]);
      if (n.fret === 0) expect(n.finger).toBe(0);
      else expect([1, 2, 3, 4]).toContain(n.finger);
    });
    expect(planFingering([])).toEqual({ notes: [], cost: 0, unplayable: [] });
    expect(planFingering([20]).unplayable).toEqual([0]);
  });

  it('follows options: preferred position, fret range, tuning, capo, weights', () => {
    const scale = [48, 50, 52, 53, 55, 57, 59, 60];
    const high = planFingering(scale, { preferPosition: 7, minFret: 1 });
    expect(Math.min(...high.notes.map((n) => n.fret))).toBeGreaterThanOrEqual(5);
    const fretted = planFingering(scale, { weights: { openString: 5 } });
    expect(fretted.notes.every((n) => n.fret > 0)).toBe(true);
    const capo = planFingering([50, 52, 54], { capo: 2 });
    capo.notes.forEach((n, i) => expect(midiAt(n, { capo: 2 })).toBe([50, 52, 54][i]));
    const bass = planFingering([28, 31, 33, 35], { tuning: 'bass' });
    expect(bass.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['4:0', '4:3', '3:0', '3:2']);
    const limited = planFingering([64], { maxFret: 4 });
    expect(limited.notes[0]).toMatchObject({ string: 1, fret: 0 });
    // With time before a note, a shift is cheaper.
    const leap = [45, 81, 45, 81];
    expect(planFingering(leap, { minFret: 1 }).notes.some((n) => n.shift)).toBe(true);
    expect(planFingering(leap, { gaps: [0, 4, 4, 4], minFret: 1 }).cost).toBeLessThan(planFingering(leap, { minFret: 1 }).cost);
  });

  it('judges notes held together', () => {
    expect(simultaneousCost([{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 2, fret: 1 }])).toBeLessThan(5);
    expect(simultaneousCost([{ string: 5, fret: 3 }, { string: 5, fret: 5 }])).toBe(Infinity);
    expect(simultaneousCost([{ string: 6, fret: 1 }, { string: 1, fret: 9 }])).toBe(Infinity);
    expect(simultaneousCost([{ string: 9, fret: 1 }])).toBe(Infinity);
    expect(simultaneousCost([{ string: 3, fret: 0 }, { string: 2, fret: 0 }])).toBe(1);
    expect(simultaneousCost([{ string: 4, fret: 2 }], { tuning: 'bass' })).toBeLessThan(3);
  });
});

describe('chord changes', () => {
  const open = (symbol: string) => libraryVoicings(symbol, { categories: ['open'] })[0];
  const barre = (symbol: string) => libraryVoicings(symbol, { categories: ['barre'] })[0];

  it('finds the fingers that stay put from C to A minor', () => {
    const change = voicingTransition(open('C'), open('Am'));
    expect(change.anchors).toEqual([{ finger: 2, string: 4, fret: 2 }, { finger: 1, string: 2, fret: 1 }]);
    expect(change.moving).toEqual([3]);
    expect(change.guides).toEqual([]);
    expect(change.difficulty).toBeLessThan(2);
    expect(change.tips[0]).toMatch(/Keep your middle finger down on string 4, fret 2/);
  });

  it('sees the same shape moved along the neck', () => {
    const change = voicingTransition(barre('F'), barre('G'));
    expect(change).toMatchObject({ sameShape: true, shift: 2, anchors: [], moving: [] });
    expect(change.guides).toHaveLength(4);
    expect(change.tips[0]).toMatch(/Same shape.*2 frets up/);
    expect(voicingTransition(barre('G'), barre('F')).tips[0]).toMatch(/2 frets down/);
    expect(voicingTransition(barre('F'), barre('F#')).tips[0]).toMatch(/1 fret up/);
    expect(changeDifficulty(barre('F'), barre('G'))).toBeLessThan(changeDifficulty(barre('F'), barre('C')));
  });

  it('sees a formation carried across the strings from A minor to E', () => {
    const change = voicingTransition(open('Am'), open('E'));
    expect(change.block).toBe(true);
    expect(change.anchors).toEqual([]);
    expect(change.tips[0]).toMatch(/formation/);
    expect(change.difficulty).toBeLessThan(changeDifficulty(open('C'), open('G')));
  });

  it('finds guide fingers', () => {
    const change = voicingTransition(open('D'), open('A'));
    expect(change.guides).toEqual([{ finger: 3, string: 2, fromFret: 3, toFret: 2 }]);
    expect(change.tips[0]).toMatch(/Slide your ring finger along string 2 from fret 3 to fret 2/);
  });

  it('orders changes the way learners experience them', () => {
    const d = (a: string, b: string) => changeDifficulty(open(a), open(b));
    expect(changeDifficulty(open('C'), open('C'))).toBe(1);
    expect(d('C', 'Am')).toBeLessThan(d('Am', 'E'));
    expect(d('Am', 'E')).toBeLessThan(d('G', 'D'));
    expect(d('Em', 'G')).toBeLessThan(changeDifficulty(open('E'), barre('F')));
    expect(changeDifficulty(open('C'), barre('F'))).toBeLessThan(changeDifficulty(open('G'), barre('F')));
    expect(voicingTransition(open('E'), barre('F')).tips.join(' ')).toMatch(/Place the barre first/);
    expect(voicingTransition(open('G'), open('D')).tips[0]).toMatch(/No finger stays put/);
    for (const [a, b] of [['C', 'G'], ['G', 'D'], ['Am', 'Dm'], ['E', 'A'], ['D', 'G']] as const) {
      const value = d(a, b);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('copes with open and one-finger shapes', () => {
    const allOpen = buildVoicing('Em7', '020000');
    const em = open('Em');
    expect(voicingTransition(allOpen, em).difficulty).toBeLessThan(3);
    const nothing = buildVoicing('G', 'x00000', { tuning: 'open-g' });
    const bar = buildVoicing('A', 'x22222', { tuning: 'open-g' });
    const change = voicingTransition(nothing, bar);
    expect(change.shift).toBe(0);
    expect(change.moving).toEqual([1]);
    expect(change.difficulty).toBeGreaterThan(1);
  });

  it('picks the nearest of several voicings', () => {
    const c = open('C');
    expect(formatFrets(closestVoicing(c, libraryVoicings('Am'))!.frets)).toBe('x02210');
    expect(closestVoicing(c, [])).toBeNull();
    const f = barre('F');
    const gs = chordVoicings('G', { maxResults: 12 });
    expect(formatFrets(closestVoicing(f, gs)!.frets)).toBe('355433');
  });
});
