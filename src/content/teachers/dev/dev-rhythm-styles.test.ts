/**
 * Cross-checks for Dev's unit 6 (Rhythm guitar in every style) against the engines and the song
 * library: every shape is the chord it is called, every "string N, fret M" the text pairs with a
 * note is that note; the gallop, the funk pattern, the reggae chops, the G run, the alternating bass
 * and the sus decorations are the library's studies; the tools the tasks open (Rhythm patterns and
 * drills, technique ladders) have what the text promises; the jam tracks play the chords the text
 * names at tempos their band plays; every Player tempo is the song's tempo times the task's
 * percentage. Run with `npx vitest run src/content/teachers/dev/dev-rhythm-styles.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import repertoire from '@/content/plan/repertoire.json';
import { getProgression, progressionInKey } from '@/content/progressions';
import { loadSongText, songEntry } from '@/content/songs';
import { getExercise, ladderRungs } from '@/content/technique';
import { BACKING_STYLES } from '@/core/audio';
import { identifyFretted, midiAt, pitchClassAt } from '@/core/guitar';
import { parseSixTab, type Song } from '@/core/song';
import { chordNotes, chroma, intervalBetween } from '@/core/theory';
import { DRILLS } from '@/features/rhythm/core/ladder';
import { strumPattern } from '@/features/rhythm/core/strum';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { compileCourse, compileLesson, courseMeta, isTaskStep, taskSong } from '../index';
import type { RichText, TaskStep, TeacherUnit } from '../types';
import unit, { FOLK_PATTERN, FUNK_A_BAR_1, FUNK_A_HITS, GALLOP_BAR, G_RUN, SWUNG_EIGHTHS } from './dev-rhythm-styles';

// ── helpers (kept in this file: the unit folder holds only unit files and their tests) ──────────

async function song(id: string): Promise<Song> {
  const { song: s, errors } = parseSixTab(await loadSongText(id));
  expect(errors, id).toEqual([]);
  return s!;
}

/** The chord in force at the start of each bar. */
async function chordsByBar(id: string): Promise<string[]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  return s.bars.map((_, i) => events.filter((e) => e.bar < i || (e.bar === i && e.tick === 0)).pop()?.symbol ?? 'N.C.');
}

/** Every chord symbol sounding in a bar. */
async function chordsInBar(id: string, bar: number): Promise<string[]> {
  const s = await song(id);
  const events = [...s.chords].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const start = events.filter((e) => e.bar < bar - 1 || (e.bar === bar - 1 && e.tick === 0)).pop();
  return [...(start ? [start.symbol] : []), ...events.filter((e) => e.bar === bar - 1 && e.tick > 0).map((e) => e.symbol)];
}

/** A rhythm written in the lesson code, as tick durations with rests negative (`'e s sr'` -> [480, 240, -240]). */
function ticks(pattern: string): number[] {
  const base: Record<string, number> = { w: 3840, h: 1920, q: 960, e: 480, s: 240 };
  return pattern
    .split(/\s+/)
    .filter((x) => x && x !== '|')
    .map((code) => {
      const rest = code.endsWith('r');
      const c = code.replace(/^~/, '').replace(/r$/, '');
      let d = base[c[0]];
      if (c.includes('.')) d *= 1.5;
      if (c.includes('t')) d = (d * 2) / 3;
      return rest ? -d : d;
    });
}

function plain(text: RichText): string {
  return typeof text === 'string' ? text : text.text;
}

/** Every "string N, fret M" the text pairs with a note, checked on the neck. */
function noteClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const check = (s: string, f: string, n: string, where: string) => {
    if (pitchClassAt({ string: Number(s), fret: Number(f) }) !== chroma(n)) out.push(`${where}: string ${s} fret ${f} is not ${n}`);
  };
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/\{n:([A-G][#b]*)\} at string (\d), fret (\d+)/g)) check(m[2], m[3], m[1], m[0]);
  for (const m of text.matchAll(/[Ss]tring (\d), fret (\d+) is \{n:([A-G][#b]*)\}/g)) check(m[1], m[2], m[3], m[0]);
  for (const m of text.matchAll(/open string (\d) \(\{n:([A-G][#b]*)\}\)/g)) check(m[1], '0', m[2], m[0]);
  return out;
}

/** Every chord written with its shape ("{c:X} (shape)", "{c:X} shape", or a chord / shape pair): the shape is that chord. */
function shapeClaimProblems(u: TeacherUnit): string[] {
  const text = JSON.stringify(u);
  const out: string[] = [];
  const check = (symbol: string, shape: string, where: string) => {
    const got = identifyFretted(shape).symbol;
    if (got !== symbol) out.push(`${where}: ${shape} is ${got}, not ${symbol}`);
  };
  for (const m of text.matchAll(/\{c:([^}]+)\} \(?([x0-9]{6})\b/g)) check(m[1], m[2], m[0]);
  for (const m of text.matchAll(/"left":"\{c:([^}]+)\}","right":"([x0-9]{6})"/g)) check(m[1], m[2], m[0]);
  return out;
}

async function writtenBpm(id: string): Promise<number | null> {
  if (songEntry(id)) return (await song(id)).tempo[0].bpm;
  return (repertoire as { pieces: Array<{ id: string; tempo?: number }> }).pieces.find((p) => p.id === id)?.tempo ?? null;
}

async function bpmProblems(where: string, params: readonly string[], body: RichText): Promise<string[]> {
  const id = params[0];
  const bpm = await writtenBpm(id);
  if (bpm === null) return [`${where}: no tempo known for ${id}`];
  const pct = Number((params.find((p) => /^t\d+$/.test(p)) ?? 't100').slice(1));
  const text = plain(body);
  const out: string[] = [];
  const percents = [...text.matchAll(/(\d+) % \((?:about )?(\d+) BPM\)/g)];
  for (const m of percents) if (Math.abs((bpm * Number(m[1])) / 100 - Number(m[2])) > 1) out.push(`${where}: ${m[0]}, but ${m[1]} % of ${bpm} is ${((bpm * Number(m[1])) / 100).toFixed(1)}`);
  const plainBpm = text.replace(/(\d+) % \((?:about )?(\d+) BPM\)/g, '').match(/(\d+) BPM/);
  if (!percents.some((m) => Number(m[1]) === pct)) {
    if (!plainBpm) out.push(`${where}: never says the tempo it opens at`);
    else if (Math.abs(Number(plainBpm[1]) - (bpm * pct) / 100) > 1) out.push(`${where}: says ${plainBpm[1]} BPM, opens at ${pct} % of ${bpm}`);
  }
  return out;
}

async function taskBpmProblems(u: TeacherUnit): Promise<string[]> {
  const out: string[] = [];
  for (const lesson of u.lessons) {
    for (const step of lesson.steps) {
      if (!isTaskStep(step)) continue;
      const where = `${lesson.id} > ${step.id}`;
      if (taskSong(step)) out.push(...(await bpmProblems(where, step.params!, step.body)));
      if (step.fallback?.tool === 'player') out.push(...(await bpmProblems(`${where} (fallback)`, step.fallback.params!, step.fallback.body)));
    }
  }
  return out;
}

function jamProblems(u: TeacherUnit, chordsNamed: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const step of u.lessons.flatMap((l) => l.steps).filter(isTaskStep) as TaskStep[]) {
    if (step.tool !== 'progressions') continue;
    const [id, key] = step.params!;
    const p = getProgression(id);
    if (!p) {
      out.push(`${step.id}: no progression ${id}`);
      continue;
    }
    const tonic = key.toUpperCase();
    if (!p.keys.includes(tonic)) out.push(`${step.id}: ${id} is not offered in ${tonic}`);
    const chords = [...new Set(progressionInKey(p, tonic).bars.flat().map((c) => c.symbol))];
    if (JSON.stringify(chords) !== JSON.stringify(chordsNamed[step.id])) out.push(`${step.id}: ${id} in ${tonic} plays ${chords.join(' ')}`);
    const bpm = Number(plain(step.body).match(/(\d+) BPM/)?.[1]);
    const range = BACKING_STYLES[p.feel.backing].tempo;
    if (!(bpm >= Math.max(30, Math.min(range.min, 50)) && bpm <= range.max + 20)) out.push(`${step.id}: ${bpm} BPM is outside what the ${p.feel.backing} band plays`);
  }
  return out;
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────────

const course = compileCourse(courseMeta('dev'), [unit]);
const tasks = unit.lessons.flatMap((l) => l.steps.filter(isTaskStep)) as TaskStep[];

describe('Dev unit 6: rhythm guitar in every style', () => {
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

  it('pairs every fret in the text with its note, and every shape with its chord', () => {
    expect(noteClaimProblems(unit)).toEqual([]);
    expect(shapeClaimProblems(unit)).toEqual([]);
  });

  it('gallops as the riff does: an eighth and two sixteenths, down, down-up, palm-muted, then an accented chord', async () => {
    const s = await song('st-power-chords-gallop');
    expect(s.tempo[0].bpm).toBe(100);
    const bar1 = s.tracks[0].measures[0].beats;
    expect(bar1.map((b) => b.duration)).toEqual(ticks('e s s e s s e s s q'));
    expect(bar1.slice(0, 3).map((b) => b.stroke)).toEqual(['down', 'down', 'up']);
    expect(bar1.slice(0, 9).every((b) => b.notes.length === 1 && b.notes[0].string === 6 && b.notes[0].fret === 0 && b.notes[0].palmMute)).toBe(true);
    expect(bar1[9].notes.every((n) => !n.palmMute && n.accent)).toBe(true);
    expect(ticks(GALLOP_BAR)).toEqual(Array(4).fill([480, 240, 240]).flat());
    for (const [shape, chord] of [['577xxx', 'A5'], ['355xxx', 'G5'], ['x355xx', 'C5'], ['x577xx', 'D5'], ['022xxx', 'E5']]) expect(identifyFretted(shape).symbol).toBe(chord);
    // Rhythm's Gallop pattern is the same rhythm: down, (miss), down-up per beat.
    expect(strumPattern('gallop')!.slots).toBe('s-ss'.repeat(4));
    // The palm-muting ladder has the 96 and 104 rungs the task names.
    expect(ladderRungs(getExercise('tech-palm-mute')!)).toEqual(expect.arrayContaining([96, 104]));
  });

  it('strums the funk pattern the card plays, with E9 fingered as it says', async () => {
    const s = await song('st-strum-funk');
    expect(s.tempo[0].bpm).toBe(92);
    const bar1 = s.tracks.find((t) => t.role === 'rhythm')!.measures[0].beats;
    expect(bar1.map((b) => (b.mutedStrum ? 'X' : b.stroke === 'up' ? 'U' : 'D')).join('')).toBe(FUNK_A_BAR_1);
    // Down on the beat and the "and", up on the "e" and the "a".
    expect(bar1.map((b) => (b.start / 240) % 2 === 0 ? b.stroke === 'down' : b.stroke === 'up').every(Boolean)).toBe(true);
    // The hits tapped in the lesson are the chord strokes of that bar.
    const hits = ticks(FUNK_A_HITS).map((d) => d > 0);
    expect(hits).toEqual([...FUNK_A_BAR_1].map((c) => c !== 'X'));
    expect(identifyFretted('x76777').symbol).toBe('E9');
    expect(s.sections.map((x) => [x.name, x.start])).toEqual([['Pattern A', 0], ['Pattern B', 4]]);
  });

  it('chops as the reggae study does: up-strums on every "and", then down-strums on 2 and 4', async () => {
    const s = await song('st-strum-reggae');
    expect(s.tempo[0].bpm).toBe(80);
    const part = s.tracks.find((t) => t.role === 'rhythm')!;
    const struck = (bar: number) => part.measures[bar - 1].beats.filter((b) => b.slash || b.notes.length > 0).map((b) => `${b.start}${b.stroke === 'up' ? 'U' : 'D'}`);
    expect(struck(1)).toEqual(['480U', '1440U', '2400U', '3360U']);
    expect(struck(9)).toEqual(['960D', '2880D']);
    expect(ticks('er e er e er e er e').filter((d) => d > 0).length).toBe(4);
    for (const [shape, chord] of [['xx755x', 'Am'], ['xx543x', 'G'], ['xx555x', 'C/G']]) expect(identifyFretted(shape).symbol).toBe(chord);
    expect(identifyFretted('xx555x').notes.map((n) => n.note)).toEqual(['G', 'C', 'E']);
    const drill = DRILLS.find((d) => d.id === 'offbeat-1')!;
    expect(drill).toMatchObject({ kind: 'offbeat', part: 'and' });
  });

  it('runs the G run and alternates the bass as the bluegrass study does', async () => {
    const s = await song('st-bluegrass-g-run');
    expect(s.tempo[0].bpm).toBe(120);
    const part = s.tracks[0];
    const bar7 = part.measures[6].beats;
    const run = [...bar7.slice(2), part.measures[7].beats[0]].map((b) => b.notes[0]);
    expect(run.map((n) => `${n.string}:${n.fret}`)).toEqual(G_RUN.map((n) => ('rest' in n ? '' : `${n.string}:${n.fret}`)));
    expect(run[4].legato).toBe('hammer');
    expect(run.map((n) => n.midi)).toEqual([55, 52, 50, 45, 47, 43]); // G3 E3 D3 A2 B2 G2
    expect(bar7.slice(2, 7).map((b) => b.stroke)).toEqual(['up', 'down', 'up', 'down', undefined]);
    expect(part.measures[7].beats[0].start).toBe(0); // the landing is on beat 1
    // Bass notes: root then fifth, as the match-pairs say.
    const bass = (bar: number) => part.measures[bar - 1].beats.filter((b) => b.notes.length === 1 && b.start % 1920 === 0).map((b) => `${b.notes[0].string}:${b.notes[0].fret}`);
    expect(bass(1)).toEqual(['6:3', '4:0']); // G: G, D
    expect(bass(3)).toEqual(['5:3', '6:3']); // C: C, G
    expect(bass(6)).toEqual(['4:0', '5:0']); // D: D, A
    expect(bass(2)).toEqual(['6:3', '5:2']); // B steps up to C
    expect([intervalBetween('G', 'D'), intervalBetween('C', 'G'), intervalBetween('D', 'A'), intervalBetween('A', 'E')]).toEqual(['P5', 'P5', 'P5', 'P5']);
    expect(chordNotes('A7')).toEqual(expect.arrayContaining(['A', 'E']));
    expect(chordNotes('G')[1]).toBe('B');
    expect(midiAt({ string: 5, fret: 2 })).toBe(47);
    expect(identifyFretted('320003').symbol).toBe('G');
  });

  it('swings as the lesson says, and the tools have the click on 2 and 4 and the swung strum', () => {
    expect(ticks(SWUNG_EIGHTHS)).toEqual(Array(4).fill([320, 320, 320]).flat());
    expect(SWUNG_EIGHTHS.split(' ').filter((c) => c.startsWith('~')).length).toBe(4); // every middle note tied: long-short
    const mm = getExercise('tech-metronome-2-4')!;
    expect(ladderRungs(mm)[0]).toBe(60);
    expect(ladderRungs(mm)).toContain(100);
    expect(mm.parts[0].click).toBe('backbeat');
    expect(strumPattern('swung-eighths')!.grid).toBe('swing');
    expect(strumPattern('down-up')!.grid).toBe('eighth');
    expect(getProgression('blues-slow-12-8')!.feel.meter).toBe('12/8');
  });

  it('decorates the chords as the sus study does, one finger at a time', async () => {
    const shapes: Record<string, string> = { D: 'xx0232', Dsus2: 'xx0230', Dsus4: 'xx0233', A: 'x02220', Asus2: 'x02200', Asus4: 'x02230', C: 'x32010', Cadd9: 'x32030' };
    for (const [chord, shape] of Object.entries(shapes)) expect(identifyFretted(shape).symbol, shape).toBe(chord);
    const diff = (a: string, b: string) => [...a].map((c, i) => (c !== b[i] ? 6 - i : 0)).filter(Boolean);
    expect(diff(shapes.D, shapes.Dsus2)).toEqual([1]);
    expect(diff(shapes.D, shapes.Dsus4)).toEqual([1]);
    expect(diff(shapes.A, shapes.Asus2)).toEqual([2]);
    expect(diff(shapes.A, shapes.Asus4)).toEqual([2]);
    expect(diff(shapes.C, shapes.Cadd9)).toEqual([2]);
    expect(chordNotes('Dsus4')).toEqual(['D', 'G', 'A']);
    expect(chordNotes('Dsus2')).toEqual(['D', 'E', 'A']);
    expect(chordNotes('Cadd9')).toEqual(['C', 'E', 'G', 'D']);
    // The study pairs each chord with the decorations the task names, the decoration on the "and" of 3.
    const s = await song('st-sus-embellish');
    expect(s.tempo[0].bpm).toBe(84);
    const pairs = new Set<string>();
    for (let bar = 1; bar <= s.bars.length; bar++) {
      const cs = await chordsInBar('st-sus-embellish', bar);
      if (cs.length >= 2) pairs.add(`${cs[0]}>${cs[1]}`);
    }
    expect([...pairs].sort()).toEqual(['A>Asus2', 'A>Asus4', 'C>Cadd9', 'D>Dsus2', 'D>Dsus4']);
    const decorated = s.chords.filter((c) => c.symbol.includes('sus') || c.symbol.includes('add'));
    expect(decorated.every((c) => c.tick === 1920 + 480)).toBe(true);
    expect(ticks(FOLK_PATTERN)).toEqual([960, 480, 480, -480, 480, 480, 480]);
  });

  // Review: the fallback was Clementine, a 3/4 waltz on D and A7. Auld Lang Syne is nearer to
  // Shenandoah: slow, traditional, in 4/4 and in D, on the very D and A shapes the sus moves start
  // from, one chord a bar (so the folk pattern's beat-3 move fits every bar), and 75 % of its tempo
  // is Shenandoah's 60 BPM.
  it('falls back to Auld Lang Syne, a slow song in D on D and A, while Shenandoah is missing', async () => {
    const sh = tasks.find((t) => t.id === 'shenandoah')!;
    if (!songEntry('shenandoah')) expect(sh.fallback).toBeTruthy();
    expect(sh.fallback!.params).toEqual(['auld-lang-syne', 't75']);
    const s = await song('auld-lang-syne');
    expect(s.tempo[0].bpm * 0.75).toBe(60);
    expect((repertoire as { pieces: Array<{ id: string; tempo?: number }> }).pieces.find((p) => p.id === 'shenandoah')!.tempo).toBe(60);
    const bars = await chordsByBar('auld-lang-syne');
    expect([...new Set(bars.filter((c) => c !== 'N.C.'))].sort()).toEqual(['A', 'Bm7', 'D', 'G']);
    // One chord a bar, so every D or A bar can take the move on beat 3.
    for (let bar = 2; bar <= s.bars.length; bar++) expect((await chordsInBar('auld-lang-syne', bar)).length, `bar ${bar}`).toBeLessThanOrEqual(1);
    // The D and A it plays are the shapes the lesson decorates.
    const text = await loadSongText('auld-lang-syne');
    expect(text).toContain('"D=xx0232"');
    expect(text).toContain('"A=x02220"');
    expect(text).toMatch(/^time: 4\/4$/m);
    expect(s.tracks.some((t) => t.name === 'Your strum' && t.role === 'rhythm')).toBe(true);
    // The text names exactly the chords the song has.
    for (const c of ['D', 'A', 'G', 'Bm7']) expect(plain(sh.fallback!.body)).toContain(`{c:${c}}`);
  });

  it('says where the riff\'s chords come straight after another chord (review fix)', async () => {
    // Review bug: the task said every chord comes after a beat of gallops; in bars 2 and 4 G5 goes
    // straight to A5 and C5 straight to D5, the same shape two frets up.
    const s = await song('st-power-chords-gallop');
    const struck = s.tracks[0].measures.slice(0, 7).flatMap((m) => m.beats.filter((b) => b.notes.length >= 3).map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join(' ')));
    const name = (shape: string) => identifyFretted(['6', '5', '4', '3', '2', '1'].map((st) => (shape.split(' ').find((p) => p.startsWith(`${st}:`)) ?? 'x').replace(/^\d:/, '')).join('')).symbol;
    const pairs: string[] = [];
    for (const m of s.tracks[0].measures.slice(0, 7)) {
      for (let i = 1; i < m.beats.length; i++) {
        const a = m.beats[i - 1];
        const b = m.beats[i];
        if (a.notes.length >= 3 && b.notes.length >= 3) pairs.push(`${name(a.notes.map((n) => `${n.string}:${n.fret}`).join(' '))}>${name(b.notes.map((n) => `${n.string}:${n.fret}`).join(' '))}`);
      }
    }
    expect([...new Set(pairs)].sort()).toEqual(['C5>D5', 'G5>A5']);
    expect(struck.length).toBeGreaterThan(0);
    const body = plain(tasks.find((t) => t.id === 'gallop-player')!.body);
    expect(body).toContain('{c:G5} to {c:A5}');
    expect(body).toContain('{c:C5} to {c:D5}');
    expect(body).not.toMatch(/every jump/i);
  });

  it('names the tools\' own parts as the tools do (review fix)', () => {
    // The funk study's sections are Pattern A and Pattern B, not 1 and 2.
    const text = JSON.stringify(unit.lessons.find((l) => l.id === 'funk'));
    expect(text).not.toMatch(/pattern [12]\b/i);
    expect(text).toContain('Pattern A is bars 1 to 4');
    // Rhythm's patterns by their names on screen.
    const swing = plain(tasks.find((t) => t.id === 'swing-rhythm')!.body);
    expect(swing).toContain(strumPattern('swung-eighths')!.name);
    expect(swing).toContain(strumPattern('down-up')!.name);
    expect(plain(tasks.find((t) => t.id === 'gallop-rhythm')!.body)).toContain(strumPattern('gallop')!.name);
    // Metronome on 2 and 4 strums a straight Em groove: the task says so, and keeps the swung A7 for after.
    const mm = getExercise('tech-metronome-2-4')!;
    expect(mm.parts[0].tab).toContain('"Em=022000"');
    const body = plain(tasks.find((t) => t.id === 'metronome-2-4')!.body);
    expect(body).toContain("exercise's {c:Em} pattern as written");
    expect(body.indexOf('{c:A7}')).toBeGreaterThan(body.indexOf('{c:Em}'));
  });

  it('jams on the chords the text names, at tempos the band plays', () => {
    expect(
      jamProblems(unit, {
        'gallop-jam': ['E5', 'C5', 'D5'],
        'funk-jam': ['E9'],
        'reggae-jam': ['G', 'C'],
        'country-jam': ['G', 'A7', 'D7'],
        'slow-blues-jam': ['A7', 'D7', 'E7'],
        'folk-sus-jam': ['D', 'Dsus4', 'Dsus2'],
      }),
    ).toEqual([]);
  });

  it('opens Rhythm on patterns and drills that exist', () => {
    for (const t of tasks.filter((x) => x.tool === 'rhythm')) {
      const [section, id] = t.params!;
      if (section === 'strum') expect(strumPattern(id), t.id).toBeTruthy();
      if (section === 'drill') expect(DRILLS.some((d) => d.id === id), t.id).toBe(true);
    }
  });

  it('names the BPM of every Player task as the song tempo times its percentage', async () => {
    expect(await taskBpmProblems(unit)).toEqual([]);
  });
});
