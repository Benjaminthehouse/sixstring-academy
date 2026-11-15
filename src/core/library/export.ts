/**
 * Writing a song out as a file: SixTab (the app's own text format), text tab, MusicXML, or the
 * exact JSON. Pure; the screen hands the result to `saveFile` from `@/core/platform`.
 */
import { sixTabLosses, slugify, songToJson, toAsciiTab, toMusicXml, toSixTab, type Song } from '@/core/song';
import type { ExportFormat, SongExport } from './types';

/** What each export format is, for a picker. Extensions are the ones the Claude viewer can save, except MusicXML. */
export const EXPORT_FORMATS: ReadonlyArray<{ id: ExportFormat; label: string; extension: string; mime: string; description: string }> = [
  { id: 'sixtab', label: 'SixTab', extension: '.sixtab.txt', mime: 'text/plain', description: 'The app’s own text format: every note, chord and lyric, and you can edit it in any text editor.' },
  { id: 'ascii-tab', label: 'Text tab', extension: '-tab.txt', mime: 'text/plain', description: 'Classic tab with dashes, to print or paste into a message.' },
  { id: 'musicxml', label: 'MusicXML', extension: '.musicxml', mime: 'application/vnd.recordare.musicxml+xml', description: 'Opens in notation programs such as MuseScore, with tab and standard notation.' },
  { id: 'json', label: 'Exact copy', extension: '.song.json', mime: 'application/json', description: 'Everything exactly as stored here, to bring back into Sixstring Academy later.' },
];

/** The file name for a song in a format: `greensleeves.sixtab.txt`. */
export function exportFileName(title: string, format: ExportFormat): string {
  const base = slugify(title).slice(0, 60).replace(/-+$/, '') || 'song';
  const ext = EXPORT_FORMATS.find((f) => f.id === format)?.extension ?? '.txt';
  return base + ext;
}

/** Write a song in one format. Never throws for a valid song. */
export function exportSongAs(song: Song, format: ExportFormat): SongExport {
  const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
  let data: string;
  let losses: string[] = [];
  switch (format) {
    case 'sixtab':
      data = toSixTab(song);
      losses = sixTabLosses(song);
      break;
    case 'ascii-tab':
      data = song.tracks.length > 1 ? song.tracks.map((t, i) => `${t.name}\n\n${toAsciiTab(song, { track: i, header: i === 0 })}`).join('\n\n') : toAsciiTab(song);
      losses = ['Text tab keeps the notes, chords and lyrics; techniques beyond h p / \\ b ~ and exact rhythm details may be simplified.'];
      break;
    case 'musicxml':
      data = toMusicXml(song);
      break;
    default:
      data = songToJson(song);
  }
  return { format: info.id, filename: exportFileName(song.meta.title, info.id), mime: info.mime, data, losses };
}
