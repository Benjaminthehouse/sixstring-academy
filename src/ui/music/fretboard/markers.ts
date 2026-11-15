/**
 * Fretboard markers and the helpers that build them from the guitar engine. A marker is plain
 * data (`{ string, fret, label, color, shape, state, root }`); the builders turn scale positions,
 * scale patterns, arpeggios and chord voicings into markers labelled and coloured the same way
 * everywhere: degree colours, finger colours, the root emphasised.
 *
 *   <Fretboard frets={[5, 8]} markers={patternMarkers(scalePatterns('A', 'minor-pentatonic')[0])} />
 *   <Fretboard frets={[0, 4]} {...voicingOnBoard(chordVoicings('G')[0])} />
 */
import {
  arpeggioPositions,
  midiAt,
  noteAt,
  positionsForNote,
  scalePositions,
  type FretPosition,
  type FretRangeOptions,
  type ScalePattern,
  type SpellContext,
  type TuningInput,
  type Voicing,
} from '@/core/guitar';
import { degreeToInterval, type Chord, type NoteNaming, type ScaleType } from '@/core/theory';
import { degreeColor, degreeText, fingerColor, fingerText, intervalText, noteText } from '../format';
import type { MarkerColorMode, MarkerLabelMode, MarkerShape, MarkerState, MusicColor } from '../types';

/** One note drawn on a fretboard. `fret` counts from the capo when there is one (0 = open). */
export interface FretMarker extends FretPosition {
  /** Stable key when the same position appears twice (a sequence); defaults to `string:fret`. */
  id?: string;
  /** Text inside the dot; empty or null for none. */
  label?: string | null;
  /** Colour name (default `neutral`). */
  color?: MusicColor;
  shape?: MarkerShape;
  state?: MarkerState;
  /** The root: drawn larger with a pearl ring. */
  root?: boolean;
  /** The note's spelled name (`F#`), for screen readers. */
  note?: string;
  /**
   * The label is the note's name: the board writes `note` in the reader's naming system (letters,
   * solfege, German) instead of `label`, so markers built once follow the setting.
   */
  noteLabel?: boolean;
  /** Extra words for screen readers: `root`, `third`, `finger 2`. */
  description?: string;
}

/** A barre: one finger across several strings at one fret. */
export interface FretBarre {
  fret: number;
  /** The lowest-pitched string covered (the higher string number). */
  fromString: number;
  /** The highest-pitched string covered (the lower string number). */
  toString: number;
  /** Text on the bar, normally the finger (`1`). */
  label?: string;
  color?: MusicColor;
  state?: MarkerState;
}

/** A note source the builders understand: anything with a position, a spelled note, a degree and a root flag. */
export interface MarkerSource extends FretPosition {
  note: string;
  degree: string;
  isRoot: boolean;
  midi?: number;
  finger?: number | null;
  role?: string;
  interval?: string;
}

/** How the builders label and colour markers. */
export interface MarkerOptions {
  /** Text inside the dots (default `note`). */
  label?: MarkerLabelMode;
  /** How dots are coloured (default `degree`; `root` colours only the root). */
  color?: MarkerColorMode;
  /** Note naming for `note` labels (default letters). */
  naming?: NoteNaming;
  /** How the root reads in `degree` labels: `R` (default) or `1`. */
  rootLabel?: 'R' | '1';
  /** Shape of the root's dot (default `circle`, emphasised). */
  rootShape?: MarkerShape;
  /** Shape of every other dot (default `circle`). */
  shape?: MarkerShape;
  /** State given to every marker (default `normal`). */
  state?: MarkerState;
}

/** The label text of a source note in a label mode. */
export function markerLabel(src: MarkerSource, mode: MarkerLabelMode = 'note', opts: Pick<MarkerOptions, 'naming' | 'rootLabel'> = {}): string {
  switch (mode) {
    case 'note':
      return noteText(src.note, opts.naming);
    case 'degree':
      return degreeText(src.degree, { root: opts.rootLabel });
    case 'interval': {
      if (src.interval) return intervalText(src.interval);
      try {
        return degreeToInterval(src.degree);
      } catch {
        return src.degree;
      }
    }
    case 'finger':
      return fingerText(src.finger);
    default:
      return '';
  }
}

/** The colour of a source note in a colour mode. */
export function markerColor(src: MarkerSource, mode: MarkerColorMode = 'degree'): MusicColor {
  switch (mode) {
    case 'degree':
      return degreeColor(src.degree);
    case 'finger':
      return fingerColor(src.finger);
    case 'root':
      return src.isRoot ? 'deg-1' : 'neutral';
    default:
      return 'neutral';
  }
}

const ROLE_WORDS: Record<string, string> = {
  root: 'root', second: 'second', third: 'third', fourth: 'fourth', fifth: 'fifth', sixth: 'sixth',
  seventh: 'seventh', ninth: 'ninth', eleventh: 'eleventh', thirteenth: 'thirteenth', bass: 'bass note',
};

/** Turn engine notes (`scalePositions`, `pattern.notes`, `voicing.notes`, `arpeggioPositions`) into markers. */
export function dotsToMarkers(dots: readonly MarkerSource[], opts: MarkerOptions = {}): FretMarker[] {
  const label = opts.label ?? 'note';
  const color = opts.color ?? 'degree';
  return dots.map((d) => {
    const words: string[] = [];
    if (d.isRoot) words.push('root');
    else if (d.role && ROLE_WORDS[d.role]) words.push(ROLE_WORDS[d.role]);
    else if (d.degree) words.push(`degree ${d.degree}`);
    if (d.finger && d.finger > 0) words.push(`finger ${d.finger}`);
    return {
      string: d.string,
      fret: d.fret,
      label: markerLabel(d, label, opts),
      color: markerColor(d, color),
      shape: d.isRoot ? (opts.rootShape ?? 'circle') : (opts.shape ?? 'circle'),
      state: opts.state ?? 'normal',
      root: d.isRoot,
      note: d.note,
      noteLabel: label === 'note' || undefined,
      description: words.join(', '),
    };
  });
}

/** Every note of a scale inside a fret range: `scaleMarkers('C', 'major', { maxFret: 12 })`. */
export function scaleMarkers(tonic: string, scale: string | ScaleType, opts: MarkerOptions & FretRangeOptions = {}): FretMarker[] {
  return dotsToMarkers(scalePositions(tonic, scale, opts), opts);
}

/** The notes of one scale pattern (a box, a CAGED shape, a 3NPS pattern), in playing order. */
export function patternMarkers(pattern: ScalePattern, opts: MarkerOptions = {}): FretMarker[] {
  return dotsToMarkers(pattern.notes, opts);
}

/** Every chord tone of a chord inside a fret range: `arpeggioMarkers('Am7', { maxFret: 12 })`. */
export function arpeggioMarkers(chord: string | Chord, opts: MarkerOptions & FretRangeOptions = {}): FretMarker[] {
  return dotsToMarkers(arpeggioPositions(chord, opts), opts);
}

/** Options for `noteMarkers`. */
export interface NoteMarkerOptions extends FretRangeOptions {
  label?: 'note' | 'none';
  naming?: NoteNaming;
  color?: MusicColor;
  state?: MarkerState;
  shape?: MarkerShape;
}

/**
 * Every place a note can be played: `noteMarkers('C')` marks all the Cs, `noteMarkers('E4')` only
 * that pitch, `noteMarkers(64)` the same by MIDI number. Handy for "find every C" games.
 */
export function noteMarkers(noteOrMidi: string | number, opts: NoteMarkerOptions = {}): FretMarker[] {
  const context: SpellContext | undefined = typeof noteOrMidi === 'string' ? { tonic: noteOrMidi.replace(/-?\d+$/, '') } : undefined;
  return positionsForNote(noteOrMidi, opts).map((pos) => {
    const spelled = noteAt(pos, { tuning: opts.tuning, capo: opts.capo, context, octave: false });
    return {
      string: pos.string,
      fret: pos.fret,
      label: opts.label === 'none' ? '' : noteText(spelled, opts.naming),
      noteLabel: opts.label !== 'none' || undefined,
      color: opts.color ?? 'neutral',
      shape: opts.shape ?? 'circle',
      state: opts.state ?? 'normal',
      note: spelled,
    };
  });
}

/** A chord voicing ready to spread onto a `<Fretboard>`: its markers, barres, and the strings left open or muted. */
export interface VoicingOnBoard {
  markers: FretMarker[];
  barres: FretBarre[];
  /** Strings played open (shown with an `o` at the nut when `openAs` is `mark`). */
  open: number[];
  /** Strings not played (shown with an `×` at the nut). */
  muted: number[];
}

/** Options for `voicingOnBoard`. */
export interface VoicingMarkerOptions extends MarkerOptions {
  /** Open strings as labelled rings in the open column (`marker`, default) or only as `o` marks. */
  openAs?: 'marker' | 'mark';
}

/**
 * A chord voicing on the neck: fretted notes as markers (labelled with fingers in finger colours
 * by default), barres as bars, open strings as rings at the nut and muted strings as crosses.
 */
export function voicingOnBoard(voicing: Voicing, opts: VoicingMarkerOptions = {}): VoicingOnBoard {
  const label = opts.label ?? 'finger';
  const color = opts.color ?? (label === 'finger' ? 'finger' : 'degree');
  const openAs = opts.openAs ?? 'marker';
  const fretted = voicing.notes.filter((n) => n.fret > 0);
  const openNotes = voicing.notes.filter((n) => n.fret === 0);
  const markers = dotsToMarkers(fretted, { ...opts, label, color });
  if (openAs === 'marker') {
    // An open string has no finger: name the note instead, in a ring, so it never reads as fretted.
    const openLabel: MarkerLabelMode = label === 'finger' ? 'note' : label;
    const openColor: MarkerColorMode = color === 'finger' ? 'degree' : color;
    for (const m of dotsToMarkers(openNotes, { ...opts, label: openLabel, color: openColor })) markers.push({ ...m, shape: 'ring' });
  }
  const stringCount = voicing.frets.length;
  const open: number[] = [];
  const muted: number[] = [];
  voicing.frets.forEach((fret, index) => {
    const string = stringCount - index;
    if (fret === null) muted.push(string);
    else if (fret === 0) open.push(string);
  });
  const barres: FretBarre[] = voicing.barres.map((b) => ({
    fret: b.fret,
    fromString: b.fromString,
    toString: b.toString,
    label: label === 'finger' ? String(b.finger) : undefined,
    color: color === 'finger' ? fingerColor(b.finger) : 'neutral',
  }));
  return { markers, barres, open: openAs === 'mark' ? open : [], muted };
}

/** The marker positions in order, for a `path` that connects them (a scale run, a sequence). */
export function markerPath(markers: readonly FretPosition[]): FretPosition[] {
  return markers.map((m) => ({ string: m.string, fret: m.fret }));
}

/**
 * The words a screen reader hears for a cell: `string 3, fret 5, C`. `note` is optional (games
 * that must not give the answer away leave it out).
 */
export function cellLabel(pos: FretPosition, note?: string | null, naming?: NoteNaming): string {
  const where = pos.fret === 0 ? `string ${pos.string}, open` : `string ${pos.string}, fret ${pos.fret}`;
  return note ? `${where}, ${noteText(note, naming)}` : where;
}

/** The sounding note at a position, spelled by an optional context, without octave. */
export function spelledAt(pos: FretPosition, opts: { tuning?: TuningInput; capo?: number; context?: SpellContext } = {}): { midi: number; note: string } {
  return { midi: midiAt(pos, opts), note: noteAt(pos, { ...opts, octave: false }) };
}
