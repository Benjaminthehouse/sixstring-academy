/**
 * Chord checking from audio: synthetic strums of the common open and barre chords go through the
 * chroma extractor and the matcher. Voicings are the standard fingerings, as sounding MIDI notes
 * from the lowest string played.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { averageChroma, type ChordSpec, matchChord, pitchClassesOf, rankChords, requiredTones } from './chords';
import { ChromaExtractor, computeChroma } from './chroma';
import { analyze } from './engine';
import { addNoise, mix, pluckedString, seededRandom, silence, strum, whiteNoise } from './signals';

const VOICINGS: Record<string, number[]> = {
  // open chords
  C: [48, 52, 55, 60, 64], // x32010
  A: [45, 52, 57, 61, 64], // x02220
  G: [43, 47, 50, 55, 59, 67], // 320003
  E: [40, 47, 52, 56, 59, 64], // 022100
  D: [50, 57, 62, 66], // xx0232
  Am: [45, 52, 57, 60, 64], // x02210
  Em: [40, 47, 52, 55, 59, 64], // 022000
  Dm: [50, 57, 62, 65], // xx0231
  Dsus4: [50, 57, 62, 67], // xx0233
  Asus4: [45, 52, 57, 62, 64], // x02230
  A7: [45, 52, 55, 61, 64], // x02020
  E7: [40, 47, 50, 56, 59, 64], // 020100
  B7: [47, 51, 57, 59, 66], // x21202
  G7: [43, 47, 50, 55, 59, 65], // 320001
  Cmaj7: [48, 52, 55, 59, 64], // x32000
  Am7: [45, 52, 55, 60, 64], // x02010
  // barre chords
  F: [41, 48, 53, 57, 60, 65], // 133211
  Bm: [47, 54, 59, 62, 66], // x24432
  'F#m': [42, 49, 54, 57, 61, 66], // 244222
  Bb: [46, 53, 58, 62, 65], // x13331
};
const NAMES = Object.keys(VOICINGS);
const SPECS: ChordSpec[] = NAMES.map((name) => ({ name, pcs: pitchClassesOf(VOICINGS[name]), bass: VOICINGS[name][0] % 12 }));
const spec = (name: string): ChordSpec => SPECS[NAMES.indexOf(name)];
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 } as const;

type Style = 'clean' | 'small mic + noise' | 'up-strum, soft bass';
const STYLES: Style[] = ['clean', 'small mic + noise', 'up-strum, soft bass'];

/** A strummed chord, 50 ms of lead-in, analysed about 0.3 s after the strum like the game helper does. */
function strummed(midis: number[], sr: number, seed: number, style: Style): Float32Array {
  const rand = seededRandom(seed * 131 + midis[0]);
  // Every string a few cents off, different levels, a pluck position somewhere over the sound hole.
  let freqs = midis.map((m) => midiToFreq(m) * Math.pow(2, ((rand() - 0.5) * 16) / 1200));
  let levels = midis.map(() => 0.6 + 0.4 * rand());
  if (style === 'up-strum, soft bass') {
    freqs = freqs.reverse();
    levels = levels.reverse().map((l, i, all) => l * (i >= all.length - 2 ? 0.45 : 1));
  }
  let x = strum({
    freqs,
    levels,
    sampleRate: sr,
    duration: 0.5,
    startTime: 0.05,
    strumMs: 8 + 10 * rand(),
    seed,
    attackNoise: 0.2,
    inharmonicity: 5e-5,
    pluckPosition: 0.12 + 0.12 * rand(),
    ...(style === 'clean' ? {} : { highpassHz: 180, highpassOrder: 2 }),
  });
  if (style !== 'clean') x = addNoise(x, 25, seed);
  return x.subarray(0, Math.round(0.37 * sr));
}

const table: string[] = [];
afterAll(() => {
  process.stdout.write(
    `\nChord recognition (20 chords x 4 takes x 2 sample rates per row; each scored against all 20)\n${'condition'.padEnd(22)} ${'top-1'.padStart(9)} ${'min score'.padStart(9)} ${'min margin'.padStart(10)} ${'bass ok'.padStart(9)} ${'false "missing"'.padStart(16)}\n${'-'.repeat(80)}\n${table.join('\n')}\n\n`,
  );
});

describe('chroma + chord matcher: common chords', () => {
  for (const style of STYLES) {
    it(`names all 20 chords correctly: ${style}`, () => {
      let right = 0;
      let total = 0;
      let bassOk = 0;
      let falseMissing = 0;
      let minScore = 1;
      let minMargin = 1;
      const wrong: string[] = [];
      for (const sr of [44100, 48000]) {
        for (let seed = 1; seed <= 4; seed++) {
          NAMES.forEach((name, i) => {
            const frame = computeChroma(strummed(VOICINGS[name], sr, seed * 100 + i, style), sr);
            const ranked = rankChords(frame, SPECS);
            const own = ranked.find((m) => m.chord.name === name)!;
            const rival = ranked.find((m) => m.chord.name !== name)!;
            total++;
            minScore = Math.min(minScore, own.score);
            minMargin = Math.min(minMargin, own.score - rival.score);
            if (frame.bass === VOICINGS[name][0] % 12) bassOk++;
            if (own.missing.length) falseMissing++;
            if (ranked[0].chord.name === name && own.score >= 0.6) right++;
            else wrong.push(`${name} -> ${ranked[0].chord.name}`);
            expect(own.extra, `${name}: wrong notes reported`).toEqual([]);
          });
        }
      }
      table.push(
        `${style.padEnd(22)} ${`${right}/${total}`.padStart(9)} ${minScore.toFixed(2).padStart(9)} ${minMargin.toFixed(2).padStart(10)} ${`${bassOk}/${total}`.padStart(9)} ${String(falseMissing).padStart(16)}`,
      );
      expect(wrong, 'misnamed chords').toEqual([]);
      expect(bassOk / total).toBeGreaterThan(0.9);
      expect(falseMissing / total).toBeLessThan(0.03);
    }, 60_000);
  }

  it('tells the easily confused pairs apart, both ways, with room to spare', () => {
    const pairs: Array<[string, string]> = [
      ['C', 'Am'],
      ['G', 'Em'],
      ['D', 'Dsus4'],
      ['E', 'Em'],
      ['A', 'Am'],
      ['D', 'Dm'],
      ['A', 'Asus4'],
      ['F', 'Dm'],
    ];
    for (const [a, b] of pairs) {
      for (const [played, other] of [[a, b], [b, a]]) {
        for (const style of STYLES) {
          for (let seed = 1; seed <= 3; seed++) {
            const frame = computeChroma(strummed(VOICINGS[played], 44100, seed, style), 44100);
            const own = matchChord(frame, spec(played));
            const rival = matchChord(frame, spec(other));
            const label = `${played} played, ${style}, take ${seed}`;
            expect(own.score, label).toBeGreaterThan(0.6);
            expect(own.score - rival.score, `${label}: margin over ${other}`).toBeGreaterThan(0.15);
            expect(rival.score, `${label}: ${other} must not pass`).toBeLessThan(0.6);
          }
        }
      }
    }
  });

  it('separates a triad from its seventh chord (the hardest case), with a small margin', () => {
    const pairs: Array<[string, string]> = [['C', 'Cmaj7'], ['A', 'A7'], ['E', 'E7'], ['G', 'G7'], ['Am', 'Am7']];
    let right = 0;
    let total = 0;
    for (const [triad, seventh] of pairs) {
      for (const played of [triad, seventh]) {
        for (let seed = 1; seed <= 4; seed++) {
          const frame = computeChroma(strummed(VOICINGS[played], 44100, seed, 'clean'), 44100);
          const best = rankChords(frame, [spec(triad), spec(seventh)])[0];
          total++;
          if (best.chord.name === played) right++;
        }
      }
    }
    table.push(`triad vs its own 7th   ${`${right}/${total}`.padStart(9)}   (C/Cmaj7, A/A7, E/E7, G/G7, Am/Am7; two candidates each, clean)`);
    expect(right / total).toBeGreaterThan(0.9);
  });
});

describe('chord matcher: what is missing, what is wrong', () => {
  const analyse = (midis: number[]) => computeChroma(strummed(midis, 44100, 3, 'clean'), 44100);

  it('reports a muted chord tone as missing', () => {
    // G major with the B strings muted: only G and D sound.
    const m = matchChord(analyse([43, 50, 55, 67]), spec('G'));
    expect(m.missing).toEqual([PC.B]);
    expect(m.present).toEqual([PC.D, PC.G]);
    expect(m.extra).toEqual([]);
    expect(m.coverage).toBeCloseTo(2 / 3, 5);
    expect(m.score).toBeLessThan(0.6);
  });

  it('does not pass a four-note chord that is missing one of its tones (the fifth may go)', () => {
    // G7 320001 with the F on string 1 not sounding is a G major chord: three of four tones used
    // to be enough to pass.
    const noF = analyse([43, 47, 50, 55, 59]);
    expect(matchChord(noF, spec('G7')).score).toBeLessThan(0.4);
    expect(matchChord(noF, spec('G7')).missing).toEqual([PC.F]);
    expect(matchChord(noF, { ...spec('G7'), required: [] }).score, 'the old, lenient grading').toBeGreaterThan(0.6);
    // Without its fifth (D) it is still a G7, as guitarists often play it.
    expect(matchChord(analyse([43, 47, 55, 59, 65]), spec('G7')).score).toBeGreaterThan(0.6);
    expect(requiredTones(spec('G7'))).toEqual([PC.F, PC.G, PC.B]);
    expect(requiredTones({ pcs: [0, 4, 7] })).toEqual([0, 4, 7]);
    expect(requiredTones({ pcs: [0, 4, 7], required: [16] })).toEqual([4]);

    // Every four-note shape of the test set, every take: whole, it passes; with one of its tones
    // (not the bass, not the fifth) silent, it does not.
    let whole = 0;
    let wholePass = 0;
    let gapped = 0;
    let gappedPass = 0;
    let gappedLenient = 0;
    for (const name of NAMES.filter((n) => spec(n).pcs.length >= 4)) {
      const s = spec(name);
      for (const style of STYLES) {
        for (let seed = 1; seed <= 4; seed++) {
          whole++;
          if (matchChord(computeChroma(strummed(VOICINGS[name], 44100, seed, style), 44100), s).score >= 0.6) wholePass++;
          for (const pc of requiredTones(s)) {
            if (pc === s.bass) continue;
            const frame = computeChroma(strummed(VOICINGS[name].filter((m) => m % 12 !== pc), 44100, seed, style), 44100);
            gapped++;
            if (matchChord(frame, s).score >= 0.6) gappedPass++;
            if (matchChord(frame, { ...s, required: [] }).score >= 0.6) gappedLenient++;
          }
        }
      }
    }
    table.push(`4-note chords, a tone silent  ${`${gappedPass}/${gapped}`.padStart(7)} pass (all tones required; ${gappedLenient} before), whole: ${wholePass}/${whole} pass`);
    expect(wholePass).toBe(whole);
    expect(gappedPass / gapped).toBeLessThan(0.05);
    expect(gappedLenient / gapped, 'the lenient grading this replaces').toBeGreaterThan(0.5);
  }, 60_000);

  it('reports a wrong note as extra', () => {
    // C major with the open A string hit as well.
    const m = matchChord(analyse([45, 48, 52, 55, 60, 64]), spec('C'));
    expect(m.extra).toEqual([PC.A]);
    expect(m.missing).toEqual([]);
    expect(m.bassOk).toBe(false);
    expect(m.score).toBeLessThan(0.6);
  });

  it('reports both when a finger is on the wrong fret', () => {
    // Asked for D, played Dsus4: the F sharp is missing and there is a G instead.
    const d = matchChord(analyse(VOICINGS.Dsus4), spec('D'));
    expect(d.missing).toEqual([PC['F#']]);
    expect(d.extra).toEqual([PC.G]);
    // Asked for E, played E minor: G sharp missing, G sounding.
    const e = matchChord(analyse(VOICINGS.Em), spec('E'));
    expect(e.missing).toEqual([PC['G#']]);
    expect(e.extra).toEqual([PC.G]);
    expect(e.bassOk).toBe(true);
  });

  it('scores on bare chroma arrays, ranks candidates and averages frames', () => {
    const cMajor = [1, 0, 0, 0, 0.8, 0, 0, 0.7, 0, 0, 0, 0];
    const m = matchChord(cMajor, { pcs: [0, 4, 7] });
    expect(m.score).toBeGreaterThan(0.95);
    expect(m.purity).toBe(1);
    expect(m.bassOk).toBeNull();
    const ranked = rankChords(cMajor, [spec('Am'), spec('C'), spec('G')]);
    expect(ranked.map((r) => r.chord.name)).toEqual(['C', 'Am', 'G']);
    expect(matchChord(new Array(12).fill(0), spec('C')).score).toBe(0);
    expect(matchChord(cMajor, { pcs: [] }).score).toBe(0);
    expect(matchChord(cMajor, { pcs: [12, 16, 19] }).score).toBe(m.score);
    expect(pitchClassesOf([64, 52, 40, 43, -1])).toEqual([4, 7, 11]);
    const avg = averageChroma([cMajor, [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]]);
    expect(avg[4]).toBe(1);
    expect(avg[0]).toBeCloseTo(1 / 1.8, 5);
  });
});

describe('chroma extractor', () => {
  it('returns an empty frame for silence, for too little audio and for noise below the peak floor', () => {
    const quiet = computeChroma(silence(0.5, 44100), 44100);
    expect(quiet.chroma).toEqual(new Array(12).fill(0));
    expect(quiet.bass).toBe(-1);
    expect(quiet.levelDb).toBe(-120);
    expect(computeChroma(new Float32Array(500), 44100).chroma.every((v) => v === 0)).toBe(true);
    // Noise has no partials standing clear of its own floor, so it must not look like a rich chord.
    const noise = computeChroma(whiteNoise(22050, 0.1, 2), 44100);
    expect(noise.chroma.filter((v) => v > 0.5).length).toBeLessThanOrEqual(3);
  });

  it('puts a single note on its own pitch class, not on its overtones', () => {
    for (const midi of [40, 45, 52, 57, 64, 69, 76]) {
      const x = pluckedString({ freq: midiToFreq(midi), sampleRate: 44100, duration: 0.35, attackNoise: 0.2 });
      const f = computeChroma(x, 44100);
      const pc = midi % 12;
      expect(f.chroma[pc], `midi ${midi}`).toBe(1);
      f.chroma.forEach((v, i) => {
        if (i !== pc) expect(v, `midi ${midi}: pitch class ${i}`).toBeLessThan(0.3);
      });
      expect(f.bass).toBe(pc);
      expect(f.notes[midi - f.minMidi]).toBeGreaterThan(0.5);
    }
  });

  it('follows the tuning reference', () => {
    // A guitar tuned a semitone low (A4 = 415.3 Hz) playing an E-shape chord sounds E flat major...
    const flat = VOICINGS.E.map((m) => m - 1);
    const x = strummed(flat, 44100, 2, 'clean');
    const eb: ChordSpec = { name: 'Eb', pcs: pitchClassesOf(flat) };
    const at440 = computeChroma(x, 44100);
    expect(matchChord(at440, eb).score).toBeGreaterThan(0.6);
    expect(matchChord(at440, spec('E')).score).toBeLessThan(0.3);
    // ...but against its own reference it is the E major the player fingered.
    const at415 = computeChroma(x, 44100, { a4: 415.3 });
    expect(matchChord(at415, spec('E')).score).toBeGreaterThan(0.6);
  });

  it('can be reused across frames and sample rates', () => {
    for (const sr of [22050, 44100, 96000]) {
      const ex = new ChromaExtractor({ sampleRate: sr });
      expect(ex.windowSize / sr).toBeGreaterThan(0.13);
      expect(ex.windowSize / sr).toBeLessThan(0.4);
      const g = rankChords(ex.analyze(strummed(VOICINGS.G, sr, 1, 'clean')), SPECS)[0];
      const am = rankChords(ex.analyze(strummed(VOICINGS.Am, sr, 1, 'clean')), SPECS)[0];
      expect([g.chord.name, am.chord.name], `sr ${sr}`).toEqual(['G', 'Am']);
    }
  });

  it('streams chroma frames from the engine, and they follow a chord change', () => {
    const sr = 44100;
    const part = (name: string, seed: number): Float32Array =>
      strum({ freqs: VOICINGS[name].map((m) => midiToFreq(m)), sampleRate: sr, duration: 0.9, strumMs: 10, seed, attackNoise: 0.2, decay: 4 });
    let x = silence(2.4, sr);
    x = mix(x, part('G', 1), Math.round(0.3 * sr)).subarray(0, x.length);
    x = mix(x, part('D', 2), Math.round(1.3 * sr)).subarray(0, x.length);
    const events = analyze(x, sr, { chroma: true });
    const frames = events.filter((e) => e.type === 'chroma');
    expect(frames.length).toBeGreaterThan(40);
    expect(frames.length).toBeLessThan(56);
    const nameAt = (t: number): string => {
      const f = frames.filter((e) => e.type === 'chroma' && e.time >= t)[0];
      if (f.type !== 'chroma') throw new Error('no frame');
      return rankChords(f.chroma, [spec('G'), spec('D'), spec('C'), spec('Em')])[0].chord.name ?? '';
    };
    expect(nameAt(0.65)).toBe('G');
    expect(nameAt(1.7)).toBe('D');
    // Before anything is played the frames are empty rather than amplified noise.
    const first = frames[0];
    if (first.type === 'chroma') expect(first.chroma.every((v) => v === 0)).toBe(true);
    // Without the option no chroma work is done at all.
    expect(analyze(x, sr).some((e) => e.type === 'chroma')).toBe(false);
  });
});
