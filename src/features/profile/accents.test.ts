import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COSMETICS, DEFAULT_COSMETICS } from '@/core/progress';
import { contrastRatio, findRule, parseCssRules, parseHex, relativeLuminance, type CssRule } from './contrast';

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const tokens = parseCssRules(read('../../ui/tokens.css'));
const accents = parseCssRules(read('../../ui/accents.css'));

const ACCENT_TOKENS = ['--accent', '--accent-strong', '--accent-fg', '--accent-text', '--accent-soft'] as const;
const DARK_MEDIA = '(prefers-color-scheme: dark)';
/** What the amber is held to, and so what every accent must meet. */
const AA = 4.5;

type Theme = 'light' | 'dark';

/** The neutral surfaces of a theme, straight from tokens.css. */
function neutrals(theme: Theme): Record<'--bg' | '--surface' | '--surface-2', string> {
  const rule = theme === 'light' ? findRule(tokens, ':root') : findRule(tokens, ":root[data-theme='dark']");
  if (!rule) throw new Error(`tokens.css has no ${theme} block`);
  return { '--bg': rule.declarations['--bg'], '--surface': rule.declarations['--surface'], '--surface-2': rule.declarations['--surface-2'] };
}

/** The three rules of one accent: light, dark by device setting, dark by the learner's choice. */
function accentRules(name: string): { light: CssRule | null; darkMedia: CssRule | null; darkAttr: CssRule | null } {
  return {
    light: findRule(accents, `:root[data-accent='${name}']`),
    darkMedia: findRule(accents, `:root:not([data-theme='light'])[data-accent='${name}']`, DARK_MEDIA),
    darkAttr: findRule(accents, `:root[data-theme='dark'][data-accent='${name}']`),
  };
}

const accentIds = COSMETICS.filter((c) => c.category === 'accent').map((c) => c.id);
const names = accentIds.map((id) => id.replace(/^accent-/, ''));

describe('contrast maths', () => {
  it('reads hex colours', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex(' #F2A20C ')).toEqual({ r: 242, g: 162, b: 12 });
    expect(parseHex('rgba(0, 0, 0, 0.5)')).toBeNull();
    expect(parseHex('var(--accent)')).toBeNull();
  });

  it('matches the reference values of WCAG', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    // #767676 on white is the well-known "just passes AA" grey.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });
});

describe('the CSS reader', () => {
  it('reads rules, selector lists and one level of @media, and skips comments and @import', () => {
    const rules = parseCssRules(`@import './a.css';
      /* a { --x: 1 } */
      :root, .b { --one: #fff; --two:  1px  solid }
      @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --one: #000; } }
      .c { color: red }`);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({ media: null, selectors: [':root', '.b'], declarations: { '--one': '#fff', '--two': '1px solid' } });
    expect(rules[1].media).toBe('(prefers-color-scheme: dark)');
    expect(findRule(rules, ":root:not([data-theme='light'])", '(prefers-color-scheme: dark)')?.declarations['--one']).toBe('#000');
    expect(findRule(rules, '.c')?.declarations.color).toBe('red');
    expect(findRule(rules, '.missing')).toBeNull();
  });

  it('finds the three places tokens.css defines the amber', () => {
    expect(findRule(tokens, ':root')?.declarations['--accent']).toBe('#f2a20c');
    expect(findRule(tokens, ":root:not([data-theme='light'])", DARK_MEDIA)?.declarations['--accent']).toBe('#f5ae2e');
    expect(findRule(tokens, ":root[data-theme='dark']")?.declarations['--accent']).toBe('#f5ae2e');
  });
});

describe('accent themes (src/ui/accents.css)', () => {
  it('the catalog still has the accents this file was written for', () => {
    expect(names).toEqual(['sunburst', 'cherry', 'ocean', 'forest', 'violet', 'silverburst']);
    expect(DEFAULT_COSMETICS.accent).toBe('accent-sunburst');
  });

  it('defines only the five accent tokens, and only for accents in the catalog', () => {
    for (const rule of accents) {
      expect(Object.keys(rule.declarations).sort(), rule.selectors.join(', ')).toEqual([...ACCENT_TOKENS].sort());
      for (const value of Object.values(rule.declarations)) expect(parseHex(value), `${rule.selectors[0]}: ${value}`).not.toBeNull();
      const named = rule.selectors.map((s) => /data-accent(?:-scope)?='([a-z-]+)'/.exec(s)?.[1]);
      expect(new Set(named).size, rule.selectors.join(', ')).toBe(1);
      expect(names).toContain(named[0]);
    }
    // Three rules per accent and nothing else.
    expect(accents).toHaveLength(names.length * 3);
  });

  for (const name of names) {
    describe(name, () => {
      const rules = accentRules(name);

      it('has a light block and both dark blocks, as tokens.css does', () => {
        expect(rules.light, 'light').not.toBeNull();
        expect(rules.darkMedia, 'dark inside prefers-color-scheme').not.toBeNull();
        expect(rules.darkAttr, "dark under data-theme='dark'").not.toBeNull();
        // The two dark blocks say the same thing.
        expect(rules.darkMedia?.declarations).toEqual(rules.darkAttr?.declarations);
        // Light and dark differ: a dark theme needs its own values.
        expect(rules.darkAttr?.declarations).not.toEqual(rules.light?.declarations);
      });

      it('can also be previewed inside one element (data-accent-scope)', () => {
        expect(rules.light?.selectors).toContain(`[data-accent-scope='${name}']`);
        expect(rules.darkMedia?.selectors).toContain(`:root:not([data-theme='light']) [data-accent-scope='${name}']`);
        expect(rules.darkAttr?.selectors).toContain(`:root[data-theme='dark'] [data-accent-scope='${name}']`);
      });

      for (const theme of ['light', 'dark'] as const) {
        for (const variant of theme === 'light' ? (['light'] as const) : (['darkMedia', 'darkAttr'] as const)) {
          it(`${variant}: every pairing is at least ${AA}:1`, () => {
            const d = rules[variant]?.declarations ?? {};
            const n = neutrals(theme);
            const pairs: Array<[string, string, string]> = [
              ['--accent-fg on --accent', d['--accent-fg'], d['--accent']],
              ['--accent-fg on --accent-strong', d['--accent-fg'], d['--accent-strong']],
              ['--accent-text on --bg', d['--accent-text'], n['--bg']],
              ['--accent-text on --surface', d['--accent-text'], n['--surface']],
              ['--accent-text on --surface-2', d['--accent-text'], n['--surface-2']],
              ['--accent-text on --accent-soft', d['--accent-text'], d['--accent-soft']],
            ];
            for (const [label, fg, bg] of pairs) {
              expect(contrastRatio(fg, bg), `${name} ${variant}: ${label} (${fg} on ${bg})`).toBeGreaterThanOrEqual(AA);
            }
          });
        }
      }

      it('keeps the soft tint close to the surface it sits on', () => {
        // A tint, not a second fill: light tints stay light, dark tints stay dark.
        const light = parseHex(rules.light?.declarations['--accent-soft'] ?? '');
        const dark = parseHex(rules.darkAttr?.declarations['--accent-soft'] ?? '');
        expect(light && relativeLuminance(light)).toBeGreaterThan(0.7);
        expect(dark && relativeLuminance(dark)).toBeLessThan(0.06);
      });
    });
  }

  it('the sunburst block repeats the amber of tokens.css exactly', () => {
    const pick = (rule: CssRule | null): Record<string, string> => Object.fromEntries(ACCENT_TOKENS.map((t) => [t, rule?.declarations[t] ?? '']));
    const sunburst = accentRules('sunburst');
    expect(sunburst.light?.declarations).toEqual(pick(findRule(tokens, ':root')));
    expect(sunburst.darkMedia?.declarations).toEqual(pick(findRule(tokens, ":root:not([data-theme='light'])", DARK_MEDIA)));
    expect(sunburst.darkAttr?.declarations).toEqual(pick(findRule(tokens, ":root[data-theme='dark']")));
  });

  it('the amber itself meets the bar the accents are held to', () => {
    for (const theme of ['light', 'dark'] as const) {
      const rule = theme === 'light' ? findRule(tokens, ':root') : findRule(tokens, ":root[data-theme='dark']");
      const d = rule?.declarations ?? {};
      const n = neutrals(theme);
      expect(contrastRatio(d['--accent-fg'], d['--accent'])).toBeGreaterThanOrEqual(AA);
      for (const surface of Object.values(n)) expect(contrastRatio(d['--accent-text'], surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('every accent is told apart from the others at a glance', () => {
    // No two accents share a fill in either theme.
    for (const variant of ['light', 'darkAttr'] as const) {
      const fills = names.map((name) => accentRules(name)[variant]?.declarations['--accent']);
      expect(new Set(fills).size).toBe(names.length);
    }
  });
});
