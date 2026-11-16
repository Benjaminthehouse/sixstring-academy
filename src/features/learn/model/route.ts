/**
 * The addresses of the Theory Path: `#learn` (the map), `#learn--<unit>` (the map on that unit),
 * `#learn--<unit>--<lesson>` (a lesson), `#learn--<unit>--checkpoint` and `--practice`, and the
 * whole-path sessions `#learn--review` and `#learn--placement`.
 */

/** What the `#learn` route shows. */
export type LearnView =
  | { kind: 'map'; unitId: string | null }
  | { kind: 'lesson'; unitId: string; lessonId: string }
  | { kind: 'checkpoint'; unitId: string }
  | { kind: 'practice'; unitId: string }
  | { kind: 'review' }
  | { kind: 'placement' };

/** Words that follow `#learn` or a unit id instead of a lesson id. No unit or lesson may be called that. */
export const ROUTE_WORDS = ['review', 'placement', 'checkpoint', 'practice'] as const;

/** The view for the route params. */
export function parseLearnParams(params: readonly string[]): LearnView {
  const [first, second] = params;
  if (!first) return { kind: 'map', unitId: null };
  if (first === 'review') return { kind: 'review' };
  if (first === 'placement') return { kind: 'placement' };
  if (!second) return { kind: 'map', unitId: first };
  if (second === 'checkpoint') return { kind: 'checkpoint', unitId: first };
  if (second === 'practice') return { kind: 'practice', unitId: first };
  return { kind: 'lesson', unitId: first, lessonId: second };
}

/** The route params of a view (the inverse of {@link parseLearnParams}). */
export function learnParams(view: LearnView): string[] {
  switch (view.kind) {
    case 'map':
      return view.unitId ? [view.unitId] : [];
    case 'lesson':
      return [view.unitId, view.lessonId];
    case 'checkpoint':
      return [view.unitId, 'checkpoint'];
    case 'practice':
      return [view.unitId, 'practice'];
    case 'review':
      return ['review'];
    case 'placement':
      return ['placement'];
  }
}
