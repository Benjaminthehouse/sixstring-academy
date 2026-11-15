import { useRef, useState } from 'react';
import { Button, Cluster, Kbd, SegmentedControl, Stat, Switch, Text, TextField, VisuallyHidden, cx, useDebounced, useElementSize, useEventListener, useInterval, useIsMobile, useLocalState, useMediaQuery, usePrefersReducedMotion, useRafLoop, useWakeLock } from '@/ui';
import { Box, Demo, Group, Specimen, kitStyles as styles } from './parts';

/** Live readouts of the utility hooks. */
export function HooksGroup() {
  const mobile = useIsMobile();
  const wide = useMediaQuery('(min-width: 1080px)');
  const reduced = usePrefersReducedMotion();
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [favourite, setFavourite, resetFavourite] = useLocalState('kit.favourite-key', 'A minor');
  const [ticking, setTicking] = useState(false);
  const [ticks, setTicks] = useState(0);
  useInterval(() => setTicks((t) => t + 1), ticking ? 500 : null);
  const [text, setText] = useState('pentatonic');
  const debounced = useDebounced(text, 400);
  const [awake, setAwake] = useState(false);
  const lock = useWakeLock(awake);
  const [lastKey, setLastKey] = useState('none yet');
  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e) => setLastKey(e.key === ' ' ? 'Space' : e.key));
  const [spin, setSpin] = useState(false);
  const dot = useRef<HTMLDivElement | null>(null);
  const phase = useRef(0);
  useRafLoop((dt) => {
    // Mutates the element directly: no React state per frame.
    phase.current = (phase.current + dt / 1600) % 1;
    const el = dot.current;
    if (el?.parentElement) el.style.transform = `translateX(${phase.current * (el.parentElement.clientWidth - 14)}px)`;
  }, spin);

  return (
    <Group id="hooks" index="07" title="Hooks and utilities" blurb="Small tools the components are built on, exported for screens to reuse.">
      <Specimen name="useMediaQuery" note="useIsMobile (under 720 px), usePrefersReducedMotion, useIsTouch.">
        <div className={styles.readout}>
          <Stat size="sm" label="useIsMobile()" value={String(mobile)} />
          <Stat size="sm" label="min-width: 1080px" value={String(wide)} />
          <Stat size="sm" label="reduced motion" value={String(reduced)} />
        </div>
      </Specimen>

      <Specimen name="useElementSize" note="ResizeObserver on a callback ref. Drag the corner of the box.">
        <div ref={ref} className={cx(styles.box, styles.measured)}>
          {size.width} × {size.height}
        </div>
      </Specimen>

      <Specimen name="useLocalState" note="useState that survives a reload, through the platform storage layer.">
        <Cluster gap={3} align="end">
          <SegmentedControl aria-label="Favourite key" options={['A minor', 'E minor', 'G major']} value={favourite} onChange={setFavourite} />
          <Button variant="ghost" onClick={resetFavourite}>
            Reset
          </Button>
        </Cluster>
        <Text variant="caption">Stored as “kit.favourite-key”. Reload the page: the choice stays.</Text>
      </Specimen>

      <Specimen name="useInterval" note="Pass null to pause. Not for musical timing: that runs on the audio clock.">
        <Cluster gap={4} align="center">
          <Stat size="sm" label="Ticks" value={ticks} />
          <Button onClick={() => setTicking((t) => !t)}>{ticking ? 'Stop ticking' : 'Start ticking'}</Button>
        </Cluster>
      </Specimen>

      <Specimen name="useRafLoop" note="A frame loop that cleans up after itself. Draw or mutate refs inside it.">
        <Demo width="medium">
          <div className={styles.rafTrack}>
            <div ref={dot} className={styles.rafDot} />
          </div>
          <Cluster>
            <Button onClick={() => setSpin((s) => !s)}>{spin ? 'Stop the loop' : 'Run the loop'}</Button>
          </Cluster>
        </Demo>
      </Specimen>

      <Specimen name="useDebounced" note="The value, once it has stopped changing.">
        <Demo width="narrow">
          <TextField label="Type quickly" value={text} onChange={setText} />
          <Text variant="caption" aria-live="polite">
            Debounced by 400 ms: “{debounced}”
          </Text>
        </Demo>
      </Specimen>

      <Specimen name="useWakeLock" note="Keeps the screen on while practising. Tolerant: unsupported or refused just reports false.">
        <Demo width="medium">
          <Switch label="Keep the screen awake" checked={awake} onChange={setAwake} />
          <Text variant="caption">
            supported: {String(lock.supported)} · held: {String(lock.held)}
          </Text>
        </Demo>
      </Specimen>

      <Specimen name="useEventListener" note="A listener that always sees fresh props and removes itself.">
        <Text>
          Last key pressed: <Kbd>{lastKey}</Kbd>
        </Text>
      </Specimen>

      <Specimen name="cx / VisuallyHidden" note="Class joiner; text for screen readers only.">
        <Box>
          cx('a', false, {'{'} b: true {'}'}, ['c']) → “{cx('a', false, { b: true }, ['c'])}”
        </Box>
        <Text variant="caption">
          This sentence ends with words only a screen reader gets.<VisuallyHidden> You found them.</VisuallyHidden>
        </Text>
      </Specimen>
    </Group>
  );
}
