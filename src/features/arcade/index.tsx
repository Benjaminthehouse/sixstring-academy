/**
 * The Scale Arcade: games that drill scales into the fingers, the eyes and the ears.
 *
 *   #arcade                                         the hub: what you practise, today's challenge, the games
 *   #arcade--daily                                  today's challenge (three short rounds)
 *   #arcade--<scale-slug>[--<shape>]                practise that scale (and shape), then the hub (from #scales)
 *   #arcade--<game>                                 a game's levels, on the scale being practised
 *   #arcade--<game>--<scale-slug>[--<shape>]        the same, on that scale and shape
 *   #arcade--<game>--<scale-slug>--<shape>--level-N a round of level N
 *
 * Games: note-hunt, shape-builder, run-the-scale, degree-darts, mode-match, lick-echo,
 * fretboard-sprint. Scale slugs are the theory module's (`a-minor-pentatonic`, `f-sharp-dorian`),
 * shapes the guitar module's pattern ids (`box-1`, `caged-e`, `3nps-2`, `position-1`).
 */
import { useEffect, useMemo } from 'react';
import { navigate, redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { learnerTuning } from '@/core/settings';
import { focusFromParams, normalizeFocus } from './core/focus';
import { gameById, isGameId } from './core/games';
import { gameParams, parseLevelParam } from './core/skill';
import { setFocus, useRecords } from './ui/store';
import { Hub } from './ui/Hub';
import { GameScreen } from './ui/GameScreen';
import { RoundScreen } from './ui/RoundScreen';
import { Daily } from './ui/Daily';

/** The Scale Arcade screen. */
export default function Arcade({ params }: RouteProps) {
  const [first, slug, shape, levelParam] = params;
  const records = useRecords();
  const isGame = isGameId(first);
  const fromParams = useMemo(() => (isGame ? focusFromParams(slug, shape) : first && first !== 'daily' ? focusFromParams(first, slug) : null), [isGame, first, slug, shape]);
  const tuning = useMemo(() => learnerTuning(), []);
  const focus = useMemo(() => normalizeFocus({ ...records.focus, ...(fromParams ?? {}) }, tuning), [records.focus, fromParams, tuning]);
  const level = parseLevelParam(levelParam);

  // A link names a scale: it becomes what the learner practises (and is there next time).
  useEffect(() => {
    if (!fromParams) return;
    const cur = records.focus;
    if (cur.tonic !== focus.tonic || cur.scale !== focus.scale || cur.shape !== focus.shape) setFocus(focus);
  }, [fromParams, focus, records.focus]);

  // `#arcade--<scale-slug>`: show the hub with that scale. Addresses that name nothing go to the hub.
  useEffect(() => {
    if (!first || first === 'daily' || isGame) return;
    redirect('arcade');
  }, [first, isGame]);

  if (!first) return <Hub />;
  if (first === 'daily') return <Daily focus={focus} />;
  if (!isGame) return null;
  const game = gameById(first)!;
  if (level !== null) {
    return <RoundScreen key={`${game.id}:${focus.tonic}:${focus.scale}:${focus.shape}:${level}`} game={game} focus={focus} level={level} onExit={() => navigate('arcade', ...gameParams(game.id, focus))} />;
  }
  return <GameScreen game={game} focus={focus} />;
}
