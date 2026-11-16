// TEMPORARY review scratch (deleted after the review).
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { SONG_ENTRIES, loadSongText } from '@/content/songs';
import { getKey, keyModeName, chroma } from '@/core/theory';
import { sixTab } from './sixtab-parse';
const log = (...a: unknown[]) => appendFileSync(process.env.OUT!, a.join(' ') + '\n');
const MODES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];

it('mode fit', async () => {
  for (const e of SONG_ENTRIES) {
    const song = sixTab(await loadSongText(e.id));
    const k = song.key ? getKey(song.key) : null;
    if (!k) { log(e.id, 'NO KEY', song.key); continue; }
    const hist = new Array(12).fill(0);
    for (const t of song.tracks) for (const m of t.measures) for (const b of m.beats) for (const n of b.notes) if (!n.tie && !n.dead) hist[((n.midi % 12) + 12) % 12]++;
    const total = hist.reduce((s, x) => s + x, 0) || 1;
    const outside = (mode: string) => {
      const kk = getKey({ tonic: k.tonic, mode: mode === 'major' ? 'major' : 'minor', ...(mode !== 'major' && mode !== 'minor' ? { modal: mode as 'dorian' } : {}) })!;
      const pcs = new Set(kk.scale.map((x) => chroma(x)));
      return hist.reduce((s, c, pc) => s + (pcs.has(pc) ? 0 : c), 0) / total;
    };
    const declared = keyModeName(k);
    const mine = outside(declared);
    const best = MODES.map((m) => [m, outside(m)] as const).sort((a, b) => a[1] - b[1])[0];
    if (best[0] !== declared && best[1] + 0.02 < mine) log(e.id.padEnd(28), 'declared', `${k.tonic} ${declared}`.padEnd(14), 'out', mine.toFixed(3), 'best', best[0], best[1].toFixed(3), 'meta', e.key);
  }
}, 300_000);
