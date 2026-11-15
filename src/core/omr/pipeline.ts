/**
 * The one entry point of the sheet reader: page picture in, positioned transcription out.
 *
 *   const page = await recognizePage(imageData, { onProgress, signal });
 *   const doc = await recognizeDocument([page1, page2], { onProgress, signal });
 *
 * Stages: preprocess + layout (`analyzePage`) -> one strip per staff -> the tab or notation
 * recognizer for that staff (key, time and clef carried from staff to staff and page to page) ->
 * assembly into measures with notation and tab linked and reconciled -> measure checks, rhythm
 * agreement between linked staves, rhythm estimated from spacing where none is printed.
 *
 * Runs anywhere (main thread, Web Worker, Node). For the browser use `createOmrWorker()` from
 * `./worker/client` so a full page never blocks the UI. Cancel with an AbortSignal: the run stops
 * between staves and rejects with an `OmrCancelledError`.
 */
import type { GrayImage } from './image/gray';
import { rgbaToGray } from './image/gray';
import { type AnalyzeOptions, type ExtractOptions, type PageAnalysis, analyzePage, assemblePage, extractStaff } from './page';
import { recognizeNotationStaff } from './notation';
import { checkMeasures, estimateRhythmFromSpacing, metreTicks, reconcileRhythm, typicalLeftPad } from './reconcile';
import { recognizeTabStaff } from './tab';
import {
  type ClefType, type OmrContextSource, type OmrMeasure, type OmrPage, type OmrStaff, type OmrVisionModel, type OmrWarning, type RecognizeNotationStaff,
  type RecognizeOptions, type RecognizeTabStaff, type StaffReading,
} from './types';

/** A page picture: grey (one byte per pixel) or RGBA (canvas `ImageData`, four bytes per pixel). */
export type OmrImageInput = GrayImage | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

/** Where a run is. `fraction` grows from 0 to 1 over the whole run (all pages). */
export interface OmrProgress {
  stage: 'prepare' | 'staff' | 'assemble' | 'done';
  fraction: number;
  /** A short sentence for the screen ("Reading staff 3 of 8"). */
  message: string;
  /** 0-based page being read and the number of pages. */
  page: number;
  pages: number;
  /** 0-based staff being read on this page and the number of staves found (stage 'staff'). */
  staff?: number;
  staves?: number;
}

/** Key, time and clef in force, carried from staff to staff and page to page. */
export interface OmrContext {
  fifths?: number;
  beats?: number;
  beatValue?: number;
  clef?: ClefType;
  /** Where each value came from. */
  fifthsSource?: OmrContextSource;
  timeSource?: OmrContextSource;
}

/** Options for {@link recognizePage} and {@link recognizeDocument}. */
export interface RecognizePageOptions extends AnalyzeOptions {
  /** Tab recognizer (default: the built-in one). `null` leaves tab staves unread. */
  tab?: RecognizeTabStaff | null;
  /** Notation recognizer (default: the built-in one). `null` leaves notation staves unread. */
  notation?: RecognizeNotationStaff | null;
  /** Optional vision model the recognizers may ask about doubtful staves / measures. Never required. */
  ai?: OmrVisionModel | null;
  /** Abort the run: it stops before the next staff and rejects with {@link OmrCancelledError}. */
  signal?: AbortSignal;
  /** Tuning of tab staves, sounding MIDI low to high (default standard). */
  tuning?: number[];
  /** Key / time known in advance (a page that continues an earlier one). */
  context?: RecognizeOptions['context'];
  /** Strip extraction settings per staff kind. */
  strip?: { notation?: ExtractOptions; tab?: ExtractOptions };
  /** Progress callback (called synchronously; keep it cheap). */
  onProgress?: (p: OmrProgress) => void;
  /** Work out durations from the spacing for tab printed without rhythm (default true). */
  estimateRhythm?: boolean;
  /** Let the event loop run between staves so messages (a cancel) get through (default true). */
  yieldBetweenStaves?: boolean;
}

/** Rejection of a cancelled run. */
export class OmrCancelledError extends Error {
  constructor() {
    super('Reading the page was cancelled.');
    this.name = 'AbortError';
  }
}

/** True for the rejection of a cancelled run (ours, or a platform AbortError). */
export function isCancelled(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OmrCancelledError();
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Grey version of a page picture (RGBA is converted; grey is used as is). */
export function toGray(image: OmrImageInput): GrayImage {
  const n = image.width * image.height;
  if (image.data.length === n) return image.data instanceof Uint8Array ? (image as GrayImage) : { width: image.width, height: image.height, data: new Uint8Array(image.data) };
  if (image.data.length === 4 * n) return rgbaToGray(image.data, image.width, image.height);
  throw new Error(`picture data has ${image.data.length} bytes; expected ${n} (grey) or ${4 * n} (RGBA)`);
}

/** Per-run state that crosses pages. */
interface RunState {
  context: OmrContext;
  pageIndex: number;
  pages: number;
  /** A pickup is only possible at the very start of the piece. */
  firstStaffOfPiece: boolean;
}

function updateContext(ctx: OmrContext, reading: StaffReading | null, kind: 'notation' | 'tab'): void {
  if (!reading) return;
  if (kind === 'notation') {
    if (reading.clef && reading.clef.confidence >= 0.5 && reading.clef.source !== 'inferred') ctx.clef = reading.clef.type;
    if (reading.keySignature && reading.keySignature.confidence >= 0.5) {
      ctx.fifths = reading.keySignature.fifths;
      ctx.fifthsSource = 'printed';
    } else if (reading.clef && reading.clef.confidence >= 0.5 && reading.clef.source !== 'inferred') {
      // A staff that prints its clef but no key signature is in C / A minor.
      ctx.fifths = 0;
      ctx.fifthsSource = 'printed';
    }
  }
  if (reading.timeSignature && reading.timeSignature.confidence >= 0.5) {
    ctx.beats = reading.timeSignature.beats;
    ctx.beatValue = reading.timeSignature.beatValue;
    ctx.timeSource = 'printed';
  }
}

/** Staff-level facts the pipeline adds after assembly. */
function annotateStaff(staff: OmrStaff, before: OmrContext, after: OmrContext): void {
  const printedTime = staff.timeSignature && staff.timeSignature.confidence >= 0.5;
  if (after.beats && after.beatValue) {
    staff.timeInForce = { beats: after.beats, beatValue: after.beatValue, source: printedTime ? 'printed' : before.timeSource === 'given' ? 'given' : 'carried' };
  } else {
    staff.timeInForce = { beats: 4, beatValue: 4, source: 'assumed' };
  }
  if (staff.kind === 'notation') {
    const printed = !!staff.keySignature && staff.keySignature.confidence >= 0.5;
    if (after.fifths !== undefined) staff.keyInForce = { fifths: after.fifths, source: printed ? 'printed' : before.fifthsSource === 'given' ? 'given' : 'carried' };
    else staff.keyInForce = { fifths: 0, source: 'assumed' };
  }
}

/** Measure checks, rhythm agreement between linked staves, rhythm from spacing. */
function finishPage(page: OmrPage, firstStaffOfPiece: boolean, estimate: boolean): void {
  const staves = page.systems.flatMap((s) => s.staves);
  const lastOfKind = new Map<string, OmrStaff>();
  for (const st of staves) lastOfKind.set(st.kind, st);
  const firstOfKind = new Set<string>();
  const check = (): void => {
    firstOfKind.clear();
    for (const st of staves) {
      const t = st.timeInForce;
      const first = firstStaffOfPiece && !firstOfKind.has(st.kind);
      firstOfKind.add(st.kind);
      checkMeasures(st, t ? metreTicks(t.beats, t.beatValue) : null, first || lastOfKind.get(st.kind) === st, lastOfKind.get(st.kind) === st);
    }
  };
  check();
  const disagreements = reconcileRhythm(page);
  if (disagreements) check();
  if (estimate) {
    let estimated = 0;
    for (const st of staves) {
      if (st.kind !== 'tab') continue;
      const t = st.timeInForce ?? { beats: 4, beatValue: 4 };
      const pad = typicalLeftPad(st);
      for (const m of st.measures) if (estimateRhythmFromSpacing(m, metreTicks(t.beats, t.beatValue), pad)) estimated++;
    }
    if (estimated) check();
  }
}

/**
 * Read one page with an existing analysis (preprocessing + layout already done). Used by
 * {@link recognizePage}; exposed for tools that time or inspect the stages separately.
 */
export async function readAnalyzedPage(analysis: PageAnalysis, options: RecognizePageOptions = {}, state?: RunState): Promise<OmrPage> {
  const run: RunState = state ?? { context: initialContext(options), pageIndex: 0, pages: 1, firstStaffOfPiece: true };
  const { signal } = options;
  const staves = analysis.layout.staves;
  const readings: (StaffReading | null)[] = [];
  const before: OmrContext[] = [];
  const after: OmrContext[] = [];
  const warnings: OmrWarning[] = [];
  const progress = (stage: OmrProgress['stage'], within: number, message: string, staff?: number): void => {
    options.onProgress?.({ stage, fraction: Math.min(1, (run.pageIndex + within) / run.pages), message, page: run.pageIndex, pages: run.pages, staff, staves: staves.length });
  };
  const t0 = now();
  for (let i = 0; i < staves.length; i++) {
    if (options.yieldBetweenStaves !== false) await tick();
    throwIfAborted(signal);
    const st = staves[i];
    progress('staff', 0.3 + (0.65 * i) / Math.max(1, staves.length), `Reading ${st.kind === 'tab' ? 'tab' : 'notation'} staff ${i + 1} of ${staves.length}`, i);
    const fn = st.kind === 'tab' ? (options.tab === undefined ? recognizeTabStaff : options.tab) : options.notation === undefined ? recognizeNotationStaff : options.notation;
    before.push({ ...run.context });
    if (!fn) {
      readings.push(null);
      after.push({ ...run.context });
      continue;
    }
    let reading: StaffReading | null = null;
    try {
      const input = extractStaff(analysis, st.index, options.strip?.[st.kind]);
      const ctx = run.context;
      const staffOptions: RecognizeOptions = {
        ai: options.ai ?? undefined,
        signal,
        tuning: options.tuning,
        context: { fifths: ctx.fifths, beats: ctx.beats, beatValue: ctx.beatValue, clef: ctx.clef },
      };
      reading = await fn(input, staffOptions);
    } catch (err) {
      if (isCancelled(err) || signal?.aborted) throw new OmrCancelledError();
      warnings.push({ code: 'other', message: `Staff ${i + 1} could not be read (${err instanceof Error ? err.message : String(err)}).`, staffId: `s${st.systemIndex}.st${st.indexInSystem}` });
      reading = null;
    }
    readings.push(reading);
    updateContext(run.context, reading, st.kind);
    after.push({ ...run.context });
  }
  const staffMs = now() - t0;
  throwIfAborted(signal);
  progress('assemble', 0.96, 'Putting the staves together');
  const t1 = now();
  const page = assemblePage(analysis, readings);
  page.warnings.push(...warnings);
  staves.forEach((st, i) => {
    const staff = page.systems[st.systemIndex]?.staves[st.indexInSystem];
    if (staff) annotateStaff(staff, before[i], after[i]);
  });
  finishPage(page, run.firstStaffOfPiece, options.estimateRhythm !== false);
  if (staves.length) run.firstStaffOfPiece = false;
  page.timings = { ...analysis.pre.timings, staves: staffMs, assemble: now() - t1 };
  return page;
}

function initialContext(options: RecognizePageOptions): OmrContext {
  const c = options.context ?? {};
  return {
    fifths: c.fifths,
    beats: c.beats,
    beatValue: c.beatValue,
    clef: c.clef,
    fifthsSource: c.fifths !== undefined ? 'given' : undefined,
    timeSource: c.beats !== undefined ? 'given' : undefined,
  };
}

async function readOnePage(image: OmrImageInput, options: RecognizePageOptions, run: RunState): Promise<OmrPage> {
  throwIfAborted(options.signal);
  const t0 = now();
  options.onProgress?.({ stage: 'prepare', fraction: run.pageIndex / run.pages, message: 'Finding the staves', page: run.pageIndex, pages: run.pages });
  if (options.yieldBetweenStaves !== false) await tick();
  throwIfAborted(options.signal);
  const analysis = analyzePage(toGray(image), options);
  const page = await readAnalyzedPage(analysis, options, run);
  page.timings = { ...page.timings, total: now() - t0 };
  return page;
}

/**
 * Read one page picture: staves, systems, bar lines, measures, notes / tab numbers with pitch,
 * string / fret and rhythm, every element with its box on the picture and a confidence.
 *
 * `recognizePage(gray, { tab, notation })` (recognizers in the options) is the older call form and
 * still works; a third argument is merged into the options.
 */
export async function recognizePage(image: OmrImageInput, options: RecognizePageOptions = {}, more?: RecognizePageOptions): Promise<OmrPage> {
  const opts = more ? { ...more, ...options } : options;
  const run: RunState = { context: initialContext(opts), pageIndex: 0, pages: 1, firstStaffOfPiece: true };
  const page = await readOnePage(image, opts, run);
  opts.onProgress?.({ stage: 'done', fraction: 1, message: 'Done', page: 0, pages: 1 });
  return page;
}

/** A measure of the whole document, in playing order, with where to find it. */
export interface OmrMeasureRef {
  /** 0-based number over the whole document. */
  number: number;
  page: number;
  system: number;
  /** The staves of the system that show this measure (notation first, then tab), by id. */
  staffIds: string[];
  measureIndex: number;
}

/** Several pages read as one piece. */
export interface OmrDocument {
  pages: OmrPage[];
  /** Every measure in order across pages (systems joined end to start). */
  measures: OmrMeasureRef[];
  /** Key and time in force at the end (to continue with a later page). */
  context: OmrContext;
  warnings: OmrWarning[];
}

/**
 * Read several pages in order as one piece: key, time and clef carry over from the end of one
 * page to the next, and the systems are joined into one list of measures.
 */
export async function recognizeDocument(images: OmrImageInput[], options: RecognizePageOptions = {}): Promise<OmrDocument> {
  const run: RunState = { context: initialContext(options), pageIndex: 0, pages: images.length, firstStaffOfPiece: true };
  const pages: OmrPage[] = [];
  for (let i = 0; i < images.length; i++) {
    run.pageIndex = i;
    const page = await readOnePage(images[i], options, run);
    page.pageIndex = i;
    pages.push(page);
  }
  options.onProgress?.({ stage: 'done', fraction: 1, message: 'Done', page: Math.max(0, images.length - 1), pages: images.length });
  return joinPages(pages, run.context);
}

/** Join pages into one list of measures (the notation staff leads a linked system; a lone tab staff leads its own). */
export function joinPages(pages: OmrPage[], context: OmrContext = {}): OmrDocument {
  const measures: OmrMeasureRef[] = [];
  const warnings: OmrWarning[] = [];
  pages.forEach((page, p) => {
    for (const sys of page.systems) {
      // Parts of one system: a notation staff with its tab partner, or a staff on its own.
      const used = new Set<string>();
      const groups: OmrStaff[][] = [];
      for (const st of sys.staves) {
        if (used.has(st.id)) continue;
        const partner = st.linkedStaffId ? sys.staves.find((s) => s.id === st.linkedStaffId) : undefined;
        const group = partner ? [st, partner].sort((a, b) => (a.kind === 'notation' ? -1 : b.kind === 'notation' ? 1 : 0)) : [st];
        for (const g of group) used.add(g.id);
        groups.push(group);
      }
      // Several independent staves in one system (e.g. two guitars) play together: number by the first.
      const lead = groups[0];
      if (!lead) continue;
      const count = Math.max(...lead.map((s) => s.measures.length));
      for (let k = 0; k < count; k++) {
        measures.push({ number: measures.length, page: p, system: sys.index, staffIds: sys.staves.filter((s) => s.measures[k]).map((s) => s.id), measureIndex: k });
      }
      if (groups.length > 1 && groups.some((g) => g[0].measures.length !== count)) {
        warnings.push({ code: 'measure-mismatch', message: `The staves of system ${sys.index + 1} on page ${p + 1} do not have the same number of measures.` });
      }
    }
    for (const w of page.warnings) warnings.push({ ...w, message: pages.length > 1 ? `Page ${p + 1}: ${w.message}` : w.message });
  });
  return { pages, measures, context, warnings };
}

/** The measure objects of a document reference (one per staff of the system). */
export function measuresAt(doc: OmrDocument, ref: OmrMeasureRef): OmrMeasure[] {
  const page = doc.pages[ref.page];
  const sys = page?.systems.find((s) => s.index === ref.system);
  if (!sys) return [];
  return ref.staffIds.map((id) => sys.staves.find((s) => s.id === id)?.measures[ref.measureIndex]).filter((m): m is OmrMeasure => !!m);
}
