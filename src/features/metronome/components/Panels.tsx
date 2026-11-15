/**
 * The metronome's settings, one panel per topic. On phones each opens in a bottom sheet; on a
 * wide screen they sit in the right-hand pane. Panels are plain controlled components: they get the
 * settings and report changes, the screen owns the state.
 */
import { useEffect, useState } from 'react';
import { CLICK_SETS, audioNow, playClick, resolveMeter, unlockAudio, type ClickSet, type Meter, type MetronomeBeat, type Subdivision } from '@/core/audio';
import { Button, ChipGroup, Icon, IconButton, ProgressBar, RadioGroup, SegmentedControl, Slider, Stepper, Switch, Text, TextField, cx, formatClock } from '@/ui';
import { METER_CHOICES, beatNoteWords, type MeterChoice, groupingWords, meterChoice, meterKey, parseMeterKey, tempoBeatNote } from '../model/meters';
import { canVibrate } from '../model/session';
import { BUILT_IN_PRESETS, COUNT_IN_CHOICES, PRESET_NAME_MAX, TIMER_CHOICES, describeSetup, presetMatches, setupOf, suggestPresetName, type MetronomeSettings, type Preset } from '../model/settings';
import { SUBDIVISION_INFO, SWING_MAX, SWING_MIN, perBeatWords, subdivisionChoices, swingWords } from '../model/subdivisions';
import { TEMPO_MAX, TEMPO_MIN } from '../model/tempo';
import { trainerConfig, trainerLine, trainerPlanWords, trainerProgress } from '../model/trainer';
import { SubdivisionPicture } from './NoteGlyphs';
import styles from './Panels.module.css';

type Update = (fn: (s: MetronomeSettings) => MetronomeSettings) => void;

// --- time signature ------------------------------------------------------------------------------

/** Props for {@link MeterPanel}. */
export interface MeterPanelProps {
  meterKey: string;
  meter: Meter;
  onMeter: (key: string) => void;
  /** Leave out the four common meters (they are already one tap away beside the beats). */
  skipCommon?: boolean;
}

/** Every time signature, and the grouping of odd meters explained in plain words. */
export function MeterPanel({ meterKey: current, meter, onMeter, skipCommon = false }: MeterPanelProps) {
  const choice = meterChoice(current);
  const ts = parseMeterKey(current);
  const list = skipCommon ? METER_CHOICES.slice(4) : METER_CHOICES;
  const note = tempoBeatNote(meter);
  return (
    <div className={styles.panel}>
      <div className={styles.meterGrid} role="group" aria-label="Time signatures">
        {list.map((m) => {
          const selected = choice?.id === m.id;
          return (
            <button key={m.id} type="button" className={cx(styles.meterTile, selected && styles.selected)} aria-pressed={selected} onClick={() => onMeter(selected ? current : m.id)} data-meter-choice={m.id}>
              {selected && (
                <span className={styles.tick}>
                  <Icon name="Check" size={12} strokeWidth={3} />
                </span>
              )}
              <span className={styles.meterId}>{m.id}</span>
              <span className={styles.meterBeats}>{beatsWord(m)}</span>
            </button>
          );
        })}
      </div>
      {choice && (
        <div className={styles.about} aria-live="polite">
          <Text weight="semibold">{choice.id}</Text>
          <Text tone="muted" size="sm">
            {choice.blurb} The tempo counts {beatNoteWords(note)}.
          </Text>
        </div>
      )}
      {choice && ts && choice.groupings.length > 1 && (
        <RadioGroup
          label={`How to group ${choice.id}`}
          variant="cards"
          minCardWidth="13rem"
          value={meterKey(ts)}
          onChange={onMeter}
          options={choice.groupings.map((g) => ({
            value: meterKey({ numerator: choice.numerator, denominator: choice.denominator, grouping: g }),
            label: g.join('+'),
            description: groupingWords(g),
          }))}
          hint="The first click of each group is louder, so you hear where the groups start."
        />
      )}
    </div>
  );
}

/** "3 beats", or "3 or 4 beats" when the groupings differ in how many beats they make. */
function beatsWord(m: MeterChoice): string {
  const counts = [...new Set(m.groupings.map((g) => resolveMeter({ numerator: m.numerator, denominator: m.denominator, grouping: g }).beats.length))].sort((a, b) => a - b);
  const n = counts.join(' or ');
  return `${n} ${counts.length === 1 && counts[0] === 1 ? 'beat' : 'beats'}`;
}

// --- rhythm ----------------------------------------------------------------------------------------

/** Props for {@link RhythmPanel}. */
export interface RhythmPanelProps {
  meter: Meter;
  subdivision: Subdivision;
  swing: number;
  onSubdivision: (s: Subdivision) => void;
  onSwing: (ratio: number) => void;
}

/** Subdivisions with a picture each, and the swing feel. */
export function RhythmPanel({ meter, subdivision, swing, onSubdivision, onSwing }: RhythmPanelProps) {
  const choices = subdivisionChoices(meter, subdivision);
  const dotted = meter.beats[0] ? meter.beats[0].length % 960 !== 0 : false;
  return (
    <div className={styles.panel}>
      <div className={styles.subGrid} role="group" aria-label="Subdivision">
        {choices.map((c) => {
          const info = SUBDIVISION_INFO[c.id];
          const selected = c.id === subdivision;
          return (
            <button key={c.id} type="button" className={cx(styles.subTile, selected && styles.selected)} aria-pressed={selected} onClick={() => onSubdivision(c.id)} data-subdivision={c.id}>
              {selected && (
                <span className={styles.tick}>
                  <Icon name="Check" size={12} strokeWidth={3} />
                </span>
              )}
              <SubdivisionPicture subdivision={c.id} count={c.perBeat[0] ?? 1} dottedBeat={dotted} className={styles.picture} />
              <span className={styles.subLabel}>{info.label}</span>
              <span className={styles.subCount}>{perBeatWords(c.perBeat)}</span>
            </button>
          );
        })}
      </div>
      <Text tone="muted" size="sm" aria-live="polite">
        {SUBDIVISION_INFO[subdivision].blurb}
      </Text>
      {subdivision === 'swing' && (
        <Slider
          label="Swing feel"
          min={Math.round(SWING_MIN * 100)}
          max={Math.round(SWING_MAX * 100)}
          step={1}
          value={Math.round(swing * 100)}
          onChange={(v) => onSwing(v / 100)}
          format={(v) => `${swingWords(v / 100)} · ${v}%`}
          marks={[{ value: 50, label: 'Straight' }, { value: 67, label: 'Triplet' }, { value: 75, label: 'Hard' }]}
          hint="How much of the beat the first eighth takes. 67% is the classic triplet swing."
        />
      )}
    </div>
  );
}

// --- sound -------------------------------------------------------------------------------------------

const SOUND_LABELS: Record<ClickSet, string> = { woodblock: 'Woodblock', beep: 'Beep', tick: 'Tick', hihat: 'Hi-hat', rim: 'Rim click', cowbell: 'Cowbell', clave: 'Clave' };

/** The click's name for labels. */
export function soundLabel(set: ClickSet): string {
  return SOUND_LABELS[set];
}

/** Props for {@link SoundPanel}. */
export interface SoundPanelProps {
  sound: ClickSet;
  onSound: (set: ClickSet) => void;
  volume: number;
  onVolume: (v: number) => void;
  countIn: number;
  onCountIn: (bars: number) => void;
}

/** Click sound (with a preview), click volume and count-in. */
export function SoundPanel({ sound, onSound, volume, onVolume, countIn, onCountIn }: SoundPanelProps) {
  const preview = (set: ClickSet) => {
    void unlockAudio();
    // A strong click and a normal one, so the difference between them is heard too.
    const at = audioNow();
    playClick(set, 'accent', at + 0.03, volume || 1);
    playClick(set, 'beat', at + 0.38, volume || 1);
  };
  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <Text variant="label" as="p" id="metronome-sound-label">
          Click sound
        </Text>
        <ChipGroup
          aria-label="Click sound"
          scroll="never"
          options={CLICK_SETS.map((s) => ({ value: s, label: SOUND_LABELS[s] }))}
          value={sound}
          onChange={(v) => {
            if (!v) return;
            onSound(v);
            preview(v);
          }}
        />
        <Text tone="muted" size="sm">
          Tap one to hear it. It is also the click everywhere else in the app.
        </Text>
      </div>
      <Slider label="Click volume" min={0} max={150} step={5} value={Math.round(volume * 100)} onChange={(v) => onVolume(v / 100)} format={(v) => (v === 0 ? 'Off' : `${v}%`)} hint="Above 100% for a noisy room or a loud amp." />
      <div className={styles.field}>
        <SegmentedControl aria-label="Count-in" options={COUNT_IN_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'No count-in' : `${n} ${n === 1 ? 'bar' : 'bars'}` }))} value={countIn} onChange={onCountIn} fullWidth />
        <Text tone="muted" size="sm">
          Count-in: clicks before the first bar, so you can come in on time.
        </Text>
      </div>
    </div>
  );
}

// --- practice helpers --------------------------------------------------------------------------------

/** Props for {@link PracticePanel}. */
export interface PracticePanelProps {
  settings: MetronomeSettings;
  update: Update;
  running: boolean;
  /** Seconds counted by the session timer so far. */
  timerSec: number;
  onResetTimer: () => void;
  onBeat: (fn: (beat: MetronomeBeat) => void) => () => void;
  /** Called when the learner switches the speed trainer on: sets its start to the current tempo. */
  onTrainer: (on: boolean) => void;
}

/** Speed trainer, silent bars, session timer, visual-only and vibration. All off by default. */
export function PracticePanel({ settings, update, running, timerSec, onResetTimer, onBeat, onTrainer }: PracticePanelProps) {
  const t = settings.trainer;
  const g = settings.gap;
  const cfg = trainerConfig(t);
  const vibrateSupported = canVibrate();
  return (
    <div className={cx(styles.panel, styles.helpers)}>
      <div className={styles.helper} data-helper="trainer">
        <Switch label="Speed trainer" description="Starts slow and gets a little faster every few bars, up to your target." checked={t.on} onChange={onTrainer} />
        {t.on && (
          <div className={styles.helperBody}>
            <div className={styles.steppers}>
              <Stepper label="Start" unit="BPM" min={TEMPO_MIN} max={TEMPO_MAX} value={t.start} onChange={(v) => update((s) => ({ ...s, tempo: v, trainer: { ...s.trainer, start: v } }))} />
              <Stepper label="Target" unit="BPM" min={TEMPO_MIN} max={TEMPO_MAX} value={t.target} onChange={(v) => update((s) => ({ ...s, trainer: { ...s.trainer, target: v } }))} />
              <Stepper label="Step" unit="BPM" min={1} max={50} value={t.step} onChange={(v) => update((s) => ({ ...s, trainer: { ...s.trainer, step: v } }))} />
              <Stepper label="Every" unit={t.every === 1 ? 'bar' : 'bars'} min={1} max={32} value={t.every} onChange={(v) => update((s) => ({ ...s, trainer: { ...s.trainer, every: v } }))} />
            </div>
            {cfg ? <TrainerProgressView cfg={cfg} running={running} onBeat={onBeat} /> : <Text tone="warn" size="sm">Set a target different from the start.</Text>}
          </div>
        )}
      </div>

      <div className={styles.helper} data-helper="gap">
        <Switch label="Silent bars" description="Clicks for a few bars, then goes quiet. Keep the beat going on your own and land with the click when it comes back." checked={g.on} onChange={(on) => update((s) => ({ ...s, gap: { ...s.gap, on } }))} />
        {g.on && (
          <div className={styles.helperBody}>
            <div className={styles.steppers}>
              <Stepper label="Click for" unit={g.play === 1 ? 'bar' : 'bars'} min={1} max={16} value={g.play} onChange={(v) => update((s) => ({ ...s, gap: { ...s.gap, play: v } }))} />
              <Stepper label="Silent for" unit={g.mute === 1 ? 'bar' : 'bars'} min={1} max={16} value={g.mute} onChange={(v) => update((s) => ({ ...s, gap: { ...s.gap, mute: v } }))} />
            </div>
          </div>
        )}
      </div>

      <div className={styles.helper} data-helper="timer">
        <div className={styles.helperHead}>
          <div>
            <Text weight="semibold" as="p" id="metronome-timer-label">
              Session timer
            </Text>
            <Text tone="muted" size="sm" as="p">
              {settings.timerMinutes > 0 ? 'Stops the click when the time is up.' : 'Counts your practice time. Pick a length to stop on time.'}
            </Text>
          </div>
          <div className={styles.timerReadout}>
            <Text mono tabular weight="semibold">
              {formatClock(Math.floor(timerSec))}
            </Text>
            {timerSec >= 1 && <IconButton icon="RotateCcw" label="Reset the timer" size="sm" onClick={onResetTimer} />}
          </div>
        </div>
        <ChipGroup
          aria-label="Session length"
          scroll="auto"
          options={TIMER_CHOICES.map((m) => ({ value: String(m), label: m === 0 ? 'No limit' : `${m} min` }))}
          value={String(settings.timerMinutes)}
          onChange={(v) => v !== null && update((s) => ({ ...s, timerMinutes: Number(v) }))}
        />
      </div>

      <div className={styles.helper} data-helper="visual">
        <Switch label="Flash only, no sound" description="The dial and the beats flash; nothing is heard. For headphones-off practice, or a sleeping house." checked={settings.visualOnly} onChange={(on) => update((s) => ({ ...s, visualOnly: on }))} />
      </div>

      <div className={styles.helper} data-helper="vibrate">
        {vibrateSupported ? (
          <Switch label="Vibrate on each beat" description="A short buzz on every beat, longer on the first. Keep the phone in your pocket or on your knee." checked={settings.vibrate} onChange={(on) => update((s) => ({ ...s, vibrate: on }))} />
        ) : (
          <div>
            <Text weight="semibold" as="p">
              Vibrate on each beat
            </Text>
            <Text tone="muted" size="sm" as="p">
              This browser cannot vibrate the device (on iPhones and computers it never can).
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

/** Where the speed trainer is, updated once a bar while it runs. */
function TrainerProgressView({ cfg, running, onBeat }: { cfg: NonNullable<ReturnType<typeof trainerConfig>>; running: boolean; onBeat: PracticePanelProps['onBeat'] }) {
  const [bar, setBar] = useState<number | null>(null);
  useEffect(() => {
    if (!running) {
      setBar(null);
      return undefined;
    }
    // Any beat says which bar it is in, so a panel opened mid-bar shows the climb at once.
    return onBeat((b) => {
      if (!b.countIn) setBar(b.bar);
    });
  }, [running, onBeat]);
  const p = trainerProgress(cfg, bar ?? 0);
  return (
    <div className={styles.trainerView} data-trainer-bpm={p.bpm}>
      <ProgressBar
        label={running && bar !== null ? `Now ${p.bpm} BPM` : `${cfg.startBpm} to ${cfg.targetBpm} BPM`}
        value={running && bar !== null ? Math.round(p.fraction * 100) : 0}
        max={100}
        valueText={running && bar !== null ? `${p.bpm} of ${cfg.targetBpm}` : false}
        tone="accent"
      />
      <Text tone="muted" size="sm" aria-live="polite">
        {running && bar !== null ? trainerLine(p, cfg) : `${trainerPlanWords(cfg)}. Press Start to begin the climb.`}
      </Text>
    </div>
  );
}

// --- presets -------------------------------------------------------------------------------------------

/** Props for {@link PresetsPanel}. */
export interface PresetsPanelProps {
  settings: MetronomeSettings;
  presets: readonly Preset[];
  onApply: (preset: Preset) => void;
  onSave: (name: string) => void;
  onDelete: (preset: Preset) => void;
}

/** Save the current setup under a name; recall any preset with one tap. */
export function PresetsPanel({ settings, presets, onApply, onSave, onDelete }: PresetsPanelProps) {
  const [name, setName] = useState('');
  const suggestion = suggestPresetName(setupOf(settings));
  const save = () => {
    onSave(name.trim() || suggestion);
    setName('');
  };
  const row = (p: Preset) => {
    const current = presetMatches(settings, p);
    return (
      <li key={p.id} className={styles.presetRow}>
        <button type="button" className={cx(styles.preset, current && styles.selected)} aria-pressed={current} onClick={() => onApply(p)} data-preset={p.id}>
          <span className={styles.presetIcon} aria-hidden="true">
            <Icon name={current ? 'Check' : p.builtIn ? 'Music2' : 'Bookmark'} size={18} />
          </span>
          <span className={styles.presetText}>
            <span className={styles.presetName}>{p.name}</span>
            <span className={styles.presetMeta}>{p.note ?? describeSetup(p.setup)}</span>
          </span>
        </button>
        {!p.builtIn && <IconButton icon="Trash2" label={`Delete ${p.name}`} onClick={() => onDelete(p)} />}
      </li>
    );
  };
  return (
    <div className={styles.panel}>
      <form
        className={styles.saveForm}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="Save this setup as" value={name} onChange={(v) => setName(v.slice(0, PRESET_NAME_MAX))} placeholder={suggestion} hint={describeSetup(setupOf(settings))} />
        <Button type="submit" iconLeft="Save">
          Save preset
        </Button>
      </form>
      {presets.length > 0 && (
        <div className={styles.field}>
          <Text variant="label" as="h3">
            Your presets
          </Text>
          <ul className={styles.presetList}>{presets.map(row)}</ul>
        </div>
      )}
      <div className={styles.field}>
        <Text variant="label" as="h3">
          Ready-made
        </Text>
        <ul className={styles.presetList}>{BUILT_IN_PRESETS.map(row)}</ul>
      </div>
    </div>
  );
}
