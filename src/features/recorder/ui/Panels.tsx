import { useEffect, useState } from 'react';
import { Button, Icon, Modal, SegmentedControl, Sheet, Stepper, Switch, Text, TextField } from '@/ui';
import { BEAT_CHOICES, MAX_BPM, MIN_BPM, type RecorderPrefs } from '../model/prefs';
import { MAX_NAME_LENGTH, cleanName } from '../model/takes';
import styles from '../Recorder.module.css';

/** Props for `<OptionsSheet>`. */
export interface OptionsSheetProps {
  open: boolean;
  onClose: () => void;
  prefs: RecorderPrefs;
  onChange: (next: RecorderPrefs) => void;
}

/** How a take starts: the count-in, the click while recording (headphones only), the tempo and the beats. */
export function OptionsSheet({ open, onClose, prefs, onChange }: OptionsSheetProps) {
  const set = (patch: Partial<RecorderPrefs>) => onChange({ ...prefs, ...patch });
  const timed = prefs.countIn || prefs.click;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Count-in and click"
      desktop="drawer"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.options} data-recorder-options="">
        <Switch checked={prefs.countIn} onChange={(countIn) => set({ countIn })} label="Count me in" description="One bar of clicks before recording starts, so your hands are on the guitar when it begins. The clicks are not in the take." />
        <Switch
          checked={prefs.click}
          onChange={(click) => set({ click })}
          label="Click while recording"
          description="Keeps you in time. Wear headphones: through the speakers the microphone records the click too."
        />
        {prefs.click && (
          <p className={styles.headphones}>
            <Icon name="Headphones" size={18} />
            <span>Plug in headphones before you press Record.</span>
          </p>
        )}
        {timed && (
          <>
            <Stepper label="Tempo" unit="BPM" min={MIN_BPM} max={MAX_BPM} step={1} largeStep={5} value={prefs.bpm} onChange={(bpm) => set({ bpm })} size="lg" />
            <SegmentedControl aria-label="Beats in a bar" options={BEAT_CHOICES.map((b) => ({ value: String(b), label: `${b} beats` }))} value={String(prefs.beats)} onChange={(v) => set({ beats: Number(v) as RecorderPrefs['beats'] })} />
            <Text variant="caption" tone="muted">
              Beats in a bar: 4 for most songs, 3 for a waltz.
            </Text>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Props for `<RenameModal>`. */
export interface RenameModalProps {
  open: boolean;
  name: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

/** Rename a take. */
export function RenameModal({ open, name, onClose, onSave }: RenameModalProps) {
  const [value, setValue] = useState(name);
  useEffect(() => {
    if (open) setValue(name);
  }, [open, name]);
  const clean = cleanName(value);
  const save = () => {
    if (clean) onSave(clean);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename take"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!clean} data-recorder-rename-save="">
            Save name
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField label="Name" value={value} onChange={setValue} maxLength={MAX_NAME_LENGTH} data-autofocus error={value.length > 0 && !clean ? 'Give the take a name.' : undefined} />
      </form>
    </Modal>
  );
}

const TIPS: ReadonlyArray<{ icon: string; title: string; text: string }> = [
  { icon: 'Timer', title: 'Time', text: 'Does it rush in the hard bars or drag in the easy ones? Tap your foot while you listen.' },
  { icon: 'Sparkles', title: 'Clean notes', text: 'Listen for buzzes, muted strings and notes cut short where a chord changes.' },
  { icon: 'Volume2', title: 'Evenness', text: 'Are all the notes of a run equally loud? Do the loud parts sound louder than the soft ones?' },
  { icon: 'Music', title: 'The music', text: 'Would you enjoy hearing this? Pick one thing to fix, then record again.' },
];

/** What to listen for when you play a take back: the four things a teacher would. */
export function ListeningTips() {
  return (
    <ul className={styles.tips}>
      {TIPS.map((tip) => (
        <li key={tip.title} className={styles.tip}>
          <span className={styles.tipIcon} aria-hidden="true">
            <Icon name={tip.icon} size={18} />
          </span>
          <span>
            <strong className={styles.tipTitle}>{tip.title}.</strong> {tip.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
