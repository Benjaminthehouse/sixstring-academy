import type { RouteProps } from '../routes';
import { STUDIO_GROUPS } from './groups';
import { Hub } from './Hub';

/** The Play tab (`#studio`): songs, scales, chords, games and drills. */
export default function StudioHub(_props: RouteProps) {
  return <Hub section="play" title="Play" subtitle="Guitar in hand. Pick a song, a scale or a drill and make some noise." groups={STUDIO_GROUPS} allTitle="Everything in Play" />;
}
