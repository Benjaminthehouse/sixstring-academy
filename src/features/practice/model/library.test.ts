import { describe, expect, it } from 'vitest';
import { ROUTE_BY_NAME } from '@/app/routes';
import { technique as TECHNIQUE_PLAN } from '@/content/plan/repertoire.json';
import { SONG_ENTRIES } from '@/content/songs';
import { TECHNIQUE_EXERCISES, getExercise, techniqueSkillId } from '@/content/technique';
import { outlineUnits } from '@/content/theory';
import { LEVEL_BANDS as TECHNIQUE_BANDS } from '@/features/technique/model/recommend';
import { parseLearnParams } from '@/features/learn/model/route';
import { FOCUS_AREAS, isArea } from './areas';
import { CONTENT, poolFor } from './content';
import { LEVEL_BANDS, LIBRARY_BY_ID, NOT_A_BLOCK, PRACTICE_LIBRARY, levelsForDifficulty, songArea } from './library';
import { buildPlan, type PlannerInput } from './planner';
import { isItemId, parseRoutine } from './routine-data';

const byPrefix = (prefix: string) => PRACTICE_LIBRARY.filter((c) => c.id.startsWith(prefix));

describe('the practice library', () => {
  it('has unique ids that a saved routine can hold, real text and a screen that exists', () => {
    expect(new Set(PRACTICE_LIBRARY.map((c) => c.id)).size).toBe(PRACTICE_LIBRARY.length);
    for (const c of PRACTICE_LIBRARY) {
      expect(isItemId(c.id), c.id).toBe(true);
      expect(CONTENT.some((h) => h.id === c.id), `${c.id} clashes with the hand-written pool`).toBe(false);
      expect(isArea(c.area), c.id).toBe(true);
      expect(c.title.length, c.id).toBeGreaterThan(3);
      expect(c.goal.length, c.id).toBeGreaterThan(20);
      expect(c.goal.includes('!'), c.id).toBe(false);
      expect(c.levels.length, c.id).toBeGreaterThan(0);
      expect(c.target && ROUTE_BY_NAME[c.target.route], `${c.id} -> ${c.target?.route}`).toBeTruthy();
      expect(c.target!.params.every((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p)), c.id).toBe(true);
      // An exercise saved in a routine reads back as the same exercise.
      expect(parseRoutine({ id: 'r', name: 'R', blocks: [{ area: c.area, minutes: 3, itemId: c.id }] })?.blocks[0].itemId).toBe(c.id);
    }
  });

  it('uses the Technique screen’s level bands', () => {
    expect(LEVEL_BANDS).toEqual(TECHNIQUE_BANDS);
    expect(levelsForDifficulty(1)).toEqual(['beginner']);
    expect(levelsForDifficulty(3)).toEqual(['beginner', 'intermediate']);
    expect(levelsForDifficulty(6)).toEqual(['intermediate', 'expert']);
    expect(levelsForDifficulty(10)).toEqual(['expert']);
  });

  it('holds every timed technique exercise, opened at its own address, and no guide or routine', () => {
    // The plan's list is the Technique content's list (its own test checks the fields match).
    expect(TECHNIQUE_PLAN.map((e) => e.id).sort()).toEqual(TECHNIQUE_EXERCISES.map((e) => e.id).sort());
    const notTimed = TECHNIQUE_EXERCISES.filter((e) => e.mode === 'guide' || e.mode === 'routine').map((e) => e.id);
    expect([...NOT_A_BLOCK].sort()).toEqual(notTimed.sort());
    const items = byPrefix('technique:');
    expect(items.length).toBe(TECHNIQUE_EXERCISES.length - NOT_A_BLOCK.size);
    for (const item of items) {
      const id = item.target!.params[0];
      const e = getExercise(id)!;
      expect(e, id).toBeTruthy();
      expect(item.target!.route).toBe('technique');
      expect(item.title).toBe(e.title);
      expect(item.levels).toEqual(levelsForDifficulty(e.level));
      if (e.mode === 'changes') expect(item.skillId, id).toBeUndefined();
      else expect(item.skillId).toBe(techniqueSkillId(e.id));
      // The ladder sentence states the exercise's own numbers.
      if (e.tempo.step > 0 && e.tempo.goal > e.tempo.start) {
        expect(item.goal, id).toContain(`Start at ${e.tempo.start} BPM`);
        expect(item.goal, id).toContain(`up ${e.tempo.step}`);
        expect(item.goal, id).toContain(`goal is ${e.tempo.goal}`);
      }
    }
    expect(LIBRARY_BY_ID['technique:tech-changes-pairs-1'].area).toBe('chords');
    expect(LIBRARY_BY_ID['technique:tech-strum-constant'].area).toBe('rhythm');
    expect(LIBRARY_BY_ID['technique:tech-spider'].area).toBe('warmup');
    expect(LIBRARY_BY_ID['technique:tech-bend-whole-step'].area).toBe('technique');
  });

  it('holds every built-in song and study, played at its own address', () => {
    const items = byPrefix('song:');
    expect(items.map((c) => c.id).sort()).toEqual(SONG_ENTRIES.map((s) => `song:${s.id}`).sort());
    for (const s of SONG_ENTRIES) {
      const item = LIBRARY_BY_ID[`song:${s.id}`];
      expect(item.target).toMatchObject({ route: 'play', params: [s.id] });
      expect(item.skillId).toBe(`song:${s.id}`);
      expect(item.levels).toEqual(levelsForDifficulty(s.level));
      expect(item.title).toContain(s.title);
      expect(s.about.startsWith(item.goal.replace(/…$/, ''))).toBe(true);
    }
    expect(songArea('st-change-g-c-c-g7')).toBe('chords');
    expect(songArea('st-pent-box-1')).toBe('scales');
    expect(songArea('st-lick-bend')).toBe('technique');
    expect(songArea('greensleeves-melody')).toBe('repertoire');
  });

  it('holds a drill for every Theory Path unit, at an address the Learn screen reads as one', () => {
    const items = byPrefix('theory-unit:');
    expect(items.length).toBe(outlineUnits().length);
    for (const { unit } of outlineUnits()) {
      const item = LIBRARY_BY_ID[`theory-unit:${unit.id}`];
      expect(item.unit).toBe(unit.id);
      expect(item.target!.route).toBe('learn');
      expect(parseLearnParams(item.target!.params)).toEqual({ kind: 'practice', unitId: unit.id });
    }
  });

  it('offers something from the library in every focus area for every level', () => {
    for (const level of ['beginner', 'intermediate', 'expert'] as const) {
      for (const area of FOCUS_AREAS) {
        // The library has no ear exercises, unit drills wait for a studied unit, and every scale
        // study is above beginner level (the hand-written pool covers a beginner's scales).
        if (area === 'ear' || area === 'theory' || (area === 'scales' && level === 'beginner')) continue;
        expect(poolFor(area, level, Infinity, PRACTICE_LIBRARY).some((c) => LIBRARY_BY_ID[c.id]), `${level} ${area}`).toBe(true);
      }
    }
  });
});

describe('planning with the library', () => {
  const base: PlannerInput = { level: 'beginner', teacher: 'mia', minutes: 15, day: '2026-11-16', practiceDays: 3, library: PRACTICE_LIBRARY };

  it('draws exercises, songs and studies from the app’s content, opened at their own address', () => {
    let fromLibrary = 0;
    let blocks = 0;
    for (let d = 0; d < 14; d++) {
      const plan = buildPlan({ ...base, day: `2026-11-${String(10 + d).padStart(2, '0')}` });
      for (const b of plan) {
        blocks++;
        if (b.itemId && LIBRARY_BY_ID[b.itemId]) {
          fromLibrary++;
          expect(b.target?.params.length, b.itemId).toBeGreaterThan(0);
        }
      }
    }
    expect(fromLibrary / blocks).toBeGreaterThan(0.3);
  });

  it('keeps a new beginner on first-week material', () => {
    const pool = (['warmup', ...FOCUS_AREAS] as const).flatMap((a) => poolFor(a, 'beginner', 0, PRACTICE_LIBRARY));
    for (const c of pool) {
      const level = c.id.startsWith('song:') ? SONG_ENTRIES.find((s) => `song:${s.id}` === c.id)!.level : c.id.startsWith('technique:') ? getExercise(c.target!.params[0])!.level : 1;
      expect(level, c.id).toBe(1);
    }
  });

  it('offers a unit’s drill only once a lesson of that unit is done', () => {
    const drills = (studiedUnits: string[]) => poolFor('theory', 'beginner', Infinity, PRACTICE_LIBRARY, studiedUnits).filter((c) => c.unit);
    expect(drills([])).toEqual([]);
    const first = outlineUnits()[0].unit.id;
    expect(drills([first]).map((c) => c.unit)).toEqual([first]);
  });

  it('gives the same plan for the same input', () => {
    expect(buildPlan(base).map((b) => b.itemId)).toEqual(buildPlan(base).map((b) => b.itemId));
  });
});
