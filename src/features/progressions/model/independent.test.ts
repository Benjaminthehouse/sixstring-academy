/**
 * An independent cross-check of what the progression page shows, for 23 catalog progressions in
 * two keys each. Nothing here asks the theory engine what a chord is: numerals, spellings, chord
 * tones, fretted pitches and scale notes are worked out from first principles below (letters and
 * the major scale's semitone pattern), then compared with the page model, the shapes and the
 * scale suggestions the screen draws.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, keyChoices, soloScales } from '@/content/progressions';
import { pageModel } from './page';
import { chordScale, endingChord } from './jam';
import { defaultTonic } from './keys';

// ── A little music theory, written from scratch ─────────────────────────────────────────────

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Letter index and pitch class of a spelled note ('Bb', 'F#', 'C##'), octave ignored. */
function note(n: string): { letter: number; pc: number } {
  const m = /^([A-G])(#{1,2}|x|b{1,2})?/.exec(n);
  if (!m) throw new Error(`not a note: ${n}`);
  const letter = LETTERS.indexOf(m[1]);
  const acc = m[2] ?? '';
  const shift = acc === 'x' ? 2 : acc.startsWith('#') ? acc.length : -acc.length;
  return { letter, pc: mod12(LETTER_PC[letter] + shift) };
}

/** A spelled degree of a major scale built on `tonic`, raised/lowered by `alt`. */
function degreeOf(tonic: { letter: number; pc: number }, degree: number, alt: number) {
  return { letter: (tonic.letter + degree - 1) % 7, pc: mod12(tonic.pc + MAJOR[degree - 1] + alt) };
}

const ROMANS = ['vii', 'iii', 'vi', 'iv', 'ii', 'v', 'i'];
const ROMAN_DEGREE: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

/** Intervals above the root for a numeral's quality (upper case = major third). */
function quality(upper: boolean, q: string): number[] {
  const third = upper ? 4 : 3;
  const table: Record<string, number[]> = {
    '': [0, third, 7],
    '7': [0, third, 7, 10],
    maj7: [0, third, 7, 11],
    '6': [0, third, 7, 9],
    '9': [0, third, 7, 10, 2],
    '69': [0, third, 7, 9, 2],
    '13': [0, third, 7, 10, 2, 9],
    '7b9': [0, third, 7, 10, 1],
    b9: [0, third, 7, 10, 1],
    '°': [0, 3, 6],
    '°7': [0, 3, 6, 9],
    'ø7': [0, 3, 6, 10],
    '+': [0, 4, 8],
    '5': [0, 7],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    '9sus4': [0, 5, 7, 10, 2],
  };
  const t = table[q];
  if (!t) throw new Error(`quality not in the table: ${q}`);
  return t;
}

/** Parse one numeral ('bVII7', '#iv°7', 'subV7', 'ii7') to degree, alteration, case and quality. */
function numeral(text: string): { degree: number; alt: number; upper: boolean; q: string; sub: boolean } {
  let s = text;
  const sub = s.startsWith('sub');
  if (sub) s = s.slice(3);
  let alt = 0;
  while (s[0] === 'b' || s[0] === '#') {
    alt += s[0] === 'b' ? -1 : 1;
    s = s.slice(1);
  }
  const lower = s.toLowerCase();
  const r = ROMANS.find((x) => lower.startsWith(x));
  if (!r) throw new Error(`not a numeral: ${text}`);
  const head = s.slice(0, r.length);
  let q = s.slice(r.length);
  if (q === 'V7b9') q = '7b9';
  if (q === '7b9') q = '7b9';
  return { degree: ROMAN_DEGREE[r], alt, upper: head === head.toUpperCase(), q, sub };
}

/** What a chart token must sound like in a key: root (spelled), chord pitch classes, bass. */
function expected(token: string, tonicName: string): { rootLetter: number; rootPc: number; pcs: number[]; bassPc: number | null } {
  const tonic = note(tonicName);
  const parts = token.split('/');
  // A trailing part made of digits (with accidentals) is a bass degree of the key.
  let bassPc: number | null = null;
  if (parts.length > 1 && /^[b#]*\d$/.test(parts[parts.length - 1])) {
    const b = parts.pop()!;
    const alt = [...b].filter((c) => c === '#').length - [...b].filter((c) => c === 'b').length;
    bassPc = degreeOf(tonic, Number(b.replace(/[b#]/g, '')), alt).pc;
  }
  // Applied chords: X/Y means X in the major key of Y's root.
  let home = tonic;
  for (let i = parts.length - 1; i >= 1; i--) {
    const t = numeral(parts[i]);
    home = degreeOf(home, t.degree, t.alt);
  }
  const n = numeral(parts[0]);
  let root = degreeOf(home, n.degree, n.alt);
  if (n.sub) root = { letter: (home.letter + 1) % 7, pc: mod12(home.pc + 1) }; // subV: a half step above the target
  const pcs = quality(n.upper, n.q).map((i) => mod12(root.pc + i)).sort((a, b) => a - b);
  return { rootLetter: root.letter, rootPc: root.pc, pcs, bassPc };
}

/** Scale intervals by id, typed from the textbook. */
const SCALE: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
  'phrygian-dominant': [0, 1, 4, 5, 7, 8, 10],
  'lydian-dominant': [0, 2, 4, 6, 7, 9, 10],
  altered: [0, 1, 3, 4, 6, 8, 10],
  'locrian-natural-2': [0, 2, 3, 5, 6, 8, 10],
  'mixolydian-b6': [0, 2, 4, 5, 7, 8, 10],
  'lydian-augmented': [0, 2, 4, 6, 8, 9, 11],
  'dorian-b2': [0, 1, 3, 5, 7, 9, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  'minor-blues': [0, 3, 5, 6, 7, 10],
  'major-blues': [0, 2, 3, 4, 7, 9],
  'diminished-half-whole': [0, 1, 3, 4, 6, 7, 9, 10],
  'diminished-whole-half': [0, 2, 3, 5, 6, 8, 9, 11],
  'whole-tone': [0, 2, 4, 6, 8, 10],
  'bebop-dominant': [0, 2, 4, 5, 7, 9, 10, 11],
  'harmonic-major': [0, 2, 4, 5, 7, 8, 11],
  'ionian-augmented': [0, 2, 4, 5, 8, 9, 11],
  'dorian-sharp-4': [0, 2, 3, 6, 7, 9, 10],
  'lydian-sharp-2': [0, 3, 4, 6, 7, 9, 11],
  'super-locrian-bb7': [0, 1, 3, 4, 6, 8, 9],
};
const scalePcs = (tonic: string, id: string): Set<number> | null => {
  const iv = SCALE[id];
  return iv ? new Set(iv.map((i) => mod12(note(tonic).pc + i))) : null;
};

/** Standard tuning, sounding, low E first. */
const OPEN = [40, 45, 50, 55, 59, 64];

// ── The progressions ─────────────────────────────────────────────────────────────────────────

const IDS = [
  'pop-axis', 'pop-axis-walkdown', 'rock-i-bvii-iv', 'blues-12-bar', 'blues-jazz', 'blues-bird',
  'flamenco-andalusian', 'classical-canon-bass', 'classical-lament-chromatic', 'classical-neapolitan',
  'classical-augmented-sixth', 'jazz-ii-v-i', 'jazz-minor-ii-v-i', 'jazz-backdoor', 'jazz-tritone-sub',
  'jazz-coltrane-cycle', 'latin-bossa-turnaround', 'dorian-i-iv', 'lydian-pedal', 'metal-locrian',
  'line-minor-down', 'gospel-walk-up', 'secondary-leading-tone',
];

/** Two keys per progression: its default and the key a fourth above (often a flat key). */
function keysFor(id: string): string[] {
  const p = getProgression(id)!;
  const first = defaultTonic(p);
  const other = keyChoices(p)[mod12(note(first).pc + 5)];
  return [first, other];
}

describe('independent check: 23 progressions in two keys', () => {
  it('covers 20 or more progressions that exist', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(20);
    for (const id of IDS) expect(getProgression(id), id).not.toBeNull();
  });

  for (const id of IDS) {
    for (const tonic of keysFor(id)) {
      it(`${id} in ${tonic}: chords, spelling, shapes and scales`, () => {
        const p = getProgression(id)!;
        const m = pageModel(p, tonic);

        // Every chord of the chart: root letter and pitch class, chord tones, slash bass.
        for (const bar of m.resolved.bars) {
          for (const c of bar) {
            const want = expected(c.token, m.resolved.key.tonic);
            const root = note(c.root);
            expect(root.pc, `${c.token} root pitch in ${tonic}`).toBe(want.rootPc);
            expect(LETTERS[root.letter], `${c.token} root letter in ${tonic} (${c.root})`).toBe(LETTERS[want.rootLetter]);
            const got = [...new Set(c.notes.map((n) => note(n).pc))].sort((a, b) => a - b);
            if (/13$/.test(c.token)) {
              // A 13th chord may drop the 9th or 5th; it must keep root, third, seventh and 13th.
              for (const pc of [want.pcs[0], mod12(want.rootPc + 4), mod12(want.rootPc + 10), mod12(want.rootPc + 9)]) expect(got).toContain(pc);
              for (const pc of got) expect(want.pcs).toContain(pc);
            } else {
              expect(got, `${c.token} = ${c.symbol} tones in ${tonic}`).toEqual(want.pcs);
            }
            if (want.bassPc !== null) expect(c.bass ? note(c.bass).pc : root.pc, `${c.token} bass in ${tonic}`).toBe(want.bassPc);
            else expect(c.bass, `${c.token} has no slash bass`).toBeNull();
          }
        }

        // Every diagram: fretted pitches are chord tones, the colour tones are there, a slash
        // chord has its bass at the bottom, and one hand can reach it.
        for (const card of m.chords) {
          const v = card.voicing;
          expect(v, `${card.symbol} has a shape`).not.toBeNull();
          if (!v) continue;
          const tokenChord = m.resolved.bars.flat().find((c) => c.symbol === card.symbol)!;
          const want = expected(tokenChord.token, m.resolved.key.tonic);
          const midi = v.frets.map((f, i) => (f === null ? null : OPEN[i] + f)).filter((x): x is number => x !== null);
          expect(midi, `${card.symbol}: the shape's notes match its frets`).toEqual([...v.midi]);
          const pcs = new Set(midi.map(mod12));
          const allowed = new Set([...want.pcs, ...(want.bassPc !== null ? [want.bassPc] : [])]);
          for (const pc of pcs) expect(allowed.has(pc), `${card.symbol} (${v.frets.join(' ')}) plays only its own notes`).toBe(true);
          const third = want.pcs.find((pc) => mod12(pc - want.rootPc) === 3 || mod12(pc - want.rootPc) === 4);
          const seventh = want.pcs.find((pc) => mod12(pc - want.rootPc) === 10 || mod12(pc - want.rootPc) === 11 || (want.pcs.length === 4 && mod12(pc - want.rootPc) === 9 && /°7/.test(tokenChord.token)));
          if (third !== undefined && !/sus|5$/.test(tokenChord.token)) expect(pcs.has(third), `${card.symbol} (${v.frets.join(' ')}) has its third`).toBe(true);
          if (seventh !== undefined) expect(pcs.has(seventh), `${card.symbol} (${v.frets.join(' ')}) has its seventh`).toBe(true);
          if (want.pcs.length <= 4) expect(pcs.has(want.rootPc) || want.bassPc !== null, `${card.symbol} (${v.frets.join(' ')}) has its root`).toBe(true);
          if (want.bassPc !== null) expect(mod12(midi[0]), `${card.symbol} (${v.frets.join(' ')}) has its bass note lowest`).toBe(want.bassPc);
          const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted), `${card.symbol} (${v.frets.join(' ')}) fits under one hand`).toBeLessThanOrEqual(4);
        }

        // Scales to solo with: real scales, each of them home to at least one chord of the
        // progression, and between them they hold the first chord's root.
        const home = m.resolved.bars[0][0];
        const roots = new Set(m.resolved.bars.flat().map((c) => note(c.root).pc));
        const covered = new Set<number>();
        for (const s of soloScales(p, m.resolved.key.tonic)) {
          const pcs = scalePcs(s.tonic, s.scale);
          expect(pcs, `${s.tonic} ${s.scale} is a scale this check knows`).not.toBeNull();
          expect([...roots].some((r) => pcs!.has(r)), `${s.tonic} ${s.scale} fits a chord of ${id}`).toBe(true);
          for (const pc of pcs!) covered.add(pc);
        }
        expect(covered.has(note(home.root).pc), `the scales of ${id} hold its first chord's root`).toBe(true);

        // "Follow the chords": each chord's scale holds every chord tone, and a chord that lives
        // in the key gets the key's own notes (D Mixolydian over D in G).
        const keyPcs = scalePcs(m.resolved.key.tonic, m.resolved.key.scale);
        for (const c of m.resolved.bars.flat()) {
          const cs = chordScale(c.symbol, m.resolved.key);
          expect(cs, `a scale for ${c.symbol}`).not.toBeNull();
          if (!cs) continue;
          const pcs = scalePcs(cs.tonic, cs.scale);
          expect(pcs, `${cs.tonic} ${cs.scale} is a scale this check knows`).not.toBeNull();
          const tones = c.notes.map((n) => note(n).pc);
          for (const pc of tones) expect(pcs!.has(pc), `${cs.tonic} ${cs.scale} holds every note of ${c.symbol}`).toBe(true);
          expect(note(cs.tonic).pc, `${c.symbol}: the scale starts on the chord's root`).toBe(note(c.root).pc);
          if (keyPcs && tones.every((pc) => keyPcs.has(pc)) && tones.length >= 3) {
            expect([...pcs!].sort(), `${c.symbol} in ${m.resolved.key.tonic} ${m.resolved.key.scale}: ${cs.tonic} ${cs.scale}`).toEqual([...keyPcs].sort());
          }
        }

        // The ending of a "times through" jam lands on the home chord.
        const end = endingChord(m.resolved);
        const firstIsHome = note(home.root).pc === note(m.resolved.key.tonic).pc;
        if (firstIsHome) expect(end).toBeUndefined();
        else expect(end && mod12(end.root), `${id} ends at home`).toBe(note(m.resolved.key.tonic).pc);
      });
    }
  }
});
