/**
 * How the hubs group their screens. Kept as data so a test can check that every screen of a
 * section appears exactly once (screens no group names are listed under "More" by the hub).
 */
import type { RouteDef } from '../routes';
import type { MediaAvailability } from '../shell/media';

/** A titled group of screens inside a hub. */
export interface HubGroup {
  title: string;
  description?: string;
  /** Route names, in display order. */
  routes: readonly string[];
}

/** The Play hub: ten screens in three groups. */
export const STUDIO_GROUPS: readonly HubGroup[] = [
  { title: 'Make music', description: 'Songs to play along with, bands to jam over, and a plan for your practice time.', routes: ['songs', 'progressions', 'practice'] },
  { title: 'Know the neck', description: 'Scales, chords and every note on the fretboard.', routes: ['scales', 'arcade', 'chords', 'fretboard'] },
  { title: 'Build your skills', description: 'Ears, timing and hands: short drills that pay off everywhere else.', routes: ['ear', 'rhythm', 'technique'] },
];

/** The registry routes of a section arranged into the hub's groups; routes no group names go under "More". */
export function arrangeGroups(routes: readonly RouteDef[], groups: readonly HubGroup[] | undefined, allTitle: string): Array<{ title: string; description?: string; routes: RouteDef[] }> {
  if (!groups || groups.length === 0) return routes.length > 0 ? [{ title: allTitle, routes: [...routes] }] : [];
  const byName = new Map(routes.map((r) => [r.name, r]));
  const placed = new Set<string>();
  const out: Array<{ title: string; description?: string; routes: RouteDef[] }> = [];
  for (const group of groups) {
    const list: RouteDef[] = [];
    for (const name of group.routes) {
      const route = byName.get(name);
      if (route && !placed.has(name)) {
        placed.add(name);
        list.push(route);
      }
    }
    if (list.length > 0) out.push({ title: group.title, description: group.description, routes: list });
  }
  const rest = routes.filter((r) => !placed.has(r.name));
  if (rest.length > 0) out.push({ title: 'More', routes: rest });
  return out;
}

/** The devices a screen needs that this host cannot provide. */
export function unavailableDevices(route: RouteDef, media: MediaAvailability): Array<'microphone' | 'camera'> {
  const out: Array<'microphone' | 'camera'> = [];
  if (route.needs?.includes('mic') && !media.mic) out.push('microphone');
  if (route.needs?.includes('camera') && !media.camera) out.push('camera');
  return out;
}
