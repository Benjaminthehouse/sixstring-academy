import { useEffect, useMemo, useState } from 'react';
import { Button, ChipGroup, Select, Sheet, Stack, Text } from '@/ui';
import { Fretboard, noteText, useMusicSettings } from '@/ui/music';
import { formatNote, getScale } from '@/core/theory';
import { learnerTuning } from '@/core/settings';
import { boxOf, commonScales, normalizeFocus, regionOf, scaleLabel, scaleTitle, scalesByFamily, shapesFor, tonicsFor, type Focus } from '../core/focus';
import { noteMarker } from './kit';
import styles from './Arcade.module.css';

/** Props of {@link FocusSheet}. */
export interface FocusSheetProps {
  open: boolean;
  focus: Focus;
  onClose: () => void;
  onPick: (focus: Focus) => void;
}

/** Choose the scale, key and shape to practise: the common scales one tap away, every scale in the list. */
export function FocusSheet({ open, focus, onClose, onPick }: FocusSheetProps) {
  const [draft, setDraft] = useState<Focus>(focus);
  const { naming } = useMusicSettings();
  const tuning = useMemo(() => learnerTuning(), []);
  useEffect(() => {
    if (open) setDraft(focus);
  }, [open, focus]);

  const common = useMemo(() => commonScales(), []);
  const families = useMemo(() => scalesByFamily(), []);
  const tonics = useMemo(() => tonicsFor(draft.scale), [draft.scale]);
  const shapes = useMemo(() => shapesFor(draft.tonic, draft.scale, tuning), [draft.tonic, draft.scale, tuning]);
  const pattern = shapes.find((p) => p.id === draft.shape) ?? shapes[0];
  const markers = useMemo(() => (pattern ? pattern.notes.map((n) => noteMarker(n, { label: 'degree', color: 'degree' })) : []), [pattern]);

  // A new scale starts on its first shape; a new key keeps the shape (box 2 stays box 2).
  const set = (patch: Partial<Focus>) => setDraft((d) => normalizeFocus(patch.scale ? { tonic: d.tonic, scale: patch.scale } : { ...d, ...patch }, tuning));
  const isCommon = common.some((s) => s.id === draft.scale);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What to practise"
      description="Every game uses this scale and shape."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" iconLeft="Check" onClick={() => onPick(draft)} data-arcade-pick>
            Practise {scaleTitle(draft, naming)}
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        <Stack gap={2}>
          <Text variant="label">Scale</Text>
          <ChipGroup
            aria-label="Common scales"
            options={common.map((s) => ({ value: s.id, label: scaleLabel(s) }))}
            value={isCommon ? draft.scale : null}
            onChange={(v) => v && set({ scale: v })}
          />
          <Select
            label="Every scale"
            value={draft.scale}
            onChange={(v) => set({ scale: v })}
            options={families.map((f) => ({ group: f.name, options: f.scales.map((s) => ({ value: s.id, label: scaleLabel(s) })) }))}
          />
          {getScale(draft.scale)?.description && (
            <Text size="sm" tone="muted">
              {getScale(draft.scale)!.description}
            </Text>
          )}
        </Stack>
        <Stack gap={2}>
          <Text variant="label">Key</Text>
          <ChipGroup aria-label="Key" options={tonics.map((t) => ({ value: t, label: formatNote(t, { system: naming }) }))} value={draft.tonic} onChange={(v) => v && set({ tonic: v })} />
        </Stack>
        <Stack gap={2}>
          <Text variant="label">Shape</Text>
          <ChipGroup aria-label="Shape" options={shapes.map((p) => ({ value: p.id, label: p.name }))} value={draft.shape} onChange={(v) => v && set({ shape: v })} />
        </Stack>
        {pattern && (
          <div className={styles.sheetPreview}>
            <Text size="sm" tone="muted">
              {scaleTitle(draft, naming)} · {pattern.name}, {pattern.positionName.toLowerCase()} · {pattern.notes.length} notes · root {noteText(draft.tonic, naming)}
            </Text>
            <Fretboard frets={regionOf(pattern)} tuning={tuning} markers={markers} box={boxOf(pattern)} size="sm" />
          </div>
        )}
      </Stack>
    </Sheet>
  );
}
