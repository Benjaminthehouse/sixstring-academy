/** Throwaway probe for the theory-path review: prints engine answers. Deleted after use. */
import { it } from 'vitest';
import { identifyFretted, scalePattern, scalePositions } from '@/core/guitar';
import { chordNotes, diatonicChords, scaleNotes, staffPosition } from '@/core/theory';

it('probe', () => {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const p = scalePattern('G', 'major', 'caged', i);
    if (!p) { out.push(`G caged ${i}: null`); continue; }
    const by: Record<number, number[]> = {};
    for (const n of p.notes) (by[n.string] ??= []).push(n.fret);
    out.push(`G major caged ${i}: ${p.name} shape=${p.shape} pos=${p.position} ${p.minFret}-${p.maxFret} ` +
      [6, 5, 4, 3, 2, 1].map((s) => `${s}:[${(by[s] ?? []).join(',')}]`).join(' ') + ` roots=${p.roots.map((r) => `${r.string}:${r.fret}`).join(' ')}`);
  }
  for (let i = 0; i < 7; i++) {
    const p = scalePattern('G', 'major', '3nps', i);
    if (!p) continue;
    const by: Record<number, number[]> = {};
    for (const n of p.notes) (by[n.string] ??= []).push(n.fret);
    out.push(`G major 3nps ${i}: ${[6, 5, 4, 3, 2, 1].map((s) => `${s}:[${(by[s] ?? []).join(',')}]`).join(' ')}`);
  }
  out.push(`A minor 7ths: ${diatonicChords('A minor', { sevenths: true }).map((c) => `${c.roman} ${c.symbol}`).join(', ')}`);
  out.push(`A harm minor 7ths: ${diatonicChords('A minor', { sevenths: true, minor: 'harmonic' }).map((c) => `${c.roman} ${c.symbol}`).join(', ')}`);
  out.push(`E minor 7ths: ${diatonicChords('E minor', { sevenths: true }).map((c) => `${c.roman} ${c.symbol}`).join(', ')}`);
  for (const c of ['G7sus4', 'C6/9', 'AmMaj7', 'Am6', 'D7sus4', 'Cmaj7', 'E7', 'G#dim7', 'Dsus4', 'Asus4']) out.push(`${c}: ${chordNotes(c).join(' ')}`);
  for (const f of ['x3545x', 'x5546x', '3x2453', 'x02013', '022000', 'x02210', '133211', 'x00232', 'xx0233', 'x0201x', 'x02213', '3x0003', 'x02212', '320033', 'x32013', '3x3010', 'x10211', 'x3x210', 'x3201x'])
    out.push(`${f}: ${identifyFretted(f).matches.slice(0, 3).map((m) => m.symbol).join(' / ')}`);
  out.push(`C major on string 5 frets 3-15: ${scalePositions('C', 'major', { minFret: 3, maxFret: 15 }).filter((n) => n.string === 5).map((n) => `${n.note}${n.fret}`).join(' ')}`);
  out.push(`E major on string 1 0-4: ${scalePositions('E', 'major', { minFret: 0, maxFret: 4 }).filter((n) => n.string === 1).map((n) => `${n.note}${n.fret}`).join(' ')}`);
  out.push(`G major 2nd pos (2-5): ${[6, 5, 4, 3, 2, 1].map((s) => `${s}:${scalePositions('G', 'major', { minFret: 2, maxFret: 5 }).filter((n) => n.string === s).map((n) => n.fret).join(',')}`).join(' ')}`);
  out.push(`A major 4th pos (4-7): ${[6, 5, 4, 3, 2, 1].map((s) => `${s}:${scalePositions('A', 'major', { minFret: 4, maxFret: 7 }).filter((n) => n.string === s).map((n) => n.fret).join(',')}`).join(' ')}`);
  out.push(`A major 5th pos (5-8): ${[6, 5, 4, 3, 2, 1].map((s) => `${s}:${scalePositions('A', 'major', { minFret: 5, maxFret: 8 }).filter((n) => n.string === s).map((n) => n.fret).join(',')}`).join(' ')}`);
  out.push(`written G5 pos ${staffPosition('G4').position}, E5 ${staffPosition('E5').position}`);
  out.push(`G major notes ${scaleNotes('G', 'major').join(' ')}`);
  require('node:fs').writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', out.join('\n'));
});
