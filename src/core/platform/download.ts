/**
 * Handing things back to the learner: save a file, copy text, share, print.
 *
 * Inside a Claude artifact a page may not download or print by itself; a file can only be offered
 * through the viewer's `downloads` capability (the viewer confirms each save, and only some file
 * types are allowed). In the standalone app a temporary object-URL link is clicked instead.
 * Features call these helpers and never touch `<a download>`, the clipboard or `window.print`.
 */
import { claudeCapability, host as currentHost, type Host } from './env';

// ---------------------------------------------------------------------------------------------
// Saving files
// ---------------------------------------------------------------------------------------------

/** What can be saved. */
export type SaveData = string | Blob | ArrayBuffer | ArrayBufferView;

/** Why a save did not happen. */
export type SaveFailure =
  | 'declined' // the learner said no to the viewer's confirmation
  | 'unsupported-type' // the viewer does not allow this file extension
  | 'too-large' // the file is over a size limit of the viewer
  | 'busy' // another save prompt is still open; try again shortly
  | 'unavailable' // files cannot be saved in this view at all
  | 'failed'; // anything else

/** Result of `saveFile`. `ok` means the file was handed to the browser or the viewer's save dialog. */
export type SaveResult = { ok: true; via: 'viewer' | 'browser' } | { ok: false; reason: SaveFailure; message: string };

/**
 * File extensions the artifact viewer's `downloads` capability accepts. Anything else (`.mid`,
 * `.musicxml`, `.gp`, `.wav` ...) can only be saved from the standalone app.
 */
export const VIEWER_SAVE_EXTENSIONS: readonly string[] = [
  'gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'txt', 'json', 'md',
  'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip', 'fig',
];

const SAVE_MESSAGES: Record<SaveFailure, string> = {
  declined: 'Nothing was saved.',
  'unsupported-type': 'This kind of file cannot be saved from inside Claude. Open the app from its own address to save it.',
  'too-large': 'That file is too large to save from here.',
  busy: 'Another save is still waiting for your answer. Finish that one, then try again.',
  unavailable: 'Files cannot be saved in this view. Open the app from its own address to save files.',
  failed: 'The file could not be saved. Try again.',
};

interface DownloadsCapability {
  save(request: { filename: string; data: SaveData }): Promise<{ status: 'saved' | 'delivered' }>;
}

/** What the service needs from its surroundings; tests swap these for fakes. */
export interface DownloadDeps {
  host: () => Host;
  capability: <T>(name: string) => Promise<T | null>;
  /** True when the page runs inside another page's frame. */
  framed: () => boolean;
}

function isFramed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; // a cross-origin parent refuses the comparison: that is a frame
  }
}

const defaultDeps: DownloadDeps = { host: currentHost, capability: claudeCapability, framed: isFramed };

function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return match ? match[1].toLowerCase() : '';
}

/** Make a name safe for every file system: no path separators or control characters, sane length. */
export function safeFilename(name: string, fallback = 'sixstring-academy'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ +\.(?=[A-Za-z0-9]+$)/, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!cleaned) return fallback;
  if (cleaned.length <= 120) return cleaned;
  const ext = extensionOf(cleaned);
  return ext ? `${cleaned.slice(0, 119 - ext.length).trimEnd()}.${ext}` : cleaned.slice(0, 120);
}

function failure(reason: SaveFailure, message?: string): SaveResult {
  return { ok: false, reason, message: message ?? SAVE_MESSAGES[reason] };
}

/** Map a rejection of the viewer's `downloads.save` (`{ code, message }`) to a failure reason. */
export function mapDownloadsError(rejection: unknown): SaveFailure {
  const code = (typeof rejection === 'object' && rejection !== null ? (rejection as { code?: unknown }).code : undefined) ?? '';
  switch (code) {
    case 'declined':
      return 'declined';
    case 'rejected_extension':
    case 'extension_not_enabled':
      return 'unsupported-type';
    case 'too_large':
      return 'too-large';
    case 'rate_limited':
      return 'busy';
    case 'bad_request':
    case 'transform_error':
    case 'request_unknown':
    case 'not_signed':
      return 'failed';
    default:
      // unavailable, not_granted, capability_disabled, capability_removed, and anything unknown
      return 'unavailable';
  }
}

function toBlob(data: SaveData, mimeType: string): Blob {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.type === mimeType || !mimeType ? data : new Blob([data], { type: mimeType });
  return new Blob([data as BlobPart], mimeType ? { type: mimeType } : undefined);
}

function saveWithAnchor(filename: string, blob: Blob): SaveResult {
  if (typeof document === 'undefined' || !document.body || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return failure('unavailable');
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    URL.revokeObjectURL(url);
    return failure('failed');
  }
  // The download reads the URL after the click returns; give it time before letting go.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true, via: 'browser' };
}

/**
 * True when a file with this name can be saved in the current view. Use it to hide export
 * formats that cannot leave the artifact viewer (MIDI, MusicXML, Guitar Pro) before offering them.
 */
export async function canSaveFile(filename: string, deps: DownloadDeps = defaultDeps): Promise<boolean> {
  if (deps.host() === 'artifact') {
    const downloads = await deps.capability<DownloadsCapability>('downloads');
    if (downloads) return VIEWER_SAVE_EXTENSIONS.includes(extensionOf(filename));
    if (deps.framed()) return false;
  }
  return typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/**
 * Save a generated file. Inside a Claude artifact the viewer asks the learner to confirm (so call
 * this from a click, and expect `declined`); elsewhere the browser downloads it. Never throws:
 * the result says what happened and carries a sentence that can be shown as is.
 */
export async function saveFile(filename: string, data: SaveData, mimeType = '', deps: DownloadDeps = defaultDeps): Promise<SaveResult> {
  const name = safeFilename(filename);
  const empty = typeof data === 'string' ? data.length === 0 : (data instanceof Blob ? data.size : data.byteLength) === 0;
  if (empty) return failure('failed', 'There is nothing to save yet.');

  if (deps.host() === 'artifact') {
    const downloads = await deps.capability<DownloadsCapability>('downloads');
    if (downloads && typeof downloads.save === 'function') {
      if (!VIEWER_SAVE_EXTENSIONS.includes(extensionOf(name))) return failure('unsupported-type');
      try {
        // A string is sent as UTF-8 text. Everything else goes as a Blob: the viewer takes over
        // an ArrayBuffer it is given (the caller's copy would be emptied), but only reads a Blob.
        await downloads.save({ filename: name, data: typeof data === 'string' ? data : toBlob(data, mimeType) });
        return { ok: true, via: 'viewer' };
      } catch (rejection) {
        return failure(mapDownloadsError(rejection));
      }
    }
    // Framed by the viewer without the capability: a plain download would be blocked silently.
    if (deps.framed()) return failure('unavailable');
  }
  return saveWithAnchor(name, toBlob(data, mimeType || (typeof data === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream')));
}

// ---------------------------------------------------------------------------------------------
// Clipboard and sharing
// ---------------------------------------------------------------------------------------------

function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  area.style.opacity = '0';
  const previous = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);
  let copied = false;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  try {
    previous?.focus?.();
  } catch {
    /* the previous element is gone */
  }
  return copied;
}

/**
 * Copy text to the clipboard. Resolves true when it worked. Tries the async clipboard API and
 * falls back to a hidden selection (which works in frames that are refused clipboard access).
 * Call it from a click or key handler.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission refused or not focused: try the old way */
  }
  return copyWithSelection(text);
}

/** What to share. `text` (or `url`) is also what gets copied when sharing is not possible. */
export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

/** Result of `shareOrCopy`. */
export type ShareResult =
  | { ok: true; via: 'share' | 'copy' }
  | { ok: false; reason: 'cancelled' | 'unavailable' };

/**
 * Open the system share sheet where the browser has one; otherwise (or when the browser refuses)
 * copy the text and link to the clipboard. Dismissing the share sheet is reported as `cancelled`
 * and copies nothing. Call it from a click or key handler.
 */
export async function shareOrCopy(content: ShareContent): Promise<ShareResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && typeof nav.share === 'function') {
    const payload: ShareData = {};
    if (content.title) payload.title = content.title;
    if (content.text) payload.text = content.text;
    if (content.url) payload.url = content.url;
    if (content.files?.length) {
      let filesOk = false;
      try {
        filesOk = typeof nav.canShare === 'function' && nav.canShare({ files: content.files });
      } catch {
        filesOk = false;
      }
      if (filesOk) payload.files = content.files;
    }
    let shareable = Object.keys(payload).length > 0;
    try {
      if (shareable && typeof nav.canShare === 'function') shareable = nav.canShare(payload);
    } catch {
      shareable = false;
    }
    if (shareable) {
      try {
        await nav.share(payload);
        return { ok: true, via: 'share' };
      } catch (err) {
        // AbortError: the learner closed the sheet. Anything else (blocked in a frame, no user
        // gesture, nothing to share with) falls through to the clipboard.
        if ((err as { name?: string })?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
      }
    }
  }
  const fallback = [content.text, content.url].filter((part): part is string => !!part).join('\n');
  if (fallback && (await copyText(fallback))) return { ok: true, via: 'copy' };
  return { ok: false, reason: 'unavailable' };
}

// ---------------------------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------------------------

/** True when the page may open the print dialog (never inside the artifact viewer). */
export function canPrint(deps: Pick<DownloadDeps, 'host' | 'framed'> = defaultDeps): boolean {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false;
  return !(deps.host() === 'artifact' && deps.framed());
}

/** Open the browser's print dialog. Returns false (and does nothing) where printing is not possible. */
export function printPage(deps: Pick<DownloadDeps, 'host' | 'framed'> = defaultDeps): boolean {
  if (!canPrint(deps)) return false;
  try {
    window.print();
    return true;
  } catch {
    return false;
  }
}
