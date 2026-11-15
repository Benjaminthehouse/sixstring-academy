/**
 * The numbers of the shell's layout that other code may need. The CSS in `Shell.module.css` uses
 * the same values.
 */

/** From this width up the shell shows the sidebar instead of the phone bars. */
export const WIDE_LAYOUT_PX = 900;

/** Media query for the sidebar layout. */
export const WIDE_LAYOUT_QUERY = `(min-width: ${WIDE_LAYOUT_PX}px)`;

/** Height of the phone top bar's content row in px (slimmer on a phone held sideways). */
export const TOPBAR_HEIGHT = 52;
