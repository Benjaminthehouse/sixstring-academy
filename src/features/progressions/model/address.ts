/**
 * Addresses of the progressions screen (route params after `#progressions`):
 *
 *   (none)                      the browser
 *   <id>                        a progression in its remembered or default key
 *   <id>--<key>                 a progression in a key (`--f-sharp`, `--bb`)
 *   <id>--<key>--jam            jamming over it with the band (also `<id>--jam`)
 *   builder                     the builder, on the working draft
 *   builder--jam                jamming over the draft
 *   builder--<saved id>         open a saved progression in the builder (`my-…`)
 */
import { getProgression, type Progression } from '@/content/progressions';
import { keyParam, tonicFromParam } from './keys';

/** What a route asks for. */
export type Address =
  | { view: 'browse' }
  | { view: 'page' | 'jam'; progression: Progression; tonic: string | null; canonical: string[] }
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
  const keyPart = rest.find((r) => r !== 'jam') ?? null;
  const tonic = tonicFromParam(p, keyPart);
  const view = jam ? 'jam' : 'page';
  return { view, progression: p, tonic, canonical: progressionParams(p.id, tonic, jam) };
}

/** Route params for a progression, optionally in a key and in the jam view. */
export function progressionParams(id: string, tonic: string | null, jam = false): string[] {
  const out = [id];
  if (tonic) out.push(keyParam(tonic));
  if (jam) out.push('jam');
  return out;
}
