/**
 * Small hooks of the Songs screen: "has this row been on screen yet" (to load summaries lazily)
 * and the learner's song progress.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { learnerFromParts, type LearnerSnapshot } from '@/core/library';
import { useProgress, type SkillRecord } from '@/core/progress';

/** True once the element has come within `margin` of the viewport (stays true). */
export function useSeen(ref: RefObject<Element | null>, margin = '200px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/** The learner as the song ranking sees them; changes only when their songs, favourites or experience do. */
export function useLearner(): LearnerSnapshot {
  const skills = useProgress((s) => s.skills);
  const favourites = useProgress((s) => s.favourites);
  const experience = useProgress((s) => s.profile.experience);
  return useMemo(() => learnerFromParts({ skills, favourites, experience }, Date.now()), [skills, favourites, experience]);
}

/** The `song:<id>` skill of a song, or null when it was never played. */
export function useSongSkill(id: string): SkillRecord | null {
  return useProgress((s) => s.skills[`song:${id}`] ?? null);
}
