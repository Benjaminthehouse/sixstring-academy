/**
 * Telling apart the two ways a screen can fail, because they need different ways out.
 *
 * - The screen's code ran and threw: mounting it again may work ("Try again").
 * - The screen's code never arrived (offline, or the app was updated underneath an open tab so the
 *   old file names are gone). Browsers remember a failed module for the life of the page, so
 *   asking again changes nothing: only a reload fetches it afresh.
 */

const LOAD_FAILURE = [
  /dynamically imported module/i, // Chromium ("Failed to fetch …") and Firefox ("error loading …")
  /importing a module script failed/i, // Safari
  /unable to preload/i, // Vite's preload helper (a stylesheet or chunk of the screen)
  /loading (css )?chunk/i, // webpack-style wording, in case the bundler ever changes
  /failed to load module script/i,
];

/** True when the error means the screen's code could not be fetched, as opposed to having thrown. */
export function isLoadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return LOAD_FAILURE.some((pattern) => pattern.test(error.message));
}

/** What the error panel offers as its main button. */
export type Recovery = 'retry' | 'reload';

/**
 * The way out to lead with: mount the screen again the first time it throws; reload the app when
 * its code never arrived, or when it has already failed again after a retry.
 */
export function recoveryFor(error: unknown, retries: number): Recovery {
  return isLoadFailure(error) || retries > 0 ? 'reload' : 'retry';
}
