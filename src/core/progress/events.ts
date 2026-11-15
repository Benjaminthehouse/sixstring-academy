/**
 * Progress events: what the shell listens to for toasts and celebrations. The reducer returns the
 * events of a transaction; the store emits them after the new state is committed.
 */
import type { AchievementTier, DayKey, MasteryLevel, MergeStrategy, SkillTag } from './types';

/** Everything that can happen, as a discriminated union on `type`. `at` is the transaction time. */
export type ProgressEvent =
  | { type: 'xp-gained'; at: number; amount: number; base: number; multiplier: number; source: string; tag: SkillTag; total: number }
  | { type: 'level-up'; at: number; from: number; to: number; title: string; gems: number }
  | { type: 'goal-met'; at: number; day: DayKey; xp: number; goal: number }
  | { type: 'streak-extended'; at: number; day: DayKey; current: number; longest: number }
  | { type: 'streak-milestone'; at: number; days: number; gems: number }
  | { type: 'streak-broken'; at: number; previous: number }
  | { type: 'streak-freeze-used'; at: number; day: DayKey; remaining: number }
  | { type: 'heart-lost'; at: number; remaining: number; empty: boolean }
  | { type: 'hearts-refilled'; at: number; count: number; via: 'practice' | 'gems' | 'gift' }
  | { type: 'gems-changed'; at: number; delta: number; balance: number; reason: string }
  | { type: 'achievement-unlocked'; at: number; id: string; name: string; tier: AchievementTier; icon: string; gems: number }
  | { type: 'quest-completed'; at: number; id: string; scope: 'daily' | 'weekly'; title: string; gems: number }
  | { type: 'quests-all-completed'; at: number; day: DayKey; gems: number }
  | { type: 'skill-levelled-up'; at: number; id: string; from: MasteryLevel; to: MasteryLevel; title: string }
  | { type: 'xp-boost-started'; at: number; multiplier: number; until: number; source: string }
  | { type: 'cosmetic-unlocked'; at: number; id: string }
  | { type: 'data-imported'; at: number; strategy: MergeStrategy }
  | { type: 'data-reset'; at: number }
  | { type: 'save-failed'; at: number };

/** Every event type name. */
export type ProgressEventType = ProgressEvent['type'];

/** The event object for one type name. */
export type ProgressEventOf<T extends ProgressEventType> = Extract<ProgressEvent, { type: T }>;

/** An event before the reducer stamps it with the transaction time. */
export type ProgressEventInput = ProgressEvent extends infer E ? (E extends ProgressEvent ? Omit<E, 'at'> : never) : never;

type Handler<T extends ProgressEventType> = (event: ProgressEventOf<T>) => void;
type AnyHandler = (event: ProgressEvent) => void;

/** How long an event nobody was listening for is kept for a late listener. */
export const EVENT_HOLD_MS = 60_000;
const HOLD_LIMIT = 100;

/**
 * A small typed event emitter. A throwing handler never stops the others.
 *
 * Events that nobody is listening for are held briefly and handed to the first listener that
 * subscribes for them. That is what lets the shell hear about things that happen while the app is
 * still starting (the streak check on opening the app runs before any component has mounted).
 */
export class ProgressEmitter {
  private readonly byType = new Map<ProgressEventType, Set<AnyHandler>>();
  private readonly any = new Set<AnyHandler>();
  private held: ProgressEvent[] = [];

  /** `now` dates held events; it defaults to the real clock. */
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Listen for one event type. Returns the function that stops listening. */
  on<T extends ProgressEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.byType.get(type);
    if (!set) this.byType.set(type, (set = new Set()));
    const wrapped = handler as unknown as AnyHandler;
    set.add(wrapped);
    this.replay(wrapped, type);
    return () => {
      set.delete(wrapped);
    };
  }

  /** Listen for every event. Returns the function that stops listening. */
  onAny(handler: AnyHandler): () => void {
    this.any.add(handler);
    this.replay(handler, null);
    return () => {
      this.any.delete(handler);
    };
  }

  /** Deliver events in order. */
  emit(events: readonly ProgressEvent[]): void {
    for (const event of events) {
      const typed = this.byType.get(event.type);
      const handlers = [...(typed ?? []), ...this.any];
      if (handlers.length === 0) {
        this.held.push(event);
        if (this.held.length > HOLD_LIMIT) this.held.shift();
        continue;
      }
      for (const handler of handlers) call(handler, event);
    }
  }

  /** Drop every listener and every held event. */
  clear(): void {
    this.byType.clear();
    this.any.clear();
    this.held = [];
  }

  /** Hand recent unheard events (of one type, or all) to a new listener. */
  private replay(handler: AnyHandler, type: ProgressEventType | null): void {
    if (this.held.length === 0) return;
    const oldest = this.now() - EVENT_HOLD_MS;
    const mine: ProgressEvent[] = [];
    const rest: ProgressEvent[] = [];
    for (const event of this.held) {
      if (event.at < oldest) continue;
      if (type === null || event.type === type) mine.push(event);
      else rest.push(event);
    }
    this.held = rest;
    for (const event of mine) call(handler, event);
  }
}

function call(handler: AnyHandler, event: ProgressEvent): void {
  try {
    handler(event);
  } catch {
    // A broken listener (a toast that fails to render) must not break progress tracking.
  }
}
