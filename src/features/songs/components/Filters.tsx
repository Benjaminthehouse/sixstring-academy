/**
 * Song filters: level, style, what it teaches and what it includes. One set of chip groups, shown
 * in a bottom sheet on phones and as small popovers beside the search on wider screens; the
 * active choices show as removable tags so nothing is hidden.
 */
import type { ReactNode } from 'react';
import { Button, ChipGroup, Popover, Stack, Tag, Text } from '@/ui';
import { LEVEL_BAND_NAMES, LEVEL_BAND_RANGE, SKILL_NAMES, STYLE_NAMES, SONG_SKILLS, type LevelBand, type SongSkill, type SongStyle } from '@/core/library';
import styles from './Filters.module.css';

/** Things a song can include. */
export type Feature = 'chords' | 'lyrics' | 'tab';
const FEATURE_NAMES: Record<Feature, string> = { tab: 'Tab', chords: 'Chords', lyrics: 'Lyrics' };
const LEVELS: LevelBand[] = ['beginner', 'intermediate', 'expert'];

/** The filter choices of the screen. */
export interface FilterValue {
  levels: LevelBand[];
  styles: SongStyle[];
  skills: SongSkill[];
  features: Feature[];
}

/** No filters. */
export const NO_FILTERS: FilterValue = { levels: [], styles: [], skills: [], features: [] };

interface GroupProps {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  /** Styles that appear in the library (others are not offered). */
  styles: SongStyle[];
}

function levelOptions() {
  return LEVELS.map((b) => ({ value: b, label: `${LEVEL_BAND_NAMES[b]} (${LEVEL_BAND_RANGE[b][0]}–${LEVEL_BAND_RANGE[b][1]})` }));
}

function LevelGroup({ value, onChange }: Omit<GroupProps, 'styles'>) {
  return <ChipGroup multiple scroll="never" aria-label="Level" options={levelOptions()} value={value.levels} onChange={(levels) => onChange({ ...value, levels })} />;
}

function StyleGroup({ value, onChange, styles: available }: GroupProps) {
  return <ChipGroup multiple scroll="never" aria-label="Style" options={available.map((s) => ({ value: s, label: STYLE_NAMES[s] }))} value={value.styles} onChange={(next) => onChange({ ...value, styles: next })} />;
}

function SkillGroup({ value, onChange }: Omit<GroupProps, 'styles'>) {
  return <ChipGroup multiple scroll="never" aria-label="What it teaches" options={SONG_SKILLS.map((s) => ({ value: s, label: SKILL_NAMES[s] }))} value={value.skills} onChange={(skills) => onChange({ ...value, skills })} />;
}

function FeatureGroup({ value, onChange }: Omit<GroupProps, 'styles'>) {
  return <ChipGroup multiple scroll="never" aria-label="Includes" options={(['tab', 'chords', 'lyrics'] as Feature[]).map((f) => ({ value: f, label: FEATURE_NAMES[f] }))} value={value.features} onChange={(features) => onChange({ ...value, features })} />;
}

/** Every filter group in one column (the phone sheet). */
export function FilterPanel(props: GroupProps) {
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text variant="label">Level</Text>
        <LevelGroup {...props} />
      </Stack>
      <Stack gap={2}>
        <Text variant="label">What it teaches</Text>
        <SkillGroup {...props} />
      </Stack>
      {props.styles.length > 1 && (
        <Stack gap={2}>
          <Text variant="label">Style</Text>
          <StyleGroup {...props} />
        </Stack>
      )}
      <Stack gap={2}>
        <Text variant="label">Includes</Text>
        <FeatureGroup {...props} />
      </Stack>
    </Stack>
  );
}

function PopoverFilter({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <Popover
      aria-label={label}
      trigger={
        <Button size="sm" iconRight="ChevronDown" pressed={count > 0} className={styles.trigger}>
          {count ? `${label} · ${count}` : label}
        </Button>
      }
    >
      <div className={styles.pop}>{children}</div>
    </Popover>
  );
}

/** The filters as small popovers in a row (wide screens). */
export function FilterBar(props: GroupProps) {
  const { value } = props;
  return (
    <div className={styles.bar} role="group" aria-label="Filters">
      <PopoverFilter label="Level" count={value.levels.length}>
        <LevelGroup {...props} />
      </PopoverFilter>
      <PopoverFilter label="What it teaches" count={value.skills.length}>
        <SkillGroup {...props} />
      </PopoverFilter>
      {props.styles.length > 1 && (
        <PopoverFilter label="Style" count={value.styles.length}>
          <StyleGroup {...props} />
        </PopoverFilter>
      )}
      <PopoverFilter label="Includes" count={value.features.length}>
        <FeatureGroup {...props} />
      </PopoverFilter>
    </div>
  );
}

/** The active choices as removable tags, with "Clear all". Nothing when no filter is on. */
export function ActiveFilters({ value, onChange }: { value: FilterValue; onChange: (next: FilterValue) => void }) {
  const tags: Array<{ key: string; label: string; remove: () => void }> = [
    ...value.levels.map((b) => ({ key: `l-${b}`, label: LEVEL_BAND_NAMES[b], remove: () => onChange({ ...value, levels: value.levels.filter((x) => x !== b) }) })),
    ...value.skills.map((s) => ({ key: `k-${s}`, label: SKILL_NAMES[s], remove: () => onChange({ ...value, skills: value.skills.filter((x) => x !== s) }) })),
    ...value.styles.map((s) => ({ key: `s-${s}`, label: STYLE_NAMES[s], remove: () => onChange({ ...value, styles: value.styles.filter((x) => x !== s) }) })),
    ...value.features.map((f) => ({ key: `f-${f}`, label: `With ${FEATURE_NAMES[f].toLowerCase()}`, remove: () => onChange({ ...value, features: value.features.filter((x) => x !== f) }) })),
  ];
  if (!tags.length) return null;
  return (
    <div className={styles.active} aria-label="Active filters" role="group">
      {tags.map((t) => (
        <Tag key={t.key} onRemove={t.remove} removeLabel={`Remove the filter ${t.label}`}>
          {t.label}
        </Tag>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange(NO_FILTERS)}>
        Clear all
      </Button>
    </div>
  );
}

/** How many filter choices are on. */
export function filterCount(value: FilterValue): number {
  return value.levels.length + value.styles.length + value.skills.length + value.features.length;
}
