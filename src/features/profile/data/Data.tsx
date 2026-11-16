import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SONG_SYNC_LIMITS, canSaveFile, copyText, getSyncStatus, hasApiKey, host, isPersistent, readFileText, saveFile, subscribeSyncStatus, syncNow } from '@/core/platform';
import { getLearnerData } from '@/core/platform/storage-scope';
import { useSongList } from '@/core/library';
import {
  UNDO_SONG_BYTES,
  applyBackup,
  countLearnerData,
  createBackup,
  discardUndo,
  leaveNotice,
  pendingUndo,
  previewBackup,
  resetEverything,
  takeNotice,
  undoLastChange,
  useProgress,
  useProgressEvent,
  useProgressStore,
  type MergeStrategy,
} from '@/core/progress';
import { Banner, Button, Card, Checkbox, FileDrop, Icon, Modal, RadioGroup, Section, TextField, toast } from '@/ui';
import { dateTimeText, listText, plural, thousands, timeAgo } from '../format';
import {
  MAX_IMPORT_BYTES,
  RESET_WORD,
  SYNC_CARRIES,
  confirmsReset,
  dataDiffRows,
  dataImportNote,
  diffRows,
  exportFileName,
  importFailureText,
  includedLines,
  readBackup,
  rejectionReason,
  sizeText,
  songSyncText,
  staysLines,
  storageStatus,
  summarise,
  type DiffRow,
  type ReadFile,
} from './model';
import styles from './Data.module.css';

const TONE_ICON = { ok: 'ShieldCheck', warn: 'TriangleAlert', bad: 'ShieldAlert', info: 'Info', busy: 'RefreshCw' } as const;

/**
 * Reload so every screen reads the new data (features keep some of it in memory). A dialog that
 * has just closed steps history back by one (the kit's Back-closes-the-dialog entry), and a reload
 * started before that step lands is cancelled by it: so after a dialog, wait for the step first.
 */
function reloadApp(afterDialog = false): void {
  if (!afterDialog) {
    window.location.reload();
    return;
  }
  let started = false;
  const go = (): void => {
    if (started) return;
    started = true;
    window.removeEventListener('popstate', onStep);
    window.location.reload();
  };
  const onStep = (): void => {
    setTimeout(go, 0);
  };
  window.addEventListener('popstate', onStep);
  // A host that refuses history entries never steps back: reload anyway.
  setTimeout(go, 1000);
}

/** The learner data on this device, kept current while the screen is open. */
function useLearnerData() {
  const data = getLearnerData();
  const read = useCallback(() => data.snapshot(), [data]);
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => data.subscribe(() => setSnapshot(read())), [data, read]);
  return snapshot;
}

/** The learner's own songs: how many and how much room they take. */
function useMySongs(): { count: number; bytes: number; ids: Array<{ id: string; updatedAt: number }>; ready: boolean } {
  const { songs, ready } = useSongList();
  return useMemo(() => {
    const mine = songs.filter((s) => s.source === 'mine');
    return { count: mine.length, bytes: mine.reduce((n, s) => n + (s.bytes ?? 0), 0), ids: mine.map((s) => ({ id: s.id, updatedAt: s.updatedAt })), ready };
  }, [songs, ready]);
}

/** Offer to undo the last import or reset, as a toast with an Undo button. */
function offerUndo(title: string, description?: string): void {
  toast.ok(title, { description, duration: 12_000, action: { label: 'Undo', onClick: () => void runUndo() } });
}

async function runUndo(): Promise<void> {
  const result = await undoLastChange();
  if (!result.ok) {
    toast.warn('There is nothing to undo any more', { description: 'Undo is kept for half an hour after an import or a reset.' });
    return;
  }
  if (result.reload) {
    leaveNotice({ tone: 'ok', title: 'Undone: your data is back as it was', undo: false });
    reloadApp();
  } else toast.ok('Undone: your data is back as it was');
}

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
  const songs = offered ? songSyncText(sync.songs, SONG_SYNC_LIMITS) : null;
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
      {offered ? ` ${SYNC_CARRIES}` : ''}
      {songs ? (
        <span className={styles.statusSongs} data-sync-songs={sync.songs?.synced ? 'synced' : 'local'}>
          {songs}
        </span>
      ) : null}
    </StatusRow>
  );
}

/** What a backup holds, and what never leaves this device. */
function Included() {
  const state = useProgress((s) => s);
  const data = useLearnerData();
  const songs = useMySongs();
  const { lines, later } = useMemo(() => includedLines({ progress: summarise(state), counts: countLearnerData(data), songs: songs.ready ? songs : null }), [state, data, songs]);
  const stays = useMemo(() => staysLines({ hasApiKey: hasApiKey() }), []);
  return (
    <Card className={styles.included} data-card="included">
      <div className={styles.includedColumn}>
        <h3 className={styles.includedTitle}>In every backup</h3>
        <p className={styles.includedLead}>Export, Import and Reset all cover exactly this.</p>
        <ul className={styles.lines} data-included="">
          {lines.map((line) => (
            <li key={line.id} className={styles.line} data-line={line.id}>
              <span className={styles.lineIcon} aria-hidden="true">
                <Icon name={line.icon} size={18} />
              </span>
              <span className={styles.lineLabel}>{line.label}</span>
              <span className={styles.lineDetail}>{line.detail}</span>
            </li>
          ))}
        </ul>
        {later.length > 0 && (
          <p className={styles.later} data-included-later="">
            Also as soon as you have any: {listText(later)}.
          </p>
        )}
      </div>
      <div className={styles.includedColumn}>
        <h3 className={styles.includedTitle}>Stays on this device</h3>
        <p className={styles.includedLead}>Never in a backup and never synced.</p>
        <ul className={styles.lines} data-stays="">
          {stays.map((line) => (
            <li key={line.id} className={styles.line} data-line={line.id}>
              <span className={styles.lineIcon} aria-hidden="true">
                <Icon name={line.icon} size={18} />
              </span>
              <span className={styles.lineLabel}>{line.label}</span>
              <span className={styles.lineDetail}>{line.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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
      const result = await saveFile(file, JSON.stringify(await createBackup()), 'application/json');
      if (result.ok) toast.ok('Backup saved', { description: file });
      else if (result.reason !== 'declined') toast.error('The backup could not be saved', { description: result.message });
    } finally {
      setBusy(false);
    }
  };
  const copy = async (): Promise<void> => {
    setBusy(true);
    try {
      const ok = await copyText(JSON.stringify(await createBackup()));
      if (ok) toast.ok('Backup copied', { description: 'Paste it into a note or a file to keep it.' });
      else toast.error('Could not copy the backup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.action} data-card="export">
      <span className={styles.actionIcon} aria-hidden="true">
        <Icon name="Download" size={22} />
      </span>
      <div className={styles.actionText}>
        <h3 className={styles.actionTitle}>Export a backup</h3>
        <p className={styles.actionBody}>One file with everything listed above: your progress, practice journal, records, saved things, settings and your own songs. Keep it somewhere safe, or open it on another device with Import.</p>
        {!canSave && <p className={styles.actionNote}>Files cannot be saved in this view. Copy the backup as text instead and keep it in a note.</p>}
      </div>
      <div className={styles.actionButtons}>
        {canSave ? (
          <Button variant="primary" iconLeft="Download" loading={busy} onClick={save}>
            Export to a file
          </Button>
        ) : (
          <Button variant="primary" iconLeft="Copy" loading={busy} onClick={copy}>
            Copy backup as text
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The before/after table. */
function DiffTable({ rows, caption, name }: { rows: DiffRow[]; caption: string; name: string }) {
  return (
    <table className={styles.diff} data-import-preview={name}>
      <caption className="sr-only">{caption}</caption>
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
        {rows.map((row) => (
          <tr key={row.key} data-change={row.change} data-row={row.key}>
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
  );
}

function ImportCard() {
  const store = useProgressStore();
  const [file, setFile] = useState<{ read: ReadFile; name: string } | null>(null);
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>('newest-wins');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  // The local state changes while the dialog is open only if another tab writes; reading it per render is right.
  const local = useProgress((s) => s);
  const data = useLearnerData();
  const songs = useMySongs();
  const preview = useMemo(
    () => (file ? previewBackup(file.read.backup, { state: local, data, songs: songs.ready ? songs.ids : null }, strategy, store.now()) : null),
    [file, local, data, songs, strategy, store],
  );
  const progressRows = useMemo(() => (preview ? diffRows(summarise(preview.before), summarise(preview.after)) : []), [preview]);
  const otherRows = useMemo(() => (preview ? dataDiffRows(preview) : []), [preview]);
  const changed = [...progressRows, ...otherRows].filter((r) => r.change !== 'same').length + (preview?.dataChanges ?? 0);
  const loses = [...progressRows, ...otherRows].some((r) => r.change === 'down');

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
        setFile({ read, name: picked.name });
      } else setProblem({ title: read.title, description: read.description });
    } catch {
      setProblem(importFailureText('unreadable'));
    } finally {
      setReading(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const result = await applyBackup(file.read.backup, strategy);
      setFile(null);
      if (!result.ok) {
        setProblem(importFailureText(result.reason));
        return;
      }
      const title = strategy === 'replace' ? 'Backup imported: your data now matches the file' : 'Backup merged into your data';
      const notes: string[] = [];
      if (result.songs?.added.length) notes.push(`${plural(result.songs.added.length, 'song')} added`);
      const skippedSongs = result.songs?.skipped ?? 0;
      const skippedData = result.skipped.filter((s) => !/\d+ songs?$/.test(s)).length;
      if (skippedData + skippedSongs > 0) notes.push(`${plural(skippedData + skippedSongs, 'damaged entry was', 'damaged entries were')} left out`);
      if (result.failed.length) notes.push(`${plural(result.failed.length, 'part')} could not be stored: this device is full`);
      const description = notes.length ? `${listText(notes)}.` : undefined;
      if (result.reload) {
        leaveNotice({ tone: notes.length > 1 ? 'warn' : 'ok', title, description, undo: result.undo });
        reloadApp(true);
      } else if (result.undo) offerUndo(title, description);
      else toast.ok(title, { description });
    } catch {
      setFile(null);
      toast.error('The backup could not be imported', { description: 'Something went wrong part of the way. Reload the page: Your data then offers Undo to put back what was here.' });
    } finally {
      setBusy(false);
    }
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
            <Button variant={strategy === 'replace' && loses ? 'danger' : 'primary'} onClick={() => void confirm()} loading={busy} data-import-confirm="">
              {strategy === 'replace' ? 'Replace my data' : 'Merge'}
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
            <DiffTable rows={progressRows} caption="What the import would change in your progress" name={strategy} />
            {otherRows.length > 0 && (
              <div className={styles.previewGroup}>
                <h3 className={styles.previewHeading}>Everything else</h3>
                <DiffTable rows={otherRows} caption="What the import would change in your other data" name="data" />
              </div>
            )}
            <p className={styles.previewNote} data-import-note="">
              {dataImportNote(preview)}
            </p>
            {changed === 0 ? (
              <Banner tone="info" title="Nothing here would change">
                The backup holds the same as this device.
              </Banner>
            ) : loses ? (
              <Banner tone="warn" title="Some of your data here would be replaced by less">
                Choose Merge to keep the higher numbers and everything you have here. Either way, Undo afterwards brings today’s data back for half an hour.
              </Banner>
            ) : (
              <p className={styles.previewNote}>Your name and progress settings follow whichever side changed them last. You can undo the import for half an hour.</p>
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
  const [dropSongs, setDropSongs] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = useProgressStore();
  const state = useProgress((s) => s);
  const summary = useMemo(() => summarise(state), [state]);
  const data = useLearnerData();
  const counts = useMemo(() => countLearnerData(data), [data]);
  const songs = useMySongs();
  const name = state.profile.name;
  const keyKept = useMemo(() => (open ? hasApiKey() : false), [open]);

  const made = counts.items.filter((item) => item.count > 0).map((item) => `${item.label.toLowerCase()} (${plural(item.count, item.unit[0], item.unit[1])})`);
  const erased = [summary.xp > 0 ? `${thousands(summary.xp)} XP and level ${summary.level}` : 'your progress', 'your streak, gems, achievements, skills, review cards and practice log', ...made];
  if (!keep && counts.settings > 0) erased.push(`your ${plural(counts.settings, 'screen setting')}`);
  if (dropSongs && songs.count > 0) erased.push(`your ${plural(songs.count, 'song')}`);
  const kept = [...(songs.count > 0 && !dropSongs ? [`your ${plural(songs.count, 'own song')}`] : []), ...(keyKept ? ['your saved API key'] : []), 'what belongs to this device, such as notices you have seen'];
  const songsTooBig = songs.bytes > UNDO_SONG_BYTES;

  const close = (): void => {
    setOpen(false);
    setTyped('');
    setKeep(false);
    setDropSongs(false);
  };
  const backup = async (): Promise<void> => {
    const file = exportFileName(name, store.now());
    const result = await saveFile(file, JSON.stringify(await createBackup()), 'application/json');
    if (result.ok) toast.ok('Backup saved', { description: file });
    else if (result.reason !== 'declined') toast.error('The backup could not be saved', { description: result.message });
  };
  const erase = async (): Promise<void> => {
    if (!confirmsReset(typed) || busy) return;
    setBusy(true);
    try {
      const result = await resetEverything({ keepPrefs: keep, deleteSongs: dropSongs });
      close();
      const title = keep ? 'Progress erased. Your name and settings were kept' : 'Everything was erased. A fresh start';
      const description = result.songsDeleted > 0 && !result.songsUndoable ? 'Your songs were too large to keep a copy of, so Undo cannot bring them back.' : undefined;
      if (result.reload) {
        leaveNotice({ tone: 'ok', title, description, undo: result.undo });
        reloadApp(true);
      } else if (result.undo) offerUndo(title, description);
      else toast.ok(title, { description });
    } catch {
      close();
      toast.error('The reset did not finish', { description: 'Reload the page and look at Your data again; your backup file can bring everything back.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.action} data-card="reset">
      <span className={styles.actionIcon} data-tone="bad" aria-hidden="true">
        <Icon name="Trash2" size={22} />
      </span>
      <div className={styles.actionText}>
        <h3 className={styles.actionTitle}>Start over</h3>
        <p className={styles.actionBody}>Erase your progress and everything listed under “In every backup” on this device, and begin again from level 1. Your own songs stay unless you choose otherwise. You are asked to confirm first.</p>
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
            <Button onClick={close}>Keep my data</Button>
            <Button variant="danger" disabled={!confirmsReset(typed)} loading={busy} onClick={() => void erase()} data-reset-confirm="">
              Erase everything
            </Button>
          </>
        }
      >
        <div className={styles.reset}>
          <p data-reset-erases="">This erases {listText(erased)} on this device. Undo can bring it back for half an hour; after that only a backup file can.</p>
          <p className={styles.resetNote} data-reset-keeps="">
            Kept: {listText(kept)}.
          </p>
          <Button iconLeft="Download" onClick={backup}>
            Save a backup first
          </Button>
          <Checkbox label="Keep my name and settings" description="Only what you made or earned is erased: progress, journal, records and saved things. Bought cosmetics go with it." checked={keep} onChange={setKeep} />
          {songs.count > 0 && (
            <Checkbox
              label={`Also delete my ${plural(songs.count, 'song')}`}
              description={songsTooBig ? `They take ${sizeText(songs.bytes)}, too much to keep a copy of for Undo: save a backup first.` : 'Undo can bring them back too.'}
              checked={dropSongs}
              onChange={setDropSongs}
              data-reset-songs=""
            />
          )}
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
              if (event.key === 'Enter' && confirmsReset(typed)) void erase();
            }}
          />
        </div>
      </Modal>
    </Card>
  );
}

/** After a reload: the message the import, reset or undo left; on a later visit, the Undo that is still open. */
function UndoBanner() {
  const store = useProgressStore();
  const [undo, setUndo] = useState(() => pendingUndo());
  const [shownNotice, setShownNotice] = useState(false);
  useEffect(() => {
    const notice = takeNotice();
    if (!notice) return;
    setShownNotice(true);
    const canUndo = notice.undo && pendingUndo() !== null;
    if (canUndo) offerUndo(notice.title, notice.description);
    else if (notice.tone === 'warn') toast.warn(notice.title, { description: notice.description });
    else toast.ok(notice.title, { description: notice.description });
  }, []);
  if (!undo || shownNotice) return null;
  return (
    <Banner
      tone="info"
      title={undo.action === 'import' ? `You imported a backup ${timeAgo(undo.at, store.now())}` : `You reset your data ${timeAgo(undo.at, store.now())}`}
      onDismiss={() => {
        discardUndo();
        setUndo(null);
      }}
      actions={
        <Button size="sm" iconLeft="Undo2" onClick={() => void runUndo()} data-undo="">
          Undo
        </Button>
      }
    >
      Undo puts back what was there before, for half an hour after the change.
    </Banner>
  );
}

/**
 * Your data: where it is kept and whether saving works, cloud sync where the host offers it, what
 * a backup holds and what stays on this device, export to a file, import from a file with a
 * preview of what would change, and a reset behind a typed confirmation. Imports and resets can be
 * undone for half an hour.
 */
export default function DataScreen() {
  return (
    <div className={styles.screen}>
      <UndoBanner />
      <Section title="Where your data lives">
        <div className={styles.statuses}>
          <Storage />
          <CloudSync />
        </div>
      </Section>
      <Section title="What a backup holds">
        <Included />
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
