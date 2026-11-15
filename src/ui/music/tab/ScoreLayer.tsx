/**
 * The standard-notation staff above the tab, engraved by VexFlow 4 (loaded on first use) from the
 * same measures and placed by hand so every notehead stands exactly above its fret numbers.
 * Spacing and height come from the pure `score.ts`, so the layout reserves the staff's room
 * before VexFlow arrives (faint staff lines hold it) and nothing jumps when it does. If VexFlow
 * cannot load, the view relayouts as tab only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadVexFlow } from '../notation/NotationView';
import { vexKey } from '../notation/model';
import { barRestX } from './draw';
import type { NotationSpacing, TabLayout, TabTile } from './layout';
import type { TabModel } from './model';
import { buildScore, regionMetrics, scoreSpacing, type ScoreModel } from './score';
import styles from './TabView.module.css';

type VexFlowModule = Awaited<ReturnType<typeof loadVexFlow>>;

/** What the tab view needs to know about the staff. */
export interface ScoreState {
  /** Lay out with the staff (VexFlow may still be loading). */
  ready: boolean;
  spacing: NotationSpacing | null;
  score: ScoreModel | null;
  vf: VexFlowModule | null;
}

let loaded: VexFlowModule | null = null;

/** Build the staff model and load VexFlow when `enabled`. */
export function useScoreSpacing(model: TabModel | null, enabled: boolean): ScoreState {
  const [vf, setVf] = useState<VexFlowModule | null>(loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || vf) return;
    let cancelled = false;
    loadVexFlow()
      .then((m) => {
        loaded = m;
        if (!cancelled) setVf(m);
      })
      .catch((e: unknown) => {
        console.warn('Notation could not be loaded; showing tab only.', e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, vf]);
  const score = useMemo(() => (enabled && model && !failed ? buildScore(model) : null), [enabled, model, failed]);
  const spacing = useMemo(() => (score && model ? scoreSpacing(score, model) : null), [score, model]);
  return useMemo(() => ({ ready: !!(enabled && !failed && spacing), spacing, score, vf }), [enabled, failed, spacing, score, vf]);
}

const engraved = new WeakMap<TabLayout, Map<number, string>>();

/** The staff of one tile. */
export function ScoreLayer({ layout, tile, score }: { layout: TabLayout; tile: TabTile; score: ScoreState }) {
  const host = useRef<HTMLDivElement | null>(null);
  const sys = layout.systems[tile.system];
  const row = sys.rows.notation;
  const z = layout.metrics.zoom;
  const metrics = useMemo(() => (score.score ? regionMetrics(score.score, sys.measures) : null), [score.score, sys]);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !score.vf || !score.score || !row) return;
    let perLayout = engraved.get(layout);
    if (!perLayout) engraved.set(layout, (perLayout = new Map()));
    let markup = perLayout.get(tile.index);
    if (markup === undefined) {
      try {
        markup = engraveTile(score.vf, layout, tile, score.score);
      } catch (e) {
        console.warn('A notation line could not be drawn', e);
        markup = '';
      }
      perLayout.set(tile.index, markup);
    }
    el.innerHTML = markup;
    setDrawn(true);
  }, [score.vf, score.score, layout, tile, row]);

  if (!row || !metrics) return null;
  const staffY = metrics.staffY * z;
  return (
    <div className={styles.score} style={{ top: row.y, height: row.h, width: tile.width }} aria-hidden="true">
      {!drawn && (
        <svg className={styles.scorePlaceholder} width={tile.width} height={row.h}>
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={Math.max(0, sys.staffX - tile.x)} x2={tile.width} y1={staffY + i * 10 * z} y2={staffY + i * 10 * z} />
          ))}
        </svg>
      )}
      <div ref={host} className={styles.scoreInk} />
    </div>
  );
}

/** Engrave the staff of a tile; returns SVG markup in tile coordinates. */
export function engraveTile(VF: VexFlowModule, layout: TabLayout, tile: TabTile, score: ScoreModel): string {
  const { Renderer, Stave, StaveNote, Beam, Accidental, Dot, StaveTie, Tuplet, Articulation, BarlineType, TickContext, ModifierContext } = VF;
  const z = layout.metrics.zoom;
  const sys = layout.systems[tile.system];
  const row = sys.rows.notation!;
  const model = layout.model;
  const { staffY } = regionMetrics(score, sys.measures);
  const div = document.createElement('div');
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(sys.width / z, row.h / z);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  // A long line is drawn in tiles: draw a measure either side and let the viewBox clip, so ties and beams run on.
  const pos = sys.measures.indexOf(tile.from);
  const endPos = sys.measures.indexOf(tile.to - 1);
  const drawList = sys.measures.slice(Math.max(0, pos - 1), Math.min(sys.measures.length, endPos + 2));
  type SN = InstanceType<typeof StaveNote>;
  const drawn = new Map<string, SN>();
  const keyOf = (mi: number, ci: number) => `${mi}:${ci}`;
  const beams: Array<InstanceType<typeof Beam>> = [];
  const tuplets: Array<InstanceType<typeof Tuplet>> = [];

  drawList.forEach((mi) => {
    const lm = layout.measures[mi];
    const m = model.measures[mi];
    const sm = score.measures[mi];
    const first = mi === sys.measures[0];
    const x0 = (first ? sys.staffX : lm.x) / z;
    const x1 = (lm.x + lm.width) / z;
    const stave = new Stave(x0, staffY, x1 - x0, { space_above_staff_ln: 0, space_below_staff_ln: 0, fill_style: 'currentColor' });
    stave.setDefaultLedgerLineStyle({ strokeStyle: 'currentColor', lineWidth: 1.2 });
    if (first) {
      stave.addClef('treble', 'default', '8vb');
      if (sm.fifths) stave.addKeySignature(sm.keyVex);
    } else if (m.keyChange) {
      stave.addKeySignature(sm.keyVex, score.measures[mi - 1]?.keyVex);
    }
    if (m.showTime) stave.addTimeSignature(`${m.time.numerator}/${m.time.denominator}`);
    stave.setBegBarType(m.repeatStart ? BarlineType.REPEAT_BEGIN : first ? BarlineType.SINGLE : BarlineType.NONE);
    stave.setEndBarType(m.endBar === 'repeat' ? BarlineType.REPEAT_END : m.endBar === 'final' ? BarlineType.END : m.endBar === 'double' ? BarlineType.DOUBLE : BarlineType.SINGLE);
    stave.setContext(ctx).draw();

    const notes: SN[] = sm.columns.map((c, ci) => {
      const tc = m.columns[ci];
      let sn: SN;
      const barRest = m.columns.length === 1 && tc.rest;
      if (c.slash) {
        sn = new StaveNote({ keys: ['b/4'], duration: c.duration, dots: c.dots, clef: 'treble', type: 's', auto_stem: true });
      } else if (c.rest || !c.keys.length) {
        sn = new StaveNote({ keys: ['b/4'], duration: `${barRest ? 'w' : c.duration}r`, dots: barRest ? 0 : c.dots, clef: 'treble' });
      } else {
        sn = new StaveNote({
          keys: c.keys.map((k, i) => vexKey(k, 1) + (c.dead[i] ? '/x2' : '')),
          duration: c.duration,
          dots: c.dots,
          clef: 'treble',
          auto_stem: true,
        });
        c.accidentals.forEach((g, i) => {
          if (g) sn.addModifier(new Accidental(g), i);
        });
        if (c.accent) sn.addModifier(new Articulation('a>'), 0);
        if (c.staccato) sn.addModifier(new Articulation('a.'), 0);
      }
      if (c.dots > 0 && !barRest) Dot.buildAndAttach([sn], { all: true });
      return sn;
    });
    // Beams and tuplets set stem directions and must exist before the notes are formatted.
    for (const group of m.beamGroups) {
      const g = group.map((i) => notes[i]).filter(Boolean);
      if (g.length > 1) beams.push(new Beam(g, true));
    }
    for (const t of m.tuplets) {
      const g = t.events.map((i) => notes[i]);
      const matches = m.beamGroups.some((b) => b.length === t.events.length && b.every((v, k) => v === t.events[k]));
      tuplets.push(new Tuplet(g, { num_notes: t.actual, notes_occupied: t.normal, bracketed: !matches || !!t.partial, ratioed: false }));
    }
    notes.forEach((sn, ci) => {
      sn.setStave(stave);
      sn.setContext(ctx);
      sn.addToModifierContext(new ModifierContext());
      const tc = new TickContext();
      tc.addTickable(sn);
      tc.preFormat();
      tc.setX(0);
      const target = m.columns.length === 1 && m.columns[0].rest ? barRestX(layout, mi) : lm.x + lm.cols[ci].x;
      const head = (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2;
      tc.setX(target / z - head);
      drawn.set(keyOf(mi, ci), sn);
    });
    notes.forEach((sn) => sn.draw());
  });
  beams.forEach((b) => b.setContext(ctx).draw());
  tuplets.forEach((t) => t.setContext(ctx).draw());

  // Ties: from the previous pitched column (perhaps in the measure before), split at the system's edges.
  const prevOf = (mi: number, ci: number): [number, number] | null => {
    let m = mi;
    let c = ci - 1;
    while (m >= 0) {
      if (c < 0) {
        m--;
        if (m < 0) return null;
        c = score.measures[m].columns.length - 1;
        continue;
      }
      return [m, c];
    }
    return null;
  };
  drawList.forEach((mi) => {
    score.measures[mi].columns.forEach((c, ci) => {
      const idx = c.tiedFrom.map((t, k) => (t ? k : -1)).filter((k) => k >= 0);
      if (!idx.length) return;
      const prev = prevOf(mi, ci);
      if (!prev) return;
      const pc = score.measures[prev[0]].columns[prev[1]];
      const pairs = idx.map((k) => ({ k, p: pc.keys.indexOf(c.keys[k]) })).filter((x) => x.p >= 0);
      if (!pairs.length) return;
      const a = drawn.get(keyOf(prev[0], prev[1]));
      const b = drawn.get(keyOf(mi, ci));
      if (!b) return;
      const sameSystem = layout.measures[prev[0]]?.system === sys.index;
      if (a && sameSystem) new StaveTie({ first_note: a, last_note: b, first_indices: pairs.map((x) => x.p), last_indices: pairs.map((x) => x.k) }).setContext(ctx).draw();
      else if (!sameSystem) new StaveTie({ last_note: b, first_indices: pairs.map((x) => x.k), last_indices: pairs.map((x) => x.k) }).setContext(ctx).draw();
    });
  });
  // A tie that runs into the next system starts here.
  const lastMi = sys.measures[sys.measures.length - 1];
  if (drawList.includes(lastMi) && lastMi + 1 < score.measures.length && layout.measures[lastMi + 1]?.system !== sys.index) {
    const next = score.measures[lastMi + 1].columns[0];
    const lastCi = score.measures[lastMi].columns.length - 1;
    const a = drawn.get(keyOf(lastMi, lastCi));
    const pc = score.measures[lastMi].columns[lastCi];
    if (a && next) {
      const pairs = next.tiedFrom.map((t, k) => (t ? pc.keys.indexOf(next.keys[k]) : -1)).filter((p) => p >= 0);
      if (pairs.length) new StaveTie({ first_note: a, first_indices: pairs, last_indices: pairs }).setContext(ctx).draw();
    }
  }

  const svg = div.querySelector('svg');
  if (!svg) return '';
  svg.setAttribute('viewBox', `${(tile.x / z).toFixed(2)} 0 ${(tile.width / z).toFixed(2)} ${(row.h / z).toFixed(2)}`);
  svg.setAttribute('width', String(tile.width));
  svg.setAttribute('height', String(row.h));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('stroke', 'currentColor');
  svg.removeAttribute('style');
  return div.innerHTML;
}
