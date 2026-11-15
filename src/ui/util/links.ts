import { href as routeHref } from '@/app/router';

/** Props shared by every kit component that can render as a link. */
export interface LinkTarget {
  /** Route name from the registry, e.g. "scales". Rendered with `href()` from the router. */
  to?: string;
  /** Slug-safe params for `to`, e.g. ["a-minor"]. */
  params?: Array<string | undefined>;
  /** A ready-made href (use `href('scales', 'a-minor')`), or an external URL. */
  href?: string;
}

/** Resolve `to`/`params`/`href` into one href string, or undefined when the component is not a link. */
export function resolveHref(target: LinkTarget): string | undefined {
  if (target.to) return routeHref(target.to, ...(target.params ?? []));
  return target.href;
}

/** True for links that leave the app (http, https, mailto ...), which open in a new tab. */
export function isExternalHref(value: string | undefined): boolean {
  return !!value && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}
