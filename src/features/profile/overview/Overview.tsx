import { useMemo } from 'react';
import { href } from '@/app/router';
import { ROUTE_BY_NAME } from '@/app/routes';
import { teacherById } from '@/app/teachers';
import {
  ACTIVITY_KINDS,
  selectPracticeTotals,
  useAchievements,
  useDailyGoal,
  useLevel,
  useProfile,
  useProgress,
  useProgressStore,
  useQuests,
  useStreak,
  type AchievementView,
  type QuestView,
} from '@/core/progress';
import { AnimatedNumber, Avatar, Badge, Card, EmptyState, GemChip, Icon, LevelBadge, LinkButton, List, ListItem, ProgressBar, Section, Stat, cx } from '@/ui';
import { closestGoals, progressFraction, progressText, recentTrophies, TIER_NAMES } from '../achievements/model';
import { dateText, durationText, hoursNumber, plural, thousands, timeAgo } from '../format';
import { Medal } from '../parts/Medal';
import { ActivityTime, PracticeCalendar, WeekMinutes } from './Charts';
import { CALENDAR_TEXT, crownsText, rustiestSkills, strongestSkills, STRENGTH_TEXT, type SkillLine } from './model';
import styles from './Overview.module.css';

function Hero() {
  const profile = useProfile();
  const level = useLevel();
  const goal = useDailyGoal();
  const teacher = teacherById(profile.teacher);
  return (
    <Card variant="raised" padding="lg">
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <span className={styles.heroBadge}>
            <LevelBadge level={level.level} size={72} />
          </span>
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>Level {level.level}</p>
            <p className={styles.heroTitle}>{level.title}</p>
            <p className={styles.heroNote}>
              {level.nextTitle ? (
                <>
                  Next title at level {level.nextTitle.level}: <span className={styles.heroNext}>{level.nextTitle.title}</span>
                </>
              ) : (
                'The highest title there is.'
              )}
            </p>
          </div>
        </div>

        <ProgressBar label={`To level ${level.level + 1}`} value={level.xpIntoLevel} max={level.xpForNext} valueText={`${thousands(level.xpIntoLevel)} / ${thousands(level.xpForNext)} XP`} tone="xp" />

        <div className={styles.teacherRow}>
          <a className={styles.teacher} href={href('teachers')}>
            <Avatar name={teacher.name} tone={teacher.tone} size="md" decorative />
            <span className={styles.teacherText}>
              <span className={styles.teacherName}>Learning with {teacher.name}</span>
              <span className={styles.teacherNote}>
                {teacher.level} teacher<span className={styles.teacherCourse}> · {teacher.course}</span>
              </span>
            </span>
            <Icon name="ChevronRight" size={20} className={styles.teacherChevron} />
          </a>
        </div>

        <div className={styles.heroAction}>
          <LinkButton variant="primary" size="lg" fullWidth wrap to={goal.met ? 'studio' : 'home'} iconRight="ArrowRight">
            {goal.met ? 'Keep playing' : goal.xp > 0 ? 'Finish today’s goal' : 'Start today’s practice'}
          </LinkButton>
          <p className={styles.heroGoal}>{goal.met ? `Today’s goal is met: ${goal.xp} of ${goal.goal} XP.` : goal.xp > 0 ? `${goal.remaining} XP to go today.` : `Today’s goal: ${goal.goal} XP, a few minutes of playing.`}</p>
        </div>
      </div>
    </Card>
  );
}

function Numbers() {
  const totals = useProgress(selectPracticeTotals);
  const streak = useStreak();
  const xp = useProgress((s) => s.xp.total);
  return (
    <div className={styles.numbers}>
      <Stat icon="Zap" label="Total XP" value={<AnimatedNumber value={xp} />} hint={`${plural(totals.week.xp, 'XP', 'XP')} this week`} />
      <Stat
        icon="Flame"
        label="Streak"
        value={streak.current}
        unit={streak.current === 1 ? 'day' : 'days'}
        hint={streak.longest > streak.current ? `Longest ${plural(streak.longest, 'day')}` : streak.current > 0 ? 'Your longest yet' : 'Starts when you meet a daily goal'}
      />
      <Stat icon="Clock" label="This week" value={totals.week.minutes} unit="min" hint={`${plural(totals.week.days, 'day')} practised`} />
      <Stat icon="Hourglass" label="All time" value={hoursNumber(totals.allTime.sec)} unit="h" hint={totals.allTime.days > 0 ? `${plural(totals.allTime.days, 'day')} practised` : 'Every minute counts from here'} />
    </div>
  );
}

function StreakLine() {
  const streak = useStreak();
  const parts: string[] = [];
  if (streak.current === 0) parts.push('No streak yet: meet your daily goal today to start one');
  else parts.push(`${plural(streak.current, 'day')} in a row${streak.todayMet ? '' : ', today still open'}`);
  if (streak.nextMilestone && streak.current > 0) parts.push(`${plural(streak.daysToMilestone, 'day')} to the ${streak.nextMilestone}-day milestone`);
  parts.push(`${streak.freezes} of ${streak.maxFreezes} streak freezes held`);
  return (
    <p className={styles.streakLine}>
      <span className={cx(styles.flame, (streak.current === 0 || !streak.todayMet) && styles.flameIdle)} aria-hidden="true">
        <Icon name="Flame" size={18} strokeWidth={2} />
      </span>
      {parts.join(' · ')}.
    </p>
  );
}

function Crowns({ count }: { count: number }) {
  return (
    <span className={styles.crowns} role="img" aria-label={crownsText(count)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="Crown" size={14} strokeWidth={2} className={n <= count ? styles.crownOn : styles.crownOff} />
      ))}
    </span>
  );
}

function SkillList({ skills, now }: { skills: readonly SkillLine[]; now: number }) {
  return (
    <List variant="card">
      {skills.map((skill) => (
        <ListItem
          key={skill.id}
          icon={skill.icon}
          wrap
          to={skill.route && ROUTE_BY_NAME[skill.route] ? skill.route : undefined}
          params={skill.params}
          title={skill.name}
          subtitle={`${skill.kind} · ${STRENGTH_TEXT[skill.label].toLowerCase()}${skill.lastAt > 0 ? ` · ${timeAgo(skill.lastAt, now)}` : ''}`}
          trailing={<Crowns count={skill.mastery} />}
        />
      ))}
    </List>
  );
}

function Skills() {
  const store = useProgressStore();
  const skills = useProgress((s) => s.skills);
  const log = useProgress((s) => s.log);
  const recents = useProgress((s) => s.recents);
  const now = store.now();
  const { strong, rusty } = useMemo(() => {
    const state = store.getState();
    return { strong: strongestSkills(state, now), rusty: rustiestSkills(state, now) };
    // The three slices are what the lists are built from; `now` only matters when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, log, recents, store]);

  if (strong.length === 0) {
    return (
      <Section title="Skills" description="What you know best, and what could use a visit.">
        <EmptyState
          icon="Crown"
          title="No crowns yet"
          framed
          actions={
            <LinkButton to="studio" iconRight="ArrowRight">
              Find something to play
            </LinkButton>
          }
        >
          Finish a scale game, a chord drill or a song and it earns its first crown. Your strongest skills and the ones getting rusty show up here.
        </EmptyState>
      </Section>
    );
  }
  return (
    <div className={styles.pair}>
      <Section title="Strongest skills" description="Most crowns, most recently played.">
        <SkillList skills={strong} now={now} />
      </Section>
      <Section title="Getting rusty" description="Learned, but not played for a while.">
        {rusty.length > 0 ? (
          <SkillList skills={rusty} now={now} />
        ) : (
          <Card variant="sunken">
            <span className={styles.calm}>
              <Icon name="Sparkles" size={20} />
              <span>Nothing is rusty. Everything you have learned is still fresh.</span>
            </span>
          </Card>
        )}
      </Section>
    </div>
  );
}

function QuestRow({ quest }: { quest: QuestView }) {
  // "Earn XP" style quests have no screen of their own: no link then.
  const link = quest.route !== 'home' && ROUTE_BY_NAME[quest.route] ? quest.route : undefined;
  return (
    <ListItem
      icon={quest.icon}
      to={link}
      wrap
      title={quest.title}
      subtitle={
        <span className={styles.questProgress}>
          <ProgressBar aria-label={`${quest.progress} of ${quest.target}`} value={quest.fraction * 100} size="sm" tone={quest.done ? 'ok' : 'accent'} valueText={false} />
          <span className={styles.questCount}>
            {quest.progress} / {quest.target}
          </span>
        </span>
      }
      trailing={
        quest.done ? (
          <Badge tone="ok" icon="Check">
            Done
          </Badge>
        ) : (
          <GemChip value={quest.gems} />
        )
      }
    />
  );
}

function Quests() {
  const quests = useQuests();
  return (
    <Section title="Quests" description={quests.allDone ? 'All three done today. Fresh ones arrive tomorrow.' : `${quests.done} of ${quests.daily.length} done today · all three pay ${quests.sweepGems} bonus gems`}>
      <List variant="card">
        {quests.daily.map((q) => (
          <QuestRow key={q.id} quest={q} />
        ))}
      </List>
      {quests.weekly && (
        <div className={styles.weekly}>
          <p className={styles.kicker}>This week</p>
          <List variant="card">
            <QuestRow quest={quests.weekly} />
          </List>
        </div>
      )}
    </Section>
  );
}

function TrophyTile({ a }: { a: AchievementView }) {
  return (
    <Card to="profile" params={['achievements', a.id]} padding="sm">
      <span className={styles.trophy}>
        <Medal icon={a.icon} tier={a.tier} earned size={48} />
        <span className={styles.trophyText}>
          <span className={styles.trophyName}>{a.name}</span>
          <span className={styles.trophyMeta}>
            {TIER_NAMES[a.tier]}
            {a.at ? ` · ${dateText(a.at)}` : ''}
          </span>
        </span>
      </span>
    </Card>
  );
}

function Trophies() {
  const { list, unlocked, total } = useAchievements();
  const recent = useMemo(() => recentTrophies(list, 4), [list]);
  const close = useMemo(() => closestGoals(list, 3), [list]);
  return (
    <Section
      title="Achievements"
      description={unlocked === 0 ? `${total} to earn. The first ones come quickly.` : `${unlocked} of ${total} earned.`}
      actions={
        <LinkButton to="profile" params={['achievements']} size="sm" variant="ghost" iconRight="ArrowRight">
          See all
        </LinkButton>
      }
    >
      {recent.length > 0 && (
        <div className={styles.trophies}>
          {recent.map((a) => (
            <TrophyTile key={a.id} a={a} />
          ))}
        </div>
      )}
      {close.length > 0 && (
        <div className={styles.weekly}>
          <p className={styles.kicker}>{recent.length > 0 ? 'Within reach' : 'Good ones to start with'}</p>
          <List variant="card">
            {close.map((a) => (
              <ListItem
                key={a.id}
                to="profile"
                params={['achievements', a.id]}
                wrap
                leading={<Medal icon={a.icon} tier={a.tier} earned={false} size={40} />}
                title={a.name}
                subtitle={
                  <span className={styles.questProgress}>
                    <ProgressBar aria-label={progressText(a)} value={progressFraction(a) * 100} size="sm" tone="neutral" valueText={false} />
                    <span className={styles.questCount}>{progressText(a)}</span>
                  </span>
                }
              />
            ))}
          </List>
        </div>
      )}
    </Section>
  );
}

function RecentPractice() {
  const store = useProgressStore();
  const log = useProgress((s) => s.log);
  if (log.length === 0) return null;
  const now = store.now();
  return (
    <Section title="Recent practice" description="The last things you did.">
      <List variant="card">
        {log.slice(0, 5).map((session) => {
          const kind = ACTIVITY_KINDS[session.kind] ?? ACTIVITY_KINDS.other;
          return (
            <ListItem
              key={session.id}
              icon={kind.icon}
              wrap
              title={session.title || kind.label}
              subtitle={`${kind.label}${session.durationSec >= 30 ? ` · ${durationText(session.durationSec)}` : ''} · ${timeAgo(session.startedAt, now)}`}
              trailing={session.xp > 0 ? <span className={styles.sessionXp}>+{session.xp} XP</span> : undefined}
            />
          );
        })}
      </List>
    </Section>
  );
}

/**
 * The overview of the Me area: who the learner is and how it is going, at a glance. Level and
 * title, the streak with a calendar of practice, this week's minutes, time per activity, the
 * strongest and rustiest skills, quests and trophies.
 */
export default function Overview() {
  return (
    <div className={styles.overview}>
      <Hero />
      <Numbers />
      <Section title="Practice calendar" description={CALENDAR_TEXT.description}>
        <StreakLine />
        <PracticeCalendar />
      </Section>
      <div className={styles.pair}>
        <Section title="This week" description="Minutes practised each day.">
          <WeekMinutes />
        </Section>
        <Section title="Time by activity" description="Where your practice time goes.">
          <ActivityTime />
        </Section>
      </div>
      <Skills />
      <div className={styles.pair}>
        <Quests />
        <Trophies />
      </div>
      <RecentPractice />
    </div>
  );
}
