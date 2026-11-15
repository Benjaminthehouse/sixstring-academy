/**
 * The nine kinds of practice block, what each is called and drawn with, the screen of the app that
 * serves it, and how the rest of the app's activity kinds and skill ids map onto them.
 *
 * Links are data (`BlockTarget`): a route name plus slug params. Today most screens are linked at
 * route level (`#scales`); when a screen gains deep links, give the content item (or
 * `skillTarget`) the params and nothing else has to change.
 */
import type { ActivityKind } from '@/core/progress';

/** A kind of practice block. */
export type Area = 'warmup' | 'technique' | 'theory' | 'scales' | 'chords' | 'rhythm' | 'ear' | 'repertoire' | 'free';

/** Every area, in the order a session usually runs them. */
export const AREAS: readonly Area[] = ['warmup', 'technique', 'scales', 'chords', 'rhythm', 'theory', 'ear', 'repertoire', 'free'];

/** The areas the planner chooses between (warm-up and free play have fixed places). */
export const FOCUS_AREAS: readonly Area[] = ['technique', 'scales', 'chords', 'rhythm', 'theory', 'ear', 'repertoire'];

/** A screen a block can send the learner to. */
export interface BlockTarget {
  /** Route name from the registry (`scales`, `chords` ...). */
  route: string;
  /** Slug params for a deep link; empty for the screen itself. */
  params: string[];
  /** Button text, starting with a verb ("Open Scales"). */
  label: string;
}

/** What the app knows about an area. */
export interface AreaInfo {
  id: Area;
  /** Short label ("Chords and changes"). */
  label: string;
  /** Lower-case form for sentences ("chord work"). */
  noun: string;
  /** lucide icon name. */
  icon: string;
  /** The screen that serves this area by default. */
  target: BlockTarget;
}

/** Make a link target. */
export function target(route: string, label: string, params: readonly string[] = []): BlockTarget {
  return { route, params: [...params], label };
}

/** Static facts about every area. */
export const AREA_INFO: Readonly<Record<Area, AreaInfo>> = {
  warmup: { id: 'warmup', label: 'Warm-up', noun: 'warming up', icon: 'Sunrise', target: target('technique', 'Open Technique') },
  technique: { id: 'technique', label: 'Technique', noun: 'technique', icon: 'Hand', target: target('technique', 'Open Technique') },
  theory: { id: 'theory', label: 'Theory and the neck', noun: 'theory', icon: 'BookOpen', target: target('learn', 'Open the Theory Path') },
  scales: { id: 'scales', label: 'Scales', noun: 'scale practice', icon: 'Waypoints', target: target('scales', 'Open Scales') },
  chords: { id: 'chords', label: 'Chords and changes', noun: 'chord work', icon: 'Grid3x3', target: target('chords', 'Open Chords') },
  rhythm: { id: 'rhythm', label: 'Rhythm', noun: 'rhythm', icon: 'Drum', target: target('rhythm', 'Open Rhythm') },
  ear: { id: 'ear', label: 'Ear training', noun: 'ear training', icon: 'Ear', target: target('ear', 'Open Ear Training') },
  repertoire: { id: 'repertoire', label: 'Songs', noun: 'song practice', icon: 'Music', target: target('songs', 'Open Songs') },
  free: { id: 'free', label: 'Free play', noun: 'free play', icon: 'Sparkles', target: target('progressions', 'Open a jam track') },
};

/** True for a known area id. */
export function isArea(value: unknown): value is Area {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AREA_INFO, value);
}

/** Which area the time of an activity kind counts toward (null: it is not practice of one area). */
export const KIND_AREA: Readonly<Partial<Record<ActivityKind, Area>>> = {
  'scale-practice': 'scales',
  'scale-game': 'scales',
  'chord-practice': 'chords',
  'chord-change': 'chords',
  progression: 'chords',
  song: 'repertoire',
  fretboard: 'theory',
  'theory-lesson': 'theory',
  'teacher-lesson': 'theory',
  review: 'theory',
  ear: 'ear',
  rhythm: 'rhythm',
  metronome: 'rhythm',
  technique: 'technique',
};

/** The area a skill id belongs to, from its prefix (`scale:` -> scales), or null. */
export function areaOfSkill(id: string): Area | null {
  const prefix = id.split(':')[0];
  switch (prefix) {
    case 'scale':
    case 'mode':
      return 'scales';
    case 'chord':
    case 'chord-change':
    case 'progression':
      return 'chords';
    case 'song':
      return 'repertoire';
    case 'theory':
    case 'teacher':
    case 'fretboard':
      return 'theory';
    case 'ear':
    case 'interval':
      return 'ear';
    case 'rhythm':
    case 'strum':
      return 'rhythm';
    case 'technique':
      return 'technique';
    default:
      return null;
  }
}

const SHARP_FLAT: Readonly<Record<string, string>> = { sharp: '♯', flat: '♭' };

function words(slug: string): string[] {
  return slug.split('-').filter(Boolean);
}

/** "a-minor-pentatonic" -> "A minor pentatonic"; "f-sharp-major" -> "F♯ major". */
function noteWords(slug: string): string {
  const parts = words(slug);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (i === 0 && /^[a-g]$/.test(w)) {
      const accidental = SHARP_FLAT[parts[i + 1] ?? ''];
      out.push(w.toUpperCase() + (accidental ?? ''));
      if (accidental) i++;
      continue;
    }
    out.push(w);
  }
  const text = out.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleCase(slug: string): string {
  return words(slug)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "box-2" -> "box 2", "position-3" -> "position 3". */
function positionWords(slug: string): string {
  return words(slug).join(' ');
}

/**
 * A chord slug (skill ids are lower-case slugs) as its symbol: `am7` -> "Am7", `em` -> "Em",
 * `f-sharp-m` -> "F♯m", `c-e` -> "C/E". Upper-casing the whole slug would turn "am" into "AM",
 * which reads as A major.
 */
export function chordSymbol(slug: string): string {
  const text = slug
    .trim()
    .replace(/^([a-g])-sharp-?/i, '$1♯')
    .replace(/^([a-g])-flat-?/i, '$1♭')
    .replace(/-([a-g])$/i, (_m, bass: string) => `/${bass.toUpperCase()}`)
    .replace(/-/g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `em-am` -> "Em to Am": split where the second chord's root starts. */
function chordChangeName(slug: string): string {
  const [from, to] = slug.split(/-(?=[a-g](?:m|maj|min|dim|aug|sus|add|\d|$))/i);
  return to ? `${chordSymbol(from)} to ${chordSymbol(to)}` : chordSymbol(slug);
}

/**
 * A plain name for a skill id, used when no screen has given it a title:
 * `scale:a-minor-pentatonic:box-2` -> "A minor pentatonic, box 2", `chord-change:em-am` -> "Em to Am change".
 */
export function skillName(id: string): string {
  const [prefix, a = '', b = ''] = id.split(':');
  switch (prefix) {
    case 'scale':
    case 'mode':
      return b ? `${noteWords(a)}, ${positionWords(b)}` : noteWords(a);
    case 'chord':
      return `${chordSymbol(a)} chord`;
    case 'chord-change':
      return `${chordChangeName(a)} change`;
    case 'song':
      return titleCase(a);
    case 'theory':
      return b ? `${titleCase(a)}, ${positionWords(b)}` : titleCase(a);
    case 'teacher':
      return b ? `${titleCase(b)} with ${titleCase(a)}` : `Lessons with ${titleCase(a)}`;
    case 'fretboard':
      return `Notes on the neck (${positionWords(a)})`;
    default:
      return noteWords([a, b].filter(Boolean).join('-') || prefix);
  }
}
