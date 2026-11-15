import { useEffect, type RefObject } from 'react';
import { useLatest } from './useLatest';

type Target = EventTarget | RefObject<EventTarget | null> | null | undefined;

function resolveTarget(target: Target): EventTarget | null {
  if (!target) return null;
  if ('current' in target && !('addEventListener' in target)) return target.current;
  return target as EventTarget;
}

/** Listen on `window` (pass `window`), with the handler always seeing the latest props. Removed on unmount. */
export function useEventListener<K extends keyof WindowEventMap>(target: Window | null | undefined, type: K, handler: (event: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
/** Listen on `document`. */
export function useEventListener<K extends keyof DocumentEventMap>(target: Document | null | undefined, type: K, handler: (event: DocumentEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
/** Listen on an element or a ref to one. */
export function useEventListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | RefObject<HTMLElement | null> | null | undefined,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): void;
/** Listen on any EventTarget (MediaQueryList, AudioNode, BroadcastChannel ...). */
export function useEventListener(target: Target, type: string, handler: (event: Event) => void, options?: boolean | AddEventListenerOptions): void;
export function useEventListener(target: Target, type: string, handler: (event: never) => void, options?: boolean | AddEventListenerOptions): void {
  const latest = useLatest(handler as (event: Event) => void);
  const capture = typeof options === 'boolean' ? options : options?.capture;
  const passive = typeof options === 'object' ? options?.passive : undefined;
  const once = typeof options === 'object' ? options?.once : undefined;
  useEffect(() => {
    const node = resolveTarget(target);
    if (!node) return;
    const listener = (event: Event) => latest.current(event);
    const opts: AddEventListenerOptions = { capture, passive, once };
    node.addEventListener(type, listener, opts);
    return () => node.removeEventListener(type, listener, opts);
    // `target` may be a ref object (stable) or a node; both are fine as dependencies.
  }, [target, type, capture, passive, once, latest]);
}
