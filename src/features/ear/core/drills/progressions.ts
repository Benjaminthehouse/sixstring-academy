/**
 * Chord progressions: which progression was played? The chords come from the theory engine
 * (`progressionToChords`) in one key per question; they are strummed on guitar shapes or played by
 * the backing band. Within a level no two progressions have the same shape relative to their first
 * chord, so none can pass for another one heard in a different key.
 */
import { chroma, chordPcs, formatKey, formatRoman, parseChord, progressionToChords, splitProgression } from '@/core/theory';
import { MINOR_TONICS, ROOT_NAMES, buildChoice, pcOf, placeNote } from '../question';
import type { BandChord, BandPart, DrillDef, LevelDef, OptionInfo, SoundEvent, SoundPlan } from '../types';
import { playableShape } from './chords';

/** One progression on offer. */
export interface ProgressionDef {
  id: string;
  /** Roman numerals, one per bar, space separated. */
  romans: string;
  mode: 'major' | 'minor';
  /** Plain-words name. */
  name: string;
  /** Band style when the band plays it. */
  style: BandPart['style'];
}

const BLUES = (bars: string) => bars.trim().split(/\s+/).join(' ');

/** Every progression the drill uses. */
export const PROGRESSIONS: Record<string, ProgressionDef> = {
  'one-four-five': { id: 'one-four-five', romans: 'I IV V I', mode: 'major', name: 'the basic cadence', style: 'pop-rock' },
  pop: { id: 'pop', romans: 'I V vi IV', mode: 'major', name: 'the pop loop', style: 'pop-rock' },
  fifties: { id: 'fifties', romans: 'I vi IV V', mode: 'major', name: 'the fifties progression', style: 'ballad' },
  'one-four-six-five': { id: 'one-four-six-five', romans: 'I IV vi V', mode: 'major', name: 'I–IV–vi–V', style: 'pop-rock' },
  'rock-flat-seven': { id: 'rock-flat-seven', romans: 'I bVII IV I', mode: 'major', name: 'the rock ♭VII', style: 'pop-rock' },
  'two-five-one': { id: 'two-five-one', romans: 'ii7 V7 Imaj7 Imaj7', mode: 'major', name: 'the ii–V–I', style: 'jazz-swing' },
  turnaround: { id: 'turnaround', romans: 'Imaj7 vi7 ii7 V7', mode: 'major', name: 'the jazz turnaround', style: 'jazz-swing' },
  'minor-cadence': { id: 'minor-cadence', romans: 'i iv V i', mode: 'minor', name: 'the minor cadence', style: 'ballad' },
  'minor-loop': { id: 'minor-loop', romans: 'i bVI bIII bVII', mode: 'minor', name: 'the minor loop', style: 'pop-rock' },
  andalusian: { id: 'andalusian', romans: 'i bVII bVI V', mode: 'minor', name: 'the Andalusian cadence', style: 'ballad' },
  blues: { id: 'blues', romans: BLUES('I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 I7'), mode: 'major', name: 'the standard 12-bar blues', style: 'blues-shuffle' },
  'blues-quick': { id: 'blues-quick', romans: BLUES('I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 I7'), mode: 'major', name: 'the quick-change blues', style: 'blues-shuffle' },
  'blues-turnaround': { id: 'blues-turnaround', romans: BLUES('I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7'), mode: 'major', name: 'the 12-bar with a turnaround', style: 'blues-shuffle' },
};

const isBlues = (id: string) => id.startsWith('blues');

/** Button label: the numerals, shortened for the 12-bar forms to what tells them apart. */
function labelOf(p: ProgressionDef): string {
  if (p.id === 'blues') return 'Standard 12-bar';
  if (p.id === 'blues-quick') return 'Quick change';
  if (p.id === 'blues-turnaround') return 'With turnaround';
  const romans = splitProgression(p.romans);
  // A held last chord (ii–V–I–I) is shown once.
  const shown = romans.length > 3 && romans[romans.length - 1] === romans[romans.length - 2] ? romans.slice(0, -1) : romans;
  return shown.map((r) => formatRoman(r)).join('–');
}

function detailOf(p: ProgressionDef): string {
  if (p.id === 'blues') return 'V–IV–I–I at the end';
  if (p.id === 'blues-quick') return 'IV in bar 2';
  if (p.id === 'blues-turnaround') return 'ends on V';
  return p.name;
}

/** Label and name of a progression answer. */
export function progressionInfo(id: string): OptionInfo {
  const p = PROGRESSIONS[id];
  if (!p) return { id, label: id, name: id };
  return { id, label: labelOf(p), name: p.name, detail: detailOf(p) };
}

/** The chord symbols of a progression in a key. */
export function progressionChords(id: string, keyName: string): string[] {
  return progressionToChords(PROGRESSIONS[id].romans, keyName);
}

/**
 * The shape of a progression relative to its first chord: for each chord, its root's distance
 * from the first root and its pitch classes relative to its own root. Two progressions with the
 * same shape would sound alike in some key.
 */
export function progressionShape(id: string): string {
  const chords = progressionChords(id, PROGRESSIONS[id].mode === 'major' ? 'C major' : 'A minor');
  const first = chroma(parseChord(chords[0])!.root);
  return chords
    .map((c) => {
      const ch = parseChord(c)!;
      const root = chroma(ch.root);
      const rel = chordPcs(ch).map((pc) => pcOf(pc - root)).sort((a, b) => a - b);
      return `${pcOf(root - first)}:${rel.join('.')}`;
    })
    .join('|');
}

/** Strum each bar on the guitar: `strums` downstrokes per bar. */
function guitarPlan(symbols: string[], bassNear: number, beat: number, strums: number): SoundPlan {
  const events: SoundEvent[] = [];
  const bar = beat * strums;
  symbols.forEach((symbol, i) => {
    const shape = playableShape(symbol, bassNear);
    for (let k = 0; k < strums; k++) {
      events.push({
        at: i * bar + k * beat,
        midis: shape.midis,
        strings: shape.strings,
        dur: k === strums - 1 && i === symbols.length - 1 ? 1.6 : beat,
        strike: 'strum',
        direction: 'down',
        velocity: k === 0 ? 0.82 : 0.6,
        role: 'subject',
      });
    }
  });
  return { events, length: (symbols.length - 1) * bar + (strums - 1) * beat + 1.6 };
}

function bandChord(symbol: string): BandChord {
  const ch = parseChord(symbol)!;
  return { root: chroma(ch.root), tones: chordPcs(ch), symbol };
}

function level(n: number, title: string, pool: string[]): LevelDef {
  const blues = pool.some(isBlues);
  return {
    n,
    title,
    blurb: blues ? 'Three 12-bar blues forms' : `${pool.length} progressions`,
    pool,
    questions: blues ? 5 : 8,
    make(ctx) {
      const { rng, settings } = ctx;
      const mode = PROGRESSIONS[pool[0]].mode;
      const pc = pcOf(placeNote(rng, settings, 40, 51));
      const keyName = `${(mode === 'major' ? ROOT_NAMES : MINOR_TONICS)[pc]} ${mode}`;
      const bassNear = 40 + ((pc - 40 + 1200) % 12) + (pc < 4 ? 12 : 0);
      const beat = blues ? 0.42 : 0.6;
      const plan = (id: string): SoundPlan => {
        const symbols = progressionChords(id, keyName);
        const p = guitarPlan(symbols, bassNear, beat, 2);
        const def = PROGRESSIONS[id];
        const band: BandPart = { bars: symbols.map(bandChord), style: def.style, tempo: blues ? 132 : def.style === 'jazz-swing' ? 140 : 108 };
        return { ...p, band };
      };
      const options = pool.map((id) => ({ ...progressionInfo(id), plan: plan(id) }));
      return buildChoice({
        drill: 'progressions',
        level: n,
        ctx,
        prompt: blues ? 'Which 12-bar blues was that?' : 'Which progression was that?',
        options,
        canSlow: true,
        canSpread: false,
        keyName: `Key of ${formatKey(keyName)}`,
        truth: { key: keyName, chords: progressionChords(ctx.answer, keyName), romans: PROGRESSIONS[ctx.answer].romans },
      });
    },
  };
}

/** The chord-progression drill. */
export const progressionsDrill: DrillDef = {
  id: 'progressions',
  title: 'Chord progressions',
  trains: 'Following the chords of a song: the first step to playing along by ear.',
  icon: 'ListMusic',
  prompt: 'Which progression was that?',
  path: { start: 15, pace: 7 },
  levels: [
    level(1, 'Cadence or pop loop', ['one-four-five', 'pop']),
    level(2, 'Add the fifties', ['one-four-five', 'pop', 'fifties']),
    level(3, 'Four pop progressions', ['pop', 'fifties', 'one-four-six-five', 'rock-flat-seven']),
    level(4, 'Jazz: ii–V–I', ['one-four-five', 'two-five-one', 'turnaround', 'pop']),
    level(5, 'Minor keys', ['minor-cadence', 'minor-loop', 'andalusian']),
    level(6, 'The 12-bar blues', ['blues', 'blues-quick', 'blues-turnaround']),
  ],
  info: progressionInfo,
  mixSentence: (answer, chosen) => (isBlues(answer.id) ? `You often hear ${answer.name} as ${chosen.name}.` : `You often hear ${answer.label} as ${chosen.label}.`),
};
