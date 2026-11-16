/**
 * While the pages are read: the page being read, with its staves lit and a scan line passing over
 * it; each page's state (waiting, being read, done); one bar for the whole run; the sentence the
 * reader gives ("Reading tab staff 3 of 8"); and Cancel.
 */
import { Button, Icon, Page, ProgressBar, Spinner, Text, cx } from '@/ui';
import type { ScanState } from '../engine/useScan';
import { readingFraction } from '../model/pages';
import { StaffOverlay } from './StaffOverlay';
import styles from './Reading.module.css';

/** The reading view. */
export function Reading({ scan }: { scan: ScanState }) {
  const p = scan.progress;
  const pages = scan.pages.filter((x) => !x.look || x.look.kind !== 'not-music' || scan.pages.every((y) => y.look?.kind === 'not-music'));
  const total = Math.max(1, Math.min(p?.pages ?? pages.length, pages.length || 1));
  const current = Math.min(p?.page ?? 0, Math.max(0, pages.length - 1));
  const stageWords = p?.stage === 'words' ? 'Reading chord names and titles' : p?.stage === 'text' ? 'Reading the words' : 'Reading the music';
  const shown = pages.slice(0, total);
  const page = shown[current];
  return (
    <Page title="Reading your sheet" subtitle="A few seconds a page. Everything stays on this device." width="content">
      <div className={styles.layout} data-scan="reading">
        {page && (
          <div className={styles.stage} aria-hidden="true">
            <div className={styles.picture} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              <img src={page.url} alt="" className={styles.img} />
              {page.look && <StaffOverlay look={page.look} width={page.width} height={page.height} />}
              <span className={styles.beam} />
            </div>
          </div>
        )}
        <div className={styles.panel}>
          <div className={styles.head}>
            <Spinner size={22} tone="accent" />
            <div className={styles.headText}>
              <span className={styles.stageName}>{stageWords}</span>
              <Text size="sm" tone="muted" aria-live="polite">
                {p?.message ?? 'Getting the pages ready'}
              </Text>
            </div>
          </div>
          <ProgressBar aria-label="Reading" value={Math.round(readingFraction(p) * 100)} max={100} valueText="percent" tone="accent" />
          <ol className={styles.pages}>
            {shown.map((pg, i) => {
              const state = i < current || p?.stage === 'words' ? 'done' : i === current ? 'now' : 'wait';
              return (
                <li key={pg.id} className={cx(styles.page, styles[state])}>
                  <img src={pg.thumbUrl} alt="" className={styles.thumb} />
                  <span className={styles.label}>{pg.label}</span>
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
      </div>
    </Page>
  );
}
