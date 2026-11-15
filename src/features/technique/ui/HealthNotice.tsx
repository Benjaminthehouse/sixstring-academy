/**
 * Health while practising: a short tension check every few minutes, a gentle stop prompt after a
 * long stretch, and the strain limit of the exercise. A small card above the bottom bar: it never
 * blocks the music and always offers a way to carry on.
 */
import { useEffect, useState } from 'react';
import { Button, CountdownRing, Icon, LinkButton, Text } from '@/ui';
import { dismissTension, keepGoing, takeBreak, tensionIndex, useHealthClock } from '../engine/health-clock';
import { reminderDue, tensionLine } from '../model/health';
import styles from '../Technique.module.css';

/** Props of the health notice. */
export interface HealthNoticeProps {
  /** Stop whatever is playing (before a break). */
  onPause: () => void;
  /** The exercise's strain warning, once its time is up. */
  strain?: { text: string; minutes: number } | null;
  onStrainDismiss?: () => void;
  /** Hide the cool-down link (on the cool-down itself). */
  hideCoolDown?: boolean;
}

const BREAK_SECONDS = 5 * 60;

/** The tension check, the break prompt and the strain limit. */
export function HealthNotice({ onPause, strain, onStrainDismiss, hideCoolDown }: HealthNoticeProps) {
  const health = useHealthClock();
  const due = reminderDue(health);
  const [breakLeft, setBreakLeft] = useState<number | null>(null);

  // A tension check goes away by itself after a while: it is a nudge, not a stop.
  useEffect(() => {
    if (due !== 'tension') return;
    const id = window.setTimeout(dismissTension, 15000);
    return () => window.clearTimeout(id);
  }, [due]);

  if (breakLeft !== null) {
    return (
      <div className={styles.noticeLayer}>
        <div className={styles.notice} data-kind="break" role="status" data-technique-notice="resting">
          <div className={styles.noticeHead}>
            <CountdownRing seconds={BREAK_SECONDS} size={56} label="Break time left" onDone={() => { takeBreak(); setBreakLeft(null); }}>
              {(s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
            </CountdownRing>
            <div>
              <Text weight="bold">Taking a break</Text>
              <Text size="sm" tone="muted">
                Put the guitar down, stand up, let your arms hang and shake out your hands. A glass of water helps too.
              </Text>
            </div>
          </div>
          <Button variant="primary" onClick={() => { takeBreak(); setBreakLeft(null); }}>
            I’m back
          </Button>
        </div>
      </div>
    );
  }

  if (strain) {
    return (
      <div className={styles.noticeLayer}>
        <div className={styles.notice} data-kind="strain" role="status" data-technique-notice="strain">
          <div className={styles.noticeHead}>
            <span className={styles.noticeIcon}>
              <Icon name="TriangleAlert" size="sm" />
            </span>
            <div>
              <Text weight="bold">{strain.minutes} minutes on this one</Text>
              <Text size="sm" tone="muted">
                {strain.text} Rest the hand, or switch to something gentler for a while.
              </Text>
            </div>
          </div>
          <div className={styles.todayLinks}>
            <LinkButton to="technique" size="sm" iconLeft="ArrowLeft" onClick={onPause}>
              Pick another exercise
            </LinkButton>
            <Button variant="ghost" size="sm" onClick={onStrainDismiss}>
              I feel fine, carry on
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (due === 'break') {
    const minutes = Math.floor(health.playedSec / 60);
    return (
      <div className={styles.noticeLayer}>
        <div className={styles.notice} data-kind="break" role="status" data-technique-notice="break">
          <div className={styles.noticeHead}>
            <span className={styles.noticeIcon}>
              <Icon name="Hourglass" size="sm" />
            </span>
            <div>
              <Text weight="bold">You have played for {minutes} minutes</Text>
              <Text size="sm" tone="muted">
                That is a good block. Hands and tendons like a short break now: five minutes away from the guitar, then come back fresh.
              </Text>
            </div>
          </div>
          <div className={styles.todayLinks}>
            <Button
              variant="primary"
              size="sm"
              iconLeft="Pause"
              onClick={() => {
                onPause();
                setBreakLeft(BREAK_SECONDS);
              }}
              data-technique-break=""
            >
              Take a 5-minute break
            </Button>
            {!hideCoolDown && (
              <LinkButton to="technique" params={['tech-cool-down']} size="sm" onClick={onPause}>
                Cool down and stop
              </LinkButton>
            )}
            <Button variant="ghost" size="sm" onClick={keepGoing}>
              Keep going
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (due === 'tension') {
    return (
      <div className={styles.noticeLayer}>
        <div className={styles.notice} data-kind="tension" role="status" data-technique-notice="tension">
          <div className={styles.noticeHead}>
            <span className={styles.noticeIcon}>
              <Icon name="Wind" size="sm" />
            </span>
            <Text size="sm">{tensionLine(tensionIndex())}</Text>
          </div>
          <Button size="sm" variant="ghost" onClick={dismissTension}>
            Done, all loose
          </Button>
        </div>
      </div>
    );
  }
  return null;
}
