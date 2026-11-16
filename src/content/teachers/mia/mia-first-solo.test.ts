/**
 * Cross-checks for Mia's unit 11 (Your first scale and your first solo) against the engines and the
 * song library: box 1 of A minor pentatonic and the open E minor box are the guitar engine's own
 * patterns (frets, notes and fingers), the roots and chord tones each exercise asks for, the bars of
 * the Pentatonic Box 1 Lick the lesson quotes, the endings of the ear phrases, Mia's phrases and the
 * performance staying inside the box and landing where the text says, the jam tracks, and the BPM of
 * every Player task. Run with `npx vitest run src/content/teachers/mia/mia-first-solo.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { midiAt, noteAt, scalePatterns } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse, type TabNote } from '@/lessons';
import { compileLesson, isTaskStep, loadTeacherCourse, taskSong } from '../index';
import type { RichText, TeacherLesson, TeacherUnit } from '../types';
import unit from './mia-first-solo';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

type Struck = Extract<TabNote, { fret: number }>;
const struck = (notes: readonly TabNote[]): Struck[] => notes.filter((n): n is Struck => !('rest' in n));
const lesson = (id: string): TeacherLesson => unit.lessons.find((l) => l.id === id)!;
const stepsOf = <T>(l: string, type: string) => lesson(l).steps.filter((s) => (s as { type?: string }).type === type) as T[];
const cardFigure = <T>(l: string, title: string) => (lesson(l).steps.find((s) => (s as { title?: string }).title === title) as unknown as { figure: T }).figure;
const at = (string: number, fret: number) => noteAt({ string, fret }, { octave: false });
const pos = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;
const notesOf = (text: string) => [...text.matchAll(/\{n:([^}]+)\}/g)].map((m) => m[1]);

/** Problems with the tempos the Player tasks name (see mia-power-chords.test.ts); wait mode needs none. */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const step of l.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id || !songEntry(id) || step.params?.includes('wait')) continue;
      const bpm = (await song(id)).tempo[0].bpm;
      const pctParam = (step.params ?? []).find((p) => /^t\d+$/.test(p));
      const pct = pctParam ? Number(pctParam.slice(1)) : 100;
      let text = plain(step.body);
      for (const m of text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)) {
        const want = (bpm * Number(m[1])) / 100;
        if (Math.abs(want - Number(m[2])) > 1) out.push(`${l.id} > ${step.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
      }
      text = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '');
      const first = text.match(/(\d+) BPM/);
      if (!first) {
        out.push(`${l.id} > ${step.id}: names no BPM`);
        continue;
      }
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    }
  }
  return out;
}

const box1 = scalePatterns('A', 'minor-pentatonic')[0];
const openE = scalePatterns('E', 'minor-pentatonic', { allOctaves: true });

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Mia unit 11: Your first scale and your first solo', () => {
  it('passes the lesson engine with no error and no warning, in the whole course', async () => {
    const tc = await loadTeacherCourse('mia');
    const problems = validateCourse(tc.course).filter((p) => p.unit === unit.id);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(120);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(310);
    }
  });

  it('teaches box 1 exactly as the guitar engine lays it out: notes, frets and fingers', () => {
    expect(scaleNotes('A', 'minor-pentatonic')).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect([box1.id, box1.minFret, box1.maxFret]).toEqual(['box-1', 5, 8]);
    const fig = cardFigure<{ dots: Array<{ string: number; fret: number; note: string; finger: number }> }>('a-minor-pentatonic', 'One finger per fret');
    expect(fig.dots.map((d) => `${pos(d)} ${d.note} f${d.finger}`)).toEqual(box1.notes.map((n) => `${pos(n)} ${noteAt(n)} f${n.finger}`));
    // The plan's rule: finger 1 on fret 5, finger 3 on fret 7 (strings 5, 4, 3), finger 4 on fret 8 (strings 6, 2, 1).
    for (const n of box1.notes) expect(n.finger, pos(n)).toBe(n.fret === 5 ? 1 : n.fret === 7 ? 3 : 4);
    expect(box1.notes.filter((n) => n.fret === 7).map((n) => n.string)).toEqual([5, 4, 3]);
    expect(box1.notes.filter((n) => n.fret === 8).map((n) => n.string)).toEqual([6, 2, 1]);
    // Up and down: the two play steps run the engine's box in order, then reversed.
    const [up, down] = stepsOf<{ notes: TabNote[] }>('a-minor-pentatonic', 'play-phrase');
    expect(struck(up.notes).map(pos)).toEqual(box1.notes.map(pos));
    expect(struck(down.notes).map(pos)).toEqual([...box1.notes].reverse().map(pos));
    // The order alternative of the way down names each string's pair, string 1 first.
    const tiles = (down as unknown as { alternative: { tiles: string[] } }).alternative.tiles.map(notesOf);
    expect(tiles).toEqual([1, 2, 3, 4, 5, 6].map((s) => [...box1.notes].reverse().filter((n) => n.string === s).map((n) => at(n.string, n.fret))));
  });

  it('finds the three roots of box 1 where the lesson says', () => {
    const roots = box1.notes.filter((n) => at(n.string, n.fret) === 'A').map(pos);
    expect(roots).toEqual(['6:5', '4:7', '1:5']);
    expect(at(6, 5)).toBe('A');
  });

  it('uses the notes of Am7 as landing notes, and D as the open one', () => {
    expect(chordNotes('Am7')).toEqual(['A', 'C', 'E', 'G']);
    const outside = scaleNotes('A', 'minor-pentatonic').filter((n) => !chordNotes('Am7').includes(n));
    expect(outside).toEqual(['D']);
    // The last exercise: chord tones on strings 2 and 1 of the box.
    const top = box1.notes.filter((n) => n.string <= 2).map((n) => at(n.string, n.fret));
    expect(top.every((n) => chordNotes('Am7').includes(n))).toBe(true);
  });

  it('quotes bars 1 to 4 of the Pentatonic Box 1 Lick as the library has them', async () => {
    const lick = await song('st-pent-box-1');
    expect(lick.tempo[0].bpm).toBe(84);
    const fromLibrary = lick.tracks[0].measures.slice(0, 4).flatMap((m) =>
      m.beats.map((b) => (b.notes.length ? `${b.notes[0].string}:${b.notes[0].fret}/${b.duration}` : `r/${b.duration}`)),
    );
    const card = cardFigure<{ notes: TabNote[] }>('box-1-licks', 'An ask and an answer');
    const ticks: Record<string, number> = { q: 960, e: 480, h: 1920 };
    expect(card.notes.map((n) => ('rest' in n ? `r/${ticks[n.duration]}` : `${pos(n)}/${ticks[n.duration]}`))).toEqual(fromLibrary);
    // The ask stops on G (string 2 fret 8), the answer on A (string 4 fret 7).
    const ask = struck(card.notes.slice(0, 12));
    const answer = struck(card.notes.slice(12));
    expect(at(ask[ask.length - 1].string, ask[ask.length - 1].fret)).toBe('G');
    expect(pos(answer[answer.length - 1])).toBe('4:7');
    expect(at(4, 7)).toBe('A');
    // The hammer-on is in bar 6: string 3 fret 5 (C) to fret 7 (D).
    const bar6 = lick.tracks[0].measures[5].beats.flatMap((b) => b.notes);
    const hammer = bar6.findIndex((n) => n.legato === 'hammer');
    expect(hammer).toBeGreaterThan(0);
    expect([pos(bar6[hammer - 1]), pos(bar6[hammer])]).toEqual(['3:5', '3:7']);
    expect([at(3, 5), at(3, 7)]).toEqual(['C', 'D']);
    // Every note of the lick is in box 1.
    const inBox = new Set(box1.notes.map(pos));
    for (const m of lick.tracks[0].measures) for (const b of m.beats) for (const n of b.notes) expect(inBox.has(pos(n)), pos(n)).toBe(true);
  });

  it('ends the ear phrases where their answers say: on A (finished) and on D (open)', () => {
    const ear = stepsOf<{ sound: { notes: TabNote[] } }>('box-1-licks', 'listen-choice');
    const last = (notes: TabNote[]) => struck(notes)[struck(notes).length - 1];
    expect(at(last(ear[0].sound.notes).string, last(ear[0].sound.notes).fret)).toBe('A');
    expect(at(last(ear[1].sound.notes).string, last(ear[1].sound.notes).fret)).toBe('D');
  });

  it('keeps Mia\'s phrases and the performance inside the box, landing where the text says', () => {
    const inBox = new Set(box1.notes.map(pos));
    // First improvisation: only C, D and E (string 3 frets 5 and 7, string 2 fret 5).
    const mia = stepsOf<{ notes: TabNote[] }>('first-improvisation', 'play-phrase')[0];
    expect([...new Set(struck(mia.notes).map(pos))].sort()).toEqual(['2:5', '3:5', '3:7']);
    expect([...new Set(struck(mia.notes).map((n) => at(n.string, n.fret)))].sort()).toEqual(['C', 'D', 'E']);
    // Over the blues: the landing phrase ends on A at string 4 fret 7.
    const landing = stepsOf<{ notes: TabNote[] }>('pentatonic-over-the-blues', 'play-phrase')[0];
    expect(pos(struck(landing.notes).slice(-1)[0])).toBe('4:7');
    for (const n of struck(landing.notes)) expect(inBox.has(pos(n)), pos(n)).toBe(true);
    // The show: inside the box, three bars, landing on A at string 4 fret 7; its order tiles are its bars.
    const show = lesson('blues-solo-milestone').steps.find((s) => (s as { id?: string }).id === 'show') as { notes: TabNote[]; alternative: { tiles: string[] } };
    for (const n of struck(show.notes)) expect(inBox.has(pos(n)), pos(n)).toBe(true);
    expect(pos(struck(show.notes).slice(-1)[0])).toBe('4:7');
    const beats: Record<string, number> = { q: 1, h: 2, w: 4, e: 0.5 };
    expect(show.notes.reduce((t, n) => t + beats[n.duration], 0)).toBe(12);
    expect(show.alternative.tiles.flatMap(notesOf)).toEqual(struck(show.notes).map((n) => at(n.string, n.fret)));
  });

  it('explains that the lick\'s ask stops on a chord note that is not home, so the rule and the lick agree', async () => {
    // The lick's own asks stop on G and E: notes of Am7. So "finished" cannot simply mean "a chord
    // note": the lesson says A, home, is the most finished, and that G is a chord note left open.
    const lick = await song('st-pent-box-1');
    const lastOf = (bar: number) => lick.tracks[0].measures[bar].beats.flatMap((b) => b.notes).slice(-1)[0];
    const askEnds = [1, 5].map((b) => at(lastOf(b).string, lastOf(b).fret));
    const answerEnds = [3, 7].map((b) => at(lastOf(b).string, lastOf(b).fret));
    expect(askEnds).toEqual(['G', 'E']);
    expect(answerEnds).toEqual(['A', 'A']);
    for (const n of askEnds) expect(chordNotes('Am7').includes(n), n).toBe(true);
    const sentences = lesson('box-1-licks').steps.filter((s) => (s as { type?: string }).type === 'card').map((s) => (s as { body: string }).body);
    expect(sentences[0]).toMatch(/most finished of all on \{n:A\}, home/);
    expect(sentences[1]).toMatch(/\{n:G\} is a chord note, so it sounds good, but it is not home/);
    expect(lesson('box-1-licks').teaches).toMatch(/most finished on A, home/);
    // The listening question marked "finished" ends on A, the one marked "open" on D (not in Am7).
    const ear = stepsOf<{ options: Array<{ text: string; correct?: boolean }>; sound: { notes: TabNote[] } }>('box-1-licks', 'listen-choice');
    const ends = ear.map((e) => struck(e.sound.notes).slice(-1)[0]).map((n) => at(n.string, n.fret));
    expect(ends).toEqual(['A', 'D']);
    expect(ear[0].options.find((o) => o.correct)?.text).toMatch(/comes home/);
    expect(chordNotes('Am7').includes('D')).toBe(false);
  });

  it('describes Mia\'s example phrase at its real length: two bars, the silence after it', () => {
    const play = stepsOf<{ notes: TabNote[] }>('first-improvisation', 'play-phrase')[0];
    const beats: Record<string, number> = { q: 1, h: 2, w: 4, e: 0.5 };
    expect(play.notes.reduce((t, n) => t + beats[n.duration], 0)).toBe(8);
    const card = lesson('first-improvisation').steps.find((s) => (s as { title?: string }).title === 'Play, then rest') as unknown as { body: string; figure: { sound: { notes: TabNote[] } } };
    expect(card.figure.sound.notes).toEqual(play.notes);
    // The audio is the two bars; the two bars of silence come after it, as the card says.
    expect(card.body).toMatch(/two bars long\. After it, I would leave two bars of silence/);
    const tap = stepsOf<{ rhythm: { pattern: string } }>('first-improvisation', 'tap-rhythm')[0];
    expect(tap.rhythm.pattern.replace(' | ', ' ')).toBe(play.notes.map((n) => ('rest' in n ? `${n.duration}r` : n.duration)).join(' '));
  });

  it('hears the bar-5 change and the bar-9 order as the blues form has them', () => {
    const form = progressionInKey('blues-12-bar', 'A').bars.map((b) => b[0].symbol.replace('7', ''));
    expect([form[4], form[8], form[9]]).toEqual(['D', 'E', 'D']);
    const ear = stepsOf<{ sound: { chords: string[] }; explain: string }>('pentatonic-over-the-blues', 'listen-choice');
    expect(ear[0].sound.chords).toEqual(['A', 'A', form[4], form[5]]);
    expect(ear[1].sound.chords.slice(2)).toEqual([form[8], form[9]]);
    // No claim that D "sits lower" than E: on the guitar, E's bass (the open string 6) is the lower.
    expect(ear[0].explain).not.toMatch(/lower/);
    expect(midiAt({ string: 6, fret: 0 })).toBeLessThan(midiAt({ string: 4, fret: 0 }));
  });

  it('celebrates only what the show plays: the ending of the solo, landing on A in bar 11', () => {
    const show = lesson('blues-solo-milestone').steps.find((s) => (s as { id?: string }).id === 'show') as { notes: TabNote[] };
    const beats: Record<string, number> = { q: 1, h: 2, w: 4, e: 0.5 };
    // Bars 9 to 11: the last note starts in bar 11 (beats 8 to 12 of the three bars) and is A.
    const startOfLast = show.notes.slice(0, -1).reduce((t, n) => t + beats[n.duration], 0);
    expect(startOfLast).toBeGreaterThanOrEqual(8);
    const last = struck(show.notes).slice(-1)[0];
    expect(at(last.string, last.fret)).toBe('A');
    const words = unit.milestone!.celebrate;
    expect(words).toMatch(/landed on \{n:A\} in bar 11/);
    expect(words).not.toMatch(/You played rhythm/);
  });

  it('teaches the open E minor box as the engine lays it out, and again at fret 12', () => {
    expect(scaleNotes('E', 'minor-pentatonic')).toEqual(['E', 'G', 'A', 'B', 'D']);
    const open = openE.find((p) => p.id === 'box-1')!;
    const high = openE.find((p) => p.id === 'box-1-8va')!;
    expect([open.minFret, open.maxFret, high.minFret, high.maxFret]).toEqual([0, 3, 12, 15]);
    const fig = cardFigure<{ dots: Array<{ string: number; fret: number; note: string }> }>('e-minor-pentatonic', 'The same box, with open strings');
    expect(fig.dots.map((d) => `${pos(d)} ${d.note}`)).toEqual(open.notes.map((n) => `${pos(n)} ${noteAt(n)}`));
    const fig12 = cardFigure<{ dots: Array<{ string: number; fret: number; note: string }> }>('e-minor-pentatonic', 'Notes you already know');
    expect(fig12.dots.map((d) => `${pos(d)} ${d.note}`)).toEqual(high.notes.map((n) => `${pos(n)} ${noteAt(n)}`));
    for (const [a, b] of open.notes.map((n, i) => [n, high.notes[i]] as const)) expect(midiAt(b) - midiAt(a)).toBe(12);
    // One fretted note per string: fret 3 on strings 6, 2, 1 and fret 2 on strings 5, 4, 3.
    const fretted = open.notes.filter((n) => n.fret > 0).map(pos);
    expect(fretted).toEqual(['6:3', '5:2', '4:2', '3:2', '2:3', '1:3']);
    // The roots: open string 6, string 4 fret 2, open string 1.
    expect(open.notes.filter((n) => at(n.string, n.fret) === 'E').map(pos)).toEqual(['6:0', '4:2', '1:0']);
    // The way down: fretted notes from string 1 to string 6, as the order alternative names them.
    const down = stepsOf<{ notes: TabNote[]; alternative: { tiles: string[] } }>('e-minor-pentatonic', 'play-phrase')[1];
    expect(struck(down.notes).map(pos)).toEqual([...open.notes].reverse().map(pos));
    expect(down.alternative.tiles.flatMap(notesOf)).toEqual([...fretted].reverse().map((p) => at(Number(p.split(':')[0]), Number(p.split(':')[1]))));
  });

  it('sends the jams to progressions with the chords the lessons name', () => {
    const bars = (id: string, key: string) => progressionInKey(id, key).bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(bars('funk-one-chord-minor', 'A')).toEqual(['Am7', 'Am7']);
    expect(bars('blues-12-bar', 'A').map((c) => c.replace('7', ''))).toEqual(['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E']);
    expect(bars('minor-i-bvi-bvii', 'E')).toEqual(['Em', 'C', 'D', 'Em']);
    // Bar 11 of the blues is back on A, where the solo lands.
    expect(bars('blues-12-bar', 'A')[10]).toBe('A7');
  });

  it('names a BPM in every Player task that the task really opens at', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});
