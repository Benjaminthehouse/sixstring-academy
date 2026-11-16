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

  it('does not call the last off-beat note of a piece syncopated because nothing follows it', () => {
    // Review of pass 2: "nothing struck on the next beat" was true past the final bar line.
    const t = getTrackStats(sixTab(`${head()}| e 3:0 3:2 3:0 3:2 3:0 3:2 3:0 3:2 |\n`), 0)!;
    expect(t.syncopation).toBe(0);
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

  // Review of pass 2: the thumb measure took any treble note between bass notes for a second
  // voice, so a p-i-m-a arpeggio and a boom-chick strum (both level 3) rated 4 with "Two voices at
  // once", while a Travis melody pinched with the thumb (the real thing) scored only a little.
  it('does not take an arpeggio or a boom-chick over a half-bar bass for two voices', () => {
    const pima = sixTab(`${head(66)}${'| e 5:3 3:0 2:1 1:0 5:3 3:0 2:1 1:0 '.repeat(4)}|\n`);
    const boomChick = sixTab(`${head(88)}${'| q 6:3 (4:0 3:0 2:0 1:3){dn} 4:0 (4:0 3:0 2:0 1:3){dn} '.repeat(4)}|\n`);
    for (const song of [pima, boomChick]) {
      expect(getTrackStats(song, 0)!.thumbVoices).toBe(0);
      expect(estimateDifficulty(song).factors.voices).toBe(0);
      expect(estimateDifficulty(song).reasons.join(' ')).not.toMatch(/voices/);
    }
  });

  it('counts pinches with the thumb as the fingers moving on their own, but not power chords', () => {
    // The melody lands with the thumb on the beat (pinches) and once between: a Travis melody.
    const travis = sixTab(`${head(90)}${'| q (5:3 1:0) e 4:2 1:3 q 6:3 (4:2 1:0) '.repeat(4)}|\n`);
    // Per bar: a pinch on beat 1 and the finger note on the "and" of 2, out of five onsets.
    expect(getTrackStats(travis, 0)!.thumbVoices).toBeCloseTo(0.4, 2);
    expect(estimateDifficulty(travis).factors.voices).toBeCloseTo(0.35, 2);
    const powerChords = sixTab(`${head(90)}${'| e (6:0 5:2) (6:0 5:2) (6:0 5:4) (6:0 5:4) (6:0 5:2) (6:0 5:2) (6:0 5:4) (6:0 5:4) '.repeat(4)}|\n`);
    expect(getTrackStats(powerChords, 0)!.thumbVoices).toBe(0);
    // Chords pushed across the beat against a thumb on 1 and 3 (a bossa) are independence.
    const bossa = sixTab(`${head(116)}${'| q. (6:5 4:5 3:5 2:5) e (4:5 3:5 2:5) q 6:5 (4:5 3:5 2:5) | e 6:5 q. (4:5 3:5 2:5) e (6:5 4:5 3:5 2:5) q. (4:5 3:5 2:5) '.repeat(2)}|\n`);
    expect(estimateDifficulty(bossa).factors.voices).toBeGreaterThan(0.3);
  });

  it('does not take an arpeggio left to ring (an imported sustain) for a held second voice', () => {
    // As a MIDI or Guitar Pro import gives it: every note of a C arpeggio sounds for a half note.
    const ringing = sixTab(`${head(80)}${'| e 5:3 4:2 3:0 2:1 1:0 2:1 3:0 4:2 '.repeat(4)}|\n`);
    for (const m of ringing.tracks[0].measures) for (const b of m.beats) for (const n of b.notes) n.length = 1920;
    expect(getTrackStats(ringing, 0)!.heldVoices).toBe(0);
    expect(estimateDifficulty(ringing).factors.voices).toBe(0);
    // A bass held by its length while the melody above moves to new frets is two voices.
    const held = sixTab(`${head(80)}${'| e 5:3 2:1 2:3 1:0 1:1 1:0 2:3 2:1 '.repeat(4)}|\n`);
    for (const m of held.tracks[0].measures) for (const b of m.beats) for (const n of b.notes) if (n.string === 5) n.length = 3840;
    expect(getTrackStats(held, 0)!.heldVoices).toBeGreaterThanOrEqual(0.3);
    expect(estimateDifficulty(held).factors.voices).toBeGreaterThan(0.6);
  });

  it('never rates a song harder because a small factor fell to zero (the score is monotone)', () => {
    const plain = sixTab(`${head(132)}| e 3:0 3:2 2:0 2:1 2:3 2:1 2:0 3:2 | 3:0 3:2 2:0 2:1 h 2:3 |\n`);
    // The same tune with one note left ringing: a little more to do, never less.
    const letRing = sixTab(`${head(132)}| e 3:0{lr} 3:2 2:0 2:1 2:3 2:1 2:0 3:2 | 3:0 3:2 2:0 2:1 h 2:3 |\n`);
    const a = estimateDifficulty(plain);
    const b = estimateDifficulty(letRing);
    expect(b.factors.techniques).toBeGreaterThan(a.factors.techniques);
    expect(b.score).toBeGreaterThanOrEqual(a.score);
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
