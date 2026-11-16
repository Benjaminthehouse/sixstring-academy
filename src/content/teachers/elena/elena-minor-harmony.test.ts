/**
 * Cross-checks for Prof. Varga's unit 8 (`elena-minor-harmony.ts`) against the engines and the song
 * library: the harmony of harmonic and melodic minor is the engine's; Phrygian dominant is the fifth
 * mode of A harmonic minor; the clapped solea accents and the library's study fall on 3, 6, 8, 10
 * and 12; every shape builds its chord; the Rondo's turn, the Mountain King's chromatic bar and tempo
 * ramp, the p i m a m i study's bars and the fallbacks' notes are the library's; the Habanera's
 * descent, the Neapolitan and the German sixth move as the cards say; the pedal is an A under three
 * chords; every tempo, jam, key, scale shape and fallback is real. Run:
 * `npx vitest run src/content/teachers/elena/elena-minor-harmony.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { buildVoicing, midiAt, pitchClassAt, scalePatterns, voicingProblem } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordPcs, chroma, harmonizeScale, intervalBetween, noteToMidi, parseChord, scaleNotes, scalePcs } from '@/core/theory';
import { clampTempo } from '@/features/progressions/model/jam';
import { parsePlayerParams } from '@/features/player/model/params';
import { vampFor } from '@/features/scales/model/backing';
import { formatProblems, validateCourse } from '@/lessons';
import { isTaskStep, loadTeacherCourse, type TaskStep, type TeacherLesson } from '../index';
import unit, { HABANERA_DESCENT, MOUNTAIN_KING_BAR_2, PEDAL, PIMAMI_DM_BAR, SHAPES, SOLEA_ACCENTS, type Played } from './elena-minor-harmony';

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const tasks = (): Array<{ lesson: string; task: TaskStep }> => unit.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
const textOf = (t: unknown): string => (typeof t === 'string' ? t : (t as { text: string }).text);
const pcs = (notes: readonly Played[]) => notes.map((n) => pitchClassAt(n));
const names = (...ns: string[]) => ns.map((n) => chroma(n));
const sevenths = (scale: string) => harmonizeScale('A', scale, { sevenths: true });

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

/** The sounding notes of a track, bar by bar: the pitch classes struck in each bar. */
function barPcs(s: Song, track: number, bar: number): number[] {
  return s.tracks[track].measures[bar].beats.flatMap((b) => b.notes.map((n) => n.midi % 12));
}

describe('the shapes of unit 8', () => {
  it('build the chords they name', () => {
    for (const group of Object.values(SHAPES) as Array<Record<string, string>>) {
      for (const [symbol, frets] of Object.entries(group)) {
        expect(voicingProblem(symbol, frets), `${symbol} ${frets}`).toBeNull();
        const want = parseChord(symbol)!;
        const v = buildVoicing(want.bass ? symbol.split('/')[0] : symbol, frets);
        expect([v.root, v.type], symbol).toEqual([want.root, want.type.id]);
        if (want.bass) expect(v.chord).toBe(symbol);
      }
    }
  });
});

describe('the harmony of harmonic minor', () => {
  it('raises G to G#: V becomes E7, vii becomes G#dim7, III becomes augmented', () => {
    expect(scaleNotes('A', 'harmonic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(sevenths('harmonic-minor').map((c) => c.symbol)).toEqual(['AmMaj7', 'Bm7b5', 'Cmaj7#5', 'Dm7', 'E7', 'Fmaj7', 'G#dim7']);
    expect(harmonizeScale('A', 'harmonic-minor').map((c) => c.symbol)).toEqual(['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim']);
    // The fill-blanks bank is natural minor's chords on those degrees.
    expect([2, 4, 6].map((i) => sevenths('minor')[i].symbol)).toEqual(['Cmaj7', 'Em7', 'G7']);
    // Every chord of natural minor that holds G is one that changes (the explanation's list).
    const withG = sevenths('minor').filter((c) => chordPcs(c.symbol).includes(chroma('G'))).map((c) => c.symbol);
    expect(withG).toEqual(['Am7', 'Cmaj7', 'Em7', 'G7']);
    const changed = sevenths('minor').map((c, i) => [c.symbol, sevenths('harmonic-minor')[i].symbol]).filter(([a, b]) => a !== b).map(([a]) => a);
    expect(changed).toEqual(withG);
    expect(parseChord('G#dim7')!.notes).toEqual(['G#', 'B', 'D', 'F']);
  });

  it('the numerals of the match-pairs are the engine\'s, and F to G# is three half steps', () => {
    const byRoman = Object.fromEntries(sevenths('harmonic-minor').map((c) => [c.roman, c.symbol]));
    expect([byRoman['V7'], byRoman['vii°7'], byRoman['iiø7'], byRoman['iv7']]).toEqual(['E7', 'G#dim7', 'Bm7b5', 'Dm7']);
    expect(intervalBetween('F', 'G#')).toBe('A2');
  });

  it('G# in fifth position is where the exercise says', () => {
    const found: string[] = [];
    for (let string = 6; string >= 1; string--) for (let fret = 4; fret <= 8; fret++) if (pitchClassAt({ string, fret }) === chroma('G#')) found.push(`${string}:${fret}`);
    expect(found).toEqual(['6:4', '4:6', '1:4']);
  });

  it('the Rondo opens with the turn B A G# A, and the minor cadence jam is Am Dm E7 Am', async () => {
    const s = await song('rondo-alla-turca');
    const first = s.tracks[0].measures[0].beats.filter((b) => b.notes.length).map((b) => b.notes[0].midi % 12);
    expect(first).toEqual(names('B', 'A', 'G#', 'A'));
    expect(s.tempo[0].bpm).toBe(108);
    expect(progressionInKey('classical-minor-cadence', 'A').bars.flat().map((c) => c.symbol)).toEqual(['Am', 'Dm', 'E7', 'Am']);
  });

  it('the Hungarian Dance fallback is a D minor duet whose upper voice holds C#, the raised seventh', async () => {
    const s = await song('st-duet-baroque');
    expect(songEntry('st-duet-baroque')!.key).toBe('D minor');
    const upper = s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi % 12)));
    expect(upper).toContain(chroma('C#'));
    expect(scaleNotes('D', 'harmonic-minor')).toContain('C#');
    expect(s.tracks.length).toBe(2);
  });
});

describe('Phrygian dominant and the solea', () => {
  it('E Phrygian dominant is A harmonic minor from its fifth note, unlike E Phrygian and E harmonic minor', () => {
    const hm = scaleNotes('A', 'harmonic-minor');
    expect(scaleNotes('E', 'phrygian-dominant')).toEqual([...hm.slice(4), ...hm.slice(0, 4)]);
    expect(scaleNotes('E', 'phrygian-dominant')).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D']);
    expect(scaleNotes('E', 'phrygian')).toContain('G');
    expect(scaleNotes('E', 'harmonic-minor')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D#']);
    expect(intervalBetween('E', 'F')).toBe('m2');
    expect(intervalBetween('E', 'G#')).toBe('M3');
  });

  it('the clapped accents fall on 3, 6, 8, 10 and 12: groups of 3, 3, 2, 2, 2', () => {
    const beats: Record<string, number> = { q: 1, h: 2 };
    let t = 0;
    const taps: number[] = [];
    for (const tok of SOLEA_ACCENTS.split(/\s+/).filter((x) => x !== '|')) {
      const rest = tok.endsWith('r');
      const len = beats[tok.replace('r', '')];
      if (!rest) taps.push(t + 1);
      t += len;
    }
    expect(t).toBe(12);
    expect(taps).toEqual([3, 6, 8, 10, 12]);
    expect(taps.map((x, i) => x - (i ? taps[i - 1] : 0))).toEqual([3, 3, 2, 2, 2]);
  });

  it('the library\'s study accents the same counts, on E and F, with F on 7 to 9', async () => {
    const s = await song('st-solea-compas');
    expect(s.tempo[0].bpm).toBe(108);
    for (let cycle = 0; cycle < 4; cycle++) {
      const accents: number[] = [];
      for (let b = 0; b < 4; b++) {
        for (const beat of s.tracks[0].measures[cycle * 4 + b].beats) if (beat.notes.some((n) => n.accent)) accents.push(b * 3 + Math.floor(beat.start / 960) + 1);
      }
      expect(accents, `cycle ${cycle + 1}`).toEqual([3, 6, 8, 10, 12]);
    }
    const chordAt = (bar: number) => [...s.chords].filter((c) => c.bar <= bar).sort((a, b) => a.bar - b.bar || a.tick - b.tick).pop()!.symbol;
    expect([0, 1, 2, 3].map(chordAt)).toEqual(['E', 'E', 'F', 'E']);
    const shapes = new Map(s.chords.filter((c) => c.voicing).map((c) => [c.symbol, c.voicing!.map((f) => (f === null ? 'x' : String(f))).join('')]));
    expect(shapes.get('E')).toBe(SHAPES.solea.E);
    expect(shapes.get('F')).toBe(SHAPES.solea.F);
  });

  it('the Fs from the open strings to fret 4, the rasgueado exercise and the vamp', () => {
    const found: string[] = [];
    for (let string = 6; string >= 1; string--) for (let fret = 0; fret <= 4; fret++) if (pitchClassAt({ string, fret }) === chroma('F')) found.push(`${string}:${fret}`);
    expect(found).toEqual(['6:1', '4:3', '1:1']);
    expect(getExercise('tech-rasgueado')).toBeTruthy();
    expect(progressionInKey('flamenco-phrygian-vamp', 'E').bars.flat().map((c) => c.symbol)).toEqual(['E', 'F', 'F', 'E']);
    expect(parseChord('F')!.notes).not.toContain('G#');
  });
});

describe('the harmony of melodic minor', () => {
  it('A B C D E F# G#, and its sevenths', () => {
    expect(scaleNotes('A', 'melodic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G#']);
    expect(sevenths('melodic-minor').map((c) => c.symbol)).toEqual(['AmMaj7', 'Bm7', 'Cmaj7#5', 'D7', 'E7', 'F#m7b5', 'G#m7b5']);
    const byRoman = Object.fromEntries(sevenths('melodic-minor').map((c) => [c.roman, c.symbol]));
    expect([byRoman['imaj7'], byRoman['ii7'], byRoman['IV7'], byRoman['V7']]).toEqual(['AmMaj7', 'Bm7', 'D7', 'E7']);
    // F# makes Bm7 and D7; G# makes AmMaj7 and E7.
    expect(parseChord('D7')!.notes).toContain('F#');
    expect(parseChord('AmMaj7')!.notes).toContain('G#');
  });

  it('Dorian and melodic minor differ in one note, G against G#', () => {
    const dor = scaleNotes('A', 'dorian');
    const mm = scaleNotes('A', 'melodic-minor');
    expect(dor).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(mm.filter((n) => !dor.includes(n))).toEqual(['G#']);
    expect(chordPcs('Am7')).toContain(chroma('G'));
  });

  it('the Scales task: two positions, and the band vamps AmMaj7 to Am6', () => {
    const p = scalePatterns('A', 'melodic-minor');
    expect(p.find((x) => x.id === 'caged-e')!.positionName).toBe('4th position');
    expect(p.find((x) => x.id === 'caged-d')!.positionName).toBe('7th position');
    expect(vampFor('A', 'melodic-minor')!.symbols).toEqual(['AmMaj7', 'Am6']);
    expect(tasks().find((t) => t.task.id === 'scales-melodic')!.task.params).toEqual(['a', 'melodic-minor', 'caged-e']);
  });
});

describe('minor-key showpieces', () => {
  it('the Habanera\'s descent: D C# C B Bb A by half steps, in first position, as on the staff', () => {
    expect(pcs(HABANERA_DESCENT)).toEqual(names('D', 'C#', 'C', 'B', 'Bb', 'A'));
    const m = HABANERA_DESCENT.map((n) => midiAt(n));
    for (let i = 1; i < m.length; i++) expect(m[i] - m[i - 1]).toBe(-1);
    const choice = lesson('minor-key-repertoire').steps[1] as unknown as { figure: { notes: string[] } };
    expect(choice.figure.notes.map((n) => noteToMidi(n))).toEqual(m);
    // The refrain's key: D major has F#, D minor F.
    expect(scaleNotes('D', 'major')).toContain('F#');
    expect(parseChord('D')!.notes).toContain('F#');
  });

  it('the Habanera fallback\'s moving voice is D, C#, C, B', () => {
    const chart = progressionInKey('line-minor-down', 'D').bars.flat().map((c) => c.symbol);
    expect(chart).toEqual(['Dm', 'DmMaj7', 'Dm7', 'Dm6']);
    const added = chart.slice(1).map((c) => parseChord(c)!.notes[3]);
    expect(['D', ...added]).toEqual(['D', 'C#', 'C', 'B']);
  });

  it('the Mountain King: bar 2 is the library\'s, A# and F are outside E minor, and the tempo climbs 60 to 160', async () => {
    const s = await song('hall-of-the-mountain-king');
    const bar = s.tracks[0].measures[1].beats.filter((b) => b.notes.length).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret }));
    expect(MOUNTAIN_KING_BAR_2.map((n) => ({ string: n.string, fret: n.fret }))).toEqual(bar);
    expect(pcs(MOUNTAIN_KING_BAR_2)).toEqual(names('A#', 'F#', 'A#', 'A', 'F', 'A'));
    const em = new Set(scalePcs('E', 'minor'));
    expect([chroma('A#'), chroma('F')].every((p) => !em.has(p))).toBe(true);
    expect([chroma('F#'), chroma('A')].every((p) => em.has(p))).toBe(true);
    expect(s.tempo.map((t) => t.bpm)).toEqual([60, 80, 100, 120, 140, 160]);
  });

  it('the Funeral March fallback, Greensleeves, is in 6/8 and holds both G# and G', async () => {
    const s = await song('greensleeves-melody');
    expect(s.bars[0].time).toMatchObject({ numerator: 6, denominator: 8 });
    const lead = s.tracks.findIndex((t) => t.role === 'lead');
    const all = s.tracks[lead].measures.flatMap((_m, i) => barPcs(s, lead, i));
    expect(all).toContain(chroma('G#'));
    expect(all).toContain(chroma('G'));
  });
});

describe('the Neapolitan and the augmented sixth', () => {
  it('Bb/D is bII in first inversion; its Bb falls a diminished third to the G# of E7', () => {
    expect(intervalBetween('A', 'Bb')).toBe('m2');
    expect(harmonizeScale('A', 'minor')[1].symbol).toBe('Bdim');
    expect(harmonizeScale('A', 'minor')[5].symbol).toBe('F');
    expect(buildVoicing('Bb', SHAPES.cadence['Bb/D']).chord).toBe('Bb/D');
    expect(pitchClassAt({ string: 3, fret: 3 })).toBe(chroma('Bb'));
    expect(pitchClassAt({ string: 3, fret: 1 })).toBe(chroma('G#'));
    expect(intervalBetween('G#', 'Bb')).toBe('d3');
    expect(intervalBetween('D', 'Bb')).toBe('m6');
    expect(progressionInKey('classical-neapolitan', 'A').bars.flat().map((c) => c.symbol)).toEqual(['Am', 'Bb/D', 'E7', 'Am']);
  });

  it('the German sixth F A C D# is F7\'s pitches, its F and D# opening out to E', () => {
    const german = ['F', 'A', 'C', 'D#'].map((n) => chroma(n)).sort((a, b) => a - b);
    expect([...chordPcs('F7')].sort((a, b) => a - b)).toEqual(german);
    expect(intervalBetween('F', 'D#')).toBe('A6');
    expect(noteToMidi('E3') - noteToMidi('F3')).toBe(-1);
    expect(noteToMidi('E4') - noteToMidi('D#4')).toBe(1);
    expect(pitchClassAt({ string: 4, fret: 1 })).toBe(chroma('Eb'));
    expect(progressionInKey('classical-augmented-sixth', 'A').bars.map((b) => b.map((c) => c.symbol).join(' '))).toEqual(['Am', 'F7', 'Am/E E7', 'Am']);
    const card = lesson('neapolitan-and-augmented-sixth').steps.find((s) => (s as { title?: string }).title === 'The augmented sixth') as unknown as { figure: { notes: string[] } };
    expect(card.figure.notes.map((n) => chroma(n))).toEqual(names('F', 'A', 'C', 'D#'));
  });
});

describe('Bach in minor', () => {
  it('the texture card is bar 2 of the p i m a m i study, and bar 3 is the E chord of the question', async () => {
    const s = await song('st-pimami-3-4');
    const bar = (i: number) => s.tracks[0].measures[i].beats.filter((b) => b.notes.length).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret }));
    expect(PIMAMI_DM_BAR.map((n) => ({ string: n.string, fret: n.fret }))).toEqual(bar(1));
    expect(new Set(barPcs(s, 0, 2))).toEqual(new Set(names('E', 'G#', 'B')));
    expect(s.tracks[0].measures[2].beats[0].notes[0]).toMatchObject({ string: 6, fret: 0 });
    expect(s.tempo[0].bpm).toBe(66);
  });

  it('the pedal: the open A under A, Dm/A and A7, then Dm; A is the dominant of D minor', () => {
    expect(scaleNotes('D', 'minor')[4]).toBe('A');
    const chords = ['A', 'Dm', 'A7', 'Dm'];
    for (let b = 0; b < 4; b++) {
      const notes = PEDAL.slice(b * 4, b * 4 + 4);
      const tones = new Set(chordPcs(chords[b]));
      for (const n of notes) expect(tones.has(pitchClassAt(n)), `bar ${b + 1}`).toBe(true);
      expect(midiAt(notes[0]), `bar ${b + 1} bass`).toBe(b < 3 ? noteToMidi('A2') : noteToMidi('D3'));
    }
    expect(PEDAL.length).toBe(16);
  });
});

describe('the tasks of unit 8', () => {
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
        const said = [...textOf(target.body).matchAll(/(\d+) % \((\d+) (?:\{t:bpm\|BPM\}|BPM)\)/g)];
        if (req.tempo) expect(said.some((m) => Number(m[1]) === req.tempo), `${task.id}: names its ${req.tempo} %`).toBe(true);
        for (const m of said) expect(Math.abs(Number(m[2]) - (s.tempo[0].bpm * Number(m[1])) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
        if (req.loop) expect(req.loop.to, `${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
      }
    }
  });

  it('the printed-edition pieces fall back to library pieces and say how to bring an edition in', () => {
    const withFallback = tasks().filter(({ task }) => task.fallback).map(({ task }) => task);
    expect(withFallback.map((t) => t.id).sort()).toEqual(['bach-two-bars', 'bach-whole', 'habanera', 'hungarian-dance', 'marionette'].sort());
    for (const t of withFallback) {
      const target = t.fallback!;
      if (target.tool === 'player') expect(songEntry(target.params![0]), `${t.id}: ${target.params![0]}`).toBeTruthy();
    }
    for (const id of ['hungarian-dance', 'habanera', 'marionette']) expect(textOf(withFallback.find((t) => t.id === id)!.fallback!.body)).toContain('Scan & Import');
    const scanCard = lesson('bach-in-minor').steps.find((s) => (s as { title?: string }).title === 'Bring your own edition');
    expect(textOf((scanCard as { body: string }).body)).toContain('Scan & Import');
  });

  it('jam on real tracks, in offered keys, at the plan\'s tempos, which the jam screen plays', () => {
    const jams = tasks().flatMap(({ task }) => [task, ...(task.fallback ? [task.fallback as TaskStep] : [])]).filter((t) => t.tool === 'progressions');
    const seen: Record<string, number> = {};
    for (const task of jams) {
      const [id, key] = task.params ?? [];
      const p = getProgression(id)!;
      expect(p, id).toBeTruthy();
      expect(keyChoices(p).map((k) => k.toLowerCase()), id).toContain(key);
      const bpm = Number(/(\d+) (?:\{t:bpm\|BPM\}|BPM)/.exec(textOf(task.body))?.[1]);
      expect(clampTempo(p.feel.backing, bpm), `${id} at ${bpm}`).toBe(bpm);
      expect(bpm, id).toBeGreaterThanOrEqual(p.feel.tempo[0]);
      expect(bpm, id).toBeLessThanOrEqual(p.feel.tempo[1]);
      seen[`${id}/${key}`] = bpm;
    }
    expect(seen).toEqual({
      'classical-minor-cadence/a': 66,
      'flamenco-phrygian-vamp/e': 96,
      'line-minor-down/a': 66,
      'line-minor-down/d': 72,
      'classical-neapolitan/a': 60,
      'classical-augmented-sixth/a': 60,
    });
  });

  it('the Rondo and solea tasks quote the library\'s tempos', () => {
    const body = (id: string) => textOf(tasks().find((t) => t.task.id === id)!.task.body);
    expect(body('rondo')).toContain('74 % (80 {t:bpm|BPM})');
    expect(body('rondo')).toContain('100 % (108 BPM)');
    expect(body('solea-study')).toContain('75 % (81 {t:bpm|BPM})');
    expect(body('solea-study')).toContain('100 % (108 BPM)');
  });
});

describe('unit elena-minor-harmony in the course', () => {
  it('passes the lesson engine with no error and no warning, inside the whole of Elena\'s course', async () => {
    const tc = await loadTeacherCourse('elena');
    expect(tc.units.map((u) => u.id)).toContain('elena-minor-harmony');
    const problems = validateCourse(tc.course).filter((p) => p.unit === 'elena-minor-harmony');
    expect(problems, formatProblems(problems)).toEqual([]);
  });
});
