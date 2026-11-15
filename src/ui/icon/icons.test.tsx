// @vitest-environment jsdom
import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import allJson from './all.generated';
import { BUNDLED_ICONS } from './bundled.generated';
import { Icon, isBundledIcon, preloadAllIcons, resolveIcon } from './Icon';
import type { IconNode } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const all = JSON.parse(allJson) as { version: string; icons: Record<string, IconNode>; aliases: Record<string, string> };
const lucideExports = lucide as unknown as Record<string, ComponentType<{ size?: number; strokeWidth?: number }>>;

/** The drawing inside the <svg>, normalised so attribute order and self-closing style do not matter. */
function drawing(markup: string): string[] {
  const inner = markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return (inner.match(/<[a-z]+[^>]*>/g) ?? []).map((el) => {
    const tag = el.match(/^<([a-z]+)/)![1];
    const attrs = [...el.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(([, k, v]) => `${k.toLowerCase().replace(/-/g, '')}=${v}`).sort();
    return `${tag} ${attrs.join(' ')}`;
  });
}

describe('generated icon data', () => {
  it('was generated from the installed lucide-react version', async () => {
    const pkg = (await import('lucide-react/package.json')).default as { version: string };
    expect(all.version).toBe(pkg.version);
  });

  it('draws every bundled icon exactly as lucide-react does', () => {
    const names = Object.keys(BUNDLED_ICONS);
    expect(names.length).toBeGreaterThan(300);
    const wrong: string[] = [];
    for (const name of names) {
      const theirs = lucideExports[name];
      if (!theirs) {
        wrong.push(`${name} (not exported by lucide-react)`);
        continue;
      }
      const a = drawing(renderToStaticMarkup(<Icon name={name} size={24} strokeWidth={2} />));
      const b = drawing(renderToStaticMarkup(createElement(theirs, { size: 24, strokeWidth: 2 })));
      if (a.length === 0 || a.join('|') !== b.join('|')) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });

  it('holds every lucide icon and alias in the full set, drawn the same way', async () => {
    await preloadAllIcons();
    const canonical = Object.keys(lucide.icons);
    expect(Object.keys(all.icons).sort()).toEqual([...canonical].sort());
    const wrong: string[] = [];
    for (const name of [...canonical, ...Object.keys(all.aliases)]) {
      const theirs = lucideExports[name];
      const a = drawing(renderToStaticMarkup(<Icon name={name} size={24} strokeWidth={2} />));
      const b = theirs ? drawing(renderToStaticMarkup(createElement(theirs, { size: 24, strokeWidth: 2 }))) : [];
      if (a.length === 0 || a.join('|') !== b.join('|')) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });

  it('uses the same root attributes as lucide (grid, stroke caps and joins)', () => {
    const mine = renderToStaticMarkup(<Icon name="House" size={24} strokeWidth={2} />);
    for (const attr of ['viewBox="0 0 24 24"', 'fill="none"', 'stroke="currentColor"', 'stroke-width="2"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'width="24"', 'height="24"']) {
      expect(mine).toContain(attr);
    }
  });
});

describe('Icon lookup', () => {
  it('bundles every icon named in the route registry', () => {
    expect(ROUTES.map((r) => r.icon).filter((name) => !isBundledIcon(name))).toEqual([]);
  });

  it('resolves aliases and the FooIcon / LucideFoo spellings', async () => {
    await preloadAllIcons();
    expect(resolveIcon('Music')).toBe(resolveIcon('EighthNotes'));
    expect(resolveIcon('Home')).toBe(resolveIcon('House'));
    expect(resolveIcon('HouseIcon')).toBe(resolveIcon('House'));
    expect(resolveIcon('LucideHouse')).toBe(resolveIcon('House'));
    expect(resolveIcon('Telescope')).not.toBeNull();
    expect(resolveIcon('TelescopeIcon')).toBe(resolveIcon('Telescope'));
    expect(resolveIcon('NotAnIconAtAll')).toBeNull();
  });

  it('accepts a lucide component in place of a name', () => {
    const markup = renderToStaticMarkup(<Icon name={lucide.Telescope} size="lg" label="Telescope" />);
    expect(markup).toContain('width="24"');
    expect(markup).toContain('aria-label="Telescope"');
    expect(drawing(markup).length).toBeGreaterThan(0);
  });

  it('draws a neutral ring and warns once for an unknown name', async () => {
    await preloadAllIcons();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    const root = createRoot(el);
    act(() => root.render(<Icon name="NotAnIconAtAll" />));
    act(() => root.render(<Icon name="NotAnIconAtAll" size="lg" />));
    expect(el.querySelector('svg')).not.toBeNull();
    expect(drawing(el.innerHTML)).toEqual(drawing(renderToStaticMarkup(<Icon name="CircleDashed" />)));
    expect(warn).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    warn.mockRestore();
  });
});
