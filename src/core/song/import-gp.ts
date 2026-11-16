/**
 * Guitar Pro importer (gp3, gp4, gp5, gpx, gp): alphaTab's file importer, loaded on demand and
 * used only as a parser (no renderer, no player), converted into the song model with tuning,
 * capo, tempo, time and key, repeats and endings, sections, chord diagrams, lyrics and the guitar
 * techniques alphaTab reads. Several voices in a bar are merged into one line per track.
 */
import type { model as AlphaModel } from '@coderline/alphatab';
import { chordPcs, keyFromSignature, parseChord, transposeChordBySemitones } from '@/core/theory';
import { importFailure, SongImportError } from './import-error';
import { buildMeasures, type Onset, type OnsetNote } from './import-util';
import { slugify, uniqueId } from './model';
import type { BarInfo, ChordEvent, ImportResult, ImportWarning, Note, Section, Song, TempoChange, Track, TrackRole } from './types';

type AtScore = AlphaModel.Score;
type AtNote = AlphaModel.Note;

/** Options for `importGuitarPro`. */
export interface GuitarProOptions {
  /** Only these tracks (indexes in the file); default every stringed, non-percussion track. */
  tracks?: number[];
}

// alphaTab enum values (stable across 1.x; checked against the installed package in the tests).
const SLIDE_OUT = { Shift: 1, Legato: 2, OutUp: 3, OutDown: 4, PickSlideDown: 5, PickSlideUp: 6 } as const;
const SLIDE_IN = { IntoFromBelow: 1, IntoFromAbove: 2 } as const;
const BEND = { Release: 3, BendRelease: 4, Prebend: 6, PrebendBend: 7, PrebendRelease: 8 } as const;
const HARMONIC = { Natural: 1, Artificial: 2, Pinch: 3, Tap: 4, Semi: 5 } as const;
const PICK = { Up: 1, Down: 2 } as const;
const BRUSH = { BrushUp: 1, BrushDown: 2 } as const;

/**
 * Load a Guitar Pro file with alphaTab's importer only. Throws a `SongImportError` (a RangeError)
 * for files it cannot read, with alphaTab's reason as its `detail`.
 */
export async function loadGuitarProScore(bytes: ArrayBuffer | Uint8Array): Promise<AtScore> {
  const at = await import('@coderline/alphatab/core');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return at.importer.ScoreLoader.loadScoreFromBytes(data, new at.Settings());
  } catch (e) {
    throw importFailure('guitar-pro', e);
  }
}

/** Import a Guitar Pro file. */
export async function importGuitarPro(bytes: ArrayBuffer | Uint8Array, opts: GuitarProOptions = {}): Promise<ImportResult> {
  const score = await loadGuitarProScore(bytes);
  return convertAlphaTabScore(score, opts);
}

/** Convert an alphaTab score (already loaded) into a song. */
export function convertAlphaTabScore(score: AtScore, opts: GuitarProOptions = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const title = score.title?.trim() || 'Imported Guitar Pro file';
  const bars: BarInfo[] = [];
  const layout: Array<{ start: number; length: number }> = [];
  const tempo: TempoChange[] = [];
  const sections: Section[] = [];
  const chords: ChordEvent[] = [];
  let key: string | undefined;
  let start = 0;
  score.masterBars.forEach((mb, i) => {
    const time = { numerator: mb.timeSignatureNumerator, denominator: mb.timeSignatureDenominator };
    const length = mb.calculateDuration();
    const full = (3840 * time.numerator) / time.denominator;
    const info: BarInfo = { time };
    if (length < full && i === 0) info.length = length;
    if (mb.isRepeatStart) info.repeatStart = true;
    if (mb.repeatCount > 0) info.repeatEnd = Math.max(2, mb.repeatCount);
    // alphaTab marks every bar of an ending with a bit mask of the passes it belongs to.
    if (mb.alternateEndings) {
      const nums: number[] = [];
      for (let b = 0; b < 16; b++) if (mb.alternateEndings & (1 << b)) nums.push(b + 1);
      info.ending = nums;
    }
    const keyName = keyFromAlphaTab(mb.keySignature as unknown as number, mb.keySignatureType as unknown as number);
    if (i === 0) key = keyName;
    else if (keyName !== keyFromAlphaTab(score.masterBars[i - 1].keySignature as unknown as number, score.masterBars[i - 1].keySignatureType as unknown as number)) info.key = keyName;
    for (const a of mb.tempoAutomations ?? []) {
      const tick = Math.round(a.ratioPosition * length);
      tempo.push({ bar: i, ...(tick > 0 ? { tick } : {}), bpm: a.value });
    }
    if (mb.section) sections.push({ name: mb.section.text || mb.section.marker || `Section ${sections.length + 1}`, start: i, end: i + 1 });
    bars.push(info);
    layout.push({ start, length });
    start += length;
  });
  sections.forEach((s, i) => (s.end = sections[i + 1]?.start ?? bars.length));
  if (!tempo.length || tempo[0].bar !== 0 || (tempo[0].tick ?? 0) > 0) tempo.unshift({ bar: 0, bpm: score.tempo || 120 });
  const tempoClean = tempo.filter((t, i) => i === 0 || t.bpm !== tempo[i - 1].bpm);

  const tracks: Track[] = [];
  const used = new Set<string>();
  let songTuning: number[] | null = null;
  let songCapo = 0;
  let graces = 0;
  let extraVoices = false;
  score.tracks.forEach((track, ti) => {
    if (opts.tracks && !opts.tracks.includes(ti)) return;
    const staff = track.staves[0];
    if (!staff || track.isPercussion || staff.isPercussion || !staff.tuning?.length) return;
    const tuning = [...staff.tuning].reverse();
    const capo = staff.capo ?? 0;
    const strings = tuning.length;
    const firstTrack = !tracks.length;
    const onsets: Onset[] = [];
    /** alphaTab marks hammer-ons and slides on the note they start from; songs mark the note they reach. */
    const fromOrigin = new Map<AtNote, Partial<Note>>();
    staff.bars.forEach((bar, bi) => {
      const barStart = layout[bi]?.start ?? 0;
      const voices = bar.voices.filter((v) => !v.isEmpty);
      if (voices.length > 1) extraVoices = true;
      for (const voice of voices) {
        for (const beat of voice.beats) {
          if (beat.graceType !== 0) {
            graces++;
            continue;
          }
          const tick = barStart + beat.playbackStart;
          let o = onsets.find((x) => x.tick === tick);
          if (!o) {
            o = { tick, notes: [] };
            onsets.push(o);
          }
          if (beat.isRest || !beat.notes.length) continue;
          if (beat.lyrics?.length && beat.lyrics[0]) o.lyric = beat.lyrics[0];
          if (beat.text) o.text = beat.text;
          const stroke = beat.pickStroke === PICK.Down || beat.brushType === BRUSH.BrushDown ? 'down' : beat.pickStroke === PICK.Up || beat.brushType === BRUSH.BrushUp ? 'up' : undefined;
          if (stroke) o.stroke = stroke;
          if (firstTrack && beat.chord?.name && voice.index === 0) {
            const symbol = cleanChordName(beat.chord.name);
            if (symbol) {
              const voicing = beat.chord.strings?.length === strings ? [...beat.chord.strings].reverse().map((f) => (f < 0 ? null : f)) : undefined;
              chords.push({ bar: bi, tick: beat.playbackStart, symbol, ...(voicing ? { voicing } : {}) });
            }
          }
          for (const n of beat.notes) {
            if (!n.isStringed) continue;
            const string = strings - n.string + 1;
            const note: OnsetNote = { midi: n.realValueWithoutHarmonic ?? n.realValue, string, fret: n.fret, sustain: beat.playbackDuration };
            if (n.isTieDestination) note.tie = true;
            const origin = fromOrigin.get(n);
            if (origin) Object.assign(note, origin);
            if (n.slideInType === SLIDE_IN.IntoFromBelow) note.slideIn = 'below';
            if (n.slideInType === SLIDE_IN.IntoFromAbove) note.slideIn = 'above';
            if (n.slideOutType === SLIDE_OUT.OutDown || n.slideOutType === SLIDE_OUT.PickSlideDown) note.slideOut = 'down';
            if (n.slideOutType === SLIDE_OUT.OutUp || n.slideOutType === SLIDE_OUT.PickSlideUp) note.slideOut = 'up';
            const nextOnString = (n.slideOutType === SLIDE_OUT.Shift || n.slideOutType === SLIDE_OUT.Legato) ? (n.slideTarget ?? nextNoteOnString(n)) : null;
            if (nextOnString) fromOrigin.set(nextOnString, { ...(fromOrigin.get(nextOnString) ?? {}), slide: nextOnString.fret >= n.fret ? 'up' : 'down' });
            if (n.isHammerPullOrigin && n.hammerPullDestination) {
              const dest = n.hammerPullDestination;
              fromOrigin.set(dest, { ...(fromOrigin.get(dest) ?? {}), legato: dest.fret >= n.fret ? 'hammer' : 'pull' });
            }
            if (n.hasBend && n.bendPoints?.length) {
              const max = Math.max(...n.bendPoints.map((p) => p.value));
              const bt = n.bendType as unknown as number;
              note.bend = {
                amount: Math.max(0.5, Math.round((max / 2) * 2) / 2),
                ...(bt === BEND.Release || bt === BEND.BendRelease || bt === BEND.PrebendRelease ? { release: true } : {}),
                ...(bt === BEND.Prebend || bt === BEND.PrebendBend || bt === BEND.PrebendRelease ? { pre: true } : {}),
              };
            }
            if ((n.vibrato as unknown as number) !== 0 || (beat.vibrato as unknown as number) !== 0) note.vibrato = true;
            if (n.isPalmMute || beat.isPalmMute) note.palmMute = true;
            if (n.isDead) note.dead = true;
            if (n.isGhost) note.ghost = true;
            const h = n.harmonicType as unknown as number;
            if (h === HARMONIC.Natural) note.harmonic = 'natural';
            else if (h === HARMONIC.Artificial || h === HARMONIC.Pinch || h === HARMONIC.Tap || h === HARMONIC.Semi) note.harmonic = 'artificial';
            if (n.isLetRing || beat.isLetRing) note.letRing = true;
            if (n.isStaccato) note.staccato = true;
            if ((n.accentuated as unknown as number) > 0) note.accent = true;
            if (n.isLeftHandTapped || beat.tap) note.tap = true;
            const lf = n.leftHandFinger as unknown as number;
            if (lf >= 1 && lf <= 4) note.finger = lf as 1 | 2 | 3 | 4;
            else if (lf === 0) note.finger = 'T';
            const rf = n.rightHandFinger as unknown as number;
            if (rf >= 0 && rf <= 4) note.pluck = (['p', 'i', 'm', 'a', 'c'] as const)[rf];
            if (!o.notes.some((x) => x.string === string)) o.notes.push(note);
          }
        }
      }
    });
    // Rest beats of other voices left empty onsets behind; keep only onsets with notes (or the bar starts).
    const kept = onsets.filter((o) => o.notes.length).sort((a, b) => a.tick - b.tick);
    const measures = buildMeasures(kept, layout, { tuning, capo });
    const role: TrackRole = strings <= 5 && Math.min(...tuning) < 36 ? 'bass' : 'lead';
    const id = uniqueId(track.name || `Track ${ti + 1}`, used);
    if (!songTuning) {
      songTuning = tuning;
      songCapo = capo;
    }
    const own = songTuning !== tuning && (songTuning.join() !== tuning.join() || songCapo !== capo);
    tracks.push({ id, name: track.name || `Track ${ti + 1}`, role, ...(own ? { tuning, capo } : {}), measures });
  });
  if (!tracks.length) throw new SongImportError('This Guitar Pro file has no guitar or bass part to import: its tracks are drums or other instruments.', { format: 'guitar-pro' });
  if (graces) warnings.push({ message: `${graces} grace note${graces > 1 ? 's were' : ' was'} left out.`, confidence: 0.7 });
  if (extraVoices) warnings.push({ message: 'Bars with two voices were merged into one line per track; held notes keep their length.', confidence: 0.75 });
  if (chords.length) chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  // A chord diagram named for its shape behind a capo: store the chord that sounds.
  if (songCapo && songTuning) {
    let renamed = 0;
    for (const c of chords) {
      if (!c.voicing) continue;
      const pcs = (capo: number) => c.voicing!.flatMap((f, i) => (f === null ? [] : [(songTuning![i] + capo + f) % 12]));
      const want = new Set(chordPcs(c.symbol));
      const fits = (list: number[]) => list.length > 0 && list.every((pc) => want.has(pc));
      if (!fits(pcs(songCapo)) && fits(pcs(0))) {
        c.symbol = transposeChordBySemitones(c.symbol, songCapo);
        renamed++;
      }
    }
    if (renamed) warnings.push({ message: `Chord names were capo shapes; they are stored as the chords that sound with capo ${songCapo}.`, confidence: 0.85 });
  }
  const song: Song = {
    meta: {
      id: slugify(title), title,
      ...(score.artist ? { artist: score.artist } : {}),
      ...(score.music ? { composer: score.music } : {}),
      ...(score.copyright ? { licence: score.copyright } : {}),
      ...(score.tab ? { arranger: score.tab } : {}),
      source: 'Imported from a Guitar Pro file',
    },
    tuning: songTuning ?? [40, 45, 50, 55, 59, 64],
    capo: songCapo,
    ...(key ? { key } : {}),
    tempo: tempoClean,
    bars,
    sections,
    tracks,
    chords: chords.filter((c, i) => i === 0 || chords[i - 1].bar !== c.bar || chords[i - 1].tick !== c.tick),
    annotations: [],
  };
  return { song, warnings, confidence: 0.95 };
}

function nextNoteOnString(n: AtNote): AtNote | null {
  let beat = n.beat.nextBeat;
  while (beat) {
    const found = beat.notes.find((x) => x.string === n.string);
    if (found) return found;
    beat = beat.nextBeat;
  }
  return null;
}

/** alphaTab key signature (-7..7 fifths) and type (0 major, 1 minor) to a key name. */
function keyFromAlphaTab(fifths: number, type: number): string {
  return keyFromSignature(Math.max(-7, Math.min(7, Math.round(fifths) || 0)), type === 1 ? 'minor' : 'major').short;
}

/** Guitar Pro chord names can carry decorations; keep what reads as a chord symbol. */
function cleanChordName(name: string): string | null {
  const t = name.trim().replace(/\s+/g, '');
  if (!t) return null;
  return parseChord(t) ? t : null;
}
