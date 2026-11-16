/**
 * Practice blocks drawn from the app's own content, so a plan can say "Chromatic Spider" or
 * "Play “Greensleeves”" and open that exact exercise or song, not just a screen:
 *
 *  - every timed technique exercise (the plan's list in `content/plan/repertoire.json`, opened at
 *    `#technique--<id>`; guides such as posture, and the warm-up and cool-down routines, are not
 *    blocks),
 *  - every built-in song and study (`@/content/songs`, played at `#play--<id>`),
 *  - a short drill of each Theory Path unit (`#learn--<unit>--practice`), offered once the learner
 *    has finished a lesson of that unit.
 *
 * Each item names the level band it suits (the plan's 1-10 difficulty: beginner 1-3, intermediate
 * 3-6, expert 6-10, as the Technique screen's recommendations use) and, for a beginner, the
 * practice days it waits for. This module is loaded by the practice screen and, lazily, by Today;
 * the session bar never loads it.
 */
import type { ExperienceLevel } from '@/core/progress';
import { technique as TECHNIQUE_PLAN } from '@/content/plan/repertoire.json';
import { SONG_ENTRIES, type SongEntry } from '@/content/songs';
// The syllabus outline alone: the Theory Path registry would bring its glossary along.
import { OUTLINE } from '@/content/theory/outline';
import { target, type Area } from './areas';
import type { ContentItem } from './content';

/** The plan levels (1-10) each experience band works in. */
export const LEVEL_BANDS: Readonly<Record<ExperienceLevel, readonly [number, number]>> = {
  beginner: [1, 3],
  intermediate: [3, 6],
  expert: [6, 10],
};

const BANDS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'expert'];

/** The experience levels a plan level (1-10) suits. */
export function levelsForDifficulty(level: number): ExperienceLevel[] {
  return BANDS.filter((b) => level >= LEVEL_BANDS[b][0] && level <= LEVEL_BANDS[b][1]);
}

/**
 * Days of practice a beginner has before an item of this plan level is offered: the first week
 * stays on level 1 (as the hand-written pool does with hammer-ons at 7 days and the first
 * pentatonic box at 14).
 */
export function beginnerFromDifficulty(level: number): number | undefined {
  if (level <= 1) return undefined;
  return level === 2 ? 7 : 14;
}

/** "a, b and c". */
function listWords(words: readonly string[]): string {
  const w = words.filter(Boolean);
  if (w.length <= 1) return w.join('');
  return `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

/** The first sentence of a text (or the text itself when it has no full stop), at most ~220 characters. */
function firstSentence(text: string): string {
  const m = /^.+?[.!?](?=\s|$)/.exec(text.trim());
  const s = (m ? m[0] : text).trim();
  return s.length <= 220 ? s : `${s.slice(0, 217).replace(/\s+\S*$/, '')}…`;
}

// ---------------------------------------------------------------------------------------------
// Technique
// ---------------------------------------------------------------------------------------------

/** A technique exercise as the plan lists it (the fields used here). */
export interface TechniquePlanEntry {
  id: string;
  title: string;
  level: number;
  teaches: readonly string[];
  tempo: { start: number; goal: number; step: number };
}

/**
 * Exercises that are not a timed block: guides read once (posture, playing without pain, tuning
 * by ear, the capo) and the five-minute warm-up and cool-down routines, which are sessions of
 * their own. `library.test.ts` checks this is exactly the Technique content's guides and routines.
 */
export const NOT_A_BLOCK: ReadonlySet<string> = new Set(['tech-posture', 'tech-play-without-pain', 'tech-tune-by-ear', 'tech-capo', 'tech-warm-up', 'tech-cool-down']);

/** Technique exercises that belong to another area of a session. */
const TECHNIQUE_AREA: Readonly<Record<string, Area>> = {
  'tech-spider': 'warmup',
  'tech-alternate-open': 'warmup',
  'tech-changes-pairs-1': 'chords',
  'tech-changes-pairs-2': 'chords',
  'tech-changes-pairs-3': 'chords',
  'tech-changes-barre': 'chords',
  'tech-barre-strength': 'chords',
  'tech-triad-inversions': 'chords',
  'tech-strum-constant': 'rhythm',
  'tech-strum-accuracy': 'rhythm',
  'tech-subdivisions': 'rhythm',
  'tech-metronome-2-4': 'rhythm',
  'tech-odd-meters': 'rhythm',
  'tech-rasgueado': 'rhythm',
  'tech-alternate-scale-g': 'scales',
  'tech-all-keys-scales': 'scales',
};

/** What the ladder asks, in the Technique screen's terms (up a rung per clean pass, back one after two that are not). */
function ladderLine(t: TechniquePlanEntry['tempo']): string {
  if (t.step > 0 && t.goal > t.start) {
    return `Start at ${t.start} BPM: each clean pass moves you up ${t.step}, two in a row that are not clean step you back one. The goal is ${t.goal}.`;
  }
  return `At an easy ${t.start} BPM, slowly and exactly. The exercise shows what to listen for.`;
}

/**
 * The one-minute-changes exercises: kept per chord pair (`chord-change:<pair>`), not under the
 * exercise. `library.test.ts` checks this against the content's `mode: 'changes'`.
 */
const CHANGES: ReadonlySet<string> = new Set(['tech-changes-pairs-1', 'tech-changes-pairs-2', 'tech-changes-pairs-3']);

/** The block for one technique exercise. */
export function techniqueItem(e: TechniquePlanEntry): ContentItem {
  const changes = CHANGES.has(e.id);
  return {
    id: `technique:${e.id}`,
    area: TECHNIQUE_AREA[e.id] ?? 'technique',
    levels: levelsForDifficulty(e.level),
    beginnerFrom: beginnerFromDifficulty(e.level),
    title: e.title,
    goal: `Trains ${listWords(e.teaches)}. ${ladderLine(e.tempo)}`,
    target: target('technique', 'Open the exercise', [e.id]),
    skillId: changes ? undefined : `technique:${e.id}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Songs and studies
// ---------------------------------------------------------------------------------------------

/** Studies that drill one area of a session rather than being repertoire, by id prefix. */
const STUDY_AREAS: ReadonlyArray<readonly [prefix: string, area: Area]> = [
  ['st-change-', 'chords'],
  ['st-barre-', 'chords'],
  ['st-caged-chords', 'chords'],
  ['st-jazz-', 'chords'],
  ['st-power-chords-', 'chords'],
  ['st-pent-', 'scales'],
  ['st-mode-', 'scales'],
  ['st-caged-scale', 'scales'],
  ['st-caged-melody', 'scales'],
  ['st-lick-', 'technique'],
  ['st-arpeggio-', 'technique'],
  ['st-blues-shuffle-', 'rhythm'],
  ['st-boom-chick', 'rhythm'],
  ['st-bluegrass-g-run', 'rhythm'],
  ['st-bossa-groove', 'rhythm'],
  ['st-andalusian-cadence', 'rhythm'],
];

/** The session area a song or study belongs to. */
export function songArea(id: string): Area {
  return STUDY_AREAS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'repertoire';
}

/** The block for one built-in song or study. */
export function songItem(s: Pick<SongEntry, 'id' | 'title' | 'level' | 'kind' | 'teaches' | 'about'>): ContentItem {
  const piece = s.kind !== 'study' && s.kind !== 'riff';
  return {
    id: `song:${s.id}`,
    area: songArea(s.id),
    levels: levelsForDifficulty(s.level),
    beginnerFrom: beginnerFromDifficulty(s.level),
    title: piece ? `Play “${s.title}”` : s.title,
    goal: firstSentence(s.about),
    steps: s.teaches.slice(0, 3),
    target: target('play', piece ? 'Play it' : 'Open the study', [s.id]),
    skillId: `song:${s.id}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Theory Path units
// ---------------------------------------------------------------------------------------------

/** Who a unit's drill suits: its own stage and the one after (an expert keeps drilling expert units). */
const UNIT_LEVELS: Readonly<Record<ExperienceLevel, readonly ExperienceLevel[]>> = {
  beginner: ['beginner', 'intermediate'],
  intermediate: ['intermediate', 'expert'],
  expert: ['expert'],
};

/** The drill block of a Theory Path unit (offered once a lesson of it is done: `ContentItem.unit`). */
export function unitItem(u: { id: string; title: string; summary: string }, stage: ExperienceLevel): ContentItem {
  return {
    id: `theory-unit:${u.id}`,
    area: 'theory',
    levels: UNIT_LEVELS[stage],
    title: `Drill: ${u.title}`,
    goal: `A short mixed drill of the lessons you have done in this unit, so they stay with you. ${u.summary}`,
    target: target('learn', 'Start the drill', [u.id, 'practice']),
    unit: u.id,
  };
}

// ---------------------------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------------------------

/** Build the library from content lists (pure, for tests). */
export function buildLibrary(parts: {
  technique: readonly TechniquePlanEntry[];
  songs: ReadonlyArray<Pick<SongEntry, 'id' | 'title' | 'level' | 'kind' | 'teaches' | 'about'>>;
  units: ReadonlyArray<{ unit: { id: string; title: string; summary: string }; stage: ExperienceLevel }>;
}): ContentItem[] {
  return [
    ...parts.technique.filter((e) => !NOT_A_BLOCK.has(e.id)).map(techniqueItem),
    ...parts.songs.map(songItem),
    ...parts.units.map((p) => unitItem(p.unit, p.stage)),
  ];
}

/** Every practice block the app's content offers, in a stable order. */
export const PRACTICE_LIBRARY: readonly ContentItem[] = buildLibrary({
  technique: TECHNIQUE_PLAN as readonly TechniquePlanEntry[],
  songs: SONG_ENTRIES,
  units: OUTLINE.stages.flatMap((stage) => stage.units.map((unit) => ({ unit, stage: stage.id }))),
});

/** Library items by id. */
export const LIBRARY_BY_ID: Readonly<Record<string, ContentItem>> = Object.fromEntries(PRACTICE_LIBRARY.map((c) => [c.id, c]));
