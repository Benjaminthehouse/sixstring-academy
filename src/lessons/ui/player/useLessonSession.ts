/**
 * Runs one session for a screen: starts it from the learner's progress (or picks up the
 * unfinished one saved for this lesson), dispatches actions through the pure reducer, carries
 * out its effects through the progress store, saves after every step, and pauses the clock while
 * the page is hidden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { heartsOf } from '@/core/progress';
import { applyEffects, progressPort, type EffectResults, type ProgressPort } from '../../effects';
import { clearSession, loadSession, saveSession, type SessionMatch } from '../../persist';
import { reduceSession, type SessionAction, type SessionSource, type SessionState, type SessionStep } from '../../session';
import { startSession } from '../../start';

/** Options of {@link useLessonSession}. */
export interface LessonSessionOptions {
  source: SessionSource;
  /** Where effects go. Default: the app's progress store. */
  port?: ProgressPort;
  /** Save the unfinished session after every step and offer it again later. Default true. */
  persist?: boolean;
  /** Pick up a saved unfinished session of the same lesson. Default true. */
  resume?: boolean;
  /** False when the microphone is known to be unavailable. */
  mic?: boolean;
  route?: string;
  params?: string[];
}

/** An action without its time stamp (the hook stamps it with now). */
export type ActionInput = SessionAction extends infer A ? (A extends SessionAction ? Omit<A, 'at'> & { at?: number } : never) : never;

/** What a session screen works with. */
export interface LessonSession {
  state: SessionState;
  /** The store's answer to the effects that recorded the activity (null until the session ends). */
  results: EffectResults | null;
  dispatch: (action: ActionInput) => SessionStep;
  /** Start afresh (the same source, or another one such as a practice drill). */
  restart: (source?: SessionSource) => void;
  /** True when this session was picked up from a save. */
  resumed: boolean;
  /** The source now running. */
  source: SessionSource;
  /** Where the effects go (read progress from it, too). */
  port: ProgressPort;
}

/** The saved-session slot a source matches. */
export function matchOf(source: SessionSource): SessionMatch {
  if (source.mode === 'review') return { mode: 'review' };
  if (source.mode === 'lesson') return { mode: 'lesson', courseId: source.course.id, lessonId: source.lessonId };
  return { mode: source.mode, courseId: source.course.id, unitId: source.unitId };
}

function begin(source: SessionSource, opts: LessonSessionOptions, port: ProgressPort, allowResume: boolean): { state: SessionState; resumed: boolean } {
  const now = Date.now();
  if (allowResume && opts.persist !== false && opts.resume !== false) {
    const saved = loadSession(matchOf(source), { now });
    if (saved) return { state: saved, resumed: true };
  }
  const extras: { mic?: boolean; route?: string; params?: string[] } = {};
  if (opts.mic !== undefined) extras.mic = opts.mic;
  if (opts.route !== undefined) extras.route = opts.route;
  if (opts.params !== undefined) extras.params = opts.params;
  return { state: startSession(source, port.getState(), now, extras), resumed: false };
}

function heartsNow(port: ProgressPort): number | null {
  const h = heartsOf(port.getState(), Date.now());
  return h.unlimited ? null : h.count;
}

/** Run a session. */
export function useLessonSession(opts: LessonSessionOptions): LessonSession {
  const portRef = useRef<ProgressPort>(opts.port ?? progressPort());
  const [source, setSource] = useState<SessionSource>(opts.source);
  const [initial] = useState(() => begin(opts.source, opts, portRef.current, true));
  const [state, setState] = useState<SessionState>(initial.state);
  const [resumed, setResumed] = useState(initial.resumed);
  const [results, setResults] = useState<EffectResults | null>(null);
  const stateRef = useRef(state);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const dispatch = useCallback((action: ActionInput): SessionStep => {
    const full = { ...action, at: action.at ?? Date.now() } as SessionAction;
    const step = reduceSession(stateRef.current, full);
    if (step.state === stateRef.current && step.effects.length === 0) return step;
    stateRef.current = step.state;
    const r = applyEffects(step.effects, portRef.current);
    if (r.activity) setResults(r);
    if (optsRef.current.persist !== false) saveSession(step.state);
    setState(step.state);
    return step;
  }, []);

  const restart = useCallback((next?: SessionSource) => {
    const src = next ?? source;
    if (optsRef.current.persist !== false) clearSession(matchOf(src).mode);
    const fresh = begin(src, optsRef.current, portRef.current, false);
    stateRef.current = fresh.state;
    setSource(src);
    setState(fresh.state);
    setResults(null);
    setResumed(false);
  }, [source]);

  // A picked-up session resumes with the hearts the learner has now; time away is not counted.
  useEffect(() => {
    if (initial.resumed) dispatch({ type: 'resume', hearts: heartsNow(portRef.current) });
  }, [initial.resumed, dispatch]);

  // The clock stops while the page is hidden (phone locked, another tab) and starts again on return.
  useEffect(() => {
    const onVisibility = () => {
      if (stateRef.current.phase === 'done') return;
      if (document.visibilityState === 'hidden') dispatch({ type: 'pause' });
      else dispatch({ type: 'resume', hearts: heartsNow(portRef.current) });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [dispatch]);

  return { state, results, dispatch, restart, resumed, source, port: portRef.current };
}
