/**
 * A song on the live neck: the notes (or the chord shape) to play now, and the ones coming next.
 * The steps are the song module's practice targets (the beats the learner plays, ties and rests
 * skipped; a strummed rhythm track gives its chord shapes), in playback order with repeats unrolled.
 * Dots are coloured by their degree in the song's key and labelled with the note name.
 */
import { flattenSong, practiceTargets, type Song, type SongTimeline } from '@/core/song';
import { degreeInKey, getKey, midiToNote, pcName, spellInKey } from '@/core/theory';
import type { ShowNote } from './content';

/** One thing to play: a note, a few notes together, or a strummed chord. */
export interface SongStep {
  index: number;
  /** Absolute tick (playback order) where it starts, and where the next step starts. */
  tick: number;
  endTick: number;
  bar: number;
  /** The notes, frets from the capo. */
  notes: ShowNote[];
  /** The chord symbol strummed (rhythm tracks). */
  symbol?: string;
}

/** A song prepared for the camera. */
export interface SongPlan {
  timeline: SongTimeline;
  trackId: string;
  trackName: string;
  steps: SongStep[];
  capo: number;
  /** Open-string pitches of the track, low to high. */
  tuning: readonly number[];
}

/** The track the learner plays: the first lead track with notes, else the first with any targets. */
export function pickTrack(song: Song, timeline: SongTimeline = flattenSong(song)): string | null {
  const withTargets = song.tracks.filter((t) => practiceTargets(timeline, t.id).length > 0);
  return (withTargets.find((t) => t.role === 'lead') ?? withTargets[0] ?? song.tracks[0])?.id ?? null;
}

/** Spell a pitch for the song: in its key when it has one. */
function spell(midi: number, key: string | undefined): string {
  if (key) {
    try {
      return pcName(spellInKey(midi, key));
    } catch {
      // fall through to the plain spelling
    }
  }
  return pcName(midiToNote(midi));
}

function degreeOf(note: string, key: string | undefined): string {
  if (!key || !getKey(key)) return '';
  try {
    return degreeInKey(note, key) ?? '';
  } catch {
    return '';
  }
}

/** The song as steps on one track (default: `pickTrack`). Null when the song has nothing to play. */
export function songPlan(song: Song, trackId?: string): SongPlan | null {
  const timeline = flattenSong(song);
  const id = trackId ?? pickTrack(song, timeline);
  const track = song.tracks.find((t) => t.id === id);
  if (!track) return null;
  const tuning = track.tuning ?? song.tuning;
  const capo = track.capo ?? song.capo ?? 0;
  const key = song.key;
  const targets = practiceTargets(timeline, track.id);
  if (targets.length === 0) return null;
  const steps: SongStep[] = targets.map((t, i) => {
    const notes: ShowNote[] = t.positions.map((p) => {
      const midi = tuning[tuning.length - p.string] + capo + p.fret;
      const note = spell(midi, key);
      const degree = degreeOf(note, key);
      return { string: p.string, fret: p.fret, midi, note, degree, root: degree === '1' };
    });
    return { index: i, tick: t.tick, endTick: targets[i + 1]?.tick ?? timeline.totalTicks, bar: t.bar, notes, symbol: t.symbol };
  });
  return { timeline, trackId: track.id, trackName: track.name, steps, capo, tuning };
}

/** The step sounding at `tick`: the last one that has started (0 before the first). */
export function stepIndexAt(steps: readonly SongStep[], tick: number): number {
  let lo = 0;
  let hi = steps.length - 1;
  if (hi < 0 || tick < steps[0].tick) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (steps[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The dots for step `index`: its notes to play now (pulsing), then the next step's notes as
 * outlines (positions already lit now are not drawn twice).
 */
export function stepNotes(steps: readonly SongStep[], index: number, ahead = 1): ShowNote[] {
  const now = steps[index];
  if (!now) return [];
  const out: ShowNote[] = now.notes.map((n) => ({ ...n, target: true, ghost: false }));
  const taken = new Set(out.map((n) => `${n.string}:${n.fret}`));
  for (let k = 1; k <= ahead; k++) {
    const next = steps[index + k];
    if (!next) break;
    for (const n of next.notes) {
      const key = `${n.string}:${n.fret}`;
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ ...n, target: false, ghost: true });
    }
  }
  return out;
}

/** "A on string 3, fret 2", "G chord", "C and E": what a step asks for, in words. */
export function describeStep(step: SongStep | undefined, format: (note: string) => string = (n) => n): string {
  if (!step) return 'Nothing to play';
  if (step.symbol) return `${step.symbol} chord`;
  if (step.notes.length === 1) {
    const n = step.notes[0];
    return n.fret === 0 ? `${format(n.note)}, open string ${n.string}` : `${format(n.note)} on string ${n.string}, fret ${n.fret}`;
  }
  const names = step.notes.map((n) => format(n.note));
  return names.length === 2 ? `${names[0]} and ${names[1]} together` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} together`;
}

/** Whether the notes heard recently (MIDI, newest last) answer a step: one of a single note; two different pitch classes of a chord. */
export function stepHeard(step: SongStep | undefined, recent: readonly number[]): boolean {
  if (!step || step.notes.length === 0) return false;
  if (step.notes.length === 1) return recent.includes(step.notes[0].midi);
  // Notes struck together reach the pitch tracker one at a time (it follows the loudest): two of
  // the step's pitch classes are enough.
  const pcs = new Set(step.notes.map((n) => ((n.midi % 12) + 12) % 12));
  const heard = new Set(recent.map((m) => ((m % 12) + 12) % 12).filter((pc) => pcs.has(pc)));
  return heard.size >= Math.min(2, pcs.size);
}
