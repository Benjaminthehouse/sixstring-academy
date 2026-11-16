/**
 * Cross-checks for Prof. Varga's unit 12 (Composition and arranging) against the song library, the
 * progression catalog and the guitar and theory engines: the functions, borrowed chords and cadences
 * are what the theory engine says; Elena's period is in its key, ends open and closed where the
 * cards say and peaks once, by step; the arrangement layers fit its chords; the ragtime thumb and
 * tune, the invention's subject and imitation, the fugue's subject, answer, countersubject and third
 * entry, and the DADGAD Air's tune and drones are the library's own notes; DADGAD and drop D are
 * what the cards say; every Player tempo adds up; and every swapped piece really is missing. Run
 * with `npx vitest run src/content/teachers/elena/elena-composition-and-arranging.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { midiAt, noteAt, positionsForPitchClass, retuneSteps, scalePositions, tuning, voicingProblem } from '@/core/guitar';
import { parseSixTab, type Note, type Song } from '@/core/song';
import {
  chordNotes, chordToRoman, chroma, classifyCadence, consonance, diatonicChords, intervalBetween, noteToMidi, parseNote, relativeKey, scaleNotes,
} from '@/core/theory';
import { estimateLessonSeconds, formatProblems, parseRhythm, validateCourse, type RichText, type TabNote } from '@/lessons';
import { palette } from '@/features/progressions/model/builder';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import repertoireUnit from './elena-classical-repertoire';
import type { TaskStep, TeacherLesson, TeacherUnit } from '../types';
import unit, {
  DADGAD_OPEN, DADGAD_SCALE, DADGAD_TUNE, FUGUE_ANSWER, FUGUE_COUNTERSUBJECT, FUGUE_SUBJECT, FUGUE_THIRD_ENTRY, INVENTION_BASS, INVENTION_SUBJECT,
  LAYER_BASS, LAYER_FULL, LAYER_MELODY, PERIOD_ANSWER, PERIOD_CHORDS, PERIOD_QUESTION, RAG_THUMB, RAG_TUNE, RAG_TUNE_RHYTHM,
} from './elena-composition-and-arranging';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function plain(text: RichText | undefined): string {
  if (text === undefined) return '';
  return typeof text === 'string' ? text : text.text;
}

function lesson(id: string): TeacherLesson {
  const l = unit.lessons.find((x) => x.id === id);
  if (!l) throw new Error(`no lesson ${id}`);
  return l;
}

function tasks(u: TeacherUnit): TaskStep[] {
  return u.lessons.flatMap((l) => l.steps.filter(isTaskStep));
}

function task(id: string): TaskStep {
  const found = tasks(unit).find((x) => x.id === id);
  if (!found) throw new Error(`no task ${id}`);
  return found;
}

/** Every string in the unit: cards, tasks, prompts, options, explanations, captions, facts. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** Problems with the tempos the Player tasks name: "about N BPM" is where it opens, "P % (M BPM)" must add up. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const s of tasks(u)) {
    for (const target of [s, ...(s.fallback ? [s.fallback] : [])]) {
      const id = taskSong(target);
      if (!id || !songEntry(id)) continue;
      const bpm = (await song(id)).tempo[0].bpm;
      const pctParam = (target.params ?? []).find((p) => /^t\d+$/.test(p));
      const pct = pctParam ? Number(pctParam.slice(1)) : 100;
      const text = plain(target === s ? s.body : s.fallback!.body);
      for (const m of text.matchAll(/(\d+) % \((\d+) BPM\)/g)) {
        if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${s.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
      }
      const about = text.match(/about (\d+) BPM/);
      if (about) {
        const opens = (bpm * pct) / 100;
        if (Math.abs(opens - Number(about[1])) > 1) out.push(`${s.id}: says about ${about[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
      } else if (pct !== 100) out.push(`${s.id}: opens at ${pct} % but names no BPM`);
    }
  }
  return out;
}

type Fretted = Extract<TabNote, { string: number }>;
const struck = (notes: TabNote[]) => notes.filter((n): n is Fretted => 'string' in n);
const midis = (notes: TabNote[], tun?: string) => struck(notes).map((n) => midiAt(n, { tuning: tun }));
const TICKS: Record<string, number> = { s: 240, e: 480, 'e.': 720, q: 960, 'q.': 1440, h: 1920, 'h.': 2880, w: 3840, et: 320, qt: 640 };
const durations = (notes: TabNote[]) => notes.map((n) => TICKS[n.duration]);

/** Onsets of a tab line, in ticks from its start. */
function onsets(notes: TabNote[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const n of notes) {
    if ('string' in n) out.push(at);
    at += TICKS[n.duration];
  }
  return out;
}

/** The newly struck (not tied) notes of a bar, beat by beat: [tick from the start of the bars, notes]. */
function attacks(s: Song, from: number, to: number): Array<{ tick: number; notes: Note[]; all: Note[] }> {
  const out: Array<{ tick: number; notes: Note[]; all: Note[] }> = [];
  let offset = 0;
  for (let b = from - 1; b < to; b++) {
    for (const beat of s.tracks[0].measures[b].beats) {
      const fresh = beat.notes.filter((n) => !n.tie);
      if (fresh.length) out.push({ tick: offset + beat.start, notes: fresh, all: beat.notes });
    }
    const t = s.bars[b].time;
    offset += (t.numerator * 3840) / t.denominator;
  }
  return out;
}

/** Durations between successive onsets, the last one to the end of the span. */
function gaps(ticks: number[], end: number): number[] {
  return ticks.map((t, i) => (i + 1 < ticks.length ? ticks[i + 1] : end) - t);
}

const course = compileCourse(courseMeta('elena'), [unit]);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Elena unit 12: Composition and arranging', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window, and its minutes near the estimate', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
      expect(Math.abs(l.minutes - s / 60), `${l.id}: minutes ${l.minutes}, estimated ${(s / 60).toFixed(1)}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('names every "string N, fret M ({n:X})" as the note that is there', () => {
    let checked = 0;
    for (const text of allStrings(unit)) {
      for (const m of text.matchAll(/string (\d), fret (\d+) \(\{n:([^}]+)\}\)/g)) {
        const n = parseNote(m[3])!;
        const at = midiAt({ string: Number(m[1]), fret: Number(m[2]) });
        if (n.octave !== null) expect(at, m[0]).toBe(n.midi);
        else expect(at % 12, m[0]).toBe(n.chroma);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('maps the functions, borrowed chords and cadences as the theory engine does', () => {
    const fn = (sym: string) => diatonicChords('C major').find((c) => c.symbol === sym)?.function;
    expect(['C', 'Am', 'Em'].map(fn)).toEqual(['tonic', 'tonic', 'tonic']);
    expect(['F', 'Dm'].map(fn)).toEqual(['subdominant', 'subdominant']);
    expect(['G', 'Bdim'].map(fn)).toEqual(['dominant', 'dominant']);
    expect(chordToRoman('G7', 'C')).toMatchObject({ roman: 'V7', function: 'dominant' });
    for (const [sym, roman, f] of [['Fm', 'iv', 'subdominant'], ['Ab', 'bVI', 'subdominant'], ['Bb', 'bVII', 'dominant']] as const) {
      const r = chordToRoman(sym, 'C');
      expect(r, sym).toMatchObject({ roman, function: f, relation: 'borrowed' });
      expect(r.borrowedFrom, sym).toContain('minor');
    }
    for (const sym of ['F', 'Dm', 'Em']) expect(chordToRoman(sym, 'C').relation, sym).toBe('diatonic');
    expect(chordNotes('Fm')).toEqual(['F', 'Ab', 'C']);
    expect(intervalBetween('G', 'Ab')).toBe('m2');
    expect(chordNotes('F')).toContain('A');
    expect(chordNotes('Am').filter((n) => chordNotes('C').includes(n))).toEqual(['C', 'E']);
    expect(classifyCadence(['G7', 'Am'], 'C')!.type).toBe('deceptive');
    expect(classifyCadence(['G7', 'C'], 'C')!.type).toBe('authentic');
    expect(classifyCadence(['F', 'C'], 'C')!.type).toBe('plagal');
    expect(classifyCadence(['C', 'G7'], 'C')!.type).toBe('half');
    // The jam track: I IV iv I, offered in C, at a tempo range that holds 72.
    const p = getProgression('borrowed-iv-minor')!;
    expect(p.chart).toBe('I | IV | iv | I');
    expect(p.keys).toContain('C');
    expect(task('minor-iv-jam').params).toEqual(['borrowed-iv-minor', 'c', 'jam']);
    expect(p.feel.tempo[0]).toBeLessThanOrEqual(72);
    expect(p.feel.tempo[1]).toBeGreaterThanOrEqual(72);
  });

  it('writes the period in G major: open at bar 4, home at bar 8, one high point in bar 6 reached by step', () => {
    const bar = (notes: TabNote[]) => {
      const out: TabNote[][] = [];
      let acc = 0;
      let cur: TabNote[] = [];
      for (const n of notes) {
        cur.push(n);
        acc += TICKS[n.duration];
        if (acc === 3840) {
          out.push(cur);
          cur = [];
          acc = 0;
        }
      }
      expect(cur, 'every bar full').toEqual([]);
      return out;
    };
    const bars = [...bar(PERIOD_QUESTION), ...bar(PERIOD_ANSWER)];
    expect(bars).toHaveLength(8);
    const all = [...PERIOD_QUESTION, ...PERIOD_ANSWER];
    const g = scaleNotes('G', 'major').map((n) => chroma(n));
    expect(midis(all).every((m) => g.includes(m % 12))).toBe(true);
    // Strong beats (1 and 3) are tones of the bar's chord.
    bars.forEach((b, i) => {
      const chords = PERIOD_CHORDS[i];
      onsets(b).forEach((at, j) => {
        if (at % 1920 !== 0) return;
        const chord = chords.length === 1 || at < 1920 ? chords[0] : chords[1];
        const pc = midiAt(struck(b)[j]) % 12;
        expect(chordNotes(chord).map((n) => chroma(n)), `bar ${i + 1} at ${at}: ${chord}`).toContain(pc);
      });
    });
    // Bar 4 ends open (on D, over D: a half cadence); bar 8 closes on G after D7.
    const last = (b: TabNote[]) => midiAt(struck(b).slice(-1)[0]);
    expect(last(bars[3])).toBe(noteToMidi('D4'));
    expect(classifyCadence(['Am', 'D'], 'G major')!.type).toBe('half');
    expect(last(bars[7]) % 12).toBe(chroma('G'));
    expect(classifyCadence(['D7', 'G'], 'G major')!.type).toBe('authentic');
    // One high point: G4, in bar 6, the only one, approached by step (E, F#, G).
    const pitches = midis(all);
    const top = Math.max(...pitches);
    expect(top).toBe(noteToMidi('G4'));
    expect(pitches.filter((m) => m === top)).toHaveLength(1);
    expect(midis(bars[5])).toEqual(['E4', 'F#4', 'G4'].map((n) => noteToMidi(n)));
    // The motif: bar 3 is bar 1 with a new last note; bar 5 is bar 1.
    expect(midis(bars[2]).slice(0, 4)).toEqual(midis(bars[0]).slice(0, 4));
    expect(midis(bars[2])[4]).not.toBe(midis(bars[0])[4]);
    expect(bars[4]).toEqual(bars[0]);
    // The motif's notes, as the card names them.
    expect(midis(bars[0]).map((m) => m % 12)).toEqual(['D', 'B', 'C', 'D', 'G'].map((n) => chroma(n)));
    // The staff labels sit on the notes the captions name.
    const q = lesson('writing-a-melody').steps[0] as { figure: { notes: Array<{ note: string; label?: string }> } };
    expect(q.figure.notes.filter((n) => n.label).map((n) => [n.note, n.label])).toEqual([['D4', 'motif'], ['D4', 'motif'], ['D4', 'open']]);
    const a = lesson('writing-a-melody').steps[2] as { figure: { notes: Array<{ note: string; label?: string }> } };
    expect(a.figure.notes.filter((n) => n.label).map((n) => [n.note, n.label])).toEqual([['D4', 'motif'], ['G4', 'peak'], ['G3', 'home']]);
  });

  it('builds the arrangement layers on the period and its chords', () => {
    expect(LAYER_MELODY).toEqual(PERIOD_QUESTION.slice(0, 9));
    // The bass: G and the open D under bar 1 (G), C and G under bar 2 (C, then G), on beats 1 and 3.
    expect(midis(LAYER_BASS)).toEqual(['G2', 'D3', 'C3', 'G2'].map((n) => noteToMidi(n)));
    expect(onsets(LAYER_BASS)).toEqual([0, 1920, 3840, 5760]);
    expect(struck(LAYER_BASS)[1]).toMatchObject({ string: 4, fret: 0 });
    const chordAt = ['G', 'G', 'C', 'G'];
    midis(LAYER_BASS).forEach((m, i) => expect(chordNotes(chordAt[i]).map((n) => chroma(n))).toContain(m % 12));
    // The full grip: a real G, the melody's first note on top, G in the bass.
    expect(voicingProblem(LAYER_FULL.symbol, LAYER_FULL.frets)).toBeNull();
    const grip = LAYER_FULL.frets.split('').map((f, i) => (f === 'x' ? null : midiAt({ string: 6 - i, fret: Number(f) })));
    const sounding = grip.filter((m): m is number => m !== null);
    expect(Math.max(...sounding)).toBe(midis(LAYER_MELODY)[0]);
    expect(Math.min(...sounding)).toBe(noteToMidi('G2'));
    // D major: I and V have open bass strings (string 4 is D, string 5 is A).
    expect(midiAt({ string: 4, fret: 0 }) % 12).toBe(chroma('D'));
    expect(midiAt({ string: 5, fret: 0 }) % 12).toBe(chroma('A'));
  });

  it('models the layers on library pieces that exist', async () => {
    const ballad = await song('st-chord-melody-1');
    expect(ballad.bars.length).toBeGreaterThanOrEqual(8);
    // Bars 1 to 8: the top note at every attack is on string 1 or 2 (the melody on top).
    for (const at of attacks(ballad, 1, 8)) {
      const top = at.all.reduce((x, y) => (y.midi > x.midi ? y : x));
      expect(top.string, `tick ${at.tick}`).toBeLessThanOrEqual(2);
    }
    const auld = await song('auld-lang-syne');
    expect(auld.key).toBe('D');
    expect(auld.tracks.map((t) => t.name)).toContain('Tune');
    expect(task('danny-boy-layers').fallback?.params).toEqual(['st-chord-melody-1', 'm1-8']);
    expect(task('shenandoah-arrange').fallback?.params).toEqual(['auld-lang-syne']);
  });

  it('takes the ragtime thumb and tune from the library\'s bar 1', async () => {
    const rag = await song('st-ragtime-blues-c');
    const bar1 = attacks(rag, 1, 1);
    const thumb = bar1.filter((a) => a.tick % 960 === 0).map((a) => a.notes.reduce((x, y) => (y.midi < x.midi ? y : x)));
    expect(thumb.map((n) => `${n.string}:${n.fret}`)).toEqual(struck(RAG_THUMB).map((n) => `${n.string}:${n.fret}`));
    const tuneAttacks = bar1.map((a) => ({ tick: a.tick, note: a.notes.find((n) => n.string <= 2) })).filter((a) => a.note);
    expect(tuneAttacks.map((a) => `${a.note!.string}:${a.note!.fret}`)).toEqual(struck(RAG_TUNE).map((n) => `${n.string}:${n.fret}`));
    expect(tuneAttacks.map((a) => a.tick)).toEqual(onsets(RAG_TUNE));
    expect(gaps(tuneAttacks.map((a) => a.tick), 3840)).toEqual(durations(RAG_TUNE));
    expect(parseRhythm({ pattern: RAG_TUNE_RHYTHM }).onsets).toEqual(onsets(RAG_TUNE));
    // The G lands on the and of 1 and is held over beat 2, while the thumb plays beat 2.
    expect(midiAt(struck(RAG_TUNE)[1])).toBe(noteToMidi('G4'));
    expect(onsets(RAG_TUNE)[1]).toBe(480);
    expect(durations(RAG_TUNE)[1]).toBe(960);
    expect(bar1.some((a) => a.tick === 960)).toBe(true);
    // The cycle: C A7 D7 G7, each root a fifth above the next.
    expect(rag.chords.filter((c) => c.bar < 8).map((c) => c.symbol.split('=')[0])).toEqual(['C', 'A7', 'D7', 'G7']);
    for (const [a, b] of [['A', 'D'], ['D', 'G'], ['G', 'C']]) expect(intervalBetween(b, a)).toBe('P5');
    expect(rag.tempo[0].bpm).toBe(100);
    // Maple Leaf Rag: Ab major down to G major is a half step.
    expect(intervalBetween('G', 'Ab')).toBe('m2');
  });

  it('takes the invention\'s subject and imitation from the library, and names its keys', async () => {
    const inv = await song('st-two-voice-invention');
    expect(inv.bars.length).toBe(24);
    const b1 = attacks(inv, 1, 1);
    expect(b1.map((a) => `${a.notes[0].string}:${a.notes[0].fret}`)).toEqual(struck(INVENTION_SUBJECT).map((n) => `${n.string}:${n.fret}`));
    expect(gaps(b1.map((a) => a.tick), 3840)).toEqual(durations(INVENTION_SUBJECT));
    // Bar 2: the lowest new note at each attack is the bass, the subject an octave lower.
    const b2 = attacks(inv, 2, 2).filter((a) => a.notes.some((n) => n.string >= 4));
    const bass = b2.map((a) => a.notes.filter((n) => n.string >= 4).reduce((x, y) => (y.midi < x.midi ? y : x)));
    expect(bass.map((n) => `${n.string}:${n.fret}`)).toEqual(struck(INVENTION_BASS).map((n) => `${n.string}:${n.fret}`));
    expect(gaps(b2.map((a) => a.tick), 3840)).toEqual(durations(INVENTION_BASS));
    expect(midis(INVENTION_BASS)).toEqual(midis(INVENTION_SUBJECT).map((m) => m - 12));
    expect(durations(INVENTION_BASS)).toEqual(durations(INVENTION_SUBJECT));
    // Keys: E minor, G major from bar 7, back to E minor at bar 11; G is E minor's relative.
    expect(inv.key).toBe('Em');
    expect(inv.bars[6].key).toBe('G');
    expect(inv.bars[10].key).toBe('Em');
    expect(relativeKey('E minor').name).toBe('G major');
    // Consonance on strong beats.
    expect(consonance('M6')).toBe('imperfect');
    for (const i of ['M2', 'm7', 'A4']) expect(consonance(i), i).toBe('dissonant');
    // The duo: in bars 1 to 8 the voices share a rhythm only in bar 3 and at the cadence, bar 8 (both on F).
    const duo = await song('st-duet-baroque');
    const rhythm = (track: number, b: number) => duo.tracks[track].measures[b].beats.filter((x) => x.notes.length).map((x) => x.start).join(',');
    const same = Array.from({ length: 8 }, (_, b) => b).filter((b) => rhythm(0, b) === rhythm(1, b)).map((b) => b + 1);
    expect(same).toEqual([3, 8]);
    expect([0, 1].map((tr) => duo.tracks[tr].measures[7].beats[0].notes[0].midi % 12)).toEqual([chroma('F'), chroma('F')]);
    expect(rhythm(1, 2)).toBe('0,960,1920');
  });

  it('takes the fugue\'s subject, answer, countersubject and third entry from the library', async () => {
    const fugueSong = await song('st-fugue-exposition');
    expect(fugueSong.tuning).toEqual(tuning('drop-d').midi);
    expect(fugueSong.tuning[0]).toBe(noteToMidi('D2'));
    expect(tuning('standard').midi[0]).toBe(noteToMidi('E2'));
    expect(fugueSong.sections.slice(0, 4).map((s) => [s.name, s.start, s.end])).toEqual([['Subject', 0, 2], ['Answer', 2, 4], ['Codetta', 4, 6], ['Third entry', 6, 8]]);
    // The subject, bars 1 and 2, a single line.
    const subj = attacks(fugueSong, 1, 2);
    expect(subj.map((a) => `${a.notes[0].string}:${a.notes[0].fret}`)).toEqual(struck(FUGUE_SUBJECT).map((n) => `${n.string}:${n.fret}`));
    expect(gaps(subj.map((a) => a.tick), 7680)).toEqual(durations(FUGUE_SUBJECT));
    // The answer: the lowest new note at each attack of bars 3 and 4; the subject a fifth higher in the key, an octave down.
    const ans = attacks(fugueSong, 3, 4);
    expect(ans.map((a) => a.notes.reduce((x, y) => (y.midi < x.midi ? y : x))).map((n) => `${n.string}:${n.fret}`)).toEqual(struck(FUGUE_ANSWER).map((n) => `${n.string}:${n.fret}`));
    expect(gaps(ans.map((a) => a.tick), 7680)).toEqual(durations(FUGUE_ANSWER));
    expect(midis(FUGUE_ANSWER)).toEqual(midis(FUGUE_SUBJECT).map((m) => m - 5));
    expect(durations(FUGUE_ANSWER)).toEqual(durations(FUGUE_SUBJECT));
    const spelled = (notes: TabNote[], key: string) => struck(notes).map((n) => parseNote(noteAt(n, { context: { key } }))!.pcName);
    expect(spelled(FUGUE_SUBJECT, 'D minor')).toEqual(['D', 'D', 'E', 'F', 'F', 'G', 'A', 'Bb', 'A', 'G', 'F', 'E', 'C#']);
    expect(spelled(FUGUE_ANSWER, 'A minor')).toEqual(['A', 'A', 'B', 'C', 'C', 'D', 'E', 'F', 'E', 'D', 'C', 'B', 'G#']);
    // The countersubject: the highest note sounding on each quarter beat of bars 3 and 4.
    const cs = ans.filter((a) => a.tick % 960 === 0).map((a) => Math.max(...a.all.map((n) => n.midi)));
    expect(cs).toEqual(midis(FUGUE_COUNTERSUBJECT));
    expect(durations(FUGUE_COUNTERSUBJECT).every((d) => d === 960)).toBe(true);
    // The third entry: the lowest note at each attack of bars 7 and 8 (drop D), the subject two octaves down.
    const third = attacks(fugueSong, 7, 8);
    expect(third.map((a) => a.notes.reduce((x, y) => (y.midi < x.midi ? y : x))).map((n) => `${n.string}:${n.fret}`)).toEqual(struck(FUGUE_THIRD_ENTRY).map((n) => `${n.string}:${n.fret}`));
    // ... except its last note, the leading note, an octave higher: C#2 lies below the open low D.
    expect(midis(FUGUE_THIRD_ENTRY, 'drop-d')).toEqual(midis(FUGUE_SUBJECT).map((m, i, all) => m - (i === all.length - 1 ? 12 : 24)));
    expect(midis(FUGUE_SUBJECT).slice(-1)[0] - 24).toBeLessThan(tuning('drop-d').midi[0]);
    expect(durations(FUGUE_THIRD_ENTRY)).toEqual(durations(FUGUE_SUBJECT));
    expect(midis(FUGUE_THIRD_ENTRY, 'drop-d')[0]).toBe(noteToMidi('D2'));
    // Over it, the countersubject a fifth lower: on every quarter beat its pitch is sounding.
    const thirdBeats = third.filter((a) => a.tick % 960 === 0);
    expect(thirdBeats).toHaveLength(8);
    thirdBeats.forEach((a, i) => expect(a.all.map((n) => n.midi), `beat ${i + 1}`).toContain(midis(FUGUE_COUNTERSUBJECT)[i] - 7));
    expect(fugueSong.tempo[0].bpm).toBe(60);
    expect(task('fugue-exposition-whole').params).toEqual(['st-fugue-exposition', 'm1-8', 't75']);
  });

  it('tunes DADGAD and plays its scale, its F sharps and the Air as the cards say', async () => {
    const d = tuning('dadgad');
    expect(d.notes).toEqual([...DADGAD_OPEN]);
    expect(retuneSteps('dadgad').filter((s) => s.semitones !== 0).map((s) => [s.string, s.semitones])).toEqual([[6, -2], [2, -2], [1, -2]]);
    // The open chord: D, A and G, no third.
    const pcs = new Set(DADGAD_OPEN.map((n) => chroma(n)));
    expect([...pcs].sort((a, b) => a - b)).toEqual(['D', 'G', 'A'].map((n) => chroma(n)).sort((a, b) => a - b));
    expect(pcs.has(chroma('F#'))).toBe(false);
    expect(pcs.has(chroma('F'))).toBe(false);
    // F sharp from the open strings to fret 5: fret 4 of the three D strings.
    expect(positionsForPitchClass('F#', { tuning: 'dadgad', minFret: 0, maxFret: 5 }).map((p) => `${p.string}:${p.fret}`).sort()).toEqual(['1:4', '4:4', '6:4']);
    // Strings 5 and 2: both A, an octave apart.
    expect(midiAt({ string: 2, fret: 0 }, { tuning: 'dadgad' }) - midiAt({ string: 5, fret: 0 }, { tuning: 'dadgad' })).toBe(12);
    // The scale phrase: D major from D3 to D4, three open strings; the tap version has 11 places.
    expect(midis(DADGAD_SCALE, 'dadgad')).toEqual(['D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C#4', 'D4'].map((n) => noteToMidi(n)));
    expect(struck(DADGAD_SCALE).filter((n) => n.fret === 0)).toHaveLength(2);
    expect(scalePositions('D', 'major', { tuning: 'dadgad', minFret: 0, maxFret: 5 }).filter((p) => [4, 3, 2].includes(p.string))).toHaveLength(11);
    // The Air: its tune in bars 1 and 2 is the top note of each attack; bar 1 opens on open strings 6 and 2.
    const air = await song('st-dadgad-air');
    expect(air.tuning).toEqual(d.midi);
    const a = attacks(air, 1, 2);
    const top = a.map((x) => x.all.reduce((p, q) => (q.midi > p.midi ? q : p)));
    expect(top.map((n) => `${n.string}:${n.fret}`)).toEqual(struck(DADGAD_TUNE).map((n) => `${n.string}:${n.fret}`));
    expect(gaps(a.map((x) => x.tick), 5760)).toEqual(durations(DADGAD_TUNE));
    expect(a[0].notes.map((n) => `${n.string}:${n.fret}`).sort()).toEqual(['2:0', '6:0']);
    expect(air.tempo[0].bpm).toBe(76);
  });

  it('names Player tempos that add up, loops bars that exist, and gives missing songs a fallback', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
    for (const s of tasks(unit)) {
      for (const target of [s, ...(s.fallback ? [s.fallback] : [])]) {
        const id = taskSong(target);
        if (!id || !songEntry(id)) continue;
        const bars = (await song(id)).bars.length;
        for (const p of target.params ?? []) {
          const m = p.match(/^m(\d+)-(\d+)$/);
          if (m) expect(Number(m[2]), `${s.id}: ${p} in ${bars} bars`).toBeLessThanOrEqual(bars);
        }
      }
      const id = taskSong(s);
      if (id && !songEntry(id)) expect(s.fallback, `${s.id}: ${id} is missing`).toBeTruthy();
    }
  });

  it('swaps the pieces that need a printed edition, because they really are missing', () => {
    for (const id of ['the-entertainer', 'maple-leaf-rag', 'bach-bourree-e-minor']) expect(songEntry(id), id).toBeFalsy();
    for (const id of ['st-ragtime-blues-c', 'st-duet-baroque', 'st-two-voice-invention', 'st-fugue-exposition', 'st-dadgad-air', 'st-chord-melody-1', 'auld-lang-syne']) expect(songEntry(id), id).toBeTruthy();
    const texts = allStrings(unit).join('\n');
    expect(texts).toMatch(/Scan & Import/);
    expect(texts).toMatch(/Paste tab or chords/);
  });

  it('uses unique fact ids, each with the unit prefix', () => {
    const ids = unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^comp-/);
  });

  // ── what the independent review fixed (keep these honest) ─────────────────────────────────────

  it('retunes to DADGAD before anything is played in it', () => {
    const steps = lesson('alternate-tunings').steps;
    const retune = steps.findIndex((x) => (x as { id?: string }).id === 'tune-dadgad');
    const firstPlayed = steps.findIndex((x) => 'type' in x && (x.type === 'play-phrase' || x.type === 'play-note') && (x as { tuning?: string }).tuning === 'dadgad');
    expect(retune).toBeGreaterThan(-1);
    expect(firstPlayed).toBeGreaterThan(retune);
    // In standard tuning string 2 frets 4 and 5 are D# and E, not the C# and D of the scale.
    expect(midis(DADGAD_SCALE.slice(-2), 'standard')).not.toEqual(midis(DADGAD_SCALE.slice(-2), 'dadgad'));
  });

  it('hums the subject only against the countersubject that is made to sound with it (bars 7 and 8)', () => {
    // The subject's note on each quarter beat, against each version of the countersubject.
    const on = onsets(FUGUE_SUBJECT);
    const beatNote = (i: number) => midis(FUGUE_SUBJECT)[on.filter((t) => t <= i * 960).length - 1];
    const cs = midis(FUGUE_COUNTERSUBJECT);
    // Two-voice consonances by size: unisons and octaves, thirds, fifths, sixths (a fourth counts as dissonant).
    const kinds = (shift: number) => cs.map((c, i) => ([0, 3, 4, 7, 8, 9].includes(Math.abs(beatNote(i) - (c - shift)) % 12) ? 'consonant' : 'dissonant'));
    // As bars 3 and 4 have it (made for the answer), it clashes with the subject; a fifth lower, it fits on every beat.
    expect(kinds(0)).toContain('dissonant');
    expect(kinds(7).every((k) => k === 'consonant')).toBe(true);
    const away = lesson('fugue').steps.find((x) => (x as { title?: string }).title === 'Away from the guitar') as { body: RichText };
    expect(plain(away.body)).toMatch(/bars 7 and 8/);
    expect(plain(away.body)).toMatch(/a fifth lower/);
  });

  it('asks for the third entry alone from the cards, since the Player cannot isolate one voice of bars 7 and 8', async () => {
    const fugueSong = await song('st-fugue-exposition');
    const third = attacks(fugueSong, 7, 8);
    expect(third.some((a) => a.all.length > 1)).toBe(true);
    expect(plain(task('fugue-entries').body)).toMatch(/third entry alone: from my cards/);
    const cardFigures = lesson('fugue').steps.map((x) => (x as { figure?: { notes?: unknown } }).figure?.notes);
    expect(cardFigures).toContain(FUGUE_THIRD_ENTRY);
  });

  it('points to More colours, where the builder keeps the borrowed chords', () => {
    const plainKey = palette({ tonic: 'C', mode: 'major', sevenths: true, advanced: false });
    const more = palette({ tonic: 'C', mode: 'major', sevenths: true, advanced: true });
    const symbols = (g: { symbol: string }[]) => g.map((c) => c.symbol);
    expect(symbols(plainKey.diatonic)).toContain('G7');
    expect(symbols(plainKey.borrowed)).toEqual([]);
    for (const c of ['Fm', 'Ab', 'Bb']) expect(symbols(more.borrowed), c).toContain(c);
    expect(plain(task('eight-bars-in-c').body)).toMatch(/More colours/);
    expect(plain(task('eight-bars-in-c').body)).toMatch(/Sevenths/);
  });

  it('greets the invention as a piece the learner already played in the repertoire unit', () => {
    expect(repertoireUnit.milestone?.song).toBe('st-two-voice-invention');
    const card = lesson('counterpoint').steps.find((x) => (x as { title?: string }).title === 'The subject') as { body: RichText };
    expect(plain(card.body)).toMatch(/opened your recital/);
  });
});

