/** Name that shape, finger tips between chords, hints from the microphone, "My chords". */
import { describe, expect, it } from 'vitest';
import { formatFrets } from '@/core/guitar';
import type { ProgressState } from '@/core/progress';
import { strumHint, spellIn } from './hints';
import { isKnownRecord, knownChords, mergeChordData } from './known';
import { EXAMPLE_SHAPE, emptyShape, fretSpan, muteString, nameShape, shapeFromParam, shapeParam, tapCell } from './shape';
import { changeTips, fingerName, leadFinger } from './tips';
import { defaultVoicing } from './voicings';

describe('name that shape', () => {
  it('opens on a C chord the engine names', () => {
    expect(nameShape(EXAMPLE_SHAPE).symbol).toBe('C');
  });

  it('places, moves and removes fingers with taps', () => {
    let s = emptyShape();
    expect(nameShape(s)).toMatchObject({ symbol: null, sounding: 0 });
    s = tapCell(s, 5, 0);
    s = tapCell(s, 4, 2);
    s = tapCell(s, 3, 2);
    s = tapCell(s, 2, 1);
    s = tapCell(s, 1, 0);
    expect(formatFrets(s)).toBe('x02210');
    expect(nameShape(s).symbol).toBe('Am');
    s = tapCell(s, 2, 1); // the same spot again mutes the string
    expect(formatFrets(s)).toBe('x022x0');
    s = tapCell(s, 2, 3); // another fret moves the finger
    expect(formatFrets(s)).toBe('x02230');
    expect(nameShape(s).symbol).toBe('Asus4');
    expect(formatFrets(muteString(s, 5))).toBe('xx2230');
  });

  it('names inversions and gives other readings', () => {
    expect(nameShape([0, 3, 2, 0, 1, 0]).symbol).toBe('C/E');
    const am7 = nameShape([null, 0, 2, 0, 1, 0]);
    expect(am7.symbol).toBe('Am7');
    expect(am7.alternatives.map((a) => a.symbol)).toContain('C6/A');
  });

  it('round-trips shapes through route params', () => {
    expect(shapeParam(EXAMPLE_SHAPE)).toBe('x32010');
    expect(shapeFromParam('x32010')).toEqual(EXAMPLE_SHAPE);
    expect(shapeFromParam('8-10-10-9-8-8')).toEqual([8, 10, 10, 9, 8, 8]);
    expect(shapeParam(emptyShape())).toBeNull();
    expect(shapeFromParam('x3201')).toBeNull();
    expect(shapeFromParam('banana')).toBeNull();
    expect(fretSpan([null, 3, 2, 0, 1, 0])).toEqual({ min: 1, max: 3 });
    expect(fretSpan([0, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('finger tips between two chords', () => {
  it('mark the anchor fingers from C to Am on both shapes', () => {
    const t = changeTips('C', 'Am')!;
    const roles = (marks: typeof t.fromMarks) => Object.fromEntries(marks.map((m) => [m.finger, m.role]));
    expect(roles(t.fromMarks)).toEqual({ 1: 'anchor', 2: 'anchor', 3: 'move' });
    expect(roles(t.toMarks)).toEqual({ 1: 'anchor', 2: 'anchor', 3: 'move' });
    expect(t.tips[0]).toMatch(/middle finger/);
    expect(t.lead).toBeNull();
  });

  it('mark a guide finger from A to D', () => {
    const t = changeTips('A', 'D')!;
    expect(t.fromMarks.find((m) => m.finger === 3)?.role).toBe('guide');
    expect(t.toMarks.find((m) => m.finger === 3)?.role).toBe('guide');
  });

  it('name the finger that moves least when nothing stays down', () => {
    const t = changeTips('G', 'C')!;
    expect(t.lead).not.toBeNull();
    expect(t.tips.some((s) => s.startsWith('Lead with your'))).toBe(true);
    const lead = leadFinger(defaultVoicing('G')!, defaultVoicing('C')!)!;
    expect(lead.finger).toBe(t.lead!.finger);
    expect(fingerName(1)).toBe('index');
    expect(changeTips('C', 'not a chord')).toBeNull();
  });
});

describe('hints from what the microphone heard', () => {
  const g = defaultVoicing('G')!; // 320003
  const d = defaultVoicing('D')!; // xx0232

  it('point at an open string that did not ring', () => {
    const h = strumHint(g, { missing: [11], extra: [] }, (n) => n);
    expect(h.kind).toBe('missing');
    expect(h.text).toMatch(/could not hear the B/);
    expect(h.text).toMatch(/string 5 at fret 2 and the open string 2/);
    expect(h.strings).toEqual([5, 2]);
    const e = strumHint(defaultVoicing('Em')!, { missing: [7], extra: [] }, (n) => n);
    expect(e.text).toMatch(/open string 3: make sure no finger leans against it/);
  });

  it('point at a fretted string that is not pressed', () => {
    const h = strumHint(d, { missing: [6], extra: [] }, (n) => n);
    expect(h.text).toMatch(/F#/);
    expect(h.text).toMatch(/string 1 at fret 2/);
  });

  it('point at a string that should stay silent', () => {
    const h = strumHint(d, { missing: [], extra: [4] }, (n) => n);
    expect(h.kind).toBe('extra');
    expect(h.text).toMatch(/string 6 should stay silent/);
    expect(h.strings).toEqual([6]);
  });

  it('suspect a finger a fret off for an outside note next to a fretted one', () => {
    const h = strumHint(g, { missing: [], extra: [8] }, (n) => n);
    expect(h.text).toMatch(/Ab|G#/);
    expect(h.text).toMatch(/fret 3/);
  });

  it('name the chord in display text and never throw from a formatter', () => {
    const h = strumHint(defaultVoicing('Am')!, { missing: [], extra: [2] }, (n) => {
      if (n.length > 3) throw new RangeError('not a note');
      return n;
    });
    expect(h.text).toMatch(/not in Am/);
    expect(strumHint(defaultVoicing('F#m')!, { missing: [], extra: [5] }).text).toMatch(/not in F♯m/);
  });

  it('spell notes by the chord and fall back kindly', () => {
    expect(spellIn('D7#9', 5)).toBe('E#');
    expect(strumHint(g, { missing: [], extra: [] }).kind).toBe('unclear');
  });
});

describe('my chords', () => {
  const skill = (completed: boolean, data?: unknown) => ({ completed, data }) as unknown as ProgressState['skills'][string];

  it('reads known chords from completed chord skills, minus the ones taken back', () => {
    const skills = {
      'chord:em': skill(true),
      'chord:f-sharp-m': skill(true, { known: true }),
      'chord:c-e': skill(true),
      'chord:g': skill(true, { known: false }),
      'chord:am': skill(false),
      'chord-change:g-c': skill(true),
      'scale:a-minor-pentatonic:box-1': skill(true),
    } as ProgressState['skills'];
    expect([...knownChords(skills)].sort()).toEqual(['C/E', 'Em', 'F#m']);
    expect(isKnownRecord(undefined)).toBe(false);
  });

  it('keeps other data when the flag changes', () => {
    expect(mergeChordData({ tempo: 80 }, { known: false })).toEqual({ tempo: 80, known: false });
    expect(mergeChordData(null, { known: true })).toEqual({ known: true });
  });
});
