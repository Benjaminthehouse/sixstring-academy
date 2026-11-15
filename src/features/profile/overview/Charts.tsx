import { useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { minutesByKind, useHeatmap, useProgress, useWeek, type HeatCell, type ProgressState } from '@/core/progress';
import { EmptyState, Icon, LinkButton, SegmentedControl, cx, useElementSize } from '@/ui';
import { durationText, plural } from '../format';
import { HEAT_LEVELS, calendarLayout, heatCellText, heatColumns, heatSentence, historyWeeks, kindShares, summariseHeat, weekChart, weekSentence } from './model';
import styles from './Overview.module.css';

/** From this width the day detail and the summary sit beside the grid instead of under it. */
const SIDE_BY_SIDE = 704;
const SIDE_WIDTH = 288;
const WEEKDAY_INITIALS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The practice calendar: one square per day, darker for more XP against that day's goal. Hovering
 * or tapping a square (or the arrow keys, once the calendar has focus) names the day underneath;
 * the sentence and the month table say the same thing in words.
 */
export function PracticeCalendar() {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const today = useProgress((s) => s.meta.today);
  const weekStart = useProgress((s) => s.prefs.weekStart);
  const days = useProgress((s) => s.days);
  const history = useMemo(() => historyWeeks(days, today), [days, today]);
  const layout = calendarLayout(width >= SIDE_BY_SIDE ? width - SIDE_WIDTH : width, history);
  const weeks = layout.weeks;
  const cells = useHeatmap(weeks);
  const columns = useMemo(() => heatColumns(cells), [cells]);
  const summary = useMemo(() => summariseHeat(cells), [cells]);
  const [picked, setPicked] = useState<string | null>(null);
  const current: HeatCell = cells.find((c) => c.day === picked) ?? cells[cells.length - 1];
  const firstWeekday = weekStart === 'sunday' ? 0 : 1;

  const pickFrom = (event: MouseEvent<HTMLDivElement>): void => {
    const day = (event.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day;
    if (day) setPicked(day);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowLeft' ? -7 : event.key === 'ArrowRight' ? 7 : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'Home' ? -cells.length : event.key === 'End' ? cells.length : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = cells.findIndex((c) => c.day === current.day);
    setPicked(cells[Math.max(0, Math.min(cells.length - 1, index + step))].day);
  };

  return (
    <div className={cx(styles.calendar, width >= SIDE_BY_SIDE && styles.calendarWide)} ref={ref}>
      <div
        className={styles.heat}
        role="group"
        tabIndex={0}
        aria-label={`Practice calendar, the last ${plural(weeks, 'week')}. Arrow keys move through the days.`}
        aria-describedby="heat-detail"
        style={{ '--cell': `${layout.cell}px`, '--gap': `${layout.gap}px`, '--gutter': `${layout.gutter}px` } as CSSProperties}
        onKeyDown={onKeyDown}
        onMouseOver={pickFrom}
        onClick={pickFrom}
      >
        <div className={styles.heatMonths} aria-hidden="true">
          {columns.map((column) => (
            <span key={column.start} className={styles.heatMonth}>
              {column.month}
            </span>
          ))}
        </div>
        <div className={styles.heatBody}>
          <div className={styles.heatDays} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <span key={row}>{row % 2 === 0 ? WEEKDAY_INITIALS[(firstWeekday + row) % 7] : ''}</span>
            ))}
          </div>
          <div className={styles.heatGrid} aria-hidden="true">
            {columns.map((column) =>
              column.cells.map((cell, row) =>
                cell ? (
                  <span
                    key={cell.day}
                    data-day={cell.day}
                    data-level={cell.level}
                    className={cx(styles.cell, cell.frozen && !cell.met && styles.cellFrozen, cell.day === today && styles.cellToday, cell.day === current.day && styles.cellPicked)}
                  />
                ) : (
                  <span key={`${column.start}-${row}`} className={styles.cellFuture} />
                ),
              ),
            )}
          </div>
        </div>
      </div>

      <div className={styles.calendarSide}>
        <p id="heat-detail" className={styles.heatDetail} aria-live="polite">
          {heatCellText(current, today)}
        </p>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendWord}>Less</span>
          {HEAT_LEVELS.map((entry) => (
            <span key={entry.level} className={styles.cell} data-level={entry.level} />
          ))}
          <span className={styles.legendWord}>More</span>
          {summary.frozen > 0 && (
            <span className={styles.legendExtra}>
              <span className={cx(styles.cell, styles.cellFrozen)} data-level={0} />
              Freeze
            </span>
          )}
        </div>
        <p className={styles.chartText}>{heatSentence(summary)}</p>
      </div>

      <details className={cx(styles.table, styles.calendarTable)}>
        <summary>Show the calendar as a table</summary>
        <table>
          <caption className="sr-only">Practice by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Days practised</th>
              <th scope="col">Goals met</th>
              <th scope="col">XP</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {summary.months.map((month) => (
              <tr key={month.key}>
                <th scope="row">{month.label}</th>
                <td>{month.practised}</td>
                <td>{month.met}</td>
                <td>{month.xp}</td>
                <td>{durationText(month.sec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.tableNote}>Squares get darker with the day’s XP: {HEAT_LEVELS.map((entry) => entry.text.toLowerCase()).join(', ')}.</p>
      </details>
    </div>
  );
}

/** Minutes practised on each day of this week, as columns with the number on every cap. */
export function WeekMinutes() {
  const week = useWeek();
  const chart = useMemo(() => weekChart(week), [week]);
  return (
    <div className={styles.weekChart}>
      <ol className={styles.bars} aria-label="Minutes practised on each day of this week">
        {chart.bars.map((bar) => (
          <li key={bar.day} className={cx(styles.barSlot, bar.isToday && styles.barToday, bar.isFuture && styles.barFuture)}>
            <span className={styles.barValue}>
              {bar.isFuture ? '' : bar.minutes}
              <span className="sr-only">{bar.isFuture ? 'still to come' : ` minutes${bar.met ? ', goal met' : ''}`}</span>
            </span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={styles.bar} style={{ height: `${Math.max(bar.sec > 0 ? 4 : 0, bar.fraction * 100)}%` }} />
            </span>
            <span className={styles.barLabel}>
              {bar.label}
              {bar.isToday && <span className="sr-only"> (today)</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.chartText}>{weekSentence(chart)}</p>
    </div>
  );
}

type KindRange = 'week' | 'all';

/** Time per kind of activity, longest first, as labelled bars. */
export function ActivityTime() {
  const [range, setRange] = useState<KindRange>('week');
  const days = useProgress((s) => s.days);
  const stats = useProgress((s) => s.stats);
  const today = useProgress((s) => s.meta.today);
  const weekStart = useProgress((s) => s.prefs.weekStart);
  const rows = useMemo(() => kindShares(minutesByKind({ days, stats, meta: { today }, prefs: { weekStart } } as ProgressState, range)), [days, stats, today, weekStart, range]);
  const total = rows.reduce((sum, row) => sum + row.sec, 0);
  return (
    <div className={styles.kinds}>
      <SegmentedControl
        aria-label="Period"
        size="sm"
        options={[
          { value: 'week', label: 'This week' },
          { value: 'all', label: 'All time' },
        ]}
        value={range}
        onChange={setRange}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="Clock"
          title={range === 'week' ? 'No practice time this week yet' : 'No practice time yet'}
          level={4}
          actions={
            <LinkButton to="tuner" size="sm" iconRight="ArrowRight">
              Tune up first
            </LinkButton>
          }
        >
          Time in lessons, games, songs and drills adds up here, sorted by what you did most.
        </EmptyState>
      ) : (
        <>
          <ul className={styles.kindList} aria-label={range === 'week' ? 'Time per activity this week' : 'Time per activity, all time'}>
            {rows.map((row) => (
              <li key={row.kind} className={styles.kindRow}>
                <span className={styles.kindIcon} aria-hidden="true">
                  <Icon name={row.icon} size={18} />
                </span>
                <span className={styles.kindLabel}>{row.label}</span>
                <span className={styles.kindValue}>{durationText(row.sec)}</span>
                <span className={styles.kindTrack} aria-hidden="true">
                  <span className={styles.kindBar} style={{ width: `${Math.max(2, row.fraction * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.chartText}>
            {durationText(total)} in all{range === 'week' ? ' this week' : ''}, most of it on {rows[0].label.toLowerCase()}.
          </p>
        </>
      )}
    </div>
  );
}
