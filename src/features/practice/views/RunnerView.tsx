/**
 * The session runner: one block at a time with its title, goal, a countdown ring, the screen that
 * serves it, and pause / next. Space pauses or resumes, N moves on, Esc asks before leaving (the
 * session keeps running and the global bar brings the learner back).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { ActionBar, Banner, Button, Icon, Kbd, LinkButton, Modal, Page, ProgressRing, Tooltip, confirmDialog, cx, useElementSize, useEventListener, useIsTouch, useMediaQuery, useWakeLock } from '@/ui';
import { AREA_INFO } from '../model/areas';
import { endSessionText, formatDuration } from '../model/journal';
import type { SessionState } from '../model/session';
import { endPractice, extendPracticeBlock, nextPracticeBlock, pausePractice, togglePractice, resumePractice, type SessionView } from '../session/controller';
import { AreaTag, OutcomeMark, ReasonLine } from './parts';
import styles from './Runner.module.css';

/** The bar of segments across the top: one per block, filled as its time runs. */
function Strip({ state }: { state: SessionState }) {
  return (
    <ol className={styles.strip} aria-hidden="true">
      {state.blocks.map((b, i) => {
        const pct = Math.min(100, (state.spentMs[i] / (b.plannedSec * 1000)) * 100);
        // A block left part-way shows how far it got, not a full bar.
        const fill = state.outcome[i] === 'pending' || state.outcome[i] === 'partial' ? pct : 100;
        return (
          <li key={b.id} className={cx(styles.segment, i === state.index && styles.segmentNow)} style={{ flexGrow: b.plannedSec }}>
            <span className={styles.segmentFill} style={{ width: `${fill}%` }} data-outcome={state.outcome[i]} />
          </li>
        );
      })}
    </ol>
  );
}

/** Every block, with what became of it, for the side of a wide screen. */
function Outline({ state }: { state: SessionState }) {
  return (
    <ol className={styles.outline}>
      {state.blocks.map((b, i) => {
        const now = i === state.index;
        const mins = Math.round(b.plannedSec / 60);
        return (
          <li key={b.id} className={cx(styles.outlineItem, now && styles.outlineNow)} aria-current={now ? 'step' : undefined}>
            {now ? (
              <span className={styles.nowDot} aria-hidden="true">
                <Icon name="Play" size={12} strokeWidth={2.5} />
              </span>
            ) : (
              <OutcomeMark outcome={state.outcome[i]} />
            )}
            <span className={styles.outlineText}>
              <span className={styles.outlineTitle}>{b.title}</span>
              <span className={styles.outlineMeta}>
                {AREA_INFO[b.area].label} · {mins} min
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The runner for a session that is running or paused. */
export function RunnerView({ view }: { view: SessionView }) {
  const s = view.state;
  const block = view.block;
  const running = s.status === 'running';
  const wide = useMediaQuery('(min-width: 900px)');
  // A phone held sideways: too short for the timer under the title, so it goes beside the details.
  const sideways = useMediaQuery('(orientation: landscape) and (max-height: 540px) and (min-width: 560px)') && !wide;
  const touch = useIsTouch();
  const [leaving, setLeaving] = useState(false);
  const [announce, setAnnounce] = useState('');
  // The ring grows with the learner's text size; at 200 % it must still fit the column.
  const [timerRef, { width: timerWidth }] = useElementSize<HTMLDivElement>();
  const ringFit = useMemo(() => {
    if (!(timerWidth > 0) || typeof document === 'undefined') return Number.POSITIVE_INFINITY;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.floor((timerWidth / rem) * 16);
  }, [timerWidth]);
  useImmersive(true, 'focus');
  useWakeLock(running);
  useScreenTitle('Practice session');

  // Say it when a new block starts (the chime has already sounded).
  const lastIndex = useRef(s.index);
  useEffect(() => {
    if (lastIndex.current === s.index || !block) return;
    lastIndex.current = s.index;
    setAnnounce(`Block ${s.index + 1} of ${s.blocks.length}: ${block.title}, ${Math.round(block.plannedSec / 60)} minutes.`);
  }, [s.index, s.blocks.length, block]);

  const end = async () => {
    const ok = await confirmDialog({
      title: 'End the session now?',
      description: endSessionText(view.practisedSec),
      confirmLabel: 'End and save',
      cancelLabel: 'Keep going',
    });
    if (ok) endPractice();
  };

  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (leaving || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector('[role="dialog"]')) return;
    const el = event.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (el?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === ' ') {
      // On a focused button or link, Space is that control's own key.
      if (tag === 'BUTTON' || tag === 'A') return;
      event.preventDefault();
      togglePractice();
      setAnnounce(running ? 'Paused.' : 'Running.');
    } else if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      nextPracticeBlock();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setLeaving(true);
    }
  });

  if (!block) return null;
  const next = s.blocks[s.index + 1];
  const info = AREA_INFO[block.area];
  const elapsed = Math.max(0, view.blockSec - view.remainingSec);
  const ringSize = Math.min(sideways ? 128 : wide ? 264 : 216, ringFit);

  const timer = (
    <div className={styles.timer} ref={timerRef}>
      <ProgressRing value={elapsed} max={Math.max(1, view.blockSec)} size={ringSize} thickness={wide ? 14 : sideways ? 10 : 12} tone={running ? 'accent' : 'neutral'} label="Time in this block">
        <span className={styles.time} data-practice-time="">
          {formatDuration(view.remainingSec)}
        </span>
        <span className={styles.timeUnit}>{running ? 'left' : 'paused'}</span>
      </ProgressRing>
      <p className={styles.sessionLeft}>
        {formatDuration(view.sessionLeftSec)} left in the session · block {s.index + 1} of {s.blocks.length}
      </p>
    </div>
  );

  const controls = (
    <>
      <Tooltip content="Space">
        <Button size="lg" iconLeft={running ? 'Pause' : 'Play'} onClick={() => (running ? pausePractice() : resumePractice())} className={styles.control} data-practice-toggle="">
          {running ? 'Pause' : 'Resume'}
        </Button>
      </Tooltip>
      <Tooltip content="N">
        <Button size="lg" iconLeft="SkipForward" onClick={nextPracticeBlock} className={styles.control} data-practice-next="">
          {next ? (wide ? 'Next block' : 'Next') : 'Finish'}
        </Button>
      </Tooltip>
    </>
  );

  const away = s.pausedBy === 'away' && (
    <Banner tone="warn" title="Paused while you were away" actions={<Button size="sm" onClick={resumePractice}>Resume</Button>} live>
      The block you were on counts as done. Carry on whenever you are ready.
    </Banner>
  );

  const links = (block.target || block.extra) && (
    <div className={styles.linksBox}>
      <div className={styles.links}>
        {block.target && (
          <LinkButton variant="primary" to={block.target.route} params={block.target.params} iconRight="ArrowUpRight" data-practice-open="">
            {block.target.label}
          </LinkButton>
        )}
        {block.extra && (
          <LinkButton to={block.extra.route} params={block.extra.params} iconLeft={block.extra.route === 'tuner' ? 'Gauge' : 'Timer'}>
            {block.extra.label}
          </LinkButton>
        )}
      </div>
      <p className={styles.openNote}>The timer keeps running on other screens; the bar at the bottom brings you back.</p>
    </div>
  );

  const what = (
    <>
      <p className={styles.goal}>{block.goal}</p>
      {block.steps && block.steps.length > 0 && (
        <ol className={styles.steps}>
          {block.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {block.reason && <ReasonLine>{block.reason}</ReasonLine>}
    </>
  );

  const more = (
    <div className={styles.more}>
      <div className={styles.moreButtons}>
        <Button size="sm" variant="ghost" iconLeft="Plus" onClick={() => extendPracticeBlock(60)}>
          Add a minute
        </Button>
        {!wide && (
          <Button size="sm" variant="ghost" iconLeft="Square" onClick={end} data-practice-end="">
            End session
          </Button>
        )}
      </div>
      {next ? (
        <p className={styles.upNext}>
          <span className={styles.upNextLabel}>Up next</span> {next.title} · {Math.round(next.plannedSec / 60)} min
        </p>
      ) : (
        <p className={styles.upNext}>
          <span className={styles.upNextLabel}>Last block</span> then your summary
        </p>
      )}
    </div>
  );

  return (
    <Page
      title={block.title}
      hideHeader={sideways}
      eyebrow={
        <span className={styles.eyebrow}>
          <AreaTag area={block.area} iconOnly /> Block {s.index + 1} of {s.blocks.length} · {info.label}
        </span>
      }
      actions={
        wide ? (
          <Button variant="ghost" iconLeft="Square" onClick={end} data-practice-end="">
            End session
          </Button>
        ) : undefined
      }
      className={styles.page}
    >
      <Strip state={s} />
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      {wide || sideways ? (
        <div className={cx(styles.wide, sideways && styles.sideways)}>
          <div className={styles.stage}>
            {timer}
            <div className={styles.controls}>{controls}</div>
            {!touch && (
              <p className={styles.keys}>
                <Kbd>Space</Kbd> pause <Kbd>N</Kbd> next <Kbd>Esc</Kbd> leave
              </p>
            )}
          </div>
          <div className={styles.side}>
            <div className={styles.details}>
              {sideways && (
                <div className={styles.sideHead} aria-hidden="true">
                  <p className={styles.sideEyebrow}>
                    Block {s.index + 1} of {s.blocks.length} · {info.label}
                  </p>
                  <p className={styles.sideTitle}>{block.title}</p>
                </div>
              )}
              {away}
              {what}
              {links}
              {more}
            </div>
            <section aria-label="All blocks" className={styles.outlineBox}>
              <h2 className={styles.outlineHeading}>{s.title}</h2>
              <Outline state={s} />
            </section>
          </div>
        </div>
      ) : (
        <>
          {away}
          {timer}
          {links}
          <div className={styles.details}>
            {what}
            {more}
          </div>
          <ActionBar className={styles.controlBar}>{controls}</ActionBar>
        </>
      )}

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave the session?"
        description="It keeps running while you are away from here: the bar at the bottom of every screen shows the time and brings you back."
        size="sm"
        footer={
          <>
            <Button onClick={() => setLeaving(false)}>Stay</Button>
            <Button
              onClick={() => {
                pausePractice();
                setLeaving(false);
                navigate('practice');
              }}
            >
              Pause and leave
            </Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                setLeaving(false);
                navigate('practice');
              }}
            >
              Leave, keep timing
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </Page>
  );
}
