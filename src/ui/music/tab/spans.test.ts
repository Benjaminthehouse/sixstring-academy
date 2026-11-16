import { describe, expect, it } from 'vitest';
import { sixTab } from '@/core/song';
import { drawSystem, type TabGlyph, type TabNoteGlyph } from './draw';
import { layoutTab } from './layout';
import { buildTabModel } from './model';

const song = (body: string, head = '') => sixTab(`title: T\n${head}\n${body}\n`);
const texts = (g: TabGlyph[], c: string) => g.filter((x): x is Extract<TabGlyph, { k: 'text' }> => x.k === 'text' && x.c === c);

describe('let ring and palm mute are written once per stretch', () => {
  it('lets a let-ring bass ring through the melody notes after it, to the end of the bar', () => {
    // An arpeggio: only the bass notes are marked let ring.
    const m = buildTabModel(song('| e 5:3{lr} 3:0 2:1 3:0 4:2{lr} 3:0 2:1 3:0 | e 5:3{lr} 3:0 2:1 3:0 h r |')).measures;
    expect(m[0].columns.map((c) => c.flags.letRing)).toEqual([true, false, false, false, true, false, false, false]);
    expect(m[0].columns.every((c) => c.flags.ringing)).toBe(true);
    // A rest stops it.
    expect(m[1].columns.map((c) => c.flags.ringing)).toEqual([true, true, true, true, false]);
    // Striking the let-ring string again without let ring stops it too.
    const stopped = buildTabModel(song('| e 5:3{lr} 3:0 5:2 3:0 h 3:2 |')).measures[0];
    expect(stopped.columns.map((c) => c.flags.ringing)).toEqual([true, true, false, false, false]);
  });

  it('draws one "let ring" for a bar of let-ring basses under a tremolo, not one per bass', () => {
    const tremolo = song('| s 5:5{lr} 1:5 1:5 1:5 4:7 1:5 1:5 1:5 3:7 1:5 1:5 1:5 4:7{lr} 1:5 1:5 1:5 | s 4:0{lr} 2:10 2:10 2:10 5:12 2:10 2:10 2:10 3:10 1:10 1:10 1:10 5:12 1:10 1:10 1:10 |');
    for (const width of [340, 1200]) {
      const L = layoutTab(buildTabModel(tremolo), { width });
      const labels = L.systems.flatMap((_s, si) => texts(drawSystem(L, si).glyphs, 'spanLabel').map((t) => t.text));
      expect(labels, `${width} px`).toEqual(Array(L.systems.length).fill('let ring'));
    }
  });

  it('keeps a thumb-muted bass under a melody in one P.M. stretch', () => {
    // The fingerstyle blues: P.M. on the thumb every beat, the melody unmuted in between.
    const blues = buildTabModel(song('| q3 (6:0{pm} 1:3) e3 2:3 q3 (6:0{pm} 3:3) e3 3:4 q (6:0{pm} 3:2) (6:0{pm}) |', 'key: E')).measures[0];
    expect(blues.columns.map((c) => c.flags.muted)).toEqual([true, true, true, true, true, true]);
    const L = layoutTab(buildTabModel(song('| q3 (6:0{pm} 1:3) e3 2:3 q3 (6:0{pm} 3:3) e3 3:4 q (6:0{pm} 3:2) (6:0{pm}) |')), { width: 1000 });
    expect(texts(drawSystem(L, 0).glyphs, 'spanLabel').map((t) => t.text)).toEqual(['P.M.']);
    // The stretch runs on across a barline when the next bar's thumb is muted too.
    const twoBars = buildTabModel(song('| q (6:0{pm} 1:0) 2:3 (6:0{pm} 2:0) 1:0 | q (6:0{pm} 3:2) 3:0 h (6:0{pm}) |'));
    expect(twoBars.measures.flatMap((m) => m.columns.map((c) => c.flags.muted))).toEqual([true, true, true, true, true, true, true]);
    const wide = layoutTab(twoBars, { width: 1200 });
    expect(texts(drawSystem(wide, 0).glyphs, 'spanLabel').map((t) => t.text)).toEqual(['P.M.']);
    // A muted string struck open again ends the stretch: a riff of muted and open low notes keeps its own marks.
    const riff = buildTabModel(song('| e 6:0{pm} 6:3 6:0{pm} 6:3 h r |')).measures[0];
    expect(riff.columns.map((c) => c.flags.muted)).toEqual([true, false, true, false, false]);
  });
});

describe('held notes', () => {
  it('show their fret once per bar, tied from the struck note, not as a run of (0)s', () => {
    // A bass held under a moving melody, into the next bar.
    const model = buildTabModel(song('| e (6:0 1:0) (6:- 1:2) (6:- 1:3) (6:- 1:5) h (6:- 1:7) | q (6:- 1:5) (6:- 1:3) h 6:3 |'));
    const L = layoutTab(model, { width: 1200 });
    const notes = drawSystem(L, 0).glyphs.filter((g): g is TabNoteGlyph => g.k === 'note');
    const bass = notes.filter((n) => n.key.endsWith(':6'));
    expect(bass.map((n) => `${n.paren ? `(${n.text})` : n.text}`)).toEqual(['0', '(0)', '(0)', '3']);
    // One tie per drawn piece: the struck note to the end of the hold in bar 1, then on into bar 2.
    const ties = drawSystem(L, 0).glyphs.filter((g) => g.k === 'path' && g.c === 'tie');
    expect(ties).toHaveLength(2);
    // The hidden pieces are still there for the staff and for note states.
    expect(model.measures[0].columns.map((c) => c.notes.find((n) => n.string === 6)?.hidden ?? false)).toEqual([false, true, true, true, false]);
    expect(model.measures[0].columns[4].notes.find((n) => n.string === 6)?.from).toEqual({ measure: 0, col: 0, string: 6 });
    expect(model.measures[1].columns[1].notes.find((n) => n.string === 6)?.from).toEqual({ measure: 0, col: 4, string: 6 });
  });
});

describe('annotations over spans', () => {
  it('leave room between an annotation and the "let ring" under it, at phone and desktop sizes', () => {
    const s = song('| ^"Tuning D A D G A D" q (6:0 2:0){lr} 1:0 1:2 | q (4:0 1:4){lr} 1:2 1:0 |', 'time: 3/4\ntuning: dadgad');
    for (const [width, zoom] of [[330, 0.85], [330, 1], [1100, 1]] as const) {
      const L = layoutTab(buildTabModel(s), { width, zoom });
      const g = drawSystem(L, 0).glyphs;
      const note = texts(g, 'annotation')[0];
      const label = texts(g, 'spanLabel')[0];
      // Baselines: the annotation's descenders reach 0.25 em below its baseline, the label's ascenders 0.75 em above its own.
      const clearance = label.y - 0.75 * 10 * zoom - (note.y + 0.25 * 10.5 * zoom);
      expect(clearance, `${width} px at ${zoom}`).toBeGreaterThanOrEqual(4);
    }
  });
});
