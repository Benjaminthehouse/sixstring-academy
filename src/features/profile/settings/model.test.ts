import { describe, expect, it } from 'vitest';
import { CLICK_SETS, TONE_NAMES, normalizeClickSet, normalizeTone } from '@/core/audio';
import { TUNINGS, getTuning } from '@/core/guitar';
import { DAILY_GOALS, defaultPrefs, sanitizePrefs } from '@/core/progress';
import {
  A4_RANGE,
  ACCIDENTAL_CHOICES,
  CLICK_CHOICES,
  EXPERIENCE_CHOICES,
  FRET_LABEL_CHOICES,
  GOAL_CHOICES,
  HAND_CHOICES,
  MOTION_CHOICES,
  NAMING_CHOICES,
  NOTATION_CHOICES,
  THEME_CHOICES,
  TONE_CHOICES,
  WEEK_START_CHOICES,
  a4Text,
  clickChoice,
  toneChoice,
  tuningOptions,
} from './model';

describe('sound choices', () => {
  it('every guitar sound is a tone the audio engine knows, and is kept as it is', () => {
    for (const choice of TONE_CHOICES) {
      expect(TONE_NAMES, choice.value).toContain(choice.value);
      expect(normalizeTone(choice.value)).toBe(choice.value);
    }
    expect(new Set(TONE_CHOICES.map((c) => c.value)).size).toBe(TONE_CHOICES.length);
  });

  it('reads stored tone names the way the audio engine does', () => {
    for (const stored of ['acoustic', 'classical', 'electric', 'distortion', 'steel', 'nylon', 'clean', 'driven', 'overdrive', 'Steel-String', 'no-such-tone']) {
      const engine = normalizeTone(stored);
      // The picker only offers the four guitars; anything else the engine knows shows as its base guitar.
      if (TONE_CHOICES.some((c) => c.value === engine)) expect(toneChoice(stored), stored).toBe(engine);
    }
    expect(toneChoice(defaultPrefs().sound.guitarTone)).toBe('steel');
    expect(toneChoice('no-such-tone')).toBe('steel');
  });

  it('offers every click set of the audio engine, and reads stored names the same way', () => {
    expect(CLICK_CHOICES.map((c) => c.value).sort()).toEqual([...CLICK_SETS].sort());
    for (const stored of ['wood', 'woodblock', 'beep', 'click', 'hat', 'hi-hat', 'rimshot', 'bell', 'claves', 'no-such-click']) expect(clickChoice(stored), stored).toBe(normalizeClickSet(stored));
    expect(clickChoice(defaultPrefs().sound.clickSound)).toBe('woodblock');
  });

  it('what the picker stores survives the store’s own validation', () => {
    const base = defaultPrefs();
    for (const tone of TONE_CHOICES) expect(sanitizePrefs({ ...base, sound: { ...base.sound, guitarTone: tone.value } }, base, []).sound.guitarTone).toBe(tone.value);
    for (const click of CLICK_CHOICES) expect(sanitizePrefs({ ...base, sound: { ...base.sound, clickSound: click.value } }, base, []).sound.clickSound).toBe(click.value);
  });
});

describe('choices match what the store accepts', () => {
  const base = defaultPrefs();
  const accepts = (patch: Record<string, unknown>): Record<string, unknown> => sanitizePrefs({ ...base, ...patch }, base, []) as unknown as Record<string, unknown>;

  it('every option of every simple setting is kept by the store', () => {
    for (const c of HAND_CHOICES) expect(accepts({ handedness: c.value }).handedness).toBe(c.value);
    for (const c of NAMING_CHOICES) expect(accepts({ noteNaming: c.value }).noteNaming).toBe(c.value);
    for (const c of ACCIDENTAL_CHOICES) expect(accepts({ accidentals: c.value }).accidentals).toBe(c.value);
    for (const c of THEME_CHOICES) expect(accepts({ theme: c.value }).theme).toBe(c.value);
    for (const c of MOTION_CHOICES) expect(accepts({ motion: c.value }).motion).toBe(c.value);
    for (const c of NOTATION_CHOICES) expect(accepts({ notation: c.value }).notation).toBe(c.value);
    for (const c of WEEK_START_CHOICES) expect(accepts({ weekStart: c.value }).weekStart).toBe(c.value);
    for (const c of GOAL_CHOICES) expect(accepts({ dailyGoalXp: c.value }).dailyGoalXp).toBe(c.value);
    for (const c of FRET_LABEL_CHOICES) expect(sanitizePrefs({ ...base, fretboard: { ...base.fretboard, labels: c.value } }, base, []).fretboard.labels).toBe(c.value);
  });

  it('the daily goals are the store’s four, with the same names', () => {
    expect(GOAL_CHOICES.map((c) => c.value)).toEqual(DAILY_GOALS.map((g) => g.xp));
    expect(GOAL_CHOICES.map((c) => c.label)).toEqual(DAILY_GOALS.map((g) => g.label));
    for (const c of GOAL_CHOICES) expect(c.description).toContain(`${c.value} XP`);
  });

  it('offers the three levels and both hands', () => {
    expect(EXPERIENCE_CHOICES.map((c) => c.value)).toEqual(['beginner', 'intermediate', 'expert']);
    expect(HAND_CHOICES.map((c) => c.value)).toEqual(['right', 'left']);
  });

  it('the reference pitch range is the store’s', () => {
    expect(accepts({ a4: A4_RANGE.min }).a4).toBe(A4_RANGE.min);
    expect(accepts({ a4: A4_RANGE.max }).a4).toBe(A4_RANGE.max);
    expect(accepts({ a4: A4_RANGE.min - 1 }).a4).toBe(A4_RANGE.min);
    expect(accepts({ a4: A4_RANGE.max + 1 }).a4).toBe(A4_RANGE.max);
    expect(base.a4).toBe(A4_RANGE.standard);
  });
});

describe('reference pitch in words', () => {
  it('explains the usual values and any other', () => {
    expect(a4Text(440)).toMatch(/^Concert pitch/);
    expect(a4Text(432)).toMatch(/lower than concert pitch/);
    expect(a4Text(415)).toMatch(/^Baroque pitch/);
    expect(a4Text(442)).toBe('2 Hz above concert pitch. Some orchestras tune here; recordings will sound flat next to you.');
    expect(a4Text(438)).toBe('2 Hz below concert pitch. Recordings and other instruments will sound sharp next to you.');
  });
});

describe('tuning picker', () => {
  const groups = tuningOptions(TUNINGS);
  const all = groups.flatMap((g) => g.options);

  it('lists every tuning of the catalog exactly once', () => {
    expect(all.map((o) => o.value).sort()).toEqual(TUNINGS.map((t) => t.id).sort());
    expect(new Set(all.map((o) => o.value)).size).toBe(TUNINGS.length);
  });

  it('starts with standard tuning and ends with the other instruments', () => {
    expect(groups[0].group).toBe('Standard');
    expect(groups[0].options[0]).toEqual({ value: 'standard', label: 'Standard (E A D G B E)' });
    expect(groups.slice(-2).map((g) => g.group)).toEqual(['Bass', 'Ukulele']);
    expect(groups.every((g) => g.options.length > 0)).toBe(true);
  });

  it('every option is an id the guitar module resolves, and the default is among them', () => {
    for (const option of all) expect(getTuning(option.value)?.id, option.value).toBe(option.value);
    expect(all.map((o) => o.value)).toContain(defaultPrefs().tuningId);
    expect(all.find((o) => o.value === 'drop-d')?.label).toBe('Drop D (D A D G B E)');
  });
});
