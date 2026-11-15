/**
 * What a hub features on top: up to three suggestions drawn from what the learner did last, what
 * today's quests ask for, and what suits their level. Pure, so it can be tested without a store.
 */
import { ACTIVITY_KINDS, type ExperienceLevel, type QuestView, type RecentItem, type TeacherId } from '@/core/progress';
import { ROUTE_BY_NAME, type Section } from '../routes';
import { teacherById } from '../teachers';

/** One featured card. */
export interface Recommendation {
  /** Stable key for React. */
  key: string;
  route: string;
  params: string[];
  /** Why it is here, in a few words ("Pick up where you left off"). */
  reason: string;
  title: string;
  detail: string;
  /** lucide icon name. */
  icon: string;
  /** 0 to 1 for something half done. */
  progress?: number;
}

/** What the recommendations are computed from. */
export interface RecommendContext {
  experience: ExperienceLevel;
  teacher: TeacherId;
  /** Newest first, as the store keeps them. */
  recents: readonly RecentItem[];
  /** Today's daily quests. */
  quests: readonly QuestView[];
  /** Review cards due now. */
  dueReviews: number;
  /** The tuner was used today. */
  tunedToday: boolean;
}

interface Pick {
  route: string;
  title: string;
  detail: string;
}

/** Level-appropriate starting points per section, best first. */
export const LEVEL_PICKS: Readonly<Record<'learn' | 'play' | 'tools', Readonly<Record<ExperienceLevel, readonly Pick[]>>>> = {
  learn: {
    beginner: [
      { route: 'learn', title: 'Start the Theory Path', detail: 'How notes are named and where they live on the neck, two minutes at a time.' },
      { route: 'reference', title: 'Keep the glossary handy', detail: 'Any word you do not know yet, explained in one line.' },
    ],
    intermediate: [
      { route: 'learn', title: 'Fill the gaps on the Theory Path', detail: 'Intervals, keys and how chords are built, so the neck starts to make sense.' },
      { route: 'reference', title: 'Circle of fifths', detail: 'Every key, its chords and its relatives on one wheel.' },
    ],
    expert: [
      { route: 'learn', title: 'Test out of the Theory Path', detail: 'Skim what you know and slow down where the harmony gets interesting.' },
      { route: 'reference', title: 'Reference shelf', detail: 'Key signatures, modes and chord formulas when you need a fact fast.' },
    ],
  },
  play: {
    beginner: [
      { route: 'chords', title: 'Learn your first open chords', detail: 'Clean shapes first, then changing between them in time.' },
      { route: 'songs', title: 'Play your first song', detail: 'Slow it down, loop the hard bar, and let it wait for you.' },
      { route: 'rhythm', title: 'Find the beat', detail: 'Simple strumming patterns that make chords sound like music.' },
    ],
    intermediate: [
      { route: 'scales', title: 'Map the pentatonic boxes', detail: 'Five shapes that cover the whole neck, one at a time.' },
      { route: 'arcade', title: 'Drill a scale as a game', detail: 'Short rounds that get a shape into your fingers.' },
      { route: 'progressions', title: 'Jam over a backing band', detail: 'Pick a progression and try your scale against real chords.' },
    ],
    expert: [
      { route: 'ear', title: 'Sharpen your ear', detail: 'Intervals, chord qualities and melodies by ear.' },
      { route: 'technique', title: 'Run a tempo ladder', detail: 'One exercise, clean, a few clicks faster each pass.' },
      { route: 'progressions', title: 'Improvise over changes', detail: 'Pick a style, set the key, and play through the form.' },
    ],
  },
  tools: {
    beginner: [
      { route: 'metronome', title: 'Play with a click', detail: 'Start slow. Steady and slow beats fast and uneven.' },
      { route: 'camera', title: 'See the notes on your guitar', detail: 'Point the camera at the neck and the notes appear on your frets.' },
    ],
    intermediate: [
      { route: 'scan', title: 'Bring your own music', detail: 'Scan a printed sheet, a photo or a PDF and play along with it.' },
      { route: 'camera', title: 'Check a scale on your own neck', detail: 'The live fretboard draws the notes right on your frets.' },
    ],
    expert: [
      { route: 'scan', title: 'Import a score', detail: 'PDF, photo, MusicXML or a tab file, turned into a practice track.' },
      { route: 'metronome', title: 'Use the speed trainer', detail: 'Let the click climb a few beats per minute at a time.' },
    ],
  },
};

const MAX = 3;

function sectionOf(route: string): Section | null {
  return ROUTE_BY_NAME[route]?.section ?? null;
}

/** The suggestions for a hub, most relevant first. At most three, never the same screen twice. */
export function recommend(section: 'learn' | 'play' | 'tools', ctx: RecommendContext): Recommendation[] {
  const out: Recommendation[] = [];
  const used = new Set<string>();
  const add = (r: Recommendation): void => {
    const id = `${r.route}/${r.params.join('/')}`;
    if (out.length >= MAX || used.has(id) || !ROUTE_BY_NAME[r.route]) return;
    used.add(id);
    out.push(r);
  };
  // A screen that already has a card (itself or one of its sub-screens) gets no generic second one.
  const taken = (route: string): boolean => [...used].some((id) => id.startsWith(`${route}/`));

  // 1. Something left half done in this section.
  const inSection = ctx.recents.filter((r) => sectionOf(r.route) === section);
  const unfinished = inSection.find((r) => r.fraction > 0 && r.fraction < 1);
  if (unfinished) {
    const kind = ACTIVITY_KINDS[unfinished.kind];
    add({
      key: `continue:${unfinished.key}`,
      route: unfinished.route,
      params: unfinished.params,
      reason: 'Pick up where you left off',
      title: unfinished.title,
      detail: `${kind?.label ?? 'Activity'} · ${Math.round(unfinished.fraction * 100)}% done`,
      icon: kind?.icon ?? ROUTE_BY_NAME[unfinished.route]?.icon ?? 'History',
      progress: unfinished.fraction,
    });
  }

  // 2. The tuner comes before anything else that makes sound.
  if (section === 'tools' && !ctx.tunedToday) {
    add({ key: 'tune', route: 'tuner', params: [], reason: 'Before you play', title: 'Tune up', detail: 'Takes under a minute, and everything you play today sounds better for it.', icon: ROUTE_BY_NAME.tuner?.icon ?? 'Gauge' });
  }

  // 3. Cards that are due, and the learner's teacher.
  if (section === 'learn') {
    if (ctx.dueReviews > 0) {
      add({
        key: 'reviews',
        route: 'learn',
        params: [],
        reason: 'Due today',
        title: `Review ${ctx.dueReviews} ${ctx.dueReviews === 1 ? 'card' : 'cards'}`,
        detail: 'A couple of minutes now keeps what you learned from fading.',
        icon: 'Brain',
      });
    }
    const teacher = teacherById(ctx.teacher);
    add({ key: `teacher:${teacher.id}`, route: 'teachers', params: [teacher.id], reason: 'Your teacher', title: `Learn with ${teacher.name}`, detail: teacher.course, icon: ROUTE_BY_NAME.teachers?.icon ?? 'GraduationCap' });
  }

  // 4. A quest that lives in this section.
  const quest = ctx.quests.find((q) => !q.done && sectionOf(q.route) === section && !taken(q.route));
  if (quest) {
    add({
      key: `quest:${quest.id}`,
      route: quest.route,
      params: [],
      reason: "Today's quest",
      title: quest.title,
      detail: `${quest.hint} Worth ${quest.gems} gems.`,
      icon: quest.icon,
      progress: quest.progress > 0 ? quest.fraction : undefined,
    });
  }

  // 5. The last particular thing they finished here (a song, a lesson): worth another go.
  const again = inSection.find((r) => r.fraction >= 1 && r.params.length > 0);
  if (again) {
    const kind = ACTIVITY_KINDS[again.kind];
    add({
      key: `again:${again.key}`,
      route: again.route,
      params: again.params,
      reason: 'Go again',
      title: again.title,
      detail: `${kind?.label ?? 'Activity'} you finished. A second pass is where it settles.`,
      icon: kind?.icon ?? ROUTE_BY_NAME[again.route]?.icon ?? 'History',
    });
  }

  // 6. Good next steps for their level.
  for (const pick of LEVEL_PICKS[section][ctx.experience]) {
    if (taken(pick.route)) continue;
    add({ key: `pick:${pick.route}`, route: pick.route, params: [], reason: 'Good next step', title: pick.title, detail: pick.detail, icon: ROUTE_BY_NAME[pick.route]?.icon ?? 'Sparkles' });
  }
  return out;
}
