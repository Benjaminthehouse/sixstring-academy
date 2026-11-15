import { describe, expect, it } from 'vitest';
import plan from './teachers.json';
import repertoire from './repertoire.json';
import theoryPath from './theory-path.json';
import {
  chordNotes, chordPcs, chordTones, chroma, intervalBetween, parseChord, progressionToChords, romanToChord, scaleNotes,
  harmonizeScale, staffPosition, transposeChord, transposeChordBySemitones, tritoneSubstitute, diatonicChords, getChordType,
} from '@/core/theory';
import {
  STANDARD_TUNING, capoShapes, fretDistance, getTuning, parseFrets, retuneSteps, scalePatterns, voicingProblem,
} from '@/core/guitar';
import { getProgression, keyChoices, progressionInKey } from '@/content/progressions';

/** One lesson of a teacher's course, exactly as teachers.json stores it. */
interface Lesson {
  id: string;
  title: string;
  kind: string;
  goal: string;
  explain: string;
  show: string;
  practice: string[];
  music: string[];
  theory: string[];
  minutes: number;
}
/** A unit of a course. */
interface Unit {
  id: string;
  title: string;
  goal: string;
  lessons: Lesson[];
}
/** One teacher's course. */
interface Course {
  id: string;
  title: string;
  promise: string;
  units: Unit[];
}

const courses = (plan as { courses: Course[] }).courses;
const lessons = courses.flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => ({ course: c.id, unit: u.id, lesson: l }))));
const byId = new Map(lessons.map((x) => [x.lesson.id, x.lesson]));

const rep = repertoire as { pieces: { id: string; key: string; tempo: number }[]; studies: { id: string }[]; technique: { id: string }[] };
const pieceIds = new Set(rep.pieces.map((p) => p.id));
const studyIds = new Set(rep.studies.map((s) => s.id));
const musicIds = new Set([...pieceIds, ...studyIds, ...rep.technique.map((t) => t.id)]);

type TheoryStage = { id: string; units: { id: string; lessons: { id: string }[] }[] };
const stages = (theoryPath as { course: { stages: TheoryStage[] } }).course.stages;
const theoryStage = new Map(stages.flatMap((s) => s.units.flatMap((u) => u.lessons.map((l) => [l.id, s.id] as const))));

const KINDS = ['concept', 'technique', 'song', 'jam', 'review', 'milestone'];
/** Every practice step names where it happens: an in-lesson exercise or one of the app's tools. */
const TAGS = [
  'Lesson', 'Mic', 'Player', 'Metronome', 'Tuner', 'Chords', 'Jam', 'Rhythm', 'Ear', 'Fretboard', 'Arcade', 'Scales',
  'Technique', 'Practice Plan', 'Live Fretboard', 'Record', 'Create', 'Scan', 'With others', 'Away from the guitar',
];
/** Sounding MIDI of the open strings in standard tuning, indexed by string number (1 = high E). */
const OPEN = [0, 64, 59, 55, 50, 45, 40];

/** Every free-text field of a lesson. */
function texts(l: Lesson): string[] {
  return [l.title, l.goal, l.explain, l.show, ...l.practice];
}
const textOf = (l: Lesson) => texts(l).join('\n');
const midiAt = (string: number, fret: number) => OPEN[string] + fret;
const pcSet = (xs: (string | number)[]) => [...new Set(xs.map((x) => (typeof x === 'number' ? x % 12 : chroma(x))))].sort((a, b) => a - b).join(',');
/** Sounding MIDI notes of a fret string such as x32010 or 8-10-10-9-8-8, low string first. */
function shapeMidi(frets: string): number[] {
  return parseFrets(frets).flatMap((f, i) => (f === null ? [] : [OPEN[6 - i] + f]));
}
/** Pitch classes of the "string N fret M" positions mentioned in a text, in order. */
function positions(text: string): { string: number; fret: number }[] {
  return [...text.matchAll(/string ([1-6]) fret (\d{1,2})/g)].map((m) => ({ string: Number(m[1]), fret: Number(m[2]) }));
}
/** Ties a claim to the lesson text, so the check cannot drift away from what the lesson says. */
function claim(id: string, snippet: string): Lesson {
  const l = byId.get(id);
  expect(l, `no lesson ${id}`).toBeDefined();
  expect(textOf(l!), `${id} no longer says "${snippet}"`).toContain(snippet);
  return l!;
}
/** The chord roots of a catalog progression in a key, bar by bar (one per bar). */
function barRoots(id: string, tonic: string): string[] {
  return progressionInKey(id, tonic).bars.map((bar) => bar.map((c) => c.symbol.replace(/7$/, '')).join(' '));
}

describe('teachers plan: shape', () => {
  it('has exactly three courses, Mia, Dev and Elena, with exactly the agreed fields', () => {
    expect(Object.keys(plan)).toEqual(['courses']);
    expect(courses.map((c) => c.id)).toEqual(['mia', 'dev', 'elena']);
    for (const c of courses) {
      expect(Object.keys(c).sort(), c.id).toEqual(['id', 'promise', 'title', 'units']);
      for (const u of c.units) {
        expect(Object.keys(u).sort(), u.id).toEqual(['goal', 'id', 'lessons', 'title']);
        for (const l of u.lessons) {
          expect(Object.keys(l).sort(), l.id).toEqual(['explain', 'goal', 'id', 'kind', 'minutes', 'music', 'practice', 'show', 'theory', 'title']);
        }
      }
    }
  });

  it('gives each course between 55 and 90 lessons in units of 4 to 8', () => {
    for (const c of courses) {
      const n = c.units.reduce((s, u) => s + u.lessons.length, 0);
      expect(n, c.id).toBeGreaterThanOrEqual(55);
      expect(n, c.id).toBeLessThanOrEqual(90);
      for (const u of c.units) {
        expect(u.lessons.length, u.id).toBeGreaterThanOrEqual(4);
        expect(u.lessons.length, u.id).toBeLessThanOrEqual(8);
      }
    }
  });

  it('uses unique kebab-case unit ids across all courses, each prefixed with its teacher', () => {
    const ids = courses.flatMap((c) => c.units.map((u) => u.id));
    for (const c of courses) for (const u of c.units) expect(u.id, u.id).toMatch(new RegExp(`^${c.id}-[a-z0-9]+(?:-[a-z0-9]+)*$`));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('uses unique lesson ids of the form course/unit/slug, and the slugs are unique on their own', () => {
    for (const { course, unit, lesson } of lessons) {
      expect(lesson.id, lesson.id).toMatch(/^[a-z]+\/[a-z0-9-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(lesson.id.startsWith(`${course}/${unit}/`), lesson.id).toBe(true);
    }
    const ids = lessons.map((x) => x.lesson.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const slugs = ids.map((id) => id.split('/')[2]);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
  });

  it('uses only the agreed lesson kinds and whole-minute lengths from 5 to 30', () => {
    for (const { lesson: l } of lessons) {
      expect(KINDS, l.id).toContain(l.kind);
      expect(Number.isInteger(l.minutes), l.id).toBe(true);
      expect(l.minutes, l.id).toBeGreaterThanOrEqual(5);
      expect(l.minutes, l.id).toBeLessThanOrEqual(30);
    }
  });

  it('keeps every text non-empty, plain ASCII and free of placeholders', () => {
    for (const c of courses) {
      for (const t of [c.title, c.promise, ...c.units.flatMap((u) => [u.title, u.goal])]) {
        expect(t.trim().length, c.id).toBeGreaterThan(0);
        expect(t, c.id).toMatch(/^[\x20-\x7e]*$/);
      }
    }
    for (const { lesson: l } of lessons) {
      for (const t of texts(l)) {
        expect(t.trim().length, `${l.id}: empty text`).toBeGreaterThan(0);
        expect(t, `${l.id}: non-ASCII text`).toMatch(/^[\x20-\x7e]*$/);
        expect(t, `${l.id}: placeholder`).not.toMatch(/\b(TODO|TBD|FIXME|lorem|XXX)\b/i);
      }
      expect(l.explain.split(/(?<=[.?!])\s+/).length, `${l.id}: explain needs two or three sentences of substance`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('teachers plan: practice steps', () => {
  it('gives every lesson at least two practice steps, each naming the tool or exercise it uses', () => {
    for (const { lesson: l } of lessons) {
      expect(l.practice.length, l.id).toBeGreaterThanOrEqual(2);
      for (const step of l.practice) {
        const head = step.split(':')[0];
        expect(TAGS.some((t) => head === t || head.startsWith(`${t} `) || head.startsWith(`${t},`)), `${l.id}: "${step.slice(0, 50)}"`).toBe(true);
      }
    }
  });

  it('names the microphone exercise type and a no-microphone alternative in every Mic step', () => {
    let mic = 0;
    for (const { lesson: l } of lessons) {
      for (const step of l.practice.filter((s) => s.startsWith('Mic'))) {
        expect(step, l.id).toMatch(/^Mic \((play-note|play-chord|play-phrase)\): /);
        expect(step, `${l.id}: no alternative`).toMatch(/Without a microphone/);
        mic++;
      }
    }
    expect(mic).toBeGreaterThan(60);
  });

  it('lets the microphone check the learner in a good share of every course', () => {
    for (const c of courses) {
      const ls = c.units.flatMap((u) => u.lessons);
      const heard = ls.filter((l) => l.practice.some((s) => /^Mic|microphone|Tuner|wait mode/.test(s)));
      expect(heard.length / ls.length, c.id).toBeGreaterThan(0.45);
    }
  });

  it('names a real jam track, in a key the catalog offers, in every Jam step', () => {
    let checked = 0;
    for (const { lesson: l } of lessons) {
      for (const step of l.practice.filter((s) => s.startsWith('Jam'))) {
        const tracks = [...step.matchAll(/jam track ([a-z0-9]+(?:-[a-z0-9]+)+)(?: in ([A-G](?:#|b)?))?/g)];
        expect(tracks.length, `${l.id}: Jam step without a jam track`).toBeGreaterThan(0);
        for (const m of tracks) {
          const p = getProgression(m[1]);
          expect(p, `${l.id}: unknown jam track ${m[1]}`).not.toBeNull();
          if (m[2]) expect(keyChoices(p!), `${l.id}: ${m[1]} in ${m[2]}`).toContain(m[2]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('teachers plan: links', () => {
  it('links only to music that exists in repertoire.json', () => {
    for (const { lesson: l } of lessons) {
      for (const id of l.music) expect(musicIds.has(id), `${l.id}: unknown music ${id}`).toBe(true);
      expect(new Set(l.music).size, `${l.id}: duplicate music`).toBe(l.music.length);
    }
  });

  it('links only to Theory Path lessons that exist in theory-path.json', () => {
    for (const { lesson: l } of lessons) {
      for (const id of l.theory) expect(theoryStage.has(id), `${l.id}: unknown theory ${id}`).toBe(true);
      expect(new Set(l.theory).size, `${l.id}: duplicate theory`).toBe(l.theory.length);
    }
  });

  it('gives every song and milestone a real piece or study to play', () => {
    for (const { lesson: l } of lessons.filter((x) => x.lesson.kind === 'song')) {
      expect(l.music.some((id) => pieceIds.has(id) || studyIds.has(id)), l.id).toBe(true);
    }
    for (const c of courses) {
      const ms = c.units.flatMap((u) => u.lessons).filter((l) => l.kind === 'milestone');
      expect(ms.filter((l) => l.music.length > 0).length / ms.length, c.id).toBeGreaterThan(0.6);
    }
  });

  it('mostly links each course to its own Theory Path stage or an earlier one', () => {
    const allowed: Record<string, string[]> = { mia: ['beginner'], dev: ['beginner', 'intermediate'], elena: ['beginner', 'intermediate', 'expert'] };
    for (const c of courses) {
      const links = c.units.flatMap((u) => u.lessons.flatMap((l) => l.theory));
      const own = links.filter((id) => allowed[c.id].includes(theoryStage.get(id)!));
      expect(own.length / links.length, c.id).toBeGreaterThan(0.75);
    }
    // Mia never sends a beginner to the expert stage, except for the 6/8 basics, which live there.
    const miaExpert = courses[0].units.flatMap((u) => u.lessons.flatMap((l) => l.theory)).filter((id) => theoryStage.get(id) === 'expert');
    expect([...new Set(miaExpert)]).toEqual(['compound-and-odd-meters/six-eight']);
  });

  it('gives each teacher music at the right level, rising from Mia to Dev to Elena', () => {
    const level = new Map([...rep.pieces, ...rep.studies, ...rep.technique].map((e) => [e.id, (e as { level: number }).level]));
    const levels = courses.map((c) => c.units.flatMap((u) => u.lessons.flatMap((l) => l.music.map((id) => level.get(id)!))).sort((a, b) => a - b));
    expect(Math.max(...levels[0]), 'mia').toBeLessThanOrEqual(5);
    expect(Math.max(...levels[1]), 'dev').toBeLessThanOrEqual(7);
    const median = levels.map((ls) => ls[Math.floor(ls.length / 2)]);
    expect(median[0]).toBeLessThan(median[1]);
    expect(median[1]).toBeLessThan(median[2]);
  });

  it('starts Mia with music in lesson 1 and a real tune by lesson 5, and ends every course on a milestone', () => {
    const mia = courses[0].units.flatMap((u) => u.lessons);
    expect(mia[0].music.length).toBeGreaterThan(0);
    expect(mia.slice(0, 5).some((l) => l.kind === 'song' && l.music.some((id) => pieceIds.has(id)))).toBe(true);
    for (const c of courses) expect(c.units.at(-1)!.lessons.at(-1)!.kind, c.id).toBe('milestone');
  });

  it('keeps target tempos named for a single piece within that piece\'s target tempo', () => {
    const tempo = new Map(rep.pieces.map((p) => [p.id, p.tempo]));
    for (const { lesson: l } of lessons) {
      const pieces = l.music.filter((id) => pieceIds.has(id));
      if (pieces.length !== 1 || l.music.some((id) => studyIds.has(id))) continue;
      for (const step of l.practice.filter((s) => s.startsWith('Player'))) {
        for (const m of step.matchAll(/(\d{2,3}) bpm/g)) {
          expect(Number(m[1]), `${l.id}: "${step.slice(0, 60)}"`).toBeLessThanOrEqual(tempo.get(pieces[0])!);
        }
      }
    }
  });
});

describe('teachers plan: frets and chord shapes match the engines', () => {
  it('names the right note for every "string N fret M (X)" and "open string N (X)"', () => {
    let checked = 0;
    for (const { lesson: l } of lessons) {
      for (const text of texts(l)) {
        for (const m of text.matchAll(/string ([1-6]) fret (\d{1,2}) \(([A-G](?:##|#|bb|b)?)(\d)?\)/g)) {
          const midi = midiAt(Number(m[1]), Number(m[2]));
          expect(midi % 12, `${l.id}: ${m[0]}`).toBe(chroma(m[3]));
          checked++;
        }
        for (const m of text.matchAll(/open string ([1-6]) \(([A-G](?:#|b)?)\)/g)) {
          expect(OPEN[Number(m[1])] % 12, `${l.id}: ${m[0]}`).toBe(chroma(m[2]));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  const SHAPE = String.raw`(?:[x0-9]{6}|(?:[x0-9]{1,2}-){5}[x0-9]{1,2})`;
  /** Shapes taught on purpose with a note other than the root lowest (the one-finger G, drop-2 and other rootless-bass grips). */
  const INVERTED = new Set(['G xx0003', 'Dm7 xx3535', 'G7 xx3433', 'Cmaj7 xx2413', 'Am7 xx2213']);

  it('builds every "Chord (shape)" it names, with the right bass, and names a chord for every shape', () => {
    let checked = 0;
    for (const { lesson: l } of lessons) {
      for (const text of texts(l)) {
        const shapes = [...text.matchAll(new RegExp(String.raw`\((${SHAPE})(?=[),\s])`, 'g'))].length;
        const named = [...text.matchAll(new RegExp(String.raw`(?<![\w#/])([A-G](?:#|b)?[A-Za-z0-9#+]*(?:/[A-G](?:#|b)?)?) \((${SHAPE})\)`, 'g'))];
        expect(named.length, `${l.id}: a shape without a chord symbol in "${text.slice(0, 70)}..."`).toBe(shapes);
        for (const m of named) {
          const [, symbol, frets] = m;
          const chord = parseChord(symbol);
          expect(chord, `${l.id}: ${symbol}`).not.toBeNull();
          expect(voicingProblem(symbol, frets), `${l.id}: ${symbol} (${frets})`).toBeNull();
          const midi = shapeMidi(frets);
          for (const n of midi) expect(chordPcs(chord!).includes(n % 12), `${l.id}: ${symbol} (${frets}) outside note`).toBe(true);
          if (!INVERTED.has(`${symbol} ${frets}`)) {
            expect(Math.min(...midi) % 12, `${l.id}: ${symbol} (${frets}) bass`).toBe(chroma(chord!.bass ?? chord!.root));
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('teachers plan: Mia\'s facts match the engines', () => {
  it('standard tuning, the fifth-fret rule and the capo table', () => {
    claim('mia/mia-hello-guitar/tune-up', 'string 6 E2, string 5 A2, string 4 D3, string 3 G3, string 2 B3, string 1 E4');
    claim('mia/mia-hello-guitar/meet-your-guitar', 'E2 A2 D3 G3 B3 E4');
    expect(STANDARD_TUNING.notes).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    claim('mia/mia-playing-with-others/tune-without-a-tuner', 'string 3 fret 4 (B) and the open string 2');
    for (const [s, f] of [[6, 5], [5, 5], [4, 5], [3, 4], [2, 5]]) expect(midiAt(s, f), `string ${s} fret ${f}`).toBe(OPEN[s - 1]);
    claim('mia/mia-playing-with-others/the-capo', 'capo 2 turns G C D into A D E, capo 3 into Bb Eb F, capo 5 into C F G');
    const table: [number, string[]][] = [[2, ['A', 'D', 'E']], [3, ['Bb', 'Eb', 'F']], [5, ['C', 'F', 'G']]];
    for (const [capo, sounds] of table) {
      expect(['G', 'C', 'D'].map((c) => chroma(transposeChordBySemitones(c, capo)))).toEqual(sounds.map((n) => chroma(n)));
    }
    claim('mia/mia-playing-with-others/the-capo', 'what sounds? (D)');
    expect(chroma(transposeChordBySemitones('C', 2))).toBe(chroma('D'));
  });

  it('the first tunes are the notes the lessons say', () => {
    const hcb = claim('mia/mia-hello-guitar/hot-cross-buns', '4 2 0 | 4 2 0 | 0 0 2 2 | 4 2 0');
    expect(hcb.show).toContain('string 3 fret 4 (B)');
    expect([4, 2, 0, 4, 2, 0, 0, 0, 2, 2, 4, 2, 0].map((f) => midiAt(3, f))).toEqual([59, 57, 55, 59, 57, 55, 55, 55, 57, 57, 59, 57, 55]);
    claim('mia/mia-melodies-from-tab/twinkle-twinkle', 'a jump of a fifth, from the open G to D on string 2');
    expect(intervalBetween('G3', 'D4')).toBe('P5');
    expect(midiAt(2, 3) - OPEN[3]).toBe(7);
    // The scale walk is written as fretted and open strings in turn: D C# B A G F# E D.
    claim('mia/mia-riffs-and-melodies/joy-to-the-world', 'string 2 fret 3 (D), string 2 fret 2 (C#), the open string 2 (B), string 3 fret 2 (A), the open string 3 (G), string 4 fret 4 (F#), string 4 fret 2 (E), the open string 4 (D)');
    const line = [midiAt(2, 3), midiAt(2, 2), OPEN[2], midiAt(3, 2), OPEN[3], midiAt(4, 4), midiAt(4, 2), OPEN[4]];
    expect(pcSet(line)).toBe(pcSet(scaleNotes('D', 'major')));
    expect(line).toEqual([...line].sort((a, b) => b - a));
    expect(line[0] - line[7]).toBe(12);
    const fur = claim('mia/mia-riffs-and-melodies/fur-elise', 'E D# E D# E B D C A');
    expect(fur.explain).toContain('string 2 fret 4 (D#)');
    // Silent Night's picking pattern on G uses only notes of the G chord.
    claim('mia/mia-strumming-patterns/silent-night', 'the thumb on string 6 fret 3 (G); 2, i on the open string 3 (G); 3, m on the open string 2 (B); 4, the thumb again; 5, a on string 1 fret 3 (G)');
    for (const n of [midiAt(6, 3), OPEN[3], OPEN[2], midiAt(1, 3)]) expect(chordPcs(parseChord('G')!)).toContain(n % 12);
    claim('mia/mia-first-barre/f-in-the-key-of-c', 'C, F and G are the I, IV and V of C major and Am is its vi');
    expect(progressionToChords('I IV V vi', 'C')).toEqual(['C', 'F', 'G', 'Am']);
  });

  it('box 1 of A minor pentatonic and the open E minor pentatonic are the engine\'s shapes', () => {
    const box = claim('mia/mia-first-solo/a-minor-pentatonic', 'A minor pentatonic has five: A C D E G');
    expect(pcSet(scaleNotes('A', 'minor-pentatonic'))).toBe(pcSet(['A', 'C', 'D', 'E', 'G']));
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    const shown = positions(box.show).map((p) => `${p.string}:${p.fret}`).sort();
    expect(shown).toEqual(box1.notes.map((n) => `${n.string}:${n.fret}`).sort());
    expect(box1.notes.filter((n) => n.finger === 4).map((n) => n.string).sort()).toEqual([1, 2, 6]);
    expect(box1.notes.filter((n) => n.finger === 3).map((n) => n.string).sort()).toEqual([3, 4, 5]);
    const em = claim('mia/mia-first-solo/e-minor-pentatonic', 'E minor (E G A B D)');
    expect(pcSet(scaleNotes('E', 'minor-pentatonic'))).toBe(pcSet(['E', 'G', 'A', 'B', 'D']));
    const openBox = scalePatterns('E', 'minor-pentatonic')[0];
    expect(openBox.minFret).toBe(0);
    const fretted = positions(em.explain).map((p) => `${p.string}:${p.fret}`).sort();
    expect(fretted).toEqual(openBox.notes.filter((n) => n.fret > 0).map((n) => `${n.string}:${n.fret}`).sort());
  });

  it('the keys, numerals and forms Mia names', () => {
    claim('mia/mia-g-and-c/michael-row', 'the chords built on the 1st, 4th and 5th notes of the D major scale');
    expect(['I', 'IV', 'V'].map((r) => romanToChord(r, 'D'))).toEqual(['D', 'G', 'A']);
    claim('mia/mia-g-and-c/coming-round-the-mountain', 'G, C and D7, are the I, IV and V7 of G major');
    expect(['I', 'IV', 'V7'].map((r) => romanToChord(r, 'G'))).toEqual(['G', 'C', 'D7']);
    claim('mia/mia-minor-chords/wade-in-the-water', 'Em, Am and B7, the three main chords of E minor');
    expect(['i', 'iv', 'V7'].map((r) => romanToChord(r, 'E minor'))).toEqual(['Em', 'Am', 'B7']);
    claim('mia/mia-first-barre/bm-barre', 'the chord built on the 6th note of the scale');
    expect(romanToChord('vi', 'D')).toBe('Bm');
    claim('mia/mia-playing-with-others/jamming-with-the-band', 'I-vi-IV-V (G Em C D) and I-V-vi-IV (G D Em C)');
    expect(progressionToChords('I vi IV V', 'G')).toEqual(['G', 'Em', 'C', 'D']);
    expect(progressionToChords('I V vi IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
    claim('mia/mia-power-chords/blues-shuffle-in-a', 'A A A A | D D A A | E D A E');
    expect(barRoots('blues-12-bar', 'A')).toEqual('A A A A D D A A E D A E'.split(' '));
    claim('mia/mia-minor-chords/major-or-minor', 'lowering that note by one fret makes the chord minor');
    for (const [maj, min] of [['022100', '022000'], ['x02220', 'x02210'], ['xx0232', 'xx0231']]) {
      const a = shapeMidi(maj);
      const b = shapeMidi(min);
      const diff = a.map((n, i) => n - b[i]).filter((d) => d !== 0);
      expect(diff, `${maj} to ${min}`).toEqual([1]);
    }
  });
});

describe('teachers plan: Dev\'s facts match the engines', () => {
  it('the five pentatonic boxes and the major-pentatonic trick', () => {
    const boxes = scalePatterns('A', 'minor-pentatonic');
    const same = (id: string, index: number) => {
      const shown = positions(byId.get(id)!.show).map((p) => `${p.string}:${p.fret % 12}`).sort();
      const engine = boxes[index].notes.map((n) => `${n.string}:${n.fret % 12}`).sort();
      return { shown, engine };
    };
    let r = same('dev/dev-pentatonic/box-2', 1);
    expect(r.shown).toEqual(r.engine);
    r = same('dev/dev-pentatonic/box-3', 2);
    expect(r.shown).toEqual(r.engine);
    const b45 = positions(byId.get('dev/dev-pentatonic/boxes-4-and-5')!.show).map((p) => `${p.string}:${p.fret % 12}`);
    expect(b45.slice(0, 12).sort()).toEqual(boxes[3].notes.map((n) => `${n.string}:${n.fret % 12}`).sort());
    expect(b45.slice(12).sort()).toEqual(boxes[4].notes.map((n) => `${n.string}:${n.fret % 12}`).sort());
    claim('dev/dev-pentatonic/box-3', 'Box 3 is the widest box, reaching from fret 9 to fret 13');
    expect([boxes[2].minFret, boxes[2].maxFret]).toEqual([9, 13]);
    expect(Math.max(...boxes.map((b) => b.maxFret - b.minFret))).toBe(boxes[2].maxFret - boxes[2].minFret);
    claim('dev/dev-pentatonic/boxes-4-and-5', 'Box 5 lies at frets 2 to 5');
    expect([boxes[4].minFret, boxes[4].maxFret]).toEqual([2, 5]);
    claim('dev/dev-pentatonic/major-pentatonic', 'A major pentatonic (A B C# E F#)');
    expect(pcSet(scaleNotes('A', 'major-pentatonic'))).toBe(pcSet(['A', 'B', 'C#', 'E', 'F#']));
    expect(pcSet(scaleNotes('F#', 'minor-pentatonic'))).toBe(pcSet(scaleNotes('A', 'major-pentatonic')));
    const fs = scalePatterns('F#', 'minor-pentatonic')[0];
    expect([fs.minFret, fs.maxFret]).toEqual([2, 5]);
    expect(boxes[0].minFret - fs.minFret).toBe(3);
    expect(fs.notes.filter((n) => n.note === 'A').map((n) => `${n.string}:${n.fret}`).sort()).toEqual(['1:5', '3:2', '6:5']);
    claim('dev/dev-pentatonic/major-pentatonic', 'G major pentatonic (G A B D E)');
    expect(pcSet(scaleNotes('G', 'major-pentatonic'))).toBe(pcSet(['G', 'A', 'B', 'D', 'E']));
    expect(pcSet(scaleNotes('C', 'major-pentatonic'))).toBe(pcSet(scaleNotes('A', 'minor-pentatonic')));
  });

  it('the CAGED positions of C major and the triads of G major', () => {
    claim('dev/dev-major-scale/five-positions', 'the C shape (frets 0 to 3), the A shape (frets 2 to 6), the G shape (frets 4 to 8), the E shape (frets 7 to 10) and the D shape (frets 9 to 13)');
    expect(scalePatterns('C', 'major').map((p) => `${p.shape} ${p.minFret}-${p.maxFret}`)).toEqual(['C 0-3', 'A 2-6', 'G 4-8', 'E 7-10', 'D 9-13']);
    claim('dev/dev-caged/triads-on-top', 'listen to the top note climb G, G, A, B');
    const top = ['x-x-x-4-3-3', 'x-x-x-5-5-3', 'x-x-x-7-7-5', 'x-x-x-7-8-7'].map((f) => Math.max(...shapeMidi(f)) % 12);
    expect(top).toEqual(['G', 'G', 'A', 'B'].map((n) => chroma(n)));
    claim('dev/dev-caged/minor-triads-and-the-key', 'G, Am, Bm, C, D and Em are all within reach');
    expect(diatonicChords('G major').map((c) => c.symbol).slice(0, 6)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em']);
    claim('dev/dev-caged/g-everywhere', 'a D shape with its root on string 4 fret 5 (G)');
  });

  it('the blues forms, the blue note, the turnarounds and the targets', () => {
    claim('dev/dev-blues/blues-in-e', 'E A E E | A A E E | B7 A E B7');
    expect(barRoots('blues-quick-change', 'E')).toEqual('E A E E A A E E B A E B'.split(' '));
    claim('dev/dev-blues/blues-scale-solo', 'A blues scale: A C D Eb E G');
    expect(scaleNotes('A', 'minor-blues')).toEqual(['A', 'C', 'D', 'Eb', 'E', 'G']);
    claim('dev/dev-blues/turnarounds', 'Both lines run b7, 6, b6, 5 of the key');
    const degreesFrom = (tonic: string, ns: number[]) => ns.map((n) => (n - chroma(tonic) + 12) % 12);
    expect(degreesFrom('E', [7, 6, 5, 4].map((f) => midiAt(3, f)))).toEqual([10, 9, 8, 7]);
    expect(degreesFrom('A', [5, 4, 3, 2].map((f) => midiAt(4, f)))).toEqual([10, 9, 8, 7]);
    claim('dev/dev-blues/dominant-sevenths', 'G in A7, C in D7, D in E7');
    expect(['A7', 'D7', 'E7'].map((c) => chordNotes(c)[3])).toEqual(['G', 'C', 'D']);
    claim('dev/dev-blues/major-and-minor-mix', 'over A7 land on its third, string 3 fret 6 (C#)');
    const role = (c: string, r: string) => chordTones(c).find((t) => t.role === r)!.note;
    expect([role('A7', 'third'), role('D7', 'seventh'), role('E7', 'third')]).toEqual(['C#', 'C', 'G#']);
    claim('dev/dev-blues/minor-blues', 'Am7 (x02010) and Dm7 (xx0211)');
    expect(barRoots('blues-minor', 'A')).toEqual('Am Am Am Am Dm Dm Am Am E Dm Am E'.split(' '));
  });

  it('the seventh chords, their key and the secondary dominants', () => {
    claim('dev/dev-seventh-chords/four-sevenths', 'Cmaj7 = C E G B, C7 = C E G Bb, Cm7 = C Eb G Bb and Cm7b5 = C Eb Gb Bb');
    expect(['Cmaj7', 'C7', 'Cm7', 'Cm7b5'].map((c) => chordNotes(c).join(' '))).toEqual(['C E G B', 'C E G Bb', 'C Eb G Bb', 'C Eb Gb Bb']);
    claim('dev/dev-seventh-chords/four-sevenths', 'Major seventh (1 3 5 7) is dreamy, dominant seventh (1 3 5 b7)');
    expect(['maj7', '7', 'm7', 'm7b5'].map((t) => getChordType(t)!.degrees.join(' '))).toEqual(['1 3 5 7', '1 3 5 b7', '1 b3 5 b7', '1 b3 b5 b7']);
    claim('dev/dev-seventh-chords/sevenths-in-a-key', 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5');
    expect(harmonizeScale('C', 'major', { sevenths: true }).map((c) => c.symbol).join(' ')).toBe('Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5');
    claim('dev/dev-seventh-chords/secondary-dominant-songs', 'A7 is the dominant of D');
    expect(romanToChord('V7', 'D')).toBe('A7');
    expect([romanToChord('V7/V', 'C'), romanToChord('V7/vi', 'C')]).toEqual(['D7', 'E7']);
    claim('dev/dev-seventh-chords/ragtime-changes', 'C, A7, D7, G7, each one the dominant of the next');
    expect([romanToChord('V7', 'D'), romanToChord('V7', 'G'), romanToChord('V7', 'C')]).toEqual(['A7', 'D7', 'G7']);
    expect(barRoots('secondary-ragtime', 'C')).toEqual(['C', 'A', 'D', 'G']);
  });

  it('arpeggios, targets, modes, keys and transposition', () => {
    claim('dev/dev-improvising/arpeggios', 'C (C E G), Dm (D F A), Em (E G B), F (F A C), G (G B D), Am (A C E)');
    for (const [c, ns] of [['C', 'C E G'], ['Dm', 'D F A'], ['Em', 'E G B'], ['F', 'F A C'], ['G', 'G B D'], ['Am', 'A C E']]) expect(chordNotes(c).join(' ')).toBe(ns);
    claim('dev/dev-improvising/target-notes', 'Over C, Am, F and G the thirds are E, C, A and B');
    expect(['C', 'Am', 'F', 'G'].map((c) => chordNotes(c)[1])).toEqual(['E', 'C', 'A', 'B']);
    claim('dev/dev-improvising/dorian-and-mixolydian', 'A Dorian (A B C D E F# G) and A Mixolydian (A B C# D E F# G)');
    expect(scaleNotes('A', 'dorian').join(' ')).toBe('A B C D E F# G');
    expect(scaleNotes('A', 'mixolydian').join(' ')).toBe('A B C# D E F# G');
    const key = (id: string) => rep.pieces.find((p) => p.id === id)!.key;
    expect([key('old-joe-clark'), key('red-haired-boy'), key('drunken-sailor')]).toEqual(['A mixolydian', 'A mixolydian', 'E dorian']);
    claim('dev/dev-band-and-ear/capo-and-keys', 'a song in Bb, Eb and F becomes the shapes G, C and D with the capo at fret 3');
    expect(capoShapes(['Bb', 'Eb', 'F'], 3).map((s) => s.shape)).toEqual(['G', 'C', 'D']);
    claim('dev/dev-band-and-ear/capo-and-keys', 'move G, Em, C, D up a whole step (A, F#m, D, E)');
    expect(['G', 'Em', 'C', 'D'].map((c) => transposeChord(c, 'M2'))).toEqual(['A', 'F#m', 'D', 'E']);
  });

  it('octave shapes and the staff positions Dev teaches', () => {
    const o = claim('dev/dev-neck-and-reading/notes-everywhere', 'two strings over and three frets up');
    const ps = positions(o.explain);
    for (let i = 0; i < ps.length; i += 2) expect(midiAt(ps[i + 1].string, ps[i + 1].fret) - midiAt(ps[i].string, ps[i].fret), o.id).toBe(12);
    expect(midiAt(1, 5) - midiAt(3, 2)).toBe(12);
    claim('dev/dev-neck-and-reading/reading-strings-1-to-3', 'the open string 3 (G) is written on the second line from the bottom, the open string 2 (B) on the middle line and the open string 1 (E) in the top space');
    expect([staffPosition('G3').position, staffPosition('B3').position, staffPosition('E4').position]).toEqual([2, 4, 7]);
    claim('dev/dev-neck-and-reading/reading-all-six-strings', 'the open string 6 (E) is written below three ledger lines');
    expect(staffPosition('E2').ledgerLines).toBe(-3);
    claim('dev/dev-major-scale/major-scale-first-position', 'from string 6 fret 3 (G) up two octaves to string 1 fret 3 (G)');
    expect(midiAt(1, 3) - midiAt(6, 3)).toBe(24);
  });
});

describe('teachers plan: Elena\'s facts match the engines', () => {
  it('the seven modes on A and their defining notes', () => {
    const l = claim('elena/elena-modes/modes-as-colours', 'Ionian A B C# D E F# G#');
    const modes: [string, string][] = [['Ionian', 'major'], ['Dorian', 'dorian'], ['Phrygian', 'phrygian'], ['Lydian', 'lydian'], ['Mixolydian', 'mixolydian'], ['Aeolian', 'minor'], ['Locrian', 'locrian']];
    for (const [name, id] of modes) expect(l.show, name).toContain(`${name} ${scaleNotes('A', id).join(' ')}`);
    claim('elena/elena-modes/modes-as-colours', 'Dorian\'s major sixth (F#), Phrygian\'s flat second (Bb), Lydian\'s sharp fourth (D#), Mixolydian\'s flat seventh (G), Aeolian\'s flat sixth (F) and Locrian\'s flat fifth (Eb)');
    const nth = (id: string, i: number) => scaleNotes('A', id)[i];
    expect([nth('dorian', 5), nth('phrygian', 1), nth('lydian', 3), nth('mixolydian', 6), nth('minor', 5), nth('locrian', 4)]).toEqual(['F#', 'Bb', 'D#', 'G', 'F', 'Eb']);
    claim('elena/elena-modes/phrygian-and-flamenco', 'Phrygian dominant, E F G# A B C D');
    expect(scaleNotes('E', 'phrygian-dominant').join(' ')).toBe('E F G# A B C D');
    claim('elena/elena-modes/locrian', 'A Locrian (A Bb C D Eb F G)');
    expect(scaleNotes('A', 'locrian').join(' ')).toBe('A Bb C D Eb F G');
  });

  it('the harmony of harmonic and melodic minor, the altered scale and the chromatic chords', () => {
    claim('elena/elena-minor-harmony/harmonic-minor-harmony', 'AmMaj7, Bm7b5, Cmaj7#5, Dm7, E7, Fmaj7, G#dim7');
    expect(harmonizeScale('A', 'harmonic-minor', { sevenths: true }).map((c) => c.symbol).join(', ')).toBe('AmMaj7, Bm7b5, Cmaj7#5, Dm7, E7, Fmaj7, G#dim7');
    claim('elena/elena-minor-harmony/phrygian-dominant-and-solea', 'The fifth mode of A harmonic minor, E F G# A B C D');
    const hm = scaleNotes('A', 'harmonic-minor');
    expect([...hm.slice(4), ...hm.slice(0, 4)].join(' ')).toBe('E F G# A B C D');
    claim('elena/elena-minor-harmony/phrygian-dominant-and-solea', 'accents on 3, 6, 8, 10 and 12, that is groups of 3, 3, 2, 2 and 2');
    expect([3, 3, 2, 2, 2].reduce<number[]>((acc, g) => [...acc, (acc.at(-1) ?? 0) + g], [])).toEqual([3, 6, 8, 10, 12]);
    claim('elena/elena-minor-harmony/melodic-minor-harmony', 'A B C D E F# G#. Its sevenths: AmMaj7, Bm7, Cmaj7#5, D7, E7, F#m7b5, G#m7b5');
    expect(scaleNotes('A', 'melodic-minor').join(' ')).toBe('A B C D E F# G#');
    expect(harmonizeScale('A', 'melodic-minor', { sevenths: true }).map((c) => c.symbol).join(', ')).toBe('AmMaj7, Bm7, Cmaj7#5, D7, E7, F#m7b5, G#m7b5');
    claim('elena/elena-playing-the-changes/altered-dominant', 'G altered is G Ab Bb Cb Db Eb F, which is Ab melodic minor starting on G');
    expect(scaleNotes('G', 'altered').join(' ')).toBe('G Ab Bb Cb Db Eb F');
    expect(pcSet(scaleNotes('Ab', 'melodic-minor'))).toBe(pcSet(scaleNotes('G', 'altered')));
    claim('elena/elena-minor-harmony/neapolitan-and-augmented-sixth', 'stacks F A C D#');
    expect(pcSet(['F', 'A', 'C', 'D#'])).toBe(pcSet(chordNotes('F7')));
    expect(romanToChord('bII', 'A minor')).toBe('Bb');
    claim('elena/elena-minor-harmony/bach-in-minor', 'the bass holding A');
    expect(romanToChord('V', 'D minor')).toBe('A');
    claim('elena/elena-jazz-harmony/minor-ii-v-i', 'A harmonic minor (A B C D E F G#)');
    expect(scaleNotes('A', 'harmonic-minor').join(' ')).toBe('A B C D E F G#');
  });

  it('guide tones, drop-2 voice leading, extensions and substitutions', () => {
    claim('elena/elena-jazz-harmony/guide-tones', 'These two lines, C B B and F F E');
    const r = (c: string, role: string) => chordTones(c).find((t) => t.role === role)!.note;
    expect([r('Dm7', 'seventh'), r('G7', 'third'), r('Cmaj7', 'seventh')]).toEqual(['C', 'B', 'B']);
    expect([r('Dm7', 'third'), r('G7', 'seventh'), r('Cmaj7', 'third')]).toEqual(['F', 'F', 'E']);
    claim('elena/elena-jazz-harmony/drop-2', 'F stays, C goes to B, D stays, A goes to G; then F goes to E, B stays, D goes to C and G stays');
    const voices = ['xx3535', 'xx3433', 'xx2413'].map((f) => shapeMidi(f).map((n) => n % 12));
    expect(voices).toEqual([['F', 'C', 'D', 'A'], ['F', 'B', 'D', 'G'], ['E', 'B', 'C', 'G']].map((v) => v.map((n) => chroma(n))));
    const up5 = ['xx3535', 'xx3433', 'xx2413'].map((f) => pcSet(shapeMidi(f).map((n) => n + 5)));
    expect(up5).toEqual(['Gm7', 'C7', 'Fmaj7'].map((c) => pcSet(chordNotes(c))));
    claim('elena/elena-jazz-harmony/extended-voicings', 'their top voice moves E, E, D');
    expect(['x5355x', '3x345x', 'x3243x'].map((f) => Math.max(...shapeMidi(f)) % 12)).toEqual(['E', 'E', 'D'].map((n) => chroma(n)));
    claim('elena/elena-playing-the-changes/arpeggio-substitution', 'an Em7 arpeggio (E G B D) gives you the third, fifth, seventh and ninth');
    const above = (root: string, chord: string) => chordNotes(chord).map((n) => intervalBetween(root, n));
    expect(above('C', 'Em7')).toEqual(['M3', 'P5', 'M7', 'M2']);
    expect(above('D', 'Fmaj7')).toEqual(['m3', 'P5', 'm7', 'M2']);
    expect(above('G', 'Bm7b5')).toEqual(['M3', 'P5', 'm7', 'M2']);
    expect(above('A', 'Cmaj7')[3]).toBe('M2');
    claim('elena/elena-playing-the-changes/approach-notes-and-enclosures', 'complete the enclosure of F, the third of Dm7: G, E, F');
    expect([intervalBetween('E', 'F'), intervalBetween('F', 'G'), intervalBetween('D#', 'E'), intervalBetween('E', 'F'), intervalBetween('A#', 'B'), intervalBetween('B', 'C')]).toEqual(['m2', 'M2', 'm2', 'm2', 'm2', 'm2']);
    claim('elena/elena-voice-leading/reharmonisation', 'Gb7 for C7: C7 has E and Bb, Gb7 has the same two pitches spelled Fb and Bb');
    expect(tritoneSubstitute('C7')).toBe('Gb7');
    expect(tritoneSubstitute('G7')).toBe('Db7');
    expect(chordNotes('Gb7')).toEqual(expect.arrayContaining(['Fb', 'Bb']));
    expect(chordNotes('C7')).toEqual(expect.arrayContaining(['E', 'Bb']));
    expect(romanToChord('V7', 'G')).toBe('D7');
    claim('elena/elena-voice-leading/line-cliches', 'Am, AmMaj7, Am7, Am6, with the moving voice falling A, G#, G, F#');
    expect(['Am', 'AmMaj7', 'Am7', 'Am6'].map((c, i) => chordNotes(c).includes(['A', 'G#', 'G', 'F#'][i]))).toEqual([true, true, true, true]);
    claim('elena/elena-voice-leading/line-cliches', 'C, Caug, C6, C7, with the fifth climbing G, G#, A, Bb');
    expect(['C', 'Caug', 'C6', 'C7'].map((c, i) => chordNotes(c).includes(['G', 'G#', 'A', 'Bb'][i]))).toEqual([true, true, true, true]);
  });

  it('three notes per string, sweeps, tapping, harmonics and the alternate tunings', () => {
    claim('elena/elena-practice-and-precision/three-notes-per-string', 'stays within frets 3 to 8 and ends at string 1 fret 8 (C)');
    const p1 = scalePatterns('G', 'major', { system: '3nps' })[0];
    expect([p1.minFret, p1.maxFret]).toEqual([3, 8]);
    expect(`${p1.notes[0].string}:${p1.notes[0].fret}`).toBe('6:3');
    expect(`${p1.notes.at(-1)!.string}:${p1.notes.at(-1)!.fret}`).toBe('1:8');
    const sweep = claim('elena/elena-advanced-picking/sweep-picking-five', 'string 5 fret 12 (A), string 4 fret 14 (E)');
    expect(positions(sweep.explain).every((p) => chordPcs(parseChord('Am')!).includes(midiAt(p.string, p.fret) % 12))).toBe(true);
    claim('elena/elena-legato-and-tapping/tapping', 'F at frets 13, 5 and 8, G at frets 15, 7 and 10, E at frets 12, 4 and 7');
    for (const [c, frets] of [['Am', [12, 5, 8]], ['F', [13, 5, 8]], ['G', [15, 7, 10]], ['E', [12, 4, 7]]] as const) {
      expect(pcSet(frets.map((f) => midiAt(1, f)))).toBe(pcSet(chordNotes(c)));
    }
    claim('elena/elena-legato-and-tapping/harmonics', 'an octave, an octave and a fifth, and two octaves above the open string');
    expect(fretDistance(12)).toBeCloseTo(1 / 2, 6);
    expect(Math.abs(fretDistance(7) - 1 / 3)).toBeLessThan(0.002);
    expect(Math.abs(fretDistance(5) - 1 / 4)).toBeLessThan(0.002);
    expect(Math.round(12 * Math.log2(3))).toBe(19);
    claim('elena/elena-legato-and-tapping/slide-in-open-g', 'Open G is D G D G B D from string 6 to string 1');
    const openG = getTuning('open-g')!;
    expect(openG.notes.map((n) => n.replace(/\d/, '')).join(' ')).toBe('D G D G B D');
    claim('elena/elena-legato-and-tapping/slide-in-open-g', 'strings 6, 5 and 1 go down a whole step');
    expect(retuneSteps('open-g').filter((s) => s.semitones !== 0).map((s) => `${s.string}:${s.semitones}`).sort()).toEqual(['1:-2', '5:-2', '6:-2']);
    claim('elena/elena-legato-and-tapping/slide-in-open-g', 'G at fret 12, C at fret 5 and D at fret 7');
    for (const [fret, c] of [[12, 'G'], [5, 'C'], [7, 'D']] as const) expect(pcSet(openG.midi.map((m) => m + fret))).toBe(pcSet(chordNotes(c)));
    claim('elena/elena-composition-and-arranging/alternate-tunings', 'Retune strings 6, 2 and 1 down a whole step');
    expect(getTuning('dadgad')!.notes.map((n) => n.replace(/\d/, '')).join(' ')).toBe('D A D G A D');
    expect(retuneSteps('dadgad').filter((s) => s.semitones !== 0).map((s) => `${s.string}:${s.semitones}`).sort()).toEqual(['1:-2', '2:-2', '6:-2']);
    claim('elena/elena-reading-and-meter/reading-in-fifth-position', 'string 3 fret 3 (Bb) is now played at string 4 fret 8 (Bb)');
    expect(midiAt(3, 3)).toBe(midiAt(4, 8));
  });

  it('meters, groupings and the polyrhythm', () => {
    claim('elena/elena-reading-and-meter/odd-meters', '7/8 at 160 eighth notes per minute with accents on eighths 1, 3 and 5');
    expect([2, 2, 3].reduce<number[]>((acc, g) => [...acc, (acc.at(-1) ?? 1) + g], [1]).slice(0, 3)).toEqual([1, 3, 5]);
    claim('elena/elena-reading-and-meter/hemiola-and-polyrhythm', 'nice cup of tea');
    const three = [0, 2, 4];
    const two = [0, 3];
    expect([...new Set([...three, ...two])].sort()).toEqual([0, 2, 3, 4]);
  });
});
