/**
 * Cross-checks for Mia's unit 7 (Strumming patterns) against the engines and the song library: the
 * folk pattern and the 6/8 strum are the library studies' own, the 3/4-or-6/8 examples group their
 * low notes as the answers say, the Silent Night picking bar and the boom-chick bass notes are the
 * library's note for note, the encore's bass line follows Oh! Susanna's chords bar by bar, every
 * "string N, fret M ({n:X})" names the right note, the fallbacks offer the planned chords, and
 * every tempo a task names is what the Player will play. Run with
 * `npx vitest run src/content/teachers/mia/mia-strumming-patterns.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { BACKING_STYLES } from '@/core/audio';
import { chordVoicings, identifyFretted, midiAt, noteAt } from '@/core/guitar';
import { parseSixTab, type Song, type Track } from '@/core/song';
import { chordNotes, chroma } from '@/core/theory';
import { strumPattern } from '@/features/rhythm/core/strum';
import { estimateLessonSeconds, formatProblems, parseRhythm, parseStrum, validateCourse, type RichText, type TabNote } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong, type TaskStep, type TeacherUnit } from '../index';
import unit, { BOOM_BASS, FOLK_PATTERN, FOLK_RHYTHM, PICKING_G, SIX_EIGHT_PATTERN, SUSANNA_BASS } from './mia-strumming-patterns';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

const DUR: Record<number, string> = { 240: 's', 480: 'e', 720: 'e.', 960: 'q', 1440: 'q.', 1920: 'h', 2880: 'h.', 3840: 'w' };

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

function track(s: Song, name: string): Track {
  const t = s.tracks.find((x) => x.name === name);
  expect(t, name).toBeTruthy();
  return t!;
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

function lesson(id: string) {
  const l = unit.lessons.find((x) => x.id === id);
  expect(l, id).toBeTruthy();
  return l!;
}

/** The chord sounding at a tick of a bar (the last chord event at or before it). */
function chordAt(s: Song, bar: number, tick: number): string {
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  return events.filter((e) => e.bar < bar || (e.bar === bar && e.tick <= tick)).pop()?.symbol ?? '';
}

function barTicks(s: Song, bar: number): number {
  const b = s.bars[bar];
  return b.length ?? (b.time.numerator * 3840) / b.time.denominator;
}

/** Every text of a unit an author wrote: cards, prompts, explanations, options, tasks and fallbacks, facts. */
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

const SPEED = { BPM: 1, 'big beats a minute': 2 / 3, 'eighth-note counts a minute': 2 } as const;
const PCT = /(\d+) % \((?:about )?(\d+) (BPM|big beats a minute|eighth-note counts a minute)\)/g;
const BARE = /(\d+) (BPM|big beats a minute|eighth-note counts a minute)/;

/**
 * Problems with the tempos a task's words name: each "N % (M BPM)" must be N % of the song's tempo,
 * and the first tempo named without a percentage must be the one the task opens at. Big beats are
 * dotted quarters (two thirds of the quarter-note tempo), eighth-note counts twice the tempo.
 */
async function tempoProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const l of u.lessons) {
    for (const step of l.steps.filter(isTaskStep)) {
      for (const target of [step, ...(step.fallback ? [step.fallback] : [])] as Array<Pick<TaskStep, 'tool' | 'params' | 'body'>>) {
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
          if (Math.abs(want - Number(m[2])) > 1) out.push(`${l.id} > ${step.id}: "${m[0]}", but ${m[1]} % of ${bpm} is ${want.toFixed(1)}`);
        }
        text = text.replace(PCT, '');
        const first = text.match(BARE);
        if (!first) {
          if (!namesOpening && !(target.params ?? []).includes('wait')) out.push(`${l.id} > ${step.id}: names no tempo`);
          continue;
        }
        const opens = (bpm * pct * SPEED[first[2] as keyof typeof SPEED]) / 100;
        if (Math.abs(opens - Number(first[1])) > 1) out.push(`${l.id} > ${step.id}: says "${first[0]}", opens at ${pct} % of ${bpm} = ${opens.toFixed(1)}`);
      }
    }
  }
  return out;
}

/** Every "string N, fret M ({n:X})" and "open string N ({n:X})" in the unit, checked on the neck. */
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
  }
  return { checked, problems };
}

/** `string:fret` of a tab note (`r` for a rest). */
function pos(n: TabNote): string {
  return 'rest' in n ? 'r' : `${n.string}:${n.fret}`;
}

function shape(chord: string): { frets: string; fingers: string } {
  const v = chordVoicings(chord)[0];
  return { frets: v.frets.map((f) => (f === null ? 'x' : String(f))).join(''), fingers: v.fingers.map((f) => (f === null ? 'x' : String(f))).join('') };
}

/** The tab notes of the struck beats of some bars (1-based), a chord counted by its lowest note. */
function barNotes(t: Track, from: number, to: number, opts: { singleOnly?: boolean } = {}): TabNote[] {
  return t.measures.slice(from - 1, to).flatMap((m) =>
    m.beats
      .filter((b) => b.notes.length > 0 && (!opts.singleOnly || b.notes.length === 1))
      .map((b) => {
        const low = [...b.notes].sort((x, y) => y.string - x.string)[0];
        return { string: low.string, fret: low.fret, duration: DUR[b.duration] ?? String(b.duration) };
      }),
  );
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('mia'), [unit]);

describe('Mia unit 7: Strumming patterns', () => {
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

  it('strums the folk pattern as the plan, the library study and the rhythm trainer have it', async () => {
    // Down on 1, down on 2, up on the & of 2, miss on 3, up on the & of 3, down on 4, up on the & of 4.
    const slots = parseStrum(FOLK_PATTERN).slots.map((s) => `${s.count}:${s.stroke ?? 'miss'}`);
    expect(slots).toEqual(['1:down', '&:miss', '2:down', '&:up', '3:miss', '&:up', '4:down', '&:up']);
    // The note lengths of the study's strum part, and their onsets: one per stroke that touches the strings.
    const study = await song('st-strum-folk');
    expect(study.sections[0].strum?.pattern).toBe(FOLK_PATTERN);
    const bar1 = track(study, 'Your strum').measures[0].beats;
    expect(bar1.map((b) => DUR[b.duration]).join(' ')).toBe(FOLK_RHYTHM);
    expect(bar1.map((b) => b.stroke)).toEqual(['down', 'down', 'up', 'up', 'down', 'up']);
    const struck = parseStrum(FOLK_PATTERN).slots.filter((s) => s.stroke).map((s) => s.tick);
    expect(parseRhythm(FOLK_RHYTHM).onsets).toEqual(struck);
    expect(study.tempo[0].bpm).toBe(80);
    expect(new Set(study.chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D']));
    // The trainer's folk and pop strum is the same pattern.
    expect(strumPattern('folk-pop')!.written).toBe('D . D U . U D U');
    // The order exercise lists the same strokes.
    const order = lesson('the-folk-pattern').steps.find((s) => (s as { type?: string }).type === 'order') as { tiles: string[] };
    expect(order.tiles.map((t) => t.split(': ')[1])).toEqual(['down', 'down', 'up', 'miss', 'up', 'down', 'up']);
  });

  it('strums 6/8 as down, down, up twice, as the library study does', async () => {
    const study = await song('st-strum-6-8');
    expect(study.sections[0].strum?.pattern).toBe(SIX_EIGHT_PATTERN);
    expect(study.bars[0].time).toEqual({ numerator: 6, denominator: 8 });
    expect(track(study, 'Your strum').measures[0].beats.map((b) => b.stroke)).toEqual(['down', 'down', 'up', 'down', 'down', 'up']);
    // 84 quarters a minute is 56 dotted quarters, the big beats.
    expect((study.tempo[0].bpm * 2) / 3).toBe(56);
    const order = lesson('six-eight-time').steps.find((s) => (s as { type?: string }).type === 'order') as { tiles: string[] };
    expect(order.tiles.map((t) => t.split(': ')[1][0].toUpperCase()).join('')).toBe(SIX_EIGHT_PATTERN);
  });

  it('groups the low notes of each 3/4 or 6/8 example as its answer says', () => {
    const asks = lesson('six-eight-time').steps.filter((s) => (s as { type?: string }).type === 'listen-choice') as Array<{
      sound: { kind: string; notes: TabNote[] };
      options: Array<{ text: string; correct?: boolean }>;
    }>;
    expect(asks).toHaveLength(4);
    for (const a of asks) {
      const midi = a.sound.notes.map((n) => midiAt(n as { string: number; fret: number }));
      expect(midi).toHaveLength(12);
      // A low note (D3 or below) starts each group: every second note in 3/4, every third in 6/8.
      const lows = midi.slice(0, 6).flatMap((m, i) => (m <= 52 ? [i] : []));
      const answer = a.options.find((o) => o.correct)!.text.slice(0, 3);
      expect(lows, answer).toEqual(answer === '3/4' ? [0, 2, 4] : [0, 3]);
      expect(midi.slice(6)).toEqual(midi.slice(0, 6));
    }
  });

  it('picks Silent Night as the library\'s fingerpicked verse does', async () => {
    const s = await song('silent-night');
    expect(s.sections.map((x) => [x.name, x.start + 1, x.end])).toEqual([['Strummed', 1, 24], ['Fingerpicked', 25, 48]]);
    const part = track(s, 'Your part');
    const g = part.measures[24].beats.map((b) => b.notes[0]);
    expect(g.map((n) => ({ string: n.string, fret: n.fret, duration: 'e' }))).toEqual(PICKING_G);
    expect(g.map((n) => n.pluck)).toEqual(['p', 'i', 'm', 'p', 'a', 'm']);
    // Every note of the bar is a note of G: G, B and D.
    expect(new Set(PICKING_G.map((n) => noteAt(n as { string: number; fret: number }, { octave: false })))).toEqual(new Set(chordNotes('G')));
    // The thumb on counts 1 and 4: G on string 6 then the open string 4; D7 on the open string 4 twice; C on string 5 fret 3, then string 4 fret 2.
    const thumbs = (bar: number) => [part.measures[bar - 1].beats[0].notes[0], part.measures[bar - 1].beats[3].notes[0]].map((n) => `${n.string}:${n.fret}`);
    expect(thumbs(25)).toEqual(['6:3', '4:0']);
    expect(thumbs(29)).toEqual(['4:0', '4:0']);
    expect(thumbs(33)).toEqual(['5:3', '4:2']);
    expect(new Set(s.chords.map((c) => c.symbol))).toEqual(new Set(['G', 'D7', 'C']));
    // 75 quarters a minute is 50 big beats; 88 % is 44.
    expect((s.tempo[0].bpm * 2) / 3).toBe(50);
    // The strummed verse: one strum on 1 and one on 4 (two dotted quarters a bar).
    expect(part.measures[0].beats.map((b) => DUR[b.duration])).toEqual(['q.', 'q.']);
  });

  it('plays the boom-chick bass notes of the library study, two bars of each chord', async () => {
    const s = await song('st-boom-chick');
    const part = s.tracks[0];
    const bass = [...barNotes(part, 1, 2, { singleOnly: true }), ...barNotes(part, 5, 6, { singleOnly: true }), ...barNotes(part, 9, 10, { singleOnly: true })];
    expect(bass.map(pos)).toEqual(BOOM_BASS.map(pos));
    // Boom on 1 and 3, chick on 2 and 4: single notes on the odd beats, chords on the even ones.
    for (const m of part.measures.slice(0, 3).concat(part.measures.slice(4, 16))) {
      expect(m.beats.map((b) => b.notes.length > 1)).toEqual([false, true, false, true]);
    }
    // The chick strums strings 4 to 1.
    expect(part.measures[0].beats[1].notes.map((n) => n.string)).toEqual([4, 3, 2, 1]);
    // The bass notes are G and D, C and G, D and A: notes of each chord, the root first.
    const at = (n: TabNote) => noteAt(n as { string: number; fret: number }, { octave: false });
    expect(BOOM_BASS.map(at).join(' ')).toBe('G D G D C G C G D A D A');
    for (const [i, chord] of [[0, 'G'], [4, 'C'], [8, 'D7']] as const) {
      expect(at(BOOM_BASS[i])).toBe(chordNotes(chord)[0]);
      expect(chordNotes(chord)).toContain(at(BOOM_BASS[i + 1]));
    }
    expect(s.tempo[0].bpm).toBe(88);
  });

  it('follows Oh! Susanna\'s chords bar by bar in the encore, root first, then alternating', async () => {
    const s = await song('oh-susanna');
    expect(s.bars[0].length).toBe(480);
    const ALT: Record<string, [string, string]> = { G: ['6:3', '4:0'], C: ['5:3', '6:3'], D7: ['4:0', '5:0'] };
    // Lines 1 and 2 of the verse (bars 1 to 8 after the pickup), then the chorus (bars 17 to 24).
    const bars = [...Array.from({ length: 8 }, (_, i) => i + 1), ...Array.from({ length: 8 }, (_, i) => i + 17)];
    const expected: string[] = [];
    let previous = '';
    for (const bar of bars) {
      const chord = chordAt(s, bar, 0);
      const before = chordAt(s, bar - 1, barTicks(s, bar - 1) - 1);
      const fresh = bar === 1 || bar === 17 || before !== chord;
      const pair = ALT[chord];
      expect(pair, `bar ${bar}: ${chord}`).toBeTruthy();
      const bass = fresh ? pair[0] : previous === pair[0] ? pair[1] : pair[0];
      expected.push(bass);
      previous = bass;
    }
    expect(SUSANNA_BASS.map(pos)).toEqual(expected);
    // The tiles of the alternative are the chords on beat 1, four bars a line.
    const show = lesson('strum-songbook').steps.find((x) => (x as { id?: string }).id === 'show') as { alternative: { tiles: string[] }; tempo: number };
    const lines = [0, 4, 8, 12].map((i) => bars.slice(i, i + 4).map((b) => `{c:${chordAt(s, b, 0)}}`).join(' '));
    expect(show.alternative.tiles).toEqual(lines);
    expect(show.tempo).toBe(s.tempo[0].bpm);
    // In 2/4 the bass goes on beat 1 and the strum on beat 2; D7 arrives on beat 2 of bars 7 and 23.
    expect([chordAt(s, 7, 960), chordAt(s, 23, 960)]).toEqual(['D7', 'D7']);
    expect(track(s, 'Tune').role).toBe('lead');
    expect(track(s, 'Your strum').role).toBe('rhythm');
  });

  it('teaches the shapes and bass notes the chord library and the neck have', () => {
    expect(shape('D7')).toEqual({ frets: 'xx0212', fingers: 'xx0213' });
    expect(shape('D')).toEqual({ frets: 'xx0232', fingers: 'xx0132' });
    expect(shape('C')).toEqual({ frets: 'x32010', fingers: 'x32010' });
    for (const [frets, sym] of [['xx0212', 'D7'], ['xx0232', 'D'], ['x32010', 'C'], ['320003', 'G']]) expect(identifyFretted(frets).symbol, frets).toBe(sym);
    // D to D7: only string 2 changes, from fret 3 (D) to fret 1 (C), the seventh.
    expect(noteAt({ string: 2, fret: 1 }, { octave: false })).toBe('C');
    expect(chordNotes('D7')).toContain('C');
    // In C, finger 3 holds string 5 fret 3: the finger that hops to string 6 fret 3 for the G bass.
    expect(shape('C').fingers[1]).toBe('3');
    // The chords' strums start on their lowest string: D on 4, A on 5, E on 6.
    for (const [chord, low] of [['D', 4], ['A', 5], ['E', 6]] as const) expect(shape(chord).frets.indexOf(shape(chord).frets.replace(/x/g, '')[0])).toBe(6 - low);
    const claims = positionClaims(unit);
    expect(claims.problems).toEqual([]);
    expect(claims.checked).toBeGreaterThanOrEqual(10);
  });

  it('describes the songs it sends the learner to as the library has them', async () => {
    const mountain = await song('coming-round-the-mountain');
    expect(new Set(mountain.chords.map((c) => c.symbol))).toEqual(new Set(['G', 'C', 'D7']));
    expect(mountain.tempo[0].bpm).toBe(108);
    const grace = await song('amazing-grace');
    expect(track(grace, 'Your strum').measures[1].beats.map((b) => DUR[b.duration]).join(' ')).toBe('q e e e e');
    expect(grace.bars[1].time).toEqual({ numerator: 3, denominator: 4 });
    const sleeves = await song('greensleeves-melody');
    expect(new Set(sleeves.chords.map((c) => c.symbol))).toEqual(new Set(['Am', 'G', 'E', 'C']));
    expect((sleeves.tempo[0].bpm * 2) / 3).toBe(54);
    // The cadence bars go Am to E (bars 7 and 15 after the pickup).
    for (const bar of [7, 15]) expect([chordAt(sleeves, bar, 0), chordAt(sleeves, bar, 1440)]).toEqual(['Am', 'E']);
    expect(sleeves.tracks.map((t) => t.name)).toContain('Teacher');
    const row = await song('row-row-row-your-boat');
    expect((row.tempo[0].bpm * 2) / 3).toBe(56);
    // The round: the second voice comes in two bars after the second time through starts.
    const second = track(row, 'Second voice');
    const roundStart = row.sections.find((x) => x.name === 'Round')!.start;
    expect(second.measures.findIndex((m) => m.beats.some((b) => b.notes.length > 0))).toBe(roundStart + 2);
    expect(row.tracks[0].measures[0].beats[0].notes[0]).toMatchObject({ string: 3, fret: 0 });
  });

  it('falls back to music with the planned chords while three songs are missing', () => {
    const chordsOf = (id: string, key: string) => [...new Set(progressionInKey(id, key).bars.flat().map((c) => c.symbol))];
    expect(chordsOf('classical-minor-cadence', 'E')).toEqual(['Em', 'Am', 'B7']);
    expect(chordsOf('classical-plagal', 'G')).toEqual(['G', 'C', 'D7']);
    // The jam's Folk strum style plays at 84 BPM and plays the folk pattern itself.
    const folk = BACKING_STYLES.folk;
    expect(folk.tempo.min).toBeLessThanOrEqual(84);
    expect(folk.tempo.max).toBeGreaterThanOrEqual(100);
    // The planned songs, when they land, must be the ones the lessons describe.
    for (const id of ['wade-in-the-water', 'down-by-the-riverside', 'go-tell-it-on-the-mountain']) {
      const entry = songEntry(id);
      if (entry) expect(entry.level, id).toBeLessThanOrEqual(3);
    }
  });

  it('names every tempo as the Player will play it', async () => {
    expect(await tempoProblems(unit)).toEqual([]);
  });
});
