/**
 * While the pages are read: each page with its own state (waiting, being read, done), one bar for
 * the whole run, the sentence the reader gives ("Reading tab staff 3 of 8"), and Cancel.
 */
import { Button, Icon, Page, ProgressBar, Spinner, Text, cx } from '@/ui';
import type { ScanState } from '../engine/useScan';
import styles from './Reading.module.css';

/** The reading view. */
export function Reading({ scan }: { scan: ScanState }) {
  const p = scan.progress;
  const pages = scan.pages;
  const total = Math.max(1, p?.pages ?? pages.length);
  const current = p?.page ?? 0;
  const stageWords = p?.stage === 'words' ? 'Reading chord names and titles' : p?.stage === 'text' ? 'Reading the words' : 'Reading the music';
  const shown = pages.slice(0, Math.max(total, 1));
  return (
    <Page title="Reading your sheet" subtitle="This takes a few seconds a page. Everything stays on this device." width="prose">
      <div className={styles.panel} data-scan="reading">
        <div className={styles.head}>
          <Spinner size={22} tone="accent" />
          <div className={styles.headText}>
            <span className={styles.stage}>{stageWords}</span>
            <Text size="sm" tone="muted" aria-live="polite">
              {p?.message ?? 'Getting the pages ready'}
            </Text>
          </div>
        </div>
        <ProgressBar aria-label="Reading" value={Math.round((p?.fraction ?? 0) * 100)} max={100} valueText="percent" tone="accent" />
        <ol className={styles.pages}>
          {shown.map((page, i) => {
            const state = i < current || p?.stage === 'words' ? 'done' : i === current ? 'now' : 'wait';
            return (
              <li key={page.id} className={cx(styles.page, styles[state])}>
                <img src={page.thumbUrl} alt="" className={styles.thumb} />
                <span className={styles.label}>{page.label}</span>
                <span className={styles.state}>
                  {state === 'done' ? (
                    <>
                      <Icon name="CircleCheck" size="sm" /> Read
                    </>
                  ) : state === 'now' ? (
                    <>
                      <Spinner size={14} /> Reading
                    </>
                  ) : (
                    'Waiting'
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <div className={styles.actions}>
          <Button iconLeft="X" onClick={scan.cancel} data-scan-cancel="">
            Cancel
          </Button>
        </div>
      </div>
    </Page>
  );
}
