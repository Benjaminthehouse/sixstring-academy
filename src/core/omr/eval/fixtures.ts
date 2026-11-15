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

/** Absolute path of the fixtures directory. */
export function fixturesDir(): string {
  return fileURLToPath(new URL('../fixtures/', import.meta.url));
}

let manifestCache: FixtureMeta[] | null = null;

/** Every fixture listed in the manifest. */
export function loadManifest(): FixtureMeta[] {
  if (!manifestCache) {
    const doc = JSON.parse(readFileSync(join(fixturesDir(), 'manifest.json'), 'utf8')) as { fixtures: FixtureMeta[] };
    manifestCache = doc.fixtures;
  }
  return manifestCache;
}

/** Load one fixture by id (or by manifest entry). */
export function loadFixture(idOrMeta: string | FixtureMeta): Fixture {
  const meta = typeof idOrMeta === 'string' ? loadManifest().find((m) => m.id === idOrMeta) : idOrMeta;
  if (!meta) throw new Error(`unknown OMR fixture "${String(idOrMeta)}"`);
  const dir = fixturesDir();
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
  return selectFixtures({ every: 4 });
}
