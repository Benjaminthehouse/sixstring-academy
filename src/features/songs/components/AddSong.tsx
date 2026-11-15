/**
 * "Add a song": choose or drop a file, paste text tab / a chord sheet / ChordPro, type SixTab, or
 * go to the scanner for a photo or PDF. One sheet with two views (choose, paste).
 */
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Divider, FileDrop, Icon, Sheet, Stack, Text, TextArea, TextField, cx, useIsTouch } from '@/ui';
import { href } from '@/app/router';
import { MAX_IMPORT_BYTES, type LibraryStatus } from '@/core/library';
import { SONG_FILE_ACCEPT } from '@/core/song';
import { SIXTAB_TEMPLATE, pasteHint } from '../format';
import styles from './AddSong.module.css';

/** Which view of the sheet is open. */
export type AddMode = 'choose' | 'paste';

/** Props of `AddSongSheet`. */
export interface AddSongSheetProps {
  open: boolean;
  mode: AddMode;
  onMode: (mode: AddMode) => void;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onPaste: (text: string, title: string) => void;
  /** Text to start the paste view with (a paste on the page, the template). */
  pasteSeed?: string | null;
  /** What is being done right now ("Reading riff.gp…"). */
  busy?: string | null;
  status?: LibraryStatus | null;
}

/** The add-a-song sheet. */
export function AddSongSheet({ open, mode, onMode, onClose, onFiles, onPaste, pasteSeed, busy, status }: AddSongSheetProps) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const hintId = useId();
  useEffect(() => {
    if (open && mode === 'paste' && pasteSeed != null) setText(pasteSeed);
  }, [open, mode, pasteSeed]);
  useEffect(() => {
    if (!open) {
      setText('');
      setTitle('');
    }
  }, [open]);
  const touch = useIsTouch();
  const hint = pasteHint(text);
  const temporary = status && !status.persistent;

  const footer =
    mode === 'paste' ? (
      <>
        <Button variant="ghost" iconLeft="ArrowLeft" onClick={() => onMode('choose')}>
          Back
        </Button>
        <Button variant="primary" iconLeft="Plus" disabled={!hint.ok} loading={!!busy} onClick={() => onPaste(text, title)}>
          Add song
        </Button>
      </>
    ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'paste' ? 'Paste tab or chords' : 'Add a song'} footer={footer} size="md">
      {temporary && (
        <Banner tone="warn" title="Songs you add stay only until you close this tab">
          This browser is not letting the app keep data, so imported songs cannot be saved for next time.
        </Banner>
      )}
      {mode === 'choose' ? (
        <Stack gap={4} data-add-sheet="choose">
          <FileDrop
            // Phones grey out files whose type they do not know (.gp, .sixtab): let any file through
            // there; the library says plainly what it cannot read.
            accept={touch ? undefined : SONG_FILE_ACCEPT}
            multiple
            maxBytes={MAX_IMPORT_BYTES}
            icon="FileMusic"
            title={touch ? 'Choose a song file' : 'Drop a song file here'}
            hint="Guitar Pro, MusicXML, MIDI, text tab, ChordPro or SixTab, up to 20 MB"
            browseLabel="Choose a file"
            busy={busy ?? false}
            onFiles={onFiles}
            onReject={onFiles}
          />
          <Divider label="or" />
          <ul className={styles.options}>
            <li>
              <button type="button" className={styles.option} onClick={() => onMode('paste')} data-autofocus>
                <span className={styles.optionIcon}>
                  <Icon name="FileText" />
                </span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>Paste tab or chords</span>
                  <span className={styles.optionHint}>Text tab from a website, a chord sheet or ChordPro</span>
                </span>
                <Icon name="ChevronRight" size="sm" className={styles.chevron} />
              </button>
            </li>
            <li>
              <button
                type="button"
                className={styles.option}
                onClick={() => {
                  setText(SIXTAB_TEMPLATE);
                  onMode('paste');
                }}
              >
                <span className={styles.optionIcon}>
                  <Icon name="Pencil" />
                </span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>Write a song</span>
                  <span className={styles.optionHint}>Type notes and chords in SixTab, starting from an example</span>
                </span>
                <Icon name="ChevronRight" size="sm" className={styles.chevron} />
              </button>
            </li>
            <li>
              <a className={styles.option} href={href('scan')}>
                <span className={styles.optionIcon}>
                  <Icon name="ScanLine" />
                </span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>Scan a sheet</span>
                  <span className={styles.optionHint}>A photo or PDF of printed tab or notation</span>
                </span>
                <Icon name="ChevronRight" size="sm" className={styles.chevron} />
              </a>
            </li>
          </ul>
        </Stack>
      ) : (
        <Stack gap={4} data-add-sheet="paste">
          <TextArea
            label="Tab, chords or SixTab"
            value={text}
            onChange={setText}
            rows={10}
            mono
            autoGrow
            aria-describedby={hintId}
            placeholder={'e|-----0---3---|\nB|---1-------0-|\n...'}
            data-autofocus
            className={styles.paste}
          />
          <p id={hintId} className={cx(styles.detect, hint.ok && styles.detectOk)} aria-live="polite">
            <Icon name={hint.ok ? 'CircleCheck' : 'Info'} size="sm" />
            {hint.text}
          </p>
          <TextField label="Title" optional value={title} onChange={setTitle} hint="Leave it empty to use the title in the text." />
          {!touch && (
            <Text size="sm" tone="muted">
              Tip: you can also paste straight onto the Songs page, or drop a file on it.
            </Text>
          )}
        </Stack>
      )}
    </Sheet>
  );
}
