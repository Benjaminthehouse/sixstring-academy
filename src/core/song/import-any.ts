/**
 * The format sniffer: given a File, Blob, bytes or text, work out what it is (from the content
 * first, the file name second) and hand it to the right importer.
 */
import { importAsciiTab, isChordLine, type AsciiTabOptions } from './import-ascii';
import { importChordPro, importChordSheet, isChordPro, isNashvilleChart, type ChordSheetOptions } from './import-chords';
import { normalizeTabText } from './import-ascii';
import { importGuitarPro, type GuitarProOptions } from './import-gp';
import { importMidi, type MidiImportOptions } from './import-midi';
import { importMusicXml, importMxl, type MusicXmlOptions } from './import-musicxml';
import { songFromJson } from './export-text';
import { importFailure, SongImportError } from './import-error';
import { parseSixTab } from './sixtab-parse';
import type { ImportResult } from './types';

/** Formats the importers understand. */
export type SongFormat = 'sixtab' | 'ascii-tab' | 'chordpro' | 'chord-sheet' | 'musicxml' | 'mxl' | 'midi' | 'guitar-pro' | 'json' | 'unknown';

/** What can be sniffed and imported. */
export type SongInput = File | Blob | ArrayBuffer | Uint8Array | string;

/** Display names of the formats. */
export const FORMAT_NAMES: Readonly<Record<SongFormat, string>> = {
  sixtab: 'SixTab', 'ascii-tab': 'Text tab', chordpro: 'ChordPro', 'chord-sheet': 'Chord sheet', musicxml: 'MusicXML',
  mxl: 'Compressed MusicXML', midi: 'MIDI', 'guitar-pro': 'Guitar Pro', json: 'Song JSON', unknown: 'Unknown',
};

/** File extensions the importer accepts, for an `<input accept>`. */
export const SONG_FILE_ACCEPT = '.txt,.tab,.crd,.cho,.chopro,.chordpro,.pro,.sixtab,.xml,.musicxml,.mxl,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.json';

function ascii(bytes: Uint8Array, from: number, length: number): string {
  let s = '';
  for (let i = from; i < Math.min(bytes.length, from + length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Decode text bytes (UTF-8, or UTF-16 with a byte-order mark). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

/** Count of lines that look like tab strings (`e|--0--3--|`). */
function tabLineCount(text: string): number {
  let best = 0;
  let run = 0;
  for (const line of text.split(/\r?\n/)) {
    const body = line.replace(/^\s*[A-Ga-g]?[#b]?\s*[|:]?/, '');
    const isTab = body.length >= 6 && (body.match(/-/g) ?? []).length >= Math.max(3, body.length * 0.3) && /^[-|0-9hpbrsxX/\\~()<>*.^=tTv: \[\]%]+$/.test(body.replace(/\s*\(?x\d\)?\s*$/i, ''));
    run = isTab ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** What a text is: SixTab, MusicXML, JSON, ChordPro, ASCII tab, a chord sheet, or unknown. */
export function detectTextFormat(input: string): SongFormat {
  const text = normalizeTabText(input);
  const t = text.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const data = JSON.parse(t);
      if (data && typeof data === 'object' && ('song' in data || ('meta' in data && 'tracks' in data))) return 'json';
    } catch {
      // not JSON: ChordPro also starts with "{"
    }
  }
  if (/<score-(partwise|timewise)[\s>]/.test(text.slice(0, 4000))) return 'musicxml';
  const lines = text.split(/\r?\n/);
  const sixMusic = lines.filter((l) => /^\s*\|/.test(l) && /(^|\s)\(?[/\\]?\d{1,2}:(\d{1,2}|x|-|\(\d+\)|<\d+>)/.test(l) && !/-{3,}/.test(l)).length;
  const sixSlash = lines.filter((l) => /^\s*\|.*(\s[whqes]\s+([DUX/]|r)(\s|$))/.test(l)).length;
  if (/^\s*title\s*:/im.test(text) && (sixMusic > 0 || sixSlash > 0)) return 'sixtab';
  if (tabLineCount(text) >= 4) return 'ascii-tab';
  if (isChordPro(text)) return 'chordpro';
  const chordLines = lines.filter((l) => l.trim() && isChordLine(l)).length;
  if (chordLines >= 2 || (chordLines === 1 && lines.filter((l) => l.trim()).length <= 3) || isNashvilleChart(text)) return 'chord-sheet';
  return 'unknown';
}

/** What a file or buffer holds, from its first bytes (and its name when the bytes cannot tell). */
export async function detectFormat(input: SongInput, name?: string): Promise<SongFormat> {
  if (typeof input === 'string') return detectTextFormat(input);
  const fileName = name ?? (typeof File !== 'undefined' && input instanceof File ? input.name : '');
  const bytes = await toBytes(input);
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ascii(bytes, 0, 4) === 'MThd') return 'midi';
  if (ascii(bytes, 0, 4) === 'BCFZ' || ascii(bytes, 0, 4) === 'BCFS') return 'guitar-pro';
  if (/(FICHIER GUITAR(E)? PRO|CLIPBOARD GUITAR PRO)/.test(ascii(bytes, 1, 30))) return 'guitar-pro';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(bytes);
      const files = Object.keys(zip.files);
      if (files.some((f) => /score\.gpif$/i.test(f))) return 'guitar-pro';
      if (files.includes('META-INF/container.xml') || files.some((f) => /\.(musicxml|xml)$/i.test(f))) return 'mxl';
    } catch {
      // fall through to the extension
    }
    if (ext === 'gp') return 'guitar-pro';
    if (ext === 'mxl') return 'mxl';
    return 'unknown';
  }
  const found = detectTextFormat(decodeText(bytes));
  if (found !== 'unknown') return found;
  if (ext && ['gp3', 'gp4', 'gp5', 'gpx', 'gp'].includes(ext)) return 'guitar-pro';
  if (ext === 'mid' || ext === 'midi') return 'midi';
  if (ext === 'cho' || ext === 'chopro' || ext === 'chordpro' || ext === 'crd') return 'chordpro';
  return 'unknown';
}

async function toBytes(input: Exclude<SongInput, string>): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await (input as Blob).arrayBuffer());
}

/** Options for `importSong`: the file name, a forced format, and per-format options. */
export interface ImportSongOptions {
  name?: string;
  format?: SongFormat;
  title?: string;
  asciiTab?: AsciiTabOptions;
  chordSheet?: ChordSheetOptions;
  musicXml?: MusicXmlOptions;
  midi?: MidiImportOptions;
  guitarPro?: GuitarProOptions;
}

/**
 * Import anything: detect the format and dispatch. Throws a `SongImportError` (a RangeError) whose
 * message is for the learner when the format is unknown or the file is broken; the parser's own
 * words are its `detail`. (A damaged XML file keeps the XML reader's message, which the song library
 * turns into its own sentence.)
 */
export async function importSong(input: SongInput, opts: ImportSongOptions = {}): Promise<ImportResult & { format: SongFormat }> {
  const format = opts.format ?? (await detectFormat(input, opts.name));
  try {
    return { ...(await importAs(format, input, opts)), format };
  } catch (e) {
    throw importFailure(format, e);
  }
}

async function importAs(format: SongFormat, input: SongInput, opts: ImportSongOptions): Promise<ImportResult> {
  const text = async () => (typeof input === 'string' ? input : decodeText(await toBytes(input)));
  const bytes = async () => (typeof input === 'string' ? new TextEncoder().encode(input) : toBytes(input));
  const title = opts.title ?? (opts.name ? opts.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() : undefined);
  let result: ImportResult;
  switch (format) {
    case 'sixtab': {
      const r = parseSixTab(await text());
      if (!r.song) {
        throw new SongImportError(`This SixTab has ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}; the first, on line ${r.errors[0].line}: ${r.errors[0].message}`, {
          format, detail: r.errors.slice(0, 8).map((e) => `line ${e.line}, column ${e.column}: ${e.message}`).join('\n'),
        });
      }
      result = { song: r.song, warnings: r.warnings.map((w) => ({ message: w.message, line: w.line, confidence: 0.9 })), confidence: 1 };
      break;
    }
    case 'json':
      result = { song: songFromJson(await text()), warnings: [], confidence: 1 };
      break;
    case 'ascii-tab':
      result = importAsciiTab(await text(), { ...(title ? { title } : {}), ...opts.asciiTab });
      break;
    case 'chordpro':
      result = importChordPro(await text(), { ...(title ? { title } : {}), ...opts.chordSheet });
      break;
    case 'chord-sheet':
      result = importChordSheet(await text(), { ...(title ? { title } : {}), ...opts.chordSheet });
      break;
    case 'musicxml':
      result = importMusicXml(await text(), opts.musicXml);
      break;
    case 'mxl':
      result = await importMxl(await bytes(), opts.musicXml);
      break;
    case 'midi':
      result = await importMidi(await bytes(), { ...(title ? { title } : {}), ...opts.midi });
      break;
    case 'guitar-pro':
      result = await importGuitarPro(await bytes(), opts.guitarPro);
      break;
    default:
      throw new SongImportError('This file is not a format the song importer knows: try text tab, a chord sheet, ChordPro, MusicXML, MIDI or Guitar Pro.', { format: 'unknown' });
  }
  return result;
}
