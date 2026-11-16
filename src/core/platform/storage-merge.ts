/**
 * Merging two copies of the learner's data (`DataSet`, see `storage-scope.ts`). Pure.
 *
 * ONE KEY, TWO COPIES (`mergeEntry`). Only the records (`DATA_ITEMS`: what the learner made or earned)
 * are joined:
 *   - lists of things with an `id` (journal entries, routines, goals, saved progressions, custom
 *     tunings, presets) are joined: everything from both sides, and where both have the same id the
 *     copy changed last (its own `updatedAt` / `at` / `endedAt` ..., else the newer side's);
 *   - lists of other objects (strumming patterns) are joined by content;
 *   - an object holding such lists (`practice.data`) is joined list by list, its other fields from
 *     the newer side;
 *   - the arcade's records keep the best of both (stars, scores, plays); a rhythm calibration keeps
 *     each measurement from the side that measured last;
 *   - a damaged copy (`isDamagedRecord`: a journal that is not a list ...) never wins over a good
 *     one, and an item in a list that is not an object is dropped, not allowed to spoil the list.
 * Everything else is taken whole from the side that changed it last: every setting (whatever it
 * holds, so a screen's remembered view or plan is never stitched together from two), and a draft
 * (`whole`: the progression in the builder).
 *
 * IMPORT (`planDataImport`): `merge` merges every key both sides have and takes the rest from
 * whichever side has it; `replace` makes the learner data equal to the file's, except the keys
 * named in `keep` (the file's entry was damaged), which stay as they are here.
 *
 * SYNC (`planDataSync`): three-way, against what both sides had when they last agreed (`base`,
 * a checksum per key). A key only one side changed is taken from that side, so a deletion or an
 * undone change travels too; a key both changed is merged as above (newest change wins for
 * settings, both kept for lists); a key one side deleted and the other changed is kept.
 */
import { entrySum, entryText, isDamagedRecord, isRecordKey, isWholeRecord, type DataEntry, type DataSet } from './storage-scope';

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** JSON with sorted keys, so two equal values always give the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  if (isRec(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) if (value[key] !== undefined) parts.push(`${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

/**
 * A list of objects (an empty list counts). Items that are not objects are tolerated here and
 * dropped by `joinLists`: one damaged item must not make the whole list lose to the other side.
 */
function isObjectList(value: unknown): value is unknown[] {
  return Array.isArray(value) && (value.length === 0 || value.some(isRec));
}

function identity(item: Rec): string {
  const id = item.id;
  if (typeof id === 'string' || typeof id === 'number') return `id:${id}`;
  return `c:${canonicalJson(item)}`;
}

const STAMP_FIELDS = ['updatedAt', 'savedAt', 'at', 'endedAt', 'doneAt', 'createdAt'] as const;

/** When an item says it last changed (the latest of its time fields), or null. */
function itemStamp(item: Rec): number | null {
  let best: number | null = null;
  for (const field of STAMP_FIELDS) {
    const t = num(item[field]);
    if (t !== null && (best === null || t > best)) best = t;
  }
  return best;
}

/** Join two lists of objects (items that are not objects are dropped); `bNewer` says which side changed last. */
function joinLists(a: unknown[], b: unknown[], bNewer: boolean): Rec[] {
  const [first, second] = bNewer ? [b.filter(isRec), a.filter(isRec)] : [a.filter(isRec), b.filter(isRec)];
  const out = new Map<string, Rec>();
  for (const item of first) if (!out.has(identity(item))) out.set(identity(item), item);
  for (const item of second) {
    const id = identity(item);
    const there = out.get(id);
    if (!there) {
      out.set(id, item);
      continue;
    }
    const ts = itemStamp(there);
    const os = itemStamp(item);
    if (ts !== null && os !== null && os > ts) out.set(id, item);
  }
  return [...out.values()];
}

function holdsLists(value: Rec): boolean {
  return Object.values(value).some((field) => isObjectList(field) && field.length > 0);
}

/** The generic merge of two parsed values. */
export function mergeJson(a: unknown, b: unknown, bNewer: boolean): unknown {
  if (isObjectList(a) && isObjectList(b)) return joinLists(a, b, bNewer);
  if (isRec(a) && isRec(b) && (holdsLists(a) || holdsLists(b))) {
    const out: Rec = {};
    const fields = new Set([...Object.keys(bNewer ? b : a), ...Object.keys(bNewer ? a : b)]);
    for (const field of fields) {
      const inA = field in a;
      const inB = field in b;
      if (!inA || !inB) {
        out[field] = inA ? a[field] : b[field];
        continue;
      }
      const listA = isObjectList(a[field]);
      const listB = isObjectList(b[field]);
      if (listA && listB) out[field] = joinLists(a[field] as unknown[], b[field] as unknown[], bNewer);
      // A list on one side and something that is not a list at all on the other: the list is the
      // good copy, whichever side changed last.
      else if (listA && !Array.isArray(b[field])) out[field] = a[field];
      else if (listB && !Array.isArray(a[field])) out[field] = b[field];
      else out[field] = bNewer ? b[field] : a[field];
    }
    return out;
  }
  return bNewer ? b : a;
}

const max = (x: unknown, y: unknown): number => Math.max(num(x) ?? 0, num(y) ?? 0);

/** The arcade keeps the best of both: per level the most stars, best score and plays; per game the higher score. */
function mergeArcade(a: unknown, b: unknown, bNewer: boolean): unknown {
  if (!isRec(a) || !isRec(b)) return bNewer ? b : a;
  const newer = bNewer ? b : a;
  const out: Rec = { ...(bNewer ? a : b), ...newer };
  const levels: Rec = {};
  const la = isRec(a.levels) ? a.levels : {};
  const lb = isRec(b.levels) ? b.levels : {};
  for (const game of new Set([...Object.keys(la), ...Object.keys(lb)])) {
    const ga = isRec(la[game]) ? (la[game] as Rec) : {};
    const gb = isRec(lb[game]) ? (lb[game] as Rec) : {};
    const scopes: Rec = {};
    for (const scope of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
      const sa = isRec(ga[scope]) ? (ga[scope] as Rec) : {};
      const sb = isRec(gb[scope]) ? (gb[scope] as Rec) : {};
      const byLevel: Rec = {};
      for (const n of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
        const ra = sa[n];
        const rb = sb[n];
        if (isRec(ra) && isRec(rb)) byLevel[n] = { ...ra, ...rb, stars: max(ra.stars, rb.stars), best: max(ra.best, rb.best), plays: max(ra.plays, rb.plays), at: max(ra.at, rb.at) };
        else byLevel[n] = isRec(ra) ? ra : rb;
      }
      scopes[scope] = byLevel;
    }
    levels[game] = scopes;
  }
  out.levels = levels;
  const bests: Rec = {};
  const ba = isRec(a.bests) ? a.bests : {};
  const bb = isRec(b.bests) ? b.bests : {};
  for (const game of new Set([...Object.keys(ba), ...Object.keys(bb)])) {
    const xa = ba[game];
    const xb = bb[game];
    if (isRec(xa) && isRec(xb)) bests[game] = (num(xb.score) ?? 0) > (num(xa.score) ?? 0) || ((num(xb.score) ?? 0) === (num(xa.score) ?? 0) && max(xb.at, 0) > max(xa.at, 0)) ? xb : xa;
    else bests[game] = isRec(xa) ? xa : xb;
  }
  out.bests = bests;
  const da = isRec(a.daily) ? a.daily : null;
  const db = isRec(b.daily) ? b.daily : null;
  if (da && db) {
    const dateA = String(da.date ?? '');
    const dateB = String(db.date ?? '');
    out.daily = dateA !== dateB ? (dateB > dateA ? db : da) : { ...da, score: max(da.score, db.score), stars: max(da.stars, db.stars), done: da.done === true || db.done === true };
  } else out.daily = da ?? db ?? null;
  out.dailyBest = max(a.dailyBest, b.dailyBest);
  return out;
}

/** Each measurement of a rhythm calibration comes from the side that measured it last. */
function mergeCalibration(a: unknown, b: unknown, bNewer: boolean): unknown {
  if (!isRec(a) || !isRec(b)) return bNewer ? b : a;
  const out: Rec = { ...(bNewer ? a : b), ...(bNewer ? b : a) };
  const tapFromB = (num(b.tapAt) ?? -1) > (num(a.tapAt) ?? -1) || (num(a.tapMs) === null && num(b.tapMs) !== null);
  const micFromB = (num(b.micAt) ?? -1) > (num(a.micAt) ?? -1) || (num(a.micMs) === null && num(b.micMs) !== null);
  const tap = tapFromB ? b : a;
  const mic = micFromB ? b : a;
  out.tapMs = tap.tapMs ?? null;
  out.tapAt = tap.tapAt ?? null;
  out.micMs = mic.micMs ?? null;
  out.micAt = mic.micAt ?? null;
  out.bleed = mic.bleed ?? null;
  out.offered = a.offered === true || b.offered === true;
  out.micOffered = a.micOffered === true || b.micOffered === true;
  return out;
}

/** Keys merged by their own rule instead of the generic one. */
const MERGERS: Readonly<Record<string, (a: unknown, b: unknown, bNewer: boolean) => unknown>> = {
  arcade: mergeArcade,
  'rhythm.calibration': mergeCalibration,
};

/** Keys whose records only ever grow (best scores): sync merges them even when one side alone changed. */
const ONLY_GROW = new Set(['arcade']);

// ---------------------------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------------------------

/** How a tie in change times is settled: keep this device's copy, or (sync) the same choice on every device. */
export type TieBreak = 'local' | 'stable';

/**
 * Merge two copies of one key. Records are joined (see the header); a setting or a draft is taken
 * whole from the copy changed last. Never throws: a merge that fails takes the newer copy whole.
 */
export function mergeEntry(key: string, local: DataEntry, incoming: DataEntry, tie: TieBreak = 'local'): DataEntry {
  const localText = entryText(local);
  const incomingText = entryText(incoming);
  const at = Math.max(local.at, incoming.at);
  if (localText === incomingText) return { ...local, at };
  const incomingNewer = incoming.at > local.at || (incoming.at === local.at && tie === 'stable' && entrySum(incoming) > entrySum(local));
  const newer = (): DataEntry => ({ ...(incomingNewer ? incoming : local), at });
  if (!isRecordKey(key) || isWholeRecord(key)) return newer();
  // A damaged copy of a record never takes the place of a good one, however recent it claims to be.
  const localDamaged = isDamagedRecord(key, local);
  const incomingDamaged = isDamagedRecord(key, incoming);
  if (localDamaged !== incomingDamaged) return { ...(localDamaged ? incoming : local), at };
  if (typeof local.raw === 'string' || typeof incoming.raw === 'string') return newer();
  try {
    const merge = MERGERS[key] ?? mergeJson;
    return { at, value: merge(local.value, incoming.value, incomingNewer) };
  } catch {
    return newer();
  }
}

/** What applying another copy of the learner's data would do. */
export interface DataPlan {
  /** The learner data afterwards. */
  result: DataSet;
  /** Keys whose stored text changes (new or different). */
  write: string[];
  /** Keys that go. */
  remove: string[];
}

function finish(local: DataSet, result: DataSet): DataPlan {
  const write: string[] = [];
  const remove: string[] = [];
  for (const [key, entry] of Object.entries(result)) if (!local[key] || entryText(local[key]) !== entryText(entry)) write.push(key);
  for (const key of Object.keys(local)) if (!result[key]) remove.push(key);
  return { result, write: write.sort(), remove: remove.sort() };
}

/**
 * Import a file's learner data. `merge`: every key either side has, merged where both have it.
 * `replace`: exactly the file's, except the keys in `keep` (the file's copy was damaged and left
 * out), which stay as they are here rather than being removed. Only keys `scope` accepts are looked
 * at or touched.
 */
export function planDataImport(local: DataSet, incoming: DataSet, strategy: 'merge' | 'replace', scope: (key: string) => boolean = () => true, keep: readonly string[] = []): DataPlan {
  const mine: DataSet = {};
  for (const [key, entry] of Object.entries(local)) if (scope(key)) mine[key] = entry;
  const result: DataSet = {};
  if (strategy === 'replace') {
    for (const [key, entry] of Object.entries(incoming)) if (scope(key)) result[key] = entry;
    for (const key of keep) if (mine[key] && !result[key]) result[key] = mine[key];
    return finish(mine, result);
  }
  for (const key of new Set([...Object.keys(mine), ...Object.keys(incoming)])) {
    if (!scope(key)) continue;
    const a = mine[key];
    const b = incoming[key];
    result[key] = a && b ? mergeEntry(key, a, b, 'local') : (a ?? b);
  }
  return finish(mine, result);
}

/**
 * Bring the cloud copy of the learner's data into this device's, three-way against `base` (the
 * checksum per key when the two last agreed; null when they never did). `replace` takes the cloud
 * copy, except keys the cloud never had (they were never synced, so nothing says they should go).
 */
export function planDataSync(local: DataSet, remote: DataSet, base: Readonly<Record<string, string>> | null, strategy: 'merge' | 'replace'): DataPlan {
  const known = base ?? {};
  const result: DataSet = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(known)]);
  for (const key of keys) {
    const l = local[key];
    const r = remote[key];
    if (strategy === 'replace') {
      if (r) result[key] = r;
      else if (l && !(key in known)) result[key] = l;
      continue;
    }
    const ls = l ? entrySum(l) : null;
    const rs = r ? entrySum(r) : null;
    const bs = known[key] ?? null;
    if (ls === rs) {
      if (l) result[key] = l;
      continue;
    }
    const localChanged = ls !== bs;
    const remoteChanged = rs !== bs;
    if (l && r && (ONLY_GROW.has(key) || (localChanged && remoteChanged))) result[key] = mergeEntry(key, l, r, 'stable');
    else if (!remoteChanged) {
      if (l) result[key] = l;
    } else if (!localChanged) {
      if (r) result[key] = r;
    } else {
      // One side deleted it, the other changed it: keep the change.
      const kept = l ?? r;
      if (kept) result[key] = kept;
    }
  }
  return finish(local, result);
}
