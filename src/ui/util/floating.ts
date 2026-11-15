/** Where a floating panel sits relative to its anchor. */
export type Placement = 'top' | 'bottom' | 'left' | 'right';
/** Cross-axis alignment of the panel against the anchor. */
export type Align = 'start' | 'center' | 'end';

/** A rectangle in viewport coordinates. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Result of `placeFloating`: the panel's top-left corner plus the side that was actually used. */
export interface FloatingPosition {
  left: number;
  top: number;
  placement: Placement;
  /** Offset of the anchor's centre along the panel's edge, for drawing an arrow. */
  arrow: number;
}

/** Options for `placeFloating`. */
export interface FloatingOptions {
  placement?: Placement;
  align?: Align;
  /** Gap between anchor and panel. */
  offset?: number;
  /** Minimum distance kept from the viewport edge. */
  margin?: number;
}

const OPPOSITE: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function spaceOn(side: Placement, anchor: Box, viewport: { width: number; height: number }): number {
  if (side === 'top') return anchor.top;
  if (side === 'bottom') return viewport.height - (anchor.top + anchor.height);
  if (side === 'left') return anchor.left;
  return viewport.width - (anchor.left + anchor.width);
}

/**
 * Position a floating panel next to an anchor: prefers `placement`, flips to the opposite side when
 * it does not fit there and fits better on the other, then shifts along the cross axis to stay
 * inside the viewport.
 */
export function placeFloating(anchor: Box, panel: { width: number; height: number }, viewport: { width: number; height: number }, options: FloatingOptions = {}): FloatingPosition {
  const { placement = 'bottom', align = 'center', offset = 8, margin = 8 } = options;
  const vertical = placement === 'top' || placement === 'bottom';
  const need = (vertical ? panel.height : panel.width) + offset + margin;
  let side = placement;
  if (spaceOn(side, anchor, viewport) < need && spaceOn(OPPOSITE[side], anchor, viewport) > spaceOn(side, anchor, viewport)) {
    side = OPPOSITE[side];
  }

  let left: number;
  let top: number;
  if (vertical) {
    top = side === 'top' ? anchor.top - panel.height - offset : anchor.top + anchor.height + offset;
    if (align === 'start') left = anchor.left;
    else if (align === 'end') left = anchor.left + anchor.width - panel.width;
    else left = anchor.left + anchor.width / 2 - panel.width / 2;
  } else {
    left = side === 'left' ? anchor.left - panel.width - offset : anchor.left + anchor.width + offset;
    if (align === 'start') top = anchor.top;
    else if (align === 'end') top = anchor.top + anchor.height - panel.height;
    else top = anchor.top + anchor.height / 2 - panel.height / 2;
  }

  // Shift into view; when the panel is larger than the viewport, pin it to the leading margin.
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
  const maxTop = Math.max(margin, viewport.height - panel.height - margin);
  left = Math.min(Math.max(left, margin), maxLeft);
  top = Math.min(Math.max(top, margin), maxTop);

  const arrow = vertical ? anchor.left + anchor.width / 2 - left : anchor.top + anchor.height / 2 - top;
  const edge = vertical ? panel.width : panel.height;
  return { left: Math.round(left), top: Math.round(top), placement: side, arrow: Math.min(Math.max(arrow, 12), Math.max(12, edge - 12)) };
}
