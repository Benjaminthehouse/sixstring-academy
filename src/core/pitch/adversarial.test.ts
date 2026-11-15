/**
 * Adversarial corpus for the claim "the tuner works on a real guitar through a laptop or phone
 * microphone". Independent of the signals the detector was developed against: every note comes
 * from the audio engine's waveguide guitar (all six strings, frets 0 to 20, four tones, three
 * dynamics, 44.1 and 48 kHz) and is then degraded the way small microphones, rooms and cheap
 * converters degrade it. Playing techniques, false detections, the tuner's own behaviour and
 * response times are measured as well. Everything runs through the same `PitchEngine` as the live
 * microphone pipeline; a report is printed at the end.
 *
 *   npx vitest run src/core/pitch/adversarial.test.ts
 *       standard run, about a minute: every position clean at both sample rates; each family of
 *       degradations on every second position (every string, alternating frets, the other half in
 *       the next family), its severities taking turns
 *   PITCH_CORPUS=full npx vitest run src/core/pitch/adversarial.test.ts
 *       every position x every degradation x every severity, and the long versions of the other
 *       sections (several minutes); this is the run API.md quotes
 *
 * The limits asserted here are what the module promises (API.md quotes the full-corpus numbers).
 * A note is scored while it is the loudest thing in the signal: where a ringing string or a hum
 * is involved, scoring stops when the note has decayed to within 6 dB of it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { measureFundamental } from '@/core/audio';
import type { SequenceNote, StringInstrument, ToneName } from '@/core/audio';
import { midiToFreq } from '@/core/math/pitch-math';
import {
  LEAD_S,
  OPEN_MIDI,
  REPORT_HEADER,
  type HandlingKind,
  type NoteSpec,
  type Scene,
  type Tally,
  type TallySummary,
  addDc,
  addScore,
  background,
  clearNoteCache,
  dropouts,
  earlyReflections,
  freqOfSpec,
  handlingNoise,
  hardClip,
  legatoJoin,
  mapScene,
  micHighpass,
  midiAt,
  midiOfSpec,
  mixInto,
  newTally,
  noteLevel,
  pitchWarp,
  quantile,
  quietInput,
  renderNote,
  renderNotes,
  reportRow,
  rms,
  scoreScene,
  singleNoteScene,
  stiffString,
  summarize,
  withInterference,
} from './adversarial-kit';
import { analyze } from './engine';
import { Tuner, attachTuner, type TunerState } from './tuner';
import { EventHub, type NoteOnEvent, type PitchEvent } from './types';

const FULL = process.env.PITCH_CORPUS === 'full';
const SLOW = 900_000;
/** A note is scored while it is this many dB louder than a hum or another string. */
const MARGIN_DB = 6;
/** Seconds of each corpus note that are analysed. */
const NOTE_S = 0.7;
const RATES = [48000, 44100];
const TONES: ToneName[] = ['steel', 'nylon', 'clean', 'driven'];
const VELOCITIES = [0.35, 0.65, 0.95];

const report: string[] = [];
const gain = (db: number): number => Math.pow(10, db / 20);

afterAll(() => {
  process.stdout.write(`\nAdversarial pitch corpus (${FULL ? 'full' : 'standard'} run)\n${report.join('\n')}\n\n`);
});

// ---------------------------------------------------------------------------------------------
// The fretboard
// ---------------------------------------------------------------------------------------------

interface Position {
  string: number;
  fret: number;
  index: number;
}

const POSITIONS: Position[] = [];
for (let string = 6; string >= 1; string--) {
  for (let fret = 0; fret <= 20; fret++) POSITIONS.push({ string, fret, index: POSITIONS.length });
}

/** Tone, dynamic, detuning and sample rate rotate over the neck so every combination occurs. */
function specAt(p: Position, sampleRate: number = RATES[p.index % 2]): NoteSpec {
  return {
    string: p.string,
    fret: p.fret,
    tone: TONES[p.index % 4],
    velocity: VELOCITIES[(p.index >> 2) % 3],
    cents: ((p.string * 7 + p.fret * 13) % 41) - 20,
    sampleRate,
  };
}

function baseScene(spec: NoteSpec): Scene {
  return singleNoteScene(renderNote(spec, NOTE_S + 0.2), spec.sampleRate, midiOfSpec(spec), freqOfSpec(spec), NOTE_S);
}

// ---------------------------------------------------------------------------------------------
// Degradations
// ---------------------------------------------------------------------------------------------

type Degrade = (scene: Scene, spec: NoteSpec, seed: number) => Scene | null;

const noise =
  (kind: 'white' | 'pink', snrDb: number): Degrade =>
  (scene, _spec, seed) =>
    mapScene(scene, (x, sr) => mixInto(x, background(kind, sr, x.length, seed), noteLevel(scene) * gain(-snrDb)));

/** Hum is there before the note and after it; the note is scored while it is louder. */
const hum =
  (base: 50 | 60, relDb: number): Degrade =>
  (scene, _spec, seed) => {
    const h = background(base === 50 ? 'hum50' : 'hum60', scene.sampleRate, scene.samples.length, seed);
    const k = noteLevel(scene) * gain(relDb);
    return withInterference(scene, h.map((v) => v * k), MARGIN_DB);
  };

/** The sustain of another note (plucked half a second before the scene starts), scaled to `relDb` below the note. */
function ringTail(spec: NoteSpec, string: number, fret: number, cents: number, level: number, length: number): Float32Array {
  const other = renderNote({ string, fret, tone: spec.tone, velocity: 0.7, cents, sampleRate: spec.sampleRate }, 2);
  const tail = other.subarray(Math.round(0.5 * spec.sampleRate));
  const k = level / (rms(tail, 0, 0.3 * spec.sampleRate) || 1);
  const out = new Float32Array(length);
  for (let i = 0; i < length && i < tail.length; i++) out[i] = tail[i] * k;
  return out;
}

/** Neighbouring open strings left ringing, a few cents out of tune. */
const ringing =
  (count: 1 | 2, relDb: number): Degrade =>
  (scene, spec) => {
    const mine = 6 - spec.string;
    const sum = new Float32Array(scene.samples.length);
    for (let c = 0; c < count; c++) {
      let other = (mine + (c === 0 ? 1 : -1) + 6) % 6;
      if (other === mine) other = (mine + 2) % 6;
      const tail = ringTail(spec, 6 - other, 0, c === 0 ? 4 : -6, noteLevel(scene) * gain(relDb), sum.length);
      for (let i = 0; i < sum.length; i++) sum[i] += tail[i];
    }
    return withInterference(scene, sum, MARGIN_DB);
  };

/** The note an octave or a twelfth lower, ringing on another string: every partial of the played note hides in it. */
const lowerNote =
  (semitones: 12 | 19, relDb: number): Degrade =>
  (scene, spec) => {
    const midi = midiOfSpec(spec) - semitones;
    if (midi < OPEN_MIDI[0]) return null;
    let string = 6;
    while (string > 1 && OPEN_MIDI[6 - (string - 1)] <= midi) string--;
    if (string === spec.string) string = Math.min(6, string + 1);
    const fret = midi - midiAt(string, 0);
    if (fret < 0 || fret > 20 || string === spec.string) return null;
    return withInterference(scene, ringTail(spec, string, fret, 3, noteLevel(scene) * gain(relDb), scene.samples.length), MARGIN_DB);
  };

const laptop: Degrade = (scene, spec, seed) => {
  const withRing = ringing(1, -18)(scene, spec, seed);
  if (!withRing) return null;
  const mic = mapScene(withRing, (x, sr) => micHighpass(earlyReflections(x, sr), sr, 200));
  return noise('pink', 20)(mic, spec, seed);
};

const phone: Degrade = (scene, spec, seed) => {
  const mic = mapScene(scene, (x, sr) => micHighpass(x, sr, 300));
  const noisy = noise('white', 20)(mic, spec, seed);
  return noisy && mapScene(noisy, (x) => hardClip(x, 4));
};

/** What a row of the report has to achieve. */
interface Limits {
  /** Notes found, percent (at least). */
  found: number;
  /** Note-ons naming another note, per 100 notes (at most). */
  wrong: number;
  /** Readings more than 50 cents off, percent (at most). */
  gross: number;
  /** Median and 95th percentile of the error of the remaining readings, cents (at most). */
  median: number;
  p95: number;
  /** 95th percentile of the note-on latency in ms (at most). */
  latency: number;
}

const STRICT: Limits = { found: 100, wrong: 0, gross: 0, median: 0.15, p95: 1, latency: 80 };
const NOISY: Limits = { found: 100, wrong: 1, gross: 0.1, median: 0.5, p95: 4, latency: 80 };
const SHARED: Limits = { found: 100, wrong: 1, gross: 0.2, median: 0.5, p95: 2.5, latency: 80 };
const HARSH: Limits = { found: 97, wrong: 2.5, gross: 2.5, median: 0.5, p95: 2.5, latency: 90 };

interface Condition {
  name: string;
  /** Conditions of one family share the neck in the standard run: each position gets one of them. */
  family: string;
  apply: Degrade;
  limits: Limits;
  /** No note-on may appear outside the played note (a hum must never become a note). */
  noStrays?: boolean;
}

const CONDITIONS: Condition[] = [
  { name: 'clean, 48 kHz', family: 'clean 48k', apply: (s) => s, limits: STRICT },
  { name: 'clean, 44.1 kHz', family: 'clean 44.1k', apply: (s) => s, limits: STRICT },
  { name: 'small mic: high-pass 120 Hz', family: 'small mic', apply: (s) => mapScene(s, (x, sr) => micHighpass(x, sr, 120)), limits: STRICT },
  { name: 'small mic: high-pass 200 Hz', family: 'small mic', apply: (s) => mapScene(s, (x, sr) => micHighpass(x, sr, 200)), limits: STRICT },
  { name: 'small mic: high-pass 300 Hz', family: 'small mic', apply: (s) => mapScene(s, (x, sr) => micHighpass(x, sr, 300)), limits: STRICT },
  { name: 'white noise, 30 dB SNR', family: 'white noise', apply: noise('white', 30), limits: STRICT },
  { name: 'white noise, 20 dB SNR', family: 'white noise', apply: noise('white', 20), limits: { ...STRICT, median: 0.2, p95: 1.5 } },
  { name: 'white noise, 10 dB SNR', family: 'white noise', apply: noise('white', 10), limits: NOISY },
  { name: 'pink noise, 30 dB SNR', family: 'pink noise', apply: noise('pink', 30), limits: STRICT },
  { name: 'pink noise, 20 dB SNR', family: 'pink noise', apply: noise('pink', 20), limits: { ...NOISY, wrong: 0, gross: 0, p95: 1.5 } },
  { name: 'pink noise, 10 dB SNR', family: 'pink noise', apply: noise('pink', 10), limits: NOISY },
  { name: 'hum 50 Hz + harmonics, 20 dB below the note', family: 'hum', apply: hum(50, -20), limits: { ...STRICT, median: 0.2, p95: 1.5 }, noStrays: true },
  { name: 'hum 50 Hz + harmonics, 10 dB below', family: 'hum', apply: hum(50, -10), limits: SHARED, noStrays: true },
  { name: 'hum 60 Hz + harmonics, 20 dB below the note', family: 'hum', apply: hum(60, -20), limits: { ...STRICT, median: 0.2, p95: 1.5 }, noStrays: true },
  { name: 'hum 60 Hz + harmonics, 10 dB below', family: 'hum', apply: hum(60, -10), limits: SHARED, noStrays: true },
  { name: 'one other string ringing, 12 dB below', family: 'ringing strings', apply: ringing(1, -12), limits: SHARED },
  { name: 'two other strings ringing, 18 dB below', family: 'ringing strings', apply: ringing(2, -18), limits: SHARED },
  { name: 'two other strings ringing, 12 dB below', family: 'ringing strings', apply: ringing(2, -12), limits: SHARED },
  { name: 'octave below ringing, 18 dB below', family: 'ringing strings', apply: lowerNote(12, -18), limits: SHARED },
  { name: 'octave below ringing, 12 dB below', family: 'ringing strings', apply: lowerNote(12, -12), limits: SHARED },
  { name: 'twelfth below ringing, 12 dB below', family: 'ringing strings', apply: lowerNote(19, -12), limits: SHARED },
  { name: 'early reflections (desk and wall)', family: 'room', apply: (s) => mapScene(s, (x, sr) => earlyReflections(x, sr)), limits: { ...STRICT, median: 0.2, p95: 1.5 } },
  { name: 'early reflections, 1.6x as strong', family: 'room', apply: (s) => mapScene(s, (x, sr) => earlyReflections(x, sr, 1.6)), limits: HARSH },
  { name: 'clipping, peaks 6 dB over full scale', family: 'converter', apply: (s) => mapScene(s, (x) => hardClip(x, 6)), limits: STRICT },
  { name: 'clipping, peaks 12 dB over full scale', family: 'converter', apply: (s) => mapScene(s, (x) => hardClip(x, 12)), limits: { ...STRICT, p95: 1.5 } },
  { name: 'DC offset 0.1', family: 'converter', apply: (s) => mapScene(s, (x) => addDc(x, 0.1)), limits: STRICT },
  { name: 'quiet input, 30 dB down (16 bit)', family: 'level', apply: (s) => mapScene(s, (x) => quietInput(x, -30)), limits: STRICT },
  // Loudest pluck at -55 dBFS, softest at -72: the soft ones are below the gate (-68 dBFS) by design.
  { name: 'very quiet input, 40 dB down (16 bit)', family: 'too quiet', apply: (s) => mapScene(s, (x) => quietInput(x, -40)), limits: { ...STRICT, found: 60 } },
  {
    name: 'dropouts: three 10 ms gaps',
    family: 'level',
    apply: (s, _spec, seed) => mapScene(s, (x, sr) => dropouts(x, sr, { count: 3, ms: 10, from: LEAD_S + 0.15, to: LEAD_S + NOTE_S - 0.1, seed })),
    limits: { ...STRICT, p95: 1.5 },
  },
  {
    name: 'dropouts: two 25 ms gaps',
    family: 'level',
    apply: (s, _spec, seed) => mapScene(s, (x, sr) => dropouts(x, sr, { count: 2, ms: 25, from: LEAD_S + 0.15, to: LEAD_S + NOTE_S - 0.1, seed })),
    limits: { ...STRICT, p95: 1.5 },
  },
  { name: 'laptop: HP 200, reflections, pink 20 dB, string ringing', family: 'laptop', apply: laptop, limits: HARSH },
  { name: 'phone: HP 300, white 20 dB, clipping', family: 'phone', apply: phone, limits: { ...NOISY, wrong: 0, gross: 0, p95: 1.5 } },
];

function expectWithin(s: TallySummary, l: Limits, t: Tally): void {
  const ctx = `${s.name} (${s.notes} notes)\n  ${t.failures.join('\n  ')}`;
  expect(s.detectedPct, `found: ${ctx}`).toBeGreaterThanOrEqual(l.found);
  expect((100 * s.wrongNoteOns) / Math.max(1, s.notes), `wrong note-ons per 100: ${ctx}`).toBeLessThanOrEqual(l.wrong);
  expect(s.grossPct, `gross readings: ${ctx}`).toBeLessThanOrEqual(l.gross);
  expect(s.medianCents, `median error: ${ctx}`).toBeLessThanOrEqual(l.median);
  expect(s.p95Cents, `p95 error: ${ctx}`).toBeLessThanOrEqual(l.p95);
  expect(s.latencyP95Ms, `latency: ${ctx}`).toBeLessThanOrEqual(l.latency);
}

/** The weakest of several limits: what a family as a whole must achieve. */
function loosest(ls: Limits[]): Limits {
  return {
    found: Math.min(...ls.map((l) => l.found)),
    wrong: Math.max(...ls.map((l) => l.wrong)),
    gross: Math.max(...ls.map((l) => l.gross)),
    median: Math.max(...ls.map((l) => l.median)),
    p95: Math.max(...ls.map((l) => l.p95)),
    latency: Math.max(...ls.map((l) => l.latency)),
  };
}

// ---------------------------------------------------------------------------------------------

describe('adversarial corpus: where the truth comes from', () => {
  it('the audio engine guitar sounds at the requested pitch (independent phase measurement)', () => {
    // If the corpus were out of tune, every accuracy figure below would be meaningless.
    let worst = 0;
    for (const p of POSITIONS.filter((q) => q.index % 5 === 0)) {
      const spec = { ...specAt(p), velocity: 0.8 };
      const x = renderNote(spec, 1.2);
      const measured = measureFundamental(x, spec.sampleRate, freqOfSpec(spec), { start: Math.round(0.25 * spec.sampleRate) });
      const cents = 1200 * Math.log2(measured / freqOfSpec(spec));
      worst = Math.max(worst, Math.abs(cents));
    }
    report.push(`corpus truth: first partial of the rendered notes within ${worst.toFixed(2)} cents of the requested pitch (phase measurement)`);
    expect(worst).toBeLessThan(0.5);
  });
});

describe('adversarial corpus: every fret, degraded', () => {
  const latencyByString = new Map<number, number[]>();

  it(
    'finds the right note, in tune, under every degradation',
    () => {
      const families = new Map<string, Condition[]>();
      for (const c of CONDITIONS) families.set(c.family, [...(families.get(c.family) ?? []), c]);
      const rows = new Map<string, Tally>();
      const familyRows = new Map<string, Tally>();
      const skipped = new Map<string, number>();
      const strays = new Map<string, NoteOnEvent[]>();
      for (const c of CONDITIONS) rows.set(c.name, newTally(c.name));

      let familyIndex = 0;
      for (const [family, members] of families) {
        const all = newTally(family);
        familyRows.set(family, all);
        const clean = family.startsWith('clean');
        familyIndex++;
        for (const p of POSITIONS) {
          // Standard run: a degraded family takes every second position (see the file comment).
          if (!FULL && !clean && (p.index + familyIndex) % 2) continue;
          const chosen = FULL ? members : [members[(p.index >> 1) % members.length]];
          for (const c of chosen) {
            const rate = c.family === 'clean 48k' ? 48000 : c.family === 'clean 44.1k' ? 44100 : RATES[p.index % 2];
            const spec = specAt(p, rate);
            const scene = c.apply(baseScene(spec), spec, 1000 + p.index);
            if (!scene || scene.notes[0].end - scene.notes[0].start < 0.2) {
              skipped.set(c.name, (skipped.get(c.name) ?? 0) + 1);
              continue;
            }
            const res = scoreScene(scene);
            const label = `string ${p.string} fret ${p.fret} ${spec.tone} v${spec.velocity} ${rate} Hz`;
            addScore(rows.get(c.name) as Tally, res.scores[0], label);
            addScore(all, res.scores[0], `${c.name}: ${label}`);
            if (c.noStrays && res.strays.length) strays.set(c.name, [...(strays.get(c.name) ?? []), ...res.strays]);
            if (c.family.startsWith('clean') && res.scores[0].detected) {
              latencyByString.set(p.string, [...(latencyByString.get(p.string) ?? []), res.scores[0].latencyMs]);
            }
          }
        }
        // The standard run uses other positions in the next family: nothing worth keeping.
        if (!FULL) clearNoteCache();
      }

      report.push('', `Notes: 6 strings x frets 0-20, tones ${TONES.join('/')}, velocities ${VELOCITIES.join('/')}, 44.1 and 48 kHz, ${NOTE_S} s each.`);
      report.push(
        'found% = right note-on; wrong1st% = first note-on named another note; wrongOn / octOn = wrong note-ons (of which octave or twelfth);',
        'repeat = extra note-ons of the right note; med/p95/max = error of the pitch readings from 150 ms after the pluck (cents);',
        'gross% = readings more than 50 cents off; cover% = share of the note with readings; lat = note-on latency after the pluck.',
        '',
        REPORT_HEADER,
      );
      for (const c of CONDITIONS) {
        const t = rows.get(c.name) as Tally;
        const s = summarize(t);
        const skip = skipped.get(c.name);
        report.push(reportRow(s) + (skip ? `   (${skip} not applicable)` : ''));
      }

      for (const c of CONDITIONS) {
        expect(strays.get(c.name) ?? [], `note-ons outside the played note: ${c.name}`).toEqual([]);
        const t = rows.get(c.name) as Tally;
        // A row is judged on its own once it holds enough notes; the family is judged always.
        if (t.notes >= 80) expectWithin(summarize(t), c.limits, t);
      }
      for (const [family, members] of families) {
        const t = familyRows.get(family) as Tally;
        expect(t.notes, family).toBeGreaterThanOrEqual(FULL ? 100 : 40);
        expectWithin(summarize(t), loosest(members.map((m) => m.limits)), t);
      }
    },
    SLOW,
  );

  it('answers within the promised time on every string', () => {
    report.push('', 'Note-on latency after the pluck, clean notes (analysis only; add the input latency of the device):');
    for (let string = 6; string >= 1; string--) {
      const v = latencyByString.get(string) ?? [];
      report.push(`  string ${string}: median ${quantile(v, 0.5).toFixed(0)} ms, p95 ${quantile(v, 0.95).toFixed(0)} ms, max ${Math.max(...v).toFixed(0)} ms (${v.length} notes)`);
      expect(v.length, `string ${string}`).toBeGreaterThan(30);
      expect(quantile(v, 0.5), `string ${string} median`).toBeLessThanOrEqual(string >= 5 ? 60 : 50);
      expect(Math.max(...v), `string ${string} max`).toBeLessThanOrEqual(90);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Playing techniques
// ---------------------------------------------------------------------------------------------

describe('adversarial corpus: playing techniques', () => {
  const rows: string[] = [];
  const notes: string[] = [];
  const push = (t: Tally): TallySummary => {
    const s = summarize(t);
    rows.push(reportRow(s));
    return s;
  };

  afterAll(() => {
    report.push('', 'Playing techniques', REPORT_HEADER, ...rows, ...notes);
  });

  it(
    'reads natural harmonics at the 12th, 7th and 5th fret',
    () => {
      for (const [name, semitones, ratio] of [['12th', 12, 2], ['7th', 19, 3], ['5th', 24, 4]] as const) {
        const t = newTally(`natural harmonic, ${name} fret`);
        let i = 0;
        for (let string = 6; string >= 1; string--) {
          for (const baseTone of ['steel', 'nylon', 'clean'] as StringInstrument[]) {
            const sampleRate = RATES[i % 2];
            i++;
            // A harmonic sounds at an exact multiple of the open string, not at the tempered fret.
            const cents = 1200 * Math.log2(ratio) - semitones * 100 + ((i * 7) % 11) - 5;
            const spec: NoteSpec = { string, fret: 0, midi: midiAt(string, 0) + semitones, tone: 'harmonic', baseTone, velocity: 0.7, cents, sampleRate };
            const scene = singleNoteScene(renderNote(spec, 1), sampleRate, midiOfSpec(spec), freqOfSpec(spec), NOTE_S);
            addScore(t, scoreScene(scene).scores[0], `string ${string} ${baseTone} ${sampleRate}`);
          }
        }
        expectWithin(push(t), STRICT, t);
      }
    },
    SLOW,
  );

  it(
    'names palm-muted and staccato notes before they are gone',
    () => {
      const muted = newTally('palm-muted (strings 6-3, frets 0-9)');
      let i = 0;
      for (let string = 6; string >= 3; string--) {
        for (let fret = 0; fret <= 9; fret++) {
          const sampleRate = RATES[i % 2];
          const baseTone = (['steel', 'clean', 'driven'] as StringInstrument[])[i % 3];
          i++;
          const spec: NoteSpec = { string, fret, tone: 'muted', baseTone, velocity: 0.8, cents: ((i * 5) % 17) - 8, sampleRate };
          const scene = singleNoteScene(renderNote(spec, 0.6), sampleRate, midiOfSpec(spec), freqOfSpec(spec), 0.45);
          addScore(muted, scoreScene(scene, { settleMs: 60, untilMs: 200 }).scores[0], `string ${string} fret ${fret} ${baseTone} ${sampleRate}`);
        }
      }
      // A damped string really is a little sharp and its pitch is short-lived: the note name is what matters.
      expectWithin(push(muted), { ...STRICT, median: 0.5, p95: 6 }, muted);

      for (const ms of [50, 80, 120]) {
        const t = newTally(`staccato, stopped after ${ms} ms`);
        let k = 0;
        for (let string = 6; string >= 1; string--) {
          for (let fret = 0; fret <= 20; fret += FULL ? 1 : 2) {
            const sampleRate = RATES[k % 2];
            const tone = TONES[k % 4];
            k++;
            const spec: NoteSpec = { string, fret, tone, velocity: 0.8, cents: ((k * 5) % 17) - 8, sampleRate, duration: ms / 1000 };
            const scene = singleNoteScene(renderNote(spec, 0.6), sampleRate, midiOfSpec(spec), freqOfSpec(spec), 0.4);
            addScore(t, scoreScene(scene, { settleMs: 40, untilMs: ms }).scores[0], `string ${string} fret ${fret} ${tone} ${sampleRate}`);
          }
        }
        expectWithin(push(t), { ...STRICT, median: 0.5, p95: 8, latency: 90 }, t);
      }
    },
    SLOW,
  );

  it(
    'follows vibrato as one note and a bend through its passing notes',
    () => {
      for (const [depth, rate] of [[20, 5.5], [35, 6.5]] as const) {
        const t = newTally(`vibrato +/-${depth} cents at ${rate} Hz`);
        const lags: number[] = [];
        let i = 0;
        for (let string = 6; string >= 1; string--) {
          for (let fret = 2; fret <= 17; fret += FULL ? 3 : 6) {
            const sampleRate = RATES[i % 2];
            const tone = TONES[i % 4];
            i++;
            const spec: NoteSpec = { string, fret, tone, velocity: 0.8, cents: 0, sampleRate };
            const f0 = freqOfSpec(spec);
            const centsAt = (time: number): number => (time < 0.25 ? 0 : depth * Math.sin(2 * Math.PI * rate * (time - 0.25)));
            const scene = singleNoteScene(pitchWarp(renderNote(spec, 2), sampleRate, 1.4, centsAt), sampleRate, midiOfSpec(spec), f0, 1.3);
            // The reading trails the string by the analysis window and the median filter: find that
            // lag (it is reported), then score the readings against the truth shifted by it.
            let best: { median: number; lag: number; score: ReturnType<typeof scoreScene>['scores'][number] } | null = null;
            const events = analyze(scene.samples, sampleRate);
            for (let lag = 0; lag <= 0.08; lag += 0.005) {
              scene.notes[0].freq = (time: number): number => f0 * Math.pow(2, centsAt(time - LEAD_S - lag) / 1200);
              const score = scoreEvents(scene, events, 300);
              const median = quantile(score.errors, 0.5);
              if (!best || median < best.median) best = { median, lag, score };
            }
            if (!best) continue;
            lags.push(best.lag * 1000);
            addScore(t, best.score, `string ${string} fret ${fret} ${tone} ${sampleRate}`);
          }
        }
        const s = push(t);
        notes.push(`  ${t.name}: readings trail the string by ${quantile(lags, 0.5).toFixed(0)} ms (median); the errors above are after allowing for that lag`);
        // One note throughout, never a neighbour; the wobble itself is followed to within a few cents.
        expect(s.detectedPct).toBe(100);
        expect(s.wrongNoteOns, t.failures.join('\n')).toBe(0);
        expect(s.repeats).toBe(0);
        expect(s.grossPct).toBe(0);
        expect(s.medianCents).toBeLessThan(depth * 0.25);
        expect(quantile(lags, 0.5)).toBeLessThanOrEqual(75);
      }

      for (const [semitones, up] of [[1, 0.35], [2, 0.5]] as const) {
        const t = newTally(`bend +${semitones} semitone${semitones > 1 ? 's' : ''} in ${up * 1000} ms, hold, release`);
        let i = 0;
        let exact = 0;
        let total = 0;
        for (let string = 4; string >= 1; string--) {
          for (let fret = 5; fret <= 15; fret += FULL ? 2 : 4) {
            const sampleRate = RATES[i % 2];
            const tone = (['steel', 'clean', 'driven'] as ToneName[])[i % 3];
            i++;
            const spec: NoteSpec = { string, fret, tone, velocity: 0.85, cents: 0, sampleRate };
            const f0 = freqOfSpec(spec);
            const m0 = midiOfSpec(spec);
            const t0 = 0.25;
            const hold = 0.35;
            const centsAt = (time: number): number => {
              if (time < t0) return 0;
              if (time < t0 + up) return 100 * semitones * (0.5 - 0.5 * Math.cos((Math.PI * (time - t0)) / up));
              if (time < t0 + up + hold) return 100 * semitones;
              if (time < t0 + 2 * up + hold) return 100 * semitones * (0.5 + 0.5 * Math.cos((Math.PI * (time - t0 - up - hold)) / up));
              return 0;
            };
            const seconds = t0 + 2 * up + hold + 0.25;
            const scene = singleNoteScene(pitchWarp(renderNote(spec, 3.2), sampleRate, seconds, centsAt), sampleRate, m0, f0, seconds);
            scene.notes[0].freq = (time: number): number => f0 * Math.pow(2, centsAt(time - LEAD_S - 0.03) / 1200);
            const res = scoreScene(scene);
            const sequence = res.events.filter((e): e is PitchEvent & { type: 'noteon' } => e.type === 'noteon').map((e) => e.midi - m0);
            total++;
            if (sequence.join() === (semitones === 1 ? '0,1,0' : '0,1,2,1,0')) exact++;
            const score = res.scores[0];
            // Passing notes are expected; only a note outside the bend's range is wrong.
            score.wrongNoteOns = sequence.filter((d) => d < 0 || d > semitones).length;
            score.octaveNoteOns = 0;
            score.repeats = 0;
            addScore(t, score, `string ${string} fret ${fret} ${tone} ${sampleRate}: ${sequence.join(',')}`);
          }
        }
        const s = push(t);
        notes.push(`  ${t.name}: note-ons exactly up and down the semitones in ${exact} of ${total} bends (errors are against the truth 30 ms earlier)`);
        expect(s.detectedPct).toBe(100);
        expect(s.wrongNoteOns, t.failures.join('\n')).toBe(0);
        expect(s.grossPct).toBe(0);
        expect(exact / total).toBeGreaterThanOrEqual(0.9);
      }
    },
    SLOW,
  );

  it(
    'hears hammer-ons and pull-offs, with and without an audible attack',
    () => {
      const cases: Array<[string, number, number, boolean]> = [
        ['hammer-on +2, soft attack', 2, 0.6, true],
        ['hammer-on +1, no attack at all', 1, 0.6, false],
        ['hammer-on +2, no attack at all', 2, 0.6, false],
        ['pull-off -2, no attack, 6 dB quieter', -2, 0.5, false],
        ['pull-off -3, no attack, 6 dB quieter', -3, 0.5, false],
        ['hammer-on +12, no attack at all', 12, 0.6, false],
      ];
      for (const [name, interval, level, soft] of cases) {
        const t = newTally(name);
        let i = 0;
        for (let string = 6; string >= 1; string--) {
          for (let fret = 3; fret <= 15; fret += FULL ? 3 : 6) {
            if (fret + interval > 20) continue;
            const sampleRate = RATES[i % 2];
            const tone = (['steel', 'nylon', 'clean'] as ToneName[])[i % 3];
            i++;
            const first: NoteSpec = { string, fret, tone, velocity: 0.8, cents: 0, sampleRate };
            const second: NoteSpec = { ...first, fret: fret + interval };
            const at = 0.4;
            let x: Float32Array;
            if (soft) {
              const seq: SequenceNote[] = [
                { time: 0, midi: midiOfSpec(first), string, velocity: 0.8 },
                { time: at, midi: midiOfSpec(second), string, velocity: 0.4, brightness: -1 },
              ];
              x = renderNotes(seq, sampleRate, 1.2, tone);
            } else {
              // The second note continues the vibration: its own attack (40 ms) is cut away and it is faded in over 6 ms.
              x = legatoJoin(renderNote(first, 1.2), renderNote(second, 1.2).subarray(Math.round(0.04 * sampleRate)), sampleRate, at, 6, level);
            }
            const lead = Math.round(LEAD_S * sampleRate);
            const samples = new Float32Array(lead + sampleRate);
            samples.set(x.subarray(0, samples.length - lead), lead);
            const scene: Scene = {
              samples,
              sampleRate,
              notes: [
                { start: LEAD_S, end: LEAD_S + at, midi: midiOfSpec(first), freq: freqOfSpec(first) },
                { start: LEAD_S + at, end: LEAD_S + 1, midi: midiOfSpec(second), freq: freqOfSpec(second) },
              ],
            };
            const res = scoreScene(scene, { settleMs: 120 });
            addScore(t, res.scores[1], `string ${string} fret ${fret} ${tone} ${sampleRate}`);
          }
        }
        expectWithin(push(t), { ...STRICT, latency: 100 }, t);
      }
    },
    SLOW,
  );

  it(
    'keeps the pitch of stiff strings, hard plucks and missing fundamentals (drop D and drop C included)',
    () => {
      const strings: Array<[string, number, number]> = [
        ['C2 (drop C)', 36, 1.2e-4],
        ['D2 (drop D)', 38, 1.0e-4],
        ['E2', 40, 8e-5],
        ['A2', 45, 5e-5],
        ['D3', 50, 3e-5],
        ['G3 wound', 55, 2e-5],
        ['G3 plain', 55, 4e-4],
        ['B3', 59, 1.5e-4],
        ['E4', 64, 6e-5],
      ];
      const variants: Array<[string, number, object]> = [
        ['stiff string, hard pluck (15 cents sharp at first)', 0, {}],
        ['stiff string, hard pluck, mic high-pass 200 Hz', 200, {}],
        ['stiff string, hard pluck, mic high-pass 300 Hz', 300, {}],
        ['stiff string whose fundamental dies in 0.3 s', 0, { fundamentalT60: 0.3, t60: 5 }],
        ['...the same through a 200 Hz high-pass', 200, { fundamentalT60: 0.3, t60: 5 }],
      ];
      for (const [name, hp, extra] of variants) {
        const t = newTally(name);
        let i = 0;
        for (const [label, midi, B] of strings) {
          for (const cents of FULL ? [-30, -12, -3, 0, 4, 14, 35] : [-30, 4]) {
            const sampleRate = RATES[i % 2];
            i++;
            const freq = midiToFreq(midi) * Math.pow(2, cents / 1200);
            let x = stiffString({ freq, sampleRate, seconds: 1.1, B, glideCents: 15, glideMs: 60, seed: i, ...extra });
            if (hp) x = micHighpass(x, sampleRate, hp);
            const scene = singleNoteScene(x, sampleRate, midi, freq, 1);
            addScore(t, scoreScene(scene, { settleMs: 400 }).scores[0], `${label} ${cents} cents ${sampleRate}`);
          }
        }
        expectWithin(push(t), { ...STRICT, p95: 1, latency: 90 }, t);
        expect(summarize(t).maxCents, name).toBeLessThan(2);
      }
    },
    SLOW,
  );

  it(
    'names a string that is far out of tune correctly from its first note-on',
    () => {
      // The body of an acoustic guitar answers the pluck with a thump of its own; for 50 ms the two
      // low strings can read 10 to 60 cents off. The note-on must not be named in that state.
      const t = newTally('strings 6-4, 42 cents out of tune');
      for (const tone of ['steel', 'nylon'] as ToneName[]) {
        for (let string = 6; string >= 4; string--) {
          for (let fret = 0; fret <= 12; fret += FULL ? 1 : 2) {
            for (const cents of [-42, 42]) {
              const sampleRate = RATES[fret % 2];
              const spec: NoteSpec = { string, fret, tone, velocity: 0.9, cents, sampleRate };
              const scene = singleNoteScene(renderNote(spec, 0.6), sampleRate, midiOfSpec(spec), freqOfSpec(spec), 0.5);
              addScore(t, scoreScene(scene).scores[0], `${tone} string ${string} fret ${fret} ${cents} cents ${sampleRate}`);
            }
          }
        }
      }
      const s = push(t);
      expect(s.detectedPct).toBe(100);
      expect(s.wrongNoteOns, t.failures.join('\n')).toBe(0);
      expect(s.latencyP95Ms).toBeLessThanOrEqual(90);
    },
    SLOW,
  );
});

/** Score already-analysed events of a one-note scene again (the truth has been changed). */
function scoreEvents(scene: Scene, events: PitchEvent[], settleMs: number): ReturnType<typeof scoreScene>['scores'][number] {
  const t = scene.notes[0];
  const truth = t.freq as (time: number) => number;
  const ons = events.filter((e): e is PitchEvent & { type: 'noteon' } => e.type === 'noteon' && e.time >= t.start - 0.03 && e.time < t.end);
  const right = ons.filter((n) => n.midi === t.midi);
  const errors: number[] = [];
  let frames = 0;
  let gross = 0;
  for (const e of events) {
    if (e.type !== 'pitch' || e.time < t.start + settleMs / 1000 || e.time >= t.end) continue;
    frames++;
    const err = Math.abs(1200 * Math.log2(e.freq / truth(e.time)));
    if (err > 50) gross++;
    else errors.push(err);
  }
  return {
    detected: right.length > 0,
    latencyMs: right.length ? (right[0].detectedAt - t.start) * 1000 : Number.NaN,
    onsetErrorMs: right.length ? (right[0].time - t.start) * 1000 : Number.NaN,
    wrongFirst: ons.length > 0 && ons[0].midi !== t.midi,
    wrongNoteOns: ons.length - right.length,
    octaveNoteOns: 0,
    repeats: Math.max(0, right.length - 1),
    frames,
    grossFrames: gross,
    octaveFrames: 0,
    errors,
    coverage: Math.min(1, (frames * 0.01) / (t.end - t.start - settleMs / 1000)),
    span: t.end - t.start,
  };
}

// ---------------------------------------------------------------------------------------------
// Nothing is playing
// ---------------------------------------------------------------------------------------------

describe('adversarial corpus: false detections', () => {
  const SECONDS = FULL ? 40 : 5;
  const rows: string[] = [];

  afterAll(() => {
    report.push('', `False detections with nothing being played (${SECONDS} s each, at 44.1 and 48 kHz)`);
    report.push(`${'input'.padEnd(52)}${'note-ons/min'.padStart(13)}${'onsets/min'.padStart(12)}${'time as a note'.padStart(16)}${'longest'.padStart(10)}   hum flag`);
    report.push(...rows);
  });

  interface Quiet {
    noteOns: number;
    perMinute: number;
    noteShare: number;
    longestMs: number;
    hum: boolean;
  }

  function listen(name: string, make: (sampleRate: number, n: number) => Float32Array): Quiet {
    let noteOns = 0;
    let onsets = 0;
    let frames = 0;
    let longest = 0;
    let humFlag = false;
    for (const sampleRate of RATES) {
      const events = analyze(make(sampleRate, SECONDS * sampleRate), sampleRate);
      for (const e of events) {
        if (e.type === 'noteon') noteOns++;
        else if (e.type === 'onset') onsets++;
        else if (e.type === 'pitch') frames++;
        else if (e.type === 'noteoff') longest = Math.max(longest, e.duration);
        else if (e.type === 'level' && e.hum) humFlag = true;
      }
    }
    const minutes = (SECONDS * RATES.length) / 60;
    const q: Quiet = { noteOns, perMinute: noteOns / minutes, noteShare: (frames * 0.01) / (SECONDS * RATES.length), longestMs: longest * 1000, hum: humFlag };
    rows.push(
      `${name.padEnd(52)}${q.perMinute.toFixed(1).padStart(13)}${(onsets / minutes).toFixed(1).padStart(12)}${`${(100 * q.noteShare).toFixed(1)} %`.padStart(16)}${`${q.longestMs.toFixed(0)} ms`.padStart(10)}   ${q.hum}`,
    );
    return q;
  }

  const scaled = (x: Float32Array, db: number): Float32Array => x.map((v) => v * gain(db));

  it(
    'stays silent in silence and in steady noise at any level',
    () => {
      expect(listen('digital silence', (_sr, n) => new Float32Array(n)).noteOns).toBe(0);
      for (const db of FULL ? [-70, -50, -30, -15] : [-50, -20]) {
        expect(listen(`white noise at ${db} dBFS`, (sr, n) => scaled(background('white', sr, n, db), db)).noteOns).toBe(0);
        expect(listen(`pink noise at ${db} dBFS`, (sr, n) => scaled(background('pink', sr, n, db), db)).noteOns).toBe(0);
      }
      const wander = listen('pink noise wandering between -45 and -25 dBFS', (sr, n) =>
        background('pink', sr, n, 9).map((v, i) => v * gain(-35 + 10 * Math.sin((2 * Math.PI * 0.4 * i) / sr))),
      );
      expect(wander.noteOns).toBe(0);
    },
    SLOW,
  );

  it(
    'never calls a mains hum a note when it was there from the start, however loud',
    () => {
      for (const base of [50, 60] as const) {
        for (const db of FULL ? [-60, -45, -30, -20] : [-45, -25]) {
          const q = listen(`hum ${base} Hz + harmonics at ${db} dBFS`, (sr, n) => scaled(background(base === 50 ? 'hum50' : 'hum60', sr, n, 1), db));
          expect(q.noteOns, `hum ${base} at ${db}`).toBe(0);
        }
      }
      const mixed = listen('hum 50 Hz at -50 dBFS + pink noise at -55 dBFS', (sr, n) =>
        mixInto(scaled(background('hum50', sr, n, 2), -50), background('pink', sr, n, 3), gain(-55)),
      );
      expect(mixed.noteOns).toBe(0);
    },
    SLOW,
  );

  it(
    'gives up on a hum that is switched on in mid-session within two seconds',
    () => {
      for (const base of [50, 60] as const) {
        const q = listen(`hum ${base} Hz at -45 dBFS, switched on after 2 s`, (sr, n) => {
          const h = background(base === 50 ? 'hum50' : 'hum60', sr, n, 4);
          return h.map((v, i) => (i < 2 * sr ? 0 : v * gain(-45) * Math.min(1, (i - 2 * sr) / (0.05 * sr))));
        });
        // The switch-on click can pass for a pluck, so one short "note" is the documented limit.
        expect(q.noteOns, `hum ${base}`).toBeLessThanOrEqual(RATES.length);
        expect(q.longestMs, `hum ${base}`).toBeLessThan(2000);
      }
    },
    SLOW,
  );

  it(
    'ignores squeaks, thumps and scrapes; reports what a knock on the body does',
    () => {
      const run = (kind: HandlingKind, level: number): Quiet =>
        listen(`handling: ${kind}s, ${level >= 0.2 ? 'loud' : level >= 0.08 ? 'medium' : 'quiet'}`, (sr, n) =>
          mixInto(handlingNoise(sr, n / sr, 11 + Math.round(level * 100), level, [kind]), background('pink', sr, n, 5), gain(-65)),
        );
      for (const kind of ['squeak', 'thump', 'scrape'] as HandlingKind[]) {
        for (const level of FULL ? [0.03, 0.1, 0.3] : [0.1]) {
          const q = run(kind, level);
          // 150 events a minute are thrown at it.
          expect(q.perMinute, `${kind} at ${level}`).toBeLessThanOrEqual(2);
        }
      }
      // A knock makes the body ring at its own resonance (about 100 Hz) for a fifth of a second:
      // a short, low, real pitch that no single-note detector can tell from a damped string.
      // It is reported, not hidden; what is asserted is that it stays short.
      for (const level of FULL ? [0.03, 0.3] : [0.1]) {
        const q = run('knock', level);
        expect(q.longestMs, 'a knock is short').toBeLessThan(450);
      }
    },
    SLOW,
  );
});

// ---------------------------------------------------------------------------------------------
// The tuner on top
// ---------------------------------------------------------------------------------------------

describe('adversarial corpus: the tuner', () => {
  const rows: string[] = [];
  const notes: string[] = [];

  afterAll(() => {
    report.push(
      '',
      'Tuner (open strings plucked twice, 1.1 s apart; needle = TunerState.cents from 0.3 s to 1 s after each pluck; offset in cents)',
      `${'condition'.padEnd(46)}${'offset'.padStart(7)}${'plucks'.padStart(7)}${'string ok'.padStart(10)}${'needle err med / p95 / max'.padStart(28)}${'jitter sd'.padStart(11)}${'in tune'.padStart(9)}${'after'.padStart(9)}${'flicker'.padStart(9)}`,
      ...rows,
      ...notes,
    );
  });

  interface Trace {
    states: Array<{ time: number; state: TunerState }>;
    tuned: Array<{ index: number; time: number }>;
    events: PitchEvent[];
  }

  /** Run audio through the engine and a tuner exactly as a screen would wire them. */
  function tune(samples: Float32Array, sampleRate: number, tuner: Tuner = new Tuner()): Trace {
    const events = analyze(samples, sampleRate);
    const hub = new EventHub();
    const states: Trace['states'] = [];
    const tuned: Trace['tuned'] = [];
    let now = 0;
    tuner.onTuned((index) => tuned.push({ index, time: now }));
    attachTuner(hub, tuner, (state) => states.push({ time: now, state }));
    for (const e of events) {
      now = e.time;
      hub.emit(e);
    }
    return { states, tuned, events };
  }

  type Room = (x: Float32Array, sampleRate: number, seed: number, level: number) => Float32Array;
  const ROOMS: Array<[string, Room, { err95: number; errMax: number; flicker: number; confirm: number }]> = [
    ['clean', (x) => x, { err95: 0.3, errMax: 1, flicker: 0, confirm: 1 }],
    [
      'laptop (HP 200, reflections, pink 25 dB)',
      (x, sr, seed, level) => mixInto(micHighpass(earlyReflections(x, sr), sr, 200), background('pink', sr, x.length, seed), level * gain(-25)),
      { err95: 0.6, errMax: 3, flicker: 0, confirm: 1 },
    ],
    [
      'phone (HP 300, white 20 dB, clipping)',
      (x, sr, seed, level) => hardClip(mixInto(micHighpass(x, sr, 300), background('white', sr, x.length, seed), level * gain(-20)), 3),
      { err95: 0.6, errMax: 3, flicker: 0, confirm: 1 },
    ],
    ['noisy room (pink 12 dB)', (x, sr, seed, level) => mixInto(x, background('pink', sr, x.length, seed), level * gain(-12)), { err95: 4, errMax: 15, flicker: 0.25, confirm: 0.8 }],
    ['hum 50 Hz, 15 dB below the pluck', (x, sr, seed, level) => mixInto(x, background('hum50', sr, x.length, seed), level * gain(-15)), { err95: 2, errMax: 12, flicker: 0.1, confirm: 0.6 }],
    ['hum 60 Hz, 15 dB below the pluck', (x, sr, seed, level) => mixInto(x, background('hum60', sr, x.length, seed), level * gain(-15)), { err95: 2, errMax: 12, flicker: 0.1, confirm: 0.6 }],
  ];

  it(
    'shows the right string, a steady needle and the right verdict',
    () => {
      const tones: ToneName[] = ['steel', 'nylon', 'clean'];
      for (const [name, room, limit] of ROOMS) {
        for (const offset of FULL ? [0, 2, -2, 6, -6, 25] : [-2, 6]) {
          const errors: number[] = [];
          const jitter: number[] = [];
          const confirmAfter: number[] = [];
          let plucks = 0;
          let rightString = 0;
          let heard = 0;
          let confirmed = 0;
          let flicker = 0;
          let falseConfirm = 0;
          let i = 0;
          for (let s = 0; s < 6; s++) {
            for (const tone of FULL ? tones : [tones[s % 3]]) {
              const sampleRate = RATES[i % 2];
              i++;
              const seq: SequenceNote[] = [0, 1.1].map((time, k) => ({ time, midi: OPEN_MIDI[s], string: 6 - s, velocity: k ? 0.6 : 0.8, cents: offset }));
              const dry = renderNotes(seq, sampleRate, 2.2, tone);
              const lead = Math.round(LEAD_S * sampleRate);
              const x = new Float32Array(lead + dry.length);
              x.set(dry, lead);
              const { states, tuned } = tune(room(x, sampleRate, 31 + i, rms(x, lead, lead + 0.3 * sampleRate)), sampleRate);
              if (Math.abs(offset) >= 6) falseConfirm += tuned.length;
              for (const start of [0, 1.1]) {
                const a = LEAD_S + start;
                plucks++;
                const steady = states.filter((r) => r.state.active && r.time >= a + 0.3 && r.time < a + 1);
                if (steady.length) heard++;
                if (steady.length && steady.every((r) => r.state.string === s)) rightString++;
                const cents = steady.map((r) => r.state.cents);
                for (const c of cents) errors.push(Math.abs(c - offset));
                const mean = cents.reduce((p, c) => p + c, 0) / Math.max(1, cents.length);
                if (cents.length) jitter.push(Math.sqrt(cents.reduce((p, c) => p + (c - mean) ** 2, 0) / cents.length));
                const span = states.filter((r) => r.state.active && r.time >= a + 0.05 && r.time < a + 1.1);
                const first = span.find((r) => r.state.inTune);
                if (first) {
                  confirmed++;
                  confirmAfter.push((first.time - a) * 1000);
                }
                let changes = 0;
                for (let k = 1; k < span.length; k++) if (span[k].state.inTune !== span[k - 1].state.inTune) changes++;
                flicker += Math.max(0, changes - 1);
              }
            }
          }
          const ctx = `${name}, ${offset} cents`;
          rows.push(
            `${name.padEnd(46)}${String(offset).padStart(7)}${String(plucks).padStart(7)}${`${rightString}/${heard}`.padStart(10)}` +
              `${`${quantile(errors, 0.5).toFixed(2)} / ${quantile(errors, 0.95).toFixed(2)} / ${Math.max(...errors).toFixed(2)}`.padStart(28)}` +
              `${quantile(jitter, 0.5).toFixed(2).padStart(11)}${`${confirmed}/${plucks}`.padStart(9)}${(confirmAfter.length ? `${quantile(confirmAfter, 0.5).toFixed(0)} ms` : '-').padStart(9)}${String(flicker).padStart(9)}`,
          );
          // Whenever the tuner shows anything, it is the right string.
          expect(rightString, `string: ${ctx}`).toBe(heard);
          expect(heard / plucks, `heard: ${ctx}`).toBeGreaterThanOrEqual(limit.confirm);
          expect(quantile(errors, 0.95), `needle p95: ${ctx}`).toBeLessThanOrEqual(limit.err95);
          expect(Math.max(...errors), `needle max: ${ctx}`).toBeLessThanOrEqual(limit.errMax);
          expect(flicker / plucks, `flicker: ${ctx}`).toBeLessThanOrEqual(limit.flicker);
          // A string 6 cents out is never called in tune, in any room.
          expect(falseConfirm, `false "in tune": ${ctx}`).toBe(0);
          if (Math.abs(offset) <= 2) {
            expect(confirmed / plucks, `confirmed: ${ctx}`).toBeGreaterThanOrEqual(limit.confirm);
            // 100 ms of settling + 450 ms of holding + the note-on itself.
            expect(quantile(confirmAfter, 0.5), `time to confirm: ${ctx}`).toBeLessThanOrEqual(620);
          }
        }
      }
    },
    SLOW,
  );

  it(
    'reaches the string quickly and settles again after every pluck',
    () => {
      const within2: number[] = [];
      const excursion: number[] = [];
      let noteOns = 0;
      let expected = 0;
      let i = 0;
      for (let s = 0; s < 6; s++) {
        for (const tone of (FULL ? ['steel', 'nylon', 'clean'] : [['steel', 'nylon', 'clean'][s % 3]]) as ToneName[]) {
          const sampleRate = RATES[i % 2];
          i++;
          const times = [0, 0.9, 1.8, 2.7];
          const seq: SequenceNote[] = times.map((time, k) => ({ time, midi: OPEN_MIDI[s], string: 6 - s, velocity: [0.8, 0.6, 0.9, 0.5][k], cents: 1.5 }));
          const dry = renderNotes(seq, sampleRate, 3.6, tone);
          const lead = Math.round(LEAD_S * sampleRate);
          const x = new Float32Array(lead + dry.length);
          x.set(dry, lead);
          const { states, events } = tune(x, sampleRate);
          noteOns += events.filter((e) => e.type === 'noteon').length;
          expected += times.length;
          for (const start of times) {
            const a = LEAD_S + start;
            const seg = states.filter((r) => r.state.active && r.time >= a + 0.02 && r.time < a + 0.9);
            // First moment from which the needle stays within 2 cents of the truth for 200 ms.
            for (let k = 0; k < seg.length; k++) {
              if (Math.abs(seg[k].state.cents - 1.5) > 2) continue;
              let ok = true;
              for (let j = k; j < seg.length && seg[j].time < seg[k].time + 0.2; j++) if (Math.abs(seg[j].state.cents - 1.5) > 2) ok = false;
              if (ok) {
                within2.push((seg[k].time - a) * 1000);
                break;
              }
            }
            const late = seg.filter((r) => r.time > a + 0.15).map((r) => Math.abs(r.state.cents - 1.5));
            if (late.length) excursion.push(Math.max(...late));
          }
        }
      }
      notes.push(
        `  re-plucking a ringing string 0.9 s apart: ${noteOns}/${expected} note-ons; needle within 2 cents after median ${quantile(within2, 0.5).toFixed(0)} ms, p95 ${quantile(within2, 0.95).toFixed(0)} ms; ` +
          `largest excursion later than 150 ms after a pluck ${Math.max(...excursion).toFixed(2)} cents`,
      );
      expect(noteOns).toBe(expected);
      expect(within2.length).toBe(expected);
      expect(quantile(within2, 0.5)).toBeLessThanOrEqual(80);
      expect(quantile(within2, 0.95)).toBeLessThanOrEqual(160);
      expect(Math.max(...excursion)).toBeLessThan(1.5);
    },
    SLOW,
  );

  it(
    'follows the peg while it is turned and lands without overshoot',
    () => {
      const behind: number[] = [];
      let overshoot = 0;
      let landed = 0;
      let count = 0;
      for (let s = 0; s < 6; s++) {
        // Strings that ring long enough for a 2 s turn; the trebles are too short-lived in this guitar model.
        const tone: ToneName = s < 3 ? 'steel' : 'clean';
        const sampleRate = RATES[s % 2];
        const spec: NoteSpec = { string: 6 - s, fret: 0, tone, velocity: 0.85, cents: 0, sampleRate };
        const centsAt = (time: number): number => (time < 0.3 ? -40 : time < 2.3 ? -40 + (40 * (time - 0.3)) / 2 : 0);
        const source = renderNote(spec, 4.5);
        const seconds = Math.min(3.4, source.length / sampleRate - 0.3);
        if (seconds < 3.2) continue;
        count++;
        const scene = singleNoteScene(pitchWarp(source, sampleRate, seconds, centsAt), sampleRate, midiOfSpec(spec), freqOfSpec(spec), seconds);
        const { states } = tune(scene.samples, sampleRate);
        const active = states.filter((r) => r.state.active);
        for (const r of active) {
          const time = r.time - LEAD_S;
          if (time > 0.6 && time < 2.2) behind.push(centsAt(time) - r.state.cents);
        }
        const arrived = active.filter((r) => r.time > LEAD_S + 2.3);
        overshoot = Math.max(overshoot, ...arrived.map((r) => r.state.cents));
        if (arrived.some((r) => r.state.inTune)) landed++;
      }
      notes.push(
        `  turning the peg from 40 cents flat to pitch in 2 s (20 cents/s): needle behind the string by median ${quantile(behind, 0.5).toFixed(1)}, p95 ${quantile(behind, 0.95).toFixed(1)} cents; ` +
          `overshoot on arrival ${overshoot.toFixed(2)} cents; confirmed in tune ${landed}/${count}`,
      );
      expect(count).toBeGreaterThanOrEqual(4);
      expect(quantile(behind, 0.95)).toBeLessThan(7);
      expect(overshoot).toBeLessThan(1);
      expect(landed).toBe(count);
    },
    SLOW,
  );

  it(
    'holds the note to the end of its decay without jumping an octave or to another string',
    () => {
      let frames = 0;
      let wrongString = 0;
      let gross = 0;
      let wrongOns = 0;
      let maxErr = 0;
      const tracked: number[] = [];
      let i = 0;
      for (const hp of [0, 300]) {
        for (let s = 0; s < 6; s++) {
          for (const tone of ['steel', 'nylon', 'clean', 'driven'] as ToneName[]) {
            if (!FULL && (s + TONES.indexOf(tone) + (hp ? 1 : 0)) % 4) continue;
            const sampleRate = RATES[i % 2];
            i++;
            const spec: NoteSpec = { string: 6 - s, fret: 0, tone, velocity: 0.9, cents: 3, sampleRate };
            const note = renderNote(spec, 6);
            const scene = singleNoteScene(note, sampleRate, midiOfSpec(spec), freqOfSpec(spec), note.length / sampleRate + 0.4);
            let x = hp ? micHighpass(scene.samples, sampleRate, hp) : scene.samples;
            // A quiet room: pink noise at -65 dBFS.
            x = mixInto(x, background('pink', sampleRate, x.length, 5 + i), gain(-65));
            const { states, events } = tune(x, sampleRate);
            wrongOns += events.filter((e) => e.type === 'noteon' && e.midi !== scene.notes[0].midi).length;
            const active = states.filter((r) => r.state.active && r.time > LEAD_S + 0.3);
            for (const r of active) {
              frames++;
              if (r.state.string !== s) wrongString++;
              const err = Math.abs(r.state.cents - 3);
              if (err > 50) gross++;
              else maxErr = Math.max(maxErr, err);
            }
            tracked.push(active.length ? active[active.length - 1].time - LEAD_S : 0);
          }
        }
      }
      notes.push(
        `  ringing out to silence (${tracked.length} open strings, with and without a 300 Hz high-pass): followed for median ${quantile(tracked, 0.5).toFixed(1)} s; ` +
          `${wrongOns} wrong note-ons, ${wrongString} wrong-string and ${gross} gross readings in ${frames}; largest needle error ${maxErr.toFixed(2)} cents`,
      );
      expect(wrongOns).toBe(0);
      expect(wrongString).toBe(0);
      expect(gross).toBe(0);
      expect(maxErr).toBeLessThan(5);
      expect(quantile(tracked, 0.5)).toBeGreaterThan(1.5);
    },
    SLOW,
  );

  it(
    'does not let handling noise confirm or un-tick a string',
    () => {
      let confirmed = 0;
      let lost = 0;
      for (const sampleRate of RATES) {
        const tuner = new Tuner();
        // Tune every string first (each plucked once, in tune).
        const seq: SequenceNote[] = OPEN_MIDI.map((midi, s) => ({ time: s * 1.2, midi, string: 6 - s, velocity: 0.8, cents: 0.5 }));
        const plucks = renderNotes(seq, sampleRate, 7.4, 'steel');
        const knocks = handlingNoise(sampleRate, 12, 77, 0.2);
        const x = new Float32Array(plucks.length + knocks.length);
        x.set(plucks, 0);
        x.set(knocks, plucks.length);
        const { states, tuned } = tune(mixInto(x, background('pink', sampleRate, x.length, 3), gain(-65)), sampleRate, tuner);
        const boundary = plucks.length / sampleRate;
        expect(tuned.filter((t) => t.time < boundary).map((t) => t.index).sort(), `tuning at ${sampleRate}`).toEqual([0, 1, 2, 3, 4, 5]);
        confirmed += tuned.filter((t) => t.time >= boundary).length;
        const last = states[states.length - 1].state;
        lost += last.tuned.filter((ok) => !ok).length;
      }
      notes.push(`  12 s of knocks, squeaks, thumps and scrapes after tuning all six strings (twice): ${confirmed} false confirmations, ${lost} ticks lost`);
      expect(confirmed).toBe(0);
      expect(lost).toBe(0);
    },
    SLOW,
  );
});
