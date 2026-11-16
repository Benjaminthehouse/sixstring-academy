/**
 * Cross-checks for Dev's unit 10 (Know the neck, read the music) against the engines and the song
 * library: every "string N, fret M ({n:X})" the text names is that note; the landmarks, octave shapes
 * and "every C / every F#" lists are what the neck has; the staff anchors sit where the cards say;
 * the staff figures are the tab they come from; the study bars and the Minuet's opening and shift
 * are the library's; the tools the tasks open exist; every Player tempo is the song's tempo times
 * the task's percentage. Run with `npx vitest run src/content/teachers/dev/dev-neck-and-reading.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, pitchClassAt, positionsForNote } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chroma, getKey, staffPosition } from '@/core/theory';
import { DRILLS as FRETBOARD_DRILLS } from '@/features/fretboard/core/drills';
import { READ_LEVELS } from '@/features/rhythm/core/generate';
import { estimateLessonSeconds, formatProblems, validateCourse, type StaffFigure, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { LOW_STRINGS, MINUET_BARS_1_4, READ_C_BARS_1_4, READ_G_BARS_1_4, SECOND_POSITION_BAR_1, TOP_STRINGS_C, staffOf } from './dev-neck-and-reading';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

const CODES: Record<number, string> = { 3840: 'w', 2880: 'h.', 1920: 'h', 1440: 'q.', 960: 'q', 720: 'e.', 480: 'e', 240: 's' };

/** Some bars of a song's lead track as tab notes (the first note of each beat). */
async function leadBars(id: string, from: number, to: number): Promise<TabNote[]> {
  const s = await song(id);
  const lead = s.tracks.find((t) => t.role === 'lead')!;
  const out: TabNote[] = [];
  for (let i = from - 1; i < to; i++) {
    for (const b of lead.measures[i].beats) {
      if (b.notes.length === 0) out.push({ rest: true, duration: CODES[b.duration] ?? String(b.duration) });
      else out.push({ string: b.notes[0].string, fret: b.notes[0].fret, duration: CODES[b.duration] ?? String(b.duration) });
    }
  }
  return out;
}

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameAt = (n: TabNote) => ('rest' in n ? '-' : PCS[pitchClassAt({ string: n.string, fret: n.fret })]);
const at = (p: { string: number; fret: number }) => `${p.string}:${p.fret}`;

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
  for (const m of text.matchAll(/open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  if (count < 40) out.push(`only ${count} claims found: the patterns no longer match the text`);
  return out;
}

const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];
const task = (id: string) => tasks.find((x) => x.id === id)!;
const lesson = (id: string) => unit.lessons.find((l) => l.id === id)!;
const stepText = (lessonId: string) => JSON.stringify(lesson(lessonId));

/** "N % (M BPM)" and "M BPM" in a Player task's words, against the song's tempo and the task's own. */
async function playerBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const step of l.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id || !songEntry(id)) continue;
      const bpm = (await song(id)).tempo[0].bpm;
      const pct = Number((step.params!.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
      const wait = step.params!.includes('wait');
      const text = plain(step.body);
      const where = `${l.id} > ${step.id}`;
      const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
      for (const m of percents) if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${(bpm * Number(m[1])) / 100}`);
      if (wait) continue; // wait mode follows the player, whatever the tempo
      const rest = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '');
      const plainBpm = rest.match(/(\d+) BPM/);
      if (!percents.some((m) => Number(m[1]) === pct)) {
        if (!plainBpm) out.push(`${where}: never says the tempo it opens at`);
        else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
      }
    }
  }
  return out;
}

const course = compileCourse(courseMeta('dev'), [unit]);

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Dev unit 10: know the neck, read the music', () => {
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

  it('pairs every fret in the text with the note that is there', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
  });

  it('puts the landmarks of strings 6 and 5 where the text does, on the inlay dots', () => {
    expect([PCS[pitchClassAt({ string: 6, fret: 5 })], PCS[pitchClassAt({ string: 6, fret: 12 })], PCS[pitchClassAt({ string: 5, fret: 5 })], PCS[pitchClassAt({ string: 5, fret: 12 })]]).toEqual(['A', 'E', 'D', 'A']);
    // Fret 12 is the open string an octave up; string 6, fret 5 is the open string 5.
    expect(midiAt({ string: 6, fret: 12 }) - midiAt({ string: 6, fret: 0 })).toBe(12);
    expect(midiAt({ string: 6, fret: 5 })).toBe(midiAt({ string: 5, fret: 0 }));
    // The two Cs the learner plays are one pitch, C3.
    expect([midiAt({ string: 6, fret: 8 }), midiAt({ string: 5, fret: 3 })]).toEqual([48, 48]);
    // Fret 6 of string 6 is between A and B; fret 4 between G and A.
    expect([PCS[pitchClassAt({ string: 6, fret: 6 })], PCS[pitchClassAt({ string: 6, fret: 4 })]]).toEqual(['A#', 'G#']);
    // The first card's neck: every natural bright, every sharp faded, frets 0 to 12 on strings 6 and 5.
    const neck = (lesson('notes-on-6-and-5').steps[0] as { figure: { dots: Array<{ string: number; fret: number; note: string; role?: string }> } }).figure.dots;
    expect(neck.length).toBe(26);
    for (const d of neck) expect(d.role === 'ghost', at(d)).toBe(d.note.replace(/\d/g, '').length > 1);
  });

  it('teaches octave shapes that really are octaves', () => {
    const octave = (a: [number, number], b: [number, number]) => midiAt({ string: b[0], fret: b[1] }) - midiAt({ string: a[0], fret: a[1] });
    expect(octave([6, 3], [4, 5])).toBe(12);
    expect(octave([5, 3], [3, 5])).toBe(12);
    expect(octave([4, 2], [2, 5])).toBe(12);
    expect(octave([3, 2], [1, 5])).toBe(12);
    expect(octave([6, 5], [4, 7])).toBe(12);
    expect(octave([4, 5], [2, 8])).toBe(12);
    // Strings 3 and 2 are a fret closer than the other pairs: four half steps instead of five.
    expect([midiAt({ string: 2, fret: 0 }) - midiAt({ string: 3, fret: 0 }), midiAt({ string: 3, fret: 0 }) - midiAt({ string: 4, fret: 0 })]).toEqual([4, 5]);
    // String 1 is string 6 two octaves up, fret for fret.
    for (let f = 0; f <= 12; f++) expect(midiAt({ string: 1, fret: f }) - midiAt({ string: 6, fret: f })).toBe(24);
    // The tempting wrong option: one fret short across the B string is F#.
    expect(PCS[pitchClassAt({ string: 2, fret: 7 })]).toBe('F#');
  });

  it('lists every C and every F# from the nut to fret 12 exactly as the neck has them', () => {
    const every = (n: string) => positionsForNote(n, { minFret: 0, maxFret: 12 }).map(at).sort();
    expect(every('C')).toEqual(['1:8', '2:1', '3:5', '4:10', '5:3', '6:8'].sort());
    expect(every('F#')).toEqual(['1:2', '2:7', '3:11', '4:4', '5:9', '6:2'].sort());
    const text = stepText('notes-everywhere');
    expect(text).toContain('string 6, fret 8; string 5, fret 3; string 4, fret 10; string 3, fret 5; string 2, fret 1; string 1, fret 8');
    expect(text).toContain('string 6, fret 2; string 5, fret 9; string 4, fret 4; string 3, fret 11; string 2, fret 7; string 1, fret 2');
    // The play-note alternatives have one answer each on their string.
    expect(positionsForNote('G3', { minFret: 0, maxFret: 12 }).filter((p) => p.string === 4).map(at)).toEqual(['4:5']);
    expect(positionsForNote('E4', { minFret: 0, maxFret: 12 }).filter((p) => p.string === 2).map(at)).toEqual(['2:5']);
    expect(positionsForNote('C3', { minFret: 0, maxFret: 12 }).filter((p) => p.string === 6).map(at)).toEqual(['6:8']);
  });

  it('opens the technique exercise and fretboard drills the tasks describe', () => {
    const ex = getExercise('tech-octaves')!;
    expect(ex.title).toBe('Octave Shapes with Muting');
    expect(ex.steps.join(' ')).toContain('G major scale in octaves on strings 6 and 4');
    expect(plain(task('octaves-muted').body)).toContain('G major scale in octaves on strings 6 and 4');
    const drill = (id: string) => FRETBOARD_DRILLS.find((d) => d.id === id);
    expect(drill(task('sprint-6-5').params![1])!.title).toBe('One-minute sprint');
    expect(drill(task('find-every-one').params![1])!.title).toBe('Find every one');
    // Rhythm's Read and tap: level 5 is dotted notes, and Ties is the level after it.
    expect(task('read-dots-ties').params).toEqual(['read', '5']);
    expect(READ_LEVELS.find((l) => l.id === 5)!.title).toBe('Dotted notes');
    expect(READ_LEVELS.find((l) => l.id === 6)!.title).toBe('Ties');
  });

  it('puts the open strings on the staff where the cards say', () => {
    // Guitar notation: sounding pitch drawn an octave up. 0 = bottom line, 2 = second line, 4 = middle, 7 = top space.
    expect(staffPosition('G3').position).toBe(2);
    expect(staffPosition('B3').position).toBe(4);
    expect(staffPosition('E4').position).toBe(7);
    expect(staffPosition('E3').position).toBe(0); // the bottom line: string 4, fret 2
    expect(midiAt({ string: 4, fret: 2 })).toBe(52);
    // String 2, fret 1 is C4, written in the third space; the D of the study is the fourth line; G4 the space above.
    expect(midiAt({ string: 2, fret: 1 })).toBe(60);
    expect(staffPosition('C4').position).toBe(5);
    expect(staffPosition('D4').position).toBe(6);
    expect(staffPosition('F4').position).toBe(8);
    expect(staffPosition('G4').position).toBe(9);
    // Below the staff: open D just under it, open A on the second ledger line, open E below three.
    expect(staffPosition('D3').position).toBe(-1);
    const a = staffPosition('A2');
    expect([a.position, a.onLine, a.ledgerLines]).toEqual([-4, true, -2]);
    const e = staffPosition('E2');
    expect([e.position, e.ledgerLines]).toEqual([-7, -3]);
    // In G major the F# of string 4, fret 4 is written in the first space, the one of string 1, fret 2 on the top line.
    expect(staffPosition('F#3').position).toBe(1);
    expect(staffPosition('F#4').position).toBe(8);
    expect(midiAt({ string: 1, fret: 7 })).toBe(71); // the B that opens the minuet's second half, above the staff
    expect(staffPosition('B4').ledgerLines).toBe(1);
  });

  it('spells the key signatures the lessons teach', () => {
    expect(getKey('G major')!.signature.accidentals).toEqual(['F#']);
    expect(getKey('D major')!.signature.accidentals).toEqual(['F#', 'C#']);
    expect(getKey('A major')!.signature.accidentals).toEqual(['F#', 'C#', 'G#']);
    expect(getKey('E minor')!.signature.accidentals).toEqual(['F#']);
    expect(positionsForNote('C#', { minFret: 0, maxFret: 4 }).map(at).sort()).toEqual(['2:2', '5:4']);
    expect(positionsForNote('G#', { minFret: 0, maxFret: 4 }).filter((p) => p.string === 3).map(at)).toEqual(['3:1']);
  });

  it('draws each staff figure as exactly the tab it comes from', () => {
    const figure = (lessonId: string, title: string) => (lesson(lessonId).steps.find((s) => (s as { title?: string }).title === title) as { figure: StaffFigure }).figure;
    const notes = (f: StaffFigure) => f.notes.map((n) => (typeof n === 'string' ? n : n.note));
    expect(notes(figure('reading-strings-1-to-3', 'Why read notation'))).toEqual(['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4']);
    expect(TOP_STRINGS_C.map(nameAt).join(' ')).toBe('G A B C D E F G');
    expect(notes(figure('reading-all-six-strings', 'Below the staff'))).toEqual(['E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3']);
    expect(LOW_STRINGS.every((n) => !('rest' in n) && n.string >= 4)).toBe(true);
    expect(notes(figure('reading-strings-1-to-3', "Tonight's study, bars 1 to 4"))).toEqual(staffOf(READ_C_BARS_1_4, 'C major').map((n) => n.note));
    expect(notes(figure('reading-all-six-strings', 'Read ahead'))).toEqual(staffOf(READ_G_BARS_1_4, 'G major').map((n) => n.note));
    expect(notes(figure('read-a-real-piece', 'A real piece'))).toEqual(['D4', 'G3', 'A3', 'B3', 'C4', 'D4', 'G3', 'G3']);
    // The G study's F# is spelled F#, not Gb.
    expect(staffOf(READ_G_BARS_1_4, 'G major').map((n) => n.note)).toContain('F#3');
  });

  it('quotes the reading studies and the minuet as the library has them', async () => {
    expect(READ_C_BARS_1_4).toEqual(await leadBars('st-read-first-c', 1, 4));
    expect(READ_C_BARS_1_4.map(nameAt).join(' ')).toBe('E D E F G E F E D C B G');
    expect(stepText('reading-strings-1-to-3')).toContain('{n:E} {n:D} {n:E} {n:F}, {n:G} {n:E}, {n:F} {n:E} {n:D} {n:C}, {n:B} {n:G}');
    expect(READ_G_BARS_1_4).toEqual(await leadBars('st-read-first-g', 1, 4));
    expect(SECOND_POSITION_BAR_1).toEqual(await leadBars('st-read-second-position', 1, 1));
    expect(SECOND_POSITION_BAR_1.map(nameAt).join(' ')).toBe('A B C# E C#');
    expect(MINUET_BARS_1_4).toEqual(await leadBars('minuet-in-g-melody', 1, 4));
    expect(MINUET_BARS_1_4.map(nameAt).join(' ')).toBe('D G A B C D G G E C D E F# G G G');
    // The ties of the sharps study are in bars 3 and 11; its two halves are D and A major.
    const sharps = await song('st-read-first-sharps');
    const lead = sharps.tracks.find((t) => t.role === 'lead')!;
    // A tie is stored on the note it reaches, so the tied notes arrive in bars 4 and 12.
    const tied = lead.measures.map((m, i) => (m.beats.some((b) => b.notes.some((n) => n.tie)) ? i + 1 : 0)).filter(Boolean);
    expect(tied).toEqual([4, 12]);
    expect(sharps.tempo[0].bpm).toBe(72);
  });

  it('describes the minuet\'s form and its one shift as the library plays them', async () => {
    const s = await song('minuet-in-g-melody');
    const lead = s.tracks.find((t) => t.role === 'lead')!;
    expect(lead.measures.length).toBe(32);
    expect(s.bars[0].time).toMatchObject({ numerator: 3, denominator: 4 });
    // Bar 16 is the long open G that ends the first half; bars 17 and 18 open with B, G, A, B, G | A.
    expect(lead.measures[15].beats.map((b) => b.notes.map(at).join('+'))).toEqual(['3:0']);
    expect(lead.measures[16].beats.map((b) => b.notes.map(at).join('+'))).toEqual(['1:7', '2:8', '1:5', '1:7', '2:8']);
    expect(lead.measures[17].beats[0].notes.map(at)).toEqual(['1:5']);
    // After bar 18 the hand is back in first position for the rest of the piece.
    expect(lead.measures.slice(18).flatMap((m) => m.beats.flatMap((b) => b.notes)).every((n) => n.fret <= 4)).toBe(true);
    expect(lead.measures.slice(0, 16).flatMap((m) => m.beats.flatMap((b) => b.notes)).every((n) => n.fret <= 4)).toBe(true);
    // Bar 3 has the F on the top line, played F#.
    expect(lead.measures[2].beats.flatMap((b) => b.notes).map(at)).toContain('1:2');
  });

  it('falls back from the Sugar Plum Fairy to a staccato E minor theme with its chromatic notes', async () => {
    const t = task('sugar-plum');
    expect(songEntry('dance-of-the-sugar-plum-fairy') ? 'present' : t.fallback?.params?.[0]).toBeTruthy();
    const fb = t.fallback!;
    expect(fb.params).toEqual(['hall-of-the-mountain-king', 'm1-4', 'wait']);
    const s = await song('hall-of-the-mountain-king');
    expect(songEntry('hall-of-the-mountain-king')!.key).toBe('E minor');
    const names = (await leadBars('hall-of-the-mountain-king', 1, 4)).map(nameAt);
    expect(names).toContain('A#');
    expect(names).toContain('F');
    expect(s.tempo[0].bpm).toBe(60);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await playerBpmProblems(unit)).toEqual([]);
  });
});
