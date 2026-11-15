/**
 * One renderer per figure kind, built on the shared music kit (Fretboard, ChordDiagram,
 * NotationView, PianoKeys, CircleOfFifths, RhythmView, StrumPattern) wherever it has the
 * component. Tablature has no shared component yet, so it is drawn here as a small SVG.
 */
import { useMemo, type ReactNode } from 'react';
import { Button, Icon, PlayButton, Text, cx } from '@/ui';
import {
  ChordDiagram, CircleOfFifths, Fretboard, NotationView, PianoKeys, RhythmView, StrumPattern, degreeText, noteText, useMusicSettings,
  type FretMarker, type NotationNote, type PianoHighlight,
} from '@/ui/music';
import { describeSound } from '../../sound';
import { resolveFigure } from '../../figures';
import type {
  AudioFigure, ChordFigure, CircleFigure, Figure, FigureKind, FretboardFigure, KeyboardFigure, RhythmFigure, RichText as RichTextValue, StaffFigure, TabFigure,
} from '../../types';
import { RichText, usePlainText } from '../RichText';
import { canPlaySlow } from '../logic/sound';
import { useSoundPlayer } from '../useSound';
import { dotColor } from './colors';
import styles from './Figures.module.css';

/** Props every figure renderer takes. */
export interface FigureProps<F extends Figure = Figure> {
  figure: F;
  /** `sm` inside an answer option, `md` (default) beside a prompt or on a card. */
  size?: 'sm' | 'md';
}

function Caption({ text }: { text: RichTextValue | null | undefined }) {
  if (!text) return null;
  return (
    <Text variant="caption" tone="muted" as="p" className={styles.caption}>
      <RichText text={text} />
    </Text>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className={styles.unavailable}>
      <Icon name="Info" size="sm" /> This {what} cannot be drawn.
    </p>
  );
}

// ── Fretboard ──────────────────────────────────────────────────────────────────────────────────

/** A fretboard diagram with labelled, colour-coded dots. */
export function FretboardFigureView({ figure, size = 'md' }: FigureProps<FretboardFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const markers = useMemo<FretMarker[]>(
    () =>
      resolved.dots.map((d) => ({
        string: d.string,
        fret: d.fret,
        label: resolved.labels === 'degree' && d.degree && !figure.dots?.some((x) => x.string === d.string && x.fret === d.fret && x.label) ? degreeText(d.degree) : d.label,
        note: d.note,
        noteLabel: resolved.labels === 'note' && d.label === d.note ? true : undefined,
        color: dotColor(d.role, resolved.root ? d.degree : null, d.finger, resolved.labels),
        root: d.role === 'root',
        state: d.role === 'ghost' ? 'ghost' : d.role === 'target' ? 'target' : 'normal',
        shape: d.role === 'muted' ? 'ring' : 'circle',
      })),
    [resolved, figure.dots],
  );
  return (
    <figure className={styles.figure}>
      <Fretboard tuning={resolved.tuning} capo={resolved.capo || undefined} frets={resolved.frets} markers={markers} size={size === 'sm' ? 'sm' : 'md'} />
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Chord ──────────────────────────────────────────────────────────────────────────────────────

/** A chord box. */
export function ChordFigureView({ figure, size = 'md' }: FigureProps<ChordFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  if (!resolved) return <Unavailable what="chord" />;
  return (
    <figure className={cx(styles.figure, styles.centred)}>
      <ChordDiagram frets={resolved.frets} fingers={resolved.fingers} chord={resolved.symbol ?? undefined} size={size === 'sm' ? 'sm' : 'md'} footer={size === 'sm' ? 'none' : 'notes'} />
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Staff ──────────────────────────────────────────────────────────────────────────────────────

const STAFF_DURATIONS: Record<string, NotationNote['duration']> = { w: 'w', h: 'h', q: 'q', e: '8', s: '16' };

/** Staff notation (engraved by the shared NotationView). */
export function StaffFigureView({ figure }: FigureProps<StaffFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const notes = useMemo<NotationNote[]>(() => {
    const single = resolved.notes.length === 1 && !resolved.notes[0].duration;
    return resolved.notes.map((n) => {
      const code = n.duration ?? (single ? 'w' : 'q');
      const base = code.replace(/[.t]/g, '');
      const out: NotationNote = { keys: [n.note], duration: STAFF_DURATIONS[base] ?? 'q', dots: (code.match(/\./g) ?? []).length };
      if (code.includes('t')) out.triplet = true;
      if (n.label) out.label = n.label;
      return out;
    });
  }, [resolved]);
  const clef = resolved.clef === 'bass' ? 'bass' : resolved.guitar ? 'treble-8vb' : 'treble';
  return (
    <figure className={cx(styles.figure, styles.staff)}>
      <NotationView notes={notes} clef={clef} keySignature={resolved.key?.name} time={resolved.time ?? undefined} />
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Keyboard ───────────────────────────────────────────────────────────────────────────────────

/** A piano keyboard with highlighted keys. */
export function KeyboardFigureView({ figure }: FigureProps<KeyboardFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const highlight = useMemo<PianoHighlight[]>(
    () =>
      figure.keys.map((k) => {
        const key = typeof k === 'string' ? { note: k } : k;
        const out: PianoHighlight = { note: key.note, color: dotColor(key.role ?? 'tone', null) === 'neutral' ? 'accent' : dotColor(key.role ?? 'tone', null) };
        if (key.label) out.label = key.label;
        return out;
      }),
    [figure.keys],
  );
  return (
    <figure className={cx(styles.figure, styles.centred)}>
      <div className={styles.keyboard}>
        <PianoKeys from={resolved.from} to={resolved.to} highlight={highlight} />
      </div>
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Circle ─────────────────────────────────────────────────────────────────────────────────────

/** The circle of fifths with a key selected. */
export function CircleFigureView({ figure, size = 'md' }: FigureProps<CircleFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  if (!resolved) return <Unavailable what="circle of fifths" />;
  return (
    <figure className={cx(styles.figure, styles.centred)}>
      <div className={cx(styles.circle, size === 'sm' && styles.circleSm)}>
        <CircleOfFifths value={resolved.key.name} highlight={figure.highlight} show={resolved.show} diatonic={false} />
      </div>
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Rhythm ─────────────────────────────────────────────────────────────────────────────────────

/** A rhythm in notation, with its counting, and a button to hear it when it has a tempo. */
export function RhythmFigureView({ figure, size = 'md' }: FigureProps<RhythmFigure>) {
  const player = useSoundPlayer();
  return (
    <figure className={styles.figure}>
      <RhythmView rhythm={figure.pattern} time={figure.time} counting={figure.counting !== false} />
      {figure.tempo && size !== 'sm' && (
        <div>
          <Button
            size="md"
            variant="ghost"
            iconLeft={player.playing ? 'Square' : 'Volume2'}
            onClick={() => (player.playing ? player.stop() : player.play({ kind: 'rhythm', pattern: figure.pattern, time: figure.time, tempo: figure.tempo }))}
          >
            {player.playing ? 'Stop' : 'Hear the rhythm'}
          </Button>
        </div>
      )}
      <Caption text={figure.caption} />
    </figure>
  );
}

// ── Tab ────────────────────────────────────────────────────────────────────────────────────────

const TAB_GAP = 18;
const TAB_PAD = 28;

/** A short phrase in tablature (high E on top), with a play button. */
export function TabFigureView({ figure, size = 'md' }: FigureProps<TabFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const { naming } = useMusicSettings();
  const player = useSoundPlayer();
  const strings = resolved.tuning.stringCount;
  const step = 34;
  const width = TAB_PAD + 12 + Math.max(4, resolved.notes.length) * step;
  const height = (strings - 1) * TAB_GAP + 24;
  const total = Math.max(1, resolved.totalTicks);
  const xOf = (tick: number): number => TAB_PAD + 18 + (tick / total) * (width - TAB_PAD - 30);
  const labels = [...resolved.tuning.notes].reverse().map((n) => noteText(n, naming));
  const words = resolved.notes.map((n) => (n.rest ? 'rest' : `string ${n.string} fret ${n.fret}`)).join(', ');
  return (
    <figure className={styles.figure}>
      <div className={styles.tabScroll}>
        <svg className={styles.tab} viewBox={`0 0 ${width} ${height}`} style={{ width: Math.max(width * 1.25, 260) }} role="img" aria-label={`Tab: ${words}`}>
          {labels.map((l, i) => (
            <text key={`l${i}`} x={6} y={12 + i * TAB_GAP + 4} className={styles.tabLabel}>
              {l}
            </text>
          ))}
          {labels.map((_l, i) => (
            <line key={`s${i}`} x1={TAB_PAD} x2={width - 4} y1={12 + i * TAB_GAP} y2={12 + i * TAB_GAP} className={styles.tabLine} />
          ))}
          <line x1={TAB_PAD} x2={TAB_PAD} y1={12} y2={12 + (strings - 1) * TAB_GAP} className={styles.tabBar} />
          {resolved.notes.map((n, i) =>
            n.rest || n.string === null ? (
              <text key={i} x={xOf(n.tick)} y={12 + ((strings - 1) / 2) * TAB_GAP + 4} className={styles.tabRest} textAnchor="middle">
                rest
              </text>
            ) : (
              <g key={i}>
                <rect x={xOf(n.tick) - 9} y={12 + (n.string - 1) * TAB_GAP - 9} width={18} height={18} rx={4} className={styles.tabKnock} />
                <text x={xOf(n.tick)} y={12 + (n.string - 1) * TAB_GAP + 5} className={styles.tabFret} textAnchor="middle">
                  {n.fret}
                </text>
              </g>
            ),
          )}
        </svg>
      </div>
      {size !== 'sm' && (
        <div>
          <Button
            size="md"
            variant="ghost"
            iconLeft={player.playing ? 'Square' : 'Volume2'}
            onClick={() => (player.playing ? player.stop() : player.play({ kind: 'tab', notes: figure.notes, tempo: figure.tempo, tuning: figure.tuning, capo: figure.capo }))}
          >
            {player.playing ? 'Stop' : 'Hear it'}
          </Button>
        </div>
      )}
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Audio ──────────────────────────────────────────────────────────────────────────────────────

/** A sound to hear: a play button, a slow version when it has more than one moment, and strum arrows. */
export function AudioFigureView({ figure, size = 'md' }: FigureProps<AudioFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const player = useSoundPlayer();
  const label = usePlainText(figure.label ?? null) || 'Listen';
  const slow = canPlaySlow(resolved.plan);
  const toggle = (speed: 'normal' | 'slow') => (player.playing === speed ? player.stop() : player.play(resolved.plan, speed));
  const strumPattern = figure.sound.kind === 'strum' ? figure.sound.pattern : null;
  return (
    <figure className={cx(styles.figure, styles.audio)}>
      <div className={styles.audioRow}>
        <PlayButton size={size === 'sm' ? 'md' : 'lg'} playing={player.playing === 'normal'} label={player.playing === 'normal' ? 'Stop' : label} onClick={() => toggle('normal')} data-sound-play="" />
        <div className={styles.audioText}>
          <Text weight="semibold">{label}</Text>
          <Text variant="caption" tone="muted">
            {describeSound(figure.sound)}
          </Text>
          {slow && (
            <Button variant="ghost" iconLeft="Turtle" pressed={player.playing === 'slow'} onClick={() => toggle('slow')} className={styles.slow}>
              Slower
            </Button>
          )}
        </div>
      </div>
      {strumPattern && <StrumPattern pattern={strumPattern} />}
      <Caption text={figure.caption} />
    </figure>
  );
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────────

type Renderers = { [K in FigureKind]: (props: FigureProps<Extract<Figure, { kind: K }>>) => ReactNode };

/** Every figure kind and the component that draws it. A figure kind without an entry is a type error. */
export const FIGURE_RENDERERS: Renderers = {
  fretboard: FretboardFigureView,
  chord: ChordFigureView,
  staff: StaffFigureView,
  keyboard: KeyboardFigureView,
  circle: CircleFigureView,
  rhythm: RhythmFigureView,
  tab: TabFigureView,
  audio: AudioFigureView,
};

/** Draw any lesson figure. */
export function FigureView({ figure, size, className }: FigureProps & { className?: string }) {
  const Render = FIGURE_RENDERERS[figure.kind] as (props: FigureProps) => ReactNode;
  return (
    <div className={cx(styles.host, className)} data-figure={figure.kind}>
      <Render figure={figure} size={size} />
    </div>
  );
}
