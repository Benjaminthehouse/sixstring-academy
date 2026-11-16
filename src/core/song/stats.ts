/**
 * Song statistics (range, positions, note counts, techniques) and the automatic difficulty
 * estimate: ten factors scored 0–1 (speed, fastest notes, stretches, neck positions and shifts,
 * techniques, rhythm, chords, independent voices, endurance, muting), combined so the hardest
 * element dominates, then mapped to a 1–10 level and a beginner / intermediate / expert band.
 */
import { assignFingers, chordDifficulty, voicingDifficulty } from '@/core/guitar';
import { isNoChord, midiToNote } from '@/core/theory';
import { findTrack, trackTuning, valueFromTicks } from './model';
import { flattenSong, type SongTimeline, type TimelineBeat } from './timeline';
import type { Note, Song, Track } from './types';
import { PPQ } from './types';

/** Technique names used in statistics. */
export type TechniqueName =
  | 'tie' | 'hammer-on' | 'pull-off' | 'slide' | 'slide-in' | 'slide-out' | 'bend' | 'release' | 'pre-bend' | 'vibrato'
  | 'palm-mute' | 'dead-note' | 'ghost-note' | 'natural-harmonic' | 'artificial-harmonic' | 'let-ring' | 'staccato' | 'accent' | 'tapping'
  | 'fingerstyle' | 'strumming';

/** Techniques a note uses. */
export function noteTechniques(n: Note): TechniqueName[] {
  const out: TechniqueName[] = [];
  if (n.tie) out.push('tie');
  if (n.legato === 'hammer') out.push('hammer-on');
  if (n.legato === 'pull') out.push('pull-off');
  if (n.slide) out.push('slide');
  if (n.slideIn) out.push('slide-in');
  if (n.slideOut) out.push('slide-out');
  if (n.bend) out.push(n.bend.pre ? 'pre-bend' : 'bend');
  if (n.bend?.release) out.push('release');
  if (n.vibrato) out.push('vibrato');
  if (n.palmMute) out.push('palm-mute');
  if (n.dead) out.push('dead-note');
  if (n.ghost) out.push('ghost-note');
  if (n.harmonic === 'natural') out.push('natural-harmonic');
  if (n.harmonic === 'artificial') out.push('artificial-harmonic');
  if (n.letRing) out.push('let-ring');
  if (n.staccato) out.push('staccato');
  if (n.accent) out.push('accent');
  if (n.tap) out.push('tapping');
  if (n.pluck) out.push('fingerstyle');
  return out;
}

/** A chord grip held in a track: the frets (low string first, null = not played) and how hard it is to hold. */
export interface ChordShapeStat {
  frets: Array<number | null>;
  /** `voicingDifficulty` of the grip with its easiest fingering, 1–10 (9 when no fingering is comfortable). */
  difficulty: number;
  /** Uses a barre across four or more strings. */
  barre: boolean;
  /** Times it is struck. */
  count: number;
}

/** Statistics of one track. */
export interface TrackStats {
  track: string;
  /** Notes struck (tied continuations not counted). */
  noteCount: number;
  /** Beats with something struck (notes or a strum). */
  onsets: number;
  /** Beats holding two or more notes. */
  chordBeats: number;
  restCount: number;
  /** Sounding range, null for a track without pitched notes. */
  range: { low: number; high: number; lowName: string; highName: string } | null;
  frets: { min: number; max: number } | null;
  /** Frets the fretting hand presses (tapped, dead and open notes left out), null when it presses none. */
  handFrets: { min: number; max: number } | null;
  strings: number[];
  /** Hand positions (fret under the index finger) the part visits, in order of first use. */
  positions: number[];
  /**
   * Times the hand has to move to a new position. The part is cut into as few stretches as
   * possible that each fit one hand (five frets: one finger per fret and one fret of reach);
   * tapped notes belong to the picking hand and never move the fretting hand.
   */
  shifts: number;
  /**
   * Largest number of frets between the lowest and highest fretted note the hand holds at once: a
   * chord, a note held (tied) under new ones, a hammer-on or pull-off pair, or notes played within
   * 0.75 s of each other in one position.
   */
  maxSpan: number;
  techniques: Partial<Record<TechniqueName, number>>;
  /** Onsets per second at the written tempo, over the whole track. */
  notesPerSecond: number;
  /** Shortest time between two onsets, in seconds at the written tempo. */
  fastestGap: number;
  /** Shortest beat duration in ticks. */
  shortestTicks: number;
  tuplets: boolean;
  dotted: boolean;
  /**
   * Share of onsets that are syncopated (0–1): off the beat and either accented, sounding on
   * through the next beat, or followed by nothing struck on the next beat.
   */
  syncopation: number;
  /** Chord grips played in the tab (three or more notes struck together), most used first. */
  shapes: ChordShapeStat[];
  /**
   * Held voices (0–1): the share of onsets where new notes are struck while another voice holds a
   * note: a tie, or a note held by its length while a finger moves to another fret (a let-ring
   * arpeggio over one chord shape is one voice).
   */
  heldVoices: number;
  /**
   * Thumb independence (0–1): over a steady bass pulse (a thumb stroke, on the two lowest strings,
   * alone on the third, or marked p, on at least 70% of the beats or of the half bars), the share of
   * onsets where the fingers pinch with the thumb or strike between its strokes: anywhere off a thumb
   * on every beat (alternating-bass picking), only syncopated against a thumb on the half bars (a
   * bossa; a p-i-m-a arpeggio or a boom-chick strum is one stream, not two voices).
   */
  thumbVoices: number;
  /** Longest run of fast notes (onsets at most 0.2 s apart) without a break, in seconds at the written tempo. */
  enduranceSeconds: number;
  /** Share of that run's notes that repeat the note before them (tremolo), 0–1. */
  enduranceRepeats: number;
  /** Share of strums that are muted (X, or a chord all palm-muted or dead), 0–1. */
  mutedStrums: number;
  /** True when muted and ringing strums alternate (the hand mutes between strums). */
  mutingSwitches: boolean;
}

/** Statistics of a whole song. */
export interface SongStats {
  bars: number;
  /** Bars as played, repeats included. */
  playedBars: number;
  seconds: number;
  tracks: TrackStats[];
  /** Distinct chord symbols on the timeline, in order of appearance. */
  chords: string[];
  /** Chord changes per bar (as played). */
  chordChangesPerBar: number;
}

/** Statistics of a song (all tracks), at its written tempo. */
export function songStats(song: Song): SongStats {
  return songStatsOf(song, flattenSong(song));
}

/** Fret span one hand covers without moving: four frets, one finger each, plus one fret of reach. */
const HAND_SPAN = 4;
/** Fretted notes closer than this (seconds) in one position are under the hand together. */
const TOGETHER_SEC = 0.75;
/** Onsets at most this far apart (seconds) are "fast" for endurance. */
const FAST_GAP_SEC = 0.2;

/** The fretting hand's part of a beat: fretted (not tapped, not dead, not open) notes it holds. */
function handFretsOf(notes: readonly Note[]): number[] {
  return notes.filter((n) => n.fret > 0 && !n.dead && !n.tap).map((n) => n.fret);
}

/** Difficulty of holding a grip, from the guitar engine's fingering and its hand-cost model. */
function shapeDifficulty(frets: Array<number | null>, strummed: boolean): { difficulty: number; barre: boolean } {
  const fingering = assignFingers(frets);
  if (!fingering) return { difficulty: 9, barre: false };
  return {
    difficulty: voicingDifficulty(frets, fingering.fingers, { strummed }),
    barre: fingering.barres.some((b) => b.fromString - b.toString + 1 >= 4),
  };
}

function trackStats(song: Song, track: Track, tl = flattenSong(song)): TrackStats {
  const beats = tl.trackBeats(track.id);
  const tuning = trackTuning(song, track);
  let noteCount = 0;
  let chordBeats = 0;
  let restCount = 0;
  let low = Infinity;
  let high = -Infinity;
  let fmin = Infinity;
  let fmax = -Infinity;
  let hmin = Infinity;
  let hmax = -Infinity;
  const strings = new Set<number>();
  const techniques: Partial<Record<TechniqueName, number>> = {};
  const add = (t: TechniqueName) => (techniques[t] = (techniques[t] ?? 0) + 1);
  const onsetTimes: number[] = [];
  let shortest = Infinity;
  let tuplets = false;
  let dotted = false;
  let onsets = 0;
  const onsetTicks = new Set(beats.filter((b) => b.notes.some((n) => !n.tie) || b.source.slash).map((b) => b.tick));

  // When each struck note stops sounding (ticks): its length, extended by ties on its string.
  const ends = new Map<TimelineBeat, number>();
  const lastStruck = new Map<number, TimelineBeat>();
  // Held voices: a note struck earlier still sounds (tied on, or held by its length) when new notes are struck.
  let heldOnsets = 0;
  const heldUntil = new Map<number, number>();
  // The fret each string was last struck at since the last rest.
  const lastFret = new Map<number, number>();
  for (const b of beats) {
    if (!b.notes.length && !b.source.slash) {
      lastStruck.clear();
      heldUntil.clear();
      lastFret.clear();
      continue;
    }
    if (b.source.slash) ends.set(b, b.tick + b.duration);
    const struck = b.notes.filter((n) => !n.tie);
    const tied = b.notes.filter((n) => n.tie);
    for (const n of tied) {
      const from = lastStruck.get(n.string);
      if (from) ends.set(from, Math.max(ends.get(from) ?? 0, b.tick + b.duration));
    }
    // A tie under new notes is a second voice by how it is written. A note left ringing by its length
    // (an imported file's sustain) is one only when a finger moves meanwhile: an arpeggio left to
    // ring over one chord shape is a single voice, however long its notes sound.
    const ringing = [...heldUntil].some(([s, until]) => until > b.tick && !struck.some((n) => n.string === s));
    const moves = struck.some((n) => lastFret.has(n.string) && lastFret.get(n.string) !== n.fret);
    if (struck.length && (tied.length > 0 || (ringing && moves))) heldOnsets++;
    for (const n of struck) {
      lastFret.set(n.string, n.fret);
      lastStruck.set(n.string, b);
      ends.set(b, Math.max(ends.get(b) ?? 0, b.tick + (n.length ?? b.duration)));
      if (n.length !== undefined && n.length > b.duration) heldUntil.set(n.string, b.tick + n.length);
      else heldUntil.delete(n.string);
    }
  }

  // The fretting hand: groups of fretted notes in playing order, cut into as few positions as fit one hand.
  const groups: Array<{ lo: number; hi: number; sec: number; legatoFrom?: number }> = [];
  const runs: Array<{ lo: number; hi: number }> = [];
  let maxSpan = 0;
  const prevFret = new Map<number, number>();

  let syncopated = 0;
  let strums = 0;
  let muted = 0;
  let lastStrumMuted: boolean | null = null;
  let switches = 0;
  const shapes = new Map<string, ChordShapeStat>();
  const bassOnsets: number[] = [];
  // Onsets of the fingers alone, and whether each is syncopated.
  const trebleOnly: Array<{ tick: number; syncopated: boolean }> = [];
  // Pinches: the thumb and the fingers struck together (see `isPinch`).
  let pinches = 0;
  // The thumb's strokes: a note on one of the two lowest strings, a lone note on the third lowest,
  // or any note marked for the thumb (p). A group on strings 4-2 is the fingers' (i m a).
  const thumbNote = (n: Note) => n.pluck === 'p' || n.string >= tuning.length - 1;
  const thumbStrikes = (struck: Note[]) => struck.some(thumbNote) || (struck.length === 1 && struck[0].string >= tuning.length - 2);
  // A pinch: the thumb and the fingers at once, a string or more apart, the fingers reaching the two
  // top strings. A chord grip on neighbouring strings (a shell, a power chord) is not one.
  const isPinch = (struck: Note[]): boolean => {
    if (struck.length < 2 || struck.length > 4) return false;
    const thumb = struck.filter(thumbNote);
    const fingers = struck.filter((n) => !thumbNote(n));
    if (!thumb.length || !fingers.length) return false;
    const fingerStrings = fingers.map((n) => n.string);
    return Math.min(...thumb.map((n) => n.string)) - Math.max(...fingerStrings) >= 2 && Math.min(...fingerStrings) <= 2;
  };

  for (const b of beats) {
    const src = b.source;
    shortest = Math.min(shortest, b.duration);
    if (src.value?.tuplet) tuplets = true;
    if (src.value?.dots) dotted = true;
    if (!b.notes.length && !src.slash) {
      restCount++;
      for (const k of [...prevFret.keys()]) prevFret.delete(k);
      continue;
    }
    if (src.slash) add('strumming');
    const struck = b.notes.filter((n) => !n.tie);
    if (struck.length || src.slash) {
      onsets++;
      onsetTimes.push(b.sec);
      const bar = tl.barAt(b.tick);
      const beatTicks = (PPQ * 4) / bar.time.denominator;
      const inBar = b.tick - bar.start;
      let offBeatSyncopated = false;
      if (inBar % beatTicks !== 0) {
        const nextBeat = bar.start + (Math.floor(inBar / beatTicks) + 1) * beatTicks;
        const accented = !!src.accent || struck.some((n) => n.accent);
        const heldOver = (ends.get(b) ?? 0) > nextBeat;
        offBeatSyncopated = accented || heldOver || !onsetTicks.has(nextBeat);
        if (offBeatSyncopated) syncopated++;
      }
      // Bass pulse and treble moving around it.
      if (!src.slash) {
        const hasBass = thumbStrikes(struck);
        if (hasBass) {
          bassOnsets.push(b.tick);
          if (isPinch(struck)) pinches++;
        } else if (struck.length) trebleOnly.push({ tick: b.tick, syncopated: offBeatSyncopated });
      }
      // Muting between strums: a muted strum, or a chord all palm-muted or dead.
      const chordStrike = src.slash || struck.length >= 3;
      if (chordStrike) {
        const isMuted = !!src.mutedStrum || (struck.length >= 3 && struck.every((n) => n.dead || n.palmMute));
        strums++;
        if (isMuted) muted++;
        if (lastStrumMuted !== null && lastStrumMuted !== isMuted) switches++;
        lastStrumMuted = isMuted;
      }
    }
    if (b.notes.length > 1) chordBeats++;
    // A grip: three or more notes struck together.
    if (struck.length >= 3) {
      const frets: Array<number | null> = tuning.map(() => null);
      for (const n of b.notes) if (!n.dead) frets[tuning.length - n.string] = n.fret;
      const key = frets.map((f) => (f === null ? 'x' : f)).join(',');
      const known = shapes.get(key);
      if (known) known.count++;
      else shapes.set(key, { frets, ...shapeDifficulty(frets, !struck.some((n) => n.pluck)), count: 1 });
    }
    // The hand holds every fretted note of the beat, tied ones included.
    const held = handFretsOf(b.notes);
    if (held.length) {
      const lo = Math.min(...held);
      const hi = Math.max(...held);
      maxSpan = Math.max(maxSpan, hi - lo);
      hmin = Math.min(hmin, lo);
      hmax = Math.max(hmax, hi);
      // A hammer-on or pull-off keeps the first finger down: both frets are under the hand.
      for (const n of struck) {
        const from = prevFret.get(n.string);
        if (n.legato && from !== undefined && from > 0 && !n.tap) maxSpan = Math.max(maxSpan, Math.abs(n.fret - from));
      }
      if (struck.some((n) => n.fret > 0 && !n.dead && !n.tap)) groups.push({ lo, hi, sec: b.sec });
    }
    for (const n of b.notes) if (!n.dead) prevFret.set(n.string, n.tap ? 0 : n.fret);
    for (const n of src.notes) for (const t of noteTechniques(n)) add(t);
    for (const n of b.notes) {
      if (n.tie) continue;
      noteCount++;
      strings.add(n.string);
      if (!n.dead) {
        low = Math.min(low, n.midi);
        high = Math.max(high, n.midi);
      }
      fmin = Math.min(fmin, n.fret);
      fmax = Math.max(fmax, n.fret);
    }
  }

  // Fewest positions: extend the current one while everything in it still fits one hand.
  let current: { lo: number; hi: number } | null = null;
  let recent: typeof groups = [];
  for (const g of groups) {
    if (current && Math.max(current.hi, g.hi) - Math.min(current.lo, g.lo) <= HAND_SPAN) {
      current.lo = Math.min(current.lo, g.lo);
      current.hi = Math.max(current.hi, g.hi);
      // Notes close together in time in one position are under the hand together.
      recent = recent.filter((r) => g.sec - r.sec <= TOGETHER_SEC);
      for (const r of recent) maxSpan = Math.max(maxSpan, Math.max(r.hi, g.hi) - Math.min(r.lo, g.lo));
    } else {
      current = { lo: g.lo, hi: g.hi };
      runs.push(current);
      recent = [];
    }
    recent.push(g);
  }
  const positions: number[] = [];
  for (const r of runs) if (!positions.includes(Math.max(1, r.lo))) positions.push(Math.max(1, r.lo));

  let fastestGap = Infinity;
  for (let i = 1; i < onsetTimes.length; i++) fastestGap = Math.min(fastestGap, onsetTimes[i] - onsetTimes[i - 1]);
  const span = onsetTimes.length > 1 ? onsetTimes[onsetTimes.length - 1] - onsetTimes[0] : 0;

  // Endurance: the longest stretch of fast onsets, and how much of it repeats the same note (tremolo).
  let runStart = 0;
  let bestRun = 0;
  let bestRepeats = 0;
  const struckBeats = beats.filter((b) => b.notes.some((n) => !n.tie) || b.source.slash);
  const sameAsBefore = struckBeats.map((b, i) => {
    if (i === 0) return false;
    const key = (x: TimelineBeat) => x.notes.filter((n) => !n.tie).map((n) => `${n.string}:${n.fret}`).sort().join(' ');
    return !b.source.slash && key(b) !== '' && key(b) === key(struckBeats[i - 1]);
  });
  for (let i = 1; i <= struckBeats.length; i++) {
    const broken = i === struckBeats.length || struckBeats[i].sec - struckBeats[i - 1].sec > FAST_GAP_SEC + 1e-9;
    if (!broken) continue;
    const seconds = struckBeats[i - 1].sec - struckBeats[runStart].sec;
    if (i - 1 > runStart && seconds > bestRun) {
      bestRun = seconds;
      const n = i - 1 - runStart;
      bestRepeats = n ? sameAsBefore.slice(runStart + 1, i).filter(Boolean).length / n : 0;
    }
    runStart = i;
  }

  // Independent voices: held notes under moving ones, or a treble line moving off a steady bass pulse.
  const pulseShare = (step: number): number => {
    if (bassOnsets.length < 4 || !beats.length) return 0;
    const first = beats[0].tick;
    const last = beats[beats.length - 1].tick;
    const slots = Math.floor((last - first) / step) + 1;
    const set = new Set(bassOnsets);
    let hit = 0;
    for (let k = 0; k < slots; k++) if (set.has(first + k * step)) hit++;
    return slots ? hit / slots : 0;
  };
  const beatTicks = (PPQ * 4) / (song.bars[0]?.time.denominator ?? 4);
  const pulse = [beatTicks, beatTicks * 2].find((step) => pulseShare(step) >= 0.7);
  // The fingers move on their own when they pinch with the thumb, or strike between its strokes:
  // anywhere off a thumb that keeps every beat (Travis picking), but only syncopated against a thumb
  // that keeps the half bars (a bossa), since there the notes between are otherwise just the rest of
  // the arpeggio or the "chick" of a boom-chick, one hand's single stream.
  const offPulse = pulse
    ? trebleOnly.filter((t) => (t.tick - (beats[0]?.tick ?? 0)) % pulse !== 0 && (pulse === beatTicks || t.syncopated)).length
    : 0;
  const nonSlashOnsets = Math.max(1, onsets - (techniques.strumming ?? 0));

  return {
    track: track.id,
    noteCount,
    onsets,
    chordBeats,
    restCount,
    range: Number.isFinite(low) ? { low, high, lowName: midiToNote(low), highName: midiToNote(high) } : null,
    frets: Number.isFinite(fmin) ? { min: fmin, max: fmax } : null,
    handFrets: Number.isFinite(hmin) ? { min: hmin, max: hmax } : null,
    strings: [...strings].sort((a, b) => a - b),
    positions,
    shifts: Math.max(0, runs.length - 1),
    maxSpan,
    techniques,
    notesPerSecond: span > 0 ? (onsetTimes.length - 1) / span : 0,
    fastestGap: Number.isFinite(fastestGap) ? fastestGap : 0,
    shortestTicks: Number.isFinite(shortest) ? shortest : 0,
    tuplets,
    dotted,
    syncopation: onsets ? syncopated / onsets : 0,
    shapes: [...shapes.values()].sort((a, b) => b.count - a.count),
    heldVoices: Math.round((heldOnsets / nonSlashOnsets) * 1000) / 1000,
    thumbVoices: pulse ? Math.round((Math.min(nonSlashOnsets, offPulse + pinches) / nonSlashOnsets) * 1000) / 1000 : 0,
    enduranceSeconds: Math.round(bestRun * 100) / 100,
    enduranceRepeats: Math.round(bestRepeats * 100) / 100,
    mutedStrums: strums ? muted / strums : 0,
    mutingSwitches: muted > 0 && muted < strums && switches >= 2,
  };
}

/** Statistics of one track of a song. */
export function getTrackStats(song: Song, trackRef?: string | number): TrackStats | null {
  const t = findTrack(song, trackRef);
  return t ? trackStats(song, t) : null;
}

/** Difficulty bands: 1–3 beginner, 4–7 intermediate, 8–10 expert. */
export type DifficultyBand = 'beginner' | 'intermediate' | 'expert';

/** The ten factors of the estimate, each 0 (trivial) to 1 (very hard). */
export interface DifficultyFactors {
  speed: number;
  fastest: number;
  stretch: number;
  position: number;
  techniques: number;
  rhythm: number;
  /** The grips played: chord shapes in the tab, or the shapes (else standard voicings) of the chords strummed. */
  chords: number;
  /** Two voices at once: notes held under moving ones, or a melody over a steady thumb. */
  voices: number;
  /** Long runs of fast notes without a break (tremolo, a fiddle tune at speed). */
  endurance: number;
  /** Muting between strums: muted scratches or palm-muted chords alternating with ringing ones. */
  muting: number;
}

/** Result of `estimateDifficulty`. */
export interface DifficultyEstimate {
  /** 1–10. */
  level: number;
  band: DifficultyBand;
  /** 0–1 before mapping to a level. */
  score: number;
  factors: DifficultyFactors;
  /** What makes it hard, hardest first, in plain words. */
  reasons: string[];
}

const TECHNIQUE_WEIGHT: Partial<Record<TechniqueName, number>> = {
  'tie': 0.02, 'hammer-on': 0.3, 'pull-off': 0.32, 'slide': 0.3, 'slide-in': 0.25, 'slide-out': 0.2, 'bend': 0.5, 'release': 0.55, 'pre-bend': 0.65,
  'vibrato': 0.4, 'palm-mute': 0.25, 'dead-note': 0.25, 'ghost-note': 0.3, 'natural-harmonic': 0.35, 'artificial-harmonic': 0.7, 'let-ring': 0.12,
  'staccato': 0.2, 'accent': 0.1, 'tapping': 0.8, 'fingerstyle': 0.3, 'strumming': 0.05,
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const BAND_NAME: Record<DifficultyBand, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
const VALUE_WORD: Record<number, string> = { 1: 'whole notes', 2: 'half notes', 4: 'quarter notes', 8: 'eighth notes', 16: 'sixteenth notes', 32: 'thirty-second notes', 64: 'sixty-fourth notes' };

/** The band of a 1–10 level. */
export function difficultyBand(level: number): DifficultyBand {
  return level <= 3 ? 'beginner' : level <= 7 ? 'intermediate' : 'expert';
}

/** Display name of a band: `Beginner`. */
export function bandName(band: DifficultyBand): string {
  return BAND_NAME[band];
}

/** The shortest note value in words: 240 ticks -> `sixteenth notes`, 320 -> `triplet eighth notes`. */
export function shortestValueWords(ticks: number): string {
  const v = valueFromTicks(ticks);
  if (!v) return ticks < PPQ / 4 ? 'very short notes' : 'short notes';
  const base = VALUE_WORD[v.base] ?? `1/${v.base} notes`;
  const tuplet = v.tuplet ? (v.tuplet.actual === 3 ? 'triplet ' : `${v.tuplet.actual}-tuplet `) : '';
  const dots = v.dots === 2 ? 'double-dotted ' : v.dots ? 'dotted ' : '';
  return `${tuplet}${dots}${base}`;
}

/**
 * Estimate how hard a song is to play (all tracks, or one), from tempo, note density, stretches,
 * position shifts, techniques, rhythmic complexity, the chord grips played, independent voices,
 * endurance and muting. Optional `tempoPercent` rates a slowed-down version.
 */
export function estimateDifficulty(song: Song, opts: { track?: string | number; tempoPercent?: number } = {}): DifficultyEstimate {
  const tl = flattenSong(song);
  const stats = songStatsOf(song, tl);
  const rate = (opts.tempoPercent ?? 100) / 100;
  const wanted = opts.track === undefined ? stats.tracks : stats.tracks.filter((t) => t.track === findTrack(song, opts.track)?.id);
  const tracks = wanted.length ? wanted : stats.tracks;
  const reasons: Array<{ score: number; text: string }> = [];
  let f: DifficultyFactors = { speed: 0, fastest: 0, stretch: 0, position: 0, techniques: 0, rhythm: 0, chords: 0, voices: 0, endurance: 0, muting: 0 };
  for (const t of tracks) {
    // Strumming is one continuous arm motion: sixteenth strums are far easier than sixteenth notes picked one by one.
    const strummed = song.tracks.find((x) => x.id === t.track)?.measures.every((m) => m.beats.every((b) => b.slash || !b.notes.length)) ?? false;
    const motion = strummed ? 0.5 : 1;
    const nps = t.notesPerSecond * rate * motion;
    const gap = t.fastestGap / rate / motion;
    const speed = clamp01(Math.log2(Math.max(1e-6, nps / 1.6)) / Math.log2(10 / 1.6));
    const fastest = gap > 0 ? clamp01(Math.log2(0.42 / gap) / Math.log2(0.42 / 0.06)) : 0;
    const stretch = clamp01((t.maxSpan - 3) / 3);
    const maxFret = t.handFrets?.max ?? 0;
    const barsPlayed = Math.max(1, stats.playedBars);
    // Playing high up is less of a problem than moving the hand often.
    const position = clamp01(0.5 * clamp01((maxFret - 4) / 12) + 0.5 * clamp01(t.shifts / barsPlayed / 1.5));
    const used = Object.keys(t.techniques) as TechniqueName[];
    // A technique used once in a piece counts for a little over half its weight; used throughout, all of it.
    const notes = Math.max(1, t.noteCount + (t.techniques.strumming ?? 0));
    const weights = used.map((u) => (TECHNIQUE_WEIGHT[u] ?? 0.2) * (0.55 + 0.45 * Math.min(1, (6 * (t.techniques[u] ?? 0)) / notes))).sort((a, b) => b - a);
    const techniques = clamp01((weights[0] ?? 0) + Math.min(0.15, 0.03 * Math.max(0, weights.filter((w) => w >= 0.15).length - 1)));
    const sub = t.shortestTicks;
    const subdivision = sub >= PPQ ? 0 : sub >= PPQ / 2 ? 0.1 : sub >= PPQ / 3 ? 0.28 : sub >= PPQ / 4 ? 0.38 : 0.65;
    const odd = song.bars.some((b) => ![2, 3, 4, 6, 12].includes(b.time.numerator)) ? 0.12 : 0;
    const rhythm = clamp01(subdivision + (t.tuplets ? 0.15 : 0) + (t.dotted ? 0.05 : 0) + 0.45 * t.syncopation + odd);
    // Two voices: a held voice under a moving one is the harder kind; a treble line over a steady thumb the commoner.
    const voices = Math.max(0.75 * clamp01(t.heldVoices / 0.3), 0.35 * clamp01(t.thumbVoices / 0.4));
    // Endurance counts from about six seconds of fast notes and saturates at half a minute; tremolo weighs a little more.
    const run = t.enduranceSeconds / rate;
    const endurance = clamp01((run - 6) / 24) * (t.enduranceRepeats >= 0.4 ? 0.8 : 0.65);
    const muting = t.mutingSwitches ? 0.55 * clamp01(t.mutedStrums / 0.3) : 0.25 * clamp01(t.mutedStrums / 0.5);
    const next: DifficultyFactors = { speed, fastest, stretch, position, techniques, rhythm, chords: 0, voices, endurance, muting };
    (Object.keys(next) as Array<keyof DifficultyFactors>).forEach((k) => (f[k] = Math.max(f[k], next[k])));
    if (fastest > 0.35) reasons.push({ score: fastest, text: `Fast notes: ${Math.round(1 / Math.max(gap, 1e-3))} per second at the quickest.` });
    if (speed > 0.35) reasons.push({ score: speed, text: `Busy: about ${nps.toFixed(1)} notes per second on average.` });
    if (stretch > 0.3) reasons.push({ score: stretch, text: `Wide stretches: up to ${t.maxSpan + 1} frets under one hand.` });
    if (position > 0.3) reasons.push({ score: position, text: `Up the neck: frets up to ${maxFret}${t.shifts ? `, ${t.shifts} position shift${t.shifts > 1 ? 's' : ''}` : ''}.` });
    if (techniques > 0.3) {
      const hardest = used.sort((a, b) => (TECHNIQUE_WEIGHT[b] ?? 0) - (TECHNIQUE_WEIGHT[a] ?? 0)).slice(0, 3).map((x) => x.replace(/-/g, ' '));
      reasons.push({ score: techniques, text: `Techniques: ${hardest.join(', ')}.` });
    }
    if (rhythm > 0.3) {
      const parts = [shortestValueWords(sub), ...(t.tuplets && !/triplet|tuplet/.test(shortestValueWords(sub)) ? ['triplets'] : []), ...(t.syncopation > 0.15 ? ['syncopation'] : [])];
      reasons.push({ score: rhythm, text: `Rhythm: ${parts.join(', ')}.` });
    }
    if (voices > 0.3) reasons.push({ score: voices, text: 'Two voices at once: one part moves while another holds or keeps the beat.' });
    if (endurance > 0.3) reasons.push({ score: endurance, text: `Endurance: about ${Math.round(run)} seconds of fast ${t.enduranceRepeats >= 0.4 ? 'tremolo' : 'notes'} without a break.` });
    if (muting > 0.3) reasons.push({ score: muting, text: 'Muting: damped strums between ringing ones.' });
  }
  // Chords count when someone has to play them: the grips in the tab, or the chords a rhythm part strums.
  const diffs: Array<{ difficulty: number; barre: boolean }> = [];
  for (const t of tracks) {
    const track = song.tracks.find((x) => x.id === t.track);
    if (!track) continue;
    if (t.shapes.length && t.chordBeats > 2) diffs.push(...t.shapes);
    if (t.techniques.strumming) diffs.push(...strummedChordDifficulties(song, tl, track));
    else diffs.push(...heldShapeDifficulties(song, tl, track));
  }
  if (diffs.length) {
    diffs.sort((a, b) => b.difficulty - a.difficulty);
    const top = diffs.slice(0, 3);
    const mean = top.reduce((s, x) => s + x.difficulty, 0) / top.length;
    const changeRate = stats.chordChangesPerBar * rate;
    // Open chords (difficulty about 3) are a beginner's; barre chords (about 7) the middle of the road.
    f.chords = clamp01((0.6 * diffs[0].difficulty + 0.4 * mean - 1.7) / 10.8 + 0.12 * clamp01(changeRate - 1));
    if (f.chords > 0.3) {
      const names = stats.chords.slice(0, 4).join(', ');
      const kind = diffs.some((d) => d.barre && d.difficulty >= 5) ? ' (with barre chords)' : diffs[0].difficulty >= 6 ? ' (hard grips)' : '';
      reasons.push({ score: f.chords, text: names ? `Chords: ${names}${kind}.` : `Chord shapes${kind || ' held in the tab'}.` });
    }
  }
  // The hardest element dominates, the next counts a third as much, the third a little. (Never the
  // mean of the factors above zero: then a small factor falling to zero made the song score harder.)
  const values = Object.values(f).sort((a, b) => b - a);
  const top3 = (values[0] + values[1] + values[2]) / 3;
  const score = clamp01(0.55 * values[0] + 0.25 * values[1] + 0.2 * top3);
  const level = Math.max(1, Math.min(10, Math.round(1 + 9 * score)));
  f = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100) / 100])) as unknown as DifficultyFactors;
  return {
    level,
    band: difficultyBand(level),
    score: Math.round(score * 1000) / 1000,
    factors: f,
    reasons: reasons.sort((a, b) => b.score - a.score).map((r) => r.text).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4),
  };
}

/** `songStats` on a timeline already built. */
function songStatsOf(song: Song, tl: SongTimeline): SongStats {
  const chords: string[] = [];
  for (const c of tl.chords) if (!isNoChord(c.symbol) && !chords.includes(c.symbol)) chords.push(c.symbol);
  return {
    bars: song.bars.length,
    playedBars: tl.bars.length,
    seconds: tl.totalSeconds,
    tracks: song.tracks.map((t) => trackStats(song, t, tl)),
    chords,
    chordChangesPerBar: tl.bars.length ? Math.max(0, tl.chords.length - 1) / tl.bars.length : 0,
  };
}

/**
 * The chords a rhythm part strums, each scored by the shape written for it (`"F=133211"`), or by
 * the guitar engine's standard voicing when the song gives none.
 */
function strummedChordDifficulties(song: Song, tl: SongTimeline, track: Track): Array<{ difficulty: number; barre: boolean }> {
  const out = new Map<string, { difficulty: number; barre: boolean }>();
  const slashTicks = tl.trackBeats(track.id).filter((b) => b.source.slash && !b.source.mutedStrum).map((b) => b.tick);
  for (const c of tl.chords) {
    if (isNoChord(c.symbol) || !slashTicks.some((t) => t >= c.tick && t < c.endTick)) continue;
    const key = `${c.symbol}=${c.voicing?.join(',') ?? ''}`;
    if (out.has(key)) continue;
    if (c.voicing) out.set(key, shapeDifficulty([...c.voicing], true));
    else {
      // The engine's standard shape: from about 6 on, that is a barre (F, Bm, B♭).
      const difficulty = safeChordDifficulty(c.symbol, song);
      out.set(key, { difficulty, barre: difficulty >= 6 });
    }
  }
  return [...out.values()];
}

/**
 * Shapes a picked part holds: a chord whose written shape (`"F=xx3211"`) the part's notes come
 * from (two or more strings struck on the shape's frets while the chord lasts), as in Travis
 * picking, where the hand holds the chord and the fingers pick from it.
 */
function heldShapeDifficulties(song: Song, tl: SongTimeline, track: Track): Array<{ difficulty: number; barre: boolean }> {
  const tuning = trackTuning(song, track);
  const beats = tl.trackBeats(track.id).filter((b) => b.notes.some((n) => !n.tie));
  const out = new Map<string, { difficulty: number; barre: boolean }>();
  for (const c of tl.chords) {
    if (!c.voicing || c.voicing.length !== tuning.length || isNoChord(c.symbol)) continue;
    const key = c.voicing.join(',');
    if (out.has(key)) continue;
    // Picked from the shape: at least three in four of the notes struck meanwhile are on its frets
    // (a scale or a melody that only passes through some chord tones does not hold the chord).
    const matched = new Map<number, number>();
    let struck = 0;
    let onShape = 0;
    for (const b of beats) {
      if (b.tick < c.tick || b.tick >= c.endTick) continue;
      for (const n of b.notes) {
        if (n.tie || n.dead) continue;
        struck++;
        if (c.voicing[tuning.length - n.string] !== n.fret) continue;
        onShape++;
        matched.set(n.string, n.fret);
      }
    }
    if (matched.size >= 2 && [...matched.values()].some((f) => f > 0) && onShape >= 0.75 * struck) out.set(key, shapeDifficulty([...c.voicing], false));
  }
  return [...out.values()];
}

function safeChordDifficulty(symbol: string, song: Song): number {
  try {
    return chordDifficulty(symbol, { tuning: song.tuning, capo: song.capo });
  } catch {
    return 5;
  }
}
