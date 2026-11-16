/**
 * An unsaved scan as it is kept on the device, so a reload or a phone that discards the tab loses
 * nothing: the pages (their pictures are kept as blobs beside this description), what the quick
 * look found, the reading with its recent undo steps, the text being checked. Pure: building the
 * description, checking one read back, and the words of the "pick up where you left off" offer.
 * The blob store calls are in `persist.ts`.
 */
import type { OmrDocument } from '@/core/omr/pipeline';
import type { Draft } from '../model/draft';
import type { PageLook, PageOrigin } from '../model/pages';
import type { History } from '../model/select';
import type { AiOutcome, TextReading } from './read';

/** Bumped when the layout changes; an older copy is not offered. */
export const SNAPSHOT_VERSION = 1;
/** Undo steps kept on the device (the screen keeps more while it is open). */
export const KEPT_PAST = 15;
export const KEPT_FUTURE = 5;

/** The text being proofread (as `useScan` holds it). */
export interface KeptText {
  text: string;
  reading: TextReading | null;
  error: string | null;
  source: 'pdf' | 'ocr' | 'paste' | 'ai';
}

/** A page as kept: its picture and thumbnail are blobs under `pic` / `thumb`. */
export interface KeptPage {
  id: string;
  label: string;
  origin: PageOrigin;
  kindOf: 'photo' | 'render';
  width: number;
  height: number;
  pic: string;
  thumb: string | null;
  pdfText?: string;
  look: PageLook | null;
}

/** The description of a kept scan (`draft/state.json`). */
export interface ScanSnapshot {
  version: number;
  /** When it was written, ms since 1970. */
  savedAt: number;
  /** Where the learner was. */
  phase: 'pages' | 'music' | 'text';
  pages: KeptPage[];
  /** The pages the reading came from (may hold pictures turned or cropped since). */
  readPages: KeptPage[];
  readNotes: string[];
  text: KeptText | null;
  aiResult: AiOutcome | null;
  /** Stamps of the reading and the undo steps kept beside it (null = none); a mismatch means they are from another write. */
  docId: string | null;
  historyId: string | null;
  /** For the offer, without reading the reading: its title, bars and how many changes were made. */
  title: string | null;
  bars: number;
  changes: number;
}

/** The parts of the scanner's state a snapshot is made from. */
export interface SnapshotInput {
  phase: 'pages' | 'reading' | 'music' | 'text';
  pages: KeptPage[];
  readPages: KeptPage[];
  readNotes: string[];
  text: KeptText | null;
  aiResult: AiOutcome | null;
  history: History | null;
  docId: string | null;
  historyId: string | null;
}

/** The undo history trimmed to what is kept on the device. */
export function trimHistory(h: History, past = KEPT_PAST, future = KEPT_FUTURE): History {
  return { past: h.past.slice(Math.max(0, h.past.length - past)), present: h.present, future: h.future.slice(0, future) };
}

/** The description to keep. A reading in progress is kept as the pages it reads. */
export function makeSnapshot(input: SnapshotInput, now = Date.now()): ScanSnapshot {
  const draft = input.history?.present ?? null;
  const phase = input.phase === 'music' && draft ? 'music' : input.phase === 'text' && input.text ? 'text' : 'pages';
  return {
    version: SNAPSHOT_VERSION,
    savedAt: now,
    phase,
    pages: input.pages,
    readPages: draft ? input.readPages : [],
    readNotes: draft ? input.readNotes : [],
    text: input.text,
    aiResult: draft ? input.aiResult : null,
    docId: draft ? input.docId : null,
    historyId: draft ? input.historyId : null,
    title: draft?.song.meta.title ?? input.text?.reading?.result.song.meta.title ?? null,
    bars: draft?.song.bars.length ?? input.text?.reading?.result.song.bars.length ?? 0,
    changes: input.history?.past.length ?? 0,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function keptPage(v: unknown): KeptPage | null {
  if (!isObj(v)) return null;
  if (!isStr(v.id) || !isStr(v.label) || !isStr(v.pic) || !isNum(v.width) || !isNum(v.height)) return null;
  if (!['camera', 'photo', 'pdf', 'sample'].includes(v.origin as string)) return null;
  return {
    id: v.id,
    label: v.label,
    origin: v.origin as PageOrigin,
    kindOf: v.kindOf === 'render' ? 'render' : 'photo',
    width: v.width,
    height: v.height,
    pic: v.pic,
    thumb: isStr(v.thumb) ? v.thumb : null,
    ...(isStr(v.pdfText) ? { pdfText: v.pdfText } : {}),
    look: isObj(v.look) && isStr(v.look.kind) && Array.isArray(v.look.staves) ? (v.look as unknown as PageLook) : null,
  };
}

/** A snapshot read back from the device, checked; null when it is missing, from another version or damaged. */
export function readSnapshot(value: unknown): ScanSnapshot | null {
  if (!isObj(value) || value.version !== SNAPSHOT_VERSION || !isNum(value.savedAt)) return null;
  if (!Array.isArray(value.pages) || !Array.isArray(value.readPages)) return null;
  const pages = value.pages.map(keptPage);
  const readPages = value.readPages.map(keptPage);
  if (pages.some((p) => !p) || readPages.some((p) => !p)) return null;
  const text = isObj(value.text) && isStr(value.text.text) ? (value.text as unknown as KeptText) : null;
  const phase = value.phase === 'music' || value.phase === 'text' ? value.phase : 'pages';
  return {
    version: SNAPSHOT_VERSION,
    savedAt: value.savedAt,
    phase,
    pages: pages as KeptPage[],
    readPages: readPages as KeptPage[],
    readNotes: Array.isArray(value.readNotes) ? value.readNotes.filter(isStr) : [],
    text,
    aiResult: isObj(value.aiResult) ? (value.aiResult as unknown as AiOutcome) : null,
    docId: isStr(value.docId) ? value.docId : null,
    historyId: isStr(value.historyId) ? value.historyId : null,
    title: isStr(value.title) ? value.title : null,
    bars: isNum(value.bars) ? value.bars : 0,
    changes: isNum(value.changes) ? value.changes : 0,
  };
}

/** Is there anything in a snapshot worth offering back? */
export function worthOffering(s: ScanSnapshot): boolean {
  return s.pages.length > 0 || !!s.text || (s.phase === 'music' && s.readPages.length > 0);
}

/** A kept undo history read back; null when it is not one. */
export function readHistory(value: unknown): History | null {
  if (!isObj(value) || !isObj(value.present) || !Array.isArray(value.past) || !Array.isArray(value.future)) return null;
  const ok = (d: unknown): d is Draft => isObj(d) && isObj(d.song) && Array.isArray(d.marks) && Array.isArray((d.song as Record<string, unknown>).bars);
  if (!ok(value.present) || !value.past.every(ok) || !value.future.every(ok)) return null;
  return { past: value.past as Draft[], present: value.present as Draft, future: value.future as Draft[] };
}

/** A kept reading read back; null when it is not one. */
export function readDocument(value: unknown): OmrDocument | null {
  if (!isObj(value) || !Array.isArray(value.pages) || !Array.isArray(value.measures)) return null;
  return value as unknown as OmrDocument;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "5 minutes ago", "yesterday at 18:20". */
export function agoWords(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'a moment ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, 'hour')} ago`;
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.round(h / 24);
  return days === 1 ? `yesterday at ${time}` : `${plural(days, 'day')} ago`;
}

/** The words of the offer: a title line and what it holds. */
export function describeSnapshot(s: ScanSnapshot, now = Date.now()): { title: string; detail: string } {
  const parts: string[] = [];
  if (s.phase === 'music' && s.title) {
    parts.push(`“${s.title}”, ${plural(s.bars, 'bar')} read from ${plural(Math.max(s.readPages.length, s.pages.length), 'page')}`);
    if (s.changes) parts.push(`with ${plural(s.changes, 'change')} you made`);
  } else if (s.text) {
    parts.push(s.title ? `the text of “${s.title}”` : 'the text you were checking');
  } else {
    parts.push(`${plural(s.pages.length, 'page')}, not read yet`);
  }
  return { title: 'Pick up where you left off?', detail: `Your unsaved scan: ${parts.join(' ')}. Kept on this device ${agoWords(s.savedAt, now)}.` };
}
