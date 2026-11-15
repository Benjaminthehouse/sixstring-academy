/**
 * Navigation model of the shell: the five destinations, which one a route belongs to, and the
 * routes listed under each. Pure functions over the route registry, so the tab bar, the sidebar,
 * the hubs and the search all agree.
 */
import { ROUTES, ROUTE_BY_NAME, routeDef, type RouteDef, type Section } from '../routes';

/** One of the five places the tab bar and the sidebar lead to. */
export interface Destination {
  /** Registry section this destination stands for. */
  section: Section;
  /** Route name of the destination's own screen (a hub, Today or Me). */
  route: string;
  /** Short tab label. */
  label: string;
  /** lucide icon name. */
  icon: string;
}

const DESTINATION_ROUTES: ReadonlyArray<readonly [Section, string]> = [
  ['home', 'home'],
  ['learn', 'study'],
  ['play', 'studio'],
  ['tools', 'tools'],
  ['me', 'profile'],
];

/** Today, Learn, Play, Tools, Me: in tab order. Labels and icons come from the registry. */
export const DESTINATIONS: readonly Destination[] = DESTINATION_ROUTES.map(([section, route]) => {
  const def = ROUTE_BY_NAME[route];
  return { section, route, label: def?.title ?? route, icon: def?.icon ?? 'Circle' };
});

/** True when the name is a screen in the registry. */
export function isKnownRoute(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_BY_NAME, name);
}

/** The destination a route belongs to (unknown names fall back to Today, like the registry). */
export function destinationFor(routeName: string): Destination {
  const section = routeDef(routeName).section;
  return DESTINATIONS.find((d) => d.section === section) ?? DESTINATIONS[0];
}

/** The screens listed under a section: every registry route of that section with `inHub`. */
export function hubRoutes(section: Section): RouteDef[] {
  return ROUTES.filter((r) => r.section === section && r.inHub);
}

/** True for the five destination screens themselves. */
export function isDestinationRoute(routeName: string): boolean {
  return DESTINATIONS.some((d) => d.route === routeName);
}

/**
 * Where "up" leads from a screen, as `[route, ...params]`: a sub-screen goes to its feature's
 * front page, a feature goes to its section hub, a destination goes to Today.
 */
export function upTarget(routeName: string, params: readonly string[]): string {
  const def = routeDef(routeName);
  if (params.length > 0 && def.inHub) return def.name;
  if (isDestinationRoute(def.name)) return 'home';
  return destinationFor(def.name).route;
}

/** Screens a learner can look for: everything shown in a hub, plus the five destinations. */
export function searchableRoutes(): RouteDef[] {
  return ROUTES.filter((r) => r.inHub || isDestinationRoute(r.name));
}

/** Name of the app, used in the document title and the brand. */
export const APP_NAME = 'Sixstring Academy';

/** The browser tab title for a screen. */
export function documentTitleFor(screenTitle: string): string {
  const clean = screenTitle.trim();
  return clean ? `${clean} · ${APP_NAME}` : APP_NAME;
}

/**
 * Which sidebar sections can show their routes without making the sidebar scroll.
 *
 * The current section always comes first; after it, sections are opened in tab order for as long
 * as their rows fit. On a tall screen that is all of them; on a laptop it is the current section
 * and whatever else there is room for. `budget` is the number of sub-rows that fit, `spacing` the
 * rows an open group costs on top of its routes.
 */
export function sectionsThatFit(budget: number, active: Section, counts: Readonly<Partial<Record<Section, number>>>, spacing = 0.5): Section[] {
  const order: Section[] = [active, ...DESTINATIONS.map((d) => d.section).filter((s) => s !== active)];
  const open: Section[] = [];
  let left = budget;
  for (const section of order) {
    const rows = counts[section] ?? 0;
    if (rows <= 0) continue;
    const cost = rows + spacing;
    // The current section opens even when it does not fit: the sidebar scrolls rather than hide where you are.
    if (cost <= left || section === active) {
      open.push(section);
      left -= cost;
    }
  }
  return open;
}
