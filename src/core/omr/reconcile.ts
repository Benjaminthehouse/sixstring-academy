/**
 * Putting the staves of a page together after the staff recognizers have read them:
 *
 * - `linkSystem`: a notation staff and the tab staff under it show the same music. Their events
 *   are paired by position (dynamic-programming alignment along the system, bar lines as anchors),
 *   then the two independent readings are compared note by note. Agreement raises confidence;
 *   a disagreement that one reader had as an alternative is settled in its favour and marked
 *   `resolved`; any other disagreement leaves both readings below 0.5 with the other reading as
 *   an alternative and a `staves-disagree` issue. The tab gives string / fret, the notation gives
 *   rhythm and spelling.
 * - `checkMeasures`: does each measure add up to the metre in force? (pickups allowed)
 * - `reconcileRhythm`: where the notation rhythm and the tab stems disagree, the staff whose
 *   measure adds up wins; otherwise both are marked as guesses.
 * - `estimateRhythmFromSpacing`: tab printed without any rhythm gets durations worked out from
 *   the horizontal spacing (clearly marked `inferred`, confidence 0.25), so it can still be played.
 */
import {
  type Alternative, type DurationValue, type OmrDuration, type OmrIssue, type OmrMeasure, type OmrNotationEvent, type OmrNote, type OmrPage,
  type OmrPitch, type OmrStaff, type OmrTabEvent, type OmrTabNote, type StepName, STANDARD_TUNING, durationTicks, isNotationEvent, isTabEvent,
  pitchAtStaffPosition,
} from './types';

// ------------------------------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------------------------------

const STEP_PC: Record<StepName, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEPS: StepName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_ORDER: StepName[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Name of a MIDI number for messages ("F#4"). */
export function midiName(midi: number): string {
  return `${NOTE_NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Alteration of each letter in a key signature (sharps positive). */
function keyAlterations(fifths: number): Record<StepName, number> {
  const out: Record<StepName, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (let i = 0; i < Math.min(7, Math.abs(fifths)); i++) {
    if (fifths > 0) out[SHARP_ORDER[i]] = 1;
    else out[SHARP_ORDER[6 - i]] = -1;
  }
  return out;
}

/**
 * The written pitch for a sounding MIDI number: at the given staff position when an accidental
 * can make it fit (that is how a misread accidental is corrected), else spelled for the key.
 * `octaveShift` is -12 for guitar notation.
 */
export function spellPitch(midi: number, fifths: number, staffPosition?: number, octaveShift = -12): OmrPitch {
  const written = midi - octaveShift;
  if (staffPosition !== undefined) {
    const natural = pitchAtStaffPosition(staffPosition, 0, octaveShift);
    const alter = written - natural.written;
    if (Math.abs(alter) <= 1) return pitchAtStaffPosition(staffPosition, alter, octaveShift);
  }
  const pc = ((written % 12) + 12) % 12;
  const keyAlt = keyAlterations(fifths);
  let best: { step: StepName; alter: number; cost: number } | null = null;
  for (const step of STEPS) {
    for (const alter of [-1, 0, 1]) {
      if ((((STEP_PC[step] + alter) % 12) + 12) % 12 !== pc) continue;
      // Prefer what the key signature already gives, then naturals, then the key's direction.
      const cost = alter === keyAlt[step] ? 0 : alter === 0 ? 1 : alter === (fifths < 0 ? -1 : 1) ? 2 : 3;
      if (!best || cost < best.cost) best = { step, alter, cost };
    }
  }
  const b = best as { step: StepName; alter: number };
  const octave = Math.floor((written - b.alter - STEP_PC[b.step]) / 12) - 1;
  return { step: b.step, alter: b.alter, octave, written, midi };
}

function addIssue(el: { issues?: OmrIssue[] }, issue: OmrIssue): void {
  const list = (el.issues ??= []);
  if (!list.some((i) => i.code === issue.code && i.message === issue.message)) list.push(issue);
}

/** Two independent readers agree: the chance that both are wrong the same way is small. */
function agreeConfidence(a: number, b: number): number {
  return Math.min(0.99, Math.max(a, b, 1 - (1 - a) * (1 - b)));
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Sounding pitch of the open string a tab note sits on (from its own fret and midi). */
const openOf = (n: OmrTabNote): number => n.midi - n.fret;

function sameDuration(a: OmrDuration, b: OmrDuration): boolean {
  const ta = a.tuplet ? `${a.tuplet.actual}:${a.tuplet.normal}` : '';
  const tb = b.tuplet ? `${b.tuplet.actual}:${b.tuplet.normal}` : '';
  return a.value === b.value && a.dots === b.dots && ta === tb;
}

// ------------------------------------------------------------------------------------------
// Linking a notation staff with its tab staff
// ------------------------------------------------------------------------------------------

/** What {@link linkSystem} did, for summaries and tests. */
export interface LinkStats {
  /** Event pairs (notation chord <-> tab column). */
  pairs: number;
  /** Note pairs whose pitches agree / were settled / still disagree. */
  agree: number;
  resolved: number;
  disagree: number;
  /** Chords with no tab column, tab columns with no chord. */
  notationOnly: number;
  tabOnly: number;
  /** Tab columns that took their rhythm from the notation. */
  rhythmCopied: number;
}

/** An empty {@link LinkStats}. */
export function emptyLinkStats(): LinkStats {
  return { pairs: 0, agree: 0, resolved: 0, disagree: 0, notationOnly: 0, tabOnly: 0, rhythmCopied: 0 };
}

/** Piecewise-linear map from tab-staff x to notation-staff x through bar lines both staves share. */
function xMapper(notation: OmrStaff, tab: OmrStaff): (x: number) => number {
  const space = notation.geometry.space;
  const anchors: [number, number][] = [[tab.geometry.x0, notation.geometry.x0], [tab.geometry.x1, notation.geometry.x1]];
  const used = new Set<number>();
  for (const tb of tab.barlines) {
    let best = -1;
    let bestD = 1.5 * space;
    notation.barlines.forEach((nb, k) => {
      const d = Math.abs(nb.x - tb.x);
      if (!used.has(k) && d < bestD) {
        bestD = d;
        best = k;
      }
    });
    if (best >= 0) {
      used.add(best);
      anchors.push([tb.x, notation.barlines[best].x]);
    }
  }
  anchors.sort((a, b) => a[0] - b[0]);
  const clean = anchors.filter((a, i) => i === 0 || a[0] - anchors[i - 1][0] > 1e-3);
  return (x: number): number => {
    let i = 0;
    while (i < clean.length - 2 && x > clean[i + 1][0]) i++;
    const [a0, b0] = clean[i];
    const [a1, b1] = clean[Math.min(i + 1, clean.length - 1)];
    if (a1 === a0) return b0 + (x - a0);
    return b0 + ((x - a0) * (b1 - b0)) / (a1 - a0);
  };
}

/**
 * Monotone one-to-one alignment of two sorted position lists (dynamic programming). `gain(i, j)`
 * is the value of pairing i with j, or -Infinity when they cannot be paired.
 */
export function alignSequences(n: number, m: number, gain: (i: number, j: number) => number): [number, number][] {
  const W = m + 1;
  const best = new Float64Array((n + 1) * W);
  const move = new Uint8Array((n + 1) * W); // 0 skip i, 1 skip j, 2 pair
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let v = -Infinity;
      let mv = 0;
      if (i > 0 && best[(i - 1) * W + j] > v) {
        v = best[(i - 1) * W + j];
        mv = 0;
      }
      if (j > 0 && best[i * W + j - 1] > v) {
        v = best[i * W + j - 1];
        mv = 1;
      }
      if (i > 0 && j > 0) {
        const g = gain(i - 1, j - 1);
        if (g > -Infinity && best[(i - 1) * W + j - 1] + g > v) {
          v = best[(i - 1) * W + j - 1] + g;
          mv = 2;
        }
      }
      best[i * W + j] = v;
      move[i * W + j] = mv;
    }
  }
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i * W + j];
    if (i > 0 && j > 0 && mv === 2) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (i > 0 && (j === 0 || mv === 0)) i--;
    else j--;
  }
  return pairs.reverse();
}

/** Support each reader gives to a sounding pitch: its own confidence for its reading, its alternatives' for those. */
function headSupport(h: OmrNote, midi: number): number {
  if (h.pitch.midi === midi) return h.confidence;
  const alt = h.alternatives?.find((a) => a.value.midi === midi);
  return alt ? alt.confidence : 0;
}

function tabSupport(t: OmrTabNote, midi: number): number {
  if (t.midi === midi) return t.confidence;
  const alt = t.alternatives?.find((a) => openOf(t) + a.value === midi);
  return alt ? alt.confidence : 0;
}

/** Compare one note head with the tab number found for it and settle what can be settled. */
function reconcileNotePair(h: OmrNote, t: OmrTabNote, fifths: number, stats: LinkStats): void {
  if (h.pitch.midi === t.midi) {
    const c = agreeConfidence(h.confidence, t.confidence);
    h.confidence = r2(c);
    t.confidence = r2(c);
    h.string = t.string;
    h.fret = t.fret;
    stats.agree++;
    return;
  }
  const options = [h.pitch.midi, t.midi];
  for (const a of h.alternatives ?? []) options.push(a.value.midi);
  for (const a of t.alternatives ?? []) options.push(openOf(t) + a.value);
  let best = h.pitch.midi;
  let bestScore = -1;
  for (const midi of new Set(options)) {
    const sn = headSupport(h, midi);
    const st = tabSupport(t, midi);
    // A pitch both readers find plausible beats one only one of them saw.
    const score = sn > 0 && st > 0 ? sn + st : 0.5 * Math.max(sn, st);
    if (score > bestScore) {
      bestScore = score;
      best = midi;
    }
  }
  const supportedByBoth = headSupport(h, best) > 0 && tabSupport(t, best) > 0;
  if (supportedByBoth) {
    // One reader had the other's reading as its runner-up: take it, keep the old one as an alternative.
    if (h.pitch.midi !== best) {
      const old = h.pitch;
      const alt = h.alternatives?.find((a) => a.value.midi === best);
      h.pitch = alt ? alt.value : spellPitch(best, fifths, h.staffPosition);
      h.alternatives = [{ value: old, confidence: r2(Math.min(0.45, h.confidence * 0.5)) }, ...(h.alternatives ?? []).filter((a) => a.value.midi !== best && a.value.midi !== old.midi)];
      h.source = 'merged';
      addIssue(h, { code: 'resolved', message: `Read as ${midiName(old.midi)} here, changed to ${midiName(best)} to match the tab (fret ${t.fret} on string ${t.string}).` });
    }
    if (t.midi !== best) {
      const oldFret = t.fret;
      t.fret = best - openOf(t);
      t.midi = best;
      t.alternatives = [{ value: oldFret, confidence: r2(Math.min(0.45, t.confidence * 0.5)) }, ...(t.alternatives ?? []).filter((a) => a.value !== t.fret && a.value !== oldFret)];
      t.source = 'merged';
      addIssue(t, { code: 'resolved', message: `Read as fret ${oldFret}, changed to fret ${t.fret} to match the note ${midiName(best)} in the notation above.` });
    }
    const c = r2(Math.max(0.5, Math.min(0.7, bestScore / 2)));
    h.confidence = c;
    t.confidence = c;
    h.string = t.string;
    h.fret = t.fret;
    stats.resolved++;
    return;
  }
  // Unresolved: both stay as read, both become guesses, each offers the other's reading.
  const tabAsPitch = spellPitch(t.midi, fifths, h.staffPosition);
  h.alternatives = [{ value: tabAsPitch, confidence: r2(Math.min(0.45, t.confidence * 0.8)) }, ...(h.alternatives ?? []).filter((a) => a.value.midi !== t.midi)];
  const fretFromNotation = h.pitch.midi - openOf(t);
  if (fretFromNotation >= 0 && fretFromNotation <= 24) {
    t.alternatives = [{ value: fretFromNotation, confidence: r2(Math.min(0.45, h.confidence * 0.8)) }, ...(t.alternatives ?? []).filter((a) => a.value !== fretFromNotation)];
  }
  h.confidence = r2(Math.min(0.4, h.confidence));
  t.confidence = r2(Math.min(0.4, t.confidence));
  const msg = `The notation shows ${midiName(h.pitch.midi)} but the tab shows fret ${t.fret} on string ${t.string} (${midiName(t.midi)}).`;
  addIssue(h, { code: 'staves-disagree', message: msg });
  addIssue(t, { code: 'staves-disagree', message: msg });
  h.string = t.string;
  h.fret = t.fret;
  stats.disagree++;
}

/** Pair the heads of a chord with the numbers of a tab column: equal pitches first, then by pitch order. */
function pairNotes(heads: OmrNote[], nums: OmrTabNote[]): { pairs: [OmrNote, OmrTabNote][]; heads: OmrNote[]; nums: OmrTabNote[] } {
  const hs = heads.slice().sort((a, b) => a.pitch.midi - b.pitch.midi);
  const ts = nums.slice().sort((a, b) => a.midi - b.midi || b.string - a.string);
  const pairs: [OmrNote, OmrTabNote][] = [];
  const freeH = new Set(hs);
  const freeT = new Set(ts);
  for (const h of hs) {
    const t = ts.find((q) => freeT.has(q) && q.midi === h.pitch.midi);
    if (t) {
      pairs.push([h, t]);
      freeH.delete(h);
      freeT.delete(t);
    }
  }
  const restH = hs.filter((h) => freeH.has(h));
  const restT = ts.filter((t) => freeT.has(t));
  // What is left is paired in pitch order only when the counts match (otherwise the extra notes
  // cannot be told apart and are reported as found on one staff only).
  if (restH.length === restT.length) {
    restH.forEach((h, i) => pairs.push([h, restT[i]]));
    return { pairs, heads: [], nums: [] };
  }
  const k = Math.min(restH.length, restT.length);
  // Pair the nearest pitches.
  const cand: { h: OmrNote; t: OmrTabNote; d: number }[] = [];
  for (const h of restH) for (const t of restT) cand.push({ h, t, d: Math.abs(h.pitch.midi - t.midi) });
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) {
    if (pairs.length >= k + (hs.length - restH.length)) break;
    if (!freeH.has(c.h) || !freeT.has(c.t) || c.d > 2) continue;
    pairs.push([c.h, c.t]);
    freeH.delete(c.h);
    freeT.delete(c.t);
  }
  return { pairs, heads: hs.filter((h) => freeH.has(h)), nums: ts.filter((t) => freeT.has(t)) };
}

/**
 * Link a notation staff with the tab staff of the same system: pair their events, copy string /
 * fret onto the heads and the rhythm onto tab columns that have none, compare pitches. Mutates
 * both staves. `fifths` is the key in force (for spelling corrected pitches).
 */
export function linkSystem(notation: OmrStaff, tab: OmrStaff, fifths = notation.keyInForce?.fifths ?? notation.keySignature?.fifths ?? 0, stats: LinkStats = emptyLinkStats()): LinkStats {
  const chords = notation.measures.flatMap((m) => m.events).filter((e): e is OmrNotationEvent => e.kind === 'chord' && !e.grace).sort((a, b) => a.x - b.x);
  const cols = tab.measures.flatMap((m) => m.events).filter((e): e is OmrTabEvent => e.kind === 'tab').sort((a, b) => a.x - b.x);
  if (!chords.length && !cols.length) return stats;
  const map = xMapper(notation, tab);
  const tx = cols.map((c) => map(c.x));
  const tol = 1.25 * notation.geometry.space;
  const pairs = alignSequences(chords.length, cols.length, (i, j) => {
    const d = Math.abs(chords[i].x - tx[j]);
    if (d > tol) return -Infinity;
    const common = chords[i].notes.some((h) => cols[j].notes.some((t) => t.midi === h.pitch.midi));
    return 1 - 0.5 * (d / tol) + (common ? 0.3 : 0);
  });
  const pairedN = new Set<number>();
  const pairedT = new Set<number>();
  for (const [i, j] of pairs) {
    pairedN.add(i);
    pairedT.add(j);
    const n = chords[i];
    const t = cols[j];
    stats.pairs++;
    n.linkedEventId = t.id;
    t.linkedEventId = n.id;
    if (!t.duration) {
      t.duration = { ...n.duration, confidence: r2(n.duration.confidence * 0.95), source: 'merged' };
      stats.rhythmCopied++;
    }
    const { pairs: np, heads, nums } = pairNotes(n.notes, t.notes);
    for (const [h, q] of np) reconcileNotePair(h, q, fifths, stats);
    for (const h of heads) {
      h.confidence = r2(h.confidence * 0.8);
      addIssue(h, { code: 'unlinked', message: `${midiName(h.pitch.midi)} has no fret number in the tab below.` });
    }
    for (const q of nums) {
      q.confidence = r2(q.confidence * 0.8);
      addIssue(q, { code: 'unlinked', message: `Fret ${q.fret} on string ${q.string} has no note head in the notation above.` });
    }
    const lowest = Math.min(...n.notes.map((h) => h.confidence), ...t.notes.map((q) => q.confidence));
    n.confidence = r2(Math.min(n.confidence, Math.max(lowest, n.confidence * 0.8)));
  }
  chords.forEach((n, i) => {
    if (pairedN.has(i)) return;
    // A tied-to note is often left out of the tab; anything else should be in both.
    if (n.notes.every((h) => h.tieStop)) return;
    stats.notationOnly++;
    n.confidence = r2(n.confidence * 0.8);
    addIssue(n, { code: 'unlinked', message: 'This note was not found in the tab below.' });
  });
  cols.forEach((t, j) => {
    if (pairedT.has(j)) return;
    if (t.notes.every((q) => q.tieStop || q.parenthesized)) return;
    stats.tabOnly++;
    t.confidence = r2(t.confidence * 0.8);
    addIssue(t, { code: 'unlinked', message: 'These fret numbers have no note in the notation above.' });
  });
  return stats;
}

/** Link every notation staff of a page with its tab partner. */
export function linkPage(page: OmrPage): LinkStats {
  const stats = emptyLinkStats();
  for (const sys of page.systems) {
    for (const staff of sys.staves) {
      if (staff.kind !== 'notation' || !staff.linkedStaffId) continue;
      const tab = sys.staves.find((s) => s.id === staff.linkedStaffId);
      if (tab) linkSystem(staff, tab, undefined, stats);
    }
  }
  return stats;
}

// ------------------------------------------------------------------------------------------
// Measures: do they add up? Rhythm agreement between linked staves; rhythm from spacing.
// ------------------------------------------------------------------------------------------

/** Ticks of a measure in a metre (960 per quarter). */
export function metreTicks(beats: number, beatValue: number): number {
  return Math.round((beats * 3840) / beatValue);
}

/** Sum of a measure's durations per voice, or null when some event has no duration. */
function voiceSums(m: OmrMeasure): number[] | null {
  const sums = new Map<number, number>();
  for (const e of m.events) {
    if (isNotationEvent(e) && e.grace) continue;
    if (!e.duration) return null;
    const v = isNotationEvent(e) ? e.voice ?? 1 : 1;
    sums.set(v, (sums.get(v) ?? 0) + e.duration.ticks);
  }
  return sums.size ? [...sums.values()] : null;
}

/**
 * Fill `ticks`, `expectedTicks` and `addsUp` on every measure of a staff. The first measure may
 * be an upbeat (`pickup`) when `allowPickup`; the last may then be short as well.
 */
export function checkMeasures(staff: OmrStaff, expected: number | null, allowPickup = false, isLastStaff = false): { checked: number; bad: number } {
  let checked = 0;
  let bad = 0;
  staff.measures.forEach((m, i) => {
    delete m.addsUp;
    const sums = voiceSums(m);
    if (!sums || !expected) return;
    m.ticks = Math.max(...sums);
    m.expectedTicks = expected;
    const ok = sums.every((s) => s === expected);
    const short = sums.every((s) => s < expected);
    if (!ok && short && allowPickup && (i === 0 || (isLastStaff && i === staff.measures.length - 1))) {
      if (i === 0) m.pickup = true;
      return;
    }
    m.addsUp = ok;
    checked++;
    if (!ok) bad++;
  });
  return { checked, bad };
}

/**
 * Notation rhythm against tab stems for linked pairs: where they disagree, the staff whose measure
 * adds up wins (the other keeps its reading as an alternative); otherwise both become guesses.
 * Returns the number of disagreements found.
 */
export function reconcileRhythm(page: OmrPage): number {
  let found = 0;
  const byId = new Map<string, { e: OmrTabEvent; m: OmrMeasure }>();
  const measureOf = new Map<string, OmrMeasure>();
  for (const sys of page.systems) {
    for (const st of sys.staves) {
      for (const m of st.measures) {
        for (const e of m.events) {
          measureOf.set(e.id, m);
          if (isTabEvent(e)) byId.set(e.id, { e, m });
        }
      }
    }
  }
  for (const sys of page.systems) {
    for (const st of sys.staves) {
      if (st.kind !== 'notation') continue;
      for (const m of st.measures) {
        for (const n of m.events) {
          if (!isNotationEvent(n) || !n.linkedEventId) continue;
          const pair = byId.get(n.linkedEventId);
          if (!pair || !pair.e.duration || pair.e.duration.source === 'merged') continue;
          const t = pair.e;
          const td = t.duration as OmrDuration;
          if (sameDuration(n.duration, td)) {
            const c = r2(agreeConfidence(n.duration.confidence, td.confidence));
            n.duration.confidence = c;
            td.confidence = c;
            continue;
          }
          found++;
          const msg = `The notation shows ${describe(n.duration)} here but the stems under the tab show ${describe(td)}.`;
          if (m.addsUp && pair.m.addsUp !== true) {
            t.duration = { ...n.duration, confidence: r2(Math.min(0.6, n.duration.confidence)), source: 'merged', alternatives: [{ value: { value: td.value, dots: td.dots }, confidence: r2(Math.min(0.45, td.confidence)) }] };
            addIssue(t, { code: 'resolved', message: msg });
          } else if (pair.m.addsUp && m.addsUp !== true) {
            n.duration = { ...td, confidence: r2(Math.min(0.6, td.confidence)), source: 'merged', alternatives: [{ value: { value: n.duration.value, dots: n.duration.dots }, confidence: r2(Math.min(0.45, n.duration.confidence)) }] };
            addIssue(n, { code: 'resolved', message: msg });
          } else {
            n.duration.confidence = r2(Math.min(0.4, n.duration.confidence));
            td.confidence = r2(Math.min(0.4, td.confidence));
            addIssue(n, { code: 'rhythm-disagree', message: msg });
            addIssue(t, { code: 'rhythm-disagree', message: msg });
          }
        }
      }
    }
  }
  return found;
}

function describe(d: { value: DurationValue; dots: number; tuplet?: { actual: number } }): string {
  const name = d.value === '16th' ? 'sixteenth' : d.value === '32nd' ? 'thirty-second' : d.value;
  const dots = d.dots === 2 ? 'double-dotted ' : d.dots === 1 ? 'dotted ' : '';
  const tup = d.tuplet ? ' (triplet)' : '';
  return `a ${dots}${name}${tup}`.replace(/^a (e|a)/, 'an $1');
}

/** Units (sixteenths) that one printed value can stand for, with its value and dots. */
const UNIT_VALUES: [number, DurationValue, 0 | 1][] = [
  [1, '16th', 0], [2, 'eighth', 0], [3, 'eighth', 1], [4, 'quarter', 0], [6, 'quarter', 1], [8, 'half', 0], [12, 'half', 1], [16, 'whole', 0], [24, 'whole', 1],
];

/**
 * Durations for a measure of tab printed without rhythm, from the spacing of its columns: each
 * column gets a share of the measure proportional to the room after it, rounded to values that
 * fill the measure exactly (dynamic programming on sixteenths, or thirty-seconds when crowded).
 * Every duration is marked `inferred` with confidence 0.25. Returns false when it cannot.
 */
export function estimateRhythmFromSpacing(m: OmrMeasure, measureTicks: number, leftPad: number): boolean {
  const events = m.events.filter((e) => isTabEvent(e)).sort((a, b) => a.x - b.x);
  if (!events.length || events.some((e) => e.duration)) return false;
  const xs = events.map((e) => e.x);
  const gaps: number[] = [];
  for (let i = 0; i + 1 < xs.length; i++) gaps.push(Math.max(1e-3, xs[i + 1] - xs[i]));
  const med = gaps.length ? gaps.slice().sort((a, b) => a - b)[gaps.length >> 1] : m.x1 - m.x0;
  // The last column's room runs to the bar line, minus the little space engravers leave before a
  // bar line (less than after one: about 0.4 of the opening padding).
  gaps.push(Math.max(0.5 * med, m.x1 - xs[xs.length - 1] - 0.4 * leftPad));
  let unit = 240;
  let U = Math.round(measureTicks / unit);
  if (events.length > U) {
    unit = 120;
    U = Math.round(measureTicks / unit);
  }
  if (U * unit !== measureTicks || events.length > U) return false;
  const scale = unit === 120 ? 2 : 1;
  const sizes = UNIT_VALUES.map(([u]) => u * scale).filter((u) => u <= U);
  const total = gaps.reduce((a, b) => a + b, 0);
  const want = gaps.map((g) => (g / total) * U);
  // cost[i][s]: best cost for the first i events using s units.
  const n = events.length;
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(U + 1).fill(INF));
  const pick: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(U + 1).fill(-1));
  cost[0][0] = 0;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s <= U; s++) {
      if (cost[i][s] === INF) continue;
      for (const u of sizes) {
        if (s + u > U) continue;
        const c = cost[i][s] + Math.log(u / want[i]) ** 2;
        if (c < cost[i + 1][s + u]) {
          cost[i + 1][s + u] = c;
          pick[i + 1][s + u] = u;
        }
      }
    }
  }
  if (cost[n][U] === INF) return false;
  const units: number[] = [];
  for (let i = n, s = U; i > 0; i--) {
    const u = pick[i][s];
    units.unshift(u);
    s -= u;
  }
  events.forEach((e, i) => {
    const sixteenths = units[i] / scale;
    const entry = UNIT_VALUES.find(([u]) => u === sixteenths);
    let value: DurationValue;
    let dots: 0 | 1;
    if (entry) [, value, dots] = entry;
    else if (unit === 120 && units[i] === 1) {
      value = '32nd';
      dots = 0;
    } else {
      value = '16th';
      dots = 0;
    }
    (e as OmrTabEvent).duration = { value, dots, ticks: durationTicks(value, dots), confidence: 0.25, source: 'inferred' };
  });
  addIssue(m, { code: 'rhythm-estimated', message: 'No rhythm is printed here: the note lengths were estimated from the spacing.' });
  return true;
}

// ------------------------------------------------------------------------------------------
// The metre sanity pass: every measure must fit its time signature, or say that it does not
// ------------------------------------------------------------------------------------------

/** Values a missing or doubtful length may take, longest first, in ticks. */
const FIT_VALUES: { value: DurationValue; dots: 0 | 1; ticks: number }[] = (['whole', 'half', 'quarter', 'eighth', '16th', '32nd'] as DurationValue[])
  .flatMap((value) => [1, 0].map((dots) => ({ value, dots: dots as 0 | 1, ticks: durationTicks(value, dots) })))
  .filter((v) => !(v.value === '32nd' && v.dots));

/** The value of a length in ticks, or the nearest one below it. */
function valueOfTicks(ticks: number): { value: DurationValue; dots: 0 | 1; ticks: number } {
  return FIT_VALUES.find((v) => v.ticks <= ticks + 1) ?? FIT_VALUES[FIT_VALUES.length - 1];
}

/**
 * Lengths for the columns of a tab measure that got none (no stem was found under them on a bad
 * photo) while others did: what the measure still lacks is shared out by the room after each of
 * them, in note values that fill it exactly. Without that, they would be dropped from the song.
 * When the rest of the measure leaves nothing (or no exact fill exists) they get the length their
 * spacing suggests and the measure is left to the check below. Returns the number filled.
 */
export function fillMissingDurations(m: OmrMeasure, measureTicks: number): number {
  const events = m.events.filter(isTabEvent).slice().sort((a, b) => a.x - b.x);
  const missing = events.filter((e) => !e.duration && e.kind === 'tab');
  if (!missing.length || missing.length === events.length) return 0;
  const room = (e: OmrTabEvent): number => {
    const i = events.indexOf(e);
    const next = events[i + 1];
    return Math.max(1, (next ? next.x : m.x1) - e.x);
  };
  // Ticks per pixel, from the columns whose length was read.
  const rates = events.filter((e) => e.duration).map((e) => (e.duration as OmrDuration).ticks / room(e)).sort((a, b) => a - b);
  const rate = rates[rates.length >> 1];
  const known = events.reduce((a, e) => a + (e.duration?.ticks ?? 0), 0);
  const remaining = measureTicks - known;
  const want = missing.map((e) => room(e) * rate);
  let chosen: { value: DurationValue; dots: 0 | 1; ticks: number }[] | null = null;
  if (remaining > 0) {
    // Exact fill on a grid of sixteenths (thirty-seconds when crowded): dynamic programming, as for spacing.
    const unit = missing.length * 240 > remaining ? 120 : 240;
    const U = Math.round(remaining / unit);
    if (U * unit === remaining && U >= missing.length) {
      const sizes = FIT_VALUES.filter((v) => v.ticks % unit === 0 && v.ticks <= remaining);
      const INF = Number.POSITIVE_INFINITY;
      const cost: number[][] = Array.from({ length: missing.length + 1 }, () => new Array<number>(U + 1).fill(INF));
      const pick: number[][] = Array.from({ length: missing.length + 1 }, () => new Array<number>(U + 1).fill(-1));
      cost[0][0] = 0;
      for (let i = 0; i < missing.length; i++) {
        for (let u = 0; u <= U; u++) {
          if (cost[i][u] === INF) continue;
          sizes.forEach((v, k) => {
            const n = v.ticks / unit;
            if (u + n > U) return;
            const c = cost[i][u] + Math.log(v.ticks / Math.max(1, want[i])) ** 2;
            if (c < cost[i + 1][u + n]) {
              cost[i + 1][u + n] = c;
              pick[i + 1][u + n] = k;
            }
          });
        }
      }
      if (cost[missing.length][U] < INF) {
        chosen = [];
        for (let i = missing.length, u = U; i > 0; i--) {
          const v = sizes[pick[i][u]];
          chosen.unshift(v);
          u -= v.ticks / unit;
        }
      }
    }
  }
  const exact = !!chosen;
  chosen ??= want.map((w) => valueOfTicks(Math.max(120, w)));
  missing.forEach((e, i) => {
    const v = chosen![i];
    e.duration = { value: v.value, dots: v.dots, ticks: v.ticks, confidence: exact ? 0.3 : 0.2, source: 'inferred' };
    addIssue(e, { code: 'rhythm-estimated', message: 'No stem was found under this number: its length was worked out from the spacing and the rest of the measure.' });
  });
  return missing.length;
}

/**
 * A measure that does not fit its metre, with one voice, where a single doubtful length has a
 * runner-up (or a dot more or less) that would make it fit exactly, and no other change would do
 * as well: that reading is offered first as the one-tap fix, and the length is marked as a guess
 * saying so. The length itself is not changed: measured on both corpora, changing it was right
 * less often than not (a measure that does not add up is more often missing a note than holding a
 * wrong length). Returns true when it offered one.
 */
export function suggestMetreFix(m: OmrMeasure, measureTicks: number, metre: string): boolean {
  if (m.addsUp !== false || m.pickup) return false;
  const events = m.events.filter((e) => e.duration && !(isNotationEvent(e) && e.grace));
  if (!events.length || events.some((e) => isNotationEvent(e) && (e.voice ?? 1) !== 1)) return false;
  const sum = events.reduce((a, e) => a + (e.duration as OmrDuration).ticks, 0);
  const diff = sum - measureTicks;
  if (!diff) return false;
  const options: { e: (typeof events)[number]; value: DurationValue; dots: 0 | 1 | 2; cost: number }[] = [];
  for (const e of events) {
    const d = e.duration as OmrDuration;
    // A length read clearly is not questioned; nor is a triplet (its group decides it).
    if (d.confidence >= 0.8 || d.tuplet) continue;
    const tried = new Set<string>([`${d.value}.${d.dots}`]);
    const consider = (value: DurationValue, dots: 0 | 1 | 2, prior: number) => {
      const key = `${value}.${dots}`;
      if (tried.has(key)) return;
      tried.add(key);
      if (d.ticks - durationTicks(value, dots) !== diff) return;
      options.push({ e, value, dots, cost: d.confidence + (1 - prior) });
    };
    for (const a of d.alternatives ?? []) consider(a.value.value, a.value.dots, a.confidence);
    // A dot is the easiest thing to miss or to see in a speck.
    if (d.dots === 0) consider(d.value, 1, 0.35);
    if (d.dots === 1) consider(d.value, 0, 0.35);
  }
  if (!options.length) return false;
  options.sort((a, b) => a.cost - b.cost);
  // Two equally good ways to make it fit: no way to tell which one to offer.
  if (options.length > 1 && options[1].cost - options[0].cost < 0.15) return false;
  const best = options[0];
  const d = best.e.duration as OmrDuration;
  const fix = { value: best.value, dots: best.dots };
  d.alternatives = [{ value: fix, confidence: r2(Math.min(0.45, Math.max(0.3, 1 - best.cost / 2))) }, ...(d.alternatives ?? []).filter((a) => !(a.value.value === fix.value && a.value.dots === fix.dots))];
  d.confidence = r2(Math.min(d.confidence, 0.45));
  addIssue(best.e, { code: 'measure-does-not-fit', message: `This measure does not fit ${metre}; ${describe(fix)} here instead of ${describe(d)} would make it fit. Check it by ear.` });
  return true;
}

/** Mark every measure that still does not fit its metre (one issue on the measure, saying by how much). */
export function flagMeasuresOffMetre(staff: OmrStaff): number {
  let n = 0;
  for (const m of staff.measures) {
    if (m.addsUp !== false || !m.expectedTicks || m.ticks === undefined) continue;
    const t = staff.timeInForce;
    const metre = t ? `${t.beats}/${t.beatValue}` : 'the time signature';
    const q = (v: number) => `${Math.round((v / 960) * 100) / 100}`;
    addIssue(m, { code: 'measure-does-not-fit', message: `This measure does not fit ${metre}: its notes and rests add up to ${q(m.ticks)} quarter notes, the time signature asks for ${q(m.expectedTicks)}.` });
    n++;
  }
  return n;
}

/** Room between the opening bar line and the first column, typical over a staff (for the spacing estimate). */
export function typicalLeftPad(staff: OmrStaff): number {
  const pads: number[] = [];
  staff.measures.forEach((m, i) => {
    if (i === 0) return;
    const first = m.events.filter(isTabEvent).sort((a, b) => a.x - b.x)[0];
    if (first) pads.push(first.x - m.x0);
  });
  if (!pads.length) return staff.geometry.space;
  pads.sort((a, b) => a - b);
  return pads[pads.length >> 1];
}

/** All alternatives of a list, best first, without duplicates of the primary value. */
export function mergeAlternatives<T>(primary: T, list: Alternative<T>[], key: (v: T) => string): Alternative<T>[] {
  const seen = new Set([key(primary)]);
  const out: Alternative<T>[] = [];
  for (const a of list.slice().sort((p, q) => q.confidence - p.confidence)) {
    const k = key(a.value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/** Default tuning when a staff carries none. */
export const DEFAULT_TUNING = STANDARD_TUNING;
