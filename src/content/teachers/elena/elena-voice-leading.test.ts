/**
 * Cross-checks for Prof. Varga's unit 6 (`elena-voice-leading.ts`) against the engines, the plan,
 * Dev's course and the song library: every shape builds the chord it names, with the bass the name
 * says; the voices move the way the cards and exercises say; the Canon route on strings 4 to 2 never
 * moves a voice more than two frets (and no route can loop back, as the file says); the line cliches
 * are the jam tracks' charts; the First Ballad's grips and tune are the library's; the reharmonised
 * phrase keeps its melody on top of every drop-2 grip and fits both harmonisations; every tempo, jam,
 * key and fallback is real. Run: `npx vitest run src/content/teachers/elena/elena-voice-leading.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/teachers.json';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { buildVoicing, midiAt, parseFrets, pitchClassAt, positionsForPitchClass, STANDARD_TUNING, tryBuildVoicing, voicingProblem } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordPcs, chroma, noteToMidi, parseChord, scaleNotes, secondaryDominants, tritoneSubstitute } from '@/core/theory';
import { clampTempo } from '@/features/progressions/model/jam';
import { parsePlayerParams } from '@/features/player/model/params';
import { formatProblems, validateCourse } from '@/lessons';
import { isTaskStep, loadTeacherCourse, type TaskStep, type TeacherLesson } from '../index';
import devCaged from '../dev/dev-caged';
import unit, { BALLAD_TUNE, CANON_ROUTE, PHRASE_MELODY, PHRASE_TAB, SHAPES } from './elena-voice-leading';

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const tasks = (): Array<{ lesson: string; task: TaskStep }> => unit.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
const textOf = (t: unknown): string => (typeof t === 'string' ? t : (t as { text: string }).text);
const pc = (note: string): string => note.replace(/-?\d/g, '');
const stepOf = <T,>(l: string, pred: (s: Record<string, unknown>) => boolean): T => lesson(l).steps.find((s) => pred(s as unknown as Record<string, unknown>)) as unknown as T;

/** Pitch class names on strings 4 to 1 of a shape (null when muted). */
function onStrings(frets: string, strings: number[]): Array<number | null> {
  const f = parseFrets(frets);
  return strings.map((s) => (f[6 - s] === null ? null : pitchClassAt({ string: s, fret: f[6 - s]! })));
}

/** MIDI of a shape, low to high. */
function midiOf(frets: string): number[] {
  return parseFrets(frets).flatMap((f, i) => (f === null ? [] : [midiAt({ string: 6 - i, fret: f })]));
}

/** True when a four-note grip is a close chord with its second-highest voice dropped an octave. */
function isDrop2(frets: string): boolean {
  const m = midiOf(frets);
  if (m.length !== 4) return false;
  const raised = [...m.slice(1), m[0] + 12].sort((a, b) => a - b);
  return raised[3] - raised[0] < 12 && raised.indexOf(m[0] + 12) === 2;
}

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

describe('the shapes of unit 6', () => {
  it('build the chords they name, with the bass the name gives', () => {
    for (const group of Object.values(SHAPES) as Array<Record<string, string>>) {
      for (const [key, frets] of Object.entries(group)) {
        const symbol = key.replace('Home', '');
        expect(voicingProblem(symbol, frets), `${symbol} ${frets}`).toBeNull();
        const want = parseChord(symbol)!;
        const v = buildVoicing(want.bass ? symbol.split('/')[0] : symbol, frets);
        expect([v.root, v.type], `${symbol} ${frets}`).toEqual([want.root, want.type.id]);
        if (want.bass) expect(v.chord, `${symbol} ${frets}`).toBe(symbol);
      }
    }
    for (const [symbol, frets] of CANON_ROUTE) {
      expect(voicingProblem(symbol, frets), `${symbol} ${frets}`).toBeNull();
      const base = symbol.split('/')[0];
      expect(buildVoicing(base, frets).chord, `${symbol} ${frets}`).toBe(symbol);
    }
  });

  it('are the plan\'s shapes, plus the ones the lessons add', () => {
    const units = (plan as { courses: Array<{ id: string; units: Array<{ id: string; lessons: Array<{ explain: string; show: string }> }> }> }).courses;
    const planUnit = units.find((c) => c.id === 'elena')!.units.find((u) => u.id === unit.id)!;
    const norm = (f: string) => parseFrets(f).map((x) => (x === null ? 'x' : String(x))).join('-');
    const ours = new Set((Object.values(SHAPES) as Array<Record<string, string>>).flatMap((g) => Object.values(g).map(norm)));
    const planShapes = planUnit.lessons.flatMap((l) => [...`${l.explain} ${l.show}`.matchAll(/\b[A-G][#b]?[a-zA-Z0-9#/]* \(([x0-9-]{6,})\)/g)].map((m) => m[1]));
    expect(planShapes.length).toBeGreaterThan(10);
    for (const f of planShapes) expect(ours.has(norm(f)), `plan shape ${f}`).toBe(true);
  });
});

describe('voice leading: C, Am, F and G on strings 3 to 1', () => {
  const order = ['C', 'Am/C', 'F/C', 'G/B'] as const;
  const per = order.map((c) => onStrings(SHAPES.close[c], [3, 2, 1]));

  it('keeps common tones and moves each voice to the nearest note', () => {
    const names = (pcs: Array<number | null>) => pcs.map((p) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][p!]);
    expect(per.map(names)).toEqual([['C', 'E', 'G'], ['C', 'E', 'A'], ['C', 'F', 'A'], ['B', 'D', 'G']]);
    // C to Am: C and E are common tones, only the top moves (G to A, a whole step).
    expect(chordPcs('C').filter((p) => chordPcs('Am').includes(p)).sort()).toEqual([chroma('C'), chroma('E')].sort());
    const f = order.map((c) => parseFrets(SHAPES.close[c]));
    const moved = (a: number, b: number) => [3, 4, 5].filter((i) => f[a][i] !== f[b][i]).length;
    expect([moved(0, 1), moved(1, 2), moved(2, 3)]).toEqual([1, 1, 3]);
    // The hand stays between frets 3 and 6.
    const all = f.flat().filter((x): x is number => x !== null);
    expect([Math.min(...all), Math.max(...all)]).toEqual([3, 6]);
    // F/C to G/B: C to B a half step, F to D a minor third, A to G a whole step; top and bottom both fall.
    const mF = midiOf(SHAPES.close['F/C']);
    const mG = midiOf(SHAPES.close['G/B']);
    expect(mG.map((m, i) => m - mF[i])).toEqual([-1, -3, -2]);
  });

  it('has the top voice G, A, A, G, and the order exercise\'s wrong turns leap', () => {
    const tops = order.map((c) => Math.max(...midiOf(SHAPES.close[c])));
    expect(tops).toEqual(['G4', 'A4', 'A4', 'G4'].map((n) => noteToMidi(n)));
    expect(Math.max(...midiOf(SHAPES.leaps.Am))).toBe(noteToMidi('E4'));
    expect(Math.max(...midiOf(SHAPES.leaps.F))).toBe(noteToMidi('C5'));
    // From G4 to E4 and from A4 to C5 are leaps of a third, not steps.
    expect(noteToMidi('G4') - noteToMidi('E4')).toBe(3);
    expect(noteToMidi('C5') - noteToMidi('A4')).toBe(3);
  });

  it('is the jam\'s chart', () => {
    expect(progressionInKey('fifties-i-vi-iv-v', 'C').bars.map((b) => b.map((c) => c.symbol).join(' '))).toEqual(['C', 'Am', 'F', 'G']);
  });
});

describe('triads on every string set', () => {
  it('C on strings 4 to 2: root, fifth and third in the bass', () => {
    expect(['C', 'C/G', 'C/E'].map((c) => buildVoicing('C', SHAPES.set42[c as keyof typeof SHAPES.set42]).notes[0].degree)).toEqual(['1', '5', '3']);
    for (const frets of Object.values(SHAPES.set42)) expect(parseFrets(frets).map((x, i) => (x === null ? null : 6 - i)).filter((s) => s !== null)).toEqual([4, 3, 2]);
  });

  it('the strings 3 to 1 shapes are Dev\'s', () => {
    const triads = devCaged.lessons.find((l) => l.id === 'triads-on-top')!;
    const asFrets = (f: string | Array<number | null>) => (typeof f === 'string' ? parseFrets(f) : f);
    const devShapes = triads.steps.filter((s) => (s as { type?: string }).type === 'play-chord').map((s) => [(s as { chord: string }).chord, asFrets((s as unknown as { frets: string | Array<number | null> }).frets)]);
    for (const [chord, frets] of Object.entries(SHAPES.set31)) expect(devShapes, chord).toContainEqual([chord, parseFrets(frets)]);
  });

  it('the major third moves from the top of the set (strings 4 to 2) to the bottom (strings 3 to 1)', () => {
    const t = STANDARD_TUNING.midi; // low to high: strings 6..1
    const gap = (lo: number, hi: number) => t[6 - hi] - t[6 - lo];
    expect([gap(4, 3), gap(3, 2)]).toEqual([5, 4]);
    expect([gap(3, 2), gap(2, 1)]).toEqual([4, 5]);
  });

  it('Am on strings 4 to 2 up to fret 10: nine notes, the three shapes the explanation names', () => {
    const am = new Set(chordPcs('Am'));
    const found = [4, 3, 2].flatMap((s) => Array.from({ length: 11 }, (_x, f) => ({ string: s, fret: f })).filter((p) => am.has(pitchClassAt(p))));
    expect(found.length).toBe(9);
    expect(buildVoicing('Am', 'xx221x').chord).toBe('Am/E');
    expect(buildVoicing('Am', 'xx755x').chord).toBe('Am');
    expect(buildVoicing('Am', 'x-x-10-9-10-x').chord).toBe('Am/C');
    const shapes = [[2, 2, 1], [7, 5, 5], [10, 9, 10]].flatMap(([a, b, c]) => [{ string: 4, fret: a }, { string: 3, fret: b }, { string: 2, fret: c }]);
    expect(shapes.map((p) => `${p.string}:${p.fret}`).sort()).toEqual(found.map((p) => `${p.string}:${p.fret}`).sort());
  });

  it('the Canon route plays the jam\'s chart, never moves a voice more than two frets, and climbs', () => {
    const chart = progressionInKey('classical-canon', 'D').bars.flat().map((c) => c.symbol);
    expect(chart).toEqual(['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']);
    expect(CANON_ROUTE.map(([c]) => c.split('/')[0])).toEqual([...chart, 'D']);
    const f = CANON_ROUTE.map(([, frets]) => parseFrets(frets));
    for (let k = 1; k < f.length; k++) for (const i of [2, 3, 4]) expect(Math.abs(f[k][i]! - f[k - 1][i]!), `${CANON_ROUTE[k][0]} string ${6 - i}`).toBeLessThanOrEqual(2);
    for (const g of f) expect(g.filter((x) => x !== null).length).toBe(3);
    // The repeat needs one jump: A/C# (11-9-10) back to D/A (7-7-7).
    const last = f[f.length - 2];
    expect(Math.max(...[2, 3, 4].map((i) => Math.abs(last[i]! - f[0][i]!)))).toBeGreaterThan(2);
  });

  it('no route of the Canon on strings 4 to 2 comes back to where it began in steps of two frets', () => {
    const strings = [4, 3, 2];
    const grips = (symbol: string): number[][] => {
      const pcs = new Set(chordPcs(symbol));
      const out: number[][] = [];
      for (let a = 0; a <= 15; a++) for (let b = 0; b <= 15; b++) for (let c = 0; c <= 15; c++) {
        const fr = [a, b, c];
        const m = fr.map((x, i) => midiAt({ string: strings[i], fret: x }));
        if (new Set(m.map((x) => x % 12)).size !== 3 || !m.every((x) => pcs.has(x % 12))) continue;
        if (!(m[0] < m[1] && m[1] < m[2]) || m[2] - m[0] >= 12) continue;
        const pressed = fr.filter((x) => x > 0);
        if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 3) continue;
        out.push(fr);
      }
      return out;
    };
    const chart = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'];
    const options = chart.map(grips);
    const close = (x: number[], y: number[]) => x.every((v, i) => Math.abs(v - y[i]) <= 2);
    let loops = 0;
    const walk = (i: number, start: number[], prev: number[]) => {
      if (i === chart.length) {
        if (close(prev, start)) loops++;
        return;
      }
      for (const g of options[i]) if (close(g, prev)) walk(i + 1, start, g);
    };
    for (const start of options[0]) walk(1, start, start);
    expect(loops).toBe(0);
  });

  it('the choice: from A at 7-6-5 only the root-position Bm stays within two frets', () => {
    const from = parseFrets('x-x-7-6-5-x');
    const far = (frets: string) => Math.max(...[2, 3, 4].map((i) => Math.abs(parseFrets(frets)[i]! - from[i]!)));
    expect(far('x-x-9-7-7-x')).toBe(2);
    expect(far('x-x-4-4-3-x')).toBe(3);
    expect(far('x-x-12-11-12-x')).toBe(7);
    expect(buildVoicing('Bm', 'x-x-4-4-3-x').chord).toBe('Bm/F#');
    expect(buildVoicing('Bm', 'x-x-12-11-12-x').chord).toBe('Bm/D');
    expect(buildVoicing('Bm', 'x-x-9-7-7-x').chord).toBe('Bm');
  });

  it('the card\'s tab is the first four chords of the route, picked low to high', () => {
    const card = stepOf<{ figure: { notes: Array<{ string: number; fret: number }> } }>('triads-across-string-sets', (s) => s.title === 'One set, two frets');
    const want = CANON_ROUTE.slice(0, 4).flatMap(([, frets]) => [4, 3, 2].map((s) => ({ string: s, fret: parseFrets(frets)[6 - s]! })));
    expect(card.figure.notes.map((n) => ({ string: n.string, fret: n.fret }))).toEqual(want);
  });
});

describe('line cliches', () => {
  it('the minor line: A, G#, G down string 3, then F# on string 1, and the jam\'s chart', () => {
    const s3 = (['Am', 'AmMaj7', 'Am7', 'Am6'] as const).map((c) => onStrings(SHAPES.cliche[c], [3])[0]);
    expect(s3).toEqual(['A', 'G#', 'G', 'A'].map((n) => chroma(n)));
    expect(onStrings(SHAPES.cliche.Am6, [1])[0]).toBe(chroma('F#'));
    expect(onStrings(SHAPES.cliche.Am7, [1])[0]).toBe(chroma('E'));
    expect(progressionInKey('line-minor-down', 'A').bars.flat().map((c) => c.symbol)).toEqual(['Am', 'AmMaj7', 'Am7', 'Am6']);
  });

  it('the major line: string 3 open to fret 3 under the C shape is G, G#, A, Bb, the fifth, sharp fifth, sixth and flat seventh', () => {
    const line = [0, 1, 2, 3].map((fret) => pitchClassAt({ string: 3, fret }));
    expect(line).toEqual(['G', 'G#', 'A', 'Bb'].map((n) => chroma(n)));
    const degrees = ['C', 'Caug', 'C6', 'C7'].map((sym, i) => parseChord(sym)!.notes.map((n) => chroma(n)).includes(line[i]));
    expect(degrees).toEqual([true, true, true, true]);
    expect(progressionInKey('line-major-up', 'C').bars.flat().map((c) => c.symbol)).toEqual(['C', 'Caug', 'C6', 'C7']);
    // The engine (rightly) calls C E A over C without its fifth something else, so the lesson walks a voice instead of naming x32210 a C6 grip.
    expect(tryBuildVoicing('C6', 'x32210')).toBeNull();
    expect(buildVoicing('Caug', 'x32110').chord).toBe('Caug');
    expect(buildVoicing('C7', 'x32310').chord).toBe('C7');
    // The same climb an octave up, string 1 from fret 3.
    expect([3, 4, 5, 6].map((fret) => midiAt({ string: 1, fret }))).toEqual([0, 1, 2, 3].map((fret) => midiAt({ string: 3, fret }) + 12));
  });
});

describe('chord melody: the First Ballad', () => {
  it('uses the four grips, with the top notes the lesson names', async () => {
    const s = await song('st-chord-melody-1');
    const shapes = new Set(s.chords.filter((c) => c.voicing).map((c) => `${c.symbol}=${c.voicing!.map((f) => (f === null ? 'x' : String(f))).join('')}`));
    for (const [symbol, frets] of Object.entries(SHAPES.ballad)) expect(shapes.has(`${symbol}=${frets}`), `${symbol} ${frets}`).toBe(true);
    const tops = Object.values(SHAPES.ballad).map((f) => pc(buildVoicing(Object.keys(SHAPES.ballad)[Object.values(SHAPES.ballad).indexOf(f)], f).notes.at(-1)!.note));
    expect(tops).toEqual(['G', 'A', 'F', 'D']);
    expect(s.tempo[0].bpm).toBe(66);
  });

  it('the card\'s tune is the top line of bars 1 and 2', async () => {
    const s = await song('st-chord-melody-1');
    const lead = s.tracks.find((t) => t.role === 'lead') ?? s.tracks[0];
    const tops = lead.measures.slice(0, 2).flatMap((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => ({ midi: Math.max(...b.notes.map((n) => n.midi)), ticks: b.duration })));
    const tuneMidi = BALLAD_TUNE.map((n) => midiAt(n));
    expect(tops.map((t) => t.midi)).toEqual(tuneMidi);
    const len: Record<string, number> = { q: 960, e: 480, h: 1920 };
    expect(tops.map((t) => t.ticks)).toEqual(BALLAD_TUNE.map((n) => len[n.duration]));
  });

  it('the chord-build is the study\'s fifth-position Am with A on top', () => {
    const build = stepOf<{ chord: string; frets: string }>('chord-melody-1', (s) => s.type === 'chord-build');
    expect([build.chord, build.frets]).toEqual(['Am', SHAPES.ballad.Am]);
    expect(midiOf(SHAPES.ballad.Am).at(-1)).toBe(midiAt({ string: 1, fret: 5 }));
    expect(pitchClassAt({ string: 1, fret: 5 })).toBe(chroma('A'));
  });
});

describe('reharmonisation: the phrase in F', () => {
  const bars = (() => {
    const out: string[][] = [];
    let beat = 0;
    const len: Record<string, number> = { h: 2, w: 4 };
    for (const n of PHRASE_MELODY) {
      const bar = Math.floor(beat / 4);
      (out[bar] ??= []).push(n.note);
      beat += len[n.duration];
    }
    expect(beat).toBe(32);
    return out;
  })();
  const plain = ['Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gm7', 'Gm7', 'C7', 'C7'];
  const reharm = ['Fmaj7', 'Fmaj7', 'D7', 'D7', 'Gm7', 'Gm7', 'Gb7', 'Gb7'];

  it('is eight bars, two to each chord, and its tab is the same melody', () => {
    expect(bars.length).toBe(8);
    expect(PHRASE_TAB.map((n) => midiAt(n))).toEqual(PHRASE_MELODY.map((n) => noteToMidi(n.note)));
    expect(PHRASE_TAB.map((n) => n.duration)).toEqual(PHRASE_MELODY.map((n) => n.duration));
  });

  it('bars 3 and 4 fit D7 (no F against its F#); bars 7 and 8 fit both C7 and Gb7', () => {
    const d7 = new Set(chordPcs('D7'));
    for (const n of [...bars[2], ...bars[3]]) expect(d7.has(chroma(pc(n))), n).toBe(true);
    expect(new Set([...bars[2], ...bars[3]].map(pc))).toEqual(new Set(['C', 'A', 'D']));
    expect(d7.has(chroma('F'))).toBe(false);
    const both = chordPcs('C7').filter((p) => chordPcs('Gb7').includes(p));
    expect(both.sort()).toEqual([chroma('E'), chroma('Bb')].sort());
    for (const n of [...bars[6], ...bars[7]]) expect(both.includes(chroma(pc(n))), n).toBe(true);
    // Where each chord arrives (bars 1, 3, 5, 7) the melody note is a chord tone of both versions,
    // and the whole melody stays in F major: the reharmonisation changes only the chords.
    for (const b of [0, 2, 4, 6]) {
      expect(chordPcs(plain[b]).includes(chroma(pc(bars[b][0]))), `bar ${b + 1} plain`).toBe(true);
      expect(chordPcs(reharm[b]).includes(chroma(pc(bars[b][0]))), `bar ${b + 1} reharmonised`).toBe(true);
    }
    const fMajor = new Set(scaleNotes('F', 'major').map((n) => chroma(n)));
    for (const n of PHRASE_MELODY) expect(fMajor.has(chroma(pc(n.note))), n.note).toBe(true);
  });

  it('the drop-2 grips carry the melody on top, and move no voice more than two frets', () => {
    const tops = (frets: string) => Math.max(...midiOf(frets));
    const ph = SHAPES.phrase;
    expect([ph.Fmaj7, ph.D7, ph.Gm7, ph.Gb7].map(tops)).toEqual([bars[0][0], bars[2][0], bars[4][0], bars[6][0]].map((n) => noteToMidi(n)));
    expect([ph.Fmaj7, ph.Dm7, ph.Gm7, ph.C7].map(tops)).toEqual([bars[0][0], bars[2][0], bars[4][0], bars[6][0]].map((n) => noteToMidi(n)));
    expect(tops(ph.Fmaj7Home)).toBe(noteToMidi('A4'));
    for (const frets of Object.values(ph)) expect(isDrop2(frets), frets).toBe(true);
    for (const frets of Object.values(SHAPES.subJam)) expect(isDrop2(frets), frets).toBe(true);
    const path = [ph.Fmaj7, ph.D7, ph.Gm7, ph.Gb7, ph.Fmaj7Home].map(parseFrets);
    for (let k = 1; k < path.length; k++) for (const i of [2, 3, 4, 5]) expect(Math.abs(path[k][i]! - path[k - 1][i]!)).toBeLessThanOrEqual(2);
    // Gm7 to Gb7 to Fmaj7: three voices down a fret, one held, twice.
    const d = (a: string, b: string) => parseFrets(b).slice(2).map((x, i) => x! - parseFrets(a).slice(2)[i]!);
    expect(d(ph.Gm7, ph.Gb7)).toEqual([-1, -1, -1, 0]);
    expect(d(ph.Gb7, ph.Fmaj7Home)).toEqual([-1, -1, 0, -1]);
    // Each substitution changes at most two strings, by one fret: D7 for Dm7, Gb7 for C7.
    expect(d(ph.Dm7, ph.D7)).toEqual([0, 0, 1, 0]);
    expect(d(ph.C7, ph.Gb7)).toEqual([-1, 1, 0, 0]);
    // The jam grips: no voice moves more than a fret; C7 to Gb7 keeps Bb and E.
    const jam = [SHAPES.subJam.Gm7, SHAPES.subJam.Gb7, SHAPES.subJam.Fmaj7].map(parseFrets);
    for (let k = 1; k < jam.length; k++) for (const i of [2, 3, 4, 5]) expect(Math.abs(jam[k][i]! - jam[k - 1][i]!)).toBeLessThanOrEqual(1);
    expect(onStrings(SHAPES.subJam.C7, [4, 3])).toEqual(onStrings(SHAPES.subJam.Gb7, [4, 3]));
    expect(d(SHAPES.subJam.C7, SHAPES.subJam.Gb7)).toEqual([0, 0, -1, 1]);
  });

  it('the theory: D7 is V of ii in F, and the tritone substitutes the lesson pairs', () => {
    expect(secondaryDominants('F').find((s) => s.symbol === 'D7')?.targetChord).toBe('Gm');
    expect([tritoneSubstitute('C7'), tritoneSubstitute('G7'), tritoneSubstitute('D7'), tritoneSubstitute('A7')]).toEqual(['Gb7', 'Db7', 'Ab7', 'Eb7']);
    expect(parseChord('Gb7')!.notes).toEqual(['Gb', 'Bb', 'Db', 'Fb']);
    expect(parseChord('Db7')!.notes).toEqual(['Db', 'F', 'Ab', 'Cb']);
    expect(progressionInKey('jazz-tritone-sub', 'F').bars.flat().map((c) => c.symbol)).toEqual(['Gm7', 'Gb7', 'Fmaj7', 'Fmaj7']);
  });

  it('the chord-melody-2 alternative names the melody on beat 1 of bars 1, 3, 5 and 7', () => {
    const phrase = stepOf<{ alternative: { tiles: string[] } }>('chord-melody-2', (s) => s.type === 'play-phrase');
    const want = [bars[0][0], bars[2][0], bars[4][0], bars[6][0]].map((n) => `{n:${pc(n)}}`);
    expect(phrase.alternative.tiles).toEqual(want);
  });
});

describe('the tasks of unit 6', () => {
  it('name the BPM the Player will play, or carry a fallback for a piece not yet in the library', async () => {
    for (const { lesson: l, task } of tasks()) {
      for (const target of [task, ...(task.fallback ? [task.fallback] : [])] as TaskStep[]) {
        if (target.tool !== 'player') continue;
        const req = parsePlayerParams(target.params ?? []);
        if (!songEntry(req.songId!)) {
          expect(target === task && task.fallback, `${l} > ${task.id}: ${req.songId} needs a fallback`).toBeTruthy();
          continue;
        }
        const s = await song(req.songId!);
        const bpm = s.tempo[0].bpm;
        const body = textOf(target.body);
        const said = [...body.matchAll(/(\d+) % \((\d+) (?:\{t:bpm\|BPM\}|BPM)\)/g)];
        if (req.tempo) expect(said.some((m) => Number(m[1]) === req.tempo), `${task.id}: names its ${req.tempo} %`).toBe(true);
        for (const m of said) expect(Math.abs(Number(m[2]) - (bpm * Number(m[1])) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
        if (req.loop) expect(req.loop.to, `${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
      }
    }
  });

  it('send the missing pieces to library pieces of the same kind', () => {
    const fallbacks = Object.fromEntries(tasks().filter(({ task }) => task.fallback).map(({ task }) => [task.id, task.fallback!]));
    expect(Object.keys(fallbacks).sort()).toEqual(['ballad-sections', 'ballad-whole', 'danny-boy'].sort());
    expect(songEntry('greensleeves-fingerstyle')).toBeTruthy();
    expect(fallbacks['danny-boy'].params?.[0]).toBe('greensleeves-fingerstyle');
    expect(fallbacks['ballad-sections'].params?.[0]).toBe('st-chord-melody-1');
  });

  it('jam on real tracks, in offered keys, at tempos the jam screen plays', () => {
    const jams = tasks().flatMap(({ task }) => [task, ...(task.fallback ? [task.fallback as TaskStep] : [])]).filter((t) => t.tool === 'progressions');
    expect(jams.length).toBeGreaterThanOrEqual(6);
    for (const task of jams) {
      const [id, key] = task.params ?? [];
      const p = getProgression(id)!;
      expect(p, id).toBeTruthy();
      expect(keyChoices(p).map((k) => k.toLowerCase()), id).toContain(key);
      const bpm = Number(/(\d+) (?:\{t:bpm\|BPM\}|BPM)/.exec(textOf(task.body))?.[1]);
      expect(bpm, `${id}: ${textOf(task.body)}`).toBeGreaterThan(0);
      expect(clampTempo(p.feel.backing, bpm), `${id} at ${bpm}`).toBe(bpm);
    }
  });

  it('play the plan\'s tempos: 66 for the voice-leading jams, 100 for the tritone substitution, 60 for the First Ballad', () => {
    const bpmOf = (id: string) => Number(/(\d+) (?:\{t:bpm\|BPM\}|BPM)/.exec(textOf(tasks().find((t) => t.task.id === id)!.task.body))?.[1]);
    expect(['jam-four-voicings', 'jam-canon-4-2', 'jam-line-minor', 'jam-line-major'].map(bpmOf)).toEqual([66, 66, 66, 66]);
    expect(bpmOf('jam-tritone-sub')).toBe(100);
    expect(bpmOf('ballad-60')).toBe(60);
  });

  it('positions the lessons quote are the notes they name', () => {
    expect(positionsForPitchClass('A', { minFret: 5, maxFret: 5 }).some((p) => p.string === 1)).toBe(true);
    expect(pitchClassAt({ string: 3, fret: 9 })).toBe(chroma('E'));
    expect(pitchClassAt({ string: 4, fret: 10 })).toBe(chroma('C'));
  });
});

describe('unit elena-voice-leading in the course', () => {
  it('passes the lesson engine with no error and no warning, inside the whole of Elena\'s course', async () => {
    const tc = await loadTeacherCourse('elena');
    expect(tc.units.map((u) => u.id)).toContain('elena-voice-leading');
    const problems = validateCourse(tc.course).filter((p) => p.unit === 'elena-voice-leading');
    expect(problems, formatProblems(problems)).toEqual([]);
  });
});
