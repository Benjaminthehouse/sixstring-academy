import { describe, expect, it } from 'vitest';
import { backingFor, progression, progressionInKey } from '@/content/progressions';
import { arrangeBacking } from '@/core/audio';
import { chordPcs } from '@/core/theory';
import { midiAt } from '@/core/guitar';
import {
  DEFAULT_JAM, chordAt, chordScale, clampTempo, distanceText, endingChord, feelsFor, jamMarkers, positionOf,
  sanitizeJam, scaleChoices, scaleFor, upcoming,
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
});
