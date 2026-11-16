import { useProgress } from '@/core/progress';
import { Banner, Button, LinkButton, useLocalState } from '@/ui';
import { useAccount } from './hooks';
import { SUGGESTION_KEY, lessonsDone, suggestSignIn } from './model';
import styles from './Account.module.css';

/**
 * A gentle, dismissible suggestion to sign in, once the learner has a few lessons behind them and
 * only where this copy offers accounts. Never a wall: "Not now" (or the cross) hides it for good on
 * this device. Any screen may show it; Me > Overview does.
 */
export function AccountSuggestion() {
  const account = useAccount();
  const lessons = useProgress((s) => lessonsDone(s.stats));
  const [dismissed, setDismissed] = useLocalState(SUGGESTION_KEY, false);
  if (!suggestSignIn({ phase: account.phase, lessons, dismissed })) return null;
  return (
    <div className={styles.suggestion} data-account-suggestion="">
      <Banner
        tone="tip"
        icon="Smartphone"
        title="Sign in to keep your progress on all your devices"
        onDismiss={() => setDismissed(true)}
        actions={
          <>
            <LinkButton size="sm" to="profile" params={['account']} iconRight="ArrowRight">
              Sign in
            </LinkButton>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          </>
        }
      >
        Practise on your phone and on your laptop with the same lessons, streak and songs. No password: just a code by email.
      </Banner>
    </div>
  );
}
