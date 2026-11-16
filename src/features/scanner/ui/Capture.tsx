/**
 * The first view: bring the sheet in (take a photo, choose photos or a PDF, drop them, paste a
 * picture or text, or try the sample), see what the quick look found on each page, put the pages
 * in order, and read them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionBar, Badge, Banner, Button, Icon, IconButton, Menu, Page, Sheet, Spinner, Stack, Text, TextArea, TextField, confirmDialog, cx, toast, useEventListener, useIsMobile, useIsTouch, useMediaQuery } from '@/ui';
import { attachDropZone, onPasteImage, pickFile } from '@/core/platform';
import { detectTextFormat } from '@/core/song';
import type { ScanState, Page as ScanPageT } from '../engine/useScan';
import { kindLabel } from '../model/pages';
import sampleUrl from '../assets/sample-ode-to-joy.png?url';
import { CaptureTips } from './Tips';
import { ScanArt } from './ScanArt';
import { PageReview } from './PageReview';
import { StaffOverlay } from './StaffOverlay';
import styles from './Capture.module.css';

const ACCEPT = ['image/*', '.pdf', 'application/pdf', '.txt', 'text/plain'];

/** Is this event aimed at something that types? */
export function typingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** The capture view. */
export function Capture({ scan }: { scan: ScanState }) {
  const { pages, adding, error, kind, draft, text } = scan;
  const mobile = useIsMobile();
  // Phones get the camera first (a touch screen or a phone-sized window).
  const touch = useIsTouch() || mobile;
  // A phone held sideways: little height, so the way in comes first and the rest after it.
  const short = useMediaQuery('(max-height: 520px)');
  const [tips, setTips] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  const add = useCallback(
    async (files: File[], origin: 'camera' | 'photo' = 'photo') => {
      if (!files.length) return;
      const problems = await scan.addFiles(files, origin);
      for (const p of problems) toast.warn('Could not add that', { description: p });
    },
    [scan],
  );

  const takePhoto = () => {
    void pickFile({ accept: ['image/*'], capture: true }).then((f) => add(f, 'camera'));
  };
  const choose = () => {
    void pickFile({ accept: ACCEPT, multiple: true }).then((f) => add(f));
  };

  // Drop anywhere on the screen; paste a picture, or text that reads as tab or chords.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    return attachDropZone(el, { multiple: true, onFiles: (ok, rejected) => void add([...ok, ...rejected]), onHover: setDragging });
  }, [add]);
  useEffect(() => onPasteImage((images) => void add(images)), [add]);
  useEventListener(document, 'paste', (e: ClipboardEvent) => {
    if (typingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
    const t = e.clipboardData?.getData('text/plain') ?? '';
    if (t.trim() && !e.clipboardData?.files.length) {
      e.preventDefault();
      setPaste(t);
    }
  });

  const musicPages = pages.filter((p) => p.look && ['tab', 'notation', 'both'].includes(p.look.kind)).length;
  const looking = pages.some((p) => !p.look);
  const allText = kind === 'text';
  const nothing = pages.length > 0 && !looking && kind === 'unknown';
  // A reading is waiting to be checked: going on with it comes first, reading again second.
  const hasReading = !!(draft || text);
  const readLabel = hasReading ? 'Read again' : allText ? 'Read the text' : pages.length > 1 ? `Read ${pages.length} pages` : 'Read the music';
  const changes = scan.history?.past.length ?? 0;
  const goOn = () => scan.setPhase(draft ? 'music' : 'text');

  const readAgain = async () => {
    if (changes > 0) {
      const ok = await confirmDialog({
        title: 'Read the pages again?',
        description: `A new reading replaces the one you were checking, with your ${changes === 1 ? 'change' : `${changes} changes`}. To keep ${changes === 1 ? 'it' : 'them'}, choose Continue checking instead.`,
        confirmLabel: 'Read again',
        cancelLabel: 'Keep my changes',
      });
      if (!ok) return;
    }
    void scan.read();
  };

  // The unsaved scan of an earlier visit.
  const pickUp = async () => {
    if (pages.length || draft || text) {
      // Pasted text has no pages: say what it replaces instead of "0 pages".
      const now = pages.length ? (pages.length === 1 ? 'one page' : `${pages.length} pages`) : draft ? 'the reading you are checking' : 'the text you brought in';
      const ok = await confirmDialog({
        title: 'Pick up the earlier scan?',
        description: `It takes the place of what you brought in now (${now}).`,
        confirmLabel: 'Pick it up',
        cancelLabel: 'Keep these',
      });
      if (!ok) return;
    }
    scan.resumeKept();
  };
  const letGo = () => {
    const gone = scan.discardKept();
    if (gone) toast({ title: 'Earlier scan cleared', action: { label: 'Undo', onClick: () => scan.restoreKept(gone) } });
  };

  const startAgain = async () => {
    const reading = !!(draft || text);
    const ok = await confirmDialog({
      title: 'Start over?',
      description: reading ? 'Your pages and the reading you were checking will be cleared. Songs you saved stay in your library.' : `Your ${pages.length === 1 ? 'page' : `${pages.length} pages`} will be cleared.`,
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (ok) scan.reset();
  };

  return (
    <div ref={root} className={cx(styles.root, dragging && styles.dragging)} data-scan="capture">
      <Page
        title="Scan & Import"
        subtitle={short ? undefined : 'Turn a printed sheet, a photo, a PDF or pasted tab into a song you can play along with.'}
        actions={pages.length ? (
          <Button variant="ghost" iconLeft="RotateCcw" onClick={() => void startAgain()}>
            Start over
          </Button>
        ) : undefined}
      >
        {scan.offer && (
          <section className={styles.resume} aria-labelledby="scan-resume" data-scan-resume="">
            <span className={styles.resumeIcon} aria-hidden="true">
              <Icon name="History" />
            </span>
            <div className={styles.resumeBody}>
              <h2 id="scan-resume" className={styles.resumeTitle}>
                {scan.offer.title}
              </h2>
              <Text size="sm" tone="muted">
                {scan.offer.detail}
              </Text>
            </div>
            <div className={styles.resumeActions}>
              <Button variant="primary" iconLeft="RotateCcw" onClick={() => void pickUp()} data-scan-resume-go="">
                Pick it up
              </Button>
              <Button variant="ghost" onClick={letGo} data-scan-resume-discard="">
                Start fresh
              </Button>
            </div>
          </section>
        )}

        {!short && <Honest onTips={() => setTips(true)} />}

        {error && (
          <Banner tone="warn" title="Something needs a look" onDismiss={() => scan.setError(null)} live>
            {error}
          </Banner>
        )}

        {hasReading && (
          <Banner
            tone="info"
            title={draft ? `Your reading of “${draft.song.meta.title}” is still here` : 'Your text is still here'}
            actions={
              pages.length > 0 ? (
                <Button size="sm" iconLeft="ScanLine" disabled={looking || nothing || !!adding} onClick={() => void readAgain()} data-scan-read="">
                  {readLabel}
                </Button>
              ) : (
                // Pasted text has no pages, so no action bar: the way back is here.
                <Button size="sm" variant="primary" iconRight="ArrowRight" onClick={goOn} data-scan-continue="">
                  Continue checking
                </Button>
              )
            }
          >
            {changes > 0 ? `With your ${changes === 1 ? 'change' : `${changes} changes`}. ` : ''}
            {pages.length > 0 ? 'Continue checking it, or read the pages again for a new reading.' : 'Continue checking it, or bring in a sheet below to start a new one.'}
          </Banner>
        )}

        {pages.length === 0 ? (
          <Start touch={touch} short={short} adding={adding} onPhoto={takePhoto} onChoose={choose} onPaste={() => setPaste('')} onSample={() => void scan.addSample(sampleUrl, 'Ode to Joy (sample)')} onTips={() => setTips(true)} dragging={dragging} />
        ) : (
          <section className={styles.traySection} aria-labelledby="scan-pages">
            <div className={styles.trayHead}>
              <h2 id="scan-pages" className={styles.h2}>
                {pages.length === 1 ? 'Your page' : `Your ${pages.length} pages`}
              </h2>
              <Text size="sm" tone="muted">
                {pages.length > 1 ? 'They are read in this order as one song.' : 'Add more pages if the song goes on.'}
              </Text>
            </div>
            <ol className={styles.tray}>
              {pages.map((p, i) => (
                <PageCard
                  key={p.id}
                  page={p}
                  index={i}
                  count={pages.length}
                  mobile={mobile}
                  onOpen={() => setReview(p.id)}
                  onMove={(to) => scan.reorder(i, to)}
                  onDropFrom={(from) => scan.reorder(from, i)}
                  onRotate={(dir) => void scan.transform(p.id, { rotate: dir })}
                  onRetake={() => {
                    void pickFile({ accept: ['image/*'], capture: true }).then((f) => f[0] && scan.transform(p.id, { replace: f[0] }));
                  }}
                  onRemove={() => {
                    const removed = scan.removePage(p.id);
                    if (removed) toast({ title: `${removed.label} removed`, action: { label: 'Undo', onClick: () => scan.restorePage(removed, i) } });
                  }}
                />
              ))}
              <li className={styles.addTile}>
                <button type="button" className={styles.addButton} onClick={touch ? takePhoto : choose} disabled={!!adding}>
                  <Icon name={touch ? 'Camera' : 'Plus'} />
                  <span>{touch ? 'Photo of the next page' : 'Add a page'}</span>
                </button>
                {touch && (
                  <button type="button" className={styles.addSmall} onClick={choose} disabled={!!adding}>
                    <Icon name="Images" size="sm" />
                    Choose photos or a PDF
                  </button>
                )}
              </li>
            </ol>
            {adding && (
              <p className={styles.busy} role="status">
                <Spinner size={16} /> {adding}
              </p>
            )}
          </section>
        )}

        {short && <Honest onTips={() => setTips(true)} />}

        {pages.length > 0 && (
          <ActionBar
            start={
              <Text size="sm" tone={nothing ? 'warn' : 'muted'} aria-live="polite">
                {looking ? 'Looking at the pages…' : nothing ? 'No music found yet. Retake the photo, or read it anyway.' : allText ? 'Chords or typed tab: the words will be read.' : `${musicPages} ${musicPages === 1 ? 'page' : 'pages'} of music ready.`}
              </Text>
            }
          >
            {nothing && !hasReading && (
              <Button onClick={() => void scan.read({ force: true })} data-scan-force="">
                Read it anyway
              </Button>
            )}
            {hasReading ? (
              <Button variant="primary" iconRight="ArrowRight" size="lg" onClick={goOn} data-scan-continue="">
                Continue checking
              </Button>
            ) : (
              <Button variant="primary" iconLeft="ScanLine" size="lg" disabled={looking || nothing || !!adding} onClick={() => void readAgain()} data-scan-read="">
                {readLabel}
              </Button>
            )}
          </ActionBar>
        )}
      </Page>

      <Sheet open={tips} onClose={() => setTips(false)} title="A photo the reader can read" size="md">
        <CaptureTips />
      </Sheet>
      <PasteSheet
        open={paste !== null}
        seed={paste ?? ''}
        onClose={() => setPaste(null)}
        onUse={(t, title) => {
          setPaste(null);
          void scan.openText(t, 'paste', title || undefined);
        }}
      />
      {review && <PageReview scan={scan} id={review} onClose={() => setReview(null)} />}
    </div>
  );
}

/** What reads well, and the photo tips. */
function Honest({ onTips }: { onTips: () => void }) {
  return (
    <p className={styles.honest} data-scan-honest="">
      <Icon name="Info" size="sm" />
      <span>
        Printed tab and clean printed notation read best; handwriting is not supported. Photos should be flat, sharp and well lit.{' '}
        <button type="button" className={styles.link} onClick={onTips}>
          Tips for a good photo
        </button>
      </span>
    </p>
  );
}

function Start({ touch, short, adding, dragging, onPhoto, onChoose, onPaste, onSample, onTips }: { touch: boolean; short: boolean; adding: string | null; dragging: boolean; onPhoto: () => void; onChoose: () => void; onPaste: () => void; onSample: () => void; onTips: () => void }) {
  return (
    <div className={cx(styles.start, short && styles.startShort)}>
      <div className={cx(styles.drop, dragging && styles.dropOver)} data-scan-drop="">
        {!short && (
          <div className={styles.dropArt} aria-hidden="true">
            <ScanArt className={styles.art} />
          </div>
        )}
        <div className={styles.dropBody}>
          <h2 className={styles.dropTitle}>{dragging ? 'Drop it here' : touch ? 'Photograph your sheet' : 'Drop photos or a PDF here'}</h2>
          {!short && <Text tone="muted">{touch ? 'Lay it flat in good light and fill the frame. Several pages make one song.' : 'Or choose them. Several pages and photos make one song; you can paste a picture or text too.'}</Text>}
          <div className={styles.startActions}>
            {touch ? (
              <>
                <Button variant="primary" size="lg" iconLeft="Camera" onClick={onPhoto} disabled={!!adding} data-scan-camera="">
                  Take a photo
                </Button>
                <Button size="lg" iconLeft="Images" onClick={onChoose} disabled={!!adding}>
                  Choose photos or a PDF
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" iconLeft="FolderOpen" onClick={onChoose} disabled={!!adding} data-scan-choose="">
                Choose photos or a PDF
              </Button>
            )}
          </div>
          {adding && (
            <p className={styles.busy} role="status">
              <Spinner size={16} /> {adding}
            </p>
          )}
        </div>
      </div>
      <div className={styles.otherWays}>
        <button type="button" className={styles.way} onClick={onPaste} data-scan-paste="">
          <span className={styles.wayIcon}>
            <Icon name="ClipboardPaste" />
          </span>
          <span className={styles.wayText}>
            <span className={styles.wayTitle}>Paste tab or chords</span>
            <span className={styles.wayHint}>Text tab from a website, or chord names over lyrics</span>
          </span>
          <Icon name="ChevronRight" size="sm" className={styles.chev} />
        </button>
        <button type="button" className={styles.way} onClick={onSample} disabled={!!adding} data-scan-sample="">
          <span className={styles.wayIcon}>
            <Icon name="FileMusic" />
          </span>
          <span className={styles.wayText}>
            <span className={styles.wayTitle}>Try it with a sample sheet</span>
            <span className={styles.wayHint}>Ode to Joy in notation and tab, to see how it works</span>
          </span>
          <Icon name="ChevronRight" size="sm" className={styles.chev} />
        </button>
        <button type="button" className={styles.way} onClick={onTips}>
          <span className={styles.wayIcon}>
            <Icon name="Lightbulb" />
          </span>
          <span className={styles.wayText}>
            <span className={styles.wayTitle}>Tips for a good photo</span>
            <span className={styles.wayHint}>Flat, close, sharp and evenly lit</span>
          </span>
          <Icon name="ChevronRight" size="sm" className={styles.chev} />
        </button>
      </div>
    </div>
  );
}

function PageCard({ page, index, count, mobile, onOpen, onMove, onDropFrom, onRotate, onRetake, onRemove }: { page: ScanPageT; index: number; count: number; mobile: boolean; onOpen: () => void; onMove: (to: number) => void; onDropFrom: (from: number) => void; onRotate: (dir: 1 | -1) => void; onRetake: () => void; onRemove: () => void }) {
  const look = page.look;
  const tone = !look ? 'neutral' : look.kind === 'not-music' ? 'bad' : look.advice ? 'warn' : 'ok';
  return (
    <li
      className={styles.card}
      data-scan-page={index}
      draggable={!mobile}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-scan-page', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-scan-page')) e.preventDefault();
      }}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData('application/x-scan-page'));
        if (Number.isInteger(from) && e.dataTransfer.types.includes('application/x-scan-page')) {
          e.preventDefault();
          e.stopPropagation();
          if (from !== index) onDropFrom(from);
        }
      }}
    >
      <button type="button" className={styles.thumb} onClick={onOpen} aria-label={`Look closer at ${page.label}`}>
        <img src={page.thumbUrl} alt="" className={styles.thumbImg} />
        {look && <StaffOverlay look={look} width={page.width} height={page.height} className={styles.thumbOverlay} />}
        <span className={styles.pageNo} aria-hidden="true">
          {index + 1}
        </span>
        {!look && (
          <span className={styles.scanning} aria-hidden="true">
            <span className={styles.scanLine} />
          </span>
        )}
      </button>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardTitle}>{page.label}</span>
          <Menu
            trigger={<IconButton icon="EllipsisVertical" label={`More for ${page.label}`} size="sm" />}
            items={[
              { label: 'Look closer and crop', icon: 'Crop', onSelect: onOpen },
              { label: 'Turn left', icon: 'RotateCcw', onSelect: () => onRotate(-1) },
              { label: 'Turn right', icon: 'RotateCw', onSelect: () => onRotate(1) },
              { label: 'Retake the photo', icon: 'Camera', onSelect: onRetake },
              ...(count > 1 ? (['separator'] as const) : []),
              ...(count > 1 && index > 0 ? [{ label: 'Move earlier', icon: 'ArrowUp', onSelect: () => onMove(index - 1) }] : []),
              ...(count > 1 && index < count - 1 ? [{ label: 'Move later', icon: 'ArrowDown', onSelect: () => onMove(index + 1) }] : []),
              'separator' as const,
              { label: 'Remove this page', icon: 'Trash2', danger: true, onSelect: onRemove },
            ]}
          />
        </div>
        {look ? (
          <>
            <Badge tone={tone} icon={tone === 'ok' ? 'CircleCheck' : tone === 'bad' ? 'CircleX' : 'TriangleAlert'} className={styles.kindBadge}>
              {kindLabel(look.kind)}
            </Badge>
            <Text size="sm" tone="muted">
              {look.summary}
            </Text>
            {look.advice && (
              <Text size="sm" tone="warn">
                {look.advice}
              </Text>
            )}
          </>
        ) : (
          <Text size="sm" tone="muted" aria-live="polite">
            Looking for the music…
          </Text>
        )}
        {count > 1 && (
          <div className={styles.move}>
            <IconButton icon={mobile ? 'ArrowUp' : 'ArrowLeft'} label="Move earlier" size="sm" disabled={index === 0} onClick={() => onMove(index - 1)} />
            <IconButton icon={mobile ? 'ArrowDown' : 'ArrowRight'} label="Move later" size="sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} />
          </div>
        )}
      </div>
    </li>
  );
}

function PasteSheet({ open, seed, onClose, onUse }: { open: boolean; seed: string; onClose: () => void; onUse: (text: string, title: string) => void }) {
  const [value, setValue] = useState(seed);
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (open) {
      setValue(seed);
      setTitle('');
    }
  }, [open, seed]);
  const format = value.trim() ? detectTextFormat(value) : 'unknown';
  const known = format !== 'unknown';
  const hint = !value.trim()
    ? 'Paste text tab (six lines of dashes and numbers) or chord names over lyrics.'
    : known
      ? format === 'ascii-tab'
        ? 'Looks like text tab.'
        : format === 'sixtab'
          ? 'Looks like SixTab.'
          : 'Looks like a chord sheet.'
      : 'This does not look like tab or chords yet.';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste tab or chords"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" iconLeft="ArrowRight" disabled={!known} onClick={() => onUse(value, title)} data-scan-paste-use="">
            Check and play
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <TextArea label="Tab or chords" value={value} onChange={setValue} rows={10} mono autoGrow className={styles.tabText} data-autofocus placeholder={'e|-----0---3---|\nB|---1-------0-|\n...'} />
        <p className={cx(styles.detect, known && styles.detectOk)} aria-live="polite">
          <Icon name={known ? 'CircleCheck' : 'Info'} size="sm" />
          {hint}
        </p>
        <TextField label="Title" optional value={title} onChange={setTitle} hint="Leave it empty to use the title in the text." />
      </Stack>
    </Sheet>
  );
}
