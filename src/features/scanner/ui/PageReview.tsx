/**
 * One page up close: the photo with what was found drawn over it, or the reader's cleaned and
 * straightened version; crop it (a suggested crop to the paper when a desk shows), turn it, retake
 * it or remove it.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Icon, Modal, SegmentedControl, Stack, Text, cx, toast, useElementSize } from '@/ui';
import { pickFile } from '@/core/platform';
import type { BBox } from '@/core/omr/types';
import type { ScanState } from '../engine/useScan';
import { kindLabel } from '../model/pages';
import { padBox } from '../model/paper';
import { StaffOverlay } from './StaffOverlay';
import styles from './PageReview.module.css';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** The page review dialog. */
export function PageReview({ scan, id, onClose }: { scan: ScanState; id: string; onClose: () => void }) {
  const index = scan.pages.findIndex((p) => p.id === id);
  const page = scan.pages[index];
  const [view, setView] = useState<'photo' | 'clean'>('photo');
  const [crop, setCrop] = useState<BBox | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const drag = useRef<{ corner: Corner | 'move'; id: number; x: number; y: number; start: BBox } | null>(null);

  useEffect(() => {
    if (!page) onClose();
  }, [page, onClose]);
  if (!page) return null;
  const look = page.look;
  const W = page.width;
  const H = page.height;
  const suggested = look?.paper ? padBox(look.paper, Math.max(W, H) * 0.01, W, H) : null;

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const min = Math.max(W, H) * 0.08;
  const moveCorner = (c: Corner | 'move', start: BBox, dx: number, dy: number): BBox => {
    let { x, y, w, h } = start;
    if (c === 'move') {
      x = Math.max(0, Math.min(W - w, x + dx));
      y = Math.max(0, Math.min(H - h, y + dy));
      return { x, y, w, h };
    }
    let x1 = x + w;
    let y1 = y + h;
    if (c === 'nw' || c === 'sw') x = Math.max(0, Math.min(x1 - min, x + dx));
    if (c === 'ne' || c === 'se') x1 = Math.min(W, Math.max(x + min, x1 + dx));
    if (c === 'nw' || c === 'ne') y = Math.max(0, Math.min(y1 - min, y + dy));
    if (c === 'sw' || c === 'se') y1 = Math.min(H, Math.max(y + min, y1 + dy));
    return { x, y, w: x1 - x, h: y1 - y };
  };
  const onDown = (c: Corner | 'move') => (e: ReactPointerEvent<HTMLElement>) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toPage(e);
    drag.current = { corner: c, id: e.pointerId, x: p.x, y: p.y, start: crop };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toPage(e);
    setCrop(moveCorner(d.corner, d.start, p.x - d.x, p.y - d.y));
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const nudge = (c: Corner) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (!crop) return;
    const step = Math.max(W, H) * (e.shiftKey ? 0.05 : 0.01);
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setCrop(moveCorner(c, crop, d[0], d[1]));
  };

  const applyCrop = async () => {
    if (!crop) return;
    const c = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) };
    setCrop(null);
    await scan.transform(page.id, { crop: c });
    toast.ok('Cropped. Looking at it again.');
  };

  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  // The picture as large as fits: the stage's width, and most of the window's height.
  const maxH = Math.min((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.62, 900);
  const fit = stage.width > 0 ? Math.min((stage.width - 16) / W, maxH / H) : 0;
  const showing = view === 'clean' && page.cleanUrl ? 'clean' : 'photo';

  return (
    <Modal
      open
      onClose={onClose}
      title={page.label}
      description={look ? `${kindLabel(look.kind)}. ${look.summary}` : 'Looking for staves…'}
      size="lg"
      phone="full"
      footer={
        crop ? (
          <>
            <Button variant="ghost" onClick={() => setCrop(null)}>
              Cancel
            </Button>
            <Button variant="primary" iconLeft="Crop" onClick={() => void applyCrop()} data-scan-crop-apply="">
              Crop to this
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              iconLeft="Trash2"
              onClick={() => {
                const removed = scan.removePage(page.id);
                onClose();
                if (removed) toast({ title: `${removed.label} removed`, action: { label: 'Undo', onClick: () => scan.restorePage(removed, index) } });
              }}
            >
              Remove
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      <Stack gap={4}>
        <div className={styles.toolbar}>
          {page.cleanUrl && !crop ? (
            <SegmentedControl
              aria-label="Which picture"
              size="sm"
              options={[
                { value: 'photo', label: 'Your photo' },
                { value: 'clean', label: 'Cleaned' },
              ]}
              value={showing}
              onChange={(v) => setView(v as 'photo' | 'clean')}
            />
          ) : (
            <span />
          )}
          <div className={styles.tools}>
            {!crop && (
              <>
                <Button size="sm" iconLeft="Crop" onClick={() => setCrop(suggested ?? { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 })} data-scan-crop="">
                  Crop
                </Button>
                <Button size="sm" iconLeft="RotateCcw" onClick={() => void scan.transform(page.id, { rotate: -1 })} aria-label="Turn left">
                  Turn
                </Button>
                <Button
                  size="sm"
                  iconLeft="Camera"
                  onClick={() => {
                    void pickFile({ accept: ['image/*'], capture: true }).then((f) => f[0] && scan.transform(page.id, { replace: f[0] }));
                  }}
                >
                  Retake
                </Button>
              </>
            )}
          </div>
        </div>

        <div ref={stageRef} className={styles.stage}>
          <div ref={box} className={styles.picture} style={{ width: Math.max(1, W * fit), height: Math.max(1, H * fit) }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <img src={showing === 'clean' ? page.cleanUrl : page.url} alt={showing === 'clean' ? 'The page as the reader sees it: straightened, evened out' : `Your picture of ${page.label}`} className={styles.img} draggable={false} />
            {look && showing === 'photo' && !crop && <StaffOverlay look={look} width={W} height={H} labels />}
            {crop && (
              <>
                <div className={styles.shade} style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(crop.x, W)} ${pct(crop.y, H)}, ${pct(crop.x, W)} ${pct(crop.y + crop.h, H)}, ${pct(crop.x + crop.w, W)} ${pct(crop.y + crop.h, H)}, ${pct(crop.x + crop.w, W)} ${pct(crop.y, H)}, ${pct(crop.x, W)} ${pct(crop.y, H)})` }} />
                <div className={styles.crop} style={{ left: pct(crop.x, W), top: pct(crop.y, H), width: pct(crop.w, W), height: pct(crop.h, H) }} onPointerDown={onDown('move')}>
                  {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
                    <button key={c} type="button" className={cx(styles.handle, styles[c])} aria-label={`Crop corner (${c === 'nw' ? 'top left' : c === 'ne' ? 'top right' : c === 'sw' ? 'bottom left' : 'bottom right'}). Arrow keys move it.`} onPointerDown={onDown(c)} onKeyDown={nudge(c)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {crop ? (
          <Text size="sm" tone="muted">
            Drag the corners to the edges of the sheet{suggested ? ' (they start where the paper was found)' : ''}. Leave a little margin around the music.
          </Text>
        ) : look ? (
          <div className={styles.facts}>
            {look.kind !== 'text' && look.kind !== 'not-music' && (
              <p className={styles.legend}>
                <span className={cx(styles.swatch, styles.swNotation)} aria-hidden="true" /> Notation
                <span className={cx(styles.swatch, styles.swTab)} aria-hidden="true" /> Tab
                <span className={cx(styles.swatch, styles.swBar)} aria-hidden="true" /> Bar lines
                {look.paper && (
                  <>
                    <span className={cx(styles.swatch, styles.swPaper)} aria-hidden="true" /> Edge of the paper
                  </>
                )}
              </p>
            )}
            {look.kind !== 'text' && look.kind !== 'not-music' && (
              <Text size="sm" tone="muted">
                {Math.abs(look.skew) >= 0.3 ? `Straightened by ${Math.abs(look.skew).toFixed(1)}°. ` : 'Already straight. '}
                {look.quality >= 0.7 ? 'Sharp and clear.' : look.quality >= 0.45 ? 'Clear enough.' : 'Soft or dim: expect more to check.'}
              </Text>
            )}
            {look.advice && (
              <p className={styles.advice}>
                <Icon name="TriangleAlert" size="sm" /> {look.advice}
              </p>
            )}
          </div>
        ) : null}
      </Stack>
    </Modal>
  );
}
