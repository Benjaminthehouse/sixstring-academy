/**
 * Cross-checks for Mia's unit 3 (`mia-melodies-from-tab.ts`) against the engines and the song
 * library: every tune on a card or in a play step is the library's, note for note and beat for
 * beat; the bars a step or a tile list quotes are those bars; every "string N, fret M" in the text
 * names the right note; the theory claims (a fifth is five letter names, E-F and B-C are one fret)
 * are what the theory engine says; every BPM a task names is what the Player will play; and the
 * charts and forms the lessons describe are the songs' own.
 * Run: `npx vitest run src/content/teachers/mia/mia-melodies-from-tab.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, pitchClassAt } from '@/core/guitar';
import { parseSixTab, type Song, type Track } from '@/core/song';
import { chroma, intervalBetween, parseChord, semitones } from '@/core/theory';
import { parsePlayerParams } from '@/features/player/model/params';
import { parseRhythm, type TabNote } from '@/lessons';
import { isTaskStep, type TaskStep, type TeacherUnit } from '../index';
import unit, { AU_CLAIR_A, JINGLE_LINE_1, MARY, ODE_LINE_1, ODE_LINE_B, TWINKLE_A } from './mia-melodies-from-tab';

const DUR: Record<number, string> = { 240: 's', 480: 'e', 720: 'e.', 960: 'q', 1440: 'q.', 1920: 'h', 2880: 'h.', 3840: 'w' };

async function song(id: string): Promise<Song> {
  const { song: parsed, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return parsed!;
}

function melody(s: Song): Track {
  return s.tracks.find((t) => t.role === 'lead')!;
}

/** Bars `from` to `to` (1-based, inclusive) of a track as tab notes. */
function bars(track: Track, from: number, to: number): TabNote[] {
  return track.measures.slice(from - 1, to).flatMap((m) =>
    m.beats.filter((b) => b.notes.length > 0).map((b) => ({ string: b.notes[0].string, fret: b.notes[0].fret, duration: DUR[b.duration] ?? String(b.duration) })),
  );
}

/** Note names (no octave) of tab notes. */
function names(notes: readonly TabNote[]): string[] {
  return notes.map((x) => ('rest' in x ? 'r' : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midiAt(x) % 12]));
}

/** The plain note names of a tile such as `{n:B} {n:A} {n:G}`. */
function tileNames(tile: string): string[] {
  return [...tile.matchAll(/\{n:([A-G][#b]?)\}/g)].map((m) => m[1]);
}

/** Durations of a rhythm pattern, as tab codes. */
function rhythmCodes(pattern: string, time?: string): string[] {
  const parsed = parseRhythm({ pattern, ...(time ? { time } : {}) });
  expect(parsed.problems, pattern).toEqual([]);
  return parsed.events.filter((e) => !e.rest).map((e) => DUR[e.ticks] ?? String(e.ticks));
}

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

function lesson(id: string) {
  const l = unit.lessons.find((x) => x.id === id);
  expect(l, id).toBeTruthy();
  return l!;
}

function step<T = Record<string, unknown>>(lessonId: string, pred: (s: Record<string, unknown>) => boolean): T {
  const s = lesson(lessonId).steps.find((x) => pred(x as unknown as Record<string, unknown>));
  expect(s, `${lessonId}: step`).toBeTruthy();
  return s as unknown as T;
}

function tasks(u: TeacherUnit): Array<{ lesson: string; task: TaskStep }> {
  return u.lessons.flatMap((l) => l.steps.filter(isTaskStep).map((task) => ({ lesson: l.id, task })));
}

function textOf(t: TaskStep['body']): string {
  return typeof t === 'string' ? t : t.text;
}

describe('the tunes of unit 3 are the library\'s', () => {
  it('note for note and beat for beat', async () => {
    const plain = (xs: readonly TabNote[]) => xs.map((x) => ({ ...x }));
    expect(plain(AU_CLAIR_A)).toEqual(bars(melody(await song('au-clair-de-la-lune')), 1, 4));
    expect(plain(MARY)).toEqual(bars(melody(await song('mary-had-a-little-lamb')), 1, 8));
    const twinkle = melody(await song('twinkle-twinkle-little-star'));
    expect(plain(TWINKLE_A)).toEqual(bars(twinkle, 1, 4));
    const ode = melody(await song('ode-to-joy-theme'));
    expect(plain(ODE_LINE_1)).toEqual(bars(ode, 1, 4));
    expect(plain(ODE_LINE_B)).toEqual(bars(ode, 9, 12));
    expect(plain(JINGLE_LINE_1)).toEqual(bars(melody(await song('jingle-bells')), 1, 4));
  });

  it('as the plan writes them', () => {
    // The plan's show lines, bar by bar.
    expect(names(AU_CLAIR_A).join(' ')).toBe('G G G A B A G B A A G');
    expect(names(MARY).join(' ')).toBe('B A G A B B B A A A B D D B A G A B B B B A A B A G');
    expect(names(TWINKLE_A).join(' ')).toBe('G G D D E E D C C B B A A G');
    // Ode to Joy: B held for a beat and a half, A short, A held (bar 4).
    expect(ODE_LINE_1.slice(-3).map((x) => ('rest' in x ? '' : `${names([x])[0]}:${x.duration}`))).toEqual(['B:q.', 'A:e', 'A:h']);
    // Line B ends on the low D, the open string 4.
    expect(ODE_LINE_B[ODE_LINE_B.length - 1]).toEqual({ string: 4, fret: 0, duration: 'h' });
    expect(midiAt({ string: 4, fret: 0 })).toBe(50);
  });

  it('in the bars each step quotes', () => {
    // tab-and-rhythm: the play step is bars 1 and 2; its tiles are the four bars.
    const clairPlay = step<{ notes: TabNote[]; alternative: { tiles: string[] } }>('tab-and-rhythm', (s) => s.type === 'play-phrase');
    expect(names(clairPlay.notes)).toEqual(['G', 'G', 'G', 'A', 'B', 'A']);
    expect(clairPlay.alternative.tiles.map(tileNames)).toEqual([['G', 'G', 'G', 'A'], ['B', 'A'], ['G', 'B', 'A', 'A'], ['G']]);
    // Mary: the crossing is bars 3 and 4; the tiles are bars 1 to 4.
    const maryPlay = step<{ notes: TabNote[]; alternative: { tiles: string[] } }>('mary-had-a-little-lamb', (s) => s.type === 'play-phrase');
    expect(names(maryPlay.notes)).toEqual(['A', 'A', 'A', 'B', 'D', 'D']);
    expect(maryPlay.alternative.tiles.map(tileNames)).toEqual([['B', 'A', 'G', 'A'], ['B', 'B', 'B'], ['A', 'A', 'A'], ['B', 'D', 'D']]);
    // Twinkle: the jump G G D D, twice.
    const jump = step<{ notes: TabNote[] }>('twinkle-twinkle', (s) => s.type === 'play-phrase');
    expect(names(jump.notes)).toEqual(['G', 'G', 'D', 'D', 'G', 'G', 'D', 'D']);
    // Ode to Joy: bars 3 and 4.
    const odePlay = step<{ notes: TabNote[]; alternative: { rhythm: { pattern: string } } }>('ode-to-joy', (s) => s.type === 'play-phrase');
    expect(names(odePlay.notes)).toEqual(['G', 'G', 'A', 'B', 'B', 'A', 'A']);
    expect(rhythmCodes(odePlay.alternative.rhythm.pattern)).toEqual(odePlay.notes.map((x) => x.duration));
    // The recital show and its tiles: the first line of the Jingle Bells chorus, bar by bar.
    const show = step<{ notes: TabNote[]; alternative: { tiles: string[] } }>('melody-recital', (s) => s.id === 'show');
    expect(show.notes).toEqual(JINGLE_LINE_1);
    expect(show.alternative.tiles.map(tileNames)).toEqual([['B', 'B', 'B'], ['B', 'B', 'B'], ['B', 'D', 'G', 'A'], ['B']]);
  });

  it('with the rhythms each tap step quotes', async () => {
    const taps = (l: string) => lesson(l).steps.filter((s) => (s as { type?: string }).type === 'tap-rhythm') as unknown as Array<{ rhythm: { pattern: string; time?: string } }>;
    // Bar 2 of Au Clair de la Lune: two half notes.
    expect(rhythmCodes(taps('tab-and-rhythm')[0].rhythm.pattern)).toEqual(AU_CLAIR_A.slice(4, 6).map((x) => x.duration));
    // Bar 4 of Ode to Joy.
    expect(rhythmCodes(taps('ode-to-joy')[0].rhythm.pattern)).toEqual(ODE_LINE_1.slice(-3).map((x) => x.duration));
    // Bars 3 and 4 of Jingle Bells.
    expect(rhythmCodes(taps('melody-recital')[0].rhythm.pattern)).toEqual(JINGLE_LINE_1.slice(6).map((x) => x.duration));
    // Bar 1 of London Bridge, in 2/4: Lon-don is long-short.
    const london = await song('london-bridge');
    expect(london.bars.every((b) => b.time.numerator === 2 && b.time.denominator === 4)).toBe(true);
    const lb = taps('twinkle-twinkle')[0];
    expect(lb.rhythm.time).toBe('2/4');
    expect(rhythmCodes(lb.rhythm.pattern, lb.rhythm.time)).toEqual(bars(melody(london), 1, 1).map((x) => x.duration));
    expect(names(bars(melody(london), 1, 2)).join(' ')).toBe('D E D C B C D');
  });
});

describe('the text of unit 3', () => {
  it('names the right note at every position it mentions', () => {
    const text = JSON.stringify(unit).replace(/\\"/g, '"');
    const claims: Array<[number, number, string, string]> = [];
    const add = (re: RegExp, pick: (m: RegExpMatchArray) => [number, number, string]) => {
      for (const m of text.matchAll(re)) claims.push([...pick(m), m[0]]);
    };
    add(/string (\d), fret (\d+) \(\{n:([A-G][#b]?)\}\)/g, (m) => [Number(m[1]), Number(m[2]), m[3]]);
    add(/\{n:([A-G][#b]?)\} at string (\d), fret (\d+)/g, (m) => [Number(m[2]), Number(m[3]), m[1]]);
    add(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]?)\}/g, (m) => [Number(m[1]), Number(m[2]), m[3]]);
    add(/open string (\d) \(\{n:([A-G][#b]?)\}\)/g, (m) => [Number(m[1]), 0, m[2]]);
    add(/the open string (\d), \{n:([A-G][#b]?)\}[.,]/g, (m) => [Number(m[1]), 0, m[2]]);
    add(/\{n:([A-G][#b]?)\} is the open string (\d)/g, (m) => [Number(m[2]), 0, m[1]]);
    add(/open string (\d), the low \{n:([A-G][#b]?)\}/g, (m) => [Number(m[1]), 0, m[2]]);
    add(/[Oo]pen string (\d) is \{n:([A-G][#b]?)\}/g, (m) => [Number(m[1]), 0, m[2]]);
    add(/\{n:([A-G][#b]?)\} on the open string (\d)/g, (m) => [Number(m[2]), 0, m[1]]);
    add(/String (\d): open \{n:([A-G])\}, fret 1 \{n:([A-G])\}, fret 3 \{n:([A-G])\}/g, (m) => [Number(m[1]), 0, m[2]]);
    for (const m of text.matchAll(/String (\d): open \{n:([A-G])\}, fret 1 \{n:([A-G])\}, fret 3 \{n:([A-G])\}/g)) {
      claims.push([Number(m[1]), 1, m[3], m[0]], [Number(m[1]), 3, m[4], m[0]]);
    }
    expect(claims.length).toBeGreaterThan(25);
    for (const [string, fret, name, where] of claims) expect(pitchClassAt({ string, fret }), where).toBe(chroma(name));
  });

  it('teaches the theory the engine agrees with', () => {
    // G up to D is a fifth: five letter names, seven half steps (seven frets on one string).
    expect(intervalBetween('G3', 'D4')).toBe('P5');
    expect(semitones('P5')).toBe(7);
    expect(midiAt({ string: 2, fret: 3 }) - midiAt({ string: 3, fret: 0 })).toBe(7);
    // E-F and B-C are one fret apart; F-G and C-D two.
    expect(midiAt({ string: 1, fret: 1 }) - midiAt({ string: 1, fret: 0 })).toBe(1);
    expect(midiAt({ string: 2, fret: 1 }) - midiAt({ string: 2, fret: 0 })).toBe(1);
    expect(intervalBetween('E4', 'F4')).toBe('m2');
    expect(intervalBetween('B3', 'C4')).toBe('m2');
    expect(intervalBetween('F4', 'G4')).toBe('M2');
    expect(intervalBetween('C4', 'D4')).toBe('M2');
    // The play-note drill draws exactly E F G on string 1 and B C D on string 2 (naturals, frets 0 to 3).
    const naturals = [1, 2].flatMap((s) => [0, 1, 2, 3].map((f) => ({ s, f, pc: pitchClassAt({ string: s, fret: f }) }))).filter((x) => [0, 2, 4, 5, 7, 9, 11].includes(x.pc));
    expect(naturals.map((x) => `${x.s}:${x.f}`)).toEqual(['1:0', '1:1', '1:3', '2:0', '2:1', '2:3']);
  });

  it('describes the songs\' forms and charts as they are', async () => {
    const twinkle = melody(await song('twinkle-twinkle-little-star'));
    // A B A: bars 9 to 12 are line A again; line B (bars 5 and 6) is played twice.
    expect(bars(twinkle, 9, 12)).toEqual(bars(twinkle, 1, 4));
    expect(bars(twinkle, 7, 8)).toEqual(bars(twinkle, 5, 6));
    expect(twinkle.measures.length).toBe(12);
    // Ode to Joy: A A B A with the first A ending on A and the others on G.
    const ode = melody(await song('ode-to-joy-theme'));
    expect(bars(ode, 13, 16)).toEqual(bars(ode, 5, 8));
    expect(bars(ode, 5, 7)).toEqual(bars(ode, 1, 3));
    expect(names(bars(ode, 8, 8)).pop()).toBe('G');
    // Mary: D7 in bars 3 and 7 under G; Ode: G and D; Twinkle: G, C and D7; String 1 study: C and G7.
    const mary = chordsByBar(await song('mary-had-a-little-lamb'));
    expect(mary.map((c, i) => (c.includes('D7') ? i + 1 : 0)).filter(Boolean)).toEqual([3, 7]);
    expect(new Set(mary.flat())).toEqual(new Set(['G', 'D7']));
    expect(new Set(chordsByBar(await song('ode-to-joy-theme')).flat())).toEqual(new Set(['G', 'D']));
    expect(new Set(chordsByBar(await song('twinkle-twinkle-little-star')).flat())).toEqual(new Set(['G', 'C', 'D7']));
    expect(new Set(chordsByBar(await song('st-first-notes-string-1')).flat())).toEqual(new Set(['C', 'G7']));
    // String 2 study: bars 1 to 4 on string 2 only, bars 5 to 8 on strings 2 and 1.
    const s2 = melody(await song('st-first-notes-string-2'));
    expect(new Set(bars(s2, 1, 4).map((x) => ('rest' in x ? 0 : x.string)))).toEqual(new Set([2]));
    expect(new Set(bars(s2, 5, 8).map((x) => ('rest' in x ? 0 : x.string)))).toEqual(new Set([1, 2]));
    // String 3 study: bars 5 to 8 cross strings 3, 2 and 1.
    const s3 = melody(await song('st-first-notes-string-3'));
    expect(new Set(bars(s3, 5, 8).map((x) => ('rest' in x ? 0 : x.string)))).toEqual(new Set([1, 2, 3]));
    expect(s3.measures.length).toBe(8);
    // Lightly Row adds C (string 2, fret 1) to Mary's four notes and stays on strings 3 and 2.
    const lightly = bars(melody(await song('lightly-row')), 1, 16);
    expect(new Set(names(lightly))).toEqual(new Set(['G', 'A', 'B', 'C', 'D']));
    expect(new Set(lightly.map((x) => ('rest' in x ? 0 : x.string)))).toEqual(new Set([2, 3]));
    // Jingle Bells chorus: strings 3 and 2, the five notes the encore card lists.
    const jingle = bars(melody(await song('jingle-bells')), 1, 16);
    expect(new Set(jingle.map((x) => ('rest' in x ? 0 : x.string)))).toEqual(new Set([2, 3]));
    expect(new Set(names(jingle))).toEqual(new Set(['G', 'A', 'B', 'C', 'D']));
  });
});

describe('the music the tasks open', () => {
  it('plays at the BPM each task names', async () => {
    for (const { lesson: l, task } of tasks(unit)) {
      if (task.tool !== 'player') continue;
      const req = parsePlayerParams(task.params ?? []);
      expect(songEntry(req.songId!), `${l} > ${task.id}: song ${req.songId}`).toBeTruthy();
      const s = await song(req.songId!);
      const own = s.tempo[0].bpm;
      const body = textOf(task.body);
      // The first BPM a play-along names is the speed the task opens at (wait mode has no speed).
      if (req.mode !== 'wait') {
        const said = Number(/(\d+) \{t:bpm\|BPM\}/.exec(body)?.[1]);
        const plays = own * (req.tempo ?? 100) / 100;
        expect(Math.abs(said - plays), `${l} > ${task.id}: says ${said} BPM, plays ${plays.toFixed(1)}`).toBeLessThanOrEqual(1);
      }
      // "72 BPM (set the speed to 82 %)" and "100 % (96 BPM)": the percentage gives that BPM.
      for (const m of body.matchAll(/(\d+) \{t:bpm\|BPM\} \(set the speed to (\d+) %\)/g)) expect(Math.abs(Number(m[1]) - own * Number(m[2]) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      for (const m of body.matchAll(/(\d+) % \((\d+) BPM\)/g)) expect(Math.abs(Number(m[2]) - own * Number(m[1]) / 100), `${task.id}: ${m[0]}`).toBeLessThanOrEqual(1);
      // "at 88, the full speed" is the song's own tempo.
      for (const m of body.matchAll(/(\d+) (?:\{t:bpm\|BPM\} )?\(?,? ?the full speed/g)) expect(Number(m[1]), `${task.id}: ${m[0]}`).toBe(own);
      if (req.loop) expect(req.loop.to, `${l} > ${task.id}: loop inside the song`).toBeLessThan(s.bars.length);
    }
  });

  it('gives the recital set at the songs\' own tempos, in Flow mode', async () => {
    const card = step<{ body: string }>('melody-recital', (s) => s.title === 'Your set list');
    const said = [...card.body.matchAll(/at (\d+)/g)].map((m) => Number(m[1]));
    const ids = ['mary-had-a-little-lamb', 'twinkle-twinkle-little-star', 'ode-to-joy-theme'];
    const own = await Promise.all(ids.map(async (id) => (await song(id)).tempo[0].bpm));
    expect(said).toEqual(own);
    const set = tasks(unit).filter((t) => t.lesson === 'melody-recital' && t.task.tool === 'player' && t.task.id.startsWith('set-'));
    expect(set.map((t) => t.task.params)).toEqual(ids.map((id) => [id, 'flow']));
  });

  it('opens the spider at its first rung, in fifth position', () => {
    const spider = getExercise('tech-spider')!;
    expect(spider.tempo.start).toBe(50);
    expect(spider.parts.map((p) => p.name)).toContain('Fifth position');
    expect(spider.steps[0]).toMatch(/finger 1 at fret 5, 2 at fret 6, 3 at fret 7, 4 at fret 8/);
  });
});
