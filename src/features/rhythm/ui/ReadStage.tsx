import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, useRafLoop } from '@/ui';
import type { Chart } from '../core/charts';
import { meterInfo } from '../core/meter';
import type { Rhythm } from '../core/rhythm';
import type { Judgement } from '../core/scoring';
import { unswing } from '../notation/layout';
import { RhythmStaff, type NoteMark, type RhythmStaffHandle } from '../notation/RhythmStaff';
import type { DisplayContext } from './RoundScreen';
import styles from './Rhythm.module.css';

/** The marks of one phrase, indexed by onset, from the round's judgements. */
export function phraseMarks(chart: Chart, phrase: number, marks: ReadonlyMap<number, Judgement>): Array<NoteMark | undefined> {
  const out: Array<NoteMark | undefined> = [];
  for (const t of chart.targets) {
    const seg = chart.segments[t.seg];
    if (seg.phrase !== phrase || seg.kind !== 'play') continue;
    const j = marks.get(t.id);
    out[t.ref] = j ? { verdict: j.verdict, errorMs: j.errorMs } : undefined;
  }
  return out;
}

/**
 * Height the notation may take while a round runs, so the whole round (cue, notation, feedback,
 * pad) fits on one screen without scrolling. The numbers are the fixed parts of the running
 * layout in `Rhythm.module.css`.
 */
function useStageHeight(active: boolean): number | undefined {
  const [size, setSize] = useState(() => (typeof window === 'undefined' ? { w: 1024, h: 768 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (!active) return undefined;
  const { w, h } = size;
  // A phone on its side: the pads stand beside the notation, so only the bars above and below count.
  if (w > h && h <= 520) return Math.max(96, h - 192);
  const pad = w >= 720 ? 120 : Math.min(200, Math.max(112, h * 0.25));
  return Math.max(110, h - 350 - pad);
}

/** Props of {@link ReadStage}. */
export interface ReadStageProps {
  ctx: DisplayContext;
  phrases: readonly Rhythm[];
}

/**
 * Read and tap: the phrase being played, in notation, with the count underneath, each note marked
 * as it is tapped and a playhead that crosses every note at the moment it sounds.
 */
export function ReadStage({ ctx, phrases }: ReadStageProps) {
  const { round, prefs, reduced, preview } = ctx;
  const staff = useRef<RhythmStaffHandle | null>(null);
  const phrase = preview ? 0 : Math.min(phrases.length - 1, round.segment?.phrase ?? 0);
  const rhythm = phrases[phrase];
  const marks = useMemo(() => (preview ? undefined : phraseMarks(round.chart, phrase, round.marks)), [preview, round.chart, round.marks, phrase]);
  const meter = meterInfo(rhythm.meter);
  const maxHeight = useStageHeight(!preview);

  useRafLoop(() => {
    const s = round.session;
    const handle = staff.current;
    if (!s || !handle) return;
    const tick = s.tickNow();
    const seg = s.segmentAt(tick);
    if (!seg || seg.kind === 'count' || seg.phrase !== phrase) return handle.setPlayhead(null);
    let within = tick - seg.startTick;
    if (rhythm.swing) within = unswing(within);
    // With reduced motion the playhead steps from beat to beat instead of gliding.
    if (reduced) {
      const bar = Math.floor(within / meter.barTicks);
      const inBar = within - bar * meter.barTicks;
      let beatStart = 0;
      for (const start of meter.beatStarts) if (inBar >= start) beatStart = start;
      within = bar * meter.barTicks + beatStart;
    }
    handle.setPlayhead(within);
  }, round.phase === 'running');

  return (
    <div className={styles.readStage}>
      <div className={styles.readMeta}>
        <Text variant="eyebrow">{preview ? `First of ${phrases.length} rhythms` : `Rhythm ${phrase + 1} of ${phrases.length}`}</Text>
        {rhythm.swing && (
          <Text size="sm" tone="muted">
            Swing: play the eighths long-short
          </Text>
        )}
      </div>
      <RhythmStaff ref={staff} rhythm={rhythm} marks={marks} counts={prefs.counts} reserveMarks maxHeight={maxHeight} />
      <div className={styles.pips} aria-hidden="true">
        {phrases.map((_, i) => (
          <span key={i} className={styles.pip} data-state={preview ? 'todo' : i < phrase ? 'done' : i === phrase ? 'now' : 'todo'} />
        ))}
      </div>
    </div>
  );
}

/** The summary's review: every phrase of the round with its marks. */
export function ReadReview({ chart, phrases, marks, counts }: { chart: Chart; phrases: readonly Rhythm[]; marks: ReadonlyMap<number, Judgement>; counts: boolean }) {
  return (
    <section className={styles.review} aria-label="What you played">
      <Text variant="eyebrow">What you played</Text>
      {phrases.map((rhythm, p) => (
        <div key={p} className={styles.reviewItem}>
          <RhythmStaff rhythm={rhythm} marks={phraseMarks(chart, p, marks)} counts={counts} maxScale={10} />
        </div>
      ))}
    </section>
  );
}
