/**
 * Judging one microphone take of an exercise: which notes were right (pitch), how even the timing
 * was, whether the learner kept the click's tempo and, when the take was played to the click and
 * the click's first beat is known on the same clock, whether the notes sat on the click (not just
 * evenly among themselves). Pure: the screen records notes and onsets with `@/core/pitch` and
 * hands them here.
 */
import { compareNotes, type RecordedNote } from '@/core/pitch';
import { flattenSong, practiceTargets, type Song } from '@/core/song';
import { alignTimes, medianGap, type TimingFit } from './timing';

/** The tab's note-state key for a beat (the same as `noteKey` in `@/ui/music/tab`). */
export function beatKey(bar: number, beat: number): string {
  return `${bar}:${beat}`;
}

/** One thing the learner should play, with its time from the first one. */
export interface ExpectedNote {
  /** Sounding MIDI of a single note, or null for a chord or a strum. */
  midi: number | null;
  /** Seconds after the first expected note, at the take's tempo. */
  time: number;
  /** Seconds after the start of the song (its first beat), at the take's tempo. */
  songTime: number;
  /** Song bar (0-based) and beat index in that bar's measure, for the tab. */
  bar: number;
  beat: number;
  /** `noteKey(bar, beat)` for the tab's note states. */
  key: string;
}

/** What the take is judged on. */
export type TakeKind = 'notes' | 'onsets';

/** How even the timing was. */
export type Evenness = 'even' | 'a-bit-uneven' | 'uneven';
/** Whether the learner kept the click's tempo. */
export type TempoKeeping = 'steady' | 'rushing' | 'dragging';
/** Where the notes sat against the click. */
export type ClickKeeping = 'with' | 'ahead' | 'behind';

/**
 * Where the click was, on the clock the take was recorded on: the audio time the song's first beat
 * was played, and how much later a note played with that beat reaches the recording (the click's
 * way out through the speaker and the guitar's way in through the microphone).
 */
export interface ClickReference {
  /** Audio time of the song's first beat (`SongPlayer.firstBeatTime`). */
  zero: number;
  /** Seconds from a click being played to a note played with it being stamped by the microphone. */
  latency: number;
  /** The latency was measured for this device (calibrated), not taken from what the browser reports. */
  calibrated: boolean;
}
/** The overall verdict of a take. */
export type Verdict = 'clean' | 'close' | 'not-yet';

/** The analysis of a take. */
export interface TakeResult {
  kind: TakeKind;
  /** Nothing usable was heard. */
  empty: boolean;
  /** Notes (or strokes) expected and heard. */
  expected: number;
  heard: number;
  /** Share of expected notes played right (notes) or strokes heard (onsets), 0..1. */
  accuracy: number;
  /** Expected indexes that were missed or wrong. */
  missed: number[];
  timing: {
    rmsMs: number;
    maxMs: number;
    /** rms as a share of the typical gap between notes. */
    spread: number;
    evenness: Evenness;
    tempo: TempoKeeping;
    /** The tempo the learner actually played at, in the ladder's units. */
    playedBpm: number;
    /**
     * Against the click (when the take was played to it): the median distance of the notes from
     * their clicks (positive = late), how widely they spread around them, and the verdict.
     */
    click: { offsetMs: number; rmsMs: number; keeping: ClickKeeping; toleranceMs: number } | null;
  };
  /** The note furthest from an even line: index, milliseconds (positive = late), bar and beat (1-based). */
  worst: { index: number; ms: number; bar: number; beat: number } | null;
  /** Intonation, when asked for: median cents of the matched notes and the furthest one. */
  intonation: { medianCents: number; worst: { index: number; cents: number } } | null;
  /** 0..100. */
  score: number;
  verdict: Verdict;
  /** Per tab beat: hit or miss, for `TabView noteStates`. */
  noteStates: Record<string, 'hit' | 'miss'>;
  /** Plain-language feedback; the first line is the headline. */
  messages: string[];
}

/** The beats of the part that make a sound, at the song's tempo, from the first one. */
export function expectedFromSong(song: Song): ExpectedNote[] {
  const timeline = flattenSong(song);
  const track = song.tracks[0];
  if (!track) return [];
  const targets = practiceTargets(timeline, track.id);
  const t0 = targets[0]?.sec ?? 0;
  return targets.map((t) => ({
    midi: t.midis.length === 1 && !t.symbol ? t.midis[0] : null,
    time: t.sec - t0,
    songTime: t.sec,
    bar: t.bar,
    beat: t.beat.beat,
    key: beatKey(t.bar, t.beat.beat),
  }));
}

/** Timing limit for "even", in ms, for a typical gap between notes (seconds). */
export function evenLimitMs(gapSec: number): number {
  return Math.min(35, Math.max(12, gapSec * 1000 * 0.06));
}

/** Classify an rms timing error against the typical gap. */
export function evennessOf(rmsMs: number, gapSec: number): Evenness {
  const limit = evenLimitMs(gapSec);
  if (rmsMs <= limit) return 'even';
  if (rmsMs <= 2 * limit) return 'a-bit-uneven';
  return 'uneven';
}

/** Classify the fitted slope (played seconds per expected second). */
export function tempoOf(slope: number): TempoKeeping {
  const ratio = 1 / slope;
  if (ratio > 1.05) return 'rushing';
  if (ratio < 0.95) return 'dragging';
  return 'steady';
}

/**
 * How far from the click notes may sit and still be "with" it, in ms: the evenness limit, at least
 * 25 ms (a player in time is within a few tens of ms), and 30 ms more when the device's delay is
 * only what the browser reports rather than measured.
 */
export function clickToleranceMs(gapSec: number, calibrated: boolean): number {
  return Math.max(25, evenLimitMs(gapSec)) + (calibrated ? 0 : 30);
}

/** Classify the median distance from the click. */
export function clickKeepingOf(offsetMs: number, toleranceMs: number): ClickKeeping {
  if (offsetMs > toleranceMs) return 'behind';
  if (offsetMs < -toleranceMs) return 'ahead';
  return 'with';
}

/** Note name for messages ("C4"), with ♯. */
function nameOf(midi: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const m = Math.round(midi);
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Where a note is, as the learner finds it in the tab: "bar 2, note 4" (not "beat": with eighths the 4th note is on beat 2). */
const where = (e: ExpectedNote): string => `bar ${e.bar + 1}, note ${e.beat + 1}`;

/**
 * Judge a take.
 * @param expected what the part asks for (from `expectedFromSong`)
 * @param bpm the ladder tempo the take was played at (for "you played at about N")
 * @param notes notes heard (for `notes` takes), on any one clock
 * @param onsets pluck times (for `onsets` takes), on the same kind of clock
 */
export function analyzeTake(input: {
  kind: TakeKind;
  expected: readonly ExpectedNote[];
  bpm: number;
  notes?: readonly RecordedNote[];
  onsets?: readonly number[];
  intonation?: boolean;
  /** Where the click was (a take played to the click); without it only evenness and tempo are judged. */
  click?: ClickReference | null;
}): TakeResult {
  const { kind, expected, bpm } = input;
  const notes = [...(input.notes ?? [])].sort((a, b) => a.start - b.start);
  const onsets = [...(input.onsets ?? [])].sort((a, b) => a - b);
  const times = expected.map((e) => e.time);
  const gap = medianGap(times);

  // Timing: for a note take, use the single-note targets and the heard notes; for strums, every stroke.
  const timedIdx = kind === 'notes' ? expected.map((e, i) => (e.midi !== null ? i : -1)).filter((i) => i >= 0) : expected.map((_, i) => i);
  const played = kind === 'notes' ? notes.map((n) => n.start) : onsets;
  const fit: TimingFit = alignTimes(timedIdx.map((i) => times[i]), played);

  // Pitch: compare the sequence of heard notes with the expected one (octave slips of the detector forgiven).
  let accuracy: number;
  let missed: number[];
  /** Expected notes heard as a different pitch: a real mistake, unlike a note the microphone missed. */
  let wrong: number[] = [];
  const noteStates: Record<string, 'hit' | 'miss'> = {};
  let intonation: TakeResult['intonation'] = null;
  if (kind === 'notes') {
    const wanted = timedIdx.map((i) => expected[i].midi as number);
    const cmp = compareNotes(notes, wanted, { octaves: 'any' });
    accuracy = cmp.accuracy;
    missed = cmp.missed.map((k) => timedIdx[k]);
    wrong = cmp.alignment.filter((a) => a.kind === 'wrong').map((a) => timedIdx[a.expected]);
    const okIdx = new Set<number>();
    for (const a of cmp.alignment) if (a.kind === 'match') okIdx.add(timedIdx[a.expected]);
    for (const i of timedIdx) noteStates[expected[i].key] = okIdx.has(i) ? 'hit' : 'miss';
    if (input.intonation) {
      const cents = cmp.alignment.filter((a) => a.kind === 'match').map((a) => ({ index: timedIdx[a.expected], cents: notes[a.played].cents }));
      if (cents.length) {
        const sorted = [...cents].sort((a, b) => a.cents - b.cents);
        const worst = cents.reduce((w, c) => (Math.abs(c.cents) > Math.abs(w.cents) ? c : w), cents[0]);
        intonation = { medianCents: sorted[sorted.length >> 1].cents, worst };
      }
    }
  } else {
    accuracy = expected.length ? fit.matches.length / expected.length : 0;
    missed = fit.missed.map((k) => timedIdx[k]);
    const hit = new Set(fit.matches.map((m) => timedIdx[m.expected]));
    for (let i = 0; i < expected.length; i++) {
      const k = expected[i].key;
      // A beat holds one stroke; any stroke heard there counts.
      if (hit.has(i)) noteStates[k] = 'hit';
      else if (noteStates[k] !== 'hit') noteStates[k] = 'miss';
    }
  }

  const heard = kind === 'notes' ? notes.length : onsets.length;
  const empty = heard === 0 || (fit.matches.length < 2 && accuracy === 0);
  const timedGap = medianGap(timedIdx.map((i) => times[i]));
  const evenness = fit.matches.length >= 3 ? evennessOf(fit.rmsMs, timedGap) : 'uneven';
  const tempo = fit.matches.length >= 3 ? tempoOf(fit.slope) : 'steady';
  const playedBpm = Math.round(bpm / fit.slope);
  const spread = timedGap > 0 ? fit.rmsMs / 1000 / timedGap : 0;
  const worstE = fit.worst >= 0 ? expected[timedIdx[fit.worst]] : null;
  const worstMatch = fit.matches.find((m) => m.expected === fit.worst);
  const worst = worstE && worstMatch ? { index: timedIdx[fit.worst], ms: Math.round(worstMatch.error * 1000), bar: worstE.bar + 1, beat: worstE.beat + 1 } : null;

  const limit = evenLimitMs(timedGap);
  const timingScore = Math.max(0, Math.min(1, 1 - (fit.rmsMs - limit) / (1.5 * limit)));
  const tempoScore = Math.max(0, 1 - Math.max(0, Math.abs(1 / fit.slope - 1) - 0.03) * 5);

  // Against the click: each matched note against the moment its click was heard.
  let click: TakeResult['timing']['click'] = null;
  if (input.click && fit.matches.length >= 3) {
    const ref = input.click;
    const errs = fit.matches.map((m) => (played[m.played] - (ref.zero + ref.latency + expected[timedIdx[m.expected]].songTime)) * 1000).sort((a, b) => a - b);
    const offsetMs = errs[errs.length >> 1];
    const rmsMs = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
    const toleranceMs = clickToleranceMs(timedGap, ref.calibrated);
    click = { offsetMs: Math.round(offsetMs), rmsMs, keeping: clickKeepingOf(offsetMs, toleranceMs), toleranceMs };
  }
  const clickScore = click ? Math.max(0, Math.min(1, 1 - (Math.abs(click.offsetMs) - click.toleranceMs) / (2 * click.toleranceMs))) : null;
  const score = empty ? 0 : Math.round(100 * (clickScore === null ? 0.5 * accuracy + 0.4 * timingScore + 0.1 * tempoScore : 0.5 * accuracy + 0.3 * timingScore + 0.1 * tempoScore + 0.1 * clickScore));

  let verdict: Verdict;
  if (empty) verdict = 'not-yet';
  // A note the microphone did not catch is forgiven (up to one in ten); a wrong note never is.
  // Even but steadily off the click is not clean: the band would hear it.
  else if (accuracy >= 0.9 && wrong.length === 0 && evenness === 'even' && tempo === 'steady' && (!click || click.keeping === 'with')) verdict = 'clean';
  else if (accuracy < 0.7 || evenness === 'uneven') verdict = 'not-yet';
  else verdict = 'close';

  const messages: string[] = [];
  if (empty) {
    messages.push(kind === 'notes' ? 'No notes came through. Check that the microphone hears the guitar, then try again.' : 'No strokes came through. Check that the microphone hears the guitar, then try again.');
  } else {
    if (verdict === 'clean') messages.push(kind === 'notes' ? 'Clean and even.' : 'Even and steady.');
    else if (verdict === 'close') messages.push('Nearly there.');
    else messages.push('Not clean yet. Here is what to work on.');

    if (kind === 'notes') {
      const n = timedIdx.length;
      const notHeard = missed.filter((i) => !wrong.includes(i));
      const want = (e: ExpectedNote): string => (e.midi !== null ? nameOf(e.midi) : 'the written note');
      if (missed.length === 0) messages.push(`All ${n} notes were right.`);
      if (wrong.length === 1) messages.push(`1 of ${n} notes was a different note: ${where(expected[wrong[0]])} should be ${want(expected[wrong[0]])}.`);
      else if (wrong.length > 1) messages.push(`${wrong.length} of ${n} notes were different notes; the first: ${where(expected[wrong[0]])} should be ${want(expected[wrong[0]])}.`);
      if (notHeard.length) messages.push(`${notHeard.length} of ${n} notes did not come through; the first at ${where(expected[notHeard[0]])} (${want(expected[notHeard[0]])}).`);
    } else {
      const lost = expected.length - fit.matches.length;
      messages.push(lost === 0 ? `All ${expected.length} strokes came through.` : `${fit.matches.length} of ${expected.length} strokes came through.`);
    }

    if (fit.matches.length >= 3) {
      if (evenness === 'even') messages.push(`Timing: on average ${Math.round(fit.rmsMs)} ms from an even pulse.`);
      else messages.push(`Timing: on average ${Math.round(fit.rmsMs)} ms from an even pulse (aim for under ${Math.round(limit)} ms).`);
      if (worst && Math.abs(worst.ms) >= limit * 1.5 && evenness !== 'even') {
        messages.push(`The furthest was bar ${worst.bar}, note ${worst.beat}: ${Math.abs(worst.ms)} ms ${worst.ms > 0 ? 'late' : 'early'}.`);
      }
      if (tempo === 'rushing') messages.push(`You were rushing: about ${playedBpm} BPM against the click at ${Math.round(bpm)}.`);
      if (tempo === 'dragging') messages.push(`You were dragging: about ${playedBpm} BPM against the click at ${Math.round(bpm)}.`);
      if (click) {
        const ms = Math.abs(click.offsetMs);
        if (click.keeping === 'with') messages.push(`With the click: ${ms <= 5 ? 'right on it' : `${ms} ms ${click.offsetMs > 0 ? 'behind' : 'ahead of'} it`} on average.`);
        // More than half a note off is not a feel: the take came in early or late (a beat or more).
        else if (ms > (timedGap * 1000) / 2) messages.push(`Not in step with the click: you came in about ${(ms / 1000).toFixed(1)} s ${click.offsetMs > 0 ? 'late' : 'early'}. Start on the first beat after the count-in.`);
        else if (click.keeping === 'behind') messages.push(`Even, but about ${ms} ms behind the click: play with the click, not after you hear it.`);
        else messages.push(`Even, but about ${ms} ms ahead of the click: let the click lead, and land with it.`);
      }
    }
    if (intonation) {
      const c = Math.round(intonation.medianCents);
      if (Math.abs(c) <= 10) messages.push(`In tune: the notes were ${Math.abs(c)} cents from true on average.`);
      else messages.push(`The notes were ${Math.abs(c)} cents ${c > 0 ? 'sharp' : 'flat'} on average${c > 0 ? ': you may be pressing harder than you need' : ''}.`);
    }
  }

  return {
    kind,
    empty,
    expected: kind === 'notes' ? timedIdx.length : expected.length,
    heard,
    accuracy,
    missed,
    timing: { rmsMs: fit.rmsMs, maxMs: fit.maxMs, spread, evenness, tempo, playedBpm, click },
    worst,
    intonation,
    score,
    verdict,
    noteStates,
    messages,
  };
}
