/**
 * Size bounds of the persisted state. Everything that grows with use has a cap, so the save stays
 * well inside a browser's storage quota however long the app is used.
 */

/** Days of history kept (three years). Lifetime totals live in `stats` and survive pruning. */
export const MAX_DAYS = 1100;
/** Practice sessions kept in the log. */
export const MAX_LOG = 300;
/** Entries of the "recently used" list. */
export const MAX_RECENTS = 12;
/** Bookmarks. */
export const MAX_FAVOURITES = 500;
/** Skills in the registry. */
export const MAX_SKILLS = 5000;
/** Longest skill, review-item or favourite id. */
export const MAX_ID_LENGTH = 120;
/** Longest title stored with a session, recent or favourite. */
export const MAX_TITLE_LENGTH = 80;
/** Longest display name. */
export const MAX_NAME_LENGTH = 40;
/** Counters in `stats`. */
export const MAX_STATS = 400;
/** Numbers kept with one log entry. */
export const MAX_SESSION_METRICS = 8;
/** Longest single activity that is believed (four hours); longer durations are clamped. */
export const MAX_ACTIVITY_SEC = 4 * 3600;
