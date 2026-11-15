/**
 * The arranger: pitch-only music (MIDI, MusicXML without tab, recognised sheet music) made
 * playable on the guitar, and the reverse (tab to spelled pitches for notation).
 *
 * Every beat's pitches can be played in several places. The arranger weighs the whole line at
 * once with dynamic programming over (candidate shape, hand position) states, using the guitar
 * engine's hand cost model: staying in position is cheap, shifting costs by distance (less after
 * a rest), stretches and high frets cost a little, open strings are natural, chords must be
 * holdable (`simultaneousCost`), and a hammer-on, pull-off, slide or tie keeps its string.
 */
import { DEFAULT_HAND_WEIGHTS, positionsForMidi, simultaneousCost, type FretPosition, type HandWeights } from '@/core/guitar';
import { spellInKey } from '@/core/theory';
import { cloneSong, findTrack, midiOf, trackCapo, trackTuning } from './model';
import type { Beat, LeftFinger, Note, Song, Track } from './types';
import { PPQ } from './types';

/** Options for the arranger. */
export interface ArrangeOptions {
  /** Tuning to arrange for (default: the track's). */
  tuning?: number[];
  /** Capo to arrange for (default: the track's). */
  capo?: number;
  /** Highest fret to use (default 17). */
  maxFret?: number;
  /** Keep the hand near this fret when the music allows. */
  preferPosition?: number;
  /** Override the hand cost weights of the guitar engine. */
  weights?: Partial<HandWeights>;
  /** Prefer each note's current string (re-fingering after a tuning or capo change). Default false. */
  keepStrings?: boolean;
  /** Move the whole part by octaves to fit the guitar when needed (default true). */
  octaves?: boolean;
  /** Write fretting-hand fingers into the notes (default false: fingers are removed, as the old ones no longer fit). */
  fingers?: boolean;
}

/** What `arrangeTrack` did. */
export interface ArrangeResult {
  track: Track;
  /** Octaves the whole part was moved (+1 = up an octave). */
  octaveShift: number;
  /** Total hand cost (lower = easier). */
  cost: number;
  /** Plain-language notes: octave moves, dropped chord notes, techniques that could not be kept. */
  warnings: string[];
}

interface Candidate {
  positions: FretPosition[];
  /** Index into the beat's notes for each position. */
  noteIndex: number[];
  lo: number;
  hi: number;
  shapeCost: number;
}

interface State {
  cand: number;
  pos: number | null;
  cost: number;
  back: number;
}

const MAX_CANDIDATES = 10;

/** Shapes that play `midis` together, easiest first (at most MAX_CANDIDATES). */
function chordCandidates(midis: number[], tuning: number[], capo: number, maxFret: number): Candidate[] {
  const range = { tuning, capo, maxFret };
  const choices = midis.map((m) => positionsForMidi(m, range));
  const out: Candidate[] = [];
  const used = new Set<number>();
  const chosen: FretPosition[] = [];
  const idx: number[] = [];
  const walk = (k: number, lo: number, hi: number) => {
    if (out.length > 200) return;
    if (k === midis.length) {
      const cost = midis.length > 1 ? simultaneousCost(chosen, { tuning }) : 0;
      if (!Number.isFinite(cost)) return;
      out.push({ positions: chosen.map((p) => ({ ...p })), noteIndex: [...idx], lo: Number.isFinite(lo) ? lo : 0, hi: Number.isFinite(hi) ? hi : 0, shapeCost: cost });
      return;
    }
    for (const p of choices[k]) {
      if (used.has(p.string)) continue;
      const nlo = p.fret > 0 ? Math.min(lo, p.fret) : lo;
      const nhi = p.fret > 0 ? Math.max(hi, p.fret) : hi;
      if (nhi - nlo > 4) continue;
      used.add(p.string);
      chosen.push(p);
      idx.push(k);
      walk(k + 1, nlo, nhi);
      idx.pop();
      chosen.pop();
      used.delete(p.string);
    }
  };
  walk(0, Infinity, -Infinity);
  out.sort((a, b) => a.shapeCost + 0.03 * (a.lo + a.hi) - (b.shapeCost + 0.03 * (b.lo + b.hi)));
  return out.slice(0, midis.length > 1 ? MAX_CANDIDATES : 24);
}

/** Hand positions (fret under the index finger) that can hold a shape, with how many fingers stretch. */
function handPositions(c: Candidate): Array<{ pos: number | null; stretches: number }> {
  const fretted = c.positions.filter((p) => p.fret > 0).map((p) => p.fret);
  if (!fretted.length) return [{ pos: null, stretches: 0 }];
  const out: Array<{ pos: number; stretches: number }> = [];
  for (let p = Math.max(1, c.hi - 4); p <= c.lo + 1; p++) {
    let stretches = 0;
    let ok = true;
    for (const f of fretted) {
      if (f >= p && f <= p + 3) continue;
      if (f === p - 1 || f === p + 4) stretches++;
      else ok = false;
    }
    if (ok) out.push({ pos: p, stretches });
  }
  return out;
}

/** The order of pitches a beat asks for, with the notes that have to be placed (ties are placed after). */
function beatPitches(beat: Beat): number[] {
  return beat.notes.map((n, i) => (n.tie ? -1 : i)).filter((i) => i >= 0);
}

/** Pick the octave shift that fits the most notes, preferring no shift. */
function bestOctave(midis: number[], low: number, high: number): number {
  let best = 0;
  let bestFit = -1;
  for (const k of [0, -1, 1, -2, 2, -3, 3]) {
    const fit = midis.filter((m) => m + 12 * k >= low && m + 12 * k <= high).length;
    if (fit > bestFit) {
      best = k;
      bestFit = fit;
    }
  }
  return best;
}

/**
 * Choose string and fret for every note of a track from its pitches (`note.midi`). Returns a new
 * track; the song is not changed. Rests, rhythm, lyrics and techniques are kept.
 */
export function arrangeTrack(song: Song, trackRef: string | number | Track | undefined, opts: ArrangeOptions = {}): ArrangeResult {
  const source = typeof trackRef === 'object' ? trackRef : findTrack(song, trackRef);
  if (!source) throw new RangeError(`No track "${String(trackRef)}" in "${song.meta.title}".`);
  const track: Track = JSON.parse(JSON.stringify(source));
  const tuning = opts.tuning ?? trackTuning(song, source);
  const capo = opts.capo ?? trackCapo(song, source);
  const maxFret = opts.maxFret ?? 17;
  const w = { ...DEFAULT_HAND_WEIGHTS, ...opts.weights };
  const warnings: string[] = [];
  const low = Math.min(...tuning) + capo;
  const high = Math.max(...tuning) + capo + maxFret;

  // Every struck beat in order, with the time of rest before it (in quarter notes) and the notes still
  // ringing from earlier beats (a bass held under a melody, a tied note): those keep their string and fret.
  interface Held { key: string; midi: number }
  interface Step { beat: Beat; bar: number; place: number[]; rest: number; dur: number; tick: number; held: Held[]; skip?: boolean }
  const steps: Step[] = [];
  let restTicks = 0;
  {
    let tick = 0;
    const active = new Map<string, { midi: number; end: number }>();
    const lastKey = new Map<number, string>();
    track.measures.forEach((m, bar) => {
      for (const beat of m.beats) {
        const t = tick + beat.start;
        if (!beat.notes.length && !beat.slash) active.clear();
        for (const n of beat.notes.filter((x) => x.tie)) {
          const key = lastKey.get(n.midi);
          if (key) active.set(key, { midi: n.midi, end: t + (n.length ?? beat.duration) });
        }
        for (const [key, a] of active) if (a.end <= t) active.delete(key);
        const place = beatPitches(beat);
        if (!place.length) {
          if (!beat.notes.length) restTicks += beat.duration;
          continue;
        }
        const struck = new Set(place.map((i) => beat.notes[i].midi));
        // A held note struck again ends; the new one takes over.
        for (const [key, a] of active) if (struck.has(a.midi)) active.delete(key);
        const held = [...active].map(([key, a]) => ({ key, midi: a.midi }));
        const index = steps.length;
        steps.push({ beat, bar, place, rest: restTicks / PPQ, dur: beat.duration / PPQ, tick: t, held });
        restTicks = 0;
        for (const i of place) {
          const n = beat.notes[i];
          const key = `${index}:${i}`;
          lastKey.set(n.midi, key);
          if (n.length !== undefined && n.length > beat.duration) active.set(key, { midi: n.midi, end: t + n.length });
        }
      }
      tick += m.beats.reduce((sum, b) => Math.max(sum, b.start + b.duration), 0);
    });
  }

  const all = steps.flatMap((s) => s.beat.notes.map((n) => n.midi));
  let octaveShift = 0;
  if (opts.octaves !== false && all.length) {
    octaveShift = bestOctave(all, low, high);
    if (octaveShift) {
      for (const m of track.measures) for (const b of m.beats) for (const n of b.notes) n.midi += 12 * octaveShift;
      for (const st of steps) for (const h of st.held) h.midi += 12 * octaveShift;
      warnings.push(`The part was moved ${Math.abs(octaveShift)} octave${Math.abs(octaveShift) > 1 ? 's' : ''} ${octaveShift > 0 ? 'up' : 'down'} to fit the guitar.`);
    }
    let moved = 0;
    const fit = (midi: number) => {
      let m = midi;
      while (m < low) m += 12;
      while (m > high) m -= 12;
      return m;
    };
    for (const m of track.measures) {
      for (const b of m.beats) {
        for (const n of b.notes) {
          const to = fit(n.midi);
          if (to !== n.midi) moved++;
          n.midi = to;
        }
      }
    }
    for (const st of steps) for (const h of st.held) h.midi = fit(h.midi);
    if (moved) warnings.push(`${moved} note${moved > 1 ? 's were' : ' was'} outside the guitar's range and moved by an octave.`);
  }

  // Candidates per step; chords that no hand can hold lose inner notes until they can be. Held notes are part of the
  // shape (the finger stays down) unless nothing can be played with them, then they are let go early.
  let released = 0;
  let unplayable = 0;
  const gone = new Set<string>();
  const cands: Candidate[][] = steps.map((s) => {
    s.held = s.held.filter((h) => !gone.has(h.key));
    let order = [...s.place].sort((a, b) => s.beat.notes[a].midi - s.beat.notes[b].midi);
    // Duplicate pitches in one beat (unison voices after a merge) sound once.
    order = order.filter((i, k) => k === 0 || s.beat.notes[i].midi !== s.beat.notes[order[k - 1]].midi);
    const midiOfIndex = (i: number) => (i >= 0 ? s.beat.notes[i].midi : s.held[-1 - i].midi);
    const build = (idx: number[]) => {
      const list = chordCandidates(idx.map(midiOfIndex), tuning, capo, maxFret);
      for (const c of list) c.noteIndex = c.noteIndex.map((k) => idx[k]);
      return list;
    };
    const heldIdx = s.held.map((_, k) => -1 - k);
    let list = heldIdx.length ? build([...order, ...heldIdx]) : [];
    if (!list.length) {
      // The held notes stop where this beat starts: shorten them so playback agrees.
      for (const h of s.held) {
        const [origin, noteIdx] = h.key.split(':').map(Number);
        const o = steps[origin];
        const note = o.beat.notes[noteIdx];
        if (note && note.length !== undefined) {
          const len = s.tick - o.tick;
          if (len > o.beat.duration) note.length = len;
          else delete note.length;
        }
      }
      released += heldIdx.length;
      for (const h of s.held) gone.add(h.key);
      s.held = [];
      list = build(order);
    }
    let dropped = 0;
    while (!list.length && order.length > 1) {
      // Keep the bass and the top (the melody); drop from the middle, then the bass.
      const drop = order.length > 2 ? Math.floor(order.length / 2) : 0;
      order.splice(drop, 1);
      dropped++;
      list = build(order);
    }
    if (dropped) warnings.push(`Bar ${s.bar + 1}: ${dropped} note${dropped > 1 ? 's' : ''} of a chord no hand can hold ${dropped > 1 ? 'were' : 'was'} left out.`);
    if (!list.length) {
      s.skip = true;
      unplayable += order.length;
    }
    return list;
  });
  if (released) warnings.push(`${released} held note${released > 1 ? 's' : ''} cannot keep ringing under the notes after ${released > 1 ? 'them' : 'it'} and ${released > 1 ? 'are' : 'is'} let go early.`);
  if (unplayable) warnings.push(`${unplayable} note${unplayable > 1 ? 's' : ''} cannot be played in this tuning up to fret ${maxFret} and ${unplayable > 1 ? 'were' : 'was'} left out.`);

  // Dynamic programming over (candidate, hand position), over the steps that can be played.
  const live = steps.map((s, j) => ({ s, j })).filter((x) => !x.s.skip);
  const layers: State[][] = [];
  live.forEach(({ s: step, j }, li) => {
    const list = cands[j];
    const prev = layers[li - 1];
    const prevStep = li > 0 ? live[li - 1] : null;
    const layer: State[] = [];
    // Shifting is easier after a rest or a long note (there is time to move).
    const ease = 1 / (1 + Math.max(0, step.rest) + (prevStep ? 0.25 * Math.max(0, prevStep.s.dur - 1) : 0));
    const needsString = step.beat.notes.map((n) => !!(n.legato || n.slide));
    list.forEach((c, ci) => {
      const own = c.positions.filter((_, k) => c.noteIndex[k] >= 0);
      const notesCost = own.reduce((sum, p) => sum + w.fretHeight * p.fret + w.highFret * Math.max(0, p.fret - 12), 0) + 0.35 * (c.positions.length > 1 ? c.shapeCost : 0);
      let keep = 0;
      if (opts.keepStrings) c.positions.forEach((p, k) => { if (c.noteIndex[k] >= 0 && step.beat.notes[c.noteIndex[k]].string !== p.string) keep += 0.8; });
      const opens = own.filter((p) => p.fret === 0).length;
      for (const hp of handPositions(c)) {
        let base = notesCost + keep + hp.stretches * w.stretch;
        if (hp.pos !== null && opts.preferPosition !== undefined) base += w.awayFromPreferred * Math.abs(hp.pos - opts.preferPosition);
        const from: Array<{ s: State | null; i: number }> = prev ? prev.map((s, i) => ({ s, i })) : [{ s: null, i: -1 }];
        let best: State | null = null;
        for (const f of from) {
          let cost = (f.s?.cost ?? 0) + base;
          const prevPos = f.s?.pos ?? null;
          const pos = hp.pos ?? prevPos;
          if (hp.pos !== null && prevPos !== null && hp.pos !== prevPos) cost += (w.shift + w.shiftPerFret * Math.abs(hp.pos - prevPos)) * ease;
          // An open string is far from a hand that is (or is asked to be) up the neck.
          cost += opens * (w.openString + w.openFromHigh * Math.max(0, (pos ?? opts.preferPosition ?? 0) - 3));
          if (f.s && prevStep) {
            const pc = cands[prevStep.j][f.s.cand];
            // Legato, slides and ties stay on their string.
            c.positions.forEach((p, k) => {
              const ni = c.noteIndex[k];
              if (ni >= 0 && needsString[ni] && !pc.positions.some((q) => q.string === p.string)) cost += 40;
            });
            // A held note stays exactly where it was.
            step.held.forEach((h, hk) => {
              const here = c.positions[c.noteIndex.indexOf(-1 - hk)];
              const [origin, noteIdx] = h.key.split(':').map(Number);
              const there = origin === prevStep.j
                ? pc.positions[pc.noteIndex.indexOf(noteIdx)]
                : pc.positions[pc.noteIndex.indexOf(-1 - prevStep.s.held.findIndex((x) => x.key === h.key))];
              if (here && there && (here.string !== there.string || here.fret !== there.fret)) cost += 100;
            });
            if (own.length === 1 && pc.positions.length === 1) {
              const a = pc.positions[0];
              const b = own[0];
              const skip = Math.abs(a.string - b.string);
              if (skip > 1 && a.fret > 0 && b.fret > 0) cost += w.stringSkip * Math.min(3, skip - 1);
            }
          }
          if (!best || cost < best.cost) best = { cand: ci, pos, cost, back: f.i };
        }
        if (best) layer.push(best);
      }
    });
    layers.push(layer);
  });

  let total = 0;
  if (layers.length && layers[layers.length - 1].length) {
    const last = layers[layers.length - 1];
    let at = last.reduce((bi, s, i) => (s.cost < last[bi].cost ? i : bi), 0);
    total = last[at].cost;
    for (let li = layers.length - 1; li >= 0; li--) {
      const state = layers[li][at];
      const j = live[li].j;
      const c = cands[j][state.cand];
      const beat = steps[j].beat;
      const placed = new Set<number>();
      c.positions.forEach((p, k) => {
        const ni = c.noteIndex[k];
        if (ni < 0) return;
        const note = beat.notes[ni];
        note.string = p.string;
        note.fret = p.fret;
        note.midi = midiOf(p.string, p.fret, tuning, capo);
        if (opts.fingers) note.finger = (p.fret === 0 ? 0 : Math.max(1, Math.min(4, p.fret - (state.pos ?? p.fret) + 1))) as LeftFinger;
        else delete note.finger;
        placed.add(ni);
      });
      // Notes not placed (dropped from an impossible chord, or a unison duplicate) are removed; the rest run low string first.
      beat.notes = beat.notes.filter((n, i) => placed.has(i) || n.tie).sort((a, b) => b.string - a.string);
      at = state.back;
    }
  } else if (live.length) {
    warnings.push('Nothing in this part could be placed on the guitar.');
  }
  // Steps nothing could be found for lose their notes (the beat becomes a rest).
  for (const st of steps) if (st.skip) st.beat.notes = st.beat.notes.filter((n) => n.tie);

  fixConnections(track, tuning, capo, maxFret, warnings);
  return { track, octaveShift, cost: Math.round(total * 100) / 100, warnings };
}

/** Ties follow their note's string; legato that ended up across strings is dropped (with a warning). */
function fixConnections(track: Track, tuning: number[], capo: number, maxFret: number, warnings: string[]): void {
  const last = new Map<number, Note>();
  let lostLegato = 0;
  let lostTies = 0;
  track.measures.forEach((m) => {
    for (const beat of m.beats) {
      if (!beat.notes.length && !beat.slash) last.clear();
      for (const n of beat.notes) {
        if (!n.tie) continue;
        // The note this one continues: the last note of the same pitch.
        const origin = [...last.values()].find((o) => o.midi === n.midi);
        const clash = origin && beat.notes.some((o) => o !== n && !o.tie && o.string === origin.string);
        if (origin && !clash) {
          n.string = origin.string;
          n.fret = origin.fret;
        } else {
          delete n.tie;
          lostTies++;
          const spot = positionsForMidi(n.midi, { tuning, capo, maxFret }).find((p) => !beat.notes.some((o) => o !== n && o.string === p.string));
          if (spot) {
            n.string = spot.string;
            n.fret = spot.fret;
          }
        }
        n.midi = midiOf(n.string, n.fret, tuning, capo);
      }
      for (const n of beat.notes) {
        if (n.legato || n.slide) {
          const prev = last.get(n.string);
          if (!prev || prev.fret === n.fret) {
            delete n.legato;
            delete n.slide;
            lostLegato++;
          } else if (n.slide) n.slide = n.fret > prev.fret ? 'up' : 'down';
          else if (n.legato) n.legato = n.fret > prev.fret ? 'hammer' : 'pull';
        }
      }
      for (const n of beat.notes) last.set(n.string, n);
    }
  });
  if (lostLegato) warnings.push(`${lostLegato} hammer-on, pull-off or slide${lostLegato > 1 ? 's' : ''} could not stay on one string and ${lostLegato > 1 ? 'are' : 'is'} now picked.`);
  if (lostTies) warnings.push(`${lostTies} tied note${lostTies > 1 ? 's are' : ' is'} now struck again.`);
}

/** Arrange every track (or the listed ones) of a song; returns a new song and all warnings. */
export function arrangeSong(song: Song, opts: ArrangeOptions & { tracks?: Array<string | number> } = {}): { song: Song; warnings: string[] } {
  const out = cloneSong(song);
  const warnings: string[] = [];
  out.tracks = out.tracks.map((t, i) => {
    if (opts.tracks && !opts.tracks.includes(t.id) && !opts.tracks.includes(i)) return t;
    const r = arrangeTrack(out, t, opts);
    warnings.push(...r.warnings.map((m) => (out.tracks.length > 1 ? `${t.name}: ${m}` : m)));
    return r.track;
  });
  if (opts.tuning) out.tuning = [...opts.tuning];
  if (opts.capo !== undefined) out.capo = opts.capo;
  return { song: out, warnings };
}

/** One melody line placed on the neck: string and fret per pitch (quick helper over `arrangeTrack`). */
export function arrangeLine(midis: readonly number[], opts: ArrangeOptions = {}): Array<FretPosition & { midi: number }> {
  const tuning = opts.tuning ?? [40, 45, 50, 55, 59, 64];
  const song: Song = {
    meta: { id: 'line', title: 'Line' }, tuning, capo: opts.capo ?? 0, tempo: [{ bar: 0, bpm: 120 }],
    bars: midis.map(() => ({ time: { numerator: 1, denominator: 4 } })), sections: [], chords: [], annotations: [],
    tracks: [{ id: 'line', name: 'Line', role: 'lead', measures: midis.map((midi) => ({ beats: [{ start: 0, duration: PPQ, notes: [{ string: 1, fret: 0, midi }] }] })) }],
  };
  const r = arrangeTrack(song, 0, { ...opts, octaves: opts.octaves ?? false });
  return r.track.measures.map((m, i) => {
    const n = m.beats[0].notes[0];
    return n ? { string: n.string, fret: n.fret, midi: n.midi } : { string: 0, fret: -1, midi: midis[i] };
  });
}

/** A note spelled for notation. */
export interface SpelledNote {
  midi: number;
  /** Sounding pitch spelled in the key: `F#3`. */
  name: string;
  /** Written pitch (guitar notation sounds an octave lower than written): `F#4`. */
  written: string;
  string: number;
  fret: number;
}

/** Spelled pitches of every beat of a track, in the song's key (bar changes of key respected). */
export function spellTrack(song: Song, trackRef?: string | number): Array<{ bar: number; beat: number; notes: SpelledNote[] }> {
  const track = findTrack(song, trackRef);
  if (!track) return [];
  const out: Array<{ bar: number; beat: number; notes: SpelledNote[] }> = [];
  let key = song.key ?? 'C';
  track.measures.forEach((m, bar) => {
    if (song.bars[bar]?.key) key = song.bars[bar].key!;
    m.beats.forEach((b, beat) => {
      if (!b.notes.length) return;
      out.push({
        bar, beat,
        notes: b.notes.map((n) => {
          const name = safeSpell(n.midi, key);
          return { midi: n.midi, name, written: safeSpell(n.midi + 12, key), string: n.string, fret: n.fret };
        }),
      });
    });
  });
  return out;
}

function safeSpell(midi: number, key: string): string {
  try {
    return spellInKey(midi, key);
  } catch {
    return spellInKey(midi, 'C');
  }
}
