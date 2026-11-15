/**
 * "Where it is used": the keys a chord belongs to (with its roman numeral there), a couple of
 * everyday progressions that contain it, and a line about the styles it turns up in. Keys and
 * progressions are computed with the theory engine; only the style lines are written by hand.
 */
import { chordToRoman, formatRoman, getChordType, getKey, keyScale, MAJOR_KEYS, MINOR_KEYS, parseChord, transpose, type Chord } from '@/core/theory';
import { familyOfType, FIRST_CHORDS } from './catalog';
import { CLASSIC_PAIRS } from './trainer';

/** One key the chord belongs to. */
export interface KeyUse {
  /** Key name, ASCII: `G major`. */
  key: string;
  /** Roman numeral for display: `IV`, `♭III`, `ii7`. */
  roman: string;
  /** Tonic, subdominant or dominant (when the theory engine says). */
  role: string | null;
}

/** One example progression. */
export interface ProgressionExample {
  key: string;
  /** Roman numerals joined with en dashes. */
  romans: string;
  chords: string[];
  /** Which of `chords` is this chord. */
  self: number;
  /** What the progression is known for. */
  note: string;
}

/** Everything the "Where it is used" section shows. */
export interface ChordUsage {
  styles: string;
  keys: KeyUse[];
  examples: ProgressionExample[];
}

const STYLES: Record<string, string> = {
  major: 'Everywhere: folk, pop, rock, country and worship songs lean on major chords, usually three or four of them per song.',
  minor: 'The serious or sad chords of pop and rock: the home chord of minor-key songs, and the vi chord that gives a major-key chorus its bittersweet turn.',
  '7': 'Blues (every chord of a twelve-bar can be a 7), rock and roll, country, and the V7 that leads home in almost every style.',
  maj7: 'Soul, R&B, jazz, bossa nova and soft pop ballads; the home chord of many jazz standards.',
  m7: 'Funk vamps, soul and jazz (the ii of every ii–V–I), and pop songs that want a softer minor.',
  sus: 'Folk and rock strumming, where a sus chord decorates the plain one (D – Dsus4 – D); 7sus4 is a gentle dominant in pop and jazz.',
  add: 'Acoustic pop and worship guitar: add9 shapes let open strings ring for a big, shimmering strum.',
  '6': 'Swing, western swing and bossa nova, and the last chord of many big-band tunes; the minor sixth is a gypsy-jazz favourite.',
  '9': 'Funk (the one-chord ninth-chord groove), blues, soul and jazz.',
  dim: 'Passing chords between two neighbours (C – C♯dim7 – Dm), ragtime and old-time songs, and suspense in film music.',
  aug: 'The rising line C – C+ – C6 in ballads and standards, and a dominant that pushes hard toward the next chord.',
  'half-diminished': 'Jazz and Latin standards in minor keys: the iiø7 – V7 – i cadence.',
  extended: 'Jazz, neo-soul, gospel and fusion: one rich grip can stand in for a whole bar of busier playing.',
  altered: 'Jazz and blues dominants that resolve with extra bite; the 7♯9 is the gritty dominant of funk and blues-rock.',
  power: 'Rock, punk and metal riffs, usually with distortion and often palm-muted.',
};

interface Step {
  /** Interval from the key's tonic to this chord's root. */
  iv: string;
  /** Chord type id, or `self` for the chord itself. */
  type: string;
}

interface Template {
  /** Interval from the key's tonic up to the chord's root. */
  offset: string;
  mode: 'major' | 'minor';
  romans: string;
  steps: Step[];
  note: string;
}

const POP: Omit<Template, 'offset' | 'steps'> & { steps: Step[] } = {
  mode: 'major',
  romans: 'I–V–vi–IV',
  steps: [
    { iv: 'P1', type: 'major' },
    { iv: 'P5', type: 'major' },
    { iv: 'M6', type: 'minor' },
    { iv: 'P4', type: 'major' },
  ],
  note: 'The four chords behind countless pop songs.',
};
const THREE: Omit<Template, 'offset'> = {
  mode: 'major',
  romans: 'I–IV–V–I',
  steps: [
    { iv: 'P1', type: 'major' },
    { iv: 'P4', type: 'major' },
    { iv: 'P5', type: 'major' },
    { iv: 'P1', type: 'major' },
  ],
  note: 'Three-chord rock, folk and country.',
};
const TWO_FIVE_ONE: Omit<Template, 'offset'> = {
  mode: 'major',
  romans: 'ii7–V7–Imaj7',
  steps: [
    { iv: 'M2', type: 'm7' },
    { iv: 'P5', type: '7' },
    { iv: 'P1', type: 'maj7' },
  ],
  note: 'The ii–V–I at the heart of jazz.',
};

/** Templates per family; `self` marks the step this chord takes (its root must match). */
function templatesFor(familyId: string, typeId: string): Array<Template & { selfStep: number }> {
  const at = (t: Omit<Template, 'offset'>, selfStep: number): Template & { selfStep: number } => ({ ...t, offset: t.steps[selfStep].iv, selfStep });
  switch (familyId) {
    case 'major':
    case 'add':
    case '6':
      if (typeId === 'm6' || typeId === 'madd9' || typeId === 'madd11' || typeId === 'm69' || typeId === 'mb6') return minorTemplates(at);
      return [at(POP, 0), at(THREE, 1)];
    case 'minor':
      return minorTemplates(at);
    case 'power':
      return [at({ mode: 'major', romans: 'I5–♭VII5–IV5', steps: [{ iv: 'P1', type: '5' }, { iv: 'm7', type: '5' }, { iv: 'P4', type: '5' }], note: 'A classic rock riff move.' }, 0)];
    case 'sus':
      return [at({ mode: 'major', romans: 'Isus–I', steps: [{ iv: 'P1', type: 'self' }, { iv: 'P1', type: typeId.startsWith('7') || typeId.startsWith('9') || typeId.startsWith('13') ? '7' : 'major' }], note: 'The suspension resolving to the plain chord: a strumming favourite.' }, 0)];
    case '7':
    case '9':
    case 'altered':
      return [
        at({ ...THREE, romans: 'I–IV–V7–I', steps: [{ iv: 'P1', type: 'major' }, { iv: 'P4', type: 'major' }, { iv: 'P5', type: 'self' }, { iv: 'P1', type: 'major' }], note: 'The dominant pulling back home.' }, 2),
        ...(familyId === '7' ? [at({ mode: 'major', romans: 'I7–IV7–V7', steps: [{ iv: 'P1', type: '7' }, { iv: 'P4', type: '7' }, { iv: 'P5', type: '7' }], note: 'The three chords of a twelve-bar blues.' }, 0)] : []),
        ...(familyId !== '7' ? [at({ ...TWO_FIVE_ONE, steps: [{ iv: 'M2', type: 'm7' }, { iv: 'P5', type: 'self' }, { iv: 'P1', type: 'maj7' }] }, 1)] : []),
      ];
    case 'maj7':
      return [at({ mode: 'major', romans: 'Imaj7–IVmaj7', steps: [{ iv: 'P1', type: 'maj7' }, { iv: 'P4', type: 'maj7' }], note: 'A soft two-chord vamp.' }, 0), at(TWO_FIVE_ONE, 2)];
    case 'm7':
      return [at(TWO_FIVE_ONE, 0), at({ mode: 'major', romans: 'Imaj7–vi7–ii7–V7', steps: [{ iv: 'P1', type: 'maj7' }, { iv: 'M6', type: 'm7' }, { iv: 'M2', type: 'm7' }, { iv: 'P5', type: '7' }], note: 'A smooth turnaround.' }, 1)];
    case 'extended':
      if (typeId.startsWith('m')) return [at({ ...TWO_FIVE_ONE, steps: [{ iv: 'M2', type: 'self' }, { iv: 'P5', type: '7' }, { iv: 'P1', type: 'maj7' }] }, 0)];
      if (typeId.startsWith('maj')) return [at({ ...TWO_FIVE_ONE, steps: [{ iv: 'M2', type: 'm7' }, { iv: 'P5', type: '7' }, { iv: 'P1', type: 'self' }] }, 2)];
      return [at({ ...TWO_FIVE_ONE, steps: [{ iv: 'M2', type: 'm7' }, { iv: 'P5', type: 'self' }, { iv: 'P1', type: 'maj7' }] }, 1)];
    case 'half-diminished':
      return [at({ mode: 'minor', romans: 'iiø7–V7–i', steps: [{ iv: 'M2', type: 'self' }, { iv: 'P5', type: '7' }, { iv: 'P1', type: 'minor' }], note: 'The minor-key ii–V–i.' }, 0)];
    case 'dim':
      return [
        at({ mode: 'major', romans: 'I–♯i°7–ii', steps: [{ iv: 'P1', type: 'major' }, { iv: 'A1', type: 'self' }, { iv: 'M2', type: 'minor' }], note: 'A passing chord that climbs by half steps.' }, 1),
        at({ mode: 'minor', romans: 'vii°–i', steps: [{ iv: 'M7', type: 'self' }, { iv: 'P1', type: 'minor' }], note: 'The leading-tone chord resolving in a minor key.' }, 0),
      ];
    case 'aug':
      return [at({ mode: 'major', romans: 'I–I+–IV', steps: [{ iv: 'P1', type: 'major' }, { iv: 'P1', type: 'self' }, { iv: 'P4', type: 'major' }], note: 'The raised fifth pushing on to the next chord.' }, 1)];
    default:
      return [];
  }
}

function minorTemplates(at: (t: Omit<Template, 'offset'>, selfStep: number) => Template & { selfStep: number }): Array<Template & { selfStep: number }> {
  return [
    at({ ...POP, steps: POP.steps.map((s, i) => (i === 2 ? { ...s, type: 'self' } : s)), note: 'The pop progression: the minor vi chord is its bittersweet turn.' }, 2),
    at({ mode: 'minor', romans: 'i–♭VI–♭III–♭VII', steps: [{ iv: 'P1', type: 'self' }, { iv: 'm6', type: 'major' }, { iv: 'm3', type: 'major' }, { iv: 'm7', type: 'major' }], note: 'A dramatic minor-key loop.' }, 0),
  ];
}

function spelledOk(note: string): boolean {
  return !/##|bb/.test(note.slice(1));
}

function buildExample(c: Chord, t: Template & { selfStep: number }): ProgressionExample | null {
  let tonic: string;
  try {
    tonic = t.offset === 'P1' ? c.root : transpose(c.root, `-${t.offset}`);
  } catch {
    return null;
  }
  const key = getKey(`${tonic} ${t.mode}`);
  if (!key || key.theoretical || !spelledOk(tonic)) return null;
  const chords: string[] = [];
  for (let i = 0; i < t.steps.length; i++) {
    const step = t.steps[i];
    if (i === t.selfStep) {
      chords.push(c.symbol);
      continue;
    }
    const root = step.iv === 'P1' ? tonic : transpose(tonic, step.iv);
    if (!spelledOk(root)) return null;
    const type = step.type === 'self' ? c.type : getChordType(step.type);
    if (!type) return null;
    const sym = parseChord(`${root}${type.symbol}`)?.symbol;
    if (!sym) return null;
    chords.push(sym);
  }
  return { key: key.name, romans: t.romans, chords, self: t.selfStep, note: t.note };
}

/** Keys (major and minor, no theoretical ones) in which the chord is diatonic, with its numeral. */
export function keysOf(symbol: string, limit = 8): KeyUse[] {
  const c = parseChord(symbol);
  if (!c) return [];
  const out: KeyUse[] = [];
  const tones = c.bass ? [...c.notes, c.bass] : c.notes;
  for (const k of [...MAJOR_KEYS, ...MINOR_KEYS]) {
    if (k.theoretical) continue;
    try {
      // Spelled membership: F is not in A# minor (whose leading note is E#), and a borrowed or
      // melodic-minor chord is not "in" the key for a learner reading this list.
      const scales = k.mode === 'minor' ? [keyScale(k, 'natural'), keyScale(k, 'harmonic')] : [keyScale(k, 'natural')];
      if (!scales.some((sc) => tones.every((n) => (sc as readonly string[]).includes(n)))) continue;
      const r = chordToRoman(c.symbol, k);
      if (r.relation !== 'diatonic') continue;
      out.push({ key: k.name, roman: formatRoman(r.roman), role: r.function ?? null });
    } catch {
      // Not analysable in this key.
    }
  }
  // Keys where the chord is at home first (I / i), then majors before minors as listed.
  out.sort((a, b) => rank(a) - rank(b));
  return out.slice(0, limit);
}

function rank(u: KeyUse): number {
  const r = u.roman.replace(/[^IViv]/g, '');
  if (r === 'I' || r === 'i') return 0;
  if (r === 'IV' || r === 'V' || r === 'iv' || r === 'v') return 1;
  return 2;
}

/** The whole "Where it is used" section for a chord. */
export function chordUsage(symbol: string): ChordUsage {
  const c = parseChord(symbol);
  if (!c) return { styles: '', keys: [], examples: [] };
  const family = familyOfType(c.type);
  const examples: ProgressionExample[] = [];
  if (!c.bass) {
    for (const t of templatesFor(family.id, c.type.id)) {
      const ex = buildExample(c, t);
      if (ex) examples.push(ex);
    }
  }
  return { styles: STYLES[family.id] ?? '', keys: keysOf(c.symbol), examples };
}

/**
 * Chords worth practising a change to from this one: its classic beginner partners first, then the
 * chords it shares a progression with, then its neighbours on the first-chords path.
 */
export function changePartners(symbol: string, limit = 6): string[] {
  const c = parseChord(symbol);
  if (!c) return [];
  const out: string[] = [];
  const push = (s: string) => {
    if (s !== c.symbol && !out.includes(s) && parseChord(s)) out.push(s);
  };
  for (const [a, b] of CLASSIC_PAIRS) {
    if (a === c.symbol) push(b);
    if (b === c.symbol) push(a);
  }
  for (const ex of chordUsage(c.symbol).examples) for (const s of ex.chords) push(s);
  const i = FIRST_CHORDS.indexOf(c.symbol);
  if (i >= 0) for (const s of [FIRST_CHORDS[i - 1], FIRST_CHORDS[i + 1]]) if (s) push(s);
  if (out.length === 0) for (const s of ['G', 'C', 'D', 'Am', 'Em']) push(s);
  return out.slice(0, limit);
}
