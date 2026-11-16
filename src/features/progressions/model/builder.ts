/**
 * The progression builder: a draft (key, chords as numerals with a length each, band style and
 * tempo), the chords a learner can tap (the key's own, plus borrowed and secondary chords for the
 * curious), the theory engine's likely next chords, the cadences the draft forms, and turning the
 * draft into a catalog-shaped `Progression` so the jam view and the band play it like any other.
 * Pure; storage lives in `saved.ts`.
 */
import {
  bestTonic, homeKey, parseSlot, resolveSlot,
  type HomeKey, type Progression,
} from '@/content/progressions';
import { BACKING_STYLES, BACKING_STYLE_IDS, type BackingStyleId } from '@/core/audio';
import {
  chordToRoman, chroma, classifyCadence, diatonicChords, isNote, nextChords, secondaryDominants, tritoneSubstitutes,
  type Cadence,
} from '@/core/theory';
import { feelFor } from './jam';

/** Major or minor: the builder's two keys. */
export type BuilderMode = 'major' | 'minor';

/** How long a chord lasts, in bars. */
export type SlotLength = 0.5 | 1 | 2 | 4;

/** The lengths on offer. */
export const SLOT_LENGTHS: readonly SlotLength[] = [0.5, 1, 2, 4];

/** One chord of a draft. */
export interface BuilderSlot {
  /** Chart token (`'IV'`, `'V7/ii'`, `'bVII'`). */
  token: string;
  length: SlotLength;
}

/** A progression being built. */
export interface BuilderDraft {
  /** The saved progression this draft edits, if any. */
  savedId: string | null;
  name: string;
  tonic: string;
  mode: BuilderMode;
  slots: BuilderSlot[];
  style: BackingStyleId;
  tempo: number;
  /** Offer seventh chords instead of triads. */
  sevenths: boolean;
  /** Show borrowed and secondary chords. */
  advanced: boolean;
}

/** The most chords a draft holds. */
export const MAX_SLOTS = 48;

/** A starting point that sounds good at once: I–vi–IV–V in G. */
export const STARTER_DRAFT: BuilderDraft = {
  savedId: null,
  name: '',
  tonic: 'G',
  mode: 'major',
  slots: [
    { token: 'I', length: 1 },
    { token: 'vi', length: 1 },
    { token: 'IV', length: 1 },
    { token: 'V', length: 1 },
  ],
  style: 'pop-rock',
  tempo: 100,
  sevenths: false,
  advanced: false,
};

/** The home key of a draft, in the catalog's terms. */
export function draftHome(d: Pick<BuilderDraft, 'tonic' | 'mode'>): HomeKey {
  return homeKey({ tonality: d.mode }, d.tonic);
}

/** True when a token is one the engine can resolve in this draft's key. */
export function validToken(token: string, d: Pick<BuilderDraft, 'tonic' | 'mode'>): boolean {
  if (typeof token !== 'string' || token.length > 16 || !parseSlot(token)) return false;
  try {
    resolveSlot(token, draftHome(d));
    return true;
  } catch {
    return false;
  }
}

/** A draft from storage, with anything unreadable replaced (never throws). */
export function sanitizeDraft(raw: unknown, fallback: BuilderDraft = STARTER_DRAFT): BuilderDraft {
  if (!raw || typeof raw !== 'object') return { ...fallback, slots: fallback.slots.map((s) => ({ ...s })) };
  const r = raw as Partial<BuilderDraft>;
  const mode: BuilderMode = r.mode === 'minor' ? 'minor' : 'major';
  const tonic = typeof r.tonic === 'string' && isNote(r.tonic) && !/\d/.test(r.tonic) ? r.tonic : fallback.tonic;
  const style = typeof r.style === 'string' && (BACKING_STYLE_IDS as readonly string[]).includes(r.style) ? (r.style as BackingStyleId) : fallback.style;
  const range = BACKING_STYLES[style].tempo;
  const tempo = typeof r.tempo === 'number' && Number.isFinite(r.tempo) ? Math.round(Math.min(range.max + 20, Math.max(30, r.tempo))) : BACKING_STYLES[style].tempo.default;
  const slots = Array.isArray(r.slots)
    ? r.slots
        .filter((s): s is BuilderSlot => !!s && typeof s === 'object' && typeof (s as BuilderSlot).token === 'string' && validToken((s as BuilderSlot).token, { tonic, mode }))
        .map((s) => ({ token: s.token, length: (SLOT_LENGTHS as readonly number[]).includes(s.length) ? s.length : 1 }) as BuilderSlot)
        .slice(0, MAX_SLOTS)
    : fallback.slots.map((s) => ({ ...s }));
  return {
    savedId: typeof r.savedId === 'string' && /^my-[a-z0-9-]+$/.test(r.savedId) ? r.savedId : null,
    name: typeof r.name === 'string' ? r.name.slice(0, 60) : '',
    tonic,
    mode,
    slots,
    style,
    tempo,
    sevenths: !!r.sevenths,
    advanced: !!r.advanced,
  };
}

// ── Editing ──────────────────────────────────────────────────────────────────────────────────

/** Add a chord at the end (or at `at`). Ignored past {@link MAX_SLOTS} or for a token the key cannot resolve. */
export function addSlot(d: BuilderDraft, token: string, length: SlotLength = 1, at?: number): BuilderDraft {
  if (d.slots.length >= MAX_SLOTS || !validToken(token, d)) return d;
  const slots = [...d.slots];
  slots.splice(at === undefined ? slots.length : Math.max(0, Math.min(slots.length, at)), 0, { token, length });
  return { ...d, slots };
}

/** Remove the chord at an index. */
export function removeSlot(d: BuilderDraft, index: number): BuilderDraft {
  if (index < 0 || index >= d.slots.length) return d;
  return { ...d, slots: d.slots.filter((_, i) => i !== index) };
}

/** Move a chord one place left (-1) or right (+1). */
export function moveSlot(d: BuilderDraft, index: number, by: number): BuilderDraft {
  const to = index + by;
  if (index < 0 || index >= d.slots.length || to < 0 || to >= d.slots.length) return d;
  const slots = [...d.slots];
  const [s] = slots.splice(index, 1);
  slots.splice(to, 0, s);
  return { ...d, slots };
}

/** Set how many bars a chord lasts. */
export function setLength(d: BuilderDraft, index: number, length: SlotLength): BuilderDraft {
  if (index < 0 || index >= d.slots.length || !(SLOT_LENGTHS as readonly number[]).includes(length)) return d;
  return { ...d, slots: d.slots.map((s, i) => (i === index ? { ...s, length } : s)) };
}

/** Swap the chord at an index for another numeral, keeping its length. */
export function replaceSlot(d: BuilderDraft, index: number, token: string): BuilderDraft {
  if (index < 0 || index >= d.slots.length || !validToken(token, d)) return d;
  return { ...d, slots: d.slots.map((s, i) => (i === index ? { ...s, token } : s)) };
}

/** The draft's chart as one catalog-shaped progression (for spelling, the jam and the band). */
function asProgression(d: BuilderDraft, chartBars: string[][]): Progression {
  const feel = { ...feelFor(d.style) };
  const tips = d.mode === 'major'
    ? [{ degree: '1', scale: 'major-pentatonic' }, { degree: '1', scale: 'major' }]
    : [{ degree: '1', scale: 'minor-pentatonic' }, { degree: '1', scale: 'minor' }];
  return {
    id: d.savedId ?? 'my-draft',
    name: d.name.trim() || draftTitle(d),
    family: 'pop-rock',
    chart: chartBars.map((b) => b.join(' ')).join(' | '),
    bars: chartBars,
    tonality: d.mode,
    styles: [],
    level: 1,
    feel,
    why: '',
    tryThis: { scales: tips, strum: '' },
    related: [],
    keys: [d.tonic],
  };
}

/** The best spelling of a key a number of semitones away (B♭ rather than A♯, C♯ minor rather than D♭ minor). */
export function spellKey(d: BuilderDraft, pc: number): string {
  const layout = draftLayout(d);
  const bars = layout.bars.length ? layout.bars : [[d.mode === 'major' ? 'I' : 'i']];
  return bestTonic(asProgression(d, bars), ((pc % 12) + 12) % 12);
}

/** Move the whole draft to another key; the numerals stay, so every chord moves with it. */
export function transposeDraft(d: BuilderDraft, semitones: number): BuilderDraft {
  return { ...d, tonic: spellKey(d, chroma(d.tonic) + Math.round(semitones)) };
}

/** Put the draft in a key by tonic (respelled for the draft), keeping its numerals. */
export function setKey(d: BuilderDraft, tonic: string, mode: BuilderMode = d.mode): BuilderDraft {
  if (!isNote(tonic)) return d;
  const next = { ...d, mode };
  const slots = next.slots.filter((s) => validToken(s.token, { tonic, mode }));
  return { ...next, slots, tonic: spellKey({ ...next, slots }, chroma(tonic)) };
}

// ── Layout: slots to bars ────────────────────────────────────────────────────────────────────

/** The draft laid out in bars, and which slot each chord of each bar came from. */
export interface DraftLayout {
  bars: string[][];
  barSlots: number[][];
  /** True when the last chord was stretched by half a bar to fill its bar. */
  padded: boolean;
}

/**
 * Lay the slots out in bars of two halves. A half-bar chord shares its bar with its neighbour; a
 * chord that starts halfway through a bar carries on into the next; an odd half at the end is
 * filled by the last chord.
 */
export function draftLayout(d: Pick<BuilderDraft, 'slots'>): DraftLayout {
  const halves: number[] = [];
  d.slots.forEach((s, i) => {
    for (let k = 0; k < s.length * 2; k++) halves.push(i);
  });
  const padded = halves.length % 2 === 1;
  if (padded) halves.push(halves[halves.length - 1]);
  const bars: string[][] = [];
  const barSlots: number[][] = [];
  for (let i = 0; i < halves.length; i += 2) {
    const a = halves[i];
    const b = halves[i + 1];
    const ta = d.slots[a].token;
    const tb = d.slots[b].token;
    if (a === b || ta === tb) {
      bars.push([ta]);
      barSlots.push([a]);
    } else {
      bars.push([ta, tb]);
      barSlots.push([a, b]);
    }
  }
  return { bars, barSlots, padded };
}

/** The draft as a playable progression; null while it has no chords. */
export function draftProgression(d: BuilderDraft): Progression | null {
  const { bars } = draftLayout(d);
  if (!bars.length) return null;
  return asProgression(d, bars);
}

/** Numerals joined with dashes: the default name (`I–vi–IV–V`). */
export function draftTitle(d: Pick<BuilderDraft, 'slots'>, max = 8): string {
  const tokens = d.slots.map((s) => s.token).filter((t, i, all) => i === 0 || t !== all[i - 1]);
  if (!tokens.length) return 'New progression';
  const shown = tokens.slice(0, max).join('–');
  return tokens.length > max ? `${shown}…` : shown;
}

/** Total length in bars (after padding). */
export function draftBars(d: Pick<BuilderDraft, 'slots'>): number {
  return draftLayout(d).bars.length;
}

// ── The chords to tap ────────────────────────────────────────────────────────────────────────

/** Where a palette chord comes from. */
export type PaletteGroup = 'diatonic' | 'borrowed' | 'secondary';

/** One tappable chord. */
export interface PaletteChord {
  token: string;
  symbol: string;
  group: PaletteGroup;
  /** 1–7 for the key's own chords (the number key that adds it). */
  degree: number | null;
  /** Home, away or tension, for the key's own chords. */
  role: 'home' | 'away' | 'tension' | null;
  /** One sentence from the engine on what the chord is. */
  explanation: string;
  /** For a secondary dominant: the chord it leads to, in this key (`'Am'` for V7/ii in G). */
  leadsTo: string | null;
}

const MAJOR_BORROWED = ['iv', 'bVII', 'bVI', 'bIII', 'i', 'v', 'ii°', 'bII'];
const MINOR_BORROWED = ['IV', 'I', 'ii', 'bII'];

function roleOf(fn: string | undefined): PaletteChord['role'] {
  if (fn === 'tonic') return 'home';
  if (fn === 'subdominant') return 'away';
  if (fn === 'dominant') return 'tension';
  return null;
}

function explain(symbol: string, d: Pick<BuilderDraft, 'tonic' | 'mode'>): string {
  try {
    return chordToRoman(symbol, { tonic: d.tonic, mode: d.mode }).explanation;
  } catch {
    return '';
  }
}

/** The chords to tap in a key: the seven of the key (plus the major V and vii° in minor), and with `advanced` the borrowed and secondary ones. */
export function palette(d: Pick<BuilderDraft, 'tonic' | 'mode' | 'sevenths' | 'advanced'>): Record<PaletteGroup, PaletteChord[]> {
  const home = draftHome(d);
  const k = { tonic: d.tonic, mode: d.mode };
  const make = (token: string, group: PaletteGroup, degree: number | null, role: PaletteChord['role']): PaletteChord | null => {
    try {
      const symbol = resolveSlot(token, home).symbol;
      return { token, symbol, group, degree, role, explanation: explain(symbol, d), leadsTo: group === 'secondary' ? leadsTo(token) : null };
    } catch {
      return null;
    }
  };
  // V7/ii leads to ii; a tritone substitute (subV7) leads home, as the V7 it replaces does.
  const leadsTo = (token: string): string | null => {
    const target = token.includes('/') ? token.slice(token.indexOf('/') + 1) : token.startsWith('sub') ? (d.mode === 'major' ? 'I' : 'i') : null;
    if (!target) return null;
    try {
      return resolveSlot(target, home).symbol;
    } catch {
      return null;
    }
  };
  const own = diatonicChords(k, { sevenths: d.sevenths });
  const diatonic = own.map((c, i) => make(c.roman, 'diatonic', i + 1, roleOf(c.function))).filter((x): x is PaletteChord => !!x);
  if (d.mode === 'minor') {
    const harmonic = diatonicChords(k, { sevenths: d.sevenths, minor: 'harmonic' });
    for (const c of [harmonic[4], harmonic[6]]) {
      if (c && !diatonic.some((x) => x.token === c.roman)) {
        const p = make(c.roman, 'diatonic', null, roleOf(c.function));
        if (p) diatonic.push(p);
      }
    }
  }
  if (!d.advanced) return { diatonic, borrowed: [], secondary: [] };
  const borrowed = (d.mode === 'major' ? MAJOR_BORROWED : MINOR_BORROWED)
    .map((t) => make(t, 'borrowed', null, null))
    .filter((x): x is PaletteChord => !!x);
  const applied = [
    ...secondaryDominants(k, { sevenths: true }).map((s) => s.roman),
    ...tritoneSubstitutes(k).slice(0, 1).map((s) => s.roman),
  ];
  const secondary = applied.map((t) => make(t, 'secondary', null, null)).filter((x): x is PaletteChord => !!x);
  return { diatonic, borrowed, secondary };
}

/** The key's own chord on a degree 1–7 (for the number keys). */
export function degreeChord(d: Pick<BuilderDraft, 'tonic' | 'mode' | 'sevenths' | 'advanced'>, degree: number): PaletteChord | null {
  return palette({ ...d, advanced: false }).diatonic.find((c) => c.degree === degree) ?? null;
}

// ── What comes next, and the cadences ────────────────────────────────────────────────────────

/** A suggested next chord. */
export interface Suggestion {
  token: string;
  symbol: string;
  /** 0–1 among the suggestions. */
  probability: number;
  reason: string;
}

/**
 * The likely next chords after the draft's last chord, from the theory engine (most likely
 * first). An empty draft is offered its home chord.
 */
export function suggestNext(d: BuilderDraft, limit = 4): Suggestion[] {
  const home = draftHome(d);
  const homeToken = d.mode === 'major' ? (d.sevenths ? 'Imaj7' : 'I') : (d.sevenths ? 'i7' : 'i');
  const last = d.slots[d.slots.length - 1];
  if (!last) {
    try {
      return [{ token: homeToken, symbol: resolveSlot(homeToken, home).symbol, probability: 1, reason: 'Start at home: the chord the key is named after.' }];
    } catch {
      return [];
    }
  }
  const slot = parseSlot(last.token);
  if (!slot) return [];
  try {
    return nextChords(slot.numeral, { tonic: d.tonic, mode: d.mode }, { sevenths: d.sevenths, limit })
      .filter((n) => validToken(n.roman, d))
      .map((n) => ({ token: n.roman, symbol: resolveSlot(n.roman, home).symbol, probability: n.probability, reason: n.reason }));
  } catch {
    return [];
  }
}

/** A cadence the draft forms between two neighbouring chords. */
export interface DraftCadence {
  /** Index of the chord the cadence lands on. */
  at: number;
  /** True for the change from the last chord back to the first. */
  loop: boolean;
  cadence: Cadence;
}

/**
 * The cadences in the draft, in order. Authentic, plagal and deceptive cadences count wherever
 * they happen; a half cadence (stopping on V) only where the phrase stops: the last chord.
 */
export function draftCadences(d: BuilderDraft): DraftCadence[] {
  const home = draftHome(d);
  const symbols = d.slots.map((s) => {
    try {
      return resolveSlot(s.token, home).symbol;
    } catch {
      return null;
    }
  });
  const k = { tonic: d.tonic, mode: d.mode };
  const out: DraftCadence[] = [];
  const check = (i: number, j: number, loop: boolean) => {
    const a = symbols[i];
    const b = symbols[j];
    if (!a || !b || a === b) return;
    let c: Cadence | null = null;
    try {
      c = classifyCadence([a, b], k);
    } catch {
      c = null;
    }
    if (!c) return;
    if (c.type === 'half' && (loop || j !== d.slots.length - 1)) return;
    out.push({ at: j, loop, cadence: c });
  };
  for (let i = 1; i < symbols.length; i++) check(i - 1, i, false);
  if (symbols.length > 2) check(symbols.length - 1, 0, true);
  return out;
}

/** The cadence that the last chord just formed, if any (for announcing it as it forms). */
export function latestCadence(d: BuilderDraft): DraftCadence | null {
  const all = draftCadences(d).filter((c) => !c.loop);
  const last = all[all.length - 1];
  return last && last.at === d.slots.length - 1 ? last : null;
}
