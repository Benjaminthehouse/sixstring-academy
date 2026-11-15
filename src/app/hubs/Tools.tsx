import type { RouteProps } from '../routes';
import { Hub } from './Hub';

/** The Tools tab (`#tools`): tuner, metronome, live fretboard and the scanner. */
export default function ToolsHub(_props: RouteProps) {
  return <Hub section="tools" title="Tools" subtitle="The things you reach for every time you pick up the guitar." allTitle="All tools" />;
}
