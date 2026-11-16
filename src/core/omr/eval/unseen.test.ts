/**
 * The unseen corpus (fixtures-unseen/, scripts/omr-unseen.cjs): its files match its manifest, its
 * truth sits on ink, and two pages that once failed badly (touching chord numbers in an unseen
 * condensed face; alphaTab's stems hanging from the bottom tab line) stay read. The full tables
 * come from `node src/core/omr/eval/cli.cjs --corpus unseen`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAnalyzedPage } from '../pipeline';
import { analyzePage } from '../page';
import { fixturesDir, loadFixture, loadManifest } from './fixtures';
import { precision, rate, recall, scorePage } from './metrics';

describe('unseen corpus', () => {
  it('has a manifest that matches its files, with the three engravings', () => {
    const list = loadManifest('unseen');
    expect(list.length).toBeGreaterThanOrEqual(25);
    for (const m of list) {
      expect(existsSync(join(fixturesDir('unseen'), m.image)), m.image).toBe(true);
      expect(existsSync(join(fixturesDir('unseen'), m.truth)), m.truth).toBe(true);
      expect(m.corpus).toBe('unseen');
    }
    expect(new Set(list.map((m) => m.subset))).toEqual(new Set(['notation', 'tab', 'linked']));
    expect(list.some((m) => m.tags.includes('engraver-alphatab'))).toBe(true);
    const fx = loadFixture('ul-walk-gonville-ipag', 'unseen');
    expect(fx.truth.systems[0].staves.map((s) => s.kind)).toEqual(['notation', 'tab']);
  });

  it('reads touching chord numbers in an unseen face, and alphaTab tab with stems on the line', async () => {
    for (const id of ['ut-condensed-knock-t10', 'ua-tab-rhythm-c']) {
      const fx = loadFixture(id, 'unseen');
      const page = await readAnalyzedPage(analyzePage(fx.gray), { yieldBetweenStaves: false });
      const s = scorePage(page, fx.truth);
      expect(recall(s.tabNotes), `${id} recall`).toBeGreaterThanOrEqual(0.95);
      expect(precision(s.tabNotes), `${id} precision`).toBeGreaterThanOrEqual(id.startsWith('ua') ? 0.85 : 0.97);
      expect(rate(s.string), `${id} strings`).toBe(1);
      // (Digits of an unseen condensed face are still confused now and then: 51 of 57 right.)
      expect(rate(s.fret), `${id} frets`).toBeGreaterThanOrEqual(0.85);
    }
  }, 60_000);
});
