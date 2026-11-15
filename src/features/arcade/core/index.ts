/**
 * The arcade's pure model: scales and shapes to practise, the seven games' levels and round
 * generators, scoring, records, the daily challenge and skill ids. No browser APIs; unit-tested
 * in `arcade.test.ts`, and loaded by `e2e/arcade.cjs` to build its fake-microphone recordings.
 */
export * from './rng';
export * from './focus';
export * from './scoring';
export * from './noteHunt';
export * from './shapeBuilder';
export * from './runScale';
export * from './degreeDarts';
export * from './modeMatch';
export * from './lickEcho';
export * from './sprint';
export * from './games';
export * from './records';
export * from './daily';
export * from './skill';
