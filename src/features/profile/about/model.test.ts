import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import pkg from '../../../../package.json';
import { BUILT_WITH, BUNDLED_DATA, CAPABILITIES, CREDITS, HONEST_LIMITS, LICENCE_NOTES, SUPPORT_TEXT, hostName, licenceCounts } from './model';

/** The licence a package declares in its own package.json. */
function declaredLicence(name: string): string {
  const path = fileURLToPath(new URL(`../../../../node_modules/${name}/package.json`, import.meta.url));
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { license?: string };
  return manifest.license ?? '';
}

describe('credits', () => {
  it('credits every dependency that ships with the app, and nothing that does not', () => {
    expect(CREDITS.map((c) => c.pkg).sort()).toEqual(Object.keys(pkg.dependencies).sort());
    expect(new Set(CREDITS.map((c) => c.pkg)).size).toBe(CREDITS.length);
  });

  it('states the licence each package declares', () => {
    for (const credit of CREDITS) {
      const declared = declaredLicence(credit.pkg);
      // A dual licence ("MIT OR GPL-3.0-or-later") is used under the option named in the credit.
      const options = declared.replace(/[()]/g, '').split(/\s+OR\s+/);
      expect(options, `${credit.pkg}: declares "${declared}"`).toContain(credit.licence);
    }
  });

  it('says what each one is for, who made it and where it lives', () => {
    for (const credit of [...CREDITS, ...BUNDLED_DATA]) {
      expect(credit.name.length).toBeGreaterThan(2);
      expect(credit.use.endsWith('.')).toBe(true);
      expect(credit.by.length).toBeGreaterThan(2);
      expect(credit.url).toMatch(/^https:\/\//);
      expect(LICENCE_NOTES[credit.licence], credit.licence).toBeDefined();
    }
  });

  it('names the build tools with the licences they declare', () => {
    const manifests: Record<string, string> = { Vite: 'vite', TypeScript: 'typescript', Vitest: 'vitest' };
    for (const tool of BUILT_WITH) {
      expect(Object.keys(pkg.devDependencies)).toContain(manifests[tool.name]);
      expect(declaredLicence(manifests[tool.name])).toBe(tool.licence);
    }
  });

  it('counts credits by licence, most common first', () => {
    const counts = licenceCounts([...CREDITS, ...BUNDLED_DATA]);
    expect(counts.reduce((sum, [, n]) => sum + n, 0)).toBe(CREDITS.length + BUNDLED_DATA.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i][1]).toBeLessThanOrEqual(counts[i - 1][1]);
    expect(licenceCounts([{ licence: 'MIT' }, { licence: 'ISC' }, { licence: 'MIT' }])).toEqual([
      ['MIT', 2],
      ['ISC', 1],
    ]);
  });
});

describe('what works where', () => {
  it('says the microphone and the camera need the standalone app', () => {
    const row = (id: string) => CAPABILITIES.find((c) => c.id === id)!;
    expect(row('mic')).toMatchObject({ standalone: { support: 'yes' }, artifact: { support: 'no' } });
    expect(row('camera')).toMatchObject({ standalone: { support: 'yes' }, artifact: { support: 'no' } });
    // Kindly: the note says what works instead.
    expect(row('mic').artifact.note).toMatch(/instead/);
    expect(row('lessons')).toMatchObject({ standalone: { support: 'yes' }, artifact: { support: 'yes' } });
    expect(row('ai').artifact.note).toMatch(/Built in/);
  });

  it('agrees with the route registry about which screens need a device', () => {
    const needs = new Set(ROUTES.flatMap((r) => r.needs ?? []));
    // Every device a route can need has a row here.
    for (const device of needs) expect(CAPABILITIES.some((c) => c.id === device), device).toBe(true);
  });

  it('every row has words for both hosts and a word for each level of support', () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length);
    for (const row of CAPABILITIES) {
      for (const side of [row.standalone, row.artifact]) {
        expect(SUPPORT_TEXT[side.support]).toBeDefined();
        expect(side.note.endsWith('.')).toBe(true);
      }
    }
    expect(hostName('artifact')).toBe('inside Claude');
    expect(hostName('standalone')).toBe('as the standalone app');
  });

  it('is honest about the camera and the sheet reader, in two entries', () => {
    expect(HONEST_LIMITS.map((l) => l.id)).toEqual(['camera', 'scan']);
    for (const limit of HONEST_LIMITS) expect(limit.text.split('. ').length).toBeLessThanOrEqual(3);
  });

  it('shows the version of package.json', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
