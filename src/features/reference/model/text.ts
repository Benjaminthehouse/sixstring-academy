/**
 * Each Reference section as plain text, for "Copy" and "Download as text". Tables become rows of
 * cells separated by " | " so they paste cleanly into notes, chats and spreadsheets.
 */
import { chordGroups } from './chords';
import { cadenceOf, keyChordRow, signatureWords } from './circle';
import { glossaryEntries } from './glossary';
import { harmonyTable } from './harmony';
import { compoundRows, fretMoveWords, intervalRows } from './intervals';
import { MNEMONICS, flatOrder, namingRules, sharpOrder, signatureRows } from './keys';
import { prettyName } from './names';
import { ARTICULATIONS, DYNAMICS, REPEAT_SIGNS, TAB_TECHNIQUES, beatsWords, lengthExamples, noteValueRows, timeSignatureRows } from './notation';
import { scaleGroups } from './scales';
import type { SearchFormat } from './search';
import { sectionById, type SectionId } from './sections';
import { changeSummary, tuningGroups } from './tunings';
import { MAJOR_KEYS, formatDegree, formatRoman } from '@/core/theory';

/** One line on how the circle is laid out. */
const CIRCLE_ORDER_NOTE = 'Clockwise each key is a fifth higher and adds a sharp (or drops a flat); the relative minor shares its signature.';

const PLAIN: SearchFormat = { note: (n) => n, chord: (c) => c, key: (k) => k };

const row = (cells: Array<string | number>) => cells.join(' | ');

/** The section as plain text, headed by its title. */
export function sectionText(section: SectionId, fmt: SearchFormat = PLAIN): string {
  const info = sectionById(section)!;
  const lines: string[] = [`${info.title.toUpperCase()}`, info.blurb, ''];
  const notes = (list: readonly string[]) => list.map(fmt.note).join(' ');
  const chords = (list: readonly string[]) => list.map(fmt.chord).join(' ');

  switch (section) {
    case 'circle': {
      lines.push(CIRCLE_ORDER_NOTE, '');
      lines.push(row(['Key', 'Signature', 'Relative minor', 'I–IV–V–I']));
      for (const k of MAJOR_KEYS) {
        lines.push(row([fmt.key(k.name), `${signatureWords(k)}${k.signature.count ? ` (${notes(k.signature.accidentals)})` : ''}`, fmt.key(k.relative), chords(cadenceOf(k).chords)]));
      }
      lines.push('', 'Chords of C major: ' + keyChordRow(MAJOR_KEYS[0]).map((c) => `${formatRoman(c.roman)} ${fmt.chord(c.symbol)}`).join(', '));
      break;
    }
    case 'keys': {
      lines.push(`Order of sharps: ${notes(sharpOrder())} (${MNEMONICS.sharps})`);
      lines.push(`Order of flats: ${notes(flatOrder())} (${MNEMONICS.flats})`, '');
      for (const r of namingRules(fmt.note)) lines.push(`${r.title}: ${r.text}`);
      lines.push('', row(['Signature', 'Major key', 'Minor key', 'Accidentals']));
      for (const r of signatureRows()) lines.push(row([r.count === 0 ? 'none' : `${r.count} ${r.type}`, fmt.key(r.major.name), fmt.key(r.minor.name), notes(r.accidentals) || '-']));
      break;
    }
    case 'intervals': {
      lines.push(row(['Half steps', 'Short', 'Name', 'Inversion', 'From C', 'Next string up', 'G to B string']));
      for (const r of intervalRows()) lines.push(row([r.semitones, r.id, r.name, r.inversion, `${fmt.note('C')}–${fmt.note(r.fromC)}`, fretMoveWords(r.nextString), fretMoveWords(r.gToB)]));
      lines.push('', 'Beyond the octave', row(['Half steps', 'Short', 'Name', 'Octave above']));
      for (const r of compoundRows()) lines.push(row([r.semitones, r.id, r.name, r.simple]));
      break;
    }
    case 'chords': {
      for (const g of chordGroups('C')) {
        lines.push(g.title, row(['Symbol', 'Name', 'Formula', 'Notes in C']));
        for (const r of g.rows) lines.push(row([fmt.chord(r.symbol), r.name, r.degrees.map((d) => formatDegree(d)).join(' '), notes(r.notes)]));
        lines.push('');
      }
      break;
    }
    case 'scales': {
      for (const g of scaleGroups(0)) {
        lines.push(g.title, row(['Scale', 'Formula', 'Steps', 'Notes on C']));
        for (const r of g.rows) lines.push(row([prettyName(r.name), r.degrees.map((d) => formatDegree(d)).join(' '), r.steps.join(' '), notes(r.notes)]));
        lines.push('');
      }
      break;
    }
    case 'harmony': {
      const tables = [
        ['Major keys', harmonyTable('major')],
        ['Minor keys (V and vii° from harmonic minor)', harmonyTable('minor')],
        ['Minor keys, harmonic minor', harmonyTable('minor', false, 'harmonic')],
        ['Minor keys, melodic minor', harmonyTable('minor', false, 'melodic')],
      ] as const;
      for (const [title, t] of tables) {
        lines.push(title);
        lines.push(row(['Key', ...t.columns.map((c) => formatRoman(c.roman))]));
        lines.push(row(['', ...t.columns.map((c) => c.function)]));
        for (const r of t.rows) lines.push(row([fmt.key(r.key.name), ...r.chords.map(fmt.chord)]));
        lines.push('');
      }
      break;
    }
    case 'notation': {
      lines.push('Note values (beats in 4/4)');
      for (const v of noteValueRows()) lines.push(row([v.name, v.british, beatsWords(v.beats), v.restName]));
      lines.push('', 'Dots, ties and triplets');
      for (const e of lengthExamples()) lines.push(row([e.name, e.sum, beatsWords(e.beats)]));
      lines.push('', 'Time signatures');
      for (const t of timeSignatureRows()) lines.push(row([t.text, t.meaning]));
      for (const [title, list] of [['Repeats and road signs', REPEAT_SIGNS], ['Dynamics', DYNAMICS], ['Articulation', ARTICULATIONS]] as const) {
        lines.push('', title);
        for (const s of list) lines.push(row([s.name, s.meaning]));
      }
      lines.push('', 'Tab symbols');
      for (const t of TAB_TECHNIQUES) lines.push(row([t.name, t.symbol, t.meaning]));
      break;
    }
    case 'tunings': {
      for (const g of tuningGroups()) {
        lines.push(g.title);
        for (const r of g.rows) lines.push(row([prettyName(r.name), r.notes.map((n) => fmt.note(n.replace(/\d+$/, ''))).join(' '), r.changes.length ? changeSummary(r.changes) : '', r.description]));
        lines.push('');
      }
      break;
    }
    case 'glossary': {
      for (const e of glossaryEntries()) lines.push(`${e.term}: ${e.definition}`);
      break;
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** A file name for a section's text: `sixstring-reference-intervals.txt`. */
export function sectionFileName(section: SectionId): string {
  return `sixstring-reference-${section}.txt`;
}
