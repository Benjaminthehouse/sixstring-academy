/**
 * The outline is generated from the reviewed syllabus (`src/content/plan/theory-path.json`, with
 * the unit themes from the table in THEORY-PATH.md). This test rebuilds it and fails when the
 * file is stale. To regenerate after a syllabus change:
 *
 *   WRITE_OUTLINE=1 npx vitest run src/content/theory/outline.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import type { UnitTheme } from '@/lessons';
import { OUTLINE } from './outline';
import type { Outline, OutlineLesson, OutlineUnit, StageId } from './types';

interface PlanLesson { id: string; title: string; minutes: number; prerequisites: string[]; exercises: Array<{ type: string }>; generators: string[] }
interface PlanUnit { id: string; title: string; summary: string; whyItMatters: string; lessons: PlanLesson[] }
interface Plan { course: { id: string; title: string; stages: Array<{ id: StageId; title: string; units: PlanUnit[] }> } }

const PLAY_TYPES = new Set(['play-note', 'play-chord', 'play-phrase']);
const LISTEN_TYPES = new Set(['listen-choice', 'tap-rhythm']);
const PLAY_DRILLS = new Set(['play-note']);
const LISTEN_DRILLS = new Set(['rhythm-tap', 'rhythm-ear', 'higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear']);

const slug = (id: string): string => id.slice(id.indexOf('/') + 1);

/** The themes suggested in the syllabus table: `| 1 | \`sound-and-pitch\` | Sound and pitch | basics | 6 | ... |`. */
function themes(): Map<string, UnitTheme> {
  const md = readFileSync(new URL('../plan/THEORY-PATH.md', import.meta.url), 'utf8');
  const out = new Map<string, UnitTheme>();
  for (const m of md.matchAll(/^\| \d+ \| `([a-z0-9-]+)` \| [^|]+ \| ([a-z]+) \|/gm)) out.set(m[1], m[2] as UnitTheme);
  return out;
}

function build(): Outline {
  const plan = JSON.parse(readFileSync(new URL('../plan/theory-path.json', import.meta.url), 'utf8')) as Plan;
  const theme = themes();
  return {
    id: plan.course.id,
    title: plan.course.title,
    stages: plan.course.stages.map((s) => {
      const [title, ...rest] = s.title.split(': ');
      const subtitle = rest.join(': ');
      return {
        id: s.id,
        title,
        subtitle: subtitle.charAt(0).toUpperCase() + subtitle.slice(1),
        units: s.units.map((u): OutlineUnit => {
          const t = theme.get(u.id);
          if (!t) throw new Error(`No theme for unit ${u.id} in THEORY-PATH.md`);
          return {
            id: u.id,
            title: u.title,
            theme: t,
            summary: u.summary,
            why: u.whyItMatters,
            lessons: u.lessons.map((l): OutlineLesson => {
              const lesson: OutlineLesson = { id: slug(l.id), title: l.title, minutes: l.minutes, requires: l.prerequisites.map(slug) };
              if (l.exercises.some((e) => PLAY_TYPES.has(e.type)) || l.generators.some((g) => PLAY_DRILLS.has(g))) lesson.play = true;
              if (l.exercises.some((e) => LISTEN_TYPES.has(e.type)) || l.generators.some((g) => LISTEN_DRILLS.has(g))) lesson.listen = true;
              return lesson;
            }),
          };
        }),
      };
    }),
  };
}

const HEADER = `/**
 * GENERATED from src/content/plan/theory-path.json (and the unit themes in THEORY-PATH.md) by
 * outline.test.ts. Do not edit by hand; regenerate with
 *   WRITE_OUTLINE=1 npx vitest run src/content/theory/outline.test.ts
 *
 * Every stage, unit and lesson of the reviewed syllabus, small enough to draw the whole path at
 * once while the written units load.
 */
import type { Outline } from './types';

/** The Theory Path as the syllabus plans it. */
export const OUTLINE: Outline = `;

describe('theory outline', () => {
  it('matches the syllabus', () => {
    const expected = build();
    if (process.env.WRITE_OUTLINE) {
      writeFileSync(new URL('./outline.ts', import.meta.url), `${HEADER}${JSON.stringify(expected, null, 2)};\n`);
      return;
    }
    expect(OUTLINE).toEqual(expected);
  });

  it('has three stages, unique unit and lesson ids, and earlier prerequisites only', () => {
    expect(OUTLINE.stages.map((s) => s.id)).toEqual(['beginner', 'intermediate', 'expert']);
    const units = OUTLINE.stages.flatMap((s) => s.units);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    const seen = new Set<string>();
    for (const u of units) {
      for (const l of u.lessons) {
        expect(seen.has(l.id), `${l.id} is unique`).toBe(false);
        for (const r of l.requires) expect(seen.has(r), `${l.id} requires ${r}, which must come earlier`).toBe(true);
        seen.add(l.id);
      }
    }
  });
});
