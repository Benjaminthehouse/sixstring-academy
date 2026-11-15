/**
 * Keeps `API.md` true to the code. The generated sections of the authoring guide (the examples
 * quoted from the demo content, every generator with its parameters, the limits, the glossary ids)
 * sit between `<!-- gen:NAME -->` and `<!-- /gen -->` markers and must equal what this file renders
 * from the live modules. After changing a generator, a limit, the glossary or an example, rewrite
 * them with:
 *
 *   WRITE_API_DOC=1 npx vitest run src/lessons/api-doc.test.ts
 *
 * It also checks that every runtime export of the barrel, every exercise type and every figure kind
 * is documented.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as L from './index';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = join(HERE, 'API.md');
const EXAMPLE_FILES = ['demo/examples.ts', 'demo/first-notes.ts', 'demo/building-blocks.ts'].map((f) => join(HERE, f));

/** The text between `// <example:NAME>` and `// </example:NAME>` in the demo sources, dedented. */
function exampleSource(name: string): string {
  for (const file of EXAMPLE_FILES) {
    const source = readFileSync(file, 'utf8');
    const match = new RegExp(`// <example:${name}>\\n([\\s\\S]*?)\\n[ \\t]*// </example:${name}>`).exec(source);
    if (!match) continue;
    const lines = match[1].split('\n');
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
    let text = lines.map((l) => l.slice(indent)).join('\n');
    // Entries of the example tables (`choice: { ... },`) are shown as the step an author writes.
    text = text.replace(/^(?:'[\w-]+'|[\w]+): /, '').replace(/,$/, '');
    return text;
  }
  throw new Error(`No <example:${name}> marker in the demo sources`);
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');

function generatorGuide(): string {
  const out: string[] = [];
  for (const kind of L.GENERATOR_KINDS) {
    const def = L.getGenerator(kind)!;
    out.push(`#### \`${kind}\`${def.mic ? ' (microphone)' : ''}`, '');
    out.push(`${def.summary} Produces ${def.produces.map((p) => `\`${p}\``).join(', ')}.`, '');
    if (def.params.length > 0) {
      out.push('| param | type | default | meaning |', '|---|---|---|---|');
      for (const p of def.params) out.push(`| \`${p.name}\` | \`${cell(p.type)}\` | ${cell(p.default)} | ${cell(p.description)} |`);
      out.push('');
    }
    const sample = L.generateStrict({ generate: kind } as L.GeneratedStep, { seed: 1, difficulty: 0.3 });
    const prompt = 'prompt' in sample && sample.prompt !== undefined ? L.plainText(sample.prompt) : sample.type === 'flashcard' ? L.plainText(sample.front) : '';
    out.push(`Sample (\`{ generate: '${kind}' }\`, seed 1): ${sample.type}, "${prompt}" → ${L.answerText(sample).replace(/\n/g, '; ')}`, '');
  }
  return out.join('\n').trimEnd();
}

const TEXT_PLACES: Record<L.TextLimit, string> = {
  courseTitle: 'course `title`', courseDescription: 'course `description`', unitTitle: 'unit `title`', unitDescription: 'unit `description`',
  lessonTitle: 'lesson `title`', teaches: 'lesson `teaches`', cardTitle: 'card `title`', cardBody: 'card `body`', cardTip: 'card `tip`',
  prompt: 'exercise `prompt`', statement: 'true-false `statement`', hint: '`hint`', explain: '`explain`', option: 'choice option `text`',
  optionWhy: 'option `why`', pairSide: 'each side of a pair', tile: 'an order tile', fillText: 'fill-blanks `text`', bankWord: 'a bank word',
  flashFront: 'flashcard / fact `front`', flashBack: 'flashcard / fact `back`', caption: 'figure `caption`', audioLabel: 'audio figure `label`',
  glossaryTerm: 'glossary `term`', glossaryDefinition: 'glossary `definition`',
};

const COUNT_PLACES: Record<keyof typeof L.COUNT_LIMITS, string> = {
  options: 'options of a choice or listen-choice', pairs: 'pairs of a match-pairs', tiles: 'tiles of an order (distractors not counted)',
  orderDistractors: 'distractor tiles of an order', blanks: 'blanks of a fill-blanks', bank: 'words in a fill-blanks bank (right and wrong together)',
  findTargets: 'positions an `all` fretboard-find asks for', phraseNotes: 'notes of a play-phrase', rhythmNotes: 'struck notes of a tap-rhythm',
  rhythmBars: 'bars of a rhythm', fretSpan: 'frets a fretboard figure or exercise spans',
};

const LESSON_PLACES: Record<keyof typeof L.LESSON_LIMITS, string> = {
  minutes: '`minutes`, and the estimated time', steps: 'steps in a lesson', exercises: 'exercises (steps that are not cards)',
  types: 'different exercise types (a warning outside this)', cardsInARow: 'cards in a row before a question (a warning above this)',
  facts: 'facts per lesson',
};

const range = (v: number | readonly number[]): string => (typeof v === 'number' ? `at most ${v}` : `${v[0]} to ${v[1]}`);

function limitsGuide(): string {
  const out: string[] = ['| text | at most (visible characters) |', '|---|---|'];
  for (const [key, max] of Object.entries(L.TEXT_LIMITS)) out.push(`| ${TEXT_PLACES[key as L.TextLimit]} | ${max} |`);
  out.push('', '| count | allowed |', '|---|---|');
  for (const [key, v] of Object.entries(L.COUNT_LIMITS)) out.push(`| ${COUNT_PLACES[key as keyof typeof L.COUNT_LIMITS]} | ${range(v)} |`);
  for (const [key, v] of Object.entries(L.LESSON_LIMITS)) out.push(`| ${LESSON_PLACES[key as keyof typeof L.LESSON_LIMITS]} | ${range(v)} |`);
  out.push(`| lessons per unit | ${range(L.COURSE_LIMITS.lessonsPerUnit)} |`);
  out.push(`| authored checkpoint steps | ${range(L.COURSE_LIMITS.checkpointSteps)} |`);
  out.push(`| tempo of anything played (tap-rhythm: 40 to 160) | ${range(L.TEMPO_LIMITS)} BPM |`);
  out.push(`| highest fret | ${L.MAX_FRET} |`);
  return out.join('\n');
}

function glossaryGuide(): string {
  return L.GLOSSARY.map((t) => `\`${t.id}\``).join(' ');
}

/** What each generated section of API.md must hold. */
function render(name: string): string {
  if (name.startsWith('example:')) return ['```ts', exampleSource(name.slice('example:'.length)), '```'].join('\n');
  if (name === 'generators') return generatorGuide();
  if (name === 'limits') return limitsGuide();
  if (name === 'glossary') return glossaryGuide();
  throw new Error(`Unknown generated section "${name}"`);
}

const SECTION = /<!-- gen:([\w:-]+) -->\n([\s\S]*?)\n?<!-- \/gen -->/g;

describe('API.md', () => {
  const doc = readFileSync(DOC, 'utf8');

  it('its generated sections match the code (WRITE_API_DOC=1 rewrites them)', () => {
    const names = [...doc.matchAll(SECTION)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    if (process.env.WRITE_API_DOC === '1') {
      writeFileSync(DOC, doc.replace(SECTION, (_all, name: string) => `<!-- gen:${name} -->\n${render(name)}\n<!-- /gen -->`));
      return;
    }
    for (const m of doc.matchAll(SECTION)) expect(m[2].trimEnd(), `section ${m[1]}`).toBe(render(m[1]));
  });

  it('quotes an example of every exercise type and every figure kind, and the example lesson', () => {
    const exercises = Object.keys(L.EXERCISE_EXAMPLES);
    expect(exercises.length).toBe(17);
    for (const type of exercises) {
      expect(doc, type).toContain(`<!-- gen:example:${type} -->`);
      expect(doc, type).toContain(`### \`${type}\``);
    }
    for (const kind of Object.keys(L.FIGURE_EXAMPLES)) {
      expect(doc, kind).toContain(`<!-- gen:example:figure-${kind} -->`);
      expect(doc, kind).toContain(`**\`${kind}\`**`);
    }
    expect(doc).toContain('<!-- gen:example:lesson -->');
  });

  it('mentions every runtime export of the barrel', () => {
    const missing = Object.keys(L).filter((name) => !new RegExp(`\\b${name}\\b`).test(doc));
    expect(missing).toEqual([]);
  });

  it('documents every problem code validateCourse can report', () => {
    const sources = ['validate.ts', 'check.ts'].map((f) => readFileSync(join(HERE, f), 'utf8')).join('\n');
    const codes = new Set([...sources.matchAll(/'((?:id|skill|requires|text|glossary|figure|exercise|generator|fact|lesson|checkpoint|course)\.[a-z]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const code of codes) expect(doc, code).toContain(`\`${code}\``);
  });
});
