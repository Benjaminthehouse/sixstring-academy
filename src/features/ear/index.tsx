/**
 * Ear Training: the ear class of a music school, as a game. `#ear` is the hub; the rest are params:
 *
 *   #ear--<drill>              the drill's levels (pitch, intervals-up, chords, tuning, degrees,
 *                              melody, scales, progressions, intervals-down, intervals-together, compound)
 *   #ear--<drill>--<level>     a level: intro, a round of questions, summary
 */
import { useEffect } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { drillById, levelOf } from './core/drills';
import { DrillScreen } from './ui/DrillScreen';
import { Hub } from './ui/Hub';
import { RoundScreen } from './ui/RoundScreen';

/** An address that names nothing (an old link, a typo) goes to the nearest list instead of a blank. */
function Redirect({ params }: { params: string[] }) {
  useEffect(() => {
    redirect('ear', ...params);
  }, [params]);
  return null;
}

/** The ear-training screen. */
export default function EarTraining({ params }: RouteProps) {
  const [drillId, levelId] = params;
  if (!drillId) return <Hub />;
  const drill = drillById(drillId);
  if (!drill) return <Redirect params={[]} />;
  if (!levelId) return <DrillScreen key={drill.id} drill={drill} />;
  const level = levelOf(drill, levelId);
  if (!level) return <Redirect params={[drill.id]} />;
  return <RoundScreen key={`${drill.id}:${level.n}`} drill={drill} level={level} />;
}
