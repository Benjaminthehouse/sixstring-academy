/**
 * The small "session in progress" bar shown on every screen except the practice screen itself:
 * the block, the time left, pause and next, and a link back to the runner. Mounted once by the app
 * shell (lazily, inside its own error boundary). While it shows it keeps the screen awake and lifts
 * the screen's own sticky bars above it (see the global rules in its stylesheet).
 */
import { href, useRoute } from '@/app/router';
import { Icon, IconButton, ProgressRing, useWakeLock } from '@/ui';
import { AREA_INFO } from './model/areas';
import { formatDuration } from './model/journal';
import { dismissPractice, nextPracticeBlock, togglePractice, useSession } from './session/controller';
import styles from './SessionBar.module.css';

/** The global session bar (default export: the shell loads it lazily). */
export default function SessionBar() {
  const route = useRoute();
  const view = useSession();
  const visible = !!view && route.name !== 'practice';
  useWakeLock(visible && view?.state.status === 'running');
  if (!visible || !view) return null;

  const s = view.state;
  const back = href('practice', 'session');

  if (s.status === 'finished') {
    return (
      <div className={styles.bar} data-practice-bar="finished" role="region" aria-label="Practice session">
        <a className={styles.main} href={back} data-practice-bar-link="">
          <span className={styles.doneIcon} aria-hidden="true">
            <Icon name="CircleCheck" size={22} strokeWidth={2} />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>Session complete</span>
            <span className={styles.meta}>{s.result?.saved ? `+${s.result.xp} XP · see your summary` : 'See your summary'}</span>
          </span>
        </a>
        <IconButton icon="X" label="Dismiss" onClick={dismissPractice} className={styles.button} />
      </div>
    );
  }

  const block = view.block;
  if (!block) return null;
  const running = s.status === 'running';
  const elapsed = Math.max(0, view.blockSec - view.remainingSec);
  const label = `${running ? '' : 'Paused. '}${block.title}, ${formatDuration(view.remainingSec)} left. Back to your practice session`;

  return (
    <div className={styles.bar} data-practice-bar={running ? 'running' : 'paused'} role="region" aria-label="Practice session">
      <a className={styles.main} href={back} aria-label={label} data-practice-bar-link="">
        <span className={styles.ring} aria-hidden="true">
          <ProgressRing value={elapsed} max={Math.max(1, view.blockSec)} size={40} thickness={4} tone={running ? 'accent' : 'neutral'} label="Block progress">
            <Icon name={AREA_INFO[block.area].icon} size={16} strokeWidth={2} />
          </ProgressRing>
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{block.title}</span>
          <span className={styles.meta}>
            <span className={styles.time} data-practice-bar-time="">
              {formatDuration(view.remainingSec)}
            </span>{' '}
            {running ? 'left' : 'paused'} · {s.index + 1} of {s.blocks.length}
          </span>
        </span>
      </a>
      <IconButton icon={running ? 'Pause' : 'Play'} label={running ? 'Pause the session' : 'Resume the session'} onClick={togglePractice} className={styles.button} variant="secondary" round data-practice-bar-toggle="" />
      <IconButton icon="SkipForward" label={s.index + 1 < s.blocks.length ? 'Next block' : 'Finish the session'} onClick={nextPracticeBlock} className={styles.button} round data-practice-bar-next="" />
    </div>
  );
}
