/**
 * The parts of the "Me" area. Each one is a real address (`#profile`, `#profile--shop` ...), so
 * the back button, links from elsewhere and a reload all land on the right part.
 */

/** Ids of the parts, which are also their route params (the overview has none). */
export type SectionId = 'overview' | 'achievements' | 'shop' | 'settings' | 'account' | 'data' | 'about';

/** One part of the Me area. */
export interface SectionDef {
  id: SectionId;
  /** Route param after `profile`; undefined for the overview. */
  param: string | undefined;
  /** Short label for the tab strip and the side list. */
  label: string;
  /** Page title. */
  title: string;
  /** lucide icon name. */
  icon: string;
}

/** The parts, in the order they are listed. */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'overview', param: undefined, label: 'Overview', title: 'Me', icon: 'CircleUser' },
  { id: 'achievements', param: 'achievements', label: 'Achievements', title: 'Achievements', icon: 'Trophy' },
  { id: 'shop', param: 'shop', label: 'Shop', title: 'Shop', icon: 'Gem' },
  { id: 'settings', param: 'settings', label: 'Settings', title: 'Settings', icon: 'SlidersHorizontal' },
  { id: 'account', param: 'account', label: 'Account', title: 'Account', icon: 'User' },
  { id: 'data', param: 'data', label: 'Your data', title: 'Your data', icon: 'HardDrive' },
  { id: 'about', param: 'about', label: 'About', title: 'About', icon: 'Info' },
];

/** Words people (and old links) use for a part, mapped to it. */
const ALIASES: Readonly<Record<string, SectionId>> = {
  overview: 'overview',
  progress: 'overview',
  stats: 'overview',
  achievements: 'achievements',
  trophies: 'achievements',
  badges: 'achievements',
  shop: 'shop',
  store: 'shop',
  gems: 'shop',
  settings: 'settings',
  preferences: 'settings',
  options: 'settings',
  account: 'account',
  'sign-in': 'account',
  signin: 'account',
  login: 'account',
  sync: 'account',
  devices: 'account',
  data: 'data',
  backup: 'data',
  export: 'data',
  about: 'about',
  credits: 'about',
};

/** A part by id. */
export function sectionById(id: SectionId): SectionDef {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

/** What the route params name. */
export interface ProfileLocation {
  section: SectionDef;
  /** The param after the section (an achievement id, a settings group), if any. */
  detail: string | null;
  /** False when the first param named no part: the screen then shows the overview and fixes the address. */
  known: boolean;
}

/** Read the route params of `#profile--…`. Unknown words fall back to the overview. */
export function locate(params: readonly string[]): ProfileLocation {
  const first = params[0];
  if (!first) return { section: SECTIONS[0], detail: null, known: true };
  const id = ALIASES[first];
  if (!id) return { section: SECTIONS[0], detail: null, known: false };
  return { section: sectionById(id), detail: params[1] ?? null, known: true };
}

/** Route params that lead to a part (and optionally a detail inside it). */
export function paramsFor(id: SectionId, detail?: string): string[] {
  const section = sectionById(id);
  const out: string[] = [];
  if (section.param) out.push(section.param);
  if (detail && section.param) out.push(detail);
  return out;
}
