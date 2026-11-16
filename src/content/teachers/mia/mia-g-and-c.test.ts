/**
 * Cross-checks for Mia's unit 5 (G, C and three-chord songs) against the engines and the song
 * library: the notes under every finger the cards name, the anchor and pivot fingers between
 * shapes, the key of D and the I-IV-V7 of G major, the change studies' halves, Coming 'Round the
 * Mountain's chart, Amazing Grace's tune opening and the bass line of the performance, Brahms'
 * Lullaby's range, and the BPM of every Player task. Run with
 * `npx vitest run src/content/teachers/mia/mia-g-and-c.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { getProgression } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { chordFromParam } from '@/features/chords/model/symbols';
import { identifyFretted, noteAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, midiToNote, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type PlayPhraseExercise } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TeacherUnit } from '../types';
import unit from './mia-g-and-c';

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

/** The chords one after another, repeats collapsed: the chart's changes. */
function changes(bars: string[][]): string[] {
  return bars.flat().filter((c, i, all) => i === 0 || c !== all[i - 1]);
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

/** Where each finger sits in a shape: `{ 1: '5:2', 2: '4:2' }` from frets `022000` and fingers `012000`. */
function fingerPlaces(frets: string, fingers: string): Record<number, string> {
  const out: Record<number, string> = {};
  [...fingers].forEach((f, i) => {
    if (f >= '1' && f <= '4') out[Number(f)] = `${6 - i}:${frets[i]}`;
  });
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('mia'), [unit]);
const at = (string: number, fret: number, chord: string) => noteAt({ string, fret }, { context: { chord }, octave: false });

describe('Mia unit 5: G, C and three-chord songs', () => {
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
    // G: string 6 fret 3 (G), string 5 fret 2 (B), string 1 fret 3 (G); strings 4, 3, 2 open (D, G, B).
    expect([at(6, 3, 'G'), at(5, 2, 'G'), at(1, 3, 'G'), at(4, 0, 'G'), at(3, 0, 'G'), at(2, 0, 'G')]).toEqual(['G', 'B', 'G', 'D', 'G', 'B']);
    // C: string 5 fret 3 (C), string 4 fret 2 (E), string 2 fret 1 (C); strings 3 and 1 open (G, E).
    expect([at(5, 3, 'C'), at(4, 2, 'C'), at(3, 0, 'C'), at(2, 1, 'C'), at(1, 0, 'C')]).toEqual(['C', 'E', 'G', 'C', 'E']);
    // D7: string 3 fret 2 (A), string 2 fret 1 (C), string 1 fret 2 (F#), over the open string 4 (D).
    expect([at(4, 0, 'D7'), at(3, 2, 'D7'), at(2, 1, 'D7'), at(1, 2, 'D7')]).toEqual(['D', 'A', 'C', 'F#']);
    // The 7 adds one note, C, to D.
    expect(chordNotes('D7').filter((n) => !chordNotes('D').includes(n))).toEqual(['C']);
    // Amazing Grace's bass notes are each chord's root.
    expect([at(6, 3, 'G'), at(5, 3, 'C'), at(4, 0, 'D7'), at(6, 0, 'Em')]).toEqual(['G', 'C', 'D', 'E']);
  });

  it('draws shapes that are the chords they are called', () => {
    expect(identifyFretted('320003').symbol).toBe('G');
    expect(identifyFretted('320033').symbol).toBe('G');
    expect(identifyFretted('x32010').symbol).toBe('C');
    expect(identifyFretted('xx0212').symbol).toBe('D7');
    expect(identifyFretted('022000').symbol).toBe('Em');
  });

  it('has the anchor and the pivot fingers the lessons promise', () => {
    // Em fingered 1 and 2, then G fingered 2-1-3: finger 1 stays on string 5, fret 2.
    expect(fingerPlaces('022000', '012000')[1]).toBe('5:2');
    expect(fingerPlaces('320003', '210003')[1]).toBe('5:2');
    // G fingered 3-2-4, then C: the 3-2 pair keeps its shape, one string toward string 1; finger 1 lands on string 2 fret 1.
    const g = fingerPlaces('320003', '320004');
    const c = fingerPlaces('x32010', 'x32010');
    expect([g[3], g[2]]).toEqual(['6:3', '5:2']);
    expect([c[3], c[2], c[1]]).toEqual(['5:3', '4:2', '2:1']);
    // D to the four-finger G: finger 3 stays on string 2, fret 3 (D).
    expect(fingerPlaces('xx0232', 'xx0132')[3]).toBe('2:3');
    expect(fingerPlaces('320033', '210034')[3]).toBe('2:3');
    expect(at(2, 3, 'G')).toBe('D');
  });

  it('teaches the key of D and the I, IV and V7 of G major as the theory engine has them', () => {
    const d = scaleNotes('D', 'major');
    expect(d).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect([d[0], d[3], d[4]]).toEqual(['D', 'G', 'A']);
    const g = scaleNotes('G', 'major');
    expect([g[0], g[3], g[4]]).toEqual(['G', 'C', 'D']);
    // D7 is built on the 5th note of G major, and every note of it but C is in D major's chord too.
    expect(chordNotes('D7')[0]).toBe(g[4]);
  });

  it('describes the change studies as the library has them', async () => {
    const gc = await chordsInBars('st-change-g-c-c-g7');
    expect(new Set(gc.slice(0, 8).flat())).toEqual(new Set(['G', 'C']));
    const gd = await chordsInBars('st-change-g-d7-d-g');
    expect(new Set(gd.slice(0, 8).flat())).toEqual(new Set(['G', 'D7']));
    expect(new Set(gd.slice(8, 16).flat())).toEqual(new Set(['G', 'D']));
    // The second half uses the four-finger G.
    const s = await song('st-change-g-d7-d-g');
    const gShapes = new Set(s.chords.filter((e) => e.bar >= 8 && e.symbol === 'G').map((e) => e.voicing?.map((f) => (f === null ? 'x' : f)).join('')));
    expect([...gShapes]).toEqual(['320033']);
    const em = await chordsInBars('st-change-em-d-em-g');
    expect(new Set(em.slice(8, 16).flat())).toEqual(new Set(['Em', 'G']));
  });

  it("plays Coming 'Round the Mountain's chart: G, D7 at the end of line 2, G, C, G, D7, G", async () => {
    const bars = await chordsInBars('coming-round-the-mountain');
    expect(bars.length).toBe(24);
    for (let v = 0; v < 3; v++) expect(changes(bars.slice(v * 8, v * 8 + 8)), `verse ${v + 1}`).toEqual(['G', 'D7', 'G', 'C', 'G', 'D7', 'G']);
    // Line 2 (bars 3 and 4) is G, then D7 for its last bar.
    expect(bars.slice(2, 4)).toEqual([['G'], ['D7']]);
    expect((await song('coming-round-the-mountain')).tempo[0].bpm).toBe(108);
  });

  it("matches Amazing Grace's tune opening and the performance's bass line to the library", async () => {
    const s = await song('amazing-grace');
    expect(isPickup(s, 0)).toBe(true);
    const tune = s.tracks.find((t) => t.role === 'lead')!;
    const strum = s.tracks.find((t) => t.role === 'rhythm')!;
    // The tune: the pickup and bars 1 to 4, note for note and in length.
    const struck = tune.measures.slice(0, 5).flatMap((m) => m.beats.filter((b) => b.notes.length > 0 && !b.notes[0].tie));
    const card = unit.lessons.find((l) => l.id === 'amazing-grace')!.steps[0] as { figure: { notes: Array<{ string: number; fret: number; duration: string }> } };
    const len: Record<string, number> = { e: 480, q: 960, h: 1920 };
    expect(card.figure.notes.map((n) => `${n.string}:${n.fret}/${len[n.duration]}`)).toEqual(struck.slice(0, card.figure.notes.length).map((b) => `${b.notes[0].string}:${b.notes[0].fret}/${b.duration}`));
    // It starts on D (the open string 4) and rises to G (the open string 3).
    expect(struck.slice(0, 2).map((b) => midiToNote(b.notes[0].midi))).toEqual(['D3', 'G3']);
    // The whole tune uses only five notes: G A B D E.
    const pcs = new Set(tune.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => chroma(n.midi)))));
    expect([...pcs].sort((a, b) => a - b)).toEqual(['D', 'E', 'G', 'A', 'B'].map((n) => chroma(n)).sort((a, b) => a - b));
    // The show is verse 1's bass line: the single note on beat 1 of bars 1 to 16 of the strum part.
    const bass = strum.measures.slice(1, 17).map((m) => `${m.beats[0].notes[0].string}:${m.beats[0].notes[0].fret}`);
    const show = unit.lessons.find((l) => l.id === 'amazing-grace')!.steps.find((x) => (x as { id?: string }).id === 'show') as PlayPhraseExercise;
    expect(show.notes.map((n) => ('string' in n ? `${n.string}:${n.fret}` : 'rest'))).toEqual(bass);
    expect(phraseMidi(show).map((m) => midiToNote(m))).toEqual(['G2', 'G2', 'C3', 'G2', 'G2', 'G2', 'D3', 'D3', 'G2', 'G2', 'C3', 'G2', 'E2', 'D3', 'G2', 'G2']);
    // The chart of verse 1, line by line, as the order alternative has it (G7 played as G).
    const chart = (await chordsInBars('amazing-grace')).slice(0, 16).map((b) => b[0].replace('G7', 'G'));
    expect([chart.slice(0, 4), chart.slice(4, 8), chart.slice(8, 12), chart.slice(12, 16)].map((l) => l.join(' '))).toEqual(['G G C G', 'G G D7 D7', 'G G C G', 'Em D7 G G']);
  });

  it("keeps Brahms' Lullaby's tune between the open string 3 and string 1 fret 3, on G, D7 and C", async () => {
    const s = await song('brahms-lullaby');
    const tune = s.tracks.find((t) => t.role === 'lead')!;
    const midis = tune.measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
    expect(midiToNote(Math.min(...midis))).toBe('G3');
    expect(midiToNote(Math.max(...midis))).toBe('G4');
    expect(noteAt({ string: 3, fret: 0 })).toBe('G3');
    expect(noteAt({ string: 1, fret: 3 })).toBe('G4');
    expect(new Set((await chordsInBars('brahms-lullaby')).flat())).toEqual(new Set(['G', 'D7', 'C']));
    expect(s.tracks.map((t) => [t.name, t.role])).toEqual([['Melody', 'lead'], ['Teacher', 'rhythm']]);
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });

  it('jams on the I, IV and V of D while Michael, Row is missing from the library', async () => {
    const { progressionInKey } = await import('@/content/progressions');
    const r = progressionInKey('folk-i-iv-i-v', 'D');
    expect([...new Set(r.bars.flat().map((c) => c.symbol))]).toEqual(['D', 'G', 'A']);
  });
});

// ── checks added by the review ──────────────────────────────────────────────────────────────────

type LooseStep = { type?: string; chord?: string; options?: Array<{ figure?: { kind: string } }>; alternative?: { type?: string; chord?: string; generate?: string; params?: { chords?: string[] } } };

describe('Mia unit 5: what the review fixed', () => {
  it('never offers chord boxes as answer options (the engine prints each box\'s name on it)', () => {
    for (const l of unit.lessons) {
      for (const s of l.steps as LooseStep[]) if (s.type === 'choice') for (const o of s.options ?? []) expect(o.figure?.kind, l.id).not.toBe('chord');
    }
  });

  it('gives every lesson two to four facts', () => {
    for (const l of unit.lessons) expect((l.facts ?? []).length, l.id).toBeGreaterThanOrEqual(2);
    for (const l of unit.lessons) expect((l.facts ?? []).length, l.id).toBeLessThanOrEqual(4);
  });

  it('lets a play-chord step without a microphone build the chord it names', () => {
    for (const l of unit.lessons) {
      for (const s of l.steps as LooseStep[]) {
        if (s.type !== 'play-chord') continue;
        const alt = s.alternative!;
        if (alt.type === 'chord-build') expect(alt.chord, `${l.id}: ${s.chord}`).toBe(s.chord);
        else expect(alt.generate === 'chord-shape' && alt.params?.chords?.[0], `${l.id}: ${s.chord}`).toBe(s.chord);
      }
    }
  });

  it('names Player parts the songs really have', async () => {
    let named = 0;
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        if (!isTaskStep(s) || s.tool !== 'player') continue;
        const id = taskSong(s)!;
        if (!songEntry(id)) continue;
        const tracks = (await song(id)).tracks.map((t) => t.name);
        for (const m of plain(s.body).matchAll(/\btap ([A-Z][a-z]+)\b/g)) {
          named++;
          expect(tracks, `${l.id} > ${s.id}`).toContain(m[1]);
        }
      }
    }
    expect(named).toBe(2); // Brahms: Teacher, then Melody
  });

  it('swaps a chord the chord trainer really has open', () => {
    let swaps = 0;
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        if (!isTaskStep(s) || s.tool !== 'chords') continue;
        const open = (s.params ?? []).slice(1).map(chordFromParam);
        for (const m of plain(s.body).matchAll(/swap \{c:([^}]+)\} for \{c:([^}]+)\}/g)) {
          swaps++;
          expect(open, `${l.id} > ${s.id}`).toContain(m[1]);
          expect(open, `${l.id} > ${s.id}`).not.toContain(m[2]);
        }
      }
    }
    expect(swaps).toBe(2); // D-G then G-A; G-D7 then D-G
  });

  it('asks the band for a tempo its folk style can play while Michael, Row is missing', () => {
    const p = getProgression('folk-i-iv-i-v')!;
    const style = BACKING_STYLES[p.feel.backing];
    expect(style.tempo.min).toBeLessThanOrEqual(80);
    expect(style.tempo.max).toBeGreaterThanOrEqual(92);
  });
});
