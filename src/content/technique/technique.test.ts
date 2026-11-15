import { describe, expect, it } from 'vitest';
import plan from '@/content/plan/repertoire.json';
import { voicingProblem, scalePatterns } from '@/core/guitar';
import { flattenSong, parseSixTab, practiceTargets, validateSong, type Song } from '@/core/song';
import { chroma, scalePcs } from '@/core/theory';
import {
  HANDS,
  MAJOR_KEYS,
  MELODIC_MINOR_KEYS,
  SKILL_GROUPS,
  TECHNIQUE_EXERCISES,
  chordChangeSkillId,
  getExercise,
  hasLadder,
  ladderRungs,
  partSixTab,
  partSong,
  songBpm,
  type ExercisePart,
  type TechniqueExercise,
} from './index';
import { permutationsStartingWith } from './generate';

interface PlanTechnique {
  id: string;
  title: string;
  hand: string;
  level: number;
  pattern: string;
  tempo: { start: number; goal: number; step: number };
  watchFor: string[];
  teaches: string[];
}
const PLAN = (plan as { technique: PlanTechnique[] }).technique;
const OPEN = [0, 64, 59, 55, 50, 45, 40];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every part of every exercise with its song at the start tempo. */
const PARTS: Array<{ e: TechniqueExercise; p: ExercisePart; song: Song }> = TECHNIQUE_EXERCISES.flatMap((e) =>
  e.parts.flatMap((p) => {
    const song = parseSixTab(partSixTab(e, p, e.tempo.start)).song;
    return song ? [{ e, p, song }] : [];
  }),
);

/** All the notes of a song's first track as [string, fret, midi, note]. */
function notesOf(song: Song) {
  return song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
}

/** Free text of an exercise, so claims anywhere in it get checked. */
function texts(e: TechniqueExercise): string[] {
  return [e.summary, ...e.steps, e.feel, ...e.mistakes.map((m) => m.fix), ...(e.checklist ?? []), ...(e.routine ?? []).map((r) => r.text), ...e.parts.map((p) => p.note ?? ''), ...(e.pairs ?? []).map((p) => p.tip)];
}

const ascii = (s: string): string => s.replace(/♯/g, '#').replace(/♭/g, 'b');

describe('technique content: the plan, written out', () => {
  it('has exactly one exercise per plan entry, with the plan’s ids, titles, hands, levels, ladders and tags', () => {
    expect(TECHNIQUE_EXERCISES.length).toBe(PLAN.length);
    expect(new Set(TECHNIQUE_EXERCISES.map((e) => e.id)).size).toBe(TECHNIQUE_EXERCISES.length);
    for (const t of PLAN) {
      const e = getExercise(t.id);
      expect(e, t.id).not.toBeNull();
      if (!e) continue;
      expect(e.title, t.id).toBe(t.title);
      expect(e.hand, t.id).toBe(t.hand);
      expect(e.level, t.id).toBe(t.level);
      expect(e.tempo, t.id).toEqual({ start: t.tempo.start, step: t.tempo.step, goal: t.tempo.goal });
      expect(e.teaches, t.id).toEqual(t.teaches);
      expect(e.mistakes.map((m) => m.watch), `${t.id}: watch-for list`).toEqual(t.watchFor);
    }
  });

  it('finds exercises with or without the tech- prefix', () => {
    expect(getExercise('spider')?.id).toBe('tech-spider');
    expect(getExercise('tech-spider')?.id).toBe('tech-spider');
    expect(getExercise('nope')).toBeNull();
  });

  it('gives every exercise its copy: summary, steps, feel, a fix for every mistake, a known skill and hand', () => {
    const skills = new Set(SKILL_GROUPS.map((s) => s.id));
    const hands = new Set(HANDS.map((h) => h.id));
    for (const e of TECHNIQUE_EXERCISES) {
      expect(skills.has(e.skill), e.id).toBe(true);
      expect(hands.has(e.hand), e.id).toBe(true);
      expect(e.summary.length, e.id).toBeGreaterThan(20);
      expect(e.steps.length, e.id).toBeGreaterThan(0);
      expect(e.feel.length, e.id).toBeGreaterThan(20);
      for (const m of e.mistakes) expect(m.fix.length, `${e.id}: ${m.watch}`).toBeGreaterThan(15);
      for (const t of texts(e)) {
        expect(t, e.id).not.toMatch(/!/);
        expect(t, e.id).not.toMatch(/\?/);
      }
      if (e.strain) {
        expect(e.strain.text.length, e.id).toBeGreaterThan(20);
        expect(e.strain.maxMinutes, e.id).toBeGreaterThan(0);
      }
    }
  });

  it('marks the exercises that can strain the hand', () => {
    const strained = TECHNIQUE_EXERCISES.filter((e) => e.strain).map((e) => e.id);
    for (const id of ['tech-stretch', 'tech-barre-strength', 'tech-bend-whole-step', 'tech-bend-minor-third', 'tech-tremolo-picking', 'tech-changes-barre', 'tech-speed-bursts']) {
      expect(strained, id).toContain(id);
    }
  });

  it('climbs every ladder to its goal in whole steps', () => {
    for (const e of TECHNIQUE_EXERCISES) {
      const rungs = ladderRungs(e);
      expect(rungs[0], e.id).toBe(e.tempo.start);
      expect(rungs[rungs.length - 1], e.id).toBe(e.tempo.goal);
      expect(hasLadder(e), e.id).toBe(e.tempo.step > 0);
    }
  });

  it('gives every mode what it needs', () => {
    for (const e of TECHNIQUE_EXERCISES) {
      expect(e.parts.length, e.id).toBeGreaterThan(0);
      const ids = e.parts.map((p) => p.id);
      expect(new Set(ids).size, e.id).toBe(ids.length);
      for (const id of ids) expect(id, e.id).toMatch(SLUG);
      if (e.mode === 'changes') expect(e.pairs?.length, e.id).toBeGreaterThan(0);
      if (e.mode === 'guide') expect(e.checklist?.length, e.id).toBeGreaterThan(0);
      if (e.mode === 'routine') {
        expect(e.routine?.length, e.id).toBeGreaterThan(0);
        for (const step of e.routine ?? []) {
          if (step.part !== undefined) expect(e.parts[step.part], `${e.id}: ${step.id}`).toBeDefined();
          if (step.link) expect(getExercise(step.link), `${e.id}: ${step.link}`).not.toBeNull();
          expect(step.seconds, step.id).toBeGreaterThan(0);
        }
      }
    }
    expect(getExercise('tech-warm-up')?.routine?.reduce((s, r) => s + r.seconds, 0)).toBe(300);
    expect(getExercise('tech-cool-down')?.routine?.[0].seconds).toBe(120);
  });
});

describe('technique content: every part is playable', () => {
  it('parses without errors or warnings at the start and the goal tempo', () => {
    let parts = 0;
    for (const e of TECHNIQUE_EXERCISES) {
      for (const p of e.parts) {
        for (const bpm of [e.tempo.start, e.tempo.goal]) {
          const r = parseSixTab(partSixTab(e, p, bpm));
          expect(r.errors, `${e.id}/${p.id}`).toEqual([]);
          expect(r.song, `${e.id}/${p.id}`).not.toBeNull();
          const issues = validateSong(r.song!, { notation: false });
          expect(issues, `${e.id}/${p.id}`).toEqual([]);
          expect(r.song!.tempo[0].bpm).toBe(songBpm(p, bpm));
        }
        parts++;
      }
    }
    expect(parts).toBeGreaterThan(100);
  });

  it('keeps every note on a real fret of a standard-tuned 22-fret neck', () => {
    for (const { e, p, song } of PARTS) {
      for (const n of notesOf(song)) {
        expect(n.string, `${e.id}/${p.id}`).toBeGreaterThanOrEqual(1);
        expect(n.string, `${e.id}/${p.id}`).toBeLessThanOrEqual(6);
        if (!n.dead) expect(n.fret, `${e.id}/${p.id}`).toBeLessThanOrEqual(22);
        if (!n.dead) expect(n.midi, `${e.id}/${p.id}`).toBe(OPEN[n.string] + (p.capo ?? 0) + n.fret);
      }
    }
  });

  it('gives a note check enough single notes to judge', () => {
    for (const { e, p, song } of PARTS) {
      if (p.check.kind !== 'notes') continue;
      const targets = practiceTargets(flattenSong(song), song.tracks[0].id).filter((t) => t.midis.length === 1);
      expect(targets.length, `${e.id}/${p.id}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('puts the bend or vibrato the microphone checks into the tab, with its target played first', () => {
    for (const { e, p, song } of PARTS) {
      const c = p.check;
      if (c.kind === 'bend' || c.kind === 'prebend') {
        const bent = notesOf(song).find((n) => n.string === c.string && n.fret === c.fret && n.bend);
        expect(bent, `${e.id}/${p.id}`).toBeDefined();
        expect(bent!.bend!.amount, `${e.id}/${p.id}`).toBe(c.semitones);
        if (c.kind === 'prebend') expect(bent!.bend!.pre, e.id).toBe(true);
        // The plan plays the target fret first, except for the unison bend (the target is the other string).
        if (c.kind === 'bend' && !c.alone) {
          const first = notesOf(song)[0];
          expect(first.midi, `${e.id}/${p.id}: target first`).toBe(OPEN[c.string] + c.fret + c.semitones);
        }
      }
      if (c.kind === 'vibrato') {
        const held = notesOf(song).find((n) => n.string === c.string && n.fret === c.fret && n.vibrato);
        expect(held, `${e.id}/${p.id}`).toBeDefined();
      }
    }
  });

  it('builds every chord shape it names, in the copy, the tab and the chord pairs', () => {
    let checked = 0;
    for (const e of TECHNIQUE_EXERCISES) {
      for (const text of texts(e)) {
        for (const m of ascii(text).matchAll(/(?<![\w#])([A-G](?:#|b)?[a-z0-9#]*) \(((?:[x0-9]{6})|(?:[x0-9]{1,2}-){5}[x0-9]{1,2})\)/g)) {
          expect(voicingProblem(m[1], m[2]), `${e.id}: ${m[0]}`).toBeNull();
          checked++;
        }
      }
      for (const p of e.parts) {
        for (const m of p.tab.matchAll(/"([^"=]+)=([^"]+)"/g)) {
          expect(voicingProblem(m[1], m[2], { capo: p.capo ?? 0 }), `${e.id}/${p.id}: ${m[0]}`).toBeNull();
          checked++;
        }
      }
      for (const pair of e.pairs ?? []) {
        expect(voicingProblem(pair.a.symbol, pair.a.shape), pair.id).toBeNull();
        expect(voicingProblem(pair.b.symbol, pair.b.shape), pair.id).toBeNull();
        expect(pair.id).toMatch(SLUG);
        checked += 2;
      }
    }
    expect(checked).toBeGreaterThan(60);
    const pairIds = TECHNIQUE_EXERCISES.flatMap((e) => (e.pairs ?? []).map(chordChangeSkillId));
    expect(new Set(pairIds).size).toBe(pairIds.length);
  });

  it('names the right note for every "string N fret M (X)" in its copy', () => {
    let checked = 0;
    for (const e of TECHNIQUE_EXERCISES) {
      for (const text of texts(e)) {
        for (const m of ascii(text).matchAll(/string ([1-6]) fret (\d{1,2}) \(([A-G](?:#|b)?)\)/g)) {
          expect((OPEN[Number(m[1])] + Number(m[2])) % 12, `${e.id}: ${m[0]}`).toBe(chroma(m[3]));
          checked++;
        }
        for (const m of ascii(text).matchAll(/open string ([1-6]) \(([A-G](?:#|b)?)\)/g)) {
          expect(OPEN[Number(m[1])] % 12, `${e.id}: ${m[0]}`).toBe(chroma(m[2]));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});

describe('technique content: generated patterns match the plan and the engines', () => {
  const pitches = (song: Song): number[] => notesOf(song).filter((n) => !n.tie && !n.dead).map((n) => n.midi);
  const frets = (song: Song): string[] => notesOf(song).map((n) => `${n.string}:${n.fret}`);

  it('plays the spider as frets 5-8 up every string and 8-7-6-5 back', () => {
    const e = getExercise('tech-spider')!;
    const f = frets(partSong(e, e.parts[0], 60));
    expect(f.length).toBe(48);
    expect(f.slice(0, 8)).toEqual(['6:5', '6:6', '6:7', '6:8', '5:5', '5:6', '5:7', '5:8']);
    expect(f.slice(24, 28)).toEqual(['1:8', '1:7', '1:6', '1:5']);
    expect(f.slice(44)).toEqual(['6:8', '6:7', '6:6', '6:5']);
  });

  it('covers all 24 finger orders across the three permutation exercises', () => {
    const orders = new Set<string>();
    for (const id of ['tech-permutations-1', 'tech-permutations-2', 'tech-permutations-3-4']) {
      const e = getExercise(id)!;
      for (const p of e.parts.filter((x) => x.id.endsWith('one-string'))) {
        const f = notesOf(partSong(e, p, 60)).map((n) => n.fret - 4);
        for (let i = 0; i < f.length; i += 16) orders.add(f.slice(i, i + 4).join('-'));
      }
    }
    const all = [1, 2, 3, 4].flatMap((f) => permutationsStartingWith(f).map((o) => o.join('-')));
    expect(all.length).toBe(24);
    expect([...orders].sort()).toEqual([...all].sort());
  });

  it('keeps the G major exercises in G major', () => {
    const g = new Set(scalePcs('G', 'major'));
    for (const id of ['tech-alternate-scale-g', 'tech-economy-picking', 'tech-legato-3nps']) {
      const e = getExercise(id)!;
      for (const p of e.parts) for (const m of pitches(partSong(e, p, 60))) expect(g.has(m % 12), `${id}: ${m}`).toBe(true);
    }
    const scale = getExercise('tech-alternate-scale-g')!;
    const first = pitches(partSong(scale, scale.parts[0], 60));
    expect(first[0]).toBe(43);
    expect(Math.max(...first)).toBe(67);
  });

  it('keeps the pentatonic exercises on A minor pentatonic box 1 as the guitar engine has it', () => {
    const box = scalePatterns('A', 'minor-pentatonic')[0].notes.map((n) => `${n.string}:${n.fret}`);
    for (const [id, part] of [['tech-string-skipping', 'pentatonic'], ['tech-picking-hand-mute', 'whole-box'], ['tech-picking-hand-mute', 'treble']]) {
      const e = getExercise(id)!;
      const p = e.parts.find((x) => x.id === part)!;
      for (const f of frets(partSong(e, p, 60))) expect(box, `${id}/${part}: ${f}`).toContain(f);
    }
  });

  it('taps the right triads', () => {
    const e = getExercise('tech-tapping')!;
    const song = partSong(e, e.parts[0], 60);
    const triads = [['E', 'A', 'C'], ['F', 'A', 'C'], ['G', 'B', 'D'], ['E', 'G#', 'B']].map((t) => new Set(t.map(chroma)));
    song.tracks[0].measures.forEach((m, bar) => {
      for (const n of m.beats.flatMap((b) => b.notes)) expect(triads[bar].has(n.midi % 12), `bar ${bar + 1}: ${n.midi}`).toBe(true);
    });
  });

  it('writes every key of the all-keys exercise in its own scale, root to root', () => {
    const e = getExercise('tech-all-keys-scales')!;
    expect(e.parts.length).toBe(48);
    for (const [tonics, scale] of [[MAJOR_KEYS, 'major'], [MELODIC_MINOR_KEYS, 'melodic-minor']] as const) {
      for (const tonic of tonics) {
        const pcs = new Set(scalePcs(tonic, scale));
        const plain = e.parts.find((p) => p.name.startsWith(tonic.replace('#', '♯').replace(/^([A-G])b/, '$1♭') + ' ') && !p.id.endsWith('thirds') && p.id.endsWith(scale))!;
        expect(plain, `${tonic} ${scale}`).toBeDefined();
        const ps = pitches(partSong(e, plain, 80));
        for (const m of ps) expect(pcs.has(m % 12), `${tonic} ${scale}: ${m}`).toBe(true);
        expect(ps[0] % 12, `${tonic} ${scale} starts on the root`).toBe(chroma(tonic));
        expect(ps[ps.length - 1], `${tonic} ${scale} ends on the low root`).toBe(ps[0]);
        expect(Math.max(...ps) - ps[0], `${tonic} ${scale} spans two octaves`).toBe(24);
      }
    }
  });

  it('strums the one-minute changes on every beat, alternating the pair', () => {
    for (const id of ['tech-changes-pairs-1', 'tech-changes-pairs-2', 'tech-changes-pairs-3']) {
      const e = getExercise(id)!;
      expect(e.parts.length).toBe(e.pairs!.length);
      for (const p of e.parts) {
        const song = partSong(e, p, 60);
        expect(song.chords.length, p.id).toBe(8);
      }
    }
    expect(getExercise('tech-changes-pairs-1')!.pairs!.map((p) => p.id)).toEqual(['em-g', 'a-d', 'd-a7', 'a-e7', 'em-d']);
  });
});
