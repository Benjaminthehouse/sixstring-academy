/**
 * The learner's own picture beside the reading: the bar being checked is shaded, its notes boxed,
 * doubtful notes dashed, fixed ones marked. It follows the selection (zoomed to the line of music)
 * or shows the whole page; tapping a note on the picture selects it.
 */
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { IconButton, SegmentedControl, Text, cx, useElementSize } from '@/ui';
import type { BBox } from '@/core/omr/types';
import type { Draft } from '../model/draft';
import { GUESS, checkBar } from '../model/draft';
import type { Selection } from '../model/select';
import styles from './SourceView.module.css';

/** A page picture the reading came from. */
export interface SourcePage {
  url: string;
  width: number;
  height: number;
  label: string;
  /** Staff space of the page in px (for zooming to a readable size). */
  staffSpace: number;
}

interface NoteHit {
  bar: number;
  beat: number;
  note: number;
  box: BBox;
  state: 'plain' | 'doubt' | 'fixed';
}

const ZOOMS = [0.6, 1, 1.6, 2.4];

/** The source view. */
export function SourceView({ pages, draft, sel, onSelect, className }: { pages: SourcePage[]; draft: Draft; sel: Selection | null; onSelect: (s: { bar: number; beat: number | null; note: number | null }) => void; className?: string }) {
  const [mode, setMode] = useState<'follow' | 'page'>('follow');
  const [zoom, setZoom] = useState(1);
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const svg = useRef<SVGSVGElement | null>(null);

  const selBar = sel ? draft.marks[sel.bar] : null;
  const pageIndex = Math.max(0, Math.min(pages.length - 1, mode === 'page' && chosenPage !== null ? chosenPage : selBar?.page ?? chosenPage ?? 0));
  const page = pages[pageIndex];

  const notes = useMemo(() => {
    const out: NoteHit[] = [];
    draft.marks.forEach((bm, bar) => {
      if (bm.page !== pageIndex) return;
      bm.beats.forEach((m, beat) =>
        m.notes.forEach((nm, note) => {
          const state = nm.checked && nm.source === 'user' ? 'fixed' : !nm.checked && nm.confidence < GUESS ? 'doubt' : 'plain';
          for (const box of nm.boxes) out.push({ bar, beat, note, box, state });
        }),
      );
    });
    return out;
  }, [draft, pageIndex]);

  const badBars = useMemo(() => draft.marks.map((bm, i) => (bm.page === pageIndex && bm.box && !checkBar(draft.song, i).ok ? bm.box : null)).filter((b): b is BBox => !!b), [draft, pageIndex]);

  if (!page) return null;
  const W = page.width;
  const H = page.height;

  // The window onto the page: the whole page, or the selected bar's line at a readable size.
  let view = { x: 0, y: 0, w: W, h: H };
  const cw = size.width || 1;
  const ch = size.height || 1;
  if (mode === 'follow' && selBar && selBar.page === pageIndex && (selBar.systemBox || selBar.box)) {
    const sys = selBar.systemBox ?? selBar.box!;
    const bar = selBar.box ?? sys;
    // About 8 screen px per staff space reads comfortably; never smaller than the whole line fitting.
    const fitLine = cw / Math.min(W, sys.w * 1.06);
    const s = Math.max(fitLine, (8 / Math.max(4, page.staffSpace)) * zoom * Math.min(1, cw / 420 + 0.4));
    const vw = Math.min(W, cw / s);
    const vh = Math.min(H, ch / s);
    const cx0 = bar.x + bar.w / 2;
    const cy0 = sys.y + sys.h / 2;
    view = { x: Math.max(0, Math.min(W - vw, cx0 - vw / 2)), y: Math.max(0, Math.min(H - vh, cy0 - vh / 2)), w: vw, h: vh };
  }

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    // The note under the pointer, or the nearest within a little slack; else the bar.
    const slack = Math.max(6, page.staffSpace * 0.6);
    let best: NoteHit | null = null;
    let bestD = Infinity;
    for (const n of notes) {
      const dx = Math.max(n.box.x - pt.x, 0, pt.x - (n.box.x + n.box.w));
      const dy = Math.max(n.box.y - pt.y, 0, pt.y - (n.box.y + n.box.h));
      const d = Math.hypot(dx, dy);
      if (d <= slack && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (best) {
      onSelect({ bar: best.bar, beat: best.beat, note: best.note });
      return;
    }
    const bar = draft.marks.findIndex((bm) => bm.page === pageIndex && bm.box && pt.x >= bm.box.x && pt.x <= bm.box.x + bm.box.w && pt.y >= bm.box.y - slack * 2 && pt.y <= bm.box.y + bm.box.h + slack * 2);
    if (bar >= 0) onSelect({ bar, beat: null, note: null });
  };

  const selBox = selBar && selBar.page === pageIndex ? selBar.box : null;
  const selNotes = sel && sel.beat !== null ? notes.filter((n) => n.bar === sel.bar && n.beat === sel.beat && (sel.note === null || n.note === sel.note)) : [];
  const stroke = view.w / Math.max(1, cw);

  return (
    <div className={cx(styles.root, className)} data-scan-source="">
      <div className={styles.bar}>
        <SegmentedControl
          aria-label="How much of your sheet to show"
          size="sm"
          options={[
            { value: 'follow', label: 'Follow' },
            { value: 'page', label: 'Whole page' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'follow' | 'page')}
        />
        <div className={styles.tools}>
          {mode === 'follow' && (
            <>
              <IconButton icon="ZoomOut" label="Zoom out" size="sm" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} />
              <IconButton icon="ZoomIn" label="Zoom in" size="sm" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} />
            </>
          )}
          {pages.length > 1 && (
            <>
              <IconButton icon="ChevronLeft" label="Previous page" size="sm" disabled={pageIndex === 0} onClick={() => {
                setMode('page');
                setChosenPage(pageIndex - 1);
              }} />
              <Text size="sm" tone="muted" tabular>
                {pageIndex + 1} / {pages.length}
              </Text>
              <IconButton icon="ChevronRight" label="Next page" size="sm" disabled={pageIndex === pages.length - 1} onClick={() => {
                setMode('page');
                setChosenPage(pageIndex + 1);
              }} />
            </>
          )}
        </div>
      </div>
      <div ref={ref} className={styles.viewport}>
        <svg
          ref={svg}
          className={styles.svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Your sheet, ${page.label}${sel ? `, bar ${sel.bar + 1} shaded` : ''}. Tap a note on it to select it.`}
          onClick={pick}
        >
          <rect className={styles.paper} x={0} y={0} width={W} height={H} />
          <image href={page.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          {badBars.map((b, i) => (
            <rect key={`bad${i}`} className={styles.badBar} x={b.x} y={b.y} width={b.w} height={b.h} />
          ))}
          {selBox && <rect className={styles.selBar} x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} rx={stroke * 4} />}
          {notes.map((n, i) =>
            n.state === 'plain' ? null : (
              <rect key={i} className={n.state === 'doubt' ? styles.doubt : styles.fixed} x={n.box.x - stroke * 3} y={n.box.y - stroke * 3} width={n.box.w + stroke * 6} height={n.box.h + stroke * 6} rx={stroke * 3} />
            ),
          )}
          {selNotes.map((n, i) => (
            <rect key={`s${i}`} className={styles.selNote} x={n.box.x - stroke * 4} y={n.box.y - stroke * 4} width={n.box.w + stroke * 8} height={n.box.h + stroke * 8} rx={stroke * 4} />
          ))}
        </svg>
      </div>
      <p className={styles.legend}>
        <span className={cx(styles.key, styles.keyDoubt)} aria-hidden="true" /> Not sure
        <span className={cx(styles.key, styles.keyFixed)} aria-hidden="true" /> You fixed it
        <span className={cx(styles.key, styles.keySel)} aria-hidden="true" /> Selected
      </p>
    </div>
  );
}
