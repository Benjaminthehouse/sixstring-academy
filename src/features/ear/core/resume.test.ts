import { describe, expect, it } from 'vitest';
import { emptyRecord, recordAnswer } from './adapt';
import { DRILLS } from './drills';
import { RESUME_HOURS, readSnapshot, restoreRound, roundKey, snapshotOf } from './resume';
import { answerQuestion, createRound, nextQuestion, roundDone, scoreRound, type Round } from './round';
import { DEFAULT_SETTINGS } from './settings';
import type { DrillDef, LevelDef } from './types';

/** Play `n` questions of a round, answering some wrong, changing a setting half way. */
function playSome(drill: DrillDef, level: LevelDef, n: number, answerLast = true): Round {
  let round = createRound(drill, level, { seed: 4242, settings: DEFAULT_SETTINGS, record: recordAnswer(emptyRecord(), level.pool[0], level.pool[1]) });
  for (let i = 0; i < n; i++) {
    const settings = i >= 2 ? { ...DEFAULT_SETTINGS, root: 'fixed' as const, fixedRoot: 5 } : DEFAULT_SETTINGS;
    const next = nextQuestion(round, settings);
    round = next.round;
    if (i === n - 1 && !answerLast) break;
    const q = next.question;
    const chosen = q.kind === 'choice' ? (i % 3 === 1 ? q.options.find((o) => o.id !== q.answer)!.id : q.answer) : i % 2 ? q.target.map(() => q.target[0]) : q.target;
    round = answerQuestion(round, chosen).round;
  }
  return round;
}

describe('a round survives a reload', () => {
  for (const [drillId, levelN] of [['intervals-up', 3], ['melody', 4], ['dictation', 2], ['modes', 6]] as const) {
    it(`${drillId} ${levelN}: rebuilt from its snapshot, it is the same round`, () => {
      const drill = DRILLS[drillId];
      const level = drill.levels[levelN - 1];
      for (const answerLast of [true, false]) {
        const round = playSome(drill, level, 4, answerLast);
        // Through storage: plain JSON.
        const snap = readSnapshot(JSON.parse(JSON.stringify(snapshotOf(round, 1000, 2000))));
        const back = restoreRound(drill, level, snap, 3000)!;
        expect(back).not.toBeNull();
        expect(back.questions.map((q) => q.id)).toEqual(round.questions.map((q) => q.id));
        expect(back.questions).toEqual(round.questions);
        expect(back.answers.map((a) => a.correct)).toEqual(round.answers.map((a) => a.correct));
        expect(back.record).toEqual(round.record);
        expect(scoreRound(back)).toEqual(scoreRound(round));
        // ...and it carries on exactly as the original would have.
        if (answerLast) expect(nextQuestion(back).question).toEqual(nextQuestion(round).question);
      }
    });
  }

  it('belongs to its own level only, and goes stale', () => {
    const drill = DRILLS['intervals-up'];
    const round = playSome(drill, drill.levels[2], 3);
    const snap = snapshotOf(round, 1000, 2000);
    expect(snap.key).toBe(roundKey(drill, drill.levels[2]));
    expect(restoreRound(drill, drill.levels[1], snap, 3000)).toBeNull();
    expect(restoreRound(DRILLS.chords, DRILLS.chords.levels[2], snap, 3000)).toBeNull();
    expect(restoreRound(drill, drill.levels[2], snap, 2000 + RESUME_HOURS * 3600_000 + 1)).toBeNull();
    expect(restoreRound(drill, drill.levels[2], snap, 2000 + RESUME_HOURS * 3600_000 - 1)).not.toBeNull();
  });

  it('reads damaged or foreign data as nothing', () => {
    for (const bad of [null, 3, 'x', {}, { v: 2 }, { v: 1, key: 'a:1', seed: 1, total: 10, settings: [], chosen: [1], startedAt: 0, savedAt: 0 }]) expect(readSnapshot(bad)).toBeNull();
  });

  it('comes back on the last answer when every question was answered but the round had not ended', () => {
    // A reload (or a closed tab) on the feedback of the last question used to lose the whole round:
    // the snapshot held every answer, was not resumed, and nothing had been recorded.
    const drill = DRILLS.pitch;
    const level = drill.levels[0];
    const done = playSome(drill, level, level.questions);
    const back = restoreRound(drill, level, readSnapshot(JSON.parse(JSON.stringify(snapshotOf(done, 0, 1)))), 2)!;
    expect(back).not.toBeNull();
    expect(back.answers).toHaveLength(level.questions);
    expect(roundDone(back)).toBe(true);
    expect(scoreRound(back)).toEqual(scoreRound(done));
    // A snapshot claiming more answers than the round has questions is not a round.
    const snap = snapshotOf(done, 0, 1);
    expect(restoreRound(drill, level, { ...snap, chosen: [...snap.chosen, 'x'] }, 2)).toBeNull();
  });
});
