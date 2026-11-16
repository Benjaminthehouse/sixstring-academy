/**
 * The difficulty estimate's hand model and factors (integration pass 2): each test is a case the
 * earlier estimate got wrong.
 */
import { describe, expect, it } from 'vitest';
import { sixTab } from './sixtab-parse';
import { estimateDifficulty, getTrackStats, shortestValueWords } from './stats';

const head = (tempo = 90, time = '4/4') => `title: T\ntempo: ${tempo}\ntime: ${time}\n`;

describe('the fretting hand', () => {
  it('fits the hand to the whole part, not to its first fretted note', () => {
    // First position, but the first fretted note is fret 3: the old window (anchored at 3) took the
    // fret 1 for a shift and a five-fret stretch.
    const song = sixTab(`${head()}| q 1:3 1:1 1:0 1:1 | 2:3 2:1 h 2:0 |\n`);
    const t = getTrackStats(song, 0)!;
    expect(t.shifts).toBe(0);
    expect(t.maxSpan).toBe(2);
    expect(t.positions).toEqual([1]);
    expect(estimateDifficulty(song).reasons.join(' ')).not.toMatch(/stretch/);
  });

  it('still finds a real stretch: frets 4 and 8 within a beat in one position', () => {
    const t = getTrackStats(sixTab(`${head(104)}| e 3:4 3:5 2:8 2:6 3:4 3:5 2:8 2:6 |\n`), 0)!;
    expect(t.maxSpan).toBe(4);
    expect(t.shifts).toBe(0);
  });

  it('counts a move to another position once, with the fewest positions possible', () => {
    const t = getTrackStats(sixTab(`${head()}| q 1:1 1:3 1:1 1:3 | 1:8 1:10 1:8 1:10 | 1:1 1:3 h 1:1 |\n`), 0)!;
    expect(t.shifts).toBe(2);
    expect(t.positions).toEqual([1, 8]);
  });

  it('leaves tapped notes to the picking hand: no shifts to the tapped fret and back', () => {
    const lick = sixTab(`${head(100)}| e3 1:12t 1:5p 1:8h 1:12t 1:5p 1:8h 1:12t 1:5p 1:8h 1:12t 1:5p 1:8h |\n`);
    const t = getTrackStats(lick, 0)!;
    expect(t.shifts).toBe(0);
    expect(t.handFrets).toEqual({ min: 5, max: 8 });
    expect(t.frets).toEqual({ min: 5, max: 12 });
    const est = estimateDifficulty(lick);
    expect(est.factors.position).toBeLessThan(0.2);
    expect(est.factors.techniques).toBeGreaterThan(0.75);
  });
});

describe('chords: the voicing played, not the symbol', () => {
  it('scores a strummed chord by the shape written for it', () => {
    const open = estimateDifficulty(sixTab(`${head()}| "F=xx3211" q D D D D | "C=x32010" D D D D |\n`));
    const barre = estimateDifficulty(sixTab(`${head()}| "F=133211" q D D D D | "C=x32010" D D D D |\n`));
    expect(barre.factors.chords).toBeGreaterThan(open.factors.chords + 0.1);
    expect(barre.reasons.join(' ')).toMatch(/barre/);
    expect(open.reasons.join(' ')).not.toMatch(/barre/);
  });

  it('scores the grips played in the tab: drop-2 voicings are harder than the open chords of the same names', () => {
    const grips = sixTab(`${head(120)}| "Dm7" h (4:3 3:5 2:3 1:5) (4:3 3:5 2:3 1:5) | "G7" (4:3 3:4 2:3 1:3) (4:3 3:4 2:3 1:3) | "Cmaj7" (4:2 3:4 2:1 1:3) (4:2 3:4 2:1 1:3) |\n`);
    const open = sixTab(`${head(120)}| "Dm7" h (4:0 3:2 2:1 1:1) (4:0 3:2 2:1 1:1) | "G7" (6:3 5:2 4:0 3:0 2:0 1:1) (6:3 5:2 4:0 3:0 2:0 1:1) | "Cmaj7" (5:3 4:2 3:0 2:0 1:0) (5:3 4:2 3:0 2:0 1:0) |\n`);
    const g = getTrackStats(grips, 0)!;
    expect(g.shapes.map((s) => s.frets.map((f) => f ?? 'x').join(''))).toEqual(['xx3535', 'xx3433', 'xx2413']);
    expect(estimateDifficulty(grips).factors.chords).toBeGreaterThan(estimateDifficulty(open).factors.chords);
  });

  it('scores the shape a picked part holds when its notes come from the shape', () => {
    const travis = sixTab(`${head(90)}| "F=133211" e 6:1 2:1 4:3 1:1 6:1 2:1 4:3 1:1 | 6:1 2:1 4:3 1:1 6:1 2:1 4:3 1:1 | 6:1 2:1 4:3 1:1 6:1 2:1 4:3 1:1 |\n`);
    expect(estimateDifficulty(travis).factors.chords).toBeGreaterThan(0.3);
    // A scale that only passes through some chord tones does not hold the chord.
    const scale = sixTab(`${head(90)}| "F=133211" e 6:1 6:3 5:0 5:1 5:3 4:0 4:2 4:3 | 3:0 3:2 3:3 2:1 2:3 1:0 1:1 1:3 |\n`);
    expect(estimateDifficulty(scale).factors.chords).toBe(0);
  });
});

describe('rhythm', () => {
  it('counts an off-beat note held across the beat as syncopated, even when another note is struck on the beat', () => {
    // The melody's C on the "and" of 1 rings on through beat 2 while the bass strikes it.
    const song = sixTab(`${head()}| e 5:3 2:1 q (5:3 2:-) h 5:3 | e 5:3 2:1 q (5:3 2:-) h 5:3 |\n`);
    expect(getTrackStats(song, 0)!.syncopation).toBeGreaterThan(0.2);
  });

  it('counts an accented off-beat as syncopated', () => {
    const plain = getTrackStats(sixTab(`${head()}| e 3:0 3:2 3:0 3:2 3:0 3:2 3:0 3:2 | w 3:0 |\n`), 0)!;
    const accented = getTrackStats(sixTab(`${head()}| e 3:0 3:2> 3:0 3:2> 3:0 3:2> 3:0 3:2> | w 3:0 |\n`), 0)!;
    const strummed = getTrackStats(sixTab(`${head()}| "G" e D U> D U> D U> D U> | w D |\n`), 0)!;
    expect(plain.syncopation).toBe(0);
    expect(accented.syncopation).toBeCloseTo(4 / 9);
    expect(strummed.syncopation).toBeCloseTo(4 / 9);
  });

  it('names the shortest note value: triplet eighths are not sixteenths', () => {
    expect(shortestValueWords(240)).toBe('sixteenth notes');
    expect(shortestValueWords(320)).toBe('triplet eighth notes');
    expect(shortestValueWords(160)).toBe('triplet sixteenth notes');
    const est = estimateDifficulty(sixTab(`${head(140)}| e3 3:0 3:2 3:4 3:0 3:2 3:4 3:0 3:2 3:4 3:0 3:2 3:4 |\n`));
    expect(est.reasons.join(' ')).toMatch(/triplet eighth notes/);
    expect(est.reasons.join(' ')).not.toMatch(/sixteenth/);
  });
});

describe('the new factors', () => {
  it('sees independent voices: a note held while the other voice moves', () => {
    const twoVoices = sixTab(`${head(80)}| e (5:3 2:1) (5:- 2:3) (5:- 1:0) (5:- 2:1) (4:2 2:3) (4:- 1:0) (4:- 1:1) (4:- 1:0) |\n`);
    const oneVoice = sixTab(`${head(80)}| e 5:3 2:1 2:3 1:0 4:2 2:3 1:0 1:1 |\n`);
    expect(getTrackStats(twoVoices, 0)!.heldVoices).toBeGreaterThan(0.5);
    expect(estimateDifficulty(twoVoices).factors.voices).toBeGreaterThan(0.6);
    expect(estimateDifficulty(oneVoice).factors.voices).toBe(0);
  });

  it('sees a melody moving off a steady thumb, a little', () => {
    const travis = sixTab(`${head(90)}| e 5:3 2:1 4:2 1:0 6:3 2:1 4:2 1:0 | 5:3 2:1 4:2 1:0 6:3 2:1 4:2 1:0 | 5:3 2:1 4:2 1:0 6:3 2:1 4:2 1:0 |\n`);
    const t = getTrackStats(travis, 0)!;
    expect(t.thumbVoices).toBeGreaterThan(0.3);
    const voices = estimateDifficulty(travis).factors.voices;
    expect(voices).toBeGreaterThan(0.2);
    expect(voices).toBeLessThanOrEqual(0.35);
  });

  it('sees endurance: a long run of fast notes, and calls a repeated note tremolo', () => {
    const bar = 's 1:7 1:7 1:7 1:7 1:5 1:5 1:5 1:5 1:3 1:3 1:3 1:3 1:5 1:5 1:5 1:5';
    const long = sixTab(`${head(110)}${Array.from({ length: 16 }, () => `| ${bar} `).join('')}|\n`);
    const short = sixTab(`${head(110)}| ${bar} | w 1:0 |\n`);
    const t = getTrackStats(long, 0)!;
    expect(t.enduranceSeconds).toBeGreaterThan(30);
    expect(t.enduranceRepeats).toBeGreaterThan(0.6);
    const est = estimateDifficulty(long);
    expect(est.factors.endurance).toBeGreaterThan(0.5);
    expect(est.reasons.join(' ')).toMatch(/tremolo/);
    expect(estimateDifficulty(short).factors.endurance).toBe(0);
  });

  it('sees muting between strums: muted scratches alternating with ringing chords', () => {
    const funk = sixTab(`${head(96)}| "E9=x76777" s D X U X D X U X D X U X D X U X | D X U X D X U X D X U X D X U X |\n`);
    const plain = sixTab(`${head(96)}| "E9=x76777" s D U D U D U D U D U D U D U D U | D U D U D U D U D U D U D U D U |\n`);
    const t = getTrackStats(funk, 0)!;
    expect(t.mutedStrums).toBe(0.5);
    expect(t.mutingSwitches).toBe(true);
    expect(estimateDifficulty(funk).factors.muting).toBeGreaterThan(0.5);
    expect(estimateDifficulty(plain).factors.muting).toBe(0);
  });
});
