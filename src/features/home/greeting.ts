/**
 * The words at the top of Today: a greeting for the time of day and one line about where the
 * learner stands. Pure.
 */

/** "Good morning", "Good afternoon" or "Good evening" for an hour of the day (0 to 23). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting with the learner's name when they gave one. */
export function greetingLine(hour: number, name: string): string {
  const clean = name.trim();
  return clean ? `${greetingFor(hour)}, ${clean}` : greetingFor(hour);
}

/** What the line under the greeting is written from. */
export interface StandingInput {
  xp: number;
  goal: number;
  met: boolean;
  remaining: number;
  /** Current streak in days. */
  streak: number;
  /** The plan has steps left. */
  planLeft: number;
  /** Minutes the daily goal stands for. */
  goalMinutes: number;
}

/** One plain sentence about today: what is done and what is left. Never guilt, never urgency. */
export function standingLine(s: StandingInput): string {
  if (s.met) return s.planLeft > 0 ? 'Today’s goal is met. Anything you play from here is a bonus.' : 'Goal met and plan finished. That was a proper practice day.';
  if (s.xp > 0) return `${s.remaining} XP to go today. One more step from your plan will do it.`;
  if (s.streak > 0) return `Day ${s.streak + 1} of your streak starts whenever you are ready.`;
  return `About ${s.goalMinutes} minutes is all today needs. Start with the first step below.`;
}

/**
 * What the learner is set up as, for the "Make it yours" banner: read from their Settings
 * (handedness) and profile (level, teacher), so it never contradicts what they already chose.
 */
export function setupLine(s: { handedness: 'left' | 'right'; experience: 'beginner' | 'intermediate' | 'expert'; teacherName: string }): string {
  const hand = s.handedness === 'left' ? 'left-handed' : 'right-handed';
  const level = s.experience === 'expert' ? 'advanced player' : s.experience === 'intermediate' ? 'intermediate player' : 'beginner';
  return `You are set up as a ${hand} ${level} with ${s.teacherName}. Four quick questions and Today fits the way you play.`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'a month ago' : `${months} months ago`;
}
