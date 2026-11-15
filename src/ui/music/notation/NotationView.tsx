/**
 * Standard notation on one staff, engraved by VexFlow 4. VexFlow loads on first use (a dynamic
 * import; it draws its glyphs as paths, so nothing else is fetched) while a placeholder of the
 * right height holds the space.
 *
 *   <NotationView notes="E4/q F#4/8 G4/8 A4/h | B4/w" keySignature="G major" time="4/4" />
 *   <NotationView notes={[{ keys: ['C4', 'E4', 'G4'], duration: 'w', label: 'C' }]} clef="treble" />
 *
 * Pitches are what sounds; the default `treble-8vb` clef writes them an octave higher, as guitar
 * music is written. Everything is drawn in the theme's ink (`currentColor`); coloured noteheads
 * take degree / finger colour names. The highlighted note can change every beat without a redraw.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { intervalBetween, intervalToDegree, pcName } from '@/core/theory';
import { cx, useElementSize } from '@/ui';
import { degreeColor, degreeText, noteText } from '../format';
import { useMusicSettings } from '../settings';
import tone from '../tone.module.css';
import type { MusicColor, NoteNaming } from '../types';
import { breakLines, keySpec, measureAccidentals, normaliseItems, splitMeasures, stretchLine, timeOf, vexKey, type NotationItem, type ParsedNote } from './model';
import styles from './NotationView.module.css';

type VexFlowModule = typeof import('vexflow/bravura');

let vexflowPromise: Promise<VexFlowModule> | null = null;

/** Load VexFlow once (Bravura glyphs only, bundled as paths: no font files, no network). */
export function loadVexFlow(): Promise<VexFlowModule> {
  vexflowPromise ??= import('vexflow/bravura').catch((e: unknown) => {
    vexflowPromise = null;
    throw e;
  });
  return vexflowPromise;
}

/** The clefs: `treble-8vb` is the guitar's (sounding pitch written an octave up, with the small 8). */
export type NotationClef = 'treble' | 'treble-8vb' | 'bass';

/** Props of `<NotationView>`. */
export interface NotationViewProps {
  /** The music: compact text (`'E4/q F#4/8 G4/8 | A4/w'`) or a list of notes and `'|'` barlines. Plain pitch strings are quarter notes. */
  notes: string | ReadonlyArray<NotationItem | string>;
  /** Default `treble-8vb` (guitar). */
  clef?: NotationClef;
  /** Key for the signature: `G major`, `E minor`, `Bb`. Default none (C major). */
  keySignature?: string;
  /** Time signature to print and to bar by: `4/4`, `3/4`, `6/8`, `C`. Without it notes are not barred. */
  time?: string;
  /** Text under every note: note names, degrees against the key's tonic (or `tonic`), or none (default). */
  labels?: 'none' | 'names' | 'degrees';
  /** Colour noteheads by degree against the key's tonic (or `tonic`). Default none. */
  colorBy?: 'none' | 'degree';
  /** Reference note for degrees and degree colours when it is not the key's tonic. */
  tonic?: string;
  /** Index of the note to highlight (playback, "this one"). Changing it does not re-engrave. */
  highlight?: number | null;
  /** Note naming for `names` labels (default: the learner's setting). */
  naming?: NoteNaming;
  /** Scale of the engraving (default 1, 0.85 on narrow screens). */
  scale?: number;
  /** Accessible description (default: a summary of clef, key, time and note count). */
  'aria-label'?: string;
  className?: string;
}

const LINE_GAP = 24;
const TOP = 6;

/** Standard notation. See the module comment. */
export const NotationView = memo(function NotationView(props: NotationViewProps) {
  const settings = useMusicSettings();
  const { notes, clef = 'treble-8vb', keySignature, time, labels = 'none', colorBy = 'none', tonic, highlight = null, naming = settings.naming, className } = props;
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const idsRef = useRef<string[][]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [height, setHeight] = useState<number | null>(null);

  const parsed = useMemo(() => normaliseItems(notes), [notes]);
  const signature = useMemo(() => keySpec(keySignature), [keySignature]);
  const timeSig = useMemo(() => timeOf(time), [time]);
  const reference = tonic ?? signature.tonic;
  const scale = props.scale ?? (width > 0 && width < 480 ? 0.85 : 1);
  const measures = useMemo(() => splitMeasures(parsed.notes, parsed.bars, timeSig), [parsed, timeSig]);
  const engraveKey = JSON.stringify([parsed.notes, parsed.bars, clef, signature.vex, time, labels, colorBy, reference, naming, scale]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || width <= 0) return;
    let cancelled = false;
    loadVexFlow()
      .then((VF) => {
        if (cancelled) return;
        const result = engrave(VF, host, {
          measures,
          clef,
          keyVex: signature.vex,
          keyFifths: signature.fifths,
          time: timeSig?.text ?? null,
          timeBeats: timeSig ? [timeSig.numerator, timeSig.denominator] : null,
          width: width / scale,
          scale,
          labels,
          colorBy,
          reference,
          naming,
        });
        idsRef.current = result.ids;
        setHeight(result.height);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('Notation could not be drawn', e);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // engraveKey stands for every input of the engraving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engraveKey, width]);

  // Move the highlight by toggling an attribute: no re-engraving per beat.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== 'ready') return;
    host.querySelectorAll('[data-current]').forEach((el) => el.removeAttribute('data-current'));
    if (highlight === null || highlight === undefined) return;
    for (const id of idsRef.current[highlight] ?? []) host.querySelector(`[id="${id}"]`)?.setAttribute('data-current', 'true');
  }, [highlight, status, engraveKey, width]);

  const description = props['aria-label'] ?? describe(parsed.notes.length, clef, keySignature, time);
  const placeholderHeight = Math.max(1, Math.ceil(parsed.notes.length / 8)) * 130 * scale;
  return (
    <div ref={sizeRef} className={cx(styles.root, className)}>
      <div
        ref={hostRef}
        className={styles.ink}
        role="img"
        aria-label={description}
        aria-busy={status === 'loading' || undefined}
        style={{ minHeight: status === 'ready' ? undefined : height ?? placeholderHeight }}
      />
      {status === 'loading' && <div className={styles.skeleton} aria-hidden="true" />}
      {status === 'error' && <p className={styles.error}>The notation could not be drawn here. The notes are: {parsed.notes.map((n) => (n.rest ? 'rest' : n.keys.map((k) => noteText(k, naming, { octave: true })).join('+'))).join(', ')}.</p>}
      {parsed.errors.length > 0 && import.meta.env.DEV && <p className={styles.error}>{parsed.errors.join(' ')}</p>}
    </div>
  );
});

function describe(count: number, clef: NotationClef, keyName?: string, time?: string): string {
  const parts = [`Staff in ${clef === 'bass' ? 'bass' : 'treble'} clef${clef === 'treble-8vb' ? ' (guitar, sounding an octave lower)' : ''}`];
  if (keyName) parts.push(`key of ${keyName}`);
  if (time) parts.push(`${time} time`);
  parts.push(`${count} ${count === 1 ? 'note' : 'notes'}`);
  return parts.join(', ');
}

interface EngraveOptions {
  measures: ReturnType<typeof splitMeasures>;
  clef: NotationClef;
  keyVex: string;
  keyFifths: number;
  time: string | null;
  timeBeats: [number, number] | null;
  width: number;
  scale: number;
  labels: 'none' | 'names' | 'degrees';
  colorBy: 'none' | 'degree';
  reference: string | null;
  naming: NoteNaming;
}

/** The degree of a pitch against a reference note (`E` against `C` -> `3`), or null. */
function degreeAgainst(pitch: string, reference: string | null): string | null {
  if (!reference) return null;
  try {
    return intervalToDegree(intervalBetween(pcName(reference), pcName(pitch)));
  } catch {
    return null;
  }
}

/**
 * Draw everything into `host`. Returns the drawn height and, per source note, the DOM ids of its
 * note groups (a note split at a barline has two).
 */
function engrave(VF: VexFlowModule, host: HTMLDivElement, o: EngraveOptions): { height: number; ids: string[][] } {
  const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Accidental, Dot, StaveTie, Tuplet, Articulation, BarlineType } = VF;
  host.innerHTML = '';
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  const ctx = renderer.getContext();
  // The root starts in black; everything is drawn in the theme's ink instead.
  const root = host.querySelector('svg');
  root?.setAttribute('fill', 'currentColor');
  root?.setAttribute('stroke', 'currentColor');
  // Drawn at unit scale; the viewBox scales it at the end (VexFlow's own scale() compounds on every resize).
  renderer.resize(o.width, 200);
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');
  const shift = o.clef === 'treble-8vb' ? 1 : 0;
  const vexClef = o.clef === 'bass' ? 'bass' : 'treble';
  const restKey = o.clef === 'bass' ? 'd/3' : 'b/4';
  const ids: string[][] = [];
  // Noteheads are rebuilt whenever a stem turns, so their ids are given just before drawing.
  const colourMarks: Array<{ note: InstanceType<typeof StaveNote>; key: number; id: string; color: MusicColor }> = [];
  let serial = 0;
  const uid = `n${Math.random().toString(36).slice(2, 8)}`;

  // Build every measure's notes, voice, beams and tuplets.
  type Built = { notes: InstanceType<typeof StaveNote>[]; src: ParsedNote[]; voice: InstanceType<typeof Voice>; beams: InstanceType<typeof Beam>[]; tuplets: InstanceType<typeof Tuplet>[]; natural: number };
  const built: Built[] = o.measures.map((m) => {
    const accidentals = measureAccidentals(m.notes, o.keyFifths);
    const staveNotes = m.notes.map((n, i) => {
      const sn = new StaveNote({
        keys: n.rest ? [restKey] : n.keys.map((k) => vexKey(k, shift)),
        duration: `${n.duration}${n.rest ? 'r' : ''}`,
        dots: n.dots,
        clef: vexClef,
        auto_stem: true,
      });
      const groupId = `${uid}-${serial++}`;
      sn.setAttribute('id', groupId);
      (ids[n.index] ??= []).push(`vf-${groupId}`);
      accidentals[i].forEach((glyph, k) => {
        if (glyph) sn.addModifier(new Accidental(glyph), k);
      });
      if (n.dots > 0) Dot.buildAndAttach([sn], { all: true });
      if (n.accent && !n.rest && !n.continuation) sn.addModifier(new Articulation('a>'), 0);
      n.keys.forEach((k, ki) => {
        const color = n.colors[ki] ?? (o.colorBy === 'degree' ? degreeColorOf(k, o.reference) : null);
        if (color) colourMarks.push({ note: sn, key: ki, id: `${groupId}-h${ki}`, color });
      });
      return sn;
    });
    const voice = new Voice(o.timeBeats ? { num_beats: o.timeBeats[0], beat_value: o.timeBeats[1] } : { num_beats: 4, beat_value: 4 });
    voice.setMode(Voice.Mode.SOFT);
    voice.addTickables(staveNotes);
    const tuplets: Built['tuplets'] = [];
    for (let i = 0; i < m.notes.length; ) {
      if (m.notes[i].triplet) {
        const group = staveNotes.slice(i, i + 3).filter((_n, k) => m.notes[i + k]?.triplet);
        if (group.length >= 2) tuplets.push(new Tuplet(group, { num_notes: 3, notes_occupied: 2 }));
        i += Math.max(1, group.length);
      } else i++;
    }
    const beamable = staveNotes.filter((_sn, i) => !m.notes[i].rest);
    const beams = Beam.generateBeams(beamable, {
      groups: o.time ? Beam.getDefaultBeamGroups(o.time) : undefined,
      beam_rests: false,
    });
    const formatter = new Formatter();
    formatter.joinVoices([voice]);
    const min = staveNotes.length ? formatter.preCalculateMinTotalWidth([voice]) : 20;
    return { notes: staveNotes, src: m.notes, voice, beams, tuplets, natural: Math.max(64, min * 1.5 + 36) };
  });

  // Widths of what opens each line.
  const clefW = 34;
  const keyW = Math.abs(o.keyFifths) * 10 + (o.keyFifths ? 8 : 0);
  const timeW = o.time ? 26 : 0;
  const available = Math.max(160, o.width - 2);
  const lines = breakLines(built.map((b) => b.natural), available, clefW + keyW, timeW);
  const labelled = o.labels !== 'none' || built.some((b) => b.src.some((n) => n.label));

  let y = TOP;
  const labelEls: Array<{ x: number; y: number; lines: string[] }> = [];
  const tiesToDraw: Array<{ from: number; to: number }> = [];
  const flat = built.flatMap((b, mi) => b.notes.map((sn, ni) => ({ sn, src: b.src[ni], mi })));
  flat.forEach((f, i) => {
    if (f.src.tie && i + 1 < flat.length && !flat[i + 1].src.rest) tiesToDraw.push({ from: i, to: i + 1 });
  });
  const lineOfMeasure = new Map<number, number>();
  lines.forEach((line, li) => line.forEach((mi) => lineOfMeasure.set(mi, li)));

  lines.forEach((line, li) => {
    const isFirst = li === 0;
    const extra = clefW + keyW + (isFirst ? timeW : 0);
    const natural = line.map((mi, k) => built[mi].natural + (k === 0 ? extra : 0));
    const widths = stretchLine(natural, available, li === lines.length - 1);
    const draw = (top: number) => {
      let x = 1;
      const staves = line.map((mi, k) => {
        // Little fixed room above and below: each line is moved down as far as its notes reach.
        const stave = new Stave(x, top, widths[k], { fill_style: 'currentColor', space_above_staff_ln: 2, space_below_staff_ln: 1 });
        stave.setDefaultLedgerLineStyle({ strokeStyle: 'currentColor', lineWidth: 1.3 });
        if (k === 0) {
          stave.addClef(vexClef, 'default', o.clef === 'treble-8vb' ? '8vb' : undefined);
          if (o.keyFifths !== 0) stave.addKeySignature(o.keyVex);
          if (isFirst && o.time) stave.addTimeSignature(o.time);
        }
        if (!o.time) {
          // Free notes: no barlines between chunks, a closing line at the very end.
          stave.setBegBarType(BarlineType.NONE);
          stave.setEndBarType(mi === built.length - 1 ? BarlineType.SINGLE : BarlineType.NONE);
        } else if (mi === built.length - 1) {
          stave.setEndBarType(BarlineType.END);
        }
        x += widths[k];
        return stave;
      });
      line.forEach((mi, k) => {
        const b = built[mi];
        if (!b.notes.length) return;
        new Formatter().joinVoices([b.voice]).formatToStave([b.voice], staves[k]);
      });
      return staves;
    };
    // Format once to find how far notes reach above the staff, then place the line so they fit.
    let staves = draw(y);
    let topReach = staves[0].getYForLine(0) - 18;
    let bottomReach = staves[0].getBottomLineY();
    line.forEach((mi) => {
      built[mi].notes.forEach((sn, ni) => {
        const reach = noteReach(sn, built[mi].src[ni]);
        if (!reach) return;
        topReach = Math.min(topReach, reach.top);
        bottomReach = Math.max(bottomReach, reach.bottom);
      });
    });
    const delta = Math.max(0, y + 2 - topReach);
    if (delta > 0) {
      staves = draw(y + delta);
      bottomReach += delta;
    }
    staves.forEach((s) => s.setContext(ctx).draw());
    line.forEach((mi) => {
      const b = built[mi];
      if (!b.notes.length) return;
      for (const mark of colourMarks) if (b.notes.includes(mark.note)) mark.note.noteHeads[mark.key]?.setAttribute('id', mark.id);
      b.voice.draw(ctx, staves[line.indexOf(mi)]);
      b.beams.forEach((beam) => beam.setContext(ctx).draw());
      b.tuplets.forEach((t) => t.setContext(ctx).draw());
    });
    // Labels sit on one baseline under the lowest note of the line.
    const labelY = Math.max(staves[0].getBottomLineY() + 22, bottomReach + 14);
    if (labelled) {
      line.forEach((mi) => {
        const b = built[mi];
        b.notes.forEach((sn, ni) => {
          const src = b.src[ni];
          if (src.rest || src.continuation) return;
          const text = src.label !== undefined ? [src.label] : labelLines(src, o);
          if (!text.length || text.every((t) => !t)) return;
          labelEls.push({ x: (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2, y: labelY, lines: text });
        });
      });
    }
    const maxLabelLines = labelled ? Math.max(1, ...labelEls.filter((l) => l.y === labelY).map((l) => l.lines.length)) : 0;
    // The small 8 under a guitar clef hangs well below the staff: the next line keeps clear of it too.
    const clefBottom = staves[0].getBottomLineY() + (o.clef === 'treble-8vb' ? 24 : 8);
    y = Math.max(labelled ? labelY + (maxLabelLines - 1) * 13 + 8 : bottomReach + 6, clefBottom) + LINE_GAP;
  });

  // Ties, including the halves of a tie that crosses a line break.
  for (const t of tiesToDraw) {
    const a = flat[t.from];
    const b = flat[t.to];
    const indices = a.src.keys.map((k, i) => ({ i, j: b.src.keys.indexOf(k) })).filter((p) => p.j >= 0);
    if (!indices.length) continue;
    const first_indices = indices.map((p) => p.i);
    const last_indices = indices.map((p) => p.j);
    if (lineOfMeasure.get(a.mi) === lineOfMeasure.get(b.mi)) {
      new StaveTie({ first_note: a.sn, last_note: b.sn, first_indices, last_indices }).setContext(ctx).draw();
    } else {
      new StaveTie({ first_note: a.sn, first_indices, last_indices: first_indices }).setContext(ctx).draw();
      new StaveTie({ last_note: b.sn, first_indices: last_indices, last_indices }).setContext(ctx).draw();
    }
  }

  const height = Math.ceil((y - LINE_GAP + 4) * o.scale);
  const drawnHeight = Math.ceil(y - LINE_GAP + 4);
  renderer.resize(o.width, drawnHeight);
  const svg = host.querySelector('svg');
  if (svg) {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', `0 0 ${o.width} ${drawnHeight}`);
    svg.setAttribute('width', String(o.width * o.scale));
    svg.setAttribute('height', String(height));
    svg.style.width = `${o.width * o.scale}px`;
    svg.style.height = `${height}px`;
    svg.classList.add(styles.svg);
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', styles.labels);
    for (const l of labelEls) {
      l.lines.forEach((line, i) => {
        const el = document.createElementNS(ns, 'text');
        el.setAttribute('x', l.x.toFixed(1));
        el.setAttribute('y', (l.y + i * 13).toFixed(1));
        el.textContent = line;
        group.appendChild(el);
      });
    }
    svg.appendChild(group);
    for (const mark of colourMarks) {
      const el = svg.querySelector(`[id="vf-${mark.id}"]`);
      if (!el) continue;
      el.classList.add(tone.tone, styles.coloured);
      el.setAttribute('data-c', mark.color);
    }
  }
  return { height, ids };
}

function degreeColorOf(pitch: string, reference: string | null): MusicColor | null {
  const degree = degreeAgainst(pitch, reference);
  return degree ? degreeColor(degree) : null;
}

function labelLines(n: ParsedNote, o: EngraveOptions): string[] {
  if (o.labels === 'none' || n.rest) return [];
  // Highest note on top, as the chord reads on the staff.
  const keys = [...n.keys].reverse();
  if (o.labels === 'names') return keys.map((k) => noteText(k, o.naming));
  return keys.map((k) => {
    const d = degreeAgainst(k, o.reference);
    return d ? degreeText(d, { root: '1' }) : '';
  });
}

/**
 * How far a formatted note reaches up and down: its noteheads, its stem, and room for an accent
 * or accidental. (VexFlow's own bounding box is not reliable before drawing.)
 */
function noteReach(
  sn: { getYs(): number[]; hasStem(): boolean; getStemExtents(): { topY: number; baseY: number } },
  src: ParsedNote,
): { top: number; bottom: number } | null {
  try {
    const ys = sn.getYs().filter(Number.isFinite);
    if (!ys.length) return null;
    let top = Math.min(...ys) - 7;
    let bottom = Math.max(...ys) + 7;
    if (!src.rest && sn.hasStem()) {
      const ext = sn.getStemExtents();
      if (Number.isFinite(ext.topY) && Number.isFinite(ext.baseY)) {
        top = Math.min(top, ext.topY, ext.baseY) - 2;
        bottom = Math.max(bottom, ext.topY, ext.baseY) + 2;
      }
    }
    if (src.accent) top -= 10;
    return { top, bottom };
  } catch {
    return null;
  }
}
