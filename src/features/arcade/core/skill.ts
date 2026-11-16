/**
 * How arcade rounds are reported to `core/progress`: the skill id (so crowns and the scale
 * achievements follow the shape that was drilled), a title for the log, and the route back.
 *
 *   scale:<scale-slug>:<shape>   every game played inside a shape   scale:a-minor-pentatonic:box-1
 *   scale:<scale-slug>:neck      Fretboard Sprint (the whole neck)  scale:c-major:neck
 *   arcade:mode-match:level-<n>  Mode Match (not tied to one scale)
 */
import { focusSlug, type Focus } from './focus';
import type { GameDef, GameId } from './games';

/** The skill id a round of a game reports. */
export function skillIdFor(game: GameId, focus: Focus, level: number): string {
  if (game === 'mode-match') return `arcade:mode-match:level-${level}`;
  if (game === 'fretboard-sprint') return `scale:${focusSlug(focus)}:neck`;
  return `scale:${focusSlug(focus)}:${focus.shape}`;
}

/** "Note Hunt: A minor pentatonic, Box 1" for the activity log (Sprint covers the whole neck, not a shape). */
export function roundTitle(game: Pick<GameDef, 'id' | 'title'>, scale: string, shape: string | null): string {
  if (game.id === 'mode-match') return `${game.title}: the modes`;
  if (game.id === 'fretboard-sprint') return `${game.title}: ${scale}, whole neck`;
  return shape ? `${game.title}: ${scale}, ${shape}` : `${game.title}: ${scale}`;
}

/** What a game's crowns are for, as the summary says it: "Crown 2 for this shape". */
export function crownLabel(game: GameId, crown: number): string {
  if (game === 'mode-match') return `Crown ${crown} in Mode Match`;
  if (game === 'fretboard-sprint') return `Crown ${crown} for the whole neck`;
  return `Crown ${crown} for this shape`;
}

/** What a game's levels are played on, for headings: the scale, or the modes for Mode Match. */
export function scopeLabel(game: GameId, scaleName: string): string {
  return game === 'mode-match' ? 'The modes' : scaleName;
}

/** Route params that reopen a game on a focus: `['note-hunt', 'a-minor-pentatonic', 'box-1']`. */
export function gameParams(game: GameId, focus: Focus): string[] {
  return [game, focusSlug(focus), focus.shape];
}

/** Route params of a level's round: `['note-hunt', 'a-minor-pentatonic', 'box-1', 'level-2']`. */
export function levelParams(game: GameId, focus: Focus, level: number): string[] {
  return [...gameParams(game, focus), `level-${level}`];
}

/** The level number in a `level-N` param, or null. */
export function parseLevelParam(param: string | undefined): number | null {
  const m = /^level-(\d{1,2})$/.exec(param ?? '');
  return m ? Number(m[1]) : null;
}
