import { describe, expect, it } from 'vitest';
import { estimateLessonSeconds, formatProblems, validateCourse } from '@/lessons';
import { assembleTheory, loadWrittenUnits } from '../index';

describe('circle-of-fifths: validation (scratch)', () => {
  it('has no problems', async () => {
    const units = await loadWrittenUnits();
    const problems = validateCourse(assembleTheory(units).course).filter((p) => p.unit === 'circle-of-fifths' || p.unit === 'minor-scales' || p.unit === 'triplets-swing-syncopation');
    const all = validateCourse(assembleTheory(units).course); console.log("units", units.map((u) => u.id).join(","), "all", all.length, all.slice(0,5).map((p) => p.text).join("\n"), "estimate", ["circle-of-fifths","minor-scales","triplets-swing-syncopation"].map((id) => units.find((u) => u.id === id)?.lessons.map((l) => estimateLessonSeconds(l)).join(" ")).join(" | ")); expect(problems, formatProblems(problems)).toEqual([]);
  });
});
