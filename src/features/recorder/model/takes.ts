/**
 * The take model: what a recorded take is, how it is named, dated, compared and saved as a file.
 * Pure functions, unit-tested (`takes.test.ts`). The audio itself lives in the take store
 * (`store.ts`); a `Take` is the small description kept beside it.
 */

/** One recorded take, as listed. The audio is stored separately under the same `id`. */
export interface Take {
  id: string;
  /** What the learner calls it ("Week 1 first section", "Take 3"). */
  name: string;
  /** The `#record--<label>` it was recorded under (a teacher's task), or null. */
  label: string | null;
  /** When the recording started, epoch ms. */
  createdAt: number;
  /** Length of the audio, ms. */
  durationMs: number;
  /** The recording's own format (`audio/webm;codecs=opus`, `audio/mp4` ...). */
  mimeType: string;
  /** Size of the stored audio, bytes. */
  bytes: number;
  /** A waveform overview: `PEAK_COUNT` loudest sample values (0..1), oldest first. */
  peaks: number[];
  /** Tempo of the count-in or click the take was recorded with, or null for none. */
  bpm: number | null;
}

/** Longest name kept, in characters. */
export const MAX_NAME_LENGTH = 60;
/** A take stops by itself after this long, ms (ten minutes: about 5 MB, and a lot to decode on a phone). */
export const MAX_TAKE_MS = 10 * 60_000;
/** Shorter takes are kept but not reported as practice time, seconds. */
export const MIN_PRACTICE_SEC = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Single letters that are note names rather than English words (only "a" is both). */
const NOTE_LETTERS = new Set(['b', 'c', 'd', 'e', 'f', 'g']);
/** Words after "a" that make it the note A ("a-minor", "blues-in-a"). */
const AFTER_NOTE_A = new Set(['minor', 'major', 'flat', 'sharp', 'm', 'string', 'shape']);

/** A name the learner typed, tidied: spaces collapsed, trimmed, at most {@link MAX_NAME_LENGTH} characters. */
export function cleanName(text: string): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > MAX_NAME_LENGTH ? flat.slice(0, MAX_NAME_LENGTH).trimEnd() : flat;
}

/** A slug from the address (`week-1-first-section`), or null when it holds nothing usable. */
export function cleanLabel(param: string | undefined | null): string | null {
  if (!param) return null;
  const slug = String(param)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? slug.slice(0, 80) : null;
}

/**
 * The name a take gets from its address label: `week-1-first-section` -> "Week 1 first section",
 * `blues-in-a` -> "Blues in A", `a-minor-pentatonic` -> "A minor pentatonic". Note letters are
 * capitalised; "a" only where it cannot be the article.
 */
export function nameFromLabel(label: string): string {
  const words = String(label).split('-').filter(Boolean);
  const out = words.map((word, i) => {
    if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
    if (NOTE_LETTERS.has(word)) return word.toUpperCase();
    if (word === 'a' && (i === words.length - 1 || AFTER_NOTE_A.has(words[i + 1]))) return 'A';
    return word;
  });
  return cleanName(out.join(' '));
}

/** "Week 1, take 3" -> { stem: "Week 1", n: 3 }; a name without a number is take 1 of itself. */
function splitTakeNumber(name: string): { stem: string; n: number } {
  const plain = /^take (\d+)$/i.exec(name);
  if (plain) return { stem: '', n: Number(plain[1]) };
  const m = /^(.*?),? take (\d+)$/i.exec(name);
  if (m) return { stem: m[1].trim(), n: Number(m[2]) };
  return { stem: name.trim(), n: 1 };
}

/**
 * The name for the next take: "Take 1", "Take 2" ... without a label; with one, the label's name
 * for the first take and "<name>, take 2" after it. Numbers continue from the highest in use.
 */
export function nextTakeName(takes: readonly Pick<Take, 'name'>[], label: string | null): string {
  const stem = label ? nameFromLabel(label) : '';
  let highest = 0;
  for (const take of takes) {
    const parts = splitTakeNumber(take.name);
    if (parts.stem.toLowerCase() === stem.toLowerCase()) highest = Math.max(highest, parts.n);
  }
  if (!stem) return `Take ${highest + 1}`;
  return highest === 0 ? stem : cleanName(`${stem}, take ${highest + 1}`);
}

/** A fresh take id (slug-safe, so it can travel in an address). */
export function newTakeId(now: number = Date.now(), random: () => number = Math.random): string {
  const tail = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `take-${Math.max(0, Math.floor(now)).toString(36)}-${tail}`;
}

/** Newest first; ties by id so the order never flickers. */
export function sortTakes(takes: readonly Take[]): Take[] {
  return [...takes].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One stored take description checked and repaired, or null when it cannot be used. */
export function sanitizeTake(value: unknown): Take | null {
  if (!isRecord(value)) return null;
  const { id, name, label, createdAt, durationMs, mimeType, bytes, peaks, bpm } = value;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) return null;
  if (!finite(createdAt) || createdAt <= 0) return null;
  const cleanPeaks = Array.isArray(peaks) ? peaks.filter(finite).map((p) => Math.max(0, Math.min(1, p))).slice(0, 2000) : [];
  return {
    id,
    name: cleanName(typeof name === 'string' ? name : '') || 'Take',
    label: typeof label === 'string' ? cleanLabel(label) : null,
    createdAt,
    durationMs: finite(durationMs) ? Math.max(0, durationMs) : 0,
    mimeType: typeof mimeType === 'string' && /^audio\/[\w.+-]+/.test(mimeType) ? mimeType : 'audio/webm',
    bytes: finite(bytes) ? Math.max(0, Math.round(bytes)) : 0,
    peaks: cleanPeaks,
    bpm: finite(bpm) && bpm >= 20 && bpm <= 400 ? Math.round(bpm) : null,
  };
}

/** A stored list of takes, every unusable entry dropped and duplicates of an id removed. */
export function sanitizeTakes(value: unknown): Take[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Take[] = [];
  for (const item of value) {
    const take = sanitizeTake(item);
    if (!take || seen.has(take.id)) continue;
    seen.add(take.id);
    out.push(take);
  }
  return sortTakes(out);
}

/** "0:07", "1:30", "12:05" (minutes:seconds; rounded down to the second). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The duration in words for a screen reader ("1 minute 30 seconds"). */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole local calendar days from `a` to `b` (positive when `b` is later). */
export function calendarDaysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

const defaultTime = (t: number): string => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** When a take was made, the way a person says it: "Today, 14:05", "Yesterday, 9:12", "Monday, 18:30", "9 Nov", "9 Nov 2025". */
export function formatTakeDate(at: number, now: number = Date.now(), timeOf: (t: number) => string = defaultTime): string {
  const days = calendarDaysBetween(at, now);
  const d = new Date(at);
  if (days === 0) return `Today, ${timeOf(at)}`;
  if (days === 1) return `Yesterday, ${timeOf(at)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[d.getDay()]}, ${timeOf(at)}`;
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? dayMonth : `${dayMonth} ${d.getFullYear()}`;
}

/** Normalised name for matching takes of the same piece ("Week 1, take 3" -> "week 1"). */
function stemOf(take: Pick<Take, 'name'>): string {
  return splitTakeNumber(take.name).stem.toLowerCase();
}

/**
 * The take to compare `take` with: "compare with last week". Takes of the same task (same label,
 * else the same name without its take number) come first; among the earlier ones, the one closest
 * to a week before; with no earlier one of the same piece, the take just before it, else just after.
 * Null when there is no other take.
 */
export function comparisonFor(takes: readonly Take[], take: Take): Take | null {
  const others = takes.filter((t) => t.id !== take.id);
  if (others.length === 0) return null;
  const samePiece = others.filter((t) => (take.label && t.label ? t.label === take.label : stemOf(t) === stemOf(take) && stemOf(take) !== ''));
  const pool = samePiece.length > 0 ? samePiece : others;
  const earlier = pool.filter((t) => t.createdAt < take.createdAt);
  if (earlier.length > 0) {
    const weekBefore = take.createdAt - 7 * DAY_MS;
    // A take at least three days older is a "last week" take: pick the one nearest to a week back.
    const old = earlier.filter((t) => take.createdAt - t.createdAt >= 3 * DAY_MS);
    if (old.length > 0) return old.reduce((best, t) => (Math.abs(t.createdAt - weekBefore) < Math.abs(best.createdAt - weekBefore) ? t : best));
    return earlier.reduce((best, t) => (t.createdAt > best.createdAt ? t : best));
  }
  return pool.reduce((best, t) => (t.createdAt < best.createdAt ? t : best));
}

/** How far apart two takes are, from the first one's side: "a week earlier", "3 days later", "earlier today". */
export function relativeAge(take: Pick<Take, 'createdAt'>, other: Pick<Take, 'createdAt'>): string {
  const days = calendarDaysBetween(other.createdAt, take.createdAt);
  const n = Math.abs(days);
  const side = days >= 0 ? 'earlier' : 'later';
  if (n === 0) return other.createdAt <= take.createdAt ? 'earlier today' : 'later today';
  if (n === 1) return days > 0 ? 'the day before' : 'the day after';
  if (n === 7) return `a week ${side}`;
  if (n % 7 === 0 && n <= 56) return `${n / 7} weeks ${side}`;
  return `${n} days ${side}`;
}

/** File extension for a recording format. */
export function extensionFor(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'm4a';
  if (type.includes('wav')) return 'wav';
  if (type.includes('mpeg')) return 'mp3';
  return 'webm';
}

/** A file name for a take: `week-1-first-section-2026-11-16.webm`. */
export function takeFileName(take: Pick<Take, 'name' | 'createdAt'>, extension: string): string {
  const d = new Date(take.createdAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = cleanLabel(take.name.normalize('NFKD').replace(/[̀-ͯ]/g, '')) ?? 'take';
  return `${base.slice(0, 48)}-${date}.${extension.replace(/^\./, '')}`;
}

/**
 * Formats to ask MediaRecorder for, best first: Opus in WebM (Chrome, Edge, Firefox), Opus in Ogg
 * (older Firefox), AAC in MP4 (Safari). Each is one the same browser can decode for playback.
 */
export const PREFERRED_TYPES: readonly string[] = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg'];

/** The first format the browser can record, or null when it can record none of them. */
export function pickMimeType(isTypeSupported: ((type: string) => boolean) | null | undefined): string | null {
  if (typeof isTypeSupported !== 'function') return null;
  for (const type of PREFERRED_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser that throws for a type does not support it.
    }
  }
  return null;
}

/**
 * Gains that make two takes equally loud for an honest A/B (the louder one is turned down, nothing
 * is turned up, so neither can clip). `rms` values of 0 or less are left alone.
 */
export function matchGains(rmsA: number, rmsB: number): [number, number] {
  if (!(rmsA > 0) || !(rmsB > 0)) return [1, 1];
  const target = Math.min(rmsA, rmsB);
  return [Math.max(0.05, target / rmsA), Math.max(0.05, target / rmsB)];
}

/** Bytes used by every take together. */
export function totalBytes(takes: readonly Pick<Take, 'bytes'>[]): number {
  return takes.reduce((sum, t) => sum + (Number.isFinite(t.bytes) ? t.bytes : 0), 0);
}
