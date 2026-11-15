/**
 * "My chords": the chords the learner knows, read from the `chord:` skills in core/progress.
 *
 * A chord counts as known when its skill is completed (marked with "I know this chord", or a
 * finished practice) and the learner has not taken the mark back. core/progress cannot un-complete
 * a skill, so taking the mark back stores `{ known: false }` in the skill's data.
 */
import type { JsonValue, ProgressState } from '@/core/progress';
import { fromSkillSlug } from './symbols';

/** What the chord screen keeps in a `chord:` skill's data. */
export interface ChordSkillData {
  known?: boolean;
}

/** Read a chord skill's data defensively. */
export function readChordData(data: unknown): ChordSkillData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const known = (data as { known?: unknown }).known;
  return typeof known === 'boolean' ? { known } : {};
}

/** Merge a patch into existing skill data, keeping keys other screens may have stored. */
export function mergeChordData(existing: unknown, patch: ChordSkillData): JsonValue {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, JsonValue>) : {};
  const out: Record<string, JsonValue> = { ...base };
  if (patch.known !== undefined) out.known = patch.known;
  return out;
}

/** Whether one skill record means "known". */
export function isKnownRecord(record: { completed: boolean; data?: unknown } | undefined): boolean {
  if (!record || !record.completed) return false;
  return readChordData(record.data).known !== false;
}

/** The canonical symbols of every known chord. */
export function knownChords(skills: ProgressState['skills']): Set<string> {
  const out = new Set<string>();
  for (const id in skills) {
    if (!id.startsWith('chord:')) continue;
    if (!isKnownRecord(skills[id])) continue;
    const c = fromSkillSlug(id.slice('chord:'.length));
    if (c) out.add(c.symbol);
  }
  return out;
}

/** A stable key of the known set, for memoising selectors. */
export function knownKey(skills: ProgressState['skills']): string {
  return [...knownChords(skills)].sort().join(',');
}
