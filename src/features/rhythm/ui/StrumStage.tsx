import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unlockAudio } from '@/core/audio';
import { getProgress } from '@/core/progress';
import { PlayButton, Text, useRafLoop } from '@/ui';
import { strumChart, type Chart } from '../core/charts';
import { meterInfo, secondsPerTick } from '../core/meter';
import type { Judgement } from '../core/scoring';
import { patternNickname, slotTicks, type StrumPattern } from '../core/strum';
import { rhythmDebug } from '../engine/debug';
import { RhythmSession } from '../engine/session';
import { playChartSound, prepareSounds, soundSettings, strumChord } from '../engine/sounds';
import type { DisplayContext } from './RoundScreen';
import { StrumGrid, type SlotMark, type StrumGridHandle } from './StrumGrid';
import styles from './Rhythm.module.css';

/** The slot of a pattern that sounds at a tick counted from the start of a bar (swing undone). */
export function slotAtTick(pattern: Pick<StrumPattern, 'meter' | 'grid'>, tickInBar: number): number {
  const step = slotTicks(pattern.grid);
  if (pattern.grid === 'swing') {
    const beat = Math.floor(tickInBar / 960);
    return beat * 2 + (tickInBar - beat * 960 >= 640 ? 1 : 0);
  }
  return Math.floor(tickInBar / step);
}

/** Listening to a pattern: loops it on the synthesised guitar until stopped. */
export function useListen(pattern: StrumPattern, bpm: number, chord: string): { playing: boolean; loading: boolean; session: RhythmSession | null; toggle: () => void; stop: () => void } {
  const [session, setSession] = useState<RhythmSession | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<RhythmSession | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    ref.current?.dispose();
    ref.current = null;
    setSession(null);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ref.current?.dispose();
      ref.current = null;
    };
  }, []);

  // A different pattern, tempo or chord: what is playing is no longer what is shown.
  useEffect(() => stop, [pattern, bpm, chord, stop]);

  const toggle = useCallback(() => {
    if (ref.current) return stop();
    setLoading(true);
    const unlocked = unlockAudio();
    const chart = strumChart(pattern, { bpm, bars: 1, mode: 'listen', guitar: true });
    const spt = secondsPerTick(bpm, meterInfo(pattern.meter));
    const settings = soundSettings(getProgress().prefs.sound, { chord: strumChord(chord), staccato: !!pattern.staccato, slotSeconds: spt * slotTicks(pattern.grid), secondsPerTick: spt });
    void (async () => {
      await unlocked;
      await prepareSounds(settings, chart.sounds);
      if (!alive.current) return;
      setLoading(false);
      const live = new RhythmSession({ chart, play: (sound, time) => playChartSound(sound, time, settings) });
      ref.current = live;
      rhythmDebug.session = live;
      rhythmDebug.started++;
      live.start();
      setSession(live);
    })();
  }, [pattern, bpm, chord, stop]);

  return { playing: !!session, loading, session, toggle, stop };
}

/** The latest judgement of each slot, from a strumming round's marks. */
export function slotMarks(chart: Chart, marks: ReadonlyMap<number, Judgement>, slots: number): Array<SlotMark | undefined> {
  const out: Array<SlotMark | undefined> = Array<SlotMark | undefined>(slots).fill(undefined);
  for (const t of chart.targets) {
    const j = marks.get(t.id);
    if (j) out[t.ref] = { verdict: j.verdict, errorMs: j.errorMs };
  }
  return out;
}

/** Props of {@link StrumStage}. */
export interface StrumStageProps {
  ctx: DisplayContext;
  pattern: StrumPattern;
  bpm: number;
  chord: string;
}

/**
 * A strumming pattern on stage: the arrows over the count, lit slot by slot as they sound. Before
 * a round it can be listened to on a loop; during a round every stroke is marked as it is played.
 */
export function StrumStage({ ctx, pattern, bpm, chord }: StrumStageProps) {
  const { round, prefs, preview } = ctx;
  const grid = useRef<StrumGridHandle | null>(null);
  const listen = useListen(pattern, bpm, chord);
  const meter = meterInfo(pattern.meter);
  const marks = useMemo(() => (preview ? undefined : slotMarks(round.chart, round.marks, pattern.slots.length)), [preview, round.chart, round.marks, pattern.slots.length]);

  // Starting a round ends the listening loop.
  const stopListening = listen.stop;
  useEffect(() => {
    if (!preview) stopListening();
  }, [preview, stopListening]);

  const live = preview ? listen.session : round.session;
  useRafLoop(() => {
    const handle = grid.current;
    if (!handle) return;
    if (!live || live.state !== 'running') return handle.setActive(null);
    const tick = live.tickNow();
    const seg = live.segmentAt(tick);
    if (!seg || seg.kind !== 'play') return handle.setActive(null);
    handle.setActive(slotAtTick(pattern, (tick - seg.startTick) % meter.barTicks));
  }, !!live);
  useEffect(() => {
    if (!live) grid.current?.setActive(null);
  }, [live]);

  return (
    <div className={styles.strumStage}>
      <div className={styles.strumHead}>
        <div>
          <Text variant="eyebrow">
            {pattern.meter} · {pattern.grid === 'sixteenth' ? 'sixteenth grid' : pattern.grid === 'swing' ? 'swung eighths' : 'eighth grid'}
          </Text>
          <p className={styles.nickname}>{patternNickname(pattern)}</p>
        </div>
        {preview && <PlayButton playing={listen.playing} loading={listen.loading} onClick={listen.toggle} label={listen.playing ? 'Stop listening' : 'Listen to the pattern'} size="md" tone="neutral" />}
      </div>
      <StrumGrid ref={grid} pattern={pattern} counts={prefs.counts} marks={marks} />
      <Text size="sm" tone="muted" className={styles.strumLegend}>
        Dashed arrows are ghost strokes: the hand keeps moving but misses the strings.
      </Text>
    </div>
  );
}
