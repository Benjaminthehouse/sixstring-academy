import { useEffect, useRef, useState, type FormEvent } from 'react';
import { aiStatus, apiKeyHint, clearApiKey, hasApiKey, host, setApiKey, verifyApiKey, type AiStatus } from '@/core/platform';
import { setPrefs, usePrefs } from '@/core/progress';
import { Badge, Banner, Button, Spinner, Switch, TextField, confirmDialog, toast } from '@/ui';
import { keyCheckOutcome, type KeyCheck } from './model';
import styles from './Settings.module.css';

/** What the last check of the key found. The key itself is never kept in this component's state after it is saved. */
type Check = { state: 'idle' } | { state: 'checking' } | KeyCheck;

function Purpose() {
  return (
    <p className={styles.prose}>
      The AI helper reads photographed sheet music that the on-device reader cannot manage, and explains a mistake in plain words when you ask it to. It is optional: every lesson, tool and game works without it.
    </p>
  );
}

/** Inside Claude: nothing to set up, only to say that it is there and to switch it on or off. */
function BuiltIn() {
  const prefs = usePrefs();
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void aiStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className={styles.fields} data-ai="artifact" data-ai-available={status ? String(status.available) : undefined}>
      <Purpose />
      {status === null ? (
        <Spinner label="Checking what this view offers" />
      ) : status.available ? (
        <Banner tone="ok" icon="Sparkles" title="Built in">
          You are using the app inside Claude, so there is nothing to set up and no key to enter. Claude asks for your permission the first time a screen uses it, and what it answers counts toward your own Claude usage.
        </Banner>
      ) : status.reason === 'declined' ? (
        <Banner tone="neutral" icon="Info" title="Switched off for this visit">
          You said no when Claude asked, so the helper stays off. Reload the page if you change your mind. Everything else works as before.
        </Banner>
      ) : (
        <Banner tone="neutral" icon="Info" title="Not offered in this view">
          This copy of the app was shared without access to Claude, so the helper is not available here. Everything else works.
        </Banner>
      )}
      {status?.available && (
        <Switch label="Use the AI helper" description="When this is off, nothing is ever sent to Claude." checked={prefs.ai.enabled} onChange={(on) => setPrefs({ ai: { enabled: on } })} />
      )}
    </div>
  );
}

/** Standalone: the learner's own Anthropic API key, kept in this browser. */
function OwnKey() {
  const prefs = usePrefs();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(() => apiKeyHint());
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const verify = async (): Promise<void> => {
    setCheck({ state: 'checking' });
    const outcome = keyCheckOutcome(await verifyApiKey());
    // The stored key and the switch are dealt with even if the learner has left this screen
    // meanwhile: a key Anthropic rejects is of no use and must not stay saved.
    if (outcome.forget) clearApiKey();
    if (outcome.enabled !== null) setPrefs({ ai: { enabled: outcome.enabled } });
    if (!alive.current) return;
    if (outcome.forget) setHint(null);
    setCheck(outcome.check);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const saved = setApiKey(draft);
    if (!saved.ok) {
      setError(saved.message);
      return;
    }
    // From here on only the hint is shown: the field is emptied before anything else happens.
    setDraft('');
    setError(null);
    setHint(apiKeyHint());
    void verify();
  };

  const remove = async (): Promise<void> => {
    const sure = await confirmDialog({ title: 'Remove the API key?', description: 'The key is deleted from this browser and the AI helper is switched off. You can add a key again at any time.', confirmLabel: 'Remove the key', tone: 'danger' });
    if (!sure) return;
    clearApiKey();
    setHint(null);
    setCheck({ state: 'idle' });
    setPrefs({ ai: { enabled: false } });
    toast.ok('API key removed from this browser');
  };

  const stored = hint !== null && hasApiKey();

  return (
    <div className={styles.fields} data-ai="standalone" data-ai-key={stored ? 'stored' : 'none'}>
      <Purpose />
      <p className={styles.prose}>
        It works with your own Anthropic API key. <strong>The key is stored in this browser only and is sent only to Anthropic</strong> (api.anthropic.com), together with the question or picture you ask about. It never goes to us or to anyone else, and it is not
        part of a backup file. Anthropic bills what you use to your account.
      </p>

      {check.state === 'rejected' && (
        <div data-ai-problem="bad-key">
          <Banner tone="bad" title="That key was not accepted" live>
            {check.message}
          </Banner>
        </div>
      )}
      {check.state === 'unsure' && (
        <Banner tone="warn" title="The key is saved, but it could not be checked" live>
          {check.message}
        </Banner>
      )}
      {stored ? (
        <div className={styles.keyRow}>
          <div className={styles.keyText}>
            <p className={styles.fieldLabel}>Your API key</p>
            <p className={styles.keyHint} data-ai-hint="">
              {hint}
            </p>
          </div>
          <div className={styles.keyState}>
            {check.state === 'checking' && <Spinner size={18} label="Checking the key with Anthropic" />}
            {check.state === 'ok' && (
              <Badge tone="ok" icon="Check" size="md">
                Key works
              </Badge>
            )}
            {check.state === 'idle' && (
              <Badge tone="neutral" size="md">
                Saved
              </Badge>
            )}
            {check.state === 'unsure' && (
              <Badge tone="warn" icon="TriangleAlert" size="md">
                Not checked
              </Badge>
            )}
          </div>
          <div className={styles.keyButtons}>
            <Button size="sm" iconLeft="RefreshCw" disabled={check.state === 'checking'} onClick={() => void verify()}>
              Check it again
            </Button>
            <Button size="sm" variant="ghost" iconLeft="Trash2" onClick={() => void remove()} data-ai-remove="">
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <form className={styles.keyForm} onSubmit={submit} autoComplete="off" data-ai-form="">
          <TextField
            label="Anthropic API key"
            type="password"
            value={draft}
            onChange={(value) => {
              setDraft(value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
            hint="It starts with sk-ant- and is about a hundred characters long."
            mono
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="sixstring-api-key"
            data-1p-ignore=""
            data-lpignore="true"
          />
          <div>
            <Button type="submit" iconLeft="KeyRound" disabled={draft.trim().length === 0}>
              Save and check the key
            </Button>
          </div>
          <p className={styles.note}>
            No key yet? Create one in the{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer noopener">
              Anthropic Console
            </a>{' '}
            under API keys, then paste it here.
          </p>
        </form>
      )}

      <Switch
        label="Use the AI helper"
        description={stored ? 'When this is off, nothing is ever sent to Anthropic.' : 'Add a key first. Until then nothing is ever sent anywhere.'}
        checked={stored && prefs.ai.enabled}
        disabled={!stored}
        onChange={(on) => setPrefs({ ai: { enabled: on } })}
      />
    </div>
  );
}

/** The AI helper group of the settings: "built in" inside Claude, the learner's own key elsewhere. */
export function AiHelper() {
  return host() === 'artifact' ? <BuiltIn /> : <OwnKey />;
}
