/**
 * Song statistics (range, positions, note counts, techniques) and the automatic difficulty
 * estimate: seven factors scored 0–1 (speed, fastest notes, stretches, neck positions and shifts,
 * techniques, rhythm, chords), combined so the hardest element dominates, then mapped to a 1–10
 * level and a beginner / intermediate / expert band.
 */
import { chordDifficulty } from '@/core/guitar';
import { isNoChord, midiToNote } from '@/core/theory';
import { findTrack } from './model';
import { flattenSong } from './timeline';
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
  strings: number[];
  /** Hand positions (fret under the index finger) the part visits, in order of first use. */
  positions: number[];
  /** Times the hand has to move to a new position. */
  shifts: number;
  /** Largest number of frets between the lowest and highest fretted note held at once or within one hand position. */
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
  /** Share of onsets that fall off the beat with nothing on the next beat (0–1). */
  syncopation: number;
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
  const tl = flattenSong(song);
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

function trackStats(song: Song, track: Track, tl = flattenSong(song)): TrackStats {
  const beats = tl.trackBeats(track.id);
  let noteCount = 0;
  let chordBeats = 0;
  let restCount = 0;
  let low = Infinity;
  let high = -Infinity;
  let fmin = Infinity;
  let fmax = -Infinity;
  const strings = new Set<number>();
  const techniques: Partial<Record<TechniqueName, number>> = {};
  const add = (t: TechniqueName) => (techniques[t] = (techniques[t] ?? 0) + 1);
  const onsetTimes: number[] = [];
  let shortest = Infinity;
  let tuplets = false;
  let dotted = false;
  let syncopated = 0;
  let onsets = 0;
  // Hand position tracker: a window of four frets that moves only when a note falls outside it (one fret of stretch allowed).
  let pos: number | null = null;
  const positions: number[] = [];
  let shifts = 0;
  let maxSpan = 0;
  const onsetTicks = new Set(beats.filter((b) => b.notes.some((n) => !n.tie) || b.source.slash).map((b) => b.tick));

  for (const b of beats) {
    const src = b.source;
    shortest = Math.min(shortest, b.duration);
    if (src.value?.tuplet) tuplets = true;
    if (src.value?.dots) dotted = true;
    if (!src.notes.length && !src.slash) {
      restCount++;
      continue;
    }
    if (src.slash) add('strumming');
    const struck = src.notes.filter((n) => !n.tie);
    if (struck.length || src.slash) {
      onsets++;
      onsetTimes.push(b.sec);
      const bar = tl.barAt(b.tick);
      const beatTicks = (PPQ * 4) / bar.time.denominator;
      const inBar = b.tick - bar.start;
      if (inBar % beatTicks !== 0 && !onsetTicks.has(bar.start + (Math.floor(inBar / beatTicks) + 1) * beatTicks) && b.duration >= beatTicks / 2) syncopated++;
    }
    if (src.notes.length > 1) chordBeats++;
    const fretted = src.notes.filter((n) => n.fret > 0 && !n.dead).map((n) => n.fret);
    if (fretted.length) {
      const lo = Math.min(...fretted);
      const hi = Math.max(...fretted);
      maxSpan = Math.max(maxSpan, hi - lo);
      if (pos === null || lo < pos - 1 || hi > pos + 4) {
        // Move the window as little as possible: up so the top note is under the little finger, down so the bottom one is under the index.
        const next = pos !== null && hi > pos + 4 ? Math.min(lo, hi - 3) : lo;
        if (pos !== null && next !== pos) shifts++;
        pos = Math.max(1, next);
        if (!positions.includes(pos)) positions.push(pos);
      } else if (lo === pos - 1 || hi === pos + 4) {
        // A finger reaching one fret outside the window: a five-fret stretch.
        maxSpan = Math.max(maxSpan, 4);
      }
    }
    for (const n of src.notes) {
      for (const t of noteTechniques(n)) add(t);
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
  let fastestGap = Infinity;
  for (let i = 1; i < onsetTimes.length; i++) fastestGap = Math.min(fastestGap, onsetTimes[i] - onsetTimes[i - 1]);
  const span = onsetTimes.length > 1 ? onsetTimes[onsetTimes.length - 1] - onsetTimes[0] : 0;
  return {
    track: track.id,
    noteCount,
    onsets,
    chordBeats,
    restCount,
    range: Number.isFinite(low) ? { low, high, lowName: midiToNote(low), highName: midiToNote(high) } : null,
    frets: Number.isFinite(fmin) ? { min: fmin, max: fmax } : null,
    strings: [...strings].sort((a, b) => a - b),
    positions,
    shifts,
    maxSpan,
    techniques,
    notesPerSecond: span > 0 ? (onsetTimes.length - 1) / span : 0,
    fastestGap: Number.isFinite(fastestGap) ? fastestGap : 0,
    shortestTicks: Number.isFinite(shortest) ? shortest : 0,
    tuplets,
    dotted,
    syncopation: onsets ? syncopated / onsets : 0,
  };
}

/** Statistics of one track of a song. */
export function getTrackStats(song: Song, trackRef?: string | number): TrackStats | null {
  const t = findTrack(song, trackRef);
  return t ? trackStats(song, t) : null;
}

/** Difficulty bands: 1–3 beginner, 4–7 intermediate, 8–10 expert. */
export type DifficultyBand = 'beginner' | 'intermediate' | 'expert';

/** The seven factors of the estimate, each 0 (trivial) to 1 (very hard). */
export interface DifficultyFactors {
  speed: number;
  fastest: number;
  stretch: number;
  position: number;
  techniques: number;
  rhythm: number;
  chords: number;
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

/** The band of a 1–10 level. */
export function difficultyBand(level: number): DifficultyBand {
  return level <= 3 ? 'beginner' : level <= 7 ? 'intermediate' : 'expert';
}

/** Display name of a band: `Beginner`. */
export function bandName(band: DifficultyBand): string {
  return BAND_NAME[band];
}

/**
 * Estimate how hard a song is to play (all tracks, or one), from tempo, note density, stretches,
 * position shifts, techniques, rhythmic complexity and chord shapes. Optional `tempoPercent`
 * rates a slowed-down version.
 */
export function estimateDifficulty(song: Song, opts: { track?: string | number; tempoPercent?: number } = {}): DifficultyEstimate {
  const stats = songStats(song);
  const rate = (opts.tempoPercent ?? 100) / 100;
  const wanted = opts.track === undefined ? stats.tracks : stats.tracks.filter((t) => t.track === findTrack(song, opts.track)?.id);
  const tracks = wanted.length ? wanted : stats.tracks;
  const reasons: Array<{ score: number; text: string }> = [];
  let f: DifficultyFactors = { speed: 0, fastest: 0, stretch: 0, position: 0, techniques: 0, rhythm: 0, chords: 0 };
  for (const t of tracks) {
    // Strumming is one continuous arm motion: sixteenth strums are far easier than sixteenth notes picked one by one.
    const strummed = song.tracks.find((x) => x.id === t.track)?.measures.every((m) => m.beats.every((b) => b.slash || !b.notes.length)) ?? false;
    const motion = strummed ? 0.5 : 1;
    const nps = t.notesPerSecond * rate * motion;
    const gap = t.fastestGap / rate / motion;
    const speed = clamp01(Math.log2(Math.max(1e-6, nps / 1.6)) / Math.log2(10 / 1.6));
    const fastest = gap > 0 ? clamp01(Math.log2(0.42 / gap) / Math.log2(0.42 / 0.06)) : 0;
    const stretch = clamp01((t.maxSpan - 3) / 3);
    const maxFret = t.frets?.max ?? 0;
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
    const next: DifficultyFactors = { speed, fastest, stretch, position, techniques, rhythm, chords: 0 };
    (Object.keys(next) as Array<keyof DifficultyFactors>).forEach((k) => (f[k] = Math.max(f[k], next[k])));
    if (fastest > 0.35) reasons.push({ score: fastest, text: `Fast notes: ${Math.round(1 / Math.max(gap, 1e-3))} per second at the quickest.` });
    if (speed > 0.35) reasons.push({ score: speed, text: `Busy: about ${nps.toFixed(1)} notes per second on average.` });
    if (stretch > 0.3) reasons.push({ score: stretch, text: `Wide stretches: up to ${t.maxSpan + 1} frets under one hand.` });
    if (position > 0.3) reasons.push({ score: position, text: `Up the neck: frets up to ${maxFret}${t.shifts ? `, ${t.shifts} position shift${t.shifts > 1 ? 's' : ''}` : ''}.` });
    if (techniques > 0.3) {
      const hardest = used.sort((a, b) => (TECHNIQUE_WEIGHT[b] ?? 0) - (TECHNIQUE_WEIGHT[a] ?? 0)).slice(0, 3).map((x) => x.replace(/-/g, ' '));
      reasons.push({ score: techniques, text: `Techniques: ${hardest.join(', ')}.` });
    }
    if (rhythm > 0.3) reasons.push({ score: rhythm, text: `Rhythm: ${t.tuplets ? 'triplets, ' : ''}${sub < PPQ / 2 ? 'sixteenth notes' : 'eighth notes'}${t.syncopation > 0.15 ? ', syncopation' : ''}.` });
  }
  // Chords count when someone has to play them: a rhythm track, or chord shapes in the tab.
  const playsChords = tracks.some((t) => song.tracks.find((x) => x.id === t.track)?.role === 'rhythm' || t.chordBeats > 2);
  if (playsChords && stats.chords.length) {
    const diffs = stats.chords.map((c) => safeChordDifficulty(c, song)).sort((a, b) => b - a);
    const top = diffs.slice(0, 3);
    const mean = top.reduce((s, x) => s + x, 0) / top.length;
    const changeRate = stats.chordChangesPerBar * rate;
    // Open chords (difficulty about 3) are a beginner's; barre chords (about 7) the middle of the road.
    f.chords = clamp01((0.6 * diffs[0] + 0.4 * mean - 1.7) / 10.8 + 0.12 * clamp01(changeRate - 1));
    if (f.chords > 0.3) reasons.push({ score: f.chords, text: `Chords: ${stats.chords.slice(0, 4).join(', ')}${diffs[0] >= 6 ? ' (with barre chords)' : ''}.` });
  }
  const values = Object.values(f).sort((a, b) => b - a);
  const considered = values.filter((v) => v > 0);
  const mean = considered.length ? considered.reduce((s, x) => s + x, 0) / considered.length : 0;
  const score = clamp01(0.55 * values[0] + 0.25 * values[1] + 0.2 * mean);
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

function safeChordDifficulty(symbol: string, song: Song): number {
  try {
    return chordDifficulty(symbol, { tuning: song.tuning, capo: song.capo });
  } catch {
    return 5;
  }
}
