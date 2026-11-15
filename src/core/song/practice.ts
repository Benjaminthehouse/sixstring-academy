/**
 * Practice modes as pure state machines. They take detected-pitch events as input (the pitch
 * module's `NoteOnEvent` and `ChromaEvent` fit as they are) and know nothing about audio:
 *
 *  - WaitMode: the song waits on each beat until the expected note (or chord) is heard.
 *  - FlowMode: the song keeps time; every expected note is judged perfect / good / early / late /
 *    missed against timing windows, with score, combo, accuracy and a per-bar heat map.
 *
 * Pitch matching: a single note matches within a tolerance in cents (optionally in any octave);
 * a chord matches by pitch-class set (from note-ons) or by a chroma score (from chroma frames).
 */
import { chordPcs, isNoChord } from '@/core/theory';
import { soundingPitch, trackCapo, trackTuning } from './model';
import { defaultVoicing } from './schedule';
import type { SongTimeline, TimelineBeat } from './timeline';

/** A string and fret (the same shape as the guitar engine's `FretPosition`). */
export interface FretPositionLike {
  string: number;
  fret: number;
}

/** A note heard by the pitch detector (the pitch module's `NoteOnEvent` is one). */
export interface HeardNote {
  /** When the note started. WaitMode: any clock; FlowMode: song seconds at the practice tempo. */
  time: number;
  /** Nearest MIDI note. */
  midi: number;
  /** Measured frequency (Hz), for cents against the expected note. */
  freq?: number;
  /** Deviation from `midi` in cents, when no frequency is given. */
  cents?: number;
}

/** A chroma frame from the polyphonic analyser (the pitch module's `ChromaEvent` is one). */
export interface HeardChroma {
  time: number;
  /** Energy per pitch class, C = 0 … B = 11. */
  chroma: readonly number[];
  /** Pitch class of the lowest clear note, or -1. */
  bass?: number;
}

/** One thing the learner has to play: a beat of the practice track with struck, pitched notes. */
export interface PracticeTarget {
  /** Position in the target list. */
  index: number;
  /** Absolute tick and seconds (at the written tempo) in the timeline. */
  tick: number;
  sec: number;
  /** Song bar and playback-order bar. */
  bar: number;
  playbackIndex: number;
  /** Sounding pitches to hear, low to high (harmonics at their sounding pitch, dead notes left out). */
  midis: number[];
  /** Their pitch classes (unique). */
  pcs: number[];
  /** Two or more pitch classes: matched as a chord. */
  chord: boolean;
  /** Where they are played, for hints and a fretboard. */
  positions: FretPositionLike[];
  /** The chord symbol strummed, for a slash beat of a rhythm track. */
  symbol?: string;
  beat: TimelineBeat;
}

/**
 * The beats of a track that the learner plays, in order (ties, rests and dead-only beats skipped).
 * A rhythm track's slashes are targets too: the chord in force, as its pitch classes, with the
 * shape it is strummed in (its voicing, or the guitar engine's first one) for hints.
 */
export function practiceTargets(timeline: SongTimeline, trackId: string, opts: { fromTick?: number; toTick?: number } = {}): PracticeTarget[] {
  const out: PracticeTarget[] = [];
  const track = timeline.song.tracks.find((t) => t.id === trackId);
  const tuning = track ? trackTuning(timeline.song, track) : timeline.song.tuning;
  const capo = track ? trackCapo(timeline.song, track) : timeline.song.capo;
  for (const b of timeline.trackBeats(trackId)) {
    if (opts.fromTick !== undefined && b.tick < opts.fromTick) continue;
    if (opts.toTick !== undefined && b.tick >= opts.toTick) break;
    if (b.source.slash) {
      if (b.source.mutedStrum) continue;
      const chord = timeline.chordAt(b.tick);
      if (!chord || isNoChord(chord.symbol)) continue;
      let pcs: number[];
      try {
        pcs = [...new Set(chordPcs(chord.symbol))];
      } catch {
        continue;
      }
      const frets = chord.voicing ?? defaultVoicing(chord.symbol, tuning, capo) ?? [];
      const positions = frets.flatMap((f, i) => (f === null ? [] : [{ string: tuning.length - i, fret: f }]));
      const midis = frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + capo + f])).sort((a, c) => a - c);
      out.push({ index: out.length, tick: b.tick, sec: b.sec, bar: b.bar, playbackIndex: b.index, midis, pcs, chord: pcs.length >= 2, positions, symbol: chord.symbol, beat: b });
      continue;
    }
    const struck = b.notes.filter((n) => !n.tie);
    const pitched = struck.map((n) => ({ n, p: soundingPitch(n) })).filter((x): x is { n: typeof x.n; p: number } => x.p !== null);
    if (!pitched.length) continue;
    const midis = pitched.map((x) => x.p).sort((a, c) => a - c);
    const pcs = [...new Set(midis.map((m) => ((Math.round(m) % 12) + 12) % 12))];
    out.push({
      index: out.length, tick: b.tick, sec: b.sec, bar: b.bar, playbackIndex: b.index, midis, pcs, chord: pcs.length >= 2,
      positions: pitched.map((x) => ({ string: x.n.string, fret: x.n.fret })), beat: b,
    });
  }
  return out;
}

/** Cents from an expected MIDI note to a heard one (positive = sharp). */
export function centsOff(expected: number, heard: HeardNote): number {
  if (heard.freq && heard.freq > 0) return 1200 * Math.log2(heard.freq / (440 * 2 ** ((expected - 69) / 12)));
  return (heard.midi - expected) * 100 + (heard.cents ?? 0);
}

/** Does a heard note match an expected pitch? With `octaveLenient` any octave counts. Returns the cents off, or null. */
export function matchNote(expected: number, heard: HeardNote, toleranceCents = 50, octaveLenient = false): number | null {
  let c = centsOff(expected, heard);
  if (octaveLenient) c = ((((c + 600) % 1200) + 1200) % 1200) - 600;
  return Math.abs(c) <= toleranceCents ? c : null;
}

/**
 * How well a chroma frame shows a chord: `share` = energy in the chord's pitch classes over all
 * energy, `coverage` = fraction of the chord's pitch classes clearly present, `score` = both.
 */
export function chromaScore(chroma: readonly number[], pcs: readonly number[]): { score: number; share: number; coverage: number } {
  const total = chroma.reduce((s, x) => s + Math.max(0, x), 0);
  const max = Math.max(1e-9, ...chroma);
  if (total <= 1e-9 || !pcs.length) return { score: 0, share: 0, coverage: 0 };
  const share = pcs.reduce((s, pc) => s + Math.max(0, chroma[pc] ?? 0), 0) / total;
  const coverage = pcs.filter((pc) => (chroma[pc] ?? 0) / max >= 0.25).length / pcs.length;
  return { score: share * coverage, share, coverage };
}

/** True when a chroma frame is a good enough rendition of a chord. */
export function chromaMatches(chroma: readonly number[], pcs: readonly number[], threshold = 0.6): boolean {
  const s = chromaScore(chroma, pcs);
  const needed = pcs.length >= 4 ? 0.75 : 1;
  return s.share >= threshold && s.coverage >= needed - 1e-9;
}

/** Pitch-class set score of note-ons heard for a chord: covered share minus half the share of wrong classes. */
export function pitchClassScore(heard: Iterable<number>, pcs: readonly number[]): number {
  const set = new Set([...heard].map((m) => ((m % 12) + 12) % 12));
  const want = new Set(pcs);
  let covered = 0;
  let extra = 0;
  for (const pc of set) {
    if (want.has(pc)) covered++;
    else extra++;
  }
  return pcs.length ? covered / pcs.length - (0.5 * extra) / pcs.length : 0;
}

// ── Wait mode ─────────────────────────────────────────────────────────────────────────────

/** Options for `WaitMode`. */
export interface WaitModeOptions {
  /** How far a note may be from the expected one (default 50 cents: the nearest note). */
  toleranceCents?: number;
  /** Accept the right note in any octave (default false). */
  octaveLenient?: boolean;
  /** Pitch-class score a chord needs from note-ons (default 0.99: every chord tone, nothing wrong). */
  chordThreshold?: number;
  /** Chroma share a chord needs from a chroma frame (default 0.6). */
  chromaThreshold?: number;
  /** Seconds that note-ons stay counted towards a chord (default 1.5). */
  chordWindow?: number;
  /** A second note-on of the pitch just matched within this many seconds is the detector firing twice, not a new note (default 0.15). */
  retrigger?: number;
  /**
   * The pitch just matched heard again (the note still ringing, re-detected) is ignored rather than
   * called wrong for this many seconds, unless it is what the current target wants (default 2).
   */
  holdWindow?: number;
}

/** What a heard event did in wait mode. */
export interface WaitResult {
  kind: 'match' | 'partial' | 'wrong' | 'ignored' | 'done';
  /** The target that was matched, or the one still waiting. */
  target: PracticeTarget | null;
  /** For single notes: cents off the expected pitch. */
  cents?: number;
  /** The next target after a match (null at the end). */
  next?: PracticeTarget | null;
  /** A wrong note that is the right pitch an octave (or two) off: say so rather than just "wrong". */
  octave?: boolean;
}

/** Per-target record of a wait-mode run. */
export interface WaitRecord {
  index: number;
  bar: number;
  attempts: number;
  wrong: number;
  hints: number;
  skipped: boolean;
  matched: boolean;
  /** Time from the target becoming current to the match (in the event clock), when matched. */
  took?: number;
}

/**
 * Wait mode: the current target waits until it is played. Feed every `noteon` (and, for chords,
 * `chroma`) event; on a match it moves to the next target, which the player then plays up to.
 */
export class WaitMode {
  private i = 0;
  private readonly heard: Array<{ time: number; midi: number }> = [];
  private readonly records: WaitRecord[];
  private since: number | null = null;
  private last: { target: PracticeTarget; time: number } | null = null;
  private readonly o: Required<WaitModeOptions>;

  constructor(readonly targets: readonly PracticeTarget[], opts: WaitModeOptions = {}) {
    this.o = { toleranceCents: 50, octaveLenient: false, chordThreshold: 0.99, chromaThreshold: 0.6, chordWindow: 1.5, retrigger: 0.15, holdWindow: 2, ...opts };
    this.records = targets.map((t) => ({ index: t.index, bar: t.bar, attempts: 0, wrong: 0, hints: 0, skipped: false, matched: false }));
  }

  /** The target being waited for (null when done). */
  get current(): PracticeTarget | null {
    return this.targets[this.i] ?? null;
  }

  /** Index of the current target. */
  get index(): number {
    return this.i;
  }

  /** True after the last target. */
  get done(): boolean {
    return this.i >= this.targets.length;
  }

  /** A note was heard. */
  hear(e: HeardNote): WaitResult {
    const t = this.current;
    if (!t) return { kind: 'done', target: null };
    // The note just matched, heard again: the detector firing twice, or the note still ringing.
    const since = this.last ? e.time - this.last.time : null;
    const lastHas = (lenient: boolean) => !!this.last && this.last.target.midis.some((m) => matchNote(m, e, this.o.toleranceCents, lenient) !== null);
    if (since !== null && since >= 0 && since <= this.o.retrigger && lastHas(true)) return { kind: 'ignored', target: t };
    const wanted = t.chord ? t.pcs.includes(((Math.round(e.midi) % 12) + 12) % 12) : t.midis.some((m) => matchNote(m, e, this.o.toleranceCents, this.o.octaveLenient) !== null);
    if (since !== null && since >= 0 && since <= this.o.holdWindow && !wanted && lastHas(false)) return { kind: 'ignored', target: t };
    if (this.since === null) this.since = e.time;
    const rec = this.records[this.i];
    if (!t.chord) {
      rec.attempts++;
      let best: number | null = null;
      for (const m of t.midis) {
        const c = matchNote(m, e, this.o.toleranceCents, this.o.octaveLenient);
        if (c !== null && (best === null || Math.abs(c) < Math.abs(best))) best = c;
      }
      if (best === null) {
        rec.wrong++;
        const octave = t.midis.some((m) => matchNote(m, e, this.o.toleranceCents, true) !== null);
        return { kind: 'wrong', target: t, cents: centsOff(t.midis[0], e), ...(octave ? { octave: true } : {}) };
      }
      return this.advance(e.time, best);
    }
    // A chord: collect recent note-ons and compare pitch-class sets.
    this.heard.push({ time: e.time, midi: e.midi });
    while (this.heard.length && e.time - this.heard[0].time > this.o.chordWindow) this.heard.shift();
    const score = pitchClassScore(this.heard.map((h) => h.midi), t.pcs);
    if (score >= this.o.chordThreshold) {
      rec.attempts++;
      return this.advance(e.time);
    }
    const pc = ((e.midi % 12) + 12) % 12;
    if (!t.pcs.includes(pc)) {
      rec.wrong++;
      rec.attempts++;
      return { kind: 'wrong', target: t };
    }
    return { kind: 'partial', target: t };
  }

  /** A chroma frame was heard (chords only; single notes ignore it). */
  hearChroma(e: HeardChroma): WaitResult {
    const t = this.current;
    if (!t) return { kind: 'done', target: null };
    if (!t.chord) return { kind: 'ignored', target: t };
    if (this.since === null) this.since = e.time;
    if (chromaMatches(e.chroma, t.pcs, this.o.chromaThreshold)) {
      this.records[this.i].attempts++;
      return this.advance(e.time);
    }
    return { kind: 'ignored', target: t };
  }

  private advance(time: number, cents?: number): WaitResult {
    const t = this.current!;
    const rec = this.records[this.i];
    if (this.since !== null) rec.took = time - this.since;
    rec.matched = true;
    this.i++;
    this.heard.length = 0;
    this.since = null;
    this.last = { target: t, time };
    return { kind: 'match', target: t, ...(cents !== undefined ? { cents: Math.round(cents) } : {}), next: this.current };
  }

  /** Give up on the current target and move on. */
  skip(): PracticeTarget | null {
    if (this.done) return null;
    this.records[this.i].skipped = true;
    this.i++;
    this.heard.length = 0;
    this.since = null;
    this.last = null;
    return this.current;
  }

  /** Where to play the current target (counted as a hint). */
  hint(): { positions: FretPositionLike[]; midis: number[] } | null {
    const t = this.current;
    if (!t) return null;
    this.records[this.i].hints++;
    return { positions: t.positions, midis: t.midis };
  }

  /** Jump to a target (for "start from bar 5"). */
  goTo(index: number): void {
    this.i = Math.max(0, Math.min(this.targets.length, Math.floor(index)));
    this.heard.length = 0;
    this.since = null;
    this.last = null;
  }

  /** Start again from the first target, forgetting the record. */
  reset(): void {
    this.goTo(0);
    for (const r of this.records) {
      Object.assign(r, { attempts: 0, wrong: 0, hints: 0, skipped: false, matched: false });
      delete r.took;
    }
  }

  /** What happened per target, and totals. */
  summary(): { records: WaitRecord[]; matched: number; skipped: number; wrong: number; hints: number; firstTry: number } {
    return {
      records: this.records.map((r) => ({ ...r })),
      matched: this.records.filter((r) => r.matched).length,
      skipped: this.records.filter((r) => r.skipped).length,
      wrong: this.records.reduce((s, r) => s + r.wrong, 0),
      hints: this.records.reduce((s, r) => s + r.hints, 0),
      firstTry: this.records.filter((r) => r.matched && r.wrong === 0).length,
    };
  }
}

// ── Flow mode ─────────────────────────────────────────────────────────────────────────────

/** A target in flow mode: when (song seconds at the practice tempo) and what. */
export interface FlowTarget {
  index: number;
  /** Song seconds at the practice tempo (what `player.songTimeAt` gives for the same moment). */
  time: number;
  /** Song seconds at the written tempo (`time` is this divided by the tempo factor). */
  sec: number;
  /** How long the target sounds (seconds at the practice tempo). */
  duration: number;
  bar: number;
  midis: number[];
  pcs: number[];
  chord: boolean;
}

/** Timing windows in seconds (each one either side of the target). */
export interface FlowWindows {
  perfect: number;
  good: number;
  /** Beyond `good` and within this: early or late. Beyond it: not this target. */
  ok: number;
}

/** Default windows: ±45 ms perfect, ±90 ms good, ±170 ms early/late. */
export const DEFAULT_FLOW_WINDOWS: Readonly<FlowWindows> = { perfect: 0.045, good: 0.09, ok: 0.17 };

/** Judgement of one target (or of a wrong note). */
export type FlowGrade = 'perfect' | 'good' | 'early' | 'late' | 'missed' | 'wrong';

/** One judgement, in order. */
export interface FlowJudgement {
  grade: FlowGrade;
  target: FlowTarget | null;
  /** Heard time minus target time (seconds; negative = early). */
  offset?: number;
  /** Points scored (with the combo bonus). */
  points: number;
  combo: number;
  bar: number;
}

/** Mistakes and hits of one bar, for "practise your weak bars". */
export interface BarHeat {
  bar: number;
  targets: number;
  perfect: number;
  good: number;
  early: number;
  late: number;
  missed: number;
  wrong: number;
  /** 0–100. */
  accuracy: number;
  /** missed + wrong + early + late. */
  mistakes: number;
}

/** The result of a flow-mode run. */
export interface FlowResult {
  score: number;
  maxScore: number;
  combo: number;
  maxCombo: number;
  /** 0–100: perfect counts 1, good 0.8, early/late 0.5, missed 0, over the targets judged. */
  accuracy: number;
  counts: Record<FlowGrade, number>;
  bars: BarHeat[];
  /** Bars with mistakes, worst first (most mistakes per target). */
  weakBars: number[];
  /** Targets judged so far and in all. */
  judged: number;
  total: number;
}

/** Options for `FlowMode`. */
export interface FlowModeOptions {
  windows?: Partial<FlowWindows>;
  toleranceCents?: number;
  octaveLenient?: boolean;
  /** Pitch-class score a chord needs from note-ons inside its window (default 0.66). */
  chordThreshold?: number;
  chromaThreshold?: number;
  /** Count wrong notes near a target as mistakes that break the combo (default true). */
  punishWrong?: boolean;
  /** Longest gap (seconds) at which a second note-on of the pitch just hit is the detector firing twice (default 0.07, at most half the gap to the next target). */
  retrigger?: number;
}

const POINTS: Record<FlowGrade, number> = { perfect: 100, good: 70, early: 40, late: 40, missed: 0, wrong: 0 };
const ACCURACY: Record<FlowGrade, number> = { perfect: 1, good: 0.8, early: 0.5, late: 0.5, missed: 0, wrong: 0 };

/** Combo bonus: +2 % per note of combo, up to +100 % at 50. */
function multiplier(combo: number): number {
  return 1 + Math.min(combo, 50) * 0.02;
}

/** Flow targets from practice targets: times converted to the practice tempo. */
export function flowTargets(targets: readonly PracticeTarget[], opts: { tempoPercent?: number; startSec?: number } = {}): FlowTarget[] {
  const scale = (opts.tempoPercent ?? 100) / 100;
  const start = opts.startSec ?? 0;
  return targets.map((t, index) => ({ index, time: (t.sec - start) / scale, sec: t.sec - start, duration: t.beat.durSec / scale, bar: t.bar, midis: [...t.midis], pcs: [...t.pcs], chord: t.chord }));
}

/**
 * Flow mode: feed heard notes (times in song seconds at the practice tempo) and call `advance(now)`
 * regularly so passed targets count as missed. Pure: no clock of its own.
 */
export class FlowMode {
  private readonly judged = new Map<number, FlowJudgement>();
  private readonly log: FlowJudgement[] = [];
  private readonly chordHeard = new Map<number, Array<{ time: number; midi: number }>>();
  private readonly heat = new Map<number, BarHeat>();
  private cursor = 0;
  private comboNow = 0;
  private maxComboNow = 0;
  private scoreNow = 0;
  private passes = 0;
  private lastHit: { target: FlowTarget; time: number } | null = null;
  /** The tempo factor the target times are in. */
  private scale: number;
  private readonly w: FlowWindows;
  private readonly o: Required<Omit<FlowModeOptions, 'windows'>>;

  constructor(readonly targets: FlowTarget[], opts: FlowModeOptions = {}) {
    this.w = { ...DEFAULT_FLOW_WINDOWS, ...opts.windows };
    this.o = { toleranceCents: 50, octaveLenient: false, chordThreshold: 0.66, chromaThreshold: 0.6, punishWrong: true, retrigger: 0.07, ...opts };
    for (const t of targets) this.heatOf(t.bar).targets++;
    const timed = targets.find((t) => t.time > 0 && t.sec > 0);
    this.scale = timed ? timed.sec / timed.time : 1;
  }

  private heatOf(bar: number): BarHeat {
    let h = this.heat.get(bar);
    if (!h) {
      h = { bar, targets: 0, perfect: 0, good: 0, early: 0, late: 0, missed: 0, wrong: 0, accuracy: 100, mistakes: 0 };
      this.heat.set(bar, h);
    }
    return h;
  }

  private grade(offset: number): FlowGrade {
    const a = Math.abs(offset);
    if (a <= this.w.perfect) return 'perfect';
    if (a <= this.w.good) return 'good';
    return offset < 0 ? 'early' : 'late';
  }

  private record(grade: FlowGrade, target: FlowTarget | null, bar: number, offset?: number): FlowJudgement {
    const hit = grade !== 'missed' && grade !== 'wrong';
    if (hit) this.comboNow++;
    else if (grade === 'missed' || this.o.punishWrong) this.comboNow = 0;
    this.maxComboNow = Math.max(this.maxComboNow, this.comboNow);
    const points = Math.round(POINTS[grade] * (hit ? multiplier(this.comboNow - 1) : 1));
    this.scoreNow += points;
    const j: FlowJudgement = { grade, target, ...(offset !== undefined ? { offset: Math.round(offset * 1000) / 1000 } : {}), points, combo: this.comboNow, bar };
    if (target) this.judged.set(target.index, j);
    if (target && hit) this.lastHit = { target, time: this.lastHit?.target === target ? this.lastHit.time : (offset !== undefined ? target.time + offset : target.time) };
    this.log.push(j);
    const h = this.heatOf(bar);
    h[grade]++;
    return j;
  }

  /** Targets whose window contains a time, not yet judged, earliest first. */
  private open(time: number): FlowTarget[] {
    const out: FlowTarget[] = [];
    for (let i = this.cursor; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.time - this.w.ok > time) break;
      if (!this.judged.has(t.index) && Math.abs(time - t.time) <= this.w.ok) out.push(t);
    }
    return out;
  }

  /**
   * A note was heard. Returns the judgement it caused, or null when it was noise far from any target,
   * the detector firing twice on a note just hit, that note still ringing, or an octave slip.
   */
  hear(e: HeardNote): FlowJudgement | null {
    this.advance(e.time - this.w.ok);
    const tol = this.o.toleranceCents;
    const last = this.lastHit;
    const echo = last && last.target.midis.some((m) => matchNote(m, e, tol, true) !== null) ? e.time - last.time : null;
    const exactEcho = !!last && last.target.midis.some((m) => matchNote(m, e, tol, false) !== null);
    if (last && echo !== null && echo >= 0) {
      const next = this.targets[last.target.index + 1];
      const guard = Math.min(this.o.retrigger, next ? 0.5 * (next.time - last.target.time) : Infinity);
      if (echo <= guard) return null;
    }
    const open = this.open(e.time);
    const pc = ((Math.round(e.midi) % 12) + 12) % 12;
    for (const t of open) {
      if (!t.chord) {
        if (t.midis.some((m) => matchNote(m, e, tol, this.o.octaveLenient) !== null)) return this.record(this.grade(e.time - t.time), t, t.bar, e.time - t.time);
        continue;
      }
      const list = this.chordHeard.get(t.index) ?? [];
      list.push({ time: e.time, midi: e.midi });
      this.chordHeard.set(t.index, list);
      if (t.pcs.includes(pc) && pitchClassScore(list.map((x) => x.midi), t.pcs) >= this.o.chordThreshold) {
        // A strum is judged by when it began: the first note of it that was heard.
        const first = Math.min(...list.filter((x) => t.pcs.includes(((Math.round(x.midi) % 12) + 12) % 12)).map((x) => x.time));
        return this.record(this.grade(first - t.time), t, t.bar, first - t.time);
      }
      if (t.pcs.includes(pc)) return null;
    }
    // The note just hit, still ringing and heard again: not a new (wrong) note.
    if (last && exactEcho && echo !== null && echo >= 0 && echo <= Math.max(this.o.retrigger, last.target.duration)) return null;
    // The right pitch an octave off: a detector slip as often as a real mistake; it neither scores nor breaks the combo.
    if (!this.o.octaveLenient && open.some((t) => !t.chord && t.midis.some((m) => matchNote(m, e, tol, true) !== null))) return null;
    const near = open[0];
    if (near && (!near.chord || !near.pcs.includes(pc))) return this.record('wrong', null, near.bar, e.time - near.time);
    return null;
  }

  /** A chroma frame was heard (judges chord targets). */
  hearChroma(e: HeardChroma): FlowJudgement | null {
    this.advance(e.time - this.w.ok);
    for (const t of this.open(e.time)) {
      if (t.chord && chromaMatches(e.chroma, t.pcs, this.o.chromaThreshold)) return this.record(this.grade(e.time - t.time), t, t.bar, e.time - t.time);
    }
    return null;
  }

  /** Count as missed every target whose window has passed by `now`. Returns those judgements. */
  advance(now: number): FlowJudgement[] {
    const out: FlowJudgement[] = [];
    while (this.cursor < this.targets.length) {
      const t = this.targets[this.cursor];
      if (this.judged.has(t.index)) {
        this.cursor++;
        continue;
      }
      if (t.time + this.w.ok >= now) break;
      out.push(this.record('missed', t, t.bar));
      this.cursor++;
    }
    return out;
  }

  /** End the run: everything left is missed. */
  finish(): FlowResult {
    this.advance(Infinity);
    return this.result();
  }

  /**
   * The practice tempo changed (the speed trainer, or the learner): the targets not yet judged move
   * to it, so they keep matching `player.songTimeAt`, which always uses the current tempo.
   */
  setTempoPercent(percent: number): void {
    const scale = Math.max(0.05, percent / 100);
    const ratio = this.scale / scale;
    for (const t of this.targets) {
      t.time = t.sec / scale;
      t.duration *= ratio;
    }
    this.scale = scale;
  }

  /** Start another pass over the same targets (a loop), at a new practice tempo if given; the bar heat map keeps adding up. */
  nextPass(opts: { tempoPercent?: number } = {}): void {
    this.advance(Infinity);
    if (opts.tempoPercent !== undefined) this.setTempoPercent(opts.tempoPercent);
    this.passes++;
    this.judged.clear();
    this.chordHeard.clear();
    this.cursor = 0;
    this.lastHit = null;
    for (const t of this.targets) this.heatOf(t.bar).targets++;
  }

  /** Every judgement so far, in order. */
  get judgements(): readonly FlowJudgement[] {
    return this.log;
  }

  /** Score, combo, accuracy, counts and the heat map so far. */
  result(): FlowResult {
    const counts: Record<FlowGrade, number> = { perfect: 0, good: 0, early: 0, late: 0, missed: 0, wrong: 0 };
    for (const j of this.log) counts[j.grade]++;
    const graded = this.log.filter((j) => j.target);
    const accuracy = graded.length ? (100 * graded.reduce((s, j) => s + ACCURACY[j.grade], 0)) / graded.length : 100;
    let maxScore = 0;
    for (let k = 0; k < this.targets.length * (this.passes + 1); k++) maxScore += Math.round(100 * multiplier(k));
    const bars = [...this.heat.values()].sort((a, b) => a.bar - b.bar).map((h) => {
      const judgedHere = h.perfect + h.good + h.early + h.late + h.missed;
      const acc = judgedHere ? (100 * (h.perfect + 0.8 * h.good + 0.5 * (h.early + h.late))) / judgedHere : 100;
      return { ...h, accuracy: Math.round(acc * 10) / 10, mistakes: h.missed + h.wrong + h.early + h.late };
    });
    const weakBars = bars.filter((b) => b.mistakes > 0).sort((a, b) => b.mistakes / Math.max(1, b.targets) - a.mistakes / Math.max(1, a.targets) || a.bar - b.bar).map((b) => b.bar);
    return {
      score: this.scoreNow, maxScore, combo: this.comboNow, maxCombo: this.maxComboNow, accuracy: Math.round(accuracy * 10) / 10,
      counts, bars, weakBars, judged: graded.length, total: this.targets.length * (this.passes + 1),
    };
  }
}

/**
 * What to practise after a flow run: the weak bars merged into ranges of neighbouring bars,
 * worst first (mistakes per target), at most `max` of them (default 3). Feed a range to
 * `extractBars(song, from, to + 1)` or `player.setLoop(from, to)`.
 */
export function weakBarRanges(result: FlowResult, opts: { max?: number } = {}): Array<{ from: number; to: number; mistakes: number; targets: number }> {
  const weak = result.bars.filter((b) => b.mistakes > 0).sort((a, b) => a.bar - b.bar);
  const ranges: Array<{ from: number; to: number; mistakes: number; targets: number }> = [];
  for (const b of weak) {
    const last = ranges[ranges.length - 1];
    if (last && b.bar === last.to + 1) {
      last.to = b.bar;
      last.mistakes += b.mistakes;
      last.targets += b.targets;
    } else ranges.push({ from: b.bar, to: b.bar, mistakes: b.mistakes, targets: b.targets });
  }
  return ranges.sort((a, b) => b.mistakes / Math.max(1, b.targets) - a.mistakes / Math.max(1, a.targets) || a.from - b.from).slice(0, opts.max ?? 3);
}
