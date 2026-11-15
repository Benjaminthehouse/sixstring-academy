/**
 * Generator for reading and writing notes on the staff, in treble clef as the guitar reads it
 * (sounding an octave lower than written). Positions come from the theory engine's staff module.
 */
import { distractorNotes, midiToNote, parseNote, staffPosition } from '@/core/theory';
import type { StaffPlaceExercise, StaffReadExercise } from '../types';
import { checkParams, defineGenerator, distinct, ordinal } from './core';

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

/** Where a note sits, in words: "on the 2nd line", "in the 3rd space", "on a ledger line below the staff". */
export function staffPlaceWords(note: string): string {
  const pos = staffPosition(note);
  const p = pos.position;
  if (p >= 0 && p <= 8) return pos.onLine ? `on the ${ordinal(p / 2 + 1)} line` : `in the ${ordinal((p + 1) / 2)} space`;
  const side = p < 0 ? 'below' : 'above';
  const lines = Math.abs(pos.ledgerLines);
  if (pos.onLine) return `on the ${lines === 1 ? 'first' : ordinal(lines)} ledger line ${side} the staff`;
  return lines === 0 ? `just ${side} the staff` : `${side} the ${lines === 1 ? 'first' : ordinal(lines)} ledger line ${side} the staff`;
}

/** The places on the five lines and four spaces where a note name (no octave) is written, bottom first. */
export function onStaffPlaces(name: string): string[] {
  const out: string[] = [];
  for (let octave = 2; octave <= 5; octave++) {
    const full = `${name}${octave}`;
    const p = staffPosition(full).position;
    if (p >= 0 && p <= 8) out.push(staffPlaceWords(full));
  }
  return out;
}

function validNote(name: string | undefined): boolean {
  return name === undefined || (parseNote(name)?.midi ?? null) !== null;
}

export const staffNote = defineGenerator({
  kind: 'staff-note',
  summary: 'Notes on the guitar staff: name the shown note, or put the named note on the staff.',
  produces: ['staff-read', 'staff-place'],
  params: [
    { name: 'ask', type: "'read' | 'place'", default: "'read'", description: 'Name the shown note, or place the named note.' },
    { name: 'low', type: 'string', default: "'E3'", description: 'Lowest sounding note (E3 is the bottom line as the guitar reads it).' },
    { name: 'high', type: 'string', default: "'F4'", description: 'Highest sounding note (F4 is the top line).' },
    { name: 'accidentals', type: 'boolean', default: 'false', description: 'Include sharps and flats.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['read', 'place'])
      .need(validNote(p.low), `"low" must be a note with its octave, like E3; got ${JSON.stringify(p.low)}.`)
      .need(validNote(p.high), `"high" must be a note with its octave, like F4; got ${JSON.stringify(p.high)}.`)
      .need(!validNote(p.low) || !validNote(p.high) || parseNote(p.high ?? 'F4')!.midi! - parseNote(p.low ?? 'E3')!.midi! >= 4, '"high" must be at least a major third above "low", so there are several notes to ask about.')
      .need(!validNote(p.low) || !validNote(p.high) || (parseNote(p.low ?? 'E3')!.midi! >= 40 && parseNote(p.high ?? 'F4')!.midi! <= 86), 'The range must stay between E2 and D6: the notes of the guitar within four ledger lines.')
      .bool('accidentals', p.accidentals).problems,
  make(p, { rng }) {
    const low = parseNote(p.low ?? 'E3')!.midi!;
    const high = parseNote(p.high ?? 'F4')!.midi!;
    const midis = Array.from({ length: high - low + 1 }, (_u, i) => low + i).filter((m) => p.accidentals === true || NATURAL_PCS.has(m % 12));
    const midi = rng.pick(midis.length ? midis : [low]);
    // A black key is written with a sharp or a flat, half of the time each.
    const full = midiToNote(midi, { prefer: rng.chance() ? 'sharps' : 'flats' });
    const parsed = parseNote(full)!;
    const name = parsed.pcName;
    const sign = parsed.alt > 0 ? ', with a sharp sign in front' : parsed.alt < 0 ? ', with a flat sign in front' : '';
    const placed = `{n:${name}} is ${staffPlaceWords(full)}${sign}.`;
    const memory = 'Lines from the bottom: E G B D F. Spaces: F A C E.';
    if (p.ask === 'place') {
      // Any octave counts, so name the places on the five lines themselves (E and F have two).
      const places = onStaffPlaces(name);
      const out: StaffPlaceExercise = {
        type: 'staff-place',
        note: name,
        octave: 'any',
        prompt: `Put {n:${name}} on the staff.`,
        explain: `{n:${name}} sits ${places.length ? places.join(' or ') : staffPlaceWords(full)}${sign}. ${memory}`,
      };
      return out;
    }
    const letters = distinct([...distractorNotes(name, { count: 6, pool: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] })], (n) => parseNote(n)!.chroma, 3, [parseNote(name)!.chroma]);
    const out: StaffReadExercise = {
      type: 'staff-read',
      note: full,
      options: rng.shuffle([name, ...letters]),
      prompt: 'Which note is this?',
      explain: `${placed} ${memory}`,
    };
    return out;
  },
});

/** The staff generators. */
export const STAFF_GENERATORS = [staffNote] as const;
