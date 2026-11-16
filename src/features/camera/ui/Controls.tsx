/**
 * The controls beside (or under) the picture: what to show on the neck, and the tools for when the
 * tracking needs help. Plain kit components; the screen owns the state.
 */
import { memo, type ReactNode } from 'react';
import { CHORD_TYPES, SCALE_FAMILIES, filterChordTypes, filterScales, formatNote, simplestTonic } from '@/core/theory';
import { Button, ChipGroup, Icon, IconButton, PlayButton, SegmentedControl, Select, Slider, Switch, Text, cx } from '@/ui';
import type { CameraContent, ContentKind } from '../model/address';
import { joinChord, splitChord, type LabelMode, type Naming, type ShapeOption } from '../model/content';
import { GUITAR_KINDS, type GuitarKind } from '../model/guitar';
import styles from './Controls.module.css';

const KINDS: Array<{ value: ContentKind; label: string; ariaLabel?: string }> = [
  { value: 'scale', label: 'Scale' },
  { value: 'chord', label: 'Chord' },
  { value: 'song', label: 'Song' },
  { value: 'note', label: 'Note', ariaLabel: 'Find a note' },
];

const PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CHORD_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Scales worth offering on the neck (tier 3 and under), grouped by family. */
const SCALE_OPTIONS = SCALE_FAMILIES.map((f) => ({
  group: f.name,
  options: filterScales({ family: f.id, maxTier: 3 })
    .filter((s) => s.id !== 'chromatic')
    .map((s) => ({ value: s.id, label: s.name })),
})).filter((g) => g.options.length > 0);

/** Chord types: the everyday ones first. */
const CHORD_TYPE_OPTIONS = (() => {
  const everyday = filterChordTypes({ maxTier: 2 });
  const more = ['m7b5', 'dim7', '13', 'maj9', 'm9', '7sharp9', '7b9'].map((id) => CHORD_TYPES.find((t) => t.id === id)).filter((t): t is (typeof CHORD_TYPES)[number] => !!t);
  return [...everyday, ...more].map((t) => ({
    value: t.id,
    label: t.id === 'major' ? 'major' : `${t.symbol} (${t.name})`,
  }));
})();

/** A row with a previous / next pair around a label (shapes, voicings, song steps). */
export function PrevNext({
  label,
  detail,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  disabled,
}: {
  label: ReactNode;
  detail?: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className={styles.stepper}>
      <IconButton icon="ChevronLeft" label={prevLabel} variant="secondary" onClick={onPrev} disabled={disabled} />
      <div className={styles.stepperText} aria-live="polite">
        <span className={styles.stepperLabel}>{label}</span>
        {detail ? <span className={styles.stepperDetail}>{detail}</span> : null}
      </div>
      <IconButton icon="ChevronRight" label={nextLabel} variant="secondary" onClick={onNext} disabled={disabled} />
    </div>
  );
}

/** What the scale / chord / song / note controls need. */
export interface ContentControlsProps {
  content: CameraContent;
  onContent: (c: CameraContent) => void;
  naming: Naming;
  labels: LabelMode;
  onLabels: (m: LabelMode) => void;
  /** Scale: the shapes and the one in use. */
  shapes: ShapeOption[];
  shape: ShapeOption | null;
  /** Chord: the voicing's name and how many there are. */
  voicingLabel: string;
  voicingCount: number;
  /** Song mode (see `useSongMode`). */
  song: {
    choices: Array<{ id: string; title: string; level: number }>;
    songId: string | null;
    now: string;
    next: string;
    playing: boolean;
    loading: boolean;
    error: string | null;
    tempo: number;
    bpm: number;
    step: number;
    steps: number;
    capo: number;
    onToggle: () => void;
    onPrev: () => void;
    onNext: () => void;
    onTempo: (v: number) => void;
  };
  /** Find-a-note drill. */
  drill: {
    target: string;
    where: string;
    found: number;
    revealed: boolean;
    accidentals: boolean;
    onNext: () => void;
    onReveal: (v: boolean) => void;
    onAccidentals: (v: boolean) => void;
  };
  /** The microphone check. */
  listen: {
    on: boolean;
    busy: boolean;
    message: string | null;
    onChange: (v: boolean) => void;
  };
  /** Compact: the phone-sideways rail (fewer words). */
  compact?: boolean;
}

/** "Show on the neck": the content picker and its controls. */
export const ContentControls = memo(function ContentControls(p: ContentControlsProps) {
  const c = p.content;
  const kindSwitch = (
    <SegmentedControl
      aria-label="What to show on the neck"
      options={KINDS}
      value={c.kind}
      fullWidth
      onChange={(k: ContentKind) => {
        if (k === c.kind) return;
        p.onContent(
          k === 'scale'
            ? {
                kind: 'scale',
                tonic: 'A',
                scale: 'minor-pentatonic',
                shape: 'box-1',
              }
            : k === 'chord'
              ? { kind: 'chord', symbol: 'G', voicing: 0 }
              : k === 'song'
                ? { kind: 'song', id: null }
                : { kind: 'note', note: null, string: null },
        );
      }}
    />
  );
  return (
    <div className={cx(styles.group, p.compact && styles.compact)} data-camera-controls={c.kind}>
      {kindSwitch}
      {c.kind === 'scale' && <ScaleControls {...p} content={c} />}
      {c.kind === 'chord' && <ChordControls {...p} content={c} />}
      {c.kind === 'song' && <SongControls {...p} />}
      {c.kind === 'note' && <NoteControls {...p} content={c} />}
      {(c.kind === 'scale' || c.kind === 'chord') && (
        <SegmentedControl
          aria-label="Text in the dots"
          size="sm"
          fullWidth
          options={[
            { value: 'degree', label: 'Degrees' },
            { value: 'note', label: 'Notes' },
            { value: 'finger', label: 'Fingers' },
          ]}
          value={p.labels}
          onChange={(m: LabelMode) => p.onLabels(m)}
        />
      )}
      <Switch
        checked={p.listen.on}
        onChange={p.listen.onChange}
        label="Listen to my guitar"
        description={p.listen.message ?? (p.compact ? undefined : 'The microphone checks what you play: the right fret flashes green.')}
        disabled={p.listen.busy}
      />
    </div>
  );
});

function ScaleControls(
  p: ContentControlsProps & {
    content: Extract<CameraContent, { kind: 'scale' }>;
  },
) {
  const c = p.content;
  const roots = PCS.map((pc) => simplestTonic(pc, c.scale));
  const i = Math.max(
    0,
    p.shapes.findIndex((s) => s.id === p.shape?.id),
  );
  const go = (d: number) => {
    const next = p.shapes[(i + d + p.shapes.length) % p.shapes.length];
    if (next) p.onContent({ ...c, shape: next.id });
  };
  return (
    <>
      <div className={styles.pair}>
        <Select
          label="Root"
          size="sm"
          value={roots.find((r) => noteEq(r, c.tonic)) ?? c.tonic}
          options={roots.map((r) => ({
            value: r,
            label: formatNote(r, { system: p.naming }),
          }))}
          onChange={(v: string) => p.onContent({ ...c, tonic: v })}
        />
        <Select label="Scale" size="sm" value={c.scale} options={SCALE_OPTIONS} onChange={(v: string) => p.onContent({ ...c, scale: v, tonic: simplestTonic(c.tonic, v) })} />
      </div>
      <PrevNext label={p.shape?.name ?? 'Shape'} detail={p.shape?.where} onPrev={() => go(-1)} onNext={() => go(1)} prevLabel="Previous shape (Left arrow)" nextLabel="Next shape (Right arrow)" />
    </>
  );
}

function noteEq(a: string, b: string): boolean {
  return a === b;
}

function ChordControls(
  p: ContentControlsProps & {
    content: Extract<CameraContent, { kind: 'chord' }>;
  },
) {
  const c = p.content;
  const { root, type } = splitChord(c.symbol);
  return (
    <>
      <div className={styles.pair}>
        <Select
          label="Root"
          size="sm"
          value={CHORD_ROOTS.includes(root) ? root : 'C'}
          options={CHORD_ROOTS.map((r) => ({
            value: r,
            label: formatNote(r, { system: p.naming }),
          }))}
          onChange={(v: string) =>
            p.onContent({
              kind: 'chord',
              symbol: joinChord(v, type),
              voicing: 0,
            })
          }
        />
        <Select
          label="Chord"
          size="sm"
          value={type}
          options={CHORD_TYPE_OPTIONS}
          onChange={(v: string) =>
            p.onContent({
              kind: 'chord',
              symbol: joinChord(root, v),
              voicing: 0,
            })
          }
        />
      </div>
      <PrevNext
        label={p.voicingLabel || 'No shape found'}
        detail={p.voicingCount > 0 ? `Shape ${Math.min(c.voicing, p.voicingCount - 1) + 1} of ${p.voicingCount}` : undefined}
        onPrev={() =>
          p.onContent({
            ...c,
            voicing: (c.voicing - 1 + p.voicingCount) % Math.max(1, p.voicingCount),
          })
        }
        onNext={() =>
          p.onContent({
            ...c,
            voicing: (c.voicing + 1) % Math.max(1, p.voicingCount),
          })
        }
        prevLabel="Previous shape (Left arrow)"
        nextLabel="Next shape (Right arrow)"
        disabled={p.voicingCount < 2}
      />
    </>
  );
}

function SongControls(p: ContentControlsProps) {
  const s = p.song;
  return (
    <>
      <Select
        label="Song"
        size="sm"
        value={s.songId ?? ''}
        options={s.choices.map((x) => ({ value: x.id, label: x.title }))}
        onChange={(v: string) => p.onContent({ kind: 'song', id: v })}
        disabled={s.choices.length === 0}
      />
      {s.error ? (
        <Text tone="warn" variant="caption">
          {s.error}
        </Text>
      ) : (
        <div className={styles.nowNext} aria-live="polite">
          <p>
            <span className={styles.nowTag}>Now</span> {s.loading ? 'Loading the song…' : s.now}
          </p>
          {!s.loading && s.next ? (
            <p className={styles.nextLine}>
              <span className={styles.nextTag}>Next</span> {s.next}
            </p>
          ) : null}
        </div>
      )}
      <div className={styles.transport}>
        <IconButton icon="SkipBack" label="Previous note (Left arrow)" variant="secondary" onClick={s.onPrev} disabled={s.loading || s.step <= 0} />
        <PlayButton playing={s.playing} label={s.playing ? 'Pause (Space)' : 'Play the song (Space)'} onClick={s.onToggle} loading={s.loading} size="md" />
        <IconButton icon="SkipForward" label="Next note (Right arrow)" variant="secondary" onClick={s.onNext} disabled={s.loading || s.step >= s.steps - 1} />
        <Text variant="caption" tone="muted" tabular className={styles.stepCount}>
          {s.steps > 0 ? `${s.step + 1} / ${s.steps}` : ''}
        </Text>
      </div>
      <Slider label="Tempo" min={40} max={120} step={5} value={s.tempo} onChange={s.onTempo} format={(v) => `${v}%${s.bpm ? ` · ${Math.round((s.bpm * v) / 100)} BPM` : ''}`} />
      {s.capo > 0 && (
        <Text variant="caption" tone="muted">
          <Icon name="Info" size="xs" /> This song is played with a capo at fret {s.capo}: the dots are placed for it.
        </Text>
      )}
      {!p.compact && (
        <Text variant="caption" tone="muted">
          Stopped, you step through at your own pace; with the microphone on, the song moves on when you play the right note.
        </Text>
      )}
    </>
  );
}

function NoteControls(
  p: ContentControlsProps & {
    content: Extract<CameraContent, { kind: 'note' }>;
  },
) {
  const c = p.content;
  const d = p.drill;
  return (
    <>
      <div className={styles.target} aria-live="polite">
        <span className={styles.targetText}>
          <span className={styles.targetLabel}>Find this note</span>
          <span className={styles.targetWhere}>{d.where}</span>
        </span>
        <span className={styles.targetNote}>{d.target}</span>
      </div>
      <ChipGroup
        aria-label="On which string"
        options={[
          { value: 'any', label: 'Any string' },
          ...[6, 5, 4, 3, 2, 1].map((s) => ({
            value: String(s),
            label: `String ${s}`,
          })),
        ]}
        value={c.string ? String(c.string) : 'any'}
        onChange={(v: string | null) =>
          p.onContent({
            kind: 'note',
            note: null,
            string: v && v !== 'any' ? Number(v) : null,
          })
        }
      />
      <Switch checked={d.revealed} onChange={d.onReveal} label="Show where it is" description={p.compact ? undefined : 'Off: find it yourself first, then check.'} />
      <Switch checked={d.accidentals} onChange={d.onAccidentals} label="Sharps and flats too" />
      <div className={styles.drillRow}>
        <Button variant="primary" iconRight="ArrowRight" onClick={d.onNext} fullWidth>
          Next note
        </Button>
        <Text variant="caption" tone="muted" tabular>
          {d.found} found
        </Text>
      </div>
    </>
  );
}

/** The tools for when tracking needs help, and the camera and guitar settings. */
export interface TrackingControlsProps {
  live: boolean;
  /** The drawn neck (no camera): only what changes the dots (the capo). */
  drawn?: boolean;
  onCalibrate: () => void;
  onNumbers: () => void;
  onStickers: () => void;
  stickersOn: boolean;
  onStickersOff: () => void;
  guitar: GuitarKind;
  onGuitar: (g: GuitarKind) => void;
  capo: number;
  onCapo: (n: number) => void;
  devices: Array<{ id: string; label: string }>;
  device: string | null;
  onDevice: (id: string) => void;
  mirrored: boolean;
  onMirrored: (v: boolean) => void;
  bassUp: boolean;
  onBassUp: (v: boolean) => void;
  hands: { on: boolean; status: string; onChange: (v: boolean) => void };
}

/** One help row: a button and the sentence that explains it. */
function HelpRow({ icon, title, text, onClick, disabled, action }: { icon: string; title: string; text: string; onClick: () => void; disabled?: boolean; action?: ReactNode }) {
  return (
    <div className={styles.help}>
      <Button iconLeft={icon} onClick={onClick} disabled={disabled} fullWidth className={styles.helpButton}>
        {title}
      </Button>
      <Text variant="caption" tone="muted">
        {text}
      </Text>
      {action}
    </div>
  );
}

export const TrackingControls = memo(function TrackingControls(p: TrackingControlsProps) {
  return (
    <div className={styles.group}>
      {p.live && (
        <div className={styles.sub}>
          <h3 className={styles.subTitle}>If the dots look wrong</h3>
          <HelpRow icon="Crosshair" title="Mark the neck" text="Tap the nut and the 12th fret on a still picture; the dots follow your neck from there." onClick={p.onCalibrate} disabled={!p.live} />
          <HelpRow icon="Hash" title="Fix the fret numbers" text="Tap one fret you know and say its number; every other fret follows." onClick={p.onNumbers} disabled={!p.live} />
          <HelpRow
            icon="Tag"
            title={p.stickersOn ? 'Stickers in use' : 'Use two stickers'}
            text="Two bits of bright tape on the edge of the neck give the camera a sure anchor."
            onClick={p.onStickers}
            disabled={!p.live}
            action={
              p.stickersOn ? (
                <Button size="sm" variant="ghost" onClick={p.onStickersOff}>
                  Stop using stickers
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {p.drawn ? (
        <div className={styles.sub}>
          <h3 className={styles.subTitle}>Your guitar</h3>
        <Select
          label="Capo"
          size="sm"
          value={String(p.capo)}
          options={[{ value: '0', label: 'No capo' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: String(n), label: `Capo at fret ${n}` }))]}
          onChange={(v: string) => p.onCapo(Number(v))}
          hint={p.drawn ? 'Frets count from the capo, as in tab.' : 'The camera cannot see a capo: tell it here, and the dots move up with it.'}
        />
        </div>
      ) : (
        <div className={styles.sub}>
          <h3 className={styles.subTitle}>Camera and guitar</h3>
          <Select
            label="Guitar"
            size="sm"
            value={p.guitar}
            options={GUITAR_KINDS.map((g) => ({ value: g.id, label: g.label }))}
            onChange={(v: string) => p.onGuitar(v as GuitarKind)}
            hint={GUITAR_KINDS.find((g) => g.id === p.guitar)?.description}
          />
        <Select
          label="Capo"
          size="sm"
          value={String(p.capo)}
          options={[{ value: '0', label: 'No capo' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: String(n), label: `Capo at fret ${n}` }))]}
          onChange={(v: string) => p.onCapo(Number(v))}
          hint={p.drawn ? 'Frets count from the capo, as in tab.' : 'The camera cannot see a capo: tell it here, and the dots move up with it.'}
        />
          {p.devices.length > 1 && <Select label="Camera" size="sm" value={p.device ?? p.devices[0].id} options={p.devices.map((d) => ({ value: d.id, label: d.label }))} onChange={p.onDevice} />}
          <Switch checked={p.mirrored} onChange={p.onMirrored} label="Mirror the picture" description="Like a mirror, as most selfie cameras show you." />
          <SegmentedControl
            aria-label="Thickest string in the picture"
            size="sm"
            fullWidth
            options={[
              { value: 'top', label: 'Thick string on top' },
              { value: 'bottom', label: 'On the bottom' },
            ]}
            value={p.bassUp ? 'top' : 'bottom'}
            onChange={(v: string) => p.onBassUp(v === 'top')}
          />
          <Switch
            checked={p.hands.on}
            onChange={p.hands.onChange}
            label="Hand feedback (experimental)"
            description={
              p.hands.status === 'unavailable'
                ? 'Hand tracking is not available in this copy of the app.'
                : p.hands.status === 'loading'
                  ? 'Loading the hand tracker…'
                  : 'Shows which fret each fingertip is on, and warns when one is far from the fret wire.'
            }
          />
        </div>
      )}
    </div>
  );
});
