/**
 * Regression tests for the bugs found in the arcade review. Each block names the bug it pins.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getScale } from '@/core/theory';
import { arcadeScales, patternOf, scaleLabel, shapesFor } from './focus';
import { DEGREE_INFO, dartsTip, degreeCall, degreeShort } from './degreeDarts';
import { crownLabel, roundTitle, scopeLabel, skillIdFor } from './skill';
import { pausableClock, timerBag } from './timers';
import { RunJudge, runNotes, runTimeline, RUN_LEVELS } from './runScale';
import { gameById } from './games';

const ASCII_ACCIDENTAL = /(^|[\s(])(b{1,2}|#{1,2})\d/;

describe('degree labels (bug: "bb7" was drawn as "♭b7": only the first accidental was replaced)', () => {
  it('formats every accidental, and the root as R', () => {
    expect(degreeShort('1')).toBe('R');
    expect(degreeShort('b3')).toBe('♭3');
    expect(degreeShort('#4')).toBe('♯4');
    expect(degreeShort('bb7')).not.toMatch(/b/);
    expect(degreeShort('bb3')).not.toMatch(/b/);
  });

  it('no dot on any arcade scale shape carries an ASCII accidental', () => {
    const bad: string[] = [];
    for (const s of arcadeScales()) {
      for (const d of s.degrees) if (/[b#]/.test(degreeShort(d))) bad.push(`${s.id}:${d}`);
    }
    expect(bad).toEqual([]);
  });

  it('a scale with a double flat (Locrian 𝄫7) labels its shape without letters', () => {
    const withDouble = arcadeScales().find((s) => s.degrees.includes('bb7'));
    expect(withDouble).toBeTruthy();
    const pattern = patternOf({ tonic: 'C', scale: withDouble!.id, shape: shapesFor('C', withDouble!.id)[0].id });
    const labels = pattern.notes.map((n) => degreeShort(n.degree));
    expect(labels.some((l) => l.includes('7'))).toBe(true);
    expect(labels.join(' ')).not.toMatch(/[b#]/);
  });
});

describe('degree names (Degree Darts, Shape Builder)', () => {
  it('every degree of every arcade scale has a name and a role (no "degree bb3" fallback)', () => {
    const missing = new Set<string>();
    for (const s of arcadeScales()) for (const d of s.degrees) if (!DEGREE_INFO[d]) missing.add(d);
    expect([...missing]).toEqual([]);
    expect(degreeCall('1')).toBe('the root');
  });

  it('bug: the tip read "Work on the root: Home: the note…" (two colons); it is two sentences now', () => {
    const tip = dartsTip('1', 'A');
    expect(tip).toBe('Work on the root. Home: the note the scale is named after and comes to rest on. In this scale it is A.');
    expect(tip.split(':').length).toBeLessThanOrEqual(2);
    expect(dartsTip('b3', 'C')).toMatch(/^Work on the ♭3\. The minor third/);
  });
});

describe('scale names in the picker (bug: "Dorian #4", "Minor 7b5 pentatonic" shown in ASCII)', () => {
  it('draws accidentals as signs for every arcade scale', () => {
    const ascii = arcadeScales().map(scaleLabel).filter((n) => ASCII_ACCIDENTAL.test(n));
    expect(ascii).toEqual([]);
    expect(scaleLabel(getScale('dorian-sharp-4') ?? { name: 'Dorian #4' })).toBe('Dorian ♯4');
  });
});

describe('labels per game (bug: Sprint logged "Box 1" and every game said "Crown n for this shape")', () => {
  const sprint = gameById('fretboard-sprint')!;
  const hunt = gameById('note-hunt')!;
  const modes = gameById('mode-match')!;

  it('Sprint is the whole neck, in its skill id and its title', () => {
    expect(skillIdFor('fretboard-sprint', { tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' }, 1)).toBe('scale:a-minor-pentatonic:neck');
    expect(roundTitle(sprint, 'A minor pentatonic', 'Box 1')).toBe('Fretboard Sprint: A minor pentatonic, whole neck');
    expect(roundTitle(hunt, 'A minor pentatonic', 'Box 1')).toBe('Note Hunt: A minor pentatonic, Box 1');
    expect(roundTitle(modes, 'A minor pentatonic', 'Box 1')).toBe('Mode Match: the modes');
  });

  it('a crown names what it is for', () => {
    expect(crownLabel('note-hunt', 2)).toBe('Crown 2 for this shape');
    expect(crownLabel('fretboard-sprint', 1)).toBe('Crown 1 for the whole neck');
    expect(crownLabel('mode-match', 3)).toBe('Crown 3 in Mode Match');
  });

  it('Mode Match is not played on the practised scale', () => {
    expect(scopeLabel('mode-match', 'A minor pentatonic')).toBe('The modes');
    expect(scopeLabel('lick-echo', 'A minor pentatonic')).toBe('A minor pentatonic');
  });
});

describe('pausableClock (bug: round clocks kept running while the tab was hidden)', () => {
  it('counts only while running', () => {
    const c = pausableClock();
    expect(c.seconds(0)).toBe(0);
    c.set(true, 1000);
    expect(c.seconds(3000)).toBe(2);
    c.set(false, 3000);
    expect(c.seconds(60_000)).toBe(2);
    c.set(true, 60_000);
    expect(c.seconds(61_500)).toBe(3.5);
    // Repeated calls with the same state change nothing.
    c.set(true, 61_000);
    expect(c.seconds(61_500)).toBe(3.5);
  });
});

describe('timerBag (bug: a round finished "in a second" reported itself after the learner left)', () => {
  afterEach(() => vi.useRealTimers());

  it('clear() cancels what is still pending; finished ones are forgotten', () => {
    vi.useFakeTimers();
    const bag = timerBag();
    const done: string[] = [];
    bag.later(() => done.push('early'), 100);
    bag.later(() => done.push('finish round'), 900);
    vi.advanceTimersByTime(150);
    bag.clear();
    vi.advanceTimersByTime(5000);
    expect(done).toEqual(['early']);
  });
});

describe('Run the Scale timing, against offsets a person really plays (60 BPM, one note a beat)', () => {
  // Mirrors the fake-microphone recording used in the review: the judge alone, no browser.
  const level = RUN_LEVELS[0];
  const pattern = patternOf({ tonic: 'A', scale: 'minor-pentatonic', shape: 'box-1' });
  const notes = runNotes(pattern, level);
  const tl = runTimeline(notes.length, 60, 1, 0);

  const play = (octaves: 'any' | 'exact') => {
    const j = new RunJudge(notes.map((n) => n.midi), tl.noteTimes, tl.noteSec, { octaves });
    const offsets: Array<number | 'octave' | null> = [0, 0.06, -0.06, 0.08, -0.08, 0.17, -0.17, 0.3, 'octave', 0, null, 0];
    offsets.forEach((o, i) => {
      if (o === null) return;
      j.tick(tl.noteTimes[i] - 0.2);
      if (o === 'octave') j.play(notes[i].midi + 12, tl.noteTimes[i]);
      else j.play(notes[i].midi, tl.noteTimes[i] + o);
    });
    j.tick(Infinity);
    return j.results.sort((a, b) => a.index - b.index).map((r) => r.kind).join(',');
  };

  it('±80 ms is on time, ±170 ms early/late, a silent note is missed without spoiling the next', () => {
    expect(play('any')).toBe('on-time,on-time,on-time,on-time,on-time,late,early,late,on-time,on-time,missed,on-time');
  });

  it('with exact octaves the octave-up note does not count', () => {
    expect(play('exact')).toBe('on-time,on-time,on-time,on-time,on-time,late,early,late,missed,on-time,missed,on-time');
  });
});
