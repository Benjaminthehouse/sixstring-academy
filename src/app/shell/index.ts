/**
 * What the shell offers to screens. Import from `@/app/shell`; read `src/app/API.md` first.
 */
export { useImmersive, requestImmersive, IMMERSIVE_ROUTES, type ImmersiveLevel } from './immersive';
export { useScreenTitle } from './screenTitle';
export { openStats, closeStats, type StatTab } from './stats';
export { openOnboarding } from '../onboarding/store';
export { WeekStrip, type WeekStripProps } from './WeekStrip';
export { WIDE_LAYOUT_PX, WIDE_LAYOUT_QUERY } from './Shell';
export { TOPBAR_HEIGHT } from './TopBar';
export { DESTINATIONS, destinationFor, hubRoutes, APP_NAME, type Destination } from './nav';
