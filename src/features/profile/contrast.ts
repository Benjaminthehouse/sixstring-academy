/**
 * WCAG contrast maths and a small reader for the custom properties in the app's token files.
 * Pure: used by the test that proves every accent theme is as readable as the house amber.
 */

/** An sRGB colour, 0 to 255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rgb` or `#rrggbb`. Null for anything else (named colours, functions, `var()`). */
export function parseHex(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return { r: parseInt(short[1] + short[1], 16), g: parseInt(short[2] + short[2], 16), b: parseInt(short[3] + short[3], 16) };
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(text);
  if (long) return { r: parseInt(long[1], 16), g: parseInt(long[2], 16), b: parseInt(long[3], 16) };
  return null;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(colour: Rgb): number {
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** WCAG contrast ratio of two hex colours, 1 to 21. Throws on a value that is not a hex colour. */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) throw new Error(`not a hex colour: ${!first ? a : b}`);
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** One style rule: where it applies and the custom properties it sets. */
export interface CssRule {
  /** The enclosing `@media` condition, or null at the top level. */
  media: string | null;
  /** The selector list, split at commas, whitespace collapsed. */
  selectors: string[];
  /** Declarations by property name. */
  declarations: Record<string, string>;
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Read the style rules of a plain CSS file (rules and one level of `@media`; that is all the token
 * files use). Comments are dropped. Other at-rules (`@import`) are skipped.
 */
export function parseCssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];

  const readBlock = (source: string, media: string | null): void => {
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf('{', i);
      const semi = source.indexOf(';', i);
      // A statement at-rule such as `@import './x.css';` ends before any block opens.
      if (semi !== -1 && (open === -1 || semi < open) && source.slice(i, semi).trim().startsWith('@')) {
        i = semi + 1;
        continue;
      }
      if (open === -1) break;
      const prelude = squash(source.slice(i, open));
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}') depth--;
        j++;
      }
      const body = source.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) readBlock(body, squash(prelude.slice('@media'.length)));
      else if (!prelude.startsWith('@')) {
        const declarations: Record<string, string> = {};
        for (const part of body.split(';')) {
          const colon = part.indexOf(':');
          if (colon === -1) continue;
          const name = part.slice(0, colon).trim();
          if (name) declarations[name] = squash(part.slice(colon + 1));
        }
        rules.push({ media, selectors: prelude.split(',').map(squash), declarations });
      }
      i = j;
    }
  };

  readBlock(text, null);
  return rules;
}

/** The first rule matching a selector exactly, at the top level or inside a given `@media`. */
export function findRule(rules: readonly CssRule[], selector: string, media: string | null = null): CssRule | null {
  const wanted = squash(selector);
  return rules.find((rule) => rule.media === media && rule.selectors.includes(wanted)) ?? null;
}
