/**
 * Every drill, every level, many seeds: the labelled answer is what the generated notes are
 * (checked against the theory engine, not against the generator's own bookkeeping), no question
 * offers two right answers, and every note is a note a guitar can play.
 */
import { describe, expect, it } from 'vitest';
import {
  chordPcs, chroma, degreeInKey, getChordType, identifyChords, interval, midiToNote, parseChord, progressionToChords, scaleMidi, scalePcs, semitones, splitProgression,
} from '@/core/theory';
import { DRILLS, LADDER, PATH } from './drills';
import { heardAs, heardTypes, relativePcs } from './drills/chords';
import { degreeSemitones } from './drills/degrees';
import { MEMORY_TUNES } from './drills/intervals';
import { PROGRESSIONS, progressionShape } from './drills/progressions';
import { scaleSteps } from './drills/scales';
import { makeRng, mixSeed } from './rng';
import { DEFAULT_SETTINGS } from './settings';
import { GUITAR_HIGH, GUITAR_LOW, planNotes, subjectEvents } from './sound';
import type { ChoiceQuestion, DrillDef, EarSettings, LevelDef, Question, SoundPlan } from './types';

const SEEDS = Number(process.env.EAR_SEEDS ?? 24);

const SETTINGS: EarSettings[] = [
  DEFAULT_SETTINGS,
  { ...DEFAULT_SETTINGS, root: 'fixed', fixedRoot: 0, chordStyle: 'arpeggio', keySetter: 'drone' },
  { ...DEFAULT_SETTINGS, root: 'fixed', fixedRoot: 6, progressionSound: 'band' },
  { ...DEFAULT_SETTINGS, root: 'fixed', fixedRoot: 11 },
];

/** Generate a question of a level with a forced answer. */
function make(level: LevelDef, answer: string, seed: number, settings: EarSettings, difficulty: number): Question {
  return level.make({ rng: makeRng(seed), answer, settings, difficulty, index: seed % 10, seed });
}

/** Every question the sweep produces, with how it was made. */
function* sweep(drill: DrillDef): Generator<{ level: LevelDef; q: Question; settings: EarSettings }> {
  for (const level of drill.levels) {
    for (let s = 0; s < SEEDS; s++) {
      const settings = SETTINGS[s % SETTINGS.length];
      const answer = level.pool[s % level.pool.length];
      const seed = mixSeed(drill.id, level.n, s);
      yield { level, q: make(level, answer, seed, settings, (s % 5) / 4), settings };
    }
  }
}

const notesOf = (plan: SoundPlan) => subjectEvents(plan).map((e) => e.midis);
const flat = (plan: SoundPlan) => planNotes(plan, 'subject');

/**
 * What a plan sounds as, worked out from its notes alone with the theory engine. Returns the
 * answer id, or null when the notes fit none (or several) of the options. This is the grader the
 * generator has to agree with.
 */
function heardAnswer(q: ChoiceQuestion, plan: SoundPlan): string | null {
  const pool = q.options.map((o) => o.id);
  const ev = subjectEvents(plan);
  const fits = (pred: (id: string) => boolean): string | null => {
    const hits = pool.filter(pred);
    return hits.length === 1 ? hits[0] : null;
  };
  switch (q.drill) {
    case 'pitch': {
      const n = flat(plan);
      if (n.length === 3) {
        const dir = (a: number, b: number) => (b > a ? 'up' : 'down');
        if (n[1] === n[0] || n[2] === n[1]) return null;
        return fits((id) => id === `${dir(n[0], n[1])}-${dir(n[1], n[2])}`);
      }
      const [a, b] = n;
      return fits((id) => (id === 'same' ? a === b : id === 'different' ? a !== b : id === 'higher' ? b > a : id === 'lower' ? b < a : false));
    }
    case 'tuning': {
      const [a, b] = ev;
      if (a.midis[0] !== b.midis[0] || (a.cents ?? 0) !== 0) return null;
      const c = b.cents ?? 0;
      return fits((id) => (id === 'in-tune' ? c === 0 : id === 'out' ? c !== 0 : id === 'flat' ? c < 0 : id === 'sharp' ? c > 0 : false));
    }
    case 'intervals-up':
    case 'intervals-down':
    case 'compound': {
      const [a, b] = flat(plan);
      const down = q.drill === 'intervals-down';
      if (down ? b >= a : b <= a) return null;
      // The theory engine names the distance between the two spelled notes.
      const dist = interval(intervalNameBetween(a, b)).semitones;
      return fits((id) => interval(id).semitones === dist);
    }
    case 'intervals-together': {
      if (ev.length !== 1 || ev[0].midis.length !== 2) return null;
      const [a, b] = [...ev[0].midis].sort((x, y) => x - y);
      const dist = interval(intervalNameBetween(a, b)).semitones;
      return fits((id) => interval(id).semitones === dist);
    }
    case 'chords': {
      const midis = ev.flatMap((e) => e.midis);
      const heard = heardTypes(midis, pool);
      return heard.length === 1 ? heard[0] : null;
    }
    case 'scales': {
      const n = flat(plan);
      return fits((id) => {
        const expected = scaleMidi(n[0], id, 1);
        return expected.length === n.length && expected.every((m, i) => m === n[i]);
      });
    }
    case 'degrees': {
      const n = flat(plan);
      const target = n[n.length - 1];
      const tonic = Number(q.truth.tonic);
      return fits((id) => (((target - tonic) % 12) + 12) % 12 === degreeSemitones(id));
    }
    case 'progressions': {
      const key = String(q.truth.key);
      // Group the strums into bars (two strums per chord) and read each chord's pitch classes.
      const bars: number[][] = [];
      for (let i = 0; i < ev.length; i += 2) bars.push(ev[i].midis);
      return fits((id) => {
        const chords = progressionToChords(PROGRESSIONS[id].romans, key);
        // Each bar: root in the bass, every note a chord tone, and the chord heard as its own type
        // (a guitar 7th chord may leave out its fifth).
        return chords.length === bars.length && chords.every((c, i) => {
          const ch = parseChord(c)!;
          return chroma(ch.root) === Math.min(...bars[i]) % 12 && bars[i].every((m) => chordPcs(ch).includes(m % 12)) && heardAs(bars[i], ch.type.id);
        });
      });
    }
    default:
      return null;
  }
}

function intervalNameBetween(a: number, b: number): string {
  // Spell both notes with sharps and let the engine measure; an augmented/diminished spelling still has the right size.
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const size = hi - lo;
  // `interval()` needs a name; derive one from the size through the engine's own table.
  const names = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8', 'm9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12', 'm13', 'M13', 'm14', 'M14', 'P15'];
  const name = names[size];
  expect(interval(name).semitones).toBe(midiToNoteSemis(lo, hi));
  return name;
}

/** Semitones between two MIDI notes measured through note names (an independent path through the engine). */
function midiToNoteSemis(lo: number, hi: number): number {
  const a = midiToNote(lo);
  const b = midiToNote(hi);
  return (Number(b.slice(-1)) - Number(a.slice(-1))) * 12 + chroma(b) - chroma(a);
}

const samePcs = (midis: readonly number[], pcs: readonly number[]) => {
  const a = [...new Set(midis.map((m) => m % 12))].sort((x, y) => x - y);
  const b = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((x, y) => x - y);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

describe('every drill, every level, many seeds', () => {
  for (const drill of LADDER) {
    it(`${drill.id}: the right answer is what sounds, alone, and every note is on the guitar`, () => {
      let count = 0;
      for (const { level, q } of sweep(drill)) {
        count++;
        const where = `${q.id} answer=${q.kind === 'choice' ? q.answer : q.target.join(' ')}`;
        // Range: every note of the question and of every option, context included.
        const plans = q.kind === 'choice' ? [q.plan, ...q.options.map((o) => o.plan)] : [q.plan];
        for (const p of plans) {
          for (const m of planNotes(p)) expect(m >= GUITAR_LOW && m <= GUITAR_HIGH, `${where}: ${m} out of range`).toBe(true);
          if (p.drone) expect(p.drone.midi >= GUITAR_LOW - 12 && p.drone.midi <= GUITAR_HIGH, `${where}: drone`).toBe(true);
        }
        expect(q.subject).toEqual(flat(q.plan));
        if (q.kind === 'choice') {
          expect(q.options.map((o) => o.id), where).toEqual(level.pool);
          expect(new Set(q.options.map((o) => o.label)).size, `${where}: two buttons with one label`).toBe(q.options.length);
          const right = q.options.find((o) => o.id === q.answer)!;
          // What plays is what is graded: the question's subject is the right option's subject.
          expect(notesOf(q.plan), where).toEqual(notesOf(right.plan));
          // The notes, read by the theory engine, give the labelled answer and no other...
          expect(heardAnswer(q, q.plan), where).toBe(q.answer);
          // ...and each option's own sound gives that option, so no two options can both be right.
          for (const o of q.options) expect(heardAnswer(q, o.plan), `${where}: option ${o.id}`).toBe(o.id);
        } else {
          const keys = new Map(q.keys.map((k) => [k.id, k.midi]));
          expect(new Set(q.keys.map((k) => k.midi)).size, `${where}: two row keys with one pitch`).toBe(q.keys.length);
          expect(q.subject, where).toEqual(q.target.map((id) => keys.get(id)));
          expect(q.target[0]).toBe('1');
          expect(q.subject[0]).toBe(q.firstNote);
        }
      }
      expect(count).toBe(drill.levels.length * SEEDS);
    });
  }
});

describe('pools offer one name per sound', () => {
  it('intervals: distinct sizes on every level, the tritone only once', () => {
    for (const id of ['intervals-up', 'intervals-down', 'intervals-together', 'compound'] as const) {
      for (const level of DRILLS[id].levels) {
        const sizes = level.pool.map((i) => semitones(i));
        expect(new Set(sizes).size, `${id} ${level.n}`).toBe(sizes.length);
        expect(level.pool.includes('d5')).toBe(false);
      }
    }
    expect(DRILLS['intervals-up'].levels.at(-1)!.pool).toHaveLength(12);
    expect(DRILLS['compound'].levels.at(-1)!.pool).toHaveLength(12);
  });

  it('scales: no level offers two names for the same notes from the tonic (never "Ionian or major")', () => {
    for (const level of DRILLS.scales.levels) {
      const sets = level.pool.map((id) => scalePcs('C', id).join(','));
      expect(new Set(sets).size, `level ${level.n}`).toBe(sets.length);
      for (const id of level.pool) expect(scaleSteps(id).slice(0, -1)).toEqual(scaleMidi(60, id, 1).slice(0, -1).map((m) => m - 60));
    }
  });

  it('chords: each type of a level has its own pitch set', () => {
    for (const level of DRILLS.chords.levels) {
      const sets = level.pool.map((id) => getChordType(id)!.semitones.map((s) => s % 12).sort((a, b) => a - b).join(','));
      expect(new Set(sets).size, `level ${level.n}`).toBe(sets.length);
    }
  });

  it('degrees: distinct distances from the tonic, and the minor level is the natural minor scale', () => {
    for (const level of DRILLS.degrees.levels) {
      const s = level.pool.map(degreeSemitones);
      expect(new Set(s).size).toBe(s.length);
    }
    const minor = DRILLS.degrees.levels.find((l) => l.n === 5)!;
    expect(minor.pool.map((d) => degreeInKey(midiToNote(57 + degreeSemitones(d), { prefer: 'flats' }).replace(/\d/, ''), 'A minor'))).toEqual(minor.pool);
  });

  it('progressions: within a level no two share a shape relative to their first chord, and all share a mode', () => {
    for (const level of DRILLS.progressions.levels) {
      const shapes = level.pool.map(progressionShape);
      expect(new Set(shapes).size, `level ${level.n}`).toBe(shapes.length);
      expect(new Set(level.pool.map((id) => PROGRESSIONS[id].mode)).size).toBe(1);
      const lengths = level.pool.map((id) => splitProgression(PROGRESSIONS[id].romans).length);
      expect(new Set(lengths).size, `level ${level.n}: chord count gives it away`).toBe(1);
    }
  });

  it('progressions: the theory engine reads the 12-bar forms as written', () => {
    expect(progressionToChords(PROGRESSIONS.blues.romans, 'A major')).toEqual(['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'A7']);
    expect(progressionToChords(PROGRESSIONS['two-five-one'].romans, 'C major')).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(progressionToChords(PROGRESSIONS.andalusian.romans, 'A minor')).toEqual(['Am', 'G', 'F', 'E']);
  });
});

describe('chord voicings', () => {
  it('are real guitar shapes, root in the bass, recognised by the theory engine as the labelled chord', () => {
    let shapes = 0;
    let fromLibrary = 0;
    for (const { q } of sweep(DRILLS.chords)) {
      if (q.kind !== 'choice') continue;
      const midis = q.subject;
      const bass = Math.min(...midis);
      expect(bass % 12).toBe(Number(q.truth.rootPc));
      if (q.truth.frets) fromLibrary++;
      shapes++;
      const type = getChordType(q.answer)!;
      const rel = relativePcs(midis);
      // Full chord, or the fifth (or a 13th chord's 9th) left out: the engine names it from its notes.
      const full = [...new Set(type.semitones.map((s) => s % 12))];
      expect(rel.every((x) => full.includes(x)), `${q.id}: a note outside ${type.id}`).toBe(true);
      const matches = identifyChords(midis, { limit: 8, allowPartial: true });
      const named = matches.some((m) => chroma(m.chord.root) === bass % 12 && m.chord.type.id.replace(/no5$/, '') === type.id);
      if (rel.length === full.length) expect(named, `${q.id}: engine names ${matches.map((m) => m.symbol).join(', ')}`).toBe(true);
    }
    expect(shapes).toBeGreaterThan(0);
    // Most questions use the guitar library's shapes, not the fallback close voicing.
    expect(fromLibrary / shapes).toBeGreaterThan(0.8);
  });
});

describe('memory aids', () => {
  it('name a tune only for intervals the drills use, never for harmonic intervals', () => {
    for (const dir of ['up', 'down'] as const) for (const id of Object.keys(MEMORY_TUNES[dir])) expect(interval(id).semitones).toBeGreaterThan(0);
    expect(DRILLS['intervals-together'].info('M3').aid).toBeUndefined();
    expect(DRILLS['intervals-up'].info('m3').aid).toBe('Greensleeves');
    expect(DRILLS['intervals-down'].info('M3').aid).toBe("Beethoven's Fifth Symphony");
  });
});

describe('the course', () => {
  it('visits every level once, each drill in level order, and starts with the first pitch level', () => {
    const total = LADDER.reduce((n, d) => n + d.levels.length, 0);
    expect(PATH).toHaveLength(total);
    expect(new Set(PATH.map((s) => `${s.drill}:${s.level}`)).size).toBe(total);
    for (const d of LADDER) {
      const order = PATH.filter((s) => s.drill === d.id).map((s) => s.level);
      expect(order).toEqual(d.levels.map((l) => l.n));
      expect(d.levels.map((l) => l.n)).toEqual(d.levels.map((_, i) => i + 1));
      expect(d.levels[0].pool.length, `${d.id} starts with two choices`).toBe(2);
    }
    expect(PATH[0]).toEqual({ drill: 'pitch', level: 1 });
    expect(LADDER[0].id).toBe('pitch');
    expect(LADDER.map((d) => d.id)).toContain('compound');
  });

  it('every drill reaches the full set of choices', () => {
    expect(DRILLS.chords.levels.at(-1)!.pool.length).toBe(12);
    expect(DRILLS.scales.levels.at(-1)!.pool.length).toBe(12);
    expect(DRILLS.degrees.levels.find((l) => l.pool.length === 12)).toBeTruthy();
    expect(DRILLS.tuning.levels.at(-1)!.pool).toEqual(['flat', 'in-tune', 'sharp']);
  });
});

describe('sound choices', () => {
  it('a fixed root keeps the first note on that pitch class', () => {
    const settings = { ...DEFAULT_SETTINGS, root: 'fixed' as const, fixedRoot: 7 };
    for (const id of ['intervals-up', 'intervals-down', 'pitch', 'tuning', 'scales'] as const) {
      const level = DRILLS[id].levels[1];
      for (let s = 0; s < 10; s++) {
        const q = make(level, level.pool[s % level.pool.length], s + 1, settings, 0.5);
        expect(q.firstNote! % 12, `${id}`).toBe(7);
      }
    }
  });

  it('the same seed builds the same question', () => {
    const level = DRILLS.chords.levels[6];
    const a = make(level, 'm7b5', 99, DEFAULT_SETTINGS, 0.5);
    const b = make(level, 'm7b5', 99, DEFAULT_SETTINGS, 0.5);
    expect(a).toEqual(b);
  });

  it('chords can be arpeggiated, one string at a time, low to high', () => {
    const level = DRILLS.chords.levels[0];
    const q = make(level, 'minor', 5, { ...DEFAULT_SETTINGS, chordStyle: 'arpeggio' }, 0.5);
    const ev = subjectEvents(q.plan);
    expect(ev.length).toBeGreaterThan(2);
    expect(ev.every((e) => e.midis.length === 1)).toBe(true);
  });
});
