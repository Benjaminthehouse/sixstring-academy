import { useCallback, useEffect, useRef, useState } from 'react';
import { selectDailyGoal, shouldReduceMotion, useProgressStore, xpBoostOf, type ProgressEvent } from '@/core/progress';
import { Button, Celebration, Icon, LevelBadge, Modal, toast } from '@/ui';
import { openStats } from '../shell/stats';
import { XpTally, digest, xpToastDetail, type FeedbackPlan, type PlannedModal, type PlannedToast } from './digest';
import { playShellSound, prepareShellSounds } from './sounds';
import { noteShellToast } from './toasts';
import styles from './Feedback.module.css';

/** Events that arrive within this many ms are treated as one moment (one activity emits them together). */
const SETTLE_MS = 60;
const MODAL_EXIT_MS = 220;

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' } as const;

function gemsLine(gems: number): string | null {
  return gems > 0 ? `+${gems} ${gems === 1 ? 'gem' : 'gems'}` : null;
}

function modalTitle(modal: PlannedModal): string {
  if (modal.kind === 'level') return `Level ${modal.level}: ${modal.title}`;
  if (modal.kind === 'streak') return `${modal.days} day streak`;
  return `Achievement unlocked: ${modal.name}`;
}

function ModalBody({ modal }: { modal: PlannedModal }) {
  const gems = gemsLine(modal.gems);
  return (
    <div className={styles.moment}>
      {modal.kind === 'level' && (
        <>
          <span className={styles.badgePop}>
            <LevelBadge level={modal.level} size={104} />
          </span>
          <p className={styles.kicker}>Level up</p>
          <p className={styles.headline}>{modal.title}</p>
          <p className={styles.detail}>You reached level {modal.level}. Every lesson, song and drill got you here.</p>
        </>
      )}
      {modal.kind === 'streak' && (
        <>
          <span className={styles.tile} data-kind="streak" aria-hidden="true">
            <Icon name="Flame" size={56} strokeWidth={1.6} />
          </span>
          <p className={styles.kicker}>Streak milestone</p>
          <p className={styles.headline}>{modal.days} days in a row</p>
          <p className={styles.detail}>Showing up is the hard part of learning an instrument, and you keep doing it.</p>
        </>
      )}
      {modal.kind === 'achievement' && (
        <>
          <span className={styles.tile} data-kind={modal.tier} aria-hidden="true">
            <Icon name={modal.icon} size={52} strokeWidth={1.6} />
          </span>
          <p className={styles.kicker}>{TIER_LABEL[modal.tier]} achievement</p>
          <p className={styles.headline}>{modal.name}</p>
          {modal.description && <p className={styles.detail}>{modal.description}</p>}
        </>
      )}
      {gems && (
        <p className={styles.reward}>
          <Icon name="Gem" size={18} strokeWidth={2} />
          {gems}
        </p>
      )}
    </div>
  );
}

/**
 * The shell's ears: listens to every progress event and turns it into feedback the learner sees
 * and hears, wherever they are in the app. XP gains become one growing toast; goals, streaks,
 * quests and small achievements become toasts; a new level, a streak milestone and the rare
 * achievements get a dialog and confetti; a lost heart gets a small flash. Mounted once.
 */
export function GlobalFeedback() {
  const store = useProgressStore();
  const buffer = useRef<ProgressEvent[]>([]);
  const tally = useRef(new XpTally());
  const queue = useRef<PlannedModal[]>([]);
  const [active, setActive] = useState<PlannedModal | null>(null);
  const [open, setOpen] = useState(false);
  const activeRef = useRef<PlannedModal | null>(null);
  const [confetti, setConfetti] = useState<{ shot: number; intensity: 'low' | 'medium' | 'high' }>({ shot: 0, intensity: 'medium' });
  const [heartFlash, setHeartFlash] = useState<{ shot: number; left: number } | null>(null);

  // Toasts held back while a dialog is up, so they never pile on top of it.
  const deferred = useRef<Array<() => void>>([]);

  const showNext = useCallback(() => {
    const next = queue.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
    setOpen(next !== null);
    if (next === null) {
      for (const show of deferred.current.splice(0)) show();
    }
  }, []);

  const closing = useRef(false);
  const dismiss = useCallback(() => {
    // Escape and the button can both fire for one dialog; only the first one counts.
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    // Let the dialog animate out before the next one takes its place.
    window.setTimeout(() => {
      closing.current = false;
      showNext();
    }, MODAL_EXIT_MS);
  }, [showNext]);

  const showToast = useCallback((t: PlannedToast) => {
    noteShellToast(t.id);
    toast({
      id: t.id,
      title: t.title,
      description: t.description,
      icon: t.icon,
      tone: t.tone,
      duration: t.duration ?? (t.action ? 7000 : undefined),
      action: t.action === 'hearts' ? { label: 'Options', onClick: () => openStats('hearts') } : t.action === 'streak' ? { label: 'View', onClick: () => openStats('streak') } : undefined,
    });
  }, []);

  const apply = useCallback(
    (plan: FeedbackPlan) => {
      const state = store.getState();
      const now = store.now();
      // The big moment goes first; the smaller news follows once its dialog is closed.
      const behindDialog = plan.modals.length > 0 || activeRef.current !== null;
      const emit = (show: () => void) => {
        if (behindDialog) deferred.current.push(show);
        else show();
      };
      if (plan.xp > 0) {
        const total = tally.current.add(plan.xp, now);
        const detail = xpToastDetail(selectDailyGoal(state), xpBoostOf(state, now).active);
        if (!plan.xpInToast) {
          noteShellToast('shell-xp');
          emit(() =>
            toast({
              id: 'shell-xp',
              title: `+${total} XP`,
              description: detail,
              icon: (
                <span className={styles.xpIcon}>
                  <Icon name="Zap" size={20} strokeWidth={2} />
                </span>
              ),
              duration: 3200,
            }),
          );
        }
      }
      for (const t of plan.toasts) emit(() => showToast(t));
      if (plan.modals.length > 0) {
        queue.current.push(...plan.modals);
        if (!activeRef.current) showNext();
      }
      if (plan.confetti && !shouldReduceMotion(state.prefs)) setConfetti((c) => ({ shot: c.shot + 1, intensity: plan.confetti ?? 'medium' }));
      if (plan.sound) playShellSound(plan.sound, state.prefs.sound.uiSounds);
      if (plan.heartsLeft !== null && !state.prefs.unlimitedHearts) {
        const left = plan.heartsLeft;
        setHeartFlash((h) => ({ shot: (h?.shot ?? 0) + 1, left }));
      }
    },
    [showNext, showToast, store],
  );

  useEffect(() => {
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      const events = buffer.current.splice(0);
      if (events.length > 0) apply(digest(events));
    };
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(flush, SETTLE_MS);
    };
    const stop = store.onAny((event) => {
      buffer.current.push(event);
      schedule();
    });
    // Events kept from an earlier run of this effect (development double-mount) still get shown.
    if (buffer.current.length > 0) schedule();
    return () => {
      stop();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [apply, store]);

  useEffect(() => {
    prepareShellSounds();
  }, []);

  return (
    <>
      <Celebration fire={confetti.shot} intensity={confetti.intensity} />
      {heartFlash && (
        <div key={heartFlash.shot} className={styles.heartFlash} role="status">
          <Icon name={heartFlash.left > 0 ? 'Heart' : 'HeartCrack'} size={18} strokeWidth={2} />
          <span>{heartFlash.left > 0 ? `${heartFlash.left} ${heartFlash.left === 1 ? 'heart' : 'hearts'} left` : 'No hearts left'}</span>
        </div>
      )}
      <Modal
        open={open}
        onClose={dismiss}
        title={active ? modalTitle(active) : 'Well done'}
        hideTitle
        size="sm"
        phone="center"
        footer={
          <Button variant="primary" size="lg" fullWidth data-autofocus onClick={dismiss}>
            {queue.current.length > 0 ? 'Next' : 'Keep going'}
          </Button>
        }
      >
        {active && <ModalBody modal={active} />}
      </Modal>
    </>
  );
}
