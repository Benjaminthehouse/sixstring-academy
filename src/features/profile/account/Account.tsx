import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SONG_SYNC_LIMITS } from '@/core/platform';
import { codeDigits, getAccounts, type AccountState } from '@/core/platform/cloud';
import { useProgressStore } from '@/core/progress';
import { Banner, Button, Icon, LinkButton, Modal, RadioGroup, Section, Skeleton, TextField, toast } from '@/ui';
import { SYNC_CARRIES, songSyncText } from '../data/model';
import { useAccount, useNow, useSyncAction, useSyncStatus } from './hooks';
import { clock, noticeView, resendWait, syncView, unavailableText } from './model';
import styles from './Account.module.css';

const TONE_ICON = { ok: 'ShieldCheck', warn: 'TriangleAlert', bad: 'ShieldAlert', info: 'Info', busy: 'RefreshCw' } as const;
const CODE_LENGTH = 6;

/** A phone and a laptop with the sync arrows between them: what an account is for, at a glance. */
function Devices() {
  return (
    <div className={styles.devices} aria-hidden="true">
      <span className={styles.device}>
        <Icon name="Smartphone" size={28} />
      </span>
      <span className={styles.link}>
        <Icon name="RefreshCw" size={20} />
      </span>
      <span className={styles.device}>
        <Icon name="Laptop" size={28} />
      </span>
    </div>
  );
}

/** Something that happened to the account, said once. */
function Notice({ account }: { account: AccountState }) {
  const view = noticeView(account.notice);
  if (!view) return null;
  return (
    <div data-account-notice={account.notice ?? ''}>
      <Banner tone={view.tone} title={view.title} live onDismiss={() => getAccounts().clearNotice()}>
        {view.text}
      </Banner>
    </div>
  );
}

/** Where sync stands, with the one button that helps right now. */
export function SyncPanel() {
  const sync = useSyncStatus();
  const store = useProgressStore();
  useNow(30_000);
  const view = syncView(sync, store.now());
  const { busy, run } = useSyncAction();
  const songs = sync.state === 'off' ? null : songSyncText(sync.songs, SONG_SYNC_LIMITS);
  return (
    <div className={styles.status} data-status="account-sync" data-tone={view.tone} data-sync-state={sync.state}>
      <span className={styles.statusIcon} aria-hidden="true">
        <Icon name={sync.state === 'offline' ? 'WifiOff' : TONE_ICON[view.tone]} size={22} />
      </span>
      <div className={styles.statusText} aria-live="polite">
        <p className={styles.statusTitle}>{view.title}</p>
        <p className={styles.statusBody}>
          {view.text}
          {songs ? <span className={styles.statusSongs}>{songs}</span> : null}
        </p>
      </div>
      {(view.action === 'sync-now' || view.action === 'retry') && (
        <div className={styles.statusAction}>
          <Button size="sm" iconLeft={view.action === 'retry' ? 'RotateCw' : 'RefreshCw'} loading={busy || sync.state === 'syncing'} onClick={() => void run(view.action)} data-sync-action={view.action}>
            {view.action === 'retry' ? 'Try again' : 'Sync now'}
          </Button>
        </div>
      )}
    </div>
  );
}

function EmailStep({ account }: { account: AccountState }) {
  const [email, setEmail] = useState(account.email ?? '');
  const sending = account.busy === 'sending';
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!sending) void getAccounts().sendCode(email);
  };
  return (
    <form className={styles.form} onSubmit={submit} data-account-form="email" noValidate>
      <TextField
        label="Your email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="send"
        size="lg"
        value={email}
        onChange={(value) => {
          setEmail(value);
          if (account.error) getAccounts().clearError();
        }}
        error={account.error ? account.error.message : undefined}
        data-account-email-input=""
      />
      <Button type="submit" variant="primary" size="lg" iconLeft="Send" loading={sending} wrap>
        Email me a code
      </Button>
    </form>
  );
}

function CodeStep({ account }: { account: AccountState }) {
  const [code, setCode] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const now = useNow(1000);
  const wait = resendWait(account.sentAt, now, account.error?.kind === 'wait' ? account.error.retryInSec : undefined);
  const verifying = account.busy === 'verifying';
  const sending = account.busy === 'sending';

  useEffect(() => {
    input.current?.focus();
  }, []);

  const verify = (value: string): void => {
    if (!verifying) void getAccounts().verifyCode(value).then((ok) => {
      if (ok) toast.ok('Signed in', { description: 'Your progress now syncs with your account.' });
      else setCode('');
    });
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    verify(code);
  };
  const resend = (): void => {
    if (account.email && !sending) void getAccounts().sendCode(account.email).then((ok) => ok && toast.ok('A new code is on its way'));
  };
  // A "wait" answer is not a mistake: it just says the last code is still the one to type.
  const problem = account.error && account.error.kind !== 'wait' ? account.error.message : undefined;

  return (
    <>
      <p className={styles.lead}>
        We sent a {CODE_LENGTH}-digit code to <strong className={styles.address} data-account-sent-to="">{account.email}</strong>. Type it here to sign in on this device.
      </p>
      <form className={styles.form} onSubmit={submit} data-account-form="code" noValidate>
        <TextField
          ref={input}
          label={`${CODE_LENGTH}-digit code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="go"
          maxLength={14}
          mono
          size="lg"
          value={code}
          onChange={(value) => {
            setCode(value);
            if (account.error) getAccounts().clearError();
            // A full code signs in at once (also when pasted or filled in from the email).
            if (codeDigits(value).length === CODE_LENGTH && codeDigits(code).length < CODE_LENGTH && /^\d+$/.test(codeDigits(value))) verify(value);
          }}
          hint="It can take a minute to arrive; look in your spam folder too. The code works for an hour."
          error={problem}
          data-account-code-input=""
        />
        <Button type="submit" variant="primary" size="lg" iconLeft="LogIn" loading={verifying} wrap>
          Sign in
        </Button>
      </form>
      <div className={styles.secondary}>
        <Button variant="ghost" size="sm" iconLeft="Send" disabled={wait > 0 || sending} loading={sending} onClick={resend} wrap data-account-resend="">
          {wait > 0 ? `Send a new code in ${clock(wait)}` : 'Send a new code'}
        </Button>
        <Button variant="ghost" size="sm" iconLeft="Pencil" onClick={() => getAccounts().changeEmail()} wrap>
          Use a different email
        </Button>
      </div>
    </>
  );
}

function SignIn({ account }: { account: AccountState }) {
  const codeSent = account.phase === 'code-sent';
  return (
    <section className={styles.hero} aria-labelledby="account-title" data-account-step={codeSent ? 'code' : 'email'}>
      <Devices />
      <h2 className={styles.heroTitle} id="account-title">
        {codeSent ? 'Check your email' : 'Your progress on all your devices'}
      </h2>
      {codeSent ? (
        <CodeStep account={account} />
      ) : (
        <>
          <p className={styles.lead}>Sign in with the same email on your phone and your laptop, and your lessons, streak, journal and songs follow you.</p>
          <EmailStep account={account} />
          <ul className={styles.points}>
            <li>
              <Icon name="KeyRound" size={18} />
              <span>No password to remember: we email you a {CODE_LENGTH}-digit code.</span>
            </li>
            <li>
              <Icon name="ShieldCheck" size={18} />
              <span>What is on this device now is joined with your account, never wiped.</span>
            </li>
            <li>
              <Icon name="Smartphone" size={18} />
              <span>Everything works without an account too.</span>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

function SignOutDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account: AccountState }) {
  const [choice, setChoice] = useState<'keep' | 'remove'>('keep');
  const busy = account.busy === 'signing-out';
  const unsynced = account.error?.kind === 'unsynced';
  const close = (): void => {
    if (busy) return;
    getAccounts().clearError();
    setChoice('keep');
    onClose();
  };
  const confirm = async (): Promise<void> => {
    const ok = await getAccounts().signOut({ removeLocal: choice === 'remove' });
    if (ok && choice === 'keep') {
      onClose();
      toast.ok('Signed out', { description: 'Your progress stays on this device.' });
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="Sign out of this device?"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Stay signed in
          </Button>
          <Button variant={choice === 'remove' ? 'danger' : 'primary'} loading={busy} onClick={() => void confirm()} data-account-signout-confirm="">
            {choice === 'remove' ? 'Sign out and remove' : 'Sign out'}
          </Button>
        </>
      }
    >
      <div className={styles.dialog}>
        <RadioGroup
          label="Your progress on this device"
          variant="cards"
          value={choice}
          onChange={(value) => {
            setChoice(value);
            getAccounts().clearError();
          }}
          options={[
            { value: 'keep', label: 'Keep it on this device', description: 'It stays here and stops syncing. Signing in again later carries on.' },
            { value: 'remove', label: 'Remove it from this device', description: 'For a borrowed or shared device. It stays safe in your account; this device starts fresh.' },
          ]}
        />
        {unsynced && (
          <Banner tone="warn" title="Not everything has reached the cloud yet" live>
            {account.error?.message}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

function DeleteDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account: AccountState }) {
  const busy = account.busy === 'deleting';
  const failed = account.error && account.error.kind !== 'unsynced' ? account.error.message : null;
  const close = (): void => {
    if (busy) return;
    getAccounts().clearError();
    onClose();
  };
  const confirm = async (): Promise<void> => {
    const ok = await getAccounts().deleteCloudData();
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="Delete your cloud data?"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Keep my cloud data
          </Button>
          <Button variant="danger" iconLeft="Trash2" loading={busy} onClick={() => void confirm()} data-account-delete-confirm="">
            Delete cloud data
          </Button>
        </>
      }
    >
      <div className={styles.dialog}>
        <p>This deletes your progress, practice journal, settings and songs from the cloud, and signs you out on every device.</p>
        <p className={styles.note}>Everything on this device stays here. Your other devices keep what they have, but stop syncing. You can sign in again at any time to start a fresh cloud copy.</p>
        <p className={styles.note}>Your sign-in itself (just your email address) stays with whoever runs this copy of the app; ask them to remove it in Supabase if you want it gone too.</p>
        {failed && (
          <Banner tone="warn" title="Nothing was deleted" live>
            {failed}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

function SignedIn({ account }: { account: AccountState }) {
  const [dialog, setDialog] = useState<'sign-out' | 'delete' | null>(null);
  return (
    <>
      <section className={styles.who} aria-label="Who is signed in" data-account-who="">
        <span className={styles.whoIcon} aria-hidden="true">
          <Icon name="User" size={24} />
        </span>
        <div className={styles.whoText}>
          <p className={styles.whoLabel}>Signed in as</p>
          <p className={styles.whoEmail} data-account-email="">
            {account.email ?? 'your account'}
          </p>
          <p className={styles.note}>Sign in with the same email on your other devices, and they all share one progress.</p>
        </div>
      </section>
      <Section title="Sync">
        <SyncPanel />
        <p className={styles.note}>{SYNC_CARRIES} Recordings stay on the device that made them.</p>
      </Section>
      <Section title="Leave">
        <div className={styles.leave}>
          <div className={styles.leaveRow}>
            <div className={styles.leaveText}>
              <h3 className={styles.leaveTitle}>Sign out of this device</h3>
              <p className={styles.note}>Choose whether your progress stays here.</p>
            </div>
            <Button iconLeft="LogOut" onClick={() => setDialog('sign-out')} data-account-signout="">
              Sign out
            </Button>
          </div>
          <div className={styles.leaveRow}>
            <div className={styles.leaveText}>
              <h3 className={styles.leaveTitle}>Delete my cloud data</h3>
              <p className={styles.note}>Removes your copy from the cloud and signs out everywhere. This device keeps its progress.</p>
            </div>
            <Button iconLeft="Trash2" onClick={() => setDialog('delete')} data-account-delete="">
              Delete cloud data
            </Button>
          </div>
        </div>
      </Section>
      <SignOutDialog open={dialog === 'sign-out'} onClose={() => setDialog(null)} account={account} />
      <DeleteDialog open={dialog === 'delete'} onClose={() => setDialog(null)} account={account} />
    </>
  );
}

/**
 * Me > Account: sign in with an email code, see who is signed in and how sync stands, sync now,
 * sign out (keeping or removing this device's progress), delete the cloud data. Where this copy
 * offers no accounts it says so in one line; inside Claude it shows the Claude sync instead.
 */
export default function AccountScreen() {
  const account = useAccount();
  return (
    <div className={styles.screen} data-account={account.phase}>
      <Notice account={account} />
      {account.phase === 'starting' && (
        <div className={styles.loading} aria-busy="true">
          <span className="sr-only" role="status">
            Loading
          </span>
          <Skeleton variant="block" height={160} />
        </div>
      )}
      {account.phase === 'unavailable' && (
        <>
          <p className={styles.unavailable} data-account-unavailable={account.unavailable ?? ''}>
            {unavailableText(account.unavailable)}
          </p>
          {account.unavailable === 'artifact' ? (
            <SyncPanel />
          ) : (
            <div>
              <LinkButton to="profile" params={['data']} iconRight="ArrowRight">
                Your data
              </LinkButton>
            </div>
          )}
        </>
      )}
      {(account.phase === 'signed-out' || account.phase === 'code-sent') && <SignIn account={account} />}
      {account.phase === 'signed-in' && <SignedIn account={account} />}
    </div>
  );
}
