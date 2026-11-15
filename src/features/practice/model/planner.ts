/**
 * "What should I practise?" Given how long the learner has, their level and what the progress
 * store knows (rusty and weak skills, what they neglected this week, pinned focus goals, review
 * cards due), build a balanced routine of blocks whose minutes add up exactly to the time chosen.
 *
 * Priorities, in order: pinned goals, then the most faded skill (keeping what was learned comes
 * before new material), then a song from 15 minutes up, then areas drawn by weight (level, rust,
 * weak spots, neglect this week, due reviews, a little less of yesterday's areas).
 *
 * Pure and deterministic: the same input gives the same plan, so reopening the screen never
 * reshuffles it, while the day (and the learner's "new mix" seed) varies it. The weights are
 * aligned with Today's plan (`features/home/plan.ts`): beginners lean on chords, rhythm and
 * songs, intermediates on scales and songs, experts on technique, ear and repertoire.
 */
import { teacherById } from '@/app/teachers';
import { dayNumber, type DayKey, type ExperienceLevel, type TeacherId } from '@/core/progress';
import { AREA_INFO, FOCUS_AREAS, target, type Area, type BlockTarget } from './areas';
import { CONTENT_BY_ID, poolFor, targetOf, type ContentItem } from './content';
import { hashString, makeId, seededRandom, weightedIndex } from './random';

/** Why a block is in the plan. */
export type ReasonKind = 'goal' | 'rusty' | 'weak' | 'due' | 'neglect' | 'continue' | 'level' | 'free';

/** One block of a routine. */
export interface PlanBlock {
  /** Unique within its plan. */
  id: string;
  area: Area;
  /** Whole minutes, at least 1. */
  minutes: number;
  title: string;
  /** How to do it and what good feels like. */
  goal: string;
  steps?: string[];
  /** One line of why ("Your A minor pentatonic, box 2 is getting rusty"). */
  reason?: string;
  reasonKind?: ReasonKind;
  /** The screen that serves the block, or null when the block needs none. */
  target: BlockTarget | null;
  /** An optional second screen (the tuner, the metronome). */
  extra?: BlockTarget;
  /** Content item it came from. */
  itemId?: string;
  /** Skill it refreshes. */
  skillId?: string;
  /** Focus goal it serves. */
  goalId?: string;
}

/** A skill worth practising, as the planner sees it. */
export interface SkillSignal {
  id: string;
  area: Area;
  /** Plain name ("A minor pentatonic, box 2"). */
  name: string;
  /** 0 to 1; halves with time since practice. */
  strength: number;
  /** Learned but fading below half strength. */
  rusty: boolean;
  /** Attempted several times with low accuracy. */
  weak: boolean;
  /** Last measured accuracy, 0 to 1. */
  accuracy?: number;
  /** A deep link to it, when one is known (from "continue where you left off"). */
  target?: BlockTarget;
}

/** A pinned focus goal, as the planner sees it. */
export interface GoalSignal {
  id: string;
  title: string;
  area: Area;
  /** Days until its target date (negative when past), or null without a date. */
  daysLeft: number | null;
}

/** Everything a plan is built from. */
export interface PlannerInput {
  level: ExperienceLevel;
  teacher: TeacherId;
  /** Minutes the learner has. */
  minutes: number;
  /** Local day the plan is for (varies the plan from day to day). */
  day: DayKey;
  /** "New mix": a different seed gives a different plan for the same day. */
  seed?: number;
  skills?: readonly SkillSignal[];
  /** Minutes practised per area this week. */
  weekMinutes?: Partial<Record<Area, number>>;
  /** Pinned goals, most urgent first. */
  goals?: readonly GoalSignal[];
  /** Review cards due now. */
  dueReviews?: number;
  /** A song left part-way through. */
  openSong?: { title: string; target: BlockTarget } | null;
  /** Areas of the last session, played a little less today for variety. */
  lastAreas?: readonly Area[];
  /** Days the learner has practised on so far; a beginner's harder exercises wait for these. Unknown: nothing is held back. */
  practiceDays?: number;
}

/** The skeleton of a plan for a number of minutes. */
export interface PlanShape {
  warmup: number;
  free: number;
  /** Number of focus blocks between them. */
  focus: number;
  /** Fewest minutes a focus block gets. */
  minFocus: number;
}

/** The six durations the learner picks from. */
export const DURATIONS: readonly number[] = [5, 10, 15, 30, 45, 60];

/** Shortest and longest plan the planner builds. */
export const MIN_PLAN_MINUTES = 2;
export const MAX_PLAN_MINUTES = 180;

/** Longest single block, in minutes. */
export const MAX_BLOCK_MINUTES = 60;

/** How the time of a plan is laid out: warm-up first, free play last from 30 minutes, the rest in focus blocks. */
export function planShape(minutes: number): PlanShape {
  const m = Math.max(MIN_PLAN_MINUTES, Math.round(minutes));
  const warmup = m <= 9 ? 1 : m <= 20 ? 2 : m <= 35 ? 3 : 5;
  const free = m >= 30 ? Math.round(m * 0.11) : 0;
  const focus = m <= 7 ? 1 : m <= 12 ? 2 : m <= 22 ? 3 : m <= 37 ? 4 : m <= 52 ? 5 : 6;
  return { warmup, free, focus, minFocus: m <= 12 ? 2 : 3 };
}

/** How much each level leans on each area (before rust, neglect and goals adjust it). */
export const AREA_WEIGHTS: Readonly<Record<ExperienceLevel, Readonly<Record<Area, number>>>> = {
  beginner: { warmup: 0, technique: 1.6, scales: 0.9, chords: 3, rhythm: 2.2, theory: 1.6, ear: 1, repertoire: 2.2, free: 0 },
  intermediate: { warmup: 0, technique: 1.8, scales: 2.4, chords: 1.8, rhythm: 1.4, theory: 1.4, ear: 1.6, repertoire: 2, free: 0 },
  expert: { warmup: 0, technique: 2.3, scales: 1.8, chords: 1.6, rhythm: 1.3, theory: 1.9, ear: 2, repertoire: 2.2, free: 0 },
};

/** The line under a block when nothing more specific applies, per level. */
const LEVEL_REASONS: Readonly<Record<ExperienceLevel, Readonly<Partial<Record<Area, string>>>>> = {
  beginner: {
    technique: 'Clean notes now save you unlearning habits later.',
    scales: 'Scales teach your fingers where the notes live.',
    chords: 'Smooth changes are what make chords sound like songs.',
    rhythm: 'Steady strumming makes even two chords sound good.',
    theory: 'A little theory makes everything else make sense.',
    ear: 'Hearing it first makes playing it easier.',
    repertoire: 'Playing real music is the point of it all.',
  },
  intermediate: {
    technique: 'Clean technique is what lets you play faster later.',
    scales: 'Scales across the neck are your map for soloing.',
    chords: 'More shapes and smoother changes open up more songs.',
    rhythm: 'Great rhythm is what bandmates notice first.',
    theory: 'Theory turns shapes into ideas you can reuse.',
    ear: 'Your ear is what lets you play what you hear.',
    repertoire: 'Songs are where all the pieces come together.',
  },
  expert: {
    technique: 'Precision at tempo needs daily, deliberate reps.',
    scales: 'Fluency in every position frees you to think about music.',
    chords: 'Voicings and voice leading are where harmony gets interesting.',
    rhythm: 'Time feel is the difference between correct and compelling.',
    theory: 'Naming what you hear makes it yours to use.',
    ear: 'A sharp ear is the shortest path from idea to instrument.',
    repertoire: 'Repertoire is where technique turns into music.',
  },
};

const WARMUP_REASON = 'Warm hands play cleaner and avoid strain.';
const FREE_REASON = 'End on music you enjoy.';

/** How to work on a skill or goal of an area, when the block is about that skill rather than an exercise. */
const SKILL_GOALS: Readonly<Record<Area, string>> = {
  warmup: 'Easy and loose; nothing should strain.',
  technique: 'Slow and clean first. Add speed only once it feels easy.',
  scales: 'Slowly with the click until it flows, then once from memory without looking.',
  chords: 'Play it until every string rings, then use it in a change, slowly.',
  rhythm: 'With the click, slower than you think, until it feels automatic.',
  theory: 'Go over it once, then find it on your guitar.',
  ear: 'One short round to bring it back, then sing what you heard.',
  repertoire: 'Once slowly, fixing the tricky spots, then once through at tempo.',
  free: 'Play whatever you like.',
};

const GOAL_BLOCK_TEXT = 'Slow, deliberate work on just this. Stop while it still feels good and note what improved.';

// ---------------------------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------------------------

function weekTotal(week: Partial<Record<Area, number>>): number {
  let total = 0;
  for (const a of FOCUS_AREAS) total += Math.max(0, week[a] ?? 0);
  return total;
}

/** Below this many minutes in the week it is too early to call anything neglected. */
export const NEGLECT_MIN_WEEK_MINUTES = 10;

/**
 * How much more (above 1) or less (below 1) an area is due, from its share of this week's
 * practice against the share the level would give it.
 */
export function neglectFactor(area: Area, level: ExperienceLevel, week: Partial<Record<Area, number>>): number {
  const total = weekTotal(week);
  if (total < NEGLECT_MIN_WEEK_MINUTES) return 1;
  const weights = AREA_WEIGHTS[level];
  let sum = 0;
  for (const a of FOCUS_AREAS) sum += weights[a];
  const expected = weights[area] / sum;
  if (expected <= 0) return 1;
  const share = Math.max(0, week[area] ?? 0) / total;
  return Math.min(2.2, Math.max(0.4, 1 + (1.5 * (expected - share)) / expected));
}

function skillsIn(skills: readonly SkillSignal[], area: Area, kind: 'rusty' | 'weak'): SkillSignal[] {
  return skills.filter((s) => s.area === area && (kind === 'rusty' ? s.rusty : s.weak && !s.rusty));
}

/** The weight an area gets in today's draw. */
export function areaWeight(area: Area, input: PlannerInput): number {
  const skills = input.skills ?? [];
  let w = AREA_WEIGHTS[input.level][area];
  w *= neglectFactor(area, input.level, input.weekMinutes ?? {});
  w *= 1 + 0.6 * Math.min(2, skillsIn(skills, area, 'rusty').length);
  w *= 1 + 0.3 * Math.min(2, skillsIn(skills, area, 'weak').length);
  if (area === 'theory' && (input.dueReviews ?? 0) > 0) w *= 1.4;
  if (input.lastAreas?.includes(area)) w *= 0.7;
  return w;
}

// ---------------------------------------------------------------------------------------------
// Minutes
// ---------------------------------------------------------------------------------------------

/**
 * Split `total` whole minutes over slots in proportion to their weights, each getting at least
 * `min`. Largest remainders, so the parts always add up exactly to `total`.
 */
export function allocateMinutes(total: number, weights: readonly number[], min: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.max(0, Math.round(total));
  const floor = Math.max(0, Math.min(min, Math.floor(t / n)));
  const rest = t - floor * n;
  const positive = weights.map((w) => (Number.isFinite(w) ? Math.max(0, w) : 0));
  const sum = positive.reduce((s, w) => s + w, 0);
  const raw = positive.map((w) => (sum > 0 ? (rest * w) / sum : rest / n));
  const out = raw.map((r) => floor + Math.floor(r));
  let left = t - out.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) out[order[k].i]++;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filling blocks
// ---------------------------------------------------------------------------------------------

/** What is already in the plan, so nothing appears twice. */
interface Used {
  items: Set<string>;
  skills: Set<string>;
}

function emptyUsed(): Used {
  return { items: new Set(), skills: new Set() };
}

function usedOf(blocks: readonly PlanBlock[]): Used {
  const used = emptyUsed();
  for (const b of blocks) {
    if (b.itemId) used.items.add(b.itemId);
    if (b.skillId) used.skills.add(b.skillId);
  }
  return used;
}

function teacherItem(teacher: TeacherId): ContentItem {
  const t = teacherById(teacher);
  return {
    id: `teacher-lesson-${t.id}`,
    area: 'theory',
    levels: ['beginner', 'intermediate', 'expert'],
    title: `Take ${t.first}'s next lesson`,
    goal: `${t.course} Do the next lesson, then play its example once more on your own.`,
    target: target('teachers', `Open ${t.first}'s course`, [t.id]),
  };
}

/** The exercises of an area for this learner (the teacher's course joins the theory pool). */
function poolOf(area: Area, input: PlannerInput): ContentItem[] {
  const pool = poolFor(area, input.level, input.practiceDays);
  return area === 'theory' ? [...pool, teacherItem(input.teacher)] : pool;
}

function neglectReason(area: Area, input: PlannerInput): string | null {
  const week = input.weekMinutes ?? {};
  const total = weekTotal(week);
  if (total < NEGLECT_MIN_WEEK_MINUTES) return null;
  const minutes = Math.round(Math.max(0, week[area] ?? 0));
  const info = AREA_INFO[area];
  if (minutes === 0) return `No ${info.noun} yet this week.`;
  if (neglectFactor(area, input.level, week) >= 1.6) return `Only ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of ${info.noun} this week.`;
  return null;
}

function fromItem(item: ContentItem, minutes: number, reason: string | undefined, reasonKind: ReasonKind | undefined): PlanBlock {
  return {
    id: makeBlockId(item.area, item.id),
    area: item.area,
    minutes,
    title: item.title,
    goal: item.goal,
    steps: item.steps ? [...item.steps] : undefined,
    reason,
    reasonKind,
    target: targetOf(item),
    extra: item.extra,
    itemId: item.id,
    skillId: item.skillId,
  };
}

let blockCounter = 0;
/** A block id that is unique within a plan and readable in tests. */
function makeBlockId(area: Area, key: string): string {
  blockCounter = (blockCounter + 1) % 1_000_000;
  return `${area}-${key}-${blockCounter.toString(36)}`;
}

function skillBlock(skill: SkillSignal, minutes: number): PlanBlock {
  const pct = skill.accuracy !== undefined ? Math.round(skill.accuracy * 100) : null;
  return {
    id: makeBlockId(skill.area, skill.id),
    area: skill.area,
    minutes,
    title: `${skill.rusty ? 'Refresh' : 'Strengthen'}: ${skill.name}`,
    goal: SKILL_GOALS[skill.area],
    reason: skill.rusty ? `Your ${skill.name} is getting rusty.` : pct !== null ? `Your ${skill.name} is at ${pct}% accuracy: slow reps fix that.` : `Your ${skill.name} needs a few more careful reps.`,
    reasonKind: skill.rusty ? 'rusty' : 'weak',
    target: skill.target ?? AREA_INFO[skill.area].target,
    skillId: skill.id,
  };
}

function goalBlock(goal: GoalSignal, minutes: number): PlanBlock {
  const when =
    goal.daysLeft === null ? '' : goal.daysLeft < 0 ? ', past its target date' : goal.daysLeft === 0 ? ', due today' : goal.daysLeft === 1 ? ', due tomorrow' : `, due in ${goal.daysLeft} days`;
  return {
    id: makeBlockId(goal.area, goal.id),
    area: goal.area,
    minutes,
    title: goal.title,
    goal: GOAL_BLOCK_TEXT,
    reason: `Your focus goal${when}.`,
    reasonKind: 'goal',
    target: AREA_INFO[goal.area].target,
    goalId: goal.id,
  };
}

/** Pick an exercise of `area` that is not in the plan yet, varied by day. */
function pickItem(area: Area, input: PlannerInput, used: Used, random: () => number): ContentItem | null {
  const pool = poolOf(area, input).filter((c) => !used.items.has(c.id));
  if (pool.length === 0) return null;
  const day = dayNumber(input.day);
  // Rotate through the pool by day, with a seeded nudge so two areas do not rotate in lockstep.
  const offset = (day + hashString(area) + Math.floor(random() * pool.length)) % pool.length;
  return pool[offset];
}

/** The best block for an area right now: a rusty or weak skill first, then due reviews, an open song, an exercise. */
export function fillArea(area: Area, minutes: number, input: PlannerInput, used: Used, random: () => number): PlanBlock | null {
  const skills = input.skills ?? [];
  if (area === 'warmup' || area === 'free') {
    const item = pickItem(area, input, used, random);
    return item ? fromItem(item, minutes, area === 'warmup' ? WARMUP_REASON : FREE_REASON, area === 'warmup' ? 'level' : 'free') : null;
  }
  const rusty = skillsIn(skills, area, 'rusty')
    .filter((s) => !used.skills.has(s.id))
    .sort((a, b) => a.strength - b.strength)[0];
  if (rusty) return skillBlock(rusty, minutes);
  const weak = skillsIn(skills, area, 'weak')
    .filter((s) => !used.skills.has(s.id))
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))[0];
  if (weak) return skillBlock(weak, minutes);

  const due = input.dueReviews ?? 0;
  if (area === 'theory' && due > 0 && !used.items.has('review-cards')) {
    return {
      id: makeBlockId('theory', 'review'),
      area: 'theory',
      minutes,
      title: `Review ${due} ${due === 1 ? 'card' : 'cards'}`,
      goal: 'Answer each card honestly; the ones you miss come back sooner. That is how they stick.',
      reason: `${due} review ${due === 1 ? 'card is' : 'cards are'} due.`,
      reasonKind: 'due',
      target: target('learn', 'Open your reviews'),
      itemId: 'review-cards',
    };
  }
  if (area === 'repertoire' && input.openSong && !used.items.has('continue-song')) {
    return {
      id: makeBlockId('repertoire', 'continue'),
      area: 'repertoire',
      minutes,
      title: `Continue “${input.openSong.title}”`,
      goal: SKILL_GOALS.repertoire,
      reason: 'You left it part-way through.',
      reasonKind: 'continue',
      target: input.openSong.target,
      itemId: 'continue-song',
    };
  }
  const item = pickItem(area, input, used, random);
  if (!item) return null;
  const neglect = neglectReason(area, input);
  return fromItem(item, minutes, neglect ?? LEVEL_REASONS[input.level][area], neglect ? 'neglect' : 'level');
}

function remember(used: Used, block: PlanBlock): void {
  if (block.itemId) used.items.add(block.itemId);
  if (block.skillId) used.skills.add(block.skillId);
}

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------

interface Slot {
  area: Area;
  goal?: GoalSignal;
  weight: number;
}

function seedFor(input: PlannerInput, minutes: number): number {
  return hashString(`${input.day}|${minutes}|${input.level}|${input.seed ?? 0}`);
}

/**
 * Build a routine for `input.minutes` minutes: a warm-up, focus blocks (pinned goals first, then
 * areas drawn by weight, a song from 15 minutes up) and free play to finish from 30 minutes up.
 * The blocks' minutes add up exactly to the minutes asked for.
 */
export function buildPlan(input: PlannerInput): PlanBlock[] {
  const minutes = Math.min(MAX_PLAN_MINUTES, Math.max(MIN_PLAN_MINUTES, Math.round(Number.isFinite(input.minutes) ? input.minutes : 10)));
  const shape = planShape(minutes);
  const random = seededRandom(seedFor(input, minutes));
  const goals = input.goals ?? [];

  // 1. Which areas get a focus slot.
  const slots: Slot[] = [];
  const goalSlots = Math.min(goals.length, shape.focus >= 3 ? shape.focus - 1 : shape.focus);
  for (const goal of goals.slice(0, goalSlots)) slots.push({ area: goal.area, goal, weight: 1.5 });
  const taken = (a: Area) => slots.some((s) => s.area === a);
  // Keeping what has been learned comes before new material: the most faded skill gets a slot.
  const rustiest = (input.skills ?? []).filter((s) => s.rusty).sort((a, b) => a.strength - b.strength)[0];
  if (rustiest && slots.length < shape.focus && !taken(rustiest.area)) slots.push({ area: rustiest.area, weight: 1.2 });
  if (shape.focus >= 3 && !taken('repertoire') && slots.length < shape.focus) slots.push({ area: 'repertoire', weight: 1.15 });
  while (slots.length < shape.focus) {
    const options = FOCUS_AREAS.filter((a) => !taken(a));
    if (options.length === 0) break;
    const index = weightedIndex(
      options.map((a) => areaWeight(a, input)),
      random,
    );
    const area = options[Math.max(0, index)];
    const rusty = (input.skills ?? []).some((s) => s.area === area && s.rusty);
    slots.push({ area, weight: rusty ? 1.2 : area === 'repertoire' ? 1.15 : 1 });
  }

  // 2. Order: goals right after the warm-up while focus is freshest, then the usual session order.
  const goalPart = slots.filter((s) => s.goal);
  const rest = slots.filter((s) => !s.goal).sort((a, b) => FOCUS_AREAS.indexOf(a.area) - FOCUS_AREAS.indexOf(b.area));
  const ordered = [...goalPart, ...rest];

  // 3. Minutes. The warm-up and free play have fixed lengths; focus blocks share the rest.
  const focusMinutes = minutes - shape.warmup - shape.free;
  const split = allocateMinutes(
    focusMinutes,
    ordered.map((s) => s.weight),
    shape.minFocus,
  );

  // 4. Content.
  const used = emptyUsed();
  const blocks: PlanBlock[] = [];
  const add = (block: PlanBlock | null) => {
    if (!block) return;
    remember(used, block);
    blocks.push(block);
  };
  add(fillArea('warmup', shape.warmup, input, used, random));
  ordered.forEach((slot, i) => {
    if (split[i] <= 0) return;
    add(slot.goal ? goalBlock(slot.goal, split[i]) : fillArea(slot.area, split[i], input, used, random));
  });
  if (shape.free > 0) add(fillArea('free', shape.free, input, used, random));

  // A pool that ran dry (never in practice) must not lose minutes: give them to the last block.
  const sum = blocks.reduce((s, b) => s + b.minutes, 0);
  if (blocks.length > 0 && sum !== minutes) blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], minutes: blocks[blocks.length - 1].minutes + (minutes - sum) };
  return blocks;
}

/** The minutes of a list of blocks. */
export function totalMinutes(blocks: readonly PlanBlock[]): number {
  return blocks.reduce((s, b) => s + b.minutes, 0);
}

// ---------------------------------------------------------------------------------------------
// Swapping and editing
// ---------------------------------------------------------------------------------------------

/** What a block could be swapped for. */
export interface Alternatives {
  /** Other exercises of the same area. */
  sameArea: PlanBlock[];
  /** The best block of each other area. */
  otherAreas: PlanBlock[];
}

/**
 * Candidates to replace the block at `index` (or, with `index` = -1, to add to the plan), each
 * already sized to `minutes`. Nothing that is already in the plan is offered again.
 */
export function alternativesFor(blocks: readonly PlanBlock[], index: number, input: PlannerInput, minutes?: number): Alternatives {
  const current = blocks[index];
  const size = minutes ?? current?.minutes ?? 3;
  const others = blocks.filter((_, i) => i !== index);
  const random = seededRandom(seedFor(input, 997 + index));
  const sameArea: PlanBlock[] = [];
  if (current) {
    const used = usedOf(others);
    if (current.itemId) used.items.add(current.itemId);
    if (current.skillId) used.skills.add(current.skillId);
    for (let i = 0; i < 4; i++) {
      const b = fillArea(current.area, size, input, used, random);
      if (!b) break;
      remember(used, b);
      sameArea.push(b);
    }
  }
  const otherAreas: PlanBlock[] = [];
  const order: Area[] = ['warmup', ...FOCUS_AREAS, 'free'];
  for (const area of order) {
    if (current && area === current.area) continue;
    const used = usedOf(blocks);
    const b = fillArea(area, size, input, used, random);
    if (b) otherAreas.push(b);
  }
  return { sameArea, otherAreas };
}

/** Change one block's minutes (1 to `MAX_BLOCK_MINUTES`). */
export function setBlockMinutes(blocks: readonly PlanBlock[], id: string, minutes: number): PlanBlock[] {
  const m = Math.min(MAX_BLOCK_MINUTES, Math.max(1, Math.round(minutes)));
  return blocks.map((b) => (b.id === id ? { ...b, minutes: m } : b));
}

/** Move a block one place up (-1) or down (+1). */
export function moveBlock(blocks: readonly PlanBlock[], id: string, direction: -1 | 1): PlanBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= blocks.length) return [...blocks];
  const out = [...blocks];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Remove a block (a plan always keeps at least one). */
export function removeBlock(blocks: readonly PlanBlock[], id: string): PlanBlock[] {
  if (blocks.length <= 1) return [...blocks];
  return blocks.filter((b) => b.id !== id);
}

/** Put `replacement` where the block `id` was, keeping its minutes unless the replacement has its own. */
export function replaceBlock(blocks: readonly PlanBlock[], id: string, replacement: PlanBlock): PlanBlock[] {
  return blocks.map((b) => (b.id === id ? { ...replacement, id: makeId('b') } : b));
}

/** Add a block at the end, before free play if the plan ends with it. */
export function addBlock(blocks: readonly PlanBlock[], block: PlanBlock): PlanBlock[] {
  const fresh = { ...block, id: makeId('b') };
  const last = blocks[blocks.length - 1];
  if (last && last.area === 'free' && block.area !== 'free') return [...blocks.slice(0, -1), fresh, last];
  return [...blocks, fresh];
}

/** Rebuild a block from an authored item (used when a saved routine names an exercise). */
export function blockFromItem(itemId: string, minutes: number): PlanBlock | null {
  const item = CONTENT_BY_ID[itemId];
  return item ? fromItem(item, Math.max(1, Math.round(minutes)), undefined, undefined) : null;
}

/** Fill one area with the planner's best choice (used for "planner's choice" blocks of a routine). */
export function chooseForArea(area: Area, minutes: number, input: PlannerInput, taken: readonly PlanBlock[]): PlanBlock | null {
  return fillArea(area, Math.max(1, Math.round(minutes)), input, usedOf(taken), seededRandom(seedFor(input, 31 + taken.length)));
}
