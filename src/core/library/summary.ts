/**
 * What the Songs screen shows about a song without loading it again: length, features, chords, a
 * difficulty estimate, the skills it trains, and a thumbnail of the first bars.
 */
import { barLength, estimateDifficulty, flattenSong, formatTimeSig, songStats, tempoAtBar, type Song, type SongStats } from '@/core/song';
import type { SongSkill, SongSummary, SongThumb, ThumbBeat } from './types';

/** Most full bars a thumbnail holds (a pickup bar comes extra). */
export const THUMB_BARS = 2;
/** Most chord symbols kept in a summary. */
const MAX_CHORDS = 12;

/** The learner's part: the first track with something written in it. */
function firstPart(song: Song): Song['tracks'][number] | undefined {
  return song.tracks.find((t) => t.measures.some((m) => m.beats.some((b) => b.notes.length || b.slash))) ?? song.tracks[0];
}

/** The thumbnail: the first bars of the learner's part (the first track with something written in it). */
export function songThumb(song: Song, bars = THUMB_BARS): SongThumb {
  const track = firstPart(song);
  const strings = (track?.tuning ?? song.tuning).length || 6;
  const out: SongThumb = { strings, bars: [] };
  if (!track) return out;
  let full = 0;
  for (let i = 0; i < song.bars.length && full < bars; i++) {
    const info = song.bars[i];
    const ticks = barLength(info);
    const measure = track.measures[i];
    const beats: ThumbBeat[] = (measure?.beats ?? [])
      .filter((b) => b.notes.length || b.slash)
      .map((b) => {
        const beat: ThumbBeat = { t: b.start, d: b.duration, n: b.slash ? [] : b.notes.map((n) => [n.string, n.dead ? -1 : n.fret] as [number, number]) };
        if (b.slash) beat.slash = true;
        return beat;
      });
    const chords = song.chords.filter((c) => c.bar === i).map((c) => ({ t: c.tick, symbol: c.symbol }));
    out.bars.push({ ticks, beats, chords });
    if (info.length === undefined || i > 0) full++;
  }
  return out;
}

/** Skills a song trains, read from its notes (for songs that have no authored metadata). */
export function inferSkills(song: Song, stats: SongStats = songStats(song)): SongSkill[] {
  const beats = song.tracks.flatMap((t) => t.measures.flatMap((m) => m.beats));
  const pitched = beats.filter((b) => b.notes.length && !b.slash);
  const skills: SongSkill[] = [];
  const singleNotes = pitched.filter((b) => b.notes.length === 1).length;
  if (pitched.length && singleNotes / pitched.length >= 0.5) skills.push('melody');
  if (song.chords.length) skills.push('chords');
  if (beats.some((b) => b.slash)) skills.push('strumming');
  const plucked = pitched.some((b) => b.notes.some((n) => n.pluck)) || stats.tracks.some((t) => t.onsets > 8 && t.chordBeats / t.onsets >= 0.25 && t.strings.length >= 4 && !t.techniques.strumming);
  if (plucked && pitched.length) skills.push('fingerpicking');
  if (beats.some((b) => b.lyric)) skills.push('singing');
  const legato = stats.tracks.some((t) => (['hammer-on', 'pull-off', 'slide', 'bend', 'vibrato', 'tapping', 'natural-harmonic'] as const).some((k) => (t.techniques[k] ?? 0) > 0));
  if (legato) skills.push('technique');
  if (stats.tracks.some((t) => t.tuplets || t.syncopation > 0.15)) skills.push('rhythm');
  return skills;
}

/** Everything the list needs about a song, computed from its notes. */
export function summarizeSong(song: Song): SongSummary {
  const stats = songStats(song);
  const timeline = flattenSong(song);
  const beats = song.tracks.flatMap((t) => t.measures.flatMap((m) => m.beats));
  // What the learner plays is the first part: tab or strums there; lyrics anywhere.
  const part = (firstPart(song)?.measures ?? []).flatMap((m) => m.beats);
  let level = 1;
  try {
    level = estimateDifficulty(song).level;
  } catch {
    // An unusual song the estimator cannot rate still gets listed.
  }
  return {
    bars: song.bars.length,
    playedBars: timeline.bars.length,
    seconds: Math.round(timeline.totalSeconds * 10) / 10,
    bpm: Math.round(tempoAtBar(song, 0)),
    time: song.bars[0] ? formatTimeSig(song.bars[0].time) : '4/4',
    tracks: song.tracks.length,
    hasTab: part.some((b) => !b.slash && b.notes.length > 0),
    hasChords: stats.chords.length > 0,
    hasLyrics: beats.some((b) => !!b.lyric),
    hasStrumming: part.some((b) => !!b.slash),
    chords: stats.chords.slice(0, MAX_CHORDS),
    tuning: [...song.tuning],
    capo: song.capo,
    estimatedLevel: level,
    skills: inferSkills(song, stats),
    thumb: songThumb(song),
  };
}
