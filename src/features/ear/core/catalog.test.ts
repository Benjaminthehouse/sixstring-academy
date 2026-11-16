/**
 * The catalog by ear (`#ear--progression--<id>`): every progression of `@/content/progressions`
 * that has look-alikes gets a round, and in it what plays is the progression named.
 */
import { describe, expect, it } from 'vitest';
import { PROGRESSIONS as CATALOG, getProgression } from '@/content/progressions';
import { chordPcs, chroma, parseChord } from '@/core/theory';
import { emptyRecord, recordAnswer, weakSpots } from './adapt';
import { DRILLS } from './drills';
import { CATALOG_RECORD_ID, catalogInfo, catalogRound, catalogShape, lookAlikes } from './drills/catalog';
import { drillSkillId, recordSkillId } from './progress';
import { makeRng, mixSeed } from './rng';
import { DEFAULT_SETTINGS } from './settings';
import { GUITAR_HIGH, GUITAR_LOW, planNotes, subjectEvents } from './sound';

describe('a progression of the catalog by ear', () => {
  it('nearly every progression gets a round against look-alikes that sound different', () => {
    let rounds = 0;
    for (const p of CATALOG) {
      const found = catalogRound(p.id);
      if (!found) {
        expect(lookAlikes(p), p.id).toEqual([]);
        continue;
      }
      rounds++;
      const { level } = found;
      expect(level.pool[0]).toBe(p.id);
      expect(level.pool.length).toBeGreaterThanOrEqual(2);
      expect(level.special).toEqual({ key: `progression:${p.id}`, skillId: `ear:progression:${p.id}`, params: ['progression', p.id], recordId: CATALOG_RECORD_ID });
      const shapes = level.pool.map((id) => catalogShape(getProgression(id)!, catalogShape(p).split('|').length));
      expect(new Set(shapes).size, p.id).toBe(shapes.length);
      for (const id of level.pool.slice(1)) {
        const o = getProgression(id)!;
        expect(o.tonality).toBe(p.tonality);
        expect(o.feel.meter).toBe(p.feel.meter);
      }
    }
    expect(rounds / CATALOG.length).toBeGreaterThan(0.85);
  });

  it('plays the progression named, bar by bar, on guitar shapes rooted on each chord', () => {
    for (const id of ['pop-axis', 'blues-quick-change', 'flamenco-andalusian', 'jazz-ii-v-i', 'rock-i-bvii-iv', 'classical-canon-bass']) {
      const found = catalogRound(id);
      if (!found) continue;
      const { level } = found;
      for (let s = 0; s < 6; s++) {
        const answer = level.pool[s % level.pool.length];
        const seed = mixSeed('catalog', id, s);
        const settings = s % 2 ? { ...DEFAULT_SETTINGS, root: 'fixed' as const, fixedRoot: s } : DEFAULT_SETTINGS;
        const q = level.make({ rng: makeRng(seed), answer, settings, difficulty: 0.5, index: s, seed });
        if (q.kind !== 'choice') throw new Error('choice expected');
        expect(q.answer).toBe(answer);
        const symbols = q.truth.chords as string[];
        // Every strum is a chord of the progression, in order, its root (or slash bass) at the bottom.
        const strums = subjectEvents(q.plan);
        let k = 0;
        for (const e of strums) {
          while (k < symbols.length) {
            const ch = parseChord(symbols[k].split('/')[0])!;
            if (e.midis.every((m) => chordPcs(ch).includes(m % 12)) && Math.min(...e.midis) % 12 === chroma(ch.root)) break;
            k++;
          }
          expect(k, `${id} ${answer}: a strum that is no chord of the progression`).toBeLessThan(symbols.length);
        }
        for (const o of q.options) for (const m of planNotes(o.plan)) expect(m >= GUITAR_LOW && m <= GUITAR_HIGH).toBe(true);
        expect(q.plan.band?.split?.length).toBe(q.plan.band?.bars.length);
      }
    }
  });

  it('an unknown id has no round', () => {
    expect(catalogRound('no-such-progression')).toBeNull();
  });

  it('labels each choice by its numerals once, with what the name adds underneath (found in review)', () => {
    // "I–V–vi–IV" used to carry "I–V–vi–IV (the axis progression)" under it.
    expect(catalogInfo('pop-axis')).toMatchObject({ label: 'I–V–vi–IV', detail: 'the axis progression', name: 'I–V–vi–IV (the axis progression)' });
    let rounds = 0;
    for (const p of CATALOG) {
      const found = catalogRound(p.id);
      if (!found) continue;
      rounds++;
      const shown = found.level.pool.map((id) => catalogInfo(id)).map((o) => `${o.label} | ${o.detail ?? ''}`);
      // Every choice can be told apart on screen, and no detail repeats its label.
      expect(new Set(shown).size, `${p.id}: ${shown.join(' / ')}`).toBe(shown.length);
      for (const id of found.level.pool) {
        const o = catalogInfo(id);
        if (o.detail) expect(o.detail.startsWith(o.label), id).toBe(false);
      }
    }
    expect(rounds).toBeGreaterThan(100);
  });

  it('keeps its answers in a record of its own, not in the progressions drill (found in review)', () => {
    // Catalog answers ("pop-axis") used to be folded into the progressions drill's record, and the
    // drill screen and the hub then said "you often hear pop-vi-iv-i-v as pop-axis".
    const found = catalogRound('pop-axis')!;
    expect(found.drill.id).toBe('progressions');
    expect(recordSkillId(found.drill, found.level)).toBe(CATALOG_RECORD_ID);
    expect(recordSkillId(found.drill, found.level)).not.toBe(drillSkillId('progressions'));
    expect(recordSkillId(DRILLS.progressions, DRILLS.progressions.levels[0])).toBe(drillSkillId('progressions'));
    // A record that already holds catalog confusions does not show them as the drill's weak spots,
    // while the catalog round itself names them in words.
    let record = emptyRecord();
    for (let i = 0; i < 3; i++) record = recordAnswer(record, found.level.pool[1], 'pop-axis');
    expect(weakSpots(DRILLS.progressions, record)).toEqual([]);
    const own = weakSpots(found.drill, record, { pool: found.level.pool });
    expect(own).toHaveLength(1);
    expect(own[0].sentence).not.toMatch(/pop-/);
  });
});
