/**
 * Ear Training: the ear class of a music school, as a game. `#ear` is the hub; the rest are params:
 *
 *   #ear--<drill>              the drill's levels (pitch, intervals-up, chords, tuning, degrees,
 *                              melody, scales, progressions, intervals-down, intervals-together, compound)
 *   #ear--<drill>--<level>     a level: intro, a round of questions, summary
 *   #ear--progression--<id>    one progression of the catalog (`@/content/progressions`) by ear,
 *                              against its look-alikes (linked from the progression's page)
 */
import { useEffect, useState } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { Page, Skeleton } from '@/ui';
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

/**
 * A progression of the catalog by ear. The catalog (170 progressions) is loaded only for this
 * address, so the other ear screens do not carry it.
 */
function CatalogRound({ id }: { id: string }) {
  const [found, setFound] = useState<ReturnType<typeof import('./core/drills/catalog').catalogRound> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void import('./core/drills/catalog').then((m) => {
      if (live) setFound(m.catalogRound(id));
    });
    return () => {
      live = false;
    };
  }, [id]);
  if (found === null) return <Redirect params={['progressions']} />;
  if (!found) {
    return (
      <Page title="Progression by ear">
        <div aria-busy="true">
          <Skeleton variant="block" height={160} />
        </div>
      </Page>
    );
  }
  return <RoundScreen key={`progression:${found.progression.id}`} drill={found.drill} level={found.level} />;
}

/** The ear-training screen. */
export default function EarTraining({ params }: RouteProps) {
  const [drillId, levelId] = params;
  if (!drillId) return <Hub />;
  if (drillId === 'progression') return <CatalogRound key={levelId ?? ''} id={levelId ?? ''} />;
  const drill = drillById(drillId);
  if (!drill) return <Redirect params={[]} />;
  if (!levelId) return <DrillScreen key={drill.id} drill={drill} />;
  const level = levelOf(drill, levelId);
  if (!level) return <Redirect params={[drill.id]} />;
  return <RoundScreen key={`${drill.id}:${level.n}`} drill={drill} level={level} />;
}
