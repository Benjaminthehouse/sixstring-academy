/**
 * The one tip a round ends with. A teacher watching would say a single thing, the thing that
 * helps most, so the rules below are ordered from "nothing worked" to "that was tight" and the
 * first one that applies wins.
 */
import type { InputSource } from './calibration';
import type { CountPart } from './counting';
import type { GroupStats, RoundStats } from './scoring';

/** What the learner can do about a tip, offered as a button. */
export type TipAction = 'slower' | 'faster' | 'calibrate' | 'headphones' | 'counts' | null;

/** A tip: a headline, one or two sentences of how, and an optional action. */
export interface Tip {
  id: string;
  title: string;
  detail: string;
  action: TipAction;
}

/** What the tip may take into account besides the numbers. */
export interface TipContext {
  source: InputSource;
  /** The source in use has been calibrated on this device. */
  calibrated: boolean;
  /** The round had silent bars (inner clock). */
  innerClock?: boolean;
  /** The tempo can still go down / up. */
  canSlow?: boolean;
  canSpeedUp?: boolean;
  /** Counting syllables are hidden at the moment. */
  countsHidden?: boolean;
}

const PART_WORD: Record<CountPart, string> = { beat: 'the beat', and: 'the "&"', e: 'the "e"', a: 'the "a"', trip: 'the middle of the triplet', let: 'the end of the triplet', other: 'the in-between notes' };

const ms = (x: number) => Math.round(Math.abs(x));

function weakestPart(stats: RoundStats): { part: CountPart; g: GroupStats } | null {
  let worst: { part: CountPart; g: GroupStats } | null = null;
  for (const [part, g] of Object.entries(stats.byPart) as Array<[CountPart, GroupStats]>) {
    if (g.n < 3 || g.misses === 0) continue;
    if (!worst || g.misses / g.n > worst.g.misses / worst.g.n) worst = { part, g };
  }
  return worst;
}

/** Choose the single most useful thing to say about a round. */
export function pickTip(stats: RoundStats, ctx: TipContext): Tip {
  const tip = (id: string, title: string, detail: string, action: TipAction = null): Tip => ({ id, title, detail, action });
  const mic = ctx.source === 'mic';

  if (stats.hits === 0) {
    return mic
      ? tip('nothing-heard', 'The microphone heard nothing', 'Clap or strum closer to the device, and check that the microphone is allowed for this page. You can also switch to tapping.')
      : tip('no-taps', 'No taps arrived', 'Tap the big pad, or press Space, together with each note. The first click after the count-in is where you come in.');
  }

  const missShare = stats.miss / Math.max(1, stats.total);
  if (missShare > 0.4) {
    return tip(
      'too-fast',
      'Slow it down',
      `You caught ${stats.hits} of ${stats.total} notes. Take the tempo down and get it clean first: speed comes from accuracy, never the other way round.`,
      ctx.canSlow === false ? null : 'slower',
    );
  }

  if (stats.extra >= Math.max(3, stats.total * 0.25)) {
    return mic
      ? tip('extra-sounds', 'Extra sounds were heard', 'If the click comes out of a speaker, the microphone hears it as well. Headphones fix that; so does recalibrating at the volume you play at.', 'headphones')
      : tip('extra-taps', 'Too many taps', `${stats.extra} taps landed where nothing is written. Rests and long notes still take up time: count through them and keep the finger up.`, ctx.countsHidden ? 'counts' : null);
  }

  if (ctx.innerClock && stats.silent.hits >= 4) {
    if (stats.silent.meanMs < -28) return tip('clock-rush', 'You speed up when the click drops out', `Without the click you ran about ${ms(stats.silent.meanMs)} ms ahead. Keep counting out loud through the silence, at the same volume as before.`);
    if (stats.silent.meanMs > 28) return tip('clock-drag', 'You slow down when the click drops out', `Without the click you fell about ${ms(stats.silent.meanMs)} ms behind. Tap your foot through the silence so the pulse has somewhere to live.`);
    if (stats.silent.sdMs <= 40 && stats.silent.misses === 0) {
      return tip('clock-steady', 'Your inner clock held', 'The click came back and you were still there. Try a longer silence, or a slower tempo: slow is harder.', ctx.canSpeedUp === false ? null : 'faster');
    }
  }

  if (stats.hits >= 6) {
    const mean = stats.meanMs;
    if (!ctx.calibrated && Math.abs(mean) > 30 && stats.sdMs < 35) {
      return tip(
        'device-offset',
        `Steadily ${mean < 0 ? 'early' : 'late'} by about ${ms(mean)} ms`,
        'That is too regular to be you: it is the delay of this device. A ten-second calibration takes it out of the scoring.',
        'calibrate',
      );
    }
    const { onBeat, offBeat } = stats;
    if (offBeat.hits >= 4 && onBeat.hits >= 3) {
      if (offBeat.meanMs < -22 && offBeat.meanMs < onBeat.meanMs - 15) {
        return tip('rush-offbeats', 'You rush the off-beats', `The notes between the beats arrive about ${ms(offBeat.meanMs)} ms early. Say "1 and 2 and" out loud and let each "and" sit exactly halfway.`, ctx.countsHidden ? 'counts' : null);
      }
      if (offBeat.meanMs > 22 && offBeat.meanMs > onBeat.meanMs + 15) {
        return tip('drag-offbeats', 'Your off-beats drag', `The notes between the beats come about ${ms(offBeat.meanMs)} ms late. Keep the hand moving in a steady down-up so the "and" is already on its way.`, ctx.countsHidden ? 'counts' : null);
      }
    }
    if (mean < -28) return tip('ahead', 'You are ahead of the beat', `About ${ms(mean)} ms early on average. Rushing is the most common habit there is: breathe out and let the click come to you.`);
    if (mean > 28) return tip('behind', 'You are behind the beat', `About ${ms(mean)} ms late on average. Aim to land together with the click instead of answering it; tapping your foot helps the hand anticipate.`);
    if (stats.sdMs > 42) return tip('wobble', 'Your timing wobbles', 'Some taps are early and some are late. Tap your foot on every beat and make the hand follow the foot.');
    if (stats.driftMs < -32) return tip('speeding-up', 'You speed up as you go', 'The last notes came earlier than the first. Relax your shoulders halfway through and listen for the click again.');
    if (stats.driftMs > 32) return tip('slowing-down', 'You fall behind as you go', 'The last notes came later than the first. Keep counting to the very end of the line.');
  }

  if (missShare >= 0.15) {
    const weak = weakestPart(stats);
    if (weak && weak.part !== 'beat') {
      return tip('weak-part', `Most misses were on ${PART_WORD[weak.part]}`, 'Count every subdivision out loud at a slower tempo until that syllable has a place in your mouth. The hand follows the voice.', ctx.countsHidden ? 'counts' : ctx.canSlow === false ? null : 'slower');
    }
    return tip('some-misses', `${stats.miss} notes got away`, 'Read one beat ahead of where you are tapping, and if a bar goes wrong, catch the next beat one instead of chasing.', ctx.canSlow === false ? null : 'slower');
  }

  if (stats.wrongDirection >= 3) {
    return tip('direction', 'Watch the stroke direction', `${stats.wrongDirection} strokes went the wrong way. Downs live on the numbers, ups on the syllables between them; the hand never changes that.`);
  }

  if (stats.stars >= 3) return tip('locked-in', 'Locked in', 'That was tight. Nudge the tempo up, or move on to the next step.', ctx.canSpeedUp === false ? null : 'faster');
  if (stats.stars === 2) return tip('nearly', 'Nearly there', 'Solid timing. For the third star, listen for your tap and the click melting into one sound.');
  return tip('keep-pulse', 'Keep the pulse going', 'Count out loud while you play. It feels silly and it works: every teacher makes their students do it.', ctx.countsHidden ? 'counts' : null);
}
