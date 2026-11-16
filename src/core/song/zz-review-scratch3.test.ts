// TEMPORARY review scratch (deleted after the review).
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { sixTab, parseSixTab } from './sixtab-parse';
import { validateSong, voicingLabelProblem } from './validate';
const log = (...a: unknown[]) => appendFileSync(process.env.OUT!, a.join(' ') + '\n');

it('labels across the library', async () => {
  let n = 0;
  for (const e of SONG_ENTRIES) {
    const song = sixTab(await loadSongText(e.id));
    for (const i of validateSong(song)) if (/chord-voicing/.test(i.code)) { n++; log(e.id, i.code, i.message); }
  }
  log('library label issues:', n);
  const std = [40, 45, 50, 55, 59, 64];
  const cases: Array<[string, Array<number | null>, number?]> = [
    ['Dm', [null, null, 3, 2, 3, 5]], ['Dm/F', [null, null, 3, 2, 3, 5]], ['C', [0, 3, 2, 0, 1, 0]], ['C/E', [0, 3, 2, 0, 1, 0]], ['C/E', [null, 3, 2, 0, 1, 0]],
    ['G', [null, null, 0, 0, 0, 3]], ['G7', [null, null, 0, 0, 0, 1]], ['D', [null, 0, 0, 2, 3, 2]], ['Am', [0, 0, 2, 2, 1, 0]], ['E7', [0, 2, 0, 1, 0, 0]],
    ['Cmaj7', [null, 3, 2, 0, 0, 0]], ['C', [null, 3, 2, 0, 1, 3]], ['Am7', [null, 0, 2, 0, 1, 3]], ['F', [1, 3, 3, 2, 1, 1]], ['F', [null, null, 3, 2, 1, 1]],
    ['Bb', [null, 1, 3, 3, 3, 1]], ['A', [null, 0, 2, 2, 2, 0]], ['A', [0, 0, 2, 2, 2, 0]], ['Em', [0, 2, 2, 0, 0, 0]], ['Fmaj7', [null, null, 3, 2, 1, 0]],
    ['C', [null, 3, null, 0, 1, 0]], ['C5', [null, 3, 5, null, null, null]], ['Dm7', [null, null, 3, 5, 3, 5]], ['G6', [3, 2, 0, 0, 0, 0]], ['Em7', [0, 2, 2, 0, 3, 0]],
    ['Em', [0, 2, 2, 0, 3, 0]], ['C', [null, 3, 2, 0, 1, null]], ['Am', [5, 7, 7, 5, 5, 5]], ['A7', [null, 0, 2, 0, 2, 0]], ['Asus2', [null, 0, 2, 2, 0, 0]],
  ];
  for (const [sym, frets, bass] of cases) log('plant', sym, frets.map((f) => f ?? 'x').join(''), '->', voicingLabelProblem(sym, frets, std, 0, { bassMidi: bass ?? null }) ?? 'ok');
  const planted = parseSixTab(`title: T\ntempo: 90\ntime: 4/4\n| "Dm=xx3235" q D D D D | "C=032010" D D D D | "Am/C=x32210" D D D D | "G7=xx0001" w D |\n`);
  log('planted song:', JSON.stringify(planted.errors), planted.warnings.map((w) => w.message).join(' || '));
  log('validate:', validateSong(planted.song!).map((i) => `${i.level} ${i.code}: ${i.message}`).join('\n   '));
}, 300_000);
