/**
 * The alt bench: runs the production `FretboardTracker` (cold start, exactly as the camera screen
 * does) on scenes from the independent generator (`alt-scenes.ts`) and scores every frame against
 * that generator's own ground truth.
 *
 * Scoring is done here, not with `comparePoses`: a drawn marker (`projectMarker`, what the overlay
 * really draws) is taken back through the TRUE camera (mirroring, lens distortion, homography) to
 * the true board plane, and must land between the right two wires and within half a string spacing
 * of the right string. Node only (PNG dumps through `debug.ts`). Cells are every (string, fret) whose true marker position is in the frame,
 * hidden by a hand or not (the hand moves on; a wrong cell under it is still wrong).
 */
import { projectMarker, fretX } from '../geometry';
import { frameStats, viewStats } from '../guidance';
import { FretboardTracker, type FretboardTrackerOptions, type TrackerUpdate } from '../tracker';
import type { FretboardPose, Frame, Point } from '../types';
import { drawDot, drawLine, drawText, magnify, writeFramePng } from './debug';
import { ALT_CONDITIONS, ALT_FRET_HEIGHT, altPixelToPlane, altPlaneToPixel, createAltCache, renderAlt, type AltCache, type AltCondition, type AltSpec, type AltTruth } from './alt-scenes';

/** How one drawn pose compares with the truth. */
export interface AltScore {
  /** Cells evaluated. */
  cells: number;
  /** Share of cells whose marker lands on the right string (as seen, at its height above the board) between the right two wires (absolute fret numbers). */
  accuracy: number;
  /** The same judged against the strings' footprint on the board (no parallax): how much raised strings matter. */
  accuracyBoard: number;
  /** The same after removing the whole-fret numbering offset. */
  aligned: number;
  /** Drawn fret number minus true fret number (0 = right). */
  offset: number;
  /** Median distance between drawn and true marker, px. */
  markerErrPx: number;
}

const MARKER_FRACTION = 0.68;

function stringZ(truth: AltTruth, x: number): number {
  const m = truth.model as NonNullable<AltTruth['model']>;
  const [a, b] = truth.stringHeight;
  return a + ((b - a) * Math.max(0, Math.min(m.scaleLength, x))) / m.scaleLength;
}

/** Where the ray through a board-plane point (z = 0) passes height z (camera parallax). */
function atHeight(truth: AltTruth, q: Point, z: number): Point {
  const C = truth.camera;
  if (!C || z === 0) return q;
  const k = z / C[2];
  return { x: q.x + (C[0] - q.x) * k, y: q.y + (C[1] - q.y) * k };
}

/** The pixel showing the raised point (x, y, z) of the true neck. */
function pixelOfRaised(truth: AltTruth, x: number, y: number, z: number): Point | null {
  const C = truth.camera;
  if (!C) return altPlaneToPixel(truth, x, y);
  // Continue the ray from the camera through the raised point down to the board plane.
  const k = C[2] / (C[2] - z);
  return altPlaneToPixel(truth, C[0] + (x - C[0]) * k, C[1] + (y - C[1]) * k);
}

function trueMarker(truth: AltTruth, s: number, f: number, visible: boolean): Point | null {
  const m = truth.model;
  if (!m) return null;
  const x = fretX(m, f - 1) + MARKER_FRACTION * (fretX(m, f) - fretX(m, f - 1));
  const span = m.stringSpanNut + ((m.stringSpanBridge - m.stringSpanNut) * x) / m.scaleLength;
  const y = m.nutWidth / 2 + ((m.stringCount - s) / Math.max(1, m.stringCount - 1) - 0.5) * span;
  return visible ? pixelOfRaised(truth, x, y, stringZ(truth, x)) : altPlaneToPixel(truth, x, y);
}

/**
 * The true cell under a pixel: fret cell (0 behind the nut; wires judged at their crowns) and the
 * nearest string with its offset in spacings, judged where the string is seen (`visible`, at its
 * height above the board) or by its footprint on the board.
 */
function trueCell(truth: AltTruth, p: Point, visible: boolean): { fret: number; string: number; offset: number } | null {
  const m = truth.model;
  if (!m) return null;
  const q0 = altPixelToPlane(truth, p);
  if (!q0) return null;
  const qf = atHeight(truth, q0, ALT_FRET_HEIGHT);
  const rest = 1 - qf.x / m.scaleLength;
  if (!(rest > 0)) return null;
  const fret = qf.x <= 0 ? 0 : Math.ceil(-12 * Math.log2(rest) - 1e-9);
  let q = q0;
  if (visible) {
    // The string height depends on x, which moves with the height: two rounds settle it.
    q = atHeight(truth, q0, stringZ(truth, q0.x));
    q = atHeight(truth, q0, stringZ(truth, q.x));
  }
  const xs = Math.max(0, q.x);
  const span = m.stringSpanNut + ((m.stringSpanBridge - m.stringSpanNut) * xs) / m.scaleLength;
  const idx = ((q.y - m.nutWidth / 2) / span + 0.5) * (m.stringCount - 1);
  const i = Math.max(0, Math.min(m.stringCount - 1, Math.round(idx)));
  return { fret, string: m.stringCount - i, offset: idx - i };
}

/** Score a pose (frame pixels of the frame the tracker saw) against the truth. */
export function scoreAlt(pose: FretboardPose, truth: AltTruth): AltScore {
  const m = truth.model;
  const empty: AltScore = { cells: 0, accuracy: 0, accuracyBoard: 0, aligned: 0, offset: 0, markerErrPx: NaN };
  if (!m || truth.visible.max < truth.visible.min) return empty;
  const sx = truth.width / pose.frameWidth;
  const sy = truth.height / pose.frameHeight;
  const drawn = (s: number, f: number): Point | null => {
    if (s > pose.model.stringCount || f < 0) return null;
    const p = projectMarker(pose, s, f);
    return Number.isFinite(p.x + p.y) ? { x: p.x * sx, y: p.y * sy } : null;
  };
  // Numbering offset: where do the drawn wires fall among the true ones?
  const offs: number[] = [];
  const em = pose.model;
  for (let n = Math.max(1, truth.visible.min); n <= truth.visible.max; n++) {
    const xe = fretX(em, n);
    const p = { x: 0, y: 0 };
    const H = pose.H;
    const w = H[6] * xe + H[7] * (em.nutWidth / 2) + H[8];
    p.x = ((H[0] * xe + H[1] * (em.nutWidth / 2) + H[2]) / w) * sx;
    p.y = ((H[3] * xe + H[4] * (em.nutWidth / 2) + H[5]) / w) * sy;
    const q = altPixelToPlane(truth, p);
    if (!q) continue;
    const rest = 1 - q.x / m.scaleLength;
    if (!(rest > 0)) continue;
    offs.push(-12 * Math.log2(rest) - n);
  }
  offs.sort((a, b) => a - b);
  const k = offs.length ? Math.round(offs[offs.length >> 1]) : 0;
  let cells = 0;
  let right = 0;
  let rightBoard = 0;
  let rightAligned = 0;
  const errs: number[] = [];
  const first = Math.max(1, truth.visible.min === 0 ? 1 : truth.visible.min + 1);
  for (let f = first; f <= truth.visible.max; f++) {
    for (let s = 1; s <= m.stringCount; s++) {
      const t = trueMarker(truth, s, f, true);
      if (!t || t.x < 0 || t.y < 0 || t.x > truth.width || t.y > truth.height) continue;
      cells++;
      const e = drawn(s, f);
      if (e) {
        errs.push(Math.hypot(e.x - t.x, e.y - t.y));
        const c = trueCell(truth, e, true);
        if (c && c.fret === f && c.string === s && Math.abs(c.offset) < 0.5) right++;
        const cb = trueCell(truth, e, false);
        if (cb && cb.fret === f && cb.string === s && Math.abs(cb.offset) < 0.5) rightBoard++;
      } else errs.push(Infinity);
      const ea = drawn(s, f - k);
      if (ea) {
        const c = trueCell(truth, ea, true);
        if (c && c.fret === f && c.string === s && Math.abs(c.offset) < 0.5) rightAligned++;
      }
    }
  }
  errs.sort((a, b) => a - b);
  return { cells, accuracy: cells ? right / cells : 0, accuracyBoard: cells ? rightBoard / cells : 0, aligned: cells ? rightAligned / cells : 0, offset: -k === 0 ? 0 : -k, markerErrPx: errs.length ? errs[errs.length >> 1] : NaN };
}

/** One frame of a run. */
export interface AltFrameResult {
  index: number;
  state: TrackerUpdate['state'];
  hint: TrackerUpdate['hint'];
  guidance: string | null;
  confirmed: boolean;
  question: boolean;
  suggest: boolean;
  ran: TrackerUpdate['ran'];
  ms: number;
  /** What the drawn pose's fret numbers rest on, and how sure. */
  numbering: string;
  numberingConfidence: number;
  reason: string;
  score: AltScore | null;
  /** Mean frame-to-frame motion of the drawn markers (px), when this and the previous frame are still and both drew a pose. */
  jitterPx: number;
  still: boolean;
  /** Frame statistics (guidance inputs) and the view as the drawn pose measures it, with the truth beside it. */
  brightness: number;
  noise: number;
  clipped: number;
  spacingPx: number;
  offNormalDeg: number;
  trueSpacingPx: number;
  trueOffNormalDeg: number;
}

/** One scene run through the tracker. */
export interface AltRun {
  condition: string;
  seed: number;
  spec: AltSpec;
  guitar: boolean;
  frames: AltFrameResult[];
  /** First frame index that was locked (-1 never). */
  firstLock: number;
  /** A locked frame drew fewer than 90% of the cells right (absolute numbers). */
  wrongLock: boolean;
  /** A locked frame was right up to a whole-fret shift but mis-numbered. */
  misnumbered: boolean;
  renderMs: number;
}

/** Options of `runAlt`. */
export interface AltRunOptions {
  frames?: number;
  tracker?: Partial<FretboardTrackerOptions>;
  cache?: AltCache;
  /** Write a PNG of every frame whose index is listed (or of the worst locked frame with 'worst'). */
  dumpDir?: string;
  dump?: 'none' | 'worst' | 'all';
}

function markerShift(a: FretboardPose, b: FretboardPose): number {
  let sum = 0;
  let n = 0;
  const v = b.visibleFrets;
  for (let s = 1; s <= b.model.stringCount; s += Math.max(1, Math.floor((b.model.stringCount - 1) / 2))) {
    for (let f = Math.max(1, v.min + 1); f <= v.max; f++) {
      const p = projectMarker(a, s, f);
      const q = projectMarker(b, s, f);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (Number.isFinite(d)) {
        sum += d;
        n++;
      }
    }
  }
  return n ? sum / n : NaN;
}

/** Run one scene from a cold start. */
export function runAlt(spec: AltSpec, options: AltRunOptions = {}): AltRun {
  const frames = options.frames ?? 24;
  const cache = options.cache ?? createAltCache();
  const tracker = new FretboardTracker({ model: spec.hints.model, bassSideUp: spec.hints.bassSideUp, mirrored: spec.hints.mirrored, leftHanded: spec.hints.leftHanded, ...options.tracker });
  const out: AltFrameResult[] = [];
  let prevPose: FretboardPose | null = null;
  let firstLock = -1;
  let wrongLock = false;
  let misnumbered = false;
  let renderMs = 0;
  let worst: { frame: Frame; truth: AltTruth; pose: FretboardPose; acc: number; index: number } | null = null;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    const { frame, truth } = renderAlt(spec, i, cache);
    renderMs += performance.now() - t0;
    const u = tracker.update(frame, i * (1000 / 30));
    const shown = u.state === 'candidate' || u.state === 'locked' ? u.pose : null;
    const score = shown && spec.neck ? scoreAlt(shown, truth) : null;
    const still = truth.still && i > 0;
    const jitter = still && shown && prevPose ? markerShift(prevPose, shown) : NaN;
    const fstats = frameStats(frame);
    const vstats = shown ? viewStats(shown) : null;
    if (u.state === 'locked') {
      if (firstLock < 0) firstLock = i;
      if (spec.neck && score) {
        if (score.accuracy < 0.9) wrongLock = true;
        if (score.offset !== 0 && score.aligned >= 0.9) misnumbered = true;
      } else if (!spec.neck) wrongLock = true;
      if (shown && (!worst || (score?.accuracy ?? 0) < worst.acc)) worst = { frame, truth, pose: shown, acc: score?.accuracy ?? 0, index: i };
    }
    if (options.dump === 'all' && options.dumpDir) dumpAltFrame(`${options.dumpDir}/${spec.condition}-${spec.seed}-f${String(i).padStart(2, '0')}.png`, frame, truth, shown, `${u.state} ${score ? (score.accuracy * 100).toFixed(0) + '%' : ''} off ${score?.offset ?? '-'} ${u.hint ?? ''}`);
    out.push({
      index: i,
      state: u.state,
      hint: u.hint,
      guidance: (u as TrackerUpdate & { guidance?: { code: string } }).guidance?.code ?? null,
      confirmed: u.numberingConfirmed,
      question: u.question !== null,
      suggest: u.suggestCalibration,
      ran: u.ran,
      ms: u.ms,
      numbering: shown?.numbering ?? '-',
      numberingConfidence: shown?.numberingConfidence ?? NaN,
      reason: u.reason ?? '',
      score,
      jitterPx: jitter,
      still,
      brightness: fstats.brightness,
      noise: fstats.noise,
      clipped: fstats.clipped,
      spacingPx: vstats?.stringSpacingPx ?? NaN,
      offNormalDeg: vstats?.offNormalDeg ?? NaN,
      trueSpacingPx: truth.stringSpacingPx,
      trueOffNormalDeg: truth.offNormalDeg,
    });
    prevPose = shown;
  }
  if (options.dump === 'worst' && options.dumpDir && worst && (wrongLock || misnumbered)) {
    dumpAltFrame(`${options.dumpDir}/${spec.condition}-${spec.seed}-worst-f${worst.index}.png`, worst.frame, worst.truth, worst.pose, `worst locked ${(worst.acc * 100).toFixed(0)}%`);
  }
  return { condition: spec.condition, seed: spec.seed, spec, guitar: spec.neck !== null, frames: out, firstLock, wrongLock, misnumbered, renderMs };
}

/** One row of the alt table: a condition over its seeds. */
export interface AltRow {
  condition: string;
  group: AltCondition['group'];
  scenes: number;
  frames: number;
  guitar: boolean;
  /** Frames showing a board (candidate or locked), share. */
  shown: number;
  /** Frames locked, share. */
  locked: number;
  /** Scenes that locked at least once. */
  lockedScenes: number;
  /** Median frames to the first lock among scenes that locked. */
  framesToLock: number;
  /** Mean absolute-cell accuracy over locked frames (strings as seen), and against the strings' board footprint. */
  cellAccuracy: number;
  cellAccuracyBoard: number;
  /** Share of locked frames drawing >= 90% of the cells right. */
  rightRate: number;
  /** Share of locked frames numbered right. */
  numberingRate: number;
  /** Scenes with a wrong lock (any locked frame below 90% right), and scenes mis-numbered while locked. */
  wrongLockScenes: number;
  misnumberedScenes: number;
  /** Locked frames below 90% right. */
  wrongLockFrames: number;
  /** Scenes that asked "is this fret N?" / suggested calibration at some point. */
  askedScenes: number;
  suggestedScenes: number;
  /** Median jitter of drawn markers on still frames, px. */
  jitterPx: number;
  /** Median marker error over locked frames, px. */
  markerErrPx: number;
  /** Median tracker ms per frame. */
  ms: number;
  /** Most common guidance code over the last third of the frames. */
  guidance: string;
  /** Medians of the frame statistics and of the true view, and the median error of the estimated off-normal angle. */
  brightness: number;
  noise: number;
  clipped: number;
  trueSpacingPx: number;
  trueOffNormalDeg: number;
  offNormalErrDeg: number;
}

function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/** Summarise the runs of one condition. */
export function summariseAlt(condition: AltCondition, runs: AltRun[]): AltRow {
  const frames = runs.flatMap((r) => r.frames);
  const locked = frames.filter((f) => f.state === 'locked');
  const scored = locked.filter((f) => f.score && f.score.cells > 0);
  const guidanceCounts = new Map<string, number>();
  for (const r of runs) {
    for (const f of r.frames.slice(Math.floor((2 * r.frames.length) / 3))) {
      const g = f.guidance ?? f.hint ?? 'ok';
      guidanceCounts.set(g, (guidanceCounts.get(g) ?? 0) + 1);
    }
  }
  const guidance = [...guidanceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  return {
    condition: condition.id,
    group: condition.group,
    scenes: runs.length,
    frames: frames.length,
    guitar: runs.some((r) => r.guitar),
    shown: frames.length ? frames.filter((f) => f.state === 'candidate' || f.state === 'locked').length / frames.length : 0,
    locked: frames.length ? locked.length / frames.length : 0,
    lockedScenes: runs.filter((r) => r.firstLock >= 0).length,
    framesToLock: median(runs.filter((r) => r.firstLock >= 0).map((r) => r.firstLock)),
    cellAccuracy: scored.length ? scored.reduce((a, f) => a + (f.score as AltScore).accuracy, 0) / scored.length : NaN,
    cellAccuracyBoard: scored.length ? scored.reduce((a, f) => a + (f.score as AltScore).accuracyBoard, 0) / scored.length : NaN,
    rightRate: scored.length ? scored.filter((f) => (f.score as AltScore).accuracy >= 0.9).length / scored.length : NaN,
    numberingRate: scored.length ? scored.filter((f) => (f.score as AltScore).offset === 0).length / scored.length : NaN,
    wrongLockScenes: runs.filter((r) => r.wrongLock).length,
    misnumberedScenes: runs.filter((r) => r.misnumbered).length,
    wrongLockFrames: runs.some((r) => !r.guitar) ? locked.length : scored.filter((f) => (f.score as AltScore).accuracy < 0.9).length,
    askedScenes: runs.filter((r) => r.frames.some((f) => f.question)).length,
    suggestedScenes: runs.filter((r) => r.frames.some((f) => f.suggest)).length,
    jitterPx: median(frames.map((f) => f.jitterPx)),
    markerErrPx: median(scored.map((f) => (f.score as AltScore).markerErrPx)),
    ms: median(frames.map((f) => f.ms)),
    guidance,
    brightness: median(frames.map((f) => f.brightness)),
    noise: median(frames.map((f) => f.noise)),
    clipped: median(frames.map((f) => f.clipped)),
    trueSpacingPx: median(frames.map((f) => f.trueSpacingPx)),
    trueOffNormalDeg: median(frames.map((f) => f.trueOffNormalDeg)),
    offNormalErrDeg: median(frames.filter((f) => Number.isFinite(f.offNormalDeg)).map((f) => Math.abs(f.offNormalDeg - f.trueOffNormalDeg))),
  };
}

const pct = (v: number): string => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '-');
const num = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '-');

/** The table printed by the alt suite. */
export function formatAltTable(rows: AltRow[]): string {
  const head = ['condition', 'scenes', 'shown', 'locked', 'lock@', 'cells', 'board', 'right', 'numbered', 'wrong lock', 'misnum', 'asked', 'calib', 'jitter px', 'err px', 'ms', 'guidance', 'bright/noise/clip', 'spacing px', 'tilt (err)'];
  const body = rows.map((r) => [
    r.condition,
    String(r.scenes),
    pct(r.shown),
    r.guitar ? `${pct(r.locked)} (${r.lockedScenes}/${r.scenes})` : pct(r.locked),
    num(r.framesToLock, 0),
    r.guitar ? pct(r.cellAccuracy) : '-',
    r.guitar ? pct(r.cellAccuracyBoard) : '-',
    r.guitar ? pct(r.rightRate) : '-',
    r.guitar ? pct(r.numberingRate) : '-',
    r.guitar ? `${r.wrongLockScenes}/${r.scenes} (${r.wrongLockFrames} fr)` : `${r.wrongLockScenes}/${r.scenes} (${r.wrongLockFrames} fr)`,
    r.guitar ? `${r.misnumberedScenes}` : '-',
    `${r.askedScenes}`,
    `${r.suggestedScenes}`,
    num(r.jitterPx, 3),
    r.guitar ? num(r.markerErrPx, 1) : '-',
    num(r.ms, 0),
    r.guidance,
    `${num(r.brightness, 0)}/${num(r.noise, 1)}/${pct(r.clipped)}`,
    r.guitar ? num(r.trueSpacingPx, 1) : '-',
    r.guitar ? `${num(r.trueOffNormalDeg, 0)} (${num(r.offNormalErrDeg, 0)})` : '-',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]): string => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

/** Run a list of conditions over seeds and return the rows (and the runs, for assertions). */
export function runAltSuite(conditions: readonly AltCondition[] = ALT_CONDITIONS, seeds: readonly number[] = [0], options: AltRunOptions = {}): { rows: AltRow[]; runs: Map<string, AltRun[]> } {
  const runs = new Map<string, AltRun[]>();
  const rows: AltRow[] = [];
  for (const c of conditions) {
    const list: AltRun[] = [];
    for (const seed of seeds) list.push(runAlt(c.build(seed), { ...options, cache: options.cache ?? createAltCache() }));
    runs.set(c.id, list);
    rows.push(summariseAlt(c, list));
  }
  return { rows, runs };
}

/** Write a frame with the true wires (cyan), the drawn markers (yellow) and a label to a PNG. Node only. */
export function dumpAltFrame(path: string, frame: Frame, truth: AltTruth, pose: FretboardPose | null, label: string): void {
  const big = magnify(frame, 2);
  const m = truth.model;
  if (m) {
    for (let n = Math.max(0, truth.visible.min - 1); n <= Math.min(m.fretCount, truth.visible.max + 1); n++) {
      const x = fretX(m, n);
      const span = m.nutWidth + ((m.width12 - m.nutWidth) * x) / (m.scaleLength / 2);
      const a = altPlaneToPixel(truth, x, m.nutWidth / 2 - span / 2);
      const b = altPlaneToPixel(truth, x, m.nutWidth / 2 + span / 2);
      if (a && b) drawLine(big, { x: a.x * 2, y: a.y * 2 }, { x: b.x * 2, y: b.y * 2 }, n === 0 ? [255, 0, 255] : [0, 230, 255], 1, 0.7);
    }
  }
  if (pose) {
    const sx = (2 * frame.width) / pose.frameWidth;
    for (let f = Math.max(1, pose.visibleFrets.min + 1); f <= pose.visibleFrets.max; f++) {
      for (let s = 1; s <= pose.model.stringCount; s++) {
        const p = projectMarker(pose, s, f);
        if (Number.isFinite(p.x + p.y)) drawDot(big, { x: p.x * sx, y: p.y * sx }, 2.5, [255, 230, 0]);
      }
      if (f === 5 || f === 12 || f === pose.visibleFrets.min + 1) {
        const p = projectMarker(pose, 1, f);
        if (Number.isFinite(p.x + p.y)) drawText(big, String(f), p.x * sx + 4, p.y * sx + 4, [255, 255, 0], 2);
      }
    }
  }
  drawText(big, label, 6, 6, [255, 255, 255], 2);
  writeFramePng(path, big);
}

/** One line per frame of a run, for reading a single scene. */
export function formatAltRun(run: AltRun): string {
  const lines = run.frames.map((f) => {
    const sc = f.score ? `cells ${(f.score.accuracy * 100).toFixed(0)}% board ${(f.score.accuracyBoard * 100).toFixed(0)}% aligned ${(f.score.aligned * 100).toFixed(0)}% off ${f.score.offset} err ${f.score.markerErrPx.toFixed(1)}px` : '';
    return `  f${String(f.index).padStart(2, '0')} ${f.state.padEnd(9)} ${f.ran.padEnd(12)} ${f.numbering}:${Number.isFinite(f.numberingConfidence) ? f.numberingConfidence.toFixed(2) : '-'} ${sc} ${f.hint ?? ''} ${f.guidance ?? ''} ${f.reason} ${f.ms.toFixed(0)}ms`;
  });
  return `${run.condition}#${run.seed}\n${lines.join('\n')}`;
}
