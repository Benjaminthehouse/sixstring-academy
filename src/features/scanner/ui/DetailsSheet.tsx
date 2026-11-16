/**
 * The song's details while proofreading: title, tempo, key, tuning and capo, and for music read
 * from notation alone, where on the neck to play it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, RadioGroup, Select, Sheet, Stack, Stepper, Text, TextField } from '@/ui';
import { TUNINGS } from '@/core/guitar';
import type { Draft } from '../model/draft';
import { POSITIONS } from '../model/pages';

const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'];

/** What the sheet changes. */
export interface DetailsChange {
  title?: string;
  bpm?: number;
  key?: string | null;
  capo?: number;
  tuning?: { midi: number[]; keep: 'shapes' | 'pitch' };
  position?: number;
}

/** The details sheet. */
export function DetailsSheet({ open, draft, position, onClose, onApply }: { open: boolean; draft: Draft; position: number; onClose: () => void; onApply: (c: DetailsChange) => void }) {
  const song = draft.song;
  const [title, setTitle] = useState(song.meta.title);
  const [bpm, setBpm] = useState(song.tempo[0]?.bpm ?? 90);
  const [key, setKey] = useState(song.key ?? '');
  const [capo, setCapo] = useState(song.capo);
  const tunings = useMemo(() => TUNINGS.filter((t) => t.stringCount === song.tuning.length && (song.tuning.length !== 4 || t.instrument === 'bass')), [song.tuning.length]);
  const current = tunings.find((t) => t.midi.join() === song.tuning.join());
  const [tuning, setTuning] = useState(current?.id ?? 'custom');
  const [keep, setKeep] = useState<'shapes' | 'pitch'>(draft.notationOnly ? 'pitch' : 'shapes');
  const [pos, setPos] = useState(position);

  useEffect(() => {
    if (!open) return;
    setTitle(song.meta.title);
    setBpm(song.tempo[0]?.bpm ?? 90);
    setKey(song.key ?? '');
    setCapo(song.capo);
    setTuning(current?.id ?? 'custom');
    setPos(position);
    // Reset when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = () => {
    const change: DetailsChange = {};
    if (title.trim() && title.trim() !== song.meta.title) change.title = title.trim();
    if (bpm !== (song.tempo[0]?.bpm ?? 90)) change.bpm = bpm;
    if ((key || null) !== (song.key ?? null)) change.key = key || null;
    if (capo !== song.capo) change.capo = capo;
    const t = tunings.find((x) => x.id === tuning);
    if (t && t.midi.join() !== song.tuning.join()) change.tuning = { midi: t.midi.slice(), keep };
    if (draft.notationOnly && pos !== position) change.position = pos;
    onApply(change);
  };

  const tuningChanged = tunings.find((x) => x.id === tuning)?.midi.join() !== song.tuning.join() && tuning !== 'custom';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Song details"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} data-scan-details-apply="">
            Use these
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        <TextField label="Title" value={title} onChange={setTitle} data-autofocus />
        <Stepper label="Tempo" unit="BPM" min={20} max={300} value={bpm} onChange={setBpm} hint="Quarter notes per minute. You can slow it down while practising." />
        <Select label="Key" value={key} onChange={setKey} options={[{ value: '', label: 'Not set' }, ...KEYS.map((k) => ({ value: k, label: k.endsWith('m') ? `${k.slice(0, -1)} minor` : `${k} major` }))]} />
        <Select
          label="Tuning"
          value={tuning}
          onChange={setTuning}
          options={[...(current ? [] : [{ value: 'custom', label: `As read (${song.tuning.length} strings)` }]), ...tunings.map((t) => ({ value: t.id, label: `${t.name} (${t.label})` }))]}
          hint="The tuning the sheet is written for. Most tab is in standard tuning."
        />
        {tuningChanged && (
          <RadioGroup
            label="When the tuning changes"
            value={keep}
            onChange={(v) => setKeep(v as 'shapes' | 'pitch')}
            options={[
              { value: 'shapes', label: 'Keep the frets as printed', description: 'Right for tab written for this tuning: the notes you play stay, the sound changes.' },
              { value: 'pitch', label: 'Keep the notes, change the frets', description: 'Right for notation: the music sounds the same, fingered for the new tuning.' },
            ]}
          />
        )}
        <Stepper label="Capo" unit="fret" min={0} max={12} value={capo} onChange={setCapo} hint={capo ? 'Frets count from the capo, as the sheet prints them.' : 'No capo.'} />
        {draft.notationOnly && (
          <RadioGroup
            label="Where to play it on the neck"
            value={String(pos)}
            onChange={(v) => setPos(Number(v))}
            variant="cards"
            options={POSITIONS.map((p) => ({ value: String(p.prefer), label: p.label, description: p.hint }))}
          />
        )}
        {draft.notationOnly && (
          <Text size="sm" tone="muted">
            This sheet has no tab, so the app chose strings and frets for each note. Pick a position and it fingers the music again.
          </Text>
        )}
      </Stack>
    </Sheet>
  );
}
