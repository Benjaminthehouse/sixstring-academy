import { describe, expect, it } from 'vitest';
import { keySignature } from './key';
import { guitarStaffRange, keySignaturePositions, noteAtStaffPosition, staffPosition, staffPositionOfMidi } from './staff';

describe('staffPosition', () => {
  it('places written notes on the treble staff', () => {
    const lines = ['E4', 'G4', 'B4', 'D5', 'F5'];
    const spaces = ['F4', 'A4', 'C5', 'E5'];
    lines.forEach((n, i) => expect(staffPosition(n, { guitar: false }), n).toMatchObject({ position: i * 2, onLine: true, ledgerLines: 0 }));
    spaces.forEach((n, i) => expect(staffPosition(n, { guitar: false }), n).toMatchObject({ position: i * 2 + 1, onLine: false, ledgerLines: 0 }));
    expect(staffPosition('C4', { guitar: false })).toMatchObject({ position: -2, onLine: true, ledgerLines: -1, ledgerPositions: [-2] });
    expect(staffPosition('D4', { guitar: false })).toMatchObject({ position: -1, ledgerLines: 0 });
    expect(staffPosition('B3', { guitar: false })).toMatchObject({ position: -3, ledgerLines: -1 });
    expect(staffPosition('A3', { guitar: false })).toMatchObject({ position: -4, ledgerLines: -2, ledgerPositions: [-2, -4] });
    expect(staffPosition('G5', { guitar: false })).toMatchObject({ position: 9, ledgerLines: 0 });
    expect(staffPosition('A5', { guitar: false })).toMatchObject({ position: 10, onLine: true, ledgerLines: 1, ledgerPositions: [10] });
    expect(staffPosition('C6', { guitar: false })).toMatchObject({ position: 12, ledgerLines: 2, ledgerPositions: [10, 12] });
  });

  it('writes guitar notes an octave above where they sound', () => {
    // The six open strings, as every guitar method book shows them.
    expect(staffPosition('E2')).toMatchObject({ position: -7, onLine: false, ledgerLines: -3, ledgerPositions: [-2, -4, -6], written: 'E3' });
    expect(staffPosition('A2')).toMatchObject({ position: -4, onLine: true, ledgerLines: -2, written: 'A3' });
    expect(staffPosition('D3')).toMatchObject({ position: -1, onLine: false, ledgerLines: 0, written: 'D4' });
    expect(staffPosition('G3')).toMatchObject({ position: 2, onLine: true, ledgerLines: 0, written: 'G4' });
    expect(staffPosition('B3')).toMatchObject({ position: 4, onLine: true, ledgerLines: 0, written: 'B4' });
    expect(staffPosition('E4')).toMatchObject({ position: 7, onLine: false, ledgerLines: 0, written: 'E5' });
    // Sounding middle C is written in the third space; the 12th fret of the high E string (E5) sits on the third ledger line above.
    expect(staffPosition('C4')).toMatchObject({ position: 5, written: 'C5' });
    expect(staffPosition('C3')).toMatchObject({ position: -2, ledgerLines: -1, written: 'C4' });
    expect(staffPosition('E5')).toMatchObject({ position: 14, onLine: true, ledgerLines: 3, written: 'E6' });
  });

  it('keeps accidentals out of the position and reports them', () => {
    expect(staffPosition('F#2')).toMatchObject({ position: -6, accidental: 1, written: 'F#3' });
    expect(staffPosition('Gb2')).toMatchObject({ position: -5, accidental: -1, written: 'Gb3' });
    expect(staffPosition('Bb3').position).toBe(staffPosition('B3').position);
    expect(staffPosition('Cb4', { guitar: false }).position).toBe(-2);
    expect(staffPosition('B#3', { guitar: false }).position).toBe(-3);
    expect(staffPosition('F##4', { guitar: false })).toMatchObject({ position: 1, accidental: 2 });
  });

  it('chooses stem direction around the middle line', () => {
    expect(staffPosition('A4', { guitar: false }).stem).toBe('up');
    expect(staffPosition('B4', { guitar: false }).stem).toBe('down');
    expect(staffPosition('C5', { guitar: false }).stem).toBe('down');
    expect(staffPosition('E2').stem).toBe('up');
  });

  it('supports the bass clef', () => {
    const lines = ['G2', 'B2', 'D3', 'F3', 'A3'];
    lines.forEach((n, i) => expect(staffPosition(n, { clef: 'bass', guitar: false }), n).toMatchObject({ position: i * 2, ledgerLines: 0 }));
    expect(staffPosition('C4', { clef: 'bass', guitar: false })).toMatchObject({ position: 10, ledgerLines: 1 });
    expect(staffPosition('E2', { clef: 'bass', guitar: false })).toMatchObject({ position: -2, ledgerLines: -1 });
  });

  it('needs an octave', () => {
    expect(() => staffPosition('E')).toThrow(RangeError);
    expect(() => staffPosition('nope')).toThrow(RangeError);
    expect(staffPositionOfMidi(40, 'E')).toMatchObject({ position: -7, written: 'E3' });
    expect(staffPositionOfMidi(60, 'B#', { guitar: false })).toMatchObject({ position: -3, accidental: 1 });
  });
});

describe('noteAtStaffPosition', () => {
  it('is the inverse of staffPosition for natural notes', () => {
    for (let position = -9; position <= 16; position++) {
      for (const guitar of [true, false]) {
        for (const clef of ['treble', 'bass'] as const) {
          const name = noteAtStaffPosition(position, { guitar, clef });
          expect(staffPosition(name, { guitar, clef }).position, `${name} ${clef}`).toBe(position);
          expect(name).toMatch(/^[A-G]-?\d$/);
        }
      }
    }
    expect(noteAtStaffPosition(0)).toBe('E3');
    expect(noteAtStaffPosition(0, { guitar: false })).toBe('E4');
    expect(noteAtStaffPosition(-7)).toBe('E2');
    expect(noteAtStaffPosition(8)).toBe('F4');
    expect(noteAtStaffPosition(0, { clef: 'bass', guitar: false })).toBe('G2');
  });

  it('applies a key signature', () => {
    expect(noteAtStaffPosition(8, { fifths: 1 })).toBe('F#4');
    expect(noteAtStaffPosition(1, { fifths: 2 })).toBe('F#3');
    expect(noteAtStaffPosition(5, { fifths: 2 })).toBe('C#4');
    expect(noteAtStaffPosition(4, { fifths: -1 })).toBe('Bb3');
    expect(noteAtStaffPosition(4, { fifths: 2 })).toBe('B3');
    expect(noteAtStaffPosition(7, { fifths: -2 })).toBe('Eb4');
  });
});

describe('key signature layout', () => {
  it('puts sharps and flats where engravers do', () => {
    expect(keySignaturePositions(0)).toEqual([]);
    expect(keySignaturePositions(1)).toEqual([8]);
    expect(keySignaturePositions(2)).toEqual([8, 5]);
    expect(keySignaturePositions(7)).toEqual([8, 5, 9, 6, 3, 7, 4]);
    expect(keySignaturePositions(-1)).toEqual([4]);
    expect(keySignaturePositions(-7)).toEqual([4, 7, 3, 6, 2, 5, 1]);
    expect(keySignaturePositions(3, 'bass')).toEqual([6, 3, 7]);
    expect(keySignaturePositions(-2, 'bass')).toEqual([2, 5]);
  });

  it('puts each accidental on the line or space of its own letter', () => {
    for (const fifths of [7, -7]) {
      for (const clef of ['treble', 'bass'] as const) {
        const positions = keySignaturePositions(fifths, clef);
        const letters = keySignature(fifths).accidentals.map((a) => a[0]);
        positions.forEach((p, i) => {
          expect(noteAtStaffPosition(p, { clef, guitar: false })[0], `${fifths} ${clef} #${i}`).toBe(letters[i]);
          expect(p).toBeGreaterThanOrEqual(-1);
          expect(p).toBeLessThanOrEqual(9);
        });
      }
    }
  });

  it('knows the written range of the guitar', () => {
    expect(guitarStaffRange()).toEqual({ low: -7, high: 20, lowNote: 'E2', highNote: 'D6' });
    expect(guitarStaffRange(12)).toMatchObject({ high: 14, highNote: 'E5' });
    expect(guitarStaffRange(24).highNote).toBe('E6');
  });
});
