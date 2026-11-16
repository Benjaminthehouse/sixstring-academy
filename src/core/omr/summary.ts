/**
 * What a screen can honestly say about a reading, and what the user should check first.
 *
 *   const s = summarizePage(page);
 *   s.headline;    // "Read well: 3 things to check"
 *   s.lines;       // ["Tab numbers: 212 read, 5 uncertain.", "Rhythm: estimated from spacing ...", ...]
 *   s.proofread;   // items to look at, most important first, each with its box on the picture
 *
 * Nothing here changes the reading. "Uncertain" means confidence below 0.5 (a guess); the counts
 * are of what was found, so they say nothing about what was missed altogether, which is why a
 * poor picture is called out on its own.
 */
import type { OmrDocument } from './pipeline';
import { midiName } from './reconcile';
import {
  type BBox, type OmrDuration, type OmrIssue, type OmrMeasure, type OmrNotationEvent, type OmrPage, type OmrStaff, type OmrTabEvent, isNotationEvent,
  isTabEvent,
} from './types';

/** Below this a reading is a guess. */
export const GUESS = 0.5;

/** One thing to check. */
export interface ProofreadItem {
  /** Id of the element (note, tab number, event, measure, staff). */
  id: string;
  page: number;
  staffId: string;
  measureIndex?: number;
  what: 'tab-number' | 'note' | 'rest' | 'rhythm' | 'measure' | 'staff' | 'key' | 'time';
  /** Where to look, in px of the page picture. */
  bbox: BBox;
  /** What was read, in words ("fret 5 on string 2"). */
  reading: string;
  /** Why it is listed. */
  reason: string;
  confidence: number;
  /** Other readings, best first, in words (for one-tap correction). */
  alternatives: string[];
  /** Ranking score (higher = check sooner): how much music it affects times how doubtful it is. */
  impact: number;
}

/** Counts behind the summary sentences. */
export interface SummaryCounts {
  staves: { notation: number; tab: number };
  tabNumbers: number;
  tabUncertain: number;
  notes: number;
  notesUncertain: number;
  rests: number;
  measures: number;
  measuresChecked: number;
  measuresWrong: number;
  /** Note pairs of linked staves: agreeing, settled by a rule, still disagreeing. */
  linkedAgree: number;
  linkedResolved: number;
  linkedDisagree: number;
  /** Measures whose rhythm was estimated from spacing. */
  rhythmEstimated: number;
}

/** Where the rhythm of the reading comes from. */
export type RhythmSource = 'notation' | 'tab-stems' | 'estimated' | 'mixed' | 'none';

/** Result of {@link summarizePage}. */
export interface OmrSummary {
  /** 'good': read cleanly; 'check': usable, some items to check; 'poor': proofread everything or retake the picture. */
  verdict: 'good' | 'check' | 'poor';
  headline: string;
  /** Plain sentences, most important first. */
  lines: string[];
  counts: SummaryCounts;
  rhythm: RhythmSource;
  /** Things to check, most important first (at most `limit`). */
  proofread: ProofreadItem[];
  /** How many items there were before the limit. */
  proofreadTotal: number;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function durationWords(d: OmrDuration): string {
  const name = d.value === '16th' ? 'sixteenth' : d.value === '32nd' ? 'thirty-second' : d.value;
  return `${d.dots === 2 ? 'double-dotted ' : d.dots === 1 ? 'dotted ' : ''}${name}${d.tuplet ? ' triplet' : ''}`;
}

const KEY_NAMES: Record<number, string> = { [-7]: 'Cb major', [-6]: 'Gb major', [-5]: 'Db major', [-4]: 'Ab major', [-3]: 'Eb major', [-2]: 'Bb major', [-1]: 'F major', 0: 'C major', 1: 'G major', 2: 'D major', 3: 'A major', 4: 'E major', 5: 'B major', 6: 'F# major', 7: 'C# major' };
const KEY_MINOR: Record<number, string> = { [-7]: 'Ab minor', [-6]: 'Eb minor', [-5]: 'Bb minor', [-4]: 'F minor', [-3]: 'C minor', [-2]: 'G minor', [-1]: 'D minor', 0: 'A minor', 1: 'E minor', 2: 'B minor', 3: 'F# minor', 4: 'C# minor', 5: 'G# minor', 6: 'D# minor', 7: 'A# minor' };

function issueText(issues: OmrIssue[] | undefined): string | null {
  return issues?.length ? issues.map((i) => i.message).join(' ') : null;
}

/** Summarise one page (or pass `pageIndex` when it belongs to a document). */
export function summarizePage(page: OmrPage, opts: { limit?: number } = {}): OmrSummary {
  return summarize([page], opts);
}

/** Summarise every page of a document as one piece. */
export function summarizeDocument(doc: OmrDocument, opts: { limit?: number } = {}): OmrSummary {
  return summarize(doc.pages, opts);
}

function summarize(pages: OmrPage[], opts: { limit?: number }): OmrSummary {
  const counts: SummaryCounts = {
    staves: { notation: 0, tab: 0 }, tabNumbers: 0, tabUncertain: 0, notes: 0, notesUncertain: 0, rests: 0, measures: 0, measuresChecked: 0, measuresWrong: 0,
    linkedAgree: 0, linkedResolved: 0, linkedDisagree: 0, rhythmEstimated: 0,
  };
  const items: ProofreadItem[] = [];
  const rhythmKinds = new Set<string>();
  const keys = new Set<string>();
  const times = new Set<string>();
  let assumedTime = false;
  let unknownKey = false;
  pages.forEach((page, pi) => {
    const p = page.pageIndex ?? pi;
    for (const sys of page.systems) {
      for (const staff of sys.staves) {
        counts.staves[staff.kind]++;
        const kindAlt = staff.kindAlternatives?.find((a) => a.value !== staff.kind);
        if (kindAlt && kindAlt.confidence > 0.3) {
          items.push({ id: staff.id, page: p, staffId: staff.id, what: 'staff', bbox: staff.geometry.bbox, reading: `${staff.kind === 'tab' ? 'tab' : 'notation'} staff`, reason: `This staff might be ${kindAlt.value === 'tab' ? 'tab' : 'standard notation'} instead.`, confidence: 1 - kindAlt.confidence, alternatives: [kindAlt.value], impact: 200 * kindAlt.confidence });
        }
        if (staff.timeInForce) {
          times.add(`${staff.timeInForce.beats}/${staff.timeInForce.beatValue}`);
          if (staff.timeInForce.source === 'assumed' && staff.measures.some((m) => m.events.length)) assumedTime = true;
        }
        if (staff.kind === 'notation' && staff.keyInForce) {
          keys.add(String(staff.keyInForce.fifths));
          if (staff.keyInForce.source === 'assumed' && staff.measures.some((m) => m.events.length)) unknownKey = true;
        }
        if (staff.keySignature && staff.keySignature.confidence < GUESS) {
          const events = staff.measures.reduce((a, m) => a + m.events.length, 0);
          items.push({ id: staff.keySignature.id || `${staff.id}.key`, page: p, staffId: staff.id, what: 'key', bbox: staff.keySignature.bbox, reading: keyWords(staff.keySignature.fifths), reason: 'The key signature is hard to read; it changes every note on the staff.', confidence: staff.keySignature.confidence, alternatives: (staff.keySignature.alternatives ?? []).map((a) => keyWords(a.value)), impact: (1 - staff.keySignature.confidence) * 10 * (events + 5) });
        }
        if (staff.timeSignature && staff.timeSignature.confidence < GUESS) {
          items.push({ id: staff.timeSignature.id || `${staff.id}.time`, page: p, staffId: staff.id, what: 'time', bbox: staff.timeSignature.bbox, reading: `${staff.timeSignature.beats}/${staff.timeSignature.beatValue}`, reason: 'The time signature is hard to read; every measure is checked against it.', confidence: staff.timeSignature.confidence, alternatives: (staff.timeSignature.alternatives ?? []).map((a) => `${a.value.beats}/${a.value.beatValue}`), impact: (1 - staff.timeSignature.confidence) * 120 });
        }
        for (const m of staff.measures) summarizeMeasure(m, staff, p, counts, items, rhythmKinds);
      }
    }
  });
  // Linked-pair statistics come from the issues the linker left on tab numbers.
  for (const page of pages) {
    for (const sys of page.systems) {
      for (const staff of sys.staves) {
        if (staff.kind !== 'tab' || !staff.linkedStaffId) continue;
        for (const m of staff.measures) {
          for (const e of m.events) {
            if (!isTabEvent(e) || !e.linkedEventId) continue;
            for (const n of e.notes) {
              const codes = n.issues?.map((i) => i.code) ?? [];
              if (codes.includes('staves-disagree')) counts.linkedDisagree++;
              else if (codes.includes('resolved')) counts.linkedResolved++;
              else if (!codes.includes('unlinked')) counts.linkedAgree++;
            }
          }
        }
      }
    }
  }
  items.sort((a, b) => b.impact - a.impact);
  const limit = opts.limit ?? 50;
  const proofread = items.slice(0, limit);

  const rhythm: RhythmSource = rhythmKinds.size === 0 ? 'none' : rhythmKinds.size > 1 ? 'mixed' : (rhythmKinds.values().next().value as RhythmSource);
  const lines: string[] = [];
  const quality = Math.min(...pages.map((pg) => pg.quality.score));
  const staffCount = counts.staves.notation + counts.staves.tab;
  if (!staffCount) lines.push('No staves were found on this picture.');
  if (staffCount && quality < 0.45) lines.push('The picture is soft, noisy or small: expect mistakes, and check the whole reading (a sharper, closer picture reads better).');
  if (counts.staves.tab) lines.push(`Tab numbers: ${counts.tabNumbers} read, ${counts.tabUncertain} uncertain.`);
  if (counts.staves.notation) lines.push(`Notes: ${counts.notes} read${counts.rests ? ` (plus ${plural(counts.rests, 'rest')})` : ''}, ${counts.notesUncertain} uncertain.`);
  if (counts.linkedAgree + counts.linkedResolved + counts.linkedDisagree > 0) {
    const total = counts.linkedAgree + counts.linkedResolved + counts.linkedDisagree;
    let s = `Notation and tab agree on ${counts.linkedAgree} of ${total} notes`;
    if (counts.linkedResolved) s += `, ${counts.linkedResolved} more were settled by a rule`;
    if (counts.linkedDisagree) s += `, ${counts.linkedDisagree} still disagree`;
    lines.push(`${s}.`);
  }
  if (staffCount) lines.push(rhythmSentence(rhythm, counts));
  if (counts.measuresChecked) lines.push(counts.measuresWrong ? `${plural(counts.measuresWrong, 'measure does', 'measures do')} not add up to the time signature.` : `All ${plural(counts.measuresChecked, 'measure')} that could be checked add up.`);
  if (keys.size) lines.push(`Key: ${[...keys].map((k) => keyWords(Number(k))).join(', then ')}${unknownKey ? ' (no clef or key signature was seen: assumed)' : ''}.`);
  if (times.size && staffCount) lines.push(`Time: ${[...times].join(', then ')}${assumedTime ? ' (none printed: assumed)' : ''}.`);
  for (const pg of pages) for (const w of pg.warnings) if ((w.code === 'no-staves' || w.code === 'low-resolution' || w.code === 'small-notes') && !lines.includes(w.message)) lines.push(w.message);

  const doubtful = counts.tabUncertain + counts.notesUncertain + counts.measuresWrong + counts.linkedDisagree;
  const found = counts.tabNumbers + counts.notes;
  const verdict: OmrSummary['verdict'] = !staffCount || quality < 0.45 || (found > 0 && doubtful / found > 0.15) ? 'poor' : items.length ? 'check' : 'good';
  const headline = !staffCount ? 'No music found' : verdict === 'good' ? 'Read cleanly' : verdict === 'check' ? `Read well: ${plural(items.length, 'thing')} to check` : `Hard to read: ${plural(items.length, 'thing')} to check`;
  return { verdict, headline, lines, counts, rhythm, proofread, proofreadTotal: items.length };
}

function keyWords(fifths: number): string {
  return `${KEY_NAMES[fifths] ?? `${fifths} fifths`} / ${KEY_MINOR[fifths] ?? ''}`.replace(/ \/ $/, '');
}

function rhythmSentence(r: RhythmSource, c: SummaryCounts): string {
  switch (r) {
    case 'notation': return 'Rhythm: read from the notation.';
    case 'tab-stems': return 'Rhythm: read from the stems under the tab.';
    case 'estimated': return 'Rhythm: no rhythm is printed, so note lengths were estimated from the spacing. Check them by ear.';
    case 'mixed': return `Rhythm: read where it is printed${c.rhythmEstimated ? `, estimated from spacing in ${plural(c.rhythmEstimated, 'measure')}` : ''}.`;
    default: return 'Rhythm: not available (no note lengths could be read).';
  }
}

function summarizeMeasure(m: OmrMeasure, staff: OmrStaff, page: number, counts: SummaryCounts, items: ProofreadItem[], rhythm: Set<string>): void {
  counts.measures++;
  if (m.addsUp !== undefined) {
    counts.measuresChecked++;
    if (!m.addsUp) {
      counts.measuresWrong++;
      const have = m.ticks ?? 0;
      const want = m.expectedTicks ?? 0;
      items.push({
        id: m.id, page, staffId: staff.id, measureIndex: m.index, what: 'measure', bbox: m.bbox,
        reading: `${plural(m.events.length, 'event')}`,
        reason: `The note lengths add up to ${(have / 960).toFixed(2).replace(/\.?0+$/, '')} beats (quarters) but the time signature asks for ${(want / 960).toFixed(2).replace(/\.?0+$/, '')}: a value, a dot or a note is wrong or missing.`,
        confidence: 0.3, alternatives: [], impact: 60,
      });
    }
  }
  if (m.issues?.some((i) => i.code === 'rhythm-estimated')) counts.rhythmEstimated++;
  for (const e of m.events) {
    if (isTabEvent(e)) tabEvent(e, m, staff, page, counts, items, rhythm);
    else if (isNotationEvent(e)) notationEvent(e, m, staff, page, counts, items, rhythm);
  }
}

function tabEvent(e: OmrTabEvent, m: OmrMeasure, staff: OmrStaff, page: number, counts: SummaryCounts, items: ProofreadItem[], rhythm: Set<string>): void {
  if (e.kind === 'tab' && e.duration && !staff.linkedStaffId) rhythm.add(e.duration.source === 'inferred' ? 'estimated' : 'tab-stems');
  for (const n of e.notes) {
    counts.tabNumbers++;
    const reason = issueText(n.issues);
    if (n.confidence < GUESS) counts.tabUncertain++;
    if (n.confidence < GUESS || reason) {
      items.push({
        id: n.id, page, staffId: staff.id, measureIndex: m.index, what: 'tab-number', bbox: n.bbox,
        reading: `fret ${n.fret} on string ${n.string}${n.technique ? ` (${n.technique})` : ''}`,
        reason: reason ?? 'The number is hard to read.',
        confidence: n.confidence,
        alternatives: (n.alternatives ?? []).map((a) => `fret ${a.value}`),
        impact: (1 - n.confidence) * 20 + (n.issues?.some((i) => i.code === 'staves-disagree') ? 15 : 0),
      });
    }
  }
  const d = e.duration;
  if (d && d.source !== 'inferred' && d.source !== 'merged' && d.confidence < GUESS && e.kind === 'tab') {
    items.push({ id: e.id, page, staffId: staff.id, measureIndex: m.index, what: 'rhythm', bbox: e.bbox, reading: durationWords(d), reason: issueText(e.issues) ?? 'The length of this note is a guess.', confidence: d.confidence, alternatives: (d.alternatives ?? []).map((a) => durationWords({ ...d, ...a.value, tuplet: undefined })), impact: (1 - d.confidence) * 8 });
  }
}

function notationEvent(e: OmrNotationEvent, m: OmrMeasure, staff: OmrStaff, page: number, counts: SummaryCounts, items: ProofreadItem[], rhythm: Set<string>): void {
  rhythm.add('notation');
  if (e.kind === 'rest') counts.rests++;
  for (const n of e.notes) {
    counts.notes++;
    const reason = issueText(n.issues);
    if (n.confidence < GUESS) counts.notesUncertain++;
    if (n.confidence < GUESS || reason) {
      items.push({
        id: n.id, page, staffId: staff.id, measureIndex: m.index, what: 'note', bbox: n.bbox,
        reading: `${midiName(n.pitch.midi)} (sounding; written ${midiName(n.pitch.written)})${n.string ? `, fret ${n.fret} on string ${n.string}` : ''}`,
        reason: reason ?? 'The position or accidental of this note is hard to read.',
        confidence: n.confidence,
        alternatives: (n.alternatives ?? []).map((a) => midiName(a.value.midi)),
        impact: (1 - n.confidence) * 20 + (n.issues?.some((i) => i.code === 'staves-disagree') ? 15 : 0),
      });
    }
  }
  const reason = issueText(e.issues);
  if (e.duration.confidence < GUESS || reason) {
    items.push({
      id: e.id, page, staffId: staff.id, measureIndex: m.index, what: e.kind === 'rest' ? 'rest' : 'rhythm', bbox: e.bbox,
      reading: `${durationWords(e.duration)}${e.kind === 'rest' ? ' rest' : ''}`,
      reason: reason ?? (m.addsUp === false ? 'This length was chosen so the measure adds up; it may be wrong.' : 'The length of this note is a guess.'),
      confidence: Math.min(e.duration.confidence, e.confidence),
      alternatives: (e.duration.alternatives ?? []).map((a) => durationWords({ ...e.duration, ...a.value, tuplet: undefined })),
      impact: (1 - e.duration.confidence) * 8,
    });
  }
}
