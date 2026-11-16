/**
 * The player's controls, built from the kit: the mode picker, tempo (compact − 100 % + with a
 * slider one tap away, or the full stepper and slider in the side panel; the beats a minute are
 * counted in the meter's own beat, ♩. = 60 in 6/8), the loop button, and the options (count-in,
 * click, speed trainer, parts with mute and solo, what the score shows, hiding the chord chart,
 * key and capo, the guitar sound, keyboard shortcuts). The side panel on wide screens and the
 * "More" sheet on phones render the same options.
 */
import { TONE_NAMES } from '@/core/audio';
import type { Song } from '@/core/song';
import { Button, ButtonGroup, Icon, IconButton, Kbd, Popover, SegmentedControl, Slider, Stepper, Switch, Text, Tooltip, cx, focusRing, useIsTouch } from '@/ui';
import type { EngineState } from '../engine/engine';
import { SHORTCUTS } from '../model/keys';
import { loopLabel, loopShort, type SectionChip } from '../model/loop';
import { tempoStep } from '../model/keys';
import type { ArrangementWords } from '../model/arrange';
import type { TempoMark } from '../model/meter';
import { passesToTarget, TRAINER_STEPS, trainerSummary, type TrainerSettings } from '../model/trainer';
import { MAX_CAPO, MAX_TEMPO, MAX_TRANSPOSE, MIN_TEMPO, MODE_HINTS, MODE_NAMES, type Arrangement, type PracticeMode, type ScoreLayer } from '../model/types';
import styles from './Controls.module.css';

const MODE_ICONS: Record<PracticeMode, string> = { listen: 'Ear', wait: 'Hourglass', flow: 'Zap', tap: 'Pointer' };

/** Listen, Wait, Flow (with a microphone) or Listen, Tap along (without). */
export function ModePicker({ mode, micAvailable, onChange, size = 'md', icons = true, fullWidth = true, className }: { mode: PracticeMode; micAvailable: boolean; onChange: (m: PracticeMode) => void; size?: 'sm' | 'md'; icons?: boolean; fullWidth?: boolean; className?: string }) {
  const modes: PracticeMode[] = micAvailable ? ['listen', 'wait', 'flow', 'tap'] : ['listen', 'tap'];
  return (
    <div className={cx(styles.modes, className)} data-player-modes="">
      <SegmentedControl
        aria-label="Practice mode"
        size={size}
        fullWidth={fullWidth}
        value={modes.includes(mode) ? mode : 'listen'}
        onChange={(m) => onChange(m as PracticeMode)}
        options={modes.map((m) => ({ value: m, label: MODE_NAMES[m], ...(icons ? { icon: MODE_ICONS[m] } : {}), ariaLabel: `${MODE_NAMES[m]}: ${MODE_HINTS[m]}${m === 'wait' ? ' (W)' : m === 'flow' ? ' (F)' : ''}` }))}
      />
    </div>
  );
}

/** − 100 % +, with the slider one tap away on the number. `mark` is the tempo in the meter's own beat. */
export function TempoCompact({ tempo, mark, onChange, vertical }: { tempo: number; mark: TempoMark; onChange: (p: number) => void; vertical?: boolean }) {
  // On a touch screen the popover must not focus the number field: the on-screen keyboard would
  // cover the slider the learner opened it for. Focus lands on the panel; the field is a tap away.
  const touch = useIsTouch();
  return (
    <div className={cx(styles.tempo, vertical && styles.tempoVertical)} role="group" aria-label="Tempo">
      <IconButton icon="Minus" label={`Slower (${SHORTCUTS.slower})`} onClick={() => onChange(tempoStep(tempo, -1))} disabled={tempo <= MIN_TEMPO} />
      <Popover
        aria-label="Tempo"
        placement={vertical ? 'left' : 'top'}
        align="center"
        trigger={
          <button type="button" className={cx(styles.tempoValue, focusRing)} aria-label={`Tempo ${tempo} percent, ${mark.spoken}. Change it`} data-player-tempo={tempo} data-player-bpm={mark.value}>
            <span className={styles.tempoNum}>{tempo}%</span>
            <span className={styles.tempoBpm}>{mark.short}</span>
          </button>
        }
      >
        {touch ? (
          <div tabIndex={-1} data-autofocus="" className={styles.tempoPanel}>
            <TempoFull tempo={tempo} mark={mark} onChange={onChange} />
          </div>
        ) : (
          <TempoFull tempo={tempo} mark={mark} onChange={onChange} />
        )}
      </Popover>
      <IconButton icon="Plus" label={`Faster (${SHORTCUTS.faster})`} onClick={() => onChange(tempoStep(tempo, 1))} disabled={tempo >= MAX_TEMPO} />
    </div>
  );
}

const PRESETS = [50, 75, 100];

/** Tempo as an exact stepper, a slider and three presets. */
export function TempoFull({ tempo, mark, onChange }: { tempo: number; mark: TempoMark; onChange: (p: number) => void }) {
  const hint = mark.beat.glyph ? `${mark.spoken} (${mark.short}). The pitch stays the same.` : `${mark.spoken[0].toUpperCase()}${mark.spoken.slice(1)}. The pitch stays the same.`;
  return (
    <div className={styles.tempoFull} data-player-tempo={tempo} data-player-bpm={mark.value}>
      <Stepper label="Tempo" unit="%" min={MIN_TEMPO} max={MAX_TEMPO} step={5} value={tempo} onChange={onChange} format={(v) => `${v} percent`} hint={`${hint[0].toUpperCase()}${hint.slice(1)}`} />
      <Slider label="Tempo" hideLabel min={MIN_TEMPO} max={MAX_TEMPO} step={1} value={tempo} onChange={onChange} format={(v) => `${v} %`} marks={[{ value: 50, label: '50' }, { value: 100, label: '100' }, { value: 150, label: '150' }]} showValue={false} />
      <ButtonGroup>
        {PRESETS.map((p) => (
          <Button key={p} size="sm" pressed={tempo === p} onClick={() => onChange(p)}>
            {p} %
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}

/** The loop button: "Loop" to start choosing bars; with a loop, its bars (and a menu). Compact: the icon, plus the bars once there is a loop. */
export function LoopButton({ loop, picking, onClick, compact }: { loop: EngineState['loop']; picking: boolean; onClick: () => void; compact?: boolean }) {
  const label = compact ? (loop ? loopShort(loop) : '') : picking ? 'Choosing bars' : loop ? `Loop ${loopShort(loop)}` : 'Loop';
  return (
    <Tooltip content={loop ? `${loopLabel(loop)} loop. Change or clear it (L)` : 'Loop a passage: tap its first and last bar (L)'}>
      <Button
        size={compact ? 'sm' : 'md'}
        iconLeft="Repeat"
        pressed={!!loop || picking}
        onClick={onClick}
        className={cx(styles.loopBtn, compact && styles.loopBtnCompact)}
        aria-label={loop ? `${loopLabel(loop)} loop. Change or clear it` : picking ? 'Choosing bars for a loop' : 'Loop a passage'}
        data-player-loop={loop ? `${loop.from}-${loop.to}` : picking ? 'picking' : ''}
      >
        {label ? <span className={styles.loopText}>{label}</span> : null}
      </Button>
    </Tooltip>
  );
}

/** The loop's own settings: the speed trainer, quick loops of each section, change or clear. */
export function LoopOptions({ state, sections, judged, onTrainer, onLoop, onPick, tempoAt }: {
  state: EngineState;
  sections: readonly SectionChip[];
  judged: boolean;
  onTrainer: (t: TrainerSettings) => void;
  onLoop: (r: EngineState['loop']) => void;
  onPick: () => void;
  /** A tempo percent in the meter's own beat ("♩. = 42"). */
  tempoAt?: (percent: number) => string;
}) {
  const t = state.trainer;
  return (
    <div className={styles.group} data-player-loop-options="" data-player-loop={state.loop ? `${state.loop.from}-${state.loop.to}` : ''}>
      <div className={styles.loopRow}>
        <Text weight="semibold">{state.loop ? `${loopLabel(state.loop)}` : 'No loop yet'}</Text>
        <ButtonGroup>
          <Button size="sm" iconLeft="MousePointerClick" onClick={onPick}>
            {state.loop ? 'Change bars' : 'Choose bars'}
          </Button>
          {state.loop && (
            <Button size="sm" variant="ghost" iconLeft="X" onClick={() => onLoop(null)} data-player-loop-clear="">
              Clear
            </Button>
          )}
        </ButtonGroup>
      </div>
      {sections.length > 1 && (
        <div className={styles.quick}>
          <Text variant="caption" tone="muted">
            Loop a section
          </Text>
          <div className={styles.quickRow}>
            {sections.map((s) => (
              <Button key={s.slug} size="sm" variant="ghost" pressed={state.loop?.from === s.range.from && state.loop?.to === s.range.to} onClick={() => onLoop(s.range)}>
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Switch
        label="Speed trainer"
        description={trainerSummary(t, judged, tempoAt)}
        checked={t.on}
        onChange={(on) => onTrainer({ ...t, on })}
        data-player-trainer=""
      />
      {t.on && (
        <div className={styles.trainer}>
          <Stepper label="Start at" unit="%" min={MIN_TEMPO} max={Math.min(MAX_TEMPO, t.target)} step={5} value={t.start} onChange={(v) => onTrainer({ ...t, start: v })} />
          <Stepper label="Up to" unit="%" min={t.start} max={MAX_TEMPO} step={5} value={t.target} onChange={(v) => onTrainer({ ...t, target: v })} />
          <div className={styles.field}>
            <Text variant="label">Each step</Text>
            <SegmentedControl aria-label="Each step" size="sm" value={String(t.step)} onChange={(v) => onTrainer({ ...t, step: Number(v) })} options={TRAINER_STEPS.map((s) => ({ value: String(s), label: `+${s} %` }))} />
          </div>
          <Text variant="caption" tone="muted">
            {passesToTarget(t)} clean {passesToTarget(t) === 1 ? 'loop' : 'loops'} to get there{state.loop ? '' : ' (choose a loop first)'}.
          </Text>
        </div>
      )}
    </div>
  );
}

const TONE_LABELS: Record<string, string> = { steel: 'Steel acoustic', nylon: 'Nylon classical', clean: 'Clean electric', driven: 'Driven electric' };
const GUITAR_TONES = TONE_NAMES.filter((t) => t in TONE_LABELS);

/** What the score can show, in picker order. The middle one's label is named in song texts ("Tab and notes"). */
const LAYER_OPTIONS: Array<{ value: ScoreLayer; label: string; ariaLabel: string }> = [
  { value: 'tab', label: 'Tab', ariaLabel: 'Tab only' },
  { value: 'both', label: 'Tab and notes', ariaLabel: 'Tab with the notes on a staff above it' },
  { value: 'notation', label: 'Notes only', ariaLabel: 'Notes only: the tab is covered, for reading the staff' },
];

/** Count-in, click, parts, score, chord chart, key and capo, and sound. */
export function MoreOptions({ state, song, written, words, countInText, onCountIn, onMetronome, onTrack, onMute, onSolo, onPartAudible, onLayer, onNeck, onHideChart, onArrangement, onTone, showKeys }: {
  state: EngineState;
  /** The song as played (arranged to the learner's capo and key). */
  song: Song;
  /** The song as written: its own capo, and whether it has chords. */
  written: Pick<Song, 'capo' | 'chords'>;
  /** What the key and capo come to ("Sounds in A major. You play G major shapes with a capo on fret 2."). */
  words: ArrangementWords;
  /** "One bar of clicks before the music starts: 2 dotted-quarter beats." */
  countInText: string;
  onCountIn: (on: boolean) => void;
  onMetronome: (on: boolean) => void;
  onTrack: (id: string) => void;
  onMute: (id: string, on: boolean) => void;
  onSolo: (id: string, on: boolean) => void;
  onPartAudible: (on: boolean) => void;
  onLayer: (l: ScoreLayer) => void;
  onNeck: (on: boolean) => void;
  onHideChart: (on: boolean) => void;
  onArrangement: (a: Arrangement) => void;
  onTone: (t: string) => void;
  showKeys: boolean;
}) {
  const micMode = state.mode === 'wait' || state.mode === 'flow';
  const a = state.arrangement;
  const capo = a.capo ?? written.capo;
  const changed = a.transpose !== 0 || capo !== written.capo;
  return (
    <div className={styles.more}>
      <section className={styles.group} aria-label="Timing">
        <Switch label="Count-in" description={countInText} checked={state.countIn} onChange={onCountIn} />
        <Switch label={`Click (${SHORTCUTS.metronome})`} description="A metronome click on every beat." checked={state.metronome} onChange={onMetronome} data-player-metronome="" />
      </section>

      <section className={styles.group} aria-labelledby="player-parts">
        <Text variant="label" id="player-parts">
          Parts
        </Text>
        <ul className={styles.tracks}>
          {song.tracks.map((t) => {
            const mine = t.id === state.track;
            const muted = state.muted.includes(t.id);
            const solo = state.solo.includes(t.id);
            return (
              <li key={t.id} className={cx(styles.trackRow, mine && styles.trackMine)}>
                <button type="button" className={styles.trackPick} aria-pressed={mine} onClick={() => onTrack(t.id)}>
                  <span className={styles.trackName}>
                    {mine && <Icon name="Check" size="xs" />} {t.name || 'Guitar'}
                  </span>
                  <span className={styles.trackRole}>{mine ? 'You play this' : t.role === 'rhythm' ? 'Chords and strumming' : t.role === 'bass' ? 'Bass' : 'Melody'}</span>
                </button>
                <IconButton icon={muted ? 'VolumeX' : 'Volume2'} label={muted ? `Unmute ${t.name}` : `Mute ${t.name}`} pressed={muted} onClick={() => onMute(t.id, !muted)} />
                <IconButton icon="Headphones" label={solo ? `Stop soloing ${t.name}` : `Solo ${t.name}`} pressed={solo} onClick={() => onSolo(t.id, !solo)} />
              </li>
            );
          })}
        </ul>
        {micMode && (
          <Switch
            label="Hear my part too"
            description="Off, the microphone hears only you. Headphones help when it is on."
            checked={state.partAudible}
            onChange={onPartAudible}
          />
        )}
      </section>

      <section className={styles.group} aria-label="Score">
        <div className={styles.field}>
          <Text variant="label">Score</Text>
          <SegmentedControl aria-label="Score" fullWidth value={state.layer} onChange={(v) => onLayer(v as ScoreLayer)} options={LAYER_OPTIONS} data-player-layer={state.layer} />
          {state.layer === 'notation' && (
            <Text variant="caption" tone="muted">
              Read the notes from the staff: the tab under it is covered.
            </Text>
          )}
        </div>
        {written.chords.length > 0 && (
          <Switch
            label="Hide the chord names"
            description="Play it from memory: chord names and boxes are hidden. Wait mode still listens and tells you what it heard."
            checked={state.hideChart}
            onChange={onHideChart}
            data-player-hide-chart=""
          />
        )}
        <Switch label="Fretboard" description="The notes to play now, lit on the neck; the next ones dimmed." checked={state.neck} onChange={onNeck} />
      </section>

      <section className={styles.group} aria-labelledby="player-key" data-player-arrangement={`${a.transpose}:${capo}`}>
        <Text variant="label" id="player-key">
          Key and capo
        </Text>
        <Stepper
          label="Your capo"
          min={0}
          max={MAX_CAPO}
          value={capo}
          onChange={(v) => onArrangement({ ...a, capo: v })}
          format={(v) => (v === 0 ? 'no capo' : `capo on fret ${v}`)}
          hint="Put it on and play the same shapes: the song moves up with it."
        />
        <Stepper
          label="Move the song"
          unit="semitones"
          min={-MAX_TRANSPOSE}
          max={MAX_TRANSPOSE}
          value={a.transpose}
          onChange={(v) => onArrangement({ ...a, transpose: v })}
          format={(v) => (v === 0 ? 'as written' : `${Math.abs(v)} ${Math.abs(v) === 1 ? 'semitone' : 'semitones'} ${v > 0 ? 'up' : 'down'}`)}
          hint="Up or down to suit your voice. The tab and the chords change to match."
        />
        <Text size="sm" data-player-sounds="">
          {words.line}
        </Text>
        {(changed || (a.transpose > 0 && capo === written.capo && capo + a.transpose <= MAX_CAPO)) && (
          <ButtonGroup>
            {a.transpose > 0 && capo + a.transpose <= MAX_CAPO && (
              <Button size="sm" iconLeft="Shapes" onClick={() => onArrangement({ transpose: 0, capo: capo + a.transpose })}>
                Same key, easier shapes: capo {capo + a.transpose}
              </Button>
            )}
            {changed && (
              <Button size="sm" variant="ghost" iconLeft="RotateCcw" onClick={() => onArrangement({ transpose: 0, capo: null })} data-player-as-written="">
                As written
              </Button>
            )}
          </ButtonGroup>
        )}
      </section>

      <section className={styles.group} aria-label="Guitar sound">
        <div className={styles.field}>
          <Text variant="label">Guitar sound</Text>
          <SegmentedControl aria-label="Guitar sound" size="sm" fullWidth value={GUITAR_TONES.includes(state.tone) ? state.tone : 'steel'} onChange={(v) => onTone(String(v))} options={GUITAR_TONES.map((t) => ({ value: t, label: TONE_LABELS[t].split(' ')[0] }))} />
        </div>
      </section>

      {showKeys && (
        <section className={styles.group} aria-label="Keyboard shortcuts">
          <Text variant="label">Keys</Text>
          <dl className={styles.keys}>
            <KeyRow k={SHORTCUTS.toggle} what="Play and pause" />
            <KeyRow k={`${SHORTCUTS['prev-bar']} ${SHORTCUTS['next-bar']}`} what="Previous and next bar" />
            <KeyRow k={SHORTCUTS.loop} what="Loop: first bar, last bar, clear" />
            <KeyRow k={`${SHORTCUTS.slower} ${SHORTCUTS.faster}`} what="Slower and faster" />
            <KeyRow k={SHORTCUTS.metronome} what="Click on or off" />
            <KeyRow k={`${SHORTCUTS.wait} ${SHORTCUTS.flow}`} what="Wait mode, Flow mode" />
            <KeyRow k={SHORTCUTS.stop} what="Stop" />
          </dl>
        </section>
      )}
    </div>
  );
}

function KeyRow({ k, what }: { k: string; what: string }) {
  return (
    <div className={styles.keyRow}>
      <dt>
        {k.split(' ').map((x) => (
          <Kbd key={x}>{x}</Kbd>
        ))}
      </dt>
      <dd>{what}</dd>
    </div>
  );
}
