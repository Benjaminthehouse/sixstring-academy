/**
 * The Live Fretboard (`#camera`): point a camera at the guitar's neck and the notes to play appear
 * on the learner's own frets, live.
 *
 * How it is put together:
 *  - `model/` is pure and unit-tested: what to show (a scale shape, a chord voicing, a song's
 *    notes now and next, a find-the-note target), the route params, the tracker answer turned into
 *    words and offers (`status.ts`), the four-tap marking, the fingertip reading.
 *  - `hooks/useLiveCamera` owns the camera and the vision pipeline (`@/core/vision`, tracking in a
 *    worker); it releases the camera when the screen goes away or the tab is hidden.
 *  - `ui/overlay.ts` draws every displayed video frame on a canvas over the `<video>` (the vision
 *    module's overlay plus the question ring, the green "heard it" flash, the fingertips); no React
 *    state per frame.
 *  - Without a camera (refused, missing, or the Claude viewer) the same notes go on a drawn neck.
 *
 * Addresses: `model/address.ts` (`#camera--scale--a--minor-pentatonic--box-1` ...). The root
 * mirrors state for tests: `data-mode` (guide | starting | live | blocked | drawn | hidden),
 * `data-state` (tracker state), `data-tool`, `data-content`, `data-mirrored`, `data-hands`,
 * `data-listen`, `data-step`. Keyboard: Space play / next note, arrows previous / next, F full
 * screen, M mirror, Esc leaves a tool or full screen. Browser check: `node e2e/camera.cjs`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { playUi, pluck, unlockAudio } from '@/core/audio';
import { tuning as tuningFor } from '@/core/guitar';
import { explainMediaFailure, isArtifact } from '@/core/platform';
import { recordActivity, setPrefs, usePrefs } from '@/core/progress';
import { cameraDeviceId, cameraMirrored, learnerTuning } from '@/core/settings';
import { formatNote } from '@/core/theory';
import { displayToFrame, fitOverlayCanvas, frameToDisplay, locatePixel, poseFromWireTaps, type MarkerColor, type PipelineRender, type PipelineUpdate, type Point, type VisionOptions } from '@/core/vision';
import { Banner, Button, Icon, IconButton, MediaBlocked, Page, RadioGroup, Sheet, Spinner, Stepper as NumberStepper, Text, cx, toast, useEventListener, useLocalState, useMediaQuery, usePrefersReducedMotion, useWakeLock } from '@/ui';
import { Fretboard, useMusicSettings, type FretCell } from '@/ui/music';
import { cameraDebug } from './debug';
import { freezeVideo, useLiveCamera } from './hooks/useLiveCamera';
import { useHands, type HandFrame } from './hooks/useHands';
import { useListen } from './hooks/useListen';
import { useSongMode } from './hooks/useSongMode';
import { DEFAULT_CONTENT, cameraParams, parseCameraParams, sanitizeContent, type CameraContent } from './model/address';
import { DEFAULT_STICKER_FRETS, DEFAULT_WIRES, fretChoices, stickerPrompt, tapSteps, tooClose, validPair, wireName, wireTaps, type WirePair } from './model/calibrate';
import { boardRange, chordNotes, chordTitle, matchHeard, scaleNotes, scaleTitle, toFretMarkers, toOverlay, type LabelMode, type Naming, type ShowNote } from './model/content';
import { answers, drillNote, nextTarget, type DrillTarget } from './model/drill';
import { GUITAR_KINDS, defaultGuitarKind, isGuitarKind, neckFor, stringCountOf, stringNamesFor, type GuitarKind } from './model/guitar';
import { frettingHand, handAdvice, type FingerReading } from './model/hands';
import { describeStep, stepHeard, stepNotes } from './model/song';
import { STARTING_STATUS, announcement, describeStatus, sameStatus, type LiveStatus } from './model/status';
import { ContentControls, PrevNext, TrackingControls, type ContentControlsProps } from './ui/Controls';
import { CoachBar, HudButton, StatusPill, TapLayer, ToolBanner } from './ui/Hud';
import { clearOverlay, drawFrame, readStagePalette, type Flash, type StagePalette } from './ui/overlay';
import { SETUP_TIPS, SetupGuide } from './ui/SetupGuide';
import styles from './Camera.module.css';
import stage from './ui/Stage.module.css';

/** A marking tool in use on the picture. */
type Tool =
  | { kind: 'calibrate'; pair: WirePair; taps: Point[]; error: string | null; choosing: boolean }
  | { kind: 'numbers'; tap: Point | null; current: number | null; error: string | null }
  | { kind: 'stickers'; frets: readonly [number, number]; colors: MarkerColor[]; error: string | null };

/** Stickers in use (marker mode). */
interface Stickers {
  frets: readonly [number, number];
  colors: MarkerColor[];
}

const WIDE_QUERY = '(min-width: 1080px)';
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 540px)';

/** How long the green "heard it" flash lasts (ms). */
const FLASH_MS = 700;

export default function CameraScreen({ params }: RouteProps) {
  // ── What to show ────────────────────────────────────────────────────────────────────────────
  const paramKey = params.join('--');
  const [stored, setStored] = useLocalState<CameraContent>('camera.content', DEFAULT_CONTENT);
  const fromParams = useMemo(() => parseCameraParams(params), [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const content = useMemo(() => fromParams ?? sanitizeContent(stored), [fromParams, stored]);
  const setContent = useCallback(
    (c: CameraContent) => {
      setStored(c);
      redirect('camera', ...cameraParams(c));
    },
    [setStored],
  );

  // ── The learner's settings ──────────────────────────────────────────────────────────────────
  const prefs = usePrefs();
  const mirrored = cameraMirrored(prefs);
  const learner = learnerTuning(prefs);
  const music = useMusicSettings();
  const naming = music.naming as Naming;
  const leftHanded = music.leftHanded;
  const [storedGuitar, setGuitar] = useLocalState<GuitarKind>('camera.guitar', defaultGuitarKind(learner));
  const guitar: GuitarKind = isGuitarKind(storedGuitar) ? storedGuitar : 'steel';
  const [storedCapo, setCapo] = useLocalState<number>('camera.capo', 0);
  const capo = Number.isInteger(storedCapo) && storedCapo >= 0 && storedCapo <= 12 ? storedCapo : 0;
  const [storedLabels, setLabels] = useLocalState<LabelMode>('camera.labels', 'degree');
  const labels: LabelMode = storedLabels === 'note' || storedLabels === 'finger' ? storedLabels : 'degree';
  const [bassUp, setBassUp] = useLocalState<boolean>('camera.bassUp', true);
  const [handsOn, setHandsOn] = useLocalState<boolean>('camera.hands', false);
  const [drillPrefs, setDrillPrefs] = useLocalState<{ revealed: boolean; accidentals: boolean }>('camera.drill', { revealed: true, accidentals: false });
  const [blockedBefore, setBlockedBefore] = useLocalState<boolean>('camera.blockedOnce', false);
  const reducedMotion = usePrefersReducedMotion();
  const wide = useMediaQuery(WIDE_QUERY);
  const sideways = useMediaQuery(SIDEWAYS_QUERY);

  /** The tuning the shapes are built in: the learner's, or a standard one for another guitar type. */
  const neckTuning = useMemo(() => {
    const n = stringCountOf(guitar);
    if (learner.stringCount === n) return learner;
    return tuningFor(n === 7 ? 'standard-7' : n === 4 ? 'bass' : 'standard');
  }, [learner, guitar]);
  const stringNames = useMemo(() => stringNamesFor(neckTuning, guitar), [neckTuning, guitar]);

  // ── Song and drill state ────────────────────────────────────────────────────────────────────
  const song = useSongMode(content.kind === 'song' ? content.id : null, content.kind === 'song');
  const [target, setTarget] = useState<DrillTarget | null>(null);
  const [found, setFound] = useState(0);
  const [revealNow, setRevealNow] = useState(false);
  const drillKey = content.kind === 'note' ? `${content.note}:${content.string}:${drillPrefs.accidentals}:${neckTuning.id}:${capo}` : '';
  const drillOptions = useMemo(
    () => (content.kind === 'note' ? { tuning: neckTuning, capo, string: content.string, note: content.note, accidentals: drillPrefs.accidentals } : null),
    [drillKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    setTarget(drillOptions ? nextTarget(drillOptions, null) : null);
  }, [drillOptions]);
  const nextNote = useCallback(() => {
    if (drillOptions) setTarget((t) => nextTarget(drillOptions, t));
    setRevealNow(false);
  }, [drillOptions]);

  // ── The notes on the neck (frets from the capo) ─────────────────────────────────────────────
  const setup = useMemo(() => ({ tuning: neckTuning, capo }), [neckTuning, capo]);
  const derived = useMemo(() => {
    if (content.kind === 'scale') {
      const s = scaleNotes(content, setup);
      return { notes: s.notes, shapes: s.options, shape: s.shape, voicingLabel: '', voicingCount: 0, muted: [] as number[], title: scaleTitle(content, naming), detail: `${s.shape.name} · ${s.shape.where}` };
    }
    if (content.kind === 'chord') {
      const c = chordNotes(content, setup);
      return { notes: c.notes, shapes: [], shape: null, voicingLabel: c.voicing?.label ?? '', voicingCount: c.count, muted: c.muted, title: chordTitle(content.symbol, naming), detail: c.voicing?.label ?? '' };
    }
    return { notes: [] as ShowNote[], shapes: [], shape: null, voicingLabel: '', voicingCount: 0, muted: [] as number[], title: '', detail: '' };
  }, [content, setup, naming]);

  const songNotes = useMemo(() => (song.plan ? stepNotes(song.plan.steps, song.step) : []), [song.plan, song.step]);
  const drillShown = content.kind === 'note' && target && (drillPrefs.revealed || revealNow);
  const notes: ShowNote[] = content.kind === 'song' ? songNotes : content.kind === 'note' ? (drillShown && target ? [drillNote(target)] : []) : derived.notes;
  const capoInUse = content.kind === 'song' ? song.plan?.capo ?? 0 : capo;
  const labelsInUse: LabelMode = content.kind === 'song' || content.kind === 'note' ? 'note' : labels;
  const overlayNotes = useMemo(() => toOverlay(notes, capoInUse, labelsInUse, naming), [notes, capoInUse, labelsInUse, naming]);
  const fmt = useCallback((n: string) => formatNote(n, { system: naming }), [naming]);
  const title =
    content.kind === 'song'
      ? song.title
      : content.kind === 'note'
        ? target
          ? `Find ${fmt(target.note)}`
          : 'Find a note'
        : derived.title;
  const summary =
    content.kind === 'song'
      ? `Now: ${describeStep(song.plan?.steps[song.step], fmt)}`
      : content.kind === 'note'
        ? target
          ? `Find ${fmt(target.note)} on string ${target.string}`
          : 'Find a note'
        : `${derived.title} · ${derived.detail}`;
  useScreenTitle(title || null);

  // ── Camera and tracker ──────────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageSize = useRef({ width: 0, height: 0 });
  const [stickers, setStickers] = useState<Stickers | null>(null);
  const tracker = useMemo<VisionOptions>(
    () => ({
      model: neckFor(guitar),
      bassSideUp: bassUp,
      leftHanded,
      mirrored: false,
      ...(stickers ? { markers: { frets: [...stickers.frets], placement: 'bass-edge' as const, colors: stickers.colors } } : { markers: undefined }),
    }),
    [guitar, bassUp, leftHanded, stickers],
  );

  const [status, setStatus] = useState<LiveStatus>(STARTING_STATUS);
  const [said, setSaid] = useState('');
  const statusRef = useRef<LiveStatus>(STARTING_STATUS);
  const lostSince = useRef<number | null>(null);
  const notesRef = useRef(overlayNotes);
  notesRef.current = overlayNotes;
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;
  const namesRef = useRef(stringNames);
  namesRef.current = stringNames;
  const paletteRef = useRef<StagePalette | null>(null);
  const flashes = useRef<Flash[]>([]);
  const frozen = useRef(false);
  const handsRef = useRef(false);
  const fingersRef = useRef<FingerReading[] | null>(null);
  const handTextAt = useRef(0);
  const [handText, setHandText] = useState<{ tone: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const onUpdate = useCallback((pu: PipelineUpdate) => {
    const u = pu.update;
    const now = performance.now();
    if (u.state === 'lost') lostSince.current = lostSince.current ?? now;
    else lostSince.current = null;
    const next = describeStatus(u, lostSince.current === null ? 0 : now - lostSince.current);
    const prev = statusRef.current;
    statusRef.current = next;
    if (!sameStatus(prev, next)) {
      setStatus(next);
      if (prev.word !== next.word || prev.message !== next.message) setSaid(announcement(next));
    }
  }, []);

  const handFrameRef = useRef<HandFrame | null>(null);

  const onRender = useCallback((r: PipelineRender) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || frozen.current) return;
    const box = stageSize.current;
    if (!(box.width > 0 && box.height > 0)) return;
    const dpr = fitOverlayCanvas(canvas, box.width, box.height);
    if (!paletteRef.current) paletteRef.current = readStagePalette(canvas);
    const s = statusRef.current;
    const u = r.latest?.update;
    const view = { width: box.width, height: box.height, mirrored: mirroredRef.current, fit: 'contain' as const };
    const pose = r.pose;
    // Fingertips: the newest hand landmarks read through this frame's pose (only on a locked board).
    let fingers: FingerReading[] | null = null;
    const hf = handFrameRef.current;
    if (handsRef.current && pose && s.state === 'locked' && hf && r.timeMs - hf.at < 600) fingers = frettingHand(hf.hands, pose)?.fingers ?? null;
    fingersRef.current = fingers;
    const res = drawFrame(ctx, {
      view,
      pose,
      state: u?.state ?? 'searching',
      confidence: u?.confidence ?? 0,
      numberingGuess: u ? !u.numberingConfirmed : false,
      notes: notesRef.current,
      noteMode: s.notes,
      question: s.question,
      flashes: flashes.current,
      fingers,
      stringNames: namesRef.current,
      timeMs: r.timeMs,
      dpr,
      reducedMotion: reducedRef.current,
      palette: paletteRef.current,
    });
    flashes.current = flashes.current.filter((f) => f.until > r.timeMs);
    if (handsRef.current && r.timeMs - handTextAt.current > 500) {
      handTextAt.current = r.timeMs;
      const advice = fingers ? handAdvice(fingers) : null;
      setHandText((prev) => (prev?.text === advice?.text ? prev : advice));
    }
    cameraDebug.frames++;
    const hook = cameraDebug.hook;
    const video = videoRef.current;
    if (hook && video) {
      hook({
        timeMs: r.timeMs,
        video,
        view,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        state: u?.state ?? 'searching',
        notes: s.notes,
        markers: res.markers.map((m) => ({ string: m.string, fret: m.note.fret, x: m.x, y: m.y, ghost: !!m.note.ghost })),
        numbering: u?.pose?.numbering ?? null,
        guidance: u?.guidance.code ?? null,
        trust: u?.guidance.trust ?? null,
        confidence: u?.confidence ?? 0,
        flashes: flashes.current.map((f) => ({ string: f.string, fret: f.fret })),
      });
    }
  }, []);

  const camera = useLiveCamera({ videoRef, tracker, onRender, onUpdate, deviceId: cameraDeviceId(prefs) });
  const live = camera.phase === 'running';
  const handStatus = useHands(handsOn && live, videoRef, handFrameRef);
  handsRef.current = handsOn && handStatus === 'on';
  useEffect(() => {
    if (!handsRef.current) setHandText(null);
    // Not available here: the switch goes back off (on again tries once more).
    if (handStatus === 'unavailable' && handsOn) setHandsOn(false);
  }, [handStatus, handsOn, setHandsOn]);
  useWakeLock(live);

  // The stage's size, for the overlay canvas (read per frame from a ref, never from layout).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      stageSize.current = { width: el.clientWidth, height: el.clientHeight };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The palette follows the theme.
  useEffect(() => {
    const reset = () => {
      paletteRef.current = null;
    };
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', reset);
    const mo = new MutationObserver(reset);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => {
      mq.removeEventListener('change', reset);
      mo.disconnect();
    };
  }, []);

  // A fresh start shows the starting status, not the last session's.
  useEffect(() => {
    if (camera.phase === 'starting' || camera.phase === 'idle') {
      statusRef.current = STARTING_STATUS;
      setStatus(STARTING_STATUS);
      lostSince.current = null;
      clearOverlay(canvasRef.current);
    }
  }, [camera.phase]);

  // ── Without a camera ────────────────────────────────────────────────────────────────────────
  const [drawn, setDrawn] = useState(false);
  const hostRefuses = isArtifact();
  const failure = camera.phase === 'blocked' ? camera.failure : hostRefuses && camera.phase === 'idle' ? 'blocked-by-host' : null;
  const mode: 'guide' | 'starting' | 'live' | 'blocked' | 'drawn' | 'hidden' = drawn
    ? 'drawn'
    : live
      ? 'live'
      : camera.phase === 'starting'
        ? 'starting'
        : camera.phase === 'hidden'
          ? 'hidden'
          : failure
            ? blockedBefore
              ? 'drawn'
              : 'blocked'
            : 'guide';
  const goDrawn = useCallback(() => {
    if (failure) setBlockedBefore(true);
    setDrawn(true);
    camera.stop();
  }, [failure, setBlockedBefore, camera]);
  const startCamera = useCallback(() => {
    setDrawn(false);
    void unlockAudio();
    void camera.start();
  }, [camera]);

  // ── Full screen focus ───────────────────────────────────────────────────────────────────────
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [guitarSheet, setGuitarSheet] = useState(false);
  const [capoSheet, setCapoSheet] = useState(false);
  const [capoAsked, setCapoAsked] = useState(false);
  const [numbersChecked, setNumbersChecked] = useState(false);
  // Held sideways, a phone has no height to spare: the tab bar goes from the start.
  useImmersive(true, focus ? 'bare' : mode === 'live' || mode === 'starting' || sideways ? 'focus' : 'none');
  useEffect(() => {
    if (!live) setFocus(false);
  }, [live]);
  useEffect(() => {
    if (!focus) return;
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    } catch {
      // Not allowed here (an embedded viewer): the focus layout alone is fine.
    }
    const onChange = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      } catch {
        // ignore
      }
    };
  }, [focus]);

  // ── The microphone check ────────────────────────────────────────────────────────────────────
  const [hits, setHits] = useState<string[]>([]);
  const recent = useRef<Array<{ midi: number; at: number }>>([]);
  const capoRef = useRef(capoInUse);
  capoRef.current = capoInUse;
  const flash = useCallback((positions: Array<{ string: number; fret: number }>, onWood: boolean) => {
    const until = performance.now() + FLASH_MS;
    flashes.current = [...flashes.current, ...positions.map((p) => ({ string: p.string, fret: onWood ? p.fret : p.fret + capoRef.current, until }))];
    const keys = positions.map((p) => `${p.string}:${onWood ? p.fret - capoRef.current : p.fret}`);
    setHits(keys);
    setTimeout(() => setHits((h) => (h === keys ? [] : h)), FLASH_MS);
  }, []);
  const heardRef = useRef<(midi: number) => void>(() => undefined);
  heardRef.current = (midi: number) => {
    const at = performance.now();
    recent.current = [...recent.current.filter((r) => at - r.at < 1500), { midi, at }];
    if (content.kind === 'note') {
      if (target && answers(target, midi)) {
        flash([{ string: target.string, fret: target.fret }], false);
        setRevealNow(true);
        setFound((n) => n + 1);
        playUi('correct');
        setTimeout(nextNote, FLASH_MS + 200);
      }
      return;
    }
    if (content.kind === 'song') {
      const step = song.plan?.steps[song.step];
      if (!step) return;
      const hit = step.notes.filter((n) => n.midi === midi);
      if (hit.length) flash(hit, false);
      if (!song.playing && stepHeard(step, recent.current.map((r) => r.midi))) {
        recent.current = [];
        setTimeout(() => song.next(), 250);
      }
      return;
    }
    const hit = matchHeard(notes, midi);
    if (hit.length) flash([hit[0]], false);
  };
  const listen = useListen((midi) => heardRef.current(midi));
  const listenMessage =
    listen.status === 'failed' && listen.failure
      ? explainMediaFailure(listen.failure, 'microphone').title
      : listen.status === 'starting'
        ? 'Starting the microphone…'
        : listen.status === 'on'
          ? 'Listening: play a note that is shown.'
          : null;

  // ── Marking tools ───────────────────────────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool | null>(null);
  const toolRef = useRef<Tool | null>(null);
  toolRef.current = tool;
  const view = useCallback(() => ({ width: stageSize.current.width, height: stageSize.current.height, mirrored: mirroredRef.current, fit: 'contain' as const }), []);
  const freeze = useCallback((on: boolean) => {
    frozen.current = on;
    const p = camera.pipeline.current;
    if (on) p?.pause();
    else p?.resume();
    freezeVideo(videoRef.current, on);
  }, [camera.pipeline]);
  const endTool = useCallback(() => {
    if (frozen.current) freeze(false);
    setTool(null);
  }, [freeze]);
  const openTool = useCallback(
    (kind: Tool['kind'], preset?: Point) => {
      if (!live) return;
      setSheet(false);
      if (kind === 'calibrate') {
        freeze(true);
        clearOverlay(canvasRef.current);
        setTool({ kind, pair: DEFAULT_WIRES, taps: [], error: null, choosing: false });
      } else if (kind === 'stickers') {
        freeze(true);
        clearOverlay(canvasRef.current);
        setTool({ kind, frets: DEFAULT_STICKER_FRETS, colors: [], error: null });
      } else {
        if (preset) freeze(true);
        setTool({ kind, tap: preset ?? null, current: preset ? fretUnder(preset) : null, error: null });
      }
    },
    [live, freeze], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** The fret the tracker gives the cell under a stage point (null when it is not on the board). */
  const fretUnder = (p: Point): number | null => {
    const pose = camera.pipeline.current?.latest?.update.pose;
    if (!pose) return null;
    const loc = locatePixel(pose, displayToFrame(p, view(), pose.frameWidth, pose.frameHeight));
    return loc && loc.onBoard && loc.fret >= 1 ? loc.fret : null;
  };
  const toVideo = (p: Point): Point => {
    const v = camera.pipeline.current?.videoSize ?? { width: 0, height: 0 };
    return displayToFrame(p, view(), v.width, v.height);
  };
  const onTap = async (p: Point) => {
    const t = toolRef.current;
    const pipeline = camera.pipeline.current;
    if (!t || !pipeline) return;
    if (t.kind === 'calibrate') {
      const taps = [...t.taps, p];
      if (taps.length % 2 === 0 && tooClose(taps[taps.length - 2], p, 12)) {
        setTool({ ...t, error: 'The two ends of a wire need to be apart: tap the other edge of the neck.' });
        return;
      }
      if (taps.length < 4) {
        setTool({ ...t, taps, error: null });
        return;
      }
      const size = pipeline.videoSize;
      const pair = wireTaps(t.pair, taps.map(toVideo));
      const pose = pair ? poseFromWireTaps(pair[0], pair[1], size.width, size.height, { model: neckFor(guitar), bassSideUp: bassUp, leftHanded, mirrored: false }) : null;
      if (!pose) {
        setTool({ ...t, taps: [], error: 'Those taps do not look like a guitar neck. Try again: tap where each wire meets the edges of the neck.' });
        playUi('wrong');
        return;
      }
      setTool({ ...t, taps });
      await pipeline.calibrate(pose);
      endTool();
      playUi('correct');
      toast.ok('Neck marked', { description: 'The dots follow your neck from here.' });
      return;
    }
    if (t.kind === 'numbers') {
      if (!frozen.current) freeze(true);
      setTool({ ...t, tap: p, current: fretUnder(p), error: null });
      return;
    }
    const color = await pipeline.sampleMarkerColor(toVideo(p));
    const cur = toolRef.current;
    if (!cur || cur.kind !== 'stickers') return;
    if (!color) {
      setTool({ ...cur, error: 'That is not colourful enough to follow: tap right on the tape. Bright red, green, blue or pink tape works best.' });
      return;
    }
    const colors = [...cur.colors, color];
    if (colors.length < 2) {
      setTool({ ...cur, colors, error: null });
      return;
    }
    setStickers({ frets: cur.frets, colors });
    endTool();
    toast.ok('Stickers in use', { description: `The camera now looks for your stickers at frets ${cur.frets[0]} and ${cur.frets[1]}.` });
  };
  const chooseFret = async (n: number) => {
    const t = toolRef.current;
    const pipeline = camera.pipeline.current;
    if (!t || t.kind !== 'numbers' || !t.tap || !pipeline) return;
    const ok = await pipeline.confirmFret(toVideo(t.tap), n);
    endTool();
    if (ok) setNumbersChecked(true);
    if (ok) toast.ok(`That is fret ${n} now`, { description: 'Every other fret is numbered from it.' });
    else toast.warn('That spot is not on the neck', { description: 'Tap inside a fret, between two metal wires.' });
  };
  const shiftAll = async (d: number) => {
    await camera.pipeline.current?.shiftNumbering(d);
    toast.info(d > 0 ? 'Every fret number one higher' : 'Every fret number one lower');
  };
  const confirmQuestion = async () => {
    await camera.pipeline.current?.confirmNumbering();
    playUi('correct');
  };
  const questionPoint = (): Point | null => {
    const q = statusRef.current.question;
    const latest = camera.pipeline.current?.latest;
    if (!q || !latest) return null;
    return frameToDisplay({ x: q.x, y: q.y }, view(), latest.width, latest.height);
  };

  // Leaving the camera ends a tool.
  useEffect(() => {
    if (!live && toolRef.current) {
      frozen.current = false;
      setTool(null);
    }
  }, [live]);

  // ── Content steps (shared by the buttons and the arrow keys) ────────────────────────────────
  const stepContent = useCallback(
    (d: number) => {
      if (content.kind === 'scale' && derived.shapes.length) {
        const i = Math.max(0, derived.shapes.findIndex((s) => s.id === derived.shape?.id));
        setContent({ ...content, shape: derived.shapes[(i + d + derived.shapes.length) % derived.shapes.length].id });
      } else if (content.kind === 'chord' && derived.voicingCount > 1) {
        setContent({ ...content, voicing: (content.voicing + d + derived.voicingCount) % derived.voicingCount });
      } else if (content.kind === 'song') {
        if (d > 0) song.next();
        else song.previous();
      } else if (content.kind === 'note' && d > 0) nextNote();
    },
    [content, derived, setContent, song, nextNote],
  );

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('[role="dialog"]')) return;
    // Escape leaves a tool or full screen from anywhere on the screen, the tap layer included.
    if (e.key !== 'Escape' && el?.closest('input, select, textarea, [contenteditable="true"], [role="application"]')) return;
    const onControl = !!el?.closest('button, a, [role="radio"], [role="slider"], [role="tab"]');
    if (e.key === 'Escape') {
      if (toolRef.current) endTool();
      else if (focus) setFocus(false);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (onControl && el?.closest('[role="radio"], [role="slider"], [role="tab"]')) return;
      e.preventDefault();
      stepContent(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key === ' ' && !onControl) {
      e.preventDefault();
      if (content.kind === 'song') void song.toggle();
      else if (content.kind === 'note') nextNote();
      return;
    }
    if ((e.key === 'f' || e.key === 'F') && live) setFocus((v) => !v);
    if (e.key === 'm' || e.key === 'M') setPrefs({ camera: { mirrored: !mirrored } });
  });

  // ── The practice log ────────────────────────────────────────────────────────────────────────
  const logRef = useRef({ content, title, found });
  logRef.current = { content, title, found };
  const secondsRunning = camera.secondsRunning;
  useEffect(
    () => () => {
      const seconds = Math.round(secondsRunning());
      if (seconds < 10) return;
      const l = logRef.current;
      recordActivity({ kind: 'camera', durationSec: seconds, title: `Live fretboard: ${l.title}`, route: 'camera', params: cameraParams(l.content), count: l.found || undefined });
    },
    [secondsRunning],
  );

  // ── The drawn neck (no camera) and the preview ──────────────────────────────────────────────
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const markers = useMemo(
    () =>
      toFretMarkers(notes, labelsInUse, naming).map((m) => (hitSet.has(`${m.string}:${m.fret}`) ? { ...m, state: 'hit' as const } : m)),
    [notes, labelsInUse, naming, hitSet],
  );
  const range = useMemo(() => (content.kind === 'note' ? (notes.length ? boardRange(notes, capoInUse) : ([0, 12] as [number, number])) : content.kind === 'song' ? songRange(song.plan?.steps.flatMap((s) => s.notes) ?? [], capoInUse) : boardRange(notes, capoInUse)), [content.kind, notes, capoInUse, song.plan]);
  const onCell = useCallback(
    (cell: FretCell) => {
      void unlockAudio();
      pluck(cell.midi);
      if (content.kind === 'note' && target) {
        if (cell.string === target.string && cell.fret === target.fret) {
          flash([{ string: target.string, fret: target.fret }], false);
          setRevealNow(true);
          setFound((n) => n + 1);
          playUi('correct');
          setTimeout(nextNote, FLASH_MS + 200);
        } else {
          playUi('wrong');
          toast.info(`That is ${fmt(cell.note)}`, { description: `Look for ${fmt(target.note)} on string ${target.string}.`, id: 'camera-drill' });
        }
      }
    },
    [content.kind, target, flash, nextNote, fmt],
  );

  // ── Props for the controls ──────────────────────────────────────────────────────────────────
  const steps = song.plan?.steps ?? [];
  const controls: ContentControlsProps = {
    content,
    onContent: setContent,
    naming,
    labels,
    onLabels: setLabels,
    shapes: derived.shapes,
    shape: derived.shape,
    voicingLabel: derived.voicingLabel,
    voicingCount: derived.voicingCount,
    song: {
      choices: song.choices,
      songId: song.songId,
      now: describeStep(steps[song.step], fmt),
      next: steps[song.step + 1] ? describeStep(steps[song.step + 1], fmt) : '',
      playing: song.playing,
      loading: song.loading,
      error: song.error,
      tempo: song.tempo,
      bpm: song.bpm,
      step: song.step,
      steps: steps.length,
      capo: song.plan?.capo ?? 0,
      onToggle: () => void song.toggle(),
      onPrev: song.previous,
      onNext: song.next,
      onTempo: song.setTempo,
    },
    drill: {
      target: target ? fmt(target.note) : '–',
      where: target ? `on string ${target.string}${drillPrefs.revealed || revealNow ? `, fret ${target.fret + capo}` : ''}` : 'No note fits: pick another string',
      found,
      revealed: drillPrefs.revealed,
      accidentals: drillPrefs.accidentals,
      onNext: nextNote,
      onReveal: (v) => setDrillPrefs({ ...drillPrefs, revealed: v }),
      onAccidentals: (v) => setDrillPrefs({ ...drillPrefs, accidentals: v }),
    },
    listen: {
      on: listen.status === 'on' || listen.status === 'starting',
      busy: listen.status === 'starting',
      message: listenMessage,
      onChange: (v) => (v ? void listen.start() : listen.stop()),
    },
    compact: sideways,
  };
  const tracking = {
    live,
    onCalibrate: () => openTool('calibrate'),
    onNumbers: () => openTool('numbers'),
    onStickers: () => openTool('stickers'),
    stickersOn: !!stickers,
    onStickersOff: () => setStickers(null),
    guitar,
    onGuitar: setGuitar,
    capo,
    onCapo: setCapo,
    devices: camera.devices,
    device: camera.activeDevice,
    onDevice: (id: string) => {
      setPrefs({ camera: { deviceId: id } });
      void camera.start(id);
    },
    mirrored,
    onMirrored: (v: boolean) => setPrefs({ camera: { mirrored: v } }),
    bassUp,
    onBassUp: setBassUp,
    hands: { on: handsOn, status: handStatus, onChange: setHandsOn },
  };

  // ── The stage ───────────────────────────────────────────────────────────────────────────────
  const offer = status.offers.find((o) => o !== 'confirm-fret');
  const offerButton =
    offer === 'calibrate' ? (
      <HudButton icon="Crosshair" onClick={() => openTool('calibrate')}>
        Mark the neck
      </HudButton>
    ) : offer === 'guitar-type' ? (
      <HudButton icon="Guitar" onClick={() => setGuitarSheet(true)}>
        Guitar type
      </HudButton>
    ) : offer === 'fix-numbers' ? (
      <HudButton icon="Hash" onClick={() => openTool('numbers')}>
        Fix numbers
      </HudButton>
    ) : null;

  let bottom: ReactNode = null;
  if (tool?.kind === 'calibrate') {
    bottom = tool.choosing ? (
      <CoachBar
        icon="Ruler"
        actions={
          <>
            <HudButton onClick={() => setTool({ ...tool, choosing: false, taps: [] })} primary>
              Use these
            </HudButton>
            <HudButton onClick={endTool}>Cancel</HudButton>
          </>
        }
      >
        <span className={stage.wirePick}>
          <NumberStepper label="First wire" value={tool.pair.near} min={0} max={20} onChange={(v) => setTool({ ...tool, pair: validPair({ near: v, far: Math.max(v + 1, tool.pair.far) }) ?? tool.pair })} />
          <NumberStepper label="Second wire" value={tool.pair.far} min={1} max={22} onChange={(v) => setTool({ ...tool, pair: validPair({ near: Math.min(tool.pair.near, v - 1), far: v }) ?? tool.pair })} />
        </span>
      </CoachBar>
    ) : (
      <CoachBar
        actions={
          <>
            {tool.taps.length > 0 && <HudButton onClick={() => setTool({ ...tool, taps: tool.taps.slice(0, -1), error: null })}>Undo</HudButton>}
            <HudButton onClick={() => setTool({ ...tool, choosing: true, taps: [] })}>Other frets</HudButton>
            <HudButton onClick={endTool}>Cancel</HudButton>
          </>
        }
      >
        {tool.pair.near === 0 ? 'Nut not in the picture? Mark two other frets you can see.' : `Marking ${wireName(tool.pair.near)} and ${wireName(tool.pair.far)}.`}
      </CoachBar>
    );
  } else if (tool?.kind === 'numbers') {
    bottom = tool.tap ? (
      <CoachBar
        actions={
          <>
            <span className={stage.fretChips} role="group" aria-label="This fret is number">
              {fretChoices(tool.current).map((n) => (
                <button key={n} type="button" className={cx(stage.fretChip, n === tool.current && stage.fretChipNow)} onClick={() => void chooseFret(n)} aria-pressed={n === tool.current}>
                  {n}
                </button>
              ))}
            </span>
            <HudButton onClick={endTool}>Cancel</HudButton>
          </>
        }
      >
        {tool.current ? `The camera calls this fret ${tool.current}. What is it really?` : 'Which fret is this?'}
      </CoachBar>
    ) : (
      <CoachBar
        actions={
          <>
            <HudButton icon="Minus" onClick={() => void shiftAll(-1)}>
              All one lower
            </HudButton>
            <HudButton icon="Plus" onClick={() => void shiftAll(1)}>
              All one higher
            </HudButton>
            <HudButton onClick={endTool}>Done</HudButton>
          </>
        }
      >
        Or move every number at once.
      </CoachBar>
    );
  } else if (tool?.kind === 'stickers') {
    bottom = (
      <CoachBar actions={<HudButton onClick={endTool}>Cancel</HudButton>}>
        Stick two bits of bright tape on the edge of the neck by the thickest string, at frets {tool.frets[0]} and {tool.frets[1]}.
      </CoachBar>
    );
  } else if (live && status.offers.includes('confirm-fret') && status.question) {
    bottom = (
      <CoachBar
        icon="CircleHelp"
        tone="warn"
        actions={
          <>
            <HudButton primary onClick={() => void confirmQuestion()}>
              Yes, fret {status.question.fret}
            </HudButton>
            <HudButton onClick={() => openTool('numbers', questionPoint() ?? undefined)}>No, it is another</HudButton>
          </>
        }
      >
        Is the ringed fret number {status.question.fret}?
      </CoachBar>
    );
  } else if (live && status.message) {
    bottom = (
      <CoachBar icon={status.state === 'locked' ? 'Info' : status.state === 'lost' ? 'Hand' : 'Lightbulb'} tone={status.tone} actions={offerButton}>
        {status.message}
      </CoachBar>
    );
  } else if (live && status.state === 'locked' && !capoAsked) {
    // The camera cannot see a capo: ask once per visit, right after the first lock.
    bottom =
      capo > 0 ? (
        <CoachBar
          icon="Info"
          actions={
            <>
              <HudButton primary onClick={() => setCapoAsked(true)}>
                Still on
              </HudButton>
              <HudButton onClick={() => setCapoSheet(true)}>Change</HudButton>
            </>
          }
        >
          Locked. Your capo is at fret {capo}: is it still on?
        </CoachBar>
      ) : (
        <CoachBar
          icon="Info"
          actions={
            <>
              <HudButton primary onClick={() => setCapoAsked(true)}>
                No capo
              </HudButton>
              <HudButton onClick={() => setCapoSheet(true)}>I use a capo</HudButton>
            </>
          }
        >
          Locked. Is there a capo on your guitar?
        </CoachBar>
      );
  } else if (live && status.state === 'locked' && guitar === 'classical' && !numbersChecked) {
    // Classical necks (slotted headstock, dark nut) can be numbered a fret or two off with confidence.
    bottom = (
      <CoachBar
        icon="CircleHelp"
        tone="warn"
        actions={
          <>
            <HudButton
              primary
              onClick={() => {
                setNumbersChecked(true);
                void confirmQuestion();
              }}
            >
              Yes, they match
            </HudButton>
            <HudButton icon="Hash" onClick={() => openTool('numbers')}>
              Fix numbers
            </HudButton>
          </>
        }
      >
        On classical guitars the numbers can come out a fret or two off. Is the 5 under your 5th fret?
      </CoachBar>
    );
  } else if (live) {
    bottom = (
      <CoachBar icon="Check" tone="ok">
        {summary}
      </CoachBar>
    );
  }

  const toolBanner =
    tool?.kind === 'calibrate' && !tool.choosing ? (
      <ToolBanner title="Mark the neck" text={tapSteps(tool.pair)[Math.min(3, tool.taps.length)].prompt} step={tool.taps.length} steps={4} error={tool.error} />
    ) : tool?.kind === 'calibrate' ? (
      <ToolBanner title="Pick two frets you can see" text="Count the metal wires from the nut. The wider apart, the better." />
    ) : tool?.kind === 'numbers' ? (
      <ToolBanner title="Fix the fret numbers" text={tool.tap ? 'Pick the right number below.' : 'Tap a fret on the picture whose number you know.'} error={tool.error} />
    ) : tool?.kind === 'stickers' ? (
      <ToolBanner title="Use two stickers" text={stickerPrompt(tool.colors.length, tool.frets)} step={tool.colors.length} steps={2} error={tool.error} />
    ) : null;

  const tapLabel = tool?.kind === 'calibrate' ? 'The still picture: tap to mark the neck.' : tool?.kind === 'stickers' ? 'The still picture: tap a sticker.' : 'The picture: tap a fret.';
  const showTapLayer = !!tool && !(tool.kind === 'calibrate' && tool.choosing) && !(tool.kind === 'numbers' && tool.tap);

  /** On a phone held upright the picture is short: the coaching line goes under it, not over the neck. */
  const coachOnStage = focus || wide || sideways;

  const stageNode = (
    <div
      ref={stageRef}
      className={cx(stage.stage, focus && stage.focus, mode === 'drawn' && stage.drawn)}
      data-camera-stage=""
      data-mode={mode}
      data-fitted={live && camera.aspect ? '' : undefined}
      style={live && camera.aspect ? ({ '--video-aspect': String(camera.aspect) } as CSSProperties) : undefined}
    >
      <video ref={videoRef} className={cx(stage.video, mirrored && stage.mirrored, !live && stage.off)} muted playsInline aria-label="Your camera picture" />
      <canvas ref={canvasRef} className={cx(stage.canvas, !live && stage.off)} aria-hidden="true" />
      {mode === 'guide' && <SetupGuide onStart={startCamera} starting={false} onDrawn={() => setDrawn(true)} />}
      {mode === 'starting' && (
        <div className={stage.center}>
          <Spinner size={28} tone="current" />
          <p className={stage.centerText}>Starting the camera…</p>
          <p className={stage.centerHint}>If your browser asks, allow the camera.</p>
        </div>
      )}
      {mode === 'hidden' && (
        <div className={stage.center}>
          <Icon name="CameraOff" size="lg" />
          <p className={stage.centerText}>The camera is off while this tab is hidden.</p>
          <Button variant="primary" iconLeft="Camera" onClick={startCamera}>
            Turn it back on
          </Button>
        </div>
      )}
      {mode === 'blocked' && failure && (
        <div className={stage.center}>
          <div className={stage.blockedCard}>
            <MediaBlocked reason={failure} device="camera" onRetry={hostRefuses ? undefined : startCamera} onContinueWithout={goDrawn} continueLabel="Use a drawn neck" align="start" level={2} />
          </div>
        </div>
      )}
      {mode === 'drawn' && (
        <div className={stage.drawnNeck} data-camera-drawn="">
          <Fretboard frets={range} markers={markers} muted={content.kind === 'chord' ? derived.muted : undefined} capo={capoInUse || undefined} tuning={content.kind === 'song' && song.plan ? [...song.plan.tuning] : neckTuning} onCellClick={onCell} fretNumbers="all" size={sideways ? 'md' : 'lg'} />
        </div>
      )}
      {live && (
        <div className={stage.hud}>
          <div className={stage.hudTop}>
            <StatusPill status={status} />
            <div className={stage.hudTools}>
              {(sideways || focus) && <IconButton icon="SlidersHorizontal" label="Show the controls" variant="secondary" className={stage.hudIcon} onClick={() => setSheet(true)} />}
              <IconButton icon="FlipHorizontal2" label="Mirror the picture (M)" variant="secondary" pressed={mirrored} className={stage.hudIcon} onClick={() => setPrefs({ camera: { mirrored: !mirrored } })} />
              <IconButton icon={focus ? 'Minimize2' : 'Maximize2'} label={focus ? 'Leave full screen (Esc)' : 'Full screen (F)'} variant="secondary" className={stage.hudIcon} onClick={() => setFocus((v) => !v)} />
              <IconButton icon="CameraOff" label="Turn the camera off" variant="secondary" className={stage.hudIcon} onClick={() => camera.stop()} />
            </div>
          </div>
          {toolBanner}
          {showTapLayer && <TapLayer taps={tool?.kind === 'calibrate' ? tool.taps : []} onTap={(p) => void onTap(p)} label={tapLabel} />}
          <div className={stage.hudBottom}>
            {handText && !tool && (
              <p className={stage.handLine} data-tone={handText.tone}>
                <span className={stage.beta}>Experimental</span> {handText.text}
              </p>
            )}
            {coachOnStage ? bottom : null}
          </div>
        </div>
      )}
    </div>
  );

  const privacy = (
    <p className={styles.privacy}>
      <Icon name="ShieldCheck" size="xs" /> The video stays on this device: nothing is recorded or sent. The camera turns off when you leave this screen.
    </p>
  );

  const preview =
    mode !== 'drawn' && !sideways && notes.length > 0 ? (
      <div className={styles.preview}>
        <Text variant="label" tone="muted" as="p">
          {content.kind === 'song' ? 'Now and next' : content.kind === 'note' ? 'Where it is' : content.kind === 'chord' ? 'The chord shape' : 'The shape'}
        </Text>
        <Fretboard frets={range} markers={markers} muted={content.kind === 'chord' ? derived.muted : undefined} capo={capoInUse || undefined} tuning={content.kind === 'song' && song.plan ? [...song.plan.tuning] : neckTuning} size="sm" onCellClick={onCell} cellLabels="note" />
      </div>
    ) : null;

  const panel = (
    <>
      <section className={styles.block} aria-labelledby="camera-show">
        <h2 id="camera-show" className={styles.blockTitle}>
          Show on the neck
        </h2>
        <ContentControls {...controls} />
        {preview}
      </section>
      <section className={styles.block} aria-label={mode === 'drawn' ? 'Settings' : 'Tracking help and settings'}>
        <TrackingControls {...tracking} drawn={mode === 'drawn'} />
      </section>
    </>
  );

  return (
    <Page
      title="Live Fretboard"
      subtitle={mode === 'guide' ? 'Your camera finds the frets; the notes to play appear on your own neck.' : undefined}
      hideHeader={mode !== 'guide' || sideways}
      width="full"
      className={cx(styles.screen, (mode !== 'guide' || sideways) && styles.tight)}
      data-mode={mode}
      data-state={live ? status.state : ''}
      data-tool={tool?.kind ?? ''}
      data-content={content.kind}
      data-mirrored={mirrored ? 'true' : 'false'}
      data-hands={handStatus}
      data-listen={listen.status}
      data-step={content.kind === 'song' ? song.step : ''}
      data-pipeline={camera.mode}
    >
      <p className="sr-only" aria-live="polite">
        {live ? said : ''}
      </p>
      <div className={styles.layout} data-layout={sideways ? 'sideways' : wide ? 'wide' : 'stacked'}>
        <div className={styles.stageCol}>
          {mode === 'drawn' && (
            <Banner
              tone="neutral"
              icon="CameraOff"
              title={failure ? explainMediaFailure(failure, 'camera').title : 'A drawn neck instead of the camera'}
              actions={
                hostRefuses ? undefined : (
                  <Button size="sm" iconLeft="Camera" onClick={startCamera}>
                    Try the camera
                  </Button>
                )
              }
            >
              The same dots on a drawn neck. Tap a fret to hear it.
            </Banner>
          )}
          {stageNode}
          {live && !coachOnStage && bottom ? <div className={stage.under}>{bottom}</div> : null}
          {mode !== 'drawn' && !sideways && privacy}
          {mode === 'guide' && (
            <ul className={styles.tips} aria-label="Before you start">
              {SETUP_TIPS.map((t) => (
                <li key={t.title} className={styles.tip}>
                  <Icon name={t.icon} className={styles.tipIcon} />
                  <span>
                    <strong>{t.title}.</strong> {t.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className={styles.panel} aria-label="Controls">
          {sideways ? (
            <div className={styles.rail}>
              <p className={styles.railTitle}>{title}</p>
              <p className={styles.railDetail}>{content.kind === 'song' ? controls.song.now : content.kind === 'note' ? controls.drill.where : content.kind === 'scale' ? derived.shape?.where : derived.voicingLabel}</p>
              {content.kind === 'song' ? (
                <div className={styles.railRow}>
                  <IconButton icon="SkipBack" label="Previous note (Left arrow)" variant="secondary" onClick={() => stepContent(-1)} />
                  <Button variant="primary" iconLeft={song.playing ? 'Pause' : 'Play'} onClick={() => void song.toggle()}>
                    {song.playing ? 'Pause' : 'Play'}
                  </Button>
                  <IconButton icon="SkipForward" label="Next note (Right arrow)" variant="secondary" onClick={() => stepContent(1)} />
                </div>
              ) : content.kind === 'note' ? (
                <Button variant="primary" iconRight="ArrowRight" onClick={nextNote} fullWidth>
                  Next note
                </Button>
              ) : (
                <PrevNext
                  label={content.kind === 'scale' ? derived.shape?.name ?? 'Shape' : `Shape ${Math.min(content.voicing, Math.max(0, derived.voicingCount - 1)) + 1} of ${derived.voicingCount}`}
                  onPrev={() => stepContent(-1)}
                  onNext={() => stepContent(1)}
                  prevLabel="Previous shape (Left arrow)"
                  nextLabel="Next shape (Right arrow)"
                />
              )}
              <Button iconLeft="SlidersHorizontal" onClick={() => setSheet(true)} fullWidth>
                Controls
              </Button>
              {privacy}
            </div>
          ) : (
            panel
          )}
        </aside>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Live Fretboard controls" desktop="drawer">
        <div className={styles.sheetBody}>{panel}</div>
      </Sheet>
      <Sheet open={capoSheet} onClose={() => setCapoSheet(false)} title="Where is your capo?" description="The camera cannot see a capo. Frets count from it, as in tab, and the dots move up with it.">
        <RadioGroup
          label="Capo"
          variant="cards"
          minCardWidth="8rem"
          options={[{ value: '0', label: 'No capo' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: String(n), label: `Fret ${n}` }))]}
          value={String(capo)}
          onChange={(v: string) => {
            setCapo(Number(v));
            setCapoAsked(true);
            setCapoSheet(false);
          }}
        />
      </Sheet>
      <Sheet open={guitarSheet} onClose={() => setGuitarSheet(false)} title="Which guitar is this?" description="The camera fits the neck it expects. A wrong type never locks.">
        <RadioGroup
          label="Guitar type"
          variant="cards"
          options={GUITAR_KINDS.map((g) => ({ value: g.id, label: g.label, description: g.description }))}
          value={guitar}
          onChange={(v: GuitarKind) => {
            setGuitar(v);
            setGuitarSheet(false);
          }}
        />
      </Sheet>
    </Page>
  );
}

/** The frets a song needs on a drawn neck (all of its notes, so the board does not jump between steps). */
function songRange(all: readonly ShowNote[], capo: number): [number, number] {
  return boardRange(all, capo);
}
