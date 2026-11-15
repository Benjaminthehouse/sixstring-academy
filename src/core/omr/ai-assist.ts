/**
 * AI-assisted reading: a vision model as an independent second reader of the page.
 *
 * Vision models read clean, sparse tab and simple melodies well, but they misread dense notation
 * (ledger lines, accidentals carried through a bar, beams of sixteenths), lose count of repeated
 * notes and sometimes "complete" a bar with notes that are not printed. So their answer is never
 * taken as ground truth: it is validated and repaired by code, then fused with the classical
 * reading under musical constraints (a measure must add up, a fret must be playable, the tab and
 * the notation must agree), and anything still in doubt is marked for the user to proofread.
 *
 *   const client = createPlatformAiClient();          // ai-platform.ts, over @/core/platform askJson
 *   const ai = await readPageWithAi(gray, page, client, { signal });     // (a) independent reading
 *   const report = fuseAiReading(page, ai.reading);                       // (b) fusion, mutates page
 *   await secondOpinionOnMeasure(gray, page, staffId, 3, client);         // (c) one doubtful measure
 *
 * Everything here works on plain data and a tiny `OmrAiClient` interface, so it is unit-tested
 * with fake answers (good, partial, malformed, contradictory).
 */
import type { GrayImage } from './image/gray';
import { cropGray, resizeGray } from './image/gray';
import { alignSequences, checkMeasures, metreTicks, midiName, spellPitch } from './reconcile';
import {
  type Alternative, type BBox, type DurationValue, type OmrDuration, type OmrIssue, type OmrMeasure, type OmrNotationEvent, type OmrNote, type OmrPage,
  type OmrStaff, type OmrSystem, type OmrTabEvent, type OmrTabNote, type OmrText, type StepName, STANDARD_TUNING, durationTicks, isNotationEvent, isTabEvent,
  pitchAtStaffPosition,
} from './types';

// ------------------------------------------------------------------------------------------
// The client the app provides
// ------------------------------------------------------------------------------------------

/** A picture for the model: grey pixels. */
export interface OmrAiImage {
  gray: GrayImage;
}

/** One question to the model. `validate` throws an Error saying what is wrong (sent back once for a retry). */
export interface OmrAiRequest<T> {
  system: string;
  prompt: string;
  images: OmrAiImage[];
  validate: (value: unknown) => T;
  signal?: AbortSignal;
}

/** What the app gives this module: ask a vision model for JSON about pictures (see ai-platform.ts). */
export interface OmrAiClient {
  askJson<T>(request: OmrAiRequest<T>): Promise<T>;
  /** Most pictures one question may carry (default 1). */
  maxImages?: number;
}

// ------------------------------------------------------------------------------------------
// What the model is asked
// ------------------------------------------------------------------------------------------

/** Standing instructions for every question. */
export const OMR_SYSTEM_PROMPT = [
  'You are a careful music engraver checking a scanned guitar score. You transcribe exactly what is printed, nothing more.',
  'Conventions: standard guitar tuning; tablature has six lines, the TOP line is string 1 (high E) and the BOTTOM line is string 6 (low E);',
  'a number on a line is the fret on that string (0 = open string); numbers stacked vertically are played together.',
  'Standard notation for guitar is a treble clef that sounds an octave lower than written: always report the WRITTEN pitch exactly as printed',
  '(middle C = C4 = the first ledger line below the treble staff; the bottom line is E4, the top line F5), with the key signature and any',
  'accidental earlier in the same measure applied (an accidental lasts until the bar line; a tied note keeps its accidental).',
  'Never invent notes to make a measure add up, never "correct" the music, never continue a pattern you expect. If you cannot read',
  'something, mark it "uncertain": true, or leave it out and say so in "doubts". Answer with JSON only, no prose before or after.',
].join(' ');

const EVENT_SHAPE = '{"rest":false,"duration":"quarter","dots":0,"triplet":false,"notes":[{"pitch":"F#4","string":1,"fret":2,"tie":false}],"uncertain":false}';

/** The page-level (or per-system tile) prompt. `tiles` = how many pictures are attached, top to bottom. */
export function pageReadingPrompt(opts: { tiles: number; staves?: ('notation' | 'tab')[]; time?: { beats: number; beatValue: number } | null; withMetadata?: boolean }): string {
  const lines = [
    opts.tiles > 1
      ? `The ${opts.tiles} pictures are consecutive systems (lines) of ONE page of guitar music, top to bottom. Transcribe each picture as one entry of "systems", in order.`
      : 'The picture shows guitar music (standard notation and/or tablature). Transcribe every system (line of music) from top to bottom.',
  ];
  if (opts.staves?.length) lines.push(`Each system has these staves, top to bottom: ${opts.staves.join(' + ')}.`);
  if (opts.time) lines.push(`The time signature in force is ${opts.time.beats}/${opts.time.beatValue} unless a new one is printed.`);
  lines.push(
    'Go measure by measure (a measure is the space between two bar lines). For each measure list the events left to right; an event is a note, a chord (several notes struck together) or a rest.',
    'For a system with notation AND tab, the tab shows the same notes: give each note its written "pitch" from the notation AND its "string" and "fret" from the tab.',
    'For tab alone give "string" and "fret" and set "pitch" to null. For notation alone give "pitch" and set "string" and "fret" to null.',
    '"duration" is one of "whole","half","quarter","eighth","16th","32nd"; "dots" 0, 1 or 2; "triplet" true for notes under a 3. If the tab prints no rhythm at all (no stems, no notation), set "duration" to null.',
    '"tie": true on a note that is tied to the next note.',
    'Answer with JSON in exactly this shape:',
    `{${opts.withMetadata !== false ? '"title":null,"composer":null,"tempo":null,' : ''}"systems":[{"key":{"fifths":1},"time":{"beats":4,"beatValue":4},"measures":[{"chords":["G"],"lyrics":null,"events":[${EVENT_SHAPE}],"doubts":null}]}]}`,
    '"key.fifths" counts sharps as positive and flats as negative (0 = none); "time" is the time signature printed at the start of the system, or null if none is printed there.',
    '"chords" are the chord symbols printed above the measure, left to right. Use "uncertain": true on any event you are not sure about. Do not add measures or notes that are not printed.',
  );
  return lines.join('\n');
}

/** The focused question about one measure. */
export function measureQuestionPrompt(opts: { staves: ('notation' | 'tab')[]; time?: { beats: number; beatValue: number } | null; fifths?: number | null; found: string }): string {
  return [
    `The picture shows ONE measure of guitar music (${opts.staves.join(' + ')}), enlarged. The faint edges may show parts of the neighbouring measures: ignore anything outside the two bar lines nearest the middle.`,
    opts.time ? `The time signature is ${opts.time.beats}/${opts.time.beatValue}.` : 'The time signature is not known.',
    opts.fifths !== undefined && opts.fifths !== null ? `The key signature has ${Math.abs(opts.fifths)} ${opts.fifths >= 0 ? 'sharp' : 'flat'}${Math.abs(opts.fifths) === 1 ? '' : 's'}.` : '',
    `An automatic reader found: ${opts.found}. It may be wrong; read the picture yourself.`,
    'List every event of the measure left to right. Answer with JSON only, in this shape:',
    `{"events":[${EVENT_SHAPE}],"doubts":null}`,
    'Pitches are WRITTEN treble-clef pitches with the key signature applied; string 1 is the top tab line. Mark "uncertain": true where you are not sure. Do not invent notes.',
  ].filter(Boolean).join('\n');
}

// ------------------------------------------------------------------------------------------
// The answer, validated and repaired
// ------------------------------------------------------------------------------------------

/** A note as the model reported it, cleaned. */
export interface AiNote {
  /** Written pitch (treble clef as printed); null when not given. */
  written: { step: StepName; alter: number; octave: number; midi: number } | null;
  string: number | null;
  fret: number | null;
  tie: boolean;
}

/** An event as the model reported it, cleaned. */
export interface AiEvent {
  rest: boolean;
  duration: { value: DurationValue; dots: 0 | 1 | 2; triplet: boolean; ticks: number } | null;
  notes: AiNote[];
  uncertain: boolean;
  /** Pitch and string / fret given and they do not agree under standard tuning. */
  inconsistent: boolean;
}

/** A measure as the model reported it. */
export interface AiMeasure {
  events: AiEvent[];
  chords: string[];
  lyrics: string | null;
  doubts: string | null;
}

/** A system as the model reported it. */
export interface AiSystem {
  fifths: number | null;
  time: { beats: number; beatValue: number } | null;
  measures: AiMeasure[];
}

/** The whole answer, cleaned, with what had to be repaired. */
export interface AiReading {
  title: string | null;
  composer: string | null;
  tempo: string | null;
  systems: AiSystem[];
  /** What the validator dropped or fixed ("systems[0].measures[2].events[1]: fret 31 dropped"). */
  repairs: string[];
}

const VALUE_NAMES: Record<string, DurationValue> = {
  whole: 'whole', w: 'whole', '1': 'whole', '1/1': 'whole', semibreve: 'whole',
  half: 'half', h: 'half', '2': 'half', '1/2': 'half', minim: 'half',
  quarter: 'quarter', q: 'quarter', '4': 'quarter', '1/4': 'quarter', crotchet: 'quarter',
  eighth: 'eighth', '8th': 'eighth', e: 'eighth', '8': 'eighth', '1/8': 'eighth', quaver: 'eighth',
  '16th': '16th', sixteenth: '16th', s: '16th', '16': '16th', '1/16': '16th', semiquaver: '16th',
  '32nd': '32nd', 'thirty-second': '32nd', '32': '32nd', '1/32': '32nd', demisemiquaver: '32nd',
};
const STEP_PC: Record<StepName, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "F#4", "Bb3", "C♯5", "Ebb4", "Dn4" (written pitch); null when it is not a pitch. */
export function parsePitchName(value: unknown): AiNote['written'] {
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/♮/g, 'n').replace(/𝄪/g, '##').replace(/𝄫/g, 'bb');
  const m = /^([A-Ga-g])\s*(##|bb|#|b|n|x)?\s*(-?\d)$/.exec(s);
  if (!m) return null;
  const step = m[1].toUpperCase() as StepName;
  const acc = m[2] ?? '';
  const alter = acc === '#' ? 1 : acc === '##' || acc === 'x' ? 2 : acc === 'b' ? -1 : acc === 'bb' ? -2 : 0;
  const octave = Number(m[3]);
  if (octave < 1 || octave > 8) return null;
  return { step, alter, octave, midi: (octave + 1) * 12 + STEP_PC[step] + alter };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};

function parseDuration(e: Record<string, unknown>, where: string, repairs: string[]): AiEvent['duration'] {
  const raw = e.duration;
  if (raw === null || raw === undefined) return null;
  const value = VALUE_NAMES[String(raw).trim().toLowerCase()];
  if (!value) {
    repairs.push(`${where}: duration "${String(raw)}" not understood`);
    return null;
  }
  let dots = int(e.dots) ?? 0;
  if (dots < 0 || dots > 2) {
    repairs.push(`${where}: ${dots} dots clamped`);
    dots = Math.max(0, Math.min(2, dots));
  }
  const triplet = e.triplet === true;
  return { value, dots: dots as 0 | 1 | 2, triplet, ticks: durationTicks(value, dots, triplet ? { actual: 3, normal: 2 } : undefined) };
}

/** Clean one event; null when nothing usable is left. */
function parseEvent(raw: unknown, where: string, repairs: string[], strings: number, tuning: readonly number[]): AiEvent | null {
  if (!isObj(raw)) {
    repairs.push(`${where}: not an object, dropped`);
    return null;
  }
  const duration = parseDuration(raw, where, repairs);
  const uncertain = raw.uncertain === true;
  if (raw.rest === true || raw.type === 'rest') return { rest: true, duration, notes: [], uncertain, inconsistent: false };
  const notesRaw = Array.isArray(raw.notes) ? raw.notes : [];
  const notes: AiNote[] = [];
  let inconsistent = false;
  notesRaw.forEach((n, k) => {
    if (!isObj(n)) return;
    const written = parsePitchName(n.pitch);
    if (n.pitch !== null && n.pitch !== undefined && !written) repairs.push(`${where}.notes[${k}]: pitch "${String(n.pitch)}" not understood`);
    let string = int(n.string);
    let fret = int(n.fret);
    if (string !== null && (string < 1 || string > strings)) {
      repairs.push(`${where}.notes[${k}]: string ${string} dropped`);
      string = null;
    }
    if (fret !== null && (fret < 0 || fret > 24)) {
      repairs.push(`${where}.notes[${k}]: fret ${fret} dropped`);
      fret = null;
    }
    if ((string === null) !== (fret === null)) {
      string = null;
      fret = null;
    }
    if (!written && string === null) return;
    if (string !== null && notes.some((q) => q.string === string)) {
      repairs.push(`${where}.notes[${k}]: second note on string ${string} dropped`);
      return;
    }
    if (written && string !== null && fret !== null && written.midi - 12 !== tuning[tuning.length - string] + fret) inconsistent = true;
    notes.push({ written, string, fret, tie: n.tie === true });
  });
  if (!notes.length) {
    repairs.push(`${where}: no readable note, dropped`);
    return null;
  }
  return { rest: false, duration, notes, uncertain, inconsistent };
}

/**
 * Validate and repair a page answer. Throws (so the platform asks once more, quoting the message)
 * only when the shape is unusable as a whole; individual bad notes are dropped and listed in `repairs`.
 */
export function parseAiReading(value: unknown, opts: { strings?: number; tuning?: readonly number[] } = {}): AiReading {
  if (!isObj(value)) throw new Error('The answer must be a JSON object with a "systems" array.');
  const systemsRaw = value.systems ?? (Array.isArray(value.measures) ? [{ measures: value.measures }] : undefined);
  if (!Array.isArray(systemsRaw)) throw new Error('"systems" is missing or not an array.');
  const strings = opts.strings ?? 6;
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const repairs: string[] = [];
  const systems: AiSystem[] = systemsRaw.map((s, si) => {
    if (!isObj(s)) {
      repairs.push(`systems[${si}]: not an object`);
      return { fifths: null, time: null, measures: [] };
    }
    let fifths = isObj(s.key) ? int(s.key.fifths) : int(s.key);
    if (fifths !== null && (fifths < -7 || fifths > 7)) {
      repairs.push(`systems[${si}]: key ${fifths} dropped`);
      fifths = null;
    }
    let time: AiSystem['time'] = null;
    if (isObj(s.time)) {
      const beats = int(s.time.beats);
      const beatValue = int(s.time.beatValue);
      if (beats && beatValue && beats >= 1 && beats <= 16 && [1, 2, 4, 8, 16, 32].includes(beatValue)) time = { beats, beatValue };
      else repairs.push(`systems[${si}]: time signature dropped`);
    }
    const measuresRaw = Array.isArray(s.measures) ? s.measures : [];
    const measures: AiMeasure[] = measuresRaw.map((m, mi) => {
      const where = `systems[${si}].measures[${mi}]`;
      if (!isObj(m)) {
        repairs.push(`${where}: not an object`);
        return { events: [], chords: [], lyrics: null, doubts: null };
      }
      const events = (Array.isArray(m.events) ? m.events : []).map((e, ei) => parseEvent(e, `${where}.events[${ei}]`, repairs, strings, tuning)).filter((e): e is AiEvent => !!e);
      const chords = (Array.isArray(m.chords) ? m.chords : []).map((c) => (isObj(c) ? str(c.symbol, 16) : str(c, 16))).filter((c): c is string => !!c);
      return { events, chords, lyrics: str(m.lyrics, 200), doubts: str(m.doubts, 300) };
    });
    return { fifths, time, measures };
  });
  if (!systems.some((s) => s.measures.some((m) => m.events.length))) throw new Error('No measure in the answer has any readable event.');
  return { title: str(value.title), composer: str(value.composer), tempo: str(value.tempo, 60), systems, repairs };
}

/** Validate a one-measure answer. */
export function parseAiMeasure(value: unknown, opts: { strings?: number; tuning?: readonly number[] } = {}): AiMeasure & { repairs: string[] } {
  if (!isObj(value) || !Array.isArray(value.events)) throw new Error('The answer must be a JSON object with an "events" array.');
  const repairs: string[] = [];
  const events = value.events.map((e, i) => parseEvent(e, `events[${i}]`, repairs, opts.strings ?? 6, opts.tuning ?? STANDARD_TUNING)).filter((e): e is AiEvent => !!e);
  return { events, chords: [], lyrics: null, doubts: str(value.doubts, 300), repairs };
}

// ------------------------------------------------------------------------------------------
// Pictures for the model
// ------------------------------------------------------------------------------------------

/** Longest side of a picture sent to the model (larger ones are reduced by the host anyway). */
export const AI_MAX_SIDE = 1800;

/** Crop a box of the page (with a margin) and scale it so a staff space is about `targetSpace` px. */
export function cropForAi(source: GrayImage, box: BBox, space: number, opts: { margin?: number; targetSpace?: number; maxSide?: number } = {}): GrayImage {
  const margin = (opts.margin ?? 1.5) * space;
  const x0 = Math.max(0, Math.floor(box.x - margin));
  const y0 = Math.max(0, Math.floor(box.y - margin));
  const x1 = Math.min(source.width, Math.ceil(box.x + box.w + margin));
  const y1 = Math.min(source.height, Math.ceil(box.y + box.h + margin));
  const crop = cropGray(source, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  const maxSide = opts.maxSide ?? AI_MAX_SIDE;
  let scale = Math.max(0.4, Math.min(3, (opts.targetSpace ?? 14) / Math.max(1, space)));
  scale = Math.min(scale, maxSide / Math.max(crop.width, crop.height));
  if (Math.abs(scale - 1) < 0.08) return crop;
  return resizeGray(crop, Math.max(1, Math.round(crop.width * scale)), Math.max(1, Math.round(crop.height * scale)));
}

/** The box of a system with room for chord symbols above and stems below. */
function systemBox(sys: OmrSystem): BBox {
  const boxes = sys.staves.map((s) => s.geometry.contentBox);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
}

// ------------------------------------------------------------------------------------------
// (a) Page-level reading
// ------------------------------------------------------------------------------------------

/** Options for {@link readPageWithAi}. */
export interface ReadPageWithAiOptions {
  signal?: AbortSignal;
  /** Systems per question (default: the client's maxImages, at most 4). */
  tilesPerRequest?: number;
  /** Staff space the tiles are scaled to (default 14 px). */
  targetSpace?: number;
}

/** Result of {@link readPageWithAi}. */
export interface AiPageResult {
  reading: AiReading;
  /** How many questions were asked, and which systems of the classical page each AI system belongs to. */
  requests: number;
  systemMap: number[];
}

/**
 * Ask the model for an independent transcription of the page. When the classical reading found
 * systems, each system is cropped and enlarged (a whole page shrunk to the model's resolution
 * leaves digits a few pixels tall) and sent in batches; otherwise the whole page is sent once.
 */
export async function readPageWithAi(source: GrayImage, page: OmrPage | null, client: OmrAiClient, opts: ReadPageWithAiOptions = {}): Promise<AiPageResult> {
  const systems = page?.systems ?? [];
  if (!systems.length) {
    const scale = Math.min(1, AI_MAX_SIDE / Math.max(source.width, source.height));
    const img = scale < 1 ? resizeGray(source, Math.round(source.width * scale), Math.round(source.height * scale)) : source;
    const reading = await client.askJson({ system: OMR_SYSTEM_PROMPT, prompt: pageReadingPrompt({ tiles: 1 }), images: [{ gray: img }], validate: (v) => parseAiReading(v), signal: opts.signal });
    return { reading, requests: 1, systemMap: reading.systems.map(() => -1) };
  }
  const per = Math.max(1, Math.min(opts.tilesPerRequest ?? client.maxImages ?? 1, 4));
  const merged: AiReading = { title: null, composer: null, tempo: null, systems: [], repairs: [] };
  const systemMap: number[] = [];
  let requests = 0;
  for (let i = 0; i < systems.length; i += per) {
    if (opts.signal?.aborted) break;
    const batch = systems.slice(i, i + per);
    const images = batch.map((sys) => ({ gray: cropForAi(source, systemBox(sys), sys.staves[0].geometry.space, { targetSpace: opts.targetSpace, margin: i === 0 ? 4 : 1.5 }) }));
    const staves = batch[0].staves.map((s) => s.kind);
    const time = batch[0].staves[0].timeInForce && batch[0].staves[0].timeInForce.source !== 'assumed' ? batch[0].staves[0].timeInForce : null;
    const reading = await client.askJson({
      system: OMR_SYSTEM_PROMPT,
      prompt: pageReadingPrompt({ tiles: batch.length, staves, time, withMetadata: i === 0 }),
      images,
      validate: (v) => parseAiReading(v),
      signal: opts.signal,
    });
    requests++;
    if (i === 0) {
      merged.title = reading.title;
      merged.composer = reading.composer;
      merged.tempo = reading.tempo;
    }
    // One AI system per tile; extra ones (the model split a line) are merged into the last.
    batch.forEach((_, k) => {
      const s = reading.systems[k];
      merged.systems.push(s ?? { fifths: null, time: null, measures: [] });
      systemMap.push(i + k);
    });
    if (reading.systems.length > batch.length) {
      const last = merged.systems[merged.systems.length - 1];
      for (const extra of reading.systems.slice(batch.length)) last.measures.push(...extra.measures);
      merged.repairs.push(`the model reported ${reading.systems.length} systems for ${batch.length} pictures; extra measures were appended to the last`);
    }
    merged.repairs.push(...reading.repairs.map((r) => `request ${requests}: ${r}`));
  }
  return { reading: merged, requests, systemMap };
}

// ------------------------------------------------------------------------------------------
// (b) Fusion
// ------------------------------------------------------------------------------------------

/** What {@link fuseAiReading} did. */
export interface FusionReport {
  /** Measures compared, and how they came out. */
  measures: number;
  measuresAgree: number;
  /** Notes / tab numbers compared: same reading, different reading. */
  agree: number;
  disagree: number;
  /** Disagreements settled by a musical constraint (measure adds up, an alternative both readers allow). */
  resolved: number;
  /** Events only the AI saw, added as guesses. */
  aiOnly: number;
  /** Events only the picture reader saw. */
  imageOnly: number;
  /** Texts (title, tempo, chord symbols) filled from the AI. */
  texts: number;
  /** Plain sentences for the screen. */
  notes: string[];
}

function emptyReport(): FusionReport {
  return { measures: 0, measuresAgree: 0, agree: 0, disagree: 0, resolved: 0, aiOnly: 0, imageOnly: 0, texts: 0, notes: [] };
}

/** Confidence the fusion gives an AI reading (lower when the model said it was unsure or contradicted itself). */
function aiWeight(e: AiEvent): number {
  return e.uncertain || e.inconsistent ? 0.35 : 0.7;
}

function addIssue(el: { issues?: OmrIssue[] }, issue: OmrIssue): void {
  const list = (el.issues ??= []);
  if (!list.some((i) => i.code === issue.code && i.message === issue.message)) list.push(issue);
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const combine = (a: number, b: number): number => Math.min(0.99, Math.max(a, b, 1 - (1 - a) * (1 - b)));

/** Sounding pitches an AI event stands for (from the written pitch, else from string / fret). */
function aiMidis(e: AiEvent, tuning: readonly number[]): number[] {
  return e.notes.map((n) => (n.written ? n.written.midi - 12 : n.string !== null && n.fret !== null ? tuning[tuning.length - n.string] + n.fret : -1)).filter((m) => m >= 0).sort((a, b) => a - b);
}

function eventMidis(e: OmrNotationEvent | OmrTabEvent): number[] {
  return isNotationEvent(e) ? e.notes.map((n) => n.pitch.midi).sort((a, b) => a - b) : e.notes.map((n) => n.midi).sort((a, b) => a - b);
}

function sameDuration(d: OmrDuration | undefined, a: AiEvent['duration']): boolean {
  if (!d || !a) return false;
  return d.value === a.value && d.dots === a.dots && !!d.tuplet === a.triplet;
}

function aiDuration(a: NonNullable<AiEvent['duration']>, confidence: number): OmrDuration {
  return { value: a.value, dots: a.dots, tuplet: a.triplet ? { actual: 3, normal: 2 } : undefined, ticks: a.ticks, confidence, source: 'ai' };
}

function describeAi(e: AiEvent): string {
  if (e.rest) return `a rest${e.duration ? ` (${e.duration.value})` : ''}`;
  return e.notes.map((n) => (n.string !== null ? `fret ${n.fret} on string ${n.string}` : n.written ? `${n.written.step}${n.written.alter > 0 ? '#'.repeat(n.written.alter) : 'b'.repeat(-n.written.alter)}${n.written.octave}` : '?')).join(' + ');
}

/** Ticks of a list of events (null when one has no duration). */
function sumTicks(durations: (OmrDuration | AiEvent['duration'] | undefined)[]): number | null {
  let t = 0;
  for (const d of durations) {
    if (!d) return null;
    t += d.ticks;
  }
  return t;
}

/**
 * Fuse one AI measure into the classical measures of one system (the notation measure and / or
 * the tab measure that show it). Mutates the classical events.
 */
export function fuseMeasure(measures: { notation?: OmrMeasure; tab?: OmrMeasure; tabStaff?: OmrStaff; notationStaff?: OmrStaff }, ai: AiMeasure, expectedTicks: number | null, fifths: number, report: FusionReport, tuning: readonly number[] = STANDARD_TUNING): void {
  report.measures++;
  let disagreements = 0;
  // The staff that carries the rhythm decides the event order: notation when there is one.
  const lead = measures.notation ?? measures.tab;
  if (!lead) return;
  const leadEvents = lead.events.filter((e) => !(isNotationEvent(e) && e.grace)).slice().sort((a, b) => a.x - b.x) as (OmrNotationEvent | OmrTabEvent)[];
  const aiEvents = ai.events;
  const pairs = alignSequences(leadEvents.length, aiEvents.length, (i, j) => {
    const c = leadEvents[i];
    const a = aiEvents[j];
    const cRest = c.kind === 'rest' || c.kind === 'tab-rest';
    if (cRest !== a.rest) return -Infinity;
    if (cRest) return 1 + (sameDuration(c.duration, a.duration) ? 0.5 : 0);
    const cm = eventMidis(c);
    const am = aiMidis(a, tuning);
    const common = cm.filter((m) => am.includes(m)).length;
    return 0.6 + common / Math.max(cm.length, am.length, 1) + (sameDuration(c.duration, a.duration) ? 0.3 : 0);
  });
  const pairedLead = new Set(pairs.map((p) => p[0]));
  const pairedAi = new Set(pairs.map((p) => p[1]));
  // Durations: the AI's are adopted only where they make a measure that did not add up add up.
  const classicalTicks = sumTicks(leadEvents.map((e) => e.duration));
  const aiTicks = sumTicks(aiEvents.map((e) => e.duration));
  const classicalOk = expectedTicks !== null && classicalTicks === expectedTicks;
  const aiOk = expectedTicks !== null && aiTicks === expectedTicks && aiEvents.length === leadEvents.length && pairs.length === leadEvents.length;
  const linkedTab = (n: OmrNotationEvent): OmrTabEvent | undefined => (measures.tab?.events.find((t) => t.id === n.linkedEventId) as OmrTabEvent | undefined);

  for (const [i, j] of pairs) {
    const c = leadEvents[i];
    const a = aiEvents[j];
    const w = aiWeight(a);
    // Rhythm.
    if (a.duration && c.duration && !sameDuration(c.duration, a.duration)) {
      if (!classicalOk && aiOk) {
        const old = c.duration;
        c.duration = { ...aiDuration(a.duration, 0.6), source: 'merged', alternatives: [{ value: { value: old.value, dots: old.dots }, confidence: r2(Math.min(0.45, old.confidence)) }] };
        addIssue(c, { code: 'resolved', message: `The picture reader saw ${old.value}${old.dots ? ' (dotted)' : ''} here; the AI reading's ${a.duration.value}${a.duration.dots ? ' (dotted)' : ''} makes the measure add up and was taken.` });
        report.resolved++;
        if (isNotationEvent(c)) {
          const t = linkedTab(c);
          if (t?.duration && t.duration.source === 'merged') t.duration = { ...c.duration };
        }
      } else {
        disagreements++;
        c.duration.alternatives = [{ value: { value: a.duration.value, dots: a.duration.dots }, confidence: r2(Math.min(0.45, w)) }, ...(c.duration.alternatives ?? []).filter((q) => q.value.value !== a.duration?.value || q.value.dots !== a.duration?.dots)];
        if (!classicalOk) c.duration.confidence = r2(Math.min(0.45, c.duration.confidence));
        addIssue(c, { code: 'ai-disagree', message: `The AI reading has a ${a.duration.dots ? 'dotted ' : ''}${a.duration.value} here.` });
      }
    } else if (a.duration && c.duration) {
      c.duration.confidence = r2(Math.max(c.duration.confidence, Math.min(0.95, combine(c.duration.confidence, w * 0.8))));
    } else if (a.duration && !c.duration && isTabEvent(c)) {
      // Tab printed without rhythm: the AI's lengths are better than the spacing estimate only if it read them.
      c.duration = aiDuration(a.duration, r2(Math.min(0.45, w)));
    }
    if (a.rest) continue;
    // Pitches / frets.
    if (isNotationEvent(c)) disagreements += fuseNotes(c, a, fifths, report, tuning, linkedTab(c));
    else disagreements += fuseTabNotes(c, a, report);
  }
  // Events only one side has.
  leadEvents.forEach((c, i) => {
    if (pairedLead.has(i) || c.kind === 'rest' || c.kind === 'tab-rest') return;
    report.imageOnly++;
    if (c.confidence < 0.8) {
      c.confidence = r2(c.confidence * 0.85);
      addIssue(c, { code: 'ai-disagree', message: 'The AI reading did not see this note.' });
    }
  });
  aiEvents.forEach((a, j) => {
    if (pairedAi.has(j) || a.rest) return;
    // Add it as a guess only where the picture reader's measure is short of time and this fills it.
    const fills = expectedTicks !== null && classicalTicks !== null && a.duration && classicalTicks + a.duration.ticks <= expectedTicks;
    if (fills && insertAiEvent(measures, a, j, aiEvents, pairs, leadEvents, fifths, tuning)) {
      report.aiOnly++;
    } else {
      addIssue(lead, { code: 'ai-only', message: `The AI reading has an extra ${describeAi(a)} in this measure.` });
      report.aiOnly++;
    }
  });
  if (!disagreements && pairs.length === leadEvents.length && pairs.length === aiEvents.length) report.measuresAgree++;
}

/** Pitch of an AI note as an OmrPitch (spelled as the model wrote it). */
function aiPitch(n: AiNote): OmrNote['pitch'] | null {
  if (!n.written) return null;
  return { step: n.written.step, alter: n.written.alter, octave: n.written.octave, written: n.written.midi, midi: n.written.midi - 12 };
}

function fuseNotes(c: OmrNotationEvent, a: AiEvent, fifths: number, report: FusionReport, tuning: readonly number[], tab?: OmrTabEvent): number {
  const w = aiWeight(a);
  const am = a.notes.map((n) => ({ n, midi: n.written ? n.written.midi - 12 : n.string !== null && n.fret !== null ? tuning[tuning.length - n.string] + n.fret : -1 })).filter((q) => q.midi >= 0);
  let disagreements = 0;
  const used = new Set<number>();
  // Equal pitches first, then by pitch order.
  const heads = c.notes.slice().sort((x, y) => x.pitch.midi - y.pitch.midi);
  const order = am.slice().sort((x, y) => x.midi - y.midi);
  const pairs: [OmrNote, (typeof am)[number]][] = [];
  for (const h of heads) {
    const k = order.findIndex((q, idx) => !used.has(idx) && q.midi === h.pitch.midi);
    if (k >= 0) {
      used.add(k);
      pairs.push([h, order[k]]);
    }
  }
  const restH = heads.filter((h) => !pairs.some((p) => p[0] === h));
  const restA = order.filter((_, idx) => !used.has(idx));
  if (restH.length === restA.length) restH.forEach((h, k) => pairs.push([h, restA[k]]));
  for (const [h, q] of pairs) {
    if (h.pitch.midi === q.midi) {
      report.agree++;
      h.confidence = r2(Math.max(h.confidence, Math.min(0.97, combine(h.confidence, w))));
      if (h.source === 'image') h.source = 'merged';
      continue;
    }
    // Disagreement: keep what the picture shows clearly; take the AI's reading only for a guess
    // that the picture reader itself listed as possible, or that the tab under it confirms.
    const asAlt = h.alternatives?.find((x) => x.value.midi === q.midi);
    const tabSays = tab?.notes.some((t) => t.midi === q.midi && t.confidence >= 0.5);
    if ((asAlt && h.confidence < 0.6) || (tabSays && h.confidence < 0.75)) {
      const old = h.pitch;
      h.pitch = asAlt ? asAlt.value : aiPitch(q.n) ?? spellPitch(q.midi, fifths, h.staffPosition);
      h.alternatives = [{ value: old, confidence: r2(Math.min(0.45, h.confidence * 0.6)) }, ...(h.alternatives ?? []).filter((x) => x.value.midi !== q.midi && x.value.midi !== old.midi)];
      h.confidence = 0.55;
      h.source = 'merged';
      addIssue(h, { code: 'resolved', message: `Changed from ${midiName(old.midi)} to ${midiName(q.midi)}: the AI reading${tabSays ? ' and the tab' : ''} agree on it.` });
      report.resolved++;
    } else {
      const p = aiPitch(q.n) ?? spellPitch(q.midi, fifths, h.staffPosition);
      h.alternatives = [{ value: p, confidence: r2(Math.min(0.45, w)) }, ...(h.alternatives ?? []).filter((x) => x.value.midi !== q.midi)];
      if (h.confidence < 0.85) h.confidence = r2(Math.min(0.45, h.confidence));
      addIssue(h, { code: 'ai-disagree', message: `The AI reading has ${midiName(q.midi)} here (sounding).` });
      report.disagree++;
      disagreements++;
    }
  }
  return disagreements;
}

function fuseTabNotes(c: OmrTabEvent, a: AiEvent, report: FusionReport): number {
  const w = aiWeight(a);
  let disagreements = 0;
  for (const n of c.notes) {
    const q = a.notes.find((x) => x.string === n.string);
    if (!q || q.fret === null) continue;
    if (q.fret === n.fret) {
      report.agree++;
      n.confidence = r2(Math.max(n.confidence, Math.min(0.97, combine(n.confidence, w))));
      if (n.source === 'image') n.source = 'merged';
      continue;
    }
    const fret = q.fret;
    const asAlt = n.alternatives?.find((x) => x.value === fret);
    // A fret is plausible when the chord it makes stays within a hand's reach.
    const others = c.notes.filter((o) => o !== n && o.fret > 0).map((o) => o.fret);
    const spanOk = fret === 0 || !others.length || Math.max(...others, fret) - Math.min(...others, fret) <= 5;
    if (spanOk && ((asAlt && n.confidence < 0.6) || n.confidence < 0.35)) {
      const old = n.fret;
      const open = n.midi - n.fret;
      n.fret = fret;
      n.midi = open + fret;
      n.alternatives = [{ value: old, confidence: r2(Math.min(0.4, n.confidence)) }, ...(n.alternatives ?? []).filter((x) => x.value !== fret && x.value !== old)];
      n.confidence = asAlt ? 0.55 : 0.45;
      n.source = 'merged';
      addIssue(n, { code: 'resolved', message: `Changed from fret ${old} to fret ${fret}, as the AI reading has it.` });
      report.resolved++;
    } else {
      n.alternatives = [{ value: fret, confidence: r2(Math.min(0.45, w)) }, ...(n.alternatives ?? []).filter((x) => x.value !== fret)];
      if (n.confidence < 0.85) n.confidence = r2(Math.min(0.45, n.confidence));
      addIssue(n, { code: 'ai-disagree', message: `The AI reading has fret ${fret} on string ${n.string} here.` });
      report.disagree++;
      disagreements++;
    }
  }
  return disagreements;
}

/** Insert an event only the AI saw, between its aligned neighbours, as a guess. */
function insertAiEvent(
  measures: { notation?: OmrMeasure; tab?: OmrMeasure; notationStaff?: OmrStaff; tabStaff?: OmrStaff },
  a: AiEvent, j: number, aiEvents: AiEvent[], pairs: [number, number][], lead: (OmrNotationEvent | OmrTabEvent)[], fifths: number, tuning: readonly number[],
): boolean {
  const target = measures.notation ?? measures.tab;
  const staff = measures.notation ? measures.notationStaff : measures.tabStaff;
  if (!target || !staff || !a.duration) return false;
  const before = pairs.filter((p) => p[1] < j).pop();
  const after = pairs.find((p) => p[1] > j);
  const xa = before ? lead[before[0]].x : target.x0 + 0.1 * (target.x1 - target.x0);
  const xb = after ? lead[after[0]].x : target.x1 - 0.05 * (target.x1 - target.x0);
  const x = (xa + xb) / 2;
  const sp = staff.geometry.space;
  const conf = 0.35;
  const id = `${target.id}.ai${j}`;
  const lineY = (l: number): number => {
    const line = staff.geometry.lines[Math.max(0, Math.min(staff.geometry.lines.length - 1, l))];
    let best = line[0];
    for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return best.y;
  };
  if (target === measures.notation) {
    const bottom = lineY(4);
    const notes: OmrNote[] = a.notes.filter((n) => n.written).map((n, k) => {
      const w = n.written as NonNullable<AiNote['written']>;
      const pos = w.octave * 7 + ['C', 'D', 'E', 'F', 'G', 'A', 'B'].indexOf(w.step) - 30;
      const y = bottom - (pos * sp) / 2;
      return { id: `${id}.n${k}`, bbox: { x: x - 0.6 * sp, y: y - 0.5 * sp, w: 1.2 * sp, h: sp }, confidence: conf, source: 'ai', staffPosition: pos, head: a.duration?.value === 'whole' ? 'whole' : a.duration?.value === 'half' ? 'open' : 'filled', pitch: pitchAtStaffPosition(pos, w.alter), issues: [{ code: 'ai-only', message: 'Only the AI reading has this note; check it against the picture.' }] };
    });
    if (!notes.length) return false;
    const ys = notes.map((n) => n.bbox.y);
    const ev: OmrNotationEvent = { id, kind: 'chord', x, notes, duration: aiDuration(a.duration, conf), bbox: { x: x - 0.7 * sp, y: Math.min(...ys), w: 1.4 * sp, h: Math.max(...ys) - Math.min(...ys) + sp }, confidence: conf, source: 'ai', issues: [{ code: 'ai-only', message: 'Only the AI reading has this note; check it against the picture.' }] };
    target.events.push(ev);
    target.events.sort((p, q) => p.x - q.x);
    void fifths;
    return true;
  }
  const notes: OmrTabNote[] = a.notes.filter((n) => n.string !== null && n.fret !== null).map((n, k) => {
    const s = n.string as number;
    const y = lineY(s - 1);
    return { id: `${id}.n${k}`, bbox: { x: x - 0.4 * sp, y: y - 0.45 * sp, w: 0.8 * sp, h: 0.9 * sp }, confidence: conf, source: 'ai', string: s, fret: n.fret as number, midi: tuning[tuning.length - s] + (n.fret as number), issues: [{ code: 'ai-only', message: 'Only the AI reading has this number; check it against the picture.' }] };
  });
  if (!notes.length) return false;
  const ys = notes.map((n) => n.bbox.y);
  const ev: OmrTabEvent = { id, kind: 'tab', x, notes, duration: aiDuration(a.duration, conf), bbox: { x: x - 0.5 * sp, y: Math.min(...ys), w: sp, h: Math.max(...ys) - Math.min(...ys) + sp }, confidence: conf, source: 'ai', issues: [{ code: 'ai-only', message: 'Only the AI reading has this number; check it against the picture.' }] };
  target.events.push(ev);
  target.events.sort((p, q) => p.x - q.x);
  return true;
}

/**
 * Fuse an AI reading into the classical page (mutates it). AI systems are matched to the page's
 * systems by `systemMap` (from `readPageWithAi`) or by order; measures within a system by
 * alignment (a missed or extra bar line on either side is tolerated). Measures are re-checked.
 */
export function fuseAiReading(page: OmrPage, reading: AiReading, systemMap?: number[], opts: { tuning?: readonly number[] } = {}): FusionReport {
  const report = emptyReport();
  const tuning = opts.tuning ?? STANDARD_TUNING;
  reading.systems.forEach((ais, k) => {
    const sysIndex = systemMap?.[k] ?? k;
    const sys = page.systems[sysIndex];
    if (!sys || sysIndex < 0) return;
    const notation = sys.staves.find((s) => s.kind === 'notation');
    const tab = notation?.linkedStaffId ? sys.staves.find((s) => s.id === notation.linkedStaffId) : sys.staves.find((s) => s.kind === 'tab');
    const lead = notation ?? tab;
    if (!lead) return;
    const fifths = notation?.keyInForce?.fifths ?? notation?.keySignature?.fifths ?? 0;
    if (notation && ais.fifths !== null && ais.fifths !== fifths) {
      addIssue(notation, { code: 'ai-disagree', message: `The AI reading sees ${Math.abs(ais.fifths)} ${ais.fifths >= 0 ? 'sharp' : 'flat'}${Math.abs(ais.fifths) === 1 ? '' : 's'} in the key signature; the picture reader ${fifths === 0 ? 'none' : `${Math.abs(fifths)} ${fifths > 0 ? 'sharp' : 'flat'}${Math.abs(fifths) === 1 ? '' : 's'}`}.` });
      report.notes.push(`System ${sysIndex + 1}: the key signature reads differently.`);
    }
    const t = lead.timeInForce;
    if (ais.time && t && t.source !== 'printed' && (ais.time.beats !== t.beats || ais.time.beatValue !== t.beatValue)) {
      addIssue(lead, { code: 'ai-disagree', message: `The AI reading sees a ${ais.time.beats}/${ais.time.beatValue} time signature here.` });
    }
    const expected = t ? metreTicks(t.beats, t.beatValue) : ais.time ? metreTicks(ais.time.beats, ais.time.beatValue) : null;
    // Measure alignment by content: event counts and pitches.
    const cms = lead.measures;
    const sig = (m: OmrMeasure): number[] => m.events.flatMap((e) => eventMidis(e as OmrNotationEvent | OmrTabEvent));
    const aiSig = (m: AiMeasure): number[] => m.events.flatMap((e) => aiMidis(e, tuning));
    const pairs = cms.length === ais.measures.length ? cms.map((_, i) => [i, i] as [number, number]) : alignSequences(cms.length, ais.measures.length, (i, j) => {
      const a = sig(cms[i]);
      const b = aiSig(ais.measures[j]);
      const common = a.filter((m) => b.includes(m)).length;
      const pos = 1 - Math.abs(i / Math.max(1, cms.length) - j / Math.max(1, ais.measures.length));
      return common / Math.max(a.length, b.length, 1) + 0.3 * pos;
    });
    if (cms.length !== ais.measures.length) report.notes.push(`System ${sysIndex + 1}: the picture reader found ${cms.length} measures, the AI reading ${ais.measures.length}.`);
    for (const [i, j] of pairs) {
      const nm = notation?.measures[i];
      const tm = tab?.measures.find((m) => Math.abs((m.x0 + m.x1) / 2 - (cms[i].x0 + cms[i].x1) / 2) < 0.5 * (cms[i].x1 - cms[i].x0));
      const ok = cms[i].pickup ? null : expected;
      fuseMeasure({ notation: nm, tab: notation ? tm : cms[i], notationStaff: notation, tabStaff: tab }, ais.measures[j], ok, fifths, report, tuning);
      // Chord symbols: fill empty text boxes of the system in order, or add texts anchored to the measure.
      report.texts += fillChordSymbols(sys, cms[i], ais.measures[j].chords, lead);
    }
    for (const st of sys.staves) {
      const tf = st.timeInForce;
      checkMeasures(st, tf ? metreTicks(tf.beats, tf.beatValue) : null, st.measures[0]?.pickup === true, false);
    }
  });
  report.texts += fillPageTexts(page, reading);
  if (reading.repairs.length) report.notes.push(`${reading.repairs.length} part${reading.repairs.length === 1 ? '' : 's'} of the AI answer could not be used.`);
  report.notes.unshift(`AI second opinion: ${report.agree} notes agree, ${report.disagree} differ (marked for checking), ${report.resolved} settled by the rules, ${report.aiOnly} seen only by the AI.`);
  return report;
}

function fillChordSymbols(sys: OmrSystem, m: OmrMeasure, chords: string[], lead: OmrStaff): number {
  if (!chords.length) return 0;
  const inMeasure = sys.texts.filter((t) => (t.kind === 'chord-symbol' || t.kind === 'other') && t.x !== undefined && t.x >= m.x0 && t.x < m.x1).sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  let filled = 0;
  chords.forEach((c, k) => {
    const box = inMeasure[k];
    if (box && !box.text) {
      box.text = c;
      box.kind = 'chord-symbol';
      box.confidence = 0.6;
      box.source = 'ai';
      filled++;
    } else if (!box) {
      const sp = lead.geometry.space;
      const x = m.x0 + ((k + 0.5) / chords.length) * (m.x1 - m.x0);
      const t: OmrText = { id: `${m.id}.chord${k}`, bbox: { x: x - sp, y: lead.geometry.bbox.y - 3 * sp, w: 2 * sp, h: 1.5 * sp }, confidence: 0.45, source: 'ai', kind: 'chord-symbol', text: c, staffId: lead.id, measureIndex: m.index, x };
      sys.texts.push(t);
      filled++;
    }
  });
  return filled;
}

function fillPageTexts(page: OmrPage, reading: AiReading): number {
  let n = 0;
  const top = page.systems[0]?.bbox;
  const add = (kind: OmrText['kind'], text: string | null): void => {
    if (!text) return;
    const existing = [...page.texts, ...(page.systems[0]?.texts ?? [])].find((t) => t.kind === kind || (kind === 'title' && t.kind === 'title'));
    if (existing && !existing.text) {
      existing.text = text;
      existing.source = 'ai';
      existing.confidence = 0.6;
    } else if (!existing) {
      page.texts.push({ id: `ai.${kind}`, bbox: top ? { x: top.x, y: Math.max(0, top.y - 60), w: top.w, h: 40 } : { x: 0, y: 0, w: page.width, h: 40 }, confidence: 0.5, source: 'ai', kind, text });
    } else return;
    n++;
  };
  add('title', reading.title);
  add('composer', reading.composer);
  add('tempo', reading.tempo);
  return n;
}

// ------------------------------------------------------------------------------------------
// (c) A second opinion on one measure
// ------------------------------------------------------------------------------------------

/** The measures most worth a second opinion: those that do not add up, then the least confident. */
export function measuresToCheck(page: OmrPage, limit = 3): { staffId: string; measureIndex: number; score: number }[] {
  const out: { staffId: string; measureIndex: number; score: number }[] = [];
  for (const sys of page.systems) {
    for (const st of sys.staves) {
      // A linked pair is asked about once, through its notation staff.
      if (st.kind === 'tab' && st.linkedStaffId && sys.staves.some((s) => s.id === st.linkedStaffId)) continue;
      for (const m of st.measures) {
        if (!m.events.length) continue;
        const confs = m.events.flatMap((e) => [e.confidence, ...e.notes.map((n) => n.confidence), e.duration?.confidence ?? 1]);
        const low = confs.filter((c) => c < 0.5).length;
        const score = (m.addsUp === false ? 2 : 0) + low / Math.max(1, confs.length) + (1 - Math.min(...confs));
        if (m.addsUp === false || low) out.push({ staffId: st.id, measureIndex: m.index, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Crop one measure (both staves of a linked pair), enlarge it, ask the model a focused question
 * with what the picture reader found, and fuse the answer into that measure only.
 */
export async function secondOpinionOnMeasure(source: GrayImage, page: OmrPage, staffId: string, measureIndex: number, client: OmrAiClient, opts: { signal?: AbortSignal; tuning?: readonly number[] } = {}): Promise<FusionReport> {
  const report = emptyReport();
  const sys = page.systems.find((s) => s.staves.some((st) => st.id === staffId));
  const staff = sys?.staves.find((st) => st.id === staffId);
  const m = staff?.measures.find((q) => q.index === measureIndex);
  if (!sys || !staff || !m) return report;
  const notation = staff.kind === 'notation' ? staff : sys.staves.find((s) => s.id === staff.linkedStaffId && s.kind === 'notation');
  const tab = staff.kind === 'tab' ? staff : sys.staves.find((s) => s.id === staff.linkedStaffId && s.kind === 'tab');
  const nm = notation?.measures.find((q) => Math.abs((q.x0 + q.x1) / 2 - (m.x0 + m.x1) / 2) < 0.5 * (m.x1 - m.x0));
  const tm = tab?.measures.find((q) => Math.abs((q.x0 + q.x1) / 2 - (m.x0 + m.x1) / 2) < 0.5 * (m.x1 - m.x0));
  const boxes = [nm, tm].filter((q): q is OmrMeasure => !!q).map((q) => q.bbox);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const box = { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
  const space = staff.geometry.space;
  const image = cropForAi(source, box, space, { margin: 3, targetSpace: 22, maxSide: 1200 });
  const lead = nm ?? tm;
  const found = (lead?.events ?? []).map((e) => describeEvent(e as OmrNotationEvent | OmrTabEvent)).join(', ') || 'nothing';
  const t = staff.timeInForce;
  const answer = await client.askJson({
    system: OMR_SYSTEM_PROMPT,
    prompt: measureQuestionPrompt({ staves: [notation ? 'notation' : null, tab ? 'tab' : null].filter((s): s is 'notation' | 'tab' => !!s), time: t && t.source !== 'assumed' ? t : null, fifths: notation?.keyInForce?.fifths ?? null, found }),
    images: [{ gray: image }],
    validate: (v) => parseAiMeasure(v),
    signal: opts.signal,
  });
  const expected = t && !m.pickup ? metreTicks(t.beats, t.beatValue) : null;
  fuseMeasure({ notation: nm, tab: tm, notationStaff: notation, tabStaff: tab }, answer, expected, notation?.keyInForce?.fifths ?? 0, report, opts.tuning ?? STANDARD_TUNING);
  for (const st of [notation, tab]) {
    if (!st) continue;
    const tf = st.timeInForce;
    checkMeasures(st, tf ? metreTicks(tf.beats, tf.beatValue) : null, st.measures[0]?.pickup === true, false);
  }
  if (answer.repairs.length) report.notes.push(`${answer.repairs.length} part(s) of the answer could not be used.`);
  return report;
}

function describeEvent(e: OmrNotationEvent | OmrTabEvent): string {
  const d = e.duration ? `${e.duration.dots ? 'dotted ' : ''}${e.duration.value}` : 'length unknown';
  if (e.kind === 'rest' || e.kind === 'tab-rest') return `${d} rest`;
  if (isNotationEvent(e)) return `${e.notes.map((n) => `${n.pitch.step}${n.pitch.alter > 0 ? '#' : n.pitch.alter < 0 ? 'b' : ''}${n.pitch.octave}`).join('+')} ${d}`;
  return `${e.notes.map((n) => `string ${n.string} fret ${n.fret}`).join('+')} ${d}`;
}

/** The alternatives of a value as a list for a correction menu (exported for screens). */
export function alternativesOf<T>(primary: T, alts: Alternative<T>[] | undefined): T[] {
  return [primary, ...(alts ?? []).map((a) => a.value)];
}
