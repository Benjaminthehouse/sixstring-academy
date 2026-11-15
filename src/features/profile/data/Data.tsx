import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { canSaveFile, copyText, getSyncStatus, host, isPersistent, readFileText, saveFile, subscribeSyncStatus, syncNow } from '@/core/platform';
import { exportProgress, importProgress, resetProgress, useProgress, useProgressEvent, useProgressStore, type MergeStrategy, type ProgressExport } from '@/core/progress';
import { Banner, Button, Card, Checkbox, FileDrop, Icon, Modal, RadioGroup, Section, TextField, toast } from '@/ui';
import { dateTimeText, thousands, timeAgo } from '../format';
import { MAX_IMPORT_BYTES, RESET_WORD, confirmsReset, exportFileName, importFailureText, previewImport, readBackup, rejectionReason, storageStatus, summarise, type ReadFile } from './model';
import styles from './Data.module.css';

const TONE_ICON = { ok: 'ShieldCheck', warn: 'TriangleAlert', bad: 'ShieldAlert', info: 'Info', busy: 'RefreshCw' } as const;

/** A fact about where the data lives: an icon with a tone, a title, a sentence, and maybe a button. */
function StatusRow({ tone, title, children, action, name }: { tone: keyof typeof TONE_ICON; title: string; children: ReactNode; action?: ReactNode; name: string }) {
  return (
    <div className={styles.status} data-status={name} data-tone={tone}>
      <span className={styles.statusIcon} aria-hidden="true">
        <Icon name={TONE_ICON[tone]} size={22} />
      </span>
      <div className={styles.statusText}>
        <p className={styles.statusTitle}>{title}</p>
        <p className={styles.statusBody}>{children}</p>
      </div>
      {action && <div className={styles.statusAction}>{action}</div>}
    </div>
  );
}

function Storage() {
  const store = useProgressStore();
  const savedAt = useProgress((s) => s.meta.updatedAt);
  const [saveFailed, setSaveFailed] = useState(false);
  useProgressEvent('save-failed', () => setSaveFailed(true));
  // Probing storage writes a test key: do it once, not on every render.
  const persistent = useMemo(() => isPersistent(), []);
  const status = storageStatus({ persistent, saveFailed, report: store.loadReport, host: host(), savedAt });
  return (
    <StatusRow name="storage" tone={status.tone} title={status.title}>
      {status.text}
    </StatusRow>
  );
}

function CloudSync() {
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const store = useProgressStore();
  const [busy, setBusy] = useState(false);
  const offered = sync.state !== 'off';
  const tone = sync.state === 'synced' ? 'ok' : sync.state === 'error' ? 'warn' : sync.state === 'syncing' ? 'busy' : 'info';
  const title = sync.state === 'synced' ? 'Synced with your Claude account' : sync.state === 'syncing' ? 'Syncing' : sync.state === 'error' ? 'Cloud sync has a problem' : 'Cloud sync is off here';
  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await syncNow();
      const after = getSyncStatus();
      if (after.state === 'synced') toast.ok('Synced');
      else if (after.state === 'error') toast.warn('Could not sync right now', { description: after.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <StatusRow
      name="sync"
      tone={tone}
      title={title}
      action={
        offered ? (
          <Button size="sm" iconLeft="RefreshCw" loading={busy || sync.state === 'syncing'} onClick={run}>
            Sync now
          </Button>
        ) : undefined
      }
    >
      {sync.message}
      {offered && sync.lastSyncedAt ? ` Last synced ${timeAgo(sync.lastSyncedAt, store.now())}.` : ''}
      {offered && sync.pending ? ' Changes are waiting to be sent.' : ''}
    </StatusRow>
  );
}

function ExportCard() {
  const store = useProgressStore();
  const name = useProgress((s) => s.profile.name);
  const [canSave, setCanSave] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void canSaveFile('backup.json').then((ok) => {
      if (alive) setCanSave(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const file = exportFileName(name, store.now());
      const result = await saveFile(file, JSON.stringify(exportProgress()), 'application/json');
      if (result.ok) toast.ok('Backup saved', { description: file });
      else if (result.reason !== 'declined') toast.error('The backup could not be saved', { description: result.message });
    } finally {
      setBusy(false);
    }
  };
  const copy = async (): Promise<void> => {
    const ok = await copyText(JSON.stringify(exportProgress()));
    if (ok) toast.ok('Backup copied', { description: 'Paste it into a note or a file to keep it.' });
    else toast.error('Could not copy the backup');
  };

  return (
    <Card className={styles.action} data-card="export">
      <span className={styles.actionIcon} aria-hidden="true">
        <Icon name="Download" size={22} />
      </span>
      <div className={styles.actionText}>
        <h3 className={styles.actionTitle}>Export a backup</h3>
        <p className={styles.actionBody}>One small file with everything: XP, streak, skills, achievements, review cards and settings. Keep it somewhere safe, or open it on another device with Import.</p>
        {!canSave && <p className={styles.actionNote}>Files cannot be saved in this view. Copy the backup as text instead and keep it in a note.</p>}
      </div>
      <div className={styles.actionButtons}>
        {canSave ? (
          <Button variant="primary" iconLeft="Download" loading={busy} onClick={save}>
            Export to a file
          </Button>
        ) : (
          <Button variant="primary" iconLeft="Copy" onClick={copy}>
            Copy backup as text
          </Button>
        )}
      </div>
    </Card>
  );
}

function ImportCard() {
  const store = useProgressStore();
  const [file, setFile] = useState<{ read: ReadFile; name: string; text: string } | null>(null);
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>('newest-wins');
  const [reading, setReading] = useState(false);
  // The local state changes while the dialog is open only if another tab writes; reading it per render is right.
  const local = useProgress((s) => s);
  const preview = useMemo(() => (file ? previewImport(local, file.read.state, strategy, store.now()) : null), [file, local, strategy, store]);

  const take = async (picked: File): Promise<void> => {
    setProblem(null);
    if (picked.size > MAX_IMPORT_BYTES) {
      setProblem(importFailureText('too-large'));
      return;
    }
    setReading(true);
    try {
      const text = await readFileText(picked);
      const read = readBackup(text, { now: store.now(), timeZone: store.timeZone(), deviceId: store.getState().meta.deviceId });
      if (read.ok) {
        setStrategy('newest-wins');
        setFile({ read, name: picked.name, text });
      } else setProblem({ title: read.title, description: read.description });
    } catch {
      setProblem(importFailureText('unreadable'));
    } finally {
      setReading(false);
    }
  };

  const confirm = (): void => {
    if (!file) return;
    const before: ProgressExport = exportProgress();
    // The store reads the file's own text again (and migrates it if it is from an older version).
    const result = importProgress(file.text, strategy);
    setFile(null);
    if (!result.ok) {
      setProblem(importFailureText(result.reason));
      return;
    }
    toast.ok(strategy === 'replace' ? 'Backup imported: your progress now matches the file' : 'Backup merged into your progress', {
      action: { label: 'Undo', onClick: () => importProgress(before, 'replace') },
    });
  };

  return (
    <Card className={styles.action} data-card="import">
      <span className={styles.actionIcon} aria-hidden="true">
        <Icon name="Upload" size={22} />
      </span>
      <div className={styles.actionText}>
        <h3 className={styles.actionTitle}>Import a backup</h3>
        <p className={styles.actionBody}>Pick a file that Export saved. You see exactly what would change before anything does.</p>
      </div>
      <div className={styles.actionWide}>
        <FileDrop compact accept=".json,application/json,text/plain" maxBytes={MAX_IMPORT_BYTES} title="Drop a backup file here" hint="A .json file saved by Export" browseLabel="Choose a backup file" icon="FileUp" busy={reading ? 'Reading the backup' : false} onFiles={([first]) => void take(first)} onReject={(rejected) => setProblem(importFailureText(rejectionReason(rejected)))} />
        {problem && (
          <Banner tone="warn" title={problem.title} live onDismiss={() => setProblem(null)}>
            {problem.description} Nothing was changed.
          </Banner>
        )}
      </div>

      <Modal
        open={file !== null}
        onClose={() => setFile(null)}
        size="md"
        title="Import this backup?"
        description={file ? `${file.name}, saved ${dateTimeText(file.read.exportedAt)}.` : undefined}
        footer={
          <>
            <Button onClick={() => setFile(null)}>Cancel</Button>
            <Button variant={strategy === 'replace' && preview?.loses ? 'danger' : 'primary'} onClick={confirm} data-import-confirm="">
              {strategy === 'replace' ? 'Replace my progress' : 'Merge'}
            </Button>
          </>
        }
      >
        {file && preview && (
          <div className={styles.preview}>
            <RadioGroup
              label="How to import"
              variant="cards"
              minCardWidth="13rem"
              value={strategy}
              onChange={setStrategy}
              options={[
                { value: 'newest-wins', label: 'Merge', description: 'Keep the best of both: nothing you have here is lost.' },
                { value: 'replace', label: 'Replace', description: 'Make this device match the file exactly.' },
              ]}
            />
            <table className={styles.diff} data-import-preview={strategy}>
              <caption className="sr-only">What the import would change</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">What</span>
                  </th>
                  <th scope="col">Now</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.key} data-change={row.change}>
                    <th scope="row">{row.label}</th>
                    <td>{row.before}</td>
                    <td className={styles.after}>
                      {row.after}
                      {row.change === 'up' && <Icon name="ArrowUp" size={14} label="goes up" className={styles.up} />}
                      {row.change === 'down' && <Icon name="ArrowDown" size={14} label="goes down" className={styles.down} />}
                      {row.change === 'different' && <Icon name="Pencil" size={14} label="changes" className={styles.changed} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.changed === 0 ? (
              <Banner tone="info" title="Nothing here would change">
                The backup holds the same numbers as this device.
              </Banner>
            ) : preview.loses ? (
              <Banner tone="warn" title="Some of your progress here would be replaced by lower numbers">
                Choose Merge to keep the higher ones. Either way, one tap on Undo afterwards brings today’s progress back.
              </Banner>
            ) : (
              <p className={styles.previewNote}>Settings and your name follow whichever side changed them last. You can undo the import straight after.</p>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function ResetCard() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [keep, setKeep] = useState(false);
  const store = useProgressStore();
  const state = useProgress((s) => s);
  const summary = useMemo(() => summarise(state), [state]);
  const name = state.profile.name;

  const close = (): void => {
    setOpen(false);
    setTyped('');
    setKeep(false);
  };
  const backup = async (): Promise<void> => {
    const file = exportFileName(name, store.now());
    const result = await saveFile(file, JSON.stringify(exportProgress()), 'application/json');
    if (result.ok) toast.ok('Backup saved', { description: file });
    else if (result.reason !== 'declined') toast.error('The backup could not be saved', { description: result.message });
  };
  const erase = (): void => {
    if (!confirmsReset(typed)) return;
    const before: ProgressExport = exportProgress();
    resetProgress({ keepPrefs: keep });
    close();
    toast.ok(keep ? 'Progress erased. Your name and settings were kept' : 'Everything was erased. A fresh start', {
      duration: 12_000,
      action: { label: 'Undo', onClick: () => importProgress(before, 'replace') },
    });
  };

  return (
    <Card className={styles.action} data-card="reset">
      <span className={styles.actionIcon} data-tone="bad" aria-hidden="true">
        <Icon name="Trash2" size={22} />
      </span>
      <div className={styles.actionText}>
        <h3 className={styles.actionTitle}>Start over</h3>
        <p className={styles.actionBody}>Erase all progress on this device and begin again from level 1. You are asked to confirm first.</p>
      </div>
      <div className={styles.actionButtons}>
        <Button iconLeft="Trash2" onClick={() => setOpen(true)}>
          Reset everything
        </Button>
      </div>

      <Modal
        open={open}
        onClose={close}
        size="sm"
        title="Erase everything?"
        footer={
          <>
            <Button onClick={close}>Keep my progress</Button>
            <Button variant="danger" disabled={!confirmsReset(typed)} onClick={erase} data-reset-confirm="">
              Erase everything
            </Button>
          </>
        }
      >
        <div className={styles.reset}>
          <p>
            This erases {summary.xp > 0 ? `${thousands(summary.xp)} XP, level ${summary.level}, ` : ''}
            your streak, gems, achievements, skills, review cards and practice log on this device. It cannot be brought back without a backup file.
          </p>
          <p className={styles.resetNote}>A saved API key is not part of your progress and stays where it is. Remove it under Settings, AI helper.</p>
          <Button iconLeft="Download" onClick={backup}>
            Save a backup first
          </Button>
          <Checkbox label="Keep my name and settings" description="Only the progress is erased. Bought cosmetics go with it." checked={keep} onChange={setKeep} />
          <TextField
            label={`Type ${RESET_WORD} to confirm`}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            mono
            data-autofocus
            data-reset-input=""
            onKeyDown={(event) => {
              if (event.key === 'Enter' && confirmsReset(typed)) erase();
            }}
          />
        </div>
      </Modal>
    </Card>
  );
}

/**
 * Your data: where progress is kept and whether saving works, cloud sync where the host offers
 * it, export to a file, import from a file with a preview of what would change, and a reset
 * behind a typed confirmation. Imports and resets can be undone straight afterwards.
 */
export default function DataScreen() {
  return (
    <div className={styles.screen}>
      <Section title="Where your progress lives">
        <div className={styles.statuses}>
          <Storage />
          <CloudSync />
        </div>
      </Section>
      <Section title="Back up and move">
        <ExportCard />
        <ImportCard />
      </Section>
      <Section title="Reset">
        <ResetCard />
      </Section>
    </div>
  );
}
