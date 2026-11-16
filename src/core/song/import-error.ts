/**
 * Importer refusals in words for the learner. Every importer throws a `SongImportError` (a
 * RangeError, so older `catch (e instanceof RangeError)` code keeps working): `message` says what
 * happened and what to do next, `detail` keeps the parser's own technical reason for a log.
 */

/** A file or text the importers could not turn into a song. */
export class SongImportError extends RangeError {
  /** The technical reason (a parser's message), not for the screen. */
  readonly detail?: string;
  /** The format that was being read (`midi`, `guitar-pro`, …), when known. */
  readonly format?: string;

  constructor(message: string, opts: { detail?: string; format?: string } = {}) {
    super(message);
    this.name = 'SongImportError';
    if (opts.detail) this.detail = opts.detail;
    if (opts.format) this.format = opts.format;
  }
}

/** True for an importer's refusal. */
export function isSongImportError(e: unknown): e is SongImportError {
  return e instanceof SongImportError;
}

/**
 * The XML reader's own syntax messages ("Unclosed start tag."). They stay the message of the error
 * on purpose: the song library (`@/core/library`) recognises them and shows its own sentence for a
 * damaged file, with the reader's words as the detail.
 */
const XML_SYNTAX = /^(Unclosed|Mismatched XML|A start tag without|The text has no XML)/;

// What went wrong, per format, when a parser failed in a way it did not explain.
const FAILED: Readonly<Record<string, string>> = {
  midi: 'This MIDI file could not be read: it seems damaged or cut short. Export it again from the program that made it, then try once more.',
  'guitar-pro': 'This Guitar Pro file could not be opened. It may be damaged, or saved in a version the app cannot read (Guitar Pro 3 to 7 files work). Export it again, or save it as MusicXML, then try once more.',
  mxl: 'This compressed MusicXML (.mxl) file could not be unpacked: it seems damaged. Export the score again, or save it as plain MusicXML (.musicxml).',
  musicxml: 'This MusicXML file could not be read: it seems damaged. Export the score again from your notation program, then try once more.',
  json: 'This song file could not be read: it seems damaged. Export the song again, then try once more.',
  sixtab: 'This SixTab text could not be read.',
};
const FAILED_ANY = 'This file could not be read. It may be damaged, or saved by a program this app does not know.';

/**
 * Turn whatever a parser threw into a learner's refusal for `format`. A `SongImportError` passes
 * through; the XML reader's syntax messages are kept (see above); anything else becomes the
 * format's plain sentence with the original text as the detail.
 */
export function importFailure(format: string, e: unknown): SongImportError | RangeError {
  if (e instanceof SongImportError) return e;
  const text = e instanceof Error ? e.message : String(e);
  if (e instanceof RangeError && XML_SYNTAX.test(text)) return e;
  return new SongImportError(FAILED[format] ?? FAILED_ANY, { detail: text, format });
}
