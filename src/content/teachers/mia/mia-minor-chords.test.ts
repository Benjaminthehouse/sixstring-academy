/**
 * Cross-checks for Mia's unit 6 (Minor chords, minor songs) against the engines and the song
 * library: the notes under every finger the cards name, the fingers that stay between shapes, the
 * notes two chords share, the thirds that turn major into minor, the leading notes, the relative
 * major, the change studies and Korobeiniki, the fallbacks used while four planned songs are
 * missing, and the BPM of every Player task. Run with
 * `npx vitest run src/content/teachers/mia/mia-minor-chords.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { chordVoicings, identifyFretted, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, scaleNotes, semitones, intervalBetween } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TeacherUnit } from '../types';
import unit from './mia-minor-chords';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function isPickup(s: Song, i: number): boolean {
  const b = s.bars[i];
  return b.length !== undefined && b.length < (b.time.numerator * 3840) / b.time.denominator;
}

/** Every chord sounding in each full bar (the one in force at the bar line and any that start in it). */
async function chordsInBars(id: string): Promise<string[][]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const out: string[][] = [];
  for (let i = 0; i < s.bars.length; i++) {
    if (isPickup(s, i)) continue;
    const start = events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop();
    const inside = events.filter((e) => e.bar === i && e.tick > 0).map((e) => e.symbol);
    out.push([...(start ? [start.symbol] : []), ...inside]);
  }
  return out;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/** Problems with the tempos the Player tasks name (see mia-d-and-the-beat.test.ts). */
async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const id = taskSong(step);
      if (!id || !songEntry(id)) continue;
      const bpm = (await song(id)).tempo[0].bpm;
      const pctParam = (step.params ?? []).find((p) => /^t\d+$/.test(p));
      const pct = pctParam ? Number(pctParam.slice(1)) : 100;
      let text = plain(step.body);
      for (const m of text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)) {
        const want = (bpm * Number(m[1])) / 100;
        if (Math.abs(want - Number(m[2])) > 1) out.push(`${lesson.id} > ${step.id}: ${m[0]}, but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
      }
      text = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '');
      const first = text.match(/(\d+) BPM/);
      if (!first) {
        out.push(`${lesson.id} > ${step.id}: names no BPM`);
        continue;
      }
      const opens = (bpm * pct) / 100;
      if (Math.abs(opens - Number(first[1])) > 1) out.push(`${lesson.id} > ${step.id}: says ${first[1]} BPM, opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
    }
  }
  return out;
}

/** Where each finger sits in a shape: `{ 1: '2:1', 2: '4:2' }`. */
function fingerPlaces(frets: string, fingers: string): Record<number, string> {
  const out: Record<number, string> = {};
  [...fingers].forEach((f, i) => {
    if (f >= '1' && f <= '4') out[Number(f)] = `${6 - i}:${frets[i]}`;
  });
  return out;
}

/** The fretted positions of a shape, `string:fret`, fret 0 left out. */
function fretted(frets: string): string[] {
  return [...frets].map((f, i) => (f === 'x' || f === '0' ? '' : `${6 - i}:${f}`)).filter(Boolean);
}

/** The library's first shape and fingering of a chord, as `x32010` strings. */
function libraryShape(chord: string): { frets: string; fingers: string } {
  const v = chordVoicings(chord)[0];
  return { frets: v.frets.map((f) => (f === null ? 'x' : String(f))).join(''), fingers: v.fingers.map((f) => (f === null ? 'x' : String(f))).join('') };
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('mia'), [unit]);
const at = (string: number, fret: number, chord: string) => noteAt({ string, fret }, { context: { chord }, octave: false });

describe('Mia unit 6: Minor chords, minor songs', () => {
  it('passes the lesson engine with no error and no warning', () => {
    const problems = validateCourse(course);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(100);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(330);
    }
  });

  it('names the notes under the fingers as the neck has them', () => {
    expect([at(2, 1, 'C'), at(4, 2, 'C'), at(5, 3, 'C'), at(3, 2, 'Am')]).toEqual(['C', 'E', 'C', 'A']);
    expect([at(4, 0, 'Dm'), at(3, 2, 'Dm'), at(2, 3, 'Dm'), at(1, 1, 'Dm')]).toEqual(['D', 'A', 'D', 'F']);
    expect([at(5, 2, 'E'), at(4, 2, 'E'), at(3, 1, 'E')]).toEqual(['B', 'E', 'G#']);
    expect([at(5, 2, 'E7'), at(3, 1, 'E7'), at(4, 0, 'E7')]).toEqual(['B', 'G#', 'D']);
    expect([at(5, 2, 'B7'), at(4, 1, 'B7'), at(3, 2, 'B7'), at(2, 0, 'B7'), at(1, 2, 'B7')]).toEqual(['B', 'D#', 'A', 'B', 'F#']);
    for (const [shape, sym] of [['x32010', 'C'], ['x02210', 'Am'], ['xx0231', 'Dm'], ['022100', 'E'], ['020100', 'E7'], ['x21202', 'B7'], ['022000', 'Em']]) {
      expect(identifyFretted(shape).symbol, shape).toBe(sym);
    }
  });

  it('teaches the fingerings the chord library has, and the fingers that stay', () => {
    expect(libraryShape('C')).toEqual({ frets: 'x32010', fingers: 'x32010' });
    expect(libraryShape('Am')).toEqual({ frets: 'x02210', fingers: 'x02310' });
    expect(libraryShape('Dm')).toEqual({ frets: 'xx0231', fingers: 'xx0231' });
    expect(libraryShape('E')).toEqual({ frets: '022100', fingers: '023100' });
    expect(libraryShape('B7')).toEqual({ frets: 'x21202', fingers: 'x21304' });
    // C to Am: fingers 1 and 2 stay, finger 3 moves from string 5 fret 3 to string 3 fret 2.
    const c = fingerPlaces('x32010', 'x32010');
    const am = fingerPlaces('x02210', 'x02310');
    expect([c[1], c[2]]).toEqual([am[1], am[2]]);
    expect([c[3], am[3]]).toEqual(['5:3', '3:2']);
    // Am to Dm: string 3 fret 2 is in both, under finger 3 in Am and finger 2 in Dm.
    const dm = fingerPlaces('xx0231', 'xx0231');
    expect([am[3], dm[2]]).toEqual(['3:2', '3:2']);
    // E is the Am shape moved one string toward string 6.
    const moved = fretted('x02210').map((p) => p.split(':').map(Number)).map(([s, f]) => `${s + 1}:${f}`);
    expect(moved.sort()).toEqual(fretted('022100').sort());
    // The B7 anchor: finger 2 on string 5 fret 2 in Em (fingers 2 and 3), E and B7.
    expect([fingerPlaces('022000', '023000')[2], fingerPlaces('022100', '023100')[2], fingerPlaces('x21202', 'x21304')[2]]).toEqual(['5:2', '5:2', '5:2']);
  });

  it('has C and Am share exactly C and E', () => {
    expect(chordNotes('C').filter((n) => chordNotes('Am').includes(n)).sort()).toEqual(['C', 'E']);
  });

  it('turns each major chord minor by lowering its third one fret', () => {
    const pairs: Array<[string, string, string, string, number]> = [
      ['E', 'Em', '022100', '022000', 3],
      ['A', 'Am', 'x02220', 'x02210', 2],
      ['D', 'Dm', 'xx0232', 'xx0231', 1],
    ];
    for (const [maj, min, a, b, str] of pairs) {
      const diff = [...a].map((f, i) => (f !== b[i] ? 6 - i : 0)).filter(Boolean);
      expect(diff, `${maj} to ${min}`).toEqual([str]);
      const i = 6 - str;
      expect(Number(a[i]) - Number(b[i]), `${maj} to ${min}`).toBe(1);
      // The changed note is the third of each chord.
      expect(at(str, Number(a[i]), maj)).toBe(chordNotes(maj)[1]);
      expect(at(str, Number(b[i]), min)).toBe(chordNotes(min)[1]);
    }
    expect(['E', 'A', 'D'].map((c) => chordNotes(c)[1])).toEqual(['G#', 'C#', 'F#']);
    expect(['Em', 'Am', 'Dm'].map((c) => chordNotes(c)[1])).toEqual(['G', 'C', 'F']);
  });

  it('names the notes that lead home one fret below the home note', () => {
    // E7's G# is a half step below A; Em's G is a whole step below.
    expect(semitones(intervalBetween('G#', 'A'))).toBe(1);
    expect(semitones(intervalBetween('G', 'A'))).toBe(2);
    expect(chordNotes('E7')).toContain('G#');
    expect(chordNotes('Em')).not.toContain('G#');
    // B7's D# is a half step below E.
    expect(semitones(intervalBetween('D#', 'E'))).toBe(1);
    expect(chordNotes('B7')).toContain('D#');
  });

  it('makes G major the relative major of E minor, and counts twelve chords', () => {
    expect([...scaleNotes('E', 'minor')].sort()).toEqual([...scaleNotes('G', 'major')].sort());
    expect(scaleNotes('E', 'minor')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    const twelve = ['Em', 'E', 'Am', 'A', 'E7', 'D', 'A7', 'G', 'C', 'D7', 'Dm', 'B7'];
    expect(new Set(twelve).size).toBe(12);
    const card = unit.lessons.find((l) => l.id === 'major-or-minor')!.steps.find((s) => (s as { title?: string }).title === 'Twelve chords, and a carol') as { body: string };
    expect([...card.body.matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1])).toEqual(twelve);
  });

  it('describes the change studies and Korobeiniki as the library has them', async () => {
    const cam = await chordsInBars('st-change-c-am-am-dm');
    expect(new Set(cam.slice(0, 8).flat())).toEqual(new Set(['C', 'Am']));
    expect(new Set(cam.slice(8, 16).flat())).toEqual(new Set(['Am', 'Dm']));
    const ame = await chordsInBars('st-change-am-e-e-b7');
    expect(new Set(ame.slice(0, 8).flat())).toEqual(new Set(['Am', 'E']));
    expect(new Set(ame.slice(8, 16).flat())).toEqual(new Set(['E', 'B7']));
    const emb = await chordsInBars('st-change-em-am-em-b7');
    expect(new Set(emb.slice(0, 8).flat())).toEqual(new Set(['Em', 'Am']));
    expect(new Set(emb.slice(8, 16).flat())).toEqual(new Set(['Em', 'B7']));
    const k = await chordsInBars('korobeiniki');
    expect(new Set(k.flat())).toEqual(new Set(['Am', 'E7', 'Dm']));
    expect(k[0]).toEqual(['E7']);
    const ks = await song('korobeiniki');
    expect(ks.tracks.map((t) => [t.name, t.role])).toEqual([['Melody', 'lead'], ['Strum', 'rhythm']]);
    expect(ks.tempo[0].bpm).toBe(100);
  });

  it('falls back to music with the planned chords while four songs are missing', async () => {
    const chordsOf = (id: string, key: string) => [...new Set(progressionInKey(id, key).bars.flat().map((c) => c.symbol))];
    expect(chordsOf('classical-minor-cadence', 'A')).toEqual(['Am', 'Dm', 'E7']);
    expect(chordsOf('classical-minor-cadence', 'E')).toEqual(['Em', 'Am', 'B7']);
    expect(chordsOf('minor-i-bvi-biii-bvii', 'E')).toEqual(['Em', 'C', 'G', 'D']);
    expect(getProgression('minor-i-bvi-biii-bvii')!.tonality).toBe('minor');
    // O Come, All Ye Faithful: a level-3 carol on five of God Rest Ye's six chords (all but B7), in G major.
    const carol = new Set((await chordsInBars('o-come-all-ye-faithful')).flat());
    for (const c of ['Em', 'Am', 'C', 'D', 'G']) expect(carol.has(c), c).toBe(true);
    expect(carol.has('B7')).toBe(false);
    expect(songEntry('o-come-all-ye-faithful')!.level).toBe(3);
    expect((await song('o-come-all-ye-faithful')).tempo[0].bpm * 0.95).toBeCloseTo(83.6, 1);
    // G major's minor chords are Em and Am.
    expect(scaleNotes('G', 'major')).toContain('E');
    expect(chroma('E')).toBe(4);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});
