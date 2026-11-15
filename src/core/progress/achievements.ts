/**
 * Achievements: the catalog and its evaluation.
 *
 * Every achievement is "a number reaches a target". The number comes from the state: a lifetime
 * counter in `state.stats`, the streak, XP, or a summary of the skill registry. That keeps
 * progress toward locked achievements available for free and makes every condition testable.
 *
 * Skill-based conditions rely on these id conventions (see `API.md`):
 *   scale:<scale>:<position>      e.g. scale:a-minor-pentatonic:box-1  (boxes are box-1 ... box-5)
 *   chord:<symbol>                e.g. chord:g, chord:am7
 *   chord-change:<a>-<b>          e.g. chord-change:g-c
 *   song:<id>, theory:<unit>:<lesson>
 *   teacher:<mia|dev|elena>:<lesson>, and teacher:<id>:course once the whole course is done
 *   fretboard:string-<1..6>       completed when every note on that string is learned
 */
import { ACHIEVEMENT_GEMS } from './catalog';
import { levelForXp } from './levels';
import type { AchievementTier, ProgressState, TeacherId } from './types';

/** What the skill registry adds up to, computed in one pass. */
export interface SkillSummary {
  /** Scale patterns with at least one crown. */
  scalesLearned: number;
  /** Scale patterns with three crowns or more. */
  scalesSolid: number;
  /** Crowns over all skills. */
  crowns: number;
  /** Highest crown level of any skill. */
  maxMastery: number;
  /** Most boxes (of five) with a crown inside one pentatonic scale. */
  pentatonicBoxes: number;
  /** Most boxes with three crowns inside one pentatonic scale. */
  pentatonicBoxesSolid: number;
  /** Strings whose notes are all learned. */
  stringsLearned: number;
  chordsLearned: number;
  /** Chord changes with two crowns or more. */
  chordChangesSolid: number;
  songsCompleted: number;
  songsThreeStars: number;
  /** Distinct theory lessons completed. */
  theoryLessons: number;
  /** Stars over all skills. */
  stars: number;
  /** Skills with three stars. */
  threeStarSkills: number;
  teacherCourse: Record<TeacherId, boolean>;
}

const PENTATONIC_BOX = /^scale:([^:]*pentatonic[^:]*):box-([1-5])$/;
const STRING_SKILL = /^fretboard:string-[1-9]$/;
const TEACHER_COURSE = /^teacher:(mia|dev|elena):course$/;

/** Summarise the skill registry for achievement conditions. */
export function summariseSkills(skills: ProgressState['skills']): SkillSummary {
  const out: SkillSummary = {
    scalesLearned: 0,
    scalesSolid: 0,
    crowns: 0,
    maxMastery: 0,
    pentatonicBoxes: 0,
    pentatonicBoxesSolid: 0,
    stringsLearned: 0,
    chordsLearned: 0,
    chordChangesSolid: 0,
    songsCompleted: 0,
    songsThreeStars: 0,
    theoryLessons: 0,
    stars: 0,
    threeStarSkills: 0,
    teacherCourse: { mia: false, dev: false, elena: false },
  };
  const boxes = new Map<string, number>();
  const solidBoxes = new Map<string, number>();
  for (const id in skills) {
    const skill = skills[id];
    out.crowns += skill.mastery;
    out.stars += skill.stars;
    if (skill.mastery > out.maxMastery) out.maxMastery = skill.mastery;
    if (skill.stars >= 3) out.threeStarSkills++;
    if (id.startsWith('scale:')) {
      if (skill.mastery >= 1) out.scalesLearned++;
      if (skill.mastery >= 3) out.scalesSolid++;
      const box = PENTATONIC_BOX.exec(id);
      if (box) {
        if (skill.mastery >= 1) boxes.set(box[1], (boxes.get(box[1]) ?? 0) + 1);
        if (skill.mastery >= 3) solidBoxes.set(box[1], (solidBoxes.get(box[1]) ?? 0) + 1);
      }
    } else if (id.startsWith('chord:')) {
      if (skill.completed) out.chordsLearned++;
    } else if (id.startsWith('chord-change:')) {
      if (skill.mastery >= 2) out.chordChangesSolid++;
    } else if (id.startsWith('song:')) {
      if (skill.completed) out.songsCompleted++;
      if (skill.stars >= 3) out.songsThreeStars++;
    } else if (id.startsWith('theory:')) {
      if (skill.completed) out.theoryLessons++;
    } else if (id.startsWith('fretboard:')) {
      if (skill.completed && STRING_SKILL.test(id)) out.stringsLearned++;
    } else if (id.startsWith('teacher:')) {
      const course = TEACHER_COURSE.exec(id);
      if (course && skill.completed) out.teacherCourse[course[1] as TeacherId] = true;
    }
  }
  for (const n of boxes.values()) out.pentatonicBoxes = Math.max(out.pentatonicBoxes, n);
  for (const n of solidBoxes.values()) out.pentatonicBoxesSolid = Math.max(out.pentatonicBoxesSolid, n);
  return out;
}

/** What a condition can read. */
export interface AchievementCtx {
  state: ProgressState;
  /** A lifetime counter, 0 when absent. */
  stat: (key: string) => number;
  level: number;
  skills: SkillSummary;
}

/** Build the evaluation context for a state. */
export function achievementCtx(state: ProgressState): AchievementCtx {
  const stats = state.stats;
  return {
    state,
    stat: (key) => stats[key] ?? 0,
    level: levelForXp(state.xp.total),
    skills: summariseSkills(state.skills),
  };
}

/** Sections of the achievements screen. */
export type AchievementGroup = 'first-steps' | 'habit' | 'growth' | 'scales' | 'games' | 'fretboard' | 'chords' | 'songs' | 'theory' | 'teachers' | 'practice' | 'quests' | 'secret';

/** A catalog entry. */
export interface AchievementDef {
  id: string;
  name: string;
  /** What to do, written so it also works as the hint for a locked achievement. */
  description: string;
  /** lucide icon name. */
  icon: string;
  tier: AchievementTier;
  /** Hidden until unlocked. */
  secret: boolean;
  group: AchievementGroup;
  target: number;
  /** The learner's current number toward `target`. */
  value: (ctx: AchievementCtx) => number;
}

type Def = Omit<AchievementDef, 'secret'> & { secret?: boolean };
const HOUR = 3600;

const DEFS: Def[] = [
  // First steps: one of everything the app can do.
  { id: 'first-tune', name: 'In Tune', description: 'Tune your guitar with the tuner.', icon: 'Gauge', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.tuner') },
  { id: 'first-lesson', name: 'First Steps', description: 'Finish your first theory lesson.', icon: 'Footprints', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.theory-lesson') },
  { id: 'first-song', name: 'Opening Number', description: 'Play a song from start to finish.', icon: 'Music', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.song') },
  { id: 'first-game', name: 'Player One', description: 'Finish a round in the Scale Arcade.', icon: 'Gamepad2', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.scale-game') },
  { id: 'first-camera', name: 'Eyes on the Neck', description: 'Use the live fretboard camera.', icon: 'ScanEye', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.camera') },
  { id: 'first-scan', name: 'Paper to Practice', description: 'Scan or import your first sheet.', icon: 'ScanLine', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.scan') },
  { id: 'first-metronome', name: 'Tick Tock', description: 'Practise with the metronome.', icon: 'Timer', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.metronome') },
  { id: 'first-review', name: 'Second Look', description: 'Finish a review session.', icon: 'Brain', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.review') },
  { id: 'first-ear', name: 'Open Ears', description: 'Finish an ear training round.', icon: 'Ear', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.ear') },
  { id: 'first-rhythm', name: 'In the Pocket', description: 'Finish a rhythm drill.', icon: 'Drum', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.rhythm') },
  { id: 'first-technique', name: 'Warm Hands', description: 'Finish a technique exercise.', icon: 'Hand', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.technique') },
  { id: 'first-progression', name: 'Jam Session', description: 'Play over a chord progression.', icon: 'ListMusic', tier: 'bronze', group: 'first-steps', target: 1, value: (c) => c.stat('count.progression') },

  // Habit: streaks and daily goals.
  { id: 'streak-3', name: 'Three in a Row', description: 'Reach a 3-day streak.', icon: 'Flame', tier: 'bronze', group: 'habit', target: 3, value: (c) => c.state.streak.longest },
  { id: 'streak-7', name: 'A Full Week', description: 'Reach a 7-day streak.', icon: 'Flame', tier: 'bronze', group: 'habit', target: 7, value: (c) => c.state.streak.longest },
  { id: 'streak-14', name: 'Fortnight', description: 'Reach a 14-day streak.', icon: 'Flame', tier: 'silver', group: 'habit', target: 14, value: (c) => c.state.streak.longest },
  { id: 'streak-30', name: 'Monthly Regular', description: 'Reach a 30-day streak.', icon: 'Flame', tier: 'silver', group: 'habit', target: 30, value: (c) => c.state.streak.longest },
  { id: 'streak-50', name: 'Fifty Days', description: 'Reach a 50-day streak.', icon: 'Flame', tier: 'gold', group: 'habit', target: 50, value: (c) => c.state.streak.longest },
  { id: 'streak-100', name: 'Century', description: 'Reach a 100-day streak.', icon: 'Flame', tier: 'gold', group: 'habit', target: 100, value: (c) => c.state.streak.longest },
  { id: 'streak-200', name: 'Two Hundred Days', description: 'Reach a 200-day streak.', icon: 'Flame', tier: 'platinum', group: 'habit', target: 200, value: (c) => c.state.streak.longest },
  { id: 'streak-365', name: 'A Year of Guitar', description: 'Reach a 365-day streak.', icon: 'Trophy', tier: 'platinum', group: 'habit', target: 365, value: (c) => c.state.streak.longest },
  { id: 'goal-1', name: 'Day One', description: 'Meet your daily goal.', icon: 'Target', tier: 'bronze', group: 'habit', target: 1, value: (c) => c.stat('goal.days') },
  { id: 'goal-30', name: 'Habit Formed', description: 'Meet your daily goal on 30 days.', icon: 'Target', tier: 'silver', group: 'habit', target: 30, value: (c) => c.stat('goal.days') },
  { id: 'goal-100', name: 'Hundred Good Days', description: 'Meet your daily goal on 100 days.', icon: 'Target', tier: 'gold', group: 'habit', target: 100, value: (c) => c.stat('goal.days') },
  { id: 'overachiever', name: 'Overachiever', description: 'Earn twice your daily goal in one day.', icon: 'ChevronsUp', tier: 'silver', group: 'habit', target: 200, value: (c) => c.stat('max.goalPct') },

  // Growth: XP and levels.
  { id: 'xp-100', name: 'Warming Up', description: 'Earn 100 XP.', icon: 'Zap', tier: 'bronze', group: 'growth', target: 100, value: (c) => c.state.xp.total },
  { id: 'xp-500', name: 'Finding the Groove', description: 'Earn 500 XP.', icon: 'Zap', tier: 'bronze', group: 'growth', target: 500, value: (c) => c.state.xp.total },
  { id: 'xp-1000', name: 'Four Figures', description: 'Earn 1,000 XP.', icon: 'Zap', tier: 'silver', group: 'growth', target: 1000, value: (c) => c.state.xp.total },
  { id: 'xp-5000', name: 'Five Thousand', description: 'Earn 5,000 XP.', icon: 'Zap', tier: 'gold', group: 'growth', target: 5000, value: (c) => c.state.xp.total },
  { id: 'xp-10000', name: 'Ten Thousand', description: 'Earn 10,000 XP.', icon: 'Zap', tier: 'gold', group: 'growth', target: 10000, value: (c) => c.state.xp.total },
  { id: 'xp-25000', name: 'Twenty-Five Thousand', description: 'Earn 25,000 XP.', icon: 'Zap', tier: 'platinum', group: 'growth', target: 25000, value: (c) => c.state.xp.total },
  { id: 'level-5', name: 'Campfire Ready', description: 'Reach level 5.', icon: 'Tent', tier: 'bronze', group: 'growth', target: 5, value: (c) => c.level },
  { id: 'level-10', name: 'Double Digits', description: 'Reach level 10.', icon: 'TrendingUp', tier: 'silver', group: 'growth', target: 10, value: (c) => c.level },
  { id: 'level-25', name: 'Ready for the Stage', description: 'Reach level 25.', icon: 'MicVocal', tier: 'gold', group: 'growth', target: 25, value: (c) => c.level },
  { id: 'level-50', name: 'The Long Road', description: 'Reach level 50.', icon: 'Mountain', tier: 'platinum', group: 'growth', target: 50, value: (c) => c.level },
  { id: 'gems-500', name: 'Gem Collector', description: 'Earn 500 gems.', icon: 'Gem', tier: 'silver', group: 'growth', target: 500, value: (c) => c.state.gems.earned },
  { id: 'cosmetic-1', name: 'New Look', description: 'Unlock a fretboard wood, inlay or accent theme.', icon: 'Palette', tier: 'bronze', group: 'growth', target: 1, value: (c) => c.stat('cosmetics.bought') },

  // Scales and crowns.
  { id: 'scale-first', name: 'First Pattern', description: 'Earn a crown on a scale pattern.', icon: 'Waypoints', tier: 'bronze', group: 'scales', target: 1, value: (c) => c.skills.scalesLearned },
  { id: 'scales-solid-5', name: 'Scale Scholar', description: 'Reach 3 crowns on 5 scale patterns.', icon: 'Waypoints', tier: 'silver', group: 'scales', target: 5, value: (c) => c.skills.scalesSolid },
  { id: 'scales-solid-15', name: 'Scale Sage', description: 'Reach 3 crowns on 15 scale patterns.', icon: 'Waypoints', tier: 'gold', group: 'scales', target: 15, value: (c) => c.skills.scalesSolid },
  { id: 'pentatonic-boxes', name: 'Five Boxes', description: 'Earn a crown on all five boxes of one pentatonic scale.', icon: 'Boxes', tier: 'silver', group: 'scales', target: 5, value: (c) => c.skills.pentatonicBoxes },
  { id: 'pentatonic-solid', name: 'One Neck', description: 'Reach 3 crowns on all five boxes of one pentatonic scale.', icon: 'Boxes', tier: 'gold', group: 'scales', target: 5, value: (c) => c.skills.pentatonicBoxesSolid },
  { id: 'crown-5', name: 'Crowned', description: 'Reach 5 crowns on any skill.', icon: 'Crown', tier: 'gold', group: 'scales', target: 5, value: (c) => c.skills.maxMastery },
  { id: 'crowns-25', name: 'Crown Collector', description: 'Collect 25 crowns in total.', icon: 'Crown', tier: 'silver', group: 'scales', target: 25, value: (c) => c.skills.crowns },
  { id: 'crowns-100', name: 'Crown Jewels', description: 'Collect 100 crowns in total.', icon: 'Crown', tier: 'gold', group: 'scales', target: 100, value: (c) => c.skills.crowns },

  // Games: stars and combos.
  { id: 'three-stars', name: 'Flawless Round', description: 'Earn three stars on a game level.', icon: 'Sparkles', tier: 'bronze', group: 'games', target: 1, value: (c) => c.skills.threeStarSkills },
  { id: 'stars-10', name: 'Star Catcher', description: 'Collect 10 stars.', icon: 'Star', tier: 'bronze', group: 'games', target: 10, value: (c) => c.skills.stars },
  { id: 'stars-50', name: 'Constellation', description: 'Collect 50 stars.', icon: 'Star', tier: 'silver', group: 'games', target: 50, value: (c) => c.skills.stars },
  { id: 'stars-150', name: 'Galaxy', description: 'Collect 150 stars.', icon: 'Star', tier: 'gold', group: 'games', target: 150, value: (c) => c.skills.stars },
  { id: 'combo-10', name: 'On a Roll', description: 'Keep a combo of 10.', icon: 'Flame', tier: 'bronze', group: 'games', target: 10, value: (c) => c.stat('max.combo') },
  { id: 'combo-25', name: 'Unbroken', description: 'Keep a combo of 25.', icon: 'Flame', tier: 'silver', group: 'games', target: 25, value: (c) => c.stat('max.combo') },
  { id: 'combo-50', name: 'Unstoppable', description: 'Keep a combo of 50.', icon: 'Flame', tier: 'gold', group: 'games', target: 50, value: (c) => c.stat('max.combo') },

  // Fretboard knowledge.
  { id: 'string-1', name: 'One String Down', description: 'Learn every note on one string.', icon: 'Rows4', tier: 'bronze', group: 'fretboard', target: 1, value: (c) => c.skills.stringsLearned },
  { id: 'strings-6', name: 'Whole Neck', description: 'Learn every note on all six strings.', icon: 'Map', tier: 'gold', group: 'fretboard', target: 6, value: (c) => c.skills.stringsLearned },
  { id: 'notes-100', name: 'Note Spotter', description: 'Name 100 notes on the fretboard.', icon: 'Search', tier: 'bronze', group: 'fretboard', target: 100, value: (c) => c.stat('fretboard.notes') },
  { id: 'notes-1000', name: 'Note Machine', description: 'Name 1,000 notes on the fretboard.', icon: 'Search', tier: 'silver', group: 'fretboard', target: 1000, value: (c) => c.stat('fretboard.notes') },

  // Chords.
  { id: 'chords-1', name: 'Hello, Chord', description: 'Learn your first chord.', icon: 'Grid3x3', tier: 'bronze', group: 'chords', target: 1, value: (c) => c.skills.chordsLearned },
  { id: 'chords-5', name: 'Handful of Chords', description: 'Learn 5 chords.', icon: 'Grid3x3', tier: 'bronze', group: 'chords', target: 5, value: (c) => c.skills.chordsLearned },
  { id: 'chords-15', name: 'Chord Vocabulary', description: 'Learn 15 chords.', icon: 'Grid3x3', tier: 'silver', group: 'chords', target: 15, value: (c) => c.skills.chordsLearned },
  { id: 'chords-30', name: 'Chord Dictionary', description: 'Learn 30 chords.', icon: 'Grid3x3', tier: 'gold', group: 'chords', target: 30, value: (c) => c.skills.chordsLearned },
  { id: 'changes-solid-5', name: 'Smooth Operator', description: 'Reach 2 crowns on 5 chord changes.', icon: 'Repeat', tier: 'silver', group: 'chords', target: 5, value: (c) => c.skills.chordChangesSolid },
  { id: 'changes-500', name: 'Quick Change', description: 'Make 500 chord changes in the trainer.', icon: 'Repeat', tier: 'silver', group: 'chords', target: 500, value: (c) => c.stat('chord.changes') },

  // Songs.
  { id: 'songs-5', name: 'Set List', description: 'Play 5 different songs through.', icon: 'ListMusic', tier: 'silver', group: 'songs', target: 5, value: (c) => c.skills.songsCompleted },
  { id: 'songs-15', name: 'Repertoire', description: 'Play 15 different songs through.', icon: 'Library', tier: 'gold', group: 'songs', target: 15, value: (c) => c.skills.songsCompleted },
  { id: 'song-plays-50', name: 'Road Worn', description: 'Play songs through 50 times.', icon: 'Disc3', tier: 'gold', group: 'songs', target: 50, value: (c) => c.stat('count.song') },
  { id: 'song-3-stars', name: 'Encore', description: 'Earn three stars on a song.', icon: 'Sparkles', tier: 'silver', group: 'songs', target: 1, value: (c) => c.skills.songsThreeStars },

  // Theory and memory.
  { id: 'theory-10', name: 'Theory Starter', description: 'Finish 10 theory lessons.', icon: 'BookOpen', tier: 'bronze', group: 'theory', target: 10, value: (c) => c.stat('count.theory-lesson') },
  { id: 'theory-50', name: 'Theory Buff', description: 'Finish 50 theory lessons.', icon: 'BookOpen', tier: 'silver', group: 'theory', target: 50, value: (c) => c.stat('count.theory-lesson') },
  { id: 'theory-100', name: 'Theory Scholar', description: 'Finish 100 theory lessons.', icon: 'BookOpen', tier: 'gold', group: 'theory', target: 100, value: (c) => c.stat('count.theory-lesson') },
  { id: 'perfect-1', name: 'No Mistakes', description: 'Finish a lesson without a single mistake.', icon: 'CircleCheck', tier: 'bronze', group: 'theory', target: 1, value: (c) => c.stat('lessons.perfect') },
  { id: 'perfect-10', name: 'Sharp Mind', description: 'Finish 10 lessons without a mistake.', icon: 'CircleCheck', tier: 'silver', group: 'theory', target: 10, value: (c) => c.stat('lessons.perfect') },
  { id: 'perfect-50', name: 'Perfectionist', description: 'Finish 50 lessons without a mistake.', icon: 'CircleCheck', tier: 'gold', group: 'theory', target: 50, value: (c) => c.stat('lessons.perfect') },
  { id: 'reviews-100', name: 'Flash Recall', description: 'Review 100 cards.', icon: 'Brain', tier: 'bronze', group: 'theory', target: 100, value: (c) => c.stat('srs.reviews') },
  { id: 'reviews-1000', name: 'Long Memory', description: 'Review 1,000 cards.', icon: 'Brain', tier: 'gold', group: 'theory', target: 1000, value: (c) => c.stat('srs.reviews') },

  // Teachers.
  { id: 'mia-1', name: 'Meet Mia', description: 'Finish your first lesson with Mia.', icon: 'GraduationCap', tier: 'bronze', group: 'teachers', target: 1, value: (c) => c.stat('teacher.mia') },
  { id: 'mia-10', name: 'Mia’s Regular', description: 'Finish 10 lessons with Mia.', icon: 'GraduationCap', tier: 'silver', group: 'teachers', target: 10, value: (c) => c.stat('teacher.mia') },
  { id: 'mia-course', name: 'Mia’s Graduate', description: 'Complete Mia’s whole course.', icon: 'Award', tier: 'gold', group: 'teachers', target: 1, value: (c) => (c.skills.teacherCourse.mia ? 1 : 0) },
  { id: 'dev-1', name: 'Meet Dev', description: 'Finish your first lesson with Dev.', icon: 'GraduationCap', tier: 'bronze', group: 'teachers', target: 1, value: (c) => c.stat('teacher.dev') },
  { id: 'dev-10', name: 'Dev’s Bandmate', description: 'Finish 10 lessons with Dev.', icon: 'GraduationCap', tier: 'silver', group: 'teachers', target: 10, value: (c) => c.stat('teacher.dev') },
  { id: 'dev-course', name: 'Dev’s Graduate', description: 'Complete Dev’s whole course.', icon: 'Award', tier: 'gold', group: 'teachers', target: 1, value: (c) => (c.skills.teacherCourse.dev ? 1 : 0) },
  { id: 'elena-1', name: 'Meet Elena', description: 'Finish your first lesson with Elena.', icon: 'GraduationCap', tier: 'bronze', group: 'teachers', target: 1, value: (c) => c.stat('teacher.elena') },
  { id: 'elena-10', name: 'Elena’s Student', description: 'Finish 10 lessons with Elena.', icon: 'GraduationCap', tier: 'silver', group: 'teachers', target: 10, value: (c) => c.stat('teacher.elena') },
  { id: 'elena-course', name: 'Elena’s Graduate', description: 'Complete Elena’s whole course.', icon: 'Award', tier: 'platinum', group: 'teachers', target: 1, value: (c) => (c.skills.teacherCourse.elena ? 1 : 0) },

  // Practice volume.
  { id: 'time-1h', name: 'First Hour', description: 'Practise for one hour in total.', icon: 'Clock', tier: 'bronze', group: 'practice', target: HOUR, value: (c) => c.stat('time.total') },
  { id: 'time-10h', name: 'Ten Hours In', description: 'Practise for 10 hours in total.', icon: 'Clock', tier: 'silver', group: 'practice', target: 10 * HOUR, value: (c) => c.stat('time.total') },
  { id: 'time-50h', name: 'Fifty Hours', description: 'Practise for 50 hours in total.', icon: 'Clock', tier: 'gold', group: 'practice', target: 50 * HOUR, value: (c) => c.stat('time.total') },
  { id: 'time-100h', name: 'Hundred Hours', description: 'Practise for 100 hours in total.', icon: 'Hourglass', tier: 'platinum', group: 'practice', target: 100 * HOUR, value: (c) => c.stat('time.total') },
  { id: 'marathon', name: 'Marathon', description: 'Practise for an hour in one day.', icon: 'Hourglass', tier: 'silver', group: 'practice', target: HOUR, value: (c) => c.stat('max.daySec') },
  { id: 'well-rounded', name: 'Well Rounded', description: 'Do five different kinds of practice in one day.', icon: 'Shapes', tier: 'silver', group: 'practice', target: 5, value: (c) => c.stat('max.dayKinds') },
  { id: 'tune-25', name: 'Always in Tune', description: 'Tune up 25 times.', icon: 'Gauge', tier: 'silver', group: 'practice', target: 25, value: (c) => c.stat('count.tuner') },
  { id: 'scan-10', name: 'Librarian', description: 'Scan or import 10 sheets.', icon: 'Library', tier: 'silver', group: 'practice', target: 10, value: (c) => c.stat('count.scan') },
  { id: 'ear-25', name: 'Golden Ears', description: 'Finish 25 ear training rounds.', icon: 'Ear', tier: 'silver', group: 'practice', target: 25, value: (c) => c.stat('count.ear') },
  { id: 'rhythm-25', name: 'Human Metronome', description: 'Finish 25 rhythm drills.', icon: 'Drum', tier: 'silver', group: 'practice', target: 25, value: (c) => c.stat('count.rhythm') },
  { id: 'technique-25', name: 'Iron Fingers', description: 'Finish 25 technique exercises.', icon: 'Dumbbell', tier: 'silver', group: 'practice', target: 25, value: (c) => c.stat('count.technique') },

  // Quests.
  { id: 'quests-10', name: 'Quest Taker', description: 'Complete 10 daily quests.', icon: 'ClipboardCheck', tier: 'bronze', group: 'quests', target: 10, value: (c) => c.stat('quests.daily') },
  { id: 'quests-50', name: 'Quest Regular', description: 'Complete 50 daily quests.', icon: 'ClipboardCheck', tier: 'silver', group: 'quests', target: 50, value: (c) => c.stat('quests.daily') },
  { id: 'quests-200', name: 'Quest Veteran', description: 'Complete 200 daily quests.', icon: 'ClipboardCheck', tier: 'gold', group: 'quests', target: 200, value: (c) => c.stat('quests.daily') },
  { id: 'sweep-1', name: 'Clean Sweep', description: 'Finish all three daily quests in one day.', icon: 'ListChecks', tier: 'bronze', group: 'quests', target: 1, value: (c) => c.stat('quests.sweeps') },
  { id: 'weekly-1', name: 'Week Won', description: 'Complete a weekly challenge.', icon: 'CalendarCheck', tier: 'bronze', group: 'quests', target: 1, value: (c) => c.stat('quests.weekly') },
  { id: 'weekly-10', name: 'Ten Good Weeks', description: 'Complete 10 weekly challenges.', icon: 'CalendarCheck', tier: 'gold', group: 'quests', target: 10, value: (c) => c.stat('quests.weekly') },

  // Secret: found by living with the app.
  { id: 'night-owl', name: 'Night Owl', description: 'Practise after ten at night.', icon: 'MoonStar', tier: 'bronze', group: 'secret', secret: true, target: 1, value: (c) => c.stat('time.night') },
  { id: 'early-bird', name: 'Early Bird', description: 'Practise before eight in the morning.', icon: 'Sunrise', tier: 'bronze', group: 'secret', secret: true, target: 1, value: (c) => c.stat('time.early') },
  { id: 'weekend', name: 'Weekend Warrior', description: 'Practise on a Saturday and on the Sunday after it.', icon: 'CalendarDays', tier: 'bronze', group: 'secret', secret: true, target: 1, value: (c) => c.stat('weekends') },
  { id: 'comeback', name: 'Welcome Back', description: 'Come back to practise after a week away.', icon: 'Undo2', tier: 'bronze', group: 'secret', secret: true, target: 1, value: (c) => c.stat('comebacks') },
  { id: 'freeze-used', name: 'Saved by the Freeze', description: 'Have a streak freeze cover a missed day.', icon: 'Snowflake', tier: 'bronze', group: 'secret', secret: true, target: 1, value: (c) => c.stat('freezes.used') },
];

/** The achievement catalog. */
export const ACHIEVEMENTS: readonly AchievementDef[] = DEFS.map((d) => ({ ...d, secret: d.secret === true }));

/** Achievements by id. */
export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Locked achievements whose condition now holds. */
export function newlyEarned(state: ProgressState): AchievementDef[] {
  let ctx: AchievementCtx | null = null;
  const out: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (state.achievements[def.id]) continue;
    ctx ??= achievementCtx(state);
    if (def.value(ctx) >= def.target) out.push(def);
  }
  return out;
}

/** An achievement with the learner's standing, ready to render. */
export interface AchievementView {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  group: AchievementGroup;
  gems: number;
  unlocked: boolean;
  /** When it was unlocked (epoch ms), or null. */
  at: number | null;
  /** True for a secret achievement that is still locked: show a placeholder, not the texts. */
  hidden: boolean;
  /** Current number, capped at the target. */
  value: number;
  target: number;
  fraction: number;
}

/** The whole catalog with unlock state and progress, in catalog order. */
export function achievementViews(state: ProgressState): AchievementView[] {
  const ctx = achievementCtx(state);
  return ACHIEVEMENTS.map((def) => {
    const unlock = state.achievements[def.id];
    const raw = unlock ? def.target : Math.max(0, Math.min(def.target, def.value(ctx)));
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      tier: def.tier,
      group: def.group,
      gems: ACHIEVEMENT_GEMS[def.tier],
      unlocked: !!unlock,
      at: unlock ? unlock.at : null,
      hidden: def.secret && !unlock,
      value: raw,
      target: def.target,
      fraction: def.target > 0 ? raw / def.target : 1,
    };
  });
}
