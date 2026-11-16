/**
 * The About screen as data: the open-source work the app is built on, with licences, and what
 * works in which host. A test checks the credits against package.json and the installed packages,
 * so a new dependency cannot ship without being credited.
 */
import type { Host } from '@/core/platform';

/** One piece of open-source work that ships with the app. */
export interface Credit {
  /** npm package name (also the key the test matches against package.json). */
  pkg: string;
  /** How people call it. */
  name: string;
  /** What the app uses it for, in plain words. */
  use: string;
  /** SPDX licence the app uses it under. */
  licence: string;
  /** Who made it. */
  by: string;
  /** Project home page. */
  url: string;
}

/** Everything in `dependencies`, in the order a learner would meet it. */
export const CREDITS: readonly Credit[] = [
  { pkg: 'react', name: 'React', use: 'Draws every screen.', licence: 'MIT', by: 'Meta Platforms and contributors', url: 'https://react.dev' },
  { pkg: 'react-dom', name: 'React DOM', use: 'Connects React to the browser.', licence: 'MIT', by: 'Meta Platforms and contributors', url: 'https://react.dev' },
  { pkg: 'lucide-react', name: 'Lucide', use: 'The icons.', licence: 'ISC', by: 'Lucide contributors', url: 'https://lucide.dev' },
  { pkg: '@fontsource-variable/bricolage-grotesque', name: 'Bricolage Grotesque', use: 'The typeface of headings.', licence: 'OFL-1.1', by: 'Mathieu Triay', url: 'https://fontsource.org/fonts/bricolage-grotesque' },
  { pkg: '@fontsource-variable/instrument-sans', name: 'Instrument Sans', use: 'The typeface of running text.', licence: 'OFL-1.1', by: 'Rodrigo Fuenzalida and Jordan Egstad', url: 'https://fontsource.org/fonts/instrument-sans' },
  { pkg: '@fontsource-variable/jetbrains-mono', name: 'JetBrains Mono', use: 'The typeface of tab, fret numbers and timings.', licence: 'OFL-1.1', by: 'JetBrains', url: 'https://fontsource.org/fonts/jetbrains-mono' },
  { pkg: 'vexflow', name: 'VexFlow', use: 'Engraves standard notation.', licence: 'MIT', by: 'Mohit Muthanna Cheppudira and contributors', url: 'https://www.vexflow.com' },
  { pkg: '@coderline/alphatab', name: 'alphaTab', use: 'Reads Guitar Pro files.', licence: 'MPL-2.0', by: 'Daniel Kuschny and contributors', url: 'https://alphatab.net' },
  { pkg: '@tonejs/midi', name: 'Tone.js MIDI', use: 'Reads MIDI files.', licence: 'MIT', by: 'Yotam Mann and contributors', url: 'https://github.com/Tonejs/Midi' },
  { pkg: 'jszip', name: 'JSZip', use: 'Opens compressed score files (MusicXML .mxl, Guitar Pro 7).', licence: 'MIT', by: 'Stuart Knightley and contributors', url: 'https://stuk.github.io/jszip/' },
  { pkg: 'pdfjs-dist', name: 'PDF.js', use: 'Opens PDF sheets for the scanner.', licence: 'Apache-2.0', by: 'Mozilla and contributors', url: 'https://mozilla.github.io/pdf.js/' },
  { pkg: 'tesseract.js', name: 'Tesseract.js', use: 'Reads printed text and tab numbers on scanned sheets, on your device.', licence: 'Apache-2.0', by: 'Naptha and the Tesseract OCR authors', url: 'https://tesseract.projectnaptha.com' },
  { pkg: '@mediapipe/tasks-vision', name: 'MediaPipe Tasks Vision', use: 'Finds your fretting hand in the camera picture, on your device.', licence: 'Apache-2.0', by: 'Google', url: 'https://ai.google.dev/edge/mediapipe' },
  { pkg: '@supabase/supabase-js', name: 'Supabase JS', use: 'Signs you in with an email code and syncs your progress between devices, where this copy offers accounts.', licence: 'MIT', by: 'Supabase and contributors', url: 'https://supabase.com' },
];

/** Bundled data files that are not npm packages of their own. */
export const BUNDLED_DATA: ReadonlyArray<Omit<Credit, 'pkg'>> = [
  { name: 'Tesseract English language data', use: 'What the sheet scanner’s text reader has learned about printed English.', licence: 'Apache-2.0', by: 'The Tesseract OCR authors', url: 'https://github.com/tesseract-ocr/tessdata_fast' },
  { name: 'MediaPipe hand landmark model', use: 'What the camera’s hand finder has learned about hands.', licence: 'Apache-2.0', by: 'Google', url: 'https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker' },
];

/** The tools the app is built and tested with. They do not ship inside it. */
export const BUILT_WITH: ReadonlyArray<{ name: string; licence: string }> = [
  { name: 'Vite', licence: 'MIT' },
  { name: 'TypeScript', licence: 'Apache-2.0' },
  { name: 'Vitest', licence: 'MIT' },
];

/** What a licence allows, in a sentence, by SPDX id. */
export const LICENCE_NOTES: Readonly<Record<string, string>> = {
  MIT: 'Free to use, change and share, with the copyright notice kept.',
  ISC: 'Free to use, change and share, with the copyright notice kept.',
  'Apache-2.0': 'Free to use, change and share, with notices kept and changes stated.',
  'MPL-2.0': 'Free to use; changes to its own files must be shared under the same licence.',
  'OFL-1.1': 'A font licence: free to use and bundle, not to be sold by itself.',
};

/** Credits counted by licence, most common first: `[['MIT', 5], ...]`. */
export function licenceCounts(credits: ReadonlyArray<{ licence: string }>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const credit of credits) counts.set(credit.licence, (counts.get(credit.licence) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** How well a feature works in a host. */
export type Support = 'yes' | 'limited' | 'no';

/** One row of the "what works where" table. */
export interface CapabilityRow {
  id: string;
  feature: string;
  icon: string;
  standalone: { support: Support; note: string };
  artifact: { support: Support; note: string };
}

/** What works in the standalone app and inside Claude. */
export const CAPABILITIES: readonly CapabilityRow[] = [
  {
    id: 'lessons',
    feature: 'Lessons, theory, scales, chords, songs, metronome',
    icon: 'GraduationCap',
    standalone: { support: 'yes', note: 'Everything.' },
    artifact: { support: 'yes', note: 'Everything.' },
  },
  {
    id: 'mic',
    feature: 'Microphone: tuner, play-along checking, listening games',
    icon: 'Mic',
    standalone: { support: 'yes', note: 'After you allow the microphone.' },
    artifact: { support: 'no', note: 'The viewer does not pass on the microphone. Reference tones and tapping the answers work instead.' },
  },
  {
    id: 'camera',
    feature: 'Camera: live fretboard',
    icon: 'ScanEye',
    standalone: { support: 'yes', note: 'After you allow the camera.' },
    artifact: { support: 'no', note: 'The viewer does not pass on the camera.' },
  },
  {
    id: 'scan',
    feature: 'Sheet reading',
    icon: 'ScanLine',
    standalone: { support: 'yes', note: 'On your device for clean tab and chord sheets. Photographed notation needs the AI helper (your own API key).' },
    artifact: { support: 'limited', note: 'Through Claude, which is built in here. The on-device reader is not included.' },
  },
  {
    id: 'ai',
    feature: 'AI helper',
    icon: 'Sparkles',
    standalone: { support: 'limited', note: 'Optional, with your own Anthropic API key.' },
    artifact: { support: 'yes', note: 'Built in. It asks before the first use.' },
  },
  {
    id: 'files',
    feature: 'Saving files and printing',
    icon: 'Download',
    standalone: { support: 'yes', note: 'Downloads and printing work as usual.' },
    artifact: { support: 'limited', note: 'Saving asks you to confirm each file. Printing is not available.' },
  },
  {
    id: 'sync',
    feature: 'Progress on several devices',
    icon: 'RefreshCw',
    standalone: { support: 'limited', note: 'Stays on this device. Move it with Export and Import.' },
    artifact: { support: 'yes', note: 'Synced with your Claude account when the page offers it.' },
  },
  {
    id: 'offline',
    feature: 'Working without a connection',
    icon: 'WifiOff',
    standalone: { support: 'yes', note: 'Once loaded, everything except the AI helper.' },
    artifact: { support: 'no', note: 'The viewer needs a connection.' },
  },
];

/** The word for a level of support (colour is never the only signal). */
export const SUPPORT_TEXT: Readonly<Record<Support, string>> = { yes: 'Works', limited: 'In part', no: 'Not here' };

/** The host's name in a sentence. */
export function hostName(host: Host): string {
  return host === 'artifact' ? 'inside Claude' : 'as the standalone app';
}

/** The two honest lines about what the camera and the sheet reader cannot do. */
export const HONEST_LIMITS: ReadonlyArray<{ id: string; icon: string; title: string; text: string }> = [
  {
    id: 'camera',
    icon: 'ScanEye',
    title: 'Live fretboard camera',
    text: 'It needs good light and a steady, side-on view of the whole neck. It can put a marker a fret off or lose the neck when you move, so treat it as a guide and trust your ears.',
  },
  {
    id: 'scan',
    icon: 'ScanLine',
    title: 'Sheet reading',
    text: 'Clean printed tab and chord sheets come out mostly right; handwriting, dense notation and blurry photos do not. Every scan opens for you to check and correct before it becomes a lesson.',
  },
];
