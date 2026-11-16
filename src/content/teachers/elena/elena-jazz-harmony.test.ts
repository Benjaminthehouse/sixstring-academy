/**
 * Cross-checks for Prof. Varga's unit 5 (`elena-jazz-harmony.ts`) against the engines, the plan and
 * the song library: every shape builds the chord it names with the tones the cards list; shells are
 * root, third and seventh; drop-2 and drop-3 grips really are close chords with the second or third
 * voice dropped; the voice motion, the guide-tone lines and the top voices are what the shapes do;
 * moving up five frets lands in F; the minor ii-V-i is the key's own; the bossa and the shell study
 * in the library play the shapes and rhythms the lessons describe; every BPM, jam and key is real.
 * Run: `npx vitest run src/content/teachers/elena/elena-jazz-harmony.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/teachers.json';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { buildVoicing, midiAt, parseFrets, pitchClassAt, positionsForPitchClass, voicingProblem } from '@/core/guitar';
import { midiToFreq } from '@/core/math/pitch-math';
import { addNoise, computeChroma, matchChord, seededRandom, strum } from '@/core/pitch';
import { parseSixTab, type Song } from '@/core/song';
import { chordPcs, chordTones, chroma, harmonizeScale, parseChord, scaleNotes } from '@/core/theory';
import { parsePlayerParams } from '@/features/player/model/params';
import { chordWaitArgs, type PlayChordExercise, type TabNote } from '@/lessons';
import { isTaskStep, type TaskStep, type TeacherLesson } from '../index';
import unit, { GUIDE_LINES, SHAPES, picked } from './elena-jazz-harmony';

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const tasks = (): Array<{ lesson: string; task: TaskStep }> => unit.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
const textOf = (t: unknown): string => (typeof t === 'string' ? t : (t as { text: string }).text);
const pc = (note: string): string => note.replace(/\d/g, '');

/** The chord a shape builds, its notes low to high and their degrees. */
function voiced(symbol: string, frets: string) {
  const v = buildVoicing(symbol, frets);
  return { v, notes: v.notes.map((n) => pc(n.note)), degrees: v.notes.map((n) => n.degree), midi: v.notes.map((n) => n.midi) };
}

/** Pitch class (as a name) on each string 4 to 1 of a shape, null when muted. */
function topFour(symbol: string, frets: string): Array<string | null> {
  const f = parseFrets(frets);
  const v = buildVoicing(symbol, frets);
  return [4, 3, 2, 1].map((string) => (f[6 - string] === null ? null : pc(v.notes.find((n) => n.string === string)!.note)));
}

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

describe('the shapes of unit 5', () => {
  it('build the chords they name, every note a chord tone', () => {
    const groups = Object.values(SHAPES) as Array<Record<string, string>>;
    for (const group of groups) {
      for (const [key, frets] of Object.entries(group)) {
        const symbol = key.replace('Root6', '');
        expect(voicingProblem(symbol, frets), `${symbol} ${frets}`).toBeNull();
        const v = buildVoicing(symbol, frets);
        const want = parseChord(symbol)!;
        expect([v.root, v.type], `${symbol} ${frets}`).toEqual([want.root, want.type.id]);
      }
    }
  });

  it('are the plan\'s shapes, plus the moved grips in F, the root-on-5 drop-3 Cmaj7, the turnaround\'s Am7 shell and the Am6 of the fallback', () => {
    const units = (plan as { courses: Array<{ id: string; units: Array<{ id: string; lessons: Array<{ explain: string }> }> }> }).courses;
    const planUnit = units.find((c) => c.id === 'elena')!.units.find((u) => u.id === unit.id)!;
    const planShapes = new Set(planUnit.lessons.flatMap((l) => [...l.explain.matchAll(/\b([A-G][#b]?[a-z0-9]*) \(([x0-9-]{6,})\)/g)].map((m) => `${m[1]} ${m[2]}`)));
    const ours = new Set((Object.values(SHAPES) as Array<Record<string, string>>).flatMap((g) => Object.entries(g).map(([k, f]) => `${k.replace('Root6', '')} ${f}`)));
    for (const s of planShapes) expect(ours.has(s), `plan shape ${s}`).toBe(true);
    const extra = [...ours].filter((s) => !planShapes.has(s)).sort();
    expect(extra).toEqual(['Am6 xx2212', 'Am7 5x55xx', 'C7 8x898x', 'C7 xx8988', 'Cmaj7 x3x453', 'Fmaj7 x-8-x-9-10-8', 'Fmaj7 xx7968', 'Gm7 x-10-x-10-11-10', 'Gm7 x-x-8-10-8-10'].sort());
  });

  it('shells are root, third and seventh, and the root alternates between strings 5 and 6', () => {
    const want: Record<string, string[]> = { Dm7: ['1', 'b3', 'b7'], G7: ['1', 'b7', '3'], Cmaj7: ['1', '3', '7'], Am7: ['1', 'b7', 'b3'] };
    for (const [symbol, frets] of Object.entries(SHAPES.shells)) expect(voiced(symbol, frets).degrees, symbol).toEqual(want[symbol]);
    const lowest = (frets: string) => 6 - parseFrets(frets).findIndex((f) => f !== null);
    expect([SHAPES.shells.Dm7, SHAPES.shells.G7, SHAPES.shells.Cmaj7].map(lowest)).toEqual([5, 6, 5]);
    // The fifth may go unless altered: the shell keeps 3 and 7; Bm7b5's b5 is not omittable.
    expect(chordTones('G7').find((t) => t.degree === '5')!.omittable).toBe(true);
    expect(chordTones('Bm7b5').find((t) => t.degree === 'b5')!.omittable).toBe(false);
  });

  it('drop-2 grips are close chords with the second-highest voice dropped an octave', () => {
    for (const [symbol, frets] of [...Object.entries(SHAPES.drop2), ...Object.entries(SHAPES.drop2F)]) {
      const midi = voiced(symbol, frets).midi;
      expect(midi.length).toBe(4);
      const raised = [...midi.slice(1), midi[0] + 12].sort((a, b) => a - b);
      expect(raised[3] - raised[0], `${symbol} close within an octave`).toBeLessThan(12);
      expect(raised.indexOf(midi[0] + 12), `${symbol}: the dropped voice was second from the top`).toBe(2);
    }
    // The card's example: Dm7 close C D F A -> F C D A.
    expect(voiced('Dm7', SHAPES.drop2.Dm7).notes).toEqual(['F', 'C', 'D', 'A']);
    expect(voiced('G7', SHAPES.drop2.G7).notes).toEqual(['F', 'B', 'D', 'G']);
    // None has the root at the bottom (the tip and the true-false).
    for (const [symbol, frets] of Object.entries(SHAPES.drop2)) expect(voiced(symbol, frets).degrees[0], symbol).not.toBe('1');
  });

  it('drop-3 grips are close chords with the third-highest voice dropped, the root in the bass and one string skipped', () => {
    for (const [key, frets] of [...Object.entries(SHAPES.drop3), ...Object.entries(SHAPES.drop3F)]) {
      const symbol = key.replace('Root6', '');
      const { midi, degrees } = voiced(symbol, frets);
      const raised = [...midi.slice(1), midi[0] + 12].sort((a, b) => a - b);
      expect(raised[3] - raised[0], `${symbol} close`).toBeLessThan(12);
      expect(raised.indexOf(midi[0] + 12), `${symbol}: dropped from third from the top`).toBe(1);
      expect(degrees[0], symbol).toBe('1');
      const f = parseFrets(frets);
      const first = f.findIndex((x) => x !== null);
      expect(f[first + 1], `${symbol}: the string above the bass is skipped`).toBeNull();
    }
    // Root on 5 for Dm7 and Cmaj7 x3x453, root on 6 for G7 and Cmaj7 8x998x.
    const rootString = (frets: string) => 6 - parseFrets(frets).findIndex((x) => x !== null);
    expect([SHAPES.drop3.Dm7, SHAPES.drop3.G7, SHAPES.drop3.Cmaj7, SHAPES.drop3.Cmaj7Root6].map(rootString)).toEqual([5, 6, 5, 6]);
    // x3x453 keeps B on string 3 fret 4 after G7 (3x343x); 8x998x sits five frets higher.
    expect(parseFrets(SHAPES.drop3.G7)[3]).toBe(4);
    expect(parseFrets(SHAPES.drop3.Cmaj7)[3]).toBe(4);
    expect(parseFrets(SHAPES.drop3.Cmaj7Root6)[0]! - parseFrets(SHAPES.drop3.G7)[0]!).toBe(5);
    // The skipped string is not a chord tone at the grip's fret (a barre across it would add a wrong note).
    expect(chroma('G')).toBe(pitchClassAt({ string: 4, fret: 5 }));
    expect(parseChord('Dm7')!.notes.map((n) => chroma(n))).not.toContain(chroma('G'));
  });

  it('move up five frets into F', () => {
    const up5 = (frets: string) => parseFrets(frets).map((f) => (f === null ? null : f + 5));
    expect(up5(SHAPES.drop2.Dm7)).toEqual(parseFrets(SHAPES.drop2F.Gm7));
    expect(up5(SHAPES.drop2.G7)).toEqual(parseFrets(SHAPES.drop2F.C7));
    expect(up5(SHAPES.drop2.Cmaj7)).toEqual(parseFrets(SHAPES.drop2F.Fmaj7));
    expect(up5(SHAPES.drop3.Dm7)).toEqual(parseFrets(SHAPES.drop3F.Gm7));
    expect(up5(SHAPES.drop3.G7)).toEqual(parseFrets(SHAPES.drop3F.C7));
    expect(up5(SHAPES.drop3.Cmaj7)).toEqual(parseFrets(SHAPES.drop3F.Fmaj7));
    const span = (group: Record<string, string>) => {
      const all = Object.values(group).flatMap((f) => parseFrets(f).filter((x): x is number => x !== null && x > 0));
      return [Math.min(...all), Math.max(...all)];
    };
    expect(span(SHAPES.drop2F)).toEqual([6, 10]);
    expect(span(SHAPES.drop3F)).toEqual([8, 11]);
    expect(span({ Dm7: SHAPES.drop3.Dm7, G7: SHAPES.drop3.G7, Cmaj7: SHAPES.drop3.Cmaj7 })).toEqual([3, 6]);
  });
});

describe('the voice leading the cards describe', () => {
  it('drop-2: F stays, C to B, D stays, A to G; then F to E, B stays, D to C, G stays', () => {
    const d = topFour('Dm7', SHAPES.drop2.Dm7);
    const g = topFour('G7', SHAPES.drop2.G7);
    const c = topFour('Cmaj7', SHAPES.drop2.Cmaj7);
    expect(d).toEqual(['F', 'C', 'D', 'A']);
    expect(g).toEqual(['F', 'B', 'D', 'G']);
    expect(c).toEqual(['E', 'B', 'C', 'G']);
    // Top voice A, G, G; never more than two frets of motion on a string.
    expect([d[3], g[3], c[3]]).toEqual(['A', 'G', 'G']);
    const f = [SHAPES.drop2.Dm7, SHAPES.drop2.G7, SHAPES.drop2.Cmaj7].map(parseFrets);
    for (let i = 2; i < 6; i++) for (let k = 1; k < 3; k++) expect(Math.abs(f[k][i]! - f[k - 1][i]!)).toBeLessThanOrEqual(2);
  });

  it('guide tones: the thirds and sevenths, and the two lines on strings 3 and 4 of the shells', () => {
    const tone = (symbol: string, role: string) => chordTones(symbol).find((t) => t.role === role)!.note;
    expect(['Dm7', 'G7', 'Cmaj7'].map((c) => [tone(c, 'third'), tone(c, 'seventh')])).toEqual([['F', 'C'], ['B', 'F'], ['E', 'B']]);
    const line = (notes: ReadonlyArray<{ string: number; fret: number }>) => notes.map((n) => pitchClassAt(n));
    expect(line(GUIDE_LINES.sevenths)).toEqual(['C', 'B', 'B'].map((n) => chroma(n)));
    expect(line(GUIDE_LINES.thirds)).toEqual(['F', 'F', 'E'].map((n) => chroma(n)));
    // The lines are the shells' strings 3 and 4.
    const shells = [SHAPES.shells.Dm7, SHAPES.shells.G7, SHAPES.shells.Cmaj7].map(parseFrets);
    expect(shells.map((f) => f[3])).toEqual(GUIDE_LINES.sevenths.map((n) => n.fret));
    expect(shells.map((f) => f[2])).toEqual(GUIDE_LINES.thirds.map((n) => n.fret));
  });

  it('extended voicings keep their guide tones and their top voice moves E, E, D', () => {
    const want: Record<string, string[]> = { Dm9: ['1', 'b3', 'b7', '9'], G13: ['1', 'b7', '3', '13'], Cmaj9: ['1', '3', '7', '9'] };
    const tops: string[] = [];
    for (const [symbol, frets] of Object.entries(SHAPES.extended)) {
      const { degrees, notes } = voiced(symbol, frets);
      expect(degrees, symbol).toEqual(want[symbol]);
      tops.push(notes[notes.length - 1]);
    }
    expect(tops).toEqual(['E', 'E', 'D']);
  });
});

describe('the minor ii-V-i', () => {
  it('is the key\'s own: iiø7 from natural minor, V7 from harmonic minor', () => {
    expect(harmonizeScale('A', 'minor', { sevenths: true })[1].symbol).toBe('Bm7b5');
    expect(harmonizeScale('A', 'harmonic-minor', { sevenths: true })[4].symbol).toBe('E7');
    expect(harmonizeScale('A', 'minor', { sevenths: true })[0].symbol).toBe('Am7');
    expect(scaleNotes('A', 'harmonic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(voiced('Bm7b5', SHAPES.minor.Bm7b5).notes).toEqual(['B', 'F', 'A', 'D']);
    expect(voiced('E7', SHAPES.minor.E7).notes).toEqual(['E', 'B', 'D', 'G#']);
    // Am7 xx2213 has its fifth at the bottom; Am6 xx2212 lowers the top note a fret.
    expect(buildVoicing('Am7', SHAPES.minor.Am7).chord).toBe('Am7/E');
    expect(voiced('Am6', SHAPES.minor.Am6).notes).toEqual(['E', 'A', 'C', 'F#']);
    // G# in fifth position (frets 4 to 8): string 6 fret 4, string 4 fret 6, string 1 fret 4.
    const gs = positionsForPitchClass('G#', { minFret: 4, maxFret: 8 }).map((p) => [p.string, p.fret]).sort();
    expect(gs).toEqual([[1, 4], [4, 6], [6, 4]]);
  });
});

describe('the library music the lessons describe', () => {
  it('the shell study: the three shells, four to the bar in bars 1 to 8, the Charleston in bars 9 to 16', async () => {
    const s = await song('st-jazz-shells');
    const shapes = new Map(s.chords.filter((c) => c.voicing).map((c) => [c.symbol, c.voicing!.map((f) => (f === null ? 'x' : String(f))).join('')]));
    expect(shapes.get('Dm7')).toBe(SHAPES.shells.Dm7);
    expect(shapes.get('G7')).toBe(SHAPES.shells.G7);
    expect(shapes.get('Cmaj7')).toBe(SHAPES.shells.Cmaj7);
    const onsets = (bar: number) => s.tracks[0].measures[bar].beats.filter((b) => b.notes.length > 0).map((b) => b.start / 960);
    for (let bar = 0; bar < 8; bar++) expect(onsets(bar), `bar ${bar + 1}`).toEqual([0, 1, 2, 3]);
    // Swung Charleston: beat 1 and the last third of beat 2.
    for (let bar = 8; bar < 16; bar++) {
      const o = onsets(bar);
      expect(o.length, `bar ${bar + 1}`).toBe(2);
      expect(o[0]).toBe(0);
      expect(o[1]).toBeCloseTo(1 + 2 / 3, 3);
    }
    expect(s.tempo[0].bpm).toBe(120);
  });

  it('the bossa: Am7 5x555x and D7 x5453x, thumb on 1 and 3, fingers on the written two-bar pattern', async () => {
    const s = await song('st-bossa-groove');
    const shapes = new Map(s.chords.filter((c) => c.voicing).map((c) => [c.symbol, c.voicing!.map((f) => (f === null ? 'x' : String(f))).join('')]));
    expect(shapes.get('Am7')).toBe(SHAPES.bossa.Am7);
    expect(shapes.get('D7')).toBe(SHAPES.bossa.D7);
    const part = s.tracks[0];
    const thumb = (bar: number) => part.measures[bar].beats.filter((b) => b.notes.some((n) => n.string === 6)).map((b) => b.start / 960);
    const fingers = (bar: number) => part.measures[bar].beats.filter((b) => b.notes.some((n) => n.string <= 4)).map((b) => b.start / 960);
    expect(thumb(0)).toEqual([0, 2]);
    expect(thumb(1)).toEqual([0, 2]);
    // The card's rhythm 'q. q. q | er q. e q.' starts on 0, 1.5, 3 and 0.5, 2, 2.5.
    expect(fingers(0)).toEqual([0, 1.5, 3]);
    expect(fingers(1)).toEqual([0.5, 2, 2.5]);
    expect(s.tempo[0].bpm).toBe(116);
    // D7's fingers: C stays, G falls to F#, E falls to D (strings 3, 4, 2).
    expect(topFour('Am7', SHAPES.bossa.Am7).slice(0, 3)).toEqual(['G', 'C', 'E']);
    expect(topFour('D7', SHAPES.bossa.D7).slice(0, 3)).toEqual(['F#', 'C', 'D']);
  });

  it('the drop-2 study: the three grips in C for bars 1 to 8, the same shapes five frets up in F for bars 9 to 16', async () => {
    const s = await song('st-jazz-drop2');
    const shapeOf = (symbol: string) => s.chords.find((c) => c.symbol === symbol && c.voicing)?.voicing;
    for (const [symbol, frets] of [...Object.entries(SHAPES.drop2), ...Object.entries(SHAPES.drop2F)]) expect(shapeOf(symbol), symbol).toEqual(parseFrets(frets));
    const inF = new Set(['Gm7', 'C7', 'Fmaj7']);
    for (const c of s.chords) expect(inF.has(c.symbol), `${c.symbol} in bar ${c.bar + 1}`).toBe(c.bar >= 8);
    expect(s.bars.length).toBe(16);
    expect(s.tempo[0].bpm).toBe(120);
  });

  it('the minor study: the three grips (Am7 over the open A), and G# over E7 in the melody of bars 9 to 16', async () => {
    const s = await song('st-jazz-minor-ii-v');
    const shapeOf = (symbol: string) => s.chords.find((c) => c.symbol === symbol && c.voicing)!.voicing!;
    expect(shapeOf('Bm7b5')).toEqual(parseFrets(SHAPES.minor.Bm7b5));
    expect(shapeOf('E7')).toEqual(parseFrets(SHAPES.minor.E7));
    expect(shapeOf('Am7').slice(2)).toEqual(parseFrets(SHAPES.minor.Am7).slice(2));
    expect(shapeOf('Am7')[1]).toBe(0);
    const chordAt = (bar: number) => [...s.chords].filter((c) => c.bar <= bar).sort((a, b) => a.bar - b.bar || a.tick - b.tick).pop()!.symbol;
    const melody = s.tracks.find((t) => t.role === 'lead')!;
    let gSharps = 0;
    for (let bar = 8; bar < 16; bar++) {
      const pcs = melody.measures[bar].beats.flatMap((b) => b.notes.map((n) => n.midi % 12));
      if (chordAt(bar) === 'E7') {
        expect(pcs, `bar ${bar + 1}`).toContain(chroma('G#'));
        expect(pcs, `bar ${bar + 1}`).not.toContain(chroma('G'));
        gSharps++;
      }
    }
    expect(gSharps).toBe(2);
    expect(pitchClassAt({ string: 2, fret: 9 })).toBe(chroma('G#'));
    expect(s.tempo[0].bpm).toBe(116);
  });

  it('the turnaround shells are root, third and seventh of I, vi, ii and V in C', () => {
    expect(harmonizeScale('C', 'major', { sevenths: true }).filter((_c, i) => [0, 5, 1, 4].includes(i)).map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'G7', 'Am7']);
    expect(voiced('Am7', SHAPES.shells.Am7).notes).toEqual(['A', 'G', 'C']);
  });
});

describe('the tasks of unit 5', () => {
  it('name the BPM the Player will play, or carry a fallback for a study not yet in the library', async () => {
    for (const { lesson: l, task } of tasks()) {
      if (task.tool !== 'player') continue;
      const req = parsePlayerParams(task.params ?? []);
      if (!songEntry(req.songId!)) {
        expect(task.fallback, `${l} > ${task.id}`).toBeTruthy();
        continue;
      }
      const s = await song(req.songId!);
      const bpm = s.tempo[0].bpm;
      const body = textOf(task.body);
      const said = [...body.matchAll(/(\d+) % \((\d+) (?:\{t:bpm\|BPM\}|BPM)\)/g)];
      if (req.tempo) expect(said.some((m) => Number(m[1]) === req.tempo), `${task.id}: names its ${req.tempo} %`).toBe(true);
      for (const m of said) expect(Math.abs(Number(m[2]) - bpm * Number(m[1]) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      if (req.loop) expect(req.loop.to, `${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
    }
  });

  it('jam on real tracks, in offered keys, at tempos the track allows', () => {
    const jams = tasks().flatMap(({ task }) => [task, ...(task.fallback ? [task.fallback as TaskStep] : [])]).filter((t) => t.tool === 'progressions');
    expect(jams.length).toBeGreaterThan(8);
    for (const task of jams) {
      const [id, key] = task.params ?? [];
      const p = getProgression(id)!;
      expect(p, id).toBeTruthy();
      expect(keyChoices(p).map((k) => k.toLowerCase()), id).toContain(key);
      const bpm = Number(/(\d+) \{t:bpm\|BPM\}/.exec(textOf(task.body))?.[1]);
      expect(bpm, `${id}: ${textOf(task.body)}`).toBeGreaterThanOrEqual(p.feel.tempo[0]);
      expect(bpm, id).toBeLessThanOrEqual(p.feel.tempo[1]);
    }
  });

  it('quote the charts of the jam tracks', () => {
    const chart = (id: string, key: string) => progressionInKey(id, key).bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(chart('jazz-ii-v-i', 'C')).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(chart('jazz-ii-v-i', 'F')).toEqual(['Gm7', 'C7', 'Fmaj7', 'Fmaj7']);
    expect(chart('jazz-minor-ii-v-i', 'A')).toEqual(['Bm7b5', 'E7b9', 'Am6', 'Am6']);
    expect(chart('latin-bossa-minor-loop', 'A')).toEqual(['Am7', 'Dm7', 'Bm7b5', 'E7b9']);
    expect(chart('jazz-i-vi-ii-v', 'C')).toEqual(['Cmaj7 Am7', 'Dm7 G7']);
    expect(chart('dorian-i-iv', 'A')).toEqual(['Am7', 'D7']);
    // The E7 grip fits under the band's E7b9: every note of it is a tone of E7b9.
    const e7b9 = new Set(parseChord('E7b9')!.notes.map((n) => chroma(n)));
    for (const n of voiced('E7', SHAPES.minor.E7).notes) expect(e7b9.has(chroma(n)), n).toBe(true);
  });

  it('send the ear task to the dominant colours level, which holds 9 and 13', () => {
    const ear = tasks().find((t) => t.task.tool === 'ear')!.task;
    expect(ear.params).toEqual(['chords', '9']);
  });

  it('end the drop-3 lesson by building the moved grips', () => {
    const builds = lesson('drop-3').steps.filter((s) => (s as { type?: string }).type === 'chord-build') as Array<{ chord: string; frets: string }>;
    expect(builds.map((b) => [b.chord, b.frets])).toEqual([['Gm7', SHAPES.drop3F.Gm7], ['C7', SHAPES.drop3F.C7], ['Fmaj7', SHAPES.drop3F.Fmaj7]]);
  });
});

// ── Review of batch 11: what the review fixed ─────────────────────────────────────────────────

type AnyStep = { type?: string; id?: string; chord?: string; frets?: string; notes?: TabNote[]; alternative?: { type?: string; frets?: string; chord?: string }; body?: unknown };
const stepsOf = (id: string) => lesson(id).steps as AnyStep[];
const allSteps = () => unit.lessons.flatMap((l) => (l.steps as AnyStep[]).map((s) => ({ lesson: l.id, s })));

/** A strummed voicing as the microphone hears it (the pitch module's own strum model). */
function strummedChroma(midis: number[], seed: number, style: 'clean' | 'noisy' | 'up') {
  const sr = 44100;
  const rand = seededRandom(seed * 131 + midis[0]);
  let freqs = midis.map((m) => midiToFreq(m) * Math.pow(2, ((rand() - 0.5) * 16) / 1200));
  let levels = midis.map(() => 0.6 + 0.4 * rand());
  if (style === 'up') {
    freqs = freqs.reverse();
    levels = levels.reverse().map((l, i, all) => l * (i >= all.length - 2 ? 0.45 : 1));
  }
  let x = strum({ freqs, levels, sampleRate: sr, duration: 0.5, startTime: 0.05, strumMs: 8 + 10 * rand(), seed, attackNoise: 0.2, inharmonicity: 5e-5, pluckPosition: 0.12 + 0.12 * rand(), ...(style === 'clean' ? {} : { highpassHz: 180, highpassOrder: 2 }) });
  if (style !== 'clean') x = addNoise(x, 25, seed);
  return computeChroma(x.subarray(0, Math.round(0.37 * sr)), sr);
}

describe('the microphone checks of unit 5 can be passed by a right answer', () => {
  it('strums only grips that sound every tone of their symbol; sparser voicings are picked string by string', () => {
    const plays = allSteps().filter(({ s }) => s.type === 'play-chord');
    expect(plays.length).toBeGreaterThanOrEqual(8);
    for (const { lesson: l, s } of plays) {
      const sounded = new Set(buildVoicing(s.chord!, s.frets!).notes.map((n) => n.midi % 12));
      expect([...sounded].sort(), `${l}: ${s.chord} ${s.frets} sounds every tone of the symbol`).toEqual([...chordPcs(s.chord!)].sort());
    }
    // The shells, the ninths, the thirteenth and the bossa D7 leave a tone out, so they are phrases.
    const phrases = allSteps().filter(({ s }) => s.type === 'play-phrase' && s.alternative?.type === 'chord-build');
    expect(phrases.map(({ s }) => s.alternative!.chord)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Dm9', 'G13', 'Cmaj9', 'D7']);
    for (const { lesson: l, s } of phrases) {
      // The phrase is the alternative's very shape, low string to high, and that shape leaves a tone out.
      const shape = parseFrets(s.alternative!.frets!);
      const want = shape.flatMap((f, i) => (f === null ? [] : [{ string: 6 - i, fret: f }]));
      expect(s.notes!.map((n) => ('string' in n ? { string: n.string, fret: n.fret } : null)), `${l}: ${s.alternative!.chord}`).toEqual(want);
      const sounded = new Set(want.map((p) => midiAt(p) % 12));
      expect(chordPcs(s.alternative!.chord!).some((pc) => !sounded.has(pc)), `${l}: ${s.alternative!.chord} is sparse`).toBe(true);
    }
    expect(picked('x-10-x-10-11-10')).toEqual([{ string: 5, fret: 10, duration: 'q' }, { string: 3, fret: 10, duration: 'q' }, { string: 2, fret: 11, duration: 'q' }, { string: 1, fret: 10, duration: 'q' }]);
  });

  it('every strummed grip clears the chord check with room to spare', () => {
    const score = (symbol: string, frets: string) => {
      const midis = buildVoicing(symbol, frets).notes.map((n) => n.midi);
      const { chord, options } = chordWaitArgs({ type: 'play-chord', prompt: 'p', chord: symbol, frets, explain: 'e', alternative: { type: 'true-false', statement: 's', answer: true, explain: 'e' } } as PlayChordExercise);
      let min = 1;
      for (const style of ['clean', 'noisy', 'up'] as const) {
        for (let seed = 1; seed <= 4; seed++) {
          const frame = strummedChroma(midis, seed, style);
          const m = matchChord(frame, chord);
          for (const rival of options.rivals ?? []) expect(matchChord(frame, rival).score, `${symbol} ${frets}: a rival wins`).toBeLessThan(m.score);
          min = Math.min(min, m.score);
        }
      }
      return min;
    };
    for (const { lesson: l, s } of allSteps().filter(({ s }) => s.type === 'play-chord')) expect(score(s.chord!, s.frets!), `${l}: ${s.chord} ${s.frets}`).toBeGreaterThan(0.7);
    // (Under the same model the strummed G13 3x345x never reached the 0.6 pass mark and the Dm7 shell
    // x535xx only now and then, which is why those voicings are picked string by string.)
  });
});

describe('the corrected claims of unit 5', () => {
  it('guide tones: each seventh falls a half step to the next third, and each third stays as the next seventh', () => {
    const tone = (symbol: string, role: string) => chordTones(symbol).find((t) => t.role === role)!.note;
    const chain = ['Dm7', 'G7', 'Cmaj7'];
    for (let i = 0; i + 1 < chain.length; i++) {
      const [a, b] = [chain[i], chain[i + 1]];
      expect((chroma(tone(a, 'seventh')) - chroma(tone(b, 'third')) + 12) % 12, `${a} 7th to ${b} 3rd`).toBe(1);
      expect(chroma(tone(a, 'third')), `${a} 3rd stays as ${b} 7th`).toBe(chroma(tone(b, 'seventh')));
    }
    // The lines are named by number, as on the cards, not as a "sevenths" or "thirds" line (each alternates).
    expect(JSON.stringify(lesson('guide-tones'))).not.toMatch(/sevenths line|thirds line|or stays to become/);
  });

  it('drop-3: B stays at string 3 fret 4 from G7 to Cmaj7, under finger 4 and then finger 3', () => {
    const cards = stepsOf('drop-3').filter((s) => s.type === 'card') as Array<{ figure?: { frets?: string; fingers?: string } }>;
    const fingers = (frets: string) => cards.find((c) => c.figure?.frets === frets)!.figure!.fingers!;
    // Low string first: index 3 is string 3.
    expect(fingers(SHAPES.drop3.G7)[3]).toBe('4');
    // Cmaj7 x3x453 takes the Dm7 grip's fingering (x2x341), two frets lower: finger 3 on string 3.
    expect(fingers(SHAPES.drop3.Dm7)[3]).toBe('3');
    expect(parseFrets(SHAPES.drop3.G7)[3]).toBe(parseFrets(SHAPES.drop3.Cmaj7)[3]);
    expect(JSON.stringify(lesson('drop-3'))).not.toMatch(/under the same finger/);
  });

  it('the jams name the chords the band really plays', () => {
    const quoted = ['jam-drop2-f', 'jam-minor-swing', 'jam-minor-bossa', 'jam-bossa-vamp'];
    for (const { task } of tasks().filter(({ task }) => quoted.includes(task.id))) {
      const [id, key] = task.params!;
      const named = new Set([...textOf(task.body).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]));
      for (const c of new Set(progressionInKey(id, key.toUpperCase()).bars.flat().map((x) => x.symbol))) expect(named.has(c), `${task.id} names ${c}`).toBe(true);
    }
  });

  it('the turnaround card: Am7 is the G7 shell two frets up with its third a fret lower, and the bass alternates strings 5 and 6', () => {
    const g = parseFrets(SHAPES.shells.G7);
    const a = parseFrets(SHAPES.shells.Am7);
    expect(a).toEqual(g.map((f, i) => (f === null ? null : f + 2 - (i === 3 ? 1 : 0))));
    expect(voiced('Am7', SHAPES.shells.Am7).degrees).toEqual(['1', 'b7', 'b3']);
    const lowest = (frets: string) => 6 - parseFrets(frets).findIndex((f) => f !== null);
    expect([SHAPES.shells.Cmaj7, SHAPES.shells.Am7, SHAPES.shells.Dm7, SHAPES.shells.G7].map(lowest)).toEqual([5, 6, 5, 6]);
    // Two chords a bar, as the card and the task say.
    expect(progressionInKey('jazz-i-vi-ii-v', 'C').bars.every((b) => b.length === 2)).toBe(true);
    const card = stepsOf('comping-and-bossa').find((s) => s.type === 'card' && (s as { figure?: { frets?: string } }).figure?.frets === SHAPES.shells.Am7);
    expect(card, 'the turnaround card shows the new Am7 shell').toBeTruthy();
  });
});
