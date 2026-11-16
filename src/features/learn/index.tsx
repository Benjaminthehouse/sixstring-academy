/**
 * The Theory Path (`#learn`): the map of 43 units in three stages, the lessons, checkpoints,
 * practice drills and reviews that run on it, and "Find my level". Addresses: see `model/route.ts`.
 */
import type { RouteProps } from '@/app/routes';
import { parseLearnParams } from './model/route';
import { PathScreen } from './ui/PathScreen';
import { PlacementScreen } from './ui/PlacementScreen';
import { SessionScreen } from './ui/SessionScreen';

/** The `#learn` route. */
export default function Learn({ params }: RouteProps) {
  const view = parseLearnParams(params);
  // The route stays mounted while its params change: key each screen by its address.
  const key = params.join('--');
  switch (view.kind) {
    case 'map':
      return <PathScreen focus={view.unitId} />;
    case 'placement':
      return <PlacementScreen key={key} />;
    default:
      return <SessionScreen key={key} view={view} />;
  }
}
