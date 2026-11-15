/**
 * MusicXML importer (score-partwise, and score-timewise by regrouping): notes, rests, chords,
 * durations, ties, tuplets, voices (merged into one line per part), key, time and tempo, tab
 * from `<technical><string>/<fret>` and staff tuning, guitar techniques, harmony symbols, lyrics,
 * repeats and endings. Parts without tab are put on the neck by the arranger. Compressed `.mxl`
 * files are opened with jszip (loaded on demand).
 */
import { keyFromSignature, normalizeChordSymbol } from '@/core/theory';
import { arrangeTrack, type ArrangeOptions } from './arranger';
import { buildMeasures, type Onset, type OnsetNote } from './import-util';
import { barCapacity, slugify, uniqueId } from './model';
import type { Annotation, BarInfo, ChordEvent, ImportResult, ImportWarning, Section, Song, TempoChange, TimeSig, Track, TrackRole } from './types';
import { PPQ } from './types';
import { kid, kids, numOf, parseXml, textOf, type XmlElement } from './xml';

/** Options for the MusicXML importer. */
export interface MusicXmlOptions {
  /** Import only this part (index or part id/name); default every part with notes. */
  part?: number | string;
  /** Options for placing parts without tab on the neck. */
  arrange?: ArrangeOptions;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const KIND_SYMBOL: Record<string, string> = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
  'diminished-seventh': 'dim7', 'augmented-seventh': '7#5', 'half-diminished': 'm7b5', 'major-minor': 'mMaj7', 'major-sixth': '6',
  'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9', 'dominant-11th': '11', 'major-11th': 'maj11',
  'minor-11th': 'm11', 'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13', 'suspended-second': 'sus2',
  'suspended-fourth': 'sus4', power: '5',
};

function pitchMidi(step: string, alter: number, octave: number): number {
  return (octave + 1) * 12 + (STEP_PC[step.toUpperCase()] ?? 0) + (Number.isFinite(alter) ? Math.round(alter) : 0);
}

function noteName(step: string, alter: number): string {
  return `${step.toUpperCase()}${alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : ''}`;
}

/** A chord symbol from a `<harmony>` element, or null when it cannot be read. */
export function harmonySymbol(h: XmlElement): string | null {
  const root = kid(h, 'root');
  const kind = kid(h, 'kind');
  const kindValue = textOf(kind);
  if (kindValue === 'none') return 'N.C.';
  if (!root) return null;
  const rootName = noteName(textOf(root, 'root-step'), numOf(root, 'root-alter') || 0);
  const bassText = kid(h, 'bass') ? `/${noteName(textOf(kid(h, 'bass'), 'bass-step'), numOf(kid(h, 'bass'), 'bass-alter') || 0)}` : '';
  if (!(kindValue in KIND_SYMBOL) && kind?.attrs.text) {
    // "other" (or a kind this table lacks): the written text is the symbol.
    const own = normalizeChordSymbol(rootName + kind.attrs.text + bassText);
    if (own) return own;
  }
  let symbol = rootName + (KIND_SYMBOL[kindValue] ?? '');
  for (const d of kids(h, 'degree')) {
    const value = numOf(d, 'degree-value');
    const alter = numOf(d, 'degree-alter') || 0;
    const type = textOf(d, 'degree-type');
    const acc = alter > 0 ? '#' : alter < 0 ? 'b' : '';
    if (type === 'add') symbol += `${acc ? acc : 'add'}${value}`;
    else if (type === 'alter') symbol += `${acc}${value}`;
  }
  symbol += bassText;
  const normal = normalizeChordSymbol(symbol);
  if (normal) return normal;
  const text = kind?.attrs.text;
  if (text !== undefined) {
    const alt = normalizeChordSymbol(rootName + text + bassText);
    if (alt) return alt;
  }
  return normalizeChordSymbol(rootName) ?? null;
}

interface RawNote extends OnsetNote {
  /** Measure index (in the part) and ticks from that measure's start; placed on the song's bars at the end. */
  measure: number;
  tick: number;
  /** A rhythm slash (slash notehead): strum the chord, no pitch. */
  slash?: boolean;
  staff: number;
  voice: string;
  tieStop: boolean;
  hasTab: boolean;
  lyric?: string;
  slideStart?: boolean;
  hammerStart?: boolean;
  pullStart?: boolean;
  stroke?: 'down' | 'up';
}

interface PartData {
  id: string;
  name: string;
  notes: RawNote[];
  tuning: number[] | null;
  capo: number;
  /** Every note of the part is unpitched (a drum part). */
  percussion: boolean;
}

/** score-timewise to score-partwise: the same measures, grouped by part. */
function partwise(root: XmlElement): XmlElement {
  if (root.name !== 'score-timewise') return root;
  const parts = new Map<string, XmlElement>();
  for (const m of kids(root, 'measure')) {
    for (const p of kids(m, 'part')) {
      const id = p.attrs.id;
      if (!parts.has(id)) parts.set(id, { name: 'part', attrs: { id }, children: [] });
      parts.get(id)!.children.push({ name: 'measure', attrs: m.attrs, children: p.children });
    }
  }
  return { name: 'score-partwise', attrs: root.attrs, children: [...kids(root).filter((k) => k.name !== 'measure'), ...parts.values()] };
}

/** Import MusicXML text. Throws a RangeError when the text is not MusicXML. */
export function importMusicXml(text: string, opts: MusicXmlOptions = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const doc = partwise(parseXml(text));
  if (doc.name !== 'score-partwise') throw new RangeError(`This XML is a <${doc.name}>, not a MusicXML score.`);

  const title = textOf(kid(doc, 'work'), 'work-title') || textOf(doc, 'movement-title') || kids(doc, 'credit').map((c) => textOf(c, 'credit-words')).find(Boolean) || 'Imported score';
  const ident = kid(doc, 'identification');
  const composer = kids(ident, 'creator').find((c) => c.attrs.type === 'composer');
  const lyricist = kids(ident, 'creator').find((c) => c.attrs.type === 'lyricist');
  const rights = textOf(ident, 'rights');
  const partNames = new Map(kids(kid(doc, 'part-list'), 'score-part').map((sp) => [sp.attrs.id, textOf(sp, 'part-name') || sp.attrs.id]));

  const bars: BarInfo[] = [];
  const tempo: TempoChange[] = [];
  const chords: ChordEvent[] = [];
  const annotations: Annotation[] = [];
  const sections: Section[] = [];
  let keyName: string | undefined;
  let graceSkipped = 0;
  const parts: PartData[] = [];

  kids(doc, 'part').forEach((partEl, partIndex) => {
    const part: PartData = { id: partEl.attrs.id, name: partNames.get(partEl.attrs.id) ?? `Part ${partIndex + 1}`, notes: [], tuning: null, capo: 0, percussion: false };
    let pitched = 0;
    let unpitchedCount = 0;
    let divisions = 1;
    let time: TimeSig = { numerator: 4, denominator: 4 };
    let transpose = 0;
    const tabStaves = new Set<number>();
    let openEnding: number[] | null = null;
    kids(partEl, 'measure').forEach((m, mi) => {
      const first = partIndex === 0;
      let cursor = 0;
      let maxCursor = 0;
      let lastStart = 0;
      const toTicks = (d: number) => Math.round((d * PPQ) / divisions);
      const info: BarInfo = { time };
      for (const el of kids(m)) {
        switch (el.name) {
          case 'attributes': {
            const div = numOf(el, 'divisions');
            if (div > 0) divisions = div;
            const t = kid(el, 'time');
            if (t && kid(t, 'beats')) {
              const beats = textOf(t, 'beats').split('+').map(Number).reduce((a, b) => a + b, 0);
              const type = numOf(t, 'beat-type');
              if (beats > 0 && beats <= 32 && [1, 2, 4, 8, 16, 32].includes(type)) time = { numerator: beats, denominator: type };
              info.time = time;
            }
            const k = kid(el, 'key');
            if (k && first) {
              const fifths = numOf(k, 'fifths');
              if (Number.isFinite(fifths)) {
                const mode = textOf(k, 'mode') === 'minor' ? 'minor' : 'major';
                const key = keyFromSignature(Math.max(-7, Math.min(7, fifths)), mode);
                if (mi === 0 || !keyName) keyName = key.short;
                else info.key = key.short;
              }
            }
            const tr = kid(el, 'transpose');
            if (tr) transpose = (numOf(tr, 'chromatic') || 0) + 12 * (numOf(tr, 'octave-change') || 0);
            for (const clef of kids(el, 'clef')) if (textOf(clef, 'sign') === 'TAB') tabStaves.add(Number(clef.attrs.number ?? 1));
            for (const sd of kids(el, 'staff-details')) {
              const tunings = kids(sd, 'staff-tuning').sort((a, b) => Number(a.attrs.line) - Number(b.attrs.line));
              if (tunings.length) part.tuning = tunings.map((st) => pitchMidi(textOf(st, 'tuning-step'), numOf(st, 'tuning-alter') || 0, numOf(st, 'tuning-octave')));
              const capo = numOf(sd, 'capo');
              if (capo > 0) part.capo = capo;
              if (tunings.length) tabStaves.add(Number(sd.attrs.number ?? 1));
            }
            break;
          }
          case 'direction': {
            if (!first) break;
            const offset = toTicks(numOf(el, 'offset') || 0);
            const sound = kid(el, 'sound');
            const type = kid(el, 'direction-type');
            const metro = kid(type, 'metronome');
            let bpm = sound?.attrs.tempo ? Number(sound.attrs.tempo) : NaN;
            if (!Number.isFinite(bpm) && metro) {
              const unit = textOf(metro, 'beat-unit');
              const per = numOf(metro, 'per-minute');
              const factor = ({ whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 } as Record<string, number>)[unit] ?? 1;
              bpm = per * factor * (kid(metro, 'beat-unit-dot') ? 1.5 : 1);
            }
            if (Number.isFinite(bpm) && bpm > 0) tempo.push({ bar: mi, ...(cursor + offset > 0 ? { tick: cursor + offset } : {}), bpm: Math.round(bpm * 100) / 100 });
            for (const dt of kids(el, 'direction-type')) {
              const words = textOf(dt, 'words');
              const rehearsal = textOf(dt, 'rehearsal');
              if (rehearsal) sections.push({ name: rehearsal, start: mi, end: mi + 1 });
              else if (words && !/^\s*(allegro|andante|moderato|adagio|largo|presto|lento|tempo)/i.test(words)) annotations.push({ bar: mi, tick: cursor + offset, text: words });
            }
            break;
          }
          case 'sound':
            if (first && el.attrs.tempo) tempo.push({ bar: mi, ...(cursor > 0 ? { tick: cursor } : {}), bpm: Number(el.attrs.tempo) });
            break;
          case 'harmony': {
            if (!first && chords.length) break;
            const symbol = harmonySymbol(el);
            const offset = toTicks(numOf(el, 'offset') || 0);
            if (symbol) chords.push({ bar: mi, tick: Math.max(0, cursor + offset), symbol });
            break;
          }
          case 'backup':
            cursor = Math.max(0, cursor - toTicks(numOf(el, 'duration') || 0));
            break;
          case 'forward':
            cursor += toTicks(numOf(el, 'duration') || 0);
            maxCursor = Math.max(maxCursor, cursor);
            break;
          case 'barline': {
            if (!first) break;
            const rep = kid(el, 'repeat');
            if (rep?.attrs.direction === 'forward') info.repeatStart = true;
            if (rep?.attrs.direction === 'backward') info.repeatEnd = Math.max(2, Number(rep.attrs.times ?? 2));
            const ending = kid(el, 'ending');
            if (ending) {
              const nums = (ending.attrs.number ?? '1').split(/[,\s]+/).map(Number).filter((x) => x > 0);
              if (ending.attrs.type === 'start') {
                openEnding = nums;
                info.ending = nums;
              } else {
                if (openEnding) info.ending = openEnding;
                openEnding = null;
              }
            }
            break;
          }
          case 'note': {
            if (kid(el, 'grace') || kid(el, 'cue')) {
              graceSkipped++;
              break;
            }
            const isChord = !!kid(el, 'chord');
            const dur = toTicks(numOf(el, 'duration') || 0);
            const start = isChord ? lastStart : cursor;
            if (!isChord) {
              lastStart = cursor;
              cursor += dur;
              maxCursor = Math.max(maxCursor, cursor);
            }
            if (kid(el, 'rest')) break;
            const pitch = kid(el, 'pitch');
            const unpitched = kid(el, 'unpitched');
            const staff = Number(textOf(el, 'staff') || 1);
            const voice = textOf(el, 'voice') || '1';
            const notations = kids(el, 'notations');
            const technical = notations.flatMap((n) => kids(n, 'technical'));
            const tech = (name: string) => technical.map((t) => kid(t, name)).find(Boolean);
            const stringNo = Number(textOf(tech('string')) || NaN);
            const fretNo = Number(textOf(tech('fret')) || NaN);
            const hasTab = Number.isFinite(stringNo) && Number.isFinite(fretNo);
            let midi = pitch ? pitchMidi(textOf(pitch, 'step'), numOf(pitch, 'alter') || 0, numOf(pitch, 'octave')) + transpose : NaN;
            if (!pitch && unpitched) {
              unpitchedCount++;
              break;
            }
            if (!Number.isFinite(midi) && !hasTab) break;
            pitched++;
            if (textOf(el, 'notehead') === 'slash') {
              const strokeEl = technical.find((t) => kid(t, 'down-bow') || kid(t, 'up-bow'));
              const ly = kid(el, 'lyric');
              const syl = textOf(ly, 'syllabic');
              part.notes.push({
                measure: mi, tick: start, staff, voice, midi: NaN, slash: true, tieStop: false, hasTab: true, sustain: dur,
                ...(strokeEl ? { stroke: kid(strokeEl, 'down-bow') ? 'down' : 'up' } : {}),
                ...(ly && textOf(ly, 'text') ? { lyric: textOf(ly, 'text') + (syl === 'begin' || syl === 'middle' ? '-' : '') } : {}),
              });
              break;
            }
            const ties = [...kids(el, 'tie'), ...notations.flatMap((n) => kids(n, 'tied'))];
            const note: RawNote = {
              measure: mi, tick: start, staff, voice, midi, sustain: dur, tieStop: ties.some((t) => t.attrs.type === 'stop'), hasTab,
              ...(hasTab ? { string: stringNo, fret: fretNo } : {}),
            };
            if (tabStaves.has(staff) && !hasTab) note.hasTab = false;
            const arts = notations.flatMap((n) => kids(n, 'articulations'));
            if (arts.some((a) => kid(a, 'staccato') || kid(a, 'staccatissimo'))) note.staccato = true;
            if (arts.some((a) => kid(a, 'accent') || kid(a, 'strong-accent'))) note.accent = true;
            const orn = notations.flatMap((n) => kids(n, 'ornaments'));
            if (orn.some((o) => kid(o, 'wavy-line') || kid(o, 'vibrato') || kid(o, 'shake'))) note.vibrato = true;
            const bend = tech('bend');
            if (bend) note.bend = { amount: Math.max(0.5, Math.abs(numOf(bend, 'bend-alter') || 2)), ...(kid(bend, 'release') ? { release: true } : {}), ...(kid(bend, 'pre-bend') ? { pre: true } : {}) };
            const harm = tech('harmonic');
            if (harm) note.harmonic = kid(harm, 'artificial') ? 'artificial' : 'natural';
            if (tech('tap')) note.tap = true;
            const ham = tech('hammer-on');
            if (ham?.attrs.type === 'start') note.hammerStart = true;
            const pull = tech('pull-off');
            if (pull?.attrs.type === 'start') note.pullStart = true;
            const slides = notations.flatMap((n) => [...kids(n, 'slide'), ...kids(n, 'glissando')]);
            if (slides.some((s) => s.attrs.type === 'start')) note.slideStart = true;
            const fing = textOf(tech('fingering'));
            if (/^[0-4]$/.test(fing)) note.finger = Number(fing) as 0 | 1 | 2 | 3 | 4;
            if (fing === 'T' || fing === 't') note.finger = 'T';
            const pluck = textOf(tech('pluck')).toLowerCase();
            if (/^[pimac]$/.test(pluck)) note.pluck = pluck as 'p';
            if (tech('down-bow')) note.stroke = 'down';
            if (tech('up-bow')) note.stroke = 'up';
            const other = technical.flatMap((t) => kids(t, 'other-technical')).map((o) => textOf(o).toLowerCase());
            if (other.some((o) => /p\.?\s?m\.?|palm/.test(o))) note.palmMute = true;
            if (other.some((o) => /x|dead|mute/.test(o)) || kid(kid(el, 'notehead'), 'x') || textOf(el, 'notehead') === 'x') note.dead = true;
            const ly = kids(el, 'lyric').find((l) => (l.attrs.number ?? '1') === '1') ?? kid(el, 'lyric');
            if (ly && textOf(ly, 'text')) {
              const syl = textOf(ly, 'syllabic');
              note.lyric = textOf(ly, 'text') + (syl === 'begin' || syl === 'middle' ? '-' : '');
            }
            part.notes.push(note);
            break;
          }
          default:
            break;
        }
      }
      const cap = barCapacity(info.time);
      // A measure marked implicit and shorter than its meter: the pickup, or half of a bar split around a repeat.
      const implicit = m.attrs.implicit === 'yes' && maxCursor > 0 && maxCursor < cap;
      if (first) {
        if (implicit) info.length = maxCursor;
        if (maxCursor > cap) {
          // An overfull measure (a cadenza, a missing time change): read it in a meter that holds it rather than lose notes.
          const unit = barCapacity({ numerator: 1, denominator: info.time.denominator });
          const beats = maxCursor / unit;
          if (Number.isInteger(beats) && beats <= 32) {
            const written = `${info.time.numerator}/${info.time.denominator}`;
            info.time = { numerator: beats, denominator: info.time.denominator };
            warnings.push({ message: `Measure ${mi + 1} holds more than its ${written}; it was read as ${beats}/${info.time.denominator}.`, bar: mi, confidence: 0.6 });
          } else {
            warnings.push({ message: `Measure ${mi + 1} of "${part.name}" holds more than its time signature; the extra was cut.`, bar: mi, confidence: 0.6 });
          }
        }
        if (openEnding && !info.ending) info.ending = openEnding;
        bars.push(info);
      }
    });
    part.percussion = unpitchedCount > 0 && pitched === 0;
    parts.push(part);
  });

  if (!bars.length) throw new RangeError('The MusicXML score has no measures.');
  if (graceSkipped) warnings.push({ message: `${graceSkipped} grace or cue note${graceSkipped > 1 ? 's were' : ' was'} left out.`, confidence: 0.7 });

  // Sections from rehearsal marks run to the next one.
  sections.sort((a, b) => a.start - b.start);
  sections.forEach((s, i) => (s.end = sections[i + 1]?.start ?? bars.length));

  const songTuning = parts.find((p) => p.tuning)?.tuning ?? [40, 45, 50, 55, 59, 64];
  const songCapo = parts.find((p) => p.tuning)?.capo ?? 0;
  const song: Song = {
    meta: {
      id: slugify(title), title,
      ...(composer ? { composer: textOf(composer) } : {}),
      ...(lyricist && !composer ? { composer: textOf(lyricist) } : {}),
      ...(rights ? { licence: rights } : {}),
      source: 'Imported from MusicXML',
    },
    tuning: songTuning,
    capo: songCapo,
    ...(keyName ? { key: keyName } : {}),
    tempo: dedupeTempo(tempo),
    bars,
    sections,
    tracks: [],
    chords: chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick).filter((c, i, a) => i === 0 || a[i - 1].bar !== c.bar || a[i - 1].tick !== c.tick),
    annotations,
  };
  // Every part is laid on the first part's bars, measure by measure, so a pickup or an overfull measure written
  // differently in another part cannot shift it.
  const layout: Array<{ start: number; length: number }> = [];
  let at = 0;
  for (const b of bars) {
    const length = b.length ?? barCapacity(b.time);
    layout.push({ start: at, length });
    at += length;
  }
  let cut = 0;
  for (const p of parts) {
    p.notes = p.notes.filter((n) => {
      const bar = layout[n.measure];
      if (!bar || n.tick >= bar.length) {
        cut++;
        return false;
      }
      n.tick += bar.start;
      return true;
    });
  }
  if (cut) warnings.push({ message: `${cut} note${cut > 1 ? 's' : ''} beyond the end of ${cut > 1 ? 'their' : 'its'} measure ${cut > 1 ? 'were' : 'was'} left out.`, confidence: 0.6 });
  const used = new Set<string>();
  const wanted = opts.part === undefined ? null : typeof opts.part === 'number' ? [opts.part] : null;
  parts.forEach((p, i) => {
    if (wanted && !wanted.includes(i)) return;
    if (typeof opts.part === 'string' && p.id !== opts.part && p.name !== opts.part) return;
    if (p.percussion) {
      warnings.push({ message: `"${p.name}" is a drum part and was left out.`, confidence: 0.9 });
      return;
    }
    if (!p.notes.length) return;
    const tuning = p.tuning ?? songTuning;
    const capo = p.tuning ? p.capo : songCapo;
    // Notation and tab staves of one guitar part repeat each note: keep one, preferring the one with string and fret.
    const byKey = new Map<string, RawNote>();
    for (const n of p.notes) {
      if (n.slash) {
        byKey.set(`${n.tick}:slash`, n);
        continue;
      }
      const pitch = n.hasTab && n.string !== undefined ? tuning[tuning.length - n.string] + capo + n.fret! : n.midi;
      const k = `${n.tick}:${pitch}`;
      const prev = byKey.get(k);
      const here = { ...n, midi: Number.isFinite(pitch) ? pitch : n.midi };
      if (!prev) byKey.set(k, here);
      else byKey.set(k, mergeTwins(prev, here));
    }
    const notes = [...byKey.values()].sort((a, b) => a.tick - b.tick);
    connect(notes);
    const onsets: Onset[] = [];
    for (const n of notes) {
      let o = onsets[onsets.length - 1];
      if (!o || o.tick !== n.tick) {
        o = { tick: n.tick, notes: [] };
        onsets.push(o);
      }
      const { tick: _t, measure: _m, staff: _s, voice: _v, tieStop, hasTab, lyric, slideStart: _sl, hammerStart: _h, pullStart: _p, stroke, slash, ...rest } = n;
      void _t; void _m; void _s; void _v; void _sl; void _h; void _p;
      if (lyric && !o.lyric) o.lyric = lyric;
      if (stroke) o.stroke = stroke;
      if (slash) {
        o.slash = true;
        if (n.sustain !== undefined) o.length = n.sustain;
        continue;
      }
      const on: OnsetNote = { ...rest };
      if (tieStop) on.tie = true;
      if (!hasTab) {
        delete on.string;
        delete on.fret;
      }
      o.notes.push(on);
    }
    const measures = buildMeasures(onsets, layout, { tuning, capo });
    const tabbed = notes.every((n) => n.hasTab);
    const slashes = notes.length > 0 && notes.every((n) => n.slash);
    const role: TrackRole = slashes ? 'rhythm' : Math.min(...tuning) < 36 && tuning.length <= 5 ? 'bass' : 'lead';
    let track: Track = { id: uniqueId(p.name, used), name: p.name, role, ...(p.tuning && song.tracks.length ? { tuning } : {}), measures };
    if (!tabbed) {
      const r = arrangeTrack(song, track, { ...opts.arrange, tuning, capo });
      track = r.track;
      warnings.push({ message: `"${p.name}" had no tab: strings and frets were chosen by the arranger.`, confidence: 0.7 }, ...r.warnings.map((message) => ({ message, confidence: 0.7 })));
    }
    if (p.tuning && !song.tracks.length) {
      song.tuning = tuning;
      song.capo = capo;
    }
    song.tracks.push(track);
  });
  if (!song.tracks.length) {
    song.tracks.push({ id: 'guitar', name: 'Guitar', role: 'lead', measures: layout.map((b) => ({ beats: [{ start: 0, duration: b.length, notes: [] }] })) });
    warnings.push({ message: 'The score has no notes.', confidence: 0.2 });
  }
  return { song, warnings, confidence: warnings.some((w) => (w.confidence ?? 1) < 0.5) ? 0.6 : 0.9 };
}

/**
 * One note written on both the notation staff and the TAB staff: string and fret come from the tab
 * copy; lyrics, ornaments and articulations from whichever copy has them.
 */
function mergeTwins(a: RawNote, b: RawNote): RawNote {
  const [tab, other] = b.hasTab && !a.hasTab ? [b, a] : [a, b];
  const out: RawNote = { ...other, ...tab };
  for (const [key, value] of Object.entries(other) as Array<[keyof RawNote, unknown]>) {
    if (value !== undefined && (out[key] === undefined || out[key] === false)) (out as unknown as Record<string, unknown>)[key] = value;
  }
  out.hasTab = a.hasTab || b.hasTab;
  return out;
}

/** Hammer-ons, pull-offs and slides are marked on the note they start from; songs mark the note they reach. */
function connect(notes: RawNote[]): void {
  notes.forEach((n, i) => {
    if (!n.hammerStart && !n.pullStart && !n.slideStart) return;
    const next = notes.slice(i + 1).find((m) => m.tick > n.tick && (n.string === undefined || m.string === n.string));
    if (!next) return;
    if (n.slideStart) next.slide = next.midi >= n.midi ? 'up' : 'down';
    else next.legato = next.midi >= n.midi ? 'hammer' : 'pull';
  });
}

function dedupeTempo(points: TempoChange[]): TempoChange[] {
  const sorted = points.sort((a, b) => a.bar - b.bar || (a.tick ?? 0) - (b.tick ?? 0));
  const out: TempoChange[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.bar === p.bar && (last.tick ?? 0) === (p.tick ?? 0)) out[out.length - 1] = p;
    else if (!last || last.bpm !== p.bpm) out.push(p);
  }
  // No tempo before the first marking: the first marking holds from the start (a pickup before "Allegro" is in that tempo).
  if (!out.length || out[0].bar !== 0 || (out[0].tick ?? 0) !== 0) out.unshift({ bar: 0, bpm: out[0]?.bpm ?? 120 });
  return out.filter((p, i) => i === 0 || p.bpm !== out[i - 1].bpm);
}

/** Import a compressed MusicXML file (.mxl): a zip whose container names the score file. */
export async function importMxl(bytes: ArrayBuffer | Uint8Array, opts: MusicXmlOptions = {}): Promise<ImportResult> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  let path: string | undefined;
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const doc = parseXml(await container.async('string'));
    path = kids(kid(doc, 'rootfiles'), 'rootfile')[0]?.attrs['full-path'];
  }
  if (!path) path = Object.keys(zip.files).find((f) => /\.(musicxml|xml)$/i.test(f) && !f.startsWith('META-INF/'));
  const file = path ? zip.file(path) : null;
  if (!file) throw new RangeError('The .mxl file holds no MusicXML score.');
  return importMusicXml(await file.async('string'), opts);
}
