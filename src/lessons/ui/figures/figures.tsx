/**
 * One renderer per figure kind, built on the shared music kit (Fretboard, ChordDiagram,
 * NotationView, PianoKeys, CircleOfFifths, RhythmView, StrumPattern) wherever it has the
 * component. Tablature has no shared component yet, so it is drawn here as a small SVG.
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Icon, PlayButton, Text, cx } from '@/ui';
import {
  ChordDiagram, CircleOfFifths, Fretboard, NotationView, PianoKeys, RhythmView, StrumPattern, degreeText, noteText, pianoLayout, useMusicSettings,
  type FretCell, type FretMarker, type MusicColor, type NotationNote, type PianoHighlight,
} from '@/ui/music';
import { midiToNote } from '@/core/theory';
import { describeSound } from '../../sound';
import { resolveFigure } from '../../figures';
import type {
  AudioFigure, ChordFigure, CircleFigure, DotRole, Figure, FigureKind, FretboardFigure, KeyboardFigure, RhythmFigure, RichText as RichTextValue, StaffFigure, TabFigure,
} from '../../types';
import { RichText, usePlainText } from '../RichText';
import { canPlaySlow } from '../logic/sound';
import { marksNeedHeadroom, tabMarks, tabNoteWords, type TabMarks } from '../logic/tabMarks';
import { useSoundPlayer } from '../useSound';
import { dotColor } from './colors';
import { ScrollHint } from './ScrollHint';
import styles from './Figures.module.css';

/** Props every figure renderer takes. */
export interface FigureProps<F extends Figure = Figure> {
  figure: F;
  /** `sm` inside an answer option, `md` (default) beside a prompt or on a card. */
  size?: 'sm' | 'md';
  /** The figure is an answer option: it must not print what would give the answer away (a chord box's name). */
  inOption?: boolean;
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

/** A fretboard diagram with labelled, colour-coded dots. Tapping the neck plays the note there, as everywhere in the app. */
export function FretboardFigureView({ figure, size = 'md' }: FigureProps<FretboardFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const player = useSoundPlayer();
  const playCell = useCallback((cell: FretCell) => player.play({ kind: 'notes', notes: [midiToNote(cell.midi)], tempo: 60 }), [player]);
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
  // In an answer option the whole option is the button: the neck stays a picture there.
  const playable = size !== 'sm';
  return (
    <figure className={styles.figure}>
      {/* Its cells are buttons: Enter, Space and the arrows belong to them, not to the player. */}
      <ScrollHint>
        <div data-own-enter="" data-native-keys="">
          <Fretboard
            tuning={resolved.tuning}
            capo={resolved.capo || undefined}
            // The window counts from the capo; the board is drawn in frets on the wood.
            frets={resolved.board}
            markers={markers}
            size={size === 'sm' ? 'sm' : 'md'}
            onCellClick={playable ? playCell : undefined}
            // Tappable, but no wider than the picture it was (the kit's own narrowest fret for a
            // picture): frets 0–12 must still fit a 390 px phone.
            minFretWidth={playable ? 22 : undefined}
            maxFretWidth={playable ? 28 * 3.9 : undefined}
            cellLabels="note"
          />
        </div>
      </ScrollHint>
      <Caption text={resolved.caption} />
    </figure>
  );
}

// ── Chord ──────────────────────────────────────────────────────────────────────────────────────

/** A chord box. With a capo it draws the capo; in an answer option it hides its name, which would be the answer. */
export function ChordFigureView({ figure, size = 'md', inOption }: FigureProps<ChordFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  if (!resolved) return <Unavailable what="chord" />;
  const title = inOption ? false : undefined;
  return (
    <figure className={cx(styles.figure, styles.centred)}>
      {resolved.voicing ? (
        <ChordDiagram voicing={resolved.voicing} fingers={figure.fingers} chord={resolved.symbol ?? undefined} title={title} size={size === 'sm' ? 'sm' : 'md'} footer={size === 'sm' ? 'none' : 'notes'} />
      ) : (
        <ChordDiagram frets={resolved.frets} fingers={resolved.fingers} chord={resolved.symbol ?? undefined} title={title} size={size === 'sm' ? 'sm' : 'md'} footer={size === 'sm' ? 'none' : 'notes'} />
      )}
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

/** The SVG geometry of the music kit's piano (white key width and heights, in its own units). */
const PIANO = { w: 24, h: 96, blackH: 60 } as const;

/**
 * The colour of a highlighted key. Degree roles keep their degree colours; a plain highlighted
 * key is the accent, unless the figure also shows degree colours: then it is neutral, because the
 * third's colour (--deg-3) is almost the accent's and the two would read as one.
 */
function keyColor(role: DotRole, anyDegree: boolean): MusicColor {
  const c = dotColor(role, null);
  if (c !== 'neutral' && c !== 'accent') return c;
  return anyDegree && role !== 'target' ? 'neutral' : 'accent';
}

/**
 * A piano keyboard with highlighted keys; a tapped key sounds. The keys are drawn by the music
 * kit as a picture (which shrinks to any phone: nine white keys fit 360 px) and tapped through a
 * layer of buttons laid over them here, so tapping never forces the keyboard wider than the screen.
 */
export function KeyboardFigureView({ figure }: FigureProps<KeyboardFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  // Anything that shows a note can play it: a tapped key sounds.
  const player = useSoundPlayer();
  const highlight = useMemo<PianoHighlight[]>(() => {
    const keys = figure.keys.map((k) => (typeof k === 'string' ? { note: k } : k));
    const anyDegree = keys.some((k) => k.role === 'root' || k.role === 'third' || k.role === 'fifth' || k.role === 'seventh');
    return keys.map((key) => {
      const out: PianoHighlight = { note: key.note, color: keyColor(key.role ?? 'tone', anyDegree) };
      if (key.label) out.label = key.label;
      // A ghost key is "for reference": drawn faint, like a ghost dot on the neck.
      if (key.role === 'ghost') out.state = 'ghost';
      else if (key.role === 'target') out.state = 'target';
      return out;
    });
  }, [figure.keys]);
  const layout = useMemo(() => pianoLayout(resolved.from, resolved.to), [resolved.from, resolved.to]);
  const [focus, setFocus] = useState<number | null>(null);
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const totalW = layout.whiteCount * PIANO.w + 2;
  const totalH = PIANO.h + 2;
  const current = focus ?? layout.keys.find((k) => !k.black)?.midi ?? layout.from;
  const play = (midi: number): void => player.play({ kind: 'notes', notes: [midiToNote(midi)], tempo: 60 });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(layout.to, Math.max(layout.from, current + step));
    setFocus(next);
    refs.current.get(next)?.focus();
  };
  const ordered = [...layout.keys.filter((k) => !k.black), ...layout.keys.filter((k) => k.black)];
  return (
    <figure className={cx(styles.figure, styles.centred)}>
      {/* Its keys are buttons: Enter, Space and the arrows belong to them, not to the player. */}
      <div className={styles.keyboard} data-own-enter="" data-native-keys="" style={{ maxWidth: `min(30rem, ${layout.whiteCount * 56}px)` }} data-keyboard-figure="">
        {/* The keys the card is about carry their own names; octave marks (C4) would be jargon here. */}
        <PianoKeys from={resolved.from} to={resolved.to} highlight={highlight} labels={highlight.length > 0 ? 'none' : 'c'} />
        <div className={styles.keyLayer} role="group" aria-label="Piano keys: tap one to hear it; arrow keys move" onKeyDown={onKeyDown}>
          {ordered.map((k) => (
            <button
              key={k.midi}
              ref={(el) => {
                if (el) refs.current.set(k.midi, el);
                else refs.current.delete(k.midi);
              }}
              type="button"
              className={cx(styles.keyButton, k.black && styles.keyButtonBlack)}
              style={{
                left: `${((1 + k.x * PIANO.w) / totalW) * 100}%`,
                width: `${((k.w * PIANO.w) / totalW) * 100}%`,
                top: `${(1 / totalH) * 100}%`,
                height: `${((k.black ? PIANO.blackH : PIANO.h) / totalH) * 100}%`,
              }}
              tabIndex={k.midi === current ? 0 : -1}
              aria-label={midiToNote(k.midi, { prefer: 'sharps' })}
              onFocus={() => setFocus(k.midi)}
              onClick={() => play(k.midi)}
              data-key-midi={k.midi}
            />
          ))}
        </div>
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

/** The technique marks of one tab note: bend arrow and size, H/P arc, slide lines, vibrato wave. */
function TabNoteMarks({ marks, x, y, fromX }: { marks: TabMarks | null; x: number; y: number; fromX: number }) {
  if (!marks) return null;
  const parts: ReactNode[] = [];
  if (marks.legato) {
    const l = marks.legato;
    if (l.kind === 'slide') {
      // A straight line between the two frets, rising or falling with the pitch.
      parts.push(<line key="slide" x1={fromX + 10} x2={x - 10} y1={y + (l.rising ? 4 : -4)} y2={y + (l.rising ? -4 : 4)} className={styles.tabMark} />);
    } else {
      const mid = (fromX + x) / 2;
      parts.push(<path key="arc" d={`M ${fromX + 4} ${y - 10} Q ${mid} ${y - 19} ${x - 4} ${y - 10}`} className={styles.tabMark} fill="none" />);
      parts.push(<text key="hp" x={mid} y={y - 18} className={styles.tabMarkText} textAnchor="middle">{l.label}</text>);
    }
  }
  if (marks.slideIn) {
    const rising = marks.slideIn === 'below';
    parts.push(<line key="in" x1={x - 20} x2={x - 10} y1={y + (rising ? 5 : -5)} y2={y + (rising ? -1 : 1)} className={styles.tabMark} />);
  }
  if (marks.slideOut) {
    const falling = marks.slideOut === 'down';
    parts.push(<line key="out" x1={x + 10} x2={x + 20} y1={y + (falling ? -1 : 1)} y2={y + (falling ? 5 : -5)} className={styles.tabMark} />);
  }
  if (marks.bend) {
    // Up from the note to above the string, the size printed at the top; a release comes back down.
    const peakX = x + 15;
    const peakY = y - 18;
    parts.push(<path key="bend" d={`M ${x + 9} ${y} Q ${peakX} ${y} ${peakX} ${peakY + 3}`} className={styles.tabMark} fill="none" />);
    parts.push(<path key="head" d={`M ${peakX - 3} ${peakY + 5} L ${peakX} ${peakY} L ${peakX + 3} ${peakY + 5}`} className={styles.tabMark} fill="none" />);
    parts.push(<text key="size" x={peakX} y={peakY - 2} className={styles.tabMarkText} textAnchor="middle">{marks.bend.label}</text>);
    if (marks.bend.release) {
      parts.push(<path key="release" d={`M ${peakX + 2} ${peakY + 2} Q ${peakX + 12} ${peakY + 2} ${peakX + 12} ${y - 4}`} className={styles.tabMark} fill="none" strokeDasharray="2 2" />);
    }
  }
  if (marks.vibrato) {
    const y0 = y - (marks.bend ? 26 : 13);
    const x0 = marks.bend ? x + 22 : x - 6;
    parts.push(<path key="vib" d={`M ${x0} ${y0} q 2 -3 4 0 t 4 0 t 4 0 t 4 0`} className={styles.tabMark} fill="none" />);
  }
  return <g data-tab-mark="">{parts}</g>;
}

/** A short phrase in tablature (high E on top), with its techniques drawn, and a play button. */
export function TabFigureView({ figure, size = 'md' }: FigureProps<TabFigure>) {
  const resolved = useMemo(() => resolveFigure(figure), [figure]);
  const { naming } = useMusicSettings();
  const player = useSoundPlayer();
  const strings = resolved.tuning.stringCount;
  const marks = useMemo(() => tabMarks(resolved.notes), [resolved]);
  // Bends, vibrato and H/P sit above their string: give the top string room for them.
  const top = marksNeedHeadroom(marks) ? 30 : 12;
  const step = 34;
  const width = TAB_PAD + 12 + Math.max(4, resolved.notes.length) * step;
  const height = top + (strings - 1) * TAB_GAP + 12;
  const total = Math.max(1, resolved.totalTicks);
  const xOf = (tick: number): number => TAB_PAD + 18 + (tick / total) * (width - TAB_PAD - 30);
  const yOf = (string: number): number => top + (string - 1) * TAB_GAP;
  const labels = [...resolved.tuning.notes].reverse().map((n) => noteText(n, naming));
  const words = resolved.notes.map(tabNoteWords).join('; ');
  return (
    <figure className={styles.figure}>
      <ScrollHint>
      <div className={styles.tabScroll}>
        <svg className={styles.tab} viewBox={`0 0 ${width} ${height}`} style={{ width: Math.max(width * 1.25, 260) }} role="img" aria-label={`Tab: ${words}`}>
          {labels.map((l, i) => (
            <text key={`l${i}`} x={6} y={top + i * TAB_GAP + 4} className={styles.tabLabel}>
              {l}
            </text>
          ))}
          {labels.map((_l, i) => (
            <line key={`s${i}`} x1={TAB_PAD} x2={width - 4} y1={top + i * TAB_GAP} y2={top + i * TAB_GAP} className={styles.tabLine} />
          ))}
          <line x1={TAB_PAD} x2={TAB_PAD} y1={top} y2={top + (strings - 1) * TAB_GAP} className={styles.tabBar} />
          {resolved.notes.map((n, i) =>
            n.rest || n.string === null ? (
              <text key={i} x={xOf(n.tick)} y={top + ((strings - 1) / 2) * TAB_GAP + 4} className={styles.tabRest} textAnchor="middle">
                rest
              </text>
            ) : (
              <g key={i}>
                <TabNoteMarks marks={marks[i]} x={xOf(n.tick)} y={yOf(n.string)} fromX={marks[i]?.legato ? xOf(resolved.notes[marks[i]!.legato!.from].tick) : 0} />
                <rect x={xOf(n.tick) - 9} y={yOf(n.string) - 9} width={18} height={18} rx={4} className={styles.tabKnock} />
                <text x={xOf(n.tick)} y={yOf(n.string) + 5} className={styles.tabFret} textAnchor="middle">
                  {n.fret}
                </text>
              </g>
            ),
          )}
        </svg>
      </div>
      </ScrollHint>
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
export function FigureView({ figure, size, inOption, className }: FigureProps & { className?: string }) {
  const Render = FIGURE_RENDERERS[figure.kind] as (props: FigureProps) => ReactNode;
  return (
    <div className={cx(styles.host, className)} data-figure={figure.kind}>
      <Render figure={figure} size={size} inOption={inOption} />
    </div>
  );
}
