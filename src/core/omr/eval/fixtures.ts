/**
 * Loads the ground-truth corpus under src/core/omr/fixtures/ (Node only; used by tests and the
 * evaluation runner).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GrayImage } from '../image/gray';
import { readPngGray } from './png';
import { type FixtureMeta, type GroundTruth, hydrateTruth } from './truth';

/** A fixture page with its picture and ground truth. */
export interface Fixture {
  meta: FixtureMeta;
  gray: GrayImage;
  truth: GroundTruth;
}

/**
 * The corpora: `base` is the original VexFlow corpus (fixtures/, scripts/omr-fixtures.cjs);
 * `unseen` is the independent adversarial corpus (fixtures-unseen/, scripts/omr-unseen.cjs) with
 * its own engraver, proportions, digit faces and alphaTab pages, never used to tune anything.
 */
export type CorpusName = 'base' | 'unseen';

/** Absolute path of a corpus directory (default: the original fixtures). */
export function fixturesDir(corpus: string = 'base'): string {
  return fileURLToPath(new URL(corpus === 'base' ? '../fixtures/' : `../fixtures-${corpus}/`, import.meta.url));
}

const manifestCache = new Map<string, FixtureMeta[]>();

/** Every fixture listed in a corpus manifest (default: the original corpus). */
export function loadManifest(corpus: string = 'base'): FixtureMeta[] {
  let list = manifestCache.get(corpus);
  if (!list) {
    const doc = JSON.parse(readFileSync(join(fixturesDir(corpus), 'manifest.json'), 'utf8')) as { fixtures: FixtureMeta[] };
    list = doc.fixtures.map((m) => (corpus === 'base' ? m : { ...m, corpus }));
    manifestCache.set(corpus, list);
  }
  return list;
}

/** Load one fixture by id (or by manifest entry); ids of other corpora are looked up there too. */
export function loadFixture(idOrMeta: string | FixtureMeta, corpus?: string): Fixture {
  const meta = typeof idOrMeta === 'string' ? loadManifest(corpus ?? 'base').find((m) => m.id === idOrMeta) : idOrMeta;
  if (!meta) throw new Error(`unknown OMR fixture "${String(idOrMeta)}"`);
  const dir = fixturesDir(meta.corpus ?? 'base');
  const truth = hydrateTruth(JSON.parse(readFileSync(join(dir, meta.truth), 'utf8')));
  return { meta, gray: readPngGray(join(dir, meta.image)), truth };
}

/** Filter for {@link selectFixtures}. */
export interface FixtureFilter {
  subset?: 'notation' | 'tab' | 'linked';
  /** Substring of the id. */
  match?: string;
  /** Keep only fixtures that carry / lack a tag ('page', 'tab-stems', ...). */
  tag?: string;
  withoutTag?: string;
  /** Deterministic subsample: keep every n-th fixture of each subset (1 = all). */
  every?: number;
}

/** Manifest entries matching a filter, in manifest order. */
export function selectFixtures(filter: FixtureFilter = {}): FixtureMeta[] {
  let list = loadManifest();
  if (filter.subset) list = list.filter((m) => m.subset === filter.subset);
  if (filter.match) list = list.filter((m) => m.id.includes(filter.match as string));
  if (filter.tag) list = list.filter((m) => m.tags.includes(filter.tag as string));
  if (filter.withoutTag) list = list.filter((m) => !m.tags.includes(filter.withoutTag as string));
  const every = filter.every ?? 1;
  if (every > 1) {
    const seen: Record<string, number> = {};
    list = list.filter((m) => {
      const k = seen[m.subset] ?? 0;
      seen[m.subset] = k + 1;
      return k % every === 0;
    });
  }
  return list;
}

/**
 * The default test subsample: a spread over subsets, fonts and resolutions that keeps the suite
 * fast. Set OMR_FULL=1 to run everything.
 */
export function defaultSample(): FixtureMeta[] {
  if (process.env.OMR_FULL === '1') return loadManifest();
  return selectFixtures({ every: 5 });
}
