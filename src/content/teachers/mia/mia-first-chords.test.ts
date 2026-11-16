/**
 * Cross-checks for Mia's unit 2 (`mia-first-chords.ts`) against the engines and the song library:
 * every shape builds the chord it names with the fingering taught, the "moves" the cards describe
 * (Em to E, E to Am, A to E7) are what the shapes really do, every "string N, fret M ({n:X})" in the
 * text names the right note, the tune on the Frere Jacques card is the library's, every task's BPM
 * is the song's tempo at the task's speed, the trainer addresses open the pair the task names, and
 * the charts the lessons quote are the charts in the library's songs.
 * Run: `npx vitest run src/content/teachers/mia/mia-first-chords.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { buildVoicing, checkVoicingFingering, parseFrets, pitchClassAt, voicingFromFrets, type Finger } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chroma, parseChord } from '@/core/theory';
import { parsePlayerParams } from '@/features/player/model/params';
import { viewFromParams } from '@/features/chords/model/symbols';
import { isTaskStep, type TaskStep, type TeacherUnit } from '../index';
import unit, { A_WIDE_FINGERS, JACQUES_TUNE, SHAPES } from './mia-first-chords';

/** The shapes the plan writes for this unit, low string first. */
const PLAN_SHAPES: Record<string, string> = { Em: '022000', E: '022100', Am: 'x02210', A: 'x02220', E7: '020100', G: 'xx0003' };

function fingersOf(s: string): Array<Finger | null> {
  return [...s].map((c) => (c === 'x' ? null : (Number(c) as Finger)));
}

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

/** Every task of the unit, with its lesson. */
function tasks(u: TeacherUnit): Array<{ lesson: string; task: TaskStep }> {
  return u.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
}

/** All text of the unit, for the claim scanner. */
function allText(u: TeacherUnit): string {
  return JSON.stringify(u).replace(/\\"/g, '"');
}

/** Chord symbols by bar (0-based) from a song's chord events: the chord in force at the start of each bar and any change inside it. */
function chordsByBar(s: Song): string[][] {
  const out: string[][] = s.bars.map(() => []);
  let current = '';
  for (let bar = 0; bar < s.bars.length; bar++) {
    const here = s.chords.filter((c) => c.bar === bar).sort((a, b) => a.tick - b.tick);
    if (here.length === 0 || here[0].tick > 0) out[bar].push(current);
    for (const c of here) {
      current = parseChord(c.symbol)?.symbol ?? c.symbol;
      out[bar].push(current);
    }
  }
  return out;
}

describe('the shapes of unit 2', () => {
  it('are the plan\'s shapes and build the chords they name, with the fingering taught', () => {
    for (const [symbol, shape] of Object.entries(SHAPES)) {
      expect(shape.frets, symbol).toBe(PLAN_SHAPES[symbol]);
      const v = buildVoicing(symbol, shape.frets);
      const want = parseChord(symbol)!;
      // Root and quality; the one-finger G (xx0003) has its D in the bass, so the engine names it G/D.
      expect([v.root, v.type], `${symbol} ${shape.frets} sounds as ${v.chord}`).toEqual([want.root, want.type.id]);
      expect(checkVoicingFingering(parseFrets(shape.frets), fingersOf(shape.fingers)), `${symbol} fingering ${shape.fingers}`).toEqual([]);
    }
    expect(checkVoicingFingering(parseFrets(SHAPES.A.frets), fingersOf(A_WIDE_FINGERS)), 'A with 2-1-3').toEqual([]);
    // The 2-1-3 fingering really is finger 2 on string 4, 1 on string 3, 3 on string 2.
    expect(fingersOf(A_WIDE_FINGERS).slice(2, 5)).toEqual([2, 1, 3]);
  });

  it('strum the strings the lessons say', () => {
    const played = (frets: string) => [...frets].map((c, i) => (c === 'x' ? null : 6 - i)).filter((s): s is number => s !== null);
    expect(played(SHAPES.Em.frets)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(played(SHAPES.E.frets)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(played(SHAPES.E7.frets)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(played(SHAPES.Am.frets)).toEqual([5, 4, 3, 2, 1]);
    expect(played(SHAPES.A.frets)).toEqual([5, 4, 3, 2, 1]);
    expect(played(SHAPES.G.frets)).toEqual([4, 3, 2, 1]);
    // "Four strings, four notes: D, G, B and G" (the one-finger G, strings 4 to 1).
    const g = buildVoicing('G', SHAPES.G.frets);
    expect(g.notes.map((x) => x.note.replace(/\d/g, ''))).toEqual(['D', 'G', 'B', 'G']);
    // "Five strings ring in A: A, E, A, C#, E"; E7 is "E, B, D, G#, B, E".
    expect(buildVoicing('A', SHAPES.A.frets).notes.map((x) => x.note.replace(/\d/g, ''))).toEqual(['A', 'E', 'A', 'C#', 'E']);
    expect(buildVoicing('E7', SHAPES.E7.frets).notes.map((x) => x.note.replace(/\d/g, ''))).toEqual(['E', 'B', 'D', 'G#', 'B', 'E']);
  });

  it('move the way the cards say', () => {
    const frets = (s: string) => parseFrets(s);
    // E is Em plus finger 1 on string 3, fret 1 (G#): only string 3 changes, G to G#.
    const em = frets(SHAPES.Em.frets);
    const e = frets(SHAPES.E.frets);
    const diff = em.map((f, i) => (f === e[i] ? null : 6 - i)).filter((s) => s !== null);
    expect(diff).toEqual([3]);
    expect(pitchClassAt({ string: 3, fret: 0 })).toBe(chroma('G'));
    expect(pitchClassAt({ string: 3, fret: 1 })).toBe(chroma('G#'));
    expect(fingersOf(SHAPES.E.fingers).slice(0, 3)).toEqual(fingersOf(SHAPES.Em.fingers).slice(0, 3));

    // Am is the whole E shape (fingers 2, 3, 1) moved one string toward string 1.
    const fretted = (shape: { frets: string; fingers: string }) =>
      [...shape.frets].map((c, i) => ({ string: 6 - i, fret: c === 'x' ? null : Number(c), finger: fingersOf(shape.fingers)[i] })).filter((x) => x.fret !== null && x.fret > 0);
    const eShape = fretted(SHAPES.E).map((x) => ({ ...x, string: x.string - 1 }));
    expect(fretted(SHAPES.Am)).toEqual(eShape);

    // A to E7: no finger stays where it was.
    const key = (x: { string: number; fret: number | null; finger: number | null }) => `${x.finger}@${x.string}:${x.fret}`;
    const a = new Set(fretted(SHAPES.A).map(key));
    expect(fretted(SHAPES.E7).filter((x) => a.has(key(x)))).toEqual([]);
    // E7 is E with finger 3 lifted: only string 4 changes, to the open D.
    const e7 = frets(SHAPES.E7.frets);
    expect(e.map((f, i) => (f === e7[i] ? null : 6 - i)).filter((s) => s !== null)).toEqual([4]);
    expect(pitchClassAt({ string: 4, fret: 0 })).toBe(chroma('D'));
  });
});

describe('the text of unit 2', () => {
  it('names the right note at every "string N, fret M" it mentions', () => {
    const text = allText(unit);
    const claims: Array<[number, number, string, string]> = [];
    for (const m of text.matchAll(/string (\d), fret (\d+),? \(\{n:([A-G][#b]?)\}\)/g)) claims.push([Number(m[1]), Number(m[2]), m[3], m[0]]);
    for (const m of text.matchAll(/string (\d), fret (\d+): \{n:([A-G][#b]?)\}/g)) claims.push([Number(m[1]), Number(m[2]), m[3], m[0]]);
    for (const m of text.matchAll(/String (\d), fret (\d+) is \{n:([A-G][#b]?)\}/g)) claims.push([Number(m[1]), Number(m[2]), m[3], m[0]]);
    for (const m of text.matchAll(/string (\d), the open \{n:([A-G][#b]?)\}(?! on string)/g)) claims.push([Number(m[1]), 0, m[2], m[0]]);
    expect(claims.length).toBeGreaterThan(10);
    for (const [string, fret, name, where] of claims) expect(pitchClassAt({ string, fret }), where).toBe(chroma(name));
  });

  it('plays the Frere Jacques tune as the library has it', async () => {
    const s = await song('frere-jacques');
    const tune = s.tracks.find((t) => t.name === 'Teacher')!;
    const DUR: Record<number, string> = { 480: 'e', 960: 'q', 1920: 'h', 3840: 'w' };
    const bars = tune.measures.slice(0, 4).flatMap((m) => m.beats.filter((b) => b.notes.length > 0).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret, duration: DUR[b.duration] })));
    expect(JACQUES_TUNE.map((x) => ({ ...x }))).toEqual(bars);
  });
});

describe('the music the tasks open', () => {
  it('names the BPM the Player will really play', async () => {
    for (const { lesson, task } of tasks(unit)) {
      if (task.tool !== 'player') continue;
      const req = parsePlayerParams(task.params ?? []);
      const entry = songEntry(req.songId!);
      expect(entry, `${lesson} > ${task.id}: song ${req.songId}`).toBeTruthy();
      const s = await song(req.songId!);
      const bpm = s.tempo[0].bpm * (req.tempo ?? 100) / 100;
      const body = typeof task.body === 'string' ? task.body : task.body.text;
      const said = Number(/(\d+) \{t:bpm\|BPM\}/.exec(body)?.[1]);
      expect(Math.abs(said - bpm), `${lesson} > ${task.id}: says ${said} BPM, plays ${bpm.toFixed(1)}`).toBeLessThanOrEqual(1);
      // "set the speed to 107 % (64 BPM)": the percentage gives that BPM.
      for (const m of body.matchAll(/(\d+) % \((\d+) BPM\)/g)) expect(Math.abs(Number(m[2]) - s.tempo[0].bpm * Number(m[1]) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      if (req.loop) expect(req.loop.to, `${lesson} > ${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
    }
  });

  it('opens the chord trainer on the pair each task names', () => {
    const pairs: Record<string, string[]> = {
      'trainer-em-e': ['Em', 'E'],
      'trainer-e-am': ['E', 'Am'],
      'trainer-em-a': ['Em', 'A'],
      'minute-a-e7': ['A', 'E7'],
      'minute-changes': ['A', 'E7'],
    };
    const found = tasks(unit).filter((t) => t.task.tool === 'chords');
    expect(found.map((t) => t.task.id).sort()).toEqual(Object.keys(pairs).sort());
    for (const { task } of found) {
      const view = viewFromParams(task.params ?? []);
      expect(view.view, task.id).toBe('trainer');
      expect(view.view === 'trainer' ? view.chords : [], task.id).toEqual(pairs[task.id]);
    }
  });

  it('quotes the charts of the library songs', async () => {
    // Strumming: Steady Quarters: Em 4 bars, A 4 bars, twice (the fill-blanks of the-a-chord).
    const quarters = chordsByBar(await song('st-strum-quarters'));
    expect(quarters.map((c) => c.join('/'))).toEqual([...Array(4).fill('Em'), ...Array(4).fill('A'), ...Array(4).fill('Em'), ...Array(4).fill('A')]);
    // The Am-E half of Change: Am-E and E-B7 is bars 1 to 8, with no B7 in it.
    const ladder = chordsByBar(await song('st-change-am-e-e-b7'));
    expect(new Set(ladder.slice(0, 8).flat())).toEqual(new Set(['Am', 'E']));
    expect(ladder.slice(8).flat()).toContain('B7');
    // Change: A and E7 is 16 bars of A and E7: the 8-bar ladder twice.
    const ae7 = await song('st-change-a-e7');
    expect(ae7.bars.length).toBe(16);
    expect(new Set(chordsByBar(ae7).flat())).toEqual(new Set(['A', 'E7']));
    // Skip to My Lou: 2/4; each 8-bar verse is A A | E7 E7 | A A | E7 A (the order exercise).
    const lou = await song('skip-to-my-lou');
    expect(lou.bars.every((b) => b.time.numerator === 2 && b.time.denominator === 4)).toBe(true);
    const louBars = chordsByBar(lou);
    for (let v = 0; v < lou.bars.length / 8; v++) {
      expect(louBars.slice(v * 8, v * 8 + 8).map((c) => c.join('/')), `verse ${v + 1}`).toEqual(['A', 'A', 'E7', 'E7', 'A', 'A', 'E7', 'A']);
    }
    // The Open-String Duet: Em under bars 1 to 4 and Am under bars 5 to 8 (the swapped parts).
    const duet = chordsByBar(await song('st-open-string-duet'));
    expect(duet.slice(0, 8).map((c) => c.join('/'))).toEqual([...Array(4).fill('Em'), ...Array(4).fill('Am')]);
    // Frere Jacques: one chord, G, all the way; the round is bars 9 to 18 and the second voice enters at bar 11.
    const jacques = await song('frere-jacques');
    expect(new Set(chordsByBar(jacques).flat())).toEqual(new Set(['G']));
    expect(jacques.bars.length).toBe(18);
    const second = jacques.tracks.find((t) => t.name === 'Second voice')!;
    const firstNoteBar = second.measures.findIndex((m) => m.beats.some((b) => b.notes.length > 0));
    expect(firstNoteBar + 1).toBe(11);
  });
});

// Added in review: the claims the review's fixes make, checked against the engine and the songs.
describe('the review fixes of unit 2', () => {
  const lessonOf = (id: string) => unit.lessons.find((l) => l.id === id)!;
  const textOf = (t: unknown): string => (typeof t === 'string' ? t : t && typeof t === 'object' && 'text' in t ? String((t as { text: unknown }).text) : '');
  const playChord = (lesson: string, chord: string) =>
    lessonOf(lesson).steps.find((s) => (s as { type?: string }).type === 'play-chord' && (s as { chord?: string }).chord === chord) as unknown as { prompt: string; frets: string };

  it('tells the learner what the play-chord box draws where it differs from the fingering taught', () => {
    // The play step draws its chord box with the engine's own fingering (`PlayView` passes no
    // fingers), so the prompt names it. If the engine's fingering changes, these prompts are stale.
    const drawn = (frets: string, as: string) => voicingFromFrets(parseFrets(frets), { as })!.fingers;
    const em = playChord('chord-boxes-and-em', 'Em');
    expect(drawn(em.frets, 'Em')).toEqual([0, 1, 2, 0, 0, 0]);
    expect(SHAPES.Em.fingers).toBe('023000');
    expect(em.prompt).toMatch(/The box says fingers 1 and 2; your 2 and 3 are fine/);
    const g = playChord('frere-jacques-strum', 'G');
    expect(drawn(g.frets, 'G')).toEqual([null, null, 0, 0, 0, 1]);
    expect(SHAPES.G.fingers).toBe('xx0003');
    expect(g.prompt).toMatch(/The box shows finger 1 on string 1; your finger 3 is fine/);
    // Every other play-chord box of the unit draws exactly the fingering the unit teaches, so needs no note.
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        const x = s as unknown as { type?: string; chord?: string; frets?: string; prompt?: string };
        if (x.type !== 'play-chord' || x.chord === 'Em' || x.chord === 'G') continue;
        const taught = fingersOf(SHAPES[x.chord as keyof typeof SHAPES].fingers).map((f) => f ?? null);
        expect(drawn(x.frets!, x.chord!).map((f) => f ?? null), `${l.id}: ${x.chord}`).toEqual(taught);
      }
    }
  });

  it('says what is normal and what is not where the hands work hardest', () => {
    const hurts = (t: string) => /Sore fingertips are normal/.test(t) && /(aching|sharp pain)/.test(t) && /stop/.test(t);
    const tips = (id: string) => lessonOf(id).steps.map((s) => textOf((s as { tip?: unknown }).tip));
    expect(tips('chord-boxes-and-em').some(hurts), 'first chord lesson').toBe(true);
    expect(tips('e-and-am').some(hurts), 'first chord changes').toBe(true);
    expect(tips('the-a-chord').some(hurts), 'three fingers squeezed in').toBe(true);
  });

  it('describes the chord trainer as it works', () => {
    for (const { lesson, task } of tasks(unit)) {
      if (task.tool !== 'chords') continue;
      const body = textOf(task.body);
      // "Changes in time" has a click; without the microphone the learner taps when the fingers land.
      if (/Changes in time/.test(body)) {
        expect(body, `${lesson} > ${task.id}`).toMatch(/without it, tap when your fingers land/);
        expect(body, `${lesson} > ${task.id}`).toMatch(/60 \{t:bpm\|BPM\}/);
        expect(body, `${lesson} > ${task.id}`).toMatch(/4 beats per chord/);
      }
      // "One-minute changes" has no click: it must not ask for a strum on every beat.
      if (/One-minute changes/.test(body)) expect(body, `${lesson} > ${task.id}`).not.toMatch(/a beat|per beat|on the beat/);
    }
  });

  it('describes when the chords of Skip to My Lou change', async () => {
    const lou = await song('skip-to-my-lou');
    const byBar = chordsByBar(lou).map((c) => c.join('/'));
    const changes = byBar.map((c, i) => (i > 0 && c !== byBar[i - 1] ? i % 8 : -1)).filter((i) => i >= 0);
    // Every two bars (bars 3, 5, 7 of each verse: 0-based 2, 4, 6), plus one quicker change in bar 8;
    // the next verse starts on the A that ended the last one, so bar 1 is no change.
    expect(new Set(changes)).toEqual(new Set([2, 4, 6, 7]));
    const card = lessonOf('skip-to-my-lou').steps[0] as { body: string };
    expect(card.body).toMatch(/changing every two bars, with one quicker change at the very end/);
  });
});
