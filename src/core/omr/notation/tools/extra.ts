/**
 * The recognizer's own test pages (src/core/omr/notation/fixtures/, rendered by
 * `node scripts/omr-symbol-templates.cjs --extra`): two voices, C and cut time, tuplet brackets,
 * grace notes, bass clef. The truth is a list of events per measure and voice, compared as
 * sequences (Node only).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPngGray } from '../../eval/png';
import type { GrayImage } from '../../image/gray';
import { analyzePage, assemblePage, extractStaff } from '../../page';
import type { OmrNotationEvent, OmrPage, RecognizeNotationStaff } from '../../types';

/** One event of the expected reading. */
export interface ExtraEvent {
  rest: boolean;
  /** Sounding MIDI, low to high. */
  midi: number[];
  value: string;
  dots: number;
  triplet: boolean;
  /** Number of grace notes printed before it (they must not be read as notes). */
  grace: number;
}

/** One extra page. */
export interface ExtraPage {
  id: string;
  image: string;
  font: string;
  clef: string;
  fifths: number;
  time: { beats: number; beatValue: number; symbol: string | null };
  /** measures -> voices -> events. */
  measures: ExtraEvent[][][];
}

/** Directory of the extra pages. */
export function extraDir(): string {
  return fileURLToPath(new URL('../fixtures/', import.meta.url));
}

/** All extra pages. */
export function loadExtraIndex(): ExtraPage[] {
  return (JSON.parse(readFileSync(join(extraDir(), 'index.json'), 'utf8')) as { pages: ExtraPage[] }).pages;
}

/** The picture of an extra page. */
export function loadExtraImage(page: ExtraPage): GrayImage {
  return readPngGray(join(extraDir(), page.image));
}

const key = (e: { rest: boolean; midi: number[]; value: string; dots: number; triplet: boolean }): string => `${e.rest ? 'r' : e.midi.join('+')}:${e.value}${'.'.repeat(e.dots)}${e.triplet ? 't' : ''}`;

/** Outcome of comparing one page. */
export interface ExtraResult {
  id: string;
  /** Measures (all voices) read exactly / total. */
  measuresExact: number;
  measures: number;
  eventsRight: number;
  events: number;
  clefOk: boolean;
  keyOk: boolean;
  timeOk: boolean;
  /** Human-readable differences. */
  diffs: string[];
  page: OmrPage;
}

/** Recognize an extra page and compare it with its truth, voice by voice. */
export async function checkExtra(spec: ExtraPage, notation: RecognizeNotationStaff, gray: GrayImage = loadExtraImage(spec)): Promise<ExtraResult> {
  const analysis = analyzePage(gray);
  const readings = [];
  for (const st of analysis.layout.staves) readings.push(st.kind === 'notation' ? await notation(extractStaff(analysis, st.index)) : null);
  const page = assemblePage(analysis, readings);
  const staff = page.systems[0]?.staves[0];
  const res: ExtraResult = { id: spec.id, measuresExact: 0, measures: spec.measures.length, eventsRight: 0, events: 0, clefOk: false, keyOk: false, timeOk: false, diffs: [], page };
  if (!staff) {
    res.diffs.push('no staff found');
    return res;
  }
  res.clefOk = spec.clef === 'bass' ? staff.clef?.type === 'bass' : staff.clef?.type === 'treble-8vb' || staff.clef?.type === 'treble';
  res.keyOk = (staff.keySignature?.fifths ?? 0) === spec.fifths;
  res.timeOk = !!staff.timeSignature && staff.timeSignature.beats === spec.time.beats && staff.timeSignature.beatValue === spec.time.beatValue && (staff.timeSignature.symbol ?? null) === spec.time.symbol;
  if (!res.clefOk) res.diffs.push(`clef: expected ${spec.clef}, read ${staff.clef?.type ?? 'none'}`);
  if (!res.keyOk) res.diffs.push(`key: expected ${spec.fifths}, read ${staff.keySignature?.fifths ?? 'none'}`);
  if (!res.timeOk) res.diffs.push(`time: expected ${spec.time.beats}/${spec.time.beatValue} ${spec.time.symbol ?? ''}, read ${staff.timeSignature ? `${staff.timeSignature.beats}/${staff.timeSignature.beatValue} ${staff.timeSignature.symbol ?? ''}` : 'none'}`);
  spec.measures.forEach((voices, mi) => {
    const m = staff.measures[mi];
    const got = (m?.events ?? []).filter((e): e is OmrNotationEvent => e.kind === 'chord' || e.kind === 'rest');
    let exact = true;
    voices.forEach((evs, vi) => {
      const mine = got.filter((e) => (e.voice ?? 1) === vi + 1).map((e) => key({ rest: e.kind === 'rest', midi: e.notes.map((n) => n.pitch.midi).sort((a, b) => a - b), value: e.duration.value, dots: e.duration.dots, triplet: !!e.duration.tuplet }));
      const want = evs.map(key);
      res.events += want.length;
      want.forEach((w, k) => { if (mine[k] === w) res.eventsRight++; });
      if (mine.join(' ') !== want.join(' ')) {
        exact = false;
        res.diffs.push(`m${mi + 1} voice ${vi + 1}: expected [${want.join(' ')}] read [${mine.join(' ')}]`);
      }
    });
    const extraVoices = got.filter((e) => (e.voice ?? 1) > voices.length);
    if (extraVoices.length) {
      exact = false;
      res.diffs.push(`m${mi + 1}: ${extraVoices.length} event(s) in a voice that is not there`);
    }
    if (exact) res.measuresExact++;
  });
  return res;
}
