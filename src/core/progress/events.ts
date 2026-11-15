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

/** A small typed event emitter. A throwing handler never stops the others. */
export class ProgressEmitter {
  private readonly byType = new Map<ProgressEventType, Set<AnyHandler>>();
  private readonly any = new Set<AnyHandler>();

  /** Listen for one event type. Returns the function that stops listening. */
  on<T extends ProgressEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.byType.get(type);
    if (!set) this.byType.set(type, (set = new Set()));
    const wrapped = handler as unknown as AnyHandler;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  /** Listen for every event. Returns the function that stops listening. */
  onAny(handler: AnyHandler): () => void {
    this.any.add(handler);
    return () => {
      this.any.delete(handler);
    };
  }

  /** Deliver events in order. */
  emit(events: readonly ProgressEvent[]): void {
    for (const event of events) {
      const typed = this.byType.get(event.type);
      for (const handler of [...(typed ?? []), ...this.any]) {
        try {
          handler(event);
        } catch {
          // A broken listener (a toast that fails to render) must not break progress tracking.
        }
      }
    }
  }

  /** Drop every listener. */
  clear(): void {
    this.byType.clear();
    this.any.clear();
  }
}
