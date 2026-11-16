import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contrast rules of the token sheet that every screen relies on, checked in every theme: light
 * (bare :root), dark by the device setting (inside the prefers-color-scheme media query) and dark
 * by the learner's choice (:root[data-theme='dark']).
 */
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function block(pattern: RegExp): Record<string, string> {
  const found = pattern.exec(css);
  if (!found) throw new Error(`tokens.css: no block matching ${pattern}`);
  return Object.fromEntries([...found[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(/^:root\s*\{([\s\S]*?)^\}/m);
const themes = {
  light,
  'dark (device setting)': { ...light, ...block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([\s\S]*?)\}/) },
  'dark (chosen in the app)': { ...light, ...block(/^:root\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m) },
};

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('tokens.css contrast', () => {
  it('reads all three themes', () => {
    for (const tokens of Object.values(themes)) expect(tokens['--line-strong']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(themes['dark (device setting)']['--line-strong']).toBe(themes['dark (chosen in the app)']['--line-strong']);
  });

  it.each(Object.entries(themes))('%s: --line-strong (dividers, labelled button edges) is 3:1 on every page surface', (_name, tokens) => {
    for (const surface of ['--bg', '--surface', '--surface-2']) {
      expect(contrast(tokens['--line-strong'], tokens[surface]), `${surface} ${tokens[surface]}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(themes))('%s: small text tokens stay 4.5:1 on the page surfaces', (_name, tokens) => {
    for (const text of ['--fg', '--fg-muted']) {
      for (const surface of ['--bg', '--surface', '--surface-2']) expect(contrast(tokens[text], tokens[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
