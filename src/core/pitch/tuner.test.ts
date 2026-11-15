import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { analyze } from './engine';
import { addNoise, mix, pluckedString, silence } from './signals';
import { attachTuner, STANDARD_TUNING_MIDI, Tuner, type TunerState, tuningFrequencies } from './tuner';
import { EventHub } from './types';

const SR = 44100;
const DROP_D = [38, 45, 50, 55, 59, 64];
const detuned = (midi: number, cents: number, a4 = 440): number => midiToFreq(midi, a4) * Math.pow(2, cents / 1200);

/** Feed a steady pitch for `seconds`, 100 readings a second, starting at `t0` with a fresh note. */
function hold(tuner: Tuner, freq: number, seconds: number, t0 = 0, onState?: (s: TunerState, t: number) => void): TunerState {
  let state = tuner.state;
  const n = Math.round(seconds * 100);
  for (let i = 0; i <= n; i++) {
    state = tuner.update({ time: t0 + i / 100, freq, noteAge: i / 100 });
    onState?.(state, t0 + i / 100);
  }
  return state;
}

describe('Tuner: string detection', () => {
  for (const [name, tuning] of [
    ['standard', [...STANDARD_TUNING_MIDI]],
    ['drop D', DROP_D],
  ] as const) {
    it(`finds every string of ${name} tuning from a quarter tone flat to a quarter tone sharp, and further`, () => {
      const tuner = new Tuner({ targets: tuningFrequencies(tuning) });
      tuning.forEach((midi, index) => {
        for (let cents = -150; cents <= 150; cents += 10) {
          tuner.release();
          const s = tuner.update({ time: 0, freq: detuned(midi, cents), noteAge: 0 });
          expect(s.string, `${name} string ${index} at ${cents} cents`).toBe(index);
          expect(s.cents).toBeCloseTo(cents, 6);
          expect(s.targetMidi).toBe(midi);
          expect(s.harmonic).toBe(1);
          expect(s.active).toBe(true);
        }
      });
    });
  }

  it('names strings by note, or by the labels given', () => {
    const plain = new Tuner();
    expect(plain.update({ time: 0, freq: 110 }).targetName).toBe('A2');
    const labelled = new Tuner({ labels: ['6th (low E)', '5th (A)', '4th (D)', '3rd (G)', '2nd (B)', '1st (high E)'] });
    expect(labelled.update({ time: 0, freq: 247 }).targetName).toBe('2nd (B)');
  });

  it('does not hop to the neighbouring string while one note is being turned through the midpoint', () => {
    const tuner = new Tuner();
    // The A string is being tuned down toward (and past) the midpoint between E2 and A2, in one continuous note.
    let age = 0;
    const strings: number[] = [];
    for (let cents = -200; cents >= -290; cents -= 5) {
      age += 0.02;
      strings.push(tuner.update({ time: age, freq: detuned(45, cents), noteAge: age }).string);
    }
    // Midpoint is at -250 cents; with hysteresis the reading stays on the A string a little beyond it.
    expect(strings[0]).toBe(1);
    expect(strings[strings.indexOf(0) - 1]).toBe(1);
    const switchAt = -200 - 5 * strings.indexOf(0);
    expect(switchAt).toBeLessThan(-270);
    // A fresh pluck at the same pitch is judged without that memory.
    tuner.release();
    expect(tuner.update({ time: 5, freq: detuned(45, -260), noteAge: 0 }).string).toBe(0);
  });

  it('reads the 12th-fret harmonic as its string', () => {
    const tuner = new Tuner();
    STANDARD_TUNING_MIDI.forEach((midi, index) => {
      tuner.release();
      const s = tuner.update({ time: 0, freq: detuned(midi + 12, 4), noteAge: 0 });
      expect(s.string, `harmonic of string ${index}`).toBe(index);
      expect(s.harmonic).toBe(2);
      expect(s.cents).toBeCloseTo(4, 6);
      expect(s.targetFreq).toBeCloseTo(midiToFreq(midi) * 2, 6);
    });
    // In open E tuning the 4th string IS E3, so E3 belongs to it, not to the 6th string's harmonic.
    const openE = new Tuner({ targets: tuningFrequencies([40, 47, 52, 56, 59, 64]) });
    const s = openE.update({ time: 0, freq: midiToFreq(52), noteAge: 0 });
    expect(s.string).toBe(2);
    expect(s.harmonic).toBe(1);
    // And harmonics can be switched off.
    const strict = new Tuner({ harmonics: false });
    expect(strict.update({ time: 0, freq: midiToFreq(52), noteAge: 0 }).harmonic).toBe(1);
  });

  it('stays on the locked string and says so when another string is plucked', () => {
    const tuner = new Tuner({ mode: 'locked', lockedString: 0 });
    expect(tuner.state.string).toBe(0);
    expect(tuner.state.hint.code).toBe('listen');
    expect(tuner.state.hint.text).toContain('E2');
    const flat = tuner.update({ time: 0, freq: detuned(40, -30), noteAge: 0 });
    expect(flat.string).toBe(0);
    expect(flat.cents).toBeCloseTo(-30, 6);
    tuner.release();
    const other = tuner.update({ time: 1, freq: detuned(45, 5), noteAge: 0 });
    expect(other.string).toBe(0);
    expect(other.cents).toBeCloseTo(505, 4);
    expect(other.hint.code).toBe('other-string');
    expect(other.hint.text).toContain('A2');
    expect(other.hint.severity).toBe('warning');
    // lock(null) returns to automatic detection.
    tuner.lock(null);
    expect(tuner.update({ time: 2, freq: detuned(45, 5), noteAge: 0 }).string).toBe(1);
    tuner.lock(3);
    expect(tuner.state.mode).toBe('locked');
    expect(tuner.state.string).toBe(3);
  });
});

describe('Tuner: in tune', () => {
  it('declares in tune only after the pitch has stayed inside the tolerance', () => {
    const tuner = new Tuner({ toleranceCents: 3, holdMs: 450 });
    const tunedCalls: number[] = [];
    tuner.onTuned((index) => tunedCalls.push(index));
    let firstWithin = -1;
    let firstInTune = -1;
    const justTuned: number[] = [];
    const last = hold(tuner, detuned(55, 1.5), 1.2, 0, (s, t) => {
      if (s.withinTolerance && firstWithin < 0) firstWithin = t;
      if (s.inTune && firstInTune < 0) firstInTune = t;
      if (s.justTuned !== null) justTuned.push(s.justTuned);
      if (!s.inTune && s.withinTolerance) expect(s.hint.code).toBe('hold');
    });
    expect(firstWithin).toBe(0);
    // The hold starts once the pluck has settled (100 ms) and lasts 450 ms.
    expect(firstInTune).toBeGreaterThan(0.5);
    expect(firstInTune).toBeLessThan(0.6);
    expect(justTuned).toEqual([3]);
    expect(tunedCalls).toEqual([3]);
    expect(last.inTune).toBe(true);
    expect(last.holdProgress).toBe(1);
    expect(last.direction).toBe('ok');
    expect(last.hint).toMatchObject({ code: 'in-tune', severity: 'success' });
    expect(last.tuned).toEqual([false, false, false, true, false, false]);
  });

  it('does not confirm a string that only passes through the tolerance', () => {
    const tuner = new Tuner();
    let confirmed = false;
    // The learner turns the peg straight through pitch: 60 cents in one second.
    for (let i = 0; i <= 100; i++) {
      const s = tuner.update({ time: i / 100, freq: detuned(45, -30 + i * 0.6), noteAge: i / 100 });
      confirmed ||= s.inTune;
    }
    expect(confirmed).toBe(false);
    expect(tuner.state.tuned.some(Boolean)).toBe(false);
  });

  it('holds its decision against jitter at the edge of the tolerance', () => {
    const tuner = new Tuner({ toleranceCents: 3 });
    hold(tuner, detuned(64, 2.0), 1);
    expect(tuner.state.inTune).toBe(true);
    // Readings wobble between 2.6 and 3.6 cents: still in tune thanks to the 1-cent hysteresis and the smoothing.
    let stayed = true;
    for (let i = 0; i < 200; i++) {
      const s = tuner.update({ time: 1.01 + i / 100, freq: detuned(64, i % 2 ? 2.6 : 3.6), noteAge: 1.01 + i / 100 });
      stayed &&= s.inTune;
    }
    expect(stayed).toBe(true);
    // Clearly out: the light goes off at once and the mark is withdrawn.
    const out = hold(tuner, detuned(64, 12), 0.5, 3.1);
    expect(out.inTune).toBe(false);
    expect(out.tuned[5]).toBe(false);
  });

  it('keeps a checklist of tuned strings and re-arms a string heard out of tune', () => {
    const tuner = new Tuner();
    const events: number[] = [];
    tuner.onTuned((i) => events.push(i));
    STANDARD_TUNING_MIDI.forEach((midi, i) => {
      tuner.release();
      hold(tuner, detuned(midi, i % 2 ? 1 : -1), 0.8, i * 2);
    });
    expect(events).toEqual([0, 1, 2, 3, 4, 5]);
    expect(tuner.state.tuned.every(Boolean)).toBe(true);
    // The low E has slipped: plucking it again withdraws its mark, and bringing it back confirms it again.
    tuner.release();
    hold(tuner, detuned(40, -15), 0.6, 20);
    expect(tuner.state.tuned).toEqual([false, true, true, true, true, true]);
    tuner.release();
    hold(tuner, detuned(40, 0.5), 0.8, 22);
    expect(events).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(tuner.resetTuned().tuned.some(Boolean)).toBe(false);
    // A new tuning starts a new checklist.
    hold(tuner, detuned(40, 0), 0.8, 30);
    expect(tuner.setTargets(tuningFrequencies(DROP_D)).tuned).toEqual([false, false, false, false, false, false]);
  });
});

describe('Tuner: needle smoothing', () => {
  it('follows a turn of the peg quickly and calms jitter when close', () => {
    const tuner = new Tuner();
    hold(tuner, detuned(50, -30), 0.5);
    // The peg is turned: the pitch jumps from -30 to -5 cents.
    let reached = -1;
    for (let i = 1; i <= 50; i++) {
      const s = tuner.update({ time: 0.5 + i / 100, freq: detuned(50, -5), noteAge: 0.5 + i / 100 });
      if (reached < 0 && Math.abs(s.cents + 5) < 2) reached = i * 10;
      expect(s.rawCents).toBeCloseTo(-5, 6);
    }
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThanOrEqual(150);

    // Near the target, +/-1 cent of reading jitter moves the needle by much less.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 300; i++) {
      const jitter = ((i * 7919) % 21) / 10 - 1;
      const s = tuner.update({ time: 1.1 + i / 100, freq: detuned(50, jitter), noteAge: 1.1 + i / 100 });
      if (i > 100) {
        min = Math.min(min, s.cents);
        max = Math.max(max, s.cents);
      }
    }
    expect(max - min).toBeLessThan(0.7);
    expect(Math.abs((max + min) / 2)).toBeLessThan(0.3);
  });

  it('starts each new pluck from its own reading instead of gliding from the last note', () => {
    const tuner = new Tuner();
    hold(tuner, detuned(40, -20), 0.3);
    // New pluck (note age restarts) of a different string.
    const s = tuner.update({ time: 0.4, freq: detuned(59, 7), noteAge: 0 });
    expect(s.string).toBe(4);
    expect(s.cents).toBeCloseTo(7, 6);
  });
});

describe('Tuner: guidance', () => {
  it('says which way to turn, and how much', () => {
    const tuner = new Tuner({ mode: 'locked', lockedString: 1 });
    const at = (cents: number): TunerState => {
      tuner.release();
      return tuner.update({ time: 0, freq: detuned(45, cents), noteAge: 0.2 });
    };
    expect(at(-40)).toMatchObject({ direction: 'up', hint: { code: 'tune-up' } });
    expect(at(-6)).toMatchObject({ direction: 'up', hint: { code: 'almost-up' } });
    expect(at(6)).toMatchObject({ direction: 'down', hint: { code: 'almost-down' } });
    expect(at(40)).toMatchObject({ direction: 'down', hint: { code: 'tune-down' } });
    expect(at(1)).toMatchObject({ direction: 'ok', hint: { code: 'hold' } });
    expect(at(-40).hint.text).toMatch(/Tighten/);
    expect(at(40).hint.text).toMatch(/Loosen/);
  });

  it('warns when the string is more than a whole step away, so nobody snaps a string', () => {
    const tuner = new Tuner({ mode: 'locked', lockedString: 5 });
    const below = tuner.update({ time: 0, freq: detuned(64, -230), noteAge: 0.2 });
    expect(below.hint).toMatchObject({ code: 'far-below', severity: 'warning' });
    expect(below.hint.text).toContain('whole step below E4');
    tuner.release();
    const above = tuner.update({ time: 1, freq: detuned(64, 260), noteAge: 0.2 });
    expect(above.hint).toMatchObject({ code: 'far-above', severity: 'warning' });
    expect(above.hint.text).toMatch(/Loosen/);
    expect(above.direction).toBe('down');
    // Exactly a whole step is still ordinary guidance; the threshold is configurable.
    tuner.release();
    expect(tuner.update({ time: 2, freq: detuned(64, 195), noteAge: 0.2 }).hint.code).toBe('tune-down');
    const strict = new Tuner({ mode: 'locked', lockedString: 5, farCents: 100 });
    expect(strict.update({ time: 0, freq: detuned(64, 150), noteAge: 0.2 }).hint.code).toBe('far-above');
    // Auto mode: a string below the lowest target has no nearer string, so it is warned about too.
    const auto = new Tuner();
    expect(auto.update({ time: 0, freq: detuned(40, -300), noteAge: 0.2 }).hint.code).toBe('far-below');
  });

  it('goes back to listening when the string stops', () => {
    const tuner = new Tuner();
    hold(tuner, detuned(45, -12), 0.3);
    const s = tuner.release();
    expect(s.active).toBe(false);
    expect(s.direction).toBeNull();
    expect(s.inTune).toBe(false);
    expect(s.hint.code).toBe('listen');
    // The last reading stays readable for a "hold the last value" display.
    expect(s.string).toBe(1);
    expect(s.cents).toBeCloseTo(-12, 1);
    // A reading without a frequency releases too.
    hold(tuner, detuned(45, 0), 0.2, 1);
    expect(tuner.update({ time: 2, freq: 0 }).active).toBe(false);
  });
});

describe('Tuner: chromatic mode and reference pitch', () => {
  it('targets the nearest note of the chromatic scale, with hysteresis between notes', () => {
    const tuner = new Tuner({ mode: 'chromatic' });
    const s = tuner.update({ time: 0, freq: detuned(61, 20), noteAge: 0 });
    expect(s).toMatchObject({ string: -1, targetName: 'C#4', targetMidi: 61 });
    expect(s.cents).toBeCloseTo(20, 6);
    // Bending up through the boundary: the target stays C#4 until 60 cents, then becomes D4.
    expect(tuner.update({ time: 0.1, freq: detuned(61, 55), noteAge: 0.1 }).targetMidi).toBe(61);
    const next = tuner.update({ time: 0.2, freq: detuned(61, 65), noteAge: 0.2 });
    expect(next.targetMidi).toBe(62);
    expect(next.cents).toBeCloseTo(-35, 6);
    // In-tune confirmation reports the MIDI note.
    tuner.release();
    let tuned: number | null = null;
    hold(tuner, detuned(69, 0.5), 0.8, 1, (st) => {
      if (st.justTuned !== null) tuned = st.justTuned;
    });
    expect(tuned).toBe(69);
  });

  it('follows the A4 reference', () => {
    const tuner = new Tuner({ a4: 432, mode: 'chromatic' });
    expect(tuner.update({ time: 0, freq: 432, noteAge: 0 }).cents).toBeCloseTo(0, 6);
    tuner.setA4(440);
    expect(tuner.update({ time: 0, freq: 432, noteAge: 0 }).cents).toBeCloseTo(1200 * Math.log2(432 / 440), 6);
    // Default targets are built from the reference; explicit targets in Hz are taken as given.
    const baroque = new Tuner({ a4: 415 });
    expect(baroque.update({ time: 0, freq: midiToFreq(45, 415), noteAge: 0 }).cents).toBeCloseTo(0, 6);
    expect(tuningFrequencies([69, 57], 442)).toEqual([442, 221]);
  });
});

describe('Tuner: end to end on audio', () => {
  /** Run audio through the engine and a tuner; return every tuner state with its time. */
  function tuneAudio(x: Float32Array, tuner: Tuner): Array<{ time: number; state: TunerState }> {
    const hub = new EventHub();
    const states: Array<{ time: number; state: TunerState }> = [];
    let now = 0;
    hub.on('level', (e) => {
      now = e.time;
    });
    hub.on('pitch', (e) => {
      now = e.time;
    });
    const detach = attachTuner(hub, tuner, (state) => states.push({ time: now, state }));
    hub.emitAll(analyze(x, SR));
    detach();
    return states;
  }

  it('tunes all six strings through a small-microphone signal', () => {
    // Each string is plucked twice: clearly flat, then brought to within a cent or two.
    const offsets = [1.2, -0.8, 0.6, -1.5, 1.0, -0.4];
    let x = silence(STANDARD_TUNING_MIDI.length * 3 + 0.5, SR);
    STANDARD_TUNING_MIDI.forEach((midi, i) => {
      const make = (cents: number, seed: number): Float32Array =>
        pluckedString({
          freq: detuned(midi, cents),
          sampleRate: SR,
          duration: 1.3,
          amplitude: 0.4,
          attackNoise: 0.3,
          driftCents: 8,
          highpassHz: 200,
          highpassOrder: 3,
          seed,
        });
      const fadeOut = (p: Float32Array): Float32Array => {
        for (let k = 0; k < 1000; k++) p[p.length - 1 - k] *= k / 1000;
        return p;
      };
      x = mix(x, fadeOut(make(-22, i + 1)), Math.round((0.3 + i * 3) * SR)).subarray(0, x.length);
      x = mix(x, fadeOut(make(offsets[i], i + 50)), Math.round((1.8 + i * 3) * SR)).subarray(0, x.length);
    });
    x = addNoise(x, 35, 5, Math.round(0.3 * SR));
    const tuner = new Tuner();
    const tuned: Array<{ index: number; time: number }> = [];
    let clock = 0;
    tuner.onTuned((index) => tuned.push({ index, time: clock }));
    const hub = new EventHub();
    hub.on('pitch', (e) => {
      clock = e.time;
    });
    const seen: Array<{ time: number; state: TunerState }> = [];
    attachTuner(hub, tuner, (state) => seen.push({ time: clock, state }));
    hub.emitAll(analyze(x, SR));

    expect(tuned.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5]);
    STANDARD_TUNING_MIDI.forEach((_, i) => {
      const flatPhase = seen.filter((s) => s.state.active && s.time > 0.3 + i * 3 + 0.2 && s.time < 0.3 + i * 3 + 1.1);
      expect(flatPhase.length).toBeGreaterThan(40);
      for (const s of flatPhase) {
        expect(s.state.string, `string ${i} flat phase`).toBe(i);
        expect(Math.abs(s.state.cents + 22)).toBeLessThan(1.5);
        expect(s.state.direction).toBe('up');
        expect(s.state.inTune).toBe(false);
      }
      const tunedPhase = seen.filter((s) => s.state.active && s.time > 1.8 + i * 3 + 0.2 && s.time < 1.8 + i * 3 + 1.1);
      for (const s of tunedPhase) {
        expect(s.state.string).toBe(i);
        // The note is fading into the room noise by the end of this window, hence the looser bound.
        expect(Math.abs(s.state.cents - offsets[i]), `string ${i} tuned phase`).toBeLessThan(1.6);
      }
      const early = tunedPhase.filter((s) => s.time < 1.8 + i * 3 + 0.6);
      for (const s of early) expect(Math.abs(s.state.cents - offsets[i]), `string ${i} just after the pluck`).toBeLessThan(1);
      // Confirmation arrives about 0.55 s after the second pluck (settle + hold), never during the flat pluck.
      const sincePluck = tuned[i].time - (1.8 + i * 3);
      expect(sincePluck).toBeGreaterThan(0.4);
      expect(sincePluck).toBeLessThan(0.85);
    });
    expect(tuner.state.tuned.every(Boolean)).toBe(true);
    expect(tuner.state.active).toBe(false);
  });

  it('stays close to the truth while the neighbouring string is still ringing', () => {
    // The string being tuned is 4 cents sharp; the string next to it was plucked 0.8 s earlier, is
    // itself out of tune, and is still sounding 12 or 20 dB below the new note.
    const bias: Record<number, number[]> = { [-12]: [], [-20]: [] };
    for (const db of [-12, -20]) {
      STANDARD_TUNING_MIDI.forEach((midi, i) => {
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= STANDARD_TUNING_MIDI.length) continue;
          for (const otherCents of [-20, 0, 15]) {
            const fresh = pluckedString({ freq: detuned(midi, 4), sampleRate: SR, duration: 1.2, attackNoise: 0.3, seed: i + 1 });
            const old = pluckedString({ freq: detuned(STANDARD_TUNING_MIDI[j], otherCents), sampleRate: SR, duration: 2, decay: 1, seed: j + 9 });
            const lead = Math.round(0.8 * SR);
            const level = (a: Float32Array, from: number): number => {
              let sum = 0;
              for (let k = from + 2000; k < from + 12000; k++) sum += a[k] * a[k];
              return Math.sqrt(sum / 10000);
            };
            const gain = (level(fresh, 0) / level(old, lead)) * Math.pow(10, db / 20);
            const x = mix(mix(silence(2.1, SR), old, 0, gain), fresh, lead).subarray(0, 2 * SR);
            const tuner = new Tuner();
            const settled = tuneAudio(x, tuner).filter((s) => s.state.active && s.time > 1.1 && s.time < 1.7);
            expect(settled.length, `string ${i} with string ${j} ringing`).toBeGreaterThan(30);
            for (const s of settled) expect(s.state.string).toBe(i);
            const cents = settled.map((s) => s.state.cents).sort((a, b) => a - b);
            bias[db].push(Math.abs(cents[cents.length >> 1] - 4));
          }
        }
      });
    }
    const p90 = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.9)];
    expect(Math.max(...bias[-20])).toBeLessThan(0.4);
    expect(p90(bias[-12])).toBeLessThan(1);
    expect(Math.max(...bias[-12])).toBeLessThan(1.5);
  }, 60_000);

  it('tunes drop D, and reads the low string an octave harmonic as that string', () => {
    const tuner = new Tuner({ targets: tuningFrequencies(DROP_D) });
    const low = pluckedString({ freq: detuned(38, -9), sampleRate: SR, duration: 1, amplitude: 0.4, attackNoise: 0.3 });
    const states = tuneAudio(mix(silence(1.4, SR), low, Math.round(0.2 * SR)), tuner).filter((s) => s.state.active && s.time > 0.45);
    expect(states.length).toBeGreaterThan(50);
    for (const s of states) {
      expect(s.state.string).toBe(0);
      expect(s.state.targetName).toBe('D2');
      expect(Math.abs(s.state.cents + 9)).toBeLessThan(1);
    }
    // 12th-fret harmonic: mostly even partials of the string.
    tuner.release();
    const harm = pluckedString({ freq: detuned(50, -9), sampleRate: SR, duration: 1, amplitude: 0.3, pluckPosition: 0.25 });
    const hs = tuneAudio(mix(silence(1.4, SR), harm, Math.round(0.2 * SR)), new Tuner({ targets: tuningFrequencies([38, 45, 52, 55, 59, 64]) }));
    const active = hs.filter((s) => s.state.active && s.time > 0.45);
    for (const s of active) {
      expect(s.state.string).toBe(0);
      expect(s.state.harmonic).toBe(2);
      expect(Math.abs(s.state.cents + 9)).toBeLessThan(1);
    }
  });
});
