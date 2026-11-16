/** Tempo words, text layout, paper finding, page list helpers and the keyboard model. */
import { describe, expect, it } from 'vitest';
import { importSong } from '@/core/song';
import { parseTempoText } from './tempo';
import { estimateCharWidth, groupLines, layoutText, type TextPiece } from './text-layout';
import { findPaper, otsu, padBox, shrinkGray } from './paper';
import { describeLook, movePage, pdfScale, sheetKind, type PageKind, type ScanPage } from './pages';
import { DIGIT_WINDOW_MS, keyCommand, typeDigit } from './keys';

describe('parseTempoText', () => {
  it('reads metronome marks, how OCR spells them, and tempo words', () => {
    expect(parseTempoText('♩ = 96')).toBe(96);
    expect(parseTempoText('J = 72')).toBe(72);
    expect(parseTempoText('q=120')).toBe(120);
    expect(parseTempoText('♩. = 60')).toBe(90);
    expect(parseTempoText('Tempo 100')).toBe(100);
    expect(parseTempoText('110 bpm')).toBe(110);
    expect(parseTempoText('Slowly')).toBe(66);
    expect(parseTempoText('Andante')).toBe(84);
    expect(parseTempoText('Allegro moderato')).toBe(120);
    expect(parseTempoText('Allegro')).toBe(132);
    expect(parseTempoText('Verse 1')).toBeNull();
    expect(parseTempoText('')).toBeNull();
  });
});

describe('layoutText', () => {
  // A chord sheet as OCR returns it: words with boxes, 10 px per character.
  const word = (text: string, col: number, row: number): TextPiece => ({ text, x: 40 + col * 10, y: 100 + row * 22, w: text.length * 10, h: 16 });

  it('puts chords back over the syllables they belong to', () => {
    const pieces = [word('G', 0, 0), word('C', 12, 0), word('D', 22, 0), word('Down', 0, 1), word('by', 5, 1), word('the', 8, 1), word('river', 12, 1), word('side', 22, 1)];
    const text = layoutText(pieces);
    expect(text).toBe('G           C         D\nDown by the river     side');
    expect(estimateCharWidth(pieces)).toBe(10);
  });

  it('joins pieces of one word, keeps lines in order and leaves a blank line between verses', () => {
    const pieces = [word('Am', 0, 3), { ...word('7', 2, 3) }, word('Hello', 0, 0), word('there', 6, 1)];
    expect(groupLines(pieces).map((l) => l.map((p) => p.text).join(' '))).toEqual(['Hello', 'there', 'Am 7']);
    expect(layoutText(pieces)).toBe('Hello\n      there\n\nAm7');
  });

  it('rebuilds typed ASCII tab so the importer reads it', async () => {
    const rows = ['e|-----0-----|', 'B|---1---1---|', 'G|-2-------2-|', 'D|-----------|', 'A|-3---------|', 'E|-----------|'];
    // One piece per line, as a PDF text layer gives it.
    const pieces = rows.map((t, i) => ({ text: t, x: 72, y: 200 + i * 12, w: t.length * 7.2, h: 10 }));
    const text = layoutText(pieces);
    expect(text.split('\n')).toEqual(rows);
    const r = await importSong(text);
    expect(r.format).toBe('ascii-tab');
    const notes = r.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes.map((n) => `${n.string}:${n.fret}`)).toEqual(expect.arrayContaining(['5:3', '3:2', '2:1', '1:0']));
  });
});

describe('findPaper', () => {
  function photo(w: number, h: number, paper: { x: number; y: number; w: number; h: number } | null) {
    const data = new Uint8Array(w * h).fill(paper ? 70 : 235);
    if (paper) for (let y = paper.y; y < paper.y + paper.h; y++) for (let x = paper.x; x < paper.x + paper.w; x++) data[y * w + x] = 235;
    // Staff lines on the paper: thin dark strokes must not break the paper up.
    for (let s = 0; s < 6; s++) {
      const y = (paper?.y ?? 0) + 40 + s * 12;
      for (let x = (paper?.x ?? 0) + 20; x < (paper ? paper.x + paper.w : w) - 20; x++) data[y * w + x] = 20;
    }
    return { width: w, height: h, data };
  }

  it('finds a sheet lying on a dark desk', () => {
    const p = findPaper(photo(800, 600, { x: 120, y: 60, w: 520, h: 480 }));
    expect(p.desk).toBe(true);
    expect(Math.abs(p.box.x - 120)).toBeLessThan(12);
    expect(Math.abs(p.box.y - 60)).toBeLessThan(12);
    expect(Math.abs(p.box.w - 520)).toBeLessThan(16);
    expect(Math.abs(p.box.h - 480)).toBeLessThan(16);
    expect(p.cover).toBeGreaterThan(0.45);
    expect(p.cover).toBeLessThan(0.6);
  });

  it('says the whole picture when there is only paper', () => {
    const p = findPaper(photo(600, 800, null));
    expect(p).toEqual({ box: { x: 0, y: 0, w: 600, h: 800 }, cover: 1, desk: false });
  });

  it('has working helpers', () => {
    const img = { width: 10, height: 10, data: new Uint8Array(100).map((_, i) => (i % 2 ? 0 : 255)) };
    expect(shrinkGray(img, 5).img.width).toBe(5);
    expect(otsu({ width: 2, height: 1, data: new Uint8Array([10, 240]) })).toBeGreaterThanOrEqual(10);
    expect(padBox({ x: 5, y: 5, w: 10, h: 10 }, 8, 20, 20)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });
});

describe('pages', () => {
  const page = (id: string, kind: PageKind, pdfText?: string): ScanPage => ({
    id, label: id, origin: 'photo', width: 10, height: 10, thumbUrl: '', url: '', ...(pdfText ? { pdfText } : {}),
    look: { kind, staves: [], barlines: [], paper: null, quality: 1, skew: 0, staffSpace: 12, summary: '', advice: null },
  });

  it('moves pages and decides how the sheet is read', () => {
    expect(movePage(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(movePage(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(sheetKind([])).toBe('empty');
    expect(sheetKind([page('1', 'tab'), page('2', 'text')])).toBe('music');
    expect(sheetKind([page('1', 'text')])).toBe('text');
    expect(sheetKind([page('1', 'not-music', 'G C D')])).toBe('text');
    expect(sheetKind([{ ...page('1', 'tab'), look: null }])).toBe('unknown');
  });

  it('describes a page and gives advice only when it helps', () => {
    expect(describeLook({ kind: 'both', tab: 2, notation: 2, quality: 0.9, skew: 0.4, staffSpace: 12, paperCover: null })).toEqual({ summary: '2 notation staves and 2 tab staves found.', advice: null });
    expect(describeLook({ kind: 'tab', tab: 1, notation: 0, quality: 0.3, skew: 0, staffSpace: 12, paperCover: null }).advice).toMatch(/soft or dim/);
    expect(describeLook({ kind: 'tab', tab: 1, notation: 0, quality: 0.9, skew: 0, staffSpace: 5, paperCover: null }).advice).toMatch(/move closer/);
    expect(describeLook({ kind: 'not-music', tab: 0, notation: 0, quality: 0, skew: 0, staffSpace: 0, paperCover: null }).advice).toMatch(/Retake/);
    expect(describeLook({ kind: 'text', tab: 0, notation: 0, quality: 1, skew: 0, staffSpace: 0, paperCover: null, textLines: 12 }).summary).toBe('12 lines of text: chords, lyrics or typed tab.');
  });

  it('renders PDF pages so the staves come out about 18 px apart, within limits', () => {
    const a4 = { width: 595, height: 842 };
    expect(pdfScale(a4)).toBeCloseTo(250 / 72, 5);
    expect(pdfScale(a4, { staffSpaceAt1: 6 })).toBeCloseTo(3, 5);
    expect(pdfScale(a4, { staffSpaceAt1: 1 }) * 842).toBeLessThanOrEqual(3400);
    expect(pdfScale(a4, { staffSpaceAt1: 30 })).toBeCloseTo(150 / 72, 5);
  });
});

describe('keyboard', () => {
  it('maps keys to editor commands', () => {
    expect(keyCommand({ key: 'ArrowLeft' })).toEqual({ type: 'move', dir: 'left' });
    expect(keyCommand({ key: '7' })).toEqual({ type: 'digit', digit: 7 });
    expect(keyCommand({ key: 'Delete' })).toEqual({ type: 'delete', beat: false });
    expect(keyCommand({ key: 'Backspace', shiftKey: true })).toEqual({ type: 'delete', beat: true });
    expect(keyCommand({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(keyCommand({ key: 'Z', metaKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(keyCommand({ key: 'y', ctrlKey: true })).toEqual({ type: 'redo' });
    expect(keyCommand({ key: 'q' })).toEqual({ type: 'value', base: 4 });
    expect(keyCommand({ key: 'n' })).toEqual({ type: 'next' });
    expect(keyCommand({ key: ' ' })).toEqual({ type: 'play' });
    expect(keyCommand({ key: 'c', ctrlKey: true })).toBeNull();
    expect(keyCommand({ key: 'Tab' })).toBeNull();
  });

  it('joins two quick digits into one fret, but never past 24 or after a zero', () => {
    const a = typeDigit(null, '0:0:0', 1, 1000);
    expect(a.fret).toBe(1);
    const b = typeDigit(a.typing, '0:0:0', 2, 1000 + DIGIT_WINDOW_MS - 1);
    expect(b.fret).toBe(12);
    // A third digit starts again.
    expect(typeDigit(b.typing, '0:0:0', 5, 1100).fret).toBe(5);
    // Too slow, another note, too high, after a zero.
    expect(typeDigit(a.typing, '0:0:0', 2, 1000 + DIGIT_WINDOW_MS + 1).fret).toBe(2);
    expect(typeDigit(a.typing, '0:1:0', 2, 1001).fret).toBe(2);
    expect(typeDigit(typeDigit(null, 'n', 3, 0).typing, 'n', 5, 10).fret).toBe(5);
    expect(typeDigit(typeDigit(null, 'n', 0, 0).typing, 'n', 5, 10).fret).toBe(5);
  });
});
