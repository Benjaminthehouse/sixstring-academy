/**
 * What the always-mounted session bar and the Today screen load. The bar sits on every screen, so
 * it must not bring the exercise pool, the planner or the app's content with it; Today loads the
 * content library only as a lazy chunk. Checked on the static import graph (`import()` is lazy and
 * not followed; `import type` costs nothing).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const file = base + ext;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

/** Every source file `entry` imports statically, directly or not, as paths relative to `src/`. */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [path.join(SRC, entry)];
  // `import x from '...'`, `import { a } from '...'`, `export * from '...'`, `import '...'`; not `import type`.
  const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  while (stack.length) {
    const file = stack.pop()!;
    const rel = path.relative(SRC, file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!/\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      if (m[1]) continue;
      const next = resolve(file, m[2]);
      if (next) stack.push(next);
    }
  }
  return seen;
}

describe('what the practice session bar loads on every screen', () => {
  const graph = staticGraph('features/practice/SessionBar.tsx');

  it('reads the session and the saved routines without the exercise pool or the planner', () => {
    expect(graph.has('features/practice/session/controller.ts')).toBe(true);
    expect(graph.has('features/practice/model/store.ts')).toBe(true);
    expect(graph.has('features/practice/model/routine-data.ts')).toBe(true);
    for (const heavy of ['content.ts', 'planner.ts', 'routines.ts', 'library.ts', 'signals.ts']) {
      expect(graph.has(`features/practice/model/${heavy}`), heavy).toBe(false);
    }
    expect([...graph].filter((f) => f.startsWith('content/'))).toEqual([]);
    expect(graph.has('app/teachers.ts')).toBe(false);
  });
});

describe('what Today loads before its first paint', () => {
  it('gets the content library only lazily', () => {
    const graph = staticGraph('features/home/index.tsx');
    expect(graph.has('features/practice/model/library-loader.ts')).toBe(true);
    expect(graph.has('features/practice/model/library.ts')).toBe(false);
    expect([...graph].filter((f) => f.startsWith('content/'))).toEqual([]);
  });
});
