import { describe, expect, it } from 'vitest';
import { CHORD_TYPES, chord as parseChord, chordPcs, chordTones, identifyChords, note as parseNote } from '@/core/theory';
import {
  TUNINGS, assignFingers, bestVoicing, checkVoicingFingering, chordDifficulty, chordVoicings, easiestVoicing, findBarres, formatFrets,
  generateVoicings, midiAt, tuning, type Voicing, type VoicingSearchOptions,
} from './index';

const shapes = (list: Voicing[]) => list.map((v) => formatFrets(v.frets));
const pc = (name: string) => parseNote(name).chroma;

/** What every voicing the generator returns must satisfy, whatever the chord, tuning or options. */
function expectPlayable(v: Voicing, symbol: string, opts: VoicingSearchOptions = {}): void {
  const label = `${symbol} ${formatFrets(v.frets)} (${v.tuning})`;
  const c = parseChord(symbol);
  const tones = new Set(chordPcs(c));
  // Only chord tones, at the pitches the frets give.
  for (const n of v.notes) {
    expect(n.midi, label).toBe(midiAt(n, { tuning: opts.tuning, capo: opts.capo }));
    expect(tones.has(n.midi % 12), `${label}: ${n.note}`).toBe(true);
  }
  // Every tone the chord cannot do without is there.
  const sounding = new Set(v.notes.map((n) => n.midi % 12));
  const strings = tuning(opts.tuning).stringCount;
  const required = chordTones(c).filter((t) => !t.omittable && !(c.type.id === '7alt' && !['root', 'third', 'seventh'].includes(t.role)));
  if (required.length <= strings && !opts.rootless) {
    for (const t of required) expect(sounding.has(pc(t.note)), `${label} lacks its ${t.degree}`).toBe(true);
  }
  // A hand can hold it.
  expect(checkVoicingFingering(v.frets, v.fingers), label).toEqual([]);
  expect(new Set(v.fingers.filter((f) => f !== null && f > 0)).size, label).toBeLessThanOrEqual(4);
  const hasOpen = v.frets.includes(0);
  expect(v.span, label).toBeLessThanOrEqual((opts.maxSpan ?? 4) + (hasOpen ? 1 : 0));
  expect(v.notes.length, label).toBeGreaterThanOrEqual(2);
}

describe('ranking', () => {
  it('puts the chord everyone learns first', () => {
    const first: Record<string, string> = {
      C: 'x32010', G: '320003', D: 'xx0232', A: 'x02220', E: '022100', Am: 'x02210', Em: '022000', Dm: 'xx0231',
      F: '133211', Bm: 'x24432', 'F#m': '244222', Bb: 'x13331', B7: 'x21202', G7: '320001', Cmaj7: 'x32000', 'D/F#': '200232', 'C/G': '332010',
    };
    for (const [symbol, frets] of Object.entries(first)) expect(formatFrets(chordVoicings(symbol)[0].frets), symbol).toBe(frets);
  });

  it('follows the open chord with the barre chords', () => {
    const c = chordVoicings('C');
    expect(shapes(c).slice(0, 3)).toEqual(['x32010', 'x35553', '8-10-10-9-8-8']);
    expect(c.slice(0, 3).map((v) => v.label)).toEqual(['Open', 'A-shape barre at fret 3', 'E-shape barre at fret 8']);
    expect(c.slice(0, 3).every((v) => v.source === 'library')).toBe(true);
    const f = chordVoicings('F');
    // The full barre is the F chord; the small F every beginner starts with comes right behind it.
    expect(shapes(f).slice(0, 2)).toEqual(['133211', 'xx3211']);
    expect(f.slice(0, 2).map((v) => v.label)).toEqual(['E-shape barre at fret 1', 'Small barre (strings 4–1)']);
    expect(c).toHaveLength(12);
    expect(new Set(shapes(c)).size).toBe(12);
  });

  it('prefers idiomatic jazz grips for jazz chords', () => {
    expect(shapes(chordVoicings('G13')).slice(0, 6)).toContain('3x345x');
    expect(shapes(chordVoicings('E7#9')).slice(0, 3)).toContain('x7678x');
    expect(shapes(chordVoicings('Bm7b5')).slice(0, 4)).toContain('x2323x');
    expect(shapes(chordVoicings('C9')).slice(0, 3)).toContain('x3233x');
    expect(chordVoicings('Cmaj7', { allowOpen: false })[0].category).not.toBe('generated');
  });

  it('never lists the same shape with one more string muted', () => {
    for (const symbol of ['C', 'G7', 'Am7', 'D9']) {
      const list = chordVoicings(symbol).filter((v) => v.source === 'generated');
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          const differ = a.frets.filter((f, i) => f !== b.frets[i]);
          const oneMuted = differ.length === 1 && a.frets.every((f, i) => f === b.frets[i] || f === null);
          const sameBass = Math.min(...a.midi) === Math.min(...b.midi);
          expect(oneMuted && sameBass, `${formatFrets(a.frets)} vs ${formatFrets(b.frets)}`).toBe(false);
        }
      }
    }
  });
});

describe('every chord type', () => {
  it('has playable voicings that sound exactly the chord', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ['C', 'F#', 'Bb']) {
        const symbol = `${root}${type.symbol}`;
        const list = chordVoicings(symbol);
        expect(list.length, symbol).toBeGreaterThan(0);
        for (const v of list) {
          expectPlayable(v, symbol);
          expect(v.root, symbol).toBe(root);
          expect(v.type, symbol).toBe(type.id);
          // Root in the bass unless the caller asks otherwise.
          const lowest = v.notes.reduce((a, b) => (b.midi < a.midi ? b : a));
          expect(lowest.midi % 12, `${symbol} ${formatFrets(v.frets)}`).toBe(pc(root));
          expect(v.inversion, symbol).toBe(0);
        }
      }
    }
  });

  it('is read back as the same chord when nothing is left out', () => {
    let checked = 0;
    for (const type of CHORD_TYPES) {
      if (type.id === '7alt') continue;
      const symbol = `D${type.symbol}`;
      for (const v of chordVoicings(symbol)) {
        if (v.omitted.length) continue;
        const readings = identifyChords(v.midi, { limit: 80 });
        // Same root, same notes: add4 and add11 are one sound with two names, and the theory engine picks one.
        const want = [...chordPcs(symbol)].sort().join();
        const hit = readings.find((m) => pc(m.chord.root) === pc('D') && !m.chord.bass && [...chordPcs(m.chord)].sort().join() === want);
        expect(hit, `${symbol} ${formatFrets(v.frets)} is read as ${readings.map((m) => m.symbol).join(', ')}`).toBeDefined();
        expect(hit!.kind, symbol).toBe('exact');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(250);
  });

  it('keeps one altered ninth or fifth in an alt chord', () => {
    for (const v of chordVoicings('G7alt')) {
      const degrees = v.notes.map((n) => n.degree);
      expect(degrees).toEqual(expect.arrayContaining(['1', '3', 'b7']));
      expect(degrees.some((d) => ['b9', '#9', '#11', 'b13'].includes(d)), formatFrets(v.frets)).toBe(true);
    }
  });

  it('has voicings for every common chord on every root', () => {
    for (const root of ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
      for (const suffix of ['', 'm', '7', 'maj7', 'm7', 'sus4', 'dim', 'm7b5', '9', '6']) {
        const list = chordVoicings(`${root}${suffix}`, { maxResults: 5 });
        expect(list.length, `${root}${suffix}`).toBe(5);
        for (const v of list) expectPlayable(v, `${root}${suffix}`);
      }
    }
  });
});

describe('options', () => {
  it('limits the position', () => {
    const high = chordVoicings('C', { minFret: 7, maxFret: 12, allowOpen: false });
    expect(high.length).toBeGreaterThan(3);
    for (const v of high) expect(v.frets.every((f) => f === null || (f >= 7 && f <= 12))).toBe(true);
    expect(shapes(high)[0]).toBe('8-10-10-9-8-8');
    const low = chordVoicings('C', { maxFret: 3 });
    for (const v of low) expect(v.frets.every((f) => f === null || f <= 3)).toBe(true);
  });

  it('can forbid open strings', () => {
    const closed = chordVoicings('E', { allowOpen: false });
    expect(closed.every((v) => v.movable)).toBe(true);
    expect(chordVoicings('E')[0].movable).toBe(false);
    // Open strings under a high position only on request.
    expect(chordVoicings('E', { minFret: 7 }).every((v) => v.movable)).toBe(true);
    expect(chordVoicings('E', { minFret: 7, allowOpen: 'always' }).some((v) => !v.movable)).toBe(true);
  });

  it('restricts the strings', () => {
    const top = chordVoicings('Am7', { strings: [4, 3, 2, 1] });
    expect(top.length).toBeGreaterThan(3);
    for (const v of top) expect(v.notes.every((n) => n.string <= 4)).toBe(true);
    const all = chordVoicings('Dm7', { strings: [4, 3, 2, 1], allStrings: true });
    for (const v of all) expect(v.notes.map((n) => n.string)).toEqual([4, 3, 2, 1]);
    expect(shapes(all)).toContain('xx0211');
    const triads = generateVoicings('C', { rootInBass: false, strings: [3, 2, 1], allStrings: true });
    expect(shapes(triads)).toEqual(expect.arrayContaining(['xxx010', 'xxx553', 'xxx988']));
    expect(new Set(triads.map((v) => v.chord))).toEqual(new Set(['C', 'C/E', 'C/G']));
  });

  it('returns inversions when the root need not be in the bass', () => {
    const any = chordVoicings('C', { rootInBass: false, maxResults: 40 });
    expect(new Set(any.map((v) => v.inversion))).toEqual(new Set([0, 1, 2]));
    for (const v of any) expectPlayable(v, 'C');
    // A slash chord fixes the bass.
    const slash = chordVoicings('C/E');
    expect(slash.every((v) => v.chord === 'C/E' && v.bass === 'E')).toBe(true);
    expect(shapes(slash)[0]).toBe('032010');
    const foreign = chordVoicings('Am/G');
    expect(shapes(foreign)[0]).toBe('302210');
    for (const v of foreign) {
      const lowest = v.notes.reduce((a, b) => (b.midi < a.midi ? b : a));
      expect(lowest.note).toBe('G');
      expect(v.notes.filter((n) => n.role === 'bass')).toHaveLength(1);
    }
  });

  it('puts a chosen note on top', () => {
    const melody = chordVoicings('Cmaj7', { top: 'B' });
    expect(melody.length).toBeGreaterThan(2);
    for (const v of melody) {
      const highest = v.notes.reduce((a, b) => (b.midi > a.midi ? b : a));
      expect(highest.note).toBe('B');
    }
  });

  it('limits difficulty, size, span and count', () => {
    expect(chordVoicings('F', { maxDifficulty: 5 }).every((v) => v.difficulty <= 5)).toBe(true);
    expect(chordVoicings('F', { maxDifficulty: 5 }).some((v) => v.barres.some((b) => b.fromString === 6))).toBe(false);
    expect(chordVoicings('G', { maxResults: 3 })).toHaveLength(3);
    expect(chordVoicings('G', { maxResults: 30 }).length).toBeGreaterThan(12);
    for (const v of chordVoicings('G7', { minNotes: 4, maxNotes: 4 })) expect(v.notes).toHaveLength(4);
    for (const v of chordVoicings('C', { maxSpan: 3, allowOpen: false })) expect(v.span).toBeLessThanOrEqual(3);
    for (const v of chordVoicings('G7', { innerMutes: 0 })) {
      const idx = v.frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
      expect(idx[idx.length - 1] - idx[0] + 1).toBe(idx.length);
    }
  });

  it('can leave the root to the bass player', () => {
    const rootless = chordVoicings('C9', { rootless: true, library: false });
    expect(rootless.length).toBeGreaterThan(0);
    for (const v of rootless) {
      expect(v.rootless).toBe(true);
      expect(v.notes.map((n) => n.degree)).toEqual(expect.arrayContaining(['3', 'b7', '9']));
      expect(v.omitted).toContain('1');
    }
    // Triads keep their root whatever is asked.
    expect(chordVoicings('C', { rootless: true }).every((v) => !v.rootless)).toBe(true);
  });

  it('can leave the library out', () => {
    expect(generateVoicings('C').every((v) => v.source === 'generated')).toBe(true);
    expect(chordVoicings('C', { library: false }).every((v) => v.source === 'generated')).toBe(true);
    // The generator finds the textbook shape on its own.
    expect(shapes(generateVoicings('C'))).toContain('x32010');
    expect(shapes(generateVoicings('G', { maxResults: 30 }))).toContain('320003');
    expect(shapes(generateVoicings('F', { maxResults: 30 }))).toContain('133211');
    const drop2 = generateVoicings('Cmaj7', { strings: [5, 4, 3, 2], allStrings: true, allowOpen: false }).find((v) => formatFrets(v.frets) === 'x3545x')!;
    expect([drop2.label, drop2.category]).toEqual(['Drop 2', 'drop2']);
    expect(generateVoicings('A5')[0].category).toBe('power');
  });

  it('caches results and hands out fresh arrays', () => {
    const a = chordVoicings('Em7');
    const b = chordVoicings('Em7');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.pop();
    expect(chordVoicings('Em7')).toHaveLength(b.length);
    expect(() => chordVoicings('nonsense')).toThrow(RangeError);
  });

  it('picks a best and an easiest voicing', () => {
    expect(formatFrets(bestVoicing('C')!.frets)).toBe('x32010');
    expect(bestVoicing('C', { minFret: 20, maxFret: 21, strings: [6], allowOpen: false })).toBeNull();
    const easy = easiestVoicing('F')!;
    expect(easy.difficulty).toBeLessThanOrEqual(bestVoicing('F')!.difficulty);
    expect(chordDifficulty('Em')).toBeLessThan(chordDifficulty('C'));
    expect(chordDifficulty('C')).toBeLessThan(chordDifficulty('Bb'));
    expect(chordDifficulty('Bb')).toBeLessThanOrEqual(10);
  });
});

describe('other tunings and instruments', () => {
  it('finds the open chord of an open tuning', () => {
    const g = chordVoicings('G', { tuning: 'open-g' });
    expect(shapes(g)[0]).toBe('x00000');
    expect(g[0].difficulty).toBe(1);
    expect(shapes(chordVoicings('D', { tuning: 'open-d' }))[0]).toBe('000000');
    expect(shapes(chordVoicings('D5', { tuning: 'drop-d' }))[0]).toBe('000xxx');
    // One finger across the strings moves the open chord anywhere.
    expect(shapes(chordVoicings('A', { tuning: 'open-g', allowOpen: false }))).toContain('x22222');
  });

  it('plays the ukulele chords people know', () => {
    expect(shapes(chordVoicings('C', { tuning: 'ukulele' }))[0]).toBe('0003');
    expect(shapes(chordVoicings('Am', { tuning: 'ukulele' }))[0]).toBe('2000');
    expect(shapes(chordVoicings('F', { tuning: 'ukulele' }))[0]).toBe('2010');
    expect(shapes(chordVoicings('G', { tuning: 'ukulele' }))).toContain('0232');
    expect(chordVoicings('Am7', { tuning: 'ukulele' })[0].chord).toBe('Am7');
  });

  it('works in every catalog tuning', () => {
    for (const t of TUNINGS) {
      for (const symbol of ['C', 'Am', 'G7', 'Dm7', 'E5']) {
        const list = chordVoicings(symbol, { tuning: t.id, maxResults: 6 });
        expect(list.length, `${symbol} in ${t.id}`).toBeGreaterThan(0);
        for (const v of list) {
          expectPlayable(v, symbol, { tuning: t.id });
          expect(v.tuning).toBe(t.id);
          expect(v.frets).toHaveLength(t.stringCount);
        }
      }
    }
  });

  it('respects the capo', () => {
    const withCapo = chordVoicings('G', { capo: 3 });
    expect(shapes(withCapo)[0]).toBe('022100'); // an E shape behind a capo on 3
    for (const v of withCapo) expectPlayable(v, 'G', { capo: 3 });
    expect(withCapo[0].notes[0].midi).toBe(43);
  });

  it('stays quick and correct on instruments with many strings', () => {
    const eight = [28, 33, 40, 45, 50, 55, 59, 64];
    const twelve = Array.from({ length: 12 }, (_x, i) => 28 + 5 * i);
    for (const strings of [eight, twelve]) {
      // On twelve strings the search budget cuts the largest chords short; it must still answer, and correctly.
      for (const symbol of strings === eight ? ['C', 'F#m7b5', 'Bb13', 'G7alt'] : ['C', 'Bb13']) {
        const list = chordVoicings(symbol, { tuning: strings, maxResults: 6 });
        expect(list.length, `${symbol} on ${strings.length} strings`).toBeGreaterThan(0);
        for (const v of list) expectPlayable(v, symbol, { tuning: strings });
      }
    }
  });

  it('prunes the search without losing shapes', () => {
    // Every shape of a small exhaustive check is found: all C major triads on three neighbouring strings within five frets.
    const found = new Set(shapes(generateVoicings('C', { rootInBass: false, minNotes: 3, maxNotes: 3, innerMutes: 0, maxResults: 500, maxFret: 12 })));
    const open = [40, 45, 50, 55, 59, 64];
    const isC = (midi: number) => [0, 4, 7].includes(midi % 12);
    let expected = 0;
    for (let low = 0; low <= 3; low++) {
      for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) for (let c = 0; c <= 12; c++) {
        const frets = [a, b, c];
        const midi = frets.map((f, k) => open[low + k] + f);
        if (!midi.every(isC) || new Set(midi.map((m) => m % 12)).size < 3) continue;
        const pressed = frets.filter((f) => f > 0);
        const hasOpen = frets.includes(0);
        if (pressed.length && Math.max(...pressed) - Math.min(...pressed) + 1 > (hasOpen ? 5 : 4)) continue;
        if (hasOpen && pressed.length && Math.min(...pressed) > 5) continue;
        const shape = [null, null, null, null, null, null] as Array<number | null>;
        frets.forEach((f, k) => { shape[low + k] = f; });
        expected++;
        expect(found.has(formatFrets(shape)), formatFrets(shape)).toBe(true);
      }
    }
    expect(expected).toBeGreaterThanOrEqual(12);
    expect(found.size).toBe(expected);
  });

  it('finds every playable G7 in the first four frets that a brute-force search finds', () => {
    const results = generateVoicings('G7', { maxFret: 4, maxResults: 5000 });
    const found = new Set(shapes(results));
    const open = [40, 45, 50, 55, 59, 64];
    const tones = new Set([7, 11, 2, 5]); // G B D F
    const choices = [null, 0, 1, 2, 3, 4];
    let playable = 0;
    const frets: Array<number | null> = [null, null, null, null, null, null];
    const visit = (i: number) => {
      if (i < 6) {
        for (const f of choices) {
          if (f !== null && !tones.has((open[i] + f) % 12)) continue;
          frets[i] = f;
          visit(i + 1);
        }
        return;
      }
      const sounding = frets.map((f, k) => (f === null ? -1 : k)).filter((k) => k >= 0);
      if (sounding.length < 3) return;
      if (sounding[sounding.length - 1] - sounding[0] + 1 - sounding.length > 1) return; // one inner mute at most
      const midi = sounding.map((k) => open[k] + frets[k]!);
      const pcs = new Set(midi.map((m) => m % 12));
      if (!pcs.has(7) || !pcs.has(11) || !pcs.has(5)) return; // root, third, seventh
      if (Math.min(...midi) % 12 !== 7) return; // root in the bass
      const pressed = frets.filter((f): f is number => f !== null && f > 0);
      if (pressed.length && Math.max(...pressed) - Math.min(...pressed) + 1 > (frets.includes(0) ? 5 : 4)) return;
      const fingering = assignFingers(frets);
      if (!fingering || findBarres(frets, fingering.fingers).length > 2) return;
      playable++;
      // Either listed, or listed as a fuller or thinner version of itself: the same frets with
      // strings muted or added, over the same bass note.
      const shape = formatFrets(frets);
      const twin = results.some((v) => {
        const agree = v.frets.every((f, k) => f === frets[k] || f === null || frets[k] === null);
        const nested = v.frets.every((f, k) => f === frets[k] || f === null) || v.frets.every((f, k) => f === frets[k] || frets[k] === null);
        return agree && nested && Math.min(...v.midi) === Math.min(...midi);
      });
      expect(found.has(shape) || twin, shape).toBe(true);
    };
    visit(0);
    expect(playable).toBeGreaterThan(30);
    expect(found.size).toBeLessThanOrEqual(playable);
    expect(found.has('320001')).toBe(true);
  });

  it('copes with more chord tones than strings', () => {
    const uke = chordVoicings('C13', { tuning: 'ukulele' });
    expect(uke.length).toBeGreaterThan(0);
    for (const v of uke) {
      expect(v.notes.length).toBeLessThanOrEqual(4);
      expect(v.notes.map((n) => n.degree)).toEqual(expect.arrayContaining(['3', 'b7', '13']));
    }
    const bass = chordVoicings('Cmaj9', { tuning: 'bass' });
    expect(bass.length).toBeGreaterThan(0);
  });
});
