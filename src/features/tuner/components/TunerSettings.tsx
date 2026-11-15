import { ChipGroup, Kbd, SegmentedControl, Select, Stepper, Switch, Text } from '@/ui';
import type { TunerOptions } from '../model/options';
import { A4_MAX, A4_MIN, A4_PRESETS, MAX_CAPO } from '../model/targets';
import styles from './TunerSettings.module.css';

/** A microphone the browser offers. */
export interface MicChoice {
  id: string;
  label: string;
}

/** Props for `<TunerSettings>`. */
export interface TunerSettingsProps {
  a4: number;
  onA4: (hz: number) => void;
  capo: number;
  onCapo: (fret: number) => void;
  /** The targets in words while a capo is on: `F♯ B E A C♯ F♯`. */
  capoLabel: string;
  options: TunerOptions;
  onOptions: (patch: Partial<TunerOptions>) => void;
  /** Microphones to choose from; the picker shows when there is more than one. */
  mics: readonly MicChoice[];
  micId: string | null;
  onMic: (id: string | null) => void;
  /** Show the keyboard shortcuts (hidden on touch devices). */
  showShortcuts: boolean;
}

const DEFAULT_MIC = 'default-microphone';

/**
 * The tuner's settings, simplest first: reference pitch and capo, how reference notes sound, then
 * the precision options an advanced player looks for. Used inline on wide screens and inside a
 * sheet on phones.
 */
export function TunerSettings({ a4, onA4, capo, onCapo, capoLabel, options, onOptions, mics, micId, onMic, showShortcuts }: TunerSettingsProps) {
  const preset = A4_PRESETS.includes(a4) ? String(a4) : null;
  return (
    <div className={styles.settings}>
      <section className={styles.block} aria-label="Reference pitch">
        <Stepper
          label="Reference pitch (the note A)"
          unit="Hz"
          min={A4_MIN}
          max={A4_MAX}
          value={Math.round(a4)}
          onChange={onA4}
          largeStep={5}
          format={(v) => `${v} hertz`}
          hint={a4 === 440 ? 'Nearly all music uses 440. Change it only to match a piano or a recording.' : `Every target is ${a4 > 440 ? 'higher' : 'lower'} than usual. Standard is 440.`}
        />
        <ChipGroup aria-label="Common reference pitches" scroll="never" options={A4_PRESETS.map((hz) => ({ value: String(hz), label: `${hz} Hz` }))} value={preset} onChange={(v) => onA4(Number(v))} />
      </section>

      <section className={styles.block} aria-label="Capo">
        <Stepper
          label="Capo on fret"
          min={0}
          max={MAX_CAPO}
          value={capo}
          onChange={onCapo}
          format={(v) => (v === 0 ? 'no capo' : `capo on fret ${v}`)}
          editable={false}
          hint={capo === 0 ? '0 means no capo. Using one? Clip it on first, then set its fret here.' : `With the capo on, the strings should sound ${capoLabel}.`}
        />
      </section>

      <section className={styles.block} aria-label="Reference notes">
        <Text variant="label">Reference notes</Text>
        <SegmentedControl
          aria-label="Sound of the reference note"
          fullWidth
          options={[
            { value: 'tone', label: 'Steady tone' },
            { value: 'pluck', label: 'Plucked string' },
          ]}
          value={options.earVoice}
          onChange={(earVoice) => onOptions({ earVoice })}
        />
        <Switch label="Keep playing" description="The note repeats until you stop it." checked={options.earLoop} onChange={(earLoop) => onOptions({ earLoop })} />
        <Switch label="One octave higher" description="Small speakers cannot carry the low strings." checked={options.earOctaveUp} onChange={(earOctaveUp) => onOptions({ earOctaveUp })} />
      </section>

      <details className={styles.more}>
        <summary className={styles.moreSummary}>Precision and input</summary>
        <div className={styles.moreBody}>
          <section className={styles.block} aria-label="Precision">
            <Text variant="label">In tune means</Text>
            <SegmentedControl
              aria-label="Tolerance"
              fullWidth
              options={[
                { value: 'standard', label: 'Within 3 cents' },
                { value: 'fine', label: 'Within 1 cent' },
              ]}
              value={options.tolerance}
              onChange={(tolerance) => onOptions({ tolerance })}
            />
            <Text variant="caption" tone="muted">
              {options.tolerance === 'fine'
                ? 'For recording and setting intonation. Rest your hand on the other strings, or the last cent will not settle.'
                : 'Three cents is closer than most ears can tell. Right for everyday playing.'}
            </Text>
          </section>
          <section className={styles.block} aria-label="Meter">
            <Text variant="label">Meter</Text>
            <SegmentedControl
              aria-label="Meter style"
              fullWidth
              options={[
                { value: 'needle', label: 'Needle' },
                { value: 'strobe', label: 'Strobe' },
              ]}
              value={options.display}
              onChange={(display) => onOptions({ display })}
            />
            <Switch label="Show the frequency" description="The measured pitch in hertz, beside its target." checked={options.showHz} onChange={(showHz) => onOptions({ showHz })} />
          </section>
          {mics.length > 1 && (
            <section className={styles.block} aria-label="Microphone">
              <Select
                label="Microphone"
                prefix="Mic"
                value={micId && mics.some((m) => m.id === micId) ? micId : DEFAULT_MIC}
                onChange={(id) => onMic(id === DEFAULT_MIC ? null : id)}
                options={[{ value: DEFAULT_MIC, label: 'System default' }, ...mics.map((m, i) => ({ value: m.id, label: m.label || `Microphone ${i + 1}` }))]}
                hint="A microphone close to the guitar reads best."
              />
            </section>
          )}
        </div>
      </details>

      {showShortcuts && (
        <details className={styles.more}>
          <summary className={styles.moreSummary}>Keyboard shortcuts</summary>
          <dl className={styles.keys}>
            <dt>
              <Kbd>Space</Kbd>
            </dt>
            <dd>Start or stop listening</dd>
            <dt>
              <Kbd>1</Kbd>–<Kbd>8</Kbd>
            </dt>
            <dd>Lock onto that string (1 is the thinnest)</dd>
            <dt>
              <Kbd>←</Kbd> <Kbd>→</Kbd>
            </dt>
            <dd>Move to the next string</dd>
            <dt>
              <Kbd>A</Kbd>
            </dt>
            <dd>Automatic</dd>
            <dt>
              <Kbd>C</Kbd>
            </dt>
            <dd>Chromatic: any note</dd>
            <dt>
              <Kbd>G</Kbd>
            </dt>
            <dd>Guided: all strings in turn</dd>
            <dt>
              <Kbd>R</Kbd>
            </dt>
            <dd>Play or stop the reference note</dd>
            <dt>
              <Kbd>Esc</Kbd>
            </dt>
            <dd>Close a panel, or release a locked string</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
