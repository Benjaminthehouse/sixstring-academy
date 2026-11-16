/**
 * Cross-checks for Prof. Varga's unit 7 (`elena-playing-the-changes.ts`) against the engines and
 * the song library: the arpeggios are the chords' own tones in fifth position and the study's own
 * bars; the horizontal line stays in C major and misses the change, the vertical one spells every
 * chord and moves its guide tones by half steps; the approach notes and enclosures land on the
 * thirds; the arpeggios a third up give 3, 5, 7 and 9; the altered scale is Ab melodic minor from G
 * and its tensions resolve by half steps; the side-slip and the Db7 line are what the cards say;
 * every tempo, jam, key, ear level and scale shape is real. Run:
 * `npx vitest run src/content/teachers/elena/elena-playing-the-changes.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { midiAt, pitchClassAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordPcs, chroma, harmonizeScale, intervalBetween, parseChord, scaleNotes, scalePcs, semitones, degreeToInterval, tritoneSubstitute } from '@/core/theory';
import { drillById, levelOf } from '@/features/ear/core/drills';
import { clampTempo } from '@/features/progressions/model/jam';
import { parsePlayerParams } from '@/features/player/model/params';
import { vampFor } from '@/features/scales/model/backing';
import { formatProblems, validateCourse } from '@/lessons';
import { isTaskStep, loadTeacherCourse, type TaskStep, type TeacherLesson } from '../index';
import unit, { ARPEGGIOS, ENCLOSURES, G_ALTERED, LINES, OUTSIDE, THIRD_UP, type Played } from './elena-playing-the-changes';

const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const tasks = (): Array<{ lesson: string; task: TaskStep }> => unit.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
const textOf = (t: unknown): string => (typeof t === 'string' ? t : (t as { text: string }).text);
const pcs = (notes: readonly Played[]) => notes.map((n) => pitchClassAt(n));
const names = (...ns: string[]) => ns.map((n) => chroma(n));
const BEATS: Record<string, number> = { e: 0.5, q: 1, h: 2, w: 4 };

/** Split a line into bars of 4/4: the notes of each bar. */
function barsOf(line: readonly Played[]): Played[][] {
  const out: Played[][] = [];
  let beat = 0;
  for (const n of line) {
    (out[Math.floor(beat / 4)] ??= []).push(n);
    beat += BEATS[n.duration];
  }
  expect(beat % 4).toBe(0);
  return out;
}

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

describe('seventh arpeggios', () => {
  it('are the seven diatonic sevenths of C major', () => {
    expect(harmonizeScale('C', 'major', { sevenths: true }).map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
    expect(['Em7', 'Fmaj7', 'Am7', 'Bm7b5'].map((c) => parseChord(c)!.notes.join(' '))).toEqual(['E G B D', 'F A C E', 'A C E G', 'B D F A']);
    // Only the chord on vii is half-diminished; I and IV are the major sevenths.
    expect(harmonizeScale('C', 'major', { sevenths: true }).filter((c) => c.type.id === 'm7b5').map((c) => c.symbol)).toEqual(['Bm7b5']);
    expect(harmonizeScale('C', 'major', { sevenths: true }).filter((c) => c.type.id === 'maj7').map((c) => c.symbol)).toEqual(['Cmaj7', 'Fmaj7']);
  });

  it('run root to octave and back in fifth position, as the study\'s bars 2, 5 and 1 do', async () => {
    const want: Record<string, string[]> = { Dm7: ['D', 'F', 'A', 'C', 'D', 'C', 'A', 'F', 'D'], G7: ['G', 'B', 'D', 'F', 'G', 'F', 'D', 'B', 'G'], Cmaj7: ['C', 'E', 'G', 'B', 'C', 'B', 'G', 'E', 'C'] };
    for (const [chord, notes] of Object.entries(ARPEGGIOS)) {
      expect(pcs(notes), chord).toEqual(names(...want[chord]));
      for (const n of notes) expect(n.fret, `${chord} in fifth position`).toBeGreaterThanOrEqual(4);
      for (const n of notes) expect(n.fret).toBeLessThanOrEqual(8);
      const m = notes.map((n) => midiAt(n));
      expect(m[4] - m[0], `${chord}: up to the octave`).toBe(12);
      expect(m[8], chord).toBe(m[0]);
    }
    const s = await song('st-arpeggio-sevenths');
    const bar = (i: number) => s.tracks[0].measures[i].beats.filter((b) => b.notes.length > 0).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret }));
    const strip = (notes: readonly Played[]) => notes.slice(0, 8).map((n) => ({ string: n.string, fret: n.fret }));
    expect(strip(ARPEGGIOS.Cmaj7)).toEqual(bar(0));
    expect(strip(ARPEGGIOS.Dm7)).toEqual(bar(1));
    expect(strip(ARPEGGIOS.G7)).toEqual(bar(4));
    expect(s.tempo[0].bpm).toBe(104);
  });

  it('the cards\' fretboards and the tapping alternatives hold the notes they say', () => {
    const l = lesson('seventh-arpeggios');
    const finds = l.steps.filter((s) => (s as { type?: string }).type === 'play-phrase').map((s) => (s as unknown as { alternative: { find: { chord: string }; strings: number[]; frets: [number, number] } }).alternative);
    const counts = finds.map((f) => {
      const chord = new Set(chordPcs(f.find.chord));
      let n = 0;
      for (const string of f.strings) for (let fret = f.frets[0]; fret <= f.frets[1]; fret++) if (chord.has(pitchClassAt({ string, fret }))) n++;
      return [f.find.chord, n];
    });
    expect(counts).toEqual([['Dm7', 5], ['G7', 5], ['Cmaj7', 4]]);
  });
});

describe('horizontal and vertical', () => {
  const chords = ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'];

  it('the horizontal line is the C major scale and puts A, the ninth, on the G7 bar\'s beat 1', () => {
    const cMajor = new Set(scalePcs('C', 'major'));
    for (const n of LINES.horizontal) expect(cMajor.has(pitchClassAt(n))).toBe(true);
    const bars = barsOf(LINES.horizontal);
    expect(bars.map((b) => pitchClassAt(b[0]))).toEqual(names('D', 'A', 'E', 'C'));
    expect(intervalBetween('G', 'A')).toBe('M2');
    expect(chordPcs('G7').includes(chroma('A'))).toBe(false);
    // Beat 2 of the G7 bar is B; beat 4 of the Dm7 bar is G.
    expect(pitchClassAt(bars[1][1])).toBe(chroma('B'));
    expect(pitchClassAt(bars[0][3])).toBe(chroma('G'));
  });

  it('the vertical line spells every chord and moves its guide tones by half steps', () => {
    const bars = barsOf(LINES.vertical);
    bars.forEach((bar, i) => {
      const tones = new Set(chordPcs(chords[i]));
      for (const n of bar) expect(tones.has(pitchClassAt(n)), `bar ${i + 1}`).toBe(true);
    });
    expect(bars.map((b) => pitchClassAt(b[0]))).toEqual(names('D', 'B', 'E', 'E'));
    // C (seventh of Dm7) to B (third of G7); F (seventh of G7) to E (third of Cmaj7).
    expect(midiAt(bars[1][0]) - midiAt(bars[0][3])).toBe(-1);
    expect(midiAt(bars[2][0]) - midiAt(bars[1][3])).toBe(-1);
    expect(pcs(bars[1])).toEqual(names('B', 'D', 'G', 'F'));
  });

  it('E7 is not in C major, and its notes on strings 4 to 2, frets 4 to 7, are the four the answer names', () => {
    const cMajor = new Set(scalePcs('C', 'major'));
    expect(chordPcs('E7').filter((p) => !cMajor.has(p))).toEqual([chroma('G#')]);
    const e7 = new Set(chordPcs('E7'));
    const found: string[] = [];
    for (const string of [4, 3, 2]) for (let fret = 4; fret <= 7; fret++) if (e7.has(pitchClassAt({ string, fret }))) found.push(`${string}:${fret}`);
    expect(found).toEqual(['4:6', '3:4', '3:7', '2:5']);
    expect(progressionInKey('secondary-v-of-vi', 'C').bars.flat().map((c) => c.symbol)).toEqual(['C', 'E7', 'Am', 'F']);
    // G# is the third of E7 and rises a half step to A, the root of Am.
    expect(semitones(intervalBetween('G#', 'A'))).toBe(1);
  });
});

describe('approach notes and enclosures', () => {
  it('approach the thirds from a half step below, and enclose them from a step above', () => {
    expect(pcs(ENCLOSURES.approachE)).toEqual(names('D#', 'E'));
    expect(pcs(ENCLOSURES.intoE)).toEqual(names('F', 'D#', 'E'));
    expect(pcs(ENCLOSURES.approachB)).toEqual(names('A#', 'B'));
    expect(pcs(ENCLOSURES.intoB)).toEqual(names('C', 'A#', 'B'));
    expect(pcs(ENCLOSURES.intoF)).toEqual(names('G', 'E', 'F'));
    for (const [line, chord] of [[ENCLOSURES.intoE, 'Cmaj7'], [ENCLOSURES.intoB, 'G7'], [ENCLOSURES.intoF, 'Dm7']] as const) {
      const m = line.map((n) => midiAt(n));
      const target = m[2];
      expect(m[1] - target, chord).toBe(-1);
      expect(m[0] - target, chord).toBeGreaterThan(0);
      expect(m[0] - target, chord).toBeLessThanOrEqual(2);
      // The upper note is a scale step of C major; the target is the chord's third.
      expect(scalePcs('C', 'major').includes(pitchClassAt(line[0]))).toBe(true);
      expect(parseChord(chord)!.notes[1]).toBe(['E', 'B', 'F'][[ENCLOSURES.intoE, ENCLOSURES.intoB, ENCLOSURES.intoF].indexOf(line)]);
    }
  });

  it('the staff on the first card is the approach and then the enclosure into E', () => {
    const card = lesson('approach-notes-and-enclosures').steps[0] as unknown as { figure: { notes: Array<{ note: string }> } };
    expect(card.figure.notes.map((n) => n.note)).toEqual(['D#4', 'E4', 'F4', 'D#4', 'E4']);
    expect([...ENCLOSURES.approachE, ...ENCLOSURES.intoE].map((n) => midiAt(n))).toEqual([63, 64, 65, 63, 64]);
  });
});

describe('arpeggios a third up', () => {
  it('start on each chord\'s third and give the 3, 5, 7 and 9', () => {
    const cases: Array<[string, string, string[]]> = [
      ['Cmaj7', 'Em7', ['3', '5', '7', '9']],
      ['Dm7', 'Fmaj7', ['b3', '5', 'b7', '9']],
      ['G7', 'Bm7b5', ['3', '5', 'b7', '9']],
      ['Am7', 'Cmaj7', ['b3', '5', 'b7', '9']],
    ];
    for (const [chord, sub, degrees] of cases) {
      const root = parseChord(chord)!.root;
      const notes = parseChord(sub)!.notes;
      expect(notes[0], `${sub} starts on the third of ${chord}`).toBe(parseChord(chord)!.notes[1]);
      expect(notes.map((n) => semitones(intervalBetween(root, n)) % 12), `${sub} over ${chord}`).toEqual(degrees.map((d) => semitones(degreeToInterval(d)) % 12));
    }
    // In C major the substitute is the diatonic seventh chord a third up.
    const sevenths = harmonizeScale('C', 'major', { sevenths: true }).map((c) => c.symbol);
    for (const [chord, sub] of cases) expect(sevenths[(sevenths.indexOf(chord) + 2) % 7]).toBe(sub);
  });

  it('the phrases play those arpeggios, and the wrong choices are what their notes say', () => {
    expect(pcs(THIRD_UP.Fmaj7).slice(0, 4)).toEqual(names('F', 'A', 'C', 'E'));
    expect(pcs(THIRD_UP.Bm7b5).slice(0, 4)).toEqual(names('B', 'D', 'F', 'A'));
    expect(pcs(THIRD_UP.Em7).slice(0, 4)).toEqual(names('E', 'G', 'B', 'D'));
    for (const line of Object.values(THIRD_UP)) expect(midiAt(line[line.length - 1])).toBe(midiAt(line[0]));
    // Em7 over Am7: 5, b7, 9, 11. G7 over Am7: F against the fifth, E (a half step).
    expect(parseChord('Em7')!.notes.map((n) => semitones(intervalBetween('A', n)))).toEqual([7, 10, 2, 5]);
    expect(semitones(intervalBetween('E', 'F'))).toBe(1);
  });

  it('the study\'s bars 3 to 7 hold Em7, Fmaj7, G7, Am7 and Bm7b5', async () => {
    const s = await song('st-arpeggio-sevenths');
    const at = (bar: number) => s.chords.filter((c) => c.bar === bar).map((c) => c.symbol);
    expect([2, 3, 4, 5, 6].map((b) => at(b)[0])).toEqual(['Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
  });
});

describe('the altered dominant', () => {
  it('G altered is Ab melodic minor from G, and the figure is the engine\'s third-position shape', () => {
    expect(scaleNotes('G', 'altered')).toEqual(['G', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
    const ab = scaleNotes('Ab', 'melodic-minor');
    expect(ab).toEqual(['Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F', 'G']);
    expect([...ab.slice(6), ...ab.slice(0, 6)]).toEqual(scaleNotes('G', 'altered'));
    const shape = scalePatterns('G', 'altered').find((p) => p.id === 'caged-e')!;
    expect(shape.positionName).toBe('3rd position');
    expect(G_ALTERED.map((d) => `${d.string}:${d.fret}`)).toEqual(shape.notes.map((n) => `${n.string}:${n.fret}`));
    // Each label is the note's role over G7.
    for (const d of G_ALTERED) expect((pitchClassAt(d) - chroma('G') + 12) % 12, `${d.string}:${d.fret} ${d.degree}`).toBe(semitones(degreeToInterval(d.degree)) % 12);
    // G Ab Bb Cb Db Eb F: G Major or melodic G minor would not do (the wrong choices).
    expect(scaleNotes('G', 'melodic-minor')).toEqual(['G', 'A', 'Bb', 'C', 'D', 'E', 'F#']);
    expect(scaleNotes('Ab', 'major')).toContain('C');
  });

  it('the tensions resolve by half steps into Cmaj7\'s fifth, third and root', () => {
    const res: Array<[string, string, string]> = [['Ab3', 'G3', '5'], ['Eb4', 'E4', '3'], ['Db4', 'C4', '1']];
    for (const [from, to, role] of res) {
      expect(Math.abs(chroma(from) - chroma(to)) % 11, `${from} to ${to}`).toBe(1);
      expect(semitones(intervalBetween('C', to.replace(/\d/, ''))) % 12).toBe(semitones(degreeToInterval(role)) % 12);
    }
    const card = lesson('altered-dominant').steps.find((s) => (s as { title?: string }).title === 'Resolve by step') as unknown as { figure: { notes: Array<{ note: string }> } };
    expect(card.figure.notes.map((n) => n.note)).toEqual(res.flatMap(([a, b]) => [a, b]));
  });

  it('the ear level and the Scales band are what the tasks promise', () => {
    const ear = tasks().find((t) => t.task.tool === 'ear')!.task;
    expect(ear.params).toEqual(['chords', '9']);
    const level = levelOf(drillById('chords')!, 9)!;
    expect(level.pool).toEqual(expect.arrayContaining(['7', '7b9', '7sharp9']));
    const scales = tasks().find((t) => t.task.tool === 'scales')!.task;
    expect(scales.params).toEqual(['g', 'altered', 'caged-e']);
    expect(vampFor('G', 'altered')!.symbols[0]).toBe('G7alt');
  });
});

describe('going outside', () => {
  it('the side-slip: a phrase in A minor pentatonic, the same a half step up, then home', () => {
    const m = OUTSIDE.sideSlip.map((n) => midiAt(n));
    const aPent = new Set(scalePcs('A', 'minor-pentatonic'));
    const bbPent = new Set(scalePcs('Bb', 'minor-pentatonic'));
    expect(m.slice(3, 6)).toEqual(m.slice(0, 3).map((x) => x + 1));
    for (const x of [...m.slice(0, 3), ...m.slice(6)]) expect(aPent.has(x % 12)).toBe(true);
    for (const x of m.slice(3, 6)) expect(bbPent.has(x % 12)).toBe(true);
    expect(OUTSIDE.sideSlip.slice(0, 3).map((n) => n.fret + 1)).toEqual(OUTSIDE.sideSlip.slice(3, 6).map((n) => n.fret));
    // Home is a chord tone of Am7 (the lesson's own rule): C, its minor third, not D, its eleventh.
    expect(pitchClassAt(OUTSIDE.sideSlip[9])).toBe(chroma('C'));
    expect(chordPcs('Am7')).toContain(pitchClassAt(OUTSIDE.sideSlip[9]));
    expect(scaleNotes('Bb', 'minor-pentatonic')).toEqual(['Bb', 'Db', 'Eb', 'F', 'Ab']);
    expect(progressionInKey('funk-one-chord-minor', 'A').bars.flat().map((c) => c.symbol)).toEqual(['Am7', 'Am7']);
  });

  it('Db7 over G7: the tritone substitute, its notes the b5, b7, b9 and third, and the line rises to C', () => {
    expect(tritoneSubstitute('G7')).toBe('Db7');
    expect(parseChord('Db7')!.notes).toEqual(['Db', 'F', 'Ab', 'Cb']);
    expect(parseChord('Db7')!.notes.map((n) => semitones(intervalBetween('G', n)) % 12)).toEqual([6, 10, 1, 4]);
    expect(pcs(OUTSIDE.db7)).toEqual(names('Db', 'F', 'Ab', 'B', 'C'));
    const m = OUTSIDE.db7.map((n) => midiAt(n));
    expect(m[4] - m[3]).toBe(1);
    expect(midiAt({ string: 3, fret: 5 })).toBe(60);
  });
});

describe('review fixes', () => {
  it('melodic minor is defined where it is first used, and the definition spells A melodic minor', () => {
    const term = unit.glossary!.find((g) => g.id === 'melodic-minor')!;
    expect(term).toBeTruthy();
    const spelled = [...textOf(term.definition).matchAll(/\{n:([A-G][#b]?)\}/g)].map((m) => m[1]);
    expect(spelled).toEqual(scaleNotes('A', 'melodic-minor'));
    const card = lesson('altered-dominant').steps.find((s) => (s as { title?: string }).title === 'One scale holds them all') as { body: string };
    expect(card.body).toContain('{t:melodic-minor|');
    // No earlier lesson of this unit says "melodic minor" before the card that defines it.
    const before = unit.lessons.slice(0, unit.lessons.findIndex((l) => l.id === 'altered-dominant'));
    expect(JSON.stringify(before)).not.toMatch(/melodic minor/i);
  });

  it('the "G melodic minor" distractor is wrong for the reason it gives: it lacks G7\'s third and seventh', () => {
    const gmm = new Set(scalePcs('G', 'melodic-minor'));
    const [third, seventh] = [chroma('B'), chroma('F')];
    expect(chordPcs('G7')).toEqual(expect.arrayContaining([third, seventh]));
    expect(gmm.has(third)).toBe(false);
    expect(gmm.has(seventh)).toBe(false);
    expect([chroma('Bb'), chroma('F#')].every((p) => gmm.has(p))).toBe(true);
    const choice = lesson('altered-dominant').steps.find((s) => (s as { type?: string }).type === 'choice') as { options: Array<{ text: string; why?: string }> };
    const why = choice.options.find((o) => o.text === '{n:G} melodic minor')!.why!;
    expect(why).toContain('{n:Bb} and {n:F#}');
    expect(why).not.toMatch(/no tensions/);
  });
});

describe('the tasks of unit 7', () => {
  it('name the BPM the Player will play', async () => {
    for (const { lesson: l, task } of tasks()) {
      if (task.tool !== 'player') continue;
      const req = parsePlayerParams(task.params ?? []);
      expect(songEntry(req.songId!), `${l} > ${task.id}`).toBeTruthy();
      const s = await song(req.songId!);
      const said = [...textOf(task.body).matchAll(/(\d+) % \((\d+) (?:\{t:bpm\|BPM\}|BPM)\)/g)];
      if (req.tempo) expect(said.some((m) => Number(m[1]) === req.tempo), `${task.id}: names its ${req.tempo} %`).toBe(true);
      for (const m of said) expect(Math.abs(Number(m[2]) - (s.tempo[0].bpm * Number(m[1])) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      if (req.loop) expect(req.loop.to, `${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
    }
  });

  it('jam on real tracks, in offered keys, at tempos the jam screen plays (the plan\'s 96 and 92 included)', () => {
    const jams = tasks().map((t) => t.task).filter((t) => t.tool === 'progressions');
    expect(jams.length).toBe(8);
    const tempos: number[] = [];
    for (const task of jams) {
      const [id, key] = task.params ?? [];
      const p = getProgression(id)!;
      expect(p, id).toBeTruthy();
      expect(keyChoices(p).map((k) => k.toLowerCase()), id).toContain(key);
      const bpm = Number(/(\d+) \{t:bpm\|BPM\}/.exec(textOf(task.body))?.[1]);
      expect(clampTempo(p.feel.backing, bpm), `${id} at ${bpm}`).toBe(bpm);
      tempos.push(bpm);
    }
    expect(tempos.sort((a, b) => a - b)).toEqual([92, 92, 96, 96, 100, 100, 100, 100]);
    expect(progressionInKey('jazz-ii-v-i', 'C').bars.flat().map((c) => c.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
  });
});

describe('unit elena-playing-the-changes in the course', () => {
  it('passes the lesson engine with no error and no warning, inside the whole of Elena\'s course', async () => {
    const tc = await loadTeacherCourse('elena');
    expect(tc.units.map((u) => u.id)).toContain('elena-playing-the-changes');
    const problems = validateCourse(tc.course).filter((p) => p.unit === 'elena-playing-the-changes');
    expect(problems, formatProblems(problems)).toEqual([]);
  });
});
