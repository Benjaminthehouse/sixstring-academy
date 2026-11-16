/**
 * The player's address: `#play--<song-id>` plus optional params, in any order after the id:
 *
 *   m9                start at bar 9 (bars are counted from 1 in the address, as on the score)
 *   m9-12             loop bars 9 to 12
 *   t70               practice tempo 70 %
 *   wait | flow | listen | tap   practice mode
 *   part-<part>       the learner plays this part: a track id (`part-your-strum`), a track name as
 *                     a slug (`part-teacher`) or a role (`part-rhythm`, `part-lead`, `part-bass`)
 *   mute-<part>       mute a part (more than one may be given)
 *   tab-only | tab-and-notes | notes   what the score shows (`notes`: the notation alone, the tab
 *                     covered, for sight reading)
 *   hide-chart        chord names and chord boxes hidden: play it from memory
 *   capo<n>           the learner's capo is on fret n (0–9): same shapes, the app plays in the key
 *                     the capo gives
 *   up<n> | down<n>   move the song n semitones (1–7) up or down, for singing
 *   <section>         any other param is a section's name as a slug (`chorus`, `verse-1`): loop it
 *
 * So the results screen can link "Loop bars 9 to 12 at 70 %" as `#play--greensleeves--m9-12--t70`,
 * and a teacher's task can open "strum it while the app plays the tune" as
 * `#play--korobeiniki--part-strum--t70`. Pure: unit-tested.
 */
import { slug } from '@/app/router';
import type { Song } from '@/core/song';
import { clampCapo, clampTempo, clampTranspose, MAX_CAPO, MAX_TRANSPOSE, PRACTICE_MODES, type BarRange, type PracticeMode, type ScoreLayer } from './types';

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
  /** The part to play, as written after `part-`. */
  part: string | null;
  /** Parts to mute, as written after `mute-`. */
  mute: string[];
  layer: ScoreLayer | null;
  hideChart: boolean;
  /** The learner's capo fret. */
  capo: number | null;
  /** Semitones up (positive) or down. */
  transpose: number | null;
}

const BAR = /^m(\d{1,4})$/;
const RANGE = /^m(\d{1,4})-(\d{1,4})$/;
const TEMPO = /^t(\d{1,3})$/;
const PART = /^part-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MUTE = /^mute-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CAPO = /^capo(\d{1,2})$/;
const SHIFT = /^(up|down)(\d{1,2})$/;
const LAYERS: Readonly<Record<string, ScoreLayer>> = { 'tab-only': 'tab', 'tab-and-notes': 'both', notes: 'notation' };
const LAYER_PARAM: Readonly<Record<ScoreLayer, string>> = { tab: 'tab-only', both: 'tab-and-notes', notation: 'notes' };

/** Read the route params of `#play--…`. Unknown or malformed params are ignored, never thrown on. */
export function parsePlayerParams(params: readonly string[]): PlayerRequest {
  const out: PlayerRequest = { songId: null, startBar: null, loop: null, tempo: null, mode: null, section: null, part: null, mute: [], layer: null, hideChart: false, capo: null, transpose: null };
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
    } else if ((m = p.match(PART))) {
      out.part = m[1];
    } else if ((m = p.match(MUTE))) {
      if (!out.mute.includes(m[1])) out.mute.push(m[1]);
    } else if (p in LAYERS) {
      out.layer = LAYERS[p];
    } else if (p === 'hide-chart') {
      out.hideChart = true;
    } else if ((m = p.match(CAPO))) {
      const n = Number(m[1]);
      if (n <= MAX_CAPO) out.capo = clampCapo(n);
    } else if ((m = p.match(SHIFT))) {
      const n = Number(m[2]);
      if (n >= 1 && n <= MAX_TRANSPOSE) out.transpose = clampTranspose(m[1] === 'up' ? n : -n);
    } else if (!out.section) {
      out.section = p;
    }
  }
  return out;
}

/** What a player link can ask for (see the module comment). */
export interface PlayerLinkOptions {
  startBar?: number | null;
  loop?: BarRange | null;
  tempo?: number | null;
  mode?: PracticeMode | null;
  section?: string | null;
  /** Track id, name or role of the part to play. */
  part?: string | null;
  mute?: readonly string[];
  layer?: ScoreLayer | null;
  hideChart?: boolean;
  capo?: number | null;
  transpose?: number | null;
}

/** Route params for a player link: `href('play', ...playerParams('greensleeves', { loop: { from: 8, to: 11 }, tempo: 70 }))`. */
export function playerParams(songId: string, opts: PlayerLinkOptions = {}): string[] {
  const out = [songId];
  if (opts.section) out.push(slug(opts.section));
  if (opts.loop) out.push(`m${Math.min(opts.loop.from, opts.loop.to) + 1}-${Math.max(opts.loop.from, opts.loop.to) + 1}`);
  else if (opts.startBar !== undefined && opts.startBar !== null && opts.startBar > 0) out.push(`m${opts.startBar + 1}`);
  if (opts.tempo !== undefined && opts.tempo !== null && clampTempo(opts.tempo) !== 100) out.push(`t${clampTempo(opts.tempo)}`);
  if (opts.mode && opts.mode !== 'listen') out.push(opts.mode);
  if (opts.part) out.push(`part-${slug(opts.part)}`);
  for (const m of opts.mute ?? []) out.push(`mute-${slug(m)}`);
  if (opts.layer) out.push(LAYER_PARAM[opts.layer]);
  if (opts.hideChart) out.push('hide-chart');
  if (opts.capo !== undefined && opts.capo !== null) out.push(`capo${clampCapo(opts.capo)}`);
  const tr = opts.transpose !== undefined && opts.transpose !== null ? clampTranspose(opts.transpose) : 0;
  if (tr) out.push(tr > 0 ? `up${tr}` : `down${-tr}`);
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
  /** The track id of the part asked for, when the song has it. */
  track: string | null;
  /** Track ids to mute, or null when the address names none. */
  muted: string[] | null;
  layer: ScoreLayer | null;
  hideChart: boolean;
  capo: number | null;
  transpose: number | null;
  /** Plain sentences about what could not be followed ("This song has 16 bars."). */
  problems: string[];
}

type TrackInfo = Pick<Song['tracks'][number], 'id' | 'name' | 'role'>;

/**
 * The track a `part-` or `mute-` param means: its id, else its name as a slug, else the first
 * track with that role (`rhythm`, `lead`, `bass`; `strum` and `melody` are read as those too).
 */
export function findPart(tracks: readonly TrackInfo[], want: string): TrackInfo | null {
  const w = slug(want);
  if (!w) return null;
  const byId = tracks.find((t) => slug(t.id) === w) ?? tracks.find((t) => slug(t.name || '') === w);
  if (byId) return byId;
  const role = w === 'strum' || w === 'chords' ? 'rhythm' : w === 'melody' || w === 'tune' ? 'lead' : w;
  return tracks.find((t) => t.role === role) ?? null;
}

/** Check a request against the song it opened. */
export function resolveRequest(req: PlayerRequest, song: Pick<Song, 'bars' | 'sections'> & { tracks?: readonly TrackInfo[] }): ResolvedRequest {
  const count = song.bars.length;
  const tracks = song.tracks ?? [];
  const problems: string[] = [];
  const out: ResolvedRequest = {
    startBar: null, loop: null, tempo: req.tempo, mode: req.mode, sectionName: null, track: null, muted: null,
    layer: req.layer ?? null, hideChart: req.hideChart ?? false, capo: req.capo ?? null, transpose: req.transpose ?? null, problems,
  };
  const tooFar = () => problems.push(`This song has ${count} ${count === 1 ? 'bar' : 'bars'}, so the player starts at the top.`);
  // A section called "Part A" reads as `part-a`: when no part is called that, it is the section.
  let section = req.section;
  let part = req.part;
  if (part && !findPart(tracks, part) && song.sections.some((s) => slug(s.name) === `part-${part}`)) {
    section = section ?? `part-${part}`;
    part = null;
  }
  if (section) {
    const found = song.sections.find((s) => slug(s.name) === section);
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
  if (part) {
    const t = findPart(tracks, part);
    if (t) out.track = t.id;
    else if (tracks.length) problems.push(`This song has no part called "${part.replace(/-/g, ' ')}", so you play ${tracks[0].name || 'the first part'}. Choose another under Parts.`);
  }
  if (req.mute?.length) {
    const ids = req.mute.map((m) => findPart(tracks, m)?.id).filter((x): x is string => !!x);
    out.muted = [...new Set(ids)];
  }
  return out;
}

/** A stable key for the params after the song id, to tell a reload (same address) from a new request. */
export function requestKey(params: readonly string[]): string {
  return params.slice(1).join('--');
}
