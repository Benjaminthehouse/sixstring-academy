/**
 * Bottom clearance: keeps toasts (and any other layer fixed to the bottom of the screen) above the
 * controls a screen keeps at the bottom, but only while those controls really are down there.
 *
 * The kit publishes one number on `<html>` as `--action-bar-h`: how much room, above the shell's
 * bottom bar (`--sticky-bottom`), is taken by controls that sit at the bottom of the screen. Toasts
 * add it to their offset, and so should a screen-made fixed bottom layer. Every `ActionBar` feeds
 * it, and `useBottomClearance(ref)` lets any other block of bottom controls do the same.
 *
 * A bar that is not at the bottom (a short page where it ends mid-screen, a layout that makes it
 * static beside the content on wide screens) adds nothing, so toasts stay where they belong.
 */
import { useEffect, type RefObject } from 'react';

/** The most clearance one element may claim, as a share of the screen height. */
export const MAX_CLEARANCE_SHARE = 0.6;
/** How close (in rem) above the bottom edge an element's lower edge must be to count as "at the bottom". */
export const BOTTOM_ZONE_REM = 6;
/** From this width toasts stack in a column at the bottom right (see Toast.module.css). */
const TOAST_COLUMN_FROM_PX = 720;

/** The edges of an element on screen, in px from the top (and left) of the viewport. */
export interface VerticalBox {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

/** Where toasts appear across the screen: the full width on phones, a column at the right from 720 px. */
export interface ToastColumn {
  left: number;
  right: number;
}

/**
 * The room an element needs kept free above the bottom edge (`floor`: the top of the shell's bottom
 * bar, or the screen's bottom where there is none). 0 when the element is empty, below the floor,
 * ends higher than `zone` px above it, or (given `column`) lies beside the column toasts use: then a
 * toast cannot touch it. Never more than 60 % of the screen, so a tall block scrolled near the top
 * does not send toasts off screen.
 */
export function bottomClearance(box: VerticalBox, floor: number, viewportHeight: number, zone: number, column?: ToastColumn): number {
  if (![box.top, box.bottom, floor, viewportHeight, zone].every(Number.isFinite)) return 0;
  if (viewportHeight <= 0 || box.bottom - box.top < 1) return 0;
  if (box.top >= floor || box.bottom < floor - Math.max(0, zone)) return 0;
  if (column && box.left !== undefined && box.right !== undefined && (box.right <= column.left || box.left >= column.right)) return 0;
  return Math.round(Math.max(0, Math.min(viewportHeight * MAX_CLEARANCE_SHARE, floor - box.top)));
}

// --- the shared registry ----------------------------------------------------------------------

const claims = new Map<object, number>();

/** Publish the largest live claim as `--action-bar-h` (or remove it when there is none). */
function publish(): void {
  if (typeof document === 'undefined') return;
  const px = Math.max(0, ...claims.values());
  const root = document.documentElement;
  if (px > 0) root.style.setProperty('--action-bar-h', `${px}px`);
  else root.style.removeProperty('--action-bar-h');
}

/** Set (or with `px <= 0`, drop) the clearance claimed by `owner`. */
export function claimBottomClearance(owner: object, px: number): void {
  const next = Math.max(0, Math.round(px));
  const had = claims.get(owner);
  if (next > 0) {
    if (had === next) return;
    claims.set(owner, next);
  } else {
    if (had === undefined) return;
    claims.delete(owner);
  }
  publish();
}

/** The clearance currently published, in px (0 when none). */
export function currentBottomClearance(): number {
  return Math.max(0, ...claims.values());
}

// --- measuring --------------------------------------------------------------------------------

let probe: HTMLDivElement | null = null;

/**
 * `--sticky-bottom` as the element sees it (the height of the shell's bottom bar), in px. A custom
 * property's computed value is still an expression ("calc(60px + env(...))"), so it is resolved by
 * giving it to a hidden probe as a height.
 */
function stickyBottomPx(el: Element): number {
  const raw = getComputedStyle(el).getPropertyValue('--sticky-bottom').trim();
  if (!raw) return 0;
  const plain = /^(-?\d+(?:\.\d+)?)px$/.exec(raw);
  if (plain) return Number(plain[1]);
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
  }
  probe.style.height = '0px';
  probe.style.height = raw;
  return probe.getBoundingClientRect().height;
}

function remPx(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** The strip of the screen toasts use: all of it on phones, a 26rem column 1.5rem from the right edge from 720 px. */
export function toastColumn(viewportWidth: number, rem: number): ToastColumn {
  if (viewportWidth < TOAST_COLUMN_FROM_PX) return { left: 0, right: viewportWidth };
  const right = viewportWidth - 1.5 * rem;
  return { left: Math.max(0, right - 26 * rem), right };
}

/**
 * Measure `el` once: the clearance it needs right now. With `stickyOnly`, an element that a layout
 * made static (an ActionBar placed beside the content on a wide screen) is part of the page, not a
 * bar at the bottom, and claims nothing.
 */
export function measureBottomClearance(el: Element, stickyOnly = false): number {
  if (typeof window === 'undefined') return 0;
  if (stickyOnly) {
    const position = getComputedStyle(el).position;
    if (position !== 'sticky' && position !== 'fixed') return 0;
  }
  const rect = el.getBoundingClientRect();
  const viewport = window.innerHeight;
  const floor = viewport - stickyBottomPx(el);
  const rem = remPx();
  return bottomClearance(rect, floor, viewport, BOTTOM_ZONE_REM * rem, toastColumn(document.documentElement.clientWidth || window.innerWidth, rem));
}

/**
 * Keep toasts and other bottom layers above the controls in `ref` while they sit at the bottom of
 * the screen. For bottom controls that are not an `ActionBar` (an `ActionBar` already does this).
 *   const controls = useRef<HTMLDivElement>(null);
 *   useBottomClearance(controls);            // or useBottomClearance(controls, !twoPane)
 * Re-measures on scroll, resize and when the element or the page changes size.
 */
export function useBottomClearance(ref: RefObject<HTMLElement | null>, active: boolean = true, options: { stickyOnly?: boolean } = {}): void {
  const stickyOnly = !!options.stickyOnly;
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window === 'undefined') return undefined;
    const owner = {};
    let frame = 0;
    const measure = () => {
      frame = 0;
      claimBottomClearance(owner, el.isConnected ? measureBottomClearance(el, stickyOnly) : 0);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    ro?.observe(el);
    // The page around it moving (content loading, a bar appearing) moves the element too.
    ro?.observe(document.body);
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener('resize', later);
      window.removeEventListener('scroll', later);
      claimBottomClearance(owner, 0);
    };
  }, [ref, active, stickyOnly]);
}
