import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unlockAudio } from '@/core/audio';
import { Banner, Button, Kbd, SegmentedControl, Select, Sheet, Spinner, Switch, Text, useEventListener } from '@/ui';
import { channelsOf, decodeTake, TakePlayer } from '../engine/player';
import { rmsOf } from '../model/signal';
import type { TakeStore } from '../model/store';
import { comparisonFor, formatDuration, formatTakeDate, matchGains, relativeAge, type Take } from '../model/takes';
import { Waveform } from './Waveform';
import styles from '../Recorder.module.css';

/** Props for `<CompareSheet>`. */
export interface CompareSheetProps {
  open: boolean;
  onClose: () => void;
  store: TakeStore | null;
  takes: readonly Take[];
  /** Take A: the one the learner is looking at. */
  take: Take | null;
}

type Side = 'a' | 'b';

interface Loaded {
  buffer: AudioBuffer | null;
  rms: number;
}

/**
 * Two takes side by side, "compare with last week": one Play button and an A / B switch that
 * jumps between them at the same moment, loudness matched so the louder take does not simply
 * sound better. B starts as the take of the same task nearest a week earlier.
 */
export function CompareSheet({ open, onClose, store, takes, take }: CompareSheetProps) {
  const [otherId, setOtherId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('a');
  const [matched, setMatched] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [failed, setFailed] = useState(false);
  const playerRef = useRef<TakePlayer | null>(null);
  if (!playerRef.current) playerRef.current = new TakePlayer();
  const player = playerRef.current;

  // Each time it opens: B is the suggested comparison, A is heard first.
  useEffect(() => {
    if (!open || !take) return;
    setOtherId(comparisonFor(takes, take)?.id ?? null);
    setSide('a');
    setFailed(false);
    // Only when it opens or A changes, not on every change of the list.
  }, [open, take?.id]);

  const other = useMemo(() => takes.find((t) => t.id === otherId) ?? null, [takes, otherId]);

  // Decode both takes (once each).
  useEffect(() => {
    if (!open || !store) return;
    let alive = true;
    for (const t of [take, other]) {
      if (!t || loaded[t.id]) continue;
      void (async () => {
        const blob = await store.audio(t.id).catch(() => null);
        const buffer = blob ? await decodeTake(t.id, blob) : null;
        if (!alive) return;
        if (!buffer) setFailed(true);
        setLoaded((prev) => ({ ...prev, [t.id]: { buffer, rms: buffer ? rmsOf(channelsOf(buffer)) : 0 } }));
      })();
    }
    return () => {
      alive = false;
    };
  }, [open, store, take, other, loaded]);

  useEffect(() => player.onChange((s) => setPlaying(s.playing)), [player]);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    if (!open) player.pause();
  }, [open, player]);

  const a = take ? loaded[take.id] : undefined;
  const b = other ? loaded[other.id] : undefined;
  const ready = !!a?.buffer && !!b?.buffer;
  const [gainA, gainB] = matched && a && b ? matchGains(a.rms, b.rms) : [1, 1];
  const current = side === 'a' ? a : b;

  // Put the chosen side in the player, at the same moment, playing if it was.
  const shown = useRef<{ side: Side; buffer: AudioBuffer | null; gain: number } | null>(null);
  useEffect(() => {
    if (!open || !current?.buffer) return;
    const gain = side === 'a' ? gainA : gainB;
    const prev = shown.current;
    if (prev && prev.buffer === current.buffer && prev.gain === gain) return;
    if (prev && prev.buffer) player.swap(current.buffer, gain);
    else player.load(current.buffer, gain);
    shown.current = { side, buffer: current.buffer, gain };
  }, [open, side, current, gainA, gainB, player]);
  useEffect(() => {
    if (!open) shown.current = null;
  }, [open]);

  const toggle = useCallback(() => {
    void unlockAudio();
    player.toggle();
  }, [player]);

  const position = useCallback(() => player.position(), [player]);

  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (!open || event.metaKey || event.ctrlKey || event.altKey) return;
    const el = event.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
    if (event.key === 'a' || event.key === 'A') setSide('a');
    else if (event.key === 'b' || event.key === 'B') setSide('b');
    else if (event.key === 'x' || event.key === 'X') setSide((s) => (s === 'a' ? 'b' : 'a'));
    else return;
    event.preventDefault();
  });

  const shownTake = side === 'a' ? take : other;
  const options = takes.filter((t) => t.id !== take?.id).map((t) => ({ value: t.id, label: `${t.name} · ${formatTakeDate(t.createdAt)}` }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compare two takes"
      description="Switch between A and B while it plays. Both continue from the same moment."
      size="lg"
      footer={
        <Button variant="primary" iconLeft={playing ? 'Pause' : 'Play'} onClick={toggle} disabled={!ready} data-recorder-compare-play="">
          {playing ? 'Pause' : 'Play'}
        </Button>
      }
    >
      {!take || options.length === 0 ? (
        <Text tone="muted">Record a second take and you can compare the two here.</Text>
      ) : (
        <div className={styles.compare} data-recorder-compare="" data-side={side}>
          <div className={styles.compareSides}>
            <div className={styles.compareSide} data-active={side === 'a' || undefined}>
              <span className={styles.compareTag} aria-hidden="true">
                A
              </span>
              <div className={styles.compareText}>
                <p className={styles.compareName}>{take.name}</p>
                <Text variant="caption" tone="muted">
                  {formatTakeDate(take.createdAt)} · {formatDuration(take.durationMs)}
                </Text>
              </div>
            </div>
            <div className={styles.compareSide} data-active={side === 'b' || undefined}>
              <span className={styles.compareTag} aria-hidden="true">
                B
              </span>
              <div className={styles.compareText}>
                <Select label="Take B" hideLabel value={otherId ?? ''} options={options} onChange={(v) => setOtherId(v)} size="sm" />
                {other && (
                  <Text variant="caption" tone="muted">
                    Recorded {relativeAge(take, other)} · {formatDuration(other.durationMs)}
                  </Text>
                )}
              </div>
            </div>
          </div>

          <SegmentedControl
            aria-label="Which take to hear"
            options={[
              { value: 'a', label: 'A: this take' },
              { value: 'b', label: other ? `B: ${relativeAge(take, other)}` : 'B' },
            ]}
            value={side}
            onChange={(v) => setSide(v as Side)}
            fullWidth
            size="lg"
          />

          {!ready && !failed && (
            <Spinner tone="muted" size={18}>
              Getting both takes ready…
            </Spinner>
          )}
          {failed && (
            <Banner tone="warn" title="One of these takes cannot be played here">
              It may be damaged. Save it as a file and try another player.
            </Banner>
          )}
          {ready && current?.buffer && shownTake && (
            <Waveform
              peaks={shownTake.peaks}
              duration={current.buffer.duration}
              position={position}
              playing={playing}
              onSeek={(s) => player.seek(s)}
              onToggle={toggle}
              label={`Position in take ${side.toUpperCase()}`}
              size="md"
            />
          )}

          <Switch checked={matched} onChange={setMatched} label="Match the loudness" description="Turns the louder take down, so you judge the playing, not the volume." />
          <Text variant="caption" tone="muted" className={styles.keys}>
            Keys: <Kbd>A</Kbd> and <Kbd>B</Kbd> pick a take, <Kbd>X</Kbd> swaps, <Kbd>Space</Kbd> on the waveform plays.
          </Text>
        </div>
      )}
    </Sheet>
  );
}
