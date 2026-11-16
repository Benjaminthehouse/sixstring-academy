/**
 * Addresses of the progressions screen (route params after `#progressions`):
 *
 *   (none)                      the browser
 *   <id>                        a progression in its remembered or default key
 *   <id>--<key>                 a progression in a key (`--f-sharp`, `--bb`)
 *   <id>--<key>--jam            jamming over it with the band (also `<id>--jam`), set up with any of:
 *       t<bpm>                  the tempo (`t96`)
 *       <style>                 a band style id (`waltz`, `blues-shuffle`, `ballad-68` ...)
 *       x<n>                    play n times through and an ending instead of looping (`x2`)
 *       hide-chart              chord names hidden until "Show the chords" (work them out by ear)
 *   builder                     the builder, on the working draft
 *   builder--jam                jamming over the draft
 *   builder--<saved id>         open a saved progression in the builder (`my-…`)
 */
import { getProgression, type Progression } from '@/content/progressions';
import { BACKING_STYLE_IDS, type BackingStyleId } from '@/core/audio';
import { keyParam, tonicFromParam } from './keys';

/** How a jam's address sets the band up; every field is optional. */
export interface JamOptions {
  /** Tempo in BPM (kept inside what the style plays when applied). */
  tempo?: number;
  style?: BackingStyleId;
  /** Times through before the ending; unset = whatever the learner had (looping by default). */
  passes?: number;
  /** Chord names hidden until the learner reveals them. */
  hideChart?: boolean;
}

const STYLES = new Set<string>(BACKING_STYLE_IDS);

/** Read one jam option into `into`; false when the param is not one. */
function readJamOption(param: string, into: JamOptions): boolean {
  let m: RegExpExecArray | null;
  if ((m = /^t(\d{2,3})$/.exec(param))) into.tempo = Number(m[1]);
  else if (STYLES.has(param)) into.style = param as BackingStyleId;
  else if ((m = /^x(\d{1,2})$/.exec(param)) && Number(m[1]) >= 1 && Number(m[1]) <= 16) into.passes = Number(m[1]);
  else if (param === 'hide-chart') into.hideChart = true;
  else return false;
  return true;
}

/** The params of jam options, in a fixed order. */
export function jamOptionParams(o: JamOptions): string[] {
  const out: string[] = [];
  if (o.tempo !== undefined) out.push(`t${Math.round(o.tempo)}`);
  if (o.style) out.push(o.style);
  if (o.passes !== undefined) out.push(`x${o.passes}`);
  if (o.hideChart) out.push('hide-chart');
  return out;
}

/** What a route asks for. */
export type Address =
  | { view: 'browse' }
  | { view: 'page' | 'jam'; progression: Progression; tonic: string | null; canonical: string[]; options: JamOptions }
  | { view: 'builder' | 'builder-jam' }
  | { view: 'open-saved'; id: string }
  | { view: 'unknown' };

/** Read the route params. `tonic` is null when the address names no key (use the remembered one). */
export function parseAddress(params: readonly string[]): Address {
  const [first, ...rest] = params;
  if (!first) return { view: 'browse' };
  if (first === 'builder') {
    if (!rest.length) return { view: 'builder' };
    if (rest[0] === 'jam') return { view: 'builder-jam' };
    if (/^my-[a-z0-9-]+$/.test(rest[0])) return { view: 'open-saved', id: rest[0] };
    return { view: 'builder' };
  }
  const p = getProgression(first);
  if (!p) return { view: 'unknown' };
  const jam = rest.includes('jam');
  const options: JamOptions = {};
  const others = rest.filter((r) => r !== 'jam' && !readJamOption(r, options));
  const tonic = tonicFromParam(p, others[0] ?? null);
  const view = jam ? 'jam' : 'page';
  // Band options belong to the jam: on the chart page they mean nothing and are dropped.
  const kept = jam ? options : {};
  return { view, progression: p, tonic, canonical: progressionParams(p.id, tonic, jam, kept), options: kept };
}

/** Route params for a progression, optionally in a key and in the jam view (with its options). */
export function progressionParams(id: string, tonic: string | null, jam = false, options: JamOptions = {}): string[] {
  const out = [id];
  if (tonic) out.push(keyParam(tonic));
  if (jam) out.push('jam', ...jamOptionParams(options));
  return out;
}
