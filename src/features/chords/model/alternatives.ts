/**
 * "Too hard for now? Play this instead." The easier things a beginner can play in place of a
 * chord: an easier shape of the same chord (the small F), a close substitute with an easy open
 * shape (Fmaj7 for F, Bm7 for Bm), the plain chord under a big jazz chord (C7 for C13♭9), a capo
 * trick (capo 1 and the A shape for B♭) and the power chord. Every suggestion is computed by the
 * guitar engine and carries a playable voicing.
 */
import { beginnerVoicing, chordVoicings, libraryVoicings, suggestCapo, type Voicing } from '@/core/guitar';
import { getChordType, parseChord, type Chord } from '@/core/theory';
import { displaySymbol } from './symbols';
import { defaultVoicing } from './voicings';

/** What kind of help a suggestion is. */
export type AlternativeKind = 'easier-shape' | 'substitute' | 'simplify' | 'capo' | 'power';

/** One suggestion. */
export interface Alternative {
  kind: AlternativeKind;
  /** Heading: "The small F", "Fmaj7 instead", "Capo 1, A shape". */
  title: string;
  /** Why it works and what it costs, in plain words. */
  detail: string;
  /** The chord this shape is named as (with a capo: the shape's own name, `A`). */
  symbol: string;
  /** The chord that sounds (with a capo: `Bb`). */
  sounds: string;
  voicing: Voicing;
  /** Capo fret for a capo trick, else 0. */
  capo: number;
}

/** A chord counts as "hard" from this difficulty (a full barre is about 6–7, the small F 4.4). */
export const HARD_FROM = 4.5;

/** The engine's standard voicing (the one everybody means: the barre for F and Bm). */
export function standardVoicing(symbol: string, tuning = 'standard'): Voicing | null {
  try {
    return chordVoicings(symbol, { tuning })[0] ?? null;
  } catch {
    return null;
  }
}

/** True when a beginner would find the chord's usual shape hard. */
export function isHardChord(symbol: string, tuning = 'standard'): boolean {
  const v = standardVoicing(symbol, tuning);
  if (!v) return true;
  const fullBarre = v.barres.some((b) => b.fromString - b.toString >= 4);
  return v.difficulty > HARD_FROM || fullBarre;
}

/** Close substitutes by chord type: the same job, an easier shape. */
const SUBSTITUTES: Record<string, string[]> = {
  major: ['maj7', 'add9', 'sus2', '6'],
  minor: ['m7', 'madd9'],
  '7': ['major'],
  maj7: ['major'],
  m7: ['minor'],
  '6': ['major'],
  m6: ['minor'],
  sus4: ['sus2'],
  sus2: ['sus4'],
};

/** The plain chord beneath a decorated one: what to play when a big chord is too much. */
const SIMPLER: Record<string, string> = {
  majb5: 'major',
  maj7b5: 'maj7',
  maj7sharp5: 'maj7',
  mmaj7: 'minor',
  m7sharp5: 'm7',
  sus2sus4: 'sus4',
  '7sus2': '7sus4',
  '9sus4': '7sus4',
  '13sus4': '7sus4',
  '7sus4b9': '7sus4',
  add9: 'major',
  madd9: 'minor',
  add11: 'major',
  add4: 'major',
  madd11: 'minor',
  addsharp11: 'major',
  '69': '6',
  m69: 'm6',
  mb6: 'minor',
  '9': '7',
  maj9: 'maj7',
  m9: 'm7',
  mmaj9: 'mmaj7',
  dimmaj7: 'dim7',
  '7sharp5': 'aug',
  m9b5: 'm7b5',
  '11': '7sus4',
  m11: 'm7',
  m7add11: 'm7',
  maj7sharp11: 'maj7',
  maj9sharp11: 'maj7',
  '13': '7',
  maj13: 'maj7',
  m13: 'm7',
  '7b5': '7',
  '7b9': '7',
  '7sharp9': '7',
  '7sharp11': '7',
  '7b13': '7',
  '9sharp11': '9',
  '13sharp11': '13',
  '9sharp5': '7sharp5',
  '9b5': '7b5',
  '9b13': '9',
  '13b9': '7',
  '13sharp9': '7',
  '7b9b13': '7',
  '7sharp9sharp5': '7',
  '7b9sharp5': '7',
  '7b9b5': '7',
  '7sharp9b5': '7',
  '7b9sharp11': '7',
  '7sharp9sharp11': '7',
  '7alt': '7',
};

/** The plain chord to play instead of a decorated one, or null (`C13b9` -> `C7`, `G/B` -> `G`). */
export function simplerChord(symbol: string): string | null {
  const c = parseChord(symbol);
  if (!c) return null;
  if (c.bass) return parseChord(c.symbol.split('/')[0])?.symbol ?? null;
  const target = SIMPLER[c.type.id];
  if (!target) return null;
  return withType(c, target);
}

function withType(c: Chord, typeId: string): string | null {
  const type = getChordType(typeId);
  if (!type) return null;
  return parseChord(`${c.root}${type.symbol}`)?.symbol ?? null;
}

function easiestOpen(symbol: string, tuning: string): Voicing | null {
  try {
    const list = libraryVoicings(symbol, { categories: ['open'], tuning }).filter((v) => !v.barres.some((b) => b.fromString - b.toString >= 4));
    return list.sort((a, b) => a.difficulty - b.difficulty)[0] ?? null;
  } catch {
    return null;
  }
}

/** Easier things to play instead of `symbol`, best first (at most four). Empty for chords that are already easy. */
export function easierAlternatives(symbol: string, tuning = 'standard'): Alternative[] {
  const c = parseChord(symbol);
  if (!c) return [];
  const standard = standardVoicing(c.symbol, tuning);
  const hard = isHardChord(c.symbol, tuning);
  const simpler = simplerChord(c.symbol);
  if (!hard && !simpler) return [];
  const bar = standard?.difficulty ?? 10;
  const name = displaySymbol(c.symbol);
  const out: Alternative[] = [];

  // 1. An easier shape of the same chord.
  if (hard) {
    const easy = beginnerVoicing(c.symbol, { tuning }) ?? defaultVoicing(c.symbol, tuning);
    const shown = easy && standard && easy.id !== standard.id && easy.difficulty < bar - 0.5 && easy.notes.length >= 4 ? easy : null;
    if (shown) {
      out.push({
        kind: 'easier-shape',
        title: c.symbol === 'F' ? 'The small F' : `An easier ${name}`,
        detail: `${shown.label}: the same chord on fewer strings, without the full barre. It sounds a little lighter; leave the bass strings out of your strum.`,
        symbol: c.symbol,
        sounds: c.symbol,
        voicing: shown,
        capo: 0,
      });
    }
  }

  // 2. A close substitute with an easy open shape.
  if (hard && !c.bass) {
    for (const typeId of SUBSTITUTES[c.type.id] ?? []) {
      const sub = withType(c, typeId);
      if (!sub) continue;
      const v = easiestOpen(sub, tuning);
      if (!v || v.difficulty >= bar - 0.5) continue;
      const subName = displaySymbol(sub);
      out.push({
        kind: 'substitute',
        title: `${subName} instead`,
        detail: substituteWhy(c, sub, subName, name),
        symbol: sub,
        sounds: sub,
        voicing: v,
        capo: 0,
      });
      break;
    }
  }

  // 3. The plain chord under a decorated one.
  if (simpler) {
    const v = defaultVoicing(simpler, tuning);
    if (v && (v.difficulty < bar || c.type.tier >= 3 || c.bass)) {
      const simpleName = displaySymbol(simpler);
      out.push({
        kind: 'simplify',
        title: `Play ${simpleName}`,
        detail: c.bass
          ? `Leave the bass note out: ${simpleName} is the same chord with its usual root at the bottom. Fine whenever nobody else is playing that bass line.`
          : `${name} is ${simpleName} with extra colour on top. When the shape is too much, ${simpleName} does the same job in the song; the melody or another instrument can add the rest.`,
        symbol: simpler,
        sounds: simpler,
        voicing: v,
        capo: 0,
      });
    }
  }

  // 4. A capo trick: an easy open shape that sounds as this chord.
  if (hard) {
    try {
      const capo = suggestCapo([c.symbol], { tuning }).find((s) => s.capo >= 1 && s.capo <= 7 && s.shapes[0]?.easy && s.shapes[0].voicing);
      const shape = capo?.shapes[0];
      if (capo && shape && shape.voicing) {
        const shapeName = displaySymbol(shape.shape);
        out.push({
          kind: 'capo',
          title: `Capo ${capo.capo}, ${shapeName} shape`,
          detail: `Clamp a capo at fret ${capo.capo} and play the open ${shapeName} shape: it sounds as ${name}. Best when the whole song suits it, because every other chord moves up ${capo.capo === 1 ? 'a fret' : `${capo.capo} frets`} too.`,
          symbol: shape.shape,
          sounds: c.symbol,
          voicing: shape.voicing,
          capo: capo.capo,
        });
      }
    } catch {
      // No capo suggestion: nothing to add.
    }
  }

  // 5. The power chord, for major and minor triads in rock.
  if (hard && (c.type.id === 'major' || c.type.id === 'minor') && !c.bass) {
    const power = parseChord(`${c.root}5`);
    const v = power ? defaultVoicing(power.symbol, tuning) : null;
    if (power && v && v.difficulty < bar) {
      const powerName = displaySymbol(power.symbol);
      out.push({
        kind: 'power',
        title: `${powerName}, the power chord`,
        detail: `Root and fifth only, two or three strings and one shape everywhere. It leaves out the third, so it is neither major nor minor: right for rock and distortion, thin on an acoustic ballad.`,
        symbol: power.symbol,
        sounds: power.symbol,
        voicing: v,
        capo: 0,
      });
    }
  }
  return out.slice(0, 4);
}

function substituteWhy(c: Chord, sub: string, subName: string, name: string): string {
  const shared = c.notes.filter((n) => (parseChord(sub)?.notes ?? []).includes(n)).length;
  const subType = parseChord(sub)?.type.id;
  if (subType === 'maj7') return `${subName} shares ${shared} notes with ${name} and needs no barre. It fits almost anywhere ${name} does, with a softer, dreamier colour.`;
  if (subType === 'm7') return `${subName} keeps all ${shared} notes of ${name} and adds a mellow seventh. Its open shape is far easier, and in most songs nobody will notice the swap.`;
  if (subType === 'add9' || subType === 'sus2' || subType === 'madd9') return `${subName} shares ${shared} notes with ${name} and has an easy open shape. It sounds a little more open; try it in the song and trust your ears.`;
  return `${subName} shares ${shared} notes with ${name} and has an easier shape. Try it in the song and trust your ears.`;
}
