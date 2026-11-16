/**
 * The player's address: `#play--<song-id>` plus optional params, in any order after the id:
 *
 *   m9        start at bar 9 (bars are counted from 1 in the address, as on the score)
 *   m9-12     loop bars 9 to 12
 *   t70       practice tempo 70 %
 *   wait | flow | listen | tap   practice mode
 *   <section> any other param is a section's name as a slug (`chorus`, `verse-1`): loop that section
 *
 * So the results screen can link "Loop bars 9 to 12 at 70 %" as `#play--greensleeves--m9-12--t70`.
 * Pure: unit-tested.
 */
import { slug } from '@/app/router';
import type { Song } from '@/core/song';
import { clampTempo, PRACTICE_MODES, type BarRange, type PracticeMode } from './types';

/** What the address asks for, before it is checked against the song. */
export interface PlayerRequest {
  songId: string | null;
  /** 0-based start bar. */
  startBar: number | null;
  loop: BarRange | null;
  tempo: number | null;
  mode: PracticeMode | null;
  /** Section slug. */
  section: string | null;
}

const BAR = /^m(\d{1,4})$/;
const RANGE = /^m(\d{1,4})-(\d{1,4})$/;
const TEMPO = /^t(\d{1,3})$/;

/** Read the route params of `#play--…`. Unknown or malformed params are ignored, never thrown on. */
export function parsePlayerParams(params: readonly string[]): PlayerRequest {
  const out: PlayerRequest = { songId: null, startBar: null, loop: null, tempo: null, mode: null, section: null };
  const [id, ...rest] = params;
  if (!id) return out;
  out.songId = id;
  for (const p of rest) {
    let m: RegExpMatchArray | null;
    if ((m = p.match(RANGE))) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a >= 1 && b >= 1) out.loop = { from: Math.min(a, b) - 1, to: Math.max(a, b) - 1 };
    } else if ((m = p.match(BAR))) {
      const a = Number(m[1]);
      if (a >= 1) out.startBar = a - 1;
    } else if ((m = p.match(TEMPO))) {
      out.tempo = clampTempo(Number(m[1]));
    } else if ((PRACTICE_MODES as readonly string[]).includes(p)) {
      out.mode = p as PracticeMode;
    } else if (!out.section) {
      out.section = p;
    }
  }
  return out;
}

/** Route params for a player link: `href('play', ...playerParams('greensleeves', { loop: { from: 8, to: 11 }, tempo: 70 }))`. */
export function playerParams(songId: string, opts: { startBar?: number | null; loop?: BarRange | null; tempo?: number | null; mode?: PracticeMode | null; section?: string | null } = {}): string[] {
  const out = [songId];
  if (opts.section) out.push(slug(opts.section));
  if (opts.loop) out.push(`m${Math.min(opts.loop.from, opts.loop.to) + 1}-${Math.max(opts.loop.from, opts.loop.to) + 1}`);
  else if (opts.startBar !== undefined && opts.startBar !== null && opts.startBar > 0) out.push(`m${opts.startBar + 1}`);
  if (opts.tempo !== undefined && opts.tempo !== null && clampTempo(opts.tempo) !== 100) out.push(`t${clampTempo(opts.tempo)}`);
  if (opts.mode && opts.mode !== 'listen') out.push(opts.mode);
  return out;
}

/** The request checked against a song: bars clamped into it, the section found by its slug. */
export interface ResolvedRequest {
  startBar: number | null;
  loop: BarRange | null;
  tempo: number | null;
  mode: PracticeMode | null;
  /** The section's name as written in the song, when the address named one that exists. */
  sectionName: string | null;
  /** Plain sentences about what could not be followed ("This song has 16 bars."). */
  problems: string[];
}

/** Check a request against the song it opened. */
export function resolveRequest(req: PlayerRequest, song: Pick<Song, 'bars' | 'sections'>): ResolvedRequest {
  const count = song.bars.length;
  const problems: string[] = [];
  const out: ResolvedRequest = { startBar: null, loop: null, tempo: req.tempo, mode: req.mode, sectionName: null, problems };
  const tooFar = () => problems.push(`This song has ${count} ${count === 1 ? 'bar' : 'bars'}, so the player starts at the top.`);
  if (req.section) {
    const found = song.sections.find((s) => slug(s.name) === req.section);
    if (found && found.end > found.start) {
      out.sectionName = found.name;
      out.loop = { from: found.start, to: Math.min(count - 1, found.end - 1) };
      out.startBar = found.start;
    } else {
      problems.push('That section is not in this song, so the player starts at the top.');
    }
  }
  if (req.loop) {
    if (req.loop.from >= count) tooFar();
    else {
      out.loop = { from: req.loop.from, to: Math.min(count - 1, req.loop.to) };
      out.startBar = out.loop.from;
      out.sectionName = null;
    }
  }
  if (req.startBar !== null && !req.loop) {
    if (req.startBar >= count) tooFar();
    else out.startBar = req.startBar;
  }
  return out;
}

/** A stable key for the params after the song id, to tell a reload (same address) from a new request. */
export function requestKey(params: readonly string[]): string {
  return params.slice(1).join('--');
}
