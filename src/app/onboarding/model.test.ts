import { describe, expect, it } from 'vitest';
import { GOAL_CHOICES, ONBOARDING_STEPS, defaultDraft, finishInput, nextStep, previousStep, sanitizeStored, shouldAutoOpen, stepIndex } from './model';

describe('steps', () => {
  it('run welcome, level, hand, note names, goal, tour', () => {
    expect([...ONBOARDING_STEPS]).toEqual(['welcome', 'experience', 'hand', 'names', 'goal', 'tour']);
  });
  it('walk forwards and backwards and stop at the ends', () => {
    expect(previousStep('welcome')).toBeNull();
    expect(nextStep('welcome')).toBe('experience');
    expect(previousStep('tour')).toBe('goal');
    expect(nextStep('tour')).toBeNull();
    let step: (typeof ONBOARDING_STEPS)[number] | null = 'welcome';
    let seen = 0;
    while (step) {
      expect(stepIndex(step)).toBe(seen++);
      step = nextStep(step);
    }
    expect(seen).toBe(ONBOARDING_STEPS.length);
  });
});

describe('sanitizeStored', () => {
  it('gives defaults for nothing or nonsense', () => {
    for (const raw of [null, undefined, 42, 'x', [], { draft: 7 }]) expect(sanitizeStored(raw)).toEqual({ skipped: false, draft: defaultDraft() });
  });
  it('keeps valid answers and the place in the flow', () => {
    const stored = sanitizeStored({ skipped: true, draft: { step: 'names', name: 'Sam', experience: 'expert', handedness: 'left', noteNaming: 'german', dailyGoalXp: 50 } });
    expect(stored).toEqual({ skipped: true, draft: { step: 'names', name: 'Sam', experience: 'expert', handedness: 'left', noteNaming: 'german', dailyGoalXp: 50 } });
  });
  it('replaces each damaged field on its own', () => {
    const stored = sanitizeStored({ skipped: 'yes', draft: { step: 'nowhere', name: 5, experience: 'wizard', handedness: 'left', noteNaming: 'numbers', dailyGoalXp: 25 } });
    expect(stored.skipped).toBe(false);
    expect(stored.draft).toEqual({ ...defaultDraft(), handedness: 'left' });
  });
  it('cuts an overlong name', () => {
    expect(sanitizeStored({ draft: { name: 'x'.repeat(200) } }).draft.name).toHaveLength(40);
  });
});

describe('shouldAutoOpen', () => {
  it('opens on Today for a learner who has neither finished nor skipped', () => {
    expect(shouldAutoOpen(false, false, 'home')).toBe(true);
  });
  it('never interrupts a direct link to another screen', () => {
    for (const route of ['tuner', 'scales', 'study', 'profile']) expect(shouldAutoOpen(false, false, route)).toBe(false);
  });
  it('stays away once finished or skipped', () => {
    expect(shouldAutoOpen(true, false, 'home')).toBe(false);
    expect(shouldAutoOpen(false, true, 'home')).toBe(false);
  });
});

describe('finishInput', () => {
  it('passes the answers on, and leaves the name out when it is blank', () => {
    const draft = { ...defaultDraft(), name: '  ', experience: 'intermediate' as const, handedness: 'left' as const, noteNaming: 'solfege' as const, dailyGoalXp: 30 as const };
    expect(finishInput(draft)).toEqual({ onboarding: { experience: 'intermediate', dailyGoalXp: 30, handedness: 'left' }, noteNaming: 'solfege' });
    expect(finishInput({ ...draft, name: ' Sam ' }).onboarding.name).toBe('Sam');
  });
});

describe('GOAL_CHOICES', () => {
  it('offers the four goals the store accepts, smallest first, at about 2 XP a minute', () => {
    expect(GOAL_CHOICES.map((c) => c.xp)).toEqual([10, 20, 30, 50]);
    for (const c of GOAL_CHOICES) expect(c.xp / c.minutes).toBe(2);
    expect(defaultDraft().dailyGoalXp).toBe(20);
  });
});
