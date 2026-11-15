import { describe, expect, it } from 'vitest';
import { minutesByKind, practiceHeatmap, selectWeek, type HeatCell, type KindTime } from '@/core/progress';
import { emptyFixture, richFixture } from '../testing/fixtures';
import {
  CALENDAR,
  CALENDAR_TEXT,
  HEAT_LEVELS,
  calendarLayout,
  crownsText,
  heatCellText,
  heatColumns,
  heatSentence,
  historyWeeks,
  isPlayingSkill,
  kindSentence,
  kindShares,
  rustiestSkills,
  skillNameFromId,
  strongestSkills,
  summariseHeat,
  weekChart,
  weekSentence,
  weeksThatFit,
} from './model';

const NOW = Date.parse('2026-11-15T19:10:00Z'); // a Sunday
const rich = richFixture(NOW, 'UTC');
const empty = emptyFixture(NOW, 'UTC');

function cell(day: string, patch: Partial<HeatCell> = {}): HeatCell {
  return { day, xp: 0, goal: 20, met: false, frozen: false, sec: 0, active: false, weekday: 0, level: 0, ...patch };
}

describe('calendar layout', () => {
  it('fits whole weeks into the width', () => {
    expect(weeksThatFit(358, { cell: 14, gap: 3, gutter: 30 })).toBe(19);
    expect(weeksThatFit(0, { cell: 14, gap: 3, gutter: 30 })).toBe(8);
    expect(weeksThatFit(5000, { cell: 14, gap: 3, gutter: 30 })).toBe(39);
    expect(weeksThatFit(120, { cell: 14, gap: 3, gutter: 30, min: 4 })).toBe(5);
  });

  it('shows no more weeks than the history needs, and grows the squares instead', () => {
    // A phone: nineteen weeks fit; a learner with four months of history fills them.
    expect(calendarLayout(358, 19)).toMatchObject({ weeks: 19, cell: 14 });
    // A new learner on a wide screen gets sixteen weeks of larger squares, not nine empty months.
    const fresh = calendarLayout(720, 0);
    expect(fresh.weeks).toBe(CALENDAR.minWeeks);
    expect(fresh.cell).toBe(CALENDAR.maxCell);
    // Years of history on a wide screen: as many weeks as fit at the smallest square.
    expect(calendarLayout(720, 150)).toMatchObject({ weeks: 39, cell: 14 });
    // Whatever the width, the grid never comes out wider than the room it was given.
    for (const width of [300, 358, 420, 448, 600, 720, 900]) {
      for (const history of [0, 5, 19, 30, 200]) {
        const layout = calendarLayout(width, history);
        const used = layout.gutter + layout.weeks * layout.cell + (layout.weeks - 1) * layout.gap;
        if (layout.weeks > 8) expect(used, `${width}px, ${history} weeks`).toBeLessThanOrEqual(width);
        expect(layout.cell).toBeGreaterThanOrEqual(CALENDAR.minCell);
        expect(layout.cell).toBeLessThanOrEqual(CALENDAR.maxCell);
      }
    }
  });

  it('counts the weeks of history from the first practised day', () => {
    expect(historyWeeks({}, '2026-11-15')).toBe(0);
    expect(historyWeeks({ '2026-11-15': { n: 1 } }, '2026-11-15')).toBe(2);
    expect(historyWeeks({ '2026-11-01': { n: 2 }, '2026-10-01': { n: 0 } }, '2026-11-15')).toBe(4);
    expect(historyWeeks(rich.store.getState().days, '2026-11-15')).toBeGreaterThanOrEqual(17);
  });
});

describe('heat map columns', () => {
  it('lays days out in week columns, padding the week still running', () => {
    const state = rich.store.getState();
    const cells = practiceHeatmap(state, 6);
    const columns = heatColumns(cells);
    expect(columns).toHaveLength(6);
    for (const column of columns) expect(column.cells).toHaveLength(7);
    // The first cell is a Monday (the default week start) and nothing is lost or repeated.
    expect(columns[0].cells[0]?.weekday).toBe(1);
    expect(columns.flatMap((c) => c.cells).filter(Boolean)).toHaveLength(cells.length);
    // Today is a Sunday, the last day of the week: the last column is full.
    expect(columns[5].cells.every((c) => c !== null)).toBe(true);
  });

  it('pads the days still to come with nulls', () => {
    const cells = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => cell(d));
    const [column] = heatColumns(cells);
    expect(column.cells.slice(0, 3).every(Boolean)).toBe(true);
    expect(column.cells.slice(3)).toEqual([null, null, null, null]);
  });

  it('names a month above the column that holds its first day', () => {
    const columns = heatColumns(practiceHeatmap(rich.store.getState(), 12));
    const named = columns.filter((c) => c.month !== null).map((c) => c.month);
    // Twelve weeks back from mid-November: September, October and November start in view.
    expect(named).toEqual(expect.arrayContaining(['Sep', 'Oct', 'Nov']));
    for (const column of columns) {
      const first = column.cells.find((c) => c?.day.endsWith('-01'));
      if (first) expect(column.month).not.toBeNull();
    }
    // Month names never sit closer than three columns apart.
    const indexes = columns.map((c, i) => (c.month ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < indexes.length; i++) expect(indexes[i] - indexes[i - 1]).toBeGreaterThanOrEqual(3);
  });
});

describe('heat map in words', () => {
  it('adds the days up, as a whole and by month', () => {
    const state = rich.store.getState();
    const cells = practiceHeatmap(state, 8);
    const summary = summariseHeat(cells);
    expect(summary.days).toBe(cells.length);
    expect(summary.practised).toBe(cells.filter((c) => c.active).length);
    expect(summary.met).toBe(cells.filter((c) => c.met).length);
    expect(summary.xp).toBe(cells.reduce((sum, c) => sum + c.xp, 0));
    expect(summary.months[0].label).toBe('November 2026');
    expect(summary.months.reduce((sum, m) => sum + m.practised, 0)).toBe(summary.practised);
    expect(summary.months.reduce((sum, m) => sum + m.xp, 0)).toBe(summary.xp);
    expect(summary.best?.xp).toBe(Math.max(...cells.map((c) => c.xp)));
  });

  it('writes a sentence for a practised calendar and for an empty one', () => {
    const summary = summariseHeat(practiceHeatmap(rich.store.getState(), 8));
    const sentence = heatSentence(summary);
    expect(sentence).toContain(`You practised on ${summary.practised} of the last ${summary.days} days.`);
    expect(sentence).toContain('Best day:');
    const none = heatSentence(summariseHeat(practiceHeatmap(empty.store.getState(), 8)));
    expect(none).toMatch(/^No practice in the last \d+ days yet\./);
  });

  it('describes one square', () => {
    expect(heatCellText(cell('2026-11-03'), '2026-11-15')).toBe('Tue 3 Nov: no practice.');
    expect(heatCellText(cell('2026-11-03', { frozen: true }), '2026-11-15')).toBe('Tue 3 Nov: covered by a streak freeze.');
    expect(heatCellText(cell('2026-11-03', { xp: 34, sec: 1080, met: true, active: true, level: 3 }), '2026-11-15')).toBe('Tue 3 Nov: 34 XP in 18 min. Goal met.');
    expect(heatCellText(cell('2026-11-15', { xp: 5, sec: 10, active: true, level: 1 }), '2026-11-15')).toBe('Today, Sun 15 Nov: 5 XP. Goal of 20 XP not reached.');
  });

  it('has a legend entry for each of the five intensities', () => {
    expect(HEAT_LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('calendar wording', () => {
  // Review: "Darker means more XP" is false in the dark theme, where more XP is drawn brighter.
  it('speaks of a stronger colour, which holds in both themes', () => {
    for (const text of Object.values(CALENDAR_TEXT)) {
      expect(text).not.toMatch(/dark|light|bright|pale/i);
      expect(text).toMatch(/stronger/);
    }
  });
});

describe('this week', () => {
  it('turns the week into chart columns', () => {
    const week = selectWeek(rich.store.getState());
    const chart = weekChart(week);
    expect(chart.bars).toHaveLength(7);
    expect(chart.bars.map((b) => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(Math.max(...chart.bars.map((b) => b.fraction))).toBe(1);
    expect(chart.totalSec).toBe(week.reduce((sum, d) => sum + d.sec, 0));
    expect(chart.activeDays).toBe(7);
    expect(chart.daysSoFar).toBe(7);
    expect(chart.bars[6].isToday).toBe(true);
    expect(weekSentence(chart)).toMatch(/over 7 days this week, for \d+ XP\. Most on/);
  });

  it('copes with a week that has nothing in it', () => {
    const chart = weekChart(selectWeek(empty.store.getState()));
    expect(chart.totalSec).toBe(0);
    expect(chart.bars.every((b) => b.fraction === 0 && Number.isFinite(b.fraction))).toBe(true);
    expect(weekSentence(chart)).toBe('Nothing yet this week. A few minutes today gets it started.');
  });
});

describe('time by activity', () => {
  const kind = (label: string, sec: number): KindTime => ({ kind: 'other', label, icon: 'Activity', sec, minutes: Math.round(sec / 60) });

  it('sorts longest first and scales bars to the longest row', () => {
    const rows = kindShares([kind('b', 60), kind('a', 600), kind('zero', 0), kind('c', 300)]);
    expect(rows.map((r) => r.label)).toEqual(['a', 'c', 'b']);
    expect(rows[0].fraction).toBe(1);
    expect(rows[1].fraction).toBe(0.5);
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1, 9);
  });

  it('folds the tail into one row so the chart stays short', () => {
    const many = Array.from({ length: 9 }, (_, i) => kind(`k${i}`, (10 - i) * 60));
    const rows = kindShares(many, 6);
    expect(rows).toHaveLength(6);
    expect(rows[5].label).toBe('Everything else');
    expect(rows[5].sec).toBe(many.slice(5).reduce((sum, k) => sum + k.sec, 0));
    expect(rows.reduce((sum, r) => sum + r.sec, 0)).toBe(many.reduce((sum, k) => sum + k.sec, 0));
    expect(kindShares(many.slice(0, 6), 6).some((r) => r.label === 'Everything else')).toBe(false);
    expect(kindShares([])).toEqual([]);
  });

  // Review: the sentence said "most of it on theory lesson" for 28 of 96 minutes.
  it('says "most" only when the largest share is more than half', () => {
    const real = (k: string, label: string, sec: number): KindTime => ({ kind: k as KindTime['kind'], label, icon: 'Activity', sec, minutes: Math.round(sec / 60) });
    const spread = kindShares([real('theory-lesson', 'Theory lesson', 28 * 60), real('song', 'Song', 20 * 60), real('tuner', 'Tuner', 18 * 60), real('ear', 'Ear training', 30 * 60)]);
    expect(kindSentence(spread, 'week')).toBe('1 h 36 min in all this week. The biggest share went to ear training: 30 min.');
    const lopsided = kindShares([real('song', 'Song', 50 * 60), real('tuner', 'Tuner', 10 * 60)]);
    expect(kindSentence(lopsided, 'all')).toBe('1 h in all, most of it on song.');
    expect(kindSentence(kindShares([real('tuner', 'Tuner', 5 * 60)]), 'week')).toBe('5 min in all this week, all of it on tuner.');
    expect(kindSentence([], 'week')).toBe('');
    // A folded "Everything else" row is never named as where the time went.
    const many = Array.from({ length: 9 }, (_, i) => real(['song', 'tuner', 'ear', 'rhythm', 'metronome', 'technique', 'camera', 'scan', 'review'][i], `K${i}`, (12 - i) * 60));
    const folded = kindShares(many, 6);
    expect(folded[5].label).toBe('Everything else');
    expect(folded[5].sec).toBeGreaterThan(folded[0].sec);
    expect(kindSentence(folded, 'week')).toContain('went to k0');
  });

  it('works on the store’s own numbers', () => {
    const state = rich.store.getState();
    const rows = kindShares(minutesByKind(state, 'all'));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < rows.length - 1; i++) expect(rows[i].sec).toBeLessThanOrEqual(rows[i - 1].sec);
  });
});

describe('skills', () => {
  it('names a skill from its id when no screen has named it', () => {
    expect(skillNameFromId('scale:a-minor-pentatonic:box-1')).toBe('A minor pentatonic, box 1');
    expect(skillNameFromId('scale:c-sharp-major:position-2')).toBe('C♯ major, position 2');
    expect(skillNameFromId('scale:b-flat-blues:box-3')).toBe('B♭ blues, box 3');
    expect(skillNameFromId('chord:g')).toBe('G');
    expect(skillNameFromId('chord:am7')).toBe('Am7');
    expect(skillNameFromId('chord:f-sharp-m')).toBe('F♯m');
    expect(skillNameFromId('chord:c-e')).toBe('C/E');
    expect(skillNameFromId('chord-change:g-c')).toBe('G to C');
    expect(skillNameFromId('chord-change:am-dm7')).toBe('Am to Dm7');
    expect(skillNameFromId('song:scarborough-fair')).toBe('Scarborough fair');
    expect(skillNameFromId('theory:unit-3:lesson-2')).toBe('Unit 3, lesson 2');
    expect(skillNameFromId('teacher:mia:lesson-4')).toBe('Mia: lesson 4');
    expect(skillNameFromId('fretboard:string-6')).toBe('String 6');
    expect(skillNameFromId('something-else')).toBe('Something else');
  });

  it('lists finished lessons nowhere: they are not skills to keep fresh', () => {
    expect(isPlayingSkill('theory:unit-1:lesson-1')).toBe(false);
    expect(isPlayingSkill('teacher:dev:lesson-3')).toBe(false);
    expect(isPlayingSkill('scale:g-major:position-1')).toBe(true);
    expect(isPlayingSkill('unknown:thing')).toBe(true);
  });

  it('finds the strongest skills: most crowns first, playing skills only', () => {
    const state = rich.store.getState();
    const strong = strongestSkills(state, NOW, 4);
    expect(strong).toHaveLength(4);
    for (let i = 1; i < strong.length; i++) expect(strong[i].mastery).toBeLessThanOrEqual(strong[i - 1].mastery);
    for (const skill of strong) {
      expect(skill.mastery).toBeGreaterThanOrEqual(1);
      expect(isPlayingSkill(skill.id)).toBe(true);
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.route).not.toBeNull();
    }
    // Ids that describe themselves are named from the id, not from a game's round title.
    const box = strongestSkills(state, NOW, 50).find((s) => s.id.startsWith('scale:a-minor-pentatonic:box-'));
    expect(box?.name).toMatch(/^A minor pentatonic, box \d$/);
    expect(box?.kind).toBe('Scale');
    // A song keeps the title its screen gave it.
    const song = strongestSkills(state, NOW, 50).find((s) => s.id === 'song:house-of-the-rising-sun');
    if (song) expect(song.name).toBe('House of the Rising Sun');
  });

  it('finds what has gone rusty: learned early, then left alone', () => {
    const state = rich.store.getState();
    const rusty = rustiestSkills(state, NOW, 4);
    expect(rusty.length).toBeGreaterThan(0);
    for (const skill of rusty) {
      expect(skill.label).toBe('rusty');
      expect(skill.strength).toBeLessThan(0.5);
      expect(isPlayingSkill(skill.id)).toBe(true);
    }
    for (let i = 1; i < rusty.length; i++) expect(rusty[i].strength).toBeGreaterThanOrEqual(rusty[i - 1].strength);
    // The G major positions were practised only in the first weeks.
    expect(rustiestSkills(state, NOW, 50).some((s) => s.id.startsWith('scale:g-major:'))).toBe(true);
  });

  it('has nothing to list for a new learner', () => {
    expect(strongestSkills(empty.store.getState(), NOW)).toEqual([]);
    expect(rustiestSkills(empty.store.getState(), NOW)).toEqual([]);
    expect(crownsText(3)).toBe('3 of 5 crowns');
  });
});
