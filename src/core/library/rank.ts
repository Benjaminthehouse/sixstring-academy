/**
 * "Good next songs for you": which songs fit the learner now. Pure, so it is unit-tested and the
 * same everywhere (Songs screen, Today).
 *
 * The idea: find the level the learner is comfortable at (their stated experience, raised by the
 * songs they have already played well), aim one level above it, keep songs they started near the
 * top, and move songs they have mastered out of the way.
 */
import type { ProgressState } from '@/core/progress';
import type { SongListing } from './types';

/** What the ranking needs to know about the learner (see `learnerFromProgress`). */
export interface LearnerSnapshot {
  experience: 'beginner' | 'intermediate' | 'expert' | null;
  /** Per song id (without the `song:` prefix). */
  played: Readonly<Record<string, PlayedSong>>;
  favourites: ReadonlySet<string>;
  now: number;
}

/** The parts of a `song:<id>` skill the ranking uses. */
export interface PlayedSong {
  attempts: number;
  completed: boolean;
  stars: number;
  mastery: number;
  bestAccuracy: number;
  lastAt: number;
}

/** How a song's level relates to the learner's. */
export type SongFit = 'easy' | 'right' | 'stretch' | 'hard';

/** One ranked song with the reason shown to the learner. */
export interface Recommendation {
  listing: SongListing;
  score: number;
  fit: SongFit;
  /** Short, plain: "Right at your level", "You started this one". */
  reason: string;
}

const DAY = 86_400_000;
const BASE_LEVEL: Record<NonNullable<LearnerSnapshot['experience']>, number> = { beginner: 1, intermediate: 4, expert: 7 };

/** The learner as the ranking sees them, read from the progress state. */
export function learnerFromProgress(state: ProgressState, now: number): LearnerSnapshot {
  return learnerFromParts({ skills: state.skills, favourites: state.favourites, experience: state.profile.experience }, now);
}

/** The same from the three slices it needs (so a React screen can select just those). */
export function learnerFromParts(parts: { skills: ProgressState['skills']; favourites: ProgressState['favourites']; experience: string | null | undefined }, now: number): LearnerSnapshot {
  const played: Record<string, PlayedSong> = {};
  for (const id in parts.skills) {
    if (!id.startsWith('song:')) continue;
    const r = parts.skills[id];
    played[id.slice(5)] = { attempts: r.attempts, completed: r.completed, stars: r.stars, mastery: r.mastery, bestAccuracy: r.bestAccuracy, lastAt: r.lastAt };
  }
  const favourites = new Set<string>();
  for (const key in parts.favourites) {
    const f = parts.favourites[key];
    if (f.kind === 'song') favourites.add(f.id);
  }
  const exp = parts.experience;
  return { experience: exp === 'beginner' || exp === 'intermediate' || exp === 'expert' ? exp : null, played, favourites, now };
}

/** Played well enough to count as learned. */
function isMastered(p: PlayedSong | undefined): boolean {
  return !!p && (p.stars >= 3 || p.mastery >= 4);
}

/** Played well enough to show the learner can manage that level. */
function isComfortable(p: PlayedSong | undefined): boolean {
  return !!p && p.completed && (p.stars >= 2 || p.mastery >= 2 || p.bestAccuracy >= 0.8);
}

/** The level a learner should be offered now (1–10). */
export function targetLevel(list: readonly SongListing[], learner: LearnerSnapshot): number {
  let target = BASE_LEVEL[learner.experience ?? 'beginner'];
  for (const s of list) if (isComfortable(learner.played[s.id])) target = Math.max(target, s.level + 1);
  return Math.min(10, Math.max(1, target));
}

function fitOf(diff: number): SongFit {
  if (diff <= -2) return 'easy';
  if (diff <= 0) return 'right';
  if (diff === 1) return 'stretch';
  return 'hard';
}

const FIT_SCORE: Record<string, number> = { '-2': 4, '-1': 7, '0': 10, '1': 8, '2': 2 };
const FIT_REASON: Record<SongFit, string> = { easy: 'An easy win', right: 'Right at your level', stretch: 'A small step up', hard: 'A challenge for later' };

/** Every listing ranked for the learner, best first. */
export function rankSongs(list: readonly SongListing[], learner: LearnerSnapshot): Recommendation[] {
  const target = targetLevel(list, learner);
  return list
    .map((listing) => {
      const diff = Math.round(listing.level) - target;
      const fit = fitOf(diff);
      let score = FIT_SCORE[String(diff)] ?? (diff < 0 ? 4 + diff : 2 - 3 * (diff - 2));
      let reason = FIT_REASON[fit];
      const p = learner.played[listing.id];
      const fav = learner.favourites.has(listing.id);
      if (isMastered(p)) {
        score -= 12;
        reason = 'You know this one';
      } else if (p && p.attempts > 0) {
        score += 4 + (learner.now - p.lastAt < 7 * DAY ? 1 : 0);
        reason = p.completed && p.stars > 0 ? `Polish it: you have ${p.stars} of 3 stars` : 'You started this one';
      } else if (fav) {
        reason = 'One of your favourites';
      } else if (listing.source === 'mine' && learner.now - listing.addedAt < 14 * DAY) {
        score += 2;
        reason = 'You added this';
      }
      if (fav) score += 2;
      return { listing, score, fit, reason };
    })
    .sort((a, b) => b.score - a.score || a.listing.level - b.listing.level || a.listing.title.localeCompare(b.listing.title));
}

/**
 * The top few songs to suggest: not mastered, not far above the learner, and (where the list
 * allows) of different styles, so the suggestions are not three of a kind.
 */
export function goodNextSongs(list: readonly SongListing[], learner: LearnerSnapshot, count = 3): Recommendation[] {
  const ranked = rankSongs(list, learner).filter((r) => r.fit !== 'hard' && !isMastered(learner.played[r.listing.id]));
  const picked: Recommendation[] = [];
  const styles = new Set<string>();
  for (const r of ranked) {
    if (picked.length >= count) break;
    const style = r.listing.style ?? r.listing.kind ?? r.listing.source;
    if (styles.has(style)) continue;
    styles.add(style);
    picked.push(r);
  }
  for (const r of ranked) {
    if (picked.length >= count) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.sort((a, b) => b.score - a.score);
}
