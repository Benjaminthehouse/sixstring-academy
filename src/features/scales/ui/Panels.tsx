/**
 * The doing side of the scale page: choosing a shape, what Play plays and what plays under it,
 * practice exercises as tab, marking a shape learnt, the Arcade hand-off, comparing two scales,
 * and the neck's own options. Each panel only reads props and reports changes.
 */
import { forwardRef, memo } from 'react';
import { BACKING_STYLES, type BackingStyleId } from '@/core/audio';
import type { PatternSystem, ScalePattern, SequenceInfo, SequenceKind } from '@/core/guitar';
import type { SkillView } from '@/core/progress';
import { formatChord, formatRoman, getScale, type ScaleType } from '@/core/theory';
import {
  Button,
  ChipGroup,
  Icon,
  LinkButton,
  List,
  ListItem,
  SegmentedControl,
  Section,
  Select,
  Sheet,
  Stack,
  Stepper,
  Switch,
  Text,
  cx,
} from '@/ui';
import { TabSnippet, type TabViewHandle } from '@/ui/music';
import { ARCADE_GAMES, arcadeParams } from '../model/address';
import { VAMP_STYLES, type Accompaniment, type Vamp } from '../model/backing';
import { displayScaleName, scaleGroups } from '../model/catalog';
import { COMPARE_LOOK, SYSTEM_INFO, shapeWhere, type CompareSummary } from '../model/neck';
import { BPM_MAX, BPM_MIN, type RangeMode, type ScreenSettings } from '../model/settings';
import styles from './Scales.module.css';

type Update = (patch: Partial<ScreenSettings>) => void;

// ── Shapes ──────────────────────────────────────────────────────────────────────────────────

/** Props of `<ShapePicker>`. */
export interface ShapePickerProps {
  systems: readonly PatternSystem[];
  system: PatternSystem;
  onSystem: (system: PatternSystem) => void;
  shapes: readonly ScalePattern[];
  shape: ScalePattern | null;
  onShape: (id: string) => void;
  /** Shape ids already marked learnt (they get a crown). */
  learnt: ReadonlySet<string>;
}

/** The pattern system and the shapes in it, one tap each. */
export const ShapePicker = memo(function ShapePicker({ systems, system, onSystem, shapes, shape, onShape, learnt }: ShapePickerProps) {
  return (
    <Stack gap={3}>
      {systems.length > 1 && (
        <ChipGroup
          aria-label="Kind of shape"
          options={systems.map((s) => ({ value: s, label: SYSTEM_INFO[s].short }))}
          value={system}
          onChange={(v) => onSystem(v as PatternSystem)}
        />
      )}
      {shapes.length > 0 && (
        <ChipGroup
          aria-label="Shape"
          options={shapes.map((s) => ({ value: s.id, label: s.name, icon: learnt.has(s.id) ? 'Crown' : undefined }))}
          value={shape?.id ?? null}
          onChange={onShape}
        />
      )}
      <Text variant="caption" tone="muted" as="p" className={styles.measure}>
        {SYSTEM_INFO[system].description}
      </Text>
    </Stack>
  );
});

/** One line about the shape on screen: where it sits and how the hand moves. */
export function shapeSummary(shape: ScalePattern): string {
  const bits = [shape.positionName, shapeWhere(shape)];
  if (shape.hasShift) bits.push('the hand moves once');
  else if (shape.hasStretch) bits.push('one stretch');
  return bits.filter((b, i, all) => all.indexOf(b) === i).join(' · ');
}

// ── Hear it ─────────────────────────────────────────────────────────────────────────────────

/** Props of `<HearPanel>`. */
export interface HearPanelProps {
  settings: ScreenSettings;
  update: Update;
  vamp: Vamp | null;
  /** Arcade hand-off for scoring. */
  playAlong: string[];
}

const PER_BEAT = [
  { value: 1, label: '1', ariaLabel: 'One note per beat' },
  { value: 2, label: '2', ariaLabel: 'Two notes per beat' },
  { value: 3, label: '3', ariaLabel: 'Three notes per beat (triplets)' },
  { value: 4, label: '4', ariaLabel: 'Four notes per beat' },
];

/** What Play plays, how fast, and what plays underneath. */
export const HearPanel = memo(function HearPanel({ settings, update, vamp, playAlong }: HearPanelProps) {
  const style = settings.style ?? vamp?.style ?? 'pop-rock';
  return (
    <Section title="Hear it" description="Play lights each note on the neck as you hear it. Tap any dot to hear that note on its own.">
      <Stack gap={4}>
        <div className={styles.fieldRow}>
          <Text variant="label" as="span" id="hear-what">
            Play
          </Text>
          <SegmentedControl
            aria-label="What to play"
            options={[
              { value: 'shape', label: 'This shape' },
              { value: 'octave', label: 'One octave' },
              { value: 'sequence', label: 'Exercise' },
            ]}
            value={settings.source}
            onChange={(v) => update({ source: v })}
            fullWidth
          />
        </div>
        <div className={styles.fieldRow}>
          <Text variant="label" as="span">
            Direction
          </Text>
          <SegmentedControl
            aria-label="Direction"
            options={[
              { value: 'up', label: 'Up' },
              { value: 'down', label: 'Down' },
              { value: 'up-down', label: 'Up and down' },
            ]}
            value={settings.direction}
            onChange={(v) => update({ direction: v })}
            fullWidth
          />
        </div>
        <div className={styles.tempoRow}>
          <Stepper label="Tempo" unit="BPM" min={BPM_MIN} max={BPM_MAX} step={2} largeStep={10} value={settings.bpm} onChange={(v) => update({ bpm: v })} format={(v) => `${v} beats per minute`} />
          <div className={styles.fieldRow}>
            <Text variant="label" as="span">
              Notes per beat
            </Text>
            <SegmentedControl aria-label="Notes per beat" options={PER_BEAT} value={settings.perBeat} onChange={(v) => update({ perBeat: v as 1 | 2 | 3 | 4 })} />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <Text variant="label" as="span">
            Underneath
          </Text>
          <SegmentedControl
            aria-label="What plays underneath"
            options={[
              { value: 'none', label: 'Nothing' },
              { value: 'drone', label: 'Drone' },
              { value: 'band', label: 'Band', disabled: !vamp },
            ]}
            value={settings.accompaniment === 'band' && !vamp ? 'drone' : settings.accompaniment}
            onChange={(v) => update({ accompaniment: v as Accompaniment })}
            fullWidth
          />
          <Text variant="caption" tone="muted" as="p">
            {settings.accompaniment === 'none' && 'Just the scale.'}
            {settings.accompaniment === 'drone' && 'A low, steady root note: hear how each note pulls against home.'}
            {settings.accompaniment === 'band' && vamp && (
              <>
                {vampWords(vamp)}
              </>
            )}
            {settings.accompaniment === 'band' && !vamp && 'No chord suits this scale, so it plays over a drone.'}
          </Text>
        </div>
        {settings.accompaniment === 'band' && vamp && (
          <Select
            label="Band style"
            value={style}
            onChange={(v) => update({ style: v as BackingStyleId })}
            options={VAMP_STYLES.map((id) => ({ value: id, label: BACKING_STYLES[id].name }))}
          />
        )}
        <div className={styles.switches}>
          <Switch label="Loop" description="Keep going round until you stop it." checked={settings.loop} onChange={(v) => update({ loop: v })} />
          <Switch label="Click" description="A metronome click, with one bar to count you in." checked={settings.click} onChange={(v) => update({ click: v })} />
        </div>
        <LinkButton to="arcade" params={playAlong} iconLeft="Gauge" iconRight="ArrowRight" fullWidth wrap>
          Play along and get scored
        </LinkButton>
      </Stack>
    </Section>
  );
});

/** The sentence under "Band": what the band plays and why. */
function vampWords(vamp: Vamp) {
  if (vamp.symbols.length > 4) {
    return (
      <>
        Drums, bass and keys play <strong>a 12-bar blues in {formatChord(vamp.symbols[0]).replace(/7$/, '')}</strong>: the home of this scale.
      </>
    );
  }
  const bars = vamp.symbols.map((s, i) => ({ s, r: vamp.romans[i] })).filter((b, i, all) => i === 0 || b.s !== all[i - 1].s);
  const roman = (r: string) => {
    try {
      return formatRoman(r);
    } catch {
      return r;
    }
  };
  if (bars.length === 1 || new Set(vamp.symbols).size === 1) {
    return (
      <>
        Drums, bass and keys vamp on <strong>{formatChord(bars[0].s)}</strong> ({roman(bars[0].r)}), a chord this scale sits on.
      </>
    );
  }
  return (
    <>
      Drums, bass and keys play <strong>{bars.map((b) => formatChord(b.s)).join(' – ')}</strong> ({bars.map((b) => roman(b.r)).join(' – ')}), chords that bring out this scale’s colour.
    </>
  );
}

// ── Practice ────────────────────────────────────────────────────────────────────────────────

/** Props of `<PracticePanel>`. */
export interface PracticePanelProps {
  shape: ScalePattern | null;
  exercises: readonly SequenceInfo[];
  sequence: SequenceKind;
  onSequence: (kind: SequenceKind) => void;
  tab: string;
  playingExercise: boolean;
  onPlayExercise: () => void;
  skill: SkillView | null;
  onMarkLearnt: () => void;
  tonic: string;
  scaleId: string;
  shapeTitle: string;
}

/** Exercises as tab with a click, marking the shape learnt, and the Arcade. */
export const PracticePanel = memo(
  forwardRef<TabViewHandle, PracticePanelProps>(function PracticePanel(props, tabRef) {
    const { shape, exercises, sequence, onSequence, tab, playingExercise, onPlayExercise, skill, onMarkLearnt, tonic, scaleId, shapeTitle } = props;
    const current = exercises.find((e) => e.id === sequence) ?? exercises[0];
    const learnt = !!skill && (skill.completed || skill.mastery >= 1);
    return (
      <Section title="Practise it" description="Turn the shape into music: walk it in patterns, mark it learnt, then drill it as a game.">
        <Stack gap={4}>
          {shape && exercises.length > 0 && current && (
            <Stack gap={3}>
              <ChipGroup aria-label="Exercise" options={exercises.map((e) => ({ value: e.id, label: e.name }))} value={current.id} onChange={(v) => onSequence(v as SequenceKind)} />
              <Text as="p" className={styles.measure}>
                {current.description} <span className={styles.mono}>{current.example}</span>
              </Text>
              <div className={styles.tab}>
                <TabSnippet ref={tabRef} tab={tab} size="sm" aria-label={`${current.name}, written as tab`} />
              </div>
              <div>
                <Button iconLeft={playingExercise ? 'Square' : 'Play'} onClick={onPlayExercise} pressed={playingExercise}>
                  {playingExercise ? 'Stop the exercise' : 'Play this exercise'}
                </Button>
              </div>
            </Stack>
          )}
          {shape && (
            <div className={cx(styles.learnt, learnt && styles.learntDone)}>
              <Icon name={learnt ? 'Crown' : 'Flag'} size="lg" />
              <div className={styles.learntText}>
                <Text weight="semibold" as="p">
                  {learnt ? `You know ${shapeTitle}` : `Know ${shapeTitle} by heart?`}
                </Text>
                <Text variant="caption" tone="muted" as="p">
                  {learnt
                    ? `${skill!.mastery} ${skill!.mastery === 1 ? 'crown' : 'crowns'} so far. Earn more by playing it in the Arcade.`
                    : 'Play it up and down from memory, slowly, without looking. Then mark it.'}
                </Text>
              </div>
              {!learnt && (
                <Button onClick={onMarkLearnt} iconLeft="Check">
                  Mark as learnt
                </Button>
              )}
            </div>
          )}
          <Stack gap={2}>
            <Text variant="label" as="h3">
              Practise in the Arcade
            </Text>
            <List variant="card">
              {ARCADE_GAMES.map((g) => (
                <ListItem key={g.id} icon={g.icon} title={g.title} subtitle={g.blurb} to="arcade" params={arcadeParams(g.id, tonic, scaleId, shape?.id ?? null)} />
              ))}
            </List>
          </Stack>
        </Stack>
      </Section>
    );
  }),
);

// ── Compare ─────────────────────────────────────────────────────────────────────────────────

/** Props of `<ComparePanel>`. */
export interface ComparePanelProps {
  scale: ScaleType;
  tonicLabel: string;
  suggestions: readonly string[];
  value: string | null;
  onChange: (id: string | null) => void;
  summary: CompareSummary | null;
}

/** Two scales on one neck: pick the second one, read what changes. */
export const ComparePanel = memo(function ComparePanel({ scale, tonicLabel, suggestions, value, onChange, summary }: ComparePanelProps) {
  const name = (id: string) => {
    const s = getScale(id);
    return s ? displayScaleName(s) : id;
  };
  const allOptions = scaleGroups().map((g) => ({
    group: g.title,
    options: g.scales.filter((s) => s.id !== scale.id && s.size < 12).map((s) => ({ value: s.id, label: `${tonicLabel} ${displayScaleName(s)}` })),
  }));
  const seen = new Set<string>();
  for (const g of allOptions) g.options = g.options.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  return (
    <Section title="Compare" description={`Put another scale on the same neck, from ${tonicLabel}, and see exactly which notes change.`}>
      <Stack gap={3}>
        <ChipGroup
          aria-label="Compare with"
          options={suggestions.slice(0, 5).map((id) => ({ value: id, label: name(id) }))}
          value={value && suggestions.slice(0, 5).includes(value) ? value : null}
          onChange={(v) => onChange(v === value ? null : v)}
        />
        <Select
          label="Or any other scale"
          value={value ?? ''}
          placeholder="Choose a scale to compare"
          onChange={(v) => onChange(v || null)}
          options={allOptions}
        />
        {summary && value && (
          <div className={styles.compareLegend} aria-live="polite">
            <Text as="p" weight="semibold">
              {summary.sentence}
            </Text>
            <ul className={styles.legendList}>
              <li>
                <span className={styles.legendDot} data-c={COMPARE_LOOK.shared.color} data-shape="circle" aria-hidden="true" />
                In both: {summary.shared.join(' ')}
              </li>
              <li>
                <span className={styles.legendDot} data-c={COMPARE_LOOK['only-a'].color} data-shape="square" aria-hidden="true" />
                Only in {displayScaleName(scale)}: {summary.onlyA.length ? summary.onlyA.join(' ') : 'nothing'}
              </li>
              <li>
                <span className={styles.legendDot} data-c={COMPARE_LOOK['only-b'].color} data-shape="diamond" aria-hidden="true" />
                Only in {name(value)}: {summary.onlyB.length ? summary.onlyB.join(' ') : 'nothing'}
              </li>
            </ul>
            <div>
              <Button size="sm" variant="ghost" iconLeft="X" onClick={() => onChange(null)}>
                Stop comparing
              </Button>
            </div>
          </div>
        )}
      </Stack>
    </Section>
  );
});

// ── Neck options ────────────────────────────────────────────────────────────────────────────

/** Props of `<NeckOptions>`. */
export interface NeckOptionsProps {
  open: boolean;
  onClose: () => void;
  settings: ScreenSettings;
  update: Update;
  lastFret: number;
  leftHanded: boolean;
  onLeftHanded: (left: boolean) => void;
  tuningLabel: string;
}

/** How much of the neck to draw, the capo, handedness and tuning. */
export function NeckOptions({ open, onClose, settings, update, lastFret, leftHanded, onLeftHanded, tuningLabel }: NeckOptionsProps) {
  const [from, to] = settings.custom;
  return (
    <Sheet open={open} onClose={onClose} title="Neck options" desktop="drawer" size="sm" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Text variant="label" as="span">
            Frets shown
          </Text>
          <SegmentedControl
            aria-label="Frets shown"
            options={[
              { value: 'neck', label: 'Whole neck' },
              { value: 'shape', label: 'The shape' },
              { value: 'custom', label: 'Choose' },
            ]}
            value={settings.range}
            onChange={(v) => update({ range: v as RangeMode })}
            fullWidth
          />
          {settings.range === 'custom' && (
            <div className={styles.rangeRow}>
              <Stepper label="From fret" min={0} max={Math.max(0, to - 4)} value={from} onChange={(v) => update({ custom: [v, to] })} />
              <Stepper label="To fret" min={from + 4} max={24} value={to} onChange={(v) => update({ custom: [from, v] })} />
            </div>
          )}
          <Text variant="caption" tone="muted" as="p">
            {settings.range === 'neck' && `Frets 0 to ${lastFret}, as set in Settings. The neck scrolls sideways to the shape.`}
            {settings.range === 'shape' && 'Zoomed in on the shape you are learning.'}
            {settings.range === 'custom' && 'Any stretch of the neck: every note of the scale in it is shown.'}
          </Text>
        </Stack>
        <Stepper
          label="Capo"
          min={0}
          max={12}
          value={settings.capo}
          onChange={(v) => update({ capo: v })}
          format={(v) => (v === 0 ? 'no capo' : `capo on fret ${v}`)}
          hint={settings.capo > 0 ? 'Shapes and dots count frets from the capo, as tab does. Everything sounds higher.' : 'No capo.'}
        />
        <Switch label="Left-handed neck" description="Mirrors every fretboard in the app (a Setting)." checked={leftHanded} onChange={onLeftHanded} />
        <Stack gap={1}>
          <Text variant="label" as="span">
            Tuning
          </Text>
          <Text as="p">{tuningLabel}</Text>
          <div>
            <LinkButton to="profile" params={['settings', 'instrument']} variant="ghost" size="sm" iconRight="ArrowRight">
              Change tuning in Settings
            </LinkButton>
          </div>
        </Stack>
      </Stack>
    </Sheet>
  );
}
