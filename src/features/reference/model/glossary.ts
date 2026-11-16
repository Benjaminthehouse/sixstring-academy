/**
 * The glossary shelf: every built-in term of the lesson engine (`GLOSSARY`), alphabetical, each
 * with the Theory Path lesson that teaches it and, where one helps, the Reference section that
 * shows it. Lesson ids and titles are those of the syllabus (`content/plan/theory-path.json`);
 * the tests check every pair against it, so a renamed lesson cannot leave a dead link.
 */
import { GLOSSARY } from '@/lessons';
import type { SectionId } from './sections';

/** A lesson of the Theory Path: `unit/lesson` id and its title. */
export interface LessonLink {
  /** Syllabus id, `unit/lesson`. */
  id: string;
  title: string;
  /** Route params of `#learn`: `[unit, lesson]`. */
  params: [string, string];
}

/** Where in the Reference a term is shown. */
export interface SeeAlso {
  section: SectionId;
  item?: string;
  label: string;
}

/** One glossary entry. */
export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  lesson: LessonLink | null;
  see: SeeAlso | null;
  /** First letter, upper case, for the A–Z index. */
  letter: string;
}

/** The lesson that teaches each term: syllabus id and title. */
export const TERM_LESSONS: Readonly<Record<string, readonly [string, string]>> = {
  fret: ['sound-and-pitch/frets-shorten-the-string', 'Frets make the string shorter'],
  fretboard: ['the-six-strings/up-and-down-the-neck', 'High, low and up the neck'],
  nut: ['sound-and-pitch/frets-shorten-the-string', 'Frets make the string shorter'],
  'open-string': ['the-six-strings/string-names', 'E A D G B E'],
  'string-numbers': ['the-six-strings/string-numbers', 'String numbers'],
  tuning: ['the-six-strings/string-names', 'E A D G B E'],
  capo: ['capo-and-transposition/the-capo', 'How a capo works'],
  position: ['reading-up-the-neck/what-a-position-is', 'Positions and how they are marked'],
  fingering: ['first-scale/the-box-at-fret-5', 'The box at fret 5'],
  barre: ['caged/the-barre', 'The barre replaces the nut'],
  mute: ['strumming-rhythm/accents-and-muted-strums', 'Accents and muted strums'],
  strum: ['pulse-and-beat/down-up-strumming', 'Down on the beat, up on the "&"'],
  downstroke: ['pulse-and-beat/down-up-strumming', 'Down on the beat, up on the "&"'],
  upstroke: ['pulse-and-beat/down-up-strumming', 'Down on the beat, up on the "&"'],
  pick: ['pulse-and-beat/down-up-strumming', 'Down on the beat, up on the "&"'],
  pitch: ['sound-and-pitch/pitch-high-and-low', 'Pitch: high and low'],
  note: ['the-musical-alphabet/seven-letters', 'Seven letters, round and round'],
  'musical-alphabet': ['the-musical-alphabet/seven-letters', 'Seven letters, round and round'],
  octave: ['sound-and-pitch/the-octave', 'The octave: the same note, higher'],
  natural: ['the-musical-alphabet/e-f-and-b-c', 'The two natural half steps'],
  sharp: ['the-musical-alphabet/sharps', 'Sharps raise by a half step'],
  flat: ['the-musical-alphabet/flats', 'Flats lower by a half step'],
  accidental: ['reading-first-position/accidentals-in-a-bar', 'Accidentals last until the bar line'],
  enharmonic: ['the-musical-alphabet/one-sound-two-names', 'One sound, two names'],
  'half-step': ['the-musical-alphabet/half-and-whole-steps', 'Half steps and whole steps'],
  'whole-step': ['the-musical-alphabet/half-and-whole-steps', 'Half steps and whole steps'],
  interval: ['intervals-1/what-an-interval-is', 'What an interval is'],
  unison: ['the-six-strings/the-fifth-fret-rule', 'The fifth-fret rule'],
  tritone: ['intervals-1/the-tritone', 'The tritone'],
  chromatic: ['the-musical-alphabet/the-twelve-notes', 'The twelve notes'],
  scale: ['first-scale/what-a-scale-is', 'What a scale is'],
  'major-scale': ['major-scale/the-step-pattern', 'Whole, whole, half'],
  'minor-scale': ['minor-scales/natural-minor', 'The natural minor scale'],
  pentatonic: ['first-scale/a-minor-pentatonic', 'Five notes: A C D E G'],
  degree: ['major-scale/scale-degrees', 'Scale degrees'],
  tonic: ['first-scale/what-a-scale-is', 'What a scale is'],
  root: ['major-and-minor-chords/what-a-chord-is', 'What a chord is'],
  key: ['chords-in-a-key/what-a-key-is', 'What a key is'],
  'key-signature': ['circle-of-fifths/key-signatures', 'What a key signature is'],
  'relative-minor': ['minor-scales/relative-minor', 'The relative minor'],
  'circle-of-fifths': ['circle-of-fifths/the-circle', 'The circle of fifths'],
  mode: ['modes/modes-as-rotations', 'Same notes, new home'],
  chord: ['major-and-minor-chords/what-a-chord-is', 'What a chord is'],
  triad: ['major-and-minor-chords/root-third-fifth', 'Root, third and fifth'],
  'major-chord': ['major-and-minor-chords/major-and-minor-thirds', 'Four frets or three'],
  'minor-chord': ['major-and-minor-chords/major-and-minor-thirds', 'Four frets or three'],
  'seventh-chord': ['seventh-chords/what-a-seventh-chord-is', 'Adding a seventh'],
  'power-chord': ['major-and-minor-chords/power-chords', 'Power chords: neither major nor minor'],
  arpeggio: ['improvising-1/arpeggios', 'Arpeggios'],
  voicing: ['jazz-harmony/shell-voicings', 'Shell voicings'],
  inversion: ['triads-and-inversions/triad-inversions', 'Root position and inversions'],
  progression: ['chords-in-a-key/one-four-five', 'I, IV and V'],
  'roman-numerals': ['chords-in-a-key/roman-numerals', 'Roman numerals'],
  diatonic: ['chords-in-a-key/triads-from-the-scale', 'Stacking thirds in the scale'],
  cadence: ['functional-harmony/cadences', 'Cadences: how phrases end'],
  dominant: ['functional-harmony/three-functions', 'Home, away and tension'],
  subdominant: ['functional-harmony/three-functions', 'Home, away and tension'],
  harmony: ['functional-harmony/three-functions', 'Home, away and tension'],
  melody: ['reading-tab/first-tab-tune', 'Your first tab tune'],
  rhythm: ['pulse-and-beat/quarter-half-whole', 'Quarter, half and whole notes'],
  beat: ['pulse-and-beat/the-beat', 'The beat'],
  tempo: ['pulse-and-beat/tempo-and-bpm', 'Tempo and BPM'],
  bpm: ['pulse-and-beat/tempo-and-bpm', 'Tempo and BPM'],
  bar: ['pulse-and-beat/bars-and-four-four', 'Bars and counting to four'],
  'time-signature': ['strumming-rhythm/three-four-time', 'Three beats in a bar'],
  'note-value': ['pulse-and-beat/quarter-half-whole', 'Quarter, half and whole notes'],
  'whole-note': ['pulse-and-beat/quarter-half-whole', 'Quarter, half and whole notes'],
  'half-note': ['pulse-and-beat/quarter-half-whole', 'Quarter, half and whole notes'],
  'quarter-note': ['pulse-and-beat/quarter-half-whole', 'Quarter, half and whole notes'],
  'eighth-note': ['pulse-and-beat/eighth-notes', 'Eighth notes and the "&"'],
  'sixteenth-note': ['strumming-rhythm/sixteenth-notes', 'Sixteenth notes'],
  rest: ['pulse-and-beat/rests', 'Rests: counted silence'],
  'dotted-note': ['strumming-rhythm/dotted-notes', 'Dotted notes'],
  tie: ['strumming-rhythm/ties', 'Ties'],
  triplet: ['triplets-swing-syncopation/triplets', 'Triplets'],
  downbeat: ['pulse-and-beat/bars-and-four-four', 'Bars and counting to four'],
  offbeat: ['pulse-and-beat/eighth-notes', 'Eighth notes and the "&"'],
  syncopation: ['triplets-swing-syncopation/syncopation', 'Syncopation'],
  metronome: ['pulse-and-beat/the-beat', 'The beat'],
  tab: ['reading-tab/six-lines-six-strings', 'Six lines, six strings'],
  staff: ['reading-the-staff/the-staff', 'Five lines, four spaces'],
  'treble-clef': ['reading-the-staff/the-treble-clef', 'The treble clef'],
  'ledger-line': ['reading-the-staff/ledger-lines', 'Ledger lines and the low strings'],
};

/** Where a term is shown in the Reference itself. */
export const TERM_SEE_ALSO: Readonly<Record<string, SeeAlso>> = {
  'open-string': { section: 'tunings', item: 'standard', label: 'Standard tuning' },
  tuning: { section: 'tunings', label: 'Tunings' },
  'string-numbers': { section: 'notation', item: 'frets', label: 'Reading tab' },
  mute: { section: 'notation', item: 'muted-strum', label: 'Muted strum in tab' },
  downstroke: { section: 'notation', item: 'pick-direction', label: 'Pick direction signs' },
  upstroke: { section: 'notation', item: 'pick-direction', label: 'Pick direction signs' },
  pick: { section: 'notation', item: 'pick-direction', label: 'Pick direction signs' },
  octave: { section: 'intervals', item: 'p8', label: 'The octave' },
  sharp: { section: 'keys', label: 'Key signatures' },
  flat: { section: 'keys', label: 'Key signatures' },
  accidental: { section: 'keys', label: 'Key signatures' },
  'half-step': { section: 'intervals', item: 'm2', label: 'Minor second' },
  'whole-step': { section: 'intervals', item: 'maj2', label: 'Major second' },
  interval: { section: 'intervals', label: 'Intervals' },
  unison: { section: 'intervals', item: 'p1', label: 'Unison' },
  tritone: { section: 'intervals', item: 'aug4', label: 'The tritone' },
  scale: { section: 'scales', label: 'Scale formulas' },
  'major-scale': { section: 'scales', item: 'major', label: 'Major scale formula' },
  'minor-scale': { section: 'scales', item: 'minor', label: 'Minor scale formula' },
  pentatonic: { section: 'scales', item: 'minor-pentatonic', label: 'Minor pentatonic formula' },
  degree: { section: 'scales', label: 'Scale formulas' },
  key: { section: 'circle', label: 'Circle of fifths' },
  'key-signature': { section: 'keys', label: 'Key signatures' },
  'relative-minor': { section: 'keys', label: 'Key signatures' },
  'circle-of-fifths': { section: 'circle', label: 'Circle of fifths' },
  mode: { section: 'scales', item: 'dorian', label: 'The modes' },
  chord: { section: 'chords', label: 'Chord formulas' },
  triad: { section: 'chords', item: 'major', label: 'Triad formulas' },
  'major-chord': { section: 'chords', item: 'major', label: 'Major chord formula' },
  'minor-chord': { section: 'chords', item: 'minor', label: 'Minor chord formula' },
  'seventh-chord': { section: 'chords', item: '7', label: 'Seventh chord formulas' },
  'power-chord': { section: 'chords', item: '5', label: 'Power chord formula' },
  progression: { section: 'harmony', label: 'Chords in every key' },
  'roman-numerals': { section: 'harmony', label: 'Chords in every key' },
  diatonic: { section: 'harmony', label: 'Chords in every key' },
  cadence: { section: 'circle', label: 'Play I–IV–V–I' },
  dominant: { section: 'harmony', label: 'Chords in every key' },
  subdominant: { section: 'harmony', label: 'Chords in every key' },
  tonic: { section: 'harmony', label: 'Chords in every key' },
  bar: { section: 'notation', item: '4-4', label: 'Time signatures' },
  'time-signature': { section: 'notation', item: '4-4', label: 'Time signatures' },
  'note-value': { section: 'notation', item: 'note-values', label: 'Note values' },
  'whole-note': { section: 'notation', item: 'note-values', label: 'Note values' },
  'half-note': { section: 'notation', item: 'note-values', label: 'Note values' },
  'quarter-note': { section: 'notation', item: 'note-values', label: 'Note values' },
  'eighth-note': { section: 'notation', item: 'note-values', label: 'Note values' },
  'sixteenth-note': { section: 'notation', item: 'note-values', label: 'Note values' },
  rest: { section: 'notation', item: 'rests', label: 'Rests' },
  'dotted-note': { section: 'notation', item: 'dotted-quarter', label: 'Dotted notes' },
  tie: { section: 'notation', item: 'tie', label: 'Ties' },
  triplet: { section: 'notation', item: 'triplet', label: 'Triplets' },
  tab: { section: 'notation', item: 'frets', label: 'Tab symbols' },
  staff: { section: 'notation', item: 'note-values', label: 'Notation' },
};

/** Every glossary term, alphabetical, with its lesson and Reference link. */
export function glossaryEntries(): GlossaryEntry[] {
  return [...GLOSSARY]
    .map((t) => {
      const l = TERM_LESSONS[t.id];
      const [unit, lesson] = l ? (l[0].split('/') as [string, string]) : ['', ''];
      return {
        id: t.id,
        term: t.term,
        definition: t.definition,
        lesson: l ? { id: l[0], title: l[1], params: [unit, lesson] as [string, string] } : null,
        see: TERM_SEE_ALSO[t.id] ?? null,
        letter: t.term.charAt(0).toUpperCase(),
      };
    })
    .sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
}

/** Entries whose term or definition contains every word of the query. */
export function filterGlossary(entries: readonly GlossaryEntry[], query: string): GlossaryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...entries];
  const termHits: GlossaryEntry[] = [];
  const defHits: GlossaryEntry[] = [];
  for (const e of entries) {
    const term = e.term.toLowerCase();
    const all = `${term} ${e.definition.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) continue;
    (words.every((w) => term.includes(w)) ? termHits : defHits).push(e);
  }
  return [...termHits, ...defHits];
}
