// TEMPORARY review scratch (deleted after the review).
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { sixTab } from './sixtab-parse';
import { estimateDifficulty } from './stats';
import { estimateDifficulty as oldEstimate } from './zz-review-old-stats';

it('dump', async () => {
  const rows: unknown[] = [];
  for (const e of SONG_ENTRIES) {
    const song = sixTab(await loadSongText(e.id));
    const n = estimateDifficulty(song);
    const o = oldEstimate(song);
    rows.push({ id: e.id, level: e.level, kind: e.kind, old: o.level, now: n.level, oldScore: o.score, score: n.score, factors: n.factors, oldFactors: o.factors, reasons: n.reasons, oldReasons: o.reasons });
  }
  writeFileSync(process.env.OUT!, JSON.stringify(rows, null, 1));
}, 300_000);
