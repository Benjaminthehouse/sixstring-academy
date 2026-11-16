/**
 * Damaged and hostile files through the library's import (review). Every refusal is a
 * `LibraryError` with words a learner can act on; technical parser text goes to `detail`.
 */
import { describe, expect, it } from 'vitest';
import { createLibrary, importProblem } from './library';
import { memoryStore } from './store';
import { isLibraryError, type LibraryError } from './types';

function lib() {
  let seed = 7;
  return createLibrary({ store: memoryStore(), now: () => 1_700_000_000_000, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), broadcast: false });
}

async function refusal(p: Promise<unknown>): Promise<LibraryError> {
  try {
    await p;
  } catch (e) {
    if (isLibraryError(e)) return e;
    throw e;
  }
  throw new Error('expected the import to be refused');
}

const file = (bytes: Uint8Array<ArrayBuffer> | string, name: string) => new File([bytes], name);
const XML_HEAD = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>G</part-name></score-part></part-list>';

describe('importing damaged files', () => {
  it('says a cut-short MusicXML file is damaged, not "Unclosed start tag."', async () => {
    const e = await refusal(lib().importFile(file(`${XML_HEAD}<part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><dur`, 'cut.musicxml')));
    expect(e.code).toBe('unreadable');
    expect(e.message).toMatch(/cut short or damaged/);
    expect(e.message).not.toMatch(/tag|XML/);
    expect(e.detail).toMatch(/Unclosed start tag/);
  });

  it('says a MusicXML file with a mismatched end tag is damaged', async () => {
    const e = await refusal(lib().importFile(file(`${XML_HEAD}<part id="P1"><measure number="1"></part></measure></score-partwise>`, 'bad.musicxml')));
    expect(e.message).toMatch(/cut short or damaged/);
    expect(e.detail).toMatch(/Mismatched/);
  });

  it('keeps the importers’ own plain sentences', async () => {
    const e = await refusal(lib().importFile(file('<?xml version="1.0"?><score-partwise></score-partwise>', 'empty.musicxml')));
    expect(e.message).toBe('The MusicXML score has no measures.');
    const six = await refusal(lib().importText('title: T\ntempo: 90\ntime: 4/4\n\ntrack: A\n| w 1:99 ||\n'));
    expect(six.message).toMatch(/line 6: Fret 99 is beyond the neck/);
  });

  it('refuses random bytes, a disguised photo and junk text with plain words', async () => {
    const noise = new Uint8Array(new ArrayBuffer(5000)).map((_, i) => (i * 7919) % 256);
    const mid = await refusal(lib().importFile(file(noise, 'song.mid')));
    expect(['unreadable', 'unsupported', 'empty']).toContain(mid.code);
    const png = await refusal(lib().importFile(file(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'song.gp')));
    expect(png.code).toBe('needs-scan');
    const junk = await refusal(lib().importText('lorem ipsum '.repeat(90_000)));
    expect(junk.code).toBe('unsupported');
    for (const e of [mid, png, junk]) expect(e.message).not.toMatch(/undefined|Error:|\bat\b .*\(/);
  });

  it('keeps a very long song and refuses one past the size limit', async () => {
    const bar = 'e|-0-1-3-1-|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|\n\n';
    const long = await lib().importText(bar.repeat(2000), { title: 'Two thousand bars' });
    expect(long.listing.summary?.bars).toBe(2000);
    const huge = await refusal(lib().importText(`title: Big\ntempo: 120\ntime: 4/4\n\ntrack: A\n${'| s 1:0 1:1 1:3 1:5 1:0 1:1 1:3 1:5 1:0 1:1 1:3 1:5 1:0 1:1 1:3 1:5 '.repeat(5000)}||\n`));
    expect(huge.code).toBe('too-large');
  }, 60_000);
});

describe('importProblem', () => {
  it('moves alphaTab’s reason out of the Guitar Pro message', () => {
    expect(importProblem('This file could not be read as a Guitar Pro file (Unsupported format: 0x1F).')).toEqual({
      code: 'unsupported',
      message: 'This file could not be read as a Guitar Pro file.',
      detail: 'Unsupported format: 0x1F',
    });
    expect(importProblem('The MIDI file has no notes to import.')).toEqual({ code: 'unsupported', message: 'The MIDI file has no notes to import.' });
  });
});
