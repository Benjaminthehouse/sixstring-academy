/**
 * Stacking order of everything the kit puts above the page. Kept in one place so overlays from
 * different components always layer the same way. The matching numbers are used in the CSS modules.
 *   sticky 20 < drawer/sheet + modal 200 < popover/menu 250 < toast 300 < tooltip 400 < celebration 500
 */
export const LAYERS = { sticky: 20, modal: 200, popover: 250, toast: 300, tooltip: 400, celebration: 500 } as const;
