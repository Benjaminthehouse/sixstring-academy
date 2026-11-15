/**
 * Getting files into the app: the file picker, paste, drag-and-drop, readers, and working out
 * what a file really is from its first bytes (file names and MIME types lie, especially on phones).
 *
 * Nothing here touches the network. Everything that needs the DOM checks for it first, so the
 * pure helpers (`sniffBytes`, `decodeText`, `exifOrientation`, `matchesAccept`) run anywhere.
 */

// ---------------------------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------------------------

/** Options of `pickFile`. */
export interface PickFileOptions {
  /** What the picker offers: `'image/*'`, `'.pdf'`, a comma list, or an array of those. */
  accept?: string | readonly string[];
  /** Allow more than one file. */
  multiple?: boolean;
  /** Open the phone camera instead of the gallery: rear (`'environment'`, also `true`) or front (`'user'`). */
  capture?: boolean | 'environment' | 'user';
}

/** How long after the window regains focus an old browser's picker counts as dismissed. */
const PICK_FOCUS_FALLBACK_MS = 10_000;

function acceptString(accept: string | readonly string[] | undefined): string {
  if (!accept) return '';
  return (typeof accept === 'string' ? accept.split(',') : [...accept])
    .map((token) => token.trim())
    .filter(Boolean)
    .join(',');
}

/**
 * Open the system file picker and resolve with the chosen files (an empty array when the picker
 * is dismissed). **Call it straight from a click or key handler**: browsers only open the picker
 * during a user gesture. Uses a transient hidden `<input type="file">` that is removed afterwards.
 * Do not show a busy state while waiting: on browsers from before 2023 a dismissed picker is only
 * noticed after about ten seconds.
 */
export function pickFile(options: PickFileOptions = {}): Promise<File[]> {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve([]);
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    const accept = acceptString(options.accept);
    if (accept) input.accept = accept;
    if (options.multiple) input.multiple = true;
    if (options.capture) input.setAttribute('capture', options.capture === true ? 'environment' : options.capture);
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    // Off-screen rather than display:none: some mobile browsers ignore clicks on undisplayed inputs.
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (files: File[]): void => {
      if (settled) return;
      settled = true;
      if (focusTimer !== undefined) clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(files);
    };
    // Browsers from before 2023 have no `cancel` event. There, getting the window focus back
    // without a file means the picker was dismissed. The wait is long on purpose: a phone can
    // take several seconds to hand over a photo it has just taken, and resolving early would
    // throw that photo away.
    const onFocus = (): void => {
      if (focusTimer !== undefined) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => finish(input.files ? Array.from(input.files) : []), PICK_FOCUS_FALLBACK_MS);
    };
    input.addEventListener('change', () => finish(input.files ? Array.from(input.files) : []));
    input.addEventListener('cancel', () => finish([]));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    try {
      input.click();
    } catch {
      finish([]);
    }
  });
}

/** `pickFile` for a single file: the file, or null when the picker is dismissed. */
export async function pickOneFile(options: Omit<PickFileOptions, 'multiple'> = {}): Promise<File | null> {
  const files = await pickFile({ ...options, multiple: false });
  return files[0] ?? null;
}

/**
 * True when a file fits an `accept` list (`.pdf`, `image/*`, `audio/midi`). An empty list accepts
 * everything. Extensions and MIME types are compared without regard to case.
 */
export function matchesAccept(file: { name?: string; type?: string }, accept: string | readonly string[] | undefined): boolean {
  const tokens = acceptString(accept).toLowerCase().split(',').filter(Boolean);
  if (tokens.length === 0) return true;
  const name = (file.name ?? '').toLowerCase();
  const type = (file.type ?? '').toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

// ---------------------------------------------------------------------------------------------
// Paste and drag-and-drop
// ---------------------------------------------------------------------------------------------

/** The files carried by a paste or drop, optionally narrowed by an `accept` list. */
export function filesFromDataTransfer(transfer: DataTransfer | null | undefined, accept?: string | readonly string[]): File[] {
  if (!transfer) return [];
  const out: File[] = [];
  const seen = new Set<File>();
  const add = (file: File | null): void => {
    if (file && !seen.has(file) && matchesAccept(file, accept)) {
      seen.add(file);
      out.push(file);
    }
  };
  // `files` is empty for a pasted screenshot in some browsers; `items` has it.
  if (transfer.files) for (const file of Array.from(transfer.files)) add(file);
  if (out.length === 0 && transfer.items) {
    for (const item of Array.from(transfer.items)) if (item.kind === 'file') add(item.getAsFile());
  }
  return out;
}

/**
 * Call `handler` with the images of every paste that carries one (a screenshot, a copied photo).
 * Pastes without an image are left alone, so typing into text fields keeps working. Returns the
 * function that stops listening.
 */
export function onPasteImage(handler: (images: File[]) => void, target?: Document | HTMLElement): () => void {
  const node = target ?? (typeof document !== 'undefined' ? document : null);
  if (!node) return () => undefined;
  const listener = (event: Event): void => {
    const images = filesFromDataTransfer((event as ClipboardEvent).clipboardData, 'image/*');
    if (images.length === 0) return;
    event.preventDefault();
    handler(images);
  };
  node.addEventListener('paste', listener);
  return () => node.removeEventListener('paste', listener);
}

/** Options of `attachDropZone`. */
export interface DropZoneOptions {
  /** Files that do not fit are reported as `rejected`. */
  accept?: string | readonly string[];
  /** Default true. With false only the first accepted file is kept. */
  multiple?: boolean;
  /** Called when files are dropped. `rejected` holds those that did not fit `accept`. */
  onFiles: (files: File[], rejected: File[]) => void;
  /** Called with true while files hover over the zone, false when they leave or drop. */
  onHover?: (active: boolean) => void;
}

/**
 * Make an element accept dropped files. Only drags that carry files react (dragging text or a
 * link across the zone does nothing). Returns the function that detaches the listeners.
 */
export function attachDropZone(element: HTMLElement, options: DropZoneOptions): () => void {
  let depth = 0;
  const carriesFiles = (event: DragEvent): boolean => {
    const types = event.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  };
  const hover = (active: boolean): void => options.onHover?.(active);

  const onEnter = (event: DragEvent): void => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth += 1;
    if (depth === 1) hover(true);
  };
  const onOver = (event: DragEvent): void => {
    if (!carriesFiles(event)) return;
    // Without this the browser refuses the drop and opens the file instead.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };
  const onLeave = (event: DragEvent): void => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) hover(false);
  };
  const onDrop = (event: DragEvent): void => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    hover(false);
    const all = filesFromDataTransfer(event.dataTransfer);
    let accepted = all.filter((file) => matchesAccept(file, options.accept));
    const rejected = all.filter((file) => !accepted.includes(file));
    if (options.multiple === false) accepted = accepted.slice(0, 1);
    if (accepted.length > 0 || rejected.length > 0) options.onFiles(accepted, rejected);
  };

  element.addEventListener('dragenter', onEnter);
  element.addEventListener('dragover', onOver);
  element.addEventListener('dragleave', onLeave);
  element.addEventListener('drop', onDrop);
  return () => {
    element.removeEventListener('dragenter', onEnter);
    element.removeEventListener('dragover', onOver);
    element.removeEventListener('dragleave', onLeave);
    element.removeEventListener('drop', onDrop);
    if (depth > 0) hover(false);
    depth = 0;
  };
}

// ---------------------------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------------------------

function withReader<T>(blob: Blob, start: (reader: FileReader) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    start(reader);
  });
}

/** The whole file as an ArrayBuffer. */
export function readFileArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return withReader<ArrayBuffer>(blob, (reader) => reader.readAsArrayBuffer(blob));
}

/** The whole file as bytes. */
export async function readFileBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await readFileArrayBuffer(blob));
}

/**
 * Text bytes to a string. Honours a UTF-8 or UTF-16 byte-order mark, reads everything else as
 * UTF-8, and falls back to Windows-1252 when the bytes are not valid UTF-8 (old tab files).
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

/** The whole file as text (see `decodeText` for the encodings understood). */
export async function readFileText(blob: Blob): Promise<string> {
  return decodeText(await readFileBytes(blob));
}

/** The whole file as a `data:` URL (base64). */
export async function readFileDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') return withReader<string>(blob, (reader) => reader.readAsDataURL(blob));
  return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(await readFileBytes(blob))}`;
}

/** Bytes to base64 without blowing the call stack on large inputs. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step) as unknown as number[]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------------------------
// Images, with EXIF orientation respected
// ---------------------------------------------------------------------------------------------

/** What `jpegInfo` finds in a JPEG's headers. */
export interface JpegInfo {
  /** Stored pixel size, before any EXIF rotation. Zero when no frame header was found. */
  width: number;
  height: number;
  /** EXIF orientation 1 to 8, or null when the file has no EXIF orientation tag. */
  orientation: number | null;
  /** True when the file carries an EXIF block at all (camera data, possibly a location). */
  hasExif: boolean;
}

function exifOrientationFromTiff(bytes: Uint8Array, start: number, end: number): number | null {
  if (end - start < 14) return null;
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (o: number): number => (little ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
  const u32 = (o: number): number =>
    little
      ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
      : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  if (u16(start + 2) !== 42) return null;
  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/**
 * Read a JPEG's stored size and EXIF orientation from its first bytes (the first 256 KiB are
 * plenty). Returns null when the bytes are not a JPEG.
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const info: JpegInfo = { width: 0, height: 0, orientation: null, hasExif: false };
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan: headers are over
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) break;
    const body = offset + 4;
    const end = Math.min(bytes.length, offset + 2 + length);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame && body + 5 <= bytes.length) {
      info.height = (bytes[body + 1] << 8) | bytes[body + 2];
      info.width = (bytes[body + 3] << 8) | bytes[body + 4];
    } else if (
      marker === 0xe1 &&
      body + 6 <= end &&
      bytes[body] === 0x45 && // "Exif\0\0"
      bytes[body + 1] === 0x78 &&
      bytes[body + 2] === 0x69 &&
      bytes[body + 3] === 0x66 &&
      bytes[body + 4] === 0 &&
      bytes[body + 5] === 0
    ) {
      info.hasExif = true;
      if (info.orientation === null) info.orientation = exifOrientationFromTiff(bytes, body + 6, end);
    }
    offset += 2 + length;
  }
  return info;
}

/** EXIF orientation (1 to 8) of a JPEG, or 1 when there is none or the bytes are not a JPEG. */
export function exifOrientation(bytes: Uint8Array): number {
  return jpegInfo(bytes)?.orientation ?? 1;
}

/**
 * The canvas transform `[a, b, c, d, e, f]` that draws a `width` x `height` image upright for an
 * EXIF orientation, and the size of the upright result.
 */
export function orientationTransform(
  orientation: number,
  width: number,
  height: number,
): { matrix: [number, number, number, number, number, number]; width: number; height: number } {
  switch (orientation) {
    case 2:
      return { matrix: [-1, 0, 0, 1, width, 0], width, height };
    case 3:
      return { matrix: [-1, 0, 0, -1, width, height], width, height };
    case 4:
      return { matrix: [1, 0, 0, -1, 0, height], width, height };
    case 5:
      return { matrix: [0, 1, 1, 0, 0, 0], width: height, height: width };
    case 6:
      return { matrix: [0, 1, -1, 0, height, 0], width: height, height: width };
    case 7:
      return { matrix: [0, -1, -1, 0, height, width], width: height, height: width };
    case 8:
      return { matrix: [0, -1, 1, 0, 0, width], width: height, height: width };
    default:
      return { matrix: [1, 0, 0, 1, 0, 0], width, height };
  }
}

/** A decoded image that is upright (EXIF orientation applied) and ready to draw. */
export interface LoadedImage {
  /** Pass to `drawImage`. */
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;
  /** Upright pixel size. */
  width: number;
  height: number;
  /** Free the decoded pixels. Call it when you are done drawing. */
  release(): void;
}

/** A 2D canvas of the given size: off-screen when the browser has it, otherwise a detached element. */
export function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined') throw new Error('No canvas is available here.');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('The browser could not create a drawing surface.');
  return ctx;
}

async function decodeUpright(blob: Blob): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; release(): void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* an engine without the option, or a format it cannot decode this way: try an <img> */
    }
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot open that image.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('That image could not be opened. It may be damaged or in a format this browser does not support.'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Decode an image file so it can be drawn, **upright**: a phone photo taken sideways comes out
 * the way the camera showed it. Current browsers apply the EXIF orientation themselves; for the
 * ones that do not, the rotation is applied here. Rejects with a readable message when the file
 * is not an image the browser can open (HEIC on most desktop browsers, for instance).
 */
export async function loadImage(blob: Blob): Promise<LoadedImage> {
  const decoded = await decodeUpright(blob);
  let info: JpegInfo | null = null;
  try {
    info = jpegInfo(await readFileBytes(blob.slice(0, 262144)));
  } catch {
    info = null;
  }
  const orientation = info?.orientation ?? 1;
  // Orientations 5 to 8 swap width and height. If the decoded size still matches the stored size
  // of a non-square photo, the engine ignored the tag and the rotation is ours to do.
  const ignored =
    info !== null && orientation >= 5 && info.width !== info.height && decoded.width === info.width && decoded.height === info.height;
  if (!ignored) return decoded;
  try {
    const upright = orientationTransform(orientation, decoded.width, decoded.height);
    const canvas = createCanvas(upright.width, upright.height);
    const ctx = context2d(canvas);
    ctx.setTransform(...upright.matrix);
    ctx.drawImage(decoded.source, 0, 0);
    decoded.release();
    return {
      source: canvas,
      width: upright.width,
      height: upright.height,
      release: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  } catch {
    return decoded;
  }
}

// ---------------------------------------------------------------------------------------------
// Type sniffing
// ---------------------------------------------------------------------------------------------

/** What a file is, judged by its content. */
export type FileKind =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'heic'
  | 'midi'
  | 'musicxml' // uncompressed MusicXML (.musicxml / .xml)
  | 'mxl' // compressed MusicXML (a zip)
  | 'gp' // Guitar Pro, any generation (see `detail`)
  | 'zip' // some other zip archive
  | 'xml' // XML that is not MusicXML
  | 'text'
  | 'unknown';

/** Broad group of a `FileKind`, for routing a file to the right importer. */
export type FileFamily = 'image' | 'document' | 'score' | 'archive' | 'text' | 'unknown';

/** Result of `sniffBytes` / `sniffFile`. */
export interface SniffResult {
  kind: FileKind;
  family: FileFamily;
  /** The MIME type that goes with the detected kind (not the one the browser reported). */
  mime: string;
  /** Guitar Pro generation: `gp3`, `gp4`, `gp5`, `gpx` (version 6) or `gp7` (the zip-based .gp). */
  detail?: string;
}

const KIND_INFO: Record<FileKind, { family: FileFamily; mime: string }> = {
  pdf: { family: 'document', mime: 'application/pdf' },
  png: { family: 'image', mime: 'image/png' },
  jpeg: { family: 'image', mime: 'image/jpeg' },
  gif: { family: 'image', mime: 'image/gif' },
  webp: { family: 'image', mime: 'image/webp' },
  heic: { family: 'image', mime: 'image/heic' },
  midi: { family: 'score', mime: 'audio/midi' },
  musicxml: { family: 'score', mime: 'application/vnd.recordare.musicxml+xml' },
  mxl: { family: 'score', mime: 'application/vnd.recordare.musicxml' },
  gp: { family: 'score', mime: 'application/x-guitar-pro' },
  zip: { family: 'archive', mime: 'application/zip' },
  xml: { family: 'text', mime: 'application/xml' },
  text: { family: 'text', mime: 'text/plain' },
  unknown: { family: 'unknown', mime: 'application/octet-stream' },
};

function result(kind: FileKind, detail?: string): SniffResult {
  const out: SniffResult = { kind, ...KIND_INFO[kind] };
  if (detail) out.detail = detail;
  return out;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  for (let i = 0; i < signature.length; i++) if (bytes[at + i] !== signature[i]) return false;
  return true;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function indexOfAscii(bytes: Uint8Array, text: string, limit: number): number {
  const end = Math.min(bytes.length, limit) - text.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < text.length; j++) if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

/** Entry names found in the local file headers of a zip, as far as the given bytes reach. */
function zipEntryNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  const isLocalHeader = (at: number): boolean => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04], at);
  let offset = isLocalHeader(0) ? 0 : -1;
  while (offset >= 0 && offset + 30 <= bytes.length && names.length < 64) {
    const compressed = (bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24)) >>> 0;
    const nameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    names.push(ascii(bytes, offset + 30, nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const next = dataStart + compressed;
    if (isLocalHeader(next)) {
      offset = next;
      continue;
    }
    // Entries written with a data descriptor announce a size of zero: hunt for the next header.
    offset = -1;
    for (let i = dataStart; i + 4 <= bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
        offset = i;
        break;
      }
    }
  }
  return names;
}

function extensionOf(name: string | undefined): string {
  const match = /\.([a-z0-9]+)$/i.exec(name ?? '');
  return match ? match[1].toLowerCase() : '';
}

function sniffZip(bytes: Uint8Array, name: string | undefined): SniffResult {
  const names = zipEntryNames(bytes);
  const lower = names.map((n) => n.toLowerCase());
  if (lower.some((n) => n.endsWith('score.gpif')) || (lower.includes('version') && lower.some((n) => n.startsWith('content/')))) {
    return result('gp', 'gp7');
  }
  // A compressed MusicXML file announces itself with a `mimetype` entry and always has a container.
  const mimetypeAt = indexOfAscii(bytes, 'application/vnd.recordare.musicxml', 512);
  if (mimetypeAt >= 0 || lower.includes('meta-inf/container.xml') || lower.some((n) => n.endsWith('.musicxml'))) {
    // Office and EPUB files have a container too; they are told apart by their own marker entries.
    const office = lower.some((n) => n.startsWith('word/') || n.startsWith('xl/') || n.startsWith('ppt/') || n === '[content_types].xml');
    const epub = indexOfAscii(bytes, 'application/epub+zip', 512) >= 0;
    if (!office && !epub) return result('mxl');
  }
  const ext = extensionOf(name);
  if (ext === 'mxl') return result('mxl');
  if (ext === 'gp') return result('gp', 'gp7');
  return result('zip');
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c && byte !== 0x1b) control += 1;
  }
  return control <= sample.length * 0.02;
}

/**
 * Work out what a file is from its bytes (64 KiB from the start are enough). The optional file
 * name only breaks ties the content cannot settle (an unlabelled zip called `song.gp`).
 */
export function sniffBytes(bytes: Uint8Array, name?: string): SniffResult {
  if (bytes.length === 0) return result('unknown');

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return result('png');
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return result('jpeg');
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return result('gif');
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return result('webp');
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'RMID') return result('midi');
  if (ascii(bytes, 0, 4) === 'MThd') return result('midi');
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return result('heic');
  }
  // A PDF may start with a little junk before its header.
  if (indexOfAscii(bytes, '%PDF-', 1024) >= 0) return result('pdf');

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    return sniffZip(bytes, name);
  }

  // Guitar Pro 6 containers, and the versioned header of Guitar Pro 3 to 5.
  const magic = ascii(bytes, 0, 4);
  if (magic === 'BCFZ' || magic === 'BCFS') return result('gp', 'gpx');
  const header = ascii(bytes, 1, 30);
  if (header.startsWith('FICHIER GUITAR PRO') || header.startsWith('FICHIER GUITARE PRO')) {
    const version = /v(\d)/.exec(header);
    return result('gp', version ? `gp${version[1]}` : undefined);
  }

  // UTF-16 text is full of zero bytes, so it is recognised by its byte-order mark instead.
  const utf16 = startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff]);
  if (utf16 || looksLikeText(bytes)) {
    const head = decodeText(bytes.subarray(0, Math.min(bytes.length, 8192))).replace(/^\s+/, '');
    if (head.startsWith('<')) {
      if (/<score-(partwise|timewise)[\s>]/.test(head) || /<!DOCTYPE\s+score-(partwise|timewise)/i.test(head)) return result('musicxml');
      if (head.startsWith('<?xml') || /^<[A-Za-z_!]/.test(head)) {
        // The root element may sit beyond the sampled head; trust a MusicXML file name then.
        return result(extensionOf(name) === 'musicxml' ? 'musicxml' : 'xml');
      }
    }
    return result('text');
  }
  return result('unknown');
}

/** `sniffBytes` for a File or Blob: reads only the first 64 KiB. */
export async function sniffFile(file: Blob & { name?: string }): Promise<SniffResult> {
  const head = await readFileBytes(file.slice(0, 65536));
  return sniffBytes(head, file.name);
}
