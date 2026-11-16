import { describe, expect, it } from 'vitest';
import { backingFor, progression, progressionInKey } from '@/content/progressions';
import { arrangeBacking } from '@/core/audio';
import { chordPcs } from '@/core/theory';
import { midiAt, tuning } from '@/core/guitar';
import {
  DEFAULT_JAM, LOG_AFTER_SEC, chordAt, finishedText, chordScale, clampTempo, distanceText, endingChord, feelsFor, glyphCount, jamActivity, jamMarkers, jamNeck, positionOf,
  sanitizeJam, scaleChoices, scaleFor, tempoHint, upcoming,
} from './jam';

describe('jam settings', () => {
  it('fall back to the defaults for anything unreadable', () => {
    expect(sanitizeJam(null)).toEqual(DEFAULT_JAM);
    expect(sanitizeJam({ countIn: 7, loop: 'yes', choruses: -3, muted: { drums: 'no', guitar: false }, scale: '<script>' })).toEqual({
      ...DEFAULT_JAM,
      choruses: 1,
      muted: { ...DEFAULT_JAM.muted, guitar: false },
    });
    expect(sanitizeJam({ countIn: 2, loop: false, choruses: 4, scale: 'chord' })).toMatchObject({ countIn: 2, loop: false, choruses: 4, scale: 'chord' });
  });

  it('keep the rhythm guitar muted by default (the learner plays guitar)', () => {
    expect(DEFAULT_JAM.muted.guitar).toBe(true);
    expect(DEFAULT_JAM.muted.drums).toBe(false);
  });
});

describe('feels and tempo', () => {
  it('offer the progression’s own feel first, then its alternatives, then the other styles once each', () => {
    const p = progression('pop-axis');
    const { suggested, others } = feelsFor(p);
    expect(suggested[0].backing).toBe(p.feel.backing);
    const all = [...suggested, ...others].map((f) => f.backing);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('waltz');
  });

  it('keeps a tempo inside what the style plays', () => {
    expect(clampTempo('pop-rock', 5)).toBeGreaterThanOrEqual(30);
    expect(clampTempo('pop-rock', 1000)).toBeLessThan(300);
    expect(clampTempo('pop-rock', 100)).toBe(100);
  });
});

describe('where the band is', () => {
  const p = progression('jazz-ii-v-i');
  const resolved = progressionInKey(p, 'C');

  it('maps every band segment to the chord the chart shows, through every chorus and the ending', () => {
    const setup = backingFor(progression('blues-quick-change'), 'A', { choruses: 2 });
    const arr = arrangeBacking(setup.bars, { ...setup.options, choruses: 2 });
    for (const seg of arr.chords) {
      const pos = positionOf(setup.resolved, seg);
      const shown = chordAt(setup.resolved, pos);
      if (seg.ending) expect(pos.bar).toBe(setup.resolved.bars.length - 1);
      else expect(shown.symbol).toBe(seg.chord.symbol);
    }
  });

  it('finds the chord within a split bar by its beat', () => {
    const turnaround = progression('blues-turnaround');
    const r = progressionInKey(turnaround, 'C');
    const split = r.bars.findIndex((b) => b.length === 2);
    expect(split).toBeGreaterThan(0);
    {
      expect(positionOf(r, { bar: split, beat: 0, chorus: 0, ending: false }).index).toBe(0);
      expect(positionOf(r, { bar: split, beat: r.bars[split][1].beat, chorus: 0, ending: false }).index).toBe(1);
      expect(positionOf(r, { bar: split + r.bars.length, beat: 3, chorus: 1, ending: false })).toEqual({ bar: split, index: 1 });
    }
  });

  it('names the next different chord and how far away it is', () => {
    const blues = progressionInKey(progression('blues-12-bar'), 'A');
    const first = upcoming(blues, { bar: 0, index: 0 }, true)!;
    expect(first.chord.symbol).toBe(blues.bars[4][0].symbol);
    expect(first.beats).toBe(16);
    expect(distanceText(first.beats, 4)).toBe('in 4 bars');
    const atBar3 = upcoming(blues, { bar: 3, index: 0 }, true)!;
    expect(distanceText(atBar3.beats, 4)).toBe('next bar');
    // The last bar of a pass loops back to the top only when the band will go round.
    const last = { bar: resolved.bars.length - 1, index: resolved.bars[resolved.bars.length - 1].length - 1 };
    const wrap = upcoming(resolved, last, true);
    expect(wrap?.wraps).toBe(true);
    expect(upcoming(resolved, last, false)).toBeNull();
  });

  it('says beats for a change inside a bar', () => {
    expect(distanceText(2, 4)).toBe('in 2 beats');
    expect(distanceText(1, 4)).toBe('next beat');
    expect(distanceText(6, 4)).toBe('in 6 beats');
    expect(distanceText(8, 4)).toBe('in 2 bars');
  });

  it('ends on the home chord when the progression starts elsewhere', () => {
    expect(endingChord(progressionInKey(progression('pop-axis'), 'G'))).toBeUndefined();
    const vi = progressionInKey(progression('pop-vi-iv-i-v'), 'C');
    expect(endingChord(vi)?.symbol).toBe('C');
  });
});

describe('scales to solo with', () => {
  it('offers the catalog’s tips in the key, the chord scale and chord tones only', () => {
    const p = progression('pop-axis');
    const choices = scaleChoices(p, 'G');
    expect(choices.map((c) => c.id)).toEqual(['tip-0', 'tip-1', 'chord', 'off']);
    expect(choices[0].scale).toEqual({ tonic: 'G', scale: 'major-pentatonic' });
  });

  it('matches each chord with the scale that fits it and the key', () => {
    const c = { tonic: 'C', scale: 'major' };
    expect(chordScale('Dm7', c)).toEqual({ tonic: 'D', scale: 'dorian' });
    expect(chordScale('G7', c)).toEqual({ tonic: 'G', scale: 'mixolydian' });
    expect(chordScale('Em', c)).toEqual({ tonic: 'E', scale: 'phrygian' });
    expect(chordScale('E7', { tonic: 'A', scale: 'minor' })).toEqual({ tonic: 'E', scale: 'phrygian-dominant' });
    expect(scaleFor({ id: 'off', scale: null }, 'C', c)).toBeNull();
    expect(scaleFor({ id: 'tip-0', scale: { tonic: 'A', scale: 'minor-pentatonic' } }, 'C', c)).toEqual({ tonic: 'A', scale: 'minor-pentatonic' });
  });

  // Bug: an eight- or nine-note scale (bebop, combined blues) always "shared more notes with the
  // key" than the mode it extends, and an exotic scale could beat the plain one, so a jazz blues
  // in F offered C Bebop Dorian over Cm7 and the Coltrane cycle E Double harmonic over Emaj7.
  it('never hands out a bebop, blues or exotic scale when a taught mode fits', () => {
    expect(chordScale('Cm7', { tonic: 'F', scale: 'major' })).toEqual({ tonic: 'C', scale: 'dorian' });
    expect(chordScale('Emaj7', { tonic: 'C', scale: 'major' })).toEqual({ tonic: 'E', scale: 'major' });
    expect(chordScale('Abmaj7', { tonic: 'C', scale: 'major' })).toEqual({ tonic: 'Ab', scale: 'lydian' });
    expect(chordScale('F7', { tonic: 'F', scale: 'major' })).toEqual({ tonic: 'F', scale: 'mixolydian' });
    const blues = progressionInKey(progression('blues-jazz'), 'F');
    const coltrane = progressionInKey(progression('jazz-coltrane-cycle'), 'C');
    for (const r of [blues, coltrane]) {
      for (const ch of r.bars.flat()) {
        const s = chordScale(ch.symbol, r.key);
        expect(s, ch.symbol).not.toBeNull();
        expect(s!.scale, `${ch.symbol}: ${s!.tonic} ${s!.scale}`).not.toMatch(/bebop|blues|double-harmonic|hungarian|harmonic-major|neapolitan|sharp-4/);
      }
    }
    // A diminished seventh lives in no seven-note mode the list holds: it gets a diminished scale.
    expect(chordScale('F#dim7', { tonic: 'C', scale: 'major' })?.scale).toMatch(/^diminished-/);
  });

  it('lights the chord tones (labelled by degree) over the scale’s other notes', () => {
    const markers = jamMarkers('Am7', { tonic: 'A', scale: 'minor-pentatonic' }, { maxFret: 12 });
    const want = chordPcs('Am7');
    const tones = markers.filter((m) => m.state !== 'ghost');
    const rest = markers.filter((m) => m.state === 'ghost');
    expect(tones.length).toBeGreaterThan(10);
    for (const m of tones) expect(want).toContain(midiAt(m) % 12);
    for (const m of rest) expect(want).not.toContain(midiAt(m) % 12);
    expect(new Set(tones.map((m) => m.label))).toEqual(new Set(['R', '♭3', '5', '♭7']));
    expect(jamMarkers('Am7', null).every((m) => m.state !== 'ghost')).toBe(true);
  });

  it("shows the frets of Settings on wide screens, with smaller strings past 15 so the neck stays in view", () => {
    const wide = { phone: false, sideways: false, wide: true };
    expect(jamNeck(wide, 15)).toEqual({ maxFret: 15, size: 'lg' });
    expect(jamNeck(wide, 12)).toEqual({ maxFret: 12, size: 'lg' });
    expect(jamNeck(wide, 19)).toEqual({ maxFret: 19, size: 'md' });
    expect(jamNeck(wide, 24)).toEqual({ maxFret: 24, size: 'sm' });
    // A phone upright keeps 12 frets whatever Settings say; on its side it takes them, small.
    expect(jamNeck({ phone: true, sideways: false, wide: false }, 24)).toEqual({ maxFret: 12, size: 'sm' });
    expect(jamNeck({ phone: false, sideways: false, wide: false }, 24)).toEqual({ maxFret: 12, size: 'md' });
    expect(jamNeck({ phone: true, sideways: true, wide: false }, 20)).toEqual({ maxFret: 20, size: 'sm' });
    // A broken stored value is the default neck, never a crash or a 0-fret board.
    expect(jamNeck(wide, Number.NaN)).toEqual({ maxFret: 15, size: 'lg' });
    expect(jamNeck(wide, 99).maxFret).toBe(24);
  });

  it("puts the notes where they are in the learner's tuning", () => {
    const dropD = tuning('drop-d');
    const markers = jamMarkers('D', { tonic: 'D', scale: 'major' }, { maxFret: 12, tuning: dropD });
    const want = chordPcs('D');
    for (const m of markers.filter((x) => x.state !== 'ghost')) expect(want).toContain(midiAt(m, { tuning: dropD }) % 12);
    // The open low string is D in Drop D (a chord root), E in standard (not a D-major chord tone).
    const lowOpen = (list: ReturnType<typeof jamMarkers>) => list.find((m) => m.string === 6 && m.fret === 0 && m.state !== 'ghost');
    expect(lowOpen(markers)?.label).toBe('R');
    expect(lowOpen(jamMarkers('D', { tonic: 'D', scale: 'major' }, { maxFret: 12 }))).toBeUndefined();
  });
});

describe('logging a jam', () => {
  const info = { skillId: 'progression:pop-axis', title: 'Jam: I–V–vi–IV', params: ['pop-axis', 'g', 'jam'], data: { tonic: 'G', tempo: 108 } };

  it('logs played time of 20 s or more as one progression activity', () => {
    expect(jamActivity({ seconds: LOG_AFTER_SEC - 0.5, changes: 9 }, info)).toBeNull();
    expect(jamActivity({ seconds: Number.NaN, changes: 9 }, info)).toBeNull();
    expect(jamActivity({ seconds: 61.4, changes: 34 }, info)).toEqual({
      kind: 'progression', id: 'progression:pop-axis', title: 'Jam: I–V–vi–IV', durationSec: 61, count: 34,
      route: 'progressions', params: ['pop-axis', 'g', 'jam'], data: { tonic: 'G', tempo: 108 },
    });
  });

  // Bug: saving a progression in the builder was logged as a 'progression' activity, so the
  // "Jam Session" achievement and the daily jam quest were earned without a note being played,
  // with the minutes the builder had been open counted as practice. Only played time is a jam now.
  it('is the only way a progression activity is made: from seconds the band actually played', () => {
    expect(jamActivity({ seconds: 0, changes: 0 }, { ...info, skillId: 'progression:builder' })).toBeNull();
    expect(jamActivity({ seconds: 25, changes: 12 }, { ...info, skillId: 'progression:builder' })?.durationSec).toBe(25);
  });
});

describe('sizing the big chord', () => {
  it('counts the characters a chord name shows, 1 to 8', () => {
    expect(glyphCount('G')).toBe(1);
    expect(glyphCount('Dm7')).toBe(3);
    expect(glyphCount('F♯m7♭5')).toBe(6);
    expect(glyphCount('B♭maj7♯11/D')).toBe(8);
    expect(glyphCount('')).toBe(1);
  });
});

describe('when the band has finished', () => {
  // Review: after its passes the band stopped and the screen went back to "Press play", with
  // nothing to say what was done or what to try next.
  it('says what was played and offers the next step', () => {
    expect(finishedText(1, 120)).toBe('That was once through at 120 BPM. Go again, or try it a little faster.');
    expect(finishedText(2, 96.4)).toBe('That was twice through at 96 BPM. Go again, or try it a little faster.');
    expect(finishedText(5, 170)).toMatch(/^That was 5 times through at 170 BPM\./);
  });
});

describe('the tempo hint', () => {
  it('names the usual range and never scolds a slower tempo a lesson asked for', () => {
    const rock = { tempo: [120, 180] as [number, number] };
    const slow = tempoHint(rock, 100);
    expect(slow).toContain('120 to 180 BPM');
    expect(slow).toMatch(/Slower is how you learn it/);
    expect(slow).not.toMatch(/sits best/);
    expect(tempoHint(rock, 140)).toBe('Usually played at 120 to 180 BPM.');
    expect(tempoHint(rock, 200)).toMatch(/faster than that/);
  });
});
