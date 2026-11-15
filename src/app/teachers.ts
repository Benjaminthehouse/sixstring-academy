/**
 * The three teachers as the shell, onboarding and Today introduce them. Only names and a line of
 * welcome live here; their courses are authored content owned by the teachers feature.
 */
import type { ExperienceLevel, TeacherId } from '@/core/progress';

/** What the shell knows about a teacher. */
export interface TeacherCard {
  id: TeacherId;
  name: string;
  /** First name, for short labels ("Lesson with Mia"). */
  first: string;
  /** The level they teach, in one word. */
  level: string;
  experience: ExperienceLevel;
  /** Where their course leads. */
  course: string;
  /** A sentence of welcome in their own voice. */
  hello: string;
  /** Avatar colour slot (kit `Avatar tone`), so a teacher keeps one colour everywhere. */
  tone: 2 | 5 | 6;
}

/** The teachers, beginner to expert. */
export const TEACHERS: readonly TeacherCard[] = [
  {
    id: 'mia',
    name: 'Mia Brooks',
    first: 'Mia',
    level: 'Beginner',
    experience: 'beginner',
    course: 'From holding the guitar to your first songs.',
    hello: 'We will go one small step at a time. Today you only need to make one clear note, and I will show you exactly how.',
    tone: 2,
  },
  {
    id: 'dev',
    name: 'Dev Okafor',
    first: 'Dev',
    level: 'Intermediate',
    experience: 'intermediate',
    course: 'From open chords to the whole neck and your own solos.',
    hello: 'You already play, so let us make it count. Every idea I show you is something you can use in a song tonight.',
    tone: 5,
  },
  {
    id: 'elena',
    name: 'Prof. Elena Varga',
    first: 'Elena',
    level: 'Expert',
    experience: 'expert',
    course: 'Advanced harmony, technique, style and composition.',
    hello: 'I will assume you can play and ask you to play better. Expect detail, reasons, and the occasional dry remark.',
    tone: 6,
  },
];

/** A teacher by id (Mia when the id is unknown). */
export function teacherById(id: string): TeacherCard {
  return TEACHERS.find((t) => t.id === id) ?? TEACHERS[0];
}

/** The teacher who fits an experience level. */
export function teacherForLevel(experience: ExperienceLevel): TeacherCard {
  return TEACHERS.find((t) => t.experience === experience) ?? TEACHERS[0];
}
