/**
 * What the overview shows, worked out from the progress state: the calendar heat map laid out in
 * week columns with its text equivalent, the week's minutes, time per activity, and the learner's
 * strongest and rustiest skills with readable names. Pure functions; the components only draw.
 */
import { ACTIVITY_KINDS, rustySkills, skillView, type HeatCell, type KindTime, type ProgressState, type SkillView, type StrengthLabel, type WeekDayView } from '@/core/progress';
import { dayLabel, durationText, monthKey, monthLong, monthShort, plural } from '../format';

// ---------------------------------------------------------------------------------------------
// Calendar heat map
// ---------------------------------------------------------------------------------------------

/** One week of the heat map: seven slots in week order; null for days that have not come yet. */
export interface HeatColumn {
  /** First day of the week. */
  start: string;
  /** Month name to print above this column, or null. */
  month: string | null;
  cells: Array<HeatCell | null>;
}

/** How many week columns fit in `width` pixels, between `min` and `max`. */
export function weeksThatFit(width: number, options: { cell: number; gap: number; gutter: number; min?: number; max?: number }): number {
  const { cell, gap, gutter, min = 8, max = 39 } = options;
  if (!(width > 0)) return min;
  const fit = Math.floor((width - gutter + gap) / (cell + gap));
  return Math.max(min, Math.min(max, fit));
}

/** Sizes of the calendar: how many weeks it shows and how large a square is, in px. */
export interface CalendarLayout {
  weeks: number;
  cell: number;
  gap: number;
  gutter: number;
}

/** Smallest and largest square, the space between squares, and the width of the weekday labels. */
export const CALENDAR = { minCell: 14, maxCell: 20, gap: 3, gutter: 30, minWeeks: 16, maxWeeks: 39 } as const;

/**
 * Fit the calendar to the room it has and to the history there is. It never shows more weeks than
 * fit at the smallest square, and no more than the learner's history needs (a new learner gets
 * sixteen weeks, not nine empty months); with room to spare the squares grow instead.
 */
export function calendarLayout(width: number, historyWeeks: number): CalendarLayout {
  const { minCell, maxCell, gap, gutter, minWeeks, maxWeeks } = CALENDAR;
  const fit = weeksThatFit(width, { cell: minCell, gap, gutter, min: 8, max: maxWeeks });
  const weeks = Math.min(fit, Math.max(minWeeks, Math.ceil(historyWeeks)));
  const room = width > 0 ? Math.floor((width - gutter + gap) / weeks) - gap : minCell;
  return { weeks, cell: Math.max(minCell, Math.min(maxCell, room)), gap, gutter };
}

/** Whole weeks from the first day with practice up to today, counting both ends (0 when there is none). */
export function historyWeeks(days: Readonly<Record<string, { n: number }>>, today: string): number {
  let first: string | null = null;
  for (const day in days) if (days[day].n > 0 && (first === null || day < first)) first = day;
  if (first === null || first > today) return 0;
  const span = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
  return Math.floor(span / 7) + 2;
}

/**
 * Lay the cells of `practiceHeatmap` out as week columns. The first cell is always the first day
 * of a week; the last column is padded with nulls for the days still to come.
 */
export function heatColumns(cells: readonly HeatCell[]): HeatColumn[] {
  const columns: HeatColumn[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week: Array<HeatCell | null> = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    columns.push({ start: cells[i].day, month: null, cells: week });
  }
  // A month is named above the column that holds its first day.
  for (const column of columns) {
    const first = column.cells.find((c): c is HeatCell => c !== null && c.day.endsWith('-01'));
    if (first) column.month = monthShort(first.day);
  }
  // The first column names its own month too, unless the next name follows so soon that the two would collide.
  if (columns.length > 0 && columns[0].month === null) {
    const next = columns.findIndex((c) => c.month !== null);
    if (next === -1 || next >= 3) columns[0].month = monthShort(columns[0].start);
  }
  return columns;
}

/** Practice in one calendar month of the heat map. */
export interface HeatMonth {
  key: string;
  label: string;
  /** Days with any practice. */
  practised: number;
  /** Days with the daily goal met. */
  met: number;
  xp: number;
  sec: number;
}

/** The heat map in numbers: the text equivalent of the picture. */
export interface HeatSummary {
  /** Days covered. */
  days: number;
  practised: number;
  met: number;
  frozen: number;
  xp: number;
  sec: number;
  /** The day with the most XP, or null when there was no practice. */
  best: HeatCell | null;
  /** Newest month first. */
  months: HeatMonth[];
}

/** Add the heat map up, as a whole and month by month. */
export function summariseHeat(cells: readonly HeatCell[]): HeatSummary {
  const out: HeatSummary = { days: cells.length, practised: 0, met: 0, frozen: 0, xp: 0, sec: 0, best: null, months: [] };
  const months = new Map<string, HeatMonth>();
  for (const cell of cells) {
    const key = monthKey(cell.day);
    let month = months.get(key);
    if (!month) months.set(key, (month = { key, label: monthLong(cell.day), practised: 0, met: 0, xp: 0, sec: 0 }));
    if (cell.active || cell.xp > 0) {
      out.practised++;
      month.practised++;
    }
    if (cell.met) {
      out.met++;
      month.met++;
    }
    if (cell.frozen) out.frozen++;
    out.xp += cell.xp;
    out.sec += cell.sec;
    month.xp += cell.xp;
    month.sec += cell.sec;
    if (cell.xp > 0 && (!out.best || cell.xp > out.best.xp)) out.best = cell;
  }
  out.months = [...months.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  return out;
}

/** One or two sentences that say what the heat map shows. */
export function heatSentence(summary: HeatSummary): string {
  if (summary.practised === 0) return `No practice in the last ${plural(summary.days, 'day')} yet. Each day you practise fills in a square.`;
  const goal = summary.met === 0 ? 'The daily goal was not met yet.' : `You met your daily goal on ${summary.met === summary.practised ? 'every one of them' : plural(summary.met, 'day')}.`;
  const best = summary.best ? ` Best day: ${dayLabel(summary.best.day)} with ${summary.best.xp} XP.` : '';
  return `You practised on ${summary.practised} of the last ${plural(summary.days, 'day')}. ${goal}${best}`;
}

/** What one square says: the day, and what happened on it. */
export function heatCellText(cell: HeatCell, today: string): string {
  const day = cell.day === today ? `Today, ${dayLabel(cell.day)}` : dayLabel(cell.day);
  if (cell.xp <= 0 && !cell.active) return cell.frozen ? `${day}: covered by a streak freeze.` : `${day}: no practice.`;
  const time = cell.sec >= 30 ? ` in ${durationText(cell.sec)}` : '';
  const goal = cell.met ? 'Goal met.' : `Goal of ${cell.goal} XP not reached.`;
  return `${day}: ${cell.xp} XP${time}. ${goal}`;
}

/** The legend of the heat map: what each of the five intensities means. */
export const HEAT_LEVELS: ReadonlyArray<{ level: 0 | 1 | 2 | 3 | 4; text: string }> = [
  { level: 0, text: 'No practice' },
  { level: 1, text: 'Under half the goal' },
  { level: 2, text: 'Under the goal' },
  { level: 3, text: 'Goal met' },
  { level: 4, text: 'Double the goal' },
];

// ---------------------------------------------------------------------------------------------
// This week, and time per activity
// ---------------------------------------------------------------------------------------------

/** One column of the week chart. */
export interface WeekBar {
  day: string;
  /** Mon, Tue ... */
  label: string;
  sec: number;
  minutes: number;
  xp: number;
  met: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Height as a share of the tallest column, 0 to 1. */
  fraction: number;
}

/** The week's practice as chart columns with totals. */
export interface WeekChart {
  bars: WeekBar[];
  totalSec: number;
  totalXp: number;
  /** Days with any practice. */
  activeDays: number;
  /** Days so far this week (today included). */
  daysSoFar: number;
}

/** Turn `selectWeek` into chart columns. A day's minutes are rounded; a day under 30 s shows 0. */
export function weekChart(week: readonly WeekDayView[]): WeekChart {
  const max = Math.max(1, ...week.map((d) => d.sec));
  const bars = week.map((d) => ({
    day: d.day,
    label: d.label,
    sec: d.sec,
    minutes: Math.round(d.sec / 60),
    xp: d.xp,
    met: d.met,
    isToday: d.isToday,
    isFuture: d.isFuture,
    fraction: d.sec / max,
  }));
  return {
    bars,
    totalSec: week.reduce((sum, d) => sum + d.sec, 0),
    totalXp: week.reduce((sum, d) => sum + d.xp, 0),
    activeDays: week.filter((d) => d.active || d.xp > 0).length,
    daysSoFar: week.filter((d) => !d.isFuture).length,
  };
}

/** A sentence for the week chart. */
export function weekSentence(chart: WeekChart): string {
  if (chart.activeDays === 0) return 'Nothing yet this week. A few minutes today gets it started.';
  const busiest = chart.bars.reduce((best, bar) => (bar.sec > best.sec ? bar : best), chart.bars[0]);
  const top = busiest.sec >= 30 ? ` Most on ${busiest.label}: ${durationText(busiest.sec)}.` : '';
  return `${durationText(chart.totalSec)} over ${plural(chart.activeDays, 'day')} this week, for ${chart.totalXp} XP.${top}`;
}

/** Time on one kind of activity, with its share of the longest one. */
export interface KindShare extends KindTime {
  /** Bar length, 0 to 1 of the longest row. */
  fraction: number;
  /** Share of all the time listed, 0 to 1. */
  share: number;
}

/**
 * Rows for the "by activity" bars: longest first, at most `limit` rows, the rest folded into one
 * "Everything else" row so the chart never grows past a phone screen.
 */
export function kindShares(kinds: readonly KindTime[], limit = 6): KindShare[] {
  const sorted = [...kinds].filter((k) => k.sec > 0).sort((a, b) => b.sec - a.sec);
  let rows: KindTime[] = sorted;
  if (sorted.length > limit) {
    const rest = sorted.slice(limit - 1);
    const sec = rest.reduce((sum, k) => sum + k.sec, 0);
    rows = [...sorted.slice(0, limit - 1), { kind: 'other', label: 'Everything else', icon: ACTIVITY_KINDS.other.icon, sec, minutes: Math.round(sec / 60) }];
  }
  const total = rows.reduce((sum, k) => sum + k.sec, 0);
  const max = Math.max(1, ...rows.map((k) => k.sec));
  return rows.map((k) => ({ ...k, fraction: k.sec / max, share: total > 0 ? k.sec / total : 0 }));
}

// ---------------------------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------------------------

/** What a family of skill ids is called and where it is practised. */
interface SkillFamily {
  prefix: string;
  kind: string;
  icon: string;
  route: string;
  /**
   * Where the name comes from: `id` when the id itself says what the skill is (a scale position, a
   * chord), `title` when only the screen that owns it knows (a song, an exercise).
   */
  named: 'id' | 'title';
  /** False for lesson completions: they are revisited through review cards, not listed as skills to keep fresh. */
  playing: boolean;
}

const FAMILIES: readonly SkillFamily[] = [
  { prefix: 'chord-change:', kind: 'Chord change', icon: 'Repeat', route: 'chords', named: 'id', playing: true },
  { prefix: 'chord:', kind: 'Chord', icon: 'Grid3x3', route: 'chords', named: 'id', playing: true },
  { prefix: 'scale:', kind: 'Scale', icon: 'Waypoints', route: 'scales', named: 'id', playing: true },
  { prefix: 'song:', kind: 'Song', icon: 'Music', route: 'songs', named: 'title', playing: true },
  { prefix: 'theory:', kind: 'Theory', icon: 'Route', route: 'learn', named: 'title', playing: false },
  { prefix: 'teacher:', kind: 'Teacher lesson', icon: 'GraduationCap', route: 'teachers', named: 'title', playing: false },
  { prefix: 'fretboard:', kind: 'Fretboard', icon: 'Rows4', route: 'fretboard', named: 'id', playing: true },
  { prefix: 'ear:', kind: 'Ear training', icon: 'Ear', route: 'ear', named: 'title', playing: true },
  { prefix: 'rhythm:', kind: 'Rhythm', icon: 'Drum', route: 'rhythm', named: 'title', playing: true },
  { prefix: 'technique:', kind: 'Technique', icon: 'Hand', route: 'technique', named: 'title', playing: true },
  { prefix: 'progression:', kind: 'Progression', icon: 'ListMusic', route: 'progressions', named: 'title', playing: true },
];

const familyOf = (id: string): SkillFamily | undefined => FAMILIES.find((f) => id.startsWith(f.prefix));

/** True for skills that are played and can go rusty (everything but finished lessons). */
export function isPlayingSkill(id: string): boolean {
  return familyOf(id)?.playing ?? true;
}

const sentenceCase = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** `a-minor-pentatonic` -> "A minor pentatonic"; `c-sharp-major` -> "C♯ major"; `b-flat-blues` -> "B♭ blues". */
function words(slug: string): string {
  const text = slug.replace(/-/g, ' ').replace(/\b([a-g]) sharp\b/gi, '$1♯').replace(/\b([a-g]) flat\b/gi, '$1♭');
  return sentenceCase(text.trim());
}

/** A chord slug as a symbol: `am7` -> "Am7", `g` -> "G", `f-sharp-m` -> "F♯m", `c-e` -> "C/E". */
function chordSymbol(slug: string): string {
  const text = slug.replace(/^([a-g])-sharp-?/i, '$1♯').replace(/^([a-g])-flat-?/i, '$1♭').replace(/-([a-g])$/i, (_m, bass: string) => `/${bass.toUpperCase()}`).replace(/-/g, '');
  return sentenceCase(text);
}

/** A readable name for a skill id when no screen has given it a title. */
export function skillNameFromId(id: string): string {
  const family = familyOf(id);
  const rest = family ? id.slice(family.prefix.length) : id;
  const parts = rest.split(':').filter(Boolean);
  if (!family) return words(parts.join(' ')) || id;
  switch (family.prefix) {
    case 'chord:':
      return chordSymbol(parts[0] ?? '');
    case 'chord-change:': {
      const [a, b] = (parts[0] ?? '').split(/-(?=[a-g](?:m|maj|7|sus|dim|aug|add|\d|$))/i);
      return b ? `${chordSymbol(a)} to ${chordSymbol(b)}` : chordSymbol(parts[0] ?? '');
    }
    case 'teacher:':
      return parts.length > 1 ? `${sentenceCase(parts[0])}: ${words(parts.slice(1).join(' ')).toLowerCase()}` : sentenceCase(parts[0] ?? '');
    default:
      return parts.map((p, i) => (i === 0 ? words(p) : words(p).toLowerCase())).join(', ');
  }
}

/** A skill as the overview lists it. */
export interface SkillLine {
  id: string;
  name: string;
  /** "Scale", "Song" ... */
  kind: string;
  icon: string;
  /** Crowns, 0 to 5. */
  mastery: number;
  /** 0 to 1. */
  strength: number;
  label: StrengthLabel;
  /** Best accuracy in percent, or null when nothing was measured. */
  best: number | null;
  lastAt: number;
  /** Where to practise it again. */
  route: string | null;
  params: string[];
}

/** Titles and addresses screens have given to skills (from the practice log and the recents list). */
function knownSkills(state: ProgressState): Map<string, { title?: string; route?: string; params?: string[] }> {
  const known = new Map<string, { title?: string; route?: string; params?: string[] }>();
  // Oldest first, so the newest title wins.
  for (let i = state.log.length - 1; i >= 0; i--) {
    const session = state.log[i];
    if (session.skillId && session.title) known.set(session.skillId, { ...known.get(session.skillId), title: session.title });
  }
  for (let i = state.recents.length - 1; i >= 0; i--) {
    const recent = state.recents[i];
    if (recent.skillId) known.set(recent.skillId, { title: recent.title || known.get(recent.skillId)?.title, route: recent.route, params: recent.params });
  }
  return known;
}

function toLine(view: SkillView, known: ReturnType<typeof knownSkills>): SkillLine {
  const family = familyOf(view.id);
  const info = known.get(view.id);
  const record = view.record;
  return {
    id: view.id,
    name: (family?.named === 'id' ? '' : info?.title) || skillNameFromId(view.id),
    kind: family?.kind ?? 'Skill',
    icon: family?.icon ?? 'Activity',
    mastery: view.mastery,
    strength: view.strength,
    label: view.label,
    best: record && record.bestAccuracy > 0 ? Math.round(record.bestAccuracy * 100) : null,
    lastAt: record?.lastAt ?? 0,
    route: info?.route ?? family?.route ?? null,
    params: info?.route ? info.params ?? [] : [],
  };
}

/** The skills the learner knows best: most crowns first, then the freshest, then the most accurate. */
export function strongestSkills(state: ProgressState, now: number, limit = 4): SkillLine[] {
  const known = knownSkills(state);
  const views: SkillView[] = [];
  for (const id in state.skills) {
    if (!isPlayingSkill(id)) continue;
    const view = skillView(state, id, now);
    if (view.mastery >= 1) views.push(view);
  }
  views.sort((a, b) => b.mastery - a.mastery || b.strength - a.strength || (b.record?.bestAccuracy ?? 0) - (a.record?.bestAccuracy ?? 0) || (a.id < b.id ? -1 : 1));
  return views.slice(0, limit).map((v) => toLine(v, known));
}

/** Learned skills that have gone longest without practice, weakest first. */
export function rustiestSkills(state: ProgressState, now: number, limit = 4): SkillLine[] {
  const known = knownSkills(state);
  return rustySkills(state, now)
    .filter((v) => isPlayingSkill(v.id))
    .slice(0, limit)
    .map((v) => toLine(v, known));
}

/** Plain words for how fresh a skill is. */
export const STRENGTH_TEXT: Readonly<Record<StrengthLabel, string>> = {
  new: 'Not started',
  fresh: 'Fresh',
  fading: 'Fading',
  rusty: 'Rusty',
};

/** "3 of 5 crowns". */
export function crownsText(mastery: number): string {
  return `${mastery} of 5 crowns`;
}
