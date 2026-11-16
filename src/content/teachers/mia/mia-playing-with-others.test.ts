/**
 * Cross-checks for Mia's unit 12 (Playing with others, and a habit for life) against the engines
 * and the song library: the five pairs of the fifth-fret rule on the neck, the bars of Frère
 * Jacques (round) and Duet: An Original Round the lessons quote (and where the second voice comes
 * in), the capo shapes and the capo table, the jam charts and the shapes played over them with the
 * capo, the two progressions in G and the ear drill that asks for them, the 20-minute routine, the
 * encore of Für Elise note for note, Dev's hand-over checks, every "string N, fret M is X" the text
 * names, and every tempo a task names. Run with
 * `npx vitest run src/content/teachers/mia/mia-playing-with-others.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { chordVoicings, identifyFretted, midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song, type Track } from '@/core/song';
import { chordNotes, chroma, transposeChordBySemitones } from '@/core/theory';
import { drillById, levelOf } from '@/features/ear/core/drills';
import { PROGRESSIONS as EAR_PROGRESSIONS } from '@/features/ear/core/drills/progressions';
import { estimateLessonSeconds, formatProblems, validateCourse, type RichText, type TabNote } from '@/lessons';
import { compileLesson, isTaskStep, loadTeacherCourse, taskSong, type TaskStep, type TeacherUnit } from '../index';
import dev from '../dev/dev-barre-chords';
import unit, { AXIS_IN_G, CAPO_TABLE, DUET_BARS_1_2, ELISE_ENCORE, FIFTIES_IN_G, FOLK_RHYTHM, G_SHAPE_PICKED, JACQUES_BARS_1_2, JACQUES_BARS_3_4, JACQUES_BAR_5, SAMPLE_ROUTINE, TUNING_PAIRS } from './mia-playing-with-others';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

const DUR: Record<number, string> = { 240: 's', 480: 'e', 720: 'e.', 960: 'q', 1440: 'q.', 1920: 'h', 2880: 'h.', 3840: 'w' };
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function track(s: Song, name: string): Track {
  const t = s.tracks.find((x) => x.name.startsWith(name));
  expect(t, `${s.meta.title}: track ${name}`).toBeTruthy();
  return t!;
}

/** Bars `from` to `to` (0-based, inclusive) of a track as tab notes, rests included. */
function bars(t: Track, from: number, to: number): TabNote[] {
  return t.measures.slice(from, to + 1).flatMap((m) =>
    m.beats.map((b): TabNote => (b.notes.length === 0 ? { rest: true, duration: DUR[b.duration] ?? String(b.duration) } : { string: b.notes[0].string, fret: b.notes[0].fret, duration: DUR[b.duration] ?? String(b.duration) })),
  );
}

const copy = (xs: readonly TabNote[]): TabNote[] => xs.map((x) => ({ ...x }));
type Struck = Exclude<TabNote, { rest: true }>;
const struck = (xs: readonly TabNote[]): Struck[] => xs.filter((x): x is Struck => !('rest' in x));
const names = (xs: readonly TabNote[], capo = 0): string[] => struck(xs).map((x) => PC[midiAt(x, { capo }) % 12]);
const plain = (text: RichText): string => (typeof text === 'string' ? text : text.text);
const chordsIn = (text: RichText): string[] => [...plain(text).matchAll(/\{c:([^}]+)\}/g)].map((m) => m[1]);
const notesIn = (text: string): string[] => [...text.matchAll(/\{n:([A-G][#b]?)\}/g)].map((m) => m[1]);
const pc = (chord: string): number => chroma(chord.replace(/m$|7$/, ''));

function lesson(id: string) {
  const l = unit.lessons.find((x) => x.id === id);
  expect(l, id).toBeTruthy();
  return l!;
}

function step<T>(lessonId: string, pred: (s: Record<string, unknown>) => boolean): T {
  const s = lesson(lessonId).steps.find((x) => pred(x as unknown as Record<string, unknown>));
  expect(s, `${lessonId}: step`).toBeTruthy();
  return s as unknown as T;
}

const byId = <T>(lessonId: string, id: string) => step<T>(lessonId, (s) => s.id === id);
const byTitle = <T>(lessonId: string, title: string) => step<T>(lessonId, (s) => s.title === title);

function texts(u: TeacherUnit): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(u);
  return out;
}

/** Every "string N, fret M is X", "X is string N, fret M", "the open string N is X" and "fret M of string N is X" (no capo), checked on the neck. */
function positionClaims(u: TeacherUnit): { checked: number; problems: string[] } {
  const problems: string[] = [];
  let checked = 0;
  const check = (claim: string, string: number, fret: number, note: string) => {
    checked++;
    if (chroma(noteAt({ string, fret }, { octave: false })) !== chroma(note)) problems.push(claim);
  };
  for (const t of texts(u)) {
    for (const m of t.matchAll(/string (\d), fret (\d+),? is \{n:([A-G][#b]?)\}/gi)) check(m[0], Number(m[1]), Number(m[2]), m[3]);
    for (const m of t.matchAll(/\{n:([A-G][#b]?)\}(?:,? which is|,? on| is) string (\d), fret (\d+)/gi)) check(m[0], Number(m[2]), Number(m[3]), m[1]);
    for (const m of t.matchAll(/the open string (\d) is \{n:([A-G][#b]?)\}/gi)) check(m[0], Number(m[1]), 0, m[2]);
    for (const m of t.matchAll(/fret (\d+) of string (\d) is \{n:([A-G][#b]?)\}/gi)) check(m[0], Number(m[2]), Number(m[1]), m[3]);
  }
  return { checked, problems };
}

const PCT = /(\d+) % \((?:about )?(\d+) BPM\)/g;
const BARE = /(\d+) BPM/;

/** Problems with the tempos a Player task's words name: the first BPM is the tempo it opens at. */
async function tempoProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const st of l.steps.filter(isTaskStep)) {
      for (const target of [st, ...(st.fallback ? [st.fallback] : [])] as Array<Pick<TaskStep, 'tool' | 'params' | 'body'>>) {
        const id = taskSong(target);
        if (!id || !songEntry(id)) continue;
        const bpm = (await song(id)).tempo[0].bpm;
        const pctParam = (target.params ?? []).find((p) => /^t\d+$/.test(p));
        const pct = pctParam ? Number(pctParam.slice(1)) : 100;
        let text = plain(target.body);
        for (const m of text.matchAll(PCT)) {
          const want = (bpm * Number(m[1])) / 100;
          if (Math.abs(want - Number(m[2])) > 1) out.push(`${l.id} > ${st.id}: "${m[0]}", but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
        }
        text = text.replace(PCT, '');
        const first = text.match(BARE);
        if (!first) {
          out.push(`${l.id} > ${st.id}: names no tempo`);
          continue;
        }
        const opens = (bpm * pct) / 100;
        if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${st.id}: says "${first[0]}", opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
      }
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

describe('Mia unit 12: Playing with others, and a habit for life', () => {
  it('passes the lesson engine with no error and no warning, in the whole course', async () => {
    const tc = await loadTeacherCourse('mia');
    const problems = validateCourse(tc.course).filter((p) => p.unit === unit.id);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('keeps every engine lesson inside the 2 to 5 minute window', () => {
    for (const l of unit.lessons) {
      const s = estimateLessonSeconds(compileLesson(l));
      expect(s, `${l.id}: ${s} s`).toBeGreaterThanOrEqual(120);
      expect(s, `${l.id}: ${s} s`).toBeLessThanOrEqual(320);
    }
  });

  it('names every fret right: each "string N, fret M is X" in the text', () => {
    const { checked, problems } = positionClaims(unit);
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it('tunes by the fifth-fret rule exactly as the neck has it, fret 4 on string 3', () => {
    for (const p of TUNING_PAIRS) {
      // The fretted note and the open string sound the very same pitch, the one the lesson names.
      expect(midiAt(p.fretted), `${p.fretted.string}:${p.fretted.fret}`).toBe(midiAt(p.open));
      expect(noteAt(p.fretted)).toBe(p.note);
      expect(p.open.string).toBe(p.fretted.string - 1);
      expect(p.fretted.fret).toBe(p.fretted.string === 3 ? 4 : 5);
    }
    expect(TUNING_PAIRS.map((p) => p.fretted.string)).toEqual([6, 5, 4, 3, 2]);
    // The card's figure shows the five pairs; the match-pairs names them.
    const fig = byTitle<{ figure: { dots: Array<{ string: number; fret: number; note: string }> } }>('tune-without-a-tuner', 'Strings that tune each other').figure;
    expect(fig.dots.map((d) => `${d.string}:${d.fret} ${d.note}`)).toEqual(TUNING_PAIRS.flatMap((p) => [`${p.fretted.string}:${p.fretted.fret} ${p.note}`, `${p.open.string}:0 ${p.note}`]));
    const pairs = step<{ pairs: Array<{ left: string; right: string }> }>('tune-without-a-tuner', (s) => s.type === 'match-pairs').pairs;
    expect(pairs.map((x) => `${x.left} = ${x.right}`)).toEqual(TUNING_PAIRS.map((p) => `String ${p.fretted.string}, fret ${p.fretted.fret} = Open string ${p.open.string}`));
    // Strings 3 and 2 are four half steps apart, every other neighbour five.
    expect(midiAt({ string: 2, fret: 0 }) - midiAt({ string: 3, fret: 0 })).toBe(4);
    for (const s of [6, 5, 4, 2]) expect(midiAt({ string: s - 1, fret: 0 }) - midiAt({ string: s, fret: 0 })).toBe(5);
    // The play step plays the first pair; its alternative finds exactly those two places.
    const play = step<{ notes: TabNote[] }>('tune-without-a-tuner', (s) => s.type === 'play-phrase');
    expect(struck(play.notes).map((n) => midiAt(n))).toEqual([45, 45]);
    const tuner = byId<TaskStep>('tune-without-a-tuner', 'higher-lower');
    expect(levelOf(drillById('pitch')!, tuner.params![1])?.title).toBe('Smaller steps');
    expect(levelOf(drillById('pitch')!, 4)?.title).toBe('Next-door notes');
  });

  it('quotes Frère Jacques (round) as the library has it, the second voice entering at bar 3', async () => {
    const s = await song('frere-jacques-round');
    const you = track(s, 'You');
    const teacher = track(s, 'Teacher');
    expect(copy(JACQUES_BARS_1_2)).toEqual(bars(you, 0, 1));
    expect(copy(JACQUES_BARS_3_4)).toEqual(bars(you, 2, 3));
    expect(copy(JACQUES_BAR_5)).toEqual(bars(you, 4, 4));
    expect(names(JACQUES_BARS_1_2.slice(0, 4))).toEqual(['G', 'A', 'B', 'G']);
    expect(names(JACQUES_BARS_3_4)).toEqual(['B', 'C', 'D', 'B', 'C', 'D']);
    expect(names(JACQUES_BAR_5)).toEqual(['D', 'E', 'D', 'C', 'B', 'G']);
    // Two bars of rest, then the tune from its first bar: the second voice enters at bar 3.
    expect(bars(teacher, 0, 1).every((n) => 'rest' in n)).toBe(true);
    expect(bars(teacher, 2, 2)).toEqual(bars(you, 0, 0));
    // The tap step is bar 5's rhythm; the tempos the task names are the song's.
    const tap = step<{ rhythm: { pattern: string } }>('rounds-and-duets', (x) => x.type === 'tap-rhythm');
    expect(tap.rhythm.pattern.split(' ')).toEqual(JACQUES_BAR_5.map((n) => n.duration));
    expect(s.tempo[0].bpm).toBe(96);
    expect(Math.round((96 * 83) / 100)).toBe(80);
    // The order alternative of bar 1 names its notes.
    const play = step<{ alternative: { tiles: string[] } }>('rounds-and-duets', (x) => x.type === 'play-phrase');
    expect(play.alternative.tiles.flatMap(notesIn)).toEqual(names(JACQUES_BARS_1_2.slice(0, 4)));
  });

  it('quotes Duet: An Original Round as the library has it, over G and D', async () => {
    const s = await song('st-duet-round');
    const you = track(s, 'You');
    const teacher = track(s, 'Teacher');
    expect(copy(DUET_BARS_1_2)).toEqual(bars(you, 0, 1));
    expect(names(DUET_BARS_1_2)).toEqual(['B', 'C', 'B', 'G', 'A', 'B', 'A', 'F#']);
    expect(bars(teacher, 0, 1).every((n) => 'rest' in n)).toBe(true);
    expect(bars(teacher, 2, 3)).toEqual(bars(you, 0, 1));
    expect(s.tempo[0].bpm).toBe(84);
    // The F# the learner taps is string 4, fret 4.
    const last = struck(DUET_BARS_1_2).slice(-1)[0];
    expect([last.string, last.fret]).toEqual([4, 4]);
    expect(noteAt({ string: 4, fret: 4 })).toBe('F#3');
  });

  it('teaches the capo with the shapes and sums the engines give', () => {
    // Capo 2, the G shape: it sounds A, note for note on the figure.
    expect(identifyFretted('320003', { capo: 2 }).symbol).toBe('A');
    expect(identifyFretted('x32010', { capo: 2 }).symbol).toBe('D');
    const fig = byTitle<{ figure: { capo: number; dots: Array<{ string: number; fret: number; note: string }> } }>('the-capo', 'A clamp that moves the nut').figure;
    expect(fig.capo).toBe(2);
    expect(fig.dots.map((d) => d.note)).toEqual(G_SHAPE_PICKED.map((n) => noteAt(n as Struck, { capo: 2, context: { chord: 'A' } })));
    expect(fig.dots.map((d) => `${d.string}:${d.fret}`)).toEqual(struck(G_SHAPE_PICKED).map((n) => `${n.string}:${n.fret}`));
    expect(struck(G_SHAPE_PICKED).map((n) => n.fret).join('')).toBe('320003');
    expect(new Set(names(G_SHAPE_PICKED, 2))).toEqual(new Set(['A', 'C#', 'E']));
    // The table: G, C and D shapes moved up by the capo's fret.
    for (const row of CAPO_TABLE) expect(row.sounds.map((c) => chroma(c))).toEqual(['G', 'C', 'D'].map((c) => chroma(transposeChordBySemitones(c, row.capo))));
    const table = plain(byTitle<{ body: RichText }>('the-capo', 'Same shapes, new key').body);
    for (const row of CAPO_TABLE) expect(table).toContain(row.sounds.map((c) => `{c:${c}}`).join(' '));
    // The five capo rounds: capo 1 to 5, every answer one half step per fret above the shape.
    const pairs = step<{ pairs: Array<{ left: string; right: string }> }>('the-capo', (s) => s.type === 'match-pairs').pairs;
    const capos = [2];
    for (const p of pairs) {
      const m = p.left.match(/Capo (\d), \{c:([A-G])\} shape/)!;
      capos.push(Number(m[1]));
      expect(pc(chordsIn(p.right)[0]), p.left).toBe(chroma(transposeChordBySemitones(m[2], Number(m[1]))));
    }
    expect([...capos].sort()).toEqual([1, 2, 3, 4, 5]);
    // The play step and its alternative: string 6 at fret 3 above a capo at 2 is the neck's fret 5, A.
    expect(noteAt({ string: 6, fret: 3 }, { capo: 2 })).toBe('A2');
    expect(noteAt({ string: 6, fret: 5 })).toBe('A2');
    // The tech-capo guide says the same: G, C, D at capo 2 sound A, D, E.
    expect(getExercise('tech-capo')!.steps.join(' ')).toMatch(/capo at fret 2.*sound a whole step higher, as A, D and E/);
  });

  it('plays the capo jam the band really plays: the shapes two half steps below its chords', () => {
    const band = progressionInKey('folk-i-iv-i-v', 'A').bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(band).toEqual(['A', 'D', 'A', 'E', 'A', 'D', 'E', 'A']);
    const said = chordsIn(byId<TaskStep>('the-capo', 'capo-jam').body);
    expect(said.slice(0, 8)).toEqual(band);
    expect(said.slice(8).map(pc)).toEqual(band.map((c) => chroma(transposeChordBySemitones(c, -2))));
    expect(said.slice(8)).toEqual(['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G']);
    // O Come, All Ye Faithful uses the shapes the learner knows, in G.
    expect(songEntry('o-come-all-ye-faithful')!.key).toBe('G major');
  });

  it('charts the two progressions in G as the catalog and the ear drill have them', () => {
    const inG = (id: string) => progressionInKey(id, 'G').bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(inG('fifties-i-vi-iv-v')).toEqual([...FIFTIES_IN_G]);
    expect(inG('pop-axis')).toEqual([...AXIS_IN_G]);
    expect(progressionInKey('fifties-i-vi-iv-v', 'G').bars.map((b) => b[0].numeral)).toEqual(['I', 'vi', 'IV', 'V']);
    expect(progressionInKey('pop-axis', 'G').bars.map((b) => b[0].numeral)).toEqual(['I', 'V', 'vi', 'IV']);
    // The jam tasks name the band's chords.
    expect(chordsIn(byId<TaskStep>('jamming-with-the-band', 'fifties-jam').body)).toEqual([...FIFTIES_IN_G]);
    // The ear task's level holds both progressions.
    const ear = byId<TaskStep>('jamming-with-the-band', 'progressions-ear');
    const level = levelOf(drillById('progressions')!, ear.params![1])!;
    expect(level.pool).toEqual(expect.arrayContaining(['pop', 'fifties']));
    expect(EAR_PROGRESSIONS.fifties.romans).toBe('I vi IV V');
    expect(EAR_PROGRESSIONS.pop.romans).toBe('I V vi IV');
    expect(level.questions).toBe(8);
    expect(plain(ear.body)).toMatch(/^Eight progressions/);
    expect(levelOf(drillById('pitch')!, 3)!.questions).toBe(10);
    expect(EAR_PROGRESSIONS.pop.name).toBe('the pop loop');
    expect(EAR_PROGRESSIONS.fifties.name).toBe('the fifties progression');
  });

  it('adds the sample routine up to 20 minutes, as the card and the pairs say', () => {
    expect(SAMPLE_ROUTINE.reduce((t, b) => t + b.minutes, 0)).toBe(20);
    const card = plain(byTitle<{ body: RichText }>('your-practice-routine', 'A session has a shape').body);
    expect([...card.matchAll(/(\d+) min /g)].map((m) => Number(m[1]))).toEqual(SAMPLE_ROUTINE.map((b) => b.minutes));
    const pairs = step<{ pairs: Array<{ left: string; right: string }> }>('your-practice-routine', (s) => s.type === 'match-pairs').pairs;
    for (const p of pairs) {
      const block = SAMPLE_ROUTINE.find((b) => b.block.startsWith(p.left))!;
      expect(block, p.left).toBeTruthy();
      expect(p.right).toBe(`${block.minutes} minutes`);
    }
    // The cool-down really ends on a note to yourself.
    const cool = getExercise('tech-cool-down')!;
    expect(cool.routine!.map((r) => r.id)).toEqual(['arpeggios', 'shake-out', 'reflect']);
    expect(cool.routine![0].seconds).toBe(120);
  });

  it('plays the encore of Für Elise as the library has it, the G sharp kept', async () => {
    const s = await song('fur-elise-theme');
    const m = track(s, 'Melody');
    expect(copy(ELISE_ENCORE)).toEqual(bars(m, 0, 3));
    expect(names(ELISE_ENCORE)).toEqual(['E', 'D#', 'E', 'D#', 'E', 'B', 'D', 'C', 'A', 'C', 'E', 'A', 'B', 'E', 'G#', 'B']);
    const show = byId<{ alternative: { tiles: string[] }; tempo: number }>('graduation-concert', 'show');
    expect(show.alternative.tiles.flatMap(notesIn)).toEqual(names(ELISE_ENCORE));
    expect(show.tempo).toBe(s.tempo[0].bpm);
    // The G sharp of the E answer is string 3, fret 1.
    expect(noteAt({ string: 3, fret: 1 }, { octave: false, context: { chord: 'E' } })).toBe('G#');
  });

  it('hands over to Dev with his own four checks', () => {
    // The F barre is the chord library's full shape, as Dev's welcome lesson has it.
    expect(chordVoicings('F')[0].frets.map((f) => (f === null ? 'x' : String(f))).join('')).toBe('133211');
    const card = plain(byTitle<{ body: RichText }>('graduation-concert', 'Ready for Dev').body);
    const devCard = plain((dev.lessons[0].steps.find((s) => (s as { title?: string }).title === 'The four checks') as unknown as { body: RichText }).body);
    for (const target of ['30 clean', '90 BPM', '80 BPM', '{c:G} to {c:C}', '{c:Am} to {c:F}']) {
      expect(card, target).toContain(target);
      expect(devCard, target).toContain(target);
    }
    expect(card).toMatch(/eighths at 80 BPM/);
    expect(devCard).toMatch(/eighth notes at 80 BPM/);
    // The chord trainer pairs, and the folk pattern as six strums a bar.
    expect(byId<TaskStep>('graduation-concert', 'check-changes').params).toEqual(['trainer', 'g-major', 'c-major']);
    expect(FOLK_RHYTHM.split(' ')).toHaveLength(6);
  });

  it('sends the blues to the jam the shuffle study is written on', async () => {
    const jam = progressionInKey('blues-12-bar', 'A').bars.map((b) => b[0].symbol.replace('7', ''));
    const study = await song('st-blues-shuffle-a');
    // The chord in force in each of the study's first 12 bars (a "%" bar keeps the one before).
    const inForce = (bar: number) => [...study.chords].filter((c) => c.bar <= bar).sort((a, b) => a.bar - b.bar || a.tick - b.tick).slice(-1)[0]?.symbol;
    expect(jam).toEqual(['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E']);
    expect(Array.from({ length: 12 }, (_, i) => inForce(i))).toEqual(jam);
    expect(study.tempo[0].bpm).toBe(84);
  });

  it('plays Auld Lang Syne from the library, with the Bm barre where its chart has the open Bm7', async () => {
    const task = byId<TaskStep>('graduation-concert', 'concert-auld-lang-syne');
    expect(task.params).toEqual(['auld-lang-syne']);
    const a = await song('auld-lang-syne');
    expect(a.tempo[0].bpm).toBe(80);
    expect(songEntry('auld-lang-syne')!.kind).toBe('strum-and-sing');
    // Every line starts with a pickup: the song's first bar is one beat long.
    expect(a.bars[0].length).toBe(960);
    // The chart's Bm7 holds every note of Bm, so the barre fits there; it is the library's Bm barre.
    const symbols = new Set(a.chords.map((c) => c.symbol));
    expect(symbols.has('Bm7')).toBe(true);
    expect(symbols.has('Bm')).toBe(false);
    expect(chordNotes('Bm').every((n) => chordNotes('Bm7').includes(n))).toBe(true);
    expect(chordVoicings('Bm')[0].frets.map((f) => (f === null ? 'x' : String(f))).join('')).toBe('x24432');
    expect(chordsIn(task.body)).toEqual(['Bm7', 'Bm']);
  });

  it('names a BPM in every Player task that the task really opens at', async () => {
    expect(await tempoProblems(unit)).toEqual([]);
  });
});
