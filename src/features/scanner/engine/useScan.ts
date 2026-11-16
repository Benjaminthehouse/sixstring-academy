/**
 * The scanner's working state and everything it does, in one hook so the screens stay thin:
 * the pages (adding photos, PDFs and the sample, the quick look, rotate / crop / retake / reorder),
 * reading them (music through the sheet reader, text through OCR), the proofreading draft with its
 * undo history, the AI helper, and saving to the library. Unsaved work outlives the screen for
 * the rest of the visit (kept in this module when the screen unmounts) and a reload or a discarded
 * tab: it is kept on the device as it changes (`persist.ts`) and offered back on the next visit.
 * A reload asks first only while that copy is not up to date (or the browser keeps nothing).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createOmrWorker, type OmrWorkerClient } from '@/core/omr/worker/client';
import type { OmrDocument } from '@/core/omr/pipeline';
import type { GrayImage } from '@/core/omr/image/gray';
import type { BBox } from '@/core/omr/types';
import { type OmrSummary, summarizeDocument } from '@/core/omr/summary';
import { detectTextFormat, type Song } from '@/core/song';
import { getLibrary, isLibraryError, type SongListing } from '@/core/library';
import { readFileText, sniffFile } from '@/core/platform';
import { openBlobStore } from '@/core/platform/blobs';
import { recordActivity } from '@/core/progress';
import { type Draft, buildDraft } from '../model/draft';
import { rearrange, songToSave } from '../model/edit';
import { type History, commit, redo as redoHistory, startHistory, undo as undoHistory } from '../model/select';
import { type PageOrigin, type ScanPage, describeLook, hasWork, kindLabel, movePage, pdfScale, sheetKind, worthWarning } from '../model/pages';
import { layoutText } from '../model/text-layout';
import { type AnyCanvas, canvasOfGray, cropPicture, grayOf, pictureFromCanvas, pictureFromFile, releasePicture, rotatePicture, toBlob } from './images';
import { createLooker, type Looker } from './look';
import { type Ocr, OcrUnavailableError } from './ocr';
import { type DraftKeeper, type KeepInput, type KeeperState, type LoadedScan, type PageWithPictures, createDraftKeeper } from './persist';
import { type KeptPage, describeSnapshot } from './snapshot';
import { type PdfFile, PdfError, openPdf } from './pdf';
import { type AiOutcome, type ReadProgress, type TextReading, aiErrorMessage, createOcr, fillTexts, findChordsOverTab, importText, improveMusicWithAi, isAbort, readMusic, readTextPages, readTextWithAi } from './read';

/** A page with the scanner's private bits (its encoded picture, the cleaned view). */
export interface Page extends ScanPage {
  blob: Blob;
  /** The thumbnail, encoded (kept on the device with an unsaved scan). */
  thumbBlob?: Blob;
  kindOf: 'photo' | 'render';
  /** The reader's cleaned, straightened view (object URL). */
  cleanUrl?: string;
}

/** Where the scanner is. */
export type Phase = 'pages' | 'reading' | 'music' | 'text';

/** The text being proofread (chord sheet or typed tab). */
export interface TextState {
  text: string;
  reading: TextReading | null;
  error: string | null;
  /** Where the text came from. */
  source: 'pdf' | 'ocr' | 'paste' | 'ai';
}

/** What a save gave. */
export interface Saved {
  listing: SongListing;
  warnings: string[];
  /** XP the import earned (0 once today's cap for imports is reached). */
  xp: number;
}

const MAX_PDF_PAGES = 16;
let uid = 0;
const newId = () => `p${Date.now().toString(36)}${(uid++).toString(36)}`;

/** The work kept while the learner is on another screen of the app (this tab), so leaving loses nothing. */
interface Kept {
  pages: Page[];
  readPages: Page[];
  doc: OmrDocument | null;
  summary: OmrSummary | null;
  history: History | null;
  readNotes: string[];
  text: TextState | null;
  aiResult: AiOutcome | null;
  /** Pages removed with an Undo still on offer (their pictures are freed with the rest). */
  removed: Page[];
}
let kept: Kept | null = null;

/** An unsaved scan from an earlier visit, kept on the device and offered back. */
export interface ResumeOffer {
  loaded: LoadedScan;
  title: string;
  detail: string;
}

let keeper: DraftKeeper | null = null;
/** The keeper of the unsaved scan: one per page, on the platform blob store (nothing kept when the browser refuses). */
function getKeeper(): DraftKeeper {
  keeper ??= createDraftKeeper(openBlobStore('scanner').catch(() => null));
  return keeper;
}

function keptOf(p: Page): PageWithPictures {
  return { id: p.id, label: p.label, origin: p.origin, kindOf: p.kindOf, width: p.width, height: p.height, look: p.look, blob: p.blob, ...(p.thumbBlob ? { thumbBlob: p.thumbBlob } : {}), ...(p.pdfText ? { pdfText: p.pdfText } : {}) };
}

function release(list: Page[]): void {
  for (const p of list) {
    releasePicture(p);
    if (p.cleanUrl) URL.revokeObjectURL(p.cleanUrl);
  }
}

/** The scanner's state (see the file comment). */
export function useScan() {
  // Coming back to the screen picks up the pages and the reading where they were left.
  const [resume] = useState(() => kept);
  const [pages, setPages] = useState<Page[]>(resume?.pages ?? []);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;
  const [adding, setAdding] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pages');
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<OmrDocument | null>(resume?.doc ?? null);
  const [summary, setSummary] = useState<OmrSummary | null>(resume?.summary ?? null);
  const [history, setHistory] = useState<History | null>(resume?.history ?? null);
  const [readNotes, setReadNotes] = useState<string[]>(resume?.readNotes ?? []);
  const [text, setText] = useState<TextState | null>(resume?.text ?? null);
  const [aiBusy, setAiBusy] = useState<ReadProgress | null>(null);
  const [aiResult, setAiResult] = useState<AiOutcome | null>(resume?.aiResult ?? null);
  const [saved, setSaved] = useState<Saved | null>(null);
  /** The pages the current reading came from, in its page order. */
  const [readPages, setReadPages] = useState<Page[]>(resume?.readPages ?? []);
  const removed = useRef<Page[]>(resume?.removed ?? []);
  const latest = useRef<Omit<Kept, 'removed'> & { saved: Saved | null; phase: Phase }>({ pages, readPages, doc, summary, history, readNotes, text, aiResult, saved, phase });
  latest.current = { pages, readPages, doc, summary, history, readNotes, text, aiResult, saved, phase };

  const grays = useRef<GrayImage[]>([]);
  const pdfs = useRef(new Map<string, { pdf: PdfFile; index: number; scale: number; size: { width: number; height: number } }>());
  const omr = useRef<OmrWorkerClient | null>(null);
  const looker = useRef<Looker | null>(null);
  const ocr = useRef<Promise<Ocr> | null>(null);
  const run = useRef<AbortController | null>(null);
  const ai = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    kept = null;
    return () => {
      alive.current = false;
      run.current?.abort();
      ai.current?.abort();
      omr.current?.terminate();
      omr.current = null;
      looker.current?.close();
      looker.current = null;
      void ocr.current?.then((o) => o.close(), () => undefined);
      ocr.current = null;
      for (const { pdf } of pdfs.current.values()) pdf.close();
      pdfs.current.clear();
      // Leaving the screen keeps unsaved work for when the learner comes back; a saved song is in the library.
      void getKeeper().flush();
      const s = latest.current;
      if (hasWork(s)) {
        kept = { pages: s.pages, readPages: s.readPages, doc: s.doc, summary: s.summary, history: s.history, readNotes: s.readNotes, text: s.text, aiResult: s.aiResult, removed: removed.current };
      } else {
        release([...s.pages, ...removed.current, ...s.readPages]);
        removed.current = [];
      }
    };
  }, []);

  // ---- the copy kept on the device ------------------------------------------------------------------
  const keep = useMemo(getKeeper, []);
  const [keeperState, setKeeperState] = useState<KeeperState>(keep.state);
  useEffect(() => {
    setKeeperState(keep.state);
    return keep.subscribe(setKeeperState);
  }, [keep]);
  // The unsaved scan of an earlier visit is offered back (a visit that kept one in memory has it already).
  const [offer, setOffer] = useState<ResumeOffer | null>(null);
  const [lookedForKept, setLookedForKept] = useState(!!resume);
  useEffect(() => {
    if (resume) return;
    let live = true;
    void keep.load().then((loaded) => {
      if (!live) return;
      if (loaded) setOffer({ loaded, ...describeSnapshot(loaded.snapshot) });
      setLookedForKept(true);
    });
    return () => {
      live = false;
    };
  }, [keep, resume]);
  const buildKeep = useCallback((): KeepInput | null => {
    const s = latest.current;
    if (!hasWork(s)) return null;
    return { phase: s.phase, pages: s.pages.map(keptOf), readPages: s.readPages.map(keptOf), readNotes: s.readNotes, text: s.text, aiResult: s.aiResult, history: s.history, doc: s.doc };
  }, []);
  // Keep the work as it changes; not while an earlier scan is on offer (this would replace it).
  useEffect(() => {
    if (!lookedForKept || offer) return;
    if (saved) {
      void keep.clear();
      return;
    }
    if (!hasWork(latest.current) && (keep.state === 'idle' || keep.state === 'cleared')) return;
    keep.schedule(buildKeep);
  }, [lookedForKept, offer, pages, readPages, doc, history, text, aiResult, readNotes, phase, saved, keep, buildKeep]);
  // A phone may discard a hidden tab without warning: write at once when the page is hidden.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') void keep.flush();
    };
    const leaving = () => void keep.flush();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leaving);
    };
  }, [keep]);
  // Browser checks follow the keeper (development builds only).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __ssaScanDraft?: unknown }).__ssaScanDraft = { state: keeperState, persistent: keep.persistent, offer: !!offer };
  }, [keeperState, keep, offer]);

  // A reload or a closed tab would lose the photos and the checking done so far: unless the copy on
  // the device is up to date, the browser asks first.
  const safelyKept = !offer && keep.persistent && keeperState === 'saved';
  const precious = worthWarning({ pages, history, text, saved }) && !safelyKept;
  useEffect(() => {
    if (!precious) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [precious]);

  const getOcr = useCallback((): Promise<Ocr> => {
    ocr.current ??= createOcr().catch((e) => {
      ocr.current = null;
      throw e;
    });
    return ocr.current;
  }, []);

  /** Update a page, but only while it still shows the picture the work was done on (a turn or crop since then wins). */
  const update = useCallback((id: string, patch: Partial<Page>, url?: string) => {
    setPages((list) => list.map((p) => (p.id === id && (url === undefined || p.url === url) ? { ...p, ...patch } : p)));
  }, []);

  // ---- the quick look --------------------------------------------------------------------------
  const lookAt = useCallback(
    async (page: Page) => {
      looker.current ??= createLooker(() => (omr.current ??= createOmrWorker()));
      try {
        const gray = await grayOf(page.blob);
        const r = await looker.current.look(gray);
        if (!alive.current) return;
        let cleanUrl: string | undefined;
        const current = () => alive.current && pagesRef.current.some((p) => p.id === page.id && p.url === page.url);
        if (r.clean) {
          const blob = await toBlob(canvasOfGray(r.clean) as AnyCanvas, 'image/png');
          // Turned, cropped or removed meanwhile: that picture is gone, so is its cleaned view.
          if (!current()) return;
          cleanUrl = URL.createObjectURL(blob);
        }
        const tab = r.staves.filter((s) => s.kind === 'tab').length;
        const notation = r.staves.length - tab;
        const words = describeLook({ kind: r.kind, tab, notation, quality: r.quality, skew: r.skew, staffSpace: r.staffSpace, paperCover: r.paperCover, textLines: r.textLines });
        // A PDF page rendered too small or too large for the reader: render it again at the size that suits it.
        const src = pdfs.current.get(page.id);
        if (src && r.staffSpace > 0 && (r.staffSpace < 13 || r.staffSpace > 30)) {
          const scale = pdfScale(src.size, { staffSpaceAt1: r.staffSpace / src.scale });
          if (Math.abs(scale - src.scale) / src.scale > 0.15) {
            const canvas = await src.pdf.render(src.index, scale);
            const pic = await pictureFromCanvas(canvas, 'render');
            pdfs.current.set(page.id, { ...src, scale });
            const next: Page = { ...page, ...pic, kindOf: 'render', look: null };
            releasePicture(page);
            setPages((list) => list.map((p) => (p.id === page.id && p.url === page.url ? next : p)));
            void lookAt(next);
            return;
          }
        }
        update(page.id, {
          cleanUrl,
          look: { kind: r.kind, staves: r.staves, barlines: r.barlines, paper: r.paper, quality: r.quality, skew: r.skew, staffSpace: r.staffSpace, summary: words.summary, advice: words.advice },
        }, page.url);
      } catch (e) {
        if (!alive.current || isAbort(e)) return;
        update(page.id, { look: { kind: 'not-music', staves: [], barlines: [], paper: null, quality: 0, skew: 0, staffSpace: 0, summary: 'This picture could not be looked at.', advice: 'Try another photo.' }, lookError: e instanceof Error ? e.message : String(e) }, page.url);
      }
    },
    [update],
  );

  const addPage = useCallback(
    (page: Page) => {
      setPages((list) => [...list, page]);
      void lookAt(page);
    },
    [lookAt],
  );

  // Pages kept from an earlier visit whose quick look was cut short: look again.
  useEffect(() => {
    for (const p of pagesRef.current) if (!p.look) void lookAt(p);
  }, [lookAt]);

  // ---- adding pages ------------------------------------------------------------------------------
  /** Text pasted or in a text file: straight to the text proofreader. */
  const openText = useCallback(async (raw: string, source: TextState['source'], title?: string) => {
    const t = raw.replace(/\r\n?/g, '\n');
    setPhase('text');
    setError(null);
    try {
      const reading = await importText(t, title);
      setText({ text: t, reading, error: null, source });
    } catch (e) {
      setText({ text: t, reading: null, error: e instanceof Error ? e.message : String(e), source });
    }
  }, []);

  const addPdf = useCallback(
    async (file: File) => {
      const pdf = await openPdf(file);
      const count = Math.min(pdf.pageCount, MAX_PDF_PAGES);
      const base = file.name.replace(/\.pdf$/i, '') || 'PDF';
      for (let i = 0; i < count; i++) {
        if (!alive.current) return;
        setAdding(count > 1 ? `Opening ${base}, page ${i + 1} of ${count}…` : `Opening ${base}…`);
        const size = await pdf.pageSize(i);
        let pdfText: string | undefined;
        try {
          const pieces = await pdf.text(i);
          if (pieces.length >= 4) {
            const t = layoutText(pieces);
            if (['ascii-tab', 'chord-sheet', 'chordpro', 'sixtab'].includes(detectTextFormat(t))) pdfText = t;
          }
        } catch {
          /* no text layer */
        }
        const scale = pdfScale(size);
        const canvas = await pdf.render(i, scale);
        const pic = await pictureFromCanvas(canvas, 'render');
        const id = newId();
        pdfs.current.set(id, { pdf, index: i, scale, size });
        const page: Page = { id, label: count > 1 ? `${base}, page ${i + 1}` : base, origin: 'pdf', ...pic, kindOf: 'render', look: null, ...(pdfText ? { pdfText } : {}) };
        if (pdfText) page.look = { kind: 'text', staves: [], barlines: [], paper: null, quality: 1, skew: 0, staffSpace: 0, summary: 'Typed chords or tab: read straight from the PDF’s text.', advice: null };
        if (pdfText) setPages((list) => [...list, page]);
        else addPage(page);
      }
      if (pdf.pageCount > MAX_PDF_PAGES) setError(`Only the first ${MAX_PDF_PAGES} pages of ${file.name} were added.`);
    },
    [addPage],
  );

  /** Add files (photos, PDFs, text). Returns sentences about files that could not be used. */
  const addFiles = useCallback(
    async (files: File[], origin: PageOrigin = 'photo'): Promise<string[]> => {
      const problems: string[] = [];
      setError(null);
      let n = pagesRef.current.length;
      for (const file of files) {
        try {
          const kind = await sniffFile(file);
          if (kind.kind === 'pdf') {
            await addPdf(file);
          } else if (kind.family === 'image') {
            setAdding(`Adding ${file.name || 'the photo'}…`);
            const pic = await pictureFromFile(file, kind.kind === 'png' ? 'render' : 'photo');
            n++;
            addPage({ id: newId(), label: origin === 'camera' ? `Photo ${n}` : file.name || `Picture ${n}`, origin, ...pic, kindOf: kind.kind === 'png' ? 'render' : 'photo', look: null });
          } else if (kind.kind === 'text') {
            await openText(await readFileText(file), 'paste', file.name.replace(/\.[^.]+$/, ''));
          } else {
            problems.push(`${file.name} is not a photo or a PDF. Guitar Pro, MusicXML and MIDI files go in through Songs, Add a song.`);
          }
        } catch (e) {
          problems.push(e instanceof PdfError ? `${file.name}: ${e.message}` : `${file.name} could not be opened${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
        }
      }
      if (alive.current) setAdding(null);
      return problems;
    },
    [addPage, addPdf, openText],
  );

  /** Add a picture from a URL that ships with the app (the sample sheet). */
  const addSample = useCallback(
    async (url: string, label: string) => {
      setAdding('Opening the sample sheet…');
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const pic = await pictureFromCanvas(canvas, 'render');
        addPage({ id: newId(), label, origin: 'sample', ...pic, kindOf: 'render', look: null });
      } finally {
        if (alive.current) setAdding(null);
      }
    },
    [addPage],
  );

  const removePage = useCallback((id: string) => {
    const page = pagesRef.current.find((p) => p.id === id);
    setPages((list) => list.filter((p) => p.id !== id));
    if (page) removed.current.push(page);
    return page ?? null;
  }, []);

  /** Put a removed page back where it was (undo). */
  const restorePage = useCallback(
    (page: Page, index: number) => {
      removed.current = removed.current.filter((p) => p !== page);
      setPages((list) => {
        const out = list.slice();
        out.splice(Math.min(index, out.length), 0, page);
        return out;
      });
      // Removed before its quick look finished: look again, or Read would wait for it forever.
      if (!page.look) void lookAt(page);
    },
    [lookAt],
  );

  const reorder = useCallback((from: number, to: number) => setPages((list) => movePage(list, from, to)), []);

  const transform = useCallback(
    async (id: string, how: { rotate?: 1 | -1; crop?: BBox; replace?: File }) => {
      const page = pagesRef.current.find((p) => p.id === id);
      if (!page) return;
      setAdding(how.replace ? 'Adding the new photo…' : how.crop ? 'Cropping…' : 'Turning the page…');
      try {
        const pic = how.replace ? await pictureFromFile(how.replace) : how.crop ? await cropPicture(page.blob, how.crop, page.kindOf) : await rotatePicture(page.blob, how.rotate ?? 1, page.kindOf);
        // A changed picture is no longer the PDF page as rendered.
        pdfs.current.delete(id);
        const next: Page = { ...page, ...pic, ...(how.replace ? { kindOf: 'photo' as const, origin: 'camera' as const, pdfText: undefined } : {}), look: null, cleanUrl: undefined, lookError: undefined };
        // The reading being checked may still show the old picture: it goes when that reading does.
        if (!latest.current.readPages.some((r) => r.url === page.url)) releasePicture(page);
        if (page.cleanUrl) URL.revokeObjectURL(page.cleanUrl);
        setPages((list) => list.map((p) => (p.id === id ? next : p)));
        void lookAt(next);
      } finally {
        if (alive.current) setAdding(null);
      }
    },
    [lookAt],
  );

  // ---- reading -----------------------------------------------------------------------------------
  const kind = useMemo(() => sheetKind(pages), [pages]);

  const read = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const list = pagesRef.current;
      if (!list.length) return;
      run.current?.abort();
      const ctl = new AbortController();
      run.current = ctl;
      setPhase('reading');
      setError(null);
      setSaved(null);
      setAiResult(null);
      setProgress({ page: 0, pages: list.length, fraction: 0, message: 'Getting the pages ready', stage: 'music' });
      try {
        const sheet = sheetKind(list);
        if (sheet === 'text' && !opts.force) {
          const textPages = list.filter((p) => p.pdfText || p.look?.kind === 'text');
          const inputs: { gray: GrayImage | null; pdfText?: string }[] = [];
          for (const p of textPages) inputs.push({ gray: p.pdfText ? null : await grayOf(p.blob), ...(p.pdfText ? { pdfText: p.pdfText } : {}) });
          let t: string;
          try {
            t = await readTextPages(inputs, getOcr, { signal: ctl.signal, onProgress: setProgress });
          } catch (e) {
            if (!(e instanceof OcrUnavailableError)) throw e;
            // No OCR here: open the text view empty, saying why; it offers the AI helper or typing.
            setText({ text: '', reading: null, error: `${e.message} You can also type or paste the chords and words yourself.`, source: 'ocr' });
            setPhase('text');
            return;
          }
          if (ctl.signal.aborted) return;
          await openText(t, textPages.every((p) => p.pdfText) ? 'pdf' : 'ocr');
          return;
        }
        const musicPages = opts.force ? list : list.filter((p) => !p.look || ['tab', 'notation', 'both'].includes(p.look.kind));
        const g: GrayImage[] = [];
        for (const p of musicPages) g.push(await grayOf(p.blob));
        grays.current = g;
        omr.current ??= createOmrWorker();
        const d = await readMusic(omr.current, g, { signal: ctl.signal, onProgress: setProgress });
        if (ctl.signal.aborted) return;
        const filled = await fillTexts(d, g, getOcr, { signal: ctl.signal, onProgress: setProgress });
        if (ctl.signal.aborted) return;
        if (!filled.unavailable) await findChordsOverTab(d, g, getOcr, { signal: ctl.signal }).catch((e) => {
          if (isAbort(e)) throw e;
        });
        if (ctl.signal.aborted) return;
        let draft = buildDraft(d);
        if (draft.notationOnly) {
          const r = rearrange(draft, { preferPosition: 1 });
          if (r.ok) draft = r.draft;
        }
        const notes = [...draft.notes];
        if (filled.unavailable) notes.push(`${filled.unavailable} Chord names and the title were found but not read; type them in if you need them.`);
        const skipped = list.length - musicPages.length;
        if (skipped) notes.push(`${skipped} ${skipped === 1 ? 'page has' : 'pages have'} no staff lines and ${skipped === 1 ? 'was' : 'were'} left out.`);
        setDoc(d);
        // Pictures only the previous reading still showed (pages turned or cropped since) can go now.
        const inUse = [...pagesRef.current, ...removed.current, ...musicPages];
        for (const old of latest.current.readPages) if (!inUse.some((p) => p.url === old.url)) releasePicture(old);
        setReadPages(musicPages);
        setSummary(summarizeDocument(d, { limit: 50 }));
        setHistory(startHistory(draft));
        setReadNotes(notes);
        setPhase('music');
      } catch (e) {
        if (isAbort(e) || ctl.signal.aborted) {
          setPhase('pages');
          return;
        }
        setError(e instanceof Error ? e.message : 'The pages could not be read.');
        setPhase('pages');
      } finally {
        if (run.current === ctl) run.current = null;
        if (alive.current) setProgress(null);
      }
    },
    [getOcr, openText],
  );

  const cancel = useCallback(() => {
    run.current?.abort();
    run.current = null;
    setPhase('pages');
    setProgress(null);
  }, []);

  // ---- proofreading ------------------------------------------------------------------------------
  const draft = history?.present ?? null;
  const apply = useCallback((next: Draft) => setHistory((h) => (h ? commit(h, next) : startHistory(next))), []);
  const undo = useCallback(() => setHistory((h) => (h ? undoHistory(h) : h)), []);
  const redo = useCallback(() => setHistory((h) => (h ? redoHistory(h) : h)), []);

  const setTextValue = useCallback(async (value: string) => {
    setText((t) => (t ? { ...t, text: value } : t));
    try {
      const reading = await importText(value);
      setText((t) => (t && t.text === value ? { ...t, reading, error: null } : t));
    } catch (e) {
      setText((t) => (t && t.text === value ? { ...t, reading: null, error: e instanceof Error ? e.message : String(e) } : t));
    }
  }, []);

  // ---- the AI helper -----------------------------------------------------------------------------
  const improveWithAi = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    ai.current?.abort();
    const ctl = new AbortController();
    ai.current = ctl;
    try {
      if (phase === 'text') {
        setAiBusy({ page: 0, pages: 1, fraction: 0, message: 'The AI helper is reading the sheet (this can take a minute)', stage: 'ai' });
        const imgs = pagesRef.current.map((p) => p.blob).slice(0, 4);
        const t = await readTextWithAi(imgs, { signal: ctl.signal });
        await openText(t, 'ai');
        return { ok: true, message: 'The AI helper typed out the sheet. Check it against your picture.' };
      }
      if (!doc || !draft) return { ok: false, message: 'Read the pages first.' };
      // Fuse into a copy, so a failure leaves the reading as it was.
      const copy: OmrDocument = structuredClone(doc);
      // The grey pages are not kept while the learner is away from the screen: decode them again.
      if (grays.current.length !== readPages.length) grays.current = await Promise.all(readPages.map((p) => grayOf(p.blob)));
      const outcome = await improveMusicWithAi(copy, grays.current, { signal: ctl.signal, tuning: draft.song.tuning, onProgress: setAiBusy });
      let next = buildDraft(copy, { title: draft.song.meta.title, bpm: draft.song.tempo[0]?.bpm });
      if (next.notationOnly) {
        const r = rearrange(next, { preferPosition: 1 });
        if (r.ok) next = r.draft;
      }
      setDoc(copy);
      setSummary(summarizeDocument(copy, { limit: 50 }));
      apply(next);
      setAiResult(outcome);
      const words = [`It agreed on ${outcome.agree} ${outcome.agree === 1 ? 'note' : 'notes'}`];
      if (outcome.changed) words.push(`settled ${outcome.changed} doubtful ${outcome.changed === 1 ? 'one' : 'ones'}`);
      if (outcome.added) words.push(`suggested ${outcome.added} the picture reader missed (marked to check)`);
      return { ok: true, message: `${words.join(', ')}.` };
    } catch (e) {
      if (isAbort(e)) return { ok: false, message: 'Stopped. Your reading is unchanged.' };
      return { ok: false, message: aiErrorMessage(e) };
    } finally {
      if (ai.current === ctl) ai.current = null;
      if (alive.current) setAiBusy(null);
    }
  }, [apply, doc, draft, openText, phase, readPages]);

  const stopAi = useCallback(() => ai.current?.abort(), []);

  // ---- saving ------------------------------------------------------------------------------------
  const save = useCallback(async (song: Song, info: { warnings: string[]; confidence?: number; estimatedRhythm?: boolean; format?: TextReading['format'] }): Promise<Saved> => {
    const lib = getLibrary();
    const fileName = pagesRef.current[0]?.origin === 'pdf' ? pagesRef.current[0].label : undefined;
    const listing = await lib.save(song, {
      origin: { kind: 'scan', ...(info.format ? { format: info.format } : {}), ...(fileName ? { fileName } : {}) },
      warnings: info.warnings.map((message) => ({ message })),
      ...(info.confidence !== undefined ? { confidence: info.confidence } : {}),
      ...(info.estimatedRhythm ? { estimatedRhythm: true } : {}),
    });
    const result = recordActivity({ kind: 'scan', title: listing.title, route: 'play', params: [listing.id] });
    const s: Saved = { listing, warnings: info.warnings, xp: result.xp };
    setSaved(s);
    return s;
  }, []);

  const saveDraft = useCallback(async (): Promise<Saved> => {
    if (!draft) throw new Error('Nothing to save yet.');
    const { song, warnings } = songToSave(draft);
    const marks = draft.marks.flatMap((b) => b.beats.flatMap((x) => x.notes));
    const confidence = marks.length ? marks.reduce((s, m) => s + (m.checked ? 1 : m.confidence), 0) / marks.length : 0;
    return save(song, { warnings: [...warnings, ...readNotes.filter((n) => /estimated/.test(n))], confidence: Math.round(confidence * 100) / 100, estimatedRhythm: draft.marks.some((b) => b.estimated) });
  }, [draft, readNotes, save]);

  const saveText = useCallback(async (): Promise<Saved> => {
    const r = text?.reading;
    if (!r) throw new Error('Nothing to save yet.');
    return save(r.result.song, { warnings: r.result.warnings.map((w) => w.message), confidence: r.result.confidence, estimatedRhythm: !!r.result.estimatedRhythm, format: r.format });
  }, [save, text]);

  // ---- an unsaved scan from an earlier visit ---------------------------------------------------------
  /** Take the offered scan back: its pages, the reading with its recent undo steps, where the learner was. */
  const resumeKept = useCallback(() => {
    const o = offer;
    if (!o) return;
    const { snapshot, pictures, doc: d, history: h } = o.loaded;
    run.current?.abort();
    release([...pagesRef.current, ...removed.current, ...latest.current.readPages]);
    removed.current = [];
    for (const { pdf } of pdfs.current.values()) pdf.close();
    pdfs.current.clear();
    grays.current = [];
    // One page object per picture, so the reading and the tray share it (as they do before a reload).
    const byPic = new Map<string, Page>();
    const toPage = (kp: KeptPage): Page => {
      const known = byPic.get(kp.pic);
      if (known) return known;
      const blob = pictures.get(kp.pic) as Blob;
      const thumbBlob = kp.thumb ? pictures.get(kp.thumb) : undefined;
      const url = URL.createObjectURL(blob);
      const page: Page = {
        id: kp.id, label: kp.label, origin: kp.origin, kindOf: kp.kindOf, width: kp.width, height: kp.height, look: kp.look, blob, url,
        thumbUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : url,
        ...(thumbBlob ? { thumbBlob } : {}),
        ...(kp.pdfText ? { pdfText: kp.pdfText } : {}),
      };
      byPic.set(kp.pic, page);
      return page;
    };
    const nextPages = snapshot.pages.map(toPage);
    const nextRead = snapshot.readPages.map(toPage);
    keep.adopt(pictures);
    setPages(nextPages);
    setReadPages(nextRead);
    setDoc(d);
    setSummary(d ? summarizeDocument(d, { limit: 50 }) : null);
    setHistory(h);
    setReadNotes(snapshot.readNotes);
    setText(snapshot.text);
    setAiResult(snapshot.aiResult);
    setSaved(null);
    setError(null);
    setOffer(null);
    setPhase(snapshot.phase === 'music' && h ? 'music' : snapshot.phase === 'text' && snapshot.text ? 'text' : 'pages');
    // A fresh quick look brings back the cleaned view (the reading itself is kept as it was).
    for (const p of nextPages) if (!p.pdfText) void lookAt(p);
  }, [offer, keep, lookAt]);

  /** Let the offered scan go (returns it, for Undo). */
  const discardKept = useCallback((): ResumeOffer | null => {
    const o = offer;
    if (!o) return null;
    setOffer(null);
    void keep.clear();
    return o;
  }, [offer, keep]);

  /** Undo of `discardKept`: the scan is kept and offered again. */
  const restoreKept = useCallback(
    (o: ResumeOffer) => {
      void keep.restore(o.loaded);
      setOffer(o);
    },
    [keep],
  );

  /** Start again with no pages. */
  const reset = useCallback(() => {
    void keep.clear();
    run.current?.abort();
    ai.current?.abort();
    release([...pagesRef.current, ...removed.current, ...latest.current.readPages]);
    removed.current = [];
    for (const { pdf } of pdfs.current.values()) pdf.close();
    pdfs.current.clear();
    grays.current = [];
    setPages([]);
    setReadPages([]);
    setDoc(null);
    setSummary(null);
    setHistory(null);
    setText(null);
    setSaved(null);
    setAiResult(null);
    setReadNotes([]);
    setError(null);
    setPhase('pages');
  }, [keep]);

  return {
    offer, resumeKept, discardKept, restoreKept, keeperState,
    pages, readPages, adding, phase, setPhase, progress, error, setError, kind, doc, summary, draft, history, readNotes, text, aiBusy, aiResult, saved,
    addFiles, addSample, openText, removePage, restorePage, reorder, transform, read, cancel,
    apply, undo, redo, setTextValue, improveWithAi, stopAi, saveDraft, saveText, reset,
    kindLabel,
  };
}

/** What `useScan` gives. */
export type ScanState = ReturnType<typeof useScan>;

/** Words for a library error. */
export function saveErrorMessage(e: unknown): string {
  return isLibraryError(e) ? e.message : e instanceof Error ? e.message : 'The song could not be saved.';
}
