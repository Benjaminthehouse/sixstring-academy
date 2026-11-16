/**
 * Cross-checks for Mia's unit 8 (Riffs and melodies) against the engines and the song library:
 * the low-string notes and the three First Notes studies, the licks' hammer-ons and pull-offs,
 * Deck the Halls and its sharps, Joy to the World as the D major scale, Eine kleine Nachtmusik as
 * the notes of G, Für Elise note for note (the rocking figure, the two answers with the G sharp,
 * the show), every "string N, fret M ({n:X})" the text names, the fiddle-tune fallbacks, and every
 * tempo a task names. Run with `npx vitest run src/content/teachers/mia/mia-riffs-and-melodies.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise } from '@/content/technique';
import { midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song, type Track } from '@/core/song';
import { chordNotes, chroma, parseNote, scaleNotes } from '@/core/theory';
import { estimateLessonSeconds, formatProblems, phraseMidi, validateCourse, type PlayPhraseExercise, type RichText, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong, type TaskStep, type TeacherUnit } from '../index';
import unit, { DECK_OPENING, ELISE_ANSWERS, ELISE_OPENING, ELISE_SHOW, HAMMER_ALL, JOY_PHRASE, JOY_SCALE, LOW_NOTES, NACHTMUSIK_OPENING, PULL_OFFS } from './mia-riffs-and-melodies';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

const DUR: Record<number, string> = { 240: 's', 480: 'e', 720: 'e.', 960: 'q', 1440: 'q.', 1920: 'h', 2880: 'h.', 3840: 'w' };
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function melody(s: Song): Track {
  return s.tracks.find((t) => t.role === 'lead')!;
}

/** Bars `from` to `to` (0-based song bar indexes, inclusive) of a track as tab notes, rests included. */
function bars(t: Track, from: number, to: number): TabNote[] {
  return t.measures.slice(from, to + 1).flatMap((m) =>
    m.beats.map((b): TabNote => (b.notes.length === 0 ? { rest: true, duration: DUR[b.duration] ?? String(b.duration) } : { string: b.notes[0].string, fret: b.notes[0].fret, duration: DUR[b.duration] ?? String(b.duration) })),
  );
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

function copy(xs: readonly TabNote[]): TabNote[] {
  return xs.map((x) => ({ ...x }));
}

function names(xs: readonly TabNote[]): string[] {
  return xs.filter((x): x is Exclude<TabNote, { rest: true }> => !('rest' in x)).map((x) => PC[midiAt(x) % 12]);
}

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

/** Every "string N, fret M ({n:X})", "open string N ({n:X})" and "{n:X} at string N, fret M" in the unit, checked on the neck. */
function positionClaims(u: TeacherUnit): { checked: number; problems: string[] } {
  const problems: string[] = [];
  let checked = 0;
  const check = (claim: string, string: number, fret: number, note: string) => {
    checked++;
    if (chroma(noteAt({ string, fret }, { octave: false })) !== chroma(note)) problems.push(claim);
  };
  for (const t of texts(u)) {
    for (const m of t.matchAll(/string (\d), fret (\d+),? \(\{n:([A-G][#b]?)\}\)/g)) check(m[0], Number(m[1]), Number(m[2]), m[3]);
    for (const m of t.matchAll(/open string (\d) \(\{n:([A-G][#b]?)\}\)/g)) check(m[0], Number(m[1]), 0, m[2]);
    for (const m of t.matchAll(/\{n:([A-G][#b]?)\},? at string (\d), fret (\d+)/g)) check(m[0], Number(m[2]), Number(m[3]), m[1]);
  }
  return { checked, problems };
}

const SPEED = { BPM: 1, 'big beats a minute': 2 / 3, 'eighth-note counts a minute': 2 } as const;
const PCT = /(\d+) % \((?:about )?(\d+) (BPM|big beats a minute|eighth-note counts a minute)\)/g;
const BARE = /(\d+) (BPM|big beats a minute|eighth-note counts a minute)/;

/** Problems with the tempos a task's words name (see mia-strumming-patterns.test.ts). */
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
        let namesOpening = false;
        for (const m of text.matchAll(PCT)) {
          if (Number(m[1]) === pct) namesOpening = true;
          const want = (bpm * Number(m[1]) * SPEED[m[3] as keyof typeof SPEED]) / 100;
          if (Math.abs(want - Number(m[2])) > 1) out.push(`${l.id} > ${st.id}: "${m[0]}", but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
        }
        text = text.replace(PCT, '');
        const first = text.match(BARE);
        if (!first) {
          if (!namesOpening && !(target.params ?? []).includes('wait')) out.push(`${l.id} > ${st.id}: names no tempo`);
          continue;
        }
        const opens = (bpm * pct * SPEED[first[2] as keyof typeof SPEED]) / 100;
        if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${st.id}: says "${first[0]}", opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
      }
    }
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('mia'), [unit]);

describe('Mia unit 8: Riffs and melodies', () => {
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

  it('names every position as the neck has it', () => {
    for (const d of LOW_NOTES) expect(midiAt(d), `${d.string}:${d.fret}`).toBe(parseNote(d.note)!.midi);
    // E to F and B to C are one fret apart; the other neighbours two.
    expect(midiAt({ string: 6, fret: 1 }) - midiAt({ string: 6, fret: 0 })).toBe(1);
    expect(midiAt({ string: 5, fret: 3 }) - midiAt({ string: 5, fret: 2 })).toBe(1);
    expect(midiAt({ string: 4, fret: 3 }) - midiAt({ string: 4, fret: 2 })).toBe(1);
    expect(midiAt({ string: 6, fret: 3 }) - midiAt({ string: 6, fret: 1 })).toBe(2);
    const claims = positionClaims(unit);
    expect(claims.problems).toEqual([]);
    expect(claims.checked).toBeGreaterThanOrEqual(20);
  });

  it('sends the learner to studies that use exactly the notes the lesson teaches', async () => {
    for (const [id, str, frets] of [['st-first-notes-string-4', 4, [0, 2, 3]], ['st-first-notes-string-5', 5, [0, 2, 3]], ['st-first-notes-string-6', 6, [0, 1, 3]]] as const) {
      const s = await song(id);
      const notes = melody(s).measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
      expect(new Set(notes.map((n) => n.string)), id).toEqual(new Set([str]));
      expect([...new Set(notes.map((n) => n.fret))].sort(), id).toEqual([...frets]);
      expect(s.tempo[0].bpm, id).toBe(72);
    }
    // Sakura uses string 4 frets 2 and 3 and string 5 fret 2 among its notes.
    const sakura = melody(await song('sakura')).measures.flatMap((m) => m.beats.flatMap((b) => b.notes)).map((n) => `${n.string}:${n.fret}`);
    for (const p of ['4:2', '4:3', '5:2']) expect(sakura, p).toContain(p);
  });

  it('plays the licks\' hammer-ons and pull-offs as the library writes them', async () => {
    const hammer = melody(await song('st-lick-hammer-on'));
    expect(copy(HAMMER_ALL)).toEqual(bars(hammer, 6, 6).slice(0, 8));
    // Every second note is hammered from the open string before it.
    const bar7 = hammer.measures[6].beats.slice(0, 8).map((b) => b.notes[0]);
    expect(bar7.map((n) => n.legato ?? null)).toEqual([null, 'hammer', null, 'hammer', null, 'hammer', null, 'hammer']);
    // The plan's four hammer-ons: E, A, D and G, each from an open string.
    expect(names(HAMMER_ALL.filter((_, i) => i % 2 === 1))).toEqual(['E', 'A', 'D', 'G']);
    // The three pull-offs, G to E, D to B, A to G, are pairs the pull-off lick plays.
    const pull = melody(await song('st-lick-pull-off'));
    const notes = pull.measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    const pairs = new Set(notes.flatMap((n, i) => (n.legato === 'pull' && i > 0 ? [`${notes[i - 1].string}:${notes[i - 1].fret}>${n.string}:${n.fret}`] : [])));
    for (let i = 0; i < PULL_OFFS.length; i += 2) {
      const [a, b] = [PULL_OFFS[i], PULL_OFFS[i + 1]] as Array<{ string: number; fret: number }>;
      expect(pairs, `${a.string}:${a.fret}>${b.string}:${b.fret}`).toContain(`${a.string}:${a.fret}>${b.string}:${b.fret}`);
    }
    expect(names(PULL_OFFS)).toEqual(['G', 'E', 'D', 'B', 'A', 'G']);
    // The play step is one hammer-on, the open string 3 to fret 2, five times.
    const play = step<PlayPhraseExercise>('hammer-ons-and-pull-offs', (s) => s.type === 'play-phrase');
    expect(phraseMidi(play)).toEqual(Array.from({ length: 5 }, () => [55, 57]).flat());
    expect(getExercise('tech-legato-chains')!.steps.join(' ')).toMatch(/frets 5, 7 and 8 with fingers 1, 3 and 4/);
  });

  it('plays Deck the Halls and its sharps as the library has them', async () => {
    const deck = melody(await song('deck-the-halls'));
    expect(copy(DECK_OPENING)).toEqual(bars(deck, 0, 1));
    expect(names(DECK_OPENING).join(' ')).toBe('D C B A G A B G');
    // The fa-la-la line (bars 3 and 4) ends G, F# (string 4, fret 4), G.
    const falala = bars(deck, 2, 3);
    expect(names(falala).slice(-3)).toEqual(['G', 'F#', 'G']);
    expect(falala.slice(-2, -1)).toEqual([{ string: 4, fret: 4, duration: 'q' }]);
    // Lines 1, 2 and 4 (bars 1, 5 and 13) start on string 2, fret 3 (D); line 3 does not. F# on
    // string 4, fret 4 comes at the end of lines 1 and 2 only (bars 4 and 8).
    expect([0, 4, 12].map((b) => bars(deck, b, b)[0])).toEqual(Array(3).fill({ string: 2, fret: 3, duration: 'q.' }));
    expect(bars(deck, 8, 8)[0]).not.toMatchObject({ string: 2, fret: 3 });
    const withLowFSharp = deck.measures.flatMap((m, i) => (m.beats.some((b) => b.notes.some((n) => n.string === 4 && n.fret === 4)) ? [i + 1] : []));
    expect(withLowFSharp).toEqual([4, 8]);
    // F# is one fret above F on string 4, at the pitch the play step asks for.
    expect(midiAt({ string: 4, fret: 4 })).toBe(parseNote('F#3')!.midi);
    expect(midiAt({ string: 4, fret: 4 }) - midiAt({ string: 4, fret: 3 })).toBe(1);
    // Line 3 (bars 9 to 12) has C# at string 2, fret 2 and F# at string 1, fret 2.
    const line3 = bars(deck, 8, 11).filter((n) => !('rest' in n)).map((n) => `${(n as { string: number }).string}:${(n as { fret: number }).fret}`);
    expect(line3).toContain('2:2');
    expect(line3).toContain('1:2');
    expect(['2:2', '1:2'].map((p) => noteAt({ string: Number(p[0]), fret: Number(p[2]) }, { octave: false, context: { tonic: 'D', scale: 'major' } }))).toEqual(['C#', 'F#']);
    const deckSong = await song('deck-the-halls');
    expect(new Set(deckSong.chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D7']));
    expect(deckSong.tempo[0].bpm).toBe(108);
  });

  it('plays Joy to the World as the D major scale, note for note and beat for beat', async () => {
    const joy = await song('joy-to-the-world');
    expect(copy(JOY_PHRASE)).toEqual(bars(melody(joy), 0, 3));
    // The eight notes are the D major scale walking down, home to home, from D4 to D3.
    const down = [...scaleNotes('D', 'major'), 'D'].reverse();
    expect(names(JOY_SCALE)).toEqual(down);
    expect(midiAt(JOY_SCALE[0] as { string: number; fret: number })).toBe(parseNote('D4')!.midi);
    expect(midiAt(JOY_SCALE[7] as { string: number; fret: number })).toBe(parseNote('D3')!.midi);
    const tiles = step<{ alternative: { tiles: string[] } }>('joy-to-the-world', (s) => s.type === 'play-phrase').alternative.tiles;
    expect(tiles.map((t) => t.replace(/\{n:|\}/g, ''))).toEqual(down);
    // The tap step is the rhythm of bars 1 and 2.
    const tap = step<{ rhythm: { pattern: string } }>('joy-to-the-world', (s) => s.type === 'tap-rhythm');
    expect(tap.rhythm.pattern).toBe(`${JOY_PHRASE.slice(0, 3).map((n) => n.duration).join(' ')} | ${JOY_PHRASE.slice(3, 5).map((n) => n.duration).join(' ')}`);
    expect(new Set(joy.chords.map((c) => c.symbol))).toEqual(new Set(['D', 'G', 'A7']));
    // The library holds two lines (seven bars) for each of two verses; line 2 climbs B B, C# C#, D.
    expect(joy.bars).toHaveLength(14);
    expect(names(bars(melody(joy), 4, 6))).toEqual(['B', 'B', 'C#', 'C#', 'D']);
  });

  it('leaps through the G chord in Eine kleine Nachtmusik, rests included', async () => {
    const s = await song('eine-kleine-nachtmusik');
    expect(copy(NACHTMUSIK_OPENING)).toEqual(bars(melody(s), 0, 1));
    expect(new Set(names(NACHTMUSIK_OPENING))).toEqual(new Set(chordNotes('G')));
    expect(s.tempo[0].bpm).toBe(96);
  });

  it('plays Für Elise as the library has it, the G sharp kept', async () => {
    const s = await song('fur-elise-theme');
    const m = melody(s);
    // Bar index 0 is the pickup, so the Player's bars 1 to 5 are the pickup and the first four bars.
    expect(s.bars[0].length).toBe(480);
    expect(s.bars[1].time).toEqual({ numerator: 3, denominator: 8 });
    const opening = bars(m, 0, 2);
    expect(copy(ELISE_OPENING)).toEqual(opening.slice(0, 9));
    expect(names(ELISE_OPENING).join(' ')).toBe('E D# E D# E B D C A');
    expect(copy(ELISE_ANSWERS)).toEqual(bars(m, 2, 3));
    expect(copy(ELISE_SHOW)).toEqual(bars(m, 0, 3));
    expect(names(ELISE_SHOW)).toHaveLength(16);
    // The answers climb Am (C E A) and E (E G# B); the G# is string 3, fret 1.
    expect(new Set(names(ELISE_ANSWERS.slice(2, 5)))).toEqual(new Set(chordNotes('Am')));
    expect(new Set(names(ELISE_ANSWERS.slice(7, 10)))).toEqual(new Set(chordNotes('E')));
    expect(chordNotes('E')).toContain('G#');
    expect(noteAt({ string: 3, fret: 1 }, { octave: false, context: { chord: 'E' } })).toBe('G#');
    // The six melody notes of the opening, and the order tiles of both no-microphone steps.
    expect(new Set(ELISE_OPENING.map((n) => `${(n as { string: number }).string}:${(n as { fret: number }).fret}`))).toEqual(new Set(['1:0', '2:4', '2:3', '2:1', '2:0', '3:2']));
    const tileNames = (tiles: string[]) => tiles.flatMap((t) => [...t.matchAll(/\{n:([A-G]#?)\}/g)].map((x) => x[1]));
    const play = step<{ alternative: { tiles: string[] } }>('fur-elise', (x) => x.type === 'play-phrase' && x.id !== 'show');
    expect(tileNames(play.alternative.tiles)).toEqual(names(ELISE_OPENING));
    const show = step<{ alternative: { tiles: string[] } }>('fur-elise', (x) => x.id === 'show');
    expect(tileNames(show.alternative.tiles)).toEqual(names(ELISE_SHOW));
    // 60 quarters a minute is 120 eighth-note counts; the library has the melody only, no left-hand part.
    expect(s.tempo[0].bpm * 2).toBe(120);
    expect(s.tracks).toHaveLength(1);
  });

  it('falls back to the fiddle tune\'s notes and picking while it is missing', async () => {
    const scale = getExercise('tech-alternate-scale-g')!;
    expect(scale.steps.join(' ')).toMatch(/G major in first position/);
    expect(scale.tempo.start).toBe(60);
    const susanna = await song('oh-susanna');
    expect(susanna.tracks.map((t) => t.name)).toContain('Tune');
    expect(susanna.bars[1].time).toEqual({ numerator: 2, denominator: 4 });
    expect(songEntry('oh-susanna')!.key).toBe('G major');
    const rakes = songEntry('rakes-of-mallow');
    if (rakes) expect(rakes.level).toBeLessThanOrEqual(3);
  });

  it('names every tempo as the Player will play it', async () => {
    expect(await tempoProblems(unit)).toEqual([]);
  });
});
