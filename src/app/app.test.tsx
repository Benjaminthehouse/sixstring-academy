// @vitest-environment jsdom
/**
 * The shell's contract, exercised with a small stand-in registry: the screen for the current hash
 * renders inside <main id="main" data-route>, lazily, with its params, behind an error boundary
 * that resets on navigation; the navigation follows the route; the first-run flow keeps to Today.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./routes', async () => {
  const { createElement } = await import('react');
  const { useScreenTitle } = await import('./shell/screenTitle');
  const { useImmersive } = await import('./shell/immersive');
  type Props = { params: string[] };
  const screen = (name: string, hook?: () => void) => async () => ({
    default: ({ params }: Props) => {
      hook?.();
      return createElement('div', { 'data-screen': name, 'data-params': params.join(',') }, createElement('h1', null, `${name} screen`));
    },
  });
  const def = (name: string, title: string, section: string, inHub: boolean, load = screen(name)) => ({ name, title, blurb: `${title} blurb`, section, icon: 'Circle', inHub, load });
  const ROUTES = [
    def('home', 'Today', 'home', false),
    def('study', 'Learn', 'learn', false),
    def('studio', 'Play', 'play', false),
    def('tools', 'Tools', 'tools', false),
    def('learn', 'Theory Path', 'learn', true),
    def('scales', 'Scales', 'play', true),
    def('play', 'Player', 'play', false),
    def('tuner', 'Tuner', 'tools', true),
    def('boom', 'Boom', 'tools', true, async () => ({
      default: () => {
        throw new Error('kaboom');
      },
    })),
    def('titled', 'Songs', 'play', true, screen('titled', () => useScreenTitle('Greensleeves'))),
    def('deep', 'Deep', 'play', true, screen('deep', () => useImmersive())),
    def('bare', 'Bare', 'play', true, screen('bare', () => useImmersive(true, 'bare'))),
    def('profile', 'Me', 'me', false),
  ];
  const ROUTE_BY_NAME = Object.fromEntries(ROUTES.map((r) => [r.name, r]));
  return { ROUTES, ROUTE_BY_NAME, routeDef: (name: string) => ROUTE_BY_NAME[name] ?? ROUTE_BY_NAME.home };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

const settle = async () => {
  // Lazy screens resolve over a couple of microtask turns.
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
};

async function mount(hash: string, options: { wide?: boolean; skipOnboarding?: boolean } = {}) {
  const { wide = false, skipOnboarding = true } = options;
  window.localStorage.clear();
  if (skipOnboarding) window.localStorage.setItem('ssa:shell.onboarding', JSON.stringify({ skipped: true }));
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('min-width: 900px'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  window.location.hash = hash;
  const { default: App } = await import('./App');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<App />);
  });
  await settle();
}

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await settle();
}

/** The first-run flow is its own lazy chunk (it pulls in the theory module), so it needs real time to load. */
async function waitForDialog(): Promise<HTMLElement> {
  for (let i = 0; i < 200; i++) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (dialog) return dialog;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error('the first-run dialog never appeared');
}

const main = () => document.querySelector('main#main') as HTMLElement;
const tabBar = () => document.querySelector('nav[aria-label="Main"]');

beforeEach(() => {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  // Shell state that lives outside React must not leak into the next test.
  (await import('./onboarding/store')).closeOnboarding();
  (await import('./shell/stats')).closeStats();
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('the screen outlet', () => {
  it('renders the route of the hash inside main, lazily, with its params', async () => {
    await mount('#scales--a-minor--box-1');
    expect(main().getAttribute('data-route')).toBe('scales');
    const screen = main().querySelector('[data-screen]');
    expect(screen?.getAttribute('data-screen')).toBe('scales');
    expect(screen?.getAttribute('data-params')).toBe('a-minor,box-1');
  });

  it('shows Today for an empty hash', async () => {
    await mount('');
    expect(main().getAttribute('data-route')).toBe('home');
    expect(main().querySelector('[data-screen="home"]')).not.toBeNull();
  });

  it('swaps the screen and the document title on navigation', async () => {
    await mount('#tuner');
    expect(document.title).toBe('Tuner · Sixstring Academy');
    await go('#scales');
    expect(main().getAttribute('data-route')).toBe('scales');
    expect(main().querySelector('[data-screen="scales"]')).not.toBeNull();
    expect(main().querySelector('[data-screen="tuner"]')).toBeNull();
    expect(document.title).toBe('Scales · Sixstring Academy');
  });

  it('sends an address that names no screen to Today, and fixes the address', async () => {
    await mount('#no-such-screen--x');
    expect(main().getAttribute('data-route')).toBe('home');
    expect(main().querySelector('[data-screen]')?.getAttribute('data-params')).toBe('');
    expect(window.location.hash).toBe('#home');
  });

  it('uses the title a screen gives itself', async () => {
    await mount('#titled');
    expect(document.title).toBe('Greensleeves · Sixstring Academy');
    await go('#tuner');
    expect(document.title).toBe('Tuner · Sixstring Academy');
  });

  it('contains a crashing screen, keeps the navigation alive, and recovers on navigation', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await mount('#boom');
    expect(main().getAttribute('data-route')).toBe('boom');
    const alert = main().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Boom hit a problem');
    expect(alert?.textContent).toContain('Try again');
    expect(alert?.textContent).toContain('Reload the app');
    expect(tabBar()).not.toBeNull();
    expect(errors).toHaveBeenCalled();
    await go('#tuner');
    expect(main().querySelector('[role="alert"]')).toBeNull();
    expect(main().querySelector('[data-screen="tuner"]')).not.toBeNull();
  });
});

describe('phone navigation', () => {
  it('has five tabs and marks the section of the current route', async () => {
    await mount('#scales--a-minor');
    const links = Array.from(tabBar()?.querySelectorAll('a') ?? []);
    expect(links.map((a) => a.textContent)).toEqual(['Today', 'Learn', 'Play', 'Tools', 'Me']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#home', '#study', '#studio', '#tools', '#profile']);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'true', null, null]);
    await go('#studio');
    expect(tabBar()?.querySelector('[aria-current="page"]')?.textContent).toBe('Play');
  });

  it('shows the progress chips in the top bar', async () => {
    await mount('#tuner');
    const chips = document.querySelector('[role="group"][aria-label="Your progress today"]');
    expect(chips?.querySelectorAll('button')).toHaveLength(4);
  });

  it('hides the tab bar on a route that is immersive by default, and brings it back after', async () => {
    await mount('#play--greensleeves');
    expect(tabBar()).toBeNull();
    expect(document.querySelector('header button[aria-label="Back"]')).not.toBeNull();
    expect(document.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe('focus');
    await go('#tuner');
    expect(tabBar()).not.toBeNull();
    expect(document.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe('none');
  });

  it('lets a screen ask for immersion with useImmersive, and for no top bar at all', async () => {
    await mount('#deep');
    expect(tabBar()).toBeNull();
    expect(document.querySelector('header')).not.toBeNull();
    await go('#bare');
    expect(tabBar()).toBeNull();
    expect(document.querySelector('header')).toBeNull();
    await go('#scales');
    expect(tabBar()).not.toBeNull();
  });
});

describe('wide navigation', () => {
  it('shows a sidebar with the destinations and the screens of each section', async () => {
    await mount('#tuner', { wide: true });
    const nav = document.querySelector('aside nav[aria-label="Main"]');
    expect(nav).not.toBeNull();
    const hrefs = Array.from(nav?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'));
    for (const expected of ['#home', '#study', '#studio', '#tools', '#profile', '#learn', '#scales', '#tuner']) expect(hrefs).toContain(expected);
    expect(hrefs).not.toContain('#play');
    expect(nav?.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('#tuner');
    expect(nav?.querySelector('a[href="#tools"]')?.getAttribute('aria-current')).toBe('true');
    expect(document.querySelector('header')).toBeNull();
    expect(document.querySelector('aside [role="group"][aria-label="Your progress today"]')).not.toBeNull();
  });

  it('folds to an icon rail on an immersive screen', async () => {
    await mount('#play', { wide: true });
    const links = Array.from(document.querySelectorAll('aside nav a'));
    expect(links).toHaveLength(5);
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Today', 'Learn', 'Play', 'Tools', 'Me']);
  });
});

describe('accessibility hooks', () => {
  it('offers a skip link that moves focus to main without changing the route', async () => {
    await mount('#tuner');
    const skip = document.querySelector('a[href="#main"]') as HTMLAnchorElement;
    expect(skip.textContent).toBe('Skip to content');
    await act(async () => {
      skip.click();
    });
    expect(document.activeElement).toBe(main());
    expect(main().getAttribute('data-route')).toBe('tuner');
    expect(window.location.hash).toBe('#tuner');
  });

  it('announces the new screen after a navigation', async () => {
    await mount('#tuner');
    const live = document.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]');
    expect(live?.textContent).toBe('');
    await go('#scales');
    expect(live?.textContent).toBe('Scales');
  });
});

describe('first run', () => {
  it('opens the first-run flow on Today', async () => {
    await mount('#home', { skipOnboarding: false });
    const dialog = await waitForDialog();
    expect(dialog.textContent).toContain('Welcome to Sixstring Academy');
    expect(dialog.textContent).toContain('Skip for now');
    // The app is still there underneath: onboarding never replaces it.
    expect(main().querySelector('[data-screen="home"]')).not.toBeNull();
  });

  it('leaves a direct link to another screen alone', async () => {
    await mount('#tuner', { skipOnboarding: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(main().querySelector('[data-screen="tuner"]')).not.toBeNull();
  });

  it('remembers a skip and does not ask again', async () => {
    await mount('#home', { skipOnboarding: false });
    const dialog = await waitForDialog();
    const skip = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Skip for now') as HTMLButtonElement;
    await act(async () => {
      skip.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('ssa:shell.onboarding') ?? '{}').skipped).toBe(true);
    await go('#tuner');
    await go('#home');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
