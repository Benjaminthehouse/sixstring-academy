import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '../actions/Button';
import { Spinner } from '../feedback/Spinner';
import { useIsTouch } from '../hooks/useMediaQuery';
import { Icon, renderIcon, type IconSource } from '../icon/Icon';
import { formatBytes, partitionFiles } from '../util/accept';
import { cx } from '../util/cx';
import styles from './FileDrop.module.css';

/** Props for `<FileDrop>`. */
export interface FileDropProps {
  /** Called with the files that passed `accept` and `maxBytes` (never empty). */
  onFiles: (files: File[]) => void;
  /** Called with files that were dropped but refused. */
  onReject?: (files: File[]) => void;
  /** Same syntax as `<input accept>`: ".pdf,image/*,.gp5". Dropped files are checked against it too. */
  accept?: string;
  multiple?: boolean;
  /** Largest file allowed, in bytes. */
  maxBytes?: number;
  /** Offer a "Take a photo" button on touch devices: "environment" = rear camera, "user" = front. */
  capture?: 'environment' | 'user';
  /** Main line. Default "Drop a file here". */
  title?: ReactNode;
  /** Second line: say which formats work. */
  hint?: ReactNode;
  /** Label of the browse button. Default "Choose a file". */
  browseLabel?: string;
  /** Label of the camera button. Default "Take a photo". */
  captureLabel?: string;
  icon?: IconSource;
  /** One-row layout for tight places. */
  compact?: boolean;
  /** Shows a working line and blocks new files (while importing). Pass text to describe the work. */
  busy?: boolean | string;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop target with a browse button and, on phones, a camera button. Files are read by the
 * caller; nothing is uploaded anywhere.
 *   <FileDrop accept=".pdf,image/*,.gp,.gp5,.musicxml" capture="environment" onFiles={([f]) => importFile(f)}
 *     hint="PDF, photo, Guitar Pro or MusicXML" />
 */
export function FileDrop({ onFiles, onReject, accept, multiple, maxBytes, capture, title, hint, browseLabel, captureLabel = 'Take a photo', icon = 'Upload', compact, busy, disabled, className }: FileDropProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const touch = useIsTouch();
  const blocked = !!disabled || !!busy;

  const take = (list: FileList | File[] | null | undefined) => {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const pool = multiple ? files : files.slice(0, 1);
    const result = partitionFiles(pool, accept, maxBytes);
    if (result.rejected.length > 0) {
      const tooBig = maxBytes != null && result.rejected.some((f) => f.size > maxBytes);
      const names = result.rejected.map((f) => f.name).join(', ');
      setRejected(tooBig ? `${names} is larger than ${formatBytes(maxBytes!)}.` : `${names} is not a file type this can read.`);
      onReject?.(result.rejected);
    } else {
      setRejected(null);
    }
    if (result.accepted.length > 0) onFiles(result.accepted);
  };

  const onDragEnter = (e: DragEvent) => {
    if (blocked || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (blocked || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (!blocked) take(e.dataTransfer.files);
  };

  return (
    <div className={cx(styles.drop, compact && styles.compact, over && styles.over, disabled && styles.disabled, className)} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className={styles.intro}>
        <span className={styles.tile} aria-hidden="true">
          {renderIcon(icon, { size: 24 })}
        </span>
        <div className={styles.text}>
          <span id={`${id}-title`} className={styles.title}>
            {over ? 'Drop it here' : (title ?? (multiple ? 'Drop files here' : 'Drop a file here'))}
          </span>
          {hint != null && (
            <span id={`${id}-hint`} className={styles.hint}>
              {hint}
            </span>
          )}
        </div>
      </div>
      {busy ? (
        <div className={styles.busy} role="status">
          <Spinner size={18} tone="accent" />
          <span>{typeof busy === 'string' ? busy : 'Reading the file'}</span>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="secondary" iconLeft="FolderOpen" disabled={disabled} aria-describedby={hint != null ? `${id}-hint` : undefined} onClick={() => fileInput.current?.click()}>
            {browseLabel ?? (multiple ? 'Choose files' : 'Choose a file')}
          </Button>
          {capture && touch && (
            <Button variant="secondary" iconLeft="Camera" disabled={disabled} onClick={() => cameraInput.current?.click()}>
              {captureLabel}
            </Button>
          )}
        </div>
      )}
      {rejected && (
        <p className={styles.rejected} role="alert">
          <Icon name="CircleAlert" size="sm" />
          <span>{rejected}</span>
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        hidden
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      {capture && (
        <input
          ref={cameraInput}
          type="file"
          hidden
          tabIndex={-1}
          accept="image/*"
          capture={capture}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}
