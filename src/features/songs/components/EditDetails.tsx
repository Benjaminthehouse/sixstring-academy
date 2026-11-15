/**
 * Edit the details of one of the learner's songs: title, who wrote it, level (or the estimate),
 * style, search words and a personal note. The notes themselves are edited in the Player.
 */
import { useEffect, useState } from 'react';
import { Button, Modal, Select, Stack, Stepper, Switch, Text, TextArea, TextField } from '@/ui';
import { STYLE_NAMES, SONG_STYLES, type SongDetailsPatch, type SongListing, type SongStyle } from '@/core/library';
import { bandLabel } from '../format';

/** Props of `EditDetails`. */
export interface EditDetailsProps {
  listing: SongListing | null;
  onClose: () => void;
  onSave: (id: string, patch: SongDetailsPatch) => Promise<void>;
}

/** The edit-details dialog. */
export function EditDetails({ listing, onClose, onSave }: EditDetailsProps) {
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [ownLevel, setOwnLevel] = useState(false);
  const [level, setLevel] = useState(1);
  const [style, setStyle] = useState<string>('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title);
    setComposer(listing.composer ?? '');
    setOwnLevel(listing.levelSource === 'set');
    setLevel(listing.level);
    setStyle(listing.style ?? '');
    setTags(listing.tags.join(', '));
    setNotes(listing.notes ?? '');
    setError(null);
    setBusy(false);
  }, [listing]);

  const estimate = listing?.summary?.estimatedLevel ?? listing?.level ?? 1;
  const save = async () => {
    if (!listing) return;
    if (!title.trim()) {
      setError('A song needs a title.');
      return;
    }
    setBusy(true);
    try {
      await onSave(listing.id, {
        title,
        composer,
        level: ownLevel ? level : null,
        style: (style || null) as SongStyle | null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!listing}
      onClose={onClose}
      title="Edit details"
      description={listing ? `Of “${listing.title}”. The notes stay as they are.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save details
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack gap={4}>
          <TextField label="Title" value={title} onChange={(v) => { setTitle(v); setError(null); }} error={error ?? undefined} data-autofocus />
          <TextField label="Composer or artist" optional value={composer} onChange={setComposer} />
          <Stack gap={2}>
            <Switch checked={ownLevel} onChange={setOwnLevel} label="Set the level myself" description={`Worked out from the notes: Level ${estimate} (${bandLabel(estimate)}).`} />
            {ownLevel && <Stepper label="Level" min={1} max={10} value={level} onChange={setLevel} format={(v) => `${v} · ${bandLabel(v)}`} />}
          </Stack>
          <Select
            label="Style"
            value={style}
            onChange={setStyle}
            options={[{ value: '', label: 'No style' }, ...SONG_STYLES.map((s) => ({ value: s, label: STYLE_NAMES[s] }))]}
          />
          <TextField label="Search words" optional value={tags} onChange={setTags} hint="Separate them with commas: campfire, waltz, wedding" />
          <TextArea label="Your notes" optional value={notes} onChange={setNotes} rows={3} maxLength={500} hint="For yourself: where it is from, what to practise." />
          <Text size="sm" tone="muted">
            To change the notes or chords, open the song in the player.
          </Text>
          <button type="submit" hidden />
        </Stack>
      </form>
    </Modal>
  );
}
