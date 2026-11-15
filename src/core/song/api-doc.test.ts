/** The SixTab in API.md is what content authors copy: every example there must parse cleanly. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSixTab } from './sixtab-parse';
import { validateSong } from './validate';

const doc = readFileSync(new URL('./API.md', import.meta.url), 'utf8');
const blocks = [...doc.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);

describe('API.md examples', () => {
  it('has the two complete example songs', () => {
    expect(blocks.length).toBe(2);
  });

  it.each(blocks.map((b, i) => [i, b]))('example %i parses and validates', (_i, text) => {
    const r = parseSixTab(text as string);
    expect(r.errors).toEqual([]);
    expect(validateSong(r.song!).filter((x) => x.level === 'error')).toEqual([]);
  });

  it('the one-line technique example parses', () => {
    const line = /Techniques in one line: `([^`]+)`/.exec(doc)![1];
    expect(parseSixTab(`title: T\ntempo: 90\n${line}\n`).errors).toEqual([]);
  });
});
