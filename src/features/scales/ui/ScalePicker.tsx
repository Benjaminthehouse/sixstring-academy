/**
 * "Choose a scale": the root (twelve notes, spelled for each scale) and the scale, grouped for
 * humans with the Essentials first, and a search that understands names, aliases and sounds
 * ("dorian", "spanish", "blues"). A bottom sheet on phones, a drawer on wide screens.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { chroma, formatScaleNotes, simplestTonic, type ScaleType } from '@/core/theory';
import { Badge, ChipGroup, List, ListItem, SearchField, Sheet, Stack, Text, useIsTouch } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { findScales, rootChoices, scaleGroups, scaleTitle, tierLabel, type ScaleGroupId } from '../model/catalog';
import styles from './Scales.module.css';

/** Props of `<ScalePicker>`. */
export interface ScalePickerProps {
  open: boolean;
  onClose: () => void;
  tonic: string;
  scaleId: string;
  /** A scale was chosen (tonic already spelled for it). */
  onPick: (tonic: string, scaleId: string) => void;
}

function tonicFor(pc: number, scale: ScaleType): string {
  try {
    return simplestTonic(pc, scale);
  } catch {
    return 'C';
  }
}

/** The scale picker sheet. */
export function ScalePicker({ open, onClose, tonic, scaleId, onPick }: ScalePickerProps) {
  const { naming } = useMusicSettings();
  const touch = useIsTouch();
  const [query, setQuery] = useState('');
  const [pc, setPc] = useState(() => chroma(tonic));
  const [jump, setJump] = useState<ScaleGroupId | null>(null);
  const headings = useRef(new Map<string, HTMLElement>());

  // Each time it opens, start from what is on screen.
  useEffect(() => {
    if (!open) return;
    setPc(chroma(tonic));
    setQuery('');
    setJump(null);
  }, [open, tonic]);

  const roots = useMemo(() => rootChoices(scaleId, naming), [scaleId, naming]);
  const groups = scaleGroups();
  const results = useMemo(() => (query.trim() ? findScales(query) : null), [query]);

  const row = (s: ScaleType, groupId: string) => {
    const t = tonicFor(pc, s);
    const current = s.id === scaleId && chroma(tonic) === pc;
    return (
      <ListItem
        key={`${groupId}:${s.id}`}
        title={`${scaleTitle(t, s, naming)}${groupId === 'modes' && s.id === 'major' ? ' (Ionian)' : groupId === 'modes' && s.id === 'minor' ? ' (Aeolian)' : ''}`}
        subtitle={safeNotes(t, s, naming)}
        trailing={s.tier >= 3 ? <Badge tone="neutral" size="sm">{tierLabel(s.tier)}</Badge> : undefined}
        selected={current}
        onClick={() => onPick(t, s.id)}
      />
    );
  };

  const jumpTo = (id: ScaleGroupId) => {
    setJump(id);
    headings.current.get(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Choose a scale" desktop="drawer" size="md">
      <Stack gap={4}>
        <SearchField
          label="Search scales"
          showLabel={false}
          placeholder="Dorian, Spanish, blues…"
          value={query}
          onChange={setQuery}
          {...(touch ? {} : { 'data-autofocus': true })}
        />
        <div className={styles.pickerRoots}>
          <Text variant="label" as="p">
            Root note
          </Text>
          <ChipGroup
            aria-label="Root note"
            options={roots.map((r) => ({ value: String(r.pc), label: r.label }))}
            value={String(pc)}
            onChange={(v) => setPc(Number(v))}
            scroll="always"
          />
        </div>
        {results ? (
          <section aria-live="polite">
            <Text variant="caption" tone="muted" as="p" className={styles.pickerCount}>
              {results.length === 0 ? `No scale matches “${query.trim()}”. Try a name like Dorian, or a sound like Spanish.` : `${results.length} ${results.length === 1 ? 'scale' : 'scales'}`}
            </Text>
            {results.length > 0 && <List variant="card">{results.map((s) => row(s, 'search'))}</List>}
          </section>
        ) : (
          <>
            <ChipGroup
              aria-label="Jump to a group"
              options={groups.map((g) => ({ value: g.id, label: g.title }))}
              value={jump}
              onChange={jumpTo}
              scroll="always"
            />
            {groups.map((g) => (
              <section key={g.id} className={styles.pickerGroup} aria-labelledby={`scale-group-${g.id}`}>
                <div
                  className={styles.pickerHeading}
                  ref={(el) => {
                    if (el) headings.current.set(g.id, el);
                    else headings.current.delete(g.id);
                  }}
                >
                  <h3 id={`scale-group-${g.id}`} className={styles.pickerTitle}>
                    {g.title}
                  </h3>
                  <Text variant="caption" tone="muted" as="p">
                    {g.description}
                  </Text>
                </div>
                <List variant="card">{g.scales.map((s) => row(s, g.id))}</List>
              </section>
            ))}
          </>
        )}
      </Stack>
    </Sheet>
  );
}

function safeNotes(tonic: string, scale: ScaleType, naming: 'letters' | 'solfege' | 'german'): string {
  try {
    return formatScaleNotes(tonic, scale, { system: naming }).join(' ');
  } catch {
    return '';
  }
}
