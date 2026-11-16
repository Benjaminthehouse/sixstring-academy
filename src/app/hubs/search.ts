/**
 * Quick search over the screens of the app. A learner types what they want to do ("tune",
 * "pentatonic", "pdf"), not the name we gave the screen, so every route carries a few extra words
 * beside its registry title and blurb.
 */
import type { RouteDef } from '../routes';

/** Words a learner might type for a screen, beyond its title and blurb. Keyed by route name. */
export const ROUTE_KEYWORDS: Readonly<Record<string, string>> = {
  home: 'today plan daily streak goal quests continue start dashboard',
  study: 'learn theory teachers lessons courses study',
  studio: 'play practise practice songs games drills studio',
  tools: 'tuner metronome recorder camera scanner utilities',
  profile: 'me progress achievements preferences options theme dark light account stats shop gems level export import backup left handed',
  learn: 'theory lessons course notes intervals keys harmony reading quiz review cards flashcards bite sized',
  teachers: 'teacher mia brooks dev okafor elena varga course beginner intermediate expert advanced lessons guided',
  reference: 'circle of fifths key signatures glossary cheat sheet chart dictionary terms lookup',
  songs: 'song library tab tabs sheet music repertoire pieces imported scanned play along',
  scales: 'scale mode modes pentatonic major minor blues dorian mixolydian phrygian lydian positions boxes caged',
  arcade: 'games game scale drill fun score stars challenge play',
  chords: 'chord chords voicings shapes barre open diagram changes trainer finder',
  progressions: 'chord progression jam backing track band twelve bar blues 12 bar loop',
  fretboard: 'notes neck note names trainer memorise memorize learn the neck',
  ear: 'ear training intervals listening pitch melody dictation hearing',
  rhythm: 'strumming strum pattern timing subdivision beat count groove',
  technique: 'exercise exercises picking legato hammer pull bend vibrato speed warm up warmup fingers',
  practice: 'routine session timer log plan schedule journal diary',
  tuner: 'tune tuning pitch strings drop d standard cents out of tune',
  metronome: 'click tempo bpm beat speed trainer tap',
  record: 'record recording recorder yourself myself listen back playback take takes voice memo compare last week',
  camera: 'webcam live fretboard video overlay detect frets phone',
  scan: 'scanner import pdf photo picture sheet partitura partiture score musicxml guitar pro gp midi upload file printed',
};

/** A route that matched a query, with how well. */
export interface SearchHit {
  route: RouteDef;
  score: number;
}

/** Lowercase words of a query, without punctuation. */
export function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function wordsOf(text: string): string[] {
  return searchTokens(text);
}

function tokenScore(token: string, title: string[], keywords: string[], blurb: string[]): number {
  if (title.some((w) => w === token)) return 5;
  if (title.some((w) => w.startsWith(token))) return 4;
  if (keywords.some((w) => w === token)) return 3;
  if (keywords.some((w) => w.startsWith(token))) return 2.5;
  if (blurb.some((w) => w.startsWith(token))) return 2;
  // Inside a word ("tonic" in "pentatonic") still counts, weakly. Needs three letters to mean anything.
  if (token.length >= 3 && [...title, ...keywords, ...blurb].some((w) => w.includes(token))) return 1;
  return 0;
}

/** Small words that say nothing about which screen is wanted ("how do I tune my guitar"). */
const FILLER: ReadonlySet<string> = new Set(['a', 'an', 'the', 'my', 'me', 'i', 'to', 'of', 'for', 'in', 'on', 'with', 'and', 'or', 'how', 'do', 'does', 'can', 'want', 'need', 'please', 'is', 'it', 'this', 'that', 'some']);

/** Words that fit every screen of a guitar school. They count when they help ("guitar pro") and are dropped when they are all that stands in the way. */
const SOFT: ReadonlySet<string> = new Set(['guitar', 'guitars']);

/**
 * Routes matching every meaningful word of the query, best first; ties keep registry order. Filler
 * words are ignored, so a question typed in full still finds its screen. An empty query matches
 * nothing (the caller shows its normal content instead).
 */
export function searchRoutes(query: string, routes: readonly RouteDef[]): SearchHit[] {
  const typed = searchTokens(query);
  if (typed.length === 0) return [];
  const meaningful = typed.filter((token) => !FILLER.has(token));
  const tokens = meaningful.length > 0 ? meaningful : typed;
  const hits = matchRoutes(tokens, routes);
  if (hits.length > 0) return hits;
  const narrowed = tokens.filter((token) => !SOFT.has(token));
  return narrowed.length > 0 && narrowed.length < tokens.length ? matchRoutes(narrowed, routes) : hits;
}

function matchRoutes(tokens: readonly string[], routes: readonly RouteDef[]): SearchHit[] {
  const hits: Array<SearchHit & { order: number }> = [];
  routes.forEach((route, order) => {
    const title = wordsOf(`${route.title} ${route.name}`);
    const keywords = wordsOf(ROUTE_KEYWORDS[route.name] ?? '');
    const blurb = wordsOf(route.blurb);
    let score = 0;
    for (const token of tokens) {
      const s = tokenScore(token, title, keywords, blurb);
      if (s === 0) return;
      score += s;
    }
    hits.push({ route, score, order });
  });
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map(({ route, score }) => ({ route, score }));
}
