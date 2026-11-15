import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { midiAt } from '@/core/guitar';
import { chordNotes, chroma, getKey, scaleNotes } from '@/core/theory';
import { AREAS, AREA_INFO, FOCUS_AREAS } from './areas';
import { CONTENT, CONTENT_BY_ID, poolFor, targetOf } from './content';

/** Pitch class at a string (1 = high E) and fret, in standard tuning. */
const pc = (string: number, fret: number) => midiAt({ string, fret }) % 12;
const pcs = (names: readonly string[]) => names.map((n) => chroma(n));

describe('the exercise pool', () => {
  it('has unique ids, real text and a screen that exists for every item', () => {
    expect(new Set(CONTENT.map((c) => c.id)).size).toBe(CONTENT.length);
    for (const c of CONTENT) {
      expect(c.title.length, c.id).toBeGreaterThan(3);
      expect(c.goal.length, c.id).toBeGreaterThan(20);
      expect(c.levels.length, c.id).toBeGreaterThan(0);
      expect(ROUTE_BY_NAME[targetOf(c).route], `${c.id} -> ${targetOf(c).route}`).toBeDefined();
      if (c.extra) expect(ROUTE_BY_NAME[c.extra.route], `${c.id} extra`).toBeDefined();
      // Copy rules: no exclamation-mark hype.
      expect(c.goal.includes('!'), c.id).toBe(false);
    }
  });

  it('names the skills it trains the way the rest of the app does (lower-case slugs)', () => {
    // core/progress documents `chord:g`, `chord:am7`: an upper-case `chord:F` would never meet the
    // chord screen's `chord:f`, so a practised block would not refresh it.
    for (const c of CONTENT) {
      if (!c.skillId) continue;
      expect(c.skillId, c.id).toMatch(/^[a-z-]+(:[a-z0-9]+(-[a-z0-9]+)*)+$/);
    }
    expect(CONTENT_BY_ID['f-barre'].skillId).toBe('chord:f');
    expect(CONTENT_BY_ID['first-chords-ring'].skillId).toBe('chord:em');
  });

  it('gives every area a screen that exists, and every level something in every area', () => {
    for (const a of AREAS) expect(ROUTE_BY_NAME[AREA_INFO[a].target.route], a).toBeDefined();
    for (const level of ['beginner', 'intermediate', 'expert'] as const) {
      for (const a of [...FOCUS_AREAS, 'warmup', 'free'] as const) expect(poolFor(a, level).length, `${level} ${a}`).toBeGreaterThan(0);
    }
  });
});

describe('the facts the exercises state', () => {
  it('notes on the low E and A strings', () => {
    expect([0, 1, 3, 5, 7, 8, 10, 12].map((f) => pc(6, f))).toEqual(pcs(['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']));
    expect([0, 2, 3, 5, 7, 8, 10, 12].map((f) => pc(5, f))).toEqual(pcs(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']));
    expect(CONTENT_BY_ID['notes-low-e'].goal).toContain('0, 1, 3, 5, 7, 8, 10 and 12');
    expect(CONTENT_BY_ID['notes-a-string'].goal).toContain('0, 2, 3, 5, 7, 8, 10 and 12');
  });

  it('every C below the 12th fret', () => {
    const cs: Array<[number, number]> = [[6, 8], [5, 3], [4, 10], [3, 5], [2, 1], [1, 8]];
    for (const [s, f] of cs) expect(pc(s, f), `string ${s} fret ${f}`).toBe(chroma('C'));
  });

  it('a whole-step bend from the 5th to the 7th fret of the G string', () => {
    expect(pc(3, 7)).toBe(chroma('D'));
    expect(pc(3, 5)).toBe(chroma('C'));
    expect(midiAt({ string: 3, fret: 7 }) - midiAt({ string: 3, fret: 5 })).toBe(2);
  });

  it('the A minor sweep at the 12th fret', () => {
    expect([pc(3, 14), pc(2, 13), pc(1, 12)]).toEqual(pcs(['A', 'C', 'E']));
    expect(new Set([pc(3, 14), pc(2, 13), pc(1, 12)])).toEqual(new Set(pcs(chordNotes('Am'))));
  });

  it('A minor pentatonic boxes 1 and 2', () => {
    const scale = new Set(pcs(scaleNotes('A', 'minor-pentatonic')));
    const box1: Record<number, number[]> = { 6: [5, 8], 5: [5, 7], 4: [5, 7], 3: [5, 7], 2: [5, 8], 1: [5, 8] };
    const box2: Record<number, number[]> = { 6: [8, 10], 5: [7, 10], 4: [7, 10], 3: [7, 9], 2: [8, 10], 1: [8, 10] };
    for (const box of [box1, box2]) {
      const seen = new Set<number>();
      for (const [s, frets] of Object.entries(box)) for (const f of frets) {
        expect(scale.has(pc(Number(s), f)), `string ${s} fret ${f}`).toBe(true);
        seen.add(pc(Number(s), f));
      }
      expect(seen).toEqual(scale);
    }
    // Box 2 really spans frets 7 to 10.
    const frets = Object.values(box2).flat();
    expect(Math.min(...frets)).toBe(7);
    expect(Math.max(...frets)).toBe(10);
  });

  it('C major and G major in open position', () => {
    const cMajor: Array<[number, number]> = [[5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1]];
    const midis = cMajor.map(([s, f]) => midiAt({ string: s, fret: f }));
    expect(midis.map((m) => m % 12)).toEqual(pcs(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']));
    expect([...midis].sort((a, b) => a - b)).toEqual(midis);
    // G major two octaves: low E 3rd fret to high E 3rd fret, F sharp at D string 4 and high E 2.
    expect(pc(6, 3)).toBe(chroma('G'));
    expect(midiAt({ string: 1, fret: 3 }) - midiAt({ string: 6, fret: 3 })).toBe(24);
    expect(pc(4, 4)).toBe(chroma('F#'));
    expect(pc(1, 2)).toBe(chroma('F#'));
    expect(scaleNotes('G', 'major')).toContain('F#');
  });

  it('the F barre chord and the E-shape barre around the neck', () => {
    // E shape at fret 1: 1 3 3 2 1 1 (low to high), fingers as the exercise describes.
    const shape: Array<[number, number]> = [[6, 1], [5, 3], [4, 3], [3, 2], [2, 1], [1, 1]];
    expect(new Set(shape.map(([s, f]) => pc(s, f)))).toEqual(new Set(pcs(chordNotes('F'))));
    expect(pc(6, 3)).toBe(chroma('G'));
    expect(pc(6, 5)).toBe(chroma('A'));
    expect(pc(6, 8)).toBe(chroma('C'));
  });

  it('E minor to A minor: fingers 2 and 3 move one string over', () => {
    // Em: A string 2 (finger 2), D string 2 (finger 3). Am: D string 2 (2), G string 2 (3), B string 1 (1).
    const em = [pc(6, 0), pc(5, 2), pc(4, 2), pc(3, 0), pc(2, 0), pc(1, 0)];
    const am = [pc(5, 0), pc(4, 2), pc(3, 2), pc(2, 1), pc(1, 0)];
    expect(new Set(em)).toEqual(new Set(pcs(chordNotes('Em'))));
    expect(new Set(am)).toEqual(new Set(pcs(chordNotes('Am'))));
  });

  it('E against E minor changes one note', () => {
    const major = new Set(pcs(chordNotes('E')));
    const minor = new Set(pcs(chordNotes('Em')));
    expect([...major].filter((n) => !minor.has(n))).toEqual([chroma('G#')]);
  });

  it('the circle of fifths counts and the Roman numerals in G', () => {
    const sharps: Array<[string, number]> = [['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6]];
    for (const [tonic, n] of sharps) expect(getKey(`${tonic} major`)?.signature.fifths, tonic).toBe(n);
    const flats: Array<[string, number]> = [['F', -1], ['Bb', -2], ['Eb', -3], ['Ab', -4]];
    for (const [tonic, n] of flats) expect(getKey(`${tonic} major`)?.signature.fifths, tonic).toBe(n);
    const g = scaleNotes('G', 'major');
    expect([g[0], g[5], g[3], g[4]]).toEqual(['G', 'E', 'C', 'D']); // I vi IV V
  });

  it('the ii–V–I voice leading rule', () => {
    const [dm7, g7, cmaj7] = [chordNotes('Dm7'), chordNotes('G7'), chordNotes('Cmaj7')];
    const halfStepDown = (from: string, to: string) => (chroma(from) - chroma(to) + 12) % 12 === 1;
    // The seventh falls a half step to the next third; the third stays as the next seventh.
    expect(halfStepDown(dm7[3], g7[1])).toBe(true); // C -> B
    expect(dm7[1]).toBe(g7[3]); // F stays
    expect(halfStepDown(g7[3], cmaj7[1])).toBe(true); // F -> E
    expect(g7[1]).toBe(cmaj7[3]); // B stays
  });

  it('Dorian and melodic minor as described', () => {
    const dorian = scaleNotes('D', 'dorian');
    expect(new Set(dorian)).toEqual(new Set(scaleNotes('C', 'major')));
    expect(dorian[5]).toBe('B');
    expect(scaleNotes('A', 'melodic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G#']);
  });
});
