/**
 * Cross-checks for Dev's unit 12 (By ear, in time, in a band) against the engines and the song
 * library: every "string N, fret M" the text pairs with a note is that note, and every chord shape
 * is its chord; the tunes the lessons play are the library's (Auld Lang Syne in D and moved to G,
 * the chords of Amazing Grace moved from G to A, Silent Night's first two phrases, the turnaround in
 * A); the key, chord, capo and Nashville answers are the theory engine's; the second-guitar triads
 * are the chords the text names; the ear drills, technique exercises and jam tracks the tasks open
 * exist and play what the words say, at tempos their band plays; every Player tempo is the song's
 * tempo times the task's percentage.
 * Run with `npx vitest run src/content/teachers/dev/dev-band-and-ear.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, partSong } from '@/content/technique';
import { BACKING_STYLES } from '@/core/audio';
import { capoShapes, identifyFretted, midiAt, pitchClassAt, positionsForMidi, positionsForNote, scalePatterns, suggestCapo } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, diatonicChords, intervalBetween, romanToChord, scaleNotes, transposeChord, transposeChordBySemitones } from '@/core/theory';
import { drillById, levelOf } from '@/features/ear/core/drills';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, {
  DYNAMICS_ARPEGGIO, GIG_ENDING, GRACE_BASS_LINE_1, GRACE_IN_A, LINE_1_D, LINE_1_G, LINE_2_D, LINE_2_G, SILENT_1, SILENT_2,
} from './dev-band-and-ear';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const CODES: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };
const BEATS: Record<string, number> = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, e: 0.5, s: 0.25 };
const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

type Played = { string: number; fret: number; duration: string };
const played = (notes: readonly TabNote[]): Played[] => notes.filter((n): n is Played => !('rest' in n));
const nameAt = (n: { string: number; fret: number }) => PCS[pitchClassAt(n)];
const at = (p: { string: number; fret: number }) => `${p.string}:${p.fret}`;
const beats = (notes: readonly TabNote[]) => notes.reduce((sum, n) => sum + BEATS[n.duration], 0);

/** Every note of a track's bars as tab notes (the first note of each struck beat). */
async function trackNotes(id: string, pick: (t: Song['tracks'][number]) => boolean): Promise<Played[][]> {
  const s = await song(id);
  const track = s.tracks.find(pick)!;
  return track.measures.map((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret, duration: CODES[b.duration] ?? String(b.duration) })));
}

/** The chord sounding at the start of each bar (carried over bars with no new symbol). */
async function chordPerBar(id: string): Promise<string[]> {
  const s = await song(id);
  const out: string[] = [];
  let current = '';
  for (let bar = 0; bar < s.bars.length; bar++) {
    const first = s.chords.filter((c) => c.bar === bar).sort((a, b) => a.tick - b.tick)[0];
    if (first && first.tick === 0) current = first.symbol;
    out.push(current);
    const last = s.chords.filter((c) => c.bar === bar).sort((a, b) => b.tick - a.tick)[0];
    if (last) current = last.symbol;
  }
  return out;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/** Every "string N, fret M" the text pairs with a note, checked on the neck. */
function noteClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  let count = 0;
  const check = (s: string, f: string, n: string, where: string) => {
    count++;
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\}, string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} \(string (\d), fret (\d+)\)/g)) check(m[2], m[3], m[1], m[0]);
  if (count < 12) out.push(`only ${count} claims found: the patterns no longer match the text`);
  return out;
}

/** Every "{c:X} (shape)" in the text: the shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const found = [...text.matchAll(/\{c:([^}]+)\} \(([x0-9]{6})\)/g)];
  for (const m of found) {
    const got = identifyFretted(m[2]).symbol;
    if (got !== m[1]) out.push(`${m[0]}: the shape is ${got}`);
  }
  if (found.length < 4) out.push(`only ${found.length} shapes found`);
  return out;
}

const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((x) => x.id === id)!;
const lesson = (id: string) => unit.lessons.find((l) => l.id === id)!;
const step = <T,>(lessonId: string, pred: (s: Record<string, unknown>) => boolean) => lesson(lessonId).steps.find((s) => pred(s as unknown as Record<string, unknown>)) as unknown as T;

function jamProblems(chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  const jams = tasks.filter((s) => s.tool === 'progressions');
  if (jams.length !== Object.keys(chordsNamed).length) out.push(`${jams.length} jams, ${Object.keys(chordsNamed).length} expected`);
  for (const s of jams) {
    const [id, key, mode] = s.params!;
    const p = getProgression(id);
    if (!p) {
      out.push(`${s.id}: no progression ${id}`);
      continue;
    }
    if (mode !== 'jam') out.push(`${s.id}: opens the page, not the jam`);
    const tonic = key === 'bb' ? 'Bb' : key.toUpperCase();
    const chords = [...new Set(progressionInKey(p, tonic).bars.flat().map((c) => c.symbol))];
    if (JSON.stringify(chords) !== JSON.stringify(chordsNamed[s.id])) out.push(`${s.id}: ${id} in ${tonic} plays ${chords.join(' ')}`);
    for (const c of chords) if (!plain(s.body).includes(`{c:${c}}`)) out.push(`${s.id}: the words do not name ${c}`);
    const bpm = Number(plain(s.body).match(/(\d+) BPM/)?.[1]);
    const range = BACKING_STYLES[p.feel.backing].tempo;
    if (!(bpm >= range.min && bpm <= range.max)) out.push(`${s.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays (${range.min} to ${range.max})`);
  }
  return out;
}

/** "N % (M BPM)" and "M BPM" in a Player task's words (and its fallback's), against the song's tempo. */
async function playerBpmProblems(): Promise<string[]> {
  const out: string[] = [];
  const targets = tasks.flatMap((s) => [{ where: s.id, params: s.params ?? [], tool: s.tool, body: s.body }, ...(s.fallback ? [{ where: `${s.id} (fallback)`, params: s.fallback.params ?? [], tool: s.fallback.tool, body: s.fallback.body }] : [])]);
  let checked = 0;
  for (const t of targets) {
    if (t.tool !== 'player') continue;
    const id = taskSong({ tool: 'player', params: t.params });
    if (!id || !songEntry(id)) continue;
    checked++;
    const bpm = (await song(id)).tempo[0].bpm;
    const pct = Number((t.params.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
    const text = plain(t.body);
    const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
    for (const m of percents) if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${t.where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
    if (t.params.includes('wait')) continue;
    const plainBpm = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '').match(/(\d+) BPM/);
    if (!percents.some((m) => Number(m[1]) === pct)) {
      if (!plainBpm) out.push(`${t.where}: never says the tempo it opens at`);
      else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${t.where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
    }
  }
  if (checked < 5) out.push(`only ${checked} Player targets checked`);
  return out;
}

const course = compileCourse(courseMeta('dev'), [unit]);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Dev unit 12: by ear, in time, in a band', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(120);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(300);
    }
  });

  it('pairs every fret in the text with the note that is there, and every shape with its chord', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
    expect(shapeClaimProblems(unit)).toEqual([]);
    // Shapes written without a chord tag right before them.
    expect(identifyFretted('x57575').symbol).toBe('D7');
    expect(identifyFretted('x79797').symbol).toBe('E7');
    expect(identifyFretted('575655').symbol).toBe('A7');
    // The E-shape D7 has its root at string 6, fret 10; the A shape at string 5, fret 5.
    expect(identifyFretted('10 12 10 11 10 10'.split(' ').map(Number)).symbol).toBe('D7');
    expect(positionsForNote('D', { minFret: 1, maxFret: 12 }).filter((p) => p.string >= 5).map(at).sort()).toEqual(['5:5', '6:10']);
    expect(positionsForNote('D', { minFret: 0, maxFret: 12 }).filter((p) => p.string >= 5).map(at).sort()).toEqual(['5:5', '6:10']);
  });

  it('plays Auld Lang Syne as the library has it, in D, and moves it up a fourth to G', async () => {
    const tune = await trackNotes('auld-lang-syne', (t) => t.role === 'lead');
    // The pickup, bars 1 to 3 and the long B of bar 4; then the pickup to line 2, bars 5 to 7, the long D of bar 8.
    expect(LINE_1_D).toEqual([...tune[0], ...tune[1], ...tune[2], ...tune[3], tune[4][0]]);
    expect(LINE_2_D).toEqual([tune[4][1], ...tune[5], ...tune[6], ...tune[7], tune[8][0]]);
    expect(beats(LINE_1_D)).toBe(16);
    expect(beats(LINE_2_D)).toBe(16);
    // Line 1 hangs on B, line 2 rests on D; the tune starts on A and uses D major pentatonic only.
    expect(nameAt(played(LINE_1_D).at(-1)!)).toBe('B');
    expect(nameAt(played(LINE_2_D).at(-1)!)).toBe('D');
    expect(nameAt(LINE_1_D[0] as Played)).toBe('A');
    const pcs = new Set([...LINE_1_D, ...LINE_2_D].map((n) => nameAt(n as Played)));
    expect([...pcs].sort()).toEqual(scaleNotes('D', 'major-pentatonic').sort());
    expect(scaleNotes('D', 'major')[5]).toBe('B');
    const keyboard = step<{ figure: { keys: string[] } }>('key-by-ear', (s) => s.type === 'listen-choice' && !!s.figure);
    expect(new Set(keyboard.figure.keys.map((k) => k.replace(/\d/, '')))).toEqual(pcs);
    // In G: every note five half steps up, same rhythm, in first position at the lowest fret.
    for (const [d, g] of [[LINE_1_D, LINE_1_G], [LINE_2_D, LINE_2_G]] as const) {
      expect(g.map((n) => n.duration)).toEqual(d.map((n) => n.duration));
      expect(played(g).map((n) => midiAt(n))).toEqual(played(d).map((n) => midiAt(n) + 5));
      for (const n of played(g)) {
        const lowest = positionsForMidi(midiAt(n), { minFret: 0, maxFret: 4 }).sort((a, b) => a.fret - b.fret)[0];
        expect(at(n)).toBe(at(lowest));
      }
    }
    expect(nameAt(played(LINE_2_G).at(-1)!)).toBe('G');
    // B minor and E minor share the notes of D major and G major: the tempting wrong keys.
    expect(scaleNotes('B', 'minor').sort()).toEqual(scaleNotes('D', 'major').sort());
    expect(scaleNotes('E', 'minor').sort()).toEqual(scaleNotes('G', 'major').sort());
    // The home notes on the neck: D at string 5, fret 5 and string 6, fret 10; G at string 6, fret 3.
    expect(nameAt({ string: 6, fret: 3 })).toBe('G');
    expect(scaleNotes('A', 'major')[4]).toBe('E');
  });

  it('works out Amazing Grace in A from the library\'s chords in G, all from I, IV, V and vi', async () => {
    const bars = await chordPerBar('amazing-grace');
    const verse1 = bars.slice(1, 17);
    expect(verse1).toEqual(['G', 'G', 'C', 'G', 'G', 'G', 'D7', 'D7', 'G', 'G7', 'C', 'G', 'Em', 'D7', 'G', 'G']);
    // Up a whole step, the sevenths played as triads.
    const triad = (c: string) => c.replace(/7$/, '');
    expect(verse1.map((c) => triad(transposeChord(c, 'M2')))).toEqual(GRACE_IN_A);
    // The short list: I IV V vi of A major.
    const menu = ['I', 'IV', 'V', 'vi'].map((r) => romanToChord(r, 'A major'));
    expect(menu).toEqual(['A', 'D', 'E', 'F#m']);
    expect(new Set(GRACE_IN_A)).toEqual(new Set(menu));
    expect(['I', 'IV', 'V', 'vi'].map((r) => romanToChord(r, 'G major'))).toEqual(['G', 'C', 'D', 'Em']);
    expect(diatonicChords('A major').map((c) => c.symbol).slice(0, 6)).toEqual(['A', 'Bm', 'C#m', 'D', 'E', 'F#m']);
    // Line 3 is line 1 again; line 2 waits on E; line 4 opens F#m, E.
    expect(GRACE_IN_A.slice(8, 12)).toEqual(GRACE_IN_A.slice(0, 4));
    expect(GRACE_IN_A.slice(6, 8)).toEqual(['E', 'E']);
    expect(GRACE_IN_A.slice(12, 14)).toEqual(['F#m', 'E']);
    // The fill-blanks are those bars.
    const blanks = lesson('chords-by-ear').steps.filter((s) => (s as { type?: string }).type === 'fill-blanks') as Array<{ blanks: string[] }>;
    expect(blanks.map((b) => b.blanks)).toEqual([['{c:D}'], ['{c:F#m}', '{c:E}']]);
    // The bass of line 1 is the roots, on string 5.
    expect(played(GRACE_BASS_LINE_1).map(nameAt)).toEqual(GRACE_IN_A.slice(0, 4).map((c) => chordNotes(c)[0]));
    expect(played(GRACE_BASS_LINE_1).every((n) => n.string === 5 && n.duration === 'h.')).toBe(true);
    // The roots figure: A, D, E and F# on strings 6 and 5 (the engine checks each dot's note).
    expect(nameAt({ string: 6, fret: 2 })).toBe('F#');
    // The G version a whole step below the A version, and the colours it adds.
    expect(GRACE_IN_A.map((c) => transposeChordBySemitones(c, -2))).toEqual(verse1.map(triad));
    expect([...new Set(verse1)].filter((c) => c.endsWith('7')).sort()).toEqual(['D7', 'G7']);
    expect((await song('amazing-grace')).tempo[0].bpm).toBe(84);
  });

  it('plays Silent Night\'s first two phrases as the library has them, by step and small leap', async () => {
    const tune = await trackNotes('silent-night', (t) => t.role === 'lead');
    expect(SILENT_1).toEqual(tune.slice(0, 4).flat());
    expect(SILENT_2).toEqual(tune.slice(4, 8).flat());
    expect(beats(SILENT_1)).toBe(12);
    expect(beats(SILENT_2)).toBe(12);
    expect(played(SILENT_1).map(nameAt).join(' ')).toBe('D E D B D E D B');
    expect(played(SILENT_2).map(nameAt).join(' ')).toBe('A A F# G G D');
    // Up a step first (D to E), and the phrase lands a minor third down on B at string 5, fret 2.
    expect(midiAt(SILENT_1[1] as Played) - midiAt(SILENT_1[0] as Played)).toBe(2);
    expect(at(SILENT_1[3] as Played)).toBe('5:2');
    expect(intervalBetween('B', 'D')).toBe('m3');
    // Inside each phrase only steps and small leaps (a fourth at most); the one big jump, a minor
    // seventh up from B to A, comes between the phrases.
    const moves = (notes: readonly TabNote[]) => played(notes).map((n) => midiAt(n)).slice(1).map((m, i) => Math.abs(m - midiAt(played(notes)[i])));
    expect(Math.max(...moves(SILENT_1), ...moves(SILENT_2))).toBeLessThanOrEqual(5);
    expect(midiAt(SILENT_2[0] as Played) - midiAt(played(SILENT_1).at(-1)!)).toBe(10);
    expect(intervalBetween('B', 'A')).toBe('m7');
    // F# up a half step to G.
    expect(midiAt({ string: 3, fret: 0 }) - midiAt({ string: 4, fret: 4 })).toBe(1);
    // The order tiles are phrase 2.
    const order = step<{ tiles: string[] }>('melody-by-ear', (s) => s.type === 'order');
    expect(order.tiles.map((x) => x.slice(3, -1))).toEqual(played(SILENT_2).map(nameAt));
    // The fallbacks: bars 9 to 12 and 17 to 20 are new phrases; 80 % of 75 is 60 BPM.
    expect(tune[8].length).toBeGreaterThan(0);
    expect((await song('silent-night')).tempo[0].bpm).toBe(75);
  });

  it('moves keys with the capo exactly as the theory engine does', () => {
    // G Em C D up a whole step.
    expect(['G', 'Em', 'C', 'D'].map((c) => transposeChord(c, 'M2'))).toEqual(['A', 'F#m', 'D', 'E']);
    // Capo 3 turns G C D shapes into Bb Eb F, and Bb Eb F wants capo 3 with G C D.
    expect(['G', 'C', 'D'].map((c) => transposeChordBySemitones(c, 3))).toEqual(['A#', 'D#', 'F'].map((c) => transposeChordBySemitones(c, 0)));
    expect(['G', 'C', 'D'].map((c) => chroma(transposeChordBySemitones(c, 3)))).toEqual(['Bb', 'Eb', 'F'].map(chroma));
    const best = suggestCapo(['Bb', 'Eb', 'F']).find((s) => s.capo === 3)!;
    expect(best.shapes.map((s) => s.shape)).toEqual(['G', 'C', 'D']);
    // The capo table, and the wrong options of the capo question.
    for (const [capo, shapes] of [[1, ['A', 'D', 'E']], [3, ['G', 'C', 'D']], [8, ['D', 'G', 'A']], [10, ['C', 'F', 'G']]] as const) {
      expect(capoShapes(['Bb', 'Eb', 'F'], capo).map((s) => s.shape), `capo ${capo}`).toEqual(shapes);
    }
    expect(['G', 'C', 'D'].map((c) => transposeChord(c, 'M2'))).toEqual(['A', 'D', 'E']);
    expect(['G', 'C', 'D'].map((c) => transposeChord(c, 'M3'))).toEqual(['B', 'E', 'F#']);
    // The chord figure: a G shape behind capo 3 is Bb; capo 2 makes a D shape sound E.
    expect(identifyFretted('320003', { capo: 3 }).symbol).toBe('Bb');
    expect(identifyFretted('xx0232', { capo: 2 }).symbol).toBe('E');
    // Nashville: 1 4 1 5 in G, A and D.
    for (const [key, chart] of [['G major', 'G C G D'], ['A major', 'A D A E'], ['D major', 'D G D A']] as const) {
      expect(['I', 'IV', 'I', 'V'].map((r) => romanToChord(r, key)).join(' ')).toBe(chart);
    }
    // The barre shapes of the no-capo take.
    expect(['x13331', 'x68886', '133211'].map((f) => identifyFretted(f).symbol)).toEqual(['Bb', 'Eb', 'F']);
  });

  it('gives the second guitar the triads the text names, on strings 3 to 1', () => {
    const triads: Record<string, [number, number, number]> = { G: [7, 8, 7], D: [7, 7, 5], Em: [9, 8, 7], C: [9, 8, 8] };
    for (const [chord, [f3, f2, f1]] of Object.entries(triads)) {
      const pcs = [nameAt({ string: 3, fret: f3 }), nameAt({ string: 2, fret: f2 }), nameAt({ string: 1, fret: f1 })];
      expect(new Set(pcs), chord).toEqual(new Set(chordNotes(chord)));
      expect(identifyFretted(`xxx${f3}${f2}${f1}`).symbol?.split('/')[0], chord).toBe(chord);
    }
    // Em to C moves only the top note, one fret up.
    expect([triads.Em[0] === triads.C[0], triads.Em[1] === triads.C[1], triads.C[2] - triads.Em[2]]).toEqual([true, true, 1]);
    // The progression of the jams is I V vi IV in G.
    expect(['I', 'V', 'vi', 'IV'].map((r) => romanToChord(r, 'G major'))).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('opens real ear drills, at the levels the words describe', () => {
    const ear = (id: string) => {
      const [drill, level] = task(id).params!;
      const d = drillById(drill)!;
      expect(d, id).toBeTruthy();
      const l = levelOf(d, level)!;
      expect(l, id).toBeTruthy();
      return l;
    };
    expect(ear('home-note-drill').pool).toEqual(['1', '5']);
    expect(ear('home-note-drill').title).toBe('Home or the fifth');
    expect(ear('major-minor-drill').pool).toEqual(['major', 'minor']);
    expect(ear('chord-in-key-drill').pool).toEqual(['one-four-five', 'pop', 'fifties']);
    expect(ear('melodic-dictation').title).toBe('Up to sol');
    expect(levelOf(drillById('melody')!, 3)!.title).toBe('Steps and skips');
    for (const id of ['home-note-drill', 'major-minor-drill']) expect(ear(id).questions, id).toBeGreaterThanOrEqual(8);
  });

  it('uses the technique exercises as the words describe them', () => {
    const backbeat = getExercise('tech-metronome-2-4')!;
    expect(backbeat.parts[0].click).toBe('backbeat');
    expect(backbeat.tempo.start).toBeLessThanOrEqual(80);
    expect((80 - backbeat.tempo.start) % backbeat.tempo.step).toBe(0);
    const dyn = getExercise('tech-dynamics')!;
    expect(dyn.tempo.start).toBe(60);
    const bar = partSong(dyn, dyn.parts[0], 60).tracks[0].measures[0].beats.map((b) => at(b.notes[0]));
    expect(bar).toEqual(DYNAMICS_ARPEGGIO.map((n) => at(n as Played)));
    expect(identifyFretted('x02210').symbol).toBe('Am');
    expect(getExercise('tech-warm-up')).toBeTruthy();
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    expect(
      jamProblems({
        'jam-in-b-flat': ['Bb', 'Eb', 'F'],
        'first-guitar-jam': ['G', 'D', 'Em', 'C'],
        'second-guitar-jam': ['G', 'D', 'Em', 'C'],
        'dynamics-jam': ['G', 'Em', 'C', 'D'],
        'gig-jam': ['A7', 'D7', 'E7'],
      }),
    ).toEqual([]);
    // The gig's blues: the turnaround fills bars 11 and 12.
    const blues = progressionInKey(getProgression('blues-turnaround')!, 'A').bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(blues.length).toBe(12);
    expect(blues.slice(10)).toEqual(['A7 D7', 'A7 E7']);
  });

  it('plays the turnaround of the study and ends the gig on the root of A7', async () => {
    const study = await song('st-blues-turnarounds');
    expect(study.tempo[0].bpm).toBe(80);
    expect(study.sections.find((s) => s.name === 'Turnaround in A')).toMatchObject({ start: 2, end: 4 });
    const bar3 = study.tracks[0].measures[2].beats.flatMap((b) => b.notes).filter((n) => n.string === 4);
    const line = [...new Set(bar3.map((n) => n.fret))];
    expect(line).toEqual([5, 4, 3, 2]);
    expect(played(GIG_ENDING).slice(0, 4).map((n) => [n.string, n.fret])).toEqual(line.map((f) => [4, f]));
    expect(played(GIG_ENDING).map(nameAt).join(' ')).toBe('G F# F E E A');
    // The line is b7 6 b6 5 of A; the bar after is E7; the gig ends on the A of the E-shape A7.
    expect(['G', 'F#', 'F', 'E'].map((n) => intervalBetween('A', n))).toEqual(['m7', 'M6', 'm6', 'P5']);
    expect(study.chords.find((c) => c.bar === 3)?.symbol).toBe('E7');
    expect(at(played(GIG_ENDING).at(-1)!)).toBe('6:5');
    expect(identifyFretted('575655').notes.find((n) => n.string === 6)?.note.replace(/\d/, '')).toBe('A');
    expect(beats(GIG_ENDING)).toBe(12);
    // "Five of the six notes is a pass".
    const show = step<{ pass: number; notes: TabNote[] }>('dev-graduation', (s) => s.id === 'show');
    expect(show.notes.length).toBe(6);
    expect([Math.ceil(show.pass * 6 - 1e-9), 4 / 6 < show.pass, 5 / 6 >= show.pass]).toEqual([5, true, true]);
    // The five boxes of A minor pentatonic start at frets 5, 7, 9, 12 and 2.
    const boxes = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    expect(['box-1', 'box-2', 'box-3', 'box-4'].map((id) => boxes.find((p) => p.id === id)!.minFret)).toEqual([5, 7, 9, 12]);
    expect(scalePatterns('A', 'minor-pentatonic').find((p) => p.id === 'box-5')!.minFret).toBe(2);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems()).toEqual([]);
    // Missing songs fall back to library songs, and say so.
    for (const s of tasks) {
      const id = taskSong(s);
      if (id && !songEntry(id)) {
        expect(s.fallback, s.id).toBeTruthy();
        expect(songEntry(taskSong(s.fallback!) ?? ''), s.id).toBeTruthy();
      }
    }
    expect(task('swing-low-key').fallback!.params).toEqual(['down-in-the-valley']);
  });
});
