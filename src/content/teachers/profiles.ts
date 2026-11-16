/**
 * The three teachers as people: what the shell's `@/app/teachers` card does not hold (who they
 * are, what they teach and for whom, lines in their own voice for the lesson screens). Names,
 * levels and the welcome line stay in `@/app/teachers` so they read the same everywhere.
 *
 * Voices (from the build brief): Mia is patient, encouraging and concrete, one idea at a time, no
 * jargon before it is taught. Dev is a bandmate who ties every idea to something you can play
 * tonight. Elena has conservatory rigour, dry humour, high standards and deep respect for the student.
 * They are fictional.
 */
import type { CourseLevel } from '@/lessons';
import type { TeacherKey } from './types';

/** A teacher, as the teachers screen and the lesson player present them. */
export interface TeacherProfile {
  id: TeacherKey;
  /** The course's title (the plan's) and a one-line description (at most 160 characters). */
  courseTitle: string;
  courseDescription: string;
  level: CourseLevel;
  /** Who they are, in two sentences. */
  bio: string;
  /** Three or four things the course teaches, as short phrases. */
  teaches: readonly string[];
  /** Who the course is for, one sentence. */
  forWho: string;
  /** A line in their voice, shown and read aloud on request. */
  sample: string;
  /** Short reactions after an answer, in their voice (one is picked; the explanation follows). */
  reactions: { right: readonly string[]; wrong: readonly string[]; skipped: readonly string[] };
  /** On coming back from a task: when the work was seen, and when it was not. */
  taskBack: { done: readonly string[]; unsure: string };
  /** Said before the performance that ends a unit. */
  performance: string;
  /** Said when a course has no written lessons yet. */
  preparing: string;
}

/** The profiles, beginner to expert. */
export const PROFILES: Record<TeacherKey, TeacherProfile> = {
  mia: {
    id: 'mia',
    courseTitle: 'First Steps with Mia',
    courseDescription: 'From the first open string to your first songs, chords, strumming and a first solo, one small step at a time.',
    level: 'beginner',
    bio: 'Mia has taught beginners for twelve years, in libraries, schools and her own front room. She believes anyone can play, and that the secret is small steps you can feel working.',
    teaches: ['Holding, tuning and playing clean notes', 'Your first chords and strumming patterns', 'Melodies from tab, riffs and the blues', 'A first scale and your first solo'],
    forWho: 'For you if you have never played, or tried once and gave up.',
    sample: 'Today you only need to make one clear note, and I will show you exactly how. If it buzzes, that is fine. We fix it together.',
    reactions: {
      right: ['That is it.', 'Exactly right.', 'Yes, well done.', 'Lovely. You have got it.', 'Spot on.'],
      wrong: ['Nearly. Here is the thing to notice.', 'Not this time, and that is fine. Look:', 'Close. Let me show you.', 'Good try. Here is how it works.'],
      skipped: ['No problem. Here is the answer, and it will come back in a moment.', 'That is what I am here for. Have a look:'],
    },
    taskBack: {
      done: ['Welcome back. I saw that, and it counts.', 'You did it. That is real playing.', 'Nicely done. Let us carry on.'],
      unsure: 'Welcome back. Did you get to do it? Either way is fine: you can carry on, or go and have another go.',
    },
    performance: 'This is your show. Count yourself in, play it start to finish, and keep going through any mistake.',
    preparing: 'My lessons are being written right now. Until they are ready, start with the Theory Path or tune up and play a song.',
  },
  dev: {
    id: 'dev',
    courseTitle: 'The Whole Neck with Dev',
    courseDescription: 'Barre chords, CAGED, all five pentatonic boxes, the blues, rhythm in every style and improvising with intent: the whole neck.',
    level: 'intermediate',
    bio: 'Dev has played in function bands, blues trios and pit orchestras, and teaches between gigs. He has never met a theory idea he could not turn into a lick.',
    teaches: ['Barre chords and CAGED all over the neck', 'The five pentatonic boxes, bends and vibrato', 'Rhythm guitar in rock, funk, reggae and swing', 'Improvising over the changes'],
    forWho: 'For you if you know your open chords and want the rest of the neck.',
    sample: 'Here is the deal: every shape I show you, you use in a song tonight. Theory is just the map. The music is the trip.',
    reactions: {
      right: ['Nailed it.', 'Yes. That is the one.', 'Clean.', 'There it is.', 'Locked in.'],
      wrong: ['Not quite. Check this out.', 'Close, but here is the trick.', 'Happens to everyone. Look:', 'Almost. Here is what is going on.'],
      skipped: ['All good. Here is the answer; it will come round again.', 'No sweat. Have a look:'],
    },
    taskBack: {
      done: ['Back already? I saw that. Nice work.', 'That is the stuff. On we go.', 'Sounded good from here.'],
      unsure: 'Hey, you are back. Did you get a run at it? Keep going, or jump back in for another take.',
    },
    performance: 'Gig time. Count it in, play it through, and if you drop a note, land on the next beat like nothing happened.',
    preparing: "My lessons are still in the workshop. Meanwhile, Mia's course and the Theory Path will keep your hands busy.",
  },
  elena: {
    id: 'elena',
    courseTitle: 'Mastery with Prof. Elena Varga',
    courseDescription: 'Modes, jazz harmony, chord melody, advanced picking and classical repertoire, sight-reading, composition and performance.',
    level: 'expert',
    bio: 'Professor Varga trained in Budapest and Madrid and has taught at the conservatory for twenty-five years. She expects a great deal, and gives more.',
    teaches: ['The modes, jazz harmony and voice leading', 'Advanced picking, legato and classical technique', 'Sight-reading, transcription and arranging', 'Composition and performance'],
    forWho: 'For you if you play well and want to play beautifully, with reasons.',
    sample: 'I will assume you can play, and ask you to play better. Precision first; speed is merely precision repeated.',
    reactions: {
      right: ['Correct.', 'Precisely.', 'Good. As expected.', 'Yes. Well reasoned.', 'Exactly so.'],
      wrong: ['No. Consider this:', 'Not quite. The reason matters:', 'An understandable error. Observe:', 'Incorrect, but instructive.'],
      skipped: ['Honest. Here is the answer; we will return to it.', 'Admitting it is the first step. Observe:'],
    },
    taskBack: {
      done: ['Recorded. Good.', 'You returned with evidence. I approve.', 'Satisfactory. We continue.'],
      unsure: 'You are back. If the work is done, continue; if not, return to it. I will not check, but your hands will know.',
    },
    performance: 'A performance, however small, deserves preparation. Breathe, count in, and do not stop for anything.',
    preparing: "My course is in preparation. Use the time well: the Theory Path's expert stage is a fine place to begin.",
  },
};

/** A teacher's profile (Mia for an unknown id). */
export function profileOf(id: string): TeacherProfile {
  return (PROFILES as Record<string, TeacherProfile>)[id] ?? PROFILES.mia;
}

/** A line from a list, chosen by a number (stable for one answer, varied across answers). */
export function pickLine(lines: readonly string[], seed: number): string {
  if (lines.length === 0) return '';
  return lines[((Math.floor(seed) % lines.length) + lines.length) % lines.length];
}
