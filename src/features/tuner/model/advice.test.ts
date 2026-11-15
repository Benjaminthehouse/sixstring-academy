import { describe, expect, it } from 'vitest';
import type { LevelEvent, TunerState } from '@/core/pitch';
import { LEVEL_MESSAGES, LevelWatch, TIP_MESSAGES, TipWatch, instructionText, nextInstruction, spokenReading, type InstructionCode, type InstructionContext } from './advice';

type Reading = Pick<TunerState, 'active' | 'cents' | 'withinTolerance' | 'inTune' | 'hint' | 'mode'>;

function reading(cents: number, over: Partial<Reading> = {}): Reading {
  return { active: true, cents, withinTolerance: Math.abs(cents) <= 3, inTune: false, mode: 'auto', hint: { code: 'tune-up', text: '', severity: 'info' }, ...over };
}

describe('nextInstruction', () => {
  it('follows the reading from far to in tune', () => {
    expect(nextInstruction(reading(0, { active: false }), 'tighten')).toBe('pluck');
    expect(nextInstruction(reading(-40), 'pluck')).toBe('tighten');
    expect(nextInstruction(reading(-7), 'tighten')).toBe('tighten-little');
    expect(nextInstruction(reading(40), 'pluck')).toBe('loosen');
    expect(nextInstruction(reading(7), 'loosen')).toBe('loosen-little');
    expect(nextInstruction(reading(1), 'tighten-little')).toBe('hold');
    expect(nextInstruction(reading(1, { inTune: true }), 'hold')).toBe('in-tune');
  });

  it('does not flicker at ten cents', () => {
    // Coming in from far away, "a little" starts at 10; once showing it stays until 12.
    expect(nextInstruction(reading(-10.5), 'tighten')).toBe('tighten');
    expect(nextInstruction(reading(-10.5), 'tighten-little')).toBe('tighten-little');
    expect(nextInstruction(reading(-12.5), 'tighten-little')).toBe('tighten');
    expect(nextInstruction(reading(11), 'hold')).toBe('loosen-little');
    expect(nextInstruction(reading(11), 'loosen')).toBe('loosen');
  });

  it('warns beyond a whole step, with hysteresis, but never in chromatic mode', () => {
    expect(nextInstruction(reading(-300), 'pluck')).toBe('far-below');
    expect(nextInstruction(reading(260), 'pluck')).toBe('far-above');
    expect(nextInstruction(reading(-195), 'far-below')).toBe('far-below');
    expect(nextInstruction(reading(-195), 'tighten')).toBe('tighten');
    expect(nextInstruction(reading(-180), 'far-below')).toBe('tighten');
    expect(nextInstruction(reading(-49, { mode: 'chromatic' }), 'pluck')).toBe('tighten');
  });

  it("passes on the tuner's wrong-string warning", () => {
    expect(nextInstruction(reading(500, { mode: 'locked', hint: { code: 'other-string', text: '', severity: 'warning' } }), 'pluck')).toBe('other-string');
  });
});

describe('instructionText', () => {
  const ctx: InstructionContext = { mode: 'auto', note: 'E', stringName: 'thickest string' };

  it('uses the plain words the learner acts on', () => {
    expect(instructionText('tighten-little', ctx).title).toBe('Tighten a little');
    expect(instructionText('loosen-little', ctx).title).toBe('Loosen a little');
    expect(instructionText('hold', ctx).title).toBe('Hold it there');
    expect(instructionText('in-tune', ctx)).toMatchObject({ title: 'In tune', tone: 'ok', icon: 'check' });
    expect(instructionText('tighten', ctx)).toMatchObject({ title: 'Tighten', icon: 'up' });
    expect(instructionText('loosen', ctx)).toMatchObject({ title: 'Loosen', icon: 'down' });
  });

  it('asks for the right thing in each mode', () => {
    expect(instructionText('pluck', ctx).title).toBe('Pluck one string');
    expect(instructionText('pluck', { ...ctx, mode: 'chromatic' }).title).toBe('Play any note');
    const guided = instructionText('pluck', { ...ctx, mode: 'guide', where: 'string 6, the one nearest your chin' });
    expect(guided.title).toBe('Pluck the thickest string');
    expect(guided.detail).toContain('string 6, the one nearest your chin');
    expect(instructionText('pluck', { ...ctx, mode: 'locked', stringName: '4th string' }).title).toBe('Pluck the 4th string');
  });

  it('warns before a string is over-tightened, naming the note', () => {
    const above = instructionText('far-above', ctx);
    expect(above).toMatchObject({ tone: 'warn', icon: 'warning' });
    expect(above.title).toMatch(/loosen/i);
    expect(above.detail).toMatch(/whole step above E/);
    expect(above.detail).toMatch(/snap/);
    const below = instructionText('far-below', ctx);
    expect(below.detail).toMatch(/whole step below E/);
    expect(below.detail).toMatch(/peg/);
    const other = instructionText('other-string', { ...ctx, mode: 'guide', note: 'A', stringName: '5th string', otherNote: 'D', otherStringName: '4th string' });
    expect(other.detail).toBe('That sounds like the 4th string (D). For A, pluck the 5th string.');
  });

  it('keeps every detail short enough for two lines on a phone', () => {
    const codes: InstructionCode[] = ['pluck', 'tighten', 'tighten-little', 'loosen', 'loosen-little', 'hold', 'in-tune', 'far-below', 'far-above', 'other-string'];
    for (const code of codes) {
      for (const mode of ['guide', 'auto', 'locked', 'chromatic'] as const) {
        const text = instructionText(code, { mode, note: 'G♯', stringName: 'thinnest string', where: 'string 1, the one nearest the floor', otherNote: 'B', otherStringName: 'thickest string' });
        expect(text.detail.length, `${code}/${mode}: ${text.detail}`).toBeLessThanOrEqual(92);
        expect(text.title.length, `${code}/${mode}`).toBeLessThanOrEqual(26);
      }
    }
    for (const message of [...Object.values(TIP_MESSAGES), ...Object.values(LEVEL_MESSAGES)]) expect(message.length).toBeLessThanOrEqual(80);
  });

  it('has a sentence for screen readers', () => {
    expect(spokenReading('tighten', instructionText('tighten', ctx), -23.6, 'E2')).toBe('E2: 24 cents low. Tighten.');
    expect(spokenReading('loosen-little', instructionText('loosen-little', ctx), 6.2, 'E2')).toBe('E2: 6 cents high. Loosen a little.');
    expect(spokenReading('in-tune', instructionText('in-tune', ctx), 0.4, 'E2')).toBe('E2 is in tune.');
    expect(spokenReading('pluck', instructionText('pluck', ctx), 0, '')).toBe('Pluck one string');
    expect(spokenReading('far-above', instructionText('far-above', ctx), 250, 'E2')).toMatch(/^Far too high/);
  });
});

function level(time: number, over: Partial<LevelEvent> = {}): LevelEvent {
  return { time, rms: 0.001, db: -60, peak: 0.002, clipping: false, noiseFloorDb: -70, gateDb: -62, hum: false, ...over };
}

describe('LevelWatch', () => {
  it('says nothing in a quiet room, however long', () => {
    const watch = new LevelWatch();
    for (let t = 0; t < 30; t += 0.033) expect(watch.update(level(t, { db: -66 + Math.sin(t * 40) * 4 }), false)).toBe('ok');
  });

  it('asks to back off while the input clips, and for a moment after', () => {
    const watch = new LevelWatch();
    expect(watch.update(level(1, { clipping: true, db: -1 }), true)).toBe('too-loud');
    expect(watch.update(level(2.5), true)).toBe('too-loud');
    expect(watch.update(level(4), false)).toBe('ok');
    expect(LEVEL_MESSAGES['too-loud']).toBe('Too loud: move back or pluck softer');
  });

  it('asks to come closer only when a note was barely heard', () => {
    const watch = new LevelWatch();
    watch.noteStarted(1, -58, -62);
    expect(watch.update(level(1.1, { db: -58 }), true)).toBe('too-quiet');
    expect(watch.update(level(3), false)).toBe('too-quiet');
    expect(watch.update(level(5), false)).toBe('ok');
    // A healthy note clears it at once.
    watch.noteStarted(6, -58, -62);
    watch.noteStarted(6.5, -25, -62);
    expect(watch.update(level(6.6, { db: -25 }), true)).toBe('ok');
    // Just over the gate in a loud room is not "quiet".
    watch.noteStarted(8, -36, -40);
    expect(watch.update(level(8.1, { db: -36, gateDb: -40, noiseFloorDb: -48 }), true)).toBe('ok');
    expect(LEVEL_MESSAGES['too-quiet']).toBe('Too quiet: move closer');
  });

  it('mentions a hum that is being ignored, and a noisy room after two seconds', () => {
    const watch = new LevelWatch();
    expect(watch.update(level(1, { hum: true }), false)).toBe('hum');
    expect(LEVEL_MESSAGES.hum).toBe('Background hum is being ignored');
    const noisy = new LevelWatch();
    expect(noisy.update(level(1, { noiseFloorDb: -40, gateDb: -38, db: -40 }), false)).toBe('ok');
    expect(noisy.update(level(2.5, { noiseFloorDb: -40, gateDb: -38, db: -40 }), false)).toBe('ok');
    expect(noisy.update(level(3.1, { noiseFloorDb: -40, gateDb: -38, db: -40 }), false)).toBe('noisy');
    expect(noisy.update(level(4, { noiseFloorDb: -60 }), false)).toBe('ok');
  });

  it('puts the most urgent warning first and forgets on reset', () => {
    const watch = new LevelWatch();
    watch.noteStarted(1, -58, -62);
    expect(watch.update(level(1.1, { clipping: true, hum: true }), true)).toBe('too-loud');
    watch.reset();
    expect(watch.update(level(1.2), false)).toBe('ok');
    expect(watch.advice).toBe('ok');
  });
});

describe('TipWatch', () => {
  /** Feed one plucked note: `cents(age)` is the steadied value, `raw(age)` the frame's own. */
  function note(watch: TipWatch, start: number, seconds: number, cents: (age: number) => number, raw: (age: number) => number = cents) {
    let last = null;
    for (let age = 0.02; age <= seconds; age += 0.01) last = watch.update(start + age, age, cents(age), raw(age));
    return last;
  }

  it('explains a pluck that starts sharp and settles near the note', () => {
    const watch = new TipWatch();
    const settling = (age: number) => 2 + 9 * Math.exp(-age / 0.06);
    expect(note(watch, 0, 1, settling)).toBe('settling');
    expect(watch.current(5)).toBe('settling');
    expect(watch.current(7)).toBeNull();
  });

  it('stays quiet for a steady string and for one that is far off anyway', () => {
    const watch = new TipWatch();
    expect(note(watch, 0, 2, () => -1)).toBeNull();
    expect(note(watch, 3, 2, (age) => 30 + 9 * Math.exp(-age / 0.06))).toBeNull();
  });

  it('suggests damping the other strings when the reading wobbles close to the note', () => {
    const watch = new TipWatch();
    expect(note(watch, 0, 3, () => 2, (age) => 2 + 4 * Math.sin(age * 90))).toBe('damp');
  });

  it('does not nag: each hint twice a visit at most, and never back to back', () => {
    const watch = new TipWatch();
    const settling = (age: number) => 9 * Math.exp(-age / 0.06);
    let shown = 0;
    for (let i = 0; i < 12; i++) {
      const before = watch.current(i * 30);
      const tip = note(watch, i * 30, 1, settling);
      if (tip === 'settling' && before === null) shown++;
    }
    expect(shown).toBe(2);
    // Two plucks ten seconds apart: the second one does not bring the hint straight back.
    const close = new TipWatch();
    expect(note(close, 0, 1, settling)).toBe('settling');
    expect(note(close, 10, 1, settling)).toBeNull();
  });
});
