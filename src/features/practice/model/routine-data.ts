/**
 * The saved shape of a routine and how to read it back, without the exercise pool or the planner.
 * The practice store (and so the session bar on every screen) loads this file; turning a routine
 * into a plan (`routines.ts`) is the practice screen's business. An exercise id is only checked
 * for its form here: one that no longer exists is treated as "planner's choice" when the routine
 * runs (`planFromRoutine`).
 */
import type { ExperienceLevel } from '@/core/progress';
import { isArea, type Area } from './areas';

/** One block of a routine. */
export interface RoutineBlock {
  area: Area;
  minutes: number;
  /** An authored exercise (`content.ts`) or one from the app's content (`library.ts`). */
  itemId?: string;
  /** The learner's own wording (when there is no item). */
  title?: string;
  goal?: string;
}

/** A saved routine. */
export interface Routine {
  id: string;
  name: string;
  /** One line about what it is for. */
  description: string;
  /** Who it suits; `any` for everyone. */
  level: ExperienceLevel | 'any';
  blocks: RoutineBlock[];
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Saved routines at most. */
export const MAX_ROUTINES = 30;
/** Longest routine name. */
export const MAX_ROUTINE_NAME = 60;

/** An exercise id as the pools write them: `change-g-c`, `technique:tech-spider`, `song:greensleeves-melody`. */
const ITEM_ID = /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/;

/** True for something shaped like an exercise id (whether that exercise still exists is checked when it runs). */
export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && ITEM_ID.test(value);
}

/** A routine name with its spaces tidied, at most `MAX_ROUTINE_NAME` characters. */
export function cleanRoutineName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_ROUTINE_NAME);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseBlock(v: unknown): RoutineBlock | null {
  if (!isObj(v) || !isArea(v.area) || typeof v.minutes !== 'number' || !Number.isFinite(v.minutes)) return null;
  const minutes = Math.min(60, Math.max(1, Math.round(v.minutes)));
  const block: RoutineBlock = { area: v.area, minutes };
  if (isItemId(v.itemId)) block.itemId = v.itemId;
  else if (typeof v.title === 'string' && v.title.trim()) {
    block.title = v.title.trim().slice(0, 120);
    if (typeof v.goal === 'string') block.goal = v.goal.slice(0, 400);
  }
  return block;
}

/** A user routine from saved data, or null when it is malformed. */
export function parseRoutine(v: unknown): Routine | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.blocks)) return null;
  const blocks = v.blocks.map(parseBlock).filter((b): b is RoutineBlock => b !== null);
  if (blocks.length === 0) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    id: v.id,
    name: cleanRoutineName(v.name) || 'My routine',
    description: typeof v.description === 'string' ? v.description.slice(0, 200) : '',
    level: v.level === 'beginner' || v.level === 'intermediate' || v.level === 'expert' ? v.level : 'any',
    blocks,
    builtIn: false,
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
  };
}
