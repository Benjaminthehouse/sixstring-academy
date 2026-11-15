/**
 * Small pieces the practice views share: the area badge, the "why" line under a block, the feel
 * picker, the duration tiles and the outcome mark of a finished block.
 */
import { useId, type KeyboardEvent } from 'react';
import { Icon, cx } from '@/ui';
import { AREA_INFO, type Area } from '../model/areas';
import { FEELS, type Feel } from '../model/journal';
import type { ReasonKind } from '../model/planner';
import type { BlockOutcome } from '../model/session';
import styles from './parts.module.css';

/** The area's icon in a soft tile, with its name beside it unless `iconOnly`. */
export function AreaTag({ area, iconOnly, className }: { area: Area; iconOnly?: boolean; className?: string }) {
  const info = AREA_INFO[area];
  return (
    <span className={cx(styles.area, className)} data-area={area}>
      <span className={styles.areaIcon} aria-hidden="true">
        <Icon name={info.icon} size={16} strokeWidth={2} />
      </span>
      {iconOnly ? <span className="sr-only">{info.label}</span> : <span className={styles.areaLabel}>{info.label}</span>}
    </span>
  );
}

const REASON_ICONS: Record<ReasonKind, string> = {
  goal: 'Target',
  rusty: 'TrendingDown',
  weak: 'Activity',
  due: 'Brain',
  neglect: 'CalendarClock',
  continue: 'History',
  level: 'Lightbulb',
  free: 'Sparkles',
};

/** "Why this block": an icon for the kind of reason and the sentence. */
export function ReasonLine({ kind, children }: { kind?: ReasonKind; children: string }) {
  const k = kind ?? 'level';
  return (
    <p className={styles.reason} data-kind={k}>
      <span className={styles.reasonIcon} aria-hidden="true">
        <Icon name={REASON_ICONS[k]} size={15} strokeWidth={2} />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** How a finished block went, as an icon with a spoken label. */
export function OutcomeMark({ outcome }: { outcome: BlockOutcome }) {
  const map: Record<BlockOutcome, { icon: string; label: string }> = {
    done: { icon: 'CircleCheck', label: 'Done' },
    partial: { icon: 'CircleDashed', label: 'Partly done' },
    skipped: { icon: 'SkipForward', label: 'Skipped' },
    pending: { icon: 'Circle', label: 'Not reached' },
  };
  const m = map[outcome];
  return (
    <span className={styles.outcome} data-outcome={outcome}>
      <Icon name={m.icon} size={18} strokeWidth={2} label={m.label} />
    </span>
  );
}

/** The small check every selected choice in the kit carries. */
function SelectedCheck() {
  return (
    <span className={styles.check} aria-hidden="true">
      <Icon name="Check" size={11} strokeWidth={3.2} />
    </span>
  );
}

/** Arrow-key movement inside a row of radio buttons. */
function radioKeys(event: KeyboardEvent<HTMLDivElement>, count: number, index: number, pick: (i: number) => void): void {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = (Math.max(0, index) + step + count) % count;
  pick(next);
  const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  buttons[next]?.focus();
}

/** "How did it feel?": five answers, each an icon and a word. */
export function FeelPicker({ value, onChange, label = 'How did it feel?' }: { value: Feel | null; onChange: (feel: Feel) => void; label?: string }) {
  const id = useId();
  const index = FEELS.findIndex((f) => f.value === value);
  return (
    <div className={styles.feelField}>
      <p id={id} className={styles.fieldLabel}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className={styles.feels} onKeyDown={(e) => radioKeys(e, FEELS.length, index, (i) => onChange(FEELS[i].value))}>
        {FEELS.map((f, i) => {
          const selected = f.value === value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (index < 0 && i === 2) ? 0 : -1}
              className={cx(styles.feel, selected && styles.selected)}
              onClick={() => onChange(f.value)}
            >
              {selected && <SelectedCheck />}
              <Icon name={f.icon} size={22} strokeWidth={selected ? 2.2 : 1.75} />
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The six "how long do you have" tiles. `value` null = none selected (a routine or an edited plan). */
export function DurationTiles({ options, value, onChange, labelId }: { options: readonly number[]; value: number | null; onChange: (minutes: number) => void; labelId: string }) {
  const index = options.findIndex((m) => m === value);
  return (
    <div role="radiogroup" aria-labelledby={labelId} className={styles.durations} onKeyDown={(e) => radioKeys(e, options.length, index, (i) => onChange(options[i]))}>
      {options.map((m, i) => {
        const selected = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${m} minutes`}
            tabIndex={selected || (index < 0 && i === 0) ? 0 : -1}
            className={cx(styles.duration, selected && styles.selected)}
            onClick={() => onChange(m)}
            data-minutes={m}
          >
            {selected && <SelectedCheck />}
            <span className={styles.durationNumber} aria-hidden="true">
              {m}
            </span>
            <span className={styles.durationUnit} aria-hidden="true">
              min
            </span>
          </button>
        );
      })}
    </div>
  );
}
