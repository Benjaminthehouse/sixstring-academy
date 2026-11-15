// @vitest-environment jsdom
/**
 * Keeps API.md honest: what it tells screens to import from "@/app/shell" and "@/app/teachers"
 * must exist, and it must stay short enough to be read.
 */
import { describe, expect, it } from 'vitest';
import doc from './API.md?raw';
import * as shell from './shell';
import * as teachers from './teachers';

describe('src/app/API.md', () => {
  it('stays under 80 lines', () => {
    expect(doc.trimEnd().split('\n').length).toBeLessThan(80);
  });

  it('only names things the shell really exports', () => {
    const named = ['useImmersive', 'useScreenTitle', 'openStats', 'openOnboarding', 'WeekStrip', 'WIDE_LAYOUT_QUERY', 'TOPBAR_HEIGHT', 'IMMERSIVE_ROUTES', 'DESTINATIONS', 'destinationFor', 'hubRoutes'];
    for (const name of named) {
      expect(doc, name).toContain(name);
      expect((shell as Record<string, unknown>)[name], name).toBeDefined();
    }
    for (const name of ['TEACHERS', 'teacherById', 'teacherForLevel']) {
      expect(doc, name).toContain(name);
      expect((teachers as Record<string, unknown>)[name], name).toBeDefined();
    }
  });

  it('describes the numbers the shell actually uses', () => {
    expect(shell.TOPBAR_HEIGHT).toBe(52);
    expect(doc).toContain('52 px');
    expect(shell.WIDE_LAYOUT_QUERY).toBe('(min-width: 900px)');
    expect(doc).toContain('900 px');
    for (const route of Object.keys(shell.IMMERSIVE_ROUTES)) expect(doc, route).toContain(`\`${route}`);
  });
});

describe('teachers', () => {
  it('are the three from the project brief, one per level', () => {
    expect(teachers.TEACHERS.map((t) => [t.id, t.name, t.experience])).toEqual([
      ['mia', 'Mia Brooks', 'beginner'],
      ['dev', 'Dev Okafor', 'intermediate'],
      ['elena', 'Prof. Elena Varga', 'expert'],
    ]);
    expect(teachers.teacherForLevel('expert').id).toBe('elena');
    expect(teachers.teacherById('nobody').id).toBe('mia');
    for (const t of teachers.TEACHERS) {
      expect(t.hello.length).toBeGreaterThan(40);
      expect(t.hello).not.toContain('!');
    }
  });
});
