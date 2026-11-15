/**
 * The level curve. Generous early, steady later:
 *
 *   level n -> n+1 costs 20 * n XP (20, 40, 60 ...) until that reaches 500 at level 25,
 *   and every level after that costs a flat 500 XP.
 *
 * So a first session reaches level 2, a regular learner (about 40 XP a day) reaches level 10 in
 * three weeks and level 25 in about five months, and from there gains a level every 12 days or so.
 */

/** Level at which the per-level cost stops growing. */
export const STEADY_LEVEL = 25;
/** XP per level from `STEADY_LEVEL` on. */
export const STEADY_STEP = 500;
const STEP = 20;
/** Total XP at which `STEADY_LEVEL` starts (6000). */
const STEADY_XP = (STEP / 2) * (STEADY_LEVEL - 1) * STEADY_LEVEL;

/** XP needed to go from `level` to the next one. */
export function xpToNextLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.min(STEADY_STEP, STEP * l);
}

/** Total XP at which `level` starts. Level 1 starts at 0. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  if (l <= STEADY_LEVEL) return (STEP / 2) * (l - 1) * l;
  return STEADY_XP + STEADY_STEP * (l - STEADY_LEVEL);
}

/** The level a total XP amount corresponds to (1 or higher). */
export function levelForXp(xp: number): number {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  if (x >= STEADY_XP) return STEADY_LEVEL + Math.floor((x - STEADY_XP) / STEADY_STEP);
  // Solve 10 * (l - 1) * l <= x, then correct any floating-point slip.
  let level = Math.floor((1 + Math.sqrt(1 + (4 * x) / (STEP / 2))) / 2);
  while (xpForLevel(level + 1) <= x) level++;
  while (level > 1 && xpForLevel(level) > x) level--;
  return Math.max(1, level);
}

/** Guitar-themed titles. A level uses the last title at or below it. */
export const LEVEL_TITLES: ReadonlyArray<{ level: number; title: string }> = [
  { level: 1, title: 'Open String' },
  { level: 2, title: 'First Fret' },
  { level: 3, title: 'First Chord' },
  { level: 4, title: 'Clean Change' },
  { level: 5, title: 'Campfire Strummer' },
  { level: 6, title: 'Steady Hand' },
  { level: 7, title: 'Riff Maker' },
  { level: 8, title: 'Barre Breaker' },
  { level: 9, title: 'Box Explorer' },
  { level: 10, title: 'Pentatonic Pilgrim' },
  { level: 11, title: 'Rhythm Keeper' },
  { level: 12, title: 'Neck Navigator' },
  { level: 13, title: 'Chord Collector' },
  { level: 14, title: 'Mode Traveller' },
  { level: 15, title: 'Session Player' },
  { level: 17, title: 'Tone Chaser' },
  { level: 19, title: 'Fretboard Cartographer' },
  { level: 21, title: 'Improviser' },
  { level: 23, title: 'Arranger' },
  { level: 25, title: 'Stage Ready' },
  { level: 28, title: 'Bandleader' },
  { level: 32, title: 'Soloist' },
  { level: 36, title: 'Composer' },
  { level: 40, title: 'Master of the Neck' },
  { level: 45, title: 'Maestro' },
  { level: 50, title: 'Virtuoso' },
];

/** The title of a level. */
export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const entry of LEVEL_TITLES) {
    if (entry.level <= level) title = entry.title;
    else break;
  }
  return title;
}

/** Everything a level badge or XP bar needs. */
export interface LevelInfo {
  level: number;
  title: string;
  totalXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level takes in total. */
  xpForNext: number;
  /** XP still missing for the next level. */
  xpRemaining: number;
  /** 0 to 1 through the current level. */
  fraction: number;
  /** The next title the learner will earn, or null at the top title. */
  nextTitle: { level: number; title: string } | null;
}

/** Level, title and progress for a total XP amount. */
export function levelInfo(totalXp: number): LevelInfo {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const level = levelForXp(xp);
  const start = xpForLevel(level);
  const span = xpToNextLevel(level);
  const into = xp - start;
  const next = LEVEL_TITLES.find((entry) => entry.level > level) ?? null;
  return {
    level,
    title: levelTitle(level),
    totalXp: xp,
    xpIntoLevel: into,
    xpForNext: span,
    xpRemaining: span - into,
    fraction: span > 0 ? into / span : 0,
    nextTitle: next ? { level: next.level, title: next.title } : null,
  };
}
