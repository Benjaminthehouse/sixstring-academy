/**
 * The lesson engine: the content model, rich text, figures, exercise graders, generators, the
 * session reducer, course map state and course validation. Pure TypeScript, no UI, runs in Node.
 *
 * Import everything from here (`@/lessons`), never from the inner files. `API.md` beside this file
 * has two parts: the screen builder's API and the authoring guide for content writers.
 */
export * from './types';
export * from './limits';
export * from './rng';
export * from './glossary';
export * from './text';
export * from './rhythm';
export * from './sound';
export * from './figures';
export * from './answers';
export * from './grade';
export * from './listen';
export * from './generators';
export * from './check';
export * from './adaptive';
export * from './session';
export * from './effects';
export * from './start';
export * from './persist';
export * from './map';
export * from './validate';
export { DEMO_COURSE, EXERCISE_EXAMPLES, FIGURE_EXAMPLES } from './demo';
