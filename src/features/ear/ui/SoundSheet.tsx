import type { ReactNode } from 'react';
import { Button, SegmentedControl, Select, Sheet, Stack, Switch, Text } from '@/ui';
import { ROOT_NAMES } from '../core/question';
import type { DrillId, EarSettings } from '../core/types';
import { formatNote } from '@/core/theory';
import styles from './Ear.module.css';

/** Props of {@link SoundSheet}. */
export interface SoundSheetProps {
  open: boolean;
  onClose: () => void;
  settings: EarSettings;
  onChange: (patch: Partial<EarSettings>) => void;
  /** Show only the choices that matter for this drill (all when omitted). */
  drill?: DrillId;
}

const INTERVALS: readonly DrillId[] = ['intervals-up', 'intervals-down', 'compound'];

/** A visible label over a segmented control (the control itself carries the same name). */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text variant="label" as="span" aria-hidden="true">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** Sound choices: the guitar, the root, note names, memory tunes, and how chords and keys are played. */
export function SoundSheet({ open, onClose, settings, onChange, drill }: SoundSheetProps) {
  const shows = (ids: readonly DrillId[]) => !drill || ids.includes(drill);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sound choices"
      description="They apply to every ear-training drill and are remembered on this device."
      footer={
        <Button variant="primary" fullWidth onClick={onClose} data-autofocus>
          Done
        </Button>
      }
    >
      <div className={styles.settings}>
        <Labelled label="Guitar">
          <SegmentedControl
            aria-label="Guitar"
            fullWidth
            options={[
              { value: 'steel', label: 'Steel acoustic' },
              { value: 'nylon', label: 'Nylon' },
              { value: 'clean', label: 'Electric' },
            ]}
            value={settings.tone}
            onChange={(tone) => onChange({ tone: tone as EarSettings['tone'] })}
          />
        </Labelled>
        <Labelled label="Starting note">
          <SegmentedControl
            aria-label="Starting note"
            fullWidth
            options={[
              { value: 'random', label: 'Random root' },
              { value: 'fixed', label: 'Always the same' },
            ]}
            value={settings.root}
            onChange={(root) => onChange({ root: root as EarSettings['root'] })}
          />
        </Labelled>
        {settings.root === 'fixed' && (
          <Select
            label="Root note"
            hint="Every question starts from this note (or is in this key)."
            value={String(settings.fixedRoot)}
            onChange={(v) => onChange({ fixedRoot: Number(v) })}
            options={ROOT_NAMES.map((n, i) => ({ value: String(i), label: formatNote(n) }))}
          />
        )}
        <Switch
          checked={settings.showFirstNote}
          onChange={(showFirstNote) => onChange({ showFirstNote })}
          label="Show the first note’s name"
          description="Names the starting note, root or key of each question."
        />
        {shows(INTERVALS) && (
          <Switch
            checked={settings.aids}
            onChange={(aids) => onChange({ aids })}
            label="Memory tunes for intervals"
            description="A well-known old tune that starts with each interval, under its button."
          />
        )}
        {shows(['chords']) && (
          <Labelled label="Chords">
            <SegmentedControl
              aria-label="Chords"
              fullWidth
              options={[
                { value: 'strum', label: 'Strummed' },
                { value: 'arpeggio', label: 'One string at a time' },
              ]}
              value={settings.chordStyle}
              onChange={(chordStyle) => onChange({ chordStyle: chordStyle as EarSettings['chordStyle'] })}
            />
          </Labelled>
        )}
        {shows(['progressions']) && (
          <Labelled label="Progressions">
            <SegmentedControl
              aria-label="Progressions"
              fullWidth
              options={[
                { value: 'guitar', label: 'Strummed guitar' },
                { value: 'band', label: 'Backing band' },
              ]}
              value={settings.progressionSound}
              onChange={(progressionSound) => onChange({ progressionSound: progressionSound as EarSettings['progressionSound'] })}
            />
          </Labelled>
        )}
        {shows(['degrees']) && (
          <Labelled label="Set the key with">
            <SegmentedControl
              aria-label="Set the key with"
              fullWidth
              options={[
                { value: 'cadence', label: 'Chords (I–IV–V–I)' },
                { value: 'drone', label: 'A drone' },
              ]}
              value={settings.keySetter}
              onChange={(keySetter) => onChange({ keySetter: keySetter as EarSettings['keySetter'] })}
            />
          </Labelled>
        )}
      </div>
    </Sheet>
  );
}
