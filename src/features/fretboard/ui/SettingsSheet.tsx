import { useMemo } from 'react';
import { tuningsFor } from '@/core/guitar';
import { setPrefs, usePrefs } from '@/core/progress';
import { Button, ChipGroup, Field, Row, SegmentedControl, Select, Sheet, Stack, Stepper, Switch, Text } from '@/ui';
import { defaultSettings, fretPresets, prefFromSpelling, spellingFromPref, type TrainerSettings } from '../core/settings';
import type { Spelling } from '../core/types';
import { stringOpenPc } from '../core/neck';
import { spell } from '../core/notes';
import type { Trainer } from './useTrainer';
import styles from './Trainer.module.css';

/** Props of {@link SettingsSheet}. */
export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  trainer: Trainer;
}

/**
 * Practice settings: which part of the neck the drills use, which notes, how sharps and flats are
 * spelled, left-handed view and tuning. Spelling, handedness and tuning are app-wide preferences
 * (the same switches as in Settings); the rest belongs to this trainer.
 */
export function SettingsSheet({ open, onClose, trainer }: SettingsSheetProps) {
  const prefs = usePrefs();
  const { settings, setSettings, maxFret, tuning, fmt, ctx } = trainer;
  const set = (patch: Partial<TrainerSettings>) => setSettings({ ...settings, ...patch });
  const presets = fretPresets(maxFret);
  const preset = presets.find((p) => p.frets[0] === settings.frets[0] && p.frets[1] === settings.frets[1])?.id ?? null;
  const tunings = useMemo(() => [...tuningsFor('guitar', 6), ...tuningsFor('guitar', 7)], []);
  const strings = Array.from({ length: tuning.stringCount }, (_, i) => i + 1);
  const spelling = spellingFromPref(prefs.accidentals);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Practice settings"
      description="These shape the free drills. The method's steps choose their own part of the neck."
      desktop="drawer"
      footer={
        <>
          <Button variant="ghost" onClick={() => setSettings(defaultSettings(tuning.stringCount))}>
            Reset
          </Button>
          <Button variant="primary" onClick={onClose} data-autofocus>
            Done
          </Button>
        </>
      }
    >
      <Stack gap={6} className={styles.settings}>
        <Field label="Frets" labelAs="span" hint={`Your neck has ${maxFret} frets (set in Settings).`}>
          <Stack gap={3}>
            <ChipGroup aria-label="Fret range" options={presets.map((p) => ({ value: p.id, label: p.label }))} value={preset} onChange={(id) => set({ frets: presets.find((p) => p.id === id)!.frets })} scroll="never" />
            <Row gap={4} wrap>
              <Stepper label="From fret" value={settings.frets[0]} min={0} max={settings.frets[1]} onChange={(v) => set({ frets: [v, settings.frets[1]] })} />
              <Stepper label="To fret" value={settings.frets[1]} min={settings.frets[0]} max={maxFret} onChange={(v) => set({ frets: [settings.frets[0], v] })} />
            </Row>
          </Stack>
        </Field>

        <Field label="Strings" labelAs="span" hint="Tap to leave a string out. At least one stays in.">
          <ChipGroup
            multiple
            aria-label="Strings"
            scroll="never"
            options={strings.map((s) => ({ value: String(s), label: `${s} · ${fmt(spell(stringOpenPc(ctx, s), 'sharps'))}` }))}
            value={settings.strings.map(String)}
            onChange={(v) => v.length > 0 && set({ strings: v.map(Number) })}
          />
        </Field>

        <Field label="Notes" labelAs="span">
          <SegmentedControl
            aria-label="Notes"
            fullWidth
            options={[
              { value: 'naturals', label: 'Natural notes' },
              { value: 'all', label: 'All 12 notes' },
            ]}
            value={settings.notes}
            onChange={(v) => set({ notes: v as TrainerSettings['notes'] })}
          />
        </Field>

        <Field label="Sharps and flats" labelAs="span" hint="On a bare neck there is no key to decide, so you choose. Also used across the app.">
          <SegmentedControl
            aria-label="Sharps and flats"
            fullWidth
            options={[
              { value: 'sharps', label: `Sharps (${fmt('C#')})` },
              { value: 'flats', label: `Flats (${fmt('Db')})` },
              { value: 'both', label: 'Both' },
            ]}
            value={spelling}
            onChange={(v) => setPrefs({ accidentals: prefFromSpelling(v as Spelling) })}
          />
        </Field>

        <Field label="Find the note" labelAs="span">
          <SegmentedControl
            aria-label="Find the note"
            fullWidth
            options={[
              { value: 'string', label: 'On a named string' },
              { value: 'anywhere', label: 'Anywhere' },
            ]}
            value={settings.findWhere}
            onChange={(v) => set({ findWhere: v as TrainerSettings['findWhere'] })}
          />
        </Field>

        <Field label="Play it: which octave counts" labelAs="span" hint="The microphone hears pitch, not strings. Exact means the very pitch of that place on the neck.">
          <SegmentedControl
            aria-label="Which octave counts"
            fullWidth
            options={[
              { value: 'exact', label: 'Exact pitch' },
              { value: 'any', label: 'Any octave' },
            ]}
            value={settings.playOctaves}
            onChange={(v) => set({ playOctaves: v as TrainerSettings['playOctaves'] })}
          />
        </Field>

        <Switch label="Left-handed neck" description="Mirrors every fretboard: the nut on the right." checked={prefs.handedness === 'left'} onChange={(on) => setPrefs({ handedness: on ? 'left' : 'right' })} />

        <Select
          label="Tuning"
          value={tunings.some((t) => t.id === prefs.tuningId) ? prefs.tuningId : tuning.id}
          onChange={(id) => setPrefs({ tuningId: id })}
          options={tunings.map((t) => ({ value: t.id, label: `${t.name} (${t.label})` }))}
          hint="Every note and shape is worked out for the tuning you choose."
        />
        {trainer.tuningNote && (
          <Text size="sm" tone="muted">
            {trainer.tuningNote}
          </Text>
        )}
      </Stack>
    </Sheet>
  );
}
