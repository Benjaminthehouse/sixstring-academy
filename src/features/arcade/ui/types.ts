import type { ScalePattern, Tuning } from '@/core/guitar';
import type { ScaleType } from '@/core/theory';
import type { Focus } from '../core/focus';
import type { GameId } from '../core/games';
import type { Stars } from '../core/scoring';
import type { ArcadeMic } from './useArcadeMic';
import type { Fx } from './fx';

/** Everything a round is built from. */
export interface RoundContext {
  game: GameId;
  focus: Focus;
  pattern: ScalePattern;
  scale: ScaleType;
  tuning: Tuning;
  level: number;
  seed: number;
  /** Fewer prompts than the level's own count (the daily challenge). */
  size?: number;
  /** "A minor pentatonic". */
  scaleName: string;
}

/** What a finished round reports. */
export interface RoundResult {
  score: number;
  accuracy: number;
  stars: Stars;
  bestCombo: number;
  mistakes: number;
  /** Notes found, darts thrown, questions answered … */
  count: number;
  durationSec: number;
  perfect: boolean;
  /** Game-specific figures for the summary: "Fastest find · 0.8 s". */
  stats: Array<{ label: string; value: string }>;
  /** One line of advice. */
  tip: string;
  /** One mark per prompt for the summary's row of dots. */
  marks: Array<'ok' | 'meh' | 'bad'>;
  /** The per-prompt verdicts as words (`first:fast retry:good …`), for browser checks. */
  detail?: string;
}

/** Props every game component takes. */
export interface GameProps {
  ctx: RoundContext;
  input: 'tap' | 'mic';
  mic: ArcadeMic;
  anyOctave: boolean;
  /** False during the countdown: draw the board, take no input, keep the clock still. */
  running: boolean;
  fx: Fx;
  title: string;
  onFinish: (result: RoundResult) => void;
  onEnd: () => void;
}
