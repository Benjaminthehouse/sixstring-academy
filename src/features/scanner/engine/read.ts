/**
 * Reading the pages: printed music through the sheet reader's worker (progress per page,
 * cancellable), then the words it only located (chord symbols, title, tempo) through OCR; text
 * sheets (chords over lyrics, typed tab) through OCR or a PDF's own text into the song importers;
 * and, when the learner asks for it, a second reading by the AI helper merged in by the reader's
 * own rules.
 */
import { type ImportResult, type SongFormat, detectTextFormat, importSong } from '@/core/song';
import type { OmrDocument } from '@/core/omr/pipeline';
import type { OmrWorkerClient } from '@/core/omr/worker/client';
import type { GrayImage } from '@/core/omr/image/gray';
import type { BBox, OmrText } from '@/core/omr/types';
import { aiStatus, askJson, isAiError } from '@/core/platform';
import { aiAllowed } from '@/core/settings';
import { layoutText } from '../model/text-layout';
import { CHORD_CHARS, cleanChordText } from '../model/chords';

export { CHORD_CHARS, cleanChordText };
import { type Ocr, OcrUnavailableError, createOcr, ocrCanvas, readBoxes } from './ocr';
import { canvasOfGray, ctx2d, makeCanvas } from './images';

/** Where reading is, for the progress panel. */
export interface ReadProgress {
  /** 0-based page and number of pages. */
  page: number;
  pages: number;
  /** 0..1 over the whole run. */
  fraction: number;
  message: string;
  stage: 'music' | 'words' | 'text' | 'ai';
}

/** Is this the rejection of a cancelled run? */
export function isAbort(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

function abortError(): Error {
  return Object.assign(new Error('Cancelled.'), { name: 'AbortError' });
}

/** Read printed music pages as one piece (key and time carry over between pages). */
export async function readMusic(omr: OmrWorkerClient, grays: GrayImage[], opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void; tuning?: number[] } = {}): Promise<OmrDocument> {
  return omr.recognizeDocument(grays, {
    signal: opts.signal,
    ...(opts.tuning ? { tuning: opts.tuning } : {}),
    onProgress: (p) => opts.onProgress?.({ page: p.page, pages: p.pages, fraction: p.fraction, message: p.pages > 1 ? `Page ${p.page + 1} of ${p.pages}: ${p.message}` : p.message, stage: 'music' }),
  });
}

/** The located-but-unread texts of a reading. */
function blankTexts(doc: OmrDocument): { page: number; text: OmrText }[] {
  const out: { page: number; text: OmrText }[] = [];
  doc.pages.forEach((p, i) => {
    for (const t of p.texts) if (!t.text.trim() && t.bbox.w > 2 && t.bbox.h > 2) out.push({ page: i, text: t });
    for (const s of p.systems) for (const t of s.texts) if (!t.text.trim() && t.bbox.w > 2 && t.bbox.h > 2) out.push({ page: i, text: t });
  });
  return out;
}

/**
 * Fill the chord symbols, titles and tempo marks the reader located with OCR (mutates the
 * document). Returns how many were filled, or the sentence saying why text reading is unavailable.
 */
export async function fillTexts(doc: OmrDocument, grays: GrayImage[], ocr: () => Promise<Ocr>, opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void } = {}): Promise<{ filled: number; unavailable?: string }> {
  const todo = blankTexts(doc);
  if (!todo.length) return { filled: 0 };
  let reader: Ocr;
  try {
    opts.onProgress?.({ page: 0, pages: doc.pages.length, fraction: 0, message: 'Getting ready to read chord names and titles', stage: 'words' });
    reader = await ocr();
  } catch (e) {
    return { filled: 0, unavailable: e instanceof OcrUnavailableError ? e.message : 'Chord names and titles could not be read here.' };
  }
  let filled = 0;
  for (let p = 0; p < doc.pages.length; p++) {
    if (opts.signal?.aborted) throw abortError();
    const items = todo.filter((t) => t.page === p);
    if (!items.length || !grays[p]) continue;
    opts.onProgress?.({ page: p, pages: doc.pages.length, fraction: p / doc.pages.length, message: `Reading chord names and titles${doc.pages.length > 1 ? ` on page ${p + 1}` : ''}`, stage: 'words' });
    const texts = await readBoxes(reader, grays[p], items.map((t) => t.text.bbox as BBox));
    items.forEach((it, k) => {
      const raw = texts[k]?.trim() ?? '';
      if (!raw) return;
      if (it.text.kind === 'chord-symbol') {
        const chord = cleanChordText(raw);
        if (chord) {
          it.text.text = chord;
          filled++;
        }
      } else if (/[A-Za-z]{2,}|\d{2,}/.test(raw)) {
        it.text.text = raw.replace(/\s+/g, ' ');
        filled++;
      }
    });
  }
  return { filled };
}

/**
 * Chord names printed over a tab staff that has no notation staff above it: the sheet reader does
 * not locate those, so the band above each such staff is read with OCR and every word that is a
 * chord name becomes a chord symbol of the system (mutates the document). Returns how many.
 */
export async function findChordsOverTab(doc: OmrDocument, grays: GrayImage[], ocr: () => Promise<Ocr>, opts: { signal?: AbortSignal } = {}): Promise<number> {
  let found = 0;
  let reader: Ocr | null = null;
  for (let p = 0; p < doc.pages.length; p++) {
    const page = doc.pages[p];
    const gray = grays[p];
    if (!gray) continue;
    for (const sys of page.systems) {
      if (opts.signal?.aborted) throw abortError();
      const top = sys.staves[0];
      if (!top || top.kind !== 'tab' || sys.texts.some((t) => t.kind === 'chord-symbol' && t.text)) continue;
      const g = top.geometry;
      const space = g.space;
      const x0 = Math.max(0, Math.floor(g.x0 - space));
      const x1 = Math.min(gray.width, Math.ceil(g.x1 + space));
      const y1 = Math.max(0, Math.floor(g.bbox.y - space * 0.3));
      const y0 = Math.max(0, Math.floor(y1 - space * 3.2));
      if (y1 - y0 < 6 || x1 - x0 < 20) continue;
      // Enlarge so a chord name is about 40 px tall for the OCR.
      const scale = Math.max(1, Math.min(4, 40 / Math.max(6, space * 1.4)));
      const band = makeCanvas((x1 - x0) * scale, (y1 - y0) * scale);
      const c = ctx2d(band);
      c.imageSmoothingQuality = 'high';
      c.drawImage(canvasOfGray(gray) as unknown as CanvasImageSource, x0, y0, x1 - x0, y1 - y0, 0, 0, band.width, band.height);
      try {
        reader ??= await ocr();
      } catch {
        return found;
      }
      const r = await reader.read(band, 'sparse', CHORD_CHARS);
      let n = 0;
      for (const w of r.words) {
        const chord = cleanChordText(w.text);
        if (!chord) continue;
        const bx = x0 + w.x / scale;
        const by = y0 + w.y / scale;
        sys.texts.push({ id: `${sys.id}.ocr${n++}`, kind: 'chord-symbol', text: chord, x: bx + w.w / scale / 2, bbox: { x: bx, y: by, w: w.w / scale, h: w.h / scale }, confidence: 0.6, staffId: top.id, source: 'image' });
        found++;
      }
    }
  }
  return found;
}

/** A text sheet read into a song. */
export interface TextReading {
  text: string;
  format: SongFormat;
  result: ImportResult;
}

/** Text of picture pages through OCR (columns kept), joined with a PDF's own text where it had one. */
export async function readTextPages(pages: { gray: GrayImage | null; pdfText?: string }[], ocr: () => Promise<Ocr>, opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void } = {}): Promise<string> {
  const parts: string[] = [];
  let reader: Ocr | null = null;
  for (let i = 0; i < pages.length; i++) {
    if (opts.signal?.aborted) throw abortError();
    const p = pages[i];
    if (p.pdfText) {
      parts.push(p.pdfText);
      continue;
    }
    if (!p.gray) continue;
    opts.onProgress?.({ page: i, pages: pages.length, fraction: i / pages.length, message: `Reading the words${pages.length > 1 ? ` on page ${i + 1}` : ''}`, stage: 'text' });
    reader ??= await ocr();
    // Small print reads better enlarged.
    const scale = Math.max(p.gray.width, p.gray.height) < 1600 ? 2 : 1;
    const r = await reader.read(ocrCanvas(p.gray, scale), 'block');
    parts.push(layoutText(r.words));
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Import text as a song (tab, chord sheet, ChordPro or SixTab); a RangeError says what it does not understand. */
export async function importText(text: string, title?: string): Promise<TextReading> {
  const format = detectTextFormat(text);
  if (format === 'unknown') throw new RangeError('This does not look like tab or chords yet. Tab has six lines of dashes with fret numbers; a chord sheet has chord names over the words.');
  const r = await importSong(text, { format, ...(title ? { title } : {}) });
  return { text, format, result: r };
}

// ------------------------------------------------------------------------------------------
// The AI helper
// ------------------------------------------------------------------------------------------

/** Can the AI helper be offered, and what to say when it cannot. */
export interface AiAvailability {
  state: 'ready' | 'settings' | 'unavailable' | 'no-images';
  /** Who provides it ('artifact' = built into Claude; 'anthropic' = the learner's key). */
  provider: 'artifact' | 'anthropic' | 'none';
  message: string;
}

/** Whether "Improve with AI" can be offered (nothing is sent by asking). */
export async function aiAvailability(): Promise<AiAvailability> {
  let status: Awaited<ReturnType<typeof aiStatus>>;
  try {
    status = await aiStatus();
  } catch {
    return { state: 'unavailable', provider: 'none', message: 'The AI helper is not available here.' };
  }
  if (!status.available) {
    return { state: 'unavailable', provider: status.provider, message: 'The AI helper is not set up. In Settings you can add your own key; then it can check a reading against the picture.' };
  }
  if (!status.images) return { state: 'no-images', provider: status.provider, message: 'The AI helper here cannot look at pictures.' };
  if (!aiAllowed()) return { state: 'settings', provider: status.provider, message: 'The AI helper is turned off in Settings. Turn it on to let it check this reading against your picture: the picture is sent to Claude only when you ask.' };
  return { state: 'ready', provider: status.provider, message: '' };
}

/** What a second reading by the AI changed. */
export interface AiOutcome {
  agree: number;
  changed: number;
  added: number;
  notes: string[];
}

/** Ask the AI helper to read the music pages and merge its answer into the reading (mutates `doc`). */
export async function improveMusicWithAi(doc: OmrDocument, grays: GrayImage[], opts: { signal?: AbortSignal; tuning?: readonly number[]; onProgress?: (p: ReadProgress) => void } = {}): Promise<AiOutcome> {
  const { createPlatformAiClient, readPageWithAi, fuseAiReading } = await Promise.all([import('@/core/omr/ai-platform'), import('@/core/omr/ai-assist')]).then(([a, b]) => ({ ...a, ...b }));
  const client = createPlatformAiClient();
  const out: AiOutcome = { agree: 0, changed: 0, added: 0, notes: [] };
  for (let i = 0; i < doc.pages.length; i++) {
    if (opts.signal?.aborted) throw abortError();
    opts.onProgress?.({ page: i, pages: doc.pages.length, fraction: i / doc.pages.length, message: `The AI helper is reading${doc.pages.length > 1 ? ` page ${i + 1}` : ' the page'} (this can take a minute)`, stage: 'ai' });
    const ai = await readPageWithAi(grays[i], doc.pages[i], client, { signal: opts.signal });
    const report = fuseAiReading(doc.pages[i], ai.reading, ai.systemMap, opts.tuning ? { tuning: opts.tuning } : {});
    out.agree += report.agree;
    out.changed += report.resolved;
    out.added += report.aiOnly;
    out.notes.push(...report.notes);
  }
  return out;
}

/** Ask the AI helper to type out a text sheet (chords over lyrics, typed tab) from its picture. */
export async function readTextWithAi(images: Blob[], opts: { signal?: AbortSignal } = {}): Promise<string> {
  if (!aiAllowed()) throw new Error('The AI helper is turned off in Settings, so nothing was sent.');
  const { value } = await askJson<{ text: string }>({
    tier: 'complex',
    images,
    signal: opts.signal,
    system: 'You transcribe printed guitar song sheets exactly as printed. Never invent or complete anything.',
    prompt: [
      'The pictures are the pages, in order, of one printed guitar song sheet: chord names over lyrics, or tab typed with dashes.',
      'Type it out as plain text in a fixed-width layout: keep every chord name exactly above the syllable it is printed over, keep tab lines aligned column for column, keep section names like [Verse] and blank lines between sections.',
      'Answer with JSON only: {"text": "..."} with newlines as \\n.',
    ].join('\n'),
    validate: (v) => {
      const t = v && typeof v === 'object' ? (v as { text?: unknown }).text : undefined;
      if (typeof t !== 'string' || !t.trim()) throw new Error('"text" must be the sheet as a non-empty string.');
      return { text: t };
    },
  });
  return value.text;
}

/** A sentence for an AI failure. */
export function aiErrorMessage(e: unknown): string {
  if (isAiError(e)) return e.message;
  if (e && typeof e === 'object' && (e as { name?: string }).name === 'OmrAiUnavailableError') return (e as Error).message;
  return 'The AI helper could not read it this time. Your reading is unchanged.';
}

export { createOcr };
