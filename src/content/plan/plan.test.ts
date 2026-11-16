import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import teachers from './teachers.json';
import repertoire from './repertoire.json';
import theoryPath from './theory-path.json';
import { getProgression, keyChoices } from '@/content/progressions';

// Cross-references between the three plan files (teachers.json, repertoire.json, theory-path.json), the
// progression catalog the teachers' jam steps point into, and the three pages that document the files.

/** A teacher lesson, as teachers.json stores it. */
interface TeacherLesson {
  id: string;
  title: string;
  goal: string;
  explain: string;
  show: string;
  practice: string[];
  music: string[];
  theory: string[];
}
/** A teacher course, as teachers.json stores it. */
interface TeacherCourse {
  id: string;
  title: string;
  units: { id: string; title: string; lessons: TeacherLesson[] }[];
}
/** Any repertoire entry: a piece, a study or a technique exercise. */
interface RepEntry {
  id: string;
  title: string;
}
/** A Theory Path lesson and the lessons it builds on. */
interface TheoryLesson {
  id: string;
  prerequisites: string[];
}

const courses = (teachers as unknown as { courses: TeacherCourse[] }).courses;
const rep = repertoire as unknown as { pieces: RepEntry[]; studies: RepEntry[]; technique: RepEntry[] };
const stages = (theoryPath as unknown as { course: { stages: { id: string; units: { id: string; lessons: TheoryLesson[] }[] }[] } }).course.stages;

const repEntries = [...rep.pieces, ...rep.studies, ...rep.technique];
const repIds = new Set(repEntries.map((e) => e.id));
const pieceIds = new Set(rep.pieces.map((e) => e.id));
const theoryUnits = stages.flatMap((s) => s.units);
const theoryLessons = theoryUnits.flatMap((u) => u.lessons);
const theoryIds = new Set(theoryLessons.map((l) => l.id));
const teacherLessons = courses.flatMap((c) => c.units.flatMap((u) => u.lessons));
const teacherIds = new Set(teacherLessons.map((l) => l.id));

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const FILES = { teachers: read('teachers.json'), repertoire: read('repertoire.json'), theory: read('theory-path.json') };
const PAGES = { 'TEACHERS.md': read('TEACHERS.md'), 'REPERTOIRE.md': read('REPERTOIRE.md'), 'THEORY-PATH.md': read('THEORY-PATH.md') };

const ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** Every id-like token in a text, by the id space it belongs to. Repertoire study and exercise ids start st- or tech-. */
function mentions(text: string): { rep: string[]; theory: string[]; teacher: string[] } {
  const units = theoryUnits.map((u) => u.id).join('|');
  const all = (re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => m[0]))];
  return {
    rep: all(new RegExp(String.raw`(?<![\w-])(?:st|tech)-${ID}`, 'g')),
    theory: all(new RegExp(String.raw`(?<![\w/-])(?:${units})/${ID}`, 'g')),
    teacher: all(new RegExp(String.raw`(?<![\w/-])(?:mia|dev|elena)/${ID}/${ID}`, 'g')),
  };
}

/** The ids a page says were deleted, and every other id its change section names, which must exist. */
function idChanges(page: string): { deleted: string[]; named: string[] } {
  const section = page.match(/^## (?:Id changes|Changes from the expert review)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return { deleted: [], named: [] };
  const body = section[1];
  const ticks = (s: string) => [...s.matchAll(/`([a-z0-9/-]+)`/g)].map((m) => m[1]).filter((t) => /[a-z]-[a-z0-9]|\//.test(t));
  // The deletion clause runs from the word "deleted" to the end of its sentence; text in brackets names replacements.
  const clause = body.match(/deleted:?\**\s*([\s\S]*?)(?:\.\s|\.$)/i)?.[1] ?? '';
  const deleted = ticks(clause.replace(/\([^()]*\)/g, ''));
  return { deleted, named: ticks(body).filter((t) => !deleted.includes(t)) };
}
const CHANGES = {
  rep: idChanges(PAGES['REPERTOIRE.md']),
  theory: idChanges(PAGES['THEORY-PATH.md']),
  teacher: idChanges(PAGES['TEACHERS.md']),
};
const deletedIds = new Set([...CHANGES.rep.deleted, ...CHANGES.theory.deleted, ...CHANGES.teacher.deleted]);

/** Text that a lesson shows, normalised so punctuation and case do not matter when looking for a title. */
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim()} `;
const lessonText = (l: TeacherLesson) => [l.title, l.goal, l.explain, l.show, ...l.practice].join('\n');

describe('plan files: ids', () => {
  it('gives every entry an id that is unique within its file', () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(repEntries.map((e) => e.id)), 'repertoire').toEqual([]);
    expect(dupes([...stages.map((s) => s.id), ...theoryUnits.map((u) => u.id), ...theoryLessons.map((l) => l.id)]), 'theory path').toEqual([]);
    expect(dupes([...courses.map((c) => c.id), ...courses.flatMap((c) => c.units.map((u) => u.id)), ...teacherLessons.map((l) => l.id)]), 'teachers').toEqual([]);
    for (const u of theoryUnits) for (const l of u.lessons) expect(l.id.startsWith(`${u.id}/`), l.id).toBe(true);
  });

  it('keeps the id-change lists on the pages true: added ids exist, deleted ids exist nowhere', () => {
    expect(CHANGES.rep.deleted).toEqual(['red-river-valley', 'angeline-the-baker']);
    expect(CHANGES.theory.deleted).toEqual(['the-six-strings/what-a-tuning-is', 'capo-and-transposition/transposing-with-numerals']);
    const exists = { rep: repIds, theory: theoryIds, teacher: teacherIds };
    for (const [space, { deleted, named }] of Object.entries(CHANGES) as [keyof typeof exists, { deleted: string[]; named: string[] }][]) {
      for (const id of named) expect(exists[space].has(id) || theoryUnits.some((u) => u.id === id), `${space}: ${id} is named but does not exist`).toBe(true);
      for (const id of deleted) {
        expect(exists[space].has(id), `${space}: ${id} is listed as deleted but still exists`).toBe(false);
        for (const [file, text] of Object.entries(FILES)) {
          expect(new RegExp(String.raw`(?<![\w/-])${id}(?![\w/-])`).test(text), `${file} still refers to the deleted ${id}`).toBe(false);
        }
      }
    }
  });
});

describe('plan files: every reference resolves', () => {
  it('points every id-like token in the three files at an entry that exists', () => {
    let checked = 0;
    for (const [file, text] of Object.entries(FILES)) {
      const m = mentions(text);
      for (const id of m.rep) expect(repIds.has(id), `${file}: unknown repertoire id ${id}`).toBe(true);
      for (const id of m.theory) expect(theoryIds.has(id), `${file}: unknown Theory Path id ${id}`).toBe(true);
      for (const id of m.teacher) expect(teacherIds.has(id), `${file}: unknown teacher lesson ${id}`).toBe(true);
      checked += m.rep.length + m.theory.length + m.teacher.length;
    }
    expect(checked).toBeGreaterThan(700);
  });

  it('points every id on the three pages at an entry that exists, unless the page lists it as deleted', () => {
    for (const [page, text] of Object.entries(PAGES)) {
      const m = mentions(text);
      for (const id of m.rep) expect(repIds.has(id) || deletedIds.has(id), `${page}: ${id}`).toBe(true);
      for (const id of m.theory) expect(theoryIds.has(id) || deletedIds.has(id), `${page}: ${id}`).toBe(true);
      for (const id of m.teacher) expect(teacherIds.has(id) || deletedIds.has(id), `${page}: ${id}`).toBe(true);
    }
    // REPERTOIRE.md writes piece ids in backticks: each one is a piece, a study or exercise, or a listed deletion.
    for (const [, id] of PAGES['REPERTOIRE.md'].matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
      expect(repIds.has(id) || deletedIds.has(id), `REPERTOIRE.md: ${id}`).toBe(true);
    }
  });

  it('builds the Theory Path only on lessons that exist and come earlier', () => {
    const index = new Map(theoryLessons.map((l, i) => [l.id, i]));
    for (const [i, l] of theoryLessons.entries()) {
      for (const p of l.prerequisites) {
        expect(index.has(p), `${l.id}: unknown prerequisite ${p}`).toBe(true);
        expect(index.get(p)!, `${l.id}: ${p} comes later`).toBeLessThan(i);
      }
    }
  });

  it('links teacher lessons only to repertoire entries, Theory Path lessons and jam tracks that exist', () => {
    let jams = 0;
    for (const l of teacherLessons) {
      for (const id of l.music) expect(repIds.has(id), `${l.id}: unknown music ${id}`).toBe(true);
      for (const id of l.theory) expect(theoryIds.has(id), `${l.id}: unknown theory ${id}`).toBe(true);
      for (const step of l.practice) {
        for (const [, track, key] of step.matchAll(new RegExp(String.raw`jam track (${ID}-${ID})(?: in ([A-G](?:#|b)?))?`, 'g'))) {
          const p = getProgression(track);
          expect(p, `${l.id}: unknown jam track ${track}`).not.toBeNull();
          if (key) expect(keyChoices(p!), `${l.id}: ${track} in ${key}`).toContain(key);
          jams++;
        }
      }
    }
    expect(jams).toBeGreaterThan(50);
  });

  it('links every repertoire entry a lesson names by its full title', () => {
    // Longest titles first, so "Travis Picking with a Melody" is not also read as "Travis Picking".
    const byLength = [...repEntries].filter((e) => e.title.split(/\s+/).length >= 2).sort((a, b) => b.title.length - a.title.length);
    let named = 0;
    for (const l of teacherLessons) {
      let text = norm(lessonText(l));
      for (const e of byLength) {
        const t = norm(e.title);
        if (!text.includes(t)) continue;
        expect(l.music, `${l.id} names "${e.title}" but does not link ${e.id}`).toContain(e.id);
        text = text.split(t).join(' # ');
        named++;
      }
    }
    expect(named).toBeGreaterThan(150);
  });

  it('names, in the lesson, every piece the lesson links', () => {
    // Pieces that lessons call by a shorter or more usual name than their repertoire title.
    const ALIASES: Record<string, string[]> = {
      'twinkle-twinkle-little-star': ['Twinkle Twinkle'],
      'drunken-sailor': ['Drunken Sailor'],
      clementine: ['Clementine'],
      'william-tell-galop': ['William Tell galop'],
      'bach-prelude-bwv999': ['BWV 999'],
      'carulli-andantino-op241-no5': ['Andantino, Op. 241 No. 5'],
      'carcassi-op60-no7': ['Carcassi Op. 60 No. 7'],
      'sor-op35-no22': ['Sor Op. 35 No. 22'],
      'bach-bourree-e-minor': ['Bourree in E minor'],
      'chopin-prelude-7': ["Chopin's Prelude No. 7"],
      'coste-op38-no1': ['Coste Op. 38 No. 1'],
      'gavotte-en-rondeau': ['Gavotte en Rondeau'],
      'cello-suite-1-prelude': ['Cello Suite Prelude'],
      'bach-chaconne': ['Chaconne'],
      'bach-prelude-bwv1006a': ['BWV 1006a'],
    };
    for (const id of Object.keys(ALIASES)) expect(pieceIds.has(id), `alias for unknown piece ${id}`).toBe(true);
    for (const l of teacherLessons) {
      const text = norm(lessonText(l));
      for (const id of l.music.filter((m) => pieceIds.has(m))) {
        const title = rep.pieces.find((p) => p.id === id)!.title;
        const names = [title, title.replace(/\s*\([^)]*\)/g, ''), ...(ALIASES[id] ?? [])];
        expect(names.some((n) => text.includes(norm(n))), `${l.id} links ${id} ("${title}") but never names it`).toBe(true);
      }
    }
  });
});

describe('plan files: TEACHERS.md matches teachers.json', () => {
  const page = PAGES['TEACHERS.md'];

  it('gives each course its real number of lessons, units and hours', () => {
    for (const c of courses) {
      const row = page.match(new RegExp(String.raw`^\| \`${c.id}\` ${c.title.replace(/[.]/g, '\\.')} \|[^|]*\| (\d+) in (\d+) units \| about (\d+) hours \|`, 'm'));
      expect(row, `no table row for ${c.id}`).not.toBeNull();
      const ls = c.units.flatMap((u) => u.lessons);
      const minutes = ls.reduce((s, l) => s + (l as unknown as { minutes: number }).minutes, 0);
      expect(Number(row![1]), `${c.id} lessons`).toBe(ls.length);
      expect(Number(row![2]), `${c.id} units`).toBe(c.units.length);
      expect(Number(row![3]), `${c.id} hours`).toBe(Math.round(minutes / 60));
    }
  });

  it('lists every unit in order with its title and its number of lessons', () => {
    const listed = [...page.matchAll(/^\d+\. \*\*(.+?)\*\* \((\d+)\):/gm)].map((m) => `${m[1]} (${m[2]})`);
    expect(listed).toEqual(courses.flatMap((c) => c.units.map((u) => `${u.title} (${u.lessons.length})`)));
  });
});
