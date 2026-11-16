/**
 * The Scales explorer (`#scales`): look a scale up, understand it, hear it and learn its shapes.
 *
 * Addresses (see `model/address.ts`): `#scales--a--minor-pentatonic--box-2`. The route params are
 * the source of truth for root, scale and shape; small view preferences (labels, tempo, what plays
 * underneath …) persist per device (`scales.settings`), and `#scales` alone reopens the last scale.
 *
 * How it is put together:
 *  - `model/` is pure and unit-tested: the picker's groups and search, the page model (formula,
 *    notes, chords, relatives, staff), the neck's markers (shape / all notes / connect / compare),
 *    the lines Play plays and their tab, the vamps and drones.
 *  - `audio/player.ts` plays a line on the audio transport and reports the note being *heard*,
 *    which lights the dot on the neck (and the note on the staff for "One octave").
 *  - `ui/` draws it with the kit: the neck is the hero, details in sections (two columns on wide
 *    screens), shape and Play controls in the thumb zone on phones.
 *
 * The root mirrors state for tests: `data-scale`, `data-tonic`, `data-shape`, `data-view`,
 * `data-playing`, `data-step` (index of the heard note, -1 when stopped), `data-lit` ("string:fret").
 *
 * Keyboard: ←/→ previous / next shape, ↑/↓ root up / down a semitone, Space play / stop, Esc closes
 * a sheet. Browser check: `node e2e/scales.cjs`.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { href, navigate, redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { normalizeTone, pluck, strum, unlockAudio, playUi } from '@/core/audio';
import { chordVoicings, type FretPosition, type PatternSystem, type SequenceKind } from '@/core/guitar';
import { markSkill, recordActivity, setPrefs, touchRecent, useProgress, usePrefs, useSkill } from '@/core/progress';
import { learnerTuning } from '@/core/settings';
import { chroma, formatDegree, formatNote, getScale, intervalName, noteToMidi, scaleSlug, scaleToneMap, toneAt, withOctaveFor } from '@/core/theory';
import {
  ActionBar,
  Button,
  Celebration,
  ChipGroup,
  IconButton,
  Kbd,
  Page,
  SegmentedControl,
  Text,
  Tooltip,
  cx,
  useEventListener,
  useIsMobile,
  useLocalState,
  useMediaQuery,
  useWakeLock,
} from '@/ui';
import { DegreeLegend, useMusicSettings, type FretCell, type TabViewHandle } from '@/ui/music';
import { ScalePlayer } from './audio/player';
import { DEFAULT_ADDRESS, arcadeParams, parseScaleParams, practiceEntry, scaleParams, shapeSkillId, type ScaleAddress } from './model/address';
import { droneFor, vampFor } from './model/backing';
import { displayScaleName, rootChoices, scaleTitle, stepRoot } from './model/catalog';
import {
  allNoteMarkers,
  compareMarkers,
  compareSummary,
  connectMarkers,
  neighbourOf,
  resolveShape,
  shapeBox,
  shapeMarkers,
  shapeRange,
  shapesFor,
  stepShape,
  systemsFor,
  withLit,
  type NeckSetup,
  type NeckView,
} from './model/neck';
import { familyModes, scalePageModel, staffLine } from './model/page';
import { buildLine, exerciseChoices, lineTab, tabPosition, type LineNote, type PlaySource } from './model/play';
import { DEFAULT_SETTINGS, labelInForce, sanitizeSettings, type ScreenSettings } from './model/settings';
import { ChordsSection, FormulaSection, IntervalsSection, MoodSection, RelativesSection, StaffSection } from './ui/Details';
import { Neck } from './ui/Neck';
import { ComparePanel, HearPanel, NeckOptions, PracticePanel, ShapePicker, shapeSummary } from './ui/Panels';
import { ScalePicker } from './ui/ScalePicker';
import styles from './ui/Scales.module.css';

const SETTINGS_KEY = 'scales.settings';
const LAST_KEY = 'scales.last';
/** Two columns of details from here up. */
const WIDE_QUERY = '(min-width: 1080px)';
/** A phone held sideways: the neck gets the screen. */
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** The kit's choice controls, memoised: the screen re-renders on every heard note, and they need not. */
const StableChips = memo(ChipGroup) as typeof ChipGroup;
const StableSegments = memo(SegmentedControl) as typeof SegmentedControl;

const VIEW_OPTIONS = [
  { value: 'shape', label: 'Shape' },
  { value: 'connect', label: 'Connect' },
  { value: 'all', label: 'All notes' },
];
const LABEL_OPTIONS = [
  { value: 'degree', label: 'Degrees' },
  { value: 'note', label: 'Notes' },
  { value: 'finger', label: 'Fingers' },
];
/** Fingers belong to a shape: on "All notes" and in a comparison there is no fingering to show. */
const LABEL_OPTIONS_NO_FINGERS = LABEL_OPTIONS.map((o) => (o.value === 'finger' ? { ...o, disabled: true } : o));

/** The first full sentence of a description (a colon does not end it). */
function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(text);
  return m ? m[0] : text;
}

/** A stored "last address", or null when it is not a real scale. */
function storedAddress(raw: unknown): ScaleAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ScaleAddress>;
  if (typeof r.tonic !== 'string' || typeof r.scale !== 'string') return null;
  return parseScaleParams(scaleParams({ tonic: r.tonic, scale: r.scale, shape: typeof r.shape === 'string' ? r.shape : null }));
}

/** Is this key press aimed at a control that uses the key itself? */
function ownsKey(target: EventTarget | null, key: string): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  const tag = el.tagName;
  if (el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (key === ' ' && (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button')) return true;
  // Radio groups (segmented controls, chips), the fretboard's cell grid, tabs and sliders move with arrows.
  if (key.startsWith('Arrow') && el.closest('[role="radiogroup"], [role="tablist"], [role="slider"], [role="spinbutton"], [data-neck], [role="listbox"], [role="menu"]')) return true;
  return false;
}

/** The Scales explorer. */
export default function ScalesScreen({ params }: RouteProps) {
  const prefs = usePrefs();
  const { naming, leftHanded } = useMusicSettings();
  const isPhone = useIsMobile();
  const wide = useMediaQuery(WIDE_QUERY);
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const veryShort = useMediaQuery('(max-height: 379px)');
  useImmersive(sideways, 'focus');
  /** Phone-style stage (full-bleed neck, view tools under it): phones, and any phone on its side. */
  const compact = isPhone || sideways;
  /** ◀ shape ▶ and Play in a bottom bar: an upright phone only (on its side there is no height to spare). */
  const useBar = isPhone && !sideways;

  const [stored, setStored] = useLocalState<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS);
  const settings = useMemo(() => sanitizeSettings(stored), [stored]);
  const update = useCallback((patch: Partial<ScreenSettings>) => setStored((prev: unknown) => ({ ...sanitizeSettings(prev), ...patch })), [setStored]);
  const [last, setLast] = useLocalState<unknown>(LAST_KEY, DEFAULT_ADDRESS);

  // ── where we are ────────────────────────────────────────────────────────────────────────
  const parsed = useMemo(() => parseScaleParams(params), [params]);
  const fallback = useMemo(() => storedAddress(last) ?? DEFAULT_ADDRESS, [last]);
  const address: ScaleAddress = parsed ?? fallback;
  const scale = getScale(address.scale) ?? getScale(DEFAULT_ADDRESS.scale)!;
  const tonic = address.tonic;

  // `#scales` alone (or an address that names nothing) shows the last scale: say so in the URL.
  useEffect(() => {
    if (!parsed) redirect('scales', ...scaleParams(fallback));
  }, [parsed, fallback]);
  useEffect(() => {
    if (parsed) setLast(parsed);
  }, [parsed?.tonic, parsed?.scale, parsed?.shape]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((next: ScaleAddress, push = false) => {
    (push ? navigate : redirect)('scales', ...scaleParams(next));
  }, []);

  // ── the neck ────────────────────────────────────────────────────────────────────────────
  const tuning = useMemo(() => learnerTuning(prefs), [prefs]);
  const lastFret = Math.max(12, Math.min(24, prefs.fretboard.frets || 15));
  const capo = settings.capo;
  const setup: NeckSetup = useMemo(() => ({ tuning, capo, lastFret }), [tuning, capo, lastFret]);

  const baseSystems = useMemo(() => systemsFor(scale.id, tuning), [scale.id, tuning]);
  const { systems, system, shapes, shape } = useMemo(() => resolveShape(tonic, scale.id, address.shape, setup, baseSystems), [tonic, scale.id, address.shape, setup, baseSystems]);
  // A shape this scale does not have here (an old link, a capo that pushed it off the neck): name the one on screen.
  useEffect(() => {
    if (parsed?.shape && parsed.shape !== (shape?.id ?? null)) redirect('scales', ...scaleParams({ ...parsed, shape: shape?.id ?? null }));
  }, [parsed, shape]);

  const [compare, setCompare] = useState<string | null>(null);
  useEffect(() => {
    if (compare === scale.id) setCompare(null);
  }, [compare, scale.id]);
  const view: NeckView = compare ? 'compare' : settings.view;
  const label = labelInForce(settings, prefs.fretboard.labels);
  const neighbour = useMemo(() => (shape && view === 'connect' ? neighbourOf(shapes, shape) : null), [shapes, shape, view]);

  const range: [number, number] = useMemo(() => {
    if (settings.range === 'custom') return [settings.custom[0], Math.max(settings.custom[0] + 4, settings.custom[1])];
    if (settings.range === 'shape' && shape) {
      const [a, b] = shapeRange(shape, setup);
      if (neighbour) {
        const [c, d] = shapeRange(neighbour, setup);
        return [Math.min(a, c), Math.max(b, d)];
      }
      return [a, b];
    }
    return [0, lastFret];
  }, [settings.range, settings.custom, shape, neighbour, setup, lastFret]);

  const baseMarkers = useMemo(() => {
    const ctx = { tonic, scale: scale.id, setup, range, label };
    if (view === 'compare' && compare) return compareMarkers(ctx, compare);
    if (view === 'all' || !shape) return allNoteMarkers(ctx);
    if (view === 'connect') return connectMarkers(ctx, shape, neighbour);
    return shapeMarkers(ctx, shape);
  }, [tonic, scale.id, setup, range, label, view, compare, shape, neighbour]);

  const box = useMemo(() => {
    if (!shape || view === 'all' || view === 'compare') return null;
    const both = neighbour ? [shape, neighbour] : [shape];
    return shapeBox(both, setup, neighbour ? `${shape.name} + ${neighbour.name}` : shape.name);
  }, [shape, neighbour, view, setup]);

  // ── sound ───────────────────────────────────────────────────────────────────────────────
  const tone = normalizeTone(prefs.sound.guitarTone, 'steel');
  const playerRef = useRef<ScalePlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [playingLine, setPlayingLine] = useState<{ line: LineNote[]; source: PlaySource } | null>(null);
  const [tapLit, setTapLit] = useState<FretPosition | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const loggedRef = useRef<{ address: ScaleAddress; title: string } | null>(null);
  /** Seconds of playing already handed to core/progress (by "Mark as learnt"), so time is never counted twice. */
  const loggedSecRef = useRef(0);
  useWakeLock(playing);

  useEffect(() => {
    const player = new ScalePlayer();
    playerRef.current = player;
    const offStep = player.onStep(setStep);
    const offState = player.onState(setPlaying);
    // Time played is logged (for the shape played last) when the learner leaves the screen, or the
    // app: on a phone, switching away or locking it may be the last thing this page ever hears.
    const logPractice = () => {
      const played = player.secondsPlayed();
      const entry = practiceEntry(loggedRef.current, played - loggedSecRef.current);
      if (!entry) return;
      recordActivity(entry);
      loggedSecRef.current = played;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') logPractice();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', logPractice);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', logPractice);
      offStep();
      offState();
      logPractice();
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  const vamp = useMemo(() => vampFor(tonic, scale.id), [tonic, scale.id]);
  const drone = useMemo(() => droneFor(tonic, scale.id), [tonic, scale.id]);
  const title = scaleTitle(tonic, scale, naming);
  useScreenTitle(title);

  const startLine = useCallback(
    (source: PlaySource) => {
      const player = playerRef.current;
      if (!player || !shape) return;
      void unlockAudio();
      const next = buildLine(shape, source, settings.direction, settings.sequence);
      setPlayingLine({ line: next, source });
      const here = { tonic, scale: scale.id, shape: shape.id };
      loggedRef.current = { address: here, title: `${title}, ${shape.name}` };
      void player.play({
        line: next,
        perBeat: settings.perBeat,
        bpm: settings.bpm,
        loop: settings.loop,
        accompaniment: settings.accompaniment,
        vamp,
        style: settings.style ?? undefined,
        drone,
        click: settings.click,
        clickSound: prefs.sound.clickSound,
        tone,
      });
      touchRecent({ route: 'scales', params: scaleParams(here), title, kind: 'scale-practice' });
    },
    [shape, settings, tonic, scale.id, title, vamp, drone, prefs.sound.clickSound, tone],
  );

  /** Play or stop. Without a source: the main Play (stops whatever plays). With one: that source's own button. */
  const togglePlay = useCallback(
    (source?: PlaySource) => {
      const player = playerRef.current;
      if (!player) return;
      if (player.playing && (source === undefined || playingLine?.source === source)) {
        player.stop();
        return;
      }
      startLine(source ?? settings.source);
    },
    [settings.source, playingLine, startLine],
  );

  // Changing what plays while it plays restarts it with the new line (tempo alone changes live).
  const playKey = JSON.stringify([shape?.id, tonic, scale.id, settings.source, settings.direction, settings.sequence, settings.perBeat, settings.loop, settings.accompaniment, settings.style, settings.click, capo, tuning.id]);
  const startedKey = useRef(playKey);
  const startedSource = useRef(settings.source);
  useEffect(() => {
    const sourceChanged = startedSource.current !== settings.source;
    startedSource.current = settings.source;
    if (!playing) {
      startedKey.current = playKey;
      return;
    }
    if (startedKey.current === playKey) return;
    startedKey.current = playKey;
    // A new "Play" choice plays that; anything else keeps playing what was playing, changed.
    if (playingLine) startLine(sourceChanged ? settings.source : playingLine.source);
  }, [playKey, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    playerRef.current?.setTempo(settings.bpm);
  }, [settings.bpm]);

  const litNote = playing && playingLine && step >= 0 ? playingLine.line[step] ?? null : null;
  const lit = litNote ? { string: litNote.string, fret: litNote.fret } : tapLit;
  const markers = useMemo(() => withLit(baseMarkers, lit), [baseMarkers, lit]);

  const map = useMemo(() => scaleToneMap(tonic, scale.id), [tonic, scale.id]);
  const onCellClick = useCallback(
    (cell: FretCell) => {
      void unlockAudio();
      pluck(cell.midi, undefined, { string: cell.string, tone, duration: 1.4 });
      const t = toneAt(map, cell.midi);
      const name = formatNote(t.note, { system: naming });
      const text = t.member ? `${name}: ${t.degree === '1' ? 'the root' : `${formatDegree(t.degree)}, ${intervalName(t.interval)}`}` : `${name}: not in this scale`;
      setTapLit({ string: cell.string, fret: cell.fret });
      setHeard(text);
    },
    [map, naming, tone],
  );
  // A tapped dot glows for a moment; the words stay until the next tap.
  useEffect(() => {
    if (!tapLit) return;
    const id = window.setTimeout(() => setTapLit(null), 700);
    return () => window.clearTimeout(id);
  }, [tapLit]);

  // ── the page model ──────────────────────────────────────────────────────────────────────
  const model = useMemo(() => scalePageModel(tonic, scale.id, naming), [tonic, scale.id, naming]);
  const modes = useMemo(() => familyModes(tonic, scale.id, naming), [tonic, scale.id, naming]);
  const staffRoot = useMemo(() => {
    const roots = shape?.notes.filter((n) => n.isRoot).map((n) => n.midi) ?? [];
    let midi = roots.length ? Math.min(...roots) : tuning.midi[0] + capo + ((chroma(tonic) - ((tuning.midi[0] + capo) % 12) + 12) % 12);
    if (midi > 60) midi -= 12;
    return withOctaveFor(tonic, midi);
  }, [shape, tuning, capo, tonic]);
  const staff = useMemo(() => staffLine(staffRoot, scale), [staffRoot, scale]);
  const staffMidis = useMemo(() => staff.notes.map((n) => noteToMidi(n)), [staff]);
  const staffDegrees = useMemo(() => [...scale.degrees, '1', ...scale.degrees.slice().reverse()], [scale]);
  // Props of the memoised sections stay the same objects while a line plays, so a heard note
  // re-renders the neck and not the whole page (on a slow phone that cost notes at fast tempos).
  const upMidis = useMemo(() => staffMidis.slice(0, staff.top + 1), [staffMidis, staff.top]);
  const staffHighlight = useMemo(() => {
    if (!litNote || playingLine?.source !== 'octave') return null;
    const index = settings.direction === 'down' ? staff.top + step : step;
    return staffMidis[index] === litNote.midi ? index : null;
  }, [litNote, playingLine, settings.direction, staff.top, step, staffMidis]);

  const playNote = useCallback(
    (midi: number) => {
      void unlockAudio();
      pluck(midi, undefined, { tone, duration: 1.4 });
    },
    [tone],
  );
  const playChord = useCallback(
    (symbol: string) => {
      void unlockAudio();
      try {
        const v = chordVoicings(symbol, { tuning })[0];
        if (v) strum(v.midi, undefined, { tone, direction: 'down' });
      } catch {
        playUi('tap');
      }
    },
    [tone, tuning],
  );

  // ── practice ────────────────────────────────────────────────────────────────────────────
  const exercises = useMemo(() => (shape ? exerciseChoices(shape) : []), [shape]);
  const sequence = exercises.some((e) => e.id === settings.sequence) ? settings.sequence : exercises[0]?.id ?? 'thirds';
  const exerciseLine = useMemo(() => (shape ? buildLine(shape, 'sequence', settings.direction, sequence) : []), [shape, settings.direction, sequence]);
  const tab = useMemo(() => lineTab(exerciseLine, settings.perBeat, { tuning, capo, tempo: settings.bpm, title: `${title} exercise` }), [exerciseLine, settings.perBeat, tuning, capo, settings.bpm, title]);
  const tabRef = useRef<TabViewHandle | null>(null);
  const playingExercise = playing && playingLine?.source === 'sequence';
  useEffect(() => {
    const handle = tabRef.current;
    if (!handle) return;
    if (!playingExercise || step < 0) handle.setCursor(null);
    else handle.setCursor(tabPosition(step, settings.perBeat));
  }, [playingExercise, step, settings.perBeat]);

  const skillId = shape ? shapeSkillId(tonic, scale.id, shape.id) : '';
  const skill = useSkill(skillId || 'scale:none');
  const prefix = `scale:${scaleSlug(tonic, scale.id)}:`;
  const learntKey = useProgress((s) =>
    Object.keys(s.skills)
      .filter((k) => k.startsWith(prefix) && (s.skills[k].mastery >= 1 || s.skills[k].completed))
      .map((k) => k.slice(prefix.length))
      .sort()
      .join(','),
  );
  const learnt = useMemo(() => new Set(learntKey ? learntKey.split(',') : []), [learntKey]);
  const [celebrate, setCelebrate] = useState(0);
  const markLearnt = useCallback(() => {
    if (!shape) return;
    const here = { tonic, scale: scale.id, shape: shape.id };
    recordActivity({
      kind: 'scale-practice',
      id: skillId,
      completed: true,
      durationSec: Math.round((playerRef.current?.secondsPlayed() ?? 0) - loggedSecRef.current),
      title: `${title}, ${shape.name}`,
      route: 'scales',
      params: scaleParams(here),
    });
    markSkill(skillId, { completed: true, masteryAtLeast: 1 });
    loggedSecRef.current = playerRef.current?.secondsPlayed() ?? 0;
    playUi('lessonComplete');
    setCelebrate((n) => n + 1);
  }, [shape, tonic, scale.id, skillId, title]);

  // ── compare ─────────────────────────────────────────────────────────────────────────────
  const summary = useMemo(() => (compare ? compareSummary(scale.id, compare) : null), [scale.id, compare]);
  const compareScale = compare ? getScale(compare) : null;

  // ── navigation and keys ─────────────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const moveShape = useCallback(
    (delta: number) => {
      const next = stepShape(shapes, shape?.id ?? null, delta);
      if (next) go({ tonic, scale: scale.id, shape: next.id });
    },
    [shapes, shape, go, tonic, scale.id],
  );
  const moveRoot = useCallback((delta: number) => go({ tonic: stepRoot(tonic, scale, delta), scale: scale.id, shape: shape?.id ?? null }), [go, tonic, scale, shape]);
  const roots = useMemo(() => rootChoices(scale, naming), [scale, naming]);
  const rootOptions = useMemo(() => roots.map((r) => ({ value: String(r.pc), label: r.label })), [roots]);
  const onRoot = useCallback((v: string) => go({ tonic: roots[Number(v)].tonic, scale: scale.id, shape: shape?.id ?? null }), [go, roots, scale.id, shape?.id]);
  const onView = useCallback((v: string) => update({ view: v as ScreenSettings['view'] }), [update]);
  const onLabel = useCallback((v: string) => update({ label: v as ScreenSettings['label'] }), [update]);
  const noteContext = useMemo(() => ({ tonic, scale: scale.id }), [tonic, scale.id]);
  const onSystem = useCallback((s: PatternSystem) => go({ tonic, scale: scale.id, shape: shapesFor(tonic, scale.id, s, setup)[0]?.id ?? null }), [go, tonic, scale.id, setup]);
  const onShape = useCallback((id: string) => go({ tonic, scale: scale.id, shape: id }), [go, tonic, scale.id]);
  const onSequence = useCallback((s: SequenceKind) => update({ sequence: s }), [update]);
  const onPlayExercise = useCallback(() => togglePlay('sequence'), [togglePlay]);
  const onCompare = useCallback(
    (id: string | null) => {
      setCompare(id);
      if (id && isPhone) document.querySelector('[data-neck]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [isPhone],
  );
  const playAlong = useMemo(() => arcadeParams('run-the-scale', tonic, scale.id, shape?.id ?? null), [tonic, scale.id, shape?.id]);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const onLeftHanded = useCallback((left: boolean) => setPrefs({ handedness: left ? 'left' : 'right' }), []);

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || pickerOpen || optionsOpen) return;
    if (ownsKey(e.target, e.key)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      moveShape(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveRoot(e.key === 'ArrowUp' ? 1 : -1);
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    }
  });

  const pickScale = useCallback(
    (t: string, id: string) => {
      setPickerOpen(false);
      setCompare(null);
      go({ tonic: t, scale: id, shape: null }, true);
    },
    [go],
  );

  // ── layout ──────────────────────────────────────────────────────────────────────────────
  const shapeLabel = shape ? shape.name : 'No shape';
  const shapeLine = shape ? shapeSummary(shape) : 'This scale has no shape in this tuning and capo.';
  const playLabel = playing ? 'Stop' : 'Play';
  const prevButton = (
    <Tooltip content="Previous shape (←)">
      <IconButton icon="ChevronLeft" label="Previous shape" onClick={() => moveShape(-1)} disabled={shapes.length < 2} noTooltip variant="secondary" />
    </Tooltip>
  );
  const nextButton = (
    <Tooltip content="Next shape (→)">
      <IconButton icon="ChevronRight" label="Next shape" onClick={() => moveShape(1)} disabled={shapes.length < 2} noTooltip variant="secondary" />
    </Tooltip>
  );
  const playButton = (
    <Tooltip content="Play or stop (Space)">
      <Button variant="primary" size="lg" iconLeft={playLabel === 'Stop' ? 'Square' : 'Play'} onClick={() => togglePlay()} className={styles.playButton} data-play disabled={!shape}>
        {playLabel}
      </Button>
    </Tooltip>
  );
  // Phones: ◀ shape ▶ and Play in the thumb zone.
  const transport = (
    <div className={styles.transport}>
      {prevButton}
      <div className={styles.transportShape} aria-live="polite">
        <span className={styles.transportName}>{shapeLabel}</span>
        <span className={styles.transportWhere}>{shape?.positionName ?? ''}</span>
      </div>
      {nextButton}
      {playButton}
    </div>
  );

  const viewTools = (
    <>
              {!compare && (
                <StableSegments aria-label="Show on the neck" size="sm" fullWidth={compact} options={VIEW_OPTIONS} value={settings.view} onChange={onView} />
              )}
              <StableSegments
                aria-label="Dot labels"
                size="sm"
                fullWidth={compact}
                options={view === 'all' || view === 'compare' ? LABEL_OPTIONS_NO_FINGERS : LABEL_OPTIONS}
                value={view === 'all' || view === 'compare' ? (label === 'finger' ? 'degree' : label) : label}
                onChange={onLabel}
              />
    </>
  );

  const legend =
    view === 'compare' && summary ? (
      <Text variant="caption" tone="muted" as="p">
        Plain dots are in both scales. <span className={styles.legendKey} data-c="info" aria-hidden="true">■</span> squares: only in {displayScaleName(scale)} · <span className={styles.legendKey} data-c="accent" aria-hidden="true">◆</span> diamonds: only in {compareScale ? displayScaleName(compareScale) : ''}
      </Text>
    ) : view === 'connect' && neighbour ? (
      <Text variant="caption" tone="muted" as="p">
        Squares are in both {shape?.name} and {neighbour.name}: slide between the shapes on those notes. Faint dots belong to {neighbour.name}.
      </Text>
    ) : label === 'finger' && view !== 'all' ? (
      <ul className={styles.fingerLegend} aria-label="Fingers">
        {['index', 'middle', 'ring', 'little'].map((name, i) => (
          <li key={name}>
            <span className={styles.fingerDot} data-f={i + 1} aria-hidden="true">
              {i + 1}
            </span>
            {name}
          </li>
        ))}
      </ul>
    ) : (
      <DegreeLegend degrees={scale.degrees} compact />
    );

  const sections = {
    formula: <FormulaSection key="formula" model={model} midis={upMidis} onPlayNote={playNote} />,
    mood: <MoodSection key="mood" model={model} naming={naming} />,
    staff: <StaffSection key="staff" line={staff} degrees={staffDegrees} highlight={staffHighlight} />,
    intervals: <IntervalsSection key="intervals" model={model} midis={upMidis} onPlayNote={playNote} />,
    hear: <HearPanel key="hear" settings={settings} update={update} vamp={vamp} playAlong={playAlong} />,
    practice: (
      <PracticePanel
        key="practice"
        ref={tabRef}
        shape={shape}
        exercises={exercises}
        sequence={sequence}
        onSequence={onSequence}
        tab={tab}
        playingExercise={playingExercise}
        onPlayExercise={onPlayExercise}
        skill={shape ? skill : null}
        onMarkLearnt={markLearnt}
        tonic={tonic}
        scaleId={scale.id}
        shapeTitle={shape ? `${shape.name}` : ''}
      />
    ),
    chords: <ChordsSection key="chords" model={model} onPlayChord={playChord} />,
    compare: (
      <ComparePanel
        key="compare"
        scale={scale}
        tonicLabel={formatNote(tonic, { system: naming })}
        suggestions={model.compareWith}
        value={compare}
        onChange={onCompare}
        summary={summary}
      />
    ),
    relatives: <RelativesSection key="relatives" model={model} modes={modes} />,
  };

  return (
    <Page
      eyebrow={`Scales · ${model.groupTitle}`}
      title={title}
      hideHeader={sideways}
      subtitle={isPhone ? undefined : firstSentence(model.mood)}
      actions={
        isPhone ? undefined : (
          <Button iconLeft="Search" onClick={() => setPickerOpen(true)}>
            Change scale
          </Button>
        )
      }
      className={cx(sideways && styles.pageSideways)}
    >
      <div
        className={cx(styles.root, compact && styles.phone, sideways && styles.sideways)}
        data-scales
        data-scale={scale.id}
        data-tonic={tonic}
        data-shape={shape?.id ?? ''}
        data-view={view}
        data-playing={playing ? 'true' : 'false'}
        data-step={playing ? step : -1}
        data-lit={litNote ? `${litNote.string}:${litNote.fret}` : ''}
        data-layout={sideways ? 'sideways' : wide ? 'two-columns' : isPhone ? 'phone' : 'one-column'}
      >
        <div className={styles.keyBar} hidden={sideways}>
          <div className={styles.keyRow}>
            {isPhone && (
              <Button iconLeft="Search" onClick={() => setPickerOpen(true)} className={styles.changeButton}>
                Scale
              </Button>
            )}
            <StableChips aria-label="Root note" options={rootOptions} value={String(chroma(tonic))} onChange={onRoot} className={styles.rootChips} />
          </div>
          {model.simplerTonic && (
            <Text variant="caption" tone="muted" as="p">
              Usually written{' '}
              <a className={styles.inlineLink} href={href('scales', ...scaleParams({ tonic: model.simplerTonic, scale: scale.id, shape: shape?.id ?? null }))}>
                {scaleTitle(model.simplerTonic, scale, naming)}
              </a>
              : the same notes with fewer sharps or flats.
            </Text>
          )}
        </div>

        <section className={styles.stage} aria-label="The neck">
          <div className={styles.stageHead}>
            {!useBar && view !== 'all' && view !== 'compare' && (
              <div className={styles.stageNav}>
                {prevButton}
                {nextButton}
              </div>
            )}
            <div className={styles.stageTitle}>
              <h2 className={styles.shapeHeading}>{view === 'compare' && compareScale ? `${title} and ${scaleTitle(tonic, compareScale, naming)}` : view === 'all' ? 'Every note of the scale' : shapeLabel}</h2>
              <Text variant="caption" tone="muted" as="p">
                {view === 'compare' ? summary?.sentence : view === 'all' ? `Frets ${range[0]}–${range[1]}` : shapeLine}
              </Text>
            </div>
            <div className={styles.stageTools}>
              {compare && (
                <Button size="sm" variant="ghost" iconLeft="X" onClick={() => setCompare(null)}>
                  Stop comparing
                </Button>
              )}
              {!compact && viewTools}
              <IconButton icon="SlidersHorizontal" label="Neck options: frets, capo, left-handed" onClick={() => setOptionsOpen(true)} variant="secondary" />
              {!useBar && playButton}
            </div>
          </div>

          <Neck
            markers={markers}
            frets={range}
            box={box}
            capo={capo}
            tuning={tuning}
            noteContext={noteContext}
            onCellClick={onCellClick}
            focus={view === 'all' || view === 'compare' || !shape ? null : box ? [box.from, box.to] : null}
            size={sideways ? (veryShort ? 'md' : 'lg') : isPhone ? 'xl' : 'lg'}
            aria-label={`${title} on the neck${shape && view !== 'all' && view !== 'compare' ? `, ${shape.name}` : ''}${capo ? `, capo on fret ${capo}` : ''}`}
          />

          <div className={styles.legendRow}>
            {legend}
            <p className={styles.heard} aria-live="polite">
              {heard ?? (playing ? '' : 'Tap any dot to hear it.')}
              {!compact && !heard && !playing && (
                <span className={styles.keys} aria-hidden="true">
                  {' '}
                  <Kbd>←</Kbd> <Kbd>→</Kbd> shape · <Kbd>↑</Kbd> <Kbd>↓</Kbd> root · <Kbd>Space</Kbd> play
                </span>
              )}
            </p>
          </div>

          {compact && <div className={styles.phoneTools}>{viewTools}</div>}
          {view !== 'all' && view !== 'compare' && (
            <ShapePicker systems={systems} system={system} onSystem={onSystem} shapes={shapes} shape={shape} onShape={onShape} learnt={learnt} />
          )}
        </section>

        {wide ? (
          <div className={styles.columns}>
            <div className={styles.column}>
              {sections.formula}
              {sections.mood}
              {sections.staff}
              {sections.intervals}
              {sections.relatives}
            </div>
            <div className={styles.column}>
              {sections.hear}
              {sections.practice}
              {sections.chords}
              {sections.compare}
            </div>
          </div>
        ) : (
          <div className={styles.column}>
            {sections.hear}
            {sections.formula}
            {sections.mood}
            {sections.chords}
            {sections.practice}
            {sections.compare}
            {sections.staff}
            {sections.intervals}
            {sections.relatives}
          </div>
        )}
      </div>

      {useBar && (
        <ActionBar stretchOnMobile={false} className={styles.actionBar}>
          {transport}
        </ActionBar>
      )}

      <Celebration fire={celebrate} intensity="low" />
      <ScalePicker open={pickerOpen} onClose={closePicker} tonic={tonic} scaleId={scale.id} onPick={pickScale} />
      <NeckOptions
        open={optionsOpen}
        onClose={closeOptions}
        settings={settings}
        update={update}
        lastFret={lastFret}
        leftHanded={leftHanded}
        onLeftHanded={onLeftHanded}
        tuningLabel={`${tuning.name} (${tuning.label})`}
      />
    </Page>
  );
}
