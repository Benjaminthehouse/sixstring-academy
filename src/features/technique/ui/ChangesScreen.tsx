/**
 * One-minute changes (`#technique--tech-changes-pairs-1` …): pick a pair, strum once per beat
 * and change on every beat for sixty seconds, then say how many changes were clean. The best
 * count per pair is kept on the pair's progress skill (`chord-change:<a>-<b>`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { chordChangeSkillId, pairLabel, partSong, type TechniqueExercise } from '@/content/technique';
import { playUi } from '@/core/audio';
import { formatChord } from '@/core/theory';
import { keepAwake } from '@/core/platform';
import { recordActivity, useProgress, usePrefs } from '@/core/progress';
import { ActionBar, Button, Card, Celebration, ChipGroup, CountdownRing, Icon, Kbd, Page, Section, Stat, Stepper, Text, Tooltip, useEventListener, useIsMobile, useLocalState, useMediaQuery, IconButton } from '@/ui';
import { ChordDiagram } from '@/ui/music';
import { tickHealthClock } from '../engine/health-clock';
import { ExerciseRunner } from '../engine/runner';
import { addPairMinute, localDay, readPair } from '../model/history';
import { afterPass, clampTempo, MAX_TEMPO, MIN_TEMPO } from '../model/ladder';
import type { Verdict } from '../model/takes';
import styles from '../Technique.module.css';
import { ownsKeys, SIDEWAYS_QUERY, WIDE_QUERY } from './ExerciseScreen';
import { HealthNotice } from './HealthNotice';
import { Coaching, Rungs, exerciseEyebrow } from './Panels';

const MINUTE = 60;

type Phase = 'ready' | 'count-in' | 'minute' | 'count' | 'saved';

/** The one-minute changes screen. */
export function ChangesScreen({ e }: { e: TechniqueExercise }) {
  useScreenTitle(e.title);
  const prefs = usePrefs();
  const wide = useMediaQuery(WIDE_QUERY);
  const mobile = useIsMobile();
  const pairs = e.pairs ?? [];
  const [pairId, setPairId] = useLocalState<string>(`technique.pair.${e.id}`, pairs[0]?.id ?? '');
  const pairIndex = Math.max(0, pairs.findIndex((p) => p.id === pairId));
  const pair = pairs[pairIndex];
  const part = e.parts[pairIndex] ?? e.parts[0];
  const skills = useProgress((s) => s.skills);
  const pairRecord = useMemo(() => readPair(skills[chordChangeSkillId(pair)]?.data), [skills, pair]);
  const lastTempo = pairRecord.log[pairRecord.log.length - 1]?.t;
  const [tempo, setTempo] = useState(() => clampTempo(lastTempo ?? e.tempo.start));
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(0);
  const [beat, setBeat] = useState(-1);
  const [saved, setSaved] = useState<{ count: number; best: boolean; verdict: Verdict; nextTempo: number } | null>(null);
  const song = useMemo(() => partSong(e, part, tempo), [e, part, tempo]);
  const max = tempo; // one change per beat for a minute
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  useImmersive(phase === 'count-in' || phase === 'minute' || sideways, 'focus');

  const runnerRef = useRef<ExerciseRunner | null>(null);
  if (!runnerRef.current) runnerRef.current = new ExerciseRunner();
  const runner = runnerRef.current;

  useEffect(() => runner.setSounds(prefs.sound.clickSound, prefs.sound.guitarTone), [runner, prefs.sound.clickSound, prefs.sound.guitarTone]);
  useEffect(() => {
    if (runner.state === 'idle') runner.load(part, song, tempo);
  }, [runner, part, song, tempo]);
  useEffect(
    () =>
      runner.subscribe((ev) => {
        if (ev.type === 'countin') setPhase('count-in');
        else if (ev.type === 'beat') {
          setPhase((p) => (p === 'count-in' ? 'minute' : p));
          setBeat(ev.beat);
        }
      }),
    [runner],
  );
  useEffect(() => () => runner.dispose(), [runner]);
  useEffect(() => (phase === 'minute' || phase === 'count-in' ? keepAwake() : undefined), [phase]);
  useEffect(() => {
    if (phase !== 'minute') return;
    const id = window.setInterval(() => tickHealthClock(1, true), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const start = useCallback(() => {
    setSaved(null);
    setBeat(-1);
    setPhase('count-in');
    void runner.start({ loop: true, guide: false, click: true });
  }, [runner]);

  const endMinute = useCallback(() => {
    runner.stop();
    playUi('lessonComplete');
    setPhase('count');
    setCount(Math.min(max, pairRecord.log[pairRecord.log.length - 1]?.n ?? Math.round(max / 2)));
  }, [runner, max, pairRecord]);

  const stop = useCallback(() => {
    runner.stop();
    setPhase('ready');
  }, [runner]);

  const saveCount = useCallback(() => {
    const day = localDay(Date.now());
    const next = addPairMinute(pairRecord, { day, count, tempo });
    const isBest = count > pairRecord.best;
    const share = max > 0 ? count / max : 0;
    const verdict: Verdict = share >= 0.9 ? 'clean' : share >= 0.7 ? 'close' : 'not-yet';
    const move = afterPass({ tempo, missesHere: 0 }, verdict, e.tempo);
    recordActivity({
      kind: 'chord-change',
      id: chordChangeSkillId(pair),
      title: `One-minute changes: ${pairLabel(pair, ' and ')}`,
      count,
      score: count,
      accuracy: Math.min(1, share),
      durationSec: MINUTE,
      route: 'technique',
      params: [e.id],
      data: next as unknown as Parameters<typeof recordActivity>[0]['data'],
      meta: { tempo },
    });
    setSaved({ count, best: isBest, verdict, nextTempo: move.state.tempo });
    if (verdict === 'clean') setTempo(clampTempo(move.state.tempo));
    setPhase('saved');
  }, [pairRecord, count, tempo, max, e, pair]);

  useEventListener(window, 'keydown', (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ownsKeys(ev.target as Element | null)) return;
    const onButton = ev.target instanceof HTMLElement && (ev.target.tagName === 'BUTTON' || ev.target.tagName === 'A');
    if ((ev.key === ' ' || ev.code === 'Space') && !onButton) {
      ev.preventDefault();
      if (phase === 'minute' || phase === 'count-in') stop();
      else if (phase !== 'count') start();
    } else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && phase !== 'minute' && phase !== 'count-in') {
      ev.preventDefault();
      if (phase === 'count') setCount((c) => Math.max(0, Math.min(max, c + (ev.key === 'ArrowUp' ? 1 : -1))));
      else setTempo((t) => clampTempo(t + (ev.key === 'ArrowUp' ? 1 : -1) * (e.tempo.step || 4)));
    } else if (ev.key === 'Enter' && phase === 'count' && !onButton) {
      ev.preventDefault();
      saveCount();
    }
  });

  const nextPair = pairs[(pairIndex + 1) % pairs.length];
  const which = beat < 0 ? -1 : beat % 2;

  const primary =
    phase === 'minute' || phase === 'count-in' ? (
      <Button iconLeft="Square" onClick={stop}>
        Stop
      </Button>
    ) : phase === 'count' ? (
      <Button variant="primary" iconLeft="Check" onClick={saveCount} data-technique-save-count="">
        Save {count} changes
      </Button>
    ) : phase === 'saved' ? (
      <Button variant="primary" iconRight="ArrowRight" wrap onClick={() => { setPairId(nextPair.id); setPhase('ready'); setSaved(null); }} data-technique-next-pair="">
        Next pair: {pairLabel(nextPair, ' and ')}
      </Button>
    ) : (
      <Tooltip content={<>Start the minute <Kbd>Space</Kbd></>}>
        <Button variant="primary" iconLeft="Play" size={wide ? 'lg' : 'md'} fullWidth={wide} wrap onClick={start} data-technique-primary="">
          Start the minute
        </Button>
      </Tooltip>
    );

  return (
    <Page
      title={e.title}
      eyebrow={exerciseEyebrow(e)}
      subtitle={e.summary}
      back={{ to: 'technique', label: 'Technique' }}
      hideHeader={sideways}
    >
      <div className={styles.layout} data-technique-screen="changes" data-exercise={e.id} data-pair={pair.id} data-phase={phase} data-tempo={tempo} data-best={pairRecord.best}>
        <div className={styles.main}>
          {e.strain && <Text tone="muted" size="sm"><Icon name="TriangleAlert" size="xs" /> {e.strain.text}</Text>}
          <ChipGroup aria-label="Chord pair" options={pairs.map((p) => ({ value: p.id, label: pairLabel(p) }))} value={pair.id} onChange={(v) => { if (v && phase !== 'minute') { setPairId(v); setPhase('ready'); setSaved(null); } }} />
          <Card padding="lg" className={styles.routine}>
            <div className={styles.pairBoxes}>
              <div className={styles.pairBox} data-now={which === 0}>
                <ChordDiagram chord={pair.a.symbol} frets={pair.a.shape} size={mobile ? 'sm' : 'md'} />
              </div>
              <span className={styles.pairArrow} aria-hidden="true">
                <Icon name="ArrowLeftRight" size="lg" />
              </span>
              <div className={styles.pairBox} data-now={which === 1}>
                <ChordDiagram chord={pair.b.symbol} frets={pair.b.shape} size={mobile ? 'sm' : 'md'} />
              </div>
            </div>
            <Text tone="muted" align="center">
              {pair.tip}
            </Text>
            {(phase === 'minute' || phase === 'count-in') && (
              <div className={styles.minute} aria-live="polite">
                <CountdownRing seconds={MINUTE} running={phase === 'minute'} size={88} label="Seconds left in the minute" tone="accent" onDone={endMinute}>
                  {(s) => `${s}`}
                </CountdownRing>
                <Text size="lg" weight="bold">
                  {phase === 'count-in' ? 'Get ready…' : formatChord(which === 0 ? pair.a.symbol : pair.b.symbol)}
                </Text>
              </div>
            )}
            {phase === 'count' && (
              <div className={styles.minute}>
                <Stepper label="How many changes were clean?" value={count} onChange={setCount} min={0} max={max} size="lg" hint={`At ${tempo} BPM a minute holds ${max} changes.`} />
              </div>
            )}
            {phase === 'saved' && saved && (
              <div className={styles.minute} aria-live="polite" data-technique-saved={saved.count}>
                <div>
                  <span className={styles.bigCount}>{saved.count}</span> <Text tone="muted">clean changes</Text>
                </div>
                <Text>
                  {saved.best ? 'A new best for this pair.' : `Your best is ${pairRecord.best}.`}{' '}
                  {saved.verdict === 'clean' && saved.nextTempo > tempo - 1 ? `Nearly every beat: try the next minute at ${tempo} BPM.` : saved.verdict === 'close' ? 'Getting there: another minute at this tempo.' : 'Slow and clean beats fast and messy: stay at this tempo.'}
                </Text>
                <Celebration fire={saved.best} intensity="low" contained />
              </div>
            )}
          </Card>
          {!wide && phase === 'ready' && <Rungs e={e} tempo={tempo} best={null} middle={`Now ${tempo}: one change per beat`} />}
          <Coaching e={e} />
        </div>
        <aside className={wide ? styles.side : styles.main} aria-label="The minute">
          <Card padding="lg">
            <Section title="Tempo and best" level={3} gap={3}>
              <Stepper label="Tempo" value={tempo} onChange={(v) => setTempo(clampTempo(v))} min={MIN_TEMPO} max={MAX_TEMPO} step={e.tempo.step || 4} unit="BPM" disabled={phase === 'minute' || phase === 'count-in'} />
              {wide && <Rungs e={e} tempo={tempo} best={null} middle={`Now ${tempo}: one change per beat`} />}
              <div className={styles.summaryStats}>
                <Stat label="Best for this pair" value={pairRecord.best || '–'} unit={pairRecord.best ? 'changes' : undefined} />
                <Stat label="Minutes played" value={pairRecord.log.length} />
              </div>
              {pairRecord.log.length > 0 && (
                <Text size="sm" tone="muted">
                  Last: {pairRecord.log.slice(-5).map((m) => `${m.n} at ${m.t}`).join(', ')}
                </Text>
              )}
              {wide && primary}
            </Section>
          </Card>
          <Card padding="lg">
            <Section title="All pairs" level={3} gap={2}>
              {pairs.map((p) => {
                const best = readPair(skills[chordChangeSkillId(p)]?.data).best;
                return (
                  <div key={p.id} className={styles.tempoRow}>
                    <Text>{pairLabel(p, ' and ')}</Text>
                    <Text tone="muted" tabular>
                      {best ? `best ${best}` : 'not yet'}
                    </Text>
                  </div>
                );
              })}
            </Section>
          </Card>
        </aside>
      </div>
      {!wide && (
        <ActionBar
          start={
            phase === 'ready' || phase === 'saved' ? (
              <div className={styles.barTempo}>
                <IconButton icon="Minus" label="Slower" onClick={() => setTempo((t) => clampTempo(t - (e.tempo.step || 4)))} />
                <span className={styles.barTempoValue} aria-live="polite">
                  {tempo}
                  <small>BPM</small>
                </span>
                <IconButton icon="Plus" label="Faster" onClick={() => setTempo((t) => clampTempo(t + (e.tempo.step || 4)))} />
              </div>
            ) : undefined
          }
          stretchOnMobile={false}
        >
          {primary}
        </ActionBar>
      )}
      <HealthNotice onPause={stop} />
    </Page>
  );
}
