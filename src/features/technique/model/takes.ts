/**
 * Judging one microphone take of an exercise: which notes were right (pitch), how even the timing
 * was and whether the learner kept the click's tempo. Pure: the screen records notes and onsets
 * with `@/core/pitch` and hands them here.
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

/** Note name for messages ("C4"), with ♯. */
function nameOf(midi: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const m = Math.round(midi);
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const where = (e: ExpectedNote): string => `bar ${e.bar + 1}, beat ${e.beat + 1}`;

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
  const noteStates: Record<string, 'hit' | 'miss'> = {};
  let intonation: TakeResult['intonation'] = null;
  if (kind === 'notes') {
    const wanted = timedIdx.map((i) => expected[i].midi as number);
    const cmp = compareNotes(notes, wanted, { octaves: 'any' });
    accuracy = cmp.accuracy;
    missed = cmp.missed.map((k) => timedIdx[k]);
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
  const score = empty ? 0 : Math.round(100 * (0.5 * accuracy + 0.4 * timingScore + 0.1 * tempoScore));

  let verdict: Verdict;
  if (empty) verdict = 'not-yet';
  else if (accuracy >= 0.9 && evenness === 'even' && tempo === 'steady') verdict = 'clean';
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
      const wrong = missed.length;
      if (wrong === 0) messages.push(`All ${timedIdx.length} notes were right.`);
      else {
        const first = expected[missed[0]];
        const want = first.midi !== null ? ` (${nameOf(first.midi)})` : '';
        messages.push(`${wrong} of ${timedIdx.length} notes were missing or wrong; the first at ${where(first)}${want}.`);
      }
    } else {
      const lost = expected.length - fit.matches.length;
      messages.push(lost === 0 ? `All ${expected.length} strokes came through.` : `${fit.matches.length} of ${expected.length} strokes came through.`);
    }

    if (fit.matches.length >= 3) {
      if (evenness === 'even') messages.push(`Timing: on average ${Math.round(fit.rmsMs)} ms from an even pulse.`);
      else messages.push(`Timing: on average ${Math.round(fit.rmsMs)} ms from an even pulse (aim for under ${Math.round(limit)} ms).`);
      if (worst && Math.abs(worst.ms) >= limit * 1.5 && evenness !== 'even') {
        messages.push(`The furthest was bar ${worst.bar}, beat ${worst.beat}: ${Math.abs(worst.ms)} ms ${worst.ms > 0 ? 'late' : 'early'}.`);
      }
      if (tempo === 'rushing') messages.push(`You were rushing: about ${playedBpm} BPM against the click at ${Math.round(bpm)}.`);
      if (tempo === 'dragging') messages.push(`You were dragging: about ${playedBpm} BPM against the click at ${Math.round(bpm)}.`);
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
    timing: { rmsMs: fit.rmsMs, maxMs: fit.maxMs, spread, evenness, tempo, playedBpm },
    worst,
    intonation,
    score,
    verdict,
    noteStates,
    messages,
  };
}
